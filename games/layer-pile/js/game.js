/**
 * Layer Pile – game.js  (v2 – moteur Canvas Isométrique)
 *
 * Vue de dessus à ~70° (projection isométrique classique Stack)
 * Les blocs sont des rectangles 3D vus de haut.
 * Alternance de l'axe d'oscillation : pair=X (gauche-droite), impair=Z (avant-arrière en iso)
 * Logique de découpe correcte sur chaque axe indépendamment.
 */
import { setFirebaseLeaderboard, getFirebaseLeaderboard, getFirebaseRecordData } from "../../../js/firebaseWrk.js"
import { checkRealConnection } from "../../../js/network.js"

let best_score_ever = await getFirebaseLeaderboard("layer_pile", "best_score")
let best_layer_ever = await getFirebaseLeaderboard("layer_pile", "best_layer")

'use strict';

// ─────────────────────────────────────────────
// AUDIO ENGINE
// ─────────────────────────────────────────────
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function masterOut(ctx, gain = 1.0) {
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(ctx.destination);
    return g;
}

function playGameSound(type) {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    if (type === "drop") {
        const out = masterOut(ctx, 1.8);

        // Impact principal
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain); gain.connect(out);
        osc.start(now); osc.stop(now + 0.12);

        // Petit click en plus
        const click = ctx.createOscillator();
        const clickGain = ctx.createGain();

        click.type = "square";
        click.frequency.setValueAtTime(900, now);
        clickGain.gain.setValueAtTime(0.25, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        click.connect(clickGain); clickGain.connect(out);
        click.start(now); click.stop(now + 0.05);
    }

    else if (type === "perfect") {
        const out = masterOut(ctx, 1.6);
        const t = now;

        // ───────────────────────────────
        // 1) Note principale (montée)
        // ───────────────────────────────
        const osc1 = ctx.createOscillator();
        const g1 = ctx.createGain();

        osc1.type = "sine";
        osc1.frequency.setValueAtTime(650, t);
        osc1.frequency.exponentialRampToValueAtTime(1500, t + 0.18);

        g1.gain.setValueAtTime(0.9, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc1.connect(g1); g1.connect(out);
        osc1.start(t); osc1.stop(t + 0.22);

        // ───────────────────────────────
        // 2) Harmonic sparkle (petit tintement aigu)
        // ───────────────────────────────
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();

        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(1800, t + 0.02);
        osc2.frequency.exponentialRampToValueAtTime(2600, t + 0.12);

        g2.gain.setValueAtTime(0.4, t + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

        osc2.connect(g2); g2.connect(out);
        osc2.start(t + 0.02); osc2.stop(t + 0.14);

        // ───────────────────────────────
        // 3) Petit "ding" très court (attaque brillante)
        // ───────────────────────────────
        const osc3 = ctx.createOscillator();
        const g3 = ctx.createGain();

        osc3.type = "square";
        osc3.frequency.setValueAtTime(2400, t);
        g3.gain.setValueAtTime(0.25, t);
        g3.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

        osc3.connect(g3); g3.connect(out);
        osc3.start(t); osc3.stop(t + 0.05);
    }

    else if (type === "gameover") {
        const out = masterOut(ctx, 1.8);

        // Whoosh (bruit blanc filtré)
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = buf;

        const hp = ctx.createBiquadFilter();
        hp.type = "highpass"; hp.frequency.value = 400;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        src.connect(hp); hp.connect(gain); gain.connect(out);
        src.start(now); src.stop(now + 0.4);

        // Impact grave
        const osc = ctx.createOscillator();
        const g2 = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(90, now + 0.05);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);

        g2.gain.setValueAtTime(1.0, now + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc.connect(g2); g2.connect(out);
        osc.start(now + 0.05); osc.stop(now + 0.3);
    }
}

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const BASE_BW = 180;   // largeur initiale bloc (axe X monde)
const BASE_BD = 180;   // profondeur initiale bloc (axe Z monde)
const BLOCK_H_3D = 26;    // hauteur visuelle du bloc en px écran
const PERFECT_TOL = 7;     // px tolérance "parfait"
const BASE_SPEED = 4;
const SPEED_INC = 0.12;
const MAX_SPEED = 100.0;

const POINTS_PERFECT = 100;
const POINTS_BASE = 35;
const POINTS_PENALTY = -15;

// Palette de couleurs (par étage, cycle)
const BLOCK_COLORS_OLD = [
    { top: '#42a5f5', front: '#1565c0', side: '#0d47a1' },
    { top: '#26c6da', front: '#00838f', side: '#005662' },
    { top: '#66bb6a', front: '#2e7d32', side: '#1b5e20' },
    { top: '#ffca28', front: '#f57f17', side: '#bf360c' },
    { top: '#ef5350', front: '#c62828', side: '#7f0000' },
    { top: '#ba68c8', front: '#6a1b9a', side: '#4a148c' },
    { top: '#4fc3f7', front: '#0277bd', side: '#01579b' },
    { top: '#4db6ac', front: '#00695c', side: '#004d40' },
    { top: '#aed581', front: '#558b2f', side: '#33691e' },
    { top: '#ffb74d', front: '#e65100', side: '#bf360c' },
];

function hsvToRgb(h, s, v) {
    let f = (n, k = (n + h / 60) % 6) =>
        v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);

    return {
        r: Math.round(f(5) * 255),
        g: Math.round(f(3) * 255),
        b: Math.round(f(1) * 255)
    };
}

function generateRainbow(n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
        const h = (i / n) * 360;

        const topRGB = hsvToRgb(h, 0.6, 1);
        const frontRGB = hsvToRgb(h, 0.6, 0.75);
        const sideRGB = hsvToRgb(h, 0.6, 0.55);

        arr.push({
            top: `rgb(${topRGB.r},${topRGB.g},${topRGB.b})`,
            front: `rgb(${frontRGB.r},${frontRGB.g},${frontRGB.b})`,
            side: `rgb(${sideRGB.r},${sideRGB.g},${sideRGB.b})`
        });
    }
    return arr;
}

