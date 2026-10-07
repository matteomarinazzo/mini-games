import { WORLDS, COUNT, worldOf } from './levels/manifest.js';
import { isDone, unlocked, getTries, worldDone } from './progress.js';

const $ = id => document.getElementById(id), box = $('levels');
const SOON = 'Coming soon';

// Prochain niveau à jouer = premier niveau débloqué et non réussi (sinon le dernier débloqué)
let next = 1;
for (let i = 1; i <= COUNT; i++) if (unlocked(i)) { next = i; if (!isDone(i)) break; }
$('playBtn').href = 'game.html?level=' + next;

// Monde affiché : ?world=N (1 = premier), sinon celui du prochain niveau
const asked = +new URLSearchParams(location.search).get('world');
let w = asked >= 1 && asked <= WORLDS.length ? asked - 1 : Math.max(0, worldOf(next));

function render() {
  const W = WORLDS[w];
  $('worldName').textContent = W.name;
  $('worlds').hidden = WORLDS.length < 2;
  $('prevWorld').disabled = w === 0;
  $('nextWorld').disabled = w === WORLDS.length - 1;

  const note = $('worldNote');
  note.hidden = false;
  if (!W.released) note.textContent = SOON;
  else if (w > 0 && !worldDone(w - 1)) note.textContent = 'Termine tous les niveaux du ' + WORLDS[w - 1].name + ' pour débloquer celui-ci.';
  else note.hidden = true;

  box.replaceChildren();
  for (let i = W.first; i <= W.last; i++) {
    const ok = unlocked(i), a = document.createElement(ok ? 'a' : 'span'), t = getTries(i), num = i - W.first + 1;
    a.className = 'lv' + (ok ? '' : ' locked') + (isDone(i) ? ' done' : '');
    a.textContent = isDone(i) ? '✓ ' + num : ok ? num + (t ? ' (' + t + ' é)' : '') : '🔒' + (t ? ' (' + t + ' é)' : '');
    if (ok) a.href = 'game.html?level=' + i;
    box.append(a);
  }
  if (WORLDS.length > 1) history.replaceState(null, '', '?world=' + (w + 1));
}
const go = d => { const v = w + d; if (v >= 0 && v < WORLDS.length) { w = v; render(); } };
$('prevWorld').onclick = () => go(-1);
$('nextWorld').onclick = () => go(1);
addEventListener('keydown', e => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); });
render();

// Rotation forcée en paysage : dimensions exactes en pixels
(() => {
  const mq = matchMedia('(orientation: portrait) and (pointer: coarse) and (hover: none)');
  const root = document.documentElement;
  function fit() {
    const vv = window.visualViewport;
    const w = Math.round(vv ? vv.width : innerWidth);
    const h = Math.round(vv ? vv.height : innerHeight);
    root.style.setProperty('--rw', w + 'px');  // largeur réelle
    root.style.setProperty('--rh', h + 'px');  // hauteur réelle
    root.classList.toggle('force-land', mq.matches);
  }
  fit();
  addEventListener('resize', fit);
  addEventListener('orientationchange', fit);
  window.visualViewport?.addEventListener('resize', fit);
  mq.addEventListener?.('change', fit);
})();