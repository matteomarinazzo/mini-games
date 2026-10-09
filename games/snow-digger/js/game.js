/**
 * SNOW DIGGER — js/game.js
 * Point d'entrée principal : boucle de jeu, shop, floating texts, HUD.
 */

import { loadAllAssets } from './core/assets.js';
import { initTerrain, digSnow, getClearedPercent, getBgCanvas, TILE_SIZE } from './core/terrain.js';
import { initInput, pointer, getCameraInput, joystick, isMobile, getJoystickZone } from './core/input.js';
import { initSkiers, spawnSkier, updateSkiers, drawSkiers, setSkierSpeed } from './core/skier.js';
import { initSnowflakes, updateSnowflakes, drawSnowflakes, startWeather, updateWeather, isStorming } from './core/weather.js';
import { loadState, saveState, resetState, shovelCost, ratioCost, skierUnlockCost, spawnRateCost, spawnTimeCost, shovelWidth, coinRatio, skierCount, spawnCooldown, skierSpeed, SHOVEL_MAX, RATIO_MAX, SPAWN_RATE_MAX, SPAWN_TIME_MAX } from './core/state.js';

// ── Éléments DOM ──────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// HUD
const elCoins = document.getElementById('coins-val');
const elPct = document.getElementById('pct-val');
const elPctFill = document.getElementById('progressFill');
const elSkierPill = document.getElementById('skierPill');
const toastCont = document.getElementById('toastContainer');
const stormEl = document.getElementById('stormOverlay');
const camHints = document.querySelectorAll('.cam-arrow');

// Shop buttons
const shopCards = document.querySelectorAll('.shop-card');

// ── État global ───────────────────────────────────────────────
let state;
let assets;
let spawnCooldownLeft = 0;
let spawnInterval = null;
let lastSave = 0;

// Camera (pour grands écrans — optionnel)
const camera = { x: 0, y: 0, speed: 7 };

// Floating texts (DOM)
const floatingTexts = [];

// ── Bootstrap ─────────────────────────────────────────────────
async function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Charger les assets SVG
  assets = await loadAllAssets();

  // Charger la sauvegarde
  state = loadState();

  // Initialiser les systèmes
  initTerrain(canvas.width, canvas.height);
  initInput(canvas);
  initSkiers(canvas.width, canvas.height, assets.skier);
  initSnowflakes(canvas.width, canvas.height, assets.flakes);
  setSkierSpeed(skierSpeed(state));
  startWeather();

  // Initialiser le shop
  updateShopUI();
  bindShop();
  updateSkierPill();

  // Lancer la boucle
  requestAnimationFrame(loop);
}

// ── Resize ────────────────────────────────────────────────────
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ── Boucle principale ─────────────────────────────────────────
function loop(ts) {
  update(ts);
  draw();
  requestAnimationFrame(loop);
}

// ── Update ────────────────────────────────────────────────────
function update(ts) {
  // Camera
  const ci = getCameraInput();
  camera.x += ci.x * camera.speed;
  camera.y += ci.y * camera.speed;
  camera.x = Math.max(0, Math.min(camera.x, 0)); // monde = écran, pas de scroll
  camera.y = Math.max(0, Math.min(camera.y, 0));

  // Déneiger (clic/tap)
  if (pointer.digging) {
    const width = shovelWidth(state.shovelLevel);
    const cleared = digSnow(pointer.x, pointer.y, width);
    if (cleared > 0) {
      const earned = cleared * coinRatio(state);
      state.coins += earned;
      state.totalCleared += cleared;
      state.totalCoinsEarned += earned;
      spawnFloatingText(pointer.x, pointer.y, `+${fmt(earned)}`);
      updateHUD();
      updateShopUI();
      maybeSave(ts);
    }
  }

  // Spawn skieur
  if (pointer.spawnSkier) {
    pointer.spawnSkier = false;
    if (state.skierUnlocked && spawnCooldownLeft <= 0) {
      const n = skierCount(state);
      for (let i = 0; i < n; i++) spawnSkier();
      startSpawnCooldown();
      updateSkierPill();
    } else if (!state.skierUnlocked) {
      toast('🔒 Débloquez les skieurs d\'abord !', 'error');
    }
  }

  // Météo
  updateWeather();
  updateSnowflakes();

  // Skieurs update & gains
  const skierCleared = updateSkiers();
  if (skierCleared > 0) {
    const earned = skierCleared * coinRatio(state);
    state.coins += earned;
    state.totalCleared += skierCleared;
    state.totalCoinsEarned += earned;
    updateHUD();
    updateShopUI();
  }

  // Storm overlay
  stormEl.classList.toggle('storming', isStorming());

  // Floating texts
  updateFloatingTexts();

  // Camera hints
  updateCamHints();

  // Sauvegarde auto toutes les 30s
  if (ts - lastSave > 30_000) maybeSave(ts);
}

