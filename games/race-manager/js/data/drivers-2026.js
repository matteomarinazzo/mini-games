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
 * Règle V1 de transition : quand le joueur recrute un pilote engagé dans une écurie, sa place est
 * reprise par le premier pilote « autre » (réserve) libre de cette liste, dans l'ordre du fichier.
 */
import { STAT_KEYS } from '../core/constants.js';
import { deepFreeze } from '../core/utils.js';

const D = (id, first, last, nationality, abbr, category, teamId, cost, salary, age, s, potential, experience, fictional = false) => ({
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
});

export const DRIVERS_2026 = deepFreeze([
  // --- F1 : grille de départ (22 pilotes) ---
  D('russell',    'George',   'Russell',    'GBR', 'RUS', 'F1', 'mercedes',    14,   6,   28, [88, 84, 86, 87, 90, 92, 88], 90, 5),
  D('antonelli',  'Kimi',     'Antonelli',  'ITA', 'ANT', 'F1', 'mercedes',    9,    3,   20, [86, 82, 84, 86, 80, 86, 78], 96, 1),
  D('leclerc',    'Charles',  'Leclerc',    'MON', 'LEC', 'F1', 'ferrari',     16,   7,   29, [86, 88, 87, 92, 84, 96, 80], 92, 8),
  D('hamilton',   'Lewis',    'Hamilton',   'GBR', 'HAM', 'F1', 'ferrari',     17,   8,   41, [90, 84, 92, 90, 95, 88, 94], 90, 19),
  D('norris',     'Lando',    'Norris',     'GBR', 'NOR', 'F1', 'mclaren',     15,   7,   27, [88, 82, 86, 90, 88, 94, 86], 93, 7),
  D('piastri',    'Oscar',    'Piastri',    'AUS', 'PIA', 'F1', 'mclaren',     14,   6,   25, [86, 80, 88, 89, 90, 91, 88], 95, 4),
  D('verstappen', 'Max',      'Verstappen', 'NED', 'VER', 'F1', 'redbull',     20,  10,   29, [95, 92, 96, 97, 96, 97, 90], 97, 11),
  D('hadjar',     'Isack',    'Hadjar',     'FRA', 'HAD', 'F1', 'redbull',     5,  1.5,   22, [80, 82, 80, 80, 74, 80, 72], 90, 2),
  D('lawson',     'Liam',     'Lawson',     'NZL', 'LAW', 'F1', 'racingbulls', 5,  1.5,   24, [82, 84, 80, 78, 76, 78, 76], 86, 3),
  D('lindblad',   'Arvid',    'Lindblad',   'GBR', 'LIN', 'F1', 'racingbulls', 3.5,  1,   19, [78, 78, 76, 76, 70, 78, 68], 94, 1),
  D('alonso',     'Fernando', 'Alonso',     'ESP', 'ALO', 'F1', 'aston',       12,   6,   45, [96, 90, 95, 88, 94, 86, 96], 88, 22),
  D('stroll',     'Lance',    'Stroll',     'CAN', 'STR', 'F1', 'aston',       5,    2,   27, [78, 80, 74, 75, 76, 74, 76], 78, 9),
  D('gasly',      'Pierre',   'Gasly',      'FRA', 'GAS', 'F1', 'alpine',      7,    3,   30, [84, 82, 86, 84, 84, 82, 82], 84, 8),
  D('colapinto',  'Franco',   'Colapinto',  'ARG', 'COL', 'F1', 'alpine',      4.5,  1,   23, [80, 82, 80, 80, 74, 78, 74], 88, 2),
  D('albon',      'Alexander','Albon',      'THA', 'ALB', 'F1', 'williams',    8,    3,   30, [84, 80, 88, 84, 86, 84, 88], 84, 6),
  D('sainz',      'Carlos',   'Sainz',      'ESP', 'SAI', 'F1', 'williams',    11,   5,   32, [86, 80, 86, 86, 90, 88, 90], 86, 11),
  D('ocon',       'Esteban',  'Ocon',       'FRA', 'OCO', 'F1', 'haas',        6,    2.5, 30, [82, 84, 82, 80, 82, 80, 82], 82, 9),
  D('bearman',    'Oliver',   'Bearman',    'GBR', 'BEA', 'F1', 'haas',        5.5,  1.5, 21, [80, 80, 82, 82, 76, 84, 76], 92, 2),
  D('hulkenberg', 'Nico',     'Hülkenberg', 'GER', 'HUL', 'F1', 'audi',        6,    2.5, 39, [82, 78, 82, 80, 86, 90, 84], 80, 14),
  D('bortoleto',  'Gabriel',  'Bortoleto',  'BRA', 'BOR', 'F1', 'audi',        4.5,  1,   22, [80, 80, 78, 80, 74, 82, 72], 90, 2),
  D('perez',      'Sergio',   'Pérez',      'MEX', 'PER', 'F1', 'cadillac',    6,    3,   36, [80, 84, 84, 80, 90, 76, 90], 80, 15),
  D('bottas',     'Valtteri', 'Bottas',     'FIN', 'BOT', 'F1', 'cadillac',    4.5,  2,   37, [84, 76, 78, 78, 84, 82, 86], 78, 13),

  // --- Anciens pilotes (disponibles) ---
  D('vettel',     'Sebastian','Vettel',     'GER', 'VET', 'ancien', null,      10,   4,   39, [88, 86, 88, 90, 92, 90, 92], 80, 16),
  D('raikkonen',  'Kimi',     'Räikkönen',  'FIN', 'RAI', 'ancien', null,      8,    3,   47, [90, 82, 84, 86, 88, 84, 90], 75, 19),
  D('button',     'Jenson',   'Button',     'GBR', 'BUT', 'ancien', null,      6,    2.5, 46, [86, 74, 80, 80, 88, 80, 92], 74, 17),
  D('ricciardo',  'Daniel',   'Ricciardo',  'AUS', 'RIC', 'ancien', null,      5.5,  2.5, 37, [84, 88, 90, 82, 80, 78, 82], 76, 14),

  // --- F2 (fictifs) ---
  D('f2-mercier', 'Lucas',    'Mercier',    'FRA', 'LME', 'F2', null,          2.5,  0.5, 21, [74, 74, 72, 74, 70, 76, 70], 88, 2, true),
  D('f2-herrera', 'Tomás',    'Herrera',    'ESP', 'THE', 'F2', null,          2,    0.5, 22, [72, 76, 74, 72, 68, 72, 70], 84, 3, true),
  D('f2-brooks',  'Aiden',    'Brooks',     'GBR', 'ABR', 'F2', null,          2,    0.5, 20, [70, 72, 72, 74, 66, 74, 66], 90, 1, true),
  D('f2-conti',   'Matteo',   'Conti',      'ITA', 'MCO', 'F2', null,          1.5,  0.4, 23, [72, 70, 70, 70, 72, 70, 72], 80, 4, true),

  // --- F3 (fictifs) ---
  D('f3-keller',  'Noah',     'Keller',     'SUI', 'NKE', 'F3', null,          1,    0.2, 19, [66, 68, 66, 66, 62, 68, 62], 90, 1, true),
  D('f3-roy',     'Ethan',    'Roy',        'CAN', 'ERO', 'F3', null,          0.8,  0.2, 19, [64, 66, 64, 66, 60, 66, 62], 86, 1, true),
  D('f3-mori',    'Kenji',    'Mori',       'JPN', 'KMO', 'F3', null,          0.8,  0.2, 20, [64, 62, 66, 64, 64, 64, 66], 84, 2, true),
  D('f3-duarte',  'Sofia',    'Duarte',     'POR', 'SDU', 'F3', null,          0.5,  0.1, 18, [62, 64, 62, 62, 60, 66, 60], 88, 1, true),

  // --- Pilotes de réserve (fictifs) : servent de remplaçants dans l'ordre ci-dessous ---
  D('res-alpha',   'Réserve', 'Alpha',      'SUI', 'RSA', 'autre', null,       0.3,  0.1, 24, [68, 68, 66, 66, 68, 68, 68], 70, 3, true),
  D('res-bravo',   'Réserve', 'Bravo',      'SUI', 'RSB', 'autre', null,       0.3,  0.1, 25, [68, 66, 66, 68, 66, 68, 66], 70, 3, true),
  D('res-charlie', 'Réserve', 'Charlie',    'SUI', 'RSC', 'autre', null,       0.3,  0.1, 26, [66, 68, 68, 66, 68, 66, 68], 68, 4, true),
  D('res-delta',   'Réserve', 'Delta',      'SUI', 'RSD', 'autre', null,       0.3,  0.1, 27, [66, 66, 66, 66, 66, 66, 66], 68, 4, true),
]);
