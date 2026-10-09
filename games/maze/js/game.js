/**
 * Labyrinthe 3D – game.js (V4 : finitions — trajets de la vue de dessus, taille personnalisée, abandon)
 *
 * Point d'entrée : relie la page (DOM, clavier, tactile) au générateur (maze-generator.js),
 * au moteur (maze-engine.js), au rendu 3D (maze-render.js), à la vue de dessus de fin de partie (maze-map.js)
 * aux tailles (maze-size.js : préréglages + taille personnalisée, sans record), à la sauvegarde locale (maze-storage.js)
 * et au record mondial Firebase (maze-world.js, firebaseWrk.js du site, import dynamique).
 *
 * Organisation du fichier :
 *   1. CONFIG
 *   2. ÉTAT / DOM / SAUVEGARDE
 *   3. CIEL (fond identique à Ball Rush, fixe)
 *   4. LABYRINTHE (génération + vérification d'une partie)
 *   5. CONTRÔLES (clavier, boutons tactiles)
 *   6. FLUX DE JEU (démarrage, pause, victoire, vue de dessus)
 *   7. FENÊTRES D'INFORMATION (règles, records)
 *   8. RECORD MONDIAL (Firebase, hors ligne toléré)
 *   9. BOUCLE / INIT
 *
 * Stockage : UNE seule clé localStorage, « maze » (voir maze-storage.js). Aucune autre clé n'est touchée.
 * Taille personnalisée : jamais de record local ni mondial, jamais mémorisée dans `maze` (garde : hasRecords()).
 */
import { generateMaze, verifyMaze, toBlockGrid } from './core/maze-generator.js';
import { createPlayer, stepPlayer, atExit } from './core/maze-engine.js';
import { computeView, drawScene } from './core/maze-render.js';
import { createTrail, addTrailPoint, drawMap } from './core/maze-map.js';
import { loadData, saveData, recordTime, LEVEL_IDS, MESSAGE_MAX } from './core/maze-storage.js';
import { fetchWorld, submitWorld } from './core/maze-world.js';
import { PRESET_SIZES, CUSTOM_ID, CUSTOM_DEFAULT, isCustom, hasRecords, parseCustom } from './core/maze-size.js';
import { playMazeSound, startMazeMusic, stopMazeMusic, toggleMazeMusic, toggleMazeSound } from '../../../js/utils/audio.js';
// ─────────────────────────────────────────────
// 1. CONFIG
// ─────────────────────────────────────────────
const LEVELS = { ...PRESET_SIZES, [CUSTOM_ID]: { ...CUSTOM_DEFAULT } };   // `custom` est modifiée par applyCustom()
const ABANDON_CONFIRM_MS = 3000;   // délai pour confirmer « Abandonner » (second appui)
const WIN_DELAY = 500;      // ms entre l'arrivée et l'écran de victoire
const HINT_TIME = 5000;     // ms d'affichage de l'aide clavier
const MAP_MAX_H = 360;      // hauteur maximale de la vue de dessus (px), en plus de 38 % de la hauteur de l'écran

// ─────────────────────────────────────────────
// 2. ÉTAT / DOM / SAUVEGARDE
// ─────────────────────────────────────────────
let state = 'ready';        // ready | running | paused | won | over (partie abandonnée)
let level = 'normal';
let maze = null, grid = null, player = null, trail = null;
let elapsed = 0;            // secondes de jeu (hors pause)
let lastTime = 0;
let W = 0, H = 0, dpr = 1, view = computeView(1, 1);
let shownTime = '', shownDist = -1;
let resumeAfterInfo = false;   // une fenêtre règles / records a mis la partie en pause : la reprendre à sa fermeture
let hintTimer = 0;
// Clés = options lues par drawMap() (maze-map.js). V3 : { trail, best } n'était lu par personne → les boutons n'avaient aucun effet.
const mapShow = { showTrail: true, showBest: true };
const LAYER_OPTION = { trail: 'showTrail', best: 'showBest' };   // data-layer des boutons → option de drawMap
let fb = null, net = null;     // firebaseWrk.js et network.js du site (import dynamique ; null = hors ligne)
let pendingWorld = null;       // { level, tenths } : record mondial battu, en attente du message du joueur
let abandonTimer = 0;          // délai de confirmation du bouton « Abandonner »

