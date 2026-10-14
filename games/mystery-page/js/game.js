/**
 * Page Mystère — game.js
 * Solo (records mondiaux comme CultureQuiz) et multijoueur (rooms comme Wiki Challenge).
 */
import { checkRealConnection } from '../../../js/network.js';
import { drawPage, fetchPage } from './core/wikipedia.js';

// ═══ CONFIG ═══
const PREFIX = 'mysterypage_';
const SAVED_ROOM_KEY = 'mysteryPage_room';
const CACHE_KEY = 'mystery-page';
const FB_GAME = 'mystery_page';
const FB_STAT = 'best';
const MENU_URL = 'index.html';
const MSG_MAX = 50;
const HEARTBEAT_MS = 20000;
const OFFLINE_AFTER_MS = 75000;

const params = new URLSearchParams(location.search);
const roomCode = (params.get('room') || '').toUpperCase() || null;
const isMulti = !!roomCode;
const gid = roomCode ? PREFIX + roomCode : null;

const $ = id => document.getElementById(id);
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
const WORD = /[\p{L}\p{N}]+/gu;

// Hors ligne → offline.html (comme Wiki Challenge)
checkRealConnection().then(ok => {
    if (!ok) { sessionStorage.setItem('offline_target_path', location.href); location.href = '../offline.html'; }
});

// ═══ ÉTAT ═══
const g = {
    title: '', words: new Map(), titleEls: [], titleKeys: new Set(), accepted: new Set(), revealedKeys: new Set(),
    tries: 0, hints: 0, paused: false, letters: false, key: 'solo', page: null, tried: [], elapsed: 0, last: 0, running: false, over: false, token: 0, raf: 0, runId: 0, countdown: false
};
let cache = loadCache();
let pending = null;     // record mondial potentiel
let retryFn = null;

