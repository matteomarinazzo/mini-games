/**
 * Bataille Navale – game.js
 * Logique complète : placement, Firebase sync, tir, popups, game over
 */

import { auth, firebaseReady } from "../../../js/config/firebase-config.js";
import { updateRoom, listenToRoomChanges, deleteRoom } from "../../../js/firebaseWrk.js";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const GRID_SIZE = 10;
const TOTAL_BOAT_CELLS = 17; // 5+4+3+3+2
const PLACEMENT_DURATION = 180; // 3 minutes

const SHIPS = [
    { id: 1, len: 5, name: 'Porte-avions' },
    { id: 2, len: 4, name: 'Croiseur' },
    { id: 3, len: 3, name: 'Destroyer' },
    { id: 4, len: 3, name: 'Sous-marin' },
    { id: 5, len: 2, name: 'Torpilleur' }
];

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let myGrid = makeEmptyGrid();      // 0=vide, 1-5=bateau, 2=raté, 3=touché
let targetGrid = makeEmptyGrid();  // ce que je vois de l'ennemi

let myHitsDone = 0;
let opponentHitsDone = 0;
let mySunkCount = 0;

let gamePhase = 'waiting'; // waiting | placement | playing | finished
let isGameOver = false;
let isMyTurn = false;
let myReadyState = false;

let roomID = null;
let myUid = null;
let opponentUid = null;
let lastRoomData = null;
let roomReceivedOnce = false;

let unplacedShips = [];
let drag = null;
let placementInterval = null;
let hasUserInteracted = false; // Pour autoriser la vibration⚓🔥

let rematchStarted = false

// ─────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────
const gridBateauxEl = document.getElementById('gridBateaux');       // placement grid
const gridBateauxGame = document.getElementById('gridBateauxGame');   // game grid (ma flotte)
const gridCibles = document.getElementById('gridCibles');

const myHitsEl = document.getElementById('myHits');
const opponentHitsEl = document.getElementById('opponentHits');
const turnPill = document.getElementById('turnIndicator');
const myHudArea = document.getElementById('myHudArea');
const opponentHudArea = document.getElementById('opponentHudArea');
const opponentNameEl = document.getElementById('opponentName');
const myNameEl = document.getElementById('myNameEl');

const myMissesStat = document.getElementById('myMissesStat');
const myHitsTakenStat = document.getElementById('myHitsTakenStat');

const placementOverlay = document.getElementById('placementOverlay');
const placementTimerEl = document.getElementById('placementTimer');
const finalHitsEl = document.getElementById('finalHits');
const readyActionBtn = document.getElementById('readyActionBtn');

const gameArea = document.getElementById('gameArea');
const gameBoard3d = document.getElementById('gameBoard3d');
const shipyardEl = document.getElementById('shipyard');
const ciblesSubtitle = document.getElementById('ciblesSubtitle');

const shotPopup = document.getElementById('shotPopup');
const shotIcon = document.getElementById('shotIcon');
const shotTitle = document.getElementById('shotTitle');
const shotCoord = document.getElementById('shotCoord');

const attackPopup = document.getElementById('attackPopup');
const attackMsg = document.getElementById('attackMsg');

const gameOverOverlay = document.getElementById('gameOverOverlay');
const endEmoji = document.getElementById('endEmoji');
const endTitle = document.getElementById('endTitle');
const finalScoreEl = document.getElementById('finalScore');

const retryBtn = document.getElementById('retryBtn');
const menuBtn = document.getElementById('menuBtn');

const waitingOverlay = document.getElementById('waitingOverlay');

const rulesBtn = document.getElementById('rulesBtn');
const rulesOverlay = document.getElementById('rulesOverlay');
const rulesClose = document.getElementById('rulesClose');

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function makeEmptyGrid() {
    return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}

/** Convert r,c to "A1" notation */
function toCoord(r, c) {
    return String.fromCharCode(65 + r) + (c + 1);
}

function vibrate(pattern) {
    if (hasUserInteracted && navigator.vibrate) {
        try {
            navigator.vibrate(pattern);
        } catch (e) {
            console.warn("Vibration failed", e);
        }
    }
}

/** Web Audio API – sons synthétiques */
let _audioCtx = null;
function getAudioCtx() {
    hasUserInteracted = true; // Une demande d'audioContext implique une interaction
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    return _audioCtx;
}

// Global listeners pour capter l'interaction dès le départ
window.addEventListener('click', () => { hasUserInteracted = true; }, { once: true });
window.addEventListener('touchstart', () => { hasUserInteracted = true; }, { once: true });

// Utilitaire : master gain pour booster globalement
function masterOut(ctx, gainValue = 1.8) {
    const g = ctx.createGain();
    g.gain.value = gainValue;
    g.connect(ctx.destination);
    return g;
}

