// Integração com a API de estoque (lm-api, hospedada no Railway).
// O estoque não fica mais escrito no HTML: todas as páginas leem daqui.

const LM_API_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : 'https://api.lmautomoveis.seg.br';

// Número fixo no código, nunca vindo da API: mesmo que alguém invada o painel, não consegue trocar o contato.
const LM_WHATSAPP = '554299226561';

const LM_CATEGORY_STYLES = {
    SEDAN: 'bg-blue-600 text-white',
    HATCH: 'bg-red-600 text-white',
    SUV: 'bg-amber-500 text-white',
    PICKUP: 'bg-orange-600 text-white',
    MINIVAN: 'bg-purple-600 text-white',
    MOTO: 'bg-slate-700 text-white'
};

function lmEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function lmFormatNumber(value) {
    return Number(value || 0).toLocaleString('pt-BR');
}

function lmFormatPrice(value) {
    return `R$ ${lmFormatNumber(value)}`;
}

function lmVehicleTitle(vehicle) {
    return `${vehicle.brand} ${vehicle.model}`.trim();
}

function lmVehicleMeta(vehicle, { withFuel = true } = {}) {
    return [
        vehicle.year,
        vehicle.km != null ? `${lmFormatNumber(vehicle.km)} km` : '',
        withFuel ? vehicle.fuel : ''
    ].filter(Boolean).join(' • ');
}

function lmVehicleUrl(vehicle) {
    return `detalhes.html?id=${encodeURIComponent(vehicle.id)}`;
}

function lmVehicleTypeLabel(vehicle) {
    return vehicle.type === 'MOTORCYCLE' ? 'Moto' : 'Carro';
}

// Selos do canto da foto: categoria e, se for o caso, "Reservado".
function lmBadgesHtml(vehicle) {
    const badges = [];
    if (vehicle.category) {
        const style = LM_CATEGORY_STYLES[vehicle.category] || 'bg-slate-700 text-white';
        badges.push(`<span class="px-3 py-1 ${style} text-xs font-bold rounded-full">${lmEscape(vehicle.category)}</span>`);
    }
    if (vehicle.status === 'RESERVED') {
        badges.push('<span class="px-3 py-1 bg-accent text-primary text-xs font-bold rounded-full">RESERVADO</span>');
    }
    return badges.join(' ');
}

const LM_PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 450'%3E%3Crect fill='%23e2e8f0' width='800' height='450'/%3E%3Ctext x='400' y='235' text-anchor='middle' font-family='sans-serif' font-size='28' fill='%2394a3b8'%3ESem foto%3C/text%3E%3C/svg%3E";

function lmCoverUrl(vehicle, size = 'thumb') {
    if (!vehicle.cover) return LM_PLACEHOLDER_IMAGE;
    return size === 'full' ? vehicle.cover.url : vehicle.cover.thumbUrl;
}

async function lmFetchJson(path) {
    const response = await fetch(`${LM_API_URL}${path}`);
    if (!response.ok) {
        const error = new Error(`Erro ${response.status} ao consultar o estoque.`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}

function lmFetchVehicles({ featured = false } = {}) {
    return lmFetchJson(`/api/vehicles${featured ? '?featured=1' : ''}`);
}

function lmFetchVehicle(id) {
    return lmFetchJson(`/api/vehicles/${encodeURIComponent(id)}`);
}
