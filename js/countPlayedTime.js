// countPlayedTime.js
import { checkRealConnection } from "./network.js";
import { notifyHeartbeat, notifyNewPlayer } from "./utils/webhooks.js";
import { reportPlayTime } from "./utils/badges.js";
import { updateStreak } from "./profilePanel.js";

console.log("🕒 Compteur de temps initialisé");

// ─── CLÉ LOCALE POUR LE PROFIL ────────────────────────────────────────────────
// Stocke le temps total joué par CE joueur sur CET appareil (en minutes).
// Distinct de "minutesPlayed" qui est le buffer offline Firebase.
const LOCAL_TIME_KEY = 'mg_stat_play_time_min';

function getLocalTotalMinutes() {
    return parseInt(localStorage.getItem(LOCAL_TIME_KEY) || '0', 10);
}

function incrementLocalTime() {
    const current = getLocalTotalMinutes();
    const next = current + 1;
    localStorage.setItem(LOCAL_TIME_KEY, next);
    return next;
}

// ─── COMPTEUR ─────────────────────────────────────────────────────────────────
let counterInterval = null;

async function incrementTime() {
    try {
        // 1. Incrémenter le temps local du joueur (toujours, online ou non)
        const totalMin = incrementLocalTime();

        // 2. Notifier le système de badges (vérifie les conditions de temps)
        reportPlayTime(totalMin);

        // 3. Sync Firebase si en ligne
        const isOnline = await checkRealConnection();

        if (isOnline) {
            const { incrementFirebaseStat, pushNow } = await import("./firebaseWrk.js");

            // Envoyer d'abord les minutes stockées localement (offline buffer)
            let incrementBy = Number(localStorage.getItem("minutesPlayed") || 0);
            if (incrementBy > 0) {
                await incrementFirebaseStat("totalMinutesPlayed", incrementBy);
                console.log(`✅ Minutes locales synchronisées sur Firebase (${incrementBy} minutes)`);
                localStorage.removeItem("minutesPlayed");
            }

            // Envoyer 1 minute en direct
            const result = await incrementFirebaseStat("totalMinutesPlayed");
            await notifyHeartbeat();
            if (result) console.log("✅ Minute synchronisée sur Firebase");

            // Détecter si nouveau joueur
            if (!localStorage.getItem("isAlreadyCounted")) {
                console.log("Nouvelle connexion");
                localStorage.setItem("isAlreadyCounted", true);
                localStorage.setItem("isNewPlayer", true);
                await notifyNewPlayer();
            }
            if (localStorage.getItem("isNewPlayer")) {
                await incrementFirebaseStat("totalPlayers");
                localStorage.removeItem("isNewPlayer");
            }

            pushNow();

        } else {
            // Stocker dans le buffer offline Firebase
            let minutesPlayed = Number(localStorage.getItem("minutesPlayed") || 0);
            minutesPlayed++;
            localStorage.setItem("minutesPlayed", minutesPlayed);
            console.log("📡 Hors-ligne : minute jouée stockée localement.");
        }
    } catch (e) {
        console.warn("⚠️ Échec synchro temps (Firebase indisponible)", e);
        // Toujours incrémenter localement même si Firebase plante
        incrementLocalTime();
    }
}

// ─── START / STOP ─────────────────────────────────────────────────────────────
function startCounter() {
    if (!counterInterval) {
        counterInterval = setInterval(incrementTime, 60000);
        console.log("▶️ Compteur démarré");
    }
}

function stopCounter() {
    if (counterInterval) {
        clearInterval(counterInterval);
        counterInterval = null;
        console.log("⏸ Compteur mis en pause (onglet caché)");
    }
}

// ─── VISIBILITÉ ───────────────────────────────────────────────────────────────
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        stopCounter();
    } else {
        startCounter();
    }
});

if (!document.hidden) startCounter();

// ─── ORIENTATION ──────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("portrait").catch(() => { });
    }
});

export { incrementTime, startCounter, stopCounter };