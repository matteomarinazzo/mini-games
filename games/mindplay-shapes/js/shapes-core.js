/**
 * Mindplay : Formes – shapes-core.js
 *
 * Module PUR (aucun DOM, localStorage ni réseau) : formes (contours seuls, sans couleur), difficulté,
 * génération des compositions (formes qui se chevauchent au hasard, toujours en une seule figure), validation avec tolérance,
 * durées d'observation, score et outils de records.
 * Utilisable dans le navigateur (import ES) et dans Node (tests : shapes-tests.js).
 *
 * Repère : le plateau est un carré de 100 × 100 unités, x vers la droite, y vers le bas.
 * Une forme = { type, x, y, size, rot } :
 *   - (x, y)  centre de la forme (pivot de la rotation) ;
 *   - size    largeur de la forme (1 unité de dessin = size unités du plateau) ;
 *   - rot     rotation en degrés, sens horaire, ramenée dans [-180, 180).
 *
 * Organisation du fichier :
 *   1. CONFIG        – paramètres à ajuster
 *   2. FORMES        – dessins et polygones (repère normalisé), symétries, géométrie de contact
 *   3. DIFFICULTÉ    – nombre de formes, durées, paliers
 *   4. GÉNÉRATION    – composition cible : une seule grande figure de formes qui se chevauchent
 *   5. VALIDATION    – appariement + tolérances + score
 *   6. RECORDS       – comparaison niveau puis durée, formats
 */

// ─────────────────────────────────────────────
// 1. CONFIG
// ─────────────────────────────────────────────
export const BOARD = 100;                  // côté du plateau (unités)
export const GRID_STEP = 10;               // pas de la grille de repères dessinée sur le plateau (unités)
export const START_SHAPES = 3;             // formes au niveau 1
export const MAX_SHAPES = 20;              // plafond de formes par composition (lisibilité sur mobile)
export const ROUNDS_PER_LEVEL = 2;         // manches par niveau
export const SHOW_MS_PER_SHAPE = [1000, 500];   // observation par forme : manche 1, manche 2
export const START_LIVES = 3;              // vies au début de chaque manche
export const MAX_GUESS_SHAPES = 30;        // formes que le joueur peut poser au maximum
export const SIZE_MIN = 7, SIZE_MAX = 46;  // bornes de taille d'une forme (unités)

// Tolérances de validation (une petite différence est acceptée, une erreur importante non)
export const TOL = {
    posFrac: 0.4,     // position : écart de centre ≤ 40 % de la taille de la forme cible…
    posMin: 6,        // …mais jamais moins de 6 unités (6 % du plateau)
    size: 0.3,        // taille : ±30 %
    rot: 22,          // rotation : ±22° (modulo la symétrie de la forme)
};

const TAU_DEG = 360;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ─────────────────────────────────────────────
// 2. FORMES
// ─────────────────────────────────────────────
// Dessins dans un repère centré, de largeur 1 (contours seuls : aucune couleur). `period` = angle de symétrie
// en degrés (0 : le cercle est identique quelle que soit la rotation ; 360 : aucune symétrie).
// `rad` = rayon (pour une taille de 1) du plus petit cercle centré contenant la forme.
// `poly` = le même contour en polygone, pour calculer les contacts entre formes (génération et tests).
const fmtPts = (pts) => pts.map(p => p.map(v => v.toFixed(4)).join(',')).join(' ');
const starPts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 0.5 : 0.21, a = (-90 + i * 36) * Math.PI / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
});
const star = `<polygon points="${fmtPts(starPts)}"/>`;
const circlePts = Array.from({ length: 24 }, (_, i) => [0.5 * Math.cos(i * Math.PI / 12), 0.5 * Math.sin(i * Math.PI / 12)]);
const halfPts = Array.from({ length: 17 }, (_, i) => {          // arc de (-.5,.25) à (.5,.25) en passant par (0,-.25)
    const a = Math.PI + i * Math.PI / 16;
    return [0.5 * Math.cos(a), 0.25 + 0.5 * Math.sin(a)];
});
const crossPts = [[-.17, -.5], [.17, -.5], [.17, -.17], [.5, -.17], [.5, .17], [.17, .17], [.17, .5], [-.17, .5], [-.17, .17], [-.5, .17], [-.5, -.17], [-.17, -.17]];

