// Récupérer la configuration
const config = JSON.parse(sessionStorage.getItem("ballSortConfig")) || {
  colors: 5,
  ballsPerTube: 4,
  emptyTubes: 2,
  difficulty: "medium",
};

// Palette de couleurs vives
const COLORS = [
  "#FF6B6B", // Rouge corail
  "#4ECDC4", // Turquoise
  "#FFD93D", // Jaune
  "#6BCF7F", // Vert
  "#A78BFA", // Violet
  "#F472B6", // Rose
  "#FB923C", // Orange
  "#60A5FA", // Bleu clair
  "#C0C0C0", // Silver
  "#BEF264", // Lime
];

const isMobile = window.matchMedia("(max-aspect-ratio: 1/1)").matches;
const ballsSize = isMobile ? 35 : 50;

let gameState = {
  tubes: [],
  selectedTube: null,
  moves: 0,
  time: 0,
  isPaused: false,
  isWin: false,
  history: [],
  timer: null,
  isAnimating: false,
};

function init() {
  createTubes();
  shuffleTubes();
  renderTubes();
  updateHUD();
  startTimer();
  setupControls();
}

function createTubes() {
  gameState.tubes = [];
  for (let i = 0; i < config.colors; i++) {
    const tube = [];
    for (let j = 0; j < config.ballsPerTube; j++) {
      tube.push(COLORS[i]);
    }
    gameState.tubes.push(tube);
  }
  for (let i = 0; i < config.emptyTubes; i++) {
    gameState.tubes.push([]);
  }
}

function shuffleTubes() {
  const moves = { easy: 20, medium: 50, hard: 100, expert: 200 }[
    config.difficulty
  ];
  for (let i = 0; i < moves; i++) {
    let fromIndex, toIndex;
    do {
      fromIndex = Math.floor(Math.random() * gameState.tubes.length);
      toIndex = Math.floor(Math.random() * gameState.tubes.length);
    } while (
      fromIndex === toIndex ||
      gameState.tubes[fromIndex].length === 0 ||
      gameState.tubes[toIndex].length >= config.ballsPerTube
    );
    gameState.tubes[toIndex].push(gameState.tubes[fromIndex].pop());
  }
}

function renderTubes() {
  const container = document.getElementById("tubesContainer");
  container.innerHTML = "";
  gameState.tubes.forEach((tube, index) => {
    container.appendChild(createTubeElement(tube, index));
  });
}

function createTubeElement(tube, index) {
  const tubeEl = document.createElement("div");
  tubeEl.className = "tube";
  tubeEl.dataset.index = index;

  const tubeBody = document.createElement("div");
  tubeBody.className = "tube-body";
  tubeBody.style.height = config.ballsPerTube * ballsSize + 10 + "px";

  tube.forEach((color) => {
    const ball = document.createElement("div");
    ball.className = "ball";
    ball.style.backgroundColor = color;
    tubeBody.appendChild(ball);
  });

  tubeEl.appendChild(tubeBody);
  tubeEl.addEventListener("click", () => handleTubeClick(index));
  return tubeEl;
}

async function handleTubeClick(index) {
  if (gameState.isPaused || gameState.isWin || gameState.isAnimating) return;

  if (gameState.selectedTube === null) {
    if (gameState.tubes[index].length > 0) {
      gameState.selectedTube = index;
      liftTopBall(index);
      updateTubeSelection();
    }
  } else {
    if (gameState.selectedTube === index) {
      lowerTopBall(index);
      gameState.selectedTube = null;
      updateTubeSelection();
    } else {
      if (canPour(gameState.selectedTube, index)) {
        await simplePour(gameState.selectedTube, index);
        gameState.selectedTube = null;
        updateTubeSelection();
        checkWin();
      }
      else {
        gameState.selectedTube = index;
        liftTopBall(index);
        updateTubeSelection();
      }
    }
  }
}

function liftTopBall(tubeIndex) {
  const balls = document
    .querySelectorAll(".tube")
    [tubeIndex].querySelectorAll(".ball");
  if (balls.length === 0) return;
  const heightAnimation =
    (config.ballsPerTube - balls.length + 1) * ballsSize + 10;
  balls[balls.length - 1].style.transform = `translateY(-${heightAnimation}px)`;
}

function lowerTopBall(tubeIndex) {
  const balls = document
    .querySelectorAll(".tube")
    [tubeIndex].querySelectorAll(".ball");
  if (balls.length > 0) {
    balls[balls.length - 1].style.transform = "translateY(0)";
  }
}

