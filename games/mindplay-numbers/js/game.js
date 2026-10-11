/**
 * Mindplay : Nombres – game.js
 *
 * Jeu de mémoire : un nombre s'affiche brièvement, puis disparaît ; le joueur doit le retaper.
 *
 * Progression : niveau 1 = 3 chiffres, +1 chiffre à chaque niveau. Chaque niveau compte 2 manches :
 *   manche 1 : chiffres × 2/3 s d'exposition ; manche 2 : chiffres × 1/3 s.
 * Les durées ne sont jamais arrondies (3 chiffres → 2 000 ms ; 4 chiffres → 2 666,67 ms…).
 * Seul l'affichage du compte à rebours est tronqué à l'entier inférieur (2,67 s → « 2 s »).
 * Une seule erreur termine la partie : la suivante repart du niveau 1, manche 1.
 *
 * Organisation du fichier :
 *   1. CONFIG            – tous les paramètres à ajuster
 *   2. ÉTAT / DOM / CACHE
 *   3. RECORDS (outils)  – comparaison niveau puis durée, formats
 *   4. NOMBRES           – génération du nombre, durée d'exposition
 *   5. DÉROULEMENT       – phases : décompte, mémorisation, saisie, résultat
 *   6. FLUX DE JEU       – démarrage, pause, fin de partie
 *   7. RECORDS EN LIGNE  – cache local "mindplay-numbers" + record mondial Firebase
 *   8. BOUTONS / INIT
 *
 * Hors ligne : tout le jeu et les records personnels fonctionnent sans réseau.
 * Firebase / network.js ne sont chargés qu'en arrière-plan et ne bloquent jamais une partie.
 *
 * Toutes les durées sont en millisecondes et n'avancent que pendant que la partie tourne :
 * la pause suspend tout (chronomètre, exposition du nombre). Aucun setTimeout ne pilote le jeu.
 */

// ─────────────────────────────────────────────
// 1. CONFIG  (valeurs à ajuster)
// ─────────────────────────────────────────────

// -- Niveaux ------------------------------------------------------
const START_DIGITS = 3;            // chiffres au niveau 1
const DIGITS_PER_LEVEL = 1;        // chiffres ajoutés à chaque niveau
const ROUNDS_PER_LEVEL = 2;        // manches par niveau
// Exposition par chiffre, en fraction de seconde [numérateur, dénominateur] : manche 1 puis manche 2.
// Calculée en millisecondes SANS arrondi : chiffres × 1000 × num / den.
const EXPOSURE_PER_DIGIT = [[2, 3], [1, 3]];

// -- Rythme -------------------------------------------------------
const COUNTDOWN_MS = 800;          // petite pause avant l'affichage du nombre
const SUCCESS_MS = 700;            // affichage après une bonne réponse
const FAIL_MS = 2600;              // affichage du nombre attendu avant l'écran de défaite

// -- Records ------------------------------------------------------
const CACHE_KEY = 'mindplay-numbers';    // clé du cache local (record perso, record mondial, message)
const FB_GAME = 'mindplay_numbers';      // nœud Firebase : leaderboards/mindplay_numbers/score
const FB_KEY = 'score';                  // { value: niveau, duration: ms, message, timestamp }

// ─────────────────────────────────────────────
// 2. ÉTAT / DOM / CACHE
// ─────────────────────────────────────────────
let state = 'ready';     // ready | running | paused | over
let phase = 'idle';      // idle | countdown | show | input | success | fail
let phaseLeft = 0;       // temps restant dans la phase (ms)
let level = 1, round = 1, roundsWon = 0;
let digits = START_DIGITS;
let target = '';         // nombre à retrouver (chaîne : un « 0 » au milieu ou à la fin ne disparaît jamais)
let expo = 0;            // durée d'exposition de la manche (ms, non arrondie)
let elapsed = 0;         // durée de la partie hors pause (ms)
let ended = false;       // vrai dès l'erreur : le chronomètre est figé
let lastTime = 0;
let runId = 0;           // identifie la partie en cours (ignore les réponses réseau tardives)
let pendingRecord = null;
let lastSecShown = -1;

