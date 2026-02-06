export const canvas = document.getElementById("canvas");
export const ctx = canvas.getContext("2d");

export function initCanvas() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
