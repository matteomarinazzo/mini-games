import { playReflexSound } from "../../../js/utils/audio.js";
import { getFirebaseRecordData, setFirebaseLeaderboard } from "../../../js/firebaseWrk.js";
import { checkRealConnection } from "../../../js/network.js";

// ─── DOM ──────────────────────────────────────────────────────────────────────
const lights = [0, 1, 2, 3, 4].map(i => document.getElementById(`light${i}`));
const chronoEl = document.getElementById('chrono');
const chronoSub = document.getElementById('chronoSub');
const lastResultEl = document.getElementById('lastResult');
const holdZone = document.getElementById('holdZone');
const bestTimeEl = document.getElementById('bestTime');
const attemptsEl = document.getElementById('attempts');
const avgTimeEl = document.getElementById('avgTime');

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
const recPersonalBest = document.getElementById('recPersonalBest');
const recPersonalAvg = document.getElementById('recPersonalAvg');
const recGlobalBest = document.getElementById('recGlobalBest');
const recGlobalAvg = document.getElementById('recGlobalAvg');
const recStatus = document.getElementById('recStatus');

const historyOverlay = document.getElementById('historyOverlay');
const historyBtn = document.getElementById('historyBtn');
const historyClose = document.getElementById('historyClose');
const historyStats = document.getElementById('historyStats');
const historyList = document.getElementById('historyList');
const historyClear = document.getElementById('historyClear');

// ─── STATE ────────────────────────────────────────────────────────────────────
const LS_BEST = 'lightsout_best';
const LS_AVG = 'lightsout_avg';
const LS_TOTAL = 'lightsout_total';
const LS_COUNT = 'lightsout_count';
const LS_HISTORY = 'lightsout_history';
const LS_BEST_AVG = 'lightsout_best_avg';

let localBest = parseFloat(localStorage.getItem(LS_BEST)) || Infinity;
let localAvg = parseFloat(localStorage.getItem(LS_AVG)) || Infinity;
let localBestAvg = parseFloat(localStorage.getItem(LS_BEST_AVG)) || Infinity;
let totalTime = parseFloat(localStorage.getItem(LS_TOTAL)) || 0;
let attemptCount = parseInt(localStorage.getItem(LS_COUNT)) || 0;
let history = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');

// Migration : si localBestAvg n'existe pas encore mais qu'on a déjà des essais
if (localBestAvg === Infinity && localAvg !== Infinity && attemptCount >= 3) {
    localBestAvg = localAvg;
    localStorage.setItem(LS_BEST_AVG, localBestAvg.toString());
}

let globalBest = Infinity;
let globalAvg = Infinity;

let phase = 'idle';   // idle | holding | lighting | waiting | running | result
let lightsOn = 0;
let preHoldTimer = null;
let lightTimer = null;
let extinguishTimer = null;
let chronoStart = 0;
let chronoRAF = null;
let currentTime = 0;
let pendingRecords = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
    updateHUD();
    renderLights(0);
    setChronoDisplay('0.000 s');
    setStatus('Maintenez pour démarrer');

    // Charger records mondiaux en arrière-plan
    loadGlobalRecords();

    // Bouton records
    recordsBtn.addEventListener('click', openRecords);
    recordsClose.addEventListener('click', () => recordsOverlay.style.display = 'none');

    // Bouton historique
    historyBtn.addEventListener('click', openHistory);
    historyClose.addEventListener('click', () => historyOverlay.style.display = 'none');
    historyClear.addEventListener('click', clearHistory);

    // Bouton sauvegarder message
    saveRecordBtn.addEventListener('click', handleSaveRecord);
    recordMsgInput.addEventListener('input', () => {
        recordCharCounter.textContent = `${recordMsgInput.value.length}/50`;
    });

    // ─── Input : souris + tactile (toute la page sauf popups/HUD) ────────────
    const isOverlay = () =>
        recordOverlay.style.display === 'flex' ||
        recordsOverlay.style.display === 'flex';

    const isInteractable = (el) => {
        return el.closest('.game-overlay, .hud, .pause-btn, button, input');
    };

    const onDown = (e) => {
        if (isInteractable(e.target)) return;
        if (e.type === 'touchstart') e.preventDefault();
        if (isOverlay()) return;
        handlePress();
    };
    const onUp = (e) => {
        if (isInteractable(e.target)) return;
        if (e.type === 'touchend') e.preventDefault();
        handleRelease();
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mouseup', (e) => { if (!isInteractable(e.target)) onUp(e); });
    document.addEventListener('touchend', (e) => { if (!isInteractable(e.target)) onUp(e); }, { passive: false });

    // Espace aussi
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat) {
            if (isOverlay()) return;
            e.preventDefault();
            handlePress();
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space') { e.preventDefault(); handleRelease(); }
    });
}

