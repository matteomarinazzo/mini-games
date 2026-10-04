/**
 * Démineur — game.js
 * Solo : game.html?mode=solo&w=&h=&mines=&name=   |   Multi : game.html?room=CODE
 *
 * SYNCHRONISATION MULTI (sans transaction, 100 % déterministe)
 *  - rooms/minesweeper_<CODE>/board   : plateau ('0'/'1' par case), écrit UNE fois par le leader.
 *  - rooms/.../seats                  : {a:{uid,name}, b:{uid,name}} figé au lancement (a = coin haut-gauche, b = coin bas-droite).
 *  - rooms/.../reveals/<uid>/c<idx>   : horodatage serveur du moment où CE joueur a découvert la case.
 *    Chaque joueur n'écrit que dans son propre sous-arbre → aucun écrasement possible.
 *  - Propriétaire d'une case = le plus petit horodatage (égalité : siège a). Mine touchée = reveal d'une case minée ;
 *    la plus ancienne détermine le perdant. Les reveals postérieurs à la fin sont ignorés. Résultat, scores et
 *    propriétaires sont DÉRIVÉS des mêmes données par les deux clients → toujours identiques.
 */
import { database, auth, firebaseReady, getServerTimestamp, getRef, getOnValue, getUpdate } from "../../../js/config/firebase-config.js";
import { updateRoom, getRoom, deleteRoom } from "../../../js/firebaseWrk.js";

// Détecter si l'appareil est un mobile
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch-device');
}

const GAME_PREFIX = 'minesweeper_', SAVED_ROOM_KEY = 'minesweeper_room', NAME_KEY = 'minesweeper_playerName';
const HEARTBEAT_MS = 20000, OFFLINE_AFTER_MS = 75000, COUNTDOWN_MS = 3000;

const qs = new URLSearchParams(location.search);
const SOLO = qs.get('mode') === 'solo';
const code = (qs.get('room') || '').toUpperCase();
if (!SOLO && !code) location.replace('index.html');
if (SOLO) document.body.classList.add('solo');

// ── helpers ──
const $ = id => document.getElementById(id);
const t = (k, fb) => { try { const v = window.t?.(k, fb); return (v && v !== k) ? v : (fb ?? k); } catch (e) { return fb ?? k; } };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ts = () => { const f = getServerTimestamp(); return f ? f() : Date.now(); };
let serverOffset = 0;
const serverNow = () => Date.now() + serverOffset;
const gameId = () => `${GAME_PREFIX}${code}`;
const pad = n => String(n).padStart(2, '0');
const fmtTime = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
const tv = v => typeof v === 'number' ? v : serverNow();   // horodatage pas encore résolu → maintenant

const BOMB = '<svg viewBox="0 0 24 24"><circle cx="11" cy="14" r="7" fill="currentColor"/><path d="M11 7c0-2 2-3 3.5-4" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="3" r="1.6" fill="#ff9800"/></svg>';
const FLAG = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>';

// ── DOM ──
const grid = $('grid'), gameMain = $('gameMain');

// ── STATE ──
let myUID = SOLO ? 'solo' : null, mySeat = 0, myName = 'Soldat';
let room = null, G = null, D = null;
let roomUnsub = null, hbTimer = null, redirecting = false, takingLead = false, generating = false;
let flags = new Set(), flagMode = false, paused = false, pauseAt = 0;
let soloStart = 0, frozenMs = null;
let committedKey = null, pendingKey = null, resultTimer = null;
let cells = [], lastKey = [], builtFor = '';

