import { auth, firebaseReady } from "../../../js/config/firebase-config.js";
import { createRoom, joinRoom, listenToRoomChanges, updateRoom, deleteRoom } from "../../../js/firebaseWrk.js";
import { DrawingCanvas } from "./core/canvas.js";
import { generateWord } from "./core/wordGenerator.js";

// ═══════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════
const lobbyArea = document.getElementById('lobbyArea');
const lobbyTitle = document.getElementById('lobbyTitle');
const gameArea = document.getElementById('gameArea');
const waitingRoom = document.getElementById('waitingRoom');
const displayRoomID = document.getElementById('displayRoomID');
const playersList = document.getElementById('playersList');
const statusMsg = document.getElementById('statusMsg');
const roomInput = document.getElementById('roomInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const leaveBtn = document.getElementById('leaveBtn');
const leaderControls = document.getElementById('leaderControls');
const startGameBtn = document.getElementById('startGameBtn');

const roleBadge = document.getElementById('roleBadge');
const playersStatus = document.getElementById('playersStatus');
const timerDisplay = document.getElementById('timerDisplay');
const scoreVal = document.getElementById('scoreVal');
const roundInfo = document.getElementById('roundInfo');
const roundCurrentDisplay = document.getElementById('roundCurrentDisplay');
const gameCanvas = document.getElementById('gameCanvas');
const drawerTools = document.getElementById('drawerTools');
const eraserBtn = document.getElementById('eraserBtn');
const clearBtn = document.getElementById('clearBtn');
const colorSlots = document.querySelectorAll('.color-slot');
const nativeColorPicker = document.getElementById('nativeColorPicker');
const pipetteBtn = document.getElementById('pipetteBtn');
const sizeBtns = document.querySelectorAll('.size-btn');

// Standard mode UI
const guesserUI = document.getElementById('guesserUI');
const wordPlaceholder = document.getElementById('wordPlaceholder');
const guessInput = document.getElementById('guessInput');
const attemptsLeft = document.getElementById('attemptsLeft');
const submitGuessBtn = document.getElementById('submitGuessBtn');
const drawerUI = document.getElementById('drawerUI');
const wordToDraw = document.getElementById('wordToDraw');
const finishDrawingBtn = document.getElementById('finishDrawingBtn');

// Chain mode UI
const chainDrawerUI = document.getElementById('chainDrawerUI');
const chainWordToDraw = document.getElementById('chainWordToDraw');
const chainFinishBtn = document.getElementById('chainFinishBtn');
const chainGuesserUI = document.getElementById('chainGuesserUI');
const chainGuessInput = document.getElementById('chainGuessInput');
const chainAttemptsLeft = document.getElementById('chainAttemptsLeft');
const submitChainGuessBtn = document.getElementById('submitChainGuessBtn');
const chainResultsOverlay = document.getElementById('chainResultsOverlay');
const chainResultsGallery = document.getElementById('chainResultsGallery');
const chainScoreSummary = document.getElementById('chainScoreSummary');
const chainNextRoundBtn = document.getElementById('chainNextRoundBtn');
const chainRestartBtn = document.getElementById('chainRestartBtn');
const chainSwitchModeBtn = document.getElementById('chainSwitchModeBtn');
const chainQuitBtn = document.getElementById('chainQuitBtn');
const carouselPrev = document.getElementById('carouselPrev');
const carouselNext = document.getElementById('carouselNext');
const carouselDots = document.getElementById('carouselDots');
const toastContainer = document.getElementById('toastContainer');

// Overlays
const wordSelectionOverlay = document.getElementById('wordSelectionOverlay');
const wordSelectionTitle = document.getElementById('wordSelectionTitle');
const customWordInput = document.getElementById('customWordInput');
const generateWordBtn = document.getElementById('generateWordBtn');
const startRoundBtn = document.getElementById('startRoundBtn');
const roundResultOverlay = document.getElementById('roundResultOverlay');
const resultTitle = document.getElementById('resultTitle');
const resultMsg = document.getElementById('resultMsg');
const pointsEarned = document.getElementById('pointsEarned');
const roundCountdown = document.getElementById('roundCountdown');
const pauseBtn = document.getElementById('pauseBtn');
const pauseOverlay = document.getElementById('pauseOverlay');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const menuBtn = document.getElementById('menuBtn');
const gameFinishedOverlay = document.getElementById('gameFinishedOverlay');
const finalGameScores = document.getElementById('finalGameScores');
const playAgainBtn = document.getElementById('playAgainBtn');
const switchModeBtn = document.getElementById('switchModeBtn');
const quitEndBtn = document.getElementById('quitEndBtn');

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
const urlParams = new URLSearchParams(window.location.search);
const GAME_MODE = urlParams.get('mode') || 'standard'; // 'standard' or 'chain'

let currentRoomID = null;
let roomData = null;
let myUID = null;
let canvasInstance = null;
let isLeader = false;
let isDrawer = false;
let isDisconnecting = false;
let currentSize = 5;
let currentColor = '#111111';
let phaseFinished = false;
let currentCarouselIndex = 0;
let shownChainNotifications = new Set();

let playerName = localStorage.getItem('drawguess_name');
if (!playerName) {
    playerName = prompt("Veuillez entrer votre prénom :") || "Anonyme";
    localStorage.setItem('drawguess_name', playerName);
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
async function init() {
    await firebaseReady;

    // Set lobby title based on mode
    if (GAME_MODE === 'chain') {
        lobbyTitle.textContent = 'Dessin en Chaîne';
    } else {
        lobbyTitle.textContent = 'Dessine et Devine';
    }
    document.title = `Draw and Guess — ${lobbyTitle.textContent}`;

    const checkAuth = setInterval(() => {
        if (auth && auth.currentUser) {
            myUID = auth.currentUser.uid;
            clearInterval(checkAuth);
            statusMsg.innerText = "Connecté. Créez ou rejoignez une salle.";
            createRoomBtn.disabled = false;
            joinRoomBtn.disabled = false;

            const roomCode = urlParams.get('room');
            if (roomCode) {
                roomInput.value = roomCode;
                handleJoinRoom();
            }
        }
    }, 200);

    canvasInstance = new DrawingCanvas('gameCanvas', {
        readOnly: true,
        onPathComplete: (path) => {
            if (GAME_MODE === 'standard') {
                if (isDrawer && currentRoomID && roomData && roomData.state === 'playing') {
                    updateRoom(currentRoomID, { drawingHistory: canvasInstance.getHistory() });
                }
            }
        }
    });

    setupToolbar();
    setupCommonEvents();

    if (GAME_MODE === 'standard') {
        setupStandardEvents();
    } else {
        setupChainEvents();
    }
}

// ═══════════════════════════════════════════════════════════════
// TOOLBAR (shared)
// ═══════════════════════════════════════════════════════════════
function setupToolbar() {
    let colorHistoryList = ['#111111', '#e63946', '#2196f3', '#4caf50', '#ff9800', '#9c27b0'];

    function pushNewColor(hex) {
        colorHistoryList = colorHistoryList.filter(c => c !== hex);
        colorHistoryList.unshift(hex);
        if (colorHistoryList.length > 6) colorHistoryList.pop();

        colorSlots.forEach((btn, idx) => {
            if (colorHistoryList[idx]) {
                btn.setAttribute('data-color', colorHistoryList[idx]);
                btn.querySelector('div').style.background = colorHistoryList[idx];
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
            btn.classList.remove('active');
        });

        currentColor = hex;
        colorSlots[0].classList.add('active');
        if (eraserBtn) eraserBtn.classList.remove('active');
        canvasInstance.setBrush(currentColor, currentSize);
    }

    colorSlots.forEach(btn => {
        btn.addEventListener('click', () => pushNewColor(btn.getAttribute('data-color')));
    });

    if (nativeColorPicker) {
        nativeColorPicker.addEventListener('change', (e) => pushNewColor(e.target.value));
    }

    if (pipetteBtn) {
        pipetteBtn.addEventListener('click', async () => {
            if (!window.EyeDropper) { alert("Votre navigateur ne supporte pas cet outil."); return; }
            try {
                const result = await new EyeDropper().open();
                pushNewColor(result.sRGBHex);
            } catch (err) { console.log("Pipette annulée"); }
        });
    }

    sizeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sizeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSize = parseInt(btn.getAttribute('data-size'));
            if (!eraserBtn.classList.contains('active')) {
                canvasInstance.setBrush(currentColor, currentSize);
            } else {
                canvasInstance.setBrush('#ffffff', currentSize * 4);
            }
        });
    });

    eraserBtn.addEventListener('click', () => {
        colorSlots.forEach(b => b.classList.remove('active'));
        eraserBtn.classList.add('active');
        canvasInstance.setBrush('#ffffff', currentSize * 4);
    });

    clearBtn.addEventListener('click', () => {
        if (confirm("Tout effacer ?")) {
            canvasInstance.clear();
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// COMMON EVENTS (lobby, pause, word input restriction)
// ═══════════════════════════════════════════════════════════════
function setupCommonEvents() {
    createRoomBtn.addEventListener('click', handleCreateRoom);
    joinRoomBtn.addEventListener('click', handleJoinRoom);
    leaveBtn.addEventListener('click', handleLeaveRoom);

    pauseBtn.addEventListener('click', () => pauseOverlay.style.display = 'flex');
    resumeBtn.addEventListener('click', () => pauseOverlay.style.display = 'none');
    menuBtn.addEventListener('click', handleLeaveRoom);

    // Restart (leader only)
    restartBtn.addEventListener('click', () => {
        if (roomData && roomData.leaderId === myUID) {
            const resetPlayers = Object.fromEntries(
                Object.entries(roomData.players).map(([id, p]) => [id, { ...p, score: 0, ready: false }])
            );
            const updates = {
                players: resetPlayers,
                roundCount: 0,
                winnerId: null,
                word: "",
                drawingHistory: [],
                guesses: {},
                phase: 0,
                cards: {},
                timerEnd: null
            };

            if (GAME_MODE === 'standard') {
                updates.state = 'playing';
                updates.attempts = 3;
                updates.drawnThisCycle = [];
            } else {
                updates.state = 'setup';
            }

            updateRoom(currentRoomID, updates);
            pauseOverlay.style.display = 'none';
        } else {
            alert("Seul l'hôte peut recommencer la partie !");
        }
    });

    // Word input restrictions
    const restrictInput = (e) => {
        const forbidden = /[^a-zA-ZÀ-ÿ\-\'\,\s]/g;
        if (forbidden.test(e.target.value)) {
            e.target.value = e.target.value.replace(forbidden, '');
        }
    };
    if (customWordInput) customWordInput.addEventListener('input', restrictInput);
    if (guessInput) guessInput.addEventListener('input', restrictInput);
    if (chainGuessInput) chainGuessInput.addEventListener('input', restrictInput);

    // Random word generation
    if (generateWordBtn) {
        generateWordBtn.addEventListener('click', async () => {
            generateWordBtn.disabled = true;
            generateWordBtn.textContent = '...';
            const word = await generateWord();
            customWordInput.value = word;
            customWordInput.focus();
            generateWordBtn.disabled = false;
            generateWordBtn.textContent = 'Surprise !';
        });
    }
}

function showToast(msg) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ═══════════════════════════════════════════════════════════════
// ROOM MANAGEMENT (shared)
// ═══════════════════════════════════════════════════════════════
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoomPrefix() {
    return 'draw-guess_room_';
}

async function handleCreateRoom() {
    if (!myUID) return;
    statusMsg.innerText = "Création de la salle...";
    const code = generateRoomCode();
    currentRoomID = getRoomPrefix() + code;

    const initialData = {
        roomID: code,
        mode: GAME_MODE,
        leaderId: myUID,
        state: 'waiting',
        players: {
            [myUID]: { uid: myUID, name: playerName, score: 0, ready: false }
        },
        roundCount: 0
    };

    if (GAME_MODE === 'standard') {
        initialData.drawerId = myUID;
        initialData.word = "";
        initialData.attempts = 3;
        initialData.drawingHistory = [];
        initialData.winnerId = null;
        initialData.drawnThisCycle = [];
        initialData.guesses = {};
    } else {
        initialData.phase = 0;
        initialData.cards = {};
        initialData.timerEnd = null;
    }

    const success = await createRoom(currentRoomID, initialData);
    if (success) {
        isLeader = true;
        history.pushState(null, '', `?mode=${GAME_MODE}&room=${code}`);
        enterWaitingRoom(code);
    } else {
        statusMsg.innerText = "Erreur lors de la création de la salle.";
    }
}

async function handleJoinRoom() {
    if (!myUID) return;
    const code = roomInput.value.trim().toUpperCase();
    if (code.length === 0) return;

    statusMsg.innerText = "Connexion...";
    currentRoomID = getRoomPrefix() + code;

    const success = await joinRoom(currentRoomID, { uid: myUID, name: playerName, score: 0, ready: false });
    if (success) {
        isLeader = false;
        history.pushState(null, '', `?mode=${GAME_MODE}&room=${code}`);
        enterWaitingRoom(code);
    } else {
        statusMsg.innerText = "Salle introuvable ou fermée.";
        history.pushState(null, '', window.location.pathname + `?mode=${GAME_MODE}`);
    }
}

async function handleLeaveRoom() {
    isDisconnecting = true;
    if (currentRoomID) {
        if (roomData && roomData.leaderId === myUID) {
            await deleteRoom(currentRoomID);
        } else {
            const updates = {};
            updates[`players/${myUID}`] = null;
            await updateRoom(currentRoomID, updates);
        }
    }
    window.location.href = window.location.pathname + `?mode=${GAME_MODE}`;
}

function enterWaitingRoom(code) {
    lobbyArea.style.display = 'none';
    waitingRoom.style.display = 'flex';
    displayRoomID.innerText = code;

    // Show leader controls
    if (isLeader && leaderControls) {
        leaderControls.style.display = 'block';
    }

    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            if (roomData && roomData.leaderId === myUID) {
                if (GAME_MODE === 'standard') {
                    updateRoom(currentRoomID, { state: 'playing', word: "" });
                } else {
                    updateRoom(currentRoomID, { state: 'setup' });
                }
            }
        });
    }

    listenToRoomChanges(currentRoomID, (data) => {
        if (isDisconnecting) return;

        if (data && data.redirectTo && data.mode !== GAME_MODE) {
            isDisconnecting = true;
            window.location.href = data.redirectTo;
            return;
        }

        if (!data) {
            isDisconnecting = true;
            alert("La salle a été fermée.");
            window.location.href = window.location.pathname + `?mode=${GAME_MODE}`;
            return;
        }
        roomData = data;

        if (roomData.state !== 'waiting' && roomData.state !== 'setup') {
            const playerIds = Object.keys(roomData.players || {});
            if (playerIds.length < 2) {
                isDisconnecting = true;
                alert("Un joueur s'est déconnecté. La partie est annulée.");
                handleLeaveRoom();
                return;
            }
        }

        processRoomState();
    });
}

// ═══════════════════════════════════════════════════════════════
// STATE ROUTER
// ═══════════════════════════════════════════════════════════════
function processRoomState() {
    updatePlayersListWaiting();

    if (roomData.state === 'waiting') {
        renderWaiting();
    } else if (GAME_MODE === 'standard') {
        processStandardState();
    } else {
        processChainState();
    }
}

function renderWaiting() {
    const playerIds = Object.keys(roomData.players);
    if (roomData.leaderId === myUID && leaderControls) {
        leaderControls.style.display = 'block';
        if (startGameBtn) {
            startGameBtn.disabled = playerIds.length < 2;
            startGameBtn.textContent = playerIds.length < 2 ? 'En attente de joueurs...' : 'Lancer la partie';
        }
    }
}

function updatePlayersListWaiting() {
    if (!roomData || !roomData.players) return;
    playersList.innerHTML = '';
    Object.values(roomData.players).forEach(p => {
        const el = document.createElement('div');
        el.className = 'player-card';
        el.innerHTML = `<strong>${p.name}</strong> ${p.uid === roomData.leaderId ? '👑' : ''}`;
        playersList.appendChild(el);
    });
}

// ═══════════════════════════════════════════════════════════════
// MODE STANDARD — "Dessine et Devine"
// ═══════════════════════════════════════════════════════════════
function setupStandardEvents() {
    startRoundBtn.addEventListener('click', handleStdStartRound);
    submitGuessBtn.addEventListener('click', handleStdGuess);
    guessInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleStdGuess(); });
    finishDrawingBtn.addEventListener('click', () => {
        if (confirm("Passer votre tour ? Le mot ne sera pas deviné.")) {
            updateRoom(currentRoomID, { state: 'round_end', winnerId: 'none' });
        }
    });

    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', () => {
            if (roomData && roomData.leaderId === myUID) {
                const resetPlayers = Object.fromEntries(
                    Object.entries(roomData.players).map(([id, p]) => [id, { ...p, score: 0 }])
                );
                updateRoom(currentRoomID, {
                    state: 'playing', word: "", drawingHistory: [], attempts: 3,
                    winnerId: null, roundCount: 0, drawnThisCycle: [], guesses: {}, players: resetPlayers
                });
                if (gameFinishedOverlay) gameFinishedOverlay.style.display = 'none';
            } else { alert("En attente de l'hôte..."); }
        });
    }

    if (switchModeBtn) {
        switchModeBtn.addEventListener('click', () => {
            if (roomData && roomData.leaderId === myUID) {
                const code = roomData.roomID;
                const updates = {
                    state: 'setup',
                    mode: 'chain',
                    phase: 0,
                    cards: {},
                    timerEnd: null,
                    word: "",
                    drawingHistory: [],
                    winnerId: null,
                    guesses: {},
                    redirectTo: `game.html?mode=chain&room=${code}`
                };
                updateRoom(currentRoomID, updates);
            } else { alert("En attente de l'hôte..."); }
        });
    }

    if (quitEndBtn) quitEndBtn.addEventListener('click', handleLeaveRoom);
}

