// État du jeu
const gameState = {
  player1: { symbol: null, isCustom: false, customImage: null },
  player2: { symbol: null, isCustom: false, customImage: null },
};

// ✅ RESTAURER AU CHARGEMENT DE LA PAGE
window.addEventListener("DOMContentLoaded", () => {
  restoreSettings();
});

function restoreSettings() {
  // Récupérer les données du localStorage
  const morpionMode = localStorage.getItem("morpionMode");
  const morpionDifficulty = localStorage.getItem("morpionDifficulty");
  const morpionGameConfigStr = localStorage.getItem("morpionGameConfig");

  // ✅ Restaurer le mode (solo/multiplayer) - CORRECTION DU NOM
  if (morpionMode) {
    const modeRadio = document.querySelector(`input[name="gameMode"][value="${morpionMode}"]`);
    if (modeRadio) {
      modeRadio.checked = true;
      // Afficher/cacher la section difficulté
      const difficultySection = document.getElementById("difficultyGroup");
      if (difficultySection) {
        difficultySection.style.display = morpionMode === "solo" ? "block" : "none";
      }
    }
  }

  // ✅ Restaurer la difficulté - CORRECTION DU NOM
  if (morpionDifficulty) {
    const difficultyRadio = document.querySelector(`input[name="aiDifficulty"][value="${morpionDifficulty}"]`);
    if (difficultyRadio) {
      difficultyRadio.checked = true;
    }
  }

  // Restaurer la config du jeu (symboles + type de jeu)
  if (morpionGameConfigStr) {
    try {
      const config = JSON.parse(morpionGameConfigStr);

      // Restaurer le type de jeu
      if (config.gameType) {
        const gameTypeRadio = document.querySelector(`input[name="gameType"][value="${config.gameType}"]`);
        if (gameTypeRadio) {
          gameTypeRadio.checked = true;
          updateGameTypeStatus();
        }
      }

      // Restaurer les symboles des joueurs
      if (config.players?.player1) {
        const p1 = config.players.player1;
        selectSymbol("player1", p1.symbol, p1.isCustom, p1.customImage);
      }

      if (config.players?.player2) {
        const p2 = config.players.player2;
        selectSymbol("player2", p2.symbol, p2.isCustom, p2.customImage);
      }
    } catch (error) {
      console.error("Erreur lors du parsing de morpionGameConfig:", error);
    }
  }
}

// ✅ Fonction pour mettre à jour les badges "Actif/Inactif"
function updateGameTypeStatus() {
  document.querySelectorAll('input[name="gameType"]').forEach((radio) => {
    const label = radio.closest('.radio-label');
    const statusIndicator = label.querySelector('.status-indicator');
    
    if (statusIndicator) {
      if (radio.checked) {
        statusIndicator.textContent = 'Actif';
        statusIndicator.classList.remove('inactive');
      } else {
        statusIndicator.textContent = 'Inactif';
        statusIndicator.classList.add('inactive');
      }
    }
  });
}

// ✅ Écouter les changements de mode - CORRECTION DU NOM
document.querySelectorAll('input[name="gameMode"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    const isSolo = e.target.value === "solo";
    const difficultySection = document.getElementById("difficultyGroup");
    if (difficultySection) {
      difficultySection.style.display = isSolo ? "block" : "none";
    }
    localStorage.setItem("morpionMode", e.target.value);
  });
});

// ✅ Écouter les changements de difficulté - CORRECTION DU NOM
document.querySelectorAll('input[name="aiDifficulty"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    localStorage.setItem("morpionDifficulty", e.target.value);
  });
});

// ✅ Écouter les changements de type de jeu pour mettre à jour les badges
document.querySelectorAll('input[name="gameType"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    updateGameTypeStatus();
  });
});

// Sélection des symboles
document.querySelectorAll(".symbol-option").forEach((option) => {
  option.addEventListener("click", function () {
    const player = this.closest(".player-section").classList.contains("player1")
      ? "player1"
      : "player2";
    const symbol = this.dataset.symbol;

    selectSymbol(player, symbol, false);
  });
});

