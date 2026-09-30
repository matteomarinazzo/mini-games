/**
 * État de partie : construction d'une nouvelle partie à partir des données de référence,
 * migration de schéma et résumé pour l'affichage. Aucune dépendance au DOM.
 *
 * Principe : les données de référence (js/data/*) sont COPIÉES dans l'état de partie ;
 * la sauvegarde ne contient aucune référence vers un objet vivant de données de base.
 */
import {
  SCHEMA_VERSION, GAME_ID, SEASON, START_DATE, SLOT_COUNT, PLAYER_TEAM_ID,
  START_LEVELS, UPGRADE_LEVELS, DEPT_KEYS,
} from './constants.js';
import { clampRating, teamOverall, driverOverall, normalizeName, validateTeamName, validateColor, validateBudget, validateDriverSelection, validateSave } from './validation.js';
import { clone, round2, hashString, newId } from './utils.js';
import { TEAMS_2026, REFERENCE_VERSION } from '../data/teams-2026.js';
import { DRIVERS_2026 } from '../data/drivers-2026.js';

/**
 * Notes de départ des 3 départements de l'écurie du joueur.
 * Base du niveau choisi, avec un léger écart (+4 / 0 / −4) réparti selon le nom de l'écurie
 * (déterministe) pour donner une identité à l'écurie. Toujours borné à [50, 100].
 */
export function computeDepartmentRatings(teamName, levelKey) {
  const level = START_LEVELS[levelKey];
  if (!level) throw new Error(`Niveau de départ inconnu : ${levelKey}`);
  const offsets = [4, 0, -4];
  const shift = hashString(normalizeName(teamName).toLowerCase()) % 3;
  return Object.fromEntries(DEPT_KEYS.map((k, i) => [k, clampRating(level.base + offsets[(i + shift) % 3])]));
}

/** Copie d'un pilote de référence vers un pilote d'état de partie. */
function toStateDriver(ref, teamId, signingCost = 0) {
  return {
    id: ref.id,
    name: ref.displayName,
    abbr: ref.abbr,
    nationality: ref.nationality,
    category: ref.category,
    age: ref.age,
    teamId,
    stats: clone(ref.stats),
    potential: ref.potential,
    experience: ref.experience,
    available: false,
    contract: { salary: ref.salary, signingCost, startSeason: SEASON, endSeason: SEASON },
  };
}

/**
 * Règle de transition V1 (déterministe) : un pilote de F1 choisi par le joueur quitte son écurie ;
 * sa place est reprise par le premier pilote de réserve (catégorie « autre », sans écurie) non choisi,
 * dans l'ordre du fichier de données. Résultat : 12 écuries × 2 pilotes = 24 pilotes uniques.
 */
export function planGrid(selectedIds, refDrivers = DRIVERS_2026, refTeams = TEAMS_2026) {
  const byId = new Map(refDrivers.map((d) => [d.id, d]));
  const selected = selectedIds.map((id) => byId.get(id));
  if (selected.length !== 2 || selected.some((d) => !d) || selected[0].id === selected[1].id) {
    return { ok: false, error: 'Sélection de pilotes invalide.' };
  }
  const chosen = new Set(selectedIds);
  const reserves = refDrivers.filter((d) => d.category === 'autre' && !d.teamId && !chosen.has(d.id));
  let next = 0;
  const drivers = [];
  const replacements = [];
  for (const team of refTeams) {
    for (const id of team.driverIds) {
      const ref = byId.get(id);
      if (!ref) return { ok: false, error: `Donnée de référence manquante : ${id}.` };
      if (chosen.has(id)) {
        const rep = reserves[next++];
        if (!rep) return { ok: false, error: `Aucun pilote de remplacement disponible pour ${team.name} : création impossible.` };
        replacements.push({ teamId: team.id, teamName: team.name, leavingName: ref.displayName, replacementName: rep.displayName });
        drivers.push(toStateDriver(rep, team.id));
      } else {
        drivers.push(toStateDriver(ref, team.id));
      }
    }
  }
  selected.forEach((ref) => drivers.push(toStateDriver(ref, PLAYER_TEAM_ID, ref.cost)));
  return { ok: true, drivers, replacements };
}

