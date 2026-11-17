// fix5 : bonus de specs (expert/difficile), qualifs en voitures fantômes (ligne optimisée, sans trafic), trafic par TTC (freinage seulement si collision proche), dépassement seulement si la ligne droite le permet.
// IA V4 : pilotes sur la même physique que le joueur. Regard sur la spline idéale, vitesses cibles par courbure (freinage arrière),
// niveaux (erreur de ligne, marge de freinage, réaccélération, fautes), attaque / défense par décalage latéral, collisions boîtes.
// V11+ : tables de vitesse par fiche voiture (adhérence, appui, vmax), les IA peuvent prendre n'importe quelle voiture.
// V12  : 3 voies dynamiques (−1, 0, +1), table d'occupation partagée (zero-alloc), coordination attaque/défense, anticipation par table de voie visée.
// V13  : Étalonnage haute performance 4 niveaux (Expert intouchable, peloton fluide, relance moteur).
// V14  : Vibreurs exploités, chicanes coupées avec filet de gaz, départ sans blocage en meute, frottements de carrosserie stables sans tête-à-queue.
import { TRACK, frameAt, PIT, pitExt } from './track.js';
import { stepCar, createCar, getCarWetGripFactor, WET_PROFILES } from './physics.js';
import { engineState, engineIncrement } from './engine.js';

const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const { N, ds, length: LEN, K, ideal, half: ROAD_HALF } = TRACK, KT = ROAD_HALF < 5, WS = KT ? .58 : 1, LS = KT ? .68 : 1;
// Karting intérieur béton : toute la zone "gravel" est roulable sans pénalité surf.
// Détection : circuit kart + gravel présent + aucun vibreur défini.
const KT_INDOOR = KT && (TRACK.gravel || 0) > 0 && !(TRACK.kerbL && TRACK.kerbL.some((v) => v > 0));
// En kart indoor, les IA peuvent atteindre jusqu'au mur béton (ROAD_HALF + gravel).
const WALL_LAT = KT_INDOOR ? ROAD_HALF + (TRACK.gravel || 0) : ROAD_HALF;

// Limites latérales par tronçon intégrant les vibreurs (kerbL / kerbR) pour monter 2 roues sur les vibreurs sans sortir
const LIM_L = new Float32Array(N), LIM_R = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const kL = (TRACK.kerbL && TRACK.kerbL[i]) || 0;
  const kR = (TRACK.kerbR && TRACK.kerbR[i]) || 0;
  // Kart intérieur : exploiter toute la largeur béton jusqu'à ~1.1 m du mur
  // Kart extérieur : marge 0.6 m sur la ligne blanche (surf commence après)
  // Voiture standard : marge 1.35 m (vibreur + herbe/gravier)
  const noKerbMargin = KT_INDOOR ? 1.85 : (KT ? 0.6 : 1.35);
  const halfForLimit = KT_INDOOR ? WALL_LAT : ROAD_HALF;
  LIM_L[i] = -(halfForLimit - (kL > 0 ? (KT ? 0.6 : 1.05) : noKerbMargin) + kL * 0.45);
  LIM_R[i] =  (halfForLimit - (kR > 0 ? (KT ? 0.6 : 1.05) : noKerbMargin) + kR * 0.45);
}

// Détection des chicanes (enchaînements rapides gauche-droite sous 35 m) :
// La trajectoire optimale coupe en diagonale sur les vibreurs, avec une courbure réelle de passage ~45 % plus faible que l'axe
const CHICANE = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const ki = K[i];
  if (Math.abs(ki) > 0.0032) {
    const maxSteps = Math.min(Math.round(35 / ds), N - 1);
    for (let d = 2; d <= maxSteps; d++) {
      const kd = K[(i + d) % N];
      if (Math.abs(kd) > 0.0032 && Math.sign(ki) !== Math.sign(kd)) {
        const factor = cl((d * ds - 6) / 26, 0.45, 0.82);
        for (let q = 0; q <= d; q++) {
          const idx = (i + q) % N;
          CHICANE[idx] = CHICANE[idx] ? Math.min(CHICANE[idx], factor) : factor;
        }
        break;
      }
    }
  }
}

// Analyse géométrique des virages : phase (-1 entrée, 0 corde/apex, +1 sortie) et côté de corde (+1 droite, -1 gauche)
const CORNER_PHASE = new Float32Array(N);
const APEX_SIDE = new Int8Array(N);
for (let i = 0; i < N; i++) {
  const k = K[i];
  if (Math.abs(k) < 0.0032) continue;
  APEX_SIDE[i] = k > 0 ? 1 : -1;
  let dK = 0;
  const span = Math.min(6, Math.round(22 / ds));
  for (let s = 1; s <= span; s++) {
    dK += (Math.abs(K[(i + s) % N]) - Math.abs(K[(i - s + N) % N]));
  }
  CORNER_PHASE[i] = cl(-dK / 0.028, -1, 1);
}

/** Ligne de course suivie par les IA (décalage latéral, + = droite) : c'est aussi celle affichée au joueur. */
export const aiLine = TRACK.qualifyingLine || Float32Array.from(ideal, (v, i) => Math.max(LIM_L[i] + .1, Math.min(LIM_R[i] - .1, v)));
// Décalage de voie par tronçon : plein en ligne droite, réduit à 50 % en virage (les voitures restent proches de la corde).
const FADE = new Float32Array(N);
for (let i = 0; i < N; i++) { let km = 0; for (let k = 0; k < 14; k++) km = Math.max(km, Math.abs(K[(i + k) % N])); FADE[i] = cl((.0055 - km) / .003, .85, 1); }
/** Ligne d'une voie (décalage m par tronçon, borné aux vibreurs inclus). */
const lineOf = (lane) => Float32Array.from(aiLine, (v, i) => cl(v, LIM_L[i] + Math.abs(lane) * .3, LIM_R[i] - Math.abs(lane) * .3) + lane * FADE[i]);
/** Courbure réelle suivie sur une ligne avec prise en compte du lissage en chicane selon l'agilité du véhicule. */
const KLof = (line, S) => {
  const agility = S ? cl(1 - (S.mass - 800) / 1200 * 0.45 - ((S.h || .5) - 0.40) * 1.5, 0.35, 1.0) : 1.0;
  return Float32Array.from(K, (k, i) => {
    const rawChicane = KT_INDOOR ? 1 : (CHICANE[i] || 1);
    const chFactor = rawChicane < 1 ? (1 - (1 - rawChicane) * agility) : 1;
    const a = Math.abs(k) * chFactor;
    return .85 * a / (1 - cl(line[i] * Math.sign(k) * a, -.9, .9));
  });
};
const SPEC_E = .05, SPEC_D = .03, SKILL_SPREAD = { expert: .003, difficile: .008, normal: .016, facile: .025 };
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const wrapS = (d) => d - LEN * Math.round(d / LEN);
const rng = (s) => { const next = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; next.getState = () => s; next.setState = (v) => { s = v | 0; }; return next; };

export const LEVELS = {
  //            err   miss  marge vit   aggr  fautes/min attaque défense voie  réaction(s) spec
  facile:    { err: .32, miss: .06,   margin: 1.62, speed: .92,  aggr: .62, faults: 0, attack: .45, defend: .10, lane: .65, react: .50, spec: 0 },
  normal:    { err: .18, miss: .03,   margin: 1.48, speed: .96,  aggr: .78, faults: 0, attack: .70, defend: .45, lane: .42, react: .20, spec: 0 },
  difficile: { err: .08, miss: .012,  margin: 1.35, speed: 1.00, aggr: .90, faults: 0, attack: .82, defend: .75, lane: .22, react: .06, spec: SPEC_D },
  expert:    { err: .02, miss: .002,  margin: 1.24, speed: 1.03, aggr: 1.0, faults: 0, attack: 1.0, defend: 1.00, lane: .06, react: 0,   spec: SPEC_E },
};