function processStandardState() {
    if (roomData.state === 'playing') {
        waitingRoom.style.display = 'none';
        gameArea.style.display = 'flex';
        window.dispatchEvent(new Event('resize'));
        renderStdPlaying();
    } else if (roomData.state === 'round_end') {
        renderStdRoundEnd();
    } else if (roomData.state === 'finished') {
        renderStdFinished();
    }
    updateStdScoreBoard();
}

function updateStdScoreBoard() {
    if (!roomData || !roomData.players || !myUID) return;
    const me = roomData.players[myUID];
    if (me) scoreVal.innerText = me.score;

    const others = Object.values(roomData.players).filter(p => p.uid !== myUID);
    if (others.length > 0) {
        const scoresStr = others.map(p => `${p.name}: ${p.score}`).join(' | ');
        playersStatus.innerText = scoresStr;
    }
    if (roundCurrentDisplay) {
        roundCurrentDisplay.innerText = Math.min((roomData.roundCount || 0) + 1, 8);
    }
}

function renderStdPlaying() {
    isDrawer = (roomData.drawerId === myUID);
    roundResultOverlay.style.display = 'none';
    if (gameFinishedOverlay) gameFinishedOverlay.style.display = 'none';
    // Hide chain UIs
    chainDrawerUI.style.display = 'none';
    chainGuesserUI.style.display = 'none';
    timerDisplay.style.display = 'none';

    roleBadge.className = 'badge';
    roleBadge.classList.add(isDrawer ? 'badge-popular' : 'badge-new');
    roleBadge.innerText = isDrawer ? 'Dessinateur' : 'Devineur';

    if (isDrawer) {
        guesserUI.style.display = 'none';
        drawerTools.style.display = 'flex';

        if (!roomData.word || roomData.word === "") {
            drawerUI.style.display = 'none';
            wordSelectionOverlay.style.display = 'flex';
            wordSelectionTitle.textContent = "C'est votre tour de dessiner !";
            canvasInstance.setReadOnly(true);
            canvasInstance.clear();
        } else {
            wordSelectionOverlay.style.display = 'none';
            drawerUI.style.display = 'flex';
            wordToDraw.innerText = roomData.word;
            canvasInstance.setReadOnly(false);
        }
    } else {
        drawerTools.style.display = 'none';
        drawerUI.style.display = 'none';
        wordSelectionOverlay.style.display = 'none';
        canvasInstance.setReadOnly(true);

        if (!roomData.word || roomData.word === "") {
            guesserUI.style.display = 'none';
        } else {
            guesserUI.style.display = 'flex';
            const placeHolder = roomData.word.split('').map(c => {
                if (c === ' ') return '&nbsp;&nbsp;';
                if (c === '-') return '-';
                if (c === "'") return "'";
                if (c === ",") return ",";
                return '_';
            }).join(' ');
            wordPlaceholder.innerHTML = placeHolder;

            // Per-player attempts
            const myGuessData = roomData.guesses?.[myUID];
            const myAttempts = myGuessData?.attempts ?? 3;
            attemptsLeft.innerText = myAttempts;

            if (myAttempts <= 0 || myGuessData?.found) {
                submitGuessBtn.disabled = true;
                guessInput.disabled = true;
            } else {
                submitGuessBtn.disabled = false;
                guessInput.disabled = false;
            }
        }
    }

    // Guesser redraws canvas from Firebase
    if (!isDrawer) {
        canvasInstance.redraw(roomData.drawingHistory || []);
    }
}

