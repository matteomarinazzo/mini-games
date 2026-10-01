/** Moteur V2 sans DOM : calendrier, entraînements, améliorations, IA, et cycles saisonniers (V6). */
import { CALENDAR_2026 } from '../data/calendar-2026.js';
import { DEPT_KEYS, STAT_KEYS, TRAINING_GAIN, UPGRADE_DURATION_DAYS, UPGRADE_LEVELS } from './constants.js';
import { clampRating, driverOverall } from './validation.js';
import { round2 } from './utils.js';
import { processTransferEvents, transferEvents, replacementCascade } from './transfers.js';
import { applyRegulationChanges } from './regulations.js';

const dateMs = (date) => Date.parse(`${date}T12:00:00Z`);
const addDays = (date, days) => new Date(dateMs(date) + days * 86400000).toISOString().slice(0, 10);
const log = (save, date, message, type = 'info') => {
  save.eventLog.unshift({ id: `${date}-${save.eventLog.length}-${type}`, date, message, type });
  save.eventLog = save.eventLog.slice(0, 60);
};

// V6 : Permet de décaler les dates selon l'année en cours
function getDynamicCalendar(season) {
  const diffYears = season - 2026;
  if (diffYears === 0) return CALENDAR_2026;
  return CALENDAR_2026.map(round => ({
    ...round,
    trainingDates: round.trainingDates.map(d => shiftYear(d, diffYears)),
    qualifyingDate: shiftYear(round.qualifyingDate, diffYears),
    raceDate: shiftYear(round.raceDate, diffYears),
  }));
}
function shiftYear(dateStr, years) {
  const parts = dateStr.split('-');
  return `${parseInt(parts[0]) + years}-${parts[1]}-${parts[2]}`;
}

export function calendarEvents(save = { season: 2026 }) {
  const cal = getDynamicCalendar(save.season || 2026);
  return cal.flatMap((round) => [
    ...round.trainingDates.map((date, dayIndex) => ({ date, type: 'training', dayIndex, round })),
    { date: round.qualifyingDate, type: 'qualifying', round },
    { date: round.raceDate, type: 'race', round },
  ]).sort(sortEvents);
}

export function timelineEvents(save) {
  const upgrades = save.activities.upgrades.map((upgrade) => ({
    date: upgrade.completesOn, type: 'upgrade', upgrade,
    team: save.teams.find((entry) => entry.id === upgrade.teamId),
  }));
  const marketEvents = transferEvents(save);
  const events = [...calendarEvents(save), ...upgrades, ...marketEvents];

  // V6 : Événement spécial de début de saison au 1er janvier s'il est à venir
  const nextYear = (save.season || 2026) + 1;
  const newYearDate = `${nextYear}-01-01`;
  if (save.needsSeasonStart && dateMs(newYearDate) >= dateMs(save.gameDate)) {
    events.push({ date: newYearDate, type: 'season-start' });
  }

  return events.sort(sortEvents);
}

export function eventsForWeek(save, startDate) {
  const end = addDays(startDate, 6);
  return timelineEvents(save).filter((event) => dateMs(event.date) >= dateMs(startDate) && dateMs(event.date) <= dateMs(end));
}

export function roundStatus(round, gameDate) {
  if (dateMs(gameDate) < dateMs(round.trainingDates[0])) return 'À venir';
  if (dateMs(gameDate) < dateMs(round.qualifyingDate)) return 'En cours';
  if (dateMs(gameDate) <= dateMs(round.raceDate)) return 'Disponible en V3';
  return 'Terminé';
}

export function nextProgression(save) {
  const next = timelineEvents(save).find((event) => dateMs(event.date) > dateMs(save.gameDate));
  if (!next && !save.needsSeasonStart) {
    // Si la saison est finie et plus aucun event, on lance closeSeason
    closeSeason(save);
    return timelineEvents(save).find((event) => dateMs(event.date) > dateMs(save.gameDate));
  }
  return next;
}

export function upgradeCost(team, dept, difficulty) {
  const base = 1.5 + Math.pow(team.departmentRatings[dept] - 50, 1.18) / 18;
  return round2(base * UPGRADE_LEVELS[difficulty].costMultiplier);
}

