/**
 * DONNÉES DE RÉFÉRENCE — pilotes disponibles au départ (lecture seule, objets gelés).
 *
 * ⚠ À VÉRIFIER / COMPLÉTER par le propriétaire du site :
 *   - la composition de la grille F1 2026 est issue de mes connaissances (fin juin 2026) ;
 *   - l'âge est approximatif (2026 − année de naissance) ;
 *   - les statistiques, potentiels, prix et salaires sont des ESTIMATIONS DE JEU, pas des données officielles ;
 *   - les pilotes marqués `fictional: true` (F2, F3, réserve) sont inventés pour compléter la liste.
 *
 * Ordre des statistiques dans les tableaux : départ, agressivité, dépassement, attaque,
 * gestion de course, gestion des qualifications, gestion des pneus.
 * Prix (`cost`) : coût de recrutement en millions. `salary` : salaire annuel en millions.
 * La note globale n'est JAMAIS stockée ici : voir driverOverall() dans core/validation.js.
 *
 * `loyalty` (0–100) : probabilité qu'un pilote refuse de quitter son équipe actuelle.
 *   - ≥ 70 : fidèle — très difficile à débaucher (Norris/Piastri chez McLaren)
 *   - 40–69 : neutre — peut être recruté si l'équipe adverse est assez riche
 *   - < 40 : libre — ouvert au marché (pilotes sur contrat court, fin de carrière)
 *
 * Système de transferts V2 : quand le joueur recrute un pilote de F1, son écurie recrute le
 * meilleur pilote disponible qu'elle peut se permettre (coût ≤ recruitingBudget de l'équipe).
 * Si aucun pilote libre ne convient, l'équipe tente de débaucher un pilote d'une autre équipe
 * (condition : loyalty < 50 ET budget suffisant) — déclenchant une cascade de recrutements.
 * En dernier recours : pilotes F2, F3 ou anciens.
 */
import { STAT_KEYS } from '../core/constants.js';
import { deepFreeze } from '../core/utils.js';

/**
 * Factory de pilote.
 * @param {string}   id
 * @param {string}   first
 * @param {string}   last
 * @param {string}   nationality
 * @param {string}   abbr
 * @param {string}   category  'F1' | 'F2' | 'F3' | 'ancien' | 'autre'
 * @param {string|null} teamId
 * @param {number}   cost      Coût de recrutement (M€)
 * @param {number}   salary    Salaire annuel (M€)
 * @param {number}   age
 * @param {number[]} s         7 stats dans l'ordre STAT_KEYS
 * @param {number}   potential 0–100
 * @param {number}   experience Années d'expérience dans la catégorie
 * @param {boolean}  [fictional=false]
 * @param {number}   [loyalty=50]  0-100 : fidélité à son écurie actuelle
 */
const D = (id, first, last, nationality, abbr, category, teamId, cost, salary, age, s, potential, experience, fictional = false, loyalty = 50) => ({
  id,
  firstName: first,
  lastName: last,
  displayName: `${first} ${last}`,
  nationality,
  abbr,
  category,
  teamId,                       // écurie dans la grille de départ, ou null si disponible
  cost,
  salary,
  age,
  stats: Object.fromEntries(STAT_KEYS.map((k, i) => [k, s[i]])),
  potential,
  experience,                   // années d'expérience dans la catégorie
  available: teamId === null,
  fictional,
  loyalty,                      // 0-100 : attrait pour son équipe actuelle (null = libre de tout contrat)
});

