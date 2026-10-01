/**
 * Vue « menu principal » V1 : affichage de la partie, onglets, sauvegarde manuelle/automatique,
 * export/import JSON, profil de l'écurie. Aucune fonctionnalité des versions ultérieures.
 *
 * Le slot arrive par l'URL (home.html?slot=N) ; il est validé (entier 1–3) puis relu depuis
 * localStorage : l'URL ne transporte jamais de données de partie.
 */
import { SLOT_COUNT, SEASON, STAT_KEYS, STAT_LABELS, DEPT_KEYS, DEPT_LABELS, CATEGORIES, START_LEVELS, UPGRADE_LEVELS, TEAM_NAME_MAX } from './core/constants.js';
import { readSlot, writeSlot, downloadSave, setLastSlot } from './core/storage.js';
import { driverOverall, teamOverall, validateTeamName, validateColor } from './core/validation.js';
import { TEAMS_2026 } from './data/teams-2026.js';
import { formatMoney, formatPlayTime, formatGameDate } from './core/utils.js';
import { h, kv, ratingBar, toast, confirmDialog } from './ui.js';
import { runImportFlow } from './import-flow.js';
import { CALENDAR_2026 } from './data/calendar-2026.js';
import { advanceOneDay, advanceToNextEvent, eventsForWeek, nextProgression, roundStatus, startUpgrade, upgradeCost } from './core/progression.js';
import { weekendFor } from './core/weekend.js';

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
  const teamOf = () => save.teams.find((t) => t.id === save.playerTeamId);
  let suspended = false;            // vrai quand la page va être rechargée après un import (ne plus écrire)
  let visibleSince = document.hidden ? null : Date.now();
  let statusEl;

  // ---- Temps de jeu et sauvegarde
  const accrue = () => {
    if (visibleSince === null) return;
    const now = Date.now();
    save.playTimeSeconds = Math.round(save.playTimeSeconds + (now - visibleSince) / 1000);
    visibleSince = now;
  };
  function persist() {
    if (suspended) return { ok: true };
    accrue();
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
      kv([['Salaire annuel', formatMoney(d.contract.salary)], ['Contrat', `jusqu’à la fin de la saison ${d.contract.endSeason}`]]));
  }

  const eventTitle = (event) => {
    if (!event) return 'Saison terminée';
    if (event.type === 'upgrade') return `Amélioration terminée · ${DEPT_LABELS[event.upgrade.dept]}`;
    const labels = { training: 'Entraînement pilotes', qualifying: 'Qualifications', race: 'Course' };
    return `${labels[event.type]} · R${event.round.round} · ${event.round.name}`;
  };

  const playerDriver = (id) => save.drivers.find((driver) => driver.id === id);
  const lapTime = (milliseconds) => {
    const minutes = Math.floor(milliseconds / 60_000);
    const seconds = ((milliseconds % 60_000) / 1000).toFixed(3).padStart(6, '0');
    return `${minutes}:${seconds}`;
  };

  function resultsTable(results, title) {
    return h('section', { class: 'session-results' }, h('h3', { text: title }),
      h('ol', { class: 'result-list' }, results.map((row) => {
        const driver = playerDriver(row.driverId);
        return h('li', { class: driver.teamId === save.playerTeamId ? 'is-player' : '' }, h('span', { class: 'result-list__position', text: String(row.rank || row.position) }), h('strong', { text: driver.name }), h('span', { text: row.timeMs ? lapTime(row.timeMs) : `${row.points} pts` }));
      })));
  }

  function eventIcon(type) {
    const paths = {
      training: ['M5 3v4', 'M19 3v4', 'M3 8h18', 'M5 12h4v7H5z', 'M15 12h4v7h-4z'],
      qualifying: ['M5 4h10l-2 5 2 5H5z', 'M5 4v16'],
      race: ['M4 16h16', 'M6 16l2-7h8l2 7', 'M9 9V6h6v3', 'M7 19h.01', 'M17 19h.01'],
      upgrade: ['M14 4a4 4 0 0 0-4 5l-6 6 5 5 6-6a4 4 0 0 0 5-4l-4 1z'],
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `event-icon event-icon--${type}`);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of paths[type] || []) {
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
    const labels = { training: 'Entraînement', qualifying: 'Qualifications', race: 'Course', upgrade: 'Amélioration terminée' };
    const formatDay = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const qualifyingRound = CALENDAR_2026.find((round) => round.qualifyingDate === save.gameDate);
    const pendingQualifying = qualifyingRound && !save.weekends[qualifyingRound.id]?.qualifying?.grid?.length;
    const raceRound = CALENDAR_2026.find((round) => round.raceDate === save.gameDate && !save.weekends[round.id]?.race);
    const pendingRace = !!raceRound;
    const enterQualifying = () => { location.href = `qualifying.html?slot=${slotId}&round=${encodeURIComponent(qualifyingRound.id)}`; };
    const enterRace = () => { location.href = `race.html?slot=${slotId}&round=${encodeURIComponent(raceRound.id)}`; };
    return h('section', { class: 'weekly-calendar', 'aria-labelledby': 'weekTitle' },
      h('div', { class: 'weekly-calendar__head' },
        h('div', {}, h('h2', { id: 'weekTitle', text: 'Les 7 prochains jours' }), h('p', { class: 'muted', text: `Du ${formatGameDate(weekDates[0])} au ${formatGameDate(weekDates.at(-1))}.` })),
        h('div', { class: 'weekly-calendar__actions' },
          h('button', { type: 'button', class: 'btn', text: 'Avancer d’un jour', onClick: advanceDay, disabled: !nextProgression(save) || pendingQualifying || pendingRace }),
          h('button', { type: 'button', class: 'btn btn--primary', text: pendingQualifying ? 'Passer aux qualifications' : pendingRace ? 'Passer à la course' : 'Aller au prochain événement', onClick: pendingQualifying ? enterQualifying : pendingRace ? enterRace : advanceCalendar, disabled: !nextProgression(save) && !pendingQualifying && !pendingRace }))),
      h('div', { class: 'week-grid' }, weekDates.map((date) => {
        const daysEvents = events.filter((event) => event.date === date && (event.type !== 'upgrade' || event.upgrade.teamId === save.playerTeamId));
        return h('article', { class: `week-day${date === save.gameDate ? ' is-today' : ''}` },
          h('h3', { text: formatDay.format(new Date(`${date}T12:00:00Z`)) }),
          daysEvents.length
            ? h('ul', { class: 'week-events' }, daysEvents.map((event) => h('li', { class: `week-event week-event--${event.type}` }, eventIcon(event.type), h('span', { text: labels[event.type] }), event.round ? h('small', { text: `R${event.round.round}` }) : null)))
            : h('p', { class: 'week-empty', text: 'Aucun événement' }));
      })));
  }

  async function advanceCalendar() {
    const next = nextProgression(save);
    if (!next) return toast('La saison 2026 est terminée.', { error: true });

    const btns = document.querySelectorAll('.weekly-calendar__actions button');
    btns.forEach(b => b.disabled = true);

    while (true) {
      const result = advanceOneDay(save);
      persist();
      paintHeader();

      // Update UI without triggering scroll/focus of show()
      main.replaceChildren(panels['home'].build());

      if (!result.ok || result.events?.length > 0) {
        if (result.events?.length > 0) {
          toast(`Événement exécuté : ${eventTitle(result.event)}.`);
        } else if (!result.ok) {
          toast(result.error, { error: true });
        }
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  async function advanceDay() {
    const result = advanceOneDay(save);
    if (!result.ok) {
      const written = result.events?.length ? persist() : { ok: true };
      paintHeader();
      show('home');
      toast(written.ok ? result.error : written.error, { error: true });
      return;
    }
    const written = persist();
    paintHeader();
    show('home');
    toast(written.ok ? (result.event ? `Événement exécuté : ${eventTitle(result.event)}.` : `Calendrier avancé au ${formatGameDate(save.gameDate)}.`) : written.error, { error: !written.ok });
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
        h('strong', { text: `R${CALENDAR_2026.find((round) => round.id === entry.roundId)?.round} · ${formatGameDate(entry.date)}` }),
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
          kv([['Date simulée', formatGameDate(save.gameDate)], ['Saison', `${SEASON} · R${save.calendar.currentRound || 1}/24`], ['Solde actuel', formatMoney(t.balance)], ['Temps de jeu', formatPlayTime(save.playTimeSeconds)]]),
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
    const passed = round.raceDate < save.gameDate;
    const weekend = save.weekends[round.id];
    return h('article', { class: `card season-round${passed ? ' is-past' : ''}` },
      h('div', { class: 'season-round__head' }, h('div', {}, h('h3', { text: `R${round.round} · ${round.name}` }), h('p', { class: 'muted', text: round.circuit })), h('span', { class: 'badge', text: roundStatus(round, save.gameDate) })),
      h('ol', { class: 'round-events' },
        ...round.trainingDates.map((date) => h('li', {}, eventIcon('training'), h('span', { text: `Entraînement pilotes · ${formatGameDate(date)}` }))),
        h('li', {}, eventIcon('qualifying'), h('span', { text: `Qualifications · ${formatGameDate(round.qualifyingDate)}` })),
        h('li', {}, eventIcon('race'), h('span', { text: `Course · ${formatGameDate(round.raceDate)}` }))),
      weekend?.qualifying.grid?.length ? h('p', { class: 'weekend-summary', text: `Qualifications terminées · pole : ${playerDriver(weekend.qualifying.grid[0].driverId).name}` }) : null,
      weekend?.race ? h('p', { class: 'weekend-summary', text: `Course terminée · vainqueur : ${playerDriver(weekend.race.results[0].driverId).name}` }) : null,
      weekend?.qualifying.grid?.length ? h('details', { class: 'saved-results' }, h('summary', { text: 'Voir la grille complète' }), resultsTable(weekend.qualifying.grid, 'Grille de départ')) : null,
      weekend?.race ? h('details', { class: 'saved-results' }, h('summary', { text: 'Voir le résultat de course' }), resultsTable(weekend.race.results, 'Classement final')) : null,
    );
  }

  function calendarPanel() {
    const passed = CALENDAR_2026.filter((round) => round.raceDate < save.gameDate);
    const upcoming = CALENDAR_2026.filter((round) => round.raceDate >= save.gameDate);
    const playerUpgrades = save.activities.upgrades.filter((upgrade) => upgrade.teamId === save.playerTeamId);
    return h('div', { class: 'stack' },
      h('section', { class: 'card' }, h('h1', { text: `Calendrier ${SEASON}` }), h('p', { class: 'muted', text: 'Chaque week-end comprend trois journées d’entraînement, les qualifications du samedi et la course du dimanche.' })),
      playerUpgrades.length ? h('section', { class: 'card' }, h('h2', { text: 'Améliorations planifiées' }), h('ul', { class: 'round-events' }, playerUpgrades.map((upgrade) => {
        const team = save.teams.find((entry) => entry.id === upgrade.teamId);
        return h('li', {}, eventIcon('upgrade'), h('span', { text: `${team.name} · ${DEPT_LABELS[upgrade.dept]} · fin le ${formatGameDate(upgrade.completesOn)}` }));
      }))) : null,
      passed.length ? h('section', { class: 'season-section' }, h('h2', { text: 'Manches passées' }), h('div', { class: 'season-rounds' }, passed.map(roundCalendarCard))) : null,
      h('section', { class: 'season-section' }, h('h2', { text: 'Manches à venir' }), h('div', { class: 'season-rounds' }, upcoming.map(roundCalendarCard))));
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
    const driversById = new Map(save.drivers.map((driver) => [driver.id, driver]));
    const teamsById = new Map(save.teams.map((team) => [team.id, team]));
    const driverStats = new Map();
    const teamStats = new Map();

    // Les statistiques de course sont lues dans les résultats enregistrés ; aucun point
    // n'est recalculé ici et l'écurie est celle stockée sur chaque résultat.
    for (const weekend of Object.values(save.weekends || {})) {
      for (const result of weekend?.race?.results || []) {
        const driver = driversById.get(result.driverId);
        if (!driver) continue;
        const driverEntry = driverStats.get(result.driverId) || { wins: 0, podiums: 0 };
        if (result.position === 1) driverEntry.wins += 1;
        if (result.position <= 3) driverEntry.podiums += 1;
        driverStats.set(result.driverId, driverEntry);

        const teamEntry = teamStats.get(result.teamId) || { wins: 0, podiums: 0 };
        if (result.position === 1) teamEntry.wins += 1;
        if (result.position <= 3) teamEntry.podiums += 1;
        teamStats.set(result.teamId, teamEntry);
      }
    }

    const driverRows = (save.standings?.drivers || []).map((standing, index) => {
      const driver = driversById.get(standing.driverId);
      if (!driver) return null;
      const stats = driverStats.get(driver.id) || { wins: 0, podiums: 0 };
      return { ...standing, driver, stats, rank: index + 1 };
    }).filter(Boolean);
    const teamRows = (save.standings?.teams || []).map((standing, index) => {
      const team = teamsById.get(standing.teamId);
      if (!team) return null;
      const stats = teamStats.get(team.id) || { wins: 0, podiums: 0 };
      return { ...standing, team, stats, rank: index + 1 };
    }).filter(Boolean);
    const leaderPoints = (rows) => rows[0]?.points ?? 0;
    const gapText = (points, leader) => points === leader ? '—' : `−${leader - points}`;

    const teamCell = (team) => h('span', { class: 'team-cell' },
      h('span', { class: 'team-swatch', style: { '--team-color': team.color, background: team.color }, 'aria-hidden': 'true' }),
      h('span', { text: team.name }));
    const playerMark = h('span', { class: 'standings-player-mark', 'aria-label': 'Écurie du joueur', text: '' });

    const driverTable = () => {
      const leader = leaderPoints(driverRows);
      return h('div', { class: 'table-scroll' }, h('table', {},
        h('caption', { class: 'sr-only', text: 'Classement des pilotes' }),
        h('thead', {}, h('tr', {}, ['#', 'Pilote', 'Écurie', 'Points', 'Écart', 'Victoires', 'Podiums'].map((label) => h('th', { scope: 'col', text: label })))),
        h('tbody', {}, driverRows.length ? driverRows.map((row) => {
          const isPlayer = row.driver.teamId === playerTeamId;
          const team = teamsById.get(row.driver.teamId);
          return h('tr', { class: isPlayer ? 'is-player-team' : '', 'data-team-color': team?.color || '' },
            h('td', { class: 'standings-rank', text: String(row.rank) }),
            h('th', { scope: 'row', class: 'standings-name' }, isPlayer ? playerMark.cloneNode(true) : null, h('strong', { text: row.driver.name })),
            h('td', {}, team ? teamCell(team) : h('span', { class: 'muted', text: '—' })),
            h('td', { class: 'standings-points', text: String(row.points) }),
            h('td', { text: gapText(row.points, leader) }),
            h('td', { text: String(row.stats.wins) }),
            h('td', { text: String(row.stats.podiums) }));
        }) : h('tr', {}, h('td', { colspan: '7', class: 'muted', text: 'Aucune course enregistrée.' })))));
    };

    const teamTable = () => {
      const leader = leaderPoints(teamRows);
      return h('div', { class: 'table-scroll' }, h('table', {},
        h('caption', { class: 'sr-only', text: 'Classement des constructeurs' }),
        h('thead', {}, h('tr', {}, ['#', 'Écurie', 'Points', 'Écart', 'Victoires', 'Podiums'].map((label) => h('th', { scope: 'col', text: label })))),
        h('tbody', {}, teamRows.length ? teamRows.map((row) => {
          const isPlayer = row.team.id === playerTeamId;
          return h('tr', { class: isPlayer ? 'is-player-team' : '' },
            h('td', { class: 'standings-rank', text: String(row.rank) }),
            h('th', { scope: 'row', class: 'standings-name' }, isPlayer ? playerMark.cloneNode(true) : null, teamCell(row.team)),
            h('td', { class: 'standings-points', text: String(row.points) }),
            h('td', { text: gapText(row.points, leader) }),
            h('td', { text: String(row.stats.wins) }),
            h('td', { text: String(row.stats.podiums) }));
        }) : h('tr', {}, h('td', { colspan: '6', class: 'muted', text: 'Aucune course enregistrée.' })))));
    };

    const driversTab = h('button', { type: 'button', class: 'standings-subtab is-active', role: 'tab', id: 'standings-tab-drivers', 'aria-controls': 'standings-panel-drivers', 'aria-selected': 'true', tabindex: '0', text: 'Pilotes' });
    const teamsTab = h('button', { type: 'button', class: 'standings-subtab', role: 'tab', id: 'standings-tab-teams', 'aria-controls': 'standings-panel-teams', 'aria-selected': 'false', tabindex: '-1', text: 'Constructeurs' });
    const driversPanel = h('div', { id: 'standings-panel-drivers', class: 'standings-table-panel', role: 'tabpanel', 'aria-labelledby': 'standings-tab-drivers' }, driverTable());
    const teamsPanel = h('div', { id: 'standings-panel-teams', class: 'standings-table-panel', role: 'tabpanel', 'aria-labelledby': 'standings-tab-teams', hidden: true }, teamTable());
    const selectTab = (tab, panel, otherTab, otherPanel) => {
      tab.classList.add('is-active'); otherTab.classList.remove('is-active');
      tab.setAttribute('aria-selected', 'true'); otherTab.setAttribute('aria-selected', 'false');
      tab.tabIndex = 0; otherTab.tabIndex = -1; panel.hidden = false; otherPanel.hidden = true; tab.focus();
    };
    driversTab.addEventListener('click', () => selectTab(driversTab, driversPanel, teamsTab, teamsPanel));
    teamsTab.addEventListener('click', () => selectTab(teamsTab, teamsPanel, driversTab, driversPanel));
    [driversTab, teamsTab].forEach((tab) => tab.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); (tab === driversTab ? teamsTab : driversTab).click(); }
    }));

    return h('section', { class: 'card standings-card', 'aria-labelledby': 'standings-title' },
      h('h1', { id: 'standings-title', text: 'Classements' }),
      h('p', { class: 'muted', text: 'Points issus du classement officiel de la sauvegarde. Les statistiques sont dérivées des résultats enregistrés.' }),
      h('div', { class: 'standings-subtabs', role: 'tablist', 'aria-label': 'Type de classement' }, driversTab, teamsTab),
      driversPanel, teamsPanel);
  }

  const panels = {
    home: { title: 'Accueil', build: homePanel },
    calendar: { title: 'Calendrier', build: calendarPanel },
    standings: { title: 'Classements', build: standingsPanel },
    drivers: { title: 'Pilotes / mercato', build: () => placeholder('Pilotes / mercato', 'La gestion des contrats et des transferts de pilotes sera ajoutée plus tard.') },
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

  paintHeader();
  persist();          // met à jour lastPlayedAt à l'ouverture
  show('home');
}

init();
