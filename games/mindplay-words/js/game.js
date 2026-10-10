/**
 * Mindplay : Mots – game.js
 *
 * Jeu de mémoire de mots : une liste de mots français s'affiche UN PAR UN, puis disparaît.
 * Le jeu propose alors 4 mots (2 de la liste + 2 intrus) : le joueur doit retrouver les 2 mots
 * de la liste. Pas de limite de temps pour répondre. Une seule erreur ramène au niveau 1.
 *
 * Progression : 5 mots aux niveaux 1-2, +1 mot tous les 2 niveaux.
 *               niveaux impairs : 2 s par mot ; niveaux pairs : 1 s par mot.
 *
 * Organisation du fichier :
 *   1. CONFIG            – tous les paramètres à ajuster
 *   2. ÉTAT / DOM / CACHE
 *   3. RECORDS (outils)  – comparaison niveau puis durée, formats
 *   4. MOTS              – tirage des mots, intrus, anti-confusion
 *   5. DÉROULEMENT       – phases (mémorisation / réponse), erreurs
 *   6. FLUX DE JEU       – démarrage, pause, fin de partie
 *   7. RECORDS EN LIGNE  – cache local "mindplay-words" + record mondial Firebase
 *   8. BOUTONS / INIT
 *
 * Hors ligne : tout le jeu et les records personnels fonctionnent sans réseau.
 * Firebase / network.js ne sont chargés qu'en arrière-plan et ne bloquent jamais une partie.
 *
 * Toutes les durées sont en millisecondes et n'avancent que pendant que la partie tourne :
 * la pause suspend tout (chronomètre, mot affiché, intervalle entre deux mots).
 */

import { WORD_ENTRIES, areSimilar } from './words.js';

// ─────────────────────────────────────────────
// 1. CONFIG  (valeurs à ajuster)
// ─────────────────────────────────────────────

// -- Niveaux ------------------------------------------------------
const START_WORDS = 5;             // mots à mémoriser au niveau 1
const LEVELS_PER_STEP = 2;         // le nombre de mots augmente de 1 tous les N niveaux
const TARGETS = 2;                 // mots de la liste à retrouver
const DECOYS = 2;                  // intrus proposés
const WORD_TIME_ODD = 2000;        // durée d'affichage d'un mot, niveaux impairs (ms)
const WORD_TIME_EVEN = 1000;       // durée d'affichage d'un mot, niveaux pairs (ms)

// -- Rythme -------------------------------------------------------
const COUNTDOWN_MS = 900;          // petite pause avant le premier mot
const GAP_MS = 180;                // écran vide entre deux mots (ne compte pas dans la durée du mot)
const SUCCESS_MS = 800;            // temps d'affichage après une réussite
const FAIL_MS = 1600;              // temps d'affichage de l'erreur avant l'écran de défaite

// -- Records ------------------------------------------------------
const CACHE_KEY = 'mindplay-words';    // clé du cache local (record perso, record mondial, message)
const FB_GAME = 'mindplay_words';      // nœud Firebase : leaderboards/mindplay_words/score
const FB_KEY = 'score';                // { value: niveau, duration: ms, message, timestamp }

// ─────────────────────────────────────────────
// 2. ÉTAT / DOM / CACHE
// ─────────────────────────────────────────────
let state = 'ready';     // ready | running | paused | over
let phase = 'idle';      // idle | countdown | show | input | success | fail
let showStep = 'word';   // sous-état de 'show' : word | gap
let phaseLeft = 0;       // temps restant dans la phase / l'étape (ms)
let level = 1, levelsWon = 0;
let list = [];           // mots à mémoriser (dans l'ordre d'affichage)
let wordIdx = 0;         // mot en cours d'affichage
let wordTime = WORD_TIME_ODD;
let choices = [];        // [{ w, target }] : les 4 cartes de réponse
let found = new Set();   // indices des bonnes cartes trouvées
let usedWords = new Set();   // mots déjà utilisés dans la partie (formes normalisées)
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
const panel = $('panel'), wordDisplay = $('wordDisplay'), dotsEl = $('dots'), timerFill = $('timerFill');
const choicesEl = $('choices');
const levelValueEl = $('levelValue'), roundInfoEl = $('roundInfo'), statusLine = $('statusLine');
const bestValEl = $('bestVal'), progressLabelEl = $('progressLabel'), progressValEl = $('progressVal'), timeValEl = $('timeVal');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay');
const pauseOverlay = $('pauseOverlay'), gameoverOverlay = $('gameoverOverlay');
const recordsOverlay = $('recordsOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

let cards = [];

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
// 4. MOTS
// ─────────────────────────────────────────────
const wordsFor = (lvl) => START_WORDS + Math.floor((lvl - 1) / LEVELS_PER_STEP);
const timeFor = (lvl) => (lvl % 2 === 1 ? WORD_TIME_ODD : WORD_TIME_EVEN);

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {          // Fisher-Yates
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Tire `count` mots jamais utilisés dans la partie et sans proximité entre eux.
function drawWords(count) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const picked = [];
        for (const e of shuffle(WORD_ENTRIES.slice())) {
            if (usedWords.has(e.n)) continue;
            if (picked.some(p => areSimilar(p.n, e.n))) continue;
            picked.push(e);
            if (picked.length === count) return picked;
        }
        usedWords = new Set();          // banque épuisée (partie très longue) : on recommence à neuf
    }
    return shuffle(WORD_ENTRIES.slice()).slice(0, count);   // ne devrait jamais arriver
}

