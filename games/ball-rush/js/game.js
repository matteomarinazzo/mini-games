/**
 * Ball Rush – game.js
 *
 * Une bille avance seule sur une piste de plateformes en perspective 3D simulée
 * (point de fuite au milieu de l'écran). Le joueur ne gère que le déplacement latéral ;
 * la bille saute automatiquement au bord de chaque plateforme.
 *
 * Organisation du fichier :
 *   1. CONFIG            – tous les paramètres à ajuster
 *   2. ÉTAT / DOM / CACHE
 *   3. GÉNÉRATION        – création des plateformes (séquences toujours jouables)
 *   4. MISE À JOUR       – physique, saut automatique, collisions
 *   5. RENDU             – projection perspective, plateformes, ombres, bille, ciel
 *   6. CONTRÔLES         – clavier, glisser tactile, jauge
 *   7. FLUX DE JEU       – démarrage, pause, fin de partie
 *   8. RECORDS           – cache local "Ball-Rush" + record mondial Firebase
 *
 * Unités du monde : 1 unité ≈ 1 mètre. x = latéral, y = hauteur, z = profondeur (avance).
 */

// ─────────────────────────────────────────────
// 1. CONFIG  (valeurs à ajuster)
// ─────────────────────────────────────────────

// -- Vitesse ------------------------------------------------------
const BASE_SPEED = 9;            // vitesse d'avance au départ (unités/s)
const SPEED_PER_PLATFORM = 0.35;  // gain de vitesse à chaque plateforme franchie
const MAX_SPEED = 9999;            // vitesse maximale

// -- Contrôle latéral ---------------------------------------------
const LAT_SPEED = 13;            // vitesse latérale max de la bille (unités/s)
const TRACK_HALF = 10;          // la bille ne peut pas dépasser ±TRACK_HALF
const DRAG_GAIN = 1.3;           // sensibilité du glisser tactile (1 = 1:1 avec le doigt)

// -- Saut ---------------------------------------------------------
const JUMP_HEIGHT = 1.5;         // hauteur du saut (unités) – purement visuelle
const JUMP_TIME = 0.55;          // durée d'un saut en secondes (distance sautée = vitesse × durée)

// -- Plateformes --------------------------------------------------
const PLATFORM_W_START = 6.5;    // largeur des premières plateformes
const PLATFORM_W_MIN = 1.0;      // largeur minimale (fin de progression)
const WIDTH_SHRINK_PLATFORMS = 200; // nb de plateformes pour atteindre la largeur minimale
const PLATFORM_THICK = 0.7;      // épaisseur visuelle
const PLATFORM_X_LIMIT = 5.0;    // décalage max du centre d'une plateforme par rapport à la piste

// -- Difficulté (trous) -------------------------------------------
// Le trou est exprimé en fraction de la distance de saut (vitesse × JUMP_TIME).
// Toujours < 1 : le saut franchit donc toujours le trou si la bille est alignée.
const DIFFICULTY_RAMP = 80;      // nb de plateformes pour atteindre la difficulté maximale
const GAP_MIN_START = 0.22, GAP_MIN_END = 0.42;
const GAP_MAX_START = 0.42, GAP_MAX_END = 0.72;   // ne jamais dépasser ~0.8

// -- Plateformes mobiles (introduites progressivement) ------------
const MOVING_START = 5;          // aucune plateforme mobile avant celle-ci
const MOVING_CHANCE_MAX = 100;   // fréquence maximale (0 à 1)
const MOVING_RAMP = 20;          // nb de plateformes pour atteindre la fréquence max
const MOVING_AMP_START = 0.8;    // amplitude latérale au début (unités)
const MOVING_AMP_END = 4.0;      // amplitude latérale max
const MOVING_OMEGA_MIN = 1.2, MOVING_OMEGA_MAX = 3.5; // rad/s – vitesse d'oscillation

// -- Caméra / perspective -----------------------------------------
const CAM_BACK = 6;              // distance caméra → bille
const CAM_H = 4.2;               // hauteur de la caméra
const BALL_SCREEN_Y = 0.78;      // position verticale de la bille à l'écran (0 haut → 1 bas)
const BALL_R = 0.5;              // rayon de la bille
const NEAR = 0.35;               // plan proche (évite la division par zéro)
const VIEW_DIST = 110;           // distance de génération devant la bille
const FOG_START = 40, FOG_END = 105; // les plateformes lointaines se fondent dans le ciel
const FALL_DEPTH = 9;            // profondeur de chute avant « Partie terminée »

