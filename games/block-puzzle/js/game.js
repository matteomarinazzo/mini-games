/**
 * Block Puzzle – game.js
 */

import { auth, firebaseReady } from "../../../js/config/firebase-config.js";
import { updateRoom, listenToRoomChanges, deleteRoom } from "../../../js/firebaseWrk.js";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const GRID_SIZE = 10;

const SHAPES = [
  { name: '1x1', layout: [[1]], color: '#FF7043' },
  { name: '1x2-h', layout: [[1, 1]], color: '#FFA726' },
  { name: '1x2-v', layout: [[1], [1]], color: '#FFA726' },
  { name: '1x3-h', layout: [[1, 1, 1]], color: '#FFEE58' },
  { name: '1x3-v', layout: [[1], [1], [1]], color: '#FFEE58' },
  { name: '1x4-h', layout: [[1, 1, 1, 1]], color: '#66BB6A' },
  { name: '1x4-v', layout: [[1], [1], [1], [1]], color: '#66BB6A' },
  { name: '2x2', layout: [[1, 1], [1, 1]], color: '#26C6DA' },
  { name: '2x3-h', layout: [[1, 1, 1], [1, 1, 1]], color: '#EF5350' },
  { name: '3x3', layout: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], color: '#EF5350' },
  { name: 'L', layout: [[1, 0], [1, 0], [1, 1]], color: '#42A5F5' },
  { name: 'L-mir', layout: [[0, 1], [0, 1], [1, 1]], color: '#42A5F5' },
  { name: 'L-r', layout: [[1, 1, 1], [1, 0, 0]], color: '#42A5F5' },
  { name: 'L-r2', layout: [[1, 1, 1], [0, 0, 1]], color: '#42A5F5' },
  { name: 'T', layout: [[1, 1, 1], [0, 1, 0]], color: '#FFCA28' },
  { name: 'T-r', layout: [[0, 1, 0], [1, 1, 1]], color: '#FFCA28' },
  { name: 'S', layout: [[0, 1, 1], [1, 1, 0]], color: '#AB47BC' },
  { name: 'Z', layout: [[1, 1, 0], [0, 1, 1]], color: '#AB47BC' },
  { name: '1x5-h', layout: [[1, 1, 1, 1, 1]], color: '#FF6090' },
  { name: '1x5-v', layout: [[1], [1], [1], [1], [1]], color: '#FF6090' },
];

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let grid = makeEmptyGrid();
let score = 0;
let bestScore = parseInt(localStorage.getItem('blockPuzzleBest_v2') || '0');
let gameMode = 'libre';
let timeLeft = 0;
let timerInterval = null;
let timerStarted = false; // garde pour ne pas relancer le timer à chaque update Firebase
let currentPieces = [null, null, null];
let isGameOver = false;

// Multiplayer
let roomID = null;
let myUid = null;
let opponentUid = null;
let isMyTurn = true;
let lastRoomData = null;
let isLocalGridUpdate = false;

// Drag
let drag = null;

function makeEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}

// ─────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────
const gridEl = document.getElementById('grid');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const timerLabel = document.getElementById('timerLabel');
const bestScoreEl = document.getElementById('bestScore');
const piecesContainer = document.getElementById('piecesContainer');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScoreEl = document.getElementById('finalScore');
const finalBestEl = document.getElementById('finalBest');
const endTitle = document.getElementById('endTitle');
const retryBtn = document.getElementById('retryBtn');
const menuBtn = document.getElementById('menuBtn');
const menuBtn2 = document.getElementById('menuBtn2');
const pauseBtn = document.getElementById('pauseBtn');
const pauseOverlay = document.getElementById('pauseOverlay');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const opponentHudEl = document.getElementById('opponentHud');
const opponentNameEl = document.getElementById('opponentName');
const opponentScoreEl = document.getElementById('opponentScore');

