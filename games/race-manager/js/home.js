/**
 * Vue « menu principal » : accueil, calendrier dynamique (toutes saisons), classements,
 * pilotes / mercato, paramètres (sauvegarde, import/export JSON, profil de l'écurie)
 * et modales de fin / début de saison.
 *
 * Le slot arrive par l'URL (home.html?slot=N) ; il est validé (entier 1–3) puis relu depuis
 * localStorage : l'URL ne transporte jamais de données de partie.
 */
import { SLOT_COUNT, STAT_KEYS, STAT_LABELS, DEPT_KEYS, DEPT_LABELS, UPGRADE_LEVELS, TEAM_NAME_MAX } from './core/constants.js';
import { readSlot, writeSlot, downloadSave, setLastSlot } from './core/storage.js';
import { driverOverall, teamOverall, validateTeamName, validateColor } from './core/validation.js';
import { TEAMS_2026 } from './data/teams-2026.js';
import { formatMoney, formatPlayTime, formatGameDate } from './core/utils.js';
import { h, kv, ratingBar, toast, confirmDialog, showModal, checkAndShowSeasonModals } from './ui.js';
import { runImportFlow } from './import-flow.js';
import { advanceOneDay, eventsForWeek, nextProgression, roundStatus, startUpgrade, upgradeCost, getDynamicCalendar } from './core/progression.js';
import { ensureTransferState, prospectDriver, offerDriver, driverConfidential } from './core/transfers.js';

const main = document.getElementById('content');
const params = new URLSearchParams(location.search);
const slotId = Number(params.get('slot'));

function fatal(messages) {
  main.replaceChildren(h('section', { class: 'card' },
    h('h1', { text: 'Impossible d’ouvrir cette partie' }),
    h('ul', {}, messages.map((m) => h('li', { text: m }))),
    h('p', {}, h('a', { class: 'btn btn--primary', href: 'menu.html', text: 'Retour au menu des sauvegardes' }))));
  document.getElementById('gameNav').hidden = true;
}

function init() {
  if (!Number.isInteger(slotId) || slotId < 1 || slotId > SLOT_COUNT) return fatal(['Emplacement de sauvegarde absent ou invalide dans l’adresse.']);
  const res = readSlot(slotId);
  if (res.status === 'empty') return fatal([`L’emplacement ${slotId} est vide.`]);
  if (res.status !== 'ok') return fatal(res.errors);
  run(res.save);
}

