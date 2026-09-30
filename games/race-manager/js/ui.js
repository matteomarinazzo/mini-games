/**
 * Helpers d'interface partagés : création de DOM sûre (jamais d'innerHTML avec du texte
 * utilisateur), dialogues natifs <dialog> accessibles, notifications.
 */

/**
 * Crée un élément. `text` et les enfants passent par textContent/createTextNode : aucune injection possible.
 * Props spéciales : class, text, style (objet de variables CSS), onXxx (écouteurs).
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([p, val]) => el.style.setProperty(p, val));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Liste de définitions ; les valeurs peuvent être du texte ou des noeuds. */
export const kv = (pairs) => h('dl', { class: 'kv' }, pairs.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', {}, v)]));

/** Ligne « libellé — valeur — jauge » (la valeur est toujours écrite en toutes lettres). */
export function ratingBar(label, value) {
  const pct = Math.max(0, Math.min(100, ((value - 50) / 50) * 100));
  return h('div', { class: 'rating' },
    h('span', { class: 'rating__label', text: label }),
    h('span', { class: 'rating__num', text: String(value) }),
    h('span', { class: 'rating__bar', 'aria-hidden': 'true' }, h('i', { style: { '--v': `${pct}%` } })));
}

let dialogCount = 0;

/**
 * Dialogue modal natif (focus piégé, Échap pour fermer, utilisable au clavier).
 * @param {{title:string, body:Node, actions?:{label:string,value:any,variant?:string,autofocus?:boolean}[], wide?:boolean}} opts
 * @returns {Promise<any>} valeur de l'action choisie, ou null si fermé avec Échap
 */
export function showModal({ title, body, actions = [{ label: 'Fermer', value: true, autofocus: true }], wide = false }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const titleId = `dlg-title-${++dialogCount}`;
    const dlg = h('dialog', { class: `modal${wide ? ' modal--wide' : ''}`, 'aria-labelledby': titleId });
    dlg.append(
      h('h2', { id: titleId, class: 'modal__title', text: title }),
      h('div', { class: 'modal__body' }, body),
      h('div', { class: 'modal__actions' }, actions.map((a, i) => h('button', {
        type: 'button', class: `btn ${a.variant || ''}`, autofocus: a.autofocus, text: a.label, onClick: () => dlg.close(String(i)),
      }))),
    );
    dlg.addEventListener('close', () => {
      const i = dlg.returnValue;
      dlg.remove();
      if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
      resolve(i === '' ? null : actions[Number(i)].value);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Confirmation ; le bouton d'annulation a le focus par défaut (évite les erreurs au clavier). */
export async function confirmDialog({ title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false }) {
  const res = await showModal({
    title,
    body: h('p', { text: message }),
    actions: [
      { label: cancelLabel, value: false, variant: 'btn--ghost', autofocus: true },
      { label: confirmLabel, value: true, variant: danger ? 'btn--danger' : 'btn--primary' },
    ],
  });
  return res === true;
}

/** Notification annoncée par les lecteurs d'écran (région aria-live). */
export function toast(message, { error = false } = {}) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = h('div', { id: 'toast-container', role: 'status', 'aria-live': 'polite' });
    document.body.append(container);
  }
  
  const el = h('div', { class: `toast${error ? ' toast--error' : ''}`, text: message });
  container.append(el);
  
  // Force le reflow pour que l'animation CSS se déclenche
  el.getBoundingClientRect();
  el.classList.add('is-visible');
  
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 250); // Attend la fin de la transition CSS
  }, 5000);
}
