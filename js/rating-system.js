// Importez les fonctions nécessaires de l'SDK Firebase
//import { database, ref, onValue, get, set } from "../js/config/firebase-config.js";
import { listenToRatingChanges, getRating, saveRating, saveUserRating, getLocalRating, getUserRating, calculateAverage, updateRatingDisplay, generateStars } from "../js/firebaseWrk.js";

// Initialiser le système de notation
export async function initRatingSystem() {
  await loadAndDisplayRatings();
  setupRatingListeners();
}

async function loadAndDisplayRatings() {
  const gameCards = document.querySelectorAll(
    ".game-card[data-game]:not(.coming-soon)",
  );

  for (const card of gameCards) {
    const gameId = card.dataset.game;
    if (!gameId) continue;

    const ratingData = await getRating(gameId);
    updateRatingDisplay(gameId, ratingData);
    listenToRatingChanges(gameId);
  }
}

// Écouter les changements en temps réel
/*function listenToRatingChanges(gameId) {
  const ratingRef = ref(database, `ratings/${gameId}`);

  onValue(
    ratingRef,
    (snapshot) => {
      const data = snapshot.val();
      if (data) {
        updateRatingDisplay(gameId, data);
      }
    },
    (error) => {
      console.error(`Erreur d'écoute des changements pour ${gameId}:`, error);
    },
  );
}

// Obtenir la note d'un jeu
async function getRating(gameId) {
  if (navigator.onLine) {
    try {
      const ratingRef = ref(database, `ratings/${gameId}`);
      const snapshot = await get(ratingRef);

      if (snapshot.exists()) {
        return snapshot.val();
      }
      console.log(
        `ℹ️ Pas de données Firebase pour ${gameId}, initialisation à 0.`,
      );
      return { total: 0, count: 0 };
    } catch (error) {
      console.error("Erreur lecture Firebase:", error);
      return getLocalRating(gameId);
    }
  } else {
    return console.log("Vous êtes hors ligne");
  }
}

// Sauvegarder une note
async function saveRating(gameId, ratingData) {
  try {
    const ratingRef = ref(database, `ratings/${gameId}`);
    await set(ratingRef, ratingData);
    console.log(`✅ Sauvegarde Firebase réussie pour ${gameId}:`, ratingData);
    return true;
  } catch (error) {
    console.error("❌ Erreur sauvegarde Firebase:", error);
    return saveLocalRating(gameId, ratingData);
  }
}

// Fallback: Obtenir depuis localStorage
function getLocalRating(gameId) {
  const ratings = JSON.parse(localStorage.getItem("gameRatings") || "{}");
  return ratings[gameId] || { total: 0, count: 0 };
}

// Obtenir la note de l'utilisateur
function getUserRating(gameId) {
  const userRatings = JSON.parse(localStorage.getItem("userRatings") || "{}");
  return userRatings[gameId] || null;
}

// Fallback: Sauvegarder en local
function saveLocalRating(gameId, ratingData) {
  try {
    const ratings = JSON.parse(localStorage.getItem("gameRatings") || "{}");
    ratings[gameId] = ratingData;
    localStorage.setItem("gameRatings", JSON.stringify(ratings));
    return true;
  } catch (error) {
    console.error("Erreur sauvegarde locale:", error);
    return false;
  }
}

// Sauvegarder la note de l'utilisateur
function saveUserRating(gameId, rating) {
  const userRatings = JSON.parse(localStorage.getItem("userRatings") || "{}");
  userRatings[gameId] = rating;
  localStorage.setItem("userRatings", JSON.stringify(userRatings));
}*/

// Calculer la moyenne
/*function calculateAverage(total, count) {
  return count > 0 ? (total / count).toFixed(1) : 0;
}

// Mettre à jour l'affichage
function updateRatingDisplay(gameId, ratingData) {
  const card = document.querySelector(`[data-game="${gameId}"]`);
  if (!card) return;

  const average = calculateAverage(ratingData.total, ratingData.count);
  const starsContainer = card.querySelector(".stars");
  const ratingText = card.querySelector(".rating-text");
  const ratingCount = card.querySelector(".rating-count");

  if (starsContainer) starsContainer.innerHTML = generateStars(average);
  if (ratingText) ratingText.textContent = average;
  if (ratingCount) {
    ratingCount.textContent = `(${ratingData.count} ${ratingData.count > 1 ? "votes" : "vote"})`;
  }
}

// Générer les étoiles
function generateStars(rating) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  let html = "";
  for (let i = 0; i < fullStars; i++) html += "★";
  if (hasHalfStar) html += "⯨";
  for (let i = 0; i < emptyStars; i++) html += "☆";

  return html;
}*/

// Configurer les listeners
function setupRatingListeners() {
  const gameCards = document.querySelectorAll(".game-card:not(.coming-soon)");

  gameCards.forEach((card) => {
    const gameId = card.dataset.game;
    const rating = card.querySelector(".rating");

    if (!rating) return;

    // Éviter d'ajouter plusieurs fois le même listener
    if (rating.dataset.ratingListener) return;

    rating.style.cursor = "pointer";
    rating.title = "Cliquez pour noter ce jeu";

    rating.addEventListener("click", (e) => {
      e.stopPropagation();
      openRatingModal(gameId);
    });

    // Marquer comme ayant un listener
    rating.dataset.ratingListener = "true";
  });
}

