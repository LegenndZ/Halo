// ============================================================================
// MAP-DRONE-UX.JS — MOTOR 3D FPV UNSC (THREE.JS) + CALLOUTS INTERACTIVOS
// + TELEMETRÍA HUD EN TIEMPO REAL + INTRO CINEMÁTICA HALO INFINITE (10S)
// ============================================================================
(function() {

let scene = null;
let camera = null;
let renderer = null;
let mapGroup = null;
let weatherSystem = null;
let dynamicMapElements = [];
let currentMapKey = 'streets';
let autoRotateMaps = true;
let mapRotationInterval = null;
let droneClock = 0;
let threeClock = null;
let activeCallouts3D = [];

// Curvas Spline 3D activas del mapa actual
let activePositionSpline = null;
let activeLookAtSpline = null;
let splineProgress = 0;
let currentBankAngle = 0;
let smoothedLookAt = null;

// Estado de Tactical Focus Swoop (al hacer clic en un Callout o desde el Coach IA)
let activeFocusTarget = null; // { id, name, tip, role, vec, camPos, expiresAt }

// Paralaje sutil con puntero / touch
let pointerTargetX = 0;
let pointerTargetY = 0;
let pointerCurrentX = 0;
let pointerCurrentY = 0;

// Telemetría HUD UNSC y caché de oclusión de paneles (throttled)
let lastTelemetryUpdateTime = 0;
let frameCounterForFps = 0;
let lastFpsSampleTime = performance.now();
let currentMeasuredFps = 60;
let cachedHudPanelRects = [];
let lastRectsCacheTime = 0;

const MAP_CONFIGS = {
    streets: {
        label: 'CALLES (Streets • Lluvia Nocturna Neón)',
        shortName: 'STREETS // NEW MOMBASA',
        weatherLabel: '🌧️ LLUVIA URBANA • NEW MOMBASA',
        fogColor: 0x040915,
        fogDensity: 0.014,
        ambient: 0x1a365d,
        primaryLight: 0x00e5ff,
        secondaryLight: 0xff2a6d,
        cssAccent: '#00e5ff',
        cssSecondary: '#ff2a6d',
        cssGlow: 'rgba(0, 229, 255, 0.18)',
        visorTint: 'rgba(0, 229, 255, 0.06)',
        hudBg: 'rgba(4, 14, 28, 0.90)',
        bgBase: '#030914',
        textPrimary: '#eaf7ff',
        textSoft: '#c2e2f8',
        textMuted: '#8eb4d4',
        weatherType: 'rain',
        floorRoughness: 0.12,
        floorMetalness: 0.88,
        splineSpeed: 0.022,
        splinePoints: [
            [0, 4.4, -4],
            [4.8, 3.8, -18],
            [8.4, 5.2, -32],
            [7.2, 3.6, -52],
            [0, 3.0, -68],
            [-7.6, 3.8, -48],
            [-8.2, 4.2, -26]
        ],
        lookAtPoints: [
            [0, 2.4, -18],
            [8.8, 4.2, -32],
            [8.5, 2.2, -52],
            [0, 2.0, -70],
            [-8.5, 2.4, -48],
            [-8.8, 2.6, -26],
            [0, 2.6, -16]
        ],
        callouts: [
            { id: 'c-rockets', name: '🚀 C Plat / Rockets', sector: 'SECTOR C-PLAT', role: 'power', timer: '120s', pos: [0, 2.2, -18], tip: 'Spawn del Cohete M41 SPNKR. Domina Balcón PD y Café 15s antes del respawn.' },
            { id: 'pd-balcony', name: '🚔 PD Balcony', sector: 'SECTOR PD-HIGH', role: 'zone', timer: 'High Ground', pos: [9.2, 4.6, -32], tip: 'Posición elevada clave para cruzar fuego hacia C Plat y controlar Medio.' },
            { id: 'cafe', name: '☕ Café', sector: 'SECTOR CAFÉ', role: 'zone', timer: 'Flanco Este', pos: [9.0, 2.2, -52], tip: 'Ruta cubierta para flanquear hacia Sub/Red Room y cortar rotaciones.' },
            { id: 'sub-red', name: '🚇 Sub / Red Room', sector: 'SECTOR SUB-RED', role: 'spawn', timer: 'Ancla Spawn', pos: [0, 2.0, -70], tip: 'Ancla de respawns y conector subterráneo de corto alcance.' },
            { id: 'b-camo', name: '👻 B / Camo', sector: 'SECTOR B-CAMO', role: 'equip', timer: '120s', pos: [-8.8, 2.4, -48], tip: 'Camuflaje Activo cada 2 min. Pieza clave para romper defensas cerradas.' },
            { id: 'arcade', name: '🕹️ Arcade', sector: 'SECTOR ARCADE', role: 'zone', timer: 'Flanco Oeste', pos: [-9.2, 2.6, -26], tip: 'Línea de tiro directa hacia B/Camo y salida superior de estación PD.' }
        ]
    },
    aquarius: {
        label: 'ACUARIO (Aquarius • Domo Bioluminiscente)',
        shortName: 'AQUARIUS // HYDRO LAB',
        weatherLabel: '🌊 CORRIENTE SUBMARINA • HYDRO LAB',
        fogColor: 0x021c24,
        fogDensity: 0.015,
        ambient: 0x0d5c63,
        primaryLight: 0x00ffc8,
        secondaryLight: 0xfacc15,
        cssAccent: '#00ffc8',
        cssSecondary: '#facc15',
        cssGlow: 'rgba(0, 255, 200, 0.19)',
        visorTint: 'rgba(0, 255, 200, 0.07)',
        hudBg: 'rgba(3, 20, 26, 0.90)',
        bgBase: '#021318',
        textPrimary: '#e6fff9',
        textSoft: '#bcece0',
        textMuted: '#85bfb2',
        weatherType: 'bubbles',
        floorRoughness: 0.18,
        floorMetalness: 0.78,
        splineSpeed: 0.021,
        splinePoints: [
            [0, 4.2, -6],
            [6.8, 4.8, -24],
            [8.2, 3.6, -48],
            [0, 4.0, -68],
            [-8.2, 3.6, -48],
            [-6.8, 4.6, -24],
            [0, 3.1, -38]
        ],
        lookAtPoints: [
            [6.8, 4.2, -26],
            [8.6, 3.0, -50],
            [0, 2.6, -64],
            [-8.6, 2.4, -50],
            [-8.4, 3.2, -28],
            [0, 1.8, -38],
            [0, 2.8, -22]
        ],
        callouts: [
            { id: 'top-car', name: '🟨 Top Car', sector: 'SECTOR TOP-CAR', role: 'power', timer: 'Power Spot', pos: [6.8, 4.4, -26], tip: 'Posición dominante del mapa: controla Medio, Sub y salidas de bandera.' },
            { id: 'p2-hydro', name: '🌊 P2 / Hydro', sector: 'SECTOR P2-HYDRO', role: 'zone', timer: 'Carril Este', pos: [8.6, 3.2, -50], tip: 'Control del ala hidropónica para escoltar o frenar corridas de CTF.' },
            { id: 'base-flag', name: '🚩 Base Flag', sector: 'SECTOR FLAG-BASE', role: 'spawn', timer: 'Objetivo CTF', pos: [0, 2.6, -64], tip: 'Plataforma de bandera: asegura Top Car y Fridge antes de iniciar el pull.' },
            { id: 'fridge-util', name: '❄️ Fridge / Utility', sector: 'SECTOR FRIDGE', role: 'zone', timer: 'Carril Oeste', pos: [-8.6, 2.4, -50], tip: 'Ruta cerrada de utilidad ideal para rotar bandera con cobertura.' },
            { id: 'p1', name: '🌱 P1 / Planter', sector: 'SECTOR P1-PLANTER', role: 'zone', timer: 'Crossfire', pos: [-8.6, 3.2, -28], tip: 'Ángulo de fuego cruzado hacia Top Car y rampa de bandera.' },
            { id: 'sub-camo', name: '🛡️ Sub / Camo-OS', sector: 'SECTOR SUB-LOW', role: 'equip', timer: '120s', pos: [0, 1.8, -38], tip: 'Power-up central en foso bajo. Limpia con granadas antes de bajar.' }
        ]
    },
    livefire: {
        label: 'FUEGO REAL (Live Fire • Polvo y Atardecer UNSC)',
        shortName: 'LIVE FIRE // UNSC ACADEMY',
        weatherLabel: '🌪️ BRUMA CÁLIDA • ACADEMIA UNSC',
        fogColor: 0x1a150e,
        fogDensity: 0.013,
        ambient: 0x4d3e2a,
        primaryLight: 0xf59e0b,
        secondaryLight: 0x38bdf8,
        cssAccent: '#f59e0b',
        cssSecondary: '#38bdf8',
        cssGlow: 'rgba(245, 158, 11, 0.18)',
        visorTint: 'rgba(245, 158, 11, 0.07)',
        hudBg: 'rgba(22, 16, 9, 0.90)',
        bgBase: '#120d07',
        textPrimary: '#fff6e8',
        textSoft: '#ebd5b3',
        textMuted: '#bfa37a',
        weatherType: 'dust',
        floorRoughness: 0.65,
        floorMetalness: 0.25,
        splineSpeed: 0.021,
        splinePoints: [
            [-6.5, 4.2, -10],
            [-8.0, 6.2, -28],
            [-1.5, 4.8, -42],
            [3.2, 6.0, -62],
            [8.8, 3.2, -46],
            [7.4, 3.8, -22]
        ],
        lookAtPoints: [
            [-8.2, 5.4, -28],
            [0, 3.2, -42],
            [3.5, 5.0, -64],
            [9.2, 1.8, -46],
            [8.2, 2.4, -22],
            [-8.2, 2.8, -14]
        ],
        callouts: [
            { id: 'a-garage', name: '🏗️ A-Plat / Garage', sector: 'SECTOR A-GARAGE', role: 'spawn', timer: 'Base A', pos: [-8.2, 2.8, -14], tip: 'Zona de anclaje en Strongholds y acceso cubierto hacia Torre.' },
            { id: 'tower-s7', name: '🎯 Tower / S7', sector: 'SECTOR TOWER-S7', role: 'power', timer: '180s', pos: [-8.2, 5.6, -28], tip: 'Francotirador S7 + vista 360° sobre Top Mid, Mud y Dummy.' },
            { id: 'top-mid', name: '📦 Top Mid / Green', sector: 'SECTOR TOP-MID', role: 'zone', timer: 'Eje Central', pos: [0, 3.2, -42], tip: 'Cajas Verdes: quien domina este centro controla las rotaciones 4v4.' },
            { id: 'nest', name: '🦅 Nest', sector: 'SECTOR NEST', role: 'zone', timer: 'High Ground', pos: [3.5, 5.2, -64], tip: 'Posición elevada trasera para defender B y castigar Top Mid.' },
            { id: 'mud-os', name: '🛡️ Mud / OS', sector: 'SECTOR MUD-CLIFF', role: 'equip', timer: '120s', pos: [9.4, 1.8, -46], tip: 'Sobreescudo / Camo junto al barranco. Cuidado con el Repulsor.' },
            { id: 'dummy', name: '🤖 Dummy', sector: 'SECTOR DUMMY', role: 'zone', timer: 'Crossfire', pos: [8.2, 2.4, -22], tip: 'Cobertura lateral para cruzar fuego con Torre hacia Cajas Verdes.' }
        ]
    },
    recharge: {
        label: 'RECARGA (Recharge • Plasma Hidroeléctrico)',
        shortName: 'RECHARGE // AXYS HYDRO',
        weatherLabel: '⚡ PULSO VOLTAICO • TURBINA AXYS',
        fogColor: 0x080b1f,
        fogDensity: 0.014,
        ambient: 0x2a2463,
        primaryLight: 0xa855f7,
        secondaryLight: 0x10b981,
        cssAccent: '#a855f7',
        cssSecondary: '#10b981',
        cssGlow: 'rgba(168, 85, 247, 0.20)',
        visorTint: 'rgba(168, 85, 247, 0.07)',
        hudBg: 'rgba(11, 9, 26, 0.90)',
        bgBase: '#070616',
        textPrimary: '#f5eeff',
        textSoft: '#d8c7f7',
        textMuted: '#a491c9',
        weatherType: 'sparks',
        floorRoughness: 0.22,
        floorMetalness: 0.82,
        splineSpeed: 0.021,
        splinePoints: [
            [-6.8, 4.2, -14],
            [-8.4, 6.4, -36],
            [-1.2, 4.4, -60],
            [8.2, 5.0, -52],
            [8.0, 3.6, -28],
            [0, 3.8, -42]
        ],
        lookAtPoints: [
            [-8.8, 5.8, -38],
            [0, 3.0, -62],
            [8.8, 4.4, -52],
            [8.8, 2.4, -28],
            [0, 3.8, -44],
            [-8.4, 3.0, -20]
        ],
        callouts: [
            { id: 'gold-sword', name: '⚔️ Gold Bridge / Sword', sector: 'SECTOR GOLD-A', role: 'power', timer: '120s', pos: [-8.4, 3.0, -20], tip: 'Puente de Espada de Energía. Corta rotaciones frontales por A.' },
            { id: 'top-glass', name: '🪟 Top Glass / Attic', sector: 'SECTOR ATTIC', role: 'zone', timer: 'High Ground', pos: [-8.8, 5.8, -38], tip: 'Balcón superior sobre A y Reactor: ventaja de altura en todo el mapa.' },
            { id: 'control-b', name: '🎛️ Control / B', sector: 'SECTOR CONTROL-B', role: 'zone', timer: 'Stronghold B', pos: [0, 3.0, -62], tip: 'Sala clave de Strongholds/Oddball con salidas a Long Hall y C.' },
            { id: 'long-hall', name: '🚪 Long Hall', sector: 'SECTOR LONG-HALL', role: 'spawn', timer: 'Ancla Spawn', pos: [8.8, 4.4, -52], tip: 'Corredor de anclaje estratégico para sostener respawns hacia Control.' },
            { id: 'batteries', name: '🔋 Batteries / Hydro', sector: 'SECTOR BATTERIES', role: 'equip', timer: 'Flanco Este', pos: [8.8, 2.4, -28], tip: 'Ruta inferior entre turbinas para flanquear B sin ser visto desde Attic.' },
            { id: 'whirl-reactor', name: '⚡ Whirl / Reactor', sector: 'SECTOR REACTOR', role: 'power', timer: 'Nexo Central', pos: [0, 3.8, -44], tip: 'Nexo central de rotación y Sobreescudo/Camo: conecta las 4 zonas.' }
        ]
    }
};

// Libera explícitamente geometrías y materiales en GPU antes de cambiar de mapa (Cero fugas VRAM)
function disposeMapResources(group) {
    if (!group) return;
    while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child.traverse) {
            child.traverse(node => {
                if (node.geometry) {
                    node.geometry.dispose();
                }
                if (node.material) {
                    if (Array.isArray(node.material)) {
                        node.material.forEach(m => m && m.dispose && m.dispose());
                    } else if (node.material.dispose) {
                        node.material.dispose();
                    }
                }
            });
        }
    }
}

