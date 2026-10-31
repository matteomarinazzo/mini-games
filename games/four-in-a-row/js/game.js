import { MODES, LEVELS } from './core/modes.js';
import { drop, winLine } from './core/board.js';
import { choose } from './core/ai.js';
import * as S from './core/store.js';
import { scoreEl } from './core/ui.js';
import { cleanName } from './core/sync.js';

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const M = MODES[q.get('mode')] || MODES.four;
const OPP = ['cpu', 'online'].includes(q.get('opp')) ? q.get('opp') : '2p';
const ROOM = q.get('room') || '', ONLINE = OPP === 'online', RK = 'four-in-a-row_room', HB = 10000, STALE = 25000;
let g, net, uid, seat = 0, peerUid, seq = 0, rm = 0, lastAct = 0, lastPub, netReady = !ONLINE, connected = true, awaiting = 0, paused = 0;
let aiT = 0, endT = 0, peerLeft = 0, roomGone = 0, peerV, peerAt = 0, peerOff = 0, fatalShown = 0, actId = 0, down = 0, awT = 0;
const unsubs = [], timers = [];
const me = () => (ONLINE ? seat : 0), peerName = () => g.names[1 - me()], sleep = ms => new Promise(r => setTimeout(r, ms));
const canPlay = () => g && !g.over && !paused && !fatalShown && (OPP === 'cpu' ? g.cur === 0 : OPP === '2p' || (netReady && g.cur === seat && !awaiting));

/* ---------- Plateau ---------- */
function build() {
  $('wrap').style.setProperty('--cols', M.cols); $('wrap').style.setProperty('--rows', M.rows);
  const b = $('board'); b.textContent = '';
  for (let c = 0; c < M.cols; c++) {
    const col = document.createElement('div'); col.className = 'col';
    for (let r = M.rows - 1; r >= 0; r--) { const k = document.createElement('i'); k.className = 'k'; k.id = 'k' + (r * M.cols + c); col.appendChild(k); }
    b.appendChild(col);
  }
}
let winT = 0;
const fallMs = i => (140 + 40 * (M.rows - Math.floor(i / M.cols))) / 0.55;   // durée totale chute + rebonds (= CSS)
function paint(newI = -1) {
  clearTimeout(winT);
  const L = g.over && !g.left && g.w !== null && g.w < 2 ? winLine(g.grid, M) : null;
  for (let i = 0; i < g.grid.length; i++) {
    const k = $('k' + i), v = g.grid[i];
    if (k.dataset.v !== String(v)) {
      k.dataset.v = v; k.className = 'k' + (v ? ' p' + (v - 1) : ''); k.style.removeProperty('--d');
      if (i === newI) {                       // rebonds proportionnels à la hauteur de chute
        const d = M.rows - Math.floor(i / M.cols), b = Math.min(.26, .03 + .04 * d);
        k.style.setProperty('--d', d); k.style.setProperty('--b1', b); k.style.setProperty('--b2', b * .4); k.classList.add('drop');
      }
    }
  }
  const mark = () => { for (let i = 0; i < g.grid.length; i++) $('k' + i).classList.toggle('win', !!L && L.includes(i)); };
  if (newI >= 0 && L) winT = setTimeout(mark, fallMs(newI)); else mark();     // les pions gagnants s'allument une fois le dernier pion posé
}
function hud() {
  const m = me();
  for (const i of [0, 1]) { const e = $('p' + i); e.firstElementChild.textContent = g.names[i] + (ONLINE && i === m ? ' (toi)' : ''); e.classList.toggle('on', !g.over && g.cur === i); }
  const t = $('turn'); t.dataset.p = g.cur;
  t.textContent = g.over ? 'Partie terminée' : OPP === 'cpu' && g.cur === 1 ? `${g.names[1]} réfléchit…` : ONLINE && g.cur === seat ? 'À toi de jouer' : `Tour de ${g.names[g.cur]}`;
  if (!canPlay()) $('ghost').hidden = true;
  renderWarn();
}
function ghost(c) {
  const gh = $('ghost');
  if (c < 0 || !canPlay() || drop(g.grid, M, c) < 0) { gh.hidden = true; return; }
  gh.style.setProperty('--g', c); gh.className = 'p' + g.cur; gh.hidden = false;
}
const colAt = e => { const r = $('board').getBoundingClientRect(), x = e.clientX - r.left; return x < 0 || x >= r.width ? -1 : Math.floor(x / r.width * M.cols); };
const wrap = $('wrap');
wrap.addEventListener('pointerdown', e => { down = 1; ghost(colAt(e)); });
wrap.addEventListener('pointermove', e => ghost(colAt(e)));
wrap.addEventListener('pointerleave', () => ghost(-1));
wrap.addEventListener('pointercancel', () => { down = 0; ghost(-1); });
wrap.addEventListener('pointerup', e => { const c = colAt(e), d = down; down = 0; ghost(-1); if (d && c >= 0) play(c); });

