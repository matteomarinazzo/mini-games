// Escape Game · boucle de jeu, écrans, interactions, carnet
import { initGL } from './core/render.js';
import { renderDoc } from './core/docs.js';
import { createInput } from './core/input.js';
import { makeRoom, aim, look, moveP, inside, obsText } from './core/room.js';
import { loadRun, saveRun, clearRun, getBest, submitBest, getWorld, setWorld } from './core/save.js';

const $ = (i) => document.getElementById(i);
const cv = $('gameCanvas'), sb = $('searchBtn'), GL = initGL(cv), coarse = matchMedia('(pointer:coarse)').matches;
const touchUI = () => matchMedia('(pointer:coarse),(max-width:700px)').matches;
const MODALS = ['title', 'rules', 'rec', 'pause', 'end', 'conf', 'note', 'doc'];
const ov = { title: $('startScreen'), rules: $('rulesOverlay'), rec: $('recOverlay'), pause: $('pauseOverlay'), end: $('endOverlay'), conf: $('confOverlay'), pad: $('padOverlay'), note: $('noteOverlay'), doc: $('docOverlay') };
const FN = { chest: 'Coffre', drawer: 'Tiroir' }, SPEED = 2.4, PMAX = 80 * Math.PI / 180;
const isOpen = (k) => ov[k].classList.contains('open');
const anyModal = () => MODALS.some(isOpen);
const fmt = (ms) => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const plural = (n) => n + (n > 1 ? ' salles' : ' salle');

// Record mondial Firebase (leaderboards/escape_game/score) : { value: salles, duration: ms, message, timestamp }
const FB_GAME = 'escape_game', FB_KEY = 'score', WORLD_MIN_ROOMS = 1;
const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const isBetter = (a, b) => a.n > 0 && (b.n <= 0 || a.n > b.n || (a.n === b.n && a.ms < b.ms));
const fmtRec = (r) => (r.n > 0 ? `${plural(r.n)} · ${fmt(r.ms)}` : '–');
const parseRemote = (d) => (d && typeof d === 'object' ? { n: Number(d.value) || 0, ms: Number(d.duration) || 0 } : { n: Number(d) || 0, ms: 0 });
const w0 = getWorld();
let fb = null, net = null, runId = 0, pendingRecord = null;
let worldBest = w0 ? { n: w0.n, ms: w0.ms } : { n: 0, ms: 0 }, worldMsg = w0 ? w0.msg : '';

let run = loadRun(), room = null, demo = null, mode = 'title', target = null, leaving = false;
let padObj = null, entry = '', padBusy = false, lastSave = 0, shown = '', tt = 0, toastT = 0;

const live = () => mode === 'play' && !anyModal() && !padObj && !leaving;
const input = createInput(cv, { active: live, search: () => search(), lost: () => { if (live()) pause(); } });

const later = [];   // actions affichées une fois le geste terminé (page lue, clé au HUD)
function loadRoom(restore) {
    later.length = 0;
    room = makeRoom(run.seed, run.n);
    const p = run.p;
    if (restore && run.st.length === room.objs.length && inside(room, p.x, p.z)) room.objs.forEach((o, i) => { o.open = run.st[i] ? 1 : 0; o.a = o.open; o.pk = o.open; o.seen = run.sn[i] ? 1 : 0; });
    else { Object.assign(p, room.spawn); run.nt = room.intro ? [{ s: room.intro }] : []; run.sn = []; run.rd = []; }
    room.hinted = run.rd.length > 0 || run.inv.key;
    clearTarget();
}
if (run) loadRoom(true);

function persist() {
    if (!run || !room || leaving) return;
    run.st = room.objs.map((o) => (o.open ? 1 : 0));
    run.sn = room.objs.map((o) => (o.seen ? 1 : 0));
    saveRun(run);
}

const intro = () => 'Salle ' + run.n + ' · ' + room.theme + (room.intro ? '\n' + room.intro : '');
function toast(t, ms = 2400) {
    const el = $('toast'); el.textContent = t; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms);
}