// ─── LOAD GLOBAL RECORDS ──────────────────────────────────────────────────────
async function loadGlobalRecords() {
    try {
        const isOnline = await checkRealConnection();
        if (!isOnline) return;

        const bestData = await getFirebaseRecordData('lights_out', 'best');
        const avgData = await getFirebaseRecordData('lights_out', 'avg');

        if (bestData) {
            globalBest = (typeof bestData === 'object') ? (bestData.value || Infinity) : bestData;
        }
        if (avgData) {
            globalAvg = (typeof avgData === 'object') ? (avgData.value || Infinity) : avgData;
        }
    } catch (e) {
        console.warn('Records mondiaux non disponibles:', e);
    }
}

// ─── PRESS ────────────────────────────────────────────────────────────────────
function handlePress() {
    if (phase === 'idle' || phase === 'result') {
        startSequence();
    }
    // running → rien, c'est le relâcher qui stoppe
}

// ─── RELEASE ──────────────────────────────────────────────────────────────────
function handleRelease() {
    if (phase === 'holding') {
        // Trop court ( < 0.75s), on annule simplement
        cancelPreHold();
    } else if (phase === 'lighting' || phase === 'waiting') {
        // Faux départ !
        earlyRelease();
    } else if (phase === 'running') {
        stopChrono();
    }
    // idle/result → rien
    document.querySelectorAll('.hold-zone').forEach(z => z.classList.remove('active'));
}

function cancelPreHold() {
    phase = 'idle';
    clearAllTimers();
    renderLights(0);
    holdZone.classList.remove('active');
    setStatus('Maintenez pour démarrer');
}

// ─── SÉQUENCE ─────────────────────────────────────────────────────────────────
function startSequence() {
    phase = 'holding';
    clearAllTimers();
    renderLights(0);
    holdZone.classList.add('active');
    setChronoDisplay('0.000 s');
    chronoEl.className = 'chrono';
    lastResultEl.textContent = '';
    lastResultEl.className = 'last-result';
    setStatus('Ne relâchez pas');

    playReflexSound('hold');

    // Attendre 0.75s avant d'allumer le premier feu (évite les départs "réflexe" par erreur)
    preHoldTimer = setTimeout(() => {
        if (phase !== 'holding') return;
        phase = 'lighting';
        setStatus('Ne relâchez pas');
        lightsOn = 0;
        lightNextLight();
    }, 750);
}

function lightNextLight() {
    if (phase !== 'lighting') return;

    lightsOn++;
    renderLights(lightsOn);
    playReflexSound('light_on');

    if (lightsOn < 5) {
        lightTimer = setTimeout(lightNextLight, 1000);
    } else {
        // Tous allumés — attendre un temps aléatoire entre 0.2s et 6s
        const wait = 200 + Math.random() * 5800;
        phase = 'waiting';
        setStatus('Préparez-vous…');
        extinguishTimer = setTimeout(extinguish, wait);
    }
}

function extinguish() {
    if (phase !== 'waiting') return;
    phase = 'running';

    renderLights(0);
    playReflexSound('lights_out');
    setStatus('GO');
    holdZone.classList.remove('active');

    // Démarrer le chrono
    chronoStart = performance.now();
    chronoEl.className = 'chrono running';
    runChrono();
}

