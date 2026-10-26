// ultimateAI.js

/**
 * IA pour Ultimate Tic-Tac-Toe
 * @param {string} difficulty - "easy", "medium", "hard", "expert"
 * @returns {object} {gridIndex, cellIndex} ou null
 */
export function ultimateAI(difficulty = "easy", stateOverride = null) {
  // Importer l'état depuis ultimate.js via le DOM
  const ultimateState = stateOverride || window.ultimateState || getStateFromDOM();
  
  if (!ultimateState) return null;

  const aiPlayer = 2;
  const humanPlayer = 1;

  // Easy = choix aléatoire parmi les coups valides
  if (difficulty === "easy") {
    return getRandomMove(ultimateState);
  }

  // Medium = bloquer les menaces locales
  else if (difficulty === "medium") {
    // 1. Bloquer si l'adversaire peut gagner une mini-grille
    const blockMove = findLocalBlockingMove(ultimateState, humanPlayer);
    if (blockMove) return blockMove;

    // 2. Sinon jouer aléatoirement
    return getRandomMove(ultimateState);
  }

  // Hard = stratégie locale + globale
  else if (difficulty === "hard") {
    // 1. Gagner une mini-grille si possible
    const winLocalMove = findLocalWinningMove(ultimateState, aiPlayer);
    if (winLocalMove) return winLocalMove;

    // 2. Bloquer l'adversaire localement
    const blockLocalMove = findLocalBlockingMove(ultimateState, humanPlayer);
    if (blockLocalMove) return blockLocalMove;

    // 3. Gagner globalement si possible
    const winGlobalMove = findGlobalWinningMove(ultimateState, aiPlayer);
    if (winGlobalMove) return winGlobalMove;

    // 4. Bloquer globalement
    const blockGlobalMove = findGlobalBlockingMove(ultimateState, humanPlayer);
    if (blockGlobalMove) return blockGlobalMove;

    // 5. Jouer stratégiquement
    const strategicMove = findStrategicMove(ultimateState, aiPlayer);
    if (strategicMove) return strategicMove;

    // 6. Sinon aléatoire
    return getRandomMove(ultimateState);
  }

  // Expert = recherche negamax + règle dure anti-défaite (voir expertMove plus bas)
  else if (difficulty === "expert") {
    return expertMove(ultimateState);
  }

  return getRandomMove(ultimateState);
}

/**
 * Récupérer l'état depuis le DOM si nécessaire
 */
function getStateFromDOM() {
  const miniGrids = Array(9).fill(null).map(() => Array(9).fill(null));
  const gridWinners = Array(9).fill(null);
  let nextGrid = null;

  // Lire l'état depuis le DOM
  document.querySelectorAll('.mini-grid').forEach((grid, gridIndex) => {
    const cells = grid.querySelectorAll('.mini-cell');
    cells.forEach((cell, cellIndex) => {
      // les symboles sont maintenant des SVG : le propriétaire est lu dans data-p
      if (cell.dataset.p === '1') miniGrids[gridIndex][cellIndex] = 1;
      else if (cell.dataset.p === '2') miniGrids[gridIndex][cellIndex] = 2;
    });

    // Vérifier si la grille est gagnée
    if (grid.classList.contains('won-player1')) gridWinners[gridIndex] = 1;
    else if (grid.classList.contains('won-player2')) gridWinners[gridIndex] = 2;
    else if (grid.classList.contains('draw')) gridWinners[gridIndex] = 'draw';
  });

  // Détecter nextGrid
  const playableGrid = document.querySelector('.mini-grid.playable:not(.inactive)');
  if (playableGrid) {
    nextGrid = parseInt(playableGrid.dataset.gridIndex);
  }

  return { miniGrids, gridWinners, nextGrid };
}

/**
 * Jouer aléatoirement
 */
function getRandomMove(state) {
  const validMoves = getAllValidMoves(state);
  if (validMoves.length === 0) return null;
  return validMoves[Math.floor(Math.random() * validMoves.length)];
}

