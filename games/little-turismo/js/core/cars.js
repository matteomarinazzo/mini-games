// Voitures GT low poly : carrosseries lissées (sections Catmull-Rom, flancs à 2 pans), roues dynamiques partagées (pneu à flancs, jante à branches, disque + étrier) qui braquent (angle réel de physics.js) puis roulent, feux stop, livrées procédurales (aplats, bandes, numéros). Un seul mesh par carrosserie (couleur par uniforme). La physique/IA est dans physics.js / ai.js (c.ph ajouté par game.js).
import { builder } from './track-mesh.js';
import { TRACK } from './track.js';
import { playerIndex } from './race.js';
import { look } from './sheets.js';

const hex = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const BODY = (k) => [-k, 0, 0];   // r < 0 : couleur de carrosserie × |r| (voir shader)
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const GLASS = hex(0x131c25), DARK = hex(0x14161a);
export const CAR = { length: 4.6, width: 1.88, height: 1.15 };

const bx = (B, x, y, z, a, b, l, c) => {   // boîte centrée, demi-dimensions a, b, l
  const p = (i, j, k) => [x + (i ? a : -a), y + (j ? b : -b), z + (k ? l : -l)];
  B.quad(p(0, 0, 0), p(0, 1, 0), p(0, 1, 1), p(0, 0, 1), c, [-1, 0, 0]); B.quad(p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1), c, [1, 0, 0]);
  B.quad(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1), c, [0, -1, 0]); B.quad(p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1), c, [0, 1, 0]);
  B.quad(p(0, 0, 0), p(1, 0, 0), p(1, 1, 0), p(0, 1, 0), c, [0, 0, -1]); B.quad(p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1), c, [0, 0, 1]);
};
function fq(B, a, b, c, d, col, ctr) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
  if (n[0] * ((a[0] + c[0]) / 2 - ctr[0]) + n[1] * ((a[1] + c[1]) / 2 - ctr[1]) + n[2] * ((a[2] + c[2]) / 2 - ctr[2]) < 0) n = n.map((x) => -x);
  B.quad(a, b, c, d, col, n);
}
// sections [z, demi-largeur bas, y bas, y haut, demi-largeur haut] ; sub() insère une section lissée (Catmull-Rom) entre deux sections
const sub = (S) => { const n = S.length, o = []; for (let i = 0; i < n; i++) { o.push(S[i]); if (i < n - 1) { const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(n - 1, i + 2)]; o.push(b.map((_, k) => (k ? (9 * (b[k] + c[k]) - a[k] - d[k]) / 16 : (b[0] + c[0]) / 2))); } } return o; };
const at = (S, z) => { for (let i = 0; i < S.length - 1; i++) { const a = S[i], b = S[i + 1]; if (z <= b[0]) { const t = Math.max(0, (z - a[0]) / (b[0] - a[0])); return a.map((v, k) => v + (b[k] - v) * t); } } return S[S.length - 1]; };
const hm = (s) => Math.max(s[1], s[4]) * 1.03 + .01, ym = (s) => s[2] + (s[3] - s[2]) * .42;   // arête de flanc : largeur max, hauteur
const sideX = (S, z, y) => { const s = at(S, z), m = ym(s), h = hm(s); return y < m ? s[1] + (h - s[1]) * Math.max(0, (y - s[2]) / (m - s[2])) : h + (s[4] - h) * Math.min(1, (y - m) / (s[3] - m)); };
function loft(B, S, ctr, side, top, bot = DARK, low = side) {
  S = sub(S);
  const C = (s) => { const h = hm(s), m = ym(s), z = s[0]; return [[-s[1], s[2], z], [s[1], s[2], z], [h, m, z], [s[4], s[3], z], [-s[4], s[3], z], [-h, m, z]]; };
  for (let i = 0; i < S.length - 1; i++) {
    const a = C(S[i]), b = C(S[i + 1]), t = typeof top === 'function' ? top(i >> 1) : top;
    fq(B, a[0], a[1], b[1], b[0], bot, ctr); fq(B, a[1], a[2], b[2], b[1], low, ctr); fq(B, a[2], a[3], b[3], b[2], side, ctr);
    fq(B, a[3], a[4], b[4], b[3], t, ctr); fq(B, a[4], a[5], b[5], b[4], side, ctr); fq(B, a[5], a[0], b[0], b[5], low, ctr);
  }
  for (const s of [S[0], S[S.length - 1]]) { const c = C(s); fq(B, c[0], c[1], c[2], c[5], side, ctr); fq(B, c[5], c[2], c[3], c[4], side, ctr); }
}
function cyl(B, cx, cy, cz, r, w) {   // petit cylindre statique (roulette de wheelie bar)
  const n = 8, pt = (a, x) => [x, cy + r * Math.sin(a), cz + r * Math.cos(a)];
  for (let k = 0; k < n; k++) { const a0 = 6.2832 * k / n, a1 = 6.2832 * (k + 1) / n, am = (a0 + a1) / 2; B.quad(pt(a0, cx - w / 2), pt(a0, cx + w / 2), pt(a1, cx + w / 2), pt(a1, cx - w / 2), hex(0x1a1a1d), [0, Math.sin(am), Math.cos(am)]); for (const s of [-1, 1]) B.quad([cx + s * w / 2, cy, cz], pt(a0, cx + s * w / 2), pt(a1, cx + s * w / 2), pt(a1, cx + s * w / 2), hex(0x2a2a2f), [s, 0, 0]); }
}
const MET = hex(0x9aa0a8), LAMP = [2, 1.9, 1.5], GLS = hex(0x0b0d10), WHT = hex(0xe8e8e8), TLD = [1.1, .05, .04], TLB = [3.2, .35, .28];
const bs = () => [...Array(7)].map(() => builder());
const pack = (B, W, F, ML, MR, TL, DT) => ({ main: B.done(), wing: W.done(), front: F.done(), ml: ML.done(), mr: MR.done(), tl: TL.done(), det: DT.done() });   // ailes / rétros cassables (damage.js), feux stop, détails (LOD)