// Ouvrir la modal
async function openRatingModal(gameId) {
  const ratingData = await getRating(gameId);
  const userRating = getUserRating(gameId);
  const hasRated = userRating !== null;

  const modal = document.createElement("div");
  modal.className = "rating-modal";
  modal.innerHTML = `
    <div class="rating-modal-content">
      <button class="modal-close">&times;</button>
      <h3>Notez ce jeu</h3>
      <p class="modal-subtitle">
        ${hasRated ? "Vous avez déjà noté ce jeu. Vous pouvez modifier votre note." : "Votre avis compte !"}
      </p>
      
      <div class="star-rating">
        ${[5, 4, 3, 2, 1]
      .map(
        (star) => `
          <input type="radio" id="star${star}-${gameId}" name="rating" value="${star}" 
                 ${userRating === star ? "checked" : ""}>
          <label for="star${star}-${gameId}" title="${star} étoile${star > 1 ? "s" : ""}">★</label>
        `,
      )
      .join("")}
      </div>
      
      <div class="modal-stats">
        <p>Note moyenne: <strong>${calculateAverage(ratingData.total, ratingData.count)}/5</strong></p>
        <p>Nombre de votes: <strong>${ratingData.count}</strong></p>
        ${hasRated ? `<p>Votre note: <strong>${userRating} ★</strong></p>` : ""}
      </div>
      
      <div class="modal-buttons">
        <button class="btn-cancel">Annuler</button>
        <button class="btn-submit" ${userRating === null ? "disabled" : ""}>
          ${hasRated ? "Modifier" : "Valider"}
        </button>
      </div>
      
      <p class="modal-info">"🌍 Les notes sont partagées entre tous les joueurs"</p>
    </div>
  `;

  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add("show"), 10);

  setupModalListeners(modal, gameId, ratingData, userRating);
}

// Configurer les listeners de la modal
function setupModalListeners(modal, gameId, ratingData, currentUserRating) {
  const closeBtn = modal.querySelector(".modal-close");
  const cancelBtn = modal.querySelector(".btn-cancel");
  const submitBtn = modal.querySelector(".btn-submit");
  const radioInputs = modal.querySelectorAll('input[name="rating"]');

  const closeModal = () => {
    modal.classList.remove("show");
    setTimeout(() => modal.remove(), 300);
  };

  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  radioInputs.forEach((input) => {
    input.addEventListener("change", () => {
      submitBtn.disabled = false;
    });
  });

  submitBtn.addEventListener("click", async () => {
    const selectedRating = modal.querySelector('input[name="rating"]:checked');
    if (!selectedRating) return;

    const rating = parseInt(selectedRating.value);

    submitBtn.innerHTML = "⏳ Enregistrement...";
    submitBtn.disabled = true;

    const success = await submitRating(
      gameId,
      rating,
      ratingData,
      currentUserRating,
    );

    if (success) {
      const content = modal.querySelector(".rating-modal-content");
      content.innerHTML = `
        <div class="success-message">
          <div class="success-icon">✓</div>
          <h3>Merci !</h3>
          <p>Votre note a été enregistrée</p>
          '<p class="success-subtitle">Elle est maintenant visible par tous les joueurs !</p>'
        </div>
      `;

      if (navigator.vibrate) navigator.vibrate(50);
      setTimeout(closeModal, 2000);
    } else {
      submitBtn.innerHTML = "❌ Erreur - Réessayer";
      submitBtn.disabled = false;
    }
  });
}

// Soumettre une note - VERSION CORRIGÉE
async function submitRating(gameId, newRating, currentData, oldUserRating) {
  try {
    console.log(`🎯 Soumission note pour ${gameId}:`, {
      newRating,
      currentData,
      oldUserRating,
    });

    // S'assurer que currentData existe et a des valeurs valides
    const initialData = currentData || { total: 0, count: 0 };
    let total = initialData.total || 0;
    let count = initialData.count || 0;

    // CORRECTION: Vérifier que oldUserRating n'est pas null AVANT de soustraire
    if (oldUserRating !== null && oldUserRating !== undefined) {
      total -= oldUserRating;
      count -= 1;
    } else {
      console.log(`🆕 Première note pour ce jeu: ${newRating}`);
    }

    // Ajouter la nouvelle note
    total += newRating;
    count += 1;

    const newData = { total, count };

    // Validation des données
    if (
      typeof newData.total !== "number" ||
      isNaN(newData.total) ||
      newData.total < 0 ||
      typeof newData.count !== "number" ||
      isNaN(newData.count) ||
      newData.count < 0
    ) {
      console.error("❌ Les données de notation sont invalides :", newData);
      return false;
    }

    // Validation supplémentaire: total ne peut pas dépasser count * 5
    if (newData.total > newData.count * 5) {
      console.error("❌ Total invalide (> count * 5) :", newData);
      return false;
    }

    const saved = await saveRating(gameId, newData);
    if (!saved) return false;

    saveUserRating(gameId, newRating);

    return true;
  } catch (error) {
    console.error("❌ Erreur soumission:", error);
    return false;
  }
}

// Stats (pour debug)
export async function getRatingStats(gameId) {
  const ratingData = await getRating(gameId);
  const userRating = getUserRating(gameId);

  return {
    average: calculateAverage(ratingData.total, ratingData.count),
    count: ratingData.count,
    userRating: userRating,
    total: ratingData.total,
  };
}
