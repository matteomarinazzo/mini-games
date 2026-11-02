/**
 * Compte Cible – records : sauvegarde locale (clé unique « target-count ») + record mondial Firebase.
 * Même logique que maze-storage.js / maze-world.js ; `fb` (firebaseWrk.js du site) est injecté.
 * Firebase : leaderboards/target-count/time_<mode> = { value (dixièmes, plus petit = meilleur), message, timestamp }.
 */
export const STORAGE_KEY = 'target-count';
export const FB_GAME = 'target-count';
export const LEVEL_IDS = ['easy', 'medium', 'hard'];
export const DEFAULT_LEVEL = 'easy';
export const MESSAGE_MAX = 50;
const MAX_TENTHS = 24 * 3600 * 10;

export const validTime = (t) => Number.isInteger(t) && t > 0 && t <= MAX_TENTHS;
export const worldKey = (level) => `time_${level}`;

export function defaultData() {
    return { v: 1, level: DEFAULT_LEVEL, best: { easy: null, medium: null, hard: null }, world: { easy: null, medium: null, hard: null } };
}

export function sanitize(raw) {
    const d = defaultData();
    if (!raw || typeof raw !== 'object') return d;
    if (LEVEL_IDS.includes(raw.level)) d.level = raw.level;
    if (raw.best && typeof raw.best === 'object') {
        for (const id of LEVEL_IDS) if (validTime(raw.best[id])) d.best[id] = raw.best[id];
    }
    if (raw.world && typeof raw.world === 'object') {
        for (const id of LEVEL_IDS) {
            const w = raw.world[id];
            if (w && typeof w === 'object' && validTime(w.value)) {
                d.world[id] = { value: w.value, message: typeof w.message === 'string' ? w.message.slice(0, MESSAGE_MAX) : '' };
            }
        }
    }
    return d;
}

export function loadData(storage) {
    try {
        const txt = storage ? storage.getItem(STORAGE_KEY) : null;
        return sanitize(txt ? JSON.parse(txt) : null);
    } catch { return defaultData(); }
}

export function mergeBest(data, other) {
    for (const id of LEVEL_IDS) {
        const t = other.best[id];
        if (t !== null && (data.best[id] === null || t < data.best[id])) data.best[id] = t;
    }
}

export function saveData(storage, data) {
    try {
        mergeBest(data, loadData(storage));
        storage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
    } catch { return false; }
}

export function recordTime(data, level, tenths) {
    if (!LEVEL_IDS.includes(level) || !validTime(tenths)) return { isRecord: false, previous: null };
    const previous = data.best[level];
    if (previous !== null && tenths >= previous) return { isRecord: false, previous };
    data.best[level] = tenths;
    return { isRecord: true, previous };
}

export function parseWorld(raw) {
    let value = raw, message = '';
    if (raw && typeof raw === 'object') {
        value = raw.value;
        if (typeof raw.message === 'string') message = raw.message.slice(0, MESSAGE_MAX);
    }
    return { value: validTime(value) ? value : null, message };
}

export async function fetchWorld(fb, level) {
    if (!fb || !LEVEL_IDS.includes(level)) return { ok: false, value: null, message: '' };
    try {
        return { ok: true, ...parseWorld(await fb.getFirebaseRecordData(FB_GAME, worldKey(level))) };
    } catch { return { ok: false, value: null, message: '' }; }
}

export async function submitWorld(fb, level, tenths, message = '') {
    const fail = { written: false, beaten: false, value: null, message: '' };
    if (!fb || !LEVEL_IDS.includes(level) || !validTime(tenths)) return fail;
    const cur = await fetchWorld(fb, level);
    if (!cur.ok) return fail;
    if (cur.value !== null && tenths >= cur.value) return { written: false, beaten: true, value: cur.value, message: cur.message };
    const msg = String(message || '').trim().slice(0, MESSAGE_MAX);
    try {
        const ok = (await fb.setFirebaseLeaderboard(FB_GAME, worldKey(level), { value: tenths, message: msg, timestamp: Date.now() })) === true;
        return ok ? { written: true, beaten: false, value: tenths, message: msg } : { ...fail, value: cur.value, message: cur.message };
    } catch { return { ...fail, value: cur.value, message: cur.message }; }
}
