/**
 * Moteur V4 de course : simulation tour par tour, pneus, usure, dépassements,
 * incidents, arrêts aux stands, DNF. Aucune dépendance au DOM.
 *
 * Fonctions publiques :
 *   initRaceState(save, roundId, startReactions, playerOptions)
 *   simulateLap(state)
 *   canPitThisLap(state, driverId)
 *   orderPitStop(state, driverId, compound)
 *   changePace(state, driverId, pace)
 *   finishRace(state, save)
 */
import {
  TYRE_DATA, TYRE_COMPOUNDS, RACE_POINTS, PACE_MULTIPLIERS,
  PIT_STOP_BASE, PIT_STOP_VARIANCE, DOUBLE_STACK_PENALTY,
  COMPOUND_RULE_PENALTY_SECONDS, MIN_DRY_COMPOUNDS,
  PUNCTURE_THRESHOLD, CLIFF_PENALTY_MAX_MS,
} from './constants.js';
import { circuitFor } from '../data/circuits-2026.js';
import { hashString, round2 } from './utils.js';
import { weekendFor } from './weekend.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Pseudo-random déterministe basé sur une seed string.
 * Retourne un nombre dans [0, 1).
 */
function seededRandom(seed) {
  return (hashString(String(seed)) % 10_000) / 10_000;
}

/** Moyenne des 3 départements d'une équipe. */
function teamRating(team) {
  return (team.departmentRatings.aero + team.departmentRatings.chassis + team.departmentRatings.power) / 3;
}

// ────────────────────────────────────────────────────────
// Initialisation
// ────────────────────────────────────────────────────────

/**
 * Crée l'état de course à partir de la sauvegarde et de la grille de départ.
 *
 * @param {object} save           La sauvegarde complète.
 * @param {string} roundId        ID de la manche (ex: 'australia').
 * @param {object} startReactions Map driverId → bonus [-1, 1] issu du mini-jeu Lights Out.
 * @param {object} playerOptions  Map driverId → { compound, pace, riskLevel, plannedStops: [{ lap, compound }] }
 * @returns {object} raceState
 */
export function initRaceState(save, roundId, startReactions = {}, playerOptions = {}) {
  const weekend = weekendFor(save, roundId);
  const circuit = circuitFor(roundId);
  const grid = weekend.qualifying.grid;
  const driversMap = new Map(save.drivers.map((d) => [d.id, d]));
  const teamsMap = new Map(save.teams.map((t) => [t.id, t]));

  // Pré-calculer les changements de météo
  const weatherChanges = generateWeatherChanges(save.saveId, roundId, circuit, weekend.weather);

  // Construire les entrées de course
  const entries = grid.map((row) => {
    const driver = driversMap.get(row.driverId);
    const team = teamsMap.get(driver.teamId);
    const isPlayer = driver.teamId === save.playerTeamId;
    const opts = playerOptions[driver.id];
    const aiStrat = isPlayer ? null : generateAiRaceStrategy(save.saveId, roundId, driver, team, weekend, circuit);

    const startCompound = opts?.compound || aiStrat?.compound || 'medium';
    const pace = opts?.pace || aiStrat?.pace || 'balanced';
    const riskLevel = opts?.riskLevel || aiStrat?.riskLevel || 'normal';
    const plannedStops = opts?.plannedStops || aiStrat?.plannedStops || [];

    return {
      driverId: driver.id,
      teamId: driver.teamId,
      position: row.position,
      gridPosition: row.position,
      gap: 0,
      lapTime: 0,
      tyres: { compound: startCompound, wear: 100, lapsOn: 0 },
      compoundsUsed: new Set([startCompound]),
      pitStops: [],
      pitThisLap: false,
      status: 'racing',
      dnfReason: null,
      damage: 0,
      pace,
      riskLevel,
      plannedStops,
      totalTime: 0,
      isPlayer,
    };
  });

  // Appliquer le départ (premier tour simulé à l'init)
  applyRaceStart(entries, driversMap, startReactions, save.saveId, roundId);

  const state = {
    roundId,
    circuitId: circuit.id,
    laps: circuit.laps,
    currentLap: 0,
    weather: weekend.weather,
    weatherChanges,
    entries,
    log: [],
    completed: false,
    results: null,
    _circuit: circuit,
    _driversMap: driversMap,
    _teamsMap: teamsMap,
    _saveId: save.saveId,
    _playerTeamId: save.playerTeamId,
  };

  return state;
}

