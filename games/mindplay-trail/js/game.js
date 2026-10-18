/**
 * Mindplay : Trajet – game.js
 * Mémorise un trajet sur le grillage (A → B), puis refais-le d'un seul geste.
 */
'use strict';

// ── CONFIG ──
const ROUNDS_PER_LEVEL = 2, OBS_TIMES = [5000, 3000];
const START_LEN = 6, LEN_PER_LEVEL = 2;
const COUNTDOWN_MS = 900, SUCCESS_MS = 700, REVEAL_MS = 1800;
const COMMIT = 0.6, BACK = 0.95;          // seuils (fraction de case) : valider une arête / un retour
const CACHE_KEY = 'mindplay-trail';   // cache local : record perso, record mondial, message, niveau, partie en cours
const FB_GAME = 'mindplay_trail';     // nœud Firebase : leaderboards/mindplay_trail/score
const FB_KEY = 'score';               // { value: niveau, duration: ms, message, timestamp }
const U = 40, PAD = 22, NS = 'http://www.w3.org/2000/svg';

// ── ÉTAT ──
let state = 'ready', phase = 'idle', phaseLeft = 0, obsTotal = 1;
let level = 1, round = 1, roundsWon = 0, elapsed = 0, ended = false, lastTime = 0;
let cols = 5, rows = 5, W = 6, H = 6, path = [], idx = 0, drag = false, trace = [];
let obsL, usrL, revL, head, lastSec = -1;
let runId = 0, pendingRecord = null;     // runId : ignore les réponses réseau tardives
let fb = null, net = null;               // modules en ligne, chargés sans bloquer le jeu

const $ = (id) => document.getElementById(id);
const svg = $('trail'), statusLine = $('statusLine');
const startOverlay = $('startOverlay'), rulesOverlay = $('rulesOverlay'), pauseOverlay = $('pauseOverlay');
const gameoverOverlay = $('gameoverOverlay'), recordsOverlay = $('recordsOverlay');
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');

// ── CACHE / RECORDS ──
let cache = (() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } })();
function saveCache(patch) {
    cache = { ...cache, ...patch };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* indisponible */ }
}
const ZERO = { level: 0, duration: 0 };
const normRecord = (r) => (r && typeof r === 'object') ? { level: Number(r.level) || 0, duration: Number(r.duration) || 0 } : { level: 0, duration: 0 };
let bestRec = normRecord(cache.best);
let worldBest = normRecord(cache.worldBest);
const isBetter = (a, b) => a.level > 0 && (b.level <= 0 || a.level > b.level || (a.level === b.level && a.duration < b.duration));
const pad2 = (n) => String(n).padStart(2, '0');
function fmtDuration(ms) { const t = Math.floor(ms / 100), s = Math.floor(t / 10); return `${Math.floor(s / 60)}:${pad2(s % 60)},${t % 10}`; }
function fmtClock(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; }
const fmtRecord = (r) => r.level > 0 ? `Niveau ${r.level} · ${fmtDuration(r.duration)}` : '—';
const validSave = () => { const s = cache.save; return s && s.level >= 1 && s.round >= 1 && s.round <= ROUNDS_PER_LEVEL ? s : null; };

// ── GÉOMÉTRIE ──
const px = (i) => PAD + (i % W) * U, py = (i) => PAD + Math.floor(i / W) * U;
const pts = (a) => a.map(i => px(i) + ',' + py(i)).join(' ');
function el(tag, attrs, txt) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (txt) e.textContent = txt;
    svg.appendChild(e);
    return e;
}

