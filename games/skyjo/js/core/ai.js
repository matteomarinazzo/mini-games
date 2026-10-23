/** IA Skyjo (Classique & Mode Crazy).
 *  Reçoit uniquement une vue (viewFor) : jamais les cartes cachées des autres.
 *  Connaît les effets des 3 jokers en Crazy et joue de façon cohérente. */
import { next } from './rng.js';
import { buildDeck } from './rules.js';

const L = (a, b, t) => a + (b - a) * t;

export function makeProfile(r) {
    const col = r(), keepLow = r(), reveal = r(), closeEarly = r(), prudent = r();
    return {
        col, keepLow, reveal, closeEarly, prudent,
        closeThr: L(9, 26, closeEarly) + (r() - .5) * 4,
        discardGain: L(.8, 3.2, r()),
        patience: r(),
        margin: prudent * 7
    };
}

export function makeProfiles(seed, n) {
    const o = { rng: (seed ^ 0x9E3779B9) >>> 0 };
    return Array.from({ length: n }, (_, i) => (i === 0 ? null : makeProfile(() => next(o))));
}

export const DEFAULT = {
    col: .5, keepLow: .5, reveal: .4, closeEarly: .4, prudent: .5,
    closeThr: 16, discardGain: 1.8, patience: .5, margin: 3.5
};

function expected(v) {
    const c = {};
    buildDeck(v.mode).forEach(card => {
        const val = card.v;
        c[val] = (c[val] || 0) + 1;
    });
    const sub = card => {
        if (!card) return;
        const val = typeof card === 'object' ? card.v : card;
        if (c[val] > 0) c[val]--;
    };
    v.players.forEach(p => p.grid.forEach(k => { if (k && k.up) sub(k); }));
    v.discard.forEach(sub);
    v.removed.forEach(sub);
    if (v.drawn !== null) sub(v.drawn);

    let n = 0, s = 0;
    for (const k in c) { n += c[k]; s += c[k] * Number(k); }
    return n ? s / n : 4.5;
}

function colMatchesView(a, b, d) {
    if (!a || !b || !d || !a.up || !b.up || !d.up) return false;
    const jokers = [a, b, d].filter(c => c.joker);
    const chams = [a, b, d].filter(c => c.joker === 'chameleon');
    if (jokers.length === 3) return true;
    if (chams.length === 2) return true;
    if (chams.length === 1) {
        const others = [a, b, d].filter(c => c.joker !== 'chameleon');
        return others[0].v === others[1].v;
    }
    return a.v === b.v && b.v === d.v;
}

function est(g, E) {
    let s = 0; const dead = new Set();
    for (let c = 0; c < 4; c++) {
        const a = g[c], b = g[c + 4], d = g[c + 8];
        if (colMatchesView(a, b, d)) {
            dead.add(c); dead.add(c + 4); dead.add(c + 8);
        }
    }
    g.forEach((k, i) => { if (k && !dead.has(i)) s += k.up ? k.v : E; });
    return s;
}

function sw(g, i, card, E, pf, mo) {
    const val = typeof card === 'object' ? card.v : card;
    const joker = typeof card === 'object' ? card.joker : null;
    const o = g[i];
    const a = g.slice();
    a[i] = { up: true, v: val, joker };

    const aft = est(a, E);
    let s = est(g, E) - aft;

    if (o && o.up && o.v >= 9) s += pf.keepLow * (o.v - 8) * .6;
    if (val <= 1) s += pf.keepLow * .7;

    const c = i % 4;
    const oth = [c, c + 4, c + 8].filter(j => j !== i).map(j => g[j]);

    // Spécificités des jokers en Crazy Mode
    if (joker === 'chameleon') {
        if (oth.every(k => k && k.up)) {
            if (oth[0].v === oth[1].v || oth.some(k => k.joker === 'chameleon') || (oth[0].joker && oth[1].joker)) {
                s += 14 + pf.col * 6; // Élimination directe de la colonne !
            }
        } else if (oth.some(k => k && k.up)) {
            s += 5 + pf.col * 2;
        }
    } else if (joker === 'column') {
        const hidCount = oth.filter(k => k && !k.up).length;
        s += hidCount * 3.5 + pf.reveal * 2;
    } else if (joker === 'target') {
        s += 3 + pf.reveal * 2;
    }

    if (oth.every(k => k && k.up) && oth[0].v === oth[1].v && oth[0].v !== val && !joker) {
        s -= pf.col * 3;
    } else if (oth.filter(k => k && k.up && k.v === val).length === 1) {
        s += pf.col * 2.2;
    }

    if (a.every(k => !k || k.up) && !(aft <= pf.closeThr && aft + pf.margin <= mo)) {
        s -= 99;
    }
    return s;
}

export function choose(view, pf, rnd) {
    const g = view.players[view.me].grid, E = expected(view), st = view.stage;
    const hid = [];
    g.forEach((c, i) => { if (c && !c.up) hid.push(i); });
    const pick = a => a[Math.floor(rnd() * a.length)];

    if (view.phase === 'reveal' || st === 'mustFlip' || st === 'targetFlip') {
        if (!hid.length) return { type: 'flip', idx: 0 };
        // Favoriser une colonne où une autre carte est déjà révélée
        const scored = hid.map(i => {
            const col = i % 4;
            const oth = [col, col + 4, col + 8].filter(j => j !== i).map(j => g[j]);
            const upCount = oth.filter(c => c && c.up).length;
            return { i, s: upCount + rnd() * 0.4 };
        }).sort((a, b) => b.s - a.s);
        return { type: 'flip', idx: scored[0].i };
    }

    const mo = Math.min(...view.players.map((p, i) => (i === view.me ? 1e9 : est(p.grid, E))));

    const best = card => {
        let b = null;
        g.forEach((c, i) => {
            if (!c) return;
            const s = sw(g, i, card, E, pf, mo) + rnd() * .05;
            if (!b || s > b.s) b = { s, i };
        });
        return b;
    };

    if (st === 'start') {
        const d = view.discard[view.discard.length - 1];
        if (d !== undefined) {
            const isJoker = typeof d === 'object' && d.joker;
            const b = best(d);
            if (!view.canDraw || isJoker || b.s >= pf.discardGain) {
                return { type: 'takeDiscard' };
            }
        }
        return { type: 'draw' };
    }

    if (st === 'holdDiscard') {
        return { type: 'swap', idx: best(view.drawn).i };
    }

    // holdDraw : échanger, ou défausser et retourner une carte cachée
    const drawn = view.drawn;
    const b = best(drawn);
    const isJoker = typeof drawn === 'object' && drawn.joker;

    let fs = hid.length ? 1 + pf.reveal * 1.8 + pf.patience * .6 : -Infinity;
    if (isJoker) fs -= 8; // Ne défausse presque jamais un joker

    if (hid.length === 1) {
        const proj = est(g, E);
        if (!(proj <= pf.closeThr && proj + pf.margin <= mo)) fs = -Infinity;
    }

    return fs > b.s ? { type: 'discard' } : { type: 'swap', idx: b.i };
}