// --- Roues : [x, z, rayon, largeur] avant (f) et arrière (r) ; rc = couleur jante, cc = étrier ; s = jante pleine ; a = bras de suspension avant mobiles
const WH = {
  gt: { f: [.79, 1.38, .34, .3], r: [.79, -1.32, .35, .32], rc: [.74, .77, .82], cc: [.85, .1, .08], s: 0 },
  wedge: { f: [.84, 1.32, .34, .32], r: [.86, -1.3, .36, .38], rc: [.85, .87, .9], cc: [.95, .8, .1], s: 0 },
  proto: { f: [.86, 1.35, .34, .32], r: [.88, -1.4, .36, .4], rc: [.5, .53, .58], cc: [.9, .4, .05], s: 0 },
  rally: { f: [.84, 1.4, .38, .32], r: [.84, -1.35, .38, .32], rc: [.85, .65, .25], cc: [.9, .1, .1], s: 0 },
  open: { f: [.98, 1.5, .33, .36], r: [.98, -1.3, .37, .46], rc: [.62, .64, .68], cc: [.25, .25, .28], s: 0, a: 1 },
  drag: { f: [.38, 2.7, .22, .12], r: [.95, -1.5, .5, .48], rc: [.7, .7, .72], cc: [.5, .5, .5], s: 1, a: 1 },
  kart: { f: [.56, .55, .13, .13], r: [.6, -.5, .15, .2], rc: [.78, .8, .84], cc: [.3, .3, .32], s: 1 },
  thrust: { f: [1.02, .85, .28, .15], r: [.3, -1.85, .28, .16], rc: [.86, .88, .92], cc: [.6, .6, .6], s: 1 },
};
const DEFS = { a: 1.25, b: 1.45, steerMax: .5 };
/** Roue unitaire (axe x, rayon 1, largeur 1, face visible côté +x ; x négatif = miroir) : bande, épaules, flancs, lèvre, fût, branches (ou disque plein), moyeu. */
function wheelMesh(R, solid) {
  const B = builder(), n = 14, T = hex(0x141416), SW = hex(0x1e1e22), RB = BODY(1), RD = BODY(.5), p = (a, x, r) => [x, r * Math.sin(a), r * Math.cos(a)];
  for (let k = 0; k < n; k++) {
    const a0 = 6.2832 * k / n, a1 = 6.2832 * (k + 1) / n, am = (a0 + a1) / 2, s = Math.sin(am), c = Math.cos(am);
    B.quad(p(a0, -.44, 1), p(a0, .44, 1), p(a1, .44, 1), p(a1, -.44, 1), T, [0, s, c]);
    for (const e of [-1, 1]) { B.quad(p(a0, e * .44, 1), p(a0, e * .5, .88), p(a1, e * .5, .88), p(a1, e * .44, 1), T, [e * .6, s * .8, c * .8]); B.quad(p(a0, e * .5, .88), p(a0, e * .5, .7), p(a1, e * .5, .7), p(a1, e * .5, .88), SW, [e, 0, 0]); }
    B.quad(p(a0, .5, .7), p(a0, .5, .64), p(a1, .5, .64), p(a1, .5, .7), RB, [1, 0, 0]);
    B.quad(p(a0, .5, .64), p(a0, .4, .64), p(a1, .4, .64), p(a1, .5, .64), RD, [0, -s, -c]);
    if (solid) B.quad([.42, 0, 0], p(a0, .42, .64), p(a1, .42, .64), p(a1, .42, .64), RB, [1, 0, 0]);
    else B.quad([.47, 0, 0], p(a0, .47, .17), p(a1, .47, .17), p(a1, .47, .17), RD, [1, 0, 0]);
  }
  if (!solid) for (let j = 0; j < 5; j++) {   // 5 branches effilées
    const a = 1.2566 * j, s = Math.sin(a), c = Math.cos(a), q = (r, w) => [.44, r * s + w * c, r * c - w * s];
    B.quad(q(.12, -.06), q(.12, .06), q(.65, .11), q(.65, -.11), RB, [1, 0, 0]);
  }
  return R.mesh(B.done());
}
/** Disque de frein (fixe) + étrier (même espace unitaire, ne roule pas, braque avec la roue). */
function brakeMesh(R) {
  const B = builder(), n = 12, p = (a, r) => [.02, r * Math.sin(a), r * Math.cos(a)];
  for (let k = 0; k < n; k++) { const a0 = 6.2832 * k / n, a1 = 6.2832 * (k + 1) / n; B.quad(p(a0, .52), p(a1, .52), p(a1, .26), p(a0, .26), hex(0x7d848d), [1, 0, 0]); }
  bx(B, .08, -.02, -.4, .2, .2, .16, BODY(1)); bx(B, .1, .12, -.4, .2, .04, .12, BODY(.7));
  return R.mesh(B.done());
}
const armMesh = (R) => { const B = builder(); bx(B, .5, 0, 0, .5, .5, .5, hex(0x2a2d33)); return R.mesh(B.done()); };
let WHL = null;
const wheelsOf = (R) => WHL || (WHL = { w: [wheelMesh(R, 0), wheelMesh(R, 1)], cal: brakeMesh(R), arm: armMesh(R) });
const LM = new Float32Array(16);
const mm = (o, C) => { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = C[r] * LM[c * 4] + C[4 + r] * LM[c * 4 + 1] + C[8 + r] * LM[c * 4 + 2] + C[12 + r] * LM[c * 4 + 3]; return o; };
/** o = C · T(x,y,z) · Ry(braquage cd,sd) · Rx(roulage ca,sa) · S(w,r,r) : ordre position → braquage → roulage, sans allocation. */
function wm(o, C, x, y, z, cd, sd, ca, sa, w, r) {
  LM[0] = w * cd; LM[1] = 0; LM[2] = -w * sd; LM[3] = 0; LM[4] = r * sa * sd; LM[5] = r * ca; LM[6] = r * sa * cd; LM[7] = 0;
  LM[8] = r * ca * sd; LM[9] = -r * sa; LM[10] = r * ca * cd; LM[11] = 0; LM[12] = x; LM[13] = y; LM[14] = z; LM[15] = 1; return mm(o, C);
}
/** Bras : boîte unitaire étirée du point A au point B (plan horizontal), épaisseur t. */
function arm(o, C, ax, ay, az, bx_, by, bz, t) {
  const dx = bx_ - ax, dy = by - ay, dz = bz - az, h = Math.hypot(dx, dz) || 1;
  LM[0] = dx; LM[1] = dy; LM[2] = dz; LM[3] = 0; LM[4] = 0; LM[5] = t; LM[6] = 0; LM[7] = 0; LM[8] = -dz * t / h; LM[9] = 0; LM[10] = dx * t / h; LM[11] = 0; LM[12] = ax; LM[13] = ay; LM[14] = az; LM[15] = 1; return mm(o, C);
}
/** Passages de roue : panneaux sombres qui suivent le flanc autour des roues (carrosseries fermées). */
function arches(B, kd) {
  const K = KINDS[kd], W = WH[kd];
  for (const w of [W.f, W.r]) for (let sg = -1; sg <= 1; sg += 2) {
    const r = w[2], z0 = w[1] - r * 1.1, z1 = w[1] + r * 1.1, lo = .2, hi = 2 * r + .05, s = at(K.S, w[1]), m = Math.max(lo + .01, Math.min(hi - .01, ym(s))), P = (z, y) => [sg * (sideX(K.S, z, y) + .01), y, z];
    for (const [a, b] of [[lo, m], [m, hi]]) B.quad(P(z0, a), P(z1, a), P(z1, b), P(z0, b), DARK, [sg, 0, 0]);
  }
}

const BODY_S = [[-2.3, .7, .3, .6, .6], [-2, .82, .24, .72, .74], [-1, .84, .22, .76, .78], [.4, .84, .22, .75, .78], [1.4, .8, .22, .6, .7], [2.1, .72, .24, .46, .62], [2.3, .6, .3, .4, .5]];
const CAB_S = [[-1.2, .78, .72, .95, .58], [-.8, .8, .74, 1.15, .55], [0, .8, .75, 1.15, .55], [.9, .8, .68, .7, .74]];

/** Tube de section rectangulaire suivant une polyligne de points [[x,y,z]...], half-epaisseur twxth, couleur c. */
function tube(B, pts, tw, th, c) {
  const n = pts.length;
  const frame = (i) => {
    const p = pts[i];
    const fwd = i < n - 1 ? [pts[i + 1][0] - p[0], pts[i + 1][1] - p[1], pts[i + 1][2] - p[2]]
      : [p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]];
    const fl = Math.hypot(...fwd) || 1, fd = fwd.map(v => v / fl);
    const wx = -fd[2], wz = fd[0], wl = Math.hypot(wx, wz) || 1;
    const rx = wx / wl, rz = wz / wl;
    const ux = -fd[1] * rz, uy = fd[0] * rz - fd[2] * rx, uz = fd[1] * rx;
    return { p, rx, ry: 0, rz, ux, uy, uz };
  };
  const corner = (fr, sw, sh) => [fr.p[0] + fr.rx * sw * tw + fr.ux * sh * th,
  fr.p[1] + fr.ry * sw * tw + fr.uy * sh * th,
  fr.p[2] + fr.rz * sw * tw + fr.uz * sh * th];
  for (let i = 0; i < n - 1; i++) {
    const a = frame(i), b = frame(i + 1);
    const a0 = corner(a, -1, -1), a1 = corner(a, 1, -1), a2 = corner(a, 1, 1), a3 = corner(a, -1, 1);
    const b0 = corner(b, -1, -1), b1 = corner(b, 1, -1), b2 = corner(b, 1, 1), b3 = corner(b, -1, 1);
    const ctr = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2, (a.p[2] + b.p[2]) / 2];
    fq(B, a0, a1, b1, b0, c, ctr); fq(B, a1, a2, b2, b1, c, ctr); fq(B, a2, a3, b3, b2, c, ctr); fq(B, a3, a0, b0, b3, c, ctr);
    fq(B, a0, a1, a2, a3, c, ctr); fq(B, b1, b0, b3, b2, c, ctr);
  }
}

