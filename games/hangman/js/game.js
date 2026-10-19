/** Pendu — game.js : solo (localStorage, hors ligne) et multi 2 joueurs (état dans players/<uid>/page, rôles alternés). */
import { wordsFor } from './core/words.js';
import { LANG, tr, initLang } from './core/lang.js';

const WORDS = wordsFor(LANG);          // 1000 mots de la langue choisie dans le menu de la plateforme

const MENU_URL = 'index.html', SOLO_KEY = 'hangman', SEEN_KEY = 'hangman_seen_' + LANG, SAVED_ROOM_KEY = 'hangman_room', PREFIX = 'hangman_';
const MAX_ERR = 10, HEARTBEAT_MS = 20000, OFFLINE_AFTER_MS = 75000, MAX_LEN = 30;
const LAYOUTS = {
    FR: ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'],
    EN: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
    DE: ['QWERTZUIOP', 'ASDFGHJKL', 'YXCVBNM']
};
const ROWS = LAYOUTS[LANG] || LAYOUTS.FR;

const params = new URLSearchParams(location.search);
const roomCode = (params.get('room') || '').toUpperCase() || null;
const isMulti = !!roomCode;
if (!isMulti && params.get('mode') !== 'solo') location.replace(MENU_URL);
const gid = isMulti ? PREFIX + roomCode : null;
const $ = id => document.getElementById(id);

await initLang('meta.game_title');          // charge les textes (FR / EN / DE) et traduit le DOM

// ── Texte ──
const baseOf = ch => {
    ch = ch.toLowerCase();
    if (ch === 'œ') return 'O';
    if (ch === 'ß') return 'S';
    if (ch === 'æ') return 'A';
    return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
};
const isLetter = ch => /\p{L}/u.test(ch);
const basesOf = word => new Set([...word].filter(isLetter).map(baseOf));
const errorsOf = (word, tried) => { const b = basesOf(word); return [...tried].filter(l => !b.has(l)).length; };
const wonOf = (word, tried) => !!word && [...basesOf(word)].every(l => tried.includes(l));
const lostOf = (word, tried) => !!word && errorsOf(word, tried) >= MAX_ERR;
const cleanWord = raw => String(raw).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim().replace(/^[-\s]+|[-\s]+$/g, '');
function validWord(w) {
    if (!/^\p{L}[\p{L}\- ]*$/u.test(w)) return tr('game.err_chars');
    const letters = [...w].filter(isLetter);
    if (letters.length < 2) return tr('game.err_min');
    if (w.length > MAX_LEN) return tr('game.err_max', { max: MAX_LEN });
    if (letters.some(c => !/^[A-Z]$/.test(baseOf(c)))) return tr('game.err_latin');
    return '';
}

// ── État ──
const ls = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del: k => { try { localStorage.removeItem(k); } catch { /* ignore */ } }
};
let sd = null;                                   // solo : { word, tried }
let cfg = null, fb = null, myUID = null, unsub = null, hb = null, roomData = null, leaving = false, pendingWrite = null, retryFn = null;
let V = { mode: 'play', word: '', tried: '', other: null, otherOff: false };

function drawSoloWord() {
    let seen = new Set((ls.get(SEEN_KEY) || '').split('|').filter(Boolean));
    let pool = WORDS.filter(w => !seen.has(w));
    if (!pool.length) { seen = new Set(); pool = WORDS; }
    const w = pool[Math.floor(Math.random() * pool.length)];
    seen.add(w); ls.set(SEEN_KEY, [...seen].join('|'));
    return w;
}
function loadSolo() {
    try {
        const s = JSON.parse(ls.get(SOLO_KEY));
        if (s && s.lang === LANG && typeof s.word === 'string' && s.word && typeof s.tried === 'string') return { word: s.word, tried: s.tried, lang: LANG };
    } catch { /* ignore */ }
    return newSolo();
}
function newSolo() { const s = { word: drawSoloWord(), tried: '', lang: LANG }; ls.set(SOLO_KEY, JSON.stringify(s)); return s; }
const saveSolo = () => ls.set(SOLO_KEY, JSON.stringify(sd));

// ── Pages multi : "S|manche|mot" (setter) / "G|manche|lettres" (devineur) ──
function pg(p) {
    const m = typeof p?.page === 'string' && /^([SG])\|(\d+)\|(.*)$/.exec(p.page);
    return m ? { role: m[1], round: +m[2], data: m[3] } : null;
}
const isOff = p => !!p && typeof p.lastSeen === 'number' && Date.now() - p.lastSeen > OFFLINE_AFTER_MS;
const ts = () => { const f = cfg.getServerTimestamp(); return f ? f() : Date.now(); };

