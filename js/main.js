import { initRatingSystem } from "./rating-system.js";
import { checkRealConnection } from './network.js';
import { showBMC, hideBMC } from './BuyMeACoffee.js';
import {
  playGameSound,
  startMenuMusic,
  toggleMenuMusic,
  toggleSound,
  getMusicEnabled,
  getSoundEnabled
} from './utils/audio.js';
import { notifyGameLaunch, notifyBackToHome, notifyAboutVisit } from './utils/webhooks.js';
import { initProfilePanel, updateStreak, updateProfileLanguage, checkPremiumReturn, openPanel } from './profilePanel.js';
import { reportGamePlayed, reportRandomUsed, checkAndUnlockBadges, checkPendingBadges } from './utils/badges.js';
import { initAds, handleSmartLink, checkPendingGameLaunch } from './utils/ads.js';
import { initDailyChallenge } from './utils/dailyChallenge.js';
import { getLevel, getXPInLevel, getLevelProgress, addXP } from './utils/xpSystem.js';

var games = {};
let categoriesData = {};
let currentFilter = 'Tout';
let currentSortOrder = 'default';

fetch("./assets/data/games.json")
  .then((res) => {
    if (!res.ok) throw new Error("Erreur chargement games.json");
    return res.json();
  })
  .then(async (data) => {
    categoriesData = data;
    games = {};
    for (const [catName, catGames] of Object.entries(data)) {
      for (const [gameId, game] of Object.entries(catGames)) {
        games[gameId] = game;
        games[gameId].category = catName;
      }
    }

    // 1. On détermine la langue : Priorité au Cache, sinon Navigateur, sinon FR
    const browserLang = navigator.language.split('-')[0].toUpperCase();
    const defaultLang = localStorage.getItem("lang") || browserLang || "EN";

    // 2. On initialise avec la bonne langue directement
    await loadFallback();
    await setLang(defaultLang);
    const langDisplay = document.getElementById('currentLangDisplay');
    if (langDisplay) langDisplay.textContent = I18N.lang;

    // 3. On lance le reste
    refreshTexts();

    initLangSelector();
    initHeaderXpWidget();
    initSearchControls();
    initSortControls();
    initDailyBoostGame();
    renderRecentGames();
    initArcadeRoulette();
    addScrollAnimations();
    displayAppVersion();

    initCategoryFilters();
    generateGameCards();
    initProfilePanel(Object.keys(games).length);

    // On lance la vérification initiale
    await refreshStatus();
    checkPremiumReturn();
    checkAndUnlockBadges();
    // Initialiser le nom du joueur
    if (!localStorage.getItem('mg_player_name')) {
      localStorage.setItem('mg_player_name', 'Joueur');
    }

    // Gestion des pubs (Social Bar et retour Smart Link)
    initAds();
    checkPendingGameLaunch(launchGame);
  })
  .catch((err) => {
    console.error(err);
  });

// Initialiser le selecteur de langue
function initLangSelector() {
  const langBtn = document.getElementById('langBtn');
  const langMenu = document.getElementById('langMenu');
  const currentLangDisplay = document.getElementById('currentLangDisplay');

  if (!langBtn || !langMenu) return;

  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    if (!langMenu.classList.contains('hidden')) {
      langMenu.classList.add('hidden');
    }
  });

  const options = document.querySelectorAll('.lang-option');
  options.forEach(opt => {
    opt.addEventListener('click', async (e) => {
      const lang = e.target.dataset.lang;
      await setLang(lang);
      if (currentLangDisplay) currentLangDisplay.textContent = lang;

      // Mettre à jour l'interface avec la nouvelle langue
      initCategoryFilters();
      generateGameCards();
      updateProfileLanguage();
      refreshStatus();
    });
  });
}

// ─── MINI-WIDGET XP DANS LE HEADER ───────────────────────────────────────────
function initHeaderXpWidget() {
  const widget = document.getElementById('headerXpWidget');
  if (!widget) return;

  const updateWidget = () => {
    const lvl = getLevel();
    const progress = Math.min(100, Math.round(getLevelProgress() * 100));
    const xpInLvl = getXPInLevel();

    const lvlEl = document.getElementById('headerXpLevel');
    const fillEl = document.getElementById('headerXpBarFill');
    const valEl = document.getElementById('headerXpVal');

    if (lvlEl) lvlEl.textContent = `⭐ Niv. ${lvl}`;
    if (fillEl) fillEl.style.width = `${progress}%`;
    if (valEl) valEl.textContent = `${xpInLvl}/250`;
  };

  updateWidget();
  window.addEventListener('mg:xp_updated', updateWidget);

  widget.addEventListener('click', (e) => {
    e.stopPropagation();
    openPanel('stats');
  });
}

// ─── RECHERCHE & EMPTY STATE ──────────────────────────────────────────────────
function initSearchControls() {
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("searchClearBtn");
  const resetBtn = document.getElementById("emptyResetBtn");

  if (!searchInput) return;

  searchInput.addEventListener("input", () => {
    if (clearBtn) {
      clearBtn.classList.toggle("hidden", searchInput.value.trim().length === 0);
    }
    filterGames();
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      clearBtn.classList.add("hidden");
      searchInput.focus();
      filterGames();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      searchInput.value = "";
      if (clearBtn) clearBtn.classList.add("hidden");
      currentFilter = 'Tout';
      initCategoryFilters();
      generateGameCards();
    });
  }
}