// ═══ MOTEUR (pur) ═══
function neighbors(i, w, h) {
    const x = i % w, y = (i / w) | 0, r = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) r.push(ny * w + nx);
    }
    return r;
}
function computeNums(mines, w, h) {
    const n = new Uint8Array(w * h); let count = 0;
    for (let i = 0; i < n.length; i++) {
        if (mines[i] === '1') { count++; continue; }
        let c = 0; for (const k of neighbors(i, w, h)) if (mines[k] === '1') c++;
        n[i] = c;
    }
    return { nums: n, mineCount: count };
}
function genBoard(w, h, count, protectedSet) {
    const cand = []; for (let i = 0; i < w * h; i++) if (!protectedSet.has(i)) cand.push(i);
    const n = Math.min(count, cand.length), arr = new Array(w * h).fill('0');
    for (let k = 0; k < n; k++) { const j = k + Math.floor(Math.random() * (cand.length - k));[cand[k], cand[j]] = [cand[j], cand[k]]; arr[cand[k]] = '1'; }
    return arr.join('');
}
// Révélation en cascade depuis `start` (ignore cases déjà visibles / drapeaux)
function cascade(start, visible) {
    const { w, h, nums } = G, out = [start], seen = new Set([start]);
    if (nums[start] !== 0) return out;
    const st = [start];
    while (st.length) {
        const c = st.pop();
        for (const n of neighbors(c, w, h)) {
            if (seen.has(n) || visible(n) || flags.has(n)) continue;
            seen.add(n); out.push(n); if (nums[n] === 0) st.push(n);
        }
    }
    return out;
}
// Zone de départ équitable : les 2 coins s'étendent à tour de rôle (BFS alterné)
function initialClaims(w, h, mines, nums) {
    const owner = new Map(), q = [[0], [w * h - 1]], head = [0, 0];
    owner.set(0, 0); owner.set(w * h - 1, 1);
    let active = true;
    while (active) {
        active = false;
        for (let s = 0; s < 2; s++) {
            if (head[s] >= q[s].length) continue;
            active = true;
            const c = q[s][head[s]++];
            if (nums[c] !== 0) continue;
            for (const n of neighbors(c, w, h)) if (!owner.has(n) && mines[n] === '0') { owner.set(n, s); q[s].push(n); }
        }
    }
    return owner;
}

// Dérive l'état complet (propriétaires, scores, fin) depuis G
function derive() {
    const { w, h, total, mines, seats } = G, multi = seats.length > 1;
    const best = new Array(total).fill(null), vis = new Uint8Array(total), counts = [0, 0];
    if (!mines) return { best, vis, counts, hit: null, result: null, endT: Infinity };
    seats.forEach((s, si) => {
        const r = G.reveals[s.uid]; if (!r) return;
        for (const k in r) {
            const i = +k.slice(1); if (!(i >= 0 && i < total)) continue;
            const tt = tv(r[k]), c = best[i];
            if (!c || tt < c.t || (tt === c.t && si < c.s)) best[i] = { s: si, t: tt };
        }
    });
    let hit = null;
    for (let i = 0; i < total; i++) {
        const b = best[i];
        if (b && mines[i] === '1' && (!hit || b.t < hit.t || (b.t === hit.t && b.s < hit.s))) hit = { i, s: b.s, t: b.t };
    }
    const endT = hit ? hit.t : Infinity; let safeRev = 0;
    for (let i = 0; i < total; i++) {
        const b = best[i]; if (!b || b.t > endT) continue;
        if (mines[i] === '1') { vis[i] = 1; } else { vis[i] = 1; counts[b.s]++; safeRev++; }
    }
    const safeTotal = total - G.mineCount;
    let result = null;
    if (hit) result = { type: 'mine', loser: hit.s, winner: multi ? 1 - hit.s : -1, hit: hit.i };
    else if (safeRev >= safeTotal) result = { type: 'cleared', winner: multi ? (counts[0] > counts[1] ? 0 : counts[1] > counts[0] ? 1 : -1) : 0 };
    else if (multi && G.present) {
        const miss = seats.findIndex(s => !G.present[s.uid]);
        if (miss >= 0) result = { type: 'forfeit', loser: miss, winner: 1 - miss };
    }
    return { best, vis, counts, hit, result, endT };
}
const outcome = r => SOLO ? (r.type === 'cleared' ? 'win' : 'lose') : r.winner === -1 ? 'draw' : (r.winner === mySeat ? 'win' : 'lose');

