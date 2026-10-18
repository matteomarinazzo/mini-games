// Coupe-Fruits – game.js · cache local "fruit-cutter" + record mondial Firebase (leaderboards/fruit_cutter/score)

// ── CONST ──
const LIVES = 3;
const BASE = 10;                                   // points par fruit (avant combo)
const FRUIT_PTS = { apple: BASE, banana: BASE, watermelon: BASE, orange: BASE, strawberry: BASE, pineapple: BASE, kiwi: BASE };
const GRAVITY = 1.55;                              // en hauteurs d'écran / s²
const TOP_MARGIN = 0.10;                           // le sommet d'un lancer reste sous les 10 % du haut
const BOMB_MIN = 0.10, BOMB_MAX = 0.28;            // ratio de bombes parmi les objets lancés
const BOMB_RAMP_S = 300;                           // durée pour passer de BOMB_MIN à BOMB_MAX
const MAX_BOMBS = 3;                               // bombes max à l'écran
const SPAWN_START_S = 1.25, SPAWN_MIN_S = 0.55;    // intervalle entre deux lancers (début → plancher)
const RAMP_S = 180;                                // durée de montée spawn / vitesse
const RISE_START = [0.58, 0.72];                   // hauteur de lancer (fraction d'écran) au début [min, max]
const RISE_END = [0.74, 0.88];                     // … et après RAMP_S
const WAVE_MAX = 3, WAVE_STEP_S = 50;              // objets par lancer : +1 toutes les WAVE_STEP_S, plafond WAVE_MAX
const MAX_ON_SCREEN = 8;
const HIT_PAD = 6;                                 // tolérance de coupe (px)
const TRAIL_MS = 200;                              // durée de vie de la traînée
const OVER_DELAY_BOMB_MS = 900, OVER_DELAY_LIVES_MS = 600;
const WORLD_MIN_SCORE = BASE;                      // score mini pour tenter le record mondial
const STORAGE_KEY = 'fruit-cutter';
const FB_GAME = 'fruit_cutter';
const FB_KEY = 'score';                            // { value: points, duration: ms, message, timestamp }

