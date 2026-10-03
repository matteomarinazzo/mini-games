// ─── GAME.JS ────────────────────────────────────────────────────────────────
// Sudoku : génération (solution unique), saisie Chiffre / Gomme / Note,
// détection des conflits, chronomètre et meilleur temps.

import { loadStore, updateStore } from './store.js';

const DIFFICULTIES = {
    easy: { label: 'Facile', clues: 40, minPerBlock: 3 },
    medium: { label: 'Intermédiaire', clues: 32, minPerBlock: 3 },
    hard: { label: 'Difficile', clues: 28, minPerBlock: 2 },
    expert: { label: 'Expert', clues: 24, minPerBlock: 2 },
};

// ─── DOM ──────────────────────────────────────────────────────────────────────
const boardEl = document.getElementById('board');
const padEl = document.getElementById('pad');
const modesEl = document.getElementById('modes');
const hudDiff = document.getElementById('hudDiff');
const hudTimer = document.getElementById('hudTimer');
const hudErrors = document.getElementById('hudErrors');
const newBtn = document.getElementById('newBtn');
const solutionBtn = document.getElementById('solutionBtn');
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmTitle = document.getElementById('confirmTitle');
const confirmText = document.getElementById('confirmText');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');
const winOverlay = document.getElementById('winOverlay');
const replayBtn = document.getElementById('replayBtn');

// ─── CONSTANTES GÉOMÉTRIQUES ──────────────────────────────────────────────────
const rowOf = (i) => Math.floor(i / 9);
const colOf = (i) => i % 9;
const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

// Pour chaque case : indices partageant sa ligne, colonne ou bloc (hors elle-même)
const PEERS = Array.from({ length: 81 }, (_, i) => {
    const list = [];
    for (let j = 0; j < 81; j++) {
        if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) list.push(j);
    }
    return list;
});

// ─── GÉNÉRATION ───────────────────────────────────────────────────────────────
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Backtracking avec masques de bits + heuristique "case la plus contrainte".
 * Retourne { count, first } : nombre de solutions (plafonné à `limit`) et la première trouvée.
 * Si `random` est vrai, les chiffres sont essayés dans un ordre aléatoire (génération).
 */
function solve(grid, limit, random = false) {
    const g = grid.slice();
    const rows = new Array(9).fill(0);
    const cols = new Array(9).fill(0);
    const boxes = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
        if (g[i]) {
            const bit = 1 << (g[i] - 1);
            rows[rowOf(i)] |= bit;
            cols[colOf(i)] |= bit;
            boxes[boxOf(i)] |= bit;
        }
    }
    let count = 0;
    let first = null;

    function rec() {
        let best = -1;
        let bestMask = 0;
        let bestN = 10;
        for (let i = 0; i < 81; i++) {
            if (g[i]) continue;
            const mask = ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & 511;
            let n = 0;
            for (let m = mask; m; m &= m - 1) n++;
            if (n < bestN) {
                best = i;
                bestMask = mask;
                bestN = n;
                if (n <= 1) break;
            }
        }
        if (best < 0) {
            count++;
            if (!first) first = g.slice();
            return;
        }
        if (bestN === 0) return;

        const digits = [];
        for (let d = 1; d <= 9; d++) if (bestMask & (1 << (d - 1))) digits.push(d);
        if (random) shuffle(digits);

        const r = rowOf(best), c = colOf(best), b = boxOf(best);
        for (const d of digits) {
            const bit = 1 << (d - 1);
            g[best] = d;
            rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
            rec();
            g[best] = 0;
            rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
            if (count >= limit) return;
        }
    }

    rec();
    return { count, first };
}

