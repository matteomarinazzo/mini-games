/**
 * Labyrinthe 3D – maze-generator.js
 *
 * Module PUR (aucun accès DOM, localStorage ni réseau) : générateur et vérificateur de labyrinthe.
 * Utilisable tel quel dans le navigateur (import ES) et dans Node (tests).
 *
 * Organisation du fichier :
 *   1. CONSTANTES        – directions, bornes de taille
 *   2. ALÉATOIRE         – PRNG à graine (reproductible)
 *   3. GÉNÉRATION        – generateMaze()  (parcours en profondeur itératif = « arbre couvrant parfait »)
 *   4. VÉRIFICATION      – verifyMaze()    (indépendante du générateur)
 *   5. UTILITAIRES       – toBlockGrid(), toAscii(), hasPassage()
 *
 * Modèle de données (objet « maze ») :
 *   cols, rows : dimensions en cellules
 *   cells      : Uint8Array(cols*rows), index = y*cols + x.
 *                Chaque octet est un masque de bits des PASSAGES OUVERTS depuis la cellule : N=1, E=2, S=4, W=8.
 *                Un passage est toujours symétrique (E de A ⇔ W de la cellule à droite de A).
 *   start/exit : { x, y }
 *   path       : [{x,y}, …] chemin unique start → exit (inclus)
 *   seed       : entier 32 bits non signé ayant produit ce labyrinthe (même options + même graine = même labyrinthe)
 *   algorithm  : nom de l'algorithme utilisé
 *
 * Pourquoi un labyrinthe « parfait » ? Une grille dont les passages forment un ARBRE couvrant est
 * connexe (aucune cellule inaccessible) et sans cycle (un seul chemin entre deux cellules quelconques).
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────
export const N = 1, E = 2, S = 4, W = 8;

// Ordre fixe : N, E, S, W (ne pas changer : la reproductibilité par graine en dépend)
export const DIRS = [
    { bit: N, opp: S, dx: 0, dy: -1 },
    { bit: E, opp: W, dx: 1, dy: 0 },
    { bit: S, opp: N, dx: 0, dy: 1 },
    { bit: W, opp: E, dx: -1, dy: 0 },
];

export const MIN_SIZE = 2;     // cellules par côté (minimum)
export const MAX_SIZE = 100;   // cellules par côté (maximum, garde-fou mémoire / temps)
export const ALGORITHM = 'recursive-backtracker';

// ─────────────────────────────────────────────
// 2. ALÉATOIRE (mulberry32 : 32 bits, entiers uniquement → même suite sur tous les moteurs JS)
// ─────────────────────────────────────────────
export function createRng(seed) {
    let a = seed >>> 0;
    return function rng() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;   // [0, 1)
    };
}

// ─────────────────────────────────────────────
// 3. GÉNÉRATION
// ─────────────────────────────────────────────
function checkSize(v, name) {
    if (!Number.isInteger(v) || v < MIN_SIZE || v > MAX_SIZE) {
        throw new RangeError(`${name} doit être un entier entre ${MIN_SIZE} et ${MAX_SIZE} (reçu : ${v})`);
    }
}

function checkCell(c, cols, rows, name) {
    if (!c || !Number.isInteger(c.x) || !Number.isInteger(c.y) || c.x < 0 || c.y < 0 || c.x >= cols || c.y >= rows) {
        throw new RangeError(`${name} doit être une cellule { x, y } dans la grille ${cols}×${rows}`);
    }
}

/** Parcours en largeur depuis startIdx : distances (en pas) et parent de chaque cellule. */
function bfs(cells, cols, rows, startIdx) {
    const total = cols * rows;
    const dist = new Int32Array(total).fill(-1);
    const parent = new Int32Array(total).fill(-1);
    const queue = new Int32Array(total);
    let head = 0, tail = 0;
    dist[startIdx] = 0; queue[tail++] = startIdx;
    while (head < tail) {
        const cur = queue[head++];
        const cx = cur % cols, cy = (cur / cols) | 0;
        for (let d = 0; d < 4; d++) {
            if (!(cells[cur] & DIRS[d].bit)) continue;
            const nIdx = (cy + DIRS[d].dy) * cols + (cx + DIRS[d].dx);
            if (dist[nIdx] !== -1) continue;
            dist[nIdx] = dist[cur] + 1; parent[nIdx] = cur; queue[tail++] = nIdx;
        }
    }
    return { dist, parent };
}

