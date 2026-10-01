/**
 * Validation et calculs centralisés : notes, nom d'écurie, budget, sélection
 * de pilotes et schéma de sauvegarde. Aucune dépendance au DOM (testable en Node).
 */
import {
  RATING_MIN, RATING_MAX, STAT_KEYS, DEPT_KEYS, CATEGORIES, START_LEVELS, UPGRADE_LEVELS,
  RESERVED_TEAM_NAMES, TEAM_NAME_MIN, TEAM_NAME_MAX, BUDGET_MIN, BUDGET_MAX,
  GAME_ID, SCHEMA_VERSION,
} from './constants.js';
import { round2, formatMoney } from './utils.js';

// ---------------------------------------------------------------- Notes

/** Force une note dans [50, 100] (entier). */
export const clampRating = (v) => Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(Number(v) || RATING_MIN)));
/** Applique une amélioration (+) ou une baisse (−) sans jamais sortir de [50, 100]. */
export const adjustRating = (rating, delta) => clampRating(rating + delta);
export const average = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

/** Note globale d'un pilote = moyenne de ses 7 statistiques (arrondie). Seule définition du calcul. */
export const driverOverall = (driver) => Math.round(average(STAT_KEYS.map((k) => driver.stats[k])));
/** Note globale d'une écurie = moyenne de ses 3 départements (arrondie). */
export const teamOverall = (team) => Math.round(average(DEPT_KEYS.map((k) => team.departmentRatings[k])));

// ---------------------------------------------------------------- Nom d'écurie

const fail = (error) => ({ ok: false, error });

/** Espaces multiples/bords normalisés. */
export const normalizeName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Forme comparable : sans accents, minuscules, sans espaces/tirets/ponctuation. */
export const squash = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

export function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/**
 * Valide le nom de l'écurie du joueur.
 * Refuse : vide, trop court/long, caractères exotiques, nom contenant un nom réservé
 * ou d'une écurie existante (insensible casse/espaces/tirets/accents), ou à une lettre près.
 * @returns {{ok:true,name:string}|{ok:false,error:string}}
 */
