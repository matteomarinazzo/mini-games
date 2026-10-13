// cpu.js — IA légère (module pur, testable sous Node). Elle ne modifie JAMAIS le monde ni le résultat d'un coup : elle propose
// seulement (aim, power) ; le tir passe ensuite par la physique et les règles normales (game.js). Méthode : « bille fantôme » —
// pour chaque bille légale et chaque poche, point d'impact de la blanche, trajets dégagés, angle de coupe, score ; léger bruit d'angle.
import { BALL_R as R, POCKETS, TABLE, HEAD_SPOT, V_MIN, V_MAX, isValidCuePlacement } from './physics.js';
import { legalFirst, requiredPocket, clampAim, legalAim, ZONE } from './rules.js';

export const SIGMA = 0.003;                 // écart-type du bruit d'angle (rad) ≈ 0,17° : ~45 % des tirs visés sont empochés (mesuré en simulation)
const MIN_CUT = 0.3;                        // cos de l'angle de coupe minimal (≈ 72° max)

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
const blocked = (balls, ax, ay, bx, by, skip) => balls.some(o => !o.out && !skip.includes(o) && segDist(o.x, o.y, ax, ay, bx, by) < 2 * R * 0.98);
export const powerFor = D => Math.min(0.85, Math.max(0.22, (1.5 * Math.sqrt(360 * D) + 100 - V_MIN) / (V_MAX - V_MIN)));
const gauss = rng => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

// Meilleur tir direct depuis (cx, cy) ; null si aucun. g = état de partie (joueur courant, options), rem = billes restantes.
export function bestShot(world, g, rem, cx, cy) {
  const balls = world.balls, cue = world.cue, req = requiredPocket(g, rem);
  let best = null;
  for (const t of balls) {
    if (t === cue || t.out || !legalFirst(g, t.n, rem)) continue;
    for (const P of req != null && t.n === 8 ? [POCKETS[req]] : POCKETS) {
      let dx = P.x - t.x, dy = P.y - t.y; const dp = Math.hypot(dx, dy); if (dp < 1) continue;
      dx /= dp; dy /= dp;
      const gx = t.x - dx * 2 * R, gy = t.y - dy * 2 * R;
      if (gx < R || gx > TABLE.W - R || gy < R || gy > TABLE.H - R) continue;
      let ux = gx - cx, uy = gy - cy; const dc = Math.hypot(ux, uy); if (dc < 1) continue;
      ux /= dc; uy /= dc;
      const cut = ux * dx + uy * dy; if (cut < MIN_CUT) continue;
      const aim = Math.atan2(uy, ux); if (!legalAim(aim, g.fwd)) continue;
      if (blocked(balls, cx, cy, gx, gy, [cue, t]) || blocked(balls, t.x, t.y, P.x, P.y, [cue, t])) continue;
      const D = dc + dp, score = cut * cut * 1000 / (1 + D / 400);
      if (!best || score > best.score) best = { score, aim, D, n: t.n };
    }
  }
  return best;
}

// Tir de l'ordinateur : { aim, power, planned } (planned = true si un empochage est visé, false = repli « toucher la bonne bille »).
export function planShot(world, g, rem, rng = Math.random, sigma = SIGMA) {
  const c = world.cue, s = bestShot(world, g, rem, c.x, c.y);
  let aim, power, planned = !!s;
  if (s) { aim = s.aim; power = powerFor(s.D); }
  else {
    let bt = null, bd = Infinity;
    for (const b of world.balls) {
      if (b === c || b.out || !legalFirst(g, b.n, rem)) continue;
      const d = Math.hypot(b.x - c.x, b.y - c.y) + (blocked(world.balls, c.x, c.y, b.x, b.y, [c, b]) ? 1000 : 0);
      if (d < bd) { bd = d; bt = b; }
    }
    aim = bt ? Math.atan2(bt.y - c.y, bt.x - c.x) : 0;
    power = rem.length === world.balls.length - 1 ? 0.95 : 0.5;          // casse : plein pouvoir
  }
  return { aim: clampAim(aim + gauss(rng) * sigma, g.fwd), power, planned };
}

// Placement de la blanche en main : balaie la zone autorisée (grille de 30) et garde la position au meilleur tir.
export function placeCue(world, g, rem) {
  const x0 = g.zone === 'R' ? ZONE.R : R + 4, x1 = g.zone === 'L' ? ZONE.L : TABLE.W - R - 4;
  let best = null;
  for (let x = x0; x <= x1; x += 30) for (let y = R + 4; y <= TABLE.H - R - 4; y += 30) {
    if (!isValidCuePlacement(world, x, y)) continue;
    const s = bestShot(world, g, rem, x, y), sc = s ? s.score : 0;
    if (!best || sc > best.sc) best = { x, y, sc };
  }
  return best || { x: g.zone === 'R' ? ZONE.R : HEAD_SPOT.x, y: HEAD_SPOT.y, sc: 0 };
}