export const DRIVERS_2026 = deepFreeze([
  // --- F1 : grille de départ (22 pilotes) ---
  // loyalty : 85 = icône de l'écurie, 40 = peut partir, 20 = contrat précaire
  //                                                                                                                             fictional  loyalty
  D('russell',    'George',   'Russell',    'GBR', 'RUS', 'F1', 'mercedes',    14,   6,   28, [88, 84, 86, 87, 90, 92, 88], 90, 5,  false, 60),
  D('antonelli',  'Kimi',     'Antonelli',  'ITA', 'ANT', 'F1', 'mercedes',    9,    3,   20, [86, 82, 84, 86, 80, 86, 78], 96, 1,  false, 70), // jeune prospect Mercedes
  D('leclerc',    'Charles',  'Leclerc',    'MON', 'LEC', 'F1', 'ferrari',     16,   7,   29, [86, 88, 87, 92, 84, 96, 80], 92, 8,  false, 80), // pilier Ferrari
  D('hamilton',   'Lewis',    'Hamilton',   'GBR', 'HAM', 'F1', 'ferrari',     17,   8,   41, [90, 84, 92, 90, 95, 88, 94], 90, 19, false, 55), // a fait son choix mais en fin de carrière
  D('norris',     'Lando',    'Norris',     'GBR', 'NOR', 'F1', 'mclaren',     15,   7,   27, [88, 82, 86, 90, 88, 94, 86], 93, 7,  false, 85), // très attaché à McLaren
  D('piastri',    'Oscar',    'Piastri',    'AUS', 'PIA', 'F1', 'mclaren',     14,   6,   25, [86, 80, 88, 89, 90, 91, 88], 95, 4,  false, 80), // élève de McLaren
  D('verstappen', 'Max',      'Verstappen', 'NED', 'VER', 'F1', 'redbull',     20,  10,   29, [95, 92, 96, 97, 96, 97, 90], 97, 11, false, 40), // a failli partir, peut être recruté
  D('hadjar',     'Isack',    'Hadjar',     'FRA', 'HAD', 'F1', 'redbull',     5,  1.5,   22, [80, 82, 80, 80, 74, 80, 72], 90, 2,  false, 65), // contrat RB junior
  D('lawson',     'Liam',     'Lawson',     'NZL', 'LAW', 'F1', 'racingbulls', 5,  1.5,   24, [82, 84, 80, 78, 76, 78, 76], 86, 3,  false, 45), // cherche mieux
  D('lindblad',   'Arvid',    'Lindblad',   'GBR', 'LIN', 'F1', 'racingbulls', 3.5,  1,   19, [78, 78, 76, 76, 70, 78, 68], 94, 1,  false, 60),
  D('alonso',     'Fernando', 'Alonso',     'ESP', 'ALO', 'F1', 'aston',       12,   6,   45, [96, 90, 95, 88, 94, 86, 96], 88, 22, false, 50), // légende, moteur propre
  D('stroll',     'Lance',    'Stroll',     'CAN', 'STR', 'F1', 'aston',       5,    2,   27, [78, 80, 74, 75, 76, 74, 76], 78, 9,  false, 90), // fils du proprio, intransférable
  D('gasly',      'Pierre',   'Gasly',      'FRA', 'GAS', 'F1', 'alpine',      7,    3,   30, [84, 82, 86, 84, 84, 82, 82], 84, 8,  false, 45), // ouvert au changement
  D('colapinto',  'Franco',   'Colapinto',  'ARG', 'COL', 'F1', 'alpine',      4.5,  1,   23, [80, 82, 80, 80, 74, 78, 74], 88, 2,  false, 55),
  D('albon',      'Alexander','Albon',      'THA', 'ALB', 'F1', 'williams',    8,    3,   30, [84, 80, 88, 84, 86, 84, 88], 84, 6,  false, 65), // renouveau Williams
  D('sainz',      'Carlos',   'Sainz',      'ESP', 'SAI', 'F1', 'williams',    11,   5,   32, [86, 80, 86, 86, 90, 88, 90], 86, 11, false, 35), // a déjà changé plusieurs fois
  D('ocon',       'Esteban',  'Ocon',       'FRA', 'OCO', 'F1', 'haas',        6,    2.5, 30, [82, 84, 82, 80, 82, 80, 82], 82, 9,  false, 40), // cherche une meilleure place
  D('bearman',    'Oliver',   'Bearman',    'GBR', 'BEA', 'F1', 'haas',        5.5,  1.5, 21, [80, 80, 82, 82, 76, 84, 76], 92, 2,  false, 60), // montante, contrat en cours
  D('hulkenberg', 'Nico',     'Hülkenberg', 'GER', 'HUL', 'F1', 'audi',        6,    2.5, 39, [82, 78, 82, 80, 86, 90, 84], 80, 14, false, 30), // vétéran, peu attaché
  D('bortoleto',  'Gabriel',  'Bortoleto',  'BRA', 'BOR', 'F1', 'audi',        4.5,  1,   22, [80, 80, 78, 80, 74, 82, 72], 90, 2,  false, 55),
  D('perez',      'Sergio',   'Pérez',      'MEX', 'PER', 'F1', 'cadillac',    6,    3,   36, [80, 84, 84, 80, 90, 76, 90], 80, 15, false, 45), // en fin de contrat
  D('bottas',     'Valtteri', 'Bottas',     'FIN', 'BOT', 'F1', 'cadillac',    4.5,  2,   37, [84, 76, 78, 78, 84, 82, 86], 78, 13, false, 25), // content de signer n'importe où

  // --- Anciens pilotes (disponibles, loyalty = 0 car sans écurie) ---
  D('vettel',     'Sebastian','Vettel',     'GER', 'VET', 'ancien', null,      10,   4,   39, [88, 86, 88, 90, 92, 90, 92], 80, 16, false, 0),
  D('raikkonen',  'Kimi',     'Räikkönen',  'FIN', 'RAI', 'ancien', null,      8,    3,   47, [90, 82, 84, 86, 88, 84, 90], 75, 19, false, 0),
  D('button',     'Jenson',   'Button',     'GBR', 'BUT', 'ancien', null,      6,    2.5, 46, [86, 74, 80, 80, 88, 80, 92], 74, 17, false, 0),
  D('ricciardo',  'Daniel',   'Ricciardo',  'AUS', 'RIC', 'ancien', null,      5.5,  2.5, 37, [84, 88, 90, 82, 80, 78, 82], 76, 14, false, 0),

  // --- F2 (fictifs, disponibles) ---
  D('f2-mercier', 'Lucas',    'Mercier',    'FRA', 'LME', 'F2', null,          2.5,  0.5, 21, [74, 74, 72, 74, 70, 76, 70], 88, 2,  true,  0),
  D('f2-herrera', 'Tomás',    'Herrera',    'ESP', 'THE', 'F2', null,          2,    0.5, 22, [72, 76, 74, 72, 68, 72, 70], 84, 3,  true,  0),
  D('f2-brooks',  'Aiden',    'Brooks',     'GBR', 'ABR', 'F2', null,          2,    0.5, 20, [70, 72, 72, 74, 66, 74, 66], 90, 1,  true,  0),
  D('f2-conti',   'Matteo',   'Conti',      'ITA', 'MCO', 'F2', null,          1.5,  0.4, 23, [72, 70, 70, 70, 72, 70, 72], 80, 4,  true,  0),
  D('f2-okafor',  'Kwame',    'Okafor',     'GHA', 'KOK', 'F2', null,          1.5,  0.4, 21, [70, 72, 68, 70, 68, 72, 68], 82, 2,  true,  0),
  D('f2-lefevre', 'Antoine',  'Lefèvre',    'FRA', 'ALE', 'F2', null,          1.5,  0.4, 22, [68, 70, 70, 70, 66, 74, 66], 80, 2,  true,  0),

  // --- F3 (fictifs, disponibles) ---
  D('f3-keller',  'Noah',     'Keller',     'SUI', 'NKE', 'F3', null,          1,    0.2, 19, [66, 68, 66, 66, 62, 68, 62], 90, 1,  true,  0),
  D('f3-roy',     'Ethan',    'Roy',        'CAN', 'ERO', 'F3', null,          0.8,  0.2, 19, [64, 66, 64, 66, 60, 66, 62], 86, 1,  true,  0),
  D('f3-mori',    'Kenji',    'Mori',       'JPN', 'KMO', 'F3', null,          0.8,  0.2, 20, [64, 62, 66, 64, 64, 64, 66], 84, 2,  true,  0),
  D('f3-duarte',  'Sofia',    'Duarte',     'POR', 'SDU', 'F3', null,          0.5,  0.1, 18, [62, 64, 62, 62, 60, 66, 60], 88, 1,  true,  0),
]);