const ZERO = { level: 0, duration: 0 };
let cache = loadCache();
let bestRec = normRecord(cache.best);
let worldBest = normRecord(cache.worldBest);

// Modules en ligne (Firebase / réseau) : chargés sans bloquer le jeu
let fb = null, net = null;

const $ = (id) => document.getElementById(id);
const panel = $('panel'), numberEl = $('numberDisplay'), expoFill = $('expoFill'), expoSec = $('expoSec');
const numInput = $('numInput'), submitBtn = $('submitBtn'), resultView = $('resultView');
const levelValueEl = $('levelValue'), roundInfoEl = $('roundInfo'), statusLine = $('statusLine');
const bestValEl = $('bestVal'), digitsValEl = $('digitsVal'), timeValEl = $('timeVal');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay');
const pauseOverlay = $('pauseOverlay'), gameoverOverlay = $('gameoverOverlay');
const recordsOverlay = $('recordsOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}
function saveCache(patch) {
    cache = { ...cache, ...patch };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* stockage indisponible */ }
}

const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));

// ─────────────────────────────────────────────
// 3. RECORDS (outils)
// ─────────────────────────────────────────────
// Un record = { level, duration }. Classement : niveau le plus haut, puis durée la plus courte.
function normRecord(r) {
    if (r && typeof r === 'object') return { level: Number(r.level) || 0, duration: Number(r.duration) || 0 };
    return { ...ZERO };
}

// Format Firebase : { value: niveau, duration, message, timestamp } (ou simple nombre)
function parseRemote(data) {
    if (data && typeof data === 'object') return { level: Number(data.value) || 0, duration: Number(data.duration) || 0 };
    if (typeof data === 'number') return { level: data, duration: 0 };
    return { ...ZERO };
}

function isBetter(a, b) {
    if (a.level <= 0) return false;
    if (b.level <= 0) return true;
    return a.level > b.level || (a.level === b.level && a.duration < b.duration);
}

const pad2 = (n) => String(n).padStart(2, '0');

