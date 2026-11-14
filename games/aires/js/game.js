/**
 * Aires – game.js : DOM, geste (glisser un rectangle), chrono, pause, abandon, fin de partie, sauvegarde, records.
 * Génération (solution unique prouvée) : core/generate.js.
 * Stockage : records « aires » ; partie en cours « aires:partie » ; record mondial Firebase du site (hors ligne toléré).
 */
import { LEVELS, generate } from './core/generate.js';

const SLUG = 'aires';
const SAVE_KEY = `${SLUG}:partie`;
const FB_GAME = SLUG;
const LEVEL_IDS = ['easy', 'medium', 'hard'];
const ABANDON_CONFIRM_MS = 3000;
const MESSAGE_MAX = 50, WIN_DELAY = 500, MAX_TENTHS = 24 * 3600 * 10;
const MIN_AREA = 2, MAX_COLOR = 16;

// ─── Records (local + mondial) : le plus petit temps gagne ───
const validTime = (t) => Number.isInteger(t) && t > 0 && t <= MAX_TENTHS;
const worldKey = (l) => `time_${l}`;
const defaultData = () => ({ v: 1, level: 'easy', best: { easy: null, medium: null, hard: null }, world: { easy: null, medium: null, hard: null } });

function sanitize(raw) {
    const d = defaultData();
    if (!raw || typeof raw !== 'object') return d;
    if (LEVEL_IDS.includes(raw.level)) d.level = raw.level;
    for (const id of LEVEL_IDS) {
        if (raw.best && validTime(raw.best[id])) d.best[id] = raw.best[id];
        const w = raw.world && raw.world[id];
        if (w && typeof w === 'object' && validTime(w.value)) d.world[id] = { value: w.value, message: typeof w.message === 'string' ? w.message.slice(0, MESSAGE_MAX) : '' };
    }
    return d;
}
function loadData(st) { try { const t = st ? st.getItem(SLUG) : null; return sanitize(t ? JSON.parse(t) : null); } catch { return defaultData(); } }
function saveData(st, d) {
    try {
        const o = loadData(st);
        for (const id of LEVEL_IDS) if (o.best[id] !== null && (d.best[id] === null || o.best[id] < d.best[id])) d.best[id] = o.best[id];
        st.setItem(SLUG, JSON.stringify(d)); return true;
    } catch { return false; }
}
function recordTime(d, lvl, tenths) {
    if (!LEVEL_IDS.includes(lvl) || !validTime(tenths)) return { isRecord: false };
    const p = d.best[lvl];
    if (p !== null && tenths >= p) return { isRecord: false };
    d.best[lvl] = tenths; return { isRecord: true };
}
function parseWorld(raw) {
    let value = raw, message = '';
    if (raw && typeof raw === 'object') { value = raw.value; if (typeof raw.message === 'string') message = raw.message.slice(0, MESSAGE_MAX); }
    return { value: validTime(value) ? value : null, message };
}
async function fetchWorld(fb, lvl) {
    if (!fb || !LEVEL_IDS.includes(lvl)) return { ok: false, value: null, message: '' };
    try { return { ok: true, ...parseWorld(await fb.getFirebaseRecordData(FB_GAME, worldKey(lvl))) }; } catch { return { ok: false, value: null, message: '' }; }
}
async function submitWorld(fb, lvl, tenths, message = '') {
    const fail = { written: false, beaten: false, value: null, message: '' };
    if (!fb || !LEVEL_IDS.includes(lvl) || !validTime(tenths)) return fail;
    const cur = await fetchWorld(fb, lvl);
    if (!cur.ok) return fail;
    if (cur.value !== null && tenths >= cur.value) return { written: false, beaten: true, value: cur.value, message: cur.message };
    const msg = String(message || '').trim().slice(0, MESSAGE_MAX);
    try {
        const ok = (await fb.setFirebaseLeaderboard(FB_GAME, worldKey(lvl), { value: tenths, message: msg, timestamp: Date.now() })) === true;
        return ok ? { written: true, beaten: false, value: tenths, message: msg } : { ...fail, value: cur.value, message: cur.message };
    } catch { return { ...fail, value: cur.value, message: cur.message }; }
}

// ─── État ───
let state = 'menu';   // menu | gen | play | paused | won | over
let level = 'easy', recTab = 'easy';
let g = null;         // { level, n, clues, sol, areas, ms, started, status, sent }
let abandonTimer = 0, gest = null, resumeAfterInfo = false, pendingWorld = null, fb = null, net = null, shownTime = '', genToken = 0;