export const TYPES = [
    { id: 'circle', name: 'Cercle', period: 0, rad: 0.5, svg: '<circle r=".5"/>', poly: circlePts },
    { id: 'square', name: 'Carré', period: 90, rad: 0.7071, svg: '<rect x="-.5" y="-.5" width="1" height="1" rx=".05"/>', poly: [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]] },
    { id: 'triangle', name: 'Triangle', period: 120, rad: 0.5774, svg: '<polygon points="0,-.5774 .5,.2887 -.5,.2887"/>', poly: [[0, -.5774], [.5, .2887], [-.5, .2887]] },
    { id: 'rect', name: 'Rectangle', period: 180, rad: 0.559, svg: '<rect x="-.5" y="-.25" width="1" height=".5" rx=".04"/>', poly: [[-.5, -.25], [.5, -.25], [.5, .25], [-.5, .25]] },
    { id: 'hexagon', name: 'Hexagone', period: 60, rad: 0.5, svg: '<polygon points=".5,0 .25,.433 -.25,.433 -.5,0 -.25,-.433 .25,-.433"/>', poly: [[.5, 0], [.25, .433], [-.25, .433], [-.5, 0], [-.25, -.433], [.25, -.433]] },
    { id: 'star', name: 'Étoile', period: 72, rad: 0.5, svg: star, poly: starPts },
    { id: 'cross', name: 'Croix', period: 90, rad: 0.53, svg: `<polygon points="${fmtPts(crossPts)}"/>`, poly: crossPts },
    { id: 'half', name: 'Demi-disque', period: 360, rad: 0.559, svg: '<path d="M-.5 .25A.5 .5 0 0 1 .5 .25Z"/>', poly: halfPts }
];
export const typeById = (id) => TYPES.find(t => t.id === id);

/** Angle ramené dans [-180, 180). */
export function normAngle(a) {
    return ((a + 180) % TAU_DEG + TAU_DEG) % TAU_DEG - 180;
}

/** Écart angulaire minimal (0 … period/2) entre deux rotations, modulo la symétrie de la forme. */
export function rotDiff(type, a, b) {
    const t = typeof type === 'string' ? typeById(type) : type;
    if (!t || t.period === 0) return 0;
    let d = Math.abs(a - b) % t.period;
    if (d > t.period / 2) d = t.period - d;
    return d;
}

// Géométrie de contact : contour d'une forme posée sur le plateau, et écart entre deux contours.
/** Contour (polygone) d'une forme dans le repère du plateau. */
export function shapePoly(s) {
    const t = typeById(s.type), a = s.rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    return t.poly.map(([px, py]) => [s.x + (px * c - py * sn) * s.size, s.y + (px * sn + py * c) * s.size]);
}

const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segsCross = (p1, p2, p3, p4) => orient(p3, p4, p1) * orient(p3, p4, p2) < 0 && orient(p1, p2, p3) * orient(p1, p2, p4) < 0;

function pointSegDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function inPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

/** Distance minimale entre deux contours (0 s'ils se croisent ou si l'un contient l'autre). */
export function polyGap(A, B) {
    for (let i = 0; i < A.length; i++) {
        const a1 = A[i], a2 = A[(i + 1) % A.length];
        for (let j = 0; j < B.length; j++) if (segsCross(a1, a2, B[j], B[(j + 1) % B.length])) return 0;
    }
    if (inPoly(A[0], B) || inPoly(B[0], A)) return 0;
    let d = Infinity;
    for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
        d = Math.min(d, pointSegDist(A[i], B[j], B[(j + 1) % B.length]), pointSegDist(B[j], A[i], A[(i + 1) % A.length]));
    }
    return d;
}

/** Écart minimal entre les contours de deux formes (0 : elles se touchent ou se chevauchent). */
export const shapeGap = (a, b) => polyGap(shapePoly(a), shapePoly(b));

/** Vrai si la forme `inner` est entièrement à l'intérieur de la forme `outer`. */
export function shapeContains(outer, inner) {
    const O = shapePoly(outer), I = shapePoly(inner);
    if (!I.every(p => inPoly(p, O))) return false;
    for (let i = 0; i < I.length; i++) for (let j = 0; j < O.length; j++) {
        if (segsCross(I[i], I[(i + 1) % I.length], O[j], O[(j + 1) % O.length])) return false;
    }
    return true;
}

