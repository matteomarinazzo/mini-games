// input.js — commandes souris, stylet et tactile via Pointer Events (un seul jeu d'événements : pas de double déclenchement
// souris/tactile). Ce module ne connaît ni la physique ni le DOM de l'interface : il traduit les gestes en intentions
// envoyées au gestionnaire `h` fourni par game.js.
//
//  Souris / stylet : survol = visée ; clic maintenu + recul vers la bille = puissance ; relâchement = tir.
//  Tactile        : glisser sur la table = visée ; jauge latérale (glisser vers le bas) = puissance ; relâchement = tir ;
//                   relâcher loin de la jauge = annulation.
//  Placement      : souris = survol + clic ; tactile = glisser + bouton « ✔ Placer ».

const PULL_MAX = 220;           // recul (unités de table) correspondant à 100 % de puissance à la souris
const AIM_DEADZONE = 8;         // sous cette distance à la blanche, l'angle est instable : on garde le précédent
const GAUGE_CANCEL_DIST = 90;   // pixels : relâcher aussi loin (horizontalement) de la jauge annule le tir
const clamp01 = v => Math.min(1, Math.max(0, v));

// ---- Rotation CSS forcée (classe force-land, voir game.html / ROTATION.md) : SEUL ENDROIT où les coordonnées sont converties. ----
// Page tournée de 90° : clientX/clientY restent dans le repère non tourné de l'écran. Repère logique = repère de la page tournée :
//   x = clientY, y = rw − clientX   (rw = valeur de --rw posée par le script de game.html ; sinon visualViewport/innerWidth).
// Hors force-land (PC, vrai paysage) : identité.
const root = document.documentElement;
const isRotated = () => root.classList.contains('force-land');
const realWidth = () => parseFloat(root.style.getPropertyValue('--rw')) || window.visualViewport?.width || window.innerWidth;
export function toView(clientX, clientY) {
  return isRotated() ? { x: clientY, y: realWidth() - clientX } : { x: clientX, y: clientY };
}
// getBoundingClientRect() d'un élément de la page tournée est dans le repère réel : on le ramène dans le repère logique.
export function viewRect(el) {
  const r = el.getBoundingClientRect();
  if (!isRotated()) return r;
  const rw = realWidth();
  return { left: r.top, top: rw - r.right, right: r.bottom, bottom: rw - r.left, width: r.height, height: r.width };
}