function writePage(str) {
    fb.updateRoom(gid, { [`players/${myUID}/page`]: str }).then(ok => { if (!ok) { pendingWrite = null; say(tr('game.sync_error'), 'warn'); } }).catch(() => { pendingWrite = null; });
}
function setLocalPage(str) { roomData.players[myUID].page = str; pendingWrite = str; writePage(str); }

function reconcile() {
    const me = roomData.players[myUID];
    if (me.page === pendingWrite) pendingWrite = null;
    const oe = Object.entries(roomData.players).find(([u]) => u !== myUID);
    const mp = pg(me), cur = typeof me.page === 'string' ? me.page : '';
    let next = null;
    if (!oe) {
        if (!(mp && mp.role === 'S' && !mp.data)) next = `S|${(mp?.round || 0) + 1}|`;
    } else {
        const other = oe[1], op = pg(other);
        const mj = Number(me.joined) || 0, oj = Number(other.joined) || 0;
        const later = mj > oj || (mj === oj && myUID > oe[0]);
        if (!mp) {
            if (!op) { if (!later) next = 'S|1|'; }
            else next = op.role === 'S' ? `G|${op.round}|` : `S|${op.round + 1}|`;
        } else if (op) {
            if (mp.role === 'S' && op.role === 'S') { if (mp.round < op.round || (mp.round === op.round && later)) next = `G|${Math.max(mp.round, op.round)}|`; }
            else if (mp.role === 'G' && op.role === 'G') { if (!later) next = `S|${Math.max(mp.round, op.round) + 1}|`; }
            else if (mp.role === 'G' && op.role === 'S' && op.round > mp.round) next = `G|${op.round}|`;
        }
    }
    if (next !== null && next !== cur && next !== pendingWrite) setLocalPage(next);
}

function computeView() {
    if (!isMulti) return { mode: 'play', word: sd.word, tried: sd.tried };
    const me = roomData.players[myUID];
    const oe = Object.entries(roomData.players).find(([u]) => u !== myUID);
    const mp = pg(me);
    if (!oe) return { mode: 'wait', word: '', tried: '' };
    const other = oe[1].name || tr('room.player'), otherOff = isOff(oe[1]), op = pg(oe[1]);
    const base = { other, otherOff };
    if (!mp || !op || mp.role === op.role || mp.round !== op.round) return { ...base, mode: 'idle', word: '', tried: '', sync: true };
    const sp = mp.role === 'S' ? mp : op, gp = mp.role === 'G' ? mp : op;
    const word = sp.data, tried = gp.data;
    if (mp.role === 'S') return { ...base, mode: word ? 'watch' : 'pick', word, tried };
    if (!word) return { ...base, mode: 'idle', word: '', tried: '' };
    return { ...base, mode: (wonOf(word, tried) || lostOf(word, tried)) ? 'pick' : 'play', word, tried };
}

// ── Affichage ──
function say(text, cls = '') { const m = $('msg'); m.textContent = text; m.className = 'hg-msg ' + cls; }
function showLoader(text, retry) { $('loader').hidden = false; $('loaderText').textContent = text; $('loaderRetry').hidden = !retry; retryFn = retry || null; }
const hideLoader = () => { $('loader').hidden = true; };

function buildKeyboard() {
    $('kb').replaceChildren(...ROWS.map(r => {
        const row = document.createElement('div'); row.className = 'hg-row';
        [...r].forEach(L => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'hg-k'; b.textContent = L; b.dataset.l = L; b.setAttribute('aria-label', L);
            b.addEventListener('click', () => onLetter(L));
            row.append(b);
        });
        return row;
    }));
}

