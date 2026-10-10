/**
 * Mindplay : Mots – words.js
 *
 * Banque de mots français 100 % locale (aucun dictionnaire, aucune API).
 *
 * Pour l'enrichir : ajoute simplement des mots (en minuscules, au singulier) dans une
 * catégorie existante, ou crée une nouvelle catégorie. Les doublons, les mots trop courts
 * ou trop longs sont filtrés automatiquement (voir MIN_LEN / MAX_LEN).
 * Règles : mots courants, faciles à lire, noms communs, sans nom propre, sans espace ni tiret.
 *
 * Le jeu se charge ensuite d'éviter les mots trop proches (voir areSimilar).
 */

export const MIN_LEN = 3;
export const MAX_LEN = 11;

export const WORD_CATEGORIES = {
    animaux: [
        'chat', 'chien', 'cheval', 'vache', 'mouton', 'cochon', 'poule', 'canard', 'lapin', 'souris',
        'renard', 'loup', 'ours', 'lion', 'tigre', 'singe', 'girafe', 'zèbre', 'éléphant', 'serpent',
        'tortue', 'grenouille', 'poisson', 'requin', 'dauphin', 'baleine', 'crabe', 'pieuvre', 'hibou',
        'aigle', 'pigeon', 'moineau', 'cygne', 'abeille', 'fourmi', 'papillon', 'araignée', 'escargot',
        'cerf', 'sanglier', 'écureuil', 'hérisson', 'chèvre', 'âne', 'kangourou', 'crocodile',
        'perroquet', 'mouche', 'coccinelle', 'hamster', 'dinde', 'oie', 'taureau', 'chameau', 'phoque'
    ],
    nourriture: [
        'pain', 'fromage', 'beurre', 'lait', 'œuf', 'pomme', 'poire', 'banane', 'orange', 'citron',
        'fraise', 'cerise', 'raisin', 'pêche', 'abricot', 'ananas', 'melon', 'tomate', 'carotte',
        'oignon', 'ail', 'salade', 'patate', 'haricot', 'champignon', 'concombre', 'courgette',
        'poivron', 'radis', 'chou', 'épinard', 'riz', 'pâtes', 'soupe', 'gâteau', 'tarte', 'biscuit',
        'chocolat', 'bonbon', 'glace', 'miel', 'confiture', 'sucre', 'sel', 'poivre', 'farine', 'huile',
        'vinaigre', 'jambon', 'saucisse', 'poulet', 'bœuf', 'saumon', 'thon', 'crevette', 'frites',
        'pizza', 'sandwich', 'crêpe', 'croissant', 'baguette', 'yaourt', 'café', 'thé', 'jus', 'eau',
        'vin', 'bière', 'noix', 'amande', 'noisette', 'olive', 'prune', 'framboise', 'myrtille', 'kiwi',
        'mangue', 'sirop', 'moutarde', 'omelette', 'raviolis'
    ],
    maison: [
        'maison', 'porte', 'fenêtre', 'toit', 'mur', 'escalier', 'cuisine', 'chambre', 'salon',
        'jardin', 'garage', 'cave', 'grenier', 'balcon', 'cheminée', 'lit', 'table', 'chaise',
        'fauteuil', 'canapé', 'armoire', 'tiroir', 'étagère', 'miroir', 'tapis', 'rideau', 'lampe',
        'bougie', 'horloge', 'coussin', 'couverture', 'oreiller', 'matelas', 'frigo', 'four', 'évier',
        'robinet', 'douche', 'baignoire', 'serrure', 'clé', 'sonnette', 'volet', 'tuile', 'brique',
        'clôture', 'portail', 'véranda', 'plafond', 'parquet', 'couloir', 'bureau', 'cage'
    ],
    objets: [
        'stylo', 'crayon', 'cahier', 'livre', 'gomme', 'règle', 'ciseaux', 'colle', 'sac', 'valise',
        'parapluie', 'lunettes', 'montre', 'bague', 'collier', 'bracelet', 'clou', 'marteau',
        'tournevis', 'scie', 'échelle', 'seau', 'balai', 'éponge', 'savon', 'brosse', 'peigne',
        'serviette', 'assiette', 'fourchette', 'couteau', 'cuillère', 'verre', 'tasse', 'bol',
        'bouteille', 'casserole', 'poêle', 'panier', 'boîte', 'corde', 'ballon', 'poupée', 'cadeau',
        'carte', 'lettre', 'timbre', 'enveloppe', 'téléphone', 'ordinateur', 'clavier', 'écran',
        'radio', 'télévision', 'caméra', 'pile', 'ampoule', 'prise', 'câble', 'chargeur', 'aiguille',
        'fil', 'bouton', 'ficelle', 'tonneau', 'pinceau', 'ruban', 'drapeau', 'tente', 'cloche',
        'lime', 'pelle', 'râteau', 'hache', 'filet'
    ],
    nature: [
        'arbre', 'fleur', 'herbe', 'feuille', 'forêt', 'montagne', 'rivière', 'lac', 'mer', 'océan',
        'plage', 'sable', 'rocher', 'pierre', 'île', 'vallée', 'colline', 'désert', 'volcan',
        'cascade', 'nuage', 'pluie', 'neige', 'vent', 'orage', 'soleil', 'lune', 'étoile', 'ciel',
        'brouillard', 'tempête', 'éclair', 'tulipe', 'marguerite', 'sapin', 'chêne', 'palmier',
        'champ', 'prairie', 'ruisseau', 'source', 'falaise', 'grotte', 'buisson', 'mousse', 'racine',
        'branche', 'bois', 'étang', 'marais', 'glacier', 'rosée'
    ],
    corps: [
        'tête', 'main', 'pied', 'bras', 'jambe', 'doigt', 'genou', 'coude', 'épaule', 'dos', 'ventre',
        'cou', 'nez', 'bouche', 'oreille', 'œil', 'dent', 'langue', 'joue', 'front', 'cheveu',
        'barbe', 'ongle', 'peau', 'cœur', 'poumon', 'cerveau', 'visage', 'menton', 'sourcil',
        'poignet', 'cheville', 'lèvre', 'orteil'
    ],
    vetements: [
        'chemise', 'pantalon', 'robe', 'jupe', 'manteau', 'veste', 'pull', 'chapeau', 'casquette',
        'bonnet', 'écharpe', 'gant', 'chaussette', 'chaussure', 'botte', 'sandale', 'cravate',
        'ceinture', 'maillot', 'short', 'blouson', 'pyjama', 'tablier', 'foulard', 'imperméable',
        'costume', 'mouchoir', 'sabot', 'basket', 'poche', 'collant'
    ],
    transports: [
        'voiture', 'vélo', 'moto', 'bus', 'train', 'avion', 'bateau', 'camion', 'tracteur',
        'tramway', 'métro', 'taxi', 'fusée', 'hélicoptère', 'ambulance', 'trottinette', 'barque',
        'voilier', 'péniche', 'navire', 'wagon', 'gare', 'aéroport', 'quai', 'pont', 'route',
        'tunnel', 'carrefour', 'autoroute', 'trottoir', 'parking', 'ancre', 'voile'
    ],
    metiers: [
        'boulanger', 'médecin', 'infirmier', 'pompier', 'facteur', 'boucher', 'maçon', 'plombier',
        'électricien', 'cuisinier', 'serveur', 'coiffeur', 'dentiste', 'avocat', 'juge', 'policier',
        'pilote', 'marin', 'pêcheur', 'fermier', 'jardinier', 'peintre', 'sculpteur', 'musicien',
        'chanteur', 'acteur', 'danseur', 'professeur', 'élève', 'étudiant', 'soldat', 'roi', 'reine',
        'prince', 'chevalier', 'pirate', 'clown', 'magicien', 'berger', 'forgeron', 'tailleur',
        'sorcier', 'astronaute'
    ],
    lieux: [
        'ville', 'village', 'rue', 'place', 'église', 'école', 'mairie', 'hôpital', 'pharmacie',
        'boulangerie', 'librairie', 'banque', 'musée', 'théâtre', 'cinéma', 'stade', 'piscine',
        'marché', 'magasin', 'supermarché', 'hôtel', 'restaurant', 'château', 'ferme', 'moulin',
        'phare', 'cabane', 'prison', 'usine', 'cirque', 'zoo', 'parc', 'fontaine', 'statue', 'tour',
        'monument', 'cimetière', 'port', 'camping'
    ],
    ecole: [
        'classe', 'tableau', 'cartable', 'leçon', 'dictée', 'devoir', 'examen', 'note', 'trousse',
        'maître', 'récréation', 'cantine', 'alphabet', 'atlas', 'problème', 'cours'
    ],
    sports_jeux: [
        'football', 'tennis', 'rugby', 'natation', 'golf', 'boxe', 'judo', 'danse', 'course', 'saut',
        'ski', 'patin', 'balle', 'raquette', 'arbitre', 'équipe', 'match', 'médaille', 'trophée',
        'piste', 'échecs', 'puzzle', 'jouet', 'toupie', 'billes', 'domino', 'loto', 'cerceau'
    ],
    arts: [
        'guitare', 'piano', 'violon', 'flûte', 'tambour', 'trompette', 'harpe', 'chanson', 'mélodie',
        'orchestre', 'concert', 'opéra', 'dessin', 'peinture', 'sculpture', 'couleur', 'film',
        'histoire', 'conte', 'poème', 'roman', 'journal', 'magazine', 'affiche', 'photo'
    ],
    couleurs: [
        'rouge', 'bleu', 'vert', 'jaune', 'violet', 'noir', 'blanc', 'gris', 'marron', 'argent'
    ],
    famille: [
        'père', 'mère', 'frère', 'sœur', 'fils', 'fille', 'oncle', 'tante', 'cousin', 'voisin', 'ami',
        'bébé', 'enfant', 'garçon', 'homme', 'femme', 'copain', 'jumeau'
    ],
    temps: [
        'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'janvier', 'février',
        'avril', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
        'printemps', 'été', 'automne', 'hiver', 'matin', 'soir', 'nuit', 'minute', 'heure', 'semaine',
        'saison'
    ],
    fantaisie: [
        'dragon', 'fée', 'géant', 'sorcière', 'fantôme', 'trésor', 'épée', 'bouclier', 'couronne',
        'licorne', 'robot', 'planète', 'comète', 'galaxie', 'aventure', 'secret', 'mystère',
        'lanterne', 'boussole', 'labyrinthe', 'tonnerre', 'baguette', 'potion', 'miroir'
    ]
};

