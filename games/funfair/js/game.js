import { initSettingsUI } from '../../../js/utils/settingsUI.js';
import { startFunfairMusic, playFunfairSound } from '../../../js/utils/audio.js';

initSettingsUI('funfair');

let musicStarted = false;
const startInitialMusic = () => {
  if (!musicStarted) {
    musicStarted = true;
    startFunfairMusic();
    document.removeEventListener('mousedown', startInitialMusic);
    document.removeEventListener('keydown', startInitialMusic);
    document.removeEventListener('touchstart', startInitialMusic);
  }
};
document.addEventListener('mousedown', startInitialMusic);
document.addEventListener('keydown', startInitialMusic);
document.addEventListener('touchstart', startInitialMusic);

// ========================================
// STORAGE KEYS
// ========================================
const STORAGE_KEYS = {
  MONEY: 'global_money',
  TICKETS: 'funfair_tickets',
  STATS: 'funfair_stats'
};

// ========================================
// GAME CONFIGURATION
// ========================================
const GAMES_CONFIG = {
  cups: { name: 'Pyramide de Gobelets', price: 1, tries: 3, reward: 2 },
  shooting: { name: 'Tir à la Cible', price: 5, tries: 5, maxReward: 15 },
  beerpong: { name: 'Beer Pong', price: 5, tries: 10, maxReward: 10 },
  darts: { name: 'Fléchettes', price: 2, tries: 3, maxReward: 5 },
  coverspot: { name: 'Couvre-Tout', price: 3, maxReward: 5 },
  highstriker: { name: 'Marteau de Force', price: 3, maxReward: 5 },
  balloonpop: { name: 'Ballons à Éclater', price: 5, maxReward: 8 },
  ringtoss: { name: 'Anneaux sur Piquets', price: 10, maxReward: 15 }
};

// ========================================
// POPUP SYSTEM
// ========================================
function showPopup(icon, title, message) {
  const overlay = document.getElementById('popupOverlay');
  const iconEl = document.getElementById('popupIcon');
  const titleEl = document.getElementById('popupTitle');
  const messageEl = document.getElementById('popupMessage');
  const button = document.getElementById('popupButton');

  iconEl.textContent = icon;
  titleEl.textContent = title;
  messageEl.textContent = message;

  overlay.classList.add('show');

  return new Promise((resolve) => {
    button.onclick = () => {
      overlay.classList.remove('show');
      resolve();
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
        resolve();
      }
    };
  });
}

// ========================================
// STORAGE HELPERS
// ========================================
function getTickets() {
  const tickets = localStorage.getItem(STORAGE_KEYS.TICKETS);
  return tickets !== null ? parseInt(tickets) : 0;
}

function setTickets(amount) {
  localStorage.setItem(STORAGE_KEYS.TICKETS, amount);
  updateTicketsDisplay();
}

function addTickets(amount) {
  const current = getTickets();
  setTickets(current + amount);
}

function removeTickets(amount) {
  const current = getTickets();
  setTickets(Math.max(0, current - amount));
}

function updateTicketsDisplay() {
  const tickets = getTickets();
  document.getElementById('gameTickets').textContent = tickets;
}

function updateStats(won, ticketsWon) {
  const stats = localStorage.getItem(STORAGE_KEYS.STATS);
  const statsObj = stats ? JSON.parse(stats) : {
    totalGames: 0,
    totalWins: 0,
    totalTicketsWon: 0,
    biggestWin: 0
  };

  statsObj.totalGames++;
  if (won) statsObj.totalWins++;
  if (ticketsWon > 0) {
    statsObj.totalTicketsWon += ticketsWon;
    statsObj.biggestWin = Math.max(statsObj.biggestWin, ticketsWon);
  }

  localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(statsObj));
}

// ========================================
// INITIALIZE
// ========================================
function init() {
  let gameType = sessionStorage.getItem('funfair_current_game');
  if (gameType) gameType = gameType.trim();

  if (!gameType || !GAMES_CONFIG[gameType]) {
    showPopup('⚠️', 'Erreur', 'Type de jeu invalide !').then(() => {
      window.location.href = 'index.html';
    });
    return;
  }

  const config = GAMES_CONFIG[gameType];

  // Update header
  document.getElementById('gameTitle').textContent = config.name;
  document.getElementById('priceAmount').textContent = `${config.price}🎟️`;
  updateTicketsDisplay();

  // Show correct game zone
  document.getElementById(`${gameType}Game`).style.display = 'block';

  // Initialize game
  switch (gameType) {
    case 'cups':
      initCupsGame();
      break;
    case 'shooting':
      initShootingGame();
      break;
    case 'beerpong':
      initBeerpongGame();
      break;
    case 'darts':
      initDartsGame();
      break;
    case 'coverspot':
      initCoverSpotGame();
      break;
    case 'highstriker':
      initHighStrikerGame();
      break;
    case 'balloonpop':
      initBalloonPopGame();
      break;
    case 'ringtoss':
      initRingTossGame();
      break;
  }
}

// ========================================
// GAME 1: PYRAMIDE DE GOBELETS (First Person View) - MOBILE FIXED
// ========================================
let cupsGameState = {
  cups: [],
  cupStructure: [],
  clickTarget: null,
  tries: 3,
  finished: false,
  shooting: false,
  animationId: null
};

function initCupsGame() {
  const canvas = document.getElementById('cupsCanvas');
  const ctx = canvas.getContext('2d');

  // Initialize cups pyramid (21 cups) - RIGHT SIDE UP, 6-5-4-3-2-1 from bottom to top
  cupsGameState.cups = [];
  cupsGameState.cupStructure = [];

  const rows = 6;
  const cupWidth = 50;
  const cupHeight = 60;
  const spacing = 52;
  const spacingY = 65;

  // Build pyramid from bottom (row 0 = 6 cups) to top (row 5 = 1 cup)
  for (let row = 0; row < rows; row++) {
    const cupsInRow = rows - row;
    for (let col = 0; col < cupsInRow; col++) {
      const cup = {
        row: row,
        col: col,
        x: 300 + (col - (cupsInRow - 1) / 2) * spacing,
        y: 350 - row * spacingY,
        fallen: false,
        falling: false,
        fallProgress: 0,
        width: cupWidth,
        height: cupHeight
      };
      cupsGameState.cups.push(cup);
      cupsGameState.cupStructure.push(cup);
    }
  }

  cupsGameState.tries = 3;
  cupsGameState.finished = false;
  cupsGameState.shooting = false;
  cupsGameState.clickTarget = null;

  drawCupsGame(ctx, canvas);

  // Fonction helper pour obtenir les coordonnées précises
  function getCanvasCoordinates(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  // Desktop: Click to aim and shoot
  canvas.onclick = (e) => {
    if (!cupsGameState.shooting && !cupsGameState.finished) {
      const coords = getCanvasCoordinates(e, canvas);
      cupsGameState.clickTarget = coords;
      shootCups(ctx, canvas);
    }
  };

  // Desktop: Hover effect
  canvas.onmousemove = (e) => {
    if (!cupsGameState.shooting && !cupsGameState.finished) {
      const coords = getCanvasCoordinates(e, canvas);
      cupsGameState.clickTarget = coords;
      drawCupsGame(ctx, canvas);
    }
  };

  // Mobile: Touch to aim and shoot
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!cupsGameState.shooting && !cupsGameState.finished) {
      const coords = getCanvasCoordinates(e, canvas);
      cupsGameState.clickTarget = coords;
      shootCups(ctx, canvas);
    }
  }, { passive: false });

  // Mobile: Touch move for aiming preview
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!cupsGameState.shooting && !cupsGameState.finished) {
      const coords = getCanvasCoordinates(e, canvas);
      cupsGameState.clickTarget = coords;
      drawCupsGame(ctx, canvas);
    }
  }, { passive: false });

  // Prevent context menu on long press
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  const shootBtn = document.getElementById('cupsShootBtn');
  shootBtn.style.display = 'none';

  document.getElementById('cupsNewGameBtn').onclick = () => {
    const tickets = getTickets();
    if (tickets < 1) {
      showPopup('🎟️', 'Tickets insuffisants', 'Vous n\'avez pas assez de tickets !');
      return;
    }
    removeTickets(1);
    updateStats(false, 0);
    if (cupsGameState.animationId) cancelAnimationFrame(cupsGameState.animationId);
    initCupsGame();
    document.getElementById('cupsResult').className = 'result-message';
    document.getElementById('cupsNewGameBtn').style.display = 'none';
  };
}

function drawCupsGame(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background - perspective floor
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#87ceeb');
  gradient.addColorStop(0.4, '#fef3c7');
  gradient.addColorStop(1, '#d4a574');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw table surface with perspective
  ctx.fillStyle = '#8b4513';
  ctx.beginPath();
  ctx.moveTo(0, 350);
  ctx.lineTo(600, 350);
  ctx.lineTo(600, 500);
  ctx.lineTo(0, 500);
  ctx.closePath();
  ctx.fill();

  // Sort cups by depth (draw far ones first)
  const sortedCups = [...cupsGameState.cups].sort((a, b) => (b.depth || 0) - (a.depth || 0));

  // Draw cups - RIGHT SIDE UP (opening at top)
  sortedCups.forEach((cup) => {
    if (!cup.fallen) {
      const w = cup.width;
      const h = cup.height;

      if (cup.falling) {
        cup.fallProgress += 0.15;
        const fallOffset = cup.fallProgress * 50;
        const rotation = cup.fallProgress * 90;

        ctx.save();
        ctx.translate(cup.x, cup.y + fallOffset);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0.3, 1 - cup.fallProgress);

        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-w / 2, -h / 2, w, h);

        ctx.restore();

        if (cup.fallProgress >= 1) {
          cup.fallen = true;
          cup.falling = false;
        }
      } else {
        // Cup body (trapezoid - wider at top)
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(cup.x - w / 2 + 3, cup.y + h);
        ctx.lineTo(cup.x - w / 2, cup.y);
        ctx.lineTo(cup.x + w / 2, cup.y);
        ctx.lineTo(cup.x + w / 2 - 3, cup.y + h);
        ctx.closePath();
        ctx.fill();

        // Cup rim (at top)
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(cup.x - w / 2 - 2, cup.y - 4, w + 4, 4);

        // Cup shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(cup.x - w / 2 + 4, cup.y + 5, 6, 20);
      }
    }
  });

  // Draw crosshair/aim indicator
  if (!cupsGameState.shooting && cupsGameState.clickTarget) {
    const target = cupsGameState.clickTarget;

    // Crosshair
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(target.x - 20, target.y);
    ctx.lineTo(target.x + 20, target.y);
    ctx.moveTo(target.x, target.y - 20);
    ctx.lineTo(target.x, target.y + 20);
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(target.x, target.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Trajectory line from center bottom
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(300, canvas.height);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw hint
  if (!cupsGameState.shooting && !cupsGameState.finished) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.font = 'bold 16px Poppins';
    ctx.textAlign = 'center';
    ctx.fillText('👆 Touchez pour lancer la balle', 300, 30);
  }
}