function handleStdStartRound() {
    const word = customWordInput.value.trim();
    if (!word) { alert("Veuillez entrer un mot !"); return; }
    if (!/^[a-zA-ZÀ-ÿ\-\'\,\s]+$/.test(word)) {
        alert("Seules les lettres, espaces, virgules, tirets et apostrophes sont autorisés.");
        return;
    }

    // Initialize per-player guesses
    const guesses = {};
    Object.keys(roomData.players).forEach(uid => {
        if (uid !== myUID) {
            guesses[uid] = { attempts: 3, found: false };
        }
    });

    updateRoom(currentRoomID, { word: word, guesses: guesses });
    customWordInput.value = "";
}

function handleStdGuess() {
    if (isDrawer) return;
    const myGuessData = roomData.guesses?.[myUID];
    if (!myGuessData || myGuessData.attempts <= 0 || myGuessData.found) return;

    const guess = guessInput.value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
    const correctWord = roomData.word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");

    if (!guess) return;

    if (guess === correctWord) {
        const points = myGuessData.attempts; // 3, 2, or 1
        const newPlayers = structuredClone(roomData.players);
        newPlayers[myUID].score += points;

        updateRoom(currentRoomID, {
            state: 'round_end',
            winnerId: myUID,
            players: newPlayers
        });
    } else {
        const newAttempts = myGuessData.attempts - 1;
        const updates = {};
        updates[`guesses/${myUID}/attempts`] = newAttempts;

        if (newAttempts <= 0) {
            // Check if ALL guessers are out of attempts
            const allExhausted = Object.entries(roomData.guesses).every(([uid, g]) => {
                if (uid === myUID) return true; // we just ran out
                return g.attempts <= 0 || g.found;
            });

            if (allExhausted) {
                updates['state'] = 'round_end';
                updates['winnerId'] = 'none';
            }
        }

        updateRoom(currentRoomID, updates);
        guessInput.value = '';
        guessInput.style.animation = 'shake 0.5s';
        setTimeout(() => guessInput.style.animation = '', 500);
    }
}

function renderStdRoundEnd() {
    canvasInstance.setReadOnly(true);
    roundResultOverlay.style.display = 'flex';

    const winnerPlayer = roomData.winnerId !== 'none' ? roomData.players?.[roomData.winnerId] : null;

    if (roomData.winnerId === myUID) {
        resultTitle.innerText = "Victoire !";
        resultTitle.style.color = "var(--green)";
        resultMsg.innerText = `Vous avez deviné le mot : ${roomData.word}`;
        pointsEarned.innerText = `+${roomData.guesses?.[myUID]?.attempts || 0} pts`;
    } else if (roomData.winnerId === 'none') {
        resultTitle.innerText = "Personne n'a trouvé !";
        resultTitle.style.color = "var(--red)";
        resultMsg.innerText = `Le mot était : ${roomData.word}`;
        pointsEarned.innerText = "0 pts";
    } else if (roomData.drawerId === myUID) {
        resultTitle.innerText = "C'est trouvé !";
        resultTitle.style.color = "var(--gold)";
        resultMsg.innerText = `${winnerPlayer?.name || '?'} a deviné votre mot "${roomData.word}"`;
        pointsEarned.innerText = "";
    } else {
        resultTitle.innerText = `${winnerPlayer?.name || '?'} a trouvé !`;
        resultTitle.style.color = "var(--gold)";
        resultMsg.innerText = `Le mot était : ${roomData.word}`;
        pointsEarned.innerText = "0 pts";
    }

    if (roundCountdown) roundCountdown.innerText = "Le prochain tour commence dans 3 secondes…";

    if (window.countdownInterval) clearInterval(window.countdownInterval);
    let time = 3;
    window.countdownInterval = setInterval(() => {
        time--;
        if (roundCountdown && time > 0) {
            roundCountdown.innerText = `Le prochain tour commence dans ${time} seconde${time > 1 ? 's' : ''}…`;
        } else { clearInterval(window.countdownInterval); }
    }, 1000);

    // Leader controls transitions
    if (roomData.leaderId === myUID && !window.roundTransitioning) {
        window.roundTransitioning = true;
        setTimeout(() => {
            const nextRound = (roomData.roundCount || 0) + 1;
            if (nextRound >= 8) {
                updateRoom(currentRoomID, { state: 'finished', roundCount: nextRound })
                    .then(() => { window.roundTransitioning = false; });
            } else {
                // Pick next drawer randomly from those who haven't drawn this cycle
                const playerIds = Object.keys(roomData.players);
                let drawnThisCycle = roomData.drawnThisCycle || [];
                drawnThisCycle.push(roomData.drawerId); // current drawer is done
                let available = playerIds.filter(id => !drawnThisCycle.includes(id));
                if (available.length === 0) {
                    drawnThisCycle = []; // reset cycle
                    available = playerIds;
                }
                const nextDrawer = available[Math.floor(Math.random() * available.length)];

                updateRoom(currentRoomID, {
                    state: 'playing', drawerId: nextDrawer, word: "", drawingHistory: [],
                    attempts: 3, winnerId: null, roundCount: nextRound,
                    drawnThisCycle: drawnThisCycle, guesses: {}
                }).then(() => { window.roundTransitioning = false; });
            }
        }, 3000);
    }

    customWordInput.value = "";
    guessInput.value = "";
}

function renderStdFinished() {
    canvasInstance.setReadOnly(true);
    roundResultOverlay.style.display = 'none';
    pauseOverlay.style.display = 'none';
    if (gameFinishedOverlay) gameFinishedOverlay.style.display = 'flex';

    if (!roomData || !roomData.players) return;
    const sorted = Object.values(roomData.players).sort((a, b) => b.score - a.score);
    let html = '';
    sorted.forEach((p, idx) => {
        const medal = idx === 0 ? '🏆' : (idx === 1 ? '🥈' : '🥉');
        html += `<p style="margin:8px 0; font-size:1.2rem;">${medal} <strong>${p.name}</strong> : ${p.score} pts</p>`;
    });
    if (finalGameScores) finalGameScores.innerHTML = html;

    // Update switchModeBtn text
    if (switchModeBtn) switchModeBtn.textContent = 'Passer en Dessin en Chaîne';
}

// ═══════════════════════════════════════════════════════════════
// MODE CHAÎNE — "Dessin en Chaîne"
// ═══════════════════════════════════════════════════════════════
function setupChainEvents() {
    startRoundBtn.addEventListener('click', handleChainSubmitWord);
    submitGuessBtn.addEventListener('click', handleChainSubmitGuess);
    guessInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleChainSubmitGuess(); });

    if (chainNextRoundBtn) {
        chainNextRoundBtn.addEventListener('click', () => {
            if (roomData && roomData.leaderId === myUID) {
                const resetPlayers = Object.fromEntries(
                    Object.entries(roomData.players).map(([id, p]) => [id, { ...p, ready: false }])
                );
                updateRoom(currentRoomID, {
                    state: 'setup', phase: 0, cards: {}, timerEnd: null,
                    roundCount: (roomData.roundCount || 0) + 1, players: resetPlayers
                });
                chainResultsOverlay.style.display = 'none';
            } else { alert("En attente de l'hôte..."); }
        });
    }

    if (chainRestartBtn) {
        chainRestartBtn.addEventListener('click', () => {
            if (roomData && roomData.leaderId === myUID) {
                const resetPlayers = Object.fromEntries(
                    Object.entries(roomData.players).map(([id, p]) => [id, { ...p, score: 0, ready: false }])
                );
                updateRoom(currentRoomID, {
                    state: 'setup', phase: 0, cards: {}, timerEnd: null,
                    roundCount: 0, players: resetPlayers
                });
                chainResultsOverlay.style.display = 'none';
            } else { alert("En attente de l'hôte..."); }
        });
    }

    if (chainSwitchModeBtn) {
        chainSwitchModeBtn.addEventListener('click', () => {
            if (roomData && roomData.leaderId === myUID) {
                const code = roomData.roomID;
                const updates = {
                    state: 'playing',
                    mode: 'standard',
                    word: "",
                    drawingHistory: [],
                    attempts: 3,
                    winnerId: null,
                    roundCount: 0,
                    drawnThisCycle: [],
                    guesses: {},
                    redirectTo: `game.html?mode=standard&room=${code}`
                };
                updateRoom(currentRoomID, updates);
            } else { alert("En attente de l'hôte..."); }
        });
    }

    if (chainQuitBtn) chainQuitBtn.addEventListener('click', handleLeaveRoom);
}