/**
 * Sérialise l'état de course pour la sauvegarde (supprime les objets Map et Set).
 */
export function serializeRaceState(state) {
  if (!state) return null;
  return {
    ...state,
    entries: state.entries.map((e) => ({
      ...e,
      compoundsUsed: [...e.compoundsUsed],
    })),
    _circuit: undefined,
    _driversMap: undefined,
    _teamsMap: undefined,
  };
}

/**
 * Restaure un état de course depuis la sauvegarde.
 */
export function deserializeRaceState(data, save, roundId) {
  if (!data) return null;
  const circuit = circuitFor(roundId);
  const driversMap = new Map(save.drivers.map((d) => [d.id, d]));
  const teamsMap = new Map(save.teams.map((t) => [t.id, t]));
  return {
    ...data,
    entries: data.entries.map((e) => ({
      ...e,
      compoundsUsed: new Set(e.compoundsUsed),
    })),
    _circuit: circuit,
    _driversMap: driversMap,
    _teamsMap: teamsMap,
    _saveId: save.saveId,
    _playerTeamId: save.playerTeamId,
  };
}

// ────────────────────────────────────────────────────────
// Météo
// ────────────────────────────────────────────────────────

function generateWeatherChanges(saveId, roundId, circuit, startWeather) {
  const changes = [];
  const roll = seededRandom(`${saveId}-${roundId}-weather-change`);
  if (startWeather === 'dry' && roll < circuit.rainProbability * 0.6) {
    const changeLap = Math.floor(circuit.laps * (0.25 + roll * 0.5));
    changes.push({ lap: changeLap, to: 'rain' });
    const clearRoll = seededRandom(`${saveId}-${roundId}-weather-clear`);
    if (clearRoll > 0.5) {
      changes.push({ lap: Math.min(changeLap + Math.floor(circuit.laps * 0.2), circuit.laps - 3), to: 'dry' });
    }
  } else if (startWeather === 'rain' && roll > 0.6) {
    const changeLap = Math.floor(circuit.laps * (0.3 + roll * 0.3));
    changes.push({ lap: changeLap, to: 'dry' });
  }
  return changes;
}

function getCurrentWeather(state) {
  let weather = state.weather;
  for (const change of state.weatherChanges) {
    if (state.currentLap >= change.lap) weather = change.to;
  }
  return weather;
}

// ────────────────────────────────────────────────────────
// Départ de course
// ────────────────────────────────────────────────────────

function applyRaceStart(entries, driversMap, reactions, saveId, roundId) {
  for (const entry of entries) {
    const driver = driversMap.get(entry.driverId);
    const reactionBonus = clamp(Number(reactions[entry.driverId]) || 0, -1, 1);
    const startSkill = (driver.stats.start / 100) * 3;
    const aggressionFactor = driver.stats.aggression > 85 ? 1.2 : 1;
    const rng = (seededRandom(`${saveId}-${roundId}-start-${entry.driverId}`) - 0.5) * 3;
    const delta = Math.round((reactionBonus * 2 + startSkill + rng) * aggressionFactor);
    entry._startDelta = clamp(delta, -5, 5);
  }

  // Trier par position initiale + delta, en gardant les bornes [1, entries.length]
  const sorted = [...entries].sort((a, b) => {
    const posA = a.gridPosition - (a._startDelta || 0);
    const posB = b.gridPosition - (b._startDelta || 0);
    return posA - posB || a.gridPosition - b.gridPosition;
  });

  sorted.forEach((entry, i) => {
    entry.position = i + 1;
    delete entry._startDelta;
  });

  // Réattribuer dans le tableau d'origine
  const posMap = new Map(sorted.map((e) => [e.driverId, e.position]));
  for (const entry of entries) {
    entry.position = posMap.get(entry.driverId);
  }
}

// ────────────────────────────────────────────────────────
// Stratégie IA
// ────────────────────────────────────────────────────────

