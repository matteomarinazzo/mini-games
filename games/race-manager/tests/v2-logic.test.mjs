import assert from 'node:assert/strict';
import { CALENDAR_2026 } from '../js/data/calendar-2026.js';
import { createNewGame, migrateSave } from '../js/core/game-state.js';
import { advanceOneDay, advanceToNextEvent, eventsForWeek, startUpgrade } from '../js/core/progression.js';
import { validateSave } from '../js/core/validation.js';
import { DRIVERS_2026 } from '../js/data/drivers-2026.js';

assert.equal(CALENDAR_2026.length, 24);
assert.deepEqual(CALENDAR_2026[0].trainingDates, ['2026-03-04', '2026-03-05', '2026-03-06']);
assert.equal(CALENDAR_2026.at(-1).raceDate, '2026-12-06');

const game = createNewGame({
  teamName: 'Ecurie Test', color: '#123456', budget: 25,
  driverIds: ['f2-mercier', 'f2-herrera'], startLevel: 'medium', upgradeLevel: 'normal',
}, 1);
assert.equal(game.ok, true);
const save = game.save;
const before = save.drivers.find((driver) => driver.teamId === save.playerTeamId).stats.start;
const rivalBefore = save.drivers.find((driver) => driver.teamId !== save.playerTeamId).stats.start;
assert.equal(startUpgrade(save, save.playerTeamId, 'aero').ok, true);
assert.equal(startUpgrade(save, save.playerTeamId, 'chassis').ok, true);
assert.equal(startUpgrade(save, save.playerTeamId, 'aero').ok, false);
assert.equal(eventsForWeek(save, save.gameDate).some((event) => event.type === 'upgrade'), true);
assert.equal(advanceToNextEvent(save).event.type, 'upgrade');
assert.equal(save.activities.upgrades.length, 0);
assert.equal(advanceToNextEvent(save).event.type, 'training');
assert.equal(save.gameDate, '2026-03-04');
assert.ok(save.drivers.find((driver) => driver.teamId === save.playerTeamId).stats.start > before);
assert.ok(save.drivers.find((driver) => driver.teamId !== save.playerTeamId).stats.start > rivalBefore);
assert.equal(advanceToNextEvent(save).event.type, 'training');
assert.equal(advanceToNextEvent(save).event.type, 'training');
assert.equal(advanceToNextEvent(save).blocked, true);
assert.equal(validateSave(save).ok, true);

const dailyGame = createNewGame({
  teamName: 'Ecurie Jour', color: '#654321', budget: 25,
  driverIds: ['f2-brooks', 'f2-conti'], startLevel: 'medium', upgradeLevel: 'normal',
}, 2).save;
assert.equal(advanceOneDay(dailyGame).ok, true);
assert.equal(dailyGame.gameDate, '2026-01-02');

const v1 = { ...save, schemaVersion: 1, calendar: { currentRound: 0, completedRounds: [] } };
const migrated = migrateSave(v1);
assert.equal(migrated.schemaVersion, 3);
assert.equal(validateSave(migrated).ok, true);

const migratedV2 = migrateSave({ ...save, schemaVersion: 2, calendar: { ...save.calendar, trainingCompletedRounds: [] } });
assert.equal(migratedV2.schemaVersion, 3);
assert.equal(validateSave(migratedV2).ok, true);

console.log('V2 logic checks passed.');
