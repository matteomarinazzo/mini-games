// État de la voiture (joueur) : 7 zones, usure 0–1, schéma 2D vert → rouge, effets légers sur la physique, usure visible sur le modèle (surcouches sans texture).
import { builder, obox } from './track-mesh.js';
import { carMatrix, partsOf } from './cars.js';
import { look } from './sheets.js';

const RECT = { nose: [18, 2, 16, 8], fw: [3, 11, 46, 7], hood: [15, 20, 22, 16], l: [3, 20, 10, 46], r: [39, 20, 10, 46], floor: [15, 38, 22, 24], rw: [3, 68, 46, 8] };
const NAME = { nose: 'Nez', fw: 'Aile AV', hood: 'Capot', l: 'Gauche', r: 'Droite', floor: 'Fond', rw: 'Aile AR' };
const STOPS = [[60, 207, 90], [242, 208, 59], [242, 138, 34], [229, 53, 43]];
const col = (v, a = 1) => { const t = Math.min(.999, Math.max(0, v)) * 3, i = Math.floor(t), f = t - i, p = STOPS[i], q = STOPS[i + 1]; return `rgba(${Math.round(p[0] + (q[0] - p[0]) * f)},${Math.round(p[1] + (q[1] - p[1]) * f)},${Math.round(p[2] + (q[2] - p[2]) * f)},${a})`; };
export function createDamage(cv) {
  cv.width = 240; cv.height = 400;   // 60 x 100 unités logiques, échelle 4
  const ctx = cv.getContext('2d'), w = { nose: 0, fw: 0, hood: 0, l: 0, r: 0, rw: 0, floor: 0 }; let dirty = true;
  const add = (k, v) => { if (v > 0) { w[k] = Math.min(1, w[k] + v); dirty = true; } };
  const rr = (x, y, a, b, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, a, b, r) : ctx.rect(x, y, a, b); };
  const D = {
    w,
    /** Choc : vitesse normale (m/s), direction monde vers l'obstacle (nx,nz), cap psi. Un frôlement (< 2 m/s) ne coûte rien. */
    hit(v, nx, nz, psi) {
      const d = (v - 2) * .016; if (d <= 0) return;
      const c = Math.cos(psi), s = Math.sin(psi), f = nx * c + nz * s, r = -nx * s + nz * c, F = Math.max(0, f), A = Math.abs(r);
      add('nose', d * F); add('fw', d * (F * 1.1 + A * .25)); add('hood', d * F * .5); add('rw', d * (Math.max(0, -f) * 1.5 + A * .2)); add('l', d * Math.max(0, -r)); add('r', d * Math.max(0, r));
    },
    /** Réparation aux stands : tout à 100 %. */
    repair() { for (const k in w) w[k] = 0; dirty = true; },
    /** Vibreurs et gravier usent un peu le fond plat. */
    tick(dt, surf, kmh) { if (surf === 1) add('floor', .004 * dt * kmh / 80); else if (surf === 2) add('floor', .01 * dt * kmh / 80); },
    /** Effets : aileron AR → appui arrière (survirage), aile AV → appui avant (sous-virage), capot/nez → puissance, vmax, traînée, freins ; flancs/nez → direction, tire à droite/gauche ; fond → adhérence. */
    apply(c) {
      const cl = (v) => Math.max(0, Math.min(1, v)), eng = cl(w.hood * .6 + w.nose * .5);
      c.far = 1 - .88 * w.rw; c.faf = 1 - .8 * w.fw - .1 * w.nose;
      c.fg = 1 - .2 * w.floor - .08 * (w.l + w.r) / 2;
      c.fd = 1 + .25 * Math.max(0, w.nose * 2 - 1) + (w.rw < .55 ? .35 * w.rw : -.08) + .1 * w.fw;
      c.fp = 1 - .4 * eng; c.fv = 1 - .1 * eng;
      c.fb = 1 - .25 * (w.nose + w.fw + w.floor) / 3 * 2;
      c.fs = 1 - .3 * cl(w.nose * .6 + (w.l + w.r) * .4);
      c.pull = .05 * (w.r - w.l);
    },
    draw() {
      if (!dirty) return; dirty = false; ctx.setTransform(4, 0, 0, 4, 0, 0); ctx.clearRect(0, 0, 60, 100);
      const tot = Object.values(w).reduce((s, v) => s + v, 0) / 7;
      // panneau + en-tête (état général)
      ctx.fillStyle = 'rgba(10,14,26,.72)'; rr(.5, .5, 59, 99, 7); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.stroke();
      ctx.font = 'bold 5.5px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#a9b4c8'; ctx.fillText('ÉTAT', 6, 7);
      ctx.textAlign = 'right'; ctx.fillStyle = col(tot); ctx.fillText(Math.round((1 - tot) * 100) + ' %', 54, 7);
      ctx.save(); ctx.translate(4, 13);
      // roues + axes + châssis central
      ctx.fillStyle = '#0d1016'; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = .5;
      for (const [x, y, h] of [[-1, 10, 13], [47, 10, 13], [-1, 54, 15], [47, 54, 15]]) { rr(x, y, 6, h, 2); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(25, 6, 2, 64);
      // zones : couleur continue vert → rouge, lueur si très abîmées, % si visibles
      ctx.textAlign = 'center';
      for (const k in RECT) {
        const [x, y, a, b] = RECT[k], v = w[k];
        ctx.shadowColor = col(v); ctx.shadowBlur = v > .55 ? 6 : 0;
        ctx.fillStyle = col(v, .92); rr(x + .5, y + .5, a - 1, b - 1, 2.6); ctx.fill(); ctx.shadowBlur = 0;
        ctx.lineWidth = .7; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.22)'; rr(x + 1.2, y + 1.2, a - 2.4, Math.min(2.2, b / 3), 1.2); ctx.fill();   // reflet
        if (v >= .1 && a >= 16 && b >= 8) { ctx.fillStyle = '#fff'; ctx.font = 'bold 5px sans-serif'; ctx.shadowColor = '#000'; ctx.shadowBlur = 2; ctx.fillText(Math.round(v * 100), x + a / 2, y + b / 2 + .3); ctx.shadowBlur = 0; }
      }
      ctx.restore();
      // barre d'état global
      ctx.fillStyle = 'rgba(255,255,255,.12)'; rr(6, 94, 48, 3, 1.5); ctx.fill();
      ctx.fillStyle = col(tot); rr(6, 94, Math.max(3, 48 * (1 - tot)), 3, 1.5); ctx.fill();
    },
  };
  D.draw(); return D;
}


