// Importez les fonctions nécessaires de l'SDK Firebase
import { incrementFirebaseStat, getFirebaseStat } from "../js/firebaseWrk.js"

/**
 * Récupère le nombre total de joueurs depuis Firebase Realtime Database.
 * Remplace getVisitorCount().
 * @returns {Promise<number>} Le nombre total de joueurs ou NaN en cas d'erreur/non-prêt.
 */
async function getFirebaseTotalPlayers() {
  const players = await getFirebaseStat("totalPlayers", 0);
  return typeof players === "number" ? players : NaN;
}

/**
 * Récupère le temps total joué depuis Firebase Realtime Database et le formate.
 * @returns {Promise<number>} Le temps total formatée (secondes, minutes ou heures) ou NaN en cas d'erreur/non-prêt.
 */
async function getFirebasetotalMinutesPlayed() {
  const totalMinutes = await getFirebaseStat("totalMinutesPlayed", 0); // Stocké en secondes pour la précision
  const timeLabel = document.getElementById("timeLabel");

  let hours = totalMinutes / 60;

  if (totalMinutes < 60) {
    if (timeLabel) timeLabel.innerText = "Minutes jouées";
    return Math.floor(totalMinutes); // Retourne les minutes arrondies
  } else {
    if (timeLabel) timeLabel.innerText = "Heures jouées";
    return Math.floor(hours); // Retourne les heures arrondies
  }
}

// --- Fonctions existantes avec modifications minimales ---

function getGamesAvailableCount() {
  //let count = localStorage.getItem("cachedGamesCount");
  let count = localStorage.getItem("gamesAvailableCount");
  return count ? parseInt(count) : NaN;
}

document.addEventListener("DOMContentLoaded", async () => {
  if (localStorage.getItem("isNewPlayer")) {
    await incrementFirebaseStat("totalPlayers");
    localStorage.removeItem("isNewPlayer"); // Nettoyer
  }
  initStatsPage();
  initScrollAnimations();
  addBackButtonTransition();
});

// 2. Lancement global (CORRIGÉ pour Firebase)
async function initStatsPage() {
  // On récupère les chiffres depuis Firebase
  const totalPlayers = await getFirebaseTotalPlayers();
  const gamesAvailableCount = getGamesAvailableCount(); // Cette fonction n'est pas modifiée car elle utilise localStorage
  const totalMinutesPlayed = await getFirebasetotalMinutesPlayed();

  // On définit les cibles
  const statsConfig = {
    gamesAvailable: gamesAvailableCount,
    numberPlayers: totalPlayers,
    hoursPlayed: totalMinutesPlayed,
    percentFree: 100, // Supposé être une valeur statique ou provenant d'une autre source
  };

  // On lance l'observateur avec ces chiffres
  animateStats(statsConfig);

  // 3. Animation (CORRIGÉE pour accepter la config)
  function animateStats(config) {
    const statValues = document.querySelectorAll(".stat-value");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            // On cherche la valeur dans la config passée en argument
            const target = config[el.id] || 0;

            animateValue(el, 0, target, 2000);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.5 },
    );

    statValues.forEach((stat) => observer.observe(stat));
  }
}

// Fonction utilitaire (Gardez votre requestAnimationFrame)
function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(
      progress * (end - start) + start,
    ).toLocaleString();
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

// Animations au scroll
function initScrollAnimations() {
  const sections = document.querySelectorAll(".content-section");

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
      rootMargin: "0px 0px -50px 0px",
    },
  );

  sections.forEach((section) => {
    section.style.opacity = "0";
    section.style.transform = "translateY(30px)";
    observer.observe(section);
  });
}

// Transition du bouton retour
function addBackButtonTransition() {
  const backBtn = document.querySelector(".back-btn");

  if (!backBtn) {
    return;
  }

  backBtn.addEventListener("click", (e) => {
    e.preventDefault();

    // Animation de sortie
    document.body.style.opacity = "0";
    document.body.style.transition = "opacity 0.3s ease-out";

    setTimeout(() => {
      window.location.href = backBtn.href;
    }, 300);
  });
}

async function displayAppVersion() {
  try {
    const res = await fetch('../assets/data/versions.json');
    if (!res.ok) throw new Error("Impossible de charger versions.json");
    const manifest = await res.json();
    const version = manifest.currentVersion || "1.0.0";
    const el = document.getElementById('app-version');
    if (el) el.textContent = version;
  } catch (e) {
    console.warn("Impossible d'afficher la version :", e);
  }
}

// Appel
displayAppVersion();