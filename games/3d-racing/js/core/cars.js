// Voiture GT low poly (un seul mesh partagé, couleur de carrosserie par uniforme, proportions par échelle de matrice), décalques procéduraux (numéro 7 segments, bande), grille et dessin. La physique/IA des voitures est dans physics.js / ai.js (c.ph ajouté par game.js).
import { builder, obox } from './track-mesh.js';
import { TRACK } from './track.js';
import { playerIndex } from './race.js';
import { look } from './sheets.js';

const hex = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const BODY = (k) => [-k, 0, 0];   // r < 0 : couleur de carrosserie × |r| (voir shader)
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const GLASS = hex(0x1b2530), DARK = hex(0x14161a);
export const CAR = { length: 4.6, width: 1.88, height: 1.15 };

function fq(B, a, b, c, d, col, ctr) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
  if (n[0] * ((a[0] + c[0]) / 2 - ctr[0]) + n[1] * ((a[1] + c[1]) / 2 - ctr[1]) + n[2] * ((a[2] + c[2]) / 2 - ctr[2]) < 0) n = n.map((x) => -x);
  B.quad(a, b, c, d, col, n);
}
// sections [z, demi-largeur bas, y bas, y haut, demi-largeur haut]
function loft(B, S, ctr, side, top, bot = DARK) {
  const C = (s) => [[-s[1], s[2], s[0]], [s[1], s[2], s[0]], [s[4], s[3], s[0]], [-s[4], s[3], s[0]]];
  for (let i = 0; i < S.length - 1; i++) {
    const a = C(S[i]), b = C(S[i + 1]), t = typeof top === 'function' ? top(i) : top;
    fq(B, a[0], a[1], b[1], b[0], bot, ctr); fq(B, a[1], a[2], b[2], b[1], side, ctr); fq(B, a[2], a[3], b[3], b[2], t, ctr); fq(B, a[3], a[0], b[0], b[3], side, ctr);
  }
  for (const s of [S[0], S[S.length - 1]]) { const c = C(s); fq(B, c[0], c[1], c[2], c[3], side, ctr); }
}
function cyl(B, cx, cy, cz, r, w, rim) {
  const n = 10, pt = (a, x, k = 1) => [x, cy + r * k * Math.sin(a), cz + r * k * Math.cos(a)];
  for (let k = 0; k < n; k++) {
    const a0 = 2 * Math.PI * k / n, a1 = 2 * Math.PI * (k + 1) / n, am = (a0 + a1) / 2;
    B.quad(pt(a0, cx - w / 2), pt(a0, cx + w / 2), pt(a1, cx + w / 2), pt(a1, cx - w / 2), hex(0x1a1a1d), [0, Math.sin(am), Math.cos(am)]);
    for (const s of [-1, 1]) {
      const x = cx + s * w / 2;
      B.quad([x, cy, cz], pt(a0, x), pt(a1, x), pt(a1, x), hex(0x232327), [s, 0, 0]);
      if (k % 1 === 0) B.quad([x + s * .004, cy, cz], pt(a0, x + s * .004, .62), pt(a1, x + s * .004, .62), pt(a1, x + s * .004, .62), rim, [s, 0, 0]);
    }
  }
}
const BODY_S = [[-2.3, .7, .3, .6, .6], [-2, .82, .24, .72, .74], [-1, .84, .22, .76, .78], [.4, .84, .22, .75, .78], [1.4, .8, .22, .6, .7], [2.1, .72, .24, .46, .62], [2.3, .6, .3, .4, .5]];
const CAB_S = [[-1.2, .78, .72, .95, .58], [-.8, .8, .74, 1.15, .55], [0, .8, .75, 1.15, .55], [.9, .8, .68, .7, .74]];