const $ = (id) => document.getElementById(id);
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
const skyCanvas = $('skyCanvas'), skyCtx = skyCanvas.getContext('2d');
const mapCanvas = $('mapCanvas'), mapCtx = mapCanvas.getContext('2d');
const startOverlay = $('startOverlay'), pauseOverlay = $('pauseOverlay'), winOverlay = $('winOverlay');
const rulesOverlay = $('rulesOverlay'), recordsOverlay = $('recordsOverlay');
const recordPopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput'), saveRecordBtn = $('saveRecordMsgBtn');
const timeValueEl = $('timeValue'), distValEl = $('distVal'), bestValEl = $('bestVal'), tapHint = $('tapHint');
const abandonBtn = $('abandonBtn'), customPanel = $('customPanel');
const colsInput = $('customCols'), rowsInput = $('customRows');
const soundToggle = $('soundToggle'), musicToggle = $('musicToggle');

// Sauvegarde locale : accès au stockage protégé (peut lever une exception en navigation privée / cookies bloqués)
let store = null;
try { store = window.localStorage; } catch { store = null; }
const data = loadData(store);
if (LEVELS[data.level]) level = data.level;

const formatTenths = (t) => `${Math.floor(t / 600)}:${String(Math.floor(t / 10) % 60).padStart(2, '0')}.${t % 10}`;
const formatTime = (s) => formatTenths(Math.floor(s * 10));

function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    skyCanvas.width = Math.round(window.innerWidth * dpr); skyCanvas.height = Math.round(window.innerHeight * dpr);
    view = computeView(W, H);
    drawSky();
    if (winOverlay.classList.contains('open')) drawWinMap();
}

// ─────────────────────────────────────────────
// 3. CIEL
// ─────────────────────────────────────────────
function drawSky() {
    const w = skyCanvas.width, h = skyCanvas.height;
    skyCtx.setTransform(1, 0, 0, 1, 0, 0);
    const g = skyCtx.createLinearGradient(0, h, 0, 0);   // mêmes teintes que Ball Rush, assombries (nuit)
    g.addColorStop(0, 'rgb(12,34,73)'); g.addColorStop(.5, 'rgb(4,18,46)'); g.addColorStop(1, 'rgb(1,5,15)');
    skyCtx.fillStyle = g; skyCtx.fillRect(0, 0, w, h);
}

function buildStars() {
    document.querySelectorAll('.star').forEach((s) => s.remove());
    for (let i = 0; i < 55; i++) {
        const s = document.createElement('div'); s.className = 'star';
        const size = Math.random() * 2.2 + .4;
        s.style.cssText = `width:${size}px;height:${size}px;top:${Math.random() * 55}%;left:${Math.random() * 100}%;` +
            `--op1:${(.3 + Math.random() * .6).toFixed(2)};--op2:${(Math.random() * .15).toFixed(2)};` +
            `--tw:${(2 + Math.random() * 4).toFixed(1)}s;animation-delay:${(Math.random() * 4).toFixed(1)}s;`;
        document.body.appendChild(s);
    }
}

