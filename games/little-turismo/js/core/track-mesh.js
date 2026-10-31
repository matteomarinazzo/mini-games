// Géométrie procédurale : circuit (asphalte, vibreurs, gravier, herbe/terre, murs, portique, ligne de départ) et repère temporaire du mobile.
import { TRACK, GRAVEL, frameAt, edgePoint, PIT, pitExt } from './track.js';
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
};
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

export function buildTrackMesh() {
  const { N, P, T, ds, kerbL, kerbR } = TRACK, B = builder(), H = TRACK.half, G = H + GRAVEL;
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
      band(i, sg, () => G + .5, (k) => Math.min(70, lim(k, sg)), -.1, gd, (i / 5 | 0) & 1 ? C.g1 : C.g2);
      band(i, sg, (k) => Math.min(70, lim(k, sg)), (k) => Math.min(160, lim(k, sg)), gd, (k) => Math.min(-35, gd(k) - 10), C.out);
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
    const base = frameAt(S0 - 20), ux = base.tx, uz = base.tz, cx = base.x + base.rx * sg * o, cz = base.z + base.rz * sg * o;
    for (let r = 0; r < 4; r++) { const off = o + r * 2.2; obox(B, base.x + base.rx * sg * off + ux * 0, base.y + 1.2 + r * 1.3, base.z + base.rz * sg * off, ux, uz, 1.1, 1.3 + r * .65, 38, hex(r & 1 ? 0xc9272d : 0x2c5aa8)); }
    obox(B, base.x + base.rx * sg * (o + 5), base.y + 8.2, base.z + base.rz * sg * (o + 5), ux, uz, 5.5, .18, 40, hex(0xe9ecef));
    for (const e of [-38, 38]) obox(B, base.x + base.rx * sg * (o + 9) + ux * e, base.y + 4, base.z + base.rz * sg * (o + 9) + uz * e, ux, uz, .25, 4, .25, hex(0x30343a));
  };
  for (const sd of [-1, 1]) if (sd !== PIT.sg) stand(G + 7, sd);   // pas de tribune du côté des stands
  // gradins aux virages serrés : côté extérieur, seulement si la place est libre
  {
    let last = -1e9, n = 0;
    for (let i = 0; i < N; i++) {
      const k = Math.abs(Kc[i]); if (k < .011 || dn[i] < 130) continue;
      let top = true; for (let d = -30; d <= 30; d++) if (Math.abs(Kc[(i + d + N) % N]) > k) { top = false; break; }
      const s = i * ds, dd = Math.abs(((s - S0 + TRACK.length * 1.5) % TRACK.length) - TRACK.length / 2);
      const sg = Kc[i] > 0 ? -1 : 1, o = G + 7;
      if (!top || dd < 250 || s - last < 350 || o + 12 > Math.min(70, lim(i, sg))) continue;
      last = s; n++;
      const b = frameAt(s), ux = b.tx, uz = b.tz, hl = 24, at = (f) => [b.x + b.rx * sg * f, b.z + b.rz * sg * f];
      for (let r = 0; r < 3; r++) { const [x, z] = at(o + r * 2.2); obox(B, x, b.y + .9 + r * 1.2, z, ux, uz, 1.1, 1 + r * .6, hl, hex((r + n) & 1 ? 0xc9272d : 0x2c5aa8)); }
      const [rx, rz] = at(o + 4.4); obox(B, rx, b.y + 6.6, rz, ux, uz, 3.6, .16, hl + 1, hex(0xe9ecef));
      for (const e of [-hl, hl]) { const [x, z] = at(o + 6.5); obox(B, x + ux * e, b.y + 3.3, z + uz * e, ux, uz, .2, 3.3, .2, hex(0x30343a)); }
    }
  }
  {   // stands : rangée de garages, box du joueur (vert), panneaux d'entrée / sortie
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
    if (i % 5 === 0 && (d > TRACK.length / 2 - 300 || d < 220)) for (const sg of [-1, 1]) if (!(sg === PIT.sg && pitExt(i * ds) > 0)) obox(B, g.x + g.rx * sg * (G + .25), g.y + 1.7, g.z + g.rz * sg * (G + .25), g.tx, g.tz, .04, .45, 8, hex(BC[(i / 5 + (sg > 0 ? 2 : 0)) % 5 | 0]));
  }
  for (let i = 0; i < N; i += 5) for (const sg of [-1, 1]) {
    const hs = hash(i * 3 + sg * 11); if (hs < .3 || (sg === PIT.sg && pitExt(i * ds) > 0)) continue;
    const o = G + 3 + hs * 7; if (o + 5 > Math.min(70, lim(i, sg))) continue;
    const g = frameAt(i * ds), cx = g.x + g.rx * sg * o, cz = g.z + g.rz * sg * o, y = P[i * 3 + 1] - .1 - S[i] * (o - G - .5), sc = .8 + hash(i + 5) * .8, tc = hex(TH.tc), tr = hex(0x5a3d22);
    const bxy = (h, w, yy, c, ux = 0, uz = 1) => obox(B, cx, y + yy, cz, ux, uz, w, h, w, c);
    if (TH.tree === 'rock') bxy(.9 * sc, 1.3 * sc, .8 * sc, tc, .8, .6);
    else if (TH.tree === 'cactus') { bxy(1.8 * sc, .3 * sc, 1.8 * sc, tc); obox(B, cx + .6 * sc, y + 2 * sc, cz, 0, 1, .22 * sc, .7 * sc, .22 * sc, tc); }
    else if (TH.tree === 'palm') { bxy(3 * sc, .18 * sc, 3 * sc, hex(0x8a6a3a)); for (let a = 0; a < 3; a++) obox(B, cx, y + 6.2 * sc, cz, Math.cos(a * 1.05), Math.sin(a * 1.05), .08, .08, 2 * sc, tc); }
    else if (TH.tree === 'round') { bxy(1.2 * sc, .2 * sc, 1.2 * sc, tr); bxy(1.8 * sc, 1.6 * sc, 3.2 * sc, tc, .7, .7); }
    else { bxy(1 * sc, .2 * sc, 1 * sc, tr); bxy(1.5 * sc, 1.7 * sc, 2.4 * sc, tc); bxy(1.3 * sc, 1.2 * sc, 4.2 * sc, tc); bxy(1.1 * sc, .7 * sc, 5.9 * sc, TH.tree === 'snow' ? hex(0xf4f8fb) : tc); }
  }
  const Y = -45, E = 6000, ym = [0, 1, 0], g = hex(TH.far);
  B.quad([-E, Y, -E], [E, Y, -E], [E, Y, E], [-E, Y, E], g, ym);
  return B.done();
}
