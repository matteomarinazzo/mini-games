// Définition des modes (partagée par le menu et le jeu). Un seul endroit à modifier pour ajouter un mode.
export const MODES = {
  '8ball': { label: '8-ball', balls: 15 },
  '9ball': { label: '9-ball', balls: 9 },
  '10ball': { label: '10-ball', balls: 10 },
};
export const DEFAULT_MODE = '8ball';

// Lit ?mode=...&opp=cpu ; renvoie toujours un mode utilisable. valid=false si mode absent/invalide (repli sur DEFAULT_MODE).
// slot = clé de sauvegarde : une partie par mode ET par type d'adversaire (« 8ball » ou « 8ball:cpu »).
export function parseMode(search) {
  const p = new URLSearchParams(search), raw = p.get('mode');
  const ok = raw !== null && Object.hasOwn(MODES, raw);
  const id = ok ? raw : DEFAULT_MODE, cpu = p.get('opp') === 'cpu';
  return { id, ...MODES[id], valid: ok, cpu, slot: id + (cpu ? ':cpu' : '') };
}