function generateAiRaceStrategy(saveId, roundId, driver, team, weekend, circuit) {
  const roll = seededRandom(`${saveId}-${roundId}-racestrat-${driver.id}`);
  const weather = weekend.weather;

  if (weather === 'rain') {
    return { compound: 'wet', pace: 'balanced', riskLevel: 'normal', plannedStops: [{ lap: Math.floor(circuit.laps * 0.5), compound: 'intermediate' }] };
  }
  if (weather === 'mixed') {
    return { compound: 'intermediate', pace: 'balanced', riskLevel: 'normal', plannedStops: [{ lap: Math.floor(circuit.laps * 0.45), compound: 'medium' }] };
  }

  // Sec : choisir en fonction du circuit et du profil
  const tyreSkill = driver.stats.tyres;
  if (roll > 0.7) {
    // Stratégie agressive : soft → hard
    const stopLap = Math.floor(circuit.laps * (0.28 + (roll - 0.7) * 0.3));
    return { compound: 'soft', pace: tyreSkill > 85 ? 'aggressive' : 'balanced', riskLevel: 'normal', plannedStops: [{ lap: stopLap, compound: 'hard' }] };
  }
  if (roll > 0.35) {
    // Stratégie standard : medium → hard
    const stopLap = Math.floor(circuit.laps * (0.42 + (roll - 0.35) * 0.2));
    return { compound: 'medium', pace: 'balanced', riskLevel: 'normal', plannedStops: [{ lap: stopLap, compound: 'hard' }] };
  }
  // Stratégie conservative : hard → medium (rare, circuits à faible usure)
  const stopLap = Math.floor(circuit.laps * (0.55 + roll * 0.15));
  return { compound: 'hard', pace: 'cautious', riskLevel: 'low', plannedStops: [{ lap: stopLap, compound: 'medium' }] };
}

// ────────────────────────────────────────────────────────
// Simulation d'un tour
// ────────────────────────────────────────────────────────

/**
 * Simule un tour de course. Modifie `state` en place.
 * @returns {{ events: string[], completed: boolean }}
 */
