// fix5 : bonus de specs (expert/difficile), qualifs en voitures fantômes (ligne optimisée, sans trafic), trafic par TTC (freinage seulement si collision proche), dépassement seulement si la ligne droite le permet.
// IA V4 : pilotes sur la même physique que le joueur. Regard sur la spline idéale, vitesses cibles par courbure (freinage arrière),
// niveaux (erreur de ligne, marge de freinage, réaccélération, fautes), attaque / défense par décalage latéral, collisions boîtes.
// V11+ : tables de vitesse par fiche voiture (adhérence, appui, vmax), les IA peuvent prendre n'importe quelle voiture.
import { TRACK, frameAt, PIT, pitExt } from './track.js';
import { stepCar, createCar } from './physics.js';

const { N, ds, length: LEN, K, ideal, half: ROAD_HALF } = TRACK, LIM = ROAD_HALF - 2.1;   // centre voiture : ≥ 2,1 m du bord (demi-largeur .93 + marge)
const LNF = 1, KC = Float32Array.from(K, (k) => Math.abs(k) * .85);   // LNF : part de la ligne idéale suivie ; KC : courbure utile de l'axe
/** Ligne de course suivie par les IA (décalage latéral, + = droite) : c'est aussi celle affichée au joueur. */
export const aiLine = TRACK.qualifyingLine || Float32Array.from(ideal, (v) => Math.max(-(LIM - .2), Math.min(LIM - .2, v * LNF)));
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
// Décalage de voie par tronçon : plein en ligne droite, réduit à 50 % en virage (les voitures restent proches de la corde).
const FADE = new Float32Array(N);
for (let i = 0; i < N; i++) { let km = 0; for (let k = 0; k < 14; k++) km = Math.max(km, Math.abs(K[(i + k) % N])); FADE[i] = cl((.0055 - km) / .003, .85, 1); }
/** Ligne d'une voie (décalage m par tronçon, borné à la route utile). */
const lineOf = (lane) => Float32Array.from(aiLine, (v, i) => cl(v, -(LIM - Math.abs(lane)), LIM - Math.abs(lane)) + lane * FADE[i]);
/** Courbure réelle suivie sur une ligne : plus serrée côté intérieur (rayon − décalage), donc vitesse cible juste pour chaque voie. */
const KLof = (line) => Float32Array.from(K, (k, i) => { const a = Math.abs(k); return .85 * a / (1 - cl(line[i] * Math.sign(k) * a, -.9, .9)); });
const SPEC_E = .04, SPEC_D = .03, SKILL_SPREAD = { expert: .004, difficile: .01, normal: .016, facile: .025 };   // bonus de specs par niveau ; dispersion de compétence par pilote
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const wrapS = (d) => d - LEN * Math.round(d / LEN);
const rng = (s) => { const next = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; next.getState = () => s; next.setState = (v) => { s = v | 0; }; return next; };

// spec : bonus de specs (fraction : puissance, adhérence, appui de la fiche de l'IA) réservé au niveau expert et au 3e niveau (difficile) ; 0 ailleurs. Une seule constante par niveau.
export const LEVELS = {
  //            err   miss  marge vit   aggr  fautes/min attaque défense voie  réaction(s) spec
  facile: { err: .38, miss: .08, margin: 1.7, speed: .93, aggr: .62, faults: 0, attack: .45, defend: .1, lane: .65, react: .5, spec: 0 },
  normal: { err: .22, miss: .04, margin: 1.55, speed: .97, aggr: .78, faults: 0, attack: .7, defend: .45, lane: .42, react: .2, spec: 0 },
  difficile: { err: .12, miss: .02, margin: 1.4, speed: .99, aggr: .9, faults: 0, attack: .8, defend: .75, lane: .24, react: .08, spec: SPEC_D },
  expert: { err: .04, miss: .005, margin: 1.3, speed: 1.02, aggr: 1, faults: 0, attack: 1, defend: 1, lane: .08, react: 0, spec: SPEC_E },
};
// Fiche de l'IA = fiche voiture × (1 + spec) sur puissance, adhérence et appui. stepCar n'est pas modifiée : il lit simplement cette fiche.
const SPC = new Map();
const withSpec = (S, k) => { if (!k || S._spec) return S; const key = S.id + '|' + k; let o = SPC.get(key); if (!o) SPC.set(key, o = { ...S, power: S.power * (1 + k), grip: S.grip * (1 + k), aero: S.aero * (1 + k), _spec: k }); return o; };

