/**
 * Labyrinthe 3D – maze-size.js (V4)
 *
 * Module PUR (aucun DOM, aucun stockage) : tailles prédéfinies, taille personnalisée et règle « ce niveau a-t-il des records ? ».
 *
 * - Trois tailles prédéfinies (easy / normal / hard) : meilleur temps local + record mondial Firebase (inchangé depuis la V3).
 * - Une taille « custom » : colonnes × lignes libres, bornées. AUCUN record (ni local, ni Firebase), aucune écriture dans
 *   le localStorage : `hasRecords('custom')` vaut false et game.js s'en sert comme unique garde.
 *
 * Bornes : le générateur accepte 2 à 100 (MIN_SIZE / MAX_SIZE de maze-generator.js). On plafonne à 60 côté jeu : au-delà, la vue de
 * dessus de fin de partie devient illisible (≈ 3 px par bloc sur un téléphone en 60×60) et les parties très longues. 60×60 est la
 * plus grande taille déjà couverte par les tests du moteur (maze-engine-tests.js, groupe J).
 */
export const PRESET_SIZES = {
    easy: { cols: 8, rows: 8 },
    normal: { cols: 15, rows: 15 },
    hard: { cols: 25, rows: 25 },
};
export const CUSTOM_ID = 'custom';
export const CUSTOM_MIN = 2;
export const CUSTOM_MAX = 60;
export const CUSTOM_DEFAULT = { cols: 12, rows: 12 };

export const isCustom = (id) => id === CUSTOM_ID;

/** true si le niveau possède un meilleur temps local et un record mondial (= tailles prédéfinies uniquement). */
export const hasRecords = (id) => Object.prototype.hasOwnProperty.call(PRESET_SIZES, id);

/**
 * Convertit une saisie (texte ou nombre) en dimension valide : entier entre CUSTOM_MIN et CUSTOM_MAX.
 * Saisie vide ou non numérique → `fallback`. Décimales tronquées ; hors bornes → ramené à la borne.
 */
export function clampDim(value, fallback) {
    const s = String(value ?? '').trim();
    const n = s === '' ? NaN : Number(s);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.floor(n)));
}

/** Taille personnalisée valide { cols, rows } à partir de deux saisies ; `fallback` fournit les valeurs de repli par dimension. */
export function parseCustom(cols, rows, fallback = CUSTOM_DEFAULT) {
    return { cols: clampDim(cols, fallback.cols), rows: clampDim(rows, fallback.rows) };
}
