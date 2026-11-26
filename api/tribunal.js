// ============================================================================
// UNSC TAC-BALANCER V2 — VERCEL SERVERLESS FUNCTION (api/tribunal.js)
// Tribunal Comunitario Spartan ONI:
//   - Activación abierta a jugadores o Admin (máximo 1 vez al día, hora Colombia)
//   - Duración exacta de 4 minutos (240,000 ms)
//   - Anti-trampa: mínimo 8 votos válidos desde redes/IPs públicas distintas
//   - Ajusta +1 PT al más votado para subir y -1 PT al más votado para bajar
//   - Si hay empate exacto o < 8 votos, NO realiza ningún ajuste
//   - Preserva intactos los demás jugadores de rosterData/mainRoster
// ============================================================================

import crypto from 'node:crypto';

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/halomatch-d9240/databases/(default)/documents/artifacts/halomatch-d9240/public/data';
const TRIBUNAL_DOC_URL = `${FIRESTORE_BASE}/tribunalData/activeTribunal`;
const ROSTER_DOC_URL = `${FIRESTORE_BASE}/rosterData/mainRoster`;

export const TRIBUNAL_DURATION_MS = 4 * 60 * 1000;
export const TRIBUNAL_MIN_VOTES = 8;

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

export function getColombiaDateKey(ms = Date.now()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(ms));
}

function calculateRankFromPts(pts) {
    const p = Number(pts || 10);
    if (p >= 23) return 'SS';
    if (p >= 20) return 'S';
    if (p >= 17) return 'A+';
    if (p >= 14) return 'A';
    if (p >= 11) return 'B+';
    if (p >= 8) return 'B';
    if (p >= 5) return 'C';
    return 'D';
}

function extractClientIp(req) {
    if (process.env.HALO_LOCAL_PREVIEW === '1' && req.headers['x-mock-ip']) {
        return String(req.headers['x-mock-ip']).trim();
    }
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
        return xff.split(',')[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
        return realIp.trim();
    }
    return String(req.socket?.remoteAddress || 'unknown').trim();
}

function hashNetworkIp(ip) {
    const salt = process.env.TRIBUNAL_IP_SALT || 'halo-match-tribunal-net-v1';
    return crypto.createHash('sha256').update(`${salt}:${String(ip || 'unknown')}`).digest('hex');
}

function createFirestoreStore() {
    return {
        async getSession() {
            try {
                const res = await fetch(`${TRIBUNAL_DOC_URL}?t=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) return null;
                const json = await res.json();
                return json && json.fields ? fromFirestoreValue({ mapValue: { fields: json.fields } }) : null;
            } catch {
                return null;
            }
        },
        async saveSession(session) {
            const res = await fetch(TRIBUNAL_DOC_URL, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: toFirestoreValue(session).mapValue.fields })
            });
            return res.ok;
        },
        async getRosterPlayers() {
            const res = await fetch(`${ROSTER_DOC_URL}?t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) return null;
            const json = await res.json();
            const parsed = json && json.fields ? fromFirestoreValue({ mapValue: { fields: json.fields } }) : null;
            return parsed && Array.isArray(parsed.players) ? parsed : null;
        },
        async saveRosterDoc(rosterDoc) {
            const res = await fetch(ROSTER_DOC_URL, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: toFirestoreValue(rosterDoc).mapValue.fields })
            });
            return res.ok;
        }
    };
}

function sanitizePublicSession(session) {
    if (!session) return null;
    return {
        id: session.id,
        status: session.status,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt,
        closedAt: session.closedAt || null,
        lastRunDateCO: session.lastRunDateCO || '',
        initiatedBy: session.initiatedBy || 'Comunidad',
        votes: session.votes || {},
        uniqueNetworkCount: Object.keys(session.networkHashes || {}).length,
        verdict: session.verdict || null
    };
}

function findUniqueTopWinner(countsMap) {
    const sorted = Object.entries(countsMap).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return { id: null, votes: 0, tie: false };
    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
        return { id: null, votes: sorted[0][1], tie: true };
    }
    return { id: sorted[0][0], votes: sorted[0][1], tie: false };
}

