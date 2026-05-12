import { checkDailyChallenge } from "../../../js/utils/dailyChallenge.js";

// Récupérer la configuration
const config = JSON.parse(sessionStorage.getItem("pongConfig")) || {
  gameMode: "pvp",
  orientation: "vertical",
  paddleSize: 100,
  ballSpeed: "normal",
};

const isMobile = window.matchMedia("(max-aspect-ratio: 1/1)").matches;
if (isMobile) {
  // Forcer l'orientation verticale sur mobile
  config.orientation = "horizontal";
}

// Paramètres de vitesse de balle
const speedSettings = {
  slow: 4,
  normal: 6,
  fast: 8,
  insane: 12,
};

const ballSpeed = speedSettings[config.ballSpeed];
const TARGET_FRAME_MS = 1000 / 60;
const MAX_FRAME_SCALE = 2;

// Canvas
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Dimensions logiques fixes du jeu
const isVertical = config.orientation === "vertical";
const GAME_WIDTH = isVertical ? 800 : 600;
const GAME_HEIGHT = isVertical ? 600 : 800;

// Initialiser les dimensions du canvas
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

const paddleSpeed = 1;

// Ajouter la classe pour le mode horizontal
if (!isVertical) {
  document.body.classList.add("horizontal");
}

// Game state
let gameState = {
  score1: 0,
  score2: 0,
  lives1: 3,
  lives2: 3,
  isPaused: false,
  isGameOver: false,
  ballLaunched: false,
  winner: null,
};

// Touch controls
let touchState = {
  player1: { touching: false, startY: 0, startX: 0, currentY: 0, currentX: 0 },
  player2: { touching: false, startY: 0, startX: 0, currentY: 0, currentX: 0 },
};

// Paddle
class Paddle {
  constructor(isPlayer1) {
    this.isPlayer1 = isPlayer1;

    if (isVertical) {
      // Mode vertical (gauche-droite)
      this.width = 15;
      this.height = config.paddleSize;
      this.x = isPlayer1 ? 30 : GAME_WIDTH - 30 - this.width;
      this.y = GAME_HEIGHT / 2 - this.height / 2;
      this.speed = 8;
      this.dy = 0;
    } else {
      // Mode horizontal (haut-bas)
      this.width = config.paddleSize;
      this.height = 15;
      this.x = GAME_WIDTH / 2 - this.width / 2;
      this.y = isPlayer1 ? GAME_HEIGHT - 30 - this.height : 30;
      this.speed = 8;
      this.dx = 0;
    }
  }

  draw() {
    const gradient = isVertical
      ? ctx.createLinearGradient(
        this.x,
        this.y,
        this.x + this.width,
        this.y + this.height,
      )
      : ctx.createLinearGradient(
        this.x,
        this.y,
        this.x + this.width,
        this.y + this.height,
      );

    gradient.addColorStop(0, this.isPlayer1 ? "#667eea" : "#764ba2");
    gradient.addColorStop(1, this.isPlayer1 ? "#764ba2" : "#667eea");

    ctx.fillStyle = gradient;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // Reflet
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    if (isVertical) {
      ctx.fillRect(this.x, this.y, this.width / 2, this.height);
    } else {
      ctx.fillRect(this.x, this.y, this.width, this.height / 2);
    }

    // Bordure
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
  }

  move(frameScale = 1) {
    if (isVertical) {
      this.y += this.dy * frameScale;
      if (this.y < 0) this.y = 0;
      if (this.y + this.height > GAME_HEIGHT)
        this.y = GAME_HEIGHT - this.height;
    } else {
      this.x += this.dx * frameScale;
      if (this.x < 0) this.x = 0;
      if (this.x + this.width > GAME_WIDTH) this.x = GAME_WIDTH - this.width;
    }
  }

  // IA simple
  aiMove(ball) {
    const target = isVertical ? ball.y : ball.x;
    const paddleCenter = isVertical
      ? this.y + this.height / 2
      : this.x + this.width / 2;
    const diff = target - paddleCenter;

    if (Math.abs(diff) > 10) {
      if (isVertical) {
        this.dy = diff > 0 ? this.speed * 0.7 : -this.speed * 0.7;
      } else {
        this.dx = diff > 0 ? this.speed * 0.7 : -this.speed * 0.7;
      }
    } else {
      if (isVertical) {
        this.dy = 0;
      } else {
        this.dx = 0;
      }
    }
  }
}

