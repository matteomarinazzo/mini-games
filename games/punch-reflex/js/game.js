import { getFirebaseRecordData, setFirebaseLeaderboard } from "../../../js/firebaseWrk.js";
import { checkRealConnection } from "../../../js/network.js";
import { playReflexSound } from "../../../js/utils/audio.js";
import { checkDailyChallenge } from '../../../js/utils/dailyChallenge.js';

// ─── LOCALSTORAGE KEYS ────────────────────────────────────────────────────────
const LS_CHRONO_BEST = 'punch_reflex_chrono_best';
const LS_SURVIE_BEST = 'punch_reflex_survie_best';
const LS_AVG_REACTION_CHRONO = 'punch_reflex_avg_reaction_chrono';
const LS_AVG_REACTION_SURVIE = 'punch_reflex_avg_reaction_survie';
const LS_PEAK_REACTION_CHRONO = 'punch_reflex_peak_reaction_chrono';
const LS_PEAK_REACTION_SURVIE = 'punch_reflex_peak_reaction_survie';
const LS_TOTAL_GAMES = 'punch_reflex_total_games';
const LS_CHRONO_GAMES = 'punch_reflex_chrono_games';
const LS_SURVIE_GAMES = 'punch_reflex_survie_games';
const LS_HISTORY = 'punch_reflex_history';

// ─── DOM ──────────────────────────────────────────────────────────────────────
const nodes = Array.from({ length: 9 }, (_, i) => document.getElementById(`node${i}`));
const hudVal1 = document.getElementById('hudVal1');
const hudVal2 = document.getElementById('hudVal2');
const hudTimer = document.getElementById('hudTimer');
const hudTimerLabel = document.getElementById('hudTimerLabel');
const modeBadge = document.getElementById('modeBadge');
const octagonWrapper = document.getElementById('octagonWrapper');

const statPeak = document.getElementById('statPeak');
const statAvg = document.getElementById('statAvg');
const statErrors = document.getElementById('statErrors');
const gameArea = document.getElementById('gameArea');

const startOverlay = document.getElementById('startOverlay');
const startTitle = document.getElementById('startTitle');
const startDesc = document.getElementById('startDesc');
const startBtn = document.getElementById('startBtn');

const endOverlay = document.getElementById('endOverlay');
const endTrophy = document.getElementById('endTrophy');
const endTitle = document.getElementById('endTitle');
const endStats = document.getElementById('endStats');
const endRecordRows = document.getElementById('endRecordRows');
const replayBtn = document.getElementById('replayBtn');
const menuBtn = document.getElementById('menuBtn');

const recordOverlay = document.getElementById('recordOverlay');
const recordBadge = document.getElementById('recordBadge');
const recordTitle = document.getElementById('recordTitle');
const recordDetails = document.getElementById('recordDetails');
const messageWrap = document.getElementById('messageWrap');
const recordMsgInput = document.getElementById('recordMsgInput');
const recordCharCounter = document.getElementById('recordCharCounter');
const saveRecordBtn = document.getElementById('saveRecordBtn');

const recordsOverlay = document.getElementById('recordsOverlay');
const recordsBtn = document.getElementById('recordsBtn');
const recordsClose = document.getElementById('recordsClose');

const historyOverlay = document.getElementById('historyOverlay');
const historyBtn = document.getElementById('historyBtn');
const historyClose = document.getElementById('historyClose');
const historyStats = document.getElementById('historyStats');
const historyList = document.getElementById('historyList');
const historyClear = document.getElementById('historyClear');

const recPersonalScore = document.getElementById('recPersonalScore');
const recPersonalAvg = document.getElementById('recPersonalAvg');
const recPersonalPeak = document.getElementById('recPersonalPeak');
const recPersonalGames = document.getElementById('recPersonalGames');
const recStatus = document.getElementById('recStatus');
const recPersonalScoreLabel = document.getElementById('recPersonalScoreLabel');
const recGlobalBest = document.getElementById('recGlobalBest');
const recGlobalAvg = document.getElementById('recGlobalAvg');
const recGlobalBestLabel = document.getElementById('recGlobalBestLabel');
const recGlobalAvgLabel = document.getElementById('recGlobalAvgLabel');

