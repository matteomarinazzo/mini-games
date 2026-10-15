// sync.js — protocole du mode en ligne (V7) : validation des données reçues + filtres anti-doublon / anti-désordre.
// Module pur (ni DOM ni Firebase), testable sous Node (tests/test_v7.mjs). Toute donnée venue du réseau passe ici AVANT d'être utilisée.
import { TABLE } from './physics.js';
import { restore } from './save.js';
import { rmOk } from './rematch.js';

export const PREFIX = 'billard_';                       // id de salon = « billard_<CODE> » (rooms/billard_ABC234)
export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;           // sans I, O, 0, 1 (confusions à la dictée)
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';       // 32 symboles : un octet & 31 est uniforme

export function newCode(rnd) {
  const b = new Uint8Array(6), c = globalThis.crypto;
  if (!rnd && c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 6; i++) b[i] = Math.floor((rnd || Math.random)() * 256);
  return Array.from(b, v => ALPHA[v & 31]).join('');
}
export const cleanName = (s, fb = 'Joueur') => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 15) || fb;

// V8 : code saisi ou collé (espaces, retours à la ligne, tirets, minuscules, caractères pleine chasse…) → forme canonique, sans validation.
export const normCode = s => String(s ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const opt = (v, lo, hi) => (num(v, lo, hi) ? v : undefined);

// Intention de l'invité : { id, seq, type: 'shot' | 'place', aim, power | x, y }. id croissant (anti-doublon), seq = tour vu par l'invité.
export function parseAct(a) {
  if (!a || typeof a !== 'object') return null;
  const { id, seq, type } = a;
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(seq) || seq < 0) return null;
  if (type === 'shot') return num(a.aim, -10, 10) && num(a.power, 0, 1) ? { id, seq, type, aim: a.aim, power: a.power, sx: opt(a.sx, -1, 1) ?? 0, sy: opt(a.sy, -1, 1) ?? 0 } : null;
  if (type === 'rematch') return (a.v === 0 || a.v === 1 || a.v === 2) && Number.isSafeInteger(a.rd) && a.rd >= 0 ? { id, seq, type, v: a.v, rd: a.rd } : null;   // V8 : vote de revanche
  if (type === 'place') return num(a.x, -100, TABLE.W + 100) && num(a.y, -100, TABLE.H + 100) ? { id, seq, type, x: a.x, y: a.y } : null;
  return null;
}
// Aperçu en direct du joueur actif (visée, puissance, position de la blanche) et, pour l'hôte, temps restant / onglet en arrière-plan.
export function parseLive(l) {
  if (!l || typeof l !== 'object') return null;
  return { a: opt(l.a, -10, 10), p: opt(l.p, 0, 1), sx: opt(l.sx, -1, 1), sy: opt(l.sy, -1, 1), gx: opt(l.gx, -100, TABLE.W + 100), gy: opt(l.gy, -100, TABLE.H + 100), tl: opt(l.tl, 0, 60), bg: l.bg === 1 };
}

// Image de billes pendant un tir : { n: tour, k: n° d'image, t: temps simulé (s), b: [x0,y0,x1,y1…], o: billes empochées (ordre), c: blanche empochée }
export function encodeFrame(n, k, t, world, pocketed) {
  const r = v => Math.round(v * 10) / 10, b = [];
  for (const x of world.balls) b.push(x.out ? 0 : r(x.x), x.out ? 0 : r(x.y));
  const f = { n, k, t: Math.round(t * 1000) / 1000, b, c: world.cue.out ? 1 : 0 };
  if (pocketed.length) f.o = pocketed.map(e => e.n);       // Firebase supprime les tableaux vides : `o` absent = []
  return f;
}
export function parseFrame(f, nBalls) {
  if (!f || typeof f !== 'object' || !Number.isSafeInteger(f.n) || f.n < 0 || !Number.isSafeInteger(f.k) || f.k < 0 || !num(f.t, 0, 600)) return null;
  if (!Array.isArray(f.b) || f.b.length !== 2 * nBalls || !f.b.every(v => num(v, -50, TABLE.W + 50))) return null;
  const o = f.o === undefined ? [] : f.o;
  if (!Array.isArray(o) || o.length > nBalls || o.some(n => !Number.isInteger(n) || n < 1 || n > 15)) return null;
  return { n: f.n, k: f.k, t: f.t, b: f.b, o: [...new Set(o)], c: f.c === 1 };
}

// État validé de l'hôte : sauvegarde V6 (save.js) sérialisée en TEXTE. Firebase ne stocke pas null ni les tableaux vides, ce qui casserait
// la validation stricte de restore() ; une chaîne JSON traverse la base sans altération.
export const encodeSnap = snap => JSON.stringify(snap);
export function decodeSnap(s) {
  if (typeof s !== 'string' || s.length > 30000) return null;
  try { const o = JSON.parse(s); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
}
// Validation complète réutilisée telle quelle de la V6 (modes, billes, groupes, options, zone, coups…). null si invalide.
export const restoreFrom = (sn, modeId) => (sn ? restore({ getItem: () => JSON.stringify({ games: { net: sn } }) }, modeId, 'net') : null);

/* ---- Filtres : chacun renvoie la donnée à appliquer, ou null (invalide, doublon, désordre, ancien tour) ---- */
// Hôte : une intention n'est appliquée qu'une fois (id strictement croissant) et seulement pour le tour courant (seq). L'id est consommé même
// si le tour ne correspond pas : une intention périmée ne pourra jamais être rejouée plus tard.
// V8 : init/seed = dernier id déjà consommé (publié par l'hôte dans le document « tour », donc survit à une actualisation de l'hôte) ;
// un vote de revanche n'est lié qu'à la manche (rd, contrôlée par l'appelant), pas au n° de tour.
export function makeActGate(init = 0) {
  let last = Number.isSafeInteger(init) ? init : 0;
  const f = (raw, curSeq) => { const a = parseAct(raw); if (!a || a.id <= last) return null; last = a.id; return a.seq === curSeq || a.type === 'rematch' ? a : null; };
  f.last = () => last;
  f.seed = v => { if (Number.isSafeInteger(v) && v > last) last = v; };
  return f;
}
// Invité : documents « tour » à seq strictement croissant.
export function makeTurnGate() {
  let last = 0;
  return v => {
    if (!v || typeof v !== 'object' || !Number.isSafeInteger(v.seq) || v.seq <= last || typeof v.snap !== 'string' || v.snap.length > 30000) return null;
    last = v.seq;
    return { seq: v.seq, snap: v.snap, msg: typeof v.msg === 'string' ? v.msg.slice(0, 120) : '', rd: Number.isSafeInteger(v.rd) && v.rd >= 0 ? v.rd : 0, rm: rmOk(v.rm) ? v.rm : 0 };
  };
}
// Invité : images du tour courant uniquement, n° d'image strictement croissant.
export function makeFrameGate() {
  let n = -1, k = -1;
  return (raw, curSeq, nBalls) => {
    const f = parseFrame(raw, nBalls);
    if (!f || f.n !== curSeq || (f.n === n && f.k <= k)) return null;
    n = f.n; k = f.k; return f;
  };
}
