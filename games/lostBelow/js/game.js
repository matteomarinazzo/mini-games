import { auth } from "../../../js/config/firebase-config.js";
import { updateRoom, listenToRoomChanges, deleteRoom } from "../../../js/firebaseWrk.js";

const urlParams = new URLSearchParams(window.location.search);
const rawID = urlParams.get("id");
const roomID = `lostBelow_${rawID}`;

if (!rawID) {
  // Fallback for debug/standalone if needed, but should be index.html
  // window.location.href = "index.html";
}

let roomData = null; // Will hold Firebase room data

const DIFF = {
  easy: { maxHp: 5, maxAp: 5, hazardCards: 30, tilesNumber: 50, exitCount: 3 },
  normal: { maxHp: 3, maxAp: 3, hazardCards: 22, tilesNumber: 75, exitCount: 3 },
  hard: { maxHp: 2, maxAp: 2, hazardCards: 18, tilesNumber: 100, exitCount: 2 },
  extreme: { maxHp: 1, maxAp: 2, hazardCards: 14, tilesNumber: 150, exitCount: 1 },
};
let dc = DIFF.normal;
let tilesNumber = 75;

const TILE_TYPES = [
  { id: "start", conn: { n: true, e: true, s: true, w: true }, weight: 0, isStart: true },
  { id: "straight-ns", conn: { n: true, e: false, s: true, w: false }, weight: 8 },
  { id: "straight-ew", conn: { n: false, e: true, s: false, w: true }, weight: 8 },
  { id: "corner-ne", conn: { n: true, e: true, s: false, w: false }, weight: 6 },
  { id: "corner-nw", conn: { n: true, e: false, s: false, w: true }, weight: 6 },
  { id: "corner-se", conn: { n: false, e: true, s: true, w: false }, weight: 6 },
  { id: "corner-sw", conn: { n: false, e: false, s: true, w: true }, weight: 6 },
  { id: "tjunc-nes", conn: { n: true, e: true, s: true, w: false }, weight: 5 },
  { id: "tjunc-new", conn: { n: true, e: true, s: false, w: true }, weight: 5 },
  { id: "tjunc-nsw", conn: { n: true, e: false, s: true, w: true }, weight: 5 },
  { id: "tjunc-esw", conn: { n: false, e: true, s: true, w: true }, weight: 5 },
  { id: "cross", conn: { n: true, e: true, s: true, w: true }, weight: 4 },
  { id: "deadend-n", conn: { n: true, e: false, s: false, w: false }, weight: 1 },
  { id: "deadend-e", conn: { n: false, e: true, s: false, w: false }, weight: 1 },
  { id: "deadend-s", conn: { n: false, e: false, s: true, w: false }, weight: 1 },
  { id: "deadend-w", conn: { n: false, e: false, s: false, w: true }, weight: 1 },
  // layer tiles : même connexions que straight mais changent de niveau au passage
  { id: "layer-ns", conn: { n: true, e: false, s: true, w: false }, weight: 2, isLayer: true },
  { id: "layer-ew", conn: { n: false, e: true, s: false, w: true }, weight: 2, isLayer: true },
  { id: "exit-n", conn: { n: true, e: false, s: false, w: false }, weight: 0, isExit: true },
  { id: "exit-e", conn: { n: false, e: true, s: false, w: false }, weight: 0, isExit: true },
  { id: "exit-s", conn: { n: false, e: false, s: true, w: false }, weight: 0, isExit: true },
  { id: "exit-w", conn: { n: false, e: false, s: false, w: true }, weight: 0, isExit: true },
];

const TILE_DEFS = {};
TILE_TYPES.forEach(t => { TILE_DEFS[t.id] = t; });

const DIRECTIONS = {
  n: { dr: -1, dc: 0, opposite: "s" },
  e: { dr: 0, dc: 1, opposite: "w" },
  s: { dr: 1, dc: 0, opposite: "n" },
  w: { dr: 0, dc: -1, opposite: "e" },
};

const GRID_ROWS = 19, GRID_COLS = 19;
const CENTER_R = 9, CENTER_C = 9;
const HAZARD_POOL = ["seisme", "effondrement", "obscurite", "eboulement", "courant_air"];

let state = { cells: {}, players: [] };

// ══════════════════════════════════════════
//  XYZ CELL STORE
//  Clé : "x:y:z"  (x=col, y=row, z=niveau)
//  Cellule : { x, y, z, type, revealed, playerIds, openEdges }
//  Pour une layer tile à (x,y,z) qui relie z et z±1 :
//    on stocke layerLinksTo = z±1 dans la cellule
// ══════════════════════════════════════════
function key(x, y, z) { return `${x}:${y}:${z}`; }

function getCell(x, y, z) {
  if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) return null;
  return state.cells[key(x, y, z)] ?? null;
}

function ensureCell(x, y, z) {
  const k = key(x, y, z);
  if (!state.cells[k])
    state.cells[k] = { x, y, z, type: null, revealed: false, playerIds: [], openEdges: [], layerLinksTo: null };
  return state.cells[k];
}

function setCell(x, y, z, props) {
  const cl = ensureCell(x, y, z);
  Object.assign(cl, props);
  return cl;
}

// ─── Init ────────────────────────────────────
let isSyncInit = false;

async function initMultiplayer() {
  listenToRoomChanges(roomID, (room) => {
    if (!room) return;
    roomData = room;

    const diffKey = room.difficulty || "normal";
    dc = DIFF[diffKey] || DIFF.normal;
    tilesNumber = dc.tilesNumber;

    if (room.state === "playing") {
      if (!isSyncInit) {
        // Première fois qu'on voit cet état — init
        isSyncInit = true;           // ← FIX: mis à true immédiatement pour bloquer les re-entrées
        startFirstTime(room);
      } else {
        // Déjà initialisé — juste synchroniser
        syncFromFirebase(room);
      }
    }
  });
}

function startFirstTime(room) {
  const user = auth.currentUser;
  const isLeader = room.leaderId === user.uid;

  setupUI();

  if (isLeader && !room.gameState) {
    // Le leader génère la partie
    state = {
      cells: {},
      players: [],
      tileStack: [],
      hazardDeck: [],
      currentPlayer: 0,
      round: 1,
      isPaused: false,
      isOver: false,
      isWinner: false,
      loseReason: "",
      totalMoves: 0,
      currentZ: 0,
      darknessTurns: 0,
      logs: [],
      lastHazard: null,
    };

    setCell(CENTER_C, CENTER_R, 0, { type: "start", revealed: true });
    recomputeAllEdges();
    buildTileStack();
    buildHazardDeck();

    state.players = Object.values(room.players).map((p, idx) => ({
      id: idx,
      uid: p.uid,
      name: p.name || "Explorateur",
      role: p.role,
      color: p.color,
      type: "human",
      hp: dc.maxHp, maxHp: dc.maxHp,
      ap: dc.maxAp, maxAp: dc.maxAp,
      x: CENTER_C, y: CENTER_R, z: 0,
      alive: true, escaped: false,
    }));
    getCell(CENTER_C, CENTER_R, 0).playerIds = state.players.map(p => p.id);

    // Sync vers Firebase — les non-leaders vont recevoir ça via syncFromFirebase
    updateRoom(roomID, { gameState: state });

    renderAll();
    startPlayerTurn(0);
    setTimeout(() => centerOnTile(CENTER_C, CENTER_R), 100);
    log("🔦 L'expédition commence en équipe !");

  } else if (room.gameState) {
    // Non-leader (ou leader qui recharge) avec un gameState existant
    syncFromFirebase(room);
    setTimeout(() => centerOnTile(CENTER_C, CENTER_R), 100);

  } else {
    // Non-leader, gameState pas encore généré — afficher un message et attendre
    // Le prochain appel Firebase avec gameState déclenchera syncFromFirebase via initMultiplayer
    document.getElementById("actionInfo").textContent = "En attente du chef d'expédition...";
    // FIX: remettre isSyncInit à false pour qu'on re-entre dans startFirstTime quand gameState arrive
    isSyncInit = false;
  }
}

