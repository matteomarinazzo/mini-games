/**
 * Netwalk – game.js : grille DOM, gestes, courant, chrono, pause, abandon, fin de partie, sauvegarde, records.
 * On ne tourne que des formes fixes. Aucune rotation n'est refusée (sauf case verrouillée par le joueur).
 * Le jeu ne connaît jamais la solution : la victoire se juge sur la grille affichée (rules.js).
 */
import { generate } from './core/generate.js';
import { LEVELS, MIN_SIDE, MAX_SIDE, SHAPES, BASE, rotCW, rotCCW, serverIndex, neighborTable, analyze, validMask } from './core/rules.js';
import * as RC from './core/records.js';

const SAVE_KEY = 'netwalk-save', LEVEL_KEY = 'netwalk-level', ABANDON_CONFIRM_MS = 3000, LIGHT_MS = 700, LONG_MS = 450, MOVE_PX = 8, SLOW_GEN_MS = 5000;
const LEVEL_IDS = RC.LEVEL_IDS;

let state = 'menu';  // menu | gen | play | paused | won
let level = 'facile', recTab = 'facile', lastCfg = null, senseInv = false;
let g = null;        // { mode, w, h, wrap, N, si, shapes, masks, base, ang, locks, nbr, lit, stack, ms, turns, started, done }
let gest = null, abandonTimer = 0, resumeAfterInfo = false, pendingWorld = null, fb = null, net = null, shownTime = '', genToken = 0, sent = false;
let cells = [], rotors = [], prevLit = null, prevRed = null, foc = 0, memSave = null, genTimer = 0, navigating = false;

const $ = (id) => document.getElementById(id);
const boardEl = $('board'), playEl = $('play');
const startOverlay = $('startOverlay'), resumeGameBtn = $('resumeGameBtn'), pauseOverlay = $('pauseOverlay'), winOverlay = $('winOverlay'), genOverlay = $('genOverlay'), rulesOverlay = $('rulesOverlay');
const recordsOverlay = $('recordsOverlay'), recordPopup = $('recordMessagePopup'), abandonBtn = $('abandonBtn');
const recordMsgInput = $('recordMsgInput'), saveRecordBtn = $('saveRecordMsgBtn');
const store = RC.getStore();
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = RC.wait, fmt = RC.fmt;
const isRecordMode = (m, wrap) => LEVEL_IDS.includes(m) && !wrap;   // seuls Facile / Moyen / Difficile sans bords reliés comptent

// ─── Partie : mise en place (depuis une génération ou une sauvegarde) ───
function setup(o) {
    const N = o.w * o.h, masks = Uint8Array.from(o.masks), base = new Uint8Array(N), ang = new Int32Array(N), shapes = o.shapes.split('');
    for (let i = 0; i < N; i++) {
        if (shapes[i] === 'S') { base[i] = masks[i]; continue; }
        let m = base[i] = BASE[shapes[i]], k = 0;
        while (m !== masks[i] && k < 4) { m = rotCW(m); k++; }
        ang[i] = k * 90;
    }
    const locks = new Uint8Array(N); (o.locks || []).forEach((i) => { locks[i] = 1; });
    g = {
        mode: o.mode, w: o.w, h: o.h, wrap: o.wrap, N, si: serverIndex(o.w, o.h), shapes, masks, base, ang, locks,
        nbr: neighborTable(o.w, o.h, o.wrap), lit: new Uint8Array(N), red: new Uint8Array(N), stack: new Int16Array(N),
        ms: o.ms || 0, turns: o.turns || 0, started: !!o.started, done: false,
    };
    foc = g.si;
}
const modeName = () => (g.mode === 'perso' ? `Perso ${g.w}×${g.h}` : LEVELS[g.mode].label) + (g.wrap ? ' · Bords reliés' : '');