function playSound(type, shipLen = 3) {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // ─────────────────────────────────────────────────
    // 💦 PLOUF — Eau réaliste : impact sourd + turbulence + bulle d'air
    // ─────────────────────────────────────────────────
    if (type === "miss") {
        const out = masterOut(ctx, 2.2);

        // --- Couche 1 : THUD d'impact (sub grave court)
        const thud = ctx.createOscillator();
        const thudGain = ctx.createGain();
        thud.type = "sine";
        thud.frequency.setValueAtTime(90, now);
        thud.frequency.exponentialRampToValueAtTime(30, now + 0.12);
        thudGain.gain.setValueAtTime(0.9, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        thud.connect(thudGain); thudGain.connect(out);
        thud.start(now); thud.stop(now + 0.15);

        // --- Couche 2 : SPLASH (bruit blanc filtré, monte puis descend)
        const bufSize = ctx.sampleRate * 0.55;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;

        const splashSrc = ctx.createBufferSource();
        splashSrc.buffer = buf;

        const hp = ctx.createBiquadFilter(); // enlève le très grave du bruit
        hp.type = "highpass"; hp.frequency.value = 600;

        const bp = ctx.createBiquadFilter(); // colore le splash
        bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 0.7;

        const splashGain = ctx.createGain();
        splashGain.gain.setValueAtTime(0, now);
        splashGain.gain.linearRampToValueAtTime(0.65, now + 0.04); // attaque rapide
        splashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55); // retombée lente

        splashSrc.connect(hp); hp.connect(bp); bp.connect(splashGain); splashGain.connect(out);
        splashSrc.start(now); splashSrc.stop(now + 0.55);

        // --- Couche 3 : GLUG — bulle d'air qui remonte (sine FM descendant)
        const glug = ctx.createOscillator();
        const glugMod = ctx.createOscillator(); // modulation pour rendre ça organique
        const glugModGain = ctx.createGain();
        const glugGain = ctx.createGain();

        glug.type = "sine";
        glug.frequency.setValueAtTime(520, now + 0.06);
        glug.frequency.exponentialRampToValueAtTime(160, now + 0.25);

        glugMod.type = "sine"; glugMod.frequency.value = 18;
        glugModGain.gain.value = 60;
        glugMod.connect(glugModGain); glugModGain.connect(glug.frequency);

        glugGain.gain.setValueAtTime(0, now + 0.06);
        glugGain.gain.linearRampToValueAtTime(0.55, now + 0.09);
        glugGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        glug.connect(glugGain); glugGain.connect(out);
        glugMod.start(now); glugMod.stop(now + 0.35);
        glug.start(now + 0.06); glug.stop(now + 0.3);
    }

    // ─────────────────────────────────────────────────
    // 💥 BOOM — Explosion navale : sub punch + bruit explosif + métal
    // ─────────────────────────────────────────────────
    else if (type === "hit") {
        const out = masterOut(ctx, 2.5);

        // --- Couche 1 : SUB CANNON — onde de choc très grave
        const cannon = ctx.createOscillator();
        const cannonGain = ctx.createGain();
        cannon.type = "sine";
        cannon.frequency.setValueAtTime(55, now);
        cannon.frequency.exponentialRampToValueAtTime(25, now + 0.4);
        cannonGain.gain.setValueAtTime(1.0, now);
        cannonGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        cannon.connect(cannonGain); cannonGain.connect(out);
        cannon.start(now); cannon.stop(now + 0.45);

        // --- Couche 2 : EXPLOSION CORPS (bruit blanc + lowpass qui s'ouvre)
        const expBuf = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
        const expData = expBuf.getChannelData(0);
        for (let i = 0; i < expData.length; i++) expData[i] = Math.random() * 2 - 1;
        const expSrc = ctx.createBufferSource();
        expSrc.buffer = expBuf;

        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(300, now);
        lp.frequency.exponentialRampToValueAtTime(2500, now + 0.03); // s'ouvre brutalement
        lp.frequency.exponentialRampToValueAtTime(200, now + 0.6);

        const expGain = ctx.createGain();
        expGain.gain.setValueAtTime(0.85, now);
        expGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

        expSrc.connect(lp); lp.connect(expGain); expGain.connect(out);
        expSrc.start(now); expSrc.stop(now + 0.8);

        // --- Couche 3 : METAL CLANG — impact coque
        const clang = ctx.createOscillator();
        const clangGain = ctx.createGain();
        clang.type = "sawtooth";
        clang.frequency.setValueAtTime(180, now);
        clang.frequency.exponentialRampToValueAtTime(45, now + 0.08);
        clangGain.gain.setValueAtTime(0.45, now);
        clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        // distorsion douce via waveshaper
        const ws = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const x = (i * 2) / 256 - 1;
            curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x));
        }
        ws.curve = curve;

        clang.connect(ws); ws.connect(clangGain); clangGain.connect(out);
        clang.start(now); clang.stop(now + 0.12);

        // --- Couche 4 : CRACKLE haute fréquence (débris/feu)
        const crackBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
        const crackData = crackBuf.getChannelData(0);
        for (let i = 0; i < crackData.length; i++) {
            // bruit impulsionnel épars (crépitement)
            crackData[i] = Math.random() < 0.05 ? (Math.random() * 2 - 1) * 0.9 : 0;
        }
        const crackSrc = ctx.createBufferSource();
        crackSrc.buffer = crackBuf;

        const crackHp = ctx.createBiquadFilter();
        crackHp.type = "highpass"; crackHp.frequency.value = 3000;

        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime(0.5, now + 0.05);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        crackSrc.connect(crackHp); crackHp.connect(crackGain); crackGain.connect(out);
        crackSrc.start(now + 0.02); crackSrc.stop(now + 0.45);
    }

    // ─────────────────────────────────────────────────
    // 🫧 BLOP-BLOP-BLOP — Naufrage : bulles organiques + gargouillis final
    // ─────────────────────────────────────────────────
    else if (type === "sunk" || type === "sinking") {
        const hits = (shipLen && shipLen > 0) ? shipLen : 3;
        const gap = 0.22;

        for (let i = 0; i < hits; i++) {
            const t = now + i * gap;
            const out = masterOut(ctx, i === 0 ? 2.5 : 2.0);

            // SUB CANNON
            const cannon = ctx.createOscillator(), cannonGain = ctx.createGain();
            cannon.type = "sine";
            cannon.frequency.setValueAtTime(50 - i * 4, t);
            cannon.frequency.exponentialRampToValueAtTime(22, t + 0.35);
            cannonGain.gain.setValueAtTime(0.85, t);
            cannonGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
            cannon.connect(cannonGain); cannonGain.connect(out);
            cannon.start(t); cannon.stop(t + 0.4);

            // EXPLOSION CORPS
            const expBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
            const expData = expBuf.getChannelData(0);
            for (let j = 0; j < expData.length; j++) expData[j] = Math.random() * 2 - 1;
            const expSrc = ctx.createBufferSource(); expSrc.buffer = expBuf;
            const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
            lp.frequency.setValueAtTime(280, t);
            lp.frequency.exponentialRampToValueAtTime(2200, t + 0.025);
            lp.frequency.exponentialRampToValueAtTime(180, t + 0.5);
            const expGain = ctx.createGain();
            expGain.gain.setValueAtTime(0.7, t);
            expGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
            expSrc.connect(lp); lp.connect(expGain); expGain.connect(out);
            expSrc.start(t); expSrc.stop(t + 0.62);

            // METAL CLANG
            const clang = ctx.createOscillator(), clangGain = ctx.createGain();
            clang.type = "sawtooth";
            clang.frequency.setValueAtTime(160 - i * 15, t);
            clang.frequency.exponentialRampToValueAtTime(40, t + 0.07);
            clangGain.gain.setValueAtTime(0.35, t);
            clangGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
            const ws = ctx.createWaveShaper();
            const curve = new Float32Array(256);
            for (let j = 0; j < 256; j++) {
                const x = (j * 2) / 256 - 1;
                curve[j] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x));
            }
            ws.curve = curve;
            clang.connect(ws); ws.connect(clangGain); clangGain.connect(out);
            clang.start(t); clang.stop(t + 0.1);
        }
    }
}