const BLOCK_COLORS = generateRainbow(120);


// ─────────────────────────────────────────────
// PROJECTION ISO
// ─────────────────────────────────────────────
const ISO_X = 0.70;   // facteur (wx - wz) → screen X
const ISO_Y = 0.35;   // facteur (wx + wz) → screen Y

// cameraY : décalage vertical en px pour maintenir la tour à hauteur fixe.
// Augmente de BLOCK_H_3D à chaque bloc posé → la scène "descend" (la tour monte).
let cameraY = 0;
let cameraTargetY = 0;  // valeur cible, interpolée en douceur

function worldToScreen(wx, wz, elevPx, origin) {
    const sx = origin.cx + (wx - wz) * ISO_X;
    const sy = origin.cy + (wx + wz) * ISO_Y - elevPx + cameraY;
    return { sx, sy };
}

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let score = 0;
let bestScore = parseInt(localStorage.getItem('layerpile_best') || '0');
let level = 0;
let bestLevel = parseInt(localStorage.getItem('layerpile_bestLevel') || '0');
let speed = BASE_SPEED;
let gameRunning = false;
let paused = false;
let animFrame = null;
let perfectCombo = 0;
let lastTime = 0;

// Bloc courant (oscillant) - coordonnées monde (centre)
let cur = { wx: 0, wz: 0, bw: BASE_BW, bd: BASE_BD, axis: 'x' };
let movDir = 1;     // direction de déplacement (+1 / -1)
let movPos = 0;     // position courante sur l'axe (monde)
let movRange = 0;    // amplitude de l'oscillation

// Stack de blocs posés
let stack = [];   // [{wx, wz, bw, bd, colorIdx}]

// Chips (morceaux qui tombent)
let chips = [];   // [{wx, wz, bw, bd, elevPx, colorIdx, alpha, velX, velZ}]

// ─────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const skyCanvas = document.getElementById('skyCanvas');
const skyCtx_ = skyCanvas.getContext('2d');

const scoreValueEl = document.getElementById('scoreValue');
const scoreDelta = document.getElementById('scoreDelta');
const bestBadgeVal = document.getElementById('bestVal');
const bestBadgeLayerVal = document.getElementById('bestLayerVal');
const heightVal = document.getElementById('heightVal');
const speedPips = document.querySelectorAll('.pip');
const tapHint = document.getElementById('tapHint');
const perfectLabel = document.getElementById('perfectLabel');

const rulesOverlay = document.getElementById('rulesOverlay');
const pauseOverlay = document.getElementById('pauseOverlay');
const gameoverOverlay = document.getElementById('gameoverOverlay');

const recordsOverlay = document.getElementById('recordsOverlay');
const recordsClose = document.getElementById('recordsClose');
const recordsBtn = document.getElementById('recordsBtn');
const recPersonalScore = document.getElementById('recPersonalScore');
const recPersonalHeight = document.getElementById('recPersonalHeight');
const recGlobalScore = document.getElementById('recGlobalScore');
const recGlobalHeight = document.getElementById('recGlobalHeight');
const recStatus = document.getElementById('recStatus');

