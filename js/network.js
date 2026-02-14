export async function checkRealConnection() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

    //const pingUrl = `/index.html?ping=${Date.now()}`;
    const pingUrl = `/perso/mini-games-plateform/index.html?ping=${Date.now()}`;
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1500);

        const response = await fetch(pingUrl, {
            method: 'HEAD',
            cache: 'no-store',
            signal: id.signal
        });
        clearTimeout(id);

        // SI LE HEADER X-OFFLINE EST PRESENT = ON EST HORS-LIGNE
        if (response.headers.get('X-Offline')) {
            return false;
        }

        return response.ok;
    } catch (err) {
        return false;
    }
}