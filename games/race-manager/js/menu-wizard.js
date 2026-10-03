/**
 * Assistant de création de partie en 5 étapes.
 * L'état de l'assistant (`state`) vit hors des étapes : revenir en arrière ne perd aucun choix.
 * Toutes les règles sont réappliquées par createNewGame() au moment de la création.
 */
import {
  PALETTE, BUDGET_MIN, BUDGET_MAX, BUDGET_STEP, TEAM_NAME_MAX, CATEGORIES, STAT_KEYS, STAT_LABELS,
  DEPT_KEYS, DEPT_LABELS, START_LEVELS, UPGRADE_LEVELS, SEASON,
} from './core/constants.js';
import { validateTeamName, validateColor, validateBudget, validateDriverSelection, driverOverall, teamOverall, normalizeName } from './core/validation.js';
import { computeDepartmentRatings, createNewGame } from './core/game-state.js';
import { readSlot, writeSlot, setLastSlot } from './core/storage.js';
import { TEAMS_2026 } from './data/teams-2026.js';
import { DRIVERS_2026 } from './data/drivers-2026.js';
import { formatMoney, round2 } from './core/utils.js';
import { h, kv, showModal, confirmDialog, ratingBar } from './ui.js';

const TEAM_NAME_BY_ID = new Map(TEAMS_2026.map((t) => [t.id, t.name]));
const driverById = (id) => DRIVERS_2026.find((d) => d.id === id);
const field = (text, control) => h('div', { class: 'field' }, h('label', { for: control.id, text }), control);

// Les catégories sont déduites des données : une nouvelle catégorie s'intègre
// automatiquement au regroupement et au filtre.
const DRIVER_CATEGORIES = [...new Set(DRIVERS_2026.map((d) => d.category))];
const categoryLabel = (category) => CATEGORIES[category] || category;
const categoryOrder = (a, b) => {
  const preferred = ['F1', 'F2', 'F3'];
  const ai = preferred.indexOf(a);
  const bi = preferred.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? preferred.length : ai) - (bi === -1 ? preferred.length : bi);
  return a.localeCompare(b, 'fr');
};

/** Groupe de boutons radio avec description (fieldset + legend natifs). */
function radioGroup(legend, name, options, current, onChange) {
  return h('fieldset', { class: 'choices' },
    h('legend', { text: legend }),
    Object.entries(options).map(([key, o]) => {
      const input = h('input', { type: 'radio', name, value: key });
      input.checked = key === current;
      input.addEventListener('change', () => onChange(key));
      return h('label', { class: 'choice' }, input, h('span', {}, h('strong', { text: o.label }), h('small', { text: o.description })));
    }));
}

/**
 * @param {{slotId:number, mount:HTMLElement, onExit:()=>void}} opts
 */