export function createTribunalHandler(customStore) {
    const store = customStore || createFirestoreStore();

    return async function handler(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mock-ip');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

        if (req.method === 'OPTIONS') return res.status(200).end();

        const now = Date.now();
        const todayCO = getColombiaDateKey(now);

        if (req.method === 'GET') {
            const existing = await store.getSession();
            return res.status(200).json({
                ok: true,
                todayCO,
                canStartToday: !existing || existing.lastRunDateCO !== todayCO,
                session: sanitizePublicSession(existing)
            });
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
        }

        const body = (typeof req.body === 'string') ? JSON.parse(req.body || '{}') : (req.body || {});
        const action = String(body.action || '').trim().toLowerCase();

        // 1) INICIAR TRIBUNAL (Cualquier jugador o Admin, máximo 1 vez por día, 4 min exactos)
        if (action === 'start') {
            const existing = await store.getSession();
            if (existing && existing.status === 'open' && now < Number(existing.expiresAt || 0)) {
                return res.status(409).json({
                    ok: false,
                    error: 'ALREADY_OPEN',
                    message: 'Ya hay un Tribunal en vivo en este momento.',
                    session: sanitizePublicSession(existing)
                });
            }

            if (existing && existing.lastRunDateCO === todayCO) {
                return res.status(429).json({
                    ok: false,
                    error: 'DAILY_LIMIT_REACHED',
                    message: 'El Tribunal solo se puede realizar máximo 1 vez al día. Vuelvan a intentarlo mañana.',
                    session: sanitizePublicSession(existing)
                });
            }

            const session = {
                id: 'trib-' + now,
                status: 'open',
                startedAt: now,
                expiresAt: now + TRIBUNAL_DURATION_MS,
                closedAt: null,
                lastRunDateCO: todayCO,
                initiatedBy: String(body.initiatorName || 'Comunidad').trim().slice(0, 40) || 'Comunidad',
                votes: {},
                networkHashes: {},
                verdict: null
            };

            const saved = await store.saveSession(session);
            if (!saved) {
                return res.status(502).json({ ok: false, error: 'FIRESTORE_ERROR', message: 'No se pudo iniciar el Tribunal en la nube.' });
            }

            return res.status(200).json({ ok: true, session: sanitizePublicSession(session) });
        }

        // 2) EMITIR VOTO ANTI-TRAMPA (1 por Spartan + 1 por red pública diferente)
        if (action === 'vote') {
            const session = await store.getSession();
            if (!session || session.status !== 'open') {
                return res.status(400).json({ ok: false, error: 'TRIBUNAL_CLOSED', message: 'No hay ningún Tribunal abierto en este momento.' });
            }
            if (now >= Number(session.expiresAt || 0)) {
                return res.status(400).json({ ok: false, error: 'TRIBUNAL_EXPIRED', message: 'El tiempo de 4 minutos del Tribunal ya terminó.' });
            }

            const voterId = String(body.voterId || '').trim();
            const voterName = String(body.voterName || '').trim().slice(0, 40);
            const plusId = String(body.plusId || '').trim();
            const minusId = String(body.minusId || '').trim();

            if (!voterId || !plusId || !minusId) {
                return res.status(400).json({ ok: false, error: 'MISSING_FIELDS', message: 'Elige tu perfil, a quién subir +1 PT y a quién bajar -1 PT.' });
            }
            if (voterId === plusId || voterId === minusId) {
                return res.status(400).json({ ok: false, error: 'SELF_VOTE', message: 'No puedes votar por ti mismo.' });
            }
            if (plusId === minusId) {
                return res.status(400).json({ ok: false, error: 'SAME_TARGET', message: 'El jugador que sube +1 PT y el que baja -1 PT deben ser diferentes.' });
            }

            const votes = session.votes || {};
            const networkHashes = session.networkHashes || {};
            const ipHash = hashNetworkIp(extractClientIp(req));

            if (networkHashes[ipHash]) {
                return res.status(409).json({
                    ok: false,
                    error: 'DUPLICATE_NETWORK',
                    message: '⛔ Ya se registró un voto desde esta red/Wi-Fi. Para evitar trampas, cada dispositivo debe conectarse desde una red diferente.'
                });
            }

            if (votes[voterId]) {
                return res.status(409).json({
                    ok: false,
                    error: 'ALREADY_VOTED',
                    message: 'Este Spartan ya emitió su voto en este Tribunal.'
                });
            }

            votes[voterId] = {
                voterId,
                voterName: voterName || voterId,
                plusId,
                minusId,
                ts: now
            };
            networkHashes[ipHash] = voterId;
            session.votes = votes;
            session.networkHashes = networkHashes;

            const saved = await store.saveSession(session);
            if (!saved) {
                return res.status(502).json({ ok: false, error: 'FIRESTORE_ERROR', message: 'Error al guardar tu voto.' });
            }

            const validCount = Math.min(Object.keys(votes).length, Object.keys(networkHashes).length);
            return res.status(200).json({
                ok: true,
                voteCount: validCount,
                session: sanitizePublicSession(session)
            });
        }

        // 3) CERRAR Y PROCLAMAR CONCLUSIÓN (Automático al cumplirse 4 minutos)
        if (action === 'finalize') {
            const session = await store.getSession();
            if (!session) {
                return res.status(404).json({ ok: false, error: 'NO_SESSION', message: 'No hay Tribunal registrado.' });
            }
            if (session.status === 'closed') {
                return res.status(200).json({ ok: true, session: sanitizePublicSession(session) });
            }

            const forceExpired = process.env.HALO_LOCAL_PREVIEW === '1' && body.forceExpire === true;
            if (!forceExpired && now < Number(session.expiresAt || 0)) {
                return res.status(400).json({
                    ok: false,
                    error: 'STILL_RUNNING',
                    message: 'El Tribunal aún sigue abierto.',
                    session: sanitizePublicSession(session)
                });
            }

            const votesList = Object.values(session.votes || {});
            const uniqueNets = Object.keys(session.networkHashes || {}).length;
            const validVotes = Math.min(votesList.length, uniqueNets);

            let verdict = null;

            if (validVotes < TRIBUNAL_MIN_VOTES) {
                verdict = {
                    id: session.id,
                    outcome: 'NO_QUORUM',
                    applied: false,
                    totalVotes: validVotes,
                    summary: `Sin quórum (${validVotes}/8 redes distintas en 4 min). No se aplicó ningún ajuste; intenten otro día.`
                };
            } else {
                const plusCounts = {};
                const minusCounts = {};
                votesList.forEach(v => {
                    plusCounts[v.plusId] = (plusCounts[v.plusId] || 0) + 1;
                    minusCounts[v.minusId] = (minusCounts[v.minusId] || 0) + 1;
                });

                const plusTop = findUniqueTopWinner(plusCounts);
                const minusTop = findUniqueTopWinner(minusCounts);

                if (plusTop.tie || minusTop.tie || !plusTop.id || !minusTop.id || plusTop.id === minusTop.id) {
                    verdict = {
                        id: session.id,
                        outcome: 'TIE_NO_CHANGE',
                        applied: false,
                        totalVotes: validVotes,
                        summary: `Empate exacto o conflicto en la votación (${validVotes} redes). No se realiza ningún ajuste; pidan el Tribunal otro día.`
                    };
                } else {
                    const rosterDoc = await store.getRosterPlayers();
                    const players = rosterDoc && Array.isArray(rosterDoc.players) ? rosterDoc.players : [];
                    const plusPlayer = players.find(p => String(p.id) === String(plusTop.id));
                    const minusPlayer = players.find(p => String(p.id) === String(minusTop.id));

                    if (!plusPlayer || !minusPlayer) {
                        verdict = {
                            id: session.id,
                            outcome: 'PLAYERS_NOT_FOUND',
                            applied: false,
                            totalVotes: validVotes,
                            summary: 'No se pudo localizar a los jugadores votados en el Roster. No se aplicaron cambios.'
                        };
                    } else {
                        plusPlayer.pts = Math.min(25, Number(plusPlayer.pts || 10) + 1);
                        plusPlayer.rank = calculateRankFromPts(plusPlayer.pts);
                        plusPlayer.tribunalDelta = Math.max(-5, Math.min(5, (Number(plusPlayer.tribunalDelta) || 0) + 1));

                        minusPlayer.pts = Math.max(1, Number(minusPlayer.pts || 10) - 1);
                        minusPlayer.rank = calculateRankFromPts(minusPlayer.pts);
                        minusPlayer.tribunalDelta = Math.max(-5, Math.min(5, (Number(minusPlayer.tribunalDelta) || 0) - 1));

                        rosterDoc.updatedAt = now;
                        const rosterSaved = await store.saveRosterDoc(rosterDoc);
                        if (!rosterSaved) {
                            return res.status(502).json({ ok: false, error: 'ROSTER_SAVE_FAILED', message: 'Error al aplicar el ajuste al Roster.' });
                        }

                        verdict = {
                            id: session.id,
                            outcome: 'APPLIED',
                            applied: true,
                            totalVotes: validVotes,
                            plusId: plusPlayer.id,
                            plusName: plusPlayer.name,
                            plusNewPts: plusPlayer.pts,
                            plusVotes: plusTop.votes,
                            minusId: minusPlayer.id,
                            minusName: minusPlayer.name,
                            minusNewPts: minusPlayer.pts,
                            minusVotes: minusTop.votes,
                            summary: `Conclusión (${validVotes} redes): ${plusPlayer.name} sube +1 PT (${plusPlayer.pts}) y ${minusPlayer.name} baja -1 PT (${minusPlayer.pts}).`
                        };
                    }
                }
            }

            session.status = 'closed';
            session.closedAt = now;
            session.verdict = verdict;
            await store.saveSession(session);

            return res.status(200).json({ ok: true, session: sanitizePublicSession(session) });
        }

        return res.status(400).json({ ok: false, error: 'INVALID_ACTION' });
    };
}

export default createTribunalHandler();
