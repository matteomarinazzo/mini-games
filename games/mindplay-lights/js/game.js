/**
 * Mindplay : Lumière – game.js
 *
 * Jeu de mémoire visuelle : des cases s'allument brièvement sur une grille carrée,
 * le joueur doit ensuite les retrouver (dans n'importe quel ordre). Une seule erreur
 * met fin à la partie. Chaque niveau compte 2 manches (2 s puis 1 s d'allumage) et
 * le nombre de cases augmente de 1 à chaque niveau.
 *
 * Organisation du fichier :
 *   1. CONFIG            – tous les paramètres à ajuster
 *   2. ÉTAT / DOM / CACHE
 *   3. RECORDS (outils)  – comparaison niveau puis durée, formats
 *   4. GRILLE            – construction et affichage
 *   5. DÉROULEMENT       – manches, phases (mémorisation / saisie), erreurs
 *   6. FLUX DE JEU       – démarrage, pause, fin de partie
 *   7. RECORDS EN LIGNE  – cache local "mindplay-lights" + record mondial Firebase
 *   8. BOUTONS / INIT
 *
 * Hors ligne : tout le jeu et les records personnels fonctionnent sans réseau.
 * Firebase / network.js ne sont chargés qu'en arrière-plan et ne bloquent jamais une partie.
 *
 * Toutes les durées de jeu sont en millisecondes et n'avancent que pendant que la partie
 * tourne (la pause les suspend, y compris le chronomètre et l'allumage des cases).
 */

// ─────────────────────────────────────────────
// 1. CONFIG  (valeurs à ajuster)
// ─────────────────────────────────────────────

// -- Grille -------------------------------------------------------
const GRID_SIZE = 7;               // la grille est GRID_SIZE × GRID_SIZE

// -- Niveaux ------------------------------------------------------
const START_CELLS = 3;             // nombre de cases à mémoriser au niveau 1
const CELLS_PER_LEVEL = 1;         // cases supplémentaires à chaque nouveau niveau
const ROUNDS_PER_LEVEL = 2;        // manches par niveau
const SHOW_TIMES = [2000, 1000];   // durée d'allumage (ms) de la manche 1, puis de la manche 2

// -- Rythme -------------------------------------------------------
const COUNTDOWN_MS = 900;          // petite pause avant l'allumage
const SUCCESS_MS = 700;            // temps d'affichage après une manche réussie
const FAIL_MS = 1200;              // temps d'affichage de l'erreur avant l'écran de défaite

// -- Records ------------------------------------------------------
const CACHE_KEY = 'mindplay-lights';   // clé du cache local (record perso, record mondial, message)
const FB_GAME = 'mindplay_lights';     // nœud Firebase : leaderboards/mindplay_lights/score
const FB_KEY = 'score';                // { value: niveau, duration: ms, message, timestamp }

// ─────────────────────────────────────────────
// 2. ÉTAT / DOM / CACHE
// ─────────────────────────────────────────────
let state = 'ready';     // ready | running | paused | over
let phase = 'idle';      // idle | countdown | show | input | success | fail
let phaseLeft = 0;       // temps restant dans la phase (ms)
let level = 1, round = 1, roundsWon = 0;
let targets = new Set(), found = new Set();
let elapsed = 0;         // durée de la partie hors pause (ms)
let ended = false;       // vrai dès l'erreur : le chronomètre est figé
let lastTime = 0;
let runId = 0;           // identifie la partie en cours (ignore les réponses réseau tardives)
let pendingRecord = null;

const ZERO = { level: 0, duration: 0 };
let cache = loadCache();
let bestRec = normRecord(cache.best);
let worldBest = normRecord(cache.worldBest);

// Modules en ligne (Firebase / réseau) : chargés sans bloquer le jeu
let fb = null, net = null;

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const levelValueEl = $('levelValue'), roundInfoEl = $('roundInfo'), statusLine = $('statusLine');
const bestValEl = $('bestVal'), remainValEl = $('remainVal'), timeValEl = $('timeVal');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay');
const pauseOverlay = $('pauseOverlay'), gameoverOverlay = $('gameoverOverlay');
const recordsOverlay = $('recordsOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

let cells = [];

function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}
function saveCache(patch) {
    cache = { ...cache, ...patch };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* stockage indisponible */ }
}

