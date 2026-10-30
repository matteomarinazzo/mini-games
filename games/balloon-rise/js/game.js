// Balloon Rise V3 – game.js · cache local "balloon-rise" + records mondiaux Firebase (leaderboards/balloon_rise/{score,time})

// ── CONST ──
const W = 360, H = 540;                       // monde logique (canvas mis à l'échelle)
const SCROLL = 130;                           // vitesse constante du monde (le ballon "monte")
const BX = 180, BY = 440, BR = 20, PR = 22;   // ancrage ballon, rayon ballon, rayon du disque-curseur (SOLIDE, un seul cercle)
// m = masse, e = rebond, r = rayon, ext = demi-taille pour sortie d'écran
const TYPES = {
    ball: { r: 12, m: 1, e: .55, pts: 10, ext: 12 },
    bar: { r: 7, hl: 28, m: 2.6, e: .35, pts: 25, ext: 36 },
    spike: { r: 15, m: 6, e: .2, pts: 40, ext: 18 }
};
const RAMP_S = 240;                           // durée de montée de la difficulté
const TIERS = [0, 35, 80, 130, 190];          // seuils (s) de déblocage des épreuves de difficulté 1..5
const OWN_MAX = 170, DRIFT_MAX = 70;
const MAX_OBJS = 90, PV_MAX = 1100, PTR_MAX = 2200;
const OVER_DELAY_MS = 800;
const WORLD_MIN_SCORE = 10, WORLD_MIN_MS = 5000;
const STORAGE_KEY = 'balloon-rise';
const FB_GAME = 'balloon_rise';
const FB_KEYS = { score: 'score', ms: 'time' };   // { value, message, timestamp } (temps en ms)

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const num = (v) => typeof v === 'number' && isFinite(v);

// ── État ──
let state = 'ready';          // ready | running | paused | over
let score = 0, elapsed = 0, spawnIn = 0.6, lastSaveT = 0;
let started = false, gameOver = false, recS = false, recT = false;
let lastTime = 0, runId = 0, pending = null;
let objs = [], parts = [], floats = [], pop = null;
let best = { score: 0, ms: 0 }, world = { score: 0, ms: 0 }, wmsg = { score: '', ms: '' };
let fb = null, net = null;
const ptr = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, hit: 0, on: false };
let shake = 0, dirtySave = false;

const cv = $('game'), ctx = cv.getContext('2d');
const scoreEl = $('scoreValue'), timeEl = $('timeValue');
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
const normRec = (r) => (r && typeof r === 'object') ? { score: Number(r.score) || 0, ms: Number(r.ms) || 0 } : { score: 0, ms: 0 };

// ── Persistance (par événement) ──
function save() {
    lastSaveT = performance.now();
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            score, elapsedMs: Math.round(elapsed), spawnIn, started, gameOver, recS, recT,
            objs: objs.map(o => ({ t: o.t, x: o.x, y: o.y, dx: o.dx, own: o.own, vx: o.vx, vy: o.vy, rot: o.rot, vr: o.vr, touched: o.touched, r: o.r, hl: o.hl, c: o.c })),
            record: best, world, wmsg
        }));
    } catch { /* stockage indisponible */ }
}
function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* ignoré */ }
    if (!d || typeof d !== 'object') return false;
    best = normRec(d.record); world = normRec(d.world);
    if (d.wmsg && typeof d.wmsg === 'object') wmsg = { score: String(d.wmsg.score || ''), ms: String(d.wmsg.ms || '') };
    if (!num(d.score) || !num(d.elapsedMs) || !Array.isArray(d.objs)) return false;
    score = Math.max(0, Math.floor(d.score));
    elapsed = Math.max(0, d.elapsedMs);
    spawnIn = num(d.spawnIn) ? d.spawnIn : 0.6;
    started = !!d.started; gameOver = !!d.gameOver; recS = !!d.recS; recT = !!d.recT;
    objs = d.objs.filter(o => o && TYPES[o.t] && [o.x, o.y, o.dx, o.own, o.rot, o.vr].every(num))
        .map(o => Object.assign(mk(o.t, o.x, o.y, { r: num(o.r) ? o.r : 0, hl: num(o.hl) ? o.hl : 0, c: num(o.c) ? o.c : undefined }),
            { dx: o.dx, own: o.own, vx: num(o.vx) ? o.vx : o.dx, vy: num(o.vy) ? o.vy : SCROLL + o.own, rot: o.rot, vr: o.vr, touched: !!o.touched }));
    return true;
}

// ── Canvas ──
let sky = null;
function resize() {
    const s = Math.min((innerWidth - 16) / W, (innerHeight - 52 - 16) / H, 1.4);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = Math.floor(W * s) + 'px';
    cv.style.height = Math.floor(H * s) + 'px';
    cv.width = Math.floor(W * s * dpr);
    cv.height = Math.floor(H * s * dpr);
    ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#3a8fd0'); sky.addColorStop(.6, '#7cc8f0'); sky.addColorStop(1, '#c9ecfb');
}
window.addEventListener('resize', resize);

