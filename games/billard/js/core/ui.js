// ui.js — interface HTML : joueurs, chrono, message d'état, jauge de puissance, pause, écran de fin (plateau des billes : canvas, game.js).
// Ne contient aucune logique de jeu : game.js l'appelle, et les boutons renvoient des callbacks.

export const BALL_COLORS = ['#ffffff', '#f5c400', '#1f4ed8', '#d62828', '#6a2c91', '#f77f00', '#1b7f3b', '#7b1e1e', '#161616'];
export const ballColor = n => BALL_COLORS[n <= 8 ? n : n - 8];
export const isStripe = n => n >= 9;

const $ = id => document.getElementById(id);

export function createUI({ onConfirm, onRestart, onPause, names = ['Joueur 1', 'Joueur 2'] }) {
  const status = $('status'), power = $('power'), fill = $('powerFill'), pct = $('powerPct');
  const confirmBtn = $('confirmBtn'), restartBtn = $('restartBtn');
  const timer = $('timer'), end = $('end'), pl = [$('p0'), $('p1')];

  let paused = false, state = 'aiming', kind = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
  let powerValue = 0, placementValid = true, cancelling = false, who = names[0], info = '', shown = -1, cpuMsg = '';

  const TEXT = {
    aiming: {
      mouse: 'vise avec la souris, clic maintenu + recul = puissance, relâche = tir',
      touch: 'glisse sur la table pour viser, tire avec la jauge à droite'
    },
    ballsMoving: { mouse: 'billes en mouvement', touch: 'billes en mouvement' },
    placingCueBall: {
      mouse: 'blanche en main : déplace-la, clique pour la placer',
      touch: 'blanche en main : glisse pour la placer, puis ✔ Placer'
    },
  };

  function refresh() {
    let t;
    const mine = state === 'aiming' || state === 'charging' || state === 'placingCueBall';
    if (paused) t = 'Pause : chrono arrêté, appuie sur Reprendre';
    else if (cpuMsg && mine) t = (info ? info + ' — ' : '') + cpuMsg;
    else if (state === 'charging') t = cancelling ? 'Relâche ici pour annuler le tir' : `${who} · Puissance ${Math.round(powerValue * 100)} % : relâche pour tirer`;
    else if (state === 'gameOver') t = 'Partie terminée';
    else {
      t = `${who} : ${TEXT[state][kind]}`;
      if (state === 'placingCueBall' && !placementValid) t = 'Position interdite (poche, bande ou autre bille)';
      if (info) t = info + ' — ' + t;
    }
    status.textContent = t;
    status.dataset.state = state === 'placingCueBall' && !placementValid ? 'invalid' : state;
    confirmBtn.hidden = state !== 'placingCueBall' || !!cpuMsg;
    confirmBtn.disabled = !placementValid;
    power.classList.toggle('off', (state !== 'aiming' && state !== 'charging') || !!cpuMsg);
    timer.classList.toggle('off', state === 'ballsMoving' || state === 'gameOver' || paused);
  }

  confirmBtn.addEventListener('click', () => onConfirm());
  restartBtn.addEventListener('click', () => onRestart());
  const pauseBtn = $('pauseBtn'), pauseOv = $('pauseOv');
  pauseBtn.addEventListener('click', () => onPause());
  $('resumeBtn').addEventListener('click', () => onPause());
  $('endRestart').addEventListener('click', () => onRestart());
  $('pauseNew').addEventListener('click', () => onRestart());

  refresh();
  return {
    setState(s) {
      state = s; if (s !== 'charging') cancelling = false;
      pauseBtn.disabled = s === 'gameOver';
      if (s === 'gameOver') { timer.textContent = '–'; shown = -1; }
      refresh();
    },
    setPaused(p, title) {
      paused = p; pauseOv.hidden = !p; $('pauseTitle').textContent = title || 'Pause';
      pauseBtn.setAttribute('aria-pressed', p); refresh();
    },
    setCpu(m) { if (m !== cpuMsg) { cpuMsg = m; refresh(); } },
    setKind(k) { if (k !== kind) { kind = k; refresh(); } },
    setPower(p) {
      powerValue = p;
      fill.style.clipPath = `inset(0 0 ${100 - p * 100}% 0)`; // la jauge se remplit de haut en bas
      pct.textContent = Math.round(p * 100) + ' %';
      if (state === 'charging') refresh();
    },
    setCancelling(c) { if (c !== cancelling) { cancelling = c; refresh(); } },
    setPlacementValid(v) { placementValid = v; refresh(); },
    setInfo(m) { info = m; refresh(); },
    setPlayers(cur, infos) {
      who = names[cur];
      pl.forEach((el, i) => {
        el.classList.toggle('on', i === cur);
        const s = el.lastElementChild, f = infos[i]; s.textContent = f.text;
        for (const n of f.balls) {
          const c = document.createElement('i'); c.textContent = n; c.style.setProperty('--c', ballColor(n));
          c.className = (isStripe(n) ? 'stripe ' : '') + (n === f.next ? 'next' : ''); s.appendChild(c);
        }
      });
      refresh();
    },
    setTime(t) {
      const s = Math.ceil(Math.max(0, t));
      if (s !== shown) { shown = s; timer.textContent = s; timer.classList.toggle('low', s <= 5); }
    },
    showEnd(title, reason) { $('endTitle').textContent = title; $('endReason').textContent = reason; end.hidden = false; },
    hideEnd() { end.hidden = true; },
  };
}
