//import { initRatingSystem } from "./rating-system.js";
import { checkRealConnection } from './network.js';
import { showBMC, hideBMC } from './BuyMeACoffee.js';
import {
  playGameSound,
  startMenuMusic,
  stopMenuMusic,
  toggleMenuMusic,
  toggleSound,
  getMusicEnabled,
  getSoundEnabled
} from './utils/audio.js';


var games = {};
let categoriesData = {};
let currentFilter = 'Tout';

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

    initCategoryFilters();
    generateGameCards();

    // On lance la vérification initiale
    await refreshStatus();
  })
  .catch((err) => {
    console.error(err);
  });

// Initialisation
document.addEventListener("DOMContentLoaded", async () => {
  initRandomGameButton();
  addScrollAnimations();
  displayAppVersion()
});

// Initialiser le bouton de jeu aléatoire
function initRandomGameButton() {
  const randomBtn = document.querySelector(".btn-random");
  if (!randomBtn) return;

  randomBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    const gameIds = Object.keys(games);
    if (gameIds.length === 0) return;

    const randomId = gameIds[Math.floor(Math.random() * gameIds.length)];

    // Petit effet visuel sur le bouton
    randomBtn.innerHTML = "🎲 Tirage...";
    randomBtn.style.background = "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)";

    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);

    setTimeout(() => {
      launchGame(randomId);
    }, 600);
  });
}

function initCategoryFilters() {
  const searchBar = document.querySelector('.search-bar');
  if (!searchBar) return;

  let filterContainer = document.querySelector('.category-filters');
  if (!filterContainer) {
    filterContainer = document.createElement('div');
    filterContainer.className = 'category-filters';
    filterContainer.style.display = 'flex';
    filterContainer.style.flexWrap = 'wrap';
    filterContainer.style.gap = '10px';
    filterContainer.style.justifyContent = 'center';
    filterContainer.style.marginBottom = '30px';
    searchBar.insertAdjacentElement('afterend', filterContainer);
  }

  filterContainer.innerHTML = '';

  const createFilterButton = (labelTxt, value) => {
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
    label.appendChild(document.createTextNode(labelTxt));
    filterContainer.appendChild(label);
  };

  createFilterButton('Tout', 'Tout');

  if (getLikedGames().length > 0) {
    createFilterButton('❤️ Favoris', 'Favoris');
  }

  for (const catName of Object.keys(categoriesData)) {
    createFilterButton(catName, catName);
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
    // Le grid-column: 1 / -1 est ajouté car ces headers existent à l'intérieur de mainGamesGrid.
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

  if (currentFilter === 'Tout' || currentFilter === 'Favoris') {
    const myLikedGames = likedList.filter(id => games[id]);
    if (myLikedGames.length > 0) {
      addHeader('❤️ Favoris');
      let count = 0;
      [...myLikedGames].reverse().forEach(gameId => {
        addCardToGrid(createGameCard(gameId, games[gameId]));
        count++;
      });
      if (count % 2 !== 0 && currentFilter === 'Tout') {
        addSpacer();
      }
    }
  }

  for (const [catName, catGames] of Object.entries(categoriesData)) {
    if (currentFilter !== 'Tout' && currentFilter !== catName) continue;
    if (currentFilter === 'Favoris') continue;

    addHeader(catName);

    let count = 0;
    Object.entries(catGames).forEach(([gameId, game]) => {
      addCardToGrid(createGameCard(gameId, game));
      count++;
    });

    if (count % 2 !== 0 && currentFilter === 'Tout') {
      addSpacer();
    }
  }

  localStorage.setItem("gamesAvailableCount", Object.keys(games).length);
  const gamesNumberEl = document.getElementById("gamesNumber");
  if (gamesNumberEl) gamesNumberEl.innerText = Object.keys(games).length;

  initGameCards();
  filterGames();
}

// Créer une carte de jeu avec la structure HTML exacte
function createGameCard(gameId, game) {
  // Créer l'élément principal de la carte
  const card = document.createElement("div");
  card.className = "game-card";
  card.dataset.game = gameId;
  card.dataset.category = (game.category || "").toLowerCase();
  card.dataset.badge = (game.badgeText || "").toLowerCase();
  card.dataset.tags = game.tags.join(" ").toLowerCase();

  // Déterminer la couleur du bouton play en fonction du badge
  let playButtonColor = "#667eea"; // Défaut pour "new"
  if (game.badge === "classic") {
    playButtonColor = "#f093fb";
  }

  const isLiked = getLikedGames().includes(gameId);

  // Construire le HTML de la carte
  card.innerHTML = `
    <div class="card-header">
      <span class="badge badge-${game.badge}">${game.badgeText}</span>
    </div>
    <div class="card-image">
      <img src="assets/logos/${gameId}.webp" alt="${game.name}" />
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
        <h3 class="card-title">${game.emoji} ${game.name}</h3>
        <button class="heart-btn ${isLiked ? 'liked' : ''}" title="Mettre en favori">
          <svg viewBox="0 0 24 24">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>
      </div>
      <p class="card-description">${game.description}</p>
      <div class="card-tags">
        ${game.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
      </div>
    </div>
    <div class="card-footer">
      <div class="rating">
        <span class="stars">${game.stars}</span>
        <span class="rating-text">${game.rating}</span>
      </div>
      <button class="btn-play">Jouer</button>
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

// Gestion du bouton retour dans les jeux (à ajouter dans les jeux)
export function setupBackButton() {
  const backBtn = document.createElement("button");
  backBtn.className = "back-to-menu";
  backBtn.innerHTML = "← Menu";
  backBtn.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    padding: 12px 24px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    z-index: 1000;
    transition: all 0.3s;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  `;

  backBtn.addEventListener("mouseenter", () => {
    backBtn.style.transform = "translateX(-5px)";
    backBtn.style.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.15)";
  });

  backBtn.addEventListener("mouseleave", () => {
    backBtn.style.transform = "translateX(0)";
    backBtn.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.1)";
  });

  backBtn.addEventListener("click", () => {
    document.body.style.opacity = "0";
    setTimeout(() => {
      window.location.href = "../../index.html";
    }, 300);
  });

  document.body.appendChild(backBtn);
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
        currentCategoryHasVisibleCards = true;
      } else {
        if (isMobile) {
          card.classList.add("is-hidden");
          card.classList.remove("is-hidden-desktop");
        } else {
          card.classList.add("is-hidden-desktop");
          card.classList.remove("is-hidden");
        }
      }
    } else if (el.classList.contains('hidden-spacer')) {
      el.style.display = (query === "") ? '' : 'none';
    }
  });

  if (currentHeader) {
    currentHeader.style.display = currentCategoryHasVisibleCards ? 'flex' : 'none';
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
      statusText.innerText = "En ligne";
    }
  } else {
    console.log("📡 Passage hors ligne");
    hideBMC();

    if (statusBadge && statusText) {
      statusBadge.style.backgroundColor = "rgba(207, 81, 102, 0.95)";
      statusBadge.style.boxShadow = "0 0 10px rgba(207, 81, 102, 0.95)";
      statusText.innerText = "Hors ligne";
    }
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