function hud() {
    const s = (run ? fmt(run.ms) : '00:00') + '|' + (run ? run.n : '–') + '|' + (run ? run.tries : 3) + '|' + (run ? run.hl : 3) + '|' + mode;
    if (s === shown) return;
    shown = s;
    $('chrono').textContent = run ? fmt(run.ms) : '00:00';
    $('roomLbl').textContent = 'Salle ' + (run ? run.n : '–');
    $('tryLbl').textContent = 'Essais ' + (run ? run.tries : 3);
    $('tryLbl').classList.toggle('low', !!run && run.tries === 1);
    $('hintN').textContent = run ? run.hl : 3;
    $('hintBtn').disabled = !run || mode !== 'play' || run.hl <= 0;
}
function sync() {
    $('retourBtn').disabled = !run;
    $('pauseBtn').disabled = mode !== 'play';
    $('noteBtn').disabled = !run || mode !== 'play';
    $('continueBtn').hidden = !run;
}

function renderInv() {
    const el = $('inv'); el.textContent = '';
    if (run && run.inv.key) {
        const s = document.createElement('span'); s.className = 'chip';
        const k = document.createElement('i'); k.className = 'ico-key'; s.appendChild(k);
        const l = document.createElement('span'); l.textContent = 'Clé'; s.appendChild(l); el.appendChild(s);
    }
    el.hidden = !el.childNodes.length;
}
function addNote(s) { if (!run) return; run.nt.push({ s }); persist(); }
function addDoc(id) { if (run && !run.nt.some((q) => q.d === id)) { run.nt.push({ d: id }); persist(); } }
const HINT = () => (touchUI() ? 'Le bouton Carnet rouvre tes pages.' : 'Touche C : carnet, pour rouvrir tes pages.');
function closeNote() { closeModal('note'); if (!coarse && mode === 'play' && !anyModal()) input.lock(); }
function openNote() {
    if (!run) return;
    $('noteRoom').textContent = 'Salle ' + run.n;
    const ul = $('noteList'); ul.textContent = '';
    if (!run.nt.length) { const li = document.createElement('li'); li.textContent = 'Rien de noté pour l’instant.'; ul.appendChild(li); }
    run.nt.forEach((q) => {
        const li = document.createElement('li'), o = q.d != null && room.objs[q.d];
        if (o && o.cont && o.cont.d) {
            const b = document.createElement('button'); b.className = 'note-doc' + (run.rd.includes(q.d) ? ' read' : ''); b.textContent = '📄 ' + o.cont.d.name;
            b.addEventListener('click', () => { openDoc(q.d, false); b.classList.add('read'); }); li.appendChild(b);
        } else if (q.s) li.textContent = q.s; else return;
        ul.appendChild(li);
    });
    openModal('note');
}
function openDoc(id, first) {
    const o = room && room.objs[id];
    if (!o || !o.cont || !o.cont.d) return;
    if (!run.rd.includes(id)) { run.rd.push(id); persist(); }
    renderDoc($('docBody'), o.cont.d, first ? HINT() : '');
    $('docBox').scrollTop = 0;
    openModal('doc');
}
function closeDoc() { closeModal('doc'); if (!coarse && mode === 'play' && !anyModal()) input.lock(); }
function closeRules() { closeModal('rules'); if (!coarse && mode === 'play' && !anyModal()) input.lock(); }
function useHint() {
    if (!run || !room || run.hl <= 0 || !live()) return;
    const i = 3 - run.hl, t = room.hint(i);
    run.hl--; addNote('Indice ' + (i + 1) + ' : ' + t); toast(t, 6000); hud(); persist();
}

function closeAll() { for (const k in ov) ov[k].classList.remove('open'); padObj = null; }
function openModal(k) { input.reset(); input.unlock(); ov[k].classList.add('open'); sync(); }
function closeModal(k) { ov[k].classList.remove('open'); sync(); }

const home = () => { location.href = '../../index.html'; };
let waitHome = false;
function toTitle() { closeAll(); mode = 'title'; input.reset(); input.unlock(); ov.title.classList.add('open'); sync(); hud(); renderInv(); }
function begin() { closeAll(); mode = 'play'; input.reset(); if (!coarse) input.lock(); lastSave = run.ms; sync(); hud(); renderInv(); }