/**
 * Obtenir tous les coups valides
 */
function getAllValidMoves(state) {
  const moves = [];
  const gridsToCheck = state.nextGrid !== null 
    ? [state.nextGrid] 
    : [0, 1, 2, 3, 4, 5, 6, 7, 8];

  for (const gridIndex of gridsToCheck) {
    // Grille déjà terminée
    if (state.gridWinners[gridIndex] !== null) continue;

    for (let cellIndex = 0; cellIndex < 9; cellIndex++) {
      if (state.miniGrids[gridIndex][cellIndex] === null) {
        moves.push({ gridIndex, cellIndex });
      }
    }
  }

  return moves;
}

/**
 * Patterns de victoire 3x3
 */
const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // lignes
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // colonnes
  [0, 4, 8], [2, 4, 6]              // diagonales
];

/**
 * Trouver un coup gagnant dans une mini-grille
 */
function findLocalWinningMove(state, player) {
  const validMoves = getAllValidMoves(state);

  for (const move of validMoves) {
    const { gridIndex, cellIndex } = move;
    const grid = state.miniGrids[gridIndex];

    // Simuler le coup
    const testGrid = [...grid];
    testGrid[cellIndex] = player;

    // Vérifier si ça gagne la mini-grille
    if (checkGridWinner(testGrid) === player) {
      return move;
    }
  }

  return null;
}

/**
 * Bloquer l'adversaire localement
 */
function findLocalBlockingMove(state, opponent) {
  return findLocalWinningMove(state, opponent);
}

/**
 * Trouver un coup qui gagne globalement
 */
function findGlobalWinningMove(state, player) {
  const validMoves = getAllValidMoves(state);

  for (const move of validMoves) {
    const { gridIndex, cellIndex } = move;
    
    // Simuler : gagner cette mini-grille
    const testGridWinners = [...state.gridWinners];
    
    // Si ce coup gagne la mini-grille
    const grid = [...state.miniGrids[gridIndex]];
    grid[cellIndex] = player;
    
    if (checkGridWinner(grid) === player) {
      testGridWinners[gridIndex] = player;
      
      // Vérifier si ça gagne globalement
      if (checkGridWinner(testGridWinners) === player) {
        return move;
      }
    }
  }

  return null;
}

/**
 * Bloquer l'adversaire globalement
 */
function findGlobalBlockingMove(state, opponent) {
  return findGlobalWinningMove(state, opponent);
}

/**
 * Trouver un coup stratégique
 */
function findStrategicMove(state, player) {
  const validMoves = getAllValidMoves(state);
  const centerGrids = [4]; // Centre global
  const cornerGrids = [0, 2, 6, 8]; // Coins globaux

  // 1. Priorité au centre global
  for (const move of validMoves) {
    if (centerGrids.includes(move.gridIndex) && move.cellIndex === 4) {
      return move;
    }
  }

  // 2. Centres des mini-grilles jouables
  for (const move of validMoves) {
    if (move.cellIndex === 4) {
      return move;
    }
  }

  // 3. Coins des mini-grilles stratégiques
  for (const move of validMoves) {
    if (cornerGrids.includes(move.gridIndex) && [0, 2, 6, 8].includes(move.cellIndex)) {
      return move;
    }
  }

  return null;
}

/**
 * Vérifier le gagnant d'une grille
 */
function checkGridWinner(grid) {
  for (const pattern of WIN_PATTERNS) {
    const [a, b, c] = pattern;
    
    if (grid[a] && grid[a] === grid[b] && grid[a] === grid[c]) {
      return grid[a];
    }
  }
  
  // Match nul
  if (grid.every(cell => cell !== null)) {
    return 'draw';
  }
  
  return null;
}

