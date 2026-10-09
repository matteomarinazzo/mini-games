import { listenToRatingChanges, getRating, saveRating, saveUserRating, getUserRating, calculateAverage, updateRatingDisplay } from "./firebaseWrk.js";
import { playGameSound } from "./utils/audio.js";

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

// Configurer les listeners sur les cartes
function setupRatingListeners() {
  const gameCards = document.querySelectorAll(".game-card:not(.coming-soon)");

  gameCards.forEach((card) => {
    const gameId = card.dataset.game;
    const rating = card.querySelector(".rating");

    if (!rating) return;
    if (rating.dataset.ratingListener) return;

    rating.style.cursor = "pointer";
    rating.title = window.t ? window.t("menu.rating.title") : "Noter ce jeu";

    rating.addEventListener("click", (e) => {
      e.stopPropagation();
      openRatingModal(gameId);
    });

    rating.dataset.ratingListener = "true";
  });
}

// Helper pour récupérer le nom du jeu
function getGameInfo(gameId) {
  const card = document.querySelector(`.game-card[data-game="${gameId}"]`);
  const rawTitle = card?.querySelector(".card-title")?.textContent || gameId;
  const translatedName = window.t ? window.t(`menu.games.${gameId}.name`) : rawTitle;
  return {
    name: translatedName || rawTitle,
    logoUrl: `assets/logos/${gameId}.webp`
  };
}

// Helper i18n
function tr(key, fallback = "") {
  if (typeof window.t === "function") {
    const val = window.t(key);
    if (val && val !== key) return val;
  }
  return fallback;
}

