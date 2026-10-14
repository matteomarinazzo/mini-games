// menu-net.js — parcours « en ligne » du menu : créer / rejoindre un salon, salle d'attente, lancement. Chargé à la demande par menu.js.
import { MODES } from './core/modes.js';
import { RULES, isAvailable, normalize, getRules, readPrefs, writePrefs } from './core/config.js';

const $ = id => document.getElementById(id);
const st = (() => { try { return window.localStorage; } catch { return null; } })();
const SAVED = 'billard_room', HB_MS = 10000, STALE_MS = 25000;
let net = null, mode = '8ball', lobby = null;       // lobby = { code, uid, host, room, unsub, timers[] }
const seen = {};                                    // uid → { v, at } : « hors ligne » si le battement n'a pas changé depuis STALE_MS (horloge locale, insensible au décalage)

const say = (m, ok) => { const e = $('netErr'); e.textContent = m || ''; e.dataset.ok = ok ? '1' : ''; };
const busy = b => { for (const id of ['netCreate', 'netJoin', 'netResume']) $(id).disabled = b; };
const saved = () => { try { return st?.getItem(SAVED) || ''; } catch { return ''; } };
const remember = c => { try { st?.setItem(SAVED, c); } catch { } };
const forget = () => { try { st?.removeItem(SAVED); } catch { } };
const safeMode = m => (Object.hasOwn(MODES, m) ? m : '8ball');
// Afficher le nom mg_player_name et utiliser celui là sauf si le joueur le change
const nameVal = () => {
  const v = $('netName').value.trim();
  if (v) {
    if (st) writePrefs(st, { name: v });
    return v;
  }
  const mgName = localStorage.getItem('mg_player_name');
  if (mgName) {
    if (st) writePrefs(st, { name: mgName });

    return mgName;
  }
  console.log('Nom du joueur non trouvé dans localStorage', mgName);
  return '';
};

$('netName').value = nameVal();
const view = lob => { $('netStep1').hidden = lob; $('netStep2').hidden = !lob; $('netTitle').textContent = lob ? 'Salon en ligne' : 'Jouer en ligne'; };
function summary(m, opts) {
  const l = RULES.filter(r => opts?.[r.id] && isAvailable(r.id, m)).map(r => r.title);
  return `${MODES[safeMode(m)].label} · ${l.length ? 'règles : ' + l.join(' ; ') : 'règles standard (aucune option cochée)'}`;
}

export function show(id) {
  mode = safeMode(id); view(false); say('');
  $('netName').value = (st && readPrefs(st).name) || ''; $('netCode').value = '';
  $('netModeInfo').textContent = 'Si tu crées le salon : ' + summary(mode, normalize(getRules(st), mode)) + '. Une partie rejointe reprend le mode et les règles de l\'hôte.';
  const sv = saved(); $('netResume').hidden = !sv; if (sv) $('netResume').textContent = 'Reprendre le salon ' + sv;
}
export const active = () => !!lobby;
export async function hide() { await leave(); }

async function create() {
  say('Création du salon…', true); busy(true);
  try {
    net ??= await import('./core/online.js');
    localStorage.setItem('mg_player_name', nameVal());
    const { code, uid } = await net.createLobby(mode, normalize(getRules(st), mode), nameVal());
    remember(code); openLobby(code, uid, true); say('');
  } catch (e) { say(e.message); } finally { busy(false); }
}
async function join(code) {
  say('Connexion au salon…', true); busy(true);
  try {
    net ??= await import('./core/online.js');
    localStorage.setItem('mg_player_name', nameVal());
    const r = await net.joinLobby(code, nameVal());
    remember(r.code);
    if (r.room.state !== 'waiting') { location.href = `game.html?mode=${safeMode(r.room.config?.mode)}&room=${r.code}`; return; }   // partie lancée : retour direct
    openLobby(r.code, r.uid, r.room.leaderId === r.uid); say('');
  } catch (e) { if (e.gone) forget(); say(e.message); $('netResume').hidden = !saved(); } finally { busy(false); }
}
$('netCreate').addEventListener('click', create);
$('netJoin').addEventListener('click', () => join($('netCode').value));
$('netCode').addEventListener('keydown', e => { if (e.key === 'Enter') join($('netCode').value); });
$('netResume').addEventListener('click', () => join(saved()));
$('netLeave').addEventListener('click', async () => { await leave(); view(false); show(mode); });
$('netCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(lobby.code); say('Code copié.', true); } catch { say('Copie impossible : recopie le code à la main.'); }
});
$('netStart').addEventListener('click', async () => {
  const room = lobby?.room, guest = room && Object.keys(room.players || {}).find(i => i !== room.leaderId);
  if (!guest) return;
  $('netStart').disabled = true;
  try { await net.startRoom(lobby.code, lobby.uid, guest); } catch (e) { say('Lancement impossible : ' + (e.code || e.message)); draw(); }   // la redirection vient de l'écoute du salon
});

