// ============================================================================
// UNSC TAC-BALANCER V2 — VERCEL SERVERLESS FUNCTION (api/hall-of-fame.js)
// Salón de la Fama Comunitario (Wompi + Llave @3105643224):
//   - Guarda registros en hallOfFameData/mainBoard (separado de rosterData/mainRoster)
//   - Registra intención con Gamertag/Nombre como 'pending'
//   - El Administrador Principal aprueba en 1 clic o agrega manualmente
//   - Nunca expone montos ni datos sensibles
// ============================================================================

import crypto from 'node:crypto';

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/halomatch-d9240/databases/(default)/documents/artifacts/halomatch-d9240/public/data';
const HOF_DOC_URL = `${FIRESTORE_BASE}/hallOfFameData/mainBoard`;
const MAX_ENTRIES = 250;
const DEDUP_WINDOW_MS = 10 * 60 * 1000;

function toFirestoreValue(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
        if (Number.isInteger(val)) return { integerValue: String(val) };
        return { doubleValue: val };
    }
    if (typeof val === 'string') return { stringValue: val };
    if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
    if (typeof val === 'object') {
        const fields = {};
        for (const [k, v] of Object.entries(val)) {
            if (v !== undefined) fields[k] = toFirestoreValue(v);
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
}

function fromFirestoreValue(v) {
    if (!v || typeof v !== 'object') return null;
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('stringValue' in v) return v.stringValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
    if ('mapValue' in v) {
        const out = {};
        for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
            out[k] = fromFirestoreValue(val);
        }
        return out;
    }
    return null;
}

function getColombiaDateLabel(ms = Date.now()) {
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    }).format(new Date(ms));
}

function normalizeGamertag(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 36);
}

function normalizeMessage(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function normalizeChannel(raw) {
    return String(raw || '').toLowerCase() === 'llave' ? 'llave' : 'wompi';
}

async function readHofBoard() {
    try {
        const res = await fetch(`${HOF_DOC_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (res.status === 404) {
            return { exists: false, entries: [] };
        }
        if (!res.ok) {
            throw new Error(`Firestore read failed (${res.status})`);
        }
        const json = await res.json();
        const parsed = json && json.fields ? fromFirestoreValue({ mapValue: { fields: json.fields } }) : null;
        const entries = parsed && Array.isArray(parsed.entries) ? parsed.entries : [];
        return { exists: true, entries };
    } catch (err) {
        throw err;
    }
}

async function writeHofBoard(entries) {
    const trimmed = entries.slice(0, MAX_ENTRIES);
    const docPayload = {
        entries: trimmed,
        updatedAt: Date.now()
    };
    const res = await fetch(HOF_DOC_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFirestoreValue(docPayload).mapValue.fields })
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Firestore write failed (${res.status}): ${errText}`);
    }
    return trimmed;
}

function formatResponse(entries, includePending) {
    const approved = entries
        .filter((e) => e && e.status === 'approved')
        .sort((a, b) => Number(b.approvedAt || b.createdAt || 0) - Number(a.approvedAt || a.createdAt || 0));

    const pending = includePending
        ? entries
            .filter((e) => e && e.status === 'pending')
            .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        : [];

    return {
        ok: true,
        approved,
        pending,
        totalApproved: approved.length
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (req.method === 'GET') {
            const includePending = req.query?.includePending === '1';
            const board = await readHofBoard();
            return res.status(200).json(formatResponse(board.entries, includePending));
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ ok: false, error: 'Método no permitido' });
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const action = String(body.action || '').trim();
        const now = Date.now();
        const board = await readHofBoard();
        let entries = Array.isArray(board.entries) ? [...board.entries] : [];

        if (action === 'register') {
            const gamertag = normalizeGamertag(body.gamertag);
            if (gamertag.length < 2) {
                return res.status(400).json({ ok: false, error: 'Escribe tu Gamertag o Nombre (mínimo 2 caracteres).' });
            }
            const channel = normalizeChannel(body.channel);
            const message = normalizeMessage(body.message);
            const keyLower = gamertag.toLowerCase();

            const existingPending = entries.find((e) =>
                e &&
                e.status === 'pending' &&
                String(e.gamertag || '').trim().toLowerCase() === keyLower &&
                (now - Number(e.createdAt || 0)) < DEDUP_WINDOW_MS
            );

            if (existingPending) {
                existingPending.channel = channel;
                if (message) existingPending.message = message;
                existingPending.createdAt = now;
                existingPending.dateLabel = getColombiaDateLabel(now);
            } else {
                entries.unshift({
                    id: `hof_${now}_${crypto.randomBytes(3).toString('hex')}`,
                    gamertag,
                    message,
                    channel,
                    status: 'pending',
                    createdAt: now,
                    approvedAt: 0,
                    dateLabel: getColombiaDateLabel(now)
                });
            }

            entries = await writeHofBoard(entries);
            return res.status(200).json({
                ...formatResponse(entries, false),
                registered: true,
                gamertag,
                channel
            });
        }

        if (action === 'approve') {
            const id = String(body.id || '').trim();
            if (!id) {
                return res.status(400).json({ ok: false, error: 'Falta el id del registro.' });
            }
            const idx = entries.findIndex((e) => e && e.id === id);
            if (idx === -1) {
                return res.status(404).json({ ok: false, error: 'Registro no encontrado.' });
            }
            entries[idx] = {
                ...entries[idx],
                status: 'approved',
                approvedAt: now,
                dateLabel: entries[idx].dateLabel || getColombiaDateLabel(now)
            };
            entries = await writeHofBoard(entries);
            return res.status(200).json(formatResponse(entries, true));
        }

        if (action === 'add_approved') {
            const gamertag = normalizeGamertag(body.gamertag);
            if (gamertag.length < 2) {
                return res.status(400).json({ ok: false, error: 'Escribe el Gamertag o Nombre (mínimo 2 caracteres).' });
            }
            const channel = normalizeChannel(body.channel);
            const message = normalizeMessage(body.message);
            entries.unshift({
                id: `hof_${now}_${crypto.randomBytes(3).toString('hex')}`,
                gamertag,
                message,
                channel,
                status: 'approved',
                createdAt: now,
                approvedAt: now,
                dateLabel: getColombiaDateLabel(now)
            });
            entries = await writeHofBoard(entries);
            return res.status(200).json(formatResponse(entries, true));
        }

        if (action === 'delete') {
            const id = String(body.id || '').trim();
            if (!id) {
                return res.status(400).json({ ok: false, error: 'Falta el id del registro.' });
            }
            entries = entries.filter((e) => e && e.id !== id);
            entries = await writeHofBoard(entries);
            return res.status(200).json(formatResponse(entries, true));
        }

        return res.status(400).json({ ok: false, error: 'Acción inválida.' });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || 'Error interno en Salón de la Fama.' });
    }
}
