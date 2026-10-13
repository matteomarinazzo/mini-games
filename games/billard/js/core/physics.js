// physics.js — simulation des billes. Module pur : aucune dépendance au DOM, testable sous Node.
// Repère : origine = coin haut-gauche du tapis, x vers la droite, y vers le bas, unités de table (voir README_V0.md).

export const TABLE = { W: 1000, H: 500 };
export const BALL_R = 13;
export const HEAD_SPOT = { x: TABLE.W / 4, y: TABLE.H / 2 };
export const FOOT_SPOT = { x: TABLE.W * 0.75, y: TABLE.H / 2 };

// Poches : source unique pour le dessin (r = rayon visuel) et la physique (cap = rayon de capture du CENTRE d'une bille).
export const POCKETS = [
  { x: 0, y: 0, r: 30, cap: 36 }, { x: TABLE.W, y: 0, r: 30, cap: 36 },
  { x: 0, y: TABLE.H, r: 30, cap: 36 }, { x: TABLE.W, y: TABLE.H, r: 30, cap: 36 },
  { x: TABLE.W / 2, y: -6, r: 26, cap: 30 }, { x: TABLE.W / 2, y: TABLE.H + 6, r: 26, cap: 30 },
];

// Vitesses en unités/s. La puissance (0..1) est convertie linéairement entre V_MIN et V_MAX.
export const V_MIN = 150;
export const V_MAX = 2200;
const DT = 1 / 240;            // pas fixe : à V_MAX une bille avance de ~9 unités/pas (< rayon 13) → pas de traversée
const MAX_STEPS = 24;          // plafond de sous-étapes par image (équivaut à 0,1 s simulée)
const FRICTION_CONST = 150;    // décélération constante du tapis (unités/s²)
const FRICTION_PROP = 0.3;     // part proportionnelle à la vitesse (1/s) : freine plus fort les tirs rapides
const V_STOP = 6;              // sous ce seuil la bille est arrêtée net (évite tremblements et rampement infini)
const E_WALL = 0.75;           // restitution bande
const E_BALL = 0.95;           // restitution bille-bille

// Dispositions provisoires (PAS les règles officielles) : numéros par rangée, sommet sur la mouche de pied.
const ROWS = {
  '8ball': [[1], [9, 2], [10, 8, 3], [11, 4, 12, 5], [13, 6, 14, 7, 15]],
  '9ball': [[1], [2, 3], [4, 9, 5], [6, 7], [8]],
  '10ball': [[1], [2, 3], [4, 10, 5], [6, 7, 8, 9]],
};

const makeBall = (n, x, y) => ({ n, x, y, vx: 0, vy: 0, out: false });

export function createWorld(modeId) {
  const rows = ROWS[modeId] || ROWS['8ball'];
  const d = 2 * BALL_R + 0.6;               // léger jeu entre billes : aucune surimpression au départ
  const dx = d * Math.sqrt(3) / 2;
  const balls = [makeBall(0, HEAD_SPOT.x, HEAD_SPOT.y)];
  rows.forEach((row, r) => row.forEach((n, k) =>
    balls.push(makeBall(n, FOOT_SPOT.x + r * dx, FOOT_SPOT.y + (k - (row.length - 1) / 2) * d))));
  return { balls, cue: balls[0], acc: 0 };
}

export const powerToSpeed = p => V_MIN + (V_MAX - V_MIN) * Math.min(1, Math.max(0, p));

export function shoot(world, angle, power) {
  const v = powerToSpeed(power);
  world.cue.first = null;
  world.cue.vx = Math.cos(angle) * v;
  world.cue.vy = Math.sin(angle) * v;
}

export const isMoving = world => world.balls.some(b => !b.out && (b.vx !== 0 || b.vy !== 0));
export function stopAll(world) { for (const b of world.balls) b.vx = b.vy = 0; }