// ─── FAUX DÉPART ──────────────────────────────────────────────────────────────
function earlyRelease() {
    phase = 'result';
    clearAllTimers();
    renderLights(0);

    // Flash orange sur les feux
    lights.forEach(l => l.classList.add('penalty'));
    setTimeout(() => lights.forEach(l => l.classList.remove('penalty')), 800);

    playReflexSound('penalty');
    chronoEl.textContent = '+1.000 s';
    chronoEl.className = 'chrono penalty';
    setStatus('Faux départ ! Pénalité +1s');
    lastResultEl.textContent = 'FAUX DÉPART — +1.000 s';
    lastResultEl.className = 'last-result penalty';

    // Enregistrer comme pénalité (1 seconde)
    recordAttempt(1.000, true);
}

// ─── CHRONO ───────────────────────────────────────────────────────────────────
function runChrono() {
    const elapsed = (performance.now() - chronoStart) / 1000;
    setChronoDisplay(elapsed.toFixed(3) + ' s');
    chronoRAF = requestAnimationFrame(runChrono);
}

function stopChrono() {
    if (phase !== 'running') return;
    phase = 'result';
    cancelAnimationFrame(chronoRAF);

    currentTime = (performance.now() - chronoStart) / 1000;
    const display = currentTime.toFixed(3) + ' s';

    setChronoDisplay(display);
    chronoEl.className = 'chrono';
    setStatus('Appuyez n\'importe où pour rejouer');
    playReflexSound('stop');

    lastResultEl.textContent = display;
    lastResultEl.className = 'last-result good';

    recordAttempt(currentTime, false);
}

// ─── ENREGISTRER ESSAI ────────────────────────────────────────────────────────
async function recordAttempt(time, isPenalty) {
    // Mettre à jour stats locales
    attemptCount++;
    totalTime += time;
    const newAvg = totalTime / attemptCount;

    const prevBest = localBest;
    const prevBestAvg = localBestAvg;

    // Sauvegarder
    if (time < localBest) localBest = time;
    localAvg = newAvg;

    if (attemptCount >= 3 && newAvg < localBestAvg) {
        localBestAvg = newAvg;
    }

    localStorage.setItem(LS_BEST, localBest.toString());
    localStorage.setItem(LS_AVG, localAvg.toString());
    localStorage.setItem(LS_BEST_AVG, localBestAvg.toString());
    localStorage.setItem(LS_TOTAL, totalTime.toString());
    localStorage.setItem(LS_COUNT, attemptCount.toString());

    // Sauvegarder dans l'historique
    history.push({ time, isPenalty, ts: Date.now() });
    localStorage.setItem(LS_HISTORY, JSON.stringify(history));

    updateHUD();

    if (isPenalty) return; // Pas de record sur faux départ

    // Vérifier records
    const beatPersonalBest = time < prevBest && prevBest !== Infinity;
    const beatPersonalAvg = newAvg < prevBestAvg && prevBestAvg !== Infinity && attemptCount >= 3;

    const isOnline = await checkRealConnection();
    const beatGlobalBest = isOnline && time < globalBest;
    const beatGlobalAvg = isOnline && newAvg < globalAvg && attemptCount >= 3;

    const anyRecord = beatPersonalBest || beatGlobalBest || beatGlobalAvg;

    if (anyRecord) {
        pendingRecords = {
            time, newAvg, prevBest, prevBestAvg,
            beatPersonalBest, beatPersonalAvg,
            beatGlobalBest, beatGlobalAvg,
            isGlobalBeat: beatGlobalBest || beatGlobalAvg
        };

        // Mettre à jour globaux localement
        if (beatGlobalBest) globalBest = time;
        if (beatGlobalAvg) globalAvg = newAvg;

        await showRecordPopup(pendingRecords);
    }
}