function fmtDuration(ms) {
    const tenths = Math.floor(ms / 100);
    const totalSec = Math.floor(tenths / 10);
    return `${Math.floor(totalSec / 60)}:${pad2(totalSec % 60)},${tenths % 10}`;
}
function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}
function fmtRecord(rec) {
    return rec.level > 0 ? `Niveau ${rec.level} · ${fmtDuration(rec.duration)}` : '—';
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 4. NOMBRES
// ─────────────────────────────────────────────
const digitsFor = (lvl) => START_DIGITS + (lvl - 1) * DIGITS_PER_LEVEL;

/** Durée d'exposition réelle en ms, jamais arrondie (ex. 4 chiffres, manche 1 → 2666,666…). */
function exposureMs(nDigits, rnd) {
    const [num, den] = EXPOSURE_PER_DIGIT[rnd - 1] ?? EXPOSURE_PER_DIGIT[EXPOSURE_PER_DIGIT.length - 1];
    return (nDigits * 1000 * num) / den;
}

/** Affichage uniquement : secondes tronquées à l'entier inférieur (2,67 s → 2). */
const secTrunc = (ms) => Math.floor(Math.max(ms, 0) / 1000);

/** Nombre aléatoire de `n` chiffres exactement : le premier chiffre est compris entre 1 et 9 (jamais 0). */
function randomNumber(n) {
    let s = String(1 + Math.floor(Math.random() * 9));
    for (let i = 1; i < n; i++) s += Math.floor(Math.random() * 10);
    return s;
}

// ─────────────────────────────────────────────
// 5. DÉROULEMENT D'UNE MANCHE
// ─────────────────────────────────────────────
function setStatus(text, cls = '') {
    statusLine.textContent = text;
    statusLine.className = 'status-line' + (cls ? ' ' + cls : '');
}

function setPhaseClass(name) {
    panel.classList.remove('phase-wait', 'phase-show', 'phase-input', 'phase-result', 'win', 'shake');
    if (name) panel.classList.add(name);
}

function renderTime() {
    const s = fmtClock(elapsed);
    if (timeValEl.textContent !== s) timeValEl.textContent = s;
}
function renderBest() { bestValEl.textContent = bestRec.level > 0 ? `Niv. ${bestRec.level}` : '—'; }

function renderInfo() {
    levelValueEl.textContent = level;
    digitsValEl.textContent = digits;
    roundInfoEl.textContent = `Manche ${round} / ${ROUNDS_PER_LEVEL} · ${digits} chiffres · ${secTrunc(expo)} s`;
}

function startRound() {
    digits = digitsFor(level);
    target = randomNumber(digits);
    expo = exposureMs(digits, round);
    renderInfo();
    numberEl.classList.remove('on');
    numberEl.textContent = '';
    expoFill.style.width = '0%';
    expoSec.textContent = '';
    resultView.innerHTML = '';
    numInput.value = '';
    numInput.disabled = false;
    phase = 'countdown';
    phaseLeft = COUNTDOWN_MS;
    setPhaseClass('phase-wait');
    setStatus('Prépare-toi…');
}

function startShow() {
    numberEl.style.setProperty('--n', digits);
    numberEl.textContent = target;
    numberEl.classList.add('on');
    phase = 'show';
    phaseLeft = expo;                       // exposition exacte, pilotée par le chronomètre du jeu (pause = arrêt)
    lastSecShown = -1;
    setPhaseClass('phase-show');
    setStatus('Mémorise !', 'show');
    renderExposure();
}

// Affichage du compte à rebours : n'écrit dans le DOM que si l'entier change, ne modifie jamais phaseLeft
function renderExposure() {
    expoFill.style.width = `${Math.max(0, Math.min(100, (phaseLeft / expo) * 100))}%`;
    const s = secTrunc(phaseLeft);
    if (s !== lastSecShown) { lastSecShown = s; expoSec.textContent = `${s} s`; }
}

function endShow() {
    numberEl.classList.remove('on');
    numberEl.textContent = '';              // le nombre n'est plus dans le DOM : impossible à relire pendant la saisie
    expoFill.style.width = '0%';
    phase = 'input';
    numInput.value = '';
    numInput.maxLength = digits;
    numInput.placeholder = '•'.repeat(Math.min(digits, 12));
    setPhaseClass('phase-input');
    setStatus(`Retape le nombre (${digits} chiffres)`);
    focusInput();
}

function focusInput() {
    try { numInput.focus({ preventScroll: true }); } catch { numInput.focus(); }
}

// Chaque chiffre est coloré : vert = juste, rouge = faux ou en trop
function digitsHtml(value, expected) {
    return [...value].map((d, i) => `<span class="${d === expected[i] ? 'ok' : 'bad'}">${d}</span>`).join('');
}

function showResult(answer, good) {
    resultView.style.setProperty('--n', Math.max(digits, answer.length));
    resultView.innerHTML = good
        ? `<div class="res-row"><span class="res-label">Ta réponse</span><span class="res-digits">${digitsHtml(answer, target)}</span></div>`
        : `<div class="res-row"><span class="res-label">Nombre attendu</span><span class="res-digits">${target}</span></div>` +
          `<div class="res-row"><span class="res-label">Ta réponse</span><span class="res-digits">${digitsHtml(answer, target)}</span></div>`;
    setPhaseClass('phase-result');
}

// Validation : comparaison exacte de la suite de chiffres
function submitAnswer() {
    if (state !== 'running' || phase !== 'input') return;
    const answer = numInput.value.replace(/\D/g, '');
    if (!answer) { setStatus('Saisis ta réponse', 'bad'); return; }   // champ vide : pas d'erreur comptée
    numInput.blur();
    numInput.disabled = true;
    if (answer === target) {
        roundsWon++;
        phase = 'success';
        phaseLeft = SUCCESS_MS;
        showResult(answer, true);
        panel.classList.add('win');
        setStatus(round === ROUNDS_PER_LEVEL ? `Niveau ${level} réussi !` : 'Bonne réponse !', 'good');
    } else {
        ended = true;                       // fige le chronomètre : durée = démarrage → erreur
        phase = 'fail';
        phaseLeft = FAIL_MS;
        showResult(answer, false);
        panel.classList.add('shake');
        setStatus('Raté !', 'bad');
    }
}

// Après une bonne réponse : manche suivante, ou niveau suivant (+1 chiffre)
function afterSuccess() {
    round++;
    if (round > ROUNDS_PER_LEVEL) {
        round = 1;
        level++;
        levelValueEl.classList.add('level-up');
        setTimeout(() => levelValueEl.classList.remove('level-up'), 600);
    }
    startRound();
}

// dt en ms ; appelé seulement quand state === 'running' (donc jamais en pause)
function update(dt) {
    if (!ended) { elapsed += dt; renderTime(); }
    if (phase === 'input') return;           // pas de limite de temps pour répondre
    phaseLeft -= dt;
    if (phase === 'show' && phaseLeft > 0) renderExposure();
    if (phaseLeft > 0) return;
    switch (phase) {
        case 'countdown': startShow(); break;
        case 'show': endShow(); break;
        case 'success': afterSuccess(); break;
        case 'fail': finishGame(); break;
        default: break;
    }
}

// ─────────────────────────────────────────────
// 6. FLUX DE JEU
// ─────────────────────────────────────────────
function closeOverlays() {
    [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay].forEach(o => o.classList.remove('open'));
}

function startGame() {
    closeOverlays();
    recordMessagePopup.style.display = 'none';
    runId++;
    level = 1; round = 1; roundsWon = 0;      // toute nouvelle partie repart du niveau 1, manche 1
    elapsed = 0; ended = false;
    pendingRecord = null;
    setWorldStatus('');
    panel.classList.remove('veiled');
    timeValEl.textContent = '0:00';
    renderBest();
    state = 'running';
    lastTime = performance.now();
    startRound();
}

function pauseGame(openPauseModal = true) {
    if (state !== 'running' || phase === 'fail') return;
    state = 'paused';
    panel.classList.add('veiled');           // masque le nombre : pas de triche via la pause
    numInput.blur();
    if (openPauseModal) pauseOverlay.classList.add('open');
}

function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    panel.classList.remove('veiled');
    state = 'running';
    lastTime = performance.now();            // le temps passé en pause n'est jamais compté
    if (phase === 'input') focusInput();
}

