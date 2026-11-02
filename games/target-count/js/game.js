/**
 * Compte Cible – game.js
 * Point d'entrée : DOM, saisie (tap, glisser-déposer), chrono, pause, fin de partie, records.
 * Moteur (évaluation exacte + générateur) : core/engine.js ; stockage local + record mondial : core/records.js.
 * Stockage : UNE seule clé localStorage, « target-count ».
 */
import { MODES, MAX_T, SYM, generate, evalExpr, fmtTerm, fmtExpr } from './core/engine.js';
import { loadData, saveData, recordTime, MESSAGE_MAX, fetchWorld, submitWorld } from './core/records.js';

const ABANDON_CONFIRM_MS = 3000;
const WIN_DELAY = 500;
const ERR = {
    div: 'Division impossible : le résultat doit être entier (et le diviseur non nul).',
    root: 'Racine impossible : le résultat doit être entier.',
    neg: 'En mode Facile, un résultat intermédiaire ne peut pas être négatif.',
    big: 'Résultat trop grand.',
};

let state = 'ready';   // ready | running | paused | won | over
let level = 'easy', recTab = 'easy';
let puzzle = null, slots = null, sel = null;
let elapsed = 0, lastTime = 0, shownTime = '';
let resumeAfterInfo = false, abandonTimer = 0, msgTimer = 0;
let fb = null, net = null, pendingWorld = null;

const $ = (id) => document.getElementById(id);
const startOverlay = $('startOverlay'), pauseOverlay = $('pauseOverlay'), winOverlay = $('winOverlay');
const rulesOverlay = $('rulesOverlay'), recordsOverlay = $('recordsOverlay'), recordPopup = $('recordMessagePopup');
const recordMsgInput = $('recordMsgInput'), saveRecordBtn = $('saveRecordMsgBtn');
const abandonBtn = $('abandonBtn'), playEl = $('play'), eqEl = $('eq'), numTray = $('numTray'), opTray = $('opTray');

let store = null;
try { store = window.localStorage; } catch { store = null; }
const data = loadData(store);
level = recTab = data.level;

const formatTenths = (t) => `${Math.floor(t / 600)}:${String(Math.floor(t / 10) % 60).padStart(2, '0')}.${t % 10}`;
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

// ─── Fond étoilé ───
function buildStars() {
    for (let i = 0; i < 55; i++) {
        const s = document.createElement('div'); s.className = 'star';
        const size = Math.random() * 2.2 + .4;
        s.style.cssText = `width:${size}px;height:${size}px;top:${Math.random() * 55}%;left:${Math.random() * 100}%;` +
            `--op1:${(.3 + Math.random() * .6).toFixed(2)};--op2:${(Math.random() * .15).toFixed(2)};` +
            `--tw:${(2 + Math.random() * 4).toFixed(1)}s;animation-delay:${(Math.random() * 4).toFixed(1)}s;`;
        document.body.appendChild(s);
    }
}

// ─── Plateau ───
const newSlots = (n = MODES[level].count) => ({
    t: Array.from({ length: n }, () => ({ v: null, u: '' })),
    o: Array(n - 1).fill(null),
});

function setMsg(text, ok) {
    const el = $('msg');
    el.textContent = text || '';
    el.style.color = ok ? 'var(--ui-ok)' : '';
}

function buildTrays() {
    const m = MODES[level];
    numTray.innerHTML = puzzle.nums.map((n) => `<button class="chip" data-kind="num" data-val="${n}" draggable="true">${n}</button>`).join('');
    const un = { sq: 'x²', cu: 'x³', rt: '√' };
    opTray.innerHTML = m.ops.map((o) => `<button class="chip" data-kind="op" data-val="${o}" draggable="true">${SYM[o]}</button>`).join('') +
        m.un.map((u) => `<button class="chip un" data-kind="un" data-val="${u}" draggable="true">${un[u]}</button>`).join('');
    sel = null;
}

