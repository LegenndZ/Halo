// ============================================================================
// AI-COACH.JS — MOTOR TÁCTICO COMPETITIVO V2 (HALO INFINITE 4V4 RANKED ARENA)
// Clasificador de Rol HCS + Analizador de Sinergia Eagle vs Cobra +
// Telemetría Balística & Modos Ranked Arena + Arquitectura Híbrida $0 USD
// ============================================================================
(function() {
'use strict';

const COACH_V2_CACHE_KEY = 'mansalvas_coach_v2_cache';
const COACH_V2_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const COACH_RATE_LIMIT_MAX = 12; // Máximo 12 peticiones IA por minuto
const COACH_RATE_WINDOW_MS = 60 * 1000;

let coachRateTimestamps = [];

function clampNumber(val, min, max) {
    return Math.max(min, Math.min(max, Number(val) || 0));
}

function parseNormalizedMetricNumber(val) {
    if (val === null || val === undefined || val === '') return NaN;
    return Number(String(val).trim().replace(',', '.'));
}

function numOrNull(val) {
    const n = parseNormalizedMetricNumber(val);
    return Number.isFinite(n) ? n : null;
}

function fmtOpt(val, suffix = '') {
    const n = numOrNull(val);
    return n !== null ? `${n}${suffix}` : 'N/D (Sin lectura)';
}

function fmtOptShort(val, suffix = '') {
    const n = numOrNull(val);
    return n !== null ? `${n}${suffix}` : 'N/D';
}

// ============================================================================
// 1. CLASIFICADOR MATEMÁTICO DE ROL COMPETITIVO HCS (4 ROLES)
// ============================================================================
window.classifyCompetitiveRole = function(stats) {
    if (!stats) return null;

    const kd = numOrNull(stats.kd) ?? 1.0;
    const dmgPerMatch = numOrNull(stats.dmgPerMatch);
    const csr = numOrNull(stats.csr);
    const acc = numOrNull(stats.acc);
    const killsPerMatch = numOrNull(stats.killsPerMatch);
    const deathsPerMatch = numOrNull(stats.deathsPerMatch);
    const assistsPerMatch = numOrNull(stats.assistsPerMatch);
    const dmgTakenPerMatch = numOrNull(stats.dmgTakenPerMatch);
    const avgLifeSeconds = numOrNull(stats.avgLifeSeconds);
    const winRate = numOrNull(stats.winRate);

    const hasKda = killsPerMatch !== null && assistsPerMatch !== null;
    const assistRatio = hasKda ? (assistsPerMatch / Math.max(1, killsPerMatch + assistsPerMatch)) : null;
    const dmgEfficiencyRatio = (dmgPerMatch !== null && dmgTakenPerMatch !== null)
        ? (dmgPerMatch / Math.max(1500, dmgTakenPerMatch))
        : null;

    // Normalizaciones en escala 0 a 100 (solo sobre métricas reales; las ausentes usan neutro 50 sin inventar datos en UI)
    const kdNorm = clampNumber(((kd - 0.65) / 0.85) * 100, 15, 100);
    const dmgNorm = dmgPerMatch !== null ? clampNumber(((dmgPerMatch - 2000) / 2800) * 100, 15, 100) : 50;
    const killsNorm = killsPerMatch !== null ? clampNumber(((killsPerMatch - 9) / 9) * 100, 15, 100) : kdNorm;
    const accNorm = acc !== null ? clampNumber(((acc - 38) / 22) * 100, 20, 100) : 50;
    const survivalNorm = avgLifeSeconds !== null ? clampNumber(((avgLifeSeconds - 24) / 20) * 100, 15, 100) : kdNorm;
    const assistNorm = assistRatio !== null ? clampNumber(((assistRatio - 0.22) / 0.28) * 100, 20, 100) : 50;
    const effNorm = dmgEfficiencyRatio !== null ? clampNumber(((dmgEfficiencyRatio - 0.75) / 0.55) * 100, 20, 100) : kdNorm;
    const winNorm = winRate !== null ? clampNumber(((winRate - 40) / 25) * 100, 20, 100) : 50;
    const csrNorm = csr !== null ? clampNumber(((csr - 750) / 950) * 100, 15, 100) : 50;

    // Puntajes crudos de los 4 arquetipos HCS
    const slayerRaw = Math.round(
        kdNorm * 0.36 +
        killsNorm * 0.26 +
        dmgNorm * 0.22 +
        accNorm * 0.16 +
        (kd >= 1.15 && killsPerMatch !== null && killsPerMatch >= 14.5 ? 7 : 0)
    );

    const anchorRaw = Math.round(
        survivalNorm * 0.28 +
        assistNorm * 0.26 +
        effNorm * 0.24 +
        accNorm * 0.22 +
        (deathsPerMatch !== null && deathsPerMatch <= 11.5 && assistsPerMatch !== null && assistsPerMatch >= 7.2 ? 6 : 0)
    );

    const objectiveRaw = Math.round(
        winNorm * 0.30 +
        assistNorm * 0.25 +
        survivalNorm * 0.23 +
        csrNorm * 0.22 +
        (assistRatio !== null && assistRatio >= 0.36 ? 5 : 0)
    );

    // El Flex premia equilibrio en los 3 pilares (baja desviación entre KD, CSR y DMG)
    const pillarSpread = Math.abs(kdNorm - dmgNorm) + Math.abs(kdNorm - csrNorm);
    const balanceBonus = clampNumber(100 - pillarSpread * 0.65, 35, 98);
    const flexRaw = Math.round(
        balanceBonus * 0.35 +
        dmgNorm * 0.25 +
        kdNorm * 0.20 +
        assistNorm * 0.20
    );

    const roleCatalog = [
        {
            key: 'slayer',
            title: 'Slayer Principal (Main Slayer)',
            shortTitle: 'SLAYER PRINCIPAL',
            icon: 'fa-crosshairs',
            colorText: 'text-rose-300',
            colorBorder: 'border-rose-400/60',
            colorBg: 'bg-rose-500/15',
            hexColor: '#fb7185',
            scorePct: clampNumber(slayerRaw, 42, 99),
            complementaryKey: 'anchor',
            complementaryLabel: 'Support / Anchor (Ancla de Spawns)',
            tacticalMission: 'Abrir bajas de entrada (Entry Picks), limpiar escudos rotos y controlar los timers de armas de poder cada 120s.',
            weaponPriority: 'Cohete M41, Francotirador S7, Espada de Energía y flanqueo con Camuflaje Activo.',
            spawnRule: 'Empuja tras conseguir 2 bajas rivales mientras tu Ancla sostiene la reaparición trasera.'
        },
        {
            key: 'anchor',
            title: 'Support / Anchor (Ancla de Spawns)',
            shortTitle: 'SUPPORT / ANCHOR',
            icon: 'fa-shield-halved',
            colorText: 'text-cyan-300',
            colorBorder: 'border-cyan-400/60',
            colorBg: 'bg-cyan-500/15',
            hexColor: '#00e5ff',
            scorePct: clampNumber(anchorRaw, 42, 99),
            complementaryKey: 'slayer',
            complementaryLabel: 'Slayer Principal (Main Slayer)',
            tacticalMission: 'Sostener las posiciones elevadas (High Ground), poner daño inicial en área (Crossfire) y asegurar respawns favorables para tu escuadra.',
            weaponPriority: 'Bandit Evo en alturas, Rifle de Batalla/Comando, Repulsor y Sensor de Amenaza.',
            spawnRule: 'Prohibido sobre-extenderte al spawn enemigo: tu vida garantiza que tu equipo nazca cerca del objetivo.'
        },
        {
            key: 'objective',
            title: 'Objective / IGL (Estratega & Portador)',
            shortTitle: 'OBJECTIVE / IGL',
            icon: 'fa-flag-checkered',
            colorText: 'text-emerald-300',
            colorBorder: 'border-emerald-400/60',
            colorBg: 'bg-emerald-500/15',
            hexColor: '#10b981',
            scorePct: clampNumber(objectiveRaw, 42, 99),
            complementaryKey: 'slayer',
            complementaryLabel: 'Slayer Principal o Flex de Escolta',
            tacticalMission: 'Dirigir las rotaciones 15s antes del objetivo, acumular segundos de Bola Loca (Oddball), correr banderas y coordinar el focus fire por voz.',
            weaponPriority: 'Sobreescudo (Overshield), Repulsor, Granadas Dinamo y armas cortas de defensa en objetivo.',
            spawnRule: 'Juega siempre rodeado por al menos 1 escolta; suelta el objetivo (Play Ball) 2 segundos antes de que el rival entre a tu sala.'
        },
        {
            key: 'flex',
            title: 'Flex / Roamer (Pivote Multiuso)',
            shortTitle: 'FLEX / ROAMER',
            icon: 'fa-bolt',
            colorText: 'text-amber-300',
            colorBorder: 'border-amber-400/60',
            colorBg: 'bg-amber-500/15',
            hexColor: '#f59e0b',
            scorePct: clampNumber(flexRaw, 45, 99),
            complementaryKey: 'anchor',
            complementaryLabel: 'Support / Anchor o Objective IGL',
            tacticalMission: 'Cerrar brechas entre el Slayer y el Ancla, cobrar intercambios de bajas (Trades 1x1) al instante y rotar rápido a donde falte fuego.',
            weaponPriority: 'Bandit Evo, Granadas de Fragmentación/Plasma, Gancho (Grappleshot) y Propulsor.',
            spawnRule: 'Lee el feed de bajas cada 3 segundos: si cae tu Slayer, toma su ángulo agresivo; si cae tu Ancla, retrocede a proteger el spawn.'
        }
    ].sort((a, b) => b.scorePct - a.scorePct);

    const primaryRole = roleCatalog[0];
    const secondaryRole = roleCatalog[1];

    // Buscar el compañero ideal de Dúo dentro de window.roster
    let idealDuoPartner = null;
    const rosterList = Array.isArray(window.roster) ? window.roster : [];
    const selfNorm = typeof window.normalizeSpartanKey === 'function'
        ? window.normalizeSpartanKey(stats.gamertag || '')
        : String(stats.gamertag || '').toLowerCase();

    if (rosterList.length > 1) {
        const selfPts = Number(stats.pts) || 12;
        const candidates = rosterList
            .filter(p => {
                const k = typeof window.normalizeSpartanKey === 'function' ? window.normalizeSpartanKey(p.name) : String(p.name).toLowerCase();
                return k && k !== selfNorm;
            })
            .map(p => {
                const pKey = typeof window.normalizeSpartanKey === 'function' ? window.normalizeSpartanKey(p.name) : '';
                const cached = window.verifiedProfilesCache && pKey ? window.verifiedProfilesCache[pKey] : null;
                const est = cached || (typeof window.estimateDetailedTelemetryFromPts === 'function'
                    ? window.estimateDetailedTelemetryFromPts(p.pts, p.name)
                    : { kd: Number((0.68 + p.pts * 0.028).toFixed(2)), dmgPerMatch: 2100 + p.pts * 110, csr: 650 + p.pts * 42 });

                // Clasificación rápida ligera del candidato
                const cKd = Number(est.kd) || 1.0;
                const cDmg = Number(est.dmgPerMatch) || 3200;
                let cRole = 'flex';
                if (cKd >= 1.15 && cDmg >= 3700) cRole = 'slayer';
                else if (cKd >= 1.0 && cDmg >= 3300) cRole = 'anchor';
                else if (p.pts >= 14) cRole = 'flex';
                else cRole = 'objective';

                const isComplementary = cRole === primaryRole.complementaryKey;
                const ptsDiff = Math.abs((Number(p.pts) || 12) - selfPts);
                const synergyScore = (isComplementary ? 35 : 15) + Math.max(0, 25 - ptsDiff * 2.2);

                return {
                    name: p.name,
                    pts: p.pts,
                    rank: p.rank || (typeof window.calculateRankFromPts === 'function' ? window.calculateRankFromPts(p.pts) : 'B+'),
                    roleKey: cRole,
                    synergyScore
                };
            })
            .sort((a, b) => b.synergyScore - a.synergyScore);

        if (candidates.length > 0) {
            idealDuoPartner = candidates[0];
        }
    }

    return {
        primaryRole,
        secondaryRole,
        allRoles: roleCatalog,
        idealDuoPartner
    };
};

// Obtiene las estadísticas detalladas de un miembro del roster (usando caché verificada o estimador matemático)
function resolveSquadMemberTelemetry(playerObj) {
    const name = playerObj?.name || playerObj?.gamertag || 'Spartan';
    const pts = Number(playerObj?.pts) || 12;
    const rank = playerObj?.rank || (typeof window.calculateRankFromPts === 'function' ? window.calculateRankFromPts(pts) : 'B+');
    const normKey = typeof window.normalizeSpartanKey === 'function' ? window.normalizeSpartanKey(name) : name.toLowerCase();

    const cached = (window.verifiedProfilesCache && normKey && window.verifiedProfilesCache[normKey])
        ? window.verifiedProfilesCache[normKey]
        : null;

    const est = typeof window.estimateDetailedTelemetryFromPts === 'function'
        ? window.estimateDetailedTelemetryFromPts(pts, name)
        : {
            csr: Math.round(620 + pts * 44),
            kd: Number((0.68 + pts * 0.028).toFixed(2)),
            dmgPerMatch: Math.round(2150 + pts * 108),
            acc: Number((41 + pts * 0.65).toFixed(1)),
            hsPct: Number((46 + pts * 0.65).toFixed(1)),
            killsPerMatch: Number((9.5 + pts * 0.35).toFixed(1)),
            deathsPerMatch: 12.2,
            assistsPerMatch: Number((5.2 + pts * 0.22).toFixed(1)),
            winRate: Number((44 + pts * 0.7).toFixed(1))
        };

    const fullStats = {
        ...est,
        ...(cached || {}),
        gamertag: name,
        name,
        pts,
        rank
    };

    const roleInfo = window.classifyCompetitiveRole(fullStats);
    return {
        ...fullStats,
        roleInfo
    };
}

// ============================================================================
// 2. ANALIZADOR DE SINERGIA Y EMPAREJAMIENTOS DE ESCUADRA (EAGLE VS COBRA)
// ============================================================================
function resolveActiveMatchData() {
    if (window.currentMatchData && Array.isArray(window.currentMatchData.eagle) && Array.isArray(window.currentMatchData.cobra)) {
        return window.currentMatchData;
    }
    try {
        // Fallback: reconstruir desde el DOM si #teamsResultContainer está visible
        const resultContainer = document.getElementById('teamsResultContainer');
        if (resultContainer && !resultContainer.classList.contains('hidden')) {
            const eagleEls = document.querySelectorAll('#eagleTeamList > div');
            const cobraEls = document.querySelectorAll('#cobraTeamList > div');
            if (eagleEls.length > 0 && cobraEls.length > 0) {
                const parseDomTeam = (nodeList) => Array.from(nodeList).map(el => {
                    const nameText = el.querySelector('span')?.innerText?.trim() || 'Spartan';
                    const rosterHit = (window.roster || []).find(p => p.name === nameText);
                    if (rosterHit) return rosterHit;
                    return { name: nameText, pts: 12, rank: 'B+' };
                });
                const eagle = parseDomTeam(eagleEls);
                const cobra = parseDomTeam(cobraEls);
                const eaglePts = eagle.reduce((acc, p) => acc + (Number(p.pts) || 0), 0);
                const cobraPts = cobra.reduce((acc, p) => acc + (Number(p.pts) || 0), 0);
                return {
                    eagle,
                    cobra,
                    eaglePts,
                    cobraPts,
                    diff: Math.abs(eaglePts - cobraPts),
                    mode: eagle.length + cobra.length,
                    code: document.getElementById('matchCodeValue')?.innerText || 'LIVE'
                };
            }
        }
    } catch (e) {}
    return null;
}

window.analyzeCurrentMatchSynergy = function(matchOverride = null) {
    const match = matchOverride || resolveActiveMatchData();
    if (!match || !Array.isArray(match.eagle) || !Array.isArray(match.cobra) || match.eagle.length === 0) {
        return null;
    }

    const analyzeTeam = (teamList, teamName, factionColor) => {
        const detailed = teamList.map(p => resolveSquadMemberTelemetry(p)).sort((a, b) => b.pts - a.pts);
        const count = detailed.length;
        const totalPts = detailed.reduce((s, p) => s + p.pts, 0);
        const avgKd = Number((detailed.reduce((s, p) => s + (Number(p.kd) || 1.0), 0) / count).toFixed(2));
        const totalProjectedDmg = Math.round(detailed.reduce((s, p) => s + (Number(p.dmgPerMatch) || 3200), 0));
        const avgAcc = Number((detailed.reduce((s, p) => s + (Number(p.acc) || 48), 0) / count).toFixed(1));

        const roleCounts = { slayer: 0, anchor: 0, objective: 0, flex: 0 };
        detailed.forEach(p => {
            const rKey = p.roleInfo?.primaryRole?.key || 'flex';
            roleCounts[rKey] = (roleCounts[rKey] || 0) + 1;
        });

        const starCarry = detailed[0];
        const linkToProtect = detailed[detailed.length - 1];

        let compositionAlert = '';
        let tacticalDirective = '';
        let synergyGrade = 'ÓPTIMA (A+)';

        if (roleCounts.slayer >= 3) {
            synergyGrade = 'HIPER-AGRESIVA (RIESGO DE SPAWNS)';
            compositionAlert = `⚠️ Exceso de Slayers (${roleCounts.slayer}/${count}) sin Ancla dedicada: riesgo alto de voltear spawns (Spawn Flip) y regalar la espalda en Objetivo.`;
            tacticalDirective = `Asignen a ${detailed[1]?.name || starCarry.name} como Ancla fija en High Ground para sostener respawns mientras ${starCarry.name} caza bajas.`;
        } else if (roleCounts.slayer === 0 && avgKd < 1.02) {
            synergyGrade = 'TÁCTICA / DEFENSIVA (FALTA PODER DE FUEGO)';
            compositionAlert = `⚠️ Escuadra de control sin Slayer explosivo nato: pueden dejar rivales a 1 tiro sin concretar el wipe.`;
            tacticalDirective = `Jueguen en "Buddy System" estricto (2 parejas de fuego cruzado) alrededor de ${starCarry.name} y aseguren cada arma de poder con 15s de anticipación.`;
        } else {
            synergyGrade = 'EQUILIBRADA HCS (ALTA SINERGIA)';
            compositionAlert = `✅ Composición balanceada entre poder de fuego, control de respawns y soporte de objetivo.`;
            tacticalDirective = `${starCarry.name} lidera la apertura de bajas (Entry/Slayer) mientras ${linkToProtect.name} juega cubierto haciendo daño de apoyo y asegurando el objetivo.`;
        }

        return {
            teamName,
            factionColor,
            members: detailed,
            totalPts,
            avgKd,
            totalProjectedDmg,
            avgAcc,
            roleCounts,
            starCarry,
            linkToProtect,
            synergyGrade,
            compositionAlert,
            tacticalDirective
        };
    };

    const eagleAnalysis = analyzeTeam(match.eagle, 'UNSC EAGLE', 'cyan');
    const cobraAnalysis = analyzeTeam(match.cobra, 'BANISHED COBRA', 'rose');

    const dmgDelta = eagleAnalysis.totalProjectedDmg - cobraAnalysis.totalProjectedDmg;
    const kdDelta = Number((eagleAnalysis.avgKd - cobraAnalysis.avgKd).toFixed(2));

    const carryDuelHeadline = `${eagleAnalysis.starCarry.name} (${eagleAnalysis.starCarry.pts} PTS • ${eagleAnalysis.starCarry.kd} KDR) vs ${cobraAnalysis.starCarry.name} (${cobraAnalysis.starCarry.pts} PTS • ${cobraAnalysis.starCarry.kd} KDR)`;
    const carryDuelKey = `El equipo que logre asistir con 1 tiro de Bandit Evo a su Carry (${eagleAnalysis.starCarry.name} o ${cobraAnalysis.starCarry.name}) en la disputa por armas de poder y altura central dominará el tempo de la partida.`;

    const protectLinkKey = `Eslabones a cubrir: En Eagle, ${eagleAnalysis.linkToProtect.name} (${eagleAnalysis.linkToProtect.pts} PTS) debe hacer pareja a 10 pasos con ${eagleAnalysis.starCarry.name}. En Cobra, ${cobraAnalysis.linkToProtect.name} (${cobraAnalysis.linkToProtect.pts} PTS) debe jugar pegado a cobertura alta asistiendo a ${cobraAnalysis.starCarry.name}.`;

    return {
        modeLabel: `${match.eagle.length}v${match.cobra.length}`,
        matchCode: match.code || 'ARENA',
        ptsDiff: Math.abs(eagleAnalysis.totalPts - cobraAnalysis.totalPts),
        eagle: eagleAnalysis,
        cobra: cobraAnalysis,
        dmgDelta,
        kdDelta,
        carryDuelHeadline,
        carryDuelKey,
        protectLinkKey
    };
};

// Renderiza el bloque visual de Sinergia Eagle vs Cobra (para insertar en el informe o abrir directo)
function buildMatchSynergyHtmlBlock(synergy) {
    if (!synergy) {
        return `
            <div class="p-3.5 rounded-lg bg-[#031020] border border-cyan-500/35 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div class="text-slate-300">
                    <i class="fa-solid fa-users-viewfinder text-cyan-400 mr-1.5"></i>
                    <strong class="font-orbitron text-cyan-300">Analizador de Sinergia Eagle vs Cobra (2v2 / 3v3 / 4v4):</strong>
                    Selecciona jugadores en el Roster principal para armar equipos y ver aquí el duelo táctico de escuadras en vivo.
                </div>
            </div>
        `;
    }

    const renderTeamColumn = (t, borderCol, titleCol, pillBg) => `
        <div class="p-3 rounded-lg bg-[#041427] border ${borderCol} space-y-2">
            <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span class="font-orbitron font-black text-xs sm:text-sm ${titleCol}">${t.teamName} (${t.totalPts} PTS)</span>
                <span class="px-2 py-0.5 rounded ${pillBg} font-orbitron font-bold text-[10px]">${t.avgKd} K/D • ${(t.totalProjectedDmg / 1000).toFixed(1)}k DMG</span>
            </div>
            <div class="space-y-1">
                ${t.members.map(m => `
                    <div class="flex items-center justify-between text-xs px-2 py-1 rounded bg-[#020b16] border border-slate-800/80">
                        <div class="flex items-center gap-1.5 truncate pr-1">
                            <span class="font-bold text-white truncate">${m.name}</span>
                            <span class="text-[10px] text-slate-400">(${m.pts}p • ${m.rank})</span>
                        </div>
                        <span class="px-1.5 py-0.5 rounded ${m.roleInfo.primaryRole.colorBg} ${m.roleInfo.primaryRole.colorText} border ${m.roleInfo.primaryRole.colorBorder} font-orbitron font-bold text-[9px] shrink-0">
                            ${m.roleInfo.primaryRole.shortTitle}
                        </span>
                    </div>
                `).join('')}
            </div>
            <div class="text-[11px] text-slate-200 bg-[#020a14] p-2 rounded border border-slate-800 space-y-1">
                <div>${t.compositionAlert}</div>
                <div class="text-cyan-200"><strong class="font-orbitron text-[10px] uppercase">Plan:</strong> ${t.tacticalDirective}</div>
            </div>
        </div>
    `;

    return `
        <div id="coachMatchSynergySection" class="p-3.5 rounded-lg bg-[#031020] border-2 border-purple-400/50 space-y-3 shadow-[0_0_20px_rgba(168,85,247,0.14)]">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-purple-500/30 pb-2">
                <span class="font-orbitron font-black text-xs sm:text-sm text-purple-300 uppercase flex items-center gap-1.5">
                    <i class="fa-solid fa-chess-knight text-amber-300"></i> Analizador Táctico de Sala Activa (${synergy.modeLabel} • Match #${synergy.matchCode})
                </span>
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400/50 font-orbitron font-bold text-[10px] text-purple-200">
                        Dif: ${synergy.ptsDiff} PTS | Ranked Arena
                    </span>
                    <button type="button" onclick="copyMatchSynergyToWhatsApp()" class="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-orbitron font-black text-[10px] flex items-center gap-1">
                        <i class="fa-brands fa-whatsapp"></i> Copiar Sinergia
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                ${renderTeamColumn(synergy.eagle, 'border-cyan-400/50', 'text-cyan-300', 'bg-cyan-500/20 text-cyan-200')}
                ${renderTeamColumn(synergy.cobra, 'border-rose-400/50', 'text-rose-300', 'bg-rose-500/20 text-rose-200')}
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div class="p-2.5 rounded bg-[#05162b] border border-amber-400/40">
                    <strong class="font-orbitron text-[10px] text-amber-300 uppercase block mb-0.5"><i class="fa-solid fa-bolt mr-1"></i>Duelo de Titanes (Carry vs Carry):</strong>
                    <div class="text-white font-bold text-[11px] mb-0.5">${synergy.carryDuelHeadline}</div>
                    <p class="text-slate-300 text-[11px] leading-snug">${synergy.carryDuelKey}</p>
                </div>
                <div class="p-2.5 rounded bg-[#05162b] border border-emerald-400/40">
                    <strong class="font-orbitron text-[10px] text-emerald-300 uppercase block mb-0.5"><i class="fa-solid fa-user-shield mr-1"></i>Condición de Victoria y Eslabón a Cubrir:</strong>
                    <p class="text-slate-300 text-[11px] leading-snug">${synergy.protectLinkKey}</p>
                </div>
            </div>
        </div>
    `;
}

window.copyMatchSynergyToWhatsApp = function() {
    const syn = window.analyzeCurrentMatchSynergy();
    if (!syn) {
        if (typeof window.showToast === 'function') window.showToast('Primero selecciona los jugadores en el Roster para armar la partida.');
        return;
    }
    const eRoles = syn.eagle.members.map(m => `• ${m.name} (${m.pts}p) → *${m.roleInfo.primaryRole.shortTitle}*`).join('\n');
    const cRoles = syn.cobra.members.map(m => `• ${m.name} (${m.pts}p) → *${m.roleInfo.primaryRole.shortTitle}*`).join('\n');

    const text =
`🧠 *SINERGIA DE ESCUADRAS COACH IA | MATCH #${syn.matchCode} (${syn.modeLabel})*
⚔️ *Modo:* Ranked Arena 4v4 | *Dif:* ${syn.ptsDiff} PTS

🦅 *UNSC EAGLE (${syn.eagle.totalPts} PTS | ${syn.eagle.avgKd} KDR | ${(syn.eagle.totalProjectedDmg / 1000).toFixed(1)}k DMG):*
${eRoles}
📌 *Plan Eagle:* ${syn.eagle.tacticalDirective}

🐍 *BANISHED COBRA (${syn.cobra.totalPts} PTS | ${syn.cobra.avgKd} KDR | ${(syn.cobra.totalProjectedDmg / 1000).toFixed(1)}k DMG):*
${cRoles}
📌 *Plan Cobra:* ${syn.cobra.tacticalDirective}

⚔️ *Duelo Clave (Carry vs Carry):* ${syn.carryDuelHeadline}
🛡️ *Regla de Cobertura:* ${syn.protectLinkKey}`;

    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (typeof window.showToast === 'function') {
        window.showToast('¡Sinergia táctica Eagle vs Cobra copiada para WhatsApp!');
    }
};

window.openMatchSynergyInCoach = function() {
    const syn = window.analyzeCurrentMatchSynergy();
    const prefill = syn?.eagle?.starCarry?.name || '';
    window.openCoachIAModal(prefill);
    if (prefill) {
        window.runCoachIAAnalysis();
        setTimeout(() => {
            document.getElementById('coachMatchSynergySection')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 350);
    }
};

// ============================================================================
// 4. ARQUITECTURA HÍBRIDA $0 USD (CACHÉ L1 + RATE LIMITER + GEMINI OPCIONAL)
// ============================================================================
function buildCoachCacheSignature(stats, focusProfile) {
    const norm = typeof window.normalizeSpartanKey === 'function'
        ? window.normalizeSpartanKey(stats.gamertag || 'spartan')
        : String(stats.gamertag || 'spartan').toLowerCase();
    return `${norm}_${stats.pts}_${stats.kd}_${stats.csr}_${stats.dmgPerMatch}_${focusProfile}`;
}

function getCoachCachedPlan(signature) {
    try {
        const raw = window['local' + 'Storage'].getItem(COACH_V2_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const entry = parsed[signature];
        if (!entry || !entry.timestamp || (Date.now() - entry.timestamp > COACH_V2_CACHE_TTL_MS)) {
            return null;
        }
        return entry.data;
    } catch (e) {
        return null;
    }
}

function saveCoachCachedPlan(signature, data) {
    try {
        const raw = window['local' + 'Storage'].getItem(COACH_V2_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const keys = Object.keys(parsed);
        if (keys.length > 60) {
            // Limpiar entradas más antiguas para cuidar el almacenamiento local
            keys.sort((a, b) => (parsed[a]?.timestamp || 0) - (parsed[b]?.timestamp || 0))
                .slice(0, 20)
                .forEach(k => delete parsed[k]);
        }
        parsed[signature] = { timestamp: Date.now(), data };
        window['local' + 'Storage'].setItem(COACH_V2_CACHE_KEY, JSON.stringify(parsed));
    } catch (e) {}
}

function canExecuteCoachAiRequest() {
    const now = Date.now();
    coachRateTimestamps = coachRateTimestamps.filter(t => now - t < COACH_RATE_WINDOW_MS);
    if (coachRateTimestamps.length >= COACH_RATE_LIMIT_MAX) {
        return false;
    }
    coachRateTimestamps.push(now);
    return true;
}

// Consulta opcional a /api/ai-coach (Serverless Free Tier) con fallback instantáneo 100% transparente
window.tryFetchHybridGeminiCoachEnrichment = async function(stats, basePlan) {
    const sig = buildCoachCacheSignature(stats, basePlan.activeFocus);
    const cachedEnrichment = getCoachCachedPlan(sig);
    if (cachedEnrichment) {
        return cachedEnrichment;
    }
    if (!canExecuteCoachAiRequest()) {
        return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    try {
        const resp = await fetch('/api/ai-coach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                gamertag: stats.gamertag,
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
                    killsPerMatch: stats.killsPerMatch,
                    deathsPerMatch: stats.deathsPerMatch,
                    assistsPerMatch: stats.assistsPerMatch,
                    modes: stats.modes || null
                },
                roleAnalysis: {
                    primaryRole: basePlan.roleInfo?.primaryRole?.title,
                    scorePct: basePlan.roleInfo?.primaryRole?.scorePct
                },
                mapKey: 'ranked_arena',
                focusProfile: basePlan.activeFocus
            })
        });
        clearTimeout(timer);
        if (!resp.ok) return null;
        const json = await resp.json();
        const enrichmentPayload = json?.data || json?.enrichment;
        if (json && json.ok && enrichmentPayload) {
            saveCoachCachedPlan(sig, enrichmentPayload);
            return enrichmentPayload;
        }
    } catch (e) {
        clearTimeout(timer);
    }

    // Respaldo opcional si el usuario configuró su propia clave local en el navegador (Cero claves en código)
    try {
        const localKey = (window['local' + 'Storage'].getItem('mansalvas_gemini_api_key_local') || '').trim();
        if (localKey) {
            const directResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(localKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [{
                            text: `Actúa como Coach HCS de Halo Infinite 4v4 Ranked Arena en español de Colombia. Devuelve JSON con positioningAdvice y communicationAdvice (2 oraciones cada uno) para ${stats.gamertag} (${stats.kd} KDR, ${stats.csr} CSR, ${stats.dmgPerMatch} DMG, Rol: ${basePlan.roleInfo?.primaryRole?.title}) en Ranked Arena 4v4.`
                        }]
                    }],
                    generationConfig: { temperature: 0.35, maxOutputTokens: 450, responseMimeType: 'application/json' }
                })
            });
            if (directResp.ok) {
                const dJson = await directResp.json();
                const txt = dJson?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (txt) {
                    const parsed = JSON.parse(txt);
                    saveCoachCachedPlan(sig, parsed);
                    return parsed;
                }
            }
        }
    } catch (e) {}

    return null;
};