function processChainState() {
    if (roomData.state === 'setup') {
        processChainLeaderRouting(); // Leader detects all-ready and transitions to playing
        renderChainSetup();
        shownChainNotifications.clear(); // Clear for new round
    } else if (roomData.state === 'playing') {
        processChainLeaderRouting();
        renderChainPlaying();
        updateChainFoundNotifications();
    } else if (roomData.state === 'finished') {
        renderChainFinished();
    }

    // Update score
    if (roomData.players?.[myUID]) {
        scoreVal.innerText = roomData.players[myUID].score;
    }
}

function updateChainFoundNotifications() {
    if (!roomData.guesses) return;
    Object.entries(roomData.guesses).forEach(([uid, g]) => {
        if (g.found && !shownChainNotifications.has(uid)) {
            const name = roomData.players[uid]?.name || "Un joueur";
            showToast(`✨ ${name} a trouvé son mot !`);
            shownChainNotifications.add(uid);
        }
    });
}

function renderChainSetup() {
    lobbyArea.style.display = 'none';
    waitingRoom.style.display = 'none';
    gameArea.style.display = 'none';
    chainResultsOverlay.style.display = 'none';

    if (!roomData.players[myUID].ready) {
        wordSelectionOverlay.style.display = 'flex';
        wordSelectionTitle.textContent = "Votre mot secret";
        customWordInput.focus();
    } else {
        wordSelectionOverlay.style.display = 'none';
        // Show a waiting state using the round result overlay
        roundResultOverlay.style.display = 'flex';
        resultTitle.innerText = "En attente...";
        resultTitle.style.color = "var(--neon-guess)";
        const readyCount = Object.values(roomData.players).filter(p => p.ready).length;
        const totalCount = Object.keys(roomData.players).length;
        resultMsg.innerText = `${readyCount}/${totalCount} joueurs prêts`;
        pointsEarned.innerText = "";
        roundCountdown.innerText = "";
    }
}

