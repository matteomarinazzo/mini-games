import assert from 'node:assert/strict';
import { createNewGame, migrateSave } from '../js/core/game-state.js';
import { advanceOneDay } from '../js/core/progression.js';
import { runQualifyingSession, simulateRemainingQualifications, weekendFor } from '../js/core/weekend.js';

const game = createNewGame({
  teamName: 'Ecurie V3', color: '#123456', budget: 25,
  driverIds: ['f2-mercier', 'f2-herrera'], startLevel: 'medium', upgradeLevel: 'normal',
}, 1);
assert.equal(game.ok, true);
const save = game.save;
save.gameDate = '2026-03-07';
save.calendar.currentRound = 1;

const q1 = runQualifyingSession(save, 'australia', {});
assert.equal(q1.ok, true);
assert.equal(q1.results.length, 24);
const q2 = runQualifyingSession(save, 'australia', {});
assert.equal(q2.results.length, 17);
const q3 = runQualifyingSession(save, 'australia', {});
assert.equal(q3.results.length, 10);
const weekend = weekendFor(save, 'australia');
assert.equal(weekend.qualifying.grid.length, 24);
assert.equal(runQualifyingSession(save, 'australia').ok, false);

assert.equal(simulateRemainingQualifications(save, 'australia'), null);
assert.equal(weekend.qualifying.grid[0].position, 1);

const locked = createNewGame({
  teamName: 'Ecurie Lock', color: '#234567', budget: 25,
  driverIds: ['f2-brooks', 'f2-conti'], startLevel: 'medium', upgradeLevel: 'normal',
}, 2).save;
locked.gameDate = '2026-03-07';
assert.equal(advanceOneDay(locked).blocked, true);

const v3 = { ...save, schemaVersion: 3 };
delete v3.weekends;
assert.equal(migrateSave(v3).schemaVersion, 4);

console.log('V3 logic checks passed.');
