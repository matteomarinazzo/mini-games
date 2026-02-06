import { gameData } from "../ctrl/mainCtrl.js";

import { formatCoins } from "../../../../js/utils/formatNumber.js";

/* GESTION DES UPGRADES */

const inititialSpawnTime = 30;

const shovelBtn = document.getElementById("shovelBtn");
const coinBtn = document.getElementById("coinBtn");
const spawnSkierBtn = document.getElementById("spawnSkierBtn");
const spawnTimeBtn = document.getElementById("spawnTimeBtn");
const spawnRateBtn = document.getElementById("spawnRateBtn");

// Au chargement, cacher les boutons de spawn skieurs
spawnTimeBtn.style.display = "none";
spawnRateBtn.style.display = "none";

/* ÉVÉNEMENTS BOUTONS */
// Arrête la propagation uniquement pour les événements qui déclenchent la peinture
["mousedown", "mouseup", "pointerdown", "pointerup"].forEach((eventType) => {
  shovelBtn.addEventListener(eventType, (e) => e.stopPropagation(), {
    capture: true,
  });
  coinBtn.addEventListener(eventType, (e) => e.stopPropagation(), {
    capture: true,
  });
  spawnSkierBtn.addEventListener(eventType, (e) => e.stopPropagation(), {
    capture: true,
  });
  spawnTimeBtn.addEventListener(eventType, (e) => e.stopPropagation(), {
    capture: true,
  });
  spawnRateBtn.addEventListener(eventType, (e) => e.stopPropagation(), {
    capture: true,
  });
});

// Listener normal pour le click
shovelBtn.addEventListener("click", () => onUpgradeShovel());
coinBtn.addEventListener("click", () => onUpgradeCoins());
spawnSkierBtn.addEventListener("click", () => onSpawnSkier());
spawnTimeBtn.addEventListener("click", () => onSpawnTimeSkier());
spawnRateBtn.addEventListener("click", () => onSpawnRateSkier());

/*====================================
==GESTION DES BOUTONS D'AMELIORATION==
====================================*/
function onUpgradeShovel() {
  const cost = getShovelUpgradeCost(gameData.shovelSize);

  if (cost === -1) {
    return;
  }

  if (gameData.coins >= cost) {
    const nextLevel = gameData.shovelSize + 1;
    //const nextSrc = `../ressources/img/pelles/niv${nextLevel}.png`;
    const nextSrc = `./ressources/img/pelles/niv${nextLevel}.png`;

    const testImg = new Image();

    gameData.coins -= cost;
    gameData.shovelSize = nextLevel;

    testImg.onload = () => {
      // L'image existe → on valide l'upgrade

      gameData.shovelImg.src = nextSrc;

      console.log(`Pelle agrandie ! Nouvelle taille : ${gameData.shovelSize}`);
      updateHUD();
    };

    testImg.onerror = () => {
      // L'image n'existe pas → on bloque l'upgrade visuel
      console.warn("Niveau de pelle maximum atteint.");
    };

    testImg.src = nextSrc;
    updateHUD();
  } else {
    console.log("Pas assez de pièces pour agrandir la pelle !");
  }
  updateHUD();
}

function onUpgradeCoins() {
  const cost = getCoinsUpgradeCost(gameData.coins);

  if (cost === -1) {
    return;
  }

  if (gameData.coins >= cost) {
    gameData.ratioCoins *= 1.5; // augmentation de 50%
    gameData.coins -= cost; // payer l’upgrade
    console.log(`Nouvelle valeur par tuile : ${gameData.ratioCoins}`);
  } else {
    console.log("Pas assez de pièces pour augmenter la capacité !");
  }
  updateHUD();
}

function onSpawnSkier() {
  const cost = getSpawnSkierCost();

  if (cost === -1) {
    return;
  }

  if (gameData.coins >= cost) {
    //unlockSpawnSkier(cost, spawnSkierBtn, spawnRateBtn, spawnTimeBtn);
    gameData.coins -= cost;
    gameData.canSpawnSkiers = 1;
    spawnSkierBtn.style.display = "none";
    spawnRateBtn.style.display = "inline-block";
    spawnTimeBtn.style.display = "inline-block";
    console.log("Capacité de spawn de skieurs débloquée !");
  } else {
    console.log("Pas assez de pièces pour débloquer les skieurs !");
  }
  updateHUD();
}

function onSpawnTimeSkier() {
  const cost = getSpawnTimeUpgradeCost(inititialSpawnTime - gameData.spawnTime);

  if (cost === -1) {
    console.log("Temps d'attente minimum atteint.");
    return;
  }

  if (gameData.coins >= cost) {
    gameData.coins -= cost;
    gameData.spawnTime -= 1; // diminution linéaire
    console.log(`Temps d'attente diminuée ! Nouveau temps : ${gameData.spawnTime}`);
  } else {
    console.log("Pas assez de pièces pour diminuer le temps d'attente !");
  }
  updateHUD();
}

function onSpawnRateSkier() {
  const cost = getSpawnRateUpgradeCost(gameData.spawnRate);

  if (cost === -1) {
    return;
  }

  if (gameData.coins >= cost) {
    gameData.coins -= cost;
    gameData.spawnRate += 1;
    console.log(`Taux de spawn augmenté ! Nouveau taux : ${gameData.spawnRate}`);
  } else {
    console.log("Pas assez de pièces pour augmenter le taux de spawn !");
  }
  updateHUD();
}

