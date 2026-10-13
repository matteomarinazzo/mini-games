// Dessin Canvas : table (reprise de la V1), billes, ligne de visée, queue, blanche fantôme.
// Les fonctions de billes/queue travaillent en coordonnées table (le repère est décalé de T.R par game.js).
import { BALL_R as R, POCKETS } from './physics.js';

const TAU = Math.PI * 2;
const COL = ['#f4f4f0', '#f5c400', '#1e50c8', '#d02020', '#6a2a9a', '#f08020', '#118a3e', '#8a2020', '#111'];
export const ballColor = n => COL[n > 8 ? n - 8 : n];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function diamond(ctx, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore();
}

// Table V1 inchangée, sauf les poches lues depuis physics.js. T = { W, H, R, CUSHION } (R = bande).
export function drawTable(ctx, T) {
  const LW = T.W + 2 * T.R, LH = T.H + 2 * T.R;
  ctx.clearRect(0, 0, LW, LH);
  rr(ctx, 0, 0, LW, LH, 36); ctx.fillStyle = '#5b3a1f'; ctx.fill();
  rr(ctx, 5, 5, LW - 10, LH - 10, 32); ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 3; ctx.stroke();
  const c = T.CUSHION;
  rr(ctx, T.R - c, T.R - c, T.W + 2 * c, T.H + 2 * c, 10); ctx.fillStyle = '#0b5a3a'; ctx.fill();
  ctx.fillStyle = '#0f7a4d'; ctx.fillRect(T.R, T.R, T.W, T.H);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(T.R + T.W / 4, T.R); ctx.lineTo(T.R + T.W / 4, T.R + T.H); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  for (const fx of [.25, .75]) { ctx.beginPath(); ctx.arc(T.R + T.W * fx, T.R + T.H / 2, 4, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#050505';
  for (const p of POCKETS) { ctx.beginPath(); ctx.arc(T.R + p.x, T.R + p.y, p.r, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#e8d9b0';
  for (let i = 1; i <= 7; i++) if (i !== 4) { diamond(ctx, T.R + T.W * i / 8, T.R / 2); diamond(ctx, T.R + T.W * i / 8, LH - T.R / 2); }
  for (let i = 1; i <= 3; i++) { diamond(ctx, T.R / 2, T.R + T.H * i / 4); diamond(ctx, LW - T.R / 2, T.R + T.H * i / 4); }
}

export function drawBall(ctx, b) {
  const n = b.n;
  ctx.save(); ctx.translate(b.x, b.y);
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.arc(2, 3, R, 0, TAU); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
  ctx.fillStyle = n > 0 && n <= 8 ? ballColor(n) : '#f4f4f0'; ctx.fillRect(-R, -R, 2 * R, 2 * R);
  if (n > 8) { ctx.fillStyle = ballColor(n); ctx.fillRect(-R, -R * .55, 2 * R, R * 1.1); } // bande des rayées
  if (n > 0) {
    ctx.fillStyle = '#f4f4f0'; ctx.beginPath(); ctx.arc(0, 0, R * .52, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = `bold ${n > 9 ? 7.5 : 9}px system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n, 0, .5);
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(-R * .35, -R * .4, R * .22, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  ctx.restore();
}

// Ligne pointillée jusqu'à l'obstacle (distance t) + cercle de la blanche à l'impact.
export function drawAim(ctx, c, angle, t) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
  ctx.beginPath(); ctx.moveTo(c.x + dx * R, c.y + dy * R); ctx.lineTo(c.x + dx * t, c.y + dy * t); ctx.stroke();
  ctx.setLineDash([]); ctx.beginPath(); ctx.arc(c.x + dx * t, c.y + dy * t, R, 0, TAU); ctx.stroke();
  ctx.restore();
}

// Queue derrière la blanche (direction opposée à la visée) ; `pull` = recul visuel (unités table).
export function drawCue(ctx, c, angle, pull) {
  const g0 = R + 4 + pull, L = 380;
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(angle);
  const grad = ctx.createLinearGradient(-g0, 0, -g0 - L, 0);
  grad.addColorStop(0, '#5aa0d0'); grad.addColorStop(.015, '#e8d9b0');
  grad.addColorStop(.55, '#b07a3a'); grad.addColorStop(1, '#3a2410');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.moveTo(-g0, -2); ctx.lineTo(-g0 - L, -5); ctx.lineTo(-g0 - L, 5); ctx.lineTo(-g0, 2); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function drawGhost(ctx, g) {
  ctx.save(); ctx.globalAlpha = .75;
  ctx.fillStyle = g.valid ? '#f4f4f0' : '#e53935'; ctx.beginPath(); ctx.arc(g.x, g.y, R, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = g.valid ? '#fff' : '#ffb4b0'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.arc(g.x, g.y, R + 4, 0, TAU); ctx.stroke(); ctx.restore();
}
