/**
 * Snake – game.js
 *
 * Moteur à pas fixe sur grille (Canvas 2D), calqué sur l'intégration de Layer Pile :
 * HUD, modals, record perso (localStorage) et record mondial (Firebase via firebaseWrk.js).
 * Les modules Firebase sont chargés dynamiquement : s'ils échouent, le jeu fonctionne quand même.
 */
'use strict';

// ─────────────────────────────────────────────
// CONFIG (paramètres importants)
// ─────────────────────────────────────────────
const GRID_SIZE = 20;            // taille de la grille : 20 × 20 cases
const START_LENGTH = 3;          // longueur initiale du serpent
const START_INTERVAL_MS = 140;   // vitesse initiale : 1 déplacement toutes les 140 ms
const SPEED_STEP_MS = 3;         // progression : -3 ms d'intervalle à chaque fruit mangé
const MIN_INTERVAL_MS = 65;      // vitesse maximale : intervalle plancher de 65 ms
const POINTS_PER_FRUIT = 10;     // score attribué par fruit
const MAX_DIR_QUEUE = 2;         // nb max de changements de direction mis en file entre 2 pas
const SWIPE_MIN_PX = 24;         // distance minimale d'un glissement pour être pris en compte

// Firebase : mêmes conventions que Layer Pile (jeu "layer_pile", clé "best_score")
const FB_GAME_ID = 'snake';
const FB_KEY_SCORE = 'best_score';
const FB_TIMEOUT_MS = 5000;
const MESSAGE_MAX_LEN = 50;
const MAX_POSSIBLE_SCORE = GRID_SIZE * GRID_SIZE * POINTS_PER_FRUIT; // garde-fou anti-valeur aberrante

const LS_BEST_KEY = 'snake_best';

const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

// ─────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d');
const boardArea = $('boardArea');

const scoreValueEl = $('scoreValue');
const scoreDelta = $('scoreDelta');
const bestVal = $('bestVal');
const worldVal = $('worldVal');

const rulesOverlay = $('rulesOverlay');
const pauseOverlay = $('pauseOverlay');
const gameoverOverlay = $('gameoverOverlay');
const recordsOverlay = $('recordsOverlay');
const recordMessagePopup = $('recordMessagePopup');

const goEmoji = $('goEmoji');
const goTitle = $('goTitle');
const goScore = $('goScore');
const goBest = $('goBest');
const goWorld = $('goWorld');
const goLength = $('goLength');
const goTime = $('goTime');
const goRecordMsg = $('goRecordMsg');
const goRestartBtn = $('goRestartBtn');

const recPersonalScore = $('recPersonalScore');
const recGlobalScore = $('recGlobalScore');
const recStatus = $('recStatus');

const recordMsgInput = $('recordMsgInput');
const recordCharCounter = $('recordCharCounter');
const recordScoreLabel = $('recordScoreLabel');
const recordSaveStatus = $('recordSaveStatus');
const saveRecordMsgBtn = $('saveRecordMsgBtn');
const skipRecordBtn = $('skipRecordBtn');

// ─────────────────────────────────────────────
// STOCKAGE LOCAL (protégé : navigation privée, quota, etc.)
// ─────────────────────────────────────────────
function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) { /* ignoré */ }
}
function toScore(v) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 && n <= MAX_POSSIBLE_SCORE ? n : 0;
}

// ─────────────────────────────────────────────
// ÉTAT
// ─────────────────────────────────────────────
let snake = [];            // [{x, y}] — la tête est en index 0
let dir = DIRS.right;      // direction appliquée au dernier pas
let dirQueue = [];         // changements de direction en attente
let fruit = { x: 0, y: 0 };
let score = 0;
let fruitsEaten = 0;
let interval = START_INTERVAL_MS;
let running = false;       // une partie est en cours
let paused = false;        // pause volontaire (modal Pause)
let acc = 0;               // temps accumulé depuis le dernier pas
let lastTs = 0;
let playMs = 0;            // durée de jeu (n'avance ni en pause, ni modal ouverte)
let cell = 20;             // taille d'une case en px CSS (recalculée au resize)

