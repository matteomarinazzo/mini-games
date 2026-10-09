/**
 * Labyrinthe 3D – maze-world.js (V3)
 *
 * Record mondial (Firebase) : logique PURE, le module `firebaseWrk.js` du site est INJECTÉ (`fb`) → testable avec un faux.
 *
 * Données : nœud `leaderboards/maze/time_<taille>` (taille = easy | normal | hard), objet
 *           { value: dixièmes de seconde (entier, PLUS PETIT = MEILLEUR), message: texte ≤ 50, timestamp: ms }.
 * API du site utilisée (lue dans firebaseWrk.js) :
 *   getFirebaseRecordData(jeu, clé)            → objet | valeur | null   (null aussi hors ligne ou en cas d'erreur !)
 *   setFirebaseLeaderboard(jeu, clé, objet)    → true | false            (écrase sans comparer ; ne lève pas d'exception)
 *
 * Conséquences : (1) « null » ne distingue pas « aucun record » de « lecture impossible » → l'appelant doit s'être assuré d'être
 * en ligne (checkRealConnection) ; (2) l'écriture écrase : submitWorld() relit et compare JUSTE avant d'écrire.
 * Aucun contrôle côté serveur n'est possible d'ici : un joueur malveillant peut écrire une fausse valeur (comme dans Ball Rush).
 */
import { LEVEL_IDS, MESSAGE_MAX, validTime } from './maze-storage.js';

export const FB_GAME = 'maze';
export const worldKey = (level) => `time_${level}`;

/** Normalise ce que renvoie Firebase : { value: entier|null, message: string }. Toute valeur invalide → value null. */
export function parseWorld(raw) {
    let value = raw, message = '';
    if (raw && typeof raw === 'object') {
        value = raw.value;
        if (typeof raw.message === 'string') message = raw.message.slice(0, MESSAGE_MAX);
    }
    return { value: validTime(value) ? value : null, message };
}

/** Lit le record mondial d'une taille. `ok` = false si le module est absent ou a levé une exception. */
export async function fetchWorld(fb, level) {
    if (!fb || !LEVEL_IDS.includes(level)) return { ok: false, value: null, message: '' };
    try {
        return { ok: true, ...parseWorld(await fb.getFirebaseRecordData(FB_GAME, worldKey(level))) };
    } catch { return { ok: false, value: null, message: '' }; }
}

/**
 * Tente d'enregistrer un record mondial : relit, compare strictement (tenths < record actuel), puis écrit.
 * @returns {Promise<{written:boolean, beaten:boolean, value:number|null, message:string}>}
 *   written : écriture réussie ; beaten : un meilleur record existait déjà (battu entre-temps) ; value/message : record connu après l'appel
 */
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
