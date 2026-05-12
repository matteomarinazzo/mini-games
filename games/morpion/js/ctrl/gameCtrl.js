/**
 * game.js — Contrôleur unifié Morpion (3x3 / 5x5 / Ultimate)
 *
 * Le mode est lu depuis localStorage.morpionGameConfig.gameType :
 *   "standard3x3" → plateau 3×3, alignement 3
 *   "big5x5"      → plateau 5×5, alignement 4
 *   "ultimate"    → 9 grilles 3×3 imbriquées
 *
 * Aucune fonctionnalité retirée vs les 3 anciens fichiers.
 */

import { initFullscreenSystem } from "../../../../js/fullScreen.js";
import { standard3x3AI } from "../ai/standard3x3AI.js";
import { big5x5AI } from "../ai/big5x5AI.js";
import { ultimateAI } from "../ai/ultimateAI.js";
import { checkDailyChallenge } from "../../../../js/utils/dailyChallenge.js";

/* =============================================
   CONFIG & ETAT PARTAGÉ
   ============================================= */
export let gameConfig = JSON.parse(localStorage.getItem("morpionGameConfig")) || {
    playerTurn: 1,
    boardState: null,
    scores: { player1: 0, player2: 0, draws: 0 },
};

const gameType = gameConfig.gameType || "standard3x3";

let players = gameConfig.players || {
    player1: { symbol: "❌", isCustom: false },
    player2: { symbol: "⭕", isCustom: false },
};

/* =============================================
   CONFIGURATIONS PAR MODE
   ============================================= */
const MODE_CONFIG = {
    standard3x3: {
        size: 9,
        cols: 3,
        alignement: 3,
        winPatterns: [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6],
        ],
    },
    big5x5: {
        size: 25,
        cols: 5,
        alignement: 4,
        winPatterns: [
            [0, 1, 2, 3], [1, 2, 3, 4], [5, 6, 7, 8], [6, 7, 8, 9],
            [10, 11, 12, 13], [11, 12, 13, 14], [15, 16, 17, 18], [16, 17, 18, 19],
            [20, 21, 22, 23], [21, 22, 23, 24],
            [0, 5, 10, 15], [5, 10, 15, 20], [1, 6, 11, 16], [6, 11, 16, 21],
            [2, 7, 12, 17], [7, 12, 17, 22], [3, 8, 13, 18], [8, 13, 18, 23],
            [4, 9, 14, 19], [9, 14, 19, 24],
            [0, 6, 12, 18], [6, 12, 18, 24], [1, 7, 13, 19], [5, 11, 17, 23],
            [4, 8, 12, 16], [8, 12, 16, 20], [3, 7, 11, 15], [9, 13, 17, 21],
        ],
    },
};

/* =============================================
   ÉTAT ULTIMATE
   ============================================= */
const ultimateState = {
    miniGrids: Array(9).fill(null).map(() => Array(9).fill(null)),
    gridWinners: Array(9).fill(null),
    nextGrid: null,
    currentPlayer: 1,
};
window.ultimateState = ultimateState;

const ULTIMATE_WIN_PATTERNS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

/* =============================================
   INIT AU CHARGEMENT
   ============================================= */
window.addEventListener("DOMContentLoaded", () => {
    const saved = JSON.parse(localStorage.getItem("morpionGameConfig"));
    if (saved?.scores) gameConfig.scores = saved.scores;

    initFullscreenSystem();
    initSymbolDisplays();
    updateScoreUI();

    if (gameType === "ultimate") {
        buildUltimateBoard();
    } else {
        buildClassicBoard();
    }
});

/* =============================================
   AFFICHAGE DES SYMBOLES JOUEURS
   ============================================= */
function initSymbolDisplays() {
    players = gameConfig.players || players;

    ["player1", "player2"].forEach(key => {
        const el = document.getElementById(`${key}SymbolDisplay`);
        if (!el) return;
        const p = players[key];
        if (p.isCustom && p.customImage) {
            el.innerHTML = `<img src="${p.customImage}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;">`;
        } else {
            el.textContent = p.symbol;
        }
    });
}

