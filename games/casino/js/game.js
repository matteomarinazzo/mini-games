// ========================================
// STORAGE KEYS
// ========================================
const STORAGE_KEYS = {
  MONEY: "global_money",
  STATS: "casino_stats",
};

// ========================================
// GAME CONFIGURATION
// ========================================
const SCRATCH_CONFIG = {
  bet: 5,
  symbols: ["💎", "👑", "⭐", "🍒", "🍋", "🔔", "💰"],
  prizes: {
    "💎": 100,
    "👑": 50,
    "⭐": 25,
    "🍒": 15,
    "🍋": 10,
    "🔔": 5,
    "💰": 5,
  },
};

const SLOTS_CONFIG = {
  bet: 2,
  symbols: ["💎", "👑", "⭐", "🍒", "🍋", "🔔"],
  prizes: {
    "💎": 50,
    "👑": 30,
    "⭐": 20,
    "🍒": 10,
    "🍋": 5,
    "🔔": 4,
  },
  weights: {
    "💎": 1,
    "👑": 2,
    "⭐": 5,
    "🍒": 10,
    "🍋": 15,
    "🔔": 20,
  },
};

const CARD_CONFIG = {
  bet: 10,
  cards: [
    { value: "A", display: "As", prize: 30, suit: "♠", suitDisplay: "♠" },
    { value: "K", display: "Roi", prize: 20, suit: "♥", suitDisplay: "♥" },
    { value: "Q", display: "Dame", prize: 15, suit: "♦", suitDisplay: "♦" },
    { value: "J", display: "Valet", prize: 10, suit: "♣", suitDisplay: "♣" },
    { value: "10", display: "10", prize: 5, suit: "♠", suitDisplay: "♠" },
    { value: "9", display: "9", prize: 5, suit: "♥", suitDisplay: "♥" },
    { value: "8", display: "8", prize: 5, suit: "♦", suitDisplay: "♦" },
    { value: "7", display: "7", prize: 5, suit: "♣", suitDisplay: "♣" },
    { value: "6", display: "6", prize: 0, suit: "♠", suitDisplay: "♠" },
    { value: "5", display: "5", prize: 0, suit: "♥", suitDisplay: "♥" },
    { value: "4", display: "4", prize: 0, suit: "♦", suitDisplay: "♦" },
    { value: "3", display: "3", prize: 0, suit: "♣", suitDisplay: "♣" },
    { value: "2", display: "2", prize: 0, suit: "♠", suitDisplay: "♠" },
  ],
};

const WHEEL_CONFIG = {
  bet: 50,
  sectors: [
    { label: "JACKPOT", prize: 500, color: "#FFD700", emoji: "💎" },
    { label: "Perdu", prize: 0, color: "#ff6b6b", emoji: "❌" },
    { label: "100€", prize: 100, color: "#51cf66", emoji: "👑" },
    { label: "Perdu", prize: 0, color: "#ff6b6b", emoji: "❌" },
    { label: "50€", prize: 50, color: "#4facfe", emoji: "⭐" },
    { label: "10€", prize: 10, color: "#ffd43b", emoji: "🍀" },
    { label: "30€", prize: 30, color: "#a78bfa", emoji: "🎁" },
    { label: "5€", prize: 5, color: "#fb923c", emoji: "🎊" },
    { label: "20€", prize: 20, color: "#60a5fa", emoji: "💰" },
    { label: "2€", prize: 2, color: "#f472b6", emoji: "🎈" },
  ],
};

const CRASH_CONFIG = {
  bet: 20,
  minCrashPoint: 1.1,
  maxCrashPoint: 50,
};

const BLACKJACK_CONFIG = {
  bet: 25,
};

const PLINKO_CONFIG = {
  bet: 5,
  rows: 10,
  multipliers: [15, 8, 5, 3, 2, 1, 0.5, 1, 2, 3, 5, 8, 15],
  prizes: [75, 40, 25, 15, 10, 5, 2.5, 5, 10, 15, 25, 40, 75],
};

const HILO_CONFIG = {
  bet: 5,
  multiplierPerWin: 1.5,
};

// ========================================
// DOM ELEMENTS
// ========================================
const gameMoneyEl = document.getElementById("gameMoney");
const betAmountEl = document.getElementById("betAmount");
const gameTitleEl = document.getElementById("gameTitle");

const scratchGame = document.getElementById("scratchGame");
const slotsGame = document.getElementById("slotsGame");
const cardGame = document.getElementById("cardGame");
const wheelGame = document.getElementById("wheelGame");
const crashGame = document.getElementById("crashGame");
const blackjackGame = document.getElementById("blackjackGame");
const plinkoGame = document.getElementById("plinkoGame");
const hiloGame = document.getElementById("hiloGame");
const gameOverDiv = document.getElementById("gameOver");

// ========================================
// CURRENT GAME STATE
// ========================================
let currentGame = null;
let currentMoney = 0;

// ========================================
// INITIALIZE
// ========================================
function init() {
  currentMoney = getMoney();
  if (currentMoney === null) {
    window.location.href = "index.html";
    return;
  }

  currentGame = sessionStorage.getItem("casino_current_game");
  if (!currentGame) {
    window.location.href = "index.html";
    return;
  }

  // Afficher le bon jeu
  switch (currentGame) {
    case "scratch":
      initScratchGame();
      break;
    case "slots":
      initSlotsGame();
      break;
    case "card":
      initCardGame();
      break;
    case "wheel":
      initWheelGame();
      break;
    case "crash":
      initCrashGame();
      break;
    case "blackjack":
      initBlackjackGame();
      break;
    case "plinko":
      initPlinkoGame();
      break;
    case "hilo":
      initHiloGame();
      break;
  }

  updateMoneyDisplay();
}

// ========================================
// MONEY MANAGEMENT
// ========================================
function getMoney() {
  const money = localStorage.getItem(STORAGE_KEYS.MONEY);
  return money !== null ? parseInt(money) : null;
}

function setMoney(amount) {
  currentMoney = amount;
  localStorage.setItem(STORAGE_KEYS.MONEY, amount);
  updateMoneyDisplay();
}

function updateMoneyDisplay() {
  gameMoneyEl.textContent = `${currentMoney}€`;
}

function canPlay(bet) {
  return currentMoney >= bet;
}

function deductBet(bet) {
  setMoney(currentMoney - bet);
}

