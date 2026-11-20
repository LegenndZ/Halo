// ============================================================================
// UNSC TAC-BALANCER V2 — PARCERO BOT PRODUCCIÓN (bot/parcero-bot.js)
// Node.js 24 puro (sin dependencias npm). Conecta al Gateway de Discord
// y sincroniza en vivo con Firebase Firestore REST (tournaments & tournamentWinners)
// SIN tocar nunca mainRoster ni exponer secretos en código.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(WORKSPACE_ROOT, '.env');
const TEngine = require(path.join(WORKSPACE_ROOT, 'tournament-engine.js'));

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/halomatch-d9240/databases/(default)/documents/artifacts/halomatch-d9240/public/data';
const TARGET_GUILD_ID = '1461563281792569482';

function loadDotEnv(filePath) {
    const env = {};
    if (!fs.existsSync(filePath)) return env;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        env[key] = val;
    }
    return env;
}

const dotEnv = loadDotEnv(ENV_PATH);
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || dotEnv.DISCORD_BOT_TOKEN || '';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || dotEnv.DISCORD_CHANNEL_ID || '';

// --- Conversores Firestore REST ---
function toFirestoreValue(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
        if (Number.isInteger(val)) return { integerValue: String(val) };
        return { doubleValue: val };
    }
    if (typeof val === 'string') return { stringValue: val };
    if (Array.isArray(val)) {
        return { arrayValue: { values: val.map(toFirestoreValue) } };
    }
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

function toFirestoreDoc(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj || {})) {
        if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { fields };
}

function fromFirestoreDoc(doc) {
    if (!doc || !doc.fields) return null;
    return fromFirestoreValue({ mapValue: { fields: doc.fields } });
}

function normalizeTournamentObject(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.payloadJson === 'string') {
        try {
            const parsed = JSON.parse(raw.payloadJson);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch {}
    }
    return raw;
}

async function firestoreGetDoc(relPath) {
    const res = await fetch(`${FIRESTORE_BASE}/${relPath}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore GET ${relPath} -> ${res.status}`);
    const doc = await res.json();
    return normalizeTournamentObject(fromFirestoreDoc(doc));
}

async function firestorePatchDoc(relPath, obj) {
    const res = await fetch(`${FIRESTORE_BASE}/${relPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestoreDoc(obj))
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Firestore PATCH ${relPath} -> ${res.status}: ${txt.slice(0, 150)}`);
    }
    return true;
}

async function firestoreListCollection(colName) {
    const res = await fetch(`${FIRESTORE_BASE}/${colName}?pageSize=50`);
    if (res.status === 404) return [];
    if (!res.ok) return [];
    const data = await res.json();
    return (data.documents || []).map((d) => normalizeTournamentObject(fromFirestoreDoc(d))).filter(Boolean);
}

async function getCancelledTournamentSet() {
    try {
        const meta = await firestoreGetDoc('tournamentMeta/cancelledTournaments');
        const list = (meta && Array.isArray(meta.cancelledIds)) ? meta.cancelledIds : [];
        return new Set(list.map((id) => String(id || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()).filter(Boolean));
    } catch {
        return new Set();
    }
}

async function findTournamentSmart(trnIdRaw) {
    const cleanId = String(trnIdRaw || '').trim().toUpperCase();
    const cancelledSet = await getCancelledTournamentSet();
    if (cleanId) {
        const normTarget = cleanId.replace(/[^A-Z0-9]/g, '');
        if (cancelledSet.has(normTarget)) return { id: cleanId, status: 'CANCELLED' };
        const direct = await firestoreGetDoc(`tournaments/${encodeURIComponent(cleanId)}`);
        if (direct) return direct;
    }
    const all = await firestoreListCollection('tournaments');
    const validAll = all.filter((t) => {
        const normId = String(t.id || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
        return String(t.status || '').toUpperCase() !== 'CANCELLED' && !cancelledSet.has(normId);
    });
    if (cleanId) {
        const normTarget = cleanId.replace(/[^A-Z0-9]/g, '');
        const byNorm = all.find((t) => String(t.id || '').replace(/[^A-Z0-9]/g, '').toUpperCase() === normTarget);
        if (byNorm) return byNorm;
    } else {
        const activeList = validAll.filter((t) => !t.championTeamId);
        if (activeList.length === 1) return activeList[0];
        if (validAll.length > 0) {
            return validAll.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
        }
    }
    return null;
}

async function postChannelMessage(channelId, content) {
    if (!DISCORD_BOT_TOKEN || !channelId) return false;
    try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });
        return res.ok;
    } catch (e) {
        console.error('DISCORD_REST_ERR:', e.message);
        return false;
    }
}

