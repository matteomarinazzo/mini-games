/**
 * Démineur — menu.js
 * Menu (solo / multi), création et jonction de salle, salle d'attente (overlay),
 * présence (heartbeat), reconnexion, départ volontaire, lancement par le leader.
 * Calqué sur Wiki-Challenge/menu.js : mêmes imports, mêmes wrappers firebaseWrk.js,
 * même format d'identifiant de salle (`<jeu>_<CODE>`), mêmes règles de présence.
 */
import { database, auth, firebaseReady, getServerTimestamp, getRef, getOnValue, getUpdate } from "../../../js/config/firebase-config.js";
import { createRoom, joinRoom, updateRoom, getRoom, deleteRoom } from "../../../js/firebaseWrk.js";
import { checkRealConnection } from "../../../js/network.js";

// ── CONSTANTES ──
const GAME_PREFIX = 'minesweeper_';          // rooms/minesweeper_<CODE>
const SAVED_ROOM_KEY = 'minesweeper_room';
const NAME_KEY = 'minesweeper_playerName';
const HEARTBEAT_MS = 20000;
const OFFLINE_AFTER_MS = 75000;
const DEAD_ROOM_AFTER_MS = 10 * 60 * 1000;
const DIFFICULTIES = {
    easy: { w: 9, h: 9, mines: 10 },
    medium: { w: 16, h: 16, mines: 40 },
    hard: { w: 30, h: 16, mines: 99 },
    extreme: { w: 50, h: 50, mines: 500 },
};

// ── STATE ──
let mode = 'solo', multiTab = 'create', difficulty = 'easy', customOpen = false;
let myUID = null, currentCode = null, roomData = null, roomUnsub = null, hbTimer = null;
let serverOffset = 0, redirecting = false, takingLead = false;
const busy = { create: false, join: false, start: false, leave: false };

// ── DOM ──
const $ = id => document.getElementById(id);
const btnSolo = $('btnSolo'), btnMulti = $('btnMulti'), multiTabs = $('multiTabs');
const sectionConfig = $('sectionConfig'), sectionJoin = $('sectionJoin'), ctaArea = $('ctaArea');
const startBtn = $('startBtn'), startBtnLabel = $('startBtnLabel'), createStatus = $('createStatus');
const nameInput = $('playerNameInput'), roomCodeInput = $('roomCodeInput');
const joinRoomBtn = $('joinRoomBtn'), joinStatus = $('joinStatus');
const customToggle = $('customToggle'), customPanel = $('customPanel');
const customW = $('customW'), customH = $('customH'), customM = $('customM'), customHint = $('customHint');
const diffBtns = document.querySelectorAll('.diff-btn'), tabBtns = document.querySelectorAll('.tab-btn');
const waitingOverlay = $('waitingOverlay'), displayRoomCode = $('displayRoomCode'), cfgSummary = $('cfgSummary');
const waitingPlayers = $('waitingPlayers'), waitingHint = $('waitingHint'), waitingStatus = $('waitingStatus');
const leaderControls = $('leaderControls'), startGameBtn = $('startGameBtn');
const leaveRoomBtn = $('leaveRoomBtn'), copyCodeBtn = $('copyCodeBtn');

// ── i18n (tolérant : window.t(key, fallback)) ──
const t = (k, fb) => { try { const v = window.t?.(k, fb); return (v && v !== k) ? v : (fb ?? k); } catch (e) { return fb ?? k; } };
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

// ── HELPERS ──
const gameIdOf = code => `${GAME_PREFIX}${code}`;
const ts = () => { const f = getServerTimestamp(); return f ? f() : Date.now(); };
const serverNow = () => Date.now() + serverOffset;
const isOffline = p => !!p && typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > OFFLINE_AFTER_MS;
const isRoomDead = d => {
    const ps = Object.values(d.players || {});
    return !ps.length || ps.every(p => typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > DEAD_ROOM_AFTER_MS);
};
const setStatus = (el, msg, ok = false) => { if (!el) return; el.textContent = msg || ''; el.classList.toggle('ok', !!ok); };
const generateRoomCode = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join(''); };
const newPlayer = (name, status) => ({ name, score: 0, uid: myUID, joined: ts(), status, lastSeen: ts() }); // `score` exigé par les règles
const readSavedRoom = () => { try { return localStorage.getItem(SAVED_ROOM_KEY) || null; } catch (e) { return null; } };
const saveRoom = c => { try { localStorage.setItem(SAVED_ROOM_KEY, c); } catch (e) { } };
const clearSavedRoom = () => { try { localStorage.removeItem(SAVED_ROOM_KEY); } catch (e) { } };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const maxMinesFor = (w, h) => Math.max(1, Math.min(Math.floor(w * h * 0.85), w * h - 12));

