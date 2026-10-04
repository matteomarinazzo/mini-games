// ─── STORE.JS ───────────────────────────────────────────────────────────────
// Toutes les données de Rush Highway vivent dans UNE seule clé localStorage : "rush-highway".
// {
//   v: 1,
//   coins: 0,                 // solde de pièces
//   owned: ['city'],          // véhicules possédés (le premier est offert)
//   selected: 'city',         // dernier véhicule choisi
//   locks: { pickup: 3 },     // véhicule bloqué par un malus -> parties restantes
//   best: 0,                  // record de distance (m)
//   runs: 0                   // parties jouées
// }
import { VEHICLES } from './vehicles.js';

const KEY = 'rush-highway';
const IDS = VEHICLES.map((v) => v.id);
const toInt = (n) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

function defaults() {
    return { v: 1, coins: 0, owned: [IDS[0]], selected: IDS[0], locks: {}, best: 0, runs: 0 };
}

// Lecture tolérante : données absentes, invalides, anciennes ou modifiées à la main.
export function loadStore() {
    const s = defaults();
    try {
        const d = JSON.parse(localStorage.getItem(KEY));
        if (d && typeof d === 'object') {
            s.coins = toInt(d.coins);
            s.best = toInt(d.best);
            s.runs = toInt(d.runs);
            if (Array.isArray(d.owned)) s.owned = d.owned.filter((id) => IDS.includes(id));
            if (d.locks && typeof d.locks === 'object') {
                for (const id of Object.keys(d.locks)) {
                    const n = toInt(d.locks[id]);
                    if (IDS.includes(id) && n > 0) s.locks[id] = n;
                }
            }
            if (typeof d.selected === 'string') s.selected = d.selected;
        }
    } catch (e) {
        /* données illisibles : valeurs par défaut */
    }
    s.owned = [...new Set([IDS[0], ...s.owned])];               // le premier véhicule est toujours offert
    if (!s.owned.includes(s.selected) || s.locks[s.selected]) { // sélection invalide ou bloquée
        s.selected = s.owned.find((id) => !s.locks[id]) || IDS[0];
    }
    return s;
}

export function saveStore(store) {
    try {
        localStorage.setItem(KEY, JSON.stringify(store));
    } catch (e) {
        /* stockage plein ou indisponible : le jeu continue sans sauvegarde */
    }
}

// Relit avant d'écrire pour ne pas écraser les changements faits dans un autre onglet
export function updateStore(fn) {
    const store = loadStore();
    fn(store);
    saveStore(store);
    return store;
}