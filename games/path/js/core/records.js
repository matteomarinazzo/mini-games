/**
 * Chemin – records et réseau, partagés par le menu et le jeu.
 * Local : clés path_facile / path_moyen / path_difficile, en millisecondes (le plus petit temps gagne).
 * Mondial : Firebase du site, même schéma que les autres jeux ; un échec ne bloque jamais rien.
 */
export const SLUG = 'path';
export const LEVEL_IDS = ['facile', 'moyen', 'difficile'];
export const MESSAGE_MAX = 50;
const MIN_MS = 500; // Protection anti-valeur corrompue/impossible
const MAX_MS = 24 * 3600 * 1000;

export const validTime = (t) => Number.isInteger(t) && t >= MIN_MS && t <= MAX_MS;
/** m:ss, pour les records et le chrono. */
export const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
export const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

export function getStore() { try { return window.localStorage; } catch { return null; } }

const bestKey = (l) => `${SLUG}_${l}`;
export function getBest(st, lvl) {
    try { const v = Number(st && st.getItem(bestKey(lvl))); return validTime(v) ? v : null; } catch { return null; }
}
/** Remplace seulement si c'est strictement mieux. Renvoie true si record battu. */
export function setBest(st, lvl, ms) {
    if (!st || !LEVEL_IDS.includes(lvl) || !validTime(ms)) return false;
    const p = getBest(st, lvl);
    if (p !== null && ms >= p) return false;
    try { st.setItem(bestKey(lvl), String(ms)); return true; } catch { return false; }
}

// Dernier record mondial connu (affiché hors ligne)
const worldKey = (l) => `${SLUG}_monde_${l}`;
export function getWorldCache(st, lvl) {
    try {
        const o = JSON.parse(st.getItem(worldKey(lvl)));
        return o && validTime(o.value) ? { value: o.value, message: typeof o.message === 'string' ? o.message.slice(0, MESSAGE_MAX) : '' } : null;
    } catch { return null; }
}
export function setWorldCache(st, lvl, rec) {
    try { if (!st) return; if (rec) st.setItem(worldKey(lvl), JSON.stringify(rec)); else st.removeItem(worldKey(lvl)); } catch { /* quota */ }
}

// ─── Firebase (facultatif) ───
const fbKey = (l) => `time_${l}`;
export async function initOnline() {
    try {
        const [fb, net] = await Promise.all([import('../../../../js/firebaseWrk.js'), import('../../../../js/network.js')]);
        return { fb, net };
    } catch (e) { console.warn('Mode hors ligne :', e); return { fb: null, net: null }; }
}
export async function isOnline(net) {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}
function parseWorld(raw) {
    let value = raw, message = '';
    if (raw && typeof raw === 'object') { value = raw.value; if (typeof raw.message === 'string') message = raw.message.slice(0, MESSAGE_MAX); }
    return { value: validTime(value) ? value : null, message };
}
export async function fetchWorld(fb, lvl) {
    if (!fb || !LEVEL_IDS.includes(lvl)) return { ok: false, value: null, message: '' };
    try { return { ok: true, ...parseWorld(await fb.getFirebaseRecordData(SLUG, fbKey(lvl))) }; } catch { return { ok: false, value: null, message: '' }; }
}
export async function submitWorld(fb, lvl, ms, message = '') {
    const fail = { written: false, beaten: false, value: null, message: '' };
    if (!fb || !LEVEL_IDS.includes(lvl) || !validTime(ms)) return fail;
    const cur = await fetchWorld(fb, lvl);
    if (!cur.ok) return fail;
    if (cur.value !== null && ms >= cur.value) return { written: false, beaten: true, value: cur.value, message: cur.message };
    const msg = String(message || '').trim().slice(0, MESSAGE_MAX);
    try {
        const ok = (await fb.setFirebaseLeaderboard(SLUG, fbKey(lvl), { value: ms, message: msg, timestamp: Date.now() })) === true;
        return ok ? { written: true, beaten: false, value: ms, message: msg } : { ...fail, value: cur.value, message: cur.message };
    } catch { return { ...fail, value: cur.value, message: cur.message }; }
}
