// shared-config.js
export let gameConfig = JSON.parse(
  localStorage.getItem("morpionGameConfig"),
) || {
  playerTurn: 1,
  boardState: Array(9).fill(null),
  scores: {
    player1: 0,
    player2: 0,
    draws: 0,
  },
};

export function resetGame(lastWinner = null) {
  // Réinitialiser le plateau
  gameConfig.boardState = Array(9).fill(null);

  // Déterminer qui commence
  if (lastWinner === "draw") {
    // En cas d'égalité, alterner : si c'était 1, passer à 2 et vice-versa
    gameConfig.playerTurn = gameConfig.playerTurn === 1 ? 2 : 1;
    // Mettre à jour l'affichage du joueur actif
    updateCurrentPlayerDisplay();
  } else if (lastWinner !== null) {
    // Le gagnant commence
    gameConfig.playerTurn = lastWinner;
  }
  // Sinon on garde le tour actuel (cas du premier jeu)

  // Sauvegarder en gardant les scores
  localStorage.setItem("morpionGameConfig", JSON.stringify(gameConfig));

  // Nettoyer visuellement le plateau
  document.querySelectorAll(".cell").forEach((cell) => {
    cell.innerHTML = "";
    cell.removeAttribute("isOccupied");
    cell.classList.remove("filled");
    cell.classList.remove("winner");
    cell.classList.remove("win");
  });
  enableAllCells();
}

export function disableAllCells() {
  document.querySelectorAll(".cell").forEach((cell) => {
    cell.style.pointerEvents = "none";
    cell.style.opacity = "0.7";
    cell.style.cursor = "not-allowed";
  });
}

function enableAllCells() {
  document.querySelectorAll(".cell").forEach((cell) => {
    cell.style.pointerEvents = "auto";
    cell.style.opacity = "1";
    cell.style.cursor = "pointer";
  });
}

export function updateCurrentPlayerDisplay() {
  const active = document.querySelector(".player-turn.active");
  const inactive = document.querySelector(".player-turn:not(.active)");
  const arrowTop = document.getElementById("arrowTop");
  const arrowBottom = document.getElementById("arrowBottom");
  
  if (gameConfig.playerTurn === 1) {
    arrowTop.style.visibility = "visible";
    arrowBottom.style.visibility = "hidden";
  } else {
    arrowTop.style.visibility = "hidden";
    arrowBottom.style.visibility = "visible";
  }

  active.classList.remove("active");
  inactive.classList.add("active");
}