const readyOverlay = document.getElementById('readyOverlay');
const modeTabs = document.querySelectorAll('.mode-tab');

// ─── PARAMS (via URL) ────────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const MODE = params.get('mode') || 'chrono';
const DURATION = parseInt(params.get('duration')) || 30;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SURVIE_START_MS = 30_000;
const SURVIE_ADD_MS = 500;
const SURVIE_REMOVE_MS = 1_000;

const COMBO_THRESHOLDS = [
    { at: 5, label: 'COMBO x5 🔥', points: 2 },
    { at: 10, label: 'COMBO x10 ⚡', points: 3 },
    { at: 20, label: 'COMBO x20 🌟', points: 5 },
    { at: 50, label: 'MONSTRE x50 💥', points: 10 },
];

// ─── STATE ────────────────────────────────────────────────────────────────────
let running = false;
let score = 0;
let combo = 0;
let errors = 0;
let activeNodes = new Set();
let nodeActivatedAt = {};
let reactionTimes = [];
let peakReaction = Infinity;

let timerMs = 0;
let timerRAF = null;
let lastTimestamp = 0;
let nodeSpawnRAF = null;

let localChronoBest = parseInt(localStorage.getItem(LS_CHRONO_BEST)) || 0;
let localSurvieBest = parseInt(localStorage.getItem(LS_SURVIE_BEST)) || 0;
let localAvgChrono = parseInt(localStorage.getItem(LS_AVG_REACTION_CHRONO)) || Infinity;
let localAvgSurvie = parseInt(localStorage.getItem(LS_AVG_REACTION_SURVIE)) || Infinity;
let localPeakChrono = parseInt(localStorage.getItem(LS_PEAK_REACTION_CHRONO)) || Infinity;
let localPeakSurvie = parseInt(localStorage.getItem(LS_PEAK_REACTION_SURVIE)) || Infinity;
let totalGames = parseInt(localStorage.getItem(LS_TOTAL_GAMES)) || 0;
let localChronoGames = parseInt(localStorage.getItem(LS_CHRONO_GAMES)) || 0;
let localSurvieGames = parseInt(localStorage.getItem(LS_SURVIE_GAMES)) || 0;
let history = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');

let globalChronoBest = 0;
let globalSurvieBest = 0;
let globalAvgChrono = Infinity;
let globalAvgSurvie = Infinity;

let pendingRecords = null;
let phase = 'idle'; // 'idle' | 'ready' | 'playing'

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
    setupModeUI();
    loadGlobalRecords();

    startOverlay.style.display = 'flex';
    startBtn.addEventListener('click', startGame);

    replayBtn.addEventListener('click', replay);
    menuBtn.addEventListener('click', () => { window.location.href = 'index.html'; });

    saveRecordBtn.addEventListener('click', handleSaveRecord);
    recordMsgInput.addEventListener('input', () => {
        recordCharCounter.textContent = `${recordMsgInput.value.length}/50`;
    });

    gameArea.addEventListener('click', () => {
        if (phase === 'ready') startGameLogic();
    });

    recordsBtn.addEventListener('click', openRecords);
    recordsClose.addEventListener('click', () => { recordsOverlay.style.display = 'none'; });

    modeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            modeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderRecordsTab(tab.dataset.tab);
        });
    });

    historyBtn.addEventListener('click', openHistory);
    historyClose.addEventListener('click', () => { historyOverlay.style.display = 'none'; });
    historyClear.addEventListener('click', clearHistory);

    nodes.forEach((node, idx) => {
        node.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (phase === 'ready') { startGameLogic(); return; }
            if (!running) return;
            handleNodeClick(idx);
        });
    });
}

