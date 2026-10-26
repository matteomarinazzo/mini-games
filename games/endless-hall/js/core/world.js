// Record mondial (Firebase via firebaseWrk.js du site, import dynamique ; hors ligne toléré).
// Nœud : leaderboards/endless_hall/time = { value: ms (entier, plus petit = meilleur), message ≤ 50, timestamp }.
// getFirebaseRecordData(jeu, clé) → objet | null ; setFirebaseLeaderboard(jeu, clé, objet) → true | false (écrase : on relit avant d'écrire).
export const FB_GAME = 'endless_hall', FB_KEY = 'time';
export const MESSAGE_MAX = 50;
const MAX_MS = 24 * 3600 * 1000;
export const validTime = (t) => Number.isInteger(t) && t > 0 && t <= MAX_MS;
export const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

let mods;
/** Renvoie le module firebaseWrk si le site est joignable, sinon null. */
export async function getFb() {
    if (mods === undefined) {
        try {
            const [fb, net] = await Promise.all([import('../../../../js/firebaseWrk.js'), import('../../../../js/network.js')]);
            mods = { fb, net };
        } catch { mods = null; }
    }
    if (!mods) return null;
    try { return (await Promise.race([Promise.resolve(mods.net.checkRealConnection()), wait(2500, false)])) ? mods.fb : null; } catch { return null; }
}

export function parseWorld(raw) {
    let value = raw, message = '';
    if (raw && typeof raw === 'object') { value = raw.value; if (typeof raw.message === 'string') message = raw.message.slice(0, MESSAGE_MAX); }
    return { value: validTime(value) ? value : null, message };
}

export async function fetchWorld(fb) {
    if (!fb) return { ok: false, value: null, message: '' };
    try { return { ok: true, ...parseWorld(await fb.getFirebaseRecordData(FB_GAME, FB_KEY)) }; } catch { return { ok: false, value: null, message: '' }; }
}

/** Relit, compare strictement (ms < record), puis écrit. → { written, beaten, value, message } */
export async function submitWorld(fb, ms, message = '') {
    const fail = { written: false, beaten: false, value: null, message: '' };
    if (!fb || !validTime(ms)) return fail;
    const cur = await fetchWorld(fb);
    if (!cur.ok) return fail;
    if (cur.value !== null && ms >= cur.value) return { written: false, beaten: true, value: cur.value, message: cur.message };
    const msg = String(message || '').trim().slice(0, MESSAGE_MAX);
    try {
        const ok = (await fb.setFirebaseLeaderboard(FB_GAME, FB_KEY, { value: ms, message: msg, timestamp: Date.now() })) === true;
        return ok ? { written: true, beaten: false, value: ms, message: msg } : { ...fail, value: cur.value, message: cur.message };
    } catch { return { ...fail, value: cur.value, message: cur.message }; }
}
