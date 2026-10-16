// ── CONFIG ──
const SIZES = [5, 6, 7];
const COLORS_COUNT = { 5: { easy: 4, medium: 5, hard: 6 }, 6: { easy: 5, medium: 6, hard: 7 }, 7: { easy: 6, medium: 7, hard: 8 } };
const MIN_LEN = { easy: 2, medium: 3, hard: 4 };
const NO_ADJ_ENDS = { easy: false, medium: false, hard: true };
const DIFF_LABEL = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' };
const PALETTE = ['#ff8fa8', '#ffb066', '#f2d34f', '#78d68a', '#4cc4d8', '#6f9cff', '#b490ff', '#d9a07a'];
const GEN_TRIES = 60, CUT_TRIES = 150, NEAR_RATIO = 0.15, WIN_DELAY = 800;
const CACHE_KEY = 'connected';
const FB_GAME = 'connected';
const fbKey = (n) => `relie_${n}x${n}`;

// ==GEN==
function rng(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
const adjacent = (a, b, n) => Math.abs(((a / n) | 0) - ((b / n) | 0)) + Math.abs(a % n - b % n) === 1;

function hamPath(n, rand) {
    const N = n * n, p = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) p.push(r * n + (r % 2 ? n - 1 - c : c));
    for (let it = 0; it < N * 20; it++) {
        if (rand() < .5) p.reverse();
        const e = p[N - 1], r = (e / n) | 0, c = e % n, nb = [];
        if (r > 0) nb.push(e - n); if (r < n - 1) nb.push(e + n);
        if (c > 0) nb.push(e - 1); if (c < n - 1) nb.push(e + 1);
        const j = p.indexOf(nb[(rand() * nb.length) | 0]);
        if (j >= N - 2) continue;
        p.push(...p.splice(j + 1).reverse());
    }
    return p;
}

function cutPath(p, k, L, noAdj, n, rand) {
    const N = p.length;
    if (k * L > N) return null;
    for (let t = 0; t < CUT_TRIES; t++) {
        const len = Array(k).fill(L);
        for (let i = N - k * L; i > 0; i--) len[(rand() * k) | 0]++;
        const segs = []; let s = 0, ok = true;
        for (const l of len) {
            const a = p[s], b = p[s + l - 1];
            if (noAdj && adjacent(a, b, n)) { ok = false; break; }
            segs.push([a, b]); s += l;
        }
        if (ok) return segs;
    }
    return null;
}

function generate(n, diff) {
    const k = COLORS_COUNT[n][diff];
    let seed = (Math.random() * 2147483647) | 0;
    for (let L = MIN_LEN[diff]; L >= 2; L--) {
        const noAdj = NO_ADJ_ENDS[diff] && L >= 3;
        for (let g = 0; g < GEN_TRIES; g++) {
            const rand = rng(seed++);
            const segs = cutPath(hamPath(n, rand), k, L, noAdj, n, rand);
            if (segs) {
                const cols = PALETTE.map((_, i) => i);
                for (let i = cols.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [cols[i], cols[j]] = [cols[j], cols[i]]; }
                return segs.map(([a, b], i) => ({ a, b, c: cols[i] }));
            }
        }
    }
    return null;
}
// ==/GEN==

// ── ÉTAT / DOM / CACHE ──
const $ = (id) => document.getElementById(id);
const grid = $('grid'), statusLine = $('statusLine');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay'), gameoverOverlay = $('gameoverOverlay');
const recordsOverlay = $('recordsOverlay'), recordMessagePopup = $('recordMessagePopup');
const recordMsgInput = $('recordMsgInput'), saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

let cache = loadCache();
let G = null, dots = [], cellEls = [], cellKeys = [], stroke = null;
let cfg = { n: 5, diff: 'medium', ...(cache.cfg || {}) };
if (!SIZES.includes(cfg.n) || !MIN_LEN[cfg.diff]) cfg = { n: 5, diff: 'medium' };
let runId = 0, pendingRecord = null, saveAcc = 0, lastT = performance.now();
let fb = null, net = null;

