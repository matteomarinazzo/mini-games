const KEY = 'nonogram', MENU = '../../index.html', MAXL = 3;
const RAW = {
    e: [['Cœur', '01010/11111/11111/01110/00100'], ['Sapin', '00100/01110/11111/00100/00100'], ['Maison', '00100/01110/11111/11011/11011'], ['Flèche', '00100/01110/10101/00100/00100'], ['Étoile', '00100/11111/01110/11011/10001'], ['Diamant', '00100/01110/11111/01110/00100'], ['Champignon', '01110/11111/11111/00100/00100'], ['Pomme', '00110/01110/11111/11111/01110'], ['Note', '00111/00100/00100/11100/11100'], ['Lune', '01111/11000/11000/11000/01111'], ['Soleil', '10101/01110/11111/01110/10101'], ['Flocon', '00100/10101/01110/10101/00100'], ['Cactus', '00100/10101/10101/11111/00100'], ['Clé', '01110/10001/01110/00100/00110'], ['Chat', '100001/110011/111111/101101/111111/011110'], ['Papillon', '110011/111111/011110/111111/110011'], ['Ancre', '001100/001100/111111/101101/011110'], ['Tente', '001100/011110/111111/110011/110011/110011']],
    m: [['Chat', '10000001/11000011/11111111/11011011/11111111/11100111/01111110/00111100'], ['Cœur', '01100110/11111111/11111111/11111111/11111111/01111110/00111100/00011000'], ['Sapin', '00011000/00111100/01111110/00111100/01111110/11111111/00011000/00011000'], ['Fusée', '00011000/00111100/00111100/01111110/01111110/11111111/10111101/00011000'], ['Maison', '00011000/00111100/01111110/11111111/11111111/11100111/11100111/11100111'], ['Diamant', '00011000/00111100/01111110/11111111/11111111/01111110/00111100/00011000'], ['Champignon', '00111100/01111110/11011011/11111111/11111111/00111100/00111100/00111100'], ['Pomme', '00001100/00011000/01111110/11111111/11111111/11111111/01111110/00111100'], ['Couronne', '10011001/10111101/11111111/11111111/11111111/11111111'], ['Étoile', '00011000/00011000/00111100/11111111/01111110/00111100/01100110/01000010'], ['Épée', '00011000/00011000/00011000/00011000/00011000/11111111/00011000/00111100']],
    h: [['Chat', '1100000011/1110000111/1111111111/1111111111/1101111011/1111111111/1111001111/1111111111/0111111110/0011111100'], ['Cœur', '0111001110/1111111111/1111111111/1111111111/0111111110/0011111100/0001111000/0000110000/0000110000'], ['Arbre', '0000110000/0001111000/0011111100/0001111000/0011111100/0111111110/1111111111/0000110000/0000110000/0000110000'], ['Fusée', '0000110000/0001111000/0001111000/0011111100/0011111100/0011111100/1011111101/1101111011/1001111001/0000110000'], ['Maison', '0000110000/0001111000/0011111100/0111111110/1111111111/1101111011/1101111011/1111111111/1111001111/1111001111'], ['Étoile', '0000110000/0000110000/0001111000/1111111111/0111111110/0011111100/0011111100/0111001110/0110000110/1100000011'], ['Voilier', '0000110000/0001110000/0011110000/0111110000/0000110000/0000110000/1111111111/0111111110/0011111100'], ['Fantôme', '0011111100/0111111110/1111111111/1101111011/1101111011/1111111111/1111111111/1111111111/1111111111/1101101101'], ['Smiley', '0011111100/0111111110/1111111111/1101111011/1111111111/1111111111/1011111101/1100000011/0111111110/0011111100'], ['Diamant', '0000110000/0001111000/0011111100/0111111110/1111111111/1111111111/0111111110/0011111100/0001111000/0000110000'], ['Couronne', '1000110001/1101111011/1111111111/1111111111/1111111111/1111111111/0111111110'], ['Parapluie', '0011111100/0111111110/1111111111/1111111111/1101101101/0000110000/0000110000/0000110000/0011110000']]
};
const PATTERNS = {};
for (const t in RAW) PATTERNS[t] = RAW[t].map(([n, g], k) => ({ i: t + k + 'v2', n, g }));
const BY = {};
for (const t in PATTERNS) PATTERNS[t].forEach(p => { p.t = t; p.r = p.g.split('/'); BY[p.i] = p; });

const $ = id => document.getElementById(id);
const puz = $('puz'), livesEl = $('lives'), timeEl = $('time');
const startO = $('startOverlay'), pauseO = $('pauseOverlay'), overO = $('gameoverOverlay');