// ─────────────────────────────────────────────
// 3. DIFFICULTÉ
// ─────────────────────────────────────────────
/** Nombre de formes du niveau (3, 4, 5…), plafonné à MAX_SHAPES. */
export const shapeCount = (level) => Math.min(MAX_SHAPES, START_SHAPES + level - 1);

/** Durée d'observation en ms : nombre de formes × durée par forme de la manche (1 s, puis 0,5 s). */
export function showMs(level, round) {
    const per = SHOW_MS_PER_SHAPE[round - 1] ?? SHOW_MS_PER_SHAPE[SHOW_MS_PER_SHAPE.length - 1];
    return shapeCount(level) * per;
}

/** Taille de base d'une forme pour n formes sur le plateau (plus il y en a, plus elles sont petites mais restent tactiles). */
export const baseSize = (n) => clamp(26 - 0.9 * n, 14, 22);

/**
 * Palier de difficulté d'un niveau :
 *   types    – nombre de types de formes disponibles (3 au début, 8 au niveau 11)
 *   sizeVar  – variation de taille (±) : aucune aux niveaux 1-2, jusqu'à ±45 %
 *   rotStep  – pas des rotations tirées : 0 (aucune) → 90° → 45° → 15° → 5°
 */
export function tierFor(level) {
    const L = Math.max(1, level);
    return {
        types: Math.min(TYPES.length, 3 + Math.floor((L - 1) / 2)),
        sizeVar: clamp((L - 2) * 0.07, 0, 0.45),
        rotStep: L < 3 ? 0 : L < 5 ? 90 : L < 8 ? 45 : L < 12 ? 15 : 5
    };
}

// ─────────────────────────────────────────────
// 4. GÉNÉRATION
// ─────────────────────────────────────────────
const rndInt = (rng, n) => Math.floor(rng() * n);

function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {          // Fisher-Yates
        const j = rndInt(rng, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export const radiusOf = (s) => typeById(s.type).rad * s.size;

const MARGIN = 2;          // marge entre la figure et le bord du plateau (unités)
const MIN_CENTER = 5;      // écart minimal visé entre les centres de deux formes (évite deux formes quasi confondues)
const NEST_CHANCE = 0.35;  // part des formes imbriquées : entièrement dans une autre, ou englobant une autre (0 : aucune)
const NEST_MAX = 38;       // taille maximale d'une forme qui en englobe une autre
const NEST_MIN_GAP = 1.5;  // écart minimal entre le centre d'une forme imbriquée et les autres centres

/**
 * Place `s` à l'intérieur d'une forme existante (sa taille est réduite jusqu'à y tenir entièrement) ou autour d'elle
 * (sa taille est augmentée jusqu'à l'englober). Renvoie false si ça ne tient pas : la forme est alors placée normalement.
 */
function nest(s, placed, rng) {
    const o = placed[rndInt(rng, placed.length)], inside = rng() < 0.5;
    for (let k = 0; k < 25; k++) {
        const f = inside ? 0.6 : 0.3;
        const x = o.s.x + (rng() * 2 - 1) * o.r * f, y = o.s.y + (rng() * 2 - 1) * o.r * f;
        if (placed.some(q => Math.hypot(q.s.x - x, q.s.y - y) < NEST_MIN_GAP)) continue;
        if (inside && !inPoly([x, y], o.poly)) continue;
        const t = { ...s, x, y };
        if (inside) { while (t.size >= SIZE_MIN && !shapeContains(o.s, t)) t.size *= 0.92; if (t.size < SIZE_MIN) continue; }
        else { while (t.size <= NEST_MAX && !shapeContains(t, o.s)) t.size *= 1.08; if (t.size > NEST_MAX) continue; }
        s.x = x; s.y = y; s.size = t.size;
        return true;
    }
    return false;
}

/**
 * Assemble les formes `specs` en une seule figure connexe, au hasard : chaque nouvelle forme a son centre à l'intérieur
 * d'une forme déjà posée (tirée au sort), donc elle la chevauche réellement : elle la croise plus ou moins. Une partie des
 * formes est imbriquée (voir `nest`) : entièrement dans une autre, ou autour d'une autre. Une forme peut aussi en recouper plusieurs.
 */
function buildCluster(specs, rng) {
    const placed = [];
    for (const sp of specs) {
        const s = { type: sp.type, x: 0, y: 0, size: sp.size, rot: sp.rot };
        if (placed.length && !(rng() < NEST_CHANCE && nest(s, placed, rng))) {
            let fallback = null, done = false;
            for (let k = 0; k < 400 && !done; k++) {
                // Ancrage : souvent l'une des dernières formes posées, pour que la figure s'étire au lieu de former un amas
                const o = placed[rng() < 0.6 ? placed.length - 1 - rndInt(rng, Math.min(3, placed.length)) : rndInt(rng, placed.length)];
                const x = o.s.x + (rng() * 2 - 1) * o.r, y = o.s.y + (rng() * 2 - 1) * o.r;
                if (!inPoly([x, y], o.poly)) continue;                       // centre dans la forme choisie : chevauchement garanti
                const d = Math.min(...placed.map(q => Math.hypot(q.s.x - x, q.s.y - y)));
                if (!fallback || d > fallback.d) fallback = { x, y, d };     // à défaut : le tirage le plus écarté des autres centres
                if (d >= MIN_CENTER) { done = true; break; }
            }
            if (fallback) { s.x = fallback.x; s.y = fallback.y; } else { s.x = placed[0].s.x + 1; s.y = placed[0].s.y; }
        }
        placed.push({ s, r: radiusOf(s), poly: shapePoly(s) });
    }
    return placed.map(o => o.s);
}

/** Rectangle englobant (par cercles englobants : la forme tient dans le plateau quelle que soit sa rotation). */
function extent(comp) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of comp) {
        const r = radiusOf(s);
        x0 = Math.min(x0, s.x - r); x1 = Math.max(x1, s.x + r);
        y0 = Math.min(y0, s.y - r); y1 = Math.max(y1, s.y + r);
    }
    return { x0, y0, x1, y1, span: Math.max(x1 - x0, y1 - y0) };
}

