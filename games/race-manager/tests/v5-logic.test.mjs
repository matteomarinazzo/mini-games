import assert from 'node:assert/strict';
import { aggregateStandings, migrateContracts, listMarketDrivers } from '../js/core/contracts.js';

const storage = new Map();
globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };

const save = {
  season: 2026,
  playerTeamId: 'p',
  teams: [{ id: 'p', name: 'Player', color: '#f00' }, { id: 'a', name: 'Alpha', color: '#00f' }],
  drivers: [{ id: 'd1', name: 'One', teamId: 'p' }, { id: 'd2', name: 'Two', teamId: 'a' }],
  standings: { drivers: [{ driverId: 'd1', points: 25 }, { driverId: 'd2', points: 18 }], teams: [{ teamId: 'p', points: 25 }, { teamId: 'a', points: 18 }] },
  weekends: { r1: { race: { results: [{ driverId: 'd1', position: 1, teamId: 'p' }, { driverId: 'd2', position: 3, teamId: 'a' }] } } },
};
const rows = aggregateStandings(save);
assert.equal(rows.drivers[0].gap, 0);
assert.equal(rows.drivers[0].wins, 1);
assert.equal(rows.drivers[1].podiums, 1);
assert.equal(rows.teams[1].gap, 7);

const migrated = migrateContracts({ season: 2026, drivers: [{ id: 'd1', teamId: 'p' }, { id: 'd2', teamId: null, contract: null }] });
assert.equal(migrated.drivers[0].contract.teamId, 'p');
assert.equal(migrated.drivers[0].contract.endSeason, 2027);
assert.equal(migrated.drivers[1].contract, null);
assert.equal(listMarketDrivers(migrated.drivers, 2026).length, 1);
console.log('v5-logic: OK');