const rulesBtn = document.getElementById('rulesBtn');
const rulesClose = document.getElementById('rulesClose');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartPauseBtn = document.getElementById('restartPauseBtn');
const menuPauseBtn = document.getElementById('menuPauseBtn');

const goEmoji = document.getElementById('goEmoji');
const goTitle = document.getElementById('goTitle');
const goScore = document.getElementById('goScore');
const goBest = document.getElementById('goBest');
const goHeight = document.getElementById('goHeight');
const goRestartBtn = document.getElementById('goRestartBtn');
const goMenuBtn = document.getElementById('goMenuBtn');

// 🏆 Popup Record
const recordMessagePopup = document.getElementById('recordMessagePopup');
const recordMsgInput = document.getElementById('recordMsgInput');
const saveRecordMsgBtn = document.getElementById('saveRecordMsgBtn');
const recordCharCounter = document.getElementById('recordCharCounter');

// ─────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────
function resizeAll() {
    canvas.width = skyCanvas.width = window.innerWidth;
    canvas.height = skyCanvas.height = window.innerHeight;
    drawSky();
}

// ─────────────────────────────────────────────
// SKY
// ─────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function drawSky() {
    const W = skyCanvas.width, H = skyCanvas.height;
    // L'altitude est proportionnelle à la hauteur de caméra accumulée
    // ~60 blocs × BLOCK_H_3D px = max altitude
    const alt = Math.min(cameraY / (60 * BLOCK_H_3D), 1);
    const c0r = lerp(28, 2, alt), c0g = lerp(75, 7, alt), c0b = lerp(155, 18, alt);
    const c1r = lerp(8, 2, alt), c1g = lerp(38, 5, alt), c1b = lerp(95, 13, alt);
    const c2r = lerp(2, 1, alt), c2g = lerp(9, 3, alt), c2b = lerp(26, 7, alt);
    const g = skyCtx_.createLinearGradient(0, H, 0, 0);
    g.addColorStop(0, `rgb(${~~c0r},${~~c0g},${~~c0b})`);
    g.addColorStop(.5, `rgb(${~~c1r},${~~c1g},${~~c1b})`);
    g.addColorStop(1, `rgb(${~~c2r},${~~c2g},${~~c2b})`);
    skyCtx_.fillStyle = g; skyCtx_.fillRect(0, 0, W, H);
}

// ─────────────────────────────────────────────
// STARS
// ─────────────────────────────────────────────
function buildStars() {
    document.querySelectorAll('.star').forEach(s => s.remove());
    for (let i = 0; i < 55; i++) {
        const s = document.createElement('div'); s.className = 'star';
        const size = Math.random() * 2.2 + .4;
        s.style.cssText = `width:${size}px;height:${size}px;top:${Math.random() * 65}%;left:${Math.random() * 100}%;--op1:${(.3 + Math.random() * .6).toFixed(2)};--op2:${(Math.random() * .15).toFixed(2)};--tw:${(2 + Math.random() * 4).toFixed(1)}s;animation-delay:${(Math.random() * 4).toFixed(1)}s;`;
        document.body.appendChild(s);
    }
}

// ─────────────────────────────────────────────
// HELPERS COULEUR
// ─────────────────────────────────────────────
function lighten(color, amt) {
    // color = "rgb(r,g,b)" ou "#rrggbb"
    let r, g, b;

    if (color.startsWith("rgb")) {
        // Format rgb(r,g,b)
        const parts = color.match(/\d+/g).map(Number);
        r = parts[0];
        g = parts[1];
        b = parts[2];
    } else {
        // Format hex #rrggbb
        r = parseInt(color.slice(1, 3), 16);
        g = parseInt(color.slice(3, 5), 16);
        b = parseInt(color.slice(5, 7), 16);
    }

    return `rgb(${Math.min(255, r + ~~(255 * amt))},
                ${Math.min(255, g + ~~(255 * amt))},
                ${Math.min(255, b + ~~(255 * amt))})`;
}