function addWinnings(amount) {
  setMoney(currentMoney + amount);
}

// ========================================
// STATS MANAGEMENT
// ========================================
function getStats() {
  const stats = localStorage.getItem(STORAGE_KEYS.STATS);
  if (!stats) {
    return {
      totalGames: 0,
      totalWins: 0,
      totalEarnings: 0,
      biggestWin: 0,
    };
  }
  return JSON.parse(stats);
}

function updateStats(won, winAmount = 0) {
  const stats = getStats();

  stats.totalGames++;
  if (won) {
    stats.totalWins++;
    stats.totalEarnings += winAmount;
    if (winAmount > stats.biggestWin) {
      stats.biggestWin = winAmount;
    }
  }

  localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
}

// ========================================
// SCRATCH CARD GAME
// ========================================
let scratchCells = [];
let revealedCount = 0;

function initScratchGame() {
  scratchGame.style.display = "block";
  gameTitleEl.textContent = "🎫 Ticket à gratter";
  betAmountEl.textContent = `${SCRATCH_CONFIG.bet}€`;

  createScratchCard();
}

function createScratchCard() {
  const grid = document.getElementById("scratchGrid");
  const resultDiv = document.getElementById("scratchResult");
  const revealBtn = document.getElementById("revealAllBtn");
  const newBtn = document.getElementById("newScratchBtn");

  grid.innerHTML = "";
  resultDiv.textContent = "";
  resultDiv.className = "result-message";
  revealBtn.style.display = "none";
  newBtn.style.display = "none";

  scratchCells = [];
  revealedCount = 0;

  const symbols = generateScratchSymbols();

  symbols.forEach((symbol, index) => {
    const cell = document.createElement("div");
    cell.className = "scratch-cell";
    cell.dataset.symbol = symbol;
    cell.dataset.index = index;

    const back = document.createElement("div");
    back.className = "scratch-back";
    back.textContent = symbol;

    const front = document.createElement("div");
    front.className = "scratch-front";
    front.textContent = "?";

    cell.appendChild(back);
    cell.appendChild(front);

    cell.addEventListener("click", () => revealCell(cell));

    grid.appendChild(cell);
    scratchCells.push(cell);
  });

  if (!canPlay(SCRATCH_CONFIG.bet)) {
    showGameOver();
    return;
  }

  deductBet(SCRATCH_CONFIG.bet);
}

function generateScratchSymbols() {
  const symbols = [];
  const willWin = Math.random() < 0.2;

  if (willWin) {
    const rand = Math.random();
    let winSymbol;

    if (rand < 0.5) winSymbol = "🔔";
    else if (rand < 0.75) winSymbol = "💰";
    else if (rand < 0.9) winSymbol = "🍋";
    else if (rand < 0.97) winSymbol = "🍒";
    else if (rand < 0.99) winSymbol = "⭐";
    else if (rand < 0.998) winSymbol = "👑";
    else winSymbol = "💎";

    symbols.push(winSymbol, winSymbol, winSymbol);

    const otherSymbols = SCRATCH_CONFIG.symbols.filter((s) => s !== winSymbol);

    const fillCounts = {};
    while (symbols.length < 9) {
      const randomSymbol = otherSymbols[Math.floor(Math.random() * otherSymbols.length)];

      if (!fillCounts[randomSymbol]) fillCounts[randomSymbol] = 0;

      if (fillCounts[randomSymbol] < 2) {
        symbols.push(randomSymbol);
        fillCounts[randomSymbol]++;
      }
    }
  } else {
    const usedCounts = {};
    while (symbols.length < 9) {
      const randomSymbol = SCRATCH_CONFIG.symbols[Math.floor(Math.random() * SCRATCH_CONFIG.symbols.length)];
      if (!usedCounts[randomSymbol]) usedCounts[randomSymbol] = 0;
      if (usedCounts[randomSymbol] < 2) {
        symbols.push(randomSymbol);
        usedCounts[randomSymbol]++;
      }
    }
  }

  return symbols.sort(() => Math.random() - 0.5);
}

function revealCell(cell) {
  if (cell.classList.contains("revealed")) return;

  cell.classList.add("revealed");
  revealedCount++;

  if (revealedCount === 3) {
    document.getElementById("revealAllBtn").style.display = "inline-block";
  }

  if (revealedCount === 9) {
    checkScratchWin();
  }
}

function revealAll() {
  scratchCells.forEach((cell) => {
    cell.classList.add("revealed");
  });
  revealedCount = 9;
  checkScratchWin();
}

function checkScratchWin() {
  const symbols = scratchCells.map((cell) => cell.dataset.symbol);
  const counts = {};

  symbols.forEach((symbol) => {
    counts[symbol] = (counts[symbol] || 0) + 1;
  });

  const winningSymbol = Object.keys(counts).find(
    (symbol) => counts[symbol] >= 3,
  );

  const resultDiv = document.getElementById("scratchResult");
  const revealBtn = document.getElementById("revealAllBtn");
  const newBtn = document.getElementById("newScratchBtn");

  revealBtn.style.display = "none";
  newBtn.style.display = "inline-block";

  if (winningSymbol) {
    const prize = SCRATCH_CONFIG.prizes[winningSymbol];

    scratchCells.forEach((cell) => {
      if (cell.dataset.symbol === winningSymbol) {
        cell.classList.add("winning");
      }
    });

    addWinnings(prize);
    updateStats(true, prize);

    resultDiv.textContent = `🎉 GAGNÉ ! ${winningSymbol} × 3 = ${prize}€`;
    resultDiv.className = "result-message win";
  } else {
    updateStats(false);

    resultDiv.textContent = `😔 Perdu ! Aucun symbole identique trouvé.`;
    resultDiv.className = "result-message lose";
  }
}

document.getElementById("revealAllBtn")?.addEventListener("click", revealAll);
document.getElementById("newScratchBtn")?.addEventListener("click", () => {
  if (!canPlay(SCRATCH_CONFIG.bet)) {
    showGameOver();
    return;
  }
  createScratchCard();
});

// ========================================
// SLOT MACHINE GAME
// ========================================
let isSpinning = false;

function initSlotsGame() {
  slotsGame.style.display = "block";
  gameTitleEl.textContent = "🎰 Machine à sous";
  betAmountEl.textContent = `${SLOTS_CONFIG.bet}€`;

  initSlotReels();

  document.getElementById("spinBtn").addEventListener("click", spinSlots);
}