// par fiche : vitesse limite en courbe sur la LIGNE DE COURSE (courbure axe, adhérence + appui) puis passe arrière : freinage à la décélération réelle de la voiture
// (adhérence de freinage + appui + traînée, fonction de la vitesse) divisée par la marge du niveau.
const PR = new Map();
const YG = .8, CK = .8, BMU = .75, RM = .85;   // CK : crédit d'appui, BMU : adhérence de freinage (× grip), RM : capacité latérale réelle (cercle de friction au freinage)
// CM : adhérence utilisée en courbe, calibrée par voiture en simulation (≈ 0 sortie de piste sur 10 circuits, le reste est corrigé par l'apprentissage ci-dessous)
const CMS = { serra_gt: .65, titan: .65, nebula: .65, vipere: .61, comete: .59, spectre: .59, aigle: .57, prototype: .57, f1: .57, lame: .57, zephyr: .57, foudre: .55, mistral: .53, rallye: .49, safari: .49, baroudeur: .49 };
const cmOf = (S) => CMS[S.id] ?? .53;
/** Décélération maximale (m/s²) à la vitesse v : pneus (charge + appui) ou freins, + traînée. */
export const decelAt = (S, v) => { const kd = (S.drag + .12 * S.aero) * v * v / S.mass; return Math.min(S.grip * BMU * (9.81 + S.aero * v * v / S.mass), S.brakeForce / S.mass * .95) + kd; };
function prof(S, lane = 0) {
  let p = PR.get(S);
  if (!p) { const MA = S.grip * Math.min(1 - .2 * S.understeer, (S.rearK || 1) * (1 - .08 * S.oversteer)) * cmOf(S), KA = MA * S.aero / S.mass * CK; p = { MA, KA, TB: {}, VA: {}, KL: {} }; PR.set(S, p); }
  if (!p.VA[lane]) { const KLn = p.KL[lane] = KLof(lineOf(lane)), VA = new Float32Array(N); for (let i = 0; i < N; i++) { const d = KLn[i] - p.KA; VA[i] = d > 1e-5 ? Math.min(S.vmax, Math.sqrt(p.MA * 9.81 / d)) : S.vmax; } p.VA[lane] = VA; }
  return p;
}
function table(S, p, margin, lane = 0) {
  const key = margin + '|' + lane; if (p.TB[key]) return p.TB[key];
  const KLn = p.KL[lane], t = Float32Array.from(p.VA[lane]);
  const q = RM / cmOf(S);   // capacité latérale réelle / capacité utilisée par la table : cercle de friction pendant le freinage (trail-braking)
  for (let r = 0; r < 2; r++) for (let i = N - 1; i >= 0; i--) {
    const vn = t[(i + 1) % N], ay = vn * vn * KLn[i], am = (p.MA * 9.81 + p.KA * vn * vn) * q, f = Math.sqrt(Math.max(.04, 1 - (ay / am) ** 2));
    const v = Math.sqrt(vn * vn + 2 * decelAt(S, vn) * f / margin * ds); if (v < t[i]) t[i] = v;
  }
  return (p.TB[key] = t);
}
export const vlOf = (S) => prof(S).VA[0];
/** Table de vitesses cibles du niveau expert : sert aux zones de freinage affichées au joueur. */
export const brakeTable = (S) => table(S, prof(S), LEVELS.expert.margin);

// Allure par tronçon de 20 m (pm ≤ 1) : une sortie de piste en vitesse ralentit les 100 m qui précèdent. Apprise une fois par (voiture, niveau)
// par un tour fantôme au premier createAi, puis mémorisée : les IA n'ont plus à « découvrir » les virages en course.
const NB = Math.ceil(LEN / 20), PMS = new Map(), bin = (x) => Math.floor((((x % LEN) + LEN) % LEN) / 20) % NB;
function learn(S, level, q = false) {
  const key = S.id + '|' + level + (q ? '|q' : ''); let pm = PMS.get(key); if (pm) return pm;
  pm = new Float32Array(NB).fill(1); PMS.set(key, pm);
  for (const seed of [3, 17, 41, 59]) for (let run = 0; run < 8; run++) {   // départ arrêté, 2 tours, jusqu'à un parcours sans sortie de piste (plusieurs graines = bruits de ligne différents)
    const ph = createCar(S, TRACK.startIdx * ds - 14, 0), g = mk(ph, level, seed, pm, q), all = [ph];
    let tick = 0, p = 0, prev = ph.s;
    while (tick < 60 * 60 * 5 && p < 2 * LEN) { stepField([g], all, tick++, 1 / 60, false); let d = ph.s - prev; prev = ph.s; d -= LEN * Math.round(d / LEN); p += d; }
    if (!g.ev) break;
  }
  return pm;
}
/** qualifying = true : qualifications (voitures fantômes) → l'IA ignore le trafic et roule seule sur la ligne optimisée. */
export const createAi = (ph, level, seed, qualifying = false, laps = 0) => { const a = mk(ph, level, seed, learn(ph.sheet, level, !!qualifying), !!qualifying); a.laps = laps; return a; };   // laps > 0 : arrêts au stand possibles
// Voies fixes des IA (m, + = droite), espacées de 1,9 m : deux voitures voisines ne roulent jamais côte à côte sur la même trajectoire.
const LW = 1.1, laneOf = (lat, seed) => (lat > .5 ? LW : lat < -.5 ? -LW : seed % 2 ? LW : -LW);
function mk(ph, level, seed, pm, q = false) {
  const L = LEVELS[level] || LEVELS.normal, r = rng(seed * 7919 + 13), sheet = ph.sheet = withSpec(ph.sheet, L.spec), lane = q ? 0 : laneOf(ph.lat, seed), p = prof(sheet, lane);
  return {
    ph, L, q, sheet, r, t1: table(sheet, p, L.margin, lane), t2: table(sheet, p, L.margin * .94, lane), skill: 1 + (r() - .5) * (SKILL_SPREAD[level] ?? .025), lane, blk: 0, vf: 0, p1: r() * 6.28, p2: r() * 6.28,
    pm, ev: 0, off: false, wait: Math.min(.1, L.react * .08 * r()), tl: ph.lat, vt: 0, tx: ph.x, tz: ph.z, fault: null, atk: 0, tgt: null, atkT: 0, defDone: false, defT: 0, defSide: 0, calm: 0, gl: null, dist: 0, joined: false, stk: 0, rec: 0, recover: 0,
    inp: { throttle: 0, brake: 0, steer: 0 }, level, laps: 0, p0: 0, pit: 0, pitD: 0, pitT: 0, pitN: 0, pitChk: false, pitW: 0, pitTO: 0, avgV: 0, damage: { aero: 0, grip: 0, drag: 0, w: { nose: 0, fw: 0, hood: 0, l: 0, r: 0, rw: 0, floor: 0 } },
  };
}