let st = { seen: { e: [], m: [], h: [] }, g: null };
try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.seen) st = { seen: { e: s.seen.e || [], m: s.seen.m || [], h: s.seen.h || [] }, g: s.g || null };
} catch { }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { } };

let state = 'ready', pat, W, H, sol, fill, lives, elapsed = 0, cells, rows, cols, rTot, cTot, rCnt, cCnt, last = performance.now(), acc = 0;

const runs = a => { const o = []; let c = 0; for (const x of a) { if (x) c++; else if (c) { o.push(c); c = 0; } } if (c) o.push(c); return o; };
const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const open = (el, on = true) => el.classList.toggle('open', on);
const mk = (tag, cls, html = '') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };

function renderLives() { livesEl.innerHTML = Array.from({ length: MAXL }, (_, i) => `<i class="${i < lives ? '' : 'lost'}">♥</i>`).join(''); }
function renderTime() { const s = fmt(elapsed); if (timeEl.textContent !== s) timeEl.textContent = s; }

function fit() {
    if (!pat) return;
    const k = Math.max(...rows.map(r => r.length)), m = Math.max(...cols.map(c => c.length));
    const aw = Math.min(innerWidth * .98, 600) - 20, ah = innerHeight - 52 - 36;
    puz.style.setProperty('--c', Math.max(14, Math.floor(Math.min(46, aw / (W + 1.2 * k + .5), ah / (H + 1.24 * m + .4)))) + 'px');
    puz.style.padding = '8px';
    const b = puz.firstChild.getBoundingClientRect();
    puz.style.padding = `8px ${8 + b.width}px ${8 + b.height}px 8px`;
}

function build() {
    W = pat.r[0].length; H = pat.r.length;
    sol = pat.r.join('').split('').map(Number);
    rows = pat.r.map(r => runs(r.split('').map(Number)));
    cols = Array.from({ length: W }, (_, x) => runs(Array.from({ length: H }, (_, y) => sol[y * W + x])));
    rTot = rows.map(r => r.reduce((a, b) => a + b, 0)); cTot = cols.map(c => c.reduce((a, b) => a + b, 0));
    rCnt = Array(H).fill(0); cCnt = Array(W).fill(0);
    puz.innerHTML = ''; puz.style.gridTemplateColumns = `auto repeat(${W}, var(--c))`; puz.style.gridTemplateRows = `auto repeat(${H}, var(--c))`;
    puz.appendChild(mk('div', ''));
    cols.forEach((c, x) => puz.appendChild(mk('div', 'cc', c.map(n => `<span>${n}</span>`).join(''))));
    cells = [];
    for (let y = 0; y < H; y++) {
        puz.appendChild(mk('div', 'rc', rows[y].map(n => `<span>${n}</span>`).join('')));
        for (let x = 0; x < W; x++) {
            const b = mk('button', 'cell' + (x % 5 === 4 && x < W - 1 ? ' r5' : '') + (y % 5 === 4 && y < H - 1 ? ' b5' : ''));
            b.type = 'button'; b.dataset.i = y * W + x; b.setAttribute('aria-label', `Ligne ${y + 1}, colonne ${x + 1}`);
            puz.appendChild(b); cells.push(b);
        }
    }
    fit();
}

function markLines() {
    const rc = puz.querySelectorAll('.rc'), cc = puz.querySelectorAll('.cc');
    rc.forEach((e, y) => e.classList.toggle('done', rCnt[y] === rTot[y]));
    cc.forEach((e, x) => e.classList.toggle('done', cCnt[x] === cTot[x]));
}

function load(g) {
    curD = g.d; pat = BY[g.i]; fill = g.b.split('').map(Number); lives = g.l; elapsed = g.t; build();
    fill.forEach((v, i) => { if (v) { cells[i].classList.add('on'); rCnt[Math.floor(i / W)]++; cCnt[i % W]++; } });
    markLines(); renderLives(); renderTime();
    open(startO, false); open(pauseO, false); open(overO, false);
    state = 'running';
}

function startGame(d) {
    curD = d;
    const all = PATTERNS[d];
    let pool = all.filter(p => !st.seen[d].includes(p.i));
    if (!pool.length) { st.seen[d] = []; pool = all; }
    const p = pool[Math.floor(Math.random() * pool.length)];
    st.seen[d].push(p.i);
    st.g = { d, i: p.i, b: '0'.repeat(p.r.length * p.r[0].length), l: MAXL, t: 0 };
    save(); load(st.g);
}

