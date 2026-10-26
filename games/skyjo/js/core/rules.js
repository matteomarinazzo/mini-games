/** Moteur de règles Skyjo (Magilano, Classique + Mode Crazy).
 *  Pur : aucun DOM, déterminisme absolu via rng.js. */
import { shuffle } from './rng.js';

export const TARGET = 100;

export function buildDeck(mode = 'classic') {
    const d = [];
    const add = (v, n, joker = null) => {
        for (let i = 0; i < n; i++) d.push({ v, joker });
    };
    add(-2, 5);
    add(-1, 10);
    add(0, 15);
    for (let v = 1; v <= 12; v++) add(v, 10);

    // Mode Crazy : +30 cartes jokers (valeur de base 0, 3 types x 10)
    if (mode === 'crazy') {
        add(0, 10, 'chameleon');
        add(0, 10, 'column');
        add(0, 10, 'target');
    }
    return d;
}

const allUp = p => p.grid.every(c => !c || c.up);
export const visibleScore = p => p.grid.reduce((a, c) => a + (c && c.up ? c.v : 0), 0);

export function newGame(n, seed, mode = 'classic') {
    if (!(n >= 2 && n <= 8)) throw new Error('2 à 8 joueurs');
    const s = {
        v: 1, n, mode: mode === 'crazy' ? 'crazy' : 'classic',
        seed: seed >>> 0, rng: seed >>> 0, round: 0, totals: Array(n).fill(0), history: [],
        phase: 'reveal', cur: 0, turn: { stage: 'reveal' }, closer: null, finalLeft: 0, first: null,
        deck: [], discard: [], removed: [], players: [], winners: null
    };
    deal(s);
    return s;
}

function deal(s) {
    s.round++;
    s.deck = shuffle(buildDeck(s.mode), s);
    s.discard = [];
    s.removed = [];
    s.closer = null;
    s.finalLeft = 0;
    s.first = null;
    s.players = Array.from({ length: s.n }, () => ({
        grid: Array.from({ length: 12 }, () => ({ ...s.deck.pop(), up: false })),
        rev: 0
    }));
    s.discard.push(s.deck.pop());
    s.phase = 'reveal';
    s.cur = 0;
    s.turn = { stage: 'reveal' };
}

export function nextRound(s) {
    if (s.phase !== 'roundEnd') return false;
    deal(s);
    return true;
}

/** Vérifie si 3 cartes d'une colonne forment une correspondance valide */
function colMatches(a, b, d) {
    if (!a || !b || !d || !a.up || !b.up || !d.up) return false;
    const jokers = [a, b, d].filter(c => c.joker);
    const chams = [a, b, d].filter(c => c.joker === 'chameleon');

    // 1. Trois jokers visibles (identiques ou mélangés) : 0+0+0, la colonne part
    if (jokers.length === 3) return true;

    // 2. Deux caméléons visibles plus un numéro X visible : les deux prennent X, la colonne part
    if (chams.length === 2) return true;

    // 3. Un caméléon visible : si les deux autres sont visibles et de même valeur V, il devient V et la colonne part
    if (chams.length === 1) {
        const others = [a, b, d].filter(c => c.joker !== 'chameleon');
        return others[0].v === others[1].v;
    }

    // 4. Aucun caméléon : 3 cartes de même valeur
    return a.v === b.v && b.v === d.v;
}

/** Quand une colonne est retirée, la carte du haut va sur la défausse, les deux autres sont retirées */
function removeCols(s, seat, ev) {
    const g = s.players[seat].grid;
    for (let c = 0; c < 4; c++) {
        const a = g[c], b = g[c + 4], d = g[c + 8];
        if (colMatches(a, b, d)) {
            s.discard.push(a);
            s.removed.push(b, d);
            ev.push({ t: 'col', seat, c, v: a.v, top: a, mid: b, bot: d });
            g[c] = g[c + 4] = g[c + 8] = null;
        }
    }
}

function ensureDeck(s) {
    if (!s.deck.length && s.discard.length > 1) {
        const top = s.discard.pop();
        s.discard.forEach(c => { if (c) c.up = false; });
        s.deck = shuffle(s.discard, s);
        s.discard = [top];
    }
}

function startPlay(s) {
    let best = 0, bs = -1e9, bm = -1e9;
    s.players.forEach((p, i) => {
        const sum = visibleScore(p), mx = Math.max(...p.grid.map(c => (c && c.up ? c.v : -99)));
        if (sum > bs || (sum === bs && mx > bm)) { best = i; bs = sum; bm = mx; }
    });
    s.first = best; s.cur = best; s.phase = 'play'; s.turn = { stage: 'start' };
}

function endTurn(s, ev) {
    const p = s.players[s.cur];
    if (s.closer === null && allUp(p)) {
        s.closer = s.cur;
        s.finalLeft = s.n - 1;
        ev.push({ t: 'close', seat: s.cur });
    } else if (s.closer !== null) {
        s.finalLeft--;
    }
    if (s.closer !== null && s.finalLeft <= 0) return endRound(s, ev);
    s.cur = (s.cur + 1) % s.n;
    s.turn = { stage: 'start' };
}