function setupModeUI() {
    if (MODE === 'chrono') {
        modeBadge.textContent = `CHRONO ${DURATION}s`;
        hudTimerLabel.textContent = 'TEMPS';
        hudTimer.textContent = DURATION + 's';
        startTitle.textContent = `CHRONO ${DURATION}s`;
        startDesc.textContent = `Frappe les cercles allumés le plus vite possible en ${DURATION} secondes !`;
    } else {
        modeBadge.textContent = 'MODE SURVIE';
        hudTimerLabel.textContent = 'SURVIE';
        hudTimer.textContent = '30.0s';
        startTitle.textContent = 'MODE SURVIE';
        startDesc.textContent = 'Commence avec 30s. +0.5s par bonne frappe. -1s par erreur. Tiens le plus longtemps !';
    }
}

// ─── LOAD GLOBAL RECORDS ──────────────────────────────────────────────────────
async function loadGlobalRecords() {
    try {
        const isOnline = await checkRealConnection();
        if (!isOnline) return;

        const [chronoData, survieData, avgChronoData, avgSurvieData] = await Promise.all([
            getFirebaseRecordData('punch_reflex', 'chrono_best'),
            getFirebaseRecordData('punch_reflex', 'survie_best'),
            getFirebaseRecordData('punch_reflex', 'avg_reaction_chrono'),
            getFirebaseRecordData('punch_reflex', 'avg_reaction_survie')
        ]);

        if (chronoData) globalChronoBest = (typeof chronoData === 'object') ? (chronoData.value || 0) : chronoData;
        if (survieData) globalSurvieBest = (typeof survieData === 'object') ? (survieData.value || 0) : survieData;
        if (avgChronoData) globalAvgChrono = (typeof avgChronoData === 'object') ? (avgChronoData.value || Infinity) : avgChronoData;
        if (avgSurvieData) globalAvgSurvie = (typeof avgSurvieData === 'object') ? (avgSurvieData.value || Infinity) : avgSurvieData;
    } catch (e) {
        console.warn('Records mondiaux non disponibles:', e);
    }
}

// ─── DÉMARRAGE ────────────────────────────────────────────────────────────────
function startGame() {
    startOverlay.style.display = 'none';
    resetState();

    phase = 'ready';
    readyOverlay.style.display = 'flex';

    timerMs = MODE === 'chrono' ? DURATION * 1000 : SURVIE_START_MS;
    updateHUD();
}

function startGameLogic() {
    if (phase !== 'ready') return;
    phase = 'playing';
    readyOverlay.style.display = 'none';
    running = true;
    playReflexSound('punch_start');

    lastTimestamp = performance.now();
    requestAnimationFrame(gameLoop);
    scheduleNextNode();
}

function resetState() {
    score = 0;
    combo = 0;
    errors = 0;
    activeNodes = new Set();
    nodeActivatedAt = {};
    reactionTimes = [];
    peakReaction = Infinity;

    nodes.forEach(n => {
        n.className = 'oct-node';
        if (n.id === 'node8') n.classList.add('center-node');
    });

    statPeak.textContent = '—';
    statAvg.textContent = '—';
    statErrors.textContent = '0';
    hudVal1.textContent = '0';
    hudVal2.textContent = 'x0';
}

// ─── BOUCLE DE JEU ────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    timerMs -= delta;
    if (timerMs <= 0) {
        timerMs = 0;
        updateTimerDisplay();
        endGame();
        return;
    }

    updateTimerDisplay();
    timerRAF = requestAnimationFrame(gameLoop);
}

function updateTimerDisplay() {
    hudTimer.textContent = (timerMs / 1000).toFixed(1) + 's';
    if (timerMs < 5000) {
        hudTimer.classList.add('danger');
    } else {
        hudTimer.classList.remove('danger');
    }
}