// ── Fruits : SVG inline dessinés sur canvas ──
// k = hauteur du sprite (fraction de S), asp = largeur/hauteur, hit = cercles [dx, dy, r] en unités de hauteur
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const TYPES = {
    apple: {
        k: .22, asp: 1, flesh: '#fff1c1', juice: '#e63946', hit: [[0, .04, .46]],
        svg: svg(100, 100, '<defs><radialGradient id="g" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff7a6b"/><stop offset=".55" stop-color="#e2262f"/><stop offset="1" stop-color="#8f0f1f"/></radialGradient></defs><path d="M50 24C38 14 14 20 12 46c-2 28 16 50 30 50 5 0 6-3 8-3s3 3 8 3c14 0 32-22 30-50C86 20 62 14 50 24z" fill="url(#g)"/><path d="M50 26c0-8 2-14 8-20" stroke="#5a3b1e" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M54 14c8-8 20-6 24-2-6 8-18 8-24 2z" fill="#4cc15a"/><ellipse cx="32" cy="40" rx="7" ry="11" fill="#fff" opacity=".28" transform="rotate(20 32 40)"/>')
    },
    banana: {
        k: .17, asp: 1.6, flesh: '#fff3a8', juice: '#ffd43b', hit: [[-.34, 0, .17], [.03, .135, .18], [.40, .08, .17]],
        svg: svg(160, 100, '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe45c"/><stop offset=".6" stop-color="#ffc800"/><stop offset="1" stop-color="#d89b00"/></linearGradient></defs><path d="M18 16C40 90 120 100 150 32C118 62 52 56 18 16Z" fill="url(#g)" stroke="#a87400" stroke-width="2" stroke-linejoin="round"/><path d="M30 24C56 56 104 62 138 40" fill="none" stroke="#fff6b0" stroke-width="3" stroke-linecap="round" opacity=".6"/><rect x="12" y="6" width="9" height="14" rx="3" fill="#6b4a1e" transform="rotate(-20 16 13)"/><circle cx="150" cy="32" r="4" fill="#4a3315"/>')
    },
    watermelon: {
        k: .30, asp: 1, flesh: '#ff4d5e', juice: '#ff4d5e', hit: [[0, 0, .48]],
        svg: svg(100, 100, '<defs><radialGradient id="g" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#6fd36f"/><stop offset=".6" stop-color="#2f9e44"/><stop offset="1" stop-color="#14532d"/></radialGradient><clipPath id="c"><circle cx="50" cy="50" r="46"/></clipPath></defs><circle cx="50" cy="50" r="46" fill="url(#g)"/><g clip-path="url(#c)" fill="none" stroke="#14532d" stroke-width="5" opacity=".55" stroke-linecap="round"><path d="M50 2C30 24 30 76 50 98"/><path d="M50 2C70 24 70 76 50 98"/><path d="M28 8C6 30 6 70 28 92"/><path d="M72 8C94 30 94 70 72 92"/></g><ellipse cx="32" cy="30" rx="10" ry="15" fill="#fff" opacity=".25" transform="rotate(30 32 30)"/>')
    },
    orange: {
        k: .20, asp: 1, flesh: '#ffb02e', juice: '#ff9500', hit: [[0, .02, .47]],
        svg: svg(100, 100, '<defs><radialGradient id="g" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#ffc046"/><stop offset=".6" stop-color="#ff8a00"/><stop offset="1" stop-color="#c25400"/></radialGradient></defs><circle cx="50" cy="52" r="44" fill="url(#g)"/><g fill="#c25400" opacity=".35"><circle cx="30" cy="60" r="1.6"/><circle cx="44" cy="74" r="1.6"/><circle cx="62" cy="70" r="1.6"/><circle cx="72" cy="52" r="1.6"/><circle cx="58" cy="36" r="1.6"/><circle cx="36" cy="44" r="1.6"/></g><path d="M50 10c4-4 10-4 14-2-3 6-9 7-14 2z" fill="#3fa94d"/><circle cx="50" cy="9" r="3" fill="#6b4a1e"/><ellipse cx="33" cy="33" rx="9" ry="13" fill="#fff" opacity=".28" transform="rotate(30 33 33)"/>')
    },
    strawberry: {
        k: .16, asp: 1, flesh: '#ff8a96', juice: '#e63946', hit: [[0, .03, .44]],
        svg: svg(100, 100, '<defs><radialGradient id="g" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ff6b78"/><stop offset=".55" stop-color="#d90429"/><stop offset="1" stop-color="#8d0723"/></radialGradient></defs><path d="M50 94C24 80 10 58 14 40C17 26 30 22 50 30C70 22 83 26 86 40C90 58 76 80 50 94Z" fill="url(#g)"/><g fill="#ffe28a"><ellipse cx="34" cy="46" rx="1.8" ry="2.6"/><ellipse cx="50" cy="44" rx="1.8" ry="2.6"/><ellipse cx="66" cy="46" rx="1.8" ry="2.6"/><ellipse cx="40" cy="60" rx="1.8" ry="2.6"/><ellipse cx="58" cy="60" rx="1.8" ry="2.6"/><ellipse cx="49" cy="74" rx="1.8" ry="2.6"/><ellipse cx="26" cy="58" rx="1.8" ry="2.6"/><ellipse cx="73" cy="58" rx="1.8" ry="2.6"/></g><path d="M50 32c-8-2-18-6-22-14 8 0 14 2 22 8 8-6 14-8 22-8-4 8-14 12-22 14z" fill="#3fa94d"/><rect x="47" y="10" width="6" height="14" rx="3" fill="#2e7d32"/><ellipse cx="30" cy="42" rx="5" ry="9" fill="#fff" opacity=".25" transform="rotate(20 30 42)"/>')
    },
    pineapple: {
        k: .27, asp: 1, flesh: '#ffe56b', juice: '#ffd43b', hit: [[0, .16, .34], [0, -.30, .15]],
        svg: svg(100, 100, '<defs><radialGradient id="g" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffd447"/><stop offset=".6" stop-color="#f5a000"/><stop offset="1" stop-color="#b86a00"/></radialGradient><clipPath id="c"><ellipse cx="50" cy="66" rx="29" ry="32"/></clipPath></defs><ellipse cx="50" cy="66" rx="29" ry="32" fill="url(#g)"/><g clip-path="url(#c)" stroke="#9a5a00" stroke-width="1.8" opacity=".55" fill="none"><path d="M16 40L84 96M16 56L84 112M16 24L84 80M84 40L16 96M84 56L16 112M84 24L16 80"/></g><g fill="#2f9e44"><path d="M50 36C34 34 24 24 24 12C34 16 42 22 50 36Z"/><path d="M50 36C66 34 76 24 76 12C66 16 58 22 50 36Z"/><path d="M50 36C40 28 34 16 40 4C44 14 48 18 50 24C52 18 56 14 60 4C66 16 60 28 50 36Z" fill="#1f7a34"/></g><ellipse cx="38" cy="58" rx="5" ry="10" fill="#fff" opacity=".25" transform="rotate(15 38 58)"/>')
    },
    kiwi: {
        k: .20, asp: 1, flesh: '#a5e36a', juice: '#8ad13f', hit: [[0, 0, .46]],
        svg: svg(100, 100, '<defs><radialGradient id="g" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#b88a54"/><stop offset=".65" stop-color="#8a5a2b"/><stop offset="1" stop-color="#4f3016"/></radialGradient></defs><ellipse cx="50" cy="50" rx="45" ry="41" fill="url(#g)"/><g stroke="#d2a971" stroke-width="1.6" stroke-linecap="round" opacity=".55"><path d="M26 40l4 3M40 28l3 4M60 30l-2 4M72 44l-4 2M34 62l4-2M52 70l0-4M68 62l-4-2M46 46l3 2"/></g><ellipse cx="32" cy="36" rx="8" ry="12" fill="#fff" opacity=".2" transform="rotate(30 32 36)"/>')
    },
    bomb: {
        k: .19, asp: 1, bomb: true, hit: [[0, .10, .38]],
        svg: svg(100, 100, '<defs><radialGradient id="g" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#6b7390"/><stop offset=".5" stop-color="#242838"/><stop offset="1" stop-color="#07080e"/></radialGradient></defs><circle cx="50" cy="60" r="36" fill="url(#g)"/><circle cx="50" cy="60" r="17" fill="#ef476f"/><circle cx="50" cy="60" r="17" fill="none" stroke="#fff" stroke-width="2.5"/><rect x="47.8" y="50" width="4.4" height="13" rx="2.2" fill="#fff"/><circle cx="50" cy="69" r="2.6" fill="#fff"/><ellipse cx="32" cy="42" rx="7" ry="11" fill="#fff" opacity=".22" transform="rotate(28 32 42)"/><rect x="39" y="17" width="22" height="13" rx="3" fill="#8a8fa3"/><path d="M50 18C52 8 62 12 66 8" fill="none" stroke="#d9b27a" stroke-width="3.5" stroke-linecap="round"/>')
    }
};
const FRUITS = Object.keys(TYPES).filter(t => !TYPES[t].bomb);

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, k) => a + (b - a) * k;