// Ball
class Ball {
  constructor() {
    this.radius = 10;
    this.reset();
  }

  reset() {
    this.x = GAME_WIDTH / 2;
    this.y = GAME_HEIGHT / 2;
    this.dx = 0;
    this.dy = 0;
  }

  draw() {
    const gradient = ctx.createRadialGradient(
      this.x - this.radius / 3,
      this.y - this.radius / 3,
      0,
      this.x,
      this.y,
      this.radius,
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.5, "#ffd43b");
    gradient.addColorStop(1, "#ff6b6b");

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.closePath();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  launch() {
    const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;

    if (isVertical) {
      const direction = Math.random() < 0.5 ? -1 : 1;
      this.dx = Math.cos(angle) * ballSpeed * direction;
      this.dy = Math.sin(angle) * ballSpeed;
    } else {
      const direction = Math.random() < 0.5 ? -1 : 1;
      this.dx = Math.sin(angle) * ballSpeed;
      this.dy = Math.cos(angle) * ballSpeed * direction;
    }
  }

  move(frameScale = 1) {
    this.x += this.dx * frameScale;
    this.y += this.dy * frameScale;

    if (isVertical) {
      // Collision haut/bas
      if (this.y - this.radius < 0 || this.y + this.radius > GAME_HEIGHT) {
        this.dy = -this.dy;
        this.y =
          this.y < GAME_HEIGHT / 2 ? this.radius : GAME_HEIGHT - this.radius;
      }

      // Collision avec les plateformes
      this.checkPaddleCollision(paddle1);
      this.checkPaddleCollision(paddle2);

      // Balle perdue
      if (this.x - this.radius < 0) {
        loseLife(1);
      } else if (this.x + this.radius > GAME_WIDTH) {
        loseLife(2);
      }
    } else {
      // Collision gauche/droite
      if (this.x - this.radius < 0 || this.x + this.radius > GAME_WIDTH) {
        this.dx = -this.dx;
        this.x =
          this.x < GAME_WIDTH / 2 ? this.radius : GAME_WIDTH - this.radius;
      }

      // Collision avec les plateformes
      this.checkPaddleCollision(paddle1);
      this.checkPaddleCollision(paddle2);

      // Balle perdue
      if (this.y - this.radius < 0) {
        loseLife(2);
      } else if (this.y + this.radius > GAME_HEIGHT) {
        loseLife(1);
      }
    }
  }

  checkPaddleCollision(paddle) {
    if (
      this.x + this.radius > paddle.x &&
      this.x - this.radius < paddle.x + paddle.width &&
      this.y + this.radius > paddle.y &&
      this.y - this.radius < paddle.y + paddle.height
    ) {
      if (isVertical) {
        const hitPos = (this.y - paddle.y) / paddle.height;
        const angle = (hitPos - 0.5) * (Math.PI * 0.6);

        const speed = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        this.dx = Math.cos(angle) * speed * (paddle.isPlayer1 ? 1 : -1);
        this.dy = Math.sin(angle) * speed;

        this.x = paddle.isPlayer1
          ? paddle.x + paddle.width + this.radius
          : paddle.x - this.radius;
      } else {
        const hitPos = (this.x - paddle.x) / paddle.width;
        const angle = (hitPos - 0.5) * (Math.PI * 0.6);

        const speed = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        this.dx = Math.sin(angle) * speed;
        this.dy = Math.cos(angle) * speed * (paddle.isPlayer1 ? -1 : 1);

        this.y = paddle.isPlayer1
          ? paddle.y - this.radius
          : paddle.y + paddle.height + this.radius;
      }
    }
  }
}

// Initialisation
const paddle1 = new Paddle(true);
const paddle2 = new Paddle(false);
const ball = new Ball();

// Mise à jour du HUD
function updateHUD() {
  document.getElementById("score1").textContent = gameState.score1;
  document.getElementById("score2").textContent = gameState.score2;

  const player1Lives = document.getElementById("player1Lives");
  const player2Lives = document.getElementById("player2Lives");

  player1Lives.innerHTML =
    "❤️".repeat(gameState.lives1) + "🖤".repeat(3 - gameState.lives1);
  player2Lives.innerHTML =
    "❤️".repeat(gameState.lives2) + "🖤".repeat(3 - gameState.lives2);

  document.getElementById("player2Name").textContent =
    config.gameMode === "ai" ? "IA" : "Joueur 2";
}

// Perdre une vie
function loseLife(player) {
  if (player === 1) {
    gameState.lives1--;
    gameState.score2++;
  } else {
    gameState.lives2--;
    gameState.score1++;
  }

  gameState.ballLaunched = false;
  ball.reset();

  if (gameState.lives1 <= 0 || gameState.lives2 <= 0) {
    gameOver();
  }

  updateHUD();
}

// Game Over
function gameOver() {
  gameState.isGameOver = true;
  gameState.winner = gameState.lives1 > 0 ? 1 : 2;

  const winnerName =
    gameState.winner === 1
      ? "Joueur 1"
      : config.gameMode === "ai"
        ? "IA"
        : "Joueur 2";

  document.getElementById("winnerTitle").textContent =
    gameState.winner === 1
      ? "🏆 Victoire !"
      : config.gameMode === "ai"
        ? "💀 Défaite"
        : "🏆 Victoire !";
  document.getElementById("winnerText").textContent = winnerName + " gagne !";
  document.getElementById("finalScore1").textContent = gameState.score1;
  document.getElementById("finalScore2").textContent = gameState.score2;
  document.getElementById("gameOverOverlay").style.display = "flex";

  // === DAILY CHALLENGE ===
  const wonVsAi = config.gameMode === "ai" && gameState.winner === 1;
  checkDailyChallenge({
    gameId: 'pong',
    wonVsAi,
    ballSpeed: config.ballSpeed,        // 'slow', 'normal', 'fast', 'insane'
    paddleSize: config.paddleSize,      // taille en px
  });
}

// Pause
function togglePause() {
  if (gameState.isGameOver) return;

  gameState.isPaused = !gameState.isPaused;
  document.getElementById("pauseOverlay").style.display = gameState.isPaused
    ? "flex"
    : "none";
}

// Contrôles clavier
let keys = {};

document.addEventListener("keydown", (e) => {
  keys[e.key] = true;

  if (e.key === " ") {
    e.preventDefault();
    if (
      !gameState.ballLaunched &&
      !gameState.isPaused &&
      !gameState.isGameOver
    ) {
      ball.launch();
      gameState.ballLaunched = true;
    } else {
      togglePause();
    }
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

// Contrôles tactiles
const touchControls = document.getElementById("touchControls");
const player1Touch = document.getElementById("player1Touch");
const player2Touch = document.getElementById("player2Touch");
const touchListenerOptions = { passive: false };

touchControls.className = `touch-controls ${config.orientation}`;

// Touch events pour joueur 1

// Joueur 1
player1Touch.addEventListener("touchstart", (e) => {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    touchState.player1.touching = true;
    touchState.player1.id = touch.identifier; // mémoriser le doigt
    touchState.player1.startY = touch.clientY;
    touchState.player1.startX = touch.clientX;
    touchState.player1.currentY = touch.clientY;
    touchState.player1.currentX = touch.clientX;

    if (!gameState.ballLaunched && !gameState.isPaused && !gameState.isGameOver) {
      ball.launch();
      gameState.ballLaunched = true;
    }
  }
}, touchListenerOptions);

player1Touch.addEventListener("touchmove", (e) => {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    if (touchState.player1.touching && touch.identifier === touchState.player1.id) {
      touchState.player1.currentY = touch.clientY;
      touchState.player1.currentX = touch.clientX;
    }
  }
}, touchListenerOptions);

player1Touch.addEventListener("touchend", (e) => {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    if (touch.identifier === touchState.player1.id) {
      touchState.player1.touching = false;
    }
  }
}, touchListenerOptions);

player1Touch.addEventListener("touchcancel", (e) => {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    if (touch.identifier === touchState.player1.id) {
      touchState.player1.touching = false;
    }
  }
}, touchListenerOptions);

