// 2048 – game.js · cache local "2048" + record mondial Firebase (leaderboards/2048/score)

const GRID_SIZE = 4;
const START_TILES = 2;
const STORAGE_KEY = '2048';
const SLIDE_MS = 110;          // durée du glissement
const POP_MS = 150;            // durée du pop (fusion / apparition)
const P_FOUR = 0.1;            // chance d'un 4 (sinon 2)
const BIG_MIN_TILE = 16;       // tuile max à partir de laquelle une tuile rare peut apparaître
const P_BIG = 0.02;            // chance de la tuile rare (max / 2)
const SWIPE_MIN = 24;          // distance mini d'un swipe (px)
const OVER_DELAY_MS = 500;     // délai avant l'écran de défaite
const WORLD_MIN_TILE = 2;    // tuile mini pour tenter le record mondial / message
const FB_GAME = '2048';
const FB_KEY = 'score';        // { value: tuile, duration: ms, message, timestamp }

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
const emptyBoard = () => Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));

let state = 'ready';           // ready | running | paused | over
let board = emptyBoard(), els = emptyBoard();
let maxTile = 2, maxAtMs = 0, moves = 0, elapsed = 0;
let started = false, gameOver = false, recBroken = false;
let lastTime = 0, runId = 0, pendingRecord = null;
let pending = null, settleTimer = 0;
let bestRec = { tile: 0, ms: 0 }, worldBest = { tile: 0, ms: 0 }, worldMsg = '';
let fb = null, net = null;

const grid = $('grid'), tilesEl = $('tiles');
const tileValueEl = $('tileValue'), bestValEl = $('bestVal'), movesValEl = $('movesVal'), timeValEl = $('timeVal');
const statusLine = $('statusLine');
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
const fmtRecord = (r) => r.tile > 0 ? `${r.tile} · ${fmtDuration(r.ms)}` : '—';
const normRecord = (r) => (r && typeof r === 'object') ? { tile: Number(r.tile) || 0, ms: Number(r.ms) || 0 } : { tile: 0, ms: 0 };
const parseRemote = (d) => (d && typeof d === 'object') ? { tile: Number(d.value) || 0, ms: Number(d.duration) || 0 } : { tile: Number(d) || 0, ms: 0 };
function isBetter(a, b) {
    if (a.tile <= 0) return false;
    if (b.tile <= 0) return true;
    return a.tile > b.tile || (a.tile === b.tile && a.ms < b.ms);
}

// ── Persistance ──
const validBoard = (b) => Array.isArray(b) && b.length === GRID_SIZE && b.every(r => Array.isArray(r) && r.length === GRID_SIZE &&
    r.every(v => v === 0 || (Number.isInteger(v) && v >= 2 && (v & (v - 1)) === 0)));

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            board, maxTile, maxAtMs: Math.round(maxAtMs), moves, elapsedMs: Math.round(elapsed), lastTick: Date.now(),
            started, gameOver, record: bestRec, worldBest, worldMsg
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
    if (!validBoard(d.board)) return false;
    board = d.board;
    maxTile = Math.max(...board.flat());
    maxAtMs = Number(d.maxAtMs) || 0;
    moves = Number(d.moves) || 0;
    elapsed = Number(d.elapsedMs) || 0;
    started = !!d.started;
    gameOver = !!d.gameOver || !canMove();
    return true;
}

// ── Tuiles (DOM) ──
function mk(r, c, v, cls = '') {
    const el = document.createElement('div');
    el.className = 'tile';
    const t = document.createElement('div');
    t.className = 't ' + cls;
    el.appendChild(t);
    setPos(el, r, c);
    setVal(el, v);
    tilesEl.appendChild(el);
    return el;
}
function setPos(el, r, c) { el.style.setProperty('--r', r); el.style.setProperty('--c', c); }
function setVal(el, v) { el.dataset.v = v; el.dataset.d = Math.min(String(v).length, 6); el.firstChild.textContent = v; }

function render() {
    clearTimeout(settleTimer); pending = null;
    tilesEl.textContent = '';
    els = emptyBoard();
    board.forEach((row, r) => row.forEach((v, c) => { if (v) els[r][c] = mk(r, c, v); }));
}

function buildSlots() {
    grid.style.setProperty('--n', GRID_SIZE);
    grid.style.setProperty('--slide', (REDUCED ? 0 : SLIDE_MS) + 'ms');
    grid.style.setProperty('--pop', POP_MS + 'ms');
    $('slots').innerHTML = '<i></i>'.repeat(GRID_SIZE * GRID_SIZE);
}

