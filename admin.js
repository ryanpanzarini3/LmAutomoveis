// --- DOM refs ---
const loginPanel = document.getElementById('login-panel');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const form = document.getElementById('vehicle-form');
const formStatus = document.getElementById('form-status');
const formTitle = document.getElementById('form-title');
const submitButton = document.getElementById('submit-button');
const cancelEditButton = document.getElementById('cancel-edit-button');
const vehicleList = document.getElementById('vehicle-list');
const refreshButton = document.getElementById('refresh-button');
const logoutButton = document.getElementById('logout-button');
const sessionBadge = document.getElementById('session-badge');
const brandSelect = document.getElementById('brand-select');
const brandCustomInput = document.getElementById('brand-custom');
const imageInput = document.getElementById('image-input');
const imagePreviews = document.getElementById('image-previews');

// --- State ---
let editingId = null;
let imageItems = []; // { localUrl?, serverUrl?, status: 'uploading'|'done'|'error' }

// --- Auth helpers ---

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

function setFormStatus(message, tone = 'default') {
    formStatus.textContent = message;
    formStatus.className = tone === 'error'
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

// --- Brand select ---

brandSelect.addEventListener('change', () => {
    const isOther = brandSelect.value === '__other__';
    brandCustomInput.classList.toggle('hidden', !isOther);
    if (!isOther) brandCustomInput.value = '';
});

function getBrandValue() {
    if (brandSelect.value === '__other__') return brandCustomInput.value.trim();
    return brandSelect.value;
}

function setBrandValue(brand) {
    const normalized = String(brand || '').trim();
    const option = Array.from(brandSelect.options).find(
        (o) => o.value.toLowerCase() === normalized.toLowerCase()
    );
    if (option && option.value !== '__other__') {
        brandSelect.value = option.value;
        brandCustomInput.classList.add('hidden');
        brandCustomInput.value = '';
    } else {
        brandSelect.value = '__other__';
        brandCustomInput.classList.remove('hidden');
        brandCustomInput.value = normalized;
    }
}

// --- Image upload & preview ---

function renderImagePreviews() {
    imagePreviews.innerHTML = '';
    if (imageItems.length === 0) {
        imagePreviews.innerHTML = '<p class="col-span-3 text-xs text-slate-400">Nenhuma foto adicionada.</p>';
        return;
    }
    imageItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100';
        div.style.aspectRatio = '16/9';

        const img = document.createElement('img');
        img.src = item.localUrl || item.serverUrl || '';
        img.className = 'w-full h-full object-cover';
        div.appendChild(img);

        if (item.status === 'uploading') {
            const overlay = document.createElement('div');
            overlay.className = 'absolute inset-0 bg-black/50 flex items-center justify-center';
            overlay.innerHTML = '<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>';
            div.appendChild(overlay);
        } else if (item.status === 'error') {
            const overlay = document.createElement('div');
            overlay.className = 'absolute inset-0 bg-rose-500/80 flex flex-col items-center justify-center gap-1';
            overlay.innerHTML = '<span class="text-white text-xs font-bold">Erro no upload</span><button type="button" class="text-white underline text-xs retry-btn">Tentar de novo</button>';
            overlay.querySelector('.retry-btn').addEventListener('click', () => retryUpload(index));
            div.appendChild(overlay);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'absolute top-1 right-1 w-6 h-6 bg-rose-600 hover:bg-rose-700 rounded-full text-white text-base font-bold flex items-center justify-center leading-none shadow';
        removeBtn.title = 'Remover foto';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', () => {
            imageItems.splice(index, 1);
            renderImagePreviews();
        });
        div.appendChild(removeBtn);

        imagePreviews.appendChild(div);
    });
}

async function uploadImageFile(file) {
    const fd = new FormData();
    fd.append('image', file);
    const response = await fetch('/api/upload-image', { method: 'POST', body: fd });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Falha no upload.');
    }
    const data = await response.json();
    return data.url;
}

function retryUpload(index) {
    const item = imageItems[index];
    if (!item || !item.file) return;
    item.status = 'uploading';
    renderImagePreviews();
    uploadImageFile(item.file).then((serverUrl) => {
        item.serverUrl = serverUrl;
        item.status = 'done';
        renderImagePreviews();
    }).catch(() => {
        item.status = 'error';
        renderImagePreviews();
    });
}

imageInput.addEventListener('change', (event) => {
    Array.from(event.target.files).forEach((file) => {
        const localUrl = URL.createObjectURL(file);
        const item = { file, localUrl, serverUrl: null, status: 'uploading' };
        imageItems.push(item);
        renderImagePreviews();
        uploadImageFile(file).then((serverUrl) => {
            item.serverUrl = serverUrl;
            item.status = 'done';
            renderImagePreviews();
        }).catch(() => {
            item.status = 'error';
            renderImagePreviews();
        });
    });
    event.target.value = '';
});

// --- Edit mode ---

function cancelEdit() {
    editingId = null;
    form.reset();
    brandSelect.value = '';
    brandCustomInput.classList.add('hidden');
    brandCustomInput.value = '';
    imageItems = [];
    renderImagePreviews();
    formTitle.textContent = 'Novo veículo';
    submitButton.textContent = 'Salvar veículo';
    cancelEditButton.classList.add('hidden');
    setFormStatus('');
}

