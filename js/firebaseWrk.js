// firebaseWrk.js
import { database } from "./config/firebase-config.js";
import { ref, get, set, runTransaction } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

export async function getFirebaseStat(statName, defaultValue = 0) {
    try {
        const snapshot = await get(ref(database, `stats/${statName}`));
        return snapshot.exists() ? snapshot.val() : defaultValue;
    } catch (e) {
        console.error(`Erreur lecture ${statName}:`, e);
        return defaultValue;
    }
}

export async function setFirebaseStat(statName, value) {
    try {
        await set(ref(database, `stats/${statName}`), value);
        return true;
    } catch (e) {
        console.error(`Erreur écriture ${statName}:`, e);
        return false;
    }
}

export async function incrementFirebaseStat(statName, incrementBy = 1) {
    try {
        const statRef = ref(database, `stats/${statName}`);
        const { committed, snapshot } = await runTransaction(statRef, (current) => (current || 0) + incrementBy);
        if (committed) return snapshot.val();
        return null;
    } catch (e) {
        console.error(`Erreur incrémentation ${statName}:`, e);
        return null;
    }
}