// ─────────────────────────────────────────────
// MULTIPLAYER
// ─────────────────────────────────────────────
function setupMultiplayer() {
  opponentHudEl.style.display = 'flex';
  timerLabel.textContent = 'RESTANT';

  listenToRoomChanges(roomID, (room) => {
    if (!room || isGameOver) return;
    lastRoomData = room;

    // ── Fin de partie ──
    if (room.state === 'finished') {
      const won = room.winner === myUid;
      triggerGameOver(won ? '🏆 VICTOIRE !' : '💀 DÉFAITE…');
      return;
    }

    // ── Reconstruire la grille (Firebase renvoie parfois des objets) ──
    if (room.grid) {
      if (isLocalGridUpdate) {
        isLocalGridUpdate = false;
      } else {
        const newGrid = makeEmptyGrid();
        for (let r = 0; r < GRID_SIZE; r++) {
          const rowData = room.grid[r];
          if (rowData) {
            for (let c = 0; c < GRID_SIZE; c++) {
              if (rowData[c] !== undefined) newGrid[r][c] = rowData[c];
            }
          }
        }
        grid = newGrid;
        renderGrid();
      }
    }

    // ── Infos adversaire ──
    const pIds = Object.keys(room.players || {});
    opponentUid = pIds.find(id => id !== myUid);
    if (opponentUid) {
      opponentNameEl.textContent = room.players[opponentUid].name;
      opponentScoreEl.textContent = room.players[opponentUid].score || 0;
    }

    // ── Tour ──
    isMyTurn = (room.currentTurn === myUid);
    updateTurnUI();

    // ── Pièces : s'affichent dès que currentTurn est défini (partie lancée) ──
    // On ne conditionne PAS sur room.state === 'playing' car la room peut rester 'waiting'
    if (room.currentTurn) {
      const myPiecesIdx = room.players?.[myUid]?.pieces;

      if (myPiecesIdx && isMyTurn) {
        // Firebase a les pièces → afficher si différentes
        const shapes = myPiecesIdx.map(idx => (idx !== -1 ? SHAPES[idx] : null));
        const localNames = currentPieces.map(p => p ? p.name : null);
        const fbNames = shapes.map(p => p ? p.name : null);
        if (JSON.stringify(localNames) !== JSON.stringify(fbNames)) {
          currentPieces = shapes;
          renderPieces();
          checkGameOver();
        }
      } else if (!myPiecesIdx && isMyTurn) {
        // Pas encore de pièces en DB → spawn local en attendant que le leader les écrive
        if (currentPieces.every(p => p === null)) {
          spawnPieces();
        }
      } else if (!isMyTurn) {
        piecesContainer.innerHTML = '<div class="waiting-turn">Tour de l\'adversaire…</div>';
        currentPieces = [null, null, null];
      }
    }

    // ── Le leader initialise quand les 2 joueurs sont là ──
    const playerCount = Object.keys(room.players || {}).length;
    if (room.leaderId === myUid && !room.currentTurn && opponentUid && playerCount >= 2) {
      const p1 = Array.from({ length: 3 }, () => Math.floor(Math.random() * SHAPES.length));
      const p2 = Array.from({ length: 3 }, () => Math.floor(Math.random() * SHAPES.length));
      updateRoom(roomID, {
        currentTurn: myUid,
        grid: makeEmptyGrid(),
        roundStep: 0,
        [`players/${myUid}/pieces`]: p1,
        [`players/${opponentUid}/pieces`]: p2,
      });
    }

    // ── Le leader génère de nouvelles pièces quand les 2 ont joué ──
    if (room.leaderId === myUid && (room.roundStep || 0) >= 2) {
      generateNewPiecesForRound();
    }

    // ── Timer : lancé une seule fois dès que la partie démarre ──
    if (room.currentTurn && !timerStarted) {
      timerStarted = true;
      const dur = room.duration || 600;
      const savedKey = `blockPuzzle_timer_${roomID}`;
      const savedTime = parseInt(localStorage.getItem(savedKey) || '0');
      timeLeft = (savedTime > 0 && savedTime <= dur) ? savedTime : dur;
      updateTimerDisplay();
      startCountdown(
        () => {
          // Fin du temps
          localStorage.removeItem(savedKey);
          if (room.leaderId === myUid) {
            const oppScore = parseInt(opponentScoreEl.textContent) || 0;
            updateRoom(roomID, {
              state: 'finished',
              winner: score >= oppScore ? myUid : opponentUid,
            });
          }
        },
        () => {
          // Chaque seconde : sauvegarde
          localStorage.setItem(savedKey, String(timeLeft));
        }
      );
    }
  }); // ← ferme listenToRoomChanges
} // ← ferme setupMultiplayer

