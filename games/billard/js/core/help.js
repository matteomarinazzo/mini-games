// help.js — livret des règles, par mode. Texte = règles RÉELLEMENT codées dans rules.js (voir README_V3.md §4).
import { MODES } from './modes.js';
import { RULES, isAvailable } from './config.js';

const COMMUN = ['Le Joueur 1 commence. Chaque tour dure 30 s : le chrono tourne pendant la visée, la charge et le placement de la blanche, pas pendant que les billes roulent.',
  'Coup légal qui empoche une bille utile : tu rejoues. Sinon le tour passe à l\'adversaire.'];
const FAUTES = ['Faute : blanche empochée, aucune bille touchée, mauvaise première bille touchée, ou temps écoulé.',
  'Après une faute, l\'adversaire joue avec la blanche en main : il la place où il veut sur la table (hors poche, bande et billes). Le fautif ne rejoue pas.'];

function sections(id) {
  if (id === '8ball') return [
    ['🎯 Objectif', ['Empoche toutes les billes de ton groupe (pleines 1–7 ou rayées 9–15), puis la 8 en dernier.']],
    ['🔄 Déroulement', [...COMMUN,
      'Table ouverte au départ : la première bille empochée sur un coup sans faute fixe ton groupe ; l\'autre groupe va à l\'adversaire.',
      'Tu rejoues seulement si tu empoches une bille de ton groupe.',
      'Table ouverte : la première bille touchée ne doit pas être la 8. Ensuite : une bille de ton groupe (la 8 quand ton groupe est vide).']],
    ['⚠️ Fautes', FAUTES],
    ['🏆 Fin de partie', ['Empoche la 8 sans faute après avoir fini ton groupe : victoire.', 'La 8 empochée trop tôt, ou sur une faute (casse comprise) : défaite.']],
  ];
  const N = id === '9ball' ? 9 : 10;
  return [
    ['🎯 Objectif', [`Empoche les billes dans l'ordre et gagne en empochant la ${N}.`]],
    ['🔄 Déroulement', [...COMMUN.slice(0, 1), 'La première bille touchée doit toujours être la plus petite encore sur la table.',
      'Toute bille empochée sans faute te fait rejouer ; sinon le tour passe.']],
    ['⚠️ Fautes', FAUTES],
    ['🏆 Fin de partie', [`La ${N} empochée sans faute (combinaison possible) : victoire.`, `La ${N} empochée sur une faute : défaite du fautif.`]],
  ];
}
const COMMANDES = ['PC : vise avec la souris ; clic maintenu puis recule la souris pour la puissance ; relâche pour tirer ; clic droit ou Échap annule ; touche P = pause.',
  'Mobile : glisse sur la table pour viser ; règle la puissance avec la jauge à droite et relâche pour tirer (relâcher loin de la jauge annule).',
  'Trait de visée rouge avec ✕ : la première bille touchée serait illégale. Trait blanc : tir légal, ou bande touchée en premier (non évalué).'];
const SIMPLIF = ['Pas de règle « bande après contact », pas de poche annoncée, pas de casse spéciale ; les billes empochées par erreur restent au fond. Anneau bleu / orange sur le plateau : Joueur 1 / Joueur 2.'];

// Règles personnalisées V6 : texte exact de ce qui est codé dans rules.js (voir README_V6.md §3).
const CUSTOM = {
  cueSide: 'Blanche empochée : l\'adversaire la replace uniquement du côté de la poche où elle est tombée, jusqu\'au 3e losange (gauche : x ≤ 3/8 de la longueur ; droite : x ≥ 5/8), et son tir suivant doit partir vers l\'autre côté (jamais vers l\'arrière ni à moins de 3° de la verticale). Poche du milieu : côté d\'où venait la blanche. Un seul tir est contraint ; la zone est ombrée pendant le placement.',
  twoShots: 'Faute « aucune bille touchée » ou « mauvaise première bille » : l\'adversaire joue 2 coups, sans blanche en main. Blanche empochée (même avec une autre faute) : blanche en main mais 1 seul coup. 1er des 2 coups sans faute et sans bille empochée : il garde le 2e. S\'il empoche une bille légale, le 2e est perdu et son tour continue normalement. Faute pendant ses coups : le tour passe. Temps écoulé : blanche en main, 1 coup.',
  blackOpp: 'La 8 doit entrer dans la poche opposée à celle où est entrée la dernière bille de ton groupe (même empochée par l\'adversaire). Opposée = symétrique par rapport au centre : coin ↔ coin diagonal, milieu haut ↔ milieu bas. Autre poche : défaite. La poche imposée est entourée d\'un anneau doré.',
};
function custom(modeId, opts, cpu, online) {
  const on = RULES.filter(r => opts?.[r.id]).map(r => r.title + ' — ' + CUSTOM[r.id]);
  const off = RULES.filter(r => !isAvailable(r.id, modeId)).map(r => r.title + ' : indisponible dans ce mode.');
  const items = [...(on.length ? on : ['Aucune option personnalisée : règles standard de ce livret.']), ...off];
  if (cpu) items.push('Contre l\'ordinateur : il joue le Joueur 2, vise et tire comme toi (même physique, même chrono) ; IA simple, il peut rater.');
  if (online) items.push('En ligne : l\'hôte (Joueur 1) simule la physique et valide chaque coup ; l\'invité voit la même partie. Pas de pause : le chrono continue, et il est suspendu si un joueur est déconnecté.');
  return ['🧩 Règles de cette partie', items];
}

export function fillRules(title, body, modeId, opts, cpu, online) {
  title.textContent = 'Règles · ' + (MODES[modeId]?.label ?? '');
  body.textContent = '';
  for (const [h, items] of [custom(modeId, opts, cpu, online), ...sections(modeId), ['⌨️ Commandes', COMMANDES], ['ℹ️ Simplifications', SIMPLIF]]) {
    const s = document.createElement('section'), t = document.createElement('h3'), ul = document.createElement('ul');
    t.textContent = h;
    for (const it of items) { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); }
    s.append(t, ul); body.appendChild(s);
  }
}