let lastProcessedHazardId = null;
let lastProcessedPlayerId = null;
let lastProcessedMoves = -1;

function syncFromFirebase(room) {
  if (!room.gameState) {
    if (room.state === "setup") { window.location.href = `setup.html?id=${rawID}`; return; }
    if (room.state === "waiting") { window.location.href = `room.html?id=${rawID}`; return; }
    if (room.state === "playing") { window.location.href = `game.html?id=${rawID}`; return; }
    return;
  }

  const newState = room.gameState;
  if (!newState || !newState.players) return;

  // Game Over
  if (newState.isOver && !state.isOver) {
    state = newState;
    if (state.isWinner) triggerWin(true);
    else triggerLose(state.loseReason, true);
    return;
  }

  // Rejouer les logs manquants
  if (newState.logs && newState.logs.length) {
    const currentLogCount = state.logs ? state.logs.length : 0;
    for (let i = currentLogCount; i < newState.logs.length; i++) {
      log(newState.logs[i], true);
    }
  }

  const prevPlayer = state.currentPlayer;
  state = newState;

  // Firebase peut retourner des objets au lieu de tableaux
  if (state.players && !Array.isArray(state.players)) state.players = Object.values(state.players);
  if (state.tileStack && !Array.isArray(state.tileStack)) state.tileStack = Object.values(state.tileStack);
  if (state.hazardDeck && !Array.isArray(state.hazardDeck)) state.hazardDeck = Object.values(state.hazardDeck);
  if (state.logs && !Array.isArray(state.logs)) state.logs = Object.values(state.logs);
  if (state.darknessTurns !== undefined) state.darknessTurns = Number(state.darknessTurns) || 0;

  renderAll();
  updateHud();
  updateCounters();

  const p = state.players[state.currentPlayer];

  // FIX: toujours mettre à jour le turn banner, pas seulement pour le joueur actif
  if (p) updateTurnBanner(p);

  // FIX: si le joueur courant a changé, appeler startPlayerTurn pour setup propre
  // Mais uniquement si ce n'est PAS nous qui venons de jouer (pour éviter double-trigger)
  const iOwnCurrentTurn = p && p.uid === auth.currentUser?.uid;
  const turnChanged = state.currentPlayer !== prevPlayer;

  if (iOwnCurrentTurn && p.alive && !p.escaped && !state.isOver && !state.isPaused) {
    // C'est notre tour — mettre à jour highlights et info
    if (turnChanged) {
      // Nouveau tour pour nous — reset AP visuels et highlights
      p.ap = p.maxAp; // déjà dans state mais s'assurer
    }
    refreshHighlights(p);
    updateInfo(p);
  } else if (p) {
    // Ce n'est pas notre tour — juste afficher l'info
    document.getElementById("actionInfo").textContent = `C'est au tour de ${p.name}.`;
  }

  // Suivi caméra
  if (p && (state.totalMoves !== lastProcessedMoves)) {
    lastProcessedMoves = state.totalMoves;
    const hazardVisible = document.getElementById("hazardOverlay")?.style.display !== "none";
    if (!hazardVisible) centerOnTile(p.x, p.y);
  }

  // Animation danger pour les non-actifs
  if (state.lastHazard && state.lastHazard.id !== lastProcessedHazardId) {
    lastProcessedHazardId = state.lastHazard.id;
    if (p && p.uid !== auth.currentUser?.uid) {
      log(`⚠️ Événement : ${state.lastHazard.type}`, true);
      const h = state.lastHazard;
      showHazardCard(h.type, h.x, h.y, h.z);
    }
  }
}

async function leaveRoom() {
  const user = auth.currentUser;
  if (roomData && user) {
    const isLeader = roomData.leaderId === user.uid;
    const playerIds = Object.keys(roomData.players || {});
    // After game over, any player can delete the room; during game, only leader (or last player) deletes
    const shouldDelete = isLeader || playerIds.length <= 1 || (state && state.isOver);
    if (shouldDelete) {
      console.log("[leaveRoom] Deleting room", roomID, "isLeader:", isLeader, "isOver:", state?.isOver);
      await deleteRoom(roomID);
    } else {
      await updateRoom(roomID, { [`players/${user.uid}`]: null });
    }
  }
  window.location.href = "index.html";
}

// ─── Connexions ───────────────────────────────
function connOf(type) {
  return TILE_DEFS[type]?.conn || { n: false, e: false, s: false, w: false };
}

function getConnectedTilesInRange(startX, startY, startZ, range) {
  const result = [];
  const queue = [{ x: startX, y: startY, z: startZ, dist: 0 }];
  const visited = new Set([`${startX}:${startY}:${startZ}`]);

  while (queue.length > 0) {
    const { x, y, z, dist } = queue.shift();
    const cl = getCell(x, y, z);
    if (!cl || !cl.revealed) continue;

    result.push(cl);
    if (dist >= range) continue;

    const co = connOf(cl.type);
    for (const [dir, { dr, dc: dc2, opposite }] of Object.entries(DIRECTIONS)) {
      if (!co[dir]) continue;
      const nx = x + dc2, ny = y + dr;
      const nb = getCell(nx, ny, z);
      if (nb && nb.revealed && connOf(nb.type)[opposite]) {
        const k = `${nx}:${ny}:${z}`;
        if (!visited.has(k)) {
          visited.add(k);
          queue.push({ x: nx, y: ny, z: z, dist: dist + 1 });
        }
      }
    }
  }
  return result;
}

function centerOnTile(x, y) {
  const area = document.querySelector(".game-area");
  const el = document.querySelector(`.tile[data-x="${x}"][data-y="${y}"]`);
  if (!area || !el) return;
  const rect = el.getBoundingClientRect();
  const areaRect = area.getBoundingClientRect();
  const targetX = area.scrollLeft + (rect.left - areaRect.left) - (areaRect.width / 2) + (rect.width / 2);
  const targetY = area.scrollTop + (rect.top - areaRect.top) - (areaRect.height / 2) + (rect.height / 2);
  area.scrollTo({ left: targetX, top: targetY, behavior: "smooth" });
}

function recomputeEdges(x, y, z) {
  const cl = getCell(x, y, z);
  if (!cl || !cl.revealed) return;
  const co = connOf(cl.type);
  cl.openEdges = [];
  for (const [dir, { dr, dc: dc2 }] of Object.entries(DIRECTIONS)) {
    if (!co[dir]) continue;
    const nx = x + dc2, ny = y + dr;
    const nb = getCell(nx, ny, z);
    if (!nb || !nb.revealed) cl.openEdges.push(dir);
  }
}

function recomputeAllEdges() {
  if (!state.cells) return;
  for (const cl of Object.values(state.cells)) {
    if (cl.revealed) recomputeEdges(cl.x, cl.y, cl.z);
  }
}

// ─── Pile de tuiles ───────────────────────────
function buildTileStack() {
  const pool = [];
  TILE_TYPES.forEach(t => {
    if (t.isExit || t.isStart) return;
    for (let i = 0; i < t.weight; i++) pool.push(t.id);
  });
  const main = [];
  for (let i = 0; i <= tilesNumber; i++) main.push(pool[Math.floor(Math.random() * pool.length)]);
  shuffle(main);

  const exitCount = dc.exitCount, minPos = 30;
  const exitPositions = [];
  for (let i = 0; i < exitCount; i++) {
    const seg = Math.floor((tilesNumber - minPos) / exitCount);
    const s = minPos + i * seg, e = s + seg - 1;
    exitPositions.push(s + Math.floor(Math.random() * (e - s + 1)));
  }
  exitPositions.sort((a, b) => b - a);
  exitPositions.forEach(pos => main.splice(pos, 0, "exit"));

  const sorted = [...exitPositions].sort((a, b) => a - b);
  state.tileStack = main;
}

