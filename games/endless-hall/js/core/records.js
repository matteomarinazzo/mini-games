import { REC_KEY } from './data.js';
import { validTime, MESSAGE_MAX } from './world.js';

export const fmt = (ms) => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
export function best() { try { const v = Number(localStorage.getItem(REC_KEY)); return v > 0 ? v : 0; } catch { return 0; } }
export function saveBest(ms) {
    const b = best();
    if (b && ms >= b) return false;
    try { localStorage.setItem(REC_KEY, String(ms)); } catch { /* ignore */ }
    return true;
}
// Dernier record mondial connu (affichage hors ligne)
export function worldCache() {
    try {
        const j = JSON.parse(localStorage.getItem(REC_KEY + '_world'));
        return j && validTime(j.value) ? { value: j.value, message: typeof j.message === 'string' ? j.message.slice(0, MESSAGE_MAX) : '' } : null;
    } catch { return null; }
}
export function setWorldCache(rec) {
    try { if (rec) localStorage.setItem(REC_KEY + '_world', JSON.stringify(rec)); else localStorage.removeItem(REC_KEY + '_world'); } catch { /* ignore */ }
}
/** Écrit un record dans sa carte, avec le message en dessous. */
export function renderWorld(valueEl, rec) {
    valueEl.textContent = rec ? fmt(rec.value) : '–';
    const card = valueEl.closest('.record-card');
    card.querySelectorAll('.rc-message').forEach((m) => m.remove());
    if (rec && rec.message) { const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${rec.message} »`; card.appendChild(m); }
}