// Touch events pour joueur 2 (seulement en mode PvP)
player2Touch.addEventListener("touchstart", (e) => {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    touchState.player2.touching = true;
    touchState.player2.id = touch.identifier; // mémoriser le doigt
    touchState.player2.startY = touch.clientY;
    touchState.player2.startX = touch.clientX;
    touchState.player2.currentY = touch.clientY;
    touchState.player2.currentX = touch.clientX;

    if (!gameState.ballLaunched && !gameState.isPaused && !gameState.isGameOver) {
      ball.launch();
      gameState.ballLaunched = true;
    }
  }
}, touchListenerOptions);

player2Touch.addEventListener("touchmove", (e) => {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    if (touchState.player2.touching && touch.identifier === touchState.player2.id) {
      touchState.player2.currentY = touch.clientY;
      touchState.player2.currentX = touch.clientX;
    }
  }
}, touchListenerOptions);

player2Touch.addEventListener("touchend", (e) => {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    if (touch.identifier === touchState.player2.id) {
      touchState.player2.touching = false;
    }
  }
}, touchListenerOptions);

player2Touch.addEventListener("touchcancel", (e) => {
  e.preventDefault();
  for (let touch of e.changedTouches) {
    if (touch.identifier === touchState.player2.id) {
      touchState.player2.touching = false;
    }
  }
}, touchListenerOptions);