function generate(difficulty) {
    const cfg = DIFFICULTIES[difficulty];
    const { first: solution } = solve(new Array(81).fill(0), 1, true);
    const puzzle = solution.slice();
    const blockCount = new Array(9).fill(9);
    let clues = 81;

    for (const i of shuffle([...Array(81).keys()])) {
        if (clues <= cfg.clues) break;
        const b = boxOf(i);
        if (blockCount[b] <= cfg.minPerBlock) continue; // garde une répartition équilibrée
        const v = puzzle[i];
        puzzle[i] = 0;
        if (solve(puzzle, 2).count === 1) {
            clues--;
            blockCount[b]--;
        } else {
            puzzle[i] = v; // retirer cette case rendrait la solution ambiguë
        }
    }
    return { puzzle, solution };
}

// ─── ÉTAT ─────────────────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const difficulty = DIFFICULTIES[params.get('difficulty')] ? params.get('difficulty') : 'easy';

let initial = [];     // grille de départ (0 = vide)
let given = [];       // booléens : case initiale
let solution = [];
let values = [];      // 0 = vide
let notes = [];       // masque de bits par case (bit d-1 = note d)
let selected = -1;
let mode = 'digit';   // 'digit' | 'erase' | 'note'
let finished = false;
let revealed = false;
let elapsed = 0;
let lastTick = performance.now();
let saveCounter = 0;
let mistakes = 0;     // total cumulé des erreurs commises (ne diminue jamais)
const noteHelp = loadStore().settings.noteHelp !== false; // réglage du menu

const cells = [];

// ─── CONSTRUCTION DU DOM ──────────────────────────────────────────────────────
function buildBoard() {
    boardEl.innerHTML = '';
    cells.length = 0;
    for (let i = 0; i < 81; i++) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'cell';
        if (colOf(i) % 3 === 2 && colOf(i) < 8) el.classList.add('bR');
        if (rowOf(i) % 3 === 2 && rowOf(i) < 8) el.classList.add('bB');
        if (colOf(i) === 8) el.classList.add('col8');
        if (rowOf(i) === 8) el.classList.add('row8');
        el.setAttribute('role', 'gridcell');
        el.dataset.index = i;

        const val = document.createElement('span');
        val.className = 'val';
        const notesEl = document.createElement('div');
        notesEl.className = 'notes';
        for (let d = 1; d <= 9; d++) notesEl.appendChild(document.createElement('span'));
        el.append(val, notesEl);

        boardEl.appendChild(el);
        cells.push({ el, val, notesSpans: notesEl.children });
    }
}

function buildPad() {
    padEl.innerHTML = '';
    for (let d = 1; d <= 9; d++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pad-btn';
        b.textContent = d;
        b.dataset.digit = d;
        b.setAttribute('aria-label', `Chiffre ${d}`);
        padEl.appendChild(b);
    }
}

// ─── PARTIE ───────────────────────────────────────────────────────────────────
function startState() {
    given = initial.map((v) => v !== 0);
    selected = -1;
    finished = false;
    revealed = false;
    lastTick = performance.now();
    winOverlay.style.display = 'none';
    solutionBtn.disabled = false;
}

function newGame() {
    const { puzzle, solution: sol } = generate(difficulty);
    initial = puzzle.slice();
    solution = sol;
    values = puzzle.slice();
    notes = new Array(81).fill(0);
    elapsed = 0;
    mistakes = 0;
    startState();
    persist();
    render();
}

// Sauvegarde la partie du niveau courant dans la clé "sudoku" (supprimée une fois terminée)
function persist() {
    updateStore((s) => {
        if (finished) {
            delete s.games[difficulty];
        } else {
            s.games[difficulty] = {
                p: initial.join(''),
                s: solution.join(''),
                v: values.join(''),
                n: notes,
                t: Math.floor(elapsed),
                e: mistakes,
            };
        }
    });
}

// Recharge la partie en cours du niveau, si elle existe et est valide
function restore() {
    const g = loadStore().games[difficulty];
    const ok = (x) => typeof x === 'string' && /^[0-9]{81}$/.test(x);
    if (!g || !ok(g.p) || !ok(g.s) || !ok(g.v) || !Array.isArray(g.n) || g.n.length !== 81) return false;
    initial = [...g.p].map(Number);
    solution = [...g.s].map(Number);
    values = [...g.v].map(Number);
    notes = g.n.map((n) => (Number(n) || 0) & 511);
    elapsed = Number(g.t) || 0;
    mistakes = Math.max(0, Math.floor(Number(g.e) || 0));
    startState();
    return true;
}

