/**
 * Tap to Fly – game.js
 *
 * Arcade aérien : un poussin retombe en permanence, chaque toucher la fait s'élever.
 * Il faut passer entre des paires d'arbres. 1 point par paire franchie.
 * Dessin 100 % Canvas (aucune ressource externe). Solo uniquement.
 *
 * Organisation : 1. CONFIG · 2. ÉTAT/DOM · 3. JEU (physique, dessin) · 4. FLUX · 5. RECORDS · 6. INIT
 * Records : cache local "tap-to-fly" + record mondial Firebase (leaderboards/tap_to_fly/score).
 * Hors ligne : le jeu et le record personnel fonctionnent sans réseau.
 */

// ─────────────────────────────────────────────
// 1. CONFIG
// ─────────────────────────────────────────────
const W = 360, H = 540;            // monde logique (le canvas est mis à l'échelle)
const GROUND = H - 48;             // hauteur du sol
const BIRD_X = 100, BIRD_R = 13;   // position et rayon de collision de le poussin
const GRAVITY = 1500;              // px/s²
const FLAP_V = -420;               // impulsion vers le haut (px/s)
const MAX_FALL = 620;              // vitesse de chute maximale
const PIPE_W = 58;
const SPACING = 210;               // distance horizontale entre deux paires
const SPEED_START = 125, SPEED_MAX = 500, SPEED_STEP = 3;      // px/s, +STEP par point
const GAP_START = 160, GAP_MIN = 122, GAP_STEP = 1.5;          // taille du passage
const MAX_SHIFT = 150;             // écart vertical max entre deux passages consécutifs
const DEATH_MS = 750;              // chute avant l'écran de fin

const CACHE_KEY = 'tap-to-fly';    // clé localStorage { best, worldBest, worldMsg }
const FB_GAME = 'tap_to_fly';      // nœud Firebase : leaderboards/tap_to_fly/score
const FB_KEY = 'score';            // { value: score, message, timestamp }

// ─────────────────────────────────────────────
// 2. ÉTAT / DOM / CACHE
// ─────────────────────────────────────────────
let state = 'ready';   // ready | running | paused | dying | over
let waiting = true;    // vrai tant que le joueur n'a pas touché pour démarrer
let y = H / 2, vy = 0, score = 0, t = 0, deathT = 0;
let pipes = [], lastGapY = H / 2, lastTime = 0, runId = 0, pendingRecord = null;
let dist = 0, parts = [];   // distance parcourue (parallaxe) et particules

let cache = loadCache();
let best = Number(cache.best) || 0;
let worldBest = Number(cache.worldBest) || 0;
let fb = null, net = null;

const $ = (id) => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const scoreEl = $('scoreValue');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay'), pauseOverlay = $('pauseOverlay');
const gameoverOverlay = $('gameoverOverlay'), recordsOverlay = $('recordsOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } }
function saveCache(patch) {
    cache = { ...cache, ...patch };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* stockage indisponible */ }
}
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
const fmtScore = (n) => n > 0 ? String(n) : '—';