// ── État ──
let state = 'ready';           // ready | running | paused | over
let score = 0, lives = LIVES, elapsed = 0, spawnIn = 0.5;
let started = false, gameOver = false, recBroken = false, cause = '';
let lastTime = 0, runId = 0, pendingRecord = null;
let objs = [], pieces = [], drops = [], floats = [], trail = [];
let combo = null, boom = null, stroke = null;
let shake = 0, lifeFlash = 0, flash = 0;
let bestRec = { score: 0, ms: 0 }, worldBest = { score: 0, ms: 0 }, worldMsg = '';
let fb = null, net = null;

const cv = $('game'), ctx = cv.getContext('2d'), stage = $('stage');
const scoreEl = $('scoreValue'), timeEl = $('timeVal'), worldEl = $('worldVal'), livesEl = $('livesVal');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay'), pauseOverlay = $('pauseOverlay');
const gameoverOverlay = $('gameoverOverlay'), recordsOverlay = $('recordsOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

// ── Formats / records ──
const pad2 = (n) => String(n).padStart(2, '0');
function fmtClock(ms) {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return h ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`;
}
const fmtDuration = (ms) => `${fmtClock(ms)},${Math.floor(ms / 100) % 10}`;
const fmtRecord = (r) => r.score > 0 ? `${r.score} · ${fmtDuration(r.ms)}` : '—';
const normRecord = (r) => (r && typeof r === 'object') ? { score: Number(r.score) || 0, ms: Number(r.ms) || 0 } : { score: 0, ms: 0 };
const parseRemote = (d) => (d && typeof d === 'object') ? { score: Number(d.value) || 0, ms: Number(d.duration) || 0 } : { score: Number(d) || 0, ms: 0 };
function isBetter(a, b) {
    if (a.score <= 0) return false;
    if (b.score <= 0) return true;
    return a.score > b.score || (a.score === b.score && a.ms < b.ms);
}

// ── Persistance (par événement) ──
const num = (v) => typeof v === 'number' && isFinite(v);
function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            score, lives, elapsedMs: Math.round(elapsed), spawnIn, started, gameOver, cause,
            objs: objs.map(o => ({ t: o.t, x: o.x, y: o.y, vx: o.vx, vy: o.vy, rot: o.rot, vr: o.vr })),
            record: bestRec, worldBest, worldMsg
        }));
    } catch { /* stockage indisponible */ }
}
function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* ignoré */ }
    if (!d || typeof d !== 'object') return false;
    bestRec = normRecord(d.record);
    worldBest = normRecord(d.worldBest);
    worldMsg = typeof d.worldMsg === 'string' ? d.worldMsg : '';
    if (!num(d.score) || !num(d.lives) || !num(d.elapsedMs) || !Array.isArray(d.objs)) return false;
    score = Math.max(0, Math.floor(d.score));
    lives = Math.max(0, Math.min(LIVES, Math.floor(d.lives)));
    elapsed = Math.max(0, d.elapsedMs);
    spawnIn = num(d.spawnIn) ? d.spawnIn : 0.5;
    started = !!d.started;
    gameOver = !!d.gameOver || lives <= 0;
    cause = typeof d.cause === 'string' ? d.cause : '';
    objs = d.objs.filter(o => o && TYPES[o.t] && [o.x, o.y, o.vx, o.vy, o.rot, o.vr].every(num))
        .map(o => ({ t: o.t, x: o.x, y: o.y, vx: o.vx, vy: o.vy, rot: o.rot, vr: o.vr }));
    return true;
}

// ── Canvas / sprites ──
let W = 1, H = 1, DPR = 1, S = 1, bg = null;
const imgs = {}, sprites = {};

function loadImages() {
    let left = Object.keys(TYPES).length;
    for (const id in TYPES) {
        const im = new Image();
        im.onload = im.onerror = () => { if (--left === 0) buildSprites(); };
        im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(TYPES[id].svg);
        imgs[id] = im;
    }
}
function buildSprites() {
    for (const id in TYPES) {
        const im = imgs[id];
        if (!im || !im.complete || !im.naturalWidth) continue;
        const t = TYPES[id], h = t.k * S, w = h * t.asp;
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w * DPR)); c.height = Math.max(1, Math.ceil(h * DPR));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        sprites[id] = { c, w, h };
    }
}
function buildBg() {
    bg = document.createElement('canvas');
    bg.width = Math.ceil(W * DPR); bg.height = Math.ceil(H * DPR);
    const g = bg.getContext('2d');
    g.scale(DPR, DPR);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0e4a5c'); sky.addColorStop(.55, '#0b2c52'); sky.addColorStop(1, '#061428');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W / 2, H * .38, 0, W / 2, H * .38, Math.max(W, H) * .7);
    glow.addColorStop(0, 'rgba(91,200,245,.22)'); glow.addColorStop(1, 'rgba(91,200,245,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 16; i++) {
        g.fillStyle = `rgba(255,255,255,${.015 + r() * .035})`;
        g.beginPath(); g.arc(r() * W, r() * H * .85, S * (.04 + r() * .12), 0, 7); g.fill();
    }
    [['#082a3e', .88, .06, 2.2], ['#04162a', .94, .045, 3.1]].forEach(([col, base, amp, f], i) => {
        g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) g.lineTo(x, H * (base + amp * Math.sin(x / W * Math.PI * f + i * 1.7)));
        g.lineTo(W, H); g.closePath(); g.fill();
    });
}
function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    S = Math.min(W, H * .7, 560);
    buildBg(); buildSprites();
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

// ── Lancers ──
function pickType(t) {
    const bombs = objs.reduce((n, o) => n + (o.t === 'bomb' ? 1 : 0), 0);
    const p = lerp(BOMB_MIN, BOMB_MAX, Math.min(t / BOMB_RAMP_S, 1));
    if (bombs < MAX_BOMBS && Math.random() < p) return 'bomb';
    return FRUITS[Math.floor(Math.random() * FRUITS.length)];
}
function launch(type, k) {
    const sp = sprites[type];
    if (!sp) return;
    const ext = Math.hypot(sp.w, sp.h) / 2 / H, y0 = 1 + ext + .01;
    let rise = rnd(lerp(RISE_START[0], RISE_END[0], k), lerp(RISE_START[1], RISE_END[1], k));
    rise = Math.min(rise, y0 - ext - TOP_MARGIN);                  // sommet jamais dans les 10 % du haut
    const vy = -Math.sqrt(2 * GRAVITY * rise), T = 2 * -vy / GRAVITY;
    const x0 = rnd(.12, .88), tx = rnd(.15, .85);
    objs.push({
        t: type, x: x0, y: y0, vx: (tx - x0) / T, vy,
        rot: rnd(0, 6.28), vr: rnd(-2.6, 2.6) * (type === 'bomb' ? .5 : 1)
    });
}
function spawnWave() {
    const t = elapsed / 1000, k = Math.min(t / RAMP_S, 1);
    const waveMax = Math.min(WAVE_MAX, 1 + Math.floor(t / WAVE_STEP_S));
    const n = 1 + Math.floor(Math.random() * waveMax);
    for (let i = 0; i < n && objs.length < MAX_ON_SCREEN; i++) launch(pickType(t), k);
}
const nextInterval = () => lerp(SPAWN_START_S, SPAWN_MIN_S, Math.min(elapsed / 1000 / RAMP_S, 1)) * rnd(.75, 1.25);

function update(dt) {
    elapsed += dt * 1000;
    spawnIn -= dt;
    if (spawnIn <= 0) { spawnWave(); spawnIn = nextInterval(); }
    let missed = 0, mx = .5;
    for (let i = objs.length - 1; i >= 0; i--) {
        const o = objs[i], sp = sprites[o.t];
        o.vy += GRAVITY * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
        const ext = sp ? Math.hypot(sp.w, sp.h) / 2 / H : 0;
        if (o.vy > 0 && o.y - ext > 1) {                               // sorti entièrement par le bas
            objs.splice(i, 1);
            if (o.t !== 'bomb') { missed++; mx = Math.max(.08, Math.min(.92, o.x)); }
        }
    }
    if (missed) loseLives(missed, mx);
    else if (stroke && stroke.count > 0 && stroke.first.every(p => p.gone)) { bankSeries(stroke); save(); }
}

function loseLives(n, x) {
    bankSeries(stroke); combo = null;
    lives = Math.max(0, lives - n);
    lifeFlash = 1;
    floats.push({ x: x * W, y: H - S * .12, text: n > 1 ? `✕ ×${n}` : '✕', color: '#ef476f', size: S * .12, age: 0, life: .9 });
    renderLives();
    if (lives <= 0) endGame('lives'); else save();
}

// ── Coupe ──
function segHit(ax, ay, bx, by, o) {
    const sp = sprites[o.t];
    if (!sp) return null;
    const cx = o.x * W, cy = o.y * H, c = Math.cos(o.rot), s = Math.sin(o.rot);
    const abx = bx - ax, aby = by - ay, len2 = abx * abx + aby * aby;
    let best = null;
    for (const h of TYPES[o.t].hit) {
        const ox = h[0] * sp.h, oy = h[1] * sp.h;
        const hx = cx + ox * c - oy * s, hy = cy + ox * s + oy * c, r = h[2] * sp.h + HIT_PAD;
        let t = len2 ? ((hx - ax) * abx + (hy - ay) * aby) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const qx = ax + abx * t, qy = ay + aby * t;
        if ((hx - qx) ** 2 + (hy - qy) ** 2 <= r * r && (!best || t < best.t)) best = { x: qx, y: qy, t };
    }
    return best;
}

function strokeSeg(ax, ay, bx, by) {
    const len = Math.hypot(bx - ax, by - ay);
    if (len > 1) stroke.ang = Math.atan2(by - ay, bx - ax);
    else if (stroke.ang == null) stroke.ang = rnd(0, 6.28);
    const hits = [];
    for (const o of objs) { const h = segHit(ax, ay, bx, by, o); if (h) hits.push({ o, h }); }
    if (!hits.length) return;
    const b = hits.find(x => x.o.t === 'bomb');
    if (b) { explode(b.o); return; }
    hits.sort((p, q) => p.h.t - q.h.t);
    for (const { o, h } of hits) cutFruit(o, h.x, h.y, stroke.ang);
}

function makeHalves(o, px, py, ang) {
    const sp = sprites[o.t], spec = TYPES[o.t];
    const cx = o.x * W, cy = o.y * H;
    const dx = px - cx, dy = py - cy, cr = Math.cos(-o.rot), sr = Math.sin(-o.rot);
    const lx = dx * cr - dy * sr, ly = dx * sr + dy * cr;           // point de coupe dans le repère du fruit
    const la = ang - o.rot, tx = Math.cos(la), ty = Math.sin(la), nx = -ty, ny = tx;
    const L = (sp.w + sp.h) * 1.5;
    const wn = [-Math.sin(ang), Math.cos(ang)], made = [];
    for (const s of [1, -1]) {
        const c = document.createElement('canvas');
        c.width = sp.c.width; c.height = sp.c.height;
        const g = c.getContext('2d');
        g.scale(DPR, DPR); g.translate(sp.w / 2, sp.h / 2);
        g.beginPath();
        g.moveTo(lx - tx * L, ly - ty * L); g.lineTo(lx + tx * L, ly + ty * L);
        g.lineTo(lx + tx * L + s * nx * L, ly + ty * L + s * ny * L);
        g.lineTo(lx - tx * L + s * nx * L, ly - ty * L + s * ny * L);
        g.closePath(); g.clip();
        g.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
        g.globalCompositeOperation = 'source-atop';
        g.strokeStyle = spec.flesh; g.lineWidth = sp.h * .2; g.lineCap = 'butt';
        g.beginPath(); g.moveTo(lx - tx * L, ly - ty * L); g.lineTo(lx + tx * L, ly + ty * L); g.stroke();
        const sep = S * .45;
        const piece = {
            c, w: sp.w, h: sp.h, x: cx + s * wn[0] * 2, y: cy + s * wn[1] * 2, rot: o.rot,
            vx: o.vx * W + s * wn[0] * sep, vy: o.vy * H + s * wn[1] * sep - S * .15,
            vr: o.vr + s * rnd(.6, 2.2), gone: false
        };
        pieces.push(piece); made.push(piece);
    }
    for (let i = 0; i < 8; i++) {
        const a = rnd(0, 6.28), v = rnd(.2, .9) * S;
        drops.push({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v - S * .2, r: rnd(2, 4.5), color: spec.juice, life: rnd(.35, .7), age: 0 });
    }
    return made;
}

function cutFruit(o, px, py, ang) {
    const i = objs.indexOf(o);
    if (i < 0) return;
    objs.splice(i, 1);
    const made = makeHalves(o, px, py, ang);
    if (stroke.count === 0) stroke.first = made;      // la série vit tant que le 1er fruit coupé est à l'écran
    stroke.count++; stroke.sum += FRUIT_PTS[o.t] || BASE;
    stroke.last = { x: px, y: py };
    if (stroke.count >= 2) combo = { n: stroke.count, pts: stroke.sum * stroke.count, x: px, y: py, age: 0 };
}

function explode(o) {
    bankSeries(stroke);
    const i = objs.indexOf(o);
    if (i >= 0) objs.splice(i, 1);
    boom = { x: o.x * W, y: o.y * H, age: 0 };
    shake = 1; flash = 1;
    for (let k = 0; k < 18; k++) {
        const a = rnd(0, 6.28), v = rnd(.3, 1.2) * S;
        drops.push({ x: boom.x, y: boom.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rnd(2, 5), color: k % 2 ? '#ffd84d' : '#ff7a33', life: rnd(.4, .8), age: 0 });
    }
    stroke = null; trail.length = 0;
    endGame('bomb');
}

function bankSeries(s) {
    if (!s || s.count <= 0) return false;
    const pts = s.sum * s.count;
    score += pts;
    floats.push({ x: s.last.x, y: s.last.y - S * .06, text: `+${pts}`, color: '#ffd84d', size: S * .09, age: 0, life: .9 });
    scoreEl.classList.add('level-up');
    setTimeout(() => scoreEl.classList.remove('level-up'), 400);
    s.count = 0; s.sum = 0; s.first = null;
    renderAll();
    return true;
}

function endStroke() {
    if (!stroke) return;
    const s = stroke; stroke = null;
    if (bankSeries(s)) save();
}

// ── Entrées ──
function pt(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function addPoint(x, y) {
    const p = stroke.pts;
    const [ax, ay] = p.length ? p[p.length - 1] : [x, y];
    if (p.length && Math.hypot(x - ax, y - ay) < 1) return;
    strokeSeg(ax, ay, x, y);
    if (!stroke) return;                                            // bombe touchée
    p.push([x, y]);
    trail.push({ x, y, t: performance.now() });
}
cv.addEventListener('pointerdown', (e) => {
    if (state !== 'running' || stroke) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    stroke = { id: e.pointerId, pts: [], count: 0, sum: 0, last: null, ang: null, first: null };
    addPoint(...pt(e));
});
cv.addEventListener('pointermove', (e) => {
    if (!stroke || e.pointerId !== stroke.id) return;
    e.preventDefault();
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of (list.length ? list : [e])) {
        if (!stroke) return;
        addPoint(...pt(ev));
    }
});
const up = (e) => { if (stroke && e.pointerId === stroke.id) endStroke(); };
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

document.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'Escape') { state === 'running' ? pauseGame() : (state === 'paused' && resumeGame()); }
});
const autoPause = () => { if (started) pauseGame(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('blur', autoPause);

// ── HUD ──
function renderLives() {
    livesEl.textContent = '';
    for (let i = 0; i < LIVES; i++) {
        const s = document.createElement('span');
        s.className = 'heart' + (i < lives ? '' : ' lost');
        s.textContent = '♥';
        livesEl.appendChild(s);
    }
}
function renderTime() { const s = fmtClock(elapsed); if (timeEl.textContent !== s) timeEl.textContent = s; }
function renderWorld() { worldEl.textContent = worldBest.score > 0 ? `${worldBest.score} · ${fmtClock(worldBest.ms)}` : '—'; }
function renderAll() { scoreEl.textContent = score; renderTime(); renderLives(); renderWorld(); }
function setWorldStatus(text) { $('goWorldStatus').textContent = text; }

// ── Flux de jeu ──
function closeOverlays() {
    [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay].forEach(o => o.classList.remove('open'));
}
function clearFx() {
    objs = []; pieces = []; drops = []; floats = []; trail = [];
    combo = null; boom = null; stroke = null; shake = 0; lifeFlash = 0; flash = 0;
}
function newGame() {
    clearFx();
    score = 0; lives = LIVES; elapsed = 0; spawnIn = .5;
    started = false; gameOver = false; recBroken = false; cause = ''; pendingRecord = null;
    setWorldStatus('');
    renderAll(); save();
}
function startGame() {
    closeOverlays();
    recordMessagePopup.style.display = 'none';
    runId++;
    newGame();
    started = true;
    state = 'running';
    lastTime = performance.now();
    save();
}
function pauseGame(open = true) {
    if (state !== 'running') return;
    endStroke();
    state = 'paused';
    if (open) pauseOverlay.classList.add('open');
}
function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    state = 'running';
    lastTime = performance.now();
}

function endGame(why) {
    if (state === 'over') return;
    stroke = null;
    gameOver = true; state = 'over'; cause = why;
    const r = { score, ms: Math.round(elapsed) };
    if (isBetter(r, bestRec)) { bestRec = r; recBroken = true; }
    save();
    const id = runId;
    setTimeout(() => { if (id === runId) showOver(true); }, why === 'bomb' ? OVER_DELAY_BOMB_MS : OVER_DELAY_LIVES_MS);
}

function showOver(check) {
    const result = { score, ms: Math.round(elapsed) };
    $('goEmoji').textContent = recBroken ? '🏆' : cause === 'bomb' ? '💣' : '💔';
    $('goTitle').textContent = recBroken ? 'Nouveau record !' : cause === 'bomb' ? 'Boum !' : 'Plus de vies';
    $('goScore').textContent = score;
    $('goDuration').textContent = fmtDuration(elapsed);
    $('goBest').textContent = fmtRecord(bestRec);
    gameoverOverlay.classList.add('open');
    if (check && score >= WORLD_MIN_SCORE) checkWorldRecord(result, runId);
    else setWorldStatus('');
}

async function checkWorldRecord(result, myRun) {
    setWorldStatus('Vérification du record mondial…');
    try {
        await Promise.race([onlineReady, wait(2500)]);
        if (myRun !== runId) return;
        const online = await Promise.race([isOnline(), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!online || !fb) {
            setWorldStatus('Hors ligne : record mondial indisponible. Tes records personnels restent sauvegardés.');
            return;
        }
        const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!fresh) { setWorldStatus('Record mondial indisponible pour le moment.'); return; }

        if (isBetter(result, worldBest)) {
            pendingRecord = result;
            $('goEmoji').textContent = '🏆';
            $('goTitle').textContent = 'Record mondial !';
            setWorldStatus('🌍 Tu bats le record mondial !');
            recordMessagePopup.style.display = 'flex';
            recordMsgInput.value = ''; recordCharCounter.textContent = '0/50';
            setTimeout(() => recordMsgInput.focus(), 100);
        } else {
            setWorldStatus(`Record mondial : ${fmtRecord(worldBest)}`);
        }
    } catch (e) {
        console.error('Firebase records error:', e);
        if (myRun === runId) setWorldStatus('Record mondial indisponible pour le moment.');
    }
}

// ── Effets ──
function updateFx(dt) {
    const g = GRAVITY * H;
    for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.y - p.h > H) { p.gone = true; pieces.splice(i, 1); }
    }
    for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.vy += g * .7 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.age += dt;
        if (d.age >= d.life) drops.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) { floats[i].age += dt; if (floats[i].age >= floats[i].life) floats.splice(i, 1); }
    if (combo) { combo.age += dt; if (combo.age > 1) combo = null; }
    if (boom) { boom.age += dt; if (boom.age > .7) boom = null; }
    shake = Math.max(0, shake - dt * 2.2);
    lifeFlash = Math.max(0, lifeFlash - dt * 2);
    flash = Math.max(0, flash - dt * 2.4);
}

// ── Rendu ──
function label(str, x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `800 ${size}px Fredoka, Nunito, "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * .16);
    ctx.strokeStyle = 'rgba(2,10,24,.85)'; ctx.strokeText(str, x, y);
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.restore();
}

function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0 && !REDUCED) { const a = shake * S * .03; ctx.translate((Math.random() - .5) * a, (Math.random() - .5) * a); }
    if (bg) ctx.drawImage(bg, 0, 0, W, H);

    for (const p of pieces) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.drawImage(p.c, -p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
    }
    for (const o of objs) {
        const sp = sprites[o.t];
        if (!sp) continue;
        ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot);
        if (o.t === 'bomb') {
            const r = sp.h * .5, pulse = .5 + .5 * Math.sin(now / 140);
            const gr = ctx.createRadialGradient(0, sp.h * .1, r * .5, 0, sp.h * .1, r * 1.5);
            gr.addColorStop(0, `rgba(239,71,111,${.28 + pulse * .22})`); gr.addColorStop(1, 'rgba(239,71,111,0)');
            ctx.fillStyle = gr; ctx.fillRect(-r * 1.6, -r * 1.5, r * 3.2, r * 3.2);
        }
        ctx.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
        if (o.t === 'bomb') {
            const sx = sp.h * .16, sy = -sp.h * .42, f = Math.sin(now / 35);
            ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(sx, sy, sp.h * (.045 + .015 * f), 0, 7); ctx.fill();
            ctx.fillStyle = '#ff7a33'; ctx.beginPath(); ctx.arc(sx, sy, sp.h * .025, 0, 7); ctx.fill();
        }
        ctx.restore();
    }
    for (const d of drops) {
        ctx.globalAlpha = 1 - d.age / d.life; ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // traînée de lame
    while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();
    if (trail.length > 1) {
        ctx.lineCap = 'round';
        for (const [col, mul] of [['rgba(91,200,245,', 1.9], ['rgba(255,255,255,', 1]]) {
            for (let i = 1; i < trail.length; i++) {
                const k = 1 - (now - trail[i].t) / TRAIL_MS;
                if (k <= 0) continue;
                ctx.strokeStyle = col + (k * .9) + ')';
                ctx.lineWidth = Math.max(1, S * .028 * k * mul);
                ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
            }
        }
    }

    for (const f of floats) {
        const k = f.age / f.life;
        label(f.text, f.x, f.y - k * S * .12, f.size, f.color, 1 - k * k);
    }
    if (combo) {
        const k = combo.age, pop = k < .15 && !REDUCED ? 1 + .35 * (1 - k / .15) : 1;
        const a = k < .6 ? 1 : 1 - (k - .6) / .4;
        const x = Math.max(S * .2, Math.min(W - S * .2, combo.x)), y = Math.max(S * .3, combo.y - S * .12);
        label(`x${combo.n}`, x, y, S * .17 * pop, '#ffd84d', a);
        label(`+${combo.pts}`, x, y + S * .12, S * .07, '#fff', a);
    }

    if (boom) {
        const k = boom.age / .7, r = S * (.1 + .6 * k);
        const gr = ctx.createRadialGradient(boom.x, boom.y, 0, boom.x, boom.y, r);
        gr.addColorStop(0, `rgba(255,236,160,${1 - k})`); gr.addColorStop(.5, `rgba(255,122,51,${.8 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,122,51,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(boom.x, boom.y, r, 0, 7); ctx.fill();
    }
    if (lifeFlash > 0) {
        const gr = ctx.createLinearGradient(0, H, 0, H * .7);
        gr.addColorStop(0, `rgba(239,71,111,${.45 * lifeFlash})`); gr.addColorStop(1, 'rgba(239,71,111,0)');
        ctx.fillStyle = gr; ctx.fillRect(0, H * .7, W, H * .3);
    }
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${.7 * flash})`; ctx.fillRect(0, 0, W, H); }
}

function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, .05);
    lastTime = now;
    if (state === 'running') { update(dt); renderTime(); }
    if (state !== 'paused') updateFx(dt);
    draw(now);
    requestAnimationFrame(loop);
}

