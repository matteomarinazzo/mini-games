// ========================================
// STORAGE KEYS
// ========================================
const STORAGE_KEYS = {
  MONEY: 'global_money',
  TICKETS: 'funfair_tickets',
  STATS: 'funfair_stats',
  CASINO_STATS: 'casino_stats',
  INITIAL_BUDGET: 'global_initial_budget'
};

// ========================================
// POPUP SYSTEM
// ========================================
function showPopup(icon, title, message, buttonText = 'OK') {
  const overlay = document.getElementById('popupOverlay');
  const iconEl = document.getElementById('popupIcon');
  const titleEl = document.getElementById('popupTitle');
  const messageEl = document.getElementById('popupMessage');
  const button = document.getElementById('popupButton');

  iconEl.textContent = icon;
  titleEl.textContent = title;
  messageEl.textContent = message;
  button.textContent = buttonText;

  overlay.classList.add('show');

  return new Promise((resolve) => {
    button.onclick = () => {
      overlay.classList.remove('show');
      resolve(true);
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
        resolve(false);
      }
    };
  });
}

// ========================================
// DOM ELEMENTS
// ========================================
const configContainer = document.getElementById('configContainer');
const conversionContainer = document.getElementById('conversionContainer');
const gamesContainer = document.getElementById('gamesContainer');
const moneyDisplay = document.getElementById('moneyDisplay');
const currentMoneyEl = document.getElementById('currentMoney');
const currentTicketsEl = document.getElementById('currentTickets');
const setBudgetBtn = document.getElementById('setBudgetBtn');
const convertBtn = document.getElementById('convertBtn');
const resetBtn = document.getElementById('resetBtn');

// Conversion elements
const availableMoneyEl = document.getElementById('availableMoney');
const ticketCountEl = document.getElementById('ticketCount');
const ticketCostEl = document.getElementById('ticketCost');
const minusTicketBtn = document.getElementById('minusTicket');
const plusTicketBtn = document.getElementById('plusTicket');
const buyTicketsBtn = document.getElementById('buyTicketsBtn');
const skipBuyBtn = document.getElementById('skipBuyBtn');

// Stats elements
const totalGamesEl = document.getElementById('totalGames');
const totalWinsEl = document.getElementById('totalWins');
const totalTicketsWonEl = document.getElementById('totalTicketsWon');
const biggestWinEl = document.getElementById('biggestWin');

// ========================================
// GAME DATA
// ========================================
const GAMES = {
  cups: { name: 'Pyramide de Gobelets', price: 1, maxWin: 2 },
  shooting: { name: 'Tir à la Cible', price: 5, maxWin: 15 },
  beerpong: { name: 'Beer Pong', price: 5, maxWin: 10 },
  darts: { name: 'Fléchettes', price: 2, maxWin: 5 },
  coverspot: { name: 'Couvre-Tout', price: 3, maxWin: 5 },
  highstriker: { name: 'Marteau de Force', price: 3, maxWin: 5 },
  balloonpop: { name: 'Ballons à Éclater', price: 5, maxWin: 8 },
  ringtoss: { name: 'Anneaux sur Piquets', price: 10, maxWin: 15 }
};

// ========================================
// TICKET CONVERSION STATE
// ========================================
let ticketsToBuy = 0;
const TICKET_PRICE = 2;