const SPC = new Map();
const withSpec = (S, k) => { if (!k || S._spec) return S; const key = S.id + '|' + k; let o = SPC.get(key); if (!o) SPC.set(key, o = { ...S, power: S.power * (1 + k), grip: S.grip * (1 + k), aero: S.aero * (1 + k), _spec: k }); return o; };

const PR = new Map();
const YG = .8, CK = .8, BMU = .66, RM = .85;
function cmOf(S) {
  let base = 0.63;
  if (S.kind === 'kart') base = 0.68;
  else if (S.kind === 'open') base = 0.66;
  else if (S.kind === 'proto') base = 0.64;
  else if (S.kind === 'wedge') base = 0.62;
  else if (S.kind === 'gt') base = 0.61;
  else if (S.kind === 'rally') base = 0.51;
  else if (S.kind === 'drag' || S.kind === 'thrust') base = 0.70;

  const h = S.h || 0.45;
  const tw = S.tw || 1.7;
  const cgPenalty = Math.max(0, h / tw - 0.27) * 0.20;
  const ovPenalty = Math.max(0, (S.oversteer || 0.3) - 0.28) * 0.14;
  const unPenalty = S.kind === 'kart'
    ? Math.max(0, (S.understeer || 0) - 0.08) * 0.8 + Math.max(0, (S.mass - 165) / 100) * 0.35
    : Math.max(0, (S.understeer || 0.2) - 0.24) * 0.16;
  const massPenalty = Math.max(0, (S.mass - 1000) / 1000) * 0.03;
  return cl(base - cgPenalty - ovPenalty - unPenalty - massPenalty, 0.45, 0.74);
}
export const decelAt = (S, v, wet = 0) => { const wg = getCarWetGripFactor(S.kind || 'gt', wet), g = S.grip * wg, kd = (S.drag + .12 * S.aero) * v * v / S.mass; return Math.min(g * BMU * (9.81 + S.aero * v * v / S.mass), S.brakeForce / S.mass * (S.kind === "kart" ? 0.65 : 0.95)) + kd; };
function prof(S, lane = 0, wet = 0) {
  const key = (S.id || 'car') + '|' + (S._spec || 0) + '|' + Math.round(wet * 100);
  let p = PR.get(key);
  if (!p) { const wg = getCarWetGripFactor(S.kind || 'gt', wet), g = S.grip * wg, MA = g * Math.min(1 - .2 * S.understeer, (S.rearK || 1) * (1 - .08 * S.oversteer)) * cmOf(S), KA = MA * S.aero / S.mass * CK; p = { MA, KA, TB: {}, VA: {}, KL: {} }; PR.set(key, p); }
  if (!p.VA[lane]) {
    const KLn = p.KL[lane] = KLof(lineOf(lane), S), VA = new Float32Array(N);
    const profKind = WET_PROFILES[S.kind || 'gt'] || WET_PROFILES.gt;
    const aquaLimit = wet > 0.05 ? (profKind.aquaKmh / 3.6) * 1.05 : S.vmax;
    for (let i = 0; i < N; i++) {
      const d = KLn[i] - p.KA;
      const vc = d > 1e-5 ? Math.min(S.vmax, Math.sqrt(p.MA * 9.81 / d)) : S.vmax;
      VA[i] = Math.min(vc, aquaLimit);
    }
    p.VA[lane] = VA;
  }
  return p;
}
function table(S, p, margin, lane = 0, wet = 0) {
  const ovPenalty = Math.max(0, (S.oversteer || 0.3) - 0.32) * 0.18;
  const unPenalty = Math.max(0, (S.understeer || 0.2) - 0.26) * 0.20;
  const cgPenalty = Math.max(0, (S.h || 0.45) / (S.tw || 1.7) - 0.28) * 0.22;
  const carMarginFactor = 1 + ovPenalty + unPenalty + cgPenalty;
  const effMargin = margin * carMarginFactor * (1 + (wet || 0) * 0.22) * (KT_INDOOR ? 1.25 : 1.0);
  const key = Math.round(effMargin * 1000) + '|' + lane; if (p.TB[key]) return p.TB[key];
  const KLn = p.KL[lane], t = Float32Array.from(p.VA[lane]);
  const q = RM / cmOf(S);
  for (let r = 0; r < 2; r++) for (let i = N - 1; i >= 0; i--) {
    const vn = t[(i + 1) % N], ay = vn * vn * KLn[i], am = (p.MA * 9.81 + p.KA * vn * vn) * q, f = Math.sqrt(Math.max(.04, 1 - (ay / am) ** 2));
    const yNext = TRACK.P ? TRACK.P[((i + 1) % N) * 3 + 1] : 0, yCur = TRACK.P ? TRACK.P[i * 3 + 1] : 0;
    const slope = ds > 0 ? (yNext - yCur) / ds : 0;
    const slopePenalty = slope < 0 ? slope * 9.81 * 0.85 : 0;
    const netDecel = Math.max(3.5, decelAt(S, vn, wet) + slopePenalty);
    const aeroBonus = cl(S.aero / S.mass * 800, 0, 1);
    const speedTrim = (margin <= 1.25 && f > 0.8) ? cl((vn - 38) / 40, 0, 1) * 0.05 * aeroBonus : 0;
    const effM = effMargin - speedTrim;
    const v = Math.sqrt(vn * vn + 2 * netDecel * f / effM * ds); if (v < t[i]) t[i] = v;
  }
  return (p.TB[key] = t);
}
export const vlOf = (S, wet = 0) => prof(S, 0, wet).VA[0];
export const brakeTable = (S, wet = 0) => table(S, prof(S, 0, wet), LEVELS.expert.margin, 0, wet);

const NB = Math.ceil(LEN / 20), PMS = new Map(), bin = (x) => Math.floor((((x % LEN) + LEN) % LEN) / 20) % NB;
const PM_VER = 'v8';

function getCachedPm(key) {
  let pm = PMS.get(key);
  if (pm) return pm;
  try {
    const raw = localStorage.getItem('lt_ai_pm_' + key);
    if (raw) {
      const arr = raw.split(',').map(Number);
      if (arr.length === NB && !arr.some(Number.isNaN)) {
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] < 0.90) arr[i] = 0.90;
          else if (arr[i] > 1.0) arr[i] = 1.0;
        }
        pm = new Float32Array(arr);
        PMS.set(key, pm);
        return pm;
      }
    }
  } catch {}
  return null;
}

function saveCachedPm(key, pm) {
  PMS.set(key, pm);
  try {
    const raw = Array.from(pm).map((v) => Math.round(v * 1000) / 1000).join(',');
    localStorage.setItem('lt_ai_pm_' + key, raw);
  } catch {}
}

function learnSetup(S, level, q = false, wet = 0) {
  const trk = TRACK.id || 'trk';
  const key = `${PM_VER}|${trk}|${S.id}|${level}${q ? '|q' : ''}${wet > 0 ? '|w' + Math.round(wet * 100) : ''}`;
  return { key, pm: getCachedPm(key) };
}

function learnRun(S, level, q, pm, seed, run, wet = 0) {
  const ph = createCar(S, TRACK.startIdx * ds - 14, 0, wet), g = mk(ph, level, seed, pm, q), all = [ph];
  let tick = 0, p = 0, prev = ph.s;
  const maxDist = (wet > 0 ? 1.25 : 2) * LEN;
  while (tick < 60 * 60 * 3 && p < maxDist) { stepField([g], all, tick++, 1 / 60, false, q, true); let d = ph.s - prev; prev = ph.s; d -= LEN * Math.round(d / LEN); p += d; }
  return g.ev === 0;
}