function settle() {
    if (!pending) return;
    clearTimeout(settleTimer);
    const p = pending; pending = null;
    p.doomed.forEach(e => e.remove());
    p.merges.forEach(([r, c, v]) => { els[r][c] = mk(r, c, v, 'pop'); });
    if (p.spawn) { const [r, c, v] = p.spawn; els[r][c] = mk(r, c, v, 'spawn'); }
}

// ── Logique ──
const cellAt = (dir, line, k) => {
    const n = GRID_SIZE - 1;
    return dir === 'left' ? [line, k] : dir === 'right' ? [line, n - k] : dir === 'up' ? [k, line] : [n - k, line];
};

function plan(dir) {
    const nb = emptyBoard(), list = [];
    let changed = false;
    for (let line = 0; line < GRID_SIZE; line++) {
        const tiles = [];
        for (let k = 0; k < GRID_SIZE; k++) {
            const [r, c] = cellAt(dir, line, k);
            if (board[r][c]) tiles.push({ r, c, v: board[r][c] });
        }
        for (let i = 0, k = 0; i < tiles.length; k++) {
            const a = tiles[i], b = tiles[i + 1], [tr, tc] = cellAt(dir, line, k);
            if (b && a.v === b.v) {            // une seule fusion par tuile et par geste
                nb[tr][tc] = a.v * 2;
                list.push({ a, b, to: [tr, tc] });
                i += 2; changed = true;
            } else {
                nb[tr][tc] = a.v;
                list.push({ a, to: [tr, tc] });
                if (a.r !== tr || a.c !== tc) changed = true;
                i++;
            }
        }
    }
    return { nb, list, changed };
}

function spawnValue() {
    const M = Math.max(...board.flat());
    if (M >= BIG_MIN_TILE && Math.random() < P_BIG) return Math.max(4, M / 2);
    return Math.random() < P_FOUR ? 4 : 2;
}

function spawn(forced) {
    const free = [];
    board.forEach((row, r) => row.forEach((v, c) => { if (!v) free.push([r, c]); }));
    if (!free.length) return null;
    const [r, c] = free[Math.floor(Math.random() * free.length)];
    const v = forced || spawnValue();
    board[r][c] = v;
    return [r, c, v];
}

function canMove() {
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
        const v = board[r][c];
        if (!v || (c + 1 < GRID_SIZE && board[r][c + 1] === v) || (r + 1 < GRID_SIZE && board[r + 1][c] === v)) return true;
    }
    return false;
}

function applyMove(dir) {
    settle();
    const p = plan(dir);
    if (!p.changed) return false;
    const newEls = emptyBoard(), doomed = [], merges = [];
    for (const m of p.list) {
        const [tr, tc] = m.to, ea = els[m.a.r][m.a.c];
        setPos(ea, tr, tc);
        if (m.b) {
            const eb = els[m.b.r][m.b.c];
            setPos(eb, tr, tc);
            doomed.push(ea, eb);
            merges.push([tr, tc, m.a.v * 2]);
        } else newEls[tr][tc] = ea;
    }
    board = p.nb; els = newEls;
    pending = { doomed, merges, spawn: spawn() };
    if (REDUCED) settle(); else settleTimer = setTimeout(settle, SLIDE_MS);
    return true;
}

// ── Rendu HUD ──
function renderTime() {
    const s = fmtClock(elapsed);
    if (timeValEl.textContent !== s) timeValEl.textContent = s;
}
function renderBest() { bestValEl.textContent = bestRec.tile > 0 ? bestRec.tile : '—'; }
function renderAll() {
    tileValueEl.textContent = maxTile;
    movesValEl.textContent = moves;
    renderTime();
    renderBest();
}
function setStatus(text, cls = '') { statusLine.textContent = text; statusLine.className = 'status-line' + (cls ? ' ' + cls : ''); }
function setWorldStatus(text) { $('goWorldStatus').textContent = text; }

// ── Flux de jeu ──
function closeOverlays() {
    [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay].forEach(o => o.classList.remove('open'));
}

function newGame() {
    board = emptyBoard();
    for (let i = 0; i < START_TILES; i++) spawn(2);
    maxTile = 2; maxAtMs = 0; moves = 0; elapsed = 0;
    started = false; gameOver = false; recBroken = false; pendingRecord = null;
    setWorldStatus('');
    setStatus('Fusionne les tuiles !');
    render(); renderAll(); save();
}

function startGame() {
    closeOverlays();
    recordMessagePopup.style.display = 'none';
    runId++;
    newGame();
    state = 'running';
    lastTime = performance.now();
}

function pauseGame(open = true) {
    if (state !== 'running') return;
    state = 'paused';
    if (open) pauseOverlay.classList.add('open');
}
function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    state = 'running';
    lastTime = performance.now();
}