// Un pas de simulation de durée DT.
function step(balls, onPocket) {
  const R = BALL_R, D2 = 4 * R * R;
  // 1) friction puis déplacement
  for (const b of balls) {
    if (b.out) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp === 0) continue;
    const ns = sp - (FRICTION_CONST + FRICTION_PROP * sp) * DT;
    if (ns <= V_STOP) { b.vx = b.vy = 0; continue; }
    const k = ns / sp;
    b.vx *= k; b.vy *= k;
    b.x += b.vx * DT; b.y += b.vy * DT;
  }
  // 2) collisions bille-bille : séparation des chevauchements + impulsion le long de la normale.
  //    Masses égales, donc chaque bille reçoit la moitié de l'impulsion. 2 passes pour les paquets serrés.
  for (let it = 0; it < 2; it++) {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i]; if (a.out) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j]; if (b.out) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= D2) continue;
        const d = Math.sqrt(d2) || 1e-4;
        if (a.n === 0) { if (a.first == null) a.first = b.n; } else if (b.n === 0 && b.first == null) b.first = a.n; // 1er contact de la blanche
        const nx = dx / d, ny = dy / d, push = (2 * R - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; // < 0 : les billes se rapprochent
        if (vn < 0) {
          const j2 = -(1 + E_BALL) * vn / 2;
          a.vx -= j2 * nx; a.vy -= j2 * ny; b.vx += j2 * nx; b.vy += j2 * ny;
        }
      }
    }
  }
  // 3) poches (testées avant les bandes pour qu'une bille entrant dans une poche ne rebondisse pas), puis bandes
  for (const b of balls) {
    if (b.out) continue;
    for (const p of POCKETS) {
      const px = b.x - p.x, py = b.y - p.y;
      if (px * px + py * py < p.cap * p.cap) {
        b.out = true; b.vx = b.vy = 0;
        if (onPocket) onPocket(b);
        break;
      }
    }
    if (b.out) continue;
    const maxX = TABLE.W - R, maxY = TABLE.H - R;
    if (b.x < R) { b.x = R; if (b.vx < 0) b.vx = -b.vx * E_WALL; }
    else if (b.x > maxX) { b.x = maxX; if (b.vx > 0) b.vx = -b.vx * E_WALL; }
    if (b.y < R) { b.y = R; if (b.vy < 0) b.vy = -b.vy * E_WALL; }
    else if (b.y > maxY) { b.y = maxY; if (b.vy > 0) b.vy = -b.vy * E_WALL; }
  }
}

// Avance la simulation de dtSec secondes réelles avec un pas fixe ; le temps d'image est plafonné par l'appelant.
export function update(world, dtSec, onPocket) {
  world.acc += dtSec;
  let n = 0;
  while (world.acc >= DT && n < MAX_STEPS) { step(world.balls, onPocket); world.acc -= DT; n++; }
  if (world.acc >= DT) world.acc = 0; // retard irrattrapable : on l'abandonne plutôt que de le rejouer
}

// Lancer de rayon pour la ligne de visée : distance jusqu'à la première bille touchée (centre à 2R) ou la bande.
export function rayCast(world, ox, oy, angle) {
  const R = BALL_R, dx = Math.cos(angle), dy = Math.sin(angle);
  let t = Infinity, hit = null;
  if (dx > 1e-9) t = Math.min(t, (TABLE.W - R - ox) / dx); else if (dx < -1e-9) t = Math.min(t, (R - ox) / dx);
  if (dy > 1e-9) t = Math.min(t, (TABLE.H - R - oy) / dy); else if (dy < -1e-9) t = Math.min(t, (R - oy) / dy);
  for (const b of world.balls) {
    if (b === world.cue || b.out) continue;
    const fx = ox - b.x, fy = oy - b.y;
    const B = fx * dx + fy * dy, C = fx * fx + fy * fy - 4 * R * R, disc = B * B - C;
    if (disc < 0) continue;
    const tt = -B - Math.sqrt(disc);
    if (tt > 0 && tt < t) { t = tt; hit = b; }
  }
  t = Math.max(0, t);
  return { x: ox + dx * t, y: oy + dy * t, ball: hit };
}

// Placement de la blanche valide : sur le tapis (hors bande), hors poche, sans chevaucher une autre bille.
export function isValidCuePlacement(world, x, y) {
  const R = BALL_R, m = R + 2;
  if (x < m || x > TABLE.W - m || y < m || y > TABLE.H - m) return false;
  for (const p of POCKETS) if (Math.hypot(x - p.x, y - p.y) < p.cap + R) return false;
  for (const b of world.balls) if (b !== world.cue && !b.out && Math.hypot(x - b.x, y - b.y) < 2 * R + 1) return false;
  return true;
}