// -- Records ------------------------------------------------------
const CACHE_KEY = 'ball-rush';        // clé du cache local (meilleur score, record mondial, message)
const FB_GAME = 'ball_rush';         // nœud Firebase
const FB_KEY = 'score';      // record = nombre de plateformes sautées

// ─────────────────────────────────────────────
// Physique dérivée du saut (ne pas toucher)
// ─────────────────────────────────────────────
const GRAVITY = 8 * JUMP_HEIGHT / (JUMP_TIME * JUMP_TIME);
const JUMP_VY = 4 * JUMP_HEIGHT / JUMP_TIME;

// ─────────────────────────────────────────────
// 2. ÉTAT / DOM / CACHE
// ─────────────────────────────────────────────
let state = 'ready';     // ready | running | paused | over
let score = 0;           // nombre de plateformes sautées
let lastIdx = 0;         // index de la dernière plateforme où la bille a atterri
let speed = BASE_SPEED;
let t = 0;               // temps de jeu (hors pause) – anime les plateformes mobiles
let lastTime = 0;
let platforms = [];
let nextIdx = 1;
let ball = { x: 0, y: 0, z: 2, vy: 0, grounded: true, support: null, squash: 0 };
let camX = 0, camZ = 0;
let lastDist = -1;

let pendingRecord = null;
let worldBest = 0;
let bestScore = 0;
let cache = loadCache();
bestScore = cache.best || 0;
worldBest = cache.worldBest || 0;

// Modules en ligne (Firebase / réseau) : chargés sans bloquer le jeu
let fb = null, net = null;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const skyCanvas = document.getElementById('skyCanvas');
const skyCtx = skyCanvas.getContext('2d');