// ─── Sauvegarde (clé netwalk-save) : tailles, bords, formes, rotations actuelles, verrous, temps, tours. Jamais la solution. ───
function save() {
    if (!g || g.done || state === 'won' || state === 'gen') return;
    const locks = []; g.locks.forEach((v, i) => { if (v) locks.push(i); });
    const s = JSON.stringify({
        slug: RC.SLUG, mode: g.mode, w: g.w, h: g.h, wrap: g.wrap, shapes: g.shapes.join(''),
        m: Array.from(g.masks, (x) => x.toString(16)).join(''), locks, ms: Math.floor(g.ms), turns: g.turns, started: g.started, status: 'play',
    });
    memSave = s;
    try { store && store.setItem(SAVE_KEY, s); } catch { /* quota */ }
}
function clearSave() { memSave = null; try { store && store.removeItem(SAVE_KEY); } catch { /* ignore */ } }

function loadSaved() {
    try {
        let raw = null; try { raw = store && store.getItem(SAVE_KEY); } catch { /* ignore */ }
        const s = JSON.parse(raw || memSave);
        if (!s || s.slug !== RC.SLUG || s.status !== 'play') return null;
        const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
        if (!int(s.w, MIN_SIDE, MAX_SIDE) || !int(s.h, MIN_SIDE, MAX_SIDE) || typeof s.wrap !== 'boolean') return null;
        if (s.mode !== 'perso' && (!LEVELS[s.mode] || LEVELS[s.mode].w !== s.w || LEVELS[s.mode].h !== s.h)) return null;
        const N = s.w * s.h, si = serverIndex(s.w, s.h);
        if (typeof s.shapes !== 'string' || typeof s.m !== 'string' || s.shapes.length !== N || s.m.length !== N) return null;
        const masks = [];
        for (let i = 0; i < N; i++) {
            const sh = s.shapes[i], m = parseInt(s.m[i], 16);
            if (!SHAPES.includes(sh) || (sh === 'S') !== (i === si) || !validMask(sh, m)) return null;
            masks.push(m);
        }
        const locks = s.locks === undefined ? [] : s.locks;   // ancienne sauvegarde sans verrous : tout déverrouillé
        if (!Array.isArray(locks) || !locks.every((i) => int(i, 0, N - 1))) return null;
        if (!int(s.ms, 0, 1e10) || !int(s.turns, 0, 1e9)) return null;
        const nb = neighborTable(s.w, s.h, s.wrap), mk = Uint8Array.from(masks);
        const r = analyze(nb, mk, si, new Uint8Array(N), new Int16Array(N));
        if (solved(r, findLoops(nb, mk, si, new Uint8Array(N)), N)) return null;   // pas de partie gagnée
        return { mode: s.mode, w: s.w, h: s.h, wrap: s.wrap, shapes: s.shapes, masks, locks, ms: s.ms, turns: s.turns, started: !!s.started };
    } catch { return null; }
}

// ─── Court-circuit : une SEULE définition de « boucle », pour la couleur rouge ET pour la victoire ───
/**
 * Boucle = cycle de liaisons réelles dans la partie alimentée (atteinte depuis le serveur ; bords reliés compris).
 * Une case est rouge si elle est sur un cycle : on marque les extrémités de chaque liaison qui n'est pas un pont.
 * Un té qui se sépare vers deux branches, une branche qui sort d'une boucle, un câble éteint ou un fil dans le vide : jamais rouge.
 * Remplit `red` (1 = dans une boucle) et renvoie le nombre de cases rouges.
 */
let LS = null;
function findLoops(nbr, masks, si, red) {
    const N = masks.length;
    if (!LS || LS.N !== N) LS = { N, disc: new Int32Array(N), low: new Int32Array(N), par: new Int32Array(N), it: new Uint8Array(N), st: new Int32Array(N) };
    const { disc, low, par, it, st } = LS;
    red.fill(0); disc.fill(0); it.fill(0);
    let n = 0, t = 1, sp = 0;
    const mark = (a, b) => { if (!red[a]) { red[a] = 1; n++; } if (!red[b]) { red[b] = 1; n++; } };
    disc[si] = low[si] = t++; par[si] = -1; st[sp++] = si;
    while (sp) {
        const u = st[sp - 1];
        if (it[u] < 4) {
            const d = it[u]++;
            if (!((masks[u] >> d) & 1)) continue;
            const v = nbr[u * 4 + d];
            if (v < 0 || !((masks[v] >> ((d + 2) & 3)) & 1) || v === par[u]) continue;   // pas de liaison réelle, ou l'arête d'arrivée
            if (!disc[v]) { par[v] = u; disc[v] = low[v] = t++; st[sp++] = v; }
            else { if (disc[v] < low[u]) low[u] = disc[v]; if (disc[v] < disc[u]) mark(u, v); }   // un bras touche une case déjà alimentée
        } else {
            sp--;
            const p = par[u];
            if (p >= 0) { if (low[u] < low[p]) low[p] = low[u]; if (low[u] <= disc[p]) mark(u, p); }
        }
    }
    return n;
}
/** Victoire : tout allumé, aucun bras dans le vide, aucune case rouge. */
const solved = (r, loops, N) => r.count === N && r.dangling === 0 && loops === 0;

