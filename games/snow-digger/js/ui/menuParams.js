import { gameData} from "../ctrl/mainCtrl.js";
import { terrain, dirtyTiles, TILE_SIZE } from "../core/terrain.js";
import { snowBackground } from "../core/loop.js";
import { updateCamera } from "../core/camera.js";
import { updateHUD } from "./menu.js";

/* =========================================================
   RÉCUPÉRATION DES ÉLÉMENTS DOM
========================================================= */

// Boutons home / settings
const homeBtn = document.getElementById("homeBtn");
const settingsBtn = document.getElementById("settingsBtn");
const menuParams = document.getElementById("menuParams");
const fullscreenBtn = document.getElementById("fullscreenBtn")

// Inputs paramètres
const terrainWidthInput = document.getElementById("terrainWidth");
const terrainHeightInput = document.getElementById("terrainHeight");
const applyTerrainBtn = document.getElementById("applyTerrainSize");

const shovelSizeInput = document.getElementById("shovelSize");
const skierSpeedInput = document.getElementById("skierSpeed");
const coinRatioInput = document.getElementById("coinRatio");
const spawnTimeInput = document.getElementById("spawnTime");
const spawnRateInput = document.getElementById("spawnRate");
const infiniteCoinsInput = document.getElementById("infiniteCoins");

/* =========================================================
   FONCTIONS HANDLERS (lisibles et séparées)
========================================================= */

function onGoHome() {
  window.location.href = "../../index.html";
}

function onToggleSettings() {
    gameData.isMenuOpen = !gameData.isMenuOpen;
    menuParams.style.display = gameData.isMenuOpen ? "block" : "none";
}

function onApplyTerrainSize() {
  const newWidth = Math.min(
    Math.max(+terrainWidthInput.value, window.innerWidth),
    20000,
  );
  const newHeight = Math.min(
    Math.max(+terrainHeightInput.value, window.innerHeight),
    20000,
  );

  gameData.worldWidth = newWidth;
  gameData.worldHeight = newHeight;

  gameData.cols = Math.ceil(newWidth / TILE_SIZE);
  gameData.rows = Math.ceil(newHeight / TILE_SIZE);
  gameData.totalTiles = gameData.cols * gameData.rows;

  // Recréer le terrain
  for (let x = 0; x < gameData.cols; x++) {
    terrain[x] = [];
    for (let y = 0; y < gameData.rows; y++) {
      terrain[x][y] = "snow";
    }
  }
  dirtyTiles.clear();

  // Recréer le fond
  snowBackground.width = gameData.cols * TILE_SIZE;
  snowBackground.height = gameData.rows * TILE_SIZE;

  const bctx = snowBackground.getContext("2d");
  bctx.clearRect(0, 0, snowBackground.width, snowBackground.height);
  bctx.fillStyle = "#ffffff";
  bctx.fillRect(0, 0, snowBackground.width, snowBackground.height);
  updateCamera();

  console.log("Taille du terrain appliquée :",gameData.worldWidth,gameData.worldHeight,);
}

/* =========================================================
   LISTENERS (structure claire et lisible)
========================================================= */

// Navigation
homeBtn.addEventListener("click", () => onGoHome());
settingsBtn.addEventListener("click", () => onToggleSettings());

// Paramètres terrain
applyTerrainBtn.addEventListener("click", () => onApplyTerrainSize());

// Paramètres gameplay (inputs directs)
shovelSizeInput.addEventListener("input", () => {
  if (+shovelSizeInput.value > +shovelSizeInput.max) {
    shovelSizeInput.value = shovelSizeInput.max;
  }
  gameData.shovelSize = +shovelSizeInput.value;
  updateHUD();
});

skierSpeedInput.addEventListener("input", () => {
  if (+skierSpeedInput.value > +skierSpeedInput.max) {
    skierSpeedInput.value = skierSpeedInput.max;
  }
  gameData.skierSpeed = Math.min(skierSpeedInput.max, +skierSpeedInput.value);
  updateHUD();
});

coinRatioInput.addEventListener("input", () => {
  if (+coinRatioInput.value > +coinRatioInput.max) {
    coinRatioInput.value = coinRatioInput.max;
  }
  gameData.ratioCoins = +coinRatioInput.value;
  updateHUD();
});

spawnTimeInput.addEventListener("input", () => {
  if (+spawnTimeInput.value > +spawnTimeInput.max) {
    spawnTimeInput.value = spawnTimeInput.max;
  }
  gameData.spawnTime = Math.max(+spawnTimeInput.value, 5);
  updateHUD();
});

spawnRateInput.addEventListener("input", () => {
  if (+spawnRateInput.value > +spawnRateInput.max) {
    spawnRateInput.value = spawnRateInput.max;
  }
  gameData.spawnRate = +spawnRateInput.value;
  updateHUD();
});

infiniteCoinsInput.addEventListener("change", () => {
  gameData.infiniteCoins = infiniteCoinsInput.checked;
  if (gameData.infiniteCoins) {
    gameData.coins = Infinity;
  } else {
    gameData.coins = 0;
  }
  updateHUD();
});

/* =========================================================
   BLOQUER LA PROPAGATION (1 SEULE FOIS)
========================================================= */

const inputsUI = [
  homeBtn,
  settingsBtn,
  menuParams,
  fullscreenBtn,

  terrainWidthInput,
  terrainHeightInput,
  applyTerrainBtn,
  shovelSizeInput,
  skierSpeedInput,
  coinRatioInput,
  spawnTimeInput,
  spawnRateInput,
  infiniteCoinsInput,
];

["mousedown", "mouseup", "pointerdown", "pointerup"].forEach((eventType) => {
  inputsUI.forEach((el) => {
    el.addEventListener(eventType, (e) => e.stopPropagation(), {
      capture: true,
    });
  });
});
