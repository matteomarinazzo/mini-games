/**
 * Mindplay : Formes – game.js
 *
 * Une composition de formes géométriques (contours seuls, sans couleur ; SVG généré ici, aucune image externe)
 * s'affiche brièvement sur un plateau quadrillé, puis disparaît. Les formes de la composition se chevauchent au hasard
 * (croisées, l'une dans l'autre…) et forment une seule grande figure. Le joueur la reconstitue en glissant les formes de la palette directement
 * sur le plateau (puis déplacer, redimensionner, pivoter) et valide. Niveau N = N + 2 formes, 2 manches par niveau (1 s puis 0,5 s par forme).
 * 3 vies par manche : une reconstitution hors tolérance coûte une vie (nouvelle composition, même manche) ;
 * à la dernière vie la partie se termine. Le niveau atteint et la durée totale alimentent les records.
 *
 * La logique pure (formes, difficulté, génération, tolérances, score, outils de records) vit dans
 * shapes-core.js (testée dans Node par shapes-tests.js). Ce fichier ne contient que le DOM et le déroulement.
 *
 * Organisation du fichier :
 *   1. CONFIG            – rythme
 *   2. ÉTAT / DOM / CACHE
 *   3. PLATEAU SVG       – grille de repères, dessin des formes, poignées de sélection
 *   4. INTERACTIONS      – souris / tactile (déplacer, poignées, pincement), glisser-déposer depuis la palette, boutons, clavier
 *   5. DÉROULEMENT       – manches, phases, validation
 *   6. FLUX DE JEU       – démarrage, pause, fin de partie
 *   7. RECORDS EN LIGNE  – cache local "mindplay-shapes" + record mondial Firebase
 *   8. BOUTONS / INIT
 *
 * Hors ligne : tout le jeu et les records personnels fonctionnent sans réseau.
 * Firebase / network.js ne sont chargés qu'en arrière-plan et ne bloquent jamais une partie.
 *
 * Toutes les durées sont en millisecondes et n'avancent que pendant que la partie tourne :
 * la pause suspend tout (chronomètre, observation, résultat). Aucun setTimeout ne pilote le jeu.
 */
import {
    BOARD, GRID_STEP, ROUNDS_PER_LEVEL, SHOW_MS_PER_SHAPE, START_LIVES, MAX_GUESS_SHAPES, SIZE_MIN, SIZE_MAX,
    TYPES, typeById, normAngle, radiusOf, shapeCount, showMs, baseSize, generateComposition,
    evaluate, roundScore, ZERO, normRecord, parseRemote, isBetter, fmtDuration, fmtClock, fmtRecord, fmtSec
} from './shapes-core.js';

// ─────────────────────────────────────────────
// 1. CONFIG  (valeurs à ajuster)
// ─────────────────────────────────────────────
const COUNTDOWN_MS = 1200;       // petite pause avant l'observation
const RESULT_OK_MS = 1500;       // affichage de la comparaison après une réussite
const RESULT_FAIL_MS = 2800;     // affichage de la comparaison après une erreur (le temps de comprendre)
const ROT_STEP = 15;             // degrés par appui sur les boutons de rotation
const SIZE_STEP = 1.1;           // facteur par appui sur les boutons de taille
const NUDGE = 1;                 // déplacement au clavier (flèches), ×4 avec Maj
const DRAG_START_PX = 6;         // en dessous de ce déplacement (px), un appui sur la palette pose la forme au centre
const TOUCH_LIFT = 10;           // tactile : la forme est tenue au-dessus du doigt (unités du plateau), pour rester visible

// -- Records ------------------------------------------------------
const CACHE_KEY = 'mindplay-shapes';    // clé du cache local (record perso, record mondial, message)
const FB_GAME = 'mindplay_shapes';      // nœud Firebase : leaderboards/mindplay_shapes/score
const FB_KEY = 'score';                 // { value: niveau, duration: ms, message, timestamp }

