/**
 * Wiki Challenge — menu.js
 * Gère : onglets Solo/Multi, démarrage solo, création / jonction de salle,
 * salle d'attente, présence (heartbeat), reconnexion, départ volontaire.
 *
 * Calqué sur Where Am I (games/where-am-i/js/menu.js) : mêmes imports, mêmes
 * wrappers firebaseWrk.js, même format d'identifiant de salle (`<jeu>_<CODE>`).
 *
 * Écarts volontaires par rapport à Where Am I (voir README.md) :
 *  - le champ du leader s'appelle `leaderId` (exigé par les règles Firebase) ;
 *  - AUCUN retrait du joueur sur `beforeunload` (sinon pas de reconnexion possible) ;
 *  - listener Firebase avec désinscription (listenToRoomChanges n'en renvoie pas) ;
 *  - présence réelle via `players/<uid>/lastSeen` (heure serveur), pas de `online` figé ;
 *  - le code de salle est gardé en localStorage (survit à la fermeture de l'onglet).
 */

import { database, auth, firebaseReady, getServerTimestamp, getRef, getOnValue, getUpdate } from "../../../js/config/firebase-config.js";
import { createRoom, joinRoom, updateRoom, getRoom, deleteRoom } from "../../../js/firebaseWrk.js";
import { checkRealConnection } from "../../../js/network.js";

// ═══════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════
const GAME_PREFIX = 'wikichallenge_';          // id Firebase : rooms/wikichallenge_<CODE>
const SAVED_ROOM_KEY = 'wikiChallenge_room';   // localStorage : code de la salle en cours
const NAME_KEY = 'wikiChallenge_name';         // localStorage : pseudo (+ mg_player_name partagé)
const HEARTBEAT_MS = 20000;                    // fréquence d'écriture de lastSeen
const OFFLINE_AFTER_MS = 75000;                // sans signe de vie => « déconnecté »
const DEAD_ROOM_AFTER_MS = 10 * 60 * 1000;     // tous déconnectés depuis 10 min => salle morte

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let myUID = null;
let currentCode = null;
let roomData = null;
let roomUnsub = null;
let hbTimer = null;
let serverOffset = 0;
let redirecting = false;
let takingLead = false;
const busy = { create: false, join: false, start: false, leave: false };

// ═══════════════════════════════════════════════════
// DOM
// ═══════════════════════════════════════════════════
const $ = id => document.getElementById(id);
const tabSolo = $('tabSolo');
const tabMulti = $('tabMulti');
const soloOptions = $('soloOptions');
const multiOptions = $('multiOptions');
const soloStartBtn = $('soloStartBtn');
const createRoomBtn = $('createRoomBtn');
const createStatus = $('createStatus');
const joinRoomBtn = $('joinRoomBtn');
const roomCodeInput = $('roomCodeInput');
const joinStatus = $('joinStatus');
const waitingOverlay = $('waitingOverlay');
const displayRoomCode = $('displayRoomCode');
const waitingPlayers = $('waitingPlayers');
const waitingHint = $('waitingHint');
const waitingStatus = $('waitingStatus');
const leaderControls = $('leaderControls');
const startGameBtn = $('startGameBtn');
const playerCountHint = $('playerCountHint');
const leaveRoomBtn = $('leaveRoomBtn');
const copyCodeBtn = $('copyCodeBtn');
const playerNameInput = $('playerNameInput');

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
const gameIdOf = code => `${GAME_PREFIX}${code}`;

// Même idiome que Where Am I : getServerTimestamp() renvoie la fonction serverTimestamp du SDK
const ts = () => { const f = getServerTimestamp(); return f ? f() : Date.now(); };

const serverNow = () => Date.now() + serverOffset;

function isOffline(p) {
    return !!p && typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > OFFLINE_AFTER_MS;
}

// Une salle est « morte » si tous ses joueurs sont déconnectés depuis longtemps
function isRoomDead(data) {
    const ps = Object.values(data.players || {});
    if (!ps.length) return true;
    const now = serverNow();
    return ps.every(p => typeof p.lastSeen === 'number' && now - p.lastSeen > DEAD_ROOM_AFTER_MS);
}

