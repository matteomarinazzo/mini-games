import { windows } from './board.js';
const BIG = 1e6, geoC = {};
function geo(M) {
  if (geoC[M.id]) return geoC[M.id];
  const W = windows(M), N = M.cols * M.rows, cw = Array.from({ length: N }, () => []);
  W.forEach((w, k) => w.forEach(i => cw[i].push(k)));
  let s = 12345; const Z = new Int32Array(N * 2).map(() => (s = (Math.imul(s, 1103515245) + 12345) | 0));
  const mid = M.cols >> 1, ORD = [...Array(M.cols).keys()].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  return (geoC[M.id] = { W: W.length, N, cw, Z, ORD, CB: ORD.length && Array.from({ length: M.cols }, (_, c) => (mid - Math.abs(c - mid)) * 2) });
}
const pick = a => a[Math.floor(Math.random() * a.length)];

// grid : tableau (0 vide, 1 rouge, 2 jaune, index = rangée*cols + colonne, rangée 0 en bas). p = joueur qui joue (1|2). Retourne une colonne.
export function choose(grid, M, p, level) {
  const { cols, rows, n } = M, G = geo(M), { cw, Z, ORD, CB, N } = G;
  const h = new Int8Array(cols), c = [null, new Uint8Array(G.W), new Uint8Array(G.W)], V = Array.from({ length: n + 1 }, (_, k) => (k === n ? 0 : k ** 3));
  let S = 0, key = 0, mv = 0;
  const val = (a, b) => (a && b ? 0 : a ? V[a] : b ? -V[b] : 0);
  const place = (i, v) => {
    for (const k of cw[i]) { S -= val(c[1][k], c[2][k]); c[v][k]++; S += val(c[1][k], c[2][k]); }
    S += (v === 1 ? 1 : -1) * CB[i % cols]; h[i % cols]++; key ^= Z[i * 2 + v - 1]; mv++;
  };
  const undo = (i, v) => {
    for (const k of cw[i]) { S -= val(c[1][k], c[2][k]); c[v][k]--; S += val(c[1][k], c[2][k]); }
    S -= (v === 1 ? 1 : -1) * CB[i % cols]; h[i % cols]--; key ^= Z[i * 2 + v - 1]; mv--;
  };
  const canWin = (i, v) => { for (const k of cw[i]) if (c[v][k] === n - 1 && c[3 - v][k] === 0) return true; return false; };
  for (let i = 0; i < N; i++) if (grid[i]) place(i, grid[i]);
  const legal = ORD.filter(x => h[x] < rows), cell = x => h[x] * cols + x;
  const winC = legal.find(x => canWin(cell(x), p)), blkC = legal.filter(x => canWin(cell(x), 3 - p));
  const safe = () => legal.filter(x => { const i = cell(x); place(i, p); const bad = h[x] < rows && canWin(cell(x), 3 - p); undo(i, p); return !bad; });
  const wgt = list => { const bag = []; for (const x of list) for (let k = 0; k < 1 + CB[x]; k++) bag.push(x); return pick(bag); };

  if (level === 'easy') {
    const r = Math.random();
    if (r < 0.3) return pick(legal);
    if (winC !== undefined && Math.random() < 0.6) return winC;
    if (blkC.length && Math.random() < 0.5) return blkC[0];
    return wgt(legal);
  }
  if (winC !== undefined) return winC;
  if (blkC.length) return blkC[0];
  if (level === 'medium') { const s = safe(); return wgt(s.length ? s : legal); }

  let stop = false, dl = 0, nodes = 0, tt = new Map();
  const nm = (d, alpha, beta, v, ply) => {
    if (mv === N) return 0;
    if (d === 0) return v === 1 ? S : -S;
    if ((++nodes & 511) === 0 && performance.now() > dl) { stop = true; return 0; }
    let mvs = [], forced = -1, nf = 0;
    for (const x of ORD) if (h[x] < rows) { const i = cell(x); if (canWin(i, v)) return BIG - ply; if (canWin(i, 3 - v)) { forced = x; nf++; } mvs.push(x); }
    if (nf > 1) return -(BIG - ply - 2);
    if (nf) mvs = [forced];
    const e = tt.get(key);
    if (e && e.d >= d) {
      if (e.f === 0) return e.s;
      if (e.f === 1 && e.s > alpha) alpha = e.s; else if (e.f === 2 && e.s < beta) beta = e.s;
      if (alpha >= beta) return e.s;
    }
    if (e && e.m >= 0 && mvs.includes(e.m)) mvs = [e.m, ...mvs.filter(x => x !== e.m)];
    let best = -Infinity, bm = -1; const a0 = alpha;
    for (const x of mvs) {
      const i = cell(x); place(i, v);
      const s = -nm(d - 1, -beta, -alpha, 3 - v, ply + 1);
      undo(i, v);
      if (stop) return 0;
      if (s > best) { best = s; bm = x; }
      if (s > alpha) alpha = s;
      if (alpha >= beta) break;
    }
    if (d >= 2) tt.set(key, { d, f: best <= a0 ? 2 : best >= beta ? 1 : 0, s: best, m: bm });
    return best;
  };
  const maxD = level === 'hard' ? 5 : 42; dl = performance.now() + (level === 'hard' ? 90 : 150);
  let order = legal, bestMove = legal[0];
  for (let d = 1; d <= maxD; d++) {
    let bs = -Infinity, ties = [];
    for (const x of order) {
      const i = cell(x); place(i, p);
      const s = -nm(d - 1, -BIG * 2, -(bs === -Infinity ? -BIG * 2 : bs - 1), 3 - p, 1);
      undo(i, p);
      if (stop) break;
      if (s > bs) { bs = s; ties = [x]; } else if (s === bs) ties.push(x);
    }
    if (stop) break;
    bestMove = d >= 3 ? pick(ties) : ties[0]; order = [bestMove, ...order.filter(x => x !== bestMove)];
    if (bs > BIG - 100 || bs < -BIG + 100) break;
  }
  return bestMove;
}
