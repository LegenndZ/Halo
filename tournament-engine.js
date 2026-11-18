(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.HaloTournamentEngine = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const OFFICIAL_COLORS = [
        { id: 'rojo',      name: 'Rojo',      hex: '#e31e24', textHex: '#ffffff', icon: 'shield',    svgPath: 'M12 2L4 5.5v6c0 5.1 3.4 9.7 8 10.9 4.6-1.2 8-5.8 8-10.9v-6L12 2zm0 3.2l5 2.2v4.1c0 3.5-2.1 6.8-5 7.9-2.9-1.1-5-4.4-5-7.9V7.4l5-2.2z' },
        { id: 'azul',      name: 'Azul',      hex: '#009fe3', textHex: '#ffffff', icon: 'rings',     svgPath: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 3.2a5.8 5.8 0 110 11.6 5.8 5.8 0 010-11.6zm0 2.8a3 3 0 100 6 3 3 0 000-6z' },
        { id: 'amarillo',  name: 'Amarillo',  hex: '#f5b800', textHex: '#111317', icon: 'bolt',      svgPath: 'M13.5 2L4 14h6.8l-1.3 8L20 10h-6.8l.3-8z' },
        { id: 'verde',     name: 'Verde',     hex: '#70c517', textHex: '#ffffff', icon: 'crest',     svgPath: 'M11 2h2v3.1a7 7 0 015.9 5.9H22v2h-3.1a7 7 0 01-5.9 5.9V22h-2v-3.1A7 7 0 015.1 13H2v-2h3.1A7 7 0 0111 5.1V2zm1 5a5 5 0 100 10 5 5 0 000-10zm0 3a2 2 0 110 4 2 2 0 010-4z' },
        { id: 'gris',      name: 'Gris',      hex: '#64748b', textHex: '#ffffff', icon: 'hexagon',   svgPath: 'M12 2l8.66 5v10L12 22l-8.66-5V7L12 2zm0 3.8L6.5 9v6l5.5 3.2 5.5-3.2V9L12 5.8z' },
        { id: 'magenta',   name: 'Magenta',   hex: '#d946ef', textHex: '#ffffff', icon: 'diamond',   svgPath: 'M12 2l9 10-9 10-9-10L12 2zm0 4.2L6.8 12 12 17.8 17.2 12 12 6.2z' },
        { id: 'morado',    name: 'Morado',    hex: '#2b1e3d', textHex: '#ffffff', icon: 'helm',      svgPath: 'M12 2C7.6 2 4 5.4 4 9.8v4.7L6.8 19h10.4L20 14.5V9.8C20 5.4 16.4 2 12 2zm-4.5 8.5h9l-1.5 3h-6l-1.5-3z' },
        { id: 'naranja',   name: 'Naranja',   hex: '#ea580c', textHex: '#ffffff', icon: 'flame',     svgPath: 'M12.5 2c1.8 3.6 6.5 5.9 6.5 11.2a7 7 0 11-14 0c0-2.7 1.3-5.2 3.4-6.9-.2 2 .8 3.3 2.2 3.8-1-2.6-.3-5.5 1.9-8.1z' },
        { id: 'cian',      name: 'Cian',      hex: '#06b6d4', textHex: '#111317', icon: 'prism',     svgPath: 'M12 2.5L2 19.5h20L12 2.5zm0 5.4l4.9 8.6H7.1L12 7.9z' },
        { id: 'blanco',    name: 'Blanco',    hex: '#f8fafc', textHex: '#111317', icon: 'crown',     svgPath: 'M3 18h18v2.5H3V18zm0-2.2l2.2-9.3 4.8 4.2L12 4l2 6.7 4.8-4.2L21 15.8H3z' },
        { id: 'negro',     name: 'Negro',     hex: '#111317', textHex: '#f5b800', icon: 'helmet',    svgPath: 'M12 2C7.6 2 4 5.4 4 9.8v4.7L6.8 19h10.4L20 14.5V9.8C20 5.4 16.4 2 12 2zm-4.5 8.5h9l-1.5 3h-6l-1.5-3z' },
        { id: 'rosa',      name: 'Rosa',      hex: '#e5195b', textHex: '#ffffff', icon: 'star',      svgPath: 'M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z' },
        { id: 'lima',      name: 'Lima',      hex: '#d8f000', textHex: '#111317', icon: 'radar',     svgPath: 'M12 3a9 9 0 109 9h-2.8a6.2 6.2 0 11-6.2-6.2V3zm0 4a5 5 0 105 5h-2.5a2.5 2.5 0 11-2.5-2.5V7z' },
        { id: 'turquesa',  name: 'Turquesa',  hex: '#0d9488', textHex: '#ffffff', icon: 'trident',   svgPath: 'M11 2h2v14h2.5l1.5-8 2 .5-1.8 9.5H13v4h-2v-4H6.8L5 8.5l2-.5 1.5 8H11V2z' },
        { id: 'dorado',    name: 'Dorado',    hex: '#c9a255', textHex: '#111317', icon: 'trophy',    svgPath: 'M5 3h14v4a7 7 0 01-5.5 6.8V17H17v3H7v-3h3.5v-3.2A7 7 0 015 7V3z' },
        { id: 'carmesi',   name: 'Carmesí',   hex: '#991b1b', textHex: '#ffffff', icon: 'sword',     svgPath: 'M16.5 2L22 7.5 10.5 19l-2.5-.5L5.5 21 3 18.5l2.5-2.5-.5-2.5L16.5 2z' }
    ].map((c) => ({
        ...c,
        voiceChannel: `🔊 Voz: Equipo ${c.name}`
    }));

    function shuffle(arr, rng) {
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

    function getTeamSize(teamFormat) {
        if (teamFormat === '2v2' || teamFormat === 2 || teamFormat === 4) return 2;
        if (teamFormat === '3v3' || teamFormat === 3 || teamFormat === 6) return 3;
        if (teamFormat === '4v4' || teamFormat === 4 || teamFormat === 8) return 4;
        throw new Error(`Formato no válido: ${teamFormat}`);
    }

    function normalizeKey(str) {
        return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function computeTeamsSpread(teams) {
        let min = Infinity;
        let max = -Infinity;
        for (const t of teams) {
            const sum = t.reduce((acc, p) => acc + p.pts, 0);
            if (sum < min) min = sum;
            if (sum > max) max = sum;
        }
        return max - min;
    }

    function buildSingleStrictPartition(players, teamCount, teamSize, rng) {
        const randomized = shuffle(players, rng).map((p) => ({
            ...p,
            pts: Math.max(1, Math.min(25, Math.round(Number(p.pts) || 12)))
        }));
        const sorted = randomized.slice().sort((a, b) => b.pts - a.pts);

        // Snake draft inicial
        const buckets = Array.from({ length: teamCount }, () => []);
        for (let i = 0; i < sorted.length; i++) {
            const cycle = Math.floor(i / teamCount);
            const idx = cycle % 2 === 0 ? (i % teamCount) : (teamCount - 1 - (i % teamCount));
            buckets[idx].push(sorted[i]);
        }

        // Búsqueda local por intercambios (2-swap) hasta alcanzar brecha <= 1 (ideal 0)
        const sums = buckets.map((b) => b.reduce((a, p) => a + p.pts, 0));
        for (let iter = 0; iter < 4000; iter++) {
            let maxIdx = 0;
            let minIdx = 0;
            for (let i = 1; i < teamCount; i++) {
                if (sums[i] > sums[maxIdx]) maxIdx = i;
                if (sums[i] < sums[minIdx]) minIdx = i;
            }
            const curSpread = sums[maxIdx] - sums[minIdx];
            if (curSpread === 0) break;

            let improved = false;
            let bestSwap = null;
            let bestNewDiff = curSpread;

            // Intentar reducir distancia entre maxIdx y minIdx, o contra cualquier otro equipo
            const targets = [minIdx];
            for (let t = 0; t < teamCount; t++) {
                if (t !== maxIdx && t !== minIdx) targets.push(t);
            }

            for (const otherIdx of targets) {
                for (let i = 0; i < teamSize; i++) {
                    for (let j = 0; j < teamSize; j++) {
                        const pA = buckets[maxIdx][i];
                        const pB = buckets[otherIdx][j];
                        if (pA.pts === pB.pts) continue;
                        const newMax = sums[maxIdx] - pA.pts + pB.pts;
                        const newOther = sums[otherIdx] - pB.pts + pA.pts;
                        const oldPairSpread = Math.abs(sums[maxIdx] - sums[otherIdx]);
                        const newPairSpread = Math.abs(newMax - newOther);
                        if (newPairSpread < oldPairSpread && newMax <= sums[maxIdx] && newOther <= sums[maxIdx]) {
                            const tempSums = sums.slice();
                            tempSums[maxIdx] = newMax;
                            tempSums[otherIdx] = newOther;
                            const nextSpread = Math.max(...tempSums) - Math.min(...tempSums);
                            if (nextSpread < bestNewDiff || (nextSpread === curSpread && newPairSpread < bestNewDiff)) {
                                bestNewDiff = nextSpread;
                                bestSwap = { a: maxIdx, i, b: otherIdx, j };
                            }
                        }
                    }
                }
                if (bestSwap && bestNewDiff <= 1) break;
            }

            if (bestSwap) {
                const { a, i, b, j } = bestSwap;
                const tmp = buckets[a][i];
                buckets[a][i] = buckets[b][j];
                buckets[b][j] = tmp;
                sums[a] = buckets[a].reduce((acc, p) => acc + p.pts, 0);
                sums[b] = buckets[b].reduce((acc, p) => acc + p.pts, 0);
                improved = true;
            }

            if (!improved) {
                // Perturbación aleatoria pequeña si se estancó con spread > 1
                if (curSpread <= 1) break;
                const rA = Math.floor((typeof rng === 'function' ? rng : Math.random)() * teamCount);
                const rB = Math.floor((typeof rng === 'function' ? rng : Math.random)() * teamCount);
                if (rA !== rB) {
                    const ri = Math.floor((typeof rng === 'function' ? rng : Math.random)() * teamSize);
                    const rj = Math.floor((typeof rng === 'function' ? rng : Math.random)() * teamSize);
                    const tmp = buckets[rA][ri];
                    buckets[rA][ri] = buckets[rB][rj];
                    buckets[rB][rj] = tmp;
                    sums[rA] = buckets[rA].reduce((acc, p) => acc + p.pts, 0);
                    sums[rB] = buckets[rB].reduce((acc, p) => acc + p.pts, 0);
                }
            }
        }

        return {
            buckets: buckets.map((b) => b.slice().sort((x, y) => y.pts - x.pts)),
            spread: computeTeamsSpread(buckets)
        };
    }

    function partitionSignature(buckets) {
        return buckets
            .map((b) => b.map((p) => normalizeKey(p.name || p.gamertag || p.id)).sort().join(','))
            .sort()
            .join('|');
    }

    function balanceTournamentTeams(players, teamFormat, options) {
        const teamSize = getTeamSize(teamFormat);
        if (!Array.isArray(players) || players.length < teamSize * 2) {
            throw new Error(`Se requieren al menos ${teamSize * 2} jugadores para armar 2 equipos ${teamFormat}.`);
        }
        if (players.length % teamSize !== 0) {
            throw new Error(`Cantidad de jugadores (${players.length}) no es múltiplo exacto del formato (${teamSize} por equipo).`);
        }
        const teamCount = players.length / teamSize;
        if (teamCount < 2 || teamCount > 16) {
            throw new Error(`El torneo soporta entre 2 y 16 equipos (actual: ${teamCount}).`);
        }

        const rng = options && typeof options.rng === 'function' ? options.rng : Math.random;
        const candidates = [];
        const seenSigs = new Set();

        for (let attempt = 0; attempt < 40; attempt++) {
            const res = buildSingleStrictPartition(players, teamCount, teamSize, rng);
            const sig = partitionSignature(res.buckets);
            if (!seenSigs.has(sig)) {
                seenSigs.add(sig);
                candidates.push(res);
            }
            const zeroOrOneCount = candidates.filter((c) => c.spread <= 1).length;
            if (zeroOrOneCount >= 2 && candidates.some((c) => c.spread === 0)) {
                break;
            }
        }

        candidates.sort((a, b) => a.spread - b.spread);
        const primary = candidates[0];
        if (!primary || primary.spread > 1) {
            throw new Error(
                `Balanceo estricto imposible con esta combinación de puntajes (brecha mínima encontrada: ${primary ? primary.spread : '?'} PTS; máximo permitido: 1 PT).`
            );
        }

        const formatPartition = (res, optionIdx) => {
            const teams = res.buckets.map((roster, idx) => {
                const color = OFFICIAL_COLORS[idx];
                const totalPts = roster.reduce((acc, p) => acc + p.pts, 0);
                return {
                    id: `team-${color.id}`,
                    seed: idx + 1,
                    name: `Equipo ${color.name}`,
                    colorId: color.id,
                    colorName: color.name,
                    hex: color.hex,
                    textHex: color.textHex,
                    icon: color.icon,
                    svgPath: color.svgPath,
                    voiceChannel: color.voiceChannel,
                    totalPts,
                    avgPts: Number((totalPts / teamSize).toFixed(1)),
                    players: roster
                };
            });
            // Ordenar seeds por totalPts descendente preservando color asignado
            teams.sort((a, b) => b.totalPts - a.totalPts);
            teams.forEach((t, i) => { t.seed = i + 1; });
            return {
                optionNumber: optionIdx + 1,
                spread: res.spread,
                isLessFavorable: optionIdx === 2,
                teams
            };
        };

        const validStrict = candidates.filter((c) => c.spread <= 1).slice(0, 2);
        const chosenOptions = validStrict.slice();
        const usedSigs = new Set(chosenOptions.map((c) => partitionSignature(c.buckets)));

        // Opción 3 (la menos favorable): buscar combinación distinta con brecha === 2 (o <= 2)
        let option3 = candidates.find((c) => c.spread === 2 && !usedSigs.has(partitionSignature(c.buckets)));
        if (!option3 && primary) {
            // Intentar generar un swap de 1-2 PTS desde primary para obtener una 3ra opción con brecha === 2 (máx 2)
            for (let tA = 0; tA < teamCount && !option3; tA++) {
                for (let tB = tA + 1; tB < teamCount && !option3; tB++) {
                    for (let i = 0; i < teamSize && !option3; i++) {
                        for (let j = 0; j < teamSize && !option3; j++) {
                            if (primary.buckets[tA][i].pts === primary.buckets[tB][j].pts) continue;
                            const cloned = primary.buckets.map((b) => b.slice());
                            const tmp = cloned[tA][i];
                            cloned[tA][i] = cloned[tB][j];
                            cloned[tB][j] = tmp;
                            const sp = computeTeamsSpread(cloned);
                            if (sp === 2) {
                                const sortedBuckets = cloned.map((b) => b.slice().sort((x, y) => y.pts - x.pts));
                                const sig = partitionSignature(sortedBuckets);
                                if (!usedSigs.has(sig)) {
                                    option3 = { buckets: sortedBuckets, spread: sp };
                                }
                            }
                        }
                    }
                }
            }
        }
        if (!option3) {
            option3 = candidates.find((c) => c.spread <= 2 && !usedSigs.has(partitionSignature(c.buckets)));
        }
        if (option3) {
            chosenOptions.push(option3);
        }

        return {
            format: `${teamSize}v${teamSize}`,
            teamCount,
            teamSize,
            alternatives: chosenOptions.map((res, idx) => formatPartition(res, idx))
        };
    }

    function buildSeedOrder(bracketSize) {
        let order = [1, 2];
        while (order.length < bracketSize) {
            const nextSum = order.length * 2 + 1;
            const next = [];
            for (const s of order) {
                next.push(s, nextSum - s);
            }
            order = next;
        }
        return order;
    }

    function getWinnersRoundName(roundIdx, totalWinnersRounds, eliminationType) {
        const remaining = totalWinnersRounds - roundIdx;
        if (remaining === 1) {
            return eliminationType === 'double' ? 'WINNERS FINAL' : 'GRAND FINAL';
        }
        if (remaining === 2) return 'WINNERS SEMIFINALS';
        if (remaining === 3) return 'WINNERS QUARTERFINALS';
        return `WINNERS ROUND ${roundIdx + 1}`;
    }

    function generateBracket(teams, options) {
        if (!Array.isArray(teams) || teams.length < 2 || teams.length > 16) {
            throw new Error(`El bracket requiere entre 2 y 16 equipos (recibidos: ${teams ? teams.length : 0}).`);
        }
        const elimination = (options && options.elimination === 'double') ? 'double' : 'single';
        const bestOf = (options && Number(options.bestOf) === 5) ? 5 : 3;

        const n = teams.length;
        let bracketSize = 2;
        while (bracketSize < n) bracketSize *= 2;

        const sortedTeams = teams.slice().sort((a, b) => (a.seed || 99) - (b.seed || 99));
        const seedOrder = buildSeedOrder(bracketSize);
        const totalWinnersRounds = Math.log2(bracketSize);

        const matches = [];
        const matchMap = new Map();
        const roundsMeta = [];

        // Construir rondas de Winners
        const winnersRounds = [];
        for (let r = 0; r < totalWinnersRounds; r++) {
            const matchCount = bracketSize / Math.pow(2, r + 1);
            const roundName = getWinnersRoundName(r, totalWinnersRounds, elimination);
            const roundMatches = [];
            for (let m = 0; m < matchCount; m++) {
                const matchObj = {
                    id: `W-R${r + 1}-M${m + 1}`,
                    bracket: 'WINNERS',
                    roundIndex: r,
                    roundName,
                    matchIndex: m,
                    bestOf,
                    teamAId: null,
                    teamBId: null,
                    scoreA: null,
                    scoreB: null,
                    winnerId: null,
                    loserId: null,
                    isBye: false,
                    status: 'PENDING',
                    nextMatchId: null,
                    nextSlot: null,
                    loserToMatchId: null,
                    loserToSlot: null,
                    confirmDeadline: null,
                    pendingReport: null
                };
                roundMatches.push(matchObj);
                matches.push(matchObj);
                matchMap.set(matchObj.id, matchObj);
            }
            winnersRounds.push(roundMatches);
            roundsMeta.push({ bracket: 'WINNERS', roundIndex: r, roundName, matchIds: roundMatches.map((x) => x.id) });
        }

        // Enlazar Winners -> siguiente ronda Winners
        for (let r = 0; r < totalWinnersRounds - 1; r++) {
            for (let m = 0; m < winnersRounds[r].length; m++) {
                const target = winnersRounds[r + 1][Math.floor(m / 2)];
                winnersRounds[r][m].nextMatchId = target.id;
                winnersRounds[r][m].nextSlot = (m % 2 === 0) ? 'A' : 'B';
            }
        }

        // Poblar Ronda 1 con seeding oficial + BYEs automáticos para mejores seeds
        for (let m = 0; m < winnersRounds[0].length; m++) {
            const seedA = seedOrder[m * 2];
            const seedB = seedOrder[m * 2 + 1];
            const teamA = seedA <= n ? sortedTeams[seedA - 1] : null;
            const teamB = seedB <= n ? sortedTeams[seedB - 1] : null;
            const matchObj = winnersRounds[0][m];
            matchObj.teamAId = teamA ? teamA.id : null;
            matchObj.teamBId = teamB ? teamB.id : null;
        }

        // Si es Doble Eliminación, construir Losers Bracket (ELIMINATION) + GRAND FINAL
        let grandFinal = null;
        if (elimination === 'double') {
            const losersRounds = [];
            if (totalWinnersRounds === 1) {
                // 2 equipos: W-R1-M1 (Winners Final), ganador vs perdedor en Grand Final directo o Elims
                grandFinal = {
                    id: 'GF-1',
                    bracket: 'GRAND_FINAL',
                    roundIndex: 0,
                    roundName: 'GRAND FINAL',
                    matchIndex: 0,
                    bestOf,
                    teamAId: null,
                    teamBId: null,
                    scoreA: null,
                    scoreB: null,
                    winnerId: null,
                    loserId: null,
                    isBye: false,
                    status: 'PENDING',
                    nextMatchId: null,
                    nextSlot: null,
                    loserToMatchId: null,
                    loserToSlot: null,
                    confirmDeadline: null,
                    pendingReport: null
                };
                winnersRounds[0][0].nextMatchId = grandFinal.id;
                winnersRounds[0][0].nextSlot = 'A';
                winnersRounds[0][0].loserToMatchId = grandFinal.id;
                winnersRounds[0][0].loserToSlot = 'B';
                matches.push(grandFinal);
                matchMap.set(grandFinal.id, grandFinal);
                roundsMeta.push({ bracket: 'GRAND_FINAL', roundIndex: 0, roundName: 'GRAND FINAL', matchIds: [grandFinal.id] });
            } else {
                const totalLosersRounds = (totalWinnersRounds - 1) * 2;
                for (let lr = 0; lr < totalLosersRounds; lr++) {
                    const power = Math.floor(lr / 2) + 2;
                    const count = Math.max(1, bracketSize / Math.pow(2, power));
                    const roundName = lr === totalLosersRounds - 1 ? 'ELIMINATION FINAL' : `ELIMINATION ROUND ${lr + 1}`;
                    const lMatches = [];
                    for (let m = 0; m < count; m++) {
                        const obj = {
                            id: `L-R${lr + 1}-M${m + 1}`,
                            bracket: 'ELIMINATION',
                            roundIndex: lr,
                            roundName,
                            matchIndex: m,
                            bestOf,
                            teamAId: null,
                            teamBId: null,
                            scoreA: null,
                            scoreB: null,
                            winnerId: null,
                            loserId: null,
                            isBye: false,
                            status: 'PENDING',
                            nextMatchId: null,
                            nextSlot: null,
                            loserToMatchId: null,
                            loserToSlot: null,
                            confirmDeadline: null,
                            pendingReport: null
                        };
                        lMatches.push(obj);
                        matches.push(obj);
                        matchMap.set(obj.id, obj);
                    }
                    losersRounds.push(lMatches);
                    roundsMeta.push({ bracket: 'ELIMINATION', roundIndex: lr, roundName, matchIds: lMatches.map((x) => x.id) });
                }

                // Enlazar Losers -> siguiente ronda Losers
                for (let lr = 0; lr < losersRounds.length - 1; lr++) {
                    const cur = losersRounds[lr];
                    const nxt = losersRounds[lr + 1];
                    if (cur.length === nxt.length) {
                        // Ronda impar -> ronda par (recibe perdedores de Winners en slot B)
                        for (let m = 0; m < cur.length; m++) {
                            cur[m].nextMatchId = nxt[m].id;
                            cur[m].nextSlot = 'A';
                        }
                    } else {
                        for (let m = 0; m < cur.length; m++) {
                            cur[m].nextMatchId = nxt[Math.floor(m / 2)].id;
                            cur[m].nextSlot = (m % 2 === 0) ? 'A' : 'B';
                        }
                    }
                }

                // Perdedores de Winners R1 caen a L-R1
                for (let m = 0; m < winnersRounds[0].length; m++) {
                    winnersRounds[0][m].loserToMatchId = losersRounds[0][Math.floor(m / 2)].id;
                    winnersRounds[0][m].loserToSlot = (m % 2 === 0) ? 'A' : 'B';
                }
                // Perdedores de Winners R(k >= 1) caen a L-R(2k - 1) en slot B
                for (let wr = 1; wr < totalWinnersRounds; wr++) {
                    const targetLr = (wr * 2) - 1;
                    const targetMatches = losersRounds[targetLr];
                    for (let m = 0; m < winnersRounds[wr].length; m++) {
                        // Invertir orden para evitar rematches tempranos
                        const tIdx = targetMatches.length - 1 - m;
                        winnersRounds[wr][m].loserToMatchId = targetMatches[tIdx].id;
                        winnersRounds[wr][m].loserToSlot = 'B';
                    }
                }

                grandFinal = {
                    id: 'GF-1',
                    bracket: 'GRAND_FINAL',
                    roundIndex: 0,
                    roundName: 'GRAND FINAL',
                    matchIndex: 0,
                    bestOf,
                    teamAId: null,
                    teamBId: null,
                    scoreA: null,
                    scoreB: null,
                    winnerId: null,
                    loserId: null,
                    isBye: false,
                    status: 'PENDING',
                    nextMatchId: null,
                    nextSlot: null,
                    loserToMatchId: null,
                    loserToSlot: null,
                    confirmDeadline: null,
                    pendingReport: null
                };
                winnersRounds[totalWinnersRounds - 1][0].nextMatchId = grandFinal.id;
                winnersRounds[totalWinnersRounds - 1][0].nextSlot = 'A';
                losersRounds[losersRounds.length - 1][0].nextMatchId = grandFinal.id;
                losersRounds[losersRounds.length - 1][0].nextSlot = 'B';

                matches.push(grandFinal);
                matchMap.set(grandFinal.id, grandFinal);
                roundsMeta.push({ bracket: 'GRAND_FINAL', roundIndex: 0, roundName: 'GRAND FINAL', matchIds: [grandFinal.id] });
            }
        }

        // Propagar BYEs automáticamente en Winners Ronda 1 (y cascada en Losers si aplica)
        for (const m of winnersRounds[0]) {
            if (m.teamAId && !m.teamBId) {
                m.isBye = true;
                m.status = 'COMPLETED';
                m.winnerId = m.teamAId;
                if (m.nextMatchId) {
                    const nxt = matchMap.get(m.nextMatchId);
                    if (m.nextSlot === 'A') nxt.teamAId = m.teamAId;
                    else nxt.teamBId = m.teamAId;
                }
            } else if (!m.teamAId && m.teamBId) {
                m.isBye = true;
                m.status = 'COMPLETED';
                m.winnerId = m.teamBId;
                if (m.nextMatchId) {
                    const nxt = matchMap.get(m.nextMatchId);
                    if (m.nextSlot === 'A') nxt.teamAId = m.teamBId;
                    else nxt.teamBId = m.teamBId;
                }
            } else if (!m.teamAId && !m.teamBId) {
                m.isBye = true;
                m.status = 'COMPLETED';
            }
        }

        // Si en Losers R1 un match recibió un equipo real y un hueco vacío porque su contraparte en W-R1 fue BYE, marcar BYE también
        if (elimination === 'double') {
            for (const m of matches) {
                if (m.bracket === 'ELIMINATION' && m.roundIndex === 0) {
                    const feedersFromW = matches.filter((w) => w.loserToMatchId === m.id);
                    const allFeedersResolved = feedersFromW.every((w) => w.status === 'COMPLETED' && !w.loserId);
                    if (allFeedersResolved && !m.teamAId && !m.teamBId) {
                        m.isBye = true;
                        m.status = 'COMPLETED';
                    }
                }
            }
        }

        return {
            elimination,
            bestOf,
            bracketSize,
            teamCount: n,
            byeCount: bracketSize - n,
            rounds: roundsMeta,
            matches
        };
    }

    function generatePhaseMaps(manifest, format, bestOf, mapEngineOrOpts, maybeOpts) {
        let engine = (typeof globalThis !== 'undefined' ? globalThis.HaloMapEngine : null);
        let opts = {};
        if (mapEngineOrOpts && typeof mapEngineOrOpts.drawMaps === 'function') {
            engine = mapEngineOrOpts;
            if (maybeOpts && typeof maybeOpts === 'object') opts = maybeOpts;
        } else if (mapEngineOrOpts && typeof mapEngineOrOpts === 'object') {
            opts = mapEngineOrOpts;
            if (opts.mapEngine && typeof opts.mapEngine.drawMaps === 'function') engine = opts.mapEngine;
        }
        if (!engine || typeof engine.drawMaps !== 'function') {
            throw new Error('HaloMapEngine no está disponible para generar los mapas por fase.');
        }
        const count = Number(bestOf) === 5 ? 5 : 3;
        const teamCount = Number(opts.teamCount || 0);
        const includeGrandFinal = (opts.elimination === undefined) ? true : (opts.elimination === 'double');
        const phases = [];
        if (teamCount > 8) phases.push('Win 1');
        phases.push('Quarterfinals', 'Semifinals', 'Final');
        if (includeGrandFinal) phases.push('Grand Final');
        const out = {};
        for (const phase of phases) {
            const draw = engine.drawMaps(manifest, format);
            out[phase] = draw.maps.slice(0, count);
        }
        return out;
    }

    function parseParceroMessage(text, teams) {
        const raw = String(text || '').trim();
        if (!/\bparcero\b/i.test(raw)) {
            return { ok: false, reason: 'NOT_PARCERO_TRIGGER', message: 'El mensaje debe invocar a "Parcero".' };
        }
        const trnMatch = raw.match(/\b(TRN-[A-Z0-9]{4,8})\b/i);
        if (!trnMatch) {
            return { ok: false, reason: 'MISSING_TRN_ID', message: 'Falta el ID del torneo (ej. TRN-4821).' };
        }
        const tournamentId = trnMatch[1].toUpperCase();

        const scoreMatch = raw.match(/(?<!\d)(\d{1,2})\s*(?:-|a|vs|:)\s*(\d{1,2})(?!\d)/i);
        if (!scoreMatch) {
            return { ok: false, reason: 'MISSING_SCORE', message: 'Falta el marcador de la serie (ej. 2-1 o 3-0).' };
        }
        const score1 = parseInt(scoreMatch[1], 10);
        const score2 = parseInt(scoreMatch[2], 10);
        if (score1 === score2) {
            return { ok: false, reason: 'TIE_NOT_ALLOWED', message: 'El marcador no puede ser empate.' };
        }

        // Detectar los 2 equipos mencionados en orden de aparición en el texto
        const foundTeams = [];
        const lowerRaw = raw.toLowerCase();
        for (const team of (teams || [])) {
            const colorLower = String(team.colorName || '').toLowerCase();
            const nameLower = String(team.name || '').toLowerCase();
            let pos = -1;
            if (nameLower && lowerRaw.indexOf(nameLower) !== -1) {
                pos = lowerRaw.indexOf(nameLower);
            } else if (colorLower) {
                const re = new RegExp(`\\b${colorLower}\\b`, 'i');
                const m = raw.match(re);
                if (m) pos = m.index;
            }
            if (pos !== -1) {
                foundTeams.push({ team, pos });
            }
        }
        foundTeams.sort((a, b) => a.pos - b.pos);
        if (foundTeams.length < 2) {
            return { ok: false, reason: 'MISSING_TEAMS', message: 'Debes mencionar los 2 equipos del enfrentamiento.' };
        }

        return {
            ok: true,
            tournamentId,
            firstTeam: foundTeams[0].team,
            secondTeam: foundTeams[1].team,
            score1,
            score2
        };
    }

    function sealMatchResult(tournament, matchObj, winnerId, loserId, scoreA, scoreB, sealedBy) {
        matchObj.winnerId = winnerId;
        matchObj.loserId = loserId;
        matchObj.scoreA = scoreA;
        matchObj.scoreB = scoreB;
        matchObj.status = 'COMPLETED';
        matchObj.confirmDeadline = null;
        matchObj.sealedBy = sealedBy;

        const byId = new Map(tournament.matches.map((m) => [m.id, m]));
        if (matchObj.nextMatchId && byId.has(matchObj.nextMatchId)) {
            const nxt = byId.get(matchObj.nextMatchId);
            if (matchObj.nextSlot === 'A') nxt.teamAId = winnerId;
            else nxt.teamBId = winnerId;
        }
        if (matchObj.loserToMatchId && byId.has(matchObj.loserToMatchId) && loserId) {
            const lNxt = byId.get(matchObj.loserToMatchId);
            if (matchObj.loserToSlot === 'A') lNxt.teamAId = loserId;
            else lNxt.teamBId = loserId;
        }

        // Si es el último match del torneo (GRAND FINAL o único WINNERS FINAL en Simple), registrar en winners
        const isFinalMatch = matchObj.bracket === 'GRAND_FINAL'
            || (tournament.bracket.elimination === 'single' && !matchObj.nextMatchId);

        if (isFinalMatch) {
            const champTeam = (tournament.teams || []).find((t) => t.id === winnerId);
            if (champTeam) {
                if (!Array.isArray(tournament.winners)) tournament.winners = [];
                const alreadyRecorded = tournament.winners.some((w) => w.tournamentId === tournament.id);
                if (!alreadyRecorded) {
                    tournament.winners.unshift({
                        tournamentId: tournament.id,
                        tournamentName: tournament.name,
                        format: tournament.format,
                        date: new Date().toISOString().slice(0, 10),
                        teamId: champTeam.id,
                        teamName: champTeam.name,
                        colorHex: champTeam.hex,
                        players: champTeam.players.map((p) => p.name || p.gamertag)
                    });
                }
                tournament.championTeamId = champTeam.id;
            }
        }
    }

    function resolveExpiredConfirmations(tournament, nowMs) {
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        const autoSealed = [];
        for (const m of (tournament.matches || [])) {
            if (m.status === 'CONFIRMING' && m.confirmDeadline && now >= m.confirmDeadline && m.pendingReport) {
                const pr = m.pendingReport;
                sealMatchResult(tournament, m, pr.winnerId, pr.loserId, pr.scoreA, pr.scoreB, 'AUTO_TIMEOUT_10M');
                autoSealed.push(m.id);
            }
        }
        return autoSealed;
    }

    function processParceroCommand(tournament, payload, nowMs) {
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        resolveExpiredConfirmations(tournament, now);

        const parsed = parseParceroMessage(payload && payload.text, tournament && tournament.teams);
        if (!parsed.ok) return parsed;

        if (parsed.tournamentId !== String(tournament.id || '').toUpperCase()) {
            return {
                ok: false,
                reason: 'TOURNAMENT_MISMATCH',
                message: `El ID ${parsed.tournamentId} no coincide con este torneo (${tournament.id}).`
            };
        }

        // Regla 3b: 1 Gamertag = 1 sesión (evitar suplantación por otro authorId)
        const gtKey = normalizeKey(payload.authorGamertag);
        const authorId = String(payload.authorId || '').trim();
        if (!gtKey) {
            return { ok: false, reason: 'MISSING_GAMERTAG', message: 'Debes vincular tu Gamertag para reportar.' };
        }
        if (!tournament.gamertagSessions) tournament.gamertagSessions = {};
        if (authorId && tournament.gamertagSessions[gtKey] && tournament.gamertagSessions[gtKey] !== authorId) {
            return {
                ok: false,
                reason: 'SESSION_CONFLICT',
                message: `⛔ El Gamertag ${payload.authorGamertag} ya está vinculado a otra sesión activa.`
            };
        }

        // Regla 2: Buscar llave PENDING o CONFIRMING con esos 2 equipos
        const id1 = parsed.firstTeam.id;
        const id2 = parsed.secondTeam.id;
        const matchObj = (tournament.matches || []).find((m) =>
            (m.status === 'PENDING' || m.status === 'CONFIRMING')
            && ((m.teamAId === id1 && m.teamBId === id2) || (m.teamAId === id2 && m.teamBId === id1))
        );
        if (!matchObj) {
            return {
                ok: false,
                reason: 'MATCH_NOT_FOUND',
                message: `No existe una llave activa (PENDING/CONFIRMING) entre ${parsed.firstTeam.name} y ${parsed.secondTeam.name}.`
            };
        }

        const teamA = tournament.teams.find((t) => t.id === matchObj.teamAId);
        const teamB = tournament.teams.find((t) => t.id === matchObj.teamBId);
        const inA = teamA && teamA.players.some((p) => normalizeKey(p.name || p.gamertag) === gtKey);
        const inB = teamB && teamB.players.some((p) => normalizeKey(p.name || p.gamertag) === gtKey);

        // Regla 3a: Candado por Gamertag
        if (!inA && !inB) {
            return {
                ok: false,
                reason: 'UNAUTHORIZED_GAMERTAG',
                message: '⛔ Acceso denegado: no perteneces a ninguno de los equipos de este enfrentamiento'
            };
        }

        if (authorId) {
            tournament.gamertagSessions[gtKey] = authorId;
        }

        const reporterTeamId = inA ? teamA.id : teamB.id;
        const scoreA = (parsed.firstTeam.id === teamA.id) ? parsed.score1 : parsed.score2;
        const scoreB = (parsed.firstTeam.id === teamA.id) ? parsed.score2 : parsed.score1;
        const winnerId = scoreA > scoreB ? teamA.id : teamB.id;
        const loserId = scoreA > scoreB ? teamB.id : teamA.id;

        // Regla 4: Confirmación cruzada
        if (reporterTeamId === loserId) {
            // El perdedor reporta o confirma -> sella de inmediato
            sealMatchResult(tournament, matchObj, winnerId, loserId, scoreA, scoreB, 'LOSER_CONFIRM');
            return {
                ok: true,
                action: 'SEALED_IMMEDIATE',
                matchId: matchObj.id,
                winnerId,
                loserId,
                scoreA,
                scoreB,
                message: `✅ Resultado sellado de inmediato (${teamA.name} ${scoreA} - ${scoreB} ${teamB.name}).`
            };
        }

        // El ganador reporta -> abre ventana de 10 minutos (CONFIRMING)
        matchObj.status = 'CONFIRMING';
        matchObj.confirmDeadline = now + 600000;
        matchObj.pendingReport = {
            winnerId,
            loserId,
            scoreA,
            scoreB,
            submittedByTeamId: reporterTeamId,
            submittedByGamertag: payload.authorGamertag
        };
        return {
            ok: true,
            action: 'CONFIRMING_OPENED',
            matchId: matchObj.id,
            confirmDeadline: matchObj.confirmDeadline,
            winnerId,
            loserId,
            scoreA,
            scoreB,
            message: `⏳ Reporte recibido (${teamA.name} ${scoreA} - ${scoreB} ${teamB.name}). Esperando confirmación del rival o auto-sellado en 10 min.`
        };
    }

    function adminMoveOrSetMatchResult(tournament, matchId, opts) {
        if (!tournament || !Array.isArray(tournament.matches)) {
            return { ok: false, error: 'INVALID_TOURNAMENT' };
        }
        const matchObj = tournament.matches.find((m) => m.id === matchId);
        if (!matchObj) {
            return { ok: false, error: 'MATCH_NOT_FOUND' };
        }
        const cfg = opts || {};

        if (cfg.slotAId !== undefined) matchObj.teamAId = cfg.slotAId || null;
        if (cfg.slotBId !== undefined) matchObj.teamBId = cfg.slotBId || null;

        if (cfg.reopen) {
            matchObj.status = 'PENDING';
            matchObj.winnerId = null;
            matchObj.loserId = null;
            matchObj.scoreA = null;
            matchObj.scoreB = null;
            matchObj.confirmDeadline = null;
            matchObj.pendingReport = null;
            matchObj.sealedBy = null;
            matchObj.isBye = false;
            return { ok: true, action: 'REOPENED', match: matchObj };
        }

        if (cfg.winnerTeamId) {
            const loserId = (cfg.winnerTeamId === matchObj.teamAId)
                ? matchObj.teamBId
                : (cfg.winnerTeamId === matchObj.teamBId ? matchObj.teamAId : null);
            const sA = cfg.scoreA !== undefined && cfg.scoreA !== null ? Number(cfg.scoreA) : (cfg.winnerTeamId === matchObj.teamAId ? 2 : 0);
            const sB = cfg.scoreB !== undefined && cfg.scoreB !== null ? Number(cfg.scoreB) : (cfg.winnerTeamId === matchObj.teamBId ? 2 : 0);
            sealMatchResult(tournament, matchObj, cfg.winnerTeamId, loserId, sA, sB, 'ADMIN_OVERRIDE');
            return { ok: true, action: 'ADMIN_SEALED', match: matchObj };
        }

        if (cfg.scoreA !== undefined) matchObj.scoreA = cfg.scoreA === null || cfg.scoreA === '' ? null : Number(cfg.scoreA);
        if (cfg.scoreB !== undefined) matchObj.scoreB = cfg.scoreB === null || cfg.scoreB === '' ? null : Number(cfg.scoreB);

        return { ok: true, action: 'SLOTS_UPDATED', match: matchObj };
    }

    return {
        OFFICIAL_COLORS,
        balanceTournamentTeams,
        generateBracket,
        generatePhaseMaps,
        parseParceroMessage,
        processParceroCommand,
        resolveExpiredConfirmations,
        adminMoveOrSetMatchResult
    };
}));
