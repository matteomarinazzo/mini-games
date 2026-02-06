import { ctx, canvas } from "./canvas.js";
import { updateGameData, gameData } from "../ctrl/mainCtrl.js";
import { camera, updateCamera } from "./camera.js";
import { mouse, getCameraMovement, isMobile, virtualJoystick } from "./inputs.js";
import { TILE_SIZE, paintGrass, dirtyTiles, snowFall } from "./terrain.js";
import {
  spawnSkierAtCursor,
  updateSkiers,
  drawSkiers,
} from "../entities/skier.js";
import { createSnowPattern } from "./textures.js";
import { disableSkierSpawningTemporarily } from "../ui/menu.js";
import { updateUI } from "../ui/informations.js";
import {
  spawnFloatingText,
  drawFloatingTexts,
  updateFloatingTexts,
} from "../entities/floatingTexts.js";
import { getCameraDirections, drawCameraHints } from "./cameraHints.js";
import { formatCoins } from "../../../../js/utils/formatNumber.js";
import { updateSnowflakeCount, snowflakes } from "../entities/snowflakes.js";
import {
  getSnowAmountPerTick,
  startWeatherSystem,
  getNumberSnowFlakes,
  updateWindStrength,
} from "../ctrl/weatherCtrl.js";

updateSnowflakeCount(getNumberSnowFlakes());
startWeatherSystem();

export const snowBackground = createSnowPattern(
  gameData.cols,
  gameData.rows,
  TILE_SIZE,
);

// État pour les instructions mobiles
let showMobileInstructions = isMobile;
let instructionsTimer = null;

export function startLoop() {
  // Masquer les instructions après 10 secondes
  if (isMobile) {
    instructionsTimer = setTimeout(() => {
      showMobileInstructions = false;
    }, 10000);
  }
  
  requestAnimationFrame(loop);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// =========================
// UPDATE
// =========================
function update() {
  if (gameData.isMenuOpen) {
    if (mouse.left || mouse.right) {
      gameData.isMenuOpen = false;
      document.getElementById("menuParams").style.display = "none";
      return;
    }
  }

  // === DÉPLACEMENT CAMÉRA (Desktop + Mobile) ===
  const cameraInput = getCameraMovement();
  camera.x += cameraInput.x * camera.speed;
  camera.y += cameraInput.y * camera.speed;

  updateCamera();

  // === PEINTURE DE L'HERBE (Déneiger) ===
  if (mouse.left) {
    const worldX = mouse.x + camera.x;
    const worldY = mouse.y + camera.y;

    const tx = Math.floor(worldX / TILE_SIZE);
    const ty = Math.floor(worldY / TILE_SIZE);

    const changedTiles = paintGrass(
      tx,
      ty,
      gameData.shovelSize - 1,
      snowBackground.getContext("2d"),
    );

    afficherFloatingText(changedTiles);
    
    // Masquer les instructions dès la première interaction
    if (showMobileInstructions) {
      showMobileInstructions = false;
      clearTimeout(instructionsTimer);
    }
  }

  // === SPAWN SKIEUR ===
  if (mouse.right && gameData.canSpawnSkiers == 1) {
    for (let i = 0; i < gameData.spawnRate; i++) {
      spawnSkierAtCursor();
      disableSkierSpawningTemporarily(i === 0);
      mouse.right = false;
    }
    
    // Masquer les instructions
    if (showMobileInstructions) {
      showMobileInstructions = false;
      clearTimeout(instructionsTimer);
    }
  }

  // === SYSTÈME MÉTÉO ===
  updateWindStrength();
  updateSnowflakeCount(getNumberSnowFlakes());

  for (let i = snowflakes.length - 1; i >= 0; i--) {
    const shouldRemove = snowflakes[i].update();
    if (shouldRemove) {
      snowflakes.splice(i, 1);
    }
  }

  updateSkiers();
  updateFloatingTexts();
  
  const sbCtx = snowBackground.getContext("2d");
  snowFall(getSnowAmountPerTick(), sbCtx);
  updateGameData();
}

// =========================
// DRAW
// =========================
function draw() {
  drawTerrain();
  drawSkiers(ctx, camera);
  const directions = getCameraDirections(camera, canvas, gameData);
  drawCameraHints(directions);
  
  // Ne pas dessiner le curseur sur mobile
  if (!isMobile) {
    drawCursor();
  }
  
  updateUI();
  drawFloatingTexts(ctx, camera);

  snowflakes.forEach((flake) => {
    flake.draw(ctx);
  });

  // Dessiner les contrôles mobiles
  if (isMobile) {
    drawCursor();
    drawMobileControls();
  }
}

// =========================
// DRAW TERRAIN
// =========================
function drawTerrain() {
  ctx.drawImage(
    snowBackground,
    camera.x,
    camera.y,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  dirtyTiles.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    ctx.fillRect(
      x * TILE_SIZE - camera.x,
      y * TILE_SIZE - camera.y,
      TILE_SIZE,
      TILE_SIZE,
    );
  });
  dirtyTiles.clear();
}

