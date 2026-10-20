/**
 * Orbit – game.js
 * Un point tourne (sens horaire, accélération continue) sur l'un de 3 anneaux ; le joueur choisit l'anneau.
 * Arcs d'obstacles fixes, générés à la volée devant le point (PRNG à graine, état sauvegardé).
 * Score = temps tenu (ms). Records : cache local "orbit" + Firebase (leaderboards/orbit/score = { value: ms, message, timestamp }).
 */

// ── CONST ──
const LIVES = 3, S = 400, C = 200, PR = 9, TAU = Math.PI * 2;   // monde 400×400
const MINR = 3, MAXR = 5, RING_EVERY = 120000;   // 3 anneaux au départ, +1 (extérieur) toutes les 2 min, max 5
const rad = (i, n = NR) => 56 + i * 114 / (n - 1);   // rayon de l'anneau i (0 = intérieur) pour n anneaux
const EXTRA = ['a0', 'amp', 'ph', 'sp', 'lo', 'n', 'k', 'tm', 'T'], TRAIL = .32;
const W0 = 1.2, ACC = .018;          // vitesse angulaire de départ (rad/s) et accélération continue (rad/s²), sans plafond
const AHEAD = 3.2;                   // les arcs sont générés jusqu'à AHEAD rad devant le point (+ motif < 2π : jamais de recouvrement)
const INV = .35, OVER_MS = 700, WORLD_MIN = 5000;
const KEY = 'orbit', FB_GAME = 'orbit', FB_KEY = 'score', MENU = '../../index.html';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
const num = (v) => typeof v === 'number' && isFinite(v);

// ── État ──
let state = 'ready';                 // ready | running | paused | over
let started = false, gameOver = false, recBroken = false, runId = 0, pendingRecord = null, lastTime = 0, saveAt = 0;
let NR = MINR, ring = 1, rv = rad(1), th = -Math.PI / 2, w = W0, elapsed = 0, lives = LIVES, inv = 0;
const Rv = [], ra = [], tr = [];     // rayons / opacités affichés des anneaux, traînée du point
let noteT = 0;
let arcs = [], cursor = 0, seed = 1;  // arcs {r, a, w} en angles non bouclés
let pulse = 0, shake = 0, flash = 0, overT = 0;
let best = 0, worldBest = 0, worldMsg = '', fb = null, net = null;

const cv = $('game'), ctx = cv.getContext('2d'), stage = $('stage');
const timeEl = $('timeVal'), livesEl = $('livesVal');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay'), pauseOverlay = $('pauseOverlay');
const gameoverOverlay = $('gameoverOverlay'), recordsOverlay = $('recordsOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

function setRings() {   // nombre d'anneaux selon le temps (sans animation)
    NR = Math.min(MAXR, MINR + Math.floor(elapsed / RING_EVERY));
    for (let i = 0; i < MAXR; i++) { Rv[i] = i < NR ? rad(i) : rad(NR - 1); ra[i] = i < NR ? 1 : 0; }
    ring = Math.min(ring, NR - 1); rv = Rv[ring];
}
setRings();

// ── Formats ──
const p2 = (n) => String(n).padStart(2, '0');
function clock(ms) {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return h ? `${h}:${p2(m)}:${p2(s % 60)}` : `${m}:${p2(s % 60)}`;
}
const dur = (ms) => `${clock(ms)},${Math.floor(ms / 100) % 10}`;
const fmtR = (ms) => ms > 0 ? dur(ms) : '—';

// ── Persistance ──
function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify({
            ring, th, w, elapsed: Math.round(elapsed), lives, inv, arcs, cursor, seed,
            started, gameOver, recBroken, best, worldBest, worldMsg
        }));
    } catch { /* stockage indisponible */ }
}
function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch { /* ignoré */ }
    if (!d || typeof d !== 'object') return false;
    best = Math.max(0, Number(d.best) || 0);
    worldBest = Math.max(0, Number(d.worldBest) || 0);
    worldMsg = typeof d.worldMsg === 'string' ? d.worldMsg : '';
    if (![d.ring, d.th, d.w, d.elapsed, d.lives, d.cursor, d.seed].every(num) || !Array.isArray(d.arcs)) return false;
    ring = Math.max(0, Math.min(MAXR - 1, Math.floor(d.ring)));
    th = d.th; w = Math.max(W0, d.w); elapsed = Math.max(0, d.elapsed);
    lives = Math.max(0, Math.min(LIVES, Math.floor(d.lives)));
    inv = num(d.inv) ? Math.max(0, d.inv) : 0;
    cursor = d.cursor; seed = d.seed >>> 0;
    arcs = d.arcs.filter(o => o && [o.r, o.a, o.w].every(num) && o.r >= 0 && o.r < MAXR).map(o => { const f = { r: o.r | 0, a: o.a, w: o.w }; for (const k of EXTRA) if (num(o[k])) f[k] = o[k]; return f; });
    setRings(); tr.length = 0; for (const o of arcs) if (o.n) o.vr = Rv[o.r];
    started = !!d.started; recBroken = !!d.recBroken;
    gameOver = !!d.gameOver || lives <= 0;
    return true;
}
window.addEventListener('pagehide', save);