// Prépare un niveau : liste à mémoriser + 4 cartes (2 mots de la liste + 2 intrus).
// Les intrus ne sont jamais proches d'un mot de la liste, ni entre eux.
function prepareLevel() {
    const n = wordsFor(level);
    const drawn = drawWords(n + DECOYS);
    const listEntries = drawn.slice(0, n);
    const decoys = drawn.slice(n);
    drawn.forEach(e => usedWords.add(e.n));

    list = listEntries.map(e => e.w);
    wordTime = timeFor(level);

    const targets = shuffle(listEntries.slice()).slice(0, TARGETS);
    choices = shuffle([
        ...targets.map(e => ({ w: e.w, target: true })),
        ...decoys.map(e => ({ w: e.w, target: false }))
    ]);
    found = new Set();
}

// ─────────────────────────────────────────────
// 5. DÉROULEMENT D'UN NIVEAU
// ─────────────────────────────────────────────
function setStatus(text, cls = '') {
    statusLine.textContent = text;
    statusLine.className = 'status-line' + (cls ? ' ' + cls : '');
}

function setPhaseClass(name) {
    panel.classList.remove('phase-wait', 'phase-show', 'phase-input', 'phase-result', 'win', 'shake');
    if (name) panel.classList.add(name);
}

function renderTime() {
    const s = fmtClock(elapsed);
    if (timeValEl.textContent !== s) timeValEl.textContent = s;
}
function renderBest() { bestValEl.textContent = bestRec.level > 0 ? `Niv. ${bestRec.level}` : '—'; }

function renderLevelInfo() {
    levelValueEl.textContent = level;
    const n = wordsFor(level);
    roundInfoEl.textContent = `Niveau ${level} · ${n} mots · ${timeFor(level) / 1000} s par mot`;
}

function renderProgress() {
    if (phase === 'input' || phase === 'success' || phase === 'fail') {
        progressLabelEl.textContent = 'Trouvés';
        progressValEl.textContent = `${found.size}/${TARGETS}`;
    } else {
        progressLabelEl.textContent = 'Mot';
        progressValEl.textContent = (phase === 'show' || phase === 'countdown')
            ? `${Math.min(wordIdx + (phase === 'show' ? 1 : 0), list.length)}/${list.length}` : `0/${list.length}`;
    }
}

function buildDots() {
    dotsEl.innerHTML = '';
    list.forEach(() => { const d = document.createElement('span'); d.className = 'dot'; dotsEl.appendChild(d); });
}
function renderDots() {
    [...dotsEl.children].forEach((d, i) => {
        d.className = 'dot' + (i < wordIdx ? ' done' : '') + (i === wordIdx && showStep === 'word' ? ' now' : '');
    });
}

function buildChoices() {
    choicesEl.innerHTML = '';
    cards = choices.map((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.dataset.i = i;
        b.innerHTML = `<span class="choice-key">${i + 1}</span>`;
        b.appendChild(document.createTextNode(c.w));
        choicesEl.appendChild(b);
        return b;
    });
}

choicesEl.addEventListener('click', (e) => {
    const c = e.target.closest('.choice');
    if (c) onChoice(Number(c.dataset.i));
});

function startLevel() {
    prepareLevel();
    renderLevelInfo();
    buildDots();
    choicesEl.innerHTML = '';
    wordDisplay.classList.remove('on');
    wordDisplay.textContent = '';
    timerFill.style.width = '0%';
    wordIdx = 0;
    showStep = 'word';
    phase = 'countdown';
    phaseLeft = COUNTDOWN_MS;
    setPhaseClass('phase-wait');
    renderDots();
    renderProgress();
    setStatus('Prépare-toi…');
}

function showWord() {
    showStep = 'word';
    wordDisplay.textContent = list[wordIdx];
    wordDisplay.classList.add('on');
    renderDots();
    renderProgress();
}

