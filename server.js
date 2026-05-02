const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cheerio = require('cheerio');

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');
const databasePath = path.join(dataDir, 'vehicles.json');
const adminUsername = sanitizeValue(process.env.ADMIN_USERNAME || 'admin');
const adminPassword = String(process.env.ADMIN_PASSWORD || 'lm123456');
const sessionCookieName = 'lm_admin_session';
const adminSessions = new Map();

fs.mkdirSync(dataDir, { recursive: true });

function sanitizeValue(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseCookies(cookieHeader) {
    return String(cookieHeader || '')
        .split(';')
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .reduce((cookies, pair) => {
            const separatorIndex = pair.indexOf('=');
            if (separatorIndex <= 0) {
                return cookies;
            }

            const name = pair.slice(0, separatorIndex).trim();
            const value = pair.slice(separatorIndex + 1).trim();
            cookies[name] = decodeURIComponent(value);
            return cookies;
        }, {});
}

function createSessionToken() {
    return crypto.randomBytes(24).toString('hex');
}

function getSessionFromRequest(request) {
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[sessionCookieName];
    if (!token) {
        return null;
    }

    const session = adminSessions.get(token);
    if (!session) {
        return null;
    }

    if (session.expiresAt < Date.now()) {
        adminSessions.delete(token);
        return null;
    }

    return { token, ...session };
}

function setSessionCookie(response, token) {
    response.setHeader('Set-Cookie', `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`);
}

function clearSessionCookie(response) {
    response.setHeader('Set-Cookie', `${sessionCookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function requireAdminAuth(request, response, next) {
    const session = getSessionFromRequest(request);
    if (!session) {
        response.status(401).json({ error: 'Sessao expirada ou nao autenticada.' });
        return;
    }

    request.adminSession = session;
    next();
}

function parsePriceToNumber(priceText) {
    return Number(String(priceText || '').replace(/[^\d]/g, '')) || 0;
}

function parseKmToNumber(kmText) {
    return Number(String(kmText || '').replace(/[^\d]/g, '')) || 0;
}

function readDatabase() {
    if (!fs.existsSync(databasePath)) {
        return { lastId: 0, vehicles: [] };
    }

    try {
        const content = fs.readFileSync(databasePath, 'utf8');
        const parsed = JSON.parse(content);
        return {
            lastId: Number(parsed.lastId || 0),
            vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : []
        };
    } catch (error) {
        return { lastId: 0, vehicles: [] };
    }
}

function writeDatabase(data) {
    fs.writeFileSync(databasePath, JSON.stringify(data, null, 2), 'utf8');
}

function getAllVehicles() {
    return readDatabase().vehicles;
}

function getVehicleById(id) {
    return getAllVehicles().find((vehicle) => Number(vehicle.id) === Number(id)) || null;
}

function createVehicleRecord(payload) {
    const now = new Date().toISOString();
    return {
        id: Number(payload.id),
        brand: payload.brand || '',
        model: payload.model || '',
        year: Number(payload.year) || 0,
        km: Number(payload.km) || 0,
        fuel: payload.fuel || '',
        transmission: payload.transmission || '',
        color: payload.color || '',
        price: Number(payload.price) || 0,
        type: payload.type || 'Carro',
        engine: payload.engine || '',
        power: payload.power || '',
        doors: payload.doors || '',
        plate: payload.plate || '',
        ipva: payload.ipva || '',
        description: payload.description || '',
        badge: payload.badge || '',
        badge_color: payload.badge_color || 'bg-cyan-400 text-primary',
        legacy_folder: payload.legacy_folder || '',
        images: Array.isArray(payload.images) ? payload.images : [],
        features: Array.isArray(payload.features) ? payload.features : [],
        active: payload.active !== false,
        created_at: payload.created_at || now,
        updated_at: payload.updated_at || now
    };
}

function insertVehicle(payload) {
    const database = readDatabase();
    const nextId = database.lastId + 1;
    const vehicle = createVehicleRecord({ ...payload, id: nextId });
    database.lastId = nextId;
    database.vehicles.push(vehicle);
    writeDatabase(database);
    return vehicle;
}

function deleteVehicle(id) {
    const database = readDatabase();
    const initialLength = database.vehicles.length;
    database.vehicles = database.vehicles.filter((vehicle) => Number(vehicle.id) !== Number(id));
    if (database.vehicles.length === initialLength) {
        return false;
    }

    writeDatabase(database);
    return true;
}

function inferVehicleType(folder) {
    return sanitizeValue(folder).toLowerCase().includes('/motos/') ? 'Moto' : 'Carro';
}

function bootstrapDatabaseFromStaticInventory() {
    const stockPath = path.join(rootDir, 'estoque.html');
    if (!fs.existsSync(stockPath)) {
        return;
    }

    const html = fs.readFileSync(stockPath, 'utf8');
    const $ = cheerio.load(html);
    const cards = $('.car-card');
    if (!cards.length) {
        return;
    }

    const database = readDatabase();
    if (database.vehicles.length > 0) {
        return;
    }

    cards.each((_, element) => {
        const card = $(element);
        const titleText = sanitizeValue(card.find('h3').first().text());
        if (!titleText) {
            return;
        }

        const titleParts = titleText.split(' ').filter(Boolean);
        const brand = sanitizeValue(titleParts.shift());
        const model = sanitizeValue(titleParts.join(' '));
        const metaParts = sanitizeValue(card.find('p.text-slate-500').first().text())
            .split('•')
            .map((part) => sanitizeValue(part));
        const tags = card.find('.flex.gap-3.mb-4 span');
        const image = sanitizeValue(card.find('img').first().attr('src'));
        const dataImages = sanitizeValue(card.attr('data-images'));
        const images = (dataImages ? dataImages.split('|') : [image])
            .map((item) => sanitizeValue(item))
            .filter(Boolean);
        const features = sanitizeValue(card.attr('data-features'))
            .split('|')
            .map((item) => sanitizeValue(item))
            .filter(Boolean);
        const badgeElement = card.find('.absolute.top-4.left-4 span').first();
        const badge = sanitizeValue(badgeElement.text());
        const badgeColor = sanitizeValue(badgeElement.attr('class')) || 'bg-cyan-400 text-primary';

        database.lastId += 1;
        database.vehicles.push(createVehicleRecord({
            id: database.lastId,
            brand: brand || 'Marca',
            model: model || titleText,
            year: Number(metaParts[0]) || 0,
            km: parseKmToNumber(metaParts[1]),
            fuel: metaParts[2] || '',
            transmission: sanitizeValue(tags.eq(0).text()),
            color: sanitizeValue(tags.eq(1).text()),
            price: parsePriceToNumber(card.find('p.text-xl').first().text()),
            type: inferVehicleType(card.attr('data-folder')),
            engine: sanitizeValue(card.attr('data-engine')),
            power: sanitizeValue(card.attr('data-power')),
            doors: sanitizeValue(card.attr('data-doors')),
            plate: sanitizeValue(card.attr('data-plate')),
            ipva: sanitizeValue(card.attr('data-ipva')),
            description: '',
            badge,
            badge_color: badgeColor,
            legacy_folder: sanitizeValue(card.attr('data-folder')),
            images,
            features,
            active: true
        }));
    });

    writeDatabase(database);
}

bootstrapDatabaseFromStaticInventory();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
});

app.get('/api/admin/session', (request, response) => {
    const session = getSessionFromRequest(request);
    response.json({ authenticated: Boolean(session), username: session ? session.username : '' });
});

app.post('/api/admin/login', (request, response) => {
    const username = sanitizeValue(request.body?.username);
    const password = String(request.body?.password || '');

    if (username !== adminUsername || password !== adminPassword) {
        response.status(401).json({ error: 'Usuario ou senha invalidos.' });
        return;
    }

    const token = createSessionToken();
    adminSessions.set(token, {
        username,
        expiresAt: Date.now() + (12 * 60 * 60 * 1000)
    });
    setSessionCookie(response, token);
    response.json({ authenticated: true, username });
});

app.post('/api/admin/logout', (request, response) => {
    const session = getSessionFromRequest(request);
    if (session?.token) {
        adminSessions.delete(session.token);
    }

    clearSessionCookie(response);
    response.json({ authenticated: false });
});

app.get('/api/vehicles', (request, response) => {
    const includeInactive = request.query.includeInactive === '1';
    if (includeInactive && !getSessionFromRequest(request)) {
        response.status(401).json({ error: 'Sessao expirada ou nao autenticada.' });
        return;
    }

    const rows = getAllVehicles()
        .filter((vehicle) => includeInactive || vehicle.active)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || Number(b.id) - Number(a.id));

    response.json(rows);
});

app.get('/api/vehicles/:id', (request, response) => {
    const vehicleId = Number(request.params.id);
    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
        response.status(400).json({ error: 'Id invalido.' });
        return;
    }

    const row = getVehicleById(vehicleId);
    if (!row) {
        response.status(404).json({ error: 'Veiculo nao encontrado.' });
        return;
    }

    response.json(row);
});

app.post('/api/vehicles', (request, response) => {
    requireAdminAuth(request, response, () => {});
    if (response.headersSent) {
        return;
    }

    const payload = request.body || {};
    const brand = sanitizeValue(payload.brand);
    const model = sanitizeValue(payload.model);
    const year = Number(payload.year);
    const price = Number(payload.price);

    if (!brand || !model || !Number.isFinite(year) || !Number.isFinite(price)) {
        response.status(400).json({ error: 'Informe marca, modelo, ano e preco.' });
        return;
    }

    const images = Array.isArray(payload.images)
        ? payload.images
        : String(payload.images || '')
            .split(/\r?\n/)
            .map((item) => sanitizeValue(item))
            .filter(Boolean);
    const features = Array.isArray(payload.features)
        ? payload.features
        : String(payload.features || '')
            .split(/\r?\n/)
            .map((item) => sanitizeValue(item))
            .filter(Boolean);

    const row = insertVehicle({
        brand,
        model,
        year,
        km: Number(payload.km) || 0,
        fuel: sanitizeValue(payload.fuel),
        transmission: sanitizeValue(payload.transmission),
        color: sanitizeValue(payload.color),
        price,
        type: sanitizeValue(payload.type) || 'Carro',
        engine: sanitizeValue(payload.engine),
        power: sanitizeValue(payload.power),
        doors: sanitizeValue(payload.doors),
        plate: sanitizeValue(payload.plate),
        ipva: sanitizeValue(payload.ipva),
        description: sanitizeValue(payload.description),
        badge: sanitizeValue(payload.badge),
        badge_color: sanitizeValue(payload.badgeColor) || 'bg-cyan-400 text-primary',
        legacy_folder: '',
        images,
        features,
        active: payload.active === false || payload.active === '0' ? 0 : 1
    });

    response.status(201).json(row);
});

app.delete('/api/vehicles/:id', (request, response) => {
    requireAdminAuth(request, response, () => {});
    if (response.headersSent) {
        return;
    }

    const vehicleId = Number(request.params.id);
    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
        response.status(400).json({ error: 'Id invalido.' });
        return;
    }

    const deleted = deleteVehicle(vehicleId);
    if (!deleted) {
        response.status(404).json({ error: 'Veiculo nao encontrado.' });
        return;
    }

    response.status(204).send();
});

app.use(express.static(rootDir));

app.listen(port, () => {
    console.log(`L&M Automoveis rodando em http://localhost:${port}`);
    console.log(`Painel admin: usuario \"${adminUsername}\" e senha definida por ADMIN_PASSWORD (padrao: lm123456)`);
});