const wheels = (B, xf, zf, xr, zr, rf, wf, rr, wr, rim) => { for (const x of [-xf, xf]) cyl(B, x, rf, zf, rf, wf, rim); for (const x of [-xr, xr]) cyl(B, x, rr, zr, rr, wr, rim); };
const MET = hex(0x9aa0a8), LAMP = hex(0xfff0c0), RED = hex(0xd01010), GLS = hex(0x0b0d10), WHT = hex(0xe8e8e8);
const bx = (B, x, y, z, hw, hh, hl, c) => obox(B, x, y, z, 0, 1, hw, hh, hl, c);
const pack = (B, W, F, ML, MR) => ({ main: B.done(), wing: W.done(), front: F.done(), ml: ML.done(), mr: MR.done() });   // ailes / mirroirs séparés : cassables (damage.js)

// --- GT (détaillée)
function buildGT() {
  const B = builder(), W = builder(), F = builder(), ML = builder(), MR = builder();
  loft(B, BODY_S, [0, .5, 0], BODY(1), BODY(1.08));
  loft(B, CAB_S, [0, .95, -.2], GLASS, (i) => (i === 1 ? BODY(.95) : GLASS));
  wheels(B, .79, 1.38, .79, -1.32, .34, .3, .34, .3, hex(0xb9bec6));
  bx(W, 0, .98, -2.2, .88, .025, .2, DARK);
  for (const x of [-.45, .45]) bx(W, x, .8, -2.2, .03, .17, .05, DARK);
  for (const x of [-.88, .88]) bx(W, x, 1.02, -2.2, .015, .12, .22, BODY(.8));
  bx(B, 0, .55, -2.31, .55, .035, .01, RED);
  for (const x of [-.4, .4]) { bx(B, x, .43, 2.29, .14, .035, .01, LAMP); bx(B, x, .43, 2.27, .17, .05, .02, GLS); }
  bx(F, 0, .25, 2.2, .66, .03, .12, DARK);
  bx(B, 0, .34, 2.315, .34, .11, .012, GLS);
  for (const x of [-.22, 0, .22]) bx(B, x, .36, 2.33, .012, .065, .014, hex(0x515963));
  bx(B, 0, .29, -2.33, .48, .06, .06, hex(0x111419));
  for (const x of [-.84, .84]) { bx(B, x, .43, .35, .018, .12, .68, GLASS); bx(B, x, .39, -1.34, .018, .08, .43, DARK); bx(x < 0 ? ML : MR, x * 1.07, .84, .72, .07, .045, .08, BODY(.9)); bx(B, x * .99, .27, 0, .02, .04, 1.25, DARK); bx(B, x * .5, .32, -2.34, .07, .06, .06, MET); }
  bx(B, 0, .77, .95, .045, .028, .82, hex(0xdce6ee));
  bx(B, 0, .79, 1.7, .5, .012, .02, hex(0x20262d));      // essuie-glace / jonc de capot
  for (const x of [-.3, .3]) bx(B, x, .74, 1.45, .13, .01, .22, hex(0x15181c));   // naseaux de capot
  return pack(B, W, F, ML, MR);
}
// --- Hypercar en coin
const WS = [[-2.25, .7, .28, .5, .6], [-1.7, .9, .22, .72, .82], [-.6, .92, .2, .64, .72], [.7, .88, .2, .56, .55], [1.7, .8, .2, .4, .4], [2.3, .55, .22, .28, .28]];
const WC = [[-1.2, .78, .6, .82, .6], [-.5, .8, .6, 1.0, .48], [.5, .8, .58, 1.0, .48], [1.2, .8, .52, .62, .7]];
function buildWedge() {
  const B = builder(), W = builder(), F = builder(), ML = builder(), MR = builder();
  loft(B, WS, [0, .5, 0], BODY(1), BODY(1.08));
  loft(B, WC, [0, .8, 0], GLASS, (i) => (i === 1 ? BODY(.9) : GLASS));
  wheels(B, .84, 1.32, .86, -1.3, .34, .32, .36, .38, hex(0xc9ced6));
  bx(W, 0, .98, -2.15, .85, .018, .2, DARK); bx(W, 0, 1.03, -2.1, .8, .012, .12, BODY(.85));
  for (const x of [-.5, .5]) bx(W, x, .82, -2.1, .02, .18, .05, DARK);
  for (const x of [-.86, .86]) bx(W, x, .96, -2.15, .015, .1, .24, BODY(.8));
  bx(F, 0, .22, 2.28, .8, .025, .15, DARK); for (const x of [-.9, .9]) bx(x < 0 ? ML : MR, x, .8, .7, .07, .04, .08, BODY(.9));                        // splitter
  bx(B, 0, .24, -2.3, .6, .05, .14, DARK);                         // diffuseur
  for (const x of [-.25, .25]) bx(B, x, .28, -2.4, .09, .05, .06, MET);
  for (const x of [-.55, .55]) { bx(B, x, .38, 2.26, .24, .018, .02, LAMP); bx(B, x * 1.5 / 1.1, .52, -.7, .01, .1, .45, GLS); }   // phares, entrées d'air latérales
  bx(B, 0, .5, -2.29, .75, .02, .01, RED);
  bx(B, 0, 1.0, -.1, .02, .015, .9, DARK);                         // fine bande de toit
  for (const x of [-.4, .4]) bx(B, x, .62, 1.0, .14, .01, .3, hex(0x15181c));
  return pack(B, W, F, ML, MR);
}
// --- Prototype d'endurance
const PS = [[-2.3, .55, .28, .5, .5], [-1.8, .85, .22, .78, .7], [-.8, .9, .2, .66, .68], [.6, .88, .2, .55, .6], [1.6, .78, .2, .4, .45], [2.3, .5, .22, .28, .3]];
const PCB = [[-.9, .55, .6, .8, .45], [-.4, .6, .62, .98, .4], [.3, .6, .62, .98, .4], [1.1, .7, .55, .6, .62]];
function buildProto() {
  const B = builder(), W = builder(), F = builder(), ML = builder(), MR = builder();
  loft(B, PS, [0, .5, 0], BODY(1), BODY(1.06));
  loft(B, PCB, [0, .8, 0], GLASS, (i) => (i === 1 ? WHT : GLASS));
  wheels(B, .86, 1.35, .88, -1.4, .34, .32, .36, .4, hex(0xb9bec6));
  for (const x of [-.88, .88]) { bx(B, x, .6, 1.35, .22, .07, .55, BODY(1.05)); bx(B, x, .68, -1.4, .26, .09, .75, BODY(1.05)); }
  bx(B, 0, 1.0, -1.9, .025, .38, .65, BODY(.95));                    // dérive
  bx(W, 0, 1.2, -2.2, .85, .018, .2, DARK); bx(W, 0, 1.0, -2.2, .02, .17, .05, DARK);
  for (const x of [-.86, .86]) bx(W, x, 1.12, -2.2, .015, .13, .24, BODY(.8));
  bx(F, 0, .22, 2.28, .75, .02, .14, DARK); for (const x of [-.72, .72]) bx(x < 0 ? ML : MR, x, .8, .6, .06, .04, .08, BODY(.9));
  for (const x of [-.8, .8]) bx(B, x, .3, 2.0, .015, .09, .2, BODY(.8));
  for (const x of [-.45, .45]) { bx(B, x, .5, 2.27, .2, .02, .02, LAMP); bx(B, x * 1.3, .55, -2.29, .13, .02, .01, RED); }
  bx(B, 0, .5, -2.3, .5, .015, .01, RED);
  bx(B, 0, .96, -.1, .02, .02, .75, WHT);
  bx(B, 0, .27, -2.32, .5, .05, .06, hex(0x111419));
  return pack(B, W, F, ML, MR);
}
// --- Rallye
const RS = [[-2.2, .85, .35, .78, .82], [-1.9, .92, .3, .95, .88], [-1, .93, .3, 1.0, .9], [1.0, .93, .3, .96, .9], [1.7, .88, .32, .78, .84], [2.2, .8, .35, .6, .74]];
const RC = [[-1.4, .84, .95, 1.28, .74], [-1.0, .84, .95, 1.5, .7], [.2, .84, .95, 1.5, .7], [.9, .84, .9, 1.1, .8]];
function buildRally() {
  const B = builder(), W = builder(), F = builder(), ML = builder(), MR = builder();
  loft(B, RS, [0, .6, 0], BODY(1), BODY(1.06));
  loft(B, RC, [0, 1.2, -.2], GLASS, (i) => (i === 1 ? BODY(.95) : GLASS));
  wheels(B, .84, 1.4, .84, -1.35, .38, .32, .38, .32, hex(0xd2a24a));
  for (const x of [-.93, .93]) { bx(B, x, .62, 1.4, .03, .1, .5, DARK); bx(B, x, .62, -1.35, .03, .1, .5, DARK); bx(B, x * .98, .34, .0, .03, .05, 1.2, DARK); }   // passages de roue, bas de caisse
  bx(B, 0, 1.58, -.3, .22, .08, .35, DARK);                         // écope de toit
  for (const x of [-.45, -.15, .15, .45]) { bx(B, x, 1.56, .12, .09, .08, .08, LAMP); bx(B, x, 1.56, .04, .095, .085, .02, DARK); }
  bx(W, 0, 1.38, -2.2, .85, .03, .25, BODY(.8)); for (const x of [-.6, .6]) bx(W, x, 1.18, -2.1, .03, .22, .05, DARK);
  bx(F, 0, .3, 2.15, .7, .05, .12, DARK); for (const x of [-.98, .98]) bx(x < 0 ? ML : MR, x, 1.15, .75, .07, .05, .09, BODY(.9));                           // sabot
  for (const x of [-.3, .3]) { bx(B, x, .98, 1.3, .2, .015, .3, hex(0x15181c)); bx(B, x * 1.9, .5, 2.2, .14, .06, .02, LAMP); }
  bx(B, 0, .52, -2.19, .6, .06, .01, RED);
  bx(B, 0, .3, -2.25, .45, .06, .07, hex(0x111419)); bx(B, .5, .3, -2.25, .06, .06, .06, MET);
  for (const x of [-.95, .95]) bx(B, x, 1.12, .0, .03, .035, .3, GLASS);
  return pack(B, W, F, ML, MR);
}
// --- Monoplace
const OS = [[-2.2, .2, .3, .5, .18], [-1.4, .32, .2, .62, .26], [-.4, .36, .2, .58, .3], [.7, .3, .2, .46, .22], [1.7, .14, .22, .34, .1], [2.35, .08, .24, .3, .06]];
function buildOpen() {
  const B = builder(), W = builder(), F = builder(), ML = builder(), MR = builder(), D = DARK, ZN = [[1.5, .33, .36], [-1.3, .37, .46]];
  loft(B, OS, [0, .4, 0], BODY(1), BODY(1.06));
  for (const x of [-.98, .98]) { cyl(B, x, .33, 1.5, .33, .36, hex(0xb9bec6)); cyl(B, x, .37, -1.3, .37, .46, hex(0xb9bec6)); }
  for (const x of [-1, 1]) for (const [z, y] of [[1.5, .3], [-1.3, .32]]) for (const dz of [-.16, .16]) bx(B, x * .64, y + dz * .2, z + dz, .35, .015, .02, D);   // bras de suspension
  for (const x of [-.58, .58]) { bx(B, x, .38, -.1, .26, .2, .95, BODY(1)); bx(B, x, .42, .9, .2, .12, .02, GLS); }   // pontons
  bx(B, 0, .8, -.9, .14, .2, .55, BODY(1.05)); bx(B, 0, .85, -.34, .1, .12, .02, GLS);                   // prise d'air
  bx(B, 0, .62, -1.8, .02, .18, .5, BODY(.9));
  bx(B, 0, .63, .2, .2, .015, .4, GLS);                                                                       // baquet
  bx(B, 0, .74, .15, .1, .1, .13, WHT); bx(B, 0, .76, .28, .08, .03, .01, GLS);                               // casque, visière
  for (const x of [-.2, .2]) bx(B, x, .84, .1, .015, .015, .6, D); bx(B, 0, .78, .7, .015, .12, .015, D);    // halo
  bx(F, 0, .18, 2.2, 1.0, .015, .2, D); bx(F, 0, .27, 2.1, .9, .01, .12, BODY(.8));                          // aile avant
  for (const x of [-1, 1]) bx(F, x, .24, 2.2, .01, .1, .25, BODY(.85));
  bx(W, 0, 1.0, -2.15, .55, .02, .2, D); bx(W, 0, 1.09, -2.15, .55, .015, .12, BODY(.9)); bx(W, 0, .7, -2.1, .02, .3, .03, D);   // aile arrière
  for (const x of [-.56, .56]) bx(W, x, .96, -2.15, .01, .15, .25, BODY(.85));
  bx(B, 0, .45, -2.21, .14, .03, .01, RED); bx(B, 0, .3, -2.3, .3, .05, .06, hex(0x111419));
  return pack(B, W, F, ML, MR);
}
const KINDS = {
  gt: { build: buildGT, S: BODY_S, y: 1.15, z: -.4, k: 1, st: [[.95, 1.4, 2.1, 2.25], [-2.25, -2, -1.25]] },
  wedge: { build: buildWedge, S: WS, y: 1.0, z: 0, k: 1, st: [[1.25, 1.8, 2.25], [-2.2, -1.9, -1.4]] },
  proto: { build: buildProto, S: PS, y: .98, z: -.05, k: 1, st: [[1.2, 1.8, 2.25], [-2.25, -1.6, -1.0]] },
  rally: { build: buildRally, S: RS, y: 1.5, z: -.4, k: 1, st: [[1.0, 1.5, 2.15], [-2.15, -1.6]] },
  open: { build: buildOpen, S: OS, y: .405, z: 1.2, k: .5, st: [] },
};
const topY = (S, z) => { for (let i = 0; i < S.length - 1; i++) { const a = S[i], b = S[i + 1]; if (z <= b[0]) return a[3] + (b[3] - a[3]) * (z - a[0]) / (b[0] - a[0]); } return S[S.length - 1][3]; };