function loadCache() { try { const v = JSON.parse(localStorage.getItem(CACHE_KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
function saveCache(p) { cache = { ...cache, ...p }; try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* ignore */ } }

// ═══ OUTILS TEXTE ═══
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toLowerCase().trim();
const clean = s => norm(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const fmt = ms => { const v = Math.max(0, ms | 0), s = Math.floor(v / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')},${Math.floor(v % 1000 / 100)}`; };
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

function say(text, cls = '') { const m = $('msg'); m.textContent = text; m.className = 'mp-msg ' + cls; }

function makeWord(orig, target) {
    const el = document.createElement('span');
    el.className = 'w hid';
    el.style.width = (orig.length * 0.62 + 0.5) + 'em';
    el.dataset.o = orig;
    if (target === 'title') g.titleEls.push(el);
    else { const k = norm(orig); (g.words.get(k) || g.words.set(k, []).get(k)).push(el); }
    return el;
}

function addTokens(parent, str, target) {
    let last = 0, m;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(str))) {
        if (m.index > last) parent.append(str.slice(last, m.index));
        parent.append(makeWord(m[0], target));
        last = m.index + m[0].length;
    }
    if (last < str.length) parent.append(str.slice(last));
}

function buildArticle(page) {
    g.title = page.title; g.page = page;
    g.words = new Map(); g.titleEls = []; g.revealedKeys = new Set();
    const t = $('title'); t.replaceChildren(); addTokens(t, page.title, 'title');
    const frag = document.createDocumentFragment();
    for (const line of page.text.split('\n')) {
        const s = line.trim(); if (!s) continue;
        const h = s.match(/^(=+)\s*(.+?)\s*=+$/);
        const el = document.createElement(h ? (h[1].length <= 2 ? 'h2' : 'h3') : 'p');
        addTokens(el, h ? h[2] : s, 'text');
        frag.append(el);
    }
    $('article').replaceChildren(frag);
    const base = clean(page.title);
    g.accepted = new Set([base, clean(page.title.replace(/\s*\(.*?\)\s*/g, ' '))]);
    g.accepted.forEach(a => g.accepted.add(a.replace(/^(le|la|les|l|un|une)\s+/, '')));
    g.accepted.delete('');
    g.titleKeys = new Set(base.split(' '));
    $('reader').scrollTop = 0;
}

function show(el, flash) {
    el.textContent = el.dataset.o; el.style.width = ''; el.classList.remove('hid'); el.classList.add('rev');
    if (flash) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); }
}

function revealKey(k, flash = true) {
    const els = g.words.get(k);
    if (!els || g.revealedKeys.has(k)) return 0;
    g.revealedKeys.add(k);
    els.forEach(e => show(e, flash));
    return els.length;
}

function updateStats() {
    $('statTries').textContent = plural(g.tries, 'essai');
    $('statWords').textContent = plural(g.revealedKeys.size, 'mot') + ' trouvé' + (g.revealedKeys.size > 1 ? 's' : '');
}

// ═══ CHARGEMENT / DÉMARRAGE ═══
function showLoader(text, retry) {
    $('loader').hidden = false; $('loaderText').textContent = text;
    $('loaderRetry').hidden = !retry; retryFn = retry || null;
}
const hideLoader = () => { $('loader').hidden = true; };

function setInputs(on) { ['guessInput', 'guessBtn', 'hintBtn', 'pauseBtn'].forEach(id => { $(id).disabled = !on; }); }

function resetRound() {
    g.token++; g.running = false; g.over = false; g.paused = false; g.tries = 0; g.hints = 0; g.elapsed = 0; g.letters = false; g.tried = []; g.runId++; pending = null; g.countdown = false; g.page = null; g.title = '';
    cancelAnimationFrame(g.raf); setInputs(false);
    $('timer').textContent = fmt(0); closeOverlays(); $('reader').classList.remove('veiled');
    g.revealedKeys = new Set(); updateStats(); say('');
}

// Sauvegarde de la partie en cours dans le cache « mystery-page » (clé game)
function saveGame() {
    if (!g.page || g.over) return;
    saveCache({ game: {
        key: g.key, title: g.page.title, text: g.page.text,
        revealed: [...g.revealedKeys], tried: g.tried, tries: g.tries, hints: g.hints,
        letters: g.letters, elapsed: Math.round(g.elapsed), savedAt: Date.now()
    } });
}
const clearGame = () => saveCache({ game: null });
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

function showLetters() {
    g.letters = true;
    document.querySelectorAll('.w.hid').forEach(el => { el.dataset.n = el.dataset.o.length; el.classList.add('num'); });
}

async function loadAndStart(titleOrNull, key = 'solo') {
    const token = g.token;
    g.key = key;
    showLoader('Chargement de la page mystère…');
    try {
        // Partie déjà commencée (actualisation de la page) : on la reprend
        const sv = cache.game;
        const restore = sv && sv.key === key && sv.title && sv.text && (!titleOrNull || sv.title === titleOrNull) ? sv : null;
        const page = restore ? { title: restore.title, text: restore.text }
            : titleOrNull ? await fetchPage(titleOrNull) : await drawPage();
        if (token !== g.token) return;
        buildArticle(page);
        if (restore) {
            (restore.revealed || []).forEach(k => revealKey(k, false));
            g.tries = restore.tries || 0; g.hints = restore.hints || 0; g.tried = restore.tried || [];
            g.elapsed = restore.elapsed || 0;
            if (restore.letters) showLetters();
            $('timer').textContent = fmt(g.elapsed);
            say('Partie reprise.', 'hint');
        } else saveGame();
        g.running = true; g.over = false; g.last = performance.now();
        updateStats();
        // Multi : départ commun, article masqué jusqu'au top
        if (isMulti && serverNow() < startAt) enterCountdown();
        else { setInputs(true); $('guessInput').focus(); }
        hideLoader();
        g.raf = requestAnimationFrame(tick);
    } catch (e) {
        console.warn('Page Mystère : chargement impossible', e);
        if (token === g.token) showLoader('Impossible de charger la page. Vérifie ta connexion.', () => loadAndStart(titleOrNull, key));
    }
}

function tick(now) {
    if (!g.running) return;
    if (isMulti) {
        // Chrono commun : heure serveur − début de manche (identique pour tous les joueurs)
        const e = serverNow() - startAt;
        if (e < 0) {
            enterCountdown();
            $('timer').textContent = fmt(0);
            say(`Début dans ${Math.ceil(-e / 1000)}…`, 'hint');
        } else {
            if (g.countdown) leaveCountdown();
            g.elapsed = e;
            $('timer').textContent = fmt(e);
        }
    } else {
        if (!g.paused) g.elapsed += Math.min(250, Math.max(0, now - g.last));
        $('timer').textContent = fmt(g.elapsed);
    }
    g.last = now;
    g.raf = requestAnimationFrame(tick);
}
function enterCountdown() {
    if (g.countdown) return;
    g.countdown = true;
    $('reader').classList.add('veiled');
    setInputs(false);
}
function leaveCountdown() {
    g.countdown = false;
    $('reader').classList.remove('veiled');
    setInputs(true); say('');
    $('guessInput').focus();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) g.last = performance.now(); });