/* ---------- Coups ---------- */
const nextId = () => (actId = Math.max(actId + 1, Date.now()));
function play(c) {
  if (!canPlay() || drop(g.grid, M, c) < 0) return;
  if (ONLINE && seat === 1) { awaiting = 1; clearTimeout(awT); awT = setTimeout(() => { awaiting = 0; hud(); }, 4000); net.act(ROOM, uid, { id: nextId(), type: 'move', c }); return; }
  apply(c);
}
function apply(c) {                       // autorité : local ou hôte
  const r = drop(g.grid, M, c), i = r * M.cols + c, p = g.cur;
  g.grid[i] = p + 1;
  if (winLine(g.grid, M)) { g.over = 1; g.w = p; g.next = p; }
  else if (!g.grid.includes(0)) { g.over = 1; g.w = 2; g.next = 1 - g.start; }
  else g.cur = 1 - p;
  if (g.over) { g.endOpen = 1; record(); }
  persist(); paint(i); hud(); renderRm();
  if (g.over) showEnd(fallMs(i) + 800); else aiKick();
}
function newRound() {
  g.rd++; g.start = g.next ?? 0; g.cur = g.start; g.grid.fill(0); g.over = 0; g.w = null; g.next = null; g.counted = 0; g.endOpen = 0; g.left = 0; rm = 0;
  hideEnd(); persist(); paint(); hud(); renderRm(); aiKick();
}
function aiKick() {
  if (OPP !== 'cpu' || g.over || g.cur !== 1 || paused || aiT) return;
  aiT = setTimeout(() => { aiT = 0; if (!paused && !g.over && g.cur === 1) apply(choose(g.grid, M, 2, g.level)); }, 450);
}
const persist = () => (ONLINE ? pub() : S.saveGame(g));

/* ---------- Stats : une seule fois par manche finie ---------- */
function record() {
  if (g.left) return;
  const m = me(), P = { uid: g.uids[m], name: g.names[m] }, Q = { uid: g.uids[1 - m], name: g.names[1 - m] }, w = g.w, key = ROOM + ':' + g.rd;
  if (ONLINE ? S.stats().done === key : g.counted) return;
  if (OPP === 'cpu') S.recAI(M.id, g.level, w === 2 ? 'd' : w === 0 ? 'w' : 'l');
  else S.recPair(M.id, ONLINE ? 'online' : 'local', P, Q, w === 2 ? -1 : w === m ? 0 : 1);
  if (ONLINE) S.setDone(key); else g.counted = 1;
}

/* ---------- Fin de manche ---------- */
function renderEnd() {
  const m = me(), w = g.w, P = { uid: g.uids[m], name: g.names[m] }, Q = { uid: g.uids[1 - m], name: g.names[1 - m] };
  $('endTitle').textContent = g.left ? `${peerName()} a quitté la partie` : w === 2 ? 'Égalité'
    : OPP === 'cpu' ? (w === 0 ? 'Tu as gagné !' : `${g.names[1]} a gagné`) : ONLINE && w === m ? 'Tu as gagné !' : `${g.names[w]} a gagné`;
  let f, a, b;
  if (OPP === 'cpu') { f = S.aiRec(M.id, g.level); a = 'Toi'; b = LEVELS[g.level]; }
  else { f = S.faceOff(M.id, ONLINE ? 'online' : 'local', P, Q); a = g.names[m]; b = g.names[1 - m]; }
  const box = $('endScore'); box.textContent = ''; box.appendChild(scoreEl(f.w, f.l));
  $('endLbl').textContent = `${a} – ${b}`; $('endDraws').textContent = 'Égalités : ' + f.d;
}
function showEnd(ms) { clearTimeout(endT); endT = setTimeout(() => { if (!g.over) return; renderEnd(); renderRm(); $('endOv').hidden = false; }, ms); }
function hideEnd() { clearTimeout(endT); $('endOv').hidden = true; }
function renderRm() {
  const t = $('endRm'), b = $('endRestart');
  if (!ONLINE || !g?.over) { t.textContent = ''; b.disabled = false; return; }
  const mine = seat ? 2 : 1, theirs = seat ? 1 : 2; let s = '', dis = false;
  if (g.left || peerLeft) { s = `${peerName()} a quitté le salon.`; dis = true; }
  else if (roomGone) { s = 'Le salon est fermé.'; dis = true; }
  else if (rm & mine) { s = `En attente de ${peerName()}…`; dis = true; }
  else if (rm & theirs) s = `${peerName()} veut rejouer.`;
  t.textContent = s; b.disabled = dis || !netReady;
}
$('endRestart').addEventListener('click', () => {
  if (!ONLINE) return newRound();
  if (!g.over || !netReady || roomGone || peerLeft || g.left) return;
  if (seat === 0) { rm |= 1; pub(); tryRematch(); } else { rm |= 2; net.act(ROOM, uid, { id: nextId(), type: 'rematch', rd: g.rd }); }
  renderRm();
});
function tryRematch() {
  if (seat !== 0 || !g.over || rm !== 3 || peerLeft || g.left || roomGone) return;
  net.setPlaying(ROOM); newRound();
}

