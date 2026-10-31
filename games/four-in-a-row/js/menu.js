import { MODES, LEVELS } from './core/modes.js';
import * as S from './core/store.js';
import { scoreEl } from './core/ui.js';

const $ = id => document.getElementById(id), all = s => [...document.querySelectorAll(s)];
let pf = S.prefs(), opp = ['cpu', 'online'].includes(pf.opp) ? pf.opp : '2p', lv = LEVELS[pf.level] ? pf.level : 'medium', target = null;
const label = g => `${MODES[g.mode].label} · ${g.opp === 'cpu' ? 'contre l\'IA ' + LEVELS[g.level] : 'à deux sur cet écran'}`;
const live = () => { const g = S.loadGame(); return g && MODES[g.mode] && (!g.over || g.endOpen) ? g : null; };

function refresh() {
  pf = S.prefs(); const g = live();
  for (const b of all('#opp button')) b.setAttribute('aria-checked', String(b.dataset.opp === opp));
  for (const b of all('#lvl button')) b.setAttribute('aria-checked', String(b.dataset.lv === lv));
  $('lvl').hidden = opp !== 'cpu';
  for (const a of all('.mode')) a.classList.toggle('last', a.dataset.mode === pf.last);
  $('resume').hidden = !g; if (g) $('resume').textContent = '▶ Reprendre : ' + label(g);
}

// ---- Modales ----
let openEl = null, from = null;
function open(el) { from = document.activeElement; openEl = el; el.hidden = false; el.querySelector('input,button.btn,button')?.focus(); }
function close() { if (!openEl) return; openEl.hidden = true; openEl = null; from?.focus?.(); }
for (const o of [$('ovNames'), $('ovConf'), $('ovHist')]) o.addEventListener('click', e => { if (e.target === o) close(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && openEl !== $('netOv')) close(); });

for (const b of all('#opp button')) b.addEventListener('click', () => { opp = b.dataset.opp; S.setPrefs({ opp }); refresh(); });
for (const b of all('#lvl button')) b.addEventListener('click', () => { lv = b.dataset.lv; S.setPrefs({ level: lv }); refresh(); });
$('resume').addEventListener('click', () => { const g = live(); if (g) location.href = `game.html?mode=${g.mode}&opp=${g.opp}`; });

// ---- Lancement ----
function begin(id, names, uids) {
  S.setPrefs({ opp, level: lv, last: id });
  S.saveGame(S.fresh(MODES[id], opp, opp === 'cpu' ? lv : '', names, uids));
  location.href = `game.html?mode=${id}&opp=${opp}`;
}
function go() {
  const me = S.stats().me;
  if (opp === 'cpu') return begin(target, ['Toi', 'IA ' + LEVELS[lv]], [me, null]);
  close(); $('n1').value = S.myName(); $('n2').value = ''; $('nmErr').textContent = ''; open($('ovNames'));
}
function pick(id) {
  S.setPrefs({ last: id }); target = id;
  if (opp === 'online') return openNet(id);
  const g = S.loadGame();
  if (g && !g.over) { $('cfText').textContent = `${label(g)} est en cours. En lancer une autre abandonne cette grille, sans changer aucun score.`; open($('ovConf')); return; }
  go();
}
for (const a of all('.mode')) a.addEventListener('click', () => pick(a.dataset.mode));
$('cfGo').addEventListener('click', () => $('resume').click());
$('cfNew').addEventListener('click', go);
$('cfNo').addEventListener('click', close);
$('nmClose').addEventListener('click', close);
$('nmOk').addEventListener('click', () => {
  const a = $('n1').value.trim().replace(/\s+/g, ' '), b = $('n2').value.trim().replace(/\s+/g, ' ');
  if (!a || !b) return void ($('nmErr').textContent = 'Les deux noms sont obligatoires.');
  if (S.norm(a) === S.norm(b)) return void ($('nmErr').textContent = 'Les deux noms doivent être différents.');
  begin(target, [a, b], [S.stats().me, null]);
});
for (const i of ['n1', 'n2']) $(i).addEventListener('keydown', e => { if (e.key === 'Enter') $('nmOk').click(); });

// ---- En ligne : module chargé à la demande (Firebase jamais chargé hors de ce mode) ----
let netApi = null;
async function openNet(id) {
  open($('netOv'));
  if (!navigator.onLine) { $('netErr').textContent = 'Mode en ligne indisponible : hors ligne, le mode en ligne demande une connexion.'; return; }
  try { netApi ??= await import('./menu-net.js'); netApi.show(id); }
  catch (err) { $('netErr').textContent = 'Mode en ligne indisponible : ' + (err?.message || 'chargement impossible'); }
}
$('netClose').addEventListener('click', async () => { await netApi?.hide(); close(); });

// ---- Historique : un onglet par mode ----
let tab = MODES[pf.hist] ? pf.hist : 'four';
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const row = (title, sub, sc) => { const r = el('div', 'hrow'), t = el('span', 'ht', title); t.appendChild(el('small', '', sub)); r.append(t, sc); return r; };
function hist() {
  for (const b of all('#hiTabs button')) b.setAttribute('aria-checked', String(b.dataset.mode === tab));
  const M = MODES[tab], box = $('hiBody'); box.textContent = '';
  box.appendChild(el('h3', '', '🖥️ Contre l\'ordinateur'));
  const ai = S.stats().ai[M.id] || {};
  for (const k of Object.keys(LEVELS)) { const r = ai[k] || { w: 0, l: 0, d: 0 }; box.appendChild(row(LEVELS[k], `Toi · égalités : ${r.d}`, scoreEl(r.w, r.l))); }
  box.appendChild(el('h3', '', '👥 Contre un joueur'));
  const ps = S.pairList(M.id).filter(r => r.local.a + r.local.b + r.local.d + r.online.a + r.online.b + r.online.d);
  if (!ps.length) box.appendChild(el('p', 'empty', 'Aucune partie contre un joueur pour l\'instant.'));
  for (const r of ps) for (const [k, n] of [['local', '👥 Écran'], ['online', '🌐 En ligne']]) {
    const c = r[k]; if (c.a + c.b + c.d) box.appendChild(row(`${r.a.name} – ${r.b.name}`, `${n} · égalités : ${c.d}`, scoreEl(c.a, c.b)));
  }
}
for (const b of all('#hiTabs button')) b.addEventListener('click', () => { tab = b.dataset.mode; S.setPrefs({ hist: tab }); hist(); });
$('histBtn').addEventListener('click', () => { hist(); open($('ovHist')); });
$('hiClose').addEventListener('click', close);
refresh();
addEventListener('pageshow', refresh);
