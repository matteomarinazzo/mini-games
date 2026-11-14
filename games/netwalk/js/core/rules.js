/** Netwalk – règles partagées par le jeu et le générateur. Aucune solution n'est lue ici.
 *  Bras : 0 nord, 1 est, 2 sud, 3 ouest ; un câble est un masque de 4 bits (1 << bras). */
export const MIN_SIDE = 5, MAX_SIDE = 50;
export const LEVELS = {
    facile: { label: 'Facile', w: 5, h: 5 },
    moyen: { label: 'Moyen', w: 7, h: 7 },
    difficile: { label: 'Difficile', w: 9, h: 9 },
};
/** Formes fixes : I droit, L coude, T té, E ordinateur (un bras), S serveur. */
export const SHAPES = 'ILTES';
export const BASE = { I: 5, L: 3, T: 7, E: 1 };

export const rotCW = (m) => ((m << 1) | (m >> 3)) & 15;
export const rotCCW = (m) => ((m >> 1) | (m << 3)) & 15;
export const arms = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
export const serverIndex = (w, h) => Math.floor((h - 1) / 2) * w + Math.floor((w - 1) / 2);

/** Forme d'un câble d'après son masque (hors serveur). */
export function shapeOfMask(m) {
    const a = arms(m);
    if (a === 1) return 'E';
    if (a === 3) return 'T';
    if (a === 2) return m === 5 || m === 10 ? 'I' : 'L';
    return null;
}
/** Le masque est-il une orientation possible de cette forme ? */
export function validMask(shape, m) {
    if (!Number.isInteger(m) || m < 1 || m > 15) return false;
    return shape === 'S' ? true : shapeOfMask(m) === shape;
}

/** Voisins : table N×4 (indice, ou -1 hors grille). Avec `wrap`, la grille se referme sur elle-même. */
export function neighborTable(w, h, wrap) {
    const t = new Int16Array(w * h * 4);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        const i = r * w + c, o = i * 4;
        const rn = r > 0 ? r - 1 : wrap ? h - 1 : -1, rs = r < h - 1 ? r + 1 : wrap ? 0 : -1;
        const ce = c < w - 1 ? c + 1 : wrap ? 0 : -1, cw = c > 0 ? c - 1 : wrap ? w - 1 : -1;
        t[o] = rn < 0 ? -1 : rn * w + c;
        t[o + 1] = ce < 0 ? -1 : r * w + ce;
        t[o + 2] = rs < 0 ? -1 : rs * w + c;
        t[o + 3] = cw < 0 ? -1 : r * w + cw;
    }
    return t;
}

/**
 * Courant : recalcul depuis le serveur. Deux bras qui se font face sont reliés.
 * Remplit `lit` (1 = allumée). Renvoie le nombre de cases allumées, de bras dans le vide et de liaisons.
 */
export function analyze(nbr, masks, si, lit, stack) {
    const N = masks.length;
    lit.fill(0); lit[si] = 1;
    let sp = 0, count = 1; stack[sp++] = si;
    while (sp) {
        const u = stack[--sp], mu = masks[u];
        for (let d = 0; d < 4; d++) {
            if (!((mu >> d) & 1)) continue;
            const v = nbr[u * 4 + d];
            if (v >= 0 && !lit[v] && ((masks[v] >> ((d + 2) & 3)) & 1)) { lit[v] = 1; count++; stack[sp++] = v; }
        }
    }
    let dangling = 0, edges = 0;
    for (let i = 0; i < N; i++) {
        const m = masks[i];
        for (let d = 0; d < 4; d++) {
            if (!((m >> d) & 1)) continue;
            const v = nbr[i * 4 + d];
            if (v < 0 || !((masks[v] >> ((d + 2) & 3)) & 1)) dangling++;
            else if (d === 1 || d === 2) edges++;
        }
    }
    return { count, dangling, edges };
}
/** Victoire jugée sur la grille affichée : tout allumé, rien dans le vide, aucune boucle (un seul arbre). */
export const isWon = (r, N) => r.count === N && r.dangling === 0 && r.edges === N - 1;
