import { canvas } from "./canvas.js";
import { gameData } from "../ctrl/mainCtrl.js";

export const camera = {
  x: 0,
  y: 0,
  speed: 8
};

export function updateCamera() {
  const maxX = Math.max(0, gameData.worldWidth - canvas.width);
  const maxY = Math.max(0, gameData.worldHeight - canvas.height);

  camera.x = Math.max(0, Math.min(camera.x, maxX));
  camera.y = Math.max(0, Math.min(camera.y, maxY));
}