// ═══ SAISIE ═══
$('guessForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('guessInput'), val = input.value.trim();
    input.value = '';
    if (!val || !g.running || g.over || g.paused) return;
    const n = clean(val);
    if (!n) return;
    if (g.accepted.has(n)) { g.tried.push(val); return win(); }
    if (!n.includes(' ') && g.words.has(n)) {
        if (g.revealedKeys.has(n)) { say(`Déjà trouvé : ${val}`, 'warn'); return; }
        g.tries++; g.tried.push(val);
        const c = revealKey(n);
        say(`✔ ${val} — ${plural(c, 'occurrence')}`, 'ok');
    } else {
        g.tries++; g.tried.push(val);
        say(`✖ ${val}`, 'bad');
        input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
    }
    updateStats(); saveGame();
});

$('hintBtn').addEventListener('click', () => {
    if (!g.running || g.over || g.paused) return;
    if (!g.letters) {
        g.hints++; showLetters(); updateStats(); saveGame();
        say('💡 Indice : le nombre de lettres de chaque mot caché est affiché.', 'hint');
        $('guessInput').focus();
        return;
    }
    const c = [...g.words.keys()].filter(k => !g.revealedKeys.has(k) && !g.titleKeys.has(k));
    if (!c.length) { say('Plus aucun mot disponible pour un indice.', 'warn'); return; }
    const k = c[Math.floor(Math.random() * c.length)];
    const orig = g.words.get(k)[0].dataset.o;
    g.hints++; revealKey(k); updateStats(); saveGame();
    say(`💡 Indice : ${orig}`, 'hint');
    $('guessInput').focus();
});

// ═══ MODALES (même fonctionnement que CultureQuiz) ═══
const setText = (id, v) => { const el = $(id); if (el) el.textContent = String(v ?? ''); };
const setOpen = (id, open) => $(id)?.classList.toggle('open', !!open);
const isOpen = id => $(id)?.classList.contains('open');
function closeOverlays() {
    ['pauseOverlay', 'gameoverOverlay', 'recordsOverlay', 'rankOverlay'].forEach(id => setOpen(id, false));
    $('recordMessagePopup').style.display = 'none';
}

// ═══ PAUSE ═══
function pauseGame(openModal = true) {
    if (g.over) {   // partie finie : solo = menu de pause, multi = classement final
        if (openModal) { if (isMulti) openRank(); else setOpen('pauseOverlay', true); }
        return;
    }
    if (!g.running || g.paused || g.countdown) return;
    g.paused = true;
    $('reader').classList.add('veiled');
    $('guessInput').blur();
    ['guessInput', 'guessBtn', 'hintBtn'].forEach(id => { $(id).disabled = true; });
    if (openModal) setOpen('pauseOverlay', true);
}
function resumeGame() {
    if (g.over) { setOpen('pauseOverlay', false); return; }
    if (!g.paused) return;
    g.paused = false; g.last = performance.now();
    $('reader').classList.remove('veiled');
    setOpen('pauseOverlay', false);
    ['guessInput', 'guessBtn', 'hintBtn'].forEach(id => { $(id).disabled = false; });
    $('guessInput').focus();
}
$('pauseBtn').addEventListener('click', () => pauseGame());
$('resumeBtn').addEventListener('click', resumeGame);
$('restartPauseBtn').addEventListener('click', restart);
$('quitPauseBtn').addEventListener('click', quit);
function restart() { clearGame(); resetRound(); loadAndStart(null, 'solo'); }
function quit() { isMulti ? leaveRoom() : (location.href = MENU_URL); }
if (isMulti) $('restartPauseBtn').hidden = true;     // la manche suivante est lancée par le créateur
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (g.over) {
        if (isMulti) { if (isOpen('rankOverlay')) { if (!$('closeRankBtn').hidden) closeRank(); } else openRank(); }
        else setOpen('pauseOverlay', !isOpen('pauseOverlay'));
        return;
    }
    if (g.paused) { if (!isOpen('recordsOverlay')) resumeGame(); } else pauseGame();
});