// ─────────────────────────────────────────────
// POPUPS
// ─────────────────────────────────────────────
let shotPopupTimeout = null;

function showShotPopup(type, r, c, sunkShipId = null) {
    const coord = toCoord(r, c);
    shotPopup.className = 'shot-popup';

    if (type === 'sunk') {
        const shipName = getSunkShipName(r, c);
        shotIcon.textContent = '🔥';
        shotTitle.textContent = `Coulé ! ${shipName ? '– ' + shipName : ''}`;
        shotCoord.textContent = coord;
        shotPopup.classList.add('type-sunk');
        const shipId = sunkShipId ?? lastRoomData?.grids?.[opponentUid]?.[r]?.[c];
        const shipLen = SHIPS.find(s => s.id === shipId)?.len ?? 3;
        playSound('sunk', shipLen);
        vibrate([50, 50, 200]);
    } else if (type === 'hit') {
        shotIcon.textContent = '💥';
        shotTitle.textContent = 'Touché !';
        shotCoord.textContent = coord;
        shotPopup.classList.add('type-hit');
        playSound('hit');
        vibrate([50, 30, 100]);
    } else {
        shotIcon.textContent = '💧';
        shotTitle.textContent = 'Raté !';
        shotCoord.textContent = coord;
        shotPopup.classList.add('type-miss');
        playSound('miss');
        vibrate(40);
    }

    shotPopup.classList.add('show');
    if (shotPopupTimeout) clearTimeout(shotPopupTimeout);
    shotPopupTimeout = setTimeout(() => { shotPopup.classList.remove('show'); }, 2400);
}

let attackPopupTimeout = null;

function showAttackPopup(r, c, result) {
    const coord = toCoord(r, c);
    const emoji = result === 'sunk' ? '🔥' : result === 'hit' ? '💥' : '💧';
    attackMsg.textContent = `${emoji} ${opponentNameEl.textContent} en ${coord} !`;
    attackPopup.classList.add('show');
    if (result === 'sunk') {
        const shipId = lastRoomData?.grids?.[myUid]?.[r]?.[c];
        const shipLen = SHIPS.find(s => s.id === shipId)?.len ?? 3;
        playSound('sunk', shipLen);
    } else {
        playSound(result);
    }
    if (attackPopupTimeout) clearTimeout(attackPopupTimeout);
    attackPopupTimeout = setTimeout(() => { attackPopup.classList.remove('show'); }, 2800);
}

// Retrouver le nom du bateau coulé à partir de la grille
function getSunkShipName(r, c) {
    const id = lastRoomData?.grids?.[myUid]?.[r]?.[c];
    if (!id) return '';
    return SHIPS.find(s => s.id === id)?.name || '';
}

// ─────────────────────────────────────────────
// LIVRET DE RÈGLES
// ─────────────────────────────────────────────
function setupRules() {
    rulesBtn.addEventListener('click', () => rulesOverlay.classList.toggle('open'));
    rulesClose.addEventListener('click', () => rulesOverlay.classList.remove('open'));
    rulesOverlay.addEventListener('click', (e) => {
        if (e.target === rulesOverlay) rulesOverlay.classList.remove('open');
    });
}