// ─────────────────────────────────────────────
// DESSIN DU SOL (surface herbe large et plate)
// ─────────────────────────────────────────────
function drawGround() {
    const org = getOrigin();
    const W = canvas.width;

    // La ligne d'horizon = position Y écran du sol (elev=0, wx=0, wz=0)
    // On calcule où se projette le niveau du sol (bas de la plateforme de base)
    const groundScreenY = org.cy + cameraY - (-BLOCK_H_3D + 150); // elevPx = -BLOCK_H_3D → sy = cy - elevPx + cameraY

    // Bande de sol pleine largeur depuis groundScreenY jusqu'en bas de l'écran
    const bandH = canvas.height - groundScreenY;
    if (bandH <= 0) return;

    // Dégradé vertical : vert herbe en haut de la bande → terre sombre en bas
    const grd = ctx.createLinearGradient(0, groundScreenY, 0, groundScreenY + Math.min(bandH, 120));
    grd.addColorStop(0, '#1e4d28');
    grd.addColorStop(0.3, '#163820');
    grd.addColorStop(1, '#0c2214');

    ctx.save();
    ctx.fillStyle = grd;
    ctx.fillRect(0, groundScreenY, W, bandH);

    // Ligne de séparation nette entre ciel et sol
    ctx.strokeStyle = 'rgba(60, 140, 70, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, groundScreenY);
    ctx.lineTo(W, groundScreenY);
    ctx.stroke();

    ctx.restore();
}

// ─────────────────────────────────────────────
function getOrigin() {
    // Le centre de projection est légèrement sous le milieu vertical
    return { cx: canvas.width / 2, cy: canvas.height * 0.60 };
}

/**
 * wx, wz : centre monde
 * bw     : demi-largeur X total (donc bloc = bw x bd)
 * bd     : demi-profondeur Z total
 * elevPx : élévation en pixels (stack.length * BLOCK_H_3D)
 * colorIdx
 * alpha
 */
function drawBlock(wx, wz, bw, bd, elevPx, colorIdx, alpha) {
    if (alpha === undefined) alpha = 1;
    const col = BLOCK_COLORS[((colorIdx % BLOCK_COLORS.length) + BLOCK_COLORS.length) % BLOCK_COLORS.length];
    const H = BLOCK_H_3D;
    const org = getOrigin();

    // Coins du dessus (4 sommets du rectangle en vue monde)
    //  P0=avant-gauche  P1=avant-droite  P2=arrière-droite  P3=arrière-gauche
    // (avant = wz+bd/2, arrière = wz-bd/2)
    const hw = bw / 2, hd = bd / 2;
    const p = [
        worldToScreen(wx - hw, wz + hd, elevPx + H, org),  // 0 avant-gauche   top
        worldToScreen(wx + hw, wz + hd, elevPx + H, org),  // 1 avant-droite   top
        worldToScreen(wx + hw, wz - hd, elevPx + H, org),  // 2 arrière-droite top
        worldToScreen(wx - hw, wz - hd, elevPx + H, org),  // 3 arrière-gauche top
        worldToScreen(wx - hw, wz + hd, elevPx, org),  // 4 avant-gauche   bottom
        worldToScreen(wx + hw, wz + hd, elevPx, org),  // 5 avant-droite   bottom
        worldToScreen(wx + hw, wz - hd, elevPx, org),  // 6 arrière-droite bottom
    ];

    ctx.save();
    ctx.globalAlpha = alpha;

    // Face AVANT (wz + hd) : p0-p1-p5-p4
    ctx.beginPath();
    ctx.moveTo(p[0].sx, p[0].sy); ctx.lineTo(p[1].sx, p[1].sy);
    ctx.lineTo(p[5].sx, p[5].sy); ctx.lineTo(p[4].sx, p[4].sy);
    ctx.closePath();
    ctx.fillStyle = col.front;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = .8; ctx.stroke();

    // Face DROITE (wx + hw) : p1-p2-p6-p5
    ctx.beginPath();
    ctx.moveTo(p[1].sx, p[1].sy); ctx.lineTo(p[2].sx, p[2].sy);
    ctx.lineTo(p[6].sx, p[6].sy); ctx.lineTo(p[5].sx, p[5].sy);
    ctx.closePath();
    ctx.fillStyle = col.side;
    ctx.fill();
    ctx.stroke();

    // Face DESSUS : p0-p1-p2-p3
    ctx.beginPath();
    ctx.moveTo(p[0].sx, p[0].sy); ctx.lineTo(p[1].sx, p[1].sy);
    ctx.lineTo(p[2].sx, p[2].sy); ctx.lineTo(p[3].sx, p[3].sy);
    ctx.closePath();
    const tg = ctx.createLinearGradient(p[3].sx, p[3].sy, p[1].sx, p[1].sy);
    tg.addColorStop(0, lighten(col.top, .15));
    tg.addColorStop(1, col.top);
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke();

    ctx.restore();
}