// ── Génération procédurale (mulberry32) ──
function rand() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
const hopR = (o) => { const s = o.n - 1, m = o.k % (2 * s); return o.lo + (m <= s ? m : 2 * s - m); };
// Difficulté d (minutes) : arcs plus larges, écarts plus courts ; paires (d>.25), arcs oscillants (d>.6),
// murs avec passage (d>1), arcs qui sautent d'anneau (d>1.4). Chaque motif réserve sa place : toujours au moins un anneau libre.
function gen() {
    while (cursor < th + AHEAD) {
        const d = elapsed / 60000, p = rand();
        const aw = Math.min(1.3, .5 + .3 * d) * (.85 + .3 * rand());
        const a = Math.floor(rand() * NR);
        let end = cursor + aw;
        if (d > 1.4 && p < .12) {                         // saute entre 2-3 anneaux, aller-retour
            const n = Math.min(NR, 2 + (rand() < .5 ? 1 : 0)), lo = Math.floor(rand() * (NR - n + 1));
            const o = { r: 0, a: cursor, w: aw, n, lo, k: Math.floor(rand() * 2 * (n - 1)), tm: 0, T: Math.max(.6, 1.2 - .2 * d) };
            o.r = hopR(o); o.vr = Rv[o.r]; arcs.push(o);
        } else if (d > 1 && p < .27) {                    // mur : 1 passage (2 si 4+ anneaux)
            const f = NR > 3 ? 2 : 1, fs = Math.floor(rand() * (NR - f + 1));
            for (let i = 0; i < NR; i++) if (i < fs || i >= fs + f) arcs.push({ r: i, a: cursor, w: aw });
        } else if (d > .6 && p < .45) {                   // oscille latéralement dans sa zone réservée
            const amp = .15 + .2 * rand(), ph = rand() * TAU;
            arcs.push({ r: a, a: cursor + amp + amp * Math.sin(ph), w: aw, a0: cursor + amp, amp, ph, sp: 1.5 + 1.5 * rand() });
            end = cursor + aw + 2 * amp;
        } else if (d > .25 && p < .75) {                  // paire décalée sur deux anneaux : force un changement
            const b = (a + 1 + Math.floor(rand() * (NR - 1))) % NR, o = aw * .6;
            arcs.push({ r: a, a: cursor, w: aw }, { r: b, a: cursor + o, w: aw });
            end = cursor + o + aw;
        } else arcs.push({ r: a, a: cursor, w: aw });
        cursor = end + Math.max(.4, (1.3 - .4 * d) * (.8 + .4 * rand()));
    }
}

// ── HUD ──
function renderLives(lostIdx = -1) {
    livesEl.textContent = '';
    for (let i = 0; i < LIVES; i++) {
        const s = document.createElement('span');
        s.className = 'heart' + (i < lives ? '' : ' lost') + (i === lostIdx ? ' hit' : '');
        s.textContent = '♥';
        livesEl.appendChild(s);
    }
}
function renderTime() { const s = clock(elapsed); if (timeEl.textContent !== s) timeEl.textContent = s; }
function renderAll() { renderTime(); renderLives(); }
function setWorldStatus(t) { $('goWorldStatus').textContent = t; }

