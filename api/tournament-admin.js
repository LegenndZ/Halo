// ============================================================================
// UNSC TAC-BALANCER V2 — VERCEL SERVERLESS FUNCTION (api/tournament-admin.js)
// Verifica la clave de administrador de Torneo contra process.env.TOURNAMENT_ADMIN_KEY.
// ============================================================================

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

    const adminKey = process.env.TOURNAMENT_ADMIN_KEY || '';
    if (!adminKey) {
        return res.status(500).json({ ok: false, error: 'ADMIN_KEY_NOT_CONFIGURED' });
    }

    const body = (typeof req.body === 'string') ? JSON.parse(req.body || '{}') : (req.body || {});
    const candidate = String(body.key || body.password || '').trim();
    const valid = Boolean(candidate && candidate === adminKey);

    return res.status(valid ? 200 : 401).json({
        ok: valid,
        error: valid ? null : 'INVALID_KEY'
    });
}