// Exposer l'état pour l'IA
if (typeof window !== 'undefined') {
  window.getUltimateStateForAI = getStateFromDOM;
  window.aiTest = () => runAiTests();                       // console : aiTest()
  if (/[?&]aiTest=1/.test(location.search)) runAiTests();   // ou game.html?aiTest=1
}

/* =====================================================================
   IA EXPERTE — Ultimate
   Règle dure (avant toute heuristique, indépendante du temps) :
     1. un coup qui gagne la partie maintenant est joué ;
     2. un coup après lequel l'adversaire a une réponse gagnante (coup libre
        inclus : toutes les grilles ouvertes) est interdit s'il existe une alternative.
   Puis negamax alpha-bêta, approfondissement itératif, sur les coups sûrs.
   Déterministe : pas d'aléatoire, ni triche (lit uniquement l'état du jeu).
   ===================================================================== */
const LM = WIN_PATTERNS.map(([a, b, c]) => (1 << a) | (1 << b) | (1 << c));
const WINM = new Uint8Array(512), POP = new Uint8Array(512);
for (let m = 0; m < 512; m++) { POP[m] = POP[m >> 1] + (m & 1); WINM[m] = LM.some((l) => (m & l) === l) ? 1 : 0; }
const GW = [50, 40, 50, 40, 60, 40, 50, 40, 50];   // valeur d'une petite grille prise (bornée : jamais infinie)
const MATE = 100000, INF = 1e9;
const bufs = Array.from({ length: 40 }, () => new Int16Array(81)), OS = new Int16Array(81);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isMobile = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function fromState(st, turn) {
  const P = { cells: new Int8Array(81), bm: [null, new Uint16Array(9), new Uint16Array(9)], cnt: new Uint8Array(9),
    small: new Uint8Array(9), gm: [0, 0, 0], next: -1, turn, winner: 0, open: 0, stk: new Int32Array(500), sp: 0 };
  for (let g = 0; g < 9; g++) {
    for (let c = 0; c < 9; c++) {
      const v = st.miniGrids[g][c];
      if (v === 1 || v === 2) { P.cells[g * 9 + c] = v; P.bm[v][g] |= 1 << c; P.cnt[g]++; }
    }
    if (WINM[P.bm[1][g]]) { P.small[g] = 1; P.gm[1] |= 1 << g; }
    else if (WINM[P.bm[2][g]]) { P.small[g] = 2; P.gm[2] |= 1 << g; }
    else if (P.cnt[g] === 9) P.small[g] = 3;
    else P.open++;
  }
  if (WINM[P.gm[1]]) P.winner = 1; else if (WINM[P.gm[2]]) P.winner = 2;
  const n = st.nextGrid;
  P.next = n != null && n >= 0 && P.small[n] === 0 ? n : -1;
  return P;
}
function make(P, m) {
  const g = (m / 9) | 0, c = m - g * 9, p = P.turn, k = P.sp; P.sp += 5;
  P.stk[k] = P.small[g]; P.stk[k + 1] = P.next; P.stk[k + 2] = P.gm[p]; P.stk[k + 3] = P.winner; P.stk[k + 4] = P.open;
  P.cells[m] = p; P.bm[p][g] |= 1 << c; P.cnt[g]++;
  if (WINM[P.bm[p][g]]) { P.small[g] = p; P.gm[p] |= 1 << g; P.open--; if (WINM[P.gm[p]]) P.winner = p; }
  else if (P.cnt[g] === 9) { P.small[g] = 3; P.open--; }
  P.next = P.small[c] === 0 ? c : -1;   // grille d'envoi fermée = coup libre
  P.turn = 3 - p;
}
function unmake(P, m) {
  const g = (m / 9) | 0, c = m - g * 9; P.turn = 3 - P.turn; const p = P.turn, k = (P.sp -= 5);
  P.cells[m] = 0; P.bm[p][g] &= ~(1 << c); P.cnt[g]--;
  P.small[g] = P.stk[k]; P.next = P.stk[k + 1]; P.gm[p] = P.stk[k + 2]; P.winner = P.stk[k + 3]; P.open = P.stk[k + 4];
}
function gen(P, buf) {
  let n = 0;
  if (P.next >= 0) { const b = P.next * 9; for (let c = 0; c < 9; c++) if (!P.cells[b + c]) buf[n++] = b + c; }
  else for (let g = 0; g < 9; g++) if (P.small[g] === 0) { const b = g * 9; for (let c = 0; c < 9; c++) if (!P.cells[b + c]) buf[n++] = b + c; }
  return n;
}
function order(P, buf, n) {   // ordre des coups : finir une grille > bloquer > éviter le coup libre offert
  const p = P.turn, bp = P.bm[p], bo = P.bm[3 - p];
  for (let i = 0; i < n; i++) {
    const m = buf[i], g = (m / 9) | 0, c = m - g * 9; let s = 0;
    if (WINM[bp[g] | (1 << c)]) s = WINM[P.gm[p] | (1 << g)] ? 2000 : 120;
    else if (WINM[bo[g] | (1 << c)]) s = 60;
    if (P.small[c] !== 0) s -= 25;
    OS[i] = s;
  }
  for (let i = 1; i < n; i++) {
    const m = buf[i], s = OS[i]; let j = i - 1;
    while (j >= 0 && OS[j] < s) { buf[j + 1] = buf[j]; OS[j + 1] = OS[j]; j--; }
    buf[j + 1] = m; OS[j + 1] = s;
  }
}
const openMask = (P) => { let o = 0; for (let g = 0; g < 9; g++) if (P.small[g] === 0) o |= 1 << g; return o; };