// ── Jeu ──
function newGame() {
    ring = 1; th = -Math.PI / 2; w = W0; elapsed = 0; lives = LIVES; inv = 0; noteT = 0; tr.length = 0; setRings();
    arcs = []; cursor = th + 1.6; seed = (Math.random() * 4294967296) >>> 0;
    pulse = shake = flash = overT = 0;
    started = gameOver = recBroken = false; pendingRecord = null;
    setWorldStatus('');
    gen(); renderAll(); save();
}

function move(dir) {
    if (state !== 'running') return;
    const n = Math.max(0, Math.min(NR - 1, ring + dir));
    if (n === ring) return;                    // aux bords : sans effet
    ring = n; pulse = 1; save();
}

function hit(o, m) {
    lives--;
    renderLives(lives);
    flash = 1; shake = REDUCED ? 0 : 1; inv = INV;
    tr.length = 0; th = o.a + o.w + m + .02;                  // repousse le point juste après l'arc
    if (lives <= 0) endGame(); else save();
}

function update(dt) {
    elapsed += dt * 1000; w += ACC * dt; inv = Math.max(0, inv - dt);
    const nr = Math.min(MAXR, MINR + Math.floor(elapsed / RING_EVERY));
    if (nr !== NR) { NR = nr; noteT = 1.8; }
    for (const o of arcs) {
        if (o.amp !== undefined) { o.ph += o.sp * dt; o.a = o.a0 + o.amp * Math.sin(o.ph); }
        else if (o.n) { o.tm += dt; if (o.tm >= o.T) { o.tm -= o.T; o.k++; o.r = hopR(o); } }
    }
    const n = Math.ceil(w * dt / .03) || 1, st = w * dt / n;   // sous-pas : pas de tunnel à haute vitesse
    for (let i = 0; i < n && state === 'running'; i++) {
        th += st;
        if (inv > 0) continue;
        const m = 7 / rad(ring);
        const o = arcs.find(o => o.r === ring && th >= o.a - m && th <= o.a + o.w + m);
        if (o) hit(o, m);
    }
    if (state !== 'running') return;
    arcs = arcs.filter(o => o.a + o.w > th - .4);
    gen();
    const now = performance.now();
    if (now > saveAt) { save(); saveAt = now + 500; }
}

