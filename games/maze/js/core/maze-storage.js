/**
 * Labyrinthe 3D – maze-storage.js (V3)
 *
 * Sauvegarde locale du jeu : UNE SEULE clé `localStorage`, « maze » (JSON). Aucune autre clé n'est lue,
 * écrite ni supprimée (les autres jeux, ex. « ball-rush », ne sont jamais touchés).
 *
 * Module pur : l'objet de stockage est INJECTÉ (window.localStorage dans le jeu, un faux objet dans les tests).
 * Toutes les lectures / écritures sont protégées : stockage absent, plein, bloqué ou JSON corrompu → valeurs par défaut,
 * sans exception.
 *
 * Format :  { v: 1, level: 'easy'|'normal'|'hard',
 *             best:  { easy: dixièmes|null, normal: …, hard: … },          // meilleurs temps personnels
 *             world: { easy: {value, message}|null, normal: …, hard: … } } // dernier record mondial CONNU (cache hors ligne)
 * Les temps sont des ENTIERS en dixièmes de seconde (même découpage que l'affichage 0:00.0 : pas d'égalité ambiguë).
 *
 * ⚠ La synchronisation cloud du site (firebaseWrk.js : _push / _pullIfNewer) copie TOUT le localStorage vers Firebase et peut
 *   réécrire la clé « maze » avec la copie distante. Firebase supprime les valeurs `null` : une clé absente doit donc
 *   toujours être lue comme « pas de valeur » (sanitize s'en charge), et saveData() fusionne les meilleurs temps avec ceux
 *   déjà présents dans le stockage pour ne jamais perdre un record récupéré d'un autre appareil.
 */
export const STORAGE_KEY = 'maze';
export const LEVEL_IDS = ['easy', 'normal', 'hard'];
export const DEFAULT_LEVEL = 'normal';
export const MESSAGE_MAX = 50;      // longueur maximale du message d'un record mondial
const MAX_TENTHS = 24 * 3600 * 10;   // 24 h : au-delà, la valeur est considérée comme corrompue

export function defaultData() {
    return { v: 1, level: DEFAULT_LEVEL, best: { easy: null, normal: null, hard: null }, world: { easy: null, normal: null, hard: null } };
}

export const validTime = (t) => Number.isInteger(t) && t > 0 && t <= MAX_TENTHS;

/** Reconstruit un objet propre à partir de n'importe quelle valeur lue (jamais d'exception). */
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

/** Reprend dans `data` les meilleurs temps de `other` s'ils sont meilleurs (ne touche pas au reste). */
export function mergeBest(data, other) {
    for (const id of LEVEL_IDS) {
        const t = other.best[id];
        if (t !== null && (data.best[id] === null || t < data.best[id])) data.best[id] = t;
    }
}

/**
 * Écrit `data` sous la clé « maze ». Fusionne d'abord les meilleurs temps déjà stockés (cf. synchronisation cloud) :
 * `data` est donc mis à jour sur place si le stockage contenait un meilleur temps.
 * @returns {boolean} true si l'écriture a réussi
 */
export function saveData(storage, data) {
    try {
        mergeBest(data, loadData(storage));
        storage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
    } catch { return false; }
}

/**
 * Enregistre un temps (dixièmes de seconde) s'il bat le meilleur de ce niveau. Modifie `data` sur place.
 * @returns {{isRecord:boolean, previous:number|null}}  isRecord = true aussi pour une première partie
 */
export function recordTime(data, level, tenths) {
    if (!LEVEL_IDS.includes(level) || !validTime(tenths)) return { isRecord: false, previous: null };
    const previous = data.best[level];
    if (previous !== null && tenths >= previous) return { isRecord: false, previous };
    data.best[level] = tenths;
    return { isRecord: true, previous };
}