// Adapte le canvas à l'écran (ratio 2:3, net sur écrans HD)
function resize() {
    const s = Math.min((innerWidth - 16) / W, (innerHeight - 52 - 16) / H, 1.4);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = Math.floor(W * s) + 'px';
    canvas.style.height = Math.floor(H * s) + 'px';
    canvas.width = Math.floor(W * s * dpr);
    canvas.height = Math.floor(H * s * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}
window.addEventListener('resize', resize);

// ─────────────────────────────────────────────
// 3. JEU
// ─────────────────────────────────────────────
const speed = () => Math.min(SPEED_MAX, SPEED_START + score * SPEED_STEP);
const gap = () => Math.max(GAP_MIN, GAP_START - score * GAP_STEP);

function resetWorld() {
    y = H / 2; vy = 0; score = 0; t = 0; deathT = 0; dist = 0; parts = []; waiting = true;
    pipes = []; lastGapY = H / 2;
    scoreEl.textContent = '0';
}

function spawnPipe(x) {
    const g = gap(), lo = g / 2 + 50, hi = GROUND - g / 2 - 40;
    const c = Math.max(lo, Math.min(hi, lastGapY + (Math.random() * 2 - 1) * MAX_SHIFT));
    lastGapY = c;
    pipes.push({ x, c, g, passed: false });
}

function flap() {
    if (state !== 'running') return;
    waiting = false;
    vy = FLAP_V;
    burst(BIRD_X - 12, y + 6, 3, '#fff6b8', 40);
}

function die() {
    state = 'dying';
    deathT = 0;
    vy = Math.min(vy, -150);   // petit rebond avant la chute
    burst(BIRD_X, y, 14, '#ffd93b', 130);
}

function hitRect(rx, ry, rw, rh) {
    const cx = Math.max(rx, Math.min(BIRD_X, rx + rw)), cy = Math.max(ry, Math.min(y, ry + rh));
    return (BIRD_X - cx) ** 2 + (y - cy) ** 2 < BIRD_R * BIRD_R;
}

function update(dt) {
    t += dt;
    if (waiting) { y = H / 2 + Math.sin(t * 4) * 8; return; }
    vy = Math.min(MAX_FALL, vy + GRAVITY * dt);
    y += vy * dt;
    const dx = speed() * dt;
    dist += dx;
    for (const p of pipes) p.x -= dx;
    if (!pipes.length || pipes[pipes.length - 1].x < W - SPACING) spawnPipe(W + PIPE_W);
    if (pipes[0].x < -PIPE_W - 10) pipes.shift();

    for (const p of pipes) {
        if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
            p.passed = true; score++;
            scoreEl.textContent = score;
        }
        // collision cercle / rectangles (pilier haut et pilier bas)
        const top = p.c - p.g / 2, bot = p.c + p.g / 2;
        if (hitRect(p.x, 0, PIPE_W, top) || hitRect(p.x, bot, PIPE_W, GROUND - bot)) { die(); return; }
    }
    if (y + BIRD_R > GROUND || y - BIRD_R < 0) { y = Math.max(BIRD_R, Math.min(GROUND - BIRD_R, y)); die(); }
}

function updateDying(dt) {
    deathT += dt * 1000;
    vy = Math.min(MAX_FALL, vy + GRAVITY * dt);
    y = Math.min(GROUND - BIRD_R, y + vy * dt);
    if (deathT >= DEATH_MS) finishGame();
}

// ── Dessin ──
const rnd = (a, b) => a + Math.random() * (b - a);

function burst(x, yy, n, color, spread = 60) {
    for (let i = 0; i < n; i++) parts.push({ x, y: yy, vx: rnd(-spread, spread) - 20, vy: rnd(-spread, spread * .6), life: 1, c: color });
}
function updateParts(dt) {
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.life -= dt * 1.8; }
    parts = parts.filter(p => p.life > 0);
}

function blob(cx, cy, r, c1, c2) {
    const g = ctx.createRadialGradient(cx - r * .3, cy - r * .35, r * .1, cx, cy, r);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
}

// Arbre : tronc + feuillage à l'extrémité côté passage. `hang` = suspendu au plafond.
function drawTree(x, from, to, hang) {
    const tx = x + 9, tw = PIPE_W - 18, len = to - from;
    const g = ctx.createLinearGradient(tx, 0, tx + tw, 0);
    g.addColorStop(0, '#6b4423'); g.addColorStop(.5, '#a8713a'); g.addColorStop(1, '#5a3a1c');
    ctx.fillStyle = g; ctx.fillRect(tx, from, tw, len);
    ctx.strokeStyle = 'rgba(40,22,8,.35)'; ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(tx + tw * i / 4, from); ctx.lineTo(tx + tw * i / 4, to); ctx.stroke(); }
    ctx.fillStyle = 'rgba(40,22,8,.45)';                                  // nœuds
    for (let k = 0; k < len - 60; k += 70) { ctx.beginPath(); ctx.ellipse(tx + tw * (k % 3 ? .35 : .65), from + 40 + k, 4, 6, 0, 0, 7); ctx.fill(); }
    const end = hang ? to : from, d = hang ? -1 : 1;                      // feuillage collé au bord du passage
    for (const [ox, oy, r, c1, c2] of [[8, 14, 19, '#6fcf5a', '#2f8f3a'], [29, 17, 21, '#8be06a', '#37a041'], [50, 14, 19, '#6fcf5a', '#2f8f3a'], [19, 4, 14, '#a4ec7c', '#47b34a'], [40, 5, 14, '#a4ec7c', '#47b34a']])
        blob(x - 1 + ox, end + d * oy + (hang ? 0 : 0), r, c1, c2);
}

