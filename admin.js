const loginPanel = document.getElementById('login-panel');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const form = document.getElementById('vehicle-form');
const formStatus = document.getElementById('form-status');
const vehicleList = document.getElementById('vehicle-list');
const refreshButton = document.getElementById('refresh-button');
const logoutButton = document.getElementById('logout-button');
const sessionBadge = document.getElementById('session-badge');

function setAdminVisibility(isAuthenticated, username = '') {
    loginPanel.classList.toggle('hidden', isAuthenticated);
    adminPanel.classList.toggle('hidden', !isAuthenticated);
    logoutButton.classList.toggle('hidden', !isAuthenticated);
    sessionBadge.classList.toggle('hidden', !isAuthenticated);
    sessionBadge.textContent = isAuthenticated ? `Logado como ${username}` : '';
}

function setLoginStatus(message, tone = 'default') {
    loginStatus.textContent = message;
    loginStatus.className = tone === 'error'
        ? 'text-sm text-rose-600'
        : tone === 'success'
            ? 'text-sm text-emerald-600'
            : 'text-sm text-slate-500';
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    return { response, data };
}

async function ensureAuthenticated() {
    const { response, data } = await fetchJson('/api/admin/session');
    if (!response.ok || !data.authenticated) {
        setAdminVisibility(false);
        return false;
    }

    setAdminVisibility(true, data.username || 'admin');
    return true;
}

function formatCurrency(value) {
    return `R$ ${Number(value || 0).toLocaleString('pt-BR')}`;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function loadVehicles() {
    vehicleList.innerHTML = '<div class="text-slate-500">Carregando...</div>';

    const { response, data: vehicles } = await fetchJson('/api/vehicles?includeInactive=1');
    if (response.status === 401) {
        setAdminVisibility(false);
        setLoginStatus('Sua sessão expirou. Entre novamente.', 'error');
        vehicleList.innerHTML = '';
        return;
    }

    if (!response.ok) {
        vehicleList.innerHTML = '<div class="text-rose-600">Não foi possível carregar os veículos.</div>';
        return;
    }

    vehicleList.innerHTML = vehicles.map((vehicle) => {
        const image = vehicle.images[0] || 'https://placehold.co/800x450/e2e8f0/475569?text=Sem+imagem';
        return `
            <article class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <img src="${escapeHtml(image)}" alt="${escapeHtml(vehicle.brand)} ${escapeHtml(vehicle.model)}" class="w-full h-44 object-cover">
                <div class="p-4 space-y-3">
                    <div>
                        <h3 class="font-display text-lg font-bold text-slate-900">${escapeHtml(vehicle.brand)} ${escapeHtml(vehicle.model)}</h3>
                        <p class="text-sm text-slate-500">${vehicle.year} • ${Number(vehicle.km || 0).toLocaleString('pt-BR')} km • ${escapeHtml(vehicle.fuel)}</p>
                    </div>
                    <p class="text-xl font-bold text-slate-900">${formatCurrency(vehicle.price)}</p>
                    <div class="flex gap-2">
                        <a href="detalhes.html?id=${vehicle.id}" class="flex-1 text-center px-4 py-2 rounded-xl bg-slate-950 text-white font-semibold">Detalhes</a>
                        <button data-id="${vehicle.id}" class="delete-button px-4 py-2 rounded-xl border border-rose-200 text-rose-600 font-semibold">Excluir</button>
                    </div>
                </div>
            </article>
        `;
    }).join('');

    vehicleList.querySelectorAll('.delete-button').forEach((button) => {
        button.addEventListener('click', async () => {
            const confirmed = window.confirm('Excluir este veículo?');
            if (!confirmed) {
                return;
            }

            const response = await fetch(`/api/vehicles/${button.dataset.id}`, { method: 'DELETE' });
            if (!response.ok) {
                if (response.status === 401) {
                    setAdminVisibility(false);
                    setLoginStatus('Sua sessão expirou. Entre novamente.', 'error');
                }
                formStatus.textContent = 'Não foi possível excluir o veículo.';
                formStatus.className = 'text-sm text-rose-600';
                return;
            }

            loadVehicles();
        });
    });
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formStatus.textContent = 'Salvando...';
    formStatus.className = 'text-sm text-slate-500';

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    const response = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        if (response.status === 401) {
            setAdminVisibility(false);
            setLoginStatus('Sua sessão expirou. Entre novamente.', 'error');
        }
        const error = await response.json().catch(() => ({ error: 'Falha ao salvar.' }));
        formStatus.textContent = error.error || 'Falha ao salvar.';
        formStatus.className = 'text-sm text-rose-600';
        return;
    }

    form.reset();
    formStatus.textContent = 'Veículo salvo com sucesso.';
    formStatus.className = 'text-sm text-emerald-600';
    loadVehicles();
});

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setLoginStatus('Entrando...');

    const formData = new FormData(loginForm);
    const payload = Object.fromEntries(formData.entries());
    const { response, data } = await fetchJson('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        setLoginStatus(data.error || 'Falha no login.', 'error');
        return;
    }

    setLoginStatus('Login realizado.', 'success');
    setAdminVisibility(true, data.username || 'admin');
    loginForm.reset();
    loadVehicles();
});

logoutButton.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAdminVisibility(false);
    setLoginStatus('Sessão encerrada.');
});

refreshButton.addEventListener('click', loadVehicles);

ensureAuthenticated().then((authenticated) => {
    if (authenticated) {
        loadVehicles();
    }
});