// --- Stands (IA) : arrêt réparateur si rentable. États a.pit : 0 piste · 1 vers le box (freinage, voie rapide, pit limiter) · 2 arrêté (réparation) · 3 sortie.
// Rentabilité = perte de temps restante due aux dégâts (tours restants × ralentissement) contre coût du passage (voie lente + arrêt). Jamais le box du joueur ; un box déjà réservé / occupé est évité.
const S0 = TRACK.startIdx * ds, PIT_LIM = 80 / 3.6, PL = PIT_LIM * .96, PIT_FIX = 2.5, PITM = { facile: 1.7, normal: 1.35, difficile: 1.15, expert: 1.05 };
export { PIT_LIM };
const inLane = (c) => c.lat * PIT.sg > ROAD_HALF + 3 && pitExt(c.s) > 3;   // même condition que le pit limiter du joueur
let BOXES = null, FIELD = [];
/** Abscisses (m depuis la ligne) des box des IA : un garage dessiné sur deux (24 m d'écart, pour pouvoir se garer sans toucher le voisin), sans celui du joueur, après la rampe d'entrée. */
const boxes = () => BOXES ||= (() => { const o = [], sA = -PIT.back + PIT.T, sB = PIT.fwd - PIT.T; for (let d = sA + 6, k = 0; d + 6 <= sB; d += 12, k++) if (k % 2 === 0 && Math.abs(d - PIT.boxD) >= 10 && d >= sA + 45) o.push(d); return o; })();
const reserved = (o) => o.pit === 1 || o.pit === 2 || (o.pit === 3 && wrapS(o.ph.s - S0) < o.pitD + 15);
function pitWorth(a, rem) {
  const D = a.damage; let tot = 0; for (const k in D.w) tot += D.w[k]; tot /= 7;
  const f = Math.min(.5, D.grip * .55 + D.aero * .1 + D.drag * .06 + tot * .06);   // ralentissement estimé (vitesse cible × (1 − f))
  if (f < .03) return false;
  if (!a.avgV) { let t = 0; for (let i = 0; i < N; i++) t += ds / Math.max(8, a.t1[i]); a.avgV = LEN / t * a.L.speed * a.skill; }
  const Lp = PIT.back + PIT.fwd, cost = Lp * (1 / PIT_LIM - 1 / a.avgV) + PIT_FIX + 2 + 2;   // voie lente + arrêt + freinage / relance
  if (rem < Lp + 200) return false;
  return rem / a.avgV * (1 / (1 - f) - 1) * 1.1 > cost * (PITM[a.level] ?? 1.35) * (.9 + .2 * a.r());
}
/** Décalage latéral cible (m depuis le bord de piste, + = côté stands) au point d (m depuis la ligne). */
function pitX(a, d) {
  const T = PIT.T; let x = -3.5 + 10.5 * cl((d + PIT.back) / T, 0, 1);   // rampe d'entrée : du bord de piste à la voie rapide (x = 7)
  if (a.pit === 1) { const dB = a.pitD - d; if (dB < 40) x = 7 + 6.25 * cl((40 - dB) / 30, 0, 1); }   // 40 m avant le box : vers la voie des box (x = 13,25)
  else if (a.pit === 2) x = 13.25;
  else { x = 13.25 - 6.25 * cl((d - a.pitD) / 20, 0, 1); if (d > PIT.fwd - T) x = Math.min(x, 7 - 10.5 * cl((d - PIT.fwd + T) / T, 0, 1)); }
  return x;
}
function pitPlan(a, all, v) {
  const c = a.ph, d = wrapS(c.s - S0), sg = PIT.sg;
  if (a.pit === 0) {
    if (!a.laps || a.q || !a.joined || a.pitN >= 2) return;
    const de = wrapS(S0 - PIT.back - c.s);   // distance à la rampe d'entrée
    if (de > 520) { a.pitChk = false; return; }
    if (a.pitChk || de < 130) return;        // une évaluation par tour, assez tôt pour freiner
    if (FIELD.some((o) => o !== a && o.pit === 1 && Math.abs(wrapS(o.ph.s - c.s)) < 150)) return;   // pas deux IA qui entrent côte à côte : on réessaie un peu plus loin
    a.pitChk = true;
    if (!pitWorth(a, a.laps * LEN - (a.p0 + a.dist))) return;
    const bx = boxes().find((b) => !FIELD.some((o) => o !== a && reserved(o) && o.pitD === b) && !all.some((o) => o !== c && !o.gone && Math.abs(wrapS(o.s - S0 - b)) < 7 && o.lat * sg - ROAD_HALF > 9));
    if (bx === undefined) return;
    a.pit = 1; a.pitD = bx; a.pitTO = 0; a.atk = 0; a.tgt = null; return;
  }
  if ((a.pitTO += .05) > 150) { a.pit = 0; return; }
  const dB = a.pitD - d;
  if (a.pit === 1) { if (dB < 1.8 && dB > -3 && v < 3.2) { a.pit = 2; a.pitT = PIT_FIX + a.r() * .5; a.pitW = 0; } else if (dB <= -3) { a.pit = 3; a.pitN++; } }   // raté : repart sans réparer
  else if (a.pit === 2) {
    if (v < 1.2) a.pitT -= .05;
    if (a.pitT <= 0 && (!all.some((o) => { const e = wrapS(o.s - c.s), l = o.lat * sg - ROAD_HALF; return o !== c && !o.gone && e > -30 && e < 12 && l > 3 && l < 11; }) || (a.pitW += .05) > 6)) {   // on ne ressort que si la voie rapide est libre
      const D = a.damage; D.grip = D.aero = D.drag = 0; for (const k in D.w) D.w[k] = 0; a.pit = 3; a.pitN++;
    }
  } else if ((d > PIT.fwd - PIT.T && !inLane(c)) || d > PIT.fwd) a.pit = 0;
}
/** Vitesse cible dans les stands : freinage jusqu'au pit limiter avant la voie rapide, arrêt au box, 80 km/h à la sortie. */
function pitSpeed(a, vt, v, am, d) {
  if (a.pit === 2) return 0;
  if (a.pit === 3) return Math.min(vt, PL);
  const dl = -PIT.back + PIT.T * .6 - d, dB = a.pitD - d;
  let m = Math.min(vt, dl > 0 ? Math.sqrt(PL * PL + 2 * am * .45 * dl) : PL);
  if (dB < 70) m = Math.min(m, 1.8 + Math.sqrt(2 * 3.2 * Math.max(0, dB - 1)));
  return m;
}

