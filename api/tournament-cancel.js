// ============================================================================
// UNSC TAC-BALANCER V2 — VERCEL SERVERLESS FUNCTION (api/tournament-cancel.js)
// Cancela y elimina un torneo de Firestore, lo registra en
// tournamentMeta/cancelledTournaments, desfija el mensaje y notifica en Discord.
// ============================================================================

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/halomatch-d9240/databases/(default)/documents/artifacts/halomatch-d9240/public/data';

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

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });

    const body = (typeof req.body === 'string') ? JSON.parse(req.body || '{}') : (req.body || {});
    const trnId = String(body.tournamentId || body.id || '').trim().toUpperCase();
    if (!trnId) {
        return res.status(400).json({ ok: false, error: 'MISSING_TOURNAMENT_ID' });
    }

    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    const defaultChannelId = process.env.DISCORD_CHANNEL_ID || '';

    try {
        // 1) Leer torneo actual para recuperar discordPin si existe
        let discordPin = null;
        const getRes = await fetch(`${FIRESTORE_BASE}/tournaments/${encodeURIComponent(trnId)}`);
        if (getRes.ok) {
            const doc = await getRes.json().catch(() => null);
            const data = doc && doc.fields ? fromFirestoreValue({ mapValue: { fields: doc.fields } }) : null;
            if (data && data.discordPin) discordPin = data.discordPin;
        }

        // 2) Registrar en tournamentMeta/cancelledTournaments
        let cancelledIds = [];
        let cancelledAt = {};
        const metaRes = await fetch(`${FIRESTORE_BASE}/tournamentMeta/cancelledTournaments`);
        if (metaRes.ok) {
            const metaDoc = await metaRes.json().catch(() => null);
            const metaData = metaDoc && metaDoc.fields ? fromFirestoreValue({ mapValue: { fields: metaDoc.fields } }) : null;
            if (metaData) {
                cancelledIds = Array.isArray(metaData.cancelledIds) ? metaData.cancelledIds : [];
                cancelledAt = (metaData.cancelledAt && typeof metaData.cancelledAt === 'object') ? metaData.cancelledAt : {};
            }
        }
        if (!cancelledIds.includes(trnId)) cancelledIds.push(trnId);
        cancelledIds = cancelledIds.slice(-100);
        cancelledAt[trnId] = Date.now();

        await fetch(`${FIRESTORE_BASE}/tournamentMeta/cancelledTournaments`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: toFirestoreValue({ cancelledIds, cancelledAt }).mapValue.fields })
        });

        // 3) Eliminar documento tournaments/{trnId} de Firestore
        const delRes = await fetch(`${FIRESTORE_BASE}/tournaments/${encodeURIComponent(trnId)}`, {
            method: 'DELETE'
        });

        // 4) Desfijar en Discord + notificar en #torneo
        let unpinned = false;
        const chId = (discordPin && discordPin.channelId) || defaultChannelId;
        if (botToken && discordPin && discordPin.channelId && discordPin.messageId) {
            try {
                const unpinRes = await fetch(`https://discord.com/api/v10/channels/${discordPin.channelId}/pins/${discordPin.messageId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bot ${botToken}` }
                });
                unpinned = unpinRes.ok;
            } catch {}
        }

        if (botToken && chId) {
            try {
                await fetch(`https://discord.com/api/v10/channels/${chId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: `🚫 El torneo **${trnId}** fue cancelado y eliminado por su organizador.`
                    })
                });
            } catch {}
        }

        return res.status(200).json({
            ok: true,
            tournamentId: trnId,
            deleted: delRes.ok || delRes.status === 404,
            unpinned
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
}
