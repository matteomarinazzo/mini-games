import { createGL, createCamera } from './core/gl.js';
import { groundAt, TRACK, inPitBox, PIT, pitExt } from './core/track.js';
import { buildTrackMesh } from './core/track-mesh.js';
import { createInput } from './core/input.js';
import { CARS, createCar, stepCar } from './core/physics.js';
import { look } from './core/sheets.js';
import { createCars, drawCars, gridSlot } from './core/cars.js';
import { createAi, stepField, collide } from './core/ai.js';
import { createRace, fmt } from './core/race.js';
import { buildLine, buildZone, buildLamp, drawBrake, drawLights } from './core/aids.js';
import { createMap } from './core/map.js';
import { createDamage, drawWear } from './core/damage.js';
import { circuitList, CAR_LIST, sessionConfig, queryConfig, saveRec, saveClm, loadSet, saveSet, startSession } from './core/config.js';
import * as Net from './net.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gameCanvas'), lost = $('ctxLost');
const R = createGL(canvas, { onLost: () => { lost.hidden = false; }, onRestored: () => { lost.hidden = true; } });
if (!R) { $('noGl').hidden = false; throw new Error('WebGL2 indisponible'); }

const LIVE_KEY = 'little-turismo-live-v1';
function readLive() { try { const raw = localStorage.getItem(LIVE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
const live = readLive();
const online = Net.readSession();
const multiplayer = !!(online?.going && online?.code && online?.uid && online?.players);
const localUid = online?.uid || null;
// Une session réseau est sa propre source de vérité : une ancienne sauvegarde solo ne peut pas la remplacer.
const cfg = multiplayer ? (sessionConfig() || queryConfig()) : (live?.cfg || sessionConfig() || queryConfig()), sheet = CARS[cfg.car] || CARS.serra_gt;
const set = loadSet();
const humanPlayers = multiplayer ? Object.entries(online.players).filter(([, p]) => !p.away) : [];
const sortedHumans = humanPlayers.sort(([, a], [, b]) => (a.joined || 0) - (b.joined || 0));
const remotePlayers = multiplayer ? sortedHumans.filter(([uid]) => uid !== localUid) : [];
const hostMode = multiplayer && online.hostId === localUid;
const totalCars = sortedHumans.length + cfg.ai;
const guests = sortedHumans.filter(([uid]) => uid !== online?.hostId);
const getMultiSlotK = (uid) => {
  if (uid === online?.hostId) return Math.max(0, totalCars - 1);
  const gIdx = guests.findIndex(([u]) => u === uid);
  return Math.max(0, totalCars - 2 - Math.max(0, gIdx));
};
const myStartPos = multiplayer && !cfg.qualifying && !cfg.gridOrder ? (getMultiSlotK(localUid) + 1) : (cfg.qualifying ? 0 : cfg.startPosition);
$('hud').querySelector('b').textContent = (circuitList().find((c) => c.id === cfg.circuit) || circuitList()[0]).name;
const track = R.mesh(buildTrackMesh()), field = createCars(R, cfg.ai + remotePlayers.length, sheet, myStartPos, cfg.qualifying ? null : cfg.gridOrder), me = field.player;
const input = createInput({ steerZone: $('steerZone'), accelBtn: $('accelBtn'), brakeBtn: $('brakeBtn') });
const drv = createCar(sheet, field.playerSlot.s, field.playerSlot.lat), cam = createCamera(65, .5, 5000);
const menuLink = $('results').querySelector('a.btn');   // lien Menu de la fenêtre de résultats (masqué pendant et après les qualifications)

// IA et voitures humaines distantes : seul l'hôte simule la grille entière.
const place = (c, slot) => { c.slot = slot; c.ph = createCar(c.sheet, slot.s, slot.lat); if (c.ai) { c.ai.ph = c.ph; c.ph.sheet = c.ai.sheet; c.ai.tl = c.ph.lat; } };   // sheet : fiche de l'IA (bonus de specs expert / difficile)
const humanCars = field.cars.slice(0, remotePlayers.length), aiCars = field.cars.slice(remotePlayers.length);
for (let i = 0; i < humanCars.length; i++) {
  const c = humanCars[i], [uid, player] = remotePlayers[i], choice = CARS[player.car] || sheet;
  c.humanUid = uid; c.humanName = player.name || 'Pilote'; c.sheet = choice;
  const lk = look(choice);
  c.body = lk.color;
  c.sc = lk.sc;
  if (multiplayer && !cfg.qualifying && !cfg.gridOrder) {
    place(c, gridSlot(getMultiSlotK(uid)));
  } else {
    c.ph = createCar(choice, c.slot.s, c.slot.lat);
  }
}
for (let i = 0; i < aiCars.length; i++) {
  const c = aiCars[i];
  const choice = cfg.carMode === 'same' ? sheet : CARS[CAR_LIST[(i * 5 + 3) % CAR_LIST.length].id] || sheet;
  c.sheet = choice;
  const lk = look(choice);
  c.body = lk.color;
  c.sc = lk.sc;
  c.ph = createCar(choice, c.slot.s, c.slot.lat);
  c.ai = createAi(c.ph, cfg.diff, c.n, !!cfg.qualifying, cfg.mode === 'clm' ? 0 : cfg.laps);
  c.netKey = 'ai:' + i;
}
if (multiplayer && !cfg.qualifying && !cfg.gridOrder) {
  aiCars.forEach((c, i) => place(c, gridSlot(i)));
} else if (cfg.qualifying || !cfg.gridOrder) {
  const slots = field.cars.map((c) => c.slot).sort((a, b) => b.s - a.s), seeded = [...aiCars].sort((a, b) => (b.ai.skill - Math.abs(b.ai.lane) * .01) - (a.ai.skill - Math.abs(a.ai.lane) * .01));
  seeded.forEach((c, i) => place(c, slots[i + humanCars.length] || slots[i]));
}
const ais = aiCars.map((c) => c.ai), all = [drv, ...field.cars.map((c) => c.ph)];
const clm = cfg.mode === 'clm';   // contre la montre : tours illimités, sans IA ni pénalité de faux départ
const race = createRace({ laps: cfg.qualifying ? 1 : clm ? 1e6 : cfg.laps, training: clm, waitAll: cfg.qualifying, qualifying: cfg.qualifying, penaltiesEnabled: set.penalties, multi: multiplayer, entries: [{ n: multiplayer ? localUid : 1, name: multiplayer ? (online.players[localUid]?.name || 'Vous') : 'Vous', ph: drv, start: field.playerSlot.k + 1, player: true }, ...humanCars.map((c) => ({ n: multiplayer ? c.humanUid : c.n, name: c.humanName, ph: c.ph, start: c.slot.k + 1, human: true })), ...aiCars.map((c) => ({ n: multiplayer ? c.netKey : c.n, name: 'IA ' + c.n, ph: c.ph, start: c.slot.k + 1 }))] });
const NOGAS = { throttle: 0, brake: 0, steer: 0, rev: true }, IDLE = { throttle: 0, brake: .6, steer: 0, rev: false };
const dmg = createDamage($('dmg')), mp = createMap($('map'));
let lineMesh = null, zoneMesh = null, lampMesh = null;
for (const [id, k] of [['sLine', 'line'], ['sBrake', 'brake'], ['sMap', 'map']]) {
  const el = $(id); el.checked = set[k];
  el.addEventListener('change', () => { set[k] = el.checked; saveSet(set); $('map').hidden = !set.map; });
}
$('sPenalties').checked = set.penalties;
$('sPenalties').addEventListener('change', () => { set.penalties = $('sPenalties').checked; race.penaltiesEnabled = set.penalties; saveSet(set); });
$('map').hidden = !set.map;
$('setBtn').addEventListener('click', () => { $('setPanel').hidden = !$('setPanel').hidden; });
const views = [['rear', '3e personne'], ['close', '3e personne rapprochée'], ['cockpit', 'Cockpit'], ['front', 'Avant']];
const setView = (step = 0) => {
  let index = Math.max(0, views.findIndex(([id]) => id === set.view));
  if (step) index = (index + step + views.length) % views.length;
  set.view = views[index][0]; $('viewName').textContent = views[index][1];
  $('cockpit').dataset.kind = look(sheet).kind; $('cockpit').hidden = set.view !== 'cockpit'; $('cockpit').setAttribute('aria-hidden', String(set.view !== 'cockpit'));
  saveSet(set);
};
$('viewPrev').addEventListener('click', () => setView(-1)); $('viewNext').addEventListener('click', () => setView(1)); setView();

const DT = 1 / 60, wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
let tick = 0, acc = 0, last = 0, ema = DT, slow = 0, camPsi = drv.psi, camY = drv.y + 3, camT = drv.y + 1, hudN = 0, shown = false, qualNotice = false, qualUiTick = 0, lastBest = null, pitMsg = '', pitMsgT = 0, repT = 0, saveAcc = 0, discardingLive = false, finAt = 0, liveShown = false, liveTick = 0;
const AI_SAVE = ['skill', 'lane', 'p1', 'p2', 'wait', 'tl', 'vt', 'tx', 'tz', 'fault', 'atk', 'atkT', 'passLat', 'defDone', 'defT', 'defSide', 'calm', 'gl', 'dist', 'joined', 'stk', 'rec', 'damage', 'inp', 'blk', 'vf', 'p0', 'pit', 'pitD', 'pitT', 'pitN', 'pitChk', 'pitW', 'pitTO'];
// Réseau fluide : chaque machine est autoritaire sur SA voiture (physique locale 60 Hz) et la publie à 20 Hz en tableau compact.
// L'hôte publie IA + humains ; les clients rejouent les paquets avec un retard fixe (interpolation, extrapolation courte).
const NF = ['x', 'y', 'z', 'psi', 'pitch', 'roll', 'u', 'w', 'r', 's', 'lat', 'kmh'], NLEN = 20, DELAY = 90, NET_STEP = .045, DK = ['nose', 'fw', 'hood', 'l', 'r', 'floor', 'rw'];
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const dmArr = (w) => DK.map((k) => Math.round(Math.min(1, Math.max(0, (w && w[k]) || 0)) * 100));
const packCar = (c, w) => [r2(c.x), r2(c.y), r2(c.z), r3(c.psi), r3(c.pitch), r3(c.roll), r2(c.u), r2(c.w), r3(c.r), r2(c.s), r2(c.lat), Math.round(c.kmh), c.raceFinished ? 1 : 0, ...dmArr(w)];
const normArr = (v) => Array.isArray(v) ? v : Array.from({ length: NLEN }, (_, i) => +v?.[i] || 0);
const normMap = (m) => { const o = {}; for (const k in m) o[k] = normArr(m[k]); return o; };
const netRT = () => ({ phase: race.phase, clock: race.clock, t: race.t, lights: race.lights, hold: race.hold });
const netRE = () => ({ results: race.results || null, E: race.E.map((e) => Object.fromEntries(['n', 'p0', 'p', 'maxP', 'prevS', 'k', 'lapStart', 'best', 'last', 'fin', 'fl', 'fp'].map((k) => [k, e[k]]))) });
const newBuf = () => ({ b: [], rt: null });
function pushBuf(B, t, d) { const L = B.b[B.b.length - 1]; if (L && t <= L.t) { if (L.t - t < 1500) return; B.b.length = 0; B.rt = null; } B.b.push({ t, d }); B.at = performance.now(); if (B.b.length > 8) B.b.shift(); }
/** Carte clé → tableau interpolé à (dernier paquet − DELAY). Horloge propre au tampon (pas besoin d'horloges synchronisées). */
function sampleBuf(B, dt) {
  const n = B.b.length; if (!n) return null;
  const last = B.b[n - 1].t;
  if (B.rt === null) B.rt = last - DELAY;
  const target = last - DELAY, lag = target - B.rt;
  B.rt += dt * 1000 * (1 + Math.max(0, Math.min(.65, lag * .004)));
  B.rt += (target - B.rt) * Math.min(1, dt * 5);
  let i = n - 1; while (i > 0 && B.b[i].t > B.rt) i--;
  const A = B.b[i], C = B.b[i + 1], out = {};
  for (const key in A.d) {
    const a = A.d[key], c = C && C.d[key], o = a.slice();
    if (c) {
      const k = Math.max(0, Math.min(1, (B.rt - A.t) / (C.t - A.t || 1)));
      for (let j = 0; j < 12; j++) o[j] = a[j] + (c[j] - a[j]) * k;
      o[3] = a[3] + wrap(c[3] - a[3]) * k; if (Math.abs(c[9] - a[9]) > 300) o[9] = c[9]; o[12] = c[12];
    } else {
      const e = Math.min(.25, Math.max(0, (B.rt - A.t) / 1000)), cs = Math.cos(a[3]), sn = Math.sin(a[3]);
      o[0] += (cs * a[6] - sn * a[7]) * e; o[2] += (sn * a[6] + cs * a[7]) * e; o[3] += a[8] * e; o[9] += a[6] * e;
    }
    out[key] = o;
  }
  return out;
}
function applyArr(c, a, fin) {
  for (let i = 0; i < 12; i++) c[NF[i]] = a[i];
  if (fin && a[12] === 1) c.raceFinished = true;
  const dm = c.dmo || (c.dmo = {}); for (let i = 0; i < 7; i++) dm[DK[i]] = (a[13 + i] || 0) / 100;
  c.v = c.u; const p = c.prev; p.x = c.x; p.y = c.y; p.z = c.z; p.psi = c.psi;
}
let netPend = 0, lastResub = 0, netAcc = 0, netSeq = 0, netBusy = false, netDirty = false, netRetry = null, netUnwatch = null, netLast = 0, seenAt = 0;
const guestBuf = newBuf(), humanBufs = {};
function onRuntime(s) {   // invité : paquet hôte
  if (!s || hostMode) return;
  if (s.cars && s.stamp) pushBuf(guestBuf, s.stamp, normMap(s.cars));
  const rt = s.rt; if (rt) for (const k of ['phase', 'clock', 't', 'lights', 'hold']) if (rt[k] !== undefined) race[k] = rt[k];
  const rs = s.race; if (rs) {
    if (rs.results !== undefined) race.results = rs.results;
    for (const se of rs.E || []) { const e = race.E.find((x) => x.n === se.n); if (e) Object.assign(e, se); }
  }
}
function onPlayers(pl) {   // hôte : paquets des invités
  if (!pl) return;
  for (const c of humanCars) {
    const p = pl[c.humanUid]?.carState || pl[c.humanUid]?.car;
    if (p?.a && p.t) pushBuf(humanBufs[c.humanUid] ||= newBuf(), p.t, { k: normArr(p.a) });
    const pen = pl[c.humanUid]?.pen, dtf = pl[c.humanUid]?.dt;
    if (dtf !== undefined) { const e = race.E.find((x) => x.n === c.humanUid); if (e) e.dt = !!dtf; }
    if (typeof pen === 'number') {
      const e = race.E.find((x) => x.n === c.humanUid);
      if (e) e.timePenalty = pen;
    }
  }
}
function syncNet() {
  const now = performance.now(), dt = Math.min(.25, (now - netLast) / 1000 || 0); netLast = now;
  if (hostMode) { for (const c of humanCars) { const m = humanBufs[c.humanUid] && sampleBuf(humanBufs[c.humanUid], dt); if (m) applyArr(c.ph, m.k, false); } return; }
  const m = sampleBuf(guestBuf, dt); if (!m) return;
  for (const c of humanCars) if (m[c.humanUid]) applyArr(c.ph, m[c.humanUid], true);
  for (const c of aiCars) if (m[c.netKey]) applyArr(c.ph, m[c.netKey], true);
  if (m[localUid] && m[localUid][12] === 1) drv.raceFinished = true;
}
async function publishNetwork() {
  if (!multiplayer || !Net.N.uid) return;
  netDirty = true; if (netBusy) return;
  netBusy = true;
  try {
    while (netDirty) {
      netDirty = false;
      const d = {}, t = Net.now();
      if (hostMode) {
        const cars = { [localUid]: packCar(drv, dmg.w) };
        for (const c of humanCars) cars[c.humanUid] = packCar(c.ph, c.ph.dmo);
        for (const c of aiCars) cars[c.netKey] = packCar(c.ph, c.ai.damage.w);
        d['runtime/stamp'] = t; d['runtime/cars'] = cars; d['runtime/rt'] = netRT();
        if (netSeq++ % 5 === 0 || race.phase === 'finished') d['runtime/race'] = netRE();
      } else {
        d[`players/${localUid}/carState`] = { t, a: packCar(drv, dmg.w) };
        if (race.timePenalty > 0) d[`players/${localUid}/pen`] = race.timePenalty;
        d[`players/${localUid}/dt`] = race.dt ? 1 : 0;
      }
      if (Date.now() - seenAt > 2000) { seenAt = Date.now(); d[`players/${localUid}/lastSeen`] = t; }
      Net.update(online.code, d).catch(() => { });   // sans attendre l'ack : le SDK garde l'ordre, la latence ne bride plus le débit
      if (++netPend > 6) { netPend = 0; await new Promise((r) => setTimeout(r, 60)); }
    }
  } catch { netDirty = true; /* réessayer le dernier état après un bref délai */ } finally { netBusy = false; if (netDirty && netRetry === null) netRetry = setTimeout(() => { netRetry = null; publishNetwork(); }, 100); }
}
if (multiplayer) {
  const startWatch = async () => {
    if (netUnwatch) { try { netUnwatch(); } catch { /* ignoré */ } netUnwatch = null; }
    const n = await Net.init(); if (!n) return false;
    netUnwatch = hostMode ? Net.watchPlayers(online.code, onPlayers) : Net.watchRuntime(online.code, onRuntime);
    return true;
  };
  (async () => { for (let i = 0; i < 20 && !(await startWatch()); i++) await new Promise((r) => setTimeout(r, 1500)); })();
  // Chien de garde : plus aucun paquet depuis 3 s → on se réabonne (écoute perdue, session expirée…)
  setInterval(() => { if (document.hidden || race.phase === 'finished') return; const bufs = hostMode ? humanCars.map((c) => humanBufs[c.humanUid] || { at: 0 }) : [guestBuf]; const stale = bufs.some((b) => performance.now() - (b.at || 0) > 3000); if (stale && performance.now() - lastResub > 4000) { lastResub = performance.now(); startWatch(); } }, 1500);
  addEventListener('pagehide', () => { if (netUnwatch) netUnwatch(); });
}
function captureCar(c) { const v = {}; for (const k of Object.keys(c)) if (k !== 'sheet' && k !== 'prev') v[k] = c[k]; return { v, prev: { ...c.prev } }; }
function persistLive() {
  if (multiplayer) return; // l'état en ligne est repris depuis la room, pas depuis une copie locale isolée
  if (discardingLive) return;
  try {
    const ai = ais.map((a, i) => { const state = {}; for (const k of AI_SAVE) state[k] = a[k]; state.rng = a.r.getState(); state.target = a.tgt ? field.cars.find((c) => c.ph === a.tgt)?.n ?? null : null; return { n: field.cars[i].n, state }; });
    const entries = race.E.map((e) => Object.fromEntries(['n', 'p0', 'p', 'maxP', 'prevS', 'k', 'lapStart', 'best', 'last', 'fin', 'fl', 'fp'].map((k) => [k, e[k]])));
    const data = { cfg, tick, player: captureCar(drv), cars: field.cars.map((c) => ({ n: c.n, state: captureCar(c.ph) })), ai, damage: { ...dmg.w }, race: { phase: race.phase, clock: race.clock, t: race.t, laps: race.laps, waitAll: race.waitAll, qualifying: race.qualifying, afterPlayer: race.afterPlayer, lights: race.lights, hold: race.hold, falseStart: race.falseStart, penalty: race.penalty, goMsg: race.goMsg, msg: race.msg, results: race.results, penaltiesEnabled: race.penaltiesEnabled, penalties: race.penalties, timePenalty: race.timePenalty, lapPenalty: race.lapPenalty, cutTimer: race.cutTimer, cutCooldown: race.cutCooldown, penaltyMsg: race.penaltyMsg, penaltyMsgT: race.penaltyMsgT, dt: race.dt, E: entries } };
    localStorage.setItem(LIVE_KEY, JSON.stringify(data));
  } catch (e) { /* stockage indisponible ou saturé */ }
}
function restoreLive(data) {
  if (!data || !data.race || !Array.isArray(data.cars)) return false;
  try {
    const restoreCar = (c, state) => { if (!state) return; Object.assign(c, state.v); Object.assign(c.prev, state.prev); };
    restoreCar(drv, data.player);
    const carsByN = new Map(field.cars.map((c) => [c.n, c]));
    for (const saved of data.cars) restoreCar(carsByN.get(saved.n)?.ph, saved.state);
    const aiByN = new Map(ais.map((a, i) => [field.cars[i].n, a]));
    for (const saved of data.ai || []) { const a = aiByN.get(saved.n); if (!a) continue; for (const k of AI_SAVE) if (saved.state[k] !== undefined) a[k] = saved.state[k]; a.r.setState(saved.state.rng); a._savedTarget = saved.state.target; }
    for (const a of ais) { a.tgt = a._savedTarget == null ? null : carsByN.get(a._savedTarget)?.ph || null; delete a._savedTarget; }
    Object.assign(dmg.w, data.damage || {}); tick = data.tick || 0;
    const rs = data.race; for (const k of ['phase', 'clock', 't', 'laps', 'waitAll', 'qualifying', 'afterPlayer', 'lights', 'hold', 'falseStart', 'penalty', 'goMsg', 'msg', 'results', 'penaltiesEnabled', 'penalties', 'timePenalty', 'lapPenalty', 'cutTimer', 'cutCooldown', 'penaltyMsg', 'penaltyMsgT', 'dt']) if (rs[k] !== undefined) race[k] = rs[k];
    for (const saved of rs.E || []) { const e = race.E.find((x) => x.n === saved.n); if (e) Object.assign(e, saved); }
    camPsi = drv.psi; camY = drv.y + 3; camT = drv.y + 1;
    return true;
  } catch (e) { return false; }
}
// Pause : Échap / bouton / onglet masqué ; après un refresh accidentel on repart en pause (records déjà en localStorage)
const nav = performance.getEntriesByType('navigation')[0], go = sessionStorage.getItem('little-turismo-go');
sessionStorage.removeItem('little-turismo-go');
let paused = false;
function setPause(p) { if (shown || qualNotice || liveShown) p = false; paused = p; $('pause').hidden = !p; if (p) { input.reset(); persistLive(); } }
const restart = () => { discardingLive = true; try { localStorage.removeItem(LIVE_KEY); sessionStorage.setItem('little-turismo-go', '1'); } catch (e) { /* stockage indisponible */ } location.reload(); };
$('pauseBtn').addEventListener('click', () => setPause(true));
$('resume').addEventListener('click', () => setPause(false));
$('restart').addEventListener('click', restart);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.repeat) setPause(!paused); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !multiplayer) setPause(true); });
const restored = restoreLive(multiplayer ? null : live);
if (restored && race.phase !== 'finished') setPause(true);
else if (!restored && !go && !multiplayer && nav && nav.type === 'reload') setPause(true);
if (restored && race.phase === 'finished') persistLive();
addEventListener('pagehide', persistLive);
cam.aspect = R.resize();
addEventListener('resize', () => { cam.aspect = R.resize(); });