// ── Géométrie ──
function core(o, px, py) {       // point de l'âme de l'objet (point ou segment) le plus proche de (px,py)
    if (o.t !== 'bar') return [o.x, o.y];
    const c = Math.cos(o.rot) * o.hl, s = Math.sin(o.rot) * o.hl;
    const ax = o.x - c, ay = o.y - s, dx = 2 * c, dy = 2 * s;
    const k = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    return [ax + dx * k, ay + dy * k];
}
function dist(px, py, o) { const [cx, cy] = core(o, px, py); return Math.hypot(px - cx, py - cy) - o.r; }
const balloonPos = () => {
    const t = elapsed / 1000, a = 10 + 12 * Math.min(t / RAMP_S, 1);   // le balancement grandit : on ne peut pas "camper" au-dessus
    return [BX + Math.sin(t * 1.3) * a, BY + Math.sin(t * 2.1) * 4];
};

// ── Objets (taille variable : r = rayon / épaisseur, hl = demi-longueur des barres) ──
function mk(t, x, y, o = {}) {
    const T = TYPES[t], r = o.r || T.r, hl = t === 'bar' ? (o.hl || T.hl) : 0;
    const m = t === 'bar' ? T.m * (hl / T.hl) * (r / T.r) : T.m * (r / T.r) ** 2;
    const dx = o.dx || 0, own = o.own || 0;
    return {
        t, x, y, dx, own, vx: dx, vy: SCROLL + own, touched: false, r, hl, m,
        rot: o.rot !== undefined ? o.rot : t === 'spike' ? rnd(0, 6.28) : 0, vr: t === 'spike' ? rnd(-1.6, 1.6) : 0,
        ext: t === 'bar' ? hl + r : t === 'spike' ? r * 1.3 : r,
        c: o.c !== undefined ? o.c : t === 'ball' ? (r < 16 ? 0 : r < 26 ? 1 : 2) : 0,
        pts: Math.round(T.pts * Math.sqrt(m / T.m))
    };
}

