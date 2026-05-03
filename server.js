const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const cheerio = require('cheerio');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');
const databasePath = path.join(dataDir, 'vehicles.json');
const adminUsername = sanitizeValue(process.env.ADMIN_USERNAME || 'admin');
const adminPassword = String(process.env.ADMIN_PASSWORD || 'lm123456');
const sessionCookieName = 'lm_admin_session';
const adminSessions = new Map();
const usePostgres = Boolean(String(process.env.DATABASE_URL || '').trim());

let pgPool = null;

fs.mkdirSync(dataDir, { recursive: true });

const uploadsDir = path.join(rootDir, 'imagens', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadsDir),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
        }
    }),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        cb(null, allowed.includes(file.mimetype));
    }
});

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
    const cookieParts = [
        `${sessionCookieName}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        'Max-Age=43200'
    ];

    if (process.env.NODE_ENV === 'production') {
        cookieParts.push('Secure');
    }

    response.setHeader('Set-Cookie', cookieParts.join('; '));
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
    } catch (_error) {
        return { lastId: 0, vehicles: [] };
    }
}

function writeDatabase(data) {
    fs.writeFileSync(databasePath, JSON.stringify(data, null, 2), 'utf8');
}

function inferVehicleType(folder) {
    return sanitizeValue(folder).toLowerCase().includes('/motos/') ? 'Moto' : 'Carro';
}

function collectVehiclesFromStaticInventory() {
    const stockPath = path.join(rootDir, 'estoque.html');
    if (!fs.existsSync(stockPath)) {
        return [];
    }

    const html = fs.readFileSync(stockPath, 'utf8');
    const $ = cheerio.load(html);
    const cards = $('.car-card');
    if (!cards.length) {
        return [];
    }

    const vehicles = [];

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

        vehicles.push(createVehicleRecord({
            id: vehicles.length + 1,
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

    return vehicles;
}

function seedJsonIfEmpty() {
    const database = readDatabase();
    if (database.vehicles.length > 0) {
        return;
    }

    const vehicles = collectVehiclesFromStaticInventory();
    if (!vehicles.length) {
        return;
    }

    writeDatabase({
        lastId: vehicles.length,
        vehicles
    });
}

function useSslForPostgres() {
    const sslEnv = String(process.env.PGSSL || process.env.POSTGRES_SSL || '').toLowerCase();
    if (!sslEnv) {
        return { rejectUnauthorized: false };
    }

    if (sslEnv === '0' || sslEnv === 'false' || sslEnv === 'off' || sslEnv === 'disable') {
        return false;
    }

    return { rejectUnauthorized: false };
}

function normalizePgVehicle(row) {
    if (!row) {
        return null;
    }

    return createVehicleRecord({
        ...row,
        id: Number(row.id),
        year: Number(row.year || 0),
        km: Number(row.km || 0),
        price: Number(row.price || 0),
        active: row.active === true,
        images: Array.isArray(row.images) ? row.images : [],
        features: Array.isArray(row.features) ? row.features : []
    });
}

async function initPostgres() {
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: useSslForPostgres()
    });

    await pgPool.query(`
        CREATE TABLE IF NOT EXISTS vehicles (
            id BIGSERIAL PRIMARY KEY,
            brand TEXT NOT NULL,
            model TEXT NOT NULL,
            year INTEGER NOT NULL DEFAULT 0,
            km INTEGER NOT NULL DEFAULT 0,
            fuel TEXT NOT NULL DEFAULT '',
            transmission TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '',
            price NUMERIC(12, 2) NOT NULL DEFAULT 0,
            type TEXT NOT NULL DEFAULT 'Carro',
            engine TEXT NOT NULL DEFAULT '',
            power TEXT NOT NULL DEFAULT '',
            doors TEXT NOT NULL DEFAULT '',
            plate TEXT NOT NULL DEFAULT '',
            ipva TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            badge TEXT NOT NULL DEFAULT '',
            badge_color TEXT NOT NULL DEFAULT 'bg-cyan-400 text-primary',
            legacy_folder TEXT NOT NULL DEFAULT '',
            images JSONB NOT NULL DEFAULT '[]'::jsonb,
            features JSONB NOT NULL DEFAULT '[]'::jsonb,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    const countResult = await pgPool.query('SELECT COUNT(*)::int AS total FROM vehicles');
    const totalVehicles = Number(countResult.rows[0]?.total || 0);
    if (totalVehicles > 0) {
        return;
    }

    const fileDb = readDatabase();
    const seedVehicles = fileDb.vehicles.length > 0
        ? fileDb.vehicles.map((v) => createVehicleRecord(v))
        : collectVehiclesFromStaticInventory();

    for (const vehicle of seedVehicles) {
        await pgPool.query(
            `
            INSERT INTO vehicles (
                brand, model, year, km, fuel, transmission, color, price, type,
                engine, power, doors, plate, ipva, description, badge, badge_color,
                legacy_folder, images, features, active, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $17,
                $18, $19::jsonb, $20::jsonb, $21, $22, $23
            )
            `,
            [
                vehicle.brand,
                vehicle.model,
                Number(vehicle.year) || 0,
                Number(vehicle.km) || 0,
                vehicle.fuel,
                vehicle.transmission,
                vehicle.color,
                Number(vehicle.price) || 0,
                vehicle.type,
                vehicle.engine,
                vehicle.power,
                vehicle.doors,
                vehicle.plate,
                vehicle.ipva,
                vehicle.description,
                vehicle.badge,
                vehicle.badge_color,
                vehicle.legacy_folder,
                JSON.stringify(Array.isArray(vehicle.images) ? vehicle.images : []),
                JSON.stringify(Array.isArray(vehicle.features) ? vehicle.features : []),
                vehicle.active !== false,
                vehicle.created_at || new Date().toISOString(),
                vehicle.updated_at || new Date().toISOString()
            ]
        );
    }
}

async function getAllVehicles(includeInactive = false) {
    if (usePostgres) {
        const query = includeInactive
            ? `SELECT * FROM vehicles ORDER BY created_at DESC, id DESC`
            : `SELECT * FROM vehicles WHERE active = TRUE ORDER BY created_at DESC, id DESC`;
        const result = await pgPool.query(query);
        return result.rows.map(normalizePgVehicle);
    }

    return readDatabase().vehicles
        .filter((vehicle) => includeInactive || vehicle.active)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || Number(b.id) - Number(a.id));
}