function render() {
    V = computeView();
    const { mode, word, tried, other, otherOff } = V;
    const errs = errorsOf(word, tried), won = wonOf(word, tried), lost = lostOf(word, tried), done = won || lost;
    const bases = basesOf(word);

    $('errs').textContent = `${errs} / ${MAX_ERR}`;
    $('errs').classList.toggle('bad', errs >= 7);
    document.querySelectorAll('#gallows [data-s]').forEach(el => el.classList.toggle('on', errs >= +el.dataset.s));
    $('gallows').classList.toggle('dead', lost);

    $('board').replaceChildren(...word.split(' ').filter(Boolean).map(tok => {
        const g = document.createElement('div'); g.className = 'hg-wd';
        [...tok].forEach(ch => {
            const c = document.createElement('span'); c.className = 'hg-c';
            if (!isLetter(ch)) { c.classList.add('fix'); c.textContent = ch; }
            else if (tried.includes(baseOf(ch))) { c.textContent = ch; if (done) c.classList.add('hit'); }
            else if (lost) { c.textContent = ch; c.classList.add('miss'); }
            return g.append(c);
        });
        return g;
    }));

    const kb = $('kb');

    kb.classList.toggle('off', mode !== 'play' || done);
    kb.querySelectorAll('.hg-k').forEach(b => {
        const L = b.dataset.l, used = tried.includes(L);
        b.disabled = used || mode !== 'play' || done;
        b.classList.toggle('ok', used && bases.has(L));
        b.classList.toggle('ko', used && !bases.has(L));
    });

    const off = otherOff ? tr('game.absent') : '';
    let info = '';
    const iv = { other, off };
    if (mode === 'wait') info = tr('game.info_wait', { code: roomCode });
    else if (mode === 'pick') info = tr(done ? 'game.info_pick_done' : 'game.info_pick', iv);
    else if (mode === 'idle') info = V.sync ? '…' : tr('game.info_idle', iv);
    else if (mode === 'play') info = !isMulti ? '' : tr('game.info_play', iv);
    else if (mode === 'watch') info = tr(done ? 'game.info_watch_done' : 'game.info_watch', iv);
    $('info').textContent = info;

    if (done) {
        if (!isMulti) setEnd(won ? tr('game.win_solo') : tr('game.lose_solo', { word }), won ? 'ok' : 'bad');
        else {
            const meGuessed = pg(roomData.players[myUID])?.role === 'G';
            if (won) setEnd(meGuessed ? tr('game.win_guesser', { word }) : tr('game.win_other_found', { other, word }), meGuessed ? 'ok' : 'bad');
            else setEnd(meGuessed ? tr('game.lose_guesser', { word }) : tr('game.win_other_failed', { other, word }), meGuessed ? 'bad' : 'ok');
        }
    } else if ($('msg').className.includes('warn') === false) say('');
    trackEnd(done, won, word);
    const wantPick = mode === 'pick' && !endTimer && !$('endOverlay').classList.contains('open');
    const po = $('pickOverlay');
    if (wantPick && !po.classList.contains('open')) {
        $('pickTitle').textContent = tr('game.pick_title_for', { other });
        po.classList.add('open'); $('setErr').textContent = ''; $('setInput').value = '';
        setTimeout(() => $('setInput').focus({ preventScroll: true }), 50);
    } else if (!wantPick) po.classList.remove('open');
}

// ── Actions ──
function onLetter(L) {
    if (V.mode !== 'play' || V.tried.includes(L) || wonOf(V.word, V.tried) || lostOf(V.word, V.tried)) return;
    if (!isMulti) { sd.tried += L; saveSolo(); render(); return; }
    const mp = pg(roomData.players[myUID]);
    setLocalPage(`G|${mp.round}|${mp.data}${L}`);
    render();
}

$('setForm').addEventListener('submit', e => {
    e.preventDefault();
    if (V.mode !== 'pick') return;
    const w = cleanWord($('setInput').value), err = validWord(w);
    if (err) { $('setErr').textContent = err; return; }
    const mp = pg(roomData.players[myUID]);
    setLocalPage(`S|${mp.role === 'G' ? mp.round + 1 : mp.round}|${w}`);
    $('setInput').value = '';
    render();
});
$('setInput').addEventListener('input', e => {
    const v = e.target.value, c = v.replace(/[^\p{L}\- ]/gu, '');
    if (c !== v) { const p = e.target.selectionStart - (v.length - c.length); e.target.value = c; e.target.setSelectionRange(p, p); }
    $('setErr').textContent = '';
});
$('pickQuitBtn').addEventListener('click', quit);

