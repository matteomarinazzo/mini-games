import { createGL, createCamera } from './core/gl.js';
import { createF1Cockpit } from './core/cockpit-f1.js';
import { groundAt, locate, TRACK, inPitBox, PIT, pitExt } from './core/track.js';
import { buildTrackMesh } from './core/track-mesh.js';
import { createInput } from './core/input.js';
import { CARS, createCar, stepCar } from './core/physics.js';
import { look } from './core/sheets.js';
import { createCars, drawCars, gridSlot } from './core/cars.js';
import { createAiAsync, stepField, collide } from './core/ai.js';
import { engineState, engineIncrement, repairEngine } from './core/engine.js';
import { createRace, fmt } from './core/race.js';
import { buildLine, buildZone, buildLamp, drawBrake, drawLights } from './core/aids.js';
import { createMap } from './core/map.js';
import { createRadar } from './core/radar.js';
import { createDamage, drawWear } from './core/damage.js';
import { createSkids } from './core/skidmarks.js';
import { createSmoke } from './core/smoke.js';
import { createRain } from './core/rain.js';
import { circuitList, CAR_LIST, sessionConfig, queryConfig, saveRec, saveClm, loadSet, saveSet, startSession } from './core/config.js';
import * as Net from './net.js';

const $ = (id) => document.getElementById(id);
const loading = $('loading'), loadingStep = $('loadingStep'), loadingProgress = $('loadingBar'), loadingCount = $('loadingPct');
let loadGate = !!loading && !loading.hidden, loadFading = false;
function loadUpdate(text, pct) { if (!loading) return; loadingStep.textContent = text; loadingProgress.style.width = Math.max(0, Math.min(100, pct)) + '%'; loadingCount.textContent = Math.round(pct) + ' %'; }
function loadFailure(error) { if (!loading) return; loadingStep.textContent = 'Le chargement a échoué : ' + String(error?.message || error || 'Erreur inconnue'); $('loadingReturn').hidden = false; }
if (loading) { $('loadingReturn').hidden = true; addEventListener('error', e => loadFailure(e.error || e.message)); addEventListener('unhandledrejection', e => loadFailure(e.reason)); }
const canvas = $('gameCanvas'), lost = $('ctxLost');
const R = createGL(canvas, { onLost: () => { lost.hidden = false; }, onRestored: () => { lost.hidden = true; } });
if (!R) { $('noGl').hidden = false; throw new Error('WebGL2 indisponible'); }

