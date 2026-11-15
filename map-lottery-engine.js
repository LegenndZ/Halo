(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.HaloMapEngine = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const OBJECTIVE_MODES = ['KOTH', 'ST', 'ODDBALL', 'CTF'];
    const SLAYER_MODE = 'SLAYER';
    const COPY_SUFFIX_RE = /(?:\s*[-_]\s*copia|\s+copia|\s*[-_]\s*copy|\s+copy|\s*\(\d+\))(?=\.[^.]+$)/i;

    function fisherYatesShuffle(arr, rng) {
        const copy = arr.slice();
        const rand = typeof rng === 'function' ? rng : Math.random;
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            const tmp = copy[i];
            copy[i] = copy[j];
            copy[j] = tmp;
        }
        return copy;
    }

    function normalizeFormat(fmt) {
        if (fmt === 4 || fmt === '4' || fmt === '2v2') return '2v2';
        if (fmt === 6 || fmt === '6' || fmt === '3v3') return '3v3';
        if (fmt === 8 || fmt === '8' || fmt === '4v4') return '4v4';
        throw new Error(`Formato de partida no soportado: "${fmt}". Usa 2v2, 3v3 o 4v4.`);
    }

    function normalizeMapName(rawName) {
        const cleaned = String(rawName || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\bLive\s*Fire\b/i, 'Live Fire')
            .replace(/\s+/g, ' ')
            .trim();
        return cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function normalizeMode(rawMode) {
        const upper = String(rawMode || '').trim().toUpperCase();
        if (upper === 'SLAYER') return 'SLAYER';
        if (upper === 'CTF') return 'CTF';
        if (upper === 'KOTH') return 'KOTH';
        if (upper === 'ODDBALL') return 'ODDBALL';
        if (upper === 'ST' || upper === 'STRONGHOLDS') return 'ST';
        return upper;
    }

    function parseMapFilename(fileName) {
        if (!fileName || COPY_SUFFIX_RE.test(fileName)) return null;
        const base = String(fileName).replace(/\.[^.]+$/, '').trim();
        const match = base.match(/^(.*?)\s+(Slayer|CTF|Koth|Oddball|St|Strongholds)$/i);
        if (!match) return null;
        return {
            mapName: normalizeMapName(match[1]),
            mode: normalizeMode(match[2])
        };
    }

    function filterPoolForFormat(manifest, formatKey) {
        const rawList = (manifest && manifest.formats && Array.isArray(manifest.formats[formatKey]))
            ? manifest.formats[formatKey]
            : [];
        const seenCombo = new Set();
        const valid = [];

        for (const item of rawList) {
            if (!item || typeof item !== 'object') continue;
            if (item.fileName && COPY_SUFFIX_RE.test(item.fileName)) continue;
            if (item.format && item.format !== formatKey) continue;

            const mapName = normalizeMapName(item.mapName);
            const mode = normalizeMode(item.mode);
            if (!mapName || !mode) continue;

            const comboKey = `${mapName.toUpperCase()}::${mode}`;
            if (seenCombo.has(comboKey)) continue;
            seenCombo.add(comboKey);

            valid.push({
                ...item,
                mapName,
                mode,
                format: formatKey
            });
        }
        return valid;
    }

    function validatePool(formatKey, pool) {
        if (formatKey === '2v2' || formatKey === '3v3') {
            if (pool.length < 5) {
                throw new Error(
                    `Pool insuficiente para ${formatKey}: se requieren al menos 5 variantes válidas en Mapas/${formatKey} y solo hay ${pool.length}.`
                );
            }
            return { ok: true, format: formatKey, total: pool.length };
        }

        const slayers = pool.filter((m) => m.mode === SLAYER_MODE);
        const objByMode = new Map();
        for (const item of pool) {
            if (OBJECTIVE_MODES.includes(item.mode)) {
                if (!objByMode.has(item.mode)) objByMode.set(item.mode, []);
                objByMode.get(item.mode).push(item);
            }
        }

        if (slayers.length < 2) {
            throw new Error(
                `Pool insuficiente para 4v4: se requieren al menos 2 variantes SLAYER distintas en Mapas/4v4 (encontradas: ${slayers.length}).`
            );
        }
        if (objByMode.size < 3) {
            throw new Error(
                `Pool insuficiente para 4v4: se requieren al menos 3 modos Objetivo distintos (KOTH, ST, ODDBALL, CTF) en Mapas/4v4 (encontrados: ${objByMode.size}).`
            );
        }

        return {
            ok: true,
            format: formatKey,
            total: pool.length,
            slayers: slayers.length,
            objectiveModes: Array.from(objByMode.keys())
        };
    }

    function drawSimpleFive(pool, formatKey, rng) {
        const shuffled = fisherYatesShuffle(pool, rng);
        return shuffled.slice(0, 5).map((item, idx) => ({
            slot: idx + 1,
            slotLabel: String(idx + 1).padStart(2, '0'),
            slotType: item.mode === SLAYER_MODE ? 'SLAYER' : 'OBJECTIVE',
            ...item
        }));
    }

    function drawFourVFourFive(pool, rng) {
        const slayers = fisherYatesShuffle(
            pool.filter((m) => m.mode === SLAYER_MODE),
            rng
        );

        const objByMode = new Map();
        for (const item of pool) {
            if (OBJECTIVE_MODES.includes(item.mode)) {
                if (!objByMode.has(item.mode)) objByMode.set(item.mode, []);
                objByMode.get(item.mode).push(item);
            }
        }

        const availableObjModes = fisherYatesShuffle(Array.from(objByMode.keys()), rng);
        const chosenObjModes = availableObjModes.slice(0, 3);

        const objPicks = chosenObjModes.map((mode) => {
            const candidates = fisherYatesShuffle(objByMode.get(mode), rng);
            return candidates[0];
        });

        // Orden obligatorio 4v4:
        // 01 Objetivo, 02 Slayer, 03 Objetivo, 04 Objetivo, 05 Slayer
        const sequence = [
            { item: objPicks[0], slotType: 'OBJECTIVE' },
            { item: slayers[0], slotType: 'SLAYER' },
            { item: objPicks[1], slotType: 'OBJECTIVE' },
            { item: objPicks[2], slotType: 'OBJECTIVE' },
            { item: slayers[1], slotType: 'SLAYER' }
        ];

        return sequence.map((entry, idx) => ({
            slot: idx + 1,
            slotLabel: String(idx + 1).padStart(2, '0'),
            slotType: entry.slotType,
            ...entry.item
        }));
    }

    function drawMaps(manifest, format, options) {
        const formatKey = normalizeFormat(format);
        const rng = options && typeof options.rng === 'function' ? options.rng : Math.random;
        const pool = filterPoolForFormat(manifest, formatKey);
        validatePool(formatKey, pool);

        const series = formatKey === '4v4'
            ? drawFourVFourFive(pool, rng)
            : drawSimpleFive(pool, formatKey, rng);

        return {
            format: formatKey,
            drawnAt: new Date().toISOString(),
            maps: series
        };
    }

    return {
        OBJECTIVE_MODES,
        SLAYER_MODE,
        normalizeFormat,
        normalizeMapName,
        normalizeMode,
        parseMapFilename,
        filterPoolForFormat,
        validatePool,
        drawMaps
    };
}));
