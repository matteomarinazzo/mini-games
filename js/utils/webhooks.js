// ─────────────────────────────────────────────
// DISCORD WEBHOOKS — Centralized notification system
// ─────────────────────────────────────────────
import { getSecret } from "./secretManager.js";
import { checkRealConnection } from "../network.js";

let webhookUrl = null;
let feedbackWebhookUrl = null;
let cachedVersion = null;

const DEFAULT_FEEDBACK_WEBHOOK_URL = "https://discord.com/api/webhooks/1563874719416066099/oyfOLmNojezSJ4o1S5i7TT9Rhu4XmVfsrs8NXbpSJ4lIR2n8-LnnAY3UjkJgxOz31n07";

/**
 * Récupère la version actuelle de l'application depuis versions.json.
 */
export async function getAppVersion() {
    if (cachedVersion) return cachedVersion;
    if (typeof document !== 'undefined') {
        const el = document.getElementById('app-version');
        if (el && el.textContent && el.textContent.trim()) {
            cachedVersion = el.textContent.trim();
            return cachedVersion;
        }
    }
    try {
        const url = new URL('../../assets/data/versions.json', import.meta.url);
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data?.currentVersion) {
                cachedVersion = data.currentVersion;
                return cachedVersion;
            }
        }
    } catch (e) {
        // Ignorer l'erreur réseau éventuelle
    }
    return cachedVersion || "1.43.2026-10-23";
}

/**
 * Récupère l'UID Firebase Auth de l'utilisateur connecté (anonyme ou non).
 * Retourne "unknown" si Firebase n'est pas prêt.
 */
export async function getFirebaseUid() {
    try {
        const fbConfig = await import("../config/firebase-config.js");
        await fbConfig.firebaseReady;
        return fbConfig.auth?.currentUser?.uid || "anonymous";
    } catch {
        return "unknown";
    }
}

/**
 * Envoie un message texte au webhook Discord principal.
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

/**
 * Envoie une notification structurée au webhook Discord Feedback.
 * Supporte : 'feedback', 'remind_later', 'never_ask'.
 */