const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));

// ─────────────────────────────────────────────
// 3. RECORDS (outils)
// ─────────────────────────────────────────────
// Un record = { level, duration }. Classement : niveau le plus haut, puis durée la plus courte.
function normRecord(r) {
    if (r && typeof r === 'object') return { level: Number(r.level) || 0, duration: Number(r.duration) || 0 };
    return { ...ZERO };
}

// Format Firebase : { value: niveau, duration, message, timestamp } (ou simple nombre)
function parseRemote(data) {
    if (data && typeof data === 'object') return { level: Number(data.value) || 0, duration: Number(data.duration) || 0 };
    if (typeof data === 'number') return { level: data, duration: 0 };
    return { ...ZERO };
}

function isBetter(a, b) {
    if (a.level <= 0) return false;
    if (b.level <= 0) return true;
    return a.level > b.level || (a.level === b.level && a.duration < b.duration);
}

const pad2 = (n) => String(n).padStart(2, '0');

function fmtDuration(ms) {
    const tenths = Math.floor(ms / 100);
    const totalSec = Math.floor(tenths / 10);
    return `${Math.floor(totalSec / 60)}:${pad2(totalSec % 60)},${tenths % 10}`;
}
function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}
function fmtRecord(rec) {
    return rec.level > 0 ? `Niveau ${rec.level} · ${fmtDuration(rec.duration)}` : '—';
}

// ─────────────────────────────────────────────
// 4. GRILLE
// ─────────────────────────────────────────────
function buildGrid() {
    grid.style.setProperty('--n', GRID_SIZE);
    grid.innerHTML = '';
    cells = [];
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cell';
        b.dataset.i = i;
        b.setAttribute('aria-label', `Ligne ${Math.floor(i / GRID_SIZE) + 1}, colonne ${(i % GRID_SIZE) + 1}`);
        grid.appendChild(b);
        cells.push(b);
    }
}

function clearCells() {
    cells.forEach(c => c.classList.remove('lit', 'ok', 'bad', 'missed'));
    grid.classList.remove('input', 'win', 'shake');
}

grid.addEventListener('click', (e) => {
    const c = e.target.closest('.cell');
    if (c) onCell(Number(c.dataset.i));
});

// ─────────────────────────────────────────────
// 5. DÉROULEMENT D'UNE PARTIE
// ─────────────────────────────────────────────
const cellsFor = (lvl) => Math.min(START_CELLS + (lvl - 1) * CELLS_PER_LEVEL, GRID_SIZE * GRID_SIZE - 1);