// ═══ SON (WebAudio, aucun fichier) ═══
let sndOn = localStorage.getItem('minesweeper_sound') !== '0', ac = null;
function beep(f, d, type = 'square', v = .035) {
    if (!sndOn) return;
    try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.value = v;
        o.connect(g); g.connect(ac.destination); o.start(); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d); o.stop(ac.currentTime + d);
    } catch (e) { }
}
const sfx = { tick: () => beep(520, .06), flag: () => beep(300, .08, 'triangle'), boom: () => { beep(90, .5, 'sawtooth', .08); beep(60, .6, 'square', .06); }, win: () => { beep(523, .15); setTimeout(() => beep(659, .15), 140); setTimeout(() => beep(784, .3), 280); } };
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2500); }

// ═══ GRILLE (DOM) ═══
function buildGrid() {
    const sig = `${G.w}x${G.h}`; if (sig === builtFor) return; builtFor = sig;
    grid.innerHTML = ''; cells = []; lastKey = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < G.total; i++) { const c = document.createElement('div'); c.className = 'cell'; c.dataset.i = i; frag.appendChild(c); cells.push(c); }
    grid.appendChild(frag); grid.style.gridTemplateColumns = `repeat(${G.w}, var(--cs))`; fit();
}
function fit() {
    if (!G) return;
    const aw = gameMain.clientWidth - 28, ah = gameMain.clientHeight - 28;
    grid.style.setProperty('--cs', clamp(Math.floor(Math.min(aw / G.w, ah / G.h)) - 2, 22, 48) + 'px');
}
window.addEventListener('resize', fit);

function paint() {
    const { mines, nums } = G;
    for (let i = 0; i < G.total; i++) {
        let cls = 'cell', html = '';
        if (D.vis[i]) {
            flags.delete(i);
            const b = D.best[i];
            cls += ' r ' + (SOLO || b.s === mySeat ? 'own-me' : 'own-opp');
            if (mines[i] === '1') { cls += ' bomb' + (D.hit && D.hit.i === i ? ' hit' : ''); html = BOMB; }
            else if (nums[i]) { cls += ' n' + nums[i]; html = nums[i]; }
        } else if (D.result && mines && mines[i] === '1' && !flags.has(i)) { cls += ' r ghost bomb'; html = BOMB; }
        else if (flags.has(i)) { cls += ' flag'; html = FLAG; }
        const key = cls + '|' + html;
        if (key !== lastKey[i]) { lastKey[i] = key; cells[i].className = cls; cells[i].innerHTML = html; }
    }
}

// ═══ ACTIONS JOUEUR ═══
function started() {
    if (SOLO) return !paused;
    return !!(G && G.startAt && serverNow() >= G.startAt + COUNTDOWN_MS);
}
const canPlay = () => !!G && !!D && !D.result && started() && !redirecting && (SOLO || mySeat >= 0);

function tap(i) { flagMode ? toggleFlag(i) : reveal(i); }

function toggleFlag(i) {
    if (!canPlay() && !(SOLO && !G.mines && !paused)) return;
    if (D.vis[i]) return;
    flags.has(i) ? flags.delete(i) : flags.add(i); sfx.flag(); paint(); updateHUD();
}

function reveal(i) {
    if (SOLO && !G.mines && !D.result && !paused) {          // 1er clic solo : plateau généré maintenant, zone 3×3 sûre
        const prot = new Set([i, ...neighbors(i, G.w, G.h)]);
        G.mines = genBoard(G.w, G.h, G.mineCount, prot);
        Object.assign(G, computeNums(G.mines, G.w, G.h));
        soloStart = Date.now(); D = derive();
    }
    if (!canPlay()) return;
    const vis = n => !!D.vis[n];
    let list = [];
    if (D.vis[i]) {                                           // chord : clic sur un chiffre déjà ouvert
        if (!G.nums[i]) return;
        const nb = neighbors(i, G.w, G.h);
        if (nb.filter(n => flags.has(n)).length !== G.nums[i]) return;
        const set = new Set();
        for (const n of nb) if (!D.vis[n] && !flags.has(n)) (G.mines[n] === '1' ? [n] : cascade(n, vis)).forEach(x => set.add(x));
        list = [...set];
    } else {
        if (flags.has(i)) return;
        list = G.mines[i] === '1' ? [i] : cascade(i, vis);
    }
    if (!list.length) return;
    sfx.tick(); writeReveals(list);
}

