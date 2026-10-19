/** Pendu — menu : solo / multi (rooms Firebase calquées sur Page Mystère, 2 joueurs max). Firebase chargé à la demande (solo hors ligne). */
import { tr, initLang } from './core/lang.js';

await initLang('meta.title');

const GAME_PREFIX = 'hangman_';
const SAVED_ROOM_KEY = 'hangman_room';
const SOLO_KEY = 'hangman';
const NAME_KEY = 'mg_player_name';
const HEARTBEAT_MS = 20000;
const OFFLINE_AFTER_MS = 75000;
const DEAD_ROOM_AFTER_MS = 5 * 60 * 1000;

let fb = null, cfg = null, net = null;
let myUID = null, currentCode = null, roomData = null, roomUnsub = null, hbTimer = null, serverOffset = 0, redirecting = false;
const busy = { create: false, join: false, leave: false };

const $ = id => document.getElementById(id);
const tabSolo = $('tabSolo'), tabMulti = $('tabMulti'), soloOptions = $('soloOptions'), multiOptions = $('multiOptions');
const createRoomBtn = $('createRoomBtn'), createStatus = $('createStatus'), joinRoomBtn = $('joinRoomBtn');
const roomCodeInput = $('roomCodeInput'), joinStatus = $('joinStatus'), waitingOverlay = $('waitingOverlay');
const displayRoomCode = $('displayRoomCode'), waitingPlayers = $('waitingPlayers'), waitingStatus = $('waitingStatus');
const leaveRoomBtn = $('leaveRoomBtn'), copyCodeBtn = $('copyCodeBtn'), playerNameInput = $('playerNameInput');

const gameIdOf = code => `${GAME_PREFIX}${code}`;
const ts = () => { const f = cfg.getServerTimestamp(); return f ? f() : Date.now(); };
const serverNow = () => Date.now() + serverOffset;
const isOffline = p => !!p && typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > OFFLINE_AFTER_MS;
const isRoomDead = d => { const ps = Object.values(d.players || {}); return !ps.length || ps.every(p => typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > DEAD_ROOM_AFTER_MS); };
const setStatus = (el, msg, ok = false) => { if (el) { el.textContent = msg || ''; el.classList.toggle('ok', !!ok); } };
const generateRoomCode = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join(''); };
const newPlayer = name => ({ name, score: 0, uid: myUID, joined: ts(), status: 'waiting', lastSeen: ts() });
const readSavedRoom = () => { try { return localStorage.getItem(SAVED_ROOM_KEY) || null; } catch { return null; } };
const saveRoom = c => { try { localStorage.setItem(SAVED_ROOM_KEY, c); } catch { /* ignore */ } };
const clearSavedRoom = () => { try { localStorage.removeItem(SAVED_ROOM_KEY); } catch { /* ignore */ } };

// ── Firebase à la demande ──
async function initFb() {
    if (myUID) return true;
    try {
        net ||= await import('../../../js/network.js');
        if (!(await net.checkRealConnection())) return false;
        [cfg, fb] = await Promise.all([import('../../../js/config/firebase-config.js'), import('../../../js/firebaseWrk.js')]);
        const ready = await cfg.firebaseReady;
        if (!ready || !cfg.auth.currentUser) return false;
        myUID = cfg.auth.currentUser.uid;
        await new Promise(resolve => {
            const t = setTimeout(resolve, 2500);
            try { cfg.getOnValue()(cfg.getRef()(cfg.database, '.info/serverTimeOffset'), s => { serverOffset = Number(s.val()) || 0; clearTimeout(t); resolve(); }); } catch { resolve(); }
        });
        return true;
    } catch (e) { console.warn(e); return false; }
}

