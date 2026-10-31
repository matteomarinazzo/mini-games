const cache = {};
export function windows(M) {
  if (cache[M.id]) return cache[M.id];
  const W = [], { cols, rows, n } = M;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const er = r + dr * (n - 1), ec = c + dc * (n - 1);
    if (er < rows && ec >= 0 && ec < cols) W.push(Array.from({ length: n }, (_, k) => (r + dr * k) * cols + c + dc * k));
  }
  return (cache[M.id] = W);
}
export const cells = M => M.cols * M.rows;
export const drop = (grid, M, c) => { for (let r = 0; r < M.rows; r++) if (!grid[r * M.cols + c]) return r; return -1; };
export const winLine = (grid, M) => { for (const w of windows(M)) { const v = grid[w[0]]; if (v && w.every(i => grid[i] === v)) return w; } return null; };