/**
 * Composition cible du niveau `level` : tableau de formes dans le plateau.
 * Les formes se chevauchent au hasard (croisées, l'une dans l'autre, plusieurs les unes dans les autres…) et composent
 * ainsi une seule grande figure, entièrement dans le plateau, à une position aléatoire.
 * @param {number} level
 * @param {() => number} [rng] générateur dans [0, 1[ (Math.random par défaut ; injectable pour les tests)
 */
export function generateComposition(level, rng = Math.random) {
    const n = shapeCount(level), tier = tierFor(level), base = baseSize(n);
    const pool = TYPES.slice(0, tier.types).map(t => t.id);
    const ids = [];
    while (ids.length < n) ids.push(...shuffle(pool.slice(), rng));   // variété : chaque type revient à tour de rôle
    ids.length = n;

    const specs = shuffle(ids, rng).map(type => ({
        type,
        size: base * (1 + (rng() * 2 - 1) * tier.sizeVar),
        rot: tier.rotStep ? normAngle(rndInt(rng, Math.round(TAU_DEG / tier.rotStep)) * tier.rotStep) : 0
    }));

    // Plusieurs assemblages : on garde le premier qui tient dans le plateau, sinon le plus compact (réduit au besoin)
    const room = BOARD - 2 * MARGIN;
    let best = null, bestSpan = Infinity;
    for (let attempt = 0; attempt < 40; attempt++) {
        const comp = buildCluster(specs, rng), { span } = extent(comp);
        if (span < bestSpan) { best = comp; bestSpan = span; }
        if (span <= room) break;
    }
    {   // Figure trop petite pour le plateau : agrandissement uniforme (proportions et chevauchements conservés)
        const e = extent(best), want = room * (0.6 + 0.3 * rng()), biggest = Math.max(...best.map(s => s.size));
        const f = Math.min(want / e.span, 39.9 / biggest), cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2;
        if (f > 1) {
            for (const s of best) { s.x = cx + (s.x - cx) * f; s.y = cy + (s.y - cy) * f; s.size *= f; }
            bestSpan = e.span * f;
        }
    }
    if (bestSpan > room) {                                  // réduction uniforme : les proportions sont conservées
        const e = extent(best), f = room / bestSpan, cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2;
        for (const s of best) { s.x = cx + (s.x - cx) * f; s.y = cy + (s.y - cy) * f; s.size *= f; }
    }
    const e = extent(best);
    const dx = MARGIN - e.x0 + rng() * Math.max(0, room - (e.x1 - e.x0));
    const dy = MARGIN - e.y0 + rng() * Math.max(0, room - (e.y1 - e.y0));
    for (const s of best) { s.x += dx; s.y += dy; }
    return best;
}