const $ = (id) => document.getElementById(id);
const scoreValueEl = $('scoreValue'), scoreDelta = $('scoreDelta');
const bestValEl = $('bestVal'), distValEl = $('distVal'), tapHint = $('tapHint');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay');
const pauseOverlay = $('pauseOverlay'), gameoverOverlay = $('gameoverOverlay');
const recordsOverlay = $('recordsOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}
function saveCache(patch) {
    cache = { ...cache, ...patch };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* stockage indisponible */ }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rand = (a, b) => a + Math.random() * (b - a);

// ─────────────────────────────────────────────
// 3. GÉNÉRATION DES PLATEFORMES
// ─────────────────────────────────────────────
// Garanties de jouabilité :
//  - speedAt(i) = vitesse de la bille quand elle est sur la plateforme i (elle ne dépend que de i).
//  - le trou entre i et i+1 vaut au plus 0.72 × (speedAt(i) × JUMP_TIME) < distance de saut ;
//  - chaque plateforme est assez longue pour accueillir l'atterrissage ET précéder le saut suivant ;
//  - le décalage latéral entre deux plateformes consécutives est borné : la bille (vitesse latérale
//    13 u/s, contrôlable en l'air) a largement le temps de se placer.
function speedAt(i) { return Math.min(MAX_SPEED, BASE_SPEED + i * SPEED_PER_PLATFORM); }
function difficulty(i) { return Math.min(1, i / DIFFICULTY_RAMP); }

function makeFirstPlatform() {
    return { idx: 0, z0: 0, z1: 16, cx: 0, w: 7, moving: false, amp: 0, omega: 0, phase: 0 };
}

function spawnPlatform() {
    const prev = platforms[platforms.length - 1];
    const idx = nextIdx++;
    const d = difficulty(idx);

    // Trou (en unités), proportionnel à la distance de saut depuis la plateforme précédente
    const reachPrev = speedAt(prev.idx) * JUMP_TIME;
    const gap = reachPrev * rand(lerp(GAP_MIN_START, GAP_MIN_END, d), lerp(GAP_MAX_START, GAP_MAX_END, d));

    // Longueur : couvre l'atterrissage (reachPrev - gap) puis la course avant le saut suivant
    const reachNext = speedAt(idx) * JUMP_TIME;
    const len = reachNext * rand(1.1, 1.1) + 1;

    // Largeur : diminue avec la progression
    const wBase = lerp(PLATFORM_W_START, PLATFORM_W_MIN, Math.min(1, idx / WIDTH_SHRINK_PLATFORMS));
    const w = Math.max(PLATFORM_W_MIN, wBase * rand(0.92, 1.1));

    // Plateforme mobile ? (progressive, jamais deux de suite sauf rarement)
    let moving = false;
    if (idx >= MOVING_START) {
        const chance = MOVING_CHANCE_MAX * Math.min(1, (idx - MOVING_START) / MOVING_RAMP);
        moving = Math.random() < chance && (!prev.moving || Math.random() < 0.35);
    }
    const amp = moving ? lerp(MOVING_AMP_START, MOVING_AMP_END, d) * rand(0.8, 1.0) : 0;

    // Décalage latéral borné (plus strict si l'une des deux bouge)
    let maxDx = ((w + prev.w) / 2) * 0.55 + 0.5;
    if (moving || prev.moving) maxDx *= 0.7;
    const cx = clamp(prev.cx + rand(-maxDx, maxDx), -PLATFORM_X_LIMIT, PLATFORM_X_LIMIT);

    platforms.push({
        idx, z0: prev.z1 + gap, z1: prev.z1 + gap + len, cx, w,
        moving, amp, omega: rand(MOVING_OMEGA_MIN, MOVING_OMEGA_MAX), phase: rand(0, Math.PI * 2)
    });
}

function fillAhead() {
    while (platforms[platforms.length - 1].z0 < ball.z + VIEW_DIST) spawnPlatform();
    // Nettoyage des plateformes derrière la caméra (on garde toujours le support de la bille)
    while (platforms.length > 2 && platforms[0].z1 < ball.z - CAM_BACK - 6 && platforms[0] !== ball.support) {
        platforms.shift();
    }
}

function platX(p) { return p.moving ? p.cx + p.amp * Math.sin(t * p.omega + p.phase) : p.cx; }

// Plateforme sous (x, z) – tolérance latérale légère pour un jeu indulgent
function platformAt(x, z) {
    for (const p of platforms) {
        if (z >= p.z0 && z <= p.z1 && Math.abs(x - platX(p)) <= p.w / 2 + BALL_R * 0.5) return p;
    }
    return null;
}

// ─────────────────────────────────────────────
// 4. MISE À JOUR (physique + collisions)
// ─────────────────────────────────────────────
function update(dt) {
    t += dt;

    // Vitesse d'avance : suit speedAt(score) en douceur
    speed += (speedAt(score) - speed) * Math.min(1, dt * 3);

    // Déplacement latéral
    if (steerTarget !== null) {
        const step = LAT_SPEED * 1.3 * dt;
        ball.x += clamp(steerTarget - ball.x, -step, step);
    } else {
        const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        ball.x += dir * LAT_SPEED * dt;
    }
    ball.x = clamp(ball.x, -TRACK_HALF, TRACK_HALF);

    // Avance automatique
    ball.z += speed * dt;

    if (ball.grounded) {
        const sp = ball.support;
        if (ball.z >= sp.z1 - 0.05) {
            // Bord de la plateforme → saut automatique
            ball.grounded = false;
            ball.vy = JUMP_VY;
            ball.y = 0.001;
        } else if (Math.abs(ball.x - platX(sp)) > sp.w / 2 + BALL_R * 0.5) {
            // Sorti par le côté → chute
            ball.grounded = false;
            ball.vy = 0;
            ball.support = null;
        }
    } else {
        const prevY = ball.y;
        ball.vy -= GRAVITY * dt;
        ball.y += ball.vy * dt;

        // Atterrissage : on traverse y = 0 en descendant
        if (ball.vy <= 0 && prevY >= 0 && ball.y <= 0) {
            const p = platformAt(ball.x, ball.z);
            if (p) land(p);
        }
        if (ball.y < -FALL_DEPTH) { gameOver(); return; }
    }

    ball.squash = Math.max(0, ball.squash - dt * 5);
    fillAhead();

    const dist = Math.max(0, Math.floor(ball.z - 2));
    if (dist !== lastDist) { lastDist = dist; distValEl.textContent = dist; }
}

function land(p) {
    ball.y = 0; ball.vy = 0; ball.grounded = true; ball.support = p; ball.squash = 1;
    if (p.idx > lastIdx) {
        lastIdx = p.idx;
        score = p.idx;
        scoreValueEl.textContent = score;
        scoreValueEl.classList.add('score-up');
        setTimeout(() => scoreValueEl.classList.remove('score-up'), 220);
        scoreDelta.textContent = '+1';
        scoreDelta.classList.remove('show'); void scoreDelta.offsetWidth; scoreDelta.classList.add('show');
        if (score % 5 === 0) drawSky();
    }
}

// ─────────────────────────────────────────────
// 5. RENDU
// ─────────────────────────────────────────────
let W = 0, H = 0, dpr = 1, F = 300, horizonY = 300;

function resizeAll() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    skyCanvas.width = Math.round(window.innerWidth * dpr); skyCanvas.height = Math.round(window.innerHeight * dpr);
    // Focale : la bille reste dans la partie basse de l'écran, piste lisible en portrait comme en paysage
    F = Math.min(H * 0.56, W * 0.75);
    horizonY = H * BALL_SCREEN_Y - CAM_H * F / CAM_BACK;
    drawSky();
}

