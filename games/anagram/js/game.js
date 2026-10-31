import { LANGS, initialLang, wordsOf, pick, show } from './core/lang.js';

const KEY = 'anagram';
const $ = id => document.getElementById(id);
const board = $('tiles'), timeEl = $('timeValue');
const OV = ['startOverlay', 'pauseOverlay', 'endOverlay', 'rulesOverlay'];

let hist = [], S = null, running = false, t0 = 0, sel = -1, drag = null, lastSec = -1;

const cur = () => S.ms + (running ? Date.now() - t0 : 0);
const fmt = ms => {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const isOpen = id => $(id).classList.contains('open');
const solved = () => S.tiles.join('') === S.word;

function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify({ lang: S.lang, word: S.word, order: S.tiles, ms: cur(), pause: S.paused, end: S.end }));
    } catch { }
}

function load() {
    try {
        const d = JSON.parse(localStorage.getItem(KEY));
        if (!d || !LANGS.includes(d.lang) || !wordsOf(d.lang).includes(d.word) || !Array.isArray(d.order)) return null;
        if ([...d.order].sort().join('') !== [...d.word].sort().join('')) return null;
        return { lang: d.lang, word: d.word, tiles: d.order.slice(), ms: Math.max(0, +d.ms || 0), paused: !!d.pause, end: d.end === 'give' ? 'give' : null };
    } catch { return null; }
}

function sync() {
    const stop = OV.some(isOpen) || !!S.end;
    if (stop && running) { S.ms += Date.now() - t0; running = false; }
    else if (!stop && !running) { t0 = Date.now(); running = true; }
    drawTime();
}

function drawTime() {
    timeEl.textContent = fmt(cur());
}

function open(id) {
    if (running) { S.ms += Date.now() - t0; running = false; }
    $(id).classList.add('open');
    sync();
    save();
}

function close(id) {
    $(id).classList.remove('open');
    sync();
    save();
}

function ok(s, w, mx, av) {
    if (av.includes(s) || s === w || (w + w).includes(s)) return false;
    let f = 0;
    for (let i = 0; i < s.length; i++) if (s[i] === w[i]) f++;
    if (f > mx) return false;
    for (let i = 0; i < s.length; i++) {
        let j = i + 1;
        while (j <= s.length && w.includes(s.slice(i, j))) j++;
        if (j - 1 - i > mx) return false;
    }
    return true;
}

function shuffle(w, avoid = []) {
    const mx = Math.floor(w.length * 0.3), a = [...w], n = a.length;
    const rnd = () => {
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
    };
    for (let k = 0; k < 500; k++) { rnd(); if (ok(a.join(''), w, mx, avoid)) return a; }
    for (let k = 0; k < 4000; k++) {
        const i = Math.floor(Math.random() * n), j = Math.floor(Math.random() * n);
        [a[i], a[j]] = [a[j], a[i]];
        if (ok(a.join(''), w, mx, avoid)) return a;
    }
    let g = 0;
    do rnd(); while ((a.join('') === w || avoid.includes(a.join(''))) && ++g < 200);
    return a;
}

function render() {
    board.replaceChildren(...S.tiles.map((c, i) => {
        const d = document.createElement('div');
        d.className = 'tile' + (i === sel ? ' sel' : '') + (S.end === 'found' ? ' win' : '');
        d.dataset.i = i;
        d.textContent = c.toUpperCase();
        return d;
    }));
}

function finish(kind) {
    S.end = kind;
    sel = -1;
    render();
    const t = fmt(cur());
    $('endEmoji').textContent = kind === 'found' ? '🎉' : '🏳️';
    $('endTitle').textContent = kind === 'found' ? 'Trouvé !' : 'Abandon';
    $('endTitle').className = 'gameover-title ' + (kind === 'found' ? 'ok' : 'bad');
    $('endWord').textContent = show(S.word, S.lang);
    $('endMsg').textContent = kind === 'found' ? 'Bien joué, mot trouvé en ' + t + '.' : 'Pas grave, le prochain sera pour toi !';
    close('pauseOverlay');
    open('endOverlay');
}

function swap(a, b) {
    [S.tiles[a], S.tiles[b]] = [S.tiles[b], S.tiles[a]];
    sel = -1;
    render();
    save();
    if (solved()) finish('found');
}