// ─────────────────────────────────────────────
// DRAW FRAME
// ─────────────────────────────────────────────
function drawFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGround();
    drawBlock(0, 0, BASE_BW, BASE_BD, -BLOCK_H_3D, 0, 1);
    stack.forEach((b, i) => {
        drawBlock(b.wx, b.wz, b.bw, b.bd, i * BLOCK_H_3D, b.colorIdx);
    });
    chips.forEach(c => {
        if (c.alpha > 0) drawBlock(c.wx, c.wz, c.bw, c.bd, c.elevPx, c.colorIdx, c.alpha);
    });
    if (gameRunning || paused) {
        drawBlock(cur.wx, cur.wz, cur.bw, cur.bd, stack.length * BLOCK_H_3D, stack.length, 0.90);
    }
}

// ─────────────────────────────────────────────
// GAME LOOP
// ─────────────────────────────────────────────
function gameLoop(ts) {
    if (!gameRunning || paused) return;
    const dt = Math.min(ts - lastTime, 50);
    lastTime = ts;

    // Caméra : interpolation douce vers la cible
    const prevCam = cameraY;
    cameraY += (cameraTargetY - cameraY) * 0.10;
    if (Math.abs(cameraTargetY - cameraY) < 0.1) cameraY = cameraTargetY;
    // Redessiner le ciel si la caméra a bougé (dégradé lié à l'altitude)
    if (Math.abs(cameraY - prevCam) > 0.3) drawSky();

    // Déplacement normalisé 60fps
    const step = speed * (dt / 16.67);
    movPos += movDir * step;

    // Rebond aux limites
    if (movPos > movRange) { movPos = movRange; movDir = -1; }
    if (movPos < -movRange) { movPos = -movRange; movDir = 1; }

    if (cur.axis === 'x') {
        cur.wx = (stack.length > 0 ? stack[stack.length - 1].wx : 0) + movPos;
    } else {
        cur.wz = (stack.length > 0 ? stack[stack.length - 1].wz : 0) + movPos;
    }

    // Chips physique
    chips.forEach(c => {
        c.elevPx -= 5;
        c.wx += c.velX;
        c.wz += c.velZ;
        c.alpha = Math.max(0, c.alpha - 0.028);
    });
    chips = chips.filter(c => c.alpha > 0 && c.elevPx > -200);

    drawFrame();
    animFrame = requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────
// DROP / PLACE BLOCK
// ─────────────────────────────────────────────
function dropBlock() {
    if (!gameRunning || paused) return;
    cancelAnimationFrame(animFrame);

    const top = stack.length > 0 ? stack[stack.length - 1] : { wx: 0, wz: 0, bw: BASE_BW, bd: BASE_BD };
    const elevPx = stack.length * BLOCK_H_3D;

    let newWx = cur.wx, newWz = cur.wz, newBw = cur.bw, newBd = cur.bd;
    let chipWx = 0, chipWz = 0, chipBw = 0, chipBd = 0, chipVX = 0, chipVZ = 0;
    let gotChip = false;

    // ── Axe X ────────────────────────────────
    if (cur.axis === 'x') {
        const cL = cur.wx - cur.bw / 2, cR = cur.wx + cur.bw / 2;
        const tL = top.wx - top.bw / 2, tR = top.wx + top.bw / 2;
        const oL = Math.max(cL, tL), oR = Math.min(cR, tR);
        const overlap = oR - oL;

        if (overlap <= 0) { triggerGameOver(); return; }

        const delta = cur.wx - top.wx;
        const isPerfect = Math.abs(delta) <= PERFECT_TOL;

        if (isPerfect) {
            playGameSound("perfect");
            newWx = top.wx; newBw = cur.bw;
            perfectCombo++;
            showPerfect(perfectCombo);
            addScore(POINTS_PERFECT + (perfectCombo - 1) * 20);
        } else {
            playGameSound("drop");
            newWx = (oL + oR) / 2;
            newBw = overlap;
            perfectCombo = 0;
            // Chip du côté qui déborde
            chipBw = cur.bw - overlap;
            chipBd = cur.bd;
            if (delta > 0) { // cur est trop à droite → chip à droite
                chipWx = oR + chipBw / 2;
                chipVX = 1.8;
            } else {         // cur trop à gauche → chip à gauche
                chipWx = oL - chipBw / 2;
                chipVX = -1.8;
            }
            chipWz = cur.wz;
            chipVZ = 0;
            gotChip = true;

            const precision = overlap / cur.bw;
            addScore(precision < 0.3 ? POINTS_PENALTY : Math.round(POINTS_BASE * precision));
        }
        // L'autre axe : reprendre celui du dessus
        newWz = top.wz;
        newBd = Math.min(cur.bd, top.bd);

        // ── Axe Z ────────────────────────────────
    } else {
        const cF = cur.wz - cur.bd / 2, cB = cur.wz + cur.bd / 2;
        const tF = top.wz - top.bd / 2, tB = top.wz + top.bd / 2;
        const oF = Math.max(cF, tF), oB = Math.min(cB, tB);
        const overlap = oB - oF;

        if (overlap <= 0) { triggerGameOver(); return; }

        const delta = cur.wz - top.wz;
        const isPerfect = Math.abs(delta) <= PERFECT_TOL;

        if (isPerfect) {
            playGameSound("perfect");
            newWz = top.wz; newBd = cur.bd;
            perfectCombo++;
            showPerfect(perfectCombo);
            addScore(POINTS_PERFECT + (perfectCombo - 1) * 20);
        } else {
            playGameSound("drop");
            newWz = (oF + oB) / 2;
            newBd = overlap;
            perfectCombo = 0;
            chipBd = cur.bd - overlap;
            chipBw = cur.bw;
            if (delta > 0) { // trop vers l'arrière → chip arrière
                chipWz = oB + chipBd / 2;
                chipVZ = 1.8;
            } else {
                chipWz = oF - chipBd / 2;
                chipVZ = -1.8;
            }
            chipWx = cur.wx;
            chipVX = 0;
            gotChip = true;

            const precision = overlap / cur.bd;
            addScore(precision < 0.3 ? POINTS_PENALTY : Math.round(POINTS_BASE * precision));
        }
        newWx = top.wx;
        newBw = Math.min(cur.bw, top.bw);
    }

    // Ajouter chip
    if (gotChip && chipBw > 3 && chipBd > 3) {
        chips.push({
            wx: chipWx, wz: chipWz, bw: chipBw, bd: chipBd,
            elevPx, colorIdx: stack.length % BLOCK_COLORS.length,
            alpha: 0.88, velX: chipVX, velZ: chipVZ
        });
    }

    // Push dans le stack
    stack.push({ wx: newWx, wz: newWz, bw: newBw, bd: newBd, colorIdx: stack.length % BLOCK_COLORS.length });
    level++;
    // Faire descendre la scène d'un cran pour maintenir la tour à hauteur fixe
    cameraTargetY += BLOCK_H_3D;
    speed = Math.min(BASE_SPEED + level * SPEED_INC, MAX_SPEED);
    updateSpeedUI();
    heightVal.textContent = level;
    drawSky();

    // Prochain bloc : axe alterné, part du bord extrême
    const nextAxis = cur.axis === 'x' ? 'z' : 'x';
    cur.axis = nextAxis;
    cur.wx = newWx;
    cur.wz = newWz;
    cur.bw = newBw;
    cur.bd = newBd;

    // Amplitude = taille de base + demi-taille du bloc
    movRange = (nextAxis === 'x' ? BASE_BW : BASE_BD) * 1.1 + (nextAxis === 'x' ? newBw : newBd) * 0.5;
    // Démarre depuis un bord (alterné)
    movPos = -movRange;
    movDir = 1;

    tapHint.style.display = 'none';
    lastTime = performance.now();
    animFrame = requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────
// SCORE / UI
// ─────────────────────────────────────────────
function addScore(pts) {
    score = Math.max(0, score + pts);
    scoreValueEl.textContent = score;
    scoreValueEl.classList.remove('score-up', 'score-down');
    void scoreValueEl.offsetWidth;
    scoreValueEl.classList.add(pts > 0 ? 'score-up' : 'score-down');
    setTimeout(() => scoreValueEl.classList.remove('score-up', 'score-down'), 500);
    showDelta(pts);
}
function showDelta(pts) {
    scoreDelta.className = 'score-delta';
    void scoreDelta.offsetWidth;
    scoreDelta.textContent = (pts > 0 ? '+' : '') + pts;
    scoreDelta.classList.add('show', pts > 0 ? 'positive' : 'negative');
    setTimeout(() => { scoreDelta.className = 'score-delta'; }, 1300);
}
function showPerfect(combo) {
    perfectLabel.className = '';
    void perfectLabel.offsetWidth;
    perfectLabel.textContent = combo >= 3 ? `✨ PARFAIT ×${combo}` : '✨ PARFAIT !';
    perfectLabel.classList.add('show');
    setTimeout(() => { perfectLabel.className = ''; }, 800);
}
function updateSpeedUI() {
    const ratio = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    const active = Math.round(ratio * speedPips.length);
    speedPips.forEach((p, i) => p.classList.toggle('active', i < active));
}

// ─────────────────────────────────────────────
// GAME OVER
// ─────────────────────────────────────────────
function triggerGameOver() {
    let $isOnline = checkRealConnection();

    playGameSound("gameover");
    gameRunning = false;
    paused = false;

    canvas.classList.add('shake');
    setTimeout(() => canvas.classList.remove('shake'), 400);

    let isGlobalScoreBroken = false;
    let isGlobalLayerBroken = false;

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('layerpile_best', bestScore);

        if ($isOnline && bestScore > best_score_ever) {
            isGlobalScoreBroken = true;
            best_score_ever = bestScore; // Mettre à jour localement pour éviter les doubles popups
        }
    }
    if (level > bestLevel) {
        bestLevel = level;
        localStorage.setItem('layerpile_bestLevel', bestLevel)

        if ($isOnline && bestLevel > best_layer_ever) {
            isGlobalLayerBroken = true;
            best_layer_ever = bestLevel;
        }
    }

    // Si un record mondial est battu, on prépare les données pour la popup
    if (isGlobalScoreBroken || isGlobalLayerBroken) {
        window.pendingRecordData = {
            score: bestScore,
            level: bestLevel,
            isScoreBroken: isGlobalScoreBroken,
            isLayerBroken: isGlobalLayerBroken
        };
    } else {
        window.pendingRecordData = null;
    }

    bestBadgeVal.textContent = bestScore;
    bestBadgeLayerVal.textContent = bestLevel;
    let isRecord = ((score >= bestScore && score > 0) || (level >= bestLevel && level > 0));
    goEmoji.textContent = isRecord ? '🏆' : '💀';
    goTitle.textContent = isRecord ? 'Nouveau record !' : 'Partie terminée !';
    goScore.textContent = score;
    goBest.textContent = bestScore;
    goHeight.textContent = level;

    // 🎥 Redescendre la caméra vers 0 puis afficher la popup
    function animateCamera() {
        const speed = 6; // px par frame — ajuste cette valeur à ton goût

        if (cameraY > speed) {
            cameraY -= speed;
            cameraTargetY = cameraY;
            drawSky();
            drawFrame();
            requestAnimationFrame(animateCamera);
        } else {
            cameraY = 0;
            cameraTargetY = 0;
            drawSky();
            drawFrame();
            setTimeout(() => {
                if (window.pendingRecordData) {
                    recordMessagePopup.style.display = 'flex';
                    recordMsgInput.value = '';
                    recordCharCounter.textContent = '0/50';
                    setTimeout(() => recordMsgInput.focus(), 100);
                } else {
                    gameoverOverlay.classList.add('open');
                }
            }, 300);
        }
    }

    animateCamera();
}

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
function startGame() {
    score = 0; level = 0; speed = BASE_SPEED; perfectCombo = 0;
    stack = []; chips = []; gameRunning = true; paused = false;
    cameraY = 0; cameraTargetY = 0;

    [rulesOverlay, pauseOverlay, gameoverOverlay].forEach(o => o.classList.remove('open'));
    scoreValueEl.textContent = '0'; heightVal.textContent = '0';
    bestBadgeVal.textContent = bestScore;
    bestBadgeLayerVal.textContent = bestLevel;
    updateSpeedUI(); drawSky();
    tapHint.style.display = 'block';

    // Premier bloc : axe X, part de la gauche
    cur = { wx: -BASE_BW * 1.4, wz: 0, bw: BASE_BW, bd: BASE_BD, axis: 'x' };
    movRange = BASE_BW * 1.1 + BASE_BW * 0.5;
    movPos = -movRange;
    movDir = 1;

    lastTime = performance.now();
    cancelAnimationFrame(animFrame);
    animFrame = requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────
// PAUSE
// ─────────────────────────────────────────────
function pauseGame() {
    if (!gameRunning) return;
    paused = true; cancelAnimationFrame(animFrame);
    pauseOverlay.classList.add('open'); drawFrame();
}
function resumeGame() {
    paused = false; pauseOverlay.classList.remove('open');
    lastTime = performance.now();
    animFrame = requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────
function handleInput() { if (!gameRunning || paused) return; dropBlock(); }

canvas.addEventListener('click', handleInput);
canvas.addEventListener('touchend', (e) => { e.preventDefault(); handleInput(); }, { passive: false });
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowDown') {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
        e.preventDefault(); handleInput();
    }
    if (e.code === 'Escape' && gameRunning && !paused) pauseGame();
});