// ── Records en ligne ──
async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}

async function refreshWorldRecord() {
    try {
        if (!fb || !(await isOnline())) return false;
        const data = await fb.getFirebaseRecordData(FB_GAME, FB_KEY);
        if (data == null) {
            if (worldBest.score > 0) return false;
            worldBest = { score: 0, ms: 0 }; worldMsg = '';
            renderWorld();
            return true;
        }
        worldBest = parseRemote(data);
        worldMsg = (data && data.message) || '';
        renderWorld();
        return true;
    } catch (e) { console.error('Firebase records error:', e); return false; }
}

async function initOnline() {
    try {
        [fb, net] = await Promise.all([
            import('../../../js/firebaseWrk.js'),
            import('../../../js/network.js')
        ]);
        await refreshWorldRecord();
    } catch (e) { console.warn('Mode hors ligne :', e); }
}

function renderRecords() {
    $('recPersonalScore').textContent = bestRec.score > 0 ? bestRec.score : '—';
    $('recPersonalTime').textContent = bestRec.score > 0 ? fmtDuration(bestRec.ms) : '—';
    $('recGlobalScore').textContent = worldBest.score > 0 ? worldBest.score : '—';
    $('recGlobalTime').textContent = worldBest.score > 0 ? fmtDuration(worldBest.ms) : '—';
}

