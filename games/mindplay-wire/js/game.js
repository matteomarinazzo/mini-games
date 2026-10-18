// ── CONFIG ──
const START_WIRES = 4;
const MAX_WIRES = 8;
const ADD_WIRE_EVERY = 3;
const TIMER_MS = 15000;
const COLORS = ['red', 'blue', 'green', 'yellow', 'white', 'black', 'orange', 'purple'];
const FAIL_MS = 1100, CUT_DELAY_MS = 700, MAX_PERM = 4, MAX_TRIES = 80, EMPTY_REJECT = 0.85, MIN_SCORE_LEVEL = 2;
const CACHE_KEY = 'mindplay-wire';
const FB_GAME = 'mindplay_wire';
const FB_KEY = 'score';
const NAMES = { red: 'rouge', blue: 'bleu', green: 'vert', yellow: 'jaune', white: 'blanc', black: 'noir', orange: 'orange', purple: 'violet' };

// ==ENGINE==
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const idx = (w, c) => w.reduce((a, x, i) => (x === c && a.push(i), a), []);
const nm = (c) => NAMES[c], pl = (c) => nm(c) + 's';
const ord = (n) => n === 1 ? '1er' : `${n}e`;
const sel = (t, w) => t.k === 'c' ? idx(w, t.x) : t.k === 'p' ? (t.n <= w.length ? [t.n - 1] : []) : [w.length - 1];
const same = (a, b) => a.k === b.k && a.x === b.x && a.n === b.n;
const desc = (t) => t.k === 'c' ? `les fils ${pl(t.x)}` : t.k === 'p' ? `le ${ord(t.n)} fil` : 'le dernier fil';
const tgt = (w, persist) => {
    const k = Math.random();
    if (k < .65) return { k: 'c', x: rnd([...new Set(w)]) };
    if (k < .9 || persist) return { k: 'p', n: 1 + Math.floor(Math.random() * w.length) };
    return { k: 'l' };
};
const TEXT = {
    cut: (d) => `Coupe ${d}.`,
    always: (d) => `Coupe toujours ${d}.`, never: (d) => `Ne coupe jamais ${d}.`,
    forget: (d) => `Oublie toutes les règles sur ${d}.`, forgetAll: () => 'Oublie toutes les règles permanentes.'
};
const ruleText = (r) => TEXT[r.y](r.t ? desc(r.t) : '');
const KIND = { cut: 'ponctuelle', always: 'permanente', never: 'permanente', forget: 'oubli', forgetAll: 'oubli' };

function reqOf(P, r, w) {
    const st = w.map(() => 0);
    P.forEach(p => sel(p.t, w).forEach(i => { if (!(p.x || []).includes(i)) st[i] = p.m === 'a' ? 1 : -1; }));
    if (r.y === 'cut') sel(r.t, w).forEach(i => { if (st[i] !== -1) st[i] = 1; });
    const S = new Set();
    st.forEach((v, i) => { if (v === 1) S.add(i); });
    return S;
}
function applyRule(P, r, w) {
    if (r.y === 'always' || r.y === 'never') return [...P.filter(p => !same(p.t, r.t)), { m: r.y === 'always' ? 'a' : 'n', t: r.t, x: [] }];
    if (r.y === 'forget') {
        const s = sel(r.t, w);
        return P.filter(p => !same(p.t, r.t)).map(p => ({ ...p, x: [...new Set([...(p.x || []), ...s])] }));
    }
    if (r.y === 'forgetAll') return [];
    return P;
}
function drawRule(P, w) {
    for (let a = 0; a < MAX_TRIES; a++) {
        const pool = ['cut', 'cut', 'cut', 'cut'];
        if (P.length < MAX_PERM) pool.push('always', 'always', 'never', 'never');
        if (P.length) pool.push('forget', 'forget');
        if (P.length >= 2) pool.push('forget');
        if (P.length >= 3) pool.push('forgetAll');
        const y = rnd(pool);
        const t = y === 'forgetAll' ? null : y === 'forget' ? { ...rnd(P).t } : tgt(w, y === 'always' || y === 'never');
        const r = { y, t };
        const P2 = applyRule(P, r, w), R = reqOf(P2, r, w);
        if (!R.size && a < MAX_TRIES * 0.7 && Math.random() < EMPTY_REJECT) continue;
        return { rule: r, perm: P2, req: R };
    }
    const r = { y: 'cut', t: { k: 'c', x: rnd(w) } };
    return { rule: r, perm: P, req: reqOf(P, r, w) };
}
const wiresFor = (lvl) => Math.min(START_WIRES + Math.floor((lvl - 1) / ADD_WIRE_EVERY), MAX_WIRES);
// ==/ENGINE==