function build() {
    cols = 5 + (level >> 1); rows = 5 + ((level - 1) >> 1); W = cols + 1; H = rows + 1;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${cols * U + 2 * PAD} ${rows * U + 2 * PAD}`);
    for (let y = 0; y < H; y++) el('line', { class: 'gl', x1: PAD, x2: PAD + cols * U, y1: PAD + y * U, y2: PAD + y * U });
    for (let x = 0; x < W; x++) el('line', { class: 'gl', y1: PAD, y2: PAD + rows * U, x1: PAD + x * U, x2: PAD + x * U });
    for (let i = 0; i < W * H; i++) el('circle', { class: 'nd', cx: px(i), cy: py(i), r: 2 });
    obsL = el('polyline', { class: 'obs', points: '' });
    usrL = el('polyline', { class: 'usr', points: '' });
    revL = el('polyline', { class: 'rev', points: '' });
    head = el('circle', { class: 'head', r: 4, cx: -50, cy: -50 });
}

function placeAB() {
    const a = path[0], b = path[path.length - 1];
    el('circle', { class: 'pa', cx: px(a), cy: py(a), r: 9 });
    el('text', { class: 'lt', x: px(a), y: py(a) }, 'A');
    el('circle', { class: 'pb', cx: px(b), cy: py(b), r: 9 });
    el('text', { class: 'lt', x: px(b), y: py(b) }, 'B');
}

// ── GÉNÉRATION ──
const minLen = () => START_LEN + LEN_PER_LEVEL * (level - 1);
function turns(p) {
    let t = 0;
    for (let i = 2; i < p.length; i++) if (p[i] - p[i - 1] !== p[i - 1] - p[i - 2]) t++;
    return t;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }

// Chemin auto-évitant (DFS aléatoire) de longueur exacte L ; A = départ, B = arrivée (≠ A par construction).
function genPath() {
    const base = minLen();
    for (; ;) {
        const L = base + Math.floor(Math.random() * 3);
        const a = Math.floor(Math.random() * W * H);
        const used = new Uint8Array(W * H), p = [a];
        used[a] = 1;
        let bud = 2500;
        const go = () => {
            if (p.length - 1 === L) return turns(p) >= 3;
            if (--bud < 0) return false;
            const c = p[p.length - 1], x = c % W, y = (c / W) | 0;
            for (const [dx, dy] of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const n = ny * W + nx;
                if (used[n]) continue;
                used[n] = 1; p.push(n);
                if (go()) return true;
                p.pop(); used[n] = 0;
            }
            return false;
        };
        if (go()) return p;
    }
}

// ── AFFICHAGE ──
function setStatus(t, cls = '') { statusLine.textContent = t; statusLine.className = 'status-line' + (cls ? ' ' + cls : ''); }
const renderTime = () => { const s = fmtClock(elapsed); if ($('timeVal').textContent !== s) $('timeVal').textContent = s; };
const renderBest = () => { $('bestVal').textContent = bestRec.level > 0 ? `Niv. ${bestRec.level}` : '—'; };
function renderInfo() {
    $('levelValue').textContent = level;
    $('lenVal').textContent = path.length ? path.length - 1 : minLen();
    $('roundInfo').textContent = `Manche ${round} / ${ROUNDS_PER_LEVEL} · ${rows}×${cols} · ${OBS_TIMES[round - 1] / 1000} s`;
}
function clearExpo() { $('expoFill').style.width = '0%'; $('expoSec').textContent = ''; lastSec = -1; }
function renderExpo() {
    $('expoFill').style.width = Math.max(0, Math.min(100, phaseLeft / obsTotal * 100)) + '%';
    const s = Math.max(0, Math.ceil(phaseLeft / 1000));
    if (s !== lastSec) { lastSec = s; $('expoSec').textContent = s + ' s'; }
}

// ── DÉROULEMENT ──
function startRound() {
    cols = 5 + (level >> 1); rows = 5 + ((level - 1) >> 1); W = cols + 1; H = rows + 1;
    path = genPath(); idx = 0; drag = false; trace = [];
    build(); placeAB(); clearExpo();
    svg.setAttribute('class', '');
    renderInfo();
    phase = 'countdown'; phaseLeft = COUNTDOWN_MS;
    setStatus('Prépare-toi…');
}
function startShow() {
    obsL.setAttribute('points', pts(path));
    phase = 'show'; obsTotal = phaseLeft = OBS_TIMES[round - 1] ?? OBS_TIMES[OBS_TIMES.length - 1];
    setStatus('Mémorise le trajet !', 'show');
    renderExpo();
}
function endShow() {
    obsL.setAttribute('points', '');
    clearExpo();
    phase = 'input';
    svg.classList.add('input');
    setStatus('À toi ! De A vers B');
}

function roundWon() {
    roundsWon++;
    phase = 'success'; phaseLeft = SUCCESS_MS;
    svg.classList.remove('input'); svg.classList.add('win');
    head.setAttribute('cx', -50);
    const lastRound = round === ROUNDS_PER_LEVEL;
    setStatus(lastRound ? `Niveau ${level} réussi !` : 'Bravo !', 'good');
    saveCache({ save: { level: lastRound ? level + 1 : level, round: lastRound ? 1 : round + 1, won: roundsWon, elapsed: Math.round(elapsed) } });
}
function nextRound() {
    if (round < ROUNDS_PER_LEVEL) round++;
    else {
        round = 1; level++;
        saveCache({ level });
        const lv = $('levelValue'); lv.classList.add('level-up'); setTimeout(() => lv.classList.remove('level-up'), 600);
    }
    startRound();
}

function fault(badEdge) {
    if (phase !== 'input') return;
    drag = false; ended = true;
    if (badEdge) el('line', { class: 'bad', x1: px(badEdge[0]), y1: py(badEdge[0]), x2: px(badEdge[1]), y2: py(badEdge[1]) });
    head.setAttribute('cx', -50);
    revL.setAttribute('points', pts(path));
    svg.classList.remove('input'); svg.classList.add('shake');
    setTimeout(() => svg.classList.remove('shake'), 400);
    // le tracé du joueur reste ; le bon parcours est dessiné par-dessus
    svg.appendChild(revL); svg.appendChild(head);
    phase = 'reveal'; phaseLeft = REVEAL_MS;
    saveCache({ save: null });
    setStatus('Raté !', 'bad');
}

function update(dt) {
    if (!ended) { elapsed += dt; renderTime(); }
    phaseLeft -= dt;
    if (phase === 'show' && phaseLeft > 0) renderExpo();
    if (phaseLeft > 0) return;
    switch (phase) {
        case 'countdown': startShow(); break;
        case 'show': endShow(); break;
        case 'success': nextRound(); break;
        case 'reveal': finishGame(); break;
        default: break;
    }
}

// ── SAISIE : un seul geste continu ──
function toSvg(e) {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y, k: m.a };     // k = pixels écran par unité SVG
}
function drawTrace() {
    usrL.setAttribute('points', pts(trace));
    const c = trace[trace.length - 1];
    head.setAttribute('cx', px(c)); head.setAttribute('cy', py(c));
}

svg.addEventListener('pointerdown', (e) => {
    if (state !== 'running' || phase !== 'input' || drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const p = toSvg(e);
    if (!p) return;
    const a = path[0];
    const cellPx = U * p.k;
    const tol = Math.max(0.5 * cellPx, Math.min(24, 0.8 * cellPx));
    if (Math.hypot(p.x - px(a), p.y - py(a)) * p.k > tol) { fault(null); return; }   // pas posé sur A
    drag = true; idx = 0; trace = [a];
    try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    drawTrace();
});

svg.addEventListener('pointermove', (e) => {
    if (!drag || state !== 'running') return;
    const r = svg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { fault(null); return; }
    const p = toSvg(e);
    if (!p) return;
    for (let guard = 0; guard < 8; guard++) {
        const cur = trace[trace.length - 1];
        const dx = p.x - px(cur), dy = p.y - py(cur);
        const ax = Math.abs(dx), ay = Math.abs(dy), horiz = ax >= ay, m = horiz ? ax : ay;
        if (m < COMMIT * U) break;
        const cx = cur % W, cy = (cur / W) | 0;
        const nx = cx + (horiz ? Math.sign(dx) : 0), ny = cy + (horiz ? 0 : Math.sign(dy));
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) break;
        const n = ny * W + nx;
        if (idx > 0 && n === path[idx - 1] && m < BACK * U) break;   // tolérance au tremblement
        trace.push(n); drawTrace();
        if (n === path[idx + 1]) {
            idx++;
            if (idx === path.length - 1) {          // B atteint : validé immédiatement
                drag = false;
                try { svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                roundWon();
                return;
            }
        } else { fault([cur, n]); return; }
    }
});

svg.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = false;
    if (state !== 'running' || phase !== 'input') return;
    if (idx === path.length - 1) roundWon(); else fault(null);
});
svg.addEventListener('pointercancel', () => { if (drag) fault(null); });
svg.addEventListener('contextmenu', (e) => e.preventDefault());

// ── FLUX DE JEU ──
function closeOverlays() { [startOverlay, rulesOverlay, pauseOverlay, gameoverOverlay, recordsOverlay].forEach(o => o.classList.remove('open')); }

function startGame(fresh = true) {
    closeOverlays();
    recordMessagePopup.style.display = 'none';
    runId++; pendingRecord = null;
    setWorldStatus('');
    const s = fresh ? null : validSave();
    level = s ? s.level : 1; round = s ? s.round : 1;
    roundsWon = s ? (Number(s.won) || 0) : 0; elapsed = s ? (Number(s.elapsed) || 0) : 0;
    saveCache(s ? { level } : { level, save: null });
    ended = false; drag = false;
    $('timeVal').textContent = fmtClock(elapsed);
    renderBest();
    state = 'running'; lastTime = performance.now();
    startRound();
}

function pauseGame(openModal = true) {
    if (state !== 'running' || phase === 'reveal') return;
    if (drag) { fault(null); return; }       // pas de pause utile pendant le geste
    state = 'paused';
    svg.classList.add('veiled');             // masque le trajet : pas de triche via la pause
    if (openModal) pauseOverlay.classList.add('open');
}
function resumeGame() {
    if (state !== 'paused') return;
    closeOverlays();
    svg.classList.remove('veiled');
    state = 'running'; lastTime = performance.now();
}

function finishGame() {
    if (state !== 'running') return;
    state = 'over'; phase = 'idle';
    const result = { level, duration: Math.round(elapsed), rounds: roundsWon };
    let isBest = false;
    if (roundsWon > 0 && isBetter(result, bestRec)) {
        bestRec = result; saveCache({ best: bestRec }); isBest = true;
    }
    saveCache({ level, save: null });
    renderBest();
    $('goEmoji').textContent = isBest ? '🏆' : '💥';
    $('goTitle').textContent = isBest ? 'Nouveau record !' : 'Partie terminée';
    $('goLevel').textContent = result.level;
    $('goDuration').textContent = fmtDuration(result.duration);
    $('goBest').textContent = fmtRecord(bestRec);
    gameoverOverlay.classList.add('open');
    refreshStart();
    // Le record mondial est vérifié en arrière-plan : jamais bloquant
    if (roundsWon > 0) checkWorldRecord(result, runId); else setWorldStatus('');
}

document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', () => pauseGame());

function loop(now) {
    const dt = Math.min(now - lastTime, 250);
    lastTime = now;
    if (state === 'running') update(dt);
    requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    const k = String(e.key || '').toLowerCase();
    if (k === 'escape') { state === 'running' ? pauseGame() : (state === 'paused' && resumeGame()); }
    else if (k === 'enter' && state === 'ready' && startOverlay.classList.contains('open')
        && !rulesOverlay.classList.contains('open') && document.activeElement?.id !== 'startRulesBtn') startGame(!validSave());
});
['touchmove', 'gesturestart'].forEach(ev =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

// ── RECORDS ──
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
function setWorldStatus(text) { $('goWorldStatus').textContent = text; }

function renderRecords() {
    $('recPersonalLevel').textContent = bestRec.level > 0 ? bestRec.level : '—';
    $('recPersonalTime').textContent = bestRec.level > 0 ? fmtDuration(bestRec.duration) : '—';
    $('recGlobalLevel').textContent = worldBest.level > 0 ? worldBest.level : '—';
    $('recGlobalTime').textContent = worldBest.level > 0 ? fmtDuration(worldBest.duration) : '—';
}

// Format Firebase : { value: niveau, duration, message, timestamp } (ou simple nombre)
function parseRemote(data) {
    if (data && typeof data === 'object') return { level: Number(data.value) || 0, duration: Number(data.duration) || 0 };
    if (typeof data === 'number') return { level: data, duration: 0 };
    return { ...ZERO };
}

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

// Vérifie en arrière-plan : l'écran de défaite n'attend jamais le réseau
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

// Écran Records
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

// ── BOUTONS / INIT ──
function closeRules() { rulesOverlay.classList.remove('open'); resumeGame(); }
const goMenu = () => { window.location.href = '../../index.html'; };

$('playBtn').addEventListener('click', () => startGame(!validSave()));
$('newBtn').addEventListener('click', () => startGame(true));
$('startRulesBtn').addEventListener('click', () => rulesOverlay.classList.add('open'));
$('rulesBtn').addEventListener('click', () => { pauseGame(false); rulesOverlay.classList.add('open'); });
$('rulesClose').addEventListener('click', closeRules);
rulesOverlay.addEventListener('click', (e) => { if (e.target === rulesOverlay) closeRules(); });
$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', resumeGame);
$('restartPauseBtn').addEventListener('click', () => startGame(true));
$('menuPauseBtn').addEventListener('click', goMenu);
$('goRestartBtn').addEventListener('click', () => startGame(true));
$('goMenuBtn').addEventListener('click', goMenu);

// Écran de démarrage : record + partie en cours (reprise au bon niveau / à la bonne manche)
function refreshStart() {
    const s = validSave(), parts = [];
    const last = Number(cache.level) || 0;
    if (!s && last > 1) parts.push(`Dernier niveau atteint : ${last}`);
    if (s) parts.push(`Partie en cours : niveau ${s.level}, manche ${s.round}`);
    if (bestRec.level > 0) parts.push(`Record : ${fmtRecord(bestRec)}`);
    $('startSaved').textContent = parts.join(' · ');
    $('playBtn').textContent = s ? 'Continuer' : 'Jouer';
    ['newBtn', 'newBr', 'newBr2'].forEach(id => { $(id).style.display = s ? '' : 'none'; });
}

refreshStart();
renderBest();
build();   // aperçu de la grille avant le début de la partie
$('roundInfo').textContent = `Manche 1 / ${ROUNDS_PER_LEVEL} · 5×5 · ${OBS_TIMES[0] / 1000} s`;
setStatus('Prépare-toi…');
lastTime = performance.now();
requestAnimationFrame(loop);
const onlineReady = initOnline();   // en arrière-plan, sans bloquer le jeu