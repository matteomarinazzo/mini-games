// IA V4 : pilotes sur la même physique que le joueur. Regard sur la spline idéale, vitesses cibles par courbure (freinage arrière),
// niveaux (erreur de ligne, marge de freinage, réaccélération, fautes), attaque / défense par décalage latéral, collisions boîtes.
// V11+ : tables de vitesse par fiche voiture (adhérence, appui, vmax), les IA peuvent prendre n'importe quelle voiture.
import { TRACK, frameAt } from './track.js';
import { stepCar, createCar } from './physics.js';

const { N, ds, length: LEN, K, ideal, half: ROAD_HALF } = TRACK, LIM = ROAD_HALF - 2.1;   // centre voiture : ≥ 2,1 m du bord (demi-largeur .93 + marge)
const LNF = 1, KC = Float32Array.from(K, (k) => Math.abs(k) * .85);   // LNF : part de la ligne idéale suivie ; KC : courbure utile de l'axe
/** Ligne de course suivie par les IA (décalage latéral, + = droite) : c'est aussi celle affichée au joueur. */
export const aiLine = Float32Array.from(ideal, (v) => Math.max(-(LIM - .2), Math.min(LIM - .2, v * LNF)));
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
// Décalage de voie par tronçon : plein en ligne droite, réduit à 50 % en virage (les voitures restent proches de la corde).
const FADE = new Float32Array(N);
for (let i = 0; i < N; i++) { let km = 0; for (let k = 0; k < 14; k++) km = Math.max(km, Math.abs(K[(i + k) % N])); FADE[i] = cl((.0055 - km) / .003, .85, 1); }
/** Ligne d'une voie (décalage m par tronçon, borné à la route utile). */
const lineOf = (lane) => Float32Array.from(aiLine, (v, i) => cl(v, -(LIM - Math.abs(lane)), LIM - Math.abs(lane)) + lane * FADE[i]);
/** Courbure réelle suivie sur une ligne : plus serrée côté intérieur (rayon − décalage), donc vitesse cible juste pour chaque voie. */
const KLof = (line) => Float32Array.from(K, (k, i) => { const a = Math.abs(k); return .85 * a / (1 - cl(line[i] * Math.sign(k) * a, -.9, .9)); });
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const wrapS = (d) => d - LEN * Math.round(d / LEN);
const rng = (s) => { const next = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; next.getState = () => s; next.setState = (v) => { s = v | 0; }; return next; };

export const LEVELS = {
  //            err   miss  marge vit   aggr  fautes/min attaque défense voie  réaction(s)
  facile: { err: .38, miss: .08, margin: 1.7, speed: .9, aggr: .62, faults: 0, attack: .45, defend: .1, lane: .65, react: .5 },
  normal: { err: .22, miss: .04, margin: 1.55, speed: .96, aggr: .78, faults: 0, attack: .7, defend: .45, lane: .42, react: .2 },
  difficile: { err: .12, miss: .02, margin: 1.4, speed: .99, aggr: .9, faults: 0, attack: .8, defend: .75, lane: .24, react: .08 },
  expert: { err: .04, miss: .005, margin: 1.3, speed: 1.02, aggr: 1, faults: 0, attack: 1, defend: 1, lane: .08, react: 0 },
};

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
function learn(S, level) {
  const key = S.id + '|' + level; let pm = PMS.get(key); if (pm) return pm;
  pm = new Float32Array(NB).fill(1); PMS.set(key, pm);
  for (const seed of [3, 17, 41, 59]) for (let run = 0; run < 8; run++) {   // départ arrêté, 2 tours, jusqu'à un parcours sans sortie de piste (plusieurs graines = bruits de ligne différents)
    const ph = createCar(S, TRACK.startIdx * ds - 14, 0), g = mk(ph, level, seed, pm), all = [ph];
    let tick = 0, p = 0, prev = ph.s;
    while (tick < 60 * 60 * 5 && p < 2 * LEN) { stepField([g], all, tick++, 1 / 60, false); let d = ph.s - prev; prev = ph.s; d -= LEN * Math.round(d / LEN); p += d; }
    if (!g.ev) break;
  }
  return pm;
}
export const createAi = (ph, level, seed) => mk(ph, level, seed, learn(ph.sheet, level));
// Voies fixes des IA (m, + = droite), espacées de 1,9 m : deux voitures voisines ne roulent jamais côte à côte sur la même trajectoire.
const LW = 1.1, laneOf = (lat, seed) => (lat > .5 ? LW : lat < -.5 ? -LW : seed % 2 ? LW : -LW);
function mk(ph, level, seed, pm) {
  const L = LEVELS[level] || LEVELS.normal, r = rng(seed * 7919 + 13), lane = laneOf(ph.lat, seed), p = prof(ph.sheet, lane);
  return {
    ph, L, r, t1: table(ph.sheet, p, L.margin, lane), t2: table(ph.sheet, p, L.margin * .94, lane), skill: 1 + (r() - .5) * (level === 'expert' ? .006 : .025), lane, p1: r() * 6.28, p2: r() * 6.28,
    pm, ev: 0, off: false, wait: Math.min(.1, L.react * .08 * r()), tl: ph.lat, vt: 0, tx: ph.x, tz: ph.z, fault: null, atk: 0, tgt: null, atkT: 0, defDone: false, defT: 0, defSide: 0, calm: 0, gl: null, dist: 0, joined: false, stk: 0, rec: 0, recover: 0,
    inp: { throttle: 0, brake: 0, steer: 0 }, damage: { aero: 0, grip: 0, drag: 0, w: { nose: 0, fw: 0, hood: 0, l: 0, r: 0, rw: 0, floor: 0 } },
  };
}

