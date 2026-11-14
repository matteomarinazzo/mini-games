/**
 * Chemin – game.js : DOM, geste, chrono, pause, abandon, fin de partie, sauvegarde, records.
 * Le code qui accepte un pas ne lit jamais la solution (qui n'existe pas côté jeu) : seules `canEnter` (rules.js) décide.
 */
import { LEVELS, generate, solve } from './core/generate.js';
import { neighbors, canEnter, COUNT } from './core/rules.js';
import { pickFallback } from './core/fallback.js';
import * as RC from './core/records.js';

const SAVE_KEY = 'path-save', ABANDON_CONFIRM_MS = 3000, LIGHT_MS = 700;
const LEVEL_IDS = RC.LEVEL_IDS;

let state = 'menu';  // menu | gen | play | paused | won | over
let level = 'facile', recTab = 'facile';
const LEVEL_KEY = 'path-level';
let g = null;        // { level, n, lab, trail, inTrail, next, ms, started }
let gest = null, abandonTimer = 0, resumeAfterInfo = false, pendingWorld = null, fb = null, net = null, shownTime = '', genToken = 0, sent = false;
let tiles = [], nums = [], trailEl, lightEl, headEl;

const $ = (id) => document.getElementById(id);
const boardEl = $('board'), playEl = $('play');
const startOverlay = $('startOverlay'), resumeGameBtn = $('resumeGameBtn'), pauseOverlay = $('pauseOverlay'), winOverlay = $('winOverlay'), genOverlay = $('genOverlay'), rulesOverlay = $('rulesOverlay');
const recordsOverlay = $('recordsOverlay'), recordPopup = $('recordMessagePopup'), abandonBtn = $('abandonBtn');
const recordMsgInput = $('recordMsgInput'), saveRecordBtn = $('saveRecordMsgBtn');
const store = RC.getStore();
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = RC.wait, fmt = RC.fmt;
let navigating = false;

// ─── État de partie ───
const head = () => g.trail[g.trail.length - 1];
function setup(lvl, n, lab, trail, ms, started) {
    g = { level: lvl, n, lab, trail: trail.slice(), inTrail: new Uint8Array(n * n), next: 1, ms, started };
    recompute();
}
function recompute() {
    g.inTrail.fill(0); g.next = 1;
    for (const i of g.trail) { g.inTrail[i] = 1; if (g.lab[i]) g.next++; }
}
const newTrail = (lab) => [lab.indexOf(1)];

// ─── Sauvegarde ───
function save() {
    if (!store || !g || state === 'won') return;
    try { store.setItem(SAVE_KEY, JSON.stringify({ slug: RC.SLUG, level: g.level, n: g.n, lab: g.lab, trail: g.trail, ms: Math.floor(g.ms), started: g.started, status: 'play' })); } catch { /* quota */ }
}
const clearSave = () => { try { store && store.removeItem(SAVE_KEY); } catch { /* ignore */ } };

function loadSaved() {
    try {
        const s = JSON.parse(store.getItem(SAVE_KEY));
        if (!s || s.slug !== RC.SLUG || s.status !== 'play' || !LEVELS[s.level] || s.n !== LEVELS[s.level].n) return null;
        const n = s.n, N = n * n, int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
        if (!Array.isArray(s.lab) || s.lab.length !== N || !s.lab.every((v) => int(v, 0, COUNT))) return null;
        for (let v = 1; v <= COUNT; v++) if (s.lab.filter((x) => x === v).length !== 1) return null;
        const adj = (a, b) => neighbors(n, a).includes(b);
        for (let i = 0; i < N; i++) if (s.lab[i] && neighbors(n, i).some((x) => s.lab[x])) return null;
        if (!Array.isArray(s.trail) || !s.trail.length || s.trail.length >= N || !int(s.ms, 0, 1e10)) return null;
        if (s.trail[0] !== s.lab.indexOf(1)) return null;
        const seen = new Set(); let next = 1;
        for (let k = 0; k < s.trail.length; k++) {
            const i = s.trail[k];
            if (!int(i, 0, N - 1) || seen.has(i) || (k && !adj(s.trail[k - 1], i))) return null;
            seen.add(i);
            if (s.lab[i]) { if (s.lab[i] !== next) return null; next++; }
        }
        return { level: s.level, n, lab: s.lab.slice(), trail: s.trail.slice(), ms: s.ms, started: !!s.started };
    } catch { return null; }
}