function setWorldStatus(text) { $('goWorldStatus').textContent = text; }

function finishGame() {
    if (state !== 'running') return;
    state = 'over';
    phase = 'idle';

    const result = { level, duration: Math.round(elapsed), rounds: roundsWon };

    // Record personnel (local, indépendant du réseau). Il faut au moins une manche réussie.
    const eligible = roundsWon > 0;
    let isPersonalBest = false;
    if (eligible && isBetter(result, bestRec)) {
        bestRec = { level: result.level, duration: result.duration };
        saveCache({ best: bestRec });
        isPersonalBest = true;
    }
    renderBest();

    $('goEmoji').textContent = isPersonalBest ? '🏆' : '💥';
    $('goTitle').textContent = isPersonalBest ? 'Nouveau record !' : 'Partie terminée';
    $('goLevel').textContent = `${result.level} · manche ${round}`;
    $('goDuration').textContent = fmtDuration(result.duration);
    $('goBest').textContent = fmtRecord(bestRec);
    gameoverOverlay.classList.add('open');

    // Le record mondial est vérifié en arrière-plan : l'écran de défaite n'attend jamais le réseau
    if (eligible) checkWorldRecord(result, runId);
    else setWorldStatus('');
}

async function checkWorldRecord(result, myRun) {
    setWorldStatus('Vérification du record mondial…');
    try {
        await Promise.race([onlineReady, wait(2500)]);
        if (myRun !== runId) return;
        const online = await Promise.race([isOnline(), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!online || !fb) {
            setWorldStatus('Hors ligne : record mondial indisponible. Tes records personnels restent sauvegardés.');
            return;
        }
        const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!fresh) { setWorldStatus('Record mondial indisponible pour le moment.'); return; }

        if (isBetter(result, worldBest)) {
            pendingRecord = result;
            $('goEmoji').textContent = '🏆';
            $('goTitle').textContent = 'Record mondial !';
            setWorldStatus('🌍 Tu bats le record mondial !');
            recordMessagePopup.style.display = 'flex';
            recordMsgInput.value = ''; recordCharCounter.textContent = '0/50';
            setTimeout(() => recordMsgInput.focus(), 100);
        } else {
            setWorldStatus(`Record mondial : ${fmtRecord(worldBest)}`);
        }
    } catch (e) {
        console.error('Firebase records error:', e);
        if (myRun === runId) setWorldStatus('Record mondial indisponible pour le moment.');
    }
}