export function simulateLap(state) {
  // Snapshot taken before any lap computation: this is the only baseline used
  // to identify a position change in the standings rendered after this lap.
  const oldPositions = new Map(state.entries.map((e) => [e.driverId, e.position]));
  for (const entry of state.entries) entry._posDiff = 0;

  state.currentLap++;
  const lap = state.currentLap;
  const circuit = state._circuit;
  const events = [];
  const weather = getCurrentWeather(state);
  const previousWeather = state._lastWeather || state.weather;

  // Annoncer un changement de météo
  if (weather !== previousWeather) {
    events.push(`Tour ${lap} : ${weather === 'rain' ? '🌧️ La pluie commence à tomber !' : '☀️ La piste sèche.'}`);
  }
  state._lastWeather = weather;

  const active = state.entries.filter((e) => e.status === 'racing');
  const pitsThisLap = new Map(); // teamId → count (pour double-stack)

  for (const entry of active) {
    const driver = state._driversMap.get(entry.driverId);
    const team = state._teamsMap.get(entry.teamId);
    const paceM = PACE_MULTIPLIERS[entry.pace] || PACE_MULTIPLIERS.balanced;
    const tyreD = TYRE_DATA[entry.tyres.compound] || TYRE_DATA.medium;
    entry.pitThisLap = false;

    if (entry._orderedPitCompound) {
      entry.pitThisLap = true;
      entry._pitCompound = entry._orderedPitCompound;
      delete entry._orderedPitCompound;
    }

    // ── Arrêt aux stands planifié ──
    if (entry.plannedStops.length > 0) {
      const nextStop = entry.plannedStops[0];
      if (lap >= nextStop.lap || entry.tyres.wear <= tyreD.cliff + 5) {
        if (!entry.isPlayer) {
          entry.pitThisLap = true;
          entry._pitCompound = nextStop.compound;
          entry.plannedStops.shift();
        } else if (lap === nextStop.lap) {
          entry._needsPitWarning = true;
          // On ne le shift pas ici, on le laissera pour que le joueur gère, 
          // ou on le retire quand le joueur clique sur Pit.
        }
      }
    }

    // ── IA : arrêt d'urgence si usure critique ──
    if (!entry.isPlayer && !entry.pitThisLap && entry.tyres.wear <= 8) {
      entry.pitThisLap = true;
      entry._pitCompound = weather === 'rain' ? 'wet' : weather === 'mixed' ? 'intermediate' : 'hard';
    }

    // ── IA : changement de pneus si météo change ──
    if (!entry.isPlayer && !entry.pitThisLap && weather !== previousWeather) {
      const currentIsWet = entry.tyres.compound === 'wet' || entry.tyres.compound === 'intermediate';
      if (weather === 'rain' && !currentIsWet) {
        entry.pitThisLap = true;
        entry._pitCompound = 'wet';
      } else if (weather === 'dry' && currentIsWet) {
        entry.pitThisLap = true;
        entry._pitCompound = 'medium';
      }
    }

    // ── Usure des pneus ──
    const wearLoss = tyreD.wearRate * circuit.tyreWear * paceM.wear * (1 + entry.damage * 0.003);
    entry.tyres.wear = Math.max(0, round2(entry.tyres.wear - wearLoss));
    entry.tyres.lapsOn++;

    // ── Temps au tour (V4.1 : formule additive) ──
    // 1) Performance pilote+écurie → timeFactor (1.0 = parfait, ~1.03 = faible)
    const driverPerf = (
      driver.stats.raceManagement * 0.25 +
      driver.stats.attack * 0.20 +
      driver.stats.overtaking * 0.10 +
      driver.stats.tyres * 0.20 +
      teamRating(team) * 0.25
    ) / 100;
    const timeFactor = 1.0 + (1.0 - driverPerf) * 0.03;

    // 2) Composé de pneu → malus additif en ms
    const tyrePenalty = tyreD.gripPenaltyMs;

    // 3) Usure au-delà du cliff → pénalité progressive (0 au cliff → CLIFF_PENALTY_MAX_MS à 0%)
    let wearPenalty = 0;
    if (entry.tyres.wear < tyreD.cliff) {
      const degradation = 1 - (entry.tyres.wear / tyreD.cliff);
      wearPenalty = Math.round(CLIFF_PENALTY_MAX_MS * degradation);
    }

    // 4) Pénalité de pneus inadéquats à la météo
    const wetCompound = entry.tyres.compound === 'wet' || entry.tyres.compound === 'intermediate';
    let weatherPenalty = 0;
    if (weather === 'rain' && !wetCompound) weatherPenalty = 6000;
    else if (weather === 'mixed' && !wetCompound) weatherPenalty = 2000;
    else if (weather === 'dry' && wetCompound) weatherPenalty = 4000;

    // 5) Dégâts, variance
    const damagePenalty = entry.damage * 15;
    const variance = (seededRandom(`${state._saveId}-${state.roundId}-lap${lap}-${entry.driverId}`) - 0.5) * 800;

    const lapTimeMs = Math.round(
      circuit.lapTimeBase * timeFactor * paceM.lapTimeFactor
      + tyrePenalty + wearPenalty + weatherPenalty + damagePenalty + variance
    );
    entry.lapTime = lapTimeMs;

    // ── Arrêt aux stands ──
    if (entry.pitThisLap) {
      const teamPits = pitsThisLap.get(entry.teamId) || 0;
      pitsThisLap.set(entry.teamId, teamPits + 1);
      const stackPenalty = teamPits > 0 ? DOUBLE_STACK_PENALTY : 0;
      const pitVariance = seededRandom(`${state._saveId}-pit-${lap}-${entry.driverId}`) * PIT_STOP_VARIANCE;
      const pitTime = (circuit.pitLossSeconds + PIT_STOP_BASE + pitVariance + stackPenalty) * 1000;

      const newCompound = entry._pitCompound || 'medium';
      const oldCompound = entry.tyres.compound;
      entry.tyres = { compound: newCompound, wear: 100, lapsOn: 0 };
      entry.compoundsUsed.add(newCompound);
      entry.pitStops.push({ lap, fromCompound: oldCompound, toCompound: newCompound, durationMs: Math.round(pitTime) });
      entry.totalTime += Math.round(pitTime);
      delete entry._pitCompound;

      events.push(`Tour ${lap} : 🔧 ${driver.name} s'arrête aux stands → ${TYRE_DATA[newCompound] ? newCompound.charAt(0).toUpperCase() + newCompound.slice(1) : newCompound}.${stackPenalty > 0 ? ' (double arrêt !)' : ''}`);
    }

    // Sauvegarder pour l'interpolation de l'UI
    entry._oldTotalTime = entry.totalTime;
    entry.totalTime += lapTimeMs;

    // ── Incidents ──
    const incidentResult = checkIncident(state, entry, driver, weather, lap, paceM);
    if (incidentResult) {
      events.push(incidentResult.message);
      if (incidentResult.dnf) {
        entry.status = 'dnf';
        entry.dnfReason = incidentResult.reason;
        entry.totalTime = Infinity;
      }
    }
  }

  // ── Dépassements ──
  const racingEntries = state.entries.filter((e) => e.status === 'racing');
  racingEntries.sort((a, b) => a.totalTime - b.totalTime);

  for (let i = 1; i < racingEntries.length; i++) {
    const attacker = racingEntries[i];
    const defender = racingEntries[i - 1];
    const gapMs = attacker.totalTime - defender.totalTime;

    // Possibilité de dépassement si l'écart est serré et l'attaquant est plus rapide ce tour
    if (gapMs < 1200 && attacker.lapTime < defender.lapTime) {
      const attackerDriver = state._driversMap.get(attacker.driverId);
      const defenderDriver = state._driversMap.get(defender.driverId);
      const overtakingSkill = attackerDriver.stats.overtaking / 100;
      const defenseSkill = defenderDriver.stats.aggression / 100;
      const speedAdvantage = attacker.lapTime < defender.lapTime ? 0.12 : -0.08;
      const circuitFactor = 1 - circuit.overtakingDifficulty;

      const chance = ((overtakingSkill - defenseSkill * 0.6) * 0.15 + speedAdvantage * circuitFactor) / 3;
      const roll = seededRandom(`${state._saveId}-overtake-${lap}-${attacker.driverId}-${defender.driverId}`);

      if (roll < Math.max(0.01, chance)) {
        // Place the attacker just ahead so the pass is reflected by the standings.
        const passMarginMs = Math.max(30, Math.min(150, Math.round(gapMs * 0.15)));
        const gainedPosition = defender.position;
        const lostPosition = attacker.position;
        attacker.totalTime = defender.totalTime - passMarginMs;

        events.push(`Tour ${lap} : 🏎️ ${attackerDriver.name} gagne P${gainedPosition}, ${defenderDriver.name} perd P${lostPosition}.`);

        // Contact possible lors du dépassement
        const contactRoll = seededRandom(`${state._saveId}-contact-${lap}-${attacker.driverId}`);
        if (contactRoll < chance * 0.15) {
          const damageAmount = Math.round(5 + contactRoll * 25);
          defender.damage = Math.min(100, defender.damage + damageAmount);
          events.push(`Tour ${lap} : 💥 Contact ! ${defenderDriver.name} subit des dégâts (${damageAmount}).`);
        }
      }
    }
  }

  // ── Mise à jour des positions ──
  const allSorted = [...state.entries].sort((a, b) => {
    if (a.status === 'dnf' && b.status !== 'dnf') return 1;
    if (b.status === 'dnf' && a.status !== 'dnf') return -1;
    return a.totalTime - b.totalTime;
  });

  const playerOvertakes = [];

  allSorted.forEach((entry, i) => {
    const newPos = i + 1;
    const oldPos = oldPositions.get(entry.driverId) || newPos;
    entry.position = newPos;
    entry._posDiff = oldPos - newPos; // >0 si gagné, <0 si perdu

    if (entry.status === 'racing' && entry.isPlayer && entry._posDiff !== 0) {
      if (entry._posDiff > 0) {
        const overtaken = allSorted.find(e => oldPositions.get(e.driverId) < oldPos && e.position > newPos);
        if (overtaken) playerOvertakes.push({ type: 'gained', driverId: entry.driverId, otherId: overtaken.driverId, pos: newPos });
      } else {
        const passedBy = allSorted.find(e => oldPositions.get(e.driverId) > oldPos && e.position < newPos);
        if (passedBy) playerOvertakes.push({ type: 'lost', driverId: entry.driverId, otherId: passedBy.driverId, pos: newPos });
      }
    }
  });

  // Calculer les écarts
  const leader = allSorted.find((e) => e.status === 'racing');
  if (leader) {
    for (const entry of allSorted) {
      entry.gap = entry.status === 'racing' ? round2((entry.totalTime - leader.totalTime) / 1000) : null;
    }
  }

  // ── Course terminée ? ──
  const completed = lap >= state.laps;
  if (completed) state.completed = true;

  return { events, completed, playerOvertakes };
}