function drawChick() {
    const tilt = Math.max(-.45, Math.min(.85, vy / 650));
    ctx.save();
    ctx.translate(BIRD_X, y); ctx.rotate(tilt);
    const flapping = vy < 0 || waiting;
    // pattes
    ctx.strokeStyle = '#f08a24'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const lx of [-3, 4]) {
        ctx.beginPath(); ctx.moveTo(lx, 11); ctx.lineTo(lx - 1, 18); ctx.moveTo(lx - 1, 18); ctx.lineTo(lx - 5, 19); ctx.moveTo(lx - 1, 18); ctx.lineTo(lx + 3, 19.5); ctx.stroke();
    }
    // queue
    ctx.fillStyle = '#f7b928';
    ctx.beginPath(); ctx.ellipse(-14, 1, 6, 3.2, -.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-14, 5, 5, 3, -.1, 0, 7); ctx.fill();
    // corps
    const g = ctx.createRadialGradient(-3, -5, 2, 0, 0, 17);
    g.addColorStop(0, '#fff4a8'); g.addColorStop(.6, '#ffd93b'); g.addColorStop(1, '#f2a91c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 15, 14, 0, 0, 7); ctx.fill();
    // houppette
    ctx.fillStyle = '#ffd93b';
    for (const [a, h] of [[-.5, 7], [0, 9], [.5, 7]]) { ctx.beginPath(); ctx.ellipse(1 + a * 8, -14 - h / 3, 2.4, h / 2 + 1, a, 0, 7); ctx.fill(); }
    // aile
    ctx.save(); ctx.translate(-4, 3); ctx.rotate(flapping ? Math.sin(t * 32) * .8 - .5 : .2);
    ctx.fillStyle = '#f2a91c'; ctx.beginPath(); ctx.ellipse(-3, 3, 9, 5.5, .3, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffc93c'; ctx.beginPath(); ctx.ellipse(-4, 2, 6, 3, .3, 0, 7); ctx.fill();
    ctx.restore();
    // joue, œil, bec
    ctx.fillStyle = 'rgba(255,120,120,.5)'; ctx.beginPath(); ctx.arc(6, 5, 3.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -4, 4.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#1d1d2b'; ctx.beginPath(); ctx.arc(7.2, -3.8, 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8, -4.8, .9, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff8a1f';
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.quadraticCurveTo(21, 1.5, 12.5, 6.5); ctx.quadraticCurveTo(11, 3, 12, 0); ctx.fill();
    ctx.restore();
}

function drawHills(base, amp, wl, off, c1, c2) {
    const g = ctx.createLinearGradient(0, base - amp, 0, GROUND);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, GROUND);
    for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, base + Math.sin((x + off) / wl) * amp + Math.sin((x + off) / (wl * .43)) * amp * .35);
    ctx.lineTo(W + 8, GROUND); ctx.fill();
}

function drawCloud(cx, cy, s) {
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    for (const [ox, oy, r] of [[0, 0, 14], [16, -6, 18], [34, 0, 14], [17, 5, 14]]) { ctx.beginPath(); ctx.arc(cx + ox * s, cy + oy * s, r * s, 0, 7); ctx.fill(); }
}

