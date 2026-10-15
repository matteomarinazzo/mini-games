// spin.js — effet sur la blanche (V8). Module pur. Point de contact (x, y) dans le disque unité vu de derrière la queue :
// y > 0 = haut (suivi), y < 0 = bas (rétro), x > 0 = droite, x < 0 = gauche. Utilisé par game.js (contrôle) et physics.js (application).
export const SPIN0 = Object.freeze({ x: 0, y: 0 });
export function clampSpin(x, y, max = 1) {
  x = Number.isFinite(+x) ? +x : 0; y = Number.isFinite(+y) ? +y : 0;
  const d = Math.hypot(x, y);
  return d > max ? { x: x / d * max, y: y / d * max } : { x, y };
}
export const roundSpin = (s, k = 100) => ({ x: Math.round(s.x * k) / k, y: Math.round(s.y * k) / k });
const pct = v => Math.round(Math.abs(v) * 100);
export function spinLabel(s) {
  const a = [];
  if (pct(s.y) >= 5) a.push((s.y > 0 ? "suivi " : "rétro ") + pct(s.y) + " %");
  if (pct(s.x) >= 5) a.push((s.x > 0 ? "droite " : "gauche ") + pct(s.x) + " %");
  return a.length ? a.join(" · ") : "centre";
}
