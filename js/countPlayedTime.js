// countPlayedTime.js
import { checkRealConnection } from "./network.js";
import { notifyHeartbeat, notifyNewPlayer } from "./utils/webhooks.js";
console.log("🕒 Compteur de temps initialisé");

let counterInterval = null;

// Fonction principale d'incrément / synchro
async function incrementTime() {
    try {
        const isOnline = await checkRealConnection();

        if (isOnline) {
            // Import Firebase seulement si on est en ligne
            const { incrementFirebaseStat } = await import("./firebaseWrk.js");

            // Envoyer d'abord les minutes stockées localement
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

            // détecter si nouveau joueur 
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

        } else {
            // Sinon stocker localement
            let minutesPlayed = Number(localStorage.getItem("minutesPlayed") || 0);
            minutesPlayed++;
            localStorage.setItem("minutesPlayed", minutesPlayed);
            console.log("📡 Hors-ligne : minute jouée stockée localement.");
        }
    } catch (e) {
        console.warn("⚠️ Échec synchro temps (Firebase indisponible)", e);
    }
}

// Démarrer le compteur
function startCounter() {
    if (!counterInterval) {
        counterInterval = setInterval(incrementTime, 60000); // toutes les minutes
        console.log("▶️ Compteur démarré");
    }
}

// Arrêter le compteur
function stopCounter() {
    if (counterInterval) {
        clearInterval(counterInterval);
        counterInterval = null;
        console.log("⏸ Compteur mis en pause (onglet caché)");
    }
}

// Contrôle de visibilité
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        stopCounter();
    } else {
        startCounter();
    }
});

// Lancer au chargement si la page est visible
if (!document.hidden) startCounter();

// TRICHE : bloquer l'orientation sur toutes les pages
document.addEventListener("DOMContentLoaded", () => {
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("portrait").catch(() => { });
    }
});

// Export pour utilisation ailleurs si besoin
export { incrementTime, startCounter, stopCounter };