/* =============================================
   CONSTRUCTION DU PLATEAU CLASSIQUE (3x3 / 5x5)
   ============================================= */
function buildClassicBoard() {
    const cfg = MODE_CONFIG[gameType];
    const size = cfg.size;
    const cols = cfg.cols;

    // Définir la variable CSS pour les colonnes
    document.documentElement.style.setProperty("--board-cols", String(cols));

    // Créer le div.game-board
    const board = document.createElement("div");
    board.className = "game-board";
    board.id = "gameBoard";

    // Insérer entre turn-indicator et game-stats
    const container = document.querySelector(".game-container");
    const statsEl = document.querySelector(".game-stats");
    container.insertBefore(board, statsEl);

    // Créer les cellules
    for (let i = 0; i < size; i++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.index = i;
        cell.addEventListener("click", () => handleClassicClick(i));
        board.appendChild(cell);
    }

    // Initialiser boardState
    if (!gameConfig.boardState || gameConfig.boardState.length !== size) {
        gameConfig.boardState = Array(size).fill(null);
    }

    AIToPlayClassic();
}

/* =============================================
   CLIC CLASSIQUE
   ============================================= */
function handleClassicClick(cellIndex) {
    const cell = document.querySelector(`.cell[data-index="${cellIndex}"]`);
    if (!cell || cell.getAttribute("isOccupied")) return;

    const playerTurn = gameConfig.playerTurn || 1;
    const p = players[`player${playerTurn}`];

    placeSymbolInCell(cell, p);
    cell.setAttribute("isOccupied", "true");
    gameConfig.boardState[cellIndex] = playerTurn;

    checkClassicWinner();
    AIToPlayClassic();
}

function placeSymbolInCell(cell, player) {
    if (player.isCustom && player.customImage) {
        cell.innerHTML = `<img src="${player.customImage}" style="width:80%;height:80%;object-fit:contain;border-radius:6px;">`;
    } else {
        cell.textContent = player.symbol;
    }
}

/* =============================================
   VÉRIFICATION GAGNANT CLASSIQUE
   ============================================= */
function checkClassicWinner() {
    const cfg = MODE_CONFIG[gameType];

    for (const pattern of cfg.winPatterns) {
        const first = gameConfig.boardState[pattern[0]];
        if (!first) continue;
        if (pattern.every(i => gameConfig.boardState[i] === first)) {
            highlightCells(pattern);
            setTimeout(() => announceWinner(first), 40);
            return;
        }
    }

    if (gameConfig.boardState.every(c => c !== null)) {
        setTimeout(() => announceDraw(), 40);
        return;
    }

    gameConfig.playerTurn = gameConfig.playerTurn === 1 ? 2 : 1;
    localStorage.setItem("morpionGameConfig", JSON.stringify(gameConfig));
    updateTurnDisplay();
}

function highlightCells(pattern) {
    pattern.forEach(i => {
        const cell = document.querySelector(`.cell[data-index="${i}"]`);
        if (cell) cell.classList.add("win");
    });
}

/* =============================================
   IA — MODE CLASSIQUE
   ============================================= */
function AIToPlayClassic() {
    const mode = localStorage.getItem("morpionMode");
    const difficulty = localStorage.getItem("morpionDifficulty");
    if (mode !== "solo") return;

    if (document.querySelector(".cell.win") ||
        gameConfig.boardState.every(c => c !== null)) return;

    if (gameConfig.playerTurn !== 2) return;

    setTimeout(() => {
        let move = null;
        if (gameType === "standard3x3") {
            move = standard3x3AI(difficulty, MODE_CONFIG.standard3x3.winPatterns);
        } else {
            move = big5x5AI(difficulty, MODE_CONFIG.big5x5.winPatterns);
        }
        if (move !== null) {
            const cell = document.querySelector(`.cell[data-index="${move}"]`);
            if (cell && !cell.getAttribute("isOccupied")) {
                cell.click();
            }
        }
    }, 160);
}

