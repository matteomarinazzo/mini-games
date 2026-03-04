import { auth, firebaseReady } from "../../../js/config/firebase-config.js";
import { createRoom, joinRoom, checkRoomExists } from "../../../js/firebaseWrk.js";
import { checkRealConnection } from '../../../js/network.js';

const createBtn = document.getElementById("createRoomBtn");
const joinBtn = document.getElementById("joinRoomBtn");
const roomInput = document.getElementById("roomInput");
const nameInput = document.getElementById("playerNameInput");
const homeBtn = document.getElementById("home-button");

function generateRoomID() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

document.addEventListener("DOMContentLoaded", async () => {
    const isOnline = await checkRealConnection();
    if (!isOnline) {
        sessionStorage.setItem('offline_target_path', window.location.href);
        window.location.href = '../offline.html';
        return;
    }

    const savedName = localStorage.getItem("blockPuzzle_playerName");
    if (savedName) {
        nameInput.value = savedName;
    }
});

roomInput.oninput = () => {
    roomInput.value = roomInput.value.toUpperCase();
};

createBtn.onclick = async () => {
    const chosenName = nameInput.value.trim();
    if (!chosenName) {
        alert("Veuillez entrer votre prénom !");
        nameInput.focus();
        return;
    }

    const isOnline = await checkRealConnection();
    if (!isOnline) {
        sessionStorage.setItem('offline_target_path', window.location.href);
        window.location.href = '../offline.html';
        return;
    }

    createBtn.disabled = true;
    createBtn.textContent = "⌛ Création...";

    await firebaseReady;

    localStorage.setItem("blockPuzzle_playerName", chosenName);
    const roomID = generateRoomID();
    const user = auth.currentUser;

    const urlParams = new URLSearchParams(window.location.search);
    const duration = parseInt(urlParams.get("duration") || "600");

    const roomData = {
        roomID: roomID,
        leader: chosenName,
        leaderId: user.uid,
        numPlayers: 2,
        state: "waiting",
        createdAt: Date.now(),
        players: {
            [user.uid]: {
                uid: user.uid,
                name: chosenName,
                score: 0,
                ready: false,
                connected: true
            }
        },
        grid: Array(10).fill(0).map(() => Array(10).fill(0)),
        currentTurn: user.uid,
        duration: duration
    };

    const success = await createRoom(`blockPuzzle_${roomID}`, roomData);
    if (success) {
        window.location.href = `room.html?id=${roomID}`;
    } else {
        alert("Erreur lors de la création de la salle. Réessayez.");
        createBtn.disabled = false;
        createBtn.textContent = "➕ Créer une salle";
    }
};

joinBtn.onclick = async () => {
    const chosenName = nameInput.value.trim();
    if (!chosenName) {
        alert("Veuillez entrer votre prénom !");
        nameInput.focus();
        return;
    }

    const isOnline = await checkRealConnection();
    if (!isOnline) {
        sessionStorage.setItem('offline_target_path', window.location.href);
        window.location.href = '../offline.html';
        return;
    }

    const roomID = roomInput.value.trim().toUpperCase();
    if (roomID.length !== 6) {
        alert("Code de 6 caractères requis.");
        return;
    }

    joinBtn.disabled = true;
    joinBtn.textContent = "⌛ Connexion...";

    await firebaseReady;

    localStorage.setItem("blockPuzzle_playerName", chosenName);
    const user = auth.currentUser;
    const playerData = {
        uid: user.uid,
        name: chosenName,
        score: 0,
        ready: false,
        connected: true
    };

    const success = await joinRoom(`blockPuzzle_${roomID}`, playerData);
    if (success) {
        window.location.href = `room.html?id=${roomID}`;
    } else {
        alert("Salle introuvable ou déjà pleine.");
        joinBtn.disabled = false;
        joinBtn.textContent = "🚪 Rejoindre";
    }
};