async function getVehicleById(id) {
    if (usePostgres) {
        const result = await pgPool.query('SELECT * FROM vehicles WHERE id = $1 LIMIT 1', [id]);
        return normalizePgVehicle(result.rows[0] || null);
    }

    return readDatabase().vehicles.find((vehicle) => Number(vehicle.id) === Number(id)) || null;
}

async function insertVehicle(payload) {
    const now = new Date().toISOString();
    const row = createVehicleRecord({ ...payload, id: 0, created_at: now, updated_at: now });

    if (usePostgres) {
        const result = await pgPool.query(
            `
            INSERT INTO vehicles (
                brand, model, year, km, fuel, transmission, color, price, type,
                engine, power, doors, plate, ipva, description, badge, badge_color,
                legacy_folder, images, features, active, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $17,
                $18, $19::jsonb, $20::jsonb, $21, $22, $23
            )
            RETURNING *
            `,
            [
                row.brand,
                row.model,
                row.year,
                row.km,
                row.fuel,
                row.transmission,
                row.color,
                row.price,
                row.type,
                row.engine,
                row.power,
                row.doors,
                row.plate,
                row.ipva,
                row.description,
                row.badge,
                row.badge_color,
                row.legacy_folder,
                JSON.stringify(row.images),
                JSON.stringify(row.features),
                row.active,
                row.created_at,
                row.updated_at
            ]
        );
        return normalizePgVehicle(result.rows[0]);
    }

    const database = readDatabase();
    const nextId = database.lastId + 1;
    const vehicle = createVehicleRecord({ ...row, id: nextId });
    database.lastId = nextId;
    database.vehicles.push(vehicle);
    writeDatabase(database);
    return vehicle;
}