// ── Épreuves : groupes d'obstacles tirés au sort, de plus en plus durs ──
// Chaque fabrique renvoie des specs { t, x, u (hauteur au-dessus de la ligne d'apparition), r, hl, rot, c }.
const B = (x, u, r = 12, c) => ({ t: 'ball', x, u, r, c });
const BAR = (x, u, hl, rot = 0, r) => ({ t: 'bar', x, u, hl, rot, r });
const SP = (x, u, r = 14) => ({ t: 'spike', x, u, r });
const rx = (m = 40) => rnd(m, W - m);
const sgn = () => Math.random() < .5 ? -1 : 1;
const wall = (r, nGaps, gw, rows = 1, c) => (g) => {          // rangée(s) de billes avec des trous
    const n = Math.floor((W + 20) / (r * 2 + 4)), sp = (W + 20) / n, out = [];
    for (let row = 0; row < rows; row++) {
        const skip = new Set();
        for (let q = 0; q < nGaps; q++) {
            const gi = clamp(Math.round((g.bx + sgn() * rnd(40, 130) + 10) / sp - .5), 1, n - 2);
            for (let w = 0; w < gw; w++) skip.add(gi + w);
        }
        for (let i = 0; i < n; i++) if (!skip.has(i)) out.push(B(-10 + sp * (i + .5), row * 64, r, c));
    }
    return out;
};
const PATS = [
    // ── difficulté 1 ──
    { d: 1, c: .8, f: () => [B(rx(), 0, 12)] },
    { d: 1, c: 1.1, f: () => { const x = rx(60); return [B(x - 24, 0), B(x + 22, 16), B(x, 44)]; } },
    { d: 1, c: 1.2, f: (g) => [B(clamp(g.bx + rnd(-30, 30), 45, W - 45), 0, rnd(26, 36))] },                    // grosse bille visant le ballon
    { d: 1, c: 1.3, f: () => Array.from({ length: 6 }, (_, i) => B(rx(), i * 42, rnd(9, 14))) },                  // ondée
    // ── difficulté 2 ──
    { d: 2, c: 1.6, f: wall(12, 2, 2) },                                                                          // mur de billes, 2 trous
    { d: 2, c: 1.6, f: () => {                                                                                    // longue barre portant une rangée de billes
        const hl = rnd(70, 100), x = clamp(rx(110), hl, W - hl), n = Math.floor(hl * 2 / 30);
        return [BAR(x, 0, hl, rnd(-.12, .12)), ...Array.from({ length: n }, (_, i) => B(x + (i - (n - 1) / 2) * 30, 20, 12))];
    } },
    { d: 2, c: 1.7, f: () => { const o = [18, 30, 22].sort(() => Math.random() - .5); return [B(60, 0, o[0]), B(180, 24, o[1]), B(300, 0, o[2])]; } }, // trois billes de tailles différentes
    { d: 2, c: 1.5, f: () => Array.from({ length: 10 }, (_, i) => B(25 + i * 34, 34 + Math.sin(i * .9) * 28, 10)) }, // vague de billes
    { d: 2, c: 1.5, f: (g) => { const cx = clamp(g.bx + rnd(-90, 90), 90, W - 90); return [BAR(cx - 72, 0, 62, .5), BAR(cx + 72, 0, 62, -.5)]; } }, // entonnoir
    // ── difficulté 3 ──
    { d: 3, c: 2, f: wall(12, 1, 2, 2) },                                                                         // double mur
    { d: 3, c: 1.9, f: () => { const cx = rx(110), a = sgn() * .8; return [BAR(cx, 0, 50, a), BAR(cx, 0, 50, -a), SP(cx, 0, 11)]; } },   // croix + pique
    { d: 3, c: 1.9, f: () => { const sx = sgn(); return Array.from({ length: 8 }, (_, i) => B(sx > 0 ? 30 + i * 43 : W - 30 - i * 43, i * 28, 11)); } }, // escalier de billes
    { d: 3, c: 2, f: () => { const x = rx(110); return [B(x, 0, 32, 2), ...Array.from({ length: 5 }, (_, i) => { const a = i * 1.2566; return B(x + Math.cos(a) * 52, Math.sin(a) * 52, 8, 3); })]; } }, // grosse bille et satellites
    { d: 3, c: 2.1, f: () => { const a = rnd(-.3, .3); return [BAR(W / 2 + rnd(-30, 30), 0, 140, a)]; } },       // barre géante
    { d: 3, c: 2, f: () => { const n = 5, o = rnd(0, 40); return Array.from({ length: n }, (_, i) => i === 2 ? null : SP(40 + i * 70 + o * .3, 0, 13)).filter(Boolean); } }, // rangée de piques
    // ── difficulté 4 ──
    { d: 4, c: 2.4, f: () => { const x = rx(80), u = 40; return [SP(x, u, 15), ...Array.from({ length: 8 }, (_, i) => { const a = i * .7854; return B(x + Math.cos(a) * 44, u + Math.sin(a) * 44, 9, 3); })]; } }, // pique cerclé de billes
    { d: 4, c: 2.3, f: () => { const hl = 80, x = rx(hl + 25); return [BAR(x, 0, hl, rnd(-.15, .15)), SP(x - hl - 14, 0, 13), SP(x + hl + 14, 0, 13)]; } },     // barre aux piques
    { d: 4, c: 2.6, f: () => [BAR(95, 0, 80, .22), BAR(265, 95, 80, -.22), BAR(95, 190, 80, .22)] },            // zigzag de barres
    { d: 4, c: 2.4, f: wall(14, 1, 2, 2, 3) },                                                                    // double mur de grosses billes
    // ── difficulté 5 ──
    { d: 5, c: 3.2, f: wall(11, 1, 2, 3) },                                                                       // rideau : 3 murs à trous différents
    { d: 5, c: 3, f: (g) => [B(70, 0, 34), B(290, 0, 34), SP(180, 0, 16), BAR(180, 70, 100, 0), ...[0, 1, 2, 3].map(i => B(120 + i * 40, 92, 11))] },
    { d: 5, c: 3, f: () => [BAR(105, 0, 90, .35), BAR(255, 0, 90, -.35), ...[0, 1, 2].map(i => SP(100 + i * 80, 78 + i % 2 * 30, 13))] }
];
let lastPat = -1;
function spawn(t) {                // renvoie le délai avant la prochaine épreuve
    const k = Math.min(t / RAMP_S, 1), dmax = TIERS.filter(s => t >= s).length;
    const cand = PATS.map((p, i) => [p, i]).filter(([p, i]) => p.d <= dmax && i !== lastPat);
    const wts = cand.map(([p]) => p.d === 1 ? 1.6 - k : 1 + (p.d - 1) * k * 2);
    let r = Math.random() * wts.reduce((a, b) => a + b, 0), pick = cand[cand.length - 1];
    for (let i = 0; i < cand.length; i++) { r -= wts[i]; if (r <= 0) { pick = cand[i]; break; } }
    const [pat, idx] = pick;
    const own = rnd(0, 1) * lerp(0, OWN_MAX * .7, k), dx = rnd(-1, 1) * lerp(0, DRIFT_MAX * .7, k);
    const [bx, by] = balloonPos();
    const specs = pat.f({ bx: clamp(bx - dx * (by + 60) / (SCROLL + own), 30, W - 30) });
    if (objs.length + specs.length > MAX_OBJS) return .4;
    lastPat = idx;
    let h = 0;
    for (const sp of specs) {
        const o = mk(sp.t, clamp(sp.x, -20, W + 20), 0, { ...sp, dx, own });
        o.y = -o.ext - 6 - sp.u; objs.push(o);
        h = Math.max(h, sp.u + o.ext * 2);
    }
    save();
    return Math.max(lerp(1.5, .8, k) * pat.c * rnd(.85, 1.15), (h + 50) / (SCROLL + own));
}

