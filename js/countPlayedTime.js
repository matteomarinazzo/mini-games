// countPlayedTime.js
import { checkRealConnection } from "./network.js";
console.log("🕒 Compteur de temps initialisé");

setInterval(async () => {
    // 1. On vérifie d'abord si on a internet SANS importer Firebase
    const isOnline = await checkRealConnection();
    if (!isOnline) {
        console.log("📡 Hors-ligne : minute jouée non synchronisée.");
        return;
    }

    try {
        // 2. On n'importe Firebase que SI on est en ligne et SEULEMENT maintenant
        const { incrementFirebaseStat } = await import("./firebaseWrk.js");

        const result = await incrementFirebaseStat("totalMinutesPlayed");

        if (result) {
            console.log("✅ Minute synchronisée sur Firebase");
        }
    } catch (e) {
        // Si l'import ou la mise à jour échoue (ex: micro-coupure)
        console.warn("⚠️ Échec synchro temps (Firebase indisponible)");
    }
}, 60000);