// Gain de p s'il finit la grille g maintenant : valeur bornée + menaces de grande grille créées
function gainIn(P, p, g, om) {
  const bm = P.bm[p][g], bo = P.bm[3 - p][g]; let best = 0;
  for (let i = 0; i < 8; i++) {
    const l = LM[i]; if ((bo & l) || POP[bm & l] !== 2) continue;
    const ng = P.gm[p] | (1 << g); let thr = 0;
    for (let j = 0; j < 8; j++) {
      const L = LM[j]; if (!(L & (1 << g))) continue;
      const k = POP[ng & L];
      if (k === 3) thr = 9; else if (k === 2 && (L & ~ng & om)) thr++;
    }
    const v = 40 + (thr >= 9 ? 3000 : thr >= 2 ? 450 : thr === 1 ? 180 : 0);   // fourche = 450, menace = 180
    if (v > best) best = v;
  }
  return best;
}
function side(P, p, q, dm) {
  let s = 0; const gp = P.gm[p], gq = P.gm[q];
  for (let g = 0; g < 9; g++) if (gp >> g & 1) s += GW[g];
  for (let i = 0; i < 8; i++) { const L = LM[i]; if ((gq | dm) & L) continue; const k = POP[gp & L]; if (k === 2) s += 120; else if (k === 1) s += 14; }
  for (let g = 0; g < 9; g++) if (P.small[g] === 0) {
    const a = P.bm[p][g], b = P.bm[q][g];
    for (let i = 0; i < 8; i++) { const l = LM[i]; if (b & l) continue; const k = POP[a & l]; if (k === 2) s += 6; else if (k === 1) s += 1; }
  }
  return s;
}
// Note du point de vue du joueur au trait : position + ce qu'il peut prendre tout de suite
function evaluate(P) {
  const me = P.turn, op = 3 - me, om = openMask(P); let dm = 0;
  for (let g = 0; g < 9; g++) if (P.small[g] === 3) dm |= 1 << g;
  let s = side(P, me, op, dm) - side(P, op, me, dm);
  if (P.next >= 0) s += gainIn(P, me, P.next, om) + (P.next === 4 ? 4 : 0);
  else { let b = 0; for (let g = 0; g < 9; g++) if (om >> g & 1) { const v = gainIn(P, me, g, om); if (v > b) b = v; } s += 40 + b; }  // coup libre : son meilleur choix
  return s;
}
function nega(S, P, depth, alpha, beta, ply) {
  if (P.winner) return ply - MATE;   // le coup précédent a gagné : défaite du joueur au trait
  if (P.open === 0) return 0;
  if (depth === 0) return evaluate(P);
  S.nodes++;
  if (!S.hard && (S.nodes & 1023) === 0 && (S.nodes > S.cap || now() > S.dl)) S.abort = true;
  if (S.abort) return 0;
  const buf = bufs[ply], n = gen(P, buf); order(P, buf, n);
  let best = -INF;
  for (let i = 0; i < n; i++) {
    const m = buf[i]; make(P, m); const v = -nega(S, P, depth - 1, -beta, -alpha, ply + 1); unmake(P, m);
    if (S.abort) return 0;
    if (v > best) { best = v; if (v > alpha) { alpha = v; if (alpha >= beta) break; } }
  }
  return best;
}
// Préférences à note égale : ne pas offrir de coup libre, ne pas ouvrir le centre, envoyer là où il ne prend rien
function tieKey(P, m) {
  make(P, m); const free = P.next < 0 ? 1 : 0, ctr = P.next === 4 ? 1 : 0; let gain = 0;
  if (P.open > 0) {
    const om = openMask(P);
    if (P.next >= 0) gain = gainIn(P, P.turn, P.next, om);
    else for (let g = 0; g < 9; g++) if (om >> g & 1) gain = Math.max(gain, gainIn(P, P.turn, g, om));
  }
  unmake(P, m);
  return free * 1e6 + ctr * 1e5 + gain;
}

