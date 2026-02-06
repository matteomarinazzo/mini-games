export function createFirstAimLine() {
  const cueLine = document.createElement("div");
  cueLine.id = "cue-line";
  cueLine.style.position = "absolute";
  cueLine.style.width = "2px";
  cueLine.style.height = "200px";
  cueLine.style.backgroundColor = "rgba(255, 255, 255, 0.5)";
  cueLine.style.transformOrigin = "top center";
  cueLine.style.top = "50%";
  cueLine.style.left = "50%";
  cueLine.style.transform = "translate(-50%, -100%) rotate(0deg)";
  cueLine.style.pointerEvents = "none"; // Pour que la ligne ne gêne pas les clics
  cueLine.style.zIndex = "10"; // Au-dessus des autres éléments du jeu

  document.getElementById("table").appendChild(cueLine);
}

let mouseX = 0;
let mouseY = 0;
let centerX = 0;
let centerY = 0;

window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

export function updateCueLine() {
  let angle = 0; // Angle en degrés
  // Calculer l'angle en fonction de la position de la souris ou d'autres paramètres du jeu
  // Par exemple, si vous avez les coordonnées de la souris (mouseX, mouseY) et du centre de la table (centerX, centerY) :
  const deltaX = mouseX - centerX;
  const deltaY = mouseY - centerY;
  angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

  const cueLine = document.getElementById("cue-line");
  if (cueLine) {
    cueLine.style.transform = `translate(-50%, -100%) rotate(${angle}deg)`;
  }
}