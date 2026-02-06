import { gameData } from "../ctrl/mainCtrl.js";
import { formatCoins } from "../../../../js/utils/formatNumber.js";


// On récupère les éléments une seule fois pour la performance
const elPercent = document.getElementById("ui-percent");
const elCoins = document.getElementById("ui-coins");
const elShovel = document.getElementById("ui-shovel");
const elSkierStatus = document.getElementById("ui-skier-status");

export function updateUI() {
  // Update Gauche
  elPercent.innerText = `${gameData.percentTransformed}%`;
  elCoins.innerText = formatCoins(gameData.coins);

  // Update Droite
  elShovel.innerText = `Niveau ${gameData.shovelSize}`;

  // Logique Skieurs
  if (gameData.canSpawnSkiers === 1) {
    elSkierStatus.style.color = "#00ffcc";
    const s = gameData.spawnRate > 1 ? "s" : "";
    elSkierStatus.innerText = `🚀 ${gameData.spawnRate} skieur${s} par clic-droit`;
  } 
  else if (gameData.canSpawnSkiers === 0) {
    elSkierStatus.style.color = "#ff6666";
    elSkierStatus.innerText = `⏳ Recharge (${gameData.spawnCooldownLeft}s)`;
  } 
  else {
    elSkierStatus.innerText = "🔒 Skieurs non débloqués";
  }
}
