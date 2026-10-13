// rules.js — règles de partie (module pur, sans DOM, testable sous Node). Voir README_V3.md et README_V6.md.
// Un coup est évalué UNE seule fois, à l'arrêt des billes : evaluate(g, shot). timeout(g) traite le temps écoulé.
// shot = { before: [n…], pocketed: [n…] (ordre d'empochage), cue: bool, first: n|null, pk?: {n: indexPoche}, side?: 'L'|'R' }
// Retour : { keep, foul, over?, msg }. Les fautes donnent le tour ET la blanche en main (g.hand) à l'adversaire.
// Options V6 (g.opts, figées à la création) : cueSide (g.zone / g.fwd), twoShots (g.sh = coups restants dans la visite), blackOpp (g.ref).
import { TABLE } from './physics.js';
import { normalize } from './config.js';

export const TURN_TIME = 30;
export const groupOf = n => (n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe');
const LABEL = { solid: 'pleines', stripe: 'rayées' };
export const playerName = i => 'Joueur ' + (i + 1);
const nm = (g, i) => (g.cpu && i === 1 ? 'Ordi' : 'J' + (i + 1));

// Poches = indices de POCKETS : 0 haut-gauche, 1 haut-droite, 2 bas-gauche, 3 bas-droite, 4 milieu haut, 5 milieu bas.
// Poche opposée = symétrique par rapport au centre de la table (coin ↔ coin diagonal, milieu haut ↔ milieu bas).
export const OPP_POCKET = [3, 2, 1, 0, 5, 4];
export const POCKET_NAME = ['haut-gauche', 'haut-droite', 'bas-gauche', 'bas-droite', 'milieu haut', 'milieu bas'];
// Zone de replacement : jusqu'au 3e losange (x = 3/8 de la longueur) côté gauche ; symétrique (5/8) côté droit.
export const ZONE = { L: TABLE.W * 3 / 8, R: TABLE.W * 5 / 8 };
const MINC = Math.sin(3 * Math.PI / 180);        // composante minimale vers l'avant : ≈ 3° d'écart avec la verticale
export const cueZoneOk = (g, x) => !g.zone || (g.zone === 'L' ? x <= ZONE.L : x >= ZONE.R);
export const legalAim = (a, fwd) => !fwd || Math.cos(a) * (fwd === 'R' ? 1 : -1) >= MINC - 1e-9;
export function clampAim(a, fwd) {
  if (legalAim(a, fwd)) return a;
  const s = fwd === 'R' ? 1 : -1, sy = Math.sin(a) >= 0 ? 1 : -1;
  return Math.atan2(sy * Math.sqrt(1 - MINC * MINC), s * MINC);
}

export const createGame = (mode, opts, cpu = false) => ({
  mode, cur: 0, groups: [null, null], hand: false, over: false, winner: null, reason: '',
  opts: normalize(opts, mode), zone: null, fwd: null, sh: 1, ref: [null, null], cpu: !!cpu,
});

// s = coup évalué (faute de coup) ; absent = temps écoulé. twoShots : faute SANS blanche empochée → 2 coups, SANS blanche en main ;
// blanche empochée (même avec une autre faute : priorité) → blanche en main, 1 seul coup ; temps écoulé → blanche en main, 1 coup.
const pass = (g, foul, msg, s) => {
  g.zone = g.fwd = null;
  if (!foul && g.sh === 2) { g.sh = 1; return { keep: true, foul: false, msg: msg || `${nm(g, g.cur)} : deuxième coup` }; }  // 1er coup valide sans bille : le 2e reste
  const two = foul && !!s && g.opts.twoShots && !s.cue;
  g.cur = 1 - g.cur; g.hand = foul && !two; g.sh = two ? 2 : 1;
  return { keep: false, foul, msg };
};
const end = (g, w, reason) => { g.over = true; g.winner = w; g.reason = reason; g.hand = false; g.sh = 1; return { keep: false, foul: false, over: true, msg: reason }; };
const keep = (g, msg) => { g.sh = 1; return { keep: true, foul: false, msg }; };   // bille légale empochée : le 2e coup éventuel est perdu

export const timeout = g => pass(g, true, `Temps écoulé : faute de ${nm(g, g.cur)}`);   // faute simple : jamais de 2 coups

// Une bille n est-elle légale comme PREMIER contact du joueur courant ? before = billes sur la table (hors blanche).
export function legalFirst(g, n, before) {
  if (g.mode === '8ball') {
    const gr = g.groups[g.cur];
    return !gr ? n !== 8 : before.some(m => groupOf(m) === gr) ? groupOf(n) === gr : n === 8;
  }
  return n === Math.min(...before);
}

function foulReason(g, s) {
  if (s.cue) return 'blanche empochée';
  if (s.first == null) return 'aucune bille touchée';
  return legalFirst(g, s.first, s.before) ? '' : 'mauvaise bille touchée';
}

function ev(g, s) {
  const me = g.cur, op = 1 - me, who = nm(g, me), foul = foulReason(g, s);
  if (g.mode !== '8ball') {
    const N = g.mode === '9ball' ? 9 : 10;
    if (s.pocketed.includes(N)) {
      return foul ? end(g, op, `${who} empoche la ${N} sur une faute (${foul})`) : end(g, me, `${who} empoche la ${N}`);
    }
    if (foul) return pass(g, true, `Faute ${who} : ${foul}`, s);
    return s.pocketed.length ? keep(g, '') : pass(g, false, '');
  }
  const gr = g.groups[me];
  if (s.pocketed.includes(8)) {
    if (foul) return end(g, op, `${who} empoche la 8 sur une faute (${foul})`);
    if (!gr || s.before.some(n => groupOf(n) === gr)) return end(g, op, `${who} empoche la 8 trop tôt`);
    if (g.opts.blackOpp && s.pk && g.ref[me] != null && s.pk[8] !== OPP_POCKET[g.ref[me]]) return end(g, op, `${who} empoche la 8 dans la mauvaise poche`);
    return end(g, me, `${who} empoche la 8 après son groupe`);
  }
  if (foul) return pass(g, true, `Faute ${who} : ${foul}`, s);
  let msg = '';
  if (!gr) {                                   // table ouverte : la 1re bille empochée (dans l'ordre) fixe les groupes
    const f = s.pocketed[0];
    if (f) {
      g.groups[me] = groupOf(f); g.groups[op] = g.groups[me] === 'solid' ? 'stripe' : 'solid';
      msg = `${who} : ${LABEL[g.groups[me]]}`;
    }
  }
  const mine = g.groups[me] && s.pocketed.some(n => groupOf(n) === g.groups[me]);
  return mine ? keep(g, msg) : pass(g, false, msg);
}

// Poche de référence (blackOpp) : celle où est entrée la dernière bille de chaque groupe, quel que soit le joueur qui l'a empochée.
function trackRef(g, s) {
  if (!s.pk) return;
  for (let i = 0; i < 2; i++) {
    const gr = g.groups[i]; if (!gr) continue;
    const had = s.before.filter(n => groupOf(n) === gr);
    if (had.length && had.every(n => s.pocketed.includes(n))) g.ref[i] = s.pk[s.pocketed.filter(n => groupOf(n) === gr).pop()] ?? null;
  }
}

export function evaluate(g, s) {
  const r = ev(g, s);
  if (g.over) return r;
  if (g.mode === '8ball') trackRef(g, s);
  if (g.hand && s.cue && g.opts.cueSide) { g.zone = s.side === 'R' ? 'R' : 'L'; g.fwd = g.zone === 'L' ? 'R' : 'L'; }
  return r;
}

// Poche imposée pour la 8 du joueur courant (blackOpp), sinon null. rem = billes restantes.
export function blackTarget(g, rem) {
  const i = g.cur, gr = g.groups[i];
  if (g.mode !== '8ball' || !g.opts.blackOpp || !gr || g.ref[i] == null || g.over) return null;
  return rem.some(n => groupOf(n) === gr) ? null : OPP_POCKET[g.ref[i]];
}
export const requiredPocket = (g, rem) => blackTarget(g, rem);

// Texte d'information affiché sous le nom d'un joueur. rem = billes restantes sur la table.
export function info(g, i, rem) {
  const x = i === g.cur && g.sh === 2 && !g.over ? ' · 2 coups' : '';
  if (g.mode === '8ball') {
    const gr = g.groups[i];
    if (!gr) return 'table ouverte' + x;
    const k = rem.filter(n => groupOf(n) === gr).length;
    return LABEL[gr] + (k ? '' : ' · la 8 !') + x;
  }
  return i === g.cur && rem.length ? 'cible : ' + Math.min(...rem) + x : '';
}

// Billes à afficher dans le panneau du joueur i : { balls, next }. 8-ball : billes restantes de son groupe (ou la 8).
// 9/10-ball : billes en jeu, affichées pour le joueur actif seulement ; next = bille à viser en premier.
export function targets(g, i, rem) {
  if (g.mode === '8ball') {
    const gr = g.groups[i];
    if (!gr) return { balls: [], next: null };
    const b = rem.filter(n => groupOf(n) === gr);
    return b.length ? { balls: b, next: null } : { balls: [8], next: 8 };
  }
  return i === g.cur && rem.length ? { balls: rem, next: Math.min(...rem) } : { balls: [], next: null };
}
