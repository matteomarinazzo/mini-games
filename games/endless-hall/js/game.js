import { build } from './core/textures.js';
import { createView, render, relight } from './core/raycast.js';
import { step } from './core/player.js';
import { load, write, defaults, newSeed } from './core/save.js';
import { HALL, STEPS, newPlan, applyScene } from './core/data.js';
import { fmt, best, saveBest, worldCache, setWorldCache, renderWorld } from './core/records.js';
import { getFb, fetchWorld, submitWorld, wait, MESSAGE_MAX } from './core/world.js';

const $ = (id) => document.getElementById(id);
const cv = $('gameCanvas'), ctx = cv.getContext('2d');
const pauseOv = $('pauseOverlay'), rulesOv = $('rulesOverlay'), winOv = $('winOverlay'), popOv = $('recordMessagePopup');
const startOv = $('startScreen'), recOv = $('recOverlay');
const hint = $('tapHint'), chronoEl = $('chrono'), msgIn = $('recordMsgInput'), saveBtn = $('saveRecordMsgBtn');

const saved = load(), sv = saved || defaults();
const P = { x: sv.pos.x, y: sv.pos.y, a: sv.angle };
const S = { step: sv.step, seed: sv.seed, plan: sv.plan, dir: sv.dir, chrono: sv.chrono };
let shown = '', lastMs = 0, pending = 0, busy = false;
const scene = () => { applyScene(S.seed, S.step, S.plan[S.step], S.dir); build(); relight(); };
const persist = () => write(P, S);
const upd = () => { const t = fmt(S.chrono.ms); if (t !== shown) chronoEl.textContent = shown = t; };
scene(); upd();

// Reconstruit la fenêtre autour du joueur : le segment franchi devient la copie 0, sans saut ni rotation.
// c = +1 : franchi à l'est (x −= ancienne longueur, y += DY) ; c = −1 : franchi à l'ouest (x += nouvelle longueur, y −= DY).
function slide(c, oldL0) {
    scene();
    if (c > 0) { P.x -= oldL0; P.y += HALL.DY; } else { P.x += HALL.L0; P.y -= HALL.DY; }
    persist(); upd();
}

// Devant = « rien d'anormal » (ligne jaune) ; derrière = « anomalie ». La marche devient l'avant dans le sens du franchissement.
function cross(c) {
    const says = c !== S.dir, oldL0 = HALL.L0;
    S.dir = c;
    if (says === !!S.plan[S.step]) {
        if (++S.step >= STEPS) return win(c, oldL0);
    } else {   // échec : le segment franchi est le couloir 0 (même seed = même hôtel, anomalie retirée), anomalies 1–7 retirées au sort
        S.step = 0; S.plan = newPlan(); S.chrono = { started: false, ms: 0 };
    }
    slide(c, oldL0);
}

function win(c, oldL0) {
    lastMs = Math.round(S.chrono.ms);
    const nb = saveBest(lastMs);
    $('winTime').textContent = fmt(lastMs);
    $('winBest').textContent = 'Ton record : ' + fmt(best());
    $('winRecord').textContent = '🏆 Nouveau record !'; $('winRecord').hidden = !nb; $('winNote').hidden = true;
    showWorld();
    // nouvelle partie : nouvel état 0 tiré au hasard, couloir 0 propre
    Object.assign(S, { step: 0, seed: newSeed(), plan: newPlan(), chrono: { started: false, ms: 0 } });
    slide(c, oldL0);
    clearInput(); busy = true; const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    setTimeout(() => { busy = false; winOv.classList.add('open'); worldFlow(lastMs); }, 450);
}

const showWorld = () => renderWorld($('winWorld'), worldCache());
async function worldFlow(ms) {
    pending = 0;
    const fb = await getFb();
    if (!fb) return;
    const w = await Promise.race([fetchWorld(fb), wait(2500, null)]);
    if (!w || !w.ok) return;
    setWorldCache(w.value === null ? null : { value: w.value, message: w.message }); showWorld();
    if (w.value === null || ms < w.value) {
        pending = ms; msgIn.value = ''; $('recordCharCounter').textContent = `0/${MESSAGE_MAX}`;
        saveBtn.disabled = false; saveBtn.textContent = 'Sauvegarder'; clearInput(); popOv.classList.add('open');
        setTimeout(() => msgIn.focus(), 100);
    }
}
async function saveWorld() {
    if (!pending || saveBtn.disabled) return;
    const ms = pending, note = (t) => { $('winNote').textContent = t; $('winNote').hidden = false; };
    saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement...';
    const fb = await getFb();
    const r = fb ? await Promise.race([submitWorld(fb, ms, msgIn.value), wait(6000, null)]) : null;
    pending = 0; popOv.classList.remove('open');
    if (r && (r.written || r.beaten)) setWorldCache({ value: r.value, message: r.message });
    if (r && r.written) { $('winRecord').textContent = '🌍 Record mondial !'; $('winRecord').hidden = false; }
    else if (r && r.beaten) note('Un meilleur record mondial vient d\'être enregistré.');
    else note('Record mondial non enregistré (connexion ?).');
    showWorld();
}
saveBtn.addEventListener('click', saveWorld);
msgIn.addEventListener('input', () => { $('recordCharCounter').textContent = `${msgIn.value.length}/${MESSAGE_MAX}`; });
msgIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveWorld(); });

let view, budget = matchMedia('(pointer:coarse)').matches ? 150000 : 260000, ema = .0167, slow = 0;
function resize() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    view = createView(r.width, r.height, budget);
}