async function updateVehicle(id, payload) {
    if (usePostgres) {
        const existing = await getVehicleById(id);
        if (!existing) {
            return null;
        }

        const now = new Date().toISOString();
        const updated = {
            ...existing,
            brand: sanitizeValue(payload.brand) || existing.brand,
            model: sanitizeValue(payload.model) || existing.model,
            year: Number(payload.year) || existing.year,
            km: Number(payload.km) || 0,
            fuel: sanitizeValue(payload.fuel),
            transmission: sanitizeValue(payload.transmission),
            color: sanitizeValue(payload.color),
            price: Number(payload.price) || existing.price,
            type: sanitizeValue(payload.type) || existing.type,
            engine: sanitizeValue(payload.engine),
            power: sanitizeValue(payload.power),
            doors: sanitizeValue(payload.doors),
            plate: sanitizeValue(payload.plate),
            ipva: sanitizeValue(payload.ipva),
            description: sanitizeValue(payload.description),
            badge: sanitizeValue(payload.badge),
            badge_color: sanitizeValue(payload.badge_color || payload.badgeColor) || existing.badge_color,
            images: Array.isArray(payload.images) ? payload.images : existing.images,
            features: Array.isArray(payload.features) ? payload.features : existing.features,
            active: payload.active === false || payload.active === '0' ? false : true,
            updated_at: now
        };

        const result = await pgPool.query(
            `
            UPDATE vehicles
               SET brand = $2,
                   model = $3,
                   year = $4,
                   km = $5,
                   fuel = $6,
                   transmission = $7,
                   color = $8,
                   price = $9,
                   type = $10,
                   engine = $11,
                   power = $12,
                   doors = $13,
                   plate = $14,
                   ipva = $15,
                   description = $16,
                   badge = $17,
                   badge_color = $18,
                   images = $19::jsonb,
                   features = $20::jsonb,
                   active = $21,
                   updated_at = $22
             WHERE id = $1
             RETURNING *
            `,
            [
                Number(id),
                updated.brand,
                updated.model,
                updated.year,
                updated.km,
                updated.fuel,
                updated.transmission,
                updated.color,
                updated.price,
                updated.type,
                updated.engine,
                updated.power,
                updated.doors,
                updated.plate,
                updated.ipva,
                updated.description,
                updated.badge,
                updated.badge_color,
                JSON.stringify(updated.images),
                JSON.stringify(updated.features),
                updated.active,
                updated.updated_at
            ]
        );

        return normalizePgVehicle(result.rows[0] || null);
    }

    const database = readDatabase();
    const index = database.vehicles.findIndex((v) => Number(v.id) === Number(id));
    if (index === -1) {
        return null;
    }

    const now = new Date().toISOString();
    const existing = database.vehicles[index];
    database.vehicles[index] = {
        ...existing,
        brand: sanitizeValue(payload.brand) || existing.brand,
        model: sanitizeValue(payload.model) || existing.model,
        year: Number(payload.year) || existing.year,
        km: Number(payload.km) || 0,
        fuel: sanitizeValue(payload.fuel),
        transmission: sanitizeValue(payload.transmission),
        color: sanitizeValue(payload.color),
        price: Number(payload.price) || existing.price,
        type: sanitizeValue(payload.type) || existing.type,
        engine: sanitizeValue(payload.engine),
        power: sanitizeValue(payload.power),
        doors: sanitizeValue(payload.doors),
        plate: sanitizeValue(payload.plate),
        ipva: sanitizeValue(payload.ipva),
        description: sanitizeValue(payload.description),
        badge: sanitizeValue(payload.badge),
        badge_color: sanitizeValue(payload.badge_color || payload.badgeColor) || existing.badge_color,
        images: Array.isArray(payload.images) ? payload.images : existing.images,
        features: Array.isArray(payload.features) ? payload.features : existing.features,
        active: payload.active === false || payload.active === '0' ? false : true,
        updated_at: now
    };

    writeDatabase(database);
    return database.vehicles[index];
}

