/** Moteur V2 sans DOM : calendrier, entraînements, améliorations, IA et cycle de saison V6 complet. */
import { CALENDAR_2026 } from '../data/calendar-2026.js';
import { DEPT_KEYS, STAT_KEYS, TRAINING_GAIN, UPGRADE_DURATION_DAYS, UPGRADE_LEVELS, RATING_MIN, RATING_MAX } from './constants.js';
import { clampRating, driverOverall, teamOverall } from './validation.js';
import { round2, shiftSundayToMonday } from './utils.js';
import { processTransferEvents, transferEvents, replacementCascade } from './transfers.js';
import { applyRegulationChanges } from './regulations.js';

const dateMs = (date) => Date.parse(`${date}T12:00:00Z`);
const addDays = (date, days) => new Date(dateMs(date) + days * 86400000).toISOString().slice(0, 10);
const eventDate = (date, type) => type === 'race' ? date : shiftSundayToMonday(date);
const log = (save, date, message, type = 'info') => {
  if (!save.eventLog) save.eventLog = [];
  save.eventLog.unshift({ id: `${date}-${save.eventLog.length}-${type}`, date, message, type });
  save.eventLog = save.eventLog.slice(0, 60);
};

export function shiftYear(dateStr, years) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parseInt(parts[0], 10) + years}-${parts[1]}-${parts[2]}`;
}

/** Date la plus proche tombant le même jour de semaine que `weekday` (0 = dimanche) : décalage de -3 à +3 jours. */
const nearestWeekday = (date, weekday) => {
  const current = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, ((weekday - current + 10) % 7) - 3);
};

/**
 * Calendrier d'une saison. Chaque Grand Prix garde sa place dans l'année et son jour de semaine de 2026
 * (dimanche, ou samedi pour Bakou et Las Vegas) : la date de 2026 est reportée sur l'année voulue puis
 * ramenée au jour de semaine d'origine le plus proche. Entraînements et qualifications en découlent comme en 2026.
 */
export function getDynamicCalendar(season = 2026) {
  const diffYears = Number(season) - 2026;
  return CALENDAR_2026.map((round) => {
    const raceDate = diffYears === 0
      ? round.raceDate
      : nearestWeekday(shiftYear(round.raceDate, diffYears), new Date(`${round.raceDate}T12:00:00Z`).getUTCDay());
    return {
      ...round,
      trainingDates: [-4, -3, -2].map((days) => addDays(raceDate, days)),
      qualifyingDate: addDays(raceDate, -1),
      raceDate,
    };
  });
}


export function migrateScheduledEventDates(save) {
  if (!save || typeof save !== 'object') return save;
  for (const upgrade of save.activities?.upgrades || []) upgrade.completesOn = shiftSundayToMonday(upgrade.completesOn);
  for (const item of save.transfers?.scouting || []) item.dueOn = shiftSundayToMonday(item.dueOn);
  for (const item of save.transfers?.offers || []) item.dueOn = shiftSundayToMonday(item.dueOn);
  return save;
}

export function calendarEvents(save = { season: 2026 }) {
  const currentSeason = Number(save.season || (save.gameDate ? save.gameDate.slice(0, 4) : 2026));
  const cal = getDynamicCalendar(currentSeason);
  const raceEvents = cal.flatMap((round) => [
    ...round.trainingDates.map((date, dayIndex) => ({ date, type: 'training', dayIndex, round })),
    { date: round.qualifyingDate, type: 'qualifying', round },
    { date: round.raceDate, type: 'race', round },
  ]);

  const seasonEndEvent = {
    date: `${currentSeason}-12-31`,
    type: 'season-end',
    title: `Clôture de la saison ${currentSeason}`,
  };

  const nextSeasonYear = currentSeason + 1;
  const seasonStartEvent = {
    date: `${nextSeasonYear}-01-01`,
    type: 'season-start',
    title: `Début de la saison ${nextSeasonYear}`,
  };

  const shifted = [...raceEvents, seasonEndEvent, seasonStartEvent].map((event) => ({
    ...event,
    date: eventDate(event.date, event.type),
  }));
  return shifted.sort(sortEvents);
}

export function timelineEvents(save) {
  const upgrades = (save.activities?.upgrades || []).map((upgrade) => ({
    date: eventDate(upgrade.completesOn, 'upgrade'),
    type: 'upgrade',
    upgrade,
    team: save.teams.find((entry) => entry.id === upgrade.teamId),
  }));
  const marketEvents = transferEvents(save).map((event) => ({ ...event, date: eventDate(event.date, event.type) }));
  return [...calendarEvents(save), ...upgrades, ...marketEvents].sort(sortEvents);
}

export function eventsForWeek(save, startDate) {
  const end = addDays(startDate, 6);
  return timelineEvents(save).filter((event) => dateMs(event.date) >= dateMs(startDate) && dateMs(event.date) <= dateMs(end));
}

export function roundStatus(round, gameDate) {
  if (dateMs(gameDate) < dateMs(round.trainingDates[0])) return 'À venir';
  if (dateMs(gameDate) < dateMs(round.qualifyingDate)) return 'En cours';
  if (dateMs(gameDate) <= dateMs(round.raceDate)) return 'Disponible';
  return 'Terminé';
}

export function nextProgression(save) {
  return timelineEvents(save).find((event) => dateMs(event.date) > dateMs(save.gameDate)) || null;
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
    if (!team) continue;
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

/** 31 Décembre : Clôture de la saison, primes, réglementation, libération et IA */
export function closeSeason(save) {
  const currentSeason = Number(save.season || 2026);
  const nextSeason = currentSeason + 1;
  if (!save.pendingModals) save.pendingModals = {};

  // 1. Classements finaux
  const finalTeamStandings = [...(save.standings?.teams || [])].sort((a, b) => (b.points || 0) - (a.points || 0));
  const playerTeamStanding = finalTeamStandings.find((t) => t.teamId === save.playerTeamId);
  const playerPosition = playerTeamStanding ? finalTeamStandings.indexOf(playerTeamStanding) + 1 : finalTeamStandings.length;
  const playerPoints = playerTeamStanding ? playerTeamStanding.points : 0;

  // Calcul des attentes constructeurs
  const sortedByPerf = [...save.teams].sort((a, b) => teamOverall(b) - teamOverall(a));
  const expectedPosition = sortedByPerf.findIndex((t) => t.id === save.playerTeamId) + 1;

  // Calcul de la prime selon position vs attentes
  let bonusAmount = 5.0; // Prime de base
  let perfVerdict = 'conforme aux attentes';

  if (playerPosition < expectedPosition) {
    const diff = expectedPosition - playerPosition;
    bonusAmount += diff * 2.5;
    perfVerdict = `au-dessus des attentes (+${diff} place${diff > 1 ? 's' : ''})`;
  } else if (playerPosition > expectedPosition) {
    const diff = playerPosition - expectedPosition;
    bonusAmount = Math.max(1.0, bonusAmount - diff * 0.8);
    perfVerdict = `en-dessous des attentes (-${diff} place${diff > 1 ? 's' : ''})`;
  }

  bonusAmount = round2(bonusAmount);
  const playerTeam = save.teams.find((t) => t.id === save.playerTeamId);
  if (playerTeam) {
    playerTeam.balance = round2(playerTeam.balance + bonusAmount);
  }

  // Autres équipes reçoivent leur part
  save.teams.filter((t) => t.id !== save.playerTeamId).forEach((t, i) => {
    t.balance = round2(t.balance + Math.max(2.0, 10 - i * 0.8));
  });

  // 2. Changements de réglementation
  const regResults = applyRegulationChanges(save);
  save.lastRegulationChanges = regResults;

  // 3. Évolution des stats pilotes (-10% à +10%) sur les vraies statistiques, bornées à [RATING_MIN, RATING_MAX]
  save.drivers.forEach((driver) => {
    STAT_KEYS.forEach((key) => {
      const variation = (Math.random() * 0.20) - 0.10;
      driver.stats[key] = Math.max(RATING_MIN, Math.min(RATING_MAX, round2(driver.stats[key] * (1 + variation))));
    });
  });

  // 4. Capture des pilotes avant libération pour historique/modal
  const oldGrid = save.drivers.map((d) => ({ id: d.id, teamId: d.teamId, name: d.name || d.displayName }));

  // Libération des pilotes en fin de contrat sans futureContract
  save.drivers.forEach((driver) => {
    if (driver.contract && Number(driver.contract.endSeason) <= currentSeason) {
      if (!driver.futureContract || Number(driver.futureContract.startSeason) !== nextSeason) {
        driver.contract = null;
        driver.teamId = null;
        driver.loyalty = null;
      }
    }
  });

  // 5. Remplissage des baquets IA restants (cascade)
  save.teams.forEach((team) => {
    const engaged = save.drivers.filter((d) =>
      (d.contract && d.contract.teamId === team.id && Number(d.contract.endSeason) >= nextSeason) ||
      (d.futureContract && d.futureContract.teamId === team.id && Number(d.futureContract.startSeason) === nextSeason)
    ).length;

    for (let slot = engaged + 1; slot <= 2; slot++) {
      replacementCascade(save, team.id, slot, `${currentSeason}-12-31`);
    }
  });

  // 6. Nettoyage des prospections et offres expirées du mercato en cours
  if (save.transfers) {
    save.transfers.scouting = [];
    save.transfers.offers = [];
  }

  // Stocker les données pour la modale de fin de saison
  save.pendingModals.seasonEnd = {
    season: currentSeason,
    teamPoints: playerPoints,
    teamPosition: playerPosition,
    expectedPosition,
    perfVerdict,
    bonusAmount,
    regulations: regResults,
    oldGrid,
  };

  log(save, `${currentSeason}-12-31`, `Fin de la saison ${currentSeason}. Bilan : ${playerPoints} pts (${perfVerdict}). Prime : ${bonusAmount} M€.`, 'season-end');
}

/** 1er Janvier : Début de la nouvelle saison, application définitive des transferts, remise à zéro */
export function initNewSeasonStart(save) {
  const prevSeason = Number(save.season || 2026);
  const nextSeason = prevSeason + 1;
  save.season = nextSeason;
  if (!save.pendingModals) save.pendingModals = {};

  // 1. Débit des salaires annuels
  save.drivers.forEach((d) => {
    if (d.contract && d.contract.teamId) {
      const team = save.teams.find((t) => t.id === d.contract.teamId);
      if (team) {
        team.balance = round2(team.balance - (Number(d.contract.salary) || 0));
      }
    }
  });

  // 2. Remise à zéro du calendrier et des week-ends
  save.calendar = {
    currentRound: 1,
    completedRounds: [],
    trainingCompletedEvents: [],
  };
  save.weekends = {};

  // 3. Remise à zéro des classements (Ordre alphabétique des écuries, puis de leurs pilotes)
  const sortedTeams = [...save.teams].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

  save.standings = {
    teams: sortedTeams.map((t) => ({ teamId: t.id, points: 0 })),
    drivers: [],
  };

  sortedTeams.forEach((t) => {
    const teamDrivers = save.drivers
      .filter((d) => d.teamId === t.id)
      .sort((a, b) => (a.name || a.displayName || '').localeCompare(b.name || b.displayName || '', 'fr', { sensitivity: 'base' }));

    teamDrivers.forEach((d) => {
      save.standings.drivers.push({ driverId: d.id, points: 0 });
    });
  });

  // Ajouter les pilotes sans baquet à la fin
  save.drivers
    .filter((d) => !d.teamId)
    .sort((a, b) => (a.name || a.displayName || '').localeCompare(b.name || b.displayName || '', 'fr', { sensitivity: 'base' }))
    .forEach((d) => {
      save.standings.drivers.push({ driverId: d.id, points: 0 });
    });

  // 4. Nettoyage absolu des transferts
  if (save.transfers) {
    save.transfers.scouting = [];
    save.transfers.offers = [];
    save.transfers.signed = [];
  }

  // 5. Données pour la modale de début de saison
  const myDrivers = save.drivers.filter((d) => d.teamId === save.playerTeamId);
  const rivalChanges = [];
  const endModalData = save.pendingModals?.seasonEnd;

  if (endModalData?.oldGrid) {
    save.drivers.forEach((d) => {
      if (d.teamId && d.teamId !== save.playerTeamId) {
        const oldEntry = endModalData.oldGrid.find((o) => o.id === d.id);
        if (oldEntry && oldEntry.teamId !== d.teamId) {
          const newTeam = save.teams.find((t) => t.id === d.teamId);
          rivalChanges.push({
            driverName: d.name || d.displayName,
            fromTeamId: oldEntry.teamId,
            toTeamId: d.teamId,
            toTeamName: newTeam?.name || d.teamId,
          });
        }
      }
    });
  }

  save.pendingModals.seasonStart = {
    season: nextSeason,
    myDrivers: myDrivers.map((d) => ({ id: d.id, name: d.name || d.displayName, salary: d.contract?.salary || 0, slot: d.contract?.slot || '1' })),
    rivalChanges,
  };

  log(save, `${nextSeason}-01-01`, `Bienvenue dans la saison ${nextSeason} ! Salaires annuels débités, classements réinitialisés.`, 'season-start');
}

export function advanceToNextEvent(save) {
  const next = nextProgression(save);
  if (!next) return { ok: false, error: `Aucun événement futur trouvé pour la saison ${save.season}.` };
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
    if (event.type === 'season-end') {
      closeSeason(save);
    } else if (event.type === 'season-start') {
      initNewSeasonStart(save);
    } else if (event.type === 'training') {
      trainAllDrivers(save, event);
      planAiUpgrades(save, event.date);
    }
    if (event.round) {
      save.calendar.currentRound = event.round.round;
    }
  }

  const allEvents = [
    ...events.filter((event) => event.type !== 'scouting-complete' && event.type !== 'transfer-response'),
    ...marketEvents,
  ];

  return { ok: true, event: allEvents[0] || null, events: allEvents };
}

function sortEvents(a, b) {
  const priority = {
    'season-start': -1,
    upgrade: 0,
    training: 1,
    qualifying: 2,
    race: 3,
    'season-end': 4,
    'scouting-complete': 5,
    'transfer-response': 6,
    prospecting: 5,
    offer: 6,
  };
  return dateMs(a.date) - dateMs(b.date) || (priority[a.type] ?? 9) - (priority[b.type] ?? 9);
}

function deptLabel(key) {
  return { aero: 'aérodynamique', chassis: 'châssis', power: 'moteur' }[key] || key;
}