function applyMapAtmosphereToHUD(cfg) {
    const root = document.documentElement;
    root.style.setProperty('--map-accent', cfg.cssAccent);
    root.style.setProperty('--map-secondary', cfg.cssSecondary);
    root.style.setProperty('--map-glow', cfg.cssGlow);
    root.style.setProperty('--visor-tint', cfg.visorTint);
    if (cfg.hudBg) root.style.setProperty('--hud-bg', cfg.hudBg);
    if (cfg.bgBase) root.style.setProperty('--map-bg-base', cfg.bgBase);
    if (cfg.textPrimary) root.style.setProperty('--map-text-primary', cfg.textPrimary);
    if (cfg.textSoft) root.style.setProperty('--map-text-soft', cfg.textSoft);
    if (cfg.textMuted) root.style.setProperty('--map-text-muted', cfg.textMuted);

    const flashEl = document.getElementById('mapTransitionHudFlash');
    const canvas = document.getElementById('bgDroneCanvas');
    if (flashEl) {
        flashEl.style.opacity = '0.85';
        setTimeout(() => { flashEl.style.opacity = '0'; }, 480);
    }
    if (canvas) {
        canvas.style.filter = 'brightness(1.32) contrast(1.10)';
        canvas.style.transform = 'scale(1.015)';
        setTimeout(() => {
            canvas.style.filter = 'brightness(1) contrast(1)';
            canvas.style.transform = 'scale(1)';
        }, 500);
    }
}

function getOptimalPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    return window.innerWidth < 768 ? Math.min(dpr, 1.25) : Math.min(dpr, 2);
}

function initThreeDroneBackground() {
    const canvas = document.getElementById('bgDroneCanvas');
    if (!canvas || typeof THREE === 'undefined') return;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x040915, 0.014);

    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 240);
    camera.position.set(0, 4.4, -4);
    smoothedLookAt = new THREE.Vector3(0, 2.5, -20);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(getOptimalPixelRatio());

    threeClock = new THREE.Clock();
    mapGroup = new THREE.Group();
    scene.add(mapGroup);

    applyMapAtmosphereToHUD(MAP_CONFIGS.streets);
    buildDroneMapGeometry('streets');

    window.addEventListener('resize', () => {
        if (!camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(getOptimalPixelRatio());
    });

    // Paralaje táctico suave con mouse / touch
    window.addEventListener('pointermove', (e) => {
        pointerTargetX = ((e.clientX / Math.max(1, window.innerWidth)) - 0.5) * 2;
        pointerTargetY = ((e.clientY / Math.max(1, window.innerHeight)) - 0.5) * 2;
    }, { passive: true });

    if (mapRotationInterval) clearInterval(mapRotationInterval);
    mapRotationInterval = setInterval(() => {
        if (!autoRotateMaps || activeFocusTarget) return;
        const keys = Object.keys(MAP_CONFIGS);
        const nextIdx = (keys.indexOf(currentMapKey) + 1) % keys.length;
        setDroneMap(keys[nextIdx], true);
    }, 18000);

    animateDroneLoop();
}