/** Coup de l'IA experte. st = {miniGrids, nextGrid, currentPlayer}. opts.profile : "mobile" (250 ms) | "desktop" (500 ms). */
export function expertMove(st, opts = {}) {
  const t0 = now(), P = fromState(st, st.currentPlayer === 1 ? 1 : 2);
  if (P.winner || P.open === 0) return null;
  const me = P.turn, op = 3 - me, root = new Int16Array(81), rb = new Int16Array(81), n = gen(P, root);
  if (!n) return null;
  const cut = (m, x = {}) => ({ gridIndex: (m / 9) | 0, cellIndex: m % 9, ...x });
  if (n === 1) return cut(root[0]);
  // 1) coup qui termine la partie maintenant : on le joue, l'envoi n'existe plus
  for (let i = 0; i < n; i++) { make(P, root[i]); const w = P.winner === me; unmake(P, root[i]); if (w) return cut(root[i]); }
  // 2) filtre anti-défaite : réponse adverse gagnante (coup libre = toutes les grilles ouvertes)
  const safe = []; let fb = -1, fbc = 1e9;
  for (let i = 0; i < n; i++) {
    const m = root[i]; make(P, m); let bad = 0;
    if (P.open > 0) { const rn = gen(P, rb); for (let j = 0; j < rn; j++) { make(P, rb[j]); if (P.winner === op) bad++; unmake(P, rb[j]); } }
    unmake(P, m);
    if (!bad) safe.push(m); else if (bad < fbc) { fbc = bad; fb = m; }
  }
  const cand = safe.length ? safe : [fb];
  if (cand.length === 1) return cut(cand[0]);
  // 3) recherche sur les coups sûrs. La profondeur 2 (coup + meilleure réponse + évaluation) n'est jamais coupée.
  const mobile = (opts.profile || (isMobile() ? 'mobile' : 'desktop')) === 'mobile';
  const S = { nodes: 0, abort: false, hard: true, cap: mobile ? 150000 : 400000, dl: t0 + (mobile ? 250 : 500) };
  let seq = cand.slice(), best = -1, done = 0;
  for (let d = 2; d <= 14; d++) {
    S.hard = d === 2;
    const res = []; let alpha = -INF;
    for (const m of seq) {
      make(P, m); const v = -nega(S, P, d - 1, -INF, -(alpha - 1), 1); unmake(P, m);
      if (S.abort) break;
      res.push([m, v]); if (v > alpha) alpha = v;
    }
    if (S.abort) break;
    let bk = Infinity; best = -1;
    for (const [m, v] of res) if (v === alpha) { const k = tieKey(P, m); if (k < bk || (k === bk && m < best)) { bk = k; best = m; } }
    done = d;
    res.sort((a, b) => b[1] - a[1]); seq = res.map((r) => r[0]);
    if (Math.abs(alpha) > MATE - 200) break;
  }
  return cut(best, { depth: done, nodes: S.nodes, ms: Math.round(now() - t0) });
}