// ─── Rendu ───
function build() {
    const n = g.n;
    boardEl.className = 'board';
    boardEl.style.setProperty('--n', n);
    let h = `<div class="cells">${'<i></i>'.repeat(n * n)}</div>`;
    h += `<svg class="trail" viewBox="0 0 ${n} ${n}" aria-hidden="true"><path class="tl" pathLength="1"/><path class="lt" pathLength="1"/><circle class="hd" r=".3"/></svg>`;
    h += '<div class="nums">';
    g.lab.forEach((v, i) => { if (v) h += `<span class="num" data-i="${i}" style="left:${(i % n) * 100 / n}%;top:${((i / n) | 0) * 100 / n}%"><b>${v}</b></span>`; });
    h += '</div>';
    boardEl.innerHTML = h;
    tiles = [...boardEl.querySelectorAll('.cells i')];
    nums = []; boardEl.querySelectorAll('.num').forEach((el) => { nums[+el.dataset.i] = el; });
    trailEl = boardEl.querySelector('.tl'); lightEl = boardEl.querySelector('.lt'); headEl = boardEl.querySelector('.hd');
}
function render() {
    const n = g.n, pt = (i) => `${(i % n) + .5} ${((i / n) | 0) + .5}`;
    const d = g.trail.length > 1 ? 'M' + g.trail.map(pt).join('L') : '';
    trailEl.setAttribute('d', d); lightEl.setAttribute('d', d);
    const h = head();
    headEl.setAttribute('cx', (h % n) + .5); headEl.setAttribute('cy', ((h / n) | 0) + .5);
    nums.forEach((el, i) => { if (el) el.classList.toggle('on', !!g.inTrail[i]); });
    updateTime(true);
}
function refuse(i) {
    const el = tiles[i]; if (!el) return;
    el.classList.remove('no'); void el.offsetWidth; el.classList.add('no');
    setTimeout(() => el.classList.remove('no'), 300);
}
function updateTime(force) {
    const s = fmt(g ? g.ms : 0);
    if (force || s !== shownTime) { shownTime = s; $('timeValue').textContent = s; }
}
function updateGrid() {
    const b = boardEl.getBoundingClientRect(), n = g ? g.n : LEVELS[level].n;
    if (!b.width) return;
    const st = document.documentElement.style;
    st.setProperty('--gs', `${b.width / n}px`); st.setProperty('--gx', `${b.left}px`); st.setProperty('--gy', `${b.top}px`);
}
window.addEventListener('resize', updateGrid);
window.addEventListener('orientationchange', updateGrid);
if (window.ResizeObserver) new ResizeObserver(updateGrid).observe(boardEl);
function refreshBest() {
    const b = RC.getBest(store, level);
    $('modeLine').textContent = `${LEVELS[level].label} · Record ${b ? fmt(b) : '–'}`;
    updateGrid();
}

// ─── Pas, retour arrière ───
function tryStep(i) {
    if (state !== 'play') return false;
    if (!canEnter(g.lab, g.inTrail, g.next, i)) { refuse(i); return false; }
    g.trail.push(i); g.inTrail[i] = 1;
    if (g.lab[i]) g.next++;
    g.started = true;
    render(); save();
    if (g.trail.length === g.n * g.n) win();
    return true;
}
function cutTo(i) {
    if (state !== 'play') return;
    const k = g.trail.indexOf(i);
    if (k < 0 || k === g.trail.length - 1) return;
    g.trail.length = k + 1; recompute(); render(); save();
}

// ─── Geste ───
function pointF(e) {
    const b = boardEl.getBoundingClientRect(), n = g.n;
    return { x: (e.clientX - b.left) / b.width * n, y: (e.clientY - b.top) / b.height * n };
}
function cellOf(p) {
    const n = g.n, c = Math.floor(p.x), r = Math.floor(p.y);
    return c < 0 || r < 0 || c >= n || r >= n ? -1 : r * n + c;
}
function handleCell(i) {
    if (i < 0 || !gest) return;
    const h = head();
    if (i === h) return;
    if (g.inTrail[i]) {
        if (gest.mode === 'cut') cutTo(i);
        else if (neighbors(g.n, h).includes(i)) refuse(i);
        return;
    }
    if (neighbors(g.n, h).includes(i)) tryStep(i);
}
boardEl.addEventListener('pointerdown', (e) => {
    if (state !== 'play' || gest) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { boardEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = pointF(e), i = cellOf(p);
    gest = { id: e.pointerId, p, mode: i >= 0 && g.inTrail[i] ? 'cut' : 'ext' };
    handleCell(i);
});
boardEl.addEventListener('pointermove', (e) => {
    if (!gest || e.pointerId !== gest.id || state !== 'play') return;
    const q = pointF(e), p = gest.p, my = gest;
    const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / .2));
    let last = cellOf(p);
    for (let s = 1; s <= steps && state === 'play' && gest === my; s++) {
        const i = cellOf({ x: p.x + (q.x - p.x) * s / steps, y: p.y + (q.y - p.y) * s / steps });
        if (i !== last) { handleCell(i); last = i; }
    }
    if (gest === my) gest.p = q;
});
const endGesture = (e) => { if (gest && e.pointerId === gest.id) { gest = null; try { boardEl.releasePointerCapture(e.pointerId); } catch { /* ignore */ } } };
boardEl.addEventListener('pointerup', endGesture);
boardEl.addEventListener('pointercancel', endGesture);
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