// ─────────────────────────────────────────────
// MULTIPLAYER – Firebase listener
// ─────────────────────────────────────────────
function setupMultiplayer() {
    listenToRoomChanges(roomID, (room) => {
        if (!room) {
            if (!roomReceivedOnce) return;
            if (!isGameOver) {
                alert("La salle a été fermée.");
                window.location.href = 'index.html';
            }
            return;
        }
        roomReceivedOnce = true;
        lastRoomData = room;
        // Note: ne pas retourner sur isGameOver ici — la revanche doit passer même en fin de partie

        const pIds = Object.keys(room.players || {});
        opponentUid = pIds.find(id => id !== myUid);

        if (opponentUid && room.players[opponentUid]) {
            opponentNameEl.textContent = room.players[opponentUid].name || 'Adversaire';
        }

        // ── State machine ──

        // Attente du deuxième joueur
        if (room.state === 'playing' || room.state === 'placement') {
            waitingOverlay.style.display = 'none';
        }

        // Pour les phases de jeu actives, bloquer si la partie est terminée
        // Exception: laisser passer 'finished' (revanche) et 'placement' (reset revanche)
        const blockIfGameOver = isGameOver && room.state !== 'finished' && room.state !== 'placement';
        if (blockIfGameOver) return;

        // Leader initialise le placement dès que 2 joueurs
        if (room.leaderId === myUid && opponentUid && pIds.length >= 2 &&
            (!room.state || room.state === 'waiting')) {
            updateRoom(roomID, {
                state: 'placement',
                placementStartTime: Date.now(),
                readyStatus: {}
            });
            return;
        }

        // ── Phase Placement ──
        if (room.state === 'placement') {
            if (isGameOver) {
                resetForRematch(room);
                return;
            }
            if (gamePhase !== 'placement') {
                gamePhase = 'placement';
                startPlacementPhase(room.placementStartTime);
            }

            // Leader : les deux sont prêts → go playing
            if (room.leaderId === myUid &&
                room.readyStatus?.[myUid] && opponentUid && room.readyStatus?.[opponentUid]) {
                updateRoom(roomID, { state: 'playing', currentTurn: myUid });
            }
            return;
        }

        // ── Phase Playing ──
        if (room.state === 'playing') {
            if (gamePhase !== 'playing') {
                gamePhase = 'playing';
                endPlacementPhase();
            }

            if (room.currentTurn) {
                const wasMyTurn = isMyTurn;
                isMyTurn = (room.currentTurn === myUid);

                // Animation 3D : zoom sur la grille de tir si c'est mon tour
                if (isMyTurn) {
                    gameBoard3d.classList.add('view-shooting');
                } else {
                    gameBoard3d.classList.remove('view-shooting');
                }

                if (isMyTurn && !wasMyTurn) {
                    turnPill.textContent = "À TOI DE JOUER !";
                    turnPill.className = "turn-pill my-turn";
                    vibrate(100);
                } else if (!isMyTurn) {
                    turnPill.textContent = "ATTENTE ADVERSAIRE...";
                    turnPill.className = "turn-pill opponent-turn";
                }

                // Détecter une attaque adverse (quand ça devient mon tour après pas l'avoir été)
                if (isMyTurn && !wasMyTurn && room.grids && room.shots) {
                    detectLastEnemyShot(room);
                }

                updateTurnUI();
                syncGridsFromFirebase(room);
            }
            checkWinCondition();
        }

        // ── Game Over ──
        if (room.state === 'finished') {
            const won = room.winner === myUid;
            triggerGameOver(won);

            // Gérer la revanche en temps réel
            const iWant = room.rematch?.[myUid];
            const opponentWants = opponentUid && room.rematch?.[opponentUid];

            if (opponentWants && !iWant) {
                // L'adversaire veut une revanche → proposer d'accepter
                retryBtn.textContent = '✅ Accepter la revanche !';
                retryBtn.disabled = false;
            } else if (iWant && !opponentWants) {
                retryBtn.textContent = '⏳ En attente…';
                retryBtn.disabled = true;
            }

            // Les deux veulent → le leader relance
            if (iWant && opponentWants && room.leaderId === myUid) {
                startRematch();
            }
            return;
        }
    });
}

/** Détecter le dernier tir de l'adversaire pour afficher la popup */
function detectLastEnemyShot(room) {
    if (!room.shots || !opponentUid || !room.grids) return;
    const enemyShots = room.shots[opponentUid];
    const myFleet = room.grids[myUid];
    if (!enemyShots || !myFleet) return;

    // Chercher la case qui a un shot mais qui n'avait pas été notifiée
    // On se base sur la différence vs l'état précédent
    const prevShots = lastRoomData?.shots?.[opponentUid];

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const nowShot = enemyShots[r][c];
            const prevShot = prevShots ? prevShots[r][c] : 0;
            if (nowShot && !prevShot) {
                // C'est le nouveau tir
                const isHit = myFleet[r][c] >= 1 && myFleet[r][c] <= 5;
                const shipId = myFleet[r][c];
                const isSunk = isHit && isShipSunk(shipId, myFleet, enemyShots);
                showAttackPopup(r, c, isSunk ? 'sunk' : isHit ? 'hit' : 'miss');
                return;
            }
        }
    }
}

/** Vérifie si toutes les cases d'un bateau sont touchées */
function isShipSunk(shipId, fleet, shots) {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (fleet[r][c] === shipId && !shots[r][c]) return false;
        }
    }
    return true;
}

function isShipSunkInTarget(shipId, enemyFleet, myShots) {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (enemyFleet[r][c] === shipId && !myShots[r][c]) return false;
        }
    }
    return true;
}

// ─────────────────────────────────────────────
// PHASE 1 – PLACEMENT
// ─────────────────────────────────────────────
function startPlacementPhase(startTimeServer) {
    // Si le joueur est déjà prêt (ex: rafraîchissement page), ne pas réinitialiser
    if (myReadyState) return;

    console.log("TESTTTTTTTTTTTTTTTTtt")

    gamePhase = 'placement'
    placementOverlay.style.display = 'flex';
    gameArea.style.display = 'none';
    waitingOverlay.style.display = 'none';

    unplacedShips = SHIPS.map(s => ({ ...s, orientation: 'h' }));
    myGrid = makeEmptyGrid(); // reset grille locale
    buildPlacementGrid();
    renderShipyard();
    computeCellSize();

    // Toujours utiliser le temps serveur Firebase pour éviter le reset au F5
    const startTime = (typeof startTimeServer === 'number' && startTimeServer > 0)
        ? startTimeServer
        : Date.now();

    if (placementInterval) clearInterval(placementInterval);

    placementInterval = setInterval(() => {
        if (myReadyState) { clearInterval(placementInterval); return; }

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const timeLeft = PLACEMENT_DURATION - elapsed;

        if (timeLeft <= 0) {
            placementTimerEl.textContent = "00:00";
            clearInterval(placementInterval);
            autoPlaceRemainingBoats();
            confirmReady();
        } else {
            const m = String(Math.floor(timeLeft / 60)).padStart(2, '0');
            const s = String(timeLeft % 60).padStart(2, '0');
            placementTimerEl.textContent = `${m}:${s}`;
            placementTimerEl.classList.toggle('urgent', timeLeft <= 30);
        }
    }, 1000);
}

