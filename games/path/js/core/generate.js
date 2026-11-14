/** Chemin – génération : chemin hamiltonien tiré au hasard, 10 chiffres posés, unicité prouvée par un solveur exact. */
import { COUNT, neighbors, canEnter } from './rules.js';

export const LEVELS = {
    facile: { label: 'Facile', n: 5 },
    moyen: { label: 'Moyen', n: 7 },
    difficile: { label: 'Difficile', n: 8 },
};
export const TRY_MS = 90, TOTAL_MS = 2000;

const ri = (n, r) => Math.floor(r() * n);
const NB = {};
const nb = (n) => NB[n] || (NB[n] = Array.from({ length: n * n }, (_, i) => neighbors(n, i)));

/** Chemin hamiltonien aléatoire (serpent, puis « backbite » aux deux bouts). */
function randomPath(n, rnd) {
    let p = [];
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) p.push(r * n + (r % 2 ? n - 1 - k : k));
    const N = n * n, adj = nb(n);
    for (let s = 0; s < N * 30; s++) {
        if (rnd() < .5) p.reverse();
        const head = p[N - 1], opts = adj[head].filter((x) => x !== p[N - 2]);
        const x = opts[ri(opts.length, rnd)], i = p.indexOf(x);
        p = p.slice(0, i + 1).concat(p.slice(i + 1).reverse());
    }
    return p;
}

/** 10 cases du chemin, la 1re étant son départ, jamais voisines. Renvoie les rangs de chemin triés, ou null. */
function pickClues(n, path, rnd) {
    const adj = nb(n), N = path.length;
    for (let t = 0; t < 30; t++) {
        const taken = new Uint8Array(N), idx = [0];
        taken[path[0]] = 1; adj[path[0]].forEach((x) => { taken[x] = 1; });
        const order = Array.from({ length: N - 1 }, (_, k) => k + 1);
        for (let i = order.length - 1; i > 0; i--) { const j = ri(i + 1, rnd); [order[i], order[j]] = [order[j], order[i]]; }
        for (const k of order) {
            if (idx.length === COUNT) break;
            const cell = path[k];
            if (taken[cell]) continue;
            idx.push(k); taken[cell] = 1; adj[cell].forEach((x) => { taken[x] = 1; });
        }
        if (idx.length === COUNT) return idx.sort((a, b) => a - b);
    }
    return null;
}

/** Dénombre les trajets qui remplissent la grille depuis le 1 en croisant 2…10 dans l'ordre (jusqu'à `limit`). */
export function countSolutions(n, lab, limit, deadline = Infinity) {
    const N = n * n, adj = nb(n), vis = new Uint8Array(N), seen = new Uint8Array(N), stack = new Int16Array(N);
    const start = lab.indexOf(1);
    let sols = 0, nodes = 0, timedOut = false, first = null;
    const cur = [];

    /** Élagage (générateur seulement) : cases isolées, région coupée, parité, chiffre suivant hors d'atteinte. */
    function alive(head, next, left) {
        let deg1 = 0, black = 0, white = 0;
        for (let i = 0; i < N; i++) {
            if (vis[i]) continue;
            let d = 0;
            for (const x of adj[i]) if (!vis[x] || x === head) d++;
            if (d === 0) return false;
            if (d === 1 && ++deg1 > 1) return false;
            if ((((i / n) | 0) + (i % n)) & 1) white++; else black++;
        }
        const hc = (((head / n) | 0) + (head % n)) & 1;   // couleur de la tête ; la suite commence par l'autre
        const first = hc ? black : white, second = hc ? white : black;
        if (first !== Math.ceil(left / 2) || second !== Math.floor(left / 2)) return false;
        // connexité de toutes les cases libres depuis la tête
        seen.fill(0); let sp = 0, reached = 0;
        for (const x of adj[head]) if (!vis[x] && !seen[x]) { seen[x] = 1; stack[sp++] = x; }
        while (sp) { const u = stack[--sp]; reached++; for (const x of adj[u]) if (!vis[x] && !seen[x]) { seen[x] = 1; stack[sp++] = x; } }
        if (reached !== left) return false;
        // le prochain chiffre doit être atteignable sans traverser un autre chiffre
        if (next > COUNT) return true;
        const target = lab.indexOf(next);
        if (adj[head].includes(target)) return true;
        seen.fill(0); sp = 0;
        for (const x of adj[head]) if (!vis[x] && lab[x] === 0) { seen[x] = 1; stack[sp++] = x; }
        while (sp) {
            const u = stack[--sp];
            for (const x of adj[u]) {
                if (x === target) return true;
                if (!vis[x] && !seen[x] && lab[x] === 0) { seen[x] = 1; stack[sp++] = x; }
            }
        }
        return false;
    }

    function rec(head, next, left) {
        if (!left) { if (++sols === 1) first = cur.slice(); return sols >= limit; }
        if ((++nodes & 127) === 0 && performance.now() > deadline) { timedOut = true; return true; }
        if (!alive(head, next, left)) return false;
        for (const x of adj[head]) {
            if (!canEnter(lab, vis, next, x)) continue;
            vis[x] = 1; cur.push(x);
            const stop = rec(x, lab[x] === next ? next + 1 : next, left - 1);
            vis[x] = 0; cur.pop();
            if (stop) return true;
        }
        return false;
    }
    vis[start] = 1; cur.push(start);
    rec(start, 2, N - 1);
    return { sols, timedOut, first };
}

/** Un trait solution (cases dans l'ordre), ou null. Sert seulement à l'affichage après abandon. */
export function solve(n, lab, ms = 4000) {
    const r = countSolutions(n, Int8Array.from(lab), 1, performance.now() + ms);
    return r.first;
}

/** Rejoue la solution : existe-t-il un moment où deux cases vides voisines de la tête sont toutes deux acceptables ? */
function hasChoice(n, lab, path) {
    const adj = nb(n), vis = new Uint8Array(n * n);
    let next = 2;
    vis[path[0]] = 1;
    for (let k = 0; k < path.length - 1; k++) {
        const ok = adj[path[k]].filter((x) => lab[x] === 0 && canEnter(lab, vis, next, x));
        if (ok.length >= 2) return true;
        const x = path[k + 1]; vis[x] = 1; if (lab[x] === next) next++;
    }
    return false;
}

function attempt(id, deadline, rnd) {
    const n = LEVELS[id].n, path = randomPath(n, rnd), idx = pickClues(n, path, rnd);
    if (!idx) return null;
    const lab = new Int8Array(n * n);
    idx.forEach((k, j) => { lab[path[k]] = j + 1; });
    const res = countSolutions(n, lab, 2, deadline);
    if (res.timedOut || res.sols !== 1 || !hasChoice(n, lab, path)) return null;
    return { n, lab: Array.from(lab) };
}

/** Grille à solution unique, ou { ok:false } après TOTAL_MS. Rend la main entre deux essais. */
export async function generate(id, rnd = Math.random) {
    const t0 = performance.now();
    for (;;) {
        const now = performance.now();
        if (now - t0 >= TOTAL_MS) return { ok: false };
        const r = attempt(id, Math.min(now + TRY_MS, t0 + TOTAL_MS), rnd);
        if (r) return { ok: true, level: id, n: r.n, lab: r.lab };
        await new Promise((res) => setTimeout(res, 0));
    }
}
