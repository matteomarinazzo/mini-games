import {
  fix_padding,
  fix_offsetX,
  fix_offsetY,
  fix_brickWidth,
  fix_brickHeight,
  canvasWidth,
  config,
} from "./common.js";

const isMobile =
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0 ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Paramètres de difficulté
const difficultySettings = {
  easy: { ballSpeed: 4, paddleWidth: 120, paddleSpeed: 8 },
  medium: { ballSpeed: 6, paddleWidth: 100, paddleSpeed: 10 },
  hard: { ballSpeed: 8, paddleWidth: 80, paddleSpeed: 12 },
  insane: { ballSpeed: 10, paddleWidth: 60, paddleSpeed: 14 },
};

const settings = difficultySettings[config.difficulty];

// Canvas
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Resize canvas pour s'adapter à la fenêtre
function resizeCanvas() {
  const canvas = document.getElementById("gameCanvas");
  const hud = document.querySelector(".hud");
  const controls = document.querySelector(".controls-info");

  // hauteur disponible
  const availableHeight =
    window.innerHeight - hud.offsetHeight - controls.offsetHeight - 40;

  canvas.width = canvasWidth;
  canvas.height = availableHeight;
}

// Game state
let gameState = {
  score: 0,
  lives: 3,
  bricks: [],
  ball: null,
  paddle: null,
  isPaused: false,
  isGameOver: false,
  isWin: false,
  ballLaunched: false,
};

// Couleurs des briques selon leur vie
const brickColors = [
  { bg: "#ff6b6b", border: "#ee5a52" }, // 1 vie
  { bg: "#ffd43b", border: "#fcc419" }, // 2 vies
  { bg: "#51cf66", border: "#40c057" }, // 3 vies
  { bg: "#4facfe", border: "#00f2fe" }, // 4 vies
  { bg: "#a855f7", border: "#9333ea" }, // 5 vies
];

// Paddle
class Paddle {
  constructor() {
    this.width = settings.paddleWidth;
    this.height = 15;
    this.x = canvas.width / 2 - this.width / 2;
    this.y = canvas.height - 30;
    this.speed = settings.paddleSpeed;
    this.dx = 0;
  }

  draw() {
    // Gradient pour la raquette
    const gradient = ctx.createLinearGradient(
      this.x,
      this.y,
      this.x + this.width,
      this.y + this.height,
    );
    gradient.addColorStop(0, "#667eea");
    gradient.addColorStop(1, "#764ba2");

    ctx.fillStyle = gradient;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // Reflet
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillRect(this.x, this.y, this.width, this.height / 3);

    // Bordure
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
  }

  move() {
    this.x += this.dx;

    // Limites
    if (this.x < 0) this.x = 0;
    if (this.x + this.width > canvas.width) this.x = canvas.width - this.width;
  }
}

// Ball
class Ball {
  constructor() {
    this.radius = 8;
    this.x = canvas.width / 2;
    this.y = canvas.height - 55;
    this.dx = 0;
    this.dy = 0;
    this.speed = settings.ballSpeed;
  }

  draw() {
    // Gradient radial pour la balle
    const gradient = ctx.createRadialGradient(
      this.x - this.radius / 3,
      this.y - this.radius / 3,
      0,
      this.x,
      this.y,
      this.radius,
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.3, "#ffd43b");
    gradient.addColorStop(1, "#ff6b6b");

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.closePath();

    // Bordure
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  launch() {
    const angle = -Math.PI / 3 + (Math.random() * Math.PI) / 3; // Angle aléatoire vers le haut
    this.dx = Math.sin(angle) * this.speed;
    this.dy = -Math.cos(angle) * this.speed;
  }

  move() {
    this.x += this.dx;
    this.y += this.dy;

    // Collision avec les murs
    if (this.x - this.radius < 0 || this.x + this.radius > canvas.width) {
      this.dx = -this.dx;
      this.x =
        this.x < canvas.width / 2 ? this.radius : canvas.width - this.radius;
    }

    // Collision avec le haut
    if (this.y - this.radius < 0) {
      this.dy = -this.dy;
      this.y = this.radius;
    }

    // Collision avec la raquette
    if (
      this.y + this.radius > gameState.paddle.y &&
      this.y - this.radius < gameState.paddle.y + gameState.paddle.height &&
      this.x > gameState.paddle.x &&
      this.x < gameState.paddle.x + gameState.paddle.width
    ) {
      // Calculer l'angle de rebond selon où la balle touche la raquette
      const hitPos = (this.x - gameState.paddle.x) / gameState.paddle.width;
      const angle = (hitPos - 0.5) * (Math.PI * 0.6); // -54° à +54°

      this.dx = Math.sin(angle) * this.speed;
      this.dy = -Math.abs(Math.cos(angle) * this.speed);
      this.y = gameState.paddle.y - this.radius;
    }

    // Balle perdue
    if (this.y - this.radius > canvas.height) {
      loseLife();
    }
  }
}

// Brick
class Brick {
  constructor(x, y, lives) {
    this.x = x;
    this.y = y;
    this.width = fix_brickWidth;
    this.height = fix_brickHeight;
    this.maxLives = lives;
    this.lives = lives;
    this.visible = true;
  }