// ─────────────────────────────────────────────
// 4. LABYRINTHE
// ─────────────────────────────────────────────
/** Génère un nouveau labyrinthe de la taille choisie (départ dans un coin au hasard) et le vérifie. */
function newMaze() {
    const L = LEVELS[level];
    for (let i = 0; i < 3; i++) {
        const start = { x: Math.random() < .5 ? 0 : L.cols - 1, y: Math.random() < .5 ? 0 : L.rows - 1 };
        maze = generateMaze({ cols: L.cols, rows: L.rows, start });
        if (verifyMaze(maze).valid) break;
        console.error('Labyrinthe invalide : nouvelle génération', maze.seed);   // ne devrait jamais arriver
    }
    grid = toBlockGrid(maze);
    player = createPlayer(maze);
    trail = createTrail(player.x, player.y);
    elapsed = 0;
    updateTime(true);
    updateDist(true);
}

// ─────────────────────────────────────────────
// 5. CONTRÔLES
// ─────────────────────────────────────────────
const keys = { left: false, right: false, fwd: false, back: false };
const pad = { left: false, right: false, fwd: false, back: false };
const input = { turn: 0, move: 0 };

const KEYMAP = {
    arrowleft: 'left', a: 'left', q: 'left',        // « q » = A sur un clavier AZERTY
    arrowright: 'right', d: 'right',
    arrowup: 'fwd', w: 'fwd', z: 'fwd',             // « z » = W sur un clavier AZERTY
    arrowdown: 'back', s: 'back',
};

function clearControls() {
    for (const k in keys) keys[k] = pad[k] = false;
    document.querySelectorAll('.pad-btn.active').forEach((b) => b.classList.remove('active'));
}
function readInput() {
    input.turn = (keys.right || pad.right ? 1 : 0) - (keys.left || pad.left ? 1 : 0);
    input.move = (keys.fwd || pad.fwd ? 1 : 0) - (keys.back || pad.back ? 1 : 0);
}

const infoOpen = () => rulesOverlay.classList.contains('open') || recordsOverlay.classList.contains('open');

document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;   // saisie du message de record : aucune touche de jeu
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) { keys[KEYMAP[k]] = true; hideHint(); e.preventDefault(); }
    else if (k === 'escape') {
        if (infoOpen()) closeInfo();
        else if (state === 'running') pauseGame();
        else if (state === 'paused') resumeGame();
    }
    else if (k === 'enter' && state === 'ready' && startOverlay.classList.contains('open') && !infoOpen()) startGame();
});
document.addEventListener('keyup', (e) => { const a = KEYMAP[e.key.toLowerCase()]; if (a) keys[a] = false; });

// Boutons tactiles : maintenir enfoncé (plusieurs doigts possibles : tourner + avancer)
document.querySelectorAll('.pad-btn').forEach((b) => {
    const act = b.dataset.act;
    const on = (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); pad[act] = true; b.classList.add('active'); hideHint(); };
    const off = () => { pad[act] = false; b.classList.remove('active'); };
    b.addEventListener('pointerdown', on);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, off));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
});