function buildDroneMapGeometry(mapKey) {
    if (!scene || !mapGroup || typeof THREE === 'undefined') return;

    // 1. Limpieza total de recursos GPU previos
    disposeMapResources(mapGroup);
    dynamicMapElements = [];
    activeFocusTarget = null;
    hideCalloutTooltip();

    const cfg = MAP_CONFIGS[mapKey] || MAP_CONFIGS.streets;
    scene.fog.color.setHex(cfg.fogColor);
    scene.fog.density = cfg.fogDensity;
    renderer.setClearColor(cfg.fogColor, 1);

    // 2. Construir curvas cerradas CatmullRomCurve3 para el vuelo FPV en este mapa
    const posVectors = cfg.splinePoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const lookVectors = cfg.lookAtPoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    activePositionSpline = new THREE.CatmullRomCurve3(posVectors, true, 'catmullrom', 0.5);
    activeLookAtSpline = new THREE.CatmullRomCurve3(lookVectors, true, 'catmullrom', 0.5);

    const ambLight = new THREE.AmbientLight(cfg.ambient, 1.5);
    mapGroup.add(ambLight);

    const dirLight = new THREE.DirectionalLight(cfg.primaryLight, 1.25);
    dirLight.position.set(15, 32, -25);
    mapGroup.add(dirLight);

    const pLight1 = new THREE.PointLight(cfg.primaryLight, 2.8, 95);
    pLight1.position.set(0, 12, -22);
    mapGroup.add(pLight1);

    const pLight2 = new THREE.PointLight(cfg.secondaryLight, 2.4, 95);
    pLight2.position.set(0, 10, -58);
    mapGroup.add(pLight2);

    // Suelo físico según el mapa
    const floorGeo = new THREE.PlaneGeometry(80, 190, 16, 32);
    const floorMat = new THREE.MeshStandardMaterial({
        color: cfg.fogColor,
        roughness: cfg.floorRoughness,
        metalness: cfg.floorMetalness
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -55;
    mapGroup.add(floor);

    const grid = new THREE.GridHelper(170, 68, cfg.primaryLight, cfg.ambient);
    grid.position.y = 0.04;
    grid.position.z = -50;
    grid.material.opacity = 0.30;
    grid.material.transparent = true;
    mapGroup.add(grid);

    const neonMat1 = new THREE.MeshBasicMaterial({ color: cfg.primaryLight });
    const neonMat2 = new THREE.MeshBasicMaterial({ color: cfg.secondaryLight });
    const dummyMatrix = new THREE.Object3D();

    // 3. Geometría optimizada con InstancedMesh por mapa
    if (mapKey === 'streets') {
        const zSlices = [];
        for (let z = -6; z > -138; z -= 11) zSlices.push(z);
        const totalBlds = zSlices.length * 2;

        const bldGeo = new THREE.BoxGeometry(6, 1, 8);
        const bldMat = new THREE.MeshStandardMaterial({ color: 0x081526, roughness: 0.25, metalness: 0.78 });
        const bldInst = new THREE.InstancedMesh(bldGeo, bldMat, totalBlds);

        const signGeo = new THREE.BoxGeometry(0.25, 2.2, 3.8);
        const signInst1 = new THREE.InstancedMesh(signGeo, neonMat1, zSlices.length);
        const signInst2 = new THREE.InstancedMesh(signGeo, neonMat2, zSlices.length);

        let bIdx = 0, s1Idx = 0, s2Idx = 0;
        zSlices.forEach((z) => {
            const hL = 8 + ((Math.abs(z) * 7) % 12);
            const hR = 8 + ((Math.abs(z) * 11) % 12);

            dummyMatrix.position.set(-13.8, hL / 2, z);
            dummyMatrix.scale.set(1, hL, 1);
            dummyMatrix.rotation.set(0, 0, 0);
            dummyMatrix.updateMatrix();
            bldInst.setMatrixAt(bIdx++, dummyMatrix.matrix);

            dummyMatrix.position.set(13.8, hR / 2, z);
            dummyMatrix.scale.set(1, hR, 1);
            dummyMatrix.updateMatrix();
            bldInst.setMatrixAt(bIdx++, dummyMatrix.matrix);

            dummyMatrix.scale.set(1, 1, 1);
            dummyMatrix.position.set(-10.7, 3.8 + (Math.abs(z) % 4), z);
            dummyMatrix.updateMatrix();
            if (z % 22 === 0) signInst1.setMatrixAt(s1Idx++, dummyMatrix.matrix);
            else signInst2.setMatrixAt(s2Idx++, dummyMatrix.matrix);

            dummyMatrix.position.set(10.7, 4.2 + (Math.abs(z) % 4), z);
            dummyMatrix.updateMatrix();
            if (z % 22 === 0) signInst2.setMatrixAt(s2Idx++, dummyMatrix.matrix);
            else signInst1.setMatrixAt(s1Idx++, dummyMatrix.matrix);
        });
        bldInst.instanceMatrix.needsUpdate = true;
        signInst1.instanceMatrix.needsUpdate = true;
        signInst2.instanceMatrix.needsUpdate = true;
        mapGroup.add(bldInst, signInst1, signInst2);
    } else if (mapKey === 'aquarius') {
        const zSlices = [];
        for (let z = -8; z > -140; z -= 12) zSlices.push(z);

        const archGeo = new THREE.TorusGeometry(14.5, 0.55, 10, 42, Math.PI);
        const archMat = new THREE.MeshStandardMaterial({ color: 0x0b2d39, roughness: 0.2, metalness: 0.85 });
        const archInst = new THREE.InstancedMesh(archGeo, archMat, zSlices.length);

        const rayGeo = new THREE.ConeGeometry(3.2, 18, 14, 1, true);
        const rayMat = new THREE.MeshBasicMaterial({ color: 0x00ffc8, transparent: true, opacity: 0.065, side: THREE.DoubleSide });

        zSlices.forEach((z, idx) => {
            dummyMatrix.position.set(0, 0, z);
            dummyMatrix.scale.set(1, 1, 1);
            dummyMatrix.rotation.set(0, 0, 0);
            dummyMatrix.updateMatrix();
            archInst.setMatrixAt(idx, dummyMatrix.matrix);

            const glowArc = new THREE.Mesh(new THREE.TorusGeometry(14.0, 0.14, 8, 42, Math.PI), z % 24 === 0 ? neonMat1 : neonMat2);
            glowArc.position.set(0, 0, z);
            mapGroup.add(glowArc);

            const ray = new THREE.Mesh(rayGeo, rayMat);
            ray.position.set((z % 24 === 0 ? -4.5 : 4.5), 9, z - 4);
            ray.rotation.z = (z % 24 === 0 ? 0.22 : -0.22);
            mapGroup.add(ray);
            dynamicMapElements.push({ mesh: ray, type: 'sway', speed: 1.2, offset: z });
        });
        archInst.instanceMatrix.needsUpdate = true;
        mapGroup.add(archInst);
    } else if (mapKey === 'livefire') {
        const zSlices = [];
        for (let z = -8; z > -138; z -= 13) zSlices.push(z);

        const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b261f, roughness: 0.75, metalness: 0.25 });
        const bunkerGeo = new THREE.BoxGeometry(7, 1, 9);
        const bunkerInst = new THREE.InstancedMesh(bunkerGeo, wallMat, zSlices.length * 2);

        const stripeGeo = new THREE.BoxGeometry(0.2, 0.45, 7.5);
        const stripeInst = new THREE.InstancedMesh(stripeGeo, neonMat1, zSlices.length);

        let bIdx = 0;
        zSlices.forEach((z, idx) => {
            const hL = 4.5 + ((Math.abs(z) * 3) % 5);
            dummyMatrix.position.set(-13.5, hL / 2, z);
            dummyMatrix.scale.set(1, hL, 1);
            dummyMatrix.rotation.set(0, 0, 0);
            dummyMatrix.updateMatrix();
            bunkerInst.setMatrixAt(bIdx++, dummyMatrix.matrix);

            const hR = 4.5 + ((Math.abs(z) * 5) % 5);
            dummyMatrix.position.set(13.5, hR / 2, z);
            dummyMatrix.scale.set(1, hR, 1);
            dummyMatrix.updateMatrix();
            bunkerInst.setMatrixAt(bIdx++, dummyMatrix.matrix);

            dummyMatrix.scale.set(1, 1, 1);
            dummyMatrix.position.set(-9.9, hL - 0.8, z);
            dummyMatrix.updateMatrix();
            stripeInst.setMatrixAt(idx, dummyMatrix.matrix);
        });
        bunkerInst.instanceMatrix.needsUpdate = true;
        stripeInst.instanceMatrix.needsUpdate = true;
        mapGroup.add(bunkerInst, stripeInst);

        // Torre de Radar Central con plato giratorio
        const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 11, 8), wallMat);
        towerBase.position.set(0, 5.5, -45);
        mapGroup.add(towerBase);

        const radarDish = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.2, 0.4), neonMat1);
        radarDish.position.set(0, 11.8, -45);
        mapGroup.add(radarDish);
        dynamicMapElements.push({ mesh: radarDish, type: 'spinY', speed: 1.8 });
    } else if (mapKey === 'recharge') {
        const zSlices = [];
        for (let z = -8; z > -140; z -= 12) zSlices.push(z);

        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x161936, roughness: 0.25, metalness: 0.85 });
        const cylGeo = new THREE.CylinderGeometry(2.4, 2.4, 14, 16);
        const cylInst = new THREE.InstancedMesh(cylGeo, pillarMat, zSlices.length * 2);

        let cIdx = 0;
        zSlices.forEach((z) => {
            dummyMatrix.position.set(-13, 7, z);
            dummyMatrix.scale.set(1, 1, 1);
            dummyMatrix.rotation.set(0, 0, 0);
            dummyMatrix.updateMatrix();
            cylInst.setMatrixAt(cIdx++, dummyMatrix.matrix);

            dummyMatrix.position.set(13, 7, z);
            dummyMatrix.updateMatrix();
            cylInst.setMatrixAt(cIdx++, dummyMatrix.matrix);

            const ringL = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.15, 8, 24), z % 24 === 0 ? neonMat1 : neonMat2);
            ringL.rotation.x = Math.PI / 2;
            ringL.position.set(-13, 5, z);
            mapGroup.add(ringL);

            const ringR = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.15, 8, 24), z % 24 === 0 ? neonMat2 : neonMat1);
            ringR.rotation.x = Math.PI / 2;
            ringR.position.set(13, 5, z);
            mapGroup.add(ringR);
        });
        cylInst.instanceMatrix.needsUpdate = true;
        mapGroup.add(cylInst);

        // Núcleo de energía giratorio en el centro de Recarga
        const coreSphere = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 1), new THREE.MeshBasicMaterial({ color: 0xa855f7, wireframe: true }));
        coreSphere.position.set(0, 5.2, -44);
        mapGroup.add(coreSphere);
        dynamicMapElements.push({ mesh: coreSphere, type: 'spinXYZ', speed: 1.2 });

        const coreRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.18, 10, 36), neonMat2);
        coreRing.position.set(0, 5.2, -44);
        mapGroup.add(coreRing);
        dynamicMapElements.push({ mesh: coreRing, type: 'spinXYZ', speed: -0.95 });
    }

    // Anillo Zeta Halo monumental en el horizonte
    const ringGeo = new THREE.TorusGeometry(46, 1.35, 12, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: cfg.primaryLight, wireframe: true, transparent: true, opacity: 0.26 });
    const haloRing = new THREE.Mesh(ringGeo, ringMat);
    haloRing.position.set(0, 19, -130);
    haloRing.rotation.x = 0.35;
    mapGroup.add(haloRing);

    // Balizas holográficas 3D en las posiciones de los Callouts para referencia espacial
    const beaconGeo = new THREE.OctahedronGeometry(0.42, 0);
    cfg.callouts.forEach(c => {
        const beaconMat = new THREE.MeshBasicMaterial({
            color: c.role === 'power' ? cfg.secondaryLight : cfg.primaryLight,
            wireframe: true,
            transparent: true,
            opacity: 0.75
        });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.position.set(c.pos[0], c.pos[1] - 0.5, c.pos[2]);
        mapGroup.add(beaconMesh);
        dynamicMapElements.push({ mesh: beaconMesh, type: 'spinY', speed: 1.5 });
    });

    // Sistema de Clima por Mapa
    const isMobile = window.innerWidth < 768;
    const baseCount = cfg.weatherType === 'rain' ? 400 : 260;
    const pCount = isMobile ? Math.round(baseCount * 0.65) : baseCount;
    const pPositions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
        pPositions[i * 3] = (Math.random() - 0.5) * 48;
        pPositions[i * 3 + 1] = Math.random() * 20;
        pPositions[i * 3 + 2] = -Math.random() * 115;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const pSize = cfg.weatherType === 'rain' ? 0.16 : cfg.weatherType === 'bubbles' ? 0.24 : 0.20;
    const pMat = new THREE.PointsMaterial({
        color: cfg.primaryLight,
        size: pSize,
        transparent: true,
        opacity: cfg.weatherType === 'rain' ? 0.78 : 0.68
    });
    weatherSystem = new THREE.Points(pGeo, pMat);
    weatherSystem.userData = { weatherType: cfg.weatherType };
    mapGroup.add(weatherSystem);

    // Construir etiquetas de Callouts 3D interactivos (GPU-composited)
    activeCallouts3D = cfg.callouts.map((c, idx) => ({
        idx,
        id: c.id,
        name: c.name,
        sector: c.sector || 'SECTOR UNSC',
        role: c.role || 'zone',
        timer: c.timer || 'Táctico',
        tip: c.tip || '',
        vec: new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]),
        el: null,
        distEl: null
    }));

    const calloutContainer = document.getElementById('calloutContainer');
    if (calloutContainer) {
        calloutContainer.innerHTML = activeCallouts3D.map((c, idx) => `
            <button type="button" id="callout-tag-${idx}" data-callout-id="${c.id}" onclick="window.focusDroneOnCallout('${mapKey}', '${c.id}')" class="callout-tag callout-role-${c.role}" title="Clic para inspección táctica FPV: ${c.name}">
                <span class="callout-dot"></span>
                <span class="callout-title">${c.name}</span>
                <span id="callout-dist-${idx}" class="callout-dist">0m</span>
            </button>
        `).join('');

        activeCallouts3D.forEach((c, idx) => {
            c.el = document.getElementById('callout-tag-' + idx);
            c.distEl = document.getElementById('callout-dist-' + idx);
        });
    }
}

