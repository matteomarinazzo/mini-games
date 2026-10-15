// save.js — sauvegarde de partie dans localStorage (clé « billard », une partie par mode). Module pur : le stockage
// est injecté (testable sous Node). Le menu écrit aussi dans cette clé (lastMode) : on ne touche jamais aux autres champs.
import { TABLE, createWorld } from './physics.js';
import { normalize } from './config.js';

export const KEY = 'billard', VERSION = 2;   // V6 : accepte aussi les sauvegardes V5 (v = 1, sans options)
const ok = Number.isFinite;

export function readAll(st) {
  try { const d = JSON.parse(st.getItem(KEY)); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}
export function writeGame(st, modeId, snap) {
  try {
    const d = readAll(st), gs = d.games && typeof d.games === 'object' && !Array.isArray(d.games) ? d.games : {};
    if (snap) gs[modeId] = snap; else delete gs[modeId];
    d.games = gs; st.setItem(KEY, JSON.stringify(d)); return true;
  } catch { return false; }
}

// État cohérent d'une partie (hors mouvement) : jamais de pause/mouvement/charge stockés.
export function snapshot({ g, aim, timeLeft, world, pocketed }) {
  return {
    v: VERSION, t: Date.now(),
    g: { mode: g.mode, cur: g.cur, groups: [...g.groups], hand: g.hand, over: g.over, winner: g.winner, reason: g.reason,
      opts: { ...g.opts }, zone: g.zone, fwd: g.fwd, sh: g.sh, ref: [...g.ref], cpu: !!g.cpu, pts: [...(g.pts || [0, 0])] },
    state: g.over ? 'gameOver' : g.hand ? 'placingCueBall' : 'aiming',
    aim, timeLeft,
    balls: world.balls.map(b => ({ n: b.n, x: b.x, y: b.y, out: b.out })),
    pocketed: pocketed.map(({ n, by }) => ({ n, by })),
  };
}

// Valide puis reconstruit. slot = clé de partie (« 8ball » ou « 8ball:cpu »). Renvoie null (jamais d'exception) si absente, invalide ou incompatible.
export function restore(st, modeId, slot = modeId) {
  try {
    const s = readAll(st).games?.[slot];
    if (!s || (s.v !== 1 && s.v !== 2)) return null;
    const q = s.g, world = createWorld(modeId);
    if (!q || q.mode !== modeId || (q.cur !== 0 && q.cur !== 1) || typeof q.hand !== 'boolean' || typeof q.over !== 'boolean') return null;
    if (!Array.isArray(q.groups) || q.groups.length !== 2 || q.groups.some(x => x !== null && x !== 'solid' && x !== 'stripe')) return null;
    if (q.groups[0] && q.groups[0] === q.groups[1]) return null;
    if (q.over ? q.winner !== 0 && q.winner !== 1 : q.winner !== null) return null;
    if (!Array.isArray(s.balls) || s.balls.length !== world.balls.length || !ok(s.aim) || !ok(s.timeLeft)) return null;
    const seen = new Set(), out = new Set();
    for (const sb of s.balls) {
      const b = world.balls.find(x => x.n === sb.n);
      if (!b || seen.has(sb.n) || typeof sb.out !== 'boolean' || !ok(sb.x) || !ok(sb.y)) return null;
      if (!sb.out && (sb.x < 0 || sb.x > TABLE.W || sb.y < 0 || sb.y > TABLE.H)) return null;
      seen.add(sb.n); b.x = sb.x; b.y = sb.y; b.out = sb.out; b.vx = b.vy = 0;
      if (sb.out && sb.n > 0) out.add(sb.n);
    }
    const p = Array.isArray(s.pocketed) ? s.pocketed : [];
    if (p.length !== out.size || p.some(e => !e || !out.delete(e.n) || (e.by !== 0 && e.by !== 1))) return null;
    if (world.cue.out && !q.hand && !q.over) return null;                     // blanche sortie sans droit de placement
    const side = x => x === null || x === 'L' || x === 'R', sh = q.sh ?? 1, ref = q.ref ?? [null, null], cpu = !!q.cpu;
    if (!side(q.zone ?? null) || !side(q.fwd ?? null) || (sh !== 1 && sh !== 2) || cpu !== slot.endsWith(':cpu')) return null;
    if (!Array.isArray(ref) || ref.length !== 2 || ref.some(x => x !== null && !(Number.isInteger(x) && x >= 0 && x < 6))) return null;
    const pts = q.pts ?? [0, 0]; if (!Array.isArray(pts) || pts.length !== 2 || pts.some(x => !Number.isInteger(x) || x < 0 || x > 99)) return null;
    const g = { mode: modeId, cur: q.cur, groups: [...q.groups], hand: q.hand, over: q.over, winner: q.winner, reason: String(q.reason ?? '').slice(0, 160),
      opts: normalize(q.opts, modeId), zone: q.hand ? q.zone ?? null : null, fwd: q.fwd ?? null, sh, ref: [...ref], cpu, pts: [...pts] };
    return { world, g, aim: s.aim, timeLeft: Math.min(30, Math.max(1, s.timeLeft)), pocketed: p.map(e => ({ n: e.n, by: e.by })) };
  } catch { return null; }
}
