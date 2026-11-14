// ============================================================================
// UNSC TAC-BALANCER V2 — VERCEL SERVERLESS FUNCTION (api/ai-coach.js)
// Conector seguro para Gemini API Free Tier ($0 USD) usando exclusivamente
// variables de entorno (process.env.GEMINI_API_KEY). Cero claves en código.
// Si no hay API Key o se alcanza el límite de cuota, responde con fallback: true
// para que el cliente ejecute el Motor Determinista Táctico V2 sin interrupción.
// ============================================================================

export default async function handler(req, res) {
    // Cabeceras CORS básicas para entorno Vercel / Preview
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(200).json({
            ok: false,
            fallback: true,
            reason: 'METHOD_NOT_ALLOWED'
        });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
        return res.status(200).json({
            ok: false,
            fallback: true,
            reason: 'NO_API_KEY'
        });
    }

    let body = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            body = {};
        }
    }
    body = body || {};

    const {
        gamertag = 'Spartan',
        stats = {},
        roleAnalysis = {},
        mapKey = 'streets',
        focusProfile = 'auto',
        matchSynergy = null
    } = body;

    const systemPrompt = `Eres el Coach Táctico Principal de Halo Infinite (4v4 Ranked Arena HCS, inicios con Bandit Evo, tiempos de respawn de 10s, control de Power Weapons/Equipment y anclas de spawns).
Hablas en español de Colombia claro, directo y motivador, orientado a jugadores competitivos del clan Mansalvas.
REGLA ESTRICTA DE CERO DATOS INVENTADOS: Nunca inventes estadísticas ni supongas cifras que vengan en null o ausentes en el JSON. Si un dato (como Accuracy, Shots Fired, Damage Taken o CSR) es null, indícalo como "N/D (Sin lectura)" o limita tu análisis únicamente a las métricas reales confirmadas.
Fórmula oficial del clan: 60% KDR + 20% Rango Arena CSR + 20% Daño por Partida (Rango SS exige KDR > 1.25, Onyx 1500+ CSR si hay CSR y 4,200+ DMG si hay Daño).
Devuelve EXCLUSIVAMENTE un objeto JSON válido con las siguientes claves exactas:
{
  "strengths": "Resumen de su pilar más fuerte y rol competitivo usando solo métricas confirmadas (1-2 oraciones)",
  "weakness": "Diagnóstico directo del eslabón limitante hacia Rango SS (>1.25 KDR, Onyx 1500+ CSR y 4,200+ DMG) (1-2 oraciones)",
  "readingAnalysis": "Análisis de eficiencia y conversión con base en KDR, Damage y datos balísticos confirmados (2-3 oraciones)",
  "positioningAdvice": "Consejo táctico de posicionamiento 4v4 Ranked Arena (alturas, Buddy System y control de spawns) (2-3 oraciones)",
  "communicationAdvice": "Protocolo de callouts de 3 segundos, ping y trabajo en binomio según su rol (2-3 oraciones)",
  "configAdvice": "Recomendación de FOV, sensibilidad H/V, aceleración y deadzones (si acc es null, da una configuración base equilibrada para Bandit Evo sin inventar su porcentaje) (2 oraciones)",
  "day1": "DÍA 1 • TÍTULO: Ejercicio accionable con meta numérica para el Día 1",
  "day2": "DÍA 2 • TÍTULO: Ejercicio accionable con meta numérica para el Día 2",
  "day3": "DÍA 3 • TÍTULO: Ejercicio accionable con meta numérica para el Día 3",
  "synergySummary": "Análisis opcional de sinergia Eagle vs Cobra si hay partida activa (o string vacío)"
}`;

    const userPayload = {
        gamertag,
        mapKey,
        focusProfile,
        stats: {
            pts: stats.pts,
            rank: stats.rank,
            kd: stats.kd,
            csr: stats.csr,
            dmgPerMatch: stats.dmgPerMatch,
            dmgTakenPerMatch: stats.dmgTakenPerMatch,
            totalDamage: stats.totalDamage,
            shotsFired: stats.shotsFired,
            shotsFiredPerMatch: stats.shotsFiredPerMatch,
            shotsHit: stats.shotsHit,
            acc: stats.acc,
            hsPct: stats.hsPct,
            winRate: stats.winRate,
            killsPerMatch: stats.killsPerMatch,
            deathsPerMatch: stats.deathsPerMatch,
            assistsPerMatch: stats.assistsPerMatch,
            kdScore: stats.kdScore,
            csrScore: stats.csrScore,
            dmgScore: stats.dmgScore,
            modes: stats.modes || null,
            telemetryConfidence: stats.telemetryConfidence ?? stats.confidencePct
        },
        roleAnalysis,
        matchSynergy
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text: `Genera el expediente táctico JSON para este Spartan en Halo Infinite:\n${JSON.stringify(userPayload)}`
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.35,
                    maxOutputTokens: 1100,
                    responseMimeType: 'application/json'
                }
            })
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
            return res.status(200).json({
                ok: false,
                fallback: true,
                reason: 'RATE_LIMITED_429'
            });
        }

        if (!response.ok) {
            return res.status(200).json({
                ok: false,
                fallback: true,
                reason: `HTTP_${response.status}`
            });
        }

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
            return res.status(200).json({
                ok: false,
                fallback: true,
                reason: 'EMPTY_MODEL_RESPONSE'
            });
        }

        const parsedAdvice = JSON.parse(rawText);
        return res.status(200).json({
            ok: true,
            fallback: false,
            model: 'gemini-2.5-flash',
            data: parsedAdvice
        });
    } catch (err) {
        clearTimeout(timeoutId);
        return res.status(200).json({
            ok: false,
            fallback: true,
            reason: err?.name === 'AbortError' ? 'TIMEOUT_7000MS' : 'NETWORK_OR_PARSE_ERROR'
        });
    }
}