function pickTargets(n) {
    const idx = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {          // Fisher-Yates
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return new Set(idx.slice(0, n));
}

function setStatus(text, cls = '') {
    statusLine.textContent = text;
    statusLine.className = 'status-line' + (cls ? ' ' + cls : '');
}

function renderTime() {
    const s = fmtClock(elapsed);
    if (timeValEl.textContent !== s) timeValEl.textContent = s;
}
function renderRemain() { remainValEl.textContent = targets.size - found.size; }
function renderBest() { bestValEl.textContent = bestRec.level > 0 ? `Niv. ${bestRec.level}` : '—'; }

function renderLevelInfo() {
    levelValueEl.textContent = level;
    const n = cellsFor(level);
    const sec = (SHOW_TIMES[round - 1] ?? SHOW_TIMES[SHOW_TIMES.length - 1]) / 1000;
    roundInfoEl.textContent = `Manche ${round} / ${ROUNDS_PER_LEVEL} · ${n} cases · ${sec} s`;
}

function startRound() {
    clearCells();
    targets = pickTargets(cellsFor(level));
    found = new Set();
    renderLevelInfo();
    renderRemain();
    phase = 'countdown';
    phaseLeft = COUNTDOWN_MS;
    setStatus('Prépare-toi…');
}

function startShow() {
    targets.forEach(i => cells[i].classList.add('lit'));
    phase = 'show';
    phaseLeft = SHOW_TIMES[round - 1] ?? SHOW_TIMES[SHOW_TIMES.length - 1];
    setStatus('Mémorise !', 'show');
}

function endShow() {
    targets.forEach(i => cells[i].classList.remove('lit'));
    phase = 'input';
    grid.classList.add('input');
    setStatus(`À toi ! ${targets.size} cases à retrouver`);
}

function onCell(i) {
    if (state !== 'running' || phase !== 'input' || found.has(i)) return;
    if (targets.has(i)) {
        found.add(i);
        cells[i].classList.add('ok');
        renderRemain();
        if (found.size === targets.size) roundWon();
    } else {
        wrong(i);
    }
}

function roundWon() {
    roundsWon++;
    phase = 'success';
    phaseLeft = SUCCESS_MS;
    grid.classList.remove('input');
    grid.classList.add('win');
    setStatus(round === ROUNDS_PER_LEVEL ? `Niveau ${level} réussi !` : 'Bravo !', 'good');
}

function nextRound() {
    if (round < ROUNDS_PER_LEVEL) {
        round++;
    } else {
        round = 1;
        level++;
        levelValueEl.classList.add('level-up');
        setTimeout(() => levelValueEl.classList.remove('level-up'), 600);
    }
    startRound();
}

function wrong(i) {
    ended = true;                      // fige le chronomètre : durée = démarrage → erreur
    cells[i].classList.add('bad');
    targets.forEach(t => { if (!found.has(t)) cells[t].classList.add('missed'); });
    phase = 'fail';
    phaseLeft = FAIL_MS;
    grid.classList.remove('input');
    grid.classList.add('shake');
    setTimeout(() => grid.classList.remove('shake'), 400);
    setStatus('Raté !', 'bad');
}

// dt en ms ; appelé seulement quand state === 'running' (donc jamais en pause)
function update(dt) {
    if (!ended) { elapsed += dt; renderTime(); }
    phaseLeft -= dt;
    if (phaseLeft > 0) return;
    switch (phase) {
        case 'countdown': startShow(); break;
        case 'show': endShow(); break;
        case 'success': nextRound(); break;
        case 'fail': finishGame(); break;
        default: break;                // 'input' : on attend le joueur
    }
}

// ─────────────────────────────────────────────
// 6. FLUX DE JEU
// ─────────────────────────────────────────────
function closeOverlays() {
    [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay].forEach(o => o.classList.remove('open'));
}

function startGame() {
    closeOverlays();
    recordMessagePopup.style.display = 'none';
    runId++;
    level = 1; round = 1; roundsWon = 0;
    elapsed = 0; ended = false;
    pendingRecord = null;
    setWorldStatus('');
    grid.classList.remove('veiled');
    timeValEl.textContent = '0:00';
    renderBest();
    state = 'running';
    lastTime = performance.now();
    startRound();
}

function pauseGame(openPauseModal = true) {
    if (state !== 'running' || phase === 'fail') return;
    state = 'paused';
    grid.classList.add('veiled');      // masque les cases allumées : pas de triche via la pause
    if (openPauseModal) pauseOverlay.classList.add('open');
}

function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    grid.classList.remove('veiled');
    state = 'running';
    lastTime = performance.now();
}

function setWorldStatus(text) { $('goWorldStatus').textContent = text; }

function finishGame() {
    if (state !== 'running') return;
    state = 'over';
    phase = 'idle';

    const result = { level, duration: Math.round(elapsed), rounds: roundsWon };

    // Record personnel (local, indépendant du réseau). Il faut au moins une manche réussie.
    const eligible = roundsWon > 0;
    let isPersonalBest = false;
    if (eligible && isBetter(result, bestRec)) {
        bestRec = { level: result.level, duration: result.duration };
        saveCache({ best: bestRec });
        isPersonalBest = true;
    }
    renderBest();

    $('goEmoji').textContent = isPersonalBest ? '🏆' : '💥';
    $('goTitle').textContent = isPersonalBest ? 'Nouveau record !' : 'Partie terminée';
    $('goLevel').textContent = result.level;
    $('goDuration').textContent = fmtDuration(result.duration);
    $('goBest').textContent = fmtRecord(bestRec);
    gameoverOverlay.classList.add('open');

    // Le record mondial est vérifié en arrière-plan : l'écran de défaite n'attend jamais le réseau
    if (eligible) checkWorldRecord(result, runId);
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

// Pause automatique quand l'onglet / la fenêtre perd le focus
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', pauseGame);

// Boucle principale
function loop(now) {
    const dt = Math.min(now - lastTime, 250);   // plafonné : évite les sauts après un lag
    lastTime = now;
    if (state === 'running') update(dt);
    requestAnimationFrame(loop);
}

// Clavier
document.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { state === 'running' ? pauseGame() : (state === 'paused' && resumeGame()); }
    else if (k === 'enter' && state === 'ready' && startOverlay.classList.contains('open')
        && !rulesOverlay.classList.contains('open') && document.activeElement?.id !== 'startRulesBtn') startGame();
});

