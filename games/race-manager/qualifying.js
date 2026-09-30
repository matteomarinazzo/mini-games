import { SLOT_COUNT } from './js/core/constants.js';
import { readSlot, writeSlot } from './js/core/storage.js';
import { formatGameDate, formatMoney } from './js/core/utils.js';
import { h, showModal, toast } from './js/ui.js';
import { CALENDAR_2026 } from './js/data/calendar-2026.js';
import { nextQualifyingSession, playerQualifyingDrivers, runQualifyingSession, simulateRemainingQualifications, weekendFor } from './js/core/weekend.js';

const main = document.getElementById('content');
const params = new URLSearchParams(location.search);
const slotId = Number(params.get('slot'));
const roundId = params.get('round');

function lapTime(milliseconds) {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = ((milliseconds % 60_000) / 1000).toFixed(3).padStart(6, '0');
  return `${minutes}:${seconds}`;
}

function fatal(message) {
  main.replaceChildren(h('section', { class: 'card' }, h('h1', { text: 'Qualifications indisponibles' }), h('p', { text: message }), h('a', { class: 'btn btn--primary', href: 'menu.html', text: 'Retour aux sauvegardes' })));
}

function init() {
  if (!Number.isInteger(slotId) || slotId < 1 || slotId > SLOT_COUNT) return fatal('Emplacement de sauvegarde invalide.');
  const loaded = readSlot(slotId);
  if (loaded.status !== 'ok') return fatal(loaded.errors?.[0] || 'Sauvegarde indisponible.');
  const round = CALENDAR_2026.find((entry) => entry.id === roundId);
  if (!round) return fatal('Grand Prix introuvable.');
  if (loaded.save.gameDate !== round.qualifyingDate && !loaded.save.weekends[round.id]?.qualifying?.grid?.length) return fatal('Les qualifications ne sont pas accessibles à cette date.');
  run(loaded.save, round);
}