const LIVE_KEY = 'little-turismo-live-v1';
function readLive() { try { const raw = localStorage.getItem(LIVE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
const live = readLive();
const online = Net.readSession();
const multiplayer = !!(online?.going && online?.code && online?.uid && online?.players);
const localUid = online?.uid || null;
// Une session active (menu ou URL) est prioritaire sur un vieil état persisté.
const sc = sessionConfig(), qc = queryConfig();
const hasUrlWeather = new URLSearchParams(location.search).has('weather');
const cfg = multiplayer ? (sc || qc) : (hasUrlWeather ? qc : (sc || live?.cfg || qc)), sheet = CARS[cfg.car] || CARS.serra_gt;
// Résoudre la météo aléatoire une seule fois (tous les clients multi reçoivent la même valeur via cfg.weather)
const resolvedWeather = (() => {
  if (cfg.weather === 'random') {
    const opts = ['dry', 'light_rain', 'heavy_rain'];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  return cfg.weather || 'dry';
})();
const wetFactor = resolvedWeather === 'heavy_rain' ? 1.0 : (resolvedWeather === 'light_rain' ? 0.65 : 0);
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
let localLoaded = false;
let multiReady = !multiplayer || remotePlayers.length === 0;
let hostWaitTime = 0;
const trackName = (circuitList().find((c) => c.id === cfg.circuit) || circuitList()[0]).name; $('hud').querySelector('b').textContent = trackName; if (loading) { $('loadingTrack').textContent = trackName; loadUpdate('Génération de la piste…', 4) }
const track = R.mesh(buildTrackMesh()), field = createCars(R, cfg.ai + remotePlayers.length, sheet, myStartPos, cfg.qualifying ? null : cfg.gridOrder), me = field.player;
const input = createInput({ steerZone: $('steerZone'), accelBtn: $('accelBtn'), brakeBtn: $('brakeBtn') });
const drv = createCar(sheet, field.playerSlot.s, field.playerSlot.lat, wetFactor), playerEngine = engineState(), cam = createCamera(65, .5, 5000);
const menuLink = $('results').querySelector('a.btn');   // lien Menu de la fenêtre de résultats (masqué pendant et après les qualifications)

// IA et voitures humaines distantes : seul l'hôte simule la grille entière.
const place = (c, slot) => { c.slot = slot; c.ph = createCar(c.sheet, slot.s, slot.lat, wetFactor); if (c.ai) { c.ai.ph = c.ph; c.ph.sheet = c.ai.sheet; c.ai.tl = c.ph.lat; } };   // sheet : fiche de l'IA (bonus de specs expert / difficile)
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
    c.ph = createCar(choice, c.slot.s, c.slot.lat, wetFactor);
  }
}
// En multijoueur, « same » désigne la voiture du créateur pour que tous les
// clients affichent/simuleraient la même fiche IA (les voitures humaines restent personnelles).
const sharedAiSheet = multiplayer ? (CARS[online.players?.[online.hostId]?.car] || sheet) : sheet;
for (let i = 0; i < aiCars.length; i++) {
  const c = aiCars[i];
  const choice = cfg.carMode === 'same' ? sharedAiSheet : CARS[CAR_LIST[(i * 5 + 3) % CAR_LIST.length].id] || sheet;
  c.sheet = choice;
  const lk = look(choice);
  c.body = lk.color;
  c.sc = lk.sc;
  c.ph = createCar(choice, c.slot.s, c.slot.lat, wetFactor);
  c.ai = null;
  c.netKey = 'ai:' + i;
}
if (loading) loadUpdate('Chargement des voitures…', 12);
await new Promise(r => setTimeout(r, 0));
if (loading) loadUpdate('Entraînement IA : préparation…', 18);
for (let i = 0; i < aiCars.length; i++) { const c = aiCars[i]; c.ai = await createAiAsync(c.ph, cfg.diff, c.n, !!cfg.qualifying, cfg.mode === 'clm' ? 0 : cfg.laps, (n, total) => { if (loading) loadUpdate('Entraînement IA ' + (i + 1) + '/' + aiCars.length + ' · simulation ' + n + '/' + total, 18 + 62 * (i + (n / total)) / Math.max(1, aiCars.length)) }); }
if (loading) loadUpdate('Préparation de la grille…', 94);
await new Promise(r => setTimeout(r, 0));
if (multiplayer && !cfg.qualifying && !cfg.gridOrder) {
  aiCars.forEach((c, i) => place(c, gridSlot(i)));
} else if (cfg.qualifying || !cfg.gridOrder) {
  const slots = field.cars.map((c) => c.slot).sort((a, b) => b.s - a.s), seeded = [...aiCars].sort((a, b) => (b.ai.skill - Math.abs(b.ai.lane) * .01) - (a.ai.skill - Math.abs(a.ai.lane) * .01));
  seeded.forEach((c, i) => place(c, slots[i + humanCars.length] || slots[i]));
}
localLoaded = true;
const ais = aiCars.map((c) => c.ai), all = [drv, ...field.cars.map((c) => c.ph)];
const clm = cfg.mode === 'clm';   // contre la montre : tours illimités, sans IA ni pénalité de faux départ
const race = createRace({ laps: cfg.qualifying ? 1 : clm ? 1e6 : cfg.laps, training: clm, waitAll: cfg.qualifying, qualifying: cfg.qualifying, penaltiesEnabled: set.penalties, multi: multiplayer, entries: [{ n: multiplayer ? localUid : 1, name: multiplayer ? (online.players[localUid]?.name || 'Vous') : 'Vous', ph: drv, start: field.playerSlot.k + 1, player: true }, ...humanCars.map((c) => ({ n: multiplayer ? c.humanUid : c.n, name: c.humanName, ph: c.ph, start: c.slot.k + 1, human: true })), ...aiCars.map((c) => ({ n: multiplayer ? c.netKey : c.n, name: 'IA ' + c.n, ph: c.ph, start: c.slot.k + 1 }))] });
for (const c of field.cars) {
  const e = race.E.find((x) => x.ph === c.ph);
  if (e) { c.entry = e; c.ph.entry = e; }
}
drv.entry = race.E[0];
const NOGAS = { throttle: 0, brake: 0, steer: 0, rev: true }, IDLE = { throttle: 0, brake: .6, steer: 0, rev: false };
const dmg = createDamage($('dmg')), mp = createMap($('map')), skids = createSkids(R, field.cars.length + 1), smoke = createSmoke(R), radar = createRadar($('radar'));
// Pluie : initialisation après buildTrackMesh (setWeather écrase les couleurs de ciel du circuit)
const rain = createRain(R, resolvedWeather, $('cockpitDrops'));
R.setWeather(resolvedWeather);
smoke.wet = R.weather.wet;
drv.wet = R.weather.wet;
field.cars.forEach((c) => { if (c.ph) c.ph.wet = R.weather.wet; });
// Indicateur météo dans le HUD
const hudWeather = $('hudWeather');
if (hudWeather && resolvedWeather !== 'dry') {
  hudWeather.textContent = resolvedWeather === 'light_rain' ? '🌦️' : '🌧️';
  hudWeather.hidden = false;
}
// Classe CSS sur body pour l'opacité du canvas de gouttes pare-brise
document.body.classList.toggle('rain', resolvedWeather !== 'dry');
let lineMesh = null, zoneMesh = null, lampMesh = null;
for (const [id, k] of [['sLine', 'line'], ['sBrake', 'brake'], ['sMap', 'map'], ['sRadar', 'radar']]) {
  const el = $(id); if (!el) continue; el.checked = !!set[k];
  el.addEventListener('change', () => {
    set[k] = el.checked; saveSet(set);
    if (k === 'map') $('map').hidden = !set.map;
    if (k === 'radar') $('radar').hidden = !set.radar;
  });
}
$('sPenalties').checked = set.penalties;
$('sPenalties').addEventListener('change', () => { set.penalties = $('sPenalties').checked; race.penaltiesEnabled = set.penalties; saveSet(set); });
$('map').hidden = !set.map;
$('radar').hidden = !set.radar;
// Dégâts : effectif = config room en multi, réglage perso sinon ; en multi la case est grisée (l'hôte décide)
// dégâts : cfg.damage (vient du menu, solo ou CLM) prime sur set.damage ; en multi c'est l'hôte qui décide
const damageEnabled = cfg.damage !== false;
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
let gameTime = 0;   // temps continu pour animer les nuages / pluie
let tick = 0, acc = 0, last = 0, sensorClock = 0, ema = DT, slow = 0, camPsi = drv.psi, camY = drv.y + 3, camT = drv.y + 1, hudN = 0, boardAcc = 0, shown = false, qualNotice = false, qualUiTick = 0, lastBest = null, pitMsg = '', pitMsgT = 0, repT = 0, saveAcc = 0, discardingLive = false, finAt = 0, liveShown = false, liveTick = 0, dnfActive = false, dnfElapsed = 0, dnfStopElapsed = 0, dnfHold = 0;
function startPlayerDnf() { if (dnfActive) return; dnfActive = true; dnfElapsed = 0; dnfStopElapsed = 0; dnfHold = 0; playerEngine.failed = true; playerEngine.fade = 0; playerEngine.retiredAt = race.t; race.retire(race.E[0]); drv.ghost = true; pitMsg = ''; pitMsgT = 0; }
const AI_SAVE = ['skill', 'lane', 'p1', 'p2', 'wait', 'tl', 'vt', 'tx', 'tz', 'fault', 'atk', 'atkT', 'passLat', 'defDone', 'defT', 'defSide', 'calm', 'gl', 'dist', 'joined', 'stk', 'rec', 'damage', 'inp', 'blk', 'vf', 'p0', 'pit', 'pitD', 'pitT', 'pitN', 'pitChk', 'pitW', 'pitTO'];
// Réseau fluide : chaque machine est autoritaire sur SA voiture (physique locale 60 Hz) et la publie à 20 Hz en tableau compact.
// L'hôte publie IA + humains ; les clients rejouent les paquets avec un retard fixe (interpolation, extrapolation courte).
const NF = ['x', 'y', 'z', 'psi', 'pitch', 'roll', 'u', 'w', 'r', 's', 'lat', 'kmh'], NLEN = 20, NET_STEP = field.cars.length > 11 ? .055 : .045, DK = ['nose', 'fw', 'hood', 'l', 'r', 'floor', 'rw'];
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const dmArr = (w) => DK.map((k) => Math.round(Math.min(1, Math.max(0, (w && w[k]) || 0)) * 100));
const packCar = (c, w) => [r2(c.x), r2(c.y), r2(c.z), r3(c.psi), r3(c.pitch), r3(c.roll), r2(c.u), r2(c.w), r3(c.r), r2(c.s), r2(c.lat), Math.round(c.kmh), c.raceFinished ? 1 : (c.gone || c.dnf || c.entry?.dnf) ? 2 : 0, ...dmArr(w)];
const SCL = [100, 100, 100, 1000, 1000, 1000, 100, 100, 1000, 100, 100, 1, 1, 1, 1, 1, 1, 1, 1, 1], SC = new Float64Array(NLEN), LEN = TRACK.length;
const packSC = (a) => { const o = new Array(NLEN); for (let i = 0; i < NLEN; i++) o[i] = Math.round(a[i] * SCL[i]) / SCL[i]; return o; };   // voiture distante : pose extrapolée, avant collisions de l'hôte
const netRT = () => ({ phase: race.phase, clock: race.clock, t: race.t, lights: race.lights, hold: race.hold, allReady: multiReady });
const netRE = () => ({
  phase: race.phase,
  results: race.results || null,
  E: race.E.map((e) => ({
    n: e.n,
    p0: Number.isFinite(e.p0) ? e.p0 : 0,
    p: Number.isFinite(e.p) ? e.p : 0,
    maxP: Number.isFinite(e.maxP) ? e.maxP : 0,
    prevS: Number.isFinite(e.prevS) ? e.prevS : 0,
    k: Number.isInteger(e.k) ? e.k : 0,
    lapStart: Number.isFinite(e.lapStart) ? e.lapStart : null,
    best: Number.isFinite(e.best) ? e.best : null,
    last: Number.isFinite(e.last) ? e.last : null,
    fin: Number.isFinite(e.fin) ? e.fin : null,
    fl: Number.isInteger(e.fl) ? e.fl : 0,
    fp: Number.isFinite(e.fp) ? e.fp : 0,
    dnf: !!e.dnf,
    dnfReady: !!e.dnfReady
  }))
});
function applyArr(c, a, fin) {
  for (let i = 0; i < 12; i++) c[NF[i]] = a[i];
  if (c.s >= LEN) c.s -= LEN; else if (c.s < 0) c.s += LEN;
  const hint = (Number.isInteger(c.idx) && c.idx >= 0) ? c.idx : (Number.isFinite(c.s) ? Math.floor(((c.s % TRACK.length) + TRACK.length) % TRACK.length / TRACK.ds) : -1);
  let l = locate(c.x, c.z, hint);
  if (l && Math.abs(l.lat) > 35 && hint >= 0) l = locate(c.x, c.z, -1);
  if (l && Number.isFinite(l.y)) {
    c.idx = l.i;
    c.y = l.y;
    const j = (l.i + 1) % TRACK.N, slope = Math.atan((TRACK.P[j * 3 + 1] - TRACK.P[l.i * 3 + 1]) / TRACK.ds * (Math.cos(c.psi) * l.tx + Math.sin(c.psi) * l.tz));
    if (Number.isFinite(slope)) c.pitch = slope;
  }
  if (fin && a[12] === 1) c.raceFinished = true;
  if (fin && a[12] === 2) {
    c.dnf = true;
    c.gone = true;
    c.ghost = true;
    const e = c.entry || race.E.find((x) => x.ph === c);
    if (e && !e.dnf) race.retire(e);
  }
  const dm = c.dmo || (c.dmo = {}); for (let i = 0; i < 7; i++) dm[DK[i]] = (a[13 + i] || 0) / 100;
  c.v = c.u; const p = c.prev; p.x = c.x; p.y = c.y; p.z = c.z; p.psi = c.psi;
}
let netPend = 0, lastResub = 0, netAcc = 0, netSeq = 0, netBusy = false, netDirty = false, netRaceDirty = false, netRetry = null, netUnwatch = null, netLast = 0, seenAt = 0;
const guestBuf = Net.newChan(), humanBufs = {}, one = { k: null };
function onRuntime(s) {   // invité : paquet hôte
  if (!s || hostMode) return;
  if (s.cars && s.stamp) Net.chanPush(guestBuf, s.stamp, s.cars);
  const rt = s.rt;
  if (rt) {
    for (const k of ['phase', 'clock', 't', 'lights', 'hold']) {
      if (rt[k] !== undefined) race[k] = rt[k];
    }
    if (rt.allReady) multiReady = true;
  }
  const rs = s.race;
  if (rs) {
    if (rs.phase !== undefined) race.phase = rs.phase;
    if (rs.results !== undefined && rs.results !== null) race.results = rs.results;
    if (Array.isArray(rs.E)) {
      for (const se of rs.E) {
        const e = race.E.find((x) => x.n === se?.n);
        if (e) {
          if (race.phase === 'go' && e === race.E[0] && se.last !== null && (se.k || 0) >= 2 && (e.lastLapK || 0) < (se.k || 0)) {
            e.lastLapK = se.k || 0;
            const lapPen = race.lapPenalty || 0;
            const guestLapTime = se.last + lapPen;
            e.last = guestLapTime;
            const isNewBest = (e.best === null || guestLapTime < e.best);
            if (isNewBest) e.best = guestLapTime;
            race.lapMsg = 'Tour ' + Math.max(1, (se.k || 1) - 1) + ' · ' + fmt(guestLapTime) + (isNewBest ? ' · Meilleur tour personnel !' : '');
            race.lapMsgT = 3.2;
            race.lapPenalty = 0;
          }
          for (const k of ['p0', 'p', 'maxP', 'prevS', 'k', 'lapStart', 'fin', 'fl', 'fp']) {
            if (se[k] !== undefined) e[k] = se[k];
          }
          if (e !== race.E[0] && race.timePenalty === 0 && (race.lapPenalty || 0) === 0) {
            if (se.last !== undefined) e.last = se.last;
            if (se.best !== undefined) e.best = se.best;
          }
          if (typeof se.dnf === 'boolean') {
            e.dnf = se.dnf;
            if (se.dnf) {
              const c = field.cars.find((q) => (q.humanUid || q.netKey) === e.n);
              if (c) {
                c.ph.ghost = true;
                if (!c.humanUid) {
                  c.ph.dnf = true;
                  c.ph.gone = true;
                } else if (!c.ph.ghost) {
                  c.remoteDnfFade = 0;
                }
              }
            }
          }
          if (typeof se.dnfReady === 'boolean') e.dnfReady = se.dnfReady;
        }
      }
    }
  }
}
function onPlayers(pl) {   // hôte : paquets des invités
  if (!pl) return;
  for (const c of humanCars) {
    const p = pl[c.humanUid]?.carState || pl[c.humanUid]?.car;
    if (p?.a && p.t) { one.k = p.a; Net.chanPush(humanBufs[c.humanUid] ||= Net.newChan(), p.t, one); }
    if (pl[c.humanUid]?.gameReady || (p?.t && p.t > 0)) { c.gameReady = true; }
    const pen = pl[c.humanUid]?.pen, dtf = pl[c.humanUid]?.dt, dnfDone = pl[c.humanUid]?.dnfDone, lapPen = pl[c.humanUid]?.lapPen, rBest = pl[c.humanUid]?.best;
    if (dtf !== undefined && (dtf === 0 || dtf === 1 || dtf === false || dtf === true)) { const e = race.E.find((x) => x.n === c.humanUid); if (e) e.dt = !!dtf; }
    if (race.phase === 'go' && pl[c.humanUid]?.dnf === true && !c.ph.ghost) { const e = race.E.find(x => x.n === c.humanUid); if (e) race.retire(e); c.ph.ghost = true; c.remoteDnfFade = 0; }
    if (typeof dnfDone === 'boolean') { const e = race.E.find(x => x.n === c.humanUid); if (e) e.dnfReady = dnfDone; }
    if (typeof lapPen === 'number') { const e = race.E.find((x) => x.n === c.humanUid); if (e) e.lapPenalty = lapPen; }
    if (typeof rBest === 'number' && Number.isFinite(rBest)) { const e = race.E.find((x) => x.n === c.humanUid); if (e) { if (e.best === null || rBest < e.best) e.best = rBest; } }
    if (typeof pen === 'number') {
      const e = race.E.find((x) => x.n === c.humanUid);
      if (e) e.timePenalty = pen;
    }
  }
}
function syncNet() {   // pose de chaque voiture distante estimée à « maintenant » (extrapolation + lissage) : rendu ET collisions utilisent la même pose
  const now = performance.now(), dt = Math.min(.25, (now - netLast) / 1000 || 0); netLast = now;
  if (hostMode) { for (const c of humanCars) { const B = humanBufs[c.humanUid]; if (B && Net.chanSample(B, 'k', dt, SC)) applyArr(c.ph, SC, false); } return; }
  for (const c of humanCars) if (Net.chanSample(guestBuf, c.humanUid, dt, SC)) applyArr(c.ph, SC, true);
  for (const c of aiCars) if (Net.chanSample(guestBuf, c.netKey, dt, SC)) applyArr(c.ph, SC, true);
  const mine = Net.chanRaw(guestBuf, localUid);
  if (mine && mine[12] === 1) drv.raceFinished = true;
  if (race.E[0].fin !== null) drv.raceFinished = true;
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
        for (const c of humanCars) { const B = humanBufs[c.humanUid]; cars[c.humanUid] = B && Net.chanSample(B, 'k', 0, SC) ? packSC(SC) : packCar(c.ph, c.ph.dmo); }   // relais : pose non perturbée par les collisions de l'hôte
        for (const c of aiCars) cars[c.netKey] = packCar(c.ph, c.ai.damage.w);
        d['runtime/stamp'] = t; d['runtime/cars'] = cars; d['runtime/rt'] = netRT();
        if (netRaceDirty || netSeq++ % 5 === 0 || race.phase === 'finished' || race.firstFin) { d['runtime/race'] = netRE(); netRaceDirty = false; }
      } else {
        d[`players/${localUid}/carState`] = { t, a: packCar(drv, dmg.w) };
        if (localLoaded) d[`players/${localUid}/gameReady`] = true;
        if (race.timePenalty > 0) d[`players/${localUid}/pen`] = race.timePenalty;
        d[`players/${localUid}/lapPen`] = race.lapPenalty || 0;
        if (race.E[0]?.best !== null && Number.isFinite(race.E[0]?.best)) d[`players/${localUid}/best`] = race.E[0].best;
        d[`players/${localUid}/dt`] = race.dt ? 1 : 0;
        if (playerEngine.failed) {
          d[`players/${localUid}/dnf`] = true;
          d[`players/${localUid}/dnfDone`] = !!race.E[0].dnfReady;
        } else {
          d[`players/${localUid}/dnf`] = null;
          d[`players/${localUid}/dnfDone`] = null;
        }
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
    const entries = race.E.map((e) => Object.fromEntries(['n', 'p0', 'p', 'maxP', 'prevS', 'k', 'lapStart', 'best', 'last', 'fin', 'fl', 'fp', 'dnf', 'dnfReady'].map((k) => [k, e[k]])));
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
const testInfo = (() => { try { const raw = sessionStorage.getItem('little-turismo-test'); return raw ? JSON.parse(raw) : null; } catch { return null; } })();
const btnEditor = $('backToEditor');
if (btnEditor && testInfo) {
  btnEditor.hidden = false;
  btnEditor.addEventListener('click', () => {
    try {
      sessionStorage.setItem('little-turismo-return-editor', JSON.stringify(testInfo));
      sessionStorage.removeItem('little-turismo-test');
      sessionStorage.removeItem('little-turismo-loading');
      localStorage.removeItem(LIVE_KEY);
    } catch { }
    location.href = 'index.html#' + (testInfo.type === 'car' ? 'designer' : 'tdesigner');
  });
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.repeat) setPause(!paused); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !multiplayer) setPause(true); });
const restored = restoreLive(multiplayer ? null : live);
drv.wet = wetFactor;
for (const c of field.cars) if (c.ph) c.ph.wet = wetFactor;
if (restored && race.phase !== 'finished') setPause(true);
else if (!restored && !go && !multiplayer && nav && nav.type === 'reload') setPause(true);
if (restored && race.phase === 'finished') persistLive();
addEventListener('pagehide', persistLive);
cam.aspect = R.resize();
addEventListener('resize', () => { cam.aspect = R.resize(); });