// ── ÉTAT / DOM ──
const $ = (id) => document.getElementById(id);
const svg = $('wires'), board = $('board'), statusLine = $('statusLine');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay'), pauseOverlay = $('pauseOverlay');
const gameoverOverlay = $('gameoverOverlay'), recordsOverlay = $('recordsOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

let state = 'ready', phase = 'idle';
let level = 1, wires = [], perm = [], rule = null, cut = new Set(), req = new Set(), wonLeft = 0;
let timeLeft = 0, failLeft = 0, lastTime = 0, runId = 0, pendingRecord = null;
let cache = loadCache();
let bestLevel = Number(cache.best) || 0, worldBest = Number(cache.worldBest) || 0;
let fb = null, net = null;

function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } }
function saveCache(patch) {
    cache = { ...cache, ...patch };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* indisponible */ }
}
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
const isBetter = (a, b) => a > 0 && a > b;
const parseRemote = (d) => d && typeof d === 'object' ? Number(d.value) || 0 : (typeof d === 'number' ? d : 0);
const fmtRecord = (n) => n > 0 ? `Niveau ${n}` : '—';

// ── SAUVEGARDE ──
function save() {
    if (state !== 'running' && state !== 'paused') return;
    if (phase === 'fail' || phase === 'won') return;
    saveCache({ game: { level, wires, perm, rule, cut: [...cut], timeLeft: Math.round(timeLeft) } });
}

function restore(g) {
    try {
        if (!Number.isInteger(g.level) || g.level < 1 || !Array.isArray(g.wires) || !Array.isArray(g.perm) || !Array.isArray(g.cut) || !g.rule) return null;
        if (g.wires.length !== wiresFor(g.level) || !g.wires.every(c => COLORS.includes(c))) return null;
        const okT = (t) => t && ((t.k === 'c' && COLORS.includes(t.x)) || (t.k === 'p' && Number.isInteger(t.n) && t.n >= 1 && t.n <= g.wires.length) || t.k === 'l');
        if (!TEXT[g.rule.y] || (g.rule.y !== 'forgetAll' && !okT(g.rule.t))) return null;
        if (g.perm.length > MAX_PERM || !g.perm.every(p => (p.m === 'a' || p.m === 'n') && okT(p.t) && p.t.k !== 'l' && (p.x === undefined || (Array.isArray(p.x) && p.x.every(Number.isInteger))))) return null;
        const R = reqOf(g.perm, g.rule, g.wires);
        if (!g.cut.every(i => R.has(i)) || new Set(g.cut).size !== g.cut.length) return null;
        const t = Number(g.timeLeft);
        if (!(t >= 0 && t <= TIMER_MS)) return null;
        return { level: g.level, wires: g.wires.slice(), perm: JSON.parse(JSON.stringify(g.perm)), rule: JSON.parse(JSON.stringify(g.rule)), cut: new Set(g.cut), timeLeft: t, req: R };
    } catch { return null; }
}

// ── RENDU ──
function buildWires() {
    const n = wires.length, W = 400;
    let s = '';
    wires.forEach((c, i) => {
        const x = (W * (i + .5) / n).toFixed(1), dx = ((i * 37) % 5 - 2) * 9;
        const d = `M${x},36 C${+x + dx},95 ${x - dx},165 ${x},214`;
        s += `<g class="wire w-${c}${cut.has(i) ? ' cut' : ''}" data-i="${i}">` +
            `<path class="sh" d="${d}" pathLength="100"/><path class="co" d="${d}" pathLength="100"/>` +
            `<path class="hl" d="${d}" pathLength="100" transform="translate(-2.5,0)"/><path class="hit" d="${d}"/>` +
            `<rect class="term" x="${x - 10}" y="22" width="20" height="14" rx="3"/>` +
            `<rect class="term" x="${x - 10}" y="214" width="20" height="14" rx="3"/></g>`;
    });
    svg.innerHTML = s;
}

function setStatus(t, cls = '') { statusLine.textContent = t; statusLine.className = 'status-line' + (cls ? ' ' + cls : ''); }
function renderTimer() {
    $('timerFill').style.transform = `scaleX(${Math.max(0, timeLeft / TIMER_MS)})`;
    $('timeVal').textContent = (Math.max(0, timeLeft) / 1000).toFixed(1) + ' s';
}
function renderBest() { $('bestVal').textContent = bestLevel > 0 ? `Niv. ${bestLevel}` : '—'; }
function renderRule() {
    const el = $('ruleText');
    el.textContent = rule ? ruleText(rule) : '';
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    $('ruleTag').textContent = rule ? `Règle ${level} · ${KIND[rule.y]}` : 'Règle';
}
function renderAll() {
    $('levelValue').textContent = level;
    $('wiresVal').textContent = perm.length;
    buildWires(); renderRule(); renderTimer(); renderBest();
}