export function createInput({ canvas, gauge, toTable, h }) {
  const ac = new AbortController();
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal: ac.signal });
  const tt = (clientX, clientY) => { const v = toView(clientX, clientY); return toTable(v.x, v.y); };   // client → logique → table

  let canvasId = null;   // pointeur actif sur la table (un seul à la fois)
  let mode = null;       // 'mouse-charge' | 'touch-aim' | 'place' | 'ignore'
  let down = null, aim0 = 0;   // point d'appui et angle verrouillé pendant la charge à la souris
  let gaugeId = null;    // pointeur actif sur la jauge

  // back = true (tactile) : le doigt se place DERRIÈRE la blanche (côté queue) et le tir part du doigt vers la blanche (direction inversée).
  // Souris / stylet : back = false, on vise vers le pointeur (inchangé).
  function aimAt(clientX, clientY, back = false) {
    const p = tt(clientX, clientY), c = h.cue();
    const dx = back ? c.x - p.x : p.x - c.x, dy = back ? c.y - p.y : p.y - c.y;
    if (Math.hypot(dx, dy) >= AIM_DEADZONE) h.setAim(Math.atan2(dy, dx));
  }
  const place = e => { const p = tt(e.clientX, e.clientY); h.movePlacement(p.x, p.y); };

  function reset() {
    if (h.state() === 'charging') h.cancelCharge();
    canvasId = gaugeId = mode = down = null;
  }

  // ---- Table ----
  on(canvas, 'pointerdown', e => {
    e.preventDefault();
    h.pointerKind(e.pointerType === 'touch' ? 'touch' : 'mouse');
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (canvasId !== null) return;                  // second doigt ignoré
    const fine = e.pointerType !== 'touch', st = h.state();
    const start = m => { canvasId = e.pointerId; mode = m; try { canvas.setPointerCapture(e.pointerId); } catch { } };

    if (st === 'placingCueBall') { start('place'); place(e); }
    else if (st === 'aiming') {
      if (fine) {
        aimAt(e.clientX, e.clientY);
        down = tt(e.clientX, e.clientY); aim0 = h.aim();
        start('mouse-charge'); h.beginCharge('mouse');
      } else { start('touch-aim'); aimAt(e.clientX, e.clientY, true); }
    } else if (st === 'charging' && h.chargeSource() === 'gauge' && !fine) {
      start('touch-aim'); aimAt(e.clientX, e.clientY, true); // une main règle la visée pendant que l'autre tient la jauge
    }
  });

  on(canvas, 'pointermove', e => {
    const fine = e.pointerType !== 'touch';
    if (e.pointerId === canvasId) {
      if (mode === 'mouse-charge') {
        if (e.buttons & 2) { cancelCharge(); return; }  // clic droit pendant la charge = annulation
        const p = tt(e.clientX, e.clientY);
        // Recul = déplacement du pointeur dans le sens opposé à la visée (vers la bille), mesuré en unités de table
        const pull = -((p.x - down.x) * Math.cos(aim0) + (p.y - down.y) * Math.sin(aim0));
        h.setPower(clamp01(pull / PULL_MAX));
      } else if (mode === 'touch-aim') aimAt(e.clientX, e.clientY, true);
      else if (mode === 'place') place(e);
    } else if (canvasId === null && fine) {          // survol souris / stylet
      h.pointerKind('mouse');
      if (h.state() === 'aiming') aimAt(e.clientX, e.clientY);
      else if (h.state() === 'placingCueBall') place(e);
    }
  });

  function cancelCharge() { h.cancelCharge(); mode = 'ignore'; }  // le pointeur reste suivi jusqu'à son relâchement

  function release(e, cancelled) {
    if (e.pointerId !== canvasId) return;            // aussi vrai pour lostpointercapture après un pointerup déjà traité
    const m = mode, fine = e.pointerType !== 'touch';
    canvasId = mode = down = null;                   // libéré AVANT toute action : un même relâchement ne peut agir qu'une fois
    if (cancelled) { if (m === 'mouse-charge') h.cancelCharge(); return; }
    if (m === 'mouse-charge') h.fire();
    else if (m === 'place' && fine) h.confirmPlacement();
  }
  on(canvas, 'pointerup', e => release(e, false));
  on(canvas, 'pointercancel', e => release(e, true));
  on(canvas, 'lostpointercapture', e => release(e, true));

  // ---- Jauge de puissance ----
  // Jauge : rectangle et pointeur en repère logique (la jauge reste verticale à l'écran logique : haut = 0 %, bas = 100 %).
  const gaugePower = e => { const r = viewRect(gauge), v = toView(e.clientX, e.clientY); return clamp01((v.y - r.top) / r.height); };
  const gaugeOutside = e => {
    const r = viewRect(gauge), v = toView(e.clientX, e.clientY);
    return v.x < r.left - GAUGE_CANCEL_DIST || v.x > r.right + GAUGE_CANCEL_DIST;
  };

  on(gauge, 'pointerdown', e => {
    e.preventDefault();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gaugeId !== null || h.state() !== 'aiming') return;
    gaugeId = e.pointerId;
    try { gauge.setPointerCapture(e.pointerId); } catch { }
    h.pointerKind(e.pointerType === 'touch' ? 'touch' : 'mouse');
    h.beginCharge('gauge');
    h.setPower(gaugePower(e));
  });
  on(gauge, 'pointermove', e => {
    if (e.pointerId !== gaugeId) return;
    h.setPower(gaugePower(e));
    h.setCancelling(gaugeOutside(e));
  });
  function gaugeEnd(e, cancelled) {
    if (e.pointerId !== gaugeId) return;
    gaugeId = null;
    h.setCancelling(false);
    if (cancelled || gaugeOutside(e)) h.cancelCharge(); else h.fire();
  }
  on(gauge, 'pointerup', e => gaugeEnd(e, false));
  on(gauge, 'pointercancel', e => gaugeEnd(e, true));
  on(gauge, 'lostpointercapture', e => gaugeEnd(e, true));

  // ---- Interruptions : l'état des contrôles revient proprement à la normale ----
  on(window, 'blur', reset);
  on(window, 'orientationchange', reset);
  on(document, 'visibilitychange', () => { if (document.hidden) reset(); });
  on(window, 'keydown', e => { if (e.key === 'Escape') reset(); });

  return { reset, destroy: () => ac.abort() };
}