/**
 * Génère un labyrinthe parfait.
 *
 * @param {object}  [options]
 * @param {number}  [options.cols=15]   largeur en cellules (entier, MIN_SIZE..MAX_SIZE)
 * @param {number}  [options.rows=15]   hauteur en cellules (entier, MIN_SIZE..MAX_SIZE)
 * @param {number}  [options.seed]      graine ; si absente, tirée au hasard (renvoyée dans le résultat)
 * @param {{x:number,y:number}} [options.start={x:0,y:0}]  cellule de départ
 * @param {'farthest'|'opposite'|{x:number,y:number}} [options.exit='farthest']
 *        'farthest' : cellule la plus éloignée du départ (en pas) ; 'opposite' : coin opposé de la grille ;
 *        ou une cellule explicite. La sortie est toujours différente du départ (sinon RangeError).
 * @returns {object} maze (voir l'en-tête du fichier)
 * @throws {RangeError} options invalides
 */
export function generateMaze(options = {}) {
    const { cols = 15, rows = 15, start = { x: 0, y: 0 }, exit: exitOpt = 'farthest' } = options;
    checkSize(cols, 'cols');
    checkSize(rows, 'rows');
    checkCell(start, cols, rows, 'start');

    let seed = options.seed;
    if (seed === undefined || seed === null) seed = (Math.random() * 4294967296) >>> 0;
    else if (!Number.isFinite(seed)) throw new RangeError(`seed doit être un nombre fini (reçu : ${seed})`);
    else seed = seed >>> 0;

    const rng = createRng(seed);
    const total = cols * rows;
    const cells = new Uint8Array(total);
    const visited = new Uint8Array(total);
    const stack = new Int32Array(total);   // jamais plus de `total` éléments : pas de récursion
    const cand = [0, 0, 0, 0];
    const startIdx = start.y * cols + start.x;

    // Parcours en profondeur itératif (« recursive backtracker »)
    let sp = 0;
    visited[startIdx] = 1; stack[sp++] = startIdx;
    while (sp > 0) {
        const cur = stack[sp - 1];
        const cx = cur % cols, cy = (cur / cols) | 0;
        let n = 0;
        for (let d = 0; d < 4; d++) {
            const nx = cx + DIRS[d].dx, ny = cy + DIRS[d].dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            if (!visited[ny * cols + nx]) cand[n++] = d;
        }
        if (n === 0) { sp--; continue; }               // cul-de-sac : on revient en arrière
        const d = cand[(rng() * n) | 0];
        const nIdx = (cy + DIRS[d].dy) * cols + (cx + DIRS[d].dx);
        cells[cur] |= DIRS[d].bit;                      // on ouvre le mur dans les deux sens
        cells[nIdx] |= DIRS[d].opp;
        visited[nIdx] = 1;
        stack[sp++] = nIdx;
    }

    // Sortie
    const { dist, parent } = bfs(cells, cols, rows, startIdx);
    let exitCell;
    if (exitOpt === 'farthest') {
        let best = -1, bestIdx = startIdx;
        for (let i = 0; i < total; i++) if (dist[i] > best) { best = dist[i]; bestIdx = i; }   // 1er maximum rencontré
        exitCell = { x: bestIdx % cols, y: (bestIdx / cols) | 0 };
    } else if (exitOpt === 'opposite') {
        exitCell = { x: cols - 1, y: rows - 1 };
    } else {
        checkCell(exitOpt, cols, rows, 'exit');
        exitCell = { x: exitOpt.x, y: exitOpt.y };
    }
    if (exitCell.x === start.x && exitCell.y === start.y) {
        throw new RangeError('La sortie doit être différente du départ');
    }

    // Chemin unique départ → sortie (remonte les parents du BFS)
    const path = [];
    for (let i = exitCell.y * cols + exitCell.x; i !== -1; i = parent[i]) path.push({ x: i % cols, y: (i / cols) | 0 });
    path.reverse();

    return {
        cols, rows, cells,
        start: { x: start.x, y: start.y },
        exit: exitCell,
        path, seed, algorithm: ALGORITHM,
    };
}

