/**
 * Where Am I — menu.js
 * Handles: tab switching, solo start, room creation/join, waiting room
 * Firebase: Firestore rooms collection
 *
 * SETUP REQUIRED:
 * Replace the firebaseConfig below with your project's config from
 * https://console.firebase.google.com → Project Settings → Your apps
 */

import { auth, firebaseReady, getServerTimestamp } from "../../../js/config/firebase-config.js";
import { createRoom, joinRoom, updateRoom, listenToRoomChanges, getRoom } from "../../../js/firebaseWrk.js";
import { checkRealConnection } from "../../../js/network.js";

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let myUID = null;
let currentRoomID = null;
let roomUnsub = null;

// Solo settings
let soloRounds = 3, soloTime = 120, soloZone = 'ALL';
// Multi settings
let mRounds = 3, mTime = 120, mZone = 'ALL';

// ═══════════════════════════════════════════════════
// DOM
// ═══════════════════════════════════════════════════
const tabSolo = document.getElementById('tabSolo');
const tabMulti = document.getElementById('tabMulti');
const soloOptions = document.getElementById('soloOptions');
const multiOptions = document.getElementById('multiOptions');
const soloStartBtn = document.getElementById('soloStartBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinStatus = document.getElementById('joinStatus');
const waitingOverlay = document.getElementById('waitingOverlay');
const displayRoomCode = document.getElementById('displayRoomCode');
const waitingPlayers = document.getElementById('waitingPlayers');
const leaderControls = document.getElementById('leaderControls');
const startGameBtn = document.getElementById('startGameBtn');
const playerCountHint = document.getElementById('playerCountHint');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const playerNameInput = document.getElementById('playerNameInput');

// ═══════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════
// auth is already handling signInAnonymously in firebase-config.js
firebaseReady.then(ready => {
    if (!ready) return;
    const user = auth.currentUser;
    if (user) {
        myUID = user.uid;
        const savedRoom = sessionStorage.getItem('whereAmI_room');
        if (savedRoom) {
            currentRoomID = savedRoom;
            listenToRoom(savedRoom);
        }
    }
});

// Where Am I nécessite internet — redirect offline.html si hors-ligne
checkRealConnection().then(isOnline => {
    if (!isOnline) {
        sessionStorage.setItem('offline_target_path', window.location.href);
        window.location.href = '../offline.html';
    }
});

// ═══════════════════════════════════════════════════
// PLAYER NAME
// ═══════════════════════════════════════════════════
const savedName = localStorage.getItem('whereAmI_name') || '';
if (savedName) playerNameInput.value = savedName;
playerNameInput.addEventListener('input', () => {
    localStorage.setItem('whereAmI_name', playerNameInput.value.trim());
});

function getPlayerName() {
    const n = playerNameInput.value.trim();
    if (!n) { playerNameInput.focus(); playerNameInput.style.borderColor = 'var(--rose)'; return null; }
    playerNameInput.style.borderColor = '';
    localStorage.setItem('whereAmI_name', n);
    return n;
}

// ═══════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════
tabSolo.addEventListener('click', () => switchTab('solo'));
tabMulti.addEventListener('click', () => switchTab('multi'));

function switchTab(tab) {
    tabSolo.classList.toggle('active', tab === 'solo');
    tabMulti.classList.toggle('active', tab === 'multi');
    soloOptions.style.display = tab === 'solo' ? 'flex' : 'none';
    multiOptions.style.display = tab === 'multi' ? 'flex' : 'none';
}

// ═══════════════════════════════════════════════════
// PILL GROUPS
// ═══════════════════════════════════════════════════
function setupPills(id, setter) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', e => {
        const p = e.target.closest('.gq-pill');
        if (!p || p.classList.contains('disabled')) return;
        el.querySelectorAll('.gq-pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        setter(isNaN(p.dataset.val) ? p.dataset.val : Number(p.dataset.val));
    });
}

setupPills('roundsGroup', v => soloRounds = v);
setupPills('timeGroup', v => soloTime = v);
setupPills('zoneGroup', v => soloZone = v);
setupPills('mRoundsGroup', v => mRounds = v);
setupPills('mTimeGroup', v => mTime = v);
setupPills('mZoneGroup', v => mZone = v);

// ═══════════════════════════════════════════════════
// SOLO START
// ═══════════════════════════════════════════════════
soloStartBtn.addEventListener('click', () => {
    const p = new URLSearchParams({
        mode: 'solo',
        rounds: soloRounds,
        time: soloTime,
        zone: soloZone
    });
    window.location.href = `game.html?${p}`;
});