function initSlotReels() {
  for (let i = 1; i <= 3; i++) {
    const reel = document.getElementById(`reel${i}`);
    const strip = reel.querySelector(".reel-strip");

    for (let j = 0; j < 20; j++) {
      const symbol = document.createElement("div");
      symbol.className = "reel-symbol";
      symbol.textContent = getWeightedRandomSymbol();
      strip.appendChild(symbol);
    }
  }
}

function getWeightedRandomSymbol() {
  const weights = SLOTS_CONFIG.weights;
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

  let random = Math.random() * totalWeight;

  for (const [symbol, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) {
      return symbol;
    }
  }

  return SLOTS_CONFIG.symbols[0];
}

function spinSlots() {
  if (isSpinning) return;

  if (!canPlay(SLOTS_CONFIG.bet)) {
    showGameOver();
    return;
  }

  deductBet(SLOTS_CONFIG.bet);
  isSpinning = true;

  const spinBtn = document.getElementById("spinBtn");
  spinBtn.disabled = true;

  const resultDiv = document.getElementById("slotsResult");
  resultDiv.textContent = "";
  resultDiv.className = "result-message";

  const willWin = Math.random() < 0.15;
  let finalSymbols;

  if (willWin) {
    const rand = Math.random();
    let winSymbol;

    if (rand < 0.5) {
      winSymbol = "🔔";
    } else if (rand < 0.8) {
      winSymbol = "🍋";
    } else if (rand < 0.93) {
      winSymbol = "🍒";
    } else if (rand < 0.98) {
      winSymbol = "⭐";
    } else if (rand < 0.996) {
      winSymbol = "👑";
    } else {
      winSymbol = "💎";
    }

    finalSymbols = [winSymbol, winSymbol, winSymbol];
  } else {
    finalSymbols = [
      getWeightedRandomSymbol(),
      getWeightedRandomSymbol(),
      getWeightedRandomSymbol(),
    ];

    while (
      finalSymbols[0] === finalSymbols[1] &&
      finalSymbols[1] === finalSymbols[2]
    ) {
      finalSymbols[2] = getWeightedRandomSymbol();
    }
  }

  const reels = [1, 2, 3].map((i) => document.getElementById(`reel${i}`));

  reels.forEach((reel, index) => {
    reel.classList.add("spinning");

    setTimeout(
      () => {
        reel.classList.remove("spinning");

        const strip = reel.querySelector(".reel-strip");
        const symbols = strip.querySelectorAll(".reel-symbol");
        symbols[0].textContent = finalSymbols[index];

        if (index === 2) {
          setTimeout(() => checkSlotsWin(finalSymbols), 500);
        }
      },
      2000 + index * 500,
    );
  });
}

function checkSlotsWin(symbols) {
  const resultDiv = document.getElementById("slotsResult");
  const spinBtn = document.getElementById("spinBtn");

  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    const prize = SLOTS_CONFIG.prizes[symbols[0]];

    addWinnings(prize);
    updateStats(true, prize);

    resultDiv.textContent = `🎊 JACKPOT ! ${symbols[0]} × 3 = ${prize}€`;
    resultDiv.className = "result-message win";
  } else {
    updateStats(false);

    resultDiv.textContent = `Pas de chance ! Réessayez.`;
    resultDiv.className = "result-message lose";
  }

  isSpinning = false;
  spinBtn.disabled = false;
}

// ========================================
// CARD CHANCE GAME
// ========================================
let currentCard = null;
let cardFlipped = false;

function initCardGame() {
  cardGame.style.display = "block";
  gameTitleEl.textContent = "🃏 Carte Chance";
  betAmountEl.textContent = `${CARD_CONFIG.bet}€`;

  createCardDeck();
}

function createCardDeck() {
  const deck = document.getElementById("cardDeck");
  const resultDiv = document.getElementById("cardResult");
  const newBtn = document.getElementById("newCardBtn");

  deck.innerHTML = "";
  resultDiv.textContent = "";
  resultDiv.className = "result-message";
  newBtn.style.display = "none";
  cardFlipped = false;

  if (!canPlay(CARD_CONFIG.bet)) {
    showGameOver();
    return;
  }

  deductBet(CARD_CONFIG.bet);

  currentCard =
    CARD_CONFIG.cards[Math.floor(Math.random() * CARD_CONFIG.cards.length)];

  const cardElement = document.createElement("div");
  cardElement.className = "playing-card";

  const cardFront = document.createElement("div");
  cardFront.className = "card-face card-front";
  cardFront.textContent = "🃏";

  const cardBack = document.createElement("div");
  cardBack.className = "card-face card-back";

  const suitColor =
    currentCard.suit === "♥" || currentCard.suit === "♦" ? "red" : "black";

  const cardSuit = document.createElement("div");
  cardSuit.className = `card-suit ${suitColor}`;
  cardSuit.textContent = currentCard.suitDisplay;

  const cardValue = document.createElement("div");
  cardValue.className = "card-value";
  cardValue.textContent = currentCard.display;

  cardBack.appendChild(cardSuit);
  cardBack.appendChild(cardValue);

  cardElement.appendChild(cardFront);
  cardElement.appendChild(cardBack);

  cardElement.addEventListener("click", () => flipCard(cardElement));

  deck.appendChild(cardElement);
}

function flipCard(cardElement) {
  if (cardFlipped) return;

  cardFlipped = true;
  cardElement.classList.add("flipped");

  setTimeout(() => checkCardWin(), 800);
}

function checkCardWin() {
  const resultDiv = document.getElementById("cardResult");
  const newBtn = document.getElementById("newCardBtn");

  newBtn.style.display = "inline-block";

  const prize = currentCard.prize;

  if (prize > 0) {
    addWinnings(prize);
    updateStats(true, prize);

    resultDiv.textContent = `🎉 ${currentCard.display} ! Vous gagnez ${prize}€ !`;
    resultDiv.className = "result-message win";
  } else {
    updateStats(false);

    resultDiv.textContent = `😔 ${currentCard.display}... Pas de gain cette fois.`;
    resultDiv.className = "result-message lose";
  }
}

