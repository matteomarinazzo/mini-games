export const MAX_T = 10;
export const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
export const MODES = {
    easy: { label: 'Facile', count: 4, min: 0, max: 9, ops: ['+', '-', '*', '/'], un: [], neg: false, cap: 999 },
    medium: { label: 'Moyen', count: 4, min: 0, max: 30, ops: ['+', '-', '*', '/'], un: ['sq', 'cu', 'rt'], neg: true, cap: 9999 },
    hard: { label: 'Difficile', count: 6, min: 0, max: 99, ops: ['+', '-', '*', '/'], un: ['sq', 'cu', 'rt'], neg: true, cap: 9999 },
};
const LIM = 1e9, TRIES = 300, KEEP = 8, SAMPLES = 12000;

export function un(u, v) {
    if (u === 'sq') return v * v;
    if (u === 'cu') return v * v * v;
    if (u === 'rt') { const r = Math.round(Math.sqrt(v)); return r * r === v ? r : 'root'; }
    return v;
}

export function calc(v, o, neg) {
    let sum = 0, sg = 1, cur = v[0];
    for (let i = 0; i < o.length; i++) {
        const op = o[i], t = v[i + 1];
        if (op === '*') { cur *= t; if (cur > LIM) return 'big'; }
        else if (op === '/') { if (t === 0 || cur % t) return 'div'; cur /= t; }
        else {
            sum += sg * cur;
            if (!neg && sum < 0) return 'neg';
            sg = op === '+' ? 1 : -1; cur = t;
        }
    }
    sum += sg * cur;
    if (!neg && sum < 0) return 'neg';
    return sum + 0;
}

export function evalExpr(e, neg) {
    const v = new Array(e.t.length);
    for (let i = 0; i < v.length; i++) {
        const r = un(e.t[i].u, e.t[i].v);
        if (typeof r !== 'number') return r;
        v[i] = r;
    }
    return calc(v, e.o, neg);
}

export function fmtTerm(t, ph = '?') {
    const v = t.v ?? ph;
    return t.u === 'rt' ? `√${v}` : t.u === 'sq' ? `${v}²` : t.u === 'cu' ? `${v}³` : `${v}`;
}

export function fmtExpr(e, target) {
    let s = fmtTerm(e.t[0]);
    for (let i = 0; i < e.o.length; i++) s += ` ${SYM[e.o[i]]} ${fmtTerm(e.t[i + 1])}`;
    return `${s} = ${target}`;
}

const ri = (n, r) => Math.floor(r() * n);
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1, r); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function draw(m, r) {
    const sq = [];
    for (let i = 0; i * i <= m.max; i++) if (i * i >= m.min) sq.push(i * i);
    const set = new Set();
    while (set.size < m.count) set.add(m.un.length && r() < .3 ? sq[ri(sq.length, r)] : m.min + ri(m.max - m.min + 1, r));
    return [...set];
}

function randomExpr(nums, m, r) {
    const t = shuffle(nums.slice(), r).map((v) => ({ v, u: m.un.length && r() < .3 ? m.un[ri(m.un.length, r)] : '' }));
    const o = [];
    for (let i = 1; i < t.length; i++) o.push(m.ops[ri(m.ops.length, r)]);
    return { t, o };
}

function solve(nums, m, r) {
    for (let k = 0; k < 150; k++) {
        const e = randomExpr(nums, m, r), v = evalExpr(e, m.neg);
        if (typeof v !== 'number' || v < 2 || v > m.cap || nums.includes(v)) continue;
        if (new Set(e.o).size < 2 && !e.t.some((t) => t.u)) continue;
        return { sol: e, target: v };
    }
    return null;
}

function hits(nums, target, m, r) {
    let n = 0;
    for (let i = 0; i < SAMPLES; i++) if (evalExpr(randomExpr(nums, m, r), m.neg) === target) n++;
    return n;
}

/** Tirage + cible issue d'une expression valide ; parmi KEEP candidats, garde celui dont l'échantillonnage aléatoire retrouve le moins de solutions (unicité non garantie). */
export function generate(id, r = Math.random) {
    const m = MODES[id];
    let best = null, found = 0;
    for (let i = 0; i < TRIES && found < KEEP; i++) {
        const nums = draw(m, r), s = solve(nums, m, r);
        if (!s) continue;
        found++;
        const h = hits(nums, s.target, m, r);
        if (!best || h < best.hits) best = { nums, target: s.target, sol: s.sol, hits: h };
    }
    if (!best) {
        const nums = draw(m, r);
        best = { nums, target: nums.reduce((a, b) => a + b, 0), sol: { t: nums.map((v) => ({ v, u: '' })), o: Array(m.count - 1).fill('+') }, hits: 0 };
    }
    return { level: id, nums: best.nums.sort((a, b) => a - b), target: best.target, sol: best.sol, hits: best.hits };
}