function run(save, round) {
  const playerTeam = save.teams.find((team) => team.id === save.playerTeamId);
  const driverById = (id) => save.drivers.find((driver) => driver.id === id);
  const persist = () => writeSlot(slotId, save);
  document.documentElement.style.setProperty('--team', playerTeam.color);
  document.getElementById('hdrTeam').textContent = playerTeam.name;
  document.getElementById('hdrBalance').textContent = `Solde : ${formatMoney(playerTeam.balance)}`;
  document.getElementById('backLink').href = `home.html?slot=${slotId}`;

  function resultList(results) {
    return h('ol', { class: 'result-list' }, results.map((row) => {
      const driver = driverById(row.driverId);
      return h('li', { class: driver.teamId === save.playerTeamId ? 'is-player' : '' }, h('span', { class: 'result-list__position', text: String(row.rank || row.position) }), h('strong', { text: driver.name }), h('span', { text: lapTime(row.timeMs) }));
    }));
  }

  function lightsOut(driver) {
    return new Promise((resolve) => {
      const dialog = h('dialog', { class: 'modal lights-out', 'aria-labelledby': 'lightsTitle' });
      const status = h('p', { class: 'lights-out__status', text: 'Attendez les feux...' });
      const button = h('button', { type: 'button', class: 'btn btn--primary lights-out__button', text: 'Attendre', disabled: true });
      let greenAt = 0;
      const timer = setTimeout(() => {
        greenAt = Date.now();
        status.textContent = 'FEUX ÉTEINTS !';
        button.disabled = false;
        button.textContent = 'Réagir';
        button.focus();
      }, 900 + Math.floor(Math.random() * 900));
      const close = (bonus) => { clearTimeout(timer); dialog.close(); dialog.remove(); resolve(bonus); };
      button.addEventListener('click', () => {
        const reaction = Date.now() - greenAt;
        const bonus = reaction < 260 ? .8 : reaction < 450 ? .35 : reaction < 800 ? 0 : -.35;
        status.textContent = `Réaction : ${reaction} ms`;
        button.disabled = true;
        button.textContent = bonus > 0 ? 'Bon bonus' : bonus < 0 ? 'Réaction tardive' : 'Réaction correcte';
        setTimeout(() => close(bonus), 700);
      });
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(0); });
      dialog.append(h('h2', { id: 'lightsTitle', text: `Lights Out · ${driver.name}` }), h('p', { class: 'muted', text: 'Réagissez dès que les feux s’éteignent. Le bonus est limité : les notes du pilote et de l’écurie restent déterminantes.' }), status, button);
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  async function showGrid() {
    const weekend = weekendFor(save, round.id);
    if (!weekend.qualifying.grid.length) simulateRemainingQualifications(save, round.id);
    const written = persist();
    if (!written.ok) return toast(written.error, { error: true });
    const choice = await showModal({
      title: 'Grille de départ',
      wide: true,
      body: h('div', {}, h('p', { class: 'muted', text: `${round.name} · ${formatGameDate(round.raceDate)}` }), resultList(weekend.qualifying.grid)),
      actions: [{ label: 'Aller à la course', value: 'race', variant: 'btn--primary', autofocus: true }],
    });
    if (choice === 'race') {
      weekend.raceReady = true;
      save.gameDate = round.raceDate;
      const saved = persist();
      if (!saved.ok) return toast(saved.error, { error: true });
      location.href = `home.html?slot=${slotId}`;
    }
  }

  async function showSessionResult(sessionResult) {
    const next = nextQualifyingSession(save, round.id);
    const playerStillEligible = next && playerQualifyingDrivers(save, round.id).length > 0;
    const action = playerStillEligible ? `Passer aux ${next}` : 'Voir la grille de départ';
    const choice = await showModal({
      title: `${sessionResult.session} · Résultats`,
      wide: true,
      body: h('div', {}, h('p', { class: 'muted', text: playerStillEligible ? 'Au moins un de vos pilotes poursuit les qualifications.' : 'Vos pilotes ne poursuivent plus. Les sessions restantes seront simulées pour établir la grille.' }), resultList(sessionResult.results)),
      actions: [{ label: action, value: playerStillEligible ? 'next' : 'grid', variant: 'btn--primary', autofocus: true }],
    });
    if (choice === 'next') return startSession();
    return showGrid();
  }

  async function startSession() {
    const session = nextQualifyingSession(save, round.id);
    if (!session) return showGrid();
    const reactions = {};
    for (const driverId of playerQualifyingDrivers(save, round.id)) reactions[driverId] = await lightsOut(driverById(driverId));
    const result = runQualifyingSession(save, round.id, reactions);
    if (!result.ok) return toast(result.error, { error: true });
    const written = persist();
    if (!written.ok) return toast(written.error, { error: true });
    render();
    await showSessionResult(result);
  }

  function render() {
    const weekend = weekendFor(save, round.id);
    const session = nextQualifyingSession(save, round.id);
    main.replaceChildren(h('div', { class: 'stack' },
      h('section', { class: 'card qualifying-hero' }, h('h1', { text: `Qualifications · R${round.round}` }), h('p', { text: round.name }), h('p', { class: 'muted', text: `${round.circuit} · ${formatGameDate(round.qualifyingDate)} · format 24 → 17 → 10.` }),
        h('div', { class: 'qualifying-actions' }, weekend.qualifying.grid.length
          ? h('button', { type: 'button', class: 'btn btn--primary', text: 'Voir la grille de départ', onClick: showGrid })
          : h('button', { type: 'button', class: 'btn btn--primary', text: `Démarrer ${session}`, onClick: startSession }))),
      h('section', { class: 'card' }, h('h2', { text: 'Sessions terminées' }), Object.keys(weekend.qualifying.sessions).length
        ? h('div', {}, Object.values(weekend.qualifying.sessions).map((entry) => h('p', { text: `${entry.name} enregistré · ${entry.results.length} pilotes.` })))
        : h('p', { class: 'muted', text: 'Aucune session disputée.' }))));
    main.focus({ preventScroll: true });
  }

  render();
}

init();
