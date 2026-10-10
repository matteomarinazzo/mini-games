/**
 * Mindplay : Paires – game.js
 *
 * Jeu de mémoire : retrouver les paires de cartes identiques (symboles SVG générés ici,
 * aucune image externe). Chaque taille de grille se joue en 2 manches (aperçu de 1 s puis
 * 0,5 s par paire). 3 vies par manche : une paire différente coûte une vie. La partie se
 * termine à la 3e erreur ; le niveau atteint (= index de la grille) et la durée totale
 * alimentent les records.
 *
 * Organisation du fichier :
 *   1. CONFIG            – tous les paramètres à ajuster
 *   2. ÉTAT / DOM / CACHE
 *   3. RECORDS (outils)  – comparaison niveau puis durée, formats
 *   4. SYMBOLES / GRILLES
 *   5. DÉROULEMENT       – manches, phases, cartes, vies
 *   6. FLUX DE JEU       – démarrage, pause, fin de partie
 *   7. RECORDS EN LIGNE  – cache local "mindplay-pairs" + record mondial Firebase
 *   8. BOUTONS / INIT
 *
 * Hors ligne : tout le jeu et les records personnels fonctionnent sans réseau.
 * Firebase / network.js ne sont chargés qu'en arrière-plan et ne bloquent jamais une partie.
 *
 * Toutes les durées sont en millisecondes et n'avancent que pendant que la partie tourne :
 * la pause suspend tout (chronomètre, aperçu, retournements). Aucun setTimeout ne pilote le jeu.
 */

// ─────────────────────────────────────────────
// 1. CONFIG  (valeurs à ajuster)
// ─────────────────────────────────────────────

// -- Grilles [lignes, colonnes] : une grille = un niveau (2 manches) --
const GRID_SIZES = [
    [4, 4], [4, 5], [4, 6], [5, 6], [6, 6],
    [6, 7], [6, 8], [7, 8], [8, 8], [8, 9],
    [8, 10], [9, 10], [10, 10], [10, 11], [10, 12],
    [11, 12], [12, 12]
];
// Au-delà de la liste : on grandit alternativement d'une colonne puis d'une ligne
// (nombre de cases toujours pair), tant qu'il reste assez de symboles distincts.

// -- Manches / vies -----------------------------------------------
const ROUNDS_PER_LEVEL = 2;               // manches par taille de grille
const PREVIEW_MS_PER_PAIR = [1000, 750];  // aperçu par paire : manche 1, manche 2
const START_LIVES = 3;                    // vies au début de chaque manche

// -- Rythme -------------------------------------------------------
const COUNTDOWN_MS = 900;          // petite pause avant l'aperçu
const FLIP_MS = 450;               // durée du retournement face cachée après l'aperçu
const RESHUFFLE_AFTER_PREVIEW = false; // true : les cartes sont réellement mélangées après l'aperçu
const SHUFFLE_MS = 650;            // durée de l'animation de mélange (si activé)
const MATCH_MS = 450;              // paire trouvée : temps avant disparition
const MISMATCH_MS = 800;           // paire fausse : temps avant retournement
const SUCCESS_MS = 800;            // affichage après une manche réussie
const FAIL_MS = 1800;              // affichage des cartes restantes avant l'écran de défaite

// -- Records ------------------------------------------------------
const CACHE_KEY = 'mindplay-pairs';    // clé du cache local (record perso, record mondial, message)
const FB_GAME = 'mindplay_pairs';      // nœud Firebase : leaderboards/mindplay_pairs/score
const FB_KEY = 'score';                // { value: niveau, duration: ms, message, timestamp }

// ─────────────────────────────────────────────
// 2. ÉTAT / DOM / CACHE
// ─────────────────────────────────────────────
let state = 'ready';     // ready | running | paused | over
let phase = 'idle';      // idle | countdown | preview | flipdown | shuffle | play | resolve | success | interlude | fail
let phaseLeft = 0;       // temps restant dans la phase (ms)
let level = 1, round = 1, roundsWon = 0, lives = START_LIVES;
let rows = 4, cols = 4;
let deck = [];           // [{ sym, up, found, el }]
let firstPick = -1;      // index de la première carte retournée
let pending = null;      // { a, b, match } paire en cours de résolution
let remaining = 0;       // paires restantes
let elapsed = 0;         // durée de la partie hors pause (ms)
let ended = false;       // vrai dès la dernière erreur : le chronomètre est figé
let lastTime = 0;
let runId = 0;           // identifie la partie en cours (ignore les réponses réseau tardives)
let pendingRecord = null;
let lastSecShown = -1;