function drawTile() { return (state.tileStack && state.tileStack.length) ? state.tileStack.shift() : null; }
function tilesLeft() { return state.tileStack ? state.tileStack.length : 0; }


function buildHazardDeck() {
  const cards = [];
  for (let i = 0; i < dc.hazardCards; i++) cards.push(HAZARD_POOL[i % HAZARD_POOL.length]);
  shuffle(cards);
  cards.push("out-of-time");
  state.hazardDeck = cards;
}

// ─── Placement ────────────────────────────────
// Place une tuile tirée en (tx,ty,tz) venant de la direction fromDir (sur le même tz)
function placeTile(tileId, tx, ty, tz, fromDir) {
  const opposite = DIRECTIONS[fromDir].opposite;
  const cl = ensureCell(tx, ty, tz);

  if (tileId === "exit") {
    cl.type = "exit-" + opposite;
    cl.revealed = true;
    recomputeAllEdges();
    return cl.type;
  }

  const def = TILE_DEFS[tileId];
  const openCount = def ? Object.values(def.conn).filter(Boolean).length : 2;

  if (def && def.conn[opposite]) {
    cl.type = tileId;
  } else {
    const candidates = TILE_TYPES.filter(t =>
      !t.isExit && !t.isStart && t.conn[opposite] &&
      Object.values(t.conn).filter(Boolean).length === openCount
    );
    if (candidates.length) {
      cl.type = candidates[Math.floor(Math.random() * candidates.length)].id;
    } else {
      const fb = TILE_TYPES.find(t => !t.isExit && !t.isStart && t.conn[opposite] && t.conn[fromDir]);
      cl.type = fb ? fb.id : "cross";
    }
  }
  cl.revealed = true;

  // Si c'est une layer tile, on note vers quel z elle relie
  // Convention : fromDir = direction d'où vient le joueur (depuis le couloir)
  //   arriver par N ou W (fromDir=n/w) → on est "entré par le haut" → l'autre z = tz - 1
  //   arriver par S ou E (fromDir=s/e) → on est "entré par le bas" → l'autre z = tz + 1
  const finalDef = TILE_DEFS[cl.type];
  if (finalDef && finalDef.isLayer) {
    const otherZ = (fromDir === "s" || fromDir === "e") ? tz - 1 : tz + 1;
    cl.layerLinksTo = otherZ;

    // Mirror the layer tile on the other level
    const mirrored = setCell(tx, ty, otherZ, {
      type: cl.type,
      revealed: true,
      layerLinksTo: tz // Point back to the originating level
    });

    log(`↕️ Tuile de changement de niveau posée (z${tz} ↔ z${otherZ})`);
  }

  recomputeAllEdges();
  return cl.type;
}

// ─── Actions ──────────────────────────────────
function doReveal(fromX, fromY, fromZ, dir) {
  const p = state.players[state.currentPlayer];
  if (p.uid !== auth.currentUser.uid) return null;

  const tileId = drawTile();
  if (!tileId) { log("La pile est vide !"); return null; }
  const { dr, dc: dc2 } = DIRECTIONS[dir];
  const tx = fromX + dc2, ty = fromY + dr;
  const finalType = placeTile(tileId, tx, ty, fromZ, dir);
  updateCounters();
  if (finalType && finalType.startsWith("exit-")) log("🚪 LA SORTIE EST RÉVÉLÉE ! Rejoignez-la !");
  else log(`🗺️ Tuile révélée.`);

  // Update deck and state immediately to avoid race conditions
  updateRoom(roomID, {
    "gameState/tileStack": state.tileStack,
    "gameState/cells": state.cells,
    "gameState/logs": state.logs,
    "gameState/round": state.round
  });
  return { x: tx, y: ty, z: fromZ, type: finalType };
}

function doMove(player, tx, ty, tz) {
  if (player.uid !== auth.currentUser.uid) return;

  // Retirer de l'ancienne cellule
  const oldCl = getCell(player.x, player.y, player.z);
  if (oldCl) {
    if (!oldCl.playerIds) oldCl.playerIds = [];
    oldCl.playerIds = oldCl.playerIds.filter(id => id !== player.id);
  }

  const targetCl = getCell(tx, ty, tz);
  const targetDef = targetCl ? TILE_DEFS[targetCl.type] : null;

  // Si on entre dans une layer tile, le z du joueur devient celui de l'autre côté
  if (targetDef && targetDef.isLayer && targetCl.layerLinksTo !== null) {
    const oldZ = player.z;
    const newZ = targetCl.layerLinksTo;
    player.z = newZ;
    state.currentZ = newZ;
    log(`${newZ < oldZ ? "⬇️" : "⬆️"} ${player.name} ${newZ < oldZ ? "descend" : "monte"} au niveau ${newZ}`);
    updateLevelBanner();
  } else {
    // Déplacement normal : le z reste celui de la destination
    player.z = tz;
    state.currentZ = tz;
  }

  player.x = tx; player.y = ty;
  player.ap -= 1;
  state.totalMoves++;

  // S'assurer que la cellule de destination existe et est RÉVÉLÉE
  const destCl = ensureCell(player.x, player.y, player.z);
  destCl.revealed = true; // Empêche le noir total à l'arrivée
  if (!destCl.playerIds) destCl.playerIds = [];
  destCl.playerIds.push(player.id);

  if (destCl && destCl.type && destCl.type.startsWith("exit-")) {
    player.escaped = true;
    log(`🎉 ${player.name} atteint la SORTIE !`);
    checkWin();
  }

  updateRoom(roomID, { gameState: state });
}

// ─── Queries ──────────────────────────────────
function getRevealableEdges(player) {
  const cl = getCell(player.x, player.y, player.z);
  if (!cl || !cl.revealed) return [];
  return (cl.openEdges || []).map(dir => {
    const { dr, dc: dc2 } = DIRECTIONS[dir];
    return {
      fromX: player.x, fromY: player.y, fromZ: player.z, dir,
      tx: player.x + dc2, ty: player.y + dr, tz: player.z
    };
  });
}

function getMovableCells(player) {
  const cl = getCell(player.x, player.y, player.z);
  if (!cl) return [];
  const co = connOf(cl.type);
  const result = [];

  for (const [dir, { dr, dc: dc2, opposite }] of Object.entries(DIRECTIONS)) {
    if (!co[dir]) continue;
    const nx = player.x + dc2, ny = player.y + dr;

    // Tuile sur le z courant (inclut les layer tiles)
    // doMove s'occupe de changer player.z si c'est une layer
    const nb = getCell(nx, ny, player.z);
    if (nb && nb.revealed && nb.type && connOf(nb.type)[opposite]) {
      result.push({ x: nx, y: ny, z: player.z, destZ: player.z, isLayer: !!(TILE_DEFS[nb.type]?.isLayer) });
      continue;
    }

    // Si on est SUR une layer tile : accès à la tuile de l'autre z connectée
    if (TILE_DEFS[cl.type]?.isLayer && cl.layerLinksTo !== null) {
      const otherZ = cl.layerLinksTo;
      const nbOther = getCell(nx, ny, otherZ);
      if (nbOther && nbOther.revealed && nbOther.type && connOf(nbOther.type)[opposite]) {
        result.push({ x: nx, y: ny, z: otherZ, destZ: otherZ, isLayer: false });
      }
    }
  }
  return result;
}