// =========================
// DRAW CURSEUR
// =========================
function drawCursor() {
  const worldX = mouse.x + camera.x;
  const worldY = mouse.y + camera.y;

  if (
    worldX < 0 ||
    worldX > gameData.worldWidth ||
    worldY < 0 ||
    worldY > gameData.worldHeight
  ) {
    return;
  }

  ctx.save();
  ctx.translate(mouse.x, mouse.y);
  ctx.rotate(mouse.angle + Math.PI / 2);
  ctx.drawImage(
    gameData.shovelImg,
    -gameData.shovelImg.width / 2,
    -gameData.shovelImg.height / 2,
  );
  ctx.restore();
}

// =========================
// CONTRÔLES MOBILES
// =========================
function drawMobileControls() {
  // Joystick virtuel
  if (virtualJoystick.active) {
    ctx.save();
    
    // Base du joystick (cercle extérieur)
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(virtualJoystick.centerX, virtualJoystick.centerY, virtualJoystick.maxRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Stick (cercle intérieur)
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.strokeStyle = "rgba(74, 159, 255, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(virtualJoystick.currentX, virtualJoystick.currentY, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Croix directionnelle au centre du stick
    ctx.strokeStyle = "rgba(74, 159, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(virtualJoystick.currentX - 12, virtualJoystick.currentY);
    ctx.lineTo(virtualJoystick.currentX + 12, virtualJoystick.currentY);
    ctx.moveTo(virtualJoystick.currentX, virtualJoystick.currentY - 12);
    ctx.lineTo(virtualJoystick.currentX, virtualJoystick.currentY + 12);
    ctx.stroke();
    
    ctx.restore();
  }
  
  // Zone du joystick (indicateur visuel quand inactif)
  if (!virtualJoystick.active && showMobileInstructions) {
    ctx.save();
    ctx.fillStyle = "rgba(74, 159, 255, 0.15)";
    ctx.strokeStyle = "rgba(74, 159, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    const joystickZoneSize = 150;
    ctx.fillRect(0, canvas.height - joystickZoneSize, joystickZoneSize, joystickZoneSize);
    ctx.strokeRect(0, canvas.height - joystickZoneSize, joystickZoneSize, joystickZoneSize);
    
    // Texte "Caméra"
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🎮 Caméra", joystickZoneSize / 2, canvas.height - joystickZoneSize / 2);
    
    ctx.restore();
  }
  
  // Instructions tactiles
  if (showMobileInstructions) {
    ctx.save();
    
    // Fond semi-transparent
    const padding = 15;
    const lineHeight = 22;
    const instructions = [
      "📱 Contrôles tactiles :",
      "• Tap court = Déneiger",
      "• Long press (500ms) = Skieur",
      "• 2 doigts = Skieur",
      "• Coin bas-gauche = Caméra"
    ];
    
    const boxWidth = 250;
    const boxHeight = instructions.length * lineHeight + padding * 2;
    const boxX = canvas.width - boxWidth - 20;
    const boxY = canvas.height - boxHeight - 170; // Au-dessus du joystick
    
    // Fond
    ctx.fillStyle = "rgba(44, 82, 130, 0.9)";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Bordure
    ctx.strokeStyle = "rgba(74, 159, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    
    // Texte
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.font = "13px Arial";
    ctx.textAlign = "left";
    
    instructions.forEach((text, i) => {
      const y = boxY + padding + (i + 1) * lineHeight - 5;
      
      if (i === 0) {
        ctx.font = "bold 14px Arial";
        ctx.fillText(text, boxX + padding, y);
        ctx.font = "13px Arial";
      } else {
        ctx.fillText(text, boxX + padding, y);
      }
    });
    
    ctx.restore();
  }
  
  
}

function afficherFloatingText(changedTiles) {
  if (changedTiles.length > 0) {
    const coins = changedTiles.length * gameData.ratioCoins;

    const avgX =
      changedTiles.reduce((s, t) => s + t.x, 0) / changedTiles.length;
    const avgY =
      changedTiles.reduce((s, t) => s + t.y, 0) / changedTiles.length;

    spawnFloatingText(
      avgX * TILE_SIZE + TILE_SIZE / 2,
      avgY * TILE_SIZE + TILE_SIZE / 2,
      `+${formatCoins(coins)}`,
    );
  }

  updateGameData();
}