const F = {}, COR = 1.95, AVD = 1.2, THR = 2.3, DV = 2, STD = 700;   // COR : demi-largeur du couloir « voiture devant » (m) ; AVD : poussée latérale d'évitement ; THR : TTC (s) sous lequel on freine ; DV : écart de vitesse (m/s) justifiant un dépassement ; STD : distance de la phase de départ (m)
/** Vitesse max derrière `lead` à `gap` m (pare-chocs) : v telle qu'on freine jusqu'à sa vitesse avant la marge. Départ : suivi plus serré. */
const follow = (a, gap, lead) => { const st = a.dist < 700, m = st ? 4 : 5; return lead.u + (gap > m ? Math.sqrt(2 * (st ? 6 : 5.5) * (gap - m)) : -(m - gap) * 1.6); };
function free(all, c, ah, s, ga, cand) {
  if (Math.abs(cand) > LIM) return false;
  for (const o of all) {
    if (o === c || o === ah || o.gone) continue;
    const d = wrapS(o.s - s);
    // Il faut un couloir libre sur toute la distance nécessaire au dépassement,
    // avec une marge derrière pour ne pas couper la route à une voiture qui arrive.
    if (d > -9 && d < Math.max(ga + 8, 26) && Math.abs(o.lat - cand) < 2.25) return false;
  }
  return true;
}
/** Décision (échelonnée, toutes les 3 frames) : cible latérale, point visé, vitesse cible.
 *  Trafic : freinage uniquement sur TTC faible (vitesse de rapprochement), dépassement sur la ligne droite, déboîtement forcé si bloqué > 2 s.
 *  Qualifications (a.q) : voitures fantômes (invisibles, sans collision) → les IA ignorent le trafic et roulent leur tour seules. */