function learn(S, level, q = false, wet = 0) {
  const { key, pm: cached } = learnSetup(S, level, q, wet); if (cached) return cached;
  const pm = new Float32Array(NB).fill(1); PMS.set(key, pm);
  outer: for (const seed of [3, 17]) for (let run = 0; run < 2; run++) if (learnRun(S, level, q, pm, seed, run, wet)) break outer;
  saveCachedPm(key, pm);
  return pm;
}

async function learnRunAsync(S, level, q, pm, seed, wet = 0) {
  const ph = createCar(S, TRACK.startIdx * ds - 14, 0, wet), g = mk(ph, level, seed, pm, q), all = [ph]; let tick = 0, p = 0, prev = ph.s;
  const maxDist = (wet > 0 ? 1.25 : 2) * LEN;
  while (tick < 60 * 60 * 3 && p < maxDist) {
    const end = Math.min(tick + 720, 60 * 60 * 3);
    for (; tick < end && p < maxDist; tick++) { stepField([g], all, tick, 1 / 60, false, q, true); let d = ph.s - prev; prev = ph.s; d -= LEN * Math.round(d / LEN); p += d; }
    await new Promise(r => setTimeout(r, 0));
  }
  return g.ev === 0;
}

export async function createAiAsync(ph, level, seed, qualifying = false, laps = 0, progress = () => { }) {
  const wet = ph.wet || 0;
  const { key, pm: cached } = learnSetup(ph.sheet, level, !!qualifying, wet); let pm = cached;
  if (!pm) {
    pm = new Float32Array(NB).fill(1); PMS.set(key, pm); let done = false, n = 0;
    const seeds = [3, 17], maxRuns = wet > 0 ? 2 : 3, totalRuns = seeds.length * maxRuns;
    outer: for (const sd of seeds) for (let run = 0; run < maxRuns; run++) {
      done = await learnRunAsync(ph.sheet, level, !!qualifying, pm, sd, wet);
      progress(++n, totalRuns);
      if (done) break outer;
    }
    saveCachedPm(key, pm);
  } else {
    progress(1, 1);
  }
  const a = mk(ph, level, seed, pm, !!qualifying); a.laps = laps; return a;
}
export const createAi = (ph, level, seed, qualifying = false, laps = 0) => { const wet = ph.wet || 0, a = mk(ph, level, seed, learn(ph.sheet, level, !!qualifying, wet), !!qualifying); a.laps = laps; return a; };

const LW = 1.1 * WS;
export const laneOf = (lat, seed) => (lat > .5 ? 1 : lat < -.5 ? -1 : seed % 2 ? 1 : -1);

const _OCC_MAX = 32;
const _occIdx  = new Int16Array(_OCC_MAX);
const _occLane = new Int8Array(_OCC_MAX);
const _occTgt  = new Int8Array(_OCC_MAX);
let   _occN    = 0;

function _snapLane(latRel) {
  if (latRel > LW * .45) return 1;
  if (latRel < -LW * .45) return -1;
  return 0;
}

function _occFree(meIdx, s, tgt, window) {
  for (let k = 0; k < _occN; k++) {
    if (k === meIdx) continue;
    if (_occTgt[k] === tgt || _occLane[k] === tgt) {
      const d = Math.abs(wrapS(_occIdx[k] * ds - s));
      if (d < window) return false;
    }
  }
  return true;
}

function mk(ph, level, seed, pm, q = false) {
  const wet = ph.wet || 0, L = LEVELS[level] || LEVELS.normal, r = rng(seed * 7919 + 13), sheet = ph.sheet = withSpec(ph.sheet, L.spec);
  const tables1 = {};
  for (let li = -1; li <= 1; li++) {
    const lm = li * LW, p = prof(sheet, lm, wet);
    tables1[li] = table(sheet, p, L.margin, lm, wet);
  }
  const lane = 0;
  return {
    ph, L, q, sheet, r,
    t1: tables1[0],
    tables1,
    skill: 1 + (r() - .5) * (SKILL_SPREAD[level] ?? .025),
    lane, targetLane: lane,
    blk: 0, vf: 0, p1: r() * 6.28, p2: r() * 6.28,
    pm, ev: 0, off: false, wait: (q || L.react <= 0) ? 0 : L.react * (.7 + .6 * r()), tl: ph.lat, vt: 0, tx: ph.x, tz: ph.z, wetLearn: wet, fault: null, atk: 0, tgt: null, atkT: 0, defDone: false, calm: 0, gl: null, dist: 0, joined: q, stk: 0, rec: 0, recover: 0,
    inp: { throttle: 0, brake: 0, steer: 0 }, level, laps: 0, p0: 0, pit: 0, pitD: 0, pitT: 0, pitN: 0, pitChk: false, pitW: 0, pitTO: 0, avgV: 0, engine: engineState(), damage: { aero: 0, grip: 0, drag: 0, w: { nose: 0, fw: 0, hood: 0, l: 0, r: 0, rw: 0, floor: 0 } },
    _occIdx: -1, _inCorner: false, _laneCooldown: 0, _lastTrafficHash: 0,
  };
}