// ── Collision disque-curseur ↔ objet : le curseur est un solide, rien ne le chevauche jamais ──
function hitPtr(o, px, py) {
    const T = TYPES[o.t], [cx, cy] = core(o, px, py), R = PR + o.r;
    let nx = cx - px, ny = cy - py, d = Math.hypot(nx, ny);
    if (d >= R) return;
    if (d < 1e-3) { nx = 0; ny = 1; } else { nx /= d; ny /= d; }
    const pen = R - d;
    o.x += nx * pen; o.y += ny * pen;                       // dégagement positionnel immédiat (même curseur immobile)
    const vn = (o.vx - ptr.vx) * nx + (o.vy - ptr.vy) * ny;  // vitesse normale relative
    let j = 0;
    if (vn < 0) {                                           // l'objet fonce vers le curseur : on le renvoie
        j = -vn * (1 + T.e) / Math.sqrt(o.m);
        o.vx += nx * j; o.vy += ny * j;
        if (o.t === 'bar') o.vr = clamp(o.vr + ((cx - o.x) * ny - (cy - o.y) * nx) * j * .004, -7, 7);
        else if (o.t === 'spike') o.vr = clamp(o.vr + ((o.vx - ptr.vx) * -ny + (o.vy - ptr.vy) * nx) * .004, -7, 7);
    }
    if (Math.abs(nx) < .12) o.vx += (o.x >= px ? 1 : -1) * 14;   // pas d'équilibre instable : l'objet glisse sur le côté
    const sp = Math.hypot(o.vx, o.vy);
    if (sp > PV_MAX) { o.vx *= PV_MAX / sp; o.vy *= PV_MAX / sp; }
    if (!o.touched) { o.touched = true; dirtySave = true; }
    if (j > 60) {
        ptr.hit = .18;
        for (let k = 0; k < 2 && parts.length < 140; k++) {
            const a = Math.atan2(ny, nx) + rnd(-1.2, 1.2), v = rnd(60, 180);
            parts.push({ x: px + nx * PR, y: py + ny * PR, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rnd(1.2, 2.6), life: rnd(.18, .35), age: 0, c: '#fff6c4', g: 0 });
        }
    }
}

// ── Mise à jour ──
function update(dt) {
    elapsed += dt * 1000;
    const t = elapsed / 1000;
    spawnIn -= dt;
    if (spawnIn <= 0) spawnIn = spawn(t);

    // 1) physique libre : chaque objet revient doucement vers sa trajectoire de base (inertie plus longue pour les lourds)
    for (const o of objs) {
        const k = 1 - Math.exp(-dt * 1.6 / Math.sqrt(o.m));
        o.vx += (o.dx - o.vx) * k; o.vy += (SCROLL + o.own - o.vy) * k;
        o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
        o.vr *= Math.exp(-dt * (o.t === 'spike' ? .15 : 1.2));
        if (o.t === 'bar' && Math.abs(o.vr) < .05) o.vr = 0;
    }

    // 2) curseur solide : balayage en sous-pas (pas de traversée à grande vitesse), puis résolution même à l'arrêt
    if (ptr.on) {
        const dx = ptr.x - ptr.px, dy = ptr.y - ptr.py, len = Math.hypot(dx, dy);
        let rx = dx / dt, ry = dy / dt; const sp = Math.hypot(rx, ry);
        if (sp > PTR_MAX) { rx *= PTR_MAX / sp; ry *= PTR_MAX / sp; }
        ptr.vx = lerp(ptr.vx, rx, .65); ptr.vy = lerp(ptr.vy, ry, .65);
        const steps = clamp(Math.ceil(len / 6), 1, 60);
        for (let s = 1; s <= steps; s++) {
            const px = ptr.px + dx * s / steps, py = ptr.py + dy * s / steps;
            for (const o of objs) hitPtr(o, px, py);
        }
        ptr.px = ptr.x; ptr.py = ptr.y;
    } else { ptr.vx = ptr.vy = 0; }

    // 3) ballon / sorties
    const [bx, by] = balloonPos();
    let dirty = dirtySave; dirtySave = false;
    for (let i = objs.length - 1; i >= 0; i--) {
        const o = objs[i];
        if (dist(bx, by - 2, o) < BR) { popBalloon(bx, by, o); return; }
        const e = o.ext;
        if (o.y - e > H || o.x + e < 0 || o.x - e > W || o.y < -450) {
            objs.splice(i, 1);
            if (o.touched) {
                score += o.pts;
                floats.push({ x: clamp(o.x, 30, W - 30), y: clamp(o.y, 40, H - 30), text: `+${o.pts}`, age: 0 });
                scoreEl.classList.add('level-up');
                setTimeout(() => scoreEl.classList.remove('level-up'), 400);
                renderAll();
            }
            dirty = true;
        }
    }
    if (dirty || performance.now() - lastSaveT > 1000) save();
}