const F = {};
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
/** Décision (échelonnée, toutes les 3 frames) : cible latérale, point visé, vitesse cible. */
function decide(a, all, t) {
  const c = a.ph, L = a.L, r = a.r, v = Math.max(c.u, 0), s = c.s, idx = c.idx, dt = .05;
  if (a.wait > 0) a.wait -= dt;
  if (a.gl === null) { a.gl = c.lat; a.lane = laneOf(c.lat, a.lane > 0 ? 1 : 0); const pp = prof(c.sheet, a.lane); a.t1 = table(c.sheet, pp, L.margin, a.lane); a.t2 = table(c.sheet, pp, L.margin * .94, a.lane); }                       // file de grille
  a.dist += v * dt;
  if (a.wait <= 0 && a.rec <= 0 && v < 1.5 && a.vt > 5) { if ((a.stk += dt) > 2) { a.rec = 1.6; a.stk = 0; } } else a.stk = 0;   // plantée : marche arrière de dégagement
  let ah = null, ga = 1e9, bh = null, gb = 1e9, repel = 0, repelWeight = 0, yc = 1e9;
  for (const o of all) {
    if (o === c || o.gone) continue; const d = wrapS(o.s - s), dl = o.lat - c.lat;
    // Analyse les voitures dans les deux sens de course et sur les voies voisines.
    if (Math.abs(d) < 11 && Math.abs(dl) < 3.8) {
      const weight = cl((11 - Math.abs(d)) / 8, 0, 1) * cl((3.8 - Math.abs(dl)) / 2.7, 0, 1);
      repel += (dl > 0 ? -1 : dl < 0 ? 1 : (c.lat > 0 ? -1 : 1)) * weight; repelWeight += weight;
    }
    if (d > .3 && d < 5.5 && Math.abs(dl) < 2.6 && !(a.atk && o === a.tgt)) if (a.dist > 150) yc = Math.min(yc, Math.max(o.u - .5, v - .9));   // voiture côte à côte légèrement devant : celle de derrière lève le pied
    if (d > 0 && d < ga && Math.abs(dl) < 4.2) { ga = d; ah = o; }
    if (d < 0 && -d < gb && Math.abs(dl) < 4.2) { gb = -d; bh = o; }
  }
  let kmx = 0; for (let k = 0; k < 14; k++) kmx = Math.max(kmx, Math.abs(K[(idx + k) % N]));   // courbure max sur ~55 m : pas de dépassement avant / dans un virage serré
  let kf = 0; for (let k = 0, n = Math.min(60, Math.round((25 + v * 1.6) / ds)); k < n; k++) kf = Math.max(kf, Math.abs(K[(idx + k) % N]));   // courbure max sur la distance de dépassement (freinage à venir)
  let cs = 0; for (let k = 0; k < 64 && !cs; k += 3) { const kk = K[(idx + k) % N]; if (Math.abs(kk) > .006) cs = kk > 0 ? 1 : -1; }   // côté du prochain virage (+ = droite)
  // fautes
  if (a.fault) { if ((a.fault.t -= dt) <= 0) a.fault = null; }
  else if (L.faults && v > 20 && a.wait <= 0 && r() < L.faults / 60 * dt) a.fault = { k: 1, t: .4 + r() * .4, s: r() < .5 ? -1 : 1 };
  // ligne : spline idéale + apex raté + voie perso + erreur lente
  const look = cl((8 + v * .48) * cl(1.05 - kmx * 200, .55, 1), 9, 27), j = (idx + Math.round(look / ds)) % N;
  const recovery = 1 - Math.min(.8, a.damage.grip);
  const noise = L.err * recovery * (.6 * Math.sin(t * .7 + a.p1) + .4 * Math.sin(t * 1.3 + a.p2));
  const laneFade = FADE[j];
  let base = cl(aiLine[j] * (1 - L.miss * (1 + Math.sin(s * .011 + a.p1))), -(LIM - Math.abs(a.lane)), LIM - Math.abs(a.lane)) + a.lane * recovery * laneFade + noise;
  // Dès que les roues quittent l'asphalte, viser le centre utile de la piste.
  const offRoad = c.surf >= 2 || Math.abs(c.lat) > ROAD_HALF - .25;
  if (offRoad) {
    // Revenir progressivement sur SON côté de l'asphalte : traverser le centre depuis le gravier
    // imposait un braquage complet et relançait un tête-à-queue dès que l'adhérence revenait.
    base = Math.sign(c.lat || 1) * Math.min(ROAD_HALF - 1.45, Math.max(2.15, Math.abs(c.lat) - 3.1));
    a.recover = Math.max(a.recover, 1.15);
  } else a.recover = Math.max(0, a.recover - dt);
  if (a.fault && a.fault.k === 1) base += a.fault.s * .35;
  if (!a.joined) { if (a.dist > 120 && !all.some((o) => o !== c && !o.gone && Math.abs(wrapS(o.s - s)) < 7 && Math.abs(o.lat - base) < 2.1)) a.joined = true; else base = a.gl; }   // 120 m en file, puis ligne si la place est libre
  let ov = null, cap = 1e9, late = false;
  // Dépassement : choisir une voie complète et la tenir jusqu'à être devant.
  if (ah) {
    const gap = ga - 4.6, blk = Math.abs(ah.lat - c.lat) < 2.4;
    const slower = ah.u < Math.max(v, a.vt) - .35;
    if (!a.atk && L.attack && kmx < .0045 && kf < .0055 && slower && a.wait <= 0 && a.joined && a.dist > 260 && gap > Math.max(0, (v - ah.u) * (ah.u < 8 ? .35 : .6)) && gap < (ah.u < 8 ? 120 : 40)) {
      const sides = [cs || 1, -(cs || 1)];
      const choices = sides.map((side) => {
        const cand = cl(ah.lat + side * 2.9, -LIM, LIM), edge = ROAD_HALF - Math.abs(cand);
        const lineCost = Math.abs(cand - aiLine[j]);
        return { side, cand, score: lineCost + Math.max(0, 2.1 - edge) * 5 + (side === (cs || 1) ? 0 : .35) };
      }).filter((q) => Math.abs(q.cand - ah.lat) > 2.15 && free(all, c, ah, s, ga, q.cand)).sort((x, y) => x.score - y.score);
      if (choices.length) { a.atk = choices[0].side; a.tgt = ah; a.atkT = 6; a.passLat = choices[0].cand; }
    }
    if (gap < Math.max(70, (v - ah.u) ** 2 / 14 + 25) && blk) cap = Math.min(cap, follow(a, gap, ah));   // distance de suivi physique : on peut toujours s'arrêter derrière la voiture de devant
  }
  if (a.atk) {
    const d = wrapS(a.tgt.s - s); a.atkT -= dt;
    if (d < -7 || d > 48 || a.atkT <= 0 || (d > 8 && kf > .0075)) { a.atk = 0; a.tgt = null; }
    else { ov = cl(a.passLat ?? a.tgt.lat + a.atk * 2.9, -LIM, LIM); late = true; const g2 = wrapS(a.tgt.s - s) - 4.6; cap = g2 < 70 && Math.abs(a.tgt.lat - c.lat) < 2.4 ? follow(a, g2, a.tgt) : 1e9; if (a.tgt.u < 8) cap = Math.min(cap, 18 + Math.sqrt(2 * 9 * Math.max(0, g2))); }   // voiture arrêtée : on la dépasse à vitesse réduite, freinage progressif
  }
  // défense : une seule fois côté intérieur, puis on tient la ligne (pas de zigzag)
  if (bh && gb < 22 && L.defend && !a.defDone && !a.atk && cs && kf < .004 && r() < L.defend * .3) { a.defDone = true; a.defT = 3.5; a.defSide = cs; }
  if (a.defT > 0) { a.defT -= dt; if (!a.atk) ov = a.defSide * 4; }
  if (!bh || gb > 40) { if ((a.calm += dt) > 3) a.defDone = false; } else a.calm = 0;
  const avoid = repelWeight > 0 ? cl(repel / repelWeight * Math.min(1.7, repelWeight) * (a.atk ? 0.55 : 1.6), -2.4, 2.4) : 0;
  cap = Math.min(cap, yc);
  // Garde-fou de bord : position latérale prévue dans ~0,8 s (cap + dérive). Trop près du bord → retour immédiat vers le centre, visée courte, on lève le pied.
  frameAt(s, F); const he = wrap(c.psi - Math.atan2(F.tz, F.tx)), pred = c.lat + (c.u * Math.sin(he) + c.w * Math.cos(he)) * .5;
  if (Math.abs(pred) > ROAD_HALF - 1 || Math.abs(c.lat) > ROAD_HALF - .8) a.guard = .7; else a.guard = Math.max(0, (a.guard || 0) - dt);
  const g = a.guard > 0, rate = (2.5 + .045 * v) * (g ? 3 : 1);
  const des = g ? Math.sign(pred || c.lat) * Math.min(LIM * .55, Math.abs(c.lat)) : cl((ov !== null ? ov : base) + avoid, -LIM, LIM);
  a.tl += cl(des - a.tl, -rate * dt, rate * dt);
  if (g && Math.abs(c.lat) > ROAD_HALF - 1.6) cap = Math.min(cap, Math.max(14, v - 6));
  frameAt(c.s + (g ? Math.min(look, 12) : look), F); a.tx = F.x + F.rx * a.tl; a.tz = F.z + F.rz * a.tl;
  const failure = a.damage, ti = Math.floor(((s + v * .12) % LEN) / ds) % N;
  const slip = Math.abs(Math.atan2(c.w, Math.max(Math.abs(c.u), 2)));
  frameAt(s, F); const headingError = Math.abs(wrap(c.psi - Math.atan2(F.tz, F.tx)));
  if (c.surf >= 2) { if (!a.off && v > 8) { for (let d = -140; d <= 20; d += 20) { const b = bin(s + d); a.pm[b] = Math.max(.7, a.pm[b] - .08); } a.ev++; } a.off = true; } else a.off = false;
  let vt = (late ? a.t2 : a.t1)[ti]; vt *= (L.speed * a.skill) * (1 - (1 - a.pm[bin(ti * ds)]) * cl((.98 * c.sheet.vmax - vt) / (.15 * c.sheet.vmax), 0, 1));
  vt *= 1 - Math.min(.48, failure.grip * .42 + failure.aero * .08 + cl(slip - .12, 0, .8) * .22 + cl(headingError - .25, 0, 1.2) * .2);
  const sharp = cl((kmx - .0035) / .0025, 0, 1); vt *= 1 - (L.speed >= 1 ? .035 : .07) * sharp;   // virage serré : vitesse un peu plus basse pour garder l'adhérence
  let crowd = 0; for (const q of all) if (q !== c && !q.gone && Math.abs(wrapS(q.s - s)) < 16 && Math.abs(q.lat - c.lat) < 5) crowd++;
  vt *= 1 - .1 * cl(1 - a.dist / 700, 0, 1) * cl(kf * 250, 0, 1); vt *= 1 - Math.min(a.dist < 700 ? .3 : .2, crowd * .06) * cl(kmx * 180, 0, 1);   // en virage, dans le peloton : on garde de la marge (lignes perturbées par l'évitement)
  const sat = Math.abs(a.inp.steer); if (sat > .7) vt *= 1 - Math.min(.35, (sat - .7) * 1.3);   // sous-virage : volant presque à fond = on lève le pied
  if (c.surf === 2) vt = Math.min(vt * .54, 13);
  if (c.surf === 3 || Math.abs(c.lat) > ROAD_HALF - .6) vt = Math.min(vt, 8);
  if (a.recover > 0) vt = Math.min(vt, 12 + Math.max(0, 5 - Math.abs(headingError) * 5));
  a.vt = Math.max(0, Math.min(vt, cap));
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
export function stepField(list, all, tick, dt, collisions = true) {
  const t = tick * dt;
  for (let k = 0; k < list.length; k++) {
    const a = list[k], c = a.ph, d = a.damage;
    if (c.raceFinished) continue;
    d.w ||= { nose: 0, fw: 0, hood: 0, l: 0, r: 0, rw: 0, floor: 0 };
    // Les dégâts s’accumulent après les chocs et les sorties, comme pour le joueur.
    if (c.hv > 2) {
      const hit = (c.hv - 2) * .014; d.grip = Math.min(.65, d.grip + hit * .22); d.aero = Math.min(.8, d.aero + hit * .35); d.drag = Math.min(1.2, d.drag + hit * .12);
      d.w.nose = Math.min(1, d.w.nose + hit); d.w.hood = Math.min(1, d.w.hood + hit * .55); d.w.fw = Math.min(1, d.w.fw + hit * .7); d.w.l = Math.min(1, d.w.l + hit * .25); d.w.r = Math.min(1, d.w.r + hit * .25); c.hv = 0;
    }
    if (c.surf === 2) { d.grip = Math.min(.65, d.grip + dt * .0015); d.w.floor = Math.min(1, d.w.floor + dt * .003); }
    c.fa = 1 - d.aero; c.fg = 1 - d.grip * .35; c.fd = 1 + d.drag;
    if ((tick + k) % 3 === 0) decide(a, all, t);
    drive(a, dt); stepCar(c, a.inp, dt);
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