function startRun() {
    if (run) submitBest(run.n - 1, Math.round(run.ms));
    runId++; pendingRecord = null; recordMessagePopup.style.display = 'none'; setWorldStatus('');
    run = { seed: (Math.random() * 4294967296) >>> 0, n: 1, tries: 3, ms: 0, inv: { key: false }, nt: [], hl: 3, rd: [], p: { x: 0, z: 0, yaw: 0, pitch: 0 }, st: [], sn: [] };
    loadRoom(false); persist(); begin();
    toast(intro(), room.intro ? 6000 : 2400);
}

function finish(kind, note) {
    const rooms = run.n - 1, ms = Math.round(run.ms), rec = submitBest(rooms, ms);
    clearRun(); run = null; room = null; later.length = 0; clearTarget(); leaving = false; shown = '';
    closeAll(); input.reset(); input.unlock();
    setWorldStatus('');
    const check = () => { if (rooms >= WORLD_MIN_ROOMS) return checkWorldRecord({ n: rooms, ms }, runId); };
    if (kind === 'menu') { (async () => { await check(); if (pendingRecord) waitHome = true; else home(); })(); return; }
    mode = 'end';
    const b = getBest();
    $('endRooms').textContent = String(rooms);
    $('endTime').textContent = fmt(ms);
    $('endBest').textContent = b ? `Record personnel : ${plural(b.n)} · ${fmt(b.ms)}` : 'Record personnel : –';
    $('endNote').textContent = (rec ? '🏆 Nouveau record ! ' : '') + (note || '');
    $('endNote').hidden = !rec && !note;
    ov.end.classList.add('open'); sync(); hud(); renderInv(); check();
}

function pause() { openModal('pause'); }
function resume() { closeModal('pause'); input.reset(); if (!coarse) input.lock(); }

function give(c, k, solved, o) {
    if (!c) return;
    if (c.t === 'act') { toast('Le levier cède. Des lampes ont changé.'); return; }
    const first = !room.hinted; room.hinted = true;
    if (c.t === 'key') {
        run.inv.key = true;
        later.push(() => { renderInv(); toast((solved ? 'Le coffre s’ouvre. ' : '') + 'Tu prends la clé.' + (first ? '\n' + HINT() : ''), first ? 6000 : 3000); });
    } else if (o) { addDoc(o.id); later.push(() => openDoc(o.id, first)); }
}

function leave() {
    leaving = true; clearTarget(); input.reset();
    setTimeout(() => $('fade').classList.add('on'), 640);
    setTimeout(() => {
        if (run) {
            run.n++; run.inv = { key: false }; run.nt = []; run.sn = []; run.rd = []; run.hl = 3; run.tries = 3; ov.doc.classList.remove('open');
            loadRoom(false); leaving = false; persist(); renderInv(); hud();
            toast(intro(), room.intro ? 6000 : 2400);
        }
        leaving = false; $('fade').classList.remove('on');
    }, 1000);
}

function search() {
    if (!live() || !target || room.busy()) return;
    const o = target, k = o.kind;
    if (k === 'door') {
        if (!run.inv.key) return;
        run.inv.key = false; renderInv(); o.open = 1; leave(); return;
    }
    if (o.lock) { if (o.open) toast('Déjà ouvert.'); else openPad(o); return; }
    if (o.open) return;
    o.open = 1; give(o.cont, k, false, o); persist();
}

