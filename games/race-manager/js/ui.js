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

/** Rond de la couleur d'une écurie (le nom de l'écurie sert d'infobulle et de texte alternatif). */
export function teamDot(team) {
  return h('span', {
    class: 'dot',
    style: { '--c': team?.color || '#cccccc' },
    title: team?.name,
    role: 'img',
    'aria-label': team?.name ? `Écurie ${team.name}` : null,
  });
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

/** Affichage des modals de cycle annuel (Fin et Début de saison). */

export function checkAndShowSeasonModals(save) {
  if (!save?.pendingModals) return;

  // 1. Modale de Fin de saison (31 décembre)
  if (save.pendingModals.seasonEnd) {
    const data = save.pendingModals.seasonEnd;
    showSeasonEndModal(data);
    delete save.pendingModals.seasonEnd;
    return;
  }

  // 2. Modale de Début de saison (1er janvier)
  if (save.pendingModals.seasonStart) {
    const data = save.pendingModals.seasonStart;
    showSeasonStartModal(data);
    delete save.pendingModals.seasonStart;
    return;
  }
}

function showSeasonEndModal(data) {
  const existing = document.getElementById('season-end-modal');
  if (existing) existing.remove();

  const regHtml = (data.regulations?.logs || []).map((l) => {
    const badge = l.diff > 0 ? `<span style="color:#22c55e">+${l.diff}</span>` : `<span style="color:#ef4444">${l.diff}</span>`;
    return `<li style="font-size:0.9em;margin-bottom:4px;"><strong>${l.teamName}</strong> (${l.dept}) : ${l.before} → ${l.after} (${badge})</li>`;
  }).join('');

  const modalHtml = `
    <div id="season-end-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;">
      <div style="background:#18181b;color:#f4f4f5;border-radius:12px;max-width:540px;width:100%;max-height:85vh;overflow-y:auto;padding:24px;border:1px solid #27272a;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <h2 style="font-size:1.4rem;font-weight:bold;margin-bottom:12px;color:#fbbf24;">🏆 Bilan de la Saison ${data.season}</h2>
        
        <div style="background:#27272a;padding:12px;border-radius:8px;margin-bottom:16px;">
          <p style="margin:0 0 6px 0;"><strong>Classement constructeurs :</strong> ${data.teamPosition}e avec <strong>${data.teamPoints} pts</strong></p>
          <p style="margin:0 0 6px 0;"><strong>Attentes de la direction :</strong> Objectif ${data.expectedPosition}e place (${data.perfVerdict})</p>
          <p style="margin:0;color:#22c55e;"><strong>Prime de résultat :</strong> +${data.bonusAmount.toFixed(2)} M€</p>
        </div>

        <h3 style="font-size:1.1rem;font-weight:bold;margin-bottom:8px;color:#60a5fa;">📐 Nouvelle Réglementation Technique</h3>
        <p style="font-size:0.85rem;color:#a1a1aa;margin-bottom:8px;">Départements impactés : ${data.regulations?.affectedDepts?.join(', ') || 'aucun'}.</p>
        <ul style="list-style:none;padding:0;max-height:160px;overflow-y:auto;background:#27272a;padding:10px;border-radius:8px;margin-bottom:20px;">
          ${regHtml || '<li style="font-size:0.9em;color:#a1a1aa;">Aucun changement majeur.</li>'}
        </ul>

        <button id="close-season-end-btn" style="width:100%;background:#e11d48;color:white;font-weight:bold;padding:12px;border:none;border-radius:8px;cursor:pointer;">
          Passer à la nouvelle saison
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  document.getElementById('close-season-end-btn').addEventListener('click', () => {
    document.getElementById('season-end-modal').remove();
  });
}

function showSeasonStartModal(data) {
  const existing = document.getElementById('season-start-modal');
  if (existing) existing.remove();

  const myDriversHtml = (data.myDrivers || []).map((d) =>
    `<li style="margin-bottom:4px;">Pilote n°${d.slot} : <strong>${d.name}</strong> (Salaire annuel : ${d.salary} M€)</li>`
  ).join('');

  const rivalHtml = (data.rivalChanges || []).length > 0
    ? data.rivalChanges.map((r) => `<li style="font-size:0.85em;margin-bottom:4px;"><strong>${r.driverName}</strong> a rejoint <strong>${r.toTeamName}</strong></li>`).join('')
    : '<li style="font-size:0.85em;color:#a1a1aa;">Aucun transfert majeur sur la grille adverse.</li>';

  const modalHtml = `
    <div id="season-start-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;">
      <div style="background:#18181b;color:#f4f4f5;border-radius:12px;max-width:540px;width:100%;max-height:85vh;overflow-y:auto;padding:24px;border:1px solid #27272a;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <h2 style="font-size:1.4rem;font-weight:bold;margin-bottom:12px;color:#34d399;">🟢 Coup d'envoi Saison ${data.season}</h2>
        
        <h3 style="font-size:1rem;font-weight:bold;margin-bottom:6px;color:#e4e4e7;">Vos Pilotes Engagés :</h3>
        <ul style="list-style:none;padding:10px;background:#27272a;border-radius:8px;margin-bottom:16px;">
          ${myDriversHtml}
        </ul>

        <h3 style="font-size:1rem;font-weight:bold;margin-bottom:6px;color:#e4e4e7;">Mouvements chez les rivaux :</h3>
        <ul style="list-style:none;padding:10px;background:#27272a;border-radius:8px;max-height:140px;overflow-y:auto;margin-bottom:20px;">
          ${rivalHtml}
        </ul>

        <button id="close-season-start-btn" style="width:100%;background:#10b981;color:white;font-weight:bold;padding:12px;border:none;border-radius:8px;cursor:pointer;">
          C'est parti pour ${data.season} !
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  document.getElementById('close-season-start-btn').addEventListener('click', () => {
    document.getElementById('season-start-modal').remove();
  });
}
