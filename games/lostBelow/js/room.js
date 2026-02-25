import { auth } from "../../../js/config/firebase-config.js";
import { updateRoom, listenToRoomChanges } from "../../../js/firebaseWrk.js";

const urlParams = new URLSearchParams(window.location.search);
const rawID = urlParams.get("id");
const roomID = `lostBelow_${rawID}`;

if (!rawID) {
    window.location.href = "index.html";
}

document.getElementById("roomIDDisplay").textContent = rawID;

const playerList = document.getElementById("playerList");
const readyBtn = document.getElementById("readyBtn");
const startSetupBtn = document.getElementById("startSetupBtn");
const waitingMessage = document.getElementById("waitingMessage");

let isLeader = false;

listenToRoomChanges(roomID, (room) => {
    if (!room) {
        alert("La salle a été fermée.");
        window.location.href = "index.html";
        return;
    }

    const user = auth.currentUser;
    isLeader = room.leaderId === user.uid;

    // Update state redirection
    if (room.state === "setup") {
        window.location.href = `setup.html?id=${rawID}`;
        return;
    }
    if (room.state === "playing") {
        window.location.href = `game.html?id=${rawID}`;
        return;
    }

    // Render players
    playerList.innerHTML = "";
    const players = room.players || {};
    const playerArray = Object.values(players);

    playerArray.forEach(p => {
        const item = document.createElement("div");
        item.className = `player-item ${p.uid === room.leaderId ? "is-leader" : ""}`;
        item.innerHTML = `
      <div class="player-info">
        <span class="player-name">${p.name}</span>
        ${p.uid === room.leaderId ? '<span class="leader-badge">Leader</span>' : ""}
      </div>
      <div class="status-badge ${p.ready ? "status-ready" : "status-waiting"}">
        ${p.ready ? "Prêt" : "En attente"}
      </div>
    `;
        playerList.appendChild(item);
    });

    // UI for leader vs player
    if (isLeader) {
        startSetupBtn.style.display = "flex";
        const allReady = playerArray.every(p => p.ready || p.uid === room.leaderId);
        startSetupBtn.disabled = !allReady;
        waitingMessage.textContent = allReady ? "Tout le monde est prêt !" : "En attente du signal des explorateurs...";
    } else {
        readyBtn.style.display = "flex";
        const myPlayer = players[user.uid];
        if (myPlayer) {
            readyBtn.className = myPlayer.ready ? "lobby-btn btn-create" : "lobby-btn btn-join";
            readyBtn.querySelector("span").textContent = myPlayer.ready ? "Prêt !" : "Je suis prêt";
        }
    }
});

readyBtn.onclick = async () => {
    const user = auth.currentUser;
    const roomSnapshot = await listenToRoomChanges(roomID, (room) => room); // Simplification, normally we should get the current value once
    // In firebaseWrk.js updateRoom is just an update(...), we can target the nested player.ready
    await updateRoom(roomID, {
        [`players/${user.uid}/ready`]: true
    });
};

startSetupBtn.onclick = async () => {
    await updateRoom(roomID, {
        state: "setup"
    });
};
