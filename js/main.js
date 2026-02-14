//import { initRatingSystem } from "./rating-system.js";
import { checkRealConnection } from './network.js';
import { showBMC, hideBMC } from './BuyMeACoffee.js';


var games = {};

fetch("./assets/data/games.json")
  .then((res) => {
    if (!res.ok) throw new Error("Erreur chargement games.json");
    return res.json();
  })
  .then(async (data) => {
    games = data;
    generateGameCards();

    // On lance la vérification initiale
    await refreshStatus();
  })
  .catch((err) => {
    console.error(err);
  });

// Initialisation
document.addEventListener("DOMContentLoaded", () => {
  if (!localStorage.getItem("isAlreadyCounted")) {
    console.log("Nouvelle connexion");
    localStorage.setItem("isAlreadyCounted", true);
    localStorage.setItem("isNewPlayer", true);
  }

  initNotifyButtons();
  addScrollAnimations();
  displayAppVersion()
});

// Générer les cartes de jeux dynamiquement
function generateGameCards() {
  const gamesGrid = document.querySelector(".games-grid");
  if (!gamesGrid) return;

  // Supprimer toutes les cartes existantes sauf "Bientôt"
  const existingCards = document.querySelectorAll(
    ".game-card:not(.coming-soon)",
  );
  existingCards.forEach((card) => card.remove());

  // Créer une carte pour chaque jeu
  Object.entries(games).forEach(([gameId, game]) => {
    const gameCard = createGameCard(gameId, game);
    gamesGrid.insertBefore(
      gameCard,
      document.querySelector(".game-card.coming-soon"),
    );
  });

  // Mettre à jour le compteur de jeux
  localStorage.setItem("gamesAvailableCount", Object.keys(games).length);
  document.getElementById("gamesNumber").innerText = Object.keys(games).length;

  // Réinitialiser les événements des cartes
  initGameCards();
}

// Créer une carte de jeu avec la structure HTML exacte
function createGameCard(gameId, game) {
  // Créer l'élément principal de la carte
  const card = document.createElement("div");
  card.className = "game-card";
  card.dataset.game = gameId;

  card.dataset.tags = game.tags.join(" ").toLowerCase();

  // Déterminer la couleur du bouton play en fonction du badge
  let playButtonColor = "#667eea"; // Défaut pour "new"
  if (game.badge === "classic") {
    playButtonColor = "#f093fb";
  }

  // Construire le HTML de la carte
  card.innerHTML = `
    <div class="card-header">
      <span class="badge badge-${game.badge}">${game.badgeText}</span>
    </div>
    <div class="card-image">
      <img src="assets/logos/${gameId}.png" alt="${game.name}" />
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
      <h3 class="card-title">${game.emoji} ${game.name}</h3>
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
  const gameCards = document.querySelectorAll(".game-card:not(.coming-soon)");

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
        launchGame(gameId);
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

// Boutons "Me notifier"
function initNotifyButtons() {
  const notifyBtns = document.querySelectorAll(".btn-notify");

  notifyBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      // Animation de succès
      btn.innerHTML = "✓ Notifié !";
      btn.style.background =
        "linear-gradient(135deg, #51cf66 0%, #40c057 100%)";

      // Vibration si disponible
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // Sauvegarder dans localStorage
      const notifications = JSON.parse(
        localStorage.getItem("notifications") || "[]",
      );
      notifications.push({
        timestamp: new Date().toISOString(),
        type: "newGame",
      });
      localStorage.setItem("notifications", JSON.stringify(notifications));

      // Reset après 2 secondes
      setTimeout(() => {
        btn.innerHTML = "Me notifier";
        btn.style.background = "";
      }, 2000);
    });
  });
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

// Son au survol (optionnel - à activer si souhaité)
function playHoverSound() {
  // Créer un son subtil au survol
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = "sine";

  gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.01,
    audioContext.currentTime + 0.1,
  );

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.1);
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

  const gameCards = document.querySelectorAll(".game-card");

  const isMobile = window.matchMedia("(max-aspect-ratio: 1/1)").matches;

  let visibleCount = 0;

  gameCards.forEach((card) => {
    const title =
      card.querySelector(".card-title")?.textContent.toLowerCase() || "";
    const desc =
      card.querySelector(".card-description")?.textContent.toLowerCase() || "";
    const tags = card.dataset.tags || "";

    const match =
      query === "" ||
      title.includes(query) ||
      desc.includes(query) ||
      tags.includes(query);

    if (match) {
      card.classList.remove("is-hidden", "is-hidden-desktop");
      visibleCount++;
    } else {
      if (isMobile) {
        card.classList.add("is-hidden");
        card.classList.remove("is-hidden-desktop");
      } else {
        card.classList.add("is-hidden-desktop");
        card.classList.remove("is-hidden");
      }
    }
  });

  // ❌ on ne touche PLUS aux stats globales
  // donc on ne modifie PAS gamesNumber ici
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
    filterGames();
  }
});

// Export pour utilisation dans d'autres fichiers
export { launchGame, saveGameLaunch, getGamesStats };
