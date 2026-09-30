/**
 * Import d'une sauvegarde JSON : choix du fichier → validation → résumé → choix du slot →
 * confirmation si le slot est occupé → écriture. Aucun autre slot n'est modifié en cas d'erreur.
 */
import { SLOT_COUNT } from './core/constants.js';
import { parseImportFile, readSlot, writeSlot } from './core/storage.js';
import { summarizeSave } from './core/game-state.js';
import { h, showModal, confirmDialog, toast } from './ui.js';
import { summaryNode } from './summary-view.js';

/** Ouvre le sélecteur de fichier. À appeler directement depuis un clic (geste utilisateur). */
function pickFile() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', () => resolve(input.files[0] || null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

function slotLabel(n) {
  const r = readSlot(n);
  if (r.status === 'empty') return `Emplacement ${n} : vide`;
  if (r.status === 'ok') return `Emplacement ${n} : ${r.save.teams.find((t) => t.id === r.save.playerTeamId).name} (sera remplacé)`;
  return `Emplacement ${n} : invalide (sera remplacé)`;
}

/**
 * @param {{slotId?:number|null}} opts emplacement proposé par défaut
 * @returns {Promise<{ok:boolean, slotId?:number}>}
 */
export async function runImportFlow({ slotId = null } = {}) {
  const file = await pickFile(); // premier await : le clic initial reste un geste utilisateur valide
  if (!file) return { ok: false };

  const parsed = await parseImportFile(file);
  if (!parsed.ok) {
    await showModal({
      title: 'Import impossible',
      body: h('div', {}, h('p', { text: 'Le fichier n’a pas été importé et vos sauvegardes n’ont pas été modifiées.' }),
        h('ul', {}, parsed.errors.map((e) => h('li', { text: e })))),
      actions: [{ label: 'Fermer', value: true, autofocus: true }],
    });
    return { ok: false };
  }

  const firstEmpty = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1).find((n) => readSlot(n).status === 'empty');
  const select = h('select', { id: 'importSlot', class: 'input' },
    Array.from({ length: SLOT_COUNT }, (_, i) => h('option', { value: String(i + 1), text: slotLabel(i + 1) })));
  select.value = String(slotId || firstEmpty || 1);

  const choice = await showModal({
    title: 'Importer cette sauvegarde ?',
    wide: true,
    body: h('div', {},
      summaryNode(summarizeSave(parsed.save)),
      h('div', { class: 'field' }, h('label', { for: 'importSlot', text: 'Emplacement de destination' }), select)),
    actions: [
      { label: 'Annuler', value: false, variant: 'btn--ghost' },
      { label: 'Importer', value: true, variant: 'btn--primary', autofocus: true },
    ],
  });
  if (choice !== true) return { ok: false };

  const target = Number(select.value);
  if (readSlot(target).status !== 'empty') {
    const ok = await confirmDialog({
      title: `Remplacer l’emplacement ${target} ?`,
      message: 'La partie actuellement enregistrée dans cet emplacement sera définitivement remplacée par le fichier importé.',
      confirmLabel: 'Remplacer', danger: true,
    });
    if (!ok) return { ok: false };
  }

  const w = writeSlot(target, parsed.save);
  if (!w.ok) {
    toast(w.error, { error: true });
    return { ok: false };
  }
  toast(`Sauvegarde importée dans l’emplacement ${target}.`);
  return { ok: true, slotId: target };
}