// ─── OPTIONS DE TRI ───────────────────────────────────────────────────────────
function initSortControls() {
  const box = document.getElementById('sortSelectorBox');
  if (!box) return;

  const sortOptions = [
    { value: 'default',  i18nKey: 'menu.sort_default',  icon: '⚡' },
    { value: 'rating',   i18nKey: 'menu.sort_rating',   icon: '⭐' },
    { value: 'popular',  i18nKey: 'menu.sort_popular',  icon: '🎮' },
    { value: 'new',      i18nKey: 'menu.sort_new',       icon: '🚀' },
  ];

  // ── Construit le HTML du custom dropdown
  function getLabel(opt) {
    return (window.t ? window.t(opt.i18nKey) : null) || opt.i18nKey.split('.').pop();
  }

  function buildDropdown() {
    const current = sortOptions.find(o => o.value === currentSortOrder) || sortOptions[0];

    box.innerHTML = `
      <div class="sort-custom-dropdown" id="sortCustomDropdown" role="combobox"
           aria-haspopup="listbox" aria-expanded="false" tabindex="0"
           aria-label="${getLabel(current)}">
        <span class="sort-dropdown-icon">${current.icon}</span>
        <span class="sort-dropdown-value" id="sortDropdownValue">${getLabel(current)}</span>
        <svg class="sort-dropdown-chevron" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <ul class="sort-dropdown-panel" id="sortDropdownPanel" role="listbox">
          ${sortOptions.map(opt => `
            <li class="sort-dropdown-option ${opt.value === currentSortOrder ? 'is-selected' : ''}"
                data-value="${opt.value}" role="option"
                aria-selected="${opt.value === currentSortOrder}">
              <span class="sdo-icon">${opt.icon}</span>
              <span class="sdo-label">${getLabel(opt)}</span>
              ${opt.value === currentSortOrder ? '<span class="sdo-check">✓</span>' : ''}
            </li>`).join('')}
        </ul>
      </div>`;

    const trigger = box.querySelector('#sortCustomDropdown');
    const panel   = box.querySelector('#sortDropdownPanel');
    const valEl   = box.querySelector('#sortDropdownValue');
    const iconEl  = box.querySelector('.sort-dropdown-icon');

    // Ouvrir / fermer
    function openDropdown() {
      trigger.setAttribute('aria-expanded', 'true');
      trigger.classList.add('is-open');
    }
    function closeDropdown() {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.classList.remove('is-open');
    }
    function toggleDropdown() {
      trigger.classList.contains('is-open') ? closeDropdown() : openDropdown();
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    // Sélection d'une option
    panel.addEventListener('click', (e) => {
      const item = e.target.closest('.sort-dropdown-option');
      if (!item) return;
      const val = item.dataset.value;
      currentSortOrder = val;
      const chosen = sortOptions.find(o => o.value === val);
      // Met à jour l'affichage du trigger
      valEl.textContent = getLabel(chosen);
      iconEl.textContent = chosen.icon;
      trigger.setAttribute('aria-label', getLabel(chosen));
      // Mettre à jour l'état is-selected
      panel.querySelectorAll('.sort-dropdown-option').forEach(li => {
        const isChosen = li.dataset.value === val;
        li.classList.toggle('is-selected', isChosen);
        li.setAttribute('aria-selected', isChosen);
        li.querySelector('.sdo-check')?.remove();
        if (isChosen) {
          const check = document.createElement('span');
          check.className = 'sdo-check';
          check.textContent = '✓';
          li.appendChild(check);
        }
      });
      closeDropdown();
      generateGameCards();
    });

    // Navigation clavier
    trigger.addEventListener('keydown', (e) => {
      const items = [...panel.querySelectorAll('.sort-dropdown-option')];
      const idx = items.findIndex(li => li.classList.contains('is-selected'));
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDropdown(); }
      if (e.key === 'Escape') closeDropdown();
      if (e.key === 'ArrowDown') { e.preventDefault(); openDropdown(); items[(idx + 1) % items.length]?.focus(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); openDropdown(); items[(idx - 1 + items.length) % items.length]?.focus(); }
    });
  }

  // Fermer si clic en dehors
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('sortCustomDropdown');
    if (dd && !dd.contains(e.target)) {
      dd.setAttribute('aria-expanded', 'false');
      dd.classList.remove('is-open');
    }
  });

  // Rebuild le dropdown si la langue change (refreshTexts est appelé par setLang)
  const _origRefreshTexts = window.refreshTexts;
  window.refreshTexts = function(...args) {
    if (_origRefreshTexts) _origRefreshTexts.apply(this, args);
    buildDropdown();
  };

  buildDropdown();
}


function sortGamesList(entriesList) {
  if (currentSortOrder === 'default') return entriesList;

  const history = JSON.parse(localStorage.getItem("gameHistory") || "{}");
  const gameRatings = JSON.parse(localStorage.getItem("gameRatings") || "{}");

  // Calculer la moyenne réelle d'un jeu depuis les données communautaires
  const getAvgRating = (gameId, game) => {
    const data = gameRatings[gameId];
    if (data && data.count > 0) return data.total / data.count;
    // Fallback : champ statique du JSON
    return parseFloat(game.rating) || 0;
  };

  return [...entriesList].sort(([idA, gameA], [idB, gameB]) => {
    if (currentSortOrder === 'rating') {
      return getAvgRating(idB, gameB) - getAvgRating(idA, gameA);
    }
    if (currentSortOrder === 'popular') {
      const pA = history[idA]?.playCount || 0;
      const pB = history[idB]?.playCount || 0;
      return pB - pA;
    }
    if (currentSortOrder === 'new') {
      const isNewA = gameA.badge === 'new' ? 1 : 0;
      const isNewB = gameB.badge === 'new' ? 1 : 0;
      return isNewB - isNewA;
    }
    return 0;
  });
}

