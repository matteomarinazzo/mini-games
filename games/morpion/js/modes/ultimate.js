import { initFullscreenSystem } from "../../../../js/fullScreen.js";
import { gameConfig, disableAllCells } from "../utils/shared-config.js";
import { ultimateAI } from "../ai/ultimateAI.js";

let players = "";

// État du jeu Ultimate
const ultimateState = {
  miniGrids: Array(9)
    .fill(null)
    .map(() => Array(9).fill(null)),
  gridWinners: Array(9).fill(null),
  nextGrid: null,
  currentPlayer: 1,
};

// ✅ EXPOSITION GLOBALE pour l'IA
window.ultimateState = ultimateState;

window.addEventListener("DOMContentLoaded", () => {
  if (!gameConfig.scores) {
    gameConfig.scores = { player1: 0, player2: 0, draws: 0 };
  }

  initFullscreenSystem();
  initializeSymbolDisplays();
  createUltimateBoard();
  updateScoreUI();
});

function initializeSymbolDisplays() {
  if (!gameConfig.players) {
    gameConfig.players = {
      player1: { symbol: "❌", isCustom: false },
      player2: { symbol: "⭕", isCustom: false },
    };
  }

  players = gameConfig.players;

  const player1Display = document.getElementById("player1SymbolDisplay");
  if (players.player1.isCustom && players.player1.customImage) {
    player1Display.innerHTML = `<img src="${players.player1.customImage}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px;">`;
  } else {
    player1Display.textContent = players.player1.symbol;
  }

  const player2Display = document.getElementById("player2SymbolDisplay");
  if (players.player2.isCustom && players.player2.customImage) {
    player2Display.innerHTML = `<img src="${players.player2.customImage}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px;">`;
  } else {
    player2Display.textContent = players.player2.symbol;
  }
}

function createUltimateBoard() {
  const board = document.getElementById("ultimateBoard");
  board.innerHTML = "";

  for (let gridIndex = 0; gridIndex < 9; gridIndex++) {
    const miniGrid = document.createElement("div");
    miniGrid.className = "mini-grid";
    miniGrid.dataset.gridIndex = gridIndex;

    for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
      const cell = document.createElement("div");
      cell.className = "mini-cell";
      cell.dataset.gridIndex = gridIndex;
      cell.dataset.cellIndex = cellIndex;

      cell.addEventListener("click", () =>
        handleCellClick(gridIndex, cellIndex),
      );

      miniGrid.appendChild(cell);
    }

    board.appendChild(miniGrid);
  }

  updatePlayableGrids();
}

function handleCellClick(gridIndex, cellIndex) {
  if (!isValidMove(gridIndex, cellIndex)) return;

  const currentPlayer = ultimateState.currentPlayer;

  ultimateState.miniGrids[gridIndex][cellIndex] = currentPlayer;

  const cell = document.querySelector(
    `[data-grid-index="${gridIndex}"][data-cell-index="${cellIndex}"]`,
  );
  displaySymbol(cell, currentPlayer);
  cell.classList.add("filled");

  checkMiniGridWinner(gridIndex);

  if (checkGlobalWinner()) {
    setTimeout(() => announceWinner(currentPlayer), 500);
    return;
  }

  if (ultimateState.gridWinners.every((w) => w !== null)) {
    setTimeout(() => announceDraw(), 500);
    return;
  }

  if (ultimateState.gridWinners[cellIndex] === null) {
    ultimateState.nextGrid = cellIndex;
  } else {
    ultimateState.nextGrid = null;
  }

  ultimateState.currentPlayer = currentPlayer === 1 ? 2 : 1;
  updateCurrentPlayerDisplay();
  updatePlayableGrids();

  AIToPlay();
}

function isValidMove(gridIndex, cellIndex) {
  if (ultimateState.miniGrids[gridIndex][cellIndex] !== null) return false;
  if (ultimateState.gridWinners[gridIndex] !== null) return false;
  if (ultimateState.nextGrid !== null && gridIndex !== ultimateState.nextGrid)
    return false;

  return true;
}

function displaySymbol(cell, player) {
  const currentPlayer = players[`player${player}`];

  if (currentPlayer.isCustom && currentPlayer.customImage) {
    cell.innerHTML = `<img src="${currentPlayer.customImage}" style="width: 100%; height: 100%; object-fit: contain;">`;
  } else {
    cell.textContent = currentPlayer.symbol;
  }
}

function checkMiniGridWinner(gridIndex) {
  const grid = ultimateState.miniGrids[gridIndex];

  const winPatterns = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;

    if (grid[a] && grid[a] === grid[b] && grid[a] === grid[c]) {
      ultimateState.gridWinners[gridIndex] = grid[a];
      markMiniGridWon(gridIndex, grid[a]);
      return;
    }
  }

  if (grid.every((cell) => cell !== null)) {
    ultimateState.gridWinners[gridIndex] = "draw";
    markMiniGridDraw(gridIndex);
  }
}

function markMiniGridWon(gridIndex, winner) {
  const miniGrid = document.querySelector(
    `.mini-grid[data-grid-index="${gridIndex}"]`,
  );
  miniGrid.classList.add("won");
  miniGrid.classList.add(`won-player${winner}`);

  const overlay = document.createElement("div");
  overlay.className = "grid-overlay";
  displaySymbol(overlay, winner);
  miniGrid.appendChild(overlay);
}