// Ouvrir la modal
export async function openRatingModal(gameId) {
  // Fermer toute modal ouverte existante
  document.querySelectorAll(".rating-modal").forEach(m => m.remove());

  const ratingData = await getRating(gameId);
  const userRating = getUserRating(gameId);
  const hasRated = userRating !== null && userRating !== undefined;
  const gameInfo = getGameInfo(gameId);

  const avgScore = calculateAverage(ratingData.total, ratingData.count);

  const scoreSentiments = {
    1: tr("menu.rating.score_1", "Pas terrible 😕"),
    2: tr("menu.rating.score_2", "Moyen 😐"),
    3: tr("menu.rating.score_3", "Pas mal 🙂"),
    4: tr("menu.rating.score_4", "Très bon ! 😄"),
    5: tr("menu.rating.score_5", "Chef-d'œuvre ! 🤩")
  };

  const modal = document.createElement("div");
  modal.className = "rating-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", tr("menu.rating.title", "Noter ce jeu"));

  modal.innerHTML = `
    <div class="rating-modal-content">
      <!-- Accent Top Glow Rim -->
      <div class="rating-modal-rim"></div>
      
      <button class="modal-close" aria-label="Fermer" title="Fermer">✕</button>
      
      <!-- Game Info Header -->
      <div class="rating-game-header">
        <div class="rating-game-logo-wrap">
          <img src="${gameInfo.logoUrl}" alt="${gameInfo.name}" class="rating-game-logo" 
               onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
          <span class="rating-game-fallback-icon" style="display:none;">🎮</span>
        </div>
        <div class="rating-game-text">
          <h4 class="rating-game-name">${gameInfo.name}</h4>
          <p class="rating-modal-subtitle">
            ${hasRated ? tr("menu.rating.subtitle_rated", "Vous avez déjà noté ce jeu. Vous pouvez modifier votre note.") : tr("menu.rating.subtitle_default", "Votre avis compte pour la communauté !")}
          </p>
        </div>
      </div>

      <!-- Star Rating Input Interactive -->
      <div class="star-rating-container">
        <div class="star-rating" id="starRatingGroup">
          ${[5, 4, 3, 2, 1].map((star) => `
            <input type="radio" id="star${star}-${gameId}" name="rating" value="${star}" 
                   ${userRating === star ? "checked" : ""}>
            <label for="star${star}-${gameId}" data-star="${star}" title="${star} ⭐" aria-label="${star} étoiles">
              <svg class="star-svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </label>
          `).join("")}
        </div>
        
        <!-- Reaction Feedback Tag -->
        <div class="star-sentiment-pill ${userRating ? 'is-active' : ''}" id="starSentimentPill">
          ${userRating ? scoreSentiments[userRating] : '—'}
        </div>
      </div>
      
      <!-- Live Community Stats -->
      <div class="modal-stats">
        <div class="stat-pill">
          <span class="stat-label">${tr("menu.rating.average", "Note moyenne")}</span>
          <span class="stat-val highlight"><span class="star-mini">⭐</span> ${avgScore} <small>/ 5</small></span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">${tr("menu.rating.votes", "Nombre de votes")}</span>
          <span class="stat-val">${ratingData.count || 0}</span>
        </div>
        ${hasRated ? `
          <div class="stat-pill user-current">
            <span class="stat-label">${tr("menu.rating.your_rating", "Votre note")}</span>
            <span class="stat-val user-val">${userRating} ⭐</span>
          </div>
        ` : ""}
      </div>
      
      <!-- Buttons -->
      <div class="modal-buttons">
        <button class="btn-cancel" type="button">${tr("menu.rating.btn_cancel", "Annuler")}</button>
        <button class="btn-submit" type="button" ${userRating === null ? "disabled" : ""}>
          ${hasRated ? tr("menu.rating.btn_modify", "Mettre à jour") : tr("menu.rating.btn_submit", "Valider ma note")}
        </button>
      </div>
      
      <p class="modal-info">${tr("menu.rating.info_shared", "🌍 Les notes sont partagées en temps réel entre tous les joueurs")}</p>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("show"));

  setupModalListeners(modal, gameId, ratingData, userRating, scoreSentiments);
}

// Configurer les listeners de la modal
function setupModalListeners(modal, gameId, ratingData, currentUserRating, scoreSentiments) {
  const closeBtn = modal.querySelector(".modal-close");
  const cancelBtn = modal.querySelector(".btn-cancel");
  const submitBtn = modal.querySelector(".btn-submit");
  const radioInputs = modal.querySelectorAll('input[name="rating"]');
  const labels = modal.querySelectorAll('.star-rating label');
  const sentimentPill = modal.querySelector('#starSentimentPill');

  const closeModal = () => {
    modal.classList.remove("show");
    setTimeout(() => modal.remove(), 320);
  };

  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Clavier Escape
  const keyHandler = (e) => {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", keyHandler);
    }
    // Raccourcis touches 1 à 5
    if (['1', '2', '3', '4', '5'].includes(e.key)) {
      const star = parseInt(e.key);
      const radio = modal.querySelector(`input[name="rating"][value="${star}"]`);
      if (radio) {
        radio.checked = true;
        submitBtn.disabled = false;
        updateSentiment(star);
        if (playGameSound) playGameSound('menu_hover');
      }
    }
    if (e.key === "Enter" && !submitBtn.disabled) {
      submitBtn.click();
    }
  };
  document.addEventListener("keydown", keyHandler);

  function updateSentiment(starVal) {
    if (!sentimentPill) return;
    if (scoreSentiments[starVal]) {
      sentimentPill.textContent = scoreSentiments[starVal];
      sentimentPill.classList.add('is-active');
      sentimentPill.style.animation = 'none';
      sentimentPill.offsetHeight; // reflow
      sentimentPill.style.animation = 'pillBounce 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    }
  }

  // Hover sur les étoiles pour prévisualiser la réaction
  labels.forEach((lbl) => {
    lbl.addEventListener("mouseenter", () => {
      const star = parseInt(lbl.dataset.star);
      updateSentiment(star);
    });
    lbl.addEventListener("mouseleave", () => {
      const checked = modal.querySelector('input[name="rating"]:checked');
      if (checked) {
        updateSentiment(parseInt(checked.value));
      } else {
        if (sentimentPill) {
          sentimentPill.textContent = '—';
          sentimentPill.classList.remove('is-active');
        }
      }
    });
  });

  radioInputs.forEach((input) => {
    input.addEventListener("change", () => {
      submitBtn.disabled = false;
      const starVal = parseInt(input.value);
      updateSentiment(starVal);

      if (playGameSound) playGameSound('menu_hover');
      if (navigator.vibrate) navigator.vibrate(25);
    });
  });

  submitBtn.addEventListener("click", async () => {
    const selectedRating = modal.querySelector('input[name="rating"]:checked');
    if (!selectedRating) return;

    const rating = parseInt(selectedRating.value);

    submitBtn.innerHTML = `<span class="btn-spinner"></span> ${tr("menu.rating.saving", "Enregistrement en cours…")}`;
    submitBtn.disabled = true;

    const success = await submitRating(
      gameId,
      rating,
      ratingData,
      currentUserRating,
    );

    if (success) {
      document.removeEventListener("keydown", keyHandler);
      const content = modal.querySelector(".rating-modal-content");
      content.innerHTML = `
        <div class="rating-modal-rim"></div>
        <div class="success-message">
          <div class="success-icon-wrap">
            <svg class="success-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h3 class="success-title">${tr("menu.rating.success_title", "Merci pour ton vote !")}</h3>
          <p class="success-desc">${tr("menu.rating.success_desc", "Ta note a été enregistrée avec succès.")}</p>
          <div class="success-score-badge">${rating} ⭐</div>
          <p class="success-subtitle">${tr("menu.rating.success_sub", "🌍 Visible instantanément par tous les joueurs !")}</p>
        </div>
      `;

      if (playGameSound) playGameSound('menu_hover');
      if (navigator.vibrate) navigator.vibrate([40, 60, 80]);
      setTimeout(closeModal, 1800);
    } else {
      submitBtn.innerHTML = tr("menu.rating.error", "❌ Erreur — Réessayer");
      submitBtn.disabled = false;
    }
  });
}

// Soumettre une note
async function submitRating(gameId, newRating, currentData, oldUserRating) {
  try {
    const initialData = currentData || { total: 0, count: 0 };
    let total = initialData.total || 0;
    let count = initialData.count || 0;

    if (oldUserRating !== null && oldUserRating !== undefined) {
      total -= oldUserRating;
      count -= 1;
    }

    total += newRating;
    count += 1;

    const newData = { total, count };

    if (
      typeof newData.total !== "number" ||
      isNaN(newData.total) ||
      newData.total < 0 ||
      typeof newData.count !== "number" ||
      isNaN(newData.count) ||
      newData.count < 0 ||
      newData.total > newData.count * 5
    ) {
      console.error("❌ Les données de notation sont invalides :", newData);
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