// --- GT (détaillée GT3)
function buildGT() {
  const [B, W, F, ML, MR, TL, DT] = bs();
  loft(B, BODY_S, [0, .5, 0], BODY(1), BODY(1.08), DARK, BODY(.78));
  loft(B, CAB_S, [0, .95, -.2], GLASS, (i) => (i === 1 ? BODY(.95) : GLASS));
  arches(B, 'gt');

  // --- Aileron arrière GT3 (W)
  bx(W, 0, 1.05, -2.16, .90, .02, .22, DARK);                     // plan principal carbone
  bx(W, 0, 1.07, -2.16, .86, .012, .14, BODY(.85));               // lame supérieure
  bx(W, 0, 1.09, -2.26, .86, .018, .008, DARK);                   // gurney flap bord de fuite
  for (const x of [-.45, .45]) {
    bx(W, x, .86, -2.18, .025, .18, .06, DARK);                   // mât col de cygne vertical
    bx(W, x, 1.04, -2.12, .025, .04, .12, DARK);                  // bras supérieur plongeant
  }
  for (const x of [-.90, .90]) bx(W, x, 1.05, -2.16, .015, .14, .25, BODY(.8)); // endplates GT3 profilées

  // --- Feux arrière & diffuseur (TL, B, DT)
  bx(TL, 0, .57, -2.31, .18, .015, .01, BODY(1));                 // bandeau LED central
  for (const x of [-.44, .44]) {
    bx(TL, x, .57, -2.31, .30, .035, .012, BODY(1));              // feux stop principaux
    bx(DT, x * 1.15, .32, -2.37, .055, .055, .06, MET);           // canule échappement chromée
    bx(DT, x * 1.15, .32, -2.41, .038, .038, .012, hex(0x111111)); // intérieur noir canule
  }
  bx(TL, 0, .31, -2.36, .06, .045, .01, hex(0xff1111));           // feu pluie FIA diffuseur

  // --- Splitter avant & aéro (F, DT)
  bx(F, 0, .24, 2.22, .72, .025, .15, DARK);                      // lame splitter basse
  bx(F, 0, .26, 2.31, .64, .012, .07, BODY(.7));                  // lèvre aéro couleur carrosserie
  for (const x of [-.72, .72]) bx(F, x, .30, 2.22, .015, .07, .12, DARK); // dérives latérales splitter
  for (const x of [-.76, .76]) {
    bx(F, x, .37, 2.18, .06, .012, .08, DARK);                    // dive plane bas (canard)
    bx(F, x * .97, .44, 2.14, .05, .012, .07, DARK);              // dive plane haut
  }
  for (const x of [-.22, .22]) bx(DT, x, .29, 2.28, .008, .045, .008, MET); // tirants inox de splitter

  // --- Face avant & phares (B, DT)
  for (const x of [-.43, .43]) {
    bx(B, x, .43, 2.29, .15, .035, .01, LAMP);                     // projecteurs principaux
    bx(B, x, .43, 2.27, .19, .055, .02, GLS);                     // masque noir du phare
    bx(B, x, .47, 2.285, .16, .008, .01, hex(0x99ddff));          // signature DRL LED
    bx(B, x * .98, .33, 2.30, .13, .04, .012, DARK);              // écope freins avant
  }
  bx(B, 0, .35, 2.315, .36, .11, .012, GLS);                      // calandre centrale
  bx(DT, 0, .38, 2.325, .04, .025, .01, MET);                     // badge central calandre
  for (const x of [-.22, 0, .22]) bx(B, x, .36, 2.33, .012, .065, .014, hex(0x515963)); // barres verticales calandre

  // --- Diffuseur arrière (B)
  bx(B, 0, .28, -2.33, .52, .065, .08, hex(0x111419));            // caisson diffuseur
  for (const x of [-.36, -.18, 0, .18, .36]) bx(B, x, .29, -2.36, .01, .07, .07, DARK); // ailettes de diffuseur

  // --- Flancs, jupes, vitres & rétros (B, ML, MR, DT)
  for (const x of [-.84, .84]) {
    bx(B, x, .43, .35, .018, .12, .68, GLASS);                    // vitre latérale
    bx(B, x, .39, -1.34, .018, .08, .43, DARK);                   // montant custode arrière
    bx(x < 0 ? ML : MR, x * 1.07, .84, .72, .07, .045, .08, BODY(.9)); // coque rétro
    bx(x < 0 ? ML : MR, x * 1.01, .80, .74, .04, .014, .03, DARK);     // bras rétro
    bx(DT, x * 1.06, .84, .67, .055, .035, .008, hex(0xccd8e8));       // miroir
    bx(B, x * .99, .26, 0, .025, .04, 1.30, DARK);                 // jupe latérale carbone
    bx(B, x * 1.01, .32, -1.0, .015, .07, .16, DARK);             // dérive latérale arrière
    bx(B, x * .98, .60, .35, .01, .012, .09, MET);                 // poignée de porte affleurante
  }
  bx(DT, .85, .72, -.85, .01, .045, .045, MET);                    // bouchon de réservoir rapide alu
  bx(DT, .852, .72, -.85, .008, .02, .02, DARK);                  // orifice central bouchon

  // --- Habitacle visible (arceau-cage tubulaire) & toit (B, DT)
  bx(B, 0, .92, -.2, .62, .018, .018, hex(0xd0d5dc));             // barre transversale arceau
  for (const x of [-.44, .44]) bx(B, x, .86, -.58, .018, .20, .018, hex(0xd0d5dc)); // montants arrière cage
  bx(B, 0, 1.16, -.42, .01, .035, .08, DARK);                     // antenne aileron requin toit
  bx(B, 0, .77, .95, .045, .028, .82, hex(0xdce6ee));             // bandeau central toit

  // --- Capot avant aéré (B, DT)
  bx(B, 0, .79, 1.66, .48, .012, .24, hex(0x20262d));             // zone d'extraction d'air capot
  for (let i = 0; i < 3; i++) bx(DT, 0, .80, 1.54 + i * .10, .36, .008, .02, DARK); // ailettes d'extraction capot
  for (const x of [-.32, .32]) bx(B, x, .74, 1.38, .12, .01, .18, hex(0x15181c)); // ouïes latérales capot
  return pack(B, W, F, ML, MR, TL, DT);
}
// --- Hypercar en coin
const WS = [[-2.3, .66, .28, .48, .55], [-1.85, .92, .22, .76, .80], [-1.3, 1.0, .2, .8, .82], [-.5, .98, .2, .64, .7], [.5, .94, .2, .56, .56], [1.3, 1.0, .2, .6, .6], [1.8, .86, .2, .4, .42], [2.3, .52, .22, .28, .28]];
const WC = [[-1.45, .62, .56, .82, .42], [-.9, .72, .56, 1.0, .38], [0, .76, .56, 1.04, .36], [.7, .8, .54, .86, .46], [1.2, .82, .52, .62, .66]];
function buildWedge() {
  const [B, W, F, ML, MR, TL, DT] = bs();
  loft(B, WS, [0, .5, 0], BODY(1), BODY(1.08), DARK, BODY(.78));
  loft(B, WC, [0, .8, 0], GLASS, (i) => (i < 2 ? BODY(.92) : GLASS));
  arches(B, 'wedge');

  // --- Ailes sculptées (bosses de passage de roue), prises d'air de toit et dérive centrale
  for (const x of [-.9, .9]) {
    bx(B, x, .62, 1.32, .13, .04, .52, BODY(1.06));                 // bosse d'aile avant
    bx(B, x, .84, -1.3, .13, .045, .66, BODY(1.06));                // aile arrière haute
    bx(B, x * 1.02, .60, 1.32, .008, .035, .30, DARK);              // fente d'extraction avant
    for (let i = 0; i < 3; i++) bx(B, x * .98, .66, 1.18 + i * .12, .08, .006, .025, DARK); // louvres d'aile avant
    bx(B, x * 1.0, .26, -.1, .012, .05, 1.3, DARK);                 // jupe carbone
    bx(B, x * .93, .46, -.05, .04, .11, .34, hex(0x101318));        // entrée d'air de flanc
  }
  bx(B, 0, .94, -1.5, .016, .17, .85, BODY(.96));                   // aileron de requin
  bx(B, 0, 1.11, -1.5, .02, .012, .85, DARK);
  bx(B, 0, .86, -.78, .26, .05, .2, hex(0x15181c));                 // entrée d'air moteur (derrière l'habitacle)
  for (const x of [-.3, .3]) bx(B, x, .80, -1.05, .12, .012, .28, hex(0x15181c)); // évents capot moteur

  // --- Aileron arrière bas intégré (W)
  bx(W, 0, .98, -2.2, .84, .016, .2, DARK);
  bx(W, 0, 1.0, -2.17, .8, .012, .12, BODY(.88));
  bx(W, 0, 1.0, -2.31, .8, .014, .008, DARK);
  for (const x of [-.84, .84]) { bx(W, x, .90, -2.2, .016, .2, .26, BODY(.85)); bx(TL, x, .92, -2.46, .014, .13, .01, hex(0xff1122)); }
  for (const x of [-.4, .4]) bx(W, x, .86, -2.15, .02, .12, .08, DARK);

  // --- Nez, splitter, optiques fines (F, B)
  bx(F, 0, .2, 2.3, .84, .022, .17, DARK);
  bx(F, 0, .24, 2.35, .02, .06, .08, DARK);
  for (const x of [-.86, .86]) bx(F, x, .24, 2.22, .014, .07, .14, DARK);
  for (const x of [-.56, .56]) {
    bx(B, x, .4, 2.26, .26, .012, .02, LAMP);                        // barre LED
    bx(B, x * 1.2, .44, 2.2, .01, .08, .02, hex(0x88ddff));         // lame DRL verticale
    bx(B, x * .8, .3, 2.27, .2, .014, .018, GLS);
  }
  bx(B, 0, .3, 2.3, .2, .05, .01, GLS);                              // prise d'air de nez
  for (const x of [-.7, .7]) bx(B, x, .5, 1.75, .12, .01, .3, hex(0x15181c));      // évents de capot

  // --- Rétros, essuie-glace, antenne
  for (const x of [-.82, .82]) {
    bx(x < 0 ? ML : MR, x * .96, .76, .8, .04, .012, .03, DARK);
    bx(x < 0 ? ML : MR, x, .79, .78, .07, .036, .08, BODY(.9));
    bx(DT, x * 1.01, .79, .73, .05, .024, .008, hex(0xd0e0f0));
    bx(B, x * .97, .24, 2.2, .01, .07, .12, DARK);
  }
  bx(DT, 0, 1.06, -.2, .02, .02, .05, hex(0xffee00));                // caméra de toit jaune

  // --- Poupe : feux, diffuseur
  bx(TL, 0, .56, -2.31, .6, .014, .01, BODY(1));
  bx(TL, 0, .34, -2.38, .06, .05, .012, hex(0xff1111));
  bx(B, 0, .24, -2.32, .62, .055, .14, DARK);
  for (const x of [-.4, -.24, -.08, .08, .24, .4]) bx(B, x, .26, -2.36, .01, .065, .09, DARK);
  return pack(B, W, F, ML, MR, TL, DT);
}
// --- Prototype d'endurance
const PS = [[-2.3, .55, .28, .5, .5], [-1.8, .85, .22, .78, .7], [-.8, .9, .2, .66, .68], [.6, .88, .2, .55, .6], [1.6, .78, .2, .4, .45], [2.3, .5, .22, .28, .3]];
const PCB = [[-.9, .55, .6, .8, .45], [-.4, .6, .62, .98, .4], [.3, .6, .62, .98, .4], [1.1, .7, .55, .6, .62]];
function buildProto() {
  const [B, W, F, ML, MR, TL, DT] = bs();
  loft(B, PS, [0, .5, 0], BODY(1), BODY(1.06), DARK, BODY(.8));
  loft(B, PCB, [0, .8, 0], GLASS, (i) => (i === 1 ? WHT : GLASS));

  // --- Pontons & passages de roues
  for (const x of [-.88, .88]) {
    bx(B, x, .60, 1.35, .22, .07, .55, BODY(1.05));
    bx(B, x, .68, -1.40, .26, .09, .75, BODY(1.05));
    bx(B, x * 1.02, .52, 1.35, .01, .12, .50, DARK);
    bx(B, x * 1.02, .54, -1.40, .01, .12, .65, DARK);
    // Louvres anti-décollage sur les ailes (B)
    for (let i = 0; i < 3; i++) {
      bx(B, x * .98, .69, 1.25 + i * .10, .09, .008, .03, DARK);  // fentes avant
      bx(B, x * .98, .78, -1.25 + i * .10, .11, .008, .03, DARK); // fentes arrière
    }
  }

  // --- Aileron requin dorsal (Shark Fin) & Airbox (B, DT)
  bx(B, 0, 1.04, -1.40, .018, .36, 1.15, BODY(.95));              // grand aileron de requin central
  bx(B, 0, 1.23, -1.40, .022, .015, 1.15, DARK);                  // arête supérieure de l'aileron requin
  bx(B, 0, 1.01, -.25, .12, .07, .30, hex(0x181a20));             // prise d'air moteur de toit
  bx(B, 0, 1.01, -.10, .10, .05, .02, hex(0x0a0c10));             // ouverture d'air
  bx(DT, 0, 1.17, -.20, .02, .025, .05, hex(0xffee00));           // T-Cam télémétrie jaune fluo
  bx(DT, 0, .85, .58, .01, .014, .38, DARK);                       // essuie-glace cockpit

  // --- Aileron arrière XXL & dérives Le Mans (W, TL, DT)
  bx(W, 0, 1.20, -2.22, .88, .02, .24, DARK);                      // plan inférieur carbone
  bx(W, 0, 1.24, -2.18, .84, .012, .13, BODY(.9));                // plan supérieur couleur carrosserie
  bx(W, 0, 1.26, -2.32, .84, .02, .008, DARK);                    // gurney flap
  for (const x of [-.45, .45]) bx(W, x, 1.05, -2.15, .02, .18, .06, DARK); // piliers col de cygne
  for (const x of [-.88, .88]) {
    bx(W, x, 1.10, -2.22, .015, .16, .28, BODY(.85));             // endplate supérieure géante
    bx(W, x, .85, -2.20, .015, .20, .18, BODY(.8));               // dérive inférieure
    bx(TL, x, 1.05, -2.36, .018, .12, .01, hex(0xff1122));        // feux verticaux arrière d'endplate
  }

  // --- Museau & Aile avant multi-plans (F, B, DT)
  bx(F, 0, .28, 2.30, .14, .08, .12, BODY(.9));                   // quille centrale de nez
  bx(F, 0, .20, 2.30, .80, .02, .16, DARK);                       // plan inférieur
  bx(F, 0, .25, 2.24, .76, .012, .10, BODY(.85));                 // plan supérieur
  for (const x of [-.86, .86]) {
    bx(F, x, .28, 2.25, .02, .12, .24, BODY(.85));                // endplates avant monumentales
    bx(F, x, .36, 2.22, .06, .01, .10, DARK);                     // dive plane avant
  }
  for (const x of [-.72, .72]) {
    bx(x < 0 ? ML : MR, x * .95, .74, .62, .03, .07, .02, DARK);   // mât rétro
    bx(x < 0 ? ML : MR, x, .82, .60, .06, .035, .08, BODY(.9));   // coque rétro
    bx(DT, x * 1.01, .82, .55, .045, .025, .008, hex(0xdde8f5));   // miroir
  }
  for (const x of [-.80, .80]) bx(B, x, .30, 2.0, .015, .09, .20, BODY(.8)); // renfort d'aile

  // --- Optiques endurance Le Mans verticales (B)
  for (const x of [-.48, .48]) {
    bx(B, x, .48, 2.27, .07, .12, .02, GLS);                      // boîtier noir vertical
    for (let i = 0; i < 4; i++) bx(B, x, .40 + i * .05, 2.28, .04, .016, .012, LAMP); // 4 spots LED étagés
    bx(B, x * 1.12, .48, 2.275, .008, .11, .01, hex(0x66ccff));   // liseré DRL vertical
  }

  // --- Poupe, Échappements hauts, diffuseur & Leader lights (TL, B, DT)
  for (const x of [-.22, .22]) {
    bx(DT, x, .76, -1.20, .05, .05, .08, MET);                    // échappement supérieur soufflé
    bx(DT, x, .77, -1.20, .035, .035, .08, hex(0x111111));
  }
  for (const x of [-.85, .85]) {
    bx(DT, x * 1.02, .56, .20, .005, .06, .04, hex(0x101010));    // boîtier leader lights
    bx(DT, x * 1.025, .56, .20, .005, .04, .015, hex(0x22ff44));  // LED verte de position
  }
  bx(DT, -.30, .24, 2.36, .02, .02, .03, hex(0xee2211));          // anneau remorquage avant
  bx(DT, .30, .32, -2.40, .02, .02, .03, hex(0xee2211));          // anneau remorquage arrière
  bx(TL, 0, .50, -2.34, .45, .018, .01, BODY(1));                 // feux arrière horizontaux
  bx(TL, 0, .32, -2.38, .06, .05, .012, hex(0xff1111));           // feu pluie FIA central
  bx(B, 0, .28, -2.33, .58, .06, .10, hex(0x111419));             // diffuseur arrière
  for (const x of [-.36, -.18, 0, .18, .36]) bx(B, x, .30, -2.35, .01, .075, .09, DARK); // ailettes diffuseur
  return pack(B, W, F, ML, MR, TL, DT);
}
// --- Rallye
const RS = [[-2.2, .85, .35, .78, .82], [-1.9, .92, .3, .95, .88], [-1, .93, .3, 1.0, .9], [1.0, .93, .3, .96, .9], [1.7, .88, .32, .78, .84], [2.2, .8, .35, .6, .74]];
const RC = [[-1.4, .84, .95, 1.28, .74], [-1.0, .84, .95, 1.5, .7], [.2, .84, .95, 1.5, .7], [.9, .84, .9, 1.1, .8]];
function buildRally() {
  const [B, W, F, ML, MR, TL, DT] = bs();
  loft(B, RS, [0, .6, 0], BODY(1), BODY(1.06), DARK, BODY(.8));
  loft(B, RC, [0, 1.2, -.2], GLASS, (i) => (i === 1 ? BODY(.95) : GLASS));
  arches(B, 'rally');

  // --- Protection sous-moteur (Skid plate) & bouclier avant (F, DT)
  bx(F, 0, .20, 2.18, .55, .016, .15, MET);                       // plaque de protection alu biseautée
  bx(F, 0, .30, 2.15, .72, .05, .12, DARK);                       // bouclier avant renforcé
  bx(DT, -.40, .24, 2.26, .025, .025, .03, hex(0xee1111));        // crochet de remorquage rouge
  bx(B, 0, .55, 2.20, .32, .04, .02, hex(0x20242a));             // calandre avant
  for (const x of [-.58, .58]) {
    bx(B, x, .50, 2.22, .15, .065, .02, LAMP);                    // phares principaux
    bx(B, x, .50, 2.20, .18, .08, .025, GLS);                     // optique
  }

  // --- Rampe de 4 phares de nuit sur capot (Night Pod WRC) (B, DT)
  bx(B, 0, .82, 1.70, .46, .055, .12, DARK);                      // coque profilée carbone du pod
  for (const x of [-.34, -.11, .11, .34]) {
    bx(B, x, .82, 1.76, .08, .05, .01, LAMP);                     // 4 projecteurs longue portée
    bx(DT, x, .82, 1.73, .09, .06, .03, hex(0x282c34));           // cerclages métalliques
  }
  bx(B, 0, .78, 1.30, .24, .02, .16, hex(0x15181c));              // ouïe d'échangeur capot

  // --- Prise d'air toit WRC, Snorkel & Arceau-cage (B, DT)
  bx(B, 0, 1.54, -.15, .20, .05, .25, DARK);                      // roof air scoop (écope de toit)
  for (const x of [-.07, .07]) bx(B, x, 1.54, -.02, .05, .03, .01, hex(0x0e1014)); // entrées d'air cockpit
  bx(B, .74, 1.05, .95, .035, .32, .035, DARK);                   // tube vertical snorkel
  bx(B, .74, 1.38, 1.00, .045, .045, .06, DARK);                  // tête de snorkel d'admission
  bx(B, 0, 1.42, -.10, .70, .018, .018, WHT);                     // arceau principal cage
  for (const x of [-.55, .55]) bx(B, x, 1.25, -.70, .018, .20, .48, WHT); // montants arrière cage blanche

  // --- Bavettes garde-boue rouges (Mudflaps) & bas de caisse (B)
  for (const x of [-.93, .93]) {
    bx(B, x * .98, .34, 0, .03, .05, 1.25, DARK);                  // bas de caisse renforcé
    bx(B, x * .98, .18, 1.05, .02, .14, .08, hex(0xdd1111));      // bavette garde-boue avant rouge
    bx(B, x * .98, .18, -1.80, .02, .16, .08, hex(0xdd1111));     // bavette garde-boue arrière rouge
  }

  // --- Aileron WRC biplan spectaculaire (W, DT)
  bx(W, 0, 1.32, -2.15, .82, .02, .22, DARK);                      // aile inférieure
  bx(W, 0, 1.48, -2.25, .86, .025, .20, BODY(.85));               // aile supérieure profilée
  for (const x of [-.86, .86]) bx(W, x, 1.38, -2.20, .015, .22, .28, BODY(.8)); // grandes dérives extérieures
  for (const x of [-.40, .40]) bx(W, x, 1.34, -2.18, .02, .18, .12, DARK);      // piliers intérieurs
  for (const x of [-.98, .98]) bx(x < 0 ? ML : MR, x, 1.15, .75, .07, .05, .09, BODY(.9)); // rétroviseurs
  for (const x of [-.95, .95]) bx(B, x, 1.12, 0, .03, .035, .30, GLASS);         // custode

  // --- Poupe, Feux, Pare-chaleur & Échappement WRC ALS (TL, B, DT)
  for (const x of [-.72, .72]) bx(TL, x, 1.05, -2.19, .08, .16, .01, BODY(1));  // feux arrière verticaux
  bx(TL, 0, 1.30, -2.19, .25, .025, .01, BODY(1));                // 3ème feu stop central haut
  bx(DT, .52, .32, -2.27, .12, .08, .015, MET);                    // pare-chaleur thermique alu
  bx(DT, .52, .32, -2.33, .055, .055, .07, MET);                   // canule inox échappement rallye
  bx(DT, .52, .32, -2.38, .038, .038, .01, hex(0x111111));        // intérieur échappement
  bx(B, 0, .28, -2.24, .48, .05, .08, hex(0x181a20));             // diffuseur blindé arrière
  return pack(B, W, F, ML, MR, TL, DT);
}
// --- Monoplace (roues non carenees : les bras avant sont dynamiques, voir one())
const OS = [[-2.2, .2, .3, .5, .18], [-1.4, .32, .2, .62, .26], [-.4, .36, .2, .58, .3], [.7, .3, .2, .46, .22], [1.7, .14, .22, .34, .1], [2.35, .08, .24, .3, .06]];