// ────────────────────────────────────────────────────────
// Incidents
// ────────────────────────────────────────────────────────

function checkIncident(state, entry, driver, weather, lap, paceM) {
  const seed = `${state._saveId}-incident-${lap}-${entry.driverId}`;
  const roll = seededRandom(seed);

  // Probabilité de base : ~0.2% par tour
  let prob = 0.002;

  // V4.1 — Risque progressif de crevaison basé sur PUNCTURE_THRESHOLD (30%)
  if (entry.tyres.wear <= 0) {
    prob = 0.80; // 80% à 0% d'état
  } else if (entry.tyres.wear < 5) {
    prob *= 6.0;
  } else if (entry.tyres.wear < 15) {
    prob *= 3.0;
  } else if (entry.tyres.wear < PUNCTURE_THRESHOLD) {
    // Progression graduelle : ×1 à 30% → ×1.5 à 15%
    prob *= (1 + (PUNCTURE_THRESHOLD - entry.tyres.wear) / PUNCTURE_THRESHOLD);
  }
  // Au-dessus du seuil : pas de malus d'usure sur les incidents

  if (weather === 'rain') prob *= 1.8;
  if (weather === 'mixed') prob *= 1.3;
  if (entry.tyres.wear > 0) prob *= paceM.incident;
  if (entry.damage > 0) prob *= (1 + entry.damage / 50);
  if (lap === 1) prob *= 2.5;

  // La compétence réduit les incidents
  const safetyFactor = (driver.stats.raceManagement / 100) * 0.4 + 0.6;
  prob /= safetyFactor;

  if (roll >= prob) return null;

  // Déterminer le type d'incident
  const typeRoll = seededRandom(seed + '-type');
  const driverName = driver.name;

  // Si les pneus sont sous le seuil de crevaison, la crevaison est plus probable
  const punctureBias = entry.tyres.wear < PUNCTURE_THRESHOLD ? 0.15 : 0;

  if (typeRoll < 0.40 - punctureBias) {
    const timeLoss = Math.round(1000 + typeRoll * 4000);
    entry.totalTime += timeLoss;
    return { message: `Tour ${lap} : ⚠️ ${driverName} fait une erreur et perd ${(timeLoss / 1000).toFixed(1)}s.`, reason: null, dnf: false };
  }
  if (typeRoll < 0.55 - punctureBias) {
    const dmg = Math.round(10 + typeRoll * 30);
    entry.damage = Math.min(100, entry.damage + dmg);
    return { message: `Tour ${lap} : 🔶 ${driverName} endommage son aileron (+${dmg} dégâts).`, reason: null, dnf: false };
  }
  if (typeRoll < 0.80) {
    // Crevaison → pit stop forcé
    entry.pitThisLap = true;
    entry._pitCompound = weather === 'rain' ? 'wet' : 'hard';
    entry.totalTime += 15_000;
    return { message: `Tour ${lap} : 💨 Crevaison pour ${driverName} ! Arrêt forcé.`, reason: null, dnf: false };
  }
  const reasons = ['Problème moteur', 'Sortie de piste', 'Collision', 'Problème de boîte de vitesses'];
  const reason = reasons[Math.floor(typeRoll * reasons.length) % reasons.length];
  return { message: `Tour ${lap} : ❌ ${driverName} abandonne (${reason}).`, reason, dnf: true };
}

