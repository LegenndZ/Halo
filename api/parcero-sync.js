// ============================================================================
// UNSC TAC-BALANCER V2 — VERCEL SERVERLESS FUNCTION (api/parcero-sync.js)
// Parcero Bot 24/7 a $0 pesos vía Discord REST + Firebase Firestore REST.
// Idempotente mediante processedMsgIds (últimos 100) en tournamentMeta/parceroSessions.
// ============================================================================

import TEnginePkg from '../tournament-engine.js';
const TEngine = TEnginePkg?.default || TEnginePkg;

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
    return normalizeTournamentObject(fromFirestoreDoc(await res.json()));
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
    if (res.status === 404 || !res.ok) return [];
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

async function postChannelMessage(channelId, token, payload) {
    if (!token || !channelId) return false;
    const bodyObj = (typeof payload === 'string') ? { content: payload } : payload;
    try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyObj)
        });
        return res.ok;
    } catch {
        return false;
    }
}

const GREETING_RE = /^\s*(hola|buenas|que\s+m[aá]s|oe)\b/i;

function buildNeroGreetingPayload(trnId) {
    const tid = trnId || 'ACTIVE';
    const bracketUrl = (tid && tid !== 'ACTIVE')
        ? `https://halomatch.vercel.app/?torneo=${encodeURIComponent(tid)}`
        : 'https://halomatch.vercel.app';
    return {
        content: [
            '¡Buenas sosito, buena por saludar! 🫡 Ante todo los modales.',
            'Mire, aquí le paso la información para que vincule su Gamertag, reporte su marcador o mire el Bracket en vivo:',
            `🔗 **Ver Bracket:** ${bracketUrl}`,
            'Toque los botones de acá abajo y hagámosle pues 👇'
        ].join('\n'),
        components: [{
            type: 1,
            components: [
                { type: 2, style: 1, label: '🔗 Vincular Gamertag', custom_id: `parcero_link:${tid}` },
                { type: 2, style: 3, label: '🎯 Reportar Resultado', custom_id: `parcero_report:${tid}` }
            ]
        }]
    };
}

const MANNERS_REMINDER = 'Sosito, o sea, ante todo los modales, primero salude, ¿no? Escriba `hola` 😤';

