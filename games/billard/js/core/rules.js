// rules.js — règles de partie (module pur, sans DOM, testable sous Node). Voir README_V3.md et README_V6.md.
// Un coup est évalué UNE seule fois, à l'arrêt des billes : evaluate(g, shot). timeout(g) traite le temps écoulé.
// shot = { before: [n…], pocketed: [n…] (ordre d'empochage), cue: bool, first: n|null, pk?: {n: indexPoche}, side?: 'L'|'R' }
// Retour : { keep, foul, over?, msg }. Les fautes donnent le tour ET la blanche en main (g.hand) à l'adversaire.
// Options V6 (g.opts, figées à la création) : cueSide (g.zone / g.fwd), twoShots (g.sh = coups restants dans la visite), blackOpp (g.ref).
import { TABLE, D_R } from './physics.js';
import { normalize } from './config.js';

export const TURN_TIME = 30;
export const CAROM_TARGET = 10;   // V9 : points pour gagner en carambole
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
export const cueZoneOk = (g, x, y) => !g.zone || (g.zone === 'D' ? x <= TABLE.W / 4 && Math.hypot(x - TABLE.W / 4, y - TABLE.H / 2) <= D_R : g.zone === 'L' ? x <= ZONE.L : x >= ZONE.R);   // V10 : 'D' = snooker
export const legalAim = (a, fwd) => !fwd || Math.cos(a) * (fwd === 'R' ? 1 : -1) >= MINC - 1e-9;
export function clampAim(a, fwd) {
  if (legalAim(a, fwd)) return a;
  const s = fwd === 'R' ? 1 : -1, sy = Math.sin(a) >= 0 ? 1 : -1;
  return Math.atan2(sy * Math.sqrt(1 - MINC * MINC), s * MINC);
}