let bestScore = toScore(lsGet(LS_BEST_KEY));
let worldRecord = { value: 0, message: '', loaded: false };
let runCounter = 0;
let lastRun = null;        // { id, score, submitted, saving }
let pendingRecord = null;  // run en attente d'envoi du message de record

// ─────────────────────────────────────────────
// FIREBASE (chargement paresseux, jamais bloquant)
// ─────────────────────────────────────────────
let fbModules = null;

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), ms);
        Promise.resolve(promise).then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); }
        );
    });
}

async function getFb() {
    if (fbModules) return fbModules;
    try {
        const [wrk, net] = await Promise.all([
            import('../../../js/firebaseWrk.js'),
            import('../../../js/network.js'),
        ]);
        fbModules = {
            getFirebaseRecordData: wrk.getFirebaseRecordData,
            setFirebaseLeaderboard: wrk.setFirebaseLeaderboard,
            checkRealConnection: net.checkRealConnection,
        };
    } catch (e) {
        console.error('Firebase indisponible :', e);
        fbModules = null;
    }
    return fbModules;
}

async function isOnline() {
    try {
        const fb = await getFb();
        if (!fb) return false;
        return !!(await withTimeout(fb.checkRealConnection(), FB_TIMEOUT_MS));
    } catch (e) {
        return false;
    }
}

function cleanMessage(msg) {
    return String(msg ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MESSAGE_MAX_LEN);
}

// Accepte un nombre seul ou un objet { value, message, timestamp } (comme dans Layer Pile)
function normalizeRecord(raw) {
    let value = 0, message = '';
    if (raw && typeof raw === 'object') {
        value = toScore(raw.value);
        message = typeof raw.message === 'string' ? cleanMessage(raw.message) : '';
    } else {
        value = toScore(raw);
    }
    return { value, message, loaded: true };
}

async function fetchWorldRecord() {
    const fb = await getFb();
    if (!fb) throw new Error('firebase-unavailable');
    if (!(await isOnline())) throw new Error('offline');
    const raw = await withTimeout(fb.getFirebaseRecordData(FB_GAME_ID, FB_KEY_SCORE), FB_TIMEOUT_MS);
    return normalizeRecord(raw);
}

async function refreshWorldRecord() {
    const rec = await fetchWorldRecord();
    worldRecord = rec;
    updateBadges();
    return rec;
}

// ─────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────
function updateBadges() {
    bestVal.textContent = bestScore;
    worldVal.textContent = worldRecord.loaded ? worldRecord.value : '–';
}

function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function showDelta(pts) {
    scoreDelta.className = 'score-delta';
    void scoreDelta.offsetWidth;
    scoreDelta.textContent = `+${pts}`;
    scoreDelta.classList.add('show');
}

function setScore(v) {
    score = v;
    scoreValueEl.textContent = score;
    scoreValueEl.classList.remove('score-up');
    void scoreValueEl.offsetWidth;
    scoreValueEl.classList.add('score-up');
    setTimeout(() => scoreValueEl.classList.remove('score-up'), 300);
}

function overlayOpen() {
    return [rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay]
        .some((o) => o.classList.contains('open')) || recordMessagePopup.style.display !== 'none';
}

// ─────────────────────────────────────────────
// LOGIQUE DE JEU
// ─────────────────────────────────────────────
function spawnFruit() {
    const occupied = new Set(snake.map((s) => s.y * GRID_SIZE + s.x));
    const free = [];
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) if (!occupied.has(i)) free.push(i);
    if (!free.length) return false; // grille pleine → victoire
    const i = free[Math.floor(Math.random() * free.length)];
    fruit = { x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE) };
    return true;
}

function startGame() {
    const midY = Math.floor(GRID_SIZE / 2);
    const startX = Math.floor(GRID_SIZE / 4) + START_LENGTH;
    snake = [];
    for (let i = 0; i < START_LENGTH; i++) snake.push({ x: startX - i, y: midY });
    dir = DIRS.right;
    dirQueue = [];
    fruitsEaten = 0;
    interval = START_INTERVAL_MS;
    acc = 0;
    playMs = 0;
    paused = false;
    running = true;
    pendingRecord = null;
    lastRun = null;
    scoreValueEl.textContent = '0';
    score = 0;
    goRestartBtn.disabled = false;

    [rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay].forEach((o) => o.classList.remove('open'));
    recordMessagePopup.style.display = 'none';

    spawnFruit();
    updateBadges();
    lastTs = performance.now();
}

