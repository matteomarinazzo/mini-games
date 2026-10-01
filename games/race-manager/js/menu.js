/**
 * Vue « menu des sauvegardes » : 3 slots (vide / occupé / invalide), création, chargement,
 * suppression confirmée, import JSON.
 */
import { SLOT_COUNT } from './core/constants.js';
import { readSlot, deleteSlot, isStorageAvailable, getLastSlot, setLastSlot } from './core/storage.js';
import { summarizeSave } from './core/game-state.js';
import { h, confirmDialog, toast } from './ui.js';
import { summaryNode } from './summary-view.js';
import { runImportFlow } from './import-flow.js';
import { startWizard } from './menu-wizard.js';

const slotsEl = document.getElementById('slots');
const slotsView = document.getElementById('slotsView');
const wizardView = document.getElementById('wizardView');
const banner = document.getElementById('storageBanner');

function emptySlot(n) {
  return h('article', { class: 'slot slot--empty', 'aria-labelledby': `slot-title-${n}` },
    h('div', { class: 'slot__head' }, h('h3', { id: `slot-title-${n}`, text: `Emplacement ${n}` }), h('span', { class: 'badge', text: 'Vide' })),
    h('p', { class: 'muted', text: 'Aucune partie enregistrée.' }),
    h('div', { class: 'slot__actions' },
      h('button', { type: 'button', class: 'btn btn--primary', text: 'Nouvelle partie', 'aria-label': `Nouvelle partie dans l’emplacement ${n}`, onClick: () => openWizard(n) }),
      h('button', { type: 'button', class: 'btn btn--ghost', text: 'Importer un JSON', 'aria-label': `Importer un JSON dans l’emplacement ${n}`, onClick: () => importInto(n) })));
}

function filledSlot(n, save) {
  const sum = summarizeSave(save);
  const last = getLastSlot() === n;
  return h('article', { class: 'slot slot--filled', style: { '--team': sum.color }, 'aria-labelledby': `slot-title-${n}` },
    h('div', { class: 'slot__head' }, h('h3', { id: `slot-title-${n}`, text: `Emplacement ${n}` }), h('span', { class: 'badge badge--ok', text: last ? 'Occupé · dernière partie' : 'Occupé' })),
    summaryNode(sum),
    h('div', { class: 'slot__actions' },
      h('a', { class: 'btn btn--primary', href: `home.html?slot=${n}`, 'aria-label': `Charger la partie de l’emplacement ${n}`, text: 'Charger', onClick: () => setLastSlot(n) }),
      h('button', { type: 'button', class: 'btn btn--danger-ghost', text: 'Supprimer', 'aria-label': `Supprimer la partie de l’emplacement ${n}`, onClick: () => removeSlot(n, sum.teamName) })));
}

function invalidSlot(n, res) {
  return h('article', { class: 'slot slot--invalid', 'aria-labelledby': `slot-title-${n}` },
    h('div', { class: 'slot__head' }, h('h3', { id: `slot-title-${n}`, text: `Emplacement ${n}` }), h('span', { class: 'badge badge--bad', text: '⚠ Invalide' })),
    h('p', { text: 'Cette sauvegarde est illisible ou d’une version non prise en charge. Elle n’a pas été modifiée.' }),
    h('ul', { class: 'plain' }, res.errors.slice(0, 3).map((e) => h('li', { text: e }))),
    h('div', { class: 'slot__actions' },
      res.status === 'unavailable' ? null
        : h('button', { type: 'button', class: 'btn btn--danger-ghost', text: 'Supprimer', 'aria-label': `Supprimer les données invalides de l’emplacement ${n}`, onClick: () => removeSlot(n, null) })));
}

function render() {
  slotsEl.replaceChildren(...Array.from({ length: SLOT_COUNT }, (_, i) => {
    const n = i + 1;
    const res = readSlot(n);
    if (res.status === 'empty') return emptySlot(n);
    if (res.status === 'ok') return filledSlot(n, res.save);
    return invalidSlot(n, res);
  }));
}

async function removeSlot(n, teamName) {
  const ok = await confirmDialog({
    title: `Supprimer l’emplacement ${n} ?`,
    message: teamName
      ? `La partie « ${teamName} » sera définitivement supprimée. Cette action est irréversible : exportez d’abord la partie en JSON si vous voulez la conserver.`
      : 'Ces données invalides seront définitivement supprimées.',
    confirmLabel: 'Supprimer définitivement', danger: true,
  });
  if (!ok) return;
  const r = deleteSlot(n);
  toast(r.ok ? `Emplacement ${n} supprimé.` : r.error, { error: !r.ok });
  render();
}

async function importInto(n) {
  const r = await runImportFlow({ slotId: n });
  if (r.ok) render();
}

function openWizard(n) {
  slotsView.hidden = true;
  wizardView.hidden = false;
  startWizard({
    slotId: n,
    mount: wizardView,
    onExit: () => { wizardView.hidden = true; wizardView.replaceChildren(); slotsView.hidden = false; render(); document.getElementById('slotsTitle').focus(); },
  });
}

if (!isStorageAvailable()) {
  banner.hidden = false;
  banner.textContent = '⚠ Le stockage local de votre navigateur est indisponible (navigation privée ou stockage bloqué) : les parties ne pourront pas être enregistrées ici.';
}
render();
