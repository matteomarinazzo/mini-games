import {
  fix_padding,
  fix_offsetX,
  fix_brickWidth,
  fix_offsetY,
  fix_brickHeight,
} from "./common.js";

// Éléments du DOM
const gridWidthSlider = document.getElementById("gridWidth");
const gridHeightSlider = document.getElementById("gridHeight");
const brickLivesSlider = document.getElementById("brickLives");
const widthValue = document.getElementById("widthValue");
const heightValue = document.getElementById("heightValue");
const livesValue = document.getElementById("livesValue");
const previewGrid = document.getElementById("previewGrid");
const totalBricksSpan = document.getElementById("totalBricks");
const totalHitsSpan = document.getElementById("totalHits");
const startGameBtn = document.getElementById("startGameBtn");

// Couleurs des briques selon leur vie restante
const brickColors = [
  "linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%)", // 1 vie
  "linear-gradient(135deg, #ffd43b 0%, #fcc419 100%)", // 2 vies
  "linear-gradient(135deg, #51cf66 0%, #40c057 100%)", // 3 vies
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", // 4 vies
  "linear-gradient(135deg, #a855f7 0%, #9333ea 100%)", // 5 vies
];

// Mise à jour des valeurs affichées
gridWidthSlider.addEventListener("input", updatePreview);
gridHeightSlider.addEventListener("input", updatePreview);
brickLivesSlider.addEventListener("input", updatePreview);

function updatePreview() {
  const width = parseInt(gridWidthSlider.value);
  const height = parseInt(gridHeightSlider.value);
  const lives = parseInt(brickLivesSlider.value);

  // Mettre à jour les valeurs affichées
  widthValue.textContent = width;
  heightValue.textContent = height;
  livesValue.textContent = lives;

  // Calculer les stats
  const totalBricks = width * height;
  const totalHits = totalBricks * lives;

  totalBricksSpan.textContent = totalBricks;
  totalHitsSpan.textContent = totalHits;

  // Mettre à jour la grille de prévisualisation
  renderPreviewGrid(width, height, lives);
}

function renderPreviewGrid(width, height, lives) {
  previewGrid.innerHTML = "";
  previewGrid.style.gridTemplateColumns = `repeat(${width}, 30px)`;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const brick = document.createElement("div");
      brick.className = "preview-brick";

      // Alterner les couleurs pour montrer les différentes vies
      const colorIndex = Math.min(lives - 1, brickColors.length - 1);
      brick.style.background = brickColors[colorIndex];

      previewGrid.appendChild(brick);
    }
  }
}

// Démarrer le jeu
startGameBtn.addEventListener("click", startGame);

function startGame() {
  const width = parseInt(gridWidthSlider.value);
  const height = parseInt(gridHeightSlider.value);
  const lives = parseInt(brickLivesSlider.value);
  const difficulty = document.querySelector(
    'input[name="difficulty"]:checked',
  ).value;

  // Sauvegarder la configuration dans sessionStorage
  const config = {
    width,
    height,
    brickLives: lives,
    difficulty,
  };

  sessionStorage.setItem("breakoutConfig", JSON.stringify(config));

  // Rediriger vers la page de jeu
  window.location.href = "game.html";
}

// Adapter dynamiquement la largeur max du slider
function updateMaxGridWidth() {
  const maxWidth = Math.floor(
    (window.innerWidth + fix_padding - 2 * fix_offsetX) /
    (fix_brickWidth + fix_padding),
  );

  gridWidthSlider.max = Math.max(maxWidth, parseInt(gridWidthSlider.min)); // ne jamais aller en dessous du min

  // Ajuster la valeur actuelle si elle dépasse le max
  if (parseInt(gridWidthSlider.value) > maxWidth) {
    gridWidthSlider.value = maxWidth;
    widthValue.textContent = maxWidth;
  }
}

// Adapter dynamiquement la hauteur max du slider
function updateMaxGridHeight() {
  const screenHeight = window.innerHeight;
  const screenWidth = window.innerWidth;

  // Ratio dynamique selon la hauteur réelle
  let usableRatio = 0.65; // desktop par défaut

  if (screenWidth < screenHeight) {
    usableRatio = 0.5; // mobile
  } else {
    usableRatio = 0.55; // petits laptops
  }

  const usableHeight = screenHeight * usableRatio;

  const maxHeight = Math.floor(
    (usableHeight - fix_offsetY + fix_padding) /
    (fix_brickHeight + fix_padding),
  );

  gridHeightSlider.max = Math.max(maxHeight, parseInt(gridHeightSlider.min));

  if (parseInt(gridHeightSlider.value) > maxHeight) {
    gridHeightSlider.value = maxHeight;
    heightValue.textContent = maxHeight;
  }
}

// Appel au chargement
updateMaxGridWidth();
updateMaxGridHeight();
// Appel à chaque redimensionnement de la fenêtre
window.addEventListener("resize", updateMaxGridWidth);

// Initialiser la prévisualisation
updatePreview();