// ── Fin de partie ──
function popBalloon(bx, by, o) {
    pop = { x: bx, y: by, age: 0 };
    if (!REDUCED) shake = .45;
    for (let k = 0; k < 16; k++) {
        const a = rnd(0, 6.28), v = rnd(60, 260);
        parts.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, r: rnd(2, 5), life: rnd(.4, .8), age: 0 });
    }
    objs = objs.filter(q => q !== o);
    endGame();
}
function endGame() {
    if (state === 'over') return;
    gameOver = true; state = 'over';
    const ms = Math.round(elapsed);
    recS = score > best.score; recT = ms > best.ms;
    if (recS) best.score = score;
    if (recT) best.ms = ms;
    save();
    const id = runId;
    setTimeout(() => { if (id === runId) showOver(true); }, OVER_DELAY_MS);
}

// Messages : 4 cas (les deux / points seuls / temps seul / aucun)
function caseMsg(s, t, mondial) {
    const w = mondial ? ' mondial' : '';
    if (s && t) return `🏆 Double record${w} ! Plus de points et plus de temps : tu es intouchable.`;
    if (s) return `⭐ Record${w} de points ! Tu dégages tout sur ton passage.`;
    if (t) return `⏱️ Record${w} de temps ! Ta prudence paie, tu tiens plus longtemps que jamais.`;
    return 'Pas de record cette fois. Le ballon est prêt, retente ta chance !';
}
function setWorldStatus(text) { $('goWorldStatus').textContent = text; }
function showOver(check) {
    const ms = Math.round(elapsed);
    $('goEmoji').textContent = (recS || recT) ? '🏆' : '💥';
    $('goTitle').textContent = (recS || recT) ? 'Nouveau record !' : 'Pouf !';
    $('goScore').textContent = score;
    $('goTime').textContent = fmtDuration(ms);
    $('goBestScore').textContent = best.score > 0 ? best.score : '—';
    $('goBestTime').textContent = best.ms > 0 ? fmtDuration(best.ms) : '—';
    $('goMsg').textContent = caseMsg(recS, recT, false);
    gameoverOverlay.classList.add('open');
    if (check && (score >= WORLD_MIN_SCORE || ms >= WORLD_MIN_MS)) checkWorldRecord(score, ms, runId);
    else setWorldStatus('');
}

async function checkWorldRecord(s, ms, myRun) {
    setWorldStatus('Vérification des records mondiaux…');
    try {
        await Promise.race([onlineReady, wait(2500)]);
        if (myRun !== runId) return;
        const online = await Promise.race([isOnline(), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!online || !fb) { setWorldStatus('Hors ligne : records mondiaux indisponibles. Tes records personnels restent sauvegardés.'); return; }
        const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!fresh) { setWorldStatus('Records mondiaux indisponibles pour le moment.'); return; }

        const wbS = s >= WORLD_MIN_SCORE && s > world.score, wbT = ms >= WORLD_MIN_MS && ms > world.ms;
        if (wbS || wbT) {
            pending = {}; if (wbS) pending.score = s; if (wbT) pending.ms = ms;
            $('goEmoji').textContent = '🏆';
            $('goTitle').textContent = wbS && wbT ? 'Records mondiaux !' : 'Record mondial !';
            $('goMsg').textContent = caseMsg(wbS, wbT, true);
            setWorldStatus('🌍 Tu bats ' + (wbS && wbT ? 'les records mondiaux !' : 'un record mondial !'));
            recordMessagePopup.style.display = 'flex';
            recordMsgInput.value = ''; recordCharCounter.textContent = '0/50';
            setTimeout(() => recordMsgInput.focus(), 100);
        } else {
            setWorldStatus(`Records mondiaux : ${world.score} pts · ${fmtDuration(world.ms)}`);
        }
    } catch (e) {
        console.error('Firebase records error:', e);
        if (myRun === runId) setWorldStatus('Records mondiaux indisponibles pour le moment.');
    }
}

// ── Effets ──
function updateFx(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += (p.g === undefined ? 500 : p.g) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.age += dt;
        if (p.age >= p.life) parts.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) { floats[i].age += dt; if (floats[i].age > .9) floats.splice(i, 1); }
    if (pop) { pop.age += dt; if (pop.age > .5) pop = null; }
    if (shake > 0) shake = Math.max(0, shake - dt);
    if (ptr.hit > 0) ptr.hit = Math.max(0, ptr.hit - dt);
}