function updateRecord() {
    const r = { tile: maxTile, ms: Math.round(maxAtMs) };
    if (!isBetter(r, bestRec)) return;
    bestRec = r; recBroken = true;
    renderBest();
}

function doMove(dir) {
    if (state !== 'running' || !applyMove(dir)) return;
    moves++; started = true;
    const m = Math.max(...board.flat());
    if (m > maxTile) {
        maxTile = m; maxAtMs = elapsed;
        tileValueEl.classList.add('level-up');
        setTimeout(() => tileValueEl.classList.remove('level-up'), 600);
    }
    updateRecord();
    renderAll();
    if (!canMove()) endGame();
    save();
}

function endGame() {
    gameOver = true; state = 'over';
    setStatus('Plus aucun mouvement !', 'bad');
    const id = runId;
    setTimeout(() => { if (id === runId) showOver(true); }, OVER_DELAY_MS);
}

function showOver(check) {
    const result = { tile: maxTile, ms: Math.round(maxAtMs) };
    $('goEmoji').textContent = recBroken ? '🏆' : '💥';
    $('goTitle').textContent = recBroken ? 'Nouveau record !' : 'Partie terminée';
    $('goTile').textContent = maxTile;
    $('goDuration').textContent = fmtDuration(elapsed);
    $('goBest').textContent = fmtRecord(bestRec);
    gameoverOverlay.classList.add('open');
    if (check && maxTile >= WORLD_MIN_TILE) checkWorldRecord(result, runId);
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

// ── Boucle / entrées ──
function loop(now) {
    const dt = Math.min(now - lastTime, 250);
    lastTime = now;
    if (state === 'running' && started && !gameOver) { elapsed += dt; renderTime(); }
    requestAnimationFrame(loop);
}

const autoPause = () => { if (started) pauseGame(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) { autoPause(); save(); } });
window.addEventListener('blur', autoPause);
window.addEventListener('pagehide', save);

const KEYS = {
    arrowleft: 'left', a: 'left', q: 'left',
    arrowright: 'right', d: 'right',
    arrowup: 'up', w: 'up', z: 'up',
    arrowdown: 'down', s: 'down'
};
document.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k.startsWith('arrow')) e.preventDefault();
    if (KEYS[k]) doMove(KEYS[k]);
    else if (k === 'escape') { state === 'running' ? pauseGame() : (state === 'paused' && resumeGame()); }
    else if (k === 'enter' && state === 'ready' && startOverlay.classList.contains('open')
        && !rulesOverlay.classList.contains('open') && document.activeElement?.id !== 'startRulesBtn') startGame();
});

let sx = 0, sy = 0, sid = null;
const stage = $('stage');
stage.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; sid = e.pointerId; });
stage.addEventListener('pointerup', (e) => {
    if (e.pointerId !== sid) return;
    sid = null;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});
stage.addEventListener('pointercancel', () => { sid = null; });

['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

// ── Records en ligne ──
async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}

async function refreshWorldRecord() {
    try {
        if (!fb || !(await isOnline())) return false;
        const data = await fb.getFirebaseRecordData(FB_GAME, FB_KEY);
        if (data == null) {
            if (worldBest.tile > 0) return false;
            worldBest = { tile: 0, ms: 0 }; worldMsg = '';
            save();
            return true;
        }
        worldBest = parseRemote(data);
        worldMsg = (data && data.message) || '';
        save();
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
    $('recPersonalTile').textContent = bestRec.tile > 0 ? bestRec.tile : '—';
    $('recPersonalTime').textContent = bestRec.tile > 0 ? fmtDuration(bestRec.ms) : '—';
    $('recGlobalTile').textContent = worldBest.tile > 0 ? worldBest.tile : '—';
    $('recGlobalTime').textContent = worldBest.tile > 0 ? fmtDuration(worldBest.ms) : '—';
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
                        value: rec.tile, duration: rec.ms, message, timestamp: Date.now()
                    }),
                    wait(4000, false)
                ]);
                published = res === true;
            }
        }
    } catch (e) { console.error('Error saving record message:', e); }

    if (published) {
        worldBest = { tile: rec.tile, ms: rec.ms }; worldMsg = message; save();
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

buildSlots();
if (load() && (started || gameOver)) {
    render(); renderAll();
    startOverlay.classList.remove('open');
    if (gameOver) { state = 'over'; setStatus('Plus aucun mouvement !', 'bad'); showOver(false); }
    else { state = 'paused'; pauseOverlay.classList.add('open'); }
} else {
    newGame();
}
lastTime = performance.now();
requestAnimationFrame(loop);
const onlineReady = initOnline();
