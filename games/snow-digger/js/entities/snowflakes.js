import { gameData } from "../ctrl/mainCtrl.js";
import { canvas } from "../core/canvas.js";
import { getSnowSwing, getSnowSpeed } from "../ctrl/weatherCtrl.js";

export const snowflakeImages = [];
for (let i = 1; i <= 10; i++) {
  const img = new Image();
  img.src = `./ressources/img/flocons/flocon${i}.png`;
  snowflakeImages.push(img);
}

export class Snowflake {
  constructor(x, y, size, speed, img) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.baseSpeed = speed; // Vitesse de base
    this.speed = speed;
    this.img = img;
    this.wind = 0; // Mis à jour chaque frame
    this.isDead = false;
    this.opacity = 1; // Pour fade out smooth
    
    // Petite variation pour rendre plus naturel
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleSpeed = 0.02 + Math.random() * 0.03;
  }

  update() {
    // Mise à jour du vent CHAQUE FRAME pour mouvement fluide
    this.wind = getSnowSwing();
    this.speed = getSnowSpeed(this.baseSpeed);
    
    // Mouvement vertical
    this.y += this.speed;
    
    // Mouvement horizontal (vent + petit wobble naturel)
    this.wobble += this.wobbleSpeed;
    const wobbleOffset = Math.sin(this.wobble) * 0.3;
    this.x += this.wind + wobbleOffset;
    
    // Fade out progressif si marqué pour mort
    if (this.isDead) {
      this.opacity -= 0.02;
      if (this.opacity <= 0) {
        return true; // Suppression
      }
    }

    // Gestion des bords de l'écran
    if (this.y > canvas.height + this.size) {
      if (this.isDead) {
        return true; // Suppression définitive
      } else {
        // Reset en haut
        this.y = -this.size;
        this.x = Math.random() * canvas.width;
        this.wobble = Math.random() * Math.PI * 2;
      }
    }
    
    // Si sort par les côtés, le faire réapparaître de l'autre côté
    if (this.x < -this.size) this.x = canvas.width + this.size;
    if (this.x > canvas.width + this.size) this.x = -this.size;
    
    return false;
  }

  draw(ctx) {
    if (this.opacity < 1) {
      ctx.globalAlpha = this.opacity;
    }
    ctx.drawImage(this.img, this.x, this.y, this.size, this.size);
    if (this.opacity < 1) {
      ctx.globalAlpha = 1; // Reset
    }
  }
}

export const snowflakes = [];

// Mise à jour progressive du nombre de flocons
export function updateSnowflakeCount(targetCount) {
  const currentCount = snowflakes.length;

  // AJOUT progressif (max 50 flocons par frame pour éviter les pics)
  if (targetCount > currentCount) {
    const toAdd = Math.min(50, targetCount - currentCount);
    
    for (let i = 0; i < toAdd; i++) {
      const x = Math.random() * canvas.width;
      
      // Spawn au-dessus de l'écran pour apparition naturelle
      const y = -(Math.random() * canvas.height * 0.5);
      
      const size = 5 + Math.random() * 15;
      const speed = 0.5 + Math.random() * 1.5;
      const img = snowflakeImages[Math.floor(Math.random() * snowflakeImages.length)];
      
      snowflakes.push(new Snowflake(x, y, size, speed, img));
    }
  } 
  
  // RETRAIT progressif avec fade out
  else if (targetCount < currentCount) {
    let toKill = Math.min(50, currentCount - targetCount);
    
    for (let i = 0; i < snowflakes.length && toKill > 0; i++) {
      if (!snowflakes[i].isDead) {
        snowflakes[i].isDead = true;
        toKill--;
      }
    }
  }
}