// ── Pseudo (username global de la plateforme) ──
playerNameInput.value = localStorage.getItem(NAME_KEY) || '';
playerNameInput.addEventListener('input', () => { const n = playerNameInput.value.trim(); if (n) localStorage.setItem(NAME_KEY, n); });
function getPlayerName() {
    const n = playerNameInput.value.trim();
    if (!n) { playerNameInput.focus(); playerNameInput.style.borderColor = 'var(--rose)'; return null; }
    playerNameInput.style.borderColor = '';
    localStorage.setItem(NAME_KEY, n);
    return n;
}

// ── Onglets ──
tabSolo.addEventListener('click', () => switchTab('solo'));
tabMulti.addEventListener('click', () => switchTab('multi'));
function switchTab(tab) {
    tabSolo.classList.toggle('active', tab === 'solo');
    tabMulti.classList.toggle('active', tab === 'multi');
    soloOptions.style.display = tab === 'solo' ? 'flex' : 'none';
    multiOptions.style.display = tab === 'multi' ? 'flex' : 'none';
}

// ── Solo : nouvelle partie = efface la partie en cours ──
$('soloStartBtn').addEventListener('click', () => {
    try { localStorage.removeItem(SOLO_KEY); } catch { /* ignore */ }
    location.href = 'game.html?mode=solo';
});

// ── Reprise de salle ──
(async function restore() {
    const code = readSavedRoom();
    if (!code || !(await initFb())) return;
    const data = await fb.getRoom(gameIdOf(code));
    if (!data || !data.players?.[myUID]) { clearSavedRoom(); return; }
    enterRoom(code);
})();

// ── Création ──
createRoomBtn.addEventListener('click', async () => {
    if (busy.create) return;
    const name = getPlayerName(); if (!name) return;
    busy.create = true; createRoomBtn.disabled = true; createRoomBtn.textContent = tr('menu.creating'); setStatus(createStatus, '');
    try {
        if (!(await initFb())) { setStatus(createStatus, tr('menu.offline_multi')); return; }
        let created = null;
        for (let i = 0; i < 3 && !created; i++) {
            const code = generateRoomCode();
            const ok = await fb.createRoom(gameIdOf(code), {
                code, state: 'waiting', leaderId: myUID, currentRound: 0, createdAt: ts(), numPlayers: 2,
                players: { [myUID]: newPlayer(name) }
            });
            if (ok) created = code;
        }
        if (!created) throw new Error('createRoom a échoué');
        enterRoom(created);
    } catch (e) { console.error(e); setStatus(createStatus, tr('menu.create_error')); }
    finally { busy.create = false; createRoomBtn.disabled = false; createRoomBtn.textContent = tr('menu.create_btn'); }
});

// ── Rejoindre ──
joinRoomBtn.addEventListener('click', handleJoinRoom);
roomCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleJoinRoom(); });
async function handleJoinRoom() {
    if (busy.join) return;
    const name = getPlayerName(); if (!name) return;
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) { setStatus(joinStatus, tr('menu.code_invalid')); return; }
    busy.join = true; joinRoomBtn.disabled = true; setStatus(joinStatus, tr('menu.searching'));
    try {
        if (!(await initFb())) { setStatus(joinStatus, tr('menu.offline_multi')); return; }
        const gameId = gameIdOf(code);
        const data = await fb.getRoom(gameId);
        if (!data) { setStatus(joinStatus, tr('menu.not_found')); return; }
        if (data.players?.[myUID]) { setStatus(joinStatus, ''); enterRoom(code); return; }
        if (isRoomDead(data)) { await fb.deleteRoom(gameId); setStatus(joinStatus, tr('menu.not_found')); return; }
        if (Object.keys(data.players || {}).length >= 2) { setStatus(joinStatus, tr('menu.room_full')); return; }
        const res = await fb.joinRoom(gameId, newPlayer(name));
        if (res !== true) { console.warn('joinRoom:', res); setStatus(joinStatus, tr('menu.join_failed')); return; }
        setStatus(joinStatus, ''); enterRoom(code);
    } catch (e) { console.error(e); setStatus(joinStatus, tr('menu.join_failed')); }
    finally { busy.join = false; joinRoomBtn.disabled = false; }
}