async function syncWinnersToFirestore(tournament) {
    if (!tournament || !Array.isArray(tournament.winners)) return;
    for (const w of tournament.winners) {
        const docId = String(w.tournamentId || tournament.id).toUpperCase();
        await firestorePatchDoc(`tournamentWinners/${encodeURIComponent(docId)}`, w);
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    const channelId = process.env.DISCORD_CHANNEL_ID || '';
    if (!botToken || !channelId) {
        return res.status(200).json({ ok: false, reason: 'DISCORD_ENV_NOT_CONFIGURED' });
    }

    try {
        const sessionsDoc = (await firestoreGetDoc('tournamentMeta/parceroSessions')) || {};
        const userGamertags = sessionsDoc.userGamertags || sessionsDoc.sessions || {};
        let processedMsgIds = Array.isArray(sessionsDoc.processedMsgIds) ? sessionsDoc.processedMsgIds.slice(-100) : [];
        const processedSet = new Set(processedMsgIds);
        let sessionsDirty = false;
        let processedCount = 0;

        // 1) Leer últimos 25 mensajes de Discord por HTTPS REST
        const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=25`, {
            headers: { 'Authorization': `Bot ${botToken}` }
        });
        if (msgRes.ok) {
            const messages = await msgRes.json();
            // Orden cronológico (Discord devuelve más reciente primero)
            const chronological = Array.isArray(messages) ? messages.slice().reverse() : [];
            for (const msg of chronological) {
                if (!msg || !msg.id || processedSet.has(msg.id)) continue;
                if (msg.author && msg.author.bot) continue;
                const content = String(msg.content || '').trim();
                if (!content) continue;
                const msgTimeMs = msg.timestamp ? Date.parse(msg.timestamp) : Date.now();
                const isRecent = Number.isFinite(msgTimeMs) ? (Date.now() - msgTimeMs <= 180000) : true;
                const isGreeting = GREETING_RE.test(content) || /\bhola\s+parcero\b/i.test(content);
                const mentionsParcero = /\bparcero\b/i.test(content);
                if (!mentionsParcero && !isGreeting && !isRecent) continue;

                processedSet.add(msg.id);
                processedMsgIds.push(msg.id);
                sessionsDirty = true;
                processedCount++;

                const authorId = msg.author?.id || '';
                const linkMatch = content.match(/\bparcero\s+soy\s+(.+)$/i);
                const hasScore = /(?<!\d)\d{1,2}\s*(?:-|a|vs|:)\s*\d{1,2}(?!\d)/i.test(content);
                if (isGreeting && !linkMatch && !hasScore) {
                    const activeTrn = await findTournamentSmart('');
                    await postChannelMessage(channelId, botToken, buildNeroGreetingPayload(activeTrn ? activeTrn.id : 'ACTIVE'));
                    continue;
                }
                if (!mentionsParcero) {
                    await postChannelMessage(channelId, botToken, MANNERS_REMINDER);
                    continue;
                }
                if (linkMatch) {
                    const gamertag = linkMatch[1].trim().replace(/[<>"'`]/g, '');
                    if (!gamertag) {
                        await postChannelMessage(channelId, botToken, '⚠️ Indica tu Gamertag: `Parcero soy TuGamertag`');
                        continue;
                    }
                    const gtLower = gamertag.toLowerCase();
                    const conflict = Object.entries(userGamertags)
                        .find(([uid, gt]) => uid !== authorId && String(gt).toLowerCase() === gtLower);
                    if (conflict) {
                        await postChannelMessage(channelId, botToken, `⛔ El Gamertag **${gamertag}** ya está vinculado a otro usuario de Discord (1 Gamertag = 1 sesión).`);
                        continue;
                    }
                    userGamertags[authorId] = gamertag;
                    await postChannelMessage(channelId, botToken, `✅ Gamertag **${gamertag}** vinculado en Firestore a tu sesión de Discord.`);
                    continue;
                }

                const trnMatch = content.match(/\b(TRN-[A-Z0-9]{4,8})\b/i);
                const requestedTrnId = trnMatch ? trnMatch[1].toUpperCase() : '';
                const tournament = await findTournamentSmart(requestedTrnId);
                if (!tournament) {
                    await postChannelMessage(channelId, botToken, `⚠️ No encontré el torneo \`${requestedTrnId || 'activo'}\` en Firebase.`);
                    continue;
                }
                const trnId = String(tournament.id || requestedTrnId).toUpperCase();

                const linkedGt = userGamertags[authorId]
                    || msg.author?.global_name
                    || msg.author?.username
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
                await postChannelMessage(channelId, botToken, result.message || 'Procesado.');
            }
        }

        if (sessionsDirty) {
            processedMsgIds = processedMsgIds.slice(-100);
            await firestorePatchDoc('tournamentMeta/parceroSessions', { userGamertags, processedMsgIds });
        }

        // 2) Auto-sellado 5 min + Des-fijado 12 horas en torneos activos
        const tournaments = await firestoreListCollection('tournaments');
        const now = Date.now();
        let autoSealedTotal = 0;
        let unpinnedTotal = 0;

        for (const trn of tournaments) {
            if (!trn || !trn.id) continue;
            let dirty = false;

            const sealedIds = TEngine.resolveExpiredConfirmations(trn, now);
            if (sealedIds.length > 0) {
                dirty = true;
                autoSealedTotal += sealedIds.length;
                await syncWinnersToFirestore(trn);
                await postChannelMessage(
                    channelId,
                    botToken,
                    `⏱️ **Auto-sellado (5 min)** en **${trn.id}**: llave(s) \`${sealedIds.join(', ')}\` confirmadas automáticamente.`
                );
            }

            const pin = trn.discordPin;
            if (pin && pin.channelId && pin.messageId && pin.unpinAt && now >= pin.unpinAt) {
                try {
                    await fetch(`https://discord.com/api/v10/channels/${pin.channelId}/pins/${pin.messageId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bot ${botToken}` }
                    });
                } catch {}
                delete trn.discordPin;
                dirty = true;
                unpinnedTotal++;
            }

            if (dirty) {
                await firestorePatchDoc(`tournaments/${encodeURIComponent(trn.id)}`, trn);
            }
        }

        return res.status(200).json({
            ok: true,
            processedMessages: processedCount,
            autoSealedTotal,
            unpinnedTotal
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
}