function loadCache() {
    try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
        return { best: {}, worldBest: {}, worldMsg: {}, ...c };
    } catch { return { best: {}, worldBest: {}, worldMsg: {} }; }
}
function saveCache(patch) {
    cache = { ...cache, ...patch };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* indisponible */ }
}
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
const overlayOpen = () => !!document.querySelector('.overlay.open') || recordMessagePopup.style.display === 'flex';

// ── FORMATS / RECORDS (outils) ──
const pad2 = (n) => String(n).padStart(2, '0');
function fmtDur(ms) {
    const t = Math.floor(ms / 100), s = Math.floor(t / 10);
    return `${Math.floor(s / 60)}:${pad2(s % 60)},${t % 10}`;
}
const fmtClock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };
const fmtRec = (ms) => ms > 0 ? fmtDur(ms) : '—';
const sizeLabel = (n) => `${n}×${n}`;
const isBetter = (a, b) => a > 0 && (!(b > 0) || a < b);
const parseRemote = (d) => d && typeof d === 'object' ? Number(d.value) || 0 : (typeof d === 'number' ? d : 0);
const bestOf = (n) => Number(cache.best[n]) || 0;
const worldOf = (n) => Number(cache.worldBest[n]) || 0;

// ── SAUVEGARDE DE PARTIE ──
function save() {
    if (!G || G.won) { saveCache({ game: null }); return; }
    saveCache({
        game: {
            n: G.n, diff: G.diff, pairs: G.pairs.map(q => [q.a, q.b, q.c]),
            paths: G.paths.map((P, p) => stroke && !stroke.tap && stroke.p === p ? stroke.backup : P),
            elapsed: Math.round(G.elapsed), started: G.started
        }
    });
}

function restore(g) {
    try {
        const n = g.n, N = n * n;
        if (!SIZES.includes(n) || !COLORS_COUNT[n][g.diff] || g.pairs.length !== COLORS_COUNT[n][g.diff] || g.paths.length !== g.pairs.length) return null;
        const dotSet = new Map();
        const ok = (v) => Number.isInteger(v) && v >= 0 && v < N;
        const pairs = g.pairs.map(([a, b, c], i) => {
            if (!ok(a) || !ok(b) || a === b || dotSet.has(a) || dotSet.has(b) || !Number.isInteger(c) || c < 0 || c >= PALETTE.length) throw 0;
            dotSet.set(a, i); dotSet.set(b, i);
            return { a, b, c };
        });
        const used = new Set();
        const paths = g.paths.map((P, i) => {
            if (!Array.isArray(P) || !P.length) return [];
            const q = pairs[i], last = P.length - 1;
            if (!((P[0] === q.a && P[last] === q.b) || (P[0] === q.b && P[last] === q.a))) throw 0;
            P.forEach((v, k) => {
                if (!ok(v) || used.has(v)) throw 0;
                if (dotSet.has(v) && k !== 0 && k !== last) throw 0;
                if (k > 0 && !adjacent(P[k - 1], v, n)) throw 0;
                used.add(v);
            });
            return P.slice();
        });
        return { n, diff: g.diff, pairs, paths, elapsed: Math.max(0, Number(g.elapsed) || 0), started: !!g.started, won: false };
    } catch { return null; }
}

// ── GRILLE ──
function mountGame(g) {
    G = g; stroke = null;
    dots = new Array(G.n * G.n).fill(-1);
    G.pairs.forEach((q, i) => { dots[q.a] = i; dots[q.b] = i; });
    grid.style.setProperty('--n', G.n);
    grid.innerHTML = ''; cellEls = []; cellKeys = [];
    for (let i = 0; i < G.n * G.n; i++) {
        const d = document.createElement('div');
        d.className = 'cell'; grid.appendChild(d); cellEls.push(d); cellKeys.push('');
    }
    grid.classList.remove('win');
    $('sizeVal').textContent = sizeLabel(G.n);
    $('diffVal').textContent = DIFF_LABEL[G.diff];
    renderBest(); renderTime(); render();
}

