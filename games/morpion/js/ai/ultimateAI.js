// ultimateAI.js

/**
 * IA pour Ultimate Tic-Tac-Toe
 * @param {string} difficulty - "easy", "medium", "hard", "expert"
 * @returns {object} {gridIndex, cellIndex} ou null
 */
export function ultimateAI(difficulty = "easy") {
  // Importer l'état depuis ultimate.js via le DOM
  const ultimateState = window.ultimateState || getStateFromDOM();
  
  if (!ultimateState) return null;

  const aiPlayer = 2;
  const humanPlayer = 1;

  // Easy = choix aléatoire parmi les coups valides
  if (difficulty === "easy") {
    return getRandomMove(ultimateState);
  }

  // Medium = bloquer les menaces locales
  else if (difficulty === "medium") {
    // 1. Bloquer si l'adversaire peut gagner une mini-grille
    const blockMove = findLocalBlockingMove(ultimateState, humanPlayer);
    if (blockMove) return blockMove;

    // 2. Sinon jouer aléatoirement
    return getRandomMove(ultimateState);
  }

  // Hard = stratégie locale + globale
  else if (difficulty === "hard") {
    // 1. Gagner une mini-grille si possible
    const winLocalMove = findLocalWinningMove(ultimateState, aiPlayer);
    if (winLocalMove) return winLocalMove;

    // 2. Bloquer l'adversaire localement
    const blockLocalMove = findLocalBlockingMove(ultimateState, humanPlayer);
    if (blockLocalMove) return blockLocalMove;

    // 3. Gagner globalement si possible
    const winGlobalMove = findGlobalWinningMove(ultimateState, aiPlayer);
    if (winGlobalMove) return winGlobalMove;

    // 4. Bloquer globalement
    const blockGlobalMove = findGlobalBlockingMove(ultimateState, humanPlayer);
    if (blockGlobalMove) return blockGlobalMove;

    // 5. Jouer stratégiquement
    const strategicMove = findStrategicMove(ultimateState, aiPlayer);
    if (strategicMove) return strategicMove;

    // 6. Sinon aléatoire
    return getRandomMove(ultimateState);
  }

  // Expert = évaluation complète locale + globale
  else if (difficulty === "expert") {
    // 1. Gagner localement
    const winLocalMove = findLocalWinningMove(ultimateState, aiPlayer);
    if (winLocalMove) return winLocalMove;

    // 2. Bloquer localement
    const blockLocalMove = findLocalBlockingMove(ultimateState, humanPlayer);
    if (blockLocalMove) return blockLocalMove;

    // 3. Gagner globalement
    const winGlobalMove = findGlobalWinningMove(ultimateState, aiPlayer);
    if (winGlobalMove) return winGlobalMove;

    // 4. Bloquer globalement
    const blockGlobalMove = findGlobalBlockingMove(ultimateState, humanPlayer);
    if (blockGlobalMove) return blockGlobalMove;

    // 5. Évaluation heuristique complète
    const bestMove = findBestMoveHeuristic(ultimateState, aiPlayer, humanPlayer);
    return bestMove;
  }

  return getRandomMove(ultimateState);
}

/**
 * Récupérer l'état depuis le DOM si nécessaire
 */
function getStateFromDOM() {
  const miniGrids = Array(9).fill(null).map(() => Array(9).fill(null));
  const gridWinners = Array(9).fill(null);
  let nextGrid = null;

  // Lire l'état depuis le DOM
  document.querySelectorAll('.mini-grid').forEach((grid, gridIndex) => {
    const cells = grid.querySelectorAll('.mini-cell');
    cells.forEach((cell, cellIndex) => {
      const content = cell.textContent.trim();
      if (content === '❌' || cell.querySelector('img')) {
        miniGrids[gridIndex][cellIndex] = 1;
      } else if (content === '⭕') {
        miniGrids[gridIndex][cellIndex] = 2;
      }
    });

    // Vérifier si la grille est gagnée
    if (grid.classList.contains('won-player1')) gridWinners[gridIndex] = 1;
    else if (grid.classList.contains('won-player2')) gridWinners[gridIndex] = 2;
    else if (grid.classList.contains('draw')) gridWinners[gridIndex] = 'draw';
  });

  // Détecter nextGrid
  const playableGrid = document.querySelector('.mini-grid.playable:not(.inactive)');
  if (playableGrid) {
    nextGrid = parseInt(playableGrid.dataset.gridIndex);
  }

  return { miniGrids, gridWinners, nextGrid };
}