// ─── Click handler ────────────────────────────
function onTileClick(x, y) {
  if (state.isOver || state.isPaused) return;
  const player = state.players[state.currentPlayer];
  if (!player || player.type === "ai" || !player.alive || player.escaped) return;
  if (player.ap <= 0) return;

  const cl = getCell(x, y, state.currentZ);

  // Case 1 : tuile non révélée → révéler (+ mouvement auto si possible)
  if (!cl || !cl.revealed) {
    const edges = getRevealableEdges(player);
    const edge = edges.find(e => e.tx === x && e.ty === y);
    if (!edge) return;
    const result = doReveal(edge.fromX, edge.fromY, edge.fromZ, edge.dir);
    if (!result) return;
    //player.ap -= 1;

    // Tentative de mouvement automatique après révélation
    const nb = getCell(x, y, state.currentZ);
    const opp = DIRECTIONS[edge.dir].opposite;
    const canStepIn = nb && nb.revealed && connOf(nb.type)[opp];

    if (canStepIn && player.ap > 0) {
      const movable = getMovableCells(player);
      const target = movable.find(m => m.x === x && m.y === y);
      if (target) {
        doMove(player, x, y, target.destZ);
      }
    }

    renderAll();
    if (state.isOver) return;
    if (player.ap <= 0) { endTurnActions(player); return; }
    refreshHighlights(player); updateInfo(player);
    return;
  }

  // Case 2 : tuile movable (même z ou voisine d'un autre z visible)
  if (cl.revealed) {
    const movable = getMovableCells(player);
    const target = movable.find(m => m.x === x && m.y === y);
    if (!target) { refreshHighlights(player); return; }
    doMove(player, x, y, target.destZ);
    renderAll();
    if (state.isOver) return;
    if (player.ap <= 0) { endTurnActions(player); return; }
    refreshHighlights(player); updateInfo(player);
    return;
  }
}

// Case 3b : clic sur une tuile de l'autre z visible (voisine d'une layer)
// → géré directement via le dataset de la tuile qui porte un z différent
function onTileClickWithZ(x, y, z) {
  if (state.isOver || state.isPaused) return;
  const player = state.players[state.currentPlayer];
  if (!player || player.type === "ai" || !player.alive || player.escaped) return;
  if (player.ap <= 0) return;

  const movable = getMovableCells(player);
  const target = movable.find(m => m.x === x && m.y === y && m.z === z);
  if (!target) return;
  doMove(player, x, y, target.destZ);
  renderAll();
  if (state.isOver) return;
  if (player.ap <= 0) { endTurnActions(player); return; }
  refreshHighlights(player); updateInfo(player);
}

function endTurnActions(player) {
  updateInfo(player, true);
  setTimeout(() => nextPlayer(), 600);
}

// ─── Highlights ───────────────────────────────
function refreshHighlights(player) {
  document.querySelectorAll(".tile.revealable,.tile.movable,.tile.movable-other-z")
    .forEach(el => el.classList.remove("revealable", "movable", "movable-other-z"));
  if (!player || !player.alive || player.escaped || player.ap <= 0) return;

  getMovableCells(player).forEach(({ x, y, z }) => {
    const el = document.querySelector(`.tile[data-x="${x}"][data-y="${y}"][data-z="${z}"]`);
    if (el) el.classList.add(z !== state.currentZ ? "movable-other-z" : "movable");
  });

  getRevealableEdges(player).forEach(e => {
    const el = document.querySelector(`.tile[data-x="${e.tx}"][data-y="${e.ty}"][data-z="${e.tz}"]`);
    if (el) el.classList.add("revealable");
  });
}

function updateInfo(player, apEmpty) {
  const info = document.getElementById("actionInfo");
  if (apEmpty || player.ap <= 0) { info.textContent = `${player.name} — tour terminé…`; return; }
  const movable = getMovableCells(player);
  const edges = getRevealableEdges(player).length;
  const normal = movable.filter(m => m.z === player.z).length;
  const layerMoves = movable.filter(m => m.isLayer).length;
  const otherZ = movable.filter(m => m.z !== player.z && !m.isLayer).length;
  const parts = [];
  if (edges > 0) parts.push(`${edges} à révéler 🟡`);
  if (normal > 0) parts.push(`${normal} dépl. 🔵`);
  if (layerMoves > 0) parts.push(`${layerMoves} escalier ↕️`);
  if (otherZ > 0) parts.push(`${otherZ} autre niv. 🟣`);
  const lvl = player.z !== 0 ? ` · Niv.${player.z > 0 ? "+" : ""}${player.z}` : "";
  info.textContent = `${player.name} — ${player.ap} AP${lvl} — ${parts.join(" · ") || "aucune action"}`;
}

// ─── Level banner ─────────────────────────────
function updateLevelBanner(p) {
  const z = (p || state.players[state.currentPlayer])?.z ?? 0;
  const el = document.getElementById("layerNum");
  if (el) el.textContent = z;
}

// ─── Turn flow ────────────────────────────────
function startPlayerTurn(idx) {
  state.currentPlayer = idx;
  const p = state.players[idx];
  if (!p.alive || p.escaped) { nextPlayer(); return; }
  p.ap = p.maxAp;
  if (p.cursed) {
    p.ap = Math.max(0, p.ap - 1);
    p.cursed = false;
    log(`🌬️ ${p.name} est encore fatigué par le courant d'air... (-1 AP)`);
  }
  state.currentZ = p.z;
  updateTurnBanner(p); updateLevelBanner(p); updateHud();
  renderAll();

  setTimeout(() => centerOnTile(p.x, p.y), 100);

  if (p.type === "ai") {
    // Only the leader runs AI logic to avoid conflicts
    if (roomData && roomData.leaderId === auth.currentUser.uid) {
      document.getElementById("actionInfo").textContent = `${p.name} réfléchit… (IA)`;
      setTimeout(() => runAI(p), 700);
    } else {
      document.getElementById("actionInfo").textContent = `${p.name} (IA) en action...`;
    }
  } else if (p.uid === auth.currentUser.uid) {
    refreshHighlights(p); updateInfo(p);
  } else {
    document.getElementById("actionInfo").textContent = `C'est au tour de ${p.name}.`;
  }
}

function nextPlayer() {
  if (state.isOver) return;
  const p = state.players[state.currentPlayer];
  if (p.uid !== auth.currentUser.uid) return;

  document.querySelectorAll(".tile.revealable,.tile.movable,.tile.movable-other-z")
    .forEach(el => el.classList.remove("revealable", "movable", "movable-other-z"));
  const alive = state.players.filter(p => p.alive && !p.escaped);
  if (!alive.length) { checkWin(); return; }
  let next = (state.currentPlayer + 1) % state.players.length, tries = 0;
  while ((!state.players[next].alive || state.players[next].escaped) && tries < state.players.length) {
    next = (next + 1) % state.players.length; tries++;
  }
  if (tries < state.players.length && next <= state.currentPlayer) {
    state.round++;
    document.getElementById("roundNum").textContent = state.round;
    // Hazard resolution should also be synced. 
    // Simplified: only the current player triggers the next round hazard
    endRoundHazard(() => {
      // Decrement darkness AFTER the hazard card is applied (prevents obscurité from overwriting decrement)
      if (state.darknessTurns > 0) {
        state.darknessTurns = Math.max(0, Number(state.darknessTurns) - 1);
        if (state.darknessTurns === 0) log("💡 La lumière revient !");
      }
      startPlayerTurn(next);
      updateRoom(roomID, { gameState: state });
    });
    if (state.isOver) return;
  } else {
    startPlayerTurn(next);
    updateRoom(roomID, { gameState: state });
  }
}

// ─── Hazard ───────────────────────────────────
function endRoundHazard(callback) {
  if (!state.hazardDeck || !state.hazardDeck.length) { triggerLose("Plus de cartes évènements."); return; }
  const card = state.hazardDeck.shift();
  // Sync the deck removal immediately
  updateRoom(roomID, { "gameState/hazardDeck": state.hazardDeck });

  resolveHazard(card, callback);
  updateCounters();
}