// ── Rendu ──
const PAL = [['#e4fff0', '#3fe08f', '#0c8a4c', 'rgba(4,70,42,.55)'], ['#e6f6ff', '#4cc3ff', '#0b64a8', 'rgba(5,40,90,.55)'], ['#f3e8ff', '#b07cff', '#5a2ba8', 'rgba(40,10,90,.55)'], ['#fff8d0', '#ffd84d', '#c27a06', 'rgba(110,60,0,.55)']];
const SKY = [[[58, 143, 208], [124, 200, 240], [214, 240, 252]], [[12, 24, 70], [92, 62, 146], [255, 160, 124]]];   // jour → crépuscule d'altitude
const mix = (a, b, k) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',')})`;
const STARS = Array.from({ length: 36 }, (_, i) => [(i * 97) % W, (i * 173) % H, .7 + (i % 4) * .4, i * 1.7]);
const CLOUDS = [[30, 30, 1, .35, .5], [250, 120, 1.4, .55, .6], [130, 230, .8, .3, .4], [300, 330, 1.1, .7, .65], [60, 420, 1.5, .5, .55], [200, 500, .9, .28, .35], [320, 20, .7, .25, .35]];
const cloudSpr = (() => {
    const c = document.createElement('canvas'); c.width = 180; c.height = 90;
    const g = c.getContext('2d');
    for (const [x, y, r] of [[50, 56, 28], [86, 42, 34], [124, 54, 27], [100, 64, 22], [68, 66, 22]]) {
        const gr = g.createRadialGradient(x, y, r * .15, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    return c;
})();
function drawBg(t) {
    const k = smooth(t / 300);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix(SKY[0][0], SKY[1][0], k)); g.addColorStop(.6, mix(SKY[0][1], SKY[1][1], k)); g.addColorStop(1, mix(SKY[0][2], SKY[1][2], k));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (k > .3) {
        ctx.fillStyle = '#fff';
        for (const [x, y0, s, ph] of STARS) {
            const y = (y0 + t * 8 * s) % H;
            ctx.globalAlpha = (k - .3) / .7 * (.45 + .4 * Math.sin(t * 2 + ph)) * .8;
            ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
        }
    }
    for (const [x, y0, s, par, a] of CLOUDS) {
        const y = ((y0 + t * SCROLL * par) % (H + 160)) - 80;
        ctx.globalAlpha = a * (1 - k * .45);
        ctx.drawImage(cloudSpr, x - 90 * s, y - 45 * s, 180 * s, 90 * s);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {                      // traits de vent : sensation de montée
        const x = (i * 53 + 17) % W, len = 16 + (i % 4) * 9, y = ((t * SCROLL * (1.5 + (i % 3) * .5) + i * 61) % (H + 80)) - 40;
        ctx.globalAlpha = .5 - (i % 3) * .12;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
    }
    ctx.globalAlpha = 1;
}
function drawBalloon(bx, by, t, worry) {
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, by + 28);
    ctx.bezierCurveTo(bx + Math.sin(t * 2.2) * 7, by + 40, bx - Math.sin(t * 2.2 + 1) * 7, by + 52, bx + Math.sin(t * 2) * 4, by + 68); ctx.stroke();
    ctx.save(); ctx.translate(bx, by - 2); ctx.rotate(Math.cos(t * 1.3) * .07);
    ctx.fillStyle = '#a8132a'; ctx.beginPath(); ctx.moveTo(0, 23); ctx.lineTo(-5, 31); ctx.lineTo(5, 31); ctx.closePath(); ctx.fill();
    const g = ctx.createRadialGradient(-8, -12, 3, 0, 0, 32);
    g.addColorStop(0, '#ff9c9c'); g.addColorStop(.55, '#e63946'); g.addColorStop(1, '#8f0f24');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 20, 25, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 20, 25, 0, 0, 7); ctx.clip();
    ctx.fillStyle = 'rgba(255,238,220,.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 27, 0, 0, 7); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(-9, -12, 3.6, 8, .45, 0, 7); ctx.fill();
    ctx.fillStyle = '#2b1620';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 6.5, 1, 2.1 + worry * 1.1, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#2b1620'; ctx.lineWidth = 1.6; ctx.beginPath();
    if (worry > .35) ctx.ellipse(0, 11, 1.4 + worry * 2.2, 1.6 + worry * 2.6, 0, 0, 7); else ctx.arc(0, 6, 5, .25, Math.PI - .25);
    ctx.stroke();
    ctx.restore();
}
function drawObj(o, ox = 0, oy = 0) {
    ctx.save(); ctx.translate(o.x + ox, o.y + oy); ctx.rotate(o.rot);
    if (o.t === 'ball') {
        const P = PAL[o.c] || PAL[0];
        ctx.scale(o.r / 12, o.r / 12);
        const g = ctx.createRadialGradient(-4, -5, 1, 0, 0, 13);
        g.addColorStop(0, P[0]); g.addColorStop(.45, P[1]); g.addColorStop(1, P[2]);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
        ctx.strokeStyle = P[3]; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-4, -5, 2.6, 1.7, -.6, 0, 7); ctx.fill();
    } else if (o.t === 'bar') {
        const hl = o.hl, r = o.r;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#7a3305'; ctx.lineWidth = r * 2 + 2; ctx.beginPath(); ctx.moveTo(-hl, 0); ctx.lineTo(hl, 0); ctx.stroke();
        ctx.strokeStyle = '#e8791a'; ctx.lineWidth = r * 2 - 1; ctx.beginPath(); ctx.moveTo(-hl, 0); ctx.lineTo(hl, 0); ctx.stroke();
        ctx.strokeStyle = '#ffc874'; ctx.lineWidth = r * .7; ctx.beginPath(); ctx.moveTo(-hl, -r * .37); ctx.lineTo(hl, -r * .37); ctx.stroke();
        ctx.fillStyle = '#7a3305';
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * (hl - 1), 0, 2.2, 0, 7); ctx.fill(); }
        if (hl > 70) for (const s of [-.5, 0, .5]) { ctx.beginPath(); ctx.arc(s * hl, 0, 2, 0, 7); ctx.fill(); }
    } else {
        ctx.scale(o.r / 15, o.r / 15);
        ctx.fillStyle = '#ef476f'; ctx.strokeStyle = '#7d1030'; ctx.lineWidth = 1.2; ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            ctx.moveTo(Math.cos(a - .3) * 11, Math.sin(a - .3) * 11);
            ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
            ctx.lineTo(Math.cos(a + .3) * 11, Math.sin(a + .3) * 11);
        }
        ctx.fill(); ctx.stroke();
        const g = ctx.createRadialGradient(-4, -4, 1, 0, 0, 13);
        g.addColorStop(0, '#6a739c'); g.addColorStop(1, '#1c2038');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff5c7f'; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(-4, -4, 2.8, 0, 7); ctx.fill();
    }
    ctx.restore();
}
function draw() {
    const t = elapsed / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate(rnd(-1, 1) * shake * 16, rnd(-1, 1) * shake * 16);
    drawBg(t);
    for (const o of objs) {
        const ex = Math.hypot(o.vx - o.dx, o.vy - SCROLL - o.own);
        if (ex > 140) for (let i = 3; i >= 1; i--) {            // traînée des objets propulsés
            ctx.globalAlpha = .13 * (4 - i); drawObj(o, -o.vx * .013 * i, -o.vy * .013 * i);
        }
        ctx.globalAlpha = 1; drawObj(o);
    }
    if (!pop && state !== 'over') {
        const [bx, by] = balloonPos();
        let near = 999;
        for (const o of objs) near = Math.min(near, dist(bx, by - 2, o) - BR);
        drawBalloon(bx, by, t, clamp(1 - near / 70, 0, 1));
    }
    for (const p of parts) {
        ctx.globalAlpha = 1 - p.age / p.life; ctx.fillStyle = p.c || '#e63946';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (pop) {
        const k = pop.age / .5, r = 20 + 50 * k;
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(pop.x, pop.y, r, 0, 7); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of floats) {
        const k = f.age / .9;
        ctx.globalAlpha = 1 - k * k; ctx.font = '800 22px Fredoka, Nunito, "Trebuchet MS", system-ui, sans-serif';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(2,10,24,.85)'; ctx.strokeText(f.text, f.x, f.y - k * 30);
        ctx.fillStyle = '#ffd84d'; ctx.fillText(f.text, f.x, f.y - k * 30);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (ptr.on && state === 'running') {                // un seul cercle : le disque solide réel
        const h = ptr.hit / .18;
        const g = ctx.createRadialGradient(ptr.x, ptr.y, 2, ptr.x, ptr.y, PR);
        g.addColorStop(0, `rgba(255,255,255,${.28 + h * .2})`); g.addColorStop(1, `rgba(255,255,255,${.08 + h * .12})`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ptr.x, ptr.y, PR, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${.7 + h * .3})`; ctx.lineWidth = 2 + h * 1.5;
        ctx.beginPath(); ctx.arc(ptr.x, ptr.y, PR - 1, 0, 7); ctx.stroke();
    }
}
function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, .05);
    lastTime = now;
    if (state === 'running') { update(dt); renderTime(); }
    if (state !== 'paused') updateFx(dt);
    draw();
    requestAnimationFrame(loop);
}