// ─── Rendu ───
const ARMS = { I: 'ns', L: 'ne', T: 'nes', E: 'n' };
const armsOf = (m) => ['n', 'e', 's', 'o'].filter((_, d) => (m >> d) & 1).join('');
function build() {
    boardEl.className = 'board';
    boardEl.style.setProperty('--w', g.w); boardEl.style.setProperty('--h', g.h);
    let h = '';
    for (let i = 0; i < g.N; i++) {
        const sh = g.shapes[i], arms = sh === 'S' ? armsOf(g.base[i]) : ARMS[sh];
        h += `<div class="c${sh === 'S' ? ' srv' : sh === 'E' ? ' pc' : ''}${g.locks[i] ? ' k' : ''}"><div class="r" style="transform:rotate(${g.ang[i]}deg)">`
            + [...arms].map((a) => `<b class="${a}"></b>`).join('') + (sh === 'S' || sh === 'E' ? '<i></i>' : '') + '</div></div>';
    }
    boardEl.innerHTML = h;
    cells = [...boardEl.children]; rotors = cells.map((c) => c.firstChild);
    prevLit = new Uint8Array(g.N); prevRed = new Uint8Array(g.N);
    setFocus(foc);
    refreshLit();
}
function setFocus(i) {
    if (cells[foc]) cells[foc].classList.remove('f');
    foc = i; if (cells[i]) cells[i].classList.add('f');
}
/** Recalcule le courant et les boucles depuis le serveur ; ne touche que les cases dont l'état change. */
function refreshLit() {
    const r = analyze(g.nbr, g.masks, g.si, g.lit, g.stack), loops = findLoops(g.nbr, g.masks, g.si, g.red);
    for (let i = 0; i < g.N; i++) {
        if (g.lit[i] !== prevLit[i]) { cells[i].classList.toggle('on', !!g.lit[i]); prevLit[i] = g.lit[i]; }
        if (g.red[i] !== prevRed[i]) { cells[i].classList.toggle('bad', !!g.red[i]); prevRed[i] = g.red[i]; }
    }
    return { r, loops };
}
function updateTime(force) {
    const s = fmt(g ? g.ms : 0);
    if (force || s !== shownTime) { shownTime = s; $('timeValue').textContent = s; }
}
const updateTurns = () => { const t = g ? g.turns : 0; $('turnsValue').textContent = `${t} tour${t > 1 ? 's' : ''}`; };
function refreshMode() {
    let m = g ? g.mode : level, wrap = g ? g.wrap : false;
    const rec = isRecordMode(m, wrap) ? RC.getBest(store, m) : null;
    $('modeLine').textContent = isRecordMode(m, wrap) ? `${LEVELS[m].label} · Record ${rec ? fmt(rec) : '–'}`
        : m === 'perso' ? (g ? modeName() : 'Personnalisé') : modeName();
    updateGrid();
}
/** Taille des cases : tient dans l'écran pour les 3 niveaux ; au moins 40 px au doigt en Personnaliser (la page défile). */
function layout() {
    if (!g) return;
    const cs = getComputedStyle(playEl), pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), pt = parseFloat(cs.paddingTop), pb = parseFloat(cs.paddingBottom);
    const aw = playEl.clientWidth - pl - pr, ah = playEl.clientHeight - pt - pb;
    const fit = Math.floor(Math.min(aw / g.w, ah / g.h)), cap = Math.max(40, Math.floor(640 / Math.max(g.w, g.h)));
    const size = g.mode === 'perso' ? Math.max(40, Math.min(fit, cap)) : Math.max(24, Math.min(fit, cap));
    boardEl.style.setProperty('--cs', `${size}px`);
    updateGrid();
}
function updateGrid() {
    const b = boardEl.getBoundingClientRect(), w = g ? g.w : LEVELS[level] ? LEVELS[level].w : 5;
    if (!b.width) return;
    const st = document.documentElement.style;
    st.setProperty('--gs', `${b.width / w}px`); st.setProperty('--gx', `${b.left}px`); st.setProperty('--gy', `${b.top}px`);
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', layout);
playEl.addEventListener('scroll', updateGrid, { passive: true });
if (window.ResizeObserver) new ResizeObserver(layout).observe(playEl);
function nope(i) {
    const el = cells[i]; if (!el) return;
    el.classList.remove('no'); void el.offsetWidth; el.classList.add('no');
    setTimeout(() => el.classList.remove('no'), 300);
}

// ─── Gestes sur la grille ───
function rotate(i, dir) {
    if (state !== 'play' || i < 0) return;
    if (g.locks[i]) { nope(i); return; }
    g.masks[i] = dir > 0 ? rotCW(g.masks[i]) : rotCCW(g.masks[i]);
    g.ang[i] += dir * 90; rotors[i].style.transform = `rotate(${g.ang[i]}deg)`;
    g.turns++; g.started = true; updateTurns();
    const f = refreshLit(); save();
    if (solved(f.r, f.loops, g.N)) win();
}
function toggleLock(i) {
    if (state !== 'play' || i < 0) return;
    g.locks[i] ^= 1; cells[i].classList.toggle('k', !!g.locks[i]); save();
}
function cellAt(e) {
    const b = boardEl.getBoundingClientRect(), c = Math.floor((e.clientX - b.left) / b.width * g.w), r = Math.floor((e.clientY - b.top) / b.height * g.h);
    return c < 0 || r < 0 || c >= g.w || r >= g.h ? -1 : r * g.w + c;
}
const stopGesture = () => { if (gest) { clearTimeout(gest.timer); gest = null; } };
boardEl.addEventListener('pointerdown', (e) => {
    if (state !== 'play' || gest) return;            // un seul doigt : on ignore le deuxième
    const mouse = e.pointerType === 'mouse';
    if (mouse && e.button === 2) { e.preventDefault(); const i = cellAt(e); if (i >= 0) { boardEl.classList.remove('kb'); setFocus(i); rotate(i, 1); } return; }
    if (mouse && e.button === 1) { e.preventDefault(); const i = cellAt(e); if (i >= 0) { boardEl.classList.remove('kb'); setFocus(i); toggleLock(i); } return; }   // clic molette : verrou, jamais de tour
    if (mouse && e.button !== 0) return;
    e.preventDefault();
    try { boardEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const i = cellAt(e);
    boardEl.classList.remove('kb'); if (i >= 0) setFocus(i);
    gest = { id: e.pointerId, i, x: e.clientX, y: e.clientY, sl: playEl.scrollLeft, st: playEl.scrollTop, moved: false, long: false, touch: !mouse };
    if (!mouse) gest.timer = setTimeout(() => { if (gest && !gest.moved) { gest.long = true; toggleLock(gest.i); } }, LONG_MS);   // appui long : doigt ou stylet seulement
});
boardEl.addEventListener('pointermove', (e) => {
    if (!gest || e.pointerId !== gest.id) return;
    const dx = e.clientX - gest.x, dy = e.clientY - gest.y;
    if (!gest.moved && Math.hypot(dx, dy) > MOVE_PX) { gest.moved = true; clearTimeout(gest.timer); }
    if (gest.moved && gest.touch) { playEl.scrollLeft = gest.sl - dx; playEl.scrollTop = gest.st - dy; }   // grande grille : on fait glisser la page
});
boardEl.addEventListener('pointerup', (e) => {
    if (!gest || e.pointerId !== gest.id) return;
    const o = gest; stopGesture();
    try { boardEl.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (o.moved || o.long) return;
    rotate(o.i, o.touch && senseInv ? 1 : -1);        // tap court : antihoraire, ou horaire si Sens est inversé
});
boardEl.addEventListener('pointercancel', (e) => { if (gest && e.pointerId === gest.id) stopGesture(); });
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
// Le clic molette ne doit pas lancer le défilement automatique du navigateur (seulement sur la grille)
['mousedown', 'mouseup', 'auxclick'].forEach((ev) => boardEl.addEventListener(ev, (e) => { if (e.button === 1) e.preventDefault(); }));
$('senseBtn').addEventListener('click', () => {
    senseInv = !senseInv;
    $('senseBtn').textContent = senseInv ? 'Sens ↻' : 'Sens ↺'; $('senseBtn').setAttribute('aria-pressed', senseInv);
});

// ─── Flux de jeu ───
const infoOpen = () => rulesOverlay.classList.contains('open') || recordsOverlay.classList.contains('open');
function closeOverlays() {
    [startOverlay, pauseOverlay, winOverlay, genOverlay, rulesOverlay, recordsOverlay, recordPopup].forEach((o) => o.classList.remove('open'));
    resetAbandon();
}
function resetAbandon() { clearTimeout(abandonTimer); abandonBtn.classList.remove('confirm'); abandonBtn.textContent = 'Abandonner'; }

function showBoard() {
    build(); layout(); refreshMode(); updateTime(true); updateTurns();
    playEl.classList.remove('hidden');
    playEl.scrollLeft = (playEl.scrollWidth - playEl.clientWidth) / 2; playEl.scrollTop = (playEl.scrollHeight - playEl.clientHeight) / 2;
    updateGrid();
}

/** Lit les choix de la modale de début. Hors limites : rien ne se lance, un court texte sous le champ. */
function readConfig() {
    const wrap = $('wrapChk').checked;
    if (level !== 'perso') return { mode: level, w: LEVELS[level].w, h: LEVELS[level].h, wrap };
    const one = (inp, err) => {
        const v = inp.value.trim(), n = /^\d{1,3}$/.test(v) ? +v : NaN;
        const bad = !(n >= MIN_SIDE && n <= MAX_SIDE);
        err.textContent = bad ? `Un entier de ${MIN_SIDE} à ${MAX_SIDE}.` : '';
        return bad ? null : n;
    };
    const w = one($('customW'), $('customWErr')), h = one($('customH'), $('customHErr'));
    return w && h ? { mode: 'perso', w, h, wrap } : null;
}

async function startGame(cfg) {
    cfg = cfg || readConfig();
    if (!cfg) return;
    lastCfg = cfg;
    closeOverlays();
    resumeAfterInfo = false; pendingWorld = null; stopGesture(); sent = false;
    state = 'gen';
    const token = ++genToken;
    playEl.classList.add('hidden');
    genOverlay.classList.add('open'); $('genCancel').hidden = true;
    clearTimeout(genTimer); genTimer = setTimeout(() => { if (token === genToken) $('genCancel').hidden = false; }, SLOW_GEN_MS);
    const strict = cfg.mode !== 'perso' && !cfg.wrap;   // preuve exigée : on regénère jusqu'à l'obtenir, jamais de grille de secours
    const r = await generate(cfg.w, cfg.h, cfg.wrap, strict, Math.random, () => token !== genToken);
    clearTimeout(genTimer);
    if (token !== genToken || state !== 'gen') return;
    if (!r.ok) { showStart(); return; }
    setup({ mode: cfg.mode, w: r.w, h: r.h, wrap: r.wrap, shapes: r.shapes, masks: r.masks });
    genOverlay.classList.remove('open');
    state = 'play'; shownTime = '';
    showBoard(); save();
}
$('genCancel').addEventListener('click', () => { genToken++; showStart(); });

function pauseGame(openModal = true) {
    if (navigating || state !== 'play') return;
    stopGesture(); state = 'paused'; save();
    if (openModal) { resetAbandon(); pauseOverlay.classList.add('open'); }
}
function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays(); resumeAfterInfo = false; state = 'play';
}
/** Retour à la modale de début (la partie reste sauvegardée). */
function showStart() {
    closeOverlays(); clearTimeout(genTimer);
    genToken++; resumeAfterInfo = false; pendingWorld = null; stopGesture();
    save();
    state = 'menu';
    playEl.classList.add('hidden');
    resumeGameBtn.hidden = !loadSaved();
    selectLevelUi(); refreshMode();
    startOverlay.classList.add('open');
}
function giveUp() {
    if (state !== 'paused') return;
    clearSave(); g = null; cells = []; rotors = [];
    showStart();
}

/** Distance de chaque case au serveur le long des liaisons, pour la lumière de victoire. */
function sweepLight() {
    const { nbr, masks, si, N } = g, dist = new Int32Array(N).fill(-1), q = [si];
    dist[si] = 0; let max = 1;
    for (let k = 0; k < q.length; k++) {
        const u = q[k];
        for (let d = 0; d < 4; d++) {
            if (!((masks[u] >> d) & 1)) continue;
            const v = nbr[u * 4 + d];
            if (v >= 0 && dist[v] < 0 && ((masks[v] >> ((d + 2) & 3)) & 1)) { dist[v] = dist[u] + 1; max = Math.max(max, dist[v]); q.push(v); }
        }
    }
    for (let i = 0; i < N; i++) cells[i].style.setProperty('--d', (Math.max(0, dist[i]) / max).toFixed(3));
    boardEl.classList.add('sweep');
}
function showWorldStat(lvl) { const w = RC.getWorldCache(store, lvl); $('winWorld').textContent = w ? fmt(w.value) : '–'; }

async function win() {
    state = 'won'; g.done = true; stopGesture(); clearSave();
    boardEl.classList.add('locked');
    const mode = g.mode, ms = Math.max(1, Math.floor(g.ms)), recordable = isRecordMode(mode, g.wrap);
    const isRecord = recordable && RC.setBest(store, mode, ms);
    refreshMode();
    $('winTime').textContent = fmt(ms); $('winTurns').textContent = String(g.turns); $('winMode').textContent = modeName();
    $('rowBest').hidden = !recordable; $('rowWorld').hidden = !recordable;
    $('winRecord').textContent = '🏆 Nouveau record !'; $('winRecord').hidden = !isRecord;
    $('winNote').textContent = 'Cette partie ne compte pas pour le record.'; $('winNote').hidden = recordable;
    if (recordable) { $('winRecTime').textContent = fmt(RC.getBest(store, mode)); showWorldStat(mode); }
    let anim = Promise.resolve();
    if (!reduced()) { sweepLight(); anim = wait(LIGHT_MS); }
    pendingWorld = null;
    const world = (async () => {
        if (recordable && fb && await Promise.race([RC.isOnline(net), wait(2500, false)]) && state === 'won') {
            const w = await Promise.race([RC.fetchWorld(fb, mode), wait(2500, null)]);
            if (w && w.ok) {
                RC.setWorldCache(store, mode, w.value === null ? null : { value: w.value, message: w.message });
                showWorldStat(mode);
                if (w.value === null || ms < w.value) pendingWorld = { level: mode, ms };
            }
        }
    })();
    await Promise.all([anim, world]);
    if (state !== 'won') return;
    if (pendingWorld) openWorldPopup(); else winOverlay.classList.add('open');
}

// ─── Clavier / visibilité ───
document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) {
        if (e.key === 'Enter' && e.target.closest('.custom') && state === 'menu') startGame();
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
        if (infoOpen()) closeInfo();
        else if (state === 'play') pauseGame();
        else if (state === 'paused') resumeGame();
        return;
    }
    if (k === 'enter' && state === 'menu' && startOverlay.classList.contains('open') && !infoOpen()) { startGame(); return; }
    if (state !== 'play') return;
    const dr = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] }[k];
    if (dr) {
        e.preventDefault();
        let r = ((foc / g.w) | 0) + dr[0], c = (foc % g.w) + dr[1];
        if (g.wrap) { r = (r + g.h) % g.h; c = (c + g.w) % g.w; } else { r = Math.min(g.h - 1, Math.max(0, r)); c = Math.min(g.w - 1, Math.max(0, c)); }
        boardEl.classList.add('kb'); setFocus(r * g.w + c);
        cells[foc].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if (k === 'a') { boardEl.classList.add('kb'); rotate(foc, -1); }
    else if (k === 'd') { boardEl.classList.add('kb'); rotate(foc, 1); }
    else if (k === 's') { boardEl.classList.add('kb'); toggleLock(foc); }
});
['touchmove', 'gesturestart'].forEach((ev) => document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));
document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); save(); } });
let blurReady = false;
window.addEventListener('load', () => { setTimeout(() => { blurReady = true; }, 500); });
window.addEventListener('blur', () => { if (blurReady) pauseGame(); });
window.addEventListener('pagehide', save);

