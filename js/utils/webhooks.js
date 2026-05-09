// ─────────────────────────────────────────────
// DISCORD WEBHOOKS — Centralized notification system
// ─────────────────────────────────────────────
import { getSecret } from "./secretManager.js";
import { checkRealConnection } from "../network.js";

let webhookUrl = null;

/**
 * Récupère l'UID Firebase Auth de l'utilisateur connecté (anonyme ou non).
 * Retourne "unknown" si Firebase n'est pas prêt.
 */
async function getFirebaseUid() {
    try {
        const fbConfig = await import("../config/firebase-config.js");
        await fbConfig.firebaseReady;
        return fbConfig.auth?.currentUser?.uid || "anonymous";
    } catch {
        return "unknown";
    }
}

/**
 * Envoie un message texte au webhook Discord.
 */
export async function sendDiscordMessage(content) {
    try {
        const isOnline = await checkRealConnection();
        if (!isOnline) return;

        if (!webhookUrl) {
            webhookUrl = await getSecret("DISCORD_WEBHOOK_URL");
        }
        if (!webhookUrl) return;

        await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content })
        });
    } catch (e) {
        console.warn("Erreur webhook Discord", e);
    }
}

// ─────────────────────────────────────────────
// ÉVÉNEMENTS SPÉCIFIQUES
// ─────────────────────────────────────────────

/**
 * Appelée chaque minute par countPlayedTime.
 * Inclut l'UID Firebase pour identifier l'utilisateur.
 */
export async function notifyHeartbeat() {
    const uid = await getFirebaseUid();
    const userName = localStorage.getItem("mg_player_name") || "Anonyme";
    const page = document.title || location.pathname;
    await sendDiscordMessage(
        `⏱️ **+1 min Jouée**\n👤 UID : \`${uid}\`\n👤 Nom : \`${userName}\`\n📄 Page : \`${page}\`\n🕒 Heure : ${new Date().toLocaleTimeString()}\n_ _`
    );
}

/**
 * Appelée lorsqu'un nouveau joueur est détecté.
 */
export async function notifyNewPlayer() {
    const uid = await getFirebaseUid();
    const userName = localStorage.getItem("mg_player_name") || "Anonyme";
    await sendDiscordMessage(
        `🆕 **Nouveau joueur !**\n👤 UID : \`${uid}\`\n👤 Nom : \`${userName}\`\n🕒 Heure : ${new Date().toLocaleTimeString()}\n_ _`
    );
}

/**
 * Appelée quand un joueur clique sur un jeu.
 */
export async function notifyGameLaunch(gameId, gameName) {
    const uid = await getFirebaseUid();
    const userName = localStorage.getItem("mg_player_name") || "Anonyme";
    await sendDiscordMessage(
        `🎮 **Lancement : ${gameName || gameId}**\n👤 UID : \`${uid}\`\n👤 Nom : \`${userName}\`\n🕒 Heure : ${new Date().toLocaleTimeString()}\n_ _`
    );
}

/**
 * Appelée quand un joueur revient au menu principal.
 */
export async function notifyBackToHome() {
    const uid = await getFirebaseUid();
    const userName = localStorage.getItem("mg_player_name") || "Anonyme";
    await sendDiscordMessage(
        `🏠 **Retour à l'Accueil**\n👤 UID : \`${uid}\`\n👤 Nom : \`${userName}\`\n🕒 Heure : ${new Date().toLocaleTimeString()}\n_ _`
    );
}

/**
 * Appelée quand un joueur ouvre la page About.
 */
export async function notifyAboutVisit() {
    const uid = await getFirebaseUid();
    const userName = localStorage.getItem("mg_player_name") || "Anonyme";
    await sendDiscordMessage(
        `ℹ️ **Visite page À propos**\n👤 UID : \`${uid}\`\n👤 Nom : \`${userName}\`\n🕒 Heure : ${new Date().toLocaleTimeString()}\n_ _`
    );
}
