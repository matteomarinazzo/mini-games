/**
 * Mindplay : Différences – game.js
 *
 * Une scène SVG (formes et dessins générés ici, aucune image externe) s'affiche brièvement,
 * puis est remplacée par une seconde scène presque identique. Le joueur clique sur chaque
 * différence. Niveau N = N différences, 2 manches par niveau (1 s puis 0,5 s par différence).
 * Aucune vie : un clic hors différence termine la partie. Le niveau atteint et la durée
 * totale (hors pause) alimentent les records.
 *
 * Organisation du fichier :
 *   1. CONFIG            – tous les paramètres à ajuster
 *   2. ÉTAT / DOM / CACHE
 *   3. RECORDS (outils)  – comparaison niveau puis durée, formats
 *   4. FORMES / SCÈNES   – dessins SVG, génération des deux scènes
 *   5. DÉROULEMENT       – manches, phases, clics
 *   6. FLUX DE JEU       – démarrage, pause, fin de partie
 *   7. RECORDS EN LIGNE  – cache local "mindplay-differences" + record mondial Firebase
 *   8. BOUTONS / INIT
 *
 * Hors ligne : tout le jeu et les records personnels fonctionnent sans réseau.
 * Firebase / network.js ne sont chargés qu'en arrière-plan et ne bloquent jamais une partie.
 *
 * Toutes les durées sont en millisecondes et n'avancent que pendant que la partie tourne :
 * la pause suspend tout (chronomètre, observation). Aucun setTimeout ne pilote le jeu.
 */

// ─────────────────────────────────────────────
// 1. CONFIG  (valeurs à ajuster)
// ─────────────────────────────────────────────

// -- Manches / niveaux ---------------------------------------------
const ROUNDS_PER_LEVEL = 2;                 // manches par niveau
const SHOW_MS_PER_DIFF = [2000, 1000];       // observation par différence : manche 1, manche 2
const MAX_DIFFS = 36;                       // plafond de différences par scène (la grille ne peut pas en espacer davantage)

// -- Scène --------------------------------------------------------
const OBJ_SIZE = 0.68;       // taille d'un objet, en fraction de la case
const EMPTY_RATE = 0.18;     // part de cases vides (hors différences)
const SMALL_SCALE = 0.5;     // taille réduite d'un objet « plus petit »
const HIT_RADIUS = 0.8;      // zone cliquable d'une différence, en fraction de la case (centre ±)
const RING_RADIUS = 0.52;    // rayon du cercle de marquage, en fraction de la case

// -- Rythme -------------------------------------------------------
const COUNTDOWN_MS = 1200;   // petite pause avant l'observation
const SUCCESS_MS = 800;      // affichage après une manche réussie
const FAIL_MS = 2200;        // révélation des différences restantes avant l'écran de fin

// -- Records ------------------------------------------------------
const CACHE_KEY = 'mindplay-differences';   // clé du cache local (record perso, record mondial, message)
const FB_GAME = 'mindplay_differences';     // nœud Firebase : leaderboards/mindplay_differences/score
const FB_KEY = 'score';                     // { value: niveau, duration: ms, message, timestamp }

// ─────────────────────────────────────────────
// 2. ÉTAT / DOM / CACHE
// ─────────────────────────────────────────────
let state = 'ready';     // ready | running | paused | over
let phase = 'idle';      // idle | countdown | preview | play | success | fail
let phaseLeft = 0;       // temps restant dans la phase (ms)
let phaseTotal = 1;      // durée totale de la phase (ms), pour la barre d'observation
let level = 1, round = 1, roundsWon = 0;
let scene = null;        // { cs, A, B, diffs: [{ cx, cy, found }] }
let marksG = null;       // groupe SVG recevant les marques
let remaining = 0;       // différences restantes
let elapsed = 0;         // durée de la partie hors pause (ms)
let ended = false;       // vrai dès l'erreur : le chronomètre est figé
let lastTime = 0;
let runId = 0;           // identifie la partie en cours (ignore les réponses réseau tardives)
let pendingRecord = null;
let lastTenths = -1;

const ZERO = { level: 0, duration: 0 };
let cache = loadCache();
let bestRec = normRecord(cache.best);
let worldBest = normRecord(cache.worldBest);

// Modules en ligne (Firebase / réseau) : chargés sans bloquer le jeu
let fb = null, net = null;