export function startWizard({ slotId, mount, onExit }) {
  const state = {
    step: 0,
    teamName: '',
    color: PALETTE[0].value,
    budget: 10,
    driverIds: [],
    startLevel: 'medium',
    upgradeLevel: 'normal',
    filters: { category: 'all', minRating: 50, maxCost: '', sort: 'rating' },
  };
  const payload = () => ({
    teamName: state.teamName, color: state.color, budget: state.budget,
    driverIds: [...state.driverIds], startLevel: state.startLevel, upgradeLevel: state.upgradeLevel,
  });

  let nextBtn;
  let errEl;
  const setError = (msg) => { errEl.textContent = msg || ''; errEl.hidden = !msg; };

  // ------------------------------------------------------------ Étape 1 : nom et couleur
  function buildTeamStep() {
    const input = h('input', {
      id: 'teamName', class: 'input', type: 'text', maxlength: String(TEAM_NAME_MAX * 2), autocomplete: 'off',
      value: state.teamName, 'aria-describedby': 'nameHelp stepError',
    });
    const nameOut = h('strong', { class: 'team-preview__name' });
    const preview = h('div', { class: 'team-preview' }, h('span', { class: 'team-preview__stripe', 'aria-hidden': 'true' }), nameOut, h('span', { class: 'muted', text: 'Aperçu' }));
    const custom = h('input', { type: 'color', id: 'customColor', class: 'color-input', value: state.color });
    const radios = PALETTE.map((p) => {
      const r = h('input', { type: 'radio', name: 'color', value: p.value });
      r.checked = p.value === state.color;
      r.addEventListener('change', () => setColor(p.value));
      return h('label', { class: 'swatch' }, r, h('span', { class: 'swatch__dot', style: { '--c': p.value }, 'aria-hidden': 'true' }), h('span', { class: 'swatch__name', text: p.name }));
    });
    const paint = () => {
      nameOut.textContent = normalizeName(input.value) || 'Nom de votre écurie';
      preview.style.setProperty('--team', state.color);
    };
    function setColor(c) {
      state.color = c;
      custom.value = c;
      radios.forEach((l) => { const r = l.querySelector('input'); r.checked = r.value === c; });
      paint();
    }
    input.addEventListener('input', () => { state.teamName = input.value; paint(); });
    input.addEventListener('blur', () => { if (input.value) { const r = validateTeamName(input.value, TEAMS_2026.map((t) => t.name)); setError(r.ok ? '' : r.error); } });
    custom.addEventListener('input', () => setColor(custom.value));
    paint();
    return h('div', {},
      field('Nom de l’écurie', input),
      h('p', { id: 'nameHelp', class: 'muted', text: `Entre 3 et ${TEAM_NAME_MAX} caractères. Le nom ne doit pas rappeler une écurie existante.` }),
      h('fieldset', { class: 'swatches' }, h('legend', { text: 'Couleur de l’écurie' }), radios, h('div', { class: 'field field--inline' }, h('label', { for: 'customColor', text: 'Couleur personnalisée' }), custom)),
      preview);
  }
  function validateTeamStep() {
    const r = validateTeamName(state.teamName, TEAMS_2026.map((t) => t.name));
    if (!r.ok) return r.error;
    if (!validateColor(state.color)) return 'Choisissez une couleur valide.';
    state.teamName = r.name;
    return null;
  }

  // ------------------------------------------------------------ Étape 2 : budget
  function buildBudgetStep() {
    const out = h('p', { class: 'budget-big', 'aria-hidden': 'true' });
    const range = h('input', { id: 'budgetRange', type: 'range', min: BUDGET_MIN, max: BUDGET_MAX, step: BUDGET_STEP, value: state.budget });
    const num = h('input', { id: 'budgetNumber', class: 'input', type: 'number', min: BUDGET_MIN, max: BUDGET_MAX, step: '0.1', inputmode: 'decimal', value: state.budget });
    const paint = () => { out.textContent = formatMoney(state.budget); };
    range.addEventListener('input', () => { state.budget = Number(range.value); num.value = String(state.budget); setError(''); paint(); });
    num.addEventListener('input', () => {
      const r = validateBudget(num.value);
      if (r.ok) { state.budget = r.value; range.value = String(r.value); setError(''); paint(); } else setError(r.error);
    });
    num.addEventListener('change', () => { // valeur invalide laissée en place : on revient à la dernière valeur valide
      if (!validateBudget(num.value).ok) num.value = String(state.budget);
    });
    paint();
    return h('div', {},
      h('p', { text: 'Le budget de départ sert d’abord à payer les contrats des deux pilotes, puis à financer les améliorations de vos départements.' }),
      out,
      field(`Budget (curseur, de ${BUDGET_MIN} à ${BUDGET_MAX} millions)`, range),
      field('Budget exact (millions)', num));
  }
  const validateBudgetStep = () => { const r = validateBudget(state.budget); return r.ok ? null : r.error; };

  // ------------------------------------------------------------ Étape 3 : pilotes
  let hint;
  function validateDriversStep() {
    if (state.driverIds.length < 2) return `Sélectionnez encore ${2 - state.driverIds.length} pilote${state.driverIds.length === 1 ? '' : 's'}.`;
    const v = validateDriverSelection(state.driverIds, DRIVERS_2026, state.budget);
    return v.ok ? null : v.errors[0];
  }
  function refreshLive() {
    const err = validateDriversStep();
    const overBudget = state.driverIds.length === 2 && !!err;
    nextBtn.disabled = !!err;
    nextBtn.classList.toggle('is-error', overBudget);
    setError(overBudget ? `⚠ ${err}` : '');
    if (hint) hint.textContent = !overBudget && err ? err : '';
  }

  function showDetails(d) {
    const loyaltyLabel = d.teamId
      ? d.loyalty >= 70 ? `Très fidèle à son écurie (${d.loyalty}/100) — difficile à recruter`
        : d.loyalty >= 50 ? `Fidèle (${d.loyalty}/100) — peut être débauché par une équipe puissante`
          : d.loyalty >= 30 ? `Neutre (${d.loyalty}/100) — ouvert à un changement d'écurie`
            : `Peu attaché (${d.loyalty}/100) — très mobile sur le marché`
      : 'Sans contrat — disponible immédiatement';
    showModal({
      title: `${d.displayName} (${d.abbr})`,
      body: h('div', {},
        h('p', { class: 'muted', text: `${CATEGORIES[d.category]} · ${d.nationality} · ${d.age != null ? `${d.age} ans` : 'âge inconnu'}${d.fictional ? ' · pilote fictif' : ''}` }),
        h('div', { class: 'stats' }, ratingBar('Note globale', driverOverall(d)), STAT_KEYS.map((k) => ratingBar(STAT_LABELS[k], d.stats[k]))),
        kv([['Potentiel', String(d.potential)], ['Expérience', `${d.experience} an(s)`], ['Prix de recrutement', formatMoney(d.cost)], ['Salaire annuel', formatMoney(d.salary)],
        ['Fidélité à l\'écurie', loyaltyLabel],
        ['Écurie actuelle', d.teamId ? TEAM_NAME_BY_ID.get(d.teamId) : 'Aucune (disponible)']])),
      actions: [{ label: 'Fermer', value: true, autofocus: true }],
    });
  }

  function buildDriversStep() {
    const f = state.filters;
    const cat = h('select', { id: 'fCat', class: 'input' }, h('option', { value: 'all', text: 'Toutes' }), DRIVER_CATEGORIES.slice().sort(categoryOrder).map((k) => h('option', { value: k, text: categoryLabel(k) })));
    cat.value = f.category;
    const minR = h('input', { id: 'fMin', class: 'input', type: 'number', min: '50', max: '100', step: '1', inputmode: 'numeric', value: String(f.minRating) });
    const maxC = h('input', { id: 'fMax', class: 'input', type: 'number', min: '0', step: '0.5', inputmode: 'decimal', placeholder: 'Sans limite', value: String(f.maxCost) });
    const sort = h('select', { id: 'fSort', class: 'input' }, [['rating', 'Note (décroissante)'], ['costAsc', 'Prix (croissant)'], ['costDesc', 'Prix (décroissant)'], ['name', 'Nom']].map(([v, t]) => h('option', { value: v, text: t })));
    sort.value = f.sort;
    const summary = h('div', { class: 'pick-summary' });
    const list = h('div', { class: 'drivers' });
    const count = h('p', { class: 'muted', role: 'status' });
    hint = h('p', { class: 'muted', role: 'status' });

    const after = () => { renderList(); renderSummary(); refreshLive(); };
    const remove = (id) => { state.driverIds = state.driverIds.filter((x) => x !== id); after(); };
    async function pick(id) {
      if (state.driverIds.includes(id)) return;
      if (state.driverIds.length < 2) { state.driverIds.push(id); after(); return; }
      const d = driverById(id);
      const cur = state.driverIds.map(driverById);
      const choice = await showModal({
        title: 'Échanger un pilote',
        body: h('p', { text: `Vous avez déjà choisi deux pilotes. Lequel remplacer par ${d.displayName} ?` }),
        actions: [
          { label: `Remplacer ${cur[0].displayName}`, value: 0 },
          { label: `Remplacer ${cur[1].displayName}`, value: 1 },
          { label: 'Annuler', value: null, variant: 'btn--ghost', autofocus: true },
        ],
      });
      if (choice === null) return;
      state.driverIds[choice] = id;
      after();
    }

    function renderSummary() {
      const sel = state.driverIds.map(driverById);
      const total = round2(sel.reduce((a, d) => a + d.cost, 0));
      const remaining = round2(state.budget - total);
      summary.replaceChildren(
        h('div', { class: 'pick-slots' }, [0, 1].map((i) => {
          const d = sel[i];
          return h('div', { class: `pick-slot${d ? ' is-filled' : ''}` },
            h('span', { class: 'pick-slot__label', text: `Pilote ${i + 1}` }),
            d ? h('strong', { text: `${d.displayName} (${d.abbr}) · note ${driverOverall(d)}` }) : h('em', { text: 'Non choisi' }),
            d ? h('button', { type: 'button', class: 'btn btn--small btn--ghost', 'aria-label': `Retirer ${d.displayName}`, text: 'Retirer', onClick: () => remove(d.id) }) : null);
        })),
        kv([['Budget de départ', formatMoney(state.budget)], ['Coût des deux pilotes', formatMoney(total)], ['Budget restant', `${remaining < 0 ? '⚠ ' : ''}${formatMoney(remaining)}`]]));
    }

    function renderList() {
      let items = DRIVERS_2026.filter((d) => (f.category === 'all' || d.category === f.category)
        && driverOverall(d) >= f.minRating && (f.maxCost === '' || d.cost <= Number(f.maxCost)));
      const sorters = {
        rating: (a, b) => driverOverall(b) - driverOverall(a) || a.cost - b.cost,
        costAsc: (a, b) => a.cost - b.cost || driverOverall(b) - driverOverall(a),
        costDesc: (a, b) => b.cost - a.cost || driverOverall(b) - driverOverall(a),
        name: (a, b) => a.lastName.localeCompare(b.lastName, 'fr'),
      };
      items = items.sort(sorters[f.sort]);
      count.textContent = `${items.length} pilote${items.length > 1 ? 's' : ''} affiché${items.length > 1 ? 's' : ''}`;

      const grouped = new Map();
      items.forEach((d) => {
        if (!grouped.has(d.category)) grouped.set(d.category, []);
        grouped.get(d.category).push(d);
      });
      const categorySections = [...grouped.keys()].sort(categoryOrder).map((category) => {
        const row = h('ul', { class: 'driver-row' }, grouped.get(category).map((d) => {
          const selected = state.driverIds.includes(d.id);
          return h('li', { class: `driver${selected ? ' is-selected' : ''}` },
            h('div', { class: 'driver__main' },
              h('strong', { text: d.displayName }), h('span', { class: 'tag', text: d.abbr }), h('span', { class: 'tag', text: categoryLabel(d.category) }),
              selected ? h('span', { class: 'tag tag--sel', text: '✓ Sélectionné' }) : null),
            h('p', { class: 'driver__meta', text: `Note ${driverOverall(d)} · ${formatMoney(d.cost)} · ${d.teamId ? `Actuellement chez ${TEAM_NAME_BY_ID.get(d.teamId)}` : 'Sans écurie'}` }),
            d.teamId ? h('p', { class: 'driver__warn', text: 'Son équipe devra lui trouver un remplaçant.' }) : null,
            h('div', { class: 'driver__actions' },
              h('button', { type: 'button', class: 'btn btn--small', 'aria-label': `Détails de ${d.displayName}`, text: 'Détails', onClick: () => showDetails(d) }),
              selected
                ? h('button', { type: 'button', class: 'btn btn--small btn--ghost', 'aria-label': `Retirer ${d.displayName}`, text: 'Retirer', onClick: () => remove(d.id) })
                : h('button', { type: 'button', class: 'btn btn--small btn--primary', 'aria-label': `Choisir ${d.displayName}`, text: 'Choisir', onClick: () => pick(d.id) })));
        }));
        return h('section', { class: 'driver-category-section' },
          h('h3', { class: 'driver-category-title', text: categoryLabel(category) }), row);
      });
      list.replaceChildren(...categorySections);
    }

    cat.addEventListener('input', () => { f.category = cat.value; renderList(); });
    minR.addEventListener('input', () => { f.minRating = Math.max(50, Number(minR.value) || 50); renderList(); });
    maxC.addEventListener('input', () => { f.maxCost = maxC.value === '' || !Number.isFinite(Number(maxC.value)) ? '' : Number(maxC.value); renderList(); });
    sort.addEventListener('input', () => { f.sort = sort.value; renderList(); });
    renderList();
    renderSummary();
    return h('div', {},
      h('p', { text: 'Choisissez deux pilotes. Le prix total est déduit du budget de départ à la création de la partie. Si vous recrutez un pilote actif en F1, son écurie lancera une recherche de remplaçant — pouvant déclencher une cascade de transferts.' }),
      summary, hint,
      h('div', { class: 'filters' }, field('Catégorie', cat), field('Note minimale', minR), field('Prix maximal (M€)', maxC), field('Trier par', sort)),
      count, list);
  }

  // ------------------------------------------------------------ Étape 4 : difficulté
  function buildLevelsStep() {
    const preview = h('div', { class: 'dept-preview' });
    const paint = () => {
      const r = computeDepartmentRatings(state.teamName, state.startLevel);
      preview.replaceChildren(
        h('h3', { text: 'Notes de départ de vos départements' }),
        ...DEPT_KEYS.map((k) => ratingBar(DEPT_LABELS[k], r[k])),
        h('br'),
        h('p', { class: 'muted', text: `Note globale de l’écurie : ${teamOverall({ departmentRatings: r })}.` }),
        h('span', { class: 'muted', text: 'Un département est un peu plus fort (+4) et un autre un peu plus faible (−4).' }));
    };
    paint();
    return h('div', {},
      radioGroup('Note de départ des départements', 'startLevel', START_LEVELS, state.startLevel, (v) => { state.startLevel = v; paint(); }),
      radioGroup('Difficulté d’amélioration des départements', 'upgradeLevel', UPGRADE_LEVELS, state.upgradeLevel, (v) => { state.upgradeLevel = v; }),
      preview);
  }

  // ------------------------------------------------------------ Étape 5 : récapitulatif
  function buildRecapStep() {
    const res = createNewGame(payload(), slotId);
    if (!res.ok) {
      return h('div', {}, h('p', { class: 'form-error', role: 'alert', text: 'La partie ne peut pas être créée. Revenez corriger :' }), h('ul', {}, res.errors.map((e) => h('li', { text: e }))));
    }
    const { save, plan, totalCost } = res;
    const team = save.teams.find((t) => t.isPlayer);
    const mine = save.drivers.filter((d) => d.teamId === team.id);
    return h('div', { class: 'recap' },
      h('section', {}, h('h3', { text: 'Écurie' }), kv([
        ['Nom', h('span', { class: 'team-name' }, h('span', { class: 'dot', style: { '--c': team.color }, 'aria-hidden': 'true' }), team.name)],
        ['Couleur', team.color.toUpperCase()],
        ['Budget initial', formatMoney(state.budget)], ['Coût des deux pilotes', formatMoney(totalCost)], ['Budget restant', formatMoney(team.balance)]])),
      h('section', {}, h('h3', { text: 'Pilotes' }), h('ul', { class: 'plain' }, mine.map((d) => {
        const ref = driverById(d.id);
        return h('li', { text: `${d.name} (${d.abbr}) · ${CATEGORIES[d.category]} · note ${driverOverall(d)} · ${formatMoney(ref.cost)}` });
      }))),
      h('section', {}, h('h3', { text: 'Départements' }), DEPT_KEYS.map((k) => ratingBar(DEPT_LABELS[k], team.departmentRatings[k])),
        h('p', { class: 'muted', text: `Note globale de l’écurie : ${teamOverall(team)}` })),
      h('section', {}, h('h3', { text: 'Difficulté' }), kv([['Note de départ des départements', START_LEVELS[state.startLevel].label], ['Difficulté d’amélioration', UPGRADE_LEVELS[state.upgradeLevel].label]])),
      h('p', { class: 'muted', text: 'Les transferts éventuels des écuries adverses seront annoncés après la création de la partie.' }));
  }
  const validateRecapStep = () => (createNewGame(payload(), slotId).ok ? null : 'Une condition n’est plus remplie : revenez aux étapes précédentes.');

  async function createGame() {
    nextBtn.disabled = true;
    const ok = await confirmDialog({
      title: 'Créer la partie ?',
      message: `Créer l’écurie « ${state.teamName} » dans l’emplacement ${slotId} ? Le coût des deux pilotes sera déduit du budget de départ.`,
      confirmLabel: 'Créer la partie',
    });
    if (!ok) { nextBtn.disabled = false; return; }
    const fail = (msg) => { setError(msg); nextBtn.disabled = false; };
    if (readSlot(slotId).status !== 'empty') return fail('Cet emplacement n’est plus libre. Retournez au menu et choisissez-en un autre.');
    const res = createNewGame(payload(), slotId);
    if (!res.ok) return fail(res.errors.join(' '));
    const w = writeSlot(slotId, res.save);
    if (!w.ok) return fail(w.error);
    setLastSlot(slotId);

    if (res.plan.replacements.length > 0) {
      await showModal({
        title: 'Cascade de transferts',
        body: h('div', { class: 'transfers' },
          h('p', { class: 'muted', text: 'Suite à votre recrutement, voici les mouvements effectués par les autres écuries dans l\'ordre :' }),
          h('ul', { class: 'plain transfers__list' }, res.plan.replacements.map((r) => {
            const icon = r.isPoaching ? '🔄' : '✅';
            const origin = r.fromTeamId ? `ex-${r.fromTeamName}` : 'agent libre';
            const text = `${icon} ${r.teamName} recrute ${r.replacementName} (${origin}) pour remplacer ${r.leavingName}.`;
            return h('li', { class: `transfer-item${r.isPoaching ? ' transfer-item--poach' : ''}`, text });
          }))
        ),
        actions: [{ label: 'Continuer vers le QG', value: true, autofocus: true, variant: 'btn--primary' }]
      });
    }

    location.href = `home.html?slot=${slotId}`;
  }

  // ------------------------------------------------------------ Squelette de l'assistant
  const STEPS = [
    { title: 'Écurie', build: buildTeamStep, validate: validateTeamStep },
    { title: 'Budget', build: buildBudgetStep, validate: validateBudgetStep },
    { title: 'Pilotes', build: buildDriversStep, validate: validateDriversStep, live: true },
    { title: 'Difficulté', build: buildLevelsStep, validate: () => null },
    { title: 'Récapitulatif', build: buildRecapStep, validate: validateRecapStep, last: true },
  ];

  const progressNode = () => h('ol', { class: 'progress', 'aria-label': 'Progression de la création' }, STEPS.map((s, i) => h('li', {
    class: `progress__item${i < state.step ? ' is-done' : ''}${i === state.step ? ' is-current' : ''}`,
    'aria-current': i === state.step ? 'step' : null,
  }, h('span', { class: 'progress__n', text: i < state.step ? '✓' : String(i + 1) }), h('span', { class: 'progress__t', text: s.title }))));

  function onNext() {
    const step = STEPS[state.step];
    const err = step.validate();
    if (err) { setError(err); return; }
    setError('');
    if (step.last) { createGame(); return; }
    state.step++;
    show();
  }
  function onBack() {
    if (state.step === 0) { onExit(); return; }
    state.step--;
    show();
  }

  function show() {
    const step = STEPS[state.step];
    hint = null;
    errEl = h('p', { class: 'form-error', id: 'stepError', role: 'alert', hidden: true });
    const heading = h('h2', { class: 'wiz__title', tabindex: '-1', text: `Étape ${state.step + 1} sur ${STEPS.length} : ${step.title}` });
    nextBtn = h('button', { type: 'button', class: 'btn btn--primary', text: step.last ? 'Créer la partie' : 'Continuer', onClick: onNext });
    const backBtn = h('button', { type: 'button', class: 'btn btn--ghost', text: state.step === 0 ? 'Annuler' : 'Retour', onClick: onBack });
    const body = step.build();
    mount.replaceChildren(
      h('p', { class: 'muted', text: `Nouvelle partie · emplacement ${slotId}` }),
      progressNode(), heading, body, errEl, h('div', { class: 'wiz__nav' }, backBtn, nextBtn));
    if (step.live) refreshLive();
    heading.focus();
  }

  show();
}
