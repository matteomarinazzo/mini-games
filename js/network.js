/**
 * Vérifie si le serveur qui héberge la page répond.
 * La requête reste sur la même origine que la page courante.
 *
 * @returns {Promise<boolean>}
 */
export async function checkRealConnection() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        return false;
    }

    const pingUrl = new URL(window.location.href);
    pingUrl.searchParams.set("ping", Date.now().toString());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
        const response = await fetch(pingUrl, {
            method: "HEAD",
            cache: "no-store",
            signal: controller.signal
        });

        return response.ok && !response.headers.has("X-Offline");
    } catch {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}