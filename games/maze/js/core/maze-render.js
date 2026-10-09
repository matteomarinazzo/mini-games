/**
 * Labyrinthe 3D – maze-render.js (V2)
 *
 * Rendu pseudo-3D à la première personne, sur un <canvas> 2D, sans moteur 3D.
 * Même principe que Ball Rush : projection perspective « maison » (focale F, point de fuite = horizonY)
 * et faces dessinées au peintre (du plus loin au plus proche). Ici la caméra peut pivoter librement :
 * chaque point est d'abord exprimé dans le repère de la caméra (x = latéral, h = hauteur, z = profondeur).
 *
 * La fonction drawScene() ne touche ni au DOM ni au canvas lui-même : elle reçoit un contexte 2D déjà
 * configuré (setTransform fait par l'appelant) → testable dans Node avec un faux contexte.
 *
 * Contenu dessiné (de l'arrière vers l'avant) : sol (dégradé + dalles), faces de murs et pilier de sortie triés
 * par distance. Le ciel (dégradé + étoiles) est fourni par la page, derrière le canvas ; les murs n'ont pas de plafond.
 */
import { WALL_H, EYE_H, isWall, cellCenter } from './maze-engine.js';

export const FOV = 72 * Math.PI / 180;   // champ de vision horizontal de référence
export const NEAR = 0.05;                // plan proche : tout ce qui est plus près est coupé
export const VIEW_RADIUS = 13;           // rayon d'affichage en blocs (au-delà : rien n'est dessiné)
const FOG_START = 3, FOG_END = 13;       // les surfaces lointaines se fondent dans l'obscurité
const PILLAR_HALF = 0.17, PILLAR_H = WALL_H * 0.85;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Paramètres de projection pour un canvas de W×H pixels CSS. */
export function computeView(W, H) {
    const F = Math.min(W * 0.5 / Math.tan(FOV / 2), H * 1.05);
    return { W, H, F, horizonY: H * 0.5 };
}

const fogK = (d) => clamp((d - FOG_START) / (FOG_END - FOG_START), 0, 1);
const hsl = (h, s, l, k) => `hsl(${h},${(s * (1 - 0.55 * k)).toFixed(0)}%,${(l * (1 - k) + 4 * k).toFixed(1)}%)`;

/**
 * Dessine une image du labyrinthe vue par le joueur.
 * @param {CanvasRenderingContext2D} ctx  contexte déjà mis à l'échelle (unités = pixels CSS)
 * @param {{W,H,F,horizonY}} view  voir computeView()
 * @param {{width,height,data}} grid  grille de blocs
 * @param {object} maze  labyrinthe (start, exit)
 * @param {{x,y,angle}} player
 * @param {number} t  temps en secondes (animation du pilier)
 * @returns {number} nombre de polygones dessinés (utile aux tests)
 */