const S0 = TRACK.startIdx * ds, PIT_LIM = 80 / 3.6, PL = PIT_LIM * .96, PIT_FIX = 2.5, PITM = { facile: 1.7, normal: 1.35, difficile: 1.15, expert: 1.05 };
export { PIT_LIM };
const inLane = (c) => c.lat * PIT.sg > ROAD_HALF + 3 && pitExt(c.s) > 3;
let BOXES = null, FIELD = [];
const boxes = () => BOXES ||= (() => { const o = [], sA = -PIT.back + PIT.T, sB = PIT.fwd - PIT.T; for (let d = sA + 6, k = 0; d + 6 <= sB; d += 12, k++) if (k % 2 === 0 && Math.abs(d - PIT.boxD) >= 10 && d >= sA + 45) o.push(d); return o; })();
const reserved = (o) => o.pit === 1 || o.pit === 2 || (o.pit === 3 && wrapS(o.ph.s - S0) < o.pitD + 15);
function pitWorth(a, rem) {
  const D = a.damage; let tot = 0; for (const k in D.w) tot += D.w[k]; tot /= 7;
  const f = Math.min(.5, D.grip * .55 + D.aero * .1 + D.drag * .06 + tot * .06);
  if (f < .03) return false;
  if (!a.avgV) { let t = 0; for (let i = 0; i < N; i++) t += ds / Math.max(8, a.t1[i]); a.avgV = LEN / t * a.L.speed * a.skill; }
  const Lp = PIT.back + PIT.fwd, cost = Lp * (1 / PIT_LIM - 1 / a.avgV) + PIT_FIX + 2 + 2;
  if (rem < Lp + 200) return false;
  return rem / a.avgV * (1 / (1 - f) - 1) * 1.1 > cost * (PITM[a.level] ?? 1.35) * (.9 + .2 * a.r());
}
function pitX(a, d) {
  const T = PIT.T; let x = -3.5 + 10.5 * cl((d + PIT.back) / T, 0, 1);
  if (a.pit === 1) { const dB = a.pitD - d; if (dB < 40) x = 7 + 6.25 * cl((40 - dB) / 30, 0, 1); }
  else if (a.pit === 2) x = 13.25;
  else { x = 13.25 - 6.25 * cl((d - a.pitD) / 20, 0, 1); if (d > PIT.fwd - T) x = Math.min(x, 7 - 10.5 * cl((d - PIT.fwd + T) / T, 0, 1)); }
  return x;
}
function pitPlan(a, all, v) {
  const c = a.ph, d = wrapS(c.s - S0), sg = PIT.sg;
  if (a.pit === 0) {
    if (!a.laps || a.q || !a.joined || a.pitN >= 2) return;
    const de = wrapS(S0 - PIT.back - c.s);
    if (de > 520) { a.pitChk = false; return; }
    if (a.pitChk || de < 130) return;
    if (FIELD.some((o) => o !== a && o.pit === 1 && Math.abs(wrapS(o.ph.s - c.s)) < 150)) return;
    a.pitChk = true;
    if (!pitWorth(a, a.laps * LEN - (a.p0 + a.dist))) return;
    const bx = boxes().find((b) => !FIELD.some((o) => o !== a && reserved(o) && o.pitD === b) && !all.some((o) => o !== c && !o.gone && !o.ghost && Math.abs(wrapS(o.s - S0 - b)) < 7 && o.lat * sg - ROAD_HALF > 9));
    if (bx === undefined) return;
    a.pit = 1; a.pitD = bx; a.pitTO = 0; a.atk = 0; a.tgt = null; return;
  }
  if ((a.pitTO += .05) > 150) { a.pit = 0; return; }
  const dB = a.pitD - d;
  if (a.pit === 1) { if (dB < 1.8 && dB > -3 && v < 3.2) { a.pit = 2; a.pitT = PIT_FIX + a.r() * .5; a.pitW = 0; } else if (dB <= -3) { a.pit = 3; a.pitN++; } }
  else if (a.pit === 2) {
    if (v < 1.2) a.pitT -= .05;
    if (a.pitT <= 0 && (!all.some((o) => { const e = wrapS(o.s - c.s), l = o.lat * sg - ROAD_HALF; return o !== c && !o.gone && !o.ghost && e > -30 && e < 12 && l > 3 && l < 11; }) || (a.pitW += .05) > 6)) {
      const D = a.damage; D.grip = D.aero = D.drag = 0; for (const k in D.w) D.w[k] = 0; if (Math.max(a.engine.motor, a.engine.cooling, (D.w.hood + D.w.nose) * .5) < .5) { a.engine.motor = 0; a.engine.cooling = 0; a.engine.step = 0; } a.pit = 3; a.pitN++;
    }
  } else if ((d > PIT.fwd - PIT.T && !inLane(c)) || d > PIT.fwd) a.pit = 0;
}
function pitSpeed(a, vt, v, am, d) {
  if (a.pit === 2) return 0;
  if (a.pit === 3) return Math.min(vt, PL);
  const dl = -PIT.back + PIT.T * .6 - d, dB = a.pitD - d;
  let m = Math.min(vt, dl > 0 ? Math.sqrt(PL * PL + 2 * am * .45 * dl) : PL);
  if (dB < 70) m = Math.min(m, 1.8 + Math.sqrt(2 * 3.2 * Math.max(0, dB - 1)));
  return m;
}

const F = {}, COR = 1.95 * WS, AVD = 1.2 * WS, THR = 2.3, DV = 1.6, STD = 180;
/** Vitesse fluide derrière `lead` : au démarrage, aucun freinage si le leader s'éloigne (évite le blocus de la meute). */
const follow = (a, gap, lead) => {
  const st = a.dist < 180, m = (st ? 1.8 : 3.8) * LS;
  if (a.dist < 140 && lead.u > 0.8) return 1e9;
  return lead.u + (gap > m ? Math.sqrt(2 * (st ? 6 : 5.5) * (gap - m)) : Math.max(0, -(m - gap) * .3));
};
function free(all, c, ah, s, ga, cand) {
  if (Math.abs(cand) > ROAD_HALF + 1.2) return false;
  for (let k = 0; k < all.length; k++) {
    const o = all[k];
    if (o === c || o === ah || o.gone || o.ghost) continue;
    const d = wrapS(o.s - s);
    if (d > -9 && d < Math.max(ga + 8, 26) && Math.abs(o.lat - cand) < 1.8 * WS) return false;
  }
  return true;
}

