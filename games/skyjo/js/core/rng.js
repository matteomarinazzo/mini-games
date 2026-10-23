/** RNG seedé (mulberry32). L'état est le champ `rng` (uint32) de l'objet passé : il est sérialisé avec la partie. */
export function next(o) {
    o.rng = (o.rng + 0x6D2B79F5) >>> 0;
    let t = o.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const int = (o, n) => Math.floor(next(o) * n);
export function shuffle(a, o) {
    for (let i = a.length - 1; i > 0; i--) { const j = int(o, i + 1);[a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
