import { resetGame } from "../utils/shared-config.js"

const homeBtn = document.getElementById("homeBtn");
const symbolBtn = document.getElementById("symbolBtn");
const resetBtn = document.getElementById("resetBtn");

/* ==========
==LISTENERS==
===========*/

// Navigation
homeBtn.addEventListener("click", () => onGoHome());
symbolBtn.addEventListener("click", () => onSymbolBtn());
resetBtn.addEventListener("click", () => onResetBtn());

/* ==========
==FONCTIONS==
===========*/
function onGoHome() {
  localStorage.removeItem("morpionGameConfig");
  localStorage.removeItem("morpionMode");
  localStorage.removeItem("morpionDifficulty")
  window.location.href = "../../.././index.html";
}

function onSymbolBtn() {
  //localStorage.removeItem("morpionGameConfig");
  //localStorage.removeItem("morpionMode");
  //localStorage.removeItem("morpionDifficulty")
  window.location.href = "../index.html";
}

function onResetBtn() {
  // Détecter si on est dans Ultimate ou Standard
  if (typeof window.resetUltimateGame === 'function') {
    window.resetUltimateGame();
  } else {
    resetGame();
  }
}