export function drawScene(ctx, view, grid, maze, player, t = 0) {
    const { W, H, F, horizonY } = view;
    const px = player.x, py = player.y;
    const cos = Math.cos(player.angle), sin = Math.sin(player.angle);
    const camX = (wx, wy) => -(wx - px) * sin + (wy - py) * cos;   // latéral (+ = droite)
    const camZ = (wx, wy) => (wx - px) * cos + (wy - py) * sin;    // profondeur (+ = devant)
    let drawn = 0;

    ctx.clearRect(0, 0, W, H);

    // Sol : dégradé sous l'horizon + lueur d'horizon
    const gf = ctx.createLinearGradient(0, horizonY, 0, H);
    gf.addColorStop(0, '#07182c'); gf.addColorStop(1, '#020a18');
    ctx.fillStyle = gf; ctx.fillRect(0, horizonY, W, H - horizonY);
    const hg = ctx.createLinearGradient(0, horizonY - 50, 0, horizonY + 60);
    hg.addColorStop(0, 'rgba(91,200,245,0)'); hg.addColorStop(.5, 'rgba(91,200,245,.10)'); hg.addColorStop(1, 'rgba(91,200,245,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, horizonY - 50, W, 110);

    // Remplit un polygone donné en repère caméra [[x, h, z], …] : coupe au plan proche, projette, dessine
    function fillPoly(pts, fill, stroke) {
        const clipped = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const ina = a[2] >= NEAR, inb = b[2] >= NEAR;
            if (ina) clipped.push(a);
            if (ina !== inb) {
                const k = (NEAR - a[2]) / (b[2] - a[2]);
                clipped.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, NEAR]);
            }
        }
        if (clipped.length < 3) return;
        const sx = [], sy = [];
        let minX = Infinity, maxX = -Infinity;
        for (const c of clipped) {
            const x = W / 2 + F * c[0] / c[2];
            sx.push(x); sy.push(horizonY + (EYE_H - c[1]) * F / c[2]);
            if (x < minX) minX = x; if (x > maxX) maxX = x;
        }
        if (maxX < 0 || minX > W) return;   // entièrement hors écran (gauche ou droite)
        ctx.beginPath();
        ctx.moveTo(sx[0], sy[0]);
        for (let i = 1; i < sx.length; i++) ctx.lineTo(sx[i], sy[i]);
        ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
        drawn++;
    }

    // Face verticale entre deux points du plan (x0,y0)-(x1,y1), du sol à la hauteur top
    function wallFace(x0, y0, x1, y1, top, fill, stroke) {
        const ax = camX(x0, y0), az = camZ(x0, y0), bx = camX(x1, y1), bz = camZ(x1, y1);
        fillPoly([[ax, 0, az], [bx, 0, bz], [bx, top, bz], [ax, top, az]], fill, stroke);
    }

    const cx = Math.floor(px), cy = Math.floor(py), R = VIEW_RADIUS;
    const x0 = Math.max(0, cx - R), x1 = Math.min(grid.width - 1, cx + R);
    const y0 = Math.max(0, cy - R), y1 = Math.min(grid.height - 1, cy + R);
    const exitC = cellCenter(maze.exit), startC = cellCenter(maze.start);
    const faces = [];   // faces verticales à trier

    for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) {
            if (!isWall(grid, bx, by)) {
                // Sol : dalles en damier (départ vert, sortie rose)
                const mx = bx + 0.5, my = by + 0.5;
                const d = Math.hypot(mx - px, my - py);
                if (d > R || camZ(mx, my) < -0.72) continue;
                const k = fogK(d);
                let fill;
                if (bx === Math.floor(exitC.x) && by === Math.floor(exitC.y)) fill = hsl(345, 70, 30, k);
                else if (bx === Math.floor(startC.x) && by === Math.floor(startC.y)) fill = hsl(150, 50, 20, k);
                else fill = hsl(212, 50, ((bx + by) & 1) ? 17 : 13, k);
                const c = [[bx, by], [bx + 1, by], [bx + 1, by + 1], [bx, by + 1]]
                    .map(([wx, wy]) => [camX(wx, wy), 0, camZ(wx, wy)]);
                fillPoly(c, fill, null);
                continue;
            }
            // Mur : une face par côté donnant sur un bloc libre ET tourné vers la caméra
            const add = (ax, ay, bx2, by2, ns) => {
                const mx = (ax + bx2) / 2, my = (ay + by2) / 2;
                if (camZ(mx, my) < -0.51) return;   // face entièrement derrière la caméra
                faces.push({ d: Math.hypot(mx - px, my - py), ax, ay, bx: bx2, by: by2, ns });
            };
            if (by > 0 && !isWall(grid, bx, by - 1) && py < by) add(bx, by, bx + 1, by, true);               // nord
            if (!isWall(grid, bx, by + 1) && py > by + 1) add(bx, by + 1, bx + 1, by + 1, true);              // sud
            if (bx > 0 && !isWall(grid, bx - 1, by) && px < bx) add(bx, by, bx, by + 1, false);              // ouest
            if (!isWall(grid, bx + 1, by) && px > bx + 1) add(bx + 1, by, bx + 1, by + 1, false);            // est
        }
    }

    // Pilier lumineux de la cellule de sortie (4 faces, visible seulement en ligne de vue)
    const pe = PILLAR_HALF, ex = exitC.x, ey = exitC.y;
    const pulse = 55 + 12 * Math.sin(t * 4);
    const pil = (ax, ay, bx2, by2, vis) => {
        if (!vis) return;
        const mx = (ax + bx2) / 2, my = (ay + by2) / 2;
        if (camZ(mx, my) < -0.51) return;
        faces.push({ d: Math.hypot(mx - px, my - py), ax, ay, bx: bx2, by: by2, pillar: true });
    };
    pil(ex - pe, ey - pe, ex + pe, ey - pe, py < ey - pe);
    pil(ex - pe, ey + pe, ex + pe, ey + pe, py > ey + pe);
    pil(ex - pe, ey - pe, ex - pe, ey + pe, px < ex - pe);
    pil(ex + pe, ey - pe, ex + pe, ey + pe, px > ex + pe);

    faces.sort((a, b) => b.d - a.d);   // du plus loin au plus proche
    for (const f of faces) {
        const k = fogK(f.d);
        if (f.pillar) wallFace(f.ax, f.ay, f.bx, f.by, PILLAR_H, hsl(345, 90, pulse, k), 'rgba(255,255,255,.35)');
        else wallFace(f.ax, f.ay, f.bx, f.by, WALL_H, f.ns ? hsl(198, 70, 46, k) : hsl(205, 70, 34, k),
            `rgba(255,255,255,${(0.18 * (1 - k)).toFixed(2)})`);
    }
    return drawn;
}
