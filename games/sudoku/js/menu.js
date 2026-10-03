// ─── MENU.JS ────────────────────────────────────────────────────────────────
// Choix de la difficulté, meilleurs temps, parties en cours et réglages.
// Tout est lu/écrit dans la clé localStorage "sudoku" (voir store.js).
import { loadStore, updateStore } from './store.js';

const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];

function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function render() {
    const store = loadStore();

    DIFFICULTIES.forEach((d) => {
        const bestEl = document.querySelector(`[data-best="${d}"]`);
        const best = parseInt(store.best[d], 10);
        if (bestEl) bestEl.textContent = isNaN(best) ? '—' : formatTime(best);

        // Indique une partie en cours sur la carte du niveau
        const card = document.querySelector(`.diff-card[data-difficulty="${d}"]`);
        const desc = card && card.querySelector('.diff-desc');
        if (!desc) return;
        desc.querySelector('.diff-resume')?.remove();
        const game = store.games[d];
        if (game && typeof game.t === 'number') {
            const tag = document.createElement('span');
            tag.className = 'diff-resume';
            tag.textContent = `▶ En cours · ${formatTime(game.t)}`;
            desc.appendChild(tag);
        }
    });

    document.getElementById('noteHelp').checked = store.settings.noteHelp !== false;
}

function launchGame(difficulty) {
    const params = new URLSearchParams({ difficulty });
    window.location.href = `game.html?${params.toString()}`;
}

document.getElementById('diffList').addEventListener('click', (e) => {
    const card = e.target.closest('.diff-card');
    if (card) launchGame(card.dataset.difficulty);
});

document.getElementById('noteHelp').addEventListener('change', (e) => {
    const checked = e.target.checked;
    updateStore((s) => { s.settings.noteHelp = checked; });
});

// Retour via le bouton "précédent" du navigateur : on relit l'état à jour
window.addEventListener('pageshow', render);

render();