document.getElementById("newCardBtn")?.addEventListener("click", () => {
  if (!canPlay(CARD_CONFIG.bet)) {
    showGameOver();
    return;
  }
  createCardDeck();
});

// ========================================
// WHEEL OF FORTUNE GAME
// ========================================
let wheelCanvas = null;
let wheelCtx = null;
let wheelRotation = 0;
let isWheelSpinning = false;

function initWheelGame() {
  wheelGame.style.display = "block";
  gameTitleEl.textContent = "🎡 Roue de la Fortune";
  betAmountEl.textContent = `${WHEEL_CONFIG.bet}€`;

  wheelCanvas = document.getElementById("wheelCanvas");
  wheelCtx = wheelCanvas.getContext("2d");

  drawWheel();

  document.getElementById("spinWheelBtn").addEventListener("click", spinWheel);
}

function drawWheel(currentRotation = 0) {
  const centerX = wheelCanvas.width / 2;
  const centerY = wheelCanvas.height / 2;
  const radius = 230;
  const sectors = WHEEL_CONFIG.sectors;
  const sectorAngle = (2 * Math.PI) / sectors.length;

  wheelCtx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
  wheelCtx.save();
  wheelCtx.translate(centerX, centerY);
  wheelCtx.rotate(currentRotation);

  sectors.forEach((sector, i) => {
    const startAngle = i * sectorAngle - Math.PI / 2 - sectorAngle / 2;
    const endAngle = startAngle + sectorAngle;

    wheelCtx.beginPath();
    wheelCtx.arc(0, 0, radius, startAngle, endAngle);
    wheelCtx.lineTo(0, 0);
    wheelCtx.fillStyle = sector.color;
    wheelCtx.fill();

    wheelCtx.strokeStyle = "white";
    wheelCtx.lineWidth = 3;
    wheelCtx.stroke();

    wheelCtx.save();
    wheelCtx.rotate(startAngle + sectorAngle / 2);
    wheelCtx.translate(radius - 20, 0);
    wheelCtx.textAlign = "right";
    wheelCtx.textBaseline = "middle";
    wheelCtx.fillStyle = "white";
    wheelCtx.font = "bold 16px Poppins";
    const label = sector.label;
    const emoji = sector.emoji;
    wheelCtx.fillText(`${label} ${emoji}`, 0, 0);
    wheelCtx.restore();
  });

  wheelCtx.beginPath();
  wheelCtx.arc(0, 0, 30, 0, 2 * Math.PI);
  wheelCtx.fillStyle = "white";
  wheelCtx.fill();
  wheelCtx.strokeStyle = "#667eea";
  wheelCtx.lineWidth = 5;
  wheelCtx.stroke();

  wheelCtx.restore();
}

function spinWheel() {
  if (isWheelSpinning) return;

  if (!canPlay(WHEEL_CONFIG.bet)) {
    showGameOver();
    return;
  }

  deductBet(WHEEL_CONFIG.bet);
  isWheelSpinning = true;

  const spinBtn = document.getElementById("spinWheelBtn");
  spinBtn.disabled = true;

  const resultDiv = document.getElementById("wheelResult");
  resultDiv.textContent = "";

  const rand = Math.random();
  let targetSectorIndex;
  if (rand < 0.01) targetSectorIndex = 0;
  else if (rand < 0.06) targetSectorIndex = 2;
  else if (rand < 0.16) targetSectorIndex = 4;
  else if (rand < 0.3) targetSectorIndex = 6;
  else if (rand < 0.5) targetSectorIndex = 8;
  else if (rand < 0.65) targetSectorIndex = 5;
  else if (rand < 0.78) targetSectorIndex = 7;
  else if (rand < 0.88) targetSectorIndex = 9;
  else targetSectorIndex = Math.random() < 0.5 ? 1 : 3;

  const sectors = WHEEL_CONFIG.sectors;
  const numSectors = sectors.length;
  const sectorAngle = (2 * Math.PI) / numSectors;

  const targetAngle = -(targetSectorIndex * sectorAngle);

  const fullRotations = 5 + Math.floor(Math.random() * 3);
  const finalRotation = fullRotations * 2 * Math.PI + targetAngle;

  animateWheel(finalRotation, targetSectorIndex);
}

function animateWheel(finalRotation, targetSectorIndex) {
  const startRotation = 0;
  const duration = 4000;
  const startTime = Date.now();

  function animate() {
    const currentTime = Date.now();
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const easeOut = 1 - Math.pow(1 - progress, 3);

    wheelRotation = startRotation + finalRotation * easeOut;
    drawWheel(wheelRotation);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      wheelRotation = finalRotation;
      drawWheel(wheelRotation);
      checkWheelWin(targetSectorIndex);
    }
  }

  animate();
}

function checkWheelWin(sectorIndex) {
  const resultDiv = document.getElementById("wheelResult");
  const spinBtn = document.getElementById("spinWheelBtn");

  const sector = WHEEL_CONFIG.sectors[sectorIndex];
  const prize = sector.prize;

  if (prize > 0) {
    addWinnings(prize);
    updateStats(true, prize);

    if (prize === 500) {
      resultDiv.textContent = `🎊💎 JACKPOT !!! 💎🎊 Vous remportez ${prize}€ !!!`;
    } else {
      resultDiv.textContent = `🎉 Bravo ! ${sector.emoji} ${sector.label} - Vous gagnez ${prize}€ !`;
    }
    resultDiv.className = "result-message win";
  } else {
    updateStats(false);

    const loseMessages = [
      "😢 Dommage... Vous avez perdu. Réessayez !",
      "❌ Pas cette fois ! La roue tourne...",
      "🧊 Glacial ! C'est à côté, retente ta chance !",
      "🌪️ Oups... Le vent a tourné. Recommence !",
      "🤏 Presque ! Ça s'est joué à un poil de moustache.",
    ];

    const randomMessage =
      loseMessages[Math.floor(Math.random() * loseMessages.length)];

    resultDiv.textContent = randomMessage;
    resultDiv.className = "result-message lose shake-animation";
  }

  isWheelSpinning = false;
  spinBtn.disabled = false;
}

// ========================================
// CRASH ROCKET GAME
// ========================================
let crashCanvas = null;
let crashCtx = null;
let crashMultiplier = 1.0;
let crashPoint = 0;
let isCrashRunning = false;
let crashAnimationId = null;
let crashStartTime = 0;

