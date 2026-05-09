import { database, auth, getRef, getGet, getSet, getRunTransaction, getOnValue, firebaseReady, getUpdate, getRemove } from "./config/firebase-config.js";
import { checkRealConnection } from "./network.js";
import { checkAndUnlockBadges } from "./utils/badges.js";

// Attendre que Firebase soit initialisÃ© avant de faire quoi que ce soit
async function waitForFirebase() {
    await firebaseReady;
}

// Fonction utilitaire pour Ã©viter de rÃ©pÃ©ter les vÃ©rifications
const getDbTools = () => ({
    _ref: getRef(),
    _get: getGet(),
    _set: getSet(),
    _run: getRunTransaction(),
    _onValue: getOnValue(),
    _update: getUpdate(),
    _remove: getRemove(),
});

/*================ STATISTIQUES ================*/
export async function getFirebaseStat(statName, defaultValue = 0) {
    await waitForFirebase();
    const { _ref, _get } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_get) return defaultValue;

    try {
        console.log("ðŸ“¡ RÃ©cupÃ©ration de la stat:", statName);
        const snapshot = await _get(_ref(database, `stats/${statName}`));
        return snapshot.exists() ? snapshot.val() : defaultValue;
    } catch (e) { return defaultValue; }
}

export async function setFirebaseStat(statName, value) {
    await waitForFirebase();
    const { _ref, _set } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_set) return false;

    try {
        await _set(_ref(database, `stats/${statName}`), value);
        return true;
    } catch (e) { return false; }
}

export async function incrementFirebaseStat(statName, incrementBy = 1) {
    await waitForFirebase();
    const { _ref, _run } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_run) return null;

    try {
        const statRef = _ref(database, `stats/${statName}`);
        const { committed, snapshot } = await _run(statRef, (current) => (current || 0) + incrementBy);
        return committed ? snapshot.val() : null;
    } catch (e) { return null; }
}

/*================ RATING GAMES ================*/
export async function listenToRatingChanges(gameId) {
    const { _ref, _onValue } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_onValue) return;

    const ratingRef = _ref(database, `ratings/${gameId}`);
    _onValue(ratingRef, (snapshot) => {
        const data = snapshot.val();
        if (data) updateRatingDisplay(gameId, data);
    });
}

export async function getRating(gameId) {
    await waitForFirebase();
    const { _ref, _get } = getDbTools();
    const isOnline = await checkRealConnection();
    if (isOnline && database && _get) {
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
    const isOnline = await checkRealConnection();
    if (isOnline && database && _set) {
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
    // dÃ©clenche la vÃ©rification des badges
    checkAndUnlockBadges();
}

// Calculer la moyenne
export function calculateAverage(total, count) {
    return count > 0 ? (total / count).toFixed(1) : 0;
}

// Mettre Ã  jour l'affichage
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

// GÃ©nÃ©rer les Ã©toiles
export function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    let html = "";
    for (let i = 0; i < fullStars; i++) html += "â˜…";
    if (hasHalfStar) html += "â¯¨";
    for (let i = 0; i < emptyStars; i++) html += "â˜†";

    return html;
}

/*================ ROOMS ================*/
export async function createRoom(gameId, roomData) {
    await waitForFirebase();
    const { _ref, _set, _get } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_set) return false;
    try {
        if (await checkRoomExists(gameId)) return false;

        await _set(_ref(database, `rooms/${gameId}`), roomData);
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function joinRoom(gameId, playerData) {
    await waitForFirebase();
    const { _ref, _set, _get } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_set || !_get) return false;

    try {
        const snapshot = await _get(_ref(database, `rooms/${gameId}`));

        if (!snapshot.exists()) {
            console.log("La room n'existe pas !");
            return false;
        }

        const room = snapshot.val();

        const players = room.players || {};
        const currentCount = Object.keys(players).length;

        // ðŸ”’ EmpÃªcher si la room est pleine
        if (currentCount >= room.numPlayers) {
            console.log("La room est pleine !");
            return false;
        }

        // âœ… Ajouter le joueur
        await _set(
            _ref(database, `rooms/${gameId}/players/${playerData.uid}`),
            playerData
        );

        console.log("Rejoint la room :", gameId, playerData.name);
        return true;

    } catch (e) {
        console.error(e);
        return false;
    }
}



export async function getRoom(gameId) {
    await waitForFirebase();
    const { _ref, _get } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_get) return null;

    try {
        const snapshot = await _get(_ref(database, `rooms/${gameId}`));
        if (snapshot.exists()) {
            return snapshot.val();
        }
        return null;
    } catch (e) {
        console.error(e);
        return null;
    }
}

export async function deleteRoom(gameId) {
    await waitForFirebase();
    const { _ref, _remove } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_remove) return false;

    try {
        await _remove(_ref(database, `rooms/${gameId}`));
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function updateRoom(gameId, roomData) {
    await waitForFirebase();
    const { _ref, _update } = getDbTools();  // âœ… CORRIGÃ‰ ICI
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_update) return false;

    try {
        await _update(_ref(database, `rooms/${gameId}`), roomData);
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export async function listenToRoomChanges(gameId, callback) {
    await waitForFirebase();
    const { _ref, _onValue } = getDbTools();
    if (!navigator.onLine || !database || !_onValue) return;

    const roomRef = _ref(database, `rooms/${gameId}`);
    _onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        callback(data);
    });
}

