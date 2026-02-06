// Éléments du DOM
const gameModeInputs = document.querySelectorAll('input[name="gameMode"]');
const orientationInputs = document.querySelectorAll(
  'input[name="orientation"]',
);
const ballSpeedInputs = document.querySelectorAll('input[name="ballSpeed"]');
const paddleSizeSlider = document.getElementById("paddleSize");
const sizeValue = document.getElementById("sizeValue");
const startGameBtn = document.getElementById("startGameBtn");

// Preview elements
const previewPaddleLeft = document.getElementById("previewPaddleLeft");
const previewPaddleRight = document.getElementById("previewPaddleRight");
const modePreview = document.getElementById("modePreview");
const orientationPreview = document.getElementById("orientationPreview");
const paddleSizePreview = document.getElementById("paddleSizePreview");

// Mobile detection
const isMobile = window.matchMedia("(max-aspect-ratio: 1/1)").matches;
if (isMobile) {
  // Désactiver l'orientation horizontale sur mobile
  document.getElementById("orientationVertical").disabled = true;
  document.getElementById("orientationHorizontal").checked = true;
}

// Mise à jour de la prévisualisation
gameModeInputs.forEach((input) =>
  input.addEventListener("change", updatePreview),
);
orientationInputs.forEach((input) =>
  input.addEventListener("change", updatePreview),
);
paddleSizeSlider.addEventListener("input", updatePreview);

function updatePreview() {
  const gameMode = document.querySelector(
    'input[name="gameMode"]:checked',
  ).value;
  const orientation = document.querySelector(
    'input[name="orientation"]:checked',
  ).value;
  const paddleSize = parseInt(paddleSizeSlider.value);

  // Mettre à jour les valeurs affichées
  sizeValue.textContent = paddleSize;
  modePreview.textContent = gameMode === "pvp" ? "2 Joueurs" : "Contre IA";
  orientationPreview.textContent =
    orientation === "vertical" ? "Vertical (↔)" : "Horizontal (↕)";
  paddleSizePreview.textContent = paddleSize + "px";

  // Mettre à jour l'aperçu visuel
  if (orientation === "vertical") {
    // Plateformes gauche-droite
    previewPaddleLeft.className = "preview-paddle left";
    previewPaddleRight.className = "preview-paddle right";
    previewPaddleLeft.style.height = paddleSize + "px";
    previewPaddleRight.style.height = paddleSize + "px";
    previewPaddleLeft.style.width = "10px";
    previewPaddleRight.style.width = "10px";
  } else {
    // Plateformes haut-bas
    previewPaddleLeft.className = "preview-paddle top";
    previewPaddleRight.className = "preview-paddle bottom";
    previewPaddleLeft.style.width = paddleSize + "px";
    previewPaddleRight.style.width = paddleSize + "px";
    previewPaddleLeft.style.height = "10px";
    previewPaddleRight.style.height = "10px";
  }

  // Masquer la deuxième plateforme si IA
  if (gameMode === "ai") {
    previewPaddleRight.style.opacity = "0.5";
  } else {
    previewPaddleRight.style.opacity = "1";
  }
}

// Démarrer le jeu
startGameBtn.addEventListener("click", startGame);

function startGame() {
  const gameMode = document.querySelector(
    'input[name="gameMode"]:checked',
  ).value;
  const orientation = document.querySelector(
    'input[name="orientation"]:checked',
  ).value;
  const paddleSize = parseInt(paddleSizeSlider.value);
  const ballSpeed = document.querySelector(
    'input[name="ballSpeed"]:checked',
  ).value;

  // Sauvegarder la configuration dans sessionStorage
  const config = {
    gameMode,
    orientation,
    paddleSize,
    ballSpeed,
  };

  sessionStorage.setItem("pongConfig", JSON.stringify(config));

  // Rediriger vers la page de jeu
  window.location.href = "game.html";
}

// Initialiser la prévisualisation
updatePreview();