const $ = (id) => document.getElementById(id);
const startOverlay = $('startOverlay'), pauseOverlay = $('pauseOverlay'), winOverlay = $('winOverlay'), genOverlay = $('genOverlay');
const rulesOverlay = $('rulesOverlay'), abandonBtn = $('abandonBtn'), recordsOverlay = $('recordsOverlay'), recordPopup = $('recordMessagePopup');
const recordMsgInput = $('recordMsgInput'), saveRecordBtn = $('saveRecordMsgBtn'), boardEl = $('board'), playEl = $('play');

let store = null;
try { store = window.localStorage; } catch { store = null; }
const data = loadData(store);
level = recTab = data.level;

const formatTenths = (t) => `${Math.floor(t / 600)}:${String(Math.floor(t / 10) % 60).padStart(2, '0')}.${t % 10}`;
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

// ─── Géométrie ───
const inRect = (a, k) => k.r >= a.r && k.r < a.r + a.h && k.c >= a.c && k.c < a.c + a.w;
const hit = (a, b) => a.r < b.r + b.h && b.r < a.r + a.h && a.c < b.c + b.w && b.c < a.c + a.w;
const areaOf = (a) => a.h * a.w;
function okArea(a, clues) {
    let m = 0, v = 0;
    for (const k of clues) if (inRect(a, k)) { m++; v = k.v; }
    return m === 1 && v === areaOf(a);
}
const rectOf = (p, q) => ({ r: Math.min(p.r, q.r), c: Math.min(p.c, q.c), h: Math.abs(p.r - q.r) + 1, w: Math.abs(p.c - q.c) + 1 });
const color = (s) => s >= MIN_AREA && s <= MAX_COLOR ? `hsl(${Math.round((200 + (s - MIN_AREA) * 137.508) % 360)} ${s % 2 ? 62 : 72}% ${s % 2 ? 72 : 62}%)` : 'hsl(215 18% 62%)';

/** Couverture complète, sans chevauchement, et chaque aire posée est opaque. */
function isWon(x) {
    if (!x) return false;
    const cov = new Uint8Array(x.n * x.n);
    for (const a of x.areas) {
        if (a.r < 0 || a.c < 0 || a.r + a.h > x.n || a.c + a.w > x.n || !okArea(a, x.clues)) return false;
        for (let y = a.r; y < a.r + a.h; y++) for (let z = a.c; z < a.c + a.w; z++) { if (cov[y * x.n + z]) return false; cov[y * x.n + z] = 1; }
    }
    return cov.every((v) => v === 1);
}

// ─── Rendu ───
const pos = (a, n) => `left:calc(${a.c * 100 / n}% + 2px);top:calc(${a.r * 100 / n}% + 2px);width:calc(${a.w * 100 / n}% - 4px);height:calc(${a.h * 100 / n}% - 4px);--c:${color(areaOf(a))}`;

/** Dessine une grille dans `el` ; o.hide = index d'aire masquée, o.prev = { rect, cls }, o.pop = index à animer. */
function draw(el, n, clues, areas, o = {}) {
    let h = `<div class="cells">${'<i></i>'.repeat(n * n)}</div>`;
    const dark = new Set();
    areas.forEach((a, i) => {
        const ok = okArea(a, clues);
        if (ok && i !== o.hide) clues.forEach((k, j) => { if (inRect(a, k)) dark.add(j); });
        h += `<b class="ar${ok ? '' : ' t'}${i === o.hide ? ' hid' : ''}${i === o.pop ? ' pop' : ''}" style="${pos(a, n)}"></b>`;
    });
    if (o.prev) {
        h += `<b class="ar pv ${o.prev.cls}" style="${pos(o.prev.rect, n)}"></b>`;
        if (o.prev.cls === '') clues.forEach((k, j) => { if (inRect(o.prev.rect, k)) dark.add(j); });
    }
    clues.forEach((k, j) => { h += `<span class="dg${dark.has(j) ? ' dk' : ''}" style="left:${k.c * 100 / n}%;top:${k.r * 100 / n}%;width:${100 / n}%;height:${100 / n}%">${k.v}</span>`; });
    el.style.setProperty('--n', n);
    el.innerHTML = h;
}
const redraw = (o) => { if (g) draw(boardEl, g.n, g.clues, g.areas, o); };