// Aucun défilement / zoom de page pendant les gestes tactiles (sauf dans les fenêtres modales)
['touchmove', 'gesturestart'].forEach((ev) =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

function hideHint() { tapHint.classList.add('hidden'); }

// ─────────────────────────────────────────────
// 6. FLUX DE JEU
// ─────────────────────────────────────────────
function closeOverlays() {
    startOverlay.classList.remove('open'); pauseOverlay.classList.remove('open'); winOverlay.classList.remove('open');
    rulesOverlay.classList.remove('open'); recordsOverlay.classList.remove('open'); recordPopup.classList.remove('open');
    resetAbandon();
}

function updateTime(force) {
    const s = formatTime(elapsed);
    if (force || s !== shownTime) { shownTime = s; timeValueEl.textContent = s; }
}

let lastWalkSoundDist = 0;
function updateDist(force) {
    const d = player ? Math.round(player.walked) : 0;
    if (force || d !== shownDist) {
        shownDist = d;
        distValEl.textContent = d;
        if (!force && d > lastWalkSoundDist) {
            playMazeSound('move');
            lastWalkSoundDist = d;
        }
    }
    if (force) lastWalkSoundDist = d;
}

/** Affiche le meilleur temps de la taille choisie dans l'indicateur latéral. */
function refreshBest() {
    const t = hasRecords(level) ? data.best[level] : null;   // taille personnalisée : pas de record
    bestValEl.textContent = t ? formatTenths(t) : '–';
}

/** Reflète `level` sur les boutons de taille de l'écran de démarrage. */
function selectLevelUi() {
    document.querySelectorAll('.diff-btn').forEach((o) => {
        const sel = o.dataset.level === level;
        o.classList.toggle('selected', sel); o.setAttribute('aria-pressed', sel);
    });
    customPanel.hidden = !isCustom(level);
}

/** Lit les champs « colonnes / lignes », les ramène dans les bornes, les réécrit et met à jour LEVELS.custom. */
function applyCustom() {
    const c = parseCustom(colsInput.value, rowsInput.value, LEVELS[CUSTOM_ID]);
    LEVELS[CUSTOM_ID] = c;
    colsInput.value = c.cols; rowsInput.value = c.rows;
    $('customSizeLabel').textContent = `${c.cols}×${c.rows}`;
}

function startGame() {
    closeOverlays();
    clearControls();
    resumeAfterInfo = false;
    pendingWorld = null;
    if (isCustom(level)) applyCustom();
    newMaze();
    refreshBest();
    state = 'running';
    tapHint.classList.remove('hidden');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, HINT_TIME);
    lastTime = performance.now();
    startMazeMusic();
}

function showReady() {   // écran de démarrage (choix de la taille) ; un nouveau labyrinthe sert de décor
    closeOverlays();
    clearControls();
    resumeAfterInfo = false;
    pendingWorld = null;
    newMaze();
    refreshBest();
    state = 'ready';
    startOverlay.classList.add('open');
}

function pauseGame(openModal = true) {
    if (state !== 'running') return;
    state = 'paused';
    clearControls();
    if (openModal) { resetAbandon(); pauseOverlay.classList.add('open'); }
}

function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    resumeAfterInfo = false;
    state = 'running';
    lastTime = performance.now();
    startMazeMusic();
}

/** Titre de la fenêtre de fin (victoire ou abandon). */
function setEndTitle(text) { $('winTitle').textContent = text; }

/** Remplit les lignes communes de la fenêtre de fin (victoire ET abandon) : temps, meilleur temps, record mondial, distances, taille. */
function fillEndStats(lvl, tenths) {
    const L = LEVELS[lvl], ranked = hasRecords(lvl);
    $('winTime').textContent = formatTenths(tenths);
    $('winRecTime').textContent = ranked && data.best[lvl] ? formatTenths(data.best[lvl]) : '–';
    $('winRecord').hidden = true;
    $('winNote').hidden = true;
    $('winDist').textContent = Math.round(player.walked);
    $('winBest').textContent = (maze.path.length - 1) * 2;   // 2 blocs (= 2 m) par pas de cellule
    $('winSize').textContent = `${L.cols}×${L.rows}${ranked ? '' : ' (perso)'}`;
    showWorldStat(lvl);
}

function showEndNote(text) { $('winNote').textContent = text; $('winNote').hidden = false; }

async function win() {
    state = 'won';
    clearControls();
    playMazeSound('win');
    addTrailPoint(trail, player.x, player.y, true);   // le trajet se termine exactement sur la sortie

    const lvl = level, ranked = hasRecords(lvl);
    const tenths = Math.floor(elapsed * 10);
    let isRecord = false;
    if (ranked) {   // taille personnalisée : aucun enregistrement
        ({ isRecord } = recordTime(data, lvl, tenths));
        if (isRecord) saveData(store, data);
    }
    refreshBest();

    setEndTitle('🏁 Sortie trouvée !');
    fillEndStats(lvl, tenths);
    $('winRecord').textContent = '🏆 Nouveau record !';
    $('winRecord').hidden = !isRecord;
    if (!ranked) showEndNote('Taille personnalisée : aucun record enregistré.');

    // Record mondial : on resynchronise avant de comparer (délais maximaux : le jeu ne doit jamais rester bloqué hors ligne)
    pendingWorld = null;
    if (ranked && fb && await Promise.race([isOnline(), wait(2500, false)]) && state === 'won') {
        const w = await Promise.race([fetchWorld(fb, lvl), wait(2500, null)]);
        if (w && w.ok) {
            setWorldCache(lvl, w.value === null ? null : { value: w.value, message: w.message });
            showWorldStat(lvl);
            if (w.value === null || tenths < w.value) pendingWorld = { level: lvl, tenths };
        }
    }
    await wait(WIN_DELAY);
    if (state !== 'won') return;
    if (pendingWorld) openWorldPopup(); else openWinOverlay();
}