function newGame(n, diff) {
    closeOverlays();
    recordMessagePopup.style.display = 'none';
    runId++; pendingRecord = null;
    const segs = generate(n, diff);
    mountGame({ n, diff, pairs: segs, paths: segs.map(() => []), elapsed: 0, started: false, won: false });
    save();
}

const OPP = { u: 'd', d: 'u', l: 'r', r: 'l' };
function lists() { return G.paths.map((P, p) => stroke && !stroke.tap && stroke.p === p ? stroke.P : P); }

function render() {
    const n = G.n, N = n * n, own = new Array(N).fill(-1), dirs = new Array(N).fill('');
    lists().forEach((P, p) => {
        P.forEach((v, i) => {
            own[v] = p;
            if (i > 0) {
                const u = P[i - 1], d = v - u, ch = d === -n ? 'u' : d === n ? 'd' : d === -1 ? 'l' : 'r';
                dirs[u] += ch; dirs[v] += OPP[ch];
            }
        });
    });
    let filled = 0;
    for (let i = 0; i < N; i++) {
        if (own[i] >= 0) filled++;
        const key = own[i] + '|' + dots[i] + '|' + dirs[i];
        if (cellKeys[i] === key) continue;
        cellKeys[i] = key;
        const el = cellEls[i], pi = own[i] >= 0 ? own[i] : dots[i];
        el.className = 'cell' + (own[i] >= 0 ? ' o' : '') + (dots[i] >= 0 ? ' d' : '');
        if (pi >= 0) {
            el.style.setProperty('--c', PALETTE[G.pairs[pi].c]);
            el.innerHTML = '<b></b>' + dirs[i].split('').map(d => `<i class="${d}"></i>`).join('');
        } else { el.innerHTML = ''; }
    }
    const linked = G.paths.filter(P => P.length).length;
    setStatus(`${linked}/${G.pairs.length} reliées · ${N - filled} cases vides`);
}

function setStatus(t, cls = '') { statusLine.textContent = t; statusLine.className = 'status-line' + (cls ? ' ' + cls : ''); }
function renderTime() { $('timeValue').textContent = fmtClock(G ? G.elapsed : 0); }
function renderBest() { $('bestVal').textContent = G ? fmtRec(bestOf(G.n)) : '—'; }

// ── SAISIE ──
function cellAt(e) {
    const r = grid.getBoundingClientRect(), cs = getComputedStyle(grid), n = G.n;
    const pad = parseFloat(cs.paddingLeft) || 0, gap = parseFloat(cs.columnGap) || 0;
    const inner = r.width - 2 * grid.clientLeft - 2 * pad, pitch = (inner + gap) / n;
    const x = e.clientX - r.left - grid.clientLeft - pad, y = e.clientY - r.top - grid.clientTop - pad;
    const c = Math.floor(x / pitch), rr = Math.floor(y / pitch);
    if (c < 0 || rr < 0 || c >= n || rr >= n) return -1;
    return rr * n + c;
}

function ownerOf(c) { for (let p = 0; p < G.paths.length; p++) if (G.paths[p].includes(c)) return p; return -1; }

function stepTo(c) {
    const s = stroke, P = s.P, last = P[P.length - 1];
    if (c === last) return false;
    const k = P.indexOf(c);
    if (k >= 0) { P.length = k + 1; return true; }
    if (last === s.twin || !adjacent(last, c, G.n)) return false;
    if (dots[c] >= 0 && c !== s.twin) return false;
    if (dots[c] < 0 && s.occ[c] >= 0) return false;
    P.push(c); if (P.length > 1) s.moved = true;
    return true;
}

function advance(target) {
    const s = stroke, n = G.n;
    if (s.P.includes(target)) return stepTo(target);
    let changed = false;
    for (let g = 0; g < 2 * n; g++) {
        const last = s.P[s.P.length - 1];
        if (last === target) break;
        const dr = ((target / n) | 0) - ((last / n) | 0), dc = target % n - last % n;
        const v = dr ? last + Math.sign(dr) * n : -1, h = dc ? last + Math.sign(dc) : -1;
        let moved = false;
        for (const nx of (Math.abs(dr) >= Math.abs(dc) ? [v, h] : [h, v])) if (nx >= 0 && stepTo(nx)) { moved = true; break; }
        if (!moved) break;
        changed = true;
    }
    return changed;
}