// Désactiver le spawn de skieurs juste après le spawn d’un skieur pendant le temps d’attente
export function disableSkierSpawningTemporarily(i) {
  if (!i || gameData.spawnTime == 0) return; // seulement pour le premier skieur
  gameData.canSpawnSkiers = 0;
  gameData.spawnCooldownLeft = gameData.spawnTime;

  const interval = setInterval(() => {
    gameData.spawnCooldownLeft--;

    if (gameData.spawnCooldownLeft <= 0) {
      gameData.canSpawnSkiers = 1;
      clearInterval(interval);
    }
  }, 1000);
}

/*==================================
==MISE A JOUR DU TEXTE DES BOUTONS==
==================================*/
export function updateHUD() {
  // shovel btn
  const shovelCost = getShovelUpgradeCost(gameData.shovelSize);
  const formatShovelCost = formatCoins(shovelCost);

  if (shovelCost === -1) {
    shovelBtn.textContent = `Pelle niveau MAX`;
  } else if (shovelCost == -2) {
    shovelBtn.textContent = `Augmenter la pelle (Gratuit)`;
  } else {
    shovelBtn.textContent = `Augmenter la pelle (${formatShovelCost})`;
  }
  // coin btn
  const coinCost = getCoinsUpgradeCost(gameData.coins);
  const formatCoinCost = formatCoins(coinCost);

  if (coinCost === -1) {
    coinBtn.textContent = `Capacité pièces MAX`;
  } else if (coinCost === -2) {
    coinBtn.textContent = `Augmenter les gains (Gratuit)`;
  } else {
    coinBtn.textContent = `Augmenter les gains (${formatCoinCost})`;
  }
  // spawn skier btn
  const spawnSkierCost = getSpawnSkierCost();
  const formatSpawnSkierCost = formatCoins(spawnSkierCost);

  if (spawnSkierCost === -2) {
    spawnSkierBtn.textContent = `Débloquer les skieurs (Gratuit)`;
  } else {
    spawnSkierBtn.textContent = `Débloquer les skieurs (${formatSpawnSkierCost})`;
  }
  // spawn time btn
  const spawnTimeCost = getSpawnTimeUpgradeCost(
    inititialSpawnTime - gameData.spawnTime,
  );
  const formatSpawnTimeCost = formatCoins(spawnTimeCost);

  if (spawnTimeCost === -1) {
    spawnTimeBtn.textContent = `Temps d'attente MINIMUM`;
  } else if (spawnTimeCost === -2) {
    spawnTimeBtn.textContent = `Diminuer le temps d'attente (Gratuit)`;
  } else {
    spawnTimeBtn.textContent = `Diminuer le temps d'attente (${formatSpawnTimeCost})`;
  }
  // spawn rate btn
  const spawnRateCost = getSpawnRateUpgradeCost(gameData.spawnRate);
  const formatSpawnRateCost = formatCoins(spawnRateCost);

  if (spawnRateCost === -1) {
    spawnRateBtn.textContent = `Nombre de skieurs MAXIMUM`;
    return;
  } else if (spawnRateCost === -2) {
    spawnRateBtn.textContent = `Augmenter le nombre de skieurs (Gratuit)`;
    return;
  } else {
    spawnRateBtn.textContent = `Augmenter le nombre de skieurs (${formatSpawnRateCost})`;
  }
}

/*====================================
==GETTERS DES PRIX DES AMELIORATIONS==
====================================*/
export function getShovelUpgradeCost(currentShovelSize) {
  if (currentShovelSize >= document.getElementById("shovelSize").max) return -1; // max level reached
  const base = 10; // coût du 1er upgrade
  const ratio = 5.4; // exponentiel
  if (gameData.infiniteCoins) return -2; // infinite coins mode
  return Math.floor(base * Math.pow(ratio, currentShovelSize - 1)); //10 * 5.4^0 = 10
}

export function getCoinsUpgradeCost(currentCoins) {
  if (gameData.ratioCoins >= document.getElementById("coinRatio").max) {
    gameData.ratioCoins = parseFloat(document.getElementById("coinRatio").max);
    return -1; // max level reached
  }
  const base = 100; // coût du 1er upgrade
  const ratio = 10; // exponentiel
  if (gameData.infiniteCoins) return -2; // infinite coins mode
  return Math.floor(base * Math.pow(ratio, gameData.ratioCoins * ratio)); //50 * 10^0 = 50
}

export function getSpawnSkierCost() {
  if (gameData.infiniteCoins) return -2; // infinite coins mode
  return 500; // prix fixe pour l’instant
}

export function getSpawnRateUpgradeCost(currentRate) {
  if (currentRate >= document.getElementById("spawnRate").max) return -1; // max level reached
  const base = 1000; // coût du 1er upgrade
  const ratio = 5; // exponentiel
  if (gameData.infiniteCoins) return -2; // infinite coins mode
  return Math.floor(base * Math.pow(ratio, currentRate));
}

export function getSpawnTimeUpgradeCost(currentTimeLevel) {
  if (gameData.spawnTime <= 0) return -1; // max level reached
  const base = 300; // coût du 1er upgrade
  const ratio = 3; // exponentiel
  if (gameData.infiniteCoins) return -2; // infinite coins mode
  return Math.floor(base * Math.pow(ratio, currentTimeLevel));
}

// initialisation au chargement
updateHUD();