function openPad(o) {
    padObj = o; entry = ''; padBusy = false; input.reset(); input.unlock();
    $('padTitle').textContent = FN[o.kind]; drawPad(); ov.pad.classList.add('open');
}
function closePad() { padObj = null; ov.pad.classList.remove('open'); }
function drawPad() {
    const L = padObj.lock.s.length, d = $('codeDisp'); d.textContent = '';
    for (let i = 0; i < L; i++) { const s = document.createElement('span'); s.textContent = entry[i] || ''; if (i === entry.length) s.className = 'cur'; d.appendChild(s); }
    $('padOk').disabled = entry.length !== L;
}
function press(d) { if (!padObj || padBusy || entry.length >= padObj.lock.s.length) return; entry += d; drawPad(); }
function erase() { if (!padObj || padBusy) return; entry = entry.slice(0, -1); drawPad(); }
function submit() {
    if (!padObj || padBusy || entry.length !== padObj.lock.s.length) return;
    const o = padObj;
    if (entry === o.lock.s) { closePad(); run.tries = 3; hud(); o.open = 1; give(o.cont, o.kind, true, o); persist(); return; }
    run.tries--; padBusy = true;
    const box = $('padBox'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
    hud(); persist();
    setTimeout(() => {
        padBusy = false; entry = '';
        if (run && run.tries <= 0) { const m = room ? room.meth : ''; closePad(); finish('end', 'Plus d’essais. Méthode : ' + m); }
        else if (padObj) drawPad();
    }, 600);
}
(() => {
    const kp = $('keypad');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].forEach((t) => {
        const b = document.createElement('button'); b.className = 'key' + (t === 'OK' ? ' ok' : ''); b.textContent = t; if (t === 'OK') b.id = 'padOk';
        b.addEventListener('click', () => (t === 'OK' ? submit() : t === '⌫' ? erase() : press(t)));
        kp.appendChild(b);
    });
})();
$('padClose').addEventListener('click', closePad);

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    const k = e.key;
    if (padObj) {
        if (/^\d$/.test(k)) press(k); else if (k === 'Backspace') erase(); else if (k === 'Enter') submit(); else if (k === 'Escape') closePad(); else return;
        e.preventDefault(); return;
    }
    if (k === 'c' || k === 'C') {
        if (isOpen('doc')) return;
        if (isOpen('note')) closeNote(); else if (live()) openNote(); else return;
        e.preventDefault(); return;
    }
    if (k === 'i' || k === 'I') {
        if (e.repeat || !live()) return;
        useHint(); e.preventDefault(); return;
    }
    if (k === 'r' || k === 'R') {
        if (e.repeat || isOpen('doc') || isOpen('note')) return;
        if (isOpen('rules')) closeRules();
        else if (MODALS.every((m) => m === 'title' || !isOpen(m))) openModal('rules');
        else return;
        e.preventDefault(); return;
    }
    if (k !== 'Escape') return;
    if (performance.now() - input.lostAt < 250) return;
    if (isOpen('conf')) closeModal('conf');
    else if (isOpen('doc')) closeDoc();
    else if (isOpen('note')) closeNote();
    else if (isOpen('rules')) closeRules();
    else if (isOpen('rec')) closeModal('rec');
    else if (isOpen('pause')) resume();
    else if (mode === 'play') pause();
});

function renderRecords() {
    const b = getBest();
    $('recPersonalRooms').textContent = b ? b.n : '–';
    $('recPersonalTime').textContent = b ? fmt(b.ms) : '–';
    $('recGlobalRooms').textContent = worldBest.n > 0 ? worldBest.n : '–';
    $('recGlobalTime').textContent = worldBest.n > 0 ? fmt(worldBest.ms) : '–';
}
async function openRec() {
    renderRecords();
    $('recStatus').textContent = 'Synchronisation...';
    openModal('rec');
    const card = $('recGlobalCard');
    const addMsg = (msg) => {
        card.querySelectorAll('.rc-message').forEach((m) => m.remove());
        if (!msg) return;
        const m = document.createElement('span'); m.className = 'rc-message'; m.textContent = `« ${msg} »`; card.appendChild(m);
    };
    addMsg('');
    try {
        if (fb && await isOnline()) {
            const ok = await refreshWorldRecord();
            renderRecords(); addMsg(worldMsg);
            $('recStatus').textContent = ok ? 'À jour (Cloud)' : 'Erreur de connexion';
        } else {
            addMsg(worldMsg);
            $('recStatus').textContent = 'Hors ligne (Records locaux)';
        }
    } catch (e) {
        console.error('Firebase records error:', e);
        addMsg(worldMsg);
        $('recStatus').textContent = 'Erreur de connexion';
    }
}