// ─────────────────────────────────────────────
// 2. ÉTAT / DOM / CACHE
// ─────────────────────────────────────────────
let state = 'ready';     // ready | running | paused | over
let phase = 'idle';      // idle | countdown | preview | build | result | interlude
let phaseLeft = 0;       // temps restant dans la phase (ms)
let phaseTotal = 1;      // durée totale de la phase (ms), pour la barre d'observation
let level = 1, round = 1, roundsWon = 0, lives = START_LIVES, score = 0;
let target = [];         // composition à reconstituer
let guess = [];          // formes posées par le joueur
let sel = null;          // forme sélectionnée (objet de `guess`)
let resultOk = false;    // issue de la validation en cours
let elapsed = 0;         // durée de la partie hors pause (ms)
let ended = false;       // vrai dès la dernière vie perdue : le chronomètre est figé
let lastTime = 0;
let runId = 0;           // identifie la partie en cours (ignore les réponses réseau tardives)
let pendingRecord = null;
let lastTenths = -1;

const ZERO_REC = ZERO;
let cache = loadCache();
let bestRec = normRecord(cache.best);
let worldBest = normRecord(cache.worldBest);

// Modules en ligne (Firebase / réseau) : chargés sans bloquer le jeu
let fb = null, net = null;

const $ = (id) => document.getElementById(id);
const sceneEl = $('scene'), dock = $('dock'), palette = $('palette');
const expoTimer = $('expoTimer'), expoFill = $('expoFill');
const livesEl = $('lives'), hudInfo = $('hudInfo'), scoreHud = $('scoreHud');
const roundInfoEl = $('roundInfo'), statusLine = $('statusLine'), levelValueEl = $('shapesVal');
const bestValEl = $('bestVal'), timeValEl = $('timeVal');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay');
const pauseOverlay = $('pauseOverlay'), gameoverOverlay = $('gameoverOverlay');
const recordsOverlay = $('recordsOverlay'), progressOverlay = $('progressOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');
const toolBtns = { rotL: $('rotLBtn'), rotR: $('rotRBtn'), smaller: $('smallerBtn'), bigger: $('biggerBtn'), del: $('deleteBtn') };
const validateBtn = $('validateBtn');

function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}
function saveCache(patch) {
    cache = { ...cache, ...patch };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* stockage indisponible */ }
}

const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ─────────────────────────────────────────────
// 3. PLATEAU SVG
// ─────────────────────────────────────────────
// Grille de repères : une ligne tous les GRID_STEP unités, axes centraux un peu plus marqués
let gridD = '';
for (let v = GRID_STEP; v < BOARD; v += GRID_STEP) if (v !== BOARD / 2) gridD += `M${v} 0V${BOARD}M0 ${v}H${BOARD}`;
sceneEl.innerHTML = `<svg id="board" viewBox="0 0 ${BOARD} ${BOARD}" aria-hidden="true" focusable="false">
<rect class="frame" x="0.5" y="0.5" width="${BOARD - 1}" height="${BOARD - 1}" rx="3"/>
<path class="grid" d="${gridD}"/><path class="grid grid-mid" d="M${BOARD / 2} 0V${BOARD}M0 ${BOARD / 2}H${BOARD}"/>
<g id="layer"></g><g id="ghost"></g><g id="marks"></g><g id="ui"></g></svg>`;
const svg = $('board'), layer = $('layer'), ghostLayer = $('ghost'), marks = $('marks'), ui = $('ui');

const tf = (s) => `translate(${s.x.toFixed(2)} ${s.y.toFixed(2)}) rotate(${s.rot.toFixed(1)}) scale(${s.size.toFixed(2)})`;
const shapeG = (s, i, cls = '') =>
    `<g class="shp ${cls}" data-i="${i}" transform="${tf(s)}">${typeById(s.type).svg}</g>`;

/** Dessine une liste de formes dans la couche principale (cls : classe facultative par forme). */
function renderLayer(list, cls = []) {
    layer.innerHTML = list.map((s, i) => shapeG(s, i, cls[i] || '')).join('');
}

const canEdit = () => state === 'running' && phase === 'build';