// ═══ VICTOIRE ═══
function revealAll() {
    g.titleEls.forEach(e => show(e, false));
    g.words.forEach(els => els.forEach(e => { if (e.classList.contains('hid')) show(e, false); }));
}
function win() {
    g.running = false; g.over = true; g.paused = false; cancelAnimationFrame(g.raf); setInputs(false); $('pauseBtn').disabled = false; clearGame();
    const r = { time: isMulti ? Math.max(1, Math.round(serverNow() - startAt)) : Math.round(g.elapsed), tries: g.tries, words: g.revealedKeys.size, hints: g.hints };
    revealAll();
    $('timer').textContent = fmt(r.time);
    say(`🎉 C'était « ${g.title} » !`, 'ok');
    if (isMulti) {
        rankShown = true;
        Promise.race([publishResult(r), wait(1500)]).then(() => { if (roomData) renderRank(roomData); openRank(); });
        return;
    }
    const personal = better(r, cache.record);
    if (personal) saveCache({ record: { time: r.time, tries: r.tries, words: r.words } });
    setText('goEmoji', personal ? '🏆' : '🎉');
    setText('goTitle', personal ? 'Nouveau record !' : 'Page trouvée !');
    setText('goPage', g.title);
    setText('goDuration', fmt(r.time));
    setText('goTries', r.tries); setText('goWords', r.words); setText('goHints', r.hints);
    setText('goBest', cache.record ? fmt(cache.record.time) : '—');
    setText('goMessage', personal ? 'Ton record local est sauvegardé.' : '');
    setText('goWorldStatus', '');
    setOpen('gameoverOverlay', true);
    void checkWorldRecord(r, g.runId);
}
$('goRestartBtn').addEventListener('click', restart);
$('goViewBtn').addEventListener('click', () => setOpen('gameoverOverlay', false));
$('goMenuBtn').addEventListener('click', () => { location.href = MENU_URL; });
$('loaderRetry').addEventListener('click', () => retryFn && retryFn());

// ═══ RECORDS MONDIAUX (solo) — même architecture que CultureQuiz ═══
// Critères : temps (principal) < essais < mots révélés (plus petit = meilleur)
const better = (a, b) => !b || !(b.time > 0) || a.time < b.time ||
    (a.time === b.time && (a.tries < b.tries || (a.tries === b.tries && a.words < b.words)));
function parseRemote(d) {
    if (!d || typeof d !== 'object') return null;
    const time = Number(d.duration ?? d.value) || 0;
    return time > 0 ? { time, tries: Number(d.tries) || 0, words: Number(d.words) || 0, message: String(d.message || '').slice(0, MSG_MAX) } : null;
}
let fbw = null;
async function getFb() { return fbw || (fbw = await import('../../../js/firebaseWrk.js')); }
async function online() { try { return !!(await Promise.race([checkRealConnection(), wait(2500, false)])); } catch { return false; } }

// Lit le record mondial et met le cache à jour. true = à jour, false = indisponible.
async function refreshWorld() {
    try {
        if (!(await online())) return false;
        const fb = await getFb();
        const d = await Promise.race([fb.getFirebaseRecordData(FB_GAME, FB_STAT), wait(2500, undefined)]);
        if (d === undefined) return false;               // timeout : on garde le cache
        const remote = parseRemote(d);
        saveCache({ worldBest: remote ? { time: remote.time, tries: remote.tries, words: remote.words } : null, worldMessage: remote?.message || '' });
        return true;
    } catch (e) { console.warn('Page Mystère : lecture du record mondial impossible.', e); return false; }
}