function openLobby(code, uid, host) {
  stopLobby();
  const l = lobby = { code, uid, host, room: null, unsub: null, timers: [] };
  view(true); $('netCodeShown').textContent = code;
  l.unsub = net.watch('rooms/' + net.idOf(code), onRoom);
  l.timers.push(setInterval(() => net.beat(code, uid), HB_MS), setInterval(() => lobby === l && l.room && draw(), 3000));
  net.beat(code, uid);
}
function stopLobby() { if (!lobby) return; try { lobby.unsub?.(); } catch { } lobby.timers.forEach(clearInterval); lobby = null; }
async function leave() {
  const l = lobby; if (!l) return;
  stopLobby(); forget();
  try { await net.leaveLobby(l.code, l.uid, l.host); } catch { }
}
function closed(msg) { stopLobby(); forget(); view(false); show(mode); say(msg); }

function onRoom(room) {
  if (!lobby) return;
  if (!room) return closed('Le salon a été fermé par l\'hôte.');
  const ps = room.players || {}, now = performance.now();
  if (!ps[lobby.uid]) return closed('Tu ne fais plus partie de ce salon.');
  if (room.state === 'playing') { const c = lobby.code; stopLobby(); location.href = `game.html?mode=${safeMode(room.config?.mode)}&room=${c}`; return; }
  lobby.room = room; lobby.host = room.leaderId === lobby.uid;
  for (const [id, p] of Object.entries(ps)) if (!seen[id] || seen[id].v !== p.lastSeen) seen[id] = { v: p.lastSeen, at: now };
  draw();
}
function draw() {
  const room = lobby.room, ps = room.players || {}, now = performance.now();
  const ids = Object.keys(ps).sort((a, b) => (b === room.leaderId) - (a === room.leaderId)).slice(0, 2), box = $('netPlayers');
  box.textContent = '';
  for (const id of ids) {
    const off = now - (seen[id]?.at ?? now) > STALE_MS, c = document.createElement('div'), n = document.createElement('span'), t = document.createElement('em');
    c.className = 'chip' + (off ? ' off' : ''); n.textContent = String(ps[id].name ?? 'Joueur').slice(0, 15);
    t.textContent = [id === room.leaderId ? 'hôte' : 'invité', id === lobby.uid ? 'toi' : '', off ? 'déconnecté ?' : ''].filter(Boolean).join(' · ');
    c.append(n, t); box.appendChild(c);
  }
  if (ids.length < 2) { const c = document.createElement('div'); c.className = 'chip empty'; c.textContent = 'En attente du 2e joueur…'; box.appendChild(c); }
  const guest = ids.find(i => i !== room.leaderId), ok = !!guest && now - seen[guest].at < STALE_MS;
  $('netRules').textContent = summary(room.config?.mode, normalize(room.config?.opts, safeMode(room.config?.mode)));
  $('netStart').hidden = !lobby.host; $('netStart').disabled = !ok;
  $('netWait').textContent = lobby.host ? (ok ? 'Les deux joueurs sont là : lance la partie.' : 'Partage le code ci-dessus et attends le deuxième joueur.') : 'Connecté. En attente du lancement par l\'hôte…';
}