function setStatus(el, msg, ok = false) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('ok', !!ok);
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function newPlayer(name, status) {
    return { name, score: 0, uid: myUID, joined: ts(), status, lastSeen: ts() };
    // `score` est exigé par les règles Firebase (players/$playerId .validate) ; inutilisé dans ce jeu.
}

function readSavedRoom() { try { return localStorage.getItem(SAVED_ROOM_KEY) || null; } catch (e) { return null; } }
function saveRoom(code) { try { localStorage.setItem(SAVED_ROOM_KEY, code); } catch (e) { /* ignore */ } }
function clearSavedRoom() { try { localStorage.removeItem(SAVED_ROOM_KEY); } catch (e) { /* ignore */ } }

function watchServerOffset() {
    return new Promise(resolve => {
        const t = setTimeout(resolve, 2500);
        try {
            getOnValue()(getRef()(database, '.info/serverTimeOffset'), snap => {
                serverOffset = Number(snap.val()) || 0;
                clearTimeout(t);
                resolve();
            });
        } catch (e) { resolve(); }
    });
}

function setMultiEnabled(enabled, msg) {
    createRoomBtn.disabled = !enabled;
    joinRoomBtn.disabled = !enabled;
    if (!enabled) { setStatus(createStatus, msg); setStatus(joinStatus, msg); }
}

// ═══════════════════════════════════════════════════
// CONNEXION — Wiki Challenge nécessite internet (même logique que Where Am I)
// ═══════════════════════════════════════════════════
checkRealConnection().then(isOnline => {
    if (!isOnline) {
        sessionStorage.setItem('offline_target_path', window.location.href);
        window.location.href = '../offline.html';
    }
});

// ═══════════════════════════════════════════════════
// AUTH / INIT
// ═══════════════════════════════════════════════════
// L'auth anonyme est déjà gérée dans firebase-config.js
firebaseReady.then(async ready => {
    const user = ready ? auth.currentUser : null;
    if (!user) {
        setMultiEnabled(false, 'Multijoueur indisponible (connexion à Firebase impossible).');
        return;
    }
    myUID = user.uid;
    await watchServerOffset();
    await restoreSavedRoom();
});

async function restoreSavedRoom() {
    const code = readSavedRoom();
    if (!code) return;
    const data = await getRoom(gameIdOf(code));
    // Salle disparue, ou joueur retiré (départ volontaire) : on oublie la session
    if (!data || !data.players?.[myUID]) { clearSavedRoom(); return; }
    enterRoom(code);
}

// ═══════════════════════════════════════════════════
// PSEUDO (mêmes clés que Where Am I : jeu + mg_player_name partagé)
// ═══════════════════════════════════════════════════
const savedName = localStorage.getItem(NAME_KEY) || localStorage.getItem('mg_player_name') || '';
if (savedName) playerNameInput.value = savedName;
playerNameInput.addEventListener('input', () => {
    const n = playerNameInput.value.trim();
    localStorage.setItem(NAME_KEY, n);
    if (n) localStorage.setItem('mg_player_name', n);
});

function getPlayerName() {
    const n = playerNameInput.value.trim();
    if (!n) { playerNameInput.focus(); playerNameInput.style.borderColor = 'var(--rose)'; return null; }
    playerNameInput.style.borderColor = '';
    localStorage.setItem(NAME_KEY, n);
    localStorage.setItem('mg_player_name', n);
    return n;
}

// ═══════════════════════════════════════════════════
// ONGLETS
// ═══════════════════════════════════════════════════
tabSolo.addEventListener('click', () => switchTab('solo'));
tabMulti.addEventListener('click', () => switchTab('multi'));

function switchTab(tab) {
    tabSolo.classList.toggle('active', tab === 'solo');
    tabMulti.classList.toggle('active', tab === 'multi');
    soloOptions.style.display = tab === 'solo' ? 'flex' : 'none';
    multiOptions.style.display = tab === 'multi' ? 'flex' : 'none';
}

// ═══════════════════════════════════════════════════
// SOLO
// ═══════════════════════════════════════════════════
soloStartBtn.addEventListener('click', () => {
    soloStartBtn.disabled = true;
    window.location.href = 'game.html?mode=solo';
});