// ─── SPAWN DES NŒUDS ─────────────────────────────────────────────────────────
// ⚠️ UNE seule cible à la fois. Elle ne s'éteint JAMAIS toute seule.
// La suivante s'allume UNIQUEMENT après un hit, après un délai.

function scheduleNextNode() {
    if (!running) return;
    clearTimeout(nodeSpawnRAF);

    const delay = getSpawnDelay();
    nodeSpawnRAF = setTimeout(() => {
        if (!running) return;
        activateRandomNode();
    }, delay);
}

function getSpawnDelay() {
    if (MODE === 'chrono') {
        const elapsed = DURATION * 1000 - timerMs;
        const factor = Math.max(0.4, 1 - elapsed / (DURATION * 1000) * 0.6);
        return Math.max(200, 700 * factor);
    } else {
        return Math.max(150, 650 - score * 3);
    }
}

function activateRandomNode() {
    if (!running) return;

    const inactive = nodes.map((_, i) => i).filter(i => !activeNodes.has(i));
    if (inactive.length === 0) return;

    const idx = inactive[Math.floor(Math.random() * inactive.length)];
    activeNodes.add(idx);
    nodeActivatedAt[idx] = performance.now();

    const node = nodes[idx];
    node.classList.remove('hit', 'error');
    node.classList.add('active');
    playReflexSound('punch_spawn');
    // ⚠️ Pas de setTimeout d'expiration — la LED reste allumée jusqu'au hit
}

// ─── INTERACTION ──────────────────────────────────────────────────────────────
function handleNodeClick(idx) {
    if (phase !== 'playing' || !running) return;

    if (activeNodes.has(idx)) {
        // ✅ Bonne frappe
        const reactionMs = Math.round(performance.now() - nodeActivatedAt[idx]);
        reactionTimes.push(reactionMs);
        if (reactionMs < peakReaction) peakReaction = reactionMs;

        activeNodes.delete(idx);
        delete nodeActivatedAt[idx];

        const node = nodes[idx];
        node.classList.remove('active');
        node.classList.add('hit');
        playReflexSound('punch_hit');
        setTimeout(() => node.classList.remove('hit'), 300);

        combo++;
        const comboThreshold = COMBO_THRESHOLDS.slice().reverse().find(t => combo >= t.at);
        score += comboThreshold ? comboThreshold.points : 1;

        if (MODE === 'survie') {
            timerMs = Math.min(timerMs + SURVIE_ADD_MS, 30_000);
        }

        const exactThreshold = COMBO_THRESHOLDS.find(t => combo === t.at);
        if (exactThreshold) showComboFlash(exactThreshold.label);

        updateHUD();
        updateStats();

        // ✅ Déclencher la prochaine cible SEULEMENT ici
        scheduleNextNode();

    } else {
        // ❌ Mauvaise frappe — on ne touche pas activeNodes
        errors++;
        combo = 0;

        const node = nodes[idx];
        node.classList.add('error');
        playReflexSound('punch_error');
        setTimeout(() => node.classList.remove('error'), 500);

        if (MODE === 'survie') {
            timerMs = Math.max(0, timerMs - SURVIE_REMOVE_MS);
        }

        updateHUD();
        updateStats();
    }
}

function showComboFlash(label) {
    const flash = document.createElement('div');
    flash.className = 'combo-flash';
    flash.textContent = label;
    octagonWrapper.appendChild(flash);
    setTimeout(() => flash.remove(), 700);
}

// ─── MISES À JOUR AFFICHAGE ───────────────────────────────────────────────────
function updateHUD() {
    hudVal1.textContent = score.toString();
    hudVal2.textContent = 'x' + combo;
}

function updateStats() {
    statErrors.textContent = errors.toString();
    if (peakReaction !== Infinity) statPeak.textContent = peakReaction + ' ms';
    if (reactionTimes.length > 0) {
        const avg = Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length);
        statAvg.textContent = avg + ' ms';
    }
}

