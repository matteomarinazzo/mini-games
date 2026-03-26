import { playGameSound, startMusic, toggleSound, toggleMusic, getSoundEnabled, getMusicEnabled } from "../../../js/utils/audio.js";
import { checkRealConnection } from "../../../js/network.js";
import { getFirebaseLeaderboard, getFirebaseRecordData, setFirebaseLeaderboard } from "../../../js/firebaseWrk.js";

/* DOM */
const gridEl = document.getElementById("grid");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");

const gameOverOverlay = document.getElementById("gameOverOverlay");
const endTitle = document.getElementById("endTitle");
const finalScoreEl = document.getElementById("finalScore");
const finalBestEl = document.getElementById("finalBest");

const retryBtn = document.getElementById("retryBtn");
const menuBtn = document.getElementById("menuBtn");

const recordsBtn = document.getElementById("recordsBtn");
const recordsOverlay = document.getElementById("recordsOverlay");
const recordsClose = document.getElementById("recordsClose");

const recPersonalScore = document.getElementById("recPersonalScore");
const recGlobalScore = document.getElementById("recGlobalScore");
const recStatus = document.getElementById("recStatus");

const recordMessagePopup = document.getElementById("recordMessagePopup");
const recordMsgInput = document.getElementById("recordMsgInput");
const recordCharCounter = document.getElementById("recordCharCounter");
const saveRecordMsgBtn = document.getElementById("saveRecordMsgBtn");

const pauseOverlay = document.getElementById("pauseOverlay");
const resumeBtn = document.getElementById("resumeBtn");
const restartBtn = document.getElementById("restartBtn");
const menuBtn2 = document.getElementById("menuBtn2");
const soundBtn = document.getElementById("soundBtn");
const musicBtn = document.getElementById("musicBtn");

/* GAME CONSTANTS */
const ROWS = 20;
const COLS = 10;

let grid = [];
let score = 0;
let bestScore = 0;
let best_score_ever = 0;

let timerInterval = null;
let secondsElapsed = 0;

let isPaused = false;
let isGameOver = false;
let isClearing = false;

/* TETROMINOES */
const TETROMINOES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[1, 1, 1], [0, 1, 0]],
    L: [[1, 1, 1], [1, 0, 0]],
    J: [[1, 1, 1], [0, 0, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]]
};

const COLORS = ["I", "O", "T", "L", "J", "S", "Z"];

/* CURRENT PIECE */
let piece = null;

/* MOBILE CONTROLS */
let isTouching = false;
let touchStartX = 0;
let touchStartY = 0;
let touchCurrentX = 0;
let touchCurrentY = 0;
let touchStartTime = 0;
let lastHorizontalMoveX = 0;
let hasMoved = false;
let softDropActive = false;
let softDropInterval = null;

const SCREEN_W = window.screen.width;
const MOVE_THRESHOLD = Math.max(16, Math.min(26, SCREEN_W * 0.05));
const SOFT_DROP_THRESHOLD = 30;
const TAP_THRESHOLD = 12;
const TAP_TIME_LIMIT = 250;

/* ─────────────────────────────────────────
   INITIALIZATION
────────────────────────────────────────── */

async function init() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    buildGrid();

    score = 0;
    scoreEl.textContent = score;

    bestScore = parseInt(localStorage.getItem("fallingBlocks_best") || "0");

    // On lance la récupération en arrière-plan sans bloquer le démarrage du jeu
    // firebaseWrk.js gère maintenant lui-même la détection offline (checkRealConnection)
    getFirebaseLeaderboard("falling_blocks", "score")
        .then(val => { if (val !== undefined) best_score_ever = val; })
        .catch(() => { });

    dropInterval = 700; // Reset speed
    spawnPiece();
    startTimer();
    updateAudioButtons();
    gameLoop();
}

function updateAudioButtons() {
    if (!getSoundEnabled()) soundBtn.classList.add("muted");
    else soundBtn.classList.remove("muted");

    if (!getMusicEnabled()) musicBtn.classList.add("muted");
    else musicBtn.classList.remove("muted");
}