function markMiniGridDraw(gridIndex) {
  const miniGrid = document.querySelector(
    `.mini-grid[data-grid-index="${gridIndex}"]`,
  );
  miniGrid.classList.add("draw");

  const overlay = document.createElement("div");
  overlay.className = "grid-overlay draw-overlay";
  overlay.textContent = "—";
  miniGrid.appendChild(overlay);
}

function updatePlayableGrids() {
  document.querySelectorAll(".mini-grid").forEach((grid, index) => {
    grid.classList.remove("playable", "inactive");

    if (ultimateState.gridWinners[index] !== null) {
      grid.classList.add("inactive");
    } else if (
      ultimateState.nextGrid === null ||
      ultimateState.nextGrid === index
    ) {
      grid.classList.add("playable");
    } else {
      grid.classList.add("inactive");
    }
  });
}

function checkGlobalWinner() {
  const winPatterns = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    const winners = ultimateState.gridWinners;

    if (
      winners[a] &&
      winners[a] !== "draw" &&
      winners[a] === winners[b] &&
      winners[a] === winners[c]
    ) {
      highlightWinningGrids(pattern);
      return true;
    }
  }

  return false;
}

function highlightWinningGrids(pattern) {
  pattern.forEach((index) => {
    const grid = document.querySelector(
      `.mini-grid[data-grid-index="${index}"]`,
    );
    grid.classList.add("global-winner");
  });
}

function announceWinner(winner) {
  disableAllCells();
  addWinToPlayer(winner);

  const popup = document.getElementById("winnerPopup");
  const overlay = document.getElementById("popupOverlay");

  overlay.classList.add("show");
  popup.classList.add("show");

  document.getElementById("popupOkBtn").onclick = () => {
    popup.classList.remove("show");
    overlay.classList.remove("show");
    resetGame(winner);
    AIToPlay();
  };
}

function announceDraw() {
  disableAllCells();
  addDraw();

  const popup = document.getElementById("drawPopup");
  const overlay = document.getElementById("popupOverlay");

  overlay.classList.add("show");
  popup.classList.add("show");

  document.getElementById("drawOkBtn").onclick = () => {
    popup.classList.remove("show");
    overlay.classList.remove("show");
    resetGame("draw");
    AIToPlay();
  };
}

function addWinToPlayer(playerNumber) {
  const key = `player${playerNumber}`;
  gameConfig.scores[key]++;
  localStorage.setItem("morpionGameConfig", JSON.stringify(gameConfig));
  updateScoreUI();
}

function addDraw() {
  gameConfig.scores.draws++;
  localStorage.setItem("morpionGameConfig", JSON.stringify(gameConfig));
  updateScoreUI();
}

function updateScoreUI() {
  if (!gameConfig.scores) return;

  document.getElementById("player1Wins").textContent =
    gameConfig.scores.player1;
  document.getElementById("player2Wins").textContent =
    gameConfig.scores.player2;
  document.getElementById("draws").textContent = gameConfig.scores.draws;
}

function updateCurrentPlayerDisplay() {
  const player1Turn = document.getElementById("player1Turn");
  const player2Turn = document.getElementById("player2Turn");
  const arrowTop = document.getElementById("arrowTop");
  const arrowBottom = document.getElementById("arrowBottom");

  if (ultimateState.currentPlayer === 1) {
    player1Turn.classList.add("active");
    player2Turn.classList.remove("active");
    arrowTop.style.visibility = "visible";
    arrowBottom.style.visibility = "hidden";
  } else {
    player1Turn.classList.remove("active");
    player2Turn.classList.add("active");
    arrowTop.style.visibility = "hidden";
    arrowBottom.style.visibility = "visible";
  }
}

function resetGame(lastWinner = null) {
  // Déterminer qui commence
  if (lastWinner === "draw") {
    ultimateState.currentPlayer = ultimateState.currentPlayer === 1 ? 2 : 1;
  } else if (lastWinner !== null) {
    ultimateState.currentPlayer = lastWinner;
  }

  ultimateState.miniGrids = Array(9)
    .fill(null)
    .map(() => Array(9).fill(null));
  ultimateState.gridWinners = Array(9).fill(null);
  ultimateState.nextGrid = null;

  createUltimateBoard();
  updateCurrentPlayerDisplay();

  AIToPlay();
}

window.resetUltimateGame = resetGame;

function AIToPlay() {
  const mode = localStorage.getItem("morpionMode");
  const difficulty = localStorage.getItem("morpionDifficulty");

  if (mode !== "solo") return;

  if (
    checkGlobalWinner() ||
    ultimateState.gridWinners.every((w) => w !== null)
  ) {
    return;
  }

  if (ultimateState.currentPlayer !== 2) return;

  setTimeout(() => {
    const aiMove = ultimateAI(difficulty);
    if (!aiMove) return;

    const { gridIndex, cellIndex } = aiMove;

    if (!isValidMove(gridIndex, cellIndex)) return;

    handleCellClick(gridIndex, cellIndex);
  }, 500);
}
