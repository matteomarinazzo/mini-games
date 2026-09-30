/**
 * Constantes partagées du jeu (aucune logique ici).
 * Toute valeur de règle (limites, libellés, niveaux de difficulté) vit ici
 * afin de n'être définie qu'à un seul endroit.
 */
export const GAME_ID = 'mon-jeu';
export const GAME_TITLE = 'The Race Manager';
export const SCHEMA_VERSION = 3;
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