function shootCups(ctx, canvas) {
  if (cupsGameState.finished || cupsGameState.shooting || !cupsGameState.clickTarget) return;

  cupsGameState.shooting = true;
  playFunfairSound('throw');

  const startX = 300;
  const startY = canvas.height;
  const targetX = cupsGameState.clickTarget.x;
  const targetY = cupsGameState.clickTarget.y;

  const ballRadius = 30;
  let hitCups = [];
  cupsGameState.cups.forEach(cup => {
    if (!cup.fallen && !cup.falling) {
      const w = cup.width;
      const h = cup.height;

      if (Math.abs(targetX - cup.x) < w / 2 + ballRadius &&
        targetY >= cup.y - ballRadius && targetY <= cup.y + h + ballRadius) {
        hitCups.push(cup);
      }
    }
  });

  const dx = targetX - startX;
  const dy = targetY - startY;
  const steps = 60;
  const stepX = dx / steps;
  const stepY = dy / steps;

  const ball = {
    x: startX,
    y: startY,
    step: 0
  };

  const animate = () => {
    ball.step++;
    ball.x += stepX;
    ball.y += stepY;

    const progress = ball.step / steps;
    const ballSize = 30 * (1 - progress * 0.7);

    drawCupsGame(ctx, canvas);

    const gradient = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, ballSize);
    gradient.addColorStop(0, '#fff9c4');
    gradient.addColorStop(0.3, '#fbbf24');
    gradient.addColorStop(1, '#f59e0b');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ballSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(ball.x - ballSize / 3, ball.y - ballSize / 3, ballSize / 3, 0, Math.PI * 2);
    ctx.fill();

    if (ball.step < steps) {
      requestAnimationFrame(animate);
    } else {
      if (hitCups.length > 0) {
        playFunfairSound('cupsCrash');
        hitCups.forEach(cup => {
          cup.falling = true;
          applyCupPhysics(cup);
        });
        animateFallingCups(ctx, canvas);
      } else {
        finishShot(ctx, canvas);
      }
    }
  };

  requestAnimationFrame(animate);
}

function applyCupPhysics(hitCup) {
  const hitRow = hitCup.row;
  const hitCol = hitCup.col;

  cupsGameState.cups.forEach(cup => {
    if (cup.row > hitRow && !cup.fallen && !cup.falling) {
      const isSupportedByHitCup =
        (cup.row === hitRow + 1) &&
        (cup.col === hitCol || cup.col === hitCol - 1);

      if (isSupportedByHitCup) {
        const leftSupport = cupsGameState.cups.find(c =>
          c.row === cup.row - 1 &&
          c.col === cup.col &&
          !c.fallen &&
          !c.falling
        );

        const rightSupport = cupsGameState.cups.find(c =>
          c.row === cup.row - 1 &&
          c.col === cup.col + 1 &&
          !c.fallen &&
          !c.falling
        );

        if (!leftSupport && !rightSupport) {
          cup.falling = true;
          applyCupPhysics(cup);
        }
      }
    }
  });
}

function animateFallingCups(ctx, canvas) {
  const animate = () => {
    let stillFalling = false;

    cupsGameState.cups.forEach(cup => {
      if (cup.falling) {
        stillFalling = true;
      }
    });

    drawCupsGame(ctx, canvas);

    if (stillFalling) {
      requestAnimationFrame(animate);
    } else {
      finishShot(ctx, canvas);
    }
  };

  requestAnimationFrame(animate);
}

function finishShot(ctx, canvas) {
  cupsGameState.shooting = false;
  cupsGameState.tries--;

  document.getElementById('cupsTriesDisplay').textContent = `Essais restants : ${cupsGameState.tries}`;

  const allFallen = cupsGameState.cups.every(cup => cup.fallen);

  if (allFallen) {
    cupsGameState.finished = true;
    addTickets(2);
    updateStats(true, 2);
    playFunfairSound('win');
    showResult('cupsResult', 'win', '🎉 Victoire ! Tous les gobelets sont tombés ! +2🎟️');
    document.getElementById('cupsNewGameBtn').style.display = 'block';
    createConfetti();
  } else if (cupsGameState.tries === 0) {
    cupsGameState.finished = true;
    updateStats(false, 0);
    playFunfairSound('lose');
    const fallen = cupsGameState.cups.filter(c => c.fallen).length;
    showResult('cupsResult', 'lose', `😢 Perdu ! ${fallen}/21 gobelets tombés.`);
    document.getElementById('cupsNewGameBtn').style.display = 'block';
  }

  drawCupsGame(ctx, canvas);
}
// ========================================
// GAME 2: TIR À LA CIBLE
// ========================================
let shootingGameState = {
  tries: 5,
  score: 0,
  finished: false,
  targetX: 300,
  targetVelocity: 5,
  shooting: false,
  animationId: null,
  startTime: 0 // To track time for breathing effect
};

function initShootingGame() {
  const canvas = document.getElementById('shootingCanvas');
  const ctx = canvas.getContext('2d');

  shootingGameState = {
    tries: 5,
    score: 0,
    finished: false,
    targetX: 300,
    targetVelocity: 5,
    shooting: false,
    startTime: Date.now(),
    impacts: []
  };

  // Animate moving target & breathing crosshair
  function animateGame() {
    if (!shootingGameState.finished) {
      if (!shootingGameState.shooting) {
        shootingGameState.targetX += shootingGameState.targetVelocity;

        if (shootingGameState.targetX <= 150 || shootingGameState.targetX >= 450) {
          shootingGameState.targetVelocity *= -1;
        }
      }

      drawShootingGame(ctx, canvas);
      shootingGameState.animationId = requestAnimationFrame(animateGame);
    }
  }

  animateGame();

  const shootBtn = document.getElementById('shootingShootBtn');
  shootBtn.disabled = false;
  shootBtn.onclick = () => shootTarget(ctx, canvas);

  // Canvas interaction for Shooting
  canvas.onclick = () => shootTarget(ctx, canvas);
  canvas.ontouchstart = (e) => {
    e.preventDefault();
    shootTarget(ctx, canvas);
  };

  document.getElementById('shootingNewGameBtn').onclick = () => {
    const tickets = getTickets();
    if (tickets < 5) {
      showPopup('🎟️', 'Tickets insuffisants', 'Vous n\'avez pas assez de tickets !');
      return;
    }
    removeTickets(5);
    updateStats(false, 0);
    if (shootingGameState.animationId) cancelAnimationFrame(shootingGameState.animationId);
    initShootingGame();
    document.getElementById('shootingResult').className = 'result-message';
    document.getElementById('shootingNewGameBtn').style.display = 'none';
  };
}

function getCrosshairPosition() {
  const time = (Date.now() - shootingGameState.startTime) / 1000;
  // Breathing effect: slight figure-8 movement
  const offsetX = Math.sin(time * 1.5) * 15; // Horizontal sway
  const offsetY = Math.sin(time * 3) * 10;   // Vertical heave (faster)

  return {
    x: 300 + offsetX,
    y: 300 + offsetY
  };
}