/* =====================================================================
   CAS DE TEST (console : aiTest()  ou  game.html?aiTest=1)
   Positions : 81 caractères (grille 0 à 8, case 0 à 8 ; 1 = humain, 2 = IA, . = vide), IA au trait.
   ===================================================================== */
const TESTS = [{"n":1,"cells":"12..2.........2111122.2.12...1..2.2..211121.2...111.....2..2..2..121.....1..1.2..","next":-1,"bad":[2,5,6,7,28,31,33,64,68,70,74,77,79],"name":"finir une petite grille enverrait l'humain sur une victoire immédiate"},
  {"n":2,"cells":".1.21..122..2........111.....212.2211..121.21..1222...........12121.1.122..12..12","next":-1,"good":[37],"name":"finir la petite grille gagne aussi la grande grille : la prendre"},
  {"n":3,"cells":".2....11....211...2...1..221...1...1....21222......212..12121..2.12..21...211.1..","next":-1,"bad":[0,3,4,9,15,16,21,24,45,48,49,72,79],"name":"seul finisseur envoie sur grille fermée, coup libre adverse gagnant"},
  {"n":4,"cells":".2....11....211...2...1..2.1...1...1....21222......212..12121..2.12..21...21..1..","next":-1,"bad":[0,3,4,9,15,16,21,24,45,48,49,72,76,79],"name":"coup neutre qui offre une victoire immédiate à l'humain"},
  {"n":5,"cells":"12.22.22...12.1..11.21.21...1.21..11.2.21.1..12.1..12...21.2.....12.1..1.2.2...2.","next":6,"bad":[54,55,58,61,62],"name":"finir la petite grille laisse une fourche (2 menaces de grande grille) en 4 plis"}];
function stFrom(cells, next) {
  const mg = Array.from({ length: 9 }, (_, g) => Array.from({ length: 9 }, (_, c) => { const ch = cells[g * 9 + c]; return ch === '1' ? 1 : ch === '2' ? 2 : null; }));
  return { miniGrids: mg, gridWinners: mg.map(checkGridWinner), nextGrid: next < 0 ? null : next, currentPlayer: 2 };
}
export function runAiTests() {
  let all = true;
  for (const t of TESTS) {
    const st = stFrom(t.cells, t.next), a = expertMove(st, { profile: 'mobile' }), b = expertMove(st, { profile: 'mobile' });
    const i = a.gridIndex * 9 + a.cellIndex, same = a.gridIndex === b.gridIndex && a.cellIndex === b.cellIndex;
    const ok = (t.good ? t.good.includes(i) : !t.bad.includes(i)) && same;
    all = all && ok;
    console.log(`[aiTest ${t.n}] ${ok ? 'PASS' : 'FAIL'} — ${t.name} — joue grille ${a.gridIndex} case ${a.cellIndex} (prof. ${a.depth}, ${a.nodes} nœuds, ${a.ms} ms${same ? '' : ', NON DÉTERMINISTE'})`);
  }
  console.log(`[aiTest] ${all ? 'TOUS PASS' : 'ÉCHEC'}`);
  return all;
}