function watchServerOffset() {
    return new Promise(resolve => {
        const to = setTimeout(resolve, 2500);
        try { getOnValue()(getRef()(database, '.info/serverTimeOffset'), s => { serverOffset = Number(s.val()) || 0; clearTimeout(to); resolve(); }); }
        catch (e) { resolve(); }
    });
}

// ── CONFIG ──
function getConfig() {
    if (customOpen) {
        const w = clamp(parseInt(customW.value) || 9, 5, 60);
        const h = clamp(parseInt(customH.value) || 9, 5, 60);
        return { w, h, mines: clamp(parseInt(customM.value) || 10, 1, maxMinesFor(w, h)) };
    }
    return { ...DIFFICULTIES[difficulty] };
}

function updateCustomHint() {
    const w = clamp(parseInt(customW.value) || 0, 0, 60), h = clamp(parseInt(customH.value) || 0, 0, 60);
    let m = parseInt(customM.value) || 0;
    if (w < 5 || h < 5) { customHint.textContent = ''; return; }
    const max = maxMinesFor(w, h), total = w * h;
    if (m > max) {
        customHint.classList.add('warn');
        customHint.textContent = fmt(t('minesweeper.menu.custom_hint_warn', '⚠ Trop de bombes ! Maximum {max} pour cette grille'), { max });
        return;
    }
    customHint.classList.remove('warn');
    customHint.textContent = fmt(t('minesweeper.menu.custom_hint_ok', '{mines} bombes sur {total} cases — densité {pct}%'),
        { mines: m, total, pct: Math.round(m / total * 100) });
}

function updateUI() {
    btnSolo.classList.toggle('active', mode === 'solo');
    btnMulti.classList.toggle('active', mode === 'multi');
    multiTabs.classList.toggle('hidden', mode === 'solo');
    const joining = mode === 'multi' && multiTab === 'join';
    sectionConfig.classList.toggle('hidden', joining);
    sectionJoin.classList.toggle('hidden', !joining);
    ctaArea.classList.toggle('hidden', joining);
    startBtnLabel.textContent = mode === 'solo'
        ? t('minesweeper.menu.start_btn', 'Commencer la partie')
        : t('minesweeper.menu.start_btn_create', 'Créer la salle');
}