async function syncWinnersToFirestore(tournament) {
    if (!tournament || !Array.isArray(tournament.winners)) return;
    for (const w of tournament.winners) {
        const docId = String(w.tournamentId || tournament.id).toUpperCase();
        await firestorePatchDoc(`tournamentWinners/${encodeURIComponent(docId)}`, w);
    }
}

async function checkExpiredConfirmationsAndPins() {
    try {
        const tournaments = await firestoreListCollection('tournaments');
        const now = Date.now();
        for (const trn of tournaments) {
            if (!trn || !trn.id) continue;
            let dirty = false;

            // 1) Auto-sellado 5 minutos
            const sealedIds = TEngine.resolveExpiredConfirmations(trn, now);
            if (sealedIds.length > 0) {
                dirty = true;
                await syncWinnersToFirestore(trn);
                if (DISCORD_CHANNEL_ID) {
                    await postChannelMessage(
                        DISCORD_CHANNEL_ID,
                        `⏱️ **Auto-sellado (5 min)** en **${trn.id}**: llave(s) \`${sealedIds.join(', ')}\` confirmadas automáticamente.`
                    );
                }
            }

            // 2) Des-fijado (Unpin) a las 12 horas
            const pin = trn.discordPin;
            if (pin && pin.channelId && pin.messageId && pin.unpinAt && now >= pin.unpinAt) {
                try {
                    await fetch(`https://discord.com/api/v10/channels/${pin.channelId}/pins/${pin.messageId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}` }
                    });
                } catch {}
                delete trn.discordPin;
                dirty = true;
            }

            if (dirty) {
                await firestorePatchDoc(`tournaments/${encodeURIComponent(trn.id)}`, trn);
            }
        }
    } catch (err) {
        console.error('CHECK_CYCLE_ERR:', err.message);
    }
}

let heartbeatTimer = null;
let lastSeq = null;
let gatewayReady = false;