// Projection perspective : plus z est grand (loin), plus l'objet est petit et proche du point de fuite
function proj(x, y, z) {
    const d = Math.max(z - camZ, NEAR);
    const s = F / d;
    return { x: W / 2 + (x - camX) * s, y: horizonY + (CAM_H - y) * s, s, d };
}

function drawSky() {
    const w = skyCanvas.width, h = skyCanvas.height;
    skyCtx.setTransform(1, 0, 0, 1, 0, 0);
    const alt = Math.min(score / 60, 1);  // le ciel s'assombrit avec la progression
    const c = (a, b) => ~~lerp(a, b, alt);
    const g = skyCtx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, `rgb(${c(28, 2)},${c(75, 7)},${c(155, 18)})`);
    g.addColorStop(.5, `rgb(${c(8, 2)},${c(38, 5)},${c(95, 13)})`);
    g.addColorStop(1, `rgb(${c(2, 1)},${c(9, 3)},${c(26, 7)})`);
    skyCtx.fillStyle = g; skyCtx.fillRect(0, 0, w, h);
}

function buildStars() {
    document.querySelectorAll('.star').forEach(s => s.remove());
    for (let i = 0; i < 55; i++) {
        const s = document.createElement('div'); s.className = 'star';
        const size = Math.random() * 2.2 + .4;
        s.style.cssText = `width:${size}px;height:${size}px;top:${Math.random() * 55}%;left:${Math.random() * 100}%;` +
            `--op1:${(.3 + Math.random() * .6).toFixed(2)};--op2:${(Math.random() * .15).toFixed(2)};` +
            `--tw:${(2 + Math.random() * 4).toFixed(1)}s;animation-delay:${(Math.random() * 4).toFixed(1)}s;`;
        document.body.appendChild(s);
    }
}

function poly(pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}

