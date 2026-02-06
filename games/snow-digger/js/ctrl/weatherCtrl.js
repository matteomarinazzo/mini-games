import { gameData } from "../ctrl/mainCtrl.js";

let stormTimeout = null;
let currentWindStrength = 0; // Pour transition fluide
let targetWindStrength = 0;

export function startWeatherSystem() {
  scheduleNextStorm();
}

function scheduleNextStorm() {
  // Temps avant la prochaine tempête (1 à 5 minutes)
  const timeBeforeStorm = randomBetween(60000, 120000);
  setTimeout(startSnowStorm, timeBeforeStorm);
}

function startSnowStorm() {
  gameData.isSnowStorm = true;
  targetWindStrength = 1; // Transition progressive vers tempête
  console.log("❄️ Tempête de neige !");

  // Durée de la tempête : 10 à 30 secondes
  const stormDuration = randomBetween(10000, 30000);
  stormTimeout = setTimeout(endSnowStorm, stormDuration);
}

function endSnowStorm() {
  gameData.isSnowStorm = false;
  targetWindStrength = 0; // Transition progressive vers calme
  console.log("☀️ Fin de la tempête");
  scheduleNextStorm();
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// Mise à jour du vent (appelé chaque frame pour smooth transition)
export function updateWindStrength() {
  const lerpSpeed = 0.02; // Plus c'est petit, plus la transition est douce
  currentWindStrength += (targetWindStrength - currentWindStrength) * lerpSpeed;
}

// Obtenir la force du vent actuelle (entre 0 et 1)
export function getWindStrength() {
  return currentWindStrength;
}

/*======================
==VISUEL DE LA TEMPÊTE==
======================*/

// Quantité de neige qui tombe par tick (pour remplir le terrain)
export function getSnowAmountPerTick() {
  return gameData.isSnowStorm ? 300 : 5;
}

// Nombre de flocons visuels (transition plus douce)
export function getNumberSnowFlakes() {
  // Interpolation basée sur la force du vent
  const minFlakes = 300;
  const maxFlakes = 2000;
  return Math.floor(minFlakes + (maxFlakes - minFlakes) * currentWindStrength);
}

// Obtenir le swing du vent (appelé chaque frame pour chaque flocon)
export function getSnowSwing() {
  // Base : petit mouvement aléatoire
  const baseSwing = (Math.random() - 0.5) * 0.5;
  
  // Pendant tempête : ajout progressif de vent latéral
  const stormWind = currentWindStrength * (3 + Math.random() * 2);
  
  return baseSwing + stormWind;
}

// Variation de vitesse pendant tempête
export function getSnowSpeed(baseSpeed) {
  const stormBoost = currentWindStrength * (1 + Math.random() * 0.5);
  return baseSpeed + stormBoost;
}