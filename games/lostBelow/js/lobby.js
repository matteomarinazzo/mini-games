import { auth } from "../../../js/config/firebase-config.js";
import { createRoom, joinRoom, checkRoomExists } from "../../../js/firebaseWrk.js";

const createBtn = document.getElementById("createRoomBtn");
const joinBtn = document.getElementById("joinRoomBtn");
const roomInput = document.getElementById("roomInput");

function generateRoomID() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Charger le nom depuis le localStorage au démarrage
document.addEventListener("DOMContentLoaded", () => {
    const savedName = localStorage.getItem("lostBelow_playerName");
    if (savedName) {
        document.getElementById("playerNameInput").value = savedName;
    }
});

createBtn.onclick = async () => {
    const nameInput = document.getElementById("playerNameInput");
    const chosenName = nameInput.value.trim();

    if (!chosenName) {
        alert("Veuillez entrer votre prénom avant de commencer l'expédition !");
        nameInput.focus();
        return;
    }

    // Sauvegarder pour la prochaine fois
    localStorage.setItem("lostBelow_playerName", chosenName);

    createBtn.disabled = true;
    createBtn.textContent = "⌛ Création...";

    const roomID = generateRoomID();
    const user = auth.currentUser;

    const roomData = {
        roomID: roomID,
        leader: chosenName,
        leaderId: user.uid,
        numPlayers: 8, // TODO: Make it dynamic MAIS 8 étant le max pour l'instant
        state: "waiting",
        createdAt: Date.now(),
        players: {
            [user.uid]: {
                uid: user.uid,
                name: chosenName,
                score: 0,
                ready: false,
                role: null,
                connected: true
            }
        }
    };

    const success = await createRoom(`lostBelow_${roomID}`, roomData);
    if (success) {
        window.location.href = `room.html?id=${roomID}`;
    } else {
        alert("Erreur lors de la création de la salle. Réessayez.");
        createBtn.disabled = false;
        createBtn.textContent = "➕ Créer une expédition";
    }
};

joinBtn.onclick = async () => {
    const nameInput = document.getElementById("playerNameInput");
    const chosenName = nameInput.value.trim();

    if (!chosenName) {
        alert("Veuillez entrer votre prénom avant de rejoindre l'expédition !");
        nameInput.focus();
        return;
    }

    const roomID = roomInput.value.trim().toUpperCase();
    if (roomID.length !== 6) {
        alert("Veuillez entrer un code de 6 caractères.");
        return;
    }

    // Sauvegarder pour la prochaine fois
    localStorage.setItem("lostBelow_playerName", chosenName);

    joinBtn.disabled = true;
    joinBtn.textContent = "⌛ Connexion...";

    const user = auth.currentUser;
    const playerData = {
        uid: user.uid,
        name: chosenName,
        score: 0,
        ready: false,
        role: null,
        connected: true
    };

    const success = await joinRoom(`lostBelow_${roomID}`, playerData);
    if (success) {
        window.location.href = `room.html?id=${roomID}`;
    } else {
        alert("Salle introuvable ou déjà pleine.");
        joinBtn.disabled = false;
        joinBtn.textContent = "🚪 Rejoindre";
    }
};
