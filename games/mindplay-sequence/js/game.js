/**
 * Mindplay : Séquence – game.js
 *
 * Un médaillon à quatre quartiers colorés s'illumine l'un après l'autre (démonstration),
 * puis le joueur doit reproduire la séquence dans le même ordre. Une seule erreur met fin
 * à la partie. Chaque longueur de séquence est jouée deux fois (la 2e démonstration est plus
 * rapide), puis la séquence s'allonge d'une couleur : c'est un nouveau niveau.
 *
 * Organisation du fichier :
 *   1. CONFIG            – tous les paramètres à ajuster
 *   2. ÉTAT / DOM / CACHE
 *   3. RECORDS (outils)  – comparaison niveau puis durée, formats
 *   4. MÉDAILLON         – construction SVG et allumage des quartiers
 *   5. DÉROULEMENT       – démonstration, saisie, erreur
 *   6. FLUX DE JEU       – démarrage, pause, fin de partie
 *   7. RECORDS EN LIGNE  – sauvegarde locale "mindplay-sequence" + record mondial Firebase
 *   8. BOUTONS / INIT
 *
 * Hors ligne : tout le jeu et les records personnels fonctionnent sans réseau.
 * Firebase / network.js ne sont chargés qu'en arrière-plan et ne bloquent jamais une partie.
 *
 * Toutes les durées de jeu sont en millisecondes et n'avancent que pendant que la partie
 * tourne (la pause suspend le chronomètre, la démonstration et les transitions).
 */

// ─────────────────────────────────────────────
// 1. CONFIG  (valeurs à ajuster)
// ─────────────────────────────────────────────

// -- Couleurs -----------------------------------------------------
// Ordre = sens horaire depuis le haut gauche : haut gauche, haut droit, bas droit, bas gauche.
// base = quartier éteint, lit = quartier allumé, glow = halo lumineux.
const COLORS = [
    { name: 'Rouge', base: '#7d1a2e', lit: '#ff5c7c', glow: '#ff2d55' },
    { name: 'Vert', base: '#0e5b3c', lit: '#58ffb0', glow: '#18e68a' },
    { name: 'Bleu', base: '#0c3f86', lit: '#62b0ff', glow: '#2f8cff' },
    { name: 'Jaune', base: '#7f6209', lit: '#ffe65a', glow: '#ffd21f' }
];
const KEYS = ['1', '2', '3', '4'];     // touches clavier correspondant aux quartiers (même ordre)

// -- Progression --------------------------------------------------
const START_LENGTH = 3;            // nombre de couleurs de la première séquence
const LENGTH_STEP = 1;             // couleurs ajoutées à chaque nouveau niveau
const PLAYS_PER_LENGTH = 2;        // réussites nécessaires pour chaque longueur

// -- Rythme de la démonstration (ms) ------------------------------
const LIGHT_MS = 520;              // durée d'allumage d'un quartier pendant la démonstration
const GAP_BY_PLAY = [440, 220];    // délai entre deux couleurs : 1re fois, 2e fois (plus rapide)
const PRESS_MS = 240;              // durée d'allumage lors d'un appui du joueur

// -- Transitions (ms) ---------------------------------------------
const START_DELAY_MS = 900;        // pause avant le début d'une démonstration
const SUCCESS_MS = 800;            // temps d'affichage après une réussite
const FAIL_MS = 1400;              // temps d'affichage de l'erreur avant l'écran de défaite

// -- Records ------------------------------------------------------
const CACHE_KEY = 'mindplay-sequence';   // sauvegarde locale (record perso, niveau, record mondial, message)
const FB_GAME = 'mindplay_sequence';     // nœud Firebase : leaderboards/mindplay_sequence/score
const FB_KEY = 'score';                  // { value: niveau, duration: ms, message, timestamp }

// ─────────────────────────────────────────────
// 2. ÉTAT / DOM / CACHE
// ─────────────────────────────────────────────
let state = 'ready';     // ready | running | paused | over
let phase = 'idle';      // idle | countdown | demo | input | success | fail
let phaseLeft = 0;       // temps restant dans la phase (ms)
let level = 1, play = 1, playsWon = 0;
let seq = [];            // séquence en cours (indices de quartiers)
let demoIdx = 0, demoOn = false;
let inputIdx = 0;        // nombre de couleurs déjà correctement saisies
let elapsed = 0;         // durée de la partie hors pause (ms)
let ended = false;       // vrai dès l'erreur : le chronomètre est figé
let lastTime = 0;
let runId = 0;           // identifie la partie en cours (ignore les réponses réseau tardives)
let pendingRecord = null;