function editVehicle(vehicle) {
    editingId = vehicle.id;
    formTitle.textContent = 'Editando veículo';
    submitButton.textContent = 'Atualizar veículo';
    cancelEditButton.classList.remove('hidden');

    setBrandValue(vehicle.brand);
    form.elements['model'].value = vehicle.model || '';
    form.elements['year'].value = vehicle.year || '';
    form.elements['price'].value = vehicle.price || '';
    form.elements['km'].value = vehicle.km || '';
    form.elements['type'].value = vehicle.type || 'Carro';
    form.elements['fuel'].value = vehicle.fuel || '';
    form.elements['transmission'].value = vehicle.transmission || '';
    form.elements['color'].value = vehicle.color || '';
    form.elements['engine'].value = vehicle.engine || '';
    form.elements['power'].value = vehicle.power || '';
    form.elements['doors'].value = vehicle.doors || '';
    form.elements['plate'].value = vehicle.plate || '';
    form.elements['ipva'].value = vehicle.ipva || '';
    form.elements['badge'].value = vehicle.badge || '';
    form.elements['description'].value = vehicle.description || '';
    form.elements['features'].value = Array.isArray(vehicle.features)
        ? vehicle.features.join('\n')
        : (vehicle.features || '');

    imageItems = (vehicle.images || []).map((url) => ({
        localUrl: url,
        serverUrl: url,
        status: 'done'
    }));
    renderImagePreviews();

    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFormStatus('');
}

// --- Vehicle list ---

async function loadVehicles() {
    vehicleList.innerHTML = '<div class="text-slate-500 col-span-3">Carregando...</div>';

    const { response, data: vehicles } = await fetchJson('/api/vehicles?includeInactive=1');
    if (response.status === 401) {
        setAdminVisibility(false);
        setLoginStatus('Sua sessão expirou. Entre novamente.', 'error');
        vehicleList.innerHTML = '';
        return;
    }
    if (!response.ok) {
        vehicleList.innerHTML = '<div class="text-rose-600 col-span-3">Não foi possível carregar os veículos.</div>';
        return;
    }

    if (!vehicles.length) {
        vehicleList.innerHTML = '<div class="text-slate-400 col-span-3">Nenhum veículo cadastrado ainda.</div>';
        return;
    }

    vehicleList.innerHTML = vehicles.map((vehicle) => {
        const image = vehicle.images[0] || 'https://placehold.co/800x450/e2e8f0/475569?text=Sem+foto';
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
                        <button data-action="edit" data-id="${vehicle.id}" class="flex-1 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-semibold transition-colors">Editar</button>
                        <button data-action="delete" data-id="${vehicle.id}" class="px-4 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold transition-colors">Excluir</button>
                    </div>
                </div>
            </article>
        `;
    }).join('');

    vehicleList.querySelectorAll('[data-action="edit"]').forEach((button) => {
        button.addEventListener('click', async () => {
            button.textContent = '...';
            button.disabled = true;
            const { response, data } = await fetchJson(`/api/vehicles/${button.dataset.id}`);
            button.textContent = 'Editar';
            button.disabled = false;
            if (!response.ok) {
                setFormStatus('Não foi possível carregar os dados do veículo.', 'error');
                return;
            }
            editVehicle(data);
        });
    });

    vehicleList.querySelectorAll('[data-action="delete"]').forEach((button) => {
        button.addEventListener('click', async () => {
            if (!window.confirm(`Excluir este veículo? Esta ação não pode ser desfeita.`)) return;
            button.textContent = '...';
            button.disabled = true;
            const response = await fetch(`/api/vehicles/${button.dataset.id}`, { method: 'DELETE' });
            if (!response.ok) {
                button.textContent = 'Excluir';
                button.disabled = false;
                if (response.status === 401) {
                    setAdminVisibility(false);
                    setLoginStatus('Sua sessão expirou. Entre novamente.', 'error');
                    return;
                }
                setFormStatus('Não foi possível excluir o veículo.', 'error');
                return;
            }
            loadVehicles();
        });
    });
}

// --- Form submit ---

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const brand = getBrandValue();
    if (!brand) {
        setFormStatus('Selecione ou informe a marca.', 'error');
        return;
    }

    if (imageItems.some((i) => i.status === 'uploading')) {
        setFormStatus('Aguarde o upload das fotos terminar.', 'error');
        return;
    }

    const validImages = imageItems
        .filter((i) => i.status === 'done' && i.serverUrl)
        .map((i) => i.serverUrl);

    setFormStatus('Salvando...');
    submitButton.disabled = true;

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.brand = brand;
    payload.images = validImages;
    payload.features = String(payload.features || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

    const url = editingId ? `/api/vehicles/${editingId}` : '/api/vehicles';
    const method = editingId ? 'PUT' : 'POST';

    const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    submitButton.disabled = false;

    if (!response.ok) {
        if (response.status === 401) {
            setAdminVisibility(false);
            setLoginStatus('Sua sessão expirou. Entre novamente.', 'error');
            return;
        }
        const error = await response.json().catch(() => ({ error: 'Falha ao salvar.' }));
        setFormStatus(error.error || 'Falha ao salvar.', 'error');
        return;
    }

    const wasEditing = !!editingId;
    cancelEdit();
    setFormStatus(wasEditing ? 'Veículo atualizado com sucesso!' : 'Veículo salvo com sucesso!', 'success');
    loadVehicles();
});

cancelEditButton.addEventListener('click', cancelEdit);

// --- Login / Logout ---

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
        setLoginStatus(data.error || 'Usuário ou senha incorretos.', 'error');
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

// --- Init ---
renderImagePreviews();
ensureAuthenticated().then((authenticated) => {
    if (authenticated) loadVehicles();
});