// ─── RÈGLES ───────────────────────────────────────────────────────────────────
// Chiffre saisi par le joueur en conflit avec un autre chiffre de sa ligne/colonne/bloc
function hasConflict(i) {
    const v = values[i];
    return v !== 0 && !given[i] && PEERS[i].some((p) => values[p] === v);
}

// Note en conflit : le chiffre est déjà posé dans la ligne/colonne/bloc
function noteConflict(i, d) {
    return PEERS[i].some((p) => values[p] === d);
}

// ─── SAISIE ───────────────────────────────────────────────────────────────────
function selectCell(i) {
    selected = i;
    if (mode === 'erase') eraseSelected();
    else render();
}

function inputDigit(d) {
    if (finished || selected < 0 || given[selected]) return;
    if (mode === 'note') {
        if (values[selected] !== 0) return; // pas de note sur une case remplie
        notes[selected] ^= 1 << (d - 1);
    } else {
        if (values[selected] === d) {
            values[selected] = 0; // re-taper le même chiffre l'efface
        } else {
            values[selected] = d;
            notes[selected] = 0;
            if (hasConflict(selected)) mistakes++; // chiffre en conflit = une erreur comptée
        }
    }
    persist();
    render();
    checkWin();
}

function eraseSelected() {
    if (finished || selected < 0 || given[selected]) { render(); return; }
    values[selected] = 0;
    notes[selected] = 0;
    persist();
    render();
}

function moveSelection(dr, dc) {
    if (selected < 0) { selected = 40; render(); return; }
    const r = Math.min(8, Math.max(0, rowOf(selected) + dr));
    const c = Math.min(8, Math.max(0, colOf(selected) + dc));
    selected = r * 9 + c;
    render();
    cells[selected].el.focus({ preventScroll: true });
}

function setMode(m) {
    mode = m;
    modesEl.querySelectorAll('.mode-btn').forEach((b) => {
        const active = b.dataset.mode === m;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
    });
    if (m === 'erase') eraseSelected(); // la gomme efface aussi la case déjà sélectionnée
}

// ─── FIN DE PARTIE ────────────────────────────────────────────────────────────
function checkWin() {
    if (finished) return;
    if (values.every((v) => v !== 0) && values.every((v, i) => !hasConflict(i))) {
        finished = true;
        showWin();
    }
}

function showWin() {
    const time = Math.floor(elapsed);
    const best = parseInt(loadStore().best[difficulty], 10);
    let message;
    if (isNaN(best) || time < best) {
        updateStore((s) => { s.best[difficulty] = time; });
        message = isNaN(best) ? 'Premier temps enregistré pour ce niveau !' : 'Nouveau record personnel !';
    } else {
        message = `Meilleur temps : ${formatTime(best)}`;
    }
    persist(); // partie terminée : retirée de la sauvegarde
    document.getElementById('winDiff').textContent = DIFFICULTIES[difficulty].label;
    document.getElementById('winTime').textContent = formatTime(time);
    document.getElementById('winRecord').textContent = message;
    winOverlay.style.display = 'flex';
}

function revealSolution() {
    values = solution.slice();
    notes = new Array(81).fill(0);
    finished = true;
    revealed = true; // pas de record si la solution a été révélée
    solutionBtn.disabled = true;
    persist();
    render();
}

// ─── CONFIRMATION ─────────────────────────────────────────────────────────────
let confirmAction = null;

function askConfirm(title, text, action) {
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmAction = action;
    confirmOverlay.style.display = 'flex';
}

function closeConfirm() {
    confirmOverlay.style.display = 'none';
    confirmAction = null;
}

