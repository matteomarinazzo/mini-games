import { checkRealConnection } from "../js/network.js";
import { showBMC, hideBMC } from "../js/BuyMeACoffee.js";
import { notifyAboutVisit } from "../js/utils/webhooks.js";

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
      const { getFirebaseStat } = await import("../js/firebaseWrk.js");

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
        statusText.innerText = t("about.online");
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
      statusText.innerText = t("about.offline");
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
    if (timeLabel) timeLabel.innerText = t("about.stat_hours");
    displayMinutes = Math.floor(minutesCount / 60);
  } else {
    if (timeLabel) timeLabel.innerText = t("about.stat_minutes");
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
      statusText.innerText = t("about.online");
    }
  } else {
    console.log("📡 Passage hors ligne");
    hideBMC();

    if (statusBadge && statusText) {
      statusBadge.style.backgroundColor = "rgba(207, 81, 102, 0.95)";
      statusBadge.style.boxShadow = "0 0 10px rgba(207, 81, 102, 0.95)";
      statusText.innerText = t("about.offline");
    }
  }
}

// Écouteurs d'événements système
window.addEventListener('online', refreshStatus);
window.addEventListener('offline', refreshStatus);
window.addEventListener('load', refreshStatus);

// Lancement
//if (document.readyState === 'loading') {
//  document.addEventListener('DOMContentLoaded', startStats);
//} else {
//  startStats();
//}

/**
 * ANIMATIONS DE LA PAGE
 */
/* =============================================
   AJOUTER CE CODE dans about.js
   (remplace ou complète initScrollAnimations)
   ============================================= */

/**
 * SCROLL ANIMATIONS — Observer global
 * Active .is-visible sur sections, timeline, tech-cards, stat-boxes
 */
function initScrollAnimations() {
  const targets = document.querySelectorAll(
    '.content-section, .timeline-item, .tech-card, .stat-box'
  );

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: '0px 0px -40px 0px'
  });

  targets.forEach(el => observer.observe(el));
}

/**
 * BARRE DE PROGRESSION SCROLL
 */
function initScrollProgress() {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  document.body.appendChild(bar);

  window.addEventListener('scroll', () => {
    const total = document.documentElement.scrollHeight - window.innerHeight;
    const progress = total > 0 ? (window.scrollY / total) * 100 : 0;
    bar.style.width = progress + '%';
  }, { passive: true });
}

/**
 * PARALLAXE LEGÈRE SUR LES BLOBS
 */
function initParallax() {
  const blobs = document.querySelectorAll('.blob');
  if (!blobs.length) return;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    blobs[0] && (blobs[0].style.transform = `translate(${y * 0.04}px, ${y * 0.02}px) scale(1)`);
    blobs[1] && (blobs[1].style.transform = `translate(${-y * 0.03}px, ${y * 0.015}px) scale(1)`);
    blobs[2] && (blobs[2].style.transform = `translate(${y * 0.02}px, ${-y * 0.025}px) scale(1)`);
  }, { passive: true });
}

/**
 * SPOTLIGHT CURSOR
 */
function initSpotlight() {
  const spotlight = document.createElement('div');
  spotlight.className = 'spotlight';
  document.body.appendChild(spotlight);

  let mx = window.innerWidth / 2;
  let my = window.innerHeight / 2;
  let cx = mx, cy = my;

  window.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
  }, { passive: true });

  // Lerp doux
  function lerp(a, b, t) { return a + (b - a) * t; }

  function animate() {
    cx = lerp(cx, mx, 0.08);
    cy = lerp(cy, my, 0.08);
    spotlight.style.left = cx + 'px';
    spotlight.style.top = cy + 'px';
    requestAnimationFrame(animate);
  }

  animate();
}

/**
 * MAGNETIC TECH CARDS — effet repousse/attire
 * Le gradient radial suit le curseur sur chaque card
 */
function initMagneticCards() {
  document.querySelectorAll('.tech-card, .stat-box').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
      const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
      card.style.setProperty('--mx', x + '%');
      card.style.setProperty('--my', y + '%');
    });

    card.addEventListener('mouseleave', () => {
      card.style.setProperty('--mx', '50%');
      card.style.setProperty('--my', '50%');
    });
  });
}

/**
 * TRANSITION BACK BUTTON
 */
function addBackButtonTransition() {
  const backBtn = document.querySelector('.back-btn');
  if (!backBtn) return;

  backBtn.addEventListener('click', (e) => {
    e.preventDefault();
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.4s ease-out';
    setTimeout(() => { window.location.href = backBtn.href; }, 400);
  });
}

// Lancer au chargement
document.addEventListener('DOMContentLoaded', () => {

  initI18n();
  refreshTexts();

  notifyAboutVisit();

  initScrollAnimations();
  initScrollProgress();
  initParallax();
  initSpotlight();
  initMagneticCards();
  addBackButtonTransition();
  startStats();
});