// ─────────────────────────────────────────────
// OVERLAYS / BUTTONS
// ─────────────────────────────────────────────
rulesBtn.addEventListener('click', () => { if (gameRunning && !paused) rulesOverlay.classList.toggle('open'); });
rulesClose.addEventListener('click', () => rulesOverlay.classList.remove('open'));
rulesOverlay.addEventListener('click', (e) => { if (e.target === rulesOverlay) rulesOverlay.classList.remove('open'); });

recordsBtn.addEventListener('click', async () => {
    if (gameRunning && !paused) {
        recordsOverlay.classList.toggle('open');
        if (recordsOverlay.classList.contains('open')) {
            // Update Personal
            recPersonalScore.textContent = bestScore;
            recPersonalHeight.textContent = bestLevel;

            // Fetch & Update Global
            recStatus.textContent = "Synchronisation...";
            try {
                let isOnline = checkRealConnection();
                if (isOnline) {
                    const scoreData = await getFirebaseRecordData("layer_pile", "best_score");
                    const layerData = await getFirebaseRecordData("layer_pile", "best_layer");

                    const scoreVal = (scoreData && typeof scoreData === 'object') ? (scoreData.value || 0) : (scoreData || 0);
                    const layerVal = (layerData && typeof layerData === 'object') ? (layerData.value || 0) : (layerData || 0);

                    recGlobalScore.textContent = scoreVal;
                    recGlobalHeight.textContent = layerVal;

                    // Message Handling
                    const scoreCard = recGlobalScore.closest('.record-card');
                    const heightCard = recGlobalHeight.closest('.record-card');
                    scoreCard.querySelectorAll('.rc-message').forEach(m => m.remove());
                    heightCard.querySelectorAll('.rc-message').forEach(m => m.remove());

                    if (scoreData?.message) {
                        const m = document.createElement('span');
                        m.className = 'rc-message';
                        m.textContent = `« ${scoreData.message} »`;
                        scoreCard.appendChild(m);
                    }
                    if (layerData?.message) {
                        const m = document.createElement('span');
                        m.className = 'rc-message';
                        m.textContent = `« ${layerData.message} »`;
                        heightCard.appendChild(m);
                    }

                    recStatus.textContent = "À jour (Cloud)";
                } else {
                    recStatus.textContent = "Hors ligne (Records locaux)";
                    recGlobalScore.textContent = best_score_ever || 0;
                    recGlobalHeight.textContent = best_layer_ever || 0;
                }
            } catch (e) {
                console.error("Firebase records error:", e);
                recStatus.textContent = "Erreur de connexion";
            }
        }
    }
})
recordsClose.addEventListener('click', () => recordsOverlay.classList.remove('open'));
recordsOverlay.addEventListener('click', (e) => { if (e.target === recordsOverlay) recordsOverlay.classList.remove('open'); });