function run(save) {
  // --- INITIALISATION / SÉCURITÉ STANDINGS S1 ---
  if (!save.standings) {
    save.standings = {
      drivers: Object.fromEntries((save.drivers || []).map(d => [d.id, 0])),
      teams: Object.fromEntries((save.teams || []).map(t => [t.id, 0]))
    };
  } else {
    save.standings.drivers = save.standings.drivers || {};
    save.standings.teams = save.standings.teams || {};
  }
  // ----------------------------------------------

  let activeTab = 'home';
  const teamOf = () => save.teams.find((t) => t.id === save.playerTeamId);
  let suspended = false;            // vrai quand la page va être rechargée après un import (ne plus écrire)
  let visibleSince = document.hidden ? null : Date.now();
  let statusEl;

  // ---- Saison et calendrier : toujours dérivés de la saison en cours (jamais figés sur 2026)
  const currentSeason = () => Number(save.season || String(save.gameDate).slice(0, 4));
  const calendarOf = () => getDynamicCalendar(currentSeason());

  /**
   * Modales de cycle annuel. checkAndShowSeasonModals() supprime l'entrée qu'il affiche ; or
   * initNewSeasonStart() relit seasonEnd.oldGrid le 1er janvier pour lister les transferts rivaux.
   * La modale de fin est donc affichée sur une copie et seulement marquée « vue ».
   */
  function flushSeasonModals() {
    const pm = save.pendingModals;
    if (!pm) return;
    if (pm.seasonEnd && !pm.seasonEnd.shown) {
      checkAndShowSeasonModals({ pendingModals: { seasonEnd: pm.seasonEnd } });
      pm.seasonEnd.shown = true;
      persist();
    } else if (pm.seasonStart) {
      checkAndShowSeasonModals({ pendingModals: { seasonStart: pm.seasonStart } });
      delete pm.seasonStart;
      delete pm.seasonEnd;
      persist();
    }
  }

  // ---- Temps de jeu et sauvegarde
  const accrue = () => {
    if (visibleSince === null) return;
    const now = Date.now();
    save.playTimeSeconds = Math.round(save.playTimeSeconds + (now - visibleSince) / 1000);
    visibleSince = now;
  };
  // Garantit la structure attendue du calendrier avant toute écriture (sauvegardes anciennes, reset de saison).
  function normalizeCalendar() {
    const cal = save.calendar && typeof save.calendar === 'object' ? save.calendar : (save.calendar = {});
    const done = new Set(Array.isArray(cal.completedRounds) ? cal.completedRounds : []);
    for (const [id, weekend] of Object.entries(save.weekends || {})) if (weekend?.race?.results?.length) done.add(id);
    cal.completedRounds = [...done];
    if (!Number.isInteger(cal.currentRound) || cal.currentRound < 1) cal.currentRound = 1;
    if (!Array.isArray(cal.trainingCompletedEvents)) cal.trainingCompletedEvents = [];
  }
  function persist() {
    if (suspended) return { ok: true };
    accrue();
    normalizeCalendar();
    save.lastPlayedAt = new Date().toISOString();
    const r = writeSlot(slotId, save);
    if (statusEl) {
      statusEl.textContent = r.ok ? `✓ Sauvegarde enregistrée à ${new Date().toLocaleTimeString('fr-CH')}.` : `⚠ ${r.error}`;
      statusEl.classList.toggle('form-error', !r.ok);
    }
    return r;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { accrue(); visibleSince = null; persist(); } else { visibleSince = Date.now(); }
  });
  addEventListener('pagehide', () => { persist(); });   // non garanti par tous les navigateurs
  setInterval(() => { if (!document.hidden) persist(); }, 30000);
  setLastSlot(slotId);

  // ---- En-tête (couleur d'écurie = accent visuel)
  function paintHeader() {
    const t = teamOf();
    document.documentElement.style.setProperty('--team', t.color);
    document.getElementById('hdrTeam').textContent = t.name;
    document.getElementById('hdrBalance').textContent = `Solde : ${formatMoney(t.balance)}`;
    document.title = `${t.name} · The Race Manager | Mini‑Games`;
  }
  // Enregistre avant de quitter vers le menu des slots (la navigation se poursuit normalement)
  document.getElementById('backLink').addEventListener('click', () => { persist(); });

  // ---- Panneaux
  const placeholder = (title, text) => h('section', { class: 'card card--soon' },
    h('h2', { text: title }), h('p', { class: 'badge', text: 'Disponible dans une prochaine version' }), h('p', { text }));

  function driverCard(d) {
    return h('article', { class: 'card driver-card' },
      h('div', { class: 'driver-card__head' },
        h('div', {}, h('h3', { text: d.name }), h('p', { class: 'muted', text: `${d.abbr} · ${d.nationality}${d.age != null ? ` · ${d.age} ans` : ''}` })),
        h('div', { class: 'ovr', 'aria-label': `Note globale ${driverOverall(d)}` }, h('span', { text: String(driverOverall(d)) }), h('small', { text: 'Note' }))),
      h('div', { class: 'stats' }, STAT_KEYS.map((k) => ratingBar(STAT_LABELS[k], d.stats[k]))),
      kv([['Salaire annuel', formatMoney(d.contract?.salary || 0)], ['Contrat', `jusqu’à la fin de la saison ${d.contract?.endSeason ?? currentSeason()}`]]));
  }

  function playerDriver(id) {
    return (save.drivers || []).find((driver) => driver.id === id);
  }

  const eventTitle = (event) => {
    if (!event) return 'Saison terminée';
    if (event.type === 'season-end') return event.title || `Clôture de la saison ${currentSeason()}`;
    if (event.type === 'season-start') return event.title || `Début de la saison ${currentSeason() + 1}`;
    if (event.type === 'upgrade') return `Amélioration terminée · ${DEPT_LABELS[event.upgrade?.dept] || ''}`;

    const labels = {
      training: 'Entraînement pilotes',
      qualifying: 'Qualifications',
      race: 'Course',
      prospecting: 'Prospection terminée',
      prospection: 'Prospection terminée',
      'prospection-complete': 'Prospection terminée',
      'scouting-complete': 'Prospection terminée',
      offer: 'Réponse du pilote',
      'offer-response': 'Réponse du pilote',
      'driver-response': 'Réponse du pilote',
      'transfer-response': 'Réponse du pilote',
    };
    const label = labels[event.type] || event.title || 'Événement';
    const isOfferResponse = ['offer', 'offer-response', 'driver-response', 'transfer-response'].includes(event.type);
    if (isOfferResponse) {
      const offer = event.offer || event.transfer?.offer;
      const decision = event.decision || event.transfer?.decision;
      const driverId = event.driverId || offer?.driverId;
      const driver = driverId ? playerDriver(driverId) : null;
      const name = driver?.name || offer?.driverName || event.driverName || 'pilote';
      if (!decision) return `Réponse de ${name}`;
      const result = decision.accepted ? 'offre acceptée' : 'offre refusée';
      const reasonText = decision.reason || (Array.isArray(decision.reasons) && decision.reasons.length ? decision.reasons.join(', ') : '');
      const reason = reasonText ? `, raison : ${reasonText}` : '';
      const probability = decision.probability != null ? ` (probabilité : ${Math.round(Number(decision.probability) <= 1 ? Number(decision.probability) * 100 : Number(decision.probability))} %)` : '';
      return `Réponse de ${name} : ${result}${reason}${probability}`;
    }
    if (!event.round) return label;
    return `${label} · R${event.round.round} · ${event.round.name}`;
  };

  const lapTime = (milliseconds) => {
    const minutes = Math.floor(milliseconds / 60_000);
    const seconds = ((milliseconds % 60_000) / 1000).toFixed(3).padStart(6, '0');
    return `${minutes}:${seconds}`;
  };

  function resultsTable(results, title) {
    return h('section', { class: 'session-results' }, h('h3', { text: title }),
      h('ol', { class: 'result-list' }, results.map((row) => {
        const driver = playerDriver(row.driverId);
        if (!driver) return null;
        return h('li', { class: driver.teamId === save.playerTeamId ? 'is-player' : '' }, h('span', { class: 'result-list__position', text: String(row.rank || row.position) }), h('strong', { text: driver.name }), h('span', { text: row.timeMs ? lapTime(row.timeMs) : `${row.points} pts` }));
      })));
  }

  function eventIcon(type) {
    const paths = {
      training: ['M5 3v4', 'M19 3v4', 'M3 8h18', 'M5 12h4v7H5z', 'M15 12h4v7h-4z'],
      qualifying: ['M5 4h10l-2 5 2 5H5z', 'M5 4v16'],
      race: ['M4 16h16', 'M6 16l2-7h8l2 7', 'M9 9V6h6v3', 'M7 19h.01', 'M17 19h.01'],
      upgrade: ['M14 4a4 4 0 0 0-4 5l-6 6 5 5 6-6a4 4 0 0 0 5-4l-4 1z'],
      season: ['M8 7V3', 'M16 7V3', 'M5 11h14', 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'],
      generic: ['M12 7v5l3 2', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
    };
    const key = String(type).startsWith('season') ? 'season' : (paths[type] ? type : 'generic');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `event-icon event-icon--${type}`);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of paths[key]) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
    }
    return svg;
  }

  function weekCalendarNode() {
    const events = eventsForWeek(save, save.gameDate);
    const weekDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${save.gameDate}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const formatDay = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const calendar = calendarOf();
    const qualifyingRound = calendar.find((round) => round.qualifyingDate === save.gameDate);
    const pendingQualifying = !!qualifyingRound && !save.weekends?.[qualifyingRound.id]?.qualifying?.grid?.length;
    const raceRound = calendar.find((round) => round.raceDate === save.gameDate && !save.weekends?.[round.id]?.race);
    const pendingRace = !!raceRound;
    const enterQualifying = () => { location.href = `qualifying.html?slot=${slotId}&round=${encodeURIComponent(qualifyingRound.id)}`; };
    const enterRace = () => { location.href = `race.html?slot=${slotId}&round=${encodeURIComponent(raceRound.id)}`; };
    return h('section', { class: 'weekly-calendar', 'aria-labelledby': 'weekTitle' },
      h('div', { class: 'weekly-calendar__head' },
        h('div', {}, h('h2', { id: 'weekTitle', text: 'Les 7 prochains jours' }), h('p', { class: 'muted', text: `Du ${formatGameDate(weekDates[0])} au ${formatGameDate(weekDates[weekDates.length - 1])}.` })),
        h('div', { class: 'weekly-calendar__actions' },
          h('button', { type: 'button', class: 'btn', text: 'Avancer d’un jour', onClick: advanceDay, disabled: !nextProgression(save) || pendingQualifying || pendingRace }),
          h('button', { type: 'button', class: 'btn btn--primary', text: pendingQualifying ? 'Passer aux qualifications' : pendingRace ? 'Passer à la course' : 'Aller au prochain événement', onClick: pendingQualifying ? enterQualifying : pendingRace ? enterRace : advanceCalendar, disabled: !nextProgression(save) && !pendingQualifying && !pendingRace }))),
      h('div', { class: 'week-grid' }, weekDates.map((date) => {
        const daysEvents = events.filter((event) => event.date === date && (event.type !== 'upgrade' || event.upgrade.teamId === save.playerTeamId));
        return h('article', { class: `week-day${date === save.gameDate ? ' is-today' : ''}` },
          h('h3', { text: formatDay.format(new Date(`${date}T12:00:00Z`)) }),
          daysEvents.length
            ? h('ul', { class: 'week-events' }, daysEvents.map((event) => h('li', { class: `week-event week-event--${event.type}` }, eventIcon(event.type), h('span', { text: eventTitle(event) }))))
            : h('p', { class: 'week-empty', text: 'Aucun événement' }));
      })));
  }

  async function showTransferEvents(events) {
    const transferEvents = (events || []).filter((event) => event.transfer || event.transferType || event.type === 'prospecting' || event.type === 'offer' || event.type === 'prospection' || event.type === 'offer-response' || event.type === 'driver-response' || event.type === 'scouting-complete' || event.type === 'transfer-response');
    for (const event of transferEvents) {
      const title = eventTitle(event);
      const isOfferResponse = ['offer', 'offer-response', 'driver-response', 'transfer-response'].includes(event.type);
      const detail = isOfferResponse ? title : (event.message || event.description || (event.driverId ? playerDriver(event.driverId)?.name : ''));
      await showModal({
        title,
        body: h('p', { text: detail || 'Un événement du marché des transferts est arrivé à échéance.' }),
      });
    }
  }

  function refreshHome() {
    paintHeader();
    main.replaceChildren(panels.home.build());
  }

  async function advanceCalendar() {
    if (!nextProgression(save)) return toast(`La saison ${currentSeason()} est terminée.`, { error: true });
    document.querySelectorAll('.weekly-calendar__actions button').forEach((b) => { b.disabled = true; });

    let last = null;
    try {
      for (let guard = 0; guard < 400; guard++) {
        const result = advanceOneDay(save);
        persist();
        refreshHome();
        last = result;
        if (!result.ok || result.events?.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } finally {
      refreshHome();
    }

    if (last && !last.ok) toast(last.error, { error: true });
    else if (last?.events?.length) {
      await showTransferEvents(last.events);
      toast(`Événement exécuté : ${eventTitle(last.event)}.`);
    }
    flushSeasonModals();
  }

  async function advanceDay() {
    const result = advanceOneDay(save);
    const written = result.ok || result.events?.length ? persist() : { ok: true };
    refreshHome();
    if (!result.ok) return toast(written.ok ? result.error : written.error, { error: true });
    await showTransferEvents(result.events);
    toast(written.ok ? (result.event ? `Événement exécuté : ${eventTitle(result.event)}.` : `Calendrier avancé au ${formatGameDate(save.gameDate)}.`) : written.error, { error: !written.ok });
    flushSeasonModals();
  }

  async function orderUpgrade(dept) {
    const team = teamOf();
    const cost = upgradeCost(team, dept, save.difficulty.upgradeDifficulty);
    const approved = await confirmDialog({
      title: `Améliorer ${DEPT_LABELS[dept]} ?`,
      message: `Coût immédiat : ${formatMoney(cost)}. La note augmentera de 1 point dans trois jours simulés.`,
      confirmLabel: 'Lancer l’amélioration',
    });
    if (!approved) return;
    const result = startUpgrade(save, team.id, dept);
    if (!result.ok) return toast(result.error, { error: true });
    const written = persist();
    paintHeader();
    show('home');
    toast(written.ok ? 'Amélioration planifiée.' : written.error, { error: !written.ok });
  }

  function trainingHistoryNode() {
    const last = save.activities.trainingHistory[0];
    if (!last) return h('p', { class: 'muted', text: 'Aucun entraînement terminé. Le premier est prévu le mercredi précédant le Grand Prix d’Australie.' });
    return h('div', { class: 'history-list' }, save.activities.trainingHistory.slice(0, 3).map((entry) =>
      h('article', { class: 'history-entry' },
        h('strong', { text: `R${calendarOf().find((round) => round.id === entry.roundId)?.round ?? '?'} · ${formatGameDate(entry.date)}` }),
        entry.gains.map((gain) => h('p', { text: `${gain.name} : note ${gain.before} → ${gain.after} · +${(gain.statsAfter.start - gain.statsBefore.start).toFixed(2)} par statistique` }))
      )));
  }

  function homePanel() {
    const t = teamOf();
    const mine = save.drivers.filter((d) => d.teamId === t.id);
    const next = nextProgression(save);
    const activeUpgrades = save.activities.upgrades.filter((upgrade) => upgrade.teamId === t.id);
    return h('div', { class: 'stack' },
      h('section', { class: 'card hero dashboard-head' },
        h('h1', { text: t.name }),
        h('div', { class: 'dashboard-head__grid' },
          kv([['Date simulée', formatGameDate(save.gameDate)], ['Saison', `${currentSeason()} · R${save.calendar?.currentRound || 1}/${calendarOf().length}`], ['Solde actuel', formatMoney(t.balance)], ['Temps de jeu', formatPlayTime(save.playTimeSeconds)]]),
          h('div', { class: 'next-event' },
            h('span', { class: 'eyebrow', text: 'Prochain événement' }),
            h('strong', { text: eventTitle(next) }),
            h('p', { class: 'muted', text: next ? formatGameDate(next.date) : 'La saison est terminée.' }))
        ),
        h('p', { class: 'muted', text: `Difficulté des améliorations : ${UPGRADE_LEVELS[save.difficulty.upgradeDifficulty].label}.` })
      ),
      weekCalendarNode(),
      h('section', { class: 'dashboard-grid' },
        h('article', { class: 'card' }, h('h2', { text: 'Entraînements' }), trainingHistoryNode()),
        h('article', { class: 'card' }, h('h2', { text: 'Amélioration en cours' }),
          activeUpgrades.length
            ? h('div', { class: 'active-upgrades' }, activeUpgrades.map((upgrade) => h('p', {}, h('strong', { text: DEPT_LABELS[upgrade.dept] }), ` · fin prévue le ${formatGameDate(upgrade.completesOn)} · ${formatMoney(upgrade.cost)} payé.`)))
            : h('p', { class: 'muted', text: 'Aucune amélioration en cours.' }))),
      h('section', { 'aria-labelledby': 'drvTitle' }, h('h2', { id: 'drvTitle', text: 'Vos pilotes' }), h('div', { class: 'grid2' }, mine.map(driverCard))),
      h('section', { class: 'card', 'aria-labelledby': 'depTitle' },
        h('h2', { id: 'depTitle', text: 'Départements' }),
        h('div', { class: 'upgrade-grid' }, DEPT_KEYS.map((k) => {
          const cost = upgradeCost(t, k, save.difficulty.upgradeDifficulty);
          return h('div', { class: 'upgrade-option' }, ratingBar(DEPT_LABELS[k], t.departmentRatings[k]), h('button', { type: 'button', class: 'btn btn--small', text: `Améliorer · ${formatMoney(cost)}`, onClick: () => orderUpgrade(k), disabled: activeUpgrades.some((upgrade) => upgrade.dept === k) || t.departmentRatings[k] >= 100 || t.balance < cost }));
        })),
        h('p', { class: 'overall', text: `Note globale de l’écurie : ${teamOverall(t)}` })),
      h('section', { class: 'card' }, h('h2', { text: 'Journal de l’écurie' }),
        save.eventLog.length ? h('ul', { class: 'event-log' }, save.eventLog.slice(0, 8).map((entry) => h('li', {}, h('time', { text: formatGameDate(entry.date) }), entry.message))) : h('p', { class: 'muted', text: 'Les événements importants de la saison apparaîtront ici.' }))
    );
  }

  function roundCalendarCard(round) {
    const status = roundStatus(round, save.gameDate);
    const weekend = save.weekends?.[round.id];
    const grid = weekend?.qualifying?.grid;
    const results = weekend?.race?.results;
    const nameOf = (id) => playerDriver(id)?.name || '—';
    return h('article', { class: `card season-round${status === 'Terminé' ? ' is-past' : ''}` },
      h('div', { class: 'season-round__head' }, h('div', {}, h('h3', { text: `R${round.round} · ${round.name}` }), h('p', { class: 'muted', text: round.circuit })), h('span', { class: 'badge', text: status })),
      h('ol', { class: 'round-events' },
        ...round.trainingDates.map((date) => h('li', {}, eventIcon('training'), h('span', { text: `Entraînement pilotes · ${formatGameDate(date)}` }))),
        h('li', {}, eventIcon('qualifying'), h('span', { text: `Qualifications · ${formatGameDate(round.qualifyingDate)}` })),
        h('li', {}, eventIcon('race'), h('span', { text: `Course · ${formatGameDate(round.raceDate)}` }))),
      grid?.length ? h('p', { class: 'weekend-summary', text: `Qualifications terminées · pole : ${nameOf(grid[0].driverId)}` }) : null,
      results?.length ? h('p', { class: 'weekend-summary', text: `Course terminée · vainqueur : ${nameOf(results[0].driverId)}` }) : null,
      grid?.length ? h('details', { class: 'saved-results' }, h('summary', { text: 'Voir la grille complète' }), resultsTable(grid, 'Grille de départ')) : null,
      results?.length ? h('details', { class: 'saved-results' }, h('summary', { text: 'Voir le résultat de course' }), resultsTable(results, 'Classement final')) : null,
    );
  }

  function calendarPanel() {
    const calendar = calendarOf();
    // « passée » = course déjà courue ; une manche reste « à venir » tant que sa date n'est pas dépassée
    const passed = calendar.filter((round) => round.raceDate < save.gameDate);
    const upcoming = calendar.filter((round) => round.raceDate >= save.gameDate);
    const playerUpgrades = (save.activities?.upgrades || []).filter((upgrade) => upgrade.teamId === save.playerTeamId);
    return h('div', { class: 'stack' },
      h('section', { class: 'card' }, h('h1', { text: `Calendrier ${currentSeason()}` }), h('p', { class: 'muted', text: 'Chaque week-end comprend trois journées d’entraînement, les qualifications du samedi et la course du dimanche.' })),
      playerUpgrades.length ? h('section', { class: 'card' }, h('h2', { text: 'Améliorations planifiées' }), h('ul', { class: 'round-events' }, playerUpgrades.map((upgrade) => {
        const team = save.teams.find((entry) => entry.id === upgrade.teamId);
        return h('li', {}, eventIcon('upgrade'), h('span', { text: `${team?.name || ''} · ${DEPT_LABELS[upgrade.dept]} · fin le ${formatGameDate(upgrade.completesOn)}` }));
      }))) : null,
      passed.length ? h('section', { class: 'season-section' }, h('h2', { text: 'Manches passées' }), h('div', { class: 'season-rounds' }, passed.map(roundCalendarCard))) : null,
      h('section', { class: 'season-section' }, h('h2', { text: 'Manches à venir' }),
        upcoming.length
          ? h('div', { class: 'season-rounds' }, upcoming.map(roundCalendarCard))
          : h('p', { class: 'muted', text: `Toutes les manches de la saison ${currentSeason()} sont terminées. La nouvelle saison commence le 1er janvier.` })));
  }

  function settingsPanel() {
    const t = teamOf();
    statusEl = h('p', { class: 'muted', role: 'status', text: 'Sauvegarde automatique active : retour au menu, changement d’onglet du navigateur, fermeture et toutes les 30 secondes.' });
    const nameIn = h('input', { id: 'profName', class: 'input', type: 'text', maxlength: String(TEAM_NAME_MAX * 2), value: t.name, autocomplete: 'off' });
    const colorIn = h('input', { id: 'profColor', class: 'color-input', type: 'color', value: t.color });
    const profErr = h('p', { class: 'form-error', role: 'alert', hidden: true });

    function applyProfile() {
      // les noms de la grille de référence restent interdits ; le nom actuel de l'écurie ne l'est évidemment pas
      const r = validateTeamName(nameIn.value, TEAMS_2026.map((x) => x.name));
      const showErr = (m) => { profErr.textContent = m; profErr.hidden = !m; };
      if (!r.ok) return showErr(r.error);
      if (!validateColor(colorIn.value)) return showErr('Couleur invalide.');
      showErr('');
      t.name = r.name;
      t.color = colorIn.value;
      nameIn.value = r.name;
      paintHeader();
      const w = persist();
      toast(w.ok ? 'Profil de l’écurie enregistré.' : w.error, { error: !w.ok });
    }

    return h('div', { class: 'stack' },
      h('section', { class: 'card' },
        h('h2', { text: 'Sauvegarde' }),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn--primary', text: 'Enregistrer maintenant', onClick: () => { const r = persist(); toast(r.ok ? 'Partie enregistrée.' : r.error, { error: !r.ok }); } }),
          h('button', { type: 'button', class: 'btn', text: 'Exporter en JSON', onClick: () => { const r = persist(); if (!r.ok) toast(r.error, { error: true }); downloadSave(save); toast('Fichier JSON téléchargé sur votre appareil.'); } }),
          h('button', {
            type: 'button', class: 'btn', text: 'Importer un JSON', onClick: async () => {
              const r = await runImportFlow({ slotId });
              if (r.ok && r.slotId === slotId) { suspended = true; location.reload(); }
            }
          })),
        statusEl,
        h('p', { class: 'muted', text: 'L’export crée un fichier sur votre appareil. Les parties sont enregistrées uniquement dans ce navigateur : exportez régulièrement pour éviter toute perte.' })),
      h('section', { class: 'card' },
        h('h2', { text: 'Profil de l’écurie' }),
        h('div', { class: 'field' }, h('label', { for: 'profName', text: 'Nom de l’écurie' }), nameIn),
        h('div', { class: 'field field--inline' }, h('label', { for: 'profColor', text: 'Couleur' }), colorIn),
        profErr,
        h('button', { type: 'button', class: 'btn btn--primary', text: 'Appliquer', onClick: applyProfile })),
      h('section', { class: 'card' },
        h('h2', { text: 'Menu des sauvegardes' }),
        h('p', { class: 'muted', text: 'Votre partie est enregistrée avant le retour au menu.' }),
        h('a', { class: 'btn', href: 'menu.html', text: 'Retour au menu des sauvegardes', onClick: () => { persist(); } })));
  }


  function standingsPanel() {
    const playerTeamId = save.playerTeamId;
    const driversById = new Map((save.drivers || []).map((driver) => [String(driver.id), driver]));
    const teamsById = new Map((save.teams || []).map((team) => [String(team.id), team]));
    const driverStats = new Map();
    const teamStats = new Map();

    // Statistiques de victoires / podiums issues des week-ends
    for (const weekend of Object.values(save.weekends || {})) {
      for (const result of weekend?.race?.results || []) {
        if (!result) continue;
        const driverIdKey = String(result.driverId);
        const teamIdKey = String(result.teamId);

        const driverEntry = driverStats.get(driverIdKey) || { wins: 0, podiums: 0 };
        if (result.position === 1) driverEntry.wins += 1;
        if (result.position <= 3) driverEntry.podiums += 1;
        driverStats.set(driverIdKey, driverEntry);

        const teamEntry = teamStats.get(teamIdKey) || { wins: 0, podiums: 0 };
        if (result.position === 1) teamEntry.wins += 1;
        if (result.position <= 3) teamEntry.podiums += 1;
        teamStats.set(teamIdKey, teamEntry);
      }
    }

    // Récupération des points pilotes (format Array ou format Object clé-valeur)
    const rawDriverStandings = save.standings?.drivers;
    const driverPointsMap = new Map();
    if (Array.isArray(rawDriverStandings)) {
      rawDriverStandings.forEach((entry) => {
        const id = entry?.driverId ?? entry?.id;
        if (id !== undefined && id !== null) {
          driverPointsMap.set(String(id), Number(entry.points) || 0);
        }
      });
    } else if (rawDriverStandings && typeof rawDriverStandings === 'object') {
      Object.entries(rawDriverStandings).forEach(([id, points]) => {
        driverPointsMap.set(String(id), Number(points) || 0);
      });
    }

    // Récupération des points constructeurs (format Array ou format Object clé-valeur)
    const rawTeamStandings = save.standings?.teams;
    const teamPointsMap = new Map();
    if (Array.isArray(rawTeamStandings)) {
      rawTeamStandings.forEach((entry) => {
        const id = entry?.teamId ?? entry?.id;
        if (id !== undefined && id !== null) {
          teamPointsMap.set(String(id), Number(entry.points) || 0);
        }
      });
    } else if (rawTeamStandings && typeof rawTeamStandings === 'object') {
      Object.entries(rawTeamStandings).forEach(([id, points]) => {
        teamPointsMap.set(String(id), Number(points) || 0);
      });
    }

    // Construction et tri du classement pilotes (tous les pilotes sont listés même à 0 pt)
    const driverRows = (save.drivers || [])
      .map((driver) => {
        const idKey = String(driver.id);
        const stats = driverStats.get(idKey) || { wins: 0, podiums: 0 };
        const points = driverPointsMap.get(idKey) || 0;
        const team = teamsById.get(String(driver.teamId));
        return { driverId: driver.id, points, driver, stats, team };
      })
      .sort((a, b) => {
        // 1. Points décroissants
        if (b.points !== a.points) return b.points - a.points;

        // 2. Victoires / Podiums si des courses ont eu lieu
        if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
        if (b.stats.podiums !== a.stats.podiums) return b.stats.podiums - a.stats.podiums;

        // 3. Ordre alphabétique de l'écurie
        const teamNameA = a.team?.name || 'ZZZ';
        const teamNameB = b.team?.name || 'ZZZ';
        const teamComp = teamNameA.localeCompare(teamNameB, 'fr');
        if (teamComp !== 0) return teamComp;

        // 4. Ordre alphabétique des coéquipiers
        const nameA = a.driver.name || `${a.driver.firstName || ''} ${a.driver.lastName || ''}`;
        const nameB = b.driver.name || `${b.driver.firstName || ''} ${b.driver.lastName || ''}`;
        return nameA.localeCompare(nameB, 'fr');
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));

    // Construction et tri du classement constructeurs
    const teamRows = (save.teams || [])
      .map((team) => {
        const idKey = String(team.id);
        const stats = teamStats.get(idKey) || { wins: 0, podiums: 0 };
        const points = teamPointsMap.get(idKey) || 0;
        return { teamId: team.id, points, team, stats };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
        if (b.stats.podiums !== a.stats.podiums) return b.stats.podiums - a.stats.podiums;
        return (a.team.name || '').localeCompare(b.team.name || '', 'fr');
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));

    const leaderPoints = (rows) => rows[0]?.points ?? 0;
    const gapText = (points, leader) => (points === leader ? '—' : `−${leader - points}`);

    const teamCell = (team) =>
      h(
        'span',
        { class: 'team-cell' },
        h('span', {
          class: 'team-swatch',
          style: { '--team-color': team.color, background: team.color },
          'aria-hidden': 'true',
        }),
        h('span', { text: team.name })
      );

    const playerMark = h('span', {
      class: 'standings-player-mark',
      'aria-label': 'Écurie du joueur',
      text: '',
    });

    const driverTable = () => {
      const leader = leaderPoints(driverRows);
      return h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          {},
          h('caption', { class: 'sr-only', text: 'Classement des pilotes' }),
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              ['#', 'Pilote', 'Écurie', 'Points', 'Écart', 'Victoires', 'Podiums'].map((label) =>
                h('th', { scope: 'col', text: label })
              )
            )
          ),
          h(
            'tbody',
            {},
            driverRows.length
              ? driverRows.map((row) => {
                const isPlayer = String(row.driver.teamId) === String(playerTeamId);
                const team = teamsById.get(String(row.driver.teamId));
                return h(
                  'tr',
                  { class: isPlayer ? 'is-player-team' : '', 'data-team-color': team?.color || '' },
                  h('td', { class: 'standings-rank', text: String(row.rank) }),
                  h(
                    'th',
                    { scope: 'row', class: 'standings-name' },
                    isPlayer ? playerMark.cloneNode(true) : null,
                    h('strong', { text: row.driver.name })
                  ),
                  h('td', {}, team ? teamCell(team) : h('span', { class: 'muted', text: '—' })),
                  h('td', { class: 'standings-points', text: String(row.points) }),
                  h('td', { text: gapText(row.points, leader) }),
                  h('td', { text: String(row.stats.wins) }),
                  h('td', { text: String(row.stats.podiums) })
                );
              })
              : h('tr', {}, h('td', { colspan: '7', class: 'muted', text: 'Aucun pilote enregistré.' }))
          )
        )
      );
    };

    const teamTable = () => {
      const leader = leaderPoints(teamRows);
      return h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          {},
          h('caption', { class: 'sr-only', text: 'Classement des constructeurs' }),
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              ['#', 'Écurie', 'Points', 'Écart', 'Victoires', 'Podiums'].map((label) =>
                h('th', { scope: 'col', text: label })
              )
            )
          ),
          h(
            'tbody',
            {},
            teamRows.length
              ? teamRows.map((row) => {
                const isPlayer = String(row.team.id) === String(playerTeamId);
                return h(
                  'tr',
                  { class: isPlayer ? 'is-player-team' : '' },
                  h('td', { class: 'standings-rank', text: String(row.rank) }),
                  h(
                    'th',
                    { scope: 'row', class: 'standings-name' },
                    isPlayer ? playerMark.cloneNode(true) : null,
                    teamCell(row.team)
                  ),
                  h('td', { class: 'standings-points', text: String(row.points) }),
                  h('td', { text: gapText(row.points, leader) }),
                  h('td', { text: String(row.stats.wins) }),
                  h('td', { text: String(row.stats.podiums) })
                );
              })
              : h('tr', {}, h('td', { colspan: '6', class: 'muted', text: 'Aucune écurie enregistrée.' }))
          )
        )
      );
    };

    const driversTab = h('button', {
      type: 'button',
      class: 'standings-subtab is-active',
      role: 'tab',
      id: 'standings-tab-drivers',
      'aria-controls': 'standings-panel-drivers',
      'aria-selected': 'true',
      tabindex: '0',
      text: 'Pilotes',
    });
    const teamsTab = h('button', {
      type: 'button',
      class: 'standings-subtab',
      role: 'tab',
      id: 'standings-tab-teams',
      'aria-controls': 'standings-panel-teams',
      'aria-selected': 'false',
      tabindex: '-1',
      text: 'Constructeurs',
    });
    const driversPanel = h(
      'div',
      {
        id: 'standings-panel-drivers',
        class: 'standings-table-panel',
        role: 'tabpanel',
        'aria-labelledby': 'standings-tab-drivers',
      },
      driverTable()
    );
    const teamsPanel = h(
      'div',
      {
        id: 'standings-panel-teams',
        class: 'standings-table-panel',
        role: 'tabpanel',
        'aria-labelledby': 'standings-tab-teams',
        hidden: true,
      },
      teamTable()
    );

    const selectTab = (tab, panel, otherTab, otherPanel) => {
      tab.classList.add('is-active');
      otherTab.classList.remove('is-active');
      tab.setAttribute('aria-selected', 'true');
      otherTab.setAttribute('aria-selected', 'false');
      tab.tabIndex = 0;
      otherTab.tabIndex = -1;
      panel.hidden = false;
      otherPanel.hidden = true;
      tab.focus();
    };

    driversTab.addEventListener('click', () => selectTab(driversTab, driversPanel, teamsTab, teamsPanel));
    teamsTab.addEventListener('click', () => selectTab(teamsTab, teamsPanel, driversTab, driversPanel));
    [driversTab, teamsTab].forEach((tab) =>
      tab.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          (tab === driversTab ? teamsTab : driversTab).click();
        }
      })
    );

    return h(
      'section',
      { class: 'card standings-card', 'aria-labelledby': 'standings-title' },
      h('h1', { id: 'standings-title', text: 'Classements' }),
      h('p', {
        class: 'muted',
        text: 'Points issus du classement officiel de la sauvegarde. Les statistiques sont dérivées des résultats enregistrés.',
      }),
      h('div', { class: 'standings-subtabs', role: 'tablist', 'aria-label': 'Type de classement' }, driversTab, teamsTab),
      driversPanel,
      teamsPanel
    );
  }

  const panels = {
    home: { title: 'Accueil', build: homePanel },
    calendar: { title: 'Calendrier', build: calendarPanel },
    standings: { title: 'Classements', build: standingsPanel },
    drivers: {
      title: 'Pilotes / mercato', build: () => {
        ensureTransferState(save);
        const mine = save.drivers.filter((d) => d.teamId === save.playerTeamId);
        const status = (d) => save.transfers.scouting.find((x) => x.driverId === d.id);
        const openOffer = async (d) => {
          const slot = h('select', { class: 'input' }, h('option', { value: '1', text: 'Pilote n°1' }), h('option', { value: '2', text: 'Pilote n°2' }));
          slot.value = String(d.contract?.slot) === '2' ? '2' : '1';
          const salary = h('input', { class: 'input', type: 'number', min: '0.1', step: '0.1', value: String(d.contract?.salary || 1) });
          const years = h('input', { class: 'input', type: 'number', min: '1', max: '5', step: '1', value: '2' });
          const body = h('div', { class: 'stack' }, h('p', { text: 'Configurez votre proposition. La réponse arrivera dans 3 jours simulés.' }), h('label', { text: 'Poste proposé' }, slot), h('label', { text: 'Salaire annuel (M€)' }, salary), h('label', { text: 'Durée (années)' }, years));
          const ok = await showModal({ title: `Offre pour ${d.name}`, body, wide: true, actions: [{ label: 'Annuler', value: false, variant: 'btn--ghost', autofocus: true }, { label: 'Envoyer l’offre', value: true, variant: 'btn--primary' }] });
          if (!ok) return; const r = offerDriver(save, d.id, slot.value, salary.value, years.value); if (!r.ok) return toast(r.error, { error: true }); persist(); show('drivers'); toast('Offre planifiée : réponse dans 3 jours.');
        };
        const prospect = (d) => {
          const activeProspections = save.transfers.scouting.filter((entry) => !entry.completed).length;
          if (activeProspections >= 3) return toast('Limite atteinte : 3 prospections simultanées maximum.', { error: true });
          const r = prospectDriver(save, d.id);
          if (!r.ok) return toast(r.error, { error: true });
          persist(); show('drivers'); toast(`Prospection planifiée pour ${d.name}, réponse dans 7 jours.`);
        };
        const line = (d) => {
          const info = driverConfidential(save, d.id);
          const sc = status(d);
          const current = save.teams.find((t) => t.id === d.teamId);
          const isMine = d.teamId === save.playerTeamId;
          const acceptedOffer = save.transfers.offers.find((o) => o.driverId === d.id && (o.accepted === true || o.decision?.accepted === true));
          const signed = save.transfers.signed.find((o) => o.driverId === d.id);
          const deferred = d.contract?.deferred === true || !!d.futureContract || !!signed || !!acceptedOffer;
          const pendingTeamId = d.futureContract?.teamId || signed?.targetTeamId || acceptedOffer?.targetTeamId;
          const pendingTeam = save.teams.find((t) => t.id === pendingTeamId);
          const pendingSeason = d.futureContract?.startSeason || signed?.startSeason || (acceptedOffer ? Number(save.season ?? String(save.gameDate).slice(0, 4)) + 1 : null);
          const pendingSlot = d.futureContract?.slot || signed?.slot || acceptedOffer?.slot;
          const confirmation = deferred && pendingTeam
            ? `Rejoindra ${pendingTeam.name} en ${pendingSeason} en tant que pilote n°${pendingSlot}.`
            : null;
          const confidential = sc?.completed || isMine;
          let action = null;
          if (confirmation) {
            action = h('p', { class: 'transfer-private', text: confirmation });
          } else if (confidential) {
            action = h('button', { type: 'button', class: 'btn btn--small btn--primary', text: isMine ? 'Renouveler le contrat' : 'Faire une offre', onClick: () => openOffer(d), disabled: save.transfers.offers.some((o) => o.driverId === d.id && !o.resolved) });
          } else {
            action = h('button', { type: 'button', class: 'btn btn--small', text: sc ? `Prospection prévue le ${formatGameDate(sc.dueOn)}` : 'Prospecter le pilote', onClick: () => prospect(d), disabled: !!sc && !sc.completed });
          }
          return h('article', { class: 'transfer-row card' }, h('div', {}, h('strong', { text: d.name }), h('p', { class: 'muted', text: `${current?.name || 'Agent libre'} · ${d.category} · ${d.age ?? '—'} ans · Note ${driverOverall(d)}` }), confidential && !confirmation ? h('p', { class: 'transfer-private', text: `Loyalty : ${info.loyalty ?? '—'} · Salaire : ${formatMoney(info.contract?.salary || 0)} · Fin : saison ${info.contract?.endSeason ?? '—'}` }) : null), h('div', { class: 'row' }, action));
        };
        return h('div', { class: 'stack' }, h('section', { class: 'card' }, h('h1', { text: 'Pilotes / marché des transferts' }), h('p', { class: 'muted', text: 'Vos pilotes restent affichés ci-dessus ; la prospection révèle les informations confidentielles après 7 jours.' }), h('div', { class: 'grid2' }, mine.map(driverCard))), h('section', { class: 'card' }, h('h2', { text: 'Prospection' }), h('div', { class: 'transfer-list' }, save.drivers.map(line))));
      }
    },
    settings: { title: 'Paramètres et sauvegarde', build: settingsPanel },
  };

  const navButtons = [...document.querySelectorAll('#gameNav button[data-panel]')];
  function show(key) {
    statusEl = null;
    main.replaceChildren(panels[key].build());
    navButtons.forEach((b) => {
      if (b.dataset.panel === key) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  navButtons.forEach((b) => b.addEventListener('click', () => show(b.dataset.panel)));

  ensureTransferState(save);
  paintHeader();
  persist();          // met à jour lastPlayedAt à l'ouverture
  show('home');
  flushSeasonModals(); // modale de fin / début de saison restée en attente (rechargement de page)
}

init();