/* =============================================
   RESET CLASSIQUE
   ============================================= */
function resetClassicGame(lastWinner = null) {
    const cfg = MODE_CONFIG[gameType];

    gameConfig.boardState = Array(cfg.size).fill(null);

    if (lastWinner === "draw") {
        gameConfig.playerTurn = gameConfig.playerTurn === 1 ? 2 : 1;
    } else if (lastWinner !== null) {
        gameConfig.playerTurn = lastWinner;
    }

    localStorage.setItem("morpionGameConfig", JSON.stringify(gameConfig));

    document.querySelectorAll(".cell").forEach(cell => {
        cell.innerHTML = "";
        cell.removeAttribute("isOccupied");
        cell.classList.remove("win", "filled");
        cell.style.pointerEvents = "auto";
        cell.style.opacity = "1";
        cell.style.cursor = "pointer";
    });

    updateTurnDisplay();
    AIToPlayClassic();
}

/* =============================================
   ULTIMATE — CONSTRUCTION DU PLATEAU
   ============================================= */
function buildUltimateBoard() {
    const container = document.querySelector(".game-container");
    const statsEl = document.querySelector(".game-stats");

    const board = document.createElement("div");
    board.className = "ultimate-board";
    board.id = "ultimateBoard";
    container.insertBefore(board, statsEl);

    createUltimateCells();
    updatePlayableGrids();
}

function createUltimateCells() {
    const board = document.getElementById("ultimateBoard");
    board.innerHTML = "";

    for (let gi = 0; gi < 9; gi++) {
        const mini = document.createElement("div");
        mini.className = "mini-grid";
        mini.dataset.gridIndex = gi;

        for (let ci = 0; ci < 9; ci++) {
            const cell = document.createElement("div");
            cell.className = "mini-cell";
            cell.dataset.gridIndex = gi;
            cell.dataset.cellIndex = ci;
            cell.addEventListener("click", () => handleUltimateClick(gi, ci));
            mini.appendChild(cell);
        }

        board.appendChild(mini);
    }
}

/* =============================================
   ULTIMATE — CLIC
   ============================================= */
function handleUltimateClick(gridIndex, cellIndex) {
    if (!isValidUltimateMove(gridIndex, cellIndex)) return;

    const cp = ultimateState.currentPlayer;
    ultimateState.miniGrids[gridIndex][cellIndex] = cp;

    const cell = document.querySelector(
        `[data-grid-index="${gridIndex}"][data-cell-index="${cellIndex}"]`
    );
    displayUltimateSymbol(cell, cp);
    cell.classList.add("filled");

    checkMiniGridWinner(gridIndex);

    if (checkGlobalWinner()) {
        setTimeout(() => announceWinner(cp), 300);
        return;
    }

    if (ultimateState.gridWinners.every(w => w !== null)) {
        setTimeout(() => announceDraw(), 300);
        return;
    }

    ultimateState.nextGrid = ultimateState.gridWinners[cellIndex] === null ? cellIndex : null;
    ultimateState.currentPlayer = cp === 1 ? 2 : 1;
    updateTurnDisplay();
    updatePlayableGrids();
    AIToPlayUltimate();
}

function isValidUltimateMove(gi, ci) {
    if (ultimateState.miniGrids[gi][ci] !== null) return false;
    if (ultimateState.gridWinners[gi] !== null) return false;
    if (ultimateState.nextGrid !== null && gi !== ultimateState.nextGrid) return false;
    return true;
}

function displayUltimateSymbol(cell, player) {
    const p = players[`player${player}`];
    if (p.isCustom && p.customImage) {
        cell.innerHTML = `<img src="${p.customImage}" style="width:100%;height:100%;object-fit:contain;">`;
    } else {
        cell.textContent = p.symbol;
    }
}