/* ---------- Pause, règles, sortie ---------- */
if (ONLINE) $('pauseBtn').hidden = true;      // pas de pause en ligne (l'adversaire continue)
$('pauseBtn').addEventListener('click', () => { paused = 1; clearTimeout(aiT); aiT = 0; $('pauseOv').hidden = false; hud(); });
$('resumeBtn').addEventListener('click', () => { paused = 0; $('pauseOv').hidden = true; hud(); aiKick(); });
$('rulesBtn').addEventListener('click', () => $('rulesOv').hidden = false);
$('rulesClose').addEventListener('click', () => $('rulesOv').hidden = true);
$('rulesBody').innerHTML = `<ul><li>Grille ${M.cols}×${M.rows} : le pion tombe sur la case libre la plus basse de la colonne choisie.</li><li>Aligne ${M.n} pions (ligne, colonne ou diagonale) pour gagner. Grille pleine sans alignement : égalité.</li><li>Rouge = joueur 1, jaune = joueur 2. Le gagnant d'une manche commence la suivante ; après une égalité, celui qui n'avait pas commencé.</li></ul>`;
$('hudMode').textContent = `${M.label} · ${M.cols}×${M.rows}`;
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href="./index.html"]'); if (!a) return;
  if (ONLINE && net && !fatalShown) { e.preventDefault(); if (!g || g.over) leave(); else $('leaveOv').hidden = false; }
  else if (!ONLINE && g?.over) { g.endOpen = 0; S.saveGame(g); }
});
$('leaveYes').addEventListener('click', () => leave());
$('leaveNo').addEventListener('click', () => { $('leaveOv').hidden = true; });