/** Poignées de la forme sélectionnée : anneau, bouton de rotation (au-dessus), bouton de taille (en bas à droite). */
function renderUi() {
    if (!sel || !canEdit()) { ui.innerHTML = ''; return; }
    const R = radiusOf(sel) + 1.5, a = sel.rot * Math.PI / 180;
    const pos = (ang, d) => [clamp(sel.x + Math.cos(ang) * d, 4, BOARD - 4), clamp(sel.y + Math.sin(ang) * d, 4, BOARD - 4)];
    const [rx, ry] = pos(a - Math.PI / 2, R + 7), [sx, sy] = pos(a + Math.PI / 4, R);
    const [lx, ly] = pos(a - Math.PI / 2, R);
    ui.innerHTML = `<circle class="sel-ring" cx="${sel.x.toFixed(2)}" cy="${sel.y.toFixed(2)}" r="${R.toFixed(2)}"/>
<line class="sel-line" x1="${lx.toFixed(2)}" y1="${ly.toFixed(2)}" x2="${rx.toFixed(2)}" y2="${ry.toFixed(2)}"/>
<circle class="knob" cx="${rx.toFixed(2)}" cy="${ry.toFixed(2)}" r="3"/>
<circle class="hit h-rot" cx="${rx.toFixed(2)}" cy="${ry.toFixed(2)}" r="7.5"/>
<rect class="knob" x="${(sx - 2.6).toFixed(2)}" y="${(sy - 2.6).toFixed(2)}" width="5.2" height="5.2" rx="1"/>
<circle class="hit h-size" cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="7.5"/>`;
}

/** Applique l'état de `sel` au dessin sans tout reconstruire (appelé à chaque mouvement). */
function applySel() {
    const el = layer.querySelector(`[data-i="${guess.indexOf(sel)}"]`);
    if (el && sel) el.setAttribute('transform', tf(sel));
    renderUi();
}

function select(s) {
    sel = s;
    layer.querySelectorAll('.shp').forEach(el => el.classList.toggle('selected', guess[+el.dataset.i] === sel));
    renderUi();
    updateTools();
}

function updateTools() {
    const on = canEdit() && !!sel;
    Object.values(toolBtns).forEach(b => { b.disabled = !on; });
    validateBtn.disabled = !canEdit();
}

function updateBuildStatus() {
    const n = target.length;
    setStatus(`À toi ! ${guess.length} / ${n} forme${n > 1 ? 's' : ''} posée${guess.length > 1 ? 's' : ''}`);
}

// ─────────────────────────────────────────────
// 4. INTERACTIONS (souris + tactile, sans bibliothèque)
// ─────────────────────────────────────────────
// Poser une forme : on appuie sur une forme de la palette et on la glisse directement à l'endroit voulu du plateau
// (relâcher hors du plateau annule ; un simple appui la pose au centre).
// Un seul geste actif à la fois sur le plateau :
//   move  – glisser le corps d'une forme            size  – glisser la poignée carrée (taille)
//   rot   – glisser le rond de rotation              pinch – deux doigts n'importe où (taille + rotation de la forme choisie)
// Les boutons de la barre d'outils et les flèches du clavier offrent les mêmes actions sans glisser.
const pointers = new Map();     // pointerId → { x, y } en unités du plateau
let gesture = null;

function boardPt(e) {
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * BOARD, y: (e.clientY - r.top) / r.height * BOARD };
}
const angDeg = (cx, cy, p) => Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI;

svg.addEventListener('pointerdown', (e) => {
    if (!canEdit()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    const p = boardPt(e);
    pointers.set(e.pointerId, p);

    if (pointers.size === 2 && sel) {                       // pincement : taille + rotation
        const [a, b] = [...pointers.values()];
        gesture = { mode: 'pinch', d0: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), a0: angDeg(a.x, a.y, b), size0: sel.size, rot0: sel.rot };
        return;
    }
    if (pointers.size > 1) return;

    const t = e.target;
    if (sel && t.closest('.h-rot')) {
        gesture = { mode: 'rot', a0: angDeg(sel.x, sel.y, p), rot0: sel.rot };
    } else if (sel && t.closest('.h-size')) {
        gesture = { mode: 'size', d0: Math.max(1, Math.hypot(p.x - sel.x, p.y - sel.y)), size0: sel.size };
    } else {
        const sh = t.closest('.shp');
        if (sh) {
            const s = guess[+sh.dataset.i];
            select(s);
            gesture = { mode: 'move', dx: s.x - p.x, dy: s.y - p.y };
        } else {
            gesture = { mode: 'tap', x0: p.x, y0: p.y, moved: false };   // toucher le vide : désélectionne au relâchement
        }
    }
});

svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = boardPt(e);
    pointers.set(e.pointerId, p);
    if (gesture && gesture.mode === 'tap' && Math.hypot(p.x - gesture.x0, p.y - gesture.y0) > 2) gesture.moved = true;
    if (!gesture || !sel || !canEdit()) return;
    if (gesture.mode === 'move') {
        sel.x = clamp(p.x + gesture.dx, 0, BOARD);
        sel.y = clamp(p.y + gesture.dy, 0, BOARD);
    } else if (gesture.mode === 'size') {
        sel.size = clamp(gesture.size0 * Math.hypot(p.x - sel.x, p.y - sel.y) / gesture.d0, SIZE_MIN, SIZE_MAX);
    } else if (gesture.mode === 'rot') {
        sel.rot = normAngle(gesture.rot0 + angDeg(sel.x, sel.y, p) - gesture.a0);
    } else if (gesture.mode === 'pinch' && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        sel.size = clamp(gesture.size0 * Math.hypot(b.x - a.x, b.y - a.y) / gesture.d0, SIZE_MIN, SIZE_MAX);
        sel.rot = normAngle(gesture.rot0 + angDeg(a.x, a.y, b) - gesture.a0);
    }
    applySel();
});

function endPointer(e) {
    if (!pointers.delete(e.pointerId)) return;
    // Toucher bref sur le vide (sans glisser, sans second doigt) : désélection. Fait ici plutôt qu'à l'appui,
    // pour qu'un pincement qui commence à côté de la forme garde la sélection.
    if (pointers.size === 0 && gesture && gesture.mode === 'tap' && !gesture.moved && e.type === 'pointerup') select(null);
    if (pointers.size === 0 || (gesture && gesture.mode === 'pinch')) gesture = null;   // après un pincement, pas de glissement parasite
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('lostpointercapture', endPointer);

function resetGestures() { pointers.clear(); gesture = null; cancelDrag(); }

// Ajoute une forme et la sélectionne : à la position `at` (glisser-déposer) ou, sans position, au centre (décalée si la place est prise)
function addShape(typeId, at = null) {
    if (!canEdit() || guess.length >= MAX_GUESS_SHAPES) return;
    let x = 50, y = 50;
    if (at) { x = clamp(at.x, 0, BOARD); y = clamp(at.y, 0, BOARD); }
    else for (let k = 0; k < 12 && guess.some(g => Math.hypot(g.x - x, g.y - y) < 5); k++) { x += 7; y += 7; if (x > 80) { x = 30; y = 30 + k; } }
    const s = { type: typeId, x, y, size: baseSize(target.length), rot: 0 };
    guess.push(s);
    renderLayer(guess);
    select(s);
    updateBuildStatus();
}

// Glisser-déposer depuis la palette : une forme « fantôme » suit le pointeur au-dessus du plateau
let drag = null;     // { type, id, x0, y0, moved, pos } ; pos = position sur le plateau, ou null si le pointeur est en dehors

function dragPos(e) {
    const p = boardPt(e);
    return { x: p.x, y: p.y - (e.pointerType === 'touch' ? TOUCH_LIFT : 0) };
}

function cancelDrag() {
    drag = null;
    ghostLayer.innerHTML = '';
}

function startDrag(e, btn) {
    if (!canEdit() || guess.length >= MAX_GUESS_SHAPES || drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    drag = { type: btn.dataset.type, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, pos: null };
    select(null);
}

function moveDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!canEdit()) { cancelDrag(); return; }
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > DRAG_START_PX) drag.moved = true;
    if (!drag.moved) return;
    const p = dragPos(e);
    drag.pos = p.x >= 0 && p.x <= BOARD && p.y >= 0 && p.y <= BOARD ? p : null;
    ghostLayer.innerHTML = drag.pos
        ? shapeG({ type: drag.type, x: drag.pos.x, y: drag.pos.y, size: baseSize(target.length), rot: 0 }, 0, 'ghost') : '';
}

function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    cancelDrag();
    if (e.type !== 'pointerup' || !canEdit()) return;
    if (!d.moved) addShape(d.type);                 // simple appui : forme posée au centre
    else if (d.pos) addShape(d.type, d.pos);        // relâchée sur le plateau : posée là où on l'a lâchée
}

palette.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.pal-btn');
    if (b) startDrag(e, b);
});
window.addEventListener('pointermove', moveDrag);
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

function transformSel(fn) {
    if (!canEdit() || !sel) return;
    fn(sel);
    applySel();
}
function deleteSel() {
    if (!canEdit() || !sel) return;
    guess.splice(guess.indexOf(sel), 1);
    renderLayer(guess);
    select(null);
    updateBuildStatus();
}

