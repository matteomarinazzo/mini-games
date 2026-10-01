/**
 * Constantes partagées du jeu (aucune logique ici).
 * Toute valeur de règle (limites, libellés, niveaux de difficulté) vit ici
 * afin de n'être définie qu'à un seul endroit.
 */
export const GAME_ID = 'mon-jeu';
export const GAME_TITLE = 'The Race Manager';
export const SCHEMA_VERSION = 6;
export const SEASON = 2026;
export const START_DATE = '2026-01-01';
export const SLOT_COUNT = 3;
export const PLAYER_TEAM_ID = 'player-team';
export const STORAGE_PREFIX = 'miniGames.race-manager';
export const MAX_IMPORT_BYTES = 1_000_000; // 1 Mo : une sauvegarde V1 fait ~15 Ko

// Notes (pilotes et départements) : toujours entre 50 et 100 inclus.
export const RATING_MIN = 50;
export const RATING_MAX = 100;

// Budget de départ, en millions.
export const BUDGET_MIN = 2;
export const BUDGET_MAX = 25;
export const BUDGET_STEP = 0.5;

export const TEAM_NAME_MIN = 3;
export const TEAM_NAME_MAX = 24;

/** Noms interdits (comparaison insensible à la casse, aux espaces, aux tirets et aux accents). */
export const RESERVED_TEAM_NAMES = [
  'Ferrari', 'McLaren', 'Alpine', 'Mercedes', 'Cadillac', 'Haas', 'Williams',
  'Aston', 'Martin', 'Red Bull', 'Redbull', 'Racing Bulls', 'Audi',
];

export const STAT_KEYS = ['start', 'aggression', 'overtaking', 'attack', 'raceManagement', 'qualifying', 'tyres'];
export const STAT_LABELS = {
  start: 'Départ',
  aggression: 'Agressivité',
  overtaking: 'Dépassement',
  attack: 'Attaque',
  raceManagement: 'Gestion de course',
  qualifying: 'Gestion des qualifications',
  tyres: 'Gestion des pneus',
};

export const DEPT_KEYS = ['aero', 'chassis', 'power'];
export const DEPT_LABELS = { aero: 'Aérodynamique', chassis: 'Châssis', power: 'Puissance moteur' };

export const CATEGORIES = { F1: 'F1', F2: 'F2', F3: 'F3', ancien: 'Ancien pilote', autre: 'Autre' };

/** Palette prédéfinie (noms affichés à côté des pastilles : la couleur n'est jamais le seul signal). */
export const PALETTE = [
  { name: 'Rouge', value: '#e63946' },
  { name: 'Orange', value: '#ff8a1f' },
  { name: 'Jaune', value: '#ffc21a' },
  { name: 'Vert', value: '#2ecc71' },
  { name: 'Turquoise', value: '#1fc7c0' },
  { name: 'Bleu', value: '#3b82f6' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Rose', value: '#ff5fa2' },
];

/** Note de départ des départements (base ± un léger écart selon le nom de l'écurie). */
export const START_LEVELS = {
  low: { label: 'Facile', base: 80, description: 'Note moyenne des départements autour de 80. Une écurie déjà compétitive.' },
  medium: { label: 'Normale', base: 70, description: 'Note moyenne des départements autour de 70. Un départ équilibré.' },
  high: { label: 'Difficile', base: 60, description: 'Note moyenne des départements autour de 60. Vous partez de loin.' },

};

/** Difficulté d'amélioration : enregistrée dès la V1, appliquée à partir de la V2. */
export const UPGRADE_LEVELS = {
  easy: { label: 'Facile', costMultiplier: 0.8, description: 'Améliorations 20 % moins chères (effet appliqué à partir de la V2).' },
  normal: { label: 'Normale', costMultiplier: 1, description: 'Coût des améliorations standard (effet appliqué à partir de la V2).' },
  hard: { label: 'Difficile', costMultiplier: 1.3, description: 'Améliorations 30 % plus chères (effet appliqué à partir de la V2).' },
};

/** Règles V2 de progression : les notes pilotes restent décimales en sauvegarde. */
export const TRAINING_GAIN = 0.12;
export const UPGRADE_DURATION_DAYS = 3;

export const TYRE_COMPOUNDS = ['soft', 'medium', 'hard', 'intermediate', 'wet'];
export const TYRE_LABELS = { soft: 'Soft', medium: 'Medium', hard: 'Hard', intermediate: 'Intermediate', wet: 'Wet' };
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

/**
 * V4.1 — Données de simulation des pneus.
 *   gripPenaltyMs : temps additionnel par tour (ms) vs le composé le plus rapide (soft).
 *                   Soft = 0 (référence), medium = +250ms, hard = +550ms.
 *   wearRate      : % d'état perdu par tour (avant multiplicateurs circuit/rythme).
 *   cliff         : seuil d'état (%) en-dessous duquel la performance chute fortement.
 */
export const TYRE_DATA = {
  soft: { gripPenaltyMs: 0, wearRate: 2.8, cliff: 30 },
  medium: { gripPenaltyMs: 250, wearRate: 1.9, cliff: 22 },
  hard: { gripPenaltyMs: 550, wearRate: 1.2, cliff: 15 },
  intermediate: { gripPenaltyMs: 800, wearRate: 1.6, cliff: 20 },
  wet: { gripPenaltyMs: 1200, wearRate: 1.3, cliff: 15 },
};

/** Multiplicateur de rythme sur l'usure et les probabilités d'incident. */
export const PACE_MULTIPLIERS = {
  cautious: { wear: 0.82, incident: 0.6, lapTimeFactor: 1.008 },
  balanced: { wear: 1.00, incident: 1.0, lapTimeFactor: 1.000 },
  aggressive: { wear: 1.22, incident: 1.5, lapTimeFactor: 0.993 },
};

/** Temps de base d'un arrêt aux stands (en secondes, hors temps de passage dans la voie). */
export const PIT_STOP_BASE = 2.2;
/** Variance aléatoire max sur un arrêt (en secondes). */
export const PIT_STOP_VARIANCE = 0.5;
/** Pénalité si deux pilotes de la même écurie passent au stand au même tour (en secondes). */
export const DOUBLE_STACK_PENALTY = 3.0;

/** Pénalité de temps (en secondes) ajoutée au total si la règle des 2 composés n'est pas respectée en conditions sèches. */
export const COMPOUND_RULE_PENALTY_SECONDS = 30;

/** Nombre minimum de composés secs différents requis en course sèche. */
export const MIN_DRY_COMPOUNDS = 2;

/**
 * V4.1 — Seuil de risque de crevaison.
 * En-dessous de ce % d'état restant, le risque de crevaison augmente progressivement.
 * La valeur 30 signifie : à partir de 30% d'état restant (= 70% d'usure), le risque monte.
 */
export const PUNCTURE_THRESHOLD = 30;

/**
 * V4.1 — Pénalité d'usure au-delà du cliff.
 * Quand l'état du pneu tombe sous le cliff, on ajoute cette pénalité en ms
 * multipliée par le ratio de dégradation (0 au cliff → max à 0%).
 */
export const CLIFF_PENALTY_MAX_MS = 3000;