// ========================================
// INITIALIZE
// ========================================
function init() {
  const money = getMoney();
  const tickets = getTickets();

  if (money !== null) {
    // L'utilisateur a déjà un budget
    showGamesMenu();
  } else {
    // Première visite
    showBudgetSelection();
  }

  // Event listeners
  setBudgetBtn.addEventListener('click', handleSetBudget);
  convertBtn.addEventListener('click', handleConvertMenu);
  resetBtn.addEventListener('click', handleReset);

  // Conversion listeners (use onclick to allow overriding)
  minusTicketBtn.onclick = () => adjustTicketCount(-1);
  plusTicketBtn.onclick = () => adjustTicketCount(1);
  buyTicketsBtn.onclick = handleBuyTickets;
  skipBuyBtn.onclick = showGamesMenu;

  // Game card clicks
  document.querySelectorAll('.game-card').forEach(card => {
    const playBtn = card.querySelector('.play-button');
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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
  conversionContainer.style.display = 'none';
  gamesContainer.style.display = 'none';
  moneyDisplay.style.display = 'none';
}

function handleSetBudget() {
  const selectedBudget = document.querySelector('input[name="budget"]:checked');
  if (!selectedBudget) {
    showPopup('⚠️', 'Attention', 'Veuillez sélectionner un budget !');
    return;
  }

  const budget = parseInt(selectedBudget.value);
  setMoney(budget);
  setInitialBudget(budget);

  // Montrer la conversion des tickets
  showConversion();
}

// ========================================
// TICKET CONVERSION
// ========================================
function handleConvertMenu() {
  // Ask user which conversion they want
  const tickets = getTickets();
  const money = getMoney();

  if (tickets === 0 && money < TICKET_PRICE) {
    showPopup('❌', 'Impossible', 'Vous n\'avez ni tickets ni assez d\'argent pour convertir !');
    return;
  }

  // Show custom popup with 2 options
  const overlay = document.getElementById('popupOverlay');
  const iconEl = document.getElementById('popupIcon');
  const titleEl = document.getElementById('popupTitle');
  const messageEl = document.getElementById('popupMessage');
  const button = document.getElementById('popupButton');

  iconEl.textContent = '💱';
  titleEl.textContent = 'Conversion';

  // Create two buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 20px;';

  const moneyToTicketsBtn = document.createElement('button');
  moneyToTicketsBtn.className = 'popup-button';
  moneyToTicketsBtn.textContent = '💰 → 🎟️ Acheter tickets';
  moneyToTicketsBtn.style.cssText = 'flex: 1; background: linear-gradient(135deg, #f59e0b, #fbbf24);';
  moneyToTicketsBtn.disabled = money < TICKET_PRICE;
  moneyToTicketsBtn.onclick = () => {
    overlay.classList.remove('show');
    messageEl.parentElement.removeChild(buttonContainer);
    button.style.display = 'block';
    showConversion();
  };

  const ticketsToMoneyBtn = document.createElement('button');
  ticketsToMoneyBtn.className = 'popup-button';
  ticketsToMoneyBtn.textContent = '🎟️ → 💰 Vendre tickets';
  ticketsToMoneyBtn.style.cssText = 'flex: 1; background: linear-gradient(135deg, #10b981, #14b8a6);';
  ticketsToMoneyBtn.disabled = tickets === 0;
  ticketsToMoneyBtn.onclick = () => {
    overlay.classList.remove('show');
    messageEl.parentElement.removeChild(buttonContainer);
    button.style.display = 'block';
    showTicketSell();
  };

  buttonContainer.appendChild(moneyToTicketsBtn);
  buttonContainer.appendChild(ticketsToMoneyBtn);

  messageEl.textContent = 'Que voulez-vous faire ?';
  messageEl.parentElement.appendChild(buttonContainer);
  button.style.display = 'none';

  overlay.classList.add('show');

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('show');
      messageEl.parentElement.removeChild(buttonContainer);
      button.style.display = 'block';
    }
  };
}

function showConversion() {
  const money = getMoney();

  if (money < TICKET_PRICE) {
    showPopup('💸', 'Budget insuffisant', 'Vous n\'avez pas assez d\'argent pour acheter des tickets. Retournez au casino pour gagner plus d\'argent !');
    return;
  }

  configContainer.style.display = 'none';
  conversionContainer.style.display = 'block';
  gamesContainer.style.display = 'none';
  moneyDisplay.style.display = 'none';

  ticketsToBuy = 0;
  updateConversionDisplay();
}

function adjustTicketCount(delta) {
  const money = getMoney();
  const maxTickets = Math.floor(money / TICKET_PRICE);

  ticketsToBuy = Math.max(0, Math.min(maxTickets, ticketsToBuy + delta));
  updateConversionDisplay();
}

