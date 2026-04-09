let secretsCache = null;

export async function getSecret(key) {
    if (!secretsCache) {
        try {
            const url = new URL('../config/secrets.json', import.meta.url);
            const response = await fetch(url);
            secretsCache = await response.json();
        } catch (e) {
            console.error("Failed to load secrets:", e);
            secretsCache = {};
        }
    }
    return secretsCache[key];
}