// ═══════════════════════════════════════════════════
// CRÉATION DE SALLE
// ═══════════════════════════════════════════════════
createRoomBtn.addEventListener('click', async () => {
    if (busy.create) return;
    const name = getPlayerName();
    if (!name) return;
    if (!myUID) { setStatus(createStatus, 'Connexion en cours, réessaie dans un instant.'); return; }

    busy.create = true;
    createRoomBtn.disabled = true;
    createRoomBtn.textContent = 'Création…';
    setStatus(createStatus, '');

    try {
        let created = null;
        // createRoom() renvoie false si le code existe déjà (ou en cas d'erreur) : 3 essais
        for (let i = 0; i < 3 && !created; i++) {
            const code = generateRoomCode();
            const ok = await createRoom(gameIdOf(code), {
                code,
                state: 'waiting',
                leaderId: myUID,
                currentRound: 0,
                createdAt: ts(),
                players: { [myUID]: newPlayer(name, 'waiting') }
                // pas de `numPlayers` : joinRoom() ne limite alors pas le nombre de joueurs
            });
            if (ok) created = code;
        }
        if (!created) throw new Error('createRoom a échoué');
        enterRoom(created);
    } catch (e) {
        console.error(e);
        setStatus(createStatus, 'Erreur lors de la création de la salle.');
    } finally {
        busy.create = false;
        createRoomBtn.disabled = false;
        createRoomBtn.textContent = 'Créer la salle';
    }
});

// ═══════════════════════════════════════════════════
// REJOINDRE UNE SALLE
// ═══════════════════════════════════════════════════
joinRoomBtn.addEventListener('click', () => handleJoinRoom());
roomCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleJoinRoom(); });

async function handleJoinRoom() {
    if (busy.join) return;
    const name = getPlayerName();
    if (!name) return;
    if (!myUID) { setStatus(joinStatus, 'Connexion en cours, réessaie dans un instant.'); return; }

    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length !== 6) { setStatus(joinStatus, 'Code invalide (6 caractères)'); return; }

    busy.join = true;
    joinRoomBtn.disabled = true;
    setStatus(joinStatus, 'Recherche…');

    try {
        const gameId = gameIdOf(code);
        const data = await getRoom(gameId);

        if (!data) { setStatus(joinStatus, '❌ Salle introuvable'); return; }

        // Déjà membre (retour après fermeture d'onglet / perte de connexion) : on ne
        // réécrit PAS le joueur (ça écraserait sa page et son statut), on se reconnecte.
        if (data.players?.[myUID]) {
            setStatus(joinStatus, '');
            enterRoom(code);
            return;
        }

        if (isRoomDead(data)) { setStatus(joinStatus, '❌ Salle introuvable'); return; }

        // Partie en cours : le joueur attendra la manche suivante
        const status = data.state === 'playing' ? 'waiting_next' : 'waiting';
        const res = await joinRoom(gameId, newPlayer(name, status));
        if (res !== true) {
            // joinRoom() renvoie une chaîne d'erreur (truthy !) en cas d'échec
            console.warn('joinRoom:', res);
            setStatus(joinStatus, '❌ Impossible de rejoindre');
            return;
        }

        setStatus(joinStatus, '');
        enterRoom(code);
    } catch (e) {
        console.error(e);
        setStatus(joinStatus, '❌ Impossible de rejoindre');
    } finally {
        busy.join = false;
        joinRoomBtn.disabled = false;
    }
}

// ═══════════════════════════════════════════════════
// ENTRÉE DANS UNE SALLE (création, jonction ou reconnexion)
// ═══════════════════════════════════════════════════
function enterRoom(code) {
    currentCode = code;
    roomData = null;
    redirecting = false;
    saveRoom(code);
    switchTab('multi');
    listenToRoom(code);
    startHeartbeat();
}

function resetRoomState(message) {
    stopListening();
    stopHeartbeat();
    waitingOverlay.style.display = 'none';
    currentCode = null;
    roomData = null;
    clearSavedRoom();
    if (message) setStatus(joinStatus, message);
}

// ═══════════════════════════════════════════════════
// LISTENER TEMPS RÉEL (avec désinscription)
// ═══════════════════════════════════════════════════
function listenToRoom(code) {
    stopListening();
    const ref = getRef();
    const onValue = getOnValue();
    if (!ref || !onValue) return;
    roomUnsub = onValue(
        ref(database, `rooms/${gameIdOf(code)}`),
        snap => handleRoomUpdate(code, snap.val()),
        err => console.warn('listener room:', err)
    );
}