function endPlacementPhase() {
    if (placementInterval) clearInterval(placementInterval);
    placementOverlay.style.display = 'none';
    gameArea.style.display = 'flex';
    buildGameGrids();
    computeCellSize();
}

function confirmReady() {
    if (myReadyState) return;
    myReadyState = true;
    if (placementInterval) clearInterval(placementInterval);

    readyActionBtn.disabled = true;
    readyActionBtn.textContent = "⏳ En attente de l'adversaire…";
    readyActionBtn.classList.add('is-ready');

    updateRoom(roomID, {
        [`readyStatus/${myUid}`]: true,
        [`grids/${myUid}`]: myGrid,
        [`shots/${myUid}`]: makeEmptyGrid()
    });
}

function autoPlaceRemainingBoats() {
    const toPlace = [...unplacedShips];
    unplacedShips = [];
    toPlace.forEach(ship => {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 500) {
            attempts++;
            const r = Math.floor(Math.random() * GRID_SIZE);
            const c = Math.floor(Math.random() * GRID_SIZE);
            ship.orientation = Math.random() > .5 ? 'h' : 'v';
            if (canPlace(r, c, ship)) {
                for (let i = 0; i < ship.len; i++) {
                    const rr = ship.orientation === 'v' ? r + i : r;
                    const cc = ship.orientation === 'h' ? c + i : c;
                    myGrid[rr][cc] = ship.id;
                }
                placed = true;
            }
        }
    });
    renderShipyard();
    renderPlacementGrid();
}

// ─────────────────────────────────────────────
// PHASE 2 – TIR
// ─────────────────────────────────────────────
function shootAt(r, c) {
    if (gamePhase !== 'playing' || !isMyTurn || isGameOver) return;
    if (targetGrid[r][c] !== 0) return;

    gridCibles.classList.add('locked');

    const myShots = JSON.parse(JSON.stringify(lastRoomData.shots?.[myUid] || makeEmptyGrid()));
    myShots[r][c] = 1;

    const enemyFleet = lastRoomData.grids[opponentUid];
    const cellVal = enemyFleet?.[r]?.[c] ?? 0;
    const isHit = cellVal >= 1 && cellVal <= 5;
    const shipId = cellVal;

    // Optimistic UI
    targetGrid[r][c] = isHit ? 2 : 1; // 1=miss, 2=hit
    renderGameGrids();

    // Vérifier coulé
    const isSunk = isHit && isShipSunkInTarget(shipId, enemyFleet, myShots);
    if (isSunk) {
        markSunk(shipId, enemyFleet, 'cibles');
        mySunkCount++;
    }

    showShotPopup(isSunk ? 'sunk' : isHit ? 'hit' : 'miss', r, c, isSunk ? shipId : null);

    // Transition back to map after delay then switch turn
    setTimeout(() => {
        gameBoard3d.classList.remove('view-shooting');
        setTimeout(() => {
            updateRoom(roomID, {
                [`shots/${myUid}`]: myShots,
                currentTurn: opponentUid
            });
        }, 400);
    }, 1800);
}

function checkWinCondition() {
    if (myHitsDone >= TOTAL_BOAT_CELLS) {
        updateRoom(roomID, { state: 'finished', winner: myUid });
    } else if (opponentHitsDone >= TOTAL_BOAT_CELLS) {
        updateRoom(roomID, { state: 'finished', winner: opponentUid });
    }
}

// ─────────────────────────────────────────────
// SYNC DEPUIS FIREBASE
// ─────────────────────────────────────────────
function syncGridsFromFirebase(room) {
    if (!room.grids || !room.shots) return;

    const initialMyFleet = room.grids[myUid] || makeEmptyGrid();
    const enemyShotsOnMe = room.shots[opponentUid] || makeEmptyGrid();
    const initialEnemy = room.grids[opponentUid] || makeEmptyGrid();
    const myShotsOnEnemy = room.shots[myUid] || makeEmptyGrid();

    let missesOnMe = 0, hitsOnMe = 0, hitsOnEnemy = 0;

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            // Ma grille
            let cell = initialMyFleet[r][c];
            const enemyShot = enemyShotsOnMe[r][c];
            if (enemyShot) {
                if (cell >= 1 && cell <= 5) { cell = 7; hitsOnMe++; }  // 7 = touché (boat hit)
                else { cell = 6; missesOnMe++; } // 6 = raté (empty shot)
            }
            myGrid[r][c] = cell;

            // Grille cibles
            let display = 0;
            const myShot = myShotsOnEnemy[r][c];
            if (myShot) {
                const ec = initialEnemy[r][c];
                if (ec >= 1 && ec <= 5) { display = 2; hitsOnEnemy++; } // 2=hit
                else { display = 1; } // 1=miss
            }
            targetGrid[r][c] = display;
        }
    }

    // Marquer les bateaux coulés sur ma grille (toutes cases d'un bateau à 7 → 8)
    for (let shipId = 1; shipId <= 5; shipId++) {
        const myCells = [];
        const enemyCells = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (initialMyFleet[r][c] === shipId) myCells.push({ r, c });
                if (initialEnemy[r][c] === shipId) enemyCells.push({ r, c });
            }
        }

        // Ma flotte (encaissé)
        if (myCells.length > 0 && myCells.every(({ r, c }) => myGrid[r][c] === 7)) {
            myCells.forEach(({ r, c }) => { myGrid[r][c] = 8; }); // 8 = coulé (orange)
        }
        // Flotte adverse (mes tirs)
        if (enemyCells.length > 0 && enemyCells.every(({ r, c }) => targetGrid[r][c] === 2)) {
            enemyCells.forEach(({ r, c }) => { targetGrid[r][c] = 3; }); // 3 = coulé (orange)
        }
    }

    myMissesStat.textContent = missesOnMe;
    myHitsTakenStat.textContent = hitsOnMe;
    opponentHitsDone = hitsOnMe;
    myHitsDone = hitsOnEnemy;

    myHitsEl.innerHTML = `${hitsOnEnemy}<span>/17</span>`;
    opponentHitsEl.innerHTML = `${hitsOnMe}<span>/17</span>`;

    renderGameGrids();
}