function updateConversionDisplay() {
  const money = getMoney();
  const cost = ticketsToBuy * TICKET_PRICE;
  const maxTickets = Math.floor(money / TICKET_PRICE);

  availableMoneyEl.textContent = `${money}€`;
  ticketCountEl.textContent = ticketsToBuy;
  ticketCostEl.textContent = `${cost}€`;

  minusTicketBtn.disabled = ticketsToBuy === 0;
  plusTicketBtn.disabled = ticketsToBuy >= maxTickets;
  buyTicketsBtn.disabled = ticketsToBuy === 0;
}

function handleBuyTickets() {
  if (ticketsToBuy === 0) return;

  const cost = ticketsToBuy * TICKET_PRICE;
  const money = getMoney();

  if (money < cost) {
    showPopup('❌', 'Erreur', 'Vous n\'avez pas assez d\'argent !');
    return;
  }

  // Déduire l'argent et ajouter les tickets
  setMoney(money - cost);
  addTickets(ticketsToBuy);

  showPopup('✅', 'Tickets achetés !', `Vous avez acheté ${ticketsToBuy} ticket${ticketsToBuy > 1 ? 's' : ''} pour ${cost}€`).then(() => {
    showGamesMenu();
  });
}

// ========================================
// TICKET SELLING (TICKETS → ARGENT)
// ========================================
let ticketsToSell = 0;

function showTicketSell() {
  const tickets = getTickets();

  if (tickets === 0) {
    showPopup('🎟️', 'Pas de tickets', 'Vous n\'avez pas de tickets à vendre !');
    return;
  }

  configContainer.style.display = 'none';
  conversionContainer.style.display = 'block';
  gamesContainer.style.display = 'none';
  moneyDisplay.style.display = 'none';

  // Modify conversion UI for selling
  conversionContainer.querySelector('.config-header h2').textContent = '💰 Vendre des tickets';
  conversionContainer.querySelector('.config-header p').innerHTML = `1 ticket = 2€ | Vous avez <span id="availableTicketsSell">${tickets}🎟️</span>`;
  document.getElementById('buyTicketsBtn').textContent = '💰 Vendre les tickets';

  ticketsToSell = 0;
  updateSellDisplay();

  // Override button functions
  minusTicketBtn.onclick = () => adjustSellCount(-1);
  plusTicketBtn.onclick = () => adjustSellCount(1);
  buyTicketsBtn.onclick = handleSellTickets;
  skipBuyBtn.onclick = () => {
    resetConversionUI();
    showGamesMenu();
  };
}

function adjustSellCount(delta) {
  const tickets = getTickets();

  ticketsToSell = Math.max(0, Math.min(tickets, ticketsToSell + delta));
  updateSellDisplay();
}

function updateSellDisplay() {
  const tickets = getTickets();
  const earnings = ticketsToSell * TICKET_PRICE;

  document.getElementById('availableTicketsSell').textContent = `${tickets}🎟️`;
  ticketCountEl.textContent = ticketsToSell;
  ticketCostEl.textContent = `${earnings}€`;

  minusTicketBtn.disabled = ticketsToSell === 0;
  plusTicketBtn.disabled = ticketsToSell >= tickets;
  buyTicketsBtn.disabled = ticketsToSell === 0;
}

function handleSellTickets() {
  if (ticketsToSell === 0) return;

  const earnings = ticketsToSell * TICKET_PRICE;
  const money = getMoney();

  // Remove tickets and add money
  removeTickets(ticketsToSell);
  setMoney(money + earnings);

  showPopup('✅', 'Tickets vendus !', `Vous avez vendu ${ticketsToSell} ticket${ticketsToSell > 1 ? 's' : ''} pour ${earnings}€`).then(() => {
    resetConversionUI();
    showGamesMenu();
  });
}

function resetConversionUI() {
  // Reset UI to original state
  conversionContainer.querySelector('.config-header h2').textContent = '🎟️ Acheter des tickets';
  conversionContainer.querySelector('.config-header p').innerHTML = '1 ticket = 2€ | Vous avez <span id="availableMoney">0€</span>';
  document.getElementById('buyTicketsBtn').textContent = '🎟️ Acheter les tickets';

  // Reset button functions
  minusTicketBtn.onclick = () => adjustTicketCount(-1);
  plusTicketBtn.onclick = () => adjustTicketCount(1);
  buyTicketsBtn.onclick = handleBuyTickets;
  skipBuyBtn.onclick = showGamesMenu;
}

