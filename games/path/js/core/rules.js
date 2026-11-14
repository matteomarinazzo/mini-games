/** Chemin – règles du geste, partagées par le jeu et le générateur. Aucune solution n'est lue ici. */
export const COUNT = 10;

/** Indices des voisins en croix, pour une grille n×n. */
export function neighbors(n, i) {
    const r = (i / n) | 0, c = i % n, out = [];
    if (r > 0) out.push(i - n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    if (r < n - 1) out.push(i + n);
    return out;
}

/**
 * Seuls refus du geste : case déjà dans le trait, ou chiffre pris avant son tour.
 * (Hors grille et diagonale sont écartés par `neighbors`.)
 * `lab` : chiffre de chaque case (0 = vide) ; `next` : prochain chiffre à croiser.
 */
export const canEnter = (lab, inTrail, next, i) => !inTrail[i] && (lab[i] === 0 || lab[i] === next);