/* =============================================
   ULTIMATE — VÉRIFICATIONS
   ============================================= */
function checkMiniGridWinner(gi) {
    const grid = ultimateState.miniGrids[gi];

    for (const pattern of ULTIMATE_WIN_PATTERNS) {
        const [a, b, c] = pattern;
        if (grid[a] && grid[a] === grid[b] && grid[a] === grid[c]) {
            ultimateState.gridWinners[gi] = grid[a];
            markMiniGridWon(gi, grid[a]);
            return;
        }
    }

    if (grid.every(c => c !== null)) {
        ultimateState.gridWinners[gi] = "draw";
        markMiniGridDraw(gi);
    }
}

function markMiniGridWon(gi, winner) {
    const mini = document.querySelector(`.mini-grid[data-grid-index="${gi}"]`);
    mini.classList.add("won", `won-player${winner}`);

    const overlay = document.createElement("div");
    overlay.className = "grid-overlay";
    displayUltimateSymbol(overlay, winner);
    mini.appendChild(overlay);
}

function markMiniGridDraw(gi) {
    const mini = document.querySelector(`.mini-grid[data-grid-index="${gi}"]`);
    mini.classList.add("draw");

    const overlay = document.createElement("div");
    overlay.className = "grid-overlay draw-overlay";
    overlay.textContent = "—";
    mini.appendChild(overlay);
}

function updatePlayableGrids() {
    document.querySelectorAll(".mini-grid").forEach((mini, i) => {
        mini.classList.remove("playable", "inactive");
        if (ultimateState.gridWinners[i] !== null) {
            mini.classList.add("inactive");
        } else if (ultimateState.nextGrid === null || ultimateState.nextGrid === i) {
            mini.classList.add("playable");
        } else {
            mini.classList.add("inactive");
        }
    });
}

function checkGlobalWinner() {
    for (const pattern of ULTIMATE_WIN_PATTERNS) {
        const [a, b, c] = pattern;
        const w = ultimateState.gridWinners;
        if (w[a] && w[a] !== "draw" && w[a] === w[b] && w[a] === w[c]) {
            pattern.forEach(i => {
                const g = document.querySelector(`.mini-grid[data-grid-index="${i}"]`);
                if (g) g.classList.add("global-winner");
            });
            return true;
        }
    }
    return false;
}

/* =============================================
   ULTIMATE — IA
   ============================================= */
function AIToPlayUltimate() {
    const mode = localStorage.getItem("morpionMode");
    const difficulty = localStorage.getItem("morpionDifficulty");
    if (mode !== "solo") return;
    if (checkGlobalWinner() || ultimateState.gridWinners.every(w => w !== null)) return;
    if (ultimateState.currentPlayer !== 2) return;

    setTimeout(() => {
        const mv = ultimateAI(difficulty);
        if (!mv) return;
        if (isValidUltimateMove(mv.gridIndex, mv.cellIndex)) {
            handleUltimateClick(mv.gridIndex, mv.cellIndex);
        }
    }, 500);
}

/* =============================================
   ULTIMATE — RESET
   ============================================= */
function resetUltimateGame(lastWinner = null) {
    if (lastWinner === "draw") {
        ultimateState.currentPlayer = ultimateState.currentPlayer === 1 ? 2 : 1;
    } else if (lastWinner !== null) {
        ultimateState.currentPlayer = lastWinner;
    }

    ultimateState.miniGrids = Array(9).fill(null).map(() => Array(9).fill(null));
    ultimateState.gridWinners = Array(9).fill(null);
    ultimateState.nextGrid = null;

    createUltimateCells();
    updateTurnDisplay();
    updatePlayableGrids();
    AIToPlayUltimate();
}

/* Exposer pour menuInGame.js */
window.resetUltimateGame = resetUltimateGame;

/* =============================================
   RESET UNIVERSEL — appelé par menuInGame
   ============================================= */