async function deleteVehicle(id) {
    if (usePostgres) {
        const result = await pgPool.query('DELETE FROM vehicles WHERE id = $1', [id]);
        return result.rowCount > 0;
    }

    const database = readDatabase();
    const initialLength = database.vehicles.length;
    database.vehicles = database.vehicles.filter((vehicle) => Number(vehicle.id) !== Number(id));
    if (database.vehicles.length === initialLength) {
        return false;
    }

    writeDatabase(database);
    return true;
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_request, response) => {
    response.json({ ok: true, database: usePostgres ? 'postgres' : 'json' });
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

app.get('/api/vehicles', async (request, response) => {
    try {
        const includeInactive = request.query.includeInactive === '1';
        if (includeInactive && !getSessionFromRequest(request)) {
            response.status(401).json({ error: 'Sessao expirada ou nao autenticada.' });
            return;
        }

        const rows = await getAllVehicles(includeInactive);
        response.json(rows);
    } catch (error) {
        response.status(500).json({ error: 'Falha ao carregar veiculos.' });
    }
});

app.get('/api/vehicles/:id', async (request, response) => {
    try {
        const vehicleId = Number(request.params.id);
        if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
            response.status(400).json({ error: 'Id invalido.' });
            return;
        }

        const row = await getVehicleById(vehicleId);
        if (!row) {
            response.status(404).json({ error: 'Veiculo nao encontrado.' });
            return;
        }

        response.json(row);
    } catch (error) {
        response.status(500).json({ error: 'Falha ao carregar veiculo.' });
    }
});

app.post('/api/vehicles', async (request, response) => {
    requireAdminAuth(request, response, () => {});
    if (response.headersSent) {
        return;
    }

    try {
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

        const row = await insertVehicle({
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
    } catch (error) {
        response.status(500).json({ error: 'Falha ao salvar veiculo.' });
    }
});

app.delete('/api/vehicles/:id', async (request, response) => {
    requireAdminAuth(request, response, () => {});
    if (response.headersSent) {
        return;
    }

    try {
        const vehicleId = Number(request.params.id);
        if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
            response.status(400).json({ error: 'Id invalido.' });
            return;
        }

        const deleted = await deleteVehicle(vehicleId);
        if (!deleted) {
            response.status(404).json({ error: 'Veiculo nao encontrado.' });
            return;
        }

        response.status(204).send();
    } catch (error) {
        response.status(500).json({ error: 'Falha ao excluir veiculo.' });
    }
});

app.put('/api/vehicles/:id', async (request, response) => {
    requireAdminAuth(request, response, () => {});
    if (response.headersSent) {
        return;
    }

    try {
        const vehicleId = Number(request.params.id);
        if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
            response.status(400).json({ error: 'Id invalido.' });
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
            : String(payload.images || '').split(/\r?\n/).map((i) => sanitizeValue(i)).filter(Boolean);
        const features = Array.isArray(payload.features)
            ? payload.features
            : String(payload.features || '').split(/\r?\n/).map((i) => sanitizeValue(i)).filter(Boolean);

        const updated = await updateVehicle(vehicleId, { ...payload, images, features });
        if (!updated) {
            response.status(404).json({ error: 'Veiculo nao encontrado.' });
            return;
        }

        response.json(updated);
    } catch (error) {
        response.status(500).json({ error: 'Falha ao atualizar veiculo.' });
    }
});

app.post('/api/upload-image', (request, response) => {
    requireAdminAuth(request, response, () => {});
    if (response.headersSent) {
        return;
    }

    upload.single('image')(request, response, (err) => {
        if (err) {
            response.status(400).json({ error: err.message || 'Falha no upload.' });
            return;
        }
        if (!request.file) {
            response.status(400).json({ error: 'Nenhuma imagem enviada.' });
            return;
        }
        response.json({ url: `/imagens/uploads/${request.file.filename}` });
    });
});

app.use(express.static(rootDir));

async function startServer() {
    if (usePostgres) {
        await initPostgres();
        console.log('Banco em uso: PostgreSQL');
    } else {
        seedJsonIfEmpty();
        console.log('Banco em uso: JSON local');
    }

    app.listen(port, () => {
        console.log(`L&M Automoveis rodando em http://localhost:${port}`);
        console.log(`Painel admin: usuario "${adminUsername}" e senha definida por ADMIN_PASSWORD (padrao: lm123456)`);
    });
}

startServer().catch((error) => {
    console.error('Falha ao iniciar servidor:', error.message);
    process.exit(1);
});