function buildHalo(B, col) {
  const pillar = [[0, .62, .12], [0, .70, .08], [0, .78, .04], [0, .86, -.04], [0, .92, -.16], [0, .96, -.32]];
  tube(B, pillar, .025, .018, col);
  for (const sg of [-1, 1]) {
    const arm = [
      [0, .96, -.32],
      [sg * .10, .97, -.18],
      [sg * .20, .97, .02],
      [sg * .26, .95, .22],
      [sg * .28, .92, .40],
      [sg * .26, .88, .58],
      [sg * .20, .82, .72],
      [sg * .10, .76, .84],
      [0, .72, .90],
    ];
    tube(B, arm, .025, .018, col);
    const foot = [[sg * .10, .76, .84], [sg * .14, .65, .88], [sg * .16, .55, .90]];
    tube(B, foot, .022, .016, col);
  }
  tube(B, [[-0.04, .72, .90], [0, .72, .91], [0.04, .72, .90]], .018, .014, col);
  for (const sg of [-1, 1]) {
    tube(B, [[0, .96, -.32], [sg * .16, .72, -.32]], .014, .012, col);
    tube(B, [[sg * .26, .88, .58], [sg * .28, .64, .62]], .014, .012, col);
  }
}

function buildOpen() {
  const [B, W, F, ML, MR, TL, DT] = bs(), D = DARK;
  loft(B, OS, [0, .4, 0], BODY(1), BODY(1.06), D, BODY(.85));
  // --- Suspension arriere
  for (const x of [-1, 1]) for (const dz of [-.16, .16]) bx(B, x * .64, .32 + dz * .2, -1.3 + dz, .35, .015, .02, D);
  // --- Pontons & bargeboards (plus detailles)
  for (const x of [-.58, .58]) {
    bx(B, x, .38, -.1, .26, .2, .95, BODY(1));
    bx(B, x, .42, .9, .2, .12, .02, GLS);
    bx(B, x * .9, .3, .82, .01, .13, .28, BODY(.8));
    bx(B, x * .88, .28, .60, .01, .08, .18, BODY(.75));
    bx(B, x * .86, .24, .72, .01, .05, .22, BODY(.7));
    bx(DT, x * .97, .22, .40, .01, .04, .32, D);
  }
  // --- Sidepods (entrees d'air)
  for (const x of [-.58, .58]) {
    bx(B, x, .50, -.05, .05, .15, .08, D);
    bx(B, x, .32, -.05, .05, .08, .08, D);
  }
  // --- Moteur / boite
  bx(B, 0, .62, -1.8, .02, .18, .5, BODY(.9));
  bx(DT, 0, .58, -1.6, .10, .10, .05, MET);
  bx(DT, 0, .62, -1.5, .07, .07, .03, hex(0x2a2d33));
  // --- Aileron arriere
  bx(W, 0, 1.0, -2.15, .55, .02, .2, D);
  bx(W, 0, 1.09, -2.15, .55, .015, .12, BODY(.9));
  bx(W, 0, .7, -2.1, .02, .3, .03, D);
  for (const x of [-.56, .56]) {
    bx(W, x, .96, -2.15, .01, .15, .25, BODY(.85));
    bx(W, x, .82, -2.15, .01, .24, .15, BODY(.8));
  }
  bx(DT, 0, 1.12, -2.1, .38, .008, .08, BODY(1.1));
  // --- Cockpit : casque + visor
  bx(B, 0, .8, -.9, .14, .2, .55, BODY(1.05));
  bx(B, 0, .85, -.34, .1, .12, .02, GLS);
  bx(B, 0, .63, .2, .2, .015, .4, GLS);
  bx(B, 0, .74, .15, .1, .1, .13, WHT);
  bx(B, 0, .76, .28, .08, .03, .01, hex(0x1a90ff));
  bx(DT, 0, .77, .10, .11, .08, .02, hex(0xd0d8e0));
  // --- Halo F1 realiste
  buildHalo(B, hex(0x1a1c20));
  // --- Aileron avant
  bx(F, 0, .18, 2.2, 1.0, .015, .2, D);
  bx(F, 0, .24, 2.12, .92, .010, .14, BODY(.8));
  bx(F, 0, .29, 2.04, .82, .008, .10, BODY(.85));
  bx(F, 0, .22, 2.28, .8, .01, .06, BODY(.9));
  for (const x of [-1, 1]) {
    bx(F, x, .24, 2.2, .01, .1, .25, BODY(.85));
    bx(F, x, .22, 2.0, .01, .07, .18, BODY(.8));
    bx(x < 0 ? ML : MR, x * .62, .68, .5, .06, .03, .05, BODY(.9));
    bx(DT, x * .62, .72, .5, .05, .015, .03, D);
  }
  // --- Feux + ERS
  bx(TL, 0, .45, -2.21, .14, .03, .01, BODY(1));
  bx(B, 0, .3, -2.3, .3, .05, .06, hex(0x111419));
  bx(DT, 0, .52, -2.3, .05, .05, .07, MET);
  for (const x of [-.12, .12]) bx(DT, x, .32, -2.33, .02, .03, .02, hex(0x0044cc));
  return pack(B, W, F, ML, MR, TL, DT);
}
// --- Dragster (Top Fuel : longue flèche effilée, compresseur, zoomies, aileron arrière géant, wheelie bar)
const DRAG_S = [[-2.2, .48, .22, .56, .38], [-1.4, .45, .20, .68, .36], [-.7, .42, .20, .58, .34], [.2, .32, .18, .44, .24], [1.4, .24, .18, .38, .18], [2.5, .18, .16, .32, .14], [3.0, .14, .16, .28, .10]];
const DRAG_C = [[-1.6, .36, .60, .85, .26], [-1.3, .38, .62, 1.02, .22], [-1.0, .36, .60, .82, .24]];
function buildDrag() {
  const [B, W, F, ML, MR, TL, DT] = bs(), D = DARK;
  loft(B, DRAG_S, [0, .4, 0], BODY(1), BODY(1.08), D, BODY(.85));
  loft(B, DRAG_C, [0, .8, -1.3], GLASS, (i) => (i === 1 ? BODY(.95) : GLASS));

  // --- Essieux et châssis tubulaire apparent
  bx(B, 0, .22, 2.70, .38, .02, .02, MET);                        // essieu avant
  bx(B, 0, .50, -1.50, .90, .04, .04, MET);                       // essieu arrière
  for (const x of [-.18, .18]) bx(B, x, .30, .80, .015, .015, 1.60, MET); // longerons chromoly
  for (let i = 0; i < 4; i++) bx(DT, 0, .28 + (i % 2) * .04, .20 + i * .45, .16, .012, .012, MET); // treillis diagonal

  // --- Arceau-cage pilote & cockpit (B, DT)
  bx(B, 0, .82, -1.25, .10, .10, .12, WHT);                       // casque pilote blanc
  bx(B, 0, .84, -1.15, .08, .03, .01, hex(0x2288ee));              // visière bleue iridium
  bx(B, 0, 1.08, -1.35, .24, .02, .02, D);                        // tube supérieur arceau
  for (const x of [-.22, .22]) {
    bx(B, x, .85, -1.25, .022, .22, .022, D);                     // montants arceau verticaux
    bx(B, x, .96, -1.48, .02, .02, .24, D);                       // jambes arceau arrière
  }
  bx(DT, 0, .72, -1.05, .08, .04, .015, MET);                      // volant papillon dragster

  // --- Moteur Supercharged V8 Hemi & Blower (B, DT)
  bx(B, 0, .54, -.50, .34, .22, .38, hex(0x3a4048));              // bloc V8 massif
  for (const x of [-.24, .24]) bx(B, x, .68, -.50, .10, .08, .34, MET); // culasses chromées
  bx(B, 0, .82, -.50, .20, .14, .30, MET);                        // boîtier supercharger 14-71
  bx(DT, 0, .75, -.18, .16, .18, .03, hex(0x1a1a1a));             // courroie crantée blower
  bx(DT, 0, .84, -.16, .08, .08, .04, MET);                       // poulie supérieure blower
  bx(DT, 0, .54, -.16, .09, .09, .04, MET);                       // poulie vilebrequin
  bx(B, 0, 1.02, -.45, .22, .09, .22, hex(0xdd1515));             // bugcatcher scoop rouge
  for (const x of [-.09, 0, .09]) {
    bx(B, x, 1.02, -.34, .035, .035, .01, hex(0x111111));         // 3 papillons d'injection
    bx(DT, x, 1.02, -.33, .025, .025, .01, hex(0xff2222));
  }

  // --- 8 Zoomies inclinés crachant le nitrométhane (DT)
  for (const x of [-1, 1]) for (let i = 0; i < 4; i++) {
    bx(DT, x * .46, .52 + i * .06, -.72 + i * .14, .04, .14, .04, MET); // tube zoomie
    bx(DT, x * .46, .64 + i * .06, -.72 + i * .14, .025, .03, .025, hex(0x111111)); // intérieur
  }

  // --- Wheelie bar allongée triangulée avec roulettes (B, DT)
  for (const x of [-.28, .28]) {
    bx(B, x, .22, -2.85, .02, .02, .65, MET);                     // barres basses
    bx(B, x, .42, -2.78, .02, .02, .58, MET);                     // barres hautes
    bx(B, x, .30, -3.20, .015, .12, .015, MET);                    // liaison verticale
    cyl(B, x, .12, -3.45, .11, .06);                              // roulettes métal
  }

  // --- Doubles parachutes de freinage (B, DT, TL)
  for (const x of [-.16, .16]) {
    bx(B, x, .65, -2.28, .12, .11, .12, hex(0x22262d));           // packs de parachutes noirs
    bx(B, x, .65, -2.36, .09, .08, .02, hex(0xee3322));           // sangles de sécurité rouges
    bx(DT, x, .65, -2.38, .02, .02, .02, MET);                    // goupilles
  }
  bx(TL, 0, .42, -2.40, .12, .03, .01, BODY(1));                  // feu stop

  // --- Aileron arrière géant Top Fuel (W)
  for (const x of [-.45, .45]) {
    bx(W, x, 1.30, -2.10, .025, .60, .08, D);                     // montants verticaux géants
    bx(W, x, 1.20, -1.75, .02, .48, .04, D);                      // jambes diagonales
  }
  bx(W, 0, 1.84, -2.15, 1.20, .035, .42, D);                       // plan principal XXL
  bx(W, 0, 1.92, -2.05, 1.15, .02, .28, BODY(.9));                // lame supérieure
  for (const x of [-1.20, 1.20]) bx(W, x, 1.80, -2.15, .02, .38, .58, BODY(.85)); // flasques latérales géantes
  bx(W, 0, 1.50, -2.15, .015, .34, .38, D);                       // flap stabilisateur central

  // --- Aileron avant & déflecteurs (F, ML, MR)
  bx(F, 0, .14, 3.00, .70, .02, .20, D);                          // aileron avant rasant
  for (const x of [-.70, .70]) bx(F, x, .18, 3.00, .015, .09, .24, BODY(.9)); // dérives avant
  for (const x of [-.56, .56]) bx(x < 0 ? ML : MR, x, .62, -1.0, .04, .08, .16, BODY(.9)); // carénages latéraux
  return pack(B, W, F, ML, MR, TL, DT);
}
// --- Supersonique ThrustSSC
const THRUST_S = [[-2.6, .35, .20, .65, .22], [-1.8, .40, .20, .70, .26], [-.8, .45, .20, .72, .28], [.4, .45, .20, .72, .28], [1.6, .38, .18, .62, .24], [2.6, .26, .16, .45, .16], [3.3, .12, .14, .30, .08], [3.6, .05, .16, .24, .04]];
const THRUST_C = [[-.4, .24, .64, .90, .18], [.2, .24, .65, .96, .16], [.8, .22, .64, .82, .14]];
function buildThrust() {
  const [B, W, F, ML, MR, TL, DT] = bs(), D = DARK;
  loft(B, THRUST_S, [0, .45, 0], BODY(1), BODY(1.06), D, BODY(.85));
  loft(B, THRUST_C, [0, .8, .2], GLASS, (i) => (i === 1 ? BODY(.95) : GLASS));

  // --- Double réacteurs Rolls-Royce Spey Turbofan (B, DT)
  for (const x of [-1.02, 1.02]) {
    bx(B, x, .46, -.20, .38, .36, 1.90, BODY(1.02));              // corps des turboréacteurs
    bx(B, x, .46, 1.70, .39, .37, .05, MET);                      // lèvre d'entrée d'air titane
    bx(B, x, .46, 1.76, .10, .10, .16, MET);                      // cône d'ogive central (shock cone)
    bx(B, x, .46, 1.92, .04, .04, .12, MET);                      // pointe du cône supersonique
    bx(B, x, .46, 1.55, .20, .20, .10, D);                        // entrée turbine noire

    // Tuyères de post-combustion arrière (Afterburners)
    bx(B, x, .46, -2.18, .36, .34, .14, hex(0x282c34));           // anneau extérieur tuyère
    bx(B, x, .46, -2.32, .32, .30, .05, hex(0x181a20));           // rétreint tuyère
    bx(B, x, .46, -2.35, .24, .22, .01, hex(0xff5511));           // flamme externe incandescente
    bx(B, x, .46, -2.36, .14, .12, .01, hex(0xffee88));           // cœur de flamme blanc/jaune

    // Jambages de train d'atterrissage carénés
    bx(B, x * .51, .56, .85, .025, .32, .12, D);
    bx(B, x * .51, .30, -1.85, .025, .10, .12, D);
  }

  // --- Dérive arrière verticale monumentale & Parachutes haute vitesse (W, B, TL, DT)
  bx(W, 0, 1.18, -2.10, .025, .52, .48, BODY(1));                 // voilure dérive verticale
  bx(W, 0, 1.28, -2.38, .02, .54, .24, D);                        // gouverne de direction
  bx(W, 0, 1.76, -2.00, .01, .01, .18, MET);                      // sonde de télémesure en tête
  bx(B, 0, .68, -2.65, .18, .10, .08, hex(0x1a1a20));             // caisson parachute haute vitesse
  bx(DT, 0, .74, -2.70, .04, .02, .04, hex(0xee2211));            // câbles de largage parachutes
  for (const x of [-.08, .08]) bx(TL, x, .68, -2.70, .05, .06, .02, BODY(1)); // feux de signalisation

  // --- Nez supersonique Mach 1 & Sonde Pitot (F, DT)
  bx(F, 0, .20, 3.85, .018, .018, .35, MET);                      // aiguille sonde Pitot
  bx(F, 0, .20, 4.22, .008, .008, .18, MET);                      // pointe ultra effilée
  for (const x of [-.24, .24]) bx(F, x, .22, 3.40, .15, .012, .18, BODY(.85)); // ailettes canard delta de nez

  // --- Cockpit verrière blindée & stabilisateurs (B, ML, MR, DT)
  bx(B, 0, .82, .20, .02, .03, .65, MET);                         // montant central verrière titane
  bx(DT, 0, .88, .50, .03, .04, .06, DARK);                       // périscope pilote
  for (const x of [-1.02, 1.02]) bx(x < 0 ? ML : MR, x * 1.38, .44, -.40, .08, .02, .50, BODY(1)); // carénages latéraux de roues
  return pack(B, W, F, ML, MR, TL, DT);
}
// --- Kart (≈ 2 m : châssis tubulaire, nez avant, pontons, baquet, volant, moteur arrière, pare-chocs, pilote casqué)
const KART_S = [[-.9, .3, .1, .2, .25], [.45, .34, .1, .33, .3], [.95, .28, .1, .33, .2]];
function buildKart() {
  const [B, W, F, ML, MR, TL, DT] = bs(), D = DARK, OV = hex(0x23262d);
  bx(B, 0, .09, 0, .3, .02, .78, D);                                   // plancher
  bx(B, 0, .22, .68, .34, .11, .28, BODY(1));                          // nez / carénage avant (plaque numéro dessus)
  bx(B, 0, .16, .42, .22, .04, .08, BODY(.8));
  for (const x of [-.43, .43]) bx(B, x, .2, -.05, .09, .1, .46, BODY(1));   // pontons
  bx(B, 0, .22, -.22, .22, .08, .22, OV);                              // baquet
  bx(B, 0, .4, -.42, .21, .17, .035, OV);                              // dossier
  bx(B, 0, .5, -.2, .17, .2, .09, hex(0x2d3340));                      // pilote (combinaison)
  bx(B, 0, .8, -.2, .11, .11, .11, WHT);                               // casque
  bx(B, 0, .8, -.09, .09, .04, .015, GLS);                             // visière
  for (const x of [-.14, .14]) bx(DT, x, .62, -.09, .03, .03, .1, hex(0x2d3340));   // bras
  bx(DT, 0, .36, .3, .012, .13, .012, D); bx(DT, 0, .49, .24, .1, .014, .05, D);    // colonne + volant
  bx(DT, .13, .24, -.62, .1, .11, .1, MET); bx(DT, .13, .12, -.66, .02, .02, .22, hex(0x6c7078));   // moteur + échappement
  bx(DT, -.12, .21, -.62, .06, .08, .06, hex(0x2a2d33));
  bx(F, 0, .17, .98, .46, .025, .02, D); bx(F, 0, .26, .96, .3, .03, .02, BODY(.9));   // pare-chocs avant (cassable)
  bx(W, 0, .2, -.9, .5, .03, .02, D); bx(W, 0, .3, -.82, .22, .05, .02, BODY(.9));      // pare-chocs arrière
  for (const x of [-.62, .62]) { bx(x < 0 ? ML : MR, x, .18, .05, .03, .04, .38, BODY(.9)); }   // barres latérales
  bx(TL, 0, .32, -.92, .09, .02, .01, BODY(1));
  return pack(B, W, F, ML, MR, TL, DT);
}
const KINDS = {
  gt: { build: buildGT, S: sub(BODY_S), y: 1.15, z: -.4, k: 1, st: [[.95, 1.4, 2.1, 2.25], [-2.25, -2, -1.25]], dn: .3, sb: [-1.8, 1.8] },
  wedge: { build: buildWedge, S: sub(WS), y: 1.0, z: 0, k: 1, st: [[1.25, 1.8, 2.25], [-2.2, -1.9, -1.4]], dn: .15, sb: [-1.5, 1.5] },
  proto: { build: buildProto, S: sub(PS), y: .98, z: -.05, k: 1, st: [[1.2, 1.8, 2.25], [-2.25, -1.6, -1.0]], dn: -.1, sb: [-1.6, 1.6] },
  rally: { build: buildRally, S: sub(RS), y: 1.5, z: -.4, k: 1, st: [[1.0, 1.5, 2.15], [-2.15, -1.6]], dn: .1, sb: [-1.8, 1.8] },
  open: { build: buildOpen, S: sub(OS), y: .405, z: 1.2, k: .5, st: [[1.75, 2.3], [-2.15, -1.5]] },
  drag: { build: buildDrag, S: sub(DRAG_S), y: .68, z: .5, k: .65, st: [[.4, 1.2, 2.0, 2.8], [-2.0, -1.4]] },
  kart: { build: buildKart, S: sub(KART_S), y: .335, z: .72, k: .32, st: [[.45, .95]] },
  thrust: { build: buildThrust, S: sub(THRUST_S), y: .80, z: .2, k: .7, st: [[.8, 1.6, 2.6], [-2.2, -1.4]] },
};