function updateTime(force) {
    const s = formatTenths(g ? Math.floor(g.ms / 100) : 0);
    if (force || s !== shownTime) { shownTime = s; $('timeValue').textContent = s; }
}
/** Cale le quadrillage du fond sur les cases de la grille (taille et origine). */
function updateGrid() {
    const n = (state === 'menu' || state === 'gen' || !g) ? LEVELS[level].n : g.n;
    const b = boardEl.getBoundingClientRect();
    if (!b.width) return;
    const st = document.documentElement.style;
    st.setProperty('--gs', `${b.width / n}px`);
    st.setProperty('--gx', `${b.left}px`);
    st.setProperty('--gy', `${b.top}px`);
}
window.addEventListener('resize', updateGrid);
window.addEventListener('orientationchange', updateGrid);
if (window.ResizeObserver) new ResizeObserver(updateGrid).observe(boardEl);

function refreshBest() {
    updateGrid();
    $('modeLine').textContent = `${LEVELS[level].label} · Record ${data.best[level] ? formatTenths(data.best[level]) : '–'}`;
}

// ─── Sauvegarde de la partie ───
function save() {
    if (!store || !g) return;
    try {
        store.setItem(SAVE_KEY, JSON.stringify({ slug: SLUG, level: g.level, n: g.n, clues: g.clues, sol: g.sol, areas: g.areas, ms: Math.floor(g.ms), started: g.started, status: g.status, sent: g.sent }));
    } catch { /* quota */ }
}

function loadSaved() {
    try {
        const s = JSON.parse(store.getItem(SAVE_KEY));
        if (!s || s.slug !== SLUG || !LEVELS[s.level] || s.n !== LEVELS[s.level].n || s.status !== 'play' || s.sent) return null;
        if (!Array.isArray(s.areas) || s.areas.length === 0) return null; // rien fait = pas de reprise
        const n = s.n, int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
        const rectOk = (a) => a && int(a.r, 0, n - 1) && int(a.c, 0, n - 1) && int(a.h, 1, n) && int(a.w, 1, n) && a.r + a.h <= n && a.c + a.w <= n;
        if (!Array.isArray(s.clues) || !Array.isArray(s.sol) || !Array.isArray(s.areas) || !int(s.ms, 0, 1e10)) return null;
        if (!s.clues.every((k) => k && int(k.r, 0, n - 1) && int(k.c, 0, n - 1) && int(k.v, 2, n * n))) return null;
        if (!s.sol.every(rectOk) || !s.areas.every(rectOk)) return null;
        for (let i = 0; i < s.areas.length; i++) for (let j = i + 1; j < s.areas.length; j++) if (hit(s.areas[i], s.areas[j])) return null;
        return { level: s.level, n, clues: s.clues.map(({ r, c, v }) => ({ r, c, v })), sol: s.sol.map(({ r, c, h, w }) => ({ r, c, h, w })), areas: s.areas.map(({ r, c, h, w }) => ({ r, c, h, w })), ms: s.ms, started: !!s.started, status: 'play', sent: false };
    } catch { return null; }
}

// ─── Geste ───
function cellAt(e) {
    const b = boardEl.getBoundingClientRect(), n = g.n, cl = (v) => Math.max(0, Math.min(n - 1, v));
    return { r: cl(Math.floor((e.clientY - b.top) / b.height * n)), c: cl(Math.floor((e.clientX - b.left) / b.width * n)) };
}
const areaIndexAt = (p) => g.areas.findIndex((a) => inRect(a, p));

function gestRect() { return rectOf(gest.s, gest.cur); }
function gestView() {
    const rect = gestRect();
    if (!gest.left || areaOf(rect) < 2) { redraw(); return; }
    const bad = g.areas.some((a, i) => i !== gest.A && hit(a, rect));
    const cls = bad ? 'bad' : okArea(rect, g.clues) ? '' : 't';
    redraw({ hide: gest.A, prev: { rect, cls } });
}