const hud = $('hud'), lights = $('lights').children, mapCars = [];
// Classement local (5 lignes autour de moi, écart en secondes : - devant, + derrière). Progression cumulée calculée localement : fluide pour hôte et invités.
const boardEl = $('board'), rows = Array.from({ length: 5 }, () => { const d = document.createElement('div'); d.innerHTML = '<i></i><span></span><b></b>'; boardEl.appendChild(d); return d; });
const pgs = new Map(), LENT = TRACK.length, wrapT = (d) => d - LENT * Math.round(d / LENT);
function prog(e) { let q = pgs.get(e.n); if (!q) pgs.set(e.n, q = { p: e.p, s: e.ph.s }); const d = wrapT(e.ph.s - q.s); q.s = e.ph.s; if (Math.abs(d) < 80) q.p += d; return q.p; }
function updateBoard() {
  boardEl.hidden = race.qualifying || clm; if (race.qualifying || clm) return;
  const me = race.E[0], list = race.E.map((e) => ({ e, p: prog(e) }));
  const sc = (x) => x.e.fin !== null ? x.e.fp : x.p;
  list.sort((a, b) => (sc(b) - sc(a)) || (a.e.fin !== null && b.e.fin !== null ? a.e.fin - b.e.fin : a.e.fin !== null ? -1 : b.e.fin !== null ? 1 : 0));
  const n = list.length, i = list.findIndex((x) => x.e === me), pm = list[i].p, st = Math.max(0, Math.min(i - 2, n - 5));
  rows.forEach((row, r) => {
    const q = list[st + r]; row.hidden = !q; if (!q) return;
    const isMe = q.e === me, d = q.p - pm, v = -d / Math.max(12, d > 0 ? me.ph.u : q.e.ph.u);
    row.className = isMe ? 'me' : '';
    row.children[0].textContent = st + r + 1; row.children[1].textContent = (q.e.fin !== null ? '🏁 ' : '') + (isMe ? 'Vous' : q.e.name);
    const b = row.children[2]; b.textContent = isMe ? '—' : (v < 0 ? '-' : '+') + Math.min(999.999, Math.abs(v)).toFixed(3); b.className = isMe ? '' : v < 0 ? 'f' : 'r';
  });
}
/** Stands : pit limiter 80 km/h dans la voie rapide ; arrêté dans le box du joueur, réparation en 2,5 s ; drive-through = traverser la voie sans s'arrêter au box, puis en sortir. */
const PIT_LIM = 80 / 3.6, PIT_FIX = 2.5;
let inLane = false, laneS = 0, laneBad = false;
const penTxt = () => (race.dt ? 'DT' + (race.timePenalty ? ' +' + race.timePenalty + ' s' : '') : race.timePenalty ? '+' + race.timePenalty + ' s' : '0 s');
const dtHint = () => (race.dt && race.phase === 'go' && race.t % 15 < 2.5 ? 'Drive-through à effectuer' : '');
const say = (m, t) => { pitMsg = m; pitMsgT = t; };
function pitService(dt) {
  pitMsgT = Math.max(0, pitMsgT - dt);
  const lane = drv.lat * PIT.sg > TRACK.half + 3 && pitExt(drv.s) > 3;
  if (lane && !inLane) { inLane = true; laneS = drv.s; laneBad = false; drv.limit = PIT_LIM; say('Pit limiter actif · 80 km/h', 2.2); }
  else if (!lane && inLane) {
    inLane = false; drv.limit = 0;
    if (race.dt && !race.qualifying) {
      const d = drv.s - laneS, L = TRACK.length, run = d - L * Math.round(d / L);
      if (!laneBad && run > .6 * (PIT.back + PIT.fwd)) { race.dt = false; say('Pit limiter désactivé · Drive-through effectué', 3.5); }
      else say(laneBad ? 'Pit limiter désactivé · Drive-through annulé (arrêt au box)' : 'Pit limiter désactivé · Drive-through non validé', 3.5);
    } else say('Pit limiter désactivé', 2);
  }
  if (inPitBox(drv) && drv.kmh < 5) laneBad = true;
  if (inPitBox(drv) && drv.kmh < 5 && Object.values(dmg.w).some((v) => v > .01)) {
    repT += dt; pitMsg = 'Réparation… ' + Math.max(0, PIT_FIX - repT).toFixed(1) + ' s'; pitMsgT = .3;
    if (repT >= PIT_FIX) { dmg.repair(); repT = 0; pitMsg = 'Voiture réparée !'; pitMsgT = 2.5; }
  } else repT = 0;
  if (lane && pitMsgT <= 0) say('Pit limiter actif · 80 km/h', .3);
}
function updateHud() {
  const rk = race.rank(), pl = race.E[0], lap = Math.min(clm ? 1e9 : cfg.laps, Math.max(1, pl.k)), lapTxt = race.qualifying ? 'Qualifications en 1 tour' : clm ? String(lap) : lap + '/' + cfg.laps;
  $('hPos').textContent = clm ? '–' : (rk.indexOf(pl) + 1) + '/' + race.E.length;
  $('hLap').textContent = lapTxt; $('hLap').classList.toggle('long', race.qualifying); $('dashLap').classList.toggle('long', race.qualifying);
  $('hTime').textContent = pl.lapStart === null ? '–' : fmt(race.t - pl.lapStart + race.lapPenalty);
  $('hBest').textContent = fmt(pl.best);
  $('hPenalty').textContent = penTxt();
  $('hSpd').textContent = Math.round(drv.kmh);
  $('hGear').textContent = drv.rev ? 'R' : (Math.floor(drv.gear) + 1);
  if (pl.best !== null && pl.best !== lastBest) { lastBest = pl.best; clm ? saveClm(cfg.circuit, cfg.car, pl.best) : saveRec(pl.best, null, cfg.circuit); }   // record de tour sauvé dès qu'il tombe
  $('lightsWrap').hidden = race.phase === 'go' || race.phase === 'finished';
  for (let i = 0; i < lights.length; i++) lights[i].classList.toggle('on', race.lights > i);
  $('banner').textContent = pitMsgT > 0 ? pitMsg : race.penaltyMsgT > 0 ? race.penaltyMsg : race.lapMsgT > 0 ? race.lapMsg : dtHint() || (race.penalty > 0 ? 'Faux départ ! Accélération bloquée' : (race.goMsg > 0 ? 'GO !' : (race.phase === 'lights' ? '' : race.msg)));
  $('dashSpeed').textContent = String(Math.round(drv.kmh));
  const rf = Math.max(0, Math.min(1, (drv.rpm - 1100) / 6900)), gr = drv.rev ? 'R' : String(Math.floor(drv.gear) + 1);
  $('hRpm').style.width = (rf * 100).toFixed(0) + '%'; $('hRpm').classList.toggle('red', rf > .92);
  $('dashGear').textContent = gr; $('dashRpm').textContent = Math.round(drv.rpm / 10) * 10; $('dashLap').textContent = lapTxt;
  $('dashPos').textContent = clm ? '–' : (rk.indexOf(pl) + 1) + '/' + race.E.length; $('dashTime').textContent = $('hTime').textContent; $('dashBest').textContent = fmt(pl.best);
  $('dashPen').textContent = penTxt();
  for (const t of WG) t.textContent = gr;
}
const WG = [...document.querySelectorAll('.wg')], LEDS = [...document.querySelectorAll('#shiftBar i')], CK = $('cockpit');
const EYE = { gt: 1.12, wedge: 1.0, proto: 1.02, open: .95, rally: 1.32 }[look(sheet).kind] || 1.12;
/** Cockpit : volant qui tourne, aiguille de régime, LED de changement de rapport, pédales (chaque image). */
function cockpitTick() {
  const st = input.state, rf = Math.max(0, Math.min(1, (drv.rpm - 1100) / 6900)), flash = rf > .965 && (Math.floor(performance.now() / 70) & 1);
  $('wheel').style.transform = 'translateX(-50%) rotate(' + (st.steer * 140).toFixed(1) + 'deg)';
  $('needle').style.transform = 'rotate(' + (-120 + rf * 240).toFixed(1) + 'deg)';
  $('pThr').style.height = Math.round(st.throttle * 100) + '%'; $('pBrk').style.height = Math.round(st.brake * 100) + '%';
  for (let i = 0; i < LEDS.length; i++) LEDS[i].classList.toggle('on', rf > .5 + i * .04 && (!flash || i % 2 === 0));
  CK.style.setProperty('--shake', (Math.min(1, drv.kmh / 300) * (drv.surf ? 2.2 : .5)).toFixed(2));
}
const formatPlayerNum = (n) => {
  if (multiplayer) {
    const hIdx = sortedHumans.findIndex(([uid]) => uid === n);
    if (hIdx !== -1) return 'Joueur ' + (hIdx + 1);
    if (typeof n === 'string' && n.startsWith('ai:')) {
      const aiIdx = parseInt(n.slice(3), 10);
      return 'IA ' + (Number.isFinite(aiIdx) ? aiIdx + 1 : n);
    }
  }
  return typeof n === 'number' ? 'Joueur ' + n : String(n);
};