function decide(a, all, t) {
  const c = a.ph, L = a.L, r = a.r, v = Math.max(c.u, 0), s = c.s, idx = c.idx, dt = .05, q = a.q, st = a.dist < STD;
  if (q) a.wait = 0;
  if (a.gl === null) {
    a.gl = c.lat; a.p0 = wrapS(s - S0);
    if (c.sheet !== a.sheet) c.sheet = a.sheet;
    a.lane = 0; a.targetLane = 0;
    a.t1 = a.tables1[0];
  }
  a.dist += v * dt;
  pitPlan(a, all, v); const pit = a.pit > 0, pz = pit && wrapS(s - S0) > -PIT.back - 30;
  if (a.wait <= 0 && a.rec <= 0 && v < 1.5 && a.vt > 5) { if ((a.stk += dt) > 2) { a.rec = 1.6; a.stk = 0; } } else a.stk = 0;

  let ah = null, ga = 1e9, bh = null, gb = 1e9, push = 0, pw = 0, yc = 1e9, near = 0;
  if (!q) for (let k = 0; k < all.length; k++) {
    const o = all[k]; if (o === c || o.gone || o.ghost) continue;
    const d = wrapS(o.s - s); if (d > 150 || d < -60) continue;
    const dl = o.lat - c.lat, adl = dl < 0 ? -dl : dl, ad = d < 0 ? -d : d;
    // Répulsion de proximité mesurée (évite le ping-pong vers les bords)
    if (ad < 10 * LS && adl < 3.2 * WS) { const w = cl((10 * LS - ad) / (7 * LS), 0, 1) * cl((3.2 * WS - adl) / (2.2 * WS), 0, 1); push += (dl > 0 ? -1 : dl < 0 ? 1 : (c.lat > 0 ? -1 : 1)) * w; pw += w; }
    if (ad < 16 * LS && adl < 5 * WS) near++;
    // Côte à côte : ne force un ralentissement que si les voitures empiètent réellement sur le même couloir
    if (d > .3 && d < 5.5 * LS && adl < 1.5 * WS && a.dist > 150 && !(a.atk && o === a.tgt)) {
      const floorU = L.aggr >= 1 ? o.u : Math.max(o.u - .5, v - .9);
      yc = Math.min(yc, floorU);
    }
    if (d > 0 && d < ga && adl < COR) { ga = d; ah = o; }
    if (d < 0 && -d < gb && adl < 2.6 * WS) { gb = -d; bh = o; }
  }
  let kmx = 0; for (let k = 0; k < 14; k++) kmx = Math.max(kmx, Math.abs(K[(idx + k) % N]));
  let kf = 0; for (let k = 0, n = Math.min(60, Math.round((25 + v * 1.6) / ds)); k < n; k++) kf = Math.max(kf, Math.abs(K[(idx + k) % N]));
  let k200 = 0, k300 = 0; for (let q2 = 0, n = Math.min(75, Math.round(300 / ds)); q2 < n; q2++) { const kk = Math.abs(K[(idx + q2) % N]); if (q2 < Math.round(200 / ds) && kk > k200) k200 = kk; if (kk > k300) k300 = kk; }
  const noPassZone = k200 > .0048 || k300 > .007 || kf > .0055;
  let cs = 0; for (let k = 0; k < 64 && !cs; k += 3) { const kk = K[(idx + k) % N]; if (Math.abs(kk) > .006) cs = kk > 0 ? 1 : -1; }

  if (a.fault) { if ((a.fault.t -= dt) <= 0) a.fault = null; }
  else if (L.faults && v > 20 && a.wait <= 0 && r() < L.faults / 60 * dt) a.fault = { k: 1, t: .4 + r() * .4, s: r() < .5 ? -1 : 1 };

  // ==================== CHOIX DE VOIE DYNAMIQUE & COORDINATION ====================
  const inCorner = kmx > .0035;
  if (!q && !pit && a.joined && a.dist > 200) {
    if (a._laneCooldown > 0) a._laneCooldown--;

    if (a._inCorner && !inCorner) {
      a._inCorner = false;
      a.defDone = false;
    }
    if (inCorner) a._inCorner = true;

    let nAhead = 0, nBehind = 0;
    for (let k = 0; k < _occN; k++) {
      if (k === a._occIdx) continue;
      const dOcc = wrapS(_occIdx[k] * ds - s);
      if (dOcc > 0 && dOcc < 40) nAhead++;
      else if (dOcc < 0 && dOcc > -20) nBehind++;
    }
    const trafficHash = (nAhead << 4) | nBehind;
    const trafficChanged = trafficHash !== a._lastTrafficHash;
    a._lastTrafficHash = trafficHash;

    const nearBraking = kmx > .0038 || kf > .005;
    const imminentDanger = ah !== null && ga < 5.5 * LS && v > ah.u + 1.2;

    if ((a._laneCooldown <= 0 || imminentDanger) && (!a._inCorner || imminentDanger) && (nearBraking || trafficChanged || imminentDanger)) {
      a._laneCooldown = 15;
      let nextTgt = a.targetLane;

      if (nAhead === 0 && nBehind === 0 && !a.atk) {
        nextTgt = 0;
      } else {
        const isDefending = bh !== null && gb < 25 && bh.u > v + 0.5 && !a.atk;
        const attackerAlongside = bh !== null && gb < 4.5 * LS;
        const wantsAttack = ah !== null && ga < 30 && (v > ah.u + 0.3 || a.blk > 1.2);

        if (isDefending && !attackerAlongside) {
          if (!a.defDone && cs !== 0 && r() < L.defend) {
            const insideLane = cs > 0 ? 1 : -1;
            if (_occFree(a._occIdx, s, insideLane, 20)) {
              nextTgt = insideLane;
              a.defDone = true;
            }
          }
        } else if (wantsAttack && !attackerAlongside) {
          const insideLane = cs > 0 ? 1 : (cs < 0 ? -1 : 1);
          const outsideLane = -insideLane;
          for (let step = 0; step < 3; step++) {
            const cand = (step === 0 ? insideLane : (step === 1 ? outsideLane : 0));
            if (!_occFree(a._occIdx, s, cand, 26)) continue;
            const candLat = cl(aiLine[idx] + cand * LW * FADE[idx], LIM_L[idx], LIM_R[idx]);
            if (Math.abs(candLat - ah.lat) > 2.0 * WS && free(all, c, ah, s, ga, candLat)) {
              nextTgt = cand;
              break;
            }
          }
        }
      }

      if (nextTgt !== a.targetLane) {
        a.targetLane = nextTgt;
        if (a._occIdx >= 0) _occTgt[a._occIdx] = nextTgt;
      }
    }

    if (a.targetLane !== a.lane && !inCorner) {
      const tgtOffset = a.targetLane * LW * FADE[idx];
      const curOffset = c.lat - aiLine[idx];
      if (Math.abs(curOffset - tgtOffset) < LW * .55) {
        a.lane = a.targetLane;
        a.t1 = a.tables1[a.lane];
        if (a._occIdx >= 0) _occLane[a._occIdx] = a.lane;
      }
    }
  }

  if (!bh || gb > 35) { if ((a.calm += dt) > 3) a.defDone = false; } else a.calm = 0;

  // Visée dynamique adaptée à la vitesse et à la courbure
  const look = pz ? cl(6 + v * .25, 6, 14) : cl((8 + v * .48) * cl(1.05 - kmx * 200, .55, 1), 9, 28), j = (idx + Math.round(look / ds)) % N;
  const recovery = 1 - Math.min(.8, a.damage.grip);
  const noise = L.err * recovery * (.6 * Math.sin(t * .7 + a.p1) + .4 * Math.sin(t * 1.3 + a.p2));
  const laneFade = FADE[j];
  const tLaneM = a.targetLane * LW;
  let base = aiLine[j] * (1 - L.miss * (1 + Math.sin(s * .011 + a.p1))) + tLaneM * recovery * laneFade + noise;

  // Géométrie d'Apex : plonger vers la corde en entrée, ouvrir vers l'extérieur en sortie.
  // On utilise idx (position actuelle) et non j (look-ahead) pour éviter de sortir de piste
  // quand le regard est déjà sur la ligne droite mais que la voiture est encore en virage.
  const cPhaseC = CORNER_PHASE[idx], aSideC = APEX_SIDE[idx];
  if (aSideC !== 0) {
    // Sur virages prononcés, plonger vers la corde intérieure à l'apex sans déborder à l'extérieur en sortie
    const tightHairpin = kmx > 0.007;
    const apexScale = tightHairpin ? 0.12 : 0.25;
    const apexIntensity = cl(kmx / 0.0055, 0.25, 1.0) * L.aggr;
    if (cPhaseC < -.15) {
      // Entrée de virage : plonger vers la corde intérieure
      base += aSideC * (-cPhaseC * apexScale * apexIntensity);
    } else if (cPhaseC > .15 && L.aggr >= 0.95) {
      // Late Apex (sortie de virage) : ouvrir vers l'extérieur pour maximiser le rayon de sortie et réaccélérer plus tôt
      const exitScale = tightHairpin ? 0.10 : 0.20;
      base -= aSideC * (cPhaseC * exitScale * apexIntensity);
    }
  }
  // base toujours borné aux limites LIM du look-ahead ET aux limites actuelles de la voiture
  // Sur virage serré, serrer les bornes aux limites de piste strictes (sans vibreur)
  const tightClamp = kmx > 0.008;
  if (tightClamp) {
    const tightMargin = L.aggr >= 1 ? 0.18 : 0.30;
    base = cl(base, LIM_L[idx] + tightMargin, LIM_R[idx] - tightMargin);
  } else {
    base = cl(base, LIM_L[j] + Math.abs(tLaneM) * .2, LIM_R[j] - Math.abs(tLaneM) * .2);
    base = cl(base, LIM_L[idx], LIM_R[idx]);
  }

  let cap = 1e9;

  // En course : aspiration (slipstream) en ligne droite derrière la voiture qui précède
  if (!q && ah && !pit && kmx < .0035 && ga > 6 * LS && ga < 40) {
    base = cl(ah.lat, LIM_L[j], LIM_R[j]);
  }

    // Sortie de route : seulement au-delà du vibreur extérieur (herbe/gravier)
  // En kart intérieur béton, le "mur" est la vraie frontière (WALL_LAT) — pas de surf >= 2 mais la lat absolue suffit
  const wallLimit = KT_INDOOR ? WALL_LAT - 0.55 : ROAD_HALF + (c.lat > 0 ? (TRACK.kerbR?.[idx] || 0) : (TRACK.kerbL?.[idx] || 0)) + (KT ? 0.8 : 1.2);
  const offRoad = !pz && (c.surf >= 2 || c.wall || Math.abs(c.lat) > wallLimit);
  if (offRoad) {
    // Kart indoor : ramener vers l'intérieur depuis le mur béton
    const safeHalf = KT_INDOOR ? WALL_LAT - 1.1 : (ROAD_HALF - (KT ? 0.6 : 1.2));
    const safeMin  = KT_INDOOR ? 1.2 : (KT ? 1.2 : 2.15);
    const pullBack = KT_INDOOR ? 1.8 : (KT ? 1.5 : 2.8);
    base = Math.sign(c.lat || 1) * Math.min(safeHalf, Math.max(safeMin, Math.abs(c.lat) - pullBack));
    a.recover = Math.max(a.recover, 1.15);
  } else a.recover = Math.max(0, a.recover - dt);
  if (a.fault && a.fault.k === 1) base += a.fault.s * .35;
  if (pit) { const dl = wrapS(s + look - S0), b = cl((280 + PIT.back + dl) / 200, 0, 1); base = base * (1 - b) + PIT.sg * (ROAD_HALF + pitX(a, dl)) * b; if (pz) { a.recover = 0; a.fault = null; } }

  // Libération immédiate en qualification (pas de file de départ, fantômes), sinon libération progressive en course
  const joinDist = KT ? 35 : 55;
  if (!a.joined) { if (q || (a.dist > joinDist && !all.some((o) => o !== c && !o.gone && !o.ghost && Math.abs(wrapS(o.s - s)) < 6 * LS && Math.abs(o.lat - base) < 2.0 * WS))) a.joined = true; else base = a.gl; }

  const vfree = a.vf;
  if (!st && ah && ga - 4.6 * LS < 30 + v * .25 && vfree > ah.u + 1.2) a.blk += dt; else a.blk = Math.max(0, a.blk - 2 * dt);
  let ov = null;
  const am = Math.max(6, decelAt(a.sheet, v, c.wet || 0)), g0 = (st ? 2.5 : 1.2) * LS + .03 * v;
  if (ah) {
    const gap = ga - 4.6 * LS, clo = v - ah.u, forced = a.blk > 2;
    if (!pit && !a.atk && L.attack && a.wait <= 0 && a.joined && a.dist > 180 && (forced ? kmx < .0055 && kf < .007 : !noPassZone && kmx < .0045 && kf < .0055)) {
      const slower = ah.u < vfree - (forced ? 1.5 : DV);
      let dStr = 0; if (slower) { const n = Math.min(110, N); while (dStr < n && Math.abs(K[(idx + dStr) % N]) < .0045) dStr++; dStr *= ds; }
      const minStr = forced ? 18 : (L.attack >= 1 ? 32 : (L.attack >= .8 ? 55 : 90));
      const reqDist = v * ((gap + 6) / Math.max(1.5, Math.max(clo, .8)) * .45 + .4) + minStr;
      if (slower && dStr > reqDist && gap > Math.max(0, clo * .4) && gap < (ah.u < 8 ? 120 : Math.max(45, clo * 3.5))) {
        const insideSide = cs || 1;
        let bestSide = 0, bestCand = 0, bestScore = 1e9;
        for (let si = 0; si < 2; si++) {
          const side = si === 0 ? insideSide : -insideSide;
          const cand = cl(ah.lat + side * 2.8 * WS, LIM_L[j], LIM_R[j]);
          if (Math.abs(cand - ah.lat) > 2.0 * WS && free(all, c, ah, s, ga, cand)) {
            const edge = (cand > 0 ? LIM_R[j] : -LIM_L[j]) - Math.abs(cand);
            const lineCost = Math.abs(cand - aiLine[j]);
            const score = lineCost + Math.max(0, 1.8 * WS - edge) * 5 + (side === insideSide ? 0 : .35);
            if (score < bestScore) { bestScore = score; bestSide = side; bestCand = cand; }
          }
        }
        if (bestSide !== 0) { a.atk = bestSide; a.tgt = ah; a.atkT = 8; a.passLat = bestCand; a.blk = 0; }
      }
    }

    // Régulation fluide : au départ, si la voiture devant accélère et s'éloigne, aucun bridage
    const launching = a.dist < 90 && v <= ah.u + 0.8;
    const adlAhead = Math.abs(ah.lat - c.lat);
    if (adlAhead < COR * 1.1 && !launching) {
      cap = Math.min(cap, follow(a, gap, ah));
    }
    const ue = ah.u - Math.max(ah.bk > .15 ? ah.bk * am * .3 : 0, -Math.min(0, ah.ax || 0) * .35), cv = v - ue;
    if (cv > .3 && !launching) {
      const ttc = gap / cv, thr = st ? 2.4 : THR;
      if (ttc < thr) cap = Math.min(cap, ue + Math.sqrt(2 * am * (.5 + .4 * cl(1 - ttc / thr, 0, 1)) * Math.max(0, gap - g0)));
    } else if (gap < g0 * .5 && !launching) {
      cap = ue - 1.0;
    }
  }
  if (a.atk && !pit) {
    const d = wrapS(a.tgt.s - s); a.atkT -= dt;
    if (d < -7 || d > 48 || a.atkT <= 0 || (d > 1 && noPassZone)) { a.atk = 0; a.tgt = null; }
    else { ov = cl(a.passLat ?? a.tgt.lat + a.atk * 2.8 * WS, LIM_L[idx], LIM_R[idx]); if (a.tgt.u < 8) cap = Math.min(cap, 18 + Math.sqrt(2 * 9 * Math.max(0, d - 4.6 * LS))); }
  }

  // Évitement latéral modéré (max ±0.55 m pour ne pas pousser hors de la piste ni créer de ping-pong)
  const avoidMax = 0.55 * WS;
  const avoid = pz ? 0 : pw > 0 ? cl(push / pw * Math.min(1.0, pw) * (a.atk ? .35 : AVD * .4), -avoidMax, avoidMax) : 0;
  cap = Math.min(cap, yc);

  // Guidage latéral stable sur la trajectoire de course
  const des = pz ? base : cl((ov !== null ? ov : base) + avoid, LIM_L[idx], LIM_R[idx]);
  const rate = 2.5 + .045 * v;
  a.tl += cl(des - a.tl, -rate * dt, rate * dt);

  frameAt(c.s + look, F); a.tx = F.x + F.rx * a.tl; a.tz = F.z + F.rz * a.tl;
  const failure = a.damage;
  const ti = Math.floor(((s + v * .12) % LEN) / ds) % N;
  const slip = Math.abs(Math.atan2(c.w, Math.max(Math.abs(c.u), 2)));
  frameAt(s, F); const headingError = Math.abs(wrap(c.psi - Math.atan2(F.tz, F.tx)));

  // Apprentissage : ralentit les 60 m qui précèdent uniquement en cas de vraie sortie de piste (surf >= 2)
  // En kart intérieur béton : surf reste à 0, donc on détecte le mur béton par la position latérale
  const isHittingWall = KT_INDOOR && Math.abs(c.lat) > WALL_LAT - 0.6;
  if (c.surf >= 2 || c.wall) {
    if (!a.off && v > 8) {
      if (near === 0) for (let d = -60; d <= 0; d += 20) {
        const b = bin(s + d);
        a.pm[b] = Math.max(.90, a.pm[b] - (c.wet > 0 ? .08 : .04));
      }
      a.ev++;
    }
    a.off = true;
  } else a.off = false;

  const vtTable = a.tables1[a.targetLane] || a.t1;
  let vt = vtTable[ti];
  vt *= (L.speed * a.skill) * (1 - (1 - a.pm[bin(ti * ds)]) * cl((.98 * a.sheet.vmax - vt) / (.15 * a.sheet.vmax), 0, 1));
  vt *= 1 - Math.min(.48, failure.grip * .42 + failure.aero * .08 + cl(slip - .12, 0, .8) * .22 + cl(headingError - .25, 0, 1.2) * .2);

  const sharp = cl((kmx - .0035) / .0025, 0, 1);
  vt *= 1 - (L.speed >= 1 ? .025 : .06) * sharp;

  if (c.wet > 0) {
    vt *= 1 - (c.wet || 0) * (sharp > 0 ? .08 : .03);
    if (slip > .06 || headingError > .15) {
      vt *= 1 - Math.min(.35, cl(slip - .06, 0, .4) * .8 + cl(headingError - .15, 0, .6) * .5);
    }
  }

  // Départ : uniquement en course (pas en qualif), pour les niveaux non-expert
  if (!q && st && L.aggr < 1) {
    const packSlow = (1 - L.aggr) * Math.min(.22, near * .05);
    vt *= 1 - .06 * (1 - L.aggr) * cl(1 - a.dist / 700, 0, 1) * cl(kf * 250, 0, 1);
    vt *= 1 - packSlow * cl(kmx * 180, 0, 1);
  }

  const sat = Math.abs(a.inp.steer);
  const satThresh = c.wet > 0 ? .55 : .7;
  if (sat > satThresh) vt *= 1 - Math.min(.4, (sat - satThresh) * (c.wet > 0 ? 1.6 : 1.3));
  if (c.surf === 2) vt = Math.min(vt * .65, 14);
  if (c.surf >= 3) vt = Math.min(vt, 9);
  if (a.recover > 0) vt = Math.min(vt, 14 + Math.max(0, 5 - Math.abs(headingError) * 5));
  if (pit) vt = pitSpeed(a, vt, v, am, wrapS(s - S0));
  if (inLane(c)) vt = Math.min(vt, PL);
  if (a.wetLearn !== undefined && (c.wet||0) > a.wetLearn + 0.05) {
    const wl = getCarWetGripFactor(a.sheet.kind||'gt', a.wetLearn), wn = getCarWetGripFactor(a.sheet.kind||'gt', c.wet||0);
    if (wl > 0.01) vt = Math.min(vt * Math.sqrt(wn / wl), vt);
  }
  a.vf = vt; a.vt = Math.max(0, Math.min(vt, cap));
}

