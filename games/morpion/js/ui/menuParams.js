import { gameData } from "../ctrl/mainCtrl.js";

const homeBtn = document.getElementById("homeBtn");
const settingsBtn = document.getElementById("settingsBtn");
const menuParams = document.getElementById("menuParams");
const cancelNBtn = document.getElementById("cancelBtn");
const applyBtn = document.getElementById("applyBtn");

const gameModeRadios = document.querySelectorAll('input[name="gameMode"]');
const difficultyGroup = document.getElementById("difficultyGroup");

/* ==========
==LISTENERS==
===========*/

// Navigation
homeBtn.addEventListener("click", () => onGoHome());
settingsBtn.addEventListener("click", () => onToggleSettings());

// Paramètres
cancelNBtn.addEventListener("click", () => onCancel());
applyBtn.addEventListener("click", () => onApply());

// Écouter les changements sur les radios
gameModeRadios.forEach((radio) => {
  radio.addEventListener("change", updateDifficultyVisibility);
});

/* ==========
==FONCTIONS==
===========*/
function onGoHome() {
  localStorage.removeItem("morpionGameConfig");
  localStorage.removeItem("morpionMode");
  localStorage.removeItem("morpionDifficulty");
  window.location.href = "../../index.html";
}

function onToggleSettings() {
  gameData.isMenuOpen = !gameData.isMenuOpen;
  menuParams.style.display = gameData.isMenuOpen ? "block" : "none";
}

function updateDifficultyVisibility() {
  const selectedMode = document.querySelector(
    'input[name="gameMode"]:checked',
  )?.value;
  if (selectedMode === "solo") {
    difficultyGroup.style.display = "block";
  } else {
    difficultyGroup.style.display = "none";
  }
}

function onCancel() {
  document.querySelector(
    `input[name="gameType"][value="${gameData.gameType}"]`,
  ).checked = true;
  document.querySelector(
    `input[name="gameMode"][value="${gameData.gameMode}"]`,
  ).checked = true;

  gameData.isMenuOpen = false;
  menuParams.style.display = "none";
}

function onApply() {
  let gameType = document.querySelector('input[name="gameType"]:checked');
  let gameMode = document.querySelector('input[name="gameMode"]:checked');
  let gameDifficulty = document.querySelector(
    'input[name="aiDifficulty"]:checked',
  );

  gameData.gameType = gameType.value;
  gameData.gameMode = gameMode.value;
  localStorage.setItem("morpionMode", gameMode.value);
  localStorage.setItem("morpionDifficulty", gameDifficulty.value);

  console.log(gameMode.value, gameDifficulty.value);

  gameData.isMenuOpen = false;
  menuParams.style.display = "none";
}

updateDifficultyVisibility();