palette.addEventListener('click', (e) => {          // clavier (Entrée / Espace) : la souris et le tactile passent par le glisser-déposer
    const b = e.target.closest('.pal-btn');
    if (b && e.detail === 0) addShape(b.dataset.type);
});
toolBtns.rotL.addEventListener('click', () => transformSel(s => { s.rot = normAngle(s.rot - ROT_STEP); }));
toolBtns.rotR.addEventListener('click', () => transformSel(s => { s.rot = normAngle(s.rot + ROT_STEP); }));
toolBtns.smaller.addEventListener('click', () => transformSel(s => { s.size = clamp(s.size / SIZE_STEP, SIZE_MIN, SIZE_MAX); }));
toolBtns.bigger.addEventListener('click', () => transformSel(s => { s.size = clamp(s.size * SIZE_STEP, SIZE_MIN, SIZE_MAX); }));
toolBtns.del.addEventListener('click', deleteSel);
validateBtn.addEventListener('click', validate);

// Palette construite une fois (icônes SVG = les mêmes contours que le plateau)
palette.innerHTML = TYPES.map(t =>
    `<button type="button" class="pal-btn" data-type="${t.id}" title="${t.name}" aria-label="Ajouter : ${t.name}">` +
    `<svg viewBox="-.6 -.6 1.2 1.2" aria-hidden="true" focusable="false">${t.svg}</svg></button>`).join('');

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
function renderScore() { scoreHud.textContent = `${score} pts`; }

function renderInfo() {
    const n = shapeCount(level);
    hudInfo.textContent = `Niveau ${level} · Manche ${round}/${ROUNDS_PER_LEVEL}`;
    levelValueEl.textContent = n;
    roundInfoEl.textContent = `${n} formes · observation ${fmtSec(showMs(level, round))} s`;
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
        h.classList.toggle('lost', i >= lives);
        if (justLost && i === lives) { h.classList.remove('hit'); void h.getBoundingClientRect(); h.classList.add('hit'); }
    });
    livesEl.setAttribute('role', 'img');
    livesEl.setAttribute('aria-label', `${lives} vie${lives > 1 ? 's' : ''} restante${lives > 1 ? 's' : ''}`);
}

function startRound() {
    target = generateComposition(level);
    guess = [];
    resetGestures();
    select(null);
    layer.innerHTML = ''; marks.innerHTML = ''; ui.innerHTML = '';
    sceneEl.classList.remove('input', 'win', 'shake');
    dock.classList.add('off');
    expoTimer.classList.remove('on');
    renderInfo();
    renderLives();
    updateTools();
    phase = 'countdown';
    phaseLeft = COUNTDOWN_MS;
    setStatus('Prépare-toi…');
}