function stopListening() {
    if (typeof roomUnsub === 'function') roomUnsub();
    roomUnsub = null;
}

function handleRoomUpdate(code, data) {
    if (code !== currentCode || redirecting) return;

    // Salle supprimée, ou joueur retiré de la salle
    if (!data || !data.players?.[myUID]) {
        resetRoomState(data ? 'Tu as quitté la salle.' : 'La salle a été fermée.');
        return;
    }
    roomData = data;

    // Manche en cours (ou terminée, en attente de « Rejouer ») : écran de partie
    if (data.state === 'playing' || data.state === 'round_result') {
        goToGame(code);
        return;
    }

    maybeTakeLeadership(data);
    showWaitingRoom(code, data);
}

function goToGame(code) {
    if (redirecting) return;
    redirecting = true;
    stopListening();
    stopHeartbeat();
    window.location.href = `game.html?room=${encodeURIComponent(code)}`;
}

// ═══════════════════════════════════════════════════
// SALLE D'ATTENTE
// ═══════════════════════════════════════════════════
function sortedPlayers(data) {
    return Object.entries(data.players || {}).sort((a, b) => {
        const ja = typeof a[1].joined === 'number' ? a[1].joined : 0;
        const jb = typeof b[1].joined === 'number' ? b[1].joined : 0;
        return ja - jb || a[0].localeCompare(b[0]);
    });
}

function playerChip(uid, p, leaderId) {
    const d = document.createElement('div');
    const off = isOffline(p);
    d.className = 'gs-player-chip'
        + (uid === leaderId ? ' leader' : '')
        + (uid === myUID ? ' me' : '')
        + (off ? ' offline' : '');
    // textContent (pas innerHTML) : un pseudo ne peut pas injecter de HTML
    d.textContent = `${uid === leaderId ? '👑 ' : ''}${p.name || 'Joueur'}${uid === myUID ? ' (toi)' : ''}`;
    if (off) {
        const s = document.createElement('small');
        s.textContent = ' déconnecté';
        d.appendChild(s);
    }
    return d;
}

function showWaitingRoom(code, data) {
    waitingOverlay.style.display = 'flex';
    displayRoomCode.textContent = code;

    const entries = sortedPlayers(data);
    waitingPlayers.replaceChildren(...entries.map(([uid, p]) => playerChip(uid, p, data.leaderId)));

    const isLeader = data.leaderId === myUID;
    leaderControls.style.display = isLeader ? 'block' : 'none';
    waitingHint.textContent = isLeader
        ? 'Partagez le code avec vos amis !'
        : 'En attente du lancement par le créateur…';

    if (isLeader) {
        const count = entries.length;
        startGameBtn.disabled = busy.start || count < 1;
        playerCountHint.textContent = `(${count} joueur${count > 1 ? 's' : ''})`;
    }
}

// ═══════════════════════════════════════════════════
// LEADERSHIP — si le créateur est parti / déconnecté, le plus ancien joueur
// en ligne reprend la main (nécessite l'extension des règles Firebase, voir README)
// ═══════════════════════════════════════════════════
function maybeTakeLeadership(data) {
    if (takingLead || data.leaderId === myUID) return;
    const leader = data.players?.[data.leaderId];
    if (leader && !isOffline(leader)) return;

    const candidate = sortedPlayers(data).find(([, p]) => !isOffline(p));
    if (!candidate || candidate[0] !== myUID) return;

    takingLead = true;
    updateRoom(gameIdOf(currentCode), { leaderId: myUID })
        .catch(() => { })
        .finally(() => { takingLead = false; });
}

// ═══════════════════════════════════════════════════
// PRÉSENCE (heartbeat)
// ═══════════════════════════════════════════════════
function startHeartbeat() {
    stopHeartbeat();
    beat();
    hbTimer = setInterval(beat, HEARTBEAT_MS);
}

function stopHeartbeat() {
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = null;
}