// Touch sur le canvas pour lancer/pause
let lastTapTime = 0;
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const now = Date.now();
  if (now - lastTapTime < 300) {
    // Double tap = pause
    e.preventDefault();
    togglePause();
  } else if (
    !gameState.ballLaunched &&
    !gameState.isPaused &&
    !gameState.isGameOver
  ) {
    // Simple tap = lancer
    e.preventDefault();
    ball.launch();
    gameState.ballLaunched = true;
  }
  lastTapTime = now;
}, touchListenerOptions);

// Boutons
document.getElementById("resumeBtn").addEventListener("click", togglePause);
document
  .getElementById("restartBtn")
  .addEventListener("click", () => location.reload());
document
  .getElementById("retryBtn")
  .addEventListener("click", () => location.reload());

[
  document.getElementById("menuBtn"),
  document.getElementById("menuBtn2"),
].forEach((btn) => {
  btn.addEventListener("click", () => (window.location.href = "index.html"));
});

// Afficher les contrôles selon l'orientation
const controlsInfo = document.getElementById("controlsInfo");
if (isVertical) {
  controlsInfo.innerHTML = `
    <div class="player-controls">
      <span class="player-label">Joueur 1:</span>
      <div class="control-item">
        <kbd>W</kbd><kbd>S</kbd>
        <span>Monter / Descendre</span>
      </div>
    </div>
    ${config.gameMode === "pvp"
      ? `
    <div class="player-controls">
      <span class="player-label">Joueur 2:</span>
      <div class="control-item">
        <kbd>↑</kbd><kbd>↓</kbd>
        <span>Monter / Descendre</span>
      </div>
    </div>
    `
      : ""
    }
    <div class="control-item">
      <kbd>Espace</kbd>
      <span>Lancer / Pause</span>
    </div>
  `;
} else {
  controlsInfo.innerHTML = `
    <div class="player-controls">
      <span class="player-label">Joueur 1:</span>
      <div class="control-item">
        <kbd>A</kbd><kbd>D</kbd>
        <span>Gauche / Droite</span>
      </div>
    </div>
    ${config.gameMode === "pvp"
      ? `
    <div class="player-controls">
      <span class="player-label">Joueur 2:</span>
      <div class="control-item">
        <kbd>←</kbd><kbd>→</kbd>
        <span>Gauche / Droite</span>
      </div>
    </div>
    `
      : ""
    }
    <div class="control-item">
      <kbd>Espace</kbd>
      <span>Lancer / Pause</span>
    </div>
  `;
}

// Game Loop
let lastUpdateTime = null;

