/** Menu Skyjo V3 : solo + multijoueur (sélection de mode Classique / Crazy). */
import * as NT from './net.js';
const $ = id => document.getElementById(id);

// ── Solo ──
const KEY = 'skyjo', NKEY = 'skyjo_n', MKEY = 'skyjo_mode';
let n = 2;
try { n = Math.min(8, Math.max(2, parseInt(localStorage.getItem(NKEY)) || 2)); } catch { /* ignore */ }

let soloMode = 'classic';
try { soloMode = localStorage.getItem(MKEY) === 'crazy' ? 'crazy' : 'classic'; } catch { /* ignore */ }

function updateSoloModeUI() {
    const isCrazy = soloMode === 'crazy';
    $('sClassic').classList.toggle('on', !isCrazy);
    $('sClassic').setAttribute('aria-checked', !isCrazy);
    $('sCrazy').classList.toggle('on', isCrazy);
    $('sCrazy').classList.toggle('crazy-on', isCrazy);
    $('sCrazy').setAttribute('aria-checked', isCrazy);
}
$('sClassic').addEventListener('click', () => { soloMode = 'classic'; try { localStorage.setItem(MKEY, soloMode); } catch { } updateSoloModeUI(); });
$('sCrazy').addEventListener('click', () => { soloMode = 'crazy'; try { localStorage.setItem(MKEY, soloMode); } catch { } updateSoloModeUI(); });
updateSoloModeUI();

const box = $('nums');
function paint() {
    box.querySelectorAll('button').forEach(b => {
        const on = Number(b.dataset.n) === n;
        b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
    });
}
for (let i = 2; i <= 8; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.n = i; b.textContent = i; b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { n = i; paint(); });
    box.appendChild(b);
}
paint();

$('playBtn').addEventListener('click', () => {
    const v = $('name').value.trim();
    if (v && v.toLowerCase() !== 'vous') {
        try { localStorage.setItem(NT.NAME_KEY, v); } catch { /* ignore */ }
    }
    try { localStorage.setItem(NKEY, n); localStorage.removeItem(KEY); } catch { /* ignore */ }
    const seed = new URLSearchParams(location.search).get('seed');
    location.href = `game.html?players=${n}&mode=${soloMode}` + (seed ? `&seed=${encodeURIComponent(seed)}` : '');
});

// ── Onglets Solo / Multi ──
function tab(m) {
    $('tSolo').classList.toggle('on', !m); $('tMulti').classList.toggle('on', m);
    $('solo').hidden = m; $('multi').hidden = !m;
}
$('tSolo').addEventListener('click', () => tab(false));
$('tMulti').addEventListener('click', () => tab(true));

// ── Multi Mode (création) ──
let multiMode = 'classic';
function updateMultiModeUI() {
    const isCrazy = multiMode === 'crazy';
    $('mClassic').classList.toggle('on', !isCrazy);
    $('mClassic').setAttribute('aria-checked', !isCrazy);
    $('mCrazy').classList.toggle('on', isCrazy);
    $('mCrazy').classList.toggle('crazy-on', isCrazy);
    $('mCrazy').setAttribute('aria-checked', isCrazy);
}
$('mClassic').addEventListener('click', () => { multiMode = 'classic'; updateMultiModeUI(); });
$('mCrazy').addEventListener('click', () => { multiMode = 'crazy'; updateMultiModeUI(); });
updateMultiModeUI();