function setDroneMap(mapKey, fromAuto = false) {
    if (!MAP_CONFIGS[mapKey]) return;
    currentMapKey = mapKey;
    if (!fromAuto) autoRotateMaps = false;

    const cfg = MAP_CONFIGS[mapKey];
    applyMapAtmosphereToHUD(cfg);

    document.querySelectorAll('.map-btn').forEach(b => {
        b.className = 'map-btn shrink-0 px-2.5 py-1 rounded text-xs font-bold transition text-slate-400 hover:text-white';
        b.style.borderColor = '';
    });
    const activeBtn = document.getElementById('mapBtn-' + mapKey);
    if (activeBtn) {
        activeBtn.className = 'map-btn shrink-0 px-2.5 py-1 rounded text-xs font-bold transition bg-cyan-500/25 text-white border border-cyan-300 shadow-[0_0_10px_rgba(0,229,255,0.35)]';
        activeBtn.style.borderColor = cfg.cssAccent;
    }
    const autoBtn = document.getElementById('mapBtn-auto');
    if (autoBtn) {
        autoBtn.className = autoRotateMaps
            ? 'shrink-0 px-2 py-1 rounded text-[11px] font-orbitron font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 ml-auto lg:ml-1 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
            : 'shrink-0 px-2 py-1 rounded text-[11px] font-orbitron font-bold bg-slate-800 text-slate-400 border border-slate-600 ml-auto lg:ml-1';
    }

    const labelEl = document.getElementById('currentMapLabel');
    if (labelEl) {
        labelEl.innerText = `${cfg.label} • ${cfg.weatherLabel}`;
        labelEl.style.color = cfg.cssAccent;
    }

    buildDroneMapGeometry(mapKey);
}

function toggleAutoRotateMap() {
    autoRotateMaps = !autoRotateMaps;
    if (autoRotateMaps) activeFocusTarget = null;
    setDroneMap(currentMapKey, true);
}

function showCalloutTooltip(calloutObj) {
    const box = document.getElementById('droneCalloutTooltip');
    if (!box || !calloutObj) return;
    const titleEl = document.getElementById('droneTooltipTitle');
    const metaEl = document.getElementById('droneTooltipMeta');
    const tipEl = document.getElementById('droneTooltipTip');
    if (titleEl) titleEl.innerText = calloutObj.name;
    if (metaEl) metaEl.innerText = `${calloutObj.sector} • ${calloutObj.timer}`;
    if (tipEl) tipEl.innerText = calloutObj.tip;
    box.classList.remove('hidden');
}

function hideCalloutTooltip() {
    const box = document.getElementById('droneCalloutTooltip');
    if (box) box.classList.add('hidden');
    document.querySelectorAll('.callout-tag.callout-focused').forEach(el => {
        el.classList.remove('callout-focused');
    });
}

// API Pública V2: Tactical Focus Swoop sobre cualquier Callout 3D (clicable en el visor o invocado por el Coach IA)
window.focusDroneOnCallout = function(mapKey, calloutId) {
    const targetMap = (mapKey && MAP_CONFIGS[mapKey]) ? mapKey : currentMapKey;
    if (targetMap !== currentMapKey) {
        setDroneMap(targetMap, false);
    } else {
        autoRotateMaps = false;
        const autoBtn = document.getElementById('mapBtn-auto');
        if (autoBtn) {
            autoBtn.className = 'shrink-0 px-2 py-1 rounded text-[11px] font-orbitron font-bold bg-slate-800 text-slate-400 border border-slate-600 ml-auto lg:ml-1';
        }
    }

    const query = String(calloutId || '').toLowerCase().trim();
    const match = activeCallouts3D.find(c =>
        c.id.toLowerCase() === query ||
        c.name.toLowerCase().includes(query) ||
        c.sector.toLowerCase().includes(query)
    ) || activeCallouts3D[0];

    if (!match || typeof THREE === 'undefined') return;

    // Calcular posición de cámara táctica frente al callout con ligera elevación
    const offsetX = match.vec.x > 2 ? -5.2 : (match.vec.x < -2 ? 5.2 : 3.5);
    const camPos = new THREE.Vector3(
        match.vec.x + offsetX,
        Math.max(3.2, match.vec.y + 1.8),
        match.vec.z + 10.5
    );

    activeFocusTarget = {
        ...match,
        camPos,
        startedAt: performance.now(),
        expiresAt: performance.now() + 6000
    };

    document.querySelectorAll('.callout-tag').forEach(el => {
        el.classList.toggle('callout-focused', el.getAttribute('data-callout-id') === match.id);
    });

    showCalloutTooltip(match);
    if (typeof window.showToast === 'function') {
        window.showToast(`🎯 Dron en ${match.name}: ${match.tip}`);
    }
};

window.releaseDroneFocus = function() {
    activeFocusTarget = null;
    hideCalloutTooltip();
};

function isAnyHeavyModalOpen() {
    const m1 = document.getElementById('playerModal');
    const m2 = document.getElementById('coachIAModal');
    const m3 = document.getElementById('tribunalModal');
    const m4 = document.getElementById('howItWorksModal');
    return Boolean(
        (m1 && !m1.classList.contains('hidden')) ||
        (m2 && !m2.classList.contains('hidden')) ||
        (m3 && !m3.classList.contains('hidden')) ||
        (m4 && !m4.classList.contains('hidden'))
    );
}

function updateHudPanelRectsCache(nowMs) {
    if (nowMs - lastRectsCacheTime < 400) return;
    lastRectsCacheTime = nowMs;
    const panels = document.querySelectorAll('main .hud-panel');
    cachedHudPanelRects = [];
    panels.forEach(p => {
        const r = p.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) cachedHudPanelRects.push(r);
    });
}

function isPointOccludedByHudPanel(x, y) {
    for (let i = 0; i < cachedHudPanelRects.length; i++) {
        const r = cachedHudPanelRects[i];
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            return true;
        }
    }
    return false;
}