function startShow() {
    phase = 'show';
    setPhaseClass('phase-show');
    setStatus('Mémorise !', 'show');
    wordIdx = 0;
    phaseLeft = wordTime;
    showWord();
}

// Avance dans l'affichage des mots : mot → intervalle vide → mot suivant → … → réponse
function advanceShow() {
    if (showStep === 'word') {
        wordDisplay.classList.remove('on');
        if (wordIdx >= list.length - 1) { endShow(); return; }
        showStep = 'gap';
        timerFill.style.width = '0%';
        phaseLeft += GAP_MS;                // reporte le petit dépassement : pas de dérive
        renderDots();
    } else {
        wordIdx++;
        phaseLeft += wordTime;
        showWord();
    }
}

function endShow() {
    phase = 'input';
    wordDisplay.textContent = '';
    timerFill.style.width = '0%';
    buildChoices();
    setPhaseClass('phase-input');
    renderProgress();
    setStatus(`Quels sont les ${TARGETS} mots de la liste ?`);
}

function onChoice(i) {
    if (state !== 'running' || phase !== 'input' || found.has(i)) return;
    if (choices[i].target) {
        found.add(i);
        cards[i].classList.add('ok');
        renderProgress();
        if (found.size === TARGETS) levelWon();
    } else {
        wrong(i);
    }
}

function levelWon() {
    levelsWon++;
    phase = 'success';
    phaseLeft = SUCCESS_MS;
    panel.classList.add('win');
    setStatus(`Niveau ${level} réussi !`, 'good');
}

function nextLevel() {
    level++;
    levelValueEl.classList.add('level-up');
    setTimeout(() => levelValueEl.classList.remove('level-up'), 600);
    startLevel();
}

function wrong(i) {
    ended = true;                      // fige le chronomètre : durée = démarrage → erreur
    cards[i].classList.add('bad');
    choices.forEach((c, k) => { if (c.target && !found.has(k)) cards[k].classList.add('missed'); });
    phase = 'fail';
    phaseLeft = FAIL_MS;
    panel.classList.remove('phase-input');
    panel.classList.add('phase-result', 'shake');
    setTimeout(() => panel.classList.remove('shake'), 400);
    renderProgress();
    setStatus('Raté !', 'bad');
}

// dt en ms ; appelé seulement quand state === 'running' (donc jamais en pause)
function update(dt) {
    if (!ended) { elapsed += dt; renderTime(); }
    phaseLeft -= dt;
    if (phase === 'show' && showStep === 'word') {
        timerFill.style.width = `${Math.max(0, Math.min(100, (phaseLeft / wordTime) * 100))}%`;
    }
    if (phaseLeft > 0) return;
    switch (phase) {
        case 'countdown': startShow(); break;
        case 'show': advanceShow(); break;
        case 'success': nextLevel(); break;
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
    level = 1; levelsWon = 0;
    usedWords = new Set();
    elapsed = 0; ended = false;
    pendingRecord = null;
    setWorldStatus('');
    panel.classList.remove('veiled');
    timeValEl.textContent = '0:00';
    renderBest();
    state = 'running';
    lastTime = performance.now();
    startLevel();
}

function pauseGame(openPauseModal = true) {
    if (state !== 'running' || phase === 'fail') return;
    state = 'paused';
    panel.classList.add('veiled');     // masque le mot affiché : pas de triche via la pause
    if (openPauseModal) pauseOverlay.classList.add('open');
}

function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    panel.classList.remove('veiled');
    state = 'running';
    lastTime = performance.now();      // le temps passé en pause n'est jamais compté
}

function setWorldStatus(text) { $('goWorldStatus').textContent = text; }

function finishGame() {
    if (state !== 'running') return;
    state = 'over';
    phase = 'idle';

    const result = { level, duration: Math.round(elapsed), levelsWon };

    // Record personnel (local, indépendant du réseau). Il faut au moins un niveau réussi.
    const eligible = levelsWon > 0;
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
    else if (/^[1-4]$/.test(k) && state === 'running' && phase === 'input') onChoice(Number(k) - 1);
});

// Aucun défilement / zoom de page pendant les gestes tactiles
['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

// ─────────────────────────────────────────────
// 7. RECORDS EN LIGNE (cache local "mindplay-words" + Firebase)
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

document.querySelectorAll('.js-start-words').forEach(el => { el.textContent = START_WORDS; });

renderBest();
renderLevelInfo();
renderProgress();
setStatus('Prépare-toi…');
lastTime = performance.now();
requestAnimationFrame(loop);
const onlineReady = initOnline();   // en arrière-plan, sans bloquer le jeu