function handleChainSubmitWord() {
    const word = customWordInput.value.trim();
    if (!word) { alert("Veuillez entrer un mot !"); return; }
    if (!/^[a-zA-ZÀ-ÿ\-\'\,\s]+$/.test(word)) {
        alert("Seules les lettres, espaces, virgules, tirets et apostrophes sont autorisés.");
        return;
    }

    const updates = {};
    updates[`cards/${myUID}`] = {
        ownerId: myUID,
        initialWord: word,
        steps: [{ type: 'word', content: word, authorId: myUID }],
    };
    updates[`players/${myUID}/ready`] = true;

    updateRoom(currentRoomID, updates);
    wordSelectionOverlay.style.display = 'none';
    customWordInput.value = "";
}

function processChainLeaderRouting() {
    if (!roomData || roomData.leaderId !== myUID) return;

    const playersArr = Object.values(roomData.players);
    const allReady = playersArr.every(p => p.ready === true);

    if (allReady && !window.transitioningPhase) {
        window.transitioningPhase = true;
        const N = playersArr.length;
        const updates = {};

        playersArr.forEach(p => {
            updates[`players/${p.uid}/ready`] = false;
        });

        if (roomData.state === 'setup') {
            updates['state'] = 'playing';
            updates['phase'] = 1;
            updates['timerEnd'] = Date.now() + 45000;
            // Initialize guesses for chain mode final phase
            updates['guesses'] = {};
        } else if (roomData.state === 'playing') {
            const nextPhase = roomData.phase + 1;
            if (nextPhase > N) {
                // All phases done (including guessing), game finished
                updates['state'] = 'finished';
            } else if (nextPhase === N) {
                // Last phase = guessing (no timer)
                updates['phase'] = nextPhase;
                updates['timerEnd'] = null;
                // Initialize per-player guesses for scoring
                const guesses = {};
                playersArr.forEach(p => {
                    guesses[p.uid] = { attempts: 3, found: false };
                });
                updates['guesses'] = guesses;
            } else {
                // Drawing phase with 45s timer
                updates['phase'] = nextPhase;
                updates['timerEnd'] = Date.now() + 45000;
            }
            updates['rotater'] = Math.random();
        }

        updateRoom(currentRoomID, updates).then(() => {
            window.transitioningPhase = false;
        });
    }
}

function renderChainPlaying() {
    wordSelectionOverlay.style.display = 'none';
    roundResultOverlay.style.display = 'none';
    if (gameFinishedOverlay) gameFinishedOverlay.style.display = 'none';
    chainResultsOverlay.style.display = 'none';
    waitingRoom.style.display = 'none';
    gameArea.style.display = 'flex';
    guesserUI.style.display = 'none';
    drawerUI.style.display = 'none';
    chainDrawerUI.style.display = 'none';
    chainGuesserUI.style.display = 'none';
    window.dispatchEvent(new Event('resize'));

    const playerIds = Object.keys(roomData.players).sort();
    const N = playerIds.length;
    const phase = roomData.phase;
    const myIndex = playerIds.indexOf(myUID);

    const cardOwnerIndex = ((myIndex - (phase - 1)) % N + N) % N;
    const cardOwnerId = playerIds[cardOwnerIndex];
    const card = roomData.cards?.[cardOwnerId];

    if (!card) return;

    // HUD info
    roleBadge.className = 'badge';
    const isLastPhase = phase >= N;
    if (roundInfo) {
        roundInfo.innerHTML = `Manche <span id="roundCurrentDisplay">${(roomData.roundCount || 0) + 1}</span> — Changement ${phase}/${N}`;
    }

    // Phase reset
    if (window.currentPhase !== phase) {
        window.currentPhase = phase;
        canvasInstance.clear();
        phaseFinished = false;
        finishDrawingBtn.disabled = false;
        finishDrawingBtn.textContent = 'Terminer mon dessin';
        submitGuessBtn.disabled = false;
        guessInput.value = '';
        guessInput.disabled = false;
    }

    if (roomData.players[myUID].ready) {
        phaseFinished = true;
    }

    // Timer
    if (roomData.timerEnd && !isLastPhase) {
        timerDisplay.style.display = 'block';

        // Start a live tick interval if not already running for this phase
        if (!window.chainTimerInterval || window.chainTimerPhase !== phase) {
            if (window.chainTimerInterval) clearInterval(window.chainTimerInterval);
            window.chainTimerPhase = phase;
            window.chainTimerInterval = setInterval(() => {
                if (!roomData || !roomData.timerEnd) return;
                const rem = Math.max(0, Math.ceil((roomData.timerEnd - Date.now()) / 1000));
                timerDisplay.textContent = `${rem}s`;
                timerDisplay.classList.toggle('urgent', rem <= 10);
                if (rem <= 0 && !phaseFinished) {
                    clearInterval(window.chainTimerInterval);
                    handleChainFinishPhase();
                }
            }, 500);
        }

        const remaining = Math.max(0, Math.ceil((roomData.timerEnd - Date.now()) / 1000));
        timerDisplay.textContent = `${remaining}s`;
        timerDisplay.classList.toggle('urgent', remaining <= 10);

        if (remaining <= 0 && !phaseFinished) {
            handleChainFinishPhase();
        }
    } else {
        timerDisplay.style.display = isLastPhase ? 'none' : 'block';
        if (window.chainTimerInterval) {
            clearInterval(window.chainTimerInterval);
            window.chainTimerInterval = null;
        }
    }

    // Decide draw vs guess based on PHASE NUMBER, not card step type
    if (isLastPhase) {
        // Last phase = everyone guesses
        renderChainGuessPhase(card);
    } else {
        // Drawing phase: find the word to draw (last 'word' step in this card)
        const lastWordStep = [...card.steps].reverse().find(s => s.type === 'word');
        if (lastWordStep) {
            renderChainDrawPhase(card, lastWordStep);
        }
    }
}

function renderChainDrawPhase(card, lastStep) {
    guesserUI.style.display = 'none';
    chainGuesserUI.style.display = 'none';
    chainDrawerUI.style.display = 'none';
    drawerUI.style.display = 'flex';
    drawerTools.style.display = phaseFinished ? 'none' : 'flex';

    roleBadge.className = 'badge badge-popular';
    roleBadge.innerText = phaseFinished ? 'En attente...' : 'Dessinateur';

    wordToDraw.textContent = lastStep.content;
    // Hide the "Passer" button and show "Terminer" behavior
    finishDrawingBtn.textContent = phaseFinished ? 'Terminé !' : 'Terminer mon dessin';
    finishDrawingBtn.disabled = phaseFinished;
    finishDrawingBtn.onclick = phaseFinished ? null : () => handleChainFinishPhase();

    if (!phaseFinished) {
        canvasInstance.setReadOnly(false);
        // Find most recent drawing in the card to continue it
        const lastDrawingStep = [...card.steps].reverse().find(s => s.type === 'drawing');
        if (lastDrawingStep && lastDrawingStep.content) {
            canvasInstance.redraw(lastDrawingStep.content);
        } else {
            canvasInstance.clear();
        }
    } else {
        canvasInstance.setReadOnly(true);
    }
}

function renderChainGuessPhase(card) {
    drawerUI.style.display = 'none';
    chainDrawerUI.style.display = 'none';
    chainGuesserUI.style.display = 'none';
    drawerTools.style.display = 'none';
    guesserUI.style.display = 'flex';

    roleBadge.className = 'badge badge-new';
    roleBadge.innerText = phaseFinished ? 'En attente...' : 'Devineur';

    // Show word placeholder from original word
    const originalWord = card.initialWord;
    const placeHolder = originalWord.split('').map(c => {
        if (c === ' ') return '&nbsp;&nbsp;';
        if (c === '-') return '-';
        if (c === "'") return "'";
        if (c === ",") return ",";
        return '_';
    }).join(' ');
    wordPlaceholder.innerHTML = placeHolder;

    // Per-player attempts
    const myChainGuess = roomData.guesses?.[myUID];
    const myAttempts = myChainGuess?.attempts ?? 3;
    attemptsLeft.innerText = myAttempts;

    if (myAttempts <= 0 || myChainGuess?.found || phaseFinished) {
        submitGuessBtn.disabled = true;
        guessInput.disabled = true;
    } else {
        submitGuessBtn.disabled = false;
        guessInput.disabled = false;
    }

    const lastDrawStep = card.steps[card.steps.length - 1];
    if (lastDrawStep && lastDrawStep.type === 'drawing') {
        canvasInstance.redraw(lastDrawStep.content);
    } else {
        canvasInstance.clear();
    }
    canvasInstance.setReadOnly(true);
}

async function handleChainFinishPhase() {
    if (phaseFinished) return;

    const playerIds = Object.keys(roomData.players).sort();
    const N = playerIds.length;
    const phase = roomData.phase;
    const myIndex = playerIds.indexOf(myUID);
    const cardOwnerIndex = ((myIndex - (phase - 1)) % N + N) % N;
    const cardOwnerId = playerIds[cardOwnerIndex];

    const stepIndex = roomData.cards[cardOwnerId].steps.length;

    const updates = {};
    updates[`cards/${cardOwnerId}/steps/${stepIndex}`] = {
        type: 'drawing', content: canvasInstance.getHistory(), authorId: myUID
    };
    updates[`players/${myUID}/ready`] = true;

    phaseFinished = true;
    finishDrawingBtn.disabled = true;
    finishDrawingBtn.textContent = 'Terminé !';

    await updateRoom(currentRoomID, updates);
    canvasInstance.setReadOnly(true);
}

async function handleChainSubmitGuess() {
    if (phaseFinished) return;

    const guess = guessInput.value.trim();
    if (!guess) { guessInput.focus(); return; }

    const playerIds = Object.keys(roomData.players).sort();
    const N = playerIds.length;
    const phase = roomData.phase;
    const myIndex = playerIds.indexOf(myUID);
    const cardOwnerIndex = ((myIndex - (phase - 1)) % N + N) % N;
    const cardOwnerId = playerIds[cardOwnerIndex];

    const card = roomData.cards[cardOwnerId];
    const initialWord = card.initialWord.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
    const normalizedGuess = guess.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");

    const myAttempts = roomData.guesses?.[myUID]?.attempts ?? 3;
    const isCorrect = normalizedGuess === initialWord;

    const updates = {};

    if (isCorrect) {
        const points = myAttempts; // 3, 2, or 1
        // Record final answer in the card chain
        const stepIndex = card.steps.length;
        updates[`cards/${cardOwnerId}/steps/${stepIndex}`] = {
            type: 'guess', content: guess, authorId: myUID, correct: true
        };
        updates[`guesses/${myUID}`] = { attempts: myAttempts, found: true };
        updates[`players/${myUID}/score`] = (roomData.players[myUID].score || 0) + points;
        updates[`players/${myUID}/ready`] = true;
        phaseFinished = true;
        submitGuessBtn.disabled = true;
        guessInput.disabled = true;
    } else {
        const newAttempts = myAttempts - 1;
        updates[`guesses/${myUID}`] = { attempts: newAttempts, found: false };

        if (newAttempts <= 0) {
            // Record final failed answer in the card chain
            const stepIndex = card.steps.length;
            updates[`cards/${cardOwnerId}/steps/${stepIndex}`] = {
                type: 'guess', content: guess, authorId: myUID, correct: false
            };
            updates[`players/${myUID}/ready`] = true;
            phaseFinished = true;
            submitGuessBtn.disabled = true;
            guessInput.disabled = true;
        } else {
            guessInput.value = '';
            guessInput.style.animation = 'shake 0.5s';
            setTimeout(() => guessInput.style.animation = '', 500);
            attemptsLeft.innerText = newAttempts;
        }
    }

    await updateRoom(currentRoomID, updates);
}

function renderChainFinished() {
    gameArea.style.display = 'none';
    wordSelectionOverlay.style.display = 'none';
    roundResultOverlay.style.display = 'none';
    if (gameFinishedOverlay) gameFinishedOverlay.style.display = 'none';
    chainResultsOverlay.style.display = 'flex';

    const cards = roomData.cards || {};
    const players = roomData.players || {};
    const cardList = Object.values(cards);
    currentCarouselIndex = 0;

    let html = '';
    cardList.forEach(card => {
        const ownerName = players[card.ownerId]?.name || 'Inconnu';
        const initial = card.initialWord;
        const lastStep = card.steps[card.steps.length - 1];
        const final = (lastStep.type === 'word' || lastStep.type === 'guess') ? lastStep.content : '(dessin)';
        const match = lastStep.type === 'guess' && lastStep.correct === true;

        const stepsHtml = card.steps.map((step) => {
            const author = players[step.authorId]?.name || '?';
            if (step.type === 'word') {
                return `<div class="chain-step chain-word">
                    <span class="chain-author">${author}</span>
                    <span class="chain-content">"${step.content}"</span>
                </div>`;
            } else if (step.type === 'guess') {
                const color = step.correct ? 'var(--green)' : 'var(--red)';
                return `<div class="chain-step chain-word">
                    <span class="chain-author">${author} a deviné</span>
                    <span class="chain-content" style="color:${color}">"${step.content}" ${step.correct ? '✓' : '✗'}</span>
                </div>`;
            } else {
                return `<div class="chain-step chain-drawing">
                    <span class="chain-author">${author} a dessiné</span>
                </div>`;
            }
        }).join('');

        html += `<div class="result-card ${match ? 'result-match' : ''}">
            <h3>Chaîne de ${ownerName}</h3>
            <div style="margin-bottom:10px; background:var(--ink-muted); padding:10px; border-radius:8px; font-size:0.9rem;">
                <strong style="color:var(--chalk-dim)">Départ :</strong> <span style="color:white;">${initial}</span><br/>
                <strong style="color:var(--chalk-dim)">Arrivée :</strong> <span style="color:${match ? 'var(--green)' : 'var(--red)'};">${final}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">${stepsHtml}</div>
        </div>`;
    });

    if (chainResultsGallery) {
        chainResultsGallery.innerHTML = html;
    }

    // Carousel Dots
    if (carouselDots) {
        carouselDots.innerHTML = cardList.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`).join('');
        carouselDots.querySelectorAll('.dot').forEach(dot => {
            dot.onclick = () => {
                currentCarouselIndex = parseInt(dot.dataset.index);
                updateCarousel(cardList.length);
            };
        });
    }

    // Carousel Arrows
    if (carouselPrev) carouselPrev.onclick = () => {
        if (currentCarouselIndex > 0) {
            currentCarouselIndex--;
            updateCarousel(cardList.length);
        }
    };
    if (carouselNext) carouselNext.onclick = () => {
        if (currentCarouselIndex < cardList.length - 1) {
            currentCarouselIndex++;
            updateCarousel(cardList.length);
        }
    };

    updateCarousel(cardList.length);

    // Score summary
    const sorted = Object.values(players).sort((a, b) => b.score - a.score);
    let scoreHtml = '<h3 style="color:var(--gold); margin-bottom:10px; font-size:1rem;">Classement</h3>';
    sorted.forEach((p, idx) => {
        const medal = idx === 0 ? '🏆' : (idx === 1 ? '🥈' : '🥉');
        scoreHtml += `<p style="margin:2px 0; font-size:0.9rem;">${medal} <strong>${p.name}</strong> : ${p.score} pts</p>`;
    });
    if (chainScoreSummary) chainScoreSummary.innerHTML = scoreHtml;
}

function updateCarousel(count) {
    if (chainResultsGallery) {
        chainResultsGallery.style.transform = `translateX(-${currentCarouselIndex * 100}%)`;
    }
    if (carouselDots) {
        carouselDots.querySelectorAll('.dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === currentCarouselIndex);
        });
    }
    if (carouselPrev) carouselPrev.disabled = (currentCarouselIndex === 0);
    if (carouselNext) carouselNext.disabled = (currentCarouselIndex === count - 1);
}

// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', init);