export async function sendFeedbackNotification({ action, rating = 0, message = "" } = {}) {
    try {
        const isOnline = await checkRealConnection();
        if (!isOnline) return false;

        if (!feedbackWebhookUrl) {
            feedbackWebhookUrl = (await getSecret("DISCORD_FEEDBACK_WEBHOOK_URL")) || DEFAULT_FEEDBACK_WEBHOOK_URL;
        }
        if (!feedbackWebhookUrl) return false;

        const uid = await getFirebaseUid();
        const userName = localStorage.getItem("mg_player_name") || "Anonyme";
        const version = await getAppVersion();
        const page = document.title || location.pathname;
        const totalMin = localStorage.getItem("mg_stat_play_time_min") || "0";
        const timeStr = `${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`;

        let title = "";
        let color = 0x667eea;
        let description = "";
        const starStr = rating > 0 ? "★".repeat(rating) + "☆".repeat(5 - rating) + ` (${rating}/5)` : "Non noté";

        const fields = [];

        if (action === "feedback") {
            title = `🌟 Feedback Joueur : ${rating}/5 ⭐`;
            color = rating >= 4 ? 0x2ecc71 : (rating === 3 ? 0xf1c40f : 0xe74c3c);
            fields.push({ name: "⭐ Note", value: starStr, inline: true });
            fields.push({ name: "💬 Message", value: message ? `>>> ${message}` : "*(Aucun message)*", inline: false });
        } else if (action === "remind_later") {
            title = "⏰ Feedback : Me le rappeler plus tard";
            color = 0x3498db;
            description = "Le joueur a demandé à être rappelé plus tard.";
        } else if (action === "never_ask") {
            title = "🚫 Feedback : Ne plus jamais demander";
            color = 0x95a5a6;
            description = "Le joueur a cliqué sur « Ne plus jamais me demander ».";
        } else {
            title = "📝 Action Feedback";
            description = `Action : ${action}`;
        }

        fields.push(
            { name: "👤 Joueur", value: userName, inline: true },
            { name: "🆔 UID", value: `\`${uid}\``, inline: true },
            { name: "📦 Version", value: `\`${version}\``, inline: true },
            { name: "⏱️ Temps total joué", value: `${totalMin} min`, inline: true },
            { name: "📄 Page", value: page.length > 50 ? page.substring(0, 47) + "..." : page, inline: true },
            { name: "🕒 Date & Heure", value: timeStr, inline: true }
        );

        const payload = {
            embeds: [{
                title,
                description: description || undefined,
                color,
                fields,
                footer: {
                    text: `Mini-Games Platform • Version ${version}`
                },
                timestamp: new Date().toISOString()
            }]
        };

        const res = await fetch(feedbackWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        return res.ok;
    } catch (e) {
        console.warn("Erreur webhook Feedback Discord :", e);
        return false;
    }
}

// ─────────────────────────────────────────────
// ÉVÉNEMENTS SPÉCIFIQUES
// ─────────────────────────────────────────────

/**
 * Appelée chaque minute par countPlayedTime.
 * Inclut l'UID Firebase, le nom et la version pour identifier l'utilisateur.
 */
export async function notifyHeartbeat() {
    const uid = await getFirebaseUid();
    const userName = localStorage.getItem("mg_player_name") || "Anonyme";
    const version = await getAppVersion();
    const page = document.title || location.pathname;
    await sendDiscordMessage(
        `⏱️ **+1 min Jouée**\n👤 UID : \`${uid}\`\n👤 Nom : \`${userName}\`\n📦 Version : \`${version}\`\n📄 Page : \`${page}\`\n🕒 Heure : ${new Date().toLocaleTimeString()}\n_ _`
    );
}

/**
 * Appelée lorsqu'un nouveau joueur est détecté.
 */
export async function notifyNewPlayer() {
    const uid = await getFirebaseUid();
    const userName = localStorage.getItem("mg_player_name") || "Anonyme";
    const version = await getAppVersion();
    await sendDiscordMessage(
        `🆕 **Nouveau joueur !**\n👤 UID : \`${uid}\`\n👤 Nom : \`${userName}\`\n📦 Version : \`${version}\`\n🕒 Heure : ${new Date().toLocaleTimeString()}\n_ _`
    );
}

/**
 * Appelée quand un joueur clique sur un jeu.
 */
export async function notifyGameLaunch(gameId, gameName) {
    const uid = await getFirebaseUid();
    const userName = localStorage.getItem("mg_player_name") || "Anonyme";
    const version = await getAppVersion();
    await sendDiscordMessage(
        `🎮 **Lancement : ${gameName || gameId}**\n👤 UID : \`${uid}\`\n👤 Nom : \`${userName}\`\n📦 Version : \`${version}\`\n🕒 Heure : ${new Date().toLocaleTimeString()}\n_ _`
    );
}

/**
 * Appelée quand un joueur revient au menu principal.
 */
export async function notifyBackToHome() {
    const uid = await getFirebaseUid();
    const userName = localStorage.getItem("mg_player_name") || "Anonyme";
    const version = await getAppVersion();
    await sendDiscordMessage(
        `🏠 **Retour à l'Accueil**\n👤 UID : \`${uid}\`\n👤 Nom : \`${userName}\`\n📦 Version : \`${version}\`\n🕒 Heure : ${new Date().toLocaleTimeString()}\n_ _`
    );
}

/**
 * Appelée quand un joueur ouvre la page About.
 */
export async function notifyAboutVisit() {
    const uid = await getFirebaseUid();
    const userName = localStorage.getItem("mg_player_name") || "Anonyme";
    const version = await getAppVersion();
    await sendDiscordMessage(
        `ℹ️ **Visite page À propos**\n👤 UID : \`${uid}\`\n👤 Nom : \`${userName}\`\n📦 Version : \`${version}\`\n🕒 Heure : ${new Date().toLocaleTimeString()}\n_ _`
    );
}