btnSolo.addEventListener('click', () => { mode = 'solo'; updateUI(); });
btnMulti.addEventListener('click', () => { mode = 'multi'; updateUI(); });
tabBtns.forEach(b => b.addEventListener('click', () => {
    multiTab = b.dataset.tab; tabBtns.forEach(x => x.classList.toggle('active', x === b)); updateUI();
}));
diffBtns.forEach(b => b.addEventListener('click', () => {
    difficulty = b.dataset.diff; diffBtns.forEach(x => x.classList.toggle('active', x === b));
    customOpen = false; customPanel.classList.remove('open'); customToggle.classList.remove('active');
}));
customToggle.addEventListener('click', () => {
    customOpen = !customOpen;
    customPanel.classList.toggle('open', customOpen);
    customToggle.classList.toggle('active', customOpen);
    if (customOpen) { diffBtns.forEach(b => b.classList.remove('active')); updateCustomHint(); }
    else diffBtns.forEach(b => b.classList.toggle('active', b.dataset.diff === difficulty));
});
[customW, customH, customM].forEach(el => el.addEventListener('input', updateCustomHint));
roomCodeInput.addEventListener('input', () => { roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

// ── PSEUDO ──
const savedName = localStorage.getItem(NAME_KEY) || localStorage.getItem('mg_player_name') || '';
if (savedName) nameInput.value = savedName;
function getPlayerName() {
    const n = nameInput.value.trim();
    if (!n) { nameInput.focus(); nameInput.style.borderColor = 'var(--danger)'; setStatus(createStatus, t('minesweeper.menu.error_name', 'Entrez un nom de soldat avant de continuer.')); return null; }
    nameInput.style.borderColor = '';
    setStatus(createStatus, '');
    localStorage.setItem(NAME_KEY, n); localStorage.setItem('mg_player_name', n);
    return n;
}

// ── INIT : i18n, connexion, auth ──
(async function init() {
    try { if (window.initI18n) await window.initI18n(); window.refreshTexts?.(); } catch (e) { }
    nameInput.placeholder = t('minesweeper.menu.name_placeholder', 'Ex : Ghost');
    roomCodeInput.placeholder = t('minesweeper.menu.join_code_placeholder', 'Ex : AB3X7Z');
    updateUI(); updateCustomHint();

    const online = await checkRealConnection().catch(() => false);
    if (!online) { setMultiEnabled(false, t('minesweeper.menu.error_offline', 'Multijoueur indisponible : pas de connexion.')); return; }
    const ready = await firebaseReady;
    const user = ready ? auth.currentUser : null;
    if (!user) { setMultiEnabled(false, t('minesweeper.menu.error_firebase', 'Multijoueur indisponible (Firebase).')); return; }
    myUID = user.uid;
    await watchServerOffset();
    await restoreSavedRoom();
})();

function setMultiEnabled(on, msg) {
    btnMulti.disabled = !on; btnMulti.style.opacity = on ? '' : '.5';
    if (!on) setStatus(createStatus, msg);
}

async function restoreSavedRoom() {
    const code = readSavedRoom();
    if (!code) return;
    const data = await getRoom(gameIdOf(code));
    if (!data || !data.players?.[myUID]) { clearSavedRoom(); return; }
    mode = 'multi'; updateUI();
    enterRoom(code);
}

// ── SOLO ──
function startSolo() {
    const cfg = getConfig();
    const name = nameInput.value.trim() || 'Soldat';
    localStorage.setItem(NAME_KEY, name);
    window.location.href = `game.html?${new URLSearchParams({ mode: 'solo', w: cfg.w, h: cfg.h, mines: cfg.mines, name })}`;
}

// ── CRÉER UNE SALLE ──
async function startCreateRoom() {
    if (busy.create) return;
    const name = getPlayerName(); if (!name) return;
    if (!myUID) { setStatus(createStatus, t('minesweeper.menu.connecting', 'Connexion en cours, réessayez dans un instant.')); return; }
    busy.create = true; startBtn.disabled = true;
    startBtnLabel.textContent = t('minesweeper.menu.creating_room', 'Création de la salle…');
    try {
        const cfg = getConfig();
        let created = null;
        for (let i = 0; i < 3 && !created; i++) {
            const code = generateRoomCode();
            const ok = await createRoom(gameIdOf(code), {
                code, state: 'waiting', leaderId: myUID, currentRound: 0, createdAt: ts(),
                numPlayers: 2, config: cfg,
                players: { [myUID]: newPlayer(name, 'waiting') }
            });
            if (ok) created = code;
        }
        if (!created) throw new Error('createRoom a échoué');
        enterRoom(created);
    } catch (e) {
        console.error(e);
        setStatus(createStatus, t('minesweeper.menu.create_error', 'Erreur lors de la création de la salle.'));
    } finally { busy.create = false; startBtn.disabled = false; updateUI(); }
}

startBtn.addEventListener('click', () => { if (mode === 'solo') startSolo(); else startCreateRoom(); });

// ── REJOINDRE ──
joinRoomBtn.addEventListener('click', handleJoinRoom);
roomCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleJoinRoom(); });

async function handleJoinRoom() {
    if (busy.join) return;
    const name = getPlayerName(); if (!name) return;
    if (!myUID) { setStatus(joinStatus, t('minesweeper.menu.connecting', 'Connexion en cours, réessayez dans un instant.')); return; }
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) { setStatus(joinStatus, t('minesweeper.menu.error_code', 'Entrez un code de salle valide (6 caractères).')); return; }

    busy.join = true; joinRoomBtn.disabled = true;
    setStatus(joinStatus, t('minesweeper.menu.joining_room', 'Connexion à la salle…'), true);
    try {
        const gameId = gameIdOf(code);
        const data = await getRoom(gameId);
        if (!data || isRoomDead(data)) { setStatus(joinStatus, t('minesweeper.menu.error_room_not_found', 'Salle introuvable. Vérifiez le code.')); return; }

        // Déjà membre : reconnexion sans réécrire le joueur
        if (data.players?.[myUID]) { setStatus(joinStatus, ''); enterRoom(code); return; }

        if (data.state !== 'waiting') { setStatus(joinStatus, t('minesweeper.menu.error_started', 'La partie a déjà commencé.')); return; }
        if (Object.keys(data.players || {}).length >= 2) { setStatus(joinStatus, t('minesweeper.menu.error_room_full', 'Cette salle est déjà pleine.')); return; }

        const res = await joinRoom(gameId, newPlayer(name, 'waiting'));
        if (res !== true) { // joinRoom renvoie une chaîne en cas d'échec
            console.warn('joinRoom:', res);
            setStatus(joinStatus, t('minesweeper.menu.error_room_full', 'Cette salle est déjà pleine.')); return;
        }
        setStatus(joinStatus, ''); enterRoom(code);
    } catch (e) {
        console.error(e); setStatus(joinStatus, t('minesweeper.menu.join_error', 'Erreur lors de la connexion à la salle.'));
    } finally { busy.join = false; joinRoomBtn.disabled = false; }
}