function startDiscordGateway(testOnlyOnce) {
    if (!DISCORD_BOT_TOKEN) {
        console.error('ERROR: Falta DISCORD_BOT_TOKEN en .env');
        process.exit(1);
    }

    const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

    ws.addEventListener('message', async (event) => {
        let payload;
        try { payload = JSON.parse(event.data); } catch { return; }
        const { op, t, d, s } = payload;
        if (s !== null && s !== undefined) lastSeq = s;

        if (op === 10 && d && d.heartbeat_interval) {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ op: 1, d: lastSeq }));
                }
            }, d.heartbeat_interval);

            ws.send(JSON.stringify({
                op: 2,
                d: {
                    token: DISCORD_BOT_TOKEN,
                    intents: 33281,
                    properties: { os: 'windows', browser: 'parcero-unsc-prod', device: 'parcero-unsc-prod' }
                }
            }));
        }

        if (op === 0 && t === 'READY') {
            gatewayReady = true;
            const guilds = (d.guilds || []).map((g) => g.id);
            console.log(`PARCERO_PROD_READY user=${d.user?.username}#${d.user?.discriminator} guilds=${JSON.stringify(guilds)} inTarget=${guilds.includes(TARGET_GUILD_ID)}`);
            if (testOnlyOnce) {
                clearInterval(heartbeatTimer);
                ws.close(1000, 'test ok');
                process.exit(0);
            }
        }

        if (op === 0 && t === 'MESSAGE_CREATE' && d) {
            if (d.author && d.author.bot) return;
            if (DISCORD_CHANNEL_ID && d.channel_id !== DISCORD_CHANNEL_ID) return;
            const content = String(d.content || '').trim();
            if (!/\bparcero\b/i.test(content)) return;

            const authorId = d.author?.id || '';
            const msgId = d.id || '';
            try {
                const sessionsDoc = (await firestoreGetDoc('tournamentMeta/parceroSessions')) || { userGamertags: {}, processedMsgIds: [] };
                const userGamertags = sessionsDoc.userGamertags || {};
                let processedMsgIds = Array.isArray(sessionsDoc.processedMsgIds) ? sessionsDoc.processedMsgIds.slice(-100) : [];
                if (msgId && processedMsgIds.includes(msgId)) return;
                if (msgId) {
                    processedMsgIds.push(msgId);
                    processedMsgIds = processedMsgIds.slice(-100);
                }

                // 1) Vinculación: "Parcero soy <Gamertag>"
                const linkMatch = content.match(/\bparcero\s+soy\s+(.+)$/i);
                if (linkMatch) {
                    const gamertag = linkMatch[1].trim().replace(/[<>"'`]/g, '');
                    if (!gamertag) {
                        await firestorePatchDoc('tournamentMeta/parceroSessions', { userGamertags, processedMsgIds });
                        await postChannelMessage(d.channel_id, '⚠️ Indica tu Gamertag: `Parcero soy TuGamertag`');
                        return;
                    }
                    const gtLower = gamertag.toLowerCase();
                    const conflict = Object.entries(userGamertags)
                        .find(([uid, gt]) => uid !== authorId && String(gt).toLowerCase() === gtLower);
                    if (conflict) {
                        await firestorePatchDoc('tournamentMeta/parceroSessions', { userGamertags, processedMsgIds });
                        await postChannelMessage(d.channel_id, `⛔ El Gamertag **${gamertag}** ya está vinculado a otro usuario de Discord (1 Gamertag = 1 sesión).`);
                        return;
                    }
                    userGamertags[authorId] = gamertag;
                    await firestorePatchDoc('tournamentMeta/parceroSessions', { userGamertags, processedMsgIds });
                    await postChannelMessage(d.channel_id, `✅ Gamertag **${gamertag}** vinculado en Firestore a tu sesión de Discord.`);
                    return;
                }

                await firestorePatchDoc('tournamentMeta/parceroSessions', { userGamertags, processedMsgIds });

                // 2) Reporte de partido
                const trnMatch = content.match(/\b(TRN-[A-Z0-9]{4,8})\b/i);
                const requestedTrnId = trnMatch ? trnMatch[1].toUpperCase() : '';
                const tournament = await findTournamentSmart(requestedTrnId);
                if (!tournament) {
                    await postChannelMessage(d.channel_id, `⚠️ No encontré el torneo \`${requestedTrnId || 'activo'}\` en Firebase.`);
                    return;
                }
                const trnId = String(tournament.id || requestedTrnId).toUpperCase();

                const linkedGt = userGamertags[authorId]
                    || d.author?.global_name
                    || d.author?.username
                    || '';

                const result = TEngine.processParceroCommand(tournament, {
                    text: content,
                    authorId,
                    authorGamertag: linkedGt
                }, Date.now());

                if (result.ok) {
                    await firestorePatchDoc(`tournaments/${encodeURIComponent(trnId)}`, tournament);
                    await syncWinnersToFirestore(tournament);
                }
                await postChannelMessage(d.channel_id, result.message || 'Procesado.');
            } catch (err) {
                console.error('MESSAGE_HANDLER_ERR:', err.message);
                await postChannelMessage(d.channel_id, '⚠️ Error temporal al sincronizar con Firebase. Intenta de nuevo.');
            }
        }
    });

    ws.addEventListener('close', (ev) => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        gatewayReady = false;
        if (ev.code === 4014) {
            console.error('DISALLOWED_INTENT_4014');
            return;
        }
        if (!testOnlyOnce) {
            setTimeout(() => startDiscordGateway(false), 5000);
        }
    });

    ws.addEventListener('error', (err) => {
        console.error('GATEWAY_ERR:', err.message || 'ws error');
    });
}

if (require.main === module) {
    const testGatewayOnly = process.argv.includes('--test-gateway');
    startDiscordGateway(testGatewayOnly);
    if (!testGatewayOnly) {
        checkExpiredConfirmationsAndPins();
        setInterval(checkExpiredConfirmationsAndPins, 15000);
    } else {
        setTimeout(() => {
            if (!gatewayReady) process.exit(1);
            process.exit(0);
        }, 10000);
    }
}

module.exports = { toFirestoreValue, fromFirestoreValue, checkExpiredConfirmationsAndPins };