// ─── Flux de jeu ───
const infoOpen = () => rulesOverlay.classList.contains('open') || recordsOverlay.classList.contains('open');
function closeOverlays() {
    [startOverlay, pauseOverlay, winOverlay, genOverlay, rulesOverlay, recordsOverlay, recordPopup].forEach((o) => o.classList.remove('open'));
    resetAbandon();
}
function resetAbandon() { clearTimeout(abandonTimer); abandonBtn.classList.remove('confirm'); abandonBtn.textContent = 'Abandonner'; }

function showBoard() {
    build(); render(); refreshBest();
    playEl.classList.remove('hidden');
    updateGrid();
}

async function startGame() {
    resumeGameBtn.hidden = true;
    closeOverlays();
    resumeAfterInfo = false; pendingWorld = null; gest = null; sent = false;
    state = 'gen';
    const token = ++genToken;
    playEl.classList.add('hidden');
    genOverlay.classList.add('open');
    refreshBest();
    let r = await generate(level);
    if (token !== genToken || state !== 'gen') return;
    if (!r.ok) r = pickFallback(level);   // grille de secours déjà vérifiée
    setup(level, r.n, r.lab, newTrail(r.lab), 0, false);
    genOverlay.classList.remove('open');
    state = 'play'; shownTime = '';
    showBoard(); save();
}

function pauseGame(openModal = true) {
    if (navigating || state !== 'play') return;
    gest = null; state = 'paused'; save();
    if (openModal) { resetAbandon(); pauseOverlay.classList.add('open'); }
}
function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays(); resumeAfterInfo = false; state = 'play';
}
const toMenu = () => { navigating = true; save(); window.location.href = '../../index.html'; };

/** Plateau figé (fin de partie) : trait complet, tous les chiffres pris. */
function drawStatic(el, n, lab, trail) {
    const pt = (i) => `${(i % n) + .5} ${((i / n) | 0) + .5}`;
    let h = `<div class="cells">${'<i></i>'.repeat(n * n)}</div>`;
    h += `<svg class="trail" viewBox="0 0 ${n} ${n}" aria-hidden="true"><path class="tl" d="M${trail.map(pt).join('L')}"/></svg><div class="nums">`;
    lab.forEach((v, i) => { if (v) h += `<span class="num${trail.includes(i) ? ' on' : ''}" style="left:${(i % n) * 100 / n}%;top:${((i / n) | 0) * 100 / n}%"><b>${v}</b></span>`; });
    el.style.setProperty('--n', n);
    el.innerHTML = h + '</div>';
}
function setEnd(title, label, trail) {
    $('winTitle').textContent = title; $('winBoardLabel').textContent = label;
    drawStatic($('endBoard'), g.n, g.lab, trail);
}
function showReady() {
    closeOverlays();
    genToken++; resumeAfterInfo = false; pendingWorld = null; gest = null;
    state = 'menu';
    playEl.classList.add('hidden');
    resumeGameBtn.hidden = true;
    selectLevelUi(); refreshBest();
    startOverlay.classList.add('open');
}
function giveUp() {
    if (state !== 'paused') return;
    const sol = solve(g.n, g.lab) || g.trail;   // la solution ne sert qu'à l'affichage
    state = 'over'; gest = null; resumeAfterInfo = false; pendingWorld = null;
    clearSave(); closeOverlays();
    setEnd('🏳️ Partie abandonnée', 'Solution', sol);
    $('rowTime').hidden = true;
    $('winRecTime').textContent = RC.getBest(store, g.level) ? fmt(RC.getBest(store, g.level)) : '–';
    $('winMode').textContent = LEVELS[g.level].label;
    $('winRecord').hidden = true;
    $('winNote').textContent = 'Partie abandonnée : aucun temps enregistré.'; $('winNote').hidden = false;
    showWorldStat(g.level);
    winOverlay.classList.add('open');
}

function showWorldStat(lvl) { const w = RC.getWorldCache(store, lvl); $('winWorld').textContent = w ? fmt(w.value) : '–'; }