async function checkWorldRecord(r, run) {
    setText('goWorldStatus', 'Vérification du record mondial…');
    const fresh = await refreshWorld();
    if (run !== g.runId) return;
    if (!fresh) { setText('goWorldStatus', (await online()) ? 'Record mondial indisponible pour le moment.' : 'Hors ligne : tes records personnels restent sauvegardés.'); return; }
    if (better(r, cache.worldBest)) {
        pending = { ...r, run };
        setText('goEmoji', '🏆'); setText('goTitle', 'Record mondial potentiel !');
        setText('goWorldStatus', 'Tu pourrais détenir le record mondial !');
        $('recordMessagePopup').style.display = 'flex';
        $('recordMsgInput').value = ''; setText('recordCharCounter', `0/${MSG_MAX}`);
        setTimeout(() => $('recordMsgInput').focus(), 100);
    } else {
        setText('goWorldStatus', `Record mondial : ${fmt(cache.worldBest.time)} · ${cache.worldBest.tries} essais`);
    }
}

$('recordMsgInput').addEventListener('input', e => setText('recordCharCounter', `${e.target.value.length}/${MSG_MAX}`));
$('saveRecordMsgBtn').addEventListener('click', async () => {
    const rec = pending; if (!rec || rec.run !== g.runId) return;
    const btn = $('saveRecordMsgBtn'); btn.disabled = true; btn.textContent = 'Enregistrement…';
    let status = 'Record mondial non publié : connexion indisponible.';
    try {
        const fresh = await refreshWorld();
        if (fresh && !better(rec, cache.worldBest)) status = 'Un autre joueur a battu ce record entre-temps.';
        else if (await online()) {
            const fb = await getFb();
            const message = $('recordMsgInput').value.trim().slice(0, MSG_MAX);
            const base = { value: rec.time, duration: rec.time, message, timestamp: Date.now() };
            let ok = await Promise.race([fb.setFirebaseLeaderboard(FB_GAME, FB_STAT, { ...base, tries: rec.tries, words: rec.words }), wait(4000, false)]);
            // Repli si les règles refusent les champs supplémentaires
            if (ok !== true) ok = await Promise.race([fb.setFirebaseLeaderboard(FB_GAME, FB_STAT, base), wait(4000, false)]);
            if (ok === true) {
                saveCache({ worldBest: { time: rec.time, tries: rec.tries, words: rec.words }, worldMessage: message });
                status = '🌍 Record mondial publié !';
            }
        }
    } catch (e) { console.warn(e); }
    setText('goWorldStatus', status);
    $('recordMessagePopup').style.display = 'none'; pending = null;
    btn.disabled = false; btn.textContent = 'Sauvegarder';
});