function initCrashGame() {
  crashGame.style.display = "block";
  gameTitleEl.textContent = "🚀 Crash Rocket";
  betAmountEl.textContent = `${CRASH_CONFIG.bet}€`;

  crashCanvas = document.getElementById("crashCanvas");
  crashCtx = crashCanvas.getContext("2d");

  document
    .getElementById("crashBetBtn")
    .addEventListener("click", startCrashRound);
  document
    .getElementById("crashCashoutBtn")
    .addEventListener("click", crashCashout);

  drawCrashCanvas(1.0);
}

function drawCrashCanvas(multiplier) {
  const width = crashCanvas.width;
  const height = crashCanvas.height;

  // Background
  crashCtx.fillStyle = "#1a1a2e";
  crashCtx.fillRect(0, 0, width, height);

  // Grid
  crashCtx.strokeStyle = "rgba(100, 100, 255, 0.1)";
  crashCtx.lineWidth = 1;
  for (let i = 0; i < width; i += 50) {
    crashCtx.beginPath();
    crashCtx.moveTo(i, 0);
    crashCtx.lineTo(i, height);
    crashCtx.stroke();
  }
  for (let i = 0; i < height; i += 50) {
    crashCtx.beginPath();
    crashCtx.moveTo(0, i);
    crashCtx.lineTo(width, i);
    crashCtx.stroke();
  }

  // Curve
  crashCtx.strokeStyle = "#4facfe";
  crashCtx.lineWidth = 3;
  crashCtx.beginPath();
  crashCtx.moveTo(0, height);

  const maxX = width * Math.min(multiplier / 10, 1);
  for (let x = 0; x <= maxX; x += 5) {
    const t = x / width;
    const y =
      height -
      (height * Math.log(1 + t * (multiplier - 1))) / Math.log(multiplier);
    crashCtx.lineTo(x, y);
  }
  crashCtx.stroke();

  // Rocket emoji
  const rocketX = maxX;
  const t = rocketX / width;
  const rocketY =
    height -
    (height * Math.log(1 + t * (multiplier - 1))) / Math.log(multiplier);
  crashCtx.font = "40px Arial";
  crashCtx.fillText("🚀", rocketX - 20, rocketY);
}

function startCrashRound() {
  if (isCrashRunning) return;

  if (!canPlay(CRASH_CONFIG.bet)) {
    showGameOver();
    return;
  }

  deductBet(CRASH_CONFIG.bet);

  const rand = Math.random();
  if (rand < 0.4) {
    crashPoint = 1.1 + Math.random() * 0.9; // 1.1-2.0 (40%)
  } else if (rand < 0.7) {
    crashPoint = 2.0 + Math.random() * 3.0; // 2.0-5.0 (30%)
  } else if (rand < 0.9) {
    crashPoint = 5.0 + Math.random() * 5.0; // 5.0-10.0 (20%)
  } else {
    crashPoint = 10.0 + Math.random() * 40.0; // 10.0-50.0 (10%)
  }

  isCrashRunning = true;
  crashMultiplier = 1.0;
  crashStartTime = Date.now();

  document.getElementById("crashBetBtn").style.display = "none";
  document.getElementById("crashCashoutBtn").style.display = "inline-block";
  document.getElementById("crashResult").textContent = "";

  animateCrash();
}

function animateCrash() {
  const elapsed = (Date.now() - crashStartTime) / 1000;
  crashMultiplier = 1.0 + elapsed * 0.5;

  if (crashMultiplier >= crashPoint) {
    crashExplosion();
    return;
  }

  drawCrashCanvas(crashMultiplier);
  document.getElementById("crashMultiplier").textContent =
    `${crashMultiplier.toFixed(2)}x`;

  crashAnimationId = requestAnimationFrame(animateCrash);
}

function crashCashout() {
  if (!isCrashRunning) return;

  cancelAnimationFrame(crashAnimationId);
  isCrashRunning = false;

  const winAmount = Math.floor(CRASH_CONFIG.bet * crashMultiplier);

  addWinnings(winAmount);
  updateStats(true, winAmount);

  const resultDiv = document.getElementById("crashResult");
  resultDiv.textContent = `💰 Encaissé à ${crashMultiplier.toFixed(2)}x ! Gain : ${winAmount}€`;
  resultDiv.className = "result-message win";

  document.getElementById("crashBetBtn").style.display = "inline-block";
  document.getElementById("crashCashoutBtn").style.display = "none";
}

function crashExplosion() {
  cancelAnimationFrame(crashAnimationId);
  isCrashRunning = false;

  crashCtx.fillStyle = "#ff6b6b";
  crashCtx.font = "80px Arial";
  crashCtx.textAlign = "center";
  crashCtx.fillText("💥", crashCanvas.width / 2, crashCanvas.height / 2);

  updateStats(false);

  const resultDiv = document.getElementById("crashResult");
  resultDiv.textContent = `💥 CRASH à ${crashPoint.toFixed(2)}x ! Vous avez tout perdu.`;
  resultDiv.className = "result-message lose";

  document.getElementById("crashBetBtn").style.display = "inline-block";
  document.getElementById("crashCashoutBtn").style.display = "none";

  setTimeout(() => {
    drawCrashCanvas(1.0);
    document.getElementById("crashMultiplier").textContent = "1.00x";
  }, 2000);
}

// ========================================
// BLACKJACK GAME
// ========================================
let bjDeck = [];
let bjPlayerHand = [];
let bjDealerHand = [];
let bjGameActive = false;

function initBlackjackGame() {
  blackjackGame.style.display = "block";
  gameTitleEl.textContent = "🃏 Blackjack 21";
  betAmountEl.textContent = `${BLACKJACK_CONFIG.bet}€`;

  document.getElementById("bjDealBtn").addEventListener("click", bjDeal);
  document.getElementById("bjHitBtn").addEventListener("click", bjHit);
  document.getElementById("bjStandBtn").addEventListener("click", bjStand);
}

function createBJDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const values = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ];
  const deck = [];

  for (let suit of suits) {
    for (let value of values) {
      deck.push({ value, suit });
    }
  }

  return deck.sort(() => Math.random() - 0.5);
}

function bjGetCardValue(card) {
  if (card.value === "A") return 11;
  if (["J", "Q", "K"].includes(card.value)) return 10;
  return parseInt(card.value);
}