/**
 * Jouer aléatoirement
 */
function getRandomMove(state) {
  const validMoves = getAllValidMoves(state);
  if (validMoves.length === 0) return null;
  return validMoves[Math.floor(Math.random() * validMoves.length)];
}

/**
 * Obtenir tous les coups valides
 */
function getAllValidMoves(state) {
  const moves = [];
  const gridsToCheck = state.nextGrid !== null 
    ? [state.nextGrid] 
    : [0, 1, 2, 3, 4, 5, 6, 7, 8];

  for (const gridIndex of gridsToCheck) {
    // Grille déjà terminée
    if (state.gridWinners[gridIndex] !== null) continue;

    for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
      if (state.miniGrids[gridIndex][cellIndex] === null) {
        moves.push({ gridIndex, cellIndex });
      }
    }
  }

  return moves;
}

/**
 * Patterns de victoire 3x3
 */
const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // lignes
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // colonnes
  [0, 4, 8], [2, 4, 6]              // diagonales
];

/**
 * Trouver un coup gagnant dans une mini-grille
 */
function findLocalWinningMove(state, player) {
  const validMoves = getAllValidMoves(state);

  for (const move of validMoves) {
    const { gridIndex, cellIndex } = move;
    const grid = state.miniGrids[gridIndex];

    // Simuler le coup
    const testGrid = [...grid];
    testGrid[cellIndex] = player;

    // Vérifier si ça gagne la mini-grille
    if (checkGridWinner(testGrid) === player) {
      return move;
    }
  }

  return null;
}

/**
 * Bloquer l'adversaire localement
 */
function findLocalBlockingMove(state, opponent) {
  return findLocalWinningMove(state, opponent);
}

/**
 * Trouver un coup qui gagne globalement
 */
function findGlobalWinningMove(state, player) {
  const validMoves = getAllValidMoves(state);

  for (const move of validMoves) {
    const { gridIndex, cellIndex } = move;
    
    // Simuler : gagner cette mini-grille
    const testGridWinners = [...state.gridWinners];
    
    // Si ce coup gagne la mini-grille
    const grid = [...state.miniGrids[gridIndex]];
    grid[cellIndex] = player;
    
    if (checkGridWinner(grid) === player) {
      testGridWinners[gridIndex] = player;
      
      // Vérifier si ça gagne globalement
      if (checkGridWinner(testGridWinners) === player) {
        return move;
      }
    }
  }

  return null;
}

/**
 * Bloquer l'adversaire globalement
 */
function findGlobalBlockingMove(state, opponent) {
  return findGlobalWinningMove(state, opponent);
}

/**
 * Trouver un coup stratégique
 */
function findStrategicMove(state, player) {
  const validMoves = getAllValidMoves(state);
  const centerGrids = [4]; // Centre global
  const cornerGrids = [0, 2, 6, 8]; // Coins globaux

  // 1. Priorité au centre global
  for (const move of validMoves) {
    if (centerGrids.includes(move.gridIndex) && move.cellIndex === 4) {
      return move;
    }
  }

  // 2. Centres des mini-grilles jouables
  for (const move of validMoves) {
    if (move.cellIndex === 4) {
      return move;
    }
  }

  // 3. Coins des mini-grilles stratégiques
  for (const move of validMoves) {
    if (cornerGrids.includes(move.gridIndex) && [0, 2, 6, 8].includes(move.cellIndex)) {
      return move;
    }
  }

  return null;
}