/**
 * Construit et valide une nouvelle partie. Toutes les règles sont revérifiées ici
 * (le rendu de l'assistant ne suffit pas).
 * @param {{teamName:string,color:string,budget:number|string,driverIds:string[],startLevel:string,upgradeLevel:string}} input
 * @returns {{ok:true,save:object,plan:object,totalCost:number}|{ok:false,errors:string[]}}
 */
export function createNewGame(input, slotId, now = new Date(), refs = { teams: TEAMS_2026, drivers: DRIVERS_2026 }) {
  const errors = [];
  if (!Number.isInteger(slotId) || slotId < 1 || slotId > SLOT_COUNT) errors.push('Emplacement de sauvegarde invalide.');
  const name = validateTeamName(input.teamName, refs.teams.map((t) => t.name));
  if (!name.ok) errors.push(name.error);
  if (!validateColor(input.color)) errors.push('Couleur d’écurie invalide.');
  const budget = validateBudget(input.budget);
  if (!budget.ok) errors.push(budget.error);
  if (!(input.startLevel in START_LEVELS)) errors.push('Note de départ des départements invalide.');
  if (!(input.upgradeLevel in UPGRADE_LEVELS)) errors.push('Difficulté d’amélioration invalide.');
  const sel = validateDriverSelection(input.driverIds, refs.drivers, budget.ok ? budget.value : NaN);
  errors.push(...sel.errors);
  if (errors.length) return { ok: false, errors };

  const plan = planGrid(input.driverIds, refs.drivers, refs.teams);
  if (!plan.ok) return { ok: false, errors: [plan.error] };

  const iso = now.toISOString();
  const teams = refs.teams.map((t) => ({
    id: t.id, name: t.name, color: t.color, isPlayer: false,
    balance: t.startingBalance, departmentRatings: clone(t.departmentRatings),
  }));
  teams.push({
    id: PLAYER_TEAM_ID, name: name.name, color: input.color, isPlayer: true,
    balance: round2(budget.value - sel.totalCost),
    departmentRatings: computeDepartmentRatings(name.name, input.startLevel),
  });

  const save = {
    schemaVersion: SCHEMA_VERSION,
    gameId: GAME_ID,
    referenceVersion: REFERENCE_VERSION,
    saveId: newId('save'),
    slotId,
    createdAt: iso,
    lastPlayedAt: iso,
    playTimeSeconds: 0,
    season: SEASON,
    gameDate: START_DATE,
    currentPhase: 'home',
    playerTeamId: PLAYER_TEAM_ID,
    difficulty: { startingDepartmentLevel: input.startLevel, upgradeDifficulty: input.upgradeLevel },
    teams,
    drivers: plan.drivers,
    calendar: { currentRound: 0, completedRounds: [] },
    standings: { drivers: [], teams: [] },
  };
  const check = validateSave(save);
  if (!check.ok) return { ok: false, errors: ['Erreur interne de génération de la partie.', ...check.errors] };
  return { ok: true, save, plan, totalCost: sel.totalCost };
}

/** Point d'extension : conversion des anciens schémas vers le schéma courant (V1 : rien à faire). */
export function migrateSave(save) {
  return save;
}

/** Données prêtes à afficher pour une carte de slot ou un résumé d'import. */
export function summarizeSave(save) {
  const team = save.teams.find((t) => t.id === save.playerTeamId);
  const drivers = save.drivers.filter((d) => d.teamId === save.playerTeamId)
    .map((d) => ({ name: d.name, abbr: d.abbr, overall: driverOverall(d) }));
  const started = save.calendar.completedRounds.length > 0 || save.calendar.currentRound > 0;
  return {
    slotId: save.slotId,
    teamName: team.name,
    color: team.color,
    teamOverall: teamOverall(team),
    season: save.season,
    gameDate: save.gameDate,
    lastPlayedAt: save.lastPlayedAt,
    playTimeSeconds: save.playTimeSeconds,
    balance: team.balance,
    raceStatus: started ? `Prochaine course : manche ${save.calendar.currentRound + 1}` : 'Saison non commencée',
    drivers,
    startLevelLabel: START_LEVELS[save.difficulty.startingDepartmentLevel].label,
    upgradeLabel: UPGRADE_LEVELS[save.difficulty.upgradeDifficulty].label,
  };
}
