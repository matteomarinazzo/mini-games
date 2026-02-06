import { Ball } from "../engine/ball.js";

/** 9-ball : 1 blanche + 9 billes numérotées. On doit toucher la plus basse en premier. Gagner = empocher la 9. */
export const nineball = {
  id: "9-ball",
  name: "9-ball",
  description: "Touchez la bille au numéro le plus bas en premier. Empochez la 9 pour gagner.",

  /** Nombre total de billes (blanche + numérotées) */
  ballCount: 10,

  /** Crée les billes en triangle (9) + blanche */
  createBalls() {
    const balls = [];
    const r = Ball.RADIUS_TABLE;
    const cx = 0.25;
    const cy = 0.5;
    const spacing = r * 2.2;
    const positions = [
      [0, 0],
      [1, -0.5], [1, 0.5],
      [2, -1], [2, 0], [2, 1],
      [3, -1.5], [3, -0.5], [3, 0.5], [3, 1.5],
    ];
    for (let i = 0; i < 9; i++) {
      const [row, col] = positions[i];
      const x = cx + col * spacing;
      const y = cy + row * spacing;
      balls.push(new Ball(x, y, i + 1, "nine"));
    }
    balls.push(new Ball(0.75, 0.5, 0, "cue"));
    return balls;
  },

  /** Vérifie la victoire : la 9 est empochée */
  checkWin(balls) {
    const nine = balls.find((b) => b.number === 9);
    return nine && nine.inPocket;
  },

  /** Vérifie la défaite (9 empochée au mauvais moment = perte, on ne gère pas les fautes pour l’instant) */
  checkLoss(balls) {
    return false;
  },

  /** Prochaine bille cible (la plus basse encore sur la table) */
  getTargetBall(balls) {
    const onTable = balls.filter((b) => b.number > 0 && !b.inPocket);
    if (onTable.length === 0) return null;
    return onTable.reduce((min, b) => (b.number < min.number ? b : min));
  },
};