/** Abandon depuis le menu pause : même fenêtre de fin que la victoire (vue de dessus comprise), sans aucun enregistrement. */
function giveUp() {
    if (state !== 'paused') return;
    state = 'over';
    clearControls();
    playMazeSound('abandon');
    resumeAfterInfo = false;
    pendingWorld = null;
    pauseOverlay.classList.remove('open');
    resetAbandon();
    addTrailPoint(trail, player.x, player.y, true);   // le trajet s'arrête là où le joueur a abandonné
    setEndTitle('🏳️ Partie abandonnée');
    fillEndStats(level, Math.floor(elapsed * 10));
    showEndNote('Partie abandonnée : aucun temps enregistré.');
    openWinOverlay();
}

/** « Abandonner » demande un second appui (3 s) : évite de perdre une partie sur un appui involontaire. */
function resetAbandon() {
    clearTimeout(abandonTimer);
    abandonBtn.classList.remove('confirm');
    abandonBtn.textContent = 'Abandonner';
}

function openWinOverlay() {
    winOverlay.classList.add('open');
    drawWinMap();   // la carte ne se mesure qu'une fois la fenêtre affichée
}

/** Vue de dessus : taille calculée pour tenir dans la fenêtre, puis dessin (départ, sortie, trajet, chemin le plus court). */
function drawWinMap() {
    if (!maze || !grid) return;
    const availW = $('mapWrap').clientWidth;
    if (!availW) return;
    const maxH = Math.max(140, Math.min(window.innerHeight * 0.38, MAP_MAX_H));
    const s = Math.min(availW / grid.width, maxH / grid.height);
    const cw = Math.floor(grid.width * s), ch = Math.floor(grid.height * s);
    mapCanvas.style.width = cw + 'px'; mapCanvas.style.height = ch + 'px';
    mapCanvas.width = Math.round(cw * dpr); mapCanvas.height = Math.round(ch * dpr);
    mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap(mapCtx, cw, ch, maze, grid, trail, mapShow);
}

document.querySelectorAll('.map-chip').forEach((b) => b.addEventListener('click', () => {
    const k = LAYER_OPTION[b.dataset.layer];   // clé attendue par drawMap()
    mapShow[k] = !mapShow[k];
    b.classList.toggle('on', mapShow[k]); b.setAttribute('aria-pressed', mapShow[k]);
    drawWinMap();
}));

// Pause automatique quand l'onglet / la fenêtre perd le focus
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', () => pauseGame());

// Boutons
document.querySelectorAll('.diff-btn').forEach((b) => b.addEventListener('click', () => {
    level = b.dataset.level;
    if (hasRecords(level)) { data.level = level; saveData(store, data); }   // la taille personnalisée n'est jamais mémorisée
    else applyCustom();
    selectLevelUi();
    newMaze();   // décor : un labyrinthe de la taille choisie
    refreshBest();
}));
[colsInput, rowsInput].forEach((inp) => {
    inp.addEventListener('change', () => { applyCustom(); newMaze(); });
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); startGame(); } });
});
$('playBtn').addEventListener('click', startGame);
$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', resumeGame);
$('restartPauseBtn').addEventListener('click', startGame);
$('sizePauseBtn').addEventListener('click', showReady);
abandonBtn.addEventListener('click', () => {
    if (abandonBtn.classList.contains('confirm')) { giveUp(); return; }
    abandonBtn.classList.add('confirm');
    abandonBtn.textContent = 'Confirmer l\'abandon ?';
    abandonBtn.textContent = 'Confirmer l\'abandon ?';
    abandonTimer = setTimeout(resetAbandon, ABANDON_CONFIRM_MS);
});

