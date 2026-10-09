/**
 * SNOW DIGGER — js/core/weather.js
 * Système météo : tempêtes de neige périodiques, flocons visuels.
 */

import { snowFall } from './terrain.js';

// ── État tempête ──────────────────────────────────────────────
let isStorm = false;
let stormTimeout = null;
let windStrength = 0;       // 0..1 (interpolé doucement)
let targetWind   = 0;

export function isStorming() { return isStorm; }
export function getWindStrength() { return windStrength; }

export function startWeather() {
  scheduleNextStorm();
}

function scheduleNextStorm() {
  const delay = rand(90_000, 180_000); // 1.5 à 3 min
  setTimeout(beginStorm, delay);
}

function beginStorm() {
  isStorm = true;
  targetWind = 1;
  // Durée : 10 à 30s
  stormTimeout = setTimeout(endStorm, rand(10_000, 30_000));
}

function endStorm() {
  isStorm = false;
  targetWind = 0;
  scheduleNextStorm();
}

function rand(min, max) { return Math.random() * (max - min) + min; }

// ── Mise à jour chaque frame ──────────────────────────────────
export function updateWeather() {
  windStrength += (targetWind - windStrength) * 0.015;

  // Quantité de neige qui retombe sur le terrain
  const snowAmount = isStorm ? 200 : 3;
  snowFall(snowAmount);
}

// ── Flocons visuels ───────────────────────────────────────────
const flakes = [];
let canvasW = 1, canvasH = 1;
let flakeImages = [];

export function initSnowflakes(canvasWidth, canvasHeight, images) {
  canvasW = canvasWidth;
  canvasH = canvasHeight;
  flakeImages = images;
  // Créer un pool initial
  const count = 280;
  for (let i = 0; i < count; i++) addFlake(true);
}

function addFlake(randomY = false) {
  flakes.push({
    x:     Math.random() * canvasW,
    y:     randomY ? Math.random() * canvasH : -20,
    size:  4 + Math.random() * 14,
    speed: 0.4 + Math.random() * 1.2,
    wobble:     Math.random() * Math.PI * 2,
    wobbleSpd:  0.02 + Math.random() * 0.03,
    opacity:    0.4 + Math.random() * 0.55,
    img:   flakeImages[Math.floor(Math.random() * flakeImages.length)],
    dead: false,
  });
}

export function updateSnowflakes() {
  const target = isStorm ? 700 : 280;
  // Ajuster le nombre
  while (flakes.length < target) addFlake(false);
  if (flakes.length > target + 60) {
    flakes.splice(target, flakes.length - target);
  }

  const windDrift = windStrength * 2.5;

  for (let i = flakes.length - 1; i >= 0; i--) {
    const f = flakes[i];
    f.wobble += f.wobbleSpd;
    f.y += f.speed + windStrength * 0.5;
    f.x += Math.sin(f.wobble) * 0.4 + windDrift;

    // Bords
    if (f.x < -30) f.x = canvasW + 20;
    if (f.x > canvasW + 30) f.x = -20;

    // Bas → reset en haut
    if (f.y > canvasH + 20) {
      f.y = -10;
      f.x = Math.random() * canvasW;
    }
  }
}

export function drawSnowflakes(ctx) {
  ctx.save();
  for (const f of flakes) {
    ctx.globalAlpha = f.opacity * (0.5 + windStrength * 0.5);
    ctx.drawImage(f.img, f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function getFlakes() { return flakes; }
