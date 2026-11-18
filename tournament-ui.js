(function () {
    'use strict';

    const LOCAL_BOT_BASE = 'http://localhost:3001';
    const TOURNAMENTS_COL = 'artifacts/halomatch-d9240/public/data/tournaments';
    const WINNERS_COL = 'artifacts/halomatch-d9240/public/data/tournamentWinners';

    const state = {
        mounted: false,
        subView: 'create',
        cfg: { format: '4v4', bestOf: 3, elimination: 'double' },
        selectedRosterIds: new Set(),
        guests: [],
        balancedAlternatives: [],
        selectedAlternativeIdx: 0,
        activeTournament: null,
        mapsManifest: null,
        drawnPhaseMaps: null,
        winnersHistory: [],
        adminKey: '',
        shieldClicks: [],
        currentAdminMatchId: null,
        unsubTournament: null,
        unsubWinners: null,
        fsCtx: null,
        parceroSyncTimer: null,
        parceroSyncInFlight: false
    };

    function getTeamSize() {
        return state.cfg.format === '2v2' ? 2 : state.cfg.format === '3v3' ? 3 : 4;
    }

    function getTeamVisual(t) {
        return {
            hex: t?.hex || t?.color?.hex || '#64748b',
            textHex: t?.textHex || t?.color?.textHex || '#ffffff',
            svgPath: t?.svgPath || t?.color?.svgPath || ''
        };
    }

    function notify(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info');
        }
    }

    function getPlayersPool() {
        const rosterList = Array.isArray(window.roster) ? window.roster : [];
        const pickedRoster = rosterList
            .filter(p => state.selectedRosterIds.has(p.id))
            .map(p => ({ id: p.id, name: p.name, pts: Number(p.pts) || 12 }));
        return pickedRoster.concat(state.guests);
    }

    function getActiveTeamCount() {
        const altCount = state.balancedAlternatives[state.selectedAlternativeIdx]?.teams?.length;
        if (altCount) return altCount;
        if (state.activeTournament?.teams?.length) return state.activeTournament.teams.length;
        return Math.floor(getPlayersPool().length / getTeamSize());
    }

    function getPhasesForConfig(teamCountOverride) {
        const teamCount = typeof teamCountOverride === 'number' ? teamCountOverride : getActiveTeamCount();
        const phases = [];
        if (teamCount > 8) {
            phases.push({ key: 'Win 1', title: 'Mapas de Win 1', fileName: 'mapas-win-1.png' });
        }
        phases.push(
            { key: 'Quarterfinals', title: 'Mapas de Quarterfinals', fileName: 'mapas-quarterfinals.png' },
            { key: 'Semifinals', title: 'Mapas de Semifinals', fileName: 'mapas-semifinals.png' },
            { key: 'Final', title: 'Mapas de Final', fileName: 'mapas-final.png' }
        );
        if (state.cfg.elimination === 'double') {
            phases.push({ key: 'Grand Final', title: 'Mapas de Grand Final', fileName: 'mapas-grand-final.png' });
        }
        return phases;
    }

    async function fetchLiveMapsManifest() {
        const ts = Date.now();
        try {
            const r1 = await fetch(`/api/maps-manifest?t=${ts}`, { cache: 'no-store' });
            if (r1.ok) {
                state.mapsManifest = await r1.json();
                return state.mapsManifest;
            }
        } catch (e) {}
        try {
            const r2 = await fetch(`maps-manifest.json?t=${ts}`, { cache: 'no-store' });
            if (r2.ok) {
                state.mapsManifest = await r2.json();
                return state.mapsManifest;
            }
        } catch (e) {}
        return state.mapsManifest;
    }

    // =========================================================
    // FIRESTORE TIEMPO REAL (COLECCIONES DEDICADAS DE TORNEO)
    // =========================================================
    async function ensureFirestoreContext() {
        if (state.fsCtx) return state.fsCtx;
        try {
            const [appMod, fsMod] = await Promise.all([
                import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
            ]);
            const apps = appMod.getApps();
            if (!apps.length) return null;
            const db = fsMod.getFirestore(apps[0]);
            state.fsCtx = { db, fsMod };
            return state.fsCtx;
        } catch (e) {
            return null;
        }
    }

    function toFirestoreValue(val) {
        if (val === null || val === undefined) return { nullValue: null };
        if (typeof val === 'boolean') return { booleanValue: val };
        if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
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

    function fromFirestoreValue(val) {
        if (!val || typeof val !== 'object') return null;
        if ('nullValue' in val) return null;
        if ('booleanValue' in val) return Boolean(val.booleanValue);
        if ('integerValue' in val) return Number(val.integerValue);
        if ('doubleValue' in val) return Number(val.doubleValue);
        if ('stringValue' in val) return String(val.stringValue);
        if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromFirestoreValue);
        if ('mapValue' in val) {
            const out = {};
            for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
                out[k] = fromFirestoreValue(v);
            }
            return out;
        }
        return null;
    }

    async function saveTournamentToFirestore(tournamentObj) {
        const cleanObj = JSON.parse(JSON.stringify({
            ...tournamentObj,
            phaseBannerImages: [], // No saturar documento Firestore con DataURLs pesados
            updatedAt: Date.now()
        }));

        const ctx = await ensureFirestoreContext();
        if (ctx) {
            try {
                const ref = ctx.fsMod.doc(ctx.db, ...`${TOURNAMENTS_COL}/${cleanObj.id}`.split('/'));
                await ctx.fsMod.setDoc(ref, cleanObj);
                return true;
            } catch (e) {}
        }

        const restBase = window.FIRESTORE_REST_BASE;
        if (restBase) {
            try {
                const res = await fetch(`${restBase}/tournaments/${encodeURIComponent(cleanObj.id)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields: toFirestoreValue(cleanObj).mapValue.fields })
                });
                return res.ok;
            } catch (e) {}
        }
        return false;
    }

    async function loadTournamentFromCloud(tournamentId) {
        const id = String(tournamentId || '').trim().toUpperCase();
        if (!id) return null;

        const ctx = await ensureFirestoreContext();
        if (ctx) {
            try {
                const ref = ctx.fsMod.doc(ctx.db, ...`${TOURNAMENTS_COL}/${id}`.split('/'));
                const snap = await ctx.fsMod.getDoc(ref);
                if (snap.exists()) return snap.data();
            } catch (e) {}
        }

        const restBase = window.FIRESTORE_REST_BASE;
        if (restBase) {
            try {
                const res = await fetch(`${restBase}/tournaments/${encodeURIComponent(id)}?t=${Date.now()}`, { cache: 'no-store' });
                if (res.ok) {
                    const docJson = await res.json();
                    if (docJson && docJson.fields) return fromFirestoreValue({ mapValue: { fields: docJson.fields } });
                }
            } catch (e) {}
        }

        try {
            const res = await fetch(`${LOCAL_BOT_BASE}/api/tournament/${encodeURIComponent(id)}?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const d = await res.json();
                if (d?.tournament) return d.tournament;
            }
        } catch (e) {}
        return null;
    }

    async function subscribeTournamentRealtime(tournamentId) {
        if (state.unsubTournament) {
            try { state.unsubTournament(); } catch (e) {}
            state.unsubTournament = null;
        }
        const ctx = await ensureFirestoreContext();
        if (!ctx || !tournamentId) return;
        const ref = ctx.fsMod.doc(ctx.db, ...`${TOURNAMENTS_COL}/${tournamentId}`.split('/'));
        state.unsubTournament = ctx.fsMod.onSnapshot(ref, (snap) => {
            if (!snap.exists()) return;
            state.activeTournament = snap.data();
            const badge = document.getElementById('trnTopBadge');
            if (badge) badge.textContent = `${state.activeTournament.id} • ${state.activeTournament.teams.length} Equipos`;
            const statusEl = document.getElementById('trnRealtimeBadge');
            if (statusEl) statusEl.textContent = `En vivo (${state.activeTournament.id})`;
            if (state.subView === 'bracket') renderBracketView();
        }, () => {});
    }

    async function subscribeWinnersRealtime() {
        if (state.unsubWinners) return;
        const ctx = await ensureFirestoreContext();
        if (ctx) {
            try {
                const colRef = ctx.fsMod.collection(ctx.db, ...WINNERS_COL.split('/'));
                state.unsubWinners = ctx.fsMod.onSnapshot(colRef, (snap) => {
                    const list = [];
                    snap.forEach(docSnap => {
                        const d = docSnap.data();
                        if (Array.isArray(d.entries)) list.push(...d.entries);
                        else if (d.teamName) list.push(d);
                    });
                    if (list.length) {
                        state.winnersHistory = list;
                        if (state.subView === 'winners') renderWinnersView();
                    }
                }, () => {});
                return;
            } catch (e) {}
        }
        const restBase = window.FIRESTORE_REST_BASE;
        if (restBase) {
            try {
                const res = await fetch(`${restBase}/tournamentWinners?t=${Date.now()}`, { cache: 'no-store' });
                if (res.ok) {
                    const json = await res.json();
                    const list = [];
                    (json.documents || []).forEach(doc => {
                        const d = fromFirestoreValue({ mapValue: { fields: doc.fields || {} } });
                        if (d && Array.isArray(d.entries)) list.push(...d.entries);
                        else if (d && d.teamName) list.push(d);
                    });
                    if (list.length) state.winnersHistory = list;
                }
            } catch (e) {}
        }
    }

    // =========================================================
    // MONTAJE DEL OVERLAY HTML
    // =========================================================
    function ensureMounted() {
        if (state.mounted || document.getElementById('tournamentModuleOverlay')) {
            state.mounted = true;
            return;
        }
        const overlay = document.createElement('div');
        overlay.id = 'tournamentModuleOverlay';
        overlay.className = 'fixed inset-0 z-50 hidden overflow-y-auto bg-[#0b0c0e] text-slate-100 pb-12';
        overlay.innerHTML = `
            <header class="sticky top-0 z-50 bg-[#0d0f13]/95 backdrop-blur-md border-b border-[#c9a255]/45 px-3 sm:px-6 py-2.5 shadow-xl">
                <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
                    <div class="flex items-center gap-2.5">
                        <button type="button" onclick="closeTournamentModule()" class="px-2.5 py-1.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 text-cyan-200 font-orbitron font-bold text-[11px] flex items-center gap-1.5 transition">
                            <i class="fa-solid fa-arrow-left"></i>
                            <span class="hidden sm:inline">Volver a Halo Match</span>
                        </button>
                        <div class="hidden md:block">
                            <div class="font-hcs font-bold text-base tracking-wider text-white uppercase leading-none">🏆 TORNEO HCS</div>
                            <div class="text-[11px] text-slate-400"><span id="trnTopBadge" class="text-amber-300 font-semibold">Sin torneo activo</span> • <span id="trnRealtimeBadge" class="text-emerald-300">Firestore Ready</span></div>
                        </div>
                    </div>

                    <nav class="flex flex-wrap items-center gap-1.5">
                        <div class="relative mr-1">
                            <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]"></i>
                            <input id="trnBracketSearchInput" type="text" placeholder="Buscar Gamertag..." class="pl-7 pr-2.5 py-1 rounded bg-[#0c0e11] border border-slate-600 text-xs text-white focus:border-[#c9a255] outline-none w-36 sm:w-48">
                        </div>
                        <button id="trnNav-create" type="button" class="px-2.5 sm:px-3 py-1.5 rounded text-xs font-semibold bg-[#c9a255] text-black font-orbitron">1. Crear</button>
                        <button id="trnNav-maps" type="button" class="px-2.5 sm:px-3 py-1.5 rounded text-xs font-semibold bg-slate-800/90 text-cyan-200 border border-cyan-500/40">🔀 Mapas</button>
                        <button id="trnNav-bracket" type="button" class="px-2.5 sm:px-3 py-1.5 rounded text-xs font-semibold bg-slate-800/90 text-slate-200 border border-slate-700">2. Bracket</button>
                        <button id="trnNav-winners" type="button" class="px-2.5 sm:px-3 py-1.5 rounded text-xs font-semibold bg-slate-800/90 text-slate-200 border border-slate-700">3. Winners</button>
                    </nav>
                </div>
            </header>

            <main class="max-w-7xl mx-auto px-3 sm:px-6 pt-5">
                <!-- VISTA 1: CREAR TORNEO -->
                <section id="trnView-create" class="space-y-5">
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
                        <div class="lg:col-span-7 rounded-xl bg-[#13161b] border border-[#c9a255]/45 p-4 sm:p-5 space-y-4">
                            <div class="flex items-center justify-between border-b border-slate-700/80 pb-3">
                                <h2 class="font-hcs font-extrabold text-2xl tracking-wider text-white uppercase">CONFIGURAR TORNEO HCS (5 PASOS)</h2>
                                <span class="text-[11px] font-orbitron text-[#c9a255]">HCS ENGINE</span>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-[11px] font-orbitron text-[#c9a255] mb-1">1. FORMATO</label>
                                    <div class="grid grid-cols-3 gap-1.5">
                                        <button type="button" id="trnCfgFmt-2v2" class="py-1.5 rounded text-xs font-orbitron font-bold bg-slate-800 text-slate-300 border border-slate-700">2v2</button>
                                        <button type="button" id="trnCfgFmt-3v3" class="py-1.5 rounded text-xs font-orbitron font-bold bg-slate-800 text-slate-300 border border-slate-700">3v3</button>
                                        <button type="button" id="trnCfgFmt-4v4" class="py-1.5 rounded text-xs font-orbitron font-bold bg-[#c9a255] text-black">4v4</button>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-[11px] font-orbitron text-[#c9a255] mb-1">2. SERIE POR FASE</label>
                                    <div class="grid grid-cols-2 gap-1.5">
                                        <button type="button" id="trnCfgBo-3" class="py-1.5 rounded text-xs font-orbitron font-bold bg-[#c9a255] text-black">Bo3 (3 mapas)</button>
                                        <button type="button" id="trnCfgBo-5" class="py-1.5 rounded text-xs font-orbitron font-bold bg-slate-800 text-slate-300 border border-slate-700">Bo5 (5 mapas)</button>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-[11px] font-orbitron text-[#c9a255] mb-1">3. ELIMINACIÓN</label>
                                    <div class="grid grid-cols-2 gap-1.5">
                                        <button type="button" id="trnCfgElim-simple" class="py-1.5 rounded text-xs font-orbitron font-bold bg-slate-800 text-slate-300 border border-slate-700">Simple</button>
                                        <button type="button" id="trnCfgElim-double" class="py-1.5 rounded text-xs font-orbitron font-bold bg-[#c9a255] text-black">Doble</button>
                                    </div>
                                </div>
                                <div class="grid grid-cols-3 gap-2">
                                    <div class="col-span-2">
                                        <label class="block text-[11px] font-orbitron text-[#c9a255] mb-1">4. NOMBRE</label>
                                        <input id="trnCfgName" type="text" value="MANSALVAS MAJOR OPEN" class="w-full px-2.5 py-1.5 rounded bg-[#0b0d10] border border-slate-700 text-xs text-white focus:border-[#c9a255] outline-none">
                                    </div>
                                    <div>
                                        <label class="block text-[11px] font-orbitron text-[#c9a255] mb-1">ID</label>
                                        <input id="trnCfgId" type="text" value="TRN-${Math.floor(1000 + Math.random() * 9000)}" class="w-full px-2 py-1.5 rounded bg-[#0b0d10] border border-slate-700 text-xs font-orbitron text-amber-300 outline-none">
                                    </div>
                                </div>
                            </div>

                            <div class="pt-2 border-t border-slate-800 space-y-2.5">
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                    <label class="text-[11px] font-orbitron text-[#c9a255]">5. ROSTER OFICIAL + INVITADOS (2–16 EQUIPOS)</label>
                                    <div class="flex flex-wrap gap-1.5">
                                        <button type="button" id="trnBtnSelectAllRoster" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-white font-semibold">Todos Roster</button>
                                        <button type="button" id="trnBtnClearPool" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300">Limpiar</button>
                                    </div>
                                </div>

                                <div id="trnRosterChipsGrid" class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded bg-[#0b0d10] border border-slate-800"></div>

                                <div class="space-y-1.5">
                                    <div class="flex flex-wrap gap-2">
                                        <input id="trnRecruitNameInput" type="text" placeholder="Buscar o reclutar Gamertag (HaloTracker + SpartanRecord + DataHive)..." class="flex-1 min-w-[180px] px-3 py-1.5 rounded bg-[#0b0d10] border border-slate-700 text-xs text-white focus:border-cyan-400 outline-none">
                                        <button type="button" id="trnBtnRecruitSpartan" class="px-3.5 py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/60 text-cyan-100 text-xs font-orbitron font-bold flex items-center gap-1.5">
                                            ⚡ Reclutar Spartan
                                        </button>
                                    </div>
                                    <div id="trnRecruitStatusBox" class="hidden text-[11px] px-2.5 py-1.5 rounded bg-[#071324] border border-cyan-500/30 text-cyan-200"></div>
                                </div>

                                <div class="text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2 bg-[#0b0d10] px-3 py-2 rounded border border-slate-800">
                                    <span>Jugadores: <strong id="trnPoolCountLabel" class="text-white">0</strong> (<span id="trnExpectedTeamsLabel" class="text-amber-300">0</span> equipos)</span>
                                    <button type="button" id="trnBtnStrictBalance" class="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-orbitron font-black text-[11px]">
                                        ⚡ Balancear Estricto (≤ 1 PT)
                                    </button>
                                </div>

                                <div id="trnBalanceResultPreview" class="space-y-2 max-h-[260px] overflow-y-auto pr-1"></div>
                            </div>

                            <div class="pt-2 flex flex-wrap gap-2 justify-end">
                                <button type="button" id="trnBtnOpenMaps" class="px-4 py-2.5 rounded btn-maps-cyan font-orbitron font-bold text-xs flex items-center gap-2">
                                    <i class="fa-solid fa-shuffle text-cyan-200"></i>
                                    <span>Mapas</span>
                                </button>
                                <button type="button" id="trnBtnLaunch" class="px-5 py-2.5 rounded bg-[#c9a255] hover:bg-[#dfb868] text-black font-orbitron font-black text-xs shadow-lg flex items-center gap-2">
                                    <i class="fa-solid fa-rocket"></i> Lanzar Torneo
                                </button>
                            </div>
                        </div>

                        <div class="lg:col-span-5 rounded-xl bg-[#1e2124] border border-slate-700 p-4 space-y-3">
                            <div class="flex items-center justify-between border-b border-slate-700 pb-2">
                                <span class="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                                    <i class="fa-brands fa-discord text-base"></i> Embed Discord Webhook
                                </span>
                                <span class="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 font-orbitron">PARCERO BOT</span>
                            </div>
                            <div id="trnDiscordEmbedPreview" class="rounded-lg bg-[#2b2d31] border-l-4 border-[#c9a255] p-3.5 text-xs space-y-2.5 text-slate-200">
                                <p class="text-slate-400 italic">Balancea los equipos y pulsa «Lanzar Torneo» para enviar el Bracket y los banners de mapas a Discord.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- VISTA MAPAS POR FASE -->
                <section id="trnView-maps" class="hidden space-y-4">
                    <div class="rounded-xl bg-[#071324] border border-cyan-400/50 p-4 sm:p-5 space-y-4">
                        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/30 pb-3">
                            <div>
                                <h2 class="font-orbitron font-black text-base sm:text-lg text-white flex items-center gap-2">
                                    <i class="fa-solid fa-shuffle text-cyan-300"></i>
                                    <span>MAPAS OFICIALES POR FASE</span>
                                </h2>
                                <p id="trnMapsSubtitle" class="text-xs text-cyan-300/85 mt-0.5"></p>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <button type="button" id="trnBtnBackFromMaps" class="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-orbitron font-bold text-xs flex items-center gap-1.5">
                                    ⬅ Volver
                                </button>
                                <button type="button" id="trnBtnRedrawMaps" class="px-4 py-2 rounded btn-maps-cyan font-orbitron font-black text-xs flex items-center gap-1.5">
                                    🔀 Sortear Mapas
                                </button>
                            </div>
                        </div>
                        <div id="trnMapsGrid" class="grid grid-cols-1 lg:grid-cols-2 gap-4"></div>
                    </div>
                </section>

                <!-- VISTA 2: BRACKET PÚBLICO -->
                <section id="trnView-bracket" class="hidden space-y-0 pt-2">
                    <div class="hcs-header-bar px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-3">
                        <div class="flex items-center gap-3 sm:gap-4">
                            <div id="trnShieldAdminTrigger" class="hcs-shield-badge" style="cursor: pointer;" aria-hidden="true">
                                <svg width="74" height="82" viewBox="0 0 100 112" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M50 6 L92 18 V54 C92 78 72 97 50 107 C28 97 8 78 8 54 V18 L50 6 Z" fill="#181a1e" stroke="#c9a255" stroke-width="3"/>
                                    <path d="M50 11 L87 21.5 V53 C87 74 69 91 50 100 C31 91 13 74 13 53 V21.5 L50 11 Z" fill="#181a1e" stroke="#c9a255" stroke-width="1.2"/>
                                    <path d="M18 68 C24 81 36 91 50 97 C64 91 76 81 82 68 L50 76 Z" fill="#7a2c24"/>
                                    <path d="M40 22 L45 14 H55 L60 22 L58 31 H42 Z" fill="#c9a255"/>
                                    <path d="M43 23 H57 L55 27 H45 Z" fill="#181a1e"/>
                                    <text x="50" y="47" text-anchor="middle" fill="#f8fafc" font-family="Orbitron, sans-serif" font-weight="900" font-size="13" letter-spacing="2">HALO</text>
                                    <rect x="14" y="51" width="72" height="14" fill="#c9a255"/>
                                    <text x="50" y="61" text-anchor="middle" fill="#111317" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="8.5" letter-spacing="0.6">WORLD CHAMPIONSHIP</text>
                                    <text x="50" y="88" text-anchor="middle" fill="#facc15" font-size="8" letter-spacing="3">★★★</text>
                                </svg>
                            </div>
                            <h2 class="font-hcs font-extrabold text-2xl sm:text-3xl tracking-[0.2em] text-white uppercase">CHAMPIONSHIP BRACKET</h2>
                        </div>
                        <div class="flex items-center">
                            <span id="trnBracketHeaderName" class="font-hcs font-semibold text-sm sm:text-base tracking-[0.18em] text-[#c6cbd2] uppercase">HALO MATCH</span>
                        </div>
                    </div>

                    <div id="trnAdminBar" class="hidden bg-amber-950/90 border-b border-[#c9a255] px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span class="font-orbitron font-bold text-amber-200 flex items-center gap-2">
                            <i class="fa-solid fa-shield-halved text-[#facc15]"></i>
                            <span>Modo Admin Activo — Clic en cualquier llave para editar o mover equipos</span>
                        </span>
                        <button type="button" id="trnBtnExitAdmin" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-orbitron text-[10px]">Salir Admin</button>
                    </div>

                    <div id="trnBracketCanvasWrap" class="forerunner-arena-bg overflow-x-auto p-4 sm:p-6 min-h-[460px]">
                        <div class="forerunner-arena-rings" aria-hidden="true">
                            <svg viewBox="0 0 1200 640" preserveAspectRatio="xMidYMid slice" class="w-full h-full">
                                <defs>
                                    <radialGradient id="trnArenaBeam" cx="55%" cy="46%" r="52%">
                                        <stop offset="0%" stop-color="#6b6150" stop-opacity="0.45"/>
                                        <stop offset="55%" stop-color="#2b2722" stop-opacity="0.22"/>
                                        <stop offset="100%" stop-color="#0d0d0c" stop-opacity="0"/>
                                    </radialGradient>
                                </defs>
                                <rect width="1200" height="640" fill="url(#trnArenaBeam)"/>
                                <g fill="none" stroke="#5b5346" stroke-width="2.2" transform="translate(660,330)">
                                    <circle r="54" stroke-opacity="0.55"/>
                                    <circle r="102" stroke-opacity="0.45"/>
                                    <circle r="154" stroke-opacity="0.38"/>
                                    <circle r="212" stroke-opacity="0.30"/>
                                    <circle r="275" stroke-opacity="0.22"/>
                                </g>
                            </svg>
                        </div>
                        <svg id="trnBracketConnectorsSvg" class="absolute inset-0 pointer-events-none" style="z-index: 1;"></svg>
                        <div id="trnBracketTreeContent" class="relative space-y-10" style="z-index: 2;"></div>
                    </div>
                </section>

                <!-- VISTA 3: GANADORES (FINAL RESULTS) -->
                <section id="trnView-winners" class="hidden space-y-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="text-[11px] font-orbitron text-[#e8a938] tracking-widest uppercase">Historial Oficial de Campeones</span>
                        <div class="relative w-full sm:w-80">
                            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                            <input id="trnWinnersFilterInput" type="text" placeholder="Filtrar por torneo, fecha, equipo o jugador..." class="pl-8 pr-3 py-1.5 rounded bg-[#111318] border border-[#e8a938]/45 text-xs text-white w-full outline-none focus:border-[#e8a938]">
                        </div>
                    </div>

                    <div class="hcs-winners-stage rounded-lg p-4 sm:p-8 relative">
                        <svg viewBox="0 0 1200 220" preserveAspectRatio="none" class="absolute bottom-0 left-0 w-full h-36 sm:h-44 pointer-events-none opacity-35" style="z-index: 0;" aria-hidden="true">
                            <path d="M0 220 V130 H55 V95 H105 V150 H145 V70 H210 V140 H260 V110 H310 V220 Z M340 220 V85 H395 V125 H440 V60 H505 V145 H560 V105 H620 V220 Z M680 220 V115 H740 V65 H805 V130 H860 V80 H920 V150 H980 V55 H1045 V120 H1100 V90 H1160 V140 H1200 V220 Z" fill="#080706"/>
                        </svg>
                        <div class="relative max-w-4xl mx-auto space-y-5" style="z-index: 2;">
                            <div class="flex flex-wrap items-center justify-center gap-5 sm:gap-7">
                                <div class="flex flex-col items-center">
                                    <span class="text-[9px] font-orbitron tracking-[0.22em] text-slate-200 uppercase mb-1">HALO CHAMPIONSHIP SERIES ★★★</span>
                                    <div class="hcs-major-emblem px-5 py-1.5 text-center">
                                        <span class="font-hcs font-extrabold text-3xl sm:text-4xl tracking-[0.08em] text-[#e8a938] leading-none uppercase">HALO MATCH</span>
                                    </div>
                                    <svg width="26" height="24" viewBox="0 0 24 24" class="mt-1 text-[#e8a938]" fill="currentColor" aria-hidden="true">
                                        <path d="M5 10l2-5h10l2 5v5l-3 4H8l-3-4v-5zm3 1v2h8v-2H8z"/>
                                    </svg>
                                </div>
                                <div class="font-hcs font-extrabold uppercase tracking-wide" style="line-height: 0.92;">
                                    <div class="text-3xl sm:text-4xl text-[#e8a938]">FINAL</div>
                                    <div class="text-3xl sm:text-4xl text-white">RESULTS</div>
                                </div>
                            </div>
                            <div id="trnWinnersTableContainer" class="hcs-winners-table"></div>
                        </div>
                    </div>
                </section>
            </main>

            <!-- MODAL TÁCTICO DE EQUIPO -->
            <div id="trnTacticalModal" class="fixed inset-0 bg-black/85 backdrop-blur-sm z-[60] hidden items-center justify-center p-4">
                <div class="max-w-lg w-full rounded-xl bg-[#13161b] border-2 border-[#c9a255] p-5 shadow-2xl space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-700 pb-2.5">
                        <div class="flex items-center gap-2.5">
                            <div id="trnTacBadge" class="w-9 h-9 rounded flex items-center justify-center"></div>
                            <div>
                                <h3 id="trnTacTitle" class="font-hcs font-extrabold text-2xl text-white uppercase leading-none">EQUIPO</h3>
                                <p id="trnTacVoice" class="text-xs text-indigo-300 mt-0.5"></p>
                            </div>
                        </div>
                        <button type="button" id="trnTacCloseBtn" class="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div id="trnTacBody" class="space-y-3 text-xs"></div>
                </div>
            </div>

            <!-- MODAL ADMIN AUTH (5 CLICS EN ESCUDO) -->
            <div id="trnAdminAuthModal" class="fixed inset-0 bg-black/85 backdrop-blur-sm z-[60] hidden items-center justify-center p-4">
                <div class="max-w-sm w-full rounded-xl bg-[#13161b] border border-[#c9a255] p-5 shadow-2xl space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-700 pb-2">
                        <h3 class="font-orbitron font-bold text-sm text-[#facc15]">ACCESO ADMIN TORNEO</h3>
                        <button type="button" id="trnAdminAuthCloseBtn" class="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <input id="trnAdminPassInput" type="password" placeholder="Clave de administrador..." class="w-full px-3 py-2 rounded bg-[#0b0d10] border border-slate-700 text-xs text-white focus:border-[#c9a255] outline-none">
                    <div id="trnAdminAuthError" class="hidden text-xs text-rose-300"></div>
                    <div class="flex justify-end gap-2">
                        <button type="button" id="trnAdminAuthCancelBtn" class="px-3 py-1.5 rounded bg-slate-800 text-xs text-slate-300">Cancelar</button>
                        <button type="button" id="trnAdminAuthVerifyBtn" class="px-4 py-1.5 rounded bg-[#c9a255] hover:bg-[#dfb868] text-black font-orbitron font-bold text-xs">Verificar</button>
                    </div>
                </div>
            </div>

            <!-- MODAL ADMIN EDICIÓN DE LLAVE -->
            <div id="trnAdminMatchModal" class="fixed inset-0 bg-black/85 backdrop-blur-sm z-[60] hidden items-center justify-center p-4">
                <div class="max-w-md w-full rounded-xl bg-[#13161b] border-2 border-[#c9a255] p-5 shadow-2xl space-y-3">
                    <div class="flex items-center justify-between border-b border-slate-700 pb-2">
                        <div>
                            <h3 class="font-orbitron font-bold text-sm text-[#facc15]">EDITAR LLAVE (ADMIN)</h3>
                            <p id="trnAdminRoundLabel" class="text-[11px] text-slate-400"></p>
                        </div>
                        <button type="button" id="trnAdminMatchCloseBtn" class="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        <div>
                            <label class="block text-[10px] font-orbitron text-slate-300 mb-1">EQUIPO A</label>
                            <select id="trnAdminSlotASel" class="w-full px-2.5 py-1.5 rounded bg-[#0b0d10] border border-slate-700 text-xs text-white"></select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-orbitron text-slate-300 mb-1">MARCADOR A</label>
                            <input id="trnAdminScoreAInp" type="number" min="0" max="9" class="w-full px-2.5 py-1.5 rounded bg-[#0b0d10] border border-slate-700 text-xs text-white">
                        </div>
                        <div>
                            <label class="block text-[10px] font-orbitron text-slate-300 mb-1">EQUIPO B</label>
                            <select id="trnAdminSlotBSel" class="w-full px-2.5 py-1.5 rounded bg-[#0b0d10] border border-slate-700 text-xs text-white"></select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-orbitron text-slate-300 mb-1">MARCADOR B</label>
                            <input id="trnAdminScoreBInp" type="number" min="0" max="9" class="w-full px-2.5 py-1.5 rounded bg-[#0b0d10] border border-slate-700 text-xs text-white">
                        </div>
                    </div>
                    <div class="text-xs">
                        <label class="block text-[10px] font-orbitron text-[#c9a255] mb-1">GANADOR OFICIAL</label>
                        <select id="trnAdminWinnerSel" class="w-full px-2.5 py-1.5 rounded bg-[#0b0d10] border border-slate-700 text-xs text-white"></select>
                    </div>
                    <div id="trnAdminMatchStatus" class="hidden text-xs text-rose-300"></div>
                    <div class="flex justify-between gap-2 pt-2 border-t border-slate-700">
                        <button type="button" id="trnAdminReopenBtn" class="px-3 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/50 text-rose-200 font-orbitron font-bold text-[11px]">Reabrir Llave</button>
                        <button type="button" id="trnAdminSaveBtn" class="px-4 py-1.5 rounded bg-[#c9a255] hover:bg-[#dfb868] text-black font-orbitron font-black text-xs">Guardar Cambios</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        bindEvents();
        state.mounted = true;
    }

    function bindEvents() {
        document.getElementById('trnNav-create').onclick = () => setSubView('create');
        document.getElementById('trnNav-maps').onclick = () => setSubView('maps');
        document.getElementById('trnNav-bracket').onclick = () => setSubView('bracket');
        document.getElementById('trnNav-winners').onclick = () => setSubView('winners');

        ['2v2', '3v3', '4v4'].forEach(f => {
            document.getElementById(`trnCfgFmt-${f}`).onclick = () => setCfg('format', f);
        });
        [3, 5].forEach(b => {
            document.getElementById(`trnCfgBo-${b}`).onclick = () => setCfg('bestOf', b);
        });
        ['simple', 'double'].forEach(e => {
            document.getElementById(`trnCfgElim-${e}`).onclick = () => setCfg('elimination', e);
        });

        document.getElementById('trnBtnSelectAllRoster').onclick = () => {
            (window.roster || []).forEach(p => state.selectedRosterIds.add(p.id));
            renderRosterChips();
        };
        document.getElementById('trnBtnClearPool').onclick = () => {
            state.selectedRosterIds.clear();
            state.guests = [];
            state.balancedAlternatives = [];
            document.getElementById('trnBalanceResultPreview').innerHTML = '';
            renderRosterChips();
        };
        document.getElementById('trnBtnRecruitSpartan').onclick = recruitSpartanForTournament;
        document.getElementById('trnRecruitNameInput').onkeydown = (e) => { if (e.key === 'Enter') recruitSpartanForTournament(); };
        document.getElementById('trnBtnStrictBalance').onclick = runStrictBalance;
        document.getElementById('trnBtnOpenMaps').onclick = () => setSubView('maps');
        document.getElementById('trnBtnLaunch').onclick = launchTournament;
        document.getElementById('trnBtnRedrawMaps').onclick = () => drawTournamentPhaseMaps(true);
        document.getElementById('trnBtnBackFromMaps').onclick = () => setSubView('create');

        document.getElementById('trnBracketSearchInput').oninput = renderBracketView;
        document.getElementById('trnWinnersFilterInput').oninput = renderWinnersView;

        document.getElementById('trnShieldAdminTrigger').onclick = handleShieldAdminClick;
        document.getElementById('trnBtnExitAdmin').onclick = exitTournamentAdmin;

        document.getElementById('trnTacCloseBtn').onclick = () => toggleModal('trnTacticalModal', false);
        document.getElementById('trnAdminAuthCloseBtn').onclick = () => toggleModal('trnAdminAuthModal', false);
        document.getElementById('trnAdminAuthCancelBtn').onclick = () => toggleModal('trnAdminAuthModal', false);
        document.getElementById('trnAdminAuthVerifyBtn').onclick = verifyAdminKey;
        document.getElementById('trnAdminPassInput').onkeydown = (e) => { if (e.key === 'Enter') verifyAdminKey(); };

        document.getElementById('trnAdminMatchCloseBtn').onclick = () => toggleModal('trnAdminMatchModal', false);
        document.getElementById('trnAdminReopenBtn').onclick = () => saveAdminMatchEdit(true);
        document.getElementById('trnAdminSaveBtn').onclick = () => saveAdminMatchEdit(false);
    }

    function toggleModal(id, show) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('hidden', !show);
        el.classList.toggle('flex', show);
    }

    function setSubView(v) {
        state.subView = v;
        const map = {
            create: 'trnView-create',
            maps: 'trnView-maps',
            bracket: 'trnView-bracket',
            winners: 'trnView-winners'
        };
        Object.entries(map).forEach(([k, id]) => {
            document.getElementById(id)?.classList.toggle('hidden', k !== v);
            const btn = document.getElementById(`trnNav-${k}`);
            if (btn) {
                btn.className = k === v
                    ? 'px-2.5 sm:px-3 py-1.5 rounded text-xs font-semibold bg-[#c9a255] text-black font-orbitron'
                    : 'px-2.5 sm:px-3 py-1.5 rounded text-xs font-semibold bg-slate-800/90 text-slate-200 border border-slate-700';
            }
        });
        if (v === 'create') renderRosterChips();
        if (v === 'maps') drawTournamentPhaseMaps(false);
        if (v === 'bracket') renderBracketView();
        if (v === 'winners') {
            subscribeWinnersRealtime();
            renderWinnersView();
        }
    }

    function setCfg(key, val) {
        state.cfg[key] = val;
        if (key === 'format') {
            ['2v2', '3v3', '4v4'].forEach(f => {
                document.getElementById(`trnCfgFmt-${f}`).className = f === val
                    ? 'py-1.5 rounded text-xs font-orbitron font-bold bg-[#c9a255] text-black'
                    : 'py-1.5 rounded text-xs font-orbitron font-bold bg-slate-800 text-slate-300 border border-slate-700';
            });
        }
        if (key === 'bestOf') {
            [3, 5].forEach(b => {
                document.getElementById(`trnCfgBo-${b}`).className = b === val
                    ? 'py-1.5 rounded text-xs font-orbitron font-bold bg-[#c9a255] text-black'
                    : 'py-1.5 rounded text-xs font-orbitron font-bold bg-slate-800 text-slate-300 border border-slate-700';
            });
        }
        if (key === 'elimination') {
            ['simple', 'double'].forEach(e => {
                document.getElementById(`trnCfgElim-${e}`).className = e === val
                    ? 'py-1.5 rounded text-xs font-orbitron font-bold bg-[#c9a255] text-black'
                    : 'py-1.5 rounded text-xs font-orbitron font-bold bg-slate-800 text-slate-300 border border-slate-700';
            });
        }
        updatePoolCounters();
    }

    function updatePoolCounters() {
        const pool = getPlayersPool();
        const size = getTeamSize();
        const cEl = document.getElementById('trnPoolCountLabel');
        const tEl = document.getElementById('trnExpectedTeamsLabel');
        if (cEl) cEl.textContent = String(pool.length);
        if (tEl) tEl.textContent = String(Math.floor(pool.length / size));
    }

    function renderRosterChips() {
        const grid = document.getElementById('trnRosterChipsGrid');
        if (!grid) return;
        const rosterList = Array.isArray(window.roster) ? window.roster : [];
        const rosterChips = rosterList.map(p => {
            const active = state.selectedRosterIds.has(p.id);
            return `<button type="button" data-roster-id="${p.id}" class="px-2 py-1 rounded text-[11px] font-semibold border transition ${active ? 'bg-amber-500/25 border-[#c9a255] text-amber-100' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'}">${p.name} <span class="text-amber-300">(${p.pts})</span></button>`;
        }).join('');
        const guestChips = state.guests.map((g, idx) =>
            `<button type="button" data-guest-idx="${idx}" class="px-2 py-1 rounded text-[11px] font-semibold border bg-cyan-500/20 border-cyan-400/60 text-cyan-100">${g.name} (${g.pts}) ✕</button>`
        ).join('');
        grid.innerHTML = rosterChips + guestChips || '<span class="text-xs text-slate-400">Sin jugadores en Roster aún.</span>';

        grid.querySelectorAll('[data-roster-id]').forEach(btn => {
            btn.onclick = () => {
                const id = btn.getAttribute('data-roster-id');
                if (state.selectedRosterIds.has(id)) state.selectedRosterIds.delete(id);
                else state.selectedRosterIds.add(id);
                renderRosterChips();
            };
        });
        grid.querySelectorAll('[data-guest-idx]').forEach(btn => {
            btn.onclick = () => {
                const idx = Number(btn.getAttribute('data-guest-idx'));
                state.guests.splice(idx, 1);
                renderRosterChips();
            };
        });
        updatePoolCounters();
    }

    async function recruitSpartanForTournament() {
        const inp = document.getElementById('trnRecruitNameInput');
        const btn = document.getElementById('trnBtnRecruitSpartan');
        const statusBox = document.getElementById('trnRecruitStatusBox');
        const rawTag = (inp?.value || '').trim();
        if (!rawTag) {
            notify('Escribe el Gamertag del Spartan a reclutar.', 'info');
            return;
        }

        // Si ya existe en el Roster Oficial, seleccionarlo sin duplicar
        const norm = rawTag.toLowerCase();
        const existingRoster = (Array.isArray(window.roster) ? window.roster : []).find(p => String(p.name || '').toLowerCase() === norm);
        if (existingRoster) {
            state.selectedRosterIds.add(existingRoster.id);
            inp.value = '';
            if (statusBox) {
                statusBox.textContent = `✅ ${existingRoster.name} seleccionado del Roster Oficial (${existingRoster.pts} PTS).`;
                statusBox.classList.remove('hidden');
            }
            renderRosterChips();
            return;
        }

        if (state.guests.some(g => String(g.name || '').toLowerCase() === norm)) {
            notify(`${rawTag} ya está agregado al torneo.`, 'info');
            return;
        }

        if (typeof window.fetchDualTelemetryForGamertag !== 'function') {
            notify('Servicio de análisis triple no disponible.', 'error');
            return;
        }

        if (btn) btn.disabled = true;
        if (statusBox) {
            statusBox.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Analizando a <strong>${rawTag}</strong> en HaloTracker, SpartanRecord y HaloDataHive...`;
            statusBox.classList.remove('hidden');
        }

        try {
            const stats = await window.fetchDualTelemetryForGamertag(rawTag, { allowRosterFallback: false });
            if (!stats || stats.notFound) {
                if (statusBox) {
                    statusBox.innerHTML = `
                        <div class="flex flex-wrap items-center justify-between gap-2 text-rose-200">
                            <span>⚠️ No se halló perfil público para <strong>${rawTag}</strong>. Puedes asignarle PTS manuales (1–25) solo para este torneo:</span>
                            <div class="flex items-center gap-1.5">
                                <input id="trnFallbackPtsInp" type="number" min="1" max="25" value="12" class="w-16 px-2 py-0.5 rounded bg-[#0b0d10] border border-slate-600 text-amber-300 font-orbitron">
                                <button type="button" id="trnFallbackAddBtn" class="px-2.5 py-0.5 rounded bg-amber-500 text-black font-bold">Agregar</button>
                            </div>
                        </div>`;
                    document.getElementById('trnFallbackAddBtn').onclick = () => {
                        const pts = Math.max(1, Math.min(25, Number(document.getElementById('trnFallbackPtsInp')?.value) || 12));
                        state.guests.push({ id: `recruit_${Date.now()}`, name: rawTag, pts, rank: 'MANUAL' });
                        inp.value = '';
                        statusBox.textContent = `✅ ${rawTag} agregado manualmente (${pts} PTS) solo para este torneo.`;
                        renderRosterChips();
                    };
                }
                return;
            }

            const pts = Math.max(1, Math.min(25, Math.round(Number(stats.pts) || 12)));
            const rank = stats.rank || 'B';
            const finalName = stats.gamertag || rawTag;
            state.guests.push({ id: `recruit_${Date.now()}`, name: finalName, pts, rank });
            inp.value = '';
            if (statusBox) {
                statusBox.innerHTML = `⚡ <strong>${finalName}</strong> reclutado para este torneo • Rango <strong class="text-amber-300">${rank}</strong> (${pts} PTS).`;
            }
            notify(`⚡ ${finalName}: ${rank} (${pts} PTS)`, 'success');
            renderRosterChips();
        } catch (err) {
            if (statusBox) statusBox.textContent = `Error analizando ${rawTag}: ${err.message || err}`;
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function runStrictBalance() {
        const box = document.getElementById('trnBalanceResultPreview');
        if (!window.HaloTournamentEngine) return;
        try {
            const res = window.HaloTournamentEngine.balanceTournamentTeams(getPlayersPool(), state.cfg.format);
            state.balancedAlternatives = Array.isArray(res) ? res : (res?.alternatives || []);
            state.selectedAlternativeIdx = 0;
            if (!state.balancedAlternatives.length) {
                box.innerHTML = '<div class="p-3 rounded bg-amber-950/70 border border-amber-400/50 text-xs text-amber-200">Selecciona al menos 2 equipos completos para balancear.</div>';
                return;
            }
            renderBalanceAlternatives();
        } catch (err) {
            state.balancedAlternatives = [];
            box.innerHTML = `<div class="p-3 rounded bg-rose-950/70 border border-rose-400/50 text-xs text-rose-200">${err.message}</div>`;
        }
    }

    function renderBalanceAlternatives() {
        const box = document.getElementById('trnBalanceResultPreview');
        const alt = state.balancedAlternatives[state.selectedAlternativeIdx];
        if (!alt) return;
        const tabs = state.balancedAlternatives.map((a, idx) => {
            const spread = a.spread ?? a.maxDiff ?? 0;
            const isThird = Boolean(a.isLessFavorable || idx === 2);
            const label = isThird
                ? `Opción ${idx + 1} (Menos favorable • Brecha: ${spread} PTS)`
                : `Opción ${idx + 1} (Brecha: ${spread} PT)`;
            const activeCls = isThird ? 'bg-amber-400 text-black' : 'bg-emerald-500 text-black';
            return `<button type="button" data-alt-idx="${idx}" class="px-2.5 py-1 rounded text-[11px] font-orbitron font-bold ${idx === state.selectedAlternativeIdx ? activeCls : 'bg-slate-800 text-slate-300'}">${label}</button>`;
        }).join('');
        const teamsHtml = alt.teams.map(t => {
            const vis = getTeamVisual(t);
            return `
            <div class="p-2 rounded bg-[#0b0d10] border border-slate-700/80 flex items-center justify-between gap-2 text-xs">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-6 h-6 rounded flex items-center justify-center shrink-0" style="background:${vis.hex}; color:${vis.textHex}">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="${vis.svgPath}"/></svg>
                    </span>
                    <div class="min-w-0">
                        <div class="font-bold text-white truncate">${t.name} <span class="text-amber-300 font-orbitron">(${t.totalPts} PTS)</span></div>
                        <div class="text-[10px] text-slate-400 truncate">${t.players.map(p => `${p.name} (${p.pts})`).join(' • ')}</div>
                    </div>
                </div>
                <span class="text-[10px] text-indigo-300 shrink-0 hidden sm:inline">${t.voiceChannel}</span>
            </div>`;
        }).join('');
        box.innerHTML = `<div class="flex flex-wrap gap-1.5 mb-2">${tabs}</div><div class="space-y-1.5">${teamsHtml}</div>`;
        box.querySelectorAll('[data-alt-idx]').forEach(btn => {
            btn.onclick = () => {
                state.selectedAlternativeIdx = Number(btn.getAttribute('data-alt-idx'));
                renderBalanceAlternatives();
            };
        });
    }

    async function drawTournamentPhaseMaps(force) {
        const teamCount = getActiveTeamCount();
        const sig = `${state.cfg.format}|${state.cfg.bestOf}|${state.cfg.elimination}|${teamCount}`;
        if (!force && state.drawnPhaseMaps && state.drawnPhaseMaps.sig === sig) {
            renderTournamentMapsGrid();
            return state.drawnPhaseMaps.phases;
        }
        await fetchLiveMapsManifest();
        if (!state.mapsManifest || !window.HaloMapEngine) {
            renderTournamentMapsGrid();
            return null;
        }
        const phaseDefs = getPhasesForConfig(teamCount);
        const count = Number(state.cfg.bestOf) === 5 ? 5 : 3;
        let phasesOut = null;
        if (typeof window.HaloTournamentEngine?.generatePhaseMaps === 'function') {
            try {
                const generated = window.HaloTournamentEngine.generatePhaseMaps(
                    state.mapsManifest,
                    state.cfg.format,
                    state.cfg.bestOf,
                    { elimination: state.cfg.elimination, teamCount },
                    window.HaloMapEngine
                );
                if (generated && phaseDefs.every(p => Array.isArray(generated[p.key]))) {
                    phasesOut = generated;
                }
            } catch (e) {}
        }
        if (!phasesOut) {
            phasesOut = {};
            for (const p of phaseDefs) {
                phasesOut[p.key] = window.HaloMapEngine.drawMaps(state.mapsManifest, state.cfg.format).maps.slice(0, count);
            }
        }
        state.drawnPhaseMaps = { sig, phases: phasesOut };
        renderTournamentMapsGrid();
        return phasesOut;
    }

    function renderTournamentMapsGrid() {
        const grid = document.getElementById('trnMapsGrid');
        const sub = document.getElementById('trnMapsSubtitle');
        if (!grid) return;
        const teamCount = getActiveTeamCount();
        const phaseDefs = getPhasesForConfig(teamCount);
        if (sub) {
            sub.textContent = `Modalidad ${state.cfg.format.toUpperCase()} • ${teamCount} Equipos • Bo${state.cfg.bestOf} • ${phaseDefs.length} fases`;
        }
        if (!state.drawnPhaseMaps?.phases) {
            grid.innerHTML = '<div class="col-span-full p-6 text-center text-xs text-amber-300">Cargando catálogo de mapas...</div>';
            return;
        }
        grid.innerHTML = phaseDefs.map(p => {
            const list = state.drawnPhaseMaps.phases[p.key] || [];
            const cards = list.map((m, idx) => {
                const num = String(idx + 1).padStart(2, '0');
                const src = encodeURI(m.desktopPath || m.path);
                return `
                <div class="flex items-stretch bg-[#040b16] border border-cyan-400/45 overflow-hidden">
                    <div class="w-11 sm:w-14 shrink-0 bg-[#091526] border-r border-cyan-400/45 flex flex-col items-center justify-center">
                        <span class="font-orbitron font-bold text-xs text-white">${num}</span>
                        <span class="mt-1 w-4 h-[2px] bg-cyan-400"></span>
                    </div>
                    <div class="flex-1 min-w-0"><img src="${src}" alt="${m.mapName}" class="w-full h-auto block"></div>
                </div>`;
            }).join('');
            return `
            <div class="rounded-lg bg-[#050f1e] border border-cyan-500/45 p-3.5 space-y-2.5">
                <div class="flex items-center justify-between border-b border-cyan-500/25 pb-2">
                    <span class="font-orbitron font-bold text-xs text-cyan-300 uppercase">${p.title}</span>
                    <span class="text-[10px] font-orbitron px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-200 border border-cyan-400/40">Bo${state.cfg.bestOf}</span>
                </div>
                <div class="space-y-2">${cards}</div>
            </div>`;
        }).join('');
    }

    function loadImgForCanvas(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Error cargando ' + src));
            img.src = src;
        });
    }

    async function renderPhaseBannerPngDataUrl(phaseTitle, maps, format, tournamentId) {
        const imgs = await Promise.all(maps.map(m => loadImgForCanvas(encodeURI(m.desktopPath || m.path))));
        const width = 1400;
        const padX = 36;
        const headerH = 96;
        const footerH = 54;
        const gap = 16;
        const cardW = width - padX * 2;
        const numColW = 96;
        const imgSlotW = cardW - numColW - 14;
        const slotHeights = imgs.map(img => Math.round(imgSlotW * (img.naturalHeight / img.naturalWidth)));
        const height = headerH + slotHeights.reduce((a, b) => a + b, 0) + Math.max(0, imgs.length - 1) * gap + footerH;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const bg = ctx.createLinearGradient(0, 0, 0, height);
        bg.addColorStop(0, '#040c1a');
        bg.addColorStop(1, '#07172c');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
        ctx.lineWidth = 3;
        ctx.strokeRect(14, 14, width - 28, height - 28);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 28px Orbitron, sans-serif';
        ctx.fillText(phaseTitle.toUpperCase(), padX, 58);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 22px Orbitron, sans-serif';
        ctx.fillText(`${tournamentId} • ${String(format).toUpperCase()} • Bo${maps.length}`, width - padX, 58);
        ctx.textAlign = 'left';

        let cy = headerH;
        imgs.forEach((img, idx) => {
            const sh = slotHeights[idx];
            ctx.fillStyle = '#091526';
            ctx.fillRect(padX, cy, numColW, sh);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
            ctx.lineWidth = 2;
            ctx.strokeRect(padX, cy, cardW, sh);

            ctx.textAlign = 'center';
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 30px Orbitron, sans-serif';
            ctx.fillText(String(idx + 1).padStart(2, '0'), padX + numColW / 2, cy + sh / 2 + 8);
            ctx.fillStyle = '#22d3ee';
            ctx.fillRect(padX + numColW / 2 - 18, cy + sh / 2 + 18, 36, 4);
            ctx.textAlign = 'left';

            ctx.drawImage(img, padX + numColW + 8, cy, imgSlotW, sh);
            cy += sh + gap;
        });

        ctx.textAlign = 'center';
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 18px Orbitron, sans-serif';
        ctx.fillText(`HALO MATCH • ${tournamentId}`, width / 2, height - 22);
        return canvas.toDataURL('image/png');
    }

    async function launchTournament() {
        if (!state.balancedAlternatives.length) {
            runStrictBalance();
            if (!state.balancedAlternatives.length) return;
        }
        const alt = state.balancedAlternatives[state.selectedAlternativeIdx];
        const name = (document.getElementById('trnCfgName')?.value || '').trim() || 'MANSALVAS MAJOR OPEN';
        const id = ((document.getElementById('trnCfgId')?.value || '').trim() || `TRN-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();

        const bracket = window.HaloTournamentEngine.generateBracket(alt.teams, {
            elimination: state.cfg.elimination,
            bestOf: state.cfg.bestOf
        });

        const phaseMaps = await drawTournamentPhaseMaps(false);

        state.activeTournament = {
            id,
            name,
            format: state.cfg.format,
            bestOf: state.cfg.bestOf,
            elimination: state.cfg.elimination,
            teams: alt.teams,
            bracket,
            matches: bracket.matches,
            winners: [],
            phaseMaps,
            sessions: {},
            createdAt: Date.now()
        };

        document.getElementById('trnTopBadge').textContent = `${id} • ${alt.teams.length} Equipos`;
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('torneo', id);
            url.searchParams.delete('view');
            window.history.replaceState(null, '', url.toString());
        } catch (e) {}

        await saveTournamentToFirestore(state.activeTournament);
        subscribeTournamentRealtime(id);
        setSubView('bracket');
        dispatchTournamentToDiscord();
    }

    async function dispatchTournamentToDiscord() {
        const t = state.activeTournament;
        if (!t) return;
        const tournamentUrl = `${window.location.origin}/?torneo=${encodeURIComponent(t.id)}`;
        const defs = getPhasesForConfig(t.teams.length);
        const phaseBannerImages = [];
        if (t.phaseMaps) {
            for (const def of defs) {
                const list = t.phaseMaps[def.key];
                if (!Array.isArray(list) || !list.length) continue;
                try {
                    const dataUrl = await renderPhaseBannerPngDataUrl(def.title, list, t.format, t.id);
                    phaseBannerImages.push({ key: def.key, title: def.title, fileName: def.fileName, dataUrl });
                } catch (e) {}
            }
        }

        const embedBox = document.getElementById('trnDiscordEmbedPreview');
        if (embedBox) {
            embedBox.innerHTML = `
                <div class="font-bold text-sm text-[#facc15]">🏆 ${t.name} (${t.id})</div>
                <div class="p-2.5 rounded bg-[#1e1f22] space-y-1">
                    <div class="text-xs font-bold text-white">🔗 Consulta aquí el Bracket:</div>
                    <div class="text-[11px] text-cyan-400 underline break-all">${tournamentUrl}</div>
                </div>
                <div class="space-y-2">${phaseBannerImages.map(b => `<img src="${b.dataUrl}" alt="${b.title}" class="w-full h-auto rounded border border-cyan-500/40">`).join('')}</div>
                <div class="text-[11px] text-emerald-300">
                    🤖 Reporta tu resultado a <strong>Parcero</strong> mencionando <code>${t.id}</code>.<br>
                    💬 Discord oficial: <span class="underline text-cyan-300">https://discord.gg/3K4PCc3YU</span>
                </div>
            `;
        }

        const bodyJson = JSON.stringify({ tournament: t, tournamentUrl, phaseBannerImages });
        let sent = false;
        for (const endpoint of ['/api/discord-launch', `${LOCAL_BOT_BASE}/api/discord/launch-tournament`]) {
            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: bodyJson
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.discordPin) {
                        t.discordPin = data.discordPin;
                        await saveTournamentToFirestore(t);
                    }
                    sent = true;
                    break;
                }
            } catch (e) {}
        }
        if (sent) notify(`Torneo ${t.id} publicado y fijado en Discord.`, 'success');
    }

    // =========================================================
    // BRACKET PÚBLICO + CONECTORES + MODAL TÁCTICO + ADMIN
    // =========================================================
    function getTeamById(id) {
        return state.activeTournament?.teams.find(t => t.id === id) || null;
    }

    function renderBracketView() {
        const treeEl = document.getElementById('trnBracketTreeContent');
        const svgEl = document.getElementById('trnBracketConnectorsSvg');
        const t = state.activeTournament;
        if (!t) {
            treeEl.innerHTML = '<p class="text-sm text-slate-400">Lanza un torneo o abre un enlace ?torneo=TRN-XXXX para visualizar el Bracket.</p>';
            svgEl.innerHTML = '';
            return;
        }
        document.getElementById('trnBracketHeaderName').textContent = `${t.name} • ${t.id}`;
        const query = (document.getElementById('trnBracketSearchInput')?.value || '').trim().toLowerCase();

        const matchCardHtml = (m) => {
            const tA = getTeamById(m.teamAId);
            const tB = getTeamById(m.teamBId);
            const matchesQuery = query.length > 0 && [tA, tB].some(x => x && x.players.some(p => p.name.toLowerCase().includes(query)));

            const rowHtml = (team, score, isLoser) => {
                const clickAttr = state.adminKey
                    ? `data-admin-match="${m.id}"`
                    : (team ? `data-tac-team="${team.id}" data-tac-match="${m.id}"` : '');
                if (!team) {
                    const label = m.isBye ? 'BYE' : 'POR DEFINIR';
                    return `<div ${clickAttr} class="hcs-team-row px-2.5 justify-between text-[11px] text-slate-400 italic"><span>${label}</span><span>-</span></div>`;
                }
                const vis = getTeamVisual(team);
                return `
                <div ${clickAttr} class="hcs-team-row pr-2 justify-between ${isLoser ? 'opacity-55' : ''}">
                    <div class="flex items-center gap-2 min-w-0 h-full">
                        <div class="hcs-color-box" style="background:${vis.hex}; color:${vis.textHex}">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="${vis.svgPath}"/></svg>
                        </div>
                        <span class="font-hcs font-bold text-sm tracking-wide truncate">${team.name.replace('Equipo ', '').toUpperCase()}</span>
                    </div>
                    <span class="font-orbitron font-bold text-xs text-slate-700">${m.isBye ? 'BYE' : (score ?? (m.status === 'CONFIRMING' ? '⏳' : ''))}</span>
                </div>`;
            };

            const loserA = m.status === 'COMPLETED' && m.winnerId && tA && m.winnerId !== tA.id;
            const loserB = m.status === 'COMPLETED' && m.winnerId && tB && m.winnerId !== tB.id;

            return `
            <div data-match-id="${m.id}" data-next-id="${m.nextMatchId || ''}" data-round-name="${m.roundName || ''}" data-bracket="${m.bracket || ''}" class="hcs-match-card ${matchesQuery ? 'highlighted-gold' : ''}">
                ${rowHtml(tA, m.scoreA, loserA)}
                ${rowHtml(tB, m.scoreB, loserB)}
            </div>`;
        };

        const buildSection = (title, rounds) => {
            if (!rounds.length) return '';
            const cols = rounds.map(r => {
                const rMatches = r.matchIds.map(id => t.bracket.matches.find(x => x.id === id)).filter(Boolean);
                return `
                <div class="flex flex-col justify-around gap-4 shrink-0">
                    <div class="font-hcs font-bold text-xs tracking-wider text-slate-300 uppercase mb-1">${r.roundName}</div>
                    <div class="flex flex-col justify-around gap-4 flex-1">${rMatches.map(matchCardHtml).join('')}</div>
                </div>`;
            }).join('');
            return `
            <div class="space-y-3">
                <div data-section-pill="${title}" class="hcs-section-pill">${title}</div>
                <div class="flex items-stretch gap-10 pb-2">${cols}</div>
            </div>`;
        };

        const winnersRounds = t.bracket.rounds.filter(r => r.bracket === 'WINNERS' || r.bracket === 'GRAND_FINAL');
        const elimRounds = t.bracket.rounds.filter(r => r.bracket === 'ELIMINATION');
        treeEl.innerHTML = buildSection('WINNERS', winnersRounds) + buildSection('ELIMINATION', elimRounds);

        treeEl.querySelectorAll('[data-tac-team]').forEach(el => {
            el.onclick = () => openTacticalModal(el.getAttribute('data-tac-team'), el.getAttribute('data-tac-match'));
        });
        treeEl.querySelectorAll('[data-admin-match]').forEach(el => {
            el.onclick = () => openAdminMatchModal(el.getAttribute('data-admin-match'));
        });

        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(drawBracketConnectors);
        else drawBracketConnectors();
    }

    function drawBracketConnectors() {
        const wrap = document.getElementById('trnBracketCanvasWrap');
        const svg = document.getElementById('trnBracketConnectorsSvg');
        if (!wrap || !svg) return;
        const wrapRect = wrap.getBoundingClientRect();
        svg.setAttribute('width', wrap.scrollWidth);
        svg.setAttribute('height', wrap.scrollHeight);

        const cards = Array.from(wrap.querySelectorAll('[data-match-id]'));
        const byId = new Map(cards.map(el => [el.dataset.matchId, el]));
        let paths = '';

        for (const card of cards) {
            const nextId = card.dataset.nextId;
            if (!nextId || !byId.has(nextId)) continue;
            const target = byId.get(nextId);
            const r1 = card.getBoundingClientRect();
            const r2 = target.getBoundingClientRect();
            const x1 = r1.right - wrapRect.left + wrap.scrollLeft;
            const y1 = r1.top + r1.height / 2 - wrapRect.top + wrap.scrollTop;
            const x2 = r2.left - wrapRect.left + wrap.scrollLeft;
            const y2 = r2.top + r2.height / 2 - wrapRect.top + wrap.scrollTop;
            const midX = x1 + (x2 - x1) / 2;
            paths += `<path d="M ${x1} ${y1} H ${midX} V ${y2} H ${x2}" fill="none" stroke="rgba(220,224,230,0.55)" stroke-width="1.5"/>`;
        }

        const wfCard = wrap.querySelector('[data-round-name="WINNERS FINAL"]');
        const gfCard = wrap.querySelector('[data-bracket="GRAND_FINAL"]');
        const elimPill = wrap.querySelector('[data-section-pill="ELIMINATION"]');
        if (wfCard && gfCard && elimPill) {
            const rWF = wfCard.getBoundingClientRect();
            const rGF = gfCard.getBoundingClientRect();
            const rEL = elimPill.getBoundingClientRect();
            const dropX = ((rWF.right + rGF.left) / 2) - wrapRect.left + wrap.scrollLeft;
            const startY = (rWF.top + rWF.height / 2) - wrapRect.top + wrap.scrollTop;
            const endY = rEL.top - wrapRect.top + wrap.scrollTop;
            if (endY > startY) {
                paths += `<path d="M ${dropX} ${startY} V ${endY}" fill="none" stroke="rgba(220,224,230,0.55)" stroke-width="1.5"/>`;
            }
        }
        svg.innerHTML = paths;
    }

    function openTacticalModal(teamId, matchId) {
        const team = getTeamById(teamId);
        if (!team) return;
        const vis = getTeamVisual(team);
        const badge = document.getElementById('trnTacBadge');
        badge.style.background = vis.hex;
        badge.style.color = vis.textHex;
        badge.innerHTML = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="${vis.svgPath}"/></svg>`;
        document.getElementById('trnTacTitle').textContent = `${team.name} (${team.totalPts} PTS)`;
        document.getElementById('trnTacVoice').textContent = team.voiceChannel;

        const m = state.activeTournament?.bracket.matches.find(x => x.id === matchId);
        document.getElementById('trnTacBody').innerHTML = `
            <div class="text-[11px] text-slate-400">Enfrentamiento: <strong class="text-white">${m ? m.roundName : ''}</strong></div>
            <div class="space-y-1.5">
                ${team.players.map(p => `<div class="flex justify-between px-3 py-1.5 rounded bg-[#0b0d10] border border-slate-700"><span class="font-semibold text-white">${p.name}</span><span class="font-orbitron text-amber-300">${p.pts} PTS</span></div>`).join('')}
            </div>
        `;
        toggleModal('trnTacticalModal', true);
    }

    function handleShieldAdminClick() {
        const now = Date.now();
        state.shieldClicks = state.shieldClicks.filter(t => now - t < 2500);
        state.shieldClicks.push(now);
        if (state.shieldClicks.length >= 5) {
            state.shieldClicks = [];
            if (state.adminKey) {
                document.getElementById('trnAdminBar')?.classList.remove('hidden');
                return;
            }
            document.getElementById('trnAdminAuthError')?.classList.add('hidden');
            const inp = document.getElementById('trnAdminPassInput');
            if (inp) inp.value = '';
            toggleModal('trnAdminAuthModal', true);
            setTimeout(() => inp && inp.focus(), 50);
        }
    }

    async function verifyAdminKey() {
        const inp = document.getElementById('trnAdminPassInput');
        const err = document.getElementById('trnAdminAuthError');
        const key = (inp?.value || '').trim();
        if (!key) return;
        for (const endpoint of ['/api/tournament-admin', `${LOCAL_BOT_BASE}/api/tournament/admin-verify`]) {
            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key, password: key })
                });
                const data = await res.json();
                if (res.ok && data.ok) {
                    state.adminKey = key;
                    toggleModal('trnAdminAuthModal', false);
                    document.getElementById('trnAdminBar')?.classList.remove('hidden');
                    renderBracketView();
                    return;
                }
            } catch (e) {}
        }
        if (err) {
            err.textContent = 'Clave incorrecta o servidor de verificación no disponible.';
            err.classList.remove('hidden');
        }
    }

    function exitTournamentAdmin() {
        state.adminKey = '';
        document.getElementById('trnAdminBar')?.classList.add('hidden');
        toggleModal('trnAdminMatchModal', false);
        renderBracketView();
    }

    function openAdminMatchModal(matchId) {
        if (!state.adminKey || !state.activeTournament) return;
        const m = state.activeTournament.bracket.matches.find(x => x.id === matchId);
        if (!m) return;
        state.currentAdminMatchId = matchId;
        document.getElementById('trnAdminRoundLabel').textContent = `${m.roundName} (${m.id}) • ${m.status}`;

        const opts = ['<option value="">-- Vacío --</option>'].concat(
            state.activeTournament.teams.map(t => `<option value="${t.id}">${t.name}</option>`)
        ).join('');
        const selA = document.getElementById('trnAdminSlotASel');
        const selB = document.getElementById('trnAdminSlotBSel');
        const winSel = document.getElementById('trnAdminWinnerSel');
        selA.innerHTML = opts;
        selB.innerHTML = opts;
        selA.value = m.teamAId || '';
        selB.value = m.teamBId || '';
        document.getElementById('trnAdminScoreAInp').value = m.scoreA ?? '';
        document.getElementById('trnAdminScoreBInp').value = m.scoreB ?? '';

        const refreshWinners = () => {
            const tA = getTeamById(selA.value);
            const tB = getTeamById(selB.value);
            winSel.innerHTML = `<option value="">-- Sin definir --</option>`
                + (tA ? `<option value="${tA.id}">${tA.name}</option>` : '')
                + (tB ? `<option value="${tB.id}">${tB.name}</option>` : '');
            if (m.winnerId && (m.winnerId === selA.value || m.winnerId === selB.value)) winSel.value = m.winnerId;
        };
        selA.onchange = refreshWinners;
        selB.onchange = refreshWinners;
        refreshWinners();

        document.getElementById('trnAdminMatchStatus')?.classList.add('hidden');
        toggleModal('trnAdminMatchModal', true);
    }

    async function saveAdminMatchEdit(reopen) {
        if (!state.adminKey || !state.activeTournament || !state.currentAdminMatchId) return;
        const payload = {
            slotAId: document.getElementById('trnAdminSlotASel').value || null,
            slotBId: document.getElementById('trnAdminSlotBSel').value || null,
            scoreA: document.getElementById('trnAdminScoreAInp').value === '' ? null : Number(document.getElementById('trnAdminScoreAInp').value),
            scoreB: document.getElementById('trnAdminScoreBInp').value === '' ? null : Number(document.getElementById('trnAdminScoreBInp').value),
            winnerTeamId: document.getElementById('trnAdminWinnerSel').value || null,
            reopen: Boolean(reopen)
        };
        if (typeof window.HaloTournamentEngine?.adminMoveOrSetMatchResult === 'function') {
            window.HaloTournamentEngine.adminMoveOrSetMatchResult(state.activeTournament, state.currentAdminMatchId, payload);
        }
        await saveTournamentToFirestore(state.activeTournament);
        toggleModal('trnAdminMatchModal', false);
        renderBracketView();
        notify('Llave actualizada y sincronizada.', 'success');
    }

    function renderWinnersView() {
        const box = document.getElementById('trnWinnersTableContainer');
        if (!box) return;
        const q = (document.getElementById('trnWinnersFilterInput')?.value || '').trim().toLowerCase();
        const filtered = state.winnersHistory.filter(w =>
            !q ||
            String(w.tournamentName || '').toLowerCase().includes(q) ||
            String(w.tournamentId || '').toLowerCase().includes(q) ||
            String(w.teamName || '').toLowerCase().includes(q) ||
            String(w.date || '').toLowerCase().includes(q) ||
            (w.players || []).some(p => String(p).toLowerCase().includes(q))
        );
        if (!filtered.length) {
            box.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">Aún no hay ganadores registrados. Cuando finalice un torneo aparecerán aquí automáticamente.</div>';
            return;
        }
        box.innerHTML = filtered.map(w => `
            <div class="hcs-winner-row grid grid-cols-12 items-stretch">
                <div class="col-span-2 sm:col-span-1 bg-[#e8a938] text-[#111317] font-hcs font-extrabold text-2xl sm:text-3xl flex items-center justify-center py-3">
                    ${w.position || '1'}
                </div>
                <div class="col-span-6 sm:col-span-7 px-3 sm:px-4 py-3 flex items-center gap-3 sm:gap-4 min-w-0">
                    <span class="w-9 h-9 flex items-center justify-center shrink-0" style="color:${w.colorHex || '#e8a938'}">
                        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="${w.svgPath || ''}"/></svg>
                    </span>
                    <div class="min-w-0">
                        <div class="font-hcs font-extrabold text-xl sm:text-2xl text-white uppercase tracking-wide leading-tight truncate">${w.teamName}</div>
                        <div class="flex flex-wrap gap-1.5 mt-1">
                            ${(w.players || []).map(p => `<span class="hcs-player-chip-gold">${p}</span>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="col-span-4 border-l border-[#e8a938]/55 px-2.5 sm:px-4 py-3 flex flex-col justify-center items-end text-right">
                    <div class="font-hcs font-bold text-sm sm:text-lg text-white uppercase tracking-wide leading-tight">${w.tournamentName || 'TORNEO HCS'}</div>
                    <div class="font-hcs font-bold text-xs sm:text-sm text-[#e8a938] tracking-wider mt-0.5">${w.tournamentId || ''} • ${w.date || ''}</div>
                </div>
            </div>
        `).join('');
    }

    async function runVercelParceroSyncTick() {
        if (state.parceroSyncInFlight || document.hidden) return;
        const overlay = document.getElementById('tournamentModuleOverlay');
        if (!overlay || overlay.classList.contains('hidden')) return;
        state.parceroSyncInFlight = true;
        try {
            const res = await fetch('/api/parcero-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tournamentId: state.activeTournament?.id || null })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && state.activeTournament?.id && Array.isArray(data.updatedTournamentIds) && data.updatedTournamentIds.includes(state.activeTournament.id) && !state.unsubTournament) {
                    const fresh = await loadTournamentFromCloud(state.activeTournament.id);
                    if (fresh) {
                        state.activeTournament = fresh;
                        if (state.subView === 'bracket') renderBracketView();
                    }
                }
            }
        } catch (e) {
            // Silencioso en caso de red intermitente o entorno sin serverless
        } finally {
            state.parceroSyncInFlight = false;
        }
    }

    function startVercelParceroSyncLoop() {
        if (state.parceroSyncTimer) return;
        runVercelParceroSyncTick();
        state.parceroSyncTimer = setInterval(runVercelParceroSyncTick, 4000);
    }

    function stopVercelParceroSyncLoop() {
        if (state.parceroSyncTimer) {
            clearInterval(state.parceroSyncTimer);
            state.parceroSyncTimer = null;
        }
    }

    async function openTournamentModule(initialView) {
        ensureMounted();
        const overlay = document.getElementById('tournamentModuleOverlay');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        const params = new URLSearchParams(window.location.search);
        const qTrn = params.get('torneo');
        if (qTrn && (!state.activeTournament || state.activeTournament.id !== qTrn.toUpperCase())) {
            const loaded = await loadTournamentFromCloud(qTrn);
            if (loaded) {
                state.activeTournament = loaded;
                document.getElementById('trnTopBadge').textContent = `${loaded.id} • ${loaded.teams.length} Equipos`;
                subscribeTournamentRealtime(loaded.id);
            }
        }
        setSubView(initialView || (qTrn ? 'bracket' : 'create'));
        startVercelParceroSyncLoop();
    }

    function closeTournamentModule() {
        stopVercelParceroSyncLoop();
        const overlay = document.getElementById('tournamentModuleOverlay');
        if (overlay) overlay.classList.add('hidden');
        document.body.style.overflow = '';
    }

    window.openTournamentModule = openTournamentModule;
    window.closeTournamentModule = closeTournamentModule;

    window.addEventListener('DOMContentLoaded', () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('torneo')) {
            openTournamentModule('bracket');
        } else if (params.get('view') === 'winners') {
            openTournamentModule('winners');
        }
    });
})();