// ─── FIN DE PARTIE ────────────────────────────────────────────────────────────
function endGame() {
    if (phase === 'idle') return;

    running = false;
    phase = 'idle';
    cancelAnimationFrame(timerRAF);
    clearTimeout(nodeSpawnRAF);

    activeNodes.forEach(idx => nodes[idx].classList.remove('active'));
    activeNodes.clear();

    const avgReaction = reactionTimes.length > 0
        ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
        : null;
    const peakMs = peakReaction !== Infinity ? peakReaction : null;
    const survivalMs = MODE === 'survie'
        ? Math.max(0, SURVIE_START_MS + reactionTimes.length * SURVIE_ADD_MS - errors * SURVIE_REMOVE_MS)
        : null;

    totalGames++;
    if (MODE === 'chrono') {
        localChronoGames++;
        localStorage.setItem(LS_CHRONO_GAMES, localChronoGames);
    } else {
        localSurvieGames++;
        localStorage.setItem(LS_SURVIE_GAMES, localSurvieGames);
    }

    history.unshift({ mode: MODE, duration: MODE === 'chrono' ? DURATION : null, score, errors, avgReaction, peak: peakMs, timestamp: Date.now() });
    if (history.length > 50) history.pop();
    localStorage.setItem(LS_HISTORY, JSON.stringify(history));
    localStorage.setItem(LS_TOTAL_GAMES, totalGames);

    const newRecords = checkAndSaveRecords(score, avgReaction, peakMs, survivalMs);

    if (newRecords.length > 0) {
        playReflexSound('punch_success');
    } else {
        playReflexSound('punch_fail');
    }

    checkDailyChallenge({
        gameId: 'punch-reflex',
        survived: MODE === 'survie' ? (survivalMs / 1000) : null,
        avgReactionMs: avgReaction ?? null,
        mode: MODE === 'chrono' ? `chrono_${DURATION}s` : 'survival',
    });

    showEndOverlay(score, avgReaction, peakMs, errors, newRecords);
}

// ─── RECORDS ─────────────────────────────────────────────────────────────────
function checkAndSaveRecords(score, avgReaction, peakMs, survivalMs) {
    const beaten = [];

    if (MODE === 'chrono' && score > localChronoBest) {
        beaten.push({ id: 'chrono', label: 'Score perso', old: localChronoBest || 0, newVal: score });
        localChronoBest = score;
        localStorage.setItem(LS_CHRONO_BEST, score);
    }

    if (MODE === 'survie' && survivalMs !== null && survivalMs > localSurvieBest) {
        beaten.push({ id: 'survie', label: 'Temps perso', old: (localSurvieBest / 1000).toFixed(1) + 's', newVal: (survivalMs / 1000).toFixed(1) + 's' });
        localSurvieBest = survivalMs;
        localStorage.setItem(LS_SURVIE_BEST, survivalMs);
    }

    if (avgReaction !== null) {
        const isChrono = MODE === 'chrono';
        const currentAvg = isChrono ? localAvgChrono : localAvgSurvie;
        const currentPeak = isChrono ? localPeakChrono : localPeakSurvie;

        if (currentAvg === Infinity || avgReaction < currentAvg) {
            beaten.push({ id: 'avg', label: 'Réaction moy. (' + MODE + ')', old: currentAvg === Infinity ? '—' : currentAvg + 'ms', newVal: avgReaction + 'ms' });
            if (isChrono) { localAvgChrono = avgReaction; localStorage.setItem(LS_AVG_REACTION_CHRONO, avgReaction); }
            else { localAvgSurvie = avgReaction; localStorage.setItem(LS_AVG_REACTION_SURVIE, avgReaction); }
        }

        if (peakMs !== null && (currentPeak === Infinity || peakMs < currentPeak)) {
            if (isChrono) { localPeakChrono = peakMs; localStorage.setItem(LS_PEAK_REACTION_CHRONO, peakMs); }
            else { localPeakSurvie = peakMs; localStorage.setItem(LS_PEAK_REACTION_SURVIE, peakMs); }
        }
    }

    // Records mondiaux
    let isGlobal = false;
    const globalAvg = MODE === 'chrono' ? globalAvgChrono : globalAvgSurvie;

    if (MODE === 'chrono' && score > globalChronoBest) {
        beaten.push({ id: 'g_chrono', label: '🌍 SCORE MONDIAL', old: globalChronoBest || 0, newVal: score, global: true });
        isGlobal = true;
    }
    if (MODE === 'survie' && survivalMs !== null && survivalMs > globalSurvieBest) {
        beaten.push({ id: 'g_survie', label: '🌍 TEMPS MONDIAL', old: (globalSurvieBest / 1000).toFixed(1) + 's', newVal: (survivalMs / 1000).toFixed(1) + 's', global: true });
        isGlobal = true;
    }
    if (avgReaction !== null && avgReaction < globalAvg) {
        beaten.push({ id: 'g_avg', label: '🌍 MOYENNE MONDIALE', old: globalAvg === Infinity ? '—' : globalAvg + 'ms', newVal: avgReaction + 'ms', global: true });
        isGlobal = true;
    }

    if (beaten.length > 0) {
        pendingRecords = { beaten, isGlobal, score, survivalMs, avgReaction };
        showRecordPopup(pendingRecords);
    }

    return beaten;
}