$('recordsBtn').addEventListener('click', async () => {
    if (state === 'over') return;
    pauseGame();
    recordsOverlay.classList.add('open');
    renderRecords();
    $('recStatus').textContent = 'Synchronisation...';

    const card = $('recGlobalCard');
    card.querySelectorAll('.rc-message').forEach(m => m.remove());
    const addMsg = (msg) => {
        if (!msg) return;
        const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${msg} »`; card.appendChild(m);
    };
    try {
        if (fb && await isOnline()) {
            const ok = await refreshWorldRecord();
            renderRecords();
            addMsg(worldMsg);
            $('recStatus').textContent = ok ? 'À jour (Cloud)' : 'Erreur de connexion';
        } else {
            addMsg(worldMsg);
            $('recStatus').textContent = 'Hors ligne (Records locaux)';
        }
    } catch (e) {
        console.error('Firebase records error:', e);
        addMsg(worldMsg);
        $('recStatus').textContent = 'Erreur de connexion';
    }
});
$('recordsClose').addEventListener('click', () => recordsOverlay.classList.remove('open'));
recordsOverlay.addEventListener('click', (e) => { if (e.target === recordsOverlay) recordsOverlay.classList.remove('open'); });

saveRecordMsgBtn.addEventListener('click', async () => {
    if (!pendingRecord) return;
    const rec = pendingRecord;
    const message = recordMsgInput.value.trim().substring(0, 50);
    saveRecordMsgBtn.disabled = true;
    saveRecordMsgBtn.textContent = 'Enregistrement...';

    let published = false, beaten = false;
    try {
        if (fb) {
            const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
            if (fresh && !isBetter(rec, worldBest)) {
                beaten = true;
            } else {
                const res = await Promise.race([
                    fb.setFirebaseLeaderboard(FB_GAME, FB_KEY, {
                        value: rec.score, duration: rec.ms, message, timestamp: Date.now()
                    }),
                    wait(4000, false)
                ]);
                published = res === true;
            }
        }
    } catch (e) { console.error('Error saving record message:', e); }

    if (published) {
        worldBest = { score: rec.score, ms: rec.ms }; worldMsg = message; renderWorld(); save();
        setWorldStatus('🌍 Record mondial publié !');
    } else if (beaten) {
        setWorldStatus('Un autre joueur a battu ce record entre-temps.');
    } else {
        setWorldStatus('Record mondial non publié : connexion indisponible.');
    }

    saveRecordMsgBtn.disabled = false;
    saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'none';
    pendingRecord = null;
});
recordMsgInput.addEventListener('input', () => { recordCharCounter.textContent = `${recordMsgInput.value.length}/50`; });

// ── Boutons / init ──
function closeRules() { rulesOverlay.classList.remove('open'); resumeGame(); }

$('playBtn').addEventListener('click', startGame);
$('startRulesBtn').addEventListener('click', () => rulesOverlay.classList.add('open'));
$('rulesBtn').addEventListener('click', () => { pauseGame(false); rulesOverlay.classList.add('open'); });
$('rulesClose').addEventListener('click', closeRules);
rulesOverlay.addEventListener('click', (e) => { if (e.target === rulesOverlay) closeRules(); });
$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', resumeGame);
$('restartPauseBtn').addEventListener('click', startGame);
$('menuPauseBtn').addEventListener('click', () => { window.location.href = '../../index.html'; });
$('goRestartBtn').addEventListener('click', startGame);
$('goMenuBtn').addEventListener('click', () => { window.location.href = '../../index.html'; });

resize();
loadImages();
if (load() && (started || gameOver)) {
    renderAll();
    startOverlay.classList.remove('open');
    if (gameOver) { state = 'over'; showOver(false); }
    else { state = 'paused'; pauseOverlay.classList.add('open'); }
} else {
    newGame();
}
lastTime = performance.now();
requestAnimationFrame(loop);
const onlineReady = initOnline();