// ========================================
// GAMES MENU
// ========================================
function showGamesMenu() {
  configContainer.style.display = 'none';
  conversionContainer.style.display = 'none';
  gamesContainer.style.display = 'block';
  moneyDisplay.style.display = 'flex';

  updateMoneyDisplay();
  updateStats();
}

function updateMoneyDisplay() {
  const money = getMoney();
  const tickets = getTickets();
  currentMoneyEl.textContent = `${money}€`;
  currentTicketsEl.textContent = tickets;
}

// ========================================
// GAME START
// ========================================
function startGame(gameType) {
  const tickets = getTickets();
  const price = GAMES[gameType].price;

  if (tickets < price) {
    showPopup('🎟️', 'Tickets insuffisants', `Vous n'avez pas assez de tickets pour jouer à ce jeu ! Prix : ${price}🎟️`);
    return;
  }

  // Sauvegarder le type de jeu
  sessionStorage.setItem('funfair_current_game', gameType);

  // Déduire les tickets
  removeTickets(price);

  // Rediriger vers la page de jeu
  window.location.href = 'game.html';
}

// ========================================
// RESET
// ========================================
async function handleReset() {
  const confirmed = await showPopup(
    '⚠️',
    'Recommencer ?',
    'Êtes-vous sûr de vouloir recommencer ? Toutes vos données (argent et tickets) seront perdues.',
    'Oui, recommencer'
  );

  if (confirmed) {
    localStorage.removeItem(STORAGE_KEYS.MONEY);
    localStorage.removeItem(STORAGE_KEYS.TICKETS);
    localStorage.removeItem(STORAGE_KEYS.STATS);
    localStorage.removeItem(STORAGE_KEYS.INITIAL_BUDGET);
    localStorage.removeItem(STORAGE_KEYS.CASINO_STATS);

    showBudgetSelection();
  }
}

// ========================================
// STATS
// ========================================
function updateStats() {
  const stats = getStats();

  totalGamesEl.textContent = stats.totalGames;
  totalWinsEl.textContent = stats.totalWins;
  totalTicketsWonEl.textContent = stats.totalTicketsWon;
  biggestWinEl.textContent = `${stats.biggestWin}🎟️`;
}

function getStats() {
  const statsString = localStorage.getItem(STORAGE_KEYS.STATS);

  // Default structure
  const defaults = {
    totalGames: 0,
    totalWins: 0,
    totalTicketsWon: 0,
    biggestWin: 0
  };

  if (!statsString) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(statsString);
    // Merge with defaults to ensure all keys exist
    console.log("Loaded stats:", parsed);
    return { ...defaults, ...parsed };
  } catch (e) {
    console.error("Error parsing stats:", e);
    return defaults;
  }
}

export function updateStats_fromGame(won, ticketsWon) {
  const stats = getStats();

  stats.totalGames++;
  if (won) stats.totalWins++;
  if (ticketsWon > 0) {
    stats.totalTicketsWon += ticketsWon;
    stats.biggestWin = Math.max(stats.biggestWin, ticketsWon);
  }

  localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
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

function getTickets() {
  const tickets = localStorage.getItem(STORAGE_KEYS.TICKETS);
  return tickets !== null ? parseInt(tickets) : 0;
}

function setTickets(amount) {
  localStorage.setItem(STORAGE_KEYS.TICKETS, amount);
}

function addTickets(amount) {
  const current = getTickets();
  setTickets(current + amount);
}

export function removeTickets(amount) {
  const current = getTickets();
  setTickets(Math.max(0, current - amount));
}

export function addTicketsReward(amount) {
  addTickets(amount);
}

function setInitialBudget(amount) {
  localStorage.setItem(STORAGE_KEYS.INITIAL_BUDGET, amount);
}

// ========================================
// EXPORT GETTERS FOR GAME.JS
// ========================================
export function getCurrentTickets() {
  return getTickets();
}

export function getCurrentMoney() {
  return getMoney();
}

// ========================================
// START
// ========================================
init();