async function win() {
    state = 'won'; gest = null; clearSave();
    boardEl.classList.add('locked');
    const lvl = g.level, ms = Math.max(1, Math.floor(g.ms));
    const isRecord = RC.setBest(store, lvl, ms);
    refreshBest();
    setEnd('🧭 Grille remplie !', 'Ton chemin', g.trail);
    $('rowTime').hidden = false;
    $('winTime').textContent = fmt(ms);
    $('winRecTime').textContent = fmt(RC.getBest(store, lvl));
    $('winMode').textContent = LEVELS[lvl].label;
    $('winRecord').textContent = '🏆 Nouveau record !'; $('winRecord').hidden = !isRecord;
    $('winNote').hidden = true;
    showWorldStat(lvl);
    const anim = reduced() ? Promise.resolve() : (boardEl.classList.add('run'), wait(LIGHT_MS));
    pendingWorld = null;
    const world = (async () => {
        if (fb && await Promise.race([RC.isOnline(net), wait(2500, false)]) && state === 'won') {
            const w = await Promise.race([RC.fetchWorld(fb, lvl), wait(2500, null)]);
            if (w && w.ok) {
                RC.setWorldCache(store, lvl, w.value === null ? null : { value: w.value, message: w.message });
                showWorldStat(lvl);
                if (w.value === null || ms < w.value) pendingWorld = { level: lvl, ms };
            }
        }
    })();
    await Promise.all([anim, world]);
    if (state !== 'won') return;
    if (pendingWorld) openWorldPopup(); else winOverlay.classList.add('open');
}

// ─── Clavier / visibilité ───
document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
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
        const n = g.n, h = head(), r = ((h / n) | 0) + dr[0], c = (h % n) + dr[1];
        if (r < 0 || c < 0 || r >= n || c >= n) refuse(h); else tryStep(r * n + c);
    } else if (k === 'backspace') {
        e.preventDefault();
        if (g.trail.length > 1) cutTo(g.trail[g.trail.length - 2]);
    }
});
['touchmove', 'gesturestart'].forEach((ev) => document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));
document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); save(); } });
let blurReady = false;
window.addEventListener('load', () => { setTimeout(() => { blurReady = true; }, 500); });
window.addEventListener('blur', () => { if (blurReady) pauseGame(); });
window.addEventListener('pagehide', save);

$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', resumeGame);
$('restartBtn').addEventListener('click', () => { if (state === 'paused') startGame(); });
abandonBtn.addEventListener('click', () => {
    if (abandonBtn.classList.contains('confirm')) { giveUp(); return; }
    abandonBtn.classList.add('confirm'); abandonBtn.textContent = 'Confirmer l\'abandon ?';
    abandonTimer = setTimeout(resetAbandon, ABANDON_CONFIRM_MS);
});
$('menuPauseBtn').addEventListener('click', toMenu);
$('winAgainBtn').addEventListener('click', startGame);
$('winModeBtn').addEventListener('click', showReady);
$('playBtn').addEventListener('click', startGame);
function selectLevelUi() {
    document.querySelectorAll('#diffRow .diff-btn').forEach((o) => { const sel = o.dataset.level === level; o.classList.toggle('selected', sel); o.setAttribute('aria-pressed', sel); });
}
document.querySelectorAll('#diffRow .diff-btn').forEach((b) => b.addEventListener('click', () => {
    level = b.dataset.level; try { store && store.setItem(LEVEL_KEY, level); } catch { /* ignore */ }
    selectLevelUi(); refreshBest();
}));
resumeGameBtn.addEventListener('click', () => {
    if (!g) return;
    level = g.level; resumeGameBtn.hidden = true; closeOverlays();
    state = 'play'; shownTime = ''; showBoard();
});
$('winMenuBtn').addEventListener('click', toMenu);

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
$('recordsBtn').addEventListener('click', () => { recTab = level; fillRecords(); openInfo(recordsOverlay); fillWorldRecord(); });
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
    if (state === 'play' && g.started) {
        g.ms += dt; updateTime(false);
        const sec = Math.floor(g.ms / 1000);
        if (sec !== lastSec) { lastSec = sec; save(); }
    }
    requestAnimationFrame(loop);
}

(function init() {
    requestAnimationFrame(loop);
    RC.initOnline().then((o) => { fb = o.fb; net = o.net; });
    try { const l = store && store.getItem(LEVEL_KEY); if (LEVEL_IDS.includes(l)) level = l; } catch { /* ignore */ }
    const s = store ? loadSaved() : null;
    if (s) { setup(s.level, s.n, s.lab, s.trail, s.ms, s.started); level = s.level; resumeGameBtn.hidden = false; }
    selectLevelUi(); refreshBest();
})();