// Fonction pour sélectionner un symbole
function selectSymbol(player, symbol, isCustom = false, customImage = null) {
  // Mettre à jour l'état
  gameState[player] = { symbol, isCustom, customImage };

  // Retirer toutes les sélections du joueur
  const playerSection = document.getElementById(`${player}Section`);
  playerSection.querySelectorAll(".symbol-option").forEach((opt) => {
    opt.classList.remove("selected");
  });

  // Supprimer l'image personnalisée si symbole standard
  if (!isCustom) {
    const playerNum = player === "player1" ? 1 : 2;

    const customPreview = document.getElementById(`preview${playerNum}`);
    const customPreviewImg = document.getElementById(`previewImg${playerNum}`);
    const fileInput = document.getElementById(`fileInput${playerNum}`);

    // Cacher l'aperçu
    if (customPreview) customPreview.classList.remove("show");

    // Vider l'image
    if (customPreviewImg) customPreviewImg.src = "";

    // Reset l'input file
    if (fileInput) fileInput.value = "";
  } else {
    // Afficher l'aperçu de l'image personnalisée
    const playerNum = player === "player1" ? 1 : 2;
    const customPreview = document.getElementById(`preview${playerNum}`);
    const customPreviewImg = document.getElementById(`previewImg${playerNum}`);

    if (customPreview && customPreviewImg && customImage) {
      customPreviewImg.src = customImage;
      customPreview.classList.add("show");
    }
  }

  // Sélectionner le nouveau symbole
  if (!isCustom) {
    const selectedOption = playerSection.querySelector(
      `[data-symbol="${symbol}"]`,
    );
    if (selectedOption) selectedOption.classList.add("selected");
  }

  // Mettre à jour l'aperçu principal
  const preview = document.getElementById(`${player}Preview`);
  if (preview) {
    if (isCustom && customImage) {
      preview.innerHTML = `<img src="${customImage}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px;">`;
    } else {
      preview.textContent = symbol;
    }
  }

  // Ajouter classe selected à la section
  playerSection.classList.add("selected");

  // Désactiver les symboles déjà pris par l'autre joueur
  updateDisabledSymbols();

  // Vérifier si on peut démarrer
  checkStartButton();
}

// Désactiver les symboles déjà choisis
function updateDisabledSymbols() {
  const p1Symbol = gameState.player1.symbol;
  const p2Symbol = gameState.player2.symbol;

  document.querySelectorAll(".symbol-option").forEach((option) => {
    const symbol = option.dataset.symbol;
    const player = option
      .closest(".player-section")
      .classList.contains("player1")
      ? "player1"
      : "player2";
    const otherPlayer = player === "player1" ? "player2" : "player1";

    if (
      gameState[otherPlayer].symbol === symbol &&
      !gameState[otherPlayer].isCustom
    ) {
      option.classList.add("disabled");
    } else {
      option.classList.remove("disabled");
    }
  });
}

// Vérifier si le bouton start peut être activé
function checkStartButton() {
  const btn = document.getElementById("startBtn");
  const p1Selected = gameState.player1.symbol !== null;
  const p2Selected = gameState.player2.symbol !== null;

  if (p1Selected && p2Selected) {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
}

// Images personnalisées
setupCustomImage("player1", 1);
setupCustomImage("player2", 2);

function setupCustomImage(player, playerNum) {
  const customDiv = document.getElementById(`customSymbol${playerNum}`);
  const fileInput = document.getElementById(`fileInput${playerNum}`);
  const preview = document.getElementById(`preview${playerNum}`);
  const previewImg = document.getElementById(`previewImg${playerNum}`);

  if (!customDiv || !fileInput) return;

  // Clic pour ouvrir le sélecteur
  customDiv.addEventListener("click", () => {
    fileInput.click();
  });

  // Changement de fichier
  fileInput.addEventListener("change", (e) => {
    handleFile(e.target.files[0], player, preview, previewImg);
  });

  // Drag & Drop
  customDiv.addEventListener("dragover", (e) => {
    e.preventDefault();
    customDiv.style.borderColor = "#667eea";
    customDiv.style.background = "#f8f9fa";
  });

  customDiv.addEventListener("dragleave", () => {
    customDiv.style.borderColor = "#dfe6e9";
    customDiv.style.background = "white";
  });

  customDiv.addEventListener("drop", (e) => {
    e.preventDefault();
    customDiv.style.borderColor = "#dfe6e9";
    customDiv.style.background = "white";

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      handleFile(file, player, preview, previewImg);
    }
  });
}

function handleFile(file, player, preview, previewImg) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const imageUrl = e.target.result;
    if (previewImg) previewImg.src = imageUrl;
    if (preview) preview.classList.add("show");

    selectSymbol(player, "🖼️", true, imageUrl);
  };
  reader.readAsDataURL(file);
}

// Bouton start
document.getElementById("startBtn").addEventListener("click", () => {
  // ✅ Récupérer les valeurs actuelles avec les BONS NOMS
  const mode = document.querySelector('input[name="gameMode"]:checked')?.value || "multiplayer";
  const difficulty = document.querySelector('input[name="aiDifficulty"]:checked')?.value || "medium";
  const gameType = document.querySelector('input[name="gameType"]:checked')?.value || "standard3x3";

  // Sauvegarder le mode et la difficulté séparément
  localStorage.setItem("morpionMode", mode);
  localStorage.setItem("morpionDifficulty", difficulty);

  // Sauvegarder la configuration complète
  const gameConfig = {
    gameType: gameType,
    players: {
      player1: gameState.player1,
      player2: gameState.player2,
    },
    playerTurn: 1,
    scores: {
      player1: 0,
      player2: 0,
      draws: 0,
    },
  };

  localStorage.setItem("morpionGameConfig", JSON.stringify(gameConfig));

  // Redirection
  window.location.href = `./views/${gameConfig.gameType}.html`;
});