// utiliitaires
export async function checkRoomExists(gameId) {
    await waitForFirebase();
    const { _ref, _get } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_get) return false;

    try {
        const snapshot = await _get(_ref(database, `rooms/${gameId}`));
        if (snapshot.exists()) {
            return true;
        }
        return false;
    } catch (e) {
        console.error(e);
        return false;
    }
}

/*================ LEADERBOARDS ================*/
export async function setFirebaseLeaderboard(game, stat, score) {
    await waitForFirebase();
    const { _ref, _set } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_set) return false;

    try {
        // score peut Ãªtre un nombre ou un objet { value, message, timestamp ... }
        await _set(_ref(database, `leaderboards/${game}/${stat}`), score);
        return true;
    } catch (e) { return false; }
}

export async function getFirebaseLeaderboard(game, stat, defaultValue = 0) {
    await waitForFirebase();
    const { _ref, _get } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_get) return defaultValue;

    try {
        const snapshot = await _get(_ref(database, `leaderboards/${game}/${stat}`));
        if (snapshot.exists()) {
            const val = snapshot.val();
            // Si c'est le nouveau format objet, on renvoie juste la valeur numÃ©rique pour la comparaison
            if (val && typeof val === 'object' && 'value' in val) {
                return val.value;
            }
            return val;
        }
        return defaultValue;
    } catch (e) { return defaultValue; }
}

export async function getFirebaseRecordData(game, stat) {
    await waitForFirebase();
    const { _ref, _get } = getDbTools();
    const isOnline = await checkRealConnection();
    if (!isOnline || !database || !_get) return null;

    try {
        const snapshot = await _get(_ref(database, `leaderboards/${game}/${stat}`));
        return snapshot.exists() ? snapshot.val() : null;
    } catch (e) { return null; }
}

/*================ CLOUD SYNC (localStorage â†” Firebase) ================*/

const SYNC_INTERVAL_MS = 60_000;
const SAVE_PATH = 'saves';
let _syncInterval = null;

const BLACKLIST = new Set([
    'mg_pending_badges',
    'gamesAvailableCount',
    'isAlreadyCounted',
    'homeVisits',
    'google_auto_fc_cmp_setting',
    'mg_cloud_uid',
]);

function _uid() {
    let uid = localStorage.getItem('mg_cloud_uid') || auth?.currentUser?.uid;
    if (!uid) {
        uid = 'mg-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
        localStorage.setItem('mg_cloud_uid', uid);
    }
    return uid;
}

function _sanitizeKey(key) {
    return key.replace(/[./#$[\]]/g, '_');
}

function _readLocalStorage() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (BLACKLIST.has(key)) continue;
        if (key.startsWith('firebase:')) continue;
        try {
            data[_sanitizeKey(key)] = JSON.parse(localStorage.getItem(key));
        } catch {
            data[_sanitizeKey(key)] = localStorage.getItem(key);
        }
    }
    data['__lastSync'] = new Date().toISOString();
    return data;
}

function _applyToLocalStorage(data) {
    for (const [key, value] of Object.entries(data)) {
        if (key === '__lastSync') continue;
        if (BLACKLIST.has(key)) continue;
        try {
            localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        } catch { /* quota dÃ©passÃ© */ }
    }
}

async function _push() {
    const uid = _uid();
    const _ref = getRef();
    const _set = getSet();
    if (!uid || !database || !_ref || !_set) return;
    try {
        await _set(_ref(database, `${SAVE_PATH}/${uid}`), _readLocalStorage());
        console.log('[cloudSync] Push OK');
    } catch (e) {
        console.warn('[cloudSync] Push failed:', e);
    }
}

async function _pullIfNewer() {
    const uid = _uid();
    const _ref = getRef();
    const _get = getGet();
    if (!uid || !database || !_ref || !_get) return;
    try {
        const snapshot = await _get(_ref(database, `${SAVE_PATH}/${uid}`));
        if (!snapshot.exists()) return;

        const remote = snapshot.val();
        const remoteDate = remote['__lastSync'] ? new Date(remote['__lastSync']) : null;
        const localDate = localStorage.getItem('mg_stat_last_session')
            ? new Date(localStorage.getItem('mg_stat_last_session'))
            : null;

        if (remoteDate && (!localDate || remoteDate > localDate)) {
            console.log('[cloudSync] Firebase plus rÃ©cent â†’ pull');
            _applyToLocalStorage(remote);
        } else {
            console.log('[cloudSync] Local plus rÃ©cent â†’ pas de pull');
        }
    } catch (e) {
        console.warn('[cloudSync] Pull failed:', e);
    }
}

/**
 * Push immÃ©diat â€” Ã  appeler aprÃ¨s un badge, un like, un score, etc.
 */
export async function pushNow() {
    await _push();
}

/**
 * Retourne l'UID actuel.
 */
export function getCloudUID() {
    return _uid();
}

/**
 * Importe un UID externe et restaure les donnÃ©es associÃ©es.
 * @param {string} uid
 * @returns {Promise<boolean>}
 */
export async function importUID(uid) {
    const _ref = getRef();
    const _get = getGet();
    if (!uid || !database || !_ref || !_get) return false;
    uid = uid.trim();
    try {
        const snapshot = await _get(_ref(database, `${SAVE_PATH}/${uid}`));
        if (!snapshot.exists()) return false;

        _applyToLocalStorage(snapshot.val());
        localStorage.setItem('mg_cloud_uid', uid);

        clearInterval(_syncInterval);
        _syncInterval = setInterval(_push, SYNC_INTERVAL_MS);

        console.log('[cloudSync] Import UID OK');
        return true;
    } catch (e) {
        console.warn('[cloudSync] Import UID failed:', e);
        return false;
    }
}