function showEndOverlay(score, avgReaction, peakMs, errorCount, newRecords) {
    if (newRecords && newRecords.length > 0) {
        endTrophy.textContent = '🏆';
        endTitle.textContent = 'Nouveau Record !';
    } else if (score > 30) {
        endTrophy.textContent = '🎯';
        endTitle.textContent = 'Bonne partie !';
    } else {
        endTrophy.textContent = '💪';
        endTitle.textContent = 'Continue !';
    }

    endStats.innerHTML = `
        <div class="end-stat"><span class="es-label">Score</span><span class="es-value highlight">${score}</span></div>
        <div class="end-stat"><span class="es-label">Erreurs</span><span class="es-value">${errorCount}</span></div>
        <div class="end-stat"><span class="es-label">Réaction moy.</span><span class="es-value">${avgReaction ? avgReaction + ' ms' : '—'}</span></div>
        <div class="end-stat"><span class="es-label">Peak</span><span class="es-value gold">${peakMs ? peakMs + ' ms' : '—'}</span></div>
    `;

    endRecordRows.innerHTML = (newRecords && newRecords.length > 0)
        ? newRecords.map(r => `
            <div class="record-row">
                <span class="label">${r.label}</span>
                <span class="old">${r.old}</span>
                <span class="arrow">→</span>
                <span class="new">${r.newVal}</span>
            </div>`).join('')
        : '';

    endOverlay.style.display = 'flex';
}

function showRecordPopup(rec) {
    recordBadge.textContent = rec.isGlobal ? '🏆' : '⭐';
    recordTitle.textContent = rec.isGlobal ? 'Record Mondial !' : 'Record Personnel !';

    recordDetails.innerHTML = rec.beaten.map(r => `
        <div class="record-row">
            <span class="label">${r.label}</span>
            <span class="old">${r.old}</span>
            <span class="arrow">→</span>
            <span class="new">${r.newVal}</span>
        </div>
    `).join('');

    if (rec.isGlobal) {
        messageWrap.style.display = 'block';
        recordMsgInput.value = '';
        recordCharCounter.textContent = '0/50';
        saveRecordBtn.textContent = 'Sauvegarder & Continuer';
    } else {
        messageWrap.style.display = 'none';
        saveRecordBtn.textContent = 'Continuer';
    }

    recordOverlay.style.display = 'flex';
}