// ─────────────────────────────────────────────
// 5. VALIDATION
// ─────────────────────────────────────────────
/** Écarts normalisés (1 = limite de tolérance) entre une forme cible et une forme posée du même type. */
export function compareShapes(t, g, tol = TOL) {
    const posTol = Math.max(tol.posMin, tol.posFrac * t.size);
    const posErr = Math.hypot(t.x - g.x, t.y - g.y);
    const sizeErr = Math.abs(g.size / t.size - 1);
    const rotErr = rotDiff(t.type, t.rot, g.rot);
    const rotN = typeById(t.type).period === 0 ? 0 : rotErr / tol.rot;
    const posN = posErr / posTol, sizeN = sizeErr / tol.size;
    return {
        posErr, sizeErr, rotErr, posN, sizeN, rotN,
        ok: posN <= 1 && sizeN <= 1 && rotN <= 1,
        cost: posN + sizeN + rotN
    };
}

/**
 * Compare la reconstitution du joueur à la cible.
 * Chaque forme posée est appariée à la forme cible de même type la plus proche (appariement glouton sur l'écart total),
 * donc l'ordre de pose n'a pas d'importance et deux formes identiques sont interchangeables.
 * @returns {{ok:boolean, countOk:boolean, pairs:object[], missing:number[], extra:number[], quality:number}}
 *   pairs : [{ ti, gi, ok, …écarts }] ; missing : index cibles non couvertes ; extra : index posés en trop ;
 *   quality : 0…1 (1 = reconstitution parfaite), sert au score.
 */
export function evaluate(target, guess, tol = TOL) {
    const cand = [];
    target.forEach((t, ti) => guess.forEach((g, gi) => {
        if (t.type === g.type) cand.push({ ti, gi, ...compareShapes(t, g, tol) });
    }));
    cand.sort((a, b) => a.cost - b.cost);
    const usedT = new Set(), usedG = new Set(), pairs = [];
    for (const c of cand) {
        if (usedT.has(c.ti) || usedG.has(c.gi)) continue;
        usedT.add(c.ti); usedG.add(c.gi); pairs.push(c);
    }
    const missing = target.map((_, i) => i).filter(i => !usedT.has(i));
    const extra = guess.map((_, i) => i).filter(i => !usedG.has(i));
    const countOk = target.length === guess.length;
    const ok = countOk && missing.length === 0 && extra.length === 0 && pairs.every(p => p.ok);
    let q = 0;
    for (const p of pairs) q += 1 - clamp((p.posN + p.sizeN + p.rotN) / 3, 0, 1);
    const quality = target.length ? q / Math.max(target.length, guess.length) : 0;
    return { ok, countOk, pairs, missing, extra, quality };
}

/** Score d'une manche réussie : 60 à 100 points par forme selon la précision. */
export const roundScore = (n, quality) => Math.round(n * (60 + 40 * clamp(quality, 0, 1)));

// ─────────────────────────────────────────────
// 6. RECORDS (outils)
// ─────────────────────────────────────────────
// Un record = { level, duration }. Classement : niveau le plus haut, puis durée la plus courte.
export const ZERO = { level: 0, duration: 0 };

export function normRecord(r) {
    if (r && typeof r === 'object') return { level: Number(r.level) || 0, duration: Number(r.duration) || 0 };
    return { ...ZERO };
}

// Format Firebase : { value: niveau, duration, message, timestamp } (ou simple nombre)
export function parseRemote(data) {
    if (data && typeof data === 'object') return { level: Number(data.value) || 0, duration: Number(data.duration) || 0 };
    if (typeof data === 'number') return { level: data, duration: 0 };
    return { ...ZERO };
}

export function isBetter(a, b) {
    if (a.level <= 0) return false;
    if (b.level <= 0) return true;
    return a.level > b.level || (a.level === b.level && a.duration < b.duration);
}

const pad2 = (n) => String(n).padStart(2, '0');
export function fmtDuration(ms) {
    const tenths = Math.floor(ms / 100);
    const totalSec = Math.floor(tenths / 10);
    return `${Math.floor(totalSec / 60)}:${pad2(totalSec % 60)},${tenths % 10}`;
}
export function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}
export const fmtRecord = (rec) => rec.level > 0 ? `Niveau ${rec.level} · ${fmtDuration(rec.duration)}` : '—';
export const fmtSec = (ms) => String(ms / 1000).replace('.', ',');