// ── Dessin ──
function draw() {
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * 14 * shake, (Math.random() - .5) * 14 * shake);
    ctx.lineCap = 'butt';
    for (let i = 0; i < MAXR; i++) {
        if (ra[i] < .02) continue;
        ctx.globalAlpha = ra[i];
        ctx.beginPath(); ctx.arc(C, C, Rv[i], 0, TAU);
        ctx.strokeStyle = i === ring ? 'rgba(91,200,245,.5)' : 'rgba(141,200,232,.2)';
        ctx.lineWidth = i === ring ? 2.5 : 2; ctx.stroke();
    }
    for (const o of arcs) {
        let al = Math.max(0, Math.min(1, (th + AHEAD + 1 - o.a) * 3));
        if (o.n && o.tm > o.T - .3 && Math.floor(o.tm * 14) % 2) al *= .4;   // clignote juste avant de sauter
        ctx.globalAlpha = al;
        ctx.beginPath(); ctx.arc(C, C, o.n ? o.vr : Rv[o.r], o.a, o.a + o.w);
        ctx.strokeStyle = '#ef476f'; ctx.lineWidth = 16; ctx.stroke();
        ctx.strokeStyle = o.n ? '#ffe08a' : o.amp !== undefined ? '#fff' : '#ff9db4'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // noyau
    const cr = 22 + flash * 7, g = ctx.createRadialGradient(C - 6, C - 7, 2, C, C, cr);
    g.addColorStop(0, '#b6ecff'); g.addColorStop(.6, '#5bc8f5'); g.addColorStop(1, '#0077b6');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(C, C, cr, 0, TAU); ctx.fill();
    // traînée (suit le trajet réel du point, y compris entre deux anneaux) + point
    const x = C + rv * Math.cos(th), y = C + rv * Math.sin(th);
    if (state !== 'over') {
        ctx.lineCap = 'round';
        for (let j = 1; j < tr.length; j++) {
            const k = 1 - tr[j].t / TRAIL;
            ctx.beginPath(); ctx.moveTo(tr[j - 1].x, tr[j - 1].y); ctx.lineTo(tr[j].x, tr[j].y);
            ctx.strokeStyle = `rgba(255,216,77,${.5 * k})`; ctx.lineWidth = 2 + 7 * k; ctx.stroke();
        }
        if (inv <= 0 || Math.floor(inv * 16) % 2) {
            ctx.beginPath(); ctx.arc(x, y, PR * (1 + .5 * pulse), 0, TAU);
            ctx.fillStyle = '#ffd84d'; ctx.fill();
            ctx.strokeStyle = '#fff8c4'; ctx.lineWidth = 3; ctx.stroke();
        }
    } else if (overT < OVER_MS / 1000) {
        const k = overT / (OVER_MS / 1000);
        ctx.beginPath(); ctx.arc(x, y, PR + k * 120, 0, TAU);
        ctx.strokeStyle = `rgba(255,216,77,${1 - k})`; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.restore();
    if (noteT > 0) {
        ctx.globalAlpha = Math.min(1, noteT); ctx.textAlign = 'center'; ctx.font = '700 20px Fredoka, Nunito, system-ui, sans-serif';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(2,10,24,.8)'; ctx.strokeText('Nouvel anneau !', C, 34);
        ctx.fillStyle = '#e0f4ff'; ctx.fillText('Nouvel anneau !', C, 34); ctx.globalAlpha = 1;
    }
    if (flash > 0) { ctx.fillStyle = `rgba(239,71,111,${flash * .45})`; ctx.fillRect(0, 0, S, S); }
    if (state === 'paused') { ctx.fillStyle = 'rgba(2,10,24,.6)'; ctx.fillRect(0, 0, S, S); }
}

function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, .05);
    lastTime = now;
    if (state === 'running') { update(dt); renderTime(); }
    if (state !== 'paused') {
        const k = Math.min(1, dt * 5);
        for (let i = 0; i < MAXR; i++) {
            Rv[i] += ((i < NR ? rad(i) : rad(NR - 1)) - Rv[i]) * k;
            ra[i] += ((i < NR ? 1 : 0) - ra[i]) * k;
        }
        rv += (Rv[ring] - rv) * Math.min(1, dt * 9);          // glisse vers le nouvel anneau (pas de saut)
        for (const o of arcs) if (o.n) o.vr += (Rv[o.r] - o.vr) * Math.min(1, dt * 14);
        pulse = Math.max(0, pulse - dt * 5); shake = Math.max(0, shake - dt * 3); flash = Math.max(0, flash - dt * 2.2);
        noteT = Math.max(0, noteT - dt);
        for (const p of tr) p.t += dt;
        while (tr.length && tr[0].t > TRAIL) tr.shift();
        if (state === 'running') tr.push({ x: C + rv * Math.cos(th), y: C + rv * Math.sin(th), t: 0 });
        if (state === 'over') overT += dt;
    }
    draw();
    requestAnimationFrame(loop);
}

// ── Flux ──
function closeOverlays() {
    [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay].forEach(o => o.classList.remove('open'));
}
function startGame() {
    closeOverlays();
    recordMessagePopup.style.display = 'none';
    runId++;
    newGame();
    started = true; state = 'running';
    lastTime = performance.now();
    save();
}
function pauseGame(open = true) {
    if (state !== 'running') return;
    state = 'paused'; save();
    if (open) pauseOverlay.classList.add('open');
}
function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    state = 'running';
    lastTime = performance.now();
}
function endGame() {
    if (state === 'over') return;
    state = 'over'; gameOver = true; overT = 0;
    const ms = Math.round(elapsed);
    if (ms > best) { best = ms; recBroken = true; }
    save();
    const id = runId;
    setTimeout(() => { if (id === runId) showOver(true); }, OVER_MS);
}
function showOver(check) {
    $('goEmoji').textContent = recBroken ? '🏆' : '💥';
    $('goTitle').textContent = recBroken ? 'Nouveau record !' : 'Partie terminée';   // signalé avant l'envoi mondial
    $('goTime').textContent = dur(elapsed);
    $('goBest').textContent = fmtR(best);
    gameoverOverlay.classList.add('open');
    if (check && elapsed >= WORLD_MIN) checkWorldRecord(Math.round(elapsed), runId);
}