boardEl.addEventListener('pointerdown', (e) => {
    if (state !== 'play' || gest) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { boardEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!g.started) g.started = true;
    const s = cellAt(e);
    gest = { id: e.pointerId, s, cur: s, left: false, A: areaIndexAt(s) };
});
boardEl.addEventListener('pointermove', (e) => {
    if (!gest || e.pointerId !== gest.id) return;
    const c = cellAt(e);
    if (c.r === gest.cur.r && c.c === gest.cur.c) return;
    gest.cur = c;
    if (c.r !== gest.s.r || c.c !== gest.s.c) gest.left = true;
    gestView();
});
function endGesture(e, cancel) {
    if (!gest || e.pointerId !== gest.id) return;
    const gs = gest; gest = null;
    try { boardEl.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    let popIdx = -1;
    if (!cancel && state === 'play') {
        const up = cellAt(e);
        if (up.r !== gs.s.r || up.c !== gs.s.c) gs.left = true;
        gs.cur = up;
        if (!gs.left) {
            if (gs.A >= 0) { g.areas.splice(gs.A, 1); save(); }
        } else {
            const rect = rectOf(gs.s, gs.cur);
            if (areaOf(rect) >= 2 && !g.areas.some((a, i) => i !== gs.A && hit(a, rect))) {
                if (gs.A >= 0) g.areas.splice(gs.A, 1);
                g.areas.push(rect); popIdx = g.areas.length - 1; save();
            }
        }
    }
    redraw({ pop: popIdx });
    if (state === 'play' && isWon(g)) win();
}
boardEl.addEventListener('pointerup', (e) => endGesture(e, false));
boardEl.addEventListener('pointercancel', (e) => endGesture(e, true));
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

// ─── Flux de jeu ───
const infoOpen = () => rulesOverlay.classList.contains('open') || recordsOverlay.classList.contains('open');
function closeOverlays() {
    [startOverlay, pauseOverlay, winOverlay, genOverlay, rulesOverlay, recordsOverlay, recordPopup].forEach((o) => o.classList.remove('open'));
    resetAbandon();
}

function resetAbandon() {
    clearTimeout(abandonTimer);
    abandonBtn.classList.remove('confirm');
    abandonBtn.textContent = 'Abandonner';
}

function showBoard() {
    playEl.classList.remove('hidden');
    redraw(); updateTime(true); refreshBest(); updateGrid();
}

async function startGame() {
    resumeGameBtn.hidden = true;
    closeOverlays();
    resumeAfterInfo = false; pendingWorld = null; gest = null;
    state = 'gen';
    const token = ++genToken;
    playEl.classList.add('hidden');
    $('genText').textContent = 'Génération…'; $('genBtns').hidden = true;
    genOverlay.classList.add('open');
    refreshBest();
    const r = await generate(level);
    if (token !== genToken || state !== 'gen') return;
    if (!r.ok) { $('genText').textContent = 'Impossible de générer une grille.'; $('genBtns').hidden = false; return; }
    g = { level: r.level, n: r.n, clues: r.clues, sol: r.sol, areas: [], ms: 0, started: false, status: 'play', sent: false };
    genOverlay.classList.remove('open');
    state = 'play';
    showBoard(); save();
}

function showReady() {
    closeOverlays();
    genToken++; resumeAfterInfo = false; pendingWorld = null; gest = null;
    state = 'menu';
    playEl.classList.add('hidden');
    selectLevelUi(); refreshBest();
    startOverlay.classList.add('open');
}

function pauseGame(openModal = true) {
    if (_navigating || state !== 'play') return;
    if (gest) { gest = null; redraw(); }
    state = 'paused';
    save();
    if (openModal) { resetAbandon(); pauseOverlay.classList.add('open'); }
}
function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    resumeAfterInfo = false;
    state = 'play';
}
function restartGame() {
    if (state !== 'paused') return;
    g.areas = []; g.ms = 0; g.started = false; g.sent = false; g.status = 'play';
    shownTime = ''; resumeGame(); showBoard(); save();
}

function fillEnd(lvl, tenths, won) {
    $('rowTime').hidden = !won;
    if (won) $('winTime').textContent = formatTenths(tenths);
    $('winRecTime').textContent = data.best[lvl] ? formatTenths(data.best[lvl]) : '–';
    $('winMode').textContent = LEVELS[lvl].label;
    $('winRecord').hidden = true; $('winNote').hidden = true;
    showWorldStat(lvl);
}
function setEnd(title, label, areas) {
    $('winTitle').textContent = title;
    $('winBoardLabel').textContent = label;
    draw($('endBoard'), g.n, g.clues, areas);
}
function showEndNote(t) { $('winNote').textContent = t; $('winNote').hidden = false; }