function resolveHazard(card, callback) {
  if (card === "out-of-time") {
    log("⏰ TEMPS ÉCOULÉ.");
    triggerLose("Le temps est écoulé.");
    return;
  }

  // Pick a target location (usually where players are or a random revealed tile)
  const alivePlayers = (state.players || []).filter(p => p.alive && !p.escaped);
  const targetPlayer = alivePlayers.length ? alivePlayers[Math.floor(Math.random() * alivePlayers.length)] : null;
  const revealedTiles = Object.values(state.cells || {}).filter(cl => cl.revealed && !TILE_DEFS[cl.type]?.isStart);
  const targetTile = targetPlayer ? getCell(targetPlayer.x, targetPlayer.y, targetPlayer.z) : (revealedTiles.length ? revealedTiles[Math.floor(Math.random() * revealedTiles.length)] : null);

  if (!targetTile) { if (callback) callback(); checkWin(); return; }

  // Sync hazard info for everyone
  state.lastHazard = {
    id: Date.now() + "_" + Math.floor(Math.random() * 1000),
    type: card,
    x: targetTile.x,
    y: targetTile.y,
    z: targetTile.z
  };
  updateRoom(roomID, { "gameState/lastHazard": state.lastHazard });

  showHazardCard(card, targetTile.x, targetTile.y, targetTile.z, () => {
    // Apply effect after a short delay (animation is now handled inside showHazardCard)
    setTimeout(() => {
      // Use coordinates instead of object reference to avoid desync issues
      applyRefinedHazard(card, targetTile.x, targetTile.y, targetTile.z);

      // Clear lastHazard after resolution to prevent redundant popups
      state.lastHazard = null;
      updateRoom(roomID, { "gameState": state });

      if (callback) callback();
    }, 1000);
  });
}

function applyRefinedHazard(card, hX, hY, hZ) {
  const targetTile = getCell(hX, hY, hZ);
  if (!targetTile) return;

  switch (card) {
    case "seisme":
      log("🫨 SÉISME !");
      const sameWeight = TILE_TYPES.filter(t => !t.isStart && !t.isExit && !t.isLayer && t.weight > 0);
      targetTile.type = sameWeight[Math.floor(Math.random() * sameWeight.length)].id;
      recomputeAllEdges();
      log(`  ↳ Structure modifiée en [${hX},${hY}]`);
      break;

    case "effondrement":
      log("🪨 EFFONDREMENT !");
      if (Math.random() < 0.3) {
        // Open a random wall
        const def = TILE_DEFS[targetTile.type];
        const sides = ['n', 'e', 's', 'w'];
        const closed = sides.filter(s => !def.conn[s]);
        if (closed.length) {
          const s = closed[Math.floor(Math.random() * closed.length)];
          // We cheat a bit by finding a type that adds this connection
          const better = TILE_TYPES.find(t => t.conn[s] && !t.isStart && !t.isExit && !t.isLayer);
          if (better) { targetTile.type = better.id; log(`  ↳ Un passage s'est ouvert en ${s.toUpperCase()} !`); }
        }
      } else {
        log("  ↳ Débris tombant !");
        let hit = false;
        state.players.forEach(p => {
          if (Number(p.x) === Number(hX) && Number(p.y) === Number(hY) && Number(p.z) === Number(hZ) && p.alive && !p.escaped) {
            p.hp = Math.max(0, Number(p.hp) - 1);
            log(`  ↳ ${p.name} blessé (-1 HP). Reste: ${p.hp}`); // Broadcast
            if (p.hp <= 0) killPlayer(p, "écrasé par des rochers");
            hit = true;
          }
        });
        if (!hit) log("  ↳ Heureusement, personne n'était là.");
        updateHud();
      }
      recomputeAllEdges();
      break;

    case "obscurite":
      log("🕯️ OBSCURITÉ !");
      state.darknessTurns = 3;
      log("  ↳ Toutes les lampes faiblissent... (3 tours)");
      break;

    case "eboulement":
      log("🧱 ÉBOULEMENT !");
      // Block 1..4 connections
      const count = 1 + Math.floor(Math.random() * 3);
      const sidesToBlock = ['n', 'e', 's', 'w'].sort(() => Math.random() - 0.5).slice(0, count);
      // For now, change to a type with very few connections roughly matching the block
      const candidate = TILE_TYPES.filter(t => !t.isStart && !t.isExit && !t.isLayer)
        .sort((a, b) => Object.values(a.conn).filter(v => v).length - Object.values(b.conn).filter(v => v).length)[0];
      targetTile.type = candidate.id;
      log(`  ↳ ${count} passage(s) bouché(s) !`);
      recomputeAllEdges();
      break;

    case "courant_air":
      log("🌬️ COURANT D'AIR !");
      const affectedTiles = getConnectedTilesInRange(hX, hY, hZ, 3);
      let hitAp = false;
      state.players.forEach(p => {
        if (p.alive && !p.escaped) {
          const isOnAffected = affectedTiles.some(t =>
            Number(t.x) === Number(p.x) && Number(t.y) === Number(p.y) && Number(t.z) === Number(p.z)
          );
          if (isOnAffected) {
            p.cursed = true;
            log(`  ↳ ${p.name} est essoufflé par le vent (-1 AP au prochain tour).`);
            hitAp = true;
          }
        }
      });
      if (!hitAp) log("  ↳ Le vent siffle sans toucher personne.");
      updateHud();
      break;
  }
  checkWin();
  renderAll();
  updateHud();
}

function killPlayer(p, reason) {
  p.alive = false; p.hp = 0;
  const cl = getCell(p.x, p.y, p.z);
  if (cl) cl.playerIds = cl.playerIds.filter(id => id !== p.id);
  log(`💀 ${p.name} est mort (${reason}).`);
}

// ─── Win / Lose ───────────────────────────────
function checkWin() {
  const alive = state.players.filter(p => p.alive);
  if (!alive.length) { triggerLose("Tous les explorateurs sont morts."); return; }
  if (alive.every(p => p.escaped)) triggerWin();
  //TODO : lose if there is no escape cell left

}
function triggerWin(isRemote = false) {
  if (state.isOver && !isRemote) return;
  state.isOver = true;
  state.isWinner = true;

  const localPlayer = state.players.find(p => p.uid === auth.currentUser.uid);
  const isMeDead = localPlayer && !localPlayer.alive;

  setTimeout(() => {
    if (isMeDead) {
      document.querySelector("#winOverlay h2").textContent = "Expédition terminée";
      document.querySelector("#winOverlay .overlay-sub").textContent = "L'équipe a réussi à s'en sortir, mais vous y avez laissé la vie...";
    } else {
      document.querySelector("#winOverlay h2").textContent = "Expédition réussie";
      document.querySelector("#winOverlay .overlay-sub").textContent = "L'équipe a trouvé la sortie.";
    }

    document.getElementById("finalStats").innerHTML = `
      <div class="final-stat"><span class="final-stat-label">Tours</span><span class="final-stat-value">${state.round}</span></div>
      <div class="final-stat"><span class="final-stat-label">Déplacements</span><span class="final-stat-value">${state.totalMoves}</span></div>
      <div class="final-stat"><span class="final-stat-label">Tuiles restantes</span><span class="final-stat-value">${tilesLeft()}</span></div>`;
    document.getElementById("winOverlay").style.display = "flex";
  }, 500);

  if (!isRemote) {
    updateRoom(roomID, { gameState: state });
    log("🎊 VICTOIRE ! L'expédition est un succès.");
  }
}

function triggerLose(reason, isRemote = false) {
  if (state.isOver && !isRemote) return;
  state.isOver = true;
  state.isWinner = false;
  state.loseReason = reason;

  setTimeout(() => {
    document.getElementById("loseReason").textContent = reason;
    document.getElementById("loseOverlay").style.display = "flex";
  }, 500);

  if (!isRemote) {
    updateRoom(roomID, { gameState: state });
    log(`💀 DÉFAITE : ${reason}`);
  }
}