// ─── JEU VEDETTE DU JOUR (DAILY BOOST) ────────────────────────────────────────
function initDailyBoostGame() {
  const boostCard = document.getElementById("dailyBoostCard");
  if (!boostCard) return;

  const gameIds = Object.keys(games);
  if (gameIds.length === 0) return;

  // Calcul déterministe basé sur le jour actuel
  const todayStr = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < todayStr.length; i++) {
    hash = (hash * 31 + todayStr.charCodeAt(i)) & 0xffffffff;
  }
  const chosenIndex = Math.abs(hash) % gameIds.length;
  const featuredId = gameIds[chosenIndex];
  const featuredGame = games[featuredId];

  const thumbEl = document.getElementById("boostThumb");
  const titleEl = document.getElementById("boostGameTitle");
  const playBtn = document.getElementById("boostPlayBtn");

  if (thumbEl) {
    thumbEl.innerHTML = `<img src="assets/logos/${featuredId}.webp" alt="${featuredGame.name}" width="54" height="54" />`;
  }
  if (titleEl) {
    titleEl.textContent = `${featuredGame.emoji} ${t("menu.games." + featuredId + ".name")}`;
  }

  const claimKey = `mg_daily_boost_${todayStr}`;
  const alreadyClaimed = localStorage.getItem(claimKey) === 'true';

  const rewardEl = boostCard.querySelector('.boost-reward');
  if (rewardEl && alreadyClaimed) {
    rewardEl.textContent = "✓ Boost validé aujourd'hui";
    rewardEl.style.opacity = "0.7";
  }

  if (playBtn) {
    playBtn.addEventListener("click", () => {
      if (!alreadyClaimed) {
        addXP(50);
        localStorage.setItem(claimKey, 'true');
        if (playGameSound) playGameSound('gq_sound_success');
      }
      launchGame(featuredId);
    });
  }

  boostCard.classList.remove("hidden");
}

