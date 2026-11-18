// ============================================================================
// UNSC TAC-BALANCER V2 — VERCEL SERVERLESS FUNCTION (api/discord-launch.js)
// Envía el Embed limpio del torneo + hasta 5 banners PNG a DISCORD_WEBHOOK_URL
// y fija (Pin) el mensaje por 12 horas usando DISCORD_BOT_TOKEN.
// ============================================================================

function decodeDataUrlToBuffer(dataUrl) {
    const match = String(dataUrl || '').match(/^data:image\/[a-z0-9+.-]+;base64,(.+)$/i);
    if (!match) return null;
    return Buffer.from(match[1], 'base64');
}

function normalizeBannerFileName(phaseKey) {
    const slug = String(phaseKey || 'fase')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return slug.startsWith('mapas-') ? `${slug}.png` : `mapas-${slug}.png`;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
    }

    const webhookUrlRaw = process.env.DISCORD_WEBHOOK_URL || '';
    const botToken = process.env.DISCORD_BOT_TOKEN || '';
    const defaultChannelId = process.env.DISCORD_CHANNEL_ID || '';

    if (!webhookUrlRaw) {
        return res.status(200).json({ ok: false, reason: 'MISSING_WEBHOOK_URL' });
    }

    const body = (typeof req.body === 'string') ? JSON.parse(req.body || '{}') : (req.body || {});
    const tournament = body.tournament || body;
    if (!tournament || !tournament.id) {
        return res.status(400).json({ ok: false, error: 'MISSING_TOURNAMENT_ID' });
    }

    const trnId = String(tournament.id).toUpperCase();
    const originHeader = req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : '');
    const baseOrigin = body.publicOrigin || originHeader || 'https://halomatch.vercel.app';
    const publicUrl = `${String(baseOrigin).replace(/\/$/, '')}/?torneo=${encodeURIComponent(trnId)}`;

    const attachments = [];
    const bannersInput = body.phaseBannerImages || tournament.phaseBannerImages;
    if (Array.isArray(bannersInput)) {
        for (const item of bannersInput) {
            if (attachments.length >= 5) break;
            const buf = decodeDataUrlToBuffer(item && (item.dataUrl || item.url || item));
            if (!buf) continue;
            const fileName = item.fileName || normalizeBannerFileName(item.phase || item.name || `fase-${attachments.length + 1}`);
            attachments.push({ buf, fileName });
        }
    } else if (bannersInput && typeof bannersInput === 'object') {
        for (const [phaseKey, val] of Object.entries(bannersInput)) {
            if (attachments.length >= 5) break;
            const dataUrl = typeof val === 'string' ? val : (val && (val.dataUrl || val.url));
            const buf = decodeDataUrlToBuffer(dataUrl);
            if (!buf) continue;
            attachments.push({ buf, fileName: normalizeBannerFileName(phaseKey) });
        }
    }

    const embed = {
        title: `🏆 ${tournament.name || 'Torneo HCS'} • ${trnId}`,
        url: publicUrl,
        color: 0x06b6d4,
        description: [
            `🔗 **Consulta aquí el Bracket:** ${publicUrl}`,
            `⚔️ **Formato:** ${tournament.format || '4v4'} • **Serie:** Bo${tournament.bestOf || 3} • **Eliminación:** ${tournament.elimination === 'double' ? 'Doble' : 'Simple'}`,
            '',
            `🤖 **Reportar resultado a Parcero:** \`Parcero ${trnId} Equipo A 2-1 Equipo B\` (vincula primero: \`Parcero soy TuGamertag\`)`,
            '🎧 **Únete al Discord oficial:** https://discord.gg/3K4PCc3YU'
        ].join('\n'),
        footer: { text: `UNSC Tac-Balancer V2 • ${trnId}` },
        timestamp: new Date().toISOString()
    };

    const form = new FormData();
    form.append('payload_json', JSON.stringify({
        username: 'Parcero • UNSC Arbiter',
        embeds: [embed]
    }));

    attachments.forEach((att, idx) => {
        const blob = new Blob([att.buf], { type: 'image/png' });
        form.append(`files[${idx}]`, blob, att.fileName);
    });

    const waitUrl = webhookUrlRaw.includes('?') ? `${webhookUrlRaw}&wait=true` : `${webhookUrlRaw}?wait=true`;

    try {
        const whRes = await fetch(waitUrl, { method: 'POST', body: form });
        if (!whRes.ok) {
            const errTxt = await whRes.text().catch(() => '');
            return res.status(502).json({ ok: false, status: whRes.status, error: errTxt.slice(0, 200) });
        }

        const msgData = await whRes.json().catch(() => ({}));
        const channelId = msgData.channel_id || defaultChannelId;
        const messageId = msgData.id || null;
        let discordPin = null;

        if (channelId && messageId && botToken) {
            const pinRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/pins/${messageId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bot ${botToken}` }
            });
            if (pinRes.ok) {
                discordPin = {
                    channelId,
                    messageId,
                    unpinAt: Date.now() + 43200000
                };
            }
        }

        return res.status(200).json({
            ok: true,
            tournamentId: trnId,
            webhookSent: true,
            attachedMaps: attachments.length,
            pinned: Boolean(discordPin),
            discordPin
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
}