/**
 * Meilleur coup avec évaluation heuristique (Expert)
 */
function findBestMoveHeuristic(state, aiPlayer, humanPlayer) {
  const validMoves = getAllValidMoves(state);
  if (validMoves.length === 0) return null;

  let bestScore = -Infinity;
  let bestMove = validMoves[0];

  for (const move of validMoves) {
    const score = evaluateMove(state, move, aiPlayer, humanPlayer);
    
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

/**
 * Évaluer un coup
 */
function evaluateMove(state, move, aiPlayer, humanPlayer) {
  let score = 0;
  const { gridIndex, cellIndex } = move;

  // 1. Évaluation locale (mini-grille)
  const grid = [...state.miniGrids[gridIndex]];
  grid[cellIndex] = aiPlayer;

  // Compter les alignements potentiels dans cette mini-grille
  for (const pattern of WIN_PATTERNS) {
    const cells = pattern.map(i => grid[i]);
    const aiCount = cells.filter(c => c === aiPlayer).length;
    const humanCount = cells.filter(c => c === humanPlayer).length;
    const emptyCount = cells.filter(c => c === null).length;

    if (humanCount === 0) {
      if (aiCount === 2 && emptyCount === 1) score += 50;
      else if (aiCount === 1 && emptyCount === 2) score += 10;
    }

    if (aiCount === 0 && humanCount === 2 && emptyCount === 1) {
      score -= 30;
    }
  }

  // 2. Évaluation globale
  // Si ce coup gagne la mini-grille
  if (checkGridWinner(grid) === aiPlayer) {
    const testGlobalWinners = [...state.gridWinners];
    testGlobalWinners[gridIndex] = aiPlayer;

    // Compter les opportunités globales
    for (const pattern of WIN_PATTERNS) {
      const cells = pattern.map(i => testGlobalWinners[i]);
      const aiCount = cells.filter(c => c === aiPlayer).length;
      const humanCount = cells.filter(c => c === humanPlayer && c !== 'draw').length;
      const emptyCount = cells.filter(c => c === null).length;

      if (humanCount === 0) {
        if (aiCount === 2 && emptyCount === 1) score += 500;
        else if (aiCount === 1 && emptyCount === 2) score += 100;
      }
    }
  }

  // 3. Pénalité pour envoyer l'adversaire dans une grille dangereuse
  if (state.gridWinners[cellIndex] === null) {
    const nextGridForOpponent = state.miniGrids[cellIndex];
    
    // Vérifier si l'adversaire peut gagner cette mini-grille facilement
    for (const pattern of WIN_PATTERNS) {
      const cells = pattern.map(i => nextGridForOpponent[i]);
      const humanCount = cells.filter(c => c === humanPlayer).length;
      const emptyCount = cells.filter(c => c === null).length;
      
      if (humanCount === 2 && emptyCount === 1) {
        score -= 200; // Très mauvais !
      }
    }
  } else {
    // ⚠️ CRITIQUE : Envoyer l'adversaire vers une grille terminée = il joue où il veut !
    // C'est TRÈS DANGEREUX, on applique une pénalité sévère
    score -= 300; // ÉVITER À TOUT PRIX !
  }

  // 4. Bonus pour positions stratégiques
  if (gridIndex === 4) score += 15; // Centre global
  if (cellIndex === 4) score += 10; // Centre local
  if ([0, 2, 6, 8].includes(cellIndex)) score += 5; // Coins

  return score;
}

/**
 * Vérifier le gagnant d'une grille
 */
function checkGridWinner(grid) {
  for (const pattern of WIN_PATTERNS) {
    const [a, b, c] = pattern;
    
    if (grid[a] && grid[a] === grid[b] && grid[a] === grid[c]) {
      return grid[a];
    }
  }
  
  // Match nul
  if (grid.every(cell => cell !== null)) {
    return 'draw';
  }
  
  return null;
}

// Exposer l'état pour l'IA
if (typeof window !== 'undefined') {
  window.getUltimateStateForAI = getStateFromDOM;
}