// ─── AI ───────────────────────────────────────
function runAI(player) {
  if (!player.alive || player.escaped || player.ap <= 0) { setTimeout(() => nextPlayer(), 400); return; }
  const exitLoc = findExitCell(player);
  const movable = getMovableCells(player);
  const edges = getRevealableEdges(player);
  if (exitLoc && movable.length) {
    const best = [...movable].sort((a, b) =>
      (Math.abs(a.x - exitLoc.x) + Math.abs(a.y - exitLoc.y)) - (Math.abs(b.x - exitLoc.x) + Math.abs(b.y - exitLoc.y))
    )[0];
    doMove(player, best.x, best.y, best.destZ); renderAll(); updateHud();
    if (!player.escaped && player.ap > 0) setTimeout(() => runAI(player), 450); else setTimeout(() => nextPlayer(), 450); return;
  }
  if (edges.length && player.ap >= 1) {
    const edge = edges[Math.floor(Math.random() * edges.length)];
    const result = doReveal(edge.fromX, edge.fromY, edge.fromZ, edge.dir);
    if (result) {
      player.ap -= 1;
      const onto = getMovableCells(player).find(m => m.x === result.x && m.y === result.y);
      if (onto && player.ap >= 1) doMove(player, onto.x, onto.y, onto.destZ);
    }
    renderAll(); updateHud();
    if (!player.escaped && player.ap > 0) setTimeout(() => runAI(player), 500); else setTimeout(() => nextPlayer(), 500); return;
  }
  if (movable.length && player.ap > 0) {
    const m = movable[0]; doMove(player, m.x, m.y, m.destZ); renderAll(); updateHud();
    setTimeout(() => runAI(player), 400); return;
  }
  setTimeout(() => nextPlayer(), 400);
}

function findExitCell(player) {
  if (!state.cells) return null;
  let best = null, bestDist = Infinity;
  for (const cl of Object.values(state.cells)) {
    if (cl.type && cl.type.startsWith("exit-") && cl.z === player.z) {
      const d = Math.abs(cl.x - player.x) + Math.abs(cl.y - player.y);
      if (d < bestDist) { bestDist = d; best = cl; }
    }
  }
  return best;
}

// ══════════════════════════════════════════
//  RENDU
//  Pour le z courant, on collecte :
//   A) Toutes les cellules révélées au z courant
//   B) Les layer tiles du z courant (elles-mêmes)
//   C) Pour chaque layer tile visible : la/les tuile(s) directement
//      connectée(s) de l'autre z (si révélée), rendue en mode "ghost"
// ══════════════════════════════════════════

// Construit la liste de tout ce qui doit être rendu
// Retourne un Map (x,y) → { primary: cellule principale, ghost: cellule ghost ou null }
function buildRenderMap() {
  const renderMap = new Map(); // key "x:y" → { cell, ghostCell, ghostDir }
  if (!state.cells) return renderMap;

  // Toutes les cellules du z courant
  for (const cl of Object.values(state.cells)) {
    if (cl.z !== state.currentZ) continue;
    const k = `${cl.x}:${cl.y}`;
    if (!renderMap.has(k)) renderMap.set(k, { cell: cl, ghostCell: null, ghostDir: null });
    else renderMap.get(k).cell = cl;
  }

  // Pour chaque layer tile du z courant révélée, chercher la tuile de l'autre z
  // qui est directement connectée (dans la direction de sortie de la layer)
  for (const [k, entry] of renderMap) {
    const cl = entry.cell;
    if (!cl || !cl.revealed) continue;
    const def = TILE_DEFS[cl.type];
    if (!def || !def.isLayer || cl.layerLinksTo === null) continue;

    const otherZ = cl.layerLinksTo;
    const co = connOf(cl.type);

    // Trouver la direction "sortie" = la direction de la layer qui n'est pas "entrée"
    // La layer a 2 connexions (N/S ou E/W). L'entrée vient de là où le joueur était.
    // On cherche toutes les directions connectées et on regarde si une tuile de otherZ existe
    for (const [dir, { dr, dc: dc2 }] of Object.entries(DIRECTIONS)) {
      if (!co[dir]) continue;
      const nx = cl.x + dc2, ny = cl.y + dr;
      const nbOther = getCell(nx, ny, otherZ);
      if (nbOther && nbOther.revealed) {
        // Cette tuile est visible en "ghost" depuis le z courant
        const gk = `${nx}:${ny}`;
        if (!renderMap.has(gk)) {
          renderMap.set(gk, { cell: null, ghostCell: nbOther, ghostDir: dir });
        } else if (!renderMap.get(gk).cell) {
          renderMap.get(gk).ghostCell = nbOther;
          renderMap.get(gk).ghostDir = dir;
        }
        // si la case est déjà occupée par une tuile du z courant, on ne superpose pas le ghost
      }
    }
  }

  return renderMap;
}

function renderAll() {
  if (!state || !state.cells || Object.keys(state.cells).length === 0) return;
  renderGrid();
  updateHud();
  updateLevelNav();
  const p = (state.players && state.players.length) ? state.players[state.currentPlayer] : null;
  if (p && p.type === "human" && !state.isOver) refreshHighlights(p);
}

function updateLevelNav() {
  const nav = document.getElementById("levelNav");
  if (!nav || !state.cells) return;

  // Identify all discovered levels (Z)
  const discoveredLevels = new Set([0]); // Start level always there
  for (const cl of Object.values(state.cells)) {
    if (cl.revealed) discoveredLevels.add(cl.z);
  }

  const sortedLevels = Array.from(discoveredLevels).sort((a, b) => b - a);

  nav.innerHTML = "";
  sortedLevels.forEach(z => {
    const item = document.createElement("div");
    item.className = `level-nav-item ${state.currentZ === z ? "active" : ""}`;
    item.innerHTML = `
      <span class="level-label">Niveau</span>
      <span class="level-num">${z}</span>
    `;
    item.onclick = () => {
      state.currentZ = z;
      renderAll();
    };
    nav.appendChild(item);
  });
}