  draw() {
    if (!this.visible) return;

    const colorIndex = Math.min(this.lives - 1, brickColors.length - 1);
    const colors = brickColors[colorIndex];

    // Fond de la brique
    ctx.fillStyle = colors.bg;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // Reflet
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(this.x, this.y, this.width, this.height / 3);

    // Bordure
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x, this.y, this.width, this.height);

    // Afficher les vies restantes si > 1
    if (this.maxLives > 1) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        this.lives,
        this.x + this.width / 2,
        this.y + this.height / 2,
      );
    }
  }

  hit() {
    this.lives--;
    if (this.lives <= 0) {
      this.visible = false;
      gameState.score += 10 * this.maxLives;
      checkWin();
    } else {
      gameState.score += 5;
    }
  }
}

// Initialisation
function init() {
  createBricks();
  gameState.paddle = new Paddle();
  gameState.ball = new Ball();
  updateHUD();
}

function createBricks() {
  gameState.bricks = [];

  for (let row = 0; row < config.height; row++) {
    for (let col = 0; col < config.width; col++) {
      const x = col * (fix_brickWidth + fix_padding) + fix_offsetX;
      const y = row * (fix_brickHeight + fix_padding) + fix_offsetY;
      gameState.bricks.push(new Brick(x, y, config.brickLives));
    }
  }
}

// Collisions avec les briques
function checkBrickCollisions() {
  gameState.bricks.forEach((brick) => {
    if (!brick.visible) return;

    const ball = gameState.ball;

    if (
      ball.x + ball.radius > brick.x &&
      ball.x - ball.radius < brick.x + brick.width &&
      ball.y + ball.radius > brick.y &&
      ball.y - ball.radius < brick.y + brick.height
    ) {
      // Déterminer le côté de collision
      const overlapLeft = ball.x + ball.radius - brick.x;
      const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
      const overlapTop = ball.y + ball.radius - brick.y;
      const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);

      const minOverlap = Math.min(
        overlapLeft,
        overlapRight,
        overlapTop,
        overlapBottom,
      );

      if (minOverlap === overlapLeft || minOverlap === overlapRight) {
        ball.dx = -ball.dx;
      } else {
        ball.dy = -ball.dy;
      }

      brick.hit();
    }
  });
}

// Mise à jour du HUD
function updateHUD() {
  document.getElementById("score").textContent = gameState.score;

  const heartsContainer = document.getElementById("hearts");
  heartsContainer.innerHTML = "❤️".repeat(gameState.lives);

  const bricksRemaining = gameState.bricks.filter((b) => b.visible).length;
  document.getElementById("bricksRemaining").textContent = bricksRemaining;
}

// Perdre une vie
function loseLife() {
  gameState.lives--;
  gameState.ballLaunched = false;

  if (gameState.lives <= 0) {
    gameOver();
  } else {
    resetBall();
  }

  updateHUD();
}

function resetBall() {
  gameState.ball = new Ball();
}

// Victoire
function checkWin() {
  const remaining = gameState.bricks.filter((b) => b.visible).length;
  if (remaining === 0) {
    win();
  }
}

function win() {
  gameState.isWin = true;
  document.getElementById("winScore").textContent = gameState.score;
  document.getElementById("winOverlay").style.display = "flex";
}

// Game Over
function gameOver() {
  gameState.isGameOver = true;
  document.getElementById("finalScore").textContent = gameState.score;
  document.getElementById("gameOverOverlay").style.display = "flex";
}

// Pause
function togglePause() {
  if (gameState.isGameOver || gameState.isWin) return;

  gameState.isPaused = !gameState.isPaused;
  document.getElementById("pauseOverlay").style.display = gameState.isPaused
    ? "flex"
    : "none";
}

// Controls
let keys = {};
let touchStartX = 0;
let touchStartTime = 0;
let isDragging = false;