function tap(i) {
    if (state !== 'running' || fill[i]) return;
    const x = i % W, y = Math.floor(i / W), c = cells[i];
    if (sol[i]) {
        fill[i] = 1; c.classList.add('on'); rCnt[y]++; cCnt[x]++; markLines();
        st.g.b = fill.join(''); save();
        if (fill.reduce((a, b) => a + b, 0) === sol.reduce((a, b) => a + b, 0)) end(true);
        return true;
    }
    lives--; st.g.l = lives; renderLives(); save();
    c.classList.add('bad'); setTimeout(() => c.classList.remove('bad'), 500);
    puz.classList.remove('shake'); void puz.offsetWidth; puz.classList.add('shake');
    if (lives <= 0) end(false);
    return false;
}

// Glisser pour dessiner : verrouillé sur la ligne ou la colonne de départ, stoppe à la 1re erreur
let curD = 'e';
let drag = null;
const cellAt = (cx, cy) => document.elementFromPoint(cx, cy)?.closest('.cell');
puz.addEventListener('pointerdown', e => {
    const c = e.target.closest('.cell'); if (!c) return;
    e.preventDefault();
    const i = +c.dataset.i;
    drag = { sx: i % W, sy: Math.floor(i / W), ax: null, p: 0 };
    if (tap(i) === false) drag = null;
});
puz.addEventListener('pointermove', e => {
    if (!drag) return;
    const c = cellAt(e.clientX, e.clientY); if (!c) return;
    const i = +c.dataset.i, cx = i % W, cy = Math.floor(i / W);
    if (!drag.ax) {
        if (cx === drag.sx && cy === drag.sy) return;
        drag.ax = Math.abs(cx - drag.sx) >= Math.abs(cy - drag.sy) ? 'r' : 'c';
        drag.p = drag.ax === 'r' ? drag.sx : drag.sy;
    }
    const t = drag.ax === 'r' ? cx : cy, step = Math.sign(t - drag.p);
    while (drag && drag.p !== t) {
        drag.p += step;
        if (tap(drag.ax === 'r' ? drag.sy * W + drag.p : drag.p * W + drag.sx) === false) drag = null;
    }
});
['pointerup', 'pointercancel'].forEach(ev => window.addEventListener(ev, () => { drag = null; }));
puz.addEventListener('click', e => { const c = e.target.closest('.cell'); if (c && e.detail === 0) tap(+c.dataset.i); }); // clavier

function end(win) {
    state = 'over'; st.g = null; save();
    $('goEmoji').textContent = win ? '🎉' : '💥';
    $('goTitle').textContent = win ? 'Bravo !' : 'Perdu…';
    $('goName').textContent = pat.n;
    const pv = $('goPrev'); pv.style.setProperty('--w', W); pv.innerHTML = sol.map(v => `<i class="${v ? 'on' : ''}"></i>`).join('');
    setTimeout(() => open(overO), win ? 450 : 700);
}

function pauseGame() { if (state !== 'running') return; state = 'paused'; open(pauseO); save(); }
function resumeGame() { if (state !== 'paused') return; open(pauseO, false); state = 'running'; last = performance.now(); }
function newGame() { st.g = null; save(); state = 'ready'; open(pauseO, false); open(overO, false); open(startO); }
function toMenu() { st.g = null; save(); location.href = MENU; }

startO.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => startGame(b.dataset.d)));
$('pauseBtn').addEventListener('click', pauseGame);
$('resumeBtn').addEventListener('click', resumeGame);
$('restartPauseBtn').addEventListener('click', newGame);
$('menuPauseBtn').addEventListener('click', toMenu);
$('goRestartBtn').addEventListener('click', () => { open(overO, false); startGame(curD); });
$('goSizeBtn').addEventListener('click', newGame);
$('goMenuBtn').addEventListener('click', () => { location.href = MENU; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', pauseGame);
window.addEventListener('resize', fit);
['touchmove', 'gesturestart'].forEach(ev => document.addEventListener(ev, e => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

function loop(now) {
    const dt = Math.min(now - last, 250); last = now;
    if (state === 'running') {
        elapsed += dt; st.g.t = elapsed; renderTime();
        if ((acc += dt) > 2000) { acc = 0; save(); }
    }
    requestAnimationFrame(loop);
}

if (st.g && BY[st.g.i] && st.g.b.length === BY[st.g.i].g.replace(/\//g, '').length) load(st.g);
else { st.g = null; save(); lives = MAXL; renderLives(); }
requestAnimationFrame(loop);