function draw() {
    ctx.clearRect(0, 0, W, H);
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#4aa8ee'); sky.addColorStop(.65, '#9fdcf7'); sky.addColorStop(1, '#fff1c9');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // soleil
    const sg = ctx.createRadialGradient(285, 90, 6, 285, 90, 70);
    sg.addColorStop(0, 'rgba(255,248,200,1)'); sg.addColorStop(.25, 'rgba(255,240,160,.9)'); sg.addColorStop(1, 'rgba(255,240,160,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(285, 90, 70, 0, 7); ctx.fill();
    // nuages (parallaxe)
    const co = dist * .12 + t * 5;
    for (const [bx, by, s] of [[20, 70, 1], [180, 140, .8], [300, 220, 1.1], [90, 300, .7]]) drawCloud(((bx - co) % (W + 120) + W + 120) % (W + 120) - 60, by, s);
    // collines lointaines et proches
    drawHills(GROUND - 70, 22, 55, dist * .15, '#8fd68a', '#6cbf6e');
    drawHills(GROUND - 30, 16, 38, dist * .4, '#5fb85a', '#3e9a45');
    for (const p of pipes) {
        drawTree(p.x, 0, p.c - p.g / 2, true);
        drawTree(p.x, p.c + p.g / 2, GROUND, false);
    }
    // sol : herbe + terre
    const gr = ctx.createLinearGradient(0, GROUND, 0, H);
    gr.addColorStop(0, '#58b947'); gr.addColorStop(.18, '#3f9a3a'); gr.addColorStop(.19, '#a9703a'); gr.addColorStop(1, '#6e4524');
    ctx.fillStyle = gr; ctx.fillRect(0, GROUND, W, H - GROUND);
    const go = dist % 20;
    ctx.fillStyle = '#7bd35c';
    for (let x = -go; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, GROUND + 2); ctx.lineTo(x + 5, GROUND - 6); ctx.lineTo(x + 10, GROUND + 2); ctx.lineTo(x + 14, GROUND - 4); ctx.lineTo(x + 18, GROUND + 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(60,35,15,.4)';
    for (let x = -(dist % 56); x < W; x += 56) { ctx.beginPath(); ctx.ellipse(x + 14, GROUND + 28, 5, 3, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + 40, GROUND + 14, 3, 2, 0, 0, 7); ctx.fill(); }
    // ombre du poussin
    if (state !== 'dying') { ctx.fillStyle = 'rgba(0,0,0,.12)'; const k = Math.max(0, 1 - (GROUND - y) / 300); ctx.beginPath(); ctx.ellipse(BIRD_X, GROUND + 4, 12 * k, 3 * k, 0, 0, 7); ctx.fill(); }
    drawChick();
    for (const p of parts) { ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, p.life); ctx.beginPath(); ctx.ellipse(p.x, p.y, 3.2, 1.8, p.life * 6, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (state === 'running' && waiting) {
        ctx.textAlign = 'center'; ctx.font = '700 24px Fredoka, Nunito, system-ui, sans-serif';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,60,110,.75)'; ctx.strokeText('Touche pour voler', W / 2, H / 2 + 74);
        ctx.fillStyle = '#fff'; ctx.fillText('Touche pour voler', W / 2, H / 2 + 74);
    }
    if (state === 'paused') { ctx.fillStyle = 'rgba(2,10,24,.6)'; ctx.fillRect(0, 0, W, H); }
}

// ─────────────────────────────────────────────
// 4. FLUX DE JEU
// ─────────────────────────────────────────────
function closeOverlays() {
    [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay].forEach(o => o.classList.remove('open'));
}

function startGame() {
    closeOverlays();
    recordMessagePopup.style.display = 'none';
    runId++; pendingRecord = null;
    setWorldStatus('');
    resetWorld();
    state = 'running';
    lastTime = performance.now();
}

function pauseGame(openModal = true) {
    if (state !== 'running') return;
    state = 'paused';
    if (openModal) pauseOverlay.classList.add('open');
}

function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    state = 'running';
    lastTime = performance.now();
}

function setWorldStatus(text) { $('goWorldStatus').textContent = text; }

function finishGame() {
    if (state !== 'dying') return;
    state = 'over';
    const isPersonalBest = score > best;
    if (isPersonalBest) { best = score; saveCache({ best }); }

    $('goEmoji').textContent = isPersonalBest ? '🏆' : '💥';
    $('goTitle').textContent = isPersonalBest ? 'Nouveau record !' : 'Partie terminée';
    $('goScore').textContent = score;
    $('goBest').textContent = fmtScore(best);
    gameoverOverlay.classList.add('open');

    if (score > 0) checkWorldRecord(score, runId); else setWorldStatus('');
}

function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, .05);   // plafonné : pas de saut après un lag
    lastTime = now;
    if (state === 'running') update(dt);
    else if (state === 'dying') updateDying(dt);
    if (state !== 'paused') t += state === 'ready' || state === 'over' ? dt : 0;
    if (state !== 'paused') updateParts(dt);
    draw();
    requestAnimationFrame(loop);
}