function update(timestamp) {
  const now = typeof timestamp === "number" ? timestamp : performance.now();
  const elapsed =
    lastUpdateTime === null ? TARGET_FRAME_MS : now - lastUpdateTime;
  lastUpdateTime = now;
  const frameScale = Math.min(
    Math.max(elapsed / TARGET_FRAME_MS, 0),
    MAX_FRAME_SCALE,
  );

  if (gameState.isPaused || gameState.isGameOver) {
    requestAnimationFrame(update);
    return;
  }

  // Contrôles clavier Joueur 1
  if (isVertical) {
    if (keys["w"] || keys["W"]) {
      paddle1.dy = -paddle1.speed;
    } else if (keys["s"] || keys["S"]) {
      paddle1.dy = paddle1.speed;
    } else {
      paddle1.dy = 0;
    }
  } else {
    if (keys["a"] || keys["A"]) {
      paddle1.dx = -paddle1.speed;
    } else if (keys["d"] || keys["D"]) {
      paddle1.dx = paddle1.speed;
    } else {
      paddle1.dx = 0;
    }
  }

  // Contrôles tactiles Joueur 1
  if (touchState.player1.touching) {
    if (isVertical) {
      const deltaY = touchState.player1.currentY - touchState.player1.startY;
      paddle1.y += deltaY * paddleSpeed;
      paddle1.y = Math.max(
        0,
        Math.min(GAME_HEIGHT - paddle1.height, paddle1.y),
      );
      touchState.player1.startY = touchState.player1.currentY;
    } else {
      const deltaX = touchState.player1.currentX - touchState.player1.startX;
      paddle1.x += deltaX * paddleSpeed;
      paddle1.x = Math.max(0, Math.min(GAME_WIDTH - paddle1.width, paddle1.x));
      touchState.player1.startX = touchState.player1.currentX;
    }
  }

  paddle1.move(frameScale);

  // Contrôles Joueur 2 ou IA
  if (config.gameMode === "pvp") {
    // Contrôles clavier Joueur 2
    if (isVertical) {
      if (keys["ArrowUp"]) {
        paddle2.dy = -paddle2.speed;
      } else if (keys["ArrowDown"]) {
        paddle2.dy = paddle2.speed;
      } else {
        paddle2.dy = 0;
      }
    } else {
      if (keys["ArrowLeft"]) {
        paddle2.dx = -paddle2.speed;
      } else if (keys["ArrowRight"]) {
        paddle2.dx = paddle2.speed;
      } else {
        paddle2.dx = 0;
      }
    }

    // Contrôles tactiles Joueur 2
    if (touchState.player2.touching) {
      if (isVertical) {
        const deltaY = touchState.player2.currentY - touchState.player2.startY;
        paddle2.y += deltaY * paddleSpeed;
        paddle2.y = Math.max(
          0,
          Math.min(GAME_HEIGHT - paddle2.height, paddle2.y),
        );
        touchState.player2.startY = touchState.player2.currentY;
      } else {
        const deltaX = touchState.player2.currentX - touchState.player2.startX;
        paddle2.x += deltaX * paddleSpeed;
        paddle2.x = Math.max(
          0,
          Math.min(GAME_WIDTH - paddle2.width, paddle2.x),
        );
        touchState.player2.startX = touchState.player2.currentX;
      }
    }

    paddle2.move(frameScale);
  } else {
    // IA
    if (gameState.ballLaunched) {
      paddle2.aiMove(ball);
      paddle2.move(frameScale);
    }
  }

  if (gameState.ballLaunched) {
    ball.move(frameScale);
  }

  requestAnimationFrame(update);
}

function draw() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Ligne centrale
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 2;

  if (isVertical) {
    ctx.beginPath();
    ctx.moveTo(GAME_WIDTH / 2, 0);
    ctx.lineTo(GAME_WIDTH / 2, GAME_HEIGHT);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, GAME_HEIGHT / 2);
    ctx.lineTo(GAME_WIDTH, GAME_HEIGHT / 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Draw
  paddle1.draw();
  paddle2.draw();
  ball.draw();

  requestAnimationFrame(draw);
}

// Start
updateHUD();
update();
draw();
