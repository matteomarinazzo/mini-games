import { cleanName } from './sync.js';
const K = 'four-in-a-row', KS = 'four-in-a-row-stats';
const ls = (() => { try { return localStorage; } catch { return null; } })();
const jr = k => { try { const d = JSON.parse(ls.getItem(k)); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; } };
const jw = (k, d) => { try { ls.setItem(k, JSON.stringify(d)); return true; } catch { return false; } };
export const prefs = () => jr(K).prefs || {};
export const setPrefs = p => { const d = jr(K); d.prefs = { ...d.prefs, ...p }; jw(K, d); };
export const loadGame = () => { const g = jr(K).game; return g && Array.isArray(g.grid) && Array.isArray(g.names) ? g : null; };
export const saveGame = g => { const d = jr(K); d.game = g; jw(K, d); };
export const myName = () => cleanName(ls?.getItem('mg_player_name'));
export const fresh = (M, opp, level, names, uids, start = 0) => ({
  v: 1, mode: M.id, opp, level, names, uids, grid: Array(M.cols * M.rows).fill(0), cur: start, start, next: null,
  over: 0, w: null, rd: 0, counted: 0, endOpen: 0, left: 0
});

// Stats : { me, ai:{mode:{niveau:{w,l,d}}}, pairs:{mode:[{a:{uid,name},b:{uid,name},local:{a,b,d},online:{a,b,d}}]}, done }
const st = () => { const s = jr(KS); return { me: s.me || null, ai: s.ai || {}, pairs: s.pairs || {}, done: s.done || '' }; };
export const stats = st;
const put = s => jw(KS, s);
export const setMe = u => { const s = st(); if (u && s.me !== u) { s.me = u; put(s); } };   // uid Firebase vu en ligne, réutilisé hors ligne
export const setDone = k => { const s = st(); s.done = k; put(s); };
const z = () => ({ w: 0, l: 0, d: 0 });
export const aiRec = (m, lv) => st().ai[m]?.[lv] || z();
export function recAI(m, lv, r) { const s = st(); ((s.ai[m] ??= {})[lv] ??= z())[r]++; put(s); }

export const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const same = (x, y) => (x.uid && y.uid ? x.uid === y.uid : norm(x.name) === norm(y.name));
function find(list, P, Q) {
  for (const r of list) {
    if (same(r.a, P) && same(r.b, Q)) return [r, 0];
    if (same(r.a, Q) && same(r.b, P)) return [r, 1];
  }
  return null;
}
// res : 0 = P gagne, 1 = Q gagne, -1 = nul. Fiche = paire non ordonnée (ordre canonique à la création).
export function recPair(m, kind, P, Q, res) {
  const cl = x => ({ uid: x.uid || null, name: String(x.name ?? '').trim().replace(/\s+/g, ' ') });
  P = cl(P); Q = cl(Q);
  const s = st(), L = (s.pairs[m] ??= []);
  let f = find(L, P, Q), r, o;
  if (f) [r, o] = f;
  else {
    const t = (x, y) => (norm(x.name) < norm(y.name) ? -1 : norm(x.name) > norm(y.name) ? 1 : String(x.uid).localeCompare(String(y.uid)));
    const [a, b] = [P, Q].sort(t);
    r = { a: { uid: a.uid || null, name: a.name }, b: { uid: b.uid || null, name: b.name }, local: { a: 0, b: 0, d: 0 }, online: { a: 0, b: 0, d: 0 } };
    L.push(r); o = a === P ? 0 : 1;
  }
  const A = o ? r.b : r.a, B = o ? r.a : r.b;
  A.name = P.name; A.uid = P.uid || A.uid || null; B.name = Q.name; B.uid = Q.uid || B.uid || null;
  const c = r[kind];
  if (res < 0) c.d++; else if ((res === 0) === (o === 0)) c.a++; else c.b++;
  put(s);
}
export function faceOff(m, kind, P, Q) {
  const f = find(st().pairs[m] || [], P, Q);
  if (!f) return z();
  const [r, o] = f, c = r[kind];
  return { w: o ? c.b : c.a, l: o ? c.a : c.b, d: c.d };
}
export const pairList = m => st().pairs[m] || [];