function renderRecords() {
    const p = cache.record, w = cache.worldBest;
    setText('recPersonalTime', p ? fmt(p.time) : '—'); setText('recPersonalTries', p ? p.tries : '—'); setText('recPersonalWords', p ? p.words : '—');
    setText('recGlobalTime', w ? fmt(w.time) : '—'); setText('recGlobalTries', w ? w.tries || '—' : '—'); setText('recGlobalWords', w ? w.words || '—' : '—');
    const card = $('recGlobalCard');
    card.querySelectorAll('.rc-message').forEach(e => e.remove());
    if (w && cache.worldMessage) {
        const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${cache.worldMessage} »`; card.append(m);
    }
}
$('recordsBtn').addEventListener('click', async () => {
    pauseGame(false);
    setOpen('recordsOverlay', true);
    setText('recStatus', 'Synchronisation…'); renderRecords();
    const ok = await refreshWorld();
    renderRecords();
    setText('recStatus', ok ? 'À jour (Cloud)' : (await online()) ? 'Record mondial indisponible' : 'Hors ligne (Records locaux)');
});
function closeRecords() { setOpen('recordsOverlay', false); if (g.paused && !isOpen('pauseOverlay')) resumeGame(); }
$('recordsClose').addEventListener('click', closeRecords);
$('recordsOverlay').addEventListener('click', e => { if (e.target === $('recordsOverlay')) closeRecords(); });

// ═══ MULTIJOUEUR (rooms Wiki Challenge) ═══
// • Chrono commun : tous les joueurs se calent sur roundStartedAt (heure serveur) → même temps pour tous.
// • Départ commun : compte à rebours, article masqué jusqu'au top.
// • Fin de manche : dès qu'un joueur a trouvé (status « found »), les autres ont perdu → classement final.
const START_DELAY_MS = 5000;
let cfg = null, myUID = null, unsub = null, unsubOffset = null, hb = null, roomData = null, round = null, started = false, drawing = false, leaving = false;
let serverOffset = 0, startAt = 0, rankShown = false, lostHandled = false;
const ts = () => { const f = cfg.getServerTimestamp(); return f ? f() : Date.now(); };
const serverNow = () => Date.now() + serverOffset;
const isOff = p => !!p && typeof p.lastSeen === 'number' && Date.now() - p.lastSeen > OFFLINE_AFTER_MS;

// Décalage horloge locale ↔ serveur Firebase
async function syncClock() {
    try {
        await Promise.race([new Promise(resolve => {
            unsubOffset = cfg.getOnValue()(cfg.getRef()(cfg.database, '.info/serverTimeOffset'),
                snap => { serverOffset = Number(snap.val()) || 0; resolve(); }, () => resolve());
        }), wait(2000)]);
    } catch (e) { console.warn('serverTimeOffset:', e); }
}

async function initMulti() {
    showLoader('Connexion à la salle…');
    try {
        const [c, fb] = await Promise.all([import('../../../js/config/firebase-config.js'), getFb()]);
        cfg = c;
        const ready = await cfg.firebaseReady;
        if (!ready || !cfg.auth.currentUser) throw new Error('Firebase indisponible');
        myUID = cfg.auth.currentUser.uid;
        await syncClock();
        unsub = cfg.getOnValue()(cfg.getRef()(cfg.database, `rooms/${gid}`),
            snap => onRoom(snap.val()), err => console.warn('listener room:', err));
        beat(); hb = setInterval(beat, HEARTBEAT_MS);
    } catch (e) {
        console.warn(e);
        showLoader('Connexion à la salle impossible.', initMulti);
    }
}

function beat() {
    if (!myUID || leaving) return;
    if (roomData && !roomData.players?.[myUID]) return;
    try { cfg.getUpdate()(cfg.getRef()(cfg.database, `rooms/${gid}/players/${myUID}`), { lastSeen: ts() }).catch(() => { }); } catch { /* ignore */ }
}

function stopRoom() {
    if (typeof unsub === 'function') unsub(); unsub = null;
    if (typeof unsubOffset === 'function') unsubOffset(); unsubOffset = null;
    if (hb) clearInterval(hb); hb = null;
}

const isOver = data => Object.values(data?.players || {}).some(p => p.status === 'found');

function onRoom(data) {
    if (leaving) return;
    const me = data?.players?.[myUID];
    if (!data || !me) { stopRoom(); try { localStorage.removeItem(SAVED_ROOM_KEY); } catch { /* ignore */ } location.replace(MENU_URL); return; }
    roomData = data;
    if (data.currentRound !== round) {
        round = data.currentRound; started = false; drawing = false; rankShown = false; lostHandled = false;
        resetRound(); closeRank();
    }
    renderRank(data);

    // Un joueur a trouvé : manche terminée pour tout le monde
    if (isOver(data)) {
        if (me.status === 'searching') endAsLoser(data);
        if (!rankShown) { rankShown = true; hideLoader(); openRank(); }
        return;
    }
    // Arrivé en cours de manche : il attend la suivante
    if (me.status === 'waiting_next') {
        if (!rankShown) { rankShown = true; hideLoader(); openRank(); }
        return;
    }
    if (started) return;
    if (!data.startPage) {
        showLoader('Tirage de la page mystère…');
        if (data.leaderId === myUID && !drawing) publishDraw();
        return;
    }
    started = true;
    startAt = Number(data.roundStartedAt) || serverNow();
    loadAndStart(data.startPage, `${roomCode}:${round}`);
}

// Le premier a trouvé : on arrête la partie, on révèle la page, on publie nos stats
function endAsLoser(data) {
    if (lostHandled) return;
    lostHandled = true; started = true;
    const best = sortedRows(data).find(x => x.r.found);
    closeOverlays();
    if (g.running) {
        g.running = false; g.over = true; g.paused = false; g.countdown = false;
        cancelAnimationFrame(g.raf); setInputs(false); $('pauseBtn').disabled = false; clearGame();
        $('reader').classList.remove('veiled');
        revealAll();
        if (best?.r.time) $('timer').textContent = fmt(best.r.time);
        say(`😕 ${best?.p.name || 'Un joueur'} a trouvé « ${g.title} » !`, 'bad');
        publishLoss({ tries: g.tries, words: g.revealedKeys.size, hints: g.hints });
    } else {
        g.token++; g.over = true;     // page encore en chargement : on abandonne
    }
    hideLoader();
}

async function publishDraw() {
    drawing = true;
    try {
        const page = await drawPage();
        // départ dans START_DELAY_MS : le temps que chacun charge la page
        await cfg_update({ startPage: page.title, roundStartedAt: serverNow() + START_DELAY_MS });
    } catch (e) {
        console.warn(e);
        drawing = false;
        showLoader('Tirage impossible. Vérifie ta connexion.', () => { showLoader('Tirage de la page mystère…'); publishDraw(); });
    }
}
const cfg_update = async upd => { const ok = await fbw.updateRoom(gid, upd); if (!ok) throw new Error('updateRoom'); };

async function publishResult(r) {
    const base = { [`players/${myUID}/status`]: 'found', [`players/${myUID}/finishedAt`]: ts() };
    try {
        const ok = await fbw.updateRoom(gid, { ...base, [`players/${myUID}/page`]: `${r.time}|${r.tries}|${r.words}|${r.hints}` });
        if (!ok) await fbw.updateRoom(gid, base);   // repli si les règles refusent `page`
    } catch (e) { console.warn(e); }
}

// Stats des perdants (temps = 0), pour le classement final
async function publishLoss(r) {
    try { await fbw.updateRoom(gid, { [`players/${myUID}/page`]: `0|${r.tries}|${r.words}|${r.hints}` }); } catch (e) { console.warn(e); }
}

function parseRes(p) {
    const raw = typeof p.page === 'string' && p.page.includes('|') ? p.page : '';
    const [t, a, w, h] = raw.split('|').map(Number);
    return { found: p.status === 'found', has: !!raw, time: t > 0 ? t : 0, tries: a || 0, words: w || 0, hints: h || 0 };
}

// Trouvés (par temps) → perdants (par mots révélés) → joueurs en attente de la prochaine manche
function sortedRows(data) {
    const rows = Object.entries(data.players).map(([uid, p]) => ({ uid, p, r: parseRes(p) }));
    const wait_ = x => x.p.status === 'waiting_next' ? 1 : 0;
    return rows.sort((a, b) => wait_(a) - wait_(b)
        || (a.r.found !== b.r.found ? (a.r.found ? -1 : 1) : 0)
        || (a.r.found ? (a.r.time || 1e12) - (b.r.time || 1e12) || a.r.tries - b.r.tries
            : b.r.words - a.r.words || a.r.tries - b.r.tries || String(a.p.name).localeCompare(String(b.p.name))));
}

function renderRank(data) {
    const me = data.players[myUID];
    const over = isOver(data);
    const rows = sortedRows(data);
    let n = 0;
    $('rankList').replaceChildren(...rows.map(({ uid, p, r }, i) => {
        const li = document.createElement('li');
        const waiting = p.status === 'waiting_next';
        li.className = [r.found && i === 0 ? 'win' : '', uid === myUID ? 'me' : '', isOff(p) && !r.found ? 'off' : ''].filter(Boolean).join(' ');
        const rk = document.createElement('span'); rk.className = 'rk';
        rk.textContent = r.found ? (++n === 1 ? '🥇' : `#${n}`) : waiting ? '⏳' : over ? '✖' : '…';
        const nm = document.createElement('span'); nm.className = 'nm';
        nm.textContent = `${uid === data.leaderId ? '👑 ' : ''}${p.name || 'Joueur'}${uid === myUID ? ' (toi)' : ''}`;
        const dt = document.createElement('span'); dt.className = 'dt';
        const stats = `${plural(r.tries, 'essai')} · ${plural(r.words, 'mot')}${r.hints ? ` · ${plural(r.hints, 'indice')}` : ''}`;
        dt.textContent = r.found ? (r.time ? `${fmt(r.time)} · ${stats}` : 'Page trouvée')
            : waiting ? 'Rejoint la prochaine manche'
            : over ? (r.has ? `Perdu · ${stats}` : 'Perdu')
            : isOff(p) ? 'Déconnecté' : 'Cherche…';
        li.append(rk, nm, dt); return li;
    }));

    const best = rows[0]?.r.found ? rows[0] : null;
    const pageName = g.title || data.startPage || '?';
    let emoji = '🏆', title = 'Classement', note = '';
    if (me.status === 'waiting_next' && !over) { emoji = '⏳'; title = 'Manche en cours'; note = 'Tu joueras la prochaine manche.'; }
    else if (over && best) {
        if (me.status === 'waiting_next') { emoji = '🏁'; title = 'Manche terminée'; }
        else if (best.uid === myUID) { emoji = '🏆'; title = 'Victoire !'; }
        else if (me.status === 'found') { emoji = '🥈'; title = 'Trouvé, mais battu !'; }
        else { emoji = '😕'; title = 'Perdu !'; }
        note = best.uid === myUID ? `La page était « ${pageName} ».`
            : `${best.p.name || 'Un joueur'} a trouvé « ${pageName} »${best.r.time ? ` en ${fmt(best.r.time)}` : ''}.`;
    }
    setText('rankEmoji', emoji); setText('rankTitle', title); setText('rankNote', note);
    const isLeader = data.leaderId === myUID;
    $('rankReplayBtn').hidden = !(isLeader && over);
    $('waitLeader').hidden = isLeader || !over;
    $('closeRankBtn').hidden = !(g.over && g.page);
}