// ── ENTRÉE / SORTIE DE SALLE ──
function enterRoom(code) {
    currentCode = code; roomData = null; redirecting = false;
    saveRoom(code); listenToRoom(code); startHeartbeat();
}
function resetRoomState(message) {
    stopListening(); stopHeartbeat();
    waitingOverlay.style.display = 'none';
    currentCode = null; roomData = null; clearSavedRoom();
    if (message) setStatus(createStatus, message);
}

// ── LISTENER TEMPS RÉEL ──
function listenToRoom(code) {
    stopListening();
    const ref = getRef(), onValue = getOnValue();
    if (!ref || !onValue) return;
    roomUnsub = onValue(ref(database, `rooms/${gameIdOf(code)}`), snap => handleRoomUpdate(code, snap.val()), err => console.warn('listener room:', err));
}
function stopListening() { if (typeof roomUnsub === 'function') roomUnsub(); roomUnsub = null; }

function handleRoomUpdate(code, data) {
    if (code !== currentCode || redirecting) return;
    if (!data || !data.players?.[myUID]) {
        resetRoomState(data ? t('minesweeper.menu.left_room', 'Vous avez quitté la salle.') : t('minesweeper.room.closed', 'La salle a été fermée.'));
        return;
    }
    roomData = data;
    if (data.state === 'playing') { goToGame(code); return; }
    maybeTakeLeadership(data);
    showWaitingRoom(code, data);
}
function goToGame(code) {
    if (redirecting) return;
    redirecting = true; stopListening(); stopHeartbeat();
    window.location.href = `game.html?room=${encodeURIComponent(code)}`;
}

// ── SALLE D'ATTENTE ──
const sortedPlayers = data => Object.entries(data.players || {}).sort((a, b) => {
    const ja = typeof a[1].joined === 'number' ? a[1].joined : 0, jb = typeof b[1].joined === 'number' ? b[1].joined : 0;
    return ja - jb || a[0].localeCompare(b[0]);
});

function playerChip(uid, p, leaderId) {
    const d = document.createElement('div');
    d.className = 'player-chip' + (uid === leaderId ? ' leader' : '') + (uid === myUID ? ' me' : '') + (isOffline(p) ? ' offline' : '');
    const nm = document.createElement('span'); nm.className = 'nm';
    nm.textContent = p.name || 'Soldat';                       // textContent : pas d'injection HTML
    if (uid === myUID) nm.dataset.you = `(${t('minesweeper.room.you', 'Vous')})`;
    d.appendChild(nm);
    const right = document.createElement('span');
    if (isOffline(p)) { const b = document.createElement('span'); b.className = 'badge off'; b.textContent = t('minesweeper.menu.offline_tag', 'DÉCONNECTÉ'); right.appendChild(b); }
    else if (uid === leaderId) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = t('minesweeper.room.player_leader', 'LEADER'); right.appendChild(b); }
    d.appendChild(right);
    return d;
}

function showWaitingRoom(code, data) {
    waitingOverlay.style.display = 'flex';
    displayRoomCode.textContent = code;
    const cfg = data.config || {};
    cfgSummary.innerHTML = `<span>${cfg.w}×${cfg.h}</span><span>·</span><span>${cfg.mines}</span><svg><use href="#i-bomb"/></svg>`;

    const entries = sortedPlayers(data);
    const nodes = entries.slice(0, 2).map(([uid, p]) => playerChip(uid, p, data.leaderId));
    while (nodes.length < 2) {
        const e = document.createElement('div'); e.className = 'player-chip empty';
        e.textContent = t('minesweeper.room.waiting_a_player', "En attente d'un soldat…"); nodes.push(e);
    }
    waitingPlayers.replaceChildren(...nodes);

    const isLeader = data.leaderId === myUID, full = entries.length >= 2;
    leaderControls.style.display = isLeader ? 'block' : 'none';
    waitingHint.textContent = !full ? t('minesweeper.room.waiting_player', 'En attente du deuxième soldat…')
        : isLeader ? '' : t('minesweeper.menu.waiting_leader', 'En attente du lancement par le créateur…');
    if (isLeader) startGameBtn.disabled = busy.start || !full;
}

