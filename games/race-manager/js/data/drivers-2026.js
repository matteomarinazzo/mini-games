/**
 * DONNÉES DE RÉFÉRENCE — pilotes disponibles au départ (lecture seule, objets gelés).
 *
 * Sources et niveau de fiabilité (état au 7 octobre 2026) :
 *   - Grille F1 2026 : vérifiée (liste d'engagés FIA / formula1.com). Remplacements ponctuels
 *     en cours de saison (ex. Lawson/Tsunoda) NON reproduits : on garde la grille de départ.
 *   - Grille F2 2026 : les 22 pilotes titulaires de la grille de départ (fiaformula2.com + Wikipedia).
 *   - Grille F3 2026 : les 30 pilotes de la grille de départ (fiaformula3.com + Wikipedia).
 *     Les remplaçants ponctuels (Heuzenroeder, Escotto, Hanna, Powell, Maccagnani) sont omis.
 *   - Anciens pilotes : pilotes ayant réellement disputé des Grands Prix de F1.
 *   - Nationalités et équipes : vérifiées. Les ÂGES (2026 − année de naissance), surtout en F2/F3,
 *     et les années d'expérience sont à ±1 an près ; à ajuster si besoin.
 *   - Statistiques, potentiels, prix et salaires : ESTIMATIONS DE JEU, pas des données officielles.
 *
 * Aucun pilote fictif : `fictional` est conservé à `false` pour ne pas casser le code existant.
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
 * @param {string}   abbr         3 lettres, unique dans tout le fichier
 * @param {string}   category     'F1' | 'F2' | 'F3' | 'ancien' | 'autre'
 * @param {string|null} teamId    écurie F1 dans la grille de départ, ou null si disponible
 * @param {number}   cost         Coût de recrutement (M€)
 * @param {number}   salary       Salaire annuel (M€)
 * @param {number}   age
 * @param {number[]} s            7 stats dans l'ordre STAT_KEYS
 * @param {number}   potential    0–100
 * @param {number}   experience   Saisons déjà disputées dans la catégorie
 * @param {number}   [loyalty=50] 0-100 : fidélité à son écurie actuelle
 */
const D = (id, first, last, nationality, abbr, category, teamId, cost, salary, age, s, potential, experience, loyalty = 50) => ({
    id,
    firstName: first,
    lastName: last,
    displayName: `${first} ${last}`,
    nationality,
    abbr,
    category,
    teamId,
    cost,
    salary,
    age,
    stats: Object.fromEntries(STAT_KEYS.map((k, i) => [k, s[i]])),
    potential,
    experience,
    available: teamId === null,
    fictional: false,             // conservé pour compatibilité : plus aucun pilote fictif
    loyalty,
});