export function validateTeamName(raw, existingNames = []) {
  const name = normalizeName(raw);
  if (!name) return fail('Le nom de l’écurie est obligatoire.');
  if (name.length < TEAM_NAME_MIN) return fail(`Le nom doit contenir au moins ${TEAM_NAME_MIN} caractères.`);
  if (name.length > TEAM_NAME_MAX) return fail(`Le nom ne peut pas dépasser ${TEAM_NAME_MAX} caractères.`);
  if (!/^[\p{L}\p{N} '’.&-]+$/u.test(name)) return fail('Caractères autorisés : lettres, chiffres, espaces, tirets, apostrophes, points et &.');
  const key = squash(name);
  if (key.length < 2) return fail('Le nom doit contenir au moins deux lettres ou chiffres.');
  const refs = [...RESERVED_TEAM_NAMES, ...existingNames];
  for (const ref of refs) {
    const rk = squash(ref);
    if (!rk) continue;
    if (key.includes(rk) || (rk.length >= 4 && levenshtein(key, rk) <= 1)) {
      return fail(`Ce nom est trop proche de « ${ref} », réservé à une écurie existante. Choisissez un nom original.`);
    }
  }
  return { ok: true, name };
}

// ---------------------------------------------------------------- Couleur, budget

export const validateColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** Accepte un nombre ou un texte (virgule ou point). Renvoie une valeur arrondie au centième. */
export function validateBudget(v) {
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fail('Saisissez un budget numérique.');
  if (n < BUDGET_MIN || n > BUDGET_MAX) return fail(`Le budget doit être compris entre ${BUDGET_MIN} et ${BUDGET_MAX} millions.`);
  return { ok: true, value: round2(n) };
}

// ---------------------------------------------------------------- Pilotes

/** Vérifie exactement 2 pilotes distincts, connus, et dans le budget. */
export function validateDriverSelection(ids, refDrivers, budget) {
  const errors = [];
  let totalCost = 0;
  if (!Array.isArray(ids) || ids.length !== 2) {
    errors.push('Sélectionnez exactement deux pilotes.');
  } else {
    if (ids[0] === ids[1]) errors.push('Les deux pilotes doivent être différents.');
    const found = ids.map((id) => refDrivers.find((d) => d.id === id));
    if (found.some((d) => !d)) {
      errors.push('Un des pilotes sélectionnés est inconnu.');
    } else {
      totalCost = round2(found.reduce((a, d) => a + d.cost, 0));
      if (Number.isFinite(budget) && totalCost > budget) {
        errors.push(`Budget insuffisant : les deux pilotes coûtent ${formatMoney(totalCost)}, le budget est de ${formatMoney(budget)} (il manque ${formatMoney(round2(totalCost - budget))}).`);
      }
    }
  }
  return { ok: errors.length === 0, errors, totalCost, remaining: round2((budget || 0) - totalCost) };
}

// ---------------------------------------------------------------- Sauvegarde

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const isRating = (n) => Number.isFinite(n) && n >= RATING_MIN && n <= RATING_MAX;
const isDate = (s) => typeof s === 'string' && !Number.isNaN(new Date(s).getTime());

/**
 * Valide un objet de sauvegarde (V1 : 12 écuries, 24 pilotes, 2 pilotes par écurie).
 * @returns {{ok:boolean, errors:string[], unknownVersion?:boolean}}
 */
export function validateSave(s) {
  if (!isObj(s)) return { ok: false, errors: ['Le contenu n’est pas une sauvegarde valide (objet attendu).'] };
  if (s.gameId !== GAME_ID) return { ok: false, errors: ['Ce fichier n’est pas une sauvegarde de ce jeu.'] };
  if (!Number.isInteger(s.schemaVersion) || s.schemaVersion < 1) {
    return { ok: false, errors: ['Version de sauvegarde absente ou invalide.'] };
  }
  if (s.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false, unknownVersion: true,
      errors: [`Version de sauvegarde inconnue (${s.schemaVersion}). Cette version du jeu gère jusqu’à la version ${SCHEMA_VERSION}.`],
    };
  }

  const errors = [];
  const err = (m) => { if (errors.length < 8) errors.push(m); };

  if (typeof s.saveId !== 'string' || !s.saveId) err('Identifiant de sauvegarde manquant.');
  if (!isDate(s.createdAt) || !isDate(s.lastPlayedAt)) err('Dates de sauvegarde invalides.');
  if (!Number.isFinite(s.playTimeSeconds) || s.playTimeSeconds < 0) err('Temps de jeu invalide.');
  if (!Number.isInteger(s.season)) err('Saison invalide.');
  if (typeof s.gameDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.gameDate)) err('Date de jeu invalide.');
  if (typeof s.currentPhase !== 'string') err('Phase de jeu invalide.');
  if (!isObj(s.difficulty) || !(s.difficulty.startingDepartmentLevel in START_LEVELS) || !(s.difficulty.upgradeDifficulty in UPGRADE_LEVELS)) {
    err('Difficulté invalide.');
  }
  if (!isObj(s.calendar) || !Number.isInteger(s.calendar.currentRound) || s.calendar.currentRound < 0 || !Array.isArray(s.calendar.completedRounds) || !Array.isArray(s.calendar.trainingCompletedEvents)) {
    err('Calendrier invalide.');
  }
  if (!isObj(s.activities) || !Array.isArray(s.activities.upgrades) || !Array.isArray(s.activities.trainingHistory) || !Array.isArray(s.eventLog)) {
    err('Activités de saison invalides.');
  }
  if (!isObj(s.weekends)) err('Week-ends de Grand Prix invalides.');
  if (!isObj(s.transfers) || !Array.isArray(s.transfers.scouting) || !Array.isArray(s.transfers.offers)) err('Marché des transferts invalide.');
  if (!isObj(s.standings) || !Array.isArray(s.standings.drivers) || !Array.isArray(s.standings.teams)) err('Classements invalides.');

  // Écuries
  const teamIds = new Set();
  if (!Array.isArray(s.teams) || s.teams.length !== 12) {
    err('La sauvegarde doit contenir exactement 12 écuries.');
  } else {
    s.teams.forEach((t, i) => {
      if (!isObj(t) || typeof t.id !== 'string' || !t.id) return err(`Écurie n°${i + 1} invalide.`);
      if (teamIds.has(t.id)) err(`Identifiant d’écurie en double : ${t.id}.`);
      teamIds.add(t.id);
      if (typeof t.name !== 'string' || !t.name || t.name.length > 40) err(`Nom invalide pour l’écurie ${t.id}.`);
      if (!validateColor(t.color)) err(`Couleur invalide pour l’écurie ${t.id}.`);
      if (!Number.isFinite(t.balance)) err(`Solde invalide pour l’écurie ${t.id}.`);
      if (!isObj(t.departmentRatings) || !DEPT_KEYS.every((k) => isRating(t.departmentRatings[k]))) {
        err(`Notes de départements invalides (entre ${RATING_MIN} et ${RATING_MAX}) pour ${t.id}.`);
      }
    });
    const players = s.teams.filter((t) => t && t.isPlayer === true);
    if (players.length !== 1 || players[0].id !== s.playerTeamId) err('L’écurie du joueur est absente ou en double.');
  }

  // Pilotes
  if (!Array.isArray(s.drivers) || s.drivers.length !== 24) {
    err('La sauvegarde doit contenir exactement 24 pilotes.');
  } else {
    const driverIds = new Set();
    const perTeam = {};
    s.drivers.forEach((d, i) => {
      if (!isObj(d) || typeof d.id !== 'string' || !d.id) return err(`Pilote n°${i + 1} invalide.`);
      if (driverIds.has(d.id)) err(`Pilote en double : ${d.id}.`);
      driverIds.add(d.id);
      if (d.teamId === null) { /* agent libre autorisé */ }
      if (typeof d.name !== 'string' || !d.name) err(`Nom manquant pour le pilote ${d.id}.`);
      if (typeof d.abbr !== 'string' || d.abbr.length !== 3) err(`Abréviation invalide pour le pilote ${d.id}.`);
      if (!(d.category in CATEGORIES)) err(`Catégorie invalide pour le pilote ${d.id}.`);
      if (d.teamId !== null && !teamIds.has(d.teamId)) err(`Le pilote ${d.id} n’appartient à aucune écurie connue.`);
      perTeam[d.teamId] = (perTeam[d.teamId] || 0) + 1;
      if (!isObj(d.stats) || !STAT_KEYS.every((k) => isRating(d.stats[k]))) {
        err(`Statistiques invalides (entre ${RATING_MIN} et ${RATING_MAX}) pour le pilote ${d.id}.`);
      }
    });
    if (teamIds.size === 12 && [...teamIds].some((id) => perTeam[id] !== 2)) err('Chaque écurie doit avoir exactement deux pilotes.');
  }
  return { ok: errors.length === 0, errors };
}