function drawShootingGame(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background - far away
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Target far away (passes through center view)
  const centerX = shootingGameState.targetX;
  const centerY = 300; // Aligned with crosshair center height (User set crosshair to 300)

  // Target circles - SMALLER
  const circles = [
    { radius: 30, color: '#ffffff' },
    { radius: 22, color: '#dc2626' },
    { radius: 15, color: '#ffffff' },
    { radius: 8, color: '#dc2626' },
    { radius: 4, color: '#fbbf24' }
  ];

  circles.forEach(circle => {
    ctx.fillStyle = circle.color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, circle.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw bullet impacts
  shootingGameState.impacts.forEach(impact => {
    ctx.fillStyle = '#1e293b'; // Dark impact mark
    ctx.beginPath();
    ctx.arc(centerX + impact.dx, centerY + impact.dy, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Current crosshair position (with breathing)
  const crosshair = getCrosshairPosition();

  // Scope overlay (moves with crosshair)
  // Draw a giant rectangle with a hole in the middle using winding rule (even-odd not needed if drawn counter-clockwise)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
  ctx.beginPath();
  // Outer rectangle (screen)
  ctx.rect(0, 0, canvas.width, canvas.height);
  // Inner circle (hole) - drawn counter-clockwise ensures it subtracts
  ctx.arc(crosshair.x, crosshair.y, 150, 0, Math.PI * 2, true);
  ctx.fill();

  // Crosshair lines
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1; // Thinner lines for precision
  ctx.beginPath();

  // Horizontal line
  ctx.moveTo(crosshair.x - 150, crosshair.y);
  ctx.lineTo(crosshair.x + 150, crosshair.y);

  // Vertical line
  ctx.moveTo(crosshair.x, crosshair.y - 150);
  ctx.lineTo(crosshair.x, crosshair.y + 150);

  ctx.stroke();

  // Center dot
  ctx.fillStyle = '#ef4444'; // Red dot for better contrast
  ctx.beginPath();
  ctx.arc(crosshair.x, crosshair.y, 2, 0, Math.PI * 2);
  ctx.fill();

  // Distance indicator
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 14px Poppins';
  ctx.textAlign = 'right';
  ctx.fillText('Distance: 100m', 580, 30);
}

function shootTarget(ctx, canvas) {
  if (shootingGameState.finished || shootingGameState.shooting) return;

  shootingGameState.shooting = true;
  document.getElementById('shootingShootBtn').disabled = true;
  playFunfairSound('shoot');

  // Get current crosshair position (where aim is right now)
  const crosshair = getCrosshairPosition();
  const targetX = shootingGameState.targetX;
  const targetY = 300; // Fixed height now

  // Calculate distance from crosshair center to target center
  const dx = targetX - crosshair.x;
  const dy = targetY - crosshair.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Flash effect
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  //setTimeout(() => {
  shootingGameState.tries--;

  // Check hit - target is radius 30 total
  let hit = false;
  let points = 0;

  // Hit zones
  if (distance <= 4) { // Bullseye
    points = 3;
    hit = true;
  } else if (distance <= 15) { // Inner ring
    points = 2;
    hit = true;
  } else if (distance <= 30) { // Outer ring
    points = 1;
    hit = true;
  }

  if (hit) {
    if (distance <= 4) {
      playFunfairSound('shootBullseye');
    } else {
      playFunfairSound('shootHit');
    }
    shootingGameState.score += points;
    const impactDx = crosshair.x - targetX;
    const impactDy = crosshair.y - targetY;
    shootingGameState.impacts.push({ dx: impactDx, dy: impactDy });
  } else {
    playFunfairSound('shootMiss');
  }

  document.getElementById('shootingTriesDisplay').textContent = `Tirs restants : ${shootingGameState.tries}`;
  document.getElementById('shootingScoreDisplay').textContent = `Score : ${shootingGameState.score}🎟️`;

  if (shootingGameState.tries === 0) {
    shootingGameState.finished = true;

    if (shootingGameState.score > 0) {
      addTickets(shootingGameState.score);
      updateStats(true, shootingGameState.score);
      showResult('shootingResult', 'win', `🎯 Bien joué ! Vous gagnez ${shootingGameState.score}🎟️`);
      if (shootingGameState.score >= 5) createConfetti();
    } else {
      updateStats(false, 0);
      showResult('shootingResult', 'lose', '😢 Cible manquée ! Trop dur ?');
    }

    document.getElementById('shootingNewGameBtn').style.display = 'block';
  } else {
    shootingGameState.shooting = false;
    document.getElementById('shootingShootBtn').disabled = false;
  }
  //}, 50);
}

// ========================================
// GAME 3: BEER PONG
// ========================================
let beerpongGameState = {
  cups: [],
  tries: 10,
  score: 0,
  phase: 'AIMING', // AIMING, POWER, SHOOTING
  angle: 90,       // 90 is center
  angleSpeed: 1.5,
  angleDir: 1,
  power: 50,        // 0 to 100
  powerSpeed: 2,
  powerDir: 1,
  ball: null,
  finished: false,
  animationId: null
};

function initBeerpongGame() {
  const canvas = document.getElementById('beerpongCanvas');
  const ctx = canvas.getContext('2d');

  // Initialize game state
  beerpongGameState = {
    cups: [],
    tries: 10,
    score: 0,
    phase: 'AIMING',
    angle: 90,
    angleSpeed: 1.5,
    angleDir: 1,
    power: 50,
    powerSpeed: 2,
    powerDir: 1,
    ball: null,
    finished: false,
    animationId: null
  };

  // Initialize cups in 3D pyramid (4-3-2-1)
  // z represents depth (0 is close, 100 is far)
  const rows = 4;
  const cupSpacingX = 40;
  const cupSpacingZ = 30; // Close spacing in depth
  const startZ = 250;     // Distance from player

  for (let row = 0; row < rows; row++) {
    const cupsInRow = 4 - row; // 4, 3, 2, 1
    // Center rows
    const rowWidth = (cupsInRow - 1) * cupSpacingX;

    for (let col = 0; col < cupsInRow; col++) {
      beerpongGameState.cups.push({
        x: -rowWidth / 2 + col * cupSpacingX, // Centered at x=0
        z: startZ + row * cupSpacingZ,
        y: 0, // Table height level
        hit: false,
        ballInside: null // Store ball object if hit
      });
    }
  }

  // Animation Loop
  function animateGame() {
    if (!beerpongGameState.finished) {
      updateBeerpongLogic(canvas);
      drawBeerpongGame(ctx, canvas);
      beerpongGameState.animationId = requestAnimationFrame(animateGame);
    }
  }

  animateGame();

  // Setup Buttons
  const lockBtn = document.getElementById('beerpongLockBtn');
  lockBtn.innerHTML = "🎯 Viser (Clic 1: Angle, Clic 2: Force)";
  lockBtn.style.display = 'block';
  lockBtn.disabled = false;
  lockBtn.onclick = () => handleBeerpongClick(ctx, canvas);

  // Canvas interaction for Beer Pong
  canvas.onclick = () => handleBeerpongClick(ctx, canvas);
  canvas.ontouchstart = (e) => {
    e.preventDefault();
    handleBeerpongClick(ctx, canvas);
  };

  // Hide unused elements from previous version
  document.getElementById('beerpongShootBtn').style.display = 'none';
  document.getElementById('beerpongAngleDisplay').style.display = 'none';
  document.getElementById('beerpongPowerDisplay').style.display = 'none';

  // Helper to show tries
  const updateUI = () => {
    document.getElementById('beerpongTriesDisplay').textContent = `Lancers restants : ${beerpongGameState.tries}`;
    document.getElementById('beerpongScoreDisplay').textContent = `Gobelets touchés : ${beerpongGameState.score}/10`;
  };
  updateUI();

  document.getElementById('beerpongNewGameBtn').onclick = () => {
    const tickets = getTickets();
    if (tickets < 5) {
      showPopup('🎟️', 'Tickets insuffisants', 'Vous n\'avez pas assez de tickets !');
      return;
    }
    removeTickets(5);
    updateStats(false, 0);
    if (beerpongGameState.animationId) cancelAnimationFrame(beerpongGameState.animationId);
    initBeerpongGame();
    document.getElementById('beerpongResult').className = 'result-message';
    document.getElementById('beerpongNewGameBtn').style.display = 'none';
  };
}

function updateBeerpongLogic(canvas) {
  // Phase 1: Oscillate Angle (Left/Right)
  if (beerpongGameState.phase === 'AIMING') {
    beerpongGameState.angle += beerpongGameState.angleSpeed * beerpongGameState.angleDir;
    if (beerpongGameState.angle <= 10 || beerpongGameState.angle >= 170) {
      beerpongGameState.angleDir *= -1;
    }
  }
  // Phase 2: Oscillate Power (Weak/Strong)
  else if (beerpongGameState.phase === 'POWER') {
    beerpongGameState.power += beerpongGameState.powerSpeed * beerpongGameState.powerDir;
    if (beerpongGameState.power <= 1 || beerpongGameState.power >= 100) {
      beerpongGameState.powerDir *= -1;
    }
  }
  // Phase 3: Simulate Ball Physics
  else if (beerpongGameState.phase === 'SHOOTING' && beerpongGameState.ball) {
    const ball = beerpongGameState.ball;

    // Store previous height to detect rim crossing
    const prevHeight = ball.height;

    // Physics Step
    ball.x += ball.vx;
    ball.height += ball.vy;
    ball.z += ball.vz;
    ball.vy -= 0.5; // Gravity

    // 3D CUP COLLISION
    // Logical Cup Dimensions
    const CUP_H = 60;
    const CUP_R = 25;     // Outer radius
    const CUP_INNER_R = 15; // Inner radius (hole)

    // Only check cup interactions if ball is potentially interacting (above ground, low enough)
    if (ball.height < CUP_H + 10 && ball.height > 0) {
      let hitCup = null;

      for (const cup of beerpongGameState.cups) {
        if (cup.hit) continue; // Skip filled cups

        const dx = ball.x - cup.x;
        const dz = ball.z - cup.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < CUP_R) {
          // Horizontal Collision Candidate

          // Case 1: Entering from Top (Rim Crossing)
          if (prevHeight >= CUP_H && ball.height < CUP_H) {
            if (dist < CUP_INNER_R) {
              // SCORED!
              hitCup = cup;
              playFunfairSound('pongSplash');
              // ... handle score below
            } else {
              // RIM HIT (Edge of cup)
              // Bounce up and randomly away
              ball.height = CUP_H + 1; // Keep above
              ball.vy *= -0.6; // Lossy bounce
              ball.vx += (Math.random() - 0.5) * 5; // Random deflection
              ball.vz += (Math.random() - 0.5) * 5;
              playFunfairSound('pongBounce');
            }
          }
          // Case 2: Hitting Side (Was already below rim)
          else if (ball.height < CUP_H) {
            // Side impact
            // Stop horizontal momentum and fall
            ball.vx *= -0.2; // Dead bounce
            ball.vz *= -0.2;
            ball.x += dx * 0.1; // Push out slightly
            ball.z += dz * 0.1;
          }

          if (hitCup) break;
        }
      }

      if (hitCup) {
        hitCup.hit = true;
        hitCup.ballInside = { x: ball.x, z: ball.z };
        beerpongGameState.score++;
        beerpongGameState.ball = null;
        finishThrow();
        return; // Exit physics loop
      }
    }

    // GROUND / TABLE COLLISION
    if (ball.height <= 0) {
      // Hit Table or Floor (Missed cups)

      if (Math.abs(ball.vy) > 2) {
        // Bounce
        ball.height = 0;
        ball.vy *= -0.5; // Damping
        ball.vx *= 0.8;
        ball.vz *= 0.8;
        playFunfairSound('pongBounce');
      } else {
        // Stop completely
        beerpongGameState.ball = null;
        finishThrow();
      }
    }

    // Safety kill
    if (ball.z > 800 || ball.height < -100) {
      beerpongGameState.ball = null;
      finishThrow();
    }
  }
}

function finishThrow() {
  beerpongGameState.tries--;
  document.getElementById('beerpongTriesDisplay').textContent = `Lancers restants : ${beerpongGameState.tries}`;
  document.getElementById('beerpongScoreDisplay').textContent = `Gobelets touchés : ${beerpongGameState.score}/10`;

  if (beerpongGameState.tries <= 0) {
    beerpongGameState.finished = true;
    showResult('beerpongResult', beerpongGameState.score > 0 ? 'win' : 'lose',
      `Partie terminée ! Score: ${beerpongGameState.score}/10`);
    if (beerpongGameState.score > 0) {
      addTickets(beerpongGameState.score);
      updateStats(true, beerpongGameState.score);
      if (beerpongGameState.score >= 5) createConfetti();
    } else {
      updateStats(false, 0);
    }
    document.getElementById('beerpongNewGameBtn').style.display = 'block';
  } else {
    // Reset for next throw
    beerpongGameState.phase = 'AIMING';
    document.getElementById('beerpongLockBtn').innerHTML = "🎯 Viser (Clic 1: Angle, Clic 2: Force)";
    document.getElementById('beerpongLockBtn').disabled = false;
  }
}

function handleBeerpongClick(ctx, canvas) {
  if (beerpongGameState.finished) return;

  const btn = document.getElementById('beerpongLockBtn');

  if (beerpongGameState.phase === 'AIMING') {
    beerpongGameState.phase = 'POWER';
    btn.innerHTML = "💪 Force ! (Clic pour tirer)";
  } else if (beerpongGameState.phase === 'POWER') {
    beerpongGameState.phase = 'SHOOTING';
    btn.disabled = true;
    btn.innerHTML = "🚀 Tir en cours...";

    playFunfairSound('throw');

    // Launch Ball
    // Calculate 3D velocity vector
    const angleRad = (beerpongGameState.angle - 90) * Math.PI / 180; // Deviation from center
    const powerFactor = beerpongGameState.power / 12; // Adjusted power

    // Calculate total horizontal speed based on power
    // Previously vz was approx 5 + power*0.8
    const horizontalSpeed = 5 + (powerFactor * 0.8);

    beerpongGameState.ball = {
      x: 0,        // Start center
      height: 40,  // Start slightly above table
      z: 0,        // Start at player position
      vx: Math.sin(angleRad) * horizontalSpeed, // X component
      vy: 6 + (powerFactor * 0.5), // Upward arc
      vz: Math.cos(angleRad) * horizontalSpeed  // Z component
    };
  }
}

function drawBeerpongGame(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Perspective params
  const centerX = canvas.width / 2;
  const horizonY = 150;
  const groundY = 600;

  // Draw Room/Background
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#1e293b');
  gradient.addColorStop(0.5, '#334155');
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Table (Trapezoid perspective)
  ctx.fillStyle = '#16a34a'; // Green felt
  ctx.beginPath();
  ctx.moveTo(centerX - 150, horizonY + 50); // Far left
  ctx.lineTo(centerX + 150, horizonY + 50); // Far right
  ctx.lineTo(centerX + 300, groundY);       // Near right
  ctx.lineTo(centerX - 300, groundY);       // Near left
  ctx.closePath();
  ctx.fill();

  // Table Border
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.stroke();

  // 3D Projection Helper
  const project = (x, y, z) => {
    // Simple perspective projection
    // z=0 is near (scale 1), z=large is far (scale small)
    const scale = 300 / (300 + z);
    const px = centerX + x * scale * 2.5; // X spread
    const py = groundY - 50 - y * scale;  // Y height (reversed, up is -y) - z depth also moves up slightly in 2D
    // Actually, on a flat table:
    // ScreenY = TableBaseY - (Z * perspective) - (Height * perspective)
    // Let's approximate:
    const tableDepthY = (groundY - (horizonY + 50));
    const zProgress = z / 400; // 0 to 1
    const tableY = groundY - (zProgress * tableDepthY);

    return {
      x: centerX + (x * scale * 1.5),
      y: tableY - (y * scale),
      scale: scale
    };
  };

  // Draw Cups - Sort by Z (far to near) so near cups overlap far ones
  // But actually, far cups should be drawn first (Painter's algorithm)
  // Reversing Z sort
  const sortedCups = [...beerpongGameState.cups].sort((a, b) => b.z - a.z);

  sortedCups.forEach(cup => {
    const p = project(cup.x, 0, cup.z);
    const radius = 25 * p.scale;
    const height = 60 * p.scale;

    // Cup Body (Trapezoid with rounded bottom)
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();

    ctx.moveTo(p.x - radius, p.y - height);
    ctx.lineTo(p.x + radius, p.y - height);
    ctx.lineTo(p.x + radius * 0.7, p.y);

    // COURBE pour le bas du gobelet
    ctx.quadraticCurveTo(p.x, p.y + 4, p.x - radius * 0.7, p.y);

    ctx.closePath();
    ctx.fill();


    // Cup Rim (Ellipse)
    ctx.fillStyle = '#b91c1c'; // Dark Inside
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - height, radius, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff'; // Rim loop
    ctx.lineWidth = 1;
    ctx.stroke();

    // Ball inside?
    if (cup.hit) {
      ctx.fillStyle = '#fbbf24'; // Ping pong ball
      ctx.beginPath();
      // Draw ball "in" the cup
      ctx.arc(p.x, p.y - height + 5 * p.scale, 8 * p.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Draw Active Ball
  if (beerpongGameState.ball) {
    const b = beerpongGameState.ball;
    const p = project(b.x, b.height, b.z);

    // Shadow
    const pShadow = project(b.x, 0, b.z); // Height 0
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(pShadow.x, pShadow.y, 10 * pShadow.scale, 5 * pShadow.scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10 * p.scale, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(p.x - 3 * p.scale, p.y - 3 * p.scale, 3 * p.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw UI Overlays (Angle / Power)
  if (beerpongGameState.phase !== 'SHOOTING' && !beerpongGameState.finished) {
    // Draw Launch Origin
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(centerX, groundY - 20, 20, 0, Math.PI * 2);
    ctx.fill();

    // Angle Indicator
    const angleRad = (beerpongGameState.angle - 90) * Math.PI / 180;
    const length = 100;
    const endX = centerX + Math.sin(angleRad) * length;
    const endY = (groundY - 20) - Math.cos(angleRad) * length;

    ctx.strokeStyle = beerpongGameState.phase === 'AIMING' ? '#fbbf24' : 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(centerX, groundY - 20);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Power Indicator (Bar on right)
    const barX = canvas.width - 50;
    const barY = canvas.height - 50;
    const barW = 20;
    const barH = 200;

    // Background
    ctx.fillStyle = '#334155';
    ctx.fillRect(barX, barY - barH, barW, barH);

    // Fill
    const fillH = (beerpongGameState.power / 100) * barH;

    // Color gradient based on power
    const hue = (1 - beerpongGameState.power / 100) * 120; // Green to Red
    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
    ctx.fillRect(barX, barY - fillH, barW, fillH);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY - barH, barW, barH);

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = '12px Poppins';
    ctx.textAlign = 'center';
    ctx.fillText(beerpongGameState.phase === 'POWER' ? 'FORCE' : 'Force', barX + 10, barY + 20);
  }
}



// ========================================
// GAME 4: FLÉCHETTES
// ========================================
let dartsGameState = {
  tries: 3,
  totalScore: 0,
  finished: false,
  darts: [],
  crosshairX: 300,
  crosshairY: 300,
  velocityX: 4,
  velocityY: 3,
  shooting: false,
  animationId: null
};

function initDartsGame() {
  const canvas = document.getElementById('dartsCanvas');
  const ctx = canvas.getContext('2d');

  dartsGameState = {
    tries: 3,
    totalScore: 0,
    finished: false,
    darts: [],
    crosshairX: 300,
    crosshairY: 300,
    velocityX: 4,
    velocityY: 3,
    shooting: false
  };

  // Animate crosshair
  function animateCrosshair() {
    if (!dartsGameState.shooting && !dartsGameState.finished) {
      dartsGameState.crosshairX += dartsGameState.velocityX;
      dartsGameState.crosshairY += dartsGameState.velocityY;

      if (dartsGameState.crosshairX <= 150 || dartsGameState.crosshairX >= 450) {
        dartsGameState.velocityX *= -1;
      }
      if (dartsGameState.crosshairY <= 150 || dartsGameState.crosshairY >= 450) {
        dartsGameState.velocityY *= -1;
      }

      drawDartsGame(ctx, canvas);
      dartsGameState.animationId = requestAnimationFrame(animateCrosshair);
    }
  }

  animateCrosshair();

  const throwBtn = document.getElementById('dartsThrowBtn');
  throwBtn.disabled = false;
  throwBtn.onclick = () => throwDart(ctx, canvas);

  // Canvas interaction for Darts
  canvas.onclick = () => throwDart(ctx, canvas);
  canvas.ontouchstart = (e) => {
    e.preventDefault();
    throwDart(ctx, canvas);
  };

  document.getElementById('dartsNewGameBtn').onclick = () => {
    const tickets = getTickets();
    if (tickets < 2) {
      showPopup('🎟️', 'Tickets insuffisants', 'Vous n\'avez pas assez de tickets !');
      return;
    }
    removeTickets(2);
    updateStats(false, 0);
    if (dartsGameState.animationId) cancelAnimationFrame(dartsGameState.animationId);
    initDartsGame();
    document.getElementById('dartsResult').className = 'result-message';
    document.getElementById('dartsNewGameBtn').style.display = 'none';
  };
}

function drawDartsGame(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const centerX = 300;
  const centerY = 300;

  // Board background (slightly larger than max radius)
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 200, 0, Math.PI * 2);
  ctx.fill();

  // Zones Radii
  const R5 = 180; // Outer Ring
  const R4 = 135; // Middle Ring
  const R3 = 105; // Inner Ring
  const R2 = 35;  // Outer Bull
  const R1 = 15;  // Bullseye

  const sections = 20;

  for (let i = 0; i < sections; i++) {
    const angle1 = (i / sections) * Math.PI * 2 - Math.PI / 2;
    const angle2 = ((i + 1) / sections) * Math.PI * 2 - Math.PI / 2;

    // Draw from outside in (Painter's algorithm)

    // Zone 5: Outer Ring (135-180)
    // White (Odd) / Black (Even) -> User said: "blancs: 1pt, noirs: 0pt"
    // Usually standard board alternates. Let's assume i%2==0 is Black.
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, R5, angle1, angle2);
    ctx.fillStyle = i % 2 === 0 ? '#000000' : '#f8fafc'; // Black / White
    ctx.fill();

    // Zone 4: Middle Ring (105-135)
    // Green (Odd) / Red (Even) -> "vert: 10, rouges: 5"
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, R4, angle1, angle2);
    ctx.fillStyle = i % 2 === 0 ? '#dc2626' : '#10b981'; // Red / Green
    ctx.fill();

    // Zone 3: Inner Ring (35-105)
    // White (Odd) / Black (Even) -> "blancs: 20, noirs: 15"
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, R3, angle1, angle2);
    ctx.fillStyle = i % 2 === 0 ? '#000000' : '#f8fafc'; // Black / White
    ctx.fill();
  }

  // Zone 2: Outer Bull (15-35) -> Green 35pts
  ctx.beginPath();
  ctx.arc(centerX, centerY, R2, 0, Math.PI * 2);
  ctx.fillStyle = '#10b981';
  ctx.fill();
  // Stroke to separate
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Zone 1: Bullseye (0-15) -> Red 50pts
  ctx.beginPath();
  ctx.arc(centerX, centerY, R1, 0, Math.PI * 2);
  ctx.fillStyle = '#dc2626';
  ctx.fill();
  ctx.stroke();

  // Wireframe lines for segments (optional but looks better)
  ctx.beginPath();
  for (let i = 0; i < sections; i++) {
    const angle = (i / sections) * Math.PI * 2 - Math.PI / 2;
    ctx.moveTo(centerX + R1 * Math.cos(angle), centerY + R1 * Math.sin(angle));
    ctx.lineTo(centerX + R5 * Math.cos(angle), centerY + R5 * Math.sin(angle));
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw thrown darts
  dartsGameState.darts.forEach((dart, index) => {
    // 3D Perspective Logic
    // Vanishing Point shifted down by 100px (looking from below)
    const vpX = centerX;
    const vpY = centerY + 100;

    // Angle pointing towards VP
    const angleToVP = Math.atan2(vpY - dart.y, vpX - dart.x);

    // Distance to VP determines foreshortening (closer = shorter/more head-on)
    const distToVP = Math.sqrt((vpX - dart.x) ** 2 + (vpY - dart.y) ** 2);
    const maxDist = 450; // Approx max diagonal
    const minLen = 5;    // Very short if hitting exactly VP
    const maxLen = 70;   // Long if hitting far away

    // Clamp length
    const length = minLen + (Math.min(distToVP, maxDist) / maxDist) * (maxLen - minLen);

    // Tail coordinates (projected towards VP)
    const tailX = dart.x + Math.cos(angleToVP) * length;
    const tailY = dart.y + Math.sin(angleToVP) * length;

    // Shadow (offset on ground) -> Scaled by perspective too? 
    // Just keep simple shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;

    // Dart Shaft (Grey/Silver)
    ctx.strokeStyle = '#94a3b8'; // Slate 400
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(dart.x, dart.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    // Remove shadow for details
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Dart Flights (at tail)
    // Draw a small cross/'X' perspective
    // Scale flights slightly by distance? (Farther = smaller flights visually?)
    // Actually, tail is closer to camera (usually), so flights should be larger?
    // But since we fake it, constant size is fine. Maybe scale with length?
    const flightSize = 10 + (length / maxLen) * 5;

    ctx.fillStyle = index % 2 === 0 ? '#ef4444' : '#3b82f6'; // Red or Blue flights

    ctx.beginPath();
    // Wing 1 (Perpendicular to shaft direction)
    // We need normal vector to shaft
    const normAngle = angleToVP + Math.PI / 2;

    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tailX + Math.cos(normAngle) * flightSize, tailY + Math.sin(normAngle) * flightSize);
    ctx.lineTo(tailX - Math.cos(angleToVP) * 10, tailY - Math.sin(angleToVP) * 10);
    ctx.fill();

    // Wing 2
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tailX - Math.cos(normAngle) * flightSize, tailY - Math.sin(normAngle) * flightSize);
    ctx.lineTo(tailX - Math.cos(angleToVP) * 10, tailY - Math.sin(angleToVP) * 10);
    ctx.fill();


    // Dart Tip (Gold) - The scoring point
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(dart.x, dart.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Score popup text
    if (dart.scoreText) {
      ctx.font = 'bold 16px Poppins';
      ctx.textAlign = 'center';

      // Text Stroke (Black outline)
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(dart.scoreText, dart.x, dart.y - 20);

      // Text Fill (Bright Cyan)
      ctx.fillStyle = '#22d3ee';
      ctx.fillText(dart.scoreText, dart.x, dart.y - 20);
    }
  });

  // Draw crosshair
  if (!dartsGameState.shooting) {
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(dartsGameState.crosshairX - 20, dartsGameState.crosshairY);
    ctx.lineTo(dartsGameState.crosshairX + 20, dartsGameState.crosshairY);
    ctx.moveTo(dartsGameState.crosshairX, dartsGameState.crosshairY - 20);
    ctx.lineTo(dartsGameState.crosshairX, dartsGameState.crosshairY + 20);
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(dartsGameState.crosshairX, dartsGameState.crosshairY, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function throwDart(ctx, canvas) {
  if (dartsGameState.finished || dartsGameState.shooting) return;

  dartsGameState.shooting = true;
  document.getElementById('dartsThrowBtn').disabled = true;
  playFunfairSound('dartThrow');

  const x = dartsGameState.crosshairX;
  const y = dartsGameState.crosshairY;

  const centerX = 300;
  const centerY = 300;
  const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

  // Scoring Logic based on Distance and Angle/Color
  let score = 0;

  // Calculate Section Index (0-19) for alternating colors
  // Angle relative to vertical -PI/2
  let angle = Math.atan2(y - centerY, x - centerX); // -PI to PI
  angle += Math.PI / 2; // Shift so top is 0
  if (angle < 0) angle += Math.PI * 2;

  const sectionIndex = Math.floor((angle / (Math.PI * 2)) * 20);
  const isEven = sectionIndex % 2 === 0;
  // Map: Even -> Black/Red, Odd -> White/Green (based on drawing logic)

  if (distance <= 15) {
    score = 50; // Bullseye (Red)
  } else if (distance <= 35) {
    score = 35; // Outer Bull (Green)
  } else if (distance <= 105) {
    // Zone 3: White (Odd) vs Black (Even)
    score = isEven ? 15 : 20;
  } else if (distance <= 135) {
    // Zone 4: Green (Odd) vs Red (Even)
    score = isEven ? 5 : 10;
  } else if (distance <= 180) {
    // Zone 5: White (Odd) vs Black (Even)
    score = isEven ? 0 : 1;
  } else {
    score = 0; // Miss
  }

  playFunfairSound('dartThud');
  dartsGameState.darts.push({ x, y, score, scoreText: `+${score}` });
  dartsGameState.totalScore += score;
  dartsGameState.tries--;

  drawDartsGame(ctx, canvas);

  document.getElementById('dartsTriesDisplay').textContent = `Fléchettes restantes : ${dartsGameState.tries}`;
  document.getElementById('dartsScoreDisplay').textContent = `Score total : ${dartsGameState.totalScore} points`;

  setTimeout(() => {
    if (dartsGameState.tries === 0) {
      dartsGameState.finished = true;

      // Conversion Score -> Tickets
      // Example: 20 pts = 1 ticket? 50 pts = 3 tickets?
      // Let's simpler logic: Score / 20 = tickets, max 5?
      // User didn't specify conversion rate, previous was min(3, score/20)
      // Max score possible = 3 * 50 = 150.
      // Let's give 1 ticket per 30 points?
      // Or tiers: > 100 -> 5 tickets, > 70 -> 3 tickets, > 40 -> 2 tickets, > 10 -> 1 ticket

      let ticketsWon = 0;
      if (dartsGameState.totalScore >= 100) ticketsWon = 5;
      else if (dartsGameState.totalScore >= 70) ticketsWon = 3;
      else if (dartsGameState.totalScore >= 40) ticketsWon = 2;
      else if (dartsGameState.totalScore >= 10) ticketsWon = 1;

      if (ticketsWon > 0) {
        addTickets(ticketsWon);
        updateStats(true, ticketsWon);
        playFunfairSound('win');
        showResult('dartsResult', 'win', `🎯 Bravo ! ${dartsGameState.totalScore}pts = ${ticketsWon}🎟️`);
        if (ticketsWon >= 3) createConfetti();
      } else {
        updateStats(false, 0);
        playFunfairSound('lose');
        showResult('dartsResult', 'lose', `😢 Score : ${dartsGameState.totalScore} pts. Visez mieux !`);
      }

      document.getElementById('dartsNewGameBtn').style.display = 'block';
    } else {
      dartsGameState.shooting = false;
      document.getElementById('dartsThrowBtn').disabled = false;

      // Restart animation
      function animateCrosshair() {
        if (!dartsGameState.shooting && !dartsGameState.finished) {
          dartsGameState.crosshairX += dartsGameState.velocityX;
          dartsGameState.crosshairY += dartsGameState.velocityY;

          if (dartsGameState.crosshairX <= 150 || dartsGameState.crosshairX >= 450) {
            dartsGameState.velocityX *= -1;
          }
          if (dartsGameState.crosshairY <= 150 || dartsGameState.crosshairY >= 450) {
            dartsGameState.velocityY *= -1;
          }

          drawDartsGame(ctx, canvas);
          dartsGameState.animationId = requestAnimationFrame(animateCrosshair);
        }
      }
      animateCrosshair();
    }
  }, 500);
}

// ========================================
// GAME 5: COUVRE-TOUT (Cover the Spot)
// ========================================
let coverspotGameState = {
  discs: [],
  target: { x: 300, y: 220, r: 100 },
  draggingIndex: -1,
  dragOffset: { x: 0, y: 0 },
  finished: false,
  coverage: 0
};

function initCoverSpotGame() {
  const canvas = document.getElementById('coverspotCanvas');
  const ctx = canvas.getContext('2d');

  // Detect mobile
  const isSmallScreen = window.innerWidth < 600 || ('ontouchstart' in window);
  const targetRadius = isSmallScreen ? 120 : 100;
  const discRadius = isSmallScreen ? 65 : 55;

  coverspotGameState = {
    discs: [],
    target: { x: 300, y: 220, r: targetRadius },
    draggingIndex: -1,
    dragOffset: { x: 0, y: 0 },
    finished: false,
    coverage: 0
  };

  // Initialize 6 discs at the bottom
  for (let i = 0; i < 6; i++) {
    coverspotGameState.discs.push({
      x: canvas.width / 2,
      y: 520,
      r: discRadius,
      color: '#dc2626'
    });
  }

  const updateUI = () => {
    document.getElementById('coverspotTriesDisplay').textContent = `Disques : 6`;
    document.getElementById('coverspotScoreDisplay').textContent = `Couverture : ${Math.round(coverspotGameState.coverage)}%`;
  };
  updateUI();

  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  const handleStart = (e) => {
    if (coverspotGameState.finished) return;
    const pos = getMousePos(e);

    // Check discs from top to bottom (last drawn is top)
    for (let i = coverspotGameState.discs.length - 1; i >= 0; i--) {
      const disc = coverspotGameState.discs[i];
      const dist = Math.sqrt((pos.x - disc.x) ** 2 + (pos.y - disc.y) ** 2);
      if (dist < disc.r) {
        coverspotGameState.draggingIndex = i;
        coverspotGameState.dragOffset.x = pos.x - disc.x;
        coverspotGameState.dragOffset.y = pos.y - disc.y;
        // Move to top of array to draw on top
        const dragged = coverspotGameState.discs.splice(i, 1)[0];
        coverspotGameState.discs.push(dragged);
        coverspotGameState.draggingIndex = coverspotGameState.discs.length - 1;
        break;
      }
    }
  };

  const handleMove = (e) => {
    if (coverspotGameState.draggingIndex !== -1) {
      if (e.cancelable) e.preventDefault();
      const pos = getMousePos(e);
      const disc = coverspotGameState.discs[coverspotGameState.draggingIndex];
      disc.x = pos.x - coverspotGameState.dragOffset.x;
      disc.y = pos.y - coverspotGameState.dragOffset.y;
      drawCoverSpotGame(ctx, canvas);
    }
  };

  const handleEnd = () => {
    if (coverspotGameState.draggingIndex !== -1) playFunfairSound('coverDrop');
    coverspotGameState.draggingIndex = -1;
  };

  canvas.onmousedown = handleStart;
  window.onmousemove = handleMove; // Global move for better dragging
  window.onmouseup = handleEnd;

  canvas.addEventListener('touchstart', handleStart, { passive: false });
  window.addEventListener('touchmove', handleMove, { passive: false });
  window.addEventListener('touchend', handleEnd);

  document.getElementById('coverspotCheckBtn').onclick = () => validateCoverSpot(ctx, canvas);
  document.getElementById('coverspotNewGameBtn').style.display = 'none';

  document.getElementById('coverspotNewGameBtn').onclick = () => {
    const tickets = getTickets();
    if (tickets < 3) {
      showPopup('🎟️', 'Tickets insuffisants', 'Il vous faut 3 tickets !');
      return;
    }
    removeTickets(3);
    initCoverSpotGame();
    document.getElementById('coverspotResult').className = 'result-message';
    document.getElementById('coverspotCheckBtn').disabled = false;
  };

  drawCoverSpotGame(ctx, canvas);

  if (!coverspotGameState.finished) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '14px Poppins';
    ctx.textAlign = 'center';
  }
}

function drawCoverSpotGame(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw target circle shadow
  ctx.shadowBlur = 10;
  ctx.shadowColor = 'rgba(0,0,0,0.1)';

  // Target circle
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(coverspotGameState.target.x, coverspotGameState.target.y, coverspotGameState.target.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.shadowBlur = 0;

  // Draw discs
  coverspotGameState.discs.forEach((disc, index) => {
    // Disc shadow
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.2)';

    ctx.fillStyle = disc.color;
    ctx.beginPath();
    ctx.arc(disc.x, disc.y, disc.r, 0, Math.PI * 2);
    ctx.fill();

    // Disc highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(disc.x - disc.r / 3, disc.y - disc.r / 3, disc.r / 4, 0, Math.PI * 2);
    ctx.fill();
  });

  if (!coverspotGameState.finished) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '14px Poppins';
    ctx.textAlign = 'center';
  }
}

function countWhitePixels(imageData) {
  const data = imageData.data;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Pixel vraiment blanc (anti-aliasing filtré)
    if (r > 240 && g > 240 && b > 240) {
      count++;
    }
  }

  return count;
}

function validateCoverSpot(ctx, canvas) {
  if (coverspotGameState.finished) return;

  // Canvas temporaire
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tctx = tempCanvas.getContext('2d');

  // 1. Cible blanche sur fond noir
  tctx.fillStyle = '#000000';
  tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  tctx.fillStyle = '#ffffff';
  tctx.beginPath();
  tctx.arc(
    coverspotGameState.target.x,
    coverspotGameState.target.y,
    coverspotGameState.target.r,
    0,
    Math.PI * 2
  );
  tctx.fill();

  // 2. On "perce" avec les disques (destination-out)
  tctx.globalCompositeOperation = 'destination-out';
  coverspotGameState.discs.forEach(disc => {
    tctx.beginPath();
    tctx.arc(disc.x, disc.y, disc.r, 0, Math.PI * 2);
    tctx.fill();
  });

  // 3. Pixels blancs restants (cible non couverte)
  const imageData = tctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const remainingPixels = countWhitePixels(imageData);

  // 4. Recalcule la cible seule pour avoir le total de pixels de la cible
  tctx.globalCompositeOperation = 'source-over';
  tctx.fillStyle = '#000000';
  tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  tctx.fillStyle = '#ffffff';
  tctx.beginPath();
  tctx.arc(
    coverspotGameState.target.x,
    coverspotGameState.target.y,
    coverspotGameState.target.r,
    0,
    Math.PI * 2
  );
  tctx.fill();

  const totalImageData = tctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const totalTargetPixels = countWhitePixels(totalImageData);

  // 5. Couverture précise
  const coverageRaw = Math.max(0, 100 - (remainingPixels / totalTargetPixels) * 100);
  const coverage = coverageRaw;              // pour la logique
  const coverageDisplay = coverageRaw.toFixed(1) // pour l'affichage

  console.log("test" + coverageRaw, coverage, coverageDisplay)


  coverspotGameState.coverage = coverage;
  coverspotGameState.finished = true;

  let tickets = 0;
  let resType = 'lose';

  if (coverage === 100) {
    tickets = 5;
    resType = 'win';
  } else if (coverage >= 95) {
    tickets = 3;
    resType = 'partial';
  } else if (coverage >= 90) {
    tickets = 2;
    resType = 'partial';
  } else if (coverage >= 80) {
    tickets = 1;
    resType = 'partial';
  }

  if (tickets > 0) {
    addTickets(tickets);
    updateStats(true, tickets);
    playFunfairSound('win');
    showResult(
      'coverspotResult',
      resType,
      `✨ Couverture : ${coverageDisplay}% ! Vous gagnez ${tickets}🎟️`
    );
    if (tickets >= 4) createConfetti();
  } else {
    updateStats(false, 0);
    playFunfairSound('lose');
    showResult(
      'coverspotResult',
      'lose',
      `😢 Couverture : ${coverageDisplay}%. Trop de blanc visible !`
    );
  }

  document.getElementById('coverspotScoreDisplay').textContent =
    `Couverture : ${coverageDisplay}%`;
  document.getElementById('coverspotNewGameBtn').style.display = 'block';
  document.getElementById('coverspotCheckBtn').disabled = true;
}

// ========================================
// GAME 6: MARTEAU DE FORCE (High Striker)
// ========================================
let highstrikerGameState = {
  power: 0,
  powerDir: 1,
  powerSpeed: 5,
  puckY: 500,
  targetPuckY: 500,
  isHitting: false,
  finished: false,
  animationId: null
};

function initHighStrikerGame() {
  const canvas = document.getElementById('highstrikerCanvas');
  const ctx = canvas.getContext('2d');

  highstrikerGameState = {
    power: 0,
    powerDir: 1,
    powerSpeed: 0.05, // 0 to 1
    puckY: 500,
    targetPuckY: 500,
    isHitting: false,
    finished: false,
    animationId: null
  };

  const hitBtn = document.getElementById('highstrikerHitBtn');
  hitBtn.disabled = false;
  hitBtn.style.display = 'block';
  hitBtn.onclick = () => strikeHammer(ctx, canvas);

  // Canvas interaction
  canvas.onclick = () => strikeHammer(ctx, canvas);
  canvas.ontouchstart = (e) => { e.preventDefault(); strikeHammer(ctx, canvas); };

  document.getElementById('highstrikerNewGameBtn').onclick = () => {
    const tickets = getTickets();
    if (tickets < 3) {
      showPopup('🎟️', 'Tickets insuffisants', 'Il vous faut 3 tickets !');
      return;
    }
    removeTickets(3);
    initHighStrikerGame();
    document.getElementById('highstrikerResult').className = 'result-message';
    document.getElementById('highstrikerNewGameBtn').style.display = 'none';
  };

  function animateHighStriker() {
    if (!highstrikerGameState.finished) {
      if (!highstrikerGameState.isHitting) {
        // Oscillate power
        highstrikerGameState.power += highstrikerGameState.powerSpeed * highstrikerGameState.powerDir;
        if (highstrikerGameState.power >= 1 || highstrikerGameState.power <= 0) {
          highstrikerGameState.powerDir *= -1;
        }
      } else {
        // Move puck towards target
        const diff = highstrikerGameState.targetPuckY - highstrikerGameState.puckY;
        if (Math.abs(diff) > 2) {
          highstrikerGameState.puckY += diff * 0.1;
        } else {
          highstrikerGameState.puckY = highstrikerGameState.targetPuckY;
          finishStrike(ctx, canvas);
        }
      }

      drawHighStrikerGame(ctx, canvas);
      highstrikerGameState.animationId = requestAnimationFrame(animateHighStriker);
    }
  }

  if (highstrikerGameState.animationId) cancelAnimationFrame(highstrikerGameState.animationId);
  animateHighStriker();
}

function drawHighStrikerGame(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const bottomY = 520;
  const topY = 100;
  const trackHeight = bottomY - topY;

  // Draw Machine
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(centerX - 40, topY - 40, 80, trackHeight + 60);

  // Draw Scale
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(centerX, topY);
  ctx.lineTo(centerX, bottomY);
  ctx.stroke();

  // Draw ticks
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 10; i++) {
    const ty = bottomY - (i / 10) * trackHeight;
    ctx.beginPath();
    ctx.moveTo(centerX - 15, ty);
    ctx.lineTo(centerX + 15, ty);
    ctx.stroke();
  }

  // Draw Bell
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(centerX, topY - 10, 25, 0, Math.PI, true);
  ctx.fill();

  // Draw Puck
  ctx.fillStyle = '#ef4444';
  ctx.shadowBlur = 10;
  ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
  ctx.fillRect(centerX - 20, highstrikerGameState.puckY - 10, 40, 20);
  ctx.shadowBlur = 0;

  // Draw Base/Hammer Target
  ctx.fillStyle = '#475569';
  ctx.fillRect(centerX - 60, bottomY - 10, 120, 30);

  // Power bar (Indicator)
  const barX = 320;
  const barY = bottomY;
  const barH = 200;
  const barW = 20;

  ctx.fillStyle = '#334155';
  ctx.fillRect(barX, barY - barH, barW, barH);

  // Power indicator
  const displayPower = 1 - highstrikerGameState.power;
  const fillH = displayPower * barH;
  const hue = (1 - displayPower) * 120;
  ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
  ctx.fillRect(barX, barY - fillH, barW, fillH);

  ctx.strokeStyle = '#fff';
  ctx.strokeRect(barX, barY - barH, barW, barH);

  // Label
  ctx.fillStyle = '#000';
  ctx.font = '12px Poppins';
  ctx.textAlign = 'center';
  ctx.fillText('PUISSANCE', barX + 10, barY + 20);

  if (!highstrikerGameState.isHitting && !highstrikerGameState.finished) {
    ctx.fillStyle = '#000';
    ctx.font = 'bold 16px Poppins';
    ctx.fillText('👆 Touchez pour frapper !', centerX, 50);
  }
}

function strikeHammer(ctx, canvas) {
  if (highstrikerGameState.isHitting || highstrikerGameState.finished) return;

  highstrikerGameState.isHitting = true;
  document.getElementById('highstrikerHitBtn').disabled = true;
  playFunfairSound('hammerHit');

  // User: "hit when lowest" -> lowest power = highest hit
  // power is 0 to 1.
  const strength = 1 - highstrikerGameState.power; // 0 (bad) to 1 (perfect)

  const bottomY = 520;
  const topY = 100;
  const trackHeight = bottomY - topY;

  // Target puck height
  highstrikerGameState.targetPuckY = bottomY - (strength * trackHeight);
}

function finishStrike(ctx, canvas) {
  highstrikerGameState.finished = true;

  const bottomY = 520;
  const topY = 100;
  const trackHeight = bottomY - topY;
  const finalStrength = (bottomY - highstrikerGameState.puckY) / trackHeight;

  let tickets = 0;
  let resType = 'lose';
  let message = '';

  if (finalStrength == 1) {
    tickets = 5;
    resType = 'win';
    message = '🔔 DING DING DING ! Sommet atteint ! +5🎟️';
    playFunfairSound('bellRing');
    setTimeout(() => playFunfairSound('win'), 800);
    createConfetti();
  } else if (finalStrength >= 0.6) {
    tickets = 3;
    resType = 'partial';
    message = '💪 Belle force ! +3🎟️';
  } else if (finalStrength >= 0.3) {
    tickets = 1;
    resType = 'partial';
    message = '🔨 Pas mal, mais peut mieux faire. +1🎟️';
  } else {
    tickets = 0;
    resType = 'lose';
    message = '😢 Un peu faiblard... Réessayez !';
  }

  if (tickets > 0) {
    addTickets(tickets);
    updateStats(true, tickets);
    if (finalStrength != 1) playFunfairSound('win');
  } else {
    updateStats(false, 0);
    playFunfairSound('lose');
  }

  showResult('highstrikerResult', resType, message);
  document.getElementById('highstrikerNewGameBtn').style.display = 'block';
}

// ========================================
// GAME 7: BALLONS À ÉCLATER (Balloon Pop)
// ========================================
let balloonpopGameState = {
  balloons: [],
  score: 0,
  timeLeft: 20,
  isActive: false,
  finished: false,
  lastSpawnTime: 0,
  animationId: null,
  timerInterval: null
};

function initBalloonPopGame() {
  const canvas = document.getElementById('balloonpopCanvas');
  const ctx = canvas.getContext('2d');

  balloonpopGameState = {
    balloons: [],
    score: 0,
    timeLeft: 20,
    isActive: false,
    finished: false,
    lastSpawnTime: 0,
    animationId: null,
    timerInterval: null
  };

  const startBtn = document.getElementById('balloonpopStartBtn');
  startBtn.disabled = false;
  startBtn.style.display = 'block';
  startBtn.onclick = () => startBalloonPop();

  document.getElementById('balloonpopNewGameBtn').onclick = () => {
    const tickets = getTickets();
    if (tickets < 5) {
      showPopup('🎟️', 'Tickets insuffisants', 'Il vous faut 5 tickets !');
      return;
    }
    removeTickets(5);
    initBalloonPopGame();
    document.getElementById('balloonpopResult').className = 'result-message';
    document.getElementById('balloonpopNewGameBtn').style.display = 'none';
  };

  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  const handleClick = (e) => {
    if (!balloonpopGameState.isActive) {
      if (!balloonpopGameState.finished) startBalloonPop();
      return;
    }
    const pos = getMousePos(e);

    // Check balloons from top to bottom
    for (let i = balloonpopGameState.balloons.length - 1; i >= 0; i--) {
      const b = balloonpopGameState.balloons[i];
      if (b.popped) continue;

      const dist = Math.sqrt((pos.x - b.x) ** 2 + (pos.y - b.y) ** 2);
      if (dist < b.r + 10) {
        b.popped = true;
        playFunfairSound('balloonPop');
        balloonpopGameState.score += b.points;
        updateBalloonUI();
        break;
      }
    }
  };

  canvas.onmousedown = handleClick;
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleClick(e); }, { passive: false });

  updateBalloonUI();
  drawBalloonPopGame(ctx, canvas);
}

function updateBalloonUI() {
  document.getElementById('balloonpopTimerDisplay').textContent = `Temps : ${Math.ceil(balloonpopGameState.timeLeft)}s`;
  document.getElementById('balloonpopScoreDisplay').textContent = `Score : ${balloonpopGameState.score} pts`;
}

function startBalloonPop() {
  const canvas = document.getElementById('balloonpopCanvas');
  const ctx = canvas.getContext('2d');

  balloonpopGameState.isActive = true;
  document.getElementById('balloonpopStartBtn').style.display = 'none';

  balloonpopGameState.timerInterval = setInterval(() => {
    balloonpopGameState.timeLeft -= 0.1;
    if (balloonpopGameState.timeLeft <= 0) {
      balloonpopGameState.timeLeft = 0;
      finishBalloonPop(ctx, canvas);
    }
    updateBalloonUI();
  }, 100);

  function animateBalloonPop() {
    if (balloonpopGameState.isActive) {
      updateBalloonPhysics(canvas);
      drawBalloonPopGame(ctx, canvas);
      balloonpopGameState.animationId = requestAnimationFrame(animateBalloonPop);
    }
  }
  animateBalloonPop();
}

function updateBalloonPhysics(canvas) {
  // Spawn balloons
  const now = Date.now();
  if (now - balloonpopGameState.lastSpawnTime > 400 + Math.random() * 600) {
    balloonpopGameState.lastSpawnTime = now;
    const isGold = Math.random() < 0.15;
    balloonpopGameState.balloons.push({
      x: 50 + Math.random() * (canvas.width - 100),
      y: canvas.height + 50,
      r: 30 + Math.random() * 10,
      speed: 1.5 + Math.random() * 2,
      drift: (Math.random() - 0.5) * 1,
      color: isGold ? '#fbbf24' : '#dc2626',
      points: isGold ? 5 : 1,
      popped: false,
      popAnim: 0
    });
  }

  // Move balloons
  balloonpopGameState.balloons.forEach((b, index) => {
    if (!b.popped) {
      b.y -= b.speed;
      b.x += Math.sin(Date.now() / 500 + index) * b.drift;
    } else {
      b.popAnim += 0.2;
    }
  });

  // Remove off-screen or finished pop balloons
  balloonpopGameState.balloons = balloonpopGameState.balloons.filter(b =>
    b.y > -100 && (b.popAnim < 1)
  );
}

function drawBalloonPopGame(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#bae6fd');
  grad.addColorStop(1, '#e0f2fe');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw balloons
  balloonpopGameState.balloons.forEach(b => {
    if (!b.popped) {
      ctx.save();
      ctx.translate(b.x, b.y);

      // Balloon thread
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, b.r);
      ctx.quadraticCurveTo(5, b.r + 10, 0, b.r + 30);
      ctx.stroke();

      // Balloon body
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.r * 0.9, b.r, 0, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.ellipse(-b.r / 3, -b.r / 3, b.r / 4, b.r / 3, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    } else {
      // Pop animation
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const dist = b.r * (1 + b.popAnim);
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(angle) * (dist - 10), b.y + Math.sin(angle) * (dist - 10));
        ctx.lineTo(b.x + Math.cos(angle) * dist, b.y + Math.sin(angle) * dist);
        ctx.stroke();
      }
    }
  });

  // UI Hint
  if (!balloonpopGameState.isActive && !balloonpopGameState.finished) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = 'bold 20px Poppins';
    ctx.textAlign = 'center';
    ctx.fillText('🚀 Cliquez sur Commencer pour jouer !', canvas.width / 2, canvas.height / 2);
  }
}

function finishBalloonPop(ctx, canvas) {
  balloonpopGameState.isActive = false;
  balloonpopGameState.finished = true;
  clearInterval(balloonpopGameState.timerInterval);
  if (balloonpopGameState.animationId) cancelAnimationFrame(balloonpopGameState.animationId);

  const score = balloonpopGameState.score;
  let tickets = 0;
  if (score >= 80) tickets = 8;
  else if (score >= 50) tickets = 5;
  else if (score >= 30) tickets = 3;
  else if (score >= 10) tickets = 1;

  if (tickets > 0) {
    addTickets(tickets);
    updateStats(true, tickets);
    playFunfairSound('win');
    showResult('balloonpopResult', 'win', `🎈 Bravo ! ${score} points = ${tickets}🎟️ gagnés !`);
    if (tickets >= 5) createConfetti();
  } else {
    updateStats(false, 0);
    playFunfairSound('lose');
    showResult('balloonpopResult', 'lose', `😢 ${score} points... Pas assez pour des tickets !`);
  }

  document.getElementById('balloonpopNewGameBtn').style.display = 'block';
}

// ========================================
// GAME 8: ANNEAUX SUR PIQUETS (Ring Toss)
// ========================================
let ringtossGameState = {
  pegs: [],
  rings: [],
  tries: 3,
  score: 0,
  activeRing: null,
  finished: false,
  animationId: null
};

function initRingTossGame() {
  const canvas = document.getElementById('ringtossCanvas');
  const ctx = canvas.getContext('2d');

  ringtossGameState = {
    pegs: [],
    rings: [],
    tries: 3,
    score: 0,
    activeRing: null,
    finished: false,
    animationId: null
  };

  // Define pegs (x, y, value, name)
  const rows = [
    { y: 120, count: 4, val: 5, color: '#dc2626' }, // Far
    { y: 220, count: 5, val: 2, color: '#3b82f6' }, // Mid
    { y: 320, count: 6, val: 1, color: '#10b981' }  // Near
  ];

  rows.forEach(row => {
    const spacing = canvas.width / (row.count + 1);
    for (let i = 1; i <= row.count; i++) {
      ringtossGameState.pegs.push({
        x: i * spacing,
        y: row.y,
        val: row.val,
        color: row.color,
        hasRing: false
      });
    }
  });

  const throwBtn = document.getElementById('ringtossThrowBtn');
  throwBtn.disabled = false;
  throwBtn.style.display = 'block';
  throwBtn.onclick = () => {
    // Hint: click on canvas to throw
    showPopup('⭕', 'Ring Toss', 'Cliquez sur le plateau pour lancer un anneau vers cet endroit !');
  };

  document.getElementById('ringtossNewGameBtn').onclick = () => {
    const tickets = getTickets();
    if (tickets < 8) {
      showPopup('🎟️', 'Tickets insuffisants', 'Il vous faut 10 tickets !');
      return;
    }
    removeTickets(8);
    initRingTossGame();
    document.getElementById('ringtossResult').className = 'result-message';
    document.getElementById('ringtossNewGameBtn').style.display = 'none';
  };

  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  const handleThrow = (e) => {
    if (ringtossGameState.finished || ringtossGameState.activeRing || ringtossGameState.tries <= 0) return;
    const pos = getMousePos(e);
    launchRing(pos.x, pos.y, ctx, canvas);
  };

  canvas.onmousedown = handleThrow;
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleThrow(e); }, { passive: false });

  updateRingUI();
  drawRingTossGame(ctx, canvas);
}