// Pause automatique quand l'onglet / la fenêtre perd le focus
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', pauseGame);

// Boucle principale
function loop(now) {
    const dt = Math.min(now - lastTime, 250);   // plafonné : évite les sauts après un lag
    lastTime = now;
    if (state === 'running') update(dt);
    requestAnimationFrame(loop);
}

// Saisie : seuls les chiffres sont acceptés (clavier, collage, correcteur mobile)
numInput.addEventListener('input', () => {
    const clean = numInput.value.replace(/\D/g, '');
    if (clean !== numInput.value) numInput.value = clean;
    if (phase === 'input') setStatus(`Retape le nombre (${digits} chiffres)`);
});
numInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitAnswer(); }
    else if (e.key === 'Escape') { e.preventDefault(); pauseGame(); }
});
submitBtn.addEventListener('mousedown', (e) => e.preventDefault());   // garde le clavier mobile ouvert
submitBtn.addEventListener('click', submitAnswer);

// Clavier global (hors champ de saisie, qui gère ses propres touches)
document.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { state === 'running' ? pauseGame() : (state === 'paused' && resumeGame()); }
    else if (k === 'enter' && state === 'ready' && startOverlay.classList.contains('open')
        && !rulesOverlay.classList.contains('open') && document.activeElement?.id !== 'startRulesBtn') startGame();
});

// Aucun défilement / zoom de page pendant les gestes tactiles (sauf modales et champ de saisie)
['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal, .num-input')) e.preventDefault(); }, { passive: false }));

// ─────────────────────────────────────────────
// 7. RECORDS EN LIGNE (cache local "mindplay-numbers" + Firebase)
// ─────────────────────────────────────────────
async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}

// Charge le record mondial depuis Firebase et le met en cache. Renvoie true si la valeur est fiable.
async function refreshWorldRecord() {
    try {
        if (!fb || !(await isOnline())) return false;
        const data = await fb.getFirebaseRecordData(FB_GAME, FB_KEY);
        if (data == null) {
            // Rien en base... ou erreur silencieuse de firebaseWrk.js : si un record était en cache, on ne s'y fie pas
            if (normRecord(cache.worldBest).level > 0) return false;
            worldBest = { ...ZERO };
            saveCache({ worldBest, worldMsg: '' });
            return true;
        }
        worldBest = parseRemote(data);
        saveCache({ worldBest, worldMsg: (data && data.message) || '' });
        return true;
    } catch (e) { console.error('Firebase records error:', e); return false; }
}

// Import dynamique : si Firebase est inaccessible (hors ligne), le jeu fonctionne quand même
async function initOnline() {
    try {
        [fb, net] = await Promise.all([
            import('../../../js/firebaseWrk.js'),
            import('../../../js/network.js')
        ]);
        await refreshWorldRecord();
    } catch (e) { console.warn('Mode hors ligne :', e); }
}

// Écran Records
function renderRecords() {
    $('recPersonalLevel').textContent = bestRec.level > 0 ? bestRec.level : '—';
    $('recPersonalTime').textContent = bestRec.level > 0 ? fmtDuration(bestRec.duration) : '—';
    $('recGlobalLevel').textContent = worldBest.level > 0 ? worldBest.level : '—';
    $('recGlobalTime').textContent = worldBest.level > 0 ? fmtDuration(worldBest.duration) : '—';
}