// ── Entrées ──
function setPtr(e, reset) {
    const r = cv.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside && e.pointerType === 'mouse') { ptr.on = false; return; }
    const x = clamp((e.clientX - r.left) * W / r.width, 0, W), y = clamp((e.clientY - r.top) * H / r.height, 0, H);
    if (!ptr.on || reset) { ptr.px = x; ptr.py = y; }
    ptr.x = x; ptr.y = y; ptr.on = true;
}
cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    setPtr(e, true);
});
window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || ptr.on) setPtr(e, false); });
const release = (e) => { if (e.pointerType !== 'mouse') ptr.on = false; };
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
document.addEventListener('mouseleave', () => { ptr.on = false; });
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
function renderTime() { const s = fmtClock(elapsed); if (timeEl.textContent !== s) timeEl.textContent = s; }
function renderAll() { scoreEl.textContent = score; renderTime(); }

// ── Flux de jeu ──
function closeOverlays() {
    [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay].forEach(o => o.classList.remove('open'));
}
function newGame() {
    objs = []; parts = []; floats = []; pop = null;
    score = 0; elapsed = 0; spawnIn = .6; shake = 0; ptr.vx = ptr.vy = 0; ptr.hit = 0;
    started = false; gameOver = false; recS = recT = false; pending = null;
    setWorldStatus('');
    renderAll(); save();
}
function startGame() {
    closeOverlays();
    recordMessagePopup.style.display = 'none';
    runId++;
    newGame();
    started = true; state = 'running';
    ptr.px = ptr.x; ptr.py = ptr.y; ptr.vx = ptr.vy = 0;
    lastTime = performance.now();
    save();
}
function pauseGame(open = true) {
    if (state !== 'running') return;
    state = 'paused';
    save();
    if (open) pauseOverlay.classList.add('open');
}
function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    state = 'running';
    ptr.px = ptr.x; ptr.py = ptr.y; ptr.vx = ptr.vy = 0;
    lastTime = performance.now();
}

