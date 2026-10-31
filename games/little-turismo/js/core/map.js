// Tracé 2D depuis la spline : aperçu (menu), minimap (course), statistiques du circuit. Les fonctions acceptent un circuit (défaut : celui de la page).
import { TRACK, frameIn } from './track.js';
const bounds = (t) => t.bd || (t.bd = (() => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (let i = 0; i < t.N; i++) { const x = t.P[i * 3], z = t.P[i * 3 + 2]; a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); } return { x0: a, x1: b, z0: c, z1: d }; })());
/** Monde → canvas (w × h, marge m), échelle uniforme. */
export function fit(w, h, m, t = TRACK) {
  const b = bounds(t), k = Math.min((w - 2 * m) / (b.x1 - b.x0), (h - 2 * m) / (b.z1 - b.z0)), ox = (w - (b.x1 - b.x0) * k) / 2 - b.x0 * k, oz = (h - (b.z1 - b.z0) * k) / 2 - b.z0 * k;
  return { k, X: (x) => x * k + ox, Z: (z) => z * k + oz };
}
export function drawTrack(ctx, w, h, m, lw, col, t = TRACK) {
  const f = fit(w, h, m, t), { N, P } = t; ctx.lineJoin = ctx.lineCap = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath();
  for (let i = 0; i <= N; i++) { const j = i % N, x = f.X(P[j * 3]), z = f.Z(P[j * 3 + 2]); i ? ctx.lineTo(x, z) : ctx.moveTo(x, z); }
  ctx.stroke(); return f;
}
export function startMark(ctx, f, len, t = TRACK) {
  const g = frameIn(t, t.startIdx * t.ds), x = f.X(g.x), z = f.Z(g.z);
  ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(2, len / 3); ctx.strokeStyle = '#ff4d3d'; ctx.beginPath(); ctx.moveTo(x - g.rx * len, z - g.rz * len); ctx.lineTo(x + g.rx * len, z + g.rz * len); ctx.stroke();
}
/** Longueur (m), nombre de virages (courbure lissée, ≥ 3 échantillons), dénivelé (m). */
export function stats(t = TRACK) {
  const { N, P, K } = t; let lo = 1e9, hi = -1e9, n = 0, sg = 0, run = 0, s0 = 0;
  for (let i = 0; i < N; i++) { const y = P[i * 3 + 1]; lo = Math.min(lo, y); hi = Math.max(hi, y); }
  for (let i = 0; i < N; i++) if (Math.abs(K[i]) < .003) { s0 = i; break; }
  const end = () => { if (sg && run >= 3) n++; };
  for (let k = 0; k <= N; k++) { const v = K[(s0 + k) % N], q = Math.abs(v) > .005 ? Math.sign(v) : 0; if (q === sg) run++; else { end(); sg = q; run = 1; } }
  end();
  return { length: t.length, turns: n, climb: hi - lo };
}
/** Minimap : canvas rectangulaire à l'échelle du circuit entier (plus grande, donc lisible), fond + tracé + ligne de départ pré-rendus ; points (IA) et flèche (joueur) à chaque appel. */
export function createMap(cv) {
  const mob = innerWidth < 700 || matchMedia('(pointer:coarse)').matches, W0 = mob ? 176 : 250, m0 = 9, dpr = Math.min(devicePixelRatio || 1, 2), bd = bounds(TRACK);
  const k0 = (W0 - 2 * m0) / (bd.x1 - bd.x0), H0 = Math.round((bd.z1 - bd.z0) * k0 + 2 * m0), W = Math.round(W0 * dpr), H = Math.round(H0 * dpr);
  cv.width = W; cv.height = H; cv.style.width = W0 + 'px'; cv.style.height = H0 + 'px';
  const ctx = cv.getContext('2d'), base = document.createElement('canvas'); base.width = W; base.height = H;
  const b = base.getContext('2d'); b.fillStyle = 'rgba(10,14,26,.72)'; b.beginPath(); b.roundRect ? b.roundRect(.5, .5, W - 1, H - 1, 7 * dpr) : b.rect(.5, .5, W - 1, H - 1); b.fill(); b.lineWidth = dpr; b.strokeStyle = 'rgba(255,255,255,.16)'; b.stroke();
  const m = m0 * dpr; drawTrack(b, W, H, m, 10 * dpr, 'rgba(11,15,26,.4)'); const f = drawTrack(b, W, H, m, 5 * dpr, '#e3e9f4');
  const g = frameIn(TRACK, TRACK.startIdx * TRACK.ds), sx = f.X(g.x), sz = f.Z(g.z); b.lineCap = 'butt';
  for (const [lw, len, c] of [[5 * dpr, 8 * dpr, '#fff'], [3 * dpr, 6.5 * dpr, '#ff4d3d']]) { b.lineWidth = lw; b.strokeStyle = c; b.beginPath(); b.moveTo(sx - g.rx * len, sz - g.rz * len); b.lineTo(sx + g.rx * len, sz + g.rz * len); b.stroke(); }
  return {
    draw(me, cars) {
      ctx.clearRect(0, 0, W, H); ctx.drawImage(base, 0, 0); ctx.fillStyle = '#6fb3ff'; ctx.strokeStyle = '#0b0f1a'; ctx.lineWidth = 1.2 * dpr;
      for (const c of cars) { const p = c.ph; ctx.beginPath(); ctx.arc(f.X(p.x), f.Z(p.z), 3.8 * dpr, 0, 6.3); ctx.fill(); ctx.stroke(); }
      ctx.save(); ctx.translate(f.X(me.x), f.Z(me.z)); ctx.rotate(me.psi); ctx.scale(dpr * 1.5, dpr * 1.5);
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -5.5); ctx.lineTo(-2.5, 0); ctx.lineTo(-5, 5.5); ctx.closePath();
      ctx.fillStyle = '#ff7a1a'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
    },
  };
}