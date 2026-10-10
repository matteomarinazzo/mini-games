// ─── AI.JS ──────────────────────────────────────────────────────────────────
// IA volontairement simples et peu coûteuses : une décision O(1) à chaque NOUVELLE cellule.
// Chasse : voir findTarget()/huntDir() — les IA traquent les traînées (surtout celle du joueur).
// Cycle : « home » (dans son territoire) → « out » (excursion en 3 branches ≈ rectangle)
//         → « return » (retour vers sa base) → fermeture de la boucle (capture) → « home ».
// Les IA se déplacent en 4 directions (cap cardinal) ; elles évitent murs et leur propre traînée.
import { CONFIG } from './config.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const rint = (g, n) => (g.rng() * n) | 0;

export function aiInit(g, e) {
    e.homeX = e.cx; e.homeY = e.cy;                       // point de retour = centre de la base
    e.baseSpeed = CONFIG.aiSpeed * (0.9 + g.rng() * 0.2); // légère variété de vitesse
    e.speed = e.baseSpeed;
    e.needThink = true;
    e.aggr = CONFIG.aiAggroMin + g.rng() * (1 - CONFIG.aiAggroMin);   // agressivité propre à chaque IA
    e.ai = { state: 'home', leg: 0, travelled: 0, lens: [0, 0, 0], turn: 1, target: null };
    plan(g, e.ai);
    const d = DIRS[rint(g, 4)];
    setDir(e, d[0], d[1]);
}

// Plan d'excursion : branche 1 (L1) → tourne → branche 2 (L2) → tourne → branche 3 (> L1) qui revient.
function plan(g, a) {
    a.lens = [3 + rint(g, 6), 3 + rint(g, 5), 0];
    a.lens[2] = a.lens[0] + 2 + rint(g, 4);
    a.turn = g.rng() < 0.5 ? 1 : -1;
    a.leg = 0; a.travelled = 0;
}

// Change de cap. On recentre la coordonnée perpendiculaire dans la cellule courante
// (pas de changement de cellule) pour que le cube ne frotte pas les bords.
function setDir(e, dx, dy) {
    if (e.dirX === dx && e.dirY === dy) return;
    e.dirX = dx; e.dirY = dy;
    if (dx !== 0) e.y = e.cy + 0.5; else e.x = e.cx + 0.5;
}

// La cellule devant (dx,dy) est-elle « sûre » ? (jouable, pas notre traînée ; traînée adverse évitée
// à 90 % sur les 2 cellules devant : les IA restent éliminables sans se massacrer dès le départ)
function safe(g, e, dx, dy) {
    const nx = e.cx + dx, ny = e.cy + dy;
    if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) return false;
    const i = ny * g.W + nx;
    if (!g.ok[i]) return false;
    const t = g.trail[i];
    if (t === e.id) return false;
    if (t >= 0 && g.rng() < 0.9) return false;
    const fx = nx + dx, fy = ny + dy;
    if (fx >= 0 && fy >= 0 && fx < g.W && fy < g.H) {
        const t2 = g.trail[fy * g.W + fx];
        if (t2 >= 0 && t2 !== e.id && g.rng() < 0.9) return false;
    }
    return true;
}

// Longueur de piste jouable devant (plafonnée) : sert à choisir un cap dégagé.
function run(g, e, dx, dy) {
    let n = 0, x = e.cx, y = e.cy;
    while (n < 14) {
        x += dx; y += dy;
        if (x < 0 || y < 0 || x >= g.W || y >= g.H || !g.ok[y * g.W + x]) break;
        n++;
    }
    return n;
}

function bestDir(g, e, excludeCur) {
    let best = null, bs = -1;
    for (const d of DIRS) {
        if (excludeCur && d[0] === e.dirX && d[1] === e.dirY) continue;
        if (!safe(g, e, d[0], d[1])) continue;
        const sc = run(g, e, d[0], d[1]) + g.rng() * 6;
        if (sc > bs) { bs = sc; best = d; }
    }
    return best;
}

// ─── CHASSE ─────────────────────────────────────────────────────────────────
// Une IA qui voit la traînée d'un autre cube se met en chasse : toucher une traînée élimine son
// propriétaire. Cible = cellule de traînée ennemie la plus proche (distance de Manhattan) ; la traînée
// du JOUEUR est prioritaire (comptée comme 2× plus proche) et repérée de plus loin.
// Coût : on parcourt les traînées existantes (≤ quelques centaines de cellules) à chaque nouvelle cellule.
function findTarget(g, e) {
    let best = -1, bd = 1e9, owner = -1;
    if (g.time < CONFIG.aiGraceTime) return null;           // pas de chasse pendant les premières secondes
    // Nombre d'IA déjà lancées sur le joueur : au-delà du plafond, les autres ne le traquent pas
    // (sinon toute la carte converge sur sa traînée et il meurt en 2 s, quoi qu'il fasse).
    let onPlayer = 0;
    for (const o of g.ents) if (o !== e && o.alive && o.ai && o.ai.target && o.ai.target.owner === 0) onPlayer++;
    for (const o of g.ents) {
        if (o === e || !o.alive) continue;
        if (o.isPlayer && onPlayer >= CONFIG.aiMaxHunters) continue;
        const range = o.isPlayer ? CONFIG.aiHuntRangePlayer : CONFIG.aiHuntRange;
        const w = o.isPlayer ? 0.5 : 1;                      // priorité au joueur
        const t = o.trailCells;
        for (let k = 0; k < t.length; k++) {
            const c = t[k];
            const d = Math.abs((c % g.W) - e.cx) + Math.abs(((c / g.W) | 0) - e.cy);
            if (d <= range && d * w < bd) { bd = d * w; best = c; owner = o.id; }
        }
    }
    return best >= 0 ? { cell: best, owner } : null;
}

