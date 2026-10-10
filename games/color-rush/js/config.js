// ─── CONFIG.JS ──────────────────────────────────────────────────────────────
// Tous les réglages « équilibrage » de Color Rush au même endroit.
// (Les cartes sont dans maps.js, la sauvegarde dans storage.js.)

export const CONFIG = {
    baseSize: 5,        // base de départ : 5×5 cellules, identique pour tous les cubes
    baseGap: 7,         // vide minimal (en cellules) entre deux bases au placement
    playerSpeed: 9,     // vitesse du joueur (cellules / seconde)
    playerTurnRate: 10, // vitesse de rotation max du joueur (rad/s) : évite les demi-tours instantanés
    aiSpeed: 8,         // vitesse moyenne des IA (légèrement < joueur)
    aiMin: 10,          // nombre d'IA minimum
    aiMax: 30,          // nombre d'IA maximum
    cellsPerAi: 300,    // 1 IA par tranche de 300 cellules jouables (puis borné entre aiMin et aiMax)
    ownTrailGrace: 4,   // les 4 dernières cellules de sa propre traînée ne tuent pas (virages serrés)
    cubeHalf: 0.4,      // demi-taille de collision du cube avec les bordures (en cellules)
    zoomCells: 36,      // nombre de cellules visibles sur la plus petite dimension de l'écran
    step: 1 / 60,       // pas fixe de simulation (s)
    aiHuntRange: 5,         // une IA ne repère la traînée d'une AUTRE IA qu'à ≤ 5 cellules (elles s'entre-tuent peu)
    aiHuntRangePlayer: 36,  // … mais celle du JOUEUR à ≤ 36 cellules (Manhattan)
    aiAggroMin: 0.6,        // chaque IA a une agressivité aléatoire entre 0.6 et 1 (proba de chasser à chaque cellule)
    aiGraceTime: 3,         // secondes sans chasse au début de la partie
    aiMaxHunters: 4,        // nb max d'IA qui traquent le joueur en même temps
    aiHuntBoost: 1.1,       // multiplicateur de vitesse d'une IA qui traque le joueur
    aiMaxTrail: 45,     // une IA rentre au bercail quand sa traînée dépasse cette longueur
};

// Récompenses : modifiables ici uniquement.
export const REWARDS = {
    coinsPerPercent: 2, // pièces par % de surface possédé juste avant la mort (arrondi à l'inférieur)
    victoryBonus: 500,  // bonus ajouté en cas de victoire (100 %)
};

// Boutique : le premier élément de chaque liste est gratuit et toujours disponible.
export const SKINS = [
    { id: 'cyan', name: 'Cyan', color: '#22d3ee', price: 0 },
    { id: 'rouge', name: 'Rouge', color: '#ef4444', price: 100 },
    { id: 'orange', name: 'Orange', color: '#f97316', price: 100 },
    { id: 'bleu', name: 'Bleu', color: '#3b82f6', price: 150 },
    { id: 'vert', name: 'Vert', color: '#22c55e', price: 200 },
    { id: 'or', name: 'Or', color: '#facc15', price: 200 },
    { id: 'citron', name: 'Citron', color: '#a3e635', price: 250 },
    { id: 'turquoise', name: 'Turquoise', color: '#14b8a6', price: 250 },
    { id: 'corail', name: 'Corail', color: '#fb7185', price: 300 },
    { id: 'violet', name: 'Violet', color: '#a855f7', price: 300 },
    { id: 'rose', name: 'Rose', color: '#ec4899', price: 300 },
    { id: 'indigo', name: 'Indigo', color: '#6366f1', price: 350 },
    { id: 'menthe', name: 'Menthe', color: '#6ee7b7', price: 400 },
    { id: 'bordeaux', name: 'Bordeaux', color: '#be123c', price: 400 },
    { id: 'magenta', name: 'Magenta', color: '#d946ef', price: 450 },
    { id: 'lavande', name: 'Lavande', color: '#c4b5fd', price: 450 },
    { id: 'bronze', name: 'Bronze', color: '#b45309', price: 500 },
    { id: 'argent', name: 'Argent', color: '#cbd5e1', price: 600 },
    { id: 'neige', name: 'Neige', color: '#f1f5f9', price: 800 },
];

// Effets de peinture (dessinés dans renderer.js → paintCell)
export const EFFECTS = [
    { id: 'none', name: 'Peinture unie', price: 0 },
    { id: 'stripes', name: 'Rayures', price: 100 },
    { id: 'dots', name: 'Pois', price: 100 },
    { id: 'checker', name: 'Damier', price: 300 },
    { id: 'bricks', name: 'Briques', price: 300 },
    { id: 'neon', name: 'Néon', price: 400 },
    { id: 'waves', name: 'Vagues', price: 400 },
    { id: 'stars', name: 'Étoiles', price: 500 },
    { id: 'sparkle', name: 'Étincelles', price: 500 },
    { id: 'candy', name: 'Bonbon', price: 700 },
    { id: 'ocean', name: 'Océan', price: 800 },
    { id: 'fire', name: 'Flammes', price: 1000 },
    { id: 'rainbow', name: 'Arc-en-ciel', price: 1500 },
];

// Objets : accessoires dessinés sur le cube du joueur (renderer.js → drawGear)
export const GEAR = [
    { id: 'none', name: 'Aucun', price: 0 },
    { id: 'shades', name: 'Lunettes', price: 150 },
    { id: 'mustache', name: 'Moustache', price: 200 },
    { id: 'antenna', name: 'Antenne', price: 200 },
    { id: 'cap', name: 'Casquette', price: 300 },
    { id: 'horns', name: 'Cornes', price: 400 },
    { id: 'halo', name: 'Auréole', price: 500 },
    { id: 'crown', name: 'Couronne', price: 1000 },
];