function updateRingUI() {
  document.getElementById('ringtossTriesDisplay').textContent = `Anneaux : ${ringtossGameState.tries}`;
  document.getElementById('ringtossScoreDisplay').textContent = `Gains : ${ringtossGameState.score}🎟️`;
}

function launchRing(tx, ty, ctx, canvas) {
  ringtossGameState.activeRing = {
    startX: 300,
    startY: canvas.height + 50,
    x: 300,
    y: canvas.height + 50,
    targetX: tx,
    targetY: ty,
    progress: 0,
    speed: 0.02
  };

  function animateRing() {
    if (ringtossGameState.activeRing && ringtossGameState.activeRing.progress === 0) playFunfairSound('ringThrow');
    if (ringtossGameState.activeRing) {
      ringtossGameState.activeRing.progress += ringtossGameState.activeRing.speed;
      const p = ringtossGameState.activeRing.progress;

      // Arc movement
      const start = { x: ringtossGameState.activeRing.startX, y: ringtossGameState.activeRing.startY };
      const target = { x: ringtossGameState.activeRing.targetX, y: ringtossGameState.activeRing.targetY };

      ringtossGameState.activeRing.x = start.x + (target.x - start.x) * p;
      const arcHeight = 200;
      ringtossGameState.activeRing.y = start.y + (target.y - start.y) * p - Math.sin(p * Math.PI) * arcHeight;

      drawRingTossGame(ctx, canvas);

      if (p < 1) {
        requestAnimationFrame(animateRing);
      } else {
        checkRingLanding();
        drawRingTossGame(ctx, canvas);
      }
    }
  }
  animateRing();
}