// ── Salle ──
function enterRoom(code) {
    currentCode = code; roomData = null; redirecting = false;
    saveRoom(code); switchTab('multi'); listenToRoom(code); startHeartbeat();
}
function resetRoomState(msg) {
    stopListening(); stopHeartbeat();
    waitingOverlay.style.display = 'none'; currentCode = null; roomData = null; clearSavedRoom();
    if (msg) setStatus(joinStatus, msg);
}
function listenToRoom(code) {
    stopListening();
    roomUnsub = cfg.getOnValue()(cfg.getRef()(cfg.database, `rooms/${gameIdOf(code)}`), s => handleRoomUpdate(code, s.val()), e => console.warn('listener room:', e));
}
function stopListening() { if (typeof roomUnsub === 'function') roomUnsub(); roomUnsub = null; }

function handleRoomUpdate(code, data) {
    if (code !== currentCode || redirecting) return;
    if (!data || !data.players?.[myUID]) { resetRoomState(data ? tr('menu.left_room') : tr('menu.room_closed')); return; }
    roomData = data;
    if (Object.keys(data.players).length >= 2) { goToGame(code); return; }
    showWaitingRoom(code, data);
}
function goToGame(code) {
    if (redirecting) return;
    redirecting = true; stopListening(); stopHeartbeat();
    location.href = `game.html?room=${encodeURIComponent(code)}`;
}
function showWaitingRoom(code, data) {
    waitingOverlay.style.display = 'flex';
    displayRoomCode.textContent = code;
    waitingPlayers.replaceChildren(...Object.entries(data.players).map(([uid, p]) => {
        const d = document.createElement('div');
        const off = isOffline(p);
        d.className = 'gs-player-chip' + (uid === myUID ? ' me' : '') + (off ? ' offline' : '');
        d.textContent = `${p.name || tr('room.player')}${uid === myUID ? ' ' + tr('room.you') : ''}`;
        return d;
    }));
}

// ── Présence ──
function startHeartbeat() { stopHeartbeat(); beat(); hbTimer = setInterval(beat, HEARTBEAT_MS); }
function stopHeartbeat() { if (hbTimer) clearInterval(hbTimer); hbTimer = null; }
function beat() {
    if (!currentCode || !myUID || redirecting) return;
    if (roomData && !roomData.players?.[myUID]) return;
    try { cfg.getUpdate()(cfg.getRef()(cfg.database, `rooms/${gameIdOf(currentCode)}/players/${myUID}`), { lastSeen: ts() }).catch(() => { }); } catch { /* ignore */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });

// ── Quitter (départ volontaire) ──
leaveRoomBtn.addEventListener('click', async () => {
    if (busy.leave || !currentCode || !myUID) return;
    busy.leave = true; leaveRoomBtn.disabled = true;
    const code = currentCode;
    stopListening(); stopHeartbeat(); redirecting = true;
    try {
        const gameId = gameIdOf(code);
        const latest = await fb.getRoom(gameId);
        if (latest) {
            const others = Object.entries(latest.players || {}).filter(([u]) => u !== myUID);
            if (!others.length) await fb.deleteRoom(gameId);
            else {
                const u = { [`players/${myUID}`]: null };
                if (latest.leaderId === myUID) u.leaderId = others[0][0];
                await fb.updateRoom(gameId, u);
            }
        }
    } catch (e) { console.error(e); }
    finally {
        waitingOverlay.style.display = 'none'; currentCode = null; roomData = null; clearSavedRoom();
        redirecting = false; busy.leave = false; leaveRoomBtn.disabled = false;
    }
});

copyCodeBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(currentCode || ''); copyCodeBtn.textContent = tr('room.copied'); }
    catch { copyCodeBtn.textContent = tr('room.copy_failed'); }
    setTimeout(() => { copyCodeBtn.textContent = tr('room.copy'); }, 2000);
});
window.addEventListener('beforeunload', () => { stopListening(); stopHeartbeat(); });