export const createGame = (mode, opts, cpu = false) => ({
  mode, cur: 0, groups: [null, null], hand: mode === 'snooker', over: false, winner: null, reason: '',
  opts: normalize(opts, mode), zone: mode === 'snooker' ? 'D' : null, fwd: null, sh: 1, ref: [null, null], cpu: !!cpu, pts: [0, 0],
  sn: mode === 'snooker' ? { ph: 'red', nx: 16, rd: 15 } : null,   // V10 : ph = bille visée (red | colour | seq), nx = couleur à empocher en séquence, rd = rouges restantes
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

export const timeout = g => g.mode === 'snooker' ? evSn(g, { timeout: true, pocketed: [], before: [] }) : g.mode === 'carom' ? pass(g, false, `Temps écoulé : tour de ${nm(g, g.cur)} perdu`) : pass(g, true, `Temps écoulé : faute de ${nm(g, g.cur)}`);   // faute simple : jamais de 2 coups

// Une bille n est-elle légale comme PREMIER contact du joueur courant ? before = billes sur la table (hors blanche).
export function legalFirst(g, n, before) {
  if (g.mode === 'carom') return true;
  if (g.mode === 'snooker') return g.sn.ph === 'red' ? n <= 15 : g.sn.ph === 'colour' ? n > 15 : n === g.sn.nx;
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
  if (g.mode === 'snooker') return evSn(g, s);
  const me = g.cur, op = 1 - me, who = nm(g, me), foul = foulReason(g, s);
  if (g.mode === 'carom') {   // V9 : un point si la blanche touche les deux autres billes ; sinon le tour passe (ni faute ni blanche en main)
    if (s.hits?.includes(1) && s.hits.includes(3)) { g.pts[me]++; return g.pts[me] >= CAROM_TARGET ? end(g, me, `${who} atteint ${CAROM_TARGET} points`) : keep(g, `${who} : ${g.pts[me]} point${g.pts[me] > 1 ? 's' : ''}`); }
    return pass(g, false, '');
  }
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

/* ---- V10 : snooker. Voir help.js pour le texte des règles. pts = points ; fautes : min. 4 (ou valeur de la bille la plus chère concernée) ---- */
export const SNV = n => (n <= 15 ? 1 : n - 14);
const snName = n => (n <= 15 ? 'rouge' : ['jaune', 'verte', 'marron', 'bleue', 'rose', 'noire'][n - 16]);
const snFin = g => {   // plus assez de points sur la table pour rattraper : manche terminée
  const sn = g.sn; if (sn.ph !== 'seq') return null;
  let rest = 0; for (let k = sn.nx; k <= 21; k++) rest += SNV(k);
  const d = g.pts[0] - g.pts[1];
  return Math.abs(d) > rest ? end(g, d > 0 ? 0 : 1, `Manche terminée : ${g.pts[0]} – ${g.pts[1]}`) : null;
};
function evSn(g, s) {
  const me = g.cur, op = 1 - me, who = nm(g, me), sn = g.sn, p = s.pocketed, first = s.first ?? null;
  const reds = p.filter(n => n <= 15).length, cols = p.filter(n => n > 15);
  let foul = '';
  if (s.timeout) foul = 'temps écoulé';
  else if (s.cue) foul = 'blanche empochée';
  else if (first === null) foul = 'aucune bille touchée';
  else if (!legalFirst(g, first, s.before)) foul = 'mauvaise bille touchée';
  else if (sn.ph === 'red' ? cols.length : sn.ph === 'colour' ? reds || cols.length > 1 || (cols.length && cols[0] !== first) : p.some(n => n !== sn.nx)) foul = 'mauvaise bille empochée';
  sn.rd -= reds;
  if (foul) {   // les couleurs empochées sont replacées ; les rouges restent au fond ; blanche empochée : placement dans le D, sinon on joue d'où elle est
    const v = Math.max(4, sn.ph === 'seq' ? SNV(sn.nx) : 1, first === null ? 0 : SNV(first), ...p.map(SNV));
    g.pts[op] += v; sn.ph = sn.ph === 'seq' ? 'seq' : sn.rd ? 'red' : sn.ph === 'red' ? 'colour' : 'seq';
    g.cur = op; g.hand = !!s.cue; g.zone = s.cue ? 'D' : null; g.fwd = null; g.sh = 1;
    return snFin(g) || { keep: false, foul: true, msg: `Faute ${who} : ${foul} (+${v} pour ${nm(g, op)})`, respot: cols };
  }
  let add = 0, kp = false, respot = [];
  if (sn.ph === 'red') { if (reds) { add = reds; sn.ph = 'colour'; kp = true; } }
  else if (sn.ph === 'colour') { if (cols.length) { add = SNV(cols[0]); respot = cols; kp = true; } sn.ph = sn.rd ? 'red' : 'seq'; }
  else if (p.length) { add = SNV(sn.nx); sn.nx++; kp = true; }
  g.pts[me] += add;
  if (sn.ph === 'seq' && sn.nx > 21) {   // noire empochée : fin ; égalité = noire replacée, l'adversaire joue
    const d = g.pts[0] - g.pts[1];
    if (d) return end(g, d > 0 ? 0 : 1, `${who} empoche la noire : ${g.pts[0]} – ${g.pts[1]}`);
    sn.nx = 21; g.cur = op; g.sh = 1; g.hand = false; g.zone = null;
    return { keep: false, foul: false, msg: 'Égalité : la noire est replacée', respot: [21] };
  }
  const f = snFin(g); if (f) return f;
  g.sh = 1;
  if (kp) return { keep: true, foul: false, msg: `${who} : ${g.pts[me]} pts`, respot };
  g.cur = op; g.hand = false; g.zone = null; g.fwd = null;
  return { keep: false, foul: false, msg: '', respot };
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
  if (g.mode === 'snooker') return `${g.pts[i]} pts` + (i === g.cur && !g.over ? ' · ' + (g.sn.ph === 'red' ? 'rouge' : g.sn.ph === 'colour' ? 'couleur' : snName(g.sn.nx)) : '');
  const x = i === g.cur && g.sh === 2 && !g.over ? ' · 2 coups' : '';
  if (g.mode === 'carom') return `${g.pts[i]} / ${CAROM_TARGET} pts`;
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
  if (g.mode === 'snooker') { const sn = g.sn; return i !== g.cur || g.over ? { balls: [], next: null } : sn.ph === 'red' ? { balls: [1], next: null } : sn.ph === 'colour' ? { balls: [16, 17, 18, 19, 20, 21], next: null } : { balls: [sn.nx], next: sn.nx }; }
  if (g.mode === 'carom') return { balls: [], next: null };
  if (g.mode === '8ball') {
    const gr = g.groups[i];
    if (!gr) return { balls: [], next: null };
    const b = rem.filter(n => groupOf(n) === gr);
    return b.length ? { balls: b, next: null } : { balls: [8], next: 8 };
  }
  return i === g.cur && rem.length ? { balls: rem, next: Math.min(...rem) } : { balls: [], next: null };
}
