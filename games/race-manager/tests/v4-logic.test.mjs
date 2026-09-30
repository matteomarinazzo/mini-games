import assert from 'node:assert/strict';
import { createNewGame } from '../js/core/game-state.js';
import { runQualifyingSession, weekendFor, simulateRemainingQualifications } from '../js/core/weekend.js';
import { initRaceState, simulateLap, finishRace, orderPitStop } from '../js/core/race-engine.js';

console.log('Running V4 logic tests...');

const game = createNewGame({
  teamName: 'Ecurie V4', color: '#123456', budget: 25,
  driverIds: ['f2-mercier', 'f2-herrera'], startLevel: 'medium', upgradeLevel: 'normal',
}, 1);

assert.equal(game.ok, true, 'Game creation should succeed');
const save = game.save;
save.gameDate = '2026-03-07'; // Australia Qualifying
save.calendar.currentRound = 1;

// Simulate qualifying
simulateRemainingQualifications(save, 'australia');
const weekend = weekendFor(save, 'australia');
assert.equal(weekend.qualifying.grid.length, 24, 'Qualifying grid should have 24 drivers');

// Init race
save.gameDate = '2026-03-08'; // Race date
const playerOptions = {
  'f2-mercier': { compound: 'soft', pace: 'aggressive', riskLevel: 'high', plannedStops: [{ lap: 15, compound: 'hard' }] },
  'f2-herrera': { compound: 'medium', pace: 'balanced', riskLevel: 'normal', plannedStops: [{ lap: 25, compound: 'hard' }] }
};
const startReactions = { 'f2-mercier': 0.8, 'f2-herrera': 0 };

const raceState = initRaceState(save, 'australia', startReactions, playerOptions);
assert.equal(raceState.entries.length, 24, 'Race state should have 24 entries');
assert.equal(raceState.currentLap, 0, 'Initial lap should be 0');
assert.equal(raceState.completed, false, 'Race should not be completed');

// Simulate 10 laps
for (let i = 0; i < 10; i++) {
  simulateLap(raceState);
}
assert.equal(raceState.currentLap, 10, 'Current lap should be 10');

// Test pit stop logic
const mercier = raceState.entries.find(e => e.driverId === 'f2-mercier');
assert.equal(mercier.tyres.lapsOn, 10, 'Tyres should have 10 laps on them');
assert.equal(mercier.tyres.compound, 'soft', 'Compound should be soft');

// Force a pit stop
orderPitStop(raceState, 'f2-mercier', 'medium');
simulateLap(raceState); // Lap 11
assert.equal(mercier.tyres.lapsOn, 0, 'Tyres lapsOn should reset after pit');
assert.equal(mercier.tyres.compound, 'medium', 'Compound should change to medium');
assert.equal(mercier.pitStops.length, 1, 'Pit stop log should record 1 stop');

// Simulate remaining race
while (!raceState.completed) {
  simulateLap(raceState);
}

assert.equal(raceState.currentLap, raceState.laps, 'Race should finish at max laps');
assert.equal(raceState.completed, true, 'Race should be marked completed');

// Finish race and check results
const res = finishRace(raceState, save);
assert.equal(res.ok, true, 'Finish race should succeed');
assert.equal(res.results.length, 24, 'Results should have 24 entries');
assert.equal(save.standings.drivers.length > 0, true, 'Driver standings should be populated');

console.log('V4 logic tests passed.');