const KEYMAP = {
    arrowup: 'fwd', z: 'fwd', w: 'fwd', arrowdown: 'back', s: 'back',
    arrowleft: 'left', q: 'left', a: 'left', arrowright: 'right', d: 'right',
};
const keys = {}, pad = {};
const clearInput = () => { for (const k in keys) keys[k] = false; for (const k in pad) pad[k] = false; document.querySelectorAll('.pad-btn.active').forEach((b) => b.classList.remove('active')); };
const hideHint = () => hint.classList.add('hidden');
const overlayOpen = () => busy || [startOv, pauseOv, rulesOv, recOv, winOv, popOv].some((o) => o.classList.contains('open'));

function pause() { clearInput(); pauseOv.classList.add('open'); }
function resume() { pauseOv.classList.remove('open'); }
function openRules() { clearInput(); rulesOv.classList.add('open'); }
function closeRules() { rulesOv.classList.remove('open'); }

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase(), a = KEYMAP[k];
    if (a) { if (!overlayOpen()) { keys[a] = true; hideHint(); } e.preventDefault(); }
    else if (k === 'escape') {
        if (winOv.classList.contains('open') || popOv.classList.contains('open')) return;
        if (rulesOv.classList.contains('open')) closeRules();
        else if (recOv.classList.contains('open')) closeRec();
        else if (startOv.classList.contains('open')) return;
        else if (pauseOv.classList.contains('open')) resume();
        else pause();
    }
    else if (k === 'enter' && startOv.classList.contains('open') && ![rulesOv, recOv, winOv, popOv].some((o) => o.classList.contains('open'))) play();
});
document.addEventListener('keyup', (e) => { const a = KEYMAP[e.key.toLowerCase()]; if (a) keys[a] = false; });

document.querySelectorAll('.pad-btn').forEach((b) => {
    const act = b.dataset.act;
    const on = (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); pad[act] = true; b.classList.add('active'); hideHint(); };
    const off = () => { pad[act] = false; b.classList.remove('active'); };
    b.addEventListener('pointerdown', on);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, off));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
});
['touchmove', 'gesturestart'].forEach((ev) =>
    document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

// Modale de départ : la partie ne démarre qu'au clic sur Jouer / Continuer
$('playBtn').textContent = saved ? 'Continuer' : 'Jouer';
function play() { startOv.classList.remove('open'); clearInput(); }
$('playBtn').addEventListener('click', play);

// Records (bouton globe du HUD)
async function syncWorld() {
    const st = $('recStatus'); renderWorld($('recWorld'), worldCache()); st.textContent = 'Synchronisation...';
    const fb = await getFb();
    if (!fb) { st.textContent = 'Hors ligne (dernier record connu)'; return; }
    const w = await fetchWorld(fb);
    if (!w.ok) { st.textContent = 'Erreur de connexion'; return; }
    const r = w.value === null ? null : { value: w.value, message: w.message };
    setWorldCache(r); renderWorld($('recWorld'), r); st.textContent = 'À jour (Cloud)';
}
function openRec() { clearInput(); $('recBest').textContent = best() ? fmt(best()) : '–'; recOv.classList.add('open'); syncWorld(); }
function closeRec() { recOv.classList.remove('open'); }
$('recBtn').addEventListener('click', openRec);
$('recClose').addEventListener('click', closeRec);
recOv.addEventListener('click', (e) => { if (e.target === recOv) closeRec(); });

$('pauseBtn').addEventListener('click', () => { if (!startOv.classList.contains('open')) pause(); });
$('resumeBtn').addEventListener('click', resume);
$('quitBtn').addEventListener('click', () => { persist(); location.href = '../../index.html'; });
$('rulesBtn').addEventListener('click', openRules);
$('rulesClose').addEventListener('click', closeRules);
rulesOv.addEventListener('click', (e) => { if (e.target === rulesOv) closeRules(); });
$('againBtn').addEventListener('click', () => winOv.classList.remove('open'));
$('menuBtn').addEventListener('click', () => { location.href = '../../index.html'; });
document.addEventListener('visibilitychange', () => { if (document.hidden && !overlayOpen()) pause(); });
addEventListener('blur', () => { if (!overlayOpen()) pause(); });
addEventListener('pagehide', () => { if (!startOv.classList.contains('open')) persist(); });
addEventListener('resize', resize);

let last = 0;
function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
    ema += (dt - ema) * .05;
    if (ema > .03 && budget > 100000) { if (++slow > 40) { budget *= .8; slow = 0; ema = .0167; resize(); } } else slow = 0;
    if (!overlayOpen()) {
        const turn = ((keys.right || pad.right) ? 1 : 0) - ((keys.left || pad.left) ? 1 : 0);
        const move = ((keys.fwd || pad.fwd) ? 1 : 0) - ((keys.back || pad.back) ? 1 : 0);
        if (move) S.chrono.started = true;
        if (S.chrono.started) S.chrono.ms += dt * 1000;
        if (step(P, { turn, move }, dt)) {
            const T = HALL.thresholds;
            if (P.x >= T.far + T.thick) cross(1);
            else if (P.x < T.entry - T.thick) cross(-1);
            else persist();
        }
        upd();
    }
    render(view, P);
    view.octx.putImageData(view.img, 0, 0);
    ctx.drawImage(view.off, 0, 0, cv.width, cv.height);
}

resize();
requestAnimationFrame(frame);
