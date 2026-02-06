import { initFullscreenSystem } from '../../../../js/fullScreen.js';

const WORLD_WIDTH = window.innerWidth;
const WORLD_HEIGHT = window.innerHeight;
const TILE_SIZE = 5; // taille d’une case
// calcul des colonnes et lignes
const COLS = Math.ceil(WORLD_WIDTH / TILE_SIZE);
const ROWS = Math.ceil(WORLD_HEIGHT / TILE_SIZE);
const TERRAIN = [];
const SHOVELIMG = new Image();
SHOVELIMG.src = "./ressources/img/pelles/niv1.png";

window.addEventListener('DOMContentLoaded', () => {
  initFullscreenSystem();
});

document.getElementById("terrainWidth").value = WORLD_WIDTH
document.getElementById("terrainHeight").value = WORLD_HEIGHT

export const gameData = {
  shovelSize: 1,
  shovelImg: SHOVELIMG,
  ratioCoins: 0.1, // 10 tuiles = 1 pièce
  coins: 0,
  infiniteCoins: false,
  canSpawnSkiers: -1,
  skierSpeed: 6,
  spawnRate: 1, // skieurs par intervalle
  spawnTime: 30, // intervalle en secondes
  spawnCooldownLeft: 0, // temps restant (affichage)
  tile_size: TILE_SIZE,
  cols: COLS,
  rows: ROWS,
  percentTransformed: 0.0,
  totalTiles: COLS * ROWS,
  terrain: TERRAIN,
  worldWidth: WORLD_WIDTH,
  worldHeight: WORLD_HEIGHT,
  tilesTransformed: 0, // total tiles transformées
  totalClearedTiles: 0, // cumul à vie
  tilesCountedForCoins: 0, // tiles déjà converties en pièces
  isMenuOpen: false,
  isSnowStorm: false,

};

// calcul du pourcentage de terrain transformé
export function updateGameData(newlyClearedTiles = 0) {
  if (newlyClearedTiles > 0) {
    gameData.totalClearedTiles += newlyClearedTiles;
    gameData.coins += newlyClearedTiles * gameData.ratioCoins;
  }

  // stats VISUELLES uniquement
  let totalTransformed = 0;
  for (let x = 0; x < gameData.cols; x++) {
    for (let y = 0; y < gameData.rows; y++) {
      if (gameData.terrain[x][y] === "grass") totalTransformed++;
    }
  }

  gameData.tilesTransformed = totalTransformed;
  gameData.percentTransformed = (
    (totalTransformed / gameData.totalTiles) *
    100
  ).toFixed(1);
}