// ── JEU ──
function beginLevel() {
    const target = wiresFor(level);
    while (wires.length < target) wires.push(rnd(COLORS));
    const d = drawRule(perm, wires);
    perm = d.perm; rule = d.rule; req = d.req;
    cut = new Set(); timeLeft = TIMER_MS; phase = 'play';
    renderAll(); setStatus('Coupe les bons fils !'); save();
}

function startGame() {
    closeOverlays();
    recordMessagePopup.style.display = 'none';
    runId++; pendingRecord = null;
    level = 1; perm = []; rule = null; wires = Array.from({ length: START_WIRES }, () => rnd(COLORS));
    setWorldStatus('');
    board.classList.remove('veiled', 'shake');
    state = 'running'; lastTime = performance.now();
    beginLevel();
}

function levelWon() {
    phase = 'won'; wonLeft = CUT_DELAY_MS;
    setStatus('Bien joué !', 'good');
}
function nextLevel() {
    level++;
    board.classList.remove('flash'); void board.offsetWidth; board.classList.add('flash');
    beginLevel();
}

function onWire(i) {
    if (state !== 'running' || phase !== 'play' || cut.has(i)) return;
    if (req.has(i)) {
        cut.add(i);
        svg.querySelector(`.wire[data-i="${i}"]`).classList.add('cut');
        if (cut.size === req.size) levelWon(); else save();
    } else fail(i);
}

svg.addEventListener('pointerdown', (e) => {
    const w = e.target.closest('.wire');
    if (!w) return;
    e.preventDefault();
    onWire(Number(w.dataset.i));
});

function fail(i) {
    phase = 'fail'; failLeft = FAIL_MS;
    saveCache({ game: null });
    const els = svg.querySelectorAll('.wire');
    if (i !== undefined) els[i].classList.add('bad', 'cut');
    req.forEach(j => { if (!cut.has(j)) els[j].classList.add('missed'); });
    board.classList.add('shake');
    setTimeout(() => board.classList.remove('shake'), 400);
    setStatus(i !== undefined ? 'Mauvais fil !' : 'Temps écoulé !', 'bad');
    fail.kind = i !== undefined ? 'wrong' : 'time';
}

function update(dt) {
    if (phase === 'play') {
        timeLeft -= dt; renderTimer();
        if (timeLeft <= 0) { timeLeft = 0; renderTimer(); cut.size === req.size ? levelWon() : fail(); }
    } else if (phase === 'won') {
        wonLeft -= dt;
        if (wonLeft <= 0) nextLevel();
    } else if (phase === 'fail') {
        failLeft -= dt;
        if (failLeft <= 0) finishGame();
    }
}

function pauseGame(openModal = true) {
    if (state !== 'running' || phase !== 'play') return;
    state = 'paused'; board.classList.add('veiled'); save();
    if (openModal) pauseOverlay.classList.add('open');
}
function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays(); board.classList.remove('veiled');
    state = 'running'; lastTime = performance.now();
}

function closeOverlays() { [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay].forEach(o => o.classList.remove('open')); }
const setWorldStatus = (t) => { $('goWorldStatus').textContent = t; };

function finishGame() {
    if (state !== 'running') return;
    state = 'over'; phase = 'idle';
    const score = level, eligible = score >= MIN_SCORE_LEVEL;
    let pb = false;
    if (eligible && score > bestLevel) { bestLevel = score; saveCache({ best: bestLevel }); pb = true; }
    renderBest();
    $('goEmoji').textContent = pb ? '🏆' : '💥';
    $('goTitle').textContent = pb ? 'Nouveau record !' : (fail.kind === 'time' ? 'Temps écoulé !' : 'Boum !');
    $('goLevel').textContent = score;
    $('goBest').textContent = fmtRecord(bestLevel);
    gameoverOverlay.classList.add('open');
    if (eligible) checkWorldRecord(score, runId); else setWorldStatus('');
}

async function checkWorldRecord(score, myRun) {
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
        if (isBetter(score, worldBest)) {
            pendingRecord = score;
            $('goEmoji').textContent = '🏆'; $('goTitle').textContent = 'Record mondial !';
            setWorldStatus('🌍 Tu bats le record mondial !');
            recordMessagePopup.style.display = 'flex';
            recordMsgInput.value = ''; recordCharCounter.textContent = '0/50';
            setTimeout(() => recordMsgInput.focus(), 100);
        } else setWorldStatus(`Record mondial : ${fmtRecord(worldBest)}`);
    } catch (e) {
        console.error('Firebase records error:', e);
        if (myRun === runId) setWorldStatus('Record mondial indisponible pour le moment.');
    }
}

// ── BOUCLE / ÉVÉNEMENTS GLOBAUX ──
function loop(now) {
    const dt = Math.min(now - lastTime, 250);
    lastTime = now;
    if (state === 'running') update(dt);
    requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); save(); } });
