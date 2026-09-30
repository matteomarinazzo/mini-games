/** Résumé lisible d'une sauvegarde (carte de slot et aperçu d'import). */
import { h, kv } from './ui.js';
import { formatMoney, formatPlayTime, formatDateTime, formatGameDate } from './core/utils.js';

export function summaryNode(sum) {
  return kv([
    ['Écurie', h('span', { class: 'team-name' }, h('span', { class: 'dot', style: { '--c': sum.color }, 'aria-hidden': 'true' }), sum.teamName)],
    ['Saison', `${sum.season} · ${formatGameDate(sum.gameDate)} (date simulée)`],
    ['Dernière partie', formatDateTime(sum.lastPlayedAt)],
    ['Temps de jeu', formatPlayTime(sum.playTimeSeconds)],
    ['Solde', formatMoney(sum.balance)],
    ['Course', sum.raceStatus],
    ['Pilotes', h('ul', { class: 'plain' }, sum.drivers.map((d) => h('li', { text: `${d.name} (${d.abbr}) : note ${d.overall}` })))],
    ['Difficulté', `Départements : ${sum.startLevelLabel} · Améliorations : ${sum.upgradeLabel}`],
  ]);
}
