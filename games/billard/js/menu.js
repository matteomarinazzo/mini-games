// Menu : adversaire (2 joueurs / ordinateur / en ligne), règles personnalisables, dernier mode, reprise de partie. Préférences dans la clé « billard »
// (champs opp / rules / lastMode, voir config.js). Les liens fonctionnent même sans ce script (2 joueurs, règles de base).
import { MODES } from './core/modes.js';
import { RULES, normalize, readPrefs, writePrefs, getRules, getOpp } from './core/config.js';
import * as shop from './core/shop.js';

const st = (() => { try { return window.localStorage; } catch { return null; } })();
const $ = id => document.getElementById(id);
const read = () => (st ? readPrefs(st) : {});
const write = d => { if (st) writePrefs(st, d); };
let opp = st ? getOpp(st) : '2p', rules = st ? getRules(st) : normalize(null);
const slot = id => id + (opp === 'cpu' ? ':cpu' : '');
const href = (id, extra = '') => `game.html?mode=${id}${opp === 'cpu' ? '&opp=cpu' : ''}${extra}`;
// V9 : carambole + boutique de queues, injectées ici (index.html inchangé)
if (!document.querySelector('.mode[data-mode="carom"]')) $('modes').insertAdjacentHTML('beforeend', '<a class="mode" data-mode="carom" href="game.html?mode=carom"><b>Carambole</b><span>Touche les deux autres billes, premier à 10 points.</span></a>');
$('cfgBtn').insertAdjacentHTML('afterend', '<button class="cfg" id="shopBtn" type="button">🏪 Boutique de queues <small id="shopCoins"></small></button>');
document.body.insertAdjacentHTML('beforeend', '<div class="ov" id="shopOv" hidden><div class="modal" role="dialog" aria-labelledby="shopTitle"><button class="x" id="shopClose" type="button" aria-label="Fermer">✕</button><h2 id="shopTitle">Boutique de queues</h2><p id="shopInfo"></p><div id="shopList"></div></div></div>');
const modes = [...document.querySelectorAll('.mode')];
for (const a of modes) if (!Object.hasOwn(MODES, a.dataset.mode)) a.remove();

function refresh() {
  if (st) $('shopCoins').textContent = '· ' + shop.getShop(st).coins + ' 🪙';
  const d = read();
  for (const a of modes) {
    if (!a.isConnected) continue;
    a.href = href(a.dataset.mode);
    a.classList.toggle('last', a.dataset.mode === d.lastMode);
    const sv = opp === 'online' ? null : d.games?.[slot(a.dataset.mode)];      // en ligne : pas de sauvegarde locale
    a.classList.toggle('saved', !!(sv && sv.g && !sv.g.over));    // partie en cours
  }
  for (const b of document.querySelectorAll('#opp button')) b.setAttribute('aria-checked', String(b.dataset.opp === opp));
  const n = Object.values(rules).filter(Boolean).length;
  $('cfgCount').textContent = n ? `· ${n} active${n > 1 ? 's' : ''}` : '· aucune';
}

// ---- Adversaire ----
for (const b of document.querySelectorAll('#opp button')) b.addEventListener('click', () => { opp = b.dataset.opp; write({ opp }); refresh(); });

// ---- Fenêtres modales (focus rendu à l'élément d'origine, Échap / clic hors fenêtre = fermer) ----
let openEl = null, from = null;
function open(el) { from = document.activeElement; openEl = el; el.hidden = false; el.querySelector('button.btn, button')?.focus(); }
function close() { if (!openEl) return; openEl.hidden = true; openEl = null; from?.focus?.(); }
for (const o of [$('cfgOv'), $('resOv'), $('shopOv')]) o.addEventListener('click', e => { if (e.target === o) close(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && openEl !== $('netOv')) close(); });   // salon en ligne : fermeture volontaire seulement (✕ / Quitter)

// ---- En ligne (V7) : module chargé à la demande, Firebase n'est jamais chargé hors de ce mode ----
let netApi = null;
async function openNet(id) {
  open($('netOv'));
  try { netApi ??= await import('./menu-net.js'); netApi.show(id); }
  catch (err) { $('netErr').textContent = 'Mode en ligne indisponible : ' + (err?.message || 'chargement impossible'); }
}
$('netClose').addEventListener('click', async () => { await netApi?.hide(); close(); });