// ── Entrées ──
document.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { state === 'running' ? pauseGame() : (state === 'paused' && resumeGame()); }
    else if (k === 'enter' && state === 'ready' && startOverlay.classList.contains('open')
        && !rulesOverlay.classList.contains('open') && document.activeElement?.id !== 'startRulesBtn') startGame();
    else if (state === 'running' && (k === 'arrowup' || k === 'w')) { e.preventDefault(); move(1); }
    else if (state === 'running' && (k === 'arrowdown' || k === 's')) { e.preventDefault(); move(-1); }
});
// Swipe vertical sur toute la zone de jeu : ≥ 30 px et pas trop horizontal ; un seul changement par geste
let sw = null;
stage.addEventListener('pointerdown', (e) => { sw = { x: e.clientX, y: e.clientY }; });
stage.addEventListener('pointermove', (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.abs(dy) >= 30 && Math.abs(dx) < Math.abs(dy) * .75) { move(dy < 0 ? 1 : -1); sw = null; }
});
['pointerup', 'pointercancel'].forEach(ev => window.addEventListener(ev, () => { sw = null; }));
['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));
const autoPause = () => { if (started) pauseGame(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('blur', autoPause);

function resize() {
    const s = Math.max(120, Math.min(stage.clientWidth, stage.clientHeight) - 16), d = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = cv.style.height = s + 'px';
    cv.width = cv.height = Math.round(s * d);
    ctx.setTransform(cv.width / S, 0, 0, cv.width / S, 0, 0);
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

// ── Records en ligne ──
async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}
async function refreshWorldRecord() {
    try {
        if (!fb || !(await isOnline())) return false;
        const data = await fb.getFirebaseRecordData(FB_GAME, FB_KEY);
        if (data == null) {
            if (worldBest > 0) return false;     // erreur silencieuse possible : on ne s'y fie pas
            worldBest = 0; worldMsg = ''; save();
            return true;
        }
        worldBest = typeof data === 'object' ? Number(data.value) || 0 : Number(data) || 0;
        worldMsg = (data && data.message) || '';
        save();
        return true;
    } catch (e) { console.error('Firebase records error:', e); return false; }
}
async function initOnline() {
    try {
        [fb, net] = await Promise.all([import('../../../js/firebaseWrk.js'), import('../../../js/network.js')]);
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
        } else setWorldStatus(`Record mondial : ${fmtR(worldBest)}`);
    } catch (e) {
        console.error('Firebase records error:', e);
        if (myRun === runId) setWorldStatus('Record mondial indisponible pour le moment.');
    }
}

function renderRecords() {
    $('recPersonalScore').textContent = fmtR(best);
    $('recGlobalScore').textContent = fmtR(worldBest);
}
async function openRecords() {
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
            renderRecords(); addMsg(worldMsg);
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
}
function closeRecords() { recordsOverlay.classList.remove('open'); resumeGame(); }
$('recordsBtn').addEventListener('click', openRecords);
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
    if (published) { worldBest = rec; worldMsg = message; save(); setWorldStatus('🌍 Record mondial publié !'); }
    else if (beaten) setWorldStatus('Un autre joueur a battu ce record entre-temps.');
    else setWorldStatus('Record mondial non publié : connexion indisponible.');
    saveRecordMsgBtn.disabled = false; saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'none';
    pendingRecord = null;
});
recordMsgInput.addEventListener('input', () => { recordCharCounter.textContent = `${recordMsgInput.value.length}/50`; });

// ── Boutons / init ──
function closeRules() { rulesOverlay.classList.remove('open'); resumeGame(); }
const toMenu = () => { window.location.href = MENU; };

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
// Retour : confirmation si une partie est en cours (elle reste sauvegardée)
$('backLink').addEventListener('click', (e) => {
    if (!started || gameOver) return;
    e.preventDefault();
    pauseGame();
    if (confirm('Quitter la partie en cours ? Elle sera sauvegardée.')) toMenu();
});

resize();
if (load() && (started || gameOver)) {
    renderAll();
    startOverlay.classList.remove('open');
    if (gameOver) { state = 'over'; overT = 9; showOver(false); }
    else { state = 'paused'; pauseOverlay.classList.add('open'); }
} else {
    newGame();
}
lastTime = performance.now();
requestAnimationFrame(loop);
