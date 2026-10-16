// shop.js — boutique de queues (V9). Module pur : le stockage est injecté. Champs ajoutés à la clé « billard » : coins, owned, cue, lastRw.
import { readPrefs, writePrefs } from './config.js';
const mk = (id, name, price, pow, s, b, t, a) => ({
  id, name, price, pow, s, b, t, a,
  stops: [[0, t], [.014, t], [.014, '#e8d9b0'], [.028, '#e8d9b0'], [.028, s], [.6, s], [.6, a], [.65, a], [.65, b], [1, b]]
});   // pointe, virole, fût, anneau, talon
export const CUES = [
  mk('std', 'Classique', 0, 1, '#e2b574', '#3a2410', '#6aa8ff', '#3a2410'),
  mk('erable', 'Érable', 250, 1.03, '#f0d9a8', '#7a3b12', '#6aa8ff', '#c0392b'),
  mk('ebene', 'Ébène', 500, 1.05, '#c9a26a', '#1a1a1a', '#8fd0ff', '#d4af37'),
  mk('rubis', 'Rubis', 800, 1.09, '#e8c9a0', '#8e1b2b', '#ff9a9a', '#ffd1d1'),
  mk('carbone', 'Carbone', 1200, 1.1, '#4a4f57', '#111111', '#00e5ff', '#00e5ff'),
  mk('grenat', 'Grenat', 1500, 1.3, '#c0330e', '#6b0019', '#ff4d4d', '#ffd6d6'),
  mk('or', 'Or royal', 2000, 1.5, '#f1d27a', '#8a6a14', '#fff3b0', '#fff3b0'),
];
export const REWARD = { win: 100, draw: 40, lose: 20 };   // victoire beaucoup, égalité (partie à deux sur le même écran) moyen, défaite peu
const find = id => CUES.find(c => c.id === id);
export function getShop(st) {
  const d = readPrefs(st), coins = Number.isSafeInteger(d.coins) && d.coins > 0 ? d.coins : 0;
  const owned = ['std', ...new Set((Array.isArray(d.owned) ? d.owned : []).filter(i => i !== 'std' && find(i)))];
  return { coins, owned, cue: owned.includes(d.cue) ? d.cue : 'std' };
}
export const cueOf = st => find(getShop(st).cue);
export function buy(st, id) {
  const c = find(id), s = getShop(st);
  if (!c) return { ok: false, msg: 'Queue inconnue.' };
  if (s.owned.includes(id)) return { ok: false, msg: 'Déjà achetée.' };
  if (s.coins < c.price) return { ok: false, msg: 'Pas assez de pièces.' };
  const ok = writePrefs(st, { coins: s.coins - c.price, owned: s.owned.filter(i => i !== 'std').concat(id), cue: id });
  return { ok, msg: ok ? `${c.name} achetée et équipée.` : 'Sauvegarde impossible.' };
}
export function equip(st, id) {
  const s = getShop(st);
  if (!find(id) || !s.owned.includes(id)) return { ok: false, msg: 'Queue non possédée.' };
  return { ok: writePrefs(st, { cue: id }), msg: `${find(id).name} équipée.` };
}
// outcome : 'win' | 'draw' | 'lose'. key (en ligne : salon + manche) : une même partie n'est jamais récompensée deux fois. Renvoie les pièces gagnées.
export function award(st, outcome, key = '') {
  const d = readPrefs(st);
  if (key && d.lastRw === key) return 0;
  const n = REWARD[outcome] ?? 0;
  writePrefs(st, { coins: getShop(st).coins + n, ...(key ? { lastRw: key } : {}) });
  return n;
}