pauseBtn.addEventListener('click', pauseGame);
resumeBtn.addEventListener('click', () => { pauseOverlay.classList.remove('open'); resumeGame(); });
restartPauseBtn.addEventListener('click', () => { pauseOverlay.classList.remove('open'); startGame(); });
menuPauseBtn.addEventListener('click', () => { window.location.href = '../../index.html'; });

goRestartBtn.addEventListener('click', () => { gameoverOverlay.classList.remove('open'); startGame(); });
goMenuBtn.addEventListener('click', () => { window.location.href = '../../index.html'; });

// 🏆 Popup Record Events
saveRecordMsgBtn.addEventListener('click', async () => {
    const message = recordMsgInput.value.trim().substring(0, 50);
    const data = window.pendingRecordData;
    if (!data) return;

    saveRecordMsgBtn.disabled = true;
    saveRecordMsgBtn.textContent = 'Enregistrement...';

    try {
        if (data.isScoreBroken) {
            await setFirebaseLeaderboard("layer_pile", "best_score", {
                value: data.score,
                message: message,
                timestamp: Date.now()
            });
        }
        if (data.isLayerBroken) {
            await setFirebaseLeaderboard("layer_pile", "best_layer", {
                value: data.level,
                message: message,
                timestamp: Date.now()
            });
        }
    } catch (e) { console.error("Error saving record message:", e); }

    saveRecordMsgBtn.disabled = false;
    saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'none';
    gameoverOverlay.classList.add('open');
    window.pendingRecordData = null;
});

recordMsgInput.addEventListener('input', () => {
    recordCharCounter.textContent = `${recordMsgInput.value.length}/50`;
});

// ─────────────────────────────────────────────
// RESIZE & INIT
// ─────────────────────────────────────────────
window.addEventListener('resize', () => { resizeAll(); drawFrame(); });

resizeAll();
buildStars();
bestBadgeVal.textContent = bestScore;
bestBadgeLayerVal.textContent = bestLevel;
startGame();