function decide(a, all, t) {
  const c = a.ph, L = a.L, r = a.r, v = Math.max(c.u, 0), s = c.s, idx = c.idx, dt = .05, q = a.q, st = a.dist < STD;
  if (a.wait > 0) a.wait -= dt;
  if (a.gl === null) { a.gl = c.lat; a.p0 = wrapS(s - S0); a.lane = q ? 0 : laneOf(c.lat, a.lane > 0 ? 1 : 0); if (c.sheet !== a.sheet) c.sheet = a.sheet; const pp = prof(a.sheet, a.lane); a.t1 = table(a.sheet, pp, L.margin, a.lane); a.t2 = table(a.sheet, pp, L.margin * .94, a.lane); }   // file de grille
  a.dist += v * dt;
  pitPlan(a, all, v); const pit = a.pit > 0, pz = pit && wrapS(s - S0) > -PIT.back - 30;   // pz : dans la zone des stands (rampe comprise) ; avant, conduite normale fondue vers la trajectoire des stands
  if (a.wait <= 0 && a.rec <= 0 && v < 1.5 && a.vt > 5) { if ((a.stk += dt) > 2) { a.rec = 1.6; a.stk = 0; } } else a.stk = 0;   // plantée : marche arrière de dégagement
  // voisinage : voiture devant dans le couloir (largeur voiture + marge), voiture derrière, poussée latérale, voitures proches
  let ah = null, ga = 1e9, bh = null, gb = 1e9, push = 0, pw = 0, yc = 1e9, near = 0;
  if (!q) for (let k = 0; k < all.length; k++) {
    const o = all[k]; if (o === c || o.gone) continue;
    const d = wrapS(o.s - s); if (d > 150 || d < -60) continue;
    const dl = o.lat - c.lat, adl = dl < 0 ? -dl : dl, ad = d < 0 ? -d : d;
    if (ad < 11 && adl < 3.8) { const w = cl((11 - ad) / 8, 0, 1) * cl((3.8 - adl) / 2.7, 0, 1); push += (dl > 0 ? -1 : dl < 0 ? 1 : (c.lat > 0 ? -1 : 1)) * w; pw += w; }
    if (ad < 16 && adl < 5) near++;
    if (d > .3 && d < 5.5 && adl < 2.2 && a.dist > 150 && !(a.atk && o === a.tgt)) yc = Math.min(yc, Math.max(o.u - .5, v - .9));   // côte à côte légèrement devant : celle de derrière lève le pied
    if (d > 0 && d < ga && adl < COR) { ga = d; ah = o; }
    if (d < 0 && -d < gb && adl < 2.6) { gb = -d; bh = o; }
  }
  let kmx = 0; for (let k = 0; k < 14; k++) kmx = Math.max(kmx, Math.abs(K[(idx + k) % N]));   // courbure max sur ~55 m
  let kf = 0; for (let k = 0, n = Math.min(60, Math.round((25 + v * 1.6) / ds)); k < n; k++) kf = Math.max(kf, Math.abs(K[(idx + k) % N]));   // courbure max sur la distance de dépassement
  let k200 = 0, k300 = 0; for (let q2 = 0, n = Math.min(75, Math.round(300 / ds)); q2 < n; q2++) { const kk = Math.abs(K[(idx + q2) % N]); if (q2 < Math.round(200 / ds) && kk > k200) k200 = kk; if (kk > k300) k300 = kk; }
  const noPassZone = k200 > .0048 || k300 > .007 || kf > .0055;
  let cs = 0; for (let k = 0; k < 64 && !cs; k += 3) { const kk = K[(idx + k) % N]; if (Math.abs(kk) > .006) cs = kk > 0 ? 1 : -1; }   // côté du prochain virage (+ = droite)
  // fautes
  if (a.fault) { if ((a.fault.t -= dt) <= 0) a.fault = null; }
  else if (L.faults && v > 20 && a.wait <= 0 && r() < L.faults / 60 * dt) a.fault = { k: 1, t: .4 + r() * .4, s: r() < .5 ? -1 : 1 };
  // ligne : ligne optimisée (qualifs) + apex raté + voie perso + erreur lente
  const look = pz ? cl(6 + v * .25, 6, 14) : cl((8 + v * .48) * cl(1.05 - kmx * 200, .55, 1), 9, 27), j = (idx + Math.round(look / ds)) % N;
  const recovery = 1 - Math.min(.8, a.damage.grip);
  const noise = L.err * recovery * (.6 * Math.sin(t * .7 + a.p1) + .4 * Math.sin(t * 1.3 + a.p2));
  const laneFade = FADE[j];
  let base = cl(aiLine[j] * (1 - L.miss * (1 + Math.sin(s * .011 + a.p1))), -(LIM - Math.abs(a.lane)), LIM - Math.abs(a.lane)) + a.lane * recovery * laneFade + noise;
  const offRoad = !pz && (c.surf >= 2 || Math.abs(c.lat) > ROAD_HALF - .25);
  if (offRoad) {
    base = Math.sign(c.lat || 1) * Math.min(ROAD_HALF - 1.45, Math.max(2.15, Math.abs(c.lat) - 3.1));
    a.recover = Math.max(a.recover, 1.15);
  } else a.recover = Math.max(0, a.recover - dt);
  if (a.fault && a.fault.k === 1) base += a.fault.s * .35;
  if (pit) { const dl = wrapS(s + look - S0), b = cl((280 + PIT.back + dl) / 200, 0, 1); base = base * (1 - b) + PIT.sg * (ROAD_HALF + pitX(a, dl)) * b; if (pz) { a.recover = 0; a.fault = null; } }   // stands : trajectoire dédiée, rejointe progressivement
  if (!a.joined) { if (a.dist > 120 && (q || !all.some((o) => o !== c && !o.gone && Math.abs(wrapS(o.s - s)) < 7 && Math.abs(o.lat - base) < 2.1))) a.joined = true; else base = a.gl; }   // 120 m en file, puis ligne si la place est libre
  // bloquée : voiture plus lente devant, tout près, alors que la vitesse voulue (sans trafic) est plus haute
  const vfree = a.vf;
  if (!st && ah && ga - 4.6 < 30 + v * .25 && vfree > ah.u + 1.2) a.blk += dt; else a.blk = Math.max(0, a.blk - 2 * dt);
  let ov = null, cap = 1e9, late = false;
  const am = Math.max(6, decelAt(a.sheet, v)), g0 = (st ? 3 : 1.2) + .03 * v;
  if (ah) {
    const gap = ga - 4.6, clo = v - ah.u, forced = a.blk > 2;
    // Dépassement : choisir une voie complète et la tenir jusqu'à être devant. Normal : ligne droite dégagée ; forcé (bloquée > 2 s) : dès que le virage n'est pas serré.
    if (!pit && !a.atk && L.attack && a.wait <= 0 && a.joined && a.dist > 260 && (forced ? kmx < .0055 && kf < .007 : !noPassZone && kmx < .0045 && kf < .0055)) {
      const slower = ah.u < vfree - (forced ? 1.5 : DV);
      // longueur de ligne droite restante : le dépassement (durée ≈ (écart + 9 m) / vitesse relative) doit être terminé avant le freinage
      let dStr = 0; if (slower) { const n = Math.min(110, N); while (dStr < n && Math.abs(K[(idx + dStr) % N]) < .0045) dStr++; dStr *= ds; }
      if (slower && dStr > v * ((gap + 9) / Math.max(1.2, clo) + 1) + 50 && gap > Math.max(0, clo * (ah.u < 8 ? .35 : .6)) && gap < (ah.u < 8 ? 120 : Math.max(40, clo * 3.5))) {
        const sides = [cs || 1, -(cs || 1)];
        const choices = sides.map((side) => {
          const cand = cl(ah.lat + side * 2.9, -LIM, LIM), edge = ROAD_HALF - Math.abs(cand);
          const lineCost = Math.abs(cand - aiLine[j]);
          return { side, cand, score: lineCost + Math.max(0, 2.1 - edge) * 5 + (side === (cs || 1) ? 0 : .35) };
        }).filter((q2) => Math.abs(q2.cand - ah.lat) > 2.15 && free(all, c, ah, s, ga, q2.cand)).sort((x, y) => x.score - y.score);
        if (choices.length) { a.atk = choices[0].side; a.tgt = ah; a.atkT = 8; a.passLat = choices[0].cand; a.blk = 0; }
      }
    }
    // freinage : seulement si le temps avant collision (TTC) est faible ; même vitesse = aucun freinage. On anticipe un freinage du leader (ax lissé).
    const ue = ah.u - Math.max(ah.bk > .15 ? ah.bk * am * .3 : 0, -Math.min(0, ah.ax || 0) * .35), cv = v - ue;
    if (cv > .3) { const ttc = gap / cv, thr = st ? 3.2 : THR; if (ttc < thr) cap = ue + Math.sqrt(2 * am * (.5 + .4 * cl(1 - ttc / thr, 0, 1)) * Math.max(0, gap - g0)); }
    else if (gap < g0 * .6) cap = ue - 1.5;
  }
  if (a.atk && !pit) {
    const d = wrapS(a.tgt.s - s); a.atkT -= dt;
    if (d < -7 || d > 48 || a.atkT <= 0 || (d > 1 && noPassZone)) { a.atk = 0; a.tgt = null; }   // abandon : freinage à venir et pas encore à hauteur
    else { ov = cl(a.passLat ?? a.tgt.lat + a.atk * 2.9, -LIM, LIM); late = false; if (a.tgt.u < 8) cap = Math.min(cap, 18 + Math.sqrt(2 * 9 * Math.max(0, d - 4.6))); }   // voiture arrêtée : on la dépasse à vitesse réduite, freinage progressif
  }
  if (!bh || gb > 40) { if ((a.calm += dt) > 3) a.defDone = false; } else a.calm = 0;
  const avoid = pz ? 0 : pw > 0 ? cl(push / pw * Math.min(1.4, pw) * (a.atk ? .55 : AVD), -1.8, 1.8) : 0;
  cap = Math.min(cap, yc);
  // Garde-fou de bord : position latérale prévue dans ~0,5 s. Trop près du bord → retour vers le centre, visée courte, on lève le pied.
  frameAt(s, F); const he = wrap(c.psi - Math.atan2(F.tz, F.tx)), pred = c.lat + (c.u * Math.sin(he) + c.w * Math.cos(he)) * .5;
  if (!pz && (Math.abs(pred) > ROAD_HALF - 1 || Math.abs(c.lat) > ROAD_HALF - .8)) a.guard = .7; else a.guard = Math.max(0, (a.guard || 0) - dt);
  const g = a.guard > 0, rate = (2.5 + .045 * v) * (g ? 3 : 1);
  const des = g ? Math.sign(pred || c.lat) * Math.min(LIM * .55, Math.abs(c.lat)) : pz ? base : cl((ov !== null ? ov : base) + avoid, -LIM, LIM);
  a.tl += cl(des - a.tl, -rate * dt, rate * dt);
  if (g && Math.abs(c.lat) > ROAD_HALF - 1.6) cap = Math.min(cap, Math.max(14, v - 6));
  frameAt(c.s + (g ? Math.min(look, 12) : look), F); a.tx = F.x + F.rx * a.tl; a.tz = F.z + F.rz * a.tl;
  const failure = a.damage, ti = Math.floor(((s + v * .12) % LEN) / ds) % N;
  const slip = Math.abs(Math.atan2(c.w, Math.max(Math.abs(c.u), 2)));
  frameAt(s, F); const headingError = Math.abs(wrap(c.psi - Math.atan2(F.tz, F.tx)));
  // allure apprise : une sortie de piste en vitesse ralentit les 100 m qui précèdent — seulement si la sortie est « propre » (aucune voiture autour : pas de faute due au trafic)
  if (c.surf >= 2) { if (!a.off && v > 8) { if (near === 0) for (let d = -140; d <= 20; d += 20) { const b = bin(s + d); a.pm[b] = Math.max(.7, a.pm[b] - .08); } a.ev++; } a.off = true; } else a.off = false;
  let vt = (late ? a.t2 : a.t1)[ti]; vt *= (L.speed * a.skill) * (1 - (1 - a.pm[bin(ti * ds)]) * cl((.98 * a.sheet.vmax - vt) / (.15 * a.sheet.vmax), 0, 1));
  vt *= 1 - Math.min(.48, failure.grip * .42 + failure.aero * .08 + cl(slip - .12, 0, .8) * .22 + cl(headingError - .25, 0, 1.2) * .2);
  const sharp = cl((kmx - .0035) / .0025, 0, 1); vt *= 1 - (L.speed >= 1 ? .035 : .07) * sharp;   // virage serré : vitesse un peu plus basse pour garder l'adhérence
  if (st) { vt *= 1 - .1 * cl(1 - a.dist / 700, 0, 1) * cl(kf * 250, 0, 1); vt *= 1 - Math.min(.3, near * .06) * cl(kmx * 180, 0, 1); }   // départ : en virage dans le peloton, on garde de la marge
  const sat = Math.abs(a.inp.steer); if (sat > .7) vt *= 1 - Math.min(.35, (sat - .7) * 1.3);   // sous-virage : volant presque à fond = on lève le pied
  if (c.surf === 2) vt = Math.min(vt * .54, 13);
  if (!pz && (c.surf === 3 || Math.abs(c.lat) > ROAD_HALF - .6)) vt = Math.min(vt, 8);
  if (a.recover > 0) vt = Math.min(vt, 12 + Math.max(0, 5 - Math.abs(headingError) * 5));
  if (pit) vt = pitSpeed(a, vt, v, am, wrapS(s - S0));
  if (inLane(c)) vt = Math.min(vt, PL);   // pit limiter : toute IA dans la voie rapide
  a.vf = vt; a.vt = Math.max(0, Math.min(vt, cap));
}
/** Pilotage à chaque pas physique : pure pursuit + pédales vers vt. */
function drive(a, dt) {
  const c = a.ph, S = c.sheet, L = a.L, i = a.inp, v = Math.max(c.u, 0);
  const dx = a.tx - c.x, dz = a.tz - c.z, ang = wrap(Math.atan2(dz, dx) - c.psi), dist = Math.max(4, Math.hypot(dx, dz));
  // Pure pursuit avec correction de cap : le terme d'angle évite le cas sin(pi)=0
  // qui laissait une voiture tournée vers l'arrière tourner en rond sans correction.
  const heading = cl(ang, -1.6, 1.6), curvature = 2 * Math.sin(ang) / dist + .72 * heading / dist;
  // Retour de lacet : si la voiture tourne moins que demandé (sous-virage), on demande davantage de braquage au lieu de dériver vers l'extérieur.
  const yawFix = v > 8 && !(a.guard > 0) && a.recover <= 0 && !a.atk && c.surf < 2 ? cl(curvature - c.r / v, -.04, .04) * YG : 0;
  const roadAngle = Math.atan((S.a + S.b) * (curvature + yawFix)), speedScale = 1 + (v / S.steerV) ** 2;
  const slipAngle = Math.atan2(c.w, Math.max(Math.abs(c.u), 2));
  // Contre-braquage et amortissement du lacet, surtout utiles quand les pneus
  // retrouvent soudainement de l'adhérence à la sortie du gravier.
  const stabilise = cl(slipAngle * .62 - c.r * .07, -.32, .32);
  let st = (a.rec > 0 ? -1 : 1) * cl((roadAngle + stabilise) * speedScale / S.steerMax, -1, 1);
  if (a.recover > 0) st = cl(st, -.62, .62); // pas de coup de volant quand les roues retrouvent le bitume
  i.steer += cl(st - i.steer, -14 * dt, 14 * dt);
  const e = a.vt - v, slip = Math.abs(Math.atan2(c.w, Math.max(c.u, 3)));
  let th = 0, br = 0;
  if (e < -.5) br = cl(-e / 1.2, 0, 1); else th = a.vt >= S.vmax * .96 ? 1 : cl(.15 + e / 3, 0, 1);   // ligne droite : plein gaz jusqu'à la vitesse max
  th *= (1 - (1 - L.aggr) * cl(Math.abs(i.steer) * 3, 0, 1)) * cl(1 - (slip - .1) * 4, .12, 1);
  if (a.wait > 0) { a.wait = Math.max(0, a.wait - dt); th *= .65; }
  if (a.vt < .5 && v < 2 && a.rec <= 0) { th = .22; br = 0; }
  if (a.pit === 2) { th = 0; br = 1; }   // arrêté au box
  if (a.recover > 0 && v > a.vt + .4) { th = 0; br = Math.max(br, cl((v - a.vt) / 2.2, .25, .9)); }
  i.rev = a.rec > 0; if (i.rev) { a.rec -= dt; th = 0; br = 1; }
  i.throttle += cl(th - i.throttle, -8 * dt, 6 * dt); i.brake += cl(br - i.brake, -9 * dt, 9 * dt);
}

