// Sauvegarde : { done:[niveaux réussis], tries:{ n: nombre d'échecs cumulés } } (numéros de niveaux globaux)
import { WORLDS, worldOf } from './levels/manifest.js';
const K = 'at-your-own-risk';
const get = () => {
    try {
        const v = JSON.parse(localStorage.getItem(K));
        if (Array.isArray(v)) return { done: v, tries: {} };      // migration ancien format
        return { done: v?.done || [], tries: v?.tries || {} };
    } catch { return { done: [], tries: {} }; }
};
const set = d => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { } };
export const isDone = n => get().done.includes(n);
export const markDone = n => { const d = get(); if (!d.done.includes(n)) { d.done.push(n); set(d); } };
export const getTries = n => get().tries[n] || 0;
export const addTry = n => { const d = get(); d.tries[n] = (d.tries[n] || 0) + 1; set(d); return d.tries[n]; };

// Tous les niveaux du monde w (index) sont-ils réussis ?
export const worldDone = w => { const d = get().done, W = WORLDS[w]; for (let i = W.first; i <= W.last; i++) if (!d.includes(i)) return false; return true; };
// Niveau jouable ? Monde non publié = non. 1er niveau d'un monde = monde précédent entièrement fini. Sinon = niveau précédent réussi.
export const unlocked = n => {
    const w = worldOf(n), W = WORLDS[w];
    if (!W || !W.released) return false;
    if (n === W.first) return w === 0 || worldDone(w - 1);
    return isDone(n - 1);
};