const ZERO = { level: 0, duration: 0 };
let cache = loadCache();
let bestRec = normRecord(cache.best);
let worldBest = normRecord(cache.worldBest);

// Modules en ligne (Firebase / réseau) : chargés sans bloquer le jeu
let fb = null, net = null;

const $ = (id) => document.getElementById(id);
const grid = $('grid'), livesEl = $('lives'), hudInfo = $('hudInfo');
const levelValueEl = $('levelValue'), roundInfoEl = $('roundInfo'), statusLine = $('statusLine');
const bestValEl = $('bestVal'), timeValEl = $('timeVal');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay');
const pauseOverlay = $('pauseOverlay'), gameoverOverlay = $('gameoverOverlay');
const recordsOverlay = $('recordsOverlay'), progressOverlay = $('progressOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

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
// 4. SYMBOLES / GRILLES
// ─────────────────────────────────────────────
// 16 formes × 8 couleurs × 2 styles (plein / contour) = 256 symboles distincts.
// Chaque forme est dessinée dans un repère 24×24 ; {A} reçoit les attributs de peinture.
const SHAPES = [
    { name: 'cercle', svg: '<circle cx="12" cy="12" r="9" {A}/>' },
    { name: 'carré', svg: '<rect x="4" y="4" width="16" height="16" rx="3" {A}/>' },
    { name: 'triangle', svg: '<path d="M12 3 22 20H2Z" {A}/>' },
    { name: 'losange', svg: '<path d="M12 2 22 12 12 22 2 12Z" {A}/>' },
    { name: 'étoile', svg: '<path d="M12 2 15 9 22.5 9.6 16.8 14.5 18.6 22 12 18 5.4 22 7.2 14.5 1.5 9.6 9 9Z" {A}/>' },
    { name: 'cœur', svg: '<path d="M12 21C5 15 2 11 2 7.5A5 5 0 0 1 12 6 5 5 0 0 1 22 7.5C22 11 19 15 12 21Z" {A}/>' },
    { name: 'hexagone', svg: '<path d="M12 2 20.7 7V17L12 22 3.3 17V7Z" {A}/>' },
    { name: 'croix', svg: '<path d="M9 2H15V9H22V15H15V22H9V15H2V9H9Z" {A}/>' },
    { name: 'lune', svg: '<path d="M20 14.5A9 9 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z" {A}/>' },
    { name: 'goutte', svg: '<path d="M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0C19 10 12 2 12 2Z" {A}/>' },
    { name: 'éclair', svg: '<path d="M13 2 4 14H11L10 22 20 9H13Z" {A}/>' },
    { name: 'pentagone', svg: '<path d="M12 2 22 9.5 18.2 21H5.8L2 9.5Z" {A}/>' },
    { name: 'anneau', svg: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20ZM12 7a5 5 0 1 1 0 10 5 5 0 1 1 0-10Z" {A}/>' },
    { name: 'croisillon', svg: '<path d="M12 9.5 17.5 4 20 6.5 14.5 12 20 17.5 17.5 20 12 14.5 6.5 20 4 17.5 9.5 12 4 6.5 6.5 4Z" {A}/>' },
    { name: 'demi-disque', svg: '<path d="M2 17A10 10 0 0 1 22 17Z" {A}/>' },
    { name: 'feuille', svg: '<path d="M4 20C4 9 11 4 20 4 20 13 15 20 4 20Z" {A}/>' }
];
const COLORS = [
    { name: 'jaune', hex: '#ffd84d' }, { name: 'bleu', hex: '#5bc8f5' },
    { name: 'vert', hex: '#3fe08f' }, { name: 'rose', hex: '#ff8fa3' },
    { name: 'violet', hex: '#b79cff' }, { name: 'orange', hex: '#ff9f5a' },
    { name: 'lime', hex: '#9be15d' }, { name: 'blanc', hex: '#e8eefc' }
];
const STYLES = ['plein', 'contour'];
const SYMBOL_COUNT = SHAPES.length * COLORS.length * STYLES.length;   // 256 paires maximum
const MAX_PAIRS = SYMBOL_COUNT;

/** Symbole n° i (0 ≤ i < SYMBOL_COUNT). Dans toute fenêtre de 16 indices consécutifs, les formes sont toutes différentes. */
function symbolAt(i) {
    const perStyle = SHAPES.length * COLORS.length;
    const style = Math.floor(i / perStyle) % STYLES.length;
    const j = i % perStyle;
    const shape = j % SHAPES.length;
    const q = Math.floor(j / SHAPES.length);
    const color = (shape + q) % COLORS.length;
    return { shape, color, style, id: i };
}

function symbolSvg(sym) {
    const c = COLORS[sym.color].hex;
    const attrs = sym.style === 0
        ? `fill="${c}" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-linejoin="round"`
        : `fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round"`;
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${SHAPES[sym.shape].svg.replace('{A}', attrs)}</svg>`;
}
const symbolLabel = (s) => `${SHAPES[s.shape].name} ${COLORS[s.color].name}${s.style ? ' (contour)' : ''}`;

/** Grille du niveau `lvl` (1-based). La liste GRID_SIZES est prolongée automatiquement. */
const gridCache = GRID_SIZES.map(g => g.slice());
function gridForLevel(lvl) {
    while (gridCache.length < lvl) {
        let [r, c] = gridCache[gridCache.length - 1];
        if (r === c) c++; else r++;
        if ((r * c) % 2 !== 0) c++;                        // nombre de cases pair
        if ((r * c) / 2 > MAX_PAIRS) {                     // plus assez de symboles : on garde la plus grande grille
            gridCache.push(gridCache[gridCache.length - 1].slice());
        } else {
            gridCache.push([r, c]);
        }
    }
    return gridCache[lvl - 1];
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {          // Fisher-Yates
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Choisit `pairs` symboles distincts (fenêtre à départ aléatoire dans la liste ordonnée). */
function pickSymbols(pairs) {
    const start = Math.floor(Math.random() * SYMBOL_COUNT);
    return Array.from({ length: pairs }, (_, k) => symbolAt((start + k) % SYMBOL_COUNT));
}

// ─────────────────────────────────────────────
// 5. DÉROULEMENT D'UNE MANCHE
// ─────────────────────────────────────────────
function setStatus(text, cls = '') {
    statusLine.textContent = text;
    statusLine.className = 'status-line' + (cls ? ' ' + cls : '');
}

function renderTime() {
    const s = fmtClock(elapsed);
    if (timeValEl.textContent !== s) timeValEl.textContent = s;
}
function renderBest() { bestValEl.textContent = bestRec.level > 0 ? `Niv. ${bestRec.level}` : '—'; }

const previewMs = () => (rows * cols / 2) * (PREVIEW_MS_PER_PAIR[round - 1] ?? PREVIEW_MS_PER_PAIR[PREVIEW_MS_PER_PAIR.length - 1]);

function renderInfo() {
    levelValueEl.textContent = level;
    hudInfo.textContent = `Grille ${rows} × ${cols} · Manche ${round}/${ROUNDS_PER_LEVEL}`;
    roundInfoEl.textContent = `${rows * cols / 2} paires · aperçu ${previewMs() / 1000} s`;
}

// Vies : 3 cœurs, ceux perdus sont estompés
function buildLives() {
    livesEl.innerHTML = '';
    for (let i = 0; i < START_LIVES; i++) {
        livesEl.insertAdjacentHTML('beforeend',
            '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C5 15 2 11 2 7.5A5 5 0 0 1 12 6 5 5 0 0 1 22 7.5C22 11 19 15 12 21Z"/></svg>');
    }
}
function renderLives(justLost = false) {
    [...livesEl.children].forEach((h, i) => {
        const lost = i >= lives;
        h.classList.toggle('lost', lost);
        if (justLost && i === lives) { h.classList.remove('hit'); void h.getBoundingClientRect(); h.classList.add('hit'); }
    });
    livesEl.setAttribute('role', 'img');
    livesEl.setAttribute('aria-label', `${lives} vie${lives > 1 ? 's' : ''} restante${lives > 1 ? 's' : ''}`);
}

// Construction du plateau : paires mélangées, une carte = un bouton accessible
function buildBoard() {
    const pairs = (rows * cols) / 2;
    const syms = pickSymbols(pairs);
    const faces = shuffle([...syms, ...syms]);
    grid.style.setProperty('--rows', rows);
    grid.style.setProperty('--cols', cols);
    grid.style.setProperty('--wfrac', Math.min(1, cols / rows));
    grid.className = '';
    grid.innerHTML = '';
    deck = faces.map((sym, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'card';
        b.dataset.i = i;
        b.innerHTML = `<span class="card-inner"><span class="card-back"></span><span class="card-face">${symbolSvg(sym)}</span></span>`;
        grid.appendChild(b);
        const card = { sym, up: false, found: false, el: b };
        updateAria(card, i);
        return card;
    });
    remaining = pairs;
    firstPick = -1;
    pending = null;
}

function updateAria(card, i) {
    const pos = `ligne ${Math.floor(i / cols) + 1}, colonne ${(i % cols) + 1}`;
    card.el.setAttribute('aria-label', card.found ? `Carte ${pos} : paire trouvée`
        : card.up ? `Carte ${pos} : ${symbolLabel(card.sym)}` : `Carte ${pos} : face cachée`);
    card.el.disabled = card.found;
}

function setUp(i, up) {
    const c = deck[i];
    c.up = up;
    c.el.classList.toggle('shown', up);
    updateAria(c, i);
}

grid.addEventListener('click', (e) => {
    const c = e.target.closest('.card');
    if (c) onCard(Number(c.dataset.i));
});

// Navigation au clavier : flèches entre les cartes encore en jeu
grid.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    const cur = e.target.closest('.card');
    if (!d || !cur) return;
    e.preventDefault();
    let r = Math.floor(cur.dataset.i / cols), c = cur.dataset.i % cols;
    for (; ;) {
        r += d[0]; c += d[1];
        if (r < 0 || c < 0 || r >= rows || c >= cols) return;
        const t = deck[r * cols + c];
        if (!t.found) { t.el.focus(); return; }
    }
});

function startRound() {
    [rows, cols] = gridForLevel(level);
    lives = START_LIVES;
    buildBoard();
    buildLives();
    renderLives();
    renderInfo();
    phase = 'countdown';
    phaseLeft = COUNTDOWN_MS;
    setStatus('Prépare-toi…');
}

function startPreview() {
    deck.forEach((_, i) => setUp(i, true));
    phase = 'preview';
    phaseLeft = previewMs();
    lastSecShown = -1;
}

function updatePreviewStatus() {
    const s = Math.ceil(phaseLeft / 1000);
    if (s !== lastSecShown) { lastSecShown = s; setStatus(`Mémorise ! ${s} s`, 'show'); }
}

function endPreview() {
    deck.forEach((_, i) => setUp(i, false));
    phase = 'flipdown';
    phaseLeft = FLIP_MS;
    setStatus('On retourne les cartes…');
}

function afterFlipdown() {
    if (RESHUFFLE_AFTER_PREVIEW) {
        // Mélange réel : les faces changent de place pendant que les cartes sont cachées
        const faces = shuffle(deck.map(c => c.sym));
        deck.forEach((c, i) => {
            c.sym = faces[i];
            c.el.querySelector('.card-face').innerHTML = symbolSvg(c.sym);
            c.el.style.setProperty('--d', `${Math.random() * 0.12}s`);
            c.el.style.setProperty('--dx', `${(Math.random() * 14 - 7).toFixed(1)}px`);
            c.el.style.setProperty('--dy', `${(Math.random() * 10 - 5).toFixed(1)}px`);
        });
        grid.classList.add('shuffling');
        phase = 'shuffle';
        phaseLeft = SHUFFLE_MS;
        setStatus('On mélange…');
    } else {
        startPlay();
    }
}

function startPlay() {
    grid.classList.remove('shuffling');
    grid.classList.add('input');
    phase = 'play';
    setStatus('À toi ! Trouve les paires');
}

// Clic / touche sur une carte : ignoré hors phase de jeu, en pause, ou sur une carte déjà visible / trouvée
function onCard(i) {
    if (state !== 'running' || phase !== 'play') return;
    const c = deck[i];
    if (!c || c.up || c.found) return;
    setUp(i, true);
    if (firstPick === -1) { firstPick = i; return; }

    const a = firstPick;
    firstPick = -1;
    phase = 'resolve';
    if (deck[a].sym.id === c.sym.id) {
        pending = { a, b: i, match: true };
        phaseLeft = MATCH_MS;
        deck[a].el.classList.add('match'); c.el.classList.add('match');
        setStatus('Paire trouvée !', 'good');
    } else {
        pending = { a, b: i, match: false };
        phaseLeft = MISMATCH_MS;
        lives--;
        if (lives <= 0) ended = true;                 // fige le chronomètre à la dernière erreur
        renderLives(true);
        deck[a].el.classList.add('wrong'); c.el.classList.add('wrong');
        setStatus('Raté !', 'bad');
    }
}

// Fin du délai de résolution : disparition de la paire, ou retournement + éventuelle défaite
function resolvePair() {
    const { a, b, match } = pending;
    pending = null;
    if (match) {
        [a, b].forEach(k => {
            const c = deck[k];
            c.found = true;
            c.el.classList.remove('match');
            c.el.classList.add('found');
            updateAria(c, k);
        });
        remaining--;
        if (remaining === 0) { roundWon(); return; }
        phase = 'play';
        setStatus('À toi ! Trouve les paires');
    } else {
        [a, b].forEach(k => { deck[k].el.classList.remove('wrong'); setUp(k, false); });
        if (lives <= 0) { roundLost(); return; }
        phase = 'play';
        setStatus('À toi ! Trouve les paires');
    }
}

function roundWon() {
    roundsWon++;
    phase = 'success';
    phaseLeft = SUCCESS_MS;
    grid.classList.remove('input');
    grid.classList.add('win');
    setStatus(round === ROUNDS_PER_LEVEL ? `Grille ${rows} × ${cols} réussie !` : 'Manche réussie !', 'good');
}

// Après une manche réussie : manche suivante, ou nouvelle grille (modale de progression)
function afterSuccess() {
    if (round < ROUNDS_PER_LEVEL) {
        round++;
        startRound();
        return;
    }
    round = 1;
    level++;
    levelValueEl.classList.add('level-up');
    setTimeout(() => levelValueEl.classList.remove('level-up'), 600);
    const [r, c] = gridForLevel(level);
    $('progressNext').textContent = `${r} × ${c} · ${r * c / 2} paires`;
    phase = 'interlude';                  // le chronomètre est suspendu pendant la modale
    progressOverlay.classList.add('open');
    $('continueBtn').focus();
}

function continueAfterProgress() {
    if (state !== 'running' || phase !== 'interlude') return;
    progressOverlay.classList.remove('open');
    startRound();
}

// Dernière vie perdue : on révèle les cartes restantes puis on termine la partie
function roundLost() {
    phase = 'fail';
    phaseLeft = FAIL_MS;
    grid.classList.remove('input');
    deck.forEach((c, i) => {
        if (!c.found) { c.el.classList.add('missed'); setUp(i, true); }
    });
    setStatus('Manche perdue !', 'bad');
}

// dt en ms ; appelé seulement quand state === 'running' (donc jamais en pause)
function update(dt) {
    if (phase === 'interlude') return;    // modale de progression : tout est figé
    if (!ended) { elapsed += dt; renderTime(); }
    phaseLeft -= dt;
    if (phase === 'preview' && phaseLeft > 0) updatePreviewStatus();
    if (phaseLeft > 0) return;
    switch (phase) {
        case 'countdown': startPreview(); break;
        case 'preview': endPreview(); break;
        case 'flipdown': afterFlipdown(); break;
        case 'shuffle': startPlay(); break;
        case 'resolve': resolvePair(); break;
        case 'success': afterSuccess(); break;
        case 'fail': finishGame(); break;
        default: break;                  // 'play' : on attend le joueur
    }
}

// ─────────────────────────────────────────────
// 6. FLUX DE JEU
// ─────────────────────────────────────────────
function closeOverlays() {
    [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay, progressOverlay]
        .forEach(o => o.classList.remove('open'));
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
    if (state !== 'running' || phase === 'fail' || phase === 'interlude') return;
    state = 'paused';
    grid.classList.add('veiled');         // cache toutes les faces : pas de triche via la pause
    if (openPauseModal) pauseOverlay.classList.add('open');
}

function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    grid.classList.remove('veiled');
    state = 'running';
    lastTime = performance.now();         // le temps passé en pause n'est jamais compté
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
    $('goTitle').textContent = isPersonalBest ? 'Nouveau record !' : 'Manche perdue';
    $('goLevel').textContent = `${result.level} (${rows} × ${cols})`;
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
// 7. RECORDS EN LIGNE (cache local "mindplay-pairs" + Firebase)
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
$('continueBtn').addEventListener('click', continueAfterProgress);

document.querySelectorAll('.js-lives').forEach(el => { el.textContent = START_LIVES; });
document.querySelectorAll('.js-preview-1').forEach(el => { el.textContent = PREVIEW_MS_PER_PAIR[0] / 1000; });
document.querySelectorAll('.js-preview-2').forEach(el => { el.textContent = PREVIEW_MS_PER_PAIR[1] / 1000; });

[rows, cols] = gridForLevel(1);
buildLives();
renderLives();
renderBest();
renderInfo();
setStatus('Prépare-toi…');
lastTime = performance.now();
requestAnimationFrame(loop);
const onlineReady = initOnline();   // en arrière-plan, sans bloquer le jeu