function drive(a, dt) {
  const c = a.ph, S = c.sheet, L = a.L, i = a.inp, v = Math.max(c.u, 0);
  const wet = c.wet || 0;
  const dx = a.tx - c.x, dz = a.tz - c.z, ang = wrap(Math.atan2(dz, dx) - c.psi), dist = Math.max(4, Math.hypot(dx, dz));
  const heading = cl(ang, -1.6, 1.6), curvature = 2 * Math.sin(ang) / dist + .72 * heading / dist;
  const yawFix = v > 8 && a.recover <= 0 && !a.atk && c.surf < 2 ? cl(curvature - c.r / v, -.04, .04) * (wet > 0 ? YG * .7 : YG) : 0;
  const roadAngle = Math.atan((S.a + S.b) * (curvature + yawFix)), speedScale = 1 + (v / S.steerV) ** 2;
  const slipAngle = Math.atan2(c.w, Math.max(Math.abs(c.u), 2));
  const ovSens = 1 + Math.max(0, (S.oversteer || 0.3) - 0.3) * 0.8;
  const stabilise = cl((slipAngle * (wet > 0 ? .85 : .62) - c.r * (wet > 0 ? .12 : .07)) * ovSens, -.38, .38);
  let st = (a.rec > 0 ? -1 : 1) * cl((roadAngle + stabilise) * speedScale / S.steerMax, -1, 1);
  const pullComp = (c.pull || 0) * cl(v / 20, 0, 1) / (S.steerMax * (c.fs ?? 1));
  st -= pullComp;
  let wallUrgency = 0;
  if (KT_INDOOR) {
    const wallDist = WALL_LAT - Math.abs(c.lat);
    if (wallDist < 1.05) {
      const pushDir = -Math.sign(c.lat || 1);
      wallUrgency = cl((1.05 - wallDist) / 1.05, 0, 1);
      st = cl(st + pushDir * wallUrgency * 0.90, -1, 1);
    }
  }
  const steerRate = wet > 0 ? Math.max(9, 14 - wet * 4) : (L.aggr >= 1 ? 22 : 12 + L.aggr * 4);
  i.steer += cl(st - i.steer, -steerRate * dt, steerRate * dt);

  const e = a.vt - v, slip = Math.abs(Math.atan2(c.w, Math.max(c.u, 3)));
  const isKart = (S.kind === 'kart');
  const steerMag = Math.abs(i.steer);
  let th = 0, br = 0;

  if (e < -.5) {
    br = cl(-e / 1.2, 0, 1);
    const maxBrake = isKart ? (wet > 0 ? .50 : .68) : (wet > 0 ? Math.max(.58, 1 - wet * .24) : 1.0);
    br = Math.min(br, maxBrake);
    if (steerMag > .18) {
      br *= Math.max(.45, 1 - (steerMag - .18) * (wet > 0 ? .65 : .45));
    }
    if (wet > 0 && slip > .07) {
      br *= Math.max(isKart ? .35 : .42, 1 - (slip - .07) * 4 * wet);
    }
    // ABS actif sur saturation / blocage des pneus
    const maxLock = Math.max(c.skF || 0, c.skR || 0);
    if (maxLock > .04) {
      br *= cl(1 - (maxLock - .04) * 5.0, .20, .85);
    }
  } else {
    th = a.vt >= S.vmax * .96 ? 1 : cl(.15 + e / 3, 0, 1);
    if (wet > 0) {
      const wetMult = isKart ? 1.5 : 1;
      if (steerMag > .1) th *= Math.max(.3, 1 - steerMag * 1.3 * wet * wetMult);
      const slipThresh = isKart ? .035 : .045;
      if (slip > slipThresh) th *= Math.max(.15, 1 - (slip - slipThresh) * 7 * wet * wetMult);
    } else {
      const ovDamp = Math.max(0, (S.oversteer || 0.3) - 0.28) * 1.4;
      const steerLimit = 1 - cl(steerMag * (0.8 + ovDamp) * (1 - L.aggr * 0.45), 0, 0.65);
      th *= steerLimit * cl(1 - (slip - .08) * 5, .15, 1);
    }
  }

  // Filet de gaz d'apex (maintenance throttle) : stabilise l'assiette au point de corde
  if (L.aggr >= 1 && br < 0.15 && e > -1.2 && slip < 0.08 && a.vt > 8) {
    th = Math.max(th, 0.16);
  }

  if (wallUrgency > 0 && v > 6) {
    frameAt(c.s, F);
    const roadHeading = Math.atan2(F.tz, F.tx);
    const headingToWall = Math.sign(c.lat || 1) * Math.sin(c.psi - roadHeading) > 0.05;
    if (headingToWall) {
      br = Math.max(br, cl(wallUrgency * 0.75, 0.2, 0.75));
      th = Math.min(th, 1 - wallUrgency);
    }
  }

  if (a.wait > 0) { a.wait = Math.max(0, a.wait - dt); th = 0; }
  if (a.vt < .5) { th = 0; br = Math.max(br, v > 0.2 ? cl(v / 1.5, 0.4, 1.0) : 0.8); }
  if (a.pit === 2) { th = 0; br = 1; }
  if (a.recover > 0 && v > a.vt + .4) { th = 0; br = Math.max(br, cl((v - a.vt) / 2.2, .25, .9)); }
  if (c.surf >= 2) th = Math.min(th, wet > 0 ? .25 : .38);
  if (a.rec > 0) { a.rec -= dt; i.rev = true; th = 0; br = 1; } else { i.rev = false; }

  const thRate = wet > 0 ? Math.max(2.8, 6 - wet * 3) : (L.aggr >= 1 ? 24 : 10 + L.aggr * 10);
  const brRate = wet > 0 ? Math.max(4.5, 9 - wet * 3.5) : 9;
  i.throttle += cl(th - i.throttle, -8 * dt, thRate * dt);
  i.brake += cl(br - i.brake, -9 * dt, brRate * dt);
}

