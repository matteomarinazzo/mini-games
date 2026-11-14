// Qualité graphique adaptative — 5 niveaux (0=ultra-low … 4=high)
// Baseline = niveau 3 (paramètres hardcodés d'origine)

// Paramètres par niveau : [scale, drawDist², nearLOD², smokeRate, rainDrops]
// scale : ratio de rendu (devicePixelRatio * scale, plafonné dans gl.js)
export const GFX_PARAMS = [
  [0.50, 90000, 2500, 5, 800],  // 0 — ultra-low  (<30 fps)
  [0.65, 160000, 2500, 8, 1400],  // 1 — low        (30-40 fps)
  [0.85, 360000, 3600, 11, 2000],  // 2 — medium-low (40-50 fps)
  [1.00, 640000, 4900, 14, 2800],  // 3 — medium     (50-60 fps) ← BASELINE
  [1.50, 1000000, 6400, 18, 3600],  // 4 — high       (>65 fps)
];

// Seuils [descendre si fps<dn, monter si fps>up] pour chaque niveau courant
const THRESHOLDS = [
  [0, 35],   // niveau 0 : ne descend pas
  [30, 45],
  [40, 55],
  [50, 65],
  [60, Infinity], // niveau 4 : ne monte pas
];

export const GFX = {
  level: 3,
  _ema: 60,
  _up: 0,
  _dn: 0,
};

/** Appelé chaque frame avec le fps instantané. Retourne true si le niveau a changé. */
export function adaptGfx(instantFps) {
  GFX._ema += (instantFps - GFX._ema) * 0.04;
  const fps = GFX._ema;
  const [dn, up] = THRESHOLDS[GFX.level];

  if (fps < dn && GFX.level > 0) {
    if (++GFX._dn >= 90) { GFX._dn = GFX._up = 0; GFX.level--; return true; }
  } else GFX._dn = 0;

  if (fps > up && GFX.level < 4) {
    if (++GFX._up >= 180) { GFX._up = GFX._dn = 0; GFX.level++; return true; }
  } else GFX._up = 0;

  return false;
}