function renderEq() {
    let h = '';
    slots.t.forEach((t, i) => {
        const f = t.v !== null || t.u;
        h += `<button class="slot term${f ? ' filled' : ''}" data-k="t" data-i="${i}"${f ? ' draggable="true"' : ''} aria-label="Nombre ${i + 1}">` +
            (f ? `${fmtTerm(t, '·')}<i class="x">×</i>` : '') + '</button>';
        if (i < slots.o.length) {
            const o = slots.o[i];
            h += `<button class="slot op${o ? ' filled' : ''}" data-k="o" data-i="${i}"${o ? ' draggable="true"' : ''} aria-label="Opération ${i + 1}">` +
                (o ? `${SYM[o]}<i class="x">×</i>` : '') + '</button>';
        }
    });
    eqEl.innerHTML = h + `<span class="eq-target">= ${puzzle ? puzzle.target : '?'}</span>`;
    const used = new Set(slots.t.map((t) => t.v));
    numTray.querySelectorAll('.chip').forEach((c) => c.classList.toggle('used', used.has(+c.dataset.val)));
}

const slotEl = (k, i) => eqEl.querySelector(`.slot[data-k="${k}"][data-i="${i}"]`);

function flash(k, i) {
    const el = slotEl(k, i);
    if (!el) return;
    el.classList.add('bad');
    setTimeout(() => el.classList.remove('bad'), 400);
}

function place(kind, val, k, i, toggle) {
    const t = slots.t[i];
    if (kind === 'num' && k === 't') t.v = val;
    else if (kind === 'un' && k === 't') t.u = toggle && t.u === val ? '' : val;
    else if (kind === 'op' && k === 'o') slots.o[i] = val;
    else {
        flash(k, i);
        setMsg(kind === 'op' ? 'Les opérations + − × ÷ vont entre les nombres.' : 'Les nombres, x², x³ et √ vont sur les grandes cases.');
        return;
    }
    setMsg('');
    renderEq();
}

function clearSlot(k, i) {
    if (k === 't') slots.t[i] = { v: null, u: '' }; else slots.o[i] = null;
    renderEq();
}

function swapSlots(k, a, b) {
    const arr = k === 't' ? slots.t : slots.o;
    [arr[a], arr[b]] = [arr[b], arr[a]];
    renderEq();
}

function selectChip(chip) {
    const on = chip.classList.contains('sel');
    document.querySelectorAll('.chip.sel').forEach((c) => c.classList.remove('sel'));
    if (on) { sel = null; return; }
    chip.classList.add('sel');
    sel = { kind: chip.dataset.kind, val: chip.dataset.kind === 'num' ? +chip.dataset.val : chip.dataset.val };
}

playEl.addEventListener('click', (e) => {
    if (state !== 'running') return;
    const chip = e.target.closest('.chip');
    if (chip) { selectChip(chip); return; }
    const slot = e.target.closest('.slot');
    if (!slot) return;
    const k = slot.dataset.k, i = +slot.dataset.i;
    if (e.target.closest('.x') || !sel) { clearSlot(k, i); return; }
    place(sel.kind, sel.val, k, i, true);
});

// Glisser-déposer (souris) : chip → case, case ↔ case (même type), case → ailleurs = retirer
playEl.addEventListener('dragstart', (e) => {
    const c = e.target.closest && e.target.closest('.chip'), s = e.target.closest && e.target.closest('.slot');
    if (state !== 'running' || !(c || s)) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', c ? `c:${c.dataset.kind}:${c.dataset.val}` : `s:${s.dataset.k}:${s.dataset.i}`);
    e.dataTransfer.effectAllowed = 'copyMove';
});
playEl.addEventListener('dragover', (e) => {
    if (state !== 'running') return;
    e.preventDefault();
    eqEl.querySelectorAll('.slot.over').forEach((s) => s.classList.remove('over'));
    const s = e.target.closest('.slot');
    if (s) s.classList.add('over');
});
playEl.addEventListener('dragleave', (e) => { if (!playEl.contains(e.relatedTarget)) eqEl.querySelectorAll('.slot.over').forEach((s) => s.classList.remove('over')); });
playEl.addEventListener('drop', (e) => {
    e.preventDefault();
    eqEl.querySelectorAll('.slot.over').forEach((s) => s.classList.remove('over'));
    if (state !== 'running') return;
    const [src, a, b] = (e.dataTransfer.getData('text/plain') || '').split(':');
    const dst = e.target.closest('.slot');
    if (src === 'c' && dst) place(a, a === 'num' ? +b : b, dst.dataset.k, +dst.dataset.i, false);
    else if (src === 's') {
        if (!dst) clearSlot(a, +b);
        else if (dst.dataset.k === a && +dst.dataset.i !== +b) swapSlots(a, +b, +dst.dataset.i);
    }
});