// Crée les cellules UNE seule fois au démarrage
function buildGrid() {
    gridEl.innerHTML = "";
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            gridEl.appendChild(cell);
        }
    }
}

// Met à jour les classes sans toucher au DOM structurellement
function renderGrid() {
    const cells = gridEl.children;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = cells[r * COLS + c];
            if (cell.classList.contains('clearing')) continue;
            // Reset
            cell.className = "cell";
            // Appliquer la couleur de la grille fixe
            if (grid[r][c]) cell.classList.add(grid[r][c]);
        }
    }
}

// Bloque le scroll uniquement si on n'est pas sur un élément interactif
document.addEventListener('touchmove', (e) => {
    const target = e.target;
    if (
        !target.closest('.game-overlay') &&
        !target.closest('.pause-btn') &&
        !target.closest('button') &&
        !target.closest('input')
    ) {
        e.preventDefault();
    }
}, { passive: false });

/* ─────────────────────────────────────────
   PIECE MANAGEMENT
────────────────────────────────────────── */

function spawnPiece() {
    // Increase speed slightly with each piece
    if (dropInterval > 100) dropInterval -= 5;

    const type = COLORS[Math.floor(Math.random() * COLORS.length)];
    const shape = TETROMINOES[type];

    piece = {
        type,
        shape,
        row: 0,
        col: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2)
    };

    if (collides(piece)) {
        triggerGameOver("Partie terminée !");
    }

    // Reset horizontal touch reference for the new piece if a touch is active
    if (isTouching) {
        lastHorizontalMoveX = touchCurrentX;
    }
}

function rotate(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i]).reverse());
}

function movePiece(dr, dc) {
    if (!piece) return false;
    const newPiece = {
        ...piece,
        row: piece.row + dr,
        col: piece.col + dc
    };

    if (!collides(newPiece)) {
        piece = newPiece;
        if (dc !== 0) playGameSound('move'); // son uniquement pour mouvements horizontaux
        return true;
    }
    return false;
}

function hardDrop() {
    if (!piece) return;
    while (movePiece(1, 0));
    playGameSound('drop');
    lockPiece(true);
}

function rotatePiece() {
    if (!piece) return;
    const rotated = rotate(piece.shape);
    const newPiece = { ...piece, shape: rotated };

    if (!collides(newPiece)) {
        piece = newPiece;
        playGameSound('rotate');
    }
}

function collides(p) {
    for (let r = 0; r < p.shape.length; r++) {
        for (let c = 0; c < p.shape[r].length; c++) {
            if (!p.shape[r][c]) continue;

            const nr = p.row + r;
            const nc = p.col + c;

            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return true;
            if (grid[nr][nc]) return true;
        }
    }
    return false;
}

function lockPiece(fromHardDrop = false) {
    for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
            if (piece.shape[r][c]) {
                grid[piece.row + r][piece.col + c] = piece.type;
            }
        }
    }

    if (!fromHardDrop) playGameSound('drop');
    clearLines();
}

/* ─────────────────────────────────────────
   LINE CLEAR
────────────────────────────────────────── */