const isMine = (x) => multiplayer ? x.n === localUid : x.player;
function showLive() {   // multi : mon arrivée + 1 s ; classement en cours, mis à jour jusqu'à la fin pour tous
  liveShown = true; input.reset();
  $('resTitle').textContent = '🏁 Course en cours';
  $('resSub').textContent = 'Vous avez terminé. En attente des autres pilotes…';
  $('again').hidden = true; menuLink.hidden = true;
  const rk = race.rank(), wf = rk[0].fin, tb = $('resBody'); tb.textContent = '';
  rk.forEach((e, i) => {
    const gap = e.fin === null ? 'En piste' : i === 0 ? fmt(e.fin) : e.fl < rk[0].fl ? '+' + (rk[0].fl - e.fl) + ' tour(s)' : '+' + (e.fin - wf).toFixed(2) + ' s';
    const tr = document.createElement('tr'); if (e === race.E[0]) tr.className = 'me';
    for (const v of [i + 1, formatPlayerNum(e.n), (e.fin !== null ? '🏁 ' : '') + e.name, e.start, fmt(e.best), gap]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
    tb.appendChild(tr);
  });
  $('results').hidden = false;
}
function toLobby() { const s = Net.readSession(); if (s) { s.going = false; delete s.players; Net.saveSession(s); } location.href = 'index.html'; }
async function replayMulti() {   // hôte : remet la room en attente ; invités : suivent dès que l'hôte l'a fait
  const b = $('again'); b.disabled = true;
  await Net.init();
  if (hostMode) {
    // Garder players/<uid>/car (choix du lobby), mais effacer les snapshots de conduite.
    const d = { state: 'waiting', runtime: null };
    for (const [uid] of sortedHumans) d['players/' + uid + '/carState'] = null;
    await Net.update(online.code, d); toLobby();
  } else { b.textContent = 'En attente de l\u2019hôte…'; Net.watchState(online.code, (s) => { if (s === 'waiting') toLobby(); }); }
}
if (multiplayer) {
  $('restart').hidden = true;
  for (const a of document.querySelectorAll('a[href="index.html"]')) a.addEventListener('click', async (e) => {
    e.preventDefault(); try { await Net.init(); await Net.leave(online.code, true); } catch { /* quitter quand même */ }
    location.href = 'index.html';
  });
}
function showResults() {
  const r = race.results; shown = true; input.reset(); $('pause').hidden = true; paused = false;
  $('again').hidden = false; menuLink.hidden = race.qualifying;
  if (race.qualifying) {
    const playerRow = r.rows.find(isMine);
    $('resTitle').textContent = '🏁 Classement des qualifications';
    $('resSub').textContent = 'Votre tour : ' + (playerRow?.best ? fmt(playerRow.best) : 'non terminé') + ' · Départ en ' + (playerRow?.place || '–') + (playerRow?.place === 1 ? 're position' : 'e position');
    $('again').textContent = 'Continuer';
    cfg.gridOrder = r.rows.map((row) => {
      if (multiplayer) {
        if (row.n === localUid) return 1;
        const rIdx = remotePlayers.findIndex(([u]) => u === row.n);
        if (rIdx !== -1) return rIdx + 2;
        const aiIdx = typeof row.n === 'string' && row.n.startsWith('ai:') ? +row.n.slice(3) : 0;
        return remotePlayers.length + 2 + aiIdx;
      }
      return row.n;
    });
    cfg.startPosition = playerRow?.place || 1;
  } else {
    $('again').textContent = multiplayer ? 'Rejouer' : 'Recommencer'; $('again').disabled = false;
    const me_ = r.rows.find(isMine) || r.rows[0], win = me_.place === 1 && !me_.dsq;
    $('resTitle').textContent = win ? '🏆 Victoire !' : me_.dsq ? 'Disqualifié (DSQ)' : 'Course terminée';
    saveRec(race.E[0].best, me_.dsq ? null : me_.place, cfg.circuit);
    $('resSub').textContent = me_.dsq ? 'Drive-through non effectué : vous êtes disqualifié.' : win ? 'Vous terminez premier.' : 'Vous terminez ' + me_.place + (me_.place === 1 ? 'er' : 'e') + ' sur ' + r.rows.length + '.';
  }
  const tb = $('resBody'); tb.textContent = '';
  for (const x of r.rows) {
    const tr = document.createElement('tr'); if (isMine(x)) tr.className = 'me';
    for (const v of [x.dsq ? 'DSQ' : x.place, formatPlayerNum(x.n), x.name, x.start, fmt(x.best), x.gap]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
    tb.appendChild(tr);
  }
  $('results').hidden = false;
}
function showQualifyingProgress() {
  qualNotice = true;
  $('resTitle').textContent = '🏁 Qualifications en cours';
  $('resSub').textContent = 'Votre tour est terminé. Les IA terminent leur tour en arrière-plan…';
  $('again').hidden = true; menuLink.hidden = true;
  $('resBody').textContent = '';
  for (const [i, e] of race.rank().entries()) {
    const tr = document.createElement('tr'); if (e.player) tr.className = 'me';
    for (const v of [i + 1, formatPlayerNum(e.n), e.name, e.start, e.best === null ? 'En piste' : fmt(e.best), e.fin === null ? 'En piste' : 'Terminé']) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
    $('resBody').appendChild(tr);
  }
  $('results').hidden = false;
}
$('again').addEventListener('click', () => {
  if (!race.qualifying) { if (multiplayer) replayMulti(); else restart(); return; }
  discardingLive = true;
  cfg.qualifying = false;   // même session : la grille de départ est cfg.gridOrder (classement des qualifs)
  try { localStorage.removeItem(LIVE_KEY); } catch (e) { /* stockage indisponible */ }
  startSession(cfg);
  try { sessionStorage.setItem('little-turismo-go', '1'); } catch (e) { /* stockage indisponible */ }
  location.reload();
});

function frame(ts) {
  requestAnimationFrame(frame);
  const dt = (paused && !multiplayer) ? 0 : Math.min(.1, (ts - last) / 1000 || 0); last = ts;
  ema += (dt - ema) * .05;
  if (ema > .03 && R.scale > .5) { if (++slow > 40) { slow = 0; ema = DT; cam.aspect = R.resize(R.scale * .8); } } else slow = 0;
  // Guest mode: apply network snapshot once per frame (outside the physics loop)
  if (multiplayer) syncNet();
  for (const c of aiCars) c.ph.gone = !!c.ph.raceFinished;   // IA arrivée : retirée de la piste, de la minimap et des collisions
  acc += dt;
  while (acc >= DT) {
    input.update(DT);
    if (!multiplayer || hostMode) {
      race.update(DT, input.state.throttle);
    } else {
      if (race.phase === 'lights' && input.state.throttle > .3) { race.falseStart = true; if (!race._falseStartHandled) { race._falseStartHandled = true; if (!race.qualifying && !clm) { race.dt = true; race.penaltyMsg = 'Faux départ : drive-through à effectuer'; race.penaltyMsgT = 4; } } }
      if (race.phase === 'go') {
        if (race.falseStart && race.penalty === 0 && !race._falseStartHandled) {
          race._falseStartHandled = true;
          if (!race.qualifying && !clm) { race.dt = true; race.penaltyMsg = 'Faux départ : drive-through à effectuer'; race.penaltyMsgT = 4; }
        }
        race.checkCut(drv, DT);
      }
      race.penaltyMsgT = Math.max(0, race.penaltyMsgT - DT);
      if (race.penalty > 0) race.penalty = Math.max(0, race.penalty - DT);
    }
    if (race.phase === 'lights' && race.falseStart && !liveShown) {
      stepCar(drv, input.state, DT);
      for (const c of field.cars) { const o = c.ph, dx = o.x - drv.x, dz = o.z - drv.z; if (dx * dx + dz * dz < 30) collide([drv, o]); }   // collisions avec la grille
      if (drv.hv > 0) { dmg.hit(drv.hv, drv.hnx, drv.hnz, drv.psi); drv.hv = 0; }
      dmg.tick(DT, drv.surf, drv.kmh); dmg.apply(drv);
    }   // faux départ : on part quand même (drive-through)
    if (race.phase === 'go') {
      const gi = liveShown ? IDLE : input.state; if (race.penalty > 0) { NOGAS.steer = gi.steer; NOGAS.brake = gi.brake; NOGAS.rev = gi.rev; }
      if (!multiplayer || hostMode) {
        if (!race.qualifying || race.E[0].fin === null) stepCar(drv, race.penalty > 0 ? NOGAS : gi, DT);
        race.checkCut(drv, DT);
        stepField(ais, all, tick++, DT, !race.qualifying, !!race.qualifying);
        if (drv.hv > 0) { dmg.hit(drv.hv, drv.hnx, drv.hnz, drv.psi); drv.hv = 0; }
        dmg.tick(DT, drv.surf, drv.kmh); pitService(DT); dmg.apply(drv);
      } else {
        // Invité : seule la physique locale du joueur tourne côté client
        stepCar(drv, race.penalty > 0 ? NOGAS : gi, DT);
        // Collisions locales : ma voiture contre les voitures distantes (leur pose vient du réseau), dégâts comme à l'hôte
        if (!race.qualifying) for (const c of field.cars) { const o = c.ph, dx = o.x - drv.x, dz = o.z - drv.z; if (dx * dx + dz * dz < 30) collide([drv, o]); }
        if (drv.hv > 0) { dmg.hit(drv.hv, drv.hnx, drv.hnz, drv.psi); drv.hv = 0; }
        dmg.tick(DT, drv.surf, drv.kmh); pitService(DT); dmg.apply(drv);
      }
    }
    if (multiplayer) { netAcc += DT; if (netAcc >= NET_STEP) { netAcc = 0; publishNetwork(); } }
    acc -= DT;
    if (!multiplayer) { saveAcc += DT; if (saveAcc >= .4) { saveAcc = 0; persistLive(); } }
  }
  if (race.qualifying && !shown && race.phase !== 'finished' && race.E[0].fin !== null && (!qualNotice || ++qualUiTick % 30 === 0)) showQualifyingProgress();
  if (multiplayer && !race.qualifying && !shown && humanCars.length && race.E[0].fin !== null) { finAt ||= performance.now(); if (performance.now() - finAt > 1000 && race.phase !== 'finished' && (!liveShown || ++liveTick % 30 === 0)) showLive(); }
  if (race.phase === 'finished' && !shown && (race.results || !multiplayer || hostMode)) showResults();
  if (R.lost) return;
  if (++hudN % 4 === 0) { updateHud(); updateBoard(); dmg.draw(); }
  if (set.map && hudN % 2 === 0 && !race.qualifying) { mapCars.length = 0; for (const c of field.cars) if (!(c.ai && c.ph.raceFinished)) mapCars.push(c); mp.draw(drv, mapCars); }
  const a = acc / DT, p = drv.prev;
  me.x = p.x + (drv.x - p.x) * a; me.y = p.y + (drv.y - p.y) * a; me.z = p.z + (drv.z - p.z) * a; me.psi = p.psi + wrap(drv.psi - p.psi) * a;
  me.pitch = drv.pitch; me.roll = drv.roll;
  camPsi += wrap(me.psi - camPsi) * (1 - Math.exp(-(set.view === 'cockpit' || set.view === 'front' ? 12 : 5) * dt));
  const fx = Math.cos(camPsi), fz = Math.sin(camPsi), rx = -fz, rz = fx;
  let cx, cz, cy, tx, tz, ty;
  if (set.view === 'cockpit') {
    cx = me.x + fx * .05; cz = me.z + fz * .05; cy = me.y + EYE;
    tx = me.x + fx * 28; tz = me.z + fz * 28; ty = me.y + 1.25;
  } else if (set.view === 'front') {
    cx = me.x + fx * 2.42; cz = me.z + fz * 2.42; cy = me.y + .48;
    tx = me.x + fx * 30; tz = me.z + fz * 30; ty = me.y + .58;
  } else {
    const near = set.view === 'close';
    cx = me.x - fx * (near ? 4.35 : 8.5) + rx * (near ? .15 : 0);
    cz = me.z - fz * (near ? 4.35 : 8.5) + rz * (near ? .15 : 0);
    const targetCamY = me.y + (near ? 2.05 : 3.1);
    camY += (targetCamY - camY) * (1 - Math.exp(-6 * dt));
    camT += (me.y + 1 - camT) * (1 - Math.exp(-6 * dt));
    const groundH = groundAt(cx, cz, Math.round(drv.idx));
    const safeGroundY = Math.min(camY + 1.8, groundH + 1);
    cy = Math.max(camY, safeGroundY);
    tx = me.x + fx * 10; tz = me.z + fz * 10; ty = camT;
  }
  if (set.view === 'cockpit') cockpitTick();
  cam.look(cx, cy, cz, tx, ty, tz);
  R.begin(cam); R.draw(track);
  if (set.line) R.draw(lineMesh || (lineMesh = R.mesh(buildLine())));
  if (set.brake) drawBrake(R, zoneMesh || (zoneMesh = R.mesh(buildZone())), drv);
  drawLights(R, lampMesh || (lampMesh = R.mesh(buildLamp())), race.lights);
  const showPlayer = set.view !== 'cockpit' && set.view !== 'front';
  if (race.qualifying) drawCars(R, { player: field.player, cars: [] }, a, cam, showPlayer); else drawCars(R, field, a, cam, showPlayer);
  if (!race.qualifying) {
    if (!multiplayer) { for (const c of aiCars) if (!c.ph.gone) drawWear(R, c.ai.damage.w, { ...c.ph, sc: c.sc, body: c.body }); }
    else for (const c of field.cars) {   // multi : dégâts (carrosserie, pare-brise, fumée, ailerons) de toutes les voitures distantes, transmis par le réseau
      const ph = c.ph; if (ph.gone) continue;
      const w = c.ai && hostMode ? c.ai.damage.w : ph.dmo; if (!w) continue;
      const q = c.wq || (c.wq = { n: 0 });
      q.x = ph.x; q.y = ph.y; q.z = ph.z; q.psi = ph.psi; q.pitch = ph.pitch; q.roll = ph.roll; q.sc = c.sc; q.body = c.body; q.kind = look(c.sheet).kind;
      drawWear(R, w, q); c.wr = q.wr; c.wf = q.wf; c.xl = q.xl; c.xr = q.xr;
    }
  }
  if (showPlayer) drawWear(R, dmg.w, me);
}
requestAnimationFrame(frame);