// ─────────────────────────────────────────────
// Outils
// ─────────────────────────────────────────────

/** Forme normalisée : minuscules, sans accents, œ → oe (sert aux comparaisons). */
export function normalize(w) {
    return w.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function editDistance(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}

/**
 * Deux mots sont « trop proches » s'ils pourraient prêter à confusion :
 * même forme sans accents, singulier / pluriel, même début (4 lettres ou plus),
 * ou une ou deux lettres de différence.
 */
export function areSimilar(a, b) {
    if (a === b) return true;
    if (a.startsWith(b) || b.startsWith(a)) return true;
    let p = 0;
    const m = Math.min(a.length, b.length);
    while (p < m && a[p] === b[p]) p++;
    if (p >= 4) return true;
    const d = editDistance(a, b);
    return d <= 1 || (d <= 2 && a.length >= 7 && b.length >= 7);
}

/** Liste plate dédoublonnée : [{ w: 'éléphant', n: 'elephant' }, …] */
export const WORD_ENTRIES = (() => {
    const seen = new Set();
    const out = [];
    for (const list of Object.values(WORD_CATEGORIES)) {
        for (const w of list) {
            const n = normalize(w);
            if (n.length < MIN_LEN || n.length > MAX_LEN || /[^a-z]/.test(n) || seen.has(n)) continue;
            seen.add(n);
            out.push({ w, n });
        }
    }
    return out;
})();
