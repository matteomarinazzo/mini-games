import { checkRealConnection } from "../js/network.js";
import { showBMC, hideBMC } from "../js/BuyMeACoffee.js";

const statusBadge = document.querySelector(".status-badge");
const statusText = document.getElementById("status-text");

/**
 * INITIALISATION GÉNÉRALE
 */
async function startStats() {
  console.log("🚀 Initialisation de la page stats...");

  const isOnline = await checkRealConnection();
  let playersCount = 0;
  let minutesCount = 0;

  if (isOnline) {
    try {
      // Import dynamique pour ne pas charger Firebase si hors ligne
      const { incrementFirebaseStat, getFirebaseStat } = await import("../js/firebaseWrk.js");

      // Gestion du nouveau joueur
      if (localStorage.getItem("isNewPlayer")) {
        await incrementFirebaseStat("totalPlayers");
        localStorage.removeItem("isNewPlayer");
      }

      // Récupération des données réelles
      playersCount = await getFirebaseStat("totalPlayers", 0);
      minutesCount = await getFirebaseStat("totalMinutesPlayed", 0);

      // Mise en local des données
      localStorage.setItem("playersCount", playersCount);
      localStorage.setItem("minutesCount", minutesCount);

      console.log("🔥 Données récupérées depuis Firebase");

      // Afficher le badge en ligne
      if (statusBadge && statusText) {
        // Changement de couleur (Vert)
        statusBadge.style.backgroundColor = "rgba(81, 207, 102, 0.95)";
        statusBadge.style.boxShadow = "0 0 10px rgba(81, 207, 102, 0.95)";

        // Changement du texte
        statusText.innerText = "En ligne";
      }
    } catch (e) {
      console.warn("⚠️ Erreur Firebase, passage aux valeurs par défaut", e);
    }
  } else {
    console.log("📡 Mode Offline : Firebase ignoré.");
    playersCount = localStorage.getItem("playersCount") || 0;
    minutesCount = localStorage.getItem("minutesCount") || 0;

    // Afficher le badge hors ligne
    if (statusBadge && statusText) {
      // Changement de couleur (Rouge)
      statusBadge.style.backgroundColor = "rgba(207, 81, 102, 0.95)";
      statusBadge.style.boxShadow = "0 0 10px rgba(207, 81, 102, 0.95)";

      // Changement du texte
      statusText.innerText = "Hors ligne";
    }
  }

  // Lancement de l'affichage
  await initStatsPage(playersCount, minutesCount);

  // Fonctions visuelles
  initScrollAnimations();
  addBackButtonTransition();
  displayAppVersion();
}

/**
 * MISE EN PAGE DES STATS
 */
async function initStatsPage(playersCount, minutesCount) {
  const gamesCount = getGamesAvailableCount();
  const timeLabel = document.getElementById("timeLabel");

  let displayMinutes = minutesCount;

  // Logique de conversion minutes -> heures
  if (minutesCount >= 60) {
    if (timeLabel) timeLabel.innerText = "Heures jouées";
    displayMinutes = Math.floor(minutesCount / 60);
  } else {
    if (timeLabel) timeLabel.innerText = "Minutes jouées";
  }

  const statsConfig = {
    gamesAvailable: gamesCount,
    numberPlayers: playersCount,
    hoursPlayed: displayMinutes,
    percentFree: 100,
  };

  console.log("📊 Configuration des stats prête:", statsConfig);
  animateStats(statsConfig);
}

/**
 * ANIMATIONS DES CHIFFRES
 */
function animateStats(config) {
  const statValues = document.querySelectorAll(".stat-value");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = config[el.id];
        if (target !== undefined) {
          animateValue(el, 0, target, 2000);
        }
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });
  statValues.forEach((stat) => observer.observe(stat));
}

function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

/**
 * UTILITAIRES
 */
function getGamesAvailableCount() {
  const count = localStorage.getItem("gamesAvailableCount");
  return count ? parseInt(count) : 0;
}

async function displayAppVersion() {
  try {
    const res = await fetch('../assets/data/versions.json');
    if (res.ok) {
      const data = await res.json();
      const el = document.getElementById('app-version');
      if (el) el.textContent = data.currentVersion || "1.0.0";
    }
  } catch (e) { console.warn("Version non chargée"); }
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

// Lancement
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startStats);
} else {
  startStats();
}

/**
 * ANIMATIONS DE LA PAGE
 */
function initScrollAnimations() {
  const sections = document.querySelectorAll(".content-section");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

  sections.forEach((section) => {
    section.style.opacity = "0";
    section.style.transform = "translateY(30px)";
    section.style.transition = "all 0.6s ease-out";
    observer.observe(section);
  });
}

function addBackButtonTransition() {
  const backBtn = document.querySelector(".back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.body.style.opacity = "0";
      document.body.style.transition = "opacity 0.3s ease-out";
      setTimeout(() => { window.location.href = backBtn.href; }, 300);
    });
  }
}