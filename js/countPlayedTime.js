// countPlayedTime.js
import { checkRealConnection } from "./network.js";
console.log("🕒 Compteur de temps initialisé");

setInterval(async () => {
    try {
        const isOnline = await checkRealConnection();
        if (isOnline) {
            //  On n'importe Firebase que SI on est en ligne
            const { incrementFirebaseStat } = await import("./firebaseWrk.js");

            // On ajoute les minutes stockées localement
            let incrementBy = Number(localStorage.getItem("minutesPlayed") || 0);
            console.log(incrementBy);

            if (incrementBy > 0) {
                await incrementFirebaseStat("totalMinutesPlayed", incrementBy);
                console.log("✅ Minutes stockées localement sont synchronisées sur Firebase (" + incrementBy + " minutes)");
                localStorage.removeItem("minutesPlayed");
            }

            const result = await incrementFirebaseStat("totalMinutesPlayed");

            if (result) {
                console.log("✅ Minute synchronisée sur Firebase");
            }
        }
        else {
            // Sinon on stock localement
            let minutesPlayed = Number(localStorage.getItem("minutesPlayed") || 0);
            minutesPlayed++;
            localStorage.setItem("minutesPlayed", minutesPlayed);
            console.log("📡 Hors-ligne : minute jouée stockée localement.");
        }
    } catch (e) {
        // Si l'import ou la mise à jour échoue (ex: micro-coupure)
        console.warn("⚠️ Échec synchro temps (Firebase indisponible)");
    }
}, 60000);
