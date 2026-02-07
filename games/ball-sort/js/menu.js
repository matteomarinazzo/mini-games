// Éléments du DOM
const colorCountSlider = document.getElementById("colorCount");
const ballsPerTubeSlider = document.getElementById("ballsPerTube");
const emptyTubesSlider = document.getElementById("emptyTubes");
const difficultyInputs = document.querySelectorAll('input[name="difficulty"]');

const colorValue = document.getElementById("colorValue");
const ballsValue = document.getElementById("ballsValue");
const emptyValue = document.getElementById("emptyValue");

const totalColors = document.getElementById("totalColors");
const totalTubes = document.getElementById("totalTubes");
const totalBalls = document.getElementById("totalBalls");

const startGameBtn = document.getElementById("startGameBtn");

// Mise à jour de la prévisualisation
colorCountSlider.addEventListener("input", updatePreview);
ballsPerTubeSlider.addEventListener("input", updatePreview);
emptyTubesSlider.addEventListener("input", updatePreview);

function updatePreview() {
  const colors = parseInt(colorCountSlider.value);
  const ballsPerTube = parseInt(ballsPerTubeSlider.value);
  const emptyTubes = parseInt(emptyTubesSlider.value);

  // Mettre à jour les valeurs affichées
  colorValue.textContent = colors;
  ballsValue.textContent = ballsPerTube;
  emptyValue.textContent = emptyTubes;

  // Calculer les stats
  const tubes = colors + emptyTubes;
  const balls = colors * ballsPerTube;

  totalColors.textContent = colors;
  totalTubes.textContent = tubes;
  totalBalls.textContent = balls;
}

// Démarrer le jeu
startGameBtn.addEventListener("click", startGame);

function startGame() {
  const colors = parseInt(colorCountSlider.value);
  const ballsPerTube = parseInt(ballsPerTubeSlider.value);
  const emptyTubes = parseInt(emptyTubesSlider.value);
  const difficulty = document.querySelector('input[name="difficulty"]:checked').value;

  // Sauvegarder la configuration
  const config = {
    colors,
    ballsPerTube,
    emptyTubes,
    difficulty,
  };

  sessionStorage.setItem("ballSortConfig", JSON.stringify(config));

  // Rediriger vers la page de jeu
  window.location.href = "game.html";
}

// Initialiser la prévisualisation
updatePreview();