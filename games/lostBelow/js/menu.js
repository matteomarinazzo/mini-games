// ===============================
// DOM
// ===============================

const playerCountSelect = document.getElementById("playerCount");
const startGameBtn = document.getElementById("startGameBtn");
const teamPreview = document.getElementById("teamPreview");
const playersContainer = document.getElementById("playersContainer");

// ===============================
// RÔLES DISPONIBLES
// ===============================

const availableRoles = [
  { name: "L'Alpiniste", color: "#3498db" },
  { name: "La Technicienne", color: "#e74c3c" },
  { name: "L'Éclaireur", color: "#2ecc71" },
  { name: "Le Médecin", color: "#f1c40f" },
  { name: "La Spéléologue", color: "#e67e22" },
  { name: "Le Géologue", color: "#9b59b6" },
  { name: "L'Ingénieur", color: "#1abc9c" },
  { name: "Le Surveillant", color: "#e91e63" },
];

// ===============================
// STORAGE
// ===============================

function getStoredConfig() {
  const raw = localStorage.getItem("lostBelowConfig");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCurrentConfig() {
  const players = [];

  document.querySelectorAll(".player-card").forEach((card, index) => {
    const role = card.querySelector(".role-select").value;
    const type =
      card.querySelector(`input[name="type-${index}"]:checked`)?.value ?? "human";

    const roleData = availableRoles.find(r => r.name === role);

    players.push({
      id: index,
      role,
      color: roleData?.color ?? "#999",
      type,
    });
  });

  const difficulty =
    document.querySelector('input[name="difficulty"]:checked')?.value ??
    "normal";

  const config = { players, difficulty };
  localStorage.setItem("lostBelowConfig", JSON.stringify(config));
}

// ===============================
// GÉNÉRATION DES JOUEURS
// ===============================

function generatePlayerSelectors(storedConfig = null) {
  playersContainer.innerHTML = "";

  const count = storedConfig?.players?.length
    ? storedConfig.players.length
    : parseInt(playerCountSelect.value);

  playerCountSelect.value = count;

  for (let i = 0; i < count; i++) {
    const div = document.createElement("div");
    div.classList.add("player-card");

    const storedPlayer = storedConfig?.players?.[i];

    const defaultRole = storedPlayer
      ? availableRoles.find(r => r.name === storedPlayer.role)
      : availableRoles[i % availableRoles.length];

    const defaultType = storedPlayer?.type ?? "human";

    div.innerHTML = `
      <h3>Joueur ${i + 1}</h3>

      <select class="role-select" data-player="${i}">
        ${availableRoles
        .map(
          role => `
          <option value="${role.name}" ${role.name === defaultRole?.name ? "selected" : ""
            }>
            ${role.name}
          </option>
        `
        )
        .join("")}
      </select>

      <div class="color-preview" style="background-color: ${defaultRole?.color ?? "#999"
      };"></div>

      <div class="player-type">
        <label>
          <input type="radio" name="type-${i}" value="human" ${defaultType === "human" ? "checked" : ""
      } />
          👤 Humain
        </label>
        <label>
          <input type="radio" name="type-${i}" value="ai" ${defaultType === "ai" ? "checked" : ""
      } />
          🤖 IA
        </label>
      </div>
    `;

    playersContainer.appendChild(div);
  }

  attachEvents();
  enforceUniqueRoles();
  updateTeamPreview();
}

// ===============================
// EVENTS
// ===============================

function attachEvents() {
  document.querySelectorAll(".role-select").forEach(select => {
    select.addEventListener("change", () => {
      updateColorPreview(select);
      enforceUniqueRoles();
      updateTeamPreview();
      saveCurrentConfig();
    });
  });

  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener("change", () => {
      updateTeamPreview();
      saveCurrentConfig();
    });
  });
}

playerCountSelect.addEventListener("change", () => {
  generatePlayerSelectors();
  saveCurrentConfig();
});

startGameBtn.addEventListener("click", () => {
  saveCurrentConfig();
  window.location.href = "game.html";
});

// ===============================
// LOGIQUE
// ===============================

function updateColorPreview(select) {
  const roleName = select.value;
  const role = availableRoles.find(r => r.name === roleName);
  const card = select.closest(".player-card");
  const preview = card.querySelector(".color-preview");

  if (role && preview) {
    preview.style.backgroundColor = role.color;
  }
}

function enforceUniqueRoles() {
  const selects = Array.from(document.querySelectorAll(".role-select"));
  const chosenValues = selects.map(s => s.value);

  selects.forEach(select => {
    Array.from(select.options).forEach(option => {
      const takenByOther = chosenValues.some(
        (val, idx) => val === option.value && selects[idx] !== select
      );
      option.disabled = takenByOther;
    });
  });
}

function updateTeamPreview() {
  const cards = document.querySelectorAll(".player-card");

  if (!cards.length) {
    teamPreview.textContent =
      "Configurez vos joueurs pour commencer l'exploration.";
    return;
  }

  const lines = Array.from(cards).map((card, i) => {
    const role = card.querySelector(".role-select").value;
    const type =
      card.querySelector(`input[name="type-${i}"]:checked`)?.value ?? "human";

    const emoji = type === "ai" ? "🤖" : "👤";
    return `${emoji} Joueur ${i + 1} — ${role}`;
  });

  teamPreview.innerHTML = lines.join("<br/>");
}

function restoreDifficulty(storedConfig) {
  if (!storedConfig?.difficulty) return;

  const input = document.querySelector(
    `input[name="difficulty"][value="${storedConfig.difficulty}"]`
  );

  if (input) input.checked = true;
}

// ===============================
// INIT
// ===============================

const storedConfig = getStoredConfig();

if (storedConfig) {
  generatePlayerSelectors(storedConfig);
  restoreDifficulty(storedConfig);
} else {
  generatePlayerSelectors();
}