// Aucun défilement / zoom de page pendant les gestes tactiles
['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

// ─────────────────────────────────────────────
// 7. RECORDS EN LIGNE (cache local "mindplay-lights" + Firebase)
// ─────────────────────────────────────────────
async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}

// Charge le record mondial depuis Firebase et le met en cache. Renvoie true si la valeur est fiable.
async function refreshWorldRecord() {
    try {
        if (!fb || !(await isOnline())) return false;
        const data = await fb.getFirebaseRecordData(FB_GAME, FB_KEY);
        if (data == null) {
            // Rien en base... ou erreur silencieuse de firebaseWrk.js : si un record était en cache, on ne s'y fie pas
            if (normRecord(cache.worldBest).level > 0) return false;
            worldBest = { ...ZERO };
            saveCache({ worldBest, worldMsg: '' });
            return true;
        }
        worldBest = parseRemote(data);
        saveCache({ worldBest, worldMsg: (data && data.message) || '' });
        return true;
    } catch (e) { console.error('Firebase records error:', e); return false; }
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

// Écran Records
function renderRecords() {
    $('recPersonalLevel').textContent = bestRec.level > 0 ? bestRec.level : '—';
    $('recPersonalTime').textContent = bestRec.level > 0 ? fmtDuration(bestRec.duration) : '—';
    $('recGlobalLevel').textContent = worldBest.level > 0 ? worldBest.level : '—';
    $('recGlobalTime').textContent = worldBest.level > 0 ? fmtDuration(worldBest.duration) : '—';
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
            addMsg(cache.worldMsg);
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
$('recordsClose').addEventListener('click', () => recordsOverlay.classList.remove('open'));
recordsOverlay.addEventListener('click', (e) => { if (e.target === recordsOverlay) recordsOverlay.classList.remove('open'); });

// Popup « nouveau record mondial » : publication du message
saveRecordMsgBtn.addEventListener('click', async () => {
    if (!pendingRecord) return;
    const rec = pendingRecord;
    const message = recordMsgInput.value.trim().substring(0, 50);
    saveRecordMsgBtn.disabled = true;
    saveRecordMsgBtn.textContent = 'Enregistrement...';

    let published = false, beaten = false;
    try {
        if (fb) {
            // Dernière vérification : un autre joueur a pu battre le record entre-temps
            const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
            if (fresh && !isBetter(rec, worldBest)) {
                beaten = true;
            } else {
                const res = await Promise.race([
                    fb.setFirebaseLeaderboard(FB_GAME, FB_KEY, {
                        value: rec.level, duration: rec.duration, message, timestamp: Date.now()
                    }),
                    wait(4000, false)
                ]);
                published = res === true;
            }
        }
    } catch (e) { console.error('Error saving record message:', e); }

    if (published) {
        worldBest = { level: rec.level, duration: rec.duration };
        saveCache({ worldBest, worldMsg: message });
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

// ─────────────────────────────────────────────
// 8. BOUTONS / INIT
// ─────────────────────────────────────────────
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

document.querySelectorAll('.js-grid-size').forEach(el => { el.textContent = `${GRID_SIZE} × ${GRID_SIZE}`; });

buildGrid();
renderBest();
renderLevelInfo();
setStatus('Prépare-toi…');
lastTime = performance.now();
requestAnimationFrame(loop);
const onlineReady = initOnline();   // en arrière-plan, sans bloquer le jeu
