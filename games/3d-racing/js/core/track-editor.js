// Éditeur de circuits (canvas 2D) : points de contrôle (Catmull-Rom fermée), altitude par point, départ, décor.
// Contrainte de jouabilité : ligne droite principale ≥ MIN_STRAIGHT de chaque côté du départ + place côté extérieur pour les stands ; plus garde-fous de géométrie.
import { buildTrack, frameIn } from './track.js';

export const MIN_STRAIGHT = 140, MIN_CLEAR = 45, PIT_CLEAR = 45, MAX_K = 1 / 15;
export const THEMES = [['temperate', 'Tempéré'], ['forest', 'Forêt'], ['snow', 'Neige'], ['desert', 'Désert'], ['tropical', 'Tropical'], ['autumn', 'Automne'], ['volcano', 'Volcan'], ['dusk', 'Crépuscule']];
export const stadium = () => {
  const L = 300, R = 130, a = (c, t) => [Math.round(c[0] + R * Math.cos(t * Math.PI / 180)), Math.round(c[1] + R * Math.sin(t * Math.PI / 180))], p = [[-L, 0], [0, 0], [L, 0]];
  for (const t of [-60, -30, 0, 30, 60]) p.push(a([L, R], t));
  p.push([L, 2 * R], [0, 2 * R], [-L, 2 * R]); for (const t of [120, 150, 180, 210, 240]) p.push(a([-L, R], t));
  return { id: null, name: 'Mon circuit', theme: 'temperate', start: 300, pts: p, elev: p.map(() => 0) };
};

/** Valide une définition { start, pts, elev, theme } → { err[], ck[[ok,txt]], bad[], t (circuit), S0, back, fwd, sg, h }. */
export function analyze(S) {
  const err = [], bad = [], ck = [];
  if (S.pts.length < 6) return { err: ['Au moins 6 points'], ck: [[false, 'Au moins 6 points']], bad, t: null };
  let t; try { t = buildTrack({ name: S.name, start: S.start, pts: S.pts, elev: S.elev, theme: S.theme, ec: true }, 'tmp'); } catch (e) { return { err: ['Tracé invalide'], ck: [[false, 'Tracé invalide']], bad, t: null }; }
  const { N, ds, P, K, length } = t, si = Math.round(S.start / ds) % N, S0 = si * ds, wrapD = (d) => d - length * Math.round(d / length);
  const add = (ok, txt) => { ck.push([ok, txt]); if (!ok) err.push(txt); };
  add(length >= 800 && length <= 12000, `Longueur ${Math.round(length)} m (800 – 12 000)`);
  let km = 0; for (let i = 0; i < N; i++) if (Math.abs(K[i]) > Math.abs(K[km])) km = i;
  const okK = Math.abs(K[km]) <= MAX_K; if (!okK) bad.push(km); add(okK, `Virage le plus serré : rayon ${Math.round(1 / Math.max(Math.abs(K[km]), 1e-4))} m (≥ ${Math.round(1 / MAX_K)})`);
  let md = 1e9, mi = -1; const lim2 = MIN_CLEAR * MIN_CLEAR;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const dx = P[i * 3] - P[j * 3], dz = P[i * 3 + 2] - P[j * 3 + 2], d2 = dx * dx + dz * dz; if (d2 >= lim2) continue;
    const d = Math.sqrt(d2); if (Math.min(j - i, N - (j - i)) * ds < 1.7 * d + 25) continue;
    if (d < md) { md = d; mi = i; } bad.push(i, j);
  }
  add(mi < 0, mi < 0 ? 'Pas de croisement ni de tronçons trop proches' : `Tronçons trop proches (${Math.round(md)} m < ${MIN_CLEAR})`);
  const run = (dir) => { let m = 0; while (m < 320) { const i = (((si + dir * Math.round(m / ds)) % N) + N) % N; if (Math.abs(K[i]) > .003) break; m += ds; } return m; };
  const rb = run(-1), rf = run(1);
  add(rb >= MIN_STRAIGHT && rf >= MIN_STRAIGHT, `Ligne droite au départ : ${Math.round(rb)} m derrière / ${Math.round(rf)} m devant (≥ ${MIN_STRAIGHT})`);
  const back = Math.max(80, Math.min(240, rb - 20)), fwd = Math.max(80, Math.min(200, rf - 20)), h = t.half;
  const clear = (sg) => { let b = 1e9; for (let d = -back; d <= fwd; d += 20) { const f = frameIn(t, S0 + d), qx = f.x + f.rx * sg * (h + 30), qz = f.z + f.rz * sg * (h + 30); for (let j = 0; j < N; j++) { if (Math.abs(wrapD(j * ds - S0 - d)) < 350) continue; b = Math.min(b, Math.hypot(qx - P[j * 3], qz - P[j * 3 + 2])); } } return b; };
  const c1 = clear(1), c2 = clear(-1), sg = c1 >= c2 ? 1 : -1, best = Math.max(c1, c2);
  add(best >= PIT_CLEAR, `Place pour les stands (côté extérieur) : ${best > 1e8 ? '∞' : Math.round(best) + ' m'} (≥ ${PIT_CLEAR})`);
  return { err, ck, bad, t, S0, back, fwd, sg, h };
}

