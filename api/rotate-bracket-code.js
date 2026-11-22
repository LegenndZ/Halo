// ============================================================================
// UNSC TAC-BALANCER V2 — VERCEL SERVERLESS FUNCTION (api/rotate-bracket-code.js)
// Genera un código aleatorio de 6 dígitos vigente por 6 horas, guarda su hash
// en Firestore (tournamentMeta/bracketTempAuth) y lo envía por Resend al correo
// configurado en ADMIN_NOTIFY_EMAIL (ronaldf18@hotmail.com).
// ============================================================================

import crypto from 'node:crypto';

const FIRESTORE_META_DOC = 'https://firestore.googleapis.com/v1/projects/halomatch-d9240/databases/(default)/documents/artifacts/halomatch-d9240/public/data/tournamentMeta/bracketTempAuth';
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function formatColombiaTime(ms) {
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date(ms));
}

function hashTempCode(secret, code) {
    return crypto.createHash('sha256').update(`${secret}:${code}`).digest('hex');
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
    }

    const cronSecret = String(process.env.CRON_ROTATE_SECRET || '').trim();
    const resendKey = String(process.env.RESEND_API_KEY || '').trim();
    const targetEmail = String(process.env.ADMIN_NOTIFY_EMAIL || 'ronaldf18@hotmail.com').trim();

    if (!cronSecret) {
        return res.status(500).json({ ok: false, error: 'CRON_ROTATE_SECRET_NOT_CONFIGURED' });
    }
    if (!resendKey) {
        return res.status(500).json({ ok: false, error: 'RESEND_API_KEY_NOT_CONFIGURED' });
    }

    const headerSecret = String(req.headers['x-cron-secret'] || '').trim();
    const authHeader = String(req.headers['authorization'] || '').trim();
    const bearerSecret = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const provided = headerSecret || bearerSecret;

    const a = Buffer.from(provided);
    const b = Buffer.from(cronSecret);
    if (!provided || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const now = Date.now();
    const expiresAt = now + SIX_HOURS_MS;
    const codeHash = hashTempCode(cronSecret, code);

    // 1. Guardar hash y vencimiento (+6h) en Firestore (invalida el código anterior)
    const fsBody = {
        fields: {
            codeHash: { stringValue: codeHash },
            createdAt: { integerValue: String(now) },
            expiresAt: { integerValue: String(expiresAt) },
            windowHours: { integerValue: '6' }
        }
    };

    const fsRes = await fetch(FIRESTORE_META_DOC, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fsBody)
    });

    if (!fsRes.ok) {
        const fsErr = await fsRes.text().catch(() => '');
        return res.status(502).json({ ok: false, error: 'FIRESTORE_SAVE_FAILED', detail: fsErr.slice(0, 300) });
    }

    // 2. Enviar correo vía Resend únicamente al correo configurado
    const createdStr = formatColombiaTime(now);
    const expiresStr = formatColombiaTime(expiresAt);

    const html = `
        <div style="font-family: Arial, sans-serif; background:#0b0e14; color:#e2e8f0; padding:24px; border-radius:12px; border:1px solid #c9a255; max-width:480px;">
            <div style="font-size:12px; letter-spacing:2px; color:#c9a255; font-weight:bold; text-transform:uppercase;">HALO MATCH · ACCESO TEMPORAL BRACKET</div>
            <h2 style="margin:10px 0 6px; color:#ffffff;">Clave Temporal de Operador</h2>
            <p style="margin:0 0 18px; color:#94a3b8; font-size:14px;">
                Este código de 6 dígitos solo permite <strong>mover equipos/jugadores y editar marcadores</strong> en el Bracket de Torneo. No permite crear ni cancelar torneos ni modificar el tráiler.
            </p>
            <div style="background:#131822; border:2px solid #facc15; border-radius:10px; padding:18px; text-align:center; margin:16px 0;">
                <div style="font-size:11px; color:#94a3b8; letter-spacing:2px; margin-bottom:6px;">CÓDIGO ACTIVO (6 HORAS)</div>
                <div style="font-size:38px; font-weight:900; letter-spacing:8px; color:#facc15; font-family:monospace;">${code}</div>
            </div>
            <p style="margin:8px 0; font-size:13px; color:#cbd5e1;">
                <strong>Generado:</strong> ${createdStr} (Hora Colombia)<br>
                <strong>Expira exactamente:</strong> ${expiresStr} (Hora Colombia)
            </p>
            <p style="margin:16px 0 0; font-size:11px; color:#64748b;">
                Al cumplirse las 6 horas se genera uno nuevo automáticamente y este deja de funcionar.
            </p>
        </div>
    `;

    const mailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: 'Halo Match <onboarding@resend.dev>',
            to: [targetEmail],
            subject: 'clave temporal Halo Match',
            html
        })
    });

    const mailJson = await mailRes.json().catch(() => ({}));
    if (!mailRes.ok) {
        return res.status(502).json({ ok: false, error: 'RESEND_SEND_FAILED', detail: mailJson });
    }

    return res.status(200).json({
        ok: true,
        sentTo: targetEmail,
        emailId: mailJson.id || null,
        createdAt: now,
        expiresAt
    });
}
