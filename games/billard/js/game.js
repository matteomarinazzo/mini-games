//import { updateBalls, balls, play, initPockets } from "./engine/balls.js";
//import { resetGameState, gameState } from "./rules/rules.js";
//import { initHUD, updateHUD } from "./ui/hud.js";

import { createFirstAimLine, updateCueLine } from "./engine/cue.js";

let balls = [];
let play = {};
let gameState = {};

const gameMode = localStorage.getItem("billiardGameMode") || "american";
const BAND_SIZE = parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue("--band-size"),
);

let playableArea, playableAreaWidth, playableAreaHeight;

const BALL_RADIUS = 11;
const BALL_DIAMETER = BALL_RADIUS * 2;

// distances pour le triangle de billes (triangle équilatéral)
const H_SPACING = BALL_DIAMETER * 0.9; // espacement horizontal
const V_SPACING = BALL_DIAMETER; // espacement vertical

let table;

// Définition des billes avec numéro, couleur et type
const ballDefinitions = {
  1: { color: "yellow", type: "solid" },
  2: { color: "blue", type: "solid" },
  3: { color: "red", type: "solid" },
  4: { color: "purple", type: "solid" },
  5: { color: "orange", type: "solid" },
  6: { color: "green", type: "solid" },
  7: { color: "brown", type: "solid" },
  8: { color: "black", type: "solid" },
  9: { color: "yellow", type: "striped" },
  10: { color: "blue", type: "striped" },
  11: { color: "red", type: "striped" },
  12: { color: "purple", type: "striped" },
  13: { color: "orange", type: "striped" },
  14: { color: "green", type: "striped" },
  15: { color: "brown", type: "striped" },
};

document.addEventListener("DOMContentLoaded", () => {
  table = document.getElementById("table");
  playableArea = document.getElementById("playableArea");

  playableAreaWidth = playableArea.clientWidth;
  playableAreaHeight = playableArea.clientHeight;

  // Zone jouable = tapis - bandes
  play.width = playableAreaWidth;
  play.height = playableAreaHeight;

  // Position dans la table complète
  play.left = BAND_SIZE;
  play.top = BAND_SIZE;

  // Droite et bas calculés correctement
  play.right = play.left + play.width;
  play.bottom = play.top + play.height;

  // Centre Y par rapport à la zone jouable
  play.centerY = play.height / 2;

  console.log(`Playable area: ${playableAreaWidth}x${playableAreaHeight}`);
  console.log(`play: ${JSON.stringify(play)}`);

  // Initialiser les poches maintenant que play est défini
  //initPockets();
  console.log("Poches initialisées");

  // Initialiser le game state
  gameState.mode = gameMode;
  //resetGameState();

  // Initialiser le HUD
  //initHUD();

  document.getElementById("modeLabel").textContent =
    `Mode : ${gameMode.toUpperCase()}`;

  createFirstAimLine();

  initGame();
  update();
});

class Ball {
  constructor(id, x, y, color, number = null) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = BALL_RADIUS;
    this.number = number;

    this.el = document.createElement("div");
    this.el.className = `ball ${color}`;

    // Ajouter le numéro sur la bille
    if (number !== null && number !== "cue") {
      const numberEl = document.createElement("span");
      numberEl.className = "ball-number";
      numberEl.textContent = number;
      this.el.appendChild(numberEl);
    }

    table.appendChild(this.el);

    this.render();
  }

  render() {
    this.el.style.transform = `translate(${this.x - this.radius}px, ${this.y - this.radius}px)`;
  }
}

function initGame() {
  balls.length = 0;
  document.querySelectorAll(".ball").forEach((b) => b.remove());

  if (gameMode === "american" || gameMode === "15-ball") {
    createAmericanRack();
  } else if (gameMode === "9-ball") {
    createNineBallRack();
  }

  // Bille blanche : 1/4 de la zone jouable + offset de la bande, centre vertical
  balls.push(
    new Ball(
      "cue",
      play.left + play.width * 0.25,
      play.top + play.centerY,
      "white",
      "cue",
    ),
  );
}