/** Éditeur interactif. onChange(A, def, sel) après chaque analyse. */
export function createTrackEditor(cv, pf, onChange) {
  const ctx = cv.getContext('2d'), pc = pf.getContext('2d'); let S = stadium(), sel = -1, A = null, V = { x: 0, z: 130, k: .5 }, drag = null, pend = 0;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const toW = ([x, y]) => [V.x + (x - cv.clientWidth / 2) / V.k, V.z + (y - cv.clientHeight / 2) / V.k];
  const toS = (p) => [(p[0] - V.x) * V.k + cv.clientWidth / 2, (p[1] - V.z) * V.k + cv.clientHeight / 2];
  const hit = (q) => S.pts.findIndex((p) => { const s = toS(p); return Math.hypot(s[0] - q[0], s[1] - q[1]) < 14; });
  function fit() {
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const [x, z] of S.pts) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); }
    V.x = (a + b) / 2; V.z = (c + d) / 2; V.k = Math.max(.03, Math.min(2, Math.min(cv.clientWidth / (b - a + 200), cv.clientHeight / (d - c + 200))));
  }
  function draw() {
    const d = devicePixelRatio || 1, w = cv.clientWidth, hh = cv.clientHeight; if (!w) return;
    cv.width = w * d; cv.height = hh * d; ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, hh);
    const X = (x) => (x - V.x) * V.k + w / 2, Z = (z) => (z - V.z) * V.k + hh / 2, g = 100 * V.k >= 14 ? 100 : 500;
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
    for (let x = Math.floor((V.x - w / 2 / V.k) / g) * g; x < V.x + w / 2 / V.k; x += g) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), hh); ctx.stroke(); }
    for (let z = Math.floor((V.z - hh / 2 / V.k) / g) * g; z < V.z + hh / 2 / V.k; z += g) { ctx.beginPath(); ctx.moveTo(0, Z(z)); ctx.lineTo(w, Z(z)); ctx.stroke(); }
    const t = A.t; ctx.lineJoin = ctx.lineCap = 'round';
    if (t) {
      const { N, P } = t, line = (lw, col, i0 = 0, n = N) => { ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath(); for (let k = 0; k <= n; k++) { const i = (i0 + k) % N; k ? ctx.lineTo(X(P[i * 3]), Z(P[i * 3 + 2])) : ctx.moveTo(X(P[i * 3]), Z(P[i * 3 + 2])); } ctx.stroke(); };
      ctx.beginPath(); for (let q = -A.back; q <= A.fwd; q += 10) { const f = frameIn(t, A.S0 + q), o = A.sg * (A.h + 10); q > -A.back ? ctx.lineTo(X(f.x + f.rx * o), Z(f.z + f.rz * o)) : ctx.moveTo(X(f.x + f.rx * o), Z(f.z + f.rz * o)); }
      ctx.lineWidth = Math.max(3, 14 * V.k); ctx.strokeStyle = 'rgba(74,144,226,.4)'; ctx.stroke();   // zone des stands
      line(Math.max(5, 12 * V.k), 'rgba(11,15,26,.7)'); line(Math.max(3, 8 * V.k), '#e3e9f4');
      const si = Math.round(A.S0 / t.ds); line(Math.max(2, 3 * V.k), '#3ccf5a', ((si - Math.round(A.back / t.ds)) % N + N) % N, Math.round((A.back + A.fwd) / t.ds));
      for (const i of A.bad) { ctx.fillStyle = '#ff4d3d'; ctx.beginPath(); ctx.arc(X(P[i * 3]), Z(P[i * 3 + 2]), 5, 0, 7); ctx.fill(); }
      const f = frameIn(t, A.S0); ctx.lineCap = 'butt'; ctx.lineWidth = 4; ctx.strokeStyle = '#ff4d3d'; ctx.beginPath(); ctx.moveTo(X(f.x - f.rx * 10), Z(f.z - f.rz * 10)); ctx.lineTo(X(f.x + f.rx * 10), Z(f.z + f.rz * 10)); ctx.stroke();
    }
    S.pts.forEach((p, i) => { ctx.fillStyle = i === sel ? '#ff7a1a' : '#fff'; ctx.strokeStyle = '#0b0f1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(p[0]), Z(p[1]), i === sel ? 8 : 6, 0, 7); ctx.fill(); ctx.stroke(); });
    if (t) {   // profil d'altitude
      const pw = pf.clientWidth, ph = pf.clientHeight; pf.width = pw * d; pf.height = ph * d; pc.setTransform(d, 0, 0, d, 0, 0);
      const ys = Array.from({ length: t.N }, (_, i) => t.P[i * 3 + 1]), hi = Math.max(10, ...ys); pc.strokeStyle = '#ff4d3d'; pc.lineWidth = 2; pc.beginPath();
      ys.forEach((y, i) => { const x = i / t.N * pw, yy = ph - 4 - y / hi * (ph - 8); i ? pc.lineTo(x, yy) : pc.moveTo(x, yy); }); pc.stroke();
    }
  }
  function refresh() { cancelAnimationFrame(pend); pend = requestAnimationFrame(() => { A = analyze(S); if (A.t && S.start >= A.t.length) S.start = 0; draw(); onChange(A, S, sel); }); }
  function addPoint(w) {
    const n = S.pts.length; let bi = n - 1, bd = 1e18;
    for (let i = 0; i < n; i++) { const a = S.pts[i], b = S.pts[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], u = Math.max(0, Math.min(1, ((w[0] - a[0]) * ex + (w[1] - a[1]) * ez) / (ex * ex + ez * ez || 1))), q = Math.hypot(w[0] - a[0] - ex * u, w[1] - a[1] - ez * u); if (q < bd) { bd = q; bi = i; } }
    S.pts.splice(bi + 1, 0, [Math.round(w[0]), Math.round(w[1])]); S.elev.splice(bi + 1, 0, (S.elev[bi] + S.elev[(bi + 1) % n]) / 2); sel = bi + 1; refresh();
  }
  const rm = (i) => { if (S.pts.length <= 3) return; S.pts.splice(i, 1); S.elev.splice(i, 1); sel = -1; refresh(); };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); const i = hit(pos(e)); drag = { i, x: e.clientX, y: e.clientY, mv: false, vx: V.x, vz: V.z }; if (i >= 0) { sel = i; refresh(); } });
  cv.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.mv && Math.hypot(dx, dy) < 5) return; drag.mv = true; if (drag.i >= 0) { const w = toW(pos(e)); S.pts[drag.i] = [Math.round(w[0]), Math.round(w[1])]; refresh(); } else { V.x = drag.vx - dx / V.k; V.z = drag.vz - dy / V.k; draw(); } });
  cv.addEventListener('pointerup', (e) => { if (drag && !drag.mv && drag.i < 0) addPoint(toW(pos(e))); drag = null; });
  cv.addEventListener('contextmenu', (e) => { e.preventDefault(); const i = hit(pos(e)); if (i >= 0) rm(i); });
  const zoom = (f, q = [cv.clientWidth / 2, cv.clientHeight / 2]) => { const w = toW(q), k = Math.max(.03, Math.min(5, V.k * f)); V.k = k; V.x = w[0] - (q[0] - cv.clientWidth / 2) / k; V.z = w[1] - (q[1] - cv.clientHeight / 2) / k; draw(); };
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, pos(e)); }, { passive: false });
  addEventListener('resize', () => { if (cv.clientWidth) draw(); });
  return {
    get def() { return S; }, get sel() { return sel; }, refresh, zoom, fit: () => { fit(); draw(); },
    load(d) { S = { id: d.id || null, name: d.name || 'Mon circuit', theme: d.theme || 'temperate', start: d.start || 0, pts: d.pts.map((p) => [...p]), elev: d.elev.slice() }; sel = -1; fit(); refresh(); },
    del() { if (sel >= 0) rm(sel); }, setStart(v) { S.start = v; refresh(); }, setAlt(v) { if (sel >= 0) { S.elev[sel] = v; refresh(); } },
  };
}
