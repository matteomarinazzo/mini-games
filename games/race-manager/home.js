/**
 * Vue « menu principal » V1 : affichage de la partie, onglets, sauvegarde manuelle/automatique,
 * export/import JSON, profil de l'écurie. Aucune fonctionnalité des versions ultérieures.
 *
 * Le slot arrive par l'URL (home.html?slot=N) ; il est validé (entier 1–3) puis relu depuis
 * localStorage : l'URL ne transporte jamais de données de partie.
 */
import { SLOT_COUNT, SEASON, STAT_KEYS, STAT_LABELS, DEPT_KEYS, DEPT_LABELS, CATEGORIES, START_LEVELS, UPGRADE_LEVELS, TEAM_NAME_MAX } from './js/core/constants.js';
import { readSlot, writeSlot, downloadSave, setLastSlot } from './js/core/storage.js';
import { driverOverall, teamOverall, validateTeamName, validateColor } from './js/core/validation.js';
import { TEAMS_2026 } from './js/data/teams-2026.js';
import { formatMoney, formatPlayTime, formatGameDate } from './js/core/utils.js';
import { h, kv, ratingBar, toast } from './js/ui.js';
import { runImportFlow } from './js/import-flow.js';

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
        h('div', {}, h('h3', { text: d.name }), h('p', { class: 'muted', text: `${d.abbr} · ${CATEGORIES[d.category]} · ${d.nationality}${d.age != null ? ` · ${d.age} ans` : ''}` })),
        h('div', { class: 'ovr', 'aria-label': `Note globale ${driverOverall(d)}` }, h('span', { text: String(driverOverall(d)) }), h('small', { text: 'Note' }))),
      h('div', { class: 'stats' }, STAT_KEYS.map((k) => ratingBar(STAT_LABELS[k], d.stats[k]))),
      kv([['Salaire annuel', formatMoney(d.contract.salary)], ['Contrat', `jusqu’à la fin de la saison ${d.contract.endSeason}`]]));
  }

  function homePanel() {
    const t = teamOf();
    const mine = save.drivers.filter((d) => d.teamId === t.id);
    return h('div', { class: 'stack' },
      h('section', { class: 'card hero' },
        h('h1', { text: t.name }),
        kv([['Emplacement', String(slotId)], ['Saison', `${SEASON} · ${formatGameDate(save.gameDate)} (date simulée)`], ['Solde actuel', formatMoney(t.balance)], ['Temps de jeu', formatPlayTime(save.playTimeSeconds)],
        ['Difficulté', `Départements : ${START_LEVELS[save.difficulty.startingDepartmentLevel].label} · Améliorations : ${UPGRADE_LEVELS[save.difficulty.upgradeDifficulty].label}`]])),
      h('section', { class: 'card card--notice', role: 'note' },
        h('h2', { text: 'Version 1 : création de l’écurie' }),
        h('p', { text: 'Aucun calendrier n’est encore jouable : la saison n’a pas commencé et aucune course, qualification ou amélioration n’est disponible pour l’instant. Vous pouvez consulter votre écurie, enregistrer et exporter votre partie.' })),
      h('section', { 'aria-labelledby': 'drvTitle' }, h('h2', { id: 'drvTitle', text: 'Vos pilotes' }), h('div', { class: 'grid2' }, mine.map(driverCard))),
      h('section', { class: 'card', 'aria-labelledby': 'depTitle' },
        h('h2', { id: 'depTitle', text: 'Départements' }),
        DEPT_KEYS.map((k) => ratingBar(DEPT_LABELS[k], t.departmentRatings[k])),
        h('p', { class: 'overall', text: `Note globale de l’écurie : ${teamOverall(t)}` })));
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

  const panels = {
    home: { title: 'Accueil', build: homePanel },
    standings: { title: 'Classements', build: () => placeholder('Classements', 'Les classements pilotes et écuries apparaîtront quand des courses pourront être disputées.') },
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