$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', resumeGame);
$('restartBtn').addEventListener('click', () => { if (state === 'paused' && g) startGame({ mode: g.mode, w: g.w, h: g.h, wrap: g.wrap }); });
abandonBtn.addEventListener('click', () => {
    if (abandonBtn.classList.contains('confirm')) { giveUp(); return; }
    abandonBtn.classList.add('confirm'); abandonBtn.textContent = 'Confirmer l\'abandon ?';
    abandonTimer = setTimeout(resetAbandon, ABANDON_CONFIRM_MS);
});
const toMenu = () => { navigating = true; save(); window.location.href = '../../index.html'; };

$('menuPauseBtn').addEventListener('click', toMenu);
$('winAgainBtn').addEventListener('click', () => startGame(lastCfg || { mode: g.mode, w: g.w, h: g.h, wrap: g.wrap }));
$('winModeBtn').addEventListener('click', showStart);
$('winMenuBtn').addEventListener('click', toMenu);
$('playBtn').addEventListener('click', () => startGame());
function selectLevelUi() {
    document.querySelectorAll('#diffRow .diff-btn').forEach((o) => { const sel = o.dataset.level === level; o.classList.toggle('selected', sel); o.setAttribute('aria-pressed', sel); });
    $('customBox').hidden = level !== 'perso';
}
document.querySelectorAll('#diffRow .diff-btn').forEach((b) => b.addEventListener('click', () => {
    level = b.dataset.level; try { store && store.setItem(LEVEL_KEY, level); } catch { /* ignore */ }
    selectLevelUi(); if (!g) refreshMode();
}));
[['customW', 'customWErr'], ['customH', 'customHErr']].forEach(([a, b]) => $(a).addEventListener('input', () => { $(b).textContent = ''; }));
resumeGameBtn.addEventListener('click', () => {
    const s = loadSaved();                           // Reprendre ignore les choix affichés : taille et bords reliés viennent de la sauvegarde
    if (!s) { resumeGameBtn.hidden = true; return; }
    closeOverlays(); resumeGameBtn.hidden = true;
    setup(s); lastCfg = { mode: s.mode, w: s.w, h: s.h, wrap: s.wrap };
    state = 'play'; shownTime = ''; sent = false;
    showBoard();
});

