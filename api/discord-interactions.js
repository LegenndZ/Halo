// ============================================================================
// UNSC TAC-BALANCER V2 — VERCEL SERVERLESS FUNCTION (api/discord-interactions.js)
// Endpoint oficial de Discord Interactions (Ed25519) para respuesta < 1s 24/7 a $0.
// Soporta botones interactivos, Modal de Gamertag, Slash Commands y confirmación 5m.
// No modifica mainRoster ni guarda secretos en código.
// ============================================================================

import crypto from 'crypto';
import TEnginePkg from '../tournament-engine.js';

const TEngine = TEnginePkg?.default || TEnginePkg;

export const config = {
    api: {
        bodyParser: false
    }
};

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/halomatch-d9240/databases/(default)/documents/artifacts/halomatch-d9240/public/data';

let cachedPublicKeyHex = '';

async function readRawBody(req) {
    if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
    if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody, 'utf8');
    if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
    if (Buffer.isBuffer(req.body)) return req.body;
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    if (chunks.length === 0 && req.body && typeof req.body === 'object') {
        return Buffer.from(JSON.stringify(req.body), 'utf8');
    }
    return Buffer.concat(chunks);
}

async function getDiscordPublicKeyHex() {
    if (process.env.DISCORD_PUBLIC_KEY) return String(process.env.DISCORD_PUBLIC_KEY).trim();
    if (cachedPublicKeyHex) return cachedPublicKeyHex;
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    if (!botToken) return '';
    try {
        const res = await fetch('https://discord.com/api/v10/applications/@me', {
            headers: { 'Authorization': `Bot ${botToken}` }
        });
        if (!res.ok) return '';
        const data = await res.json().catch(() => null);
        if (data && data.verify_key) {
            cachedPublicKeyHex = String(data.verify_key).trim();
            return cachedPublicKeyHex;
        }
    } catch {}
    return '';
}

