/** Aires – génération : découpe guillotine, chiffres posés au hasard, unicité prouvée par un solveur exact. */
export const LEVELS = {
    easy: { label: 'Facile', n: 7, min: 2, max: 8 },
    medium: { label: 'Moyen', n: 8, min: 2, max: 12 },
    hard: { label: 'Difficile', n: 10, min: 2, max: 16 },
};
export const TRY_MS = 80, TOTAL_MS = 1500, STRICT_SHARE = .6, REROLLS = 6, STOP_P = .5, SPLIT_NODES = 3000;
/** Part de chiffres n'ayant qu'un seul rectangle possible au départ. */
export const FILTER = {
    easy: { strict: { minForced: .4 }, relaxed: { minForced: .25 } },
    medium: { strict: { minForced: .2, maxForced: .4 }, relaxed: { minForced: .1, maxForced: .5 } },
    hard: { strict: { maxForced: .2, branch: true }, relaxed: { maxForced: .3, branch: true } },
};

const ri = (n, r) => Math.floor(r() * n);
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1, r); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** Découpe guillotine récursive ; renvoie false si impossible (le backtracking local annule). */
function split(r, c, h, w, L, rnd, out, ctx) {
    if (++ctx.nodes > SPLIT_NODES) return false;
    const a = h * w;
    if (a < L.min) return false;
    const canSplit = a >= 2 * L.min;
    if (a <= L.max && (!canSplit || rnd() < STOP_P)) { out.push({ r, c, h, w }); return true; }
    if (!canSplit) return false;
    const cuts = [];
    for (let k = 1; k < h; k++) if (k * w >= L.min && (h - k) * w >= L.min) cuts.push([0, k]);
    for (let k = 1; k < w; k++) if (k * h >= L.min && (w - k) * h >= L.min) cuts.push([1, k]);
    shuffle(cuts, rnd);
    for (const [v, k] of cuts) {
        const mark = out.length;
        const ok = v ? split(r, c, h, k, L, rnd, out, ctx) && split(r, c + k, h, w - k, L, rnd, out, ctx)
            : split(r, c, k, w, L, rnd, out, ctx) && split(r + k, c, h - k, w, L, rnd, out, ctx);
        if (ok) return true;
        out.length = mark;
        if (ctx.nodes > SPLIT_NODES) return false;
    }
    return false;
}

/** Rectangles possibles par chiffre : aire exacte, dans la grille, contenant le chiffre et aucun autre. */
function buildCands(n, clues) {
    const at = new Int16Array(n * n).fill(-1);
    clues.forEach((k, i) => { at[k.r * n + k.c] = i; });
    return clues.map((k, i) => {
        const list = [];
        for (let h = 1; h <= k.v; h++) {
            if (k.v % h) continue;
            const w = k.v / h;
            if (h > n || w > n) continue;
            for (let r = Math.max(0, k.r - h + 1); r <= Math.min(k.r, n - h); r++)
                for (let c = Math.max(0, k.c - w + 1); c <= Math.min(k.c, n - w); c++) {
                    const cells = []; let ok = true;
                    for (let y = r; y < r + h && ok; y++) for (let x = c; x < c + w; x++) {
                        const o = at[y * n + x];
                        if (o !== -1 && o !== i) { ok = false; break; }
                        cells.push(y * n + x);
                    }
                    if (ok) list.push({ r, c, h, w, cells });
                }
        }
        return list;
    });
}

const free = (cov, cells) => { for (let i = 0; i < cells.length; i++) if (cov[cells[i]]) return false; return true; };
const mark = (cov, cells, v) => { for (let i = 0; i < cells.length; i++) cov[cells[i]] = v; };

/** Dénombre les solutions (jusqu'à `limit`), MRV sur les chiffres. */
function count(n, cands, limit, deadline) {
    const cov = new Uint8Array(n * n), done = new Uint8Array(cands.length);
    let sols = 0, nodes = 0, timedOut = false;
    (function rec(left) {
        if (!left) { sols++; return sols >= limit; }
        if ((++nodes & 255) === 0 && performance.now() > deadline) { timedOut = true; return true; }
        let bi = -1, bl = null;
        for (let i = 0; i < cands.length; i++) {
            if (done[i]) continue;
            const l = cands[i].filter((p) => free(cov, p.cells));
            if (!l.length) return false;
            if (!bl || l.length < bl.length) { bi = i; bl = l; if (l.length === 1) break; }
        }
        done[bi] = 1;
        for (const p of bl) {
            mark(cov, p.cells, 1);
            const stop = rec(left - 1);
            mark(cov, p.cells, 0);
            if (stop) { done[bi] = 0; return true; }
        }
        done[bi] = 0;
        return false;
    })(cands.length);
    return { sols, timedOut };
}

/** Vrai si la seule propagation (rectangle unique d'un chiffre, case couverte une seule fois) n'achève pas la grille. */
function needsBranch(n, cands) {
    const cov = new Uint8Array(n * n), done = new Uint8Array(cands.length);
    let left = cands.length, changed = true;
    const put = (i, p) => { mark(cov, p.cells, 1); done[i] = 1; left--; cands[i] = [p]; changed = true; };
    cands = cands.map((l) => l.slice());
    while (changed && left) {
        changed = false;
        for (let i = 0; i < cands.length; i++) {
            if (done[i]) continue;
            cands[i] = cands[i].filter((p) => free(cov, p.cells));
            if (!cands[i].length) return false;
            if (cands[i].length === 1) put(i, cands[i][0]);
        }
        if (changed || !left) continue;
        const cnt = new Int16Array(n * n), own = new Array(n * n);
        cands.forEach((l, i) => { if (!done[i]) l.forEach((p) => p.cells.forEach((x) => { cnt[x]++; own[x] = [i, p]; })); });
        for (let x = 0; x < n * n; x++) if (!cov[x] && cnt[x] === 1) { put(own[x][0], own[x][1]); break; }
    }
    return left > 0;
}

function attempt(id, filt, deadline, rnd) {
    const L = LEVELS[id], parts = [];
    if (!split(0, 0, L.n, L.n, L, rnd, parts, { nodes: 0 })) return null;
    for (let t = 0; t < REROLLS; t++) {
        if (performance.now() > deadline) return null;
        const clues = parts.map((p) => ({ r: p.r + ri(p.h, rnd), c: p.c + ri(p.w, rnd), v: p.h * p.w }));
        const cands = buildCands(L.n, clues);
        const f = cands.filter((l) => l.length === 1).length / cands.length;
        if ((filt.minForced != null && f < filt.minForced) || (filt.maxForced != null && f >= filt.maxForced)) continue;
        const res = count(L.n, cands, 2, deadline);
        if (res.timedOut) return null;
        if (res.sols !== 1) continue;
        if (filt.branch && !needsBranch(L.n, cands)) continue;
        return { clues, sol: parts };
    }
    return null;
}

/** Grille à solution unique, ou { ok:false } après TOTAL_MS. Rend la main entre deux essais. */
export async function generate(id, rnd = Math.random) {
    const L = LEVELS[id], t0 = performance.now();
    for (;;) {
        const now = performance.now(), el = now - t0;
        if (el >= TOTAL_MS) return { ok: false };
        const filt = FILTER[id][el >= TOTAL_MS * STRICT_SHARE ? 'relaxed' : 'strict'];
        const r = attempt(id, filt, Math.min(now + TRY_MS, t0 + TOTAL_MS), rnd);
        if (r) return { ok: true, level: id, n: L.n, clues: r.clues, sol: r.sol };
        await new Promise((res) => setTimeout(res, 0));
    }
}
