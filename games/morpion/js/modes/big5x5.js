import { initFullscreenSystem } from "../../../../js/fullScreen.js";
import {
  gameConfig,
  resetGame,
  disableAllCells,
  updateCurrentPlayerDisplay,
} from "../utils/shared-config.js";
import { big5x5AI } from "../ai/big5x5AI.js";

let players = "";
const winPatterns = [
  // --- LIGNES ---
  [0, 1, 2, 3],
  [1, 2, 3, 4], // Ligne 0
  [5, 6, 7, 8],
  [6, 7, 8, 9], // Ligne 1
  [10, 11, 12, 13],
  [11, 12, 13, 14], // Ligne 2
  [15, 16, 17, 18],
  [16, 17, 18, 19], // Ligne 3
  [20, 21, 22, 23],
  [21, 22, 23, 24], // Ligne 4

  // --- COLONNES ---
  [0, 5, 10, 15],
  [5, 10, 15, 20], // Col 0
  [1, 6, 11, 16],
  [6, 11, 16, 21], // Col 1
  [2, 7, 12, 17],
  [7, 12, 17, 22], // Col 2
  [3, 8, 13, 18],
  [8, 13, 18, 23], // Col 3
  [4, 9, 14, 19],
  [9, 14, 19, 24], // Col 4

  // --- DIAGONALES DESCENDANTES ---
  [0, 6, 12, 18],
  [6, 12, 18, 24], // Diagonale principale
  [1, 7, 13, 19], // Diagonale juste au-dessus
  [5, 11, 17, 23], // Diagonale juste au-dessous

  // --- DIAGONALES ASCENDANTES ---
  [4, 8, 12, 16],
  [8, 12, 16, 20], // Diagonale inverse principale
  [3, 7, 11, 15], // Diagonale juste au-dessus
  [9, 13, 17, 21], // Diagonale juste au-dessous
];

window.addEventListener("DOMContentLoaded", () => {
  const saved = JSON.parse(localStorage.getItem("morpionGameConfig"));
  if (saved) {
    gameConfig.scores = saved.scores;
  }

  initFullscreenSystem();
  initializeSymbolDisplays();
  updateScoreUI();
});

function initializeSymbolDisplays() {
  if (!gameConfig.players) {
    gameConfig.players = {
      player1: { symbol: "❌", isCustom: false },
      player2: { symbol: "⭕", isCustom: false }
    };
  }

  players = gameConfig.players;

  const player1Display = document.getElementById("player1SymbolDisplay");
  if (players.player1.isCustom && players.player1.customImage) {
    player1Display.innerHTML = `<img src="${players.player1.customImage}" 
                                    class="custom-symbol-img" 
                                    alt="Joueur 1"
                                    style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px;">`;
  } else {
    player1Display.textContent = players.player1.symbol;
  }

  const player2Display = document.getElementById("player2SymbolDisplay");
  if (players.player2.isCustom && players.player2.customImage) {
    player2Display.innerHTML = `<img src="${players.player2.customImage}" 
                                    class="custom-symbol-img" 
                                    alt="Joueur 2"
                                    style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px;">`;
  } else {
    player2Display.textContent = players.player2.symbol;
  }
}

// Gestion de la partie
document.querySelectorAll(".cell").forEach((cell) => {
  cell.addEventListener("click", function () {
    if (cell.getAttribute("isOccupied")) {
      return;
    }

    let cellIndex = parseInt(cell.getAttribute("data-index"));
    let playerTurn = gameConfig.playerTurn || 1;
    let currentPlayerKey = `player${playerTurn}`;
    let currentPlayer = players[currentPlayerKey];

    if (currentPlayer.isCustom && currentPlayer.customImage) {
      cell.innerHTML = `<img src="${currentPlayer.customImage}" 
                                    class="custom-symbol-img" 
                                    alt="${currentPlayer}"
                                    style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px;">`;
    } else {
      cell.textContent = currentPlayer.symbol;
    }

    cell.setAttribute("isOccupied", true);

    // ✅ CORRECTION CRITIQUE : 25 cases pour un 5x5 !
    if (!gameConfig.boardState || gameConfig.boardState.length !== 25) {
      gameConfig.boardState = Array(25).fill(null);
    }

    gameConfig.boardState[cellIndex] = playerTurn;

    checkWinner();
    AIToPlay();
  });
});

function checkWinner() {
  for (const pattern of winPatterns) {
    const [a, b, c, d] = pattern;

    if (
      gameConfig.boardState[a] &&
      gameConfig.boardState[a] === gameConfig.boardState[b] &&
      gameConfig.boardState[a] === gameConfig.boardState[c] &&
      gameConfig.boardState[a] === gameConfig.boardState[d]
    ) {
      const winner = gameConfig.boardState[a];
      highlightWinningCells(pattern);

      setTimeout(() => {
        announceWinner(winner);
      }, 10);

      return;
    }
  }

  // Vérifier match nul (toutes les 25 cases remplies)
  if (gameConfig.boardState.every((cell) => cell !== null)) {
    setTimeout(() => {
      announceDraw();
    }, 10);
  } else {
    // Changer de tour
    gameConfig.playerTurn = gameConfig.playerTurn === 1 ? 2 : 1;
    localStorage.setItem("morpionGameConfig", JSON.stringify(gameConfig));
    updateCurrentPlayerDisplay();
  }
}

function announceWinner(winner) {
  disableAllCells();
  addWinToAPlayer(winner);

  const popup = document.getElementById("winnerPopup");
  const msg = document.getElementById("winnerMessage");
  msg.textContent = `🎉 Joueur ${winner} a gagné !`;

  popup.classList.add("show");

  document.getElementById("popupOkBtn").onclick = () => {
    popup.classList.remove("show");
    resetGame(winner);
    AIToPlay();
  };
}

function announceDraw() {
  disableAllCells();
  addDraw();
  const popup = document.getElementById("drawPopup");
  popup.classList.add("show");

  document.getElementById("drawOkBtn").onclick = () => {
    popup.classList.remove("show");
    resetGame("draw");
    AIToPlay();
  };
}

function addWinToAPlayer(playerNumber) {
  const key = `player${playerNumber}`;
  gameConfig.scores[key]++;
  localStorage.setItem("morpionGameConfig", JSON.stringify(gameConfig));
  updateScoreUI();
}

function addDraw() {
  gameConfig.scores["draws"]++;
  localStorage.setItem("morpionGameConfig", JSON.stringify(gameConfig));
  updateScoreUI();
}

function updateScoreUI() {
  document.getElementById("player1Wins").textContent =
    gameConfig.scores.player1;
  document.getElementById("player2Wins").textContent =
    gameConfig.scores.player2;
  document.getElementById("draws").textContent = gameConfig.scores.draws;
}

function highlightWinningCells(pattern) {
  pattern.forEach((index) => {
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    if (cell) {
      cell.classList.add("win");
    }
  });
}

function AIToPlay() {
  const mode = localStorage.getItem("morpionMode");
  const difficulty = localStorage.getItem("morpionDifficulty");

  if (mode !== "solo") return;

  // Ne pas jouer si partie finie
  if (
    document.querySelector(".cell.win") ||
    gameConfig.boardState.every((c) => c !== null)
  ) {
    return;
  }

  if (gameConfig.playerTurn !== 2) return;

  setTimeout(() => {
    const aiMove = big5x5AI(difficulty, winPatterns);
    if (aiMove !== null) {
      const aiCell = document.querySelector(`.cell[data-index='${aiMove}']`);
      if (aiCell && !aiCell.getAttribute("isOccupied")) {
        aiCell.click();
      }
    }
  }, 150);
}