$('moreBtn').addEventListener('click', () => {
    if (state !== 'running' || slots.t.length >= MAX_T) return;
    slots.t.push({ v: null, u: '' }); slots.o.push(null); renderEq();
});
$('lessBtn').addEventListener('click', () => {
    if (state !== 'running' || slots.t.length <= MODES[level].count) return;
    slots.t.pop(); slots.o.pop(); renderEq();
});
$('clearBtn').addEventListener('click', () => { if (state === 'running') { slots = newSlots(slots.t.length); setMsg(''); renderEq(); } });

function fail(text) {
    setMsg(text);
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => setMsg(''), 5000);
}

function submit() {
    if (state !== 'running') return;
    const emptyT = slots.t.findIndex((t) => t.v === null), emptyO = slots.o.findIndex((o) => !o);
    if (emptyT >= 0 || emptyO >= 0) {
        if (emptyT >= 0) flash('t', emptyT); else flash('o', emptyO);
        fail('Remplis toutes les cases.');
        return;
    }
    const used = new Set(slots.t.map((t) => t.v)), miss = puzzle.nums.filter((n) => !used.has(n));
    if (miss.length) { fail(`Utilise aussi : ${miss.join(', ')}.`); return; }
    const r = evalExpr(slots, MODES[level].neg);
    if (typeof r === 'string') { fail(ERR[r]); return; }
    if (r !== puzzle.target) { fail(`Ton expression donne ${r}, la cible est ${puzzle.target}.`); return; }
    win();
}
$('checkBtn').addEventListener('click', submit);

// ─── Flux de jeu ───
const infoOpen = () => rulesOverlay.classList.contains('open') || recordsOverlay.classList.contains('open');

function closeOverlays() {
    [startOverlay, pauseOverlay, winOverlay, rulesOverlay, recordsOverlay, recordPopup].forEach((o) => o.classList.remove('open'));
    resetAbandon();
}

function updateTime(force) {
    const s = formatTenths(Math.floor(elapsed * 10));
    if (force || s !== shownTime) { shownTime = s; $('timeValue').textContent = s; }
}

function refreshBest() {
    $('bestVal').textContent = data.best[level] ? formatTenths(data.best[level]) : '–';
    $('modeVal').textContent = MODES[level].label;
}

function selectLevelUi() {
    document.querySelectorAll('#diffRow .diff-btn').forEach((o) => {
        const s = o.dataset.level === level;
        o.classList.toggle('selected', s); o.setAttribute('aria-pressed', s);
    });
}

function startGame() {
    closeOverlays();
    resumeAfterInfo = false; pendingWorld = null;
    puzzle = generate(level);
    slots = newSlots();
    buildTrays(); renderEq(); setMsg('');
    playEl.classList.remove('hidden');
    elapsed = 0; updateTime(true); refreshBest();
    state = 'running';
    lastTime = performance.now();
}

function showReady() {
    closeOverlays();
    resumeAfterInfo = false; pendingWorld = null;
    state = 'ready';
    playEl.classList.add('hidden');
    selectLevelUi(); refreshBest();
    startOverlay.classList.add('open');
}

function pauseGame(openModal = true) {
    if (state !== 'running') return;
    state = 'paused';
    if (openModal) { resetAbandon(); pauseOverlay.classList.add('open'); }
}

function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    resumeAfterInfo = false;
    state = 'running';
    lastTime = performance.now();
}

function resetAbandon() {
    clearTimeout(abandonTimer);
    abandonBtn.classList.remove('confirm');
    abandonBtn.textContent = 'Abandonner';
}

