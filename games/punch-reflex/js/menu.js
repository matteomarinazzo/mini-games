// ─── MENU.JS ────────────────────────────────────────────────────────────────
// Gestion des modes de jeu, sélection de durée et records rapides
import { playReflexSound } from "../../../js/utils/audio.js";

const LS_CHRONO_BEST = 'punch_reflex_chrono_best';
const LS_SURVIE_BEST = 'punch_reflex_survie_best';
const LS_AVG_REACTION_CHRONO = 'punch_reflex_avg_reaction_chrono';
const LS_AVG_REACTION_SURVIE = 'punch_reflex_avg_reaction_survie';

// ─── DOM ──────────────────────────────────────────────────────────────────────
const playChronoBtn = document.getElementById('playChronoBtn');
const playSurvieBtn = document.getElementById('playSurvieBtn');
const chronoDurations = document.getElementById('chronoDurations');

const menuBestScore = document.getElementById('menuBestScore');
const menuBestSurvie = document.getElementById('menuBestSurvie');
const menuAvgReaction = document.getElementById('menuAvgReaction');

// ─── STATE ────────────────────────────────────────────────────────────────────
let selectedDuration = 30;

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
    // Durée chrono
    chronoDurations.addEventListener('click', (e) => {
        const btn = e.target.closest('.dur-btn');
        if (!btn) return;
        selectedDuration = parseInt(btn.dataset.duration);
        document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        playReflexSound('stop');
    });

    // Lancer Chrono
    playChronoBtn.addEventListener('click', () => {
        playReflexSound('stop');
        setTimeout(() => launchGame('chrono', selectedDuration), 50);
    });

    // Lancer Survie
    playSurvieBtn.addEventListener('click', () => {
        playReflexSound('stop');
        setTimeout(() => launchGame('survie', 0), 50);
    });

    // Afficher records rapides
    renderQuickRecords();
}

function launchGame(mode, duration) {
    const params = new URLSearchParams({ mode, duration });
    window.location.href = `game.html?${params.toString()}`;
}

function renderQuickRecords() {
    const chronoBest = parseInt(localStorage.getItem(LS_CHRONO_BEST));
    const survieBest = parseInt(localStorage.getItem(LS_SURVIE_BEST));
    const avgChrono = parseInt(localStorage.getItem(LS_AVG_REACTION_CHRONO));
    const avgSurvie = parseInt(localStorage.getItem(LS_AVG_REACTION_SURVIE));

    menuBestScore.textContent = isNaN(chronoBest) ? '—' : chronoBest.toString();
    menuBestSurvie.textContent = isNaN(survieBest) ? '—' : (survieBest / 1000).toFixed(1) + ' s';

    // On affiche la meilleure moyenne entre les deux modes pour le menu rapide
    const bestAvg = Math.min(avgChrono || Infinity, avgSurvie || Infinity);
    menuAvgReaction.textContent = (bestAvg === Infinity) ? '—' : bestAvg + ' ms';
}

init();