function writeReveals(list) {
    if (SOLO) {
        const now = Date.now(), r = G.reveals.solo;
        list.forEach(i => { r['c' + i] = now; });
        render(); return;
    }
    const u = {}; list.forEach(i => { u[`reveals/${myUID}/c${i}`] = ts(); });
    // Le listener local reçoit immédiatement l'écriture (latence compensée) : pas de couche optimiste à part
    updateRoom(gameId(), u).then(ok => { if (!ok) toast(t('minesweeper.game.connection_lost', 'Connexion instable, réessayez.')); }).catch(() => toast(t('minesweeper.game.connection_lost', 'Connexion instable, réessayez.')));
}

// pointeur : clic, clic droit, appui long (mobile)
let lp = null, lpFired = false, lpXY = [0, 0], lastPtr = 'mouse';
const cellOf = e => e.target.closest?.('.cell');
grid.addEventListener('pointerdown', e => {
    lastPtr = e.pointerType; const c = cellOf(e); if (!c || e.button > 0) return;
    lpFired = false; lpXY = [e.clientX, e.clientY];
    if (e.pointerType !== 'mouse') lp = setTimeout(() => { lp = null; lpFired = true; navigator.vibrate?.(15); toggleFlag(+c.dataset.i); }, 420);
});
grid.addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lpXY[0], e.clientY - lpXY[1]) > 10) { clearTimeout(lp); lp = null; } });
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => grid.addEventListener(ev, () => { if (lp) { clearTimeout(lp); lp = null; } }));
grid.addEventListener('click', e => { if (lpFired) { lpFired = false; return; } const c = cellOf(e); if (c) tap(+c.dataset.i); });
grid.addEventListener('contextmenu', e => { e.preventDefault(); if (lastPtr !== 'mouse') return; const c = cellOf(e); if (c) toggleFlag(+c.dataset.i); });

function setFlagMode(on) { flagMode = on; $('optFlag').classList.toggle('active', on); $('optReveal').classList.toggle('active', !on); }
$('optReveal').onclick = () => setFlagMode(false); $('optFlag').onclick = () => setFlagMode(true);
document.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') setFlagMode(!flagMode); if (e.key === 'Escape') openPause(!($('pauseOverlay').style.display === 'flex')); });

// ═══ RENDU / HUD / RÉSULTAT ═══
function render() {
    if (!G) return;
    D = derive(); buildGrid(); paint(); updateHUD(); handleResult();
}

function updateHUD() {
    if (SOLO) {
        $('myName').textContent = myName; $('myScore').textContent = D ? D.counts[0] : 0;
    } else {
        const o = 1 - mySeat;
        $('myName').textContent = G.seats[mySeat]?.name || myName; $('myScore').textContent = D.counts[mySeat] || 0;
        $('oppName').textContent = G.seats[o]?.name || '—'; $('oppScore').textContent = D.counts[o] || 0;
        const p = room?.players?.[G.seats[o]?.uid];
        $('hudOpp').classList.toggle('offline', !!p && typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > OFFLINE_AFTER_MS);
    }
    $('minesLeft').textContent = G.mineCount - flags.size;
    $('hudStatus').textContent = D && D.result ? '' : !SOLO && !started() ? t('minesweeper.game.status_countdown', 'PRÊT') : t('minesweeper.game.status_playing', 'EN JEU');
}

const keyOf = r => `${r.type}:${r.winner}:${r.loser}`;
function handleResult() {
    if (!D.result) { if (committedKey) { committedKey = null; $('gameOverOverlay').style.display = 'none'; } frozenMs = null; pendingKey = null; return; }
    const k = keyOf(D.result);
    if (committedKey) { if (k !== committedKey) { committedKey = k; showEnd(false); } return; }
    if (pendingKey === k) return;
    pendingKey = k; clearTimeout(resultTimer);
    if (frozenMs === null) frozenMs = elapsed();          // fige le chrono au moment de la fin
    // Petite temporisation multi : laisse les horodatages serveur se résoudre avant d'afficher un verdict
    resultTimer = setTimeout(() => { if (!D || !D.result) { pendingKey = null; return; } committedKey = keyOf(D.result); showEnd(true); }, SOLO ? 350 : 700);
}

