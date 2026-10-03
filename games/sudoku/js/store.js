// ─── STORE.JS ───────────────────────────────────────────────────────────────
// Tout le Sudoku vit dans UNE seule clé localStorage : "sudoku".
// {
//   v: 1,
//   settings: { noteHelp: true },
//   best:  { easy: ms, medium: ms, ... },
//   games: { easy: { p, s, v, n, t }, ... }   // partie en cours par niveau
// }
// games[niveau] : p = grille initiale, s = solution, v = valeurs posées
// (chaînes de 81 chiffres, 0 = vide), n = notes (81 masques de bits), t = temps écoulé (ms), e = nombre d'erreurs commises.

const KEY = 'sudoku';
const LEVELS = ['easy', 'medium', 'hard', 'expert'];

function defaults() {
    return { v: 1, settings: { noteHelp: true }, best: {}, games: {} };
}

export function loadStore() {
    const store = defaults();
    try {
        const data = JSON.parse(localStorage.getItem(KEY));
        if (data && typeof data === 'object') {
            Object.assign(store.settings, data.settings || {});
            store.best = data.best || {};
            store.games = data.games || {};
        }
        // Migration des anciennes clés "sudoku_best_<niveau>"
        let migrated = false;
        LEVELS.forEach((d) => {
            const old = localStorage.getItem('sudoku_best_' + d);
            if (old !== null) {
                const n = parseInt(old, 10);
                if (!isNaN(n) && !(store.best[d] <= n)) store.best[d] = n;
                localStorage.removeItem('sudoku_best_' + d);
                migrated = true;
            }
        });
        if (migrated) saveStore(store);
    } catch (e) {
        /* données illisibles : on repart sur les valeurs par défaut */
    }
    return store;
}

export function saveStore(store) {
    try {
        localStorage.setItem(KEY, JSON.stringify(store));
    } catch (e) {
        /* stockage plein ou indisponible : le jeu continue sans sauvegarde */
    }
}

// Relit le stockage avant d'écrire, pour ne pas écraser les changements faits dans un autre onglet
export function updateStore(fn) {
    const store = loadStore();
    fn(store);
    saveStore(store);
    return store;
}
