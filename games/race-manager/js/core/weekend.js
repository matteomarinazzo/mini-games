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

export function saveStrategies(save, roundId, playerStrategies) {
  const weekend = weekendFor(save, roundId);
  if (!weekend.qualifying.grid.length) return { ok: false, error: 'La grille de départ doit être établie avant la stratégie.' };
  if (weekend.race) return { ok: false, error: 'La course est déjà terminée.' };
  const playerDrivers = save.drivers.filter((driver) => driver.teamId === save.playerTeamId);
  for (const driver of playerDrivers) {
    const strategy = playerStrategies[driver.id];
    if (!strategy || !TYRE_COMPOUNDS.includes(strategy.start) || !TYRE_COMPOUNDS.includes(strategy.stop)) {
      return { ok: false, error: 'Choisissez les deux pneus pour chaque pilote.' };
    }
    weekend.strategies[driver.id] = { start: strategy.start, stop: strategy.stop, controlledByPlayer: true };
  }
  for (const driver of save.drivers.filter((entry) => entry.teamId !== save.playerTeamId)) {
    if (!weekend.strategies[driver.id]) weekend.strategies[driver.id] = aiStrategy(save, weekend, driver);
  }
  save.eventLog.unshift({ id: `${roundId}-strategies`, date: save.gameDate, type: 'strategy', message: `Stratégies pneus validées pour R${roundId}.` });
  save.eventLog = save.eventLog.slice(0, 60);
  return { ok: true };
}

function aiStrategy(save, weekend, driver) {
  const roll = random(`${save.saveId}-${weekend.roundId}-strategy-${driver.id}`);
  if (weekend.weather === 'rain') return { start: 'wet', stop: 'wet', controlledByPlayer: false };
  if (weekend.weather === 'mixed') return { start: roll > .5 ? 'intermediate' : 'medium', stop: roll > .5 ? 'medium' : 'intermediate', controlledByPlayer: false };
  return roll > .64 ? { start: 'soft', stop: 'hard', controlledByPlayer: false } : { start: 'medium', stop: 'hard', controlledByPlayer: false };
}

export function runRace(save, roundId) {
  const weekend = weekendFor(save, roundId);
  if (weekend.race) return { ok: false, error: 'Cette course est déjà terminée.' };
  if (!weekend.qualifying.grid.length) return { ok: false, error: 'Les qualifications doivent être terminées.' };
  if (!save.drivers.filter((driver) => driver.teamId === save.playerTeamId).every((driver) => weekend.strategies[driver.id])) return { ok: false, error: 'Validez les stratégies de vos pilotes avant la course.' };
  const drivers = byId(save.drivers);
  const teams = byId(save.teams);
  const entries = weekend.qualifying.grid.map((grid) => {
    const driver = drivers.get(grid.driverId);
    const team = teams.get(driver.teamId);
    const strategy = weekend.strategies[driver.id] || aiStrategy(save, weekend, driver);
    const strategyScore = tyreScore(strategy, weekend.weather);
    const performance = driver.stats.raceManagement * .34 + driver.stats.tyres * .20 + driver.stats.attack * .14
      + driver.stats.overtaking * .10 + teamRating(team) * .22 + strategyScore;
    const variance = (random(`${save.saveId}-${roundId}-race-${driver.id}`) - .5) * 7;
    const raceScore = performance + variance - (grid.position - 1) * .14;
    return { driverId: driver.id, gridPosition: grid.position, score: raceScore, strategy };
  }).sort((a, b) => b.score - a.score || a.gridPosition - b.gridPosition).map((entry, index) => ({ ...entry, position: index + 1, points: RACE_POINTS[index] || 0 }));
  weekend.race = { results: entries, completedAt: save.gameDate };
  if (!save.calendar.completedRounds.includes(roundId)) save.calendar.completedRounds.push(roundId);
  updateStandings(save, entries);
  save.eventLog.unshift({ id: `${roundId}-race`, date: save.gameDate, type: 'race', message: `Course de R${roundId} terminée. Résultats enregistrés.` });
  save.eventLog = save.eventLog.slice(0, 60);
  return { ok: true, results: entries };
}

function tyreScore(strategy, weather) {
  const wetReady = strategy.start === 'wet' || strategy.start === 'intermediate';
  if (weather === 'rain') return wetReady ? 2.4 : -4.2;
  if (weather === 'mixed') return wetReady ? 1.2 : -.8;
  return strategy.start === 'soft' ? 1.2 : strategy.start === 'medium' ? .8 : strategy.start === 'hard' ? .25 : -2.2;
}

function updateStandings(save, results) {
  const driverPoints = new Map(save.standings.drivers.map((entry) => [entry.driverId, entry.points]));
  for (const result of results) driverPoints.set(result.driverId, (driverPoints.get(result.driverId) || 0) + result.points);
  save.standings.drivers = [...driverPoints].map(([driverId, points]) => ({ driverId, points })).sort((a, b) => b.points - a.points);
  const drivers = byId(save.drivers);
  const teamPoints = new Map();
  for (const entry of save.standings.drivers) {
    const teamId = drivers.get(entry.driverId).teamId;
    teamPoints.set(teamId, (teamPoints.get(teamId) || 0) + entry.points);
  }
  save.standings.teams = [...teamPoints].map(([teamId, points]) => ({ teamId, points })).sort((a, b) => b.points - a.points);
}

function driverPotential(driver) {
  return driver.stats.qualifying * .48 + driver.stats.attack * .14 + driver.stats.aggression * .08 + driver.stats.start * .05;
}