// ── Multi ──
let cur = null, unsub = null, hb = null, redirecting = false, busy = false, roomData = null;
const st = m => { $('st').textContent = m || ''; };
const gen = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join(''); };
const newPlayer = nm => ({ name: nm, score: 0, uid: NT.N.uid, joined: NT.ts(), lastSeen: NT.ts(), away: false });
const order = d => Object.entries(d.players || {}).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0));
const hostOf = d => {
    const l = d.players[d.leaderId];
    if (l && (d.leaderId === NT.N.uid || NT.isPresent(l))) return d.leaderId;
    const f = order(d).find(([u, p]) => u === NT.N.uid || NT.isPresent(p));
    return f ? f[0] : null;
};
$('name').value = (() => { try { return localStorage.getItem(NT.NAME_KEY) || ''; } catch { return ''; } })();
function pseudo() {
    const v = $('name').value.trim();
    if (!v) { $('name').focus(); st('Entrez un pseudo.'); return null; }
    try { localStorage.setItem(NT.NAME_KEY, v); } catch { /* ignore */ }
    return v;
}

$('createBtn').addEventListener('click', async () => {
    if (busy) return; const nm = pseudo(); if (!nm) return;
    busy = true; st('Connexion…');
    try {
        if (!(await NT.initFb())) { st('Multijoueur indisponible hors ligne.'); return; }
        let made = null;
        for (let i = 0; i < 3 && !made; i++) {
            const code = gen();
            const isCrazy = multiMode === 'crazy';
            const ok = await NT.N.fb.createRoom(NT.gameIdOf(code), {
                code, state: 'waiting', mode: multiMode, rules: { crazy: isCrazy }, leaderId: NT.N.uid,
                maxPlayers: 8, numPlayers: 8, createdAt: NT.ts(), players: { [NT.N.uid]: newPlayer(nm) }
            });
            if (ok) made = code;
        }
        if (!made) throw new Error('createRoom');
        st(''); enter(made);
    } catch (e) { console.error(e); st('Création impossible.'); }
    finally { busy = false; }
});

$('joinBtn').addEventListener('click', join);
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
async function join() {
    if (busy) return; const nm = pseudo(); if (!nm) return;
    const code = $('code').value.trim().toUpperCase();
    if (code.length !== 6) { st('Code invalide.'); return; }
    busy = true; st('Recherche…');
    try {
        if (!(await NT.initFb())) { st('Multijoueur indisponible hors ligne.'); return; }
        const id = NT.gameIdOf(code), d = await NT.N.fb.getRoom(id);
        if (!d) { st('Room introuvable.'); return; }
        if (d.players?.[NT.N.uid]) { await rejoin(code, d); st(''); return; }
        if (NT.isDead(d)) { await NT.N.fb.deleteRoom(id); st('Room introuvable.'); return; }
        if (d.state !== 'waiting') { st('La partie a déjà commencé.'); return; }
        if (Object.keys(d.players || {}).length >= 8) { st('Room pleine (8 joueurs).'); return; }
        const r = await NT.N.fb.joinRoom(id, newPlayer(nm));
        if (r !== true) { console.warn('joinRoom', r); st('Impossible de rejoindre.'); return; }
        st(''); enter(code);
    } catch (e) { console.error(e); st('Impossible de rejoindre.'); }
    finally { busy = false; }
}

/** Retour d'un joueur déjà inscrit : reprend son siège (away=false). */
async function rejoin(code, d) {
    if (d.state === 'playing') {
        await NT.N.fb.updateRoom(NT.gameIdOf(code), { [`players/${NT.N.uid}/away`]: false, [`players/${NT.N.uid}/lastSeen`]: NT.ts() });
        go(code);
    } else enter(code);
}

// Reprise après actualisation / retour au menu
(async function restore() {
    const c = NT.readSavedRoom();
    if (!c || !(await NT.initFb())) return;
    const d = await NT.N.fb.getRoom(NT.gameIdOf(c));
    if (!d || !d.players?.[NT.N.uid]) { NT.clearSavedRoom(); return; }
    tab(true);
    if (d.state === 'playing') {
        $('resumeBtn').hidden = false;
        $('resumeBtn').onclick = () => rejoin(c, d).catch(() => st('Reprise impossible.'));
    } else enter(c);
})();

