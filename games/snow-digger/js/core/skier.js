/**
 * SNOW DIGGER — js/core/skier.js
 * Skieurs SVG qui traversent l'écran et déblaient la neige.
 */

import { digSnowSkier, TILE_SIZE } from './terrain.js';

const skiers = [];
let canvasW = 1, canvasH = 1;
let skierImg = null;
let skierSpeed = 4;

export function initSkiers(cw, ch, img) {
  canvasW = cw; canvasH = ch;
  skierImg = img;
}

export function setSkierSpeed(speed) {
  skierSpeed = speed;
}

// ── Spawner un skieur depuis un bord aléatoire ────────────────
export function spawnSkier() {
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  switch (edge) {
    case 0: x = Math.random() * canvasW; y = -30; break;
    case 1: x = Math.random() * canvasW; y = canvasH + 30; break;
    case 2: x = -30;          y = Math.random() * canvasH; break;
    case 3: x = canvasW + 30; y = Math.random() * canvasH; break;
  }

  // Direction vers le centre (avec légère déviation)
  const tx = canvasW / 2 + (Math.random() - 0.5) * canvasW * 0.6;
  const ty = canvasH / 2 + (Math.random() - 0.5) * canvasH * 0.6;
  const dx = tx - x, dy = ty - y;
  const dist = Math.hypot(dx, dy);
  const vx = (dx / dist) * skierSpeed;
  const vy = (dy / dist) * skierSpeed;

  skiers.push({ x, y, vx, vy, size: 20 });
}

// ── Update tous les skieurs ───────────────────────────────────
// Retourne le nombre total de tuiles déblayées ce tick
export function updateSkiers() {
  let clearedCount = 0;
  for (let i = skiers.length - 1; i >= 0; i--) {
    const s = skiers[i];
    s.x += s.vx;
    s.y += s.vy;

    // Déblayer la neige sous le skieur (largeur de traces ~ 22px)
    const c = digSnowSkier(s.x, s.y, 22);
    clearedCount += c;

    // Retirer si hors écran
    if (s.x < -60 || s.x > canvasW + 60 || s.y < -60 || s.y > canvasH + 60) {
      skiers.splice(i, 1);
    }
  }
  return clearedCount;
}

// ── Dessiner tous les skieurs ─────────────────────────────────
export function drawSkiers(ctx) {
  if (!skierImg) return;
  for (const s of skiers) {
    ctx.save();
    ctx.translate(s.x, s.y);
    const angle = Math.atan2(s.vy, s.vx) + Math.PI / 2;
    ctx.rotate(angle);
    const w = 28, h = 52;
    ctx.drawImage(skierImg, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

export function getSkierCount() { return skiers.length; }