// ─── CHRONOMÈTRE ──────────────────────────────────────────────────────────────
function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function tick() {
    const now = performance.now();
    if (!finished && !document.hidden) elapsed += now - lastTick; // en pause si l'onglet est masqué
    lastTick = now;
    hudTimer.textContent = formatTime(elapsed);
}

setInterval(() => {
    tick();
    if (!finished && ++saveCounter % 20 === 0) persist(); // le chrono est sauvegardé toutes les ~5 s
}, 250);

// Fermeture de l'app, changement d'onglet ou de page : sauvegarde immédiate
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        tick();
        persist();
    } else {
        lastTick = performance.now();
    }
});
window.addEventListener('pagehide', persist);

// ─── RENDU ────────────────────────────────────────────────────────────────────
function render() {
    const selVal = selected >= 0 ? values[selected] : 0;
    const counts = new Array(10).fill(0);

    for (let i = 0; i < 81; i++) {
        const { el, val, notesSpans } = cells[i];
        const v = values[i];
        const conflict = hasConflict(i);
        if (v) counts[v]++;

        const isPeer = selected >= 0 && i !== selected && PEERS[selected].includes(i);
        el.classList.toggle('given', given[i]);
        el.classList.toggle('selected', i === selected);
        el.classList.toggle('same', selVal !== 0 && v === selVal && i !== selected);
        el.classList.toggle('peer', isPeer && !(selVal !== 0 && v === selVal));
        el.classList.toggle('error', conflict);

        val.textContent = v || '';
        for (let d = 1; d <= 9; d++) {
            const span = notesSpans[d - 1];
            const on = !v && (notes[i] & (1 << (d - 1))) !== 0;
            span.textContent = on ? d : '';
            span.classList.toggle('bad', noteHelp && on && noteConflict(i, d));
        }

        const pos = `Ligne ${rowOf(i) + 1}, colonne ${colOf(i) + 1}`;
        let state = v ? `chiffre ${v}${given[i] ? ', case initiale' : ''}${conflict ? ', en conflit' : ''}` : 'vide';
        el.setAttribute('aria-label', `${pos}, ${state}`);
    }

    padEl.querySelectorAll('.pad-btn').forEach((b) => {
        b.disabled = finished || counts[Number(b.dataset.digit)] >= 9;
    });

    hudErrors.textContent = mistakes;
    hudErrors.classList.toggle('has-errors', mistakes > 0);
}

// ─── ÉVÉNEMENTS ───────────────────────────────────────────────────────────────
boardEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (cell) selectCell(Number(cell.dataset.index));
});

padEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.pad-btn');
    if (!btn) return;
    // En mode Gomme, un chiffre du pavé repasse en saisie normale
    if (mode === 'erase') setMode('digit');
    inputDigit(Number(btn.dataset.digit));
});

modesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-btn');
    if (btn) setMode(btn.dataset.mode);
});

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (confirmOverlay.style.display === 'flex' || winOverlay.style.display === 'flex') return;
    if (e.key >= '1' && e.key <= '9') {
        inputDigit(Number(e.key));
    } else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') {
        eraseSelected();
    } else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1, 0); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1, 0); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); moveSelection(0, -1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moveSelection(0, 1); }
    else if (e.key === 'n' || e.key === 'N') setMode(mode === 'note' ? 'digit' : 'note');
});

newBtn.addEventListener('click', () => {
    if (finished) { newGame(); return; }
    askConfirm('Nouvelle partie', 'La partie en cours sera perdue. Continuer ?', newGame);
});

solutionBtn.addEventListener('click', () => {
    askConfirm('Afficher la solution', 'La grille sera résolue et aucun temps ne sera enregistré. Continuer ?', revealSolution);
});

confirmYes.addEventListener('click', () => {
    const action = confirmAction;
    closeConfirm();
    if (action) action();
});
confirmNo.addEventListener('click', closeConfirm);
replayBtn.addEventListener('click', newGame);

// ─── INIT ─────────────────────────────────────────────────────────────────────
hudDiff.textContent = DIFFICULTIES[difficulty].label;
buildBoard();
buildPad();
if (restore()) render();
else newGame();