function updateAudioBtns() {
    if (localStorage.getItem("maze_sound") === "false") soundToggle.classList.add('muted');
    else soundToggle.classList.remove('muted');
    if (localStorage.getItem("maze_music") === "false") musicToggle.classList.add('muted');
    else musicToggle.classList.remove('muted');
}
if (soundToggle && musicToggle) {
    soundToggle.addEventListener('click', () => { toggleMazeSound(); updateAudioBtns(); });
    musicToggle.addEventListener('click', () => { toggleMazeMusic(); updateAudioBtns(); });
    updateAudioBtns();
}
$('menuPauseBtn').addEventListener('click', () => { window.location.href = '../../index.html'; });
$('winAgainBtn').addEventListener('click', startGame);
$('winSizeBtn').addEventListener('click', showReady);
$('winMenuBtn').addEventListener('click', () => { window.location.href = '../../index.html'; });

// ─────────────────────────────────────────────
// 7. FENÊTRES D'INFORMATION (règles, records)
// ─────────────────────────────────────────────
/** Ouvre une fenêtre par-dessus l'écran courant ; en pleine partie, met le jeu en pause (sans fenêtre de pause). */
function openInfo(el) {
    if (state === 'running') { pauseGame(false); resumeAfterInfo = true; }
    el.classList.add('open');
}

function closeInfo() {
    rulesOverlay.classList.remove('open'); recordsOverlay.classList.remove('open');
    if (resumeAfterInfo) { resumeAfterInfo = false; resumeGame(); }
}

function fillRecords() {
    const ids = { easy: 'recEasy', normal: 'recNormal', hard: 'recHard' };
    for (const id of LEVEL_IDS) $(ids[id]).textContent = data.best[id] ? formatTenths(data.best[id]) : '–';
}

$('rulesBtn').addEventListener('click', () => openInfo(rulesOverlay));
$('recordsBtn').addEventListener('click', () => { fillRecords(); openInfo(recordsOverlay); fillWorldRecords(); });
$('rulesClose').addEventListener('click', closeInfo);
$('recordsClose').addEventListener('click', closeInfo);
[rulesOverlay, recordsOverlay].forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) closeInfo(); }));

// ─────────────────────────────────────────────
// 8. RECORD MONDIAL
// ─────────────────────────────────────────────
// Données : leaderboards/maze/time_<taille> = { value (dixièmes, plus petit = meilleur), message, timestamp } (voir maze-world.js).
// Hors ligne ou Firebase inaccessible : le jeu fonctionne, le dernier record connu (cache `world` de la clé `maze`) est affiché.
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}

/** Import dynamique : si les modules du site sont inaccessibles, le jeu fonctionne quand même (sans record mondial). */
async function initOnline() {
    try {
        [fb, net] = await Promise.all([
            import('../../../js/firebaseWrk.js'),
            import('../../../js/network.js'),
        ]);
    } catch (e) { fb = net = null; console.warn('Mode hors ligne :', e); }
}

function setWorldCache(lvl, rec, save = true) {
    data.world[lvl] = rec;
    if (save) saveData(store, data);
}