const ZERO = { level: 0, duration: 0 };
let cache = loadCache();
let bestRec = normRecord(cache.best);
let worldBest = normRecord(cache.worldBest);

// Modules en ligne (Firebase / réseau) : chargés sans bloquer le jeu
let fb = null, net = null;

const $ = (id) => document.getElementById(id);
const medallion = $('medallion');
const levelValueEl = $('levelValue'), roundInfoEl = $('roundInfo'), statusLine = $('statusLine');
const bestValEl = $('bestVal'), progressValEl = $('progressVal'), timeValEl = $('timeVal');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay');
const pauseOverlay = $('pauseOverlay'), gameoverOverlay = $('gameoverOverlay');
const recordsOverlay = $('recordsOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

let quads = [];
const flashTimers = [];

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
// 4. MÉDAILLON
// ─────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';
const CX = 100, CY = 100;
const R_OUT = 96;      // rayon extérieur du médaillon
const R_IN = 40;       // rayon intérieur des quartiers (concentrique au cercle central)
const HUB_R = 30;      // rayon du cercle central : un peu plus grand que R_IN pour masquer la jonction
const HALF_GAP = 3;    // demi-largeur de la croix qui sépare les quartiers

const LABEL_D = (R_OUT + R_IN) / 2 / Math.SQRT2;   // position des petits numéros (milieu de la couronne)

// Direction de chaque quartier (sx, sy) : haut gauche, haut droit, bas droit, bas gauche
const DIRS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

// Quart de couronne dont les arcs (extérieur ET intérieur) sont centrés sur le médaillon :
// le bord intérieur épouse exactement le cercle central. L'écart entre quartiers est une
// croix de largeur constante (2 × HALF_GAP), sans décaler les quartiers.
function quadPath(i) {
    const [sx, sy] = DIRS[i];
    const g = HALF_GAP;
    const xo = Math.sqrt(R_OUT * R_OUT - g * g);
    const xi = Math.sqrt(R_IN * R_IN - g * g);
    const hy = CY + sy * g, vx = CX + sx * g;                 // axes (horizontal / vertical) décalés de g
    const hOut = [CX + sx * xo, hy], hIn = [CX + sx * xi, hy];
    const vOut = [vx, CY + sy * xo], vIn = [vx, CY + sy * xi];
    // Sens horaire : haut gauche et bas droit vont de l'axe horizontal au vertical, les autres l'inverse
    const [fOut, fIn, sOut, sIn] = sx * sy > 0 ? [hOut, hIn, vOut, vIn] : [vOut, vIn, hOut, hIn];
    const f = (pt) => `${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`;
    return `M ${f(fIn)} L ${f(fOut)} A ${R_OUT} ${R_OUT} 0 0 1 ${f(sOut)} L ${f(sIn)} A ${R_IN} ${R_IN} 0 0 0 ${f(fIn)} Z`;
}

function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

function buildMedallion() {
    medallion.innerHTML = '';
    quads = [];
    COLORS.forEach((c, i) => {
        const [sx, sy] = DIRS[i];
        const g = svgEl('g', {
            class: 'quad', tabindex: '0', role: 'button', 'data-q': i,
            'aria-label': `${c.name} (touche ${KEYS[i]})`
        });
        g.style.setProperty('--base', c.base);
        g.style.setProperty('--lit', c.lit);
        g.style.setProperty('--glow', c.glow);
        g.appendChild(svgEl('path', { d: quadPath(i) }));
        const num = svgEl('text', { class: 'quad-num', x: CX + sx * LABEL_D, y: CY + sy * LABEL_D });
        num.textContent = KEYS[i];
        g.appendChild(num);
        medallion.appendChild(g);
        quads.push(g);
    });

    // Centre : cercle sombre
    medallion.appendChild(svgEl('circle', { class: 'hub-bg', cx: CX, cy: CY, r: HUB_R }));
    const sym = svgEl('text', { class: 'hub-sym', x: CX, y: CY + 1 });
    medallion.appendChild(sym);
}

function lightQuad(i) { quads[i].classList.add('lit'); }
function unlightQuad(i) { quads[i].classList.remove('lit'); }

// Allumage bref lors d'un appui du joueur
function flashQuad(i) {
    clearTimeout(flashTimers[i]);
    lightQuad(i);
    flashTimers[i] = setTimeout(() => unlightQuad(i), PRESS_MS);
}

function clearLights() {
    flashTimers.forEach(t => clearTimeout(t));
    quads.forEach(q => q.classList.remove('lit', 'wrong', 'expected'));
    medallion.classList.remove('input', 'win', 'shake');
}

// Les quartiers ne réagissent qu'à la saisie ; hors saisie ils sont inactifs
medallion.addEventListener('pointerdown', (e) => {
    const q = e.target.closest('.quad');
    if (!q) return;
    e.preventDefault();
    press(Number(q.dataset.q));
});

// ─────────────────────────────────────────────
// 5. DÉROULEMENT D'UNE PARTIE
// ─────────────────────────────────────────────
const seqLength = (lvl) => START_LENGTH + (lvl - 1) * LENGTH_STEP;
const gapFor = (p) => GAP_BY_PLAY[Math.min(p - 1, GAP_BY_PLAY.length - 1)];

function makeSequence(n) {
    return Array.from({ length: n }, () => Math.floor(Math.random() * COLORS.length));
}

function setStatus(text, cls = '') {
    statusLine.textContent = text;
    statusLine.className = 'status-line' + (cls ? ' ' + cls : '');
}

function renderTime() {
    const s = fmtClock(elapsed);
    if (timeValEl.textContent !== s) timeValEl.textContent = s;
}
function renderProgress() { progressValEl.textContent = `${inputIdx}/${seq.length || seqLength(level)}`; }
function renderBest() { bestValEl.textContent = bestRec.level > 0 ? `Niv. ${bestRec.level}` : '—'; }

function renderLevelInfo() {
    levelValueEl.textContent = level;
    roundInfoEl.textContent = `Manche ${play} / ${PLAYS_PER_LENGTH} · ${seqLength(level)} couleurs`;
}

function startPlay() {
    clearLights();
    seq = makeSequence(seqLength(level));
    inputIdx = 0;
    renderLevelInfo();
    renderProgress();
    phase = 'countdown';
    phaseLeft = START_DELAY_MS;
    setStatus('Prépare-toi…');
}

function startDemo() {
    phase = 'demo';
    demoIdx = 0;
    demoOn = true;
    lightQuad(seq[0]);
    phaseLeft = LIGHT_MS;
    setStatus('Regarde bien !', 'show');
}

function stepDemo() {
    if (demoOn) {
        unlightQuad(seq[demoIdx]);
        if (demoIdx >= seq.length - 1) { startInput(); return; }
        demoOn = false;
        phaseLeft = gapFor(play);
    } else {
        demoIdx++;
        lightQuad(seq[demoIdx]);
        demoOn = true;
        phaseLeft = LIGHT_MS;
    }
}

function startInput() {
    phase = 'input';
    inputIdx = 0;
    medallion.classList.add('input');
    renderProgress();
    setStatus('À toi ! Reproduis la séquence');
}

function press(i) {
    if (state !== 'running' || phase !== 'input') return;
    if (seq[inputIdx] === i) {
        flashQuad(i);
        inputIdx++;
        renderProgress();
        if (inputIdx === seq.length) playWon();
    } else {
        wrong(i);
    }
}

function playWon() {
    playsWon++;
    phase = 'success';
    phaseLeft = SUCCESS_MS;
    medallion.classList.remove('input');
    medallion.classList.add('win');
    setStatus(play === PLAYS_PER_LENGTH ? `Niveau ${level} réussi !` : 'Bravo !', 'good');
}

function nextPlay() {
    if (play < PLAYS_PER_LENGTH) {
        play++;
    } else {
        play = 1;
        level++;
        saveCache({ level });              // niveau actuel conservé en cas de rafraîchissement
        levelValueEl.classList.add('level-up');
        setTimeout(() => levelValueEl.classList.remove('level-up'), 600);
    }
    startPlay();
}

function wrong(i) {
    ended = true;                          // fige le chronomètre : durée = démarrage → erreur
    flashTimers.forEach(t => clearTimeout(t));
    quads.forEach(q => q.classList.remove('lit'));
    quads[i].classList.add('wrong');
    const expected = seq[inputIdx];
    quads[expected].classList.add('lit', 'expected');
    phase = 'fail';
    phaseLeft = FAIL_MS;
    medallion.classList.remove('input');
    medallion.classList.add('shake');
    setTimeout(() => medallion.classList.remove('shake'), 400);
    setStatus('Raté !', 'bad');
}

// dt en ms ; appelé seulement quand state === 'running' (donc jamais en pause)
function update(dt) {
    if (!ended) { elapsed += dt; renderTime(); }
    phaseLeft -= dt;
    if (phaseLeft > 0) return;
    switch (phase) {
        case 'countdown': startDemo(); break;
        case 'demo': stepDemo(); break;
        case 'success': nextPlay(); break;
        case 'fail': finishGame(); break;
        default: break;                    // 'input' : on attend le joueur
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
    level = 1; play = 1; playsWon = 0;
    elapsed = 0; ended = false;
    pendingRecord = null;
    saveCache({ level });
    setWorldStatus('');
    medallion.classList.remove('veiled');
    timeValEl.textContent = '0:00';
    renderBest();
    state = 'running';
    lastTime = performance.now();
    startPlay();
}

function pauseGame(openPauseModal = true) {
    if (state !== 'running' || phase === 'fail') return;
    state = 'paused';
    medallion.classList.add('veiled');     // masque le quartier allumé pendant la pause
    if (openPauseModal) pauseOverlay.classList.add('open');
}

function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    medallion.classList.remove('veiled');
    state = 'running';
    lastTime = performance.now();
}

function setWorldStatus(text) { $('goWorldStatus').textContent = text; }

function finishGame() {
    if (state !== 'running') return;
    state = 'over';
    phase = 'idle';

    const result = { level, duration: Math.round(elapsed), rounds: playsWon };
    saveCache({ level });

    // Record personnel (local, indépendant du réseau). Il faut au moins une réussite.
    const eligible = playsWon > 0;
    let isPersonalBest = false;
    if (eligible && isBetter(result, bestRec)) {
        bestRec = { level: result.level, duration: result.duration };
        saveCache({ best: bestRec });
        isPersonalBest = true;
    }
    renderBest();

    $('goEmoji').textContent = isPersonalBest ? '🏆' : '💥';
    $('goTitle').textContent = isPersonalBest ? 'Nouveau record !' : 'Partie terminée';
    $('goLevel').textContent = result.level;
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
window.addEventListener('blur', () => pauseGame());

// Boucle principale
function loop(now) {
    const dt = Math.min(now - lastTime, 250);   // plafonné : évite les sauts après un lag
    lastTime = now;
    if (state === 'running') update(dt);
    requestAnimationFrame(loop);
}

// Clavier
document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && active.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();

    // Touches 1-4 : appui sur un quartier
    const qi = KEYS.indexOf(e.key);
    if (qi >= 0 && state === 'running') { if (!e.repeat) press(qi); e.preventDefault(); return; }

    // Quartier ciblé au clavier (Tab) : Entrée / Espace
    if ((k === 'enter' || k === ' ') && active && active.classList && active.classList.contains('quad')) {
        if (!e.repeat) press(Number(active.dataset.q));
        e.preventDefault();
        return;
    }

    if (k === 'escape') { state === 'running' ? pauseGame() : (state === 'paused' && resumeGame()); }
    else if (k === 'enter' && state === 'ready' && startOverlay.classList.contains('open')
        && !rulesOverlay.classList.contains('open') && !(active && active.tagName === 'BUTTON')) startGame();
});

// Aucun défilement / zoom de page pendant les gestes tactiles
['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

// ─────────────────────────────────────────────
// 7. RECORDS EN LIGNE (sauvegarde locale "mindplay-sequence" + Firebase)
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

document.querySelectorAll('.js-start-length').forEach(el => { el.textContent = START_LENGTH; });
document.querySelectorAll('.js-plays').forEach(el => { el.textContent = PLAYS_PER_LENGTH; });

// Données sauvegardées chargées au démarrage : record personnel et dernier niveau atteint
{
    const parts = [];
    const lastLevel = Number(cache.level) || 0;
    if (lastLevel > 1) parts.push(`Dernier niveau atteint : ${lastLevel}`);
    if (bestRec.level > 0) parts.push(`Record : ${fmtRecord(bestRec)}`);
    $('startSaved').textContent = parts.join(' · ');
}

buildMedallion();
renderBest();
renderLevelInfo();
renderProgress();
setStatus('Prépare-toi…');
lastTime = performance.now();
requestAnimationFrame(loop);
const onlineReady = initOnline();   // en arrière-plan, sans bloquer le jeu