// ---- Personnaliser les règles ----
const list = $('cfgList');
for (const r of RULES) {
  const row = document.createElement('label'), box = document.createElement('input'), tx = document.createElement('span');
  const t = document.createElement('b'), d = document.createElement('small');
  row.className = 'sw'; box.type = 'checkbox'; box.checked = !!rules[r.id]; box.dataset.id = r.id;
  t.textContent = r.title; d.textContent = r.desc; tx.append(t, d); row.append(box, tx); list.appendChild(row);
  box.addEventListener('change', () => { rules = { ...rules, [r.id]: box.checked }; write({ rules }); refresh(); });
}
$('cfgBtn').addEventListener('click', () => open($('cfgOv')));
$('cfgClose').addEventListener('click', close);
$('cfgOk').addEventListener('click', close);
$('cfgReset').addEventListener('click', () => {
  rules = normalize(null); write({ rules }); for (const b of list.querySelectorAll('input')) b.checked = false; refresh();
});

// ---- V9 : boutique de queues (pièces gagnées en fin de partie ; voir core/shop.js) ----
const swatch = c => `linear-gradient(90deg, ${c.stops.map(([p, k]) => `${k} ${p * 100}%`).join(',')})`;
function renderShop(msg = '') {
  if (!st) return;
  const s = shop.getShop(st), list = $('shopList'), R = shop.REWARD;
  $('shopInfo').textContent = msg || `${s.coins} 🪙 · victoire +${R.win}, partie à deux sur le même écran +${R.draw}, défaite +${R.lose}. La puissance s'applique contre l'ordinateur et à deux sur le même écran ; en ligne, les queues sont décoratives.`;
  list.textContent = '';
  for (const c of shop.CUES) {
    const own = s.owned.includes(c.id), eq = s.cue === c.id;
    const row = document.createElement('div'), sw = document.createElement('i'), tx = document.createElement('span'), nm = document.createElement('b'), d = document.createElement('small'), btn = document.createElement('button');
    row.className = 'cue' + (eq ? ' eq' : ''); sw.style.background = swatch(c);
    nm.textContent = c.name; d.textContent = c.pow > 1 ? `+${Math.round((c.pow - 1) * 100)} % de puissance` : 'Puissance standard';
    btn.type = 'button'; btn.className = 'btn' + (own ? ' sec' : ''); btn.textContent = eq ? 'Équipée' : own ? 'Équiper' : `${c.price} 🪙`;
    btn.disabled = eq || (!own && s.coins < c.price);
    btn.addEventListener('click', () => { const r = own ? shop.equip(st, c.id) : shop.buy(st, c.id); refresh(); renderShop(r.msg); });
    tx.append(nm, d); row.append(tx, btn, sw); list.appendChild(row);
  }
}
$('shopBtn').addEventListener('click', () => { renderShop(); open($('shopOv')); });
$('shopClose').addEventListener('click', close);

// ---- Choix du mode : reprise ou nouvelle partie (confirmation si une sauvegarde serait remplacée) ----
let target = null;
for (const a of modes) a.addEventListener('click', e => {
  const id = a.dataset.mode, sv = read().games?.[slot(id)];
  write({ lastMode: id });
  if (opp === 'online') { e.preventDefault(); openNet(id); return; }
  if (sv && sv.g && !sv.g.over) {
    e.preventDefault(); target = id;
    $('resText').textContent = `Une partie ${MODES[id].label}${opp === 'cpu' ? ' contre l\'ordinateur' : ''} est en cours. Reprends-la, ou démarre une nouvelle partie : la sauvegarde sera remplacée.`;
    open($('resOv'));
  }
});
$('resGo').addEventListener('click', () => { location.href = href(target); });
$('resNew').addEventListener('click', () => { location.href = href(target, '&new=1'); });
$('resNo').addEventListener('click', close);
refresh();
addEventListener('pageshow', refresh);        // retour depuis le jeu (cache arrière/avant) : badges à jour