function startPreview() {
    renderLayer(target);
    phase = 'preview';
    phaseTotal = phaseLeft = showMs(level, round);
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

// La composition disparaît : le joueur reconstitue, sans limite de temps
function endPreview() {
    layer.innerHTML = '';
    expoTimer.classList.remove('on');
    phase = 'build';
    sceneEl.classList.add('input');
    dock.classList.remove('off');
    updateTools();
    updateBuildStatus();
}

function validate() {
    if (!canEdit()) return;
    if (guess.length === 0) { setStatus('Ajoute d\u2019abord des formes !', 'bad'); return; }
    const res = evaluate(target, guess);
    resetGestures();
    select(null);
    sceneEl.classList.remove('input');
    dock.classList.add('off');

    // Comparaison : cibles en pointillés (vert = bien placée, jaune = ratée), formes posées entourées de vert / rouge
    const gCls = guess.map((_, gi) => { const p = res.pairs.find(q => q.gi === gi); return p && p.ok ? 'g-ok' : 'g-bad'; });
    renderLayer(guess, gCls);
    marks.innerHTML = target.map((t, ti) => {
        const p = res.pairs.find(q => q.ti === ti);
        return `<g class="tg ${p && p.ok ? 'tg-ok' : 'tg-miss'}" transform="${tf(t)}">${typeById(t.type).svg}</g>`;
    }).join('');

    resultOk = res.ok;
    phase = 'result';
    if (res.ok) {
        const pts = roundScore(target.length, res.quality);
        score += pts;
        roundsWon++;
        renderScore();
        phaseLeft = RESULT_OK_MS;
        sceneEl.classList.add('win');
        setStatus(`Bravo ! +${pts} points`, 'good');
    } else {
        lives--;
        if (lives <= 0) ended = true;                       // fige le chronomètre à la dernière erreur
        renderLives(true);
        phaseLeft = RESULT_FAIL_MS;
        sceneEl.classList.add('shake');
        const n = target.length;
        roundInfoEl.textContent = res.countOk ? 'Positions, tailles ou rotations trop éloignées'
            : `Il fallait ${n} forme${n > 1 ? 's' : ''}, tu en as posé ${guess.length}`;
        setStatus(lives > 0 ? `Raté ! ${lives} vie${lives > 1 ? 's' : ''} restante${lives > 1 ? 's' : ''}` : 'Raté ! Plus de vie', 'bad');
    }
}

// Fin de l'affichage du résultat : manche suivante, nouvel essai (même manche) ou fin de partie
function afterResult() {
    if (resultOk) { afterSuccess(); return; }
    if (lives > 0) { startRound(); return; }                // nouvelle composition de même difficulté, vies conservées
    finishGame();
}

// Après une manche réussie : manche suivante, ou nouveau niveau (modale de progression)
function afterSuccess() {
    lives = START_LIVES;
    if (round < ROUNDS_PER_LEVEL) {
        round++;
        startRound();
        return;
    }
    round = 1;
    level++;
    levelValueEl.classList.add('level-up');
    setTimeout(() => levelValueEl.classList.remove('level-up'), 600);
    $('progressNext').textContent = `${shapeCount(level)} formes · observation ${fmtSec(showMs(level, 1))} s`;
    phase = 'interlude';                  // le chronomètre est suspendu pendant la modale
    progressOverlay.classList.add('open');
    $('continueBtn').focus();
}

function continueAfterProgress() {
    if (state !== 'running' || phase !== 'interlude') return;
    progressOverlay.classList.remove('open');
    startRound();
}

// dt en ms ; appelé seulement quand state === 'running' (donc jamais en pause)
function update(dt) {
    if (phase === 'interlude') return;    // modale de progression : tout est figé
    if (!ended) { elapsed += dt; renderTime(); }
    if (phase === 'build' || phase === 'idle') return;      // on attend le joueur
    phaseLeft -= dt;
    if (phase === 'preview' && phaseLeft > 0) updatePreviewStatus();
    if (phaseLeft > 0) return;
    switch (phase) {
        case 'countdown': startPreview(); break;
        case 'preview': endPreview(); break;
        case 'result': afterResult(); break;
        default: break;
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
    level = 1; round = 1; roundsWon = 0; score = 0; lives = START_LIVES;
    elapsed = 0; ended = false;
    pendingRecord = null;
    setWorldStatus('');
    sceneEl.classList.remove('veiled');
    timeValEl.textContent = '0:00';
    renderBest();
    renderScore();
    state = 'running';
    lastTime = performance.now();
    startRound();
}

function pauseGame(openPauseModal = true) {
    if (state !== 'running' || phase === 'interlude') return;
    state = 'paused';
    resetGestures();
    sceneEl.classList.add('veiled');      // masque le plateau : pas de triche via la pause
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
    $('goScore').textContent = score;
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
    else if (canEdit() && sel) {
        const step = (e.shiftKey ? 4 : 1) * NUDGE;
        const mv = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k];
        if (mv) { e.preventDefault(); transformSel(s => { s.x = clamp(s.x + mv[0], 0, BOARD); s.y = clamp(s.y + mv[1], 0, BOARD); }); }
        else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); }
    }
});

// Aucun défilement / zoom de page pendant les gestes tactiles
['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

// ─────────────────────────────────────────────
// 7. RECORDS EN LIGNE (cache local "mindplay-shapes" + Firebase)
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
            worldBest = { ...ZERO_REC };
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
document.querySelectorAll('.js-show-1').forEach(el => { el.textContent = fmtSec(SHOW_MS_PER_SHAPE[0]); });
document.querySelectorAll('.js-show-2').forEach(el => { el.textContent = fmtSec(SHOW_MS_PER_SHAPE[1]); });
document.querySelectorAll('.js-start-shapes').forEach(el => { el.textContent = shapeCount(1); });

buildLives();
renderLives();
renderBest();
renderScore();
renderInfo();
updateTools();
dock.classList.add('off');
setStatus('Prépare-toi…');
lastTime = performance.now();
requestAnimationFrame(loop);
const onlineReady = initOnline();   // en arrière-plan, sans bloquer le jeu