window.addEventListener('blur', () => pauseGame());
window.addEventListener('pagehide', save);
['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

// ── RECORDS EN LIGNE ──
async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}
async function refreshWorldRecord() {
    try {
        if (!fb || !(await isOnline())) return false;
        const data = await fb.getFirebaseRecordData(FB_GAME, FB_KEY);
        if (data == null) {
            if (Number(cache.worldBest) > 0) return false;
            worldBest = 0; saveCache({ worldBest, worldMsg: '' }); return true;
        }
        worldBest = parseRemote(data);
        saveCache({ worldBest, worldMsg: (data && data.message) || '' });
        return true;
    } catch (e) { console.error('Firebase records error:', e); return false; }
}
async function initOnline() {
    try {
        [fb, net] = await Promise.all([import('../../../js/firebaseWrk.js'), import('../../../js/network.js')]);
        await refreshWorldRecord();
    } catch (e) { console.warn('Mode hors ligne :', e); }
}

function renderRecords() {
    $('recPersonalLevel').textContent = bestLevel > 0 ? bestLevel : '—';
    $('recGlobalLevel').textContent = worldBest > 0 ? worldBest : '—';
}
$('recordsBtn').addEventListener('click', async () => {
    if (state === 'over') return;
    pauseGame(false);
    recordsOverlay.classList.add('open');
    renderRecords();
    $('recStatus').textContent = 'Synchronisation...';
    const card = $('recGlobalCard');
    card.querySelectorAll('.rc-message').forEach(m => m.remove());
    const addMsg = (msg) => { if (!msg) return; const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${msg} »`; card.appendChild(m); };
    try {
        if (fb && await isOnline()) {
            const ok = await refreshWorldRecord();
            renderRecords(); addMsg(cache.worldMsg);
            $('recStatus').textContent = ok ? 'À jour (Cloud)' : 'Erreur de connexion';
        } else { addMsg(cache.worldMsg); $('recStatus').textContent = 'Hors ligne (Records locaux)'; }
    } catch (e) {
        console.error('Firebase records error:', e);
        addMsg(cache.worldMsg); $('recStatus').textContent = 'Erreur de connexion';
    }
});
function closeRecords() { recordsOverlay.classList.remove('open'); if (state === 'paused') pauseOverlay.classList.add('open'); }
$('recordsClose').addEventListener('click', closeRecords);
recordsOverlay.addEventListener('click', (e) => { if (e.target === recordsOverlay) closeRecords(); });

saveRecordMsgBtn.addEventListener('click', async () => {
    if (pendingRecord === null) return;
    const rec = pendingRecord;
    const message = recordMsgInput.value.trim().substring(0, 50);
    saveRecordMsgBtn.disabled = true; saveRecordMsgBtn.textContent = 'Enregistrement...';
    let published = false, beaten = false;
    try {
        if (fb) {
            const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
            if (fresh && !isBetter(rec, worldBest)) beaten = true;
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
    else if (beaten) setWorldStatus('Un autre joueur a déjà ce niveau ou mieux.');
    else setWorldStatus('Record mondial non publié : connexion indisponible.');
    saveRecordMsgBtn.disabled = false; saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'none'; pendingRecord = null;
});
recordMsgInput.addEventListener('input', () => { recordCharCounter.textContent = `${recordMsgInput.value.length}/50`; });

// ── BOUTONS / INIT ──
function closeRules() { rulesOverlay.classList.remove('open'); if (state === 'paused') pauseOverlay.classList.add('open'); }
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
document.querySelectorAll('.js-timer').forEach(el => { el.textContent = TIMER_MS / 1000; });
document.querySelectorAll('.js-start-wires').forEach(el => { el.textContent = START_WIRES; });
document.querySelectorAll('.js-add-every').forEach(el => { el.textContent = ADD_WIRE_EVERY; });
document.querySelectorAll('.js-max-wires').forEach(el => { el.textContent = MAX_WIRES; });

const saved = cache.game ? restore(cache.game) : null;
if (saved) {
    ({ level, wires, perm, rule, cut, timeLeft, req } = saved);
    state = 'paused'; phase = 'play';
    closeOverlays(); board.classList.add('veiled'); pauseOverlay.classList.add('open');
    renderAll(); setStatus('Partie en pause');
} else {
    if (cache.game) saveCache({ game: null });
    wires = Array.from({ length: START_WIRES }, () => rnd(COLORS)); timeLeft = TIMER_MS;
    $('wiresVal').textContent = perm.length; buildWires(); renderTimer(); renderBest();
    setStatus('Prépare-toi…');
}
lastTime = performance.now();
requestAnimationFrame(loop);
const onlineReady = initOnline();