function renderGrid() {
  const gridEl = document.getElementById("caveGrid");
  gridEl.style.gridTemplateColumns = `repeat(${GRID_COLS}, var(--tile-size))`;
  gridEl.style.gridTemplateRows = `repeat(${GRID_ROWS}, var(--tile-size))`;
  gridEl.innerHTML = "";

  const renderMap = buildRenderMap();

  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      const rk = `${x}:${y}`;
      const entry = renderMap.get(rk);
      const el = document.createElement("div");
      el.className = "tile";
      el.dataset.x = x; el.dataset.y = y; el.dataset.z = state.currentZ;

      if (!entry) {
        // Case vide (aucune tuile ni ghost)
        el.classList.add("unexplored");
        // Fog of War check
        if (state.darknessTurns > 0) {
          const cp = state.players[state.currentPlayer];
          const isNear = cp && cp.alive && !cp.escaped && Math.abs(cp.x - x) <= 1 && Math.abs(cp.y - y) <= 1 && cp.z === state.currentZ;
          if (!isNear) el.classList.add("fog-of-war");
        }
        el.addEventListener("click", () => onTileClick(x, y));
        gridEl.appendChild(el); continue;
      }

      const { cell: cl, ghostCell } = entry;

      // Fog of War check for revealed/ghost tiles
      if (state.darknessTurns > 0) {
        const cp = state.players[state.currentPlayer];
        const isNear = cp && cp.alive && !cp.escaped && Math.abs(cp.x - x) <= 1 && Math.abs(cp.y - y) <= 1 && cp.z === state.currentZ;
        if (!isNear) el.classList.add("fog-of-war");
      }

      // Ghost : tuile de l'autre z visible car connectée à une layer
      if (!cl && ghostCell) {
        el.classList.add("revealed", "ghost-tile");
        el.dataset.x = ghostCell.x; el.dataset.y = ghostCell.y; el.dataset.z = ghostCell.z;
        el.addEventListener("click", () => onTileClickWithZ(ghostCell.x, ghostCell.y, ghostCell.z));
        el.appendChild(buildTileInner(ghostCell));
        // Badge niveau
        const badge = document.createElement("div"); badge.className = "ghost-badge";
        badge.textContent = ghostCell.z > state.currentZ ? "⬆️" : "⬇️";
        el.appendChild(badge);
        gridEl.appendChild(el); continue;
      }

      if (!cl) { el.classList.add("unexplored"); el.addEventListener("click", () => onTileClick(x, y)); gridEl.appendChild(el); continue; }

      if (!cl.revealed) {
        el.classList.add("unexplored");
        el.addEventListener("click", () => onTileClick(x, y));

        // Safety: always show tokens if players are present
        if (cl.playerIds.length) {
          const tl = document.createElement("div"); tl.className = "tokens-layer";
          cl.playerIds.forEach(pid => {
            const p = state.players.find(x => x.id === pid);
            if (!p || !p.alive) return;
            const tk = document.createElement("div");
            tk.className = "player-token" + (p.id === state.players[state.currentPlayer]?.id ? " active-player" : "");
            tk.style.background = p.color; tk.textContent = p.name[0].toUpperCase();
            tl.appendChild(tk);
          });
          el.appendChild(tl);
        }

        gridEl.appendChild(el); continue;
      }

      // Tuile normale révélée
      el.classList.add("revealed");
      el.dataset.type = cl.type || "";
      el.addEventListener("click", () => onTileClick(x, y));
      el.appendChild(buildTileInner(cl));

      if (cl.type === "start") {
        const l = document.createElement("div"); l.className = "tile-label start-lbl"; l.textContent = "DÉPART"; el.appendChild(l);
      }

      // Re-apply highlight if this tile is the target of current hazard
      if (state.lastHazard && Number(state.lastHazard.x) === Number(x) && Number(state.lastHazard.y) === Number(y) && Number(state.lastHazard.z) === Number(state.currentZ)) {
        el.classList.add("hazard-highlight");
      }
      if (cl.type && cl.type.startsWith("exit-")) {
        const l = document.createElement("div"); l.className = "tile-label exit-lbl"; l.textContent = "SORTIE"; el.appendChild(l);
      }

      (cl.openEdges || []).forEach(dir => {
        const ind = document.createElement("div"); ind.className = `open-edge open-edge-${dir}`; el.appendChild(ind);
      });

      // Jetons joueurs
      if (cl.playerIds && cl.playerIds.length) {
        const tl = document.createElement("div"); tl.className = "tokens-layer";
        cl.playerIds.forEach(pid => {
          const p = state.players.find(x => x.id === pid);
          if (!p || !p.alive) return;
          const tk = document.createElement("div");
          tk.className = "player-token" + (p.id === state.players[state.currentPlayer]?.id ? " active-player" : "") + (p.type === "ai" ? " ai-token" : "");
          tk.style.background = p.color; tk.textContent = p.name[0].toUpperCase();
          tl.appendChild(tk);
        });
        el.appendChild(tl);
      }

      gridEl.appendChild(el);
    }
  }
}

function buildTileInner(cl) {
  const inner = document.createElement("div"); inner.className = "tile-inner";
  const def = TILE_DEFS[cl.type]; if (!def) return inner;
  const hub = document.createElement("div"); hub.className = "tunnel-center"; inner.appendChild(hub);
  for (const [dir, cls] of Object.entries({ n: "arm-n", e: "arm-e", s: "arm-s", w: "arm-w" })) {
    if (def.conn[dir]) {
      const arm = document.createElement("div"); arm.className = `tunnel-arm ${cls}`; inner.appendChild(arm);
    }
  }
  if (def.isLayer) {
    const steps = document.createElement("div"); steps.className = `layer-steps ${cl.type}`;
    for (let i = 0; i < 6; i++) { const s = document.createElement("div"); s.className = "layer-step"; steps.appendChild(s); }
    inner.appendChild(steps);
    const arrow = document.createElement("div"); arrow.className = "layer-arrow";
    arrow.textContent = cl.layerLinksTo !== null ? (cl.layerLinksTo < cl.z ? "⬇️" : "⬆️") : "↕️";
    inner.appendChild(arrow);
  }
  if (cl.type && cl.type.startsWith("deadend-")) inner.appendChild(Object.assign(document.createElement("div"), { className: "dead-wall" }));
  if (cl.type && cl.type.startsWith("exit-")) inner.appendChild(Object.assign(document.createElement("div"), { className: "dead-wall exit-wall" }));
  return inner;
}

// ─── HUD ──────────────────────────────────────
function updateHud() {
  const hud = document.getElementById("playersHud"); if (!hud) return;
  hud.innerHTML = "";
  if (!state.players) return;
  state.players.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "player-hud-card" + (i === state.currentPlayer ? " active" : "") + (!p.alive ? " dead" : "") + (p.escaped ? " escaped" : "");
    const dot = document.createElement("div"); dot.className = "phud-dot"; dot.style.background = p.color;
    const name = document.createElement("div"); name.className = "phud-name";
    const lvlTag = p.z !== 0 ? ` <span style="font-size:10px;opacity:.7">[${p.z > 0 ? "+" : ""}${p.z}]</span>` : "";
    name.innerHTML = p.name.replace(/^(L'|Le |La )/, "") + lvlTag;
    const hpEl = document.createElement("div"); hpEl.className = "phud-hp";
    for (let h = 0; h < p.maxHp; h++) hpEl.appendChild(Object.assign(document.createElement("div"), { className: "hp-pip" + (h < p.hp ? " full" : "") }));
    const apEl = document.createElement("div"); apEl.className = "phud-ap";
    if (i === state.currentPlayer && p.alive && !p.escaped) {
      for (let a = 0; a < p.maxAp; a++) apEl.appendChild(Object.assign(document.createElement("div"), { className: "ap-pip" + (a < p.ap ? " full" : "") }));
    }
    const act = document.createElement("div"); act.className = "phud-actions";
    if (p.escaped) act.textContent = "✓ Sorti"; else if (!p.alive) act.textContent = "✗ Mort";
    card.append(dot, name, hpEl, apEl, act); hud.appendChild(card);
  });
  document.getElementById("roundNum").textContent = state.round;
}

function updateTurnBanner(p) {
  document.getElementById("turnBanner").textContent = `Tour de ${p.name}${p.type === "ai" ? " (IA)" : ""}`;
}
function updateCounters() {
  const sc = document.getElementById("stackCounter"), hc = document.getElementById("hazardCounter");
  if (sc) sc.textContent = `🃏 ${tilesLeft()} tuiles`;
  if (hc && state.hazardDeck) hc.textContent = `⚠️ ${state.hazardDeck.length} cartes évènements`;
}

// ─── Log ──────────────────────────────────────
function log(msg, localOnly = false) {
  console.log(`[LostBelow] ${msg}`);
  const el = document.getElementById("logEntries"); if (!el) return;
  const line = document.createElement("div"); line.className = "log-line"; line.textContent = msg;
  el.prepend(line);
  while (el.children.length > 20) el.removeChild(el.lastChild);

  if (!localOnly && state && !state.isOver) {
    if (!state.logs) state.logs = [];
    state.logs.push(msg);
    // On garde que les 30 derniers logs en DB pour pas saturer
    if (state.logs.length > 30) state.logs.shift();
    updateRoom(roomID, { "gameState/logs": state.logs });
  }
}