function insert(i, o, x) {
    const r = board.children[o].getBoundingClientRect();
    const c = S.tiles[i], rest = S.tiles.filter((_, k) => k !== i);
    const t = o > i ? o - 1 : o;
    rest.splice(x < r.left + r.width / 2 ? t : t + 1, 0, c);
    sel = -1;
    if (rest.join('') === S.tiles.join('')) { render(); return; }
    S.tiles = rest;
    render();
    save();
    if (solved()) finish('found');
}

function newWord(lang) {
    S.lang = lang;
    S.word = pick(lang, S.word);
    S.tiles = shuffle(S.word);
    hist = [S.tiles.join('')];
    S.ms = 0;
    S.paused = false;
    S.end = null;
    sel = -1;
    lastSec = -1;
    OV.forEach(id => $(id).classList.remove('open'));
    render();
    sync();
    save();
}

function tap(i) {
    if (sel < 0) sel = i;
    else if (sel === i) sel = -1;
    else { swap(sel, i); return; }
    render();
}

function hit(x, y, skip) {
    const k = board.children;
    for (let i = 0; i < k.length; i++) {
        if (i === skip) continue;
        const r = k[i].getBoundingClientRect();
        if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) return i;
    }
    return -1;
}

function mark(o) {
    [...board.children].forEach((c, i) => c.classList.toggle('over', i === o));
}

board.addEventListener('pointerdown', e => {
    const el = e.target.closest('.tile');
    if (!el || !running || S.end || drag) return;
    drag = { i: +el.dataset.i, el, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch { }
});

board.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    drag.el.classList.add('drag');
    drag.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.1)';
    mark(hit(e.clientX, e.clientY, drag.i));
});

function endDrag(e, cancel) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('drag');
    d.el.style.transform = '';
    mark(-1);
    if (cancel) return;
    if (d.moved) {
        const o = hit(e.clientX, e.clientY, d.i);
        if (o >= 0) insert(d.i, o, e.clientX);
        else { sel = -1; render(); }
    } else tap(d.i);
}

board.addEventListener('pointerup', e => endDrag(e, false));
board.addEventListener('pointercancel', e => endDrag(e, true));

$('shuffleBtn').addEventListener('click', () => {
    if (S.end || !running) return;
    S.tiles = shuffle(S.word, hist.concat(S.tiles.join('')));
    hist = hist.concat(S.tiles.join('')).slice(-3);
    sel = -1;
    render();
    save();
});

$('playBtn').addEventListener('click', () => close('startOverlay'));
$('startRulesBtn').addEventListener('click', () => open('rulesOverlay'));
$('rulesBtn').addEventListener('click', () => { if (!OV.some(isOpen)) open('rulesOverlay'); });
$('rulesClose').addEventListener('click', () => close('rulesOverlay'));
$('pauseBtn').addEventListener('click', () => { if (!S.end && !OV.some(isOpen)) { S.paused = true; open('pauseOverlay'); } });
$('resumeBtn').addEventListener('click', () => { S.paused = false; close('pauseOverlay'); });
$('giveUpBtn').addEventListener('click', () => { S.paused = false; finish('give'); });
$('replayBtn').addEventListener('click', () => newWord(initialLang()));

document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (isOpen('rulesOverlay')) close('rulesOverlay');
    else if (isOpen('pauseOverlay')) { S.paused = false; close('pauseOverlay'); }
    else if (!S.end && !isOpen('startOverlay')) { S.paused = true; open('pauseOverlay'); }
});

document.addEventListener('visibilitychange', () => { if (document.hidden && S && !S.end && !OV.some(isOpen) && !S.paused) save(); });
window.addEventListener('pagehide', () => { if (S) save(); });

setInterval(() => {
    if (!S) return;
    drawTime();
    const s = Math.floor(cur() / 1000);
    if (s !== lastSec) { lastSec = s; if (running) save(); }
}, 200);

(function init() {
    const c = load();
    if (c) {
        S = c;
        hist = [S.tiles.join('')];
        render();
        if (S.end === 'give') finish('give');
        else if (solved()) finish('found');
        else if (S.paused) open('pauseOverlay');
        else sync();
    } else {
        S = { lang: initialLang(), word: '', tiles: [], ms: 0, paused: false, end: null };
        S.word = pick(S.lang);
        S.tiles = shuffle(S.word);
        hist = [S.tiles.join('')];
        render();
        open('startOverlay');
    }
})();