async function handleSaveRecord() {
    if (!pendingRecords) { closeRecordPopup(); return; }

    const rec = pendingRecords;
    pendingRecords = null;

    const isOnline = await checkRealConnection().catch(() => false);
    if (isOnline && rec.isGlobal) {
        const message = recordMsgInput.value.trim().substring(0, 50);
        saveRecordBtn.disabled = true;
        saveRecordBtn.textContent = 'Enregistrement…';

        try {
            for (const b of rec.beaten) {
                if (!b.global) continue;
                let valToSend = 0, statKey = '';
                if (b.id === 'g_chrono') { valToSend = rec.score; statKey = 'chrono_best'; globalChronoBest = rec.score; }
                else if (b.id === 'g_survie') { valToSend = rec.survivalMs; statKey = 'survie_best'; globalSurvieBest = rec.survivalMs; }
                else if (b.id === 'g_avg') { valToSend = rec.avgReaction; statKey = MODE === 'chrono' ? 'avg_reaction_chrono' : 'avg_reaction_survie'; if (MODE === 'chrono') globalAvgChrono = rec.avgReaction; else globalAvgSurvie = rec.avgReaction; }
                if (statKey) await setFirebaseLeaderboard('punch_reflex', statKey, { value: valToSend, message, timestamp: Date.now() });
            }
        } catch (e) { console.error('Erreur save record:', e); }

        saveRecordBtn.disabled = false;
    }

    closeRecordPopup();
}

function closeRecordPopup() {
    recordOverlay.style.display = 'none';
    saveRecordBtn.textContent = 'Continuer';
}

// ─── REJOUER ──────────────────────────────────────────────────────────────────
function replay() {
    endOverlay.style.display = 'none';
    resetState();
    setupModeUI();
    startGame();
}

// ─── RECORDS OVERLAY ──────────────────────────────────────────────────────────
async function openRecords() {
    renderRecordsTab(MODE);
    modeTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === MODE));
    recordsOverlay.style.display = 'flex';
    recStatus.textContent = 'Synchronisation…';

    try {
        const isOnline = await checkRealConnection();
        if (!isOnline) { recStatus.textContent = 'Hors ligne'; return; }

        const [chronoData, survieData, avgChronoData, avgSurvieData] = await Promise.all([
            getFirebaseRecordData('punch_reflex', 'chrono_best'),
            getFirebaseRecordData('punch_reflex', 'survie_best'),
            getFirebaseRecordData('punch_reflex', 'avg_reaction_chrono'),
            getFirebaseRecordData('punch_reflex', 'avg_reaction_survie')
        ]);

        if (chronoData) globalChronoBest = (typeof chronoData === 'object') ? chronoData.value : chronoData;
        if (survieData) globalSurvieBest = (typeof survieData === 'object') ? survieData.value : survieData;
        if (avgChronoData) globalAvgChrono = (typeof avgChronoData === 'object') ? avgChronoData.value : avgChronoData;
        if (avgSurvieData) globalAvgSurvie = (typeof avgSurvieData === 'object') ? avgSurvieData.value : avgSurvieData;

        renderRecordsTab(document.querySelector('.mode-tab.active').dataset.tab, { chronoData, survieData, avgChronoData, avgSurvieData });
        recStatus.textContent = 'À jour (Cloud)';
    } catch (e) {
        recStatus.textContent = 'Erreur de connexion';
    }
}

