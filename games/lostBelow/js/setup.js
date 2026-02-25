import { auth } from "../../../js/config/firebase-config.js";
import { updateRoom, listenToRoomChanges } from "../../../js/firebaseWrk.js";

const urlParams = new URLSearchParams(window.location.search);
const rawID = urlParams.get("id");
const roomID = `lostBelow_${rawID}`;

if (!rawID) window.location.href = "index.html";

const playersSetup = document.getElementById("playersSetup");
const leaderSettings = document.getElementById("leaderSettings");
const playerWaiting = document.getElementById("playerWaiting");
const startGameBtn = document.getElementById("startGameFinalBtn");
const countdownOverlay = document.getElementById("countdownOverlay");
const countdownDisplay = document.getElementById("countdownDisplay");

const roles = [
    { name: "L'Alpiniste", color: "#3498db" },
    { name: "La Technicienne", color: "#e74c3c" },
    { name: "L'Éclaireur", color: "#2ecc71" },
    { name: "Le Médecin", color: "#f1c40f" },
    { name: "La Spéléologue", color: "#e67e22" },
    { name: "Le Géologue", color: "#9b59b6" },
    { name: "L'Ingénieur", color: "#1abc9c" },
    { name: "Le Surveillant", color: "#e91e63" },
];

let isLeader = false;
let currentRoom = null;

listenToRoomChanges(roomID, (room) => {
    if (!room) return;
    currentRoom = room;
    const user = auth.currentUser;
    isLeader = room.leaderId === user.uid;

    // Handle Game Start
    if (room.state === "starting" && countdownOverlay.style.display !== "flex") {
        startCountdown();
    }
    if (room.state === "playing") {
        window.location.href = `game.html?id=${rawID}`;
        return;
    }

    // Render Setup UI
    renderSetup(room);

    // Difficulty & Launch Visibility
    if (isLeader) {
        leaderSettings.style.display = "block";
        playerWaiting.style.display = "none";
    } else {
        leaderSettings.style.display = "none";
        playerWaiting.style.display = "block";
    }
});

function renderSetup(room) {
    const user = auth.currentUser;
    const players = Object.values(room.players || {});
    const takenRoles = players.filter(p => p.role).map(p => p.role);

    playersSetup.innerHTML = "";
    players.forEach(p => {
        const isMe = p.uid === user.uid;
        const card = document.createElement("div");
        card.className = `player-card ${isMe ? "is-me" : "disabled"}`;

        let rolesHtml = roles.map(r => {
            const isTakenByOther = takenRoles.includes(r.name) && p.role !== r.name;
            const isActive = p.role === r.name;
            return `
        <div class="role-btn ${isActive ? "active" : ""} ${isTakenByOther ? "taken" : ""}" 
             data-uid="${p.uid}" data-role="${r.name}" data-allowed="${isMe && !isTakenByOther}">
          ${r.name}
        </div>
      `;
        }).join("");

        card.innerHTML = `
      <h3>${p.name}${isMe ? " (Vous)" : ""}</h3>
      <div class="role-options">${rolesHtml}</div>
      <div class="color-preview" style="background: ${roles.find(r => r.name === p.role)?.color || "#eee"}"></div>
    `;

        // Add event listeners to role buttons
        card.querySelectorAll(".role-btn").forEach(btn => {
            btn.onclick = () => {
                const uid = btn.dataset.uid;
                const roleName = btn.dataset.role;
                const allowed = btn.dataset.allowed === "true";
                selectRole(uid, roleName, allowed);
            };
        });

        playersSetup.appendChild(card);
    });
}

window.selectRole = async (uid, roleName, allowed) => {
    if (!allowed) return;
    const color = roles.find(r => r.name === roleName).color;
    await updateRoom(roomID, {
        [`players/${uid}/role`]: roleName,
        [`players/${uid}/color`]: color
    });
};

startGameBtn.onclick = async () => {
    // Check if everyone has a role
    const players = Object.values(currentRoom.players);
    if (players.some(p => !p.role)) {
        alert("Tous les joueurs doivent choisir un rôle !");
        return;
    }

    const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
    await updateRoom(roomID, {
        state: "starting",
        difficulty: difficulty
    });
};

function startCountdown() {
    countdownOverlay.style.display = "flex";
    let count = 3;
    countdownDisplay.textContent = count;

    const timer = setInterval(() => {
        count--;
        countdownDisplay.textContent = count;
        if (count <= 0) {
            clearInterval(timer);
            if (isLeader) {
                updateRoom(roomID, { state: "playing" });
            }
            window.location.href = `game.html?id=${rawID}`;
        }
    }, 1000);
}