// ─────────────────────────────────────────────
// UI & TOUR
// ─────────────────────────────────────────────
function updateTurnUI() {
    if (isMyTurn) {
        turnPill.textContent = '🎯 À TON TOUR !';
        turnPill.className = 'turn-pill my-turn';
        myHudArea.classList.add('active-turn');
        opponentHudArea.classList.remove('active-turn');
        ciblesSubtitle.textContent = 'Clique pour tirer !';
        gridCibles.classList.remove('locked');
        gameBoard3d.classList.add('view-shooting');
    } else {
        turnPill.textContent = '⏳ TOUR ADVERSE';
        turnPill.className = 'turn-pill opponent-turn';
        myHudArea.classList.remove('active-turn');
        opponentHudArea.classList.add('active-turn');
        ciblesSubtitle.textContent = 'En attente du tir adverse…';
        gridCibles.classList.add('locked');
        gameBoard3d.classList.remove('view-shooting');
    }
}

// ─────────────────────────────────────────────
// GRILLES – BUILD & RENDER
// ─────────────────────────────────────────────
function computeCellSize() {
    const hudH = 54;
    const availH = window.innerHeight - hudH - 80;
    const availW = window.innerWidth - 40;

    // En 3D, les panneaux sont empilés/perspectivés, on réduit la taille max pour tout voir
    const cs = Math.min(
        Math.floor((availH / 1.75) / GRID_SIZE), // Un peu plus serré pour la 3D
        Math.floor(availW / GRID_SIZE),
        32 // Réduit de 36 à 32 pour la sécurité d'affichage
    );
    const val = Math.max(cs, 24) + 'px';
    document.documentElement.style.setProperty('--cs', val);
}

function buildCells(gridEl, clickHandler) {
    gridEl.innerHTML = '';
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.r = r;
            cell.dataset.c = c;
            if (clickHandler) {
                cell.addEventListener('click', () => clickHandler(r, c));
                cell.addEventListener('touchend', (e) => { e.preventDefault(); clickHandler(r, c); }, { passive: false });
            }
            gridEl.appendChild(cell);
        }
    }
}

function buildPlacementGrid() {
    buildCells(gridBateauxEl, null);
    gridBateauxEl.removeEventListener('mousedown', pickupShip);
    gridBateauxEl.removeEventListener('touchstart', pickupShip);
    gridBateauxEl.addEventListener('mousedown', pickupShip);
    gridBateauxEl.addEventListener('touchstart', pickupShip, { passive: false });
}

function buildGameGrids() {
    buildCells(gridBateauxGame, null);
    buildCells(gridCibles, shootAt);
}

function renderPlacementGrid() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = gridBateauxEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
            if (!cell) continue;
            cell.className = 'cell';
            cell.style.backgroundColor = ''; // reset inline style (highlight/conflict residuel)
            const v = myGrid[r][c];
            if (v >= 1 && v <= 5) cell.classList.add('boat');
        }
    }
}

function renderGameGrids() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            // 1. Ma flotte (Panneau Haut)
            const cb = gridBateauxGame?.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
            if (cb) {
                cb.className = 'cell';
                const v = myGrid[r][c];
                if (v >= 1 && v <= 5) cb.classList.add('boat');       // bateau intact
                else if (v === 6) cb.classList.add('miss');        // tir raté (Rouge)
                else if (v === 7) cb.classList.add('hit');         // bateau touché (Vert)
                else if (v === 8) cb.classList.add('hit', 'sunk'); // bateau coulé (Orange)
            }

            // 2. Zone de Tir (Panneau Bas)
            const ct = gridCibles?.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
            if (ct) {
                ct.className = 'cell';
                const v = targetGrid[r][c];
                if (v === 1) ct.classList.add('miss'); // Raté (Rouge)
                else if (v === 2) ct.classList.add('hit');  // Touché (Vert)
                else if (v === 3) ct.classList.add('hit', 'sunk'); // Coulé
            }
        }
    }
}

/** Marquer toutes les cellules d'un bateau coulé */
function markSunk(shipId, fleet, gridType) {
    const gridEl = gridType === 'cibles' ? gridCibles : gridBateauxGame;
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (fleet[r][c] === shipId) {
                if (gridType === 'cibles') targetGrid[r][c] = 4;
                const cell = gridEl?.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
                if (cell) { cell.className = 'cell hit sunk'; }
            }
        }
    }
}

// ─────────────────────────────────────────────
// GAME OVER & REVANCHE
// ─────────────────────────────────────────────
function triggerGameOver(won) {
    if (isGameOver) return;
    isGameOver = true;

    endEmoji.textContent = won ? '🏆' : '💀';
    endTitle.textContent = won ? 'VICTOIRE !' : 'DÉFAITE…';
    finalScoreEl.textContent = `${mySunkCount}/5`;
    finalHitsEl.textContent = `${myHitsDone}/17`;
    gameOverOverlay.style.display = 'flex';

    vibrate(won ? [100, 50, 100, 50, 150] : [300]);
}

async function startRematch() {
    if (rematchStarted) return;
    rematchStarted = true;
    if (!roomID || lastRoomData?.leaderId !== myUid) return;
    await updateRoom(roomID, {
        state: 'placement',
        placementStartTime: Date.now(),
        readyStatus: {},
        grids: null,
        shots: null,
        currentTurn: null,
        rematch: null,
        winner: null
    });
}

