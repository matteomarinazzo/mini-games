import { Ball } from "../engine/ball.js";
import { getRackPositions15, getRackBallNumbers15 } from "../engine/rack.js";

/** 15-ball (Straight pool) : 1 blanche + 15 billes. Chaque bille empochée = 1 point. Objectif : atteindre un score (ex. 50). */
export const fifteenball = {
  id: "15-ball",
  name: "15-ball",
  description: "Empochez les billes pour marquer des points. Le premier à atteindre le score cible gagne.",

  ballCount: 16,
  targetScore: 50,

  createBalls() {
    const balls = [];
    const positions = getRackPositions15();
    const numbers = getRackBallNumbers15();
    for (let i = 0; i < 15; i++) {
      const { x, y } = positions[i];
      const num = numbers[i];
      const type = num <= 7 ? "solid" : num === 8 ? "eight" : "striped";
      balls.push(new Ball(x, y, num, type));
    }
    balls.push(new Ball(0.25, 0.5, 0, "cue"));
    return balls;
  },

  /** Victoire = un joueur atteint targetScore (géré côté gameState avec scores) */
  checkWin(balls, gameState = {}) {
    const { scores = [0, 0], currentPlayer = 0 } = gameState;
    return scores[currentPlayer] >= this.targetScore;
  },

  checkLoss() {
    return false;
  },

  getTargetBall(balls) {
    return null; // pas de cible imposée
  },
};