const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function buildDecals(n, stripe, kind) {
  const K = KINDS[kind] || KINDS.gt, B = builder(), up = [0, 1, 0], k = K.k, W = .24 * k, Hh = .46 * k, t = .05 * k, y = K.y, zc = K.z, gap = .06 * k;
  const rect = (x0, z0, x1, z1, yy, col) => B.quad([x0, yy, z0], [x1, yy, z0], [x1, yy, z1], [x0, yy, z1], col, up);
  const str = String(n), tw = str.length * W + (str.length - 1) * gap, x0 = -tw / 2;
  rect(-tw / 2 - .05, zc - Hh / 2 - .05, tw / 2 + .05, zc + Hh / 2 + .05, y + .008, hex(0x111111));
  [...str].forEach((ch, i) => {
    const ox = x0 + i * (W + gap), oz = zc - Hh / 2, R = { a: [0, Hh - t, W, Hh], b: [W - t, Hh / 2, W, Hh], c: [W - t, 0, W, Hh / 2], d: [0, 0, W, t], e: [0, 0, t, Hh / 2], f: [0, Hh / 2, t, Hh], g: [0, Hh / 2 - t / 2, W, Hh / 2 + t / 2] };
    for (const s of SEG[ch]) { const r = R[s]; rect(ox + r[0], oz + r[1], ox + r[2], oz + r[3], y + .016, hex(0xf5f5f5)); }
  });
  for (const zs of K.st) for (let i = 0; i < zs.length - 1; i++) {
    const a = zs[i], b = zs[i + 1], ya = topY(K.S, a) + .012, yb = topY(K.S, b) + .012;
    B.quad([-.1, ya, a], [.1, ya, a], [.1, yb, b], [-.1, yb, b], stripe, up);
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
export function gridSlot(k) { return { k, s: TRACK.startIdx * TRACK.ds - 8 - (k >> 1) * 8 - (k & 1) * 4, lat: k & 1 ? 2.6 : -2.6 }; }

const MESHES = {};
/** Meshes d'une carrosserie : main + pièces cassables (aileron AR, aile AV, rétros G/D). */
export const partsOf = (R, kd) => MESHES[kd] || (MESHES[kd] = (() => { const o = (KINDS[kd] || KINDS.gt).build(), m = {}; for (const k in o) m[k] = R.mesh(o[k]); return m; })());
const M = new Float32Array(16), T = { x: 0, y: 0, z: 0, psi: 0, pitch: 0, roll: 0 };

/** Crée le joueur (n°1, livrée = couleur de sa fiche S) et `ai` voitures (n° 2…) sur la grille. Visuels seulement ; c.sc des IA est posé par game.js. */
export function createCars(R, ai, S, startPosition = 0, gridOrder = null) {
  
  const total = ai + 1, pk = startPosition > 0 ? Math.max(0, Math.min(total - 1, startPosition - 1)) : playerIndex(total);
  const validOrder = gridOrder && gridOrder.length === total && new Set(gridOrder).size === total && gridOrder.includes(1) && gridOrder.every((n) => n >= 1 && n <= total);
  const order = validOrder ? gridOrder : Array.from({ length: total }, (_, k) => k === pk ? 1 : 0);
  if (!validOrder) { let n = 2; for (let k = 0; k < total; k++) if (!order[k]) order[k] = n++; }
  const slotByN = new Map(order.map((n, k) => [n, gridSlot(k)])), playerGrid = order.indexOf(1), lk = look(S);
  const mk = (n, body, stripe, slot, kind) => ({ n, body, stripe, kind, mesh: null, mk: null, slot, sc: null, x: 0, y: 0, z: 0, psi: 0, pitch: 0, roll: 0 });
  const player = mk(1, lk.color, lk.accent, slotByN.get(1) || gridSlot(playerGrid), lk.kind), cars = [];
  player.sc = lk.sc;
  for (let n = 2; n <= total; n++) cars.push(mk(n, hsl(hu(n), .7, .5), hsl((hu(n) + 180) % 360, .2, .95), slotByN.get(n) || gridSlot(n - 1)));
  return { player, cars, playerSlot: player.slot };
}
function one(R, c, q, cam) {
  const dx = q.x - cam.pos[0], dz = q.z - cam.pos[2]; if (dx * dx + dz * dz > 640000 || dx * cam.f[0] + dz * cam.f[2] < -10) return;
  const kd = c.kind || (c.sheet ? look(c.sheet).kind : 'gt');
  if (c.mk !== kd) { c.mk = kd; c.mesh = R.mesh(buildDecals(c.n, c.stripe, kd)); }
  const P = partsOf(R, kd); carMatrix(M, q.x, q.y, q.z, q.psi, q.pitch, q.roll, c.sc); R.draw(P.main, M, c.body); R.draw(c.mesh, M);
  if (!c.wr) R.draw(P.wing, M, c.body); if (!c.wf) R.draw(P.front, M, c.body); if (!c.xl) R.draw(P.ml, M, c.body); if (!c.xr) R.draw(P.mr, M, c.body);   // flags posés par drawWear (joueur)
}
export function drawCars(R, { player, cars }, alpha, cam, showPlayer = true) {
  for (const c of cars) { const q = c.ph, p = q.prev; if (q.gone) continue; T.x = p.x + (q.x - p.x) * alpha; T.y = p.y + (q.y - p.y) * alpha; T.z = p.z + (q.z - p.z) * alpha; T.psi = p.psi + wrap(q.psi - p.psi) * alpha; T.pitch = q.pitch; T.roll = q.roll; one(R, c, T, cam); }
  if (showPlayer) one(R, player, player, cam);
}