function enqueueDir(d) {
    if (!running || paused) return;
    const ref = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    if (d.x === ref.x && d.y === ref.y) return;           // même direction
    if (d.x === -ref.x && d.y === -ref.y) return;         // demi-tour interdit
    if (dirQueue.length >= MAX_DIR_QUEUE) return;
    dirQueue.push(d);
}

function tick() {
    if (dirQueue.length) dir = dirQueue.shift();
    const head = snake[0];
    const nx = head.x + dir.x, ny = head.y + dir.y;

    // Mur
    if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) { endGame(false); return; }

    const eating = nx === fruit.x && ny === fruit.y;

    // Corps (la queue libère sa case ce tour-ci, sauf si on grandit)
    const limit = eating ? snake.length : snake.length - 1;
    for (let i = 0; i < limit; i++) {
        if (snake[i].x === nx && snake[i].y === ny) { endGame(false); return; }
    }

    snake.unshift({ x: nx, y: ny });
    if (!eating) { snake.pop(); return; }

    fruitsEaten++;
    setScore(score + POINTS_PER_FRUIT);
    showDelta(POINTS_PER_FRUIT);
    interval = Math.max(MIN_INTERVAL_MS, START_INTERVAL_MS - fruitsEaten * SPEED_STEP_MS);
    if (!spawnFruit()) endGame(true);
}

// ─────────────────────────────────────────────
// FIN DE PARTIE & RECORDS
// ─────────────────────────────────────────────
function setRecordText(text, { congrats = false, quote = '' } = {}) {
    goRecordMsg.textContent = text;
    goRecordMsg.classList.toggle('congrats', congrats);
    if (quote) {
        const q = document.createElement('span');
        q.className = 'go-quote';
        q.textContent = `« ${quote} »`;
        goRecordMsg.appendChild(q);
    }
}

function showExistingRecord() {
    if (worldRecord.loaded && worldRecord.value > 0) {
        setRecordText(`Record mondial : ${worldRecord.value} pts`, { quote: worldRecord.message });
    } else {
        setRecordText('');
    }
}

function endGame(won) {
    if (!running) return;
    running = false;
    canvas.classList.add('shake');
    setTimeout(() => canvas.classList.remove('shake'), 400);

    const finalScore = score;
    const newPersonalBest = finalScore > bestScore;
    if (newPersonalBest) {
        bestScore = finalScore;
        lsSet(LS_BEST_KEY, bestScore);
    }
    updateBadges();

    const run = { id: ++runCounter, score: finalScore, submitted: false, saving: false };
    lastRun = run;
    pendingRecord = null;

    goEmoji.textContent = won ? '👑' : (newPersonalBest && finalScore > 0 ? '🏆' : '💀');
    goTitle.textContent = won ? 'Grille complète !' : (newPersonalBest && finalScore > 0 ? 'Nouveau record !' : 'Partie terminée !');
    goScore.textContent = finalScore;
    goBest.textContent = bestScore;
    goWorld.textContent = worldRecord.loaded ? worldRecord.value : '–';
    goLength.textContent = snake.length;
    goTime.textContent = formatTime(playMs);
    setRecordText('');

    // Vérification Firebase seulement si le score peut battre le record connu
    const mayBeRecord = finalScore > 0 && finalScore > worldRecord.value;
    if (mayBeRecord) {
        goRestartBtn.disabled = true;
        setRecordText('Vérification du record mondial…');
    } else {
        goRestartBtn.disabled = false;
        showExistingRecord();
    }

    setTimeout(() => {
        if (lastRun !== run) return; // une nouvelle partie a déjà été lancée
        gameoverOverlay.classList.add('open');
        if (!goRestartBtn.disabled) goRestartBtn.focus();
    }, 380);

    if (mayBeRecord) checkWorldRecord(run);
}

