import { resetGame, setPaused } from "../ctrl/gameCtrl.js";

const $ = (id) => document.getElementById(id);
const pauseOv = $("pauseOv");

// "Menu" (retour au menu du jeu) est un simple lien vers ./index.html (symboles + paramètres)
$("homeBtn").addEventListener("click", onGoHome);
$("resetBtn").addEventListener("click", () => resetGame());
$("pauseBtn").addEventListener("click", openPause);
$("resume").addEventListener("click", closePause);
$("pRestart").addEventListener("click", () => {
  resetGame();
  closePause();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") (pauseOv.hidden ? openPause : closePause)();
});

function openPause() {
  pauseOv.hidden = false;
  setPaused(true);
}
function closePause() {
  pauseOv.hidden = true;
  setPaused(false);
}
function onGoHome() {
  localStorage.removeItem("morpionGameConfig");
  localStorage.removeItem("morpionMode");
  localStorage.removeItem("morpionDifficulty");
  window.location.href = "../../index.html";
}