// ============================================================================
// 5. MOTOR DETERMINISTA TÁCTICO V2: DIAGNÓSTICO + ROL HCS + MAPA + PLAN 3 DÍAS
// ============================================================================
// Recalibra y aplica el Candado Competitivo Ranked Arena 4v4 sobre cualquier perfil
// (incluso si proviene de caché previa en localStorage/Firestore) para impedir que
// jugadores promedio o sin CSR Onyx verificado sean inflados a Rango SS.
function enforceRankedArenaConsensusOnStats(stats, rosterMatch = null) {
    if (!stats || stats.notFound) return stats;

    const rawCsr = parseNormalizedMetricNumber(stats.csr);
    const rawKd = parseNormalizedMetricNumber(stats.kd);
    const rawDmg = parseNormalizedMetricNumber(stats.dmgPerMatch);

    const hasValidRankedCsr = !stats.isSocialOnly && Number.isFinite(rawCsr) && rawCsr >= 300 && rawCsr <= 2400;
    const hasValidKd = Number.isFinite(rawKd) && rawKd > 0 && rawKd <= 10;
    const hasValidDmg = Number.isFinite(rawDmg) && rawDmg > 0;

    stats.kd = hasValidKd ? Number(rawKd.toFixed(2)) : null;
    stats.dmgPerMatch = hasValidDmg ? Math.round(rawDmg) : null;
    stats.csr = hasValidRankedCsr ? Math.round(rawCsr) : null;

    if (typeof window.computeTripleConsensusPts === 'function') {
        const consensus = window.computeTripleConsensusPts({
            csr: stats.csr,
            kd: stats.kd,
            acc: numOrNull(stats.acc),
            hsPct: numOrNull(stats.hsPct),
            dmgPerMatch: stats.dmgPerMatch,
            shotsFiredPerMatch: numOrNull(stats.shotsFiredPerMatch),
            winRate: numOrNull(stats.winRate),
            wins: numOrNull(stats.wins),
            losses: numOrNull(stats.losses),
            tribunalDelta: numOrNull(stats.tribunalDelta) ?? 0,
            sourcesData: stats.sourcesData,
            isSocialOnly: Boolean(stats.isSocialOnly || !hasValidRankedCsr),
            foundSourcesCount: stats.foundSourcesCount || 1,
            liveVerified: Boolean(stats.liveVerified)
        });

        // Fuente única matemática: consumir directamente el resultado calibrado de rank-engine.js
        const finalPts = Math.max(1, Math.min(25, Math.round(Number(consensus.pts) || 12)));
        stats.pts = finalPts;
        stats.rank = typeof window.calculateRankFromPts === 'function' ? window.calculateRankFromPts(finalPts) : stats.rank;
        stats.kdScore = hasValidKd ? (Number(consensus.kdScore) || 0) : 0;
        stats.csrScore = hasValidRankedCsr ? (Number(consensus.csrScore) || 0) : 0;
        stats.dmgScore = hasValidDmg ? (Number(consensus.dmgScore) || 0) : 0;
        stats.kdScoreExact = consensus.kdScoreExact ?? stats.kdScore;
        stats.csrScoreExact = consensus.csrScoreExact ?? stats.csrScore;
        stats.dmgScoreExact = consensus.dmgScoreExact ?? stats.dmgScore;
        stats.rawContinuousPts = consensus.rawContinuousPts ?? finalPts;
        stats.ballisticDelta = Number(consensus.ballisticDelta) || 0;
        stats.activeWeights = consensus.activeWeights || { kd: 60, csr: 20, dmg: 20 };
        stats.incompleteTelemetry = Boolean(consensus.incompleteTelemetry);
        stats.leagueCapApplied = Boolean(consensus.telemetryPts > finalPts || consensus.incompleteTelemetry);
    }

    return stats;
}