function endRound(s, ev) {
    s.players.forEach((p, i) => {
        p.grid.forEach(c => { if (c) c.up = true; });
        removeCols(s, i, ev);
    });
    const raw = s.players.map(visibleScore), sc = raw.slice(), c = s.closer;
    let doubled = false;
    if (c !== null && raw[c] > 0 && raw.some((x, i) => i !== c && x <= raw[c])) {
        sc[c] = raw[c] * 2;
        doubled = true;
    }
    s.totals = s.totals.map((t, i) => t + sc[i]);
    s.history.push({ round: s.round, raw, scores: sc, closer: c, doubled });
    s.turn = { stage: 'end' };
    if (s.totals.some(t => t >= TARGET)) {
        s.phase = 'gameEnd';
        const m = Math.min(...s.totals);
        s.winners = s.totals.map((t, i) => (t === m ? i : -1)).filter(i => i >= 0);
    } else {
        s.phase = 'roundEnd';
    }
    ev.push({ t: 'roundEnd' });
}

// ── Chaîne jokers : appelées mutuellement de façon récursive ─────────────────

/**
 * Révèle la carte à idx si elle est cachée, émet l'événement flip,
 * puis déclenche en chaîne son effet joker (si mode crazy).
 * N'incrémente PAS p.rev : c'est la responsabilité de l'appelant
 * pour les retournements initiés par le joueur.
 */
function revealAndChain(s, idx, ev) {
    const p = s.players[s.cur];
    const c = p.grid[idx];
    if (!c || c.up) return;                         // déjà visible ou absente
    c.up = true;
    ev.push({ t: 'flip', seat: s.cur, idx, v: c.v, joker: c.joker, card: c });
    if (s.mode === 'crazy' && c.joker) {
        applyJokerEffect(s, idx, c.joker, ev);      // déclenche l'effet en cascade
    }
}

/**
 * Applique l'effet d'un joker DÉJÀ RÉVÉLÉ à l'index idx.
 * Gère les chaînes : column → révèle les autres → si joker → relance applyJokerEffect.
 *
 * En phase 'reveal' : target décrémente p.rev (force un retournement de plus).
 * En phase 'play'   : target incrémente s.turn.pendingTargets.
 */
function applyJokerEffect(s, idx, jokerType, ev) {
    const p = s.players[s.cur];

    if (jokerType === 'column') {
        // Révèle les deux autres cartes de la colonne + chaîne leurs éventuels effets
        const col = idx % 4;
        for (const j of [col, col + 4, col + 8]) {
            revealAndChain(s, j, ev);
        }
        removeCols(s, s.cur, ev);

    } else if (jokerType === 'chameleon') {
        removeCols(s, s.cur, ev);

    } else if (jokerType === 'target') {
        removeCols(s, s.cur, ev);
        if (p.grid.some(k => k && !k.up)) {
            if (s.phase === 'reveal') {
                // Force le joueur à retourner une carte de plus
                p.rev = Math.max(0, p.rev - 1);
            } else {
                // Ajoute une cible pendante : le joueur devra choisir une carte à retourner
                s.turn.pendingTargets = (s.turn.pendingTargets || 0) + 1;
            }
        }
    }
}

/**
 * Clôture un tour : passe en targetFlip s'il reste des cibles pendantes,
 * sinon appelle endTurn.
 */
function resolveAndEnd(s, ev) {
    removeCols(s, s.cur, ev);      // passe final (idempotent)
    const pendingT = s.turn.pendingTargets || 0;
    const p = s.players[s.cur];
    if (pendingT > 0 && p.grid.some(k => k && !k.up)) {
        s.turn = { stage: 'targetFlip', pendingTargets: pendingT };
        return;
    }
    endTurn(s, ev);
}

// ── Action principale ─────────────────────────────────────────────────────────

