// big5x5AI.js
import { gameConfig } from "../utils/shared-config.js";

/**
 * IA pour morpion 5x5 (but: aligner 4 cases)
 * @param {string} difficulty - "easy", "medium", "hard", "expert"
 * @param {Array} winPatterns - Les combinaisons gagnantes (4 alignées)
 * @returns {number} index de la case choisie
 */
export function big5x5AI(difficulty = "easy", winPatterns) {
  const board = gameConfig.boardState;
  const aiPlayer = 2;
  const humanPlayer = 1;

  // Easy = choix aléatoire
  if (difficulty === "easy") {
    const emptyCells = board
      .map((value, index) => (value === null ? index : null))
      .filter((v) => v !== null);

    if (emptyCells.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    return emptyCells[randomIndex];
  }

  // Medium = bloquer l'adversaire si possible
  else if (difficulty === "medium") {
    const blockMove = findBlockingMove(board, humanPlayer, winPatterns);
    if (blockMove !== null) return blockMove;

    const emptyCells = board
      .map((value, index) => (value === null ? index : null))
      .filter((v) => v !== null);

    if (emptyCells.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    return emptyCells[randomIndex];
  }

  // Hard = tenter de gagner, puis bloquer, puis stratégie
  else if (difficulty === "hard") {
    // 1. Gagner si possible (3 alignés + 1 vide)
    const winMove = findWinningMove(board, aiPlayer, winPatterns);
    if (winMove !== null) return winMove;

    // 2. Bloquer l'adversaire (il a 3 alignés)
    const blockMove = findBlockingMove(board, humanPlayer, winPatterns);
    if (blockMove !== null) return blockMove;

    // 3. Chercher les bonnes opportunités (2 alignés)
    const goodMove = findBestOpportunity(board, aiPlayer, winPatterns);
    if (goodMove !== null) return goodMove;

    // 4. Centre
    if (board[12] === null) return 12;

    // 5. Coins
    const corners = [0, 4, 20, 24];
    const availableCorners = corners.filter((i) => board[i] === null);
    if (availableCorners.length > 0) {
      return availableCorners[Math.floor(Math.random() * availableCorners.length)];
    }

    // 6. Positions stratégiques
    const strategicPositions = [6, 8, 16, 18, 7, 11, 13, 17];
    const availableStrategic = strategicPositions.filter((i) => board[i] === null);
    if (availableStrategic.length > 0) {
      return availableStrategic[Math.floor(Math.random() * availableStrategic.length)];
    }

    // 7. N'importe quelle case
    const emptyCells = board
      .map((value, index) => (value === null ? index : null))
      .filter((v) => v !== null);

    if (emptyCells.length === 0) return null;
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
  }

  // Expert = évaluation heuristique avancée
  else if (difficulty === "expert") {
    // 1. Gagner immédiatement
    const winMove = findWinningMove(board, aiPlayer, winPatterns);
    if (winMove !== null) return winMove;

    // 2. Bloquer l'adversaire
    const blockMove = findBlockingMove(board, humanPlayer, winPatterns);
    if (blockMove !== null) return blockMove;

    // 3. Meilleur coup par évaluation
    const bestMove = findBestMoveHeuristic(board, aiPlayer, humanPlayer, winPatterns);
    return bestMove;
  }

  return null;
}

/**
 * Trouve un coup gagnant (3 alignés du joueur + 1 vide = victoire au prochain coup)
 */
function findWinningMove(board, player, winPatterns) {
  for (const pattern of winPatterns) {
    const [a, b, c, d] = pattern;
    const cells = [board[a], board[b], board[c], board[d]];

    const playerCount = cells.filter((cell) => cell === player).length;
    const emptyCount = cells.filter((cell) => cell === null).length;

    // 3 cases du joueur + 1 vide = coup gagnant !
    if (playerCount === 3 && emptyCount === 1) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
      if (board[d] === null) return d;
    }
  }
  return null;
}

/**
 * Trouve un coup pour bloquer l'adversaire
 */
function findBlockingMove(board, opponent, winPatterns) {
  return findWinningMove(board, opponent, winPatterns);
}

/**
 * Trouve une bonne opportunité (2 alignés sans adversaire)
 */
function findBestOpportunity(board, player, winPatterns) {
  let bestScore = 0;
  let bestMove = null;

  for (const pattern of winPatterns) {
    const [a, b, c, d] = pattern;
    const cells = [board[a], board[b], board[c], board[d]];

    const playerCount = cells.filter((cell) => cell === player).length;
    const emptyCount = cells.filter((cell) => cell === null).length;
    const opponentCount = cells.filter((cell) => cell !== null && cell !== player).length;

    // 2 du joueur, 0 adversaire, 2 vides = bonne opportunité
    if (playerCount === 2 && opponentCount === 0 && emptyCount === 2) {
      // Privilégier les cases centrales du pattern
      const emptyIndexes = [a, b, c, d].filter(i => board[i] === null);
      for (const index of emptyIndexes) {
        if (playerCount >= bestScore) {
          bestScore = playerCount;
          bestMove = index;
        }
      }
    }
  }
  return bestMove;
}

/**
 * Trouve le meilleur coup avec évaluation heuristique (Expert)
 */
function findBestMoveHeuristic(board, aiPlayer, humanPlayer, winPatterns) {
  const emptyCells = board
    .map((value, index) => (value === null ? index : null))
    .filter((v) => v !== null);

  if (emptyCells.length === 0) return null;

  let bestScore = -Infinity;
  let bestMove = emptyCells[0];

  for (const cell of emptyCells) {
    board[cell] = aiPlayer;
    const score = evaluatePosition(board, aiPlayer, humanPlayer, winPatterns);
    board[cell] = null;

    if (score > bestScore) {
      bestScore = score;
      bestMove = cell;
    }
  }

  return bestMove;
}

/**
 * Évalue la qualité d'une position
 */
function evaluatePosition(board, aiPlayer, humanPlayer, winPatterns) {
  let score = 0;

  for (const pattern of winPatterns) {
    const [a, b, c, d] = pattern;
    const cells = [board[a], board[b], board[c], board[d]];

    const aiCount = cells.filter((cell) => cell === aiPlayer).length;
    const humanCount = cells.filter((cell) => cell === humanPlayer).length;
    const emptyCount = cells.filter((cell) => cell === null).length;

    // Ligne bloquée = pas de valeur
    if (aiCount > 0 && humanCount > 0) continue;

    // Scoring pour l'IA
    if (aiCount === 3 && emptyCount === 1) score += 10000; // Victoire au prochain coup
    else if (aiCount === 2 && emptyCount === 2) score += 100; // Bonne opportunité
    else if (aiCount === 1 && emptyCount === 3) score += 10; // Début d'alignement

    // Pénalités pour les menaces adverses
    if (humanCount === 3 && emptyCount === 1) score -= 5000; // URGENT à bloquer
    else if (humanCount === 2 && emptyCount === 2) score -= 50; // Menace moyenne
    else if (humanCount === 1 && emptyCount === 3) score -= 5; // Petite menace
  }

  // Bonus pour les positions centrales
  const centralPositions = [6, 7, 8, 11, 12, 13, 16, 17, 18];
  if (centralPositions.includes(board.indexOf(aiPlayer))) {
    score += 5;
  }

  return score;
}