// ── Records en ligne ──
async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}
async function refreshWorldRecord() {
    try {
        if (!fb || !(await isOnline())) return false;
        const [ds, dt] = await Promise.all([
            fb.getFirebaseRecordData(FB_GAME, FB_KEYS.score),
            fb.getFirebaseRecordData(FB_GAME, FB_KEYS.ms)
        ]);
        const apply = (d, k) => {
            if (d == null) { if (world[k] > 0) return false; world[k] = 0; wmsg[k] = ''; return true; }
            world[k] = Number(typeof d === 'object' ? d.value : d) || 0;
            wmsg[k] = (d && d.message) || '';
            return true;
        };
        const a = apply(ds, 'score'), b = apply(dt, 'ms');
        return a && b;
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
    $('recPersonalScore').textContent = best.score > 0 ? best.score : '—';
    $('recPersonalTime').textContent = best.ms > 0 ? fmtDuration(best.ms) : '—';
    $('recGlobalScore').textContent = world.score > 0 ? world.score : '—';
    $('recGlobalTime').textContent = world.ms > 0 ? fmtDuration(world.ms) : '—';
}
$('recordsBtn').addEventListener('click', async () => {
    if (state === 'over') return;
    pauseGame();
    recordsOverlay.classList.add('open');
    renderRecords();
    $('recStatus').textContent = 'Synchronisation...';
    const cards = { score: $('recGlobalScoreCard'), ms: $('recGlobalTimeCard') };
    const addMsgs = () => {
        for (const k in cards) {
            cards[k].querySelectorAll('.rc-message').forEach(m => m.remove());
            if (!wmsg[k]) continue;
            const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${wmsg[k]} »`; cards[k].appendChild(m);
        }
    };
    try {
        if (fb && await isOnline()) {
            const ok = await refreshWorldRecord();
            renderRecords(); addMsgs();
            $('recStatus').textContent = ok ? 'À jour (Cloud)' : 'Erreur de connexion';
        } else {
            addMsgs();
            $('recStatus').textContent = 'Hors ligne (Records locaux)';
        }
    } catch (e) {
        console.error('Firebase records error:', e);
        addMsgs();
        $('recStatus').textContent = 'Erreur de connexion';
    }
});
$('recordsClose').addEventListener('click', () => recordsOverlay.classList.remove('open'));
recordsOverlay.addEventListener('click', (e) => { if (e.target === recordsOverlay) recordsOverlay.classList.remove('open'); });

saveRecordMsgBtn.addEventListener('click', async () => {
    if (!pending) return;
    const rec = pending;
    const message = recordMsgInput.value.trim().substring(0, 50);
    saveRecordMsgBtn.disabled = true;
    saveRecordMsgBtn.textContent = 'Enregistrement...';

    let pub = 0, lost = 0;
    const keys = Object.keys(rec);
    for (const k of keys) {                       // deux records indépendants : un flux par valeur
        try {
            if (!fb) continue;
            const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
            if (fresh && rec[k] <= world[k]) { lost++; continue; }
            const res = await Promise.race([
                fb.setFirebaseLeaderboard(FB_GAME, FB_KEYS[k], { value: rec[k], message, timestamp: Date.now() }),
                wait(4000, false)
            ]);
            if (res === true) { world[k] = rec[k]; wmsg[k] = message; pub++; }
        } catch (e) { console.error('Error saving record message:', e); }
    }
    if (pub) save();
    if (pub === keys.length) setWorldStatus(pub > 1 ? '🌍 Records mondiaux publiés !' : '🌍 Record mondial publié !');
    else if (pub) setWorldStatus('🌍 Un record publié, l’autre n’a pas pu l’être.');
    else if (lost) setWorldStatus('Un autre joueur a battu ce record entre-temps.');
    else setWorldStatus('Record mondial non publié : connexion indisponible.');

    saveRecordMsgBtn.disabled = false;
    saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'none';
    pending = null;
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
window.addEventListener('pagehide', () => { if (started && !gameOver) save(); });

resize();
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
