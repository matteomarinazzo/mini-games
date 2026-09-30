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
 * Planifie la grille de départ avec cascade de transferts intelligente (V2).
 *
 * Algorithme :
 *  1. Le joueur recrute ses 2 pilotes → leurs écuries respectives sont en "recherche de remplaçant".
 *  2. Chaque équipe en recherche parcourt le marché des pilotes libres et IN-écurie pour trouver
 *     le meilleur pilote qu'elle peut se permettre (cost ≤ recruitingBudget ET aucun conflit).
 *  3. Condition de débauchage inter-équipe : loyalty du cible < POACH_LOYALTY_THRESHOLD.
 *  4. Si une équipe est débauchée, elle entre à son tour dans la file de recherche → cascade.
 *  5. En dernier recours (aucun pilote libre acceptable) : pilote libre sans écurie (F2/ancien/F3).
 *  6. Si même ça échoue : erreur de génération.
 *
 * @param {string[]} selectedIds   IDs des 2 pilotes choisis par le joueur.
 * @param {object[]} refDrivers    Liste de référence des pilotes.
 * @param {object[]} refTeams      Liste de référence des équipes.
 * @returns {{ ok: true, drivers: object[], replacements: object[] }
 *         | { ok: false, error: string }}
 */
export function planGrid(selectedIds, refDrivers = DRIVERS_2026, refTeams = TEAMS_2026) {
  const byId = new Map(refDrivers.map((d) => [d.id, d]));
  const teamById = new Map(refTeams.map((t) => [t.id, t]));
  const selected = selectedIds.map((id) => byId.get(id));

  if (selected.length !== 2 || selected.some((d) => !d) || selected[0].id === selected[1].id) {
    return { ok: false, error: 'Sélection de pilotes invalide.' };
  }

  /** Seuil de loyalty en dessous duquel un pilote peut être débauché par une autre équipe. */
  const POACH_LOYALTY_THRESHOLD = 50;

  /**
   * État mutable de la grille pendant la simulation.
   * currentTeam[driverId] = teamId (ou PLAYER_TEAM_ID si recruté par le joueur)
   */
  const currentTeam = new Map(); // driverId → teamId courant (null = libre)
  const chosen = new Set(selectedIds);

  // Initialisation : chaque pilote de grille connaît son équipe de départ.
  for (const team of refTeams) {
    for (const id of team.driverIds) {
      currentTeam.set(id, chosen.has(id) ? null : team.id); // les pilotes recrutés par le joueur sont libérés
    }
  }

  // File d'équipes qui ont besoin d'un remplaçant { teamId, missingSlots: number }
  // On débute avec les équipes qui ont perdu un pilote au profit du joueur.
  /** @type {Map<string, number>} teamId → nombre de places vacantes */
  const needsDriver = new Map();
  for (const d of selected) {
    if (d.teamId) {
      needsDriver.set(d.teamId, (needsDriver.get(d.teamId) ?? 0) + 1);
    }
  }

  /** Liste finale des mouvements de transfert (pour le récapitulatif narratif). */
  const replacements = [];

  /**
   * Renvoie les pilotes disponibles sur le marché libre (pas d'équipe et pas choisis par le joueur).
   * Triés par note globale décroissante, puis par coût.
   */
  const freeAgents = () => {
    const alreadyAssigned = new Set(replacements.map((r) => r.replacementId));
    return refDrivers
      .filter((d) => d.teamId === null && !chosen.has(d.id) && !alreadyAssigned.has(d.id))
      .sort((a, b) => {
        const oa = _driverOverallSimple(a);
        const ob = _driverOverallSimple(b);
        return ob - oa || a.cost - b.cost;
      });
  };

  /**
   * Renvoie les pilotes actuellement dans une équipe et potentiellement débauchables.
   * Critères : loyalty < seuil, pas en cours d'utilisation dans la cascade courante.
   */
  const poachablePilots = () => refDrivers
    .filter((d) => {
      if (!d.teamId) return false;           // pilote sans équipe de départ → pas poachable
      const cur = currentTeam.get(d.id);
      if (!cur) return false;                // déjà libéré (recruté par joueur ou autre équipe)
      if (chosen.has(d.id)) return false;   // recruté par le joueur
      if (d.loyalty >= POACH_LOYALTY_THRESHOLD) return false; // trop loyal
      return true;
    })
    .sort((a, b) => {
      const oa = _driverOverallSimple(a);
      const ob = _driverOverallSimple(b);
      return ob - oa || a.cost - b.cost;
    });

  /** Résolution de la cascade de recrutements. */
  const MAX_ITERATIONS = 30; // garde-fou anti-boucle infinie
  let iterations = 0;

  while (needsDriver.size > 0 && iterations < MAX_ITERATIONS) {
    iterations++;

    // Traiter la première équipe dans la file.
    const [recruitingTeamId, slotsNeeded] = needsDriver.entries().next().value;
    needsDriver.delete(recruitingTeamId);

    const team = teamById.get(recruitingTeamId);
    if (!team) return { ok: false, error: `Équipe introuvable : ${recruitingTeamId}.` };

    for (let slot = 0; slot < slotsNeeded; slot++) {
      let recruited = null;
      let fromTeamId = null; // si poaching, équipe d'origine

      // 1. Chercher le meilleur agent libre abordable
      const free = freeAgents().filter((d) => d.cost <= team.recruitingBudget);
      if (free.length > 0) {
        recruited = free[0];
      }

      // 2. Si pas d'agent libre satisfaisant → tenter de débaucher un pilote d'une autre équipe
      if (!recruited) {
        const poachable = poachablePilots().filter(
          (d) => d.cost <= team.recruitingBudget && currentTeam.get(d.id) !== recruitingTeamId,
        );
        if (poachable.length > 0) {
          recruited = poachable[0];
          fromTeamId = currentTeam.get(recruited.id);
        }
      }

      // 3. En dernier recours : n'importe quel agent libre (même hors budget)
      if (!recruited) {
        const anyFree = freeAgents();
        if (anyFree.length > 0) recruited = anyFree[0];
      }

      if (!recruited) {
        return {
          ok: false,
          error: `Aucun pilote disponible pour remplacer un départ chez ${team.name}. Essayez avec d'autres pilotes.`,
        };
      }


      // Le pilote recruté quitte son ancienne équipe (si poaching)
      if (fromTeamId) {
        currentTeam.set(recruited.id, recruitingTeamId);
        // L'ancienne équipe a maintenant un poste vacant → entre dans la file
        needsDriver.set(fromTeamId, (needsDriver.get(fromTeamId) ?? 0) + 1);
        replacements.push({
          teamId: recruitingTeamId,
          teamName: team.name,
          leavingName: null,           // sera rempli lors du récap si nécessaire
          replacementId: recruited.id,
          replacementName: recruited.displayName,
          fromTeamId,
          fromTeamName: teamById.get(fromTeamId)?.name ?? fromTeamId,
          isPoaching: true,
        });
      } else {
        currentTeam.set(recruited.id, recruitingTeamId);
        replacements.push({
          teamId: recruitingTeamId,
          teamName: team.name,
          leavingName: null,
          replacementId: recruited.id,
          replacementName: recruited.displayName,
          fromTeamId: null,
          fromTeamName: null,
          isPoaching: false,
        });
      }
    }
  }

  if (needsDriver.size > 0 && iterations >= MAX_ITERATIONS) {
    return { ok: false, error: 'Impossible de résoudre les transferts en cascade (trop complexe). Changez votre sélection de pilotes.' };
  }

  // --- Reconstituer la liste finale des pilotes de la sauvegarde ---
  // Pilotes initialement en grille : on prend leur position FINALE (après cascades)
  const drivers = [];

  // Construire une map : teamId → [driverId recruté]
  const teamRoster = new Map(refTeams.map((t) => [t.id, []]));

  // Pilotes non touchés par les transferts (toujours dans leur équipe d'origine)
  for (const team of refTeams) {
    for (const id of team.driverIds) {
      if (!chosen.has(id) && currentTeam.get(id) === team.id) {
        teamRoster.get(team.id)?.push(id);
      }
    }
  }

  // Pilotes recrutés par les cascades
  for (const r of replacements) {
    if (!teamRoster.has(r.teamId)) teamRoster.set(r.teamId, []);
    teamRoster.get(r.teamId)?.push(r.replacementId);
  }

  // Générer les objets d'état de pilote
  for (const team of refTeams) {
    const roster = teamRoster.get(team.id) ?? [];
    for (const id of roster) {
      const ref = byId.get(id);
      if (!ref) return { ok: false, error: `Donnée de référence manquante : ${id}.` };
      drivers.push(toStateDriver(ref, team.id));
    }
    // Si une équipe manque de pilotes après tout → erreur
    if (roster.length < team.driverIds.length) {
      return {
        ok: false,
        error: `L'écurie ${team.name} ne dispose pas d'assez de pilotes après les transferts.`,
      };
    }
  }

  // Pilotes du joueur
  selected.forEach((ref) => drivers.push(toStateDriver(ref, PLAYER_TEAM_ID, ref.cost)));

  // Remplir les noms des pilotes partants dans les replacements (pour affichage narratif)
  // On associe chaque replacement au pilote qui a quitté son équipe d'origine
  const leavingByTeam = new Map();
  for (const d of selected) {
    if (d.teamId) {
      if (!leavingByTeam.has(d.teamId)) leavingByTeam.set(d.teamId, []);
      leavingByTeam.get(d.teamId).push(d.displayName);
    }
  }
  for (const r of replacements) {
    if (r.isPoaching) {
      // Le pilote poaché laisse une place vacante dans fromTeamId
      if (!leavingByTeam.has(r.fromTeamId)) leavingByTeam.set(r.fromTeamId, []);
      leavingByTeam.get(r.fromTeamId).push(r.replacementName); // sera le "partant" pour l'équipe suivante
    }
  }
  for (const r of replacements) {
    const leaving = leavingByTeam.get(r.teamId);
    r.leavingName = leaving?.shift() ?? '(pilote inconnu)';
  }

  return { ok: true, drivers, replacements };
}