// Pas de chasse : se rapprocher de la cible en autorisant les traînées ennemies (c'est le but) mais
// jamais les murs ni sa propre traînée. Axe dominant d'abord, puis l'autre axe, puis un détour.
function huntDir(g, e, tx, ty) {
    const hx = tx - e.cx, hy = ty - e.cy;
    const cand = Math.abs(hx) >= Math.abs(hy)
        ? [[Math.sign(hx), 0], [0, Math.sign(hy)], [0, -Math.sign(hy) || 1], [-Math.sign(hx), 0]]
        : [[0, Math.sign(hy)], [Math.sign(hx), 0], [-Math.sign(hx) || 1, 0], [0, -Math.sign(hy)]];
    for (const d of cand) {
        if (!d[0] && !d[1]) continue;
        if (e.blocked && d[0] === e.dirX && d[1] === e.dirY) continue;
        const nx = e.cx + d[0], ny = e.cy + d[1];
        if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) continue;
        const i = ny * g.W + nx;
        if (!g.ok[i] || g.trail[i] === e.id) continue;     // mur / ma propre traînée
        return d;
    }
    return null;
}

export function aiThink(g, e) {
    const a = e.ai;
    const inOwn = g.own[e.cy * g.W + e.cx] === e.id;
    const hasTrail = e.trailCells.length > 0;
    let dx = e.dirX, dy = e.dirY;

    // --- CHASSE --- (cible encore valable ? sinon on en cherche une, selon l'agressivité de cette IA)
    if (a.target && g.trail[a.target.cell] !== a.target.owner) {
        a.target = null;                                   // proie morte, ou traînée refermée
        if (!inOwn) a.state = 'return';                    // coup réussi : on rentre refermer sa boucle
    }
    if (!a.target && g.rng() < e.aggr && e.trailCells.length < CONFIG.aiMaxTrail * 0.7) a.target = findTarget(g, e);
    if (a.target && e.trailCells.length >= CONFIG.aiMaxTrail * 0.7) a.target = null;   // trop exposée : retour
    if (a.target) {
        const tx = a.target.cell % g.W, ty = (a.target.cell / g.W) | 0;
        const d = huntDir(g, e, tx, ty);
        if (d) {
            e.speed = e.baseSpeed * (a.target.owner === 0 ? CONFIG.aiHuntBoost : 1);   // coup de turbo sur le joueur
            setDir(e, d[0], d[1]); return;
        }
        a.target = null;
    }
    e.speed = e.baseSpeed;

    if (inOwn && !hasTrail) {
        // Dans son territoire : on (re)prépare une excursion et on file vers la bordure.
        if (a.state !== 'home') { a.state = 'home'; plan(g, a); }
        if (e.blocked || !safe(g, e, dx, dy)) {
            const d = bestDir(g, e, e.blocked);
            if (d) { dx = d[0]; dy = d[1]; }
        }
    } else if (!inOwn) {
        if (a.state === 'home') { a.state = 'out'; a.leg = 0; a.travelled = 0; }
        else a.travelled += e.visits.length;
        if (e.trailCells.length > CONFIG.aiMaxTrail && a.state === 'out') a.state = 'return';

        if (a.state === 'out' && a.travelled >= a.lens[a.leg]) {
            a.leg++; a.travelled = 0;
            if (a.leg > 2) a.state = 'return';
            else { const t = a.turn; const ndx = -dy * t, ndy = dx * t; dx = ndx; dy = ndy; } // quart de tour
        }
        if (a.state === 'return') {
            if (g.counts[e.id] === 0) { a.state = 'out'; plan(g, a); }          // plus de territoire : errance
            else {
                const hx = e.homeX - e.cx, hy = e.homeY - e.cy;
                if (Math.abs(hx) + Math.abs(hy) <= 1) { a.state = 'out'; plan(g, a); } // base perdue : on repart
                else {
                    const cand = Math.abs(hx) >= Math.abs(hy)
                        ? [[Math.sign(hx), 0], [0, Math.sign(hy)]] : [[0, Math.sign(hy)], [Math.sign(hx), 0]];
                    for (const d of cand) {
                        if ((d[0] || d[1]) && safe(g, e, d[0], d[1])) { dx = d[0]; dy = d[1]; break; }
                    }
                }
            }
        }
        if (e.blocked || !safe(g, e, dx, dy)) {
            const d = bestDir(g, e, e.blocked);
            if (d) { dx = d[0]; dy = d[1]; }
        }
    }
    setDir(e, dx, dy);
}