// collisions voitures : boîtes orientées (SAT), séparation, choc inélastique (perte de vitesse), petite rotation si choc de côté
const HL = 2.25, HW = .93, AX = new Float64Array(8);
function collide(all) {
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const A = all[i], B = all[j], dx = B.x - A.x, dz = B.z - A.z; if (A.gone || B.gone || dx * dx + dz * dz > 26) continue;
    const ca = Math.cos(A.psi), sa = Math.sin(A.psi), cb = Math.cos(B.psi), sb = Math.sin(B.psi);
    AX[0] = ca; AX[1] = sa; AX[2] = -sa; AX[3] = ca; AX[4] = cb; AX[5] = sb; AX[6] = -sb; AX[7] = cb;
    let best = 1e9, nx = 0, nz = 0;
    for (let k = 0; k < 8; k += 2) {
      const ux = AX[k], uz = AX[k + 1];
      const pa = HL * Math.abs(ca * ux + sa * uz) + HW * Math.abs(-sa * ux + ca * uz), pb = HL * Math.abs(cb * ux + sb * uz) + HW * Math.abs(-sb * ux + cb * uz);
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
      const rx = dx / 2, rz = dz / 2, m = A.sheet.mass * q / A.sheet.iz * .25;   // bras de levier au point de contact (milieu)
      A.r += cl(-(rx * nz - rz * nx) * m, -.5, .5); B.r += cl(-(rx * nz - rz * nx) * m, -.5, .5);
      ax *= .98; az *= .98; bx *= .98; bz *= .98;
      A.u = ca * ax + sa * az; A.w = -sa * ax + ca * az; B.u = cb * bx + sb * bz; B.w = -sb * bx + cb * bz;
    }
  }
}

