/**
 * SNOW DIGGER — js/core/state.js
 * Données globales, sauvegarde / chargement (clé: "snow-digger")
 */

const SAVE_KEY = 'snow-digger';

// ── Structure d'une partie neuve ──────────────────────────────
export function freshState() {
  return {
    coins:        0,
    shovelLevel:  1,          // 1..20
    ratioCoins:   0.1,        // pièces par tuile déblayée
    ratioLevel:   1,          // niveau d'amélioration de gains (1..15)
    skierUnlocked:false,      // Au début d'une partie, skieurs NON débloqués
    skierLevel:   0,
    spawnRateLevel:0,         // niveau "nombre de skieurs" (0..10)
    spawnTimeLevel:0,         // niveau "vitesse spawn" (0..10)
    totalCleared: 0,          // tuiles déblayées à vie
    totalCoinsEarned: 0,
    playtime:     0,          // secondes jouées
  };
}

// ── Chargement ────────────────────────────────────────────────
export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (typeof parsed.coins !== 'number' || typeof parsed.shovelLevel !== 'number') {
      return freshState();
    }
    // Assurer que skierUnlocked est bien booléen
    if (typeof parsed.skierUnlocked !== 'boolean') {
      parsed.skierUnlocked = false;
    }
    return Object.assign(freshState(), parsed);
  } catch {
    return freshState();
  }
}

// ── Sauvegarde ────────────────────────────────────────────────
export function saveState(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded ou private mode */ }
}

// ── Réinitialisation ─────────────────────────────────────────
export function resetState() {
  localStorage.removeItem(SAVE_KEY);
  return freshState();
}

// ── Progression : 20 niveaux de pelle ────────────────────────
export const SHOVEL_MAX = 20;
export const RATIO_MAX  = 15;
export const SPAWN_RATE_MAX = 10;
export const SPAWN_TIME_MAX = 10;

// Largeur exacte de la lame de pelle en pixels (1..20)
// La quantité de neige déblayée correspond exactement à cette largeur !
export const SHOVEL_WIDTHS = [
  16,  // Niv 1 : Truelle de jardin pointue
  24,  // Niv 2 : Petite pelle rouge
  32,  // Niv 3 : Pelle pliante US armée
  40,  // Niv 4 : Pelle ronde de terrassement
  48,  // Niv 5 : Bêche carrée de chantier
  56,  // Niv 6 : Pelle à neige alu nervurée
  64,  // Niv 7 : Pelle polymère large bleu givré
  74,  // Niv 8 : Poussoir jaune de voirie
  86,  // Niv 9 : Poussoir ergonomique haute capacité
  98,  // Niv 10 : Traîneau de déneigement double main
  112, // Niv 11 : Racleuse sur roues profilée
  126, // Niv 12 : Fraiseuse à neige thermique
  142, // Niv 13 : Lame orientable quad / ATV
  160, // Niv 14 : Chasse-neige tracteur alpin
  180, // Niv 15 : Étrave en V pour pick-up 4x4
  202, // Niv 16 : Lame autoroutière aérodynamique
  226, // Niv 17 : Super-étrave de camion suisse
  252, // Niv 18 : Lame panoramique dameuse PistenBully
  280, // Niv 19 : Turbo-blower aéroportuaire monstre
  310  // Niv 20 : TITAN POLAIRE APEX (Bouclier Cryo-Plasma)
];

export function shovelWidth(level) {
  const idx = Math.max(0, Math.min(level - 1, SHOVEL_WIDTHS.length - 1));
  return SHOVEL_WIDTHS[idx];
}

export function shovelRadius(level) {
  // Rayon équivalent en tuiles (pour rétrocompatibilité)
  return Math.round(shovelWidth(level) / 16);
}

// Coûts exponentiels progressifs pour les 20 pelles
const SHOVEL_COSTS = [
  0,          // Niv 1 (départ)
  50,         // Niv 1 → 2
  140,        // Niv 2 → 3
  350,        // Niv 3 → 4
  850,        // Niv 4 → 5
  2000,       // Niv 5 → 6
  4800,       // Niv 6 → 7
  11000,      // Niv 7 → 8
  25000,      // Niv 8 → 9
  55000,      // Niv 9 → 10
  120000,     // Niv 10 → 11
  260000,     // Niv 11 → 12
  580000,     // Niv 12 → 13
  1300000,    // Niv 13 → 14
  3000000,    // Niv 14 → 15
  7000000,    // Niv 15 → 16
  16000000,   // Niv 16 → 17
  38000000,   // Niv 17 → 18
  90000000,   // Niv 18 → 19
  220000000,  // Niv 19 → 20
];

export function shovelCost(level) {
  if (level >= SHOVEL_MAX) return null;
  return SHOVEL_COSTS[level] ?? null;
}

// Gains (1..15)
const RATIO_COSTS = [
  0,
  80,
  240,
  700,
  2000,
  5500,
  15000,
  42000,
  115000,
  310000,
  850000,
  2300000,
  6200000,
  17000000,
  45000000
];

export function ratioCost(level) {
  if (level >= RATIO_MAX) return null;
  return RATIO_COSTS[level] ?? null;
}

export function coinRatio(state) {
  // Multiplicateur de gains : démarre à 0.1, monte progressivement
  return 0.1 * Math.pow(1.5, state.ratioLevel - 1);
}

// Skieurs
export function skierUnlockCost() {
  return 300;
}

// Nombre de skieurs (0..10)
const SPAWN_RATE_COSTS = [
  350,
  900,
  2400,
  6500,
  18000,
  50000,
  140000,
  400000,
  1200000,
  3500000
];

export function spawnRateCost(level) {
  if (level >= SPAWN_RATE_MAX) return null;
  return SPAWN_RATE_COSTS[level] ?? null;
}

export function skierCount(state) {
  return state.skierUnlocked ? (1 + state.spawnRateLevel) : 0;
}

// Vitesse / Recharge spawn skieur (0..10)
const SPAWN_TIME_COSTS = [
  200,
  500,
  1200,
  3000,
  7500,
  19000,
  48000,
  120000,
  320000,
  850000
];

export function spawnTimeCost(level) {
  if (level >= SPAWN_TIME_MAX) return null;
  return SPAWN_TIME_COSTS[level] ?? null;
}

export function spawnCooldown(state) {
  // De 25s à 2s
  return Math.max(2, Math.round(25 - state.spawnTimeLevel * 2.3));
}

export function skierSpeed(state) {
  return 4.5 + state.spawnTimeLevel * 0.4;
}