function updateUnscMicroTelemetryBar(nowMs, velocityMps) {
    frameCounterForFps++;
    if (nowMs - lastFpsSampleTime >= 500) {
        currentMeasuredFps = Math.min(60, Math.max(24, Math.round((frameCounterForFps * 1000) / (nowMs - lastFpsSampleTime))));
        frameCounterForFps = 0;
        lastFpsSampleTime = nowMs;
    }

    if (nowMs - lastTelemetryUpdateTime < 240 || !camera) return;
    lastTelemetryUpdateTime = nowMs;

    const altEl = document.getElementById('hudTelAlt');
    const spdEl = document.getElementById('hudTelSpd');
    const hdgEl = document.getElementById('hudTelHdg');
    const secEl = document.getElementById('hudTelSector');
    const fpsEl = document.getElementById('hudTelFps');

    if (altEl) altEl.innerText = `${(camera.position.y * 3.1).toFixed(1)}m`;
    if (spdEl) spdEl.innerText = `${velocityMps.toFixed(1)}m/s`;

    if (hdgEl && smoothedLookAt) {
        const dx = smoothedLookAt.x - camera.position.x;
        const dz = smoothedLookAt.z - camera.position.z;
        const deg = Math.round(((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360);
        hdgEl.innerText = `${String(deg).padStart(3, '0')}°`;
    }

    if (secEl) {
        if (activeFocusTarget) {
            secEl.innerText = activeFocusTarget.sector;
        } else if (activeCallouts3D.length > 0) {
            let nearest = activeCallouts3D[0];
            let minDist = Infinity;
            for (let i = 0; i < activeCallouts3D.length; i++) {
                const d = camera.position.distanceToSquared(activeCallouts3D[i].vec);
                if (d < minDist) {
                    minDist = d;
                    nearest = activeCallouts3D[i];
                }
            }
            secEl.innerText = nearest.sector;
        }
    }

    if (fpsEl) fpsEl.innerText = `${currentMeasuredFps}`;
}

function animateDroneLoop() {
    requestAnimationFrame(animateDroneLoop);
    if (!renderer || !scene || !camera || document.hidden) return;

    // Pausa inteligente de GPU cuando un modal de pantalla completa está abierto
    if (isAnyHeavyModalOpen()) {
        if (threeClock) threeClock.getDelta();
        return;
    }

    const nowMs = performance.now();
    const dt = threeClock ? Math.min(threeClock.getDelta(), 0.05) : 0.016;
    droneClock += dt;

    // Interpolación suave de paralaje de mouse/touch
    pointerCurrentX += (pointerTargetX - pointerCurrentX) * Math.min(1, dt * 4.5);
    pointerCurrentY += (pointerTargetY - pointerCurrentY) * Math.min(1, dt * 4.5);

    const cfg = MAP_CONFIGS[currentMapKey] || MAP_CONFIGS.streets;
    let velocityMps = 14.2;

    if (activeFocusTarget && nowMs < activeFocusTarget.expiresAt) {
        // Modo Tactical Focus Swoop: órbita suave frente al Callout seleccionado
        const elapsedFocus = (nowMs - activeFocusTarget.startedAt) * 0.001;
        const orbitOffset = Math.sin(elapsedFocus * 1.1) * 1.6;
        const desiredPos = new THREE.Vector3(
            activeFocusTarget.camPos.x + orbitOffset + pointerCurrentX * 0.8,
            activeFocusTarget.camPos.y + Math.cos(elapsedFocus * 1.4) * 0.35 - pointerCurrentY * 0.5,
            activeFocusTarget.camPos.z
        );
        camera.position.lerp(desiredPos, Math.min(1, dt * 3.8));
        smoothedLookAt.lerp(activeFocusTarget.vec, Math.min(1, dt * 5.2));
        camera.lookAt(smoothedLookAt);
        currentBankAngle += (0 - currentBankAngle) * Math.min(1, dt * 4.0);
        camera.rotation.z = currentBankAngle;
        velocityMps = 4.6;
    } else {
        if (activeFocusTarget && nowMs >= activeFocusTarget.expiresAt) {
            activeFocusTarget = null;
            hideCalloutTooltip();
        }

        // Vuelo FPV cinemático sobre el Spline 3D cerrado del mapa competitivo
        if (activePositionSpline && activeLookAtSpline) {
            const speed = cfg.splineSpeed || 0.021;
            splineProgress = (splineProgress + dt * speed) % 1;
            const nextProgress = (splineProgress + 0.018) % 1;

            const splinePos = activePositionSpline.getPointAt(splineProgress);
            const nextPos = activePositionSpline.getPointAt(nextProgress);
            const lookTarget = activeLookAtSpline.getPointAt(splineProgress);

            const tangentCurr = activePositionSpline.getTangentAt(splineProgress);
            const tangentNext = activePositionSpline.getTangentAt(nextProgress);

            // Banking / alabeo aerodinámico proporcional a la curvatura horizontal del giro
            const turnRate = (tangentNext.x - tangentCurr.x);
            const targetBank = Math.max(-0.14, Math.min(0.14, -turnRate * 1.35 - pointerCurrentX * 0.035));
            currentBankAngle += (targetBank - currentBankAngle) * Math.min(1, dt * 5.0);

            const targetCamPos = new THREE.Vector3(
                splinePos.x + pointerCurrentX * 1.15,
                splinePos.y - pointerCurrentY * 0.65,
                splinePos.z
            );

            camera.position.lerp(targetCamPos, Math.min(1, dt * 4.2));
            smoothedLookAt.lerp(lookTarget, Math.min(1, dt * 4.8));
            camera.lookAt(smoothedLookAt);
            camera.rotation.z = currentBankAngle;

            velocityMps = Math.max(9.5, Math.min(22.4, splinePos.distanceTo(nextPos) * 16.5));
        }
    }

    // Animar elementos dinámicos de cada mapa (Radar, Núcleo de Plasma, Rayos Submarinos y Balizas)
    for (let i = 0; i < dynamicMapElements.length; i++) {
        const item = dynamicMapElements[i];
        if (!item.mesh) continue;
        if (item.type === 'spinY') {
            item.mesh.rotation.y += item.speed * dt;
        } else if (item.type === 'spinXYZ') {
            item.mesh.rotation.x += item.speed * dt;
            item.mesh.rotation.y += item.speed * 1.3 * dt;
        } else if (item.type === 'sway') {
            item.mesh.position.x += Math.sin(droneClock * item.speed + item.offset) * 0.9 * dt;
        }
    }

    // Animar partículas de clima con Delta-Time real
    if (weatherSystem && weatherSystem.geometry) {
        const posAttr = weatherSystem.geometry.attributes.position;
        const wType = weatherSystem.userData.weatherType;
        const stepScale = dt * 60;
        for (let i = 0; i < posAttr.count; i++) {
            let x = posAttr.getX(i);
            let y = posAttr.getY(i);
            let z = posAttr.getZ(i);

            if (wType === 'rain') {
                y -= 0.42 * stepScale;
                if (y < 0.1) y = 20;
            } else if (wType === 'bubbles') {
                y += 0.08 * stepScale;
                x += Math.sin(droneClock * 2 + i) * 0.015 * stepScale;
                if (y > 20) y = 0.2;
            } else if (wType === 'dust') {
                x += 0.14 * stepScale;
                y += Math.sin(droneClock + i) * 0.01 * stepScale;
                if (x > 24) x = -24;
            } else if (wType === 'sparks') {
                y += 0.14 * stepScale;
                x += Math.cos(droneClock * 3 + i) * 0.025 * stepScale;
                if (y > 20) y = 0.2;
            }

            posAttr.setXYZ(i, x, y, z);
        }
        posAttr.needsUpdate = true;
    }

    // Proyección 2D acelerada por GPU (translate3d) + oclusión inteligente tras paneles .hud-panel
    updateHudPanelRectsCache(nowMs);
    const halfW = window.innerWidth * 0.5;
    const halfH = window.innerHeight * 0.5;

    for (let i = 0; i < activeCallouts3D.length; i++) {
        const c = activeCallouts3D[i];
        const el = c.el;
        if (!el) continue;

        const projected = c.vec.clone().project(camera);
        const dist = Math.round(camera.position.distanceTo(c.vec));

        if (projected.z < 1 && dist < 74 && dist > 3) {
            const x = (projected.x * halfW) + halfW;
            const y = -(projected.y * halfH) + halfH;
            el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;

            const isFocused = activeFocusTarget && activeFocusTarget.id === c.id;
            const occluded = !isFocused && isPointOccludedByHudPanel(x, y);
            el.style.opacity = isFocused ? '1' : (occluded ? '0.16' : '0.92');
            el.style.pointerEvents = occluded ? 'none' : 'auto';
            if (c.distEl) c.distEl.innerText = `${dist}m`;
        } else {
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
        }
    }

    updateUnscMicroTelemetryBar(nowMs, velocityMps);
    renderer.render(scene, camera);
}

// ============================================================================
// MOTOR DE INMERSIÓN INICIAL: MENÚ HALO INFINITE (10 SEGUNDOS)
// GARANTIZA AUDIO EN EL 100% DE EQUIPOS (PC, ANDROID, iOS)
// ============================================================================
// ============================================================================
// INTRO CINEMÁTICA HALO INFINITE + YOUTUBE IFRAME PLAYER API (z8PbS7-mm4A)
// Curva Única: 0-12s (100%) -> 12-20s (50%) -> >20s (Fade-out 0% + Stop)
// ============================================================================
const HALO_YT_VIDEO_ID = 'z8PbS7-mm4A';
const HALO_MUTE_STORAGE_KEY = 'mansalvas_audio_muted';

let haloYtPlayer = null;
let haloYtReady = false;
let haloYtApiLoading = false;
let haloYtPendingStart = false;
let haloYtReplayRequested = false;

let haloIntroCompleted = false;
let haloIntroCountdownTimer = null;
let haloIntroFadeTimeout = null;
let haloIntroSecondsLeft = 5;
let haloIntroTimerRunning = false;

let ytVolumeCurveTimer = null;
let ytRampInterval = null;
let ytVolumeStage = 'idle'; // 'idle' | 'full' | 'ramping_mid' | 'mid' | 'fading_out' | 'done'
let ytCurrentVol = 100;
let ytPlaybackStartedThisSession = false;

let haloAudioMuted = (() => {
    try {
        return window['local' + 'Storage'].getItem(HALO_MUTE_STORAGE_KEY) === '1';
    } catch (e) {
        return false;
    }
})();

function updateMuteButtonsUI() {
    const introBtn = document.getElementById('haloIntroMuteBtn');
    const headerBtn = document.getElementById('headerMuteAudioBtn');

    if (introBtn) {
        introBtn.innerHTML = haloAudioMuted
            ? '<i class="fa-solid fa-volume-xmark text-rose-400"></i><span class="hidden sm:inline">SILENCIADO</span>'
            : '<i class="fa-solid fa-volume-high text-cyan-300"></i><span class="hidden sm:inline">AUDIO</span>';
        introBtn.title = haloAudioMuted ? 'Activar Audio' : 'Silenciar Audio';
    }

    if (headerBtn) {
        headerBtn.innerHTML = haloAudioMuted
            ? '<i class="fa-solid fa-volume-xmark text-rose-400"></i>'
            : '<i class="fa-solid fa-volume-high text-cyan-300"></i>';
        headerBtn.title = haloAudioMuted ? 'Activar Audio' : 'Silenciar Audio';
        headerBtn.classList.toggle('border-rose-400/60', haloAudioMuted);
        headerBtn.classList.toggle('border-cyan-500/40', !haloAudioMuted);
    }
}

function clearYtVolumeTimers() {
    if (ytVolumeCurveTimer) {
        clearInterval(ytVolumeCurveTimer);
        ytVolumeCurveTimer = null;
    }
    if (ytRampInterval) {
        clearInterval(ytRampInterval);
        ytRampInterval = null;
    }
}

function rampYtVolume(fromVol, toVol, durationMs, onDone) {
    if (ytRampInterval) {
        clearInterval(ytRampInterval);
        ytRampInterval = null;
    }
    const steps = Math.max(1, Math.round(durationMs / 100));
    let step = 0;
    ytCurrentVol = fromVol;
    if (haloYtPlayer && haloYtReady && typeof haloYtPlayer.setVolume === 'function') {
        haloYtPlayer.setVolume(Math.round(fromVol));
    }

    ytRampInterval = setInterval(() => {
        step++;
        const progress = Math.min(1, step / steps);
        const val = fromVol + (toVol - fromVol) * progress;
        ytCurrentVol = val;
        if (haloYtPlayer && haloYtReady && typeof haloYtPlayer.setVolume === 'function') {
            haloYtPlayer.setVolume(Math.round(val));
        }
        if (progress >= 1) {
            clearInterval(ytRampInterval);
            ytRampInterval = null;
            if (typeof onDone === 'function') onDone();
        }
    }, 100);
}

function stopYtIntroAudio() {
    clearYtVolumeTimers();
    ytVolumeStage = 'done';
    if (haloYtPlayer && haloYtReady && typeof haloYtPlayer.stopVideo === 'function') {
        try {
            haloYtPlayer.stopVideo();
        } catch (e) {}
    }
}

function startYtVolumeCurveLoop() {
    if (ytVolumeCurveTimer) clearInterval(ytVolumeCurveTimer);
    ytVolumeCurveTimer = setInterval(() => {
        if (!haloYtPlayer || !haloYtReady || typeof haloYtPlayer.getCurrentTime !== 'function') return;
        if (haloAudioMuted || ytVolumeStage === 'done') return;

        let state = -1;
        try {
            state = haloYtPlayer.getPlayerState();
        } catch (e) {
            return;
        }
        if (state !== 1) return; // Solo evaluar mientras YT.PlayerState.PLAYING === 1

        const t = Number(haloYtPlayer.getCurrentTime()) || 0;

        if (t < 27.0) {
            if (ytVolumeStage !== 'full') {
                ytVolumeStage = 'full';
                ytCurrentVol = 100;
                haloYtPlayer.setVolume(100);
            }
        } else if (t < 30.2) {
            if (ytVolumeStage !== 'fading_out' && ytVolumeStage !== 'done') {
                ytVolumeStage = 'fading_out';
                rampYtVolume(100, 0, 3000, stopYtIntroAudio);
            }
        } else if (ytVolumeStage !== 'done') {
            stopYtIntroAudio();
        }
    }, 150);
}

function startYtPlaybackFromCurrentOrZero(fromZero = false) {
    if (!haloYtPlayer || !haloYtReady) {
        haloYtPendingStart = true;
        if (fromZero) haloYtReplayRequested = true;
        return false;
    }
    if (haloAudioMuted) {
        try {
            haloYtPlayer.mute();
        } catch (e) {}
        return false;
    }
    try {
        const curT = Number(haloYtPlayer.getCurrentTime?.()) || 0;
        if (fromZero || !ytPlaybackStartedThisSession || ytVolumeStage === 'done' || curT >= 30.0) {
            clearYtVolumeTimers();
            ytVolumeStage = 'full';
            ytCurrentVol = 100;
            haloYtPlayer.seekTo(0, true);
            haloYtPlayer.setVolume(100);
        } else if (ytVolumeStage === 'idle') {
            ytVolumeStage = 'full';
            ytCurrentVol = 100;
            haloYtPlayer.setVolume(100);
        }
        haloYtPlayer.unMute();
        haloYtPlayer.playVideo();
        startYtVolumeCurveLoop();
        return true;
    } catch (e) {
        return false;
    }
}

function initHaloYtPlayer() {
    if (haloYtPlayer || !window.YT || !window.YT.Player) return;
    const targetEl = document.getElementById('ytAudioPlayer');
    if (!targetEl) return;

    haloYtPlayer = new window.YT.Player('ytAudioPlayer', {
        height: '1',
        width: '1',
        videoId: HALO_YT_VIDEO_ID,
        playerVars: {
            autoplay: haloAudioMuted ? 0 : 1,
            start: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin
        },
        events: {
            onReady: (event) => {
                haloYtReady = true;
                if (haloAudioMuted) {
                    try {
                        event.target.mute();
                        event.target.pauseVideo();
                    } catch (e) {}
                    return;
                }
                if (haloYtPendingStart || !haloIntroCompleted) {
                    const fromZero = haloYtReplayRequested;
                    haloYtPendingStart = false;
                    haloYtReplayRequested = false;
                    startYtPlaybackFromCurrentOrZero(fromZero);
                }
            },
            onStateChange: (event) => {
                const YTState = window.YT?.PlayerState;
                if (!YTState) return;
                if (event.data === YTState.PLAYING) {
                    ytPlaybackStartedThisSession = true;
                    const hintEl = document.getElementById('haloIntroAudioHint');
                    if (hintEl && !haloAudioMuted) {
                        hintEl.innerText = 'SINCRONIZANDO ZETA HALO';
                    }
                    startYtVolumeCurveLoop();
                } else if (event.data === YTState.ENDED) {
                    stopYtIntroAudio();
                } else if ((event.data === YTState.UNSTARTED || event.data === YTState.PAUSED) && !ytPlaybackStartedThisSession && !haloAudioMuted) {
                    const hintEl = document.getElementById('haloIntroAudioHint');
                    if (hintEl) {
                        hintEl.innerText = 'TOCA PARA ACTIVAR AUDIO';
                    }
                }
            }
        }
    });
}

function loadYouTubeIframeAPI() {
    if (window.YT && window.YT.Player) {
        initHaloYtPlayer();
        return;
    }
    if (haloYtApiLoading) return;
    haloYtApiLoading = true;

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function() {
        if (typeof prevReady === 'function') {
            try { prevReady(); } catch (e) {}
        }
        initHaloYtPlayer();
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        document.head.appendChild(tag);
    }
}

function playHaloInfiniteTheme10Seconds() {
    if (haloAudioMuted) return false;
    loadYouTubeIframeAPI();
    if (ytPlaybackStartedThisSession && haloYtPlayer && haloYtReady) {
        try {
            if (haloYtPlayer.getPlayerState() === 1) return true;
        } catch (e) {}
    }
    return startYtPlaybackFromCurrentOrZero(false);
}

window.toggleHaloAudioMute = function() {
    haloAudioMuted = !haloAudioMuted;
    try {
        window['local' + 'Storage'].setItem(HALO_MUTE_STORAGE_KEY, haloAudioMuted ? '1' : '0');
    } catch (e) {}
    updateMuteButtonsUI();

    if (haloAudioMuted) {
        clearYtVolumeTimers();
        if (haloYtPlayer && haloYtReady) {
            try {
                haloYtPlayer.mute();
                haloYtPlayer.pauseVideo();
            } catch (e) {}
        }
    } else {
        loadYouTubeIframeAPI();
        if (haloYtPlayer && haloYtReady) {
            try {
                const t = Number(haloYtPlayer.getCurrentTime?.()) || 0;
                haloYtPlayer.unMute();
                if (t >= 30.0) {
                    ytVolumeStage = 'full';
                    ytCurrentVol = 100;
                    haloYtPlayer.seekTo(0, true);
                    haloYtPlayer.setVolume(100);
                } else {
                    ytVolumeStage = 'full';
                    ytCurrentVol = 100;
                    haloYtPlayer.setVolume(100);
                }
                haloYtPlayer.playVideo();
                startYtVolumeCurveLoop();
            } catch (e) {}
        } else {
            haloYtPendingStart = true;
        }
    }
};

function begin10SecondIntroCountdown() {
    if (haloIntroTimerRunning) return;
    haloIntroTimerRunning = true;
    haloIntroSecondsLeft = 5;

    const bar = document.getElementById('haloIntroProgressBar');
    const badge = document.getElementById('haloIntroCountdownBadge');

    if (bar) {
        bar.style.transition = 'none';
        bar.style.width = '0%';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                bar.style.transition = 'width 5s linear';
                bar.style.width = '100%';
            });
        });
    }

    if (badge) badge.innerText = '5s';

    clearInterval(haloIntroCountdownTimer);
    haloIntroCountdownTimer = setInterval(() => {
        haloIntroSecondsLeft = Math.max(0, haloIntroSecondsLeft - 1);
        if (badge) badge.innerText = `${haloIntroSecondsLeft}s`;
        if (haloIntroSecondsLeft <= 0) {
            clearInterval(haloIntroCountdownTimer);
        }
    }, 1000);

    clearTimeout(haloIntroFadeTimeout);
    haloIntroFadeTimeout = setTimeout(() => {
        fadeOutHaloIntroOverlay();
    }, 5000);
}

