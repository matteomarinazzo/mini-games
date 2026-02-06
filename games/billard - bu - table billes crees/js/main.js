import { initFullscreenSystem } from '../../../js/fullScreen.js';

window.addEventListener('DOMContentLoaded', () => {
  initFullscreenSystem();
});

export const gameData = {
  isMenuOpen: false,
  gameMode: "multiplayer", // ou "solo"
  soloDifficulty: "easy", // easy, medium, hard, expert
};