// Lignes de fuite + repères de profondeur : renforcent la sensation de perspective et de vitesse
function drawGuides() {
    const yG = -3, zFar = camZ + VIEW_DIST, zNear = camZ + NEAR + 0.5;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(91,200,245,.10)';
    ctx.beginPath();
    for (let gx = -12; gx <= 12; gx += 4) {
        const a = proj(gx, yG, zNear), b = proj(gx, yG, zFar);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    const step = 6;
    for (let z = Math.ceil(zNear / step) * step; z < zFar; z += step) {
        const a = proj(-12, yG, z), b = proj(12, yG, z);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
}

function drawPlatform(p) {
    if (p.z1 <= camZ + NEAR) return;
    const nearZ = Math.max(p.z0, camZ + NEAR);
    const fog = clamp(1 - (nearZ - camZ - FOG_START) / (FOG_END - FOG_START), 0, 1);
    if (fog <= 0.01) return;

    const cx = platX(p), x0 = cx - p.w / 2, x1 = cx + p.w / 2, T = PLATFORM_THICK;
    const hue = (p.idx * 14) % 360;
    const cTop = `hsl(${hue},65%,62%)`, cFront = `hsl(${hue},65%,44%)`, cSide = `hsl(${hue},65%,33%)`;

    ctx.globalAlpha = fog;

    // Faces latérales visibles selon la position de la caméra
    if (camX < x0) poly([proj(x0, 0, nearZ), proj(x0, 0, p.z1), proj(x0, -T, p.z1), proj(x0, -T, nearZ)], cSide);
    if (camX > x1) poly([proj(x1, 0, nearZ), proj(x1, 0, p.z1), proj(x1, -T, p.z1), proj(x1, -T, nearZ)], cSide);
    // Face avant
    if (p.z0 > camZ + NEAR) poly([proj(x0, 0, p.z0), proj(x1, 0, p.z0), proj(x1, -T, p.z0), proj(x0, -T, p.z0)], cFront);
    // Dessus (contour clair et épais pour les plateformes mobiles)
    poly([proj(x0, 0, nearZ), proj(x1, 0, nearZ), proj(x1, 0, p.z1), proj(x0, 0, p.z1)],
        cTop, 'rgba(255,255,255,.22)', 1);

    ctx.globalAlpha = 1;
}

function drawBall() {
    const R = BALL_R;
    // Ombre au sol : visible uniquement au-dessus d'une plateforme
    if (ball.y >= 0) {
        const sup = ball.grounded ? ball.support : platformAt(ball.x, ball.z);
        if (sup) {
            const s = proj(ball.x, 0, ball.z);
            const k = clamp(1 - ball.y / (JUMP_HEIGHT * 2.2), 0.2, 1);
            const rx = R * s.s * (0.7 + 0.5 * k);
            ctx.fillStyle = `rgba(0,10,25,${0.45 * k})`;
            ctx.beginPath(); ctx.ellipse(s.x, s.y, rx, rx * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        }
    }
    const c = proj(ball.x, ball.y + R, ball.z);
    const r = R * c.s;
    const sq = ball.squash;
    const rx = r * (1 + 0.22 * sq), ry = r * (1 - 0.22 * sq);
    const cy = c.y + (r - ry);   // la bille écrasée reste posée sur la plateforme

    const g = ctx.createRadialGradient(c.x - rx * .35, cy - ry * .35, r * .1, c.x, cy, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.45, '#5bc8f5'); g.addColorStop(1, '#0a4f7a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(c.x, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,20,40,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
}

function drawFrame() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Lueur d'horizon
    const hg = ctx.createLinearGradient(0, horizonY - 50, 0, horizonY + 60);
    hg.addColorStop(0, 'rgba(91,200,245,0)'); hg.addColorStop(.5, 'rgba(91,200,245,.10)'); hg.addColorStop(1, 'rgba(91,200,245,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, horizonY - 50, W, 110);

    drawGuides();
    for (let i = platforms.length - 1; i >= 0; i--) drawPlatform(platforms[i]);   // du plus loin au plus proche
    drawBall();
}

function updateCamera(dt) {
    camX += (ball.x * 0.55 - camX) * Math.min(1, dt * 5);
    camZ = ball.z - CAM_BACK;
}

// ─────────────────────────────────────────────
// 6. CONTRÔLES
// ─────────────────────────────────────────────
const keys = { left: false, right: false };
let steerTarget = null;          // position x visée (glisser / jauge) ; null = pas de pilotage tactile

const LEFT_KEYS = ['arrowleft', 'a', 'q'];    // 'q' = A sur clavier AZERTY (ZQSD)
const RIGHT_KEYS = ['arrowright', 'd'];

document.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (LEFT_KEYS.includes(k)) { keys.left = true; steerTarget = null; e.preventDefault(); }
    else if (RIGHT_KEYS.includes(k)) { keys.right = true; steerTarget = null; e.preventDefault(); }
    else if (k === 'escape') { state === 'running' ? pauseGame() : (state === 'paused' && resumeGame()); }
    else if (k === 'enter' && state === 'ready' && startOverlay.classList.contains('open')) startGame();
});
document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (LEFT_KEYS.includes(k)) keys.left = false;
    if (RIGHT_KEYS.includes(k)) keys.right = false;
});