function showEnd(first) {
    const r = D.result, oc = outcome(r);
    if (frozenMs === null) frozenMs = elapsed();
    if (first) { oc === 'win' ? sfx.win() : (r.type === 'mine' ? sfx.boom() : 0); }
    const title = $('endTitle');
    title.className = oc;
    title.textContent = oc === 'win' ? t('minesweeper.game.result_win', 'VICTOIRE') : oc === 'draw' ? t('minesweeper.game.result_draw', 'ÉGALITÉ') : t('minesweeper.game.result_lose', 'DÉFAITE');
    let sub = '';
    if (r.type === 'cleared') sub = t('minesweeper.game.result_cleared', 'GRILLE NETTOYÉE !');
    else if (r.type === 'mine') sub = (SOLO || r.loser === mySeat) ? t('minesweeper.game.result_exploded', 'EXPLOSION !') : t('minesweeper.game.opp_exploded', "L'adversaire a sauté sur une mine !");
    else if (r.type === 'forfeit') sub = t('minesweeper.game.opp_left', "L'adversaire a quitté la partie.");
    $('endSub').textContent = sub;
    $('endMyScore').textContent = D.counts[SOLO ? 0 : mySeat]; $('endOppScore').textContent = D.counts[1 - mySeat] || 0;
    $('statOpp').style.display = SOLO ? 'none' : ''; $('endTime').textContent = fmtTime(frozenMs);
    // meilleur temps (solo)
    $('statBest').style.display = SOLO ? '' : 'none';
    if (SOLO) {
        const bk = `minesweeper_best_${G.w}x${G.h}x${G.mineCount}`; let best = Number(localStorage.getItem(bk)) || 0;
        if (oc === 'win' && first && (!best || frozenMs < best)) { best = frozenMs; localStorage.setItem(bk, best); }
        $('endBest').textContent = best ? fmtTime(best) : '—';
    }
    $('restartBtn').style.display = SOLO ? '' : 'none';
    const isLeader = !SOLO && room?.leaderId === myUID;
    $('rematchBtn').style.display = SOLO ? 'none' : '';
    $('rematchBtn').disabled = !isLeader;
    $('rematchNote').textContent = SOLO || isLeader ? '' : t('minesweeper.game.rematch_wait', 'En attente du créateur pour la revanche…');
    $('gameOverOverlay').style.display = 'flex'; $('countdownOverlay').style.display = 'none'; $('pauseOverlay').style.display = 'none';
}

// timer + compte à rebours
function elapsed() {
    if (SOLO) return soloStart ? (paused ? pauseAt : Date.now()) - soloStart : 0;
    return G && G.startAt ? serverNow() - G.startAt - COUNTDOWN_MS : 0;
}
setInterval(() => {
    if (!G) return;
    $('timerDisplay').textContent = fmtTime(frozenMs !== null ? frozenMs : elapsed());
    if (SOLO || (D && D.result) || !G.startAt) return;
    const rem = G.startAt + COUNTDOWN_MS - serverNow(), ov = $('countdownOverlay');
    if (rem > 0) { ov.style.display = 'flex'; const n = String(Math.ceil(rem / 1000)); if ($('countdownNumber').textContent !== n) { $('countdownNumber').textContent = n; sfx.tick(); } }
    else if (rem > -700) { ov.style.display = 'flex'; $('countdownNumber').textContent = t('minesweeper.game.countdown_go', 'FEU !'); updateHUD(); }
    else if (ov.style.display !== 'none') { ov.style.display = 'none'; updateHUD(); }
}, 200);