window.buildCoachDiagnosisAnd3DayPlan = function(stats, focusOverride = 'auto') {
    enforceRankedArenaConsensusOnStats(stats);

    const name = stats.gamertag || 'Spartan';
    const pts = Number(stats.pts) || 12;
    const rank = stats.rank || (typeof window.calculateRankFromPts === 'function' ? window.calculateRankFromPts(pts) : 'B+');
    const tierTitles = window.TIER_TITLES_MAP || {
        'SS': 'DIOS SPARTAN / PRO', 'S': 'SEMIDIÓS / SEMI-PRO', 'A+': 'DEMONIO LETAL',
        'A': 'HIPERLETAL SPARTAN', 'B+': 'COMANDO ONI', 'B': 'SHOCK TROOPER ODST',
        'C': 'ARTILLERO UNSC', 'D': 'CADETE DE ACADEMIA'
    };
    const tierTitle = tierTitles[rank] || 'COMANDO ONI';
    const ptsToGod = Math.max(0, 23 - pts);

    const realKd = numOrNull(stats.kd);
    const realCsr = numOrNull(stats.csr);
    const realDmg = numOrNull(stats.dmgPerMatch);

    // 1. Puntajes individuales (1 a 25 PTS) y pesos activos 60% KDR + 20% Rango + 20% Daño
    const kdScore = realKd !== null ? Number(stats.kdScore ?? (typeof window.scoreFromKdMetric === 'function' ? window.scoreFromKdMetric(realKd) : pts) ?? pts) : 0;
    const csrScore = realCsr !== null ? Number(stats.csrScore ?? (typeof window.scoreFromCsrMetric === 'function' ? window.scoreFromCsrMetric(realCsr) : pts) ?? pts) : 0;
    const dmgScore = realDmg !== null ? Number(stats.dmgScore ?? (typeof window.scoreFromDmgMetric === 'function' ? window.scoreFromDmgMetric(realDmg) : pts) ?? pts) : 0;

    const wKdPct = Number.isFinite(Number(stats.activeWeights?.kd)) ? Number(stats.activeWeights.kd) : 60;
    const wCsrPct = Number.isFinite(Number(stats.activeWeights?.csr)) ? Number(stats.activeWeights.csr) : 20;
    const wDmgPct = Number.isFinite(Number(stats.activeWeights?.dmg)) ? Number(stats.activeWeights.dmg) : 20;

    const kdWeightedContribution = Number((kdScore * (wKdPct / 100)).toFixed(2));
    const csrWeightedContribution = Number((csrScore * (wCsrPct / 100)).toFixed(2));
    const dmgWeightedContribution = Number((dmgScore * (wDmgPct / 100)).toFixed(2));
    const rawWeightedSum = Number((kdWeightedContribution + csrWeightedContribution + dmgWeightedContribution).toFixed(2));

    const kdRank = realKd !== null && typeof window.calculateRankFromPts === 'function' ? window.calculateRankFromPts(kdScore) : 'N/D';
    const csrRank = realCsr !== null && typeof window.calculateRankFromPts === 'function' ? window.calculateRankFromPts(csrScore) : 'N/D';
    const dmgRank = realDmg !== null && typeof window.calculateRankFromPts === 'function' ? window.calculateRankFromPts(dmgScore) : 'N/D';
    const arenaLeagueName = realCsr !== null
        ? (typeof window.getArenaLeagueNameFromCsr === 'function' ? window.getArenaLeagueNameFromCsr(realCsr) : (realCsr >= 1500 ? 'Onyx' : 'Diamante'))
        : 'N/D (Sin lectura)';

    const allPillars = [
        { key: 'kd', active: realKd !== null, label: `KDR Ranked (Peso ${wKdPct}%)`, score: kdScore, rank: kdRank, currentVal: realKd !== null ? `${realKd} KDR` : 'N/D (Sin lectura)', targetSS: '> 1.25 KDR (SS)' },
        { key: 'csr', active: realCsr !== null, label: `Rango en Arena CSR (Peso ${wCsrPct}%)`, score: csrScore, rank: csrRank, currentVal: realCsr !== null ? `${realCsr} CSR (${arenaLeagueName})` : 'N/D (Sin lectura)', targetSS: '1500+ CSR Onyx (SS)' },
        { key: 'dmg', active: realDmg !== null, label: `Daño por Partida (Peso ${wDmgPct}%)`, score: dmgScore, rank: dmgRank, currentVal: realDmg !== null ? `${realDmg} DMG` : 'N/D (Sin lectura)', targetSS: '4,200+ DMG (SS)' }
    ];
    const activePillarsSorted = allPillars.filter(p => p.active).sort((a, b) => a.score - b.score);
    const weakestPillar = activePillarsSorted[0] || allPillars[0];
    const strongestPillar = activePillarsSorted[activePillarsSorted.length - 1] || allPillars[0];

    let limitingFactorExplanation = '';
    if (stats.incompleteTelemetry) {
        limitingFactorExplanation = `Candado de Telemetría Incompleta Activo: Sin KDR verificado el techo máximo es Rango A (15 PTS). Ingresa tu KDR real en la auditoría.`;
    } else if (realCsr !== null && realCsr < 1500 && pts >= 19) {
        limitingFactorExplanation = `Techo Diamond Activo (${arenaLeagueName} • ${realCsr} CSR): Hasta Diamond 6 el tope es Rango A+ (19 PTS). Sube a Onyx (1500+ CSR) para liberar Rango S.`;
    } else if (pts >= 20 && realCsr !== null && realCsr < 1700) {
        limitingFactorExplanation = `Techo Onyx Bajo (${realCsr} CSR): Para ascender de Rango S a SS (23-25 PTS) se exige Onyx 1700+ CSR, KDR ≥ 1.32 y Daño ≥ 5,500.`;
    } else if (pts >= 23) {
        limitingFactorExplanation = `¡Cumples los pilares calibrados en nivel SS Élite! ${realKd} KDR${realCsr !== null ? `, ${realCsr} CSR` : ''}${realDmg !== null ? ` y ${realDmg} DMG/juego` : ''} (${rawWeightedSum} PTS).`;
    } else {
        const nextTierPts = pts < 5 ? 5 : pts < 8 ? 8 : pts < 11 ? 11 : pts < 14 ? 14 : pts < 17 ? 17 : pts < 20 ? 20 : 23;
        const nextTierName = typeof window.calculateRankFromPts === 'function' ? window.calculateRankFromPts(nextTierPts) : 'S';
        const missingPtsNext = Math.max(1, nextTierPts - pts);
        limitingFactorExplanation = `Tu eslabón más bajo hoy es ${weakestPillar.label} (${weakestPillar.score}/25 PTS con ${weakestPillar.currentVal}). Subiendo ese pilar ganarás +${missingPtsNext} PTS rumbo a Rango ${nextTierName}.`;
    }

    // 2. Variables cruzadas reales (CERO DATOS INVENTADOS: null si la fuente no los entregó)
    const realKills = numOrNull(stats.killsPerMatch);
    const realDeaths = numOrNull(stats.deathsPerMatch);
    const realAssists = numOrNull(stats.assistsPerMatch);
    const dmgPerKill = (realDmg !== null && realKills !== null && realKills > 0) ? Math.round(realDmg / realKills) : null;
    const dmgPerLife = (realDmg !== null && realDeaths !== null && realDeaths > 0) ? Math.round(realDmg / realDeaths) : null;
    const dmgTaken = numOrNull(stats.dmgTakenPerMatch);
    const netDamageDelta = (realDmg !== null && dmgTaken !== null) ? (realDmg - dmgTaken) : null;
    const avgLifeSec = numOrNull(stats.avgLifeSeconds);
    const perfectMedals = numOrNull(stats.perfectMedalsPerMatch);
    const powerKills = numOrNull(stats.powerWeaponKillsPerMatch);
    const killParticipation = (realKills !== null && realAssists !== null) ? Number((realKills + realAssists).toFixed(1)) : null;
    const assistRatioPct = (realAssists !== null && killParticipation !== null && killParticipation > 0)
        ? Math.round((realAssists / killParticipation) * 100)
        : null;

    // 3. Metas escalonadas reales (calculadas sobre datos confirmados)
    const targetNextKd = realKd !== null ? Number(Math.max(realKd + 0.12, 1.26).toFixed(2)) : 1.26;
    const targetNextCsr = realCsr !== null ? Math.max(realCsr + 120, 1500) : 1500;
    const targetNextDmg = realDmg !== null ? Math.max(realDmg + 450, 4200) : 4200;
    const targetGodKd = realKd !== null ? Number(Math.max(realKd + 0.14, 1.28).toFixed(2)) : 1.28;
    const targetGodDmg = realDmg !== null ? Math.max(realDmg + 480, 4400) : 4400;
    const accPct = numOrNull(stats.acc);
    const hsPct = numOrNull(stats.hsPct);
    const targetGodAcc = accPct !== null ? Number(Math.min(64.0, Math.max(accPct + 4.0, 56.0)).toFixed(1)) : 55.0;
    const targetGodHs = hsPct !== null ? Number(Math.min(68.0, Math.max(hsPct + 4.5, 59.0)).toFixed(1)) : 58.0;
    const targetMaxDeaths = realDeaths !== null ? Math.max(8, Math.round(realDeaths - 2.5)) : 10;
    const targetLifeSec = avgLifeSec !== null ? Number(Math.min(55, avgLifeSec + 6.5).toFixed(1)) : 38.0;

    // 4. Clasificación de Rol Competitivo HCS (Ranked Arena 4v4)
    const roleInfo = window.classifyCompetitiveRole(stats);
    const primaryRole = roleInfo.primaryRole;

    // 4B. Telemetría Balística Real (sin fórmulas sintéticas cuando falte algún campo)
    const totalDamage = numOrNull(stats.totalDamage);
    const shotsFiredPerMatch = numOrNull(stats.shotsFiredPerMatch);
    const shotsFiredTotal = numOrNull(stats.shotsFired);
    const shotsHitTotal = numOrNull(stats.shotsHit);
    const shotsHitPerMatch = (shotsFiredPerMatch !== null && accPct !== null)
        ? Math.round(shotsFiredPerMatch * (accPct / 100))
        : null;
    const dmgPerShot = (realDmg !== null && shotsFiredPerMatch !== null && shotsFiredPerMatch > 0)
        ? Number((realDmg / shotsFiredPerMatch).toFixed(1))
        : null;

    let ballisticLabel = 'Telemetría Balística Parcial';
    let ballisticColor = 'text-slate-300';
    let ballisticDetail = 'Sin lectura de Shots Fired ni Accuracy en las fuentes públicas; se analiza únicamente con las métricas reales confirmadas.';
    if (shotsFiredPerMatch !== null && accPct !== null) {
        ballisticLabel = 'Supresión / Pre-fire Efectivo';
        ballisticColor = 'text-emerald-300';
        ballisticDetail = `Con ${shotsFiredPerMatch} disparos/juego (${accPct}% ACC)${dmgPerShot !== null ? ` y ${dmgPerShot} DMG por bala disparada` : ''}, mantienes presión constante sin regalar munición ni posición.`;
        if (shotsFiredPerMatch < 185 && realDmg !== null && realDmg < 3300) {
            ballisticLabel = 'Falta de Volumen de Fuego';
            ballisticColor = 'text-amber-300';
            ballisticDetail = `Solo tiras ${shotsFiredPerMatch} disparos/juego (${realDmg} DMG). En Ranked Arena debes pre-apuntar y tirar más tiros de apoyo (Crossfire) antes de esconderte.`;
        } else if (shotsFiredPerMatch > 265 && accPct < 46.5) {
            ballisticLabel = 'Spam Sin Conversión';
            ballisticColor = 'text-rose-300';
            ballisticDetail = `Disparas mucho volumen (${shotsFiredPerMatch} tiros/juego) pero con ${accPct}% ACC${dmgPerShot !== null ? ` (${dmgPerShot} DMG/tiro)` : ''}. Modera el gatillo del Bandit Evo y asegura los 5 tiros limpios.`;
        }
    } else if (accPct !== null) {
        ballisticLabel = accPct >= 52 ? 'Puntería Sólida (Sin Shots Fired)' : 'Puntería en Calibración (Sin Shots Fired)';
        ballisticColor = accPct >= 52 ? 'text-emerald-300' : 'text-amber-300';
        ballisticDetail = `Accuracy real confirmada de ${accPct}%${hsPct !== null ? ` y ${hsPct}% Headshots` : ''}. Shots Fired no entregado por las fuentes (N/D).`;
    } else if (realDmg !== null) {
        ballisticLabel = realDmg >= 4200 ? 'Alto Volumen de Daño Confirmado' : 'Presión de Daño Confirmada';
        ballisticColor = realDmg >= 4200 ? 'text-emerald-300' : 'text-amber-300';
        ballisticDetail = `Daño por partida real de ${realDmg} DMG. Shots Fired y Accuracy no fueron entregados por las fuentes (N/D).`;
    }

    const srcModes = stats.modes || {};
    const kdForModes = realKd ?? 1.0;
    const csrForModes = realCsr ?? 1100;
    const dmgForModes = realDmg ?? 3200;
    const accForModes = accPct ?? 48.0;

    const ctfScore = Number(srcModes.ctf?.score) || Math.round(clampNumber(42 + (kdForModes - 0.75) * 38 + (accForModes - 40) * 1.1 + (csrForModes - 900) * 0.025, 45, 98));
    const ctfRole = primaryRole.key === 'slayer'
        ? 'Cut-Off Slayer (Corta Retornos)'
        : primaryRole.key === 'anchor'
            ? 'Anchor de Spawns / Torreta'
            : primaryRole.key === 'objective'
                ? 'Flag Runner (Portador Táctico)'
                : 'Escolta de Ruta (Fridge / Hydro)';
    const ctfTier = ctfScore >= 85 ? 'ÉLITE (A+/SS)' : ctfScore >= 72 ? 'SÓLIDO (A)' : 'EN DESARROLLO (B)';
    const ctfProtocol = `Pull solo con ventaja numérica (2-dead o 3-dead rival). ${realDmg !== null ? `Usa tus ${realDmg} DMG/juego` : `Aprovecha tu ${fmtOptShort(realKd, ' KDR')}`}${shotsFiredPerMatch !== null ? ` y ${shotsFiredPerMatch} disparos/juego` : ''} para bloquear el carril de retorno y asegurar las alturas antes de tocar la bandera.`;

    const oddballScore = Number(srcModes.oddball?.score) || Math.round(clampNumber(40 + (dmgForModes - 2400) * 0.018 + ((realAssists ?? 6) * 2.1) + (kdForModes - 0.8) * 20, 45, 98));
    const oddballRole = primaryRole.key === 'objective'
        ? 'Portador Principal de Cráneo'
        : primaryRole.key === 'anchor'
            ? 'Rotador de Esquinas y Respawns'
            : 'Rompedor de Setup (Entry Breaker)';
    const oddballTier = oddballScore >= 85 ? 'ÉLITE (A+/SS)' : oddballScore >= 72 ? 'SÓLIDO (A)' : 'EN DESARROLLO (B)';
    const oddballTimeBalance = kdForModes >= 1.15 || (realDmg !== null && realDmg >= 3850)
        ? 'Prioriza 70% daño perimetral y solo toma la bola para asegurar 15-20s tras limpiar 2 rivales'
        : 'Carga el cráneo en esquinas cubiertas (55-75s por ronda) mientras tu Slayer abre mapa';
    const oddballProtocol = `${oddballTimeBalance}. Haz "Play Ball" (botar bola al vacío o al piso) 2s antes de que entren 2 enemigos para ganar el 4v4 y reiniciar el timer.`;

    const zonesScore = Number(srcModes.zones?.score) || Math.round(clampNumber(42 + (dmgForModes - 2500) * 0.017 + (accForModes - 42) * 1.1 + (csrForModes - 900) * 0.024, 45, 98));
    const zonesRole = primaryRole.key === 'anchor'
        ? 'Ancla de Rotación T-15s'
        : primaryRole.key === 'objective'
            ? 'Soaker de Tiempo en Colina / Zona'
            : 'Entry Breaker de Fuegos Cruzados';
    const zonesTier = zonesScore >= 85 ? 'ÉLITE (A+/SS)' : zonesScore >= 72 ? 'SÓLIDO (A)' : 'EN DESARROLLO (B)';
    const zonesProtocol = `En Strongholds aplica la regla del triángulo de 2 zonas (nunca captures la 3.ª o causarás Spawn Flip en tu espalda). En King of the Hill rota T-15s hacia las alturas de poder y abre fuego cruzado${realDmg !== null ? ` con ${realDmg} DMG/juego` : ''}.`;

    const modesAnalysis = {
        ctf: {
            score: ctfScore,
            tier: ctfTier,
            role: ctfRole,
            winRateEst: srcModes.ctf?.winRateEst || Math.round(clampNumber(42 + (ctfScore - 50) * 0.45, 38, 68)),
            protocol: ctfProtocol
        },
        oddball: {
            score: oddballScore,
            tier: oddballTier,
            role: oddballRole,
            winRateEst: srcModes.oddball?.winRateEst || Math.round(clampNumber(42 + (oddballScore - 50) * 0.45, 38, 68)),
            protocol: oddballProtocol
        },
        zones: {
            score: zonesScore,
            tier: zonesTier,
            role: zonesRole,
            winRateEst: srcModes.zones?.winRateEst || Math.round(clampNumber(42 + (zonesScore - 50) * 0.45, 38, 68)),
            protocol: zonesProtocol
        }
    };

    // 5. Enfoque activo real conectado a #coachFocusProfile
    let activeFocus = focusOverride || 'auto';
    if (activeFocus === 'auto') {
        if (weakestPillar.key === 'dmg') activeFocus = 'low_dmg_kills';
        else if (weakestPillar.key === 'kd' || (realDeaths !== null && realDeaths >= 13.0)) activeFocus = 'high_deaths';
        else if (accPct !== null && accPct < 50.0) activeFocus = 'low_acc_hs';
        else activeFocus = 'solo_no_assists';
    }

    const focusLabels = {
        low_dmg_kills: 'Proyección de Daño y Presión Ofensiva (DMG)',
        high_deaths: 'Supervivencia Táctica y Disciplina de Cobertura (KDR)',
        low_acc_hs: 'Precisión de 5.º Tiro con Bandit Evo y Puntería con Strafe',
        solo_no_assists: 'Sincronización de Equipo, Callouts y Fuego Cruzado (CSR)'
    };
    const activeFocusLabel = focusLabels[activeFocus] || focusLabels.high_deaths;

    let badge = '';
    if (pts >= 23) {
        badge = `NIVEL DIOS SPARTAN SS (${pts}/25 PTS) • ROL: ${primaryRole.shortTitle}`;
    } else if (pts >= 17) {
        badge = `ALTO RENDIMIENTO (${pts}/25 PTS • RANGO ${rank}) • ROL: ${primaryRole.shortTitle} • A +${ptsToGod} PTS DE SS`;
    } else if (pts >= 11) {
        badge = `IMPULSO TÁCTICO (${pts}/25 PTS • RANGO ${rank}) • ROL: ${primaryRole.shortTitle}`;
    } else {
        badge = `EVOLUCIÓN ACELERADA (${pts}/25 PTS • RANGO ${rank}) • ROL: ${primaryRole.shortTitle}`;
    }

    const strengths = `Tu perfil encaja al ${primaryRole.scorePct}% como ${primaryRole.title}. Tu pilar más sólido confirmado es ${strongestPillar.label} (${strongestPillar.score}/25 PTS • Rango ${strongestPillar.rank} con ${strongestPillar.currentVal})${killParticipation !== null ? ` y aportas ${killParticipation} participaciones por partida` : ''}.`;
    const weakness = limitingFactorExplanation;

    const readingParts = [
        realKd !== null ? `KDR ${realKd} (${kdScore} pts × ${wKdPct}% = ${kdWeightedContribution})` : `KDR N/D`,
        realCsr !== null ? `Arena ${realCsr} CSR (${csrScore} pts × ${wCsrPct}% = ${csrWeightedContribution})` : `Arena CSR N/D`,
        realDmg !== null ? `Daño ${realDmg} (${dmgScore} pts × ${wDmgPct}% = ${dmgWeightedContribution})` : `Daño N/D`
    ];
    const extraReadingParts = [];
    if (netDamageDelta !== null && dmgPerLife !== null) extraReadingParts.push(`diferencial neto de ${netDamageDelta >= 0 ? '+' : ''}${netDamageDelta} DMG por partida (${dmgPerLife} DMG/vida)`);
    if (dmgPerKill !== null) extraReadingParts.push(`inviertes ${dmgPerKill} DMG por cada baja`);
    if (avgLifeSec !== null) extraReadingParts.push(`sobrevives ${avgLifeSec}s por aparición`);
    const readingAnalysis = `Tu nota de ${pts} PTS (Rango ${rank}) sale del consenso real: ${readingParts.join(' + ')} = ${rawWeightedSum} PTS.${extraReadingParts.length ? ' Telemetría adicional confirmada: ' + extraReadingParts.join(', ') + '.' : ' Algunas métricas secundarias no estuvieron disponibles en las fuentes (N/D).'}`;

    const positioningAdvice = `En Ranked Arena 4v4 como ${primaryRole.shortTitle}, prioriza las alturas de poder y líneas de fuego cruzado con cobertura sólida. Prohibido cruzar carriles centrales abiertos sin humo ni ventaja numérica.${realDeaths !== null ? ` Jugar pegado a alturas reducirá tus muertes de ${realDeaths} a ≤${targetMaxDeaths} y` : ' Sostener coberturas'} elevará tu KDR hacia ${targetNextKd}.`;

    const communicationAdvice = `Para subir tu Rango en Arena (${realCsr !== null ? `${realCsr} CSR` : 'N/D'} → ${targetNextCsr} CSR)${dmgPerKill !== null ? ` y mejorar tu conversión de daño (${dmgPerKill} DMG/Kill)` : ''}, aplica la gramática HCS de 3 segundos [Cantidad + Estado + Ubicación] mientras marcas con Ping: «Uno sin escudo en altura, préstenme un tiro» o «Faltan 15s para Arma de Poder, empujemos juntos».`;

    // Calibración de Mando y FOV basada en telemetría real (sin inventar % ACC si es null)
    let recFov = 106;
    let recSensH = '4.5';
    let recSensV = '5.0';
    let recAccel = 3;
    let recRightDz = '1.5';
    let recLeftDz = '1.0';
    let aimDiagnosticNote = '';

    if (accPct === null) {
        aimDiagnosticNote = `Sin lectura de Accuracy % en las fuentes (N/D); se recomienda esta configuración base equilibrada para consistencia con Bandit Evo:`;
    } else if (accPct < 47.5) {
        recFov = 104;
        recSensH = '4.0';
        recSensV = '4.5';
        recAccel = 2;
        recRightDz = '2.0';
        aimDiagnosticNote = `Con ${accPct}% ACC necesitas estabilizar tu retícula a media distancia: un FOV de 104° agranda el objetivo en pantalla y la sensibilidad 4.0H/4.5V evita que sobre-corrijas en el 5.º disparo a la cabeza.`;
    } else if (accPct <= 53.5) {
        recFov = primaryRole.key === 'slayer' ? 107 : 105;
        recSensH = '4.5';
        recSensV = '5.0';
        recAccel = 3;
        recRightDz = '1.5';
        aimDiagnosticNote = `Con ${accPct}% ACC${hsPct !== null ? ` y ${hsPct}% HS` : ''} tienes una base sólida: 4.5H/5.0V con aceleración 3 te da el equilibrio exacto entre giro rápido de cámara en Ranked Arena y firmeza con el Bandit Evo.`;
    } else {
        recFov = 108;
        recSensH = '5.0';
        recSensV = '5.5';
        recAccel = 4;
        recRightDz = '1.0';
        aimDiagnosticNote = `Tu puntería de ${accPct}% ACC permite respuesta de nivel Onyx: FOV en 108° para máxima lectura periférica y zona muerta derecha en 1.0 para micro-ajustes instantáneos.`;
    }

    const configAdvice = `${aimDiagnosticNote} Configura: FOV ${recFov}°, Sensibilidad ${recSensH}H / ${recSensV}V (Aceleración ${recAccel}). En Stick Izquierdo pon Zona Muerta Central en ${recLeftDz} y Umbral Máximo en 15.0 para hacer strafe corto lateral sin perder la asistencia de mira.`;

    // Plan de Trabajo de 3 Días adaptado a #coachFocusProfile y solo datos reales confirmados
    let day1 = '';
    let day2 = '';
    let day3 = '';
    const dmgDisplay = realDmg !== null ? `${realDmg}` : 'N/D';
    const kdDisplay = realKd !== null ? `${realKd}` : 'N/D';
    const csrDisplay = realCsr !== null ? `${realCsr}` : 'N/D';

    if (activeFocus === 'low_dmg_kills') {
        day1 = `DÍA 1 • APERTURA DE DAÑO Y PRE-GRANADAS (Subir de ${dmgDisplay} a ${targetNextDmg}+ DMG): ${name}, tu foco prioritario es elevar tu Daño por partida. Antes de asomarte a una esquina o altura, rebota tus 2 granadas en los ángulos donde el rival se cubre para hacer +200 de daño inicial antes de buscar un duelo 1v1${dmgPerLife !== null ? ` (subiendo de ${dmgPerLife} a ${dmgPerLife + 110} DMG/vida)` : ''}.`;
        day2 = `DÍA 2 • ÁNGULOS DE PODER Y CONVERSIÓN DE BAJAS${dmgPerKill !== null ? ` (Bajar de ${dmgPerKill} a ${Math.max(205, dmgPerKill - 35)} DMG/Kill)` : ''}: Juega como ${primaryRole.shortTitle} dominando las líneas largas desde altura. Dispara siempre al enemigo que ya esté peleando con tu compañero para cobrar asistencias y bajas rápidas sin gastar cargadores completos.`;
        day3 = `DÍA 3 • CONTROL DE ARMAS CADA 120s Y ASCENSO A RANGO SS (${csrDisplay} → ${targetNextCsr} CSR): El daño masivo en Arena nace de controlar armas de poder y Camo/Sobreescudo. Posiciónate 15 segundos antes de que aparezcan y canta en voz alta el timer para limpiar la zona en equipo y asegurar tus +${ptsToGod || 1} PTS hacia Rango SS.`;
    } else if (activeFocus === 'low_acc_hs') {
        day1 = `DÍA 1 • DISCIPLINA DEL 5.º TIRO Y PUNTERÍA CON STRAFE (Meta: ${targetGodAcc}%+ ACC): ${name}, cuando rompas el escudo enemigo con el Bandit Evo, deja de mover bruscamente el stick derecho. Haz una micro-pausa de 0.1s y alinea el tiro final a la cabeza${hsPct !== null ? ` (${hsPct}% → ${targetGodHs}% HS)` : ''} moviendo solo tu stick izquierdo (strafe lateral).`;
        day2 = `DÍA 2 • VENTAJA DE PRIMER DISPARO Y HEADGLITCH (Subir KDR de ${kdDisplay} a ${targetNextKd}): Usa barandas, cajas y escaleras para mostrar solo el casco (Headglitch). Quien conecta el 1.er tiro con Bandit Evo gana el 78% de los duelos en Arena y suma daño limpio extra por juego.`;
        day3 = `DÍA 3 • CIERRE DE DUELOS BAJO PRESIÓN EN ARENA (${csrDisplay} → ${targetNextCsr} CSR): Calienta 10 minutos en Academia con bots en movimiento lateral antes de entrar a Ranked. En partida, prioriza rematar rivales sin escudo que tu equipo marque con Ping para asegurar victorias hacia Onyx SS.`;
    } else if (activeFocus === 'solo_no_assists') {
        day1 = `DÍA 1 • SISTEMA DE PAREJAS (BUDDY SYSTEM A 10 PASOS): ${name}, prohibido caminar solo en Ranked Arena 4v4. Al nacer, elige a tu compañero más cercano${roleInfo.idealDuoPartner ? ` (idealmente ${roleInfo.idealDuoPartner.name})` : ''} y mantente a 8-10 pasos de él mirando el mismo carril${assistRatioPct !== null ? ` (subir apoyo de ${assistRatioPct}% a +40%)` : ''}.`;
        day2 = `DÍA 2 • FUEGO CRUZADO (CROSSFIRE) Y CALLOUTS DE 3 SEGUNDOS (Meta Daño: ${targetNextDmg}+ DMG): Dos Bandit Evo disparando al mismo blanco matan en 0.7 segundos. Marca con Ping cada rival que veas y canta su posición exacta en 3 segundos${dmgPerKill !== null ? ` para bajar tu costo de ${dmgPerKill} a ${Math.max(205, dmgPerKill - 35)} DMG/Kill` : ''}.`;
        day3 = `DÍA 3 • CONTROL DE SPAWNS Y ROTACIÓN TEMPRANA (${csrDisplay} → ${targetNextCsr} CSR): Bloquea los spawns rivales sin invadir la base enemiga y coordina con tu escuadra la rotación 15 segundos antes de cada Arma de Poder u Objetivo para ganar las partidas cerradas y desbloquear el Rango SS.`;
    } else {
        // high_deaths (o auto enfocado en el pilar 60% KDR)
        day1 = `DÍA 1 • REGLA DE SUPERVIVENCIA DE 4 SEGUNDOS (Subir KDR de ${kdDisplay} [${kdScore}/25 pts] a ${targetNextKd} KDR): ${name}, tu KDR vale el ${wKdPct}% de tu rango y exige > 1.25 para ser SS. Hoy, cada vez que te quiten el escudo, prohíbete volver a asomarte: escóndete 4s hasta recargar${avgLifeSec !== null ? ` (vive ${targetLifeSec}s por aparición)` : ''}${realDeaths !== null ? ` y baja tus muertes de ${realDeaths} a ≤${targetMaxDeaths}` : ''}.`;
        day2 = `DÍA 2 • DAÑO SEGURO DESDE ALTURAS (Subir de ${dmgDisplay} [${dmgScore}/25 pts] a ${targetNextDmg}+ DMG): Evita cruzar zonas abiertas sin cobertura. Juega desde altura lanzando granadas previas y disparando en pareja para subir tu presión de daño sin regalar tu vida.`;
        day3 = `DÍA 3 • DOMINIO DE TIMERS Y BLOQUEO DE SPAWNS (Subir de ${csrDisplay} [${csrScore}/25 pts] a ${targetNextCsr}+ CSR): Sostén el control de línea media sin provocar Spawn Flips, adelántate 15 segundos a armas de poder y canta cada rival tocado para consolidar tus pilares en Rango SS (23-25 PTS).`;
    }

    const summary = `${name}, auditamos tu perfil bajo la fórmula oficial (${wKdPct}% KDR + ${wCsrPct}% Rango Arena + ${wDmgPct}% Daño) con evidencia real de ${stats.foundSourcesCount || 1}/3 fuentes (${(stats.foundSourcesNames || ['Verificado']).join(' + ')}).`;

    const strengthBullet = strongestPillar.key === 'dmg'
        ? `Daño élite (${strongestPillar.currentVal}); presión constante para el equipo.`
        : strongestPillar.key === 'csr'
            ? `Nivel Arena sólido (${realCsr} CSR); lectura competitiva alta.`
            : `KDR sólido (${kdDisplay}); efectividad alta en duelos 1v1.`;
    const gapBullet = stats.incompleteTelemetry
        ? `Falta KDR verificado; techo bloqueado en Rango A (15 PTS).`
        : weakestPillar.key === 'kd'
            ? `Subir KDR de ${kdDisplay} a ${targetNextKd} evitando duelos sin escudo.`
            : weakestPillar.key === 'csr'
                ? `Subir CSR de ${csrDisplay} a ${targetNextCsr} para liberar techo.`
                : `Subir Daño de ${dmgDisplay} a ${targetNextDmg}+ con pre-granadas.`;
    const focusBullet = activeFocus === 'low_dmg_kills'
        ? `Abre con granadas y dispara en ángulo cruzado desde altura.`
        : activeFocus === 'low_acc_hs'
            ? `Alinea el 5.º tiro Bandit con strafe izquierdo sin sobre-corregir.`
            : activeFocus === 'solo_no_assists'
                ? `Juega en pareja a 10 pasos y canta callouts rápidos.`
                : `Escóndete 4s sin escudo; prioriza vivir sobre forzar trades.`;
    const tacticalBullets = [
        { icon: '✅', tag: 'Fortaleza', color: 'emerald', text: strengthBullet },
        { icon: '⚠️', tag: 'Brecha', color: 'amber', text: gapBullet },
        { icon: '🎯', tag: 'Foco Hoy', color: 'cyan', text: focusBullet }
    ];
    if (roleInfo.idealDuoPartner) {
        tacticalBullets.push({
            icon: '🤝',
            tag: 'Dúo Ideal',
            color: 'purple',
            text: `Haz pareja con ${roleInfo.idealDuoPartner.name} (${roleInfo.idealDuoPartner.pts} PTS • ${roleInfo.idealDuoPartner.rank}).`
        });
    }

    return {
        badge,
        summary,
        strengths,
        weakness,
        tacticalBullets,
        readingAnalysis,
        positioningAdvice,
        communicationAdvice,
        configAdvice,
        sensAdvice: configAdvice,
        day1,
        day2,
        day3,
        kdScore,
        csrScore,
        dmgScore,
        kdWeightedContribution,
        csrWeightedContribution,
        dmgWeightedContribution,
        rawWeightedSum,
        kdRank,
        csrRank,
        dmgRank,
        arenaLeagueName,
        weakestPillar,
        strongestPillar,
        limitingFactorExplanation,
        dmgPerKill,
        dmgPerLife,
        dmgTaken,
        netDamageDelta,
        totalDamage,
        shotsFiredTotal,
        shotsFiredPerMatch,
        shotsHitPerMatch,
        shotsHitTotal,
        dmgPerShot,
        ballisticDiscipline: {
            label: ballisticLabel,
            color: ballisticColor,
            detail: ballisticDetail
        },
        modesAnalysis,
        avgLifeSec,
        perfectMedals,
        powerKills,
        assistRatioPct,
        targetGodKd,
        targetGodDmg,
        targetNextCsr,
        targetGodAcc,
        targetGodHs,
        targetMaxDeaths,
        targetLifeSec,
        ptsToGod,
        roleInfo,
        activeFocus,
        activeFocusLabel
    };
};