function createAmericanRack() {
  const rackOrigin = {
    x: play.left + play.width * 0.75,
    y: play.top + play.centerY,
  };

  const schema = [1, 2, 3, 4, 5]; // Triangle standard

  // Créer un tableau avec tous les numéros de billes (sauf 1 et 8)
  let availableBalls = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];

  // Mélanger aléatoirement
  availableBalls = shuffleArray(availableBalls);

  // Positions importantes :
  // Position 0 : sommet (bille 1 obligatoire)
  // Position 4 : centre (bille 8 obligatoire)

  let ballNumbers = [];
  let ballIndex = 0;

  for (let row = 0; row < schema.length; row++) {
    for (let col = 0; col < schema[row]; col++) {
      const position = ballNumbers.length;

      if (position === 0) {
        // Sommet : bille 1
        ballNumbers.push(1);
      } else if (position === 4) {
        // Centre : bille 8
        ballNumbers.push(8);
      } else {
        // Autres positions : ordre aléatoire
        ballNumbers.push(availableBalls[ballIndex]);
        ballIndex++;
      }
    }
  }

  // Créer les billes avec leurs positions
  let posIndex = 0;
  for (let row = 0; row < schema.length; row++) {
    const rowX = rackOrigin.x + row * H_SPACING;
    const rowStartY = rackOrigin.y - (row / 2) * V_SPACING;

    for (let col = 0; col < schema[row]; col++) {
      const ballNum = ballNumbers[posIndex];
      const ballDef = ballDefinitions[ballNum];
      const colorClass =
        ballDef.type === "striped" ? `${ballDef.color} striped` : ballDef.color;

      balls.push(
        new Ball(
          ballNum,
          rowX,
          rowStartY + col * V_SPACING,
          colorClass,
          ballNum,
        ),
      );
      posIndex++;
    }
  }
}

function createNineBallRack() {
  const rackOrigin = {
    x: play.left + play.width * 0.75,
    y: play.top + play.centerY,
  };

  const schema = [1, 2, 3, 2, 1]; // Forme diamant

  // Créer un tableau avec les numéros de billes 2-8 (sans 1 et 9)
  let availableBalls = [2, 3, 4, 5, 6, 7, 8];

  // Mélanger aléatoirement
  availableBalls = shuffleArray(availableBalls);

  // Positions importantes :
  // Position 0 : sommet (bille 1 obligatoire)
  // Position 4 : centre (bille 9 obligatoire)

  let ballNumbers = [];
  let ballIndex = 0;

  for (let row = 0; row < schema.length; row++) {
    for (let col = 0; col < schema[row]; col++) {
      const position = ballNumbers.length;

      if (position === 0) {
        // Sommet : bille 1
        ballNumbers.push(1);
      } else if (position === 4) {
        // Centre : bille 9
        ballNumbers.push(9);
      } else {
        // Autres positions : ordre aléatoire
        ballNumbers.push(availableBalls[ballIndex]);
        ballIndex++;
      }
    }
  }

  // Créer les billes avec leurs positions
  let posIndex = 0;
  for (let row = 0; row < schema.length; row++) {
    const rowX = rackOrigin.x + row * H_SPACING;
    let rowStartY = rackOrigin.y - ((schema[row] - 1) / 2) * V_SPACING;

    for (let col = 0; col < schema[row]; col++) {
      const ballNum = ballNumbers[posIndex];
      const ballDef = ballDefinitions[ballNum];
      const colorClass =
        ballDef.type === "striped" ? `${ballDef.color} striped` : ballDef.color;

      balls.push(
        new Ball(
          ballNum,
          rowX,
          rowStartY + col * V_SPACING,
          colorClass,
          ballNum,
        ),
      );
      posIndex++;
    }
  }
}

// Fonction pour mélanger un tableau (algorithme Fisher-Yates)
function shuffleArray(array) {
  const arr = [...array]; // Copie pour ne pas modifier l'original
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function update() {
  updateCueLine();
  //updateBalls();
  requestAnimationFrame(update);
}

// Fonction pour replacer la bille blanche au centre
export function replaceCueBall() {
  let cueBall = balls.find((b) => b.id === "cue");

  if (!cueBall) {
    // Recréer la bille blanche si elle n'existe pas
    cueBall = new Ball(
      "cue",
      play.left + play.width * 0.25,
      play.top + play.centerY,
      "white",
      "cue",
    );
    balls.push(cueBall);
  } else {
    // Replacer au centre
    cueBall.x = play.left + play.width * 0.25;
    cueBall.y = play.top + play.centerY;
    cueBall.vx = 0;
    cueBall.vy = 0;
  }

  updateHUD();
}

// Fonction pour réinitialiser la partie
export function resetGame() {
  balls.length = 0;
  document.querySelectorAll(".ball").forEach((b) => b.remove());

  resetGameState();
  initGame();
  updateHUD();

  console.log("Partie réinitialisée");
}