// ═══ PAUSE / MENU ═══
function openPause(open) {
    if (D && D.result) return;
    $('pauseOverlay').style.display = open ? 'flex' : 'none';
    if (SOLO) {
        if (open && !paused) { paused = true; pauseAt = Date.now(); }
        else if (!open && paused) { paused = false; if (soloStart) soloStart += Date.now() - pauseAt; }
    }
}
$('pauseBtn').onclick = () => openPause(true); $('resumeBtn').onclick = () => openPause(false);
$('restartPauseBtn').style.display = SOLO ? '' : 'none';
$('restartPauseBtn').onclick = () => { openPause(false); newSolo(); };
$('restartBtn').onclick = () => newSolo();
$('menuPauseBtn').onclick = $('menuBtn').onclick = () => goMenu();
const sndBtn = $('soundToggle'); sndBtn.classList.toggle('active', sndOn);
sndBtn.onclick = () => { sndOn = !sndOn; localStorage.setItem('minesweeper_sound', sndOn ? '1' : '0'); sndBtn.classList.toggle('active', sndOn); };

async function goMenu() {
    if (SOLO) { location.href = 'index.html'; return; }
    await leaveRoom(); location.href = 'index.html';
}

// ═══ SOLO ═══
function newSolo() {
    const w = clamp(parseInt(qs.get('w')) || 9, 5, 60), h = clamp(parseInt(qs.get('h')) || 9, 5, 60);
    const mines = clamp(parseInt(qs.get('mines')) || 10, 1, Math.min(Math.floor(w * h * .85), w * h - 9));
    myName = qs.get('name') || localStorage.getItem(NAME_KEY) || 'Soldat'; builtFor = '';
    flags = new Set(); soloStart = 0; frozenMs = null; paused = false; committedKey = pendingKey = null; clearTimeout(resultTimer);
    G = { w, h, total: w * h, mines: null, nums: null, mineCount: mines, seats: [{ uid: 'solo', name: myName }], reveals: { solo: {} } };
    $('gameOverOverlay').style.display = 'none'; $('timerDisplay').textContent = '00:00';
    render();
}

// ═══ MULTI : listener, plateau, leadership, présence ═══
const sortedPlayers = d => Object.entries(d.players || {}).sort((a, b) => ((a[1].joined || 0) - (b[1].joined || 0)) || a[0].localeCompare(b[0]));
const isOff = p => !!p && typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > OFFLINE_AFTER_MS;

function onSnap(d) {
    if (redirecting) return;
    if (!d) { toast(t('minesweeper.room.closed', 'La salle a été fermée.')); return bail(); }
    if (!d.players?.[myUID]) return bail();
    room = d;
    if (d.state === 'waiting') { redirecting = true; stopAll(); location.replace('index.html'); return; }   // revanche → salle d'attente
    if (d.state !== 'playing') return;
    maybeTakeLeadership(d);

    if (!d.board || !d.seats?.a || !d.seats?.b || !d.config) { $('waitingOverlay').style.display = 'flex'; maybeGenerate(); return; }
    mySeat = d.seats.a.uid === myUID ? 0 : d.seats.b.uid === myUID ? 1 : -1;
    if (mySeat < 0) return bail();
    const cfg = d.config, w = cfg.w, h = cfg.h;
    const same = G && G.mines === d.board && G.w === w;
    G = {
        w, h, total: w * h, mines: d.board, seats: [d.seats.a, d.seats.b], reveals: d.reveals || {}, startAt: typeof d.startedAt === 'number' ? d.startedAt : null, present: d.players,
        nums: same ? G.nums : null, mineCount: same ? G.mineCount : 0
    };
    if (!G.nums) Object.assign(G, computeNums(G.mines, w, h));
    if (!G.startAt) { $('waitingOverlay').style.display = 'flex'; return; }
    $('waitingOverlay').style.display = 'none';
    render();
}
function bail() { redirecting = true; stopAll(); try { localStorage.removeItem(SAVED_ROOM_KEY); } catch (e) { } location.replace('index.html'); }