function verifyDiscordSignature(rawBuf, signatureHex, timestamp, publicKeyHex) {
    if (!rawBuf || !signatureHex || !timestamp || !publicKeyHex) return false;
    try {
        const derPrefix = Buffer.from('302a300506032b6570032100', 'hex');
        const keyObj = crypto.createPublicKey({
            key: Buffer.concat([derPrefix, Buffer.from(publicKeyHex, 'hex')]),
            format: 'der',
            type: 'spki'
        });
        const message = Buffer.concat([Buffer.from(String(timestamp), 'utf8'), rawBuf]);
        return crypto.verify(null, message, keyObj, Buffer.from(String(signatureHex), 'hex'));
    } catch {
        return false;
    }
}

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
    const clean = JSON.parse(JSON.stringify(obj || {}));
    const res = await fetch(`${FIRESTORE_BASE}/${relPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestoreDoc(clean))
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
    const isSpecific = cleanId && cleanId !== 'ACTIVE' && cleanId !== 'GLOBAL';
    const cancelledSet = await getCancelledTournamentSet();

    if (isSpecific) {
        const normTarget = cleanId.replace(/[^A-Z0-9]/g, '');
        if (cancelledSet.has(normTarget)) {
            return { id: cleanId, status: 'CANCELLED' };
        }
        const direct = await firestoreGetDoc(`tournaments/${encodeURIComponent(cleanId)}`);
        if (direct) return direct;
    }
    const all = await firestoreListCollection('tournaments');
    const validAll = all.filter((t) => {
        const normId = String(t.id || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
        return String(t.status || '').toUpperCase() !== 'CANCELLED' && !cancelledSet.has(normId);
    });
    if (isSpecific) {
        const normTarget = cleanId.replace(/[^A-Z0-9]/g, '');
        return all.find((t) => String(t.id || '').replace(/[^A-Z0-9]/g, '').toUpperCase() === normTarget) || null;
    }
    const activeList = validAll.filter((t) => !t.championTeamId);
    if (activeList.length > 0) {
        return activeList.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    }
    return null;
}

async function saveTournamentAndWinners(tournament) {
    const clean = {
        ...tournament,
        id: String(tournament.id || '').toUpperCase(),
        phaseBannerImages: [],
        updatedAt: Date.now()
    };
    const tasks = [firestorePatchDoc(`tournaments/${encodeURIComponent(clean.id)}`, clean)];
    if (Array.isArray(clean.winners)) {
        for (const w of clean.winners) {
            const docId = String(w.tournamentId || clean.id).toUpperCase();
            tasks.push(firestorePatchDoc(`tournamentWinners/${encodeURIComponent(docId)}`, w));
        }
    }
    await Promise.all(tasks);
}

async function postChannelPayload(channelId, token, payload) {
    if (!token || !channelId) return false;
    try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        return res.ok;
    } catch {
        return false;
    }
}

function ephemeralResp(res, data) {
    return res.status(200).json({
        type: 4,
        data: { flags: 64, ...data }
    });
}

function updateMessageResp(res, data) {
    return res.status(200).json({
        type: 7,
        data
    });
}

function openLinkModalResp(res, trnId) {
    return res.status(200).json({
        type: 9,
        data: {
            custom_id: `parcero_link_modal:${trnId || 'ACTIVE'}`,
            title: 'Vincular Gamertag • Halo Match',
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 4,
                            custom_id: 'gamertag',
                            label: 'Tu Gamertag exacto en Halo Infinite',
                            style: 1,
                            min_length: 2,
                            max_length: 32,
                            placeholder: 'Ej: Legennd Zr',
                            required: true
                        }
                    ]
                }
            ]
        }
    });
}

function buildScoreButtons(trnId, matchObj, teamA, teamB, bestOf) {
    const winTarget = Number(bestOf) === 5 ? 3 : 2;
    const rowA = [];
    const rowB = [];
    for (let lose = 0; lose < winTarget; lose++) {
        rowA.push({
            type: 2,
            style: 1,
            label: `${teamA.name} ${winTarget}-${lose}`.slice(0, 80),
            custom_id: `parcero_score:${trnId}:${matchObj.id}:${winTarget}-${lose}`
        });
        rowB.push({
            type: 2,
            style: 3,
            label: `${teamB.name} ${winTarget}-${lose}`.slice(0, 80),
            custom_id: `parcero_score:${trnId}:${matchObj.id}:${lose}-${winTarget}`
        });
    }
    return [
        { type: 1, components: rowA },
        { type: 1, components: rowB }
    ];
}

function buildConfirmationButtons(trnId, matchId) {
    return [
        {
            type: 1,
            components: [
                {
                    type: 2,
                    style: 3,
                    label: 'Confirmar',
                    emoji: { name: '✅' },
                    custom_id: `parcero_confirm:${trnId}:${matchId}`
                },
                {
                    type: 2,
                    style: 4,
                    label: 'Disputar',
                    emoji: { name: '⚠️' },
                    custom_id: `parcero_dispute:${trnId}:${matchId}`
                }
            ]
        }
    ];
}

async function handleReportMenu(res, { trnId, userId, userGamertags }) {
    const gt = userGamertags[userId];
    if (!gt) {
        return openLinkModalResp(res, trnId || 'ACTIVE');
    }
    const tournament = await findTournamentSmart(trnId);
    if (!tournament) {
        return ephemeralResp(res, {
            content: `⚠️ No encontré ningún torneo activo${trnId && trnId !== 'ACTIVE' ? ` (**${trnId}**)` : ''} en Firebase.`
        });
    }

    const activeRes = TEngine.findPlayerActiveMatch(tournament, gt, Date.now());
    if (!activeRes.ok) {
        return ephemeralResp(res, { content: activeRes.message });
    }

    const { match, teamA, teamB, playerTeam, rivalTeam, bestOf } = activeRes;
    const tid = String(tournament.id || '').toUpperCase();

    if (match.status === 'CONFIRMING' && match.pendingReport) {
        const pr = match.pendingReport;
        if (pr.loserId === playerTeam.id) {
            const winTeam = pr.winnerId === teamA.id ? teamA : teamB;
            return ephemeralResp(res, {
                embeds: [{
                    title: `⏳ Confirmación pendiente • ${tid}`,
                    color: 0xf59e0b,
                    description: [
                        `**${winTeam.name}** reportó el marcador **${teamA.name} ${pr.scoreA} - ${pr.scoreB} ${teamB.name}**.`,
                        `Tu equipo (**${playerTeam.name}**) puede confirmarlo ahora o disputarlo:`
                    ].join('\n')
                }],
                components: buildConfirmationButtons(tid, match.id)
            });
        }
        return ephemeralResp(res, {
            content: `⏳ Ya enviaste un reporte en **${teamA.name} vs ${teamB.name}**. Esperando confirmación de **${rivalTeam.name}** (o auto-sellado en 5 minutos).`
        });
    }

    return ephemeralResp(res, {
        embeds: [{
            title: `🎯 Reportar Marcador • ${tid} (${match.roundLabel || match.id})`,
            color: 0x06b6d4,
            description: [
                `👤 **Gamertag:** ${gt} • **Equipo:** ${playerTeam.name} (${playerTeam.voiceChannel || ''})`,
                `⚔️ **Cruce:** **${teamA.name}** vs **${teamB.name}** (Mejor de ${bestOf})`,
                '',
                'Selecciona el marcador exacto:',
                '• Si reporta el **perdedor**, se sella al instante en el Bracket.',
                '• Si reporta el **ganador**, **' + rivalTeam.name + '** tendrá **5 minutos** para confirmar.'
            ].join('\n')
        }],
        components: buildScoreButtons(tid, match, teamA, teamB, bestOf)
    });
}

async function handleLinkSubmit(res, { trnId, userId, gamertag, sessionsDoc, userGamertags }) {
    const cleanGt = String(gamertag || '').trim().replace(/[<>"'`]/g, '');
    if (!cleanGt) {
        return ephemeralResp(res, { content: '⚠️ Ingresa un Gamertag válido.' });
    }
    const gtLower = cleanGt.toLowerCase();
    const conflict = Object.entries(userGamertags)
        .find(([uid, gt]) => uid !== userId && String(gt).toLowerCase() === gtLower);
    if (conflict) {
        return ephemeralResp(res, {
            content: `⛔ El Gamertag **${cleanGt}** ya está vinculado a otro usuario de Discord (1 Gamertag = 1 sesión).`
        });
    }

    const tournament = await findTournamentSmart(trnId);
    if (tournament && tournament.gamertagSessions && tournament.gamertagSessions[gtLower] && tournament.gamertagSessions[gtLower] !== userId) {
        return ephemeralResp(res, {
            content: `⛔ El Gamertag **${cleanGt}** ya pertenece a otra sesión dentro de **${tournament.id}**.`
        });
    }

    userGamertags[userId] = cleanGt;
    await firestorePatchDoc('tournamentMeta/parceroSessions', {
        userGamertags,
        processedMsgIds: Array.isArray(sessionsDoc.processedMsgIds) ? sessionsDoc.processedMsgIds.slice(-100) : [],
        updatedAt: Date.now()
    });

    if (!tournament) {
        return ephemeralResp(res, {
            content: `✅ Gamertag **${cleanGt}** vinculado en Firebase a tu cuenta de Discord.`
        });
    }

    const activeRes = TEngine.findPlayerActiveMatch(tournament, cleanGt, Date.now());
    const tid = String(tournament.id || '').toUpperCase();
    if (activeRes.ok) {
        return ephemeralResp(res, {
            embeds: [{
                title: `✅ Vinculado: ${cleanGt}`,
                color: 0x10b981,
                description: [
                    `🏆 **Torneo:** ${tournament.name} (${tid})`,
                    `🛡️ **Equipo:** ${activeRes.playerTeam.name} • ${activeRes.playerTeam.voiceChannel || ''}`,
                    `⚔️ **Tu cruce activo:** **${activeRes.teamA.name}** vs **${activeRes.teamB.name}**`
                ].join('\n')
            }],
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    style: 1,
                    label: 'Reportar Resultado ahora',
                    emoji: { name: '🎯' },
                    custom_id: `parcero_report:${tid}`
                }]
            }]
        });
    }

    const playerTeam = activeRes.playerTeam;
    return ephemeralResp(res, {
        content: playerTeam
            ? `✅ Gamertag **${cleanGt}** vinculado. Perteneces a **${playerTeam.name}** (${playerTeam.voiceChannel || ''}) en **${tid}**.`
            : `✅ Gamertag **${cleanGt}** vinculado en Firebase. *(Aún no figuras en la plantilla de **${tid}**).*`
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
    }

    const rawBuf = await readRawBody(req);
    const sig = req.headers['x-signature-ed25519'];
    const ts = req.headers['x-signature-timestamp'];
    const pubKey = await getDiscordPublicKeyHex();

    if (!verifyDiscordSignature(rawBuf, sig, ts, pubKey)) {
        return res.status(401).send('Invalid request signature');
    }

    let interaction = {};
    try {
        interaction = JSON.parse(rawBuf.toString('utf8') || '{}');
    } catch {
        return res.status(400).send('Invalid JSON');
    }

    // 1) PING oficial de verificación de Discord Developer Portal
    if (interaction.type === 1) {
        return res.status(200).json({ type: 1 });
    }

    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    const defaultChannelId = process.env.DISCORD_CHANNEL_ID || '';
    const targetChannelId = interaction.channel_id || defaultChannelId;
    const userId = String((interaction.member && interaction.member.user && interaction.member.user.id) || (interaction.user && interaction.user.id) || '').trim();
    const sessionsDoc = (await firestoreGetDoc('tournamentMeta/parceroSessions')) || {};
    const userGamertags = sessionsDoc.userGamertags || sessionsDoc.sessions || {};

    // 2) SLASH COMMANDS (/vincular, /reportar)
    if (interaction.type === 2) {
        const cmdName = interaction.data && interaction.data.name;
        const opts = (interaction.data && Array.isArray(interaction.data.options)) ? interaction.data.options : [];
        const getOpt = (k) => {
            const found = opts.find((o) => o.name === k);
            return found ? found.value : '';
        };
        if (cmdName === 'vincular') {
            const gtOpt = String(getOpt('gamertag') || '').trim();
            if (!gtOpt) return openLinkModalResp(res, 'ACTIVE');
            return handleLinkSubmit(res, { trnId: 'ACTIVE', userId, gamertag: gtOpt, sessionsDoc, userGamertags });
        }
        if (cmdName === 'reportar') {
            const trnOpt = String(getOpt('torneo') || 'ACTIVE').trim().toUpperCase();
            return handleReportMenu(res, { trnId: trnOpt, userId, userGamertags });
        }
        if (cmdName === 'hola') {
            const activeTrn = await findTournamentSmart('');
            const tid = activeTrn ? activeTrn.id : 'ACTIVE';
            const bracketUrl = (tid && tid !== 'ACTIVE')
                ? `https://halomatch.vercel.app/?torneo=${encodeURIComponent(tid)}`
                : 'https://halomatch.vercel.app';
            return ephemeralResp(res, {
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
            });
        }
        if (cmdName === 'jugar') {
            const rawMode = String(getOpt('modo') || '4v4').toLowerCase();
            const maxSlots = rawMode === '2v2' ? 4 : (rawMode === '3v3' ? 6 : 8);
            const modeLabel = maxSlots === 4 ? '2v2' : (maxSlots === 6 ? '3v3' : '4v4');
            const initialPlayers = userId ? [`<@${userId}>`] : [];
            return res.status(200).json({
                type: 4,
                data: {
                    embeds: [{
                        title: `🎮 Partida Personalizada ${modeLabel} • Halo Match`,
                        color: 0x06b6d4,
                        description: [
                            `Armando lobby **${modeLabel}** para jugar parejos.`,
                            '',
                            `**Anotados (${initialPlayers.length}/${maxSlots}):**`,
                            initialPlayers.length ? initialPlayers.map((m, idx) => `${idx + 1}. ${m}`).join('\n') : '_Nadie todavía_'
                        ].join('\n'),
                        footer: { text: 'Al completar cupos, entren a halomatch.vercel.app para balancear equipos' }
                    }],
                    components: [{
                        type: 1,
                        components: [
                            { type: 2, style: 3, label: 'Me apunto', emoji: { name: '✋' }, custom_id: `lfg_join:${maxSlots}:${modeLabel}` },
                            { type: 2, style: 4, label: 'Salirme', emoji: { name: '🚪' }, custom_id: `lfg_leave:${maxSlots}:${modeLabel}` },
                            { type: 2, style: 5, label: 'Balancear en Halo Match', url: 'https://halomatch.vercel.app' }
                        ]
                    }]
                }
            });
        }
        return ephemeralResp(res, { content: '⚠️ Comando no reconocido.' });
    }

    // 3) MODAL SUBMIT (Vincular Gamertag)
    if (interaction.type === 5) {
        const customId = String((interaction.data && interaction.data.custom_id) || '');
        if (customId.startsWith('parcero_link_modal:')) {
            const trnId = customId.split(':')[1] || 'ACTIVE';
            const rows = (interaction.data && Array.isArray(interaction.data.components)) ? interaction.data.components : [];
            const inputRow = rows[0] && Array.isArray(rows[0].components) ? rows[0].components[0] : null;
            const gtVal = inputRow ? inputRow.value : '';
            return handleLinkSubmit(res, { trnId, userId, gamertag: gtVal, sessionsDoc, userGamertags });
        }
        return ephemeralResp(res, { content: '⚠️ Formulario no reconocido.' });
    }

    // 4) BOTONES INTERACTIVOS
    if (interaction.type === 3) {
        const customId = String((interaction.data && interaction.data.custom_id) || '');
        const parts = customId.split(':');
        const actionType = parts[0];

        if (actionType === 'lfg_join' || actionType === 'lfg_leave') {
            const maxSlots = Math.max(4, Math.min(16, Number(parts[1] || 8)));
            const modeLabel = String(parts[2] || '4v4');
            const prevDesc = String((interaction.message && interaction.message.embeds && interaction.message.embeds[0] && interaction.message.embeds[0].description) || '');
            const mentions = [...new Set((prevDesc.match(/<@\d+>/g) || []))];
            const selfTag = userId ? `<@${userId}>` : '';

            if (actionType === 'lfg_join' && selfTag && !mentions.includes(selfTag)) {
                if (mentions.length >= maxSlots) {
                    return ephemeralResp(res, { content: `⚠️ El lobby **${modeLabel}** ya completó los ${maxSlots} cupos.` });
                }
                mentions.push(selfTag);
            } else if (actionType === 'lfg_leave' && selfTag) {
                const idx = mentions.indexOf(selfTag);
                if (idx > -1) mentions.splice(idx, 1);
            }

            const statusLine = mentions.length >= maxSlots
                ? `🔥 **¡LOBBY LLENO (${mentions.length}/${maxSlots})!** Pasen a **halomatch.vercel.app** para equilibrar los equipos.`
                : `Armando lobby **${modeLabel}** para jugar parejos.`;

            return updateMessageResp(res, {
                embeds: [{
                    title: `🎮 Partida Personalizada ${modeLabel} • Halo Match`,
                    color: mentions.length >= maxSlots ? 0x10b981 : 0x06b6d4,
                    description: [
                        statusLine,
                        '',
                        `**Anotados (${mentions.length}/${maxSlots}):**`,
                        mentions.length ? mentions.map((m, idx) => `${idx + 1}. ${m}`).join('\n') : '_Nadie todavía_'
                    ].join('\n'),
                    footer: { text: 'Al completar cupos, entren a halomatch.vercel.app para balancear equipos' }
                }],
                components: [{
                    type: 1,
                    components: [
                        { type: 2, style: 3, label: 'Me apunto', emoji: { name: '✋' }, custom_id: `lfg_join:${maxSlots}:${modeLabel}` },
                        { type: 2, style: 4, label: 'Salirme', emoji: { name: '🚪' }, custom_id: `lfg_leave:${maxSlots}:${modeLabel}` },
                        { type: 2, style: 5, label: 'Balancear en Halo Match', url: 'https://halomatch.vercel.app' }
                    ]
                }]
            });
        }

        if (actionType === 'parcero_link') {
            return openLinkModalResp(res, parts[1] || 'ACTIVE');
        }

        if (actionType === 'parcero_report') {
            return handleReportMenu(res, { trnId: parts[1] || 'ACTIVE', userId, userGamertags });
        }

        if (actionType === 'parcero_score') {
            const [, trnId, matchId, scoreStr] = parts;
            const gt = userGamertags[userId];
            if (!gt) return openLinkModalResp(res, trnId || 'ACTIVE');

            const [sA, sB] = String(scoreStr || '').split('-').map((n) => parseInt(n, 10));
            const tournament = await findTournamentSmart(trnId);
            if (!tournament) return ephemeralResp(res, { content: `⚠️ No encontré el torneo **${trnId}**.` });

            const result = TEngine.submitInteractiveMatchScore(tournament, {
                matchId,
                scoreA: sA,
                scoreB: sB,
                authorId: userId,
                authorGamertag: gt
            }, Date.now());

            if (!result.ok) {
                return ephemeralResp(res, { content: result.message });
            }

            await saveTournamentAndWinners(tournament);

            const matchObj = (tournament.matches || []).find((m) => m.id === matchId);
            const teamA = tournament.teams.find((t) => t.id === (matchObj && matchObj.teamAId));
            const teamB = tournament.teams.find((t) => t.id === (matchObj && matchObj.teamBId));
            const winTeam = tournament.teams.find((t) => t.id === result.winnerId);
            const loseTeam = tournament.teams.find((t) => t.id === result.loserId);
            const bracketUrl = `https://halomatch.vercel.app/?torneo=${encodeURIComponent(tournament.id)}`;

            if (result.action === 'SEALED_IMMEDIATE') {
                await postChannelPayload(targetChannelId, botToken, {
                    embeds: [{
                        title: `✅ Resultado Oficial Sellado • ${tournament.id}`,
                        url: bracketUrl,
                        color: 0x10b981,
                        description: [
                            `⚔️ **${teamA ? teamA.name : 'Equipo A'}** \`${result.scoreA}\` - \`${result.scoreB}\` **${teamB ? teamB.name : 'Equipo B'}**`,
                            `🏆 **Avanza:** ${winTeam ? winTeam.name : ''}`,
                            `👤 **Reportado por el perdedor:** ${gt} (Bracket actualizado al instante).`,
                            `🔗 [Ver Bracket en vivo](${bracketUrl})`
                        ].join('\n'),
                        timestamp: new Date().toISOString()
                    }]
                });

                return updateMessageResp(res, {
                    content: `✅ **${result.message}**\nEl Bracket de **${tournament.id}** se actualizó al instante.`,
                    embeds: [],
                    components: []
                });
            }

            // CONFIRMING_OPENED: espera 5 minutos o confirmación del equipo perdedor
            await postChannelPayload(targetChannelId, botToken, {
                embeds: [{
                    title: `⏳ Confirmación Requerida (5 min) • ${tournament.id}`,
                    url: bracketUrl,
                    color: 0xf59e0b,
                    description: [
                        `⚔️ **${teamA ? teamA.name : 'Equipo A'}** \`${result.scoreA}\` - \`${result.scoreB}\` **${teamB ? teamB.name : 'Equipo B'}**`,
                        `👤 **Reportado por (ganador):** ${gt} (${winTeam ? winTeam.name : ''})`,
                        '',
                        `🔔 **${loseTeam ? loseTeam.name : 'Equipo Rival'}**: pulsa **✅ Confirmar** para sellar al instante o **⚠️ Disputar** si hay error. *(Sin objeciones se sella automáticamente en 5 minutos).*`
                    ].join('\n'),
                    timestamp: new Date().toISOString()
                }],
                components: buildConfirmationButtons(tournament.id, matchId)
            });

            return updateMessageResp(res, {
                content: `⏳ **Reporte enviado al canal.** Esperando confirmación de **${loseTeam ? loseTeam.name : 'equipo rival'}** (ventana de 5 minutos).`,
                embeds: [],
                components: []
            });
        }

        if (actionType === 'parcero_confirm' || actionType === 'parcero_dispute') {
            const [, trnId, matchId] = parts;
            const gt = userGamertags[userId];
            if (!gt) {
                return ephemeralResp(res, {
                    content: '⚠️ Primero vincula tu Gamertag pulsando **🔗 Vincular Gamertag** o escribiendo `/vincular` para verificar que perteneces al equipo perdedor.'
                });
            }

            const tournament = await findTournamentSmart(trnId);
            if (!tournament) return ephemeralResp(res, { content: `⚠️ No encontré el torneo **${trnId}**.` });

            const op = actionType === 'parcero_dispute' ? 'dispute' : 'confirm';
            const resOp = TEngine.confirmOrDisputeMatch(tournament, {
                matchId,
                action: op,
                authorId: userId,
                authorGamertag: gt
            }, Date.now());

            if (!resOp.ok) {
                return ephemeralResp(res, { content: resOp.message });
            }

            await saveTournamentAndWinners(tournament);
            const bracketUrl = `https://halomatch.vercel.app/?torneo=${encodeURIComponent(tournament.id)}`;
            const isConfirmed = resOp.action === 'CONFIRMED_SEALED';

            return updateMessageResp(res, {
                embeds: [{
                    title: isConfirmed
                        ? `✅ Resultado Confirmado y Sellado • ${tournament.id}`
                        : `⚠️ Marcador Disputado • ${tournament.id}`,
                    url: bracketUrl,
                    color: isConfirmed ? 0x10b981 : 0xef4444,
                    description: `${resOp.message}\n🔗 [Ver Bracket en vivo](${bracketUrl})`,
                    timestamp: new Date().toISOString()
                }],
                components: []
            });
        }
    }

    return ephemeralResp(res, { content: '⚠️ Interacción no soportada.' });
}