function generateNewPiecesForRound() {
  if (!roomID || !opponentUid) return;
  const p1 = Array.from({ length: 3 }, () => Math.floor(Math.random() * SHAPES.length));
  const p2 = Array.from({ length: 3 }, () => Math.floor(Math.random() * SHAPES.length));
  updateRoom(roomID, {
    [`players/${myUid}/pieces`]: p1,
    [`players/${opponentUid}/pieces`]: p2,
    roundStep: 0,
  });
}

function renderPieces() {
  piecesContainer.innerHTML = '';
  currentPieces.forEach((shape, i) => {
    piecesContainer.appendChild(createPieceSlot(i, shape));
  });
}

function updateTurnUI() {
  const on = isMyTurn;
  piecesContainer.style.opacity = on ? '1' : '0.5';
  piecesContainer.style.pointerEvents = on ? 'auto' : 'none';
}

function endTurn() {
  if (!roomID || !lastRoomData || lastRoomData.currentTurn !== myUid) return;

  const nextStep = (lastRoomData.roundStep || 0) + 1;
  const piecesIdx = currentPieces.map(p => (p ? SHAPES.indexOf(p) : -1));

  const updates = {
    currentTurn: opponentUid,
    roundStep: nextStep,
    grid: grid,
    [`players/${myUid}/score`]: score,
    [`players/${myUid}/pieces`]: piecesIdx,
  };

  if (nextStep >= 2 && lastRoomData.leaderId === myUid) {
    const p1 = Array.from({ length: 3 }, () => Math.floor(Math.random() * SHAPES.length));
    const p2 = Array.from({ length: 3 }, () => Math.floor(Math.random() * SHAPES.length));
    updates.roundStep = 0;
    updates[`players/${myUid}/pieces`] = p1;
    updates[`players/${opponentUid}/pieces`] = p2;
  }

  updateRoom(roomID, updates);
}

// ─────────────────────────────────────────────
// GRILLE & LAYOUT
// ─────────────────────────────────────────────
function computeAndSetCellSize() {
  const availH = window.innerHeight - 60 - 140 - 40;
  const availW = window.innerWidth - 36;
  const cs = Math.min(
    Math.floor((availH - (GRID_SIZE - 1) * 3) / GRID_SIZE),
    Math.floor((availW - (GRID_SIZE - 1) * 3) / GRID_SIZE),
    44
  );
  document.documentElement.style.setProperty('--cs', cs + 'px');
  document.documentElement.style.setProperty('--piece-cell', Math.round(cs * 0.72) + 'px');
  gridEl.style.gridTemplateColumns = `repeat(${GRID_SIZE}, ${cs}px)`;
  gridEl.style.gridTemplateRows = `repeat(${GRID_SIZE}, ${cs}px)`;
}

function buildGrid() {
  gridEl.innerHTML = '';
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      gridEl.appendChild(cell);
    }
  }
}

function renderGrid() {
  if (!grid || !Array.isArray(grid)) return;

  for (let r = 0; r < GRID_SIZE; r++) {
    const row = grid[r];
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = gridEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
      if (!cell) continue;
      if (cell.classList.contains('clearing')) continue; // ← ne jamais couper l'anim
      const val = row ? row[c] : 0;
      cell.classList.remove('clearing');
      if (val) {
        cell.classList.add('filled');
        cell.style.backgroundColor = val;
      } else {
        cell.classList.remove('filled');
        cell.style.backgroundColor = '';
      }
    }
  }
}