async function simplePour(fromIndex, toIndex) {
  gameState.isAnimating = true;
  saveState();

  const tubes = document.querySelectorAll(".tube");
  const fromTubeEl = tubes[fromIndex];
  const toTubeEl = tubes[toIndex];

  const ballsInFromTube = fromTubeEl.querySelectorAll(".ball");
  const ballToMove = ballsInFromTube[ballsInFromTube.length - 1];

  if (!ballToMove) {
    gameState.isAnimating = false;
    return;
  }

  // Position actuelle (déjà levée)
  const startRect = ballToMove.getBoundingClientRect();

  // Positions de destination
  const toTubeRect = toTubeEl.getBoundingClientRect();
  const toTubeBodyRect = toTubeEl
    .querySelector(".tube-body")
    .getBoundingClientRect();

  const targetX = toTubeRect.left + (toTubeRect.width - ballsSize) / 2;

  // Hauteur au-dessus du tube de destination (comme liftTopBall)
  const ballsInToTube = gameState.tubes[toIndex].length;
  const heightAboveToTube = ballsSize + 10;
  console.log(
    "Height above toTube:",
    heightAboveToTube,
    config.ballsPerTube,
    "-",
    ballsInToTube,
    "x",
    ballsSize,
    "+10",
  );
  const hoverY = toTubeBodyRect.top - heightAboveToTube;

  // Position finale dans le tube
  const finalY = toTubeBodyRect.bottom - (ballsInToTube + 1) * (ballsSize + 4);

  // Clone animé
  const ghostBall = ballToMove.cloneNode(true);
  document.body.appendChild(ghostBall);

  Object.assign(ghostBall.style, {
    position: "fixed",
    top: `${startRect.top}px`,
    left: `${startRect.left}px`,
    width: `${ballsSize}px`,
    height: `${ballsSize}px`,
    margin: "0",
    zIndex: "1000",
    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
    pointerEvents: "none",
    transform: "none",
  });

  ballToMove.style.display = "none";
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // ÉTAPE 1 : Mouvement diagonal vers position au-dessus du tube de destination
  ghostBall.style.left = `${targetX}px`;
  ghostBall.style.top = `${hoverY}px`;
  await new Promise((resolve) => setTimeout(resolve, 400));

  // ÉTAPE 2 : Descente dans le tube
  ghostBall.style.top = `${finalY}px`;
  await new Promise((resolve) => setTimeout(resolve, 400));

  // Finalisation
  ghostBall.remove();
  gameState.tubes[toIndex].push(gameState.tubes[fromIndex].pop());
  gameState.moves++;

  renderTubes();
  updateHUD();
  gameState.isAnimating = false;
}

function canPour(fromIndex, toIndex) {
  const fromTube = gameState.tubes[fromIndex];
  const toTube = gameState.tubes[toIndex];
  if (fromTube.length === 0 || toTube.length >= config.ballsPerTube)
    return false;
  if (toTube.length === 0) return true;
  return fromTube[fromTube.length - 1] === toTube[toTube.length - 1];
}

function saveState() {
  gameState.history.push({
    tubes: JSON.parse(JSON.stringify(gameState.tubes)),
    moves: gameState.moves,
  });
  if (gameState.history.length > 50) gameState.history.shift();
}

function undo() {
  if (gameState.history.length === 0 || gameState.isAnimating) return;
  const lastState = gameState.history.pop();
  gameState.tubes = lastState.tubes;
  gameState.moves = lastState.moves;
  gameState.selectedTube = null;
  renderTubes();
  updateHUD();
  updateTubeSelection();
}

function updateTubeSelection() {
  document.querySelectorAll(".tube").forEach((tube, index) => {
    tube.classList.remove("selected", "can-receive");
    const topBall =
      tube.querySelectorAll(".ball")[tube.querySelectorAll(".ball").length - 1];

    if (gameState.selectedTube === index) {
      tube.classList.add("selected");
    } else if (
      gameState.selectedTube !== null &&
      canPour(gameState.selectedTube, index)
    ) {
      tube.classList.add("can-receive");
      if (topBall) topBall.style.transform = "translateY(0)";
    } else {
      if (topBall) topBall.style.transform = "translateY(0)";
    }
  });
}

function checkWin() {
  const isWin = gameState.tubes.every((tube) => {
    if (tube.length === 0) return true;
    if (tube.length !== config.ballsPerTube) return false;
    return tube.every((ball) => ball === tube[0]);
  });
  if (isWin) {
    gameState.isWin = true;
    stopTimer();
    setTimeout(() => showWinOverlay(), 500);
  }
}

function showWinOverlay() {
  document.getElementById("finalMoves").textContent = gameState.moves;
  document.getElementById("finalTime").textContent = formatTime(gameState.time);
  document.getElementById("winOverlay").style.display = "flex";
}

function updateHUD() {
  document.getElementById("moves").textContent = gameState.moves;
  document.getElementById("time").textContent = formatTime(gameState.time);
}

function startTimer() {
  gameState.timer = setInterval(() => {
    if (!gameState.isPaused && !gameState.isWin) {
      gameState.time++;
      updateHUD();
    }
  }, 1000);
}

function stopTimer() {
  if (gameState.timer) clearInterval(gameState.timer);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function togglePause() {
  if (gameState.isWin || gameState.isAnimating) return;
  gameState.isPaused = !gameState.isPaused;
  document.getElementById("pauseOverlay").style.display = gameState.isPaused
    ? "flex"
    : "none";
}

function restart() {
  stopTimer();
  gameState = {
    tubes: [],
    selectedTube: null,
    moves: 0,
    time: 0,
    isPaused: false,
    isWin: false,
    history: [],
    timer: null,
    isAnimating: false,
  };
  document.getElementById("winOverlay").style.display = gameState.isPaused
    ? "flex"
    : "none";
  document.getElementById("pauseOverlay").style.display = gameState.isPaused
    ? "flex"
    : "none";

  init();
}

function setupControls() {
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("restartBtn").addEventListener("click", restart);
  document.getElementById("pauseBtn").addEventListener("click", togglePause);
  document.getElementById("resumeBtn").addEventListener("click", togglePause);
  document.getElementById("restartBtn2").addEventListener("click", restart);
  document.getElementById("playAgainBtn").addEventListener("click", restart);

  ["menuBtn", "menuBtn2"].forEach((id) => {
    document
      .getElementById(id)
      .addEventListener("click", () => (window.location.href = "index.html"));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "z" || e.key === "Z") {
      e.preventDefault();
      undo();
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      restart();
    } else if (e.key === " ") {
      e.preventDefault();
      togglePause();
    }
  });
}

init();