// --- Dégâts visibles : surcouches (froissements, noircissement, trou de capot, capot relevé, fissures du pare-brise, fumée) + pièces cassables
// de cars.js (aileron AR, aile AV tordus puis arrachés ; rétros arrachés). Tout par carrosserie (PR). Gauche = -x local.
const OR = [.95, .42, .1], SC = [.09, .08, .075];
// hood/noseTop/tailTop : stations [z, y, demi-largeur] ; ws : pare-brise ; nose/tail : [z, y0, y1, hw] ; side : [hw, y0, y1, z0, z1] ; wing/front : pivot [y, z]
const PR = {
  gt: { hood: [[.95, .68, .74], [1.4, .6, .7], [2.05, .47, .62]], ws: [[0, 1.15, .55], [.9, .7, .74]], noseTop: [[2.05, .47, .62], [2.3, .4, .5]], nose: [2.31, .3, .4, .48], tail: [-2.31, .3, .6, .58], tailTop: [[-2.3, .6, .5], [-2, .72, .74]], side: [.85, .26, .72, -1.9, 1.9], wing: [.98, -2.2], front: [.25, 2.2], flap: 1 },
  wedge: { hood: [[.7, .58, .55], [1.7, .42, .4], [2.25, .31, .27]], ws: [[.5, 1, .48], [1.2, .62, .7]], noseTop: [[1.7, .42, .4], [2.3, .28, .28]], nose: [2.31, .22, .28, .28], tail: [-2.26, .3, .5, .6], tailTop: [[-2.25, .5, .6], [-1.7, .72, .82]], side: [.92, .24, .6, -1.6, 1.6], wing: [1, -2.15], front: [.22, 2.28], flap: 1 },
  proto: { hood: [[.8, .55, .58], [1.6, .4, .44], [2.25, .29, .3]], ws: [[.3, .98, .4], [1.1, .6, .62]], noseTop: [[1.6, .4, .45], [2.3, .28, .3]], nose: [2.31, .24, .28, .3], tail: [-2.31, .3, .5, .5], tailTop: [[-2.3, .5, .5], [-1.8, .78, .7]], side: [.9, .24, .6, -1.6, 1.6], wing: [1.1, -2.2], front: [.22, 2.28], flap: 1 },
  rally: { hood: [[1, .97, .88], [1.7, .79, .83], [2.2, .61, .73]], ws: [[.2, 1.5, .7], [.9, 1.1, .8]], noseTop: [[1.7, .79, .83], [2.2, .61, .73]], nose: [2.21, .4, .6, .78], tail: [-2.21, .4, .78, .8], tailTop: [[-2.2, .78, .82], [-1.9, .95, .88]], side: [.94, .36, .9, -1.8, 1.8], wing: [1.3, -2.2], front: [.3, 2.15], flap: 1 },
  open: { hood: [[.7, .47, .2], [1.7, .35, .09], [2.3, .31, .06]], noseTop: [[1.7, .35, .1], [2.3, .31, .06]], nose: [2.36, .26, .3, .06], tail: [-2.21, .3, .5, .18], tailTop: [[-2.2, .5, .18], [-1.4, .62, .26]], side: [.85, .22, .52, -.9, 1], wing: [.9, -2.15], front: [.22, 2.15] },
};
const nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const rnd = (i) => { const s = Math.sin(i * 91.7) * 43758.5; return s - Math.floor(s); };
const stn = (st) => {
  const n = st.length - 1, at = (u) => { const f = Math.min(n - 1e-6, Math.max(0, u * n)), i = Math.floor(f), t = f - i, a = st[i], b = st[i + 1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, b[0] - a[0], b[1] - a[1]]; };
  const N = (u) => { const q = at(u); return nrm([0, q[3], -q[4]]); };
  return { N, P: (u, v, o = .012) => { const q = at(u), m = N(u); return [v * q[2] + m[0] * o, q[1] + m[1] * o, q[0] + m[2] * o]; } };
};
const face = (z, y0, y1, hw, d) => ({ N: () => [0, 0, d], P: (u, v, o = .012) => [v * hw, y0 + (y1 - y0) * u, z + d * o] });
const sidef = (sg, hw, y0, y1, z0, z1) => ({ N: () => [sg, 0, 0], P: (u, v, o = .012) => [sg * (hw + o), y0 + (y1 - y0) * u, z0 + (z1 - z0) * (v * .5 + .5)] });
/** Grille de plaques froissées (normales perturbées = plis, couleurs sombres/claires), ordre aléatoire = apparition progressive. Renvoie le nombre de plaques. */
function patches(B, S, nu, nv, seed, o = .012, fix) {
  const L = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const k = seed + i * 7 + j * 13, r = rnd(k), u0 = i / nu, u1 = (i + 1) / nu, v0 = -1 + 2 * j / nv, v1 = -1 + 2 * (j + 1) / nv;
    const nn = nrm(S.N((u0 + u1) / 2).map((x, t) => x + (rnd(k + t * 5) - .5) * .9));
    L.push({ k: rnd(k + 3), q: [S.P(u0, v0, o), S.P(u0, v1, o), S.P(u1, v1, o), S.P(u1, v0, o)], col: fix || (r < .45 ? SC : r < .78 ? [-.5, 0, 0] : [-1.3, 0, 0]), nn });
  }
  L.sort((a, b) => a.k - b.k); for (const p of L) B.quad(...p.q, p.col, p.nn); return L.length;
}
function cracks(B, S) {
  const cl = (v) => Math.max(-1, Math.min(1, v)), c0 = [.5, .1], W = [.88, .93, .98]; let n = 0;
  const seg = (u0, v0, u1, v1, w) => { u0 = Math.max(0, Math.min(1, u0)); u1 = Math.max(0, Math.min(1, u1)); v0 = cl(v0); v1 = cl(v1); const du = u1 - u0, dv = v1 - v0, l = Math.hypot(du, dv) || 1, pu = -dv / l * w, pv = du / l * w; B.quad(S.P(u0 + pu, v0 + pv, .02), S.P(u0 - pu, v0 - pv, .02), S.P(u1 - pu, v1 - pv, .02), S.P(u1 + pu, v1 + pv, .02), W, S.N(.5)); n++; };
  for (let k = 0; k < 10; k++) { const a = k * .628 + rnd(k) * .4, r = .35 + rnd(k + 9) * .45; seg(c0[0], c0[1], c0[0] + Math.cos(a) * r * .5, c0[1] + Math.sin(a) * r, .012); }
  for (const rr of [.18, .38]) for (let k = 0; k < 8; k++) { const a0 = k * .785, a1 = a0 + .785; seg(c0[0] + Math.cos(a0) * rr * .5, c0[1] + Math.sin(a0) * rr, c0[0] + Math.cos(a1) * rr * .5, c0[1] + Math.sin(a1) * rr, .01); }
  return n;
}
const OV = {};
function buildOv(R, kd) {
  const K = PR[kd], O = {}, mk = (key, fn) => { const B = builder(), n = fn(B); O[key] = { m: R.mesh(B.done()), n }; };
  const hood = stn(K.hood), ws = K.ws && stn(K.ws);
  mk('hood', (B) => patches(B, hood, 4, 4, 1));
  mk('nose', (B) => patches(B, stn(K.noseTop), 2, 4, 20) + patches(B, face(...K.nose, 1), 2, 4, 40));
  mk('tail', (B) => patches(B, face(...K.tail, -1), 3, 4, 60) + patches(B, stn(K.tailTop), 3, 4, 80));
  mk('sl', (B) => patches(B, sidef(-1, ...K.side), 3, 6, 100)); mk('sr', (B) => patches(B, sidef(1, ...K.side), 3, 6, 120));
  if (ws) { mk('cr', (B) => cracks(B, ws)); mk('sh', (B) => patches(B, ws, 3, 4, 140, .02, [.02, .025, .03])); }
  if (K.flap) {
    mk('hole', (B) => { for (const [a, b] of [[.1, .55], [.55, 1]]) B.quad(hood.P(a, -.8, .02), hood.P(a, .8, .02), hood.P(b, .8, .02), hood.P(b, -.8, .02), [.03, .03, .03], hood.N(.5)); return 2; });
    mk('flap', (B) => { for (const [a, b] of [[.1, .55], [.55, 1]]) B.quad(hood.P(a, -.9, .035), hood.P(a, .9, .035), hood.P(b, .9, .035), hood.P(b, -.9, .035), [-1.1, 0, 0], hood.N(.5)); return 2; });
  }
  // fumée : cube unique, gris clair (moins contrasté = moins opaque visuellement)
  mk('smoke', (B) => { obox(B, 0, 0, 0, 0, 1, .12, .12, .12, [.5, .52, .55]); return 1; });
  return O;
}
const CM = new Float32Array(16), LM = new Float32Array(16), MM = new Float32Array(16), SM = new Float32Array(16);
function mul(o, a, b) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
/** Rotation locale autour du pivot (x=0, y=py, z=pz) : tangage ax puis roulis az, + décalage. */
function lm(py, pz, ax, az, dy, dz) {
  const cx = Math.cos(ax), sx = Math.sin(ax), cz = Math.cos(az), sz = Math.sin(az), r01 = -sz * cx, r02 = -sz * sx, r11 = cz * cx, r12 = cz * sx, r21 = -sx, r22 = cx;
  LM.set([cz, sz, 0, 0, r01, r11, r21, 0, r02, r12, r22, 0, -(r01 * py + r02 * pz), py - (r11 * py + r12 * pz) + dy, pz - (r21 * py + r22 * pz) + dz, 1]); return LM;
}
/** À appeler après drawCars. w = createDamage().w ; q = pose (joueur : objet persistant de createCars → pilote aussi les flags aileron/rétros de cars.js). */
export function drawWear(R, w, q) {
  const kk = PR[q.kind] ? q.kind : (q.sheet && PR[look(q.sheet).kind] ? look(q.sheet).kind : 'gt'), K = PR[kk], own = q.n !== undefined, top = q.body || OR;
  const rw = w.rw || 0, fw = w.fw || 0, hd = w.hood || 0, ns = w.nose || 0, L = w.l || 0, Rr = w.r || 0;
  if (own) { q.wr = rw; q.wf = fw; q.xl = L > .3; q.xr = Rr > .3; }
  if (!(rw > 0 || fw > 0 || hd > .03 || ns > .03 || L > .03 || Rr > .03)) return;
  const O = OV[kk] || (OV[kk] = buildOv(R, kk)), P = partsOf(R, kk);
  carMatrix(CM, q.x, q.y, q.z, q.psi, q.pitch, q.roll, q.sc);
  if (own) {   // aileron AR / aile AV : tordus (inclinés, affaissés) puis arrachés
    if (rw > 0 && rw < .55) R.draw(P.wing, mul(MM, CM, lm(K.wing[0], K.wing[1], rw * .6, rw * .5, -rw * .25, -rw * .1)), top);
    if (fw > 0 && fw < .65) R.draw(P.front, mul(MM, CM, lm(K.front[0], K.front[1], -fw * .5, -fw * .35, -fw * .08, 0)), top);
  }
  const dr = (o, f) => { const c = Math.ceil(Math.min(1, f) * o.n); if (f > .03 && c > 0) R.drawRange(o.m, CM, top, 0, c * 6); };
  dr(O.hood, hd * 1.2); dr(O.nose, ns * 1.2); dr(O.tail, rw * 1.1); dr(O.sl, L * 1.3); dr(O.sr, Rr * 1.3);
  if (O.cr) { const cw = Math.min(1, (hd + ns) * .7 + (L + Rr) * .15); dr(O.cr, cw * 1.1); dr(O.sh, (cw - .6) * 2.5); }
  if (O.hole && hd > .5) { R.draw(O.hole.m, CM, top); R.draw(O.flap.m, mul(MM, CM, lm(K.hood[0][1], K.hood[0][0], Math.min(.9, (hd - .5) * 1.8), 0, 0, 0)), top); }
  const eng = Math.min(1, hd * .6 + ns * .5);
  if (own && eng > .5) {
    // fumée moteur : plusieurs bouffées éparpillées (position, taille et dérive propres à chacune), qui montent, se dispersent puis s'effacent
    const t = performance.now() / 1000, n = 5 + Math.round(eng * 8);
    for (let k = 0; k < n; k++) {
      const ph = (t * .6 + k / n) % 1, g = rnd(k + 31), sz = (.6 + g * .7) * (.5 + ph * 1.8 * eng) * (1 - ph * .4) * (ph < .1 ? ph * 10 : 1);
      const x = (rnd(k + 7) - .5) * .9 + Math.sin(ph * 3 + k) * ph * .5;
      const z = K.hood[1][0] - ph * (1.6 + g * 1) + (rnd(k + 13) - .5) * .4;
      const y = K.hood[1][1] + .1 + ph * (1.8 + g * 1.2);
      SM.set([sz, 0, 0, 0, 0, sz, 0, 0, 0, 0, sz, 0, x, y, z, 1]);
      R.drawAlpha(O.smoke.m, mul(MM, CM, SM), top, .5);
    }
  }
}