/** Applique une action. Muté in place. Retourne {ok, events}. */
export function apply(s, a) {
    const ev = [], p = s.players[s.cur], t = s.turn;
    const cell = i => (Number.isInteger(i) && i >= 0 && i < 12 ? p.grid[i] : null);

    // ── Phase de révélation initiale ─────────────────────────────────────────
    if (s.phase === 'reveal') {
        const c = cell(a.idx);
        if (a.type !== 'flip' || !c || c.up) return { ok: false };
        c.up = true;
        p.rev++;
        ev.push({ t: 'flip', seat: s.cur, idx: a.idx, v: c.v, joker: c.joker, card: c });

        // Effets jokers en cascade (peuvent modifier p.rev via target)
        if (s.mode === 'crazy' && c.joker) {
            applyJokerEffect(s, a.idx, c.joker, ev);
        }

        // Passage au joueur suivant dès que les 2 retournements requis sont faits
        if (p.rev >= 2 || !p.grid.some(k => k && !k.up)) {
            if (s.cur < s.n - 1) s.cur++;
            else startPlay(s);
        }
        return { ok: true, events: ev };
    }

    // ── Phase de jeu ─────────────────────────────────────────────────────────
    if (s.phase !== 'play') return { ok: false };
    const st = t.stage;

    if (a.type === 'draw' && st === 'start') {
        ensureDeck(s);
        if (!s.deck.length) return { ok: false };
        s.turn = { stage: 'holdDraw', drawn: s.deck.pop(), src: 'draw', pendingTargets: 0 };
        ev.push({ t: 'draw', seat: s.cur, v: s.turn.drawn.v, joker: s.turn.drawn.joker, card: s.turn.drawn });

    } else if (a.type === 'takeDiscard' && st === 'start') {
        if (!s.discard.length) return { ok: false };
        const v = s.discard.pop();
        s.turn = { stage: 'holdDiscard', drawn: v, src: 'discard', pendingTargets: 0 };
        ev.push({ t: 'take', seat: s.cur, v: v.v ?? v, joker: v.joker, card: v });

    } else if (a.type === 'swap' && (st === 'holdDraw' || st === 'holdDiscard')) {
        const c = cell(a.idx);
        if (!c) return { ok: false };
        const placed = { ...t.drawn, up: true };
        p.grid[a.idx] = placed;
        c.up = true;
        s.discard.push(c);
        ev.push({ t: 'swap', seat: s.cur, idx: a.idx, out: c, in: placed, src: t.src });

        // Réinitialise les cibles pendantes pour ce tour
        s.turn = { stage: 'resolving', pendingTargets: 0 };

        // Déclenche l'effet si la carte posée est un joker
        if (s.mode === 'crazy' && placed.joker) {
            applyJokerEffect(s, a.idx, placed.joker, ev);
        }

        resolveAndEnd(s, ev);

    } else if (a.type === 'discard' && st === 'holdDraw') {
        if (!p.grid.some(c => c && !c.up)) return { ok: false };
        s.discard.push(t.drawn);
        ev.push({ t: 'discard', seat: s.cur, v: t.drawn });
        s.turn = { stage: 'mustFlip', pendingTargets: 0 };

    } else if (a.type === 'flip' && st === 'mustFlip') {
        const c = cell(a.idx);
        if (!c || c.up) return { ok: false };

        // pendingTargets déjà initialisé à 0 à l'entrée de mustFlip
        revealAndChain(s, a.idx, ev);   // révèle + effets jokers en cascade
        resolveAndEnd(s, ev);

    } else if (a.type === 'flip' && st === 'targetFlip') {
        const c = cell(a.idx);
        if (!c || c.up) return { ok: false };

        // Décrémente d'un la cible consommée par ce retournement
        const pending = Math.max(0, (t.pendingTargets || 1) - 1);
        s.turn = { stage: 'targetFlip', pendingTargets: pending };

        revealAndChain(s, a.idx, ev);   // révèle + effets jokers en cascade (peut ajouter des pendingTargets)
        resolveAndEnd(s, ev);

    } else {
        return { ok: false };
    }
    return { ok: true, events: ev };
}

export function legalActions(s) {
    const p = s.players[s.cur], L = [], hid = [], all = [];
    p.grid.forEach((c, i) => { if (c) { all.push(i); if (!c.up) hid.push(i); } });
    if (s.phase === 'reveal') {
        if (p.rev < 2) hid.forEach(i => L.push({ type: 'flip', idx: i }));
        return L;
    }
    if (s.phase !== 'play') return L;
    const st = s.turn.stage;
    if (st === 'start') {
        if (s.deck.length || s.discard.length > 1) L.push({ type: 'draw' });
        if (s.discard.length) L.push({ type: 'takeDiscard' });
    } else if (st === 'holdDraw' || st === 'holdDiscard') {
        all.forEach(i => L.push({ type: 'swap', idx: i }));
        if (st === 'holdDraw' && hid.length) L.push({ type: 'discard' });
    } else if (st === 'mustFlip' || st === 'targetFlip') {
        hid.forEach(i => L.push({ type: 'flip', idx: i }));
    }
    return L;
}

/** Vue d'un joueur : cartes cachées masquées pour les adversaires. */
export function viewFor(s, seat) {
    return {
        n: s.n, me: seat, cur: s.cur, phase: s.phase, stage: s.turn.stage, mode: s.mode,
        drawn: s.turn.drawn ? { ...s.turn.drawn } : null,
        discard: s.discard.slice(), removed: s.removed.slice(), deckCount: s.deck.length,
        canDraw: s.deck.length > 0 || s.discard.length > 1, closer: s.closer, totals: s.totals.slice(),
        players: s.players.map((p, i) => ({
            grid: p.grid.map(c => (c ? (c.up || i === seat ? { up: true, v: c.v, joker: c.joker || null } : { up: false }) : null))
        }))
    };
}
