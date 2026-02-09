// ========================================
// STORAGE KEYS
// ========================================
const STORAGE_KEYS = {
  MONEY: 'global_money',
  FUNFAIR_TICKETS: 'funfair_tickets',
  STATS: 'casino_stats',
  FUNFAIR_STATS: 'funfair_stats',
  INITIAL_BUDGET: 'global_initial_budget',

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

  button.onclick = () => {
    overlay.classList.remove('show');
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('show');
    }
  };
}

// ========================================
// DOM ELEMENTS
// ========================================
const configContainer = document.getElementById('configContainer');
const gamesContainer = document.getElementById('gamesContainer');
const moneyDisplay = document.getElementById('moneyDisplay');
const currentMoneyEl = document.getElementById('currentMoney');
const setBudgetBtn = document.getElementById('setBudgetBtn');
const resetBtn = document.getElementById('resetBtn');

const totalGamesEl = document.getElementById('totalGames');
const totalWinsEl = document.getElementById('totalWins');
const totalEarningsEl = document.getElementById('totalEarnings');
const biggestWinEl = document.getElementById('biggestWin');

// ========================================
// GAME DATA
// ========================================
const GAMES = {
  scratch: {
    name: 'Ticket à gratter',
    bet: 5
  },
  slots: {
    name: 'Machine à sous',
    bet: 2
  },
  card: {
    name: 'Carte Chance',
    bet: 10
  },
  wheel: {
    name: 'Roue de la Fortune',
    bet: 50
  },
  crash: {
    name: 'Crash Rocket',
    bet: 20
  },
  blackjack: {
    name: 'Blackjack 21',
    bet: 25
  },
  plinko: {
    name: 'Plinko Drop',
    bet: 5
  },
  hilo: {
    name: 'Hi-Lo',
    bet: 5
  }
};

// ========================================
// INITIALIZE
// ========================================
function init() {
  const money = getMoney();

  if (money !== null) {
    // L'utilisateur a déjà de l'argent
    showGamesMenu();
  } else {
    // Première visite
    showBudgetSelection();
  }

  // Event listeners
  setBudgetBtn.addEventListener('click', handleSetBudget);
  resetBtn.addEventListener('click', handleReset);

  // Game card clicks
  document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
      const game = card.dataset.game;
      startGame(game);
    });
  });

  updateStats();
}

// ========================================
// BUDGET SELECTION
// ========================================
function showBudgetSelection() {
  configContainer.style.display = 'block';
  gamesContainer.style.display = 'none';
  moneyDisplay.style.display = 'none';
}

function handleSetBudget() {
  const selectedBudget = document.querySelector('input[name="budget"]:checked');
  if (!selectedBudget) return;

  const budget = parseInt(selectedBudget.value);
  setMoney(budget);
  setInitialBudget(budget);

  showGamesMenu();
}

// ========================================
// GAMES MENU
// ========================================
function showGamesMenu() {
  configContainer.style.display = 'none';
  gamesContainer.style.display = 'block';
  moneyDisplay.style.display = 'flex';

  updateMoneyDisplay();
  updateStats();
}

function updateMoneyDisplay() {
  const money = getMoney();
  currentMoneyEl.textContent = `${money}€`;
}

// ========================================
// GAME START
// ========================================
function startGame(gameType) {
  const money = getMoney();
  const bet = GAMES[gameType].bet;

  if (money < bet) {
    showPopup('💸', 'Fonds insuffisants', `Vous n'avez pas assez d'argent pour jouer à ce jeu ! Mise requise : ${bet}€`);
    return;
  }

  // Sauvegarder le type de jeu
  sessionStorage.setItem('casino_current_game', gameType);

  // Rediriger vers la page de jeu
  window.location.href = 'game.html';
}

// ========================================
// RESET
// ========================================
function handleReset() {
  const overlay = document.getElementById('popupOverlay');
  const iconEl = document.getElementById('popupIcon');
  const titleEl = document.getElementById('popupTitle');
  const messageEl = document.getElementById('popupMessage');
  const button = document.getElementById('popupButton');

  iconEl.textContent = '⚠️';
  titleEl.textContent = 'Recommencer ?';
  messageEl.textContent = 'Êtes-vous sûr de vouloir recommencer ? Toutes vos données seront perdues.';
  button.textContent = 'Oui, recommencer';

  overlay.classList.add('show');

  button.onclick = () => {
    localStorage.removeItem(STORAGE_KEYS.MONEY);
    localStorage.removeItem(STORAGE_KEYS.STATS);
    localStorage.removeItem(STORAGE_KEYS.INITIAL_BUDGET);
    localStorage.removeItem(STORAGE_KEYS.FUNFAIR_TICKETS);
    localStorage.removeItem(STORAGE_KEYS.FUNFAIR_STATS);

    overlay.classList.remove('show');
    button.textContent = 'OK';

    showBudgetSelection();
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('show');
      button.textContent = 'OK';
    }
  };
}

// ========================================
// STATS
// ========================================
function updateStats() {
  const stats = getStats();

  totalGamesEl.textContent = stats.totalGames;
  totalWinsEl.textContent = stats.totalWins;
  totalEarningsEl.textContent = `${stats.totalEarnings}€`;
  biggestWinEl.textContent = `${stats.biggestWin}€`;
}

function getStats() {
  const statsString = localStorage.getItem(STORAGE_KEYS.STATS);

  // Default structure
  const defaults = {
    totalGames: 0,
    totalWins: 0,
    totalEarnings: 0,
    biggestWin: 0
  };

  if (!statsString) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(statsString);
    console.log("Loaded casino stats:", parsed);
    return { ...defaults, ...parsed };
  } catch (e) {
    console.error("Error parsing casino stats:", e);
    return defaults;
  }
}

// ========================================
// STORAGE HELPERS
// ========================================
function getMoney() {
  const money = localStorage.getItem(STORAGE_KEYS.MONEY);
  return money !== null ? parseInt(money) : null;
}

function setMoney(amount) {
  localStorage.setItem(STORAGE_KEYS.MONEY, amount);
}

function setInitialBudget(amount) {
  localStorage.setItem(STORAGE_KEYS.INITIAL_BUDGET, amount);
}

function getInitialBudget() {
  const budget = localStorage.getItem(STORAGE_KEYS.INITIAL_BUDGET);
  return budget !== null ? parseInt(budget) : 100;
}

// ========================================
// START
// ========================================
init();