grid.addEventListener('pointerdown', (e) => {
    if (!G || G.won || overlayOpen() || stroke) return;
    const c = cellAt(e);
    if (c < 0) return;
    if (dots[c] >= 0) {
        const p = dots[c], q = G.pairs[p];
        const occ = new Array(G.n * G.n).fill(-1);
        G.paths.forEach((P, i) => { if (i !== p) P.forEach(v => { occ[v] = i; }); });
        stroke = { p, P: [c], twin: c === q.a ? q.b : q.a, backup: G.paths[p], occ, moved: false };
        G.paths[p] = [];
        G.started = true;
    } else {
        const p = ownerOf(c);
        if (p < 0) return;
        stroke = { tap: true, p, c };
    }
    e.preventDefault();
    try { grid.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    render();
});

grid.addEventListener('pointermove', (e) => {
    if (!stroke || stroke.tap) return;
    const c = cellAt(e);
    if (c < 0) return;
    if (advance(c)) render();
});

function endStroke(e, cancelled) {
    if (!stroke) return;
    const s = stroke;
    stroke = null;
    if (s.tap) {
        if (!cancelled && cellAt(e) === s.c) { G.paths[s.p] = []; save(); }
    } else {
        const last = s.P[s.P.length - 1];
        if (!cancelled && last === s.twin) G.paths[s.p] = s.P.slice();
        else if (cancelled || s.moved) G.paths[s.p] = s.backup;
        save();
    }
    render();
    checkWin();
}
grid.addEventListener('pointerup', (e) => endStroke(e, false));
grid.addEventListener('pointercancel', (e) => endStroke(e, true));

$('clearBtn').addEventListener('click', () => {
    if (!G || G.won || stroke) return;
    G.paths = G.pairs.map(() => []);
    save(); render();
});
$('newBtn').addEventListener('click', () => newGame(G ? G.n : cfg.n, G ? G.diff : cfg.diff));

// ── VICTOIRE ──
function checkWin() {
    if (!G || G.won) return;
    const total = G.paths.reduce((s, P) => s + P.length, 0);
    if (G.paths.some(P => !P.length) || total !== G.n * G.n) return;
    G.won = true;
    save();
    grid.classList.add('win');
    setStatus('Grille résolue !', 'good');
    const my = runId, ms = Math.max(1, Math.round(G.elapsed)), n = G.n, diff = G.diff;
    setTimeout(() => { if (my === runId) showWin(ms, n, diff); }, WIN_DELAY);
}

function showWin(ms, n, diff) {
    const prev = bestOf(n);
    let emoji = '✅', title = 'Grille résolue !';
    if (!prev) { emoji = '🎉'; title = `Première victoire en ${sizeLabel(n)} !`; }
    else if (ms < prev) { emoji = '🏆'; title = 'Nouveau record !'; }
    else if (ms <= prev * (1 + NEAR_RATIO)) { emoji = '🔥'; title = `Presque ! à ${fmtDur(ms - prev)} du record`; }
    if (!prev || ms < prev) saveCache({ best: { ...cache.best, [n]: ms } });
    renderBest();
    $('goEmoji').textContent = emoji;
    $('goTitle').textContent = title;
    $('goTime').textContent = fmtDur(ms);
    $('goSize').textContent = sizeLabel(n);
    $('goBest').textContent = fmtRec(bestOf(n));
    $('goCfg').textContent = `${sizeLabel(n)} · ${DIFF_LABEL[diff]}`;
    setWorldStatus('');
    gameoverOverlay.classList.add('open');
    checkWorldRecord(ms, n, runId);
}

const setWorldStatus = (t) => { $('goWorldStatus').textContent = t; };

async function checkWorldRecord(ms, n, myRun) {
    setWorldStatus('Vérification du record mondial…');
    try {
        await Promise.race([onlineReady, wait(2500)]);
        if (myRun !== runId) return;
        const online = await Promise.race([isOnline(), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!online || !fb) { setWorldStatus('Hors ligne : record mondial indisponible. Tes records personnels restent sauvegardés.'); return; }
        const fresh = await Promise.race([refreshWorld(n), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!fresh) { setWorldStatus('Record mondial indisponible pour le moment.'); return; }
        if (isBetter(ms, worldOf(n))) {
            pendingRecord = { ms, n };
            $('goEmoji').textContent = '🏆';
            $('goTitle').textContent = 'Record mondial !';
            setWorldStatus(`🌍 Tu bats le record mondial en ${sizeLabel(n)} !`);
            recordMessagePopup.style.display = 'flex';
            recordMsgInput.value = ''; recordCharCounter.textContent = '0/50';
            setTimeout(() => recordMsgInput.focus(), 100);
        } else {
            setWorldStatus(`Record mondial ${sizeLabel(n)} : ${fmtRec(worldOf(n))}`);
        }
    } catch (e) {
        console.error('Firebase records error:', e);
        if (myRun === runId) setWorldStatus('Record mondial indisponible pour le moment.');
    }
}

// ── BOUCLE / ÉVÉNEMENTS GLOBAUX ──
function loop(now) {
    const dt = Math.min(now - lastT, 250);
    lastT = now;
    if (G && G.started && !G.won && !overlayOpen() && !document.hidden) {
        G.elapsed += dt; renderTime();
        if ((saveAcc += dt) >= 1000) { saveAcc = 0; save(); }
    }
    requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('pagehide', save);
['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

// ── RECORDS EN LIGNE ──
async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}
function setWorld(n, v, m) {
    saveCache({ worldBest: { ...cache.worldBest, [n]: v }, worldMsg: { ...cache.worldMsg, [n]: m } });
}
async function refreshWorld(n) {
    try {
        if (!fb || !(await isOnline())) return false;
        const data = await fb.getFirebaseRecordData(FB_GAME, fbKey(n));
        if (data == null) {
            if (worldOf(n) > 0) return false;
            setWorld(n, 0, ''); return true;
        }
        setWorld(n, parseRemote(data), (data && data.message) || '');
        return true;
    } catch (e) { console.error('Firebase records error:', e); return false; }
}
async function initOnline() {
    try {
        [fb, net] = await Promise.all([import('../../../js/firebaseWrk.js'), import('../../../js/network.js')]);
        await refreshWorld(G ? G.n : cfg.n);
    } catch (e) { console.warn('Mode hors ligne :', e); }
}

function renderRecords() {
    $('recPersonal').innerHTML = SIZES.map(n =>
        `<div class="record-card"><span class="rc-label">${sizeLabel(n)}</span><span class="rc-value">${fmtRec(bestOf(n))}</span></div>`).join('');
    $('recGlobal').innerHTML = SIZES.map(n =>
        `<div class="record-card global"><span class="rc-label">${sizeLabel(n)}</span><span class="rc-value">${fmtRec(worldOf(n))}</span>${cache.worldMsg[n] && worldOf(n) > 0 ? '<span class="rc-message"></span>' : ''}</div>`).join('');
    $('recGlobal').querySelectorAll('.record-card').forEach((card, i) => {
        const m = card.querySelector('.rc-message');
        if (m) m.textContent = `« ${cache.worldMsg[SIZES[i]]} »`;
    });
}

$('recordsBtn').addEventListener('click', async () => {
    recordsOverlay.classList.add('open');
    renderRecords();
    $('recStatus').textContent = 'Synchronisation...';
    try {
        if (fb && await isOnline()) {
            const res = await Promise.all(SIZES.map(refreshWorld));
            renderRecords();
            $('recStatus').textContent = res.every(Boolean) ? 'À jour (Cloud)' : 'Erreur de connexion';
        } else { $('recStatus').textContent = 'Hors ligne (Records locaux)'; }
    } catch (e) {
        console.error('Firebase records error:', e);
        $('recStatus').textContent = 'Erreur de connexion';
    }
});
$('recordsClose').addEventListener('click', () => recordsOverlay.classList.remove('open'));
recordsOverlay.addEventListener('click', (e) => { if (e.target === recordsOverlay) recordsOverlay.classList.remove('open'); });

saveRecordMsgBtn.addEventListener('click', async () => {
    if (!pendingRecord) return;
    const { ms, n } = pendingRecord;
    const message = recordMsgInput.value.trim().substring(0, 50);
    saveRecordMsgBtn.disabled = true; saveRecordMsgBtn.textContent = 'Enregistrement...';
    let published = false, beaten = false;
    try {
        if (fb) {
            const fresh = await Promise.race([refreshWorld(n), wait(2500, false)]);
            if (fresh && !isBetter(ms, worldOf(n))) beaten = true;
            else {
                const res = await Promise.race([
                    fb.setFirebaseLeaderboard(FB_GAME, fbKey(n), { value: ms, message, timestamp: Date.now() }),
                    wait(4000, false)
                ]);
                published = res === true;
            }
        }
    } catch (e) { console.error('Error saving record message:', e); }
    if (published) { setWorld(n, ms, message); setWorldStatus('🌍 Record mondial publié !'); }
    else if (beaten) setWorldStatus('Un autre joueur a battu ce record entre-temps.');
    else setWorldStatus('Record mondial non publié : connexion indisponible.');
    saveRecordMsgBtn.disabled = false; saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'none';
    pendingRecord = null;
});
recordMsgInput.addEventListener('input', () => { recordCharCounter.textContent = `${recordMsgInput.value.length}/50`; });

// ── MENUS / INIT ──
function closeOverlays() {
    [startOverlay, rulesOverlay, gameoverOverlay, recordsOverlay].forEach(o => o.classList.remove('open'));
}
function renderSeg() {
    document.querySelectorAll('#sizeSeg button').forEach(b => b.classList.toggle('on', Number(b.dataset.size) === cfg.n));
    document.querySelectorAll('#diffSeg button').forEach(b => b.classList.toggle('on', b.dataset.diff === cfg.diff));
}
function openStart() {
    if (G) cfg = { n: G.n, diff: G.diff };
    renderSeg();
    gameoverOverlay.classList.remove('open');
    startOverlay.classList.add('open');
}
document.querySelectorAll('#sizeSeg button').forEach(b => b.addEventListener('click', () => { cfg.n = Number(b.dataset.size); saveCache({ cfg }); renderSeg(); }));
document.querySelectorAll('#diffSeg button').forEach(b => b.addEventListener('click', () => { cfg.diff = b.dataset.diff; saveCache({ cfg }); renderSeg(); }));

$('playBtn').addEventListener('click', () => newGame(cfg.n, cfg.diff));
$('startRulesBtn').addEventListener('click', () => rulesOverlay.classList.add('open'));
$('rulesBtn').addEventListener('click', () => rulesOverlay.classList.add('open'));
$('rulesClose').addEventListener('click', () => rulesOverlay.classList.remove('open'));
rulesOverlay.addEventListener('click', (e) => { if (e.target === rulesOverlay) rulesOverlay.classList.remove('open'); });
startOverlay.addEventListener('click', (e) => { if (e.target === startOverlay && G && !G.won) startOverlay.classList.remove('open'); });
$('sizeChip').addEventListener('click', openStart);
$('diffChip').addEventListener('click', openStart);
$('goReplayBtn').addEventListener('click', () => newGame(G.n, G.diff));
$('goChangeBtn').addEventListener('click', openStart);
$('goMenuBtn').addEventListener('click', () => { window.location.href = '../../index.html'; });

renderSeg();
const saved = cache.game ? restore(cache.game) : null;
if (saved) { mountGame(saved); closeOverlays(); } else if (cache.game) saveCache({ game: null });
requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(loop); });
const onlineReady = initOnline();
