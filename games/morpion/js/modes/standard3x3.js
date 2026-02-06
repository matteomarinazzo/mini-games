import { initFullscreenSystem } from "../../../../js/fullScreen.js";
import {
  gameConfig,
  resetGame,
  disableAllCells,
  updateCurrentPlayerDisplay,
} from "../utils/shared-config.js";
import { standard3x3AI } from "../ai/standard3x3AI.js";

let players = "";
const winPatterns = [
  //lignes
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  //colonnes
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  //diagonales
  [0, 4, 8],
  [2, 4, 6],
];

window.addEventListener("DOMContentLoaded", () => {
  // Forcer la synchronisation avec le localStorage au cas où
  const saved = JSON.parse(localStorage.getItem("morpionGameConfig"));
  if (saved) {
    gameConfig.scores = saved.scores;
  }

  initFullscreenSystem();
  initializeSymbolDisplays();
  updateScoreUI();
});

function initializeSymbolDisplays() {
  // Récupérer les images
  if (!gameConfig.players) {
    // Configuration par défaut
    gameConfig.players.player1 = { symbol: "❌", isCustom: false };
    gameConfig.players.player2 = { symbol: "⭕", isCustom: false };
  }

  players = gameConfig.players;

  // Joueur 1
  const player1Display = document.getElementById("player1SymbolDisplay");
  if (players.player1.isCustom && players.player1.customImage) {
    player1Display.innerHTML = `<img src="${players.player1.customImage}" 
                                    class="custom-symbol-img" 
                                    alt="Joueur 1"
                                    style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px;">`;
  } else {
    player1Display.textContent = players.player1.symbol;
  }

  // Joueur 2
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

    //ajouter le symbole sur la case
    let cellIndex = cell.getAttribute("data-index");

    let playerTurn = gameConfig.playerTurn || 1;
    let currentPlayerKey = `player${playerTurn}`; // "player1" ou "player2"
    let currentPlayer = players[currentPlayerKey];

    if (currentPlayer.isCustom && currentPlayer.customImage) {
      cell.innerHTML = `<img src="${currentPlayer.customImage}" 
                                    class="custom-symbol-img" 
                                    alt="${currentPlayer}"
                                    style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px;">`;
    } else {
      cell.textContent = currentPlayer.symbol;
    }

    // Marquer la cellule comme occupée
    cell.setAttribute("isOccupied", true);

    if (!gameConfig.boardState) {
      gameConfig.boardState = Array(9).fill(null); // Pour un 3x3
    }

    // Enregistrer le coup
    gameConfig.boardState[cellIndex] = playerTurn;

    checkWinner();

    AIToPlay();
  });
});


function checkWinner() {
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;

    if (
      gameConfig.boardState[a] &&
      gameConfig.boardState[a] === gameConfig.boardState[b] &&
      gameConfig.boardState[a] === gameConfig.boardState[c]
    ) {
      const winner = gameConfig.boardState[a];

      highlightWinningCells(pattern);

      // Utiliser setTimeout pour différer l'alert
      setTimeout(() => {
        announceWinner(winner);
      }, 10); // 10ms de délai

      return; // Sortir de la fonction
    }
  }

  // Vérifier match nul
  if (gameConfig.boardState.every((cell) => cell !== null)) {
    setTimeout(() => {
      announceDraw();
    }, 10);
  } else {
    // Seulement changer de tour si la partie continue
    gameConfig.playerTurn = gameConfig.playerTurn === 1 ? 2 : 1;
    localStorage.setItem("morpionGameConfig", JSON.stringify(gameConfig));
    updateCurrentPlayerDisplay();
  }
}

// Fonction pour annoncer le gagnant
function announceWinner(winner) {
  disableAllCells();
  addWinToAPlayer(winner);

  const popup = document.getElementById("winnerPopup");
  const msg = document.getElementById("winnerMessage");
  msg.textContent = `🎉 Joueur ${winner} a gagné !`;

  popup.classList.add("show");

  document.getElementById("popupOkBtn").onclick = () => {
    popup.classList.remove("show");
    resetGame(winner); // ✅ Passer le gagnant pour qu'il commence

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
    resetGame("draw"); // ✅ Passer "draw" pour alterner

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

  // IA = joueur 2 par défaut, sauf si tu veux gérer le choix du joueur
  if (gameConfig.playerTurn !== 2) return;

  setTimeout(() => {
    const aiMove = standard3x3AI(difficulty, winPatterns);
    if (aiMove !== null) {
      const aiCell = document.querySelector(`.cell[data-index='${aiMove}']`);
      if (aiCell && !aiCell.getAttribute("isOccupied")) aiCell.click();
    }
  }, 150);
}