// ── LEADERSHIP & PRÉSENCE ──
function maybeTakeLeadership(data) {
    if (takingLead || data.leaderId === myUID) return;
    const leader = data.players?.[data.leaderId];
    if (leader && !isOffline(leader)) return;
    const cand = sortedPlayers(data).find(([, p]) => !isOffline(p));
    if (!cand || cand[0] !== myUID) return;
    takingLead = true;
    updateRoom(gameIdOf(currentCode), { leaderId: myUID }).catch(() => { }).finally(() => { takingLead = false; });
}
function startHeartbeat() { stopHeartbeat(); beat(); hbTimer = setInterval(beat, HEARTBEAT_MS); }
function stopHeartbeat() { if (hbTimer) clearInterval(hbTimer); hbTimer = null; }
function beat() {
    if (!currentCode || !myUID || redirecting) return;
    if (roomData && !roomData.players?.[myUID]) return;        // jamais recréer un joueur retiré
    try { getUpdate()(getRef()(database, `rooms/${gameIdOf(currentCode)}/players/${myUID}`), { lastSeen: ts() }).catch(() => { }); } catch (e) { }
    if (roomData && waitingOverlay.style.display !== 'none') { maybeTakeLeadership(roomData); showWaitingRoom(currentCode, roomData); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });

// ── LANCER (leader) : une seule écriture multi-chemins ──
startGameBtn.addEventListener('click', async () => {
    if (busy.start || !currentCode) return;
    busy.start = true; startGameBtn.disabled = true; setStatus(waitingStatus, '');
    try {
        const gameId = gameIdOf(currentCode);
        const fresh = await getRoom(gameId);
        if (!fresh || fresh.leaderId !== myUID || fresh.state !== 'waiting') return;
        const entries = sortedPlayers(fresh);
        if (entries.length !== 2) { setStatus(waitingStatus, t('minesweeper.menu.need_two', 'Il faut 2 soldats pour lancer.')); return; }
        const [a, b] = entries;
        // Sièges figés : a = coin haut-gauche, b = coin bas-droite. Le plateau est généré ensuite
        // UNE seule fois par le leader (game.js) et écrit dans la salle.
        const ok = await updateRoom(gameId, {
            state: 'playing',
            currentRound: (fresh.currentRound || 0) + 1,
            seats: { a: { uid: a[0], name: a[1].name || 'Soldat' }, b: { uid: b[0], name: b[1].name || 'Soldat' } },
            board: null, startedAt: null, reveals: null
        });
        if (!ok) setStatus(waitingStatus, t('minesweeper.menu.launch_error', 'Impossible de lancer la partie, réessayez.'));
    } catch (e) { console.error(e); setStatus(waitingStatus, t('minesweeper.menu.launch_error', 'Impossible de lancer la partie, réessayez.')); }
    finally { busy.start = false; if (roomData && currentCode && !redirecting) showWaitingRoom(currentCode, roomData); }
});

// ── QUITTER (départ volontaire uniquement) ──
leaveRoomBtn.addEventListener('click', async () => {
    if (busy.leave || !currentCode || !myUID) return;
    busy.leave = true; leaveRoomBtn.disabled = true;
    const code = currentCode;
    stopListening(); stopHeartbeat(); redirecting = true;   // coupe AVANT d'écrire
    try {
        const gameId = gameIdOf(code), latest = await getRoom(gameId);
        if (latest) {
            const others = sortedPlayers(latest).filter(([uid]) => uid !== myUID);
            if (!others.length) await deleteRoom(gameId);
            else {
                const u = { [`players/${myUID}`]: null };
                if (latest.leaderId === myUID) u.leaderId = (others.find(([, p]) => !isOffline(p)) || others[0])[0];
                await updateRoom(gameId, u);
            }
        }
    } catch (e) { console.error(e); }
    finally {
        waitingOverlay.style.display = 'none'; currentCode = null; roomData = null; clearSavedRoom();
        redirecting = false; busy.leave = false; leaveRoomBtn.disabled = false;
    }
});

// ── COPIER ──
copyCodeBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(currentCode || ''); copyCodeBtn.classList.add('copied'); copyCodeBtn.title = t('minesweeper.room.copied', 'Copié !'); }
    catch (e) { /* ignore */ }
    setTimeout(() => copyCodeBtn.classList.remove('copied'), 2000);
});

// Pas de retrait du joueur ici : fermer l'onglet ≠ départ volontaire (reconnexion possible)
window.addEventListener('beforeunload', () => { stopListening(); stopHeartbeat(); });