function openRank() { setOpen('rankOverlay', true); }
function closeRank() { setOpen('rankOverlay', false); }
$('closeRankBtn').addEventListener('click', closeRank);
$('rankQuitBtn').addEventListener('click', leaveRoom);

$('rankReplayBtn').addEventListener('click', async () => {
    const btn = $('rankReplayBtn'); btn.disabled = true;
    try {
        const fresh = await fbw.getRoom(gid);
        if (!fresh || fresh.leaderId !== myUID) return;
        const u = { state: 'playing', currentRound: (fresh.currentRound || 0) + 1, startPage: null, targetPage: null, roundStartedAt: null, endReason: null };
        for (const uid of Object.keys(fresh.players || {})) {
            u[`players/${uid}/status`] = 'searching'; u[`players/${uid}/page`] = null; u[`players/${uid}/finishedAt`] = null;
        }
        await fbw.updateRoom(gid, u);
    } catch (e) { console.warn(e); } finally { btn.disabled = false; }
});

async function leaveRoom() {
    if (leaving) return;
    leaving = true; stopRoom();
    try {
        const latest = await fbw.getRoom(gid);
        if (latest) {
            const others = Object.entries(latest.players || {}).filter(([u]) => u !== myUID);
            if (!others.length) await fbw.deleteRoom(gid);
            else {
                const u = { [`players/${myUID}`]: null };
                if (latest.leaderId === myUID) u.leaderId = (others.find(([, p]) => !isOff(p)) || others[0])[0];
                await fbw.updateRoom(gid, u);
            }
        }
    } catch (e) { console.warn(e); }
    try { localStorage.removeItem(SAVED_ROOM_KEY); } catch { /* ignore */ }
    location.href = MENU_URL;
}

// ═══ INIT ═══
if (isMulti) initMulti(); else loadAndStart(null, 'solo');
