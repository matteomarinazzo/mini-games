/**
 * Vérifie la connexion au serveur en testant l'index.html
 * du dossier courant.
 *
 * @returns {Promise<boolean>}
 */
export async function checkRealConnection() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        return false;
    }

    const pingUrl = new URL("./index.html", window.location.href);
    pingUrl.searchParams.set("ping", Date.now().toString());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
        const response = await fetch(pingUrl, {
            method: "HEAD",
            cache: "no-store",
            signal: controller.signal
        });

        // Un statut HTTP en erreur ou la réponse hors ligne du Service Worker
        // signifie que le serveur n'est pas joignable correctement.
        return response.ok && !response.headers.has("X-Offline");
    } catch (error) {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}