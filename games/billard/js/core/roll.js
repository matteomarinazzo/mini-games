// roll.js — orientation visuelle des billes (rendu uniquement, aucun effet sur la physique). Module pur.
// Repère : x droite, y bas, z vers l'intérieur de l'écran (droitier) ; l'observateur est du côté z < 0.
// O = matrice 3×3 (ligne par ligne) local → écran.
export const ID = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];

// Rotation d'angle a autour de l'axe unitaire (ax, ay, 0) (formule de Rodrigues).
export function rotM(ax, ay, a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [c + ax * ax * t, ax * ay * t, ay * s, ax * ay * t, c + ay * ay * t, -ax * s, -ay * s, ax * s, c];
}
export function mul(A, B) {
  const C = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return C;
}
// Roulement sans glissement : un déplacement (dx, dy) fait tourner la bille de |d|/R autour de l'axe (dy, -dx, 0).
export function rollBy(O, dx, dy, R) {
  const d = Math.hypot(dx, dy);
  return d < 1e-6 ? O : mul(rotM(dy / d, -dx / d, d / R), O);
}
