/**
 * Labyrinthe 3D – maze-engine.js (V2)
 *
 * Moteur de jeu PUR (aucun DOM, localStorage ni réseau) : joueur, déplacement continu, collisions, arrivée.
 * Utilisable dans le navigateur (import ES) et dans Node (tests : maze-engine-tests.js).
 *
 * Repère du monde = repère de la « grille de blocs » de toBlockGrid() (maze-generator.js) :
 *   - 1 unité = 1 bloc ≈ 1 mètre ; le bloc (bx, by) occupe [bx, bx+1] × [by, by+1] ;
 *   - x croît vers l'est (droite), y vers le sud (bas) ; la cellule (x, y) du labyrinthe = bloc (2x+1, 2y+1) ;
 *   - angle 0 = regard vers l'est, +π/2 = vers le sud (rotation horaire vue de dessus) : tourner à DROITE = angle qui augmente.
 *
 * Organisation du fichier :
 *   1. CONFIG          – paramètres à ajuster
 *   2. GRILLE          – isWall(), cellCenter()
 *   3. JOUEUR          – createPlayer(), stepPlayer() (déplacement + collisions), atExit()
 */
import { DIRS } from './maze-generator.js';

// ─────────────────────────────────────────────
// 1. CONFIG
// ─────────────────────────────────────────────
export const PLAYER_R = 0.22;     // rayon de collision (couloir = 1 bloc de large : il reste 0,28 de chaque côté)
export const MOVE_SPEED = 2.4;    // avance (unités/s)
export const BACK_FACTOR = 0.6;   // le recul va à 60 % de la vitesse d'avance
export const TURN_SPEED = 2.2;    // rotation (rad/s) ≈ 126°/s
export const WIN_DIST = 0.4;      // distance au centre de la cellule de sortie qui déclenche la victoire
export const WALL_H = 1.2;        // hauteur des murs (rendu)
export const EYE_H = 0.55;        // hauteur des yeux (rendu)

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ─────────────────────────────────────────────
// 2. GRILLE
// ─────────────────────────────────────────────
/** true si le bloc (bx, by) est un mur ; tout ce qui est hors grille compte comme un mur. */
export function isWall(grid, bx, by) {
    if (bx < 0 || by < 0 || bx >= grid.width || by >= grid.height) return true;
    return grid.data[by * grid.width + bx] !== 0;
}

/** Centre (en coordonnées monde) de la cellule { x, y } du labyrinthe. */
export function cellCenter(c) {
    return { x: 2 * c.x + 1.5, y: 2 * c.y + 1.5 };
}

// ─────────────────────────────────────────────
// 3. JOUEUR
// ─────────────────────────────────────────────
/** Joueur au centre de la cellule de départ, tourné vers le premier passage ouvert (ordre N, E, S, W). */
export function createPlayer(maze) {
    const c = cellCenter(maze.start);
    const v = maze.cells[maze.start.y * maze.cols + maze.start.x];
    let angle = 0;
    for (const d of DIRS) {
        if (v & d.bit) { angle = Math.atan2(d.dy, d.dx); break; }
    }
    return { x: c.x, y: c.y, angle, walked: 0 };
}

/** Repousse le cercle du joueur hors des blocs-murs voisins (3×3). Plusieurs passes pour les angles. */
function resolve(p, grid) {
    const R = PLAYER_R;
    for (let pass = 0; pass < 3; pass++) {
        const cx = Math.floor(p.x), cy = Math.floor(p.y);
        for (let by = cy - 1; by <= cy + 1; by++) {
            for (let bx = cx - 1; bx <= cx + 1; bx++) {
                if (!isWall(grid, bx, by)) continue;
                const qx = clamp(p.x, bx, bx + 1), qy = clamp(p.y, by, by + 1);   // point du bloc le plus proche
                const dx = p.x - qx, dy = p.y - qy, d2 = dx * dx + dy * dy;
                if (d2 >= R * R) continue;
                if (d2 > 1e-12) {
                    const k = (R - Math.sqrt(d2)) / Math.sqrt(d2);
                    p.x += dx * k; p.y += dy * k;
                } else {   // centre à l'intérieur du bloc (ne devrait pas arriver) : sortie par la face la plus proche
                    const l = p.x - bx, r = bx + 1 - p.x, t = p.y - by, b = by + 1 - p.y, m = Math.min(l, r, t, b);
                    if (m === l) p.x = bx - R; else if (m === r) p.x = bx + 1 + R;
                    else if (m === t) p.y = by - R; else p.y = by + 1 + R;
                }
            }
        }
    }
}

/**
 * Fait avancer le joueur de dt secondes.
 * @param {{x,y,angle,walked}} p   joueur (modifié sur place)
 * @param {{width,height,data}} grid  grille de blocs (toBlockGrid)
 * @param {{turn:number, move:number}} input  turn : -1 gauche / 0 / +1 droite ; move : -1 recul / 0 / +1 avance
 * @param {number} dt  secondes
 */
export function stepPlayer(p, grid, input, dt) {
    p.angle += input.turn * TURN_SPEED * dt;
    if (p.angle > Math.PI) p.angle -= TAU; else if (p.angle <= -Math.PI) p.angle += TAU;
    if (!input.move) return;

    const v = input.move > 0 ? MOVE_SPEED : -MOVE_SPEED * BACK_FACTOR;
    const n = Math.max(1, Math.ceil(Math.abs(v * dt) / (PLAYER_R * 0.5)));   // sous-pas : jamais plus d'un demi-rayon par pas
    const sx = Math.cos(p.angle) * v * dt / n, sy = Math.sin(p.angle) * v * dt / n;
    for (let i = 0; i < n; i++) {
        const ox = p.x, oy = p.y;
        p.x += sx; p.y += sy;
        resolve(p, grid);
        p.walked += Math.hypot(p.x - ox, p.y - oy);
    }
}

/** true si le joueur est arrivé sur la cellule de sortie. */
export function atExit(maze, p) {
    const c = cellCenter(maze.exit);
    return Math.hypot(p.x - c.x, p.y - c.y) <= WIN_DIST;
}