// Entrées : toucher / clic sur la zone de jeu, clavier
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); flap(); });
document.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { state === 'running' ? pauseGame() : (state === 'paused' && resumeGame()); }
    else if (k === 'enter' && state === 'ready' && startOverlay.classList.contains('open')
        && !rulesOverlay.classList.contains('open') && document.activeElement?.id !== 'startRulesBtn') startGame();
    else if ([' ', 'arrowup', 'w'].includes(k) && state === 'running') { e.preventDefault(); flap(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', () => pauseGame());

// Aucun défilement / zoom de page pendant les gestes tactiles
['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

// ─────────────────────────────────────────────
// 5. RECORDS (cache local "tap-to-fly" + Firebase)
// ─────────────────────────────────────────────
async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}

async function refreshWorldRecord() {
    try {
        if (!fb || !(await isOnline())) return false;
        const data = await fb.getFirebaseRecordData(FB_GAME, FB_KEY);
        if (data == null) {
            if ((Number(cache.worldBest) || 0) > 0) return false;   // erreur silencieuse possible : on ne s'y fie pas
            worldBest = 0; saveCache({ worldBest, worldMsg: '' });
            return true;
        }
        worldBest = typeof data === 'object' ? Number(data.value) || 0 : Number(data) || 0;
        saveCache({ worldBest, worldMsg: (data && data.message) || '' });
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
const onlineReady = initOnline();

async function checkWorldRecord(result, myRun) {
    setWorldStatus('Vérification du record mondial…');
    try {
        await Promise.race([onlineReady, wait(2500)]);
        if (myRun !== runId) return;
        const online = await Promise.race([isOnline(), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!online || !fb) { setWorldStatus('Hors ligne : record mondial indisponible. Ton record personnel reste sauvegardé.'); return; }
        const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!fresh) { setWorldStatus('Record mondial indisponible pour le moment.'); return; }
        if (result > worldBest) {
            pendingRecord = result;
            $('goEmoji').textContent = '🏆';
            $('goTitle').textContent = 'Record mondial !';
            setWorldStatus('🌍 Tu bats le record mondial !');
            recordMessagePopup.style.display = 'flex';
            recordMsgInput.value = ''; recordCharCounter.textContent = '0/50';
            setTimeout(() => recordMsgInput.focus(), 100);
        } else {
            setWorldStatus(`Record mondial : ${fmtScore(worldBest)}`);
        }
    } catch (e) {
        console.error('Firebase records error:', e);
        if (myRun === runId) setWorldStatus('Record mondial indisponible pour le moment.');
    }
}

function renderRecords() {
    $('recPersonalScore').textContent = fmtScore(best);
    $('recGlobalScore').textContent = fmtScore(worldBest);
}

$('recordsBtn').addEventListener('click', async () => {
    if (state === 'over' || state === 'dying') return;
    pauseGame(false);
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
            renderRecords(); addMsg(cache.worldMsg);
            $('recStatus').textContent = ok ? 'À jour (Cloud)' : 'Erreur de connexion';
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
function closeRecords() { recordsOverlay.classList.remove('open'); resumeGame(); }
$('recordsClose').addEventListener('click', closeRecords);
recordsOverlay.addEventListener('click', (e) => { if (e.target === recordsOverlay) closeRecords(); });

saveRecordMsgBtn.addEventListener('click', async () => {
    if (pendingRecord == null) return;
    const rec = pendingRecord;
    const message = recordMsgInput.value.trim().substring(0, 50);
    saveRecordMsgBtn.disabled = true; saveRecordMsgBtn.textContent = 'Enregistrement...';
    let published = false, beaten = false;
    try {
        if (fb) {
            const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
            if (fresh && rec <= worldBest) beaten = true;
            else {
                const res = await Promise.race([
                    fb.setFirebaseLeaderboard(FB_GAME, FB_KEY, { value: rec, message, timestamp: Date.now() }),
                    wait(4000, false)
                ]);
                published = res === true;
            }
        }
    } catch (e) { console.error('Error saving record message:', e); }

    if (published) { worldBest = rec; saveCache({ worldBest, worldMsg: message }); setWorldStatus('🌍 Record mondial publié !'); }
    else if (beaten) setWorldStatus('Un autre joueur a battu ce record entre-temps.');
    else setWorldStatus('Record mondial non publié : connexion indisponible.');

    saveRecordMsgBtn.disabled = false; saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'none';
    pendingRecord = null;
});
recordMsgInput.addEventListener('input', () => { recordCharCounter.textContent = `${recordMsgInput.value.length}/50`; });

// ─────────────────────────────────────────────
// 6. BOUTONS / INIT
// ─────────────────────────────────────────────
function closeRules() { rulesOverlay.classList.remove('open'); resumeGame(); }
const toMenu = () => { window.location.href = '../../index.html'; };

$('playBtn').addEventListener('click', startGame);
$('startRulesBtn').addEventListener('click', () => rulesOverlay.classList.add('open'));
$('rulesBtn').addEventListener('click', () => { pauseGame(false); rulesOverlay.classList.add('open'); });
$('rulesClose').addEventListener('click', closeRules);
rulesOverlay.addEventListener('click', (e) => { if (e.target === rulesOverlay) closeRules(); });
$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', resumeGame);
$('restartPauseBtn').addEventListener('click', startGame);
$('menuPauseBtn').addEventListener('click', toMenu);
$('goRestartBtn').addEventListener('click', startGame);
$('goMenuBtn').addEventListener('click', toMenu);

resize();
resetWorld();
lastTime = performance.now();
requestAnimationFrame(loop);
