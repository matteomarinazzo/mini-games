import { gameData, updateGameData } from "../ctrl/mainCtrl.js";

import { createGrassPattern, createSnowPattern } from "./textures.js";

export const TILE_SIZE = gameData.tile_size; // taille d’une case
export const cols = gameData.cols;
export const rows = gameData.rows;

// grille du terrain : "snow" ou "grass"
export const terrain = gameData.terrain;

// ensemble des tiles "sales" à redessiner
export const dirtyTiles = new Set();

// créer un buffer de neige texturée au départ
export const snowBackground = document.createElement("canvas");
snowBackground.width = cols * TILE_SIZE;
snowBackground.height = rows * TILE_SIZE;
const snowCtx = snowBackground.getContext("2d");

// initialisation
for (let x = 0; x < cols; x++) {
  terrain[x] = [];
  for (let y = 0; y < rows; y++) {
    terrain[x][y] = "snow"; // chaque case commence en neige
  }
}

// fonction pour transformer une case en herbe
export function paintGrass(tx, ty, size, snowBackgroundCtx) {
  let clearedThisAction = 0; // compteur pour gagner des pièces
  let changedTiles = [];

  for (let dx = -size; dx <= size; dx++) {
    for (let dy = -size; dy <= size; dy++) {
      const x = tx + dx;
      const y = ty + dy;
      if (terrain[x] && terrain[x][y] === "snow") {
        terrain[x][y] = "grass";
        dirtyTiles.add(`${x},${y}`);
        changedTiles.push({ x, y });
        clearedThisAction++;

        // dessiner directement sur le fond
        if (snowBackgroundCtx) {
          snowBackgroundCtx.fillStyle = createGrassPattern(snowBackgroundCtx);
          snowBackgroundCtx.fillRect(
            x * TILE_SIZE,
            y * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
          );
        }
      }
    }
  }

  if (clearedThisAction > 0) {
    updateGameData(clearedThisAction);
  }

  return changedTiles;
}

// Fonction pour enlever la neige sous un skieur
export function clearSnowForSkier(tx, ty, size, snowBackgroundCtx) {
  // convertir la taille du skieur en nombre de tiles autour du centre
  const tileRadius = Math.ceil(size / TILE_SIZE / 2);
  let clearedThisAction = 0;

  for (let dx = -tileRadius; dx <= tileRadius; dx++) {
    for (let dy = -tileRadius; dy <= tileRadius; dy++) {
      const x = tx + dx;
      const y = ty + dy;

      if (terrain[x] && terrain[x][y] === "snow") {
        terrain[x][y] = "grass";
        dirtyTiles.add(`${x},${y}`);

        // dessiner directement sur le fond
        if (snowBackgroundCtx) {
          snowBackgroundCtx.fillStyle = createGrassPattern(snowBackgroundCtx);
          snowBackgroundCtx.fillRect(
            x * TILE_SIZE,
            y * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
          );
        }
      }
      clearedThisAction++;
    }
  }
  if (clearedThisAction > 0) {
    updateGameData(clearedThisAction);
  }
}

// Remplir petit à petit l'herbe par de la neige
export function snowFall(amount, snowBackgroundCtx) {
  if (!snowBackgroundCtx) return;

  // Assure-toi d'avoir une fonction createSnowPattern dans textures.js
  // ou utilise simplement du blanc pour tester :
  const snowPattern = "#ffffff";

  let filled = 0;
  const maxTries = amount * 10;
  let tries = 0;

  while (filled < amount && tries < maxTries) {
    const x = Math.floor(Math.random() * cols);
    const y = Math.floor(Math.random() * rows);

    // Si c'est de l'herbe, on remet de la neige
    if (terrain[x] && terrain[x][y] === "grass") {
      terrain[x][y] = "snow";

      // On dessine de la neige sur le canvas de fond
      snowBackgroundCtx.fillStyle = snowPattern;
      snowBackgroundCtx.fillRect(
        x * TILE_SIZE,
        y * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
      );
      if (Math.random() > 0.7) {
        snowBackgroundCtx.fillStyle = `rgba(230, 245, 255, ${Math.random() * 0.5})`;
        snowBackgroundCtx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }

      filled++;
    }
    tries++;
  }
}