function clearLines() {
    // Trouver les lignes complètes
    const fullRows = [];
    for (let r = ROWS - 1; r >= 0; r--) {
        if (grid[r].every(cell => cell !== null)) {
            fullRows.push(r);
        }
    }

    if (fullRows.length === 0) {
        isClearing = false;
        spawnPiece();
        renderGrid();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Appliquer l'animation CSS sur les cellules concernées
    const cells = gridEl.children;
    fullRows.forEach(r => {
        for (let c = 0; c < COLS; c++) {
            const cell = cells[r * COLS + c];
            if (cell) cell.classList.add('clearing');
        }
    });

    // Bloquer la game loop pendant l'animation
    isClearing = true;

    // Attendre la fin de l'animation (350ms) puis supprimer les lignes
    setTimeout(() => {
        // Retirer la classe clearing
        Array.from(gridEl.children).forEach(cell => cell.classList.remove('clearing'));

        // Supprimer les lignes du tableau logique et ajouter des lignes vides en haut
        const newGrid = grid.filter((row, index) => !fullRows.includes(index));
        const emptyRowsCount = ROWS - newGrid.length;
        for (let i = 0; i < emptyRowsCount; i++) {
            newGrid.unshift(Array(COLS).fill(null));
        }
        grid = newGrid;

        score += fullRows.length * 100;
        scoreEl.textContent = score;

        // Mettre à jour la grille visuellement immédiatement pour éviter le "flicker"
        renderGrid();

        // Son selon le nombre de lignes
        if (fullRows.length >= 4) playGameSound('clear4');
        else if (fullRows.length >= 2) playGameSound('clear2');
        else playGameSound('clear1');

        // Reprendre la game loop (mais on check si d'autres lignes sont apparues)
        lastDrop = performance.now();
        clearLines(); // Appel récursif pour vérifier à nouveau
    }, 350);
}

/* ─────────────────────────────────────────
   GAME LOOP
────────────────────────────────────────── */

let dropInterval = 700;
let lastDrop = 0;

function gameLoop(timestamp = 0) {
    if (isPaused || isGameOver || isClearing) return;

    if (timestamp - lastDrop > dropInterval) {
        if (!movePiece(1, 0)) {
            lockPiece();
        }
        lastDrop = timestamp;
    }

    renderFrame();
    requestAnimationFrame(gameLoop);
}

function renderFrame() {
    // 1. Met à jour la grille fixe (pas de innerHTML = pas d'annulation du touch)
    renderGrid();

    const cells = gridEl.children;

    // 2. Ghost piece
    if (piece) {
        let ghostRow = piece.row;
        while (true) {
            const next = { ...piece, row: ghostRow + 1 };
            if (collides(next)) break;
            ghostRow++;
        }
        if (ghostRow !== piece.row) {
            for (let r = 0; r < piece.shape.length; r++) {
                for (let c = 0; c < piece.shape[r].length; c++) {
                    if (!piece.shape[r][c]) continue;
                    const row = ghostRow + r;
                    const col = piece.col + c;
                    const idx = row * COLS + col;
                    if (cells[idx] && !grid[row][col]) {
                        cells[idx].classList.add(piece.type, 'ghost');
                    }
                }
            }
        }
    }

    // 3. Pièce active
    if (piece) {
        for (let r = 0; r < piece.shape.length; r++) {
            for (let c = 0; c < piece.shape[r].length; c++) {
                if (!piece.shape[r][c]) continue;
                const row = piece.row + r;
                const col = piece.col + c;
                const idx = row * COLS + col;
                if (cells[idx]) {
                    cells[idx].classList.remove('ghost');
                    cells[idx].classList.add(piece.type);
                }
            }
        }
    }
}

function togglePause() {
    if (isGameOver) return;

    const paused = pauseOverlay.style.display === "flex";

    if (paused) {
        // Reprendre
        pauseOverlay.style.display = "none";
        isPaused = false;

        // Reprendre le timer
        timerInterval = setInterval(() => {
            secondsElapsed++;
            const m = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
            const s = String(secondsElapsed % 60).padStart(2, "0");
            timerEl.textContent = `${m}:${s}`;
        }, 1000);

        lastDrop = performance.now();
        gameLoop();
    } else {
        // Mettre en pause
        pauseOverlay.style.display = "flex";
        isPaused = true;

        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function stopSoftDrop() {
    if (softDropInterval) {
        clearInterval(softDropInterval);
        softDropInterval = null;
    }
    softDropActive = false;
}

function handleTouchStart(e) {
    // Laisser passer les touches sur les boutons et overlays
    const target = e.target;
    if (
        target.closest('.game-overlay') ||
        target.closest('.pause-btn') ||
        target.closest('button')
    ) return;

    e.preventDefault(); // Bloque scroll/zoom uniquement sur la zone de jeu
    startMusic(); // démarre la musique au premier touch
    if (isPaused || isGameOver) return;

    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchCurrentX = t.clientX;
    touchCurrentY = t.clientY;
    lastHorizontalMoveX = t.clientX;
    touchStartTime = Date.now();

    isTouching = true;
    hasMoved = false;
    softDropActive = false;
    stopSoftDrop();
}

function handleTouchMove(e) {
    if (!isTouching || isPaused || isGameOver) return;
    e.preventDefault();

    const t = e.touches[0];
    touchCurrentX = t.clientX;
    touchCurrentY = t.clientY;

    const dx = touchCurrentX - lastHorizontalMoveX;
    const totalDy = touchCurrentY - touchStartY;
    const totalDx = Math.abs(touchCurrentX - touchStartX);

    // Mouvement horizontal (incrémental)
    // On ne bouge horizontalement que si le geste est principalement horizontal
    if (Math.abs(dx) > MOVE_THRESHOLD && totalDy < SOFT_DROP_THRESHOLD * 1.5) {
        const direction = dx > 0 ? 1 : -1;
        movePiece(0, direction);
        lastHorizontalMoveX = touchCurrentX;
        hasMoved = true;
    }

    // Soft drop : geste principalement vers le bas
    if (totalDy > SOFT_DROP_THRESHOLD && totalDx < MOVE_THRESHOLD * 1.5 && !softDropActive) {
        softDropActive = true;
        movePiece(1, 0); // premier drop immédiat
        playGameSound('softdrop');
        softDropInterval = setInterval(() => {
            if (!isPaused && !isGameOver && isTouching) {
                if (movePiece(1, 0)) {
                    playGameSound('softdrop');
                }
            } else {
                stopSoftDrop();
            }
        }, 80);
    }
}

function handleTouchEnd(e) {
    if (!isTouching) return;
    isTouching = false;
    stopSoftDrop();

    const dx = touchCurrentX - touchStartX;
    const dy = touchCurrentY - touchStartY;
    const dt = Date.now() - touchStartTime;

    // Tap = rotation (si pas de mouvement significatif et pas de hard drop)
    if (
        !hasMoved &&
        Math.abs(dx) < TAP_THRESHOLD &&
        Math.abs(dy) < TAP_THRESHOLD &&
        dt < TAP_TIME_LIMIT
    ) {
        rotatePiece();
    }
}

/* ─────────────────────────────────────────
   TIMER
────────────────────────────────────────── */

function startTimer() {
    timerInterval = setInterval(() => {
        secondsElapsed++;
        const m = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
        const s = String(secondsElapsed % 60).padStart(2, "0");
        timerEl.textContent = `${m}:${s}`;
    }, 1000);
}

/* ─────────────────────────────────────────
   GAME OVER
────────────────────────────────────────── */

async function triggerGameOver(reason) {
    if (isGameOver) return;
    isGameOver = true;
    playGameSound('gameover');

    clearInterval(timerInterval);

    let $isOnline = await checkRealConnection();
    let isGlobalScoreBroken = false;

    // Si on bat le record mondial (déjà récupéré au début) et qu'on est en ligne
    if (score > (best_score_ever || 0) && $isOnline) {
        isGlobalScoreBroken = true;
        best_score_ever = score;
    }

    // Préparer les données pour la popup si un record est battu
    if (isGlobalScoreBroken) {
        window.pendingRecordData = {
            score: score,
            isScoreBroken: true
        };
    } else {
        window.pendingRecordData = null;
    }

    endTitle.textContent = reason;
    finalScoreEl.textContent = score;

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem("fallingBlocks_best", bestScore);
    }
    finalBestEl.textContent = bestScore;

    if (window.pendingRecordData) {
        recordMessagePopup.style.display = 'flex';
        recordMsgInput.value = '';
        recordCharCounter.textContent = '0/50';
        setTimeout(() => recordMsgInput.focus(), 100);
    } else {
        gameOverOverlay.style.display = 'flex';
    }
}


/* ─────────────────────────────────────────
   INPUTS
────────────────────────────────────────── */

document.addEventListener("keydown", (e) => {
    if (isPaused || isGameOver) return;
    startMusic();

    switch (e.key) {
        case "ArrowLeft": movePiece(0, -1); break;
        case "ArrowRight": movePiece(0, 1); break;
        case "ArrowDown": if (movePiece(1, 0)) playGameSound('softdrop'); break;
        case "ArrowUp": rotatePiece(); break;
        case " ": hardDrop(); break;
    }
});

// Touch events restrictifs
const gameArea = document.querySelector('.game-area');

// On ne commence le jeu QUE sur la grille
gameArea.addEventListener("touchstart", handleTouchStart, { passive: false });

// Mais on écoute le mouvement et la fin sur le document pour ne pas perdre le "focus" si le doigt sort de la grille
document.addEventListener("touchmove", handleTouchMove, { passive: false });
document.addEventListener("touchend", handleTouchEnd, { passive: false });
document.addEventListener("touchcancel", handleTouchEnd, { passive: false });

/* ─────────────────────────────────────────
   PAUSE
────────────────────────────────────────── */

document.getElementById("pauseBtn").addEventListener("click", togglePause);
resumeBtn.addEventListener("click", togglePause);

restartBtn.addEventListener("click", () => {
    window.location.reload();
});

menuBtn2.addEventListener("click", () => {
    window.location.href = "../../index.html";
});

soundBtn.addEventListener("click", () => {
    const enabled = toggleSound();
    if (enabled) soundBtn.classList.remove("muted");
    else soundBtn.classList.add("muted");
});

musicBtn.addEventListener("click", () => {
    const enabled = toggleMusic();
    if (enabled) musicBtn.classList.remove("muted");
    else musicBtn.classList.add("muted");
});

/* ─────────────────────────────────────────
   RECORDS OVERLAY
────────────────────────────────────────── */

recordsBtn.addEventListener("click", async () => {
    const opening = recordsOverlay.style.display !== "flex";
    recordsOverlay.style.display = opening ? "flex" : "none";

    if (opening) {
        recPersonalScore.textContent = bestScore;
        recStatus.textContent = "Synchronisation...";

        try {
            const scoreData = await getFirebaseRecordData("falling_blocks", "score");

            if (scoreData) {
                const scoreVal = (scoreData && typeof scoreData === "object") ? (scoreData.value || 0) : (scoreData || 0);

                recGlobalScore.textContent = scoreVal;

                // Message Handling
                const scoreCard = recGlobalScore.closest('.record-card');
                scoreCard.querySelectorAll('.rc-message').forEach(m => m.remove());

                if (scoreData?.message) {
                    const m = document.createElement('span');
                    m.className = 'rc-message';
                    m.textContent = `« ${scoreData.message} »`;
                    scoreCard.appendChild(m);
                }

                recStatus.textContent = "À jour (Cloud)";
            } else {
                recStatus.textContent = "Hors ligne (Records locaux)";
                recGlobalScore.textContent = best_score_ever || 0;
            }
        } catch (e) {
            console.error("Firebase records error:", e);
            recStatus.textContent = "Erreur de connexion";
        }
    }
});

recordsClose.addEventListener("click", () => {
    recordsOverlay.style.display = "none";
});

saveRecordMsgBtn.addEventListener('click', async () => {
    const message = recordMsgInput.value.trim().substring(0, 50);
    const data = window.pendingRecordData;
    if (!data) return;

    saveRecordMsgBtn.disabled = true;
    saveRecordMsgBtn.textContent = 'Enregistrement...';

    try {
        if (data.isScoreBroken) {
            await setFirebaseLeaderboard("falling_blocks", "score", {
                value: data.score,
                message: message,
                timestamp: Date.now()
            });
        }
    } catch (e) {
        console.error("Error saving record message:", e);
    }

    saveRecordMsgBtn.disabled = false;
    saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'none';
    gameOverOverlay.style.display = 'flex';
    window.pendingRecordData = null;
});

recordMsgInput.addEventListener('input', () => {
    recordCharCounter.textContent = `${recordMsgInput.value.length}/50`;
});

/* ─────────────────────────────────────────
   BUTTONS
────────────────────────────────────────── */

retryBtn.addEventListener("click", () => {
    location.reload();
});

menuBtn.addEventListener("click", () => {
    window.location.href = "../../index.html";
});

init();