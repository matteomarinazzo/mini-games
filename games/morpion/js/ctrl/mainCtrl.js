import { initFullscreenSystem } from '../../../../js/fullScreen.js';

window.addEventListener('DOMContentLoaded', () => {
  initFullscreenSystem();
});

export const gameData = {
  isMenuOpen: false,
  gameType: "standard3x3", // ou big5x5, ultimate
  gameMode: "multiplayer", // ou "solo"
  soloDifficulty: "easy", // easy, medium, hard, expert
  player1Symbol: "",
  player2Symbol: "",
};