const TAP_MAX_DURATION = 200; // ms
const TAP_MAX_MOVE = 10; // px

document.addEventListener("keydown", (e) => {
  keys[e.key] = true;

  if (e.key === " ") {
    e.preventDefault();
    if (!gameState.ballLaunched && !gameState.isPaused) {
      gameState.ball.launch();
      gameState.ballLaunched = true;
    } else {
      togglePause();
    }
  }
});

function updateControlsText() {
  const controlItems = document.querySelectorAll(
    ".controls-info .control-item",
  );

  if (!controlItems.length) return;

  if (isMobile) {
    // Raquette
    controlItems[0].innerHTML = `
      <span class="touch-icon">👆</span>
      <span>Glisser pour déplacer la raquette</span>
    `;

    // Lancer / Pause
    controlItems[1].innerHTML = `
      <span class="touch-icon">👆</span>
      <span>Taper pour lancer / mettre en pause</span>
    `;

    // Supprimer la ligne souris inutile sur mobile
    if (controlItems[2]) {
      controlItems[2].style.display = "none";
    }
  }
}

document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

// Mouse control
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  gameState.paddle.x = mouseX - gameState.paddle.width / 2;

  // Limites
  if (gameState.paddle.x < 0) gameState.paddle.x = 0;
  if (gameState.paddle.x + gameState.paddle.width > canvas.width) {
    gameState.paddle.x = canvas.width - gameState.paddle.width;
  }
});

// Buttons
document.getElementById("resumeBtn").addEventListener("click", togglePause);
document
  .getElementById("restartBtn")
  .addEventListener("click", () => location.reload());
document
  .getElementById("retryBtn")
  .addEventListener("click", () => location.reload());
document
  .getElementById("playAgainBtn")
  .addEventListener("click", () => location.reload());

[
  document.getElementById("menuBtn"),
  document.getElementById("menuBtn2"),
  document.getElementById("menuBtn3"),
].forEach((btn) => {
  btn.addEventListener("click", () => (window.location.href = "index.html"));
});

/* Touch controls */

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();

  touchStartX = touch.clientX - rect.left;
  touchStartTime = Date.now();
  isDragging = false;
});

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;

  if (Math.abs(x - touchStartX) > TAP_MAX_MOVE) {
    isDragging = true;
  }

  // Déplacer la raquette
  gameState.paddle.x = x - gameState.paddle.width / 2;

  // Limites
  if (gameState.paddle.x < 0) gameState.paddle.x = 0;
  if (gameState.paddle.x + gameState.paddle.width > canvas.width) {
    gameState.paddle.x = canvas.width - gameState.paddle.width;
  }
});

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  const duration = Date.now() - touchStartTime;

  // TAP = lancer / pause
  if (!isDragging && duration < TAP_MAX_DURATION) {
    if (!gameState.ballLaunched && !gameState.isPaused) {
      gameState.ball.launch();
      gameState.ballLaunched = true;
    } else {
      togglePause();
    }
  }
});

// resize quand la fenêtre change
window.addEventListener("resize", resizeCanvas);

// Game Loop
function update() {
  if (gameState.isPaused || gameState.isGameOver || gameState.isWin) {
    requestAnimationFrame(update);
    return;
  }

  // Mouvement du paddle avec les flèches
  if (keys["ArrowLeft"]) {
    gameState.paddle.dx = -gameState.paddle.speed;
  } else if (keys["ArrowRight"]) {
    gameState.paddle.dx = gameState.paddle.speed;
  } else {
    gameState.paddle.dx = 0;
  }

  gameState.paddle.move();

  if (gameState.ballLaunched) {
    gameState.ball.move();
    checkBrickCollisions();
  } else {
    // La balle suit la raquette
    gameState.ball.x = gameState.paddle.x + gameState.paddle.width / 2;
    gameState.ball.y = gameState.paddle.y - gameState.ball.radius - 5;
  }

  updateHUD();
  requestAnimationFrame(update);
}

function draw() {
  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background pattern
  ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
  for (let i = 0; i < canvas.width; i += 20) {
    ctx.fillRect(i, 0, 1, canvas.height);
  }
  for (let i = 0; i < canvas.height; i += 20) {
    ctx.fillRect(0, i, canvas.width, 1);
  }

  // Draw
  gameState.bricks.forEach((brick) => brick.draw());
  gameState.paddle.draw();
  gameState.ball.draw();

  requestAnimationFrame(draw);
}

// Start
resizeCanvas();
init();
update();
draw();
updateControlsText();
