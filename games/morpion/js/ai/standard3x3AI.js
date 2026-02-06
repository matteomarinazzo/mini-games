// standard3x3AI.js
import { gameConfig } from "../utils/shared-config.js";

/**
 * IA pour morpion 3x3
 * @param {string} difficulty - "easy", "medium", "hard", "expert"
 * @param {Array} winPatterns - Les combinaisons gagnantes
 * @returns {number} index de la case choisie
 */
export function standard3x3AI(difficulty = "easy", winPatterns) {
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
    // D'abord vérifier si on peut bloquer l'adversaire
    const blockMove = findBlockingMove(board, humanPlayer, winPatterns);
    if (blockMove !== null) return blockMove;

    // Sinon jouer aléatoirement
    const emptyCells = board
      .map((value, index) => (value === null ? index : null))
      .filter((v) => v !== null);

    if (emptyCells.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    return emptyCells[randomIndex];
  }

  // Hard = tenter de gagner si possible, puis bloquer
  else if (difficulty === "hard") {
    // 1. Vérifier si on peut gagner
    const winMove = findWinningMove(board, aiPlayer, winPatterns);
    if (winMove !== null) return winMove;

    // 2. Bloquer l'adversaire
    const blockMove = findBlockingMove(board, humanPlayer, winPatterns);
    if (blockMove !== null) return blockMove;

    // 3. Prendre le centre si disponible
    if (board[4] === null) return 4;

    // 4. Prendre un coin si disponible
    const corners = [0, 2, 6, 8];
    const availableCorners = corners.filter((i) => board[i] === null);
    if (availableCorners.length > 0) {
      return availableCorners[Math.floor(Math.random() * availableCorners.length)];
    }

    // 5. Sinon n'importe quelle case
    const emptyCells = board
      .map((value, index) => (value === null ? index : null))
      .filter((v) => v !== null);

    if (emptyCells.length === 0) return null;
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
  }

  // Expert = algorithme minimax pour jouer parfaitement
  else if (difficulty === "expert") {
    const bestMove = minimax(board, aiPlayer, humanPlayer, winPatterns);
    return bestMove.index;
  }

  return null;
}

/**
 * Trouve un coup gagnant pour un joueur
 */
function findWinningMove(board, player, winPatterns) {
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    const cells = [board[a], board[b], board[c]];

    // Compter les cases du joueur et les cases vides
    const playerCount = cells.filter((cell) => cell === player).length;
    const emptyCount = cells.filter((cell) => cell === null).length;

    // Si 2 cases du joueur et 1 vide = coup gagnant possible
    if (playerCount === 2 && emptyCount === 1) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
    }
  }
  return null;
}

/**
 * Trouve un coup bloquant pour empêcher l'adversaire de gagner
 */
function findBlockingMove(board, opponent, winPatterns) {
  return findWinningMove(board, opponent, winPatterns);
}

/**
 * Algorithme Minimax pour le niveau Expert
 */
function minimax(board, aiPlayer, humanPlayer, winPatterns) {
  const availableCells = board
    .map((value, index) => (value === null ? index : null))
    .filter((v) => v !== null);

  // Vérifier l'état terminal
  const winner = checkWinnerForMinimax(board, winPatterns);
  if (winner === aiPlayer) return { score: 10 };
  if (winner === humanPlayer) return { score: -10 };
  if (availableCells.length === 0) return { score: 0 };

  const moves = [];

  // Tester tous les coups possibles
  for (const cell of availableCells) {
    const move = { index: cell };
    board[cell] = aiPlayer;

    // Appel récursif pour le joueur adverse
    const result = minimaxHelper(board, humanPlayer, aiPlayer, humanPlayer, winPatterns);
    move.score = result.score;

    board[cell] = null;
    moves.push(move);
  }

  // Choisir le meilleur coup
  let bestMove;
  bestMove = moves.reduce((best, move) => 
    move.score > best.score ? move : best
  );

  return bestMove;
}

/**
 * Helper récursif pour minimax
 */
function minimaxHelper(board, player, aiPlayer, humanPlayer, winPatterns) {
  const availableCells = board
    .map((value, index) => (value === null ? index : null))
    .filter((v) => v !== null);

  const winner = checkWinnerForMinimax(board, winPatterns);
  if (winner === aiPlayer) return { score: 10 };
  if (winner === humanPlayer) return { score: -10 };
  if (availableCells.length === 0) return { score: 0 };

  const moves = [];

  for (const cell of availableCells) {
    const move = { index: cell };
    board[cell] = player;

    if (player === aiPlayer) {
      const result = minimaxHelper(board, humanPlayer, aiPlayer, humanPlayer, winPatterns);
      move.score = result.score;
    } else {
      const result = minimaxHelper(board, aiPlayer, aiPlayer, humanPlayer, winPatterns);
      move.score = result.score;
    }

    board[cell] = null;
    moves.push(move);
  }

  let bestMove;
  if (player === aiPlayer) {
    bestMove = moves.reduce((best, move) => 
      move.score > best.score ? move : best
    );
  } else {
    bestMove = moves.reduce((best, move) => 
      move.score < best.score ? move : best
    );
  }

  return bestMove;
}

/**
 * Vérifie s'il y a un gagnant (pour minimax)
 */
function checkWinnerForMinimax(board, winPatterns) {
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (
      board[a] !== null &&
      board[a] === board[b] &&
      board[a] === board[c]
    ) {
      return board[a];
    }
  }
  return null;
}