/* ---------- En ligne : l'hôte (joueur 1, rouge) est autoritaire, l'invité envoie ses intentions ---------- */
const enc = () => [g.grid.join(''), g.cur, g.start, g.next ?? -1, g.over, g.w ?? -1, g.left].join('|');
function pub() {
  if (!ONLINE || seat !== 0 || !net) return;
  seq++; lastPub = net.publish(ROOM, { seq, snap: enc(), msg: '', rd: g.rd, rm, ai: lastAct });
}
function dec(d) {
  if (!d || !Number.isSafeInteger(d.seq) || typeof d.snap !== 'string') return null;
  const p = d.snap.split('|'); if (p.length !== 7 || p[0].length !== M.cols * M.rows || !/^[012]+$/.test(p[0])) return null;
  return { grid: Array.from(p[0], Number), cur: +p[1] & 1, start: +p[2] & 1, next: +p[3] < 0 ? null : +p[3] & 1, over: +p[4] ? 1 : 0, w: +p[5] < 0 ? null : +p[5], left: +p[6] ? 1 : 0 };
}
function onDoc(d) {                        // invité : état validé par l'hôte
  const s = dec(d); if (!s || d.seq <= seq) return;
  seq = d.seq; awaiting = 0; netReady = true;
  const old = g.grid, diff = s.grid.reduce((n, v, i) => n + (v !== old[i] ? 1 : 0), 0), ni = diff === 1 ? s.grid.findIndex((v, i) => v !== old[i]) : -1;
  const was = g.over; Object.assign(g, s, { rd: d.rd | 0 }); rm = d.rm | 0;
  if (!g.over) hideEnd();
  paint(ni >= 0 && old[ni] === 0 ? ni : -1); hud();
  if (g.over && !was) { record(); showEnd(g.left ? 0 : (ni >= 0 ? fallMs(ni) : 0) + 800); } else if (g.over && !$('endOv').hidden) renderEnd();
  renderRm();
}
function onAct(v) {                        // hôte : intention de l'invité (une seule fois, bon joueur, colonne légale, partie non terminée)
  if (!v || !Number.isSafeInteger(v.id) || v.id <= lastAct || !g) return;
  lastAct = v.id;
  if (v.type === 'rematch') { if (g.over && !g.left && v.rd === g.rd) { rm |= 2; pub(); renderRm(); tryRematch(); } return; }
  if (v.type !== 'move' || g.over || g.cur !== 1 || !Number.isInteger(v.c) || v.c < 0 || v.c >= M.cols || drop(g.grid, M, v.c) < 0) return;
  apply(v.c);
}
function renderWarn() {
  if (fatalShown) return;
  let t = '';
  if (ONLINE) {
    if (!netReady) t = 'En attente de l\'état de la partie…';
    else if (!connected) t = 'Connexion perdue : reconnexion en cours…';
    else if (peerOff && !g.left) t = `${peerName()} semble déconnecté.`;
  }
  const w = $('warn'); w.textContent = t; w.hidden = !t;
}
function fatal(e) {
  fatalShown = 1; unsubs.splice(0).forEach(u => { try { u(); } catch { } }); timers.splice(0).forEach(clearInterval);
  if (e?.gone) try { localStorage.removeItem(RK); } catch { }
  $('netMsg').textContent = e?.message || 'Erreur de connexion.'; $('netOv').hidden = false; $('warn').hidden = true;
}
function startNet(room) {
  const base = `rooms/${net.idOf(ROOM)}`, P = `${base}/players/${peerUid}`;
  net.setErrorHandler(e => { $('warn').textContent = 'Écriture refusée (' + (e?.code || e?.message || 'erreur') + ').'; $('warn').hidden = false; });
  peerAt = performance.now();
  unsubs.push(net.watch('.info/connected', v => { connected = v === true; renderWarn(); }));
  unsubs.push(net.watch(`${P}/lastSeen`, v => { if (v !== peerV) { peerV = v; peerAt = performance.now(); } }));
  net.beat(ROOM, uid);
  if (seat === 1) net.markLeft(ROOM, uid, false);
  timers.push(setInterval(() => net.beat(ROOM, uid), HB), setInterval(() => { peerOff = performance.now() - peerAt > STALE ? 1 : 0; renderWarn(); }, 1000));
  if (seat === 0) {
    unsubs.push(net.watch(`${P}/act`, onAct), net.watch(`${P}/left`, v => {
      peerLeft = v === true;
      if (peerLeft && g && !g.over) { g.over = 1; g.left = 1; g.w = 2; g.endOpen = 1; pub(); hud(); showEnd(0); }
      renderRm();
    }));
    const gm = room.game, s = dec(gm);
    if (s) { Object.assign(g, s, { rd: gm.rd | 0 }); seq = gm.seq; rm = gm.rm | 0; lastAct = gm.ai | 0; }
    netReady = true; build2();
  } else {
    unsubs.push(net.watch(`${base}/game`, onDoc), net.watch(`${base}/state`, v => {
      if (v !== null) return;
      if (g && !g.over) fatal(Object.assign(new Error('Le salon a été fermé par l\'hôte.'), { gone: true }));
      else { roomGone = 1; renderRm(); }
    }));
    build2();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && seat === 1) net.peek(`${base}/game`).then(onDoc).catch(() => { }); });
}
function build2() { paint(); hud(); if (g.over) { if (g.w !== null || g.left) record(); showEnd(0); } renderRm(); }
async function bootOnline() {
  const w = $('warn'); w.textContent = 'Connexion au salon…'; w.hidden = false;
  try {
    net = await import('./core/online.js');
    const r = await net.enter(ROOM), room = r.room, cfg = room.config;
    uid = r.uid; seat = r.seat; S.setMe(uid);
    if (cfg.mode !== M.id) { location.replace(`game.html?mode=${cfg.mode}&opp=online&room=${ROOM}`); return; }
    const ids = [room.seats.a, room.seats.b]; peerUid = ids[1 - seat];
    g = S.fresh(M, 'online', '', ids.map((id, i) => cleanName(room.players?.[id]?.name, 'Joueur ' + (i + 1))), ids);
    build();
    try { localStorage.setItem(RK, ROOM); } catch { }
    startNet(room);
  } catch (e) { fatal(e); }
}
async function leave() {
  $('leaveOv').hidden = true;
  try {
    if (seat === 0) { if (g && !g.over) { g.over = 1; g.left = 1; g.w = 2; pub(); } await Promise.race([lastPub ?? sleep(0), sleep(1500)]); await Promise.race([net.removeRoom(ROOM), sleep(2500)]); }
    else await Promise.race([net.markLeft(ROOM, uid), sleep(2000)]);
  } catch { }
  try { localStorage.removeItem(RK); } catch { }
  location.href = './index.html';
}

/* ---------- Démarrage ---------- */
if (ONLINE) bootOnline();
else {
  g = S.loadGame();
  if (!g || g.mode !== M.id || g.opp !== OPP) location.replace('./index.html');
  else { build(); paint(); hud(); if (g.over) showEnd(0); else aiKick(); }
}