function checkRingLanding() {
  const ring = ringtossGameState.activeRing;
  ringtossGameState.activeRing = null;
  ringtossGameState.tries--;

  let hit = false;
  ringtossGameState.pegs.forEach(peg => {
    const dist = Math.sqrt((ring.targetX - peg.x) ** 2 + (ring.targetY - peg.y) ** 2);
    if (dist < 20 && !peg.hasRing) {
      peg.hasRing = true;
      ringtossGameState.score += peg.val;
      hit = true;
    }
  });

  if (hit) playFunfairSound('ringClink');
  else playFunfairSound('thud');

  // Store ring anyway for visual
  ringtossGameState.rings.push({ x: ring.targetX, y: ring.targetY, hit: hit });

  updateRingUI();

  if (ringtossGameState.tries <= 0) {
    finishRingToss();
  }
}

function drawRingTossGame(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background (Perspective floor)
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.moveTo(0, 100);
  ctx.lineTo(canvas.width, 100);
  ctx.lineTo(canvas.width + 100, canvas.height);
  ctx.lineTo(-100, canvas.height);
  ctx.fill();

  // Draw Pegs
  ringtossGameState.pegs.forEach(peg => {
    // Peg Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(peg.x, peg.y + 5, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Peg Body
    ctx.fillStyle = peg.color;
    ctx.fillRect(peg.x - 4, peg.y - 40, 8, 40);
    ctx.beginPath();
    ctx.arc(peg.x, peg.y - 40, 4, 0, Math.PI * 2);
    ctx.fill();

    // If has ring
    if (peg.hasRing) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(peg.x, peg.y - 10, 20, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // Draw Missed Rings
  ringtossGameState.rings.forEach(ring => {
    if (!ring.hit) {
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, 20, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // Draw Active Ring
  if (ringtossGameState.activeRing) {
    const ring = ringtossGameState.activeRing;
    const scale = 1 + (1 - ring.progress);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 5 * scale;
    ctx.beginPath();
    ctx.ellipse(ring.x, ring.y, 30 * scale, 15 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // UI Hint
  if (!ringtossGameState.finished && ringtossGameState.tries > 0 && !ringtossGameState.activeRing) {
    ctx.fillStyle = '#000';
    ctx.font = '16px Poppins';
    ctx.textAlign = 'center';
    ctx.fillText('👆 Touchez le plateau pour lancer un anneau', canvas.width / 2, 40);
  }
}

function finishRingToss() {
  ringtossGameState.finished = true;

  const score = ringtossGameState.score;
  if (score > 0) {
    addTickets(score);
    updateStats(true, score);
    playFunfairSound('win');
    showResult('ringtossResult', 'win', `⭕ Bien joué ! Vous gagnez ${score}🎟️ !`);
    if (score >= 5) createConfetti();
  } else {
    updateStats(false, 0);
    playFunfairSound('lose');
    showResult('ringtossResult', 'lose', `😢 Aucun piquet touché... Réessayez !`);
  }

  document.getElementById('ringtossNewGameBtn').style.display = 'block';
  document.getElementById('ringtossThrowBtn').disabled = true;
}

// ========================================
// RESULT DISPLAY
// ========================================
function showResult(elementId, type, message) {
  const resultEl = document.getElementById(elementId);
  resultEl.textContent = message;
  resultEl.className = `result-message ${type} show`;
}

// ========================================
// CONFETTI EFFECT
// ========================================
function createConfetti() {
  for (let i = 0; i < 50; i++) {
    setTimeout(() => {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = Math.random() * 100 + 'vw';
      confetti.style.animationDelay = Math.random() * 0.5 + 's';
      confetti.style.background = ['#dc2626', '#f59e0b', '#fbbf24', '#10b981'][Math.floor(Math.random() * 4)];
      document.body.appendChild(confetti);

      setTimeout(() => confetti.remove(), 3000);
    }, i * 30);
  }
}

// ========================================
// START
// ========================================
init();