async function win() {
    state = 'won'; gest = null;
    g.status = 'won'; save();
    const lvl = g.level, tenths = Math.max(1, Math.floor(g.ms / 100));
    const { isRecord } = recordTime(data, lvl, tenths);
    if (isRecord) saveData(store, data);
    refreshBest();
    setEnd('🧩 Grille résolue !', 'Ta grille', g.areas);
    fillEnd(lvl, tenths, true);
    $('winRecord').textContent = '🏆 Nouveau record !';
    $('winRecord').hidden = !isRecord;

    pendingWorld = null;
    if (fb && await Promise.race([isOnline(), wait(2500, false)]) && state === 'won') {
        const w = await Promise.race([fetchWorld(fb, lvl), wait(2500, null)]);
        if (w && w.ok) {
            setWorldCache(lvl, w.value === null ? null : { value: w.value, message: w.message });
            showWorldStat(lvl);
            if (w.value === null || tenths < w.value) pendingWorld = { level: lvl, tenths };
        }
    }
    await wait(WIN_DELAY);
    if (state !== 'won') return;
    if (pendingWorld) openWorldPopup(); else winOverlay.classList.add('open');
}

function giveUp() {
    if (state !== 'paused') return;
    state = 'over'; gest = null; resumeAfterInfo = false; pendingWorld = null;
    g.status = 'over'; save();
    closeOverlays();
    setEnd('🏳️ Partie abandonnée', 'Solution', g.sol);
    fillEnd(g.level, 0, false);
    showEndNote('Partie abandonnée : aucun temps enregistré.');
    winOverlay.classList.add('open');
}

let _navigating = false;
const toMenu = () => { _navigating = true; save(); window.location.href = '../../index.html'; };

document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
        if (infoOpen()) closeInfo();
        else if (state === 'play') pauseGame();
        else if (state === 'paused') resumeGame();
    } else if (k === 'enter' && state === 'menu' && startOverlay.classList.contains('open') && !infoOpen()) startGame();
});

['touchmove', 'gesturestart'].forEach((ev) =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseGame(); save(); } });
// Ignore le blur declenche au chargement de la page (focus transitoire du navigateur)
let _blurReady = false;
window.addEventListener('load', () => { setTimeout(() => { _blurReady = true; }, 500); });
window.addEventListener('blur', () => { if (_blurReady) pauseGame(); });
window.addEventListener('pagehide', save);

function selectLevelUi() {
    document.querySelectorAll('#diffRow .diff-btn').forEach((o) => {
        const s = o.dataset.level === level;
        o.classList.toggle('selected', s); o.setAttribute('aria-pressed', s);
    });
}
document.querySelectorAll('#diffRow .diff-btn').forEach((b) => b.addEventListener('click', () => {
    level = b.dataset.level; data.level = level; saveData(store, data);
    selectLevelUi(); refreshBest();
}));
$('playBtn').addEventListener('click', startGame);
$('genRetryBtn').addEventListener('click', startGame);
$('genModeBtn').addEventListener('click', showReady);
$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', resumeGame);
$('restartBtn').addEventListener('click', restartGame);
abandonBtn.addEventListener('click', () => {
    if (abandonBtn.classList.contains('confirm')) { giveUp(); return; }
    abandonBtn.classList.add('confirm');
    abandonBtn.textContent = 'Confirmer l\'abandon ?';
    abandonTimer = setTimeout(resetAbandon, ABANDON_CONFIRM_MS);
});
$('menuPauseBtn').addEventListener('click', toMenu);
$('winAgainBtn').addEventListener('click', startGame);
$('winModeBtn').addEventListener('click', showReady);
$('winMenuBtn').addEventListener('click', toMenu);

// ─── Records ───
function openInfo(el) {
    if (state === 'play') { pauseGame(false); resumeAfterInfo = true; }
    el.classList.add('open');
}
function closeInfo() {
    rulesOverlay.classList.remove('open'); recordsOverlay.classList.remove('open');
    if (resumeAfterInfo) { resumeAfterInfo = false; resumeGame(); }
}
function fillRecords() {
    document.querySelectorAll('#recTabs .diff-btn').forEach((o) => {
        const s = o.dataset.level === recTab;
        o.classList.toggle('selected', s); o.setAttribute('aria-pressed', s);
    });
    $('recBest').textContent = data.best[recTab] ? formatTenths(data.best[recTab]) : '–';
    renderWorldCard($('recWorld'), data.world[recTab]);
}
$('rulesBtn').addEventListener('click', () => openInfo(rulesOverlay));
$('rulesClose').addEventListener('click', closeInfo);
$('recordsBtn').addEventListener('click', () => { recTab = level; fillRecords(); openInfo(recordsOverlay); fillWorldRecord(); });
$('recordsClose').addEventListener('click', closeInfo);
[rulesOverlay, recordsOverlay].forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) closeInfo(); }));
document.querySelectorAll('#recTabs .diff-btn').forEach((b) => b.addEventListener('click', () => { recTab = b.dataset.level; fillRecords(); fillWorldRecord(); }));

