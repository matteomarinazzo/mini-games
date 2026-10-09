/**
 * SNOW DIGGER — js/core/terrain.js
 * Grille de terrain (neige/herbe), rendu optimisé sur canvas offscreen.
 * TILE_SIZE = 8px → performance bien meilleure que 5px original.
 */

export const TILE_SIZE = 8;
export const SNOW = 0;
export const GRASS = 1;

let cols, rows, grid; // Uint8Array flat

// Canvas offscreen pour le fond (ne redessine que les tiles dirty)
let bgCanvas, bgCtx;

// Couleurs pré-calculées pour herbe (aléatoires au init, fixes ensuite)
const GRASS_COLORS = ['#4a8c35','#3d7a2b','#518f3a','#466030','#5a9640'];

// ── Initialisation ─────────────────────────────────────────────
export function initTerrain(canvasWidth, canvasHeight) {
  cols = Math.ceil(canvasWidth  / TILE_SIZE);
  rows = Math.ceil(canvasHeight / TILE_SIZE);
  grid = new Uint8Array(cols * rows); // 0=snow, 1=grass (tout à snow au départ)

  bgCanvas     = document.createElement('canvas');
  bgCanvas.width  = cols * TILE_SIZE;
  bgCanvas.height = rows * TILE_SIZE;
  bgCtx = bgCanvas.getContext('2d');

  drawAllSnow();
  return { cols, rows };
}

// ── Accès à la grille ──────────────────────────────────────────
export function getGrid()    { return grid; }
export function getCols()    { return cols; }
export function getRows()    { return rows; }
export function getBgCanvas(){ return bgCanvas; }

function idx(x, y) { return y * cols + x; }

function inBounds(x, y) {
  return x >= 0 && x < cols && y >= 0 && y < rows;
}

// ── Dessin initial de toute la neige ──────────────────────────
function drawAllSnow() {
  bgCtx.fillStyle = '#e8f4fd';
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

  // Variations de texture neige
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (Math.random() > 0.75) {
        const alpha = Math.random() * 0.18;
        bgCtx.fillStyle = `rgba(140,190,240,${alpha})`;
        bgCtx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
      if (Math.random() > 0.94) {
        bgCtx.fillStyle = 'rgba(255,255,255,0.7)';
        const sx = x * TILE_SIZE + Math.random() * TILE_SIZE;
        const sy = y * TILE_SIZE + Math.random() * TILE_SIZE;
        bgCtx.fillRect(sx, sy, 2, 2);
      }
    }
  }
}

// ── Peindre une tile en herbe ─────────────────────────────────
function paintGrassTile(x, y) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const base = GRASS_COLORS[Math.floor(Math.random() * GRASS_COLORS.length)];
  bgCtx.fillStyle = base;
  bgCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  // Brin d'herbe simple
  bgCtx.strokeStyle = `rgba(90,200,60,${0.3 + Math.random() * 0.4})`;
  bgCtx.lineWidth = 1;
  bgCtx.beginPath();
  const bx = px + Math.random() * TILE_SIZE;
  bgCtx.moveTo(bx, py + TILE_SIZE);
  bgCtx.lineTo(bx + (Math.random()-0.5)*2, py + TILE_SIZE*0.3);
  bgCtx.stroke();
}

// ── Peindre une tile en neige ─────────────────────────────────
function paintSnowTile(x, y) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  bgCtx.fillStyle = '#e8f4fd';
  bgCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  if (Math.random() > 0.75) {
    bgCtx.fillStyle = `rgba(140,190,240,${Math.random() * 0.15})`;
    bgCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }
}

// ── Déneiger une zone selon la largeur exacte en pixels ────────
// Retourne le nombre de tuiles nouvellement déblayées
export function digSnow(px, py, widthPx) {
  // Rétrocompatibilité : si appelé en coordonnées tuiles (valeurs entières faibles)
  if (widthPx < 10 && px < cols && py < rows && Number.isInteger(px) && Number.isInteger(py)) {
    px = (px + 0.5) * TILE_SIZE;
    py = (py + 0.5) * TILE_SIZE;
    widthPx = Math.max(16, (2 * widthPx + 1) * TILE_SIZE);
  }

  const r = widthPx / 2;
  const rSq = r * r;
  const minTx = Math.max(0, Math.floor((px - r) / TILE_SIZE));
  const maxTx = Math.min(cols - 1, Math.floor((px + r) / TILE_SIZE));
  const minTy = Math.max(0, Math.floor((py - r) / TILE_SIZE));
  const maxTy = Math.min(rows - 1, Math.floor((py + r) / TILE_SIZE));

  let cleared = 0;
  for (let ty = minTy; ty <= maxTy; ty++) {
    const tileCy = (ty + 0.5) * TILE_SIZE;
    const dy = tileCy - py;
    const dySq = dy * dy;
    for (let tx = minTx; tx <= maxTx; tx++) {
      const tileCx = (tx + 0.5) * TILE_SIZE;
      const dx = tileCx - px;
      if (dx * dx + dySq <= rSq) {
        const i = idx(tx, ty);
        if (grid[i] === SNOW) {
          grid[i] = GRASS;
          paintGrassTile(tx, ty);
          cleared++;
        }
      }
    }
  }
  return cleared;
}

// ── Déneiger sous un skieur (largeur ~ 22px) ───────────────────
export function digSnowSkier(px, py, widthPx = 22) {
  return digSnow(px, py, widthPx);
}

// ── Neige qui retombe (re-couvre quelques tiles herbe → neige) ─
export function snowFall(amount) {
  let filled = 0;
  const maxTries = amount * 8;
  let tries = 0;
  while (filled < amount && tries < maxTries) {
    const x = Math.floor(Math.random() * cols);
    const y = Math.floor(Math.random() * rows);
    const i = idx(x, y);
    if (grid[i] === GRASS) {
      grid[i] = SNOW;
      paintSnowTile(x, y);
      filled++;
    }
    tries++;
  }
}

// ── Calcul pourcentage déblayé ────────────────────────────────
export function getClearedPercent() {
  let cleared = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === GRASS) cleared++;
  }
  return (cleared / grid.length * 100).toFixed(1);
}

export function getTotalTiles() { return grid.length; }
