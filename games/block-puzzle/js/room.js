import { auth, firebaseReady } from "../../../js/config/firebase-config.js";
import { updateRoom, listenToRoomChanges } from "../../../js/firebaseWrk.js";

const urlParams = new URLSearchParams(window.location.search);
const rawID = urlParams.get("id");
const roomID = `blockPuzzle_${rawID}`;

if (!rawID) {
    window.location.href = "index.html";
}

const playerListEl = document.getElementById("playerList");
const roomIDDisplay = document.getElementById("roomIDDisplay");
const readyBtn = document.getElementById("readyBtn");
const startGameBtn = document.getElementById("startGameBtn");
const waitingMessage = document.getElementById("waitingMessage");

let isLeader = false;
let currentPlayers = {};

roomIDDisplay.textContent = rawID;

let room = null; // Variable globale pour stocker la room

async function initRoom() {
    await firebaseReady;

    listenToRoomChanges(roomID, (updatedRoom) => {
        if (!updatedRoom) {
            alert("La salle a été fermée.");
            window.location.href = "lobby.html";
            return;
        }

        room = updatedRoom; // Sauvegarder la room
        const user = auth.currentUser;
        currentPlayers = updatedRoom.players || {};
        isLeader = updatedRoom.leaderId === user.uid;

        updatePlayerList(currentPlayers, user?.uid, updatedRoom); // Passer room
        updateButtons(currentPlayers, user?.uid, updatedRoom);

        if (updatedRoom.state === "playing") {
            window.location.href = `game.html?id=${rawID}&mode=confrontation`;
        }
    });
}

initRoom();

function updatePlayerList(players, currentUserUid) {
    playerListEl.innerHTML = "";

    Object.values(players).forEach(player => {
        const item = document.createElement("div");
        const isMe = player.uid === currentUserUid;

        // CORRECTION: Comparer avec room.leaderId, pas avec players[auth.currentUser.uid]
        const isPlayerLeader = player.uid === room.leaderId;

        item.className = `player-item ${isPlayerLeader ? 'is-leader' : ''}`;

        item.innerHTML = `
            <div class="player-info">
                <span class="player-name">${player.name} ${isMe ? "(Vous)" : ""}</span>
                ${isPlayerLeader ? '<span class="leader-badge">Leader</span>' : ''}
            </div>
            <span class="status-badge ${player.ready ? "status-ready" : "status-waiting"}">
                ${player.ready ? "Prêt" : "En attente"}
            </span>
        `;
        playerListEl.appendChild(item);
    });
}

function updateButtons(players, currentUserUid) {
    const me = players[currentUserUid];
    if (!me) return;

    readyBtn.querySelector("span").textContent = me.ready ? "PAS PRÊT ?" : "JE SUIS PRÊT !";

    const playerArray = Object.values(players);
    const allReady = playerArray.length === 2 && playerArray.every(p => p.ready);

    if (isLeader) {
        startGameBtn.style.display = "block";
        startGameBtn.disabled = !allReady;
        waitingMessage.style.display = allReady ? "none" : "block";
        waitingMessage.textContent = allReady ? "Tout le monde est prêt !" : "En attente du deuxième joueur...";
    } else {
        startGameBtn.style.display = "none";
        waitingMessage.style.display = "block";
        waitingMessage.textContent = me.ready ? "En attente du leader..." : "Cliquez sur prêt !";
    }
}

readyBtn.onclick = async () => {
    const user = auth.currentUser;
    const isReady = currentPlayers[user.uid]?.ready || false;

    await updateRoom(roomID, {
        [`players/${user.uid}/ready`]: !isReady
    });
};

startGameBtn.onclick = async () => {
    await updateRoom(roomID, {
        state: "playing",
        startTime: Math.floor(Date.now() / 1000)
    });
};