function fillEnd(lvl, tenths, won) {
    $('rowTime').hidden = !won;
    if (won) $('winTime').textContent = formatTenths(tenths);
    $('winRecTime').textContent = data.best[lvl] ? formatTenths(data.best[lvl]) : '–';
    $('winMode').textContent = MODES[lvl].label;
    $('winRecord').hidden = true;
    $('winNote').hidden = true;
    showWorldStat(lvl);
}

function setEnd(title, label, expr) {
    $('winTitle').textContent = title;
    $('winExprLabel').textContent = label;
    $('winExpr').textContent = expr;
}

function showEndNote(text) { $('winNote').textContent = text; $('winNote').hidden = false; }

async function win() {
    state = 'won'; sel = null;
    const lvl = level, tenths = Math.max(1, Math.floor(elapsed * 10));
    const { isRecord } = recordTime(data, lvl, tenths);
    if (isRecord) saveData(store, data);
    refreshBest();
    setEnd('🎯 Cible atteinte !', 'Ton expression', fmtExpr(slots, puzzle.target));
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
    state = 'over'; sel = null;
    resumeAfterInfo = false; pendingWorld = null;
    pauseOverlay.classList.remove('open');
    resetAbandon();
    setEnd('🏳️ Partie abandonnée', 'Solution', fmtExpr(puzzle.sol, puzzle.target));
    fillEnd(level, 0, false);
    showEndNote('Partie abandonnée : aucun temps enregistré.');
    winOverlay.classList.add('open');
}

const toMenu = () => { window.location.href = '../../index.html'; };

document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
        if (infoOpen()) closeInfo();
        else if (state === 'running') pauseGame();
        else if (state === 'paused') resumeGame();
    } else if (k === 'enter') {
        if (state === 'ready' && startOverlay.classList.contains('open') && !infoOpen()) startGame();
        else if (state === 'running' && !(e.target.closest && e.target.closest('button'))) submit();
    }
});

// Aucun défilement / zoom de page pendant les gestes tactiles (sauf modales et plateau)
['touchmove', 'gesturestart'].forEach((ev) =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal, .play')) e.preventDefault(); }, { passive: false }));

document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', () => pauseGame());

document.querySelectorAll('#diffRow .diff-btn').forEach((b) => b.addEventListener('click', () => {
    level = b.dataset.level;
    data.level = level; saveData(store, data);
    selectLevelUi(); refreshBest();
}));
$('playBtn').addEventListener('click', startGame);
$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', resumeGame);
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

// ─── Règles / records ───
function openInfo(el) {
    if (state === 'running') { pauseGame(false); resumeAfterInfo = true; }
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
$('recordsBtn').addEventListener('click', () => { recTab = level; fillRecords(); openInfo(recordsOverlay); fillWorldRecord(); });
$('rulesClose').addEventListener('click', closeInfo);
$('recordsClose').addEventListener('click', closeInfo);
[rulesOverlay, recordsOverlay].forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) closeInfo(); }));
document.querySelectorAll('#recTabs .diff-btn').forEach((b) => b.addEventListener('click', () => {
    recTab = b.dataset.level; fillRecords(); fillWorldRecord();
}));

// ─── Record mondial (Firebase du site ; hors ligne toléré) ───
async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}

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

function renderWorldCard(valueEl, rec) {
    valueEl.textContent = rec ? formatTenths(rec.value) : '–';
    const card = valueEl.closest('.record-card');
    card.querySelectorAll('.rc-message').forEach((m) => m.remove());
    if (rec && rec.message) {
        const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${rec.message} »`; card.appendChild(m);
    }
}

function showWorldStat(lvl) {
    const w = data.world[lvl];
    $('winWorld').textContent = w ? formatTenths(w.value) : '–';
}

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
function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, .25);
    lastTime = now;
    if (state === 'running') { elapsed += dt; updateTime(false); }
    requestAnimationFrame(loop);
}

buildStars();
selectLevelUi();
refreshBest();
initOnline();
lastTime = performance.now();
requestAnimationFrame(loop);