export function startUpgrade(save, teamId, dept, date = save.gameDate) {
  const team = save.teams.find((entry) => entry.id === teamId);
  if (!team || !DEPT_KEYS.includes(dept)) return { ok: false, error: 'Département introuvable.' };
  if (team.departmentRatings[dept] >= 100) return { ok: false, error: 'Ce département a déjà atteint la note maximale.' };
  if (save.activities.upgrades.some((item) => item.teamId === teamId && item.dept === dept)) return { ok: false, error: 'Une amélioration est déjà en cours pour ce département.' };
  const cost = upgradeCost(team, dept, save.difficulty.upgradeDifficulty);
  if (team.balance < cost) return { ok: false, error: `Solde insuffisant : cette amélioration coûte ${cost.toFixed(2)} M€.` };
  team.balance = round2(team.balance - cost);
  const upgrade = { id: `upgrade-${teamId}-${dept}-${date}`, teamId, dept, cost, startedOn: date, completesOn: addDays(date, UPGRADE_DURATION_DAYS) };
  save.activities.upgrades.push(upgrade);
  if (teamId === save.playerTeamId) {
    log(save, date, `Amélioration ${deptLabel(dept)} lancée pour ${team.name} (${cost.toFixed(2)} M€).`, 'upgrade-start');
  }
  return { ok: true, upgrade };
}

function finishUpgrades(save, date) {
  const complete = save.activities.upgrades.filter((item) => item.completesOn === date);
  for (const upgrade of complete) {
    const team = save.teams.find((entry) => entry.id === upgrade.teamId);
    const before = team.departmentRatings[upgrade.dept];
    team.departmentRatings[upgrade.dept] = clampRating(before + 1);
    if (upgrade.teamId === save.playerTeamId) {
      log(save, date, `Amélioration ${deptLabel(upgrade.dept)} terminée pour ${team.name} : ${before} → ${team.departmentRatings[upgrade.dept]}.`, 'upgrade-complete');
    }
  }
  save.activities.upgrades = save.activities.upgrades.filter((item) => !complete.includes(item));
}

function trainAllDrivers(save, event) {
  const eventId = `${event.round.id}-${event.date}`;
  if (save.calendar.trainingCompletedEvents.includes(eventId) || save.calendar.trainingCompletedEvents.includes(`${event.round.id}-legacy`)) return;
  const playerGains = [];
  for (const driver of save.drivers) {
    const before = driverOverall(driver);
    const statsBefore = { ...driver.stats };
    STAT_KEYS.forEach((key) => { driver.stats[key] = Math.min(100, round2(driver.stats[key] + TRAINING_GAIN)); });
    if (driver.teamId === save.playerTeamId) {
      playerGains.push({ driverId: driver.id, name: driver.name, before, after: driverOverall(driver), statsBefore, statsAfter: { ...driver.stats } });
    }
  }
  save.calendar.trainingCompletedEvents.push(eventId);
  save.activities.trainingHistory.unshift({ roundId: event.round.id, date: event.date, gains: playerGains });
  save.activities.trainingHistory = save.activities.trainingHistory.slice(0, 12);
  log(save, event.date, `Entraînement terminé pour toutes les écuries avant le ${event.round.name}.`, 'training');
}

function planAiUpgrades(save, date) {
  for (const team of save.teams.filter((entry) => !entry.isPlayer)) {
    const activeDepts = new Set(save.activities.upgrades.filter((item) => item.teamId === team.id).map((item) => item.dept));
    const dept = [...DEPT_KEYS].filter((key) => !activeDepts.has(key)).sort((a, b) => team.departmentRatings[a] - team.departmentRatings[b] || a.localeCompare(b))[0];
    if (!dept) continue;
    const cost = upgradeCost(team, dept, 'normal');
    if (team.balance >= round2(cost * 1.35)) {
      const originalDifficulty = save.difficulty.upgradeDifficulty;
      save.difficulty.upgradeDifficulty = 'normal';
      startUpgrade(save, team.id, dept, date);
      save.difficulty.upgradeDifficulty = originalDifficulty;
    }
  }
}

