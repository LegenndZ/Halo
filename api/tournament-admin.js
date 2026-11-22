// ============================================================================
// UNSC TAC-BALANCER V2 — VERCEL SERVERLESS FUNCTION (api/tournament-admin.js)
// Verifica:
//   1. Clave maestra (TOURNAMENT_ADMIN_KEY) -> role: 'master' (control total)
//   2. Código temporal de 6 dígitos (tournamentMeta/bracketTempAuth, 6h)
//      -> role: 'bracket_operator' (solo mover jugadores y marcadores del bracket)
// ============================================================================

import crypto from 'node:crypto';

const FIRESTORE_META_DOC = 'https://firestore.googleapis.com/v1/projects/halomatch-d9240/databases/(default)/documents/artifacts/halomatch-d9240/public/data/tournamentMeta/bracketTempAuth';

function safeEquals(aStr, bStr) {
    const a = Buffer.from(String(aStr || ''));
    const b = Buffer.from(String(bStr || ''));
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
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

    const adminKey = String(process.env.TOURNAMENT_ADMIN_KEY || '').trim();
    const cronSecret = String(process.env.CRON_ROTATE_SECRET || '').trim();

    if (!adminKey && !cronSecret) {
        return res.status(500).json({ ok: false, error: 'ADMIN_KEY_NOT_CONFIGURED' });
    }

    const body = (typeof req.body === 'string') ? JSON.parse(req.body || '{}') : (req.body || {});
    const candidate = String(body.key || body.password || '').trim();

    if (!candidate) {
        return res.status(401).json({ ok: false, error: 'INVALID_KEY' });
    }

    // 1. Verificar clave maestra (acceso completo)
    if (adminKey && safeEquals(candidate, adminKey)) {
        return res.status(200).json({
            ok: true,
            role: 'master',
            expiresAt: null
        });
    }

    // 2. Verificar código temporal de 6 dígitos (solo operador de bracket por 6 horas)
    if (cronSecret && /^\d{6}$/.test(candidate)) {
        try {
            const fsRes = await fetch(`${FIRESTORE_META_DOC}?t=${Date.now()}`, { cache: 'no-store' });
            if (fsRes.ok) {
                const doc = await fsRes.json();
                const fields = doc?.fields || {};
                const storedHash = String(fields.codeHash?.stringValue || '');
                const expiresAt = Number(fields.expiresAt?.integerValue || 0);

                if (storedHash && expiresAt > 0) {
                    if (Date.now() >= expiresAt) {
                        return res.status(401).json({ ok: false, error: 'TEMP_CODE_EXPIRED' });
                    }
                    const candidateHash = crypto.createHash('sha256').update(`${cronSecret}:${candidate}`).digest('hex');
                    if (safeEquals(candidateHash, storedHash)) {
                        return res.status(200).json({
                            ok: true,
                            role: 'bracket_operator',
                            expiresAt
                        });
                    }
                }
            }
        } catch (e) {
            return res.status(500).json({ ok: false, error: 'TEMP_VERIFY_ERROR' });
        }
    }

    return res.status(401).json({
        ok: false,
        error: 'INVALID_KEY'
    });
}