// ── Draw ──────────────────────────────────────────────────────
function draw() {
  // 1. Fond terrain (canvas offscreen)
  const bg = getBgCanvas();
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

  // 2. Skieurs
  drawSkiers(ctx);

  // 3. Flocons
  drawSnowflakes(ctx);

  // 4. Curseur pelle (toujours sur desktop, ou sur mobile en creusant)
  if (!isMobile || pointer.digging) drawShovelCursor();

  // 5. Joystick (mobile)
  if (isMobile && joystick.active) drawJoystick();
}

// ── Curseur pelle ─────────────────────────────────────────────
function drawShovelCursor() {
  const img = assets.shovels[state.shovelLevel - 1];
  if (!img) return;
  const w = shovelWidth(state.shovelLevel);
  const h = img.height || img.naturalHeight || 80;
  ctx.save();
  ctx.translate(pointer.x, pointer.y);
  ctx.rotate(pointer.angle + Math.PI / 2);
  // Center the blade vertically at the cursor
  const bladeCenterY = h * 0.22;
  ctx.drawImage(img, -w / 2, -bladeCenterY, w, h);
  ctx.restore();
}

// ── Joystick visuel ───────────────────────────────────────────
function drawJoystick() {
  const { centerX, centerY, currentX, currentY, maxRadius } = joystick;
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = 'rgba(74,159,255,0.8)';
  ctx.fillStyle = 'rgba(74,159,255,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(currentX, currentY, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Floating texts ────────────────────────────────────────────
function spawnFloatingText(x, y, text) {
  const el = document.createElement('div');
  el.className = 'float-txt';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y - 20}px`;
  document.body.appendChild(el);
  floatingTexts.push({ el, born: performance.now() });
}

function updateFloatingTexts() {
  const now = performance.now();
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    if (now - floatingTexts[i].born > 1000) {
      floatingTexts[i].el.remove();
      floatingTexts.splice(i, 1);
    }
  }
}

// ── HUD ───────────────────────────────────────────────────────
function updateHUD() {
  elCoins.textContent = fmt(state.coins);
  const pct = getClearedPercent();
  elPct.textContent = pct + '%';
  elPctFill.style.width = pct + '%';
}

function updateSkierPill() {
  if (!state.skierUnlocked) {
    elSkierPill.textContent = '🔒 Skieurs non débloqués';
    elSkierPill.className = '';
  } else if (spawnCooldownLeft > 0) {
    elSkierPill.textContent = `⏳ Recharge ${spawnCooldownLeft}s`;
    elSkierPill.className = 'recharge';
  } else {
    const n = skierCount(state);
    elSkierPill.textContent = `🎿 ${n} skieur${n > 1 ? 's' : ''} prêt${n > 1 ? 's' : ''}`;
    elSkierPill.className = 'active';
  }
}

// ── Camera hints ──────────────────────────────────────────────
function updateCamHints() {
  // Le monde est la taille de l'écran, pas de scroll → masquer tout
  camHints.forEach(a => a.style.display = 'none');
}

// ── Spawn cooldown ────────────────────────────────────────────
function startSpawnCooldown() {
  const cd = spawnCooldown(state);
  if (cd <= 0) return;
  spawnCooldownLeft = Math.round(cd);
  clearInterval(spawnInterval);
  spawnInterval = setInterval(() => {
    spawnCooldownLeft--;
    updateSkierPill();
    if (spawnCooldownLeft <= 0) {
      clearInterval(spawnInterval);
      spawnInterval = null;
    }
  }, 1000);
}

// ── Shop ──────────────────────────────────────────────────────
function bindShop() {
  document.getElementById('btn-shovel').addEventListener('click', () => {
    const cost = shovelCost(state.shovelLevel);
    if (cost === null) return toast('Niveau MAX !', 'error');
    if (state.coins < cost) return toast('Pas assez de pièces 💰', 'error');
    state.coins -= cost;
    state.shovelLevel++;
    saveState(state);
    updateHUD(); updateShopUI();
    toast(`🛠️ Pelle niveau ${state.shovelLevel} !`, 'success');
  });

  document.getElementById('btn-ratio').addEventListener('click', () => {
    const cost = ratioCost(state.ratioLevel);
    if (cost === null) return toast('Gains MAX !', 'error');
    if (state.coins < cost) return toast('Pas assez de pièces 💰', 'error');
    state.coins -= cost;
    state.ratioLevel++;
    saveState(state);
    updateHUD(); updateShopUI();
    toast('💰 Gains améliorés !', 'success');
  });

  document.getElementById('btn-skier-unlock').addEventListener('click', () => {
    if (state.skierUnlocked) return;
    const cost = skierUnlockCost();
    if (state.coins < cost) return toast('Pas assez de pièces 💰', 'error');
    state.coins -= cost;
    state.skierUnlocked = true;
    saveState(state);
    updateHUD(); updateShopUI(); updateSkierPill();
    toast('🎿 Skieurs débloqués !', 'success');
  });

  document.getElementById('btn-spawn-rate').addEventListener('click', () => {
    if (!state.skierUnlocked) return toast('Débloquez d\'abord les skieurs !', 'error');
    const cost = spawnRateCost(state.spawnRateLevel);
    if (cost === null) return toast('MAX atteint !', 'error');
    if (state.coins < cost) return toast('Pas assez de pièces 💰', 'error');
    state.coins -= cost;
    state.spawnRateLevel++;
    saveState(state);
    updateHUD(); updateShopUI();
    toast(`🎿 ${skierCount(state)} skieurs max !`, 'success');
  });

  document.getElementById('btn-spawn-time').addEventListener('click', () => {
    if (!state.skierUnlocked) return toast('Débloquez d\'abord les skieurs !', 'error');
    const cost = spawnTimeCost(state.spawnTimeLevel);
    if (cost === null) return toast('MAX atteint !', 'error');
    if (state.coins < cost) return toast('Pas assez de pièces 💰', 'error');
    state.coins -= cost;
    state.spawnTimeLevel++;
    setSkierSpeed(skierSpeed(state));
    saveState(state);
    updateHUD(); updateShopUI();
    toast(`⚡ Recharge réduite à ${spawnCooldown(state)}s !`, 'success');
  });
}

function updateShopUI() {
  setCard('btn-shovel', shovelCost(state.shovelLevel), state.shovelLevel >= SHOVEL_MAX, `Pelle Niv.${state.shovelLevel}`);
  setCard('btn-ratio', ratioCost(state.ratioLevel), state.ratioLevel >= RATIO_MAX, 'Gains');

  const btnSkierUnlock = document.getElementById('btn-skier-unlock');
  const btnSpawnRate = document.getElementById('btn-spawn-rate');
  const btnSpawnTime = document.getElementById('btn-spawn-time');
  const shopSep = document.querySelector('.shop-sep');

  if (!state.skierUnlocked) {
    if (btnSkierUnlock) btnSkierUnlock.style.display = 'flex';
    if (btnSpawnRate) btnSpawnRate.style.display = 'none';
    if (btnSpawnTime) btnSpawnTime.style.display = 'none';
    if (shopSep) shopSep.style.display = 'none';
    setCard('btn-skier-unlock', skierUnlockCost(), false, 'Débloquer skieurs');
  } else {
    if (btnSkierUnlock) btnSkierUnlock.style.display = 'none';
    if (btnSpawnRate) btnSpawnRate.style.display = 'flex';
    if (btnSpawnTime) btnSpawnTime.style.display = 'flex';
    if (shopSep) shopSep.style.display = 'block';
    setCard('btn-spawn-rate', spawnRateCost(state.spawnRateLevel), state.spawnRateLevel >= SPAWN_RATE_MAX, 'Nb. skieurs');
    setCard('btn-spawn-time', spawnTimeCost(state.spawnTimeLevel), state.spawnTimeLevel >= SPAWN_TIME_MAX, 'Vitesse spawn');
  }

  // Mettre à jour le badge niveau pelle
  const badge = document.querySelector('#btn-shovel .shop-level-badge');
  if (badge) badge.textContent = `Niv.${state.shovelLevel}`;

  // Mettre à jour l'icône pelle selon le niveau
  const shovelIcon = document.querySelector('#btn-shovel .shop-icon');
  if (shovelIcon && assets) {
    const img = assets.shovels[state.shovelLevel - 1];
    if (img) {
      const bitmapUrl = bitmapToDataUrl(img);
      shovelIcon.innerHTML = `<img src="${bitmapUrl}" style="width:100%;height:100%;object-fit:contain">`;
    }
  }
}

function setCard(id, cost, isMax, label) {
  const card = document.getElementById(id);
  if (!card) return;
  const costEl = card.querySelector('.shop-cost');
  if (!costEl) return;
  card.classList.remove('locked', 'maxed', 'affordable');
  if (isMax || cost === null) {
    costEl.className = 'shop-cost max-txt';
    costEl.textContent = 'MAX';
    card.classList.add('maxed');
  } else if (state.coins >= cost) {
    costEl.className = 'shop-cost';
    costEl.textContent = `💰 ${fmt(cost)}`;
    card.classList.add('affordable');
  } else {
    costEl.className = 'shop-cost cant-afford';
    costEl.textContent = `💰 ${fmt(cost)}`;
    card.classList.add('locked');
  }
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastCont.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

// ── Format pièces ─────────────────────────────────────────────
function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return Math.floor(n).toString();
}

// ── Sauvegarde ────────────────────────────────────────────────
function maybeSave(ts) {
  saveState(state);
  lastSave = ts;
}

// ── Util : bitmap → data URL pour affichage en <img> ─────────
function bitmapToDataUrl(bitmapOrImg) {
  if (bitmapOrImg instanceof HTMLImageElement) return bitmapOrImg.src;
  // ImageBitmap → canvas temporaire
  const tmp = document.createElement('canvas');
  tmp.width = bitmapOrImg.width; tmp.height = bitmapOrImg.height;
  tmp.getContext('2d').drawImage(bitmapOrImg, 0, 0);
  return tmp.toDataURL();
}

// ── Event Listeners (Rules) ───────────────────────────────────
const rulesBtn = document.getElementById('rulesBtn');
const rulesOverlay = document.getElementById('rulesOverlay');
const closeRulesBtn = document.getElementById('closeRulesBtn');
if (rulesBtn) rulesBtn.addEventListener('click', () => rulesOverlay.style.display = 'flex');
if (closeRulesBtn) closeRulesBtn.addEventListener('click', () => rulesOverlay.style.display = 'none');

// ── Démarrage ─────────────────────────────────────────────────
boot().catch(console.error);