// ─── Setup UI ─────────────────────────────────
function setupUI() {
  const bar = document.querySelector(".action-bar");
  let ctr = document.getElementById("tileCounters"); if (ctr) ctr.remove();
  ctr = document.createElement("div"); ctr.id = "tileCounters"; ctr.className = "tile-counters";
  const tCount = tilesLeft();
  const hCount = state.hazardDeck ? state.hazardDeck.length : 0;
  ctr.innerHTML = `<span id="stackCounter">🃏 ${tCount} tuiles</span><span id="hazardCounter">⚠️ ${hCount} cartes évènements</span>`;
  bar.insertBefore(ctr, bar.firstChild);

  const btns = document.getElementById("actionButtons");
  btns.innerHTML = `<button class="action-btn end" id="btnEnd">Fin de tour →</button>`;

  // ─── Rules ──────────────────────────────────────
  document.getElementById("rulesBtn").onclick = toggleRules;
  document.getElementById("closeRulesBtn").onclick = toggleRules;
  const tabs = document.querySelectorAll(".rules-tab-btn");
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      // Remove active from all
      tabs.forEach(t => t.classList.remove("active"));
      // Add active to clicked
      btn.classList.add("active");
      // Update content
      let pageId = btn.textContent.toLowerCase();
      if (pageId === "évènements") pageId = "évènements";
      switchRulesPage(pageId);
    });
  });

  document.getElementById("btnEnd").onclick = () => {
    if (!state.isOver && !state.isPaused) {
      const p = state.players[state.currentPlayer];
      if (p.uid === auth.currentUser.uid) nextPlayer();
    }
  };
  document.getElementById("pauseBtn").onclick = togglePause;
  document.getElementById("resumeBtn").onclick = togglePause;
  document.getElementById("restartBtn").onclick = () => restart(false);
  document.getElementById("playAgainBtn").onclick = () => restart(false);
  document.getElementById("retryBtn").onclick = () => restart(false);

  // New buttons for reconfiguration
  const configBtn1 = document.getElementById("configBtn1");
  const configBtn2 = document.getElementById("configBtn2");
  if (configBtn1) configBtn1.onclick = () => restart(true);
  if (configBtn2) configBtn2.onclick = () => restart(true);
  ["menuBtn", "menuBtn2", "menuBtn3"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => leaveRoom();
  });
  document.addEventListener("keydown", e => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!state.isOver && !state.isPaused) { nextPlayer(); } }
    if (e.key === "Escape") togglePause();
  });
  injectStyles();
}

const HAZARD_INFO = {
  seisme: { title: "Séisme", desc: "Les secousses font s'écrouler les murs. Certains passages peuvent s'ouvrir ou se fermer.", icon: "🫨" },
  effondrement: { title: "Effondrement", desc: "Des rochers tombent du plafond. Les joueurs dans la zone perdent 1 HP ou un nouveau passage s'ouvre !", icon: "🪨" },
  obscurite: { title: "Obscurité", desc: "Les lampes vacillent. Seule la zone autour des joueurs reste visible pendant 2 tours.", icon: "🕯️" },
  eboulement: { title: "Éboulement", desc: "Un amas de pierres bloque un ou plusieurs passages de la tuile.", icon: "🧱" },
  courant_air: { title: "Courant d'Air", desc: "Un vent glacial souffle dans les tunnels. Les joueurs dans la zone perdent immédiatement 1 AP.", icon: "🌬️" }
};

function showHazardCard(type, x, y, z, onConfirm) {
  const info = HAZARD_INFO[type];
  document.getElementById("hazardIcon").textContent = info.icon;
  document.getElementById("hazardTitle").textContent = info.title;
  document.getElementById("hazardDesc").textContent = info.desc;
  document.getElementById("hazardLoc").textContent = `Localisé au Niveau ${z} [${x},${y}]`;
  document.getElementById("hazardOverlay").style.display = "flex";

  // Center camera on target and highlight for EVERYONE
  if (x !== undefined && y !== undefined) {
    state.currentZ = z;
    renderAll();
    setTimeout(() => {
      centerOnTile(x, y);
      const el = document.querySelector(`.tile[data-x="${x}"][data-y="${y}"]`);
      if (el) el.classList.add("hazard-highlight");
      if (type === "seisme" || type === "effondrement") {
        document.getElementById("caveGrid").classList.add("grid-shake");
        setTimeout(() => document.getElementById("caveGrid").classList.remove("grid-shake"), 500);
      }
      // Remove highlight after some time
      setTimeout(() => {
        if (el) el.classList.remove("hazard-highlight");
      }, 1500);
    }, 300);
  }

  document.getElementById("hazardOkBtn").onclick = () => {
    document.getElementById("hazardOverlay").style.display = "none";
    // Small sleep to let the player see the highlight/animation after the popup closes
    setTimeout(() => {
      if (onConfirm) onConfirm();
    }, 500);
  };
}

function injectStyles() {
  if (document.getElementById("levelStyles")) return;
  const style = document.createElement("style"); style.id = "levelStyles";
  style.textContent = `
    /* Tuile d'un autre niveau visible via une layer tile — grisée, cliquable */
    .tile.ghost-tile {
      opacity: .38;
      cursor: pointer;
      filter: grayscale(60%) brightness(.65) hue-rotate(200deg);
      border: 1px dashed rgba(168,85,247,.45) !important;
      position: relative;
    }
    .tile.ghost-tile:hover { opacity:.6; filter:grayscale(30%) brightness(.85) hue-rotate(200deg); }

    .ghost-badge {
      position:absolute; top:2px; right:3px;
      font-size:10px; z-index:5; pointer-events:none;
    }

    /* Highlight violet pour les tuiles de l'autre z accessibles */
    .tile.movable-other-z {
      box-shadow: 0 0 0 3px #a855f7 inset, 0 0 12px #a855f7 !important;
      cursor: pointer;
    }

    .layer-arrow {
      position:absolute; font-size:14px;
      top:50%; left:50%; transform:translate(-50%,-50%);
      z-index:3; pointer-events:none;
    }

    .hazard-highlight {
      box-shadow: 0 0 0 4px #fbbf24 inset, 0 0 20px #fbbf24 !important;
      z-index: 20;
      animation: hazardPulse 0.5s ease-in-out infinite alternate;
    }
    @keyframes hazardPulse {
      from { opacity: 1; } to { opacity: 0.6; }
    }
    .grid-shake {
      animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
    }
    @keyframes shake {
      10%, 90% { transform: translate3d(-1px, 0, 0); }
      20%, 80% { transform: translate3d(2px, 0, 0); }
      30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
      40%, 60% { transform: translate3d(4px, 0, 0); }
    }
  `;
  document.head.appendChild(style);
}

function toggleRules() {
  if (state.isOver) return;
  state.isPaused = !state.isPaused;
  const overlay = document.getElementById("rulesOverlay");
  overlay.style.display = state.isPaused ? "flex" : "none";
  if (state.isPaused) {
    switchRulesPage('mission');
  } else {
    const p = state.players[state.currentPlayer];
    if (p && p.type === "human" && p.alive && !p.escaped) { refreshHighlights(p); updateInfo(p); }
  }
}

function switchRulesPage(pageId) {
  // Update buttons
  document.querySelectorAll(".rules-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.textContent.toLowerCase() === pageId || (btn.textContent === "Survie" && pageId === "survival") || (btn.textContent === "Évènements" && pageId === "évènements"));
  });
  // Update pages
  document.querySelectorAll(".rules-page").forEach(page => {
    page.classList.remove("active");
  });
  const activePage = document.getElementById(`rules-${pageId}`);
  if (activePage) activePage.classList.add("active");
}

function togglePause() {
  if (state.isOver) return;
  state.isPaused = !state.isPaused;
  document.getElementById("pauseOverlay").style.display = state.isPaused ? "flex" : "none";
  if (!state.isPaused) {
    const p = state.players[state.currentPlayer];
    if (p && p.type === "human" && p.alive && !p.escaped) { refreshHighlights(p); updateInfo(p); }
  }
}

function restart(backToSetup = false) {
  // Only leader can trigger a global restart
  if (roomData && roomData.leaderId !== auth.currentUser.uid) {
    alert("Seul le chef d'expédition peut relancer la partie.");
    return;
  }

  ["pauseOverlay", "winOverlay", "loseOverlay"].forEach(id => document.getElementById(id).style.display = "none");

  if (backToSetup) {
    // Reset room state to setup
    updateRoom(roomID, {
      state: "setup",
      gameState: null
    });
  } else {
    // Replay directly (this will trigger a new startFirstTime for everyone)
    updateRoom(roomID, {
      state: "playing",
      gameState: null
    });
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

initMultiplayer();