// Collisions voitures : frottements de flanc stables sans tête-à-queue violent
const HL = 2.25, HW = .93, KHL = 1, KHW = .62, AX = new Float64Array(8);
function collide(all) {
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const A = all[i], B = all[j], dx = B.x - A.x, dz = B.z - A.z; if (A.gone || B.gone || A.ghost || B.ghost || dx * dx + dz * dz > 26) continue;
    const ca = Math.cos(A.psi), sa = Math.sin(A.psi), cb = Math.cos(B.psi), sb = Math.sin(B.psi);
    AX[0] = ca; AX[1] = sa; AX[2] = -sa; AX[3] = ca; AX[4] = cb; AX[5] = sb; AX[6] = -sb; AX[7] = cb;
    const kA = A.sheet?.kind === 'kart', kB = B.sheet?.kind === 'kart', hlA = kA ? KHL : HL, hwA = kA ? KHW : HW, hlB = kB ? KHL : HL, hwB = kB ? KHW : HW;
    let best = 1e9, nx = 0, nz = 0;
    for (let k = 0; k < 8; k += 2) {
      const ux = AX[k], uz = AX[k + 1];
      const pa = hlA * Math.abs(ca * ux + sa * uz) + hwA * Math.abs(-sa * ux + ca * uz), pb = hlB * Math.abs(cb * ux + sb * uz) + hwB * Math.abs(-sb * ux + cb * uz);
      const d = dx * ux + dz * uz, pen = pa + pb - Math.abs(d); if (pen <= 0) { best = -1; break; }
      if (pen < best) { best = pen; nx = d < 0 ? -ux : ux; nz = d < 0 ? -uz : uz; }
    }
    if (best <= 0) continue;
    const h = Math.min(best, 2) / 2 * 1.02; A.x -= nx * h; A.z -= nz * h; B.x += nx * h; B.z += nz * h;
    let ax = ca * A.u - sa * A.w, az = sa * A.u + ca * A.w, bx = cb * B.u - sb * B.w, bz = sb * B.u + cb * B.w;
    const rel = (ax - bx) * nx + (az - bz) * nz;
    if (rel > 0) {
      const q = rel / 2; ax -= q * nx; az -= q * nz; bx += q * nx; bz += q * nz;
      if (rel > A.hv) { A.hv = rel; A.hnx = nx; A.hnz = nz; } if (rel > B.hv) { B.hv = rel; B.hnx = -nx; B.hnz = -nz; }
      const rx = dx / 2, rz = dz / 2;
      // Frottements de portières : lacet fortement amorti (0.05 au lieu de 0.25) pour éviter que deux voitures se sortent mutuellement
      const isSide = Math.abs(ca * nx + sa * nz) < .45;
      const leverScale = isSide ? .05 : .14;
      const mA = A.sheet.mass * q / A.sheet.iz * leverScale;
      const mB = B.sheet.mass * q / B.sheet.iz * leverScale;
      const maxSpin = isSide ? .12 : .28;
      A.r += cl(-(rx * nz - rz * nx) * mA, -maxSpin, maxSpin);
      B.r += cl(-(rx * nz - rz * nx) * mB, -maxSpin, maxSpin);
      ax *= .98; az *= .98; bx *= .98; bz *= .98;
      A.u = ca * ax + sa * az; A.w = -sa * ax + ca * az; B.u = cb * bx + sb * bz; B.w = -sb * bx + cb * bz;
    }
  }
}