// ─────────────────────────────────────────────
// PIÈCES
// ─────────────────────────────────────────────
function spawnPieces() {
  piecesContainer.innerHTML = '';
  currentPieces = [];
  for (let i = 0; i < 3; i++) {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    currentPieces.push(shape);
    piecesContainer.appendChild(createPieceSlot(i, shape));
  }
  checkGameOver();
}

function createPieceSlot(index, shape) {
  const slot = document.createElement('div');
  slot.className = 'piece-slot';
  slot.dataset.slot = index;
  if (!shape) {
    slot.classList.add('empty');
  } else {
    const pieceEl = createPieceEl(shape, index);
    slot.appendChild(pieceEl);
  }
  return slot;
}

function createPieceEl(shape, index) {
  const cols = shape.layout[0].length;
  const rows = shape.layout.length;
  const piece = document.createElement('div');
  piece.className = 'piece';
  piece.dataset.index = index;
  piece.style.display = 'grid';
  piece.style.gridTemplateColumns = `repeat(${cols}, var(--piece-cell))`;
  piece.style.gridTemplateRows = `repeat(${rows}, var(--piece-cell))`;
  piece.style.gap = '2px';
  shape.layout.forEach((row) => {
    row.forEach((val) => {
      const b = document.createElement('div');
      b.className = val ? 'piece-block' : 'piece-block empty-block';
      if (val) {
        b.style.backgroundColor = shape.color;
        b.style.boxShadow = `inset 2px 2px 0 rgba(255,255,255,0.25), inset -1px -1px 0 rgba(0,0,0,0.2)`;
      }
      piece.appendChild(b);
    });
  });
  attachDrag(piece, shape, index);
  return piece;
}

// ─────────────────────────────────────────────
// DRAG & DROP
// ─────────────────────────────────────────────
function getCellSize() {
  const cell = gridEl.querySelector('.cell');
  return cell ? cell.getBoundingClientRect().width : 40;
}

function getGridRect() {
  return gridEl.getBoundingClientRect();
}

