// Aides 3D : ligne idéale (ruban continu) et zone de freinage (tronçon coloré de cette ligne), feux 5 voyants sur le portique.
import { TRACK, frameAt } from './track.js';
import { builder, obox } from './track-mesh.js';
import { basis } from './gl.js';
import { aiLine, brakeTable, decelAt } from './ai.js';

const { N, ds, length: LEN } = TRACK;

// Ruban sur la ligne des IA (aiLine) : quad i = indices [i*6, i*6+6).
function ribbon(col, w, dy) {
  const B = builder(), { P, T } = TRACK, up = [0, 1, 0];
  const pt = (i, o) => { i %= N; return [P[i * 3] - T[i * 2 + 1] * o, P[i * 3 + 1] + dy, P[i * 3 + 2] + T[i * 2] * o]; };
  for (let i = 0; i < N; i++) { const o0 = aiLine[i], o1 = aiLine[(i + 1) % N]; B.quad(pt(i, o0 - w), pt(i, o0 + w), pt(i + 1, o1 + w), pt(i + 1, o1 - w), col, up); }
  return B.done();
}
export const buildLine = () => ribbon([.6, .88, 1], .2, .07);
export const buildZone = () => ribbon([-1, 0, 0], .32, .12);   // r < 0 : couleur uniforme (voir shader)

// virages (par fiche voiture) = minima locaux de la table de vitesses des IA experts ; sT = point d'inflexion (fin du freinage), v = vitesse visée.
// Le freinage affiché est donc exactement celui des IA : aussi tard que la voiture le permet, avec une légère marge.
const CNS = new Map();
function cnOf(S) {
  let out = CNS.get(S); if (out) return out;
  out = []; const T = brakeTable(S), th = S.vmax * .88;
  for (let m = 0; m < N; m++) {
    if (T[m] >= th) continue;
    let low = true; for (let d = -25; d <= 25 && low; d++) if (T[(m + d + N) % N] < T[m] || (T[(m + d + N) % N] === T[m] && d < 0)) low = false;
    if (low) out.push({ sT: m * ds, v: T[m] });
  }
  CNS.set(S, out); return out;
}
const M = new Float32Array(16), COL = [[1, .85, .1], [1, .5, .05], [.95, .1, .1]];

/** Zone de freinage du prochain virage = tronçon de la ligne, du point de freinage (celui des IA) à la fin du freinage.
 *  Marge = distance au virage − distance de freinage : > 35 m jaune, > 0 orange, ≤ 0 rouge (trop tard / trop vite : la zone démarre devant la voiture). */
export function drawBrake(R, zone, c) {
  const sp = c.s, v = Math.max(c.u, 0); let d = 1e9, k = null;
  for (const q of cnOf(c.sheet)) { const x = (((q.sT - sp) % LEN) + LEN) % LEN; if (x > 8 && x < 500 && x < d) { d = x; k = q; } }
  if (!k) return;
  const BRP = decelAt(c.sheet, (v + k.v) / 2) / 1.2, bd = v > k.v ? (v * v - k.v * k.v) / (2 * BRP) : 0,   // décélération réelle de la voiture, marge 1,2
     mg = d - bd, r0 = Math.max(d - Math.min(Math.max(bd, 25), 250), 6);
  if (d - r0 < 2) return;
  const a0 = Math.floor((sp + r0) / ds), n = Math.ceil((sp + d) / ds) - a0, st = ((a0 % N) + N) % N, n1 = Math.min(n, N - st), col = COL[mg > 35 ? 0 : mg > 0 ? 1 : 2];
  R.drawRange(zone, undefined, col, st * 6, n1 * 6);
  if (n > n1) R.drawRange(zone, undefined, col, 0, (n - n1) * 6);
}

// Feux de départ : 5 voyants en ligne sur la poutre du portique (face aux voitures), allumés un par un.
export function buildLamp() { const B = builder(); obox(B, 0, 0, 0, 0, 1, .38, .38, .15, [-1, 0, 0]); return B.done(); }
const LF = {}, UP = [0, 1, 0], ON = [1.7, .08, .05], OFF = [.14, .05, .05];
export function drawLights(R, lamp, n) {
  const f = frameAt(TRACK.startIdx * ds, LF);
  for (let k = 0; k < 5; k++) {
    const o = (k - 2) * 2;
    R.draw(lamp, basis(M, [f.rx, 0, f.rz], UP, [f.tx, 0, f.tz], [f.x + f.rx * o - f.tx * .55, f.y + 7.2, f.z + f.rz * o - f.tz * .55]), k < n ? ON : OFF);
  }
}