// V6 : Clôture de la saison
export function closeSeason(save) {
  const currentSeason = save.season || 2026;
  const nextSeason = currentSeason + 1;

  // 1. Primes (logique simplifiée pour l'instant)
  save.teams.forEach(t => t.balance = round2(t.balance + 5)); // Bonus fixe de fin d'année 

  // 2. Réglementation
  const regResults = applyRegulationChanges(save);
  save.seasonResults = { regulationLogs: regResults.logs }; // Stocké pour l'UI

  // 3. Stats pilotes (variation aléatoire bornée)
  save.drivers.forEach(driver => {
    const varPace = (Math.random() * 0.2) - 0.1;
    const varCons = (Math.random() * 0.2) - 0.1;
    driver.stats.pace = Math.max(1, Math.min(100, Math.floor(driver.stats.pace * (1 + varPace))));
    driver.stats.consistency = Math.max(1, Math.min(100, Math.floor(driver.stats.consistency * (1 + varCons))));
  });

  // 4. Libération des agents libres sans contrats
  save.drivers.forEach(driver => {
    if (driver.contract && driver.contract.endSeason <= currentSeason) {
      if (!driver.futureContract || driver.futureContract.startSeason > nextSeason) {
        driver.contract = null;
        driver.teamId = null;
        driver.loyalty = null;
      }
    }
  });

  // 5. Exécution marché IA (compléter les baquets vides)
  save.teams.forEach(team => {
    const slotsFilled = save.drivers.filter(d => (d.contract?.teamId === team.id && d.contract?.endSeason >= nextSeason) || (d.futureContract?.teamId === team.id)).length;
    for (let i = slotsFilled; i < 2; i++) {
      replacementCascade(save, team.id, i + 1, save.gameDate);
    }
  });

  // 6. Reset calendrier
  save.season = nextSeason;
  save.needsSeasonStart = true;
  save.calendar = { ...save.calendar, trainingCompletedEvents: [] };
  log(save, save.gameDate, `Fin de la saison ${currentSeason}. Préparation de ${nextSeason}...`, 'info');
}

export function initNewSeasonStart(save) {
  // Paiement des salaires et activation
  save.drivers.forEach(d => {
    if (d.contract && d.contract.teamId) {
      const team = save.teams.find(t => t.id === d.contract.teamId);
      if (team) team.balance = round2(team.balance - (d.contract.salary || 0));
    }
  });
  save.needsSeasonStart = false;
  log(save, save.gameDate, `Début de la saison ${save.season} ! Les salaires ont été versés.`, 'info');
}

export function advanceToNextEvent(save) {
  const next = nextProgression(save);
  if (!next && !save.needsSeasonStart) return { ok: false, error: `La saison ${save.season} est terminée.` };
  while (true) {
    const result = advanceOneDay(save);
    if (!result.ok || result.events.length > 0) return result;
  }
}

export function advanceOneDay(save) {
  const targetDate = addDays(save.gameDate, 1);
  const events = timelineEvents(save).filter((event) => event.date === targetDate);
  const todayEvents = timelineEvents(save).filter((event) => event.date === save.gameDate);

  const todayRace = todayEvents.find((event) => event.type === 'race');
  if (todayRace && !save.weekends?.[todayRace.round.id]?.race) {
    return { ok: false, blocked: true, event: todayRace, events: [], error: 'Terminez la course avant de passer au jour suivant.' };
  }

  const race = events.find((event) => event.type === 'race');
  if (race && !save.weekends?.[race.round.id]?.qualifying?.grid?.length) {
    return { ok: false, blocked: true, event: race, events: [], error: 'Terminez les qualifications avant de passer à la course.' };
  }

  const completedUpgrades = events.filter((event) => event.type === 'upgrade');
  completedUpgrades.forEach(() => finishUpgrades(save, targetDate));

  save.gameDate = targetDate;

  const marketEvents = processTransferEvents(save, targetDate) || [];

  for (const event of events) {
    if (event.type === 'season-start') {
      initNewSeasonStart(save); // V6 : Exécution 1er janvier
    }
    if (event.type === 'training') {
      trainAllDrivers(save, event);
      planAiUpgrades(save, event.date);
    }
    if (event.round) save.calendar.currentRound = event.round.round;
  }

  const allEvents = [...events.filter((event) => event.type !== 'scouting-complete' && event.type !== 'transfer-response'), ...marketEvents];
  return { ok: true, event: allEvents[0] || null, events: allEvents };
}

function sortEvents(a, b) {
  const priority = { 'season-start': -1, upgrade: 0, training: 1, qualifying: 2, race: 3, 'scouting-complete': 4, 'transfer-response': 5, prospecting: 4, offer: 5 };
  return dateMs(a.date) - dateMs(b.date) || (priority[a.type] ?? 9) - (priority[b.type] ?? 9);
}

function deptLabel(key) {
  return { aero: 'aérodynamique', chassis: 'châssis', power: 'moteur' }[key] || key;
}