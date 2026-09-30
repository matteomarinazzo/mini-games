/** Moteur V2 sans DOM : calendrier, entraînements, améliorations et IA. */
import { CALENDAR_2026 } from '../data/calendar-2026.js';
import { DEPT_KEYS, STAT_KEYS, TRAINING_GAIN, UPGRADE_DURATION_DAYS, UPGRADE_LEVELS } from './constants.js';
import { clampRating, driverOverall } from './validation.js';
import { round2 } from './utils.js';

const dateMs = (date) => Date.parse(`${date}T12:00:00Z`);
const addDays = (date, days) => new Date(dateMs(date) + days * 86400000).toISOString().slice(0, 10);
const log = (save, date, message, type = 'info') => {
  save.eventLog.unshift({ id: `${date}-${save.eventLog.length}-${type}`, date, message, type });
  save.eventLog = save.eventLog.slice(0, 60);
};

export function calendarEvents() {
  return CALENDAR_2026.flatMap((round) => [
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
  return [...calendarEvents(), ...upgrades].sort(sortEvents);
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
  if (!next) return null;
  if (next.type === 'qualifying' || next.type === 'race') return { ...next, blocked: true };
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

export function advanceToNextEvent(save) {
  const next = nextProgression(save);
  if (!next) return { ok: false, error: 'La saison 2026 est terminée.' };
  while (true) {
    const result = advanceOneDay(save);
    if (!result.ok || result.events.length > 0) return result;
  }
}

/** Avance d’une date simulée et exécute les événements de cette journée. */
export function advanceOneDay(save) {
  const targetDate = addDays(save.gameDate, 1);
  const events = timelineEvents(save).filter((event) => event.date === targetDate);
  const blocked = events.find((event) => event.type === 'qualifying' || event.type === 'race');
  const completedUpgrades = events.filter((event) => event.type === 'upgrade');

  // Une amélioration qui finit le jour des qualifications est bien traitée, sans simuler les qualifications.
  completedUpgrades.forEach(() => finishUpgrades(save, targetDate));
  if (blocked) {
    return { ok: false, blocked: true, event: blocked, events: completedUpgrades, error: blocked.type === 'qualifying' ? 'Qualifications disponibles en V3.' : 'Course disponible en V3.' };
  }

  save.gameDate = targetDate;
  for (const event of events) {
    if (event.type === 'training') {
      trainAllDrivers(save, event);
      planAiUpgrades(save, event.date);
    }
    if (event.round) save.calendar.currentRound = event.round.round;
  }
  return { ok: true, event: events[0] || null, events };
}

function sortEvents(a, b) {
  const priority = { upgrade: 0, training: 1, qualifying: 2, race: 3 };
  return dateMs(a.date) - dateMs(b.date) || (priority[a.type] ?? 9) - (priority[b.type] ?? 9);
}

function deptLabel(key) {
  return { aero: 'aérodynamique', chassis: 'châssis', power: 'moteur' }[key];
}