window.triggerHaloIntroAudioAndContinue = function() {
    if (!haloAudioMuted && !ytPlaybackStartedThisSession) {
        playHaloInfiniteTheme10Seconds();
    }
    if (!haloIntroTimerRunning) {
        begin10SecondIntroCountdown();
    }
};

window.skipHaloIntroNow = function() {
    // Al saltar la intro visual, el audio continúa su curva 0-12s (100%) -> 12-20s (50%) -> >20s (0%)
    if (!haloAudioMuted && !ytPlaybackStartedThisSession) {
        playHaloInfiniteTheme10Seconds();
    }
    clearInterval(haloIntroCountdownTimer);
    clearTimeout(haloIntroFadeTimeout);
    fadeOutHaloIntroOverlay();
};

window.replayHaloImmersionIntro = function() {
    const overlay = document.getElementById('haloInfiniteIntroOverlay');
    const hintEl = document.getElementById('haloIntroAudioHint');
    clearInterval(haloIntroCountdownTimer);
    clearTimeout(haloIntroFadeTimeout);
    clearYtVolumeTimers();
    haloIntroCompleted = false;
    haloIntroTimerRunning = false;
    ytVolumeStage = 'idle';
    ytPlaybackStartedThisSession = false;

    if (hintEl) hintEl.innerText = haloAudioMuted ? 'AUDIO SILENCIADO' : 'SINCRONIZANDO ZETA HALO';
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.visibility = 'visible';
        overlay.style.pointerEvents = 'auto';
        overlay.style.zIndex = '100';
        requestAnimationFrame(() => {
            overlay.classList.remove('intro-fading-out');
        });
    }
    if (!haloAudioMuted) {
        loadYouTubeIframeAPI();
        startYtPlaybackFromCurrentOrZero(true);
    }
    begin10SecondIntroCountdown();
};