/** Note globale simplifiée pour les comparaisons internes (pas d'import circulaire). */
function _driverOverallSimple(d) {
  const vals = Object.values(d.stats);
  return Math.round(vals.reduce((a, v) => a + v, 0) / vals.length);
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
    calendar: { currentRound: 0, completedRounds: [], trainingCompletedEvents: [] },
    activities: { upgrades: [], trainingHistory: [] },
    weekends: {},
    eventLog: [],
    standings: { drivers: [], teams: [] },
  };
  const check = validateSave(save);
  if (!check.ok) return { ok: false, errors: ['Erreur interne de génération de la partie.', ...check.errors] };
  return { ok: true, save, plan, totalCost: sel.totalCost };
}

/** Migrations V1/V2/V3 → V4 : conserve les résultats et initialise les week-ends. */
export function migrateSave(save) {
  if (!save || typeof save !== 'object') return save;
  let s = { ...save };
  if (s.schemaVersion === 1) {
    s = {
      ...s,
      schemaVersion: 2,
      calendar: { ...s.calendar, trainingCompletedEvents: [] },
      activities: { upgrades: [], trainingHistory: [] },
      weekends: {},
      eventLog: [{ id: 'migration-v3', date: s.gameDate, type: 'migration', message: 'Sauvegarde V1 mise à jour pour le calendrier de saison.' }],
    };
  }
  if (s.schemaVersion === 2) {
    const completed = (s.calendar?.trainingCompletedRounds || []).map((roundId) => `${roundId}-legacy`);
    s = { ...s, schemaVersion: 3, calendar: { ...s.calendar, trainingCompletedEvents: completed }, weekends: {} };
  }
  if (s.schemaVersion === 3) {
    s = { ...s, schemaVersion: 4, weekends: s.weekends || {} };
  }
  if (s.schemaVersion === 4) {
    for (const w of Object.values(s.weekends)) {
      if (w.race && w.race.results && !w.race.state) {
        w.race = { state: null, results: w.race.results, completedAt: w.race.completedAt, rewards: null, log: [] };
      }
    }
    s = { ...s, schemaVersion: 5 };
  }
  return s;
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
    raceStatus: started ? `Prochaine course : R${save.calendar.currentRound + 1}` : 'Saison non commencée',
    drivers,
    startLevelLabel: START_LEVELS[save.difficulty.startingDepartmentLevel].label,
    upgradeLabel: UPGRADE_LEVELS[save.difficulty.upgradeDifficulty].label,
  };
}
