/** Netwalk – génération : arbre couvrant tiré au hasard, formes fixes, unicité prouvée par déduction, puis mélange.
 *  Le solveur ne sert qu'ici. Il ne tourne jamais pendant la partie et rien de la solution n'est renvoyé. */
import { BASE, rotCW, arms, shapeOfMask, serverIndex, neighborTable, analyze, isWon } from './rules.js';

export const TRY_MS = 120, TOTAL_MS = 2000;
const ri = (n, r) => Math.floor(r() * n);

// Ensembles de masques (bitset sur les 16 valeurs) ayant / n'ayant pas un bras donné
const HAS = [0, 0, 0, 0], NOT = [0, 0, 0, 0];
for (let d = 0; d < 4; d++) { for (let m = 0; m < 16; m++) if ((m >> d) & 1) HAS[d] |= 1 << m; NOT[d] = ~HAS[d] & 0xffff; }
const rotSet = (m) => { let s = 0; for (let k = 0; k < 4; k++) { s |= 1 << m; m = rotCW(m); } return s; };
const popc = (x) => { let c = 0; while (x) { x &= x - 1; c++; } return c; };

/** Arbre couvrant au hasard, enraciné au serveur, degré ≤ 3 (pas de croix). Renvoie les masques, ou null. */
function buildTree(w, h, nbr, rnd, chain) {
    const N = w * h, si = serverIndex(w, h), deg = new Uint8Array(N), seen = new Uint8Array(N), mask = new Uint8Array(N);
    const fr = []; // arêtes candidates [parent, direction]
    const open = (u) => { for (let d = 0; d < 4; d++) { const v = nbr[u * 4 + d]; if (v >= 0 && !seen[v]) fr.push(u * 4 + d); } };
    seen[si] = 1; open(si);
    let added = 1;
    while (fr.length) {
        const k = rnd() < chain ? fr.length - 1 : ri(fr.length, rnd);
        const e = fr[k]; fr[k] = fr[fr.length - 1]; fr.pop();
        const u = e >> 2, d = e & 3, v = nbr[u * 4 + d];
        if (seen[v] || deg[u] >= 3) continue;
        seen[v] = 1; deg[u]++; deg[v] = 1; added++;
        mask[u] |= 1 << d; mask[v] |= 1 << ((d + 2) & 3);
        open(v);
    }
    return added === N ? mask : null;
}

/** Refuse un simple serpent : il faut des droits, des coudes, des tés et plusieurs ordinateurs. */
function variety(mask, si) {
    const N = mask.length, c = { I: 0, L: 0, T: 0, E: 0 };
    for (let i = 0; i < N; i++) if (i !== si) c[shapeOfMask(mask[i])]++;
    return c.T >= Math.max(2, (N / 14) | 0) && c.E >= 3 && c.I >= Math.max(2, (N / 12) | 0) && c.L >= Math.max(2, (N / 10) | 0);
}

/**
 * Compte les orientations qui allument tout, sans fil dans le vide et sans boucle (jusqu'à `limit`).
 * Déduction : chaque case garde l'ensemble de ses orientations possibles, les bras qui se font face
 * se contraignent, puis on ne tranche que lorsque la déduction cale. Pas de 4^N.
 * Les liaisons étant toutes appariées, le nombre d'arêtes est fixé par les formes : sans boucle = un seul arbre.
 */
