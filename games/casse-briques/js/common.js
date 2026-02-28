export const config = JSON.parse(sessionStorage.getItem("breakoutConfig")) || {
  width: 10,
  height: 6,
  brickLives: 1,
  difficulty: "medium",
};

const isMobile = window.matchMedia("(max-aspect-ratio: 1/1)").matches;

export const width = config.width;
export const height = config.height;

export const fix_padding = 7;
export const fix_offsetX = 10;
export const fix_offsetY = 40;
export const fix_brickWidth = isMobile ? 30 : 70;
export const fix_brickHeight = isMobile ? 10 : 20;

export const canvasWidth = width * fix_brickWidth + (width - 1) * fix_padding + 2 * fix_offsetX;

export const canvasHeight = height * fix_brickHeight + (height - 1) * fix_padding + 2 * fix_offsetY + 140;