// Génération UNIQUE du plateau, par le leader, en une seule écriture multi-chemins
async function maybeGenerate() {
    if (generating || !room || room.leaderId !== myUID) return;
    generating = true;
    try {
        const f = await getRoom(gameId());
        if (!f || f.state !== 'playing' || f.board || f.leaderId !== myUID || !f.seats?.a || !f.seats?.b || !f.config) return;
        const w = clamp(f.config.w | 0, 5, 60), h = clamp(f.config.h | 0, 5, 60), total = w * h;
        const count = clamp(f.config.mines | 0, 1, Math.min(Math.floor(total * .85), total - 12));
        const prot = new Set();
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x <= 1 && y <= 1) || (x >= w - 2 && y >= h - 2)) prot.add(y * w + x);
        const board = genBoard(w, h, count, prot), { nums } = computeNums(board, w, h);
        const claims = initialClaims(w, h, board, nums), u = { board, startedAt: ts() };
        claims.forEach((s, idx) => { u[`reveals/${s === 0 ? f.seats.a.uid : f.seats.b.uid}/c${idx}`] = 1; });   // horodatage 1 = zone de départ
        await updateRoom(gameId(), u);
    } catch (e) { console.error(e); } finally { generating = false; }
}

function maybeTakeLeadership(d) {
    if (takingLead || d.leaderId === myUID) return;
    const l = d.players?.[d.leaderId]; if (l && !isOff(l)) return;
    const c = sortedPlayers(d).find(([, p]) => !isOff(p)); if (!c || c[0] !== myUID) return;
    takingLead = true; updateRoom(gameId(), { leaderId: myUID }).catch(() => { }).finally(() => { takingLead = false; });
}
function beat() {
    if (SOLO || !myUID || redirecting) return;
    if (room && !room.players?.[myUID]) return;
    try { getUpdate()(getRef()(database, `rooms/${gameId()}/players/${myUID}`), { lastSeen: ts() }).catch(() => { }); } catch (e) { }
    if (room) { maybeTakeLeadership(room); if (G && D) updateHUD(); if (room.state === 'playing' && !room.board) maybeGenerate(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
function stopAll() { if (typeof roomUnsub === 'function') roomUnsub(); roomUnsub = null; if (hbTimer) clearInterval(hbTimer); hbTimer = null; }
window.addEventListener('beforeunload', stopAll);   // pas de retrait du joueur : reconnexion possible

async function leaveRoom() {
    redirecting = true; stopAll();
    try {
        const latest = await getRoom(gameId());
        if (latest) {
            const others = sortedPlayers(latest).filter(([uid]) => uid !== myUID);
            if (!others.length) await deleteRoom(gameId());
            else {
                const u = { [`players/${myUID}`]: null };
                if (latest.leaderId === myUID) u.leaderId = (others.find(([, p]) => !isOff(p)) || others[0])[0];
                await updateRoom(gameId(), u);
            }
        }
    } catch (e) { console.error(e); }
    try { localStorage.removeItem(SAVED_ROOM_KEY); } catch (e) { }
}

// Revanche : le leader remet la salle en « waiting » (tout le monde retourne à la salle d'attente)
$('rematchBtn').onclick = async () => {
    if (!room || room.leaderId !== myUID) return;
    $('rematchBtn').disabled = true;
    const ok = await updateRoom(gameId(), { state: 'waiting', board: null, reveals: null, startedAt: null, seats: null });
    if (!ok) { $('rematchBtn').disabled = false; toast(t('minesweeper.game.rematch_error', 'Impossible de lancer la revanche.')); }
};

function watchOffset() {
    return new Promise(res => {
        const to = setTimeout(res, 2500);
        try { getOnValue()(getRef()(database, '.info/serverTimeOffset'), s => { serverOffset = Number(s.val()) || 0; clearTimeout(to); res(); }); } catch (e) { res(); }
    });
}

// ═══ INIT ═══
(async function init() {
    try { if (window.initI18n) await window.initI18n(); window.refreshTexts?.(); } catch (e) { }
    if (SOLO) { $('waitingOverlay').style.display = 'none'; newSolo(); return; }
    const ready = await firebaseReady, user = ready ? auth.currentUser : null;
    if (!user) { toast('Firebase indisponible'); setTimeout(bail, 1500); return; }
    myUID = user.uid; myName = localStorage.getItem(NAME_KEY) || 'Soldat';
    await watchOffset();
    roomUnsub = getOnValue()(getRef()(database, `rooms/${gameId()}`), s => onSnap(s.val()), err => console.warn('listener room:', err));
    hbTimer = setInterval(beat, HEARTBEAT_MS); beat();
})();