// ────────────────────────────────────────────────────────
// Actions du joueur
// ────────────────────────────────────────────────────────

/** Vérifie si un pilote peut faire un arrêt au prochain tour. */
export function canPitThisLap(state, driverId) {
  const entry = state.entries.find((e) => e.driverId === driverId);
  if (!entry || entry.status !== 'racing') return false;
  if (state.currentLap >= state.laps - 1) return false; // pas d'arrêt au dernier tour
  return true;
}

/** Programme un arrêt aux stands pour le prochain tour simulé. */
export function orderPitStop(state, driverId, compound) {
  if (!TYRE_COMPOUNDS.includes(compound)) return { ok: false, error: 'Composé invalide.' };
  const entry = state.entries.find((e) => e.driverId === driverId);
  if (!entry) return { ok: false, error: 'Pilote introuvable.' };
  if (entry.status !== 'racing') return { ok: false, error: 'Ce pilote a abandonné.' };

  entry._orderedPitCompound = compound;

  // Si on ordonne un arrêt manuel, on retire le prochain arrêt planifié 
  // pour éviter qu'il ne re-déclenche une alerte plus tard
  if (entry.plannedStops.length > 0) {
    entry.plannedStops.shift();
  }

  return { ok: true };
}

/** Change le rythme de course d'un pilote. */
export function changePace(state, driverId, pace) {
  if (!PACE_MULTIPLIERS[pace]) return { ok: false, error: 'Rythme invalide.' };
  const entry = state.entries.find((e) => e.driverId === driverId);
  if (!entry) return { ok: false, error: 'Pilote introuvable.' };
  if (entry.status !== 'racing') return { ok: false, error: 'Ce pilote a abandonné.' };
  entry.pace = pace;
  return { ok: true };
}