// ============================================================================
// 6. APERTURA DE MODAL, AUDITORÍA DE 3 FUENTES Y RENDERIZADO V2
// ============================================================================
window.openCoachIAModal = function(prefillGamertag = '') {
    const modal = document.getElementById('coachIAModal');
    const selectEl = document.getElementById('coachRosterSelect');
    if (selectEl) {
        const sorted = [...(window.roster || [])].sort((a, b) => a.name.localeCompare(b.name));
        selectEl.innerHTML = `<option value="">-- Seleccionar Spartan del Roster (${sorted.length}) --</option>` +
            sorted.map(p => {
                const r = typeof window.calculateRankFromPts === 'function' ? window.calculateRankFromPts(p.pts) : (p.rank || 'B+');
                return `<option value="${p.name}">${p.name} (${p.pts} PTS • Rango ${r})</option>`;
            }).join('');
    }
    if (prefillGamertag) {
        const inp = document.getElementById('coachGamertagInput');
        if (inp) inp.value = prefillGamertag;
    }
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.closeCoachIAModal = function() {
    const modal = document.getElementById('coachIAModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.onSelectCoachRosterPlayer = function(playerName) {
    if (!playerName) return;
    const inp = document.getElementById('coachGamertagInput');
    if (inp) inp.value = playerName;
    window.runCoachIAAnalysis();
};

window.runCoachIAAnalysis = async function() {
    const inp = document.getElementById('coachGamertagInput');
    const rawTag = (inp?.value || '').trim();
    if (!rawTag) {
        if (typeof window.showToast === 'function') {
            window.showToast('Escribe o elige el Gamertag del Spartan para analizar.');
        }
        return;
    }

    const btnText = document.getElementById('coachScanBtnText');
    const iconEl = document.getElementById('coachScanIcon');
    const statusBanner = document.getElementById('coachStatusBanner');
    const container = document.getElementById('coachReportContainer');

    if (iconEl) iconEl.className = 'fa-solid fa-spinner fa-spin';
    if (btnText) btnText.innerText = 'Auditando 3 Fuentes...';
    if (statusBanner) {
        statusBanner.innerHTML = `<span class="text-cyan-300 font-semibold"><i class="fa-solid fa-satellite-dish mr-1"></i>Auditando evidencia en <strong>SpartanRecord.com</strong>, <strong>HaloDataHive</strong> y <strong>Halo Tracker</strong> (60% KDR + 20% Rango + 20% Daño)...</span>`;
    }

    const normKey = typeof window.normalizeSpartanKey === 'function' ? window.normalizeSpartanKey(rawTag) : rawTag.toLowerCase();
    const rosterMatch = (window.roster || []).find(p => {
        const k = typeof window.normalizeSpartanKey === 'function' ? window.normalizeSpartanKey(p.name) : p.name.toLowerCase();
        return k === normKey;
    });

    // FIX V2: Si el jugador ya pertenece al Roster Oficial del clan, habilitamos allowRosterFallback: true
    // para que un bloqueo temporal de proxies CORS jamás deje sin informe a un miembro registrado.
    const stats = await window.fetchDualTelemetryForGamertag(rawTag, {
        allowRosterFallback: Boolean(rosterMatch)
    });

    if (iconEl) iconEl.className = 'fa-solid fa-microchip';
    if (btnText) btnText.innerText = 'Generar Informe';

    // CASO: 0/3 Fuentes con datos públicos y no está en el Roster (Cero Datos Inventados)
    if (!stats || stats.notFound) {
        const encoded = encodeURIComponent(rawTag);
        if (statusBanner) {
            statusBanner.innerHTML = `<span class="text-amber-300 font-bold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Auditoría completada: 0/3 fuentes con datos públicos para "${rawTag}". Cero datos inventados.</span>`;
        }
        if (container) {
            container.classList.remove('hidden');
            container.innerHTML = `
                <div class="p-4 rounded-lg bg-[#041224] border-2 border-amber-400/60 space-y-3.5">
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 pb-2.5">
                        <div>
                            <span class="text-[10px] font-orbitron text-amber-400 uppercase tracking-widest block font-bold">AUDITORÍA TRANSPARENTE • CERO DATOS INVENTADOS</span>
                            <h4 class="font-orbitron font-black text-base sm:text-lg text-white">0/3 FUENTES CON DATOS PÚBLICOS PARA "${rawTag.toUpperCase()}"</h4>
                        </div>
                        ${rosterMatch ? `<span class="px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-400 text-cyan-200 font-orbitron font-bold text-xs">En Roster: Rango ${window.calculateRankFromPts(rosterMatch.pts)} (${rosterMatch.pts} PTS)</span>` : ''}
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div class="p-2.5 rounded bg-slate-900/80 border border-slate-700 flex items-center justify-between">
                            <span class="font-orbitron font-bold text-slate-300">SpartanRecord.com</span>
                            <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">⚠️ SIN DATOS</span>
                        </div>
                        <div class="p-2.5 rounded bg-slate-900/80 border border-slate-700 flex items-center justify-between">
                            <span class="font-orbitron font-bold text-slate-300">HaloDataHive</span>
                            <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">⚠️ SIN DATOS</span>
                        </div>
                        <div class="p-2.5 rounded bg-slate-900/80 border border-slate-700 flex items-center justify-between">
                            <span class="font-orbitron font-bold text-slate-300">Halo Tracker</span>
                            <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">⚠️ SIN DATOS</span>
                        </div>
                    </div>

                    <p class="text-xs text-slate-200 leading-relaxed">
                        Para garantizar un diagnóstico 100% real y <strong>no inventar ningún número</strong>, puedes abrir cualquiera de las 3 webs oficiales con los botones de abajo, mirar tus 3 estadísticas reales (<strong>K/D Ratio</strong>, <strong>CSR en Arena</strong> y <strong>Daño por Partida</strong>) y digitarlas aquí para generar tu plan de trabajo al instante:
                    </p>

                    <div class="flex flex-wrap gap-2">
                        <a href="https://spartanrecord.com/service_record/${encoded}" target="_blank" rel="noopener" class="px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 text-emerald-200 text-xs font-orbitron font-bold"><i class="fa-solid fa-up-right-from-square mr-1"></i>1. Abrir SpartanRecord</a>
                        <a href="https://halodatahive.com/Player/Infinite/${encoded}" target="_blank" rel="noopener" class="px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 text-amber-200 text-xs font-orbitron font-bold"><i class="fa-solid fa-up-right-from-square mr-1"></i>2. Abrir HaloDataHive</a>
                        <a href="https://halotracker.com/halo-infinite/profile/xbl/${encoded}/overview" target="_blank" rel="noopener" class="px-3 py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/60 text-cyan-200 text-xs font-orbitron font-bold"><i class="fa-solid fa-up-right-from-square mr-1"></i>3. Abrir Halo Tracker</a>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-2 border-t border-cyan-500/20">
                        <div class="p-2.5 rounded bg-[#05162b] border border-amber-400/50">
                            <label class="block text-[10px] font-orbitron font-bold text-amber-300 uppercase mb-1">1. KDR / K/D Ratio</label>
                            <input id="coachManualKdInput" type="number" step="0.01" min="0.30" max="3.50" placeholder="Ej: 1.08" class="w-full px-2.5 py-1.5 rounded bg-[#030d1a] border border-amber-400/40 text-white font-orbitron font-bold text-sm">
                        </div>
                        <div class="p-2.5 rounded bg-[#05162b] border border-cyan-400/50">
                            <label class="block text-[10px] font-orbitron font-bold text-cyan-300 uppercase mb-1">2. CSR Arena</label>
                            <input id="coachManualCsrInput" type="number" step="10" min="300" max="2400" placeholder="Ej: 1250" class="w-full px-2.5 py-1.5 rounded bg-[#030d1a] border border-cyan-400/40 text-white font-orbitron font-bold text-sm">
                        </div>
                        <div class="p-2.5 rounded bg-[#05162b] border border-emerald-400/50">
                            <label class="block text-[10px] font-orbitron font-bold text-emerald-300 uppercase mb-1">3. Damage / Juego</label>
                            <input id="coachManualDmgInput" type="number" step="50" min="1200" max="7500" placeholder="Ej: 3650" class="w-full px-2.5 py-1.5 rounded bg-[#030d1a] border border-emerald-400/40 text-white font-orbitron font-bold text-sm">
                        </div>
                        <div class="p-2.5 rounded bg-[#05162b] border border-purple-400/50">
                            <label class="block text-[10px] font-orbitron font-bold text-purple-300 uppercase mb-1">4. Accuracy % (Opc.)</label>
                            <input id="coachManualAccInput" type="number" step="0.1" min="25" max="75" placeholder="Ej: 49.5" class="w-full px-2.5 py-1.5 rounded bg-[#030d1a] border border-purple-400/40 text-white font-orbitron font-bold text-sm">
                        </div>
                        <div class="p-2.5 rounded bg-[#05162b] border border-sky-400/50">
                            <label class="block text-[10px] font-orbitron font-bold text-sky-300 uppercase mb-1">5. Shots Fired (Opc.)</label>
                            <input id="coachManualShotsInput" type="number" step="5" min="80" max="500" placeholder="Ej: 225" class="w-full px-2.5 py-1.5 rounded bg-[#030d1a] border border-sky-400/40 text-white font-orbitron font-bold text-sm">
                        </div>
                    </div>

                    <div class="flex justify-end pt-1">
                        <button type="button" onclick="generateCoachReportFromManualEvidence('${rawTag.replace(/'/g, "\\'")}')" class="hud-btn px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-black font-orbitron font-black text-xs shadow">
                            <i class="fa-solid fa-bolt mr-1"></i> Generar Plan con Mis Datos Reales
                        </button>
                    </div>
                </div>
            `;
        }
        if (typeof window.showToast === 'function') {
            window.showToast(`0/3 fuentes con datos públicos para "${rawTag}". Ingresa tus 3 cifras o verifica el Gamertag.`);
        }
        return;
    }

    // Aplicar el consenso Ranked Arena 4v4 actualizado y el candado anti-inflación por CSR
    enforceRankedArenaConsensusOnStats(stats, rosterMatch);

    window._lastCoachStats = stats;
    window.renderCoachIAReport(stats);
};

window.generateCoachReportFromManualEvidence = function(gamertag) {
    const kdVal = parseNormalizedMetricNumber(document.getElementById('coachManualKdInput')?.value);
    const csrVal = parseNormalizedMetricNumber(document.getElementById('coachManualCsrInput')?.value);
    const dmgVal = parseNormalizedMetricNumber(document.getElementById('coachManualDmgInput')?.value);
    const accVal = parseNormalizedMetricNumber(document.getElementById('coachManualAccInput')?.value);
    const shotsVal = parseNormalizedMetricNumber(document.getElementById('coachManualShotsInput')?.value);

    const hasValidManualKd = Number.isFinite(kdVal) && kdVal > 0 && kdVal <= 10;
    const hasValidManualCsr = Number.isFinite(csrVal) && csrVal >= 300 && csrVal <= 2400;
    const hasValidManualDmg = Number.isFinite(dmgVal) && dmgVal > 0;
    const hasValidManualAcc = Number.isFinite(accVal) && accVal > 0 && accVal <= 100;
    const hasValidManualShots = Number.isFinite(shotsVal) && shotsVal > 30;

    if (!hasValidManualKd && !hasValidManualCsr && !hasValidManualDmg) {
        if (typeof window.showToast === 'function') {
            window.showToast('Ingresa al menos tu KDR, CSR o Damage real para calcular el informe.');
        }
        return;
    }

    const kd = hasValidManualKd ? Number(kdVal.toFixed(2)) : null;
    const csr = hasValidManualCsr ? Math.round(csrVal) : null;
    const dmgPerMatch = hasValidManualDmg ? Math.round(dmgVal) : null;
    const acc = hasValidManualAcc ? Number(clampNumber(accVal, 10, 95).toFixed(1)) : null;
    const shotsFiredPerMatch = hasValidManualShots ? Math.round(shotsVal) : null;

    const consensus = window.computeTripleConsensusPts({
        csr,
        kd,
        acc,
        hsPct: null,
        dmgPerMatch,
        shotsFiredPerMatch,
        winRate: null,
        isSocialOnly: !hasValidManualCsr,
        liveVerified: true
    });
    const manualStats = {
        notFound: false,
        gamertag,
        csr,
        kd,
        kda: null,
        acc,
        hsPct: null,
        dmgPerMatch,
        dmgTakenPerMatch: null,
        shotsFiredPerMatch,
        shotsFired: null,
        shotsHit: null,
        totalDamage: null,
        avgLifeSeconds: null,
        killsPerMatch: null,
        deathsPerMatch: null,
        assistsPerMatch: null,
        perfectMedalsPerMatch: null,
        powerWeaponKillsPerMatch: null,
        winRate: null,
        pts: consensus.pts,
        rank: window.calculateRankFromPts(consensus.pts),
        kdScore: consensus.kdScore,
        csrScore: consensus.csrScore,
        dmgScore: consensus.dmgScore,
        activeWeights: consensus.activeWeights,
        isSocialOnly: !hasValidManualCsr,
        htScore: null,
        dhScore: null,
        srScore: null,
        foundSourcesCount: 1,
        foundSourcesNames: ['Evidencia Manual Verificada por el Jugador'],
        sourcesData: { spartanRecord: null, dataHive: null, haloTracker: null },
        source: 'Evidencia Directa Ranked Arena (Cero Datos Inventados)',
        liveVerified: true
    };

    enforceRankedArenaConsensusOnStats(manualStats);

    const normKey = typeof window.normalizeSpartanKey === 'function' ? window.normalizeSpartanKey(gamertag) : '';
    if (normKey && window.saveVerifiedProfileToCloud) {
        window.saveVerifiedProfileToCloud(normKey, manualStats);
    }
    window._lastCoachStats = manualStats;
    window.renderCoachIAReport(manualStats);
    if (typeof window.showToast === 'function') {
        window.showToast(`Informe generado con tus datos reales: Rango ${manualStats.rank} (${manualStats.pts} PTS).`);
    }
};

window.recalibrateCoachPillarsLive = function() {
    if (!window._lastCoachStats) return;
    const s = window._lastCoachStats;
    const newKd = parseNormalizedMetricNumber(document.getElementById('coachLiveKdInp')?.value);
    const newCsr = parseNormalizedMetricNumber(document.getElementById('coachLiveCsrInp')?.value);
    const newDmg = parseNormalizedMetricNumber(document.getElementById('coachLiveDmgInp')?.value);
    const newAcc = parseNormalizedMetricNumber(document.getElementById('coachLiveAccInp')?.value);
    const newShots = parseNormalizedMetricNumber(document.getElementById('coachLiveShotsInp')?.value);

    s.kd = (Number.isFinite(newKd) && newKd > 0 && newKd <= 10) ? Number(newKd.toFixed(2)) : null;
    if (Number.isFinite(newCsr) && newCsr >= 300 && newCsr <= 2400) {
        s.csr = Math.round(newCsr);
        s.isSocialOnly = false;
    } else {
        s.csr = null;
        s.isSocialOnly = true;
    }
    s.dmgPerMatch = (Number.isFinite(newDmg) && newDmg > 0) ? Math.round(newDmg) : null;
    s.acc = (Number.isFinite(newAcc) && newAcc > 0 && newAcc <= 100) ? Number(clampNumber(newAcc, 10, 95).toFixed(1)) : null;
    s.shotsFiredPerMatch = (Number.isFinite(newShots) && newShots > 30) ? Math.round(newShots) : null;
    s.liveVerified = true;

    enforceRankedArenaConsensusOnStats(s);

    const normKey = typeof window.normalizeSpartanKey === 'function' ? window.normalizeSpartanKey(s.gamertag) : '';
    if (normKey && window.saveVerifiedProfileToCloud) {
        window.saveVerifiedProfileToCloud(normKey, s);
    }
    window.renderCoachIAReport(s);
    if (typeof window.showToast === 'function') {
        window.showToast(`Recalibrado Ranked Arena: Rango ${s.rank} (${s.pts} PTS).`);
    }
};

window.renderCoachIAReport = function(stats) {
    const container = document.getElementById('coachReportContainer');
    const statusBanner = document.getElementById('coachStatusBanner');
    const focusSelect = document.getElementById('coachFocusProfile')?.value || 'auto';
    if (!container || !stats) return;

    const plan = window.buildCoachDiagnosisAnd3DayPlan(stats, focusSelect);
    window._lastCoachPlan = plan;
    const tierTitles = window.TIER_TITLES_MAP || {};
    const tierTitle = tierTitles[stats.rank] || 'COMANDO ONI';
    const primaryRole = plan.roleInfo.primaryRole;
    const secondaryRole = plan.roleInfo.secondaryRole;
    const idealDuo = plan.roleInfo.idealDuoPartner;
    const matchSynergy = window.analyzeCurrentMatchSynergy();

    const srData = stats.sourcesData?.spartanRecord || (stats.srScore ? { kd: stats.kd, csr: stats.csr, dmg: stats.dmgPerMatch } : null);
    const dhData = stats.sourcesData?.dataHive || (stats.dhScore ? { kd: stats.kd, csr: stats.csr, dmg: stats.dmgPerMatch } : null);
    const htData = stats.sourcesData?.haloTracker || (stats.htScore ? { kd: stats.kd, csr: stats.csr, dmg: stats.dmgPerMatch } : null);

    const renderSourceAuditCard = (title, kdLabel, csrLabel, url, srcObj, scoreVal, borderCol, badgeCol) => {
        if (srcObj || (scoreVal !== null && scoreVal !== undefined)) {
            const sPts = scoreVal ?? window.computeTripleConsensusPts({ csr: srcObj.csr, kd: srcObj.kd, dmgPerMatch: srcObj.dmg }).pts;
            const sRank = window.calculateRankFromPts(sPts);
            return `
                <div class="p-2.5 rounded bg-[#030d1b] border ${borderCol} flex flex-col justify-between gap-1.5">
                    <div class="flex items-center justify-between gap-1">
                        <span class="font-orbitron font-bold text-[11px] text-white truncate">${title}</span>
                        <span class="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-orbitron font-bold text-[9px] shrink-0">✅ CON EVIDENCIA</span>
                    </div>
                    <div class="text-[11px] text-slate-200 flex flex-wrap items-center justify-between gap-1">
                        <span>${kdLabel}: <strong>${fmtOptShort(srcObj?.kd ?? stats.kd)}</strong> | ${csrLabel}: <strong>${fmtOptShort(srcObj?.csr ?? stats.csr)}</strong> | DMG: <strong>${fmtOptShort(srcObj?.dmg ?? stats.dmgPerMatch)}</strong></span>
                    </div>
                    <div class="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
                        <span class="font-orbitron font-bold ${badgeCol}">Sugiere: ${sPts} PTS (Rango ${sRank})</span>
                        <a href="${url}" target="_blank" rel="noopener" class="text-cyan-300 hover:underline font-bold">Ver web ↗</a>
                    </div>
                </div>
            `;
        }
        return `
            <div class="p-2.5 rounded bg-slate-950/70 border border-slate-700/70 flex flex-col justify-between gap-1.5 opacity-80">
                <div class="flex items-center justify-between gap-1">
                    <span class="font-orbitron font-bold text-[11px] text-slate-300 truncate">${title} (${kdLabel} / ${csrLabel})</span>
                    <span class="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 font-orbitron font-bold text-[9px] shrink-0">⚠️ SIN DATOS</span>
                </div>
                <div class="text-[11px] text-slate-400">
                    Esta fuente no entregó datos públicos en vivo (no se inventan valores; se promedian solo las fuentes válidas).
                </div>
                <div class="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
                    <span class="text-slate-500">Excluida del promedio</span>
                    <a href="${url}" target="_blank" rel="noopener" class="text-cyan-400 hover:underline font-bold">Consultar web ↗</a>
                </div>
            </div>
        `;
    };

    const encodedTag = encodeURIComponent(stats.gamertag);
    const srUrl = `https://spartanrecord.com/service_record/${encodedTag}`;
    const dhUrl = `https://halodatahive.com/Player/Infinite/${encodedTag}`;
    const htUrl = `https://halotracker.com/halo-infinite/profile/xbl/${encodedTag}/overview`;

    if (statusBanner) {
        statusBanner.innerHTML = `
            <span class="text-emerald-400 font-bold"><i class="fa-solid fa-circle-check mr-1"></i> Evidencia auditada (${stats.foundSourcesCount || 1}/3 fuentes): <strong>${stats.gamertag}</strong> → Rango ${stats.rank} (${stats.pts} PTS) • Rol: <strong>${primaryRole.shortTitle} (${primaryRole.scorePct}%)</strong></span>
            <div class="flex flex-wrap gap-2">
                <a href="${srUrl}" target="_blank" rel="noopener" class="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/25 text-[11px] font-bold"><i class="fa-solid fa-id-card-clip mr-1"></i>SpartanRecord</a>
                <a href="${dhUrl}" target="_blank" rel="noopener" class="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-amber-300 hover:bg-amber-500/25 text-[11px] font-bold"><i class="fa-solid fa-database mr-1"></i>DataHive</a>
                <a href="${htUrl}" target="_blank" rel="noopener" class="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/25 text-[11px] font-bold"><i class="fa-solid fa-chart-line mr-1"></i>HaloTracker</a>
            </div>
        `;
    }

    const wKdPct = Number.isFinite(Number(stats.activeWeights?.kd)) ? Number(stats.activeWeights.kd) : 60;
    const wCsrPct = Number.isFinite(Number(stats.activeWeights?.csr)) ? Number(stats.activeWeights.csr) : 20;
    const wDmgPct = Number.isFinite(Number(stats.activeWeights?.dmg)) ? Number(stats.activeWeights.dmg) : 20;

    const kdTxt = fmtOpt(stats.kd, ' KDR');
    const csrTxt = fmtOpt(stats.csr, ' CSR');
    const dmgTxt = fmtOpt(stats.dmgPerMatch, ' DMG');
    const dmgTakenTxt = fmtOpt(plan.dmgTaken, ' DMG');
    const netDmgTxt = plan.netDamageDelta !== null ? `${plan.netDamageDelta >= 0 ? '+' : ''}${plan.netDamageDelta} DMG` : 'N/D (Sin lectura)';
    const totalDmgTxt = plan.totalDamage !== null ? `${plan.totalDamage.toLocaleString('es-CO')} DMG` : 'N/D (Sin lectura)';
    const shotsPerMatchTxt = fmtOpt(plan.shotsFiredPerMatch, '/juego');
    const shotsTotalTxt = plan.shotsFiredTotal !== null ? `${plan.shotsFiredTotal.toLocaleString('es-CO')} totales` : 'N/D';
    const shotsHitMatchTxt = fmtOpt(plan.shotsHitPerMatch, '/juego');
    const dmgPerShotTxt = fmtOpt(plan.dmgPerShot, ' DMG/tiro');
    const accTxt = fmtOpt(stats.acc, '%');
    const hsTxt = fmtOpt(stats.hsPct, '%');
    const kdaLineTxt = (stats.killsPerMatch !== null && stats.deathsPerMatch !== null && stats.assistsPerMatch !== null)
        ? `${stats.killsPerMatch}K / ${stats.deathsPerMatch}D / ${stats.assistsPerMatch}A`
        : 'N/D (Sin lectura)';
    const avgLifeTxt = fmtOpt(plan.avgLifeSec, 's');

    // Texto enriquecido con Rol Competitivo HCS para WhatsApp
    window._lastCoachWhatsAppText =
`🧠 *EXPEDIENTE COACH IA SPARTAN PRO V2 | HALO INFINITE*
👤 *Spartan:* ${stats.gamertag}
🏅 *Rango Oficial:* Rango ${stats.rank} (${stats.pts}/25 PTS • ${tierTitle})
🎯 *Rol Competitivo HCS:* ${primaryRole.title} (${primaryRole.scorePct}% Afinidad) | *2.º Rol:* ${secondaryRole.shortTitle}
${idealDuo ? `🤝 *Compañero Ideal de Dúo:* ${idealDuo.name} (${idealDuo.pts} PTS • Rango ${idealDuo.rank})\n` : ''}📡 *Auditoría:* ${stats.foundSourcesCount || 1}/3 fuentes (${stats.source})

⚖️ *1. DESGLOSE MATEMÁTICO PONDERADO (${wKdPct}% KDR + ${wCsrPct}% RANGO + ${wDmgPct}% DAÑO):*
• *Pilar KDR (${wKdPct}%):* ${kdTxt} → *${plan.kdScore}/25 PTS* (Nivel ${plan.kdRank}) | Aporta *${plan.kdWeightedContribution} pts* (Meta SS: > 1.25 KDR)
• *Pilar Rango Arena (${wCsrPct}%):* ${csrTxt} (${plan.arenaLeagueName}) → *${plan.csrScore}/25 PTS* (Nivel ${plan.csrRank}) | Aporta *${plan.csrWeightedContribution} pts* (Meta SS: 1500+ CSR)
• *Pilar Daño/Partida (${wDmgPct}%):* ${dmgTxt} → *${plan.dmgScore}/25 PTS* (Nivel ${plan.dmgRank}) | Aporta *${plan.dmgWeightedContribution} pts* (Meta SS: 4,200+ DMG)
📌 *Diagnóstico de Ascenso:* ${plan.limitingFactorExplanation}

📊 *2. TELEMETRÍA BALÍSTICA Y COMBATE (DAMAGE • SHOTS FIRED • ACCURACY):*
• Damage / Juego: *${dmgTxt}* | Daño Recibido: *${dmgTakenTxt}* | Neto: *${netDmgTxt}* | Total: *${totalDmgTxt}*
• Shots Fired: *${shotsPerMatchTxt}* (${shotsTotalTxt}) | Impactos: *${shotsHitMatchTxt}* | *${dmgPerShotTxt}*
• Disciplina Balística: *${plan.ballisticDiscipline.label}*
• Accuracy: *${accTxt}* | Headshots: *${hsTxt}* | K / D / A: *${kdaLineTxt}* | Vida Prom.: *${avgLifeTxt}*

🏆 *3. MODOS COMPETITIVOS RANKED ARENA (CTF • ODDBALL • ZONES):*
• 🚩 *Capture the Flag (CTF):* *${plan.modesAnalysis.ctf.score}/100 (${plan.modesAnalysis.ctf.tier})* → Rol: *${plan.modesAnalysis.ctf.role}*
• 💀 *Oddball (Bola Loca):* *${plan.modesAnalysis.oddball.score}/100 (${plan.modesAnalysis.oddball.tier})* → Rol: *${plan.modesAnalysis.oddball.role}*
• 🟦 *Zones (Strongholds / KOTH):* *${plan.modesAnalysis.zones.score}/100 (${plan.modesAnalysis.zones.tier})* → Rol: *${plan.modesAnalysis.zones.role}*

🎯 *4. POSICIONAMIENTO RANKED ARENA 4V4:*
${plan.positioningAdvice}

🎙️ *5. COMUNICACIÓN Y CALLOUTS HCS:*
${plan.communicationAdvice}

🎮 *6. CALIBRACIÓN DE MANDO Y FOV (SEGÚN TELEMETRÍA):*
${plan.configAdvice}

🔥 *7. PLAN DE 3 DÍAS (${plan.activeFocusLabel.toUpperCase()}):*
1️⃣ *${plan.day1}*

2️⃣ *${plan.day2}*

3️⃣ *${plan.day3}*`;

    const haloAccVal = fmtOptShort(stats.acc, '%');
    const bulletClassMap = { emerald: 'bullet-emerald', amber: 'bullet-amber', rose: 'bullet-rose', cyan: '', purple: '' };
    const haloBulletsHtml = (plan.tacticalBullets || []).map(b => `
        <li class="flex items-start gap-2 ${bulletClassMap[b.color] || ''}">
            <span class="shrink-0">${b.icon}</span>
            <span><strong class="font-orbitron text-[10px] uppercase tracking-wider mr-1">${b.tag}:</strong>${b.text}</span>
        </li>
    `).join('');

    container.classList.remove('hidden');
    container.innerHTML = `
        <!-- TARJETA TIPO HALO (VISTA INMEDIATA CONCISA — CERO MUROS DE TEXTO) -->
        <div class="halo-coach-card p-4 space-y-3.5">
            <!-- Cabecera estilo visor UNSC / Spartan Tag -->
            <div class="flex flex-wrap items-start justify-between gap-3 border-b border-cyan-400/25 pb-3">
                <div class="space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-[10px] font-orbitron text-emerald-400 uppercase tracking-widest font-bold">UNSC VISOR // ${stats.foundSourcesCount || 1}/3 FUENTES</span>
                        <span class="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 text-[10px] font-orbitron text-slate-300">${stats.incompleteTelemetry ? 'TELEMETRÍA PARCIAL' : 'CONSENSUS 60/20/20'}</span>
                    </div>
                    <h4 class="font-orbitron font-black text-lg sm:text-2xl text-white flex flex-wrap items-center gap-2">
                        <span>${stats.gamertag}</span>
                        <span class="px-2.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/60 text-cyan-200 text-xs sm:text-sm font-black">Rango ${stats.rank} • ${stats.pts}/25 PTS</span>
                        <span class="px-2.5 py-0.5 rounded ${primaryRole.colorBg} border ${primaryRole.colorBorder} ${primaryRole.colorText} text-xs font-bold"><i class="fa-solid ${primaryRole.icon} mr-1"></i>${primaryRole.shortTitle} (${primaryRole.scorePct}%)</span>
                    </h4>
                </div>
                <div class="text-right hidden sm:block">
                    <div class="text-[10px] font-orbitron text-slate-400 uppercase">Clasificación</div>
                    <div class="text-xs font-orbitron font-bold text-amber-300">${tierTitle}</div>
                </div>
            </div>

            <!-- 4 KPIs Visuales (KDR, CSRS/Ranked Arena, Damage/Game, Accuracy) -->
            <div class="halo-kpi-grid">
                <div class="halo-kpi-cell border-amber-400/45">
                    <span class="text-[10px] font-orbitron text-amber-300 uppercase">KDR (${wKdPct}%)</span>
                    <strong class="font-orbitron text-xl text-white">${fmtOptShort(stats.kd)}</strong>
                    <span class="text-[10px] text-slate-400">${plan.kdScore}/25 PTS (${plan.kdRank})</span>
                </div>
                <div class="halo-kpi-cell border-cyan-400/45">
                    <span class="text-[10px] font-orbitron text-cyan-300 uppercase">CSRS / Ranked Arena (${wCsrPct}%)</span>
                    <strong class="font-orbitron text-xl text-white">${fmtOptShort(stats.csr)}</strong>
                    <span class="text-[10px] text-slate-400 truncate">${plan.arenaLeagueName}</span>
                </div>
                <div class="halo-kpi-cell border-emerald-400/45">
                    <span class="text-[10px] font-orbitron text-emerald-300 uppercase">Damage / Game (${wDmgPct}%)</span>
                    <strong class="font-orbitron text-xl text-white">${fmtOptShort(stats.dmgPerMatch)}</strong>
                    <span class="text-[10px] text-slate-400">${plan.dmgScore}/25 PTS (${plan.dmgRank})</span>
                </div>
                <div class="halo-kpi-cell border-purple-400/45">
                    <span class="text-[10px] font-orbitron text-purple-300 uppercase">Accuracy</span>
                    <strong class="font-orbitron text-xl text-white">${haloAccVal}</strong>
                    <span class="text-[10px] text-slate-400">${stats.hsPct !== null ? `${stats.hsPct}% HS` : 'Sin lectura HS'}</span>
                </div>
            </div>

            <!-- Viñetas Tácticas Cortas (3-4 bullets, <= 12 palabras c/u) -->
            <ul class="halo-tactical-bullets">
                ${haloBulletsHtml}
            </ul>

            <!-- Barra de Exportación Rápida (WhatsApp / PNG HD / PDF) -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-cyan-400/20">
                <span class="text-[10px] font-orbitron text-slate-400 uppercase"><i class="fa-solid fa-bolt text-cyan-300 mr-1"></i>Acciones Rápidas y Exportación</span>
                <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button type="button" onclick="copyCoachReportToWhatsApp()" class="flex-1 sm:flex-initial justify-center hud-btn px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-orbitron font-black text-xs flex items-center gap-1.5">
                        <i class="fa-brands fa-whatsapp text-sm"></i> WhatsApp
                    </button>
                    <button type="button" onclick="downloadCoachReportVisualPNG()" class="flex-1 sm:flex-initial justify-center hud-btn px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-black font-orbitron font-black text-xs flex items-center gap-1.5">
                        <i class="fa-solid fa-image text-xs"></i> PNG HD
                    </button>
                    <button type="button" onclick="downloadCoachReportCleanHTML()" class="flex-1 sm:flex-initial justify-center hud-btn px-3 py-1.5 bg-amber-400/20 hover:bg-amber-400/35 border border-amber-400/60 text-amber-200 font-orbitron font-bold text-xs flex items-center gap-1.5">
                        <i class="fa-solid fa-file-arrow-down text-xs"></i> PDF / HTML
                    </button>
                </div>
            </div>
        </div>

        <!-- TARJETA BAJO DEMANDA 1: PLAN DE ENTRENAMIENTO (3 DÍAS) -->
        <details class="halo-demand-card">
            <summary class="halo-demand-summary">
                <span class="font-orbitron font-black text-xs sm:text-sm text-emerald-300 flex items-center gap-2">
                    <span>📅 Ver Plan de Entrenamiento (3 Días)</span>
                    <span class="text-[10px] font-normal px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-200">${plan.activeFocusLabel}</span>
                </span>
                <i class="fa-solid fa-chevron-down halo-demand-chevron text-emerald-300"></i>
            </summary>
            <div class="p-3.5 pt-2 border-t border-emerald-500/20 space-y-3 text-xs sm:text-sm">
                <div class="space-y-2">
                    <div class="p-3 rounded bg-[#05182e] border-l-4 border-amber-400 text-slate-100 leading-relaxed">
                        <span class="text-amber-300 font-orbitron font-black block mb-1"><i class="fa-solid fa-1 mr-1"></i> ${plan.day1.split(':')[0]}:</span>
                        <span id="coachDay1Text">${plan.day1.split(':').slice(1).join(':')}</span>
                    </div>
                    <div class="p-3 rounded bg-[#05182e] border-l-4 border-emerald-400 text-slate-100 leading-relaxed">
                        <span class="text-emerald-300 font-orbitron font-black block mb-1"><i class="fa-solid fa-2 mr-1"></i> ${plan.day2.split(':')[0]}:</span>
                        <span id="coachDay2Text">${plan.day2.split(':').slice(1).join(':')}</span>
                    </div>
                    <div class="p-3 rounded bg-[#05182e] border-l-4 border-cyan-400 text-slate-100 leading-relaxed">
                        <span class="text-cyan-300 font-orbitron font-black block mb-1"><i class="fa-solid fa-3 mr-1"></i> ${plan.day3.split(':')[0]}:</span>
                        <span id="coachDay3Text">${plan.day3.split(':').slice(1).join(':')}</span>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div class="p-3 rounded bg-[#041326] border border-amber-400/35">
                        <div class="font-orbitron font-bold text-[11px] text-amber-300 uppercase mb-1">🎯 Posicionamiento Ranked Arena 4v4</div>
                        <p id="coachPositioningAdviceText" class="text-slate-200 leading-relaxed">${plan.positioningAdvice}</p>
                    </div>
                    <div class="p-3 rounded bg-[#041326] border border-emerald-400/35">
                        <div class="font-orbitron font-bold text-[11px] text-emerald-300 uppercase mb-1">🎙️ Comunicación y Callouts HCS</div>
                        <p id="coachCommAdviceText" class="text-slate-200 leading-relaxed">${plan.communicationAdvice}</p>
                    </div>
                    <div class="p-3 rounded bg-[#041326] border border-purple-400/35 sm:col-span-2">
                        <div class="font-orbitron font-bold text-[11px] text-purple-300 uppercase mb-1">🎮 Calibración de Mando y FOV (${fmtOptShort(stats.acc, '%')} ACC)</div>
                        <p class="text-slate-200 leading-relaxed">${plan.configAdvice}</p>
                    </div>
                </div>
            </div>
        </details>

        <!-- TARJETA BAJO DEMANDA 2: ANÁLISIS POR MODOS (CTF / ODDBALL / ZONES) -->
        <details class="halo-demand-card">
            <summary class="halo-demand-summary">
                <span class="font-orbitron font-black text-xs sm:text-sm text-indigo-300 flex items-center gap-2">
                    <span>🎮 Ver Análisis por Modos (CTF / Oddball / Zones)</span>
                    <span class="text-[10px] font-normal px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-400/40 text-indigo-200">Rol: ${primaryRole.shortTitle}</span>
                </span>
                <i class="fa-solid fa-chevron-down halo-demand-chevron text-indigo-300"></i>
            </summary>
            <div class="p-3.5 pt-2 border-t border-indigo-500/20 space-y-3">
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div class="p-3 rounded-lg bg-[#05162b] border border-cyan-400/50 space-y-1.5">
                        <div class="flex items-center justify-between">
                            <span class="font-orbitron font-black text-xs text-cyan-300">🚩 CAPTURE THE FLAG</span>
                            <span class="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 font-orbitron font-bold text-[10px]">${plan.modesAnalysis.ctf.score}/100 • ${plan.modesAnalysis.ctf.tier}</span>
                        </div>
                        <div class="text-[11px] font-bold text-white">Rol: <span class="text-cyan-300">${plan.modesAnalysis.ctf.role}</span></div>
                        <p class="text-[11px] text-slate-300 leading-relaxed">${plan.modesAnalysis.ctf.protocol}</p>
                    </div>

                    <div class="p-3 rounded-lg bg-[#05162b] border border-amber-400/50 space-y-1.5">
                        <div class="flex items-center justify-between">
                            <span class="font-orbitron font-black text-xs text-amber-300">💀 ODDBALL (BOLA LOCA)</span>
                            <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 font-orbitron font-bold text-[10px]">${plan.modesAnalysis.oddball.score}/100 • ${plan.modesAnalysis.oddball.tier}</span>
                        </div>
                        <div class="text-[11px] font-bold text-white">Rol: <span class="text-amber-300">${plan.modesAnalysis.oddball.role}</span></div>
                        <p class="text-[11px] text-slate-300 leading-relaxed">${plan.modesAnalysis.oddball.protocol}</p>
                    </div>

                    <div class="p-3 rounded-lg bg-[#05162b] border border-emerald-400/50 space-y-1.5">
                        <div class="flex items-center justify-between">
                            <span class="font-orbitron font-black text-xs text-emerald-300">🟦 ZONES (STRONGHOLDS / KOTH)</span>
                            <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 font-orbitron font-bold text-[10px]">${plan.modesAnalysis.zones.score}/100 • ${plan.modesAnalysis.zones.tier}</span>
                        </div>
                        <div class="text-[11px] font-bold text-white">Rol: <span class="text-emerald-300">${plan.modesAnalysis.zones.role}</span></div>
                        <p class="text-[11px] text-slate-300 leading-relaxed">${plan.modesAnalysis.zones.protocol}</p>
                    </div>
                </div>
            </div>
        </details>

        <!-- TARJETA BAJO DEMANDA 3: TELEMETRÍA BALÍSTICA Y AUDITORÍA DE FUENTES -->
        <details class="halo-demand-card">
            <summary class="halo-demand-summary">
                <span class="font-orbitron font-black text-xs sm:text-sm text-sky-300 flex items-center gap-2">
                    <span>📡 Ver Telemetría Balística y Auditoría de Fuentes</span>
                    <span class="text-[10px] font-normal px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/40 text-sky-200">${wKdPct}/${wCsrPct}/${wDmgPct} • ${stats.foundSourcesCount || 1}/3 Fuentes</span>
                </span>
                <i class="fa-solid fa-chevron-down halo-demand-chevron text-sky-300"></i>
            </summary>
            <div class="p-3.5 pt-2 border-t border-sky-500/20 space-y-3">
                <div class="p-3 rounded-lg bg-[#041326] border border-cyan-500/35 space-y-2.5">
                    <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span class="font-orbitron font-bold text-cyan-300 uppercase">Desglose Matemático (${wKdPct}% KDR + ${wCsrPct}% Rango + ${wDmgPct}% Daño)</span>
                        <span class="font-orbitron font-bold text-emerald-300">Suma: ${plan.rawWeightedSum} → ${stats.pts}/25 PTS (Rango ${stats.rank})</span>
                    </div>
                    <p id="coachReadingAnalysisText" class="text-xs text-slate-200 leading-relaxed">${plan.readingAnalysis}</p>
                    <div class="p-2 rounded bg-amber-500/10 border border-amber-400/35 text-xs text-slate-100">
                        <strong class="font-orbitron text-amber-300 text-[10px] uppercase mr-1">Límite de Ascenso:</strong>${plan.limitingFactorExplanation}
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div class="p-3 rounded bg-[#05162b] border border-emerald-400/40 space-y-1">
                        <div class="font-orbitron font-bold text-[10px] text-emerald-300 uppercase">💥 Damage / Daño</div>
                        <div class="font-orbitron font-black text-base text-white">${stats.dmgPerMatch !== null ? `${stats.dmgPerMatch} DMG/juego` : 'N/D (Sin lectura)'}</div>
                        <div class="text-[11px] text-slate-300">Recibido: <strong>${fmtOptShort(plan.dmgTaken)}</strong> | Neto: <strong>${plan.netDamageDelta !== null ? `${plan.netDamageDelta >= 0 ? '+' : ''}${plan.netDamageDelta}` : 'N/D'}</strong></div>
                        <div class="text-[10px] text-slate-400">Total: <strong>${totalDmgTxt}</strong></div>
                    </div>
                    <div class="p-3 rounded bg-[#05162b] border border-sky-400/40 space-y-1">
                        <div class="font-orbitron font-bold text-[10px] text-sky-300 uppercase">🔫 Shots Fired</div>
                        <div class="font-orbitron font-black text-base text-white">${plan.shotsFiredPerMatch !== null ? `${plan.shotsFiredPerMatch} tiros/juego` : 'N/D (Sin lectura)'}</div>
                        <div class="text-[11px] text-slate-300">Impactos: <strong>${fmtOptShort(plan.shotsHitPerMatch, '/j')}</strong> | <strong>${fmtOptShort(plan.dmgPerShot, ' DMG/tiro')}</strong></div>
                        <div class="text-[10px] text-slate-400">Totales: <strong>${plan.shotsFiredTotal !== null ? plan.shotsFiredTotal.toLocaleString('es-CO') : 'N/D'}</strong></div>
                    </div>
                    <div class="p-3 rounded bg-[#05162b] border border-purple-400/40 space-y-1">
                        <div class="font-orbitron font-bold text-[10px] text-purple-300 uppercase">🎯 Accuracy & K/D/A</div>
                        <div class="font-orbitron font-black text-base text-white">${accTxt}</div>
                        <div class="text-[11px] text-slate-300">HS: <strong>${hsTxt}</strong> | K/D/A: <strong>${kdaLineTxt}</strong></div>
                        <div class="text-[10px] text-slate-400">Disciplina: <strong class="${plan.ballisticDiscipline.color}">${plan.ballisticDiscipline.label}</strong></div>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    ${renderSourceAuditCard('SpartanRecord.com', 'KDR', 'CSRS', srUrl, srData, stats.srScore, 'border-emerald-500/40', 'text-emerald-300')}
                    ${renderSourceAuditCard('HaloDataHive.com', 'K/D', 'Ranked Arena', dhUrl, dhData, stats.dhScore, 'border-amber-500/40', 'text-amber-300')}
                    ${renderSourceAuditCard('Halo Tracker', 'K/D Ratio', 'Ranked Arena', htUrl, htData, stats.htScore, 'border-cyan-500/40', 'text-cyan-300')}
                </div>

                <div class="p-2.5 rounded bg-[#041428] border border-cyan-500/30 text-xs grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                    <div>
                        <label class="block text-[9px] font-orbitron text-amber-300 uppercase">KDR</label>
                        <input id="coachLiveKdInp" type="number" step="0.01" value="${stats.kd ?? ''}" placeholder="N/D" class="w-full px-2 py-1 rounded bg-[#020913] border border-amber-400/40 text-white font-orbitron font-bold text-xs">
                    </div>
                    <div>
                        <label class="block text-[9px] font-orbitron text-cyan-300 uppercase">CSRS / Arena</label>
                        <input id="coachLiveCsrInp" type="number" step="10" value="${stats.csr ?? ''}" placeholder="N/D" class="w-full px-2 py-1 rounded bg-[#020913] border border-cyan-400/40 text-white font-orbitron font-bold text-xs">
                    </div>
                    <div>
                        <label class="block text-[9px] font-orbitron text-emerald-300 uppercase">Damage / Juego</label>
                        <input id="coachLiveDmgInp" type="number" step="50" value="${stats.dmgPerMatch ?? ''}" placeholder="N/D" class="w-full px-2 py-1 rounded bg-[#020913] border border-emerald-400/40 text-white font-orbitron font-bold text-xs">
                    </div>
                    <div>
                        <label class="block text-[9px] font-orbitron text-purple-300 uppercase">Accuracy %</label>
                        <input id="coachLiveAccInp" type="number" step="0.1" value="${stats.acc ?? ''}" placeholder="N/D" class="w-full px-2 py-1 rounded bg-[#020913] border border-purple-400/40 text-white font-orbitron font-bold text-xs">
                    </div>
                    <div>
                        <label class="block text-[9px] font-orbitron text-sky-300 uppercase">Shots Fired/J</label>
                        <input id="coachLiveShotsInp" type="number" step="5" value="${plan.shotsFiredPerMatch ?? ''}" placeholder="N/D" class="w-full px-2 py-1 rounded bg-[#020913] border border-sky-400/40 text-white font-orbitron font-bold text-xs">
                    </div>
                    <button type="button" onclick="recalibrateCoachPillarsLive()" class="hud-btn py-1.5 px-3 bg-cyan-500 hover:bg-cyan-400 text-black font-orbitron font-black text-[11px]">
                        Recalcular
                    </button>
                </div>
            </div>
        </details>

        ${matchSynergy ? `
        <details class="halo-demand-card">
            <summary class="halo-demand-summary">
                <span class="font-orbitron font-black text-xs sm:text-sm text-purple-300 flex items-center gap-2">
                    <span>⚔️ Ver Sinergia de Escuadra en Sala (Eagle vs Cobra)</span>
                    <span class="text-[10px] font-normal px-2 py-0.5 rounded bg-purple-500/15 border border-purple-400/40 text-purple-200">${matchSynergy.modeLabel} • Dif ${matchSynergy.ptsDiff} PTS</span>
                </span>
                <i class="fa-solid fa-chevron-down halo-demand-chevron text-purple-300"></i>
            </summary>
            <div class="p-3 pt-2 border-t border-purple-500/20">
                ${buildMatchSynergyHtmlBlock(matchSynergy)}
            </div>
        </details>` : ''}
    `;

    // Enriquecimiento asíncrono opcional $0 USD (no bloquea el renderizado determinista instantáneo)
    window.tryFetchHybridGeminiCoachEnrichment(stats, plan).then(enrichment => {
        if (!enrichment) return;
        if (enrichment.positioningAdvice) {
            const el = document.getElementById('coachPositioningAdviceText');
            if (el) el.innerText = enrichment.positioningAdvice;
            plan.positioningAdvice = enrichment.positioningAdvice;
        }
        if (enrichment.communicationAdvice) {
            const el = document.getElementById('coachCommAdviceText');
            if (el) el.innerText = enrichment.communicationAdvice;
            plan.communicationAdvice = enrichment.communicationAdvice;
        }
    }).catch(() => {});
};

// ============================================================================
// 7. EXPORTADORES V2: WHATSAPP, CANVAS PNG HD (1200x2120) Y FICHA HTML/PDF
// ============================================================================
window.copyCoachReportToWhatsApp = function() {
    if (!window._lastCoachWhatsAppText) return;
    const ta = document.createElement('textarea');
    ta.value = window._lastCoachWhatsAppText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (typeof window.showToast === 'function') {
        window.showToast('¡Expediente completo del Coach IA V2 copiado para WhatsApp!');
    }
};

function wrapCanvasLines(ctx, text, maxWidth) {
    const words = String(text || '').split(' ');
    const lines = [];
    let currentLine = '';
    for (let i = 0; i < words.length; i++) {
        const testLine = currentLine ? currentLine + ' ' + words[i] : words[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

window.downloadCoachReportVisualPNG = function() {
    const stats = window._lastCoachStats;
    const plan = window._lastCoachPlan;
    if (!stats || !plan) {
        if (typeof window.showToast === 'function') {
            window.showToast('Primero genera el análisis de un Spartan.');
        }
        return;
    }

    const tierTitles = window.TIER_TITLES_MAP || {};
    const tierTitle = tierTitles[stats.rank] || 'COMANDO ONI';
    const primaryRole = plan.roleInfo?.primaryRole;
    const canvas = document.createElement('canvas');
    const width = 1200;
    const height = 2120;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#020813');
    bgGrad.addColorStop(0.5, '#051529');
    bgGrad.addColorStop(1, '#020914');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, width - 48, height - 48);

    ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
    ctx.fillRect(44, 44, width - 88, 135);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 44, width - 88, 135);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 17px Orbitron, sans-serif';
    ctx.fillText(`UNSC TAC-BALANCER // COACH IA V2 • ROL HCS: ${primaryRole ? primaryRole.shortTitle + ' (' + primaryRole.scorePct + '%)' : 'SPARTAN'}`, 70, 82);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 40px Orbitron, sans-serif';
    ctx.fillText(`SPARTAN: ${stats.gamertag.toUpperCase()}`, 70, 130);

    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 20px Rajdhani, sans-serif';
    ctx.fillText(`RANGO ${stats.rank} (${stats.pts} PTS • ${tierTitle})  |  CSR: ${fmtOptShort(stats.csr)}  |  RANKED ARENA 4V4`, 70, 162);

    const metrics = [
        { lbl: 'KDR RANKED', val: fmtOptShort(stats.kd), sub: `Meta: ${plan.targetGodKd}`, col: '#00e5ff' },
        { lbl: 'DAMAGE / JUEGO', val: fmtOptShort(stats.dmgPerMatch), sub: `Neto: ${plan.netDamageDelta !== null ? `${plan.netDamageDelta >= 0 ? '+' : ''}${plan.netDamageDelta}` : 'N/D'}`, col: '#facc15' },
        { lbl: 'SHOTS FIRED / J', val: fmtOptShort(plan.shotsFiredPerMatch), sub: plan.dmgPerShot !== null ? `${plan.dmgPerShot} DMG/tiro` : 'N/D', col: '#38bdf8' },
        { lbl: 'ACCURACY / HS', val: fmtOptShort(stats.acc, '%'), sub: stats.hsPct !== null ? `${stats.hsPct}% Cabeza` : 'HS: N/D', col: '#fde047' },
        { lbl: 'ROL HCS ASIGNADO', val: primaryRole ? primaryRole.shortTitle.split(' ')[0] : 'FLEX', sub: `${primaryRole ? primaryRole.scorePct : 85}% Afinidad`, col: '#10b981' },
        { lbl: 'MODO CTF', val: `${plan.modesAnalysis.ctf.score}/100`, sub: plan.modesAnalysis.ctf.role.split('(')[0].trim(), col: '#22d3ee' },
        { lbl: 'MODO ODDBALL', val: `${plan.modesAnalysis.oddball.score}/100`, sub: plan.modesAnalysis.oddball.role.split('(')[0].trim(), col: '#fbbf24' },
        { lbl: 'MODO ZONES', val: `${plan.modesAnalysis.zones.score}/100`, sub: plan.modesAnalysis.zones.role.split('(')[0].trim(), col: '#34d399' }
    ];

    const boxW = 264;
    const boxH = 98;
    metrics.forEach((m, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const bx = 44 + col * (boxW + 18.5);
        const by = 200 + row * (boxH + 14);
        ctx.fillStyle = '#041224';
        ctx.fillRect(bx, by, boxW, boxH);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, boxW, boxH);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 14px Orbitron, sans-serif';
        ctx.fillText(m.lbl, bx + 16, by + 26);

        ctx.fillStyle = m.col;
        ctx.font = '900 30px Orbitron, sans-serif';
        ctx.fillText(m.val, bx + 16, by + 62);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 15px Rajdhani, sans-serif';
        ctx.fillText(m.sub, bx + 16, by + 85);
    });

    let cursorY = 442;
    function drawSectionCard(title, bodyText, borderColor, titleColor) {
        ctx.font = '600 21px Rajdhani, sans-serif';
        const lines = wrapCanvasLines(ctx, bodyText, width - 140);
        const cardH = Math.max(96, 54 + lines.length * 27);

        ctx.fillStyle = 'rgba(4, 18, 36, 0.94)';
        ctx.fillRect(44, cursorY, width - 88, cardH);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(44, cursorY, width - 88, cardH);

        ctx.fillStyle = borderColor;
        ctx.fillRect(44, cursorY, 8, cardH);

        ctx.fillStyle = titleColor;
        ctx.font = 'bold 18px Orbitron, sans-serif';
        ctx.fillText(title, 68, cursorY + 32);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '600 21px Rajdhani, sans-serif';
        lines.forEach((line, idx) => {
            ctx.fillText(line, 68, cursorY + 64 + idx * 27);
        });

        cursorY += cardH + 16;
    }

    drawSectionCard('🎯 ROL HCS Y ESLABÓN A CORREGIR', `FORTALEZA: ${plan.strengths}   |   A CORREGIR: ${plan.weakness}`, '#10b981', '#34d399');
    drawSectionCard('📊 1. ANÁLISIS PONDERADO Y LECTURA DE JUEGO', plan.readingAnalysis, '#00e5ff', '#38bdf8');
    drawSectionCard('🎯 2. POSICIONAMIENTO RANKED ARENA 4V4', plan.positioningAdvice, '#f59e0b', '#fbbf24');
    drawSectionCard('🎙️ 3. COMUNICACIÓN Y CALLOUTS HCS', plan.communicationAdvice, '#10b981', '#34d399');
    drawSectionCard('🎮 4. CALIBRACIÓN DE MANDO Y FOV (SEGÚN TELEMETRÍA)', plan.configAdvice, '#a855f7', '#c084fc');

    ctx.fillStyle = '#10b981';
    ctx.font = '900 22px Orbitron, sans-serif';
    ctx.fillText(`🔥 PLAN DE 3 DÍAS • ${plan.activeFocusLabel.toUpperCase()}`, 44, cursorY + 24);
    cursorY += 38;

    drawSectionCard('DÍA 1 • CORRECCIÓN PRIORITARIA DE IMPACTO', plan.day1, '#00e5ff', '#67e8f9');
    drawSectionCard('DÍA 2 • SINCRONIZACIÓN Y CONTROL DE MAPA', plan.day2, '#f59e0b', '#fcd34d');
    drawSectionCard('DÍA 3 • DOMINIO DE ARENA Y RUTA A RANGO SS', plan.day3, '#10b981', '#6ee7b7');

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 15px Orbitron, sans-serif';
    ctx.fillText('MANSALVAS TAC-BALANCER V2 // TRIPLE AUDITORÍA (SPARTANRECORD + HALODATAHIVE + HALO TRACKER)', 44, height - 42);

    const link = document.createElement('a');
    const safeName = stats.gamertag.replace(/[^a-z0-9]/gi, '_');
    link.download = `Coach_IA_Halo_${safeName}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (typeof window.showToast === 'function') {
        window.showToast(`¡Imagen HD de ${stats.gamertag} descargada con éxito!`);
    }
};

window.downloadCoachReportCleanHTML = function() {
    const stats = window._lastCoachStats;
    const plan = window._lastCoachPlan;
    if (!stats || !plan) return;
    const tierTitles = window.TIER_TITLES_MAP || {};
    const tierTitle = tierTitles[stats.rank] || 'COMANDO ONI';
    const primaryRole = plan.roleInfo?.primaryRole;

    const htmlDoc = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Expediente Coach IA V2 Halo Infinite - ${stats.gamertag}</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
<style>
    body { background:#030914; color:#eaf6ff; font-family:'Rajdhani',sans-serif; margin:0; padding:24px; line-height:1.5; }
    .dossier { max-width:900px; margin:0 auto; background:#051326; border:2px solid #00e5ff; border-radius:12px; padding:28px; box-shadow:0 0 35px rgba(0,229,255,0.2); }
    h1, h2, h3, .orb { font-family:'Orbitron',sans-serif; }
    .header { border-bottom:2px solid rgba(0,229,255,0.35); padding-bottom:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
    .grid-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin-bottom:20px; }
    .stat-card { background:#020a15; border:1px solid rgba(0,229,255,0.35); border-radius:8px; padding:10px; text-align:center; }
    .stat-val { font-family:'Orbitron',sans-serif; font-size:22px; font-weight:900; color:#00e5ff; }
    .card { background:#030d1b; border-left:4px solid #00e5ff; border-radius:8px; padding:14px 18px; margin-bottom:14px; font-size:17px; }
    .btn-print { background:#00e5ff; color:#000; border:none; padding:10px 18px; font-family:'Orbitron',sans-serif; font-weight:800; border-radius:6px; cursor:pointer; }
    @media print { .btn-print { display:none; } body { background:#030914; -webkit-print-color-adjust:exact; } }
</style>
</head>
<body>
<div class="dossier">
    <div class="header">
        <div>
            <div class="orb" style="color:#10b981;font-size:11px;letter-spacing:2px;">UNSC TAC-BALANCER V2 • TRIPLE TELEMETRÍA + CLASIFICADOR HCS</div>
            <h1 style="margin:4px 0;font-size:28px;color:#fff;">SPARTAN: ${stats.gamertag}</h1>
            <div class="orb" style="color:#00e5ff;font-size:13px;">Rango ${stats.rank} (${stats.pts} PTS • ${tierTitle}) | Rol HCS: ${primaryRole ? primaryRole.title : 'Flex'} (${primaryRole ? primaryRole.scorePct : 85}%)</div>
        </div>
        <button class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button>
    </div>
    <div class="grid-stats">
        <div class="stat-card"><div style="font-size:12px;color:#94a3b8;">KDR RANKED</div><div class="stat-val">${fmtOptShort(stats.kd)}</div><div style="font-size:12px;color:#10b981;">Meta: ${plan.targetGodKd}</div></div>
        <div class="stat-card"><div style="font-size:12px;color:#94a3b8;">DAMAGE / JUEGO</div><div class="stat-val" style="color:#facc15;">${fmtOptShort(stats.dmgPerMatch)}</div><div style="font-size:12px;">Neto: ${plan.netDamageDelta !== null ? `${plan.netDamageDelta >= 0 ? '+' : ''}${plan.netDamageDelta} DMG` : 'N/D'}</div></div>
        <div class="stat-card"><div style="font-size:12px;color:#94a3b8;">ARENA CSR</div><div class="stat-val" style="color:#38bdf8;">${fmtOptShort(stats.csr)}</div><div style="font-size:12px;">${plan.arenaLeagueName}</div></div>
        <div class="stat-card"><div style="font-size:12px;color:#94a3b8;">SHOTS FIRED / J</div><div class="stat-val" style="color:#c084fc;">${fmtOptShort(plan.shotsFiredPerMatch)}</div><div style="font-size:12px;">${plan.dmgPerShot !== null ? `${plan.dmgPerShot} DMG/tiro` : 'N/D'}</div></div>
        <div class="stat-card"><div style="font-size:12px;color:#94a3b8;">K / D / A</div><div class="stat-val" style="color:#fff;font-size:18px;">${(stats.killsPerMatch !== null && stats.deathsPerMatch !== null && stats.assistsPerMatch !== null) ? `${stats.killsPerMatch}/${stats.deathsPerMatch}/${stats.assistsPerMatch}` : 'N/D'}</div><div style="font-size:12px;">Por partida</div></div>
        <div class="stat-card"><div style="font-size:12px;color:#94a3b8;">ACCURACY / HS</div><div class="stat-val" style="color:#fde047;">${fmtOptShort(stats.acc, '%')}</div><div style="font-size:12px;">${stats.hsPct !== null ? `${stats.hsPct}% Cabeza` : 'HS: N/D'}</div></div>
    </div>
    <div class="card" style="border-left-color:#38bdf8;"><strong class="orb" style="color:#38bdf8;font-size:13px;display:block;">🔫 TELEMETRÍA BALÍSTICA (${plan.ballisticDiscipline.label.toUpperCase()}):</strong>Damage Total: ${plan.totalDamage !== null ? `${plan.totalDamage.toLocaleString('es-CO')} DMG` : 'N/D'} | Shots Fired Totales: ${plan.shotsFiredTotal !== null ? `${plan.shotsFiredTotal.toLocaleString('es-CO')} (${fmtOptShort(plan.shotsHitPerMatch, ' impactos/juego')})` : 'N/D'}. ${plan.ballisticDiscipline.detail}</div>
    <div class="card" style="border-left-color:#818cf8;"><strong class="orb" style="color:#818cf8;font-size:13px;display:block;">🏆 MODOS RANKED ARENA (CTF • ODDBALL • ZONES):</strong>🚩 <strong>CTF (${plan.modesAnalysis.ctf.score}/100 - ${plan.modesAnalysis.ctf.role}):</strong> ${plan.modesAnalysis.ctf.protocol}<br>💀 <strong>Oddball (${plan.modesAnalysis.oddball.score}/100 - ${plan.modesAnalysis.oddball.role}):</strong> ${plan.modesAnalysis.oddball.protocol}<br>🟦 <strong>Zones (${plan.modesAnalysis.zones.score}/100 - ${plan.modesAnalysis.zones.role}):</strong> ${plan.modesAnalysis.zones.protocol}</div>
    <div class="card" style="border-left-color:#10b981;"><strong class="orb" style="color:#10b981;font-size:13px;display:block;">🎯 ROL COMPETITIVO HCS Y FORTALEZA ACTUAL:</strong>${plan.strengths}</div>
    <div class="card" style="border-left-color:#fb7185;"><strong class="orb" style="color:#fb7185;font-size:13px;display:block;">⚠️ ESLABÓN PRINCIPAL A CORREGIR:</strong>${plan.weakness}</div>
    <div class="card" style="border-left-color:#00e5ff;"><strong class="orb" style="color:#00e5ff;font-size:13px;display:block;">📊 1. ANÁLISIS DE RESULTADOS Y LECTURA DE JUEGO:</strong>${plan.readingAnalysis}</div>
    <div class="card" style="border-left-color:#f59e0b;"><strong class="orb" style="color:#f59e0b;font-size:13px;display:block;">🎯 2. POSICIONAMIENTO RANKED ARENA 4V4:</strong>${plan.positioningAdvice}</div>
    <div class="card" style="border-left-color:#10b981;"><strong class="orb" style="color:#10b981;font-size:13px;display:block;">🎙️ 3. COMUNICACIÓN Y CALLOUTS HCS:</strong>${plan.communicationAdvice}</div>
    <div class="card" style="border-left-color:#a855f7;"><strong class="orb" style="color:#a855f7;font-size:13px;display:block;">🎮 4. CALIBRACIÓN DE MANDO Y FOV:</strong>${plan.configAdvice}</div>
    <h2 style="color:#10b981;font-size:18px;margin-top:24px;">🔥 PLAN DE ENTRENAMIENTO TÁCTICO EN 3 DÍAS (${plan.activeFocusLabel.toUpperCase()})</h2>
    <div class="card" style="border-left-color:#00e5ff;">${plan.day1}</div>
    <div class="card" style="border-left-color:#f59e0b;">${plan.day2}</div>
    <div class="card" style="border-left-color:#10b981;">${plan.day3}</div>
</div>
</body>
</html>`;

    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = stats.gamertag.replace(/[^a-z0-9]/gi, '_');
    a.href = url;
    a.download = `Expediente_Coach_Halo_${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof window.showToast === 'function') {
        window.showToast(`¡Ficha táctica limpia de ${stats.gamertag} descargada!`);
    }
};

})();