let endText = '', endCls = '';
function setEnd(t, c) { endText = t; endCls = c; if ($('msg').className.includes('warn') === false) say(''); }
let endKey = '', endTimer = 0, endLost = false;
function trackEnd(done, won, word) {
    const key = done ? (isMulti ? `${pg(roomData.players[myUID])?.round}|${word}` : word) : '';
    if (key === endKey) return;
    endKey = key; clearTimeout(endTimer); endTimer = 0; endLost = done && !won;
    if (!done) { closeEnd(); return; }
    endTimer = setTimeout(() => { endTimer = 0; openEnd(); }, 1000);
}
function openEnd() {
    const t = $('endTitle');
    t.textContent = endText; t.className = 'gameover-title ' + endCls;
    const svg = $('gallows').cloneNode(true); svg.removeAttribute('id'); svg.classList.toggle('dead', endLost);
    $('endDraw').replaceChildren(svg);
    $('endBoard').replaceChildren(...[...$('board').children].map(n => n.cloneNode(true)));
    $('endNewBtn').textContent = tr(isMulti ? 'game.continue' : 'game.new_game');
    $('endOverlay').classList.add('open');
}
const closeEnd = () => $('endOverlay').classList.remove('open');
$('endNewBtn').addEventListener('click', () => { closeEnd(); if (!isMulti) { sd = newSolo(); say(''); render(); } else render(); });
$('endQuitBtn').addEventListener('click', quit);

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if ($('endOverlay').classList.contains('open')) return;
        if ($('rulesOverlay').classList.contains('open')) closeRules();
        else $('pauseOverlay').classList.contains('open') ? closePause() : openPause();
        return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || document.activeElement?.tagName === 'INPUT') return;
    if (document.querySelector('.cq-overlay.open') || e.key.length !== 1 || !isLetter(e.key)) return;
    const L = baseOf(e.key);
    if (/^[A-Z]$/.test(L)) onLetter(L);
});

const openPause = () => $('pauseOverlay').classList.add('open');
const closePause = () => $('pauseOverlay').classList.remove('open');
const closeRules = () => $('rulesOverlay').classList.remove('open');
$('pauseBtn').addEventListener('click', openPause);
$('resumeBtn').addEventListener('click', closePause);
$('rulesBtn').addEventListener('click', () => $('rulesOverlay').classList.add('open'));
$('rulesClose').addEventListener('click', closeRules);
for (const id of ['rulesOverlay', 'pauseOverlay']) $(id).addEventListener('click', e => { if (e.target === $(id)) $(id).classList.remove('open'); });
function quit() { isMulti ? leaveRoom() : (location.href = MENU_URL); }
$('quitBtn').addEventListener('click', quit);
$('menuBtn').addEventListener('click', quit);
$('loaderRetry').addEventListener('click', () => retryFn && retryFn());

// ── Multi : salle ──
async function initMulti() {
    showLoader(tr('game.connecting'));
    try {
        [cfg, fb] = await Promise.all([import('../../../js/config/firebase-config.js'), import('../../../js/firebaseWrk.js')]);
        if (!(await cfg.firebaseReady) || !cfg.auth.currentUser) throw new Error('Firebase indisponible');
        myUID = cfg.auth.currentUser.uid;
        unsub = cfg.getOnValue()(cfg.getRef()(cfg.database, `rooms/${gid}`), s => onRoom(s.val()), err => console.warn('listener room:', err));
        beat(); hb = setInterval(beat, HEARTBEAT_MS);
    } catch (e) { console.warn(e); showLoader(tr('game.connect_failed'), initMulti); }
}
function beat() {
    if (!myUID || leaving) return;
    if (roomData && !roomData.players?.[myUID]) return;
    try { cfg.getUpdate()(cfg.getRef()(cfg.database, `rooms/${gid}/players/${myUID}`), { lastSeen: ts() }).catch(() => { }); } catch { /* ignore */ }
    if (roomData) render();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && isMulti) beat(); });
function stopRoom() { if (typeof unsub === 'function') unsub(); unsub = null; if (hb) clearInterval(hb); hb = null; }

function onRoom(data) {
    if (leaving) return;
    if (!data || !data.players?.[myUID]) { stopRoom(); ls.del(SAVED_ROOM_KEY); location.replace(MENU_URL); return; }
    roomData = data;
    hideLoader();
    reconcile();
    render();
}

async function leaveRoom() {
    if (leaving) return;
    leaving = true; stopRoom();
    try {
        const latest = await fb.getRoom(gid);
        if (latest) {
            const others = Object.entries(latest.players || {}).filter(([u]) => u !== myUID);
            if (!others.length) await fb.deleteRoom(gid);
            else {
                const u = { [`players/${myUID}`]: null };
                if (latest.leaderId === myUID) u.leaderId = others[0][0];
                await fb.updateRoom(gid, u);
            }
        }
    } catch (e) { console.warn(e); }
    ls.del(SAVED_ROOM_KEY);
    location.href = MENU_URL;
}

// ── Init ──
buildKeyboard();
if (isMulti) { ls.set(SAVED_ROOM_KEY, roomCode); render0(); initMulti(); }
else if (params.get('mode') === 'solo') { sd = loadSolo(); render(); }
function render0() { V = { mode: 'idle', word: '', tried: '', sync: true }; document.querySelectorAll('#kb .hg-k').forEach(b => { b.disabled = true; }); $('kb').classList.add('off'); }