export function stepField(list, all, tick, dt, collisions = true, qualifying, noDamage = false) {
  if (qualifying !== undefined) for (let k = 0; k < list.length; k++) list[k].q = !!qualifying;
  const t = tick * dt; FIELD = list;

  _occN = 0;
  for (let k = 0; k < list.length; k++) {
    const a = list[k], c = a.ph;
    if (c.gone || c.ghost || c.raceFinished || c.dnf || a.engine.failed) {
      a._occIdx = -1;
      continue;
    }
    if (_occN >= _OCC_MAX) break;
    a._occIdx = _occN;
    _occIdx[_occN]  = (c.idx >= 0 && c.idx < N) ? c.idx : Math.floor((((c.s % LEN) + LEN) % LEN) / ds) % N;
    _occLane[_occN] = a.lane;
    _occTgt[_occN]  = a.targetLane !== undefined ? a.targetLane : a.lane;
    _occN++;
  }
  for (let k = 0; k < all.length; k++) {
    const c = all[k];
    if (c.gone || c.ghost || c.raceFinished || c.dnf) continue;
    let isAi = false;
    for (let m = 0; m < list.length; m++) { if (list[m].ph === c) { isAi = true; break; } }
    if (isAi) continue;
    if (_occN >= _OCC_MAX) break;
    const sIdx = (c.idx >= 0 && c.idx < N) ? c.idx : Math.floor((((c.s % LEN) + LEN) % LEN) / ds) % N;
    _occIdx[_occN]  = sIdx;
    const latRel    = c.lat - (aiLine[sIdx] || 0);
    const snp       = _snapLane(latRel);
    _occLane[_occN] = snp;
    _occTgt[_occN]  = snp;
    _occN++;
  }

  for (let k = 0; k < list.length; k++) {
    const a = list[k], c = a.ph, d = a.damage;
    if (c.raceFinished || c.gone || a.engine.failed) {
      if (a.engine.failed) { c.gone = true; c.ghost = true; }
      continue;
    }

    if (!noDamage && engineIncrement(a.engine, a.inp.throttle, dt, d.w, inLane(c))) {
      a.engine.failed = true;
      a.engine.retiredAt = t;
      c.ghost = true;
      c.gone = true;
      a.inp.throttle = 0;
      a.inp.brake = 0;
      continue;
    }
    if (c.sheet !== a.sheet) c.sheet = a.sheet;
    d.w ||= { nose: 0, fw: 0, hood: 0, l: 0, r: 0, rw: 0, floor: 0 };
    if (!noDamage && c.hv > 2) {
      const hit = (c.hv - 2) * .014; d.grip = Math.min(.65, d.grip + hit * .22); d.aero = Math.min(.8, d.aero + hit * .35); d.drag = Math.min(1.2, d.drag + hit * .12);
      d.w.nose = Math.min(1, d.w.nose + hit); d.w.hood = Math.min(1, d.w.hood + hit * .55); d.w.fw = Math.min(1, d.w.fw + hit * .7); d.w.l = Math.min(1, d.w.l + hit * .25); d.w.r = Math.min(1, d.w.r + hit * .25); c.hv = 0;
    }
    if (!noDamage && c.surf === 2) { d.grip = Math.min(.65, d.grip + dt * .0015); d.w.floor = Math.min(1, d.w.floor + dt * .003); }
    c.fa = noDamage ? 1 : 1 - d.aero; c.fg = noDamage ? 1 : 1 - d.grip * .35; c.fd = noDamage ? 1 : 1 + d.drag;
    if ((tick + k) % 3 === 0) decide(a, all, t);
    drive(a, dt); c.bk = a.inp.brake; c.limit = !a.q && inLane(c) ? PIT_LIM : 0; stepCar(c, a.inp, dt);
    if (c.surf >= 2 || (KT_INDOOR && c.wall)) {
      // Assistance de récupération : réaligne vers le centre de la piste pour rentrer immédiatement sur le tarmac
      frameAt(c.s, F);
      const road = Math.atan2(F.tz, F.tx);
      const reenter = Math.sign(c.lat || 1) * 0.45;
      const err = wrap(road - reenter - c.psi);
      c.psi += cl(err, -.45, .45) * dt * 3.2;
      c.w *= Math.exp(-4.2 * dt); c.r *= Math.exp(-6.0 * dt);
    }
  }
  if (collisions) collide(all);
}
export { collide };