function renderRecordsTab(tab, globalData = null) {
    const isChrono = tab === 'chrono';

    if (recPersonalScoreLabel) recPersonalScoreLabel.textContent = isChrono ? 'Meilleur score' : 'Record survie';
    if (recGlobalBestLabel) recGlobalBestLabel.textContent = isChrono ? 'Record mondial chrono' : 'Record mondial survie';
    if (recGlobalAvgLabel) recGlobalAvgLabel.textContent = isChrono ? 'Moyenne réaction chrono' : 'Moyenne réaction survie';

    recPersonalScore.textContent = isChrono
        ? (localChronoBest > 0 ? localChronoBest.toString() : '—')
        : (localSurvieBest > 0 ? (localSurvieBest / 1000).toFixed(1) + ' s' : '—');
    recPersonalGames.textContent = isChrono ? localChronoGames.toString() : localSurvieGames.toString();

    const pAvg = isChrono ? localAvgChrono : localAvgSurvie;
    const pPeak = isChrono ? localPeakChrono : localPeakSurvie;
    recPersonalAvg.textContent = pAvg !== Infinity ? pAvg + ' ms' : '—';
    recPersonalPeak.textContent = pPeak !== Infinity ? pPeak + ' ms' : '—';

    if (recGlobalBest) {
        const gVal = isChrono ? (globalData?.chronoData || globalChronoBest) : (globalData?.survieData || globalSurvieBest);
        const val = typeof gVal === 'object' ? gVal.value : gVal;
        recGlobalBest.textContent = val > 0 ? (isChrono ? val.toString() : (val / 1000).toFixed(1) + ' s') : '—';
        updateGlobalCardMessage('recGlobalBest', typeof gVal === 'object' ? gVal : null);
    }

    if (recGlobalAvg) {
        const gAvg = isChrono ? (globalData?.avgChronoData || globalAvgChrono) : (globalData?.avgSurvieData || globalAvgSurvie);
        const avgVal = typeof gAvg === 'object' ? gAvg.value : gAvg;
        recGlobalAvg.textContent = (avgVal && avgVal !== Infinity) ? avgVal + ' ms' : '—';
        updateGlobalCardMessage('recGlobalAvg', typeof gAvg === 'object' ? gAvg : null);
    }
}

function updateGlobalCardMessage(elementId, data) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const card = el.closest('.record-card');
    card.querySelectorAll('.rc-message').forEach(m => m.remove());
    if (data?.message) {
        const m = document.createElement('span');
        m.className = 'rc-message';
        m.textContent = `« ${data.message} »`;
        card.appendChild(m);
    }
}

// ─── HISTORIQUE ───────────────────────────────────────────────────────────────
function openHistory() {
    historyOverlay.style.display = 'flex';
    renderHistory();
}

function renderHistory() {
    if (history.length === 0) {
        historyStats.innerHTML = '';
        historyList.innerHTML = '<div class="history-empty">Aucune partie enregistrée</div>';
        return;
    }

    const chronoGames = history.filter(e => e.mode === 'chrono');
    const bestScore = Math.max(...history.map(e => e.score));
    const allAvgs = history.filter(e => e.avgReaction).map(e => e.avgReaction);
    const overallAvg = allAvgs.length ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) : null;

    historyStats.innerHTML = `
        <div class="hist-stat"><span class="hs-val">${history.length}</span><span class="hs-lbl">Parties</span></div>
        <div class="hist-stat"><span class="hs-val">${bestScore}</span><span class="hs-lbl">Best score</span></div>
        <div class="hist-stat"><span class="hs-val">${chronoGames.length}</span><span class="hs-lbl">Chrono</span></div>
        <div class="hist-stat"><span class="hs-val">${overallAvg ? overallAvg + 'ms' : '—'}</span><span class="hs-lbl">Moy. réac.</span></div>
    `;

    historyList.innerHTML = history.map((entry, i) => {
        const date = new Date(entry.timestamp).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' });
        const modeLabel = entry.mode === 'chrono' ? `⏱ ${entry.duration}s` : '❤️ Survie';
        const isBest = entry.score === bestScore;
        return `
        <div class="hist-row${entry.errors > 3 ? ' error-row' : ''}">
            <span class="hist-num">#${i + 1}</span>
            <span class="hist-mode">${modeLabel}</span>
            <span class="hist-time">${date}</span>
            <span class="hist-score${isBest ? ' gold' : ''}">${entry.score} pts</span>
        </div>`;
    }).join('');
}

function clearHistory() {
    if (!confirm('Effacer tout l\'historique ?')) return;
    history = [];
    localStorage.removeItem(LS_HISTORY);
    renderHistory();
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
init();