// ═══════════════════════════════════════════════════
// ROOM CREATION
// ═══════════════════════════════════════════════════
createRoomBtn.addEventListener('click', async () => {
    const name = getPlayerName();
    if (!name || !myUID) return;

    createRoomBtn.disabled = true;
    createRoomBtn.textContent = 'Création…';

    const code = generateRoomCode();
    const gameId = `whereami_${code}`;

    const roomData = {
        code,
        state: 'waiting',
        leader: myUID,
        rounds: mRounds,
        timePerRound: mTime,
        zone: mZone,
        currentRound: 0,
        totalRounds: mRounds,
        roundStartedAt: null,
        currentLocation: null,
        players: {
            [myUID]: { name, score: 0, joined: Date.now(), online: true }
        },
        numPlayers: 8, // Support up to 8 players
        guesses: {},
        createdAt: getServerTimestamp() ? getServerTimestamp()() : Date.now()
    };

    const success = await createRoom(gameId, roomData);
    if (success) {
        currentRoomID = code;
        sessionStorage.setItem('whereAmI_room', code);
        listenToRoom(code);
    } else {
        alert("Erreur lors de la création de la salle.");
    }

    createRoomBtn.disabled = false;
    createRoomBtn.textContent = 'Créer la salle';
});

// ═══════════════════════════════════════════════════
// ROOM JOIN
// ═══════════════════════════════════════════════════
joinRoomBtn.addEventListener('click', () => handleJoinRoom());
roomCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleJoinRoom(); });

async function handleJoinRoom() {
    const name = getPlayerName();
    if (!name || !myUID) return;

    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) { joinStatus.textContent = 'Code invalide (6 caractères)'; return; }

    joinStatus.textContent = 'Recherche…';
    joinRoomBtn.disabled = true;

    const gameId = `whereami_${code}`;
    const data = await getRoom(gameId);

    if (!data) {
        joinStatus.textContent = '❌ Salle introuvable';
        joinRoomBtn.disabled = false;
        return;
    }

    if (data.state === 'finished') {
        joinStatus.textContent = '❌ Cette partie est terminée';
        joinRoomBtn.disabled = false;
        return;
    }

    const playerData = { name, score: 0, joined: Date.now(), online: true, uid: myUID };
    const success = await joinRoom(gameId, playerData);

    if (!success) {
        joinStatus.textContent = '❌ Impossible de rejoindre';
        joinRoomBtn.disabled = false;
        return;
    }

    currentRoomID = code;
    sessionStorage.setItem('whereAmI_room', code);
    joinStatus.textContent = '';
    joinRoomBtn.disabled = false;

    if (data.state === 'playing' || data.state === 'round_result') {
        window.location.href = `game.html?room=${code}`;
        return;
    }

    listenToRoom(code);
}

// ═══════════════════════════════════════════════════
// LEAVE ROOM
// ═══════════════════════════════════════════════════
leaveRoomBtn.addEventListener('click', async () => {
    if (!currentRoomID || !myUID) return;
    await leaveRoom();
    waitingOverlay.style.display = 'none';
    currentRoomID = null;
    sessionStorage.removeItem('whereAmI_room');
});

async function leaveRoom() {
    if (!currentRoomID) return;
    const gameId = `whereami_${currentRoomID}`;
    await updateRoom(gameId, {
        [`players/${myUID}`]: null
    }).catch(() => { });
    if (typeof roomUnsub === 'function') { roomUnsub(); roomUnsub = null; }
}

// ═══════════════════════════════════════════════════
// REAL-TIME ROOM LISTENER
// ═══════════════════════════════════════════════════
function listenToRoom(code) {
    if (typeof roomUnsub === 'function') roomUnsub();
    const gameId = `whereami_${code}`;

    listenToRoomChanges(gameId, data => {
        if (!data) {
            waitingOverlay.style.display = 'none';
            sessionStorage.removeItem('whereAmI_room');
            return;
        }

        if (data.state === 'playing') {
            window.location.href = `game.html?room=${code}`;
            return;
        }

        showWaitingRoom(code, data);
    });
}

function showWaitingRoom(code, data) {
    waitingOverlay.style.display = 'flex';
    displayRoomCode.textContent = code;

    const players = Object.entries(data.players || {});
    const isLeader = data.leader === myUID;

    waitingPlayers.innerHTML = players.map(([uid, p]) =>
        `<div class="gs-player-chip ${uid === data.leader ? 'leader' : ''}">
            ${uid === data.leader ? '👑 ' : ''}${p.name}
        </div>`
    ).join('');

    leaderControls.style.display = isLeader ? 'block' : 'none';

    if (isLeader) {
        const count = players.length;
        startGameBtn.disabled = count < 2;
        playerCountHint.textContent = count < 2 ? '(min 2 joueurs)' : `(${count} joueurs)`;
    }
}

// ═══════════════════════════════════════════════════
// START GAME (leader only)
// ═══════════════════════════════════════════════════
startGameBtn.addEventListener('click', async () => {
    if (!currentRoomID) return;
    const gameId = `whereami_${currentRoomID}`;
    await updateRoom(gameId, { state: 'playing', currentRound: 1 });
});

// ═══════════════════════════════════════════════════
// COPY CODE
// ═══════════════════════════════════════════════════
copyCodeBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoomID || '').then(() => {
        copyCodeBtn.textContent = '✅ Copié !';
        setTimeout(() => copyCodeBtn.textContent = '📋 Copier', 2000);
    });
});

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Unload cleanup
window.addEventListener('beforeunload', () => {
    if (roomUnsub) roomUnsub();
});