$('recordsBtn').addEventListener('click', async () => {
    if (state === 'over') return;
    pauseGame();
    recordsOverlay.classList.add('open');
    renderRecords();
    $('recStatus').textContent = 'Synchronisation...';

    const card = $('recGlobalCard');
    card.querySelectorAll('.rc-message').forEach(m => m.remove());
    const addMsg = (msg) => {
        if (!msg) return;
        const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${msg} »`; card.appendChild(m);
    };
    try {
        if (fb && await isOnline()) {
            const ok = await refreshWorldRecord();
            renderRecords();
            addMsg(cache.worldMsg);
            $('recStatus').textContent = ok ? 'À jour (Cloud)' : 'Erreur de connexion';
        } else {
            addMsg(cache.worldMsg);
            $('recStatus').textContent = 'Hors ligne (Records locaux)';
        }
    } catch (e) {
        console.error('Firebase records error:', e);
        addMsg(cache.worldMsg);
        $('recStatus').textContent = 'Erreur de connexion';
    }
});
$('recordsClose').addEventListener('click', () => recordsOverlay.classList.remove('open'));
recordsOverlay.addEventListener('click', (e) => { if (e.target === recordsOverlay) recordsOverlay.classList.remove('open'); });

// Popup « nouveau record mondial » : publication du message
saveRecordMsgBtn.addEventListener('click', async () => {
    if (!pendingRecord) return;
    const rec = pendingRecord;
    const message = recordMsgInput.value.trim().substring(0, 50);
    saveRecordMsgBtn.disabled = true;
    saveRecordMsgBtn.textContent = 'Enregistrement...';

    let published = false, beaten = false;
    try {
        if (fb) {
            // Dernière vérification : un autre joueur a pu battre le record entre-temps
            const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
            if (fresh && !isBetter(rec, worldBest)) {
                beaten = true;
            } else {
                const res = await Promise.race([
                    fb.setFirebaseLeaderboard(FB_GAME, FB_KEY, {
                        value: rec.level, duration: rec.duration, message, timestamp: Date.now()
                    }),
                    wait(4000, false)
                ]);
                published = res === true;
            }
        }
    } catch (e) { console.error('Error saving record message:', e); }

    if (published) {
        worldBest = { level: rec.level, duration: rec.duration };
        saveCache({ worldBest, worldMsg: message });
        setWorldStatus('🌍 Record mondial publié !');
    } else if (beaten) {
        setWorldStatus('Un autre joueur a battu ce record entre-temps.');
    } else {
        setWorldStatus('Record mondial non publié : connexion indisponible.');
    }

    saveRecordMsgBtn.disabled = false;
    saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'none';
    pendingRecord = null;
});
recordMsgInput.addEventListener('input', () => { recordCharCounter.textContent = `${recordMsgInput.value.length}/50`; });

// ─────────────────────────────────────────────
// 8. BOUTONS / INIT
// ─────────────────────────────────────────────
function closeRules() { rulesOverlay.classList.remove('open'); resumeGame(); }

$('playBtn').addEventListener('click', startGame);
$('startRulesBtn').addEventListener('click', () => rulesOverlay.classList.add('open'));
$('rulesBtn').addEventListener('click', () => { pauseGame(false); rulesOverlay.classList.add('open'); });
$('rulesClose').addEventListener('click', closeRules);
rulesOverlay.addEventListener('click', (e) => { if (e.target === rulesOverlay) closeRules(); });
$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', resumeGame);
$('restartPauseBtn').addEventListener('click', startGame);
$('menuPauseBtn').addEventListener('click', () => { window.location.href = '../../index.html'; });
$('goRestartBtn').addEventListener('click', startGame);
$('goMenuBtn').addEventListener('click', () => { window.location.href = '../../index.html'; });

document.querySelectorAll('.js-start-digits').forEach(el => { el.textContent = START_DIGITS; });

digits = digitsFor(1);
expo = exposureMs(digits, 1);
renderBest();
renderInfo();
setStatus('Prépare-toi…');
lastTime = performance.now();
requestAnimationFrame(loop);
const onlineReady = initOnline();   // en arrière-plan, sans bloquer le jeu