export function countSolutions(w, h, nbr, dom0, limit, deadline = Infinity) {
    const N = w * h, dom = Uint16Array.from(dom0), inq = new Uint8Array(N), q = [], trail = [], par = new Int32Array(N);
    let sols = 0, nodes = 0, timedOut = false;
    for (let i = 0; i < N; i++) for (let d = 0; d < 4; d++) if (nbr[i * 4 + d] < 0) dom[i] &= NOT[d];
    for (let i = 0; i < N; i++) if (!dom[i]) return { sols: 0, timedOut: false };
    const push = (i) => { if (!inq[i]) { inq[i] = 1; q.push(i); } };

    function propagate() {
        while (q.length) {
            const u = q.pop(); inq[u] = 0;
            const du = dom[u];
            for (let d = 0; d < 4; d++) {
                const v = nbr[u * 4 + d];
                if (v < 0) continue;
                const e = (d + 2) & 3, dv = dom[v];
                let nv = dv;
                if (!(du & HAS[d])) nv &= NOT[e];            // u ne peut pas tendre un bras vers v
                else if (!(du & NOT[d])) nv &= HAS[e];        // u est forcément tourné vers v
                if (nv !== dv) {
                    if (!nv) { while (q.length) inq[q.pop()] = 0; return false; }
                    trail.push(v, dv); dom[v] = nv; push(v);
                }
            }
        }
        return true;
    }
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    /** Liaisons déjà certaines : si elles forment une boucle, la branche est morte. */
    function cyclic() {
        for (let i = 0; i < N; i++) par[i] = i;
        for (let i = 0; i < N; i++) {
            const di = dom[i];
            for (let d = 1; d <= 2; d++) {
                if (di & NOT[d]) continue;
                const v = nbr[i * 4 + d], a = find(i), b = find(v);
                if (a === b) return true;
                par[a] = b;
            }
        }
        return false;
    }
    function dfs() {
        if ((++nodes & 63) === 0 && performance.now() > deadline) { timedOut = true; return true; }
        if (!propagate() || cyclic()) return false;
        let best = -1, bc = 17;
        for (let i = 0; i < N; i++) {
            const c = popc(dom[i]);
            if (c > 1 && c < bc) { best = i; bc = c; if (c === 2) break; }
        }
        if (best < 0) { sols++; return sols >= limit; }
        const d0 = dom[best];
        for (let m = 0; m < 16; m++) {
            if (!((d0 >> m) & 1)) continue;
            const mark = trail.length;
            trail.push(best, d0); dom[best] = 1 << m; push(best);
            const stop = dfs();
            while (trail.length > mark) { const old = trail.pop(), c = trail.pop(); dom[c] = old; }
            while (q.length) inq[q.pop()] = 0;
            if (stop) return true;
        }
        return false;
    }
    for (let i = 0; i < N; i++) push(i);
    dfs();
    return { sols, timedOut };
}

/** Mélange : chaque case tourne de 0 à 3 quarts. Renvoie des masques, jamais déjà gagnés. */
function scramble(w, h, nbr, solved, si, rnd) {
    const N = w * h, lit = new Uint8Array(N), stack = new Int16Array(N);
    for (let t = 0; t < 20; t++) {
        const m = new Uint8Array(N);
        for (let i = 0; i < N; i++) { let x = solved[i]; for (let k = ri(4, rnd); k > 0; k--) x = rotCW(x); m[i] = x; }
        if (!isWon(analyze(nbr, m, si, lit, stack), N)) return m;
    }
    return null;
}

function attempt(w, h, nbr, deadline, rnd, wrap) {
    const N = w * h, si = serverIndex(w, h);
    const solved = buildTree(w, h, nbr, rnd, [0, 0.25, 0.5][ri(3, rnd)]);
    if (!solved || !variety(solved, si)) return null;
    const dom0 = new Uint16Array(N);
    for (let i = 0; i < N; i++) dom0[i] = rotSet(i === si ? solved[i] : BASE[shapeOfMask(solved[i])]);
    const res = countSolutions(w, h, nbr, dom0, 2, deadline);
    const shapes = Array.from(solved, (m, i) => (i === si ? 'S' : shapeOfMask(m))).join('');
    return { solved, shapes, proved: !res.timedOut && res.sols === 1 };
}
const pack = (w, h, wrap, nbr, a, rnd) => {
    const m = scramble(w, h, nbr, a.solved, serverIndex(w, h), rnd);
    return m ? { ok: true, w, h, wrap, shapes: a.shapes, masks: Array.from(m), proved: a.proved } : null;
};

/**
 * Grille prête à jouer. `strict` (3 niveaux sans bords reliés) : on regénère jusqu'à une unicité prouvée, jamais de secours.
 * Sinon : environ TOTAL_MS pour prouver, puis on lance quand même (proved = false). Rend la main entre deux essais.
 */
export async function generate(w, h, wrap, strict, rnd = Math.random, isCancelled = () => false) {
    const nbr = neighborTable(w, h, wrap), t0 = performance.now();
    let last = null;
    for (;;) {
        if (isCancelled()) return { ok: false, cancelled: true };
        const now = performance.now();
        if (!strict && now - t0 >= TOTAL_MS) break;
        const a = attempt(w, h, nbr, now + TRY_MS, rnd, wrap);
        if (a) {
            if (a.proved) { const g = pack(w, h, wrap, nbr, a, rnd); if (g) return g; }
            else last = a;
        }
        await new Promise((res) => setTimeout(res, 0));
    }
    // Hors niveaux stricts : on lance quand même, sans prétendre à l'unicité
    for (let t = 0; t < 50 && !last; t++) last = attempt(w, h, nbr, performance.now() + 1, rnd, wrap);
    const g = last && pack(w, h, wrap, nbr, last, rnd);
    return g || { ok: false };
}