function bjCalculateScore(hand) {
  let score = 0;
  let aces = 0;

  for (let card of hand) {
    const value = bjGetCardValue(card);
    score += value;
    if (card.value === "A") aces++;
  }

  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }

  return score;
}

function bjRenderCard(card, hidden = false) {
  const cardDiv = document.createElement("div");
  cardDiv.className = "bj-card";

  if (hidden) {
    cardDiv.classList.add("hidden");
    cardDiv.textContent = "🂠";
  } else {
    const suitColor = card.suit === "♥" || card.suit === "♦" ? "red" : "black";
    cardDiv.classList.add(suitColor);
    cardDiv.innerHTML = `<div class="bj-card-value">${card.value}</div><div class="bj-card-suit">${card.suit}</div>`;
  }

  return cardDiv;
}

function bjDeal() {
  if (!canPlay(BLACKJACK_CONFIG.bet)) {
    showGameOver();
    return;
  }

  deductBet(BLACKJACK_CONFIG.bet);

  bjDeck = createBJDeck();
  bjPlayerHand = [bjDeck.pop(), bjDeck.pop()];
  bjDealerHand = [bjDeck.pop(), bjDeck.pop()];
  bjGameActive = true;

  const playerHandDiv = document.getElementById("playerHand");
  const dealerHandDiv = document.getElementById("dealerHand");
  const resultDiv = document.getElementById("blackjackResult");

  playerHandDiv.innerHTML = "";
  dealerHandDiv.innerHTML = "";
  resultDiv.textContent = "";

  // Show player cards
  bjPlayerHand.forEach((card) => playerHandDiv.appendChild(bjRenderCard(card)));

  // Show dealer cards (one hidden)
  dealerHandDiv.appendChild(bjRenderCard(bjDealerHand[0]));
  dealerHandDiv.appendChild(bjRenderCard(bjDealerHand[1], true));

  document.getElementById("playerScore").textContent =
    bjCalculateScore(bjPlayerHand);
  document.getElementById("dealerScore").textContent = bjGetCardValue(
    bjDealerHand[0],
  );

  document.getElementById("bjDealBtn").style.display = "none";
  document.getElementById("bjHitBtn").style.display = "inline-block";
  document.getElementById("bjStandBtn").style.display = "inline-block";

  // Check for blackjack
  if (bjCalculateScore(bjPlayerHand) === 21) {
    bjStand();
  }
}

function bjHit() {
  if (!bjGameActive) return;

  const newCard = bjDeck.pop();
  bjPlayerHand.push(newCard);

  const playerHandDiv = document.getElementById("playerHand");
  playerHandDiv.appendChild(bjRenderCard(newCard));

  const playerScore = bjCalculateScore(bjPlayerHand);
  document.getElementById("playerScore").textContent = playerScore;

  if (playerScore > 21) {
    bjEndGame("bust");
  } else if (playerScore === 21) {
    bjStand();
  }
}

function bjStand() {
  if (!bjGameActive) return;

  bjGameActive = false;

  // Reveal dealer's hidden card
  const dealerHandDiv = document.getElementById("dealerHand");
  dealerHandDiv.innerHTML = "";
  bjDealerHand.forEach((card) => dealerHandDiv.appendChild(bjRenderCard(card)));

  let dealerScore = bjCalculateScore(bjDealerHand);
  document.getElementById("dealerScore").textContent = dealerScore;

  // Dealer draws until 17+
  function dealerDraw() {
    if (dealerScore < 17) {
      setTimeout(() => {
        const newCard = bjDeck.pop();
        bjDealerHand.push(newCard);
        dealerHandDiv.appendChild(bjRenderCard(newCard));
        dealerScore = bjCalculateScore(bjDealerHand);
        document.getElementById("dealerScore").textContent = dealerScore;
        dealerDraw();
      }, 800);
    } else {
      bjEndGame("compare");
    }
  }

  dealerDraw();
}

function bjEndGame(condition) {
  bjGameActive = false;

  const playerScore = bjCalculateScore(bjPlayerHand);
  const dealerScore = bjCalculateScore(bjDealerHand);
  const resultDiv = document.getElementById("blackjackResult");

  let result = "";
  let won = false;
  let winAmount = 0;

  if (condition === "bust") {
    result = "💥 BUST ! Vous avez dépassé 21.";
  } else if (dealerScore > 21) {
    result = "🎉 La banque a dépassé 21 ! Vous gagnez !";
    won = true;
    winAmount = BLACKJACK_CONFIG.bet * 2;
  } else if (playerScore > dealerScore) {
    result = `🏆 Vous gagnez ${playerScore} contre ${dealerScore} !`;
    won = true;
    winAmount = BLACKJACK_CONFIG.bet * 2;
  } else if (playerScore === dealerScore) {
    result = "🤝 Égalité ! Mise remboursée.";
    won = true;
    winAmount = BLACKJACK_CONFIG.bet;
  } else {
    result = `😔 La banque gagne ${dealerScore} contre ${playerScore}.`;
  }

  if (won) {
    addWinnings(winAmount);
    updateStats(true, winAmount);
    resultDiv.className = "result-message win";
  } else {
    updateStats(false);
    resultDiv.className = "result-message lose";
  }

  resultDiv.textContent = result;

  document.getElementById("bjDealBtn").style.display = "inline-block";
  document.getElementById("bjHitBtn").style.display = "none";
  document.getElementById("bjStandBtn").style.display = "none";
}

// ========================================
// PLINKO GAME
// ========================================
let plinkoCanvas = null;
let plinkoCtx = null;
let plinkoBall = null;
let plinkoAnimationId = null;
let plinkoPegs = [];

function initPlinkoGame() {
  plinkoGame.style.display = "block";
  gameTitleEl.textContent = "🔴 Plinko Drop";
  betAmountEl.textContent = `${PLINKO_CONFIG.bet}€`;

  plinkoCanvas = document.getElementById("plinkoCanvas");
  plinkoCtx = plinkoCanvas.getContext("2d");

  createPlinkoPegs();
  drawPlinko();

  document
    .getElementById("plinkoDropBtn")
    .addEventListener("click", dropPlinkoBall);
}