// Glisser sur le canvas (doigt ou souris) : déplacement relatif
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'running') return;
    canvas.setPointerCapture(e.pointerId);
    drag = { px: e.clientX, bx: ball.x };
    steerTarget = ball.x;
    tapHint.classList.add('hidden');
});
canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const unitsPerPx = CAM_BACK / F;   // 1 px à la profondeur de la bille = unitsPerPx unités
    steerTarget = clamp(drag.bx + (e.clientX - drag.px) * unitsPerPx * DRAG_GAIN, -TRACK_HALF, TRACK_HALF);
});
const endDrag = () => { drag = null; steerTarget = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// Aucun défilement / zoom de page pendant les gestes tactiles
['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

// ─────────────────────────────────────────────
// 7. FLUX DE JEU
// ─────────────────────────────────────────────
function resetWorld() {
    platforms = [makeFirstPlatform()];
    nextIdx = 1;
    score = 0; lastIdx = 0; speed = BASE_SPEED; t = 0; lastDist = -1;
    ball = { x: 0, y: 0, z: 2, vy: 0, grounded: true, support: platforms[0], squash: 0 };
    camX = 0; camZ = ball.z - CAM_BACK;
    steerTarget = null; keys.left = keys.right = false;
    fillAhead();
    scoreValueEl.textContent = '0'; distValEl.textContent = '0';
    bestValEl.textContent = bestScore;
    drawSky();
}

function closeOverlays() {
    [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay].forEach(o => o.classList.remove('open'));
}

function startGame() {
    closeOverlays();
    resetWorld();
    state = 'running';
    tapHint.classList.remove('hidden');
    setTimeout(() => tapHint.classList.add('hidden'), 4000);
    lastTime = performance.now();
}

function pauseGame(openPauseModal = true) {
    if (state !== 'running') return;
    state = 'paused';
    if (openPauseModal) pauseOverlay.classList.add('open');
}

function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    state = 'running';
    lastTime = performance.now();
}

function showReady() {
    closeOverlays();
    resetWorld();
    state = 'ready';
    startOverlay.classList.add('open');
}

async function gameOver() {
    if (state !== 'running') return;
    state = 'over';
    steerTarget = null; drag = null;

    canvas.classList.add('shake');
    setTimeout(() => canvas.classList.remove('shake'), 400);

    // Meilleur score personnel (cache local)
    const isPersonalBest = score > bestScore;
    if (isPersonalBest) { bestScore = score; saveCache({ best: bestScore }); }
    bestValEl.textContent = bestScore;

    // Record mondial : on resynchronise avant de comparer (avec délai max)
    let isWorldRecord = false;
    if (score > 0) {
        const online = await Promise.race([isOnline(), wait(2500, false)]);
        if (online) {
            await Promise.race([refreshWorldRecord(), wait(2500)]);
            if (score > worldBest) { isWorldRecord = true; worldBest = score; }
        }
    }
    pendingRecord = isWorldRecord ? { score } : null;

    const dist = Math.max(0, Math.floor(ball.z - 2));
    $('goEmoji').textContent = (isPersonalBest || isWorldRecord) ? '🏆' : '💀';
    $('goTitle').textContent = isWorldRecord ? 'Record mondial !' : isPersonalBest ? 'Nouveau record !' : 'Partie terminée';
    $('goScore').textContent = score;
    $('goBest').textContent = bestScore;
    $('goDist').textContent = dist;

    setTimeout(() => {
        if (pendingRecord) {
            recordMessagePopup.style.display = 'flex';
            recordMsgInput.value = ''; recordCharCounter.textContent = '0/50';
            setTimeout(() => recordMsgInput.focus(), 100);
        } else {
            gameoverOverlay.classList.add('open');
        }
    }, 500);
}

// Pause automatique quand l'onglet / la fenêtre perd le focus
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', pauseGame);

// Boucle principale
function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);   // plafonné : évite les sauts après un lag
    lastTime = now;
    if (state === 'running') update(dt);
    updateCamera(state === 'running' ? dt : 1 / 60);
    drawFrame();
    requestAnimationFrame(loop);
}

// ─────────────────────────────────────────────
// 8. RECORDS (cache local "Ball-Rush" + Firebase)
// ─────────────────────────────────────────────
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));

async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}