export function resetGame(lastWinner = null) {
    if (gameType === "ultimate") {
        resetUltimateGame(lastWinner);
    } else {
        resetClassicGame(lastWinner);
    }
}

/* =============================================
   POPUPS GAGNANT / ÉGALITÉ
   ============================================= */
function announceWinner(winner) {
    disableAllCells();
    addScore(`player${winner}`);

    // ── Daily Challenge ──────────────────────────
    const mode = localStorage.getItem("morpionMode");
    const difficulty = localStorage.getItem("morpionDifficulty");
    const isAiWin = mode === "solo" && winner === 1;
    const gridMap = { standard3x3: '3x3', big5x5: '5x5', ultimate: '9x9' };

    checkDailyChallenge({
        gameId: 'morpion',
        wins: gameConfig.scores.player1 || 0,  // total victoires joueur 1
        beatAiExpert: isAiWin && difficulty === 'expert',
        grid: gridMap[gameType] ?? '3x3',
    });

    const popup = document.getElementById("winnerPopup");
    const overlay = document.getElementById("popupOverlay");
    const textEl = document.getElementById("winnerText");
    const symEl = document.getElementById("winnerSymbol");

    const p = players[`player${winner}`];
    if (textEl) textEl.textContent = `🎉 Joueur ${winner} gagne !`;

    if (symEl) {
        if (p.isCustom && p.customImage) {
            symEl.innerHTML = `<img src="${p.customImage}" style="width:44px;height:44px;object-fit:contain;border-radius:8px;">`;
        } else {
            symEl.textContent = p.symbol;
        }
    }

    overlay.classList.add("show");
    popup.classList.add("show");

    document.getElementById("popupOkBtn").onclick = () => {
        popup.classList.remove("show");
        overlay.classList.remove("show");
        resetGame(winner);
    };
}

function announceDraw() {
    disableAllCells();
    addScore("draws");

    const popup = document.getElementById("drawPopup");
    const overlay = document.getElementById("popupOverlay");

    overlay.classList.add("show");
    popup.classList.add("show");

    document.getElementById("drawOkBtn").onclick = () => {
        popup.classList.remove("show");
        overlay.classList.remove("show");
        resetGame("draw");
    };
}

/* =============================================
   SCORES & UI
   ============================================= */
function addScore(key) {
    if (!gameConfig.scores[key] && gameConfig.scores[key] !== 0)
        gameConfig.scores[key] = 0;
    gameConfig.scores[key]++;
    localStorage.setItem("morpionGameConfig", JSON.stringify(gameConfig));
    updateScoreUI();
}

function updateScoreUI() {
    const s = gameConfig.scores;
    const p1 = document.getElementById("player1Wins");
    const dr = document.getElementById("draws");
    const p2 = document.getElementById("player2Wins");
    if (p1) p1.textContent = s.player1 || 0;
    if (dr) dr.textContent = s.draws || 0;
    if (p2) p2.textContent = s.player2 || 0;
}

function updateTurnDisplay() {
    const current = gameType === "ultimate"
        ? ultimateState.currentPlayer
        : gameConfig.playerTurn;

    const p1Turn = document.getElementById("player1Turn");
    const p2Turn = document.getElementById("player2Turn");
    const arrowTop = document.getElementById("arrowTop");
    const arrowBot = document.getElementById("arrowBottom");

    if (current === 1) {
        p1Turn.classList.add("active");
        p2Turn.classList.remove("active");
        if (arrowTop) arrowTop.style.visibility = "visible";
        if (arrowBot) arrowBot.style.visibility = "hidden";
    } else {
        p1Turn.classList.remove("active");
        p2Turn.classList.add("active");
        if (arrowTop) arrowTop.style.visibility = "hidden";
        if (arrowBot) arrowBot.style.visibility = "visible";
    }
}

function disableAllCells() {
    document.querySelectorAll(".cell, .mini-cell").forEach(c => {
        c.style.pointerEvents = "none";
        c.style.opacity = "0.65";
        c.style.cursor = "not-allowed";
    });
}