const $ = (id) => document.getElementById(id);
const sceneEl = $('scene'), expoTimer = $('expoTimer'), expoFill = $('expoFill');
const levelValueEl = $('levelValue'), roundInfoEl = $('roundInfo'), statusLine = $('statusLine');
const bestValEl = $('bestVal'), remainValEl = $('remainVal'), timeValEl = $('timeVal');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay');
const pauseOverlay = $('pauseOverlay'), gameoverOverlay = $('gameoverOverlay');
const recordsOverlay = $('recordsOverlay');
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
const fmtSec = (ms) => String(ms / 1000).replace('.', ',');

// ─────────────────────────────────────────────
// 4. FORMES / SCÈNES
// ─────────────────────────────────────────────
// Chaque dessin vit dans un repère 24×24 ; {C} reçoit la couleur principale.
// Formes simples et dessins composés (maison, arbre, soleil, fleur, poisson).
const SHAPES = [
    '<circle cx="12" cy="12" r="9" fill="{C}"/>',
    '<rect x="4" y="4" width="16" height="16" rx="3" fill="{C}"/>',
    '<path d="M12 3 22 20H2Z" fill="{C}"/>',
    '<path d="M12 2 22 12 12 22 2 12Z" fill="{C}"/>',
    '<path d="M12 2 15 9 22.5 9.6 16.8 14.5 18.6 22 12 18 5.4 22 7.2 14.5 1.5 9.6 9 9Z" fill="{C}"/>',
    '<path d="M12 21C5 15 2 11 2 7.5A5 5 0 0 1 12 6 5 5 0 0 1 22 7.5C22 11 19 15 12 21Z" fill="{C}"/>',
    '<path d="M12 2 20.7 7V17L12 22 3.3 17V7Z" fill="{C}"/>',
    '<path d="M9 2H15V9H22V15H15V22H9V15H2V9H9Z" fill="{C}"/>',
    '<path d="M20 14.5A9 9 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z" fill="{C}"/>',
    '<path d="M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0C19 10 12 2 12 2Z" fill="{C}"/>',
    '<path d="M13 2 4 14H11L10 22 20 9H13Z" fill="{C}"/>',
    '<path d="M2 17A10 10 0 0 1 22 17Z" fill="{C}"/>',
    '<path d="M4 20C4 9 11 4 20 4 20 13 15 20 4 20Z" fill="{C}"/>',
    // maison
    '<rect x="4.5" y="11" width="15" height="10" fill="#dbe7f5"/><path d="M2 12 12 3l10 9Z" fill="{C}"/><rect x="10" y="15" width="4" height="6" fill="#35557a"/>',
    // arbre
    '<rect x="10.5" y="13" width="3" height="9" fill="#9a6b3f"/><circle cx="12" cy="9" r="7" fill="{C}"/>',
    // soleil
    '<path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" fill="none" stroke="{C}" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="5" fill="{C}"/>',
    // fleur
    '<circle cx="12" cy="6" r="4" fill="{C}"/><circle cx="18" cy="12" r="4" fill="{C}"/><circle cx="12" cy="18" r="4" fill="{C}"/><circle cx="6" cy="12" r="4" fill="{C}"/><circle cx="12" cy="12" r="3.2" fill="#7a4a2a"/>',
    // poisson
    '<ellipse cx="10" cy="12" rx="8" ry="5.5" fill="{C}"/><path d="M16 12 23 6V18Z" fill="{C}"/><circle cx="6.5" cy="10.5" r="1.2" fill="#0b1b33"/>'
];
// Couleurs rangées par teinte : un changement de couleur saute toujours d'au moins 3 crans (très visible)
const COLORS = ['#ff5470', '#ff9f5a', '#ffd84d', '#3fe08f', '#5bc8f5', '#4d6bff', '#b784ff', '#ff8fd0'];
const DIFF_TYPES = ['color', 'shape', 'size', 'missing', 'added'];

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {          // Fisher-Yates
        const j = rnd(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

const diffCount = () => Math.min(level, MAX_DIFFS);
const showMs = () => diffCount() * (SHOW_MS_PER_DIFF[round - 1] ?? SHOW_MS_PER_DIFF[SHOW_MS_PER_DIFF.length - 1]);

// Taille de la grille d'objets (paire) : les différences n'occupent qu'une case sur deux
// dans chaque direction, donc deux différences sont toujours séparées d'au moins 2 cases.
function gridSizeFor(n) { return n <= 4 ? 4 : n <= 9 ? 6 : n <= 16 ? 8 : n <= 25 ? 10 : 12; }

function farColor(old) {
    const n = COLORS.length;
    return pick(COLORS.map((_, i) => i).filter(i => { const d = Math.abs(i - old); return Math.min(d, n - d) >= 3; }));
}

/** Génère les deux scènes (A : à mémoriser, B : à fouiller) et la liste des différences. */
function buildScene(n) {
    const G = gridSizeFor(n), cs = 100 / G;
    const offR = rnd(2), offC = rnd(2);
    const slots = [];
    for (let r = offR; r < G; r += 2) for (let c = offC; c < G; c += 2) slots.push(r * G + c);
    const chosen = shuffle(slots).slice(0, n);
    const types = [];
    while (types.length < n) types.push(...shuffle(DIFF_TYPES.slice()));   // types variés, tirés en rotation
    const typeAt = new Map(chosen.map((idx, i) => [idx, types[i]]));

    const A = [], B = [], diffs = [];
    for (let i = 0; i < G * G; i++) {
        const type = typeAt.get(i);
        const r = Math.floor(i / G), c = i % G;
        const jit = () => (Math.random() - .5) * .2 * cs;
        const base = { x: (c + .5) * cs + jit(), y: (r + .5) * cs + jit(), shape: rnd(SHAPES.length), color: rnd(COLORS.length), rot: rnd(5) * 10 - 20, scale: 1 };
        const filled = type ? true : Math.random() > EMPTY_RATE;
        let a = filled ? base : null;
        let b = a ? { ...a } : null;
        if (type === 'added') { a = null; b = { ...base }; }
        else if (type === 'missing') { b = null; }
        else if (type === 'color') { b.color = farColor(base.color); }
        else if (type === 'shape') { b.shape = (base.shape + 1 + rnd(SHAPES.length - 1)) % SHAPES.length; }
        else if (type === 'size') { if (Math.random() < .5) a.scale = SMALL_SCALE; else b.scale = SMALL_SCALE; }
        A.push(a); B.push(b);
        if (type) diffs.push({ cx: base.x, cy: base.y, found: false });
    }
    return { cs, A, B, diffs };
}

function objSvg(o, cs) {
    const k = cs * OBJ_SIZE * o.scale / 24;
    return `<g transform="translate(${o.x.toFixed(2)} ${o.y.toFixed(2)}) rotate(${o.rot}) scale(${k.toFixed(3)}) translate(-12 -12)" stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-linejoin="round">${SHAPES[o.shape].replace(/\{C\}/g, COLORS[o.color])}</g>`;
}

function renderScene(objs) {
    sceneEl.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">${objs.map(o => o ? objSvg(o, scene.cs) : '').join('')}<g class="marks"></g></svg>`;
    marksG = sceneEl.querySelector('.marks');
}
function renderBlank() {
    sceneEl.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g class="marks"></g></svg>';
    marksG = sceneEl.querySelector('.marks');
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
function renderRemain() { remainValEl.textContent = remaining; }

function renderInfo() {
    const n = diffCount();
    levelValueEl.textContent = level;
    roundInfoEl.textContent = `Manche ${round} / ${ROUNDS_PER_LEVEL} · ${n} différence${n > 1 ? 's' : ''} · ${fmtSec(showMs())} s`;
}

function startRound() {
    scene = buildScene(diffCount());
    remaining = scene.diffs.length;
    sceneEl.className = '';
    renderBlank();
    expoTimer.classList.remove('on');
    renderInfo();
    renderRemain();
    phase = 'countdown';
    phaseLeft = COUNTDOWN_MS;
    setStatus('Prépare-toi…');
}

function startPreview() {
    renderScene(scene.A);
    phase = 'preview';
    phaseTotal = phaseLeft = showMs();
    lastTenths = -1;
    expoFill.style.width = '100%';
    expoTimer.classList.add('on');
}

function updatePreviewStatus() {
    expoFill.style.width = `${Math.max(0, phaseLeft / phaseTotal * 100).toFixed(1)}%`;
    const t = Math.ceil(phaseLeft / 100);
    if (t === lastTenths) return;
    lastTenths = t;
    setStatus(`Mémorise ! ${t % 10 === 0 ? t / 10 : (t / 10).toFixed(1).replace('.', ',')} s`, 'show');
}

function endPreview() {
    renderScene(scene.B);
    expoTimer.classList.remove('on');
    sceneEl.classList.add('input', 'swap');
    phase = 'play';
    setStatus(`Trouve ${remaining > 1 ? `les ${remaining} différences` : 'la différence'} !`);
}

// Clic / toucher sur la seconde scène (coordonnées ramenées au repère 0–100)
sceneEl.addEventListener('pointerdown', (e) => {
    if (state !== 'running' || phase !== 'play') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const svg = e.target.closest('svg');
    if (!svg) return;
    e.preventDefault();
    const rc = svg.getBoundingClientRect();
    onTap((e.clientX - rc.left) / rc.width * 100, (e.clientY - rc.top) / rc.height * 100);
});

function addMark(cls, cx, cy, r) {
    marksG.insertAdjacentHTML('beforeend', `<circle class="${cls}" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}"/>`);
}

function onTap(x, y) {
    const R = HIT_RADIUS * scene.cs;
    let hit = null, best = Infinity;
    for (const d of scene.diffs) {
        const dist = Math.hypot(d.cx - x, d.cy - y);
        if (dist <= R && dist < best) { hit = d; best = dist; }
    }
    if (!hit) { roundLost(x, y); return; }           // aucune différence ici : fin de partie
    if (hit.found) return;                           // déjà trouvée : ni comptée deux fois, ni pénalisée
    hit.found = true;
    remaining--;
    renderRemain();
    addMark('mk-ok', hit.cx, hit.cy, RING_RADIUS * scene.cs);
    if (remaining === 0) { roundWon(); return; }
    setStatus(`Bien vu ! Encore ${remaining}`, 'good');
}

function roundWon() {
    roundsWon++;
    phase = 'success';
    phaseLeft = SUCCESS_MS;
    sceneEl.classList.remove('input');
    sceneEl.classList.add('win');
    setStatus(round === ROUNDS_PER_LEVEL ? `Niveau ${level} réussi !` : 'Manche réussie !', 'good');
}

// Après une manche réussie : manche suivante, ou niveau suivant (+1 différence)
function afterSuccess() {
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

// Mauvais clic : on fige le chronomètre, on marque l'erreur et on révèle les différences restantes
function roundLost(x, y) {
    phase = 'fail';
    ended = true;
    phaseLeft = FAIL_MS;
    sceneEl.classList.remove('input', 'swap');
    sceneEl.classList.add('shake');
    scene.diffs.forEach(d => { if (!d.found) addMark('mk-missed', d.cx, d.cy, RING_RADIUS * scene.cs); });
    addMark('mk-bad', x, y, 3.2);
    marksG.insertAdjacentHTML('beforeend', `<path class="mk-cross" d="M${x - 1.4} ${y - 1.4}L${x + 1.4} ${y + 1.4}M${x + 1.4} ${y - 1.4}L${x - 1.4} ${y + 1.4}"/>`);
    setStatus('Raté ! Ce n\u2019est pas une différence', 'bad');
}

// dt en ms ; appelé seulement quand state === 'running' (donc jamais en pause)
function update(dt) {
    if (!ended) { elapsed += dt; renderTime(); }
    if (phase === 'play' || phase === 'idle') return;   // on attend le joueur
    phaseLeft -= dt;
    if (phase === 'preview' && phaseLeft > 0) updatePreviewStatus();
    if (phaseLeft > 0) return;
    switch (phase) {
        case 'countdown': startPreview(); break;
        case 'preview': endPreview(); break;
        case 'success': afterSuccess(); break;
        case 'fail': finishGame(); break;
        default: break;
    }
}

// ─────────────────────────────────────────────
// 6. FLUX DE JEU
// ─────────────────────────────────────────────
function closeOverlays() {
    [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay]
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
    sceneEl.classList.remove('veiled');
    timeValEl.textContent = '0:00';
    renderBest();
    state = 'running';
    lastTime = performance.now();
    startRound();
}

function pauseGame(openPauseModal = true) {
    if (state !== 'running' || phase === 'fail') return;
    state = 'paused';
    sceneEl.classList.add('veiled');      // masque la scène : pas de triche via la pause
    if (openPauseModal) pauseOverlay.classList.add('open');
}

function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    sceneEl.classList.remove('veiled');
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
    $('goTitle').textContent = isPersonalBest ? 'Nouveau record !' : 'Partie terminée';
    $('goLevel').textContent = `${result.level} (manche ${round})`;
    $('goDuration').textContent = fmtDuration(result.duration);
    $('goBest').textContent = fmtRecord(bestRec);
    gameoverOverlay.classList.add('open');

    // Le record mondial est vérifié en arrière-plan : l'écran de fin n'attend jamais le réseau
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
window.addEventListener('blur', () => pauseGame());

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
// 7. RECORDS EN LIGNE (cache local "mindplay-differences" + Firebase)
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

document.querySelectorAll('.js-show-1').forEach(el => { el.textContent = fmtSec(SHOW_MS_PER_DIFF[0]); });
document.querySelectorAll('.js-show-2').forEach(el => { el.textContent = fmtSec(SHOW_MS_PER_DIFF[1]); });

renderBlank();
renderBest();
renderInfo();
renderRemain();
setStatus('Prépare-toi…');
lastTime = performance.now();
requestAnimationFrame(loop);
const onlineReady = initOnline();   // en arrière-plan, sans bloquer le jeu