// Charge le record mondial depuis Firebase et le met en cache (silencieux hors ligne)
async function refreshWorldRecord() {
    try {
        if (!fb || !(await isOnline())) return;
        const data = await fb.getFirebaseRecordData(FB_GAME, FB_KEY);
        const value = (data && typeof data === 'object') ? (data.value || 0) : (data || 0);
        worldBest = value;
        saveCache({ worldBest: value, worldMsg: (data && data.message) || '' });
    } catch (e) { console.error('Firebase records error:', e); }
}

// Import dynamique : si Firebase est inaccessible (hors ligne), le jeu fonctionne quand même
async function initOnline() {
    try {
        [fb, net] = await Promise.all([
            import('../../../js/firebaseWrk.js'),
            import('../../../js/network.js')
        ]);
        await refreshWorldRecord();
    } catch (e) { console.warn('Mode hors ligne :', e); }
}

// Écrans Records
$('recordsBtn').addEventListener('click', async () => {
    if (state === 'over') return;
    pauseGame();
    recordsOverlay.classList.add('open');
    $('recPersonalScore').textContent = bestScore;
    $('recGlobalScore').textContent = worldBest;
    $('recStatus').textContent = 'Synchronisation...';

    const card = $('recGlobalScore').closest('.record-card');
    card.querySelectorAll('.rc-message').forEach(m => m.remove());
    const addMsg = (msg) => {
        if (!msg) return;
        const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${msg} »`; card.appendChild(m);
    };
    try {
        if (fb && await isOnline()) {
            const data = await fb.getFirebaseRecordData(FB_GAME, FB_KEY);
            const value = (data && typeof data === 'object') ? (data.value || 0) : (data || 0);
            worldBest = value;
            saveCache({ worldBest: value, worldMsg: (data && data.message) || '' });
            $('recGlobalScore').textContent = value;
            addMsg(data && data.message);
            $('recStatus').textContent = 'À jour (Cloud)';
        } else {
            addMsg(cache.worldMsg);
            $('recStatus').textContent = 'Hors ligne (Records locaux)';
        }
    } catch (e) {
        console.error('Firebase records error:', e);
        addMsg(cache.worldMsg);
        $('recStatus').textContent = 'Erreur de connexion';
    }
});
$('recordsClose').addEventListener('click', () => recordsOverlay.classList.remove('open'));
recordsOverlay.addEventListener('click', (e) => { if (e.target === recordsOverlay) recordsOverlay.classList.remove('open'); });

// Popup « nouveau record mondial » : sauvegarde du message
saveRecordMsgBtn.addEventListener('click', async () => {
    if (!pendingRecord) return;
    const message = recordMsgInput.value.trim().substring(0, 50);
    saveRecordMsgBtn.disabled = true;
    saveRecordMsgBtn.textContent = 'Enregistrement...';
    try {
        await fb.setFirebaseLeaderboard(FB_GAME, FB_KEY, { value: pendingRecord.score, message, timestamp: Date.now() });
        saveCache({ worldBest: pendingRecord.score, worldMsg: message });
    } catch (e) { console.error('Error saving record message:', e); }
    saveRecordMsgBtn.disabled = false;
    saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'none';
    gameoverOverlay.classList.add('open');
    pendingRecord = null;
});
recordMsgInput.addEventListener('input', () => { recordCharCounter.textContent = `${recordMsgInput.value.length}/50`; });

// Boutons
$('playBtn').addEventListener('click', startGame);
$('rulesBtn').addEventListener('click', () => { pauseGame(false); rulesOverlay.classList.add('open'); });
$('rulesClose').addEventListener('click', () => { rulesOverlay.classList.remove('open'); resumeGame(); });
rulesOverlay.addEventListener('click', (e) => { if (e.target === rulesOverlay) rulesOverlay.classList.remove('open'); });
$('pauseBtn').addEventListener('click', pauseGame);
$('resumeBtn').addEventListener('click', resumeGame);
$('restartPauseBtn').addEventListener('click', startGame);
$('menuPauseBtn').addEventListener('click', () => { window.location.href = '../../index.html'; });
$('goRestartBtn').addEventListener('click', startGame);
$('goMenuBtn').addEventListener('click', () => { window.location.href = '../../index.html'; });

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
window.addEventListener('resize', resizeAll);
resizeAll();
buildStars();
resetWorld();
lastTime = performance.now();
requestAnimationFrame(loop);
initOnline();   // en arrière-plan, sans bloquer le jeu