function enter(code) {
    cur = code; roomData = null; redirecting = false; NT.saveRoom(code);
    if (unsub) unsub();
    unsub = NT.watch(code, d => onRoom(code, d));
    clearInterval(hb); NT.beat(code); hb = setInterval(() => NT.beat(code), NT.HEARTBEAT_MS);
}
function reset(m) {
    if (unsub) unsub(); unsub = null; clearInterval(hb);
    $('wait').hidden = true; cur = null; roomData = null; NT.clearSavedRoom(); st(m || '');
}
function go(code) {
    if (redirecting) return; redirecting = true;
    if (unsub) unsub(); unsub = null; clearInterval(hb);
    location.href = `game.html?room=${encodeURIComponent(code)}`;
}
function onRoom(code, d) {
    if (code !== cur || redirecting) return;
    if (!d || !d.players?.[NT.N.uid]) { reset(d ? 'Vous avez quitté la room.' : 'La room a été fermée.'); return; }
    roomData = d;
    if (d.state === 'playing') { go(code); return; }
    showWait();
}
function showWait() {
    const d = roomData; if (!d) return;
    $('wait').hidden = false; $('wcode').textContent = cur;
    const isCrazy = d.mode === 'crazy' || d.rules?.crazy;
    $('wmode').textContent = isCrazy ? 'Mode Crazy' : 'Mode Classique';
    $('wmode').classList.toggle('crazy', isCrazy);

    $('chips').replaceChildren(...order(d).map(([u, p]) => {
        const c = document.createElement('div');
        c.className = 'chip' + (u === NT.N.uid ? ' me' : '') + (u !== NT.N.uid && !NT.isPresent(p) ? ' off' : '');
        c.textContent = (p.name || 'Joueur') + (u === d.leaderId ? ' ★' : '') + (u === NT.N.uid ? ' (vous)' : '');
        return c;
    }));
    const present = order(d).filter(([u, p]) => u === NT.N.uid || NT.isPresent(p)).length, host = hostOf(d) === NT.N.uid;
    $('startBtn').hidden = !host; $('startBtn').disabled = present < 2;
    $('whint').textContent = `${present} joueur${present > 1 ? 's' : ''} (2 à 8). ` + (host ? (present < 2 ? 'Attendez au moins un autre joueur.' : 'Vous pouvez lancer la partie.') : 'L’hôte lance la partie.');
}
setInterval(() => { if (roomData && !$('wait').hidden) showWait(); }, 5000);

$('startBtn').addEventListener('click', async () => {
    if (busy || !cur) return; busy = true;
    try {
        const id = NT.gameIdOf(cur), d = await NT.N.fb.getRoom(id);
        if (!d || d.state !== 'waiting') return;
        const ps = order(d), keep = ps.filter(([u, p]) => u === NT.N.uid || NT.isPresent(p)).map(x => x[0]);
        if (keep.length < 2) return;
        const seed = (Math.random() * 4294967296) >>> 0;
        const rMode = d.mode || (d.rules?.crazy ? 'crazy' : 'classic');
        const u = {
            state: 'playing', leaderId: NT.N.uid,
            'log/0': { s: -1, a: { type: 'start', seed, seats: keep, mode: rMode }, t: NT.serverNow() }
        };
        ps.forEach(([x]) => { if (!keep.includes(x)) u[`players/${x}`] = null; });
        await NT.N.fb.updateRoom(id, u);
    } catch (e) { console.error(e); }
    finally { busy = false; }
});
$('leaveBtn').addEventListener('click', async () => {
    if (!cur) return; const c = cur; redirecting = true;
    if (unsub) unsub(); unsub = null; clearInterval(hb);
    try { await NT.leaveRoom(c, false); } catch (e) { console.error(e); }
    redirecting = false; reset('');
});
$('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(cur || ''); $('copyBtn').textContent = 'Copié !'; } catch { $('copyBtn').textContent = 'Copie impossible'; }
    setTimeout(() => { $('copyBtn').textContent = 'Copier le code'; }, 2000);
});