function createPlinkoPegs() {
  const rows = PLINKO_CONFIG.rows;
  const pegSpacing = 45;
  const startY = 80;
  const rowSpacing = 40;

  plinkoPegs = [];

  // Trouver le nombre de piques dans la dernière rangée pour centrer
  const maxPegsInRow = rows + 2;
  const maxWidth = maxPegsInRow * pegSpacing;
  const centerX = plinkoCanvas.width / 2;

  for (let row = 0; row < rows; row++) {
    const pegsInRow = row + 3;
    const rowWidth = (pegsInRow - 1) * pegSpacing;
    const startX = centerX - rowWidth / 2;

    for (let i = 0; i < pegsInRow; i++) {
      plinkoPegs.push({
        x: startX + i * pegSpacing,
        y: startY + row * rowSpacing,
      });
    }
  }
}

function drawPlinko() {
  const width = plinkoCanvas.width;
  const height = plinkoCanvas.height;

  // Background
  plinkoCtx.fillStyle = "#1a1a2e";
  plinkoCtx.fillRect(0, 0, width, height);

  // Pegs
  plinkoCtx.fillStyle = "#ffd43b";
  plinkoPegs.forEach((peg) => {
    plinkoCtx.beginPath();
    plinkoCtx.arc(peg.x, peg.y, 5, 0, 2 * Math.PI);
    plinkoCtx.fill();
  });

  // Buckets - alignés avec l'espacement des piques
  const buckets = PLINKO_CONFIG.multipliers.length;
  const pegSpacing = 45; // Même espacement que les piques
  const bucketWidth = pegSpacing - 2;
  const bucketY = height - 40;
  const centerX = width / 2;

  // Calculer le début des buckets pour les centrer
  const totalBucketsWidth = buckets * pegSpacing;
  const startX = centerX - totalBucketsWidth / 2 + pegSpacing / 2;

  PLINKO_CONFIG.multipliers.forEach((mult, i) => {
    const x = startX + i * pegSpacing - bucketWidth / 2;
    const numBuckets = PLINKO_CONFIG.multipliers.length;

    const distanceFromCenter =
      Math.abs(i - (numBuckets - 1) / 2) / ((numBuckets - 1) / 2);

    let color;
    if (distanceFromCenter < 0.2) {
      color = "#ffeb3b";
    } else if (distanceFromCenter < 0.5) {
      color = "#fb8c00";
    } else if (distanceFromCenter < 0.8) {
      color = "#e53935";
    } else {
      color = "#8e0000";
    }

    // Dessin du bucket avec un petit arrondi pour le réalisme
    plinkoCtx.fillStyle = color;
    // On dessine un rectangle légèrement arrondi ou avec une bordure
    plinkoCtx.beginPath();
    const cornerRadius = 5;
    plinkoCtx.roundRect(x + 2, bucketY, bucketWidth - 4, 35, cornerRadius);
    plinkoCtx.fill();

    // Texte
    plinkoCtx.fillStyle = "white";
    plinkoCtx.font = "bold 13px Poppins"; // Poppins pour matcher ton UI
    plinkoCtx.textAlign = "center";
    plinkoCtx.fillText(`${mult}x`, x + bucketWidth / 2, bucketY + 22);
  });

  // Ball
  if (plinkoBall) {
    plinkoCtx.fillStyle = "#ff6b6b";
    plinkoCtx.beginPath();
    plinkoCtx.arc(plinkoBall.x, plinkoBall.y, 8, 0, 2 * Math.PI);
    plinkoCtx.fill();

    // Ombre de la bille
    plinkoCtx.fillStyle = "rgba(255, 107, 107, 0.3)";
    plinkoCtx.beginPath();
    plinkoCtx.arc(plinkoBall.x, plinkoBall.y + 2, 8, 0, 2 * Math.PI);
    plinkoCtx.fill();
  }
}

function dropPlinkoBall() {
  if (plinkoBall) return;

  if (!canPlay(PLINKO_CONFIG.bet)) {
    showGameOver();
    return;
  }

  deductBet(PLINKO_CONFIG.bet);

  plinkoBall = {
    x: plinkoCanvas.width / 2,
    y: 40,
    vx: 0,
    vy: 0,
  };

  document.getElementById("plinkoDropBtn").disabled = true;
  document.getElementById("plinkoResult").textContent = "";

  animatePlinkoBall();
}

function animatePlinkoBall() {
  const gravity = 0.4;
  const bounce = 0.6;

  plinkoBall.vy += gravity;
  plinkoBall.x += plinkoBall.vx;
  plinkoBall.y += plinkoBall.vy;
  plinkoBall.vx *= 0.99;

  // Check collision with pegs
  plinkoPegs.forEach((peg) => {
    const dx = plinkoBall.x - peg.x;
    const dy = plinkoBall.y - peg.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = 13; // 8 (rayon bille) + 5 (rayon pique)

    if (dist < minDist) {
      // Calculer l'angle de collision
      const angle = Math.atan2(dy, dx);

      // Séparer la bille du pique
      const overlap = minDist - dist;
      plinkoBall.x += Math.cos(angle) * overlap;
      plinkoBall.y += Math.sin(angle) * overlap;

      // Calculer la nouvelle vitesse après rebond
      const normalX = dx / dist;
      const normalY = dy / dist;

      // Composante normale de la vitesse
      const dotProduct = plinkoBall.vx * normalX + plinkoBall.vy * normalY;

      // Réflexion avec perte d'énergie
      plinkoBall.vx = (plinkoBall.vx - 2 * dotProduct * normalX) * bounce;
      plinkoBall.vy = (plinkoBall.vy - 2 * dotProduct * normalY) * bounce;

      // Ajouter une petite composante aléatoire pour plus de variété
      plinkoBall.vx += (Math.random() - 0.5) * 0.5;
    }
  });

  // Walls
  if (plinkoBall.x < 8) {
    plinkoBall.x = 8;
    plinkoBall.vx *= -bounce;
  }
  if (plinkoBall.x > plinkoCanvas.width - 8) {
    plinkoBall.x = plinkoCanvas.width - 8;
    plinkoBall.vx *= -bounce;
  }

  drawPlinko();

  // Check if reached bottom
  if (plinkoBall.y > plinkoCanvas.height - 50) {
    plinkoLanded();
    return;
  }

  plinkoAnimationId = requestAnimationFrame(animatePlinkoBall);
}

