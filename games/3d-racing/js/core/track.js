// Circuits : définis à la main (Catmull-Rom fermée, repère x/z, y = altitude). Un seul est construit au chargement (config de session) ; trackOf(id) construit les autres à la demande (aperçus du menu).
import { sessionConfig, queryConfig, loadTracks } from './config.js';
import { NEW } from './circuits.js';

export const H = 6, KERB_W = 1.5, GRAVEL = 10, WALL = H + GRAVEL + .5, DS_TARGET = 4;
const SN = [
  [-500, 0], [-400, 0], [0, 0], [400, 0], [500, 0],
  [590, -10], [655, -60], [675, -140],
  [715, -215], [790, -250],
  [860, -290], [890, -370], [860, -450],
  [790, -500], [700, -520], [600, -510],
  [500, -470], [420, -500], [340, -470],
  [220, -440], [80, -470], [-60, -510],
  [-200, -550], [-320, -560], [-420, -530], [-500, -460],
  [-540, -380], [-520, -300], [-560, -220],
  [-620, -140], [-600, -60], [-540, -12]].map(([x, z]) => [x * .93, z * .93]);
const DEFS = {
  'serra-nova': { name: 'Serra Nova', start: 250, pts: SN, elev: [10, 10.5, 11, 10, 6, 2, 0, 3, 8, 14, 18, 15, 16, 19, 8, 3, 6, 12, 18, 20, 16, 13, 11.5, 10.5].map((v) => v * 1.4) },
  ...NEW,
};

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return .5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}
function build(D, id) {
  const PTS = D.pts, ELEV = D.elev, n = PTS.length, dense = [];
  for (let i = 0; i < n; i++) {
    const a = PTS[(i + n - 1) % n], b = PTS[i], c = PTS[(i + 1) % n], d = PTS[(i + 2) % n];
    for (let k = 0; k < 24; k++) dense.push([cr(a[0], b[0], c[0], d[0], k / 24), cr(a[1], b[1], c[1], d[1], k / 24)]);
  }
  const M = dense.length, cum = [0];
  for (let i = 0; i < M; i++) { const a = dense[i], b = dense[(i + 1) % M]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const length = cum[M], N = Math.round(length / DS_TARGET), ds = length / N;
  const P = new Float32Array(N * 3), T = new Float32Array(N * 2), K = new Float32Array(N), Y = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * ds; while (cum[j + 1] < s) j++;
    const u = (s - cum[j]) / (cum[j + 1] - cum[j]), a = dense[j], b = dense[(j + 1) % M];
    P[i * 3] = a[0] + (b[0] - a[0]) * u; P[i * 3 + 2] = a[1] + (b[1] - a[1]) * u;
    const e = ELEV.length, f = D.ec ? (j + u) / 24 : i / N * e, k = Math.floor(f);   // ec : altitude par point de contrôle (circuits perso)
    Y[i] = cr(ELEV[(k + e - 1) % e], ELEV[k % e], ELEV[(k + 1) % e], ELEV[(k + 2) % e], f - k);
    P[i * 3 + 1] = Y[i];
  }
  for (let i = 0; i < N; i++) {
    const a = (i + N - 1) % N, b = (i + 1) % N, dx = P[b * 3] - P[a * 3], dz = P[b * 3 + 2] - P[a * 3 + 2], l = Math.hypot(dx, dz);
    T[i * 2] = dx / l; T[i * 2 + 1] = dz / l;
  }
  for (let i = 0; i < N; i++) {
    const a = (i + N - 1) % N, b = (i + 1) % N;
    K[i] = (T[a * 2] * T[b * 2 + 1] - T[a * 2 + 1] * T[b * 2]) / (2 * ds); // >0 : virage à droite (right = (-tz, tx))
  }
  const ks = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let d = -3; d <= 3; d++) s += K[(i + d + N) % N]; ks[i] = s / 7; }
  const kerbL = new Float32Array(N), kerbR = new Float32Array(N), ideal = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let m = 0; for (let d = -4; d <= 4; d++) if (Math.abs(ks[(i + d + N) % N]) > .0055) m = ks[(i + d + N) % N];
    if (m > 0) kerbR[i] = KERB_W; else if (m < 0) kerbL[i] = KERB_W;
    let w = 0; for (let d = -10; d <= 10; d++) w += ks[(i + d + N) % N] * (1 - Math.abs(d) / 11);
    ideal[i] = Math.max(-4.5, Math.min(4.5, w * 90)); // décalage latéral de la ligne idéale (+ = droite)
  }
  return { id, name: D.name, theme: D.theme || 'temperate', N, ds, length, half: D.half || H, wall: WALL, gravel: GRAVEL, P, T, K: ks, kerbL, kerbR, ideal, startIdx: Math.round(D.start / ds) };
}
const CACHE = {}, custom = (id) => { const t = loadTracks().find((c) => c.id === id); return t && { name: t.name, start: t.start, pts: t.pts, elev: t.elev, theme: t.theme, ec: true }; };
export { build as buildTrack };
export const trackOf = (id) => { const D = DEFS[id] || custom(id); if (!D) id = 'serra-nova'; return CACHE[id] || (CACHE[id] = build(D || DEFS[id], id)); };
export const TRACK = trackOf((sessionConfig() || queryConfig()).circuit);
const { N, ds, P, T } = TRACK;

/** Repère interpolé à l'abscisse s (m) d'un circuit donné : x,y,z, tx,tz, rx,rz. */
export function frameIn(t, s, o = {}) {
  const { N, ds, P, T } = t;
  s = ((s % t.length) + t.length) % t.length;
  const f = s / ds, i = Math.floor(f) % N, j = (i + 1) % N, u = f - Math.floor(f);
  o.x = P[i * 3] + (P[j * 3] - P[i * 3]) * u; o.y = P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * u; o.z = P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * u;
  let tx = T[i * 2] + (T[j * 2] - T[i * 2]) * u, tz = T[i * 2 + 1] + (T[j * 2 + 1] - T[i * 2 + 1]) * u; const l = Math.hypot(tx, tz) || 1;
  o.tx = tx / l; o.tz = tz / l; o.rx = -o.tz; o.rz = o.tx; return o;
}
/** Idem sur le circuit de la page. */
export const frameAt = (s, o) => frameIn(TRACK, s, o);

const loc = { i: 0, s: 0, lat: 0, y: 0, tx: 1, tz: 0, cx: 0, cz: 0 };
/** Point le plus proche du tracé. hint = indice précédent (sinon recherche globale). Renvoie un objet partagé. */
export function locate(x, z, hint = -1) {
  let best = 1e18, bi = 0;
  const lo = hint < 0 ? 0 : hint - 40, hi = hint < 0 ? N - 1 : hint + 40;
  for (let k = lo; k <= hi; k++) {
    const i = (k + N) % N, dx = x - P[i * 3], dz = z - P[i * 3 + 2], d = dx * dx + dz * dz;
    if (d < best) { best = d; bi = i; }
  }
  const a = (bi + N - 1) % N, b = (bi + 1) % N;
  const proj = (i0, i1) => {
    const ax = P[i0 * 3], az = P[i0 * 3 + 2], ex = P[i1 * 3] - ax, ez = P[i1 * 3 + 2] - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    const cx = ax + ex * u, cz = az + ez * u; return { i0, i1, u, cx, cz, d: (x - cx) ** 2 + (z - cz) ** 2 };
  };
  const A = proj(a, bi), B = proj(bi, b), q = A.d < B.d ? A : B;
  const i0 = q.i0, i1 = q.i1, u = q.u;
  let tx = T[i0 * 2] + (T[i1 * 2] - T[i0 * 2]) * u, tz = T[i0 * 2 + 1] + (T[i1 * 2 + 1] - T[i0 * 2 + 1]) * u; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
  loc.i = i0; loc.s = (i0 + u) * ds; loc.cx = q.cx; loc.cz = q.cz; loc.tx = tx; loc.tz = tz;
  loc.lat = (x - q.cx) * -tz + (z - q.cz) * tx;
  loc.y = P[i0 * 3 + 1] + (P[i1 * 3 + 1] - P[i0 * 3 + 1]) * u;
  return loc;
}
/** Hauteur du sol (m) en (x,z) à proximité du tracé : altitude de l'axe, plat latéralement. */
export const groundAt = (x, z, hint = -1) => locate(x, z, hint).y;
/** Nature de la surface selon |lat| et le kerb local. */
export function surface(l) {
  const a = Math.abs(l.lat), k = (l.lat > 0 ? TRACK.kerbR : TRACK.kerbL)[l.i];
  const h = TRACK.half;
  if (l.lat * PIT.sg > 0 && a > h && a <= h + pitExt(l.s !== undefined ? l.s : l.i * ds)) return 0;   // voie des stands : asphalte 
  return a <= h ? 0 : a <= h + k ? 1 : a <= h + GRAVEL ? 2 : 3; // 0 asphalte, 1 kerb, 2 gravier, 3 herbe
}

// --- Stands : voie des stands le long de la ligne de départ, du côté libre (extérieur du circuit). Partagé par le rendu, la physique et la réparation.
// Repère : d = distance (m) à la ligne de départ, a = écart latéral (m) positif du côté des stands. Voie rapide a ∈ [h+3.5, h+10.5], voie des box jusqu'à h+16.5, garages derrière.
const wrapD = (d) => d - TRACK.length * Math.round(d / TRACK.length);
export const PIT = (() => {
  const { K } = TRACK, S0 = TRACK.startIdx * ds, h = TRACK.half;
  const run = (dir) => { let m = 0; while (m < 320) { const i = (((Math.round(S0 / ds) + dir * Math.round(m / ds)) % N) + N) % N; if (Math.abs(K[i]) > .003) break; m += ds; } return m; };
  const back = Math.max(80, Math.min(240, run(-1) - 20)), fwd = Math.max(80, Math.min(200, run(1) - 20)), T = Math.min(80, (back + fwd) / 5);
  const clear = (sg) => {   // distance mini entre la zone des stands et le reste du circuit
    let best = 1e9;
    for (let d = -back; d <= fwd; d += 20) {
      const f = frameAt(S0 + d), qx = f.x + f.rx * sg * (h + 30), qz = f.z + f.rz * sg * (h + 30);
      for (let j = 0; j < N; j++) { if (Math.abs(wrapD(j * ds - S0 - d)) < 350) continue; best = Math.min(best, Math.hypot(qx - P[j * 3], qz - P[j * 3 + 2])); }
    }
    return best;
  };
  return { sg: clear(1) >= clear(-1) ? 1 : -1, S0, back, fwd, T, FULL: 16.5, boxD: 20 };
})();
/** Largeur (m, depuis le bord de piste) de la zone goudronnée des stands à l'abscisse s : 0 hors zone, rampes d'entrée / sortie, puis plein. */
export function pitExt(s) {
  const d = wrapD(s - PIT.S0); if (d < -PIT.back || d > PIT.fwd) return 0;
  return PIT.FULL * Math.max(0, Math.min((d + PIT.back) / PIT.T, (PIT.fwd - d) / PIT.T, 1));
}
const PW = [TRACK.half + 2.5, TRACK.half + 3.5];
/** Muret entre la piste et la voie rapide (null aux rampes d'entrée / sortie). */
export const pitWall = (s) => pitExt(s) >= PIT.FULL - .01 ? PW : null;
/** Voiture dans le box du joueur (voie des box, en face de la marque). */
export const inPitBox = (c) => { const a = c.lat * PIT.sg; return Math.abs(wrapD(c.s - PIT.S0 - PIT.boxD)) < 7 && a > TRACK.half + 9.5 && a < TRACK.half + PIT.FULL + .5; };
