/** Moteur V3 du week-end : qualifications, stratégies et course rapide. */
import { RACE_POINTS, TYRE_COMPOUNDS } from './constants.js';
import { hashString, round2 } from './utils.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const random = (seed) => (hashString(seed) % 10_000) / 10_000;
const byId = (items) => new Map(items.map((item) => [item.id, item]));
const teamRating = (team) => (team.departmentRatings.aero + team.departmentRatings.chassis + team.departmentRatings.power) / 3;

export function weekendFor(save, roundId) {
  if (!save.weekends[roundId]) {
    const weatherRoll = random(`${save.saveId}-${roundId}-weather`);
    save.weekends[roundId] = {
      roundId,
      weather: weatherRoll > .82 ? 'rain' : weatherRoll > .58 ? 'mixed' : 'dry',
      rainRisk: Math.round(weatherRoll * 100),
      qualifying: { sessions: {}, grid: [] },
      strategies: {},
      race: null,
    };
  }
  return save.weekends[roundId];
}

export function nextQualifyingSession(save, roundId) {
  const weekend = weekendFor(save, roundId);
  return ['Q1', 'Q2', 'Q3'].find((name) => !weekend.qualifying.sessions[name]) || null;
}

export function qualifyingParticipants(save, roundId) {
  const weekend = weekendFor(save, roundId);
  const next = nextQualifyingSession(save, roundId);
  if (next === 'Q1') return save.drivers.map((driver) => driver.id);
  if (next === 'Q2') return weekend.qualifying.sessions.Q1.results.slice(0, 17).map((row) => row.driverId);
  if (next === 'Q3') return weekend.qualifying.sessions.Q2.results.slice(0, 10).map((row) => row.driverId);
  return [];
}

export function playerQualifyingDrivers(save, roundId) {
  return qualifyingParticipants(save, roundId)
    .filter((id) => save.drivers.find((driver) => driver.id === id)?.teamId === save.playerTeamId);
}

export function runQualifyingSession(save, roundId, reactions = {}) {
  const weekend = weekendFor(save, roundId);
  const session = nextQualifyingSession(save, roundId);
  if (!session) return { ok: false, error: 'Les qualifications sont déjà terminées.' };
  const drivers = byId(save.drivers);
  const teams = byId(save.teams);
  const entries = qualifyingParticipants(save, roundId).map((driverId) => {
    const driver = drivers.get(driverId);
    const team = teams.get(driver.teamId);
    const reaction = clamp(Number(reactions[driverId]) || 0, -1, 1);
    const performance = driver.stats.qualifying * .48 + driver.stats.attack * .14 + driver.stats.aggression * .08
      + driver.stats.start * .05 + teamRating(team) * .25 + reaction * 2.5;
    const variance = (random(`${save.saveId}-${roundId}-${session}-${driverId}`) - .5) * 900;
    const circuitOffset = (hashString(roundId) % 11) * 600;
    return { driverId, timeMs: Math.round(88_000 + circuitOffset - performance * 52 + variance), reaction };
  }).sort((a, b) => a.timeMs - b.timeMs || a.driverId.localeCompare(b.driverId)).map((entry, index) => ({ ...entry, rank: index + 1 }));

  weekend.qualifying.sessions[session] = { name: session, results: entries, completedAt: save.gameDate };
  if (session === 'Q3') finishQualifying(save, roundId);
  return { ok: true, session, results: entries, complete: session === 'Q3' };
}

/** Termine sans interaction les sessions restantes, après l'élimination du joueur. */
export function simulateRemainingQualifications(save, roundId) {
  let result = null;
  while (nextQualifyingSession(save, roundId)) result = runQualifyingSession(save, roundId, {});
  return result;
}

function finishQualifying(save, roundId) {
  const weekend = weekendFor(save, roundId);
  const { Q1, Q2, Q3 } = weekend.qualifying.sessions;
  weekend.qualifying.grid = [...Q3.results, ...Q2.results.slice(10), ...Q1.results.slice(17)]
    .map((entry, index) => ({ driverId: entry.driverId, position: index + 1, timeMs: entry.timeMs }));
  const drivers = byId(save.drivers);
  const expected = [...save.drivers].sort((a, b) => driverPotential(b) - driverPotential(a));
  const expectedRank = new Map(expected.map((driver, index) => [driver.id, index + 1]));
  for (const row of weekend.qualifying.grid) {
    const driver = drivers.get(row.driverId);
    const delta = clamp((expectedRank.get(driver.id) - row.position) * .025, -.18, .18);
    driver.stats.qualifying = round2(clamp(driver.stats.qualifying + delta, 50, 100));
    driver.stats.attack = round2(clamp(driver.stats.attack + delta / 2, 50, 100));
  }
  save.eventLog.unshift({ id: `${roundId}-qualifying`, date: save.gameDate, type: 'qualifying', message: `Qualifications terminées pour R${save.calendar.currentRound}. Grille de départ enregistrée.` });
  save.eventLog = save.eventLog.slice(0, 60);
}



function driverPotential(driver) {
  return driver.stats.qualifying * .48 + driver.stats.attack * .14 + driver.stats.aggression * .08 + driver.stats.start * .05;
}
