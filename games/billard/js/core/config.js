// config.js — règles personnalisables (module pur) + préférences locales. Clé « billard » partagée avec save.js / menu.js :
// champs `rules` (options cochées), `opp` ('2p' | 'cpu'), `lastMode`, `games` ; on n'écrase jamais les autres champs.
export const KEY = 'billard';
const ALL = ['8ball', '9ball', '10ball'];
export const RULES = [
  {
    id: 'cueSide', modes: ALL, title: 'Blanche empochée : zone et sens imposés',
    desc: 'Après une blanche empochée, l\'adversaire la replace du côté de la poche (jusqu\'au 3e losange) et doit tirer vers l\'autre côté.'
  },
  {
    id: 'twoShots', modes: ALL, title: 'Deux coups après une faute',
    desc: 'Aucune bille touchée ou mauvaise première bille : l\'adversaire joue deux coups, sans blanche en main. Blanche empochée : blanche en main, un seul coup.'
  },
  {
    id: 'blackOpp', modes: ['8ball'], title: 'La noire à l\'opposé',
    desc: 'La 8 doit entrer dans la poche opposée à celle de la dernière bille du joueur, sinon défaite. (8-ball seulement)'
  },
];
export const isAvailable = (id, modeId) => !!RULES.find(r => r.id === id)?.modes.includes(modeId);
// Options effectives : booléens stricts ; une option indisponible dans le mode est forcée à false (modeId omis = aucun filtre).
export function normalize(raw, modeId) {
  const o = {};
  for (const r of RULES) o[r.id] = !!raw && raw[r.id] === true && (!modeId || r.modes.includes(modeId));
  return o;
}
export function readPrefs(st) {
  try { const d = JSON.parse(st.getItem(KEY)); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}
export function writePrefs(st, patch) {
  try { const d = readPrefs(st); Object.assign(d, patch); st.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; }
}
export const getRules = st => normalize(readPrefs(st).rules);
export const getOpp = st => { const o = readPrefs(st).opp; return o === 'cpu' || o === 'online' ? o : '2p'; };   // V7 : 'online' = salon à distance
