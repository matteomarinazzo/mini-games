// ─── MAPS.JS ────────────────────────────────────────────────────────────────
// Cartes = masque de cellules jouables sur une grille carrée size×size.
// La première carte (prix 0) est la carte de départ, toujours disponible.
// Les autres s'achètent en boutique (achat valable pour UNE partie).

export const MAPS = [
    { id: 'circle', name: 'Arène', size: 90, shape: 'fatcross', price: 0 },
    { id: 'mini', name: 'Mini-arène', size: 60, shape: 'fatcross', price: 80 },
    { id: 'disc', name: 'Disque', size: 80, shape: 'round', price: 150 },
    { id: 'square', name: 'Carré', size: 76, shape: 'square', price: 200 },
    { id: 'octagon', name: 'Octogone', size: 90, shape: 'octagon', price: 250 },
    { id: 'diamond', name: 'Étoile', size: 110, shape: 'star', price: 350 },
    { id: 'triangle', name: 'Triangle', size: 100, shape: 'triangle', price: 400 },
    { id: 'cross', name: 'Croix', size: 100, shape: 'cross', price: 500 },
    { id: 'hourglass', name: 'Sablier', size: 100, shape: 'hourglass', price: 600 },
    { id: 'dumbbell', name: 'Haltère', size: 110, shape: 'dumbbell', price: 700 },
    { id: 'hshape', name: 'Lettre H', size: 90, shape: 'hshape', price: 800 },
    { id: 'ring', name: 'Anneau', size: 100, shape: 'square_ring', price: 1000 },
    { id: 'donut', name: 'Donut', size: 110, shape: 'donut', price: 1200 },
    { id: 'xshape', name: 'Croix en X', size: 110, shape: 'xshape', price: 1400 },
    { id: 'islands', name: 'Archipel', size: 110, shape: 'islands', price: 1700 },
    { id: 'giant', name: 'Colosse', size: 130, shape: 'fatcross', price: 2000 },
];

// Construit le masque : ok[i] = 1 si la cellule i (= y*size + x) est jouable.
export function buildMask(map) {
    const N = map.size, c = N / 2;
    const ok = new Uint8Array(N * N);
    let total = 0;
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            const dx = x + 0.5 - c, dy = y + 0.5 - c;      // centre de la cellule, repère centré
            const d = Math.hypot(dx, dy);
            let inside = false;
            switch (map.shape) {
                case 'fatcross': {
                    const cut = N * 0.2;
                    inside = !(
                        (x < cut && y < cut) || (x >= N - cut && y < cut) ||
                        (x < cut && y >= N - cut) || (x >= N - cut && y >= N - cut)
                    );
                    break;
                }
                case 'square': inside = true; break;
                case 'round': inside = d <= c - 0.3; break;
                case 'octagon': inside = Math.abs(dx) + Math.abs(dy) <= c * 1.4; break;
                case 'triangle': inside = Math.abs(dx) <= (y / N) * c * 0.95 + 1; break;           // pointe en haut
                case 'hourglass': inside = Math.abs(dx) <= Math.abs(dy) * 0.9 + N * 0.1; break;    // deux triangles
                case 'dumbbell': {
                    const r = N * 0.26, o = N * 0.24;
                    inside = (dx + o) ** 2 + dy ** 2 <= r * r || (dx - o) ** 2 + dy ** 2 <= r * r || (Math.abs(dy) <= N * 0.08 && Math.abs(dx) <= o);
                    break;
                }
                case 'hshape': inside = Math.abs(dx) >= N * 0.22 || Math.abs(dy) <= N * 0.12; break;
                case 'donut': inside = d <= c - 0.3 && d >= N * 0.22; break;
                case 'xshape': inside = Math.abs(Math.abs(dx) - Math.abs(dy)) <= N * 0.13; break;
                case 'islands': {                                  // 4 îles + île centrale, reliées par des ponts
                    const ax = Math.abs(dx), ay = Math.abs(dy);
                    const isl = ax >= N * 0.2 && ay >= N * 0.2 && ax <= N * 0.46 && ay <= N * 0.46;
                    const bridgeH = ay <= N * 0.06 && ax <= N * 0.46;                       // pont horizontal central
                    const bridgeV = ax >= N * 0.28 && ax <= N * 0.38 && ay <= N * 0.46;    // 2 ponts verticaux (traversent les îles)
                    inside = isl || bridgeH || bridgeV || (ax <= N * 0.14 && ay <= N * 0.14);
                    break;
                }
                case 'star': {
                    inside = (Math.abs(dx) <= N * 0.1 && Math.abs(dy) <= N * 0.45) ||
                        (Math.abs(dx) <= N * 0.45 && Math.abs(dy) <= N * 0.1) ||
                        (Math.abs(dx) <= N * 0.25 && Math.abs(dy) <= N * 0.25);
                    break;
                }
                case 'cross': { const arm = N * 0.2; inside = Math.abs(dx) <= arm || Math.abs(dy) <= arm; break; }
                case 'square_ring': { const inner = N * 0.2; inside = !(Math.abs(dx) <= inner && Math.abs(dy) <= inner); break; }
            }
            if (inside) { ok[y * N + x] = 1; total++; }
        }
    }
    return { W: N, H: N, ok, total };
}