async function checkWorldRecord(run) {
    let popupOpened = false;
    try {
        await refreshWorldRecord();
        goWorld.textContent = worldRecord.value;
        if (lastRun !== run) return;

        if (run.score > worldRecord.value) {
            pendingRecord = run;
            openRecordPopup(run);
            popupOpened = true;
        } else {
            showExistingRecord();
        }
    } catch (e) {
        // Hors ligne / erreur Firebase : on ne bloque rien
        if (lastRun === run) {
            setRecordText(worldRecord.loaded ? '' : 'Record mondial indisponible (hors ligne)');
            if (worldRecord.loaded) showExistingRecord();
        }
    } finally {
        if (!popupOpened && lastRun === run) goRestartBtn.disabled = false;
    }
}

function openRecordPopup(run) {
    recordScoreLabel.textContent = run.score;
    recordMsgInput.value = '';
    recordCharCounter.textContent = `0/${MESSAGE_MAX_LEN}`;
    recordSaveStatus.textContent = '';
    saveRecordMsgBtn.disabled = false;
    saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'flex';
    setTimeout(() => recordMsgInput.focus(), 100);
}

function closeRecordPopup(run) {
    recordMessagePopup.style.display = 'none';
    pendingRecord = null;
    if (lastRun === run) {
        goRestartBtn.disabled = false;
        goRestartBtn.focus();
    }
}

async function saveRecord() {
    const run = pendingRecord;
    if (!run || run.submitted || run.saving || lastRun !== run) return; // un seul envoi par partie
    run.saving = true;
    saveRecordMsgBtn.disabled = true;
    skipRecordBtn.disabled = true;
    saveRecordMsgBtn.textContent = 'Enregistrement...';
    recordSaveStatus.textContent = '';

    const message = cleanMessage(recordMsgInput.value);
    let outcome = 'error';
    try {
        if (!Number.isInteger(run.score) || run.score <= 0 || run.score > MAX_POSSIBLE_SCORE) throw new Error('invalid-score');
        const fb = await getFb();
        if (!fb) throw new Error('firebase-unavailable');
        // Revérification juste avant l'écriture (un autre joueur a pu battre le record entre-temps)
        const latest = await fetchWorldRecord();
        if (run.score > latest.value) {
            await withTimeout(fb.setFirebaseLeaderboard(FB_GAME_ID, FB_KEY_SCORE, {
                value: run.score,
                message: message,
                timestamp: Date.now(),
            }), FB_TIMEOUT_MS);
            run.submitted = true;
            worldRecord = { value: run.score, message, loaded: true };
            outcome = 'saved';
        } else {
            worldRecord = latest;
            outcome = 'beaten';
        }
    } catch (e) {
        console.error('Error saving record message:', e);
    }

    run.saving = false;
    skipRecordBtn.disabled = false;
    updateBadges();

    if (outcome === 'error') {
        // Permet de réessayer ou de passer, sans jamais bloquer la partie
        saveRecordMsgBtn.disabled = false;
        saveRecordMsgBtn.textContent = 'Réessayer';
        recordSaveStatus.textContent = 'Envoi impossible (connexion). Réessayez ou passez.';
        return;
    }

    closeRecordPopup(run);
    goWorld.textContent = worldRecord.value;
    if (outcome === 'saved') {
        setRecordText('🏆 Bravo ! Vous détenez le record mondial de Snake !', { congrats: true, quote: message });
        goEmoji.textContent = '🏆';
        goTitle.textContent = 'Record du monde !';
    } else {
        showExistingRecord();
    }
}

// ─────────────────────────────────────────────
// PAUSE
// ─────────────────────────────────────────────
function pauseGame() {
    if (!running || paused) return;
    paused = true;
    pauseOverlay.classList.add('open');
    resumeBtnFocus();
}
function resumeBtnFocus() { const b = $('resumeBtn'); if (b) b.focus(); }
function resumeGame() {
    if (!paused) return;
    paused = false;
    pauseOverlay.classList.remove('open');
    acc = 0;
    lastTs = performance.now();
}