// ─────────────────────────────────────────────
// 4. VÉRIFICATION (n'utilise que cols, rows, cells, start, exit et, si présent, path)
// ─────────────────────────────────────────────
const popcount4 = (v) => (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1) + ((v >> 3) & 1);

/**
 * Vérifie qu'un labyrinthe est valide. Indépendante de generateMaze : elle recalcule tout.
 *
 * Contrôles :
 *  1. structure : dimensions, taille et valeurs de `cells`, aucun passage vers l'extérieur,
 *     symétrie de chaque passage ;
 *  2. départ et sortie : dans la grille et distincts ;
 *  3. connexité : toutes les cellules sont atteignables depuis le départ (donc la sortie aussi) ;
 *  4. absence de cycle : nombre de passages = cellules − 1 ET aucun passage « hors arbre » rencontré
 *     pendant le parcours. Connexe + sans cycle = arbre = chemin UNIQUE entre deux cellules quelconques
 *     (contrôle plus fort que le strict besoin « un seul chemin départ → sortie ») ;
 *  5. si `maze.path` existe, il doit égaler le chemin recalculé.
 *
 * @returns {{valid:boolean, errors:string[], stats:object}}
 */
export function verifyMaze(maze) {
    const errors = [];
    const stats = { cells: 0, passages: 0, deadEnds: 0, unreachable: 0, pathCells: 0, pathSteps: 0 };
    const done = () => ({ valid: errors.length === 0, errors, stats });

    // 1. Structure
    if (!maze || !Number.isInteger(maze.cols) || !Number.isInteger(maze.rows) || maze.cols < 1 || maze.rows < 1) {
        errors.push('cols / rows invalides'); return done();
    }
    const { cols, rows, cells } = maze;
    const total = cols * rows;
    stats.cells = total;
    if (!cells || cells.length !== total) { errors.push(`cells doit contenir cols×rows = ${total} valeurs`); return done(); }

    let bitSum = 0, structural = 0;
    for (let i = 0; i < total; i++) {
        const v = cells[i];
        if (!Number.isInteger(v) || v < 0 || v > 15) {
            if (structural++ < 5) errors.push(`valeur de cellule invalide à l'index ${i} : ${v}`);
            continue;
        }
        const x = i % cols, y = (i / cols) | 0;
        for (let d = 0; d < 4; d++) {
            if (!(v & DIRS[d].bit)) continue;
            const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
                if (structural++ < 5) errors.push(`passage vers l'extérieur de la grille depuis (${x},${y})`);
            } else if (!(cells[ny * cols + nx] & DIRS[d].opp)) {
                if (structural++ < 5) errors.push(`passage asymétrique entre (${x},${y}) et (${nx},${ny})`);
            }
        }
        bitSum += popcount4(v);
        if (popcount4(v) === 1) stats.deadEnds++;
    }
    if (structural > 0) { if (structural > 5) errors.push(`… ${structural - 5} autre(s) erreur(s) de structure`); return done(); }
    stats.passages = bitSum / 2;

    // 2. Départ / sortie
    const inGrid = (c) => c && Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < cols && c.y < rows;
    if (!inGrid(maze.start)) errors.push('départ absent ou hors de la grille');
    if (!inGrid(maze.exit)) errors.push('sortie absente ou hors de la grille');
    if (errors.length) return done();
    if (maze.start.x === maze.exit.x && maze.start.y === maze.exit.y) { errors.push('départ et sortie identiques'); return done(); }

    // 3. Connexité + 4. cycles : parcours en largeur avec détection des passages hors arbre
    const startIdx = maze.start.y * cols + maze.start.x;
    const exitIdx = maze.exit.y * cols + maze.exit.x;
    const seen = new Uint8Array(total);
    const parent = new Int32Array(total).fill(-1);
    const queue = new Int32Array(total);
    let head = 0, tail = 0, reached = 1, extraEdges = 0;
    seen[startIdx] = 1; queue[tail++] = startIdx;
    while (head < tail) {
        const cur = queue[head++];
        const cx = cur % cols, cy = (cur / cols) | 0;
        for (let d = 0; d < 4; d++) {
            if (!(cells[cur] & DIRS[d].bit)) continue;
            const nIdx = (cy + DIRS[d].dy) * cols + (cx + DIRS[d].dx);
            if (nIdx === parent[cur]) continue;          // retour vers le parent : normal
            if (seen[nIdx]) { extraEdges++; continue; }  // cellule déjà vue par un autre chemin : cycle
            seen[nIdx] = 1; parent[nIdx] = cur; queue[tail++] = nIdx; reached++;
        }
    }
    stats.unreachable = total - reached;
    if (stats.unreachable > 0) {
        const lost = [];
        for (let i = 0; i < total && lost.length < 5; i++) if (!seen[i]) lost.push(`(${i % cols},${(i / cols) | 0})`);
        errors.push(`${stats.unreachable} cellule(s) inaccessible(s) depuis le départ, ex. ${lost.join(' ')}`);
    }
    if (!seen[exitIdx]) errors.push('la sortie est inaccessible depuis le départ');
    if (extraEdges > 0) errors.push('cycle détecté : plusieurs chemins possibles entre certaines cellules');
    if (stats.passages !== total - 1) errors.push(`nombre de passages = ${stats.passages}, attendu ${total - 1} (cellules − 1)`);

    // 5. Chemin
    if (seen[exitIdx]) {
        const rebuilt = [];
        for (let i = exitIdx; i !== -1; i = parent[i]) rebuilt.push({ x: i % cols, y: (i / cols) | 0 });
        rebuilt.reverse();
        stats.pathCells = rebuilt.length;
        stats.pathSteps = rebuilt.length - 1;
        if (maze.path) {
            const same = Array.isArray(maze.path) && maze.path.length === rebuilt.length &&
                maze.path.every((p, k) => p && p.x === rebuilt[k].x && p.y === rebuilt[k].y);
            if (!same) errors.push('le chemin enregistré (maze.path) ne correspond pas au chemin recalculé');
        }
    }
    return done();
}

