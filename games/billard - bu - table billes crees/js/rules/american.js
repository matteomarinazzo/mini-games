import { Ball } from "../engine/ball.js";
import { getRackPositions15, getRackBallNumbers15 } from "../engine/rack.js";

/** Billard américain (8-ball) : 1 blanche + 15 billes (1-7 pleines, 9-15 rayées, 8 noire). Empocher son groupe puis la 8. */
export const american = {
  id: "american",
  name: "Billard américain",
  description: "Pleines (1-7) ou rayées (9-15). Empochez votre groupe puis la noire (8) pour gagner.",

  ballCount: 16,

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

  /** Victoire : toutes les billes du joueur sont empochées + la 8 empochée (après) */
  checkWin(balls, gameState = {}) {
    const { groupAssigned = null } = gameState;
    if (groupAssigned === null) return false;
    const eight = balls.find((b) => b.number === 8);
    if (!eight || !eight.inPocket) return false;
    const myBalls = groupAssigned === "solid" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    const allMinePotted = myBalls.every((num) => balls.find((b) => b.number === num)?.inPocket);
    return allMinePotted;
  },

  /** Perte : 8 empochée trop tôt ou dans la mauvaise poche (simplifié : 8 empochée avant de finir son groupe = perte) */
  checkLoss(balls, gameState = {}) {
    const eight = balls.find((b) => b.number === 8);
    if (!eight || !eight.inPocket) return false;
    const { groupAssigned } = gameState;
    if (!groupAssigned) return true;
    const myBalls = groupAssigned === "solid" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    const allMinePotted = myBalls.every((num) => balls.find((b) => b.number === num)?.inPocket);
    return !allMinePotted;
  },

  getTargetBall(balls, gameState = {}) {
    const { groupAssigned } = gameState;
    if (!groupAssigned) return null;
    const myNums = groupAssigned === "solid" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    const onTable = balls.filter((b) => myNums.includes(b.number) && !b.inPocket);
    return onTable[0] || null;
  },
};
