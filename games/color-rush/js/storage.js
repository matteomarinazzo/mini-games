// ─── STORAGE.JS ─────────────────────────────────────────────────────────────
// Toutes les données de Color Rush vivent dans UNE seule clé localStorage : "color-rush".
// {
//   v: 1,
//   coins: 0,                              // solde de pièces (conservé même en cas de défaite)
//   best: { circle: 12.4, ... },           // meilleur % de surface PAR CARTE
//   map: 'circle',                         // carte sélectionnée dans le menu
//   owned: { skins:[], effects:[], maps:[], gear:[] }, // achats PERMANENTS (skins, effets, cartes, objets)
//   equip: { skin:'cyan', effect:'none', gear:'none' }, // équipement choisi
//   runs: 0                                // parties lancées
// }
// Ce module ne touche JAMAIS aux autres clés du localStorage.
import { MAPS } from './maps.js';
import { SKINS, EFFECTS, GEAR } from './config.js';

export const KEY = 'color-rush';
const CATS = { skins: SKINS, effects: EFFECTS, maps: MAPS, gear: GEAR };
const FREE = { skin: SKINS[0].id, effect: EFFECTS[0].id, map: MAPS[0].id, gear: GEAR[0].id };

const toInt = (n) => (Number.isFinite(n) ? Math.min(1e9, Math.max(0, Math.floor(n))) : 0);
const pct = (n) => (Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n)) * 10) / 10 : 0);

function defaults() {
    return {
        v: 1, coins: 0, best: {}, map: FREE.map, runs: 0,
        owned: { skins: [], effects: [], maps: [], gear: [] },
        equip: { skin: FREE.skin, effect: FREE.effect, gear: FREE.gear },
    };
}

// Un article gratuit (prix 0) est toujours possédé ; les autres doivent figurer dans owned.
export function isOwned(store, cat, item) {
    return item.price === 0 || store.owned[cat].includes(item.id);
}

// Lecture tolérante : données absentes, corrompues, anciennes ou modifiées à la main.
export function loadStore() {
    const s = defaults();
    try {
        const d = JSON.parse(localStorage.getItem(KEY));
        if (d && typeof d === 'object') {
            s.coins = toInt(d.coins);
            s.runs = toInt(d.runs);
            if (d.best && typeof d.best === 'object') {
                for (const m of MAPS) if (m.id in d.best) s.best[m.id] = pct(Number(d.best[m.id]));
            }
            for (const cat of Object.keys(CATS)) {
                const list = d.owned && Array.isArray(d.owned[cat]) ? d.owned[cat] : [];
                s.owned[cat] = [...new Set(list)].filter((id) => CATS[cat].some((it) => it.id === id && it.price > 0));
            }
            if (d.equip && typeof d.equip === 'object') {
                if (typeof d.equip.skin === 'string') s.equip.skin = d.equip.skin;
                if (typeof d.equip.effect === 'string') s.equip.effect = d.equip.effect;
                if (typeof d.equip.gear === 'string') s.equip.gear = d.equip.gear;
            }
            if (typeof d.map === 'string') s.map = d.map;
        }
    } catch (e) { /* données illisibles : valeurs par défaut */ }
    // Équipement / carte invalides ou non possédés → retour à l'article gratuit
    const okItem = (cat, id) => { const it = CATS[cat].find((x) => x.id === id); return it && isOwned(s, cat, it); };
    if (!okItem('skins', s.equip.skin)) s.equip.skin = FREE.skin;
    if (!okItem('effects', s.equip.effect)) s.equip.effect = FREE.effect;
    if (!okItem('gear', s.equip.gear)) s.equip.gear = FREE.gear;
    // La carte sélectionnée peut être verrouillée (affichée dans le menu) mais doit exister
    if (!MAPS.some((m) => m.id === s.map)) s.map = FREE.map;
    return s;
}

export function saveStore(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* stockage plein/indisponible */ }
}

// Relit avant d'écrire (ne pas écraser un autre onglet).
export function updateStore(fn) {
    const store = loadStore();
    fn(store);
    saveStore(store);
    return store;
}

// Les achats sont permanents : cette fonction ne consomme plus rien (gardée pour compatibilité avec game.js).
export function consumePurchases() {
    return loadStore();
}