// ─── RÉCEMMENT JOUÉS (TOP 3) ──────────────────────────────────────────────────
function renderRecentGames() {
  const container = document.getElementById("recentGamesWrapper");
  const listEl = document.getElementById("recentGamesList");
  if (!container || !listEl) return;

  const history = JSON.parse(localStorage.getItem("gameHistory") || "{}");
  const sorted = Object.entries(history)
    .filter(([id]) => games[id])
    .sort((a, b) => new Date(b[1].lastPlayed || 0) - new Date(a[1].lastPlayed || 0))
    .slice(0, 3);

  if (sorted.length === 0) {
    container.classList.add("hidden");
    return;
  }

  listEl.innerHTML = sorted.map(([id]) => {
    const game = games[id];
    return `
      <div class="recent-game-chip" data-game="${id}" title="${game.emoji} ${t("menu.games." + id + ".name")}">
        <img src="assets/logos/${id}.webp" alt="${game.name}" loading="lazy" width="32" height="32" />
        <div class="recent-game-info">
          <span class="recent-game-name">${game.emoji} ${t("menu.games." + id + ".name")}</span>
          <span class="recent-game-action">▶ ${t("menu.recent_games_resume")}</span>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.recent-game-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const gId = chip.dataset.game;
      if (gId) launchGame(gId);
    });
  });

  container.classList.remove("hidden");
}

// ─── MODALE ROULETTE ARCADE ───────────────────────────────────────────────────
function initArcadeRoulette() {
  const randomBtn = document.querySelector(".btn-random");
  const modal = document.getElementById("arcadeRouletteModal");
  const wheel = document.getElementById("rouletteWheel");
  const closeBtn = document.getElementById("rouletteCloseBtn");
  const backdrop = document.getElementById("rouletteBackdrop");
  const winnerCard = document.getElementById("rouletteWinnerCard");
  const playBtn = document.getElementById("roulettePlayBtn");
  const respinBtn = document.getElementById("rouletteRespinBtn");

  if (!modal || !wheel) return;

  const closeModal = () => {
    modal.classList.add("hidden");
  };

  closeBtn?.addEventListener("click", closeModal);
  backdrop?.addEventListener("click", closeModal);

  let isSpinning = false;
  let chosenGameId = null;

  const startSpin = () => {
    if (isSpinning) return;
    isSpinning = true;
    reportRandomUsed();

    winnerCard.classList.add("hidden");
    playBtn.classList.add("hidden");
    respinBtn.classList.add("hidden");

    const gameIds = Object.keys(games);
    if (gameIds.length === 0) return;

    // Construire 35 items
    const itemCount = 35;
    const targetIndex = 28;
    chosenGameId = gameIds[Math.floor(Math.random() * gameIds.length)];

    let itemsHtml = '';
    for (let i = 0; i < itemCount; i++) {
      const gId = (i === targetIndex) ? chosenGameId : gameIds[Math.floor(Math.random() * gameIds.length)];
      const g = games[gId];
      itemsHtml += `
        <div class="roulette-item" data-index="${i}">
          <img src="assets/logos/${gId}.webp" alt="${g.name}" />
          <span>${g.emoji} ${t("menu.games." + gId + ".name")}</span>
        </div>
      `;
    }
    wheel.innerHTML = itemsHtml;

    // Reset position
    wheel.style.transition = 'none';
    wheel.style.transform = 'translateX(0px)';
    void wheel.offsetWidth; // Forcer reflow

    const itemWidth = 100;
    const offset = -(targetIndex * itemWidth) - (itemWidth / 2);

    modal.classList.remove("hidden");

    setTimeout(() => {
      wheel.style.transition = 'transform 3.2s cubic-bezier(0.12, 0.8, 0.2, 1)';
      wheel.style.transform = `translateX(${offset}px)`;
      if (playGameSound) playGameSound('gq_ui_click');
    }, 50);

    setTimeout(() => {
      isSpinning = false;
      const chosenGame = games[chosenGameId];

      const thumb = document.getElementById("winnerThumb");
      const name = document.getElementById("winnerName");
      const desc = document.getElementById("winnerDesc");

      if (thumb) thumb.innerHTML = `<img src="assets/logos/${chosenGameId}.webp" alt="${chosenGame.name}" />`;
      if (name) name.textContent = `${chosenGame.emoji} ${t("menu.games." + chosenGameId + ".name")}`;
      if (desc) desc.textContent = t("menu.games." + chosenGameId + ".description");

      winnerCard.classList.remove("hidden");
      playBtn.classList.remove("hidden");
      respinBtn.classList.remove("hidden");

      if (playGameSound) playGameSound('menu_hover');
      if (navigator.vibrate) navigator.vibrate([40, 60, 80]);
    }, 3400);
  };

  if (randomBtn) {
    randomBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startSpin();
    });
  }

  playBtn?.addEventListener("click", () => {
    if (chosenGameId) {
      closeModal();
      launchGame(chosenGameId);
    }
  });

  respinBtn?.addEventListener("click", () => {
    startSpin();
  });
}

// ─── FILTRES PAR CATÉGORIE AVEC COMPTEURS ──────────────────────────────────────
function initCategoryFilters() {
  const searchControls = document.querySelector('.search-controls-wrapper') || document.querySelector('.search-bar');
  if (!searchControls) return;

  let filterContainer = document.querySelector('.category-filters');
  if (!filterContainer) {
    filterContainer = document.createElement('div');
    filterContainer.className = 'category-filters';
    filterContainer.style.display = 'flex';
    filterContainer.style.flexWrap = 'wrap';
    filterContainer.style.gap = '10px';
    filterContainer.style.justifyContent = 'center';
    filterContainer.style.marginBottom = '30px';
    searchControls.insertAdjacentElement('afterend', filterContainer);
  }

  filterContainer.innerHTML = '';

  const createFilterButton = (labelTxt, count, value) => {
    const label = document.createElement('label');
    label.className = 'cat-filter-label';
    label.style.cursor = 'pointer';
    label.style.padding = '8px 16px';
    label.style.borderRadius = '20px';
    label.style.background = value === currentFilter ? 'var(--primary, #667eea)' : 'rgba(255, 255, 255, 0.1)';
    label.style.color = '#fff';
    label.style.fontWeight = 'bold';
    label.style.border = value === currentFilter ? '2px solid rgba(255, 255, 255, 0.5)' : '2px solid transparent';
    label.style.transition = 'all 0.3s';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'catFilter';
    radio.value = value;
    radio.checked = (value === currentFilter);
    radio.style.display = 'none';

    radio.addEventListener('change', (e) => {
      currentFilter = e.target.value;
      document.querySelectorAll('.cat-filter-label').forEach(lbl => {
        lbl.style.background = 'rgba(255, 255, 255, 0.1)';
        lbl.style.border = '2px solid transparent';
      });
      label.style.background = 'var(--primary, #667eea)';
      label.style.border = '2px solid rgba(255, 255, 255, 0.5)';
      generateGameCards();
    });

    label.appendChild(radio);
    const displayText = count !== null ? `${labelTxt} (${count})` : labelTxt;
    label.appendChild(document.createTextNode(displayText));
    filterContainer.appendChild(label);
  };

  const totalCount = Object.keys(games).length;
  createFilterButton(t('menu.all'), totalCount, 'Tout');

  const likedCount = getLikedGames().filter(id => games[id]).length;
  if (likedCount > 0) {
    createFilterButton(t('menu.favorites'), likedCount, 'Favoris');
  }

  for (const [catName, catGames] of Object.entries(categoriesData)) {
    const count = Object.keys(catGames).length;
    createFilterButton(t('menu.categories.' + catName), count, catName);
  }
}

// Générer les cartes de jeux dynamiquement
function generateGameCards() {
  const gamesGrid = document.querySelector("#mainGamesGrid");
  if (!gamesGrid) return;

  const existingElements = document.querySelectorAll(
    "#mainGamesGrid .game-card, #mainGamesGrid .category-header"
  );
  existingElements.forEach((el) => el.remove());

  const likedList = getLikedGames();

  const addCardToGrid = (card) => {
    gamesGrid.appendChild(card);
  };

  const addHeader = (title) => {
    const headerHTML = `
    <div class="category-header"
      style="grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; margin: 20px auto 20px; width: 100%; gap: 20px;">
      <div
        style="flex-grow: 1; height: 2px; border-radius: 2px; background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.4) 70%, rgba(255, 255, 255, 0.8)); opacity: 0.7; box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);">
      </div>
      <span
        style="color: #fff; font-size: 1.4em; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; text-shadow: 0 0 15px rgba(255, 255, 255, 0.4); white-space: nowrap;">${title}</span>
      <div
        style="flex-grow: 1; height: 2px; border-radius: 2px; background: linear-gradient(to left, transparent, rgba(255, 255, 255, 0.4) 70%, rgba(255, 255, 255, 0.8)); opacity: 0.7; box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);">
      </div>
    </div>`;

    gamesGrid.insertAdjacentHTML('beforeend', headerHTML);
  };

  const addSpacer = () => {
    const spacer = document.createElement('div');
    spacer.className = 'game-card hidden-spacer';
    spacer.style.visibility = 'hidden';
    spacer.style.pointerEvents = 'none';
    gamesGrid.appendChild(spacer);
  };

  // Liste plate des éléments à rendre
  const allItems = [];

  // Favoris
  if (currentFilter === 'Tout' || currentFilter === 'Favoris') {
    const myLikedGames = likedList.filter(id => games[id]);
    if (myLikedGames.length > 0) {
      allItems.push({ type: 'header', title: t('menu.favorites') });
      let count = 0;
      const sortedFavorites = sortGamesList(myLikedGames.map(id => [id, games[id]]));
      sortedFavorites.forEach(([gameId, gameData]) => {
        allItems.push({ type: 'card', id: gameId, data: gameData });
        count++;
      });
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (!isMobile && count % 2 !== 0 && currentFilter === 'Tout') allItems.push({ type: 'spacer' });
    }
  }

  // Catégories — si tri actif : on fusionne tout en une liste globale triée
  if (currentFilter !== 'Favoris') {
    if (currentSortOrder !== 'default') {
      // Rassembler tous les jeux des catégories concernées en une liste plate
      const allGameEntries = [];
      for (const [catName, catGames] of Object.entries(categoriesData)) {
        if (currentFilter !== 'Tout' && currentFilter !== catName) continue;
        for (const [gameId, game] of Object.entries(catGames)) {
          allGameEntries.push([gameId, game]);
        }
      }
      // Trier globalement
      const globalSorted = sortGamesList(allGameEntries);
      globalSorted.forEach(([gameId, game]) => {
        allItems.push({ type: 'card', id: gameId, data: game });
      });
    } else {
      // Tri par défaut : affichage par catégorie avec headers
      for (const [catName, catGames] of Object.entries(categoriesData)) {
        if (currentFilter !== 'Tout' && currentFilter !== catName) continue;

        allItems.push({ type: 'header', title: t('menu.categories.' + catName) || catName });
        let count = 0;
        Object.entries(catGames).forEach(([gameId, game]) => {
          allItems.push({ type: 'card', id: gameId, data: game });
          count++;
        });
        const isMobile = window.matchMedia("(max-width: 768px)").matches;
        if (!isMobile && count % 2 !== 0 && currentFilter === 'Tout') allItems.push({ type: 'spacer' });
      }
    }
  }

  // Rendu progressif pour le TBT, mais on rend les 6 premiers immédiatement pour le CLS
  let currentIndex = 0;
  const initialBurst = 6;
  const firstBatch = Math.min(initialBurst, allItems.length);

  for (let i = 0; i < firstBatch; i++) {
    const item = allItems[currentIndex];
    if (item.type === 'header') addHeader(item.title);
    else if (item.type === 'card') addCardToGrid(createGameCard(item.id, item.data, true)); // Priority for LCP
    else if (item.type === 'spacer') addSpacer();
    currentIndex++;
  }

  const renderNextChunk = () => {
    const chunkSize = 4;
    const end = Math.min(currentIndex + chunkSize, allItems.length);

    for (let i = currentIndex; i < end; i++) {
      const item = allItems[currentIndex];
      if (item.type === 'header') addHeader(item.title);
      else if (item.type === 'card') addCardToGrid(createGameCard(item.id, item.data));
      else if (item.type === 'spacer') addSpacer();
      currentIndex++;
    }

    if (currentIndex < allItems.length) {
      if (window.requestIdleCallback) requestIdleCallback(renderNextChunk);
      else setTimeout(renderNextChunk, 16);
    } else {
      finalizeGrid();
    }
  };

  const finalizeGrid = () => {
    localStorage.setItem("gamesAvailableCount", Object.keys(games).length);
    const gamesNumberEl = document.getElementById("gamesNumber");
    if (gamesNumberEl) gamesNumberEl.innerText = Object.keys(games).length;
    initGameCards();
    initRatingSystem().catch(() => { });
    filterGames();
  };

  if (currentIndex < allItems.length) {
    renderNextChunk();
  } else {
    finalizeGrid();
  }
}

// Accessibilité Globale : Observer TOUTES les iframes (AdSense, Monetag, etc.)
const fixIframes = () => {
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    if (!iframe.title) iframe.title = "Publicité";
  });
};

const globalIframeObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === 'IFRAME') {
          node.title = "Publicité";
        } else if (node.querySelectorAll) {
          const iframes = node.querySelectorAll('iframe');
          iframes.forEach(iframe => {
            iframe.title = "Publicité";
          });
        }
      });
    }
  });
});

globalIframeObserver.observe(document.body, { childList: true, subtree: true });
// Sécurité supplémentaire : un check toutes les 2s pour les iframes injectées de façon exotique
setInterval(fixIframes, 2000);
fixIframes();

// Créer une carte de jeu avec la structure HTML exacte
function createGameCard(gameId, game, isPriority = false) {
  // Créer l'élément principal de la carte
  const card = document.createElement("div");
  card.className = "game-card";
  card.dataset.game = gameId;
  card.dataset.category = t("menu.categories." + game.category).toLowerCase();
  card.dataset.badge = t("menu.badges." + game.badge).toLowerCase();
  card.dataset.tags = game.tags
    .map(tag => t("menu.tags." + tag).toLowerCase())
    .join(" ");

  // Déterminer la couleur du bouton play en fonction du badge
  let playButtonColor = "#667eea"; // Défaut pour "new"
  if (game.badge === "classic") {
    playButtonColor = "#f093fb";
  }

  const isLiked = getLikedGames().includes(gameId);

  // Badges contextuels dynamiques (Multijoueur, 3D, Stratégie...)
  const contextBadges = [];
  if (game.tags && game.tags.includes('multiplayer')) {
    contextBadges.push(`<span class="badge-context multiplayer">👥 2J</span>`);
  }
  if (gameId === 'maze' || (game.tags && game.tags.some(tg => tg.includes('3d')))) {
    contextBadges.push(`<span class="badge-context is-3d">🌀 3D</span>`);
  }
  if (gameId === 'race-manager') {
    contextBadges.push(`<span class="badge-context">🏎️ F1</span>`);
  }
  const contextBadgesHtml = contextBadges.length > 0
    ? `<div class="card-context-badges">${contextBadges.join('')}</div>`
    : '';

  // Construire le HTML de la carte
  card.innerHTML = `
    <div class="card-header">
      <span class="badge badge-${game.badge}">${t("menu.badges." + game.badge)}</span>
    </div>
    ${contextBadgesHtml}
    <div class="card-image">
      <img src="assets/logos/${gameId}.webp" 
           alt="${t("menu.games." + gameId + ".name")}" 
           ${isPriority ? 'fetchpriority="high"' : 'loading="lazy"'} 
           width="130" height="130" />
      <div class="card-overlay">
        <div class="play-button">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="white" />
            <path d="M18 14L34 24L18 34V14Z" fill="${playButtonColor}" />
          </svg>
        </div>
      </div>
    </div>
    <div class="card-content">
      <div class="card-title-row">
        <h3 class="card-title">${game.emoji} ${t("menu.games." + gameId + ".name")}</h3>
        <button class="heart-btn ${isLiked ? 'liked' : ''}" title="${t('menu.favorites')}">
          <svg viewBox="0 0 24 24">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>
      </div>
      <p class="card-description">${t("menu.games." + gameId + ".description")}</p>
      <div class="card-tags">
        ${game.tags.map((tag) => `<span class="tag">${t("menu.tags." + tag)}</span>`).join("")}
      </div>
    </div>
    <div class="card-footer">
      <div class="rating">
        <span class="stars">${game.stars}</span>
        <span class="rating-text">${game.rating}</span>
      </div>
      <button class="btn-play">${t('menu.play')}</button>
    </div>
  `;

  return card;
}

// Initialiser les éléments interactifs des cartes
function initGameCards() {
  const gameCards = document.querySelectorAll(".game-card:not(.random-game)");

  gameCards.forEach((card) => {
    const gameId = card.dataset.game;

    // 1. Clic sur l'overlay (l'image et le bouton play central)
    const overlay = card.querySelector(".card-overlay");
    if (overlay) {
      overlay.style.cursor = "pointer";
      overlay.addEventListener("click", () => {
        launchGame(gameId);
      });
    }

    // 2. Clic sur le bouton jouer en bas
    const playBtn = card.querySelector(".btn-play");
    if (playBtn) {
      playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        launchGame(gameId);
      });
    }

    // 3. Clic sur le coeur (Like)
    const heartBtn = card.querySelector(".heart-btn");
    if (heartBtn) {
      heartBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const liked = toggleLikeGame(gameId);
        heartBtn.classList.toggle("liked", liked);
        // On met à jour les filtres (par ex. pour afficher "Favoris" si 1er favori)
        initCategoryFilters();
        checkAndUnlockBadges();
      });
    }

    // Garder l'animation/son au survol de la carte entière (optionnel)
    card.addEventListener("mouseenter", () => {
      playHoverSound();
    });
  });
}

// Lancer un jeu
function launchGame(gameId) {
  // Vérifier si on doit afficher une pub (Smart Link) avant de lancer
  if (handleSmartLink(gameId)) return;

  const game = games[gameId];

  if (!game) {
    console.error(`Jeu "${gameId}" non trouvé`);
    return;
  }

  // Effet de transition
  document.body.style.opacity = "0";
  document.body.style.transition = "opacity 0.3s ease-out";

  // Redirection après l'animation
  setTimeout(() => {
    window.location.href = game.path;
  }, 300);

  // Sauvegarder dans localStorage pour tracking
  saveGameLaunch(gameId);
  updateStreak();
  reportGamePlayed(gameId);

  // Notification Discord
  notifyGameLaunch(gameId, game.name);
}

// Sauvegarder l'historique de jeu
function saveGameLaunch(gameId) {
  const history = JSON.parse(localStorage.getItem("gameHistory") || "{}");

  if (!history[gameId]) {
    history[gameId] = {
      firstPlayed: new Date().toISOString(),
      playCount: 0,
    };
  }

  history[gameId].playCount++;
  history[gameId].lastPlayed = new Date().toISOString();

  localStorage.setItem("gameHistory", JSON.stringify(history));
  renderRecentGames();
}

// Animations au scroll
function addScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = "1";
          entry.target.style.transform = "translateY(0)";
        }
      });
    },
    {
      threshold: 0.1,
    },
  );

  document.querySelectorAll(".game-card").forEach((card) => {
    observer.observe(card);
  });
}

// Son au survol (utilisant le moteur central)
function playHoverSound() {
  playGameSound('menu_hover');
}

// Statistiques de jeu (à afficher si souhaité)
function getGamesStats() {
  const history = JSON.parse(localStorage.getItem("gameHistory") || "{}");

  return {
    totalGames: Object.keys(history).length,
    totalPlays: Object.values(history).reduce(
      (sum, game) => sum + game.playCount,
      0,
    ),
    mostPlayed:
      Object.entries(history).sort(
        (a, b) => b[1].playCount - a[1].playCount,
      )[0]?.[0] || null,
  };
}

// Barre de recherche
function filterGames() {
  const query = document
    .getElementById("searchInput")
    .value.toLowerCase()
    .trim();

  const isMobile = window.matchMedia("(max-aspect-ratio: 1/1)").matches;
  const gamesGrid = document.querySelector("#mainGamesGrid");
  if (!gamesGrid) return;

  let currentHeader = null;
  let currentCategoryHasVisibleCards = false;
  let totalVisibleCards = 0;

  Array.from(gamesGrid.children).forEach((el) => {
    if (el.classList.contains('category-header')) {
      if (currentHeader) {
        currentHeader.style.display = currentCategoryHasVisibleCards ? 'flex' : 'none';
      }
      currentHeader = el;
      currentCategoryHasVisibleCards = false;
    } else if (el.classList.contains('game-card') && !el.classList.contains('random-game') && !el.classList.contains('hidden-spacer')) {
      const card = el;
      const title = card.querySelector(".card-title")?.textContent.toLowerCase() || "";
      const desc = card.querySelector(".card-description")?.textContent.toLowerCase() || "";
      const tags = card.dataset.tags || "";
      const cat = card.dataset.category || "";
      const badge = card.dataset.badge || "";

      const match = query === "" || title.includes(query) || desc.includes(query) || tags.includes(query) || cat.includes(query) || badge.includes(query);

      if (match) {
        card.classList.remove("is-hidden", "is-hidden-desktop");
        card.style.removeProperty("display");
        currentCategoryHasVisibleCards = true;
        totalVisibleCards++;
      } else {
        card.classList.add("is-hidden", "is-hidden-desktop");
        card.style.setProperty("display", "none", "important");
      }
    } else if (el.classList.contains('hidden-spacer')) {
      el.style.display = (query === "") ? '' : 'none';
    }
  });

  if (currentHeader) {
    currentHeader.style.display = currentCategoryHasVisibleCards ? 'flex' : 'none';
  }

  // Gestion de l'Empty State
  const emptyState = document.getElementById("searchEmptyState");
  if (emptyState) {
    if (totalVisibleCards === 0) {
      emptyState.classList.remove("hidden");
    } else {
      emptyState.classList.add("hidden");
    }
  }
}

async function displayAppVersion() {
  try {
    const res = await fetch('./assets/data/versions.json');
    if (!res.ok) throw new Error("Impossible de charger versions.json");
    const manifest = await res.json();
    const version = manifest.currentVersion || "1.0.0";
    const el = document.getElementById('app-version');
    if (el) el.textContent = version;
  } catch (e) {
    console.warn("Impossible d'afficher la version :", e);
  }
}

/*============================
== REFRESH DU STATUS ET BMC ==
============================*/
let _dailyChallengeInited = false;

async function refreshStatus() {
  const isOnline = await checkRealConnection();
  const statusBadge = document.querySelector(".status-badge");
  const statusText = document.getElementById("status-text");

  if (isOnline) {
    console.log("🌐 Passage en ligne");
    showBMC();

    // Import dynamique Rating
    import("./rating-system.js").then(m => m.initRatingSystem()).catch(() => { });

    if (statusBadge && statusText) {
      statusBadge.style.backgroundColor = "rgba(81, 207, 102, 0.95)";
      statusBadge.style.boxShadow = "0 0 10px rgba(81, 207, 102, 0.95)";
      statusText.innerText = t('menu.online');
    }
  } else {
    console.log("📡 Passage hors ligne");
    hideBMC();

    if (statusBadge && statusText) {
      statusBadge.style.backgroundColor = "rgba(207, 81, 102, 0.95)";
      statusBadge.style.boxShadow = "0 0 10px rgba(207, 81, 102, 0.95)";
      statusText.innerText = t('menu.offline');
    }
  }

  // Toujours initialiser le bouton défi (gère lui-même le offline)
  if (!_dailyChallengeInited) {
    _dailyChallengeInited = true;
    initDailyChallenge();
  }
}

// Écouteurs d'événements système
window.addEventListener('online', refreshStatus);
window.addEventListener('offline', refreshStatus);
window.addEventListener('load', refreshStatus);
document.addEventListener("input", (e) => {
  if (e.target.id === "searchInput") {
    const query = e.target.value.trim();
    if (query !== "" && currentFilter !== 'Tout') {
      currentFilter = 'Tout';
      // Mettre à jour l'UI des boutons
      document.querySelectorAll('.cat-filter-label').forEach(lbl => {
        lbl.style.background = 'rgba(255, 255, 255, 0.1)';
        lbl.style.border = '2px solid transparent';
      });
      const toutLabel = Array.from(document.querySelectorAll('.cat-filter-label')).find(lbl => lbl.textContent.includes('Tout'));
      if (toutLabel) {
        toutLabel.style.background = 'var(--primary, #667eea)';
        toutLabel.style.border = '2px solid rgba(255, 255, 255, 0.5)';
        const radio = toutLabel.querySelector('input');
        if (radio) radio.checked = true;
      }
      generateGameCards(); // Va rappeler filterGames() à la fin
    } else {
      filterGames();
    }
  }
});

/*============================
== GESTION AUDIO MENU ==
============================*/
// Initialisation de la musique au premier clic
let musicStarted = false;
const startInitialMusic = () => {
  if (!musicStarted) {
    musicStarted = true;
    startMenuMusic();
    // Optionnel : masquer les avertissements AudioContext
    document.removeEventListener('mousedown', startInitialMusic);
    document.removeEventListener('keydown', startInitialMusic);
    document.removeEventListener('touchstart', startInitialMusic);
  }
};
document.addEventListener('mousedown', startInitialMusic);
document.addEventListener('keydown', startInitialMusic);
document.addEventListener('touchstart', startInitialMusic);

// Gestion du bouton flottant (visibilité temporaire et extension)
const floatingContainer = document.getElementById('floating-menu-settings');
const musicBtn = document.getElementById('mainMusicToggle');
const soundBtn = document.getElementById('mainSoundToggle');
let visibilityTimeout = null;

const showFloatingBtn = () => {
  if (!floatingContainer) return;
  floatingContainer.classList.remove('hidden');

  if (visibilityTimeout) clearTimeout(visibilityTimeout);
  visibilityTimeout = setTimeout(() => {
    floatingContainer.classList.add('hidden');
  }, 10000); // 10 secondes
};

// Événements d'activité
document.addEventListener('mousemove', showFloatingBtn);
document.addEventListener('mousedown', showFloatingBtn);
document.addEventListener('keydown', showFloatingBtn);
document.addEventListener('touchstart', showFloatingBtn);

// Logique d'extension au survol et couleurs du bouton param
if (floatingContainer) {
  const iconCog = musicBtn.querySelector('.icon-cog');
  const iconMusic = musicBtn.querySelector('.icon-music');

  const updateParamBtnState = () => {
    if (!musicBtn) return;
    const isHovered = floatingContainer.matches(':hover');
    if (isHovered) {
      musicBtn.classList.toggle('active', getMusicEnabled());
    } else {
      musicBtn.classList.toggle('active', getMusicEnabled() || getSoundEnabled());
    }
  };

  floatingContainer.addEventListener('mouseenter', () => {
    if (iconCog) iconCog.style.display = 'none';
    if (iconMusic) iconMusic.style.display = 'flex';
    updateParamBtnState();
  });

  floatingContainer.addEventListener('mouseleave', () => {
    if (iconCog) iconCog.style.display = 'flex';
    if (iconMusic) iconMusic.style.display = 'none';
    updateParamBtnState();
  });

  // État initial
  updateParamBtnState();

  // Toggle musique
  if (musicBtn) {
    musicBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenuMusic();
      updateParamBtnState();
    });
  }

  // Toggle son
  if (soundBtn) {
    soundBtn.classList.toggle('active', getSoundEnabled());
    soundBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const enabled = toggleSound();
      soundBtn.classList.toggle('active', enabled);
      updateParamBtnState();
    });
  }
}

// ─── WEBHOOKS NAVIGATION ──────────────────────────────────────────────────────
// Notification : arrivée sur la page d'accueil
notifyBackToHome();

// Notification : clic sur le lien "À propos"
document.querySelectorAll('a[href*="about.html"]').forEach(link => {
  link.addEventListener('click', () => {
    notifyAboutVisit();
  });
});

// Export pour utilisation dans d'autres fichiers
export { launchGame, saveGameLaunch, getGamesStats };

// ─── GESTION DES FAVORIS (LIKES) ──────────────────────────────────────────────
function getLikedGames() {
  try {
    return JSON.parse(localStorage.getItem("likedGames") || "[]");
  } catch (e) {
    return [];
  }
}

function toggleLikeGame(gameId) {
  let liked = getLikedGames();
  const idx = liked.indexOf(gameId);
  let isNowLiked = false;

  if (idx > -1) {
    liked.splice(idx, 1);
    isNowLiked = false;
  } else {
    liked.push(gameId);
    isNowLiked = true;
    if (playGameSound) playGameSound('gq_ui_click'); // Petit son de feedback
  }

  localStorage.setItem("likedGames", JSON.stringify(liked));
  return isNowLiked;
}

// ─── SWIPE HORIZONTAL (MOBILE) ──────────────────────────────────────────────────
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  const touchEndX = e.changedTouches[0].screenX;
  const touchEndY = e.changedTouches[0].screenY;

  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;

  // Si le balayage est horizontal et suffisamment long (swipe)
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 60) {
    const isMobile = window.matchMedia("(max-width: 768px)").matches || window.matchMedia("(max-aspect-ratio: 1/1)").matches;
    if (!isMobile) return;

    // Ne pas swiper si une recherche est en cours, car cela casserait le filtre global de la recherche
    const searchInput = document.getElementById("searchInput");
    if (searchInput && searchInput.value.trim() !== "") return;

    // Récupérer la liste des catégories actuellement disponibles via les filtres générés
    const filterLabels = Array.from(document.querySelectorAll('.cat-filter-label input')).map(input => input.value);
    if (filterLabels.length === 0) return;

    let currentIndex = filterLabels.indexOf(currentFilter);
    if (currentIndex === -1) currentIndex = 0;

    let newIndex = currentIndex;
    let animationDirection = '';

    if (deltaX > 0) {
      // Swipe vers la droite -> Catégorie précédente
      newIndex = currentIndex - 1;
      if (newIndex < 0) newIndex = filterLabels.length - 1;
      animationDirection = 'right';
    } else {
      // Swipe vers la gauche -> Catégorie suivante
      newIndex = currentIndex + 1;
      if (newIndex >= filterLabels.length) newIndex = 0;
      animationDirection = 'left';
    }

    const newFilter = filterLabels[newIndex];
    changeCategoryWithAnim(newFilter, animationDirection);
  }
});

function changeCategoryWithAnim(newFilter, direction) {
  currentFilter = newFilter;

  // Mise à jour visuelle des labels (même s'ils sont cachés sur mobile, ça garde l'état propre)
  document.querySelectorAll('.cat-filter-label').forEach(lbl => {
    lbl.style.background = 'rgba(255, 255, 255, 0.1)';
    lbl.style.border = '2px solid transparent';
    const radio = lbl.querySelector('input');
    if (radio && radio.value === currentFilter) {
      lbl.style.background = 'var(--primary, #667eea)';
      lbl.style.border = '2px solid rgba(255, 255, 255, 0.5)';
      radio.checked = true;
    }
  });

  const grid = document.querySelector("#mainGamesGrid");
  if (!grid) return;

  // Animation de sortie courte
  grid.style.transition = 'all 0.2s ease-out';
  grid.style.opacity = '0';
  grid.style.transform = direction === 'left' ? 'translateX(-30px)' : 'translateX(30px)';

  setTimeout(() => {
    // Régénérer les cartes
    generateGameCards();

    // Préparation pour l'entrée
    grid.style.transition = 'none';
    grid.style.transform = direction === 'left' ? 'translateX(30px)' : 'translateX(-30px)';

    // Forcer le reflow du DOM pour appliquer le point de départ
    void grid.offsetWidth;

    // Animation d'entrée douce
    grid.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    grid.style.opacity = '1';
    grid.style.transform = 'translateX(0)';
  }, 200);
}

window.addEventListener("pageshow", (event) => {
  // La page a été restaurée par le bouton Retour/Avancer
  if (event.persisted) {
    document.body.style.opacity = "1";
    document.body.style.transition = "";
  }
});