function createGhost(shape) {
  const cs = getCellSize();
  const cols = shape.layout[0].length;
  const rows = shape.layout.length;
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  Object.assign(ghost.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '9999',
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, ${cs}px)`,
    gridTemplateRows: `repeat(${rows}, ${cs}px)`,
    gap: '3px',
    opacity: '0.85',
  });
  shape.layout.forEach((row) => {
    row.forEach((val) => {
      const b = document.createElement('div');
      if (val) {
        Object.assign(b.style, {
          backgroundColor: shape.color,
          borderRadius: '4px',
          boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.3), inset -1px -1px 0 rgba(0,0,0,0.25)',
        });
      }
      ghost.appendChild(b);
    });
  });
  document.body.appendChild(ghost);
  return ghost;
}

function snapGhostToGrid(gx, gy, shape) {
  const rect = getGridRect();
  const cs = getCellSize();
  const step = cs + 3;
  let lx = gx - rect.left;
  let ly = gy - rect.top;
  lx = Math.max(0, Math.min(lx, (GRID_SIZE - shape.layout[0].length) * step));
  ly = Math.max(0, Math.min(ly, (GRID_SIZE - shape.layout.length) * step));
  const c = Math.round(lx / step);
  const r = Math.round(ly / step);
  return { x: rect.left + c * step, y: rect.top + r * step, r, c };
}

function attachDrag(pieceEl, shape, index) {
  let grabX = 0, grabY = 0, active = false;
  const slotEl = pieceEl.closest('.piece-slot'); // Récupérer le slot

  const getPtr = (e) => e.type.startsWith('touch')
    ? (e.touches[0] || e.changedTouches[0])
    : e;

  const onStart = (e) => {
    if (isGameOver || !isMyTurn) return;
    if (e.type === 'touchstart') e.preventDefault();
    const ptr = getPtr(e);

    // CACHER la pièce dans le menu
    pieceEl.style.opacity = '0';
    pieceEl.style.visibility = 'hidden'; // Pour qu'elle prenne plus de place

    const rect = pieceEl.getBoundingClientRect();
    const fx = (ptr.clientX - rect.left) / rect.width;
    const fy = (ptr.clientY - rect.top) / rect.height;
    const step = getCellSize() + 3;
    grabX = fx * (shape.layout[0].length * step - 3);
    grabY = fy * (shape.layout.length * step - 3);
    active = true;
    drag = { shape, index, ghost: createGhost(shape), grabX, grabY };
    positionGhost(ptr.clientX, ptr.clientY);
  };

  const onMove = (e) => {
    if (!active || !drag) return;
    if (e.type === 'touchmove') e.preventDefault();
    const ptr = getPtr(e);
    positionGhost(ptr.clientX, ptr.clientY);

    // Ajouter effet visuel sur le ghost selon la validité
    const rect = getGridRect();
    const overGrid = ptr.clientX >= rect.left && ptr.clientX <= rect.right &&
      ptr.clientY >= rect.top && ptr.clientY <= rect.bottom;

    if (overGrid) {
      const { r, c } = snapGhostToGrid(ptr.clientX - drag.grabX, ptr.clientY - drag.grabY, shape);
      const valid = canPlace(r, c, shape);
      if (!valid) {
        drag.ghost.classList.add('invalid-ghost');
      } else {
        drag.ghost.classList.remove('invalid-ghost');
      }
    } else {
      drag.ghost.classList.remove('invalid-ghost');
    }
  };

  const onEnd = async (e) => {
    if (!active || !drag) return;
    if (e.type === 'touchend') e.preventDefault();
    const ptr = getPtr(e);

    // Vérifier si on est dans la grille
    const rect = getGridRect();
    const isInGrid = ptr.clientX >= rect.left && ptr.clientX <= rect.right &&
      ptr.clientY >= rect.top && ptr.clientY <= rect.bottom;

    let placed = false;

    if (isInGrid) {
      const { r, c } = snapGhostToGrid(ptr.clientX - drag.grabX, ptr.clientY - drag.grabY, shape);
      placed = await tryPlace(r, c, shape, index);
    }

    // Nettoyer le ghost
    if (drag.ghost) {
      drag.ghost.remove();
    }
    drag = null;
    active = false;

    if (placed) {
      if (slotEl && slotEl.parentNode) {
        slotEl.classList.add('empty');
      }
      if (pieceEl && pieceEl.parentNode) {
        pieceEl.remove();
      }

      if (gameMode === 'confrontation') {
        endTurn();
      }

    } else {
      if (pieceEl && pieceEl.parentNode) {
        pieceEl.style.opacity = '1';
        pieceEl.style.visibility = 'visible';
        pieceEl.style.filter = '';
      }
    }

    clearHighlight();
  };

  pieceEl.addEventListener('mousedown', onStart);
  pieceEl.addEventListener('touchstart', onStart, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onEnd, { passive: false });
}

function positionGhost(cx, cy) {
  if (!drag) return;
  const rect = getGridRect();
  const overGrid = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  if (overGrid) {
    const { x, y, r, c } = snapGhostToGrid(cx - drag.grabX, cy - drag.grabY, drag.shape);
    drag.ghost.style.left = x + 'px';
    drag.ghost.style.top = y + 'px';
    highlightCells(r, c, drag.shape, canPlace(r, c, drag.shape));
  } else {
    drag.ghost.style.left = (cx - drag.grabX) + 'px';
    drag.ghost.style.top = (cy - drag.grabY) + 'px';
    clearHighlight();
  }
}

function clearHighlight() {
  // Enlever tous les highlights
  gridEl.querySelectorAll('.cell[data-highlighted]').forEach(cell => {
    if (cell.dataset.highlighted === 'conflict') {
      cell.classList.remove('conflict');
    }

    // On ne touche PAS au background des cellules remplies
    if (!cell.classList.contains('filled')) {
      cell.style.backgroundColor = '';
    }

    delete cell.dataset.highlighted;
  });
}

function highlightCells(r, c, shape, valid) {
  clearHighlight();

  shape.layout.forEach((row, ri) => {
    row.forEach((val, ci) => {
      if (!val) return;

      const nr = r + ri;
      const nc = c + ci;
      const cell = gridEl.querySelector(`.cell[data-r="${nr}"][data-c="${nc}"]`);
      if (!cell) return;

      if (cell.classList.contains('filled')) {
        // Cellule déjà occupée - highlight rouge
        cell.classList.add('conflict');
        cell.dataset.highlighted = 'conflict';
      } else if (!valid) {
        // Hors limites ou autre raison - highlight rouge/orange
        cell.style.backgroundColor = 'rgba(255, 100, 100, 0.4)';
        cell.dataset.highlighted = 'invalid';
      } else {
        // Placement valide - highlight vert
        cell.style.backgroundColor = 'rgba(100, 255, 100, 0.2)';
        cell.dataset.highlighted = 'valid';
      }
    });
  });

  // Ghost
  if (drag && drag.ghost) {
    if (valid && !hasConflicts(r, c, shape)) {
      drag.ghost.classList.remove('invalid-ghost');
    } else {
      drag.ghost.classList.add('invalid-ghost');
    }
  }
}


// Nouvelle fonction pour vérifier les conflits
function hasConflicts(r, c, shape) {
  for (let ri = 0; ri < shape.layout.length; ri++) {
    for (let ci = 0; ci < shape.layout[ri].length; ci++) {
      if (!shape.layout[ri][ci]) continue;
      const nr = r + ri;
      const nc = c + ci;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return true;
      if (grid[nr] && grid[nr][nc] !== 0) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────
// LOGIQUE DE JEU
// ─────────────────────────────────────────────
function canPlace(r, c, shape) {
  for (let ri = 0; ri < shape.layout.length; ri++) {
    for (let ci = 0; ci < shape.layout[ri].length; ci++) {
      if (!shape.layout[ri][ci]) continue;
      const nr = r + ri, nc = c + ci;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE || grid[nr][nc] !== 0) return false;
    }
  }
  return true;
}

async function tryPlace(r, c, shape, index) {
  if (!canPlace(r, c, shape)) return false;

  // Ajouter la pièce
  shape.layout.forEach((row, ri) => {
    row.forEach((val, ci) => {
      if (val) grid[r + ri][c + ci] = shape.color;
    });
  });

  // Mettre à jour le score
  score += shape.layout.flat().filter(Boolean).length * 10;

  // Afficher la pièce posée
  renderGrid();

  // Vérifier les lignes complètes - ATTENDRE que l'animation finisse
  const cleared = await clearLines();

  if (cleared > 0) {
    score += (cleared * 100 * cleared) + (cleared >= 2 ? 150 : 0);
  }

  updateScore();

  // Marquer la pièce comme utilisée
  currentPieces[index] = null;

  // Vérifier si toutes les pièces sont posées
  if (currentPieces.every(p => p === null)) {
    setTimeout(() => {
      spawnPieces();
    }, 100);
  } else {
    checkGameOver();
  }

  return true;
}

function clearLines() {
  const rowsToClear = [], colsToClear = [];
  for (let r = 0; r < GRID_SIZE; r++) if (grid[r].every(v => v !== 0)) rowsToClear.push(r);
  for (let c = 0; c < GRID_SIZE; c++) if (grid.every(row => row[c] !== 0)) colsToClear.push(c);
  if (!rowsToClear.length && !colsToClear.length) return 0;

  // Collecter sans doublons
  const seen = new Set(), clearingCells = [];
  const addCell = (r, c) => {
    const key = `${r},${c}`; if (seen.has(key)) return; seen.add(key);
    const cell = gridEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if (cell) { cell.classList.add('clearing'); clearingCells.push(cell); }
  };
  rowsToClear.forEach(r => { for (let c = 0; c < GRID_SIZE; c++) addCell(r, c); });
  colsToClear.forEach(c => { for (let r = 0; r < GRID_SIZE; r++) addCell(r, c); });

  // Vider la grille mémoire immédiatement
  rowsToClear.forEach(r => { grid[r] = Array(GRID_SIZE).fill(0); });
  colsToClear.forEach(c => { for (let r = 0; r < GRID_SIZE; r++) grid[r][c] = 0; });

  // Nettoyer visuellement APRÈS l'animation, SANS appeler renderGrid
  setTimeout(() => {
    clearingCells.forEach(cell => {
      cell.classList.remove('clearing', 'filled');
      cell.style.backgroundColor = '';
    });
  }, 400);

  return rowsToClear.length + colsToClear.length;
}

function checkSlotEmpty() {
  if (currentPieces.every(p => p === null)) spawnPieces();
  else checkGameOver();
}

function checkGameOver() {
  if (currentPieces.every(s => s === null)) return;
  const canMove = currentPieces.some(shape => {
    if (!shape) return false;
    for (let r = 0; r <= GRID_SIZE - shape.layout.length; r++) {
      for (let c = 0; c <= GRID_SIZE - shape.layout[0].length; c++) {
        if (canPlace(r, c, shape)) return true;
      }
    }
    return false;
  });
  if (!canMove) {
    if (gameMode === 'confrontation') updateRoom(roomID, { state: 'finished', winner: opponentUid });
    else triggerGameOver('Plus de mouvements !');
  }
}

function updateScore() {
  scoreEl.textContent = score;
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('blockPuzzleBest_v2', bestScore);
    bestScoreEl.textContent = bestScore;
  }
}

function triggerGameOver(reason) {
  if (isGameOver) return;
  isGameOver = true;
  clearInterval(timerInterval);
  timerInterval = null;
  if (roomID) localStorage.removeItem(`blockPuzzle_timer_${roomID}`);

  endTitle.textContent = reason;
  finalScoreEl.textContent = score;
  finalBestEl.textContent = bestScore;

  // En mode confrontation, ajouter le bouton "Revanche"
  if (gameMode === 'confrontation' && roomID) {
    // Modifier le bouton Rejouer pour demander une revanche
    retryBtn.textContent = 'DEMANDER REVANCHE';
    retryBtn.disabled = false;

    // Vérifier si l'autre joueur a déjà demandé
    if (lastRoomData?.rematch?.[opponentUid]) {
      retryBtn.textContent = 'REVANCHE ACCEPTÉE';
      retryBtn.disabled = true;
      // Lancer directement la revanche
      startRematch();
    }

    // Écouter les changements de rematch
    listenToRematchStatus();
  }

  gameOverOverlay.style.display = 'flex';
}

async function requestRematch() {
  if (!roomID || !opponentUid) return;

  await updateRoom(roomID, {
    [`rematch/${myUid}`]: true
  });

  retryBtn.textContent = 'EN ATTENTE...';
  retryBtn.disabled = true;
}

function listenToRematchStatus() {
  if (!roomID) return;

  // Important : utiliser une référence unique pour éviter les boucles
  const rematchListener = listenToRoomChanges(roomID, (room) => {
    if (!room) return;

    const opponentRematch = room.rematch?.[opponentUid];
    const myRematch = room.rematch?.[myUid];

    if (opponentRematch && myRematch) {
      // Les deux veulent rejouer → on lance direct !
      startRematch();
    } else if (opponentRematch && !myRematch) {
      // L'adversaire a demandé
      retryBtn.textContent = 'ACCEPTER REVANCHE';
      retryBtn.disabled = false;
    }
  });
}

async function startRematch() {
  if (!roomID) return;

  // Réinitialiser la partie
  grid = makeEmptyGrid();
  score = 0;
  currentPieces = [null, null, null];
  isGameOver = false;
  timerStarted = false;

  // Générer nouvelles pièces
  const p1 = Array.from({ length: 3 }, () => Math.floor(Math.random() * SHAPES.length));
  const p2 = Array.from({ length: 3 }, () => Math.floor(Math.random() * SHAPES.length));

  // Mettre à jour Firebase
  await updateRoom(roomID, {
    grid: makeEmptyGrid(),
    currentTurn: myUid, // Le leader commence
    roundStep: 0,
    rematch: null, // Effacer les demandes
    state: 'playing',
    winner: null,
    [`players/${myUid}/score`]: 0,
    [`players/${myUid}/pieces`]: p1,
    [`players/${opponentUid}/score`]: 0,
    [`players/${opponentUid}/pieces`]: p2,
  });

  // Cacher l'overlay
  gameOverOverlay.style.display = 'none';

  // Re-rendre
  renderGrid();
  updateScore();
}

// ─────────────────────────────────────────────
// SOLO SETUP
// ─────────────────────────────────────────────
function setupSinglePlayer(duration) {
  if (gameMode === 'defi') {
    timeLeft = duration;
    timerLabel.textContent = 'RESTANT';
    updateTimerDisplay();
    startCountdown(() => triggerGameOver('⏱️ Temps écoulé !'));
  } else {
    timeLeft = 0;
    timerLabel.textContent = 'TEMPS';
    updateTimerDisplay();
    startChrono();
  }
  spawnPieces();
}

// ─────────────────────────────────────────────
// TIMERS
// ─────────────────────────────────────────────
function startChrono() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => { timeLeft++; updateTimerDisplay(); }, 1000);
}

function startCountdown(onEnd, onTick) {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (onTick) onTick();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      if (onEnd) onEnd();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const abs = Math.abs(timeLeft);
  const m = Math.floor(abs / 60).toString().padStart(2, '0');
  const s = (abs % 60).toString().padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
  if (gameMode === 'defi' && timeLeft <= 10 && timeLeft > 0) {
    timerEl.style.color = '#EF5350';
    timerEl.style.animation = 'pulse 0.5s ease-in-out infinite alternate';
  } else {
    timerEl.style.color = '';
    timerEl.style.animation = '';
  }
}

// ─────────────────────────────────────────────
// ÉVÉNEMENTS
// ─────────────────────────────────────────────
function setupEventListeners() {
  retryBtn?.addEventListener('click', () => {
    if (gameMode === 'confrontation' && roomID) {
      // En mode confrontation, demander une revanche
      requestRematch();
    } else {
      // Mode solo : reload direct
      window.location.reload();
    }
  });

  restartBtn?.addEventListener('click', () => {
    if (roomID) {
      deleteRoom(roomID);
      localStorage.removeItem(`blockPuzzle_timer_${roomID}`);
    }
    window.location.reload();
  });

  [menuBtn, menuBtn2].forEach(b => b?.addEventListener('click', () => {
    if (roomID) {
      deleteRoom(roomID);
      localStorage.removeItem(`blockPuzzle_timer_${roomID}`);
    }
    window.location.href = 'index.html';
  }));

  pauseBtn?.addEventListener('click', togglePause);
  resumeBtn?.addEventListener('click', togglePause);
}

function togglePause() {
  if (isGameOver || gameMode === 'confrontation') return;
  const paused = pauseOverlay.style.display === 'flex';
  pauseOverlay.style.display = paused ? 'none' : 'flex';
  if (paused) {
    if (gameMode === 'defi') startCountdown(() => triggerGameOver('⏱️ Temps écoulé !'));
    else startChrono();
  } else {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function init() {
  await firebaseReady;
  const p = new URLSearchParams(window.location.search);
  gameMode = p.get('mode') || 'libre';
  const rawID = p.get('id');
  roomID = rawID ? `blockPuzzle_${rawID}` : null;
  myUid = auth?.currentUser?.uid;

  bestScoreEl.textContent = bestScore;
  buildGrid();
  computeAndSetCellSize();
  window.addEventListener('resize', () => { computeAndSetCellSize(); renderGrid(); });

  if (gameMode === 'confrontation' && roomID) { pauseBtn.style.display = 'none'; setupMultiplayer() }
  else setupSinglePlayer(parseInt(p.get('duration') || '60'));

  setupEventListeners();
}

init();