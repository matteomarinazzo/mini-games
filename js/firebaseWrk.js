import { database, getRef, getGet, getSet, getRunTransaction, getOnValue, firebaseReady } from "./config/firebase-config.js";

// Attendre que Firebase soit initialisé avant de faire quoi que ce soit
async function waitForFirebase() {
    await firebaseReady;
}

// Fonction utilitaire pour éviter de répéter les vérifications
const getDbTools = () => ({
    _ref: getRef(),
    _get: getGet(),
    _set: getSet(),
    _run: getRunTransaction(),
    _onValue: getOnValue()
});

/*================ STATISTIQUES ================*/
export async function getFirebaseStat(statName, defaultValue = 0) {
    await waitForFirebase();
    const { _ref, _get } = getDbTools();
    if (!navigator.onLine || !database || !_get) return defaultValue;

    try {
        console.log("📡 Récupération de la stat:", statName);
        const snapshot = await _get(_ref(database, `stats/${statName}`));
        return snapshot.exists() ? snapshot.val() : defaultValue;
    } catch (e) { return defaultValue; }
}

export async function setFirebaseStat(statName, value) {
    await waitForFirebase();
    const { _ref, _set } = getDbTools();
    if (!navigator.onLine || !database || !_set) return false;

    try {
        await _set(_ref(database, `stats/${statName}`), value);
        return true;
    } catch (e) { return false; }
}

export async function incrementFirebaseStat(statName, incrementBy = 1) {
    await waitForFirebase();
    const { _ref, _run } = getDbTools();
    if (!navigator.onLine || !database || !_run) return null;

    try {
        const statRef = _ref(database, `stats/${statName}`);
        const { committed, snapshot } = await _run(statRef, (current) => (current || 0) + incrementBy);
        return committed ? snapshot.val() : null;
    } catch (e) { return null; }
}

/*================ RATING GAMES ================*/
export function listenToRatingChanges(gameId) {
    const { _ref, _onValue } = getDbTools();
    if (!navigator.onLine || !database || !_onValue) return;

    const ratingRef = _ref(database, `ratings/${gameId}`);
    _onValue(ratingRef, (snapshot) => {
        const data = snapshot.val();
        if (data) updateRatingDisplay(gameId, data);
    });
}

export async function getRating(gameId) {
    await waitForFirebase();
    const { _ref, _get } = getDbTools();
    if (navigator.onLine && database && _get) {
        try {
            const snapshot = await _get(_ref(database, `ratings/${gameId}`));
            if (snapshot.exists()) return snapshot.val();
        } catch (e) { console.warn("Fallback local rating"); }
    }
    return getLocalRating(gameId);
}

export async function saveRating(gameId, ratingData) {
    saveLocalRating(gameId, ratingData);
    await waitForFirebase();
    const { _ref, _set } = getDbTools();
    if (navigator.onLine && database && _set) {
        try {
            await _set(_ref(database, `ratings/${gameId}`), ratingData);
        } catch (e) { return false; }
    }
    return true;
}

// Fallback: Obtenir depuis localStorage
export function getLocalRating(gameId) {
    const ratings = JSON.parse(localStorage.getItem("gameRatings") || "{}");
    return ratings[gameId] || { total: 0, count: 0 };
}

// Obtenir la note de l'utilisateur
export function getUserRating(gameId) {
    const userRatings = JSON.parse(localStorage.getItem("userRatings") || "{}");
    return userRatings[gameId] || null;
}

// Fallback: Sauvegarder en local
export function saveLocalRating(gameId, ratingData) {
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
export function saveUserRating(gameId, rating) {
    const userRatings = JSON.parse(localStorage.getItem("userRatings") || "{}");
    userRatings[gameId] = rating;
    localStorage.setItem("userRatings", JSON.stringify(userRatings));
}

// Calculer la moyenne
export function calculateAverage(total, count) {
    return count > 0 ? (total / count).toFixed(1) : 0;
}

// Mettre à jour l'affichage
export function updateRatingDisplay(gameId, ratingData) {
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
export function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    let html = "";
    for (let i = 0; i < fullStars; i++) html += "★";
    if (hasHalfStar) html += "⯨";
    for (let i = 0; i < emptyStars; i++) html += "☆";

    return html;
}