import { ctx } from "../core/canvas.js";
import { updateGameData, gameData} from "../ctrl/mainCtrl.js";
import { camera } from "../core/camera.js";
import { mouse } from "../core/inputs.js";
import { clearSnowForSkier, TILE_SIZE } from "../core/terrain.js";
import { snowBackground } from "../core/loop.js";

export const skiers = [];
export const skierImg = new Image();
skierImg.src = "./ressources/img/skieur/skieur.png"; // chemin vers ton image

export class Skier {
  constructor(x, y, vx, vy, size = 20, speed = 6) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.size = size;
    this.speed = speed;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;

    // calcul de la position du skieur sur la grille
    const tx = Math.floor(this.x / TILE_SIZE);
    const ty = Math.floor(this.y / TILE_SIZE);

    clearSnowForSkier(tx, ty, this.size, snowBackground.getContext("2d")); // enlève la neige autour du skieur
    updateGameData();
  }

  draw(ctx, camera) {
  const centerX = this.x - camera.x;
  const centerY = this.y - camera.y;

  ctx.save();
  ctx.translate(centerX, centerY);

  // angle selon la direction du déplacement
  const angle = Math.atan2(this.vy, this.vx) + Math.PI / 2;

  ctx.rotate(angle);

  // dessine l'image centrée
  const scale = 3; // ajuste la taille
  ctx.drawImage(
    skierImg,
    -this.size * scale / 2,
    -this.size * scale / 2,
    this.size * scale,
    this.size * scale
  );

  ctx.restore();
}


  isOutOfWorld() {
    return (
      this.x < 0 || this.x > gameData.worldWidth || this.y < 0 || this.y > gameData.worldHeight
    );
  }
}

// fonction pour créer un skieur vers le curseur
export function spawnSkierAtCursor() {
  const worldX = mouse.x + camera.x;
  const worldY = mouse.y + camera.y;

  // spawn aléatoire sur un bord
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  switch (edge) {
    case 0:
      x = Math.random() * gameData.worldWidth;
      y = 0;
      break;
    case 1:
      x = Math.random() * gameData.worldWidth;
      y = gameData.worldHeight;
      break;
    case 2:
      x = 0;
      y = Math.random() * gameData.worldHeight;
      break;
    case 3:
      x = gameData.worldWidth;
      y = Math.random() * gameData.worldHeight;
      break;
  }

  // calcul de la direction vers le curseur
  const dx = worldX - x;
  const dy = worldY - y;
  const dist = Math.hypot(dx, dy);
  const speed = gameData.skierSpeed; // utilise la vitesse définie dans gameData
  const size = 20; // taille fixe pour l'instant
  const vx = (dx / dist) * speed;
  const vy = (dy / dist) * speed;

  skiers.push(new Skier(x, y, vx, vy, size, speed));
}

// update tous les skieurs
export function updateSkiers() {
  for (let i = skiers.length - 1; i >= 0; i--) {
    skiers[i].update();
    if (skiers[i].isOutOfWorld()) {
      skiers.splice(i, 1); // retire le skieur s'il sort
    }
  }
}

// draw tous les skieurs
export function drawSkiers(ctx, camera) {
  skiers.forEach((skier) => skier.draw(ctx, camera));
}