function resetForRematch(room) {
    if (gamePhase === 'placement' && !isGameOver) return;

    // Réinitialiser l'état local
    rematchStarted = false;
    isGameOver = false;
    myReadyState = false;
    gamePhase = 'placement';
    myGrid = makeEmptyGrid();
    targetGrid = makeEmptyGrid();
    myHitsDone = 0;
    opponentHitsDone = 0;
    mySunkCount = 0;

    retryBtn.textContent = '⚓ Demander Revanche';
    retryBtn.disabled = false;
    gameOverOverlay.style.display = 'none';
    gameBoard3d.classList.remove('view-shooting');
    startPlacementPhase(room.placementStartTime);
}

// ─────────────────────────────────────────────
// DRAG & DROP – SHIPYARD
// ─────────────────────────────────────────────
function renderShipyard() {
    shipyardEl.innerHTML = '';
    unplacedShips.forEach((ship, index) => {
        const slot = document.createElement('div');
        slot.className = 'ship-slot';
        const shipEl = createShipEl(ship, index);
        slot.appendChild(shipEl);
        shipyardEl.appendChild(slot);
    });

    // Activer btn prêt seulement si tout placé
    readyActionBtn.disabled = unplacedShips.length > 0;
    if (unplacedShips.length === 0) {
        readyActionBtn.textContent = '✅ Je suis prêt !';
    } else {
        readyActionBtn.textContent = `🔒 ${unplacedShips.length} bateau${unplacedShips.length > 1 ? 'x' : ''} restant${unplacedShips.length > 1 ? 's' : ''}`;
    }
}

function createShipEl(ship, index) {
    const shipEl = document.createElement('div');
    shipEl.className = 'ship';
    const cols = ship.orientation === 'h' ? ship.len : 1;
    const rows = ship.orientation === 'v' ? ship.len : 1;
    shipEl.style.display = 'grid';
    shipEl.style.gridTemplateColumns = `repeat(${cols}, var(--cs))`;
    shipEl.style.gridTemplateRows = `repeat(${rows}, var(--cs))`;
    shipEl.style.gap = '2px';
    for (let i = 0; i < ship.len; i++) {
        const b = document.createElement('div');
        b.className = 'ship-block';
        shipEl.appendChild(b);
    }
    attachDrag(shipEl, ship, index);
    return shipEl;
}

function getCellSize() {
    const cs = getComputedStyle(document.documentElement).getPropertyValue('--cs').trim();
    return parseInt(cs) || 30;
}

function getGridRect() {
    return gridBateauxEl.getBoundingClientRect();
}

function createGhost(ship) {
    const cs = getCellSize();
    const cols = ship.orientation === 'h' ? ship.len : 1;
    const rows = ship.orientation === 'v' ? ship.len : 1;
    const g = document.createElement('div');
    g.className = 'drag-ghost';
    g.style.display = 'grid';
    g.style.gridTemplateColumns = `repeat(${cols}, ${cs}px)`;
    g.style.gridTemplateRows = `repeat(${rows}, ${cs}px)`;
    g.style.gap = '2px';
    for (let i = 0; i < ship.len; i++) {
        const b = document.createElement('div');
        b.className = 'ship-block';
        g.appendChild(b);
    }
    document.body.appendChild(g);
    return g;
}

function snapToGrid(gx, gy, ship) {
    const rect = getGridRect();
    const w = rect.width / GRID_SIZE;
    const h = rect.height / GRID_SIZE;
    const cols = ship.orientation === 'h' ? ship.len : 1;
    const rows = ship.orientation === 'v' ? ship.len : 1;

    let lx = Math.max(0, Math.min(gx - rect.left, rect.width - cols * w));
    let ly = Math.max(0, Math.min(gy - rect.top, rect.height - rows * h));

    const c = Math.round(lx / w);
    const r = Math.round(ly / h);
    return { x: rect.left + c * w, y: rect.top + r * h, r, c };
}

function attachDrag(pieceEl, ship, index) {
    let grabX = 0, grabY = 0, active = false, hasMoved = false;
    const ptr = (e) => e.type.startsWith('touch') ? (e.touches[0] || e.changedTouches[0]) : e;

    const onStart = (e) => {
        if (gamePhase !== 'placement' || myReadyState) return;
        if (e.type === 'touchstart') e.preventDefault();
        const p = ptr(e);
        hasMoved = false;
        pieceEl.style.opacity = '0.5';
        const rect = pieceEl.getBoundingClientRect();
        const cols = ship.orientation === 'h' ? ship.len : 1;
        const rows = ship.orientation === 'v' ? ship.len : 1;
        const cs = getCellSize();
        grabX = ((p.clientX - rect.left) / rect.width) * (cols * cs);
        grabY = ((p.clientY - rect.top) / rect.height) * (rows * cs);
        active = true;
        drag = { ship, index, ghost: createGhost(ship), grabX, grabY };
        positionGhost(p.clientX, p.clientY);

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd, { passive: false });
    };

    const onMove = (e) => {
        if (!active || !drag) return;
        hasMoved = true;
        if (e.type === 'touchmove') e.preventDefault();
        const p = ptr(e);
        positionGhost(p.clientX, p.clientY);
        pieceEl.style.visibility = 'hidden';
    };

    const onEnd = (e) => {
        if (!active || !drag) return;
        if (e.type === 'touchend') e.preventDefault();
        const p = ptr(e);

        if (!hasMoved) {
            // Tap = rotation
            ship.orientation = ship.orientation === 'h' ? 'v' : 'h';
            renderShipyard();
            cleanupDrag();
            return;
        }

        const rect = getGridRect();
        const inGrid = p.clientX >= rect.left && p.clientX <= rect.right &&
            p.clientY >= rect.top && p.clientY <= rect.bottom;

        if (inGrid) {
            const { r, c } = snapToGrid(p.clientX - drag.grabX, p.clientY - drag.grabY, ship);
            const placed = tryPlace(r, c, ship, index);
            if (!placed) {
                pieceEl.style.opacity = '1';
                pieceEl.style.visibility = 'visible';
            }
        } else {
            pieceEl.style.opacity = '1';
            pieceEl.style.visibility = 'visible';
        }

        cleanupDrag();
    };

    function cleanupDrag() {
        if (drag?.ghost) drag.ghost.remove();
        drag = null;
        active = false;
        clearHighlight();
        // ← NOUVEAU : retirer les listeners globaux
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
    }

    pieceEl.addEventListener('mousedown', onStart);
    pieceEl.addEventListener('touchstart', onStart, { passive: false });
}