// ─── POPUP RECORDS ────────────────────────────────────────────────────────────
async function showRecordPopup(rec) {
    const isPersonalOnly = (rec.beatPersonalBest || rec.beatPersonalAvg) && !rec.isGlobalBeat;
    const isGlobal = rec.isGlobalBeat;

    recordBadge.textContent = isGlobal ? '🏆' : '⭐';
    recordTitle.textContent = isGlobal ? 'Record Mondial !' : 'Record Personnel !';

    // Construire les lignes de détails
    let html = '';

    if (rec.beatPersonalBest || rec.beatGlobalBest) {
        const oldVal = rec.beatGlobalBest ? formatGlobalBest(rec.prevBest) : fmt(rec.prevBest);
        const newVal = fmt(rec.time);
        html += `<div class="record-row">
            <span class="label">${rec.beatGlobalBest ? '🌍 RÉFLEXE MONDIAL' : '👤 Réflexe perso'}</span>
            <span class="old">${oldVal}</span>
            <span class="arrow">→</span>
            <span class="new">${newVal}</span>
        </div>`;
    }

    if (rec.beatPersonalAvg || rec.beatGlobalAvg) {
        const oldAvgVal = rec.beatGlobalAvg ? formatGlobalAvg(rec.prevBestAvg) : fmt(rec.prevBestAvg);
        const newAvgVal = fmt(rec.newAvg);
        html += `<div class="record-row">
            <span class="label">${rec.beatGlobalAvg ? '🌍 MOYENNE MONDIALE' : '👤 Moyenne perso'}</span>
            <span class="old">${oldAvgVal}</span>
            <span class="arrow">→</span>
            <span class="new">${newAvgVal}</span>
        </div>`;
    }

    recordDetails.innerHTML = html;

    // Champ message seulement pour records mondiaux
    if (isGlobal) {
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

    if (rec.isGlobalBeat) {
        const message = recordMsgInput.value.trim().substring(0, 50);
        saveRecordBtn.disabled = true;
        saveRecordBtn.textContent = 'Enregistrement…';

        try {
            if (rec.beatGlobalBest) {
                await setFirebaseLeaderboard('lights_out', 'best', {
                    value: Number(rec.time.toFixed(3)),
                    message,
                    timestamp: Date.now()
                });
            }
            if (rec.beatGlobalAvg) {
                await setFirebaseLeaderboard('lights_out', 'avg', {
                    value: Number(rec.newAvg.toFixed(3)),
                    message,
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            console.error('Erreur save record:', e);
        }

        saveRecordBtn.disabled = false;
    }

    closeRecordPopup();
}

function closeRecordPopup() {
    recordOverlay.style.display = 'none';
    saveRecordBtn.textContent = 'Continuer';
    phase = 'idle';
    setStatus('Maintenez pour démarrer');
}

// ─── RECORDS OVERLAY ──────────────────────────────────────────────────────────
async function openRecords() {
    recPersonalBest.textContent = localBest !== Infinity ? fmt(localBest) : '—';
    recPersonalAvg.textContent = localBestAvg !== Infinity ? fmt(localBestAvg) : '—';
    recGlobalBest.textContent = '…';
    recGlobalAvg.textContent = '…';
    recStatus.textContent = 'Synchronisation…';
    recordsOverlay.style.display = 'flex';

    try {
        const isOnline = await checkRealConnection();
        if (!isOnline) { recStatus.textContent = 'Hors ligne'; return; }

        const [bestData, avgData] = await Promise.all([
            getFirebaseRecordData('lights_out', 'best'),
            getFirebaseRecordData('lights_out', 'avg'),
        ]);

        if (bestData) {
            const val = (typeof bestData === 'object') ? bestData.value : bestData;
            recGlobalBest.textContent = fmt(val);
            const card = recGlobalBest.closest('.record-card');
            card.querySelectorAll('.rc-message').forEach(m => m.remove());
            if (bestData?.message) {
                const m = document.createElement('span');
                m.className = 'rc-message';
                m.textContent = `« ${bestData.message} »`;
                card.appendChild(m);
            }
        } else { recGlobalBest.textContent = '—'; }

        if (avgData) {
            const val = (typeof avgData === 'object') ? avgData.value : avgData;
            recGlobalAvg.textContent = fmt(val);
            const card = recGlobalAvg.closest('.record-card');
            card.querySelectorAll('.rc-message').forEach(m => m.remove());
            if (avgData?.message) {
                const m = document.createElement('span');
                m.className = 'rc-message';
                m.textContent = `« ${avgData.message} »`;
                card.appendChild(m);
            }
        } else { recGlobalAvg.textContent = '—'; }

        recStatus.textContent = 'À jour (Cloud)';
    } catch (e) {
        recStatus.textContent = 'Erreur de connexion';
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
        historyList.innerHTML = '<div class="history-empty">Aucun essai enregistré</div>';
        return;
    }

    const valid = history.filter(e => !e.isPenalty);
    const penalties = history.filter(e => e.isPenalty).length;
    const currentAvg = localAvg !== Infinity ? fmt(localAvg) : '—';
    historyStats.innerHTML = `
        <div class="hist-stat"><span class="hs-val">${history.length}</span><span class="hs-lbl">Essais</span></div>
        <div class="hist-stat"><span class="hs-val">${valid.length}</span><span class="hs-lbl">Valides</span></div>
        <div class="hist-stat"><span class="hs-val">${penalties}</span><span class="hs-lbl">Pénalités</span></div>
        <div class="hist-stat"><span class="hs-val">${currentAvg}</span><span class="hs-lbl">Moyenne</span></div>
    `;

    const avg = localAvg !== Infinity ? localAvg : null;
    let html = '';
    const reversed = [...history].reverse();
    reversed.forEach((entry, i) => {
        const num = history.length - i;
        if (entry.isPenalty) {
            html += `
            <div class="hist-row penalty-row">
                <span class="hist-num">#${num}</span>
                <span class="hist-label-penalty">FAUX DÉPART</span>
                <span class="hist-time penalty-time">+1.000 s</span>
            </div>`;
        } else {
            const isGood = avg === null || entry.time <= avg;
            const colorClass = isGood ? 'good-time' : 'bad-time';
            const indicator = isGood ? '▼' : '▲';
            html += `
            <div class="hist-row">
                <span class="hist-num">#${num}</span>
                <span class="hist-indicator ${colorClass}">${indicator}</span>
                <span class="hist-time ${colorClass}">${entry.time.toFixed(3)} s</span>
            </div>`;
        }
    });
    historyList.innerHTML = html;
}

function clearHistory() {
    if (!confirm('Effacer tout l\'historique ?')) return;
    history = [];
    localStorage.removeItem(LS_HISTORY);
    renderHistory();
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmt(val) {
    if (!val || val === Infinity) return '—';
    return parseFloat(val).toFixed(3) + ' s';
}

function formatGlobalBest(val) {
    return (val && val !== Infinity) ? fmt(val) : '—';
}
function formatGlobalAvg(val) {
    return (val && val !== Infinity) ? fmt(val) : '—';
}

function renderLights(n) {
    lights.forEach((l, i) => {
        l.classList.toggle('on', i < n);
    });
}

function setChronoDisplay(text) {
    chronoEl.textContent = text;
}

function setStatus(text) {
    chronoSub.textContent = text;
}

function updateHUD() {
    bestTimeEl.textContent = localBest !== Infinity ? fmt(localBest) : '—';
    attemptsEl.textContent = attemptCount;
    avgTimeEl.textContent = (localAvg !== Infinity && attemptCount > 0) ? fmt(localAvg) : '—';
}

function clearAllTimers() {
    clearTimeout(preHoldTimer);
    clearTimeout(lightTimer);
    clearTimeout(extinguishTimer);
    cancelAnimationFrame(chronoRAF);
    preHoldTimer = null;
    lightTimer = null;
    extinguishTimer = null;
    chronoRAF = null;
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
init();