export const DRIVERS_2026 = deepFreeze([
    // --- F1 : grille de départ 2026 (22 pilotes) ---
    // loyalty : 85 = icône de l'écurie, 40 = peut partir, 20 = contrat précaire
    D('russell', 'George', 'Russell', 'GBR', 'RUS', 'F1', 'mercedes', 14, 6, 28, [88, 84, 86, 87, 90, 92, 88], 90, 7, 60),
    D('antonelli', 'Kimi', 'Antonelli', 'ITA', 'ANT', 'F1', 'mercedes', 9, 3, 20, [86, 82, 84, 86, 80, 86, 78], 96, 1, 70), // jeune prospect Mercedes
    D('leclerc', 'Charles', 'Leclerc', 'MON', 'LEC', 'F1', 'ferrari', 16, 7, 29, [86, 88, 87, 92, 84, 96, 80], 92, 8, 80), // pilier Ferrari
    D('hamilton', 'Lewis', 'Hamilton', 'GBR', 'HAM', 'F1', 'ferrari', 17, 8, 41, [90, 84, 92, 90, 95, 88, 94], 90, 19, 55), // fin de carrière
    D('norris', 'Lando', 'Norris', 'GBR', 'NOR', 'F1', 'mclaren', 15, 7, 27, [88, 82, 86, 90, 88, 94, 86], 93, 7, 85), // très attaché à McLaren
    D('piastri', 'Oscar', 'Piastri', 'AUS', 'PIA', 'F1', 'mclaren', 14, 6, 25, [86, 80, 88, 89, 90, 91, 88], 95, 3, 80), // élève de McLaren
    D('verstappen', 'Max', 'Verstappen', 'NED', 'VER', 'F1', 'redbull', 20, 10, 29, [95, 92, 96, 97, 96, 97, 90], 97, 11, 40), // peut être recruté
    D('hadjar', 'Isack', 'Hadjar', 'FRA', 'HAD', 'F1', 'redbull', 5, 1.5, 22, [80, 82, 80, 80, 74, 80, 72], 90, 1, 65), // contrat RB junior
    D('lawson', 'Liam', 'Lawson', 'NZL', 'LAW', 'F1', 'racingbulls', 5, 1.5, 24, [82, 84, 80, 78, 76, 78, 76], 86, 2, 45), // cherche mieux
    D('lindblad', 'Arvid', 'Lindblad', 'GBR', 'LIN', 'F1', 'racingbulls', 3.5, 1, 19, [78, 78, 76, 76, 70, 78, 68], 94, 0, 60), // rookie 2026
    D('alonso', 'Fernando', 'Alonso', 'ESP', 'ALO', 'F1', 'aston', 12, 6, 45, [96, 90, 95, 88, 94, 86, 96], 88, 22, 50), // légende
    D('stroll', 'Lance', 'Stroll', 'CAN', 'STR', 'F1', 'aston', 5, 2, 28, [78, 80, 74, 75, 76, 74, 76], 78, 9, 90), // fils du proprio, intransférable
    D('gasly', 'Pierre', 'Gasly', 'FRA', 'GAS', 'F1', 'alpine', 7, 3, 30, [84, 82, 86, 84, 84, 82, 82], 84, 8, 45), // ouvert au changement
    D('colapinto', 'Franco', 'Colapinto', 'ARG', 'COL', 'F1', 'alpine', 4.5, 1, 23, [80, 82, 80, 80, 74, 78, 74], 88, 2, 55),
    D('albon', 'Alexander', 'Albon', 'THA', 'ALB', 'F1', 'williams', 8, 3, 30, [84, 80, 88, 84, 86, 84, 88], 84, 6, 65), // pilier Williams
    D('sainz', 'Carlos', 'Sainz', 'ESP', 'SAI', 'F1', 'williams', 11, 5, 32, [86, 80, 86, 86, 90, 88, 90], 86, 11, 35), // a déjà changé plusieurs fois
    D('ocon', 'Esteban', 'Ocon', 'FRA', 'OCO', 'F1', 'haas', 6, 2.5, 30, [82, 84, 82, 80, 82, 80, 82], 82, 9, 40), // cherche une meilleure place
    D('bearman', 'Oliver', 'Bearman', 'GBR', 'BEA', 'F1', 'haas', 5.5, 1.5, 21, [80, 80, 82, 82, 76, 84, 76], 92, 2, 60), // montant, contrat en cours
    D('hulkenberg', 'Nico', 'Hülkenberg', 'GER', 'HUL', 'F1', 'audi', 6, 2.5, 39, [82, 78, 82, 80, 86, 90, 84], 80, 14, 30), // vétéran, peu attaché
    D('bortoleto', 'Gabriel', 'Bortoleto', 'BRA', 'BOR', 'F1', 'audi', 4.5, 1, 22, [80, 80, 78, 80, 74, 82, 72], 90, 1, 55),
    D('perez', 'Sergio', 'Pérez', 'MEX', 'PER', 'F1', 'cadillac', 6, 3, 36, [80, 84, 84, 80, 90, 76, 90], 80, 15, 45), // pilote de lancement Cadillac
    D('bottas', 'Valtteri', 'Bottas', 'FIN', 'BOT', 'F1', 'cadillac', 4.5, 2, 37, [84, 76, 78, 78, 84, 82, 86], 78, 13, 25), // content de signer n'importe où

    // --- Anciens pilotes de F1 (disponibles, loyalty = 0 car sans écurie) ---
    D('vettel', 'Sebastian', 'Vettel', 'GER', 'VET', 'ancien', null, 10, 4, 39, [88, 86, 88, 90, 92, 90, 92], 80, 16, 0), // 4x champion du monde
    D('raikkonen', 'Kimi', 'Räikkönen', 'FIN', 'RAI', 'ancien', null, 8, 3, 47, [90, 82, 84, 86, 88, 84, 90], 75, 19, 0), // champion du monde 2007
    D('button', 'Jenson', 'Button', 'GBR', 'BUT', 'ancien', null, 6, 2.5, 46, [86, 74, 80, 80, 88, 80, 92], 74, 17, 0), // champion du monde 2009
    D('ricciardo', 'Daniel', 'Ricciardo', 'AUS', 'RIC', 'ancien', null, 5.5, 2.5, 37, [84, 88, 90, 82, 80, 78, 82], 76, 14, 0),
    D('rosberg', 'Nico', 'Rosberg', 'GER', 'ROS', 'ancien', null, 8, 3, 41, [88, 82, 84, 88, 86, 92, 86], 80, 11, 0), // champion du monde 2016
    D('hakkinen', 'Mika', 'Häkkinen', 'FIN', 'HAK', 'ancien', null, 8, 3, 58, [90, 84, 88, 92, 86, 92, 86], 72, 11, 0), // 2x champion du monde
    D('villeneuve', 'Jacques', 'Villeneuve', 'CAN', 'JVI', 'ancien', null, 6, 2.5, 55, [84, 92, 86, 88, 80, 88, 78], 70, 11, 0), // champion du monde 1997
    D('montoya', 'Juan Pablo', 'Montoya', 'COL', 'JPM', 'ancien', null, 6, 2.5, 51, [88, 92, 90, 90, 76, 88, 76], 72, 6, 0),
    D('webber', 'Mark', 'Webber', 'AUS', 'WEB', 'ancien', null, 5, 2, 50, [84, 80, 84, 82, 86, 88, 84], 76, 12, 0),
    D('massa', 'Felipe', 'Massa', 'BRA', 'MAS', 'ancien', null, 5, 2, 45, [82, 84, 82, 84, 84, 86, 82], 76, 15, 0),
    D('barrichello', 'Rubens', 'Barrichello', 'BRA', 'BAR', 'ancien', null, 5, 2, 54, [82, 76, 82, 80, 90, 82, 88], 74, 19, 0),
    D('magnussen', 'Kevin', 'Magnussen', 'DEN', 'MAG', 'ancien', null, 4, 1.5, 34, [78, 92, 84, 82, 80, 80, 78], 74, 10, 0),
    D('grosjean', 'Romain', 'Grosjean', 'FRA', 'GRO', 'ancien', null, 4, 1.5, 40, [82, 86, 78, 84, 78, 86, 76], 70, 10, 0),
    D('kobayashi', 'Kamui', 'Kobayashi', 'JPN', 'KOB', 'ancien', null, 3, 1, 40, [78, 90, 92, 78, 76, 76, 78], 70, 5, 0),
    D('kvyat', 'Daniil', 'Kvyat', 'RUS', 'KVY', 'ancien', null, 3, 1, 32, [78, 82, 78, 80, 74, 80, 74], 70, 7, 0),
    D('vandoorne', 'Stoffel', 'Vandoorne', 'BEL', 'VAN', 'ancien', null, 2.5, 1, 34, [80, 76, 78, 80, 76, 82, 78], 74, 3, 0),
    D('giovinazzi', 'Antonio', 'Giovinazzi', 'ITA', 'GIO', 'ancien', null, 2.5, 1, 33, [76, 76, 76, 76, 72, 78, 72], 72, 4, 0),
    D('zhou', 'Guanyu', 'Zhou', 'CHN', 'ZHO', 'ancien', null, 2.5, 1, 27, [74, 76, 74, 76, 72, 78, 74], 72, 3, 0),

    // --- F2 : grille de départ 2026 (22 pilotes, disponibles) ---
    D('f2-camara', 'Rafael', 'Câmara', 'BRA', 'CAM', 'F2', null, 3, 0.6, 22, [78, 76, 78, 80, 76, 82, 76], 94, 0, 0), // Invicta, champion F3 2025
    D('f2-durksen', 'Joshua', 'Dürksen', 'PAR', 'DUR', 'F2', null, 1.6, 0.3, 23, [74, 76, 74, 74, 74, 74, 72], 80, 2, 0), // Invicta
    D('f2-miyata', 'Ritomo', 'Miyata', 'JPN', 'MIY', 'F2', null, 1.3, 0.3, 26, [72, 74, 72, 72, 70, 74, 70], 78, 1, 0), // Hitech
    D('f2-herta', 'Colton', 'Herta', 'USA', 'HER', 'F2', null, 1.5, 0.3, 26, [72, 76, 74, 74, 76, 78, 74], 76, 0, 0), // Hitech, ex-IndyCar
    D('f2-leon', 'Noel', 'León', 'MEX', 'LEO', 'F2', null, 1.8, 0.4, 21, [74, 76, 76, 76, 72, 76, 72], 84, 0, 0), // Campos
    D('f2-tsolov', 'Nikola', 'Tsolov', 'BUL', 'TSO', 'F2', null, 3, 0.6, 18, [78, 78, 80, 80, 74, 82, 72], 95, 0, 0), // Campos, Red Bull junior
    D('f2-beganovic', 'Dino', 'Beganovic', 'SWE', 'BEG', 'F2', null, 2.2, 0.4, 23, [78, 74, 78, 76, 78, 80, 78], 86, 1, 0), // DAMS, Ferrari junior
    D('f2-bilinski', 'Roman', 'Bilinski', 'POL', 'BIL', 'F2', null, 1.2, 0.3, 21, [72, 72, 72, 72, 68, 72, 68], 82, 0, 0), // DAMS
    D('f2-mini', 'Gabriele', 'Minì', 'ITA', 'MIN', 'F2', null, 2.2, 0.4, 21, [76, 76, 78, 78, 76, 76, 76], 86, 1, 0), // MP Motorsport
    D('f2-goethe', 'Oliver', 'Goethe', 'GER', 'GOE', 'F2', null, 1.2, 0.3, 22, [72, 72, 72, 74, 70, 72, 70], 80, 1, 0), // MP Motorsport
    D('f2-montoya', 'Sebastián', 'Montoya', 'COL', 'SMO', 'F2', null, 1.2, 0.3, 21, [72, 74, 72, 72, 70, 72, 70], 80, 2, 0), // Prema
    D('f2-boya', 'Mari', 'Boya', 'ESP', 'BOY', 'F2', null, 1.2, 0.3, 21, [72, 72, 74, 72, 70, 74, 70], 82, 0, 0), // Prema
    D('f2-stenshorne', 'Martinius', 'Stenshorne', 'NOR', 'STE', 'F2', null, 1.8, 0.4, 21, [74, 74, 76, 76, 72, 76, 74], 85, 1, 0), // Rodin
    D('f2-dunne', 'Alexander', 'Dunne', 'IRL', 'DUN', 'F2', null, 2.5, 0.5, 20, [78, 78, 78, 78, 76, 78, 76], 90, 1, 0), // Rodin
    D('f2-maini', 'Kush', 'Maini', 'IND', 'MAI', 'F2', null, 1.5, 0.3, 27, [72, 72, 74, 74, 76, 74, 76], 78, 3, 0), // ART Grand Prix
    D('f2-inthraphuvasak', 'Tasanapol', 'Inthraphuvasak', 'THA', 'INT', 'F2', null, 1.3, 0.3, 21, [72, 72, 72, 74, 70, 72, 70], 82, 0, 0), // ART Grand Prix
    D('f2-fittipaldi', 'Emerson', 'Fittipaldi Jr.', 'BRA', 'FIT', 'F2', null, 1, 0.2, 20, [70, 72, 70, 70, 68, 70, 68], 76, 1, 0), // AIX Racing
    D('f2-shields', 'Cian', 'Shields', 'GBR', 'SHL', 'F2', null, 0.9, 0.2, 22, [68, 70, 70, 70, 66, 70, 66], 74, 1, 0), // AIX Racing
    D('f2-varrone', 'Nicolás', 'Varrone', 'ARG', 'VAR', 'F2', null, 0.8, 0.2, 24, [68, 70, 70, 68, 70, 68, 70], 70, 3, 0), // Van Amersfoort
    D('f2-villagomez', 'Rafael', 'Villagómez', 'MEX', 'VLG', 'F2', null, 1.2, 0.3, 21, [70, 72, 72, 72, 68, 72, 68], 80, 1, 0), // Van Amersfoort
    D('f2-vanhoepen', 'Laurens', 'van Hoepen', 'NED', 'VHO', 'F2', null, 1.6, 0.3, 21, [74, 74, 74, 74, 72, 76, 72], 84, 0, 0), // Trident
    D('f2-bennett', 'John', 'Bennett', 'GBR', 'BNT', 'F2', null, 0.7, 0.2, 21, [66, 68, 68, 68, 64, 68, 64], 72, 0, 0), // Trident

    // --- F3 : grille de départ 2026 (30 pilotes, disponibles) ---
    D('f3-ugochukwu', 'Ugo', 'Ugochukwu', 'USA', 'UGO', 'F3', null, 1, 0.2, 18, [68, 68, 68, 70, 64, 70, 64], 90, 1, 0), // Campos, champion 2026
    D('f3-nael', 'Théophile', 'Naël', 'FRA', 'NAE', 'F3', null, 0.8, 0.2, 21, [66, 66, 68, 66, 62, 70, 62], 84, 1, 0), // Campos, vainqueur GP de Macao 2025
    D('f3-rivera', 'Ernesto', 'Rivera', 'MEX', 'RIV', 'F3', null, 0.8, 0.2, 19, [64, 66, 64, 66, 60, 66, 60], 86, 0, 0), // Campos, Red Bull junior
    D('f3-stromsted', 'Noah', 'Strømsted', 'DEN', 'STO', 'F3', null, 0.6, 0.15, 19, [64, 64, 64, 64, 60, 64, 60], 80, 1, 0), // Trident
    D('f3-slater', 'Freddie', 'Slater', 'GBR', 'SLA', 'F3', null, 1, 0.2, 20, [68, 68, 70, 70, 64, 72, 64], 90, 0, 0), // Trident, 2e du championnat
    D('f3-depalo', 'Matteo', 'De Palo', 'ITA', 'DEP', 'F3', null, 0.5, 0.1, 19, [60, 60, 60, 60, 56, 62, 56], 74, 0, 0), // Trident
    D('f3-colnaghi', 'Mattia', 'Colnaghi', 'ARG', 'CLN', 'F3', null, 0.7, 0.15, 20, [62, 62, 62, 64, 58, 64, 58], 84, 0, 0), // MP Motorsport, Red Bull junior
    D('f3-taponen', 'Tuukka', 'Taponen', 'FIN', 'TAP', 'F3', null, 0.9, 0.2, 20, [66, 66, 68, 68, 64, 70, 64], 90, 1, 0), // MP Motorsport, Ferrari junior
    D('f3-giusti', 'Alessandro', 'Giusti', 'FRA', 'GIU', 'F3', null, 0.5, 0.1, 19, [60, 60, 62, 62, 56, 62, 58], 72, 0, 0), // MP Motorsport
    D('f3-kato', 'Taito', 'Kato', 'JPN', 'KAT', 'F3', null, 0.8, 0.2, 19, [66, 66, 66, 68, 62, 68, 62], 86, 0, 0), // ART Grand Prix
    D('f3-gladysz', 'Maciej', 'Gładysz', 'POL', 'GLA', 'F3', null, 0.6, 0.15, 19, [62, 62, 62, 64, 58, 64, 58], 76, 0, 0), // ART Grand Prix
    D('f3-le', 'Kanato', 'Le', 'JPN', 'KLE', 'F3', null, 0.4, 0.1, 19, [60, 60, 60, 60, 56, 60, 56], 70, 0, 0), // ART Grand Prix
    D('f3-yamakoshi', 'Hiyu', 'Yamakoshi', 'JPN', 'YAM', 'F3', null, 0.7, 0.15, 19, [64, 64, 64, 66, 60, 68, 60], 82, 0, 0), // Van Amersfoort
    D('f3-deligny', 'Enzo', 'Deligny', 'FRA', 'DEL', 'F3', null, 0.5, 0.1, 19, [62, 62, 62, 62, 58, 62, 58], 76, 0, 0), // Van Amersfoort
    D('f3-delpino', 'Bruno', 'del Pino', 'ESP', 'DPI', 'F3', null, 0.6, 0.15, 20, [64, 64, 64, 64, 60, 64, 60], 78, 1, 0), // Van Amersfoort
    D('f3-clerot', 'Pedro', 'Clerot', 'BRA', 'CLE', 'F3', null, 0.7, 0.15, 19, [64, 64, 66, 66, 62, 66, 62], 82, 0, 0), // Rodin
    D('f3-badoer', 'Brando', 'Badoer', 'ITA', 'BAD', 'F3', null, 0.7, 0.15, 19, [64, 64, 66, 66, 60, 66, 60], 82, 1, 0), // Rodin
    D('f3-ho', 'Christian', 'Ho', 'SGP', 'HOC', 'F3', null, 0.4, 0.1, 20, [58, 58, 58, 58, 54, 58, 54], 66, 1, 0), // Rodin
    D('f3-sharp', 'Louis', 'Sharp', 'NZL', 'SHA', 'F3', null, 0.5, 0.1, 19, [60, 62, 60, 60, 56, 60, 56], 74, 1, 0), // Prema
    D('f3-wharton', 'James', 'Wharton', 'AUS', 'WHA', 'F3', null, 0.6, 0.15, 19, [62, 62, 62, 62, 58, 64, 58], 78, 1, 0), // Prema
    D('f3-garfias', 'José', 'Garfias', 'MEX', 'GAR', 'F3', null, 0.3, 0.1, 21, [56, 56, 56, 56, 52, 56, 54], 62, 0, 0), // Prema
    D('f3-shin', 'Michael', 'Shin', 'KOR', 'MSH', 'F3', null, 0.3, 0.1, 21, [54, 54, 54, 54, 50, 54, 52], 58, 1, 0), // Hitech
    D('f3-mclaughlin', 'Fionn', 'McLaughlin', 'IRL', 'MCL', 'F3', null, 0.5, 0.1, 18, [58, 58, 58, 58, 54, 58, 54], 78, 0, 0), // Hitech, Red Bull junior
    D('f3-nakamura', 'Jin', 'Nakamura', 'JPN', 'NAK', 'F3', null, 0.6, 0.15, 19, [62, 62, 64, 62, 58, 62, 58], 78, 0, 0), // Hitech
    D('f3-benavides', 'Brad', 'Benavides', 'USA', 'BNV', 'F3', null, 0.3, 0.1, 19, [58, 60, 58, 58, 54, 58, 54], 64, 0, 0), // AIX Racing
    D('f3-david', 'Yevan', 'David', 'LKA', 'DAV', 'F3', null, 0.4, 0.1, 20, [60, 60, 62, 60, 56, 60, 58], 70, 0, 0), // AIX Racing
    D('f3-barrichello', 'Fernando', 'Barrichello', 'BRA', 'FBA', 'F3', null, 0.3, 0.1, 21, [56, 58, 56, 56, 54, 56, 54], 62, 0, 0), // AIX Racing
    D('f3-lacorte', 'Nicola', 'Lacorte', 'ITA', 'LAC', 'F3', null, 0.5, 0.1, 20, [60, 60, 60, 62, 56, 62, 58], 72, 1, 0), // DAMS
    D('f3-bhirombhakdi', 'Nandhavud', 'Bhirombhakdi', 'THA', 'BHI', 'F3', null, 0.3, 0.1, 19, [54, 56, 54, 54, 52, 54, 52], 60, 0, 0), // DAMS
    D('f3-xie', 'Gerrard', 'Xie', 'CHN', 'XIE', 'F3', null, 0.4, 0.1, 20, [60, 60, 60, 60, 56, 60, 56], 70, 1, 0), // DAMS
]);