/** Écrit un record (cache) dans une carte de la fenêtre des records, avec son message en dessous. */
function renderWorldCard(valueEl, rec) {
    valueEl.textContent = rec ? formatTenths(rec.value) : '–';
    const card = valueEl.closest('.record-card');
    card.querySelectorAll('.rc-message').forEach((m) => m.remove());
    if (rec && rec.message) {
        const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${rec.message} »`; card.appendChild(m);
    }
}

function showWorldStat(lvl) {
    const w = hasRecords(lvl) ? data.world[lvl] : null;
    $('winWorld').textContent = w ? formatTenths(w.value) : '–';
}

async function fillWorldRecords() {
    const ids = { easy: 'wrEasy', normal: 'wrNormal', hard: 'wrHard' }, status = $('recStatus');
    for (const id of LEVEL_IDS) renderWorldCard($(ids[id]), data.world[id]);   // d'abord le dernier record connu
    status.textContent = 'Synchronisation...';
    if (!fb || !(await isOnline())) { status.textContent = 'Hors ligne (derniers records connus)'; return; }
    const res = await Promise.all(LEVEL_IDS.map((id) => fetchWorld(fb, id)));
    LEVEL_IDS.forEach((id, i) => {
        if (!res[i].ok) return;
        setWorldCache(id, res[i].value === null ? null : { value: res[i].value, message: res[i].message }, false);
        renderWorldCard($(ids[id]), data.world[id]);
    });
    saveData(store, data);
    status.textContent = res.every((r) => r.ok) ? 'À jour (Cloud)' : 'Erreur de connexion';
}

function openWorldPopup() {
    recordMsgInput.value = ''; $('recordCharCounter').textContent = `0/${MESSAGE_MAX}`;
    saveRecordBtn.disabled = false; saveRecordBtn.textContent = 'Sauvegarder';
    recordPopup.classList.add('open');
    setTimeout(() => recordMsgInput.focus(), 100);
}

async function saveWorldRecord() {
    if (!pendingWorld || saveRecordBtn.disabled) return;
    if (!hasRecords(pendingWorld.level)) { pendingWorld = null; recordPopup.classList.remove('open'); return; }   // garde : jamais d'écriture Firebase hors préréglages
    const p = pendingWorld;
    saveRecordBtn.disabled = true; saveRecordBtn.textContent = 'Enregistrement...';
    const r = await Promise.race([submitWorld(fb, p.level, p.tenths, recordMsgInput.value), wait(6000, null)]);
    pendingWorld = null;
    recordPopup.classList.remove('open');
    if (r && r.written) {
        setWorldCache(p.level, { value: r.value, message: r.message });
        $('winRecord').textContent = '🌍 Record mondial !'; $('winRecord').hidden = false;
    } else if (r && r.beaten) {
        setWorldCache(p.level, { value: r.value, message: r.message });
        $('winNote').textContent = 'Un meilleur record mondial vient d\'être enregistré.'; $('winNote').hidden = false;
    } else {
        $('winNote').textContent = 'Record mondial non enregistré (connexion ?).'; $('winNote').hidden = false;
    }
    showWorldStat(p.level);
    if (state === 'won') openWinOverlay();
}

saveRecordBtn.addEventListener('click', saveWorldRecord);
recordMsgInput.addEventListener('input', () => { $('recordCharCounter').textContent = `${recordMsgInput.value.length}/${MESSAGE_MAX}`; });
recordMsgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveWorldRecord(); });

// ─────────────────────────────────────────────
// 9. BOUCLE / INIT
// ─────────────────────────────────────────────
function update(dt) {
    readInput();
    stepPlayer(player, grid, input, dt);
    addTrailPoint(trail, player.x, player.y);
    elapsed += dt;
    updateTime(false);
    updateDist(false);
    if (atExit(maze, player)) win();
}

function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);   // plafonné : évite les sauts après un lag
    lastTime = now;
    if (state === 'running') update(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, view, grid, maze, player, now / 1000);
    requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
buildStars();
applyCustom();
selectLevelUi();
newMaze();
refreshBest();
initOnline();   // sans attendre : le jeu démarre tout de suite
lastTime = performance.now();
requestAnimationFrame(loop);
