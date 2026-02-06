export const floatingTexts = [];

export function spawnFloatingText(x, y, value) {
  floatingTexts.push({
    x,
    y,
    value,          // "ex: +1c"
    life: 60,       // temps d'animation (~1s)
    vy: -0.4,       // vitesse vers le haut
    alpha: 1,
  });
}

export function updateFloatingTexts() {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const t = floatingTexts[i];
    t.y += t.vy;
    t.life--;
    t.alpha = t.life / 60;

    if (t.life <= 0) {
      floatingTexts.splice(i, 1);
    }
  }
}

export function drawFloatingTexts(ctx, camera) {
  ctx.save();
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  floatingTexts.forEach(t => {
    ctx.globalAlpha = t.alpha;
    ctx.fillStyle = "#222";
    ctx.fillText(
      t.value,
      t.x - camera.x,
      t.y - camera.y
    );
  });

  ctx.restore();
}