function positionGhost(cx, cy) {
    if (!drag) return;
    const rect = getGridRect();
    const onGrid = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;

    if (onGrid) {
        const { x, y, r, c } = snapToGrid(cx - drag.grabX, cy - drag.grabY, drag.ship);
        drag.ghost.style.left = x + 'px';
        drag.ghost.style.top = y + 'px';
        highlightCells(r, c, drag.ship, canPlace(r, c, drag.ship));
    } else {
        drag.ghost.style.left = (cx - drag.grabX) + 'px';
        drag.ghost.style.top = (cy - drag.grabY) + 'px';
        clearHighlight();
    }
}

function clearHighlight() {
    gridBateauxEl.querySelectorAll('.cell[data-highlighted]').forEach(cell => {
        cell.classList.remove('conflict');
        if (!cell.classList.contains('boat')) cell.style.backgroundColor = '';
        delete cell.dataset.highlighted;
    });
}

function highlightCells(r, c, ship, valid) {
    clearHighlight();
    let hasOverlap = false;
    for (let i = 0; i < ship.len; i++) {
        const cr = ship.orientation === 'v' ? r + i : r;
        const cc = ship.orientation === 'h' ? c + i : c;
        if (cr >= 0 && cr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE) {
            const cell = gridBateauxEl.querySelector(`.cell[data-r="${cr}"][data-c="${cc}"]`);
            if (cell) {
                if (myGrid[cr][cc] !== 0) {
                    cell.classList.add('conflict');
                    cell.dataset.highlighted = 'conflict';
                    hasOverlap = true;
                } else {
                    cell.style.backgroundColor = valid ? 'rgba(0,180,216,.3)' : 'rgba(239,71,111,.3)';
                    cell.dataset.highlighted = valid ? 'valid' : 'invalid';
                }
            }
        }
    }
    if (drag?.ghost) {
        drag.ghost.classList.toggle('invalid-ghost', !valid || hasOverlap);
    }
}

function canPlace(r, c, ship) {
    for (let i = 0; i < ship.len; i++) {
        const cr = ship.orientation === 'v' ? r + i : r;
        const cc = ship.orientation === 'h' ? c + i : c;
        if (cr < 0 || cr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) return false;
        if (myGrid[cr][cc] !== 0) return false;
    }
    return true;
}

function tryPlace(r, c, ship, index) {
    if (!canPlace(r, c, ship)) return false;
    for (let i = 0; i < ship.len; i++) {
        const cr = ship.orientation === 'v' ? r + i : r;
        const cc = ship.orientation === 'h' ? c + i : c;
        myGrid[cr][cc] = ship.id;
    }
    unplacedShips.splice(index, 1);
    renderShipyard();
    renderPlacementGrid();
    return true;
}

/** Ramasser un bateau déjà placé sur la grille */
function pickupShip(e) {
    if (gamePhase !== 'placement' || myReadyState) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const r = parseInt(cell.dataset.r);
    const c = parseInt(cell.dataset.c);
    const shipId = myGrid[r][c];
    if (shipId < 1 || shipId > 5) return;

    // Déterminer orientation
    let orientation = 'h';
    if (r + 1 < GRID_SIZE && myGrid[r + 1][c] === shipId) orientation = 'v';
    else if (r - 1 >= 0 && myGrid[r - 1][c] === shipId) orientation = 'v';

    // Retirer de la grille
    for (let rr = 0; rr < GRID_SIZE; rr++)
        for (let cc = 0; cc < GRID_SIZE; cc++)
            if (myGrid[rr][cc] === shipId) myGrid[rr][cc] = 0;

    const shipDef = SHIPS.find(s => s.id === shipId);
    unplacedShips.push({ ...shipDef, orientation });
    renderShipyard();
    renderPlacementGrid();
}

// ─────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────
function setupEventListeners() {
    readyActionBtn?.addEventListener('click', confirmReady);

    retryBtn?.addEventListener('click', async () => {
        retryBtn.disabled = true;
        retryBtn.textContent = '⏳ En attente de l\'adversaire…';
        await updateRoom(roomID, { [`rematch/${myUid}`]: true });
    });


    menuBtn?.addEventListener('click', async () => {
        if (roomID) await deleteRoom(roomID);
        window.location.href = 'index.html';
    });

    window.addEventListener('resize', computeCellSize);
    setupRules();
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function init() {
    await firebaseReady;

    const p = new URLSearchParams(window.location.search);
    const rawID = p.get('id');
    roomID = rawID ? `battleship_${rawID}` : null;
    myUid = auth?.currentUser?.uid;

    if (!roomID || !myUid) {
        window.location.href = 'index.html';
        return;
    }

    // Récupérer le nom du joueur
    const savedName = localStorage.getItem('battleship_playerName') || 'Moi';
    myNameEl.textContent = savedName.toUpperCase();

    if (waitingOverlay) waitingOverlay.style.display = 'flex';
    if (gameArea) gameArea.style.display = 'none';
    if (placementOverlay) placementOverlay.style.display = 'none';

    setupEventListeners();
    setupMultiplayer();
}

init();
