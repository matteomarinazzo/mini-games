// Importez les fonctions nécessaires de l'SDK Firebase
//import { database, ref, onValue, get, set } from "../js/config/firebase-config.js";
import { listenToRatingChanges, getRating, saveRating, saveUserRating, getLocalRating, getUserRating, calculateAverage, updateRatingDisplay, generateStars } from "../js/firebaseWrk.js";

const STAR_ICON = "\u2605";
const subscribedRatings = new Set();

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

    if (!subscribedRatings.has(gameId)) {
      const isSubscribed = await listenToRatingChanges(gameId);
      if (isSubscribed) subscribedRatings.add(gameId);
    }
  }
}

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
          <label for="star${star}-${gameId}" title="${star} \u00e9toile${star > 1 ? "s" : ""}">${STAR_ICON}</label>
        `,
      )
      .join("")}
      </div>
      
      <div class="modal-stats">
        <p>Note moyenne: <strong>${calculateAverage(ratingData.total, ratingData.count)}/5</strong></p>
        <p>Nombre de votes: <strong>${ratingData.count}</strong></p>
        ${hasRated ? `<p>Votre note: <strong>${userRating} ${STAR_ICON}</strong></p>` : ""}
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