const hud = $('hud'), lights = $('lights').children, mapCars = [];
// Classement local : - devant (rouge), + derrière (vert). Progression cumulée locale, fluide pour hôte et invités.
const boardEl = $('board'), rows = Array.from({ length: 5 }, () => { const d = document.createElement('div'); d.innerHTML = '<i></i><span></span><b></b>'; boardEl.appendChild(d); return d; });
const boardCars = race.E.map((e) => ({ e, p: e.p, s: e.ph.s, score: 0 })), playerBoardCar = boardCars[0], LENT = TRACK.length, wrapT = (d) => d - LENT * Math.round(d / LENT);
const boardCmp = (a, b) => {
  if (!!a.e.dnf !== !!b.e.dnf) return a.e.dnf ? 1 : -1;
  if (a.e.dnf && b.e.dnf) return ((b.e.fl || 0) - (a.e.fl || 0)) || ((a.e.fin || 0) - (b.e.fin || 0));
  const afin = a.e.fin !== null, bfin = b.e.fin !== null;
  const fla = afin ? (a.e.fl ?? cfg.laps) : Math.max(0, a.e.k - 1);
  const flb = bfin ? (b.e.fl ?? cfg.laps) : Math.max(0, b.e.k - 1);
  if (afin && bfin) {
    if (fla !== flb) return flb - fla;
    return a.e.fin - b.e.fin;
  }
  if (afin && fla >= cfg.laps && !bfin) return -1;
  if (bfin && flb >= cfg.laps && !afin) return 1;
  return (b.score - a.score) || (afin ? -1 : bfin ? 1 : 0);
};
function updateBoard() {
  boardEl.hidden = race.qualifying || clm; if (race.qualifying || clm) return;
  for (let j = 0; j < boardCars.length; j++) {
    const q = boardCars[j];
    if (multiplayer && !hostMode && q !== playerBoardCar && Number.isFinite(q.e.p)) {
      q.p = q.e.p;
      q.s = q.e.ph.s;
    } else {
      const d = wrapT(q.e.ph.s - q.s); q.s = q.e.ph.s;
      if (Math.abs(d) < 80) q.p += d;
    }
    q.score = q.e.fin !== null ? q.e.fp : q.p;
  }
  for (let a = 1; a < boardCars.length; a++) {
    const item = boardCars[a]; let b = a - 1;
    while (b >= 0 && boardCmp(boardCars[b], item) > 0) { boardCars[b + 1] = boardCars[b]; b--; }
    boardCars[b + 1] = item;
  }
  let i = 0; while (boardCars[i] !== playerBoardCar) i++;
  const n = boardCars.length, st = Math.max(0, Math.min(i - 2, n - 5));
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r], q = boardCars[st + r]; row.hidden = !q; if (!q) continue;
    const isMe = q === playerBoardCar;
    row.className = (isMe ? 'me ' : '') + (q.e.dnf ? 'dnf' : '');
    row.children[0].textContent = st + r + 1; row.children[1].textContent = q.e.dnf ? 'DNF · ' + (isMe ? 'Vous' : q.e.name) : (q.e.fin !== null ? '🏁 ' : '') + (isMe ? 'Vous' : q.e.name);
    const b = row.children[2];
    if (q.e.dnf) { b.textContent = ''; b.className = ''; continue; } if (isMe) { b.textContent = '—'; b.className = ''; continue; }
    const rivalAhead = st + r < i;
    const lapDelta = (q.score - q.e.p0) - (playerBoardCar.score - playerBoardCar.e.p0), lapGap = Math.floor(Math.abs(lapDelta) / LENT);
    if (lapGap >= 1) {
      b.textContent = (rivalAhead ? '-' : '+') + lapGap + ' T'; b.className = rivalAhead ? 'f' : 'r';
    } else {
      const found = race.gapAtSameProgress(playerBoardCar.e, q.e), value = Number.isFinite(found) ? Math.abs(found) : NaN;
      b.textContent = Number.isFinite(value) ? (rivalAhead ? '-' : '+') + value.toFixed(3) : '—';
      b.className = !Number.isFinite(value) ? '' : rivalAhead ? 'f' : 'r';
    }
  }
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
  if (inPitBox(drv) && drv.kmh < 5 && (Object.values(dmg.w).some((v) => v > .01) || playerEngine.motor > 0 || playerEngine.cooling > 0)) {
    repT += dt; pitMsg = 'Réparation… ' + Math.max(0, PIT_FIX - repT).toFixed(1) + ' s'; pitMsgT = .3;
    if (repT >= PIT_FIX) { dmg.repair(); if (playerEngine.motor < .5 && playerEngine.cooling < .5) repairEngine(playerEngine, dmg.w); repT = 0; pitMsg = 'Voiture réparée !'; pitMsgT = 2.5; }
  } else repT = 0;
  if (lane && pitMsgT <= 0) say('Pit limiter actif · 80 km/h', .3);
}
function updateHud() {
  const rk = race.rank(), pl = race.E[0], lap = Math.min(clm ? 1e9 : cfg.laps, Math.max(1, pl.k)), lapTxt = race.qualifying ? 'Qualifications en 1 tour' : clm ? String(lap) : lap + '/' + cfg.laps;
  $('hPos').textContent = pl.dnf ? 'DNF' : clm ? '–' : (rk.indexOf(pl) + 1) + '/' + race.E.length;
  $('hLap').textContent = lapTxt; $('hLap').classList.toggle('long', race.qualifying); $('dashLap').classList.toggle('long', race.qualifying);
  $('hTime').textContent = pl.lapStart === null ? '–' : fmt(race.t - pl.lapStart + race.lapPenalty);
  $('hBest').textContent = fmt(pl.best);
  $('hPenalty').textContent = penTxt();
  $('hSpd').textContent = Math.round(drv.kmh);
  $('hGear').textContent = drv.rev ? 'R' : (Math.floor(drv.gear) + 1);
  if (pl.best !== null && pl.best !== lastBest) { lastBest = pl.best; clm ? saveClm(cfg.circuit, cfg.car, pl.best) : saveRec(pl.best, null, cfg.circuit); }   // record de tour sauvé dès qu'il tombe
  $('lightsWrap').hidden = race.phase === 'go' || race.phase === 'finished';
  for (let i = 0; i < lights.length; i++) lights[i].classList.toggle('on', race.lights > i);
  $('banner').textContent = dnfActive && dnfElapsed < 3 ? 'Panne moteur, arrêt forcé dans ' + Math.max(1, Math.ceil(3 - dnfElapsed)) : dnfActive && !race.E[0].dnfReady ? 'Panne moteur · arrêt forcé' : pitMsgT > 0 ? pitMsg : race.penaltyMsgT > 0 ? race.penaltyMsg : (race.phase === 'go' && race.lapMsgT > 0) ? race.lapMsg : dtHint() || (race.penalty > 0 ? 'Faux départ ! Accélération bloquée' : (race.goMsg > 0 ? 'GO !' : (race.phase === 'lights' ? '' : race.msg)));
  const sp = String(Math.round(drv.kmh)); $('dashSpeed').textContent = sp; for (const t of WS) t.textContent = sp;
  const rf = Math.max(0, Math.min(1, (drv.rpm - 1100) / 6900)), gr = drv.rev ? 'R' : String(Math.floor(drv.gear) + 1);
  $('hRpm').style.width = (rf * 100).toFixed(0) + '%'; $('hRpm').classList.toggle('red', rf > .92);
  $('dashGear').textContent = gr; $('dashRpm').textContent = Math.round(drv.rpm / 10) * 10; $('dashLap').textContent = lapTxt;
  $('dashPos').textContent = clm ? '–' : (rk.indexOf(pl) + 1) + '/' + race.E.length; $('dashTime').textContent = $('hTime').textContent; $('dashBest').textContent = fmt(pl.best);
  $('dashPen').textContent = penTxt();
  for (const t of WG) t.textContent = gr;
}
const WG = [...document.querySelectorAll('.wg')], WS = [...document.querySelectorAll('.ws')], WB = document.querySelector('.wb'), LEDS = [...document.querySelectorAll(['open', 'wedge', 'proto'].includes(look(sheet).kind) ? '.lds circle' : '#shiftBar i')], CK = $('cockpit');
const EYE = { gt: 1.12, wedge: 1.0, proto: 1.02, open: .95, rally: 1.32 }[look(sheet).kind] || 1.12;
const OPENV = look(sheet).kind === 'open', LOCK = { open: 55, wedge: 70, proto: 70 }[look(sheet).kind] || 110;   // débattement visuel du volant (°) : réduit si volant à écran, pour rester lisible
{   // livrée (nez, jantes) + graduations du compte-tours (une seule fois)
  const lk = look(sheet), rgb = (c) => 'rgb(' + c.map((v) => Math.round(v * 255)).join() + ')', ds = $('dialSvg'); let h = '';
  CK.style.setProperty('--lv', rgb(lk.color)); CK.style.setProperty('--ac', rgb(lk.accent));
  for (let k = 2; k <= 8; k += .5) {
    const a = (-120 + 240 * (k * 1000 - 1100) / 6900) * Math.PI / 180, x = Math.sin(a), y = -Math.cos(a), M = k % 1 === 0, r = M ? 29 : 32, c = k >= 6.5 ? '#ff6a5c' : '#cfeee0';
    h += '<path d="M' + (50 + x * r).toFixed(1) + ' ' + (50 + y * r).toFixed(1) + 'L' + (50 + x * 35).toFixed(1) + ' ' + (50 + y * 35).toFixed(1) + '" stroke="' + c + '" stroke-width="' + (M ? 1.5 : .7) + '"/>';
    if (M) h += '<text x="' + (50 + x * 21).toFixed(1) + '" y="' + (50 + y * 21 + 2.6).toFixed(1) + '" text-anchor="middle" font-size="7.5" font-weight="700" fill="#cfeee0">' + k + '</text>';
  }
  ds.innerHTML = h;
}
const F1 = OPENV ? createF1Cockpit(CK, CK.querySelector('.cp-front')) : null;
const WH = $('wheel'), ND = $('needle'), PT = $('pThr'), PB = $('pBrk'), cc = { a: NaN, n: NaN, t: -1, b: -1, w: -1, s: -1 };
/** Cockpit (chaque image) : volant qui tourne, aiguille, LED de changement de rapport, pédales, barre de régime du volant. Écritures DOM seulement si la valeur affichée change. */
function cockpitTick() {
  const st = input.state, rf = Math.max(0, Math.min(1, (drv.rpm - 1100) / 6900)), flash = rf > .965 && (Math.floor(performance.now() / 70) & 1);
  const a = Math.round(st.steer * LOCK * 2) / 2, n = Math.round((-120 + rf * 240) * 2) / 2, t = Math.round(st.throttle * 100), b = Math.round(st.brake * 100), w = Math.round(rf * 66), sk = Math.round(Math.min(1, drv.kmh / 300) * (drv.surf ? 2.2 : .5) * 10);
  if (a !== cc.a) { cc.a = a; WH.style.transform = 'translateX(-50%) rotate(' + a + 'deg)'; CK.style.setProperty('--st', st.steer.toFixed(2)); }
  if (n !== cc.n) { cc.n = n; ND.style.transform = 'rotate(' + n + 'deg)'; }
  if (t !== cc.t) { cc.t = t; PT.style.height = t + '%'; }
  if (b !== cc.b) { cc.b = b; PB.style.height = b + '%'; }
  if (WB && w !== cc.w) { cc.w = w; WB.setAttribute('width', w); }
  for (let i = 0; i < LEDS.length; i++) LEDS[i].classList.toggle('on', rf > .5 + i * .04 && (!flash || i % 2 === 0));
  if (F1) F1.draw(st.steer, drv.kmh);
  if (sk !== cc.s) { cc.s = sk; CK.style.setProperty('--shake', (sk / 10).toFixed(2)); }
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
  $('again').hidden = true; // Bug 3 fix : on garde toujours le bouton Menu visible dans la modal de fin
  const rk = race.rank(), wf = rk[0].fin, tb = $('resBody'); tb.textContent = '';
  rk.forEach((e, i) => {
    const gap = e.dnf ? '' : e.fin === null ? 'En piste' : i === 0 ? fmt(e.fin) : e.fl < rk[0].fl ? '+' + (rk[0].fl - e.fl) + ' tour(s)' : '+' + (e.fin - wf).toFixed(2) + ' s';
    const tr = document.createElement('tr'); if (e === race.E[0]) tr.className = 'me'; if (e.dnf) tr.classList.add('dnf');
    for (const v of [e.dnf ? 'DNF' : i + 1, formatPlayerNum(e.n), e.dnf ? 'DNF · ' + e.name + ' · ' + Math.max(0, e.fl || 0) + ' tour(s)' : (e.fin !== null ? '🏁 ' : '') + e.name, e.start, fmt(e.best), gap]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
    tb.appendChild(tr);
  });
  $('results').hidden = false;
}
function toLobby() { const s = Net.readSession(); if (s) { s.going = false; delete s.players; Net.saveSession(s); } location.href = 'index.html'; }
async function replayMulti() {   // hôte : remet la room en attente ; invités : suivent dès que l'hôte l'a fait
  const b = $('again'); b.disabled = true;
  await Net.init();
  if (hostMode) {
    // Garder players/<uid>/car (choix du lobby), mais effacer les snapshots de conduite et états de course.
    const d = { state: 'waiting', runtime: null };
    for (const [uid] of sortedHumans) {
      d['players/' + uid + '/carState'] = null;
      d['players/' + uid + '/dnf'] = null;
      d['players/' + uid + '/dnfDone'] = null;
      d['players/' + uid + '/pen'] = null;
      d['players/' + uid + '/dt'] = null;
    }
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
  const r = race.results; shown = true; skids.clear(); smoke.clear(); input.reset(); $('pause').hidden = true; paused = false;
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
    const me_ = r.rows.find(isMine) || r.rows[0], win = me_.place === 1 && !me_.dsq && !me_.dnf;
    $('resTitle').textContent = me_.dnf ? 'Vous n’avez pas terminé la course' : win ? '🏆 Victoire !' : me_.dsq ? 'Disqualifié (DSQ)' : 'Course terminée';
    if (!me_.dnf) saveRec(race.E[0].best, me_.dsq ? null : me_.place, cfg.circuit);
    $('resSub').textContent = me_.dnf ? 'Panne moteur · abandon après ' + (me_.laps || Math.max(0, race.E[0].fl || 0)) + ' tour(s).' : me_.dsq ? 'Drive-through non effectué : vous êtes disqualifié.' : win ? 'Vous terminez premier.' : 'Vous terminez ' + me_.place + (me_.place === 1 ? 'er' : 'e') + ' sur ' + r.rows.length + '.';
  }
  const tb = $('resBody'); tb.textContent = '';
  for (const x of r.rows) {
    const tr = document.createElement('tr'); if (isMine(x)) tr.className = 'me';
    const bestVal = (isMine(x) && race.E[0]?.best !== null) ? race.E[0].best : x.best;
    if (x.dnf) tr.classList.add('dnf'); for (const v of [x.dnf ? 'DNF' : x.dsq ? 'DSQ' : x.place, formatPlayerNum(x.n), x.dnf ? 'DNF · ' + x.name + ' · ' + x.laps + ' tour(s)' : x.name, x.start, fmt(bestVal), x.dnf ? '' : x.gap]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
    tb.appendChild(tr);
  }
  $('results').hidden = false;
}
function showQualifyingProgress() {
  qualNotice = true;
  $('resTitle').textContent = '🏁 Qualifications en cours';
  $('resSub').textContent = 'Votre tour est terminé. Les IA terminent leur tour en arrière-plan…';
  $('again').hidden = true; // Bug 3 fix : on garde toujours le bouton Menu visible dans la modal de fin
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

let fpsCount = 0, fpsLast = performance.now();
//const fpsEl = $('fpsLog');

function frame(ts) {
  requestAnimationFrame(frame);
  fpsCount++;
  const fpsNow = performance.now();
  if (fpsNow - fpsLast >= 250) {
    const curFps = Math.round((fpsCount * 1000) / (fpsNow - fpsLast));
    //if (fpsEl) fpsEl.textContent = curFps + ' FPS';
    fpsCount = 0;
    fpsLast = fpsNow;
  }
  const dt = (paused && !multiplayer) ? 0 : Math.min(.1, (ts - last) / 1000 || 0); last = ts;
  gameTime += dt;
  if (multiplayer && hostMode && !multiReady) {
    const allGuestsReady = humanCars.every((c) => c.gameReady || online.players?.[c.humanUid]?.away);
    hostWaitTime += dt;
    if (allGuestsReady || hostWaitTime > 15) {
      multiReady = true;
    } else if (loading && !loading.hidden) {
      const readyCount = humanCars.filter(c => c.gameReady).length;
      loadUpdate('En attente des pilotes… (' + readyCount + '/' + humanCars.length + ')', 98);
    }
  }
  const canDismiss = localLoaded && (!multiplayer || multiReady);
  if (loadGate && !loadFading && canDismiss) {
    loadFading = true;
    loadUpdate('Grille prête · départ imminent', 100);
    loading.classList.add('loading-out');
    setTimeout(() => { loading.hidden = true; loadGate = false; }, 240);
  }
  if (multiplayer && !hostMode) {
    race.lapMsgT = Math.max(0, race.lapMsgT - dt);
  }
  ema += (dt - ema) * .05;
  if (ema > .03 && R.scale > .5) { if (++slow > 40) { slow = 0; ema = DT; cam.aspect = R.resize(R.scale * .8); } } else slow = 0;
  // Guest mode: apply network snapshot once per frame (outside the physics loop)
  if (multiplayer) syncNet();
  for (const c of aiCars) {
    const isDnf = !!(c.entry?.dnf || c.ai?.engine?.failed || c.ph.dnf);
    if (isDnf) {
      c.ph.gone = true;
      c.ph.ghost = true;
      c.ph.dnf = true;
      if (c.entry && !c.entry.dnf) race.retire(c.entry);
    } else if (c.ph.raceFinished) {
      c.ph.gone = true;
      c.ph.ghost = true;
    } else {
      c.ph.gone = false;
    }
  }
  for (const c of humanCars) if (c.ph.ghost) {
    c.remoteDnfFade = (c.remoteDnfFade || 0) + dt;
    if (c.remoteDnfFade > 2.8 && Array.isArray(c.sc)) c.sc = c.sc.map((v) => Math.max(.01, v * (1 - dt * .65)));
    if (c.remoteDnfFade > 4.8) c.ph.gone = true;
  }
  acc += dt;
  while (acc >= DT) {
    input.update(DT);
    if (!multiplayer || hostMode) {
      if (!loadGate && multiReady) {
        race.update(DT, input.state.throttle);
        sensorClock = race.t;
      }
    } else if (!loadGate) {
      if (race.phase === 'lights' && input.state.throttle > .3) { race.falseStart = true; if (!race._falseStartHandled) { race._falseStartHandled = true; if (!race.qualifying && !clm) { race.dt = true; race.penaltyMsg = 'Faux départ : drive-through à effectuer'; race.penaltyMsgT = 4; } } }
      if (race.phase === 'go') {
        if (race.falseStart && race.penalty === 0 && !race._falseStartHandled) {
          race._falseStartHandled = true;
          if (!race.qualifying && !clm) { race.dt = true; race.penaltyMsg = 'Faux départ : drive-through à effectuer'; race.penaltyMsgT = 4; }
        }
        race.checkCut(drv, DT);
      }
      if (race.phase === 'go') sensorClock += DT;
      race.penaltyMsgT = Math.max(0, race.penaltyMsgT - DT);
      // Bug 2 fix : decremente aussi lapMsgT cote invite (race.update() n'est pas appele pour les invites)
      race.lapMsgT = Math.max(0, race.lapMsgT - DT);
      if (race.penalty > 0) race.penalty = Math.max(0, race.penalty - DT);
    }
    if (race.phase === 'lights' && race.falseStart && !liveShown) {
      stepCar(drv, input.state, DT);
      for (const c of field.cars) { const o = c.ph; if (o.gone || o.ghost) continue; const dx = o.x - drv.x, dz = o.z - drv.z; if (dx * dx + dz * dz < 30) collide([drv, o]); }   // collisions avec la grille
      if (damageEnabled && drv.hv > 0) { dmg.hit(drv.hv, drv.hnx, drv.hnz, drv.psi); drv.hv = 0; } else { drv.hv = 0; }
      if (damageEnabled) { dmg.tick(DT, drv.surf, drv.kmh); dmg.apply(drv); }
    }   // faux départ : on part quand même (drive-through)
    if (race.phase === 'go' && !loadGate) {
      let gi = liveShown && !dnfActive ? IDLE : input.state; if (damageEnabled && !playerEngine.failed && engineIncrement(playerEngine, gi.throttle, DT, dmg.w, inLane || inPitBox(drv))) startPlayerDnf(); if (dnfActive) { dnfElapsed += DT; gi = { throttle: 0, brake: gi.brake, steer: gi.steer, rev: false }; if (dnfElapsed >= 1.2 || Math.abs(drv.kmh) < 2) { dnfStopElapsed += DT; gi.brake = Math.max(gi.brake, Math.min(.8, .3 + dnfStopElapsed * .3)); if (Math.abs(drv.kmh) < 1) { gi.brake = .8; drv.u = 0; drv.kmh = 0; dnfHold += DT; if (dnfHold >= .3) race.E[0].dnfReady = true; } } } if (race.penalty > 0) { NOGAS.steer = gi.steer; NOGAS.brake = gi.brake; NOGAS.rev = gi.rev; }
      if (!multiplayer || hostMode) {
        if (!race.qualifying || race.E[0].fin === null) stepCar(drv, race.penalty > 0 ? NOGAS : gi, DT);
        race.checkCut(drv, DT);
        stepField(ais, all, tick++, DT, !race.qualifying, !!race.qualifying, !damageEnabled);
        for (const c of aiCars) {
          if (c.ai?.engine?.failed) {
            const e = c.entry || race.E.find((x) => x.n === (multiplayer ? c.netKey : c.n));
            if (e && !e.dnf) race.retire(e);
            c.ph.dnf = true;
            c.ph.gone = true;
            c.ph.ghost = true;
            if (multiplayer && hostMode) {
              netRaceDirty = true;
              publishNetwork();
            }
          }
        }
        if (damageEnabled && drv.hv > 0) { dmg.hit(drv.hv, drv.hnx, drv.hnz, drv.psi); drv.hv = 0; } else { drv.hv = 0; }
        if (damageEnabled) { dmg.tick(DT, drv.surf, drv.kmh); } pitService(DT); if (damageEnabled) dmg.apply(drv);
      } else {
        // Invité : seule la physique locale du joueur tourne côté client
        stepCar(drv, race.penalty > 0 ? NOGAS : gi, DT);
        // Collisions locales : ma voiture contre les voitures distantes (leur pose vient du réseau), dégâts comme à l'hôte
        if (!race.qualifying) for (const c of field.cars) { const o = c.ph; if (o.gone || o.ghost) continue; const dx = o.x - drv.x, dz = o.z - drv.z; if (dx * dx + dz * dz < 30) collide([drv, o]); }
        if (damageEnabled && drv.hv > 0) { dmg.hit(drv.hv, drv.hnx, drv.hnz, drv.psi); drv.hv = 0; } else { drv.hv = 0; }
        if (damageEnabled) { dmg.tick(DT, drv.surf, drv.kmh); } pitService(DT); if (damageEnabled) dmg.apply(drv);
      }
    }
    if (race.phase === 'go') { const localRaceTime = multiplayer && !hostMode ? sensorClock : race.t; for (let ei = 0; ei < race.E.length; ei++) race.observeSensors(ei, localRaceTime); }
    if (multiplayer) { netAcc += DT; if (netAcc >= NET_STEP) { netAcc = 0; publishNetwork(); } }
    acc -= DT;
    if (!multiplayer) { saveAcc += DT; if (saveAcc >= .4) { saveAcc = 0; persistLive(); } }
  }
  if (race.qualifying && !shown && race.phase !== 'finished' && race.E[0].fin !== null && (!qualNotice || ++qualUiTick % 30 === 0)) showQualifyingProgress();
  if (multiplayer && !race.qualifying && !shown && humanCars.length && race.E[0].fin !== null) { if (!race.E[0].dnf || race.E[0].dnfReady || dnfElapsed >= 2.5) { finAt ||= performance.now(); if (performance.now() - finAt > 600 && race.phase !== 'finished' && (!liveShown || ++liveTick % 30 === 0)) showLive(); } }
  if (race.phase === 'finished' && !shown && (race.results || !multiplayer || hostMode)) showResults();
  if (R.lost) return;
  boardAcc += dt; if (boardAcc >= .1) { boardAcc = 0; updateBoard(); }
  if (++hudN % 4 === 0) { updateHud(); dmg.draw(); }
  if (set.map && hudN % 2 === 0 && !race.qualifying) {
    mapCars.length = 0;
    for (const c of field.cars) {
      const isAiGone = !c.humanUid && (c.ph.gone || c.ph.raceFinished || c.entry?.dnf || c.ai?.engine?.failed);
      if (!c.ph.gone && !isAiGone) mapCars.push(c);
    }
    mp.draw(drv, mapCars);
  }
  if (set.radar && !race.qualifying) {
    radar.draw(drv, field.cars);
  }
  const a = acc / DT, p = drv.prev;
  let camCar = drv;
  me.x = p.x + ((camCar === drv ? drv.x : camCar.x) - p.x) * a; me.y = camCar === drv ? p.y + (drv.y - p.y) * a : camCar.y; me.z = camCar === drv ? p.z + (drv.z - p.z) * a : camCar.z; me.psi = camCar === drv ? p.psi + wrap(drv.psi - p.psi) * a : camCar.psi;
  me.pitch = drv.pitch; me.roll = drv.roll; me.u = drv.u; me.sa = drv.sa; me.bk = drv.bk;
  if (!Number.isFinite(camPsi)) camPsi = me.psi || 0;
  camPsi += wrap((me.psi || 0) - camPsi) * (1 - Math.exp(-(set.view === 'cockpit' || set.view === 'front' ? 12 : 5) * dt));
  if (!Number.isFinite(camPsi)) camPsi = me.psi || 0;
  const fx = Math.cos(camPsi), fz = Math.sin(camPsi), rx = -fz, rz = fx;
  let cx, cz, cy, tx, tz, ty;
  if (set.view === 'cockpit') {
    cx = me.x + fx * .05; cz = me.z + fz * .05; cy = me.y + EYE;
    tx = me.x + fx * 28; tz = me.z + fz * 28; ty = me.y + (OPENV ? EYE - 5 : 1.25);   // monoplace : caméra légèrement penchée vers la piste comme en onboard F1
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
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz) || !Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) {
    cx = me.x - fx * 8.5; cy = me.y + 3.1; cz = me.z - fz * 8.5;
    tx = me.x; ty = me.y + 1; tz = me.z;
  }
  if (set.view === 'cockpit') cockpitTick();
  cam.look(cx, cy, cz, tx, ty, tz);
  if (!shown) {
    smoke.low = skids.low; skids.begin(dt, cam); smoke.begin(dt, cam);
    skids.car(0, drv, me); smoke.car(0, drv, me, dt);
    const pEng = playerEngine.failed ? 1.0 : Math.min(1, (dmg.w.hood || 0) * .6 + (dmg.w.nose || 0) * .5);
    if (pEng > 0.35 || playerEngine.failed) smoke.engine(0, drv, me, pEng, dt);
  }
  if (!shown && !race.qualifying) for (let i = 0; i < field.cars.length; i++) {
    const c = field.cars[i], o = c.ph;
    if (!o.gone) {
      skids.car(i + 1, o); smoke.car(i + 1, o, null, dt);
      const w = c.ai ? c.ai.damage?.w : o.dmo;
      const isFailed = !!(c.ai?.engine?.failed || c.entry?.dnf);
      const aiEng = isFailed ? 1.0 : (w ? Math.min(1, (w.hood || 0) * .6 + (w.nose || 0) * .5) : 0);
      if (aiEng > 0.35 || isFailed) smoke.engine(i + 1, o, null, aiEng, dt);
    }
  }
  R.begin(cam, gameTime); R.draw(track);
  if (set.line) R.draw(lineMesh || (lineMesh = R.mesh(buildLine())));
  if (set.brake) drawBrake(R, zoneMesh || (zoneMesh = R.mesh(buildZone())), drv);
  drawLights(R, lampMesh || (lampMesh = R.mesh(buildLamp())), race.lights);
  const showPlayer = set.view !== 'cockpit' && set.view !== 'front' && !(playerEngine.failed && playerEngine.fade > 2.8);
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
  skids.draw(cam);   // en dernier : change de programme GL
  const isCockpit = set.view === 'cockpit';
  rain.draw(cam);
  smoke.draw(cam);
  rain.update(dt, cam, drv.u || 0, drv.w || 0, isCockpit);   // en dernier : les gouttes du pare-brise lisent la scène 3D déjà complète
}
requestAnimationFrame(frame);