function plinkoLanded() {
  cancelAnimationFrame(plinkoAnimationId);

  const buckets = PLINKO_CONFIG.multipliers.length;
  const pegSpacing = 45;
  const centerX = plinkoCanvas.width / 2;
  const totalBucketsWidth = buckets * pegSpacing;
  const startX = centerX - totalBucketsWidth / 2 + pegSpacing / 2;

  // Calculer dans quel bucket la bille est tombée
  const relativeX = plinkoBall.x - (startX - pegSpacing / 2);
  const bucketIndex = Math.floor(relativeX / pegSpacing);
  const clampedIndex = Math.max(0, Math.min(bucketIndex, buckets - 1));

  const multiplier = PLINKO_CONFIG.multipliers[clampedIndex];
  const prize = PLINKO_CONFIG.prizes[clampedIndex];

  addWinnings(prize);
  updateStats(true, prize);

  const resultDiv = document.getElementById("plinkoResult");
  resultDiv.textContent = `🎉 Multiplicateur ${multiplier}x ! Gain : ${prize}€`;
  resultDiv.className = "result-message win";

  plinkoBall = null;
  document.getElementById("plinkoDropBtn").disabled = false;
}

// ========================================
// HI-LO GAME
// ========================================
let hiloDeck = [];
let hiloCurrentCard = null;
let hiloStreak = 0;
let hiloCurrentWin = 0;
let hiloGameActive = false;

function initHiloGame() {
  hiloGame.style.display = "block";
  gameTitleEl.textContent = "⬆️⬇️ Hi-Lo";
  betAmountEl.textContent = `${HILO_CONFIG.bet}€`;

  document.getElementById("hiloStartBtn").addEventListener("click", hiloStart);
  document
    .getElementById("hiloHigherBtn")
    .addEventListener("click", () => hiloGuess("higher"));
  document
    .getElementById("hiloLowerBtn")
    .addEventListener("click", () => hiloGuess("lower"));
  document
    .getElementById("hiloCashoutBtn")
    .addEventListener("click", hiloCashout);
}

function createHiloDeck() {
  const values = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A",
  ];
  const deck = [];

  for (let i = 0; i < 4; i++) {
    values.forEach((value) => deck.push(value));
  }

  return deck.sort(() => Math.random() - 0.5);
}

function hiloGetCardNumericValue(card) {
  if (card === "A") return 14;
  if (card === "K") return 13;
  if (card === "Q") return 12;
  if (card === "J") return 11;
  return parseInt(card);
}

function hiloRenderCard(card) {
  const cardDiv = document.getElementById("hiloCurrentCard");
  cardDiv.className = "hilo-card show";
  cardDiv.innerHTML = `<div class="hilo-card-value">${card}</div>`;
}

function hiloStart() {
  if (!canPlay(HILO_CONFIG.bet)) {
    showGameOver();
    return;
  }

  deductBet(HILO_CONFIG.bet);

  hiloDeck = createHiloDeck();
  hiloCurrentCard = hiloDeck.pop();
  hiloStreak = 0;
  hiloCurrentWin = HILO_CONFIG.bet;
  hiloGameActive = true;

  hiloRenderCard(hiloCurrentCard);

  document.getElementById("hiloStreak").textContent = hiloStreak;
  document.getElementById("hiloCurrentWin").textContent = `${hiloCurrentWin}€`;
  document.getElementById("hiloResult").textContent = "";

  document.getElementById("hiloStartBtn").style.display = "none";
  document.getElementById("hiloHigherBtn").style.display = "inline-block";
  document.getElementById("hiloLowerBtn").style.display = "inline-block";
  document.getElementById("hiloCashoutBtn").style.display = "inline-block";
}

function hiloGuess(direction) {
  if (!hiloGameActive) return;

  const nextCard = hiloDeck.pop();
  const currentValue = hiloGetCardNumericValue(hiloCurrentCard);
  const nextValue = hiloGetCardNumericValue(nextCard);

  hiloRenderCard(nextCard);

  const resultDiv = document.getElementById("hiloResult");

  let correct = false;
  if (direction === "higher" && nextValue > currentValue) correct = true;
  if (direction === "lower" && nextValue < currentValue) correct = true;
  if (nextValue === currentValue) correct = true; // Equal = continue

  if (correct) {
    hiloStreak++;
    hiloCurrentWin = Math.floor(hiloCurrentWin * HILO_CONFIG.multiplierPerWin);

    document.getElementById("hiloStreak").textContent = hiloStreak;
    document.getElementById("hiloCurrentWin").textContent =
      `${hiloCurrentWin}€`;

    resultDiv.textContent = `✅ Correct ! Série : ${hiloStreak}`;
    resultDiv.className = "result-message win";

    hiloCurrentCard = nextCard;

    if (hiloDeck.length === 0) {
      hiloWin();
    }
  } else {
    hiloLose();
  }
}

function hiloCashout() {
  if (!hiloGameActive) return;

  hiloWin();
}

function hiloWin() {
  hiloGameActive = false;

  addWinnings(hiloCurrentWin);
  updateStats(true, hiloCurrentWin);

  const resultDiv = document.getElementById("hiloResult");
  resultDiv.textContent = `💰 Encaissé ! Gain total : ${hiloCurrentWin}€ (Série : ${hiloStreak})`;
  resultDiv.className = "result-message win";

  hiloReset();
}

function hiloLose() {
  hiloGameActive = false;

  updateStats(false);

  const resultDiv = document.getElementById("hiloResult");
  resultDiv.textContent = `❌ Perdu ! Vous avez fait une série de ${hiloStreak}.`;
  resultDiv.className = "result-message lose";

  hiloReset();
}

function hiloReset() {
  document.getElementById("hiloStartBtn").style.display = "inline-block";
  document.getElementById("hiloHigherBtn").style.display = "none";
  document.getElementById("hiloLowerBtn").style.display = "none";
  document.getElementById("hiloCashoutBtn").style.display = "none";
}

// ========================================
// GAME OVER
// ========================================
function showGameOver() {
  scratchGame.style.display = "none";
  slotsGame.style.display = "none";
  cardGame.style.display = "none";
  wheelGame.style.display = "none";
  crashGame.style.display = "none";
  blackjackGame.style.display = "none";
  plinkoGame.style.display = "none";
  hiloGame.style.display = "none";
  gameOverDiv.style.display = "block";
}

// ========================================
// START
// ========================================
init();