// ─────────────────────────────────────────────
// 5. UTILITAIRES
// ─────────────────────────────────────────────

/** true si le passage dans la direction `bit` (N, E, S ou W) est ouvert depuis la cellule (x, y). */
export function hasPassage(maze, x, y, bit) {
    return (maze.cells[y * maze.cols + x] & bit) !== 0;
}

/**
 * Grille de « blocs » : (2·cols+1) × (2·rows+1), 1 = mur, 0 = libre.
 * La cellule (x, y) est le bloc (2x+1, 2y+1) ; un passage ouvre le bloc situé entre deux cellules.
 * Format pratique pour dessiner des murs en blocs (V2) et pour l'affichage de démonstration.
 * @returns {{width:number, height:number, data:Uint8Array}}  index = by*width + bx
 */
export function toBlockGrid(maze) {
    const width = 2 * maze.cols + 1, height = 2 * maze.rows + 1;
    const data = new Uint8Array(width * height).fill(1);
    for (let y = 0; y < maze.rows; y++) {
        for (let x = 0; x < maze.cols; x++) {
            const v = maze.cells[y * maze.cols + x];
            const bx = 2 * x + 1, by = 2 * y + 1;
            data[by * width + bx] = 0;
            if (v & E) data[by * width + bx + 1] = 0;
            if (v & S) data[(by + 1) * width + bx] = 0;
        }
    }
    return { width, height, data };
}

/** Représentation texte (débogage) : # mur, S départ, E sortie, · chemin (si showPath). */
export function toAscii(maze, showPath = false) {
    const { width, height, data } = toBlockGrid(maze);
    const grid = [];
    for (let by = 0; by < height; by++) {
        const line = [];
        for (let bx = 0; bx < width; bx++) line.push(data[by * width + bx] ? '#' : ' ');
        grid.push(line);
    }
    if (showPath) {
        for (let i = 0; i < maze.path.length; i++) {
            const a = maze.path[i], b = maze.path[i + 1];
            grid[2 * a.y + 1][2 * a.x + 1] = '·';
            if (b) grid[a.y + b.y + 1][a.x + b.x + 1] = '·';   // bloc de passage entre a et b
        }
    }
    grid[2 * maze.start.y + 1][2 * maze.start.x + 1] = 'S';
    grid[2 * maze.exit.y + 1][2 * maze.exit.x + 1] = 'E';
    return grid.map((l) => l.join('')).join('\n');
}