// ────────────────────────────────────────────────────────
// Fin de course
// ────────────────────────────────────────────────────────

/**
 * Finalise la course : applique les pénalités, calcule les points,
 * met à jour les classements et les gains.
 */
export function finishRace(state, save) {
  const weekend = weekendFor(save, state.roundId);
  if (weekend.race?.results) return { ok: false, error: 'Cette course est déjà terminée.' };

  const weather = getCurrentWeather(state);
  const wasDry = state.weather === 'dry' && state.weatherChanges.every((c) => c.to !== 'rain');

  // Appliquer la pénalité des composés si course sèche
  for (const entry of state.entries) {
    if (entry.status === 'dnf') continue;
    if (wasDry) {
      const dryCompounds = [...entry.compoundsUsed].filter((c) => c !== 'wet' && c !== 'intermediate');
      if (dryCompounds.length < MIN_DRY_COMPOUNDS) {
        entry.totalTime += COMPOUND_RULE_PENALTY_SECONDS * 1000;
        state.log.push(`Pénalité de ${COMPOUND_RULE_PENALTY_SECONDS}s pour ${state._driversMap.get(entry.driverId).name} : règle des 2 composés non respectée.`);
      }
    }
  }

  // Tri final
  const sorted = [...state.entries].sort((a, b) => {
    if (a.status === 'dnf' && b.status !== 'dnf') return 1;
    if (b.status === 'dnf' && a.status !== 'dnf') return -1;
    if (a.status === 'dnf' && b.status === 'dnf') return a.totalTime - b.totalTime;
    return a.totalTime - b.totalTime;
  });

  const results = sorted.map((entry, i) => {
    const points = entry.status === 'racing' ? (RACE_POINTS[i] || 0) : 0;
    return {
      driverId: entry.driverId,
      teamId: entry.teamId,
      position: i + 1,
      gridPosition: entry.gridPosition,
      points,
      status: entry.status,
      dnfReason: entry.dnfReason,
      totalTimeMs: entry.status === 'racing' ? entry.totalTime : null,
      gap: entry.status === 'racing' && i > 0 ? round2((entry.totalTime - sorted[0].totalTime) / 1000) : 0,
      tyresUsed: [...entry.compoundsUsed],
      pitStops: entry.pitStops.length,
      damage: entry.damage,
    };
  });

  // Gains financiers pour l'écurie du joueur
  const playerResults = results.filter((r) => r.teamId === state._playerTeamId);
  const bestFinish = Math.min(...playerResults.map((r) => r.position));
  const totalPoints = playerResults.reduce((sum, r) => sum + r.points, 0);
  const positionsGained = playerResults.reduce((sum, r) => sum + Math.max(0, r.gridPosition - r.position), 0);
  const moneyGain = round2((RACE_POINTS[bestFinish - 1] || 0) * 0.5 + positionsGained * 0.1);

  const playerTeam = save.teams.find((t) => t.id === save.playerTeamId);
  if (playerTeam) playerTeam.balance = round2(playerTeam.balance + moneyGain);

  // Mise à jour des classements
  updateStandings(save, results);

  // Évolution des stats pilotes
  const statChanges = applyRaceStatChanges(save, results);

  // Marquer la course comme terminée
  if (!save.calendar.completedRounds.includes(state.roundId)) {
    save.calendar.completedRounds.push(state.roundId);
  }

  const rewards = { points: totalPoints, money: moneyGain, statChanges };

  weekend.race = {
    state: null, // On ne garde pas l'état complet après la fin
    results,
    completedAt: save.gameDate,
    rewards,
    log: state.log.slice(0, 100),
  };

  save.eventLog.unshift({
    id: `${state.roundId}-race`,
    date: save.gameDate,
    type: 'race',
    message: `Course R${save.calendar.currentRound} terminée. ${playerResults.map((r) => `${state._driversMap.get(r.driverId).name} P${r.position}`).join(', ')}. +${formatPoints(totalPoints)} pts, +${round2(moneyGain)} M€.`,
  });
  save.eventLog = save.eventLog.slice(0, 60);

  state.results = results;
  return { ok: true, results, rewards };
}