async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}
async function initOnline() {
    try {
        [fb, net] = await Promise.all([import('../../../js/firebaseWrk.js'), import('../../../js/network.js')]);
    } catch (e) { fb = net = null; console.warn('Mode hors ligne :', e); }
}
function setWorldCache(lvl, rec, sv = true) { data.world[lvl] = rec; if (sv) saveData(store, data); }
function renderWorldCard(valueEl, rec) {
    valueEl.textContent = rec ? formatTenths(rec.value) : '–';
    const card = valueEl.closest('.record-card');
    card.querySelectorAll('.rc-message').forEach((m) => m.remove());
    if (rec && rec.message) { const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${rec.message} »`; card.appendChild(m); }
}
function showWorldStat(lvl) { const w = data.world[lvl]; $('winWorld').textContent = w ? formatTenths(w.value) : '–'; }

async function fillWorldRecord() {
    const tab = recTab, status = $('recStatus');
    status.textContent = 'Synchronisation...';
    if (!fb || !(await isOnline())) { if (tab === recTab) status.textContent = 'Hors ligne (dernier record connu)'; return; }
    const r = await Promise.race([fetchWorld(fb, tab), wait(4000, null)]);
    if (tab !== recTab) return;
    if (!r || !r.ok) { status.textContent = 'Erreur de connexion'; return; }
    setWorldCache(tab, r.value === null ? null : { value: r.value, message: r.message });
    renderWorldCard($('recWorld'), data.world[tab]);
    status.textContent = 'À jour (Cloud)';
}

function openWorldPopup() {
    recordMsgInput.value = ''; $('recordCharCounter').textContent = `0/${MESSAGE_MAX}`;
    saveRecordBtn.disabled = false; saveRecordBtn.textContent = 'Sauvegarder';
    recordPopup.classList.add('open');
    setTimeout(() => recordMsgInput.focus(), 100);
}

async function saveWorldRecord() {
    if (!pendingWorld || saveRecordBtn.disabled) return;
    const p = pendingWorld;
    // Une seule fois, et seulement après une vraie victoire (couverture revérifiée).
    if (!g || g.sent || g.status !== 'won' || !isWon(g)) { pendingWorld = null; recordPopup.classList.remove('open'); winOverlay.classList.add('open'); return; }
    g.sent = true; save();
    saveRecordBtn.disabled = true; saveRecordBtn.textContent = 'Enregistrement...';
    const r = await Promise.race([submitWorld(fb, p.level, p.tenths, recordMsgInput.value), wait(6000, null)]);
    pendingWorld = null;
    recordPopup.classList.remove('open');
    if (r && r.written) {
        setWorldCache(p.level, { value: r.value, message: r.message });
        $('winRecord').textContent = '🌍 Record mondial !'; $('winRecord').hidden = false;
    } else if (r && r.beaten) {
        setWorldCache(p.level, { value: r.value, message: r.message });
        showEndNote('Un meilleur record mondial vient d\'être enregistré.');
    } else showEndNote('Record mondial non enregistré (connexion ?).');
    showWorldStat(p.level);
    if (state === 'won') winOverlay.classList.add('open');
}
saveRecordBtn.addEventListener('click', saveWorldRecord);
recordMsgInput.addEventListener('input', () => { $('recordCharCounter').textContent = `${recordMsgInput.value.length}/${MESSAGE_MAX}`; });
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

const resumeGameBtn = $('resumeGameBtn');
function resumeFromMenu() {
    if (!g) return;
    level = g.level;
    selectLevelUi();
    resumeGameBtn.hidden = true;
    closeOverlays();
    state = 'play';
    showBoard();
}
resumeGameBtn.addEventListener('click', resumeFromMenu);

selectLevelUi();
refreshBest();
initOnline();
const saved = store ? loadSaved() : null;
if (saved) {
    g = saved; level = g.level; selectLevelUi();
    // Afficher le bouton "Reprendre" dans le menu au lieu d'ouvrir le modal pause
    resumeGameBtn.hidden = false;
    state = 'paused';
    refreshBest();
}
requestAnimationFrame(loop);