// ── Records en ligne (même fonctionnement que Coupe-Fruits) ──
const recordMessagePopup = $('recordMessagePopup'), recordMsgInput = $('recordMsgInput');
const saveRecordMsgBtn = $('saveRecordMsgBtn'), recordCharCounter = $('recordCharCounter');
function setWorldStatus(t) { $('goWorldStatus').textContent = t; }
async function isOnline() {
    try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; }
}
async function refreshWorldRecord() {
    try {
        if (!fb || !(await isOnline())) return false;
        const data = await fb.getFirebaseRecordData(FB_GAME, FB_KEY);
        if (data == null) {
            if (worldBest.n > 0) return false;
            worldBest = { n: 0, ms: 0 }; worldMsg = '';
            return true;
        }
        worldBest = parseRemote(data);
        worldMsg = data && typeof data.message === 'string' ? data.message : '';
        if (worldBest.n > 0 && worldBest.ms > 0) setWorld({ n: worldBest.n, ms: worldBest.ms, msg: worldMsg });
        return true;
    } catch (e) { console.error('Firebase records error:', e); return false; }
}
async function initOnline() {
    try {
        [fb, net] = await Promise.all([
            import('../../../js/firebaseWrk.js'),
            import('../../../js/network.js')
        ]);
        await refreshWorldRecord();
    } catch (e) { console.warn('Mode hors ligne :', e); }
}
async function checkWorldRecord(result, myRun) {
    setWorldStatus('Vérification du record mondial…');
    try {
        await Promise.race([onlineReady, wait(2500)]);
        if (myRun !== runId) return;
        const online = await Promise.race([isOnline(), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!online || !fb) { setWorldStatus('Hors ligne : record mondial indisponible. Ton record personnel reste sauvegardé.'); return; }
        const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
        if (myRun !== runId) return;
        if (!fresh) { setWorldStatus('Record mondial indisponible pour le moment.'); return; }
        if (isBetter(result, worldBest)) {
            pendingRecord = result;
            setWorldStatus('🌍 Tu bats le record mondial !');
            recordMessagePopup.style.display = 'flex';
            recordMsgInput.value = ''; recordCharCounter.textContent = '0/50';
            setTimeout(() => recordMsgInput.focus(), 100);
        } else {
            setWorldStatus(`Record mondial : ${fmtRec(worldBest)}`);
        }
    } catch (e) {
        console.error('Firebase records error:', e);
        if (myRun === runId) setWorldStatus('Record mondial indisponible pour le moment.');
    }
}
saveRecordMsgBtn.addEventListener('click', async () => {
    if (!pendingRecord) return;
    const rec = pendingRecord, message = recordMsgInput.value.trim().substring(0, 50);
    saveRecordMsgBtn.disabled = true; saveRecordMsgBtn.textContent = 'Enregistrement...';
    let published = false, beaten = false;
    try {
        if (fb) {
            const fresh = await Promise.race([refreshWorldRecord(), wait(2500, false)]);
            if (fresh && !isBetter(rec, worldBest)) beaten = true;
            else {
                const res = await Promise.race([
                    fb.setFirebaseLeaderboard(FB_GAME, FB_KEY, { value: rec.n, duration: rec.ms, message, timestamp: Date.now() }),
                    wait(4000, false)
                ]);
                published = res === true;
            }
        }
    } catch (e) { console.error('Error saving record message:', e); }
    if (published) {
        worldBest = { n: rec.n, ms: rec.ms }; worldMsg = message; setWorld({ n: rec.n, ms: rec.ms, msg: message });
        setWorldStatus('🌍 Record mondial publié !');
    } else if (beaten) setWorldStatus('Un autre joueur a battu ce record entre-temps.');
    else setWorldStatus('Record mondial non publié : connexion indisponible.');
    saveRecordMsgBtn.disabled = false; saveRecordMsgBtn.textContent = 'Sauvegarder';
    recordMessagePopup.style.display = 'none';
    pendingRecord = null;
    if (waitHome) home();
});
recordMsgInput.addEventListener('input', () => { recordCharCounter.textContent = `${recordMsgInput.value.length}/50`; });

$('playBtn').addEventListener('click', startRun);
$('continueBtn').addEventListener('click', () => { if (run) begin(); });
$('recordsBtn').addEventListener('click', openRec);
$('rulesBtn2').addEventListener('click', () => openModal('rules'));
$('recBtn').addEventListener('click', openRec);
$('rulesBtn').addEventListener('click', () => openModal('rules'));
$('rulesClose').addEventListener('click', closeRules);
document.querySelectorAll('.lv-tab').forEach((b, _, all) => b.addEventListener('click', () => {
    all.forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.lv-pg').forEach((p) => { p.hidden = p.id !== 'lv-' + b.dataset.t; });
}));
$('noteBtn').addEventListener('click', openNote);
$('hintBtn').addEventListener('click', useHint);
$('docClose').addEventListener('click', closeDoc);
ov.doc.addEventListener('click', (e) => { if (e.target === ov.doc) closeDoc(); });
$('noteClose').addEventListener('click', closeNote);
ov.note.addEventListener('click', (e) => { if (e.target === ov.note) closeNote(); });
$('recClose').addEventListener('click', () => closeModal('rec'));
ov.rules.addEventListener('click', (e) => { if (e.target === ov.rules) closeRules(); });
ov.rec.addEventListener('click', (e) => { if (e.target === ov.rec) closeModal('rec'); });
$('pauseBtn').addEventListener('click', () => { if (mode === 'play') pause(); });
$('resumeBtn').addEventListener('click', resume);
$('giveUpBtn').addEventListener('click', () => { if (run) finish('end', 'Partie abandonnée.'); });
$('menuBtn').addEventListener('click', () => { if (run) finish('menu'); });
$('retourBtn').addEventListener('click', () => { if (run) openModal('conf'); });
$('confYes').addEventListener('click', () => { if (run) finish('menu'); else closeModal('conf'); });
$('confNo').addEventListener('click', () => closeModal('conf'));
$('againBtn').addEventListener('click', startRun);
$('endMenuBtn').addEventListener('click', home);
document.addEventListener('visibilitychange', () => { if (document.hidden && live()) pause(); });
addEventListener('pagehide', persist);
['touchmove', 'gesturestart'].forEach((ev) => document.addEventListener(ev, (e) => { if (!e.target.closest('.modal')) e.preventDefault(); }, { passive: false }));

if (!GL) { $('glMsg').hidden = false; $('playBtn').hidden = true; $('continueBtn').hidden = true; }
else addEventListener('resize', GL.resize);

// Le bouton n'existe (hidden) que s'il y a une cible. Libellé selon la cible.
function setTarget(t) {
    if (t === target) return;
    target = t; sb.hidden = !t;
    if (t) sb.textContent = (touchUI() ? '' : 'E · ') + (t.kind === 'door' ? 'Ouvrir' : 'Fouiller');
}
function clearTarget() { target = null; sb.hidden = true; }

let last = 0;
function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
    const play = mode === 'play' && !anyModal();
    if (play && run) {
        run.ms += dt * 1000;
        if (run.ms - lastSave >= 1000) { lastSave = run.ms; persist(); }
    }
    let tgt = null;
    if (run && room && play && !padObj && !leaving) {
        const p = run.p;
        p.yaw += input.dyaw + (input.tr - input.tl) * 2 * dt; input.dyaw = 0;
        p.pitch = Math.max(-PMAX, Math.min(PMAX, p.pitch + input.dpitch)); input.dpitch = 0;
        const fx = input.f - input.b, sx = input.r - input.l;
        if (fx || sx) {
            const v = SPEED * dt / Math.hypot(fx, sx), s = Math.sin(p.yaw), c = Math.cos(p.yaw);
            moveP(room, p, (fx * s + sx * c) * v, (-fx * c + sx * s) * v);
        }
        tgt = room.busy() ? null : aim(room, p, run.inv.key);
        const lk = look(room, p);
        if (lk && !lk.seen) { lk.seen = 1; const t = obsText(lk); addNote(t); toast(t, 3000); }
    } else { input.dyaw = input.dpitch = 0; }
    setTarget(tgt);
    if (room && run && play) {   // pause, carnet, page : le geste se fige et reprend
        room.setCam(run.p); room.tick(dt);
        if (leaving && run.p.z < 1.35) run.p.z = Math.min(1.35, run.p.z + dt * 1.6);   // recule devant le battant qui s'ouvre
        if (later.length && !room.busy()) later.splice(0).forEach((f) => f());
    }
    hud();
    if (!GL) return;
    let r = room, cam;
    if (r) cam = run.p;
    else {
        if (!demo) demo = makeRoom((Math.random() * 4294967296) >>> 0, 2 + ((Math.random() * 4) | 0));
        r = demo; tt += dt; cam = { x: r.RW / 2, z: r.RD / 2, yaw: tt * .2, pitch: -.05 };
    }
    GL.draw(r, cam, target && room ? target.id : -1);
}

if (GL) GL.resize();
sync(); hud(); renderInv(); clearTarget();
requestAnimationFrame(frame);
const onlineReady = initOnline();