/**
 * Labyrinthe 3D – maze-map.js (V3)
 *
 * Module PUR (aucun DOM, localStorage ni réseau) :
 *   1. TRACE   – enregistrement léger du trajet du joueur (createTrail, addTrailPoint)
 *   2. CARTE   – vue de dessus de fin de partie (drawMap) : murs, chemin le plus court,
 *                trajet réel du joueur, départ et sortie.
 *
 * drawMap() reçoit un contexte 2D déjà configuré (setTransform fait par l'appelant, unités = pixels CSS)
 * → testable dans Node avec un faux contexte (voir maze-ui-tests.js).
 *
 * Repère : celui du monde (grille de blocs de toBlockGrid) ; 1 bloc = s pixels sur la carte.
 */
import { cellCenter } from './maze-engine.js';

// ─────────────────────────────────────────────
// 1. TRACE DU TRAJET
// ─────────────────────────────────────────────
export const TRAIL_STEP = 0.25;          // distance minimale entre deux points enregistrés (blocs)
export const TRAIL_MAX_POINTS = 3000;    // au-delà : on garde un point sur deux et on double le pas (mémoire bornée)

export const MAP_COLORS = {
    floor: '#041428', wall: '#2d6f9c',
    best: '#5bc8f5',      // chemin le plus court (cyan, couleur d'accent du site)
    trail: '#ffd166',     // trajet du joueur
    start: '#5ef5a0',     // départ (vert, comme la dalle du rendu 3D)
    exit: '#ff4d7d',      // sortie (rose, comme le pilier)
    ring: '#ffffff',
};

/** Nouvelle trace commençant en (x, y). `pts` est un tableau plat [x0, y0, x1, y1, …]. */
export function createTrail(x, y) {
    return { pts: [x, y], step: TRAIL_STEP };
}

/**
 * Ajoute (x, y) si le joueur s'est déplacé d'au moins `step` depuis le dernier point (ou si `force`).
 * @returns {boolean} true si un point a été ajouté
 */
export function addTrailPoint(trail, x, y, force = false) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const p = trail.pts, n = p.length;
    const dx = x - p[n - 2], dy = y - p[n - 1], d2 = dx * dx + dy * dy;
    if (force ? d2 === 0 : d2 < trail.step * trail.step) return false;
    p.push(x, y);
    if (p.length / 2 > TRAIL_MAX_POINTS) {
        const kept = [];
        for (let i = 0; i < p.length; i += 4) kept.push(p[i], p[i + 1]);   // un point sur deux
        kept.push(x, y);                                                    // le dernier point reste exact
        trail.pts = kept;
        trail.step *= 2;
    }
    return true;
}

// ─────────────────────────────────────────────
// 2. CARTE (vue de dessus)
// ─────────────────────────────────────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Échelle (pixels par bloc) et décalage pour faire tenir la grille dans w×h, centrée. */
export function mapLayout(w, h, grid) {
    const s = Math.min(w / grid.width, h / grid.height);
    return { s, ox: (w - grid.width * s) / 2, oy: (h - grid.height * s) / 2 };
}

/**
 * Dessine la vue de dessus.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w  largeur disponible (px CSS)
 * @param {number} h  hauteur disponible (px CSS)
 * @param {object} maze  labyrinthe (start, exit, path)
 * @param {{width,height,data}} grid  grille de blocs
 * @param {{pts:number[]}|null} trail  trajet du joueur
 * @param {{showTrail?:boolean, showBest?:boolean}} [opts]
 * @returns {{s:number, ox:number, oy:number}}
 */
export function drawMap(ctx, w, h, maze, grid, trail, opts = {}) {
    const { showTrail = true, showBest = true } = opts;
    const { s, ox, oy } = mapLayout(w, h, grid);
    const X = (wx) => ox + wx * s, Y = (wy) => oy + wy * s;
    const C = MAP_COLORS;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.floor;
    ctx.fillRect(ox, oy, grid.width * s, grid.height * s);

    // Murs : un seul tracé pour tous les blocs (rapide, même en 100×100)
    ctx.fillStyle = C.wall;
    ctx.beginPath();
    for (let by = 0; by < grid.height; by++) {
        for (let bx = 0; bx < grid.width; bx++) {
            if (grid.data[by * grid.width + bx] !== 0) ctx.rect(X(bx), Y(by), s + 0.5, s + 0.5);   // +0,5 : pas de fente entre blocs
        }
    }
    ctx.fill();

    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    if (showBest && maze.path && maze.path.length > 1) {    // chemin le plus court : centres des cellules du chemin unique
        ctx.beginPath();
        maze.path.forEach((c, i) => {
            const p = cellCenter(c);
            if (i === 0) ctx.moveTo(X(p.x), Y(p.y)); else ctx.lineTo(X(p.x), Y(p.y));
        });
        ctx.strokeStyle = C.best; ctx.lineWidth = clamp(s * 0.5, 2, 6); ctx.stroke();
    }

    if (showTrail && trail && trail.pts.length >= 4) {      // trajet réel, par-dessus et plus fin
        const p = trail.pts;
        ctx.beginPath();
        ctx.moveTo(X(p[0]), Y(p[1]));
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
        ctx.strokeStyle = C.trail; ctx.lineWidth = clamp(s * 0.25, 1.2, 3); ctx.stroke();
    }

    const r = clamp(s * 0.7, 3.5, 8);
    for (const [cell, color] of [[maze.start, C.start], [maze.exit, C.exit]]) {
        const p = cellCenter(cell);
        ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = C.ring; ctx.lineWidth = Math.max(1, r * 0.25); ctx.stroke();
    }
    return { s, ox, oy };
}