// ─── Règles / records ───
function openInfo(el) {
    if (state === 'play') { pauseGame(false); resumeAfterInfo = true; }
    el.classList.add('open');
}
function closeInfo() {
    rulesOverlay.classList.remove('open'); recordsOverlay.classList.remove('open');
    if (resumeAfterInfo) { resumeAfterInfo = false; resumeGame(); }
}
function renderWorldCard(valueEl, rec) {
    valueEl.textContent = rec ? fmt(rec.value) : '–';
    const card = valueEl.closest('.record-card');
    card.querySelectorAll('.rc-message').forEach((m) => m.remove());
    if (rec && rec.message) { const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${rec.message} »`; card.appendChild(m); }
}
function fillRecords() {
    document.querySelectorAll('#recTabs .diff-btn').forEach((o) => { const s = o.dataset.level === recTab; o.classList.toggle('selected', s); o.setAttribute('aria-pressed', s); });
    const b = RC.getBest(store, recTab);
    $('recBest').textContent = b ? fmt(b) : '–';
    renderWorldCard($('recWorld'), RC.getWorldCache(store, recTab));
}
async function fillWorldRecord() {
    const tab = recTab, status = $('recStatus');
    status.textContent = 'Synchronisation...';
    if (!fb || !(await RC.isOnline(net))) { if (tab === recTab) status.textContent = 'Hors ligne (dernier record connu)'; return; }
    const r = await Promise.race([RC.fetchWorld(fb, tab), wait(4000, null)]);
    if (tab !== recTab) return;
    if (!r || !r.ok) { status.textContent = 'Erreur de connexion'; return; }
    RC.setWorldCache(store, tab, r.value === null ? null : { value: r.value, message: r.message });
    renderWorldCard($('recWorld'), RC.getWorldCache(store, tab));
    status.textContent = 'À jour (Cloud)';
}
$('rulesBtn').addEventListener('click', () => openInfo(rulesOverlay));
$('rulesClose').addEventListener('click', closeInfo);
$('recordsBtn').addEventListener('click', () => { recTab = g && LEVEL_IDS.includes(g.mode) ? g.mode : LEVEL_IDS.includes(level) ? level : 'facile'; fillRecords(); openInfo(recordsOverlay); fillWorldRecord(); });
$('recordsClose').addEventListener('click', closeInfo);
[rulesOverlay, recordsOverlay].forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) closeInfo(); }));
document.querySelectorAll('#recTabs .diff-btn').forEach((b) => b.addEventListener('click', () => { recTab = b.dataset.level; fillRecords(); fillWorldRecord(); }));

function openWorldPopup() {
    recordMsgInput.value = ''; $('recordCharCounter').textContent = `0/${RC.MESSAGE_MAX}`;
    saveRecordBtn.disabled = false; saveRecordBtn.textContent = 'Sauvegarder';
    recordPopup.classList.add('open');
    setTimeout(() => recordMsgInput.focus(), 100);
}
async function saveWorldRecord() {
    if (!pendingWorld || saveRecordBtn.disabled) return;
    const p = pendingWorld;
    if (sent || state !== 'won') { pendingWorld = null; recordPopup.classList.remove('open'); winOverlay.classList.add('open'); return; }
    sent = true;
    saveRecordBtn.disabled = true; saveRecordBtn.textContent = 'Enregistrement...';
    const r = await Promise.race([RC.submitWorld(fb, p.level, p.ms, recordMsgInput.value), wait(6000, null)]);
    pendingWorld = null; recordPopup.classList.remove('open');
    const note = (t) => { $('winNote').textContent = t; $('winNote').hidden = false; };
    if (r && r.written) { RC.setWorldCache(store, p.level, { value: r.value, message: r.message }); $('winRecord').textContent = '🌍 Record mondial !'; $('winRecord').hidden = false; }
    else if (r && r.beaten) { RC.setWorldCache(store, p.level, { value: r.value, message: r.message }); note('Un meilleur record mondial vient d\'être enregistré.'); }
    else note('Record mondial non enregistré (connexion ?).');
    showWorldStat(p.level);
    if (state === 'won') winOverlay.classList.add('open');
}
saveRecordBtn.addEventListener('click', saveWorldRecord);
recordMsgInput.addEventListener('input', () => { $('recordCharCounter').textContent = `${recordMsgInput.value.length}/${RC.MESSAGE_MAX}`; });
recordMsgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveWorldRecord(); });

// ─── Boucle / init ───
let lastT = performance.now(), lastSec = -1;
function loop(now) {
    const dt = Math.min(now - lastT, 250);
    lastT = now;
    if (state === 'play' && g.started) {          // le chrono court dès la première rotation ; figé en pause, modale ouverte, onglet caché
        g.ms += dt; updateTime(false);
        const sec = Math.floor(g.ms / 1000);
        if (sec !== lastSec) { lastSec = sec; save(); }
    }
    requestAnimationFrame(loop);
}

(function init() {
    requestAnimationFrame(loop);
    RC.initOnline().then((o) => { fb = o.fb; net = o.net; });
    try { const l = store && store.getItem(LEVEL_KEY); if (LEVEL_IDS.includes(l) || l === 'perso') level = l; } catch { /* ignore */ }
    resumeGameBtn.hidden = !loadSaved();
    selectLevelUi(); refreshMode(); updateTurns();
})();