function beat() {
    if (!currentCode || !myUID || redirecting) return;
    // Ne jamais réécrire un joueur qui a été retiré de la salle
    if (roomData && !roomData.players?.[myUID]) return;
    try {
        const update = getUpdate();
        const ref = getRef();
        if (update && ref) {
            update(ref(database, `rooms/${gameIdOf(currentCode)}/players/${myUID}`), { lastSeen: ts() })
                .catch(() => { });
        }
    } catch (e) { /* ignore */ }

    // Rafraîchit l'affichage (statut « déconnecté » dérivé de l'heure) + leadership
    if (roomData && waitingOverlay.style.display !== 'none') {
        maybeTakeLeadership(roomData);
        showWaitingRoom(currentCode, roomData);
    }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });

// ═══════════════════════════════════════════════════
// LANCER LA PARTIE (créateur uniquement)
// ═══════════════════════════════════════════════════
startGameBtn.addEventListener('click', async () => {
    if (busy.start || !currentCode) return;
    busy.start = true;
    startGameBtn.disabled = true;
    setStatus(waitingStatus, '');

    try {
        const gameId = gameIdOf(currentCode);
        const fresh = await getRoom(gameId);
        if (!fresh || fresh.leaderId !== myUID || fresh.state !== 'waiting') return;

        // Une seule écriture multi-chemins : tout le monde bascule en même temps.
        // Les mots et roundStartedAt sont posés ensuite par le leader dans game.js.
        const updates = {
            state: 'playing',
            currentRound: (fresh.currentRound || 0) + 1,
            startPage: null,
            targetPage: null,
            roundStartedAt: null,
            endReason: null
        };
        for (const uid of Object.keys(fresh.players || {})) {
            updates[`players/${uid}/status`] = 'searching';
            updates[`players/${uid}/page`] = null;
            updates[`players/${uid}/finishedAt`] = null;
        }
        const ok = await updateRoom(gameId, updates);
        if (!ok) setStatus(waitingStatus, 'Impossible de lancer la partie, réessaie.');
    } catch (e) {
        console.error(e);
        setStatus(waitingStatus, 'Impossible de lancer la partie, réessaie.');
    } finally {
        busy.start = false;
        if (roomData && currentCode && !redirecting) showWaitingRoom(currentCode, roomData);
    }
});

// ═══════════════════════════════════════════════════
// QUITTER LA SALLE (départ VOLONTAIRE uniquement)
// ═══════════════════════════════════════════════════
leaveRoomBtn.addEventListener('click', async () => {
    if (busy.leave || !currentCode || !myUID) return;
    busy.leave = true;
    leaveRoomBtn.disabled = true;

    const code = currentCode;
    // On coupe listener + heartbeat AVANT d'écrire : sinon beat() pourrait recréer le joueur
    stopListening();
    stopHeartbeat();
    redirecting = true;

    try {
        const gameId = gameIdOf(code);
        const latest = await getRoom(gameId);
        if (latest) {
            const others = sortedPlayers(latest).filter(([uid]) => uid !== myUID);
            if (!others.length) {
                await deleteRoom(gameId);            // dernier joueur : la room disparaît
            } else {
                const updates = { [`players/${myUID}`]: null };
                if (latest.leaderId === myUID) {
                    // transfert au plus ancien joueur encore en ligne (sinon au plus ancien)
                    const next = others.find(([, p]) => !isOffline(p)) || others[0];
                    updates.leaderId = next[0];
                }
                await updateRoom(gameId, updates);
            }
        }
    } catch (e) {
        console.error('Erreur lors de la sortie de la salle:', e);
    } finally {
        waitingOverlay.style.display = 'none';
        currentCode = null;
        roomData = null;
        clearSavedRoom();
        redirecting = false;
        busy.leave = false;
        leaveRoomBtn.disabled = false;
    }
});

// ═══════════════════════════════════════════════════
// COPIER LE CODE
// ═══════════════════════════════════════════════════
copyCodeBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(currentCode || '');
        copyCodeBtn.textContent = '✅ Copié !';
    } catch (e) {
        copyCodeBtn.textContent = 'Copie impossible';
    }
    setTimeout(() => { copyCodeBtn.textContent = '📋 Copier'; }, 2000);
});

// ═══════════════════════════════════════════════════
// NETTOYAGE
// ═══════════════════════════════════════════════════
// Volontairement PAS de retrait du joueur ici : fermer l'onglet ou rafraîchir
// ne doit pas être un départ volontaire (reconnexion possible, cf. README).
window.addEventListener('beforeunload', () => { stopListening(); stopHeartbeat(); });
