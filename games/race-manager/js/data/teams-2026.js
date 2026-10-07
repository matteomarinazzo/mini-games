/**
 * DONNÉES DE RÉFÉRENCE — écuries de la grille 2026.
 *
 * ⚠ Ces données sont en lecture seule (objets gelés) : elles ne sont jamais
 *   modifiées pendant une partie. L'état de partie vit dans la sauvegarde.
 * ⚠ Composition de la grille : d'après mes connaissances (fin juin 2026), à VÉRIFIER
 *   par le propriétaire du site. Les notes de départements, budgets et couleurs sont
 *   des estimations de jeu, pas des données officielles. Aucun logo n'est utilisé.
 */
import { deepFreeze } from '../core/utils.js';

export const REFERENCE_VERSION = '2026-draft-1';

export const TEAMS_2026 = deepFreeze([
  //                                                                                                                                                                        recruitingBudget  prestige
  //                                                                                                                                                                        (M€ max/pilote)   (0-100)
  { id: 'mercedes', name: 'Mercedes', color: '#00d2be', departmentRatings: { aero: 92, chassis: 90, power: 95 }, driverIds: ['russell', 'antonelli'], startingBalance: 20, recruitingBudget: 18, prestige: 95 },
  { id: 'ferrari', name: 'Ferrari', color: '#e8002d', departmentRatings: { aero: 90, chassis: 91, power: 90 }, driverIds: ['leclerc', 'hamilton'], startingBalance: 20, recruitingBudget: 18, prestige: 98 },
  { id: 'mclaren', name: 'McLaren', color: '#ff8000', departmentRatings: { aero: 93, chassis: 93, power: 88 }, driverIds: ['norris', 'piastri'], startingBalance: 20, recruitingBudget: 16, prestige: 92 },
  { id: 'redbull', name: 'Red Bull Racing', color: '#3671c6', departmentRatings: { aero: 89, chassis: 90, power: 92 }, driverIds: ['verstappen', 'hadjar'], startingBalance: 20, recruitingBudget: 20, prestige: 90 },
  { id: 'aston', name: 'Aston Martin', color: '#229971', departmentRatings: { aero: 70, chassis: 70, power: 76 }, driverIds: ['alonso', 'stroll'], startingBalance: 15, recruitingBudget: 13, prestige: 78 },
  { id: 'alpine', name: 'Alpine', color: '#ff87bc', departmentRatings: { aero: 78, chassis: 79, power: 80 }, driverIds: ['gasly', 'colapinto'], startingBalance: 12, recruitingBudget: 9, prestige: 68 },
  { id: 'williams', name: 'Williams', color: '#64c4ff', departmentRatings: { aero: 80, chassis: 81, power: 82 }, driverIds: ['albon', 'sainz'], startingBalance: 12, recruitingBudget: 10, prestige: 72 },
  { id: 'racingbulls', name: 'Racing Bulls', color: '#6692ff', departmentRatings: { aero: 79, chassis: 78, power: 82 }, driverIds: ['lawson', 'lindblad'], startingBalance: 10, recruitingBudget: 6, prestige: 60 },
  { id: 'haas', name: 'Haas', color: '#b6babd', departmentRatings: { aero: 76, chassis: 75, power: 78 }, driverIds: ['ocon', 'bearman'], startingBalance: 8, recruitingBudget: 7, prestige: 55 },
  { id: 'audi', name: 'Audi', color: '#c8c8c8', departmentRatings: { aero: 78, chassis: 76, power: 80 }, driverIds: ['hulkenberg', 'bortoleto'], startingBalance: 12, recruitingBudget: 8, prestige: 62 },
  { id: 'cadillac', name: 'Cadillac', color: '#d4af37', departmentRatings: { aero: 70, chassis: 72, power: 76 }, driverIds: ['perez', 'bottas'], startingBalance: 10, recruitingBudget: 7, prestige: 58 },
]);