/** Un pas physique pour toutes les IA (décisions échelonnées 1 frame sur 3) puis collisions. all = physiques de toutes les voitures, joueur compris. */
export function stepField(list, all, tick, dt, collisions = true, qualifying) {
  if (qualifying !== undefined) for (let k = 0; k < list.length; k++) list[k].q = !!qualifying;
  const t = tick * dt; FIELD = list;
  for (let k = 0; k < list.length; k++) {
    const a = list[k], c = a.ph, d = a.damage;
    if (c.raceFinished) continue;
    if (c.sheet !== a.sheet) c.sheet = a.sheet;   // la fiche de l'IA (bonus de specs éventuel) suit toujours la physique
    d.w ||= { nose: 0, fw: 0, hood: 0, l: 0, r: 0, rw: 0, floor: 0 };
    // Les dégâts s’accumulent après les chocs et les sorties, comme pour le joueur.
    if (c.hv > 2) {
      const hit = (c.hv - 2) * .014; d.grip = Math.min(.65, d.grip + hit * .22); d.aero = Math.min(.8, d.aero + hit * .35); d.drag = Math.min(1.2, d.drag + hit * .12);
      d.w.nose = Math.min(1, d.w.nose + hit); d.w.hood = Math.min(1, d.w.hood + hit * .55); d.w.fw = Math.min(1, d.w.fw + hit * .7); d.w.l = Math.min(1, d.w.l + hit * .25); d.w.r = Math.min(1, d.w.r + hit * .25); c.hv = 0;
    }
    if (c.surf === 2) { d.grip = Math.min(.65, d.grip + dt * .0015); d.w.floor = Math.min(1, d.w.floor + dt * .003); }
    c.fa = 1 - d.aero; c.fg = 1 - d.grip * .35; c.fd = 1 + d.drag;
    if ((tick + k) % 3 === 0) decide(a, all, t);
    drive(a, dt); c.bk = a.inp.brake; c.limit = !a.q && inLane(c) ? PIT_LIM : 0; stepCar(c, a.inp, dt);   // c.bk : feux stop (visibles des suiveurs)
    if (c.surf >= 2) {
      // Assistance de récupération réservée aux IA : elle amortit le lacet sur le meuble
      // et les réaligne doucement avec le circuit au lieu de les laisser tourner indéfiniment.
      frameAt(c.s, F);
      const road = Math.atan2(F.tz, F.tx), err = wrap(road - c.psi);
      c.psi += cl(err, -.42, .42) * dt * 1.8;
      c.w *= Math.exp(-3.8 * dt); c.r *= Math.exp(-5.5 * dt);
    }
  }
  if (collisions) collide(all);
}
export { collide };