// ─────────────────────────────────────────────
// RENDU
// ─────────────────────────────────────────────
function resizeCanvas() {
    const r = boardArea.getBoundingClientRect();
    const size = Math.max(160, Math.min(r.width, r.height) - 8);
    cell = Math.max(8, Math.min(40, Math.floor(size / GRID_SIZE)));
    const css = cell * GRID_SIZE;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = css + 'px';
    canvas.style.height = css + 'px';
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
}

function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function draw(ts) {
    const W = cell * GRID_SIZE;
    // Fond en damier
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            ctx.fillStyle = (x + y) % 2 === 0 ? '#07203d' : '#061a33';
            ctx.fillRect(x * cell, y * cell, cell, cell);
        }
    }

    // Fruit (léger battement)
    const pulse = 1 + Math.sin(ts / 220) * 0.06;
    const fx = fruit.x * cell + cell / 2, fy = fruit.y * cell + cell / 2;
    const fr = cell * 0.36 * pulse;
    ctx.fillStyle = '#ef476f';
    ctx.beginPath(); ctx.arc(fx, fy + cell * 0.04, fr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(fx - fr * 0.35, fy - fr * 0.25, fr * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5ef5a0';
    ctx.beginPath(); ctx.ellipse(fx + fr * 0.35, fy - fr * 0.95, fr * 0.35, fr * 0.18, -0.6, 0, Math.PI * 2); ctx.fill();

    // Serpent (dégradé tête → queue)
    const n = snake.length;
    const pad = Math.max(1, cell * 0.06);
    for (let i = n - 1; i >= 0; i--) {
        const s = snake[i];
        const t = n > 1 ? i / (n - 1) : 0;
        const g = Math.round(255 - t * 90), b = Math.round(176 - t * 70);
        ctx.fillStyle = `rgb(${Math.round(94 - t * 60)},${g},${b})`;
        roundRect(s.x * cell + pad, s.y * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.28);
        ctx.fill();
    }

    // Yeux sur la tête
    if (n) {
        const h = snake[0];
        const cx = h.x * cell + cell / 2, cy = h.y * cell + cell / 2;
        const px = -dir.y, py = dir.x; // perpendiculaire
        const off = cell * 0.2, fw = cell * 0.18;
        for (const sgn of [-1, 1]) {
            const ex = cx + dir.x * fw + px * off * sgn;
            const ey = cy + dir.y * fw + py * off * sgn;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(ex, ey, cell * 0.11, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#031326';
            ctx.beginPath(); ctx.arc(ex + dir.x * cell * 0.03, ey + dir.y * cell * 0.03, cell * 0.05, 0, Math.PI * 2); ctx.fill();
        }
    }
}

// ─────────────────────────────────────────────
// BOUCLE
// ─────────────────────────────────────────────
function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(ts - lastTs, 100); // évite les rattrapages après une mise en veille
    lastTs = ts;

    // Jeu ET chronomètre figés si pause, modal ouverte ou onglet masqué
    if (running && !paused && !overlayOpen() && !document.hidden) {
        playMs += dt;
        acc += dt;
        while (acc >= interval && running) {
            acc -= interval;
            tick();
        }
    }
    draw(ts);
}

// ─────────────────────────────────────────────
// ENTRÉES
// ─────────────────────────────────────────────
const KEY_MAP = {
    arrowup: 'up', w: 'up', z: 'up',
    arrowdown: 'down', s: 'down',
    arrowleft: 'left', a: 'left', q: 'left',
    arrowright: 'right', d: 'right',
};

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    const key = e.key.toLowerCase();

    if (typing) return; // le champ de message gère ses propres touches

    if (key === 'escape' || key === 'p') {
        e.preventDefault();
        if (rulesOverlay.classList.contains('open')) rulesOverlay.classList.remove('open');
        else if (recordsOverlay.classList.contains('open')) recordsOverlay.classList.remove('open');
        else if (paused) resumeGame();
        else pauseGame();
        return;
    }

    if (gameoverOverlay.classList.contains('open') && recordMessagePopup.style.display === 'none') {
        if ((key === 'enter' || key === ' ') && !goRestartBtn.disabled) { e.preventDefault(); startGame(); }
        return;
    }

    const name = KEY_MAP[key];
    if (name) {
        e.preventDefault(); // pas de défilement de page avec les flèches
        if (!overlayOpen()) enqueueDir(DIRS[name]);
    }
});

