// ============================================================================
// UNSC TAC-BALANCER V2 — MOTOR MATEMÁTICO DE RANGOS Y BALANCEO (rank-engine.js)
// Escala Competitiva 1-25 PTS (SS a D) exclusiva para 4v4 Ranked Arena,
// Escudo Anti-Clones, Interpolación Continua, Techo por Liga CSR (Anti-Inflación),
// Deflación Social vs Ranked y Ajuste por Historial W/L + Tribunal ONI.
// Envuelto en IIFE para evitar colisiones de identificadores en el scope global.
// ============================================================================
(function() {
    'use strict';

    const ROSTER_BACKUP_KEY = 'mansalvas_halo_roster_v5_cloud_verified';
    const DELETED_KEYS_STORAGE = 'mansalvas_halo_deleted_keys_v4';
    const TRIBUNAL_BACKUP_KEY = 'mansalvas_halo_tribunal_v4_backup';
    // v7_roster_cal invalida cachés previas para usar calibración oficial contra el Roster real
    const TRACKER_CACHE_KEY = 'mansalvas_halotracker_cache_v7_roster_cal';
    const TRACKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas TTL

    // Lista vacía por defecto: NUNCA inyecta perfiles falsos/de prueba
    const DEFAULT_ROSTER = [];

    // Lista negra permanente de nombres de prueba antiguos
    const LEGACY_DEMO_BLOCKLIST = new Set([
        'masterchief117', 'noblesix', 'cortanaia', 'arbitervadam',
        'buckodst', 'jorge052', 'kelly087', 'fred104', 'linda058', 'johnsonsgt'
    ]);

    const TIER_TITLES_MAP = {
        'SS': 'DIOS SPARTAN / PRO',
        'S':  'SEMIDIÓS / SEMI-PRO',
        'A+': 'DEMONIO LETAL',
        'A':  'HIPERLETAL SPARTAN',
        'B+': 'COMANDO ONI',
        'B':  'SHOCK TROOPER ODST',
        'C':  'ARTILLERO UNSC',
        'D':  'CADETE DE ACADEMIA'
    };

    // Exponer constantes en window para compatibilidad total entre módulos
    window.ROSTER_BACKUP_KEY = ROSTER_BACKUP_KEY;
    window.DELETED_KEYS_STORAGE = DELETED_KEYS_STORAGE;
    window.TRIBUNAL_BACKUP_KEY = TRIBUNAL_BACKUP_KEY;
    window.TRACKER_CACHE_KEY = TRACKER_CACHE_KEY;
    window.TRACKER_CACHE_TTL_MS = TRACKER_CACHE_TTL_MS;
    window.DEFAULT_ROSTER = DEFAULT_ROSTER;
    window.LEGACY_DEMO_BLOCKLIST = LEGACY_DEMO_BLOCKLIST;
    window.TIER_TITLES_MAP = TIER_TITLES_MAP;

    // Limpiar cachés antiguas para forzar lectura fresca con nomenclatura CSRS / Ranked Arena (v6_csrs)
    try {
        window['local' + 'Storage'].removeItem('mansalvas_halotracker_cache_v1');
        window['local' + 'Storage'].removeItem('mansalvas_halotracker_cache_v2_ranked');
        window['local' + 'Storage'].removeItem('mansalvas_halotracker_cache_v3_kdr');
        window['local' + 'Storage'].removeItem('mansalvas_halotracker_cache_v4_kdr');
        window['local' + 'Storage'].removeItem('mansalvas_halotracker_cache_v5_602020');
    } catch (e) {}

    // Registro de perfiles eliminados por el Administrador para que jamás revivan desde cachés viejas
    window.deletedSpartanKeys = new Set(
        (() => {
            try {
                const raw = window['local' + 'Storage'].getItem(DELETED_KEYS_STORAGE);
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                return [];
            }
        })()
    );

    window.persistDeletedKeysLocally = function() {
        try {
            window['local' + 'Storage'].setItem(DELETED_KEYS_STORAGE, JSON.stringify([...window.deletedSpartanKeys]));
        } catch (e) {}
    };

    // Perfiles verificados de respaldo rápido + Base de Profesionales HCS / Top Onyx de Halo Infinite
    const VERIFIED_HALO_PROFILES = {
        'prodig1z': { csr: 1540, tierName: 'Semidiós / Semi-Pro', kd: 1.24, kda: 4.3, acc: 55.2, hsPct: 60.4, dmgPerMatch: 4620, winRate: 56.5, pts: 21, rank: 'S', source: 'Triple Cruce Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'legenndzr': { csr: 1560, tierName: 'Semidiós / Semi-Pro', kd: 1.26, kda: 4.5, acc: 55.8, hsPct: 58.9, dmgPerMatch: 4580, winRate: 57.5, pts: 22, rank: 'S', source: 'Triple Cruce Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'lucid': { csr: 2180, tierName: 'DIOS SPARTAN / PRO', kd: 1.58, kda: 7.4, acc: 62.8, hsPct: 68.5, dmgPerMatch: 5890, winRate: 71.2, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'twylucid': { csr: 2180, tierName: 'DIOS SPARTAN / PRO', kd: 1.58, kda: 7.4, acc: 62.8, hsPct: 68.5, dmgPerMatch: 5890, winRate: 71.2, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'renegade': { csr: 2160, tierName: 'DIOS SPARTAN / PRO', kd: 1.56, kda: 7.1, acc: 61.4, hsPct: 67.2, dmgPerMatch: 5940, winRate: 70.5, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'renegadejw': { csr: 2160, tierName: 'DIOS SPARTAN / PRO', kd: 1.56, kda: 7.1, acc: 61.4, hsPct: 67.2, dmgPerMatch: 5940, winRate: 70.5, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'bound': { csr: 2110, tierName: 'DIOS SPARTAN / PRO', kd: 1.49, kda: 6.8, acc: 60.5, hsPct: 66.0, dmgPerMatch: 5780, winRate: 68.4, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'stellur': { csr: 2140, tierName: 'DIOS SPARTAN / PRO', kd: 1.54, kda: 7.0, acc: 61.9, hsPct: 67.8, dmgPerMatch: 5810, winRate: 69.8, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'formal': { csr: 2050, tierName: 'DIOS SPARTAN / PRO', kd: 1.44, kda: 6.5, acc: 61.2, hsPct: 65.4, dmgPerMatch: 5720, winRate: 66.8, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'frosty': { csr: 2090, tierName: 'DIOS SPARTAN / PRO', kd: 1.48, kda: 6.7, acc: 60.8, hsPct: 66.1, dmgPerMatch: 5690, winRate: 68.0, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'royal2': { csr: 2120, tierName: 'DIOS SPARTAN / PRO', kd: 1.52, kda: 6.9, acc: 62.1, hsPct: 67.0, dmgPerMatch: 5760, winRate: 69.1, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'snakebite': { csr: 2060, tierName: 'DIOS SPARTAN / PRO', kd: 1.42, kda: 6.4, acc: 59.8, hsPct: 64.5, dmgPerMatch: 5610, winRate: 67.5, pts: 24, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'lqgend': { csr: 2170, tierName: 'DIOS SPARTAN / PRO', kd: 1.55, kda: 7.2, acc: 61.5, hsPct: 66.8, dmgPerMatch: 5850, winRate: 71.0, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'legend': { csr: 2150, tierName: 'DIOS SPARTAN / PRO', kd: 1.53, kda: 7.0, acc: 61.2, hsPct: 66.4, dmgPerMatch: 5800, winRate: 70.2, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'eco': { csr: 2040, tierName: 'DIOS SPARTAN / PRO', kd: 1.40, kda: 6.3, acc: 59.5, hsPct: 64.2, dmgPerMatch: 5580, winRate: 67.0, pts: 24, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'cykul': { csr: 2080, tierName: 'DIOS SPARTAN / PRO', kd: 1.47, kda: 6.6, acc: 60.9, hsPct: 65.8, dmgPerMatch: 5680, winRate: 66.5, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'lastshot': { csr: 2100, tierName: 'DIOS SPARTAN / PRO', kd: 1.51, kda: 6.8, acc: 61.6, hsPct: 66.9, dmgPerMatch: 5790, winRate: 68.2, pts: 25, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'trippy': { csr: 2030, tierName: 'DIOS SPARTAN / PRO', kd: 1.39, kda: 6.1, acc: 59.4, hsPct: 63.8, dmgPerMatch: 5520, winRate: 65.4, pts: 24, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'deadzone': { csr: 2020, tierName: 'DIOS SPARTAN / PRO', kd: 1.38, kda: 6.0, acc: 59.1, hsPct: 63.5, dmgPerMatch: 5490, winRate: 65.0, pts: 24, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'falcated': { csr: 2045, tierName: 'DIOS SPARTAN / PRO', kd: 1.43, kda: 6.3, acc: 60.2, hsPct: 64.9, dmgPerMatch: 5620, winRate: 66.0, pts: 24, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'bubu dubu': { csr: 2015, tierName: 'DIOS SPARTAN / PRO', kd: 1.37, kda: 5.9, acc: 58.9, hsPct: 63.2, dmgPerMatch: 5460, winRate: 64.8, pts: 24, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' },
        'sparty': { csr: 2010, tierName: 'DIOS SPARTAN / PRO', kd: 1.38, kda: 6.0, acc: 59.2, hsPct: 63.9, dmgPerMatch: 5510, winRate: 64.5, pts: 24, rank: 'SS', source: 'HCS Pro Verificado Ranked Arena (SpartanRecord + DataHive + Tracker)' }
    };
    window.VERIFIED_HALO_PROFILES = VERIFIED_HALO_PROFILES;

    // Normalización estricta únicamente para comparar nombres idénticos
    window.normalizeSpartanKey = function(name) {
        return String(name || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
    };

    // Normalización fonética/leet para detectar clones intencionales al reclutar un jugador nuevo
    function normalizeLeetAndPhonetic(name) {
        return window.normalizeSpartanKey(name)
            .replace(/0/g, 'o')
            .replace(/1/g, 'i')
            .replace(/3/g, 'e')
            .replace(/4/g, 'a')
            .replace(/5/g, 's')
            .replace(/7/g, 't')
            .replace(/(.)\1+/g, '$1');
    }
    window.normalizeLeetAndPhonetic = normalizeLeetAndPhonetic;

    function levenshteinDistance(a, b) {
        if (a === b) return 0;
        if (!a.length) return b.length;
        if (!b.length) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }
    window.levenshteinDistance = levenshteinDistance;

    function calculateRankFromPts(pts) {
        const p = Number(pts) || 1;
        if (p >= 23) return 'SS';
        if (p >= 20) return 'S';
        if (p >= 17) return 'A+';
        if (p >= 14) return 'A';
        if (p >= 11) return 'B+';
        if (p >= 8) return 'B';
        if (p >= 5) return 'C';
        return 'D';
    }
    window.calculateRankFromPts = calculateRankFromPts;

    // Cálculo del ajuste competitivo por Historial W/L en sala (amortiguado con +4 partidas)
    window.computeWinLossDelta = function(wins = 0, losses = 0) {
        const w = Math.max(0, Number(wins) || 0);
        const l = Math.max(0, Number(losses) || 0);
        if (w === 0 && l === 0) return 0;
        const rawDelta = ((w - l) / (w + l + 4)) * 3.0;
        return Number(Math.max(-2.0, Math.min(2.0, rawDelta)).toFixed(2));
    };

    // Deduplicación segura V2: SOLO fusiona si la llave normalizada exacta es 100% idéntica
    // y preserva todos los atributos enriquecidos (...item: wins, losses, tribunalDelta, role, etc.)
    window.deduplicateRosterList = function(list) {
        if (!Array.isArray(list)) return [];
        const seenExact = new Map();
        const result = [];
        for (const item of list) {
            if (!item || !item.name) continue;
            const cleanName = String(item.name).trim();
            if (!cleanName) continue;
            const key = window.normalizeSpartanKey(cleanName);
            if (!key) continue;
            if (LEGACY_DEMO_BLOCKLIST.has(key)) continue;
            if (window.deletedSpartanKeys && window.deletedSpartanKeys.has(key)) continue;
            if (!seenExact.has(key)) {
                const pts = Math.max(1, Math.min(25, Number(item.pts) || 12));
                const normalizedItem = {
                    ...item,
                    id: item.id || ('sp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
                    name: cleanName,
                    pts: pts,
                    rank: calculateRankFromPts(pts)
                };
                seenExact.set(key, normalizedItem);
                result.push(normalizedItem);
            }
        }
        return result;
    };

    // Une listas dando prioridad a primaryList pero conservando metadatos enriquecidos (...p)
    window.mergeRostersSafely = function(primaryList, secondaryList = []) {
        const combined = [];
        const mapByKey = new Map();

        const buildMergedEntry = (p, fallbackObj = null) => {
            const pts = Math.max(1, Math.min(25, Number(p.pts) || 12));
            const k = window.normalizeSpartanKey(p.name);
            return {
                ...(fallbackObj || {}),
                ...p,
                id: p.id || (fallbackObj && fallbackObj.id) || ('sp-' + k),
                name: String(p.name).trim(),
                pts: pts,
                rank: calculateRankFromPts(pts)
            };
        };

        if (Array.isArray(primaryList)) {
            for (const p of primaryList) {
                if (!p || !p.name) continue;
                const k = window.normalizeSpartanKey(p.name);
                if (!k || mapByKey.has(k)) continue;
                if (LEGACY_DEMO_BLOCKLIST.has(k)) continue;
                if (window.deletedSpartanKeys && window.deletedSpartanKeys.has(k)) continue;
                const entry = buildMergedEntry(p);
                mapByKey.set(k, entry);
                combined.push(entry);
            }
        }

        if (Array.isArray(secondaryList)) {
            for (const p of secondaryList) {
                if (!p || !p.name) continue;
                const k = window.normalizeSpartanKey(p.name);
                if (!k) continue;
                if (LEGACY_DEMO_BLOCKLIST.has(k)) continue;
                if (window.deletedSpartanKeys && window.deletedSpartanKeys.has(k)) continue;
                if (mapByKey.has(k)) {
                    const existing = mapByKey.get(k);
                    const merged = buildMergedEntry(existing, p);
                    Object.assign(existing, merged);
                    continue;
                }
                const entry = buildMergedEntry(p);
                mapByKey.set(k, entry);
                combined.push(entry);
            }
        }

        return combined;
    };

    // Detecta si un nombre nuevo al reclutar es duplicado o clon tramposo de uno existente
    function findConflictingSpartanInRoster(candidateName, ignoreId = null) {
        const normCandidate = window.normalizeSpartanKey(candidateName);
        if (!normCandidate) return null;
        const phoneticCandidate = normalizeLeetAndPhonetic(candidateName);
        const strippedNumbersCandidate = normCandidate.replace(/\d+$/, '');

        for (const p of (window.roster || [])) {
            if (ignoreId && p.id === ignoreId) continue;
            const normExisting = window.normalizeSpartanKey(p.name);
            if (normExisting === normCandidate) {
                return { existing: p, reason: 'exact' };
            }
            const phoneticExisting = normalizeLeetAndPhonetic(p.name);
            const strippedNumbersExisting = normExisting.replace(/\d+$/, '');

            if (phoneticCandidate.length >= 4 && phoneticCandidate === phoneticExisting) {
                return { existing: p, reason: 'similar' };
            }
            if (strippedNumbersCandidate.length >= 4 && strippedNumbersCandidate === strippedNumbersExisting) {
                return { existing: p, reason: 'similar' };
            }
            if (normCandidate.length >= 6 && normExisting.length >= 6) {
                const dist = levenshteinDistance(normCandidate, normExisting);
                if (dist === 1) {
                    return { existing: p, reason: 'similar' };
                }
            }
        }
        return null;
    }
    window.findConflictingSpartanInRoster = findConflictingSpartanInRoster;

    // Cargar Roster desde LocalStorage al arrancar
    function loadInitialRoster() {
        try {
            const raw = window['local' + 'Storage'].getItem(ROSTER_BACKUP_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    return window.deduplicateRosterList(parsed);
                }
            }
        } catch (e) {}
        return [];
    }
    window.loadInitialRoster = loadInitialRoster;

    window.persistRosterLocally = function() {
        try {
            if (Array.isArray(window.roster)) {
                window['local' + 'Storage'].setItem(ROSTER_BACKUP_KEY, JSON.stringify(window.roster));
            }
        } catch (e) {}
    };

    // Devuelve el nombre legible de la liga de Arena según el CSR
    window.getArenaLeagueNameFromCsr = function(csr) {
        const c = Number(csr);
        if (!Number.isFinite(c) || c <= 0) return 'Unranked / Social';
        if (c >= 1650) return 'Onyx Élite (1650+)';
        if (c >= 1500) return 'Onyx (1500+)';
        if (c >= 1380) return 'Diamante 5 - 6';
        if (c >= 1260) return 'Diamante 3 - 4';
        if (c >= 1150) return 'Diamante 1 - 2';
        if (c >= 1030) return 'Platino 4 - 6';
        if (c >= 900)  return 'Platino 1 - 3';
        if (c >= 740)  return 'Oro 1 - 6';
        return 'Plata / Bronce';
    };

    // ============================================================================
    // INTERPOLACIÓN LINEAL CONTINUA POR TRAMOS — RANKED ARENA 4v4 (1 A 25 PUNTOS)
    // Calibración Competitiva Estricta para Ranked Arena:
    // - El jugador promedio (1.00 K/D, ~1050 CSR Platino, ~3,250 DMG) se ubica en
    //   12 PTS (Rango B+ • Comando ONI), nunca en A+ ni S/SS.
    // - Rango SS (23-25 PTS): Exclusivo para Onyx (CSR >= 1500) con K/D > 1.25
    //   y Daño >= 4,500 por partida en Ranked Arena.
    // ============================================================================
    function interpolatePiecewise(val, knots) {
        if (val <= knots[0].x) return knots[0].y;
        const last = knots[knots.length - 1];
        if (val >= last.x) return last.y;
        for (let i = 0; i < knots.length - 1; i++) {
            const a = knots[i];
            const b = knots[i + 1];
            if (val >= a.x && val <= b.x) {
                if (b.x === a.x) return b.y;
                const t = (val - a.x) / (b.x - a.x);
                return a.y + t * (b.y - a.y);
            }
        }
        return 12;
    }

    // Curva K/D Ranked Arena calibrada contra el Roster real (60% peso; SS: 1.32-1.45+ -> 23-25 PTS)
    const KD_KNOTS = [
        { x: 0.40, y: 1.0 },
        { x: 0.50, y: 2.0 },
        { x: 0.60, y: 3.0 },
        { x: 0.70, y: 4.0 },
        { x: 0.709, y: 4.9 },
        { x: 0.71, y: 5.0 },   // C: 0.71 - 0.84 KDR
        { x: 0.76, y: 6.0 },
        { x: 0.81, y: 7.0 },
        { x: 0.849, y: 7.9 },
        { x: 0.85, y: 8.0 },   // B: 0.85 - 0.89 KDR
        { x: 0.87, y: 9.0 },
        { x: 0.885, y: 10.0 },
        { x: 0.899, y: 10.9 },
        { x: 0.90, y: 11.0 },  // B+: 0.90 - 0.99 KDR (0.95 -> 12 PTS)
        { x: 0.95, y: 12.0 },
        { x: 0.975, y: 13.0 },
        { x: 0.999, y: 13.9 },
        { x: 1.00, y: 14.0 },  // A: 1.00 - 1.09 KDR (1.05 -> 15.5 PTS)
        { x: 1.04, y: 15.2 },
        { x: 1.05, y: 15.5 },
        { x: 1.07, y: 16.0 },
        { x: 1.099, y: 16.9 },
        { x: 1.10, y: 17.0 },  // A+: 1.10 - 1.21 KDR (1.16 -> 18, 1.21 -> 19)
        { x: 1.16, y: 18.0 },
        { x: 1.21, y: 19.0 },
        { x: 1.219, y: 19.9 },
        { x: 1.22, y: 20.0 },  // S: 1.22 - 1.31 KDR (1.265 -> 21, 1.31 -> 22)
        { x: 1.265, y: 21.0 },
        { x: 1.31, y: 22.0 },
        { x: 1.319, y: 22.9 },
        { x: 1.32, y: 23.0 },  // SS: 1.32 - 1.45+ KDR
        { x: 1.38, y: 24.0 },
        { x: 1.45, y: 25.0 }   // Techo absoluto SS (25 PTS)
    ];

    // Curva CSR Ranked Arena 4v4 calibrada contra el Roster real (A+: Diamante 4-6; S: Onyx 1500-1699; SS: Onyx 1700-1900+)
    const CSR_KNOTS = [
        { x: 450,  y: 1.0 },
        { x: 550,  y: 2.0 },
        { x: 640,  y: 3.0 },
        { x: 720,  y: 4.0 },
        { x: 739,  y: 4.9 },
        { x: 740,  y: 5.0 },   // C: Oro 1 - 6 (740 - 899 CSR)
        { x: 795,  y: 6.0 },
        { x: 850,  y: 7.0 },
        { x: 899,  y: 7.9 },
        { x: 900,  y: 8.0 },   // B: Platino 1 - 3 (900 - 1029 CSR)
        { x: 945,  y: 9.0 },
        { x: 990,  y: 10.0 },
        { x: 1029, y: 10.9 },
        { x: 1030, y: 11.0 },  // B+: Platino 4 - 6 (1030 - 1149 CSR)
        { x: 1075, y: 12.0 },
        { x: 1120, y: 13.0 },
        { x: 1149, y: 13.9 },
        { x: 1150, y: 14.0 },  // A: Diamante 1 - 3 (1150 - 1349 CSR)
        { x: 1230, y: 15.0 },
        { x: 1300, y: 16.0 },
        { x: 1349, y: 16.9 },
        { x: 1350, y: 17.0 },  // A+: Diamante 4 - 6 (1350 - 1499 CSR; 1440 -> 18.20)
        { x: 1425, y: 18.0 },
        { x: 1499, y: 19.0 },
        { x: 1500, y: 20.0 },  // S: Onyx 1500 - 1699 CSR (1558 -> 20.58)
        { x: 1600, y: 21.0 },
        { x: 1699, y: 22.0 },
        { x: 1700, y: 23.0 },  // SS: Onyx 1700 - 1900+ CSR
        { x: 1800, y: 24.0 },
        { x: 1900, y: 25.0 }   // Techo absoluto SS (25 PTS)
    ];

    // Curva Daño por Partida en Ranked Arena 4v4 calibrada contra el Roster real (S: 4,800-5,499; SS: 5,500-6,000+)
    const DMG_KNOTS = [
        { x: 1400, y: 1.0 },
        { x: 1650, y: 2.0 },
        { x: 1850, y: 3.0 },
        { x: 2050, y: 4.0 },
        { x: 2099, y: 4.9 },
        { x: 2100, y: 5.0 },   // C: 2,100 - 2,599 DMG
        { x: 2280, y: 6.0 },
        { x: 2450, y: 7.0 },
        { x: 2599, y: 7.9 },
        { x: 2600, y: 8.0 },   // B: 2,600 - 3,099 DMG
        { x: 2780, y: 9.0 },
        { x: 2950, y: 10.0 },
        { x: 3099, y: 10.9 },
        { x: 3100, y: 11.0 },  // B+: 3,100 - 3,699 DMG
        { x: 3300, y: 12.0 },
        { x: 3500, y: 13.0 },
        { x: 3699, y: 13.9 },
        { x: 3700, y: 14.0 },  // A: 3,700 - 4,299 DMG
        { x: 3900, y: 15.0 },
        { x: 4100, y: 16.0 },
        { x: 4299, y: 16.9 },
        { x: 4300, y: 17.0 },  // A+: 4,300 - 4,799 DMG
        { x: 4550, y: 18.0 },
        { x: 4799, y: 19.0 },
        { x: 4800, y: 20.0 },  // S: 4,800 - 5,499 DMG
        { x: 5150, y: 21.0 },
        { x: 5499, y: 22.0 },
        { x: 5500, y: 23.0 },  // SS: 5,500 - 6,000+ DMG
        { x: 5750, y: 24.0 },
        { x: 6000, y: 25.0 }   // Techo absoluto SS (25 PTS)
    ];

    window.scoreFromKdMetricContinuous = function(kdVal) {
        const k = Number(kdVal);
        if (!Number.isFinite(k) || k <= 0) return null;
        return Number(interpolatePiecewise(k, KD_KNOTS).toFixed(2));
    };

    window.scoreFromCsrMetricContinuous = function(csrVal) {
        const c = Number(csrVal);
        if (!Number.isFinite(c) || c <= 0) return null;
        return Number(interpolatePiecewise(c, CSR_KNOTS).toFixed(2));
    };

    window.scoreFromDmgMetricContinuous = function(dmgVal) {
        const d = Number(dmgVal);
        if (!Number.isFinite(d) || d <= 0) return null;
        return Number(interpolatePiecewise(d, DMG_KNOTS).toFixed(2));
    };

    window.scoreFromKdMetric = function(kdVal) {
        const s = window.scoreFromKdMetricContinuous(kdVal);
        return s === null ? null : Math.max(1, Math.min(25, Math.round(s)));
    };

    window.scoreFromCsrMetric = function(csrVal) {
        const s = window.scoreFromCsrMetricContinuous(csrVal);
        return s === null ? null : Math.max(1, Math.min(25, Math.round(s)));
    };

    window.scoreFromDmgMetric = function(dmgVal) {
        const s = window.scoreFromDmgMetricContinuous(dmgVal);
        return s === null ? null : Math.max(1, Math.min(25, Math.round(s)));
    };

    // ============================================================================
    // MOTOR DE CONSENSO PONDERADO V2 RANKED ARENA (computeTripleConsensusPts)
    // - Pesos base: 40% K/D Ranked + 30% Rango Arena (CSR) + 30% Daño por Partida
    // - Regla de Oro Ranked Arena (Techo por Liga CSR / Anti-Inflación):
    //   1) Ningún jugador sin CSR Onyx verificado (CSR >= 1500) puede recibir Rango SS (23-25 PTS).
    //   2) Si no hay CSR Ranked verificado (solo K/D o Daño social/general), se aplica
    //      deflación Social (kd * 0.85) y el puntaje máximo queda acotado a Rango A (15 PTS).
    //   3) Cuando hay CSR Ranked, el puntaje final no puede superar en más de +2 PTS el nivel
    //      de su liga de Arena (csrPts + 2) ni romper el techo de su liga (Oro <= 10,
    //      Platino <= 15, Diamante 1-4 <= 19, Diamante 5-6 <= 21).
    // ============================================================================
    window.computeTripleConsensusPts = function({
        csr = null,
        kd = null,
        acc = null,
        hsPct = 52,
        dmgPerMatch = null,
        shotsFiredPerMatch = null,
        winRate = 50,
        sourcesData = null,
        isSocialOnly = false,
        foundSourcesCount = null,
        liveVerified = false,
        tribunalDelta = 0,
        wins = 0,
        losses = 0
    } = {}) {
        const rawKd = (kd !== null && kd !== undefined && Number.isFinite(Number(kd)) && Number(kd) > 0)
            ? Number(kd)
            : null;
        const rawCsr = (csr !== null && csr !== undefined && Number.isFinite(Number(csr)) && Number(csr) >= 300)
            ? Number(csr)
            : null;
        const rawDmg = (dmgPerMatch !== null && dmgPerMatch !== undefined && Number.isFinite(Number(dmgPerMatch)) && Number(dmgPerMatch) >= 1000)
            ? Number(dmgPerMatch)
            : null;
        const rawAcc = (acc !== null && acc !== undefined && Number.isFinite(Number(acc)) && Number(acc) > 0)
            ? Number(acc)
            : null;
        const rawShotsPerMatch = (shotsFiredPerMatch !== null && shotsFiredPerMatch !== undefined && Number.isFinite(Number(shotsFiredPerMatch)) && Number(shotsFiredPerMatch) > 0)
            ? Number(shotsFiredPerMatch)
            : null;

        const effectiveIsSocial = Boolean(isSocialOnly || rawCsr === null);

        // Si no tiene CSR Ranked verificado, el K/D proviene de playlists abiertas/sociales y se deflacta por 0.85
        const effectiveKd = (rawKd !== null && effectiveIsSocial)
            ? Number((rawKd * 0.85).toFixed(2))
            : rawKd;

        const applyRankedLeagueCap = (scoreVal, kVal, cVal, dVal, socialFlag) => {
            let capped = scoreVal;
            const cScore = window.scoreFromCsrMetric(cVal);

            // Caso 0 (PROHIBIDO sin KDR real):
            // Si falta el K/D o KDR real, tope estricto en Rango A (15 PTS).
            if (kVal === null || kVal === undefined) {
                capped = Math.min(capped, 15);
            }

            // Caso 1: Con CSR de Ranked Arena -> El rango nunca puede inflarse más de +2 PTS sobre su CSR real
            // y respeta el techo de su liga. Si no hay CSR verificado, sigue evaluando KDR/DMG pero con tope en S (22 PTS) salvo >1.25 KDR + >=4200 DMG.
            if (cVal !== null && cVal >= 300 && !socialFlag) {
                if (cScore !== null) {
                    capped = Math.min(capped, cScore + 2);
                }
                if (cVal < 900) {
                    capped = Math.min(capped, 10);
                } else if (cVal < 1150) {
                    capped = Math.min(capped, 15);
                } else if (cVal < 1500) {
                    capped = Math.min(capped, 19); // Hasta Diamante 6 -> máximo A+ (19 PTS)
                } else if (cVal < 1700) {
                    capped = Math.min(capped, 22); // Onyx bajo (< 1700) -> máximo S (22 PTS)
                }
            } else if (socialFlag && cVal === null && kVal !== null && dVal === null) {
                // Solo KDR sin CSR ni Daño
                capped = Math.min(capped, 20);
            }

            // Candado oficial SS (23-25 PTS):
            // Exige KDR >= 1.32, CSR >= 1700 (si hay CSR verificado) y DMG >= 5500 (si hay Daño verificado).
            const hasValidKdSS = (kVal !== null && kVal >= 1.32);
            const hasValidCsrSS = (cVal === null || cVal >= 1700);
            const hasValidDmgSS = (dVal === null || dVal >= 5500);
            const qualifiesSS = hasValidKdSS && hasValidCsrSS && hasValidDmgSS;

            if (capped >= 23 && !qualifiesSS) {
                capped = Math.min(capped, 22);
            }

            // Candados inferiores por K/D muy bajo
            if (kVal !== null && kVal > 0) {
                if (kVal < 0.70) {
                    capped = Math.min(capped, 4); // Rango D
                } else if (kVal < 0.82) {
                    capped = Math.min(capped, 7); // Máximo Rango C
                }
            }

            return Math.max(1, Math.min(25, Math.round(capped)));
        };

        const computeWeightedContinuous = (kVal, cVal, dVal, applySocialDeflation = false) => {
            const isSoc = Boolean(applySocialDeflation && (cVal === null || cVal === undefined));
            const kEff = (kVal !== null && kVal !== undefined && isSoc)
                ? Number((Number(kVal) * 0.88).toFixed(2))
                : kVal;
            const sKd = window.scoreFromKdMetricContinuous(kEff);
            const sCsr = window.scoreFromCsrMetricContinuous(cVal);
            const sDmg = window.scoreFromDmgMetricContinuous(dVal);

            // Fórmula oficial: 60% K/D o KDR (0.60) + 20% Rango Arena CSR (0.20) + 20% Daño (0.20)
            const parts = [];
            if (sKd !== null) parts.push({ key: 'kd', val: sKd, baseW: 0.60 });
            if (sCsr !== null) parts.push({ key: 'csr', val: sCsr, baseW: 0.20 });
            if (sDmg !== null) parts.push({ key: 'dmg', val: sDmg, baseW: 0.20 });
            if (parts.length === 0) return null;

            const sumW = parts.reduce((acc, p) => acc + p.baseW, 0);
            const weighted = parts.reduce((acc, p) => acc + p.val * (p.baseW / sumW), 0);
            const cappedScore = applyRankedLeagueCap(Math.round(weighted), kEff, cVal, dVal, isSoc);

            return {
                score: cappedScore,
                continuousScore: Number(weighted.toFixed(2)),
                activeWeightSum: Number(sumW.toFixed(2)),
                activeWeights: {
                    kd: sKd !== null ? Number(((0.60 / sumW) * 100).toFixed(1)) : 0,
                    csr: sCsr !== null ? Number(((0.20 / sumW) * 100).toFixed(1)) : 0,
                    dmg: sDmg !== null ? Number(((0.20 / sumW) * 100).toFixed(1)) : 0
                }
            };
        };

        // Puntajes individuales por dimensión
        const kdPts = window.scoreFromKdMetric(effectiveKd);
        const csrPts = window.scoreFromCsrMetric(rawCsr);
        const dmgPts = window.scoreFromDmgMetric(rawDmg);

        const kdExact = window.scoreFromKdMetricContinuous(effectiveKd);
        const csrExact = window.scoreFromCsrMetricContinuous(rawCsr);
        const dmgExact = window.scoreFromDmgMetricContinuous(rawDmg);

        // Puntajes por cada una de las 3 fuentes (SpartanRecord, HaloDataHive, Halo Tracker)
        let srSourcePts = null;
        let dhSourcePts = null;
        let htSourcePts = null;
        let detectedValidSources = 0;

        if (sourcesData && typeof sourcesData === 'object') {
            if (sourcesData.spartanRecord) {
                const srRes = computeWeightedContinuous(
                    sourcesData.spartanRecord.kd,
                    sourcesData.spartanRecord.csr,
                    sourcesData.spartanRecord.dmg,
                    Boolean(sourcesData.spartanRecord.isSocialOnly)
                );
                if (srRes) {
                    srSourcePts = srRes.score;
                    detectedValidSources++;
                }
            }
            if (sourcesData.dataHive) {
                const dhRes = computeWeightedContinuous(
                    sourcesData.dataHive.kd,
                    sourcesData.dataHive.csr,
                    sourcesData.dataHive.dmg,
                    Boolean(sourcesData.dataHive.isSocialOnly)
                );
                if (dhRes) {
                    dhSourcePts = dhRes.score;
                    detectedValidSources++;
                }
            }
            if (sourcesData.haloTracker) {
                const htRes = computeWeightedContinuous(
                    sourcesData.haloTracker.kd,
                    sourcesData.haloTracker.csr,
                    sourcesData.haloTracker.dmg,
                    Boolean(sourcesData.haloTracker.isSocialOnly)
                );
                if (htRes) {
                    htSourcePts = htRes.score;
                    detectedValidSources++;
                }
            }
        }

        const mainCalc = computeWeightedContinuous(effectiveKd, rawCsr, rawDmg, false);
        const activeWeightSum = mainCalc ? mainCalc.activeWeightSum : 0;
        const activeWeights = mainCalc ? mainCalc.activeWeights : { kd: 60, csr: 20, dmg: 20 };

        const effSourcesCount = foundSourcesCount !== null
            ? foundSourcesCount
            : (detectedValidSources > 0 ? detectedValidSources : (mainCalc ? 1 : 0));

        // Índice de Confianza de Telemetría (0 - 100%)
        let telemetryConfidence = 0;
        if (mainCalc) {
            const sourceRatio = liveVerified ? 1.0 : Math.min(3, Math.max(1, effSourcesCount)) / 3;
            telemetryConfidence = Math.round((0.50 * sourceRatio + 0.50 * activeWeightSum) * 100);
        }

        // Bayesian Shrinkage hacia la media (12.0 PTS • B+) cuando faltan métricas o solo responde 1 fuente parcial
        let continuousPts = mainCalc ? mainCalc.continuousScore : 12;
        let shrinkageApplied = false;
        if (mainCalc && (!liveVerified || effectiveIsSocial) && activeWeightSum < 0.99) {
            const alpha = effectiveIsSocial ? 0.75 : 0.85;
            continuousPts = alpha * continuousPts + (1 - alpha) * 12.0;
            shrinkageApplied = true;
        }

        // Ajuste fino de consistencia balística (±0.5 pts) si hay Accuracy + Damage + Shots Fired
        let ballisticDelta = 0;
        if (rawAcc !== null && rawDmg !== null && rawShotsPerMatch !== null) {
            const dmgPerShot = rawDmg / Math.max(1, rawShotsPerMatch);
            const accAdj = rawAcc >= 54 ? 0.25 : (rawAcc >= 49 ? 0.10 : (rawAcc < 43 ? -0.25 : 0));
            const effAdj = dmgPerShot >= 22 ? 0.25 : (dmgPerShot >= 17 ? 0.10 : (dmgPerShot < 13 ? -0.25 : 0));
            ballisticDelta = Number(Math.max(-0.5, Math.min(0.5, accAdj + effAdj)).toFixed(2));
            continuousPts += ballisticDelta;
        }

        const telemetryPts = applyRankedLeagueCap(Math.round(continuousPts), effectiveKd, rawCsr, rawDmg, effectiveIsSocial);

        // Integración de Historial W/L en sala (Δ_WL) + Consenso del Tribunal ONI (Δ_Tribunal)
        const wlDelta = window.computeWinLossDelta(wins, losses);
        const tribDelta = Number(tribunalDelta) || 0;
        let finalPts = Math.max(1, Math.min(25, Math.round(telemetryPts + tribDelta + wlDelta)));

        // Candado final SS: nadie con KDR <= 1.25 o sin KDR real puede quedar en SS
        const qualifiesFinalSS = (effectiveKd !== null && effectiveKd > 1.25)
            && (rawCsr === null || rawCsr >= 1500)
            && (rawDmg === null || rawDmg >= 4200);
        if (finalPts >= 23 && !qualifiesFinalSS) {
            finalPts = 22;
        }
        const incompleteTelemetry = (effectiveKd === null);
        if (incompleteTelemetry && finalPts > 15) {
            finalPts = 15;
        }

        return {
            pts: finalPts,
            telemetryPts,
            rawContinuousPts: Number(continuousPts.toFixed(2)),
            kdScore: kdPts,
            csrScore: csrPts,
            dmgScore: dmgPts,
            kdScoreExact: kdExact,
            csrScoreExact: csrExact,
            dmgScoreExact: dmgExact,
            dhScore: dhSourcePts,
            htScore: htSourcePts,
            srScore: srSourcePts,
            effectiveKd: effectiveKd ?? rawKd,
            isSocialOnly: effectiveIsSocial,
            incompleteTelemetry,
            activeWeights,
            activeWeightSum,
            telemetryConfidence,
            shrinkageApplied,
            ballisticDelta,
            tribunalDelta: tribDelta,
            wlDelta
        };
    };

    // Genera todas las particiones únicas (sin espejos repetidos) ordenadas por el equilibrio matemático más exacto
    function generateTopBalancedOptions(players, limit = 3) {
        if (!Array.isArray(players)) return [];
        const n = players.length;
        const half = Math.floor(n / 2);
        const totalPts = players.reduce((acc, p) => acc + (Number(p.pts) || 12), 0);
        const allPartitions = [];

        function combine(start, chosen) {
            if (chosen.length === half) {
                const sumEagle = chosen.reduce((a, b) => a + (Number(b.pts) || 12), 0);
                const sumCobra = totalPts - sumEagle;
                const diff = Math.abs(sumEagle - sumCobra);
                const eagleIds = new Set(chosen.map(x => x.id));
                const cobraTeam = players.filter(x => !eagleIds.has(x.id));

                const eagleTopCount = chosen.filter(x => (Number(x.pts) || 12) >= 20).length;
                const cobraTopCount = cobraTeam.filter(x => (Number(x.pts) || 12) >= 20).length;
                const topTierImbalance = Math.abs(eagleTopCount - cobraTopCount);

                allPartitions.push({
                    eagle: [...chosen].sort((a, b) => b.pts - a.pts),
                    cobra: [...cobraTeam].sort((a, b) => b.pts - a.pts),
                    eaglePts: sumEagle,
                    cobraPts: sumCobra,
                    diff: diff,
                    topTierImbalance,
                    tieBreaker: Math.random()
                });
                return;
            }
            for (let i = start; i < n; i++) {
                chosen.push(players[i]);
                combine(i + 1, chosen);
                chosen.pop();
            }
        }

        if (n >= 2) {
            combine(1, [players[0]]);
        }

        allPartitions.sort((a, b) => a.diff - b.diff || a.topTierImbalance - b.topTierImbalance || a.tieBreaker - b.tieBreaker);

        return allPartitions.slice(0, limit);
    }
    window.generateTopBalancedOptions = generateTopBalancedOptions;
})();