function formatPoints(pts) { return pts === 1 ? '1 pt' : `${pts} pts`; }

function updateStandings(save, results) {
  const driverPoints = new Map(save.standings.drivers.map((e) => [e.driverId, e.points]));
  for (const r of results) driverPoints.set(r.driverId, (driverPoints.get(r.driverId) || 0) + r.points);
  save.standings.drivers = [...driverPoints].map(([driverId, points]) => ({ driverId, points })).sort((a, b) => b.points - a.points);

  const driversMap = new Map(save.drivers.map((d) => [d.id, d]));
  const teamPoints = new Map();
  for (const e of save.standings.drivers) {
    const teamId = driversMap.get(e.driverId)?.teamId;
    if (teamId) teamPoints.set(teamId, (teamPoints.get(teamId) || 0) + e.points);
  }
  save.standings.teams = [...teamPoints].map(([teamId, points]) => ({ teamId, points })).sort((a, b) => b.points - a.points);
}

function applyRaceStatChanges(save, results) {
  const changes = [];
  const sorted = [...save.drivers].sort((a, b) => {
    const avg = (d) => (d.stats.raceManagement + d.stats.attack + d.stats.overtaking) / 3;
    return avg(b) - avg(a);
  });
  const expectedRank = new Map(sorted.map((d, i) => [d.id, i + 1]));

  for (const r of results) {
    if (r.status === 'dnf') continue;
    const driver = save.drivers.find((d) => d.id === r.driverId);
    if (!driver) continue;
    const expected = expectedRank.get(r.driverId) || 12;
    const delta = clamp((expected - r.position) * 0.02, -0.15, 0.15);
    if (Math.abs(delta) > 0.01) {
      const before = { ...driver.stats };
      driver.stats.raceManagement = clampStat(driver.stats.raceManagement + delta);
      driver.stats.tyres = clampStat(driver.stats.tyres + delta / 2);
      driver.stats.overtaking = clampStat(driver.stats.overtaking + delta / 3);
      changes.push({ driverId: r.driverId, before, after: { ...driver.stats } });
    }
  }
  return changes;
}

function clampStat(v) { return round2(clamp(v, 50, 100)); }

// ────────────────────────────────────────────────────────
// Prévisions de stratégie (pour l'UI)
// ────────────────────────────────────────────────────────

/** Estime la perte d'état (%) par tour pour un composé et un rythme donnés. */
export function estimateWearPerLap(circuitId, compound, pace) {
  const circuit = circuitFor(circuitId);
  const tyreD = TYRE_DATA[compound] || TYRE_DATA.medium;
  const paceM = PACE_MULTIPLIERS[pace] || PACE_MULTIPLIERS.balanced;
  if (!circuit) return 2.0;
  return tyreD.wearRate * circuit.tyreWear * paceM.wear;
}