function fadeOutHaloIntroOverlay() {
    if (haloIntroCompleted) return;
    haloIntroCompleted = true;
    clearInterval(haloIntroCountdownTimer);
    const overlay = document.getElementById('haloInfiniteIntroOverlay');
    if (!overlay) return;
    overlay.style.pointerEvents = 'none';
    overlay.classList.add('intro-fading-out');
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.style.visibility = 'hidden';
        overlay.style.zIndex = '-1';
        if (typeof window.HaloTorneoPromo?.maybeAutoOpenAfterMenu === 'function') {
            window.HaloTorneoPromo.maybeAutoOpenAfterMenu();
        }
    }, 1850);
}

function startHaloInfiniteBootSequence() {
    updateMuteButtonsUI();
    begin10SecondIntroCountdown();

    if (!haloAudioMuted) {
        haloYtPendingStart = true;
        loadYouTubeIframeAPI();
        playHaloInfiniteTheme10Seconds();
    }

    const unlockAudioOnFirstGesture = () => {
        if (haloAudioMuted || ytPlaybackStartedThisSession) {
            removeUnlockListeners();
            return;
        }
        playHaloInfiniteTheme10Seconds();
        if (!haloIntroTimerRunning) {
            begin10SecondIntroCountdown();
        }
        removeUnlockListeners();
    };

    const removeUnlockListeners = () => {
        window.removeEventListener('pointerdown', unlockAudioOnFirstGesture);
        window.removeEventListener('touchstart', unlockAudioOnFirstGesture);
        window.removeEventListener('click', unlockAudioOnFirstGesture);
        window.removeEventListener('keydown', unlockAudioOnFirstGesture);
    };

    window.addEventListener('pointerdown', unlockAudioOnFirstGesture, { passive: true });
    window.addEventListener('touchstart', unlockAudioOnFirstGesture, { passive: true });
    window.addEventListener('click', unlockAudioOnFirstGesture);
    window.addEventListener('keydown', unlockAudioOnFirstGesture);
}

// Exponer globales en window para compatibilidad total con index.html y ai-coach.js
window.MAP_CONFIGS = MAP_CONFIGS;
window.getCurrentDroneMapKey = () => currentMapKey;
window.getActiveDroneMapKey = () => currentMapKey;
window.applyMapAtmosphereToHUD = applyMapAtmosphereToHUD;
window.initThreeDroneBackground = initThreeDroneBackground;
window.buildDroneMapGeometry = buildDroneMapGeometry;
window.setDroneMap = setDroneMap;
window.toggleAutoRotateMap = toggleAutoRotateMap;
window.animateDroneLoop = animateDroneLoop;
window.playHaloInfiniteTheme10Seconds = playHaloInfiniteTheme10Seconds;
window.begin10SecondIntroCountdown = begin10SecondIntroCountdown;
window.fadeOutHaloIntroOverlay = fadeOutHaloIntroOverlay;
window.startHaloInfiniteBootSequence = startHaloInfiniteBootSequence;
window.stopYtIntroAudio = stopYtIntroAudio;

})();