const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
/** Chiffres 7 segments centrés en (0,0) : put(u0, v0, u1, v1) par segment. */
function glyph(str, W, H, t, gap, put) {
  const tw = str.length * W + (str.length - 1) * gap;
  [...str].forEach((ch, i) => { const ox = -tw / 2 + i * (W + gap), R = { a: [0, H - t, W, H], b: [W - t, H / 2, W, H], c: [W - t, 0, W, H / 2], d: [0, 0, W, t], e: [0, 0, t, H / 2], f: [0, H / 2, t, H], g: [0, H / 2 - t / 2, W, H / 2 + t / 2] }; for (const s of SEG[ch] || '') { const r = R[s]; put(ox + r[0], r[1] - H / 2, ox + r[2], r[3] - H / 2); } });
}
/** Livrée par voiture : numéro de toit + de portières, puis style lv (0 unie, 1 bande centrale, 2 double bande, 3 bande centrale + liseré de flanc, 4 aplat capot/coffre) en couleur secondaire. */
function buildDecals(n, stripe, kind, lv) {
  const K = KINDS[kind] || KINDS.gt, B = builder(), up = [0, 1, 0], k = K.k, S = K.S, W = .24 * k, Hh = .46 * k, y = K.y, zc = K.z, str = String(n), gap = .06 * k, tw = str.length * W + (str.length - 1) * gap;
  const rect = (x0, z0, x1, z1, yy, col) => B.quad([x0, yy, z0], [x1, yy, z0], [x1, yy, z1], [x0, yy, z1], col, up);
  rect(-tw / 2 - .05, zc - Hh / 2 - .05, tw / 2 + .05, zc + Hh / 2 + .05, y + .008, hex(0x111111));
  glyph(str, W, Hh, .05 * k, gap, (u0, v0, u1, v1) => rect(u0, zc + v0, u1, zc + v1, y + .016, hex(0xf5f5f5)));
  const rib = (x, hw, a, b) => {
    const zs = [a, ...S.map((s) => s[0]).filter((z) => z > a && z < b), b];
    for (let i = 0; i < zs.length - 1; i++) { const p = at(S, zs[i]), q = at(S, zs[i + 1]), w0 = hw < 0 ? p[4] * .96 : hw, w1 = hw < 0 ? q[4] * .96 : hw, y0 = p[3] + .012, y1 = q[3] + .012; B.quad([x - w0, y0, zs[i]], [x + w0, y0, zs[i]], [x + w1, y1, zs[i + 1]], [x - w1, y1, zs[i + 1]], stripe, up); }
  };
  const L = [[], [[0, .1]], [[-.17, .05], [.17, .05]], [[0, .16]], [[0, -1]]][lv] || [];
  for (const zs of K.st) for (let i = 0; i < zs.length - 1; i++) for (const [x, hw] of L) rib(x, hw, zs[i], zs[i + 1]);
  const P = (sg, z, yy, o) => [sg * (sideX(S, z, yy) + o), yy, z];
  for (let sg = -1; sg <= 1; sg += 2) {
    if (lv === 3 && K.sb) for (let i = 0; i < 12; i++) {   // liseré le long du flanc
      const z0 = K.sb[0] + (K.sb[1] - K.sb[0]) * i / 12, z1 = K.sb[0] + (K.sb[1] - K.sb[0]) * (i + 1) / 12, m0 = ym(at(S, z0)), m1 = ym(at(S, z1));
      B.quad(P(sg, z0, m0 - .05, .014), P(sg, z1, m1 - .05, .014), P(sg, z1, m1 + .05, .014), P(sg, z0, m0 + .05, .014), stripe, [sg, 0, 0]);
    }
    if (K.dn !== undefined) {   // numéro de portière : plaque claire + chiffres sombres, lisible depuis l'extérieur
      const zm = K.dn, my = ym(at(S, zm)), a = str.length * .065 + .05, pt = (u, v, o) => P(sg, zm - sg * u, my + v, o);
      B.quad(pt(-a, -.17, .014), pt(a, -.17, .014), pt(a, .17, .014), pt(-a, .17, .014), hex(0xf2f2f2), [sg, 0, 0]);
      glyph(str, .1, .26, .032, .03, (u0, v0, u1, v1) => B.quad(pt(u0, v0, .02), pt(u1, v0, .02), pt(u1, v1, .02), pt(u0, v1, .02), hex(0x0d0d0d), [sg, 0, 0]));
    }
  }
  return B.done();
}
const hsl = (h, s, l) => { const f = (n) => { const k = (n + h / 30) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };

const hu = (n) => { const h = (n * 137.5) % 360; return h > 5 && h < 50 ? h + 50 : h; };
/** Matrice modèle : origine au sol au centre, avant = +z local. sc = échelle (largeur, hauteur, longueur) optionnelle. */
export function carMatrix(m, x, y, z, psi, pitch, roll, sc) {
  const cp = Math.cos(pitch), f = [Math.cos(psi) * cp, Math.sin(pitch), Math.sin(psi) * cp], l = Math.hypot(f[0], f[2]) || 1, r = [-f[2] / l, 0, f[0] / l];
  let u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const c = Math.cos(roll), s = Math.sin(roll), r2 = r.map((v, i) => v * c + u[i] * s); u = u.map((v, i) => v * c - r[i] * s);
  const k = sc || [1, 1, 1];
  m.set([r2[0] * k[0], r2[1] * k[0], r2[2] * k[0], 0, u[0] * k[1], u[1] * k[1], u[2] * k[1], 0, f[0] * k[2], f[1] * k[2], f[2] * k[2], 0, x, y, z, 1]); return m;
}

/** Case de grille k (0 = pole) : 2 colonnes, 8 m entre rangées, derrière la ligne de départ. */
export function gridSlot(k) { const kt = TRACK.half < 5; return { k, s: TRACK.startIdx * TRACK.ds - 8 - (k >> 1) * (kt ? 5 : 8) - (k & 1) * (kt ? 2.5 : 4), lat: (k & 1 ? 1 : -1) * (kt ? 1.15 : 2.6) }; }   // piste étroite (karting) : grille centrée et resserrée

const MESHES = {};
/** Meshes d'une carrosserie : main + pièces cassables (aileron AR, aile AV, rétros G/D) + tl (feux AR) + det (détails LOD). */
export const partsOf = (R, kd) => MESHES[kd] || (MESHES[kd] = (() => { const o = (KINDS[kd] || KINDS.gt).build(), m = {}; for (const k in o) m[k] = R.mesh(o[k]); return m; })());
const M = new Float32Array(16), WM = new Float32Array(16), T = { x: 0, y: 0, z: 0, psi: 0, pitch: 0, roll: 0 }, ARM = new Float32Array([.5, .08, -.5, -.08]);
let LT = 0;

/** Crée le joueur (n°1, livrée = couleur de sa fiche S) et `ai` voitures (n° 2…) sur la grille. Visuels seulement ; c.sc des IA est posé par game.js. */
export function createCars(R, ai, S, startPosition = 0, gridOrder = null) {
  const total = ai + 1, pk = startPosition > 0 ? Math.max(0, Math.min(total - 1, startPosition - 1)) : playerIndex(total);
  const validOrder = gridOrder && gridOrder.length === total && new Set(gridOrder).size === total && gridOrder.includes(1) && gridOrder.every((n) => n >= 1 && n <= total);
  const order = validOrder ? gridOrder : Array.from({ length: total }, (_, k) => k === pk ? 1 : 0);
  if (!validOrder) { let n = 2; for (let k = 0; k < total; k++) if (!order[k]) order[k] = n++; }
  const slotByN = new Map(order.map((n, k) => [n, gridSlot(k)])), playerGrid = order.indexOf(1), lk = look(S);
  const mk = (n, body, stripe, slot, kind, lv) => ({ n, body, stripe, kind, lv, mesh: null, mk: null, slot, sc: null, x: 0, y: 0, z: 0, psi: 0, pitch: 0, roll: 0, vs: 0, wd: 0, lx: 0, lz: 0, lp: 0, lu: 0, bl: 0 });
  const player = mk(1, lk.color, lk.accent, slotByN.get(1) || gridSlot(playerGrid), lk.kind, lk.liv), cars = [];
  player.sc = lk.sc;
  for (let n = 2; n <= total; n++) cars.push(mk(n, hsl(hu(n), .7, .5), hsl((hu(n) + 180) % 360, .2, .95), slotByN.get(n) || gridSlot(n - 1)));
  return { player, cars, playerSlot: player.slot };
}
/** ph = état physique (c.ph ; le joueur porte u, sa, bk posés par game.js). Braquage : ph.sa (angle réel de la physique) sinon dérivé du lacet (voitures distantes, aucun paquet réseau en plus) ; feux stop : ph.bk sinon décélération. */
function one(R, c, q, cam, ph, dt) {
  const dx = q.x - cam.pos[0], dz = q.z - cam.pos[2], d2 = dx * dx + dz * dz; if (d2 > 640000 || dx * cam.f[0] + dz * cam.f[2] < -10) { c.lp = 0; return; }
  const kd = c.kind || (c.sheet ? look(c.sheet).kind : 'gt'), sh = ph.sheet || c.sheet || DEFS, lv = Math.max(0, Math.min(4, c.lv ?? (c.sheet && Number.isInteger(c.sheet.liv) ? c.sheet.liv : c.n % 5))), key = kd + lv;
  if (c.mk !== key) { c.mk = key; c.mesh = R.mesh(buildDecals(c.n, c.stripe, kd, lv)); }
  const P = partsOf(R, kd), K = WH[kd] || WH.gt, H = wheelsOf(R), u = ph.u || 0;
  // braquage visuel lissé + distance parcourue (roulage) + feux stop
  let tg = typeof ph.sa === 'number' ? ph.sa : Math.atan(((sh.a || 1.25) + (sh.b || 1.45)) * (ph.r || 0) / (u < 0 ? Math.min(u, -2.5) : Math.max(u, 2.5))); const lim = (sh.steerMax || .5) * 1.15;
  tg = Math.max(-lim, Math.min(lim, tg)); c.vs += (tg - c.vs) * Math.min(1, dt * 22);
  const fw = (q.x - c.lx) * Math.cos(q.psi) + (q.z - c.lz) * Math.sin(q.psi); if (c.lp && Math.abs(fw) < 20) c.wd += fw; c.lx = q.x; c.lz = q.z; c.lp = 1;
  let bk; if (typeof ph.bk === 'number') bk = ph.bk > .12; else { if (dt > .002) c.bl += (((c.lu - u) / dt > 5 ? 1 : 0) - c.bl) * Math.min(1, dt * 6); c.lu = u; bk = c.bl > .5; }
  const isWet = (ph.wet || c.wet || R.weather?.wet || 0) > 0.05;
  const phase = (c.n || 0) * 0.17;
  const rainFlash = ((performance.now() * 0.001 * 3.6 + phase) % 1) < 0.52;
  const tlCol = bk ? TLB : (isWet && rainFlash ? TLB : TLD);
  carMatrix(M, q.x, q.y, q.z, q.psi, q.pitch, q.roll, c.sc); R.draw(P.main, M, c.body); R.draw(c.mesh, M); R.draw(P.tl, M, tlCol);
  if (!c.wr) R.draw(P.wing, M, c.body); if (!c.wf) R.draw(P.front, M, c.body);   // flags posés par drawWear (joueur)
  const near = d2 < 4900;   // LOD : au-delà de 70 m, plus de rétros, étriers, bras ni détails
  if (near) { if (!c.xl) R.draw(P.ml, M, c.body); if (!c.xr) R.draw(P.mr, M, c.body); R.draw(P.det, M); }
  const rf = K.f[2], rr = K.r[2], af = c.wd / rf, ar = c.wd / rr, cs = Math.cos(c.vs), sn = Math.sin(c.vs), cf = Math.cos(af), sf = Math.sin(af), cr = Math.cos(ar), sr = Math.sin(ar), wmesh = H.w[K.s];
  for (let sg = -1; sg <= 1; sg += 2) {
    R.draw(wmesh, wm(WM, M, sg * K.f[0], rf, K.f[1], cs, sn, cf, sf, sg * K.f[3], rf), K.rc);   // avant : braquage puis roulage
    R.draw(wmesh, wm(WM, M, sg * K.r[0], rr, K.r[1], 1, 0, cr, sr, sg * K.r[3], rr), K.rc);      // arrière : pas de braquage
    if (!near) continue;
    R.draw(H.cal, wm(WM, M, sg * K.f[0], rf, K.f[1], cs, sn, 1, 0, sg * K.f[3], rf), K.cc);
    R.draw(H.cal, wm(WM, M, sg * K.r[0], rr, K.r[1], 1, 0, 1, 0, sg * K.r[3], rr), K.cc);
    if (K.a) for (let j = 0; j < 4; j += 2) { const d = ARM[j] * rf, e = ARM[j + 1] * rf; R.draw(H.arm, arm(WM, M, sg * .2, rf + e * 1.6 + .03, K.f[1] + d * .6, sg * (K.f[0] - K.f[3] * .5 + .02) + d * sn, rf + e, K.f[1] + d * cs, .022)); }   // bras avant : suivent la roue braquée
  }
}
export function drawCars(R, { player, cars }, alpha, cam, showPlayer = true) {
  const t = performance.now(), dt = LT ? Math.min(.1, (t - LT) / 1000) : .016; LT = t;
  for (const c of cars) { const q = c.ph, p = q.prev; if (q.gone) continue; T.x = p.x + (q.x - p.x) * alpha; T.y = p.y + (q.y - p.y) * alpha; T.z = p.z + (q.z - p.z) * alpha; T.psi = p.psi + wrap(q.psi - p.psi) * alpha; T.pitch = q.pitch; T.roll = q.roll; one(R, c, T, cam, q, dt); }
  if (showPlayer) one(R, player, player, cam, player, dt);
}