// Géométrie procédurale : circuit (asphalte, vibreurs, gravier, herbe/terre, murs, portique, ligne de départ) et repère temporaire du mobile.
import { TRACK, frameAt, edgePoint, PIT, pitExt } from './track.js';
import { SKY } from './gl.js';

const hex = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const sh = (c, k) => c.map((x) => x * k);
// Thèmes de décor : herbe (2 tons), terre extérieure, ciel (horizon / zénith), sol lointain, végétation.
const THEMES = {
  temperate: { g1: 0x3c7433, g2: 0x457f3a, out: 0x4b4630, far: 0x2d4a29, hor: [.72, .82, .92], zen: [.2, .42, .78], tree: 'pine', tc: 0x2c6a35 },
  forest: { g1: 0x2f6a2c, g2: 0x377533, out: 0x3a3a24, far: 0x1f3a1f, hor: [.62, .74, .78], zen: [.18, .38, .6], tree: 'pine', tc: 0x1f5a2a },
  snow: { g1: 0xe8eef4, g2: 0xdbe4ec, out: 0xb9c4cf, far: 0xc9d3dc, hor: [.86, .9, .95], zen: [.45, .62, .85], tree: 'snow', tc: 0xe6f0f5 },
  desert: { g1: 0xd2a860, g2: 0xc99e55, out: 0xa8793f, far: 0xb98a4a, hor: [.95, .85, .68], zen: [.35, .55, .85], tree: 'cactus', tc: 0x4f8a3a },
  tropical: { g1: 0x3f9a4a, g2: 0x48a553, out: 0xc9b98a, far: 0x2f8aa0, hor: [.7, .88, .95], zen: [.12, .5, .9], tree: 'palm', tc: 0x2f9a45 },
  autumn: { g1: 0x8a7a2e, g2: 0x7d7030, out: 0x5a4430, far: 0x4a3a22, hor: [.9, .8, .68], zen: [.4, .5, .72], tree: 'round', tc: 0xc8661e },
  volcano: { g1: 0x3a3a3e, g2: 0x333337, out: 0x2a2224, far: 0x1c1618, hor: [.85, .5, .32], zen: [.25, .2, .3], tree: 'rock', tc: 0x4a3f40 },
  dusk: { g1: 0x2e5a45, g2: 0x2a5340, out: 0x2a2c3a, far: 0x1a2a2a, hor: [.95, .6, .45], zen: [.18, .2, .45], tree: 'pine', tc: 0x1d4a38 },
  indoor: { g1: 0x5a5d63, g2: 0x55585e, out: 0x4a4d52, far: 0x2a2c31, hor: [.07, .08, .1], zen: [.05, .055, .07], tree: 'none', tc: 0x303540 },   // hall fermé : ciel sombre uni
};
/** Réapplique le ciel du thème (setWeather l'écrase). */
export function applySky() { const t = THEMES[TRACK.theme] || THEMES.temperate; SKY.hor = t.hor; SKY.zen = t.zen; }
const hash = (i) => { const s = Math.sin(i * 127.1) * 43758.5; return s - Math.floor(s); };

export function builder() {
  const v = [], ix = []; let n = 0;
  return {
    quad(a, b, c, d, col, nm) { for (const p of [a, b, c, d]) v.push(p[0], p[1], p[2], nm[0], nm[1], nm[2], col[0], col[1], col[2]); ix.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4; },
    done: () => ({ v: new Float32Array(v), i: new Uint32Array(ix) }),
  };
}
export function obox(B, cx, cy, cz, ux, uz, hw, hh, hl, col) {
  const rx = -uz, rz = ux, c = (a, b, d) => [cx + rx * hw * a + ux * hl * d, cy + hh * b, cz + rz * hw * a + uz * hl * d];
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
    const b = (a + 1) % 3, d = (a + 2) % 3;
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, r]) => { const w = [0, 0, 0]; w[a] = s; w[b] = p; w[d] = r; return c(...w); });
    B.quad(...q, col, a === 0 ? [rx * s, 0, rz * s] : a === 1 ? [0, s, 0] : [ux * s, 0, uz * s]);
  }
}


function frustum(B, cx, cz, y0, y1, r0, r1, sides, col) {
  const step = 6.283185 / sides;
  for (let k = 0; k < sides; k++) {
    const a0 = k * step, a1 = (k + 1) * step;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p0 = [cx + r0 * c0, y0, cz + r0 * s0];
    const p1 = [cx + r0 * c1, y0, cz + r0 * s1];
    const p2 = [cx + r1 * c1, y1, cz + r1 * s1];
    const p3 = [cx + r1 * c0, y1, cz + r1 * s0];
    const cm = (c0 + c1) * 0.5, sm = (s0 + s1) * 0.5;
    const dy = y1 - y0, dr = r0 - r1;
    B.quad(p0, p1, p2, p3, col, [cm * dy, dr, sm * dy]);
  }
}

function dome(B, cx, cz, yBase, r, h, sides, col) {
  frustum(B, cx, cz, yBase, yBase + h * 0.55, r * 0.72, r, sides, col);
  frustum(B, cx, cz, yBase + h * 0.55, yBase + h, r, 0.08, sides, col);
}

function rockPoly(B, cx, cz, yBase, sc, col) {
  frustum(B, cx, cz, yBase, yBase + 1.2 * sc, 1.4 * sc, 0.9 * sc, 5, col);
  frustum(B, cx, cz, yBase + 1.2 * sc, yBase + 2.0 * sc, 0.9 * sc, 0.15 * sc, 5, col);
}

function palmTree(B, cx, cz, yBase, sc, woodCol, leafCol) {
  frustum(B, cx, cz, yBase, yBase + 5.2 * sc, 0.28 * sc, 0.16 * sc, 5, woodCol);
  const nPalms = 6;
  const tipY = yBase + 4.9 * sc, dropY = yBase + 3.8 * sc;
  for (let k = 0; k < nPalms; k++) {
    const a = k * (6.283185 / nPalms);
    const c = Math.cos(a), s = Math.sin(a);
    const midX = cx + c * 1.5 * sc, midZ = cz + s * 1.5 * sc;
    const endX = cx + c * 2.8 * sc, endZ = cz + s * 2.8 * sc;
    const px = -s * 0.25 * sc, pz = c * 0.25 * sc;
    B.quad([cx, yBase + 5.3 * sc, cz], [midX - px, tipY, midZ - pz], [midX + px, tipY, midZ + pz], [cx, yBase + 5.3 * sc, cz], leafCol, [0, 1, 0]);
    B.quad([midX - px, tipY, midZ - pz], [endX, dropY, endZ], [endX, dropY, endZ], [midX + px, tipY, midZ + pz], leafCol, [c * 0.5, 0.5, s * 0.5]);
  }
}

export function buildTrackMesh() {
  const { N, P, T, ds, kerbL, kerbR } = TRACK, B = builder(), H = TRACK.half, G = H + TRACK.gravel, IN = TRACK.theme === 'indoor', KO = !!TRACK.kart;   // IN : hall de karting ; KO : karting en extérieur (vrai décor, gravier + vibreurs, sans stands)
  // Largeur max des bandes herbe/terre : on ne recouvre jamais une autre portion du circuit (dn = distance à la portion la plus proche, hors voisinage)
  // et, côté intérieur d'un virage, on reste sous le rayon de courbure (sinon la bande se replie sur elle-même).
  const dn = new Float32Array(N).fill(1e9), yn = new Float32Array(N), Kc = TRACK.K;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const d = Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 2] - P[j * 3 + 2]); if (d > 400) continue;
    if (Math.min(j - i, N - (j - i)) * ds < 1.7 * d + 25) continue;   // même virage (épingle comprise) : géré par la courbure
    if (d < dn[i]) { dn[i] = d; yn[i] = P[j * 3 + 1]; } if (d < dn[j]) { dn[j] = d; yn[j] = P[i * 3 + 1]; }
  }
  // pente du terrain : assez forte pour que son bord passe sous la route de la portion voisine (sinon une « montagne » la domine)
  const SL0 = new Float32Array(N), S = new Float32Array(N);
  for (let k = 0; k < N; k++) SL0[k] = dn[k] > 1e8 ? 0 : Math.max(0, Math.min(.6, (P[k * 3 + 1] - yn[k] + 1.5) / Math.max(Math.min(70, dn[k] - G - 1.5) - G - .5, 10)));
  for (let k = 0; k < N; k++) { let a = 0; for (let d = -8; d <= 8; d++) a += SL0[(k + d + N) % N]; S[k] = a / 17; }
  const lim = (k, sg) => Math.max(G + .5, Math.min(dn[k] - G - 1.5, Kc[k] * sg > 0 ? .85 / Math.abs(Kc[k]) : 1e9));
  const pt = (i, o, dy) => { i %= N; const q = edgePoint(TRACK, i, o < 0 ? -1 : 1, Math.abs(o)); return [q[0], P[i * 3 + 1] + dy, q[1]]; };
  const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const nrm = (i) => {
    const j = (i + 1) % N, k = (i + N - 1) % N, tx = T[i * 2], tz = T[i * 2 + 1], ty = (P[j * 3 + 1] - P[k * 3 + 1]) / (2 * ds), l = Math.hypot(tx, ty, tz);
    const rz = tx, rx = -tz, x = -rz * ty, y = rz * tx - rx * tz, z = rx * ty, m = Math.hypot(x, y, z); return [x / m, y / m, z / m];
  };
  const band = (i, sg, fa, fb, dya, dyb, col) => {
    const j = (i + 1) % N, a0 = fa(i), b0 = fb(i), a1 = fa(j), b1 = fb(j);
    if (b0 - a0 < .01 && b1 - a1 < .01) return;
    const f = (d, k) => typeof d === 'function' ? d(k) : d;
    B.quad(pt(i, sg * a0, f(dya, i)), pt(i, sg * b0, f(dyb, i)), pt(j, sg * b1, f(dyb, j)), pt(j, sg * a1, f(dya, j)), col, nrm(i));
  };
  const TH = THEMES[TRACK.theme] || THEMES.temperate; SKY.hor = TH.hor; SKY.zen = TH.zen;
  const C = { asp: hex(0x3a3c41), line: hex(0xe6e6e6), kr: hex(0xd0291f), kw: hex(0xf2f2f2), gr: hex(0xbba87b), wl: hex(0xdedede), wd: hex(0x9a9fa6), wt: hex(0x5d6269), pit: hex(0x4a4d53), g1: hex(TH.g1), g2: hex(TH.g2), out: hex(TH.out) };
  if (IN) { C.wl = C.wd = hex(0x7d828a); C.gr = hex(0x5a5d63); C.asp = hex(0x4c4f55); }   // barrières grises unies, dégagement = sol béton (ni gravier ni vibreurs), asphalte lissé
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    for (const sg of [-1, 1]) {
      const kw = sg > 0 ? kerbR : kerbL, nm = nrm(i);
      band(i, sg, () => H - .45, () => H - .15, .02, .02, C.line);
      for (let h = 0; h < 2; h++) {
        const u0 = h / 2, u1 = (h + 1) / 2, w0 = kw[i], w1 = kw[j];
        if (w0 > 0 || w1 > 0) B.quad(lerp(pt(i, sg * H, .03), pt(j, sg * H, .03), u0), lerp(pt(i, sg * (H + w0), .03), pt(j, sg * (H + w1), .03), u0), lerp(pt(i, sg * (H + w0), .03), pt(j, sg * (H + w1), .03), u1), lerp(pt(i, sg * H, .03), pt(j, sg * H, .03), u1), (i * 2 + h) & 1 ? C.kr : C.kw, nm);
      }
      band(i, sg, (k) => H + kw[k], () => G, -.04, -.04, sh(C.gr, .9 + .1 * hash(i + sg * 7)));
      const inn = [sg * T[i * 2 + 1], 0, -sg * T[i * 2]], col = i & 1 ? C.wl : C.wd;
      if (!(sg === PIT.sg && Math.max(pitExt(i * ds), pitExt(j * ds)) >= G - H)) {   // pas de mur extérieur là où la voie des stands le traverse
        B.quad(pt(i, sg * G, -.1), pt(i, sg * G, 1.25), pt(j, sg * G, 1.25), pt(j, sg * G, -.1), col, inn);
        B.quad(pt(i, sg * G, 1.25), pt(i, sg * (G + .5), 1.25), pt(j, sg * (G + .5), 1.25), pt(j, sg * G, 1.25), C.wt, [0, 1, 0]);
      }
      const gd = (k) => -.1 - S[k] * (Math.min(70, lim(k, sg)) - G - .5);
      if (!IN) band(i, sg, () => G + .5, (k) => Math.min(70, lim(k, sg)), -.1, gd, (i / 5 | 0) & 1 ? C.g1 : C.g2);
      if (!IN) band(i, sg, (k) => Math.min(70, lim(k, sg)), (k) => Math.min(160, lim(k, sg)), gd, (k) => Math.min(-35, gd(k) - 10), C.out);
    }
    band(i, 1, () => -H, () => H, 0, 0, sh(C.asp, .93 + .1 * hash(i)));
    {   // voie des stands : asphalte (rampes comprises), muret et ligne de séparation voie rapide / voie des box
      const e0 = pitExt(i * ds), e1 = pitExt(j * ds), ps = PIT.sg;
      if (e0 > 0 || e1 > 0) band(i, ps, () => H, (k) => H + pitExt(k * ds), .035, .035, C.pit);
      if (e0 >= PIT.FULL - .01 && e1 >= PIT.FULL - .01) {
        const a0 = H + 2.5, a1 = H + 3.5, inw = [ps * T[i * 2 + 1], 0, -ps * T[i * 2]], pc = i & 2 ? C.kr : C.kw;
        B.quad(pt(i, ps * a0, 0), pt(i, ps * a0, .9), pt(j, ps * a0, .9), pt(j, ps * a0, 0), pc, inw);
        B.quad(pt(i, ps * a1, 0), pt(i, ps * a1, .9), pt(j, ps * a1, .9), pt(j, ps * a1, 0), pc, inw.map((x) => -x));
        B.quad(pt(i, ps * a0, .9), pt(i, ps * a1, .9), pt(j, ps * a1, .9), pt(j, ps * a0, .9), C.wl, [0, 1, 0]);
        band(i, ps, () => H + 10.4, () => H + 10.6, .045, .045, C.line);
      }
    }
  }
  // portique + ligne de départ à s = 250 m
  const S0 = TRACK.startIdx * ds, f = frameAt(S0), q = (s, o, dy) => { const g = frameAt(s); return [g.x + g.rx * o, g.y + dy, g.z + g.rz * o]; };
  for (let c = 0; c < 2 * H; c++) for (let r = 0; r < 2; r++)
    B.quad(q(S0 + r * .8, -H + c, .03), q(S0 + r * .8, -H + c + 1, .03), q(S0 + r * .8 + .8, -H + c + 1, .03), q(S0 + r * .8 + .8, -H + c, .03), (c + r) & 1 ? hex(0x131313) : hex(0xf4f4f4), [0, 1, 0]);
  const post = hex(0x30343a), beam = hex(0xc9272d);
  for (const sg of [-1, 1]) obox(B, f.x + f.rx * sg * (H + 1.4), f.y + 3.5, f.z + f.rz * sg * (H + 1.4), f.tx, f.tz, .4, 3.5, .4, post);
  obox(B, f.x, f.y + 7.2, f.z, f.tx, f.tz, H + 1.8, .55, .5, beam);
  // décor : tribunes au départ, bannières sur le mur de la ligne droite, arbres / rochers / cactus en bordure
  const stand = (o, sg) => {
    const base = frameAt(S0 - 20), ux = base.tx, uz = base.tz, rx = base.rx * sg, rz = base.rz * sg;
    const hl = 38, conc = hex(0x8a929e), darkP = hex(0x282c34);
    // Rampe / soubassement arrière incliné de la tribune (au lieu d'un cube)
    for (let r = 0; r < 5; r++) {
      const dist = o + r * 1.7;
      const yPlat = base.y + 0.6 + r * 1.1;
      const colSeat = hex(r % 2 === 0 ? 0xc9272d : 0x2c5aa8);
      // Marche en béton
      obox(B, base.x + rx * dist, yPlat, base.z + rz * dist, ux, uz, 0.9, 0.25, hl, conc);
      // Rangée de sièges profilés (dossier + assise)
      obox(B, base.x + rx * (dist + 0.2), yPlat + 0.45, base.z + rz * (dist + 0.2), ux, uz, 0.35, 0.35, hl - 0.5, colSeat);
    }
    // Toit en auvent incliné vers la piste (angle d'auvent aérodynamique)
    const roofX = base.x + rx * (o + 4.2), roofZ = base.z + rz * (o + 4.2);
    obox(B, roofX, base.y + 7.8, roofZ, ux, uz, 5.2, 0.16, hl + 1.5, hex(0xe9ecef));
    // Bandeau frontal publicitaire sur l'auvent
    obox(B, base.x + rx * (o - 0.6), base.y + 7.4, base.z + rz * (o - 0.6), ux, uz, 0.1, 0.45, hl + 1.5, hex(0xc9272d));
    // Poteaux arrière fins en acier
    for (const e of [-hl + 2, 0, hl - 2]) {
      obox(B, base.x + rx * (o + 8.8) + ux * e, base.y + 4.0, base.z + rz * (o + 8.8) + uz * e, ux, uz, 0.22, 4.0, 0.22, darkP);
    }
  };
  for (const sd of [-1, 1]) if (!IN && !KO && sd !== PIT.sg) stand(G + 7, sd);   // pas de tribune du côté des stands
  // gradins aux virages serrés : côté extérieur, seulement si la place est libre
  if (!IN && !KO) {
    let last = -1e9, n = 0;
    for (let i = 0; i < N; i++) {
      const k = Math.abs(Kc[i]); if (k < .011 || dn[i] < 130) continue;
      let top = true; for (let d = -30; d <= 30; d++) if (Math.abs(Kc[(i + d + N) % N]) > k) { top = false; break; }
      const s = i * ds, dd = Math.abs(((s - S0 + TRACK.length * 1.5) % TRACK.length) - TRACK.length / 2);
      const sg = Kc[i] > 0 ? -1 : 1, o = G + 7;
      if (!top || dd < 250 || s - last < 350 || o + 12 > Math.min(70, lim(i, sg))) continue;
      last = s; n++;
      const b = frameAt(s), ux = b.tx, uz = b.tz, hl = 24, at = (f) => [b.x + b.rx * sg * f, b.z + b.rz * sg * f];
      const conc = hex(0x8a929e), darkP = hex(0x282c34);
      for (let r = 0; r < 4; r++) {
        const [x, z] = at(o + r * 1.6);
        const yP = b.y + 0.5 + r * 0.95;
        obox(B, x, yP, z, ux, uz, 0.85, 0.22, hl, conc);
        obox(B, x + b.rx * sg * 0.2, yP + 0.38, z + b.rz * sg * 0.2, ux, uz, 0.32, 0.32, hl - 0.4, hex((r + n) % 2 === 0 ? 0xc9272d : 0x2c5aa8));
      }
      const [rx, rz] = at(o + 3.6);
      obox(B, rx, b.y + 6.4, rz, ux, uz, 3.8, 0.14, hl + 0.8, hex(0xe9ecef));
      obox(B, at(o - 0.2)[0], b.y + 6.0, at(o - 0.2)[1], ux, uz, 0.1, 0.38, hl + 0.8, hex(0x2c5aa8));
      for (const e of [-hl + 1, hl - 1]) {
        const [px, pz] = at(o + 6.2);
        obox(B, px + ux * e, b.y + 3.2, pz + uz * e, ux, uz, 0.18, 3.2, 0.18, darkP);
      }
    }
  }
  if (!IN && !KO) {   // stands : rangée de garages, box du joueur (vert), panneaux d'entrée / sortie
    const ps = PIT.sg, F0 = PIT.FULL, sA = -PIT.back + PIT.T, sB = PIT.fwd - PIT.T, DOORS = [0xc9272d, 0x2c5aa8, 0xf2b705, 0xeeeeee], lime = [.25, .85, .3];
    const at = (d, a) => { const g = frameAt(S0 + d); return [g.x + g.rx * ps * a, g.y, g.z + g.rz * ps * a, g]; };
    const pq = (d, a, dy) => { const [x, y, z] = at(d, a); return [x, y + dy, z]; };
    let n = 0;
    for (let d = sA + 6; d + 6 <= sB; d += 12, n++) {
      const mine = Math.abs(d - PIT.boxD) < 6, [x, y, z, g] = at(d, H + F0 + 3.6), [fx, , fz] = at(d, H + F0 + .15);
      obox(B, x, y + 2, z, g.tx, g.tz, 3.5, 2, 5.9, hex(0x6a7078));
      obox(B, fx, y + 1.4, fz, g.tx, g.tz, .12, 1.4, 4.4, mine ? lime : hex(DOORS[n & 3]));
      if (mine) { const [sx, sy, sz] = at(d, H + F0 + 1); obox(B, sx, sy + 4.9, sz, g.tx, g.tz, .3, .5, 5, lime); }
    }
    const rect = (d0, d1, a0, a1, col, dy) => B.quad(pq(d0, a0, dy), pq(d0, a1, dy), pq(d1, a1, dy), pq(d1, a0, dy), col, [0, 1, 0]);
    const bd = PIT.boxD, A0 = H + 10.6, A1 = H + F0 - .6;
    rect(bd - 6, bd + 6, A0, A1, [.12, .3, .14], .045);
    rect(bd - 6, bd - 5.6, A0, A1, lime, .05); rect(bd + 5.6, bd + 6, A0, A1, lime, .05); rect(bd - 6, bd + 6, A0, A0 + .35, lime, .05); rect(bd - 6, bd + 6, A1 - .35, A1, lime, .05);
    for (const d of [-PIT.back + 6, PIT.fwd - 6]) { const [x, y, z, g] = at(d, H + 4); obox(B, x, y + 2, z, g.tx, g.tz, .15, 2, .15, hex(0x30343a)); obox(B, x, y + 4.4, z, g.tx, g.tz, 2.2, .8, .1, lime); }
  }
  const BC = [0xc9272d, 0x2c5aa8, 0xf2b705, 0x2a9d57, 0xeeeeee];
  for (let i = 0; i < N; i++) {
    const g = frameAt(i * ds), d = Math.abs(((i * ds - S0 + TRACK.length * 1.5) % TRACK.length) - TRACK.length / 2);
    if (!IN && i % 5 === 0 && (d > TRACK.length / 2 - 300 || d < 220)) for (const sg of [-1, 1]) if (!(sg === PIT.sg && pitExt(i * ds) > 0)) obox(B, g.x + g.rx * sg * (G + .25), g.y + 1.7, g.z + g.rz * sg * (G + .25), g.tx, g.tz, .04, .45, 8, hex(BC[(i / 5 + (sg > 0 ? 2 : 0)) % 5 | 0]));
  }
  for (let i = 0; i < (IN ? 0 : N); i += 5) for (const sg of [-1, 1]) {
    const hs = hash(i * 3 + sg * 11); if (hs < .3 || (sg === PIT.sg && pitExt(i * ds) > 0)) continue;
    const o = G + 3 + hs * 7; if (o + 5 > Math.min(70, lim(i, sg))) continue;
    const g = frameAt(i * ds), cx = g.x + g.rx * sg * o, cz = g.z + g.rz * sg * o, y = P[i * 3 + 1] - .1 - S[i] * (o - G - .5), sc = .8 + hash(i + 5) * .8, tc = hex(TH.tc), tr = hex(0x5a3d22);
    if (TH.tree === 'rock') {
      rockPoly(B, cx, cz, y, sc, tc);
    } else if (TH.tree === 'cactus') {
      frustum(B, cx, cz, y, y + 3.6 * sc, 0.34 * sc, 0.28 * sc, 6, tc);
      frustum(B, cx + 0.7 * sc, cz, y + 1.4 * sc, y + 2.8 * sc, 0.20 * sc, 0.16 * sc, 6, tc);
      obox(B, cx + 0.35 * sc, y + 1.4 * sc, cz, 0, 1, 0.18 * sc, 0.18 * sc, 0.35 * sc, tc);
    } else if (TH.tree === 'palm') {
      palmTree(B, cx, cz, y, sc, hex(0x7a5a32), tc);
    } else if (TH.tree === 'round') {
      frustum(B, cx, cz, y, y + 2.0 * sc, 0.32 * sc, 0.22 * sc, 6, tr);
      dome(B, cx, cz, y + 1.6 * sc, 1.9 * sc, 2.9 * sc, 7, tc);
      dome(B, cx + 0.35 * sc, cz - 0.25 * sc, y + 2.7 * sc, 1.4 * sc, 2.2 * sc, 6, sh(tc, 1.15));
    } else {
      // Sapins (pine, snow, temperate, forest, dusk) : tronc hexagonal + 3 étages de cônes étagés effilés
      frustum(B, cx, cz, y, y + 1.8 * sc, 0.26 * sc, 0.18 * sc, 6, tr);
      frustum(B, cx, cz, y + 1.2 * sc, y + 3.4 * sc, 2.1 * sc, 0.85 * sc, 7, sh(tc, 0.85));
      frustum(B, cx, cz, y + 2.8 * sc, y + 5.0 * sc, 1.65 * sc, 0.55 * sc, 7, tc);
      frustum(B, cx, cz, y + 4.4 * sc, y + 6.8 * sc, 1.15 * sc, 0.06 * sc, 7, TH.tree === 'snow' ? hex(0xf4f8fb) : sh(tc, 1.2));
    }
  }
  if (KO) {   // karting extérieur : murs de pneus en bord de gravier (côté extérieur des virages), petite tribune + paddock (tentes, conteneurs) au départ, panneaux de freinage
    const blk = hex(0x16181c), red = hex(0xc9272d), wht = hex(0xeeeeee), conc = hex(0x8a929e), darkP = hex(0x282c34), TENT = [0xc9272d, 0x2c5aa8, 0xf2b705, 0xeeeeee], CONT = [0x2c5aa8, 0x2a9d57, 0xc26a1c];
    for (let i = 0; i < N; i += 2) {   // piles de pneus : 3 hauteurs, bandes rouges / blanches / noires tous les 5 piles
      const k = Kc[i]; if (Math.abs(k) < .011) continue;
      const sg = k > 0 ? -1 : 1, g = frameAt(i * ds), cx = g.x + g.rx * sg * (G - .75), cz = g.z + g.rz * sg * (G - .75), grp = (i / 2 | 0) % 6, col = grp < 2 ? blk : grp < 4 ? red : wht;
      for (let h = 0; h < 3; h++) obox(B, cx, g.y + .17 + h * .34, cz, g.tx, g.tz, .45, .17, 1.9, h === 1 ? blk : col);
    }
    const si = TRACK.startIdx, spot = (sg, o, d) => o + 10 < Math.min(70, lim(((Math.round((S0 + d) / ds) % N) + N) % N, sg));
    const sgS = lim(si, 1) >= lim(si, -1) ? 1 : -1, oS = G + 6;
    if (spot(sgS, oS, -14)) {   // petite tribune couverte face à la ligne de départ
      const b = frameAt(S0 - 14), ux = b.tx, uz = b.tz, rx = b.rx * sgS, rz = b.rz * sgS, hl = 15;
      for (let r = 0; r < 3; r++) {
        const d = oS + r * 1.5, y = b.y + .5 + r * .9;
        obox(B, b.x + rx * d, y, b.z + rz * d, ux, uz, .8, .22, hl, conc);
        obox(B, b.x + rx * (d + .2), y + .42, b.z + rz * (d + .2), ux, uz, .32, .32, hl - .4, hex(r % 2 ? 0xc9272d : 0x2c5aa8));
      }
      obox(B, b.x + rx * (oS + 3.2), b.y + 4.6, b.z + rz * (oS + 3.2), ux, uz, 3.6, .14, hl + 1, hex(0xe9ecef));
      obox(B, b.x + rx * (oS - .5), b.y + 4.3, b.z + rz * (oS - .5), ux, uz, .1, .4, hl + 1, hex(0xc9272d));
      for (const e of [-hl + 1, 0, hl - 1]) obox(B, b.x + rx * (oS + 5.8) + ux * e, b.y + 2.3, b.z + rz * (oS + 5.8) + uz * e, ux, uz, .18, 2.3, .18, darkP);
    }
    for (let n = 0; n < 5; n++) {   // paddock : tentes aux couleurs variées, puis conteneurs, derrière le mur du côté de la tribune
      const d = 18 + n * 13, o = G + 5;
      if (!spot(sgS, o, d)) continue;
      const b = frameAt(S0 + d), cx = b.x + b.rx * sgS * o, cz = b.z + b.rz * sgS * o;
      if (n < 3) { obox(B, cx, b.y + 1.1, cz, b.tx, b.tz, 2.8, 1.1, 3.2, hex(0xdfe3e8)); frustum(B, cx, cz, b.y + 2.2, b.y + 3.6, 4.6, .25, 4, hex(TENT[(n + (si & 3)) & 3])); }
      else obox(B, cx, b.y + 1.3, cz, b.tx, b.tz, 1.2, 1.3, 3.0, hex(CONT[n - 3]));
    }
    for (let i = 0; i < N; i++) {   // panneaux de freinage 75 / 50 / 25 m avant chaque gros virage, côté extérieur, près du mur
      const k = Math.abs(Kc[i]); if (k < .02) continue;
      let isStart = true; for (let d = 1; d <= 6; d++) if (Math.abs(Kc[(i - d + N) % N]) >= .02) { isStart = false; break; }
      if (!isStart) continue;
      const sg = Kc[i] > 0 ? -1 : 1;
      for (const [m, c] of [[75, hex(0xf2f2f2)], [50, hex(0xf2b705)], [25, hex(0xc9272d)]]) {
        const j = ((i - Math.round(m / ds)) % N + N) % N, g = frameAt(j * ds), px = g.x + g.rx * sg * (G - 1.1), pz = g.z + g.rz * sg * (G - 1.1);
        obox(B, px, g.y + .6, pz, g.tx, g.tz, .06, .6, .06, darkP); obox(B, px, g.y + 1.4, pz, g.tx, g.tz, .3, .3, .05, c);
      }
    }
  }
  if (IN) {   // hall de karting : sol béton, murs sombres + bandeau néon, colonnes, plafond avec rampes lumineuses
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < N; i++) { x0 = Math.min(x0, P[i * 3]); x1 = Math.max(x1, P[i * 3]); z0 = Math.min(z0, P[i * 3 + 2]); z1 = Math.max(z1, P[i * 3 + 2]); }
    x0 -= 45; x1 += 45; z0 -= 45; z1 += 45;
    const CH = 12, hy = -.12, wc = hex(0x303540), neon = [.4, 1.9, 2.2], lamp = [2.2, 2.1, 1.9], col = hex(0x252932);
    B.quad([x0, hy, z0], [x1, hy, z0], [x1, hy, z1], [x0, hy, z1], hex(0x5a5d63), [0, 1, 0]);
    B.quad([x0, CH, z0], [x1, CH, z0], [x1, CH, z1], [x0, CH, z1], hex(0x1b1e25), [0, -1, 0]);
    const wall = (ax, az, bx, bz, nx, nz) => { for (const [y0, y1, c] of [[hy, CH, wc], [3, 3.35, neon]]) { const o = y0 === 3 ? .06 : 0; B.quad([ax + nx * o, y0, az + nz * o], [bx + nx * o, y0, bz + nz * o], [bx + nx * o, y1, bz + nz * o], [ax + nx * o, y1, az + nz * o], c, [nx, 0, nz]); } };
    wall(x0, z0, x1, z0, 0, 1); wall(x1, z0, x1, z1, -1, 0); wall(x1, z1, x0, z1, 0, -1); wall(x0, z1, x0, z0, 1, 0);
    for (let x = x0 + 20; x < x1; x += 40) { obox(B, x, CH / 2, z0 + .5, 1, 0, .5, CH / 2, .5, col); obox(B, x, CH / 2, z1 - .5, 1, 0, .5, CH / 2, .5, col); }
    for (let z = z0 + 20; z < z1; z += 40) { obox(B, x0 + .5, CH / 2, z, 1, 0, .5, CH / 2, .5, col); obox(B, x1 - .5, CH / 2, z, 1, 0, .5, CH / 2, .5, col); }
    for (let x = x0 + 16; x < x1; x += 26) for (let z = z0 + 16; z < z1; z += 26) obox(B, x, CH - .3, z, 1, 0, .5, .12, 4, lamp);
    // décor du hall (primitives seulement) : poutres et gaines au plafond, plinthe, portes roulantes + issues de secours, joints de dalle, colonnes, piles de pneus à l'extérieur des virages, caisses, palettes, fûts, étagères
    const stl = hex(0x20242c), duct = hex(0x8b9099), door = hex(0x39414d), skirt = hex(0x4a505a), joint = hex(0x4e5157), blk = hex(0x16181c), wood = hex(0x7a6244), wood2 = hex(0x6a553b), card = hex(0xa88a5e), drums = [hex(0x2b4a7a), hex(0x55595f), hex(0x6b2a24)], rack = hex(0x3d5a80), rbeam = hex(0xc26a1c), base = hex(0xc9a227), exit = [.15, 1.4, .35];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, nd = (x, z) => { let m = 1e9; for (let i = 0; i < N; i += 2) { const d = (P[i * 3] - x) ** 2 + (P[i * 3 + 2] - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
    for (let x = x0 + 3; x < x1; x += 26) obox(B, x, CH - .9, cz, 0, 1, .25, .35, (z1 - z0) / 2, stl);
    for (let z = z0 + 3; z < z1; z += 26) obox(B, cx, CH - 1.3, z, 1, 0, .25, .35, (x1 - x0) / 2, stl);
    obox(B, cx, CH - 2.2, z0 + 9, 1, 0, .6, .6, (x1 - x0) / 2, duct); obox(B, cx, CH - 2.2, z1 - 9, 1, 0, .6, .6, (x1 - x0) / 2, duct);
    obox(B, x0 + 9, CH - 2.2, cz, 0, 1, .6, .6, (z1 - z0) / 2, duct); obox(B, x1 - 9, CH - 2.2, cz, 0, 1, .6, .6, (z1 - z0) / 2, duct);
    for (const [ax, az, bx, bz, nx, nz] of [[x0, z0, x1, z0, 0, 1], [x1, z0, x1, z1, -1, 0], [x1, z1, x0, z1, 0, -1], [x0, z1, x0, z0, 1, 0]]) {
      const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, at = (t, y, o) => [ax + dx * t + nx * o, y, az + dz * t + nz * o];
      B.quad(at(0, hy, .03), at(len, hy, .03), at(len, 1.2, .03), at(0, 1.2, .03), skirt, [nx, 0, nz]);   // plinthe
      for (let t = 40; t < len - 20; t += 40) {
        B.quad(at(t - 4, hy, .05), at(t + 4, hy, .05), at(t + 4, 5.2, .05), at(t - 4, 5.2, .05), door, [nx, 0, nz]);   // porte roulante
        B.quad(at(t - .7, 5.8, .07), at(t + .7, 5.8, .07), at(t + .7, 6.25, .07), at(t - .7, 6.25, .07), exit, [nx, 0, nz]);   // issue de secours (lumineuse)
      }
    }
    for (let x = x0 + 12; x < x1; x += 12) B.quad([x - .03, hy + .02, z0], [x + .03, hy + .02, z0], [x + .03, hy + .02, z1], [x - .03, hy + .02, z1], joint, [0, 1, 0]);
    for (let z = z0 + 12; z < z1; z += 12) B.quad([x0, hy + .02, z - .03], [x1, hy + .02, z - .03], [x1, hy + .02, z + .03], [x0, hy + .02, z + .03], joint, [0, 1, 0]);
    for (let x = x0 + 60; x < x1 - 20; x += 60) for (let z = z0 + 60; z < z1 - 20; z += 60) if (nd(x, z) > G + 6) { obox(B, x, CH / 2, z, 1, 0, .6, CH / 2, .6, col); obox(B, x, .6, z, 1, 0, .66, .6, .66, base); }
    for (let i = 0; i < N; i += 3) {   // piles de pneus derrière le mur, côté extérieur des virages
      const k = Kc[i]; if (Math.abs(k) < .012) continue;
      const o = -Math.sign(k) * (TRACK.wall + 1.3), px = P[i * 3] - T[i * 2 + 1] * o, pz = P[i * 3 + 2] + T[i * 2] * o, tx = T[i * 2], tz = T[i * 2 + 1];
      for (const e of [-.5, .5]) for (let h = 0; h < 3; h++) obox(B, px + tx * e, .17 + h * .34, pz + tz * e, tx, tz, .45, .17, .24, blk);
    }
    for (let gx = x0 + 14, a = 0; gx < x1 - 10; gx += 22) for (let gz = z0 + 14; gz < z1 - 10; gz += 22, a++) {
      const px = gx + (hash(a * 3 + 1) - .5) * 10, pz = gz + (hash(a * 3 + 2) - .5) * 10, r = hash(a * 3 + 3), an = hash(a + 99) * 6.283, ux = Math.cos(an), uz = Math.sin(an), rx = -uz, rz = ux;
      if (nd(px, pz) < G + 6) continue;
      if (r < .3) { obox(B, px, .6, pz, ux, uz, .6, .6, .6, wood); obox(B, px + rx * 1.25, .6, pz + rz * 1.25, ux, uz, .6, .6, .6, wood2); obox(B, px + rx * .6, 1.75, pz + rz * .6, -uz, ux, .55, .55, .55, wood); }
      else if (r < .5) { obox(B, px, .08, pz, ux, uz, .6, .08, .6, wood2); obox(B, px, .56, pz, ux, uz, .5, .4, .5, card); obox(B, px + ux * .1, 1.36, pz + uz * .1, -uz, ux, .45, .4, .45, card); }
      else if (r < .68) for (let d = 0; d < 3; d++) obox(B, px + ux * (d - 1) * .8, .45, pz + uz * (d - 1) * .8, 1, 0, .35, .45, .35, drums[(a + d) % 3]);
      else if (r < .86) {
        for (const e of [-1.4, 1.4]) for (const d of [-.45, .45]) obox(B, px + ux * e + rx * d, 1.25, pz + uz * e + rz * d, 1, 0, .06, 1.25, .06, rack);
        for (const y of [1.2, 2.5]) for (const d of [-.45, .45]) obox(B, px + rx * d, y, pz + rz * d, ux, uz, .05, .07, 1.45, rbeam);
        obox(B, px, 1.62, pz, ux, uz, .4, .35, 1.0, card); obox(B, px, 2.92, pz, ux, uz, .4, .3, .8, wood);
      } else for (const e of [-.5, .5]) for (let h = 0; h < 3; h++) obox(B, px + ux * e, .17 + h * .34, pz + uz * e, ux, uz, .45, .17, .24, blk);
    }
  }
  const Y = -45, E = 6000, ym = [0, 1, 0], g = hex(TH.far);
  B.quad([-E, Y, -E], [E, Y, -E], [E, Y, E], [-E, Y, E], g, ym);
  return B.done();
}