// Glissement tactile sur la zone de jeu
let touchStart = null;
boardArea.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

boardArea.addEventListener('touchmove', (e) => {
    e.preventDefault(); // bloque le défilement / pull-to-refresh
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    if (Math.abs(dx) < SWIPE_MIN_PX && Math.abs(dy) < SWIPE_MIN_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) enqueueDir(dx > 0 ? DIRS.right : DIRS.left);
    else enqueueDir(dy > 0 ? DIRS.down : DIRS.up);
    touchStart = { x: t.clientX, y: t.clientY }; // permet d'enchaîner plusieurs virages
}, { passive: false });

boardArea.addEventListener('touchend', () => { touchStart = null; }, { passive: true });
boardArea.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });

// Croix directionnelle
document.querySelectorAll('.dpad-btn').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        enqueueDir(DIRS[btn.dataset.dir]);
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

// Pause automatique si l'onglet est masqué
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ─────────────────────────────────────────────
// BOUTONS / MODALS
// ─────────────────────────────────────────────
$('rulesBtn').addEventListener('click', () => rulesOverlay.classList.toggle('open'));
$('rulesClose').addEventListener('click', () => rulesOverlay.classList.remove('open'));
rulesOverlay.addEventListener('click', (e) => { if (e.target === rulesOverlay) rulesOverlay.classList.remove('open'); });

$('pauseBtn').addEventListener('click', pauseGame);
$('resumeBtn').addEventListener('click', resumeGame);
$('restartPauseBtn').addEventListener('click', startGame);
$('menuPauseBtn').addEventListener('click', () => { window.location.href = '../../index.html'; });

goRestartBtn.addEventListener('click', () => { if (!goRestartBtn.disabled) startGame(); });
$('goMenuBtn').addEventListener('click', () => { window.location.href = '../../index.html'; });

$('recordsBtn').addEventListener('click', async () => {
    recordsOverlay.classList.toggle('open');
    if (!recordsOverlay.classList.contains('open')) return;

    recPersonalScore.textContent = bestScore;
    recGlobalScore.textContent = worldRecord.loaded ? worldRecord.value : 0;
    recStatus.textContent = 'Synchronisation...';
    const card = recGlobalScore.closest('.record-card');
    const renderMessage = () => {
        card.querySelectorAll('.rc-message').forEach((m) => m.remove());
        if (worldRecord.message) {
            const m = document.createElement('span');
            m.className = 'rc-message';
            m.textContent = `« ${worldRecord.message} »`;
            card.appendChild(m);
        }
    };
    renderMessage();

    try {
        await refreshWorldRecord();
        recGlobalScore.textContent = worldRecord.value;
        renderMessage();
        recStatus.textContent = 'À jour (Cloud)';
    } catch (e) {
        recStatus.textContent = e && e.message === 'offline'
            ? 'Hors ligne (Records locaux)'
            : 'Erreur de connexion';
    }
});
$('recordsClose').addEventListener('click', () => recordsOverlay.classList.remove('open'));
recordsOverlay.addEventListener('click', (e) => { if (e.target === recordsOverlay) recordsOverlay.classList.remove('open'); });

// Popup record
saveRecordMsgBtn.addEventListener('click', saveRecord);
skipRecordBtn.addEventListener('click', () => {
    const run = pendingRecord;
    if (!run || run.saving) return;
    closeRecordPopup(run);
    showExistingRecord();
});
recordMsgInput.addEventListener('input', () => {
    recordCharCounter.textContent = `${recordMsgInput.value.length}/${MESSAGE_MAX_LEN}`;
});
recordMsgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveRecord(); } });

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 150));

updateBadges();
resizeCanvas();
startGame();                       // nouvelle partie dès l'ouverture, sans menu
requestAnimationFrame(frame);
refreshWorldRecord().catch(() => { /* hors ligne : le jeu continue normalement */ });
