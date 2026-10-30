import { CIRCUITS, circuitList, loadTracks, saveTracks, CAR_LIST, DIFFS, loadSaved, loadRec, loadClm, saveSaved, sanitize, startSession, loadCustom, saveCustom } from './core/config.js';
import { trackOf } from './core/track.js';
import { drawTrack, startMark, stats } from './core/map.js';
import { CARS } from './core/physics.js';
import { look, customSheet, registerCustom, KIND_LIST, SPEC } from './core/sheets.js';
import { createTrackEditor, THEMES, stadium } from './core/track-editor.js';
import * as Net from './net.js';

const $ = (id) => document.getElementById(id);
let cfg = loadSaved();
let gameMode = sessionStorage.getItem('3d-racing-mode') || 'solo';
$('btnSolo')?.addEventListener('click', () => { gameMode = 'solo'; sessionStorage.setItem('3d-racing-mode', 'solo'); });
$('btnClm')?.addEventListener('click', () => { gameMode = 'clm'; sessionStorage.setItem('3d-racing-mode', 'clm'); });
$('btnMulti')?.addEventListener('click', () => { gameMode = 'multi'; sessionStorage.setItem('3d-racing-mode', 'multi'); });
const PARENT = { home: null, circuits: 'home', cars: 'circuits', race: 'cars', rules: 'home', records: 'home', designer: 'cars', tdesigner: 'circuits' };
let dzFrom = 'cars', dz = null, mine = false, tkFrom = 'circuits', tkPending = null, tkLoaded = false, mineT = false, TK = null;
const cur = () => { const h = location.hash.slice(1); return h in PARENT ? h : 'home'; };
const f3 = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); };
const byId = (list, id) => list.find((x) => x.id === id) || list[0];
// entrée choisie : bordure d'accent sur la carte (circuits, voitures)
const markCards = (el, id) => { for (const b of el.querySelectorAll('.gcard')) { const on = b.dataset.id === id; b.style.borderColor = on ? 'var(--acc)' : ''; b.style.boxShadow = on ? '0 0 0 2px var(--acc)' : ''; b.setAttribute('aria-pressed', on); } };
function show() {
  const id = cur();
  document.querySelectorAll('.scr').forEach((s) => s.classList.toggle('on', s.id === id));
  $('hm').hidden = id === 'home';
  scrollTo(0, 0);
  if (id === 'circuits') {
    $('cgrid').hidden = mineT; $('tmine').hidden = !mineT; $('tabCStock').classList.toggle('on', !mineT); $('tabCMine').classList.toggle('on', mineT);
    renderMineT(); $('cntCStock').textContent = CIRCUITS.length; $('cntCMine').textContent = loadTracks().length; markCards($('cgrid'), cfg.circuit); markCards($('tgrid'), cfg.circuit);
  }
  if (id !== 'tdesigner') tkLoaded = false; else if (!tkLoaded) { tkLoaded = true; tkOpen(tkPending); tkPending = null; }
  if (id !== 'designer') dz = null; else if (!dz) { dz = newDef(); fillDz(); }
  if (id === 'cars') {
    $('vgrid').hidden = mine; $('mine').hidden = !mine; $('tabStock').classList.toggle('on', !mine); $('tabMine').classList.toggle('on', mine);
    renderMine(); $('cntStock').textContent = CAR_LIST.length; $('cntMine').textContent = loadCustom().length; $('tabStock').setAttribute('aria-selected', !mine); $('tabMine').setAttribute('aria-selected', mine); markCards($('vgrid'), cfg.car); markCards($('mgrid'), cfg.car);
  }
  if (id === 'race') {
    const isMulti = gameMode === 'multi';
    if ($('soloConfig')) $('soloConfig').hidden = isMulti;
    if ($('multiConfig')) $('multiConfig').hidden = !isMulti;
    if ($('raceScreenTitle')) $('raceScreenTitle').textContent = isMulti ? 'Multijoueur' : 'Course';
    sync();
  }
  if (id === 'records') renderRecords();
}
// --- Records : onglets Contre la montre (par circuit, toutes voitures) / Course (tour + place par circuit) / Meilleurs tours (meilleure voiture par circuit)
let recTab = 'clm', recCircuit = null;
const ALLCARS = () => [...CAR_LIST, ...loadCustom()];
const ord = (n) => n + (n === 1 ? 'er' : 'e');
const row = (lead, name, val, sub, cls = '') => { const d = document.createElement('div'); d.className = 'rrow ' + cls; for (const [t, c] of [[lead, 'rk'], [name, 'rn'], [sub, 'rs'], [val, 'rv']]) { const s = document.createElement('span'); s.className = c; s.textContent = t; d.appendChild(s); } return d; };
const empty = (t) => { const d = document.createElement('div'); d.className = 'rempty'; d.textContent = t; return d; };
function renderRecords() {
  const CIRCUITS = circuitList();   // intégrés + perso
  const clm = loadClm(), cars = ALLCARS(), list = $('rcList'), sel = $('rcCircuit');
  const nClm = (id) => cars.filter((v) => clm[id]?.[v.id] > 0).length;
  const raceOf = CIRCUITS.map((c) => [c, loadRec(c.id)]).filter(([, r]) => r.lap !== null || r.place !== null);
  $('rcClm').textContent = CIRCUITS.reduce((s, c) => s + nClm(c.id), 0); $('rcRace').textContent = raceOf.length;
  document.querySelectorAll('[data-rt]').forEach((b) => { const on = b.dataset.rt === recTab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  $('rcSel').hidden = recTab !== 'clm';
  list.textContent = '';
  if (recTab === 'clm') {
    if (!recCircuit || !CIRCUITS.some((c) => c.id === recCircuit)) recCircuit = (CIRCUITS.find((c) => nClm(c.id)) || byId(CIRCUITS, cfg.circuit)).id;
    sel.textContent = '';
    for (const c of CIRCUITS) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name + (nClm(c.id) ? ' (' + nClm(c.id) + ')' : ''); sel.appendChild(o); }
    sel.value = recCircuit;
    const rows = cars.filter((v) => clm[recCircuit]?.[v.id] > 0).map((v) => [v, clm[recCircuit][v.id]]).sort((a, b) => a[1] - b[1]);
    if (!rows.length) return list.appendChild(empty('Aucun temps sur ce circuit. Lance un contre la montre !'));
    rows.forEach(([v, t], i) => list.appendChild(row(['🥇', '🥈', '🥉'][i] || i + 1, v.name, f3(t), i ? '+' + (t - rows[0][1]).toFixed(3) + ' s' : 'Record', i === 0 ? 'top' : '')));
  } else if (recTab === 'race') {
    if (!raceOf.length) return list.appendChild(empty('Aucun résultat de course enregistré.'));
    const h = row('', 'Circuit', 'Meilleur tour', 'Meilleure place', 'rh'); list.appendChild(h);
    for (const [c, r] of raceOf) list.appendChild(row('🏁', c.name, r.lap === null ? '–' : f3(r.lap), r.place === null ? '–' : ord(r.place) + ' place'));
  } else {
    const rows = CIRCUITS.map((c) => { let b = null; for (const v of cars) { const t = clm[c.id]?.[v.id]; if (t > 0 && (!b || t < b[1])) b = [v, t]; } return [c, b]; }).filter(([, b]) => b);
    if (!rows.length) return list.appendChild(empty('Aucun temps enregistré pour le moment.'));
    list.appendChild(row('', 'Circuit', 'Temps', 'Voiture', 'rh'));
    for (const [c, [v, t]] of rows) list.appendChild(row('⏱️', c.name, f3(t), v.name));
  }
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-rt]'); if (b) { recTab = b.dataset.rt; renderRecords(); } });
document.addEventListener('change', (e) => { if (e.target.id === 'rcCircuit') { recCircuit = e.target.value; renderRecords(); } });
const back = () => { const p = cur() === 'designer' ? dzFrom : cur() === 'tdesigner' ? tkFrom : PARENT[cur()]; if (p) location.replace('#' + p); };
addEventListener('hashchange', show);
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]'); if (g) location.hash = g.dataset.go;
  if (e.target.closest('[data-back]')) back();
});

// Grille générique : une carte par entrée de liste (aperçu canvas, nom, stats). Ajouter une entrée aux listes suffit.
function grid(el, list, preview, stats, pick) { for (const it of list) el.appendChild(cardEl(it, preview, stats, pick)); }
function cardEl(it, preview, stats, pick) {
  {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'gcard'; b.dataset.id = it.id;
    b.innerHTML = '<canvas width="300" height="220"></canvas><h3></h3><div></div>';
    b.querySelector('h3').textContent = it.name;
    preview(b.querySelector('canvas').getContext('2d'), it);
    const box = b.lastElementChild;
    for (const [k, v] of stats(it)) { const d = document.createElement('div'); d.className = 'st'; d.innerHTML = '<span></span><b></b>'; d.firstChild.textContent = k; d.lastChild.textContent = v; box.appendChild(d); }
    b.addEventListener('click', () => pick(it));
    return b;
  }
}
// Circuits : aperçu dessiné depuis la spline de chaque circuit (intégrés et perso)
const cPrev = (x, c) => { const t = trackOf(c.id); startMark(x, (drawTrack(x, 300, 220, 18, 11, '#0b0f1a', t), drawTrack(x, 300, 220, 18, 5, '#e9eef7', t)), 8, t); };
const cStats = (c) => { const s = stats(trackOf(c.id)); return [['Longueur', (s.length / 1000).toFixed(2).replace('.', ',') + ' km'], ['Virages', s.turns], ['Dénivelé', Math.round(s.climb) + ' m']]; };
const cPick = (c) => { cfg.circuit = c.id; saveSaved(cfg); location.hash = 'cars'; };
grid($('cgrid'), CIRCUITS, cPrev, cStats, cPick);

// Voitures : aperçu vectoriel (vue de dessus, sans image, livrée et proportions de la fiche) et stats lues dans les fiches physiques
const rr = (x, a, b, w, h, r) => { x.beginPath(); x.roundRect ? x.roundRect(a, b, w, h, r) : x.rect(a, b, w, h); x.fill(); };
function carPreview(x, c) {
  const lk = look(c.sheet || CARS[c.id]), rgb = (v) => 'rgb(' + v.map((q) => Math.round(q * 255)).join() + ')', col = rgb(lk.color), ac = rgb(lk.accent), k = lk.kind, D = '#14161a', G = '#1b2530';
  const wh = (l) => { x.fillStyle = D; for (const [dx, dy, w, h] of l) rr(x, dx - w / 2, dy - h / 2, w, h, 4); };
  x.save(); x.translate(150, 110); x.scale(lk.sc[2], lk.sc[0]);
  x.fillStyle = 'rgba(0,0,0,.3)'; rr(x, -104, -36, 214, 92, 26);
  if (k === 'open') {
    wh([[64, -44, 34, 22], [64, 44, 34, 22], [-62, -44, 42, 28], [-62, 44, 42, 28]]);
    x.fillStyle = D; rr(x, 90, -54, 12, 108, 2); rr(x, -114, -38, 14, 76, 2);
    x.fillStyle = col; rr(x, -100, -9, 196, 18, 9); rr(x, -62, -26, 86, 52, 12); rr(x, -114, -38, 4, 76, 1);
    x.fillStyle = D; rr(x, -16, -10, 36, 20, 9); x.fillStyle = '#fff'; x.beginPath(); x.arc(2, 0, 7, 0, 6.3); x.fill();
    x.fillStyle = ac; x.fillRect(30, -3, 60, 6);
  } else if (k === 'wedge') {
    wh([[60, -43, 32, 16], [60, 43, 32, 16], [-62, -44, 36, 18], [-62, 44, 36, 18]]);
    x.fillStyle = col; rr(x, -104, -40, 208, 80, 36); x.fillStyle = ac; x.fillRect(-96, -4, 192, 8);
    x.fillStyle = G; rr(x, -48, -27, 84, 54, 24); x.fillStyle = col; rr(x, -28, -20, 46, 40, 14);
    x.fillStyle = D; rr(x, -116, -38, 10, 76, 2); rr(x, 98, -32, 8, 64, 2);
  } else if (k === 'proto') {
    wh([[62, -40, 32, 18], [62, 40, 32, 18], [-66, -41, 38, 22], [-66, 41, 38, 22]]);
    x.fillStyle = col; rr(x, -112, -34, 218, 68, 32); x.fillStyle = ac; rr(x, -104, -3, 76, 6, 2);
    x.fillStyle = G; rr(x, -40, -22, 72, 44, 20); x.fillStyle = col; rr(x, -22, -15, 36, 30, 10);
    x.fillStyle = D; rr(x, -120, -42, 10, 84, 2); rr(x, 96, -30, 8, 60, 2);
  } else if (k === 'rally') {
    wh([[62, -45, 34, 16], [62, 45, 34, 16], [-62, -45, 34, 16], [-62, 45, 34, 16]]);
    x.fillStyle = col; rr(x, -102, -39, 206, 78, 10); x.fillStyle = ac; x.fillRect(-98, -5, 196, 10);
    x.fillStyle = G; rr(x, -52, -31, 98, 62, 8); x.fillStyle = col; rr(x, -42, -26, 72, 52, 6);
    x.fillStyle = '#ffe9a0'; for (const dy of [-20, -7, 7, 20]) rr(x, 40, dy - 4, 6, 8, 2);
    x.fillStyle = D; rr(x, -114, -46, 12, 92, 2);
  } else {
    wh([[59, -41, 30, 14], [59, 41, 30, 14], [-57, -41, 30, 14], [-57, 41, 30, 14]]);
    x.fillStyle = D; rr(x, -108, -40, 10, 80, 2); rr(x, 92, -32, 10, 64, 2);
    x.fillStyle = col; rr(x, -100, -35, 200, 70, 24); x.fillStyle = ac; x.fillRect(-98, -4, 196, 8);
    x.fillStyle = G; rr(x, -52, -24, 92, 48, 14); x.fillStyle = col; rr(x, -28, -18, 40, 36, 8);
  }
  x.restore();
}
const bal = (S) => { const r = (S.rearK || 1) * (1 - .08 * S.oversteer) / (1 - .2 * S.understeer); return r > 1.35 ? 'Sous-virage' : r > 1.2 ? 'Stable' : r > 1.05 ? 'Neutre' : 'Survirage'; };
const statsOf = (s) => [['Vitesse max', Math.round(s.vmax * 3.6) + ' km/h'], ['Puissance', Math.round(s.power / 735.5) + ' ch'], ['Masse', s.mass + ' kg'], ['Adhérence', s.grip.toFixed(2)], ['Appui', s.aero.toFixed(1)], ['Équilibre', bal(s)]];
const pickCar = (c) => { cfg.car = c.id; saveSaved(cfg); if (gameMode === 'clm') return launchClm(); location.hash = 'race'; };
grid($('vgrid'), CAR_LIST, (x, c) => carPreview(x, { sheet: CARS[c.id] }), (c) => statsOf(CARS[c.id]), pickCar);

// Écran de course : menus déroulants thémés et curseurs pour les valeurs continues.
function options(el, entries) {
  el.textContent = '';
  for (const [v, label] of entries) { const o = document.createElement('option'); o.value = v; o.textContent = label; el.appendChild(o); }
}
options($('diff'), DIFFS);
options($('roomDiff'), DIFFS);
const upd = (k, v) => { cfg = sanitize({ ...cfg, [k]: k === 'qualifying' ? v === 'true' : v }); sync(true); };
$('laps').addEventListener('input', (e) => upd('laps', e.target.value));
for (const key of ['qualifying', 'carMode', 'diff']) $(key).addEventListener('change', (e) => upd(key, e.target.value));
$('ai').addEventListener('input', (e) => upd('ai', e.target.value));
$('startPosition').addEventListener('input', (e) => upd('startPosition', e.target.value));
function sync(save) {
  cfg.startPosition = Math.min(cfg.startPosition, cfg.ai + 1);
  $('qualifying').value = String(cfg.qualifying); $('carMode').value = cfg.carMode;
  $('laps').value = String(cfg.laps); $('lapsValue').value = String(cfg.laps); $('lapsValue').textContent = String(cfg.laps); $('diff').value = cfg.diff;
  $('ai').value = String(cfg.ai); $('aiValue').value = String(cfg.ai); $('aiValue').textContent = String(cfg.ai);
  $('startPosition').max = String(cfg.ai + 1); $('startPosition').value = String(cfg.startPosition);
  $('startPositionValue').value = cfg.startPosition === 0 ? (cfg.ai === 0 ? 'Seul en piste' : 'Milieu de grille') : 'Position ' + cfg.startPosition;
  $('startPositionValue').textContent = $('startPositionValue').value;
  $('startPositionMax').textContent = String(cfg.ai + 1);
  $('startField').style.display = cfg.qualifying ? 'none' : '';
  $('sumC').textContent = byId(circuitList(), cfg.circuit).name; $('sumV').textContent = carName(cfg.car);
  if (save === true) saveSaved(cfg);
}
function launchClm(over = {}) { try { localStorage.removeItem('3d-racing-live-v1'); } catch (e) { /* stockage indisponible */ } startSession(sanitize({ ...cfg, ...over, mode: 'clm', ai: 0, qualifying: false, startPosition: 0, carMode: 'same', gridOrder: null })); location.href = 'game.html'; }
function launch() { cfg.gridOrder = null; saveSaved(cfg); try { localStorage.removeItem('3d-racing-live-v1'); } catch (e) { /* stockage indisponible */ } startSession(cfg); location.href = 'game.html'; }
$('launch').addEventListener('click', launch);
addEventListener('keydown', (e) => {
  if ((e.key === 'Escape' || e.key === 'Backspace') && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); back(); }
  else if (e.key === 'Enter' && cur() === 'race' && e.target.tagName !== 'BUTTON') launch();
});
// ── Conception de voiture : création / édition (stockée dans localStorage), test sur le circuit choisi (contre la montre).
const MAX_CUSTOM = 12;
const carName = (id) => (CAR_LIST.find((c) => c.id === id) || loadCustom().find((c) => c.id === id) || CAR_LIST[0]).name;
const newDef = () => ({ id: 'c_' + Date.now().toString(36), name: 'Ma voiture', kind: 'gt', color: '#e5352b', accent: '#f5f5f5', vmax: 300, ch: 600, mass: 1250, grip: 1.5, aero: 1.1, bal: .5 });
const dzEl = {};
for (const [k, label, mn, mx, st, u] of SPEC) {
  const d = document.createElement('div'); d.className = 'lbl';
  d.innerHTML = '<span class="setting-label"><span></span><output></output></span><input type="range">';
  d.querySelector('span span').textContent = label;
  const i = d.querySelector('input'); i.min = mn; i.max = mx; i.step = st;
  dzEl[k] = { i, o: d.querySelector('output'), u, mn, mx }; $(SPEC.findIndex((q) => q[0] === k) < 3 ? 'dzSliders' : 'dzSliders2').appendChild(d);
}
for (const [k, n] of KIND_LIST) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.k = k; b.textContent = n; b.addEventListener('click', () => { if (dz) { dz.kind = k; dzDraw(); } }); $('dzKind').appendChild(b); }
const fillCirc = (el) => { el.textContent = ''; for (const c of circuitList()) el.add(new Option(c.name, c.id)); };
function dzRead() { dz.name = $('dzName').value; dz.color = $('dzColor').value; dz.accent = $('dzAccent').value; for (const k in dzEl) dz[k] = parseFloat(dzEl[k].i.value); }
function dzDraw() {
  const S = customSheet(dz), x = $('dzCanvas').getContext('2d'); x.clearRect(0, 0, 300, 220); carPreview(x, { sheet: S });
  for (const k in dzEl) { const e = dzEl[k]; e.o.textContent = k === 'bal' ? Math.round(dz[k] * 100) + ' %' : dz[k] + e.u; e.i.style.setProperty('--p', (dz[k] - e.mn) / (e.mx - e.mn) * 100 + '%'); }
  for (const b of $('dzKind').children) b.classList.toggle('on', b.dataset.k === dz.kind);
  const b = $('dzStats'); b.textContent = '';
  for (const [k, v] of statsOf(S)) { const d = document.createElement('div'); d.innerHTML = '<span></span><b></b>'; d.firstChild.textContent = k; d.lastChild.textContent = v; b.appendChild(d); }
}
function fillDz() {
  $('dzName').value = dz.name; $('dzColor').value = dz.color; $('dzAccent').value = dz.accent;
  for (const k in dzEl) dzEl[k].i.value = dz[k];
  fillCirc($('dzCircuit')); $('dzCircuit').value = cfg.circuit; $('dzDel').hidden = !loadCustom().some((c) => c.id === dz.id); dzDraw();
}
const openDz = (d, from) => { dzFrom = from; dz = { ...newDef(), ...d }; fillDz(); location.hash = 'designer'; };
function dzSave() {
  dzRead(); dz.name = dz.name.trim().slice(0, 16) || 'Ma voiture';
  const l = loadCustom(), i = l.findIndex((c) => c.id === dz.id);
  if (i < 0 && l.length >= MAX_CUSTOM) { alert('Maximum ' + MAX_CUSTOM + ' voitures.'); return false; }
  const d = { ...dz }; if (i < 0) l.push(d); else l[i] = d;
  saveCustom(l); registerCustom(d); return true;
}
$('designer').addEventListener('input', () => { if (dz) { dzRead(); dzDraw(); } });
$('dzSave').addEventListener('click', () => { if (dzSave()) { mine = true; location.replace('#cars'); } });
$('dzTest').addEventListener('click', () => { if (dzSave()) launchClm({ circuit: $('dzCircuit').value, car: dz.id }); });
$('dzDel').addEventListener('click', () => {
  saveCustom(loadCustom().filter((c) => c.id !== dz.id)); delete CARS[dz.id];
  if (cfg.car === dz.id) { cfg.car = 'serra_gt'; saveSaved(cfg); }
  mine = true; location.replace('#cars');
});
$('newCar').addEventListener('click', () => openDz(null, 'cars'));
$('btnDesign').addEventListener('click', () => openDz(null, 'home'));
$('tabStock').addEventListener('click', () => { mine = false; show(); });
$('tabMine').addEventListener('click', () => { mine = true; show(); });
function renderMine() {
  const el = $('mgrid'), l = loadCustom(); el.textContent = '';
  if (!l.length) { const p = document.createElement('p'); p.className = 'multi-intro'; p.style.gridColumn = '1/-1'; p.textContent = 'Aucune voiture créée pour le moment.'; el.appendChild(p); return; }
  for (const d of l) {
    const w = document.createElement('div'); w.className = 'mcell';
    w.appendChild(cardEl(d, (x, c) => carPreview(x, { sheet: CARS[c.id] }), (c) => statsOf(CARS[c.id]), pickCar));
    const e = document.createElement('button'); e.type = 'button'; e.className = 'bk'; e.textContent = '✎ Modifier'; e.addEventListener('click', () => openDz(d, 'cars'));
    w.appendChild(e); el.appendChild(w);
  }
}
// ── Conception de circuit : l'éditeur (core/track-editor.js) dessine sur #tkCanvas ; ici : champs, validation, enregistrement, essai (contre la montre).
const MAX_TRACKS = 12;
for (const [k, n] of THEMES) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.k = k; b.textContent = n; b.addEventListener('click', () => { if (TK) { TK.def.theme = k; TK.refresh(); } }); $('tkTheme').appendChild(b); }
const setP = (el) => el.style.setProperty('--p', (el.value - el.min) / (el.max - el.min) * 100 + '%');
function tkUi(A, S, sel) {
  const c = $('tkChk'); c.textContent = '';
  for (const [ok, t] of A.ck) { const d = document.createElement('div'); d.className = ok ? 'ok' : 'ko'; d.textContent = (ok ? '✔ ' : '✘ ') + t; c.appendChild(d); }
  const b = $('tkStats'); b.textContent = '';
  if (A.t) { const st = stats(A.t); for (const [k, v] of [['Longueur', (st.length / 1000).toFixed(2).replace('.', ',') + ' km'], ['Virages', st.turns], ['Dénivelé', Math.round(st.climb) + ' m'], ['Points', S.pts.length]]) { const d = document.createElement('div'); d.innerHTML = '<span></span><b></b>'; d.firstChild.textContent = k; d.lastChild.textContent = v; b.appendChild(d); } }
  $('tkStart').max = Math.floor(A.t ? A.t.length : 1000); $('tkStart').value = S.start; $('tkStartV').textContent = Math.round(S.start) + ' m'; setP($('tkStart'));
  $('tkAlt').disabled = sel < 0; $('tkAltV').textContent = sel < 0 ? '–' : S.elev[sel] + ' m'; if (sel >= 0) $('tkAlt').value = S.elev[sel]; setP($('tkAlt'));
  $('tkSave').disabled = $('tkTest').disabled = A.err.length > 0; $('tkDelPt').disabled = sel < 0;
  for (const x of $('tkTheme').children) x.classList.toggle('on', x.dataset.k === S.theme);
}
function tkOpen(d) {
  if (!TK) TK = createTrackEditor($('tkCanvas'), $('tkProf'), tkUi);
  TK.load(d || stadium()); $('tkName').value = TK.def.name;
  const el = $('tkCar'); el.textContent = ''; for (const c of ALLCARS()) el.add(new Option(c.name, c.id)); el.value = cfg.car;
  $('tkDel').hidden = !loadTracks().some((c) => c.id === TK.def.id);
}
const openTk = (d, from) => { tkFrom = from; tkPending = d; tkLoaded = false; location.hash = 'tdesigner'; if (cur() === 'tdesigner') show(); };
function tkSave() {
  if (!TK || !$('tkSave') || $('tkSave').disabled) return null;
  const S = TK.def, l = loadTracks(); S.name = S.name.trim().slice(0, 24) || 'Mon circuit'; S.id = S.id || 'c-' + Date.now().toString(36);
  const i = l.findIndex((t) => t.id === S.id); if (i < 0 && l.length >= MAX_TRACKS) { alert('Maximum ' + MAX_TRACKS + ' circuits.'); return null; }
  const o = { id: S.id, name: S.name, start: Math.round(S.start), pts: S.pts.map((p) => [...p]), elev: S.elev.slice(), theme: S.theme }; i < 0 ? l.push(o) : (l[i] = o); saveTracks(l); return o;
}
$('tkName').addEventListener('input', (e) => { if (TK) TK.def.name = e.target.value; });
$('tkStart').addEventListener('input', (e) => TK.setStart(+e.target.value));
$('tkAlt').addEventListener('input', (e) => TK.setAlt(+e.target.value));
$('tkZi').addEventListener('click', () => TK.zoom(1.3)); $('tkZo').addEventListener('click', () => TK.zoom(1 / 1.3)); $('tkFit').addEventListener('click', () => TK.fit()); $('tkDelPt').addEventListener('click', () => TK.del());
$('tkSave').addEventListener('click', () => { if (tkSave()) { mineT = true; location.replace('#circuits'); } });
$('tkTest').addEventListener('click', () => { const o = tkSave(); if (o) launchClm({ circuit: o.id, car: $('tkCar').value }); });
$('tkDel').addEventListener('click', () => {
  const id = TK.def.id; saveTracks(loadTracks().filter((c) => c.id !== id));
  if (cfg.circuit === id) { cfg.circuit = 'serra-nova'; saveSaved(cfg); }
  mineT = true; location.replace('#circuits');
});
$('newTrack').addEventListener('click', () => openTk(null, 'circuits'));
$('btnTrack').addEventListener('click', () => openTk(null, 'home'));
$('tabCStock').addEventListener('click', () => { mineT = false; show(); });
$('tabCMine').addEventListener('click', () => { mineT = true; show(); });
function renderMineT() {
  const el = $('tgrid'), l = loadTracks(); el.textContent = '';
  if (!l.length) { const p = document.createElement('p'); p.className = 'multi-intro'; p.style.gridColumn = '1/-1'; p.textContent = 'Aucun circuit créé pour le moment.'; el.appendChild(p); return; }
  for (const d of l) {
    const w = document.createElement('div'); w.className = 'mcell';
    w.appendChild(cardEl({ id: d.id, name: d.name }, cPrev, cStats, cPick));
    const e = document.createElement('button'); e.type = 'button'; e.className = 'bk'; e.textContent = '✎ Modifier'; e.addEventListener('click', () => openTk(d, 'circuits'));
    w.appendChild(e); el.appendChild(w);
  }
}
sync(false); show();

// ── Multijoueur : l'hôte configure uniquement les qualifications et le nombre d'IA.
let activeRoom = null, roomData = null, stopRoomWatch = null, roomBusy = false;
const roomStatus = (s) => { const el = $('multiStatus'); if (el) el.textContent = s || ''; };
const playerName = () => {
  const n = $('multiName').value.trim().slice(0, 16);
  if (!n) { roomStatus('Entre un pseudo.'); $('multiName').focus(); return null; }
  try { localStorage.setItem('mg_display_name', n); localStorage.setItem('mg_player_name', n); } catch { /* stockage indisponible */ }
  return n;
};
try {
  $('multiName').value = localStorage.getItem('mg_display_name')
    || localStorage.getItem('mg_player_name')
    || localStorage.getItem('3d-racing-name') || '';
} catch { /* stockage indisponible */ }
$('multiName').addEventListener('input', () => {
  const n = $('multiName').value.trim().slice(0, 16);
  try { if (n) { localStorage.setItem('mg_display_name', n); localStorage.setItem('mg_player_name', n); } } catch { /* ignore */ }
});

$('copyRoomCode')?.addEventListener('click', async () => {
  const code = activeRoom || $('roomCodeLabel')?.textContent;
  if (!code || code === '------') return;
  const btn = $('copyRoomCode');
  try {
    await navigator.clipboard.writeText(code);
    btn.textContent = '✓ Copié !';
    setTimeout(() => { btn.textContent = '📋 Copier'; }, 2000);
  } catch {
    const ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    btn.textContent = '✓ Copié !';
    setTimeout(() => { btn.textContent = '📋 Copier'; }, 2000);
  }
});

function fitRoomRanges() {
  const count = Object.keys(roomData?.players || {}).length || 1, maxAi = Math.max(0, 20 - count);
  const aiEl = $('roomAi');
  if (aiEl) {
    aiEl.max = String(maxAi);
    if (+aiEl.value > maxAi) aiEl.value = String(maxAi);
    $('roomAiValue').textContent = aiEl.value;
  }
}

function renderRoom(d) {
  roomData = d;
  if (!d) { $('roomOverlay').hidden = true; return; }
  const session = Net.readSession(), host = d.leaderId === session?.uid, players = Object.entries(d.players || {});
  $('roomCodeLabel').textContent = d.code || activeRoom;
  $('roomNote').textContent = host ? 'Tu choisis les qualifications, les tours, la difficulté et les IA en plus.' : 'En attente que le créateur lance la course…';
  $('hostSettings').hidden = !host;
  $('guestWaiting').hidden = host;
  const dc = d.config || cfg;
  $('roomQualifying').value = String(!!dc.qualifying);
  $('roomAi').value = String(dc.ai || 0);
  $('roomLaps').value = String(dc.laps || 3); $('roomLapsValue').textContent = $('roomLaps').value; $('roomDiff').value = dc.diff || 'normal';
  fitRoomRanges();
  $('roomPlayers').textContent = '';
  for (const [uid, p] of players) {
    const row = document.createElement('div');
    row.className = 'room-player';
    row.innerHTML = '<b></b><span></span>';
    row.firstChild.textContent = p.name || 'Pilote';
    const carName = CAR_LIST.find((c) => c.id === p.car)?.name || p.car || '';
    row.lastChild.textContent = (uid === d.leaderId ? '👑 Créateur · ' : '') + carName;
    $('roomPlayers').appendChild(row);
  }
  $('startRoom').hidden = !host;
  $('startRoom').disabled = players.length < 1 || players.length + (+$('roomAi').value || 0) > 20;
  if (d.state === 'playing') beginMultiplayer(d);
}

function enterRoom(code, d) {
  activeRoom = code; $('roomOverlay').hidden = false; if (stopRoomWatch) stopRoomWatch(); stopRoomWatch = Net.watch(code, renderRoom); renderRoom(d);
}

function beginMultiplayer(d) {
  const session = Net.readSession(), p = d.players?.[session?.uid];
  if (!session || !p || session.going) return;
  session.going = true; session.hostId = d.leaderId; session.players = d.players; session.code = d.code; Net.saveSession(session);
  const rc = sanitize({ ...d.config, car: p.car || d.config.car }); startSession(rc); location.href = 'game.html';
}

$('roomQualifying')?.addEventListener('change', async () => {
  if (!activeRoom || roomData?.leaderId !== Net.N.uid) return;
  await Net.update(activeRoom, { 'config/qualifying': $('roomQualifying').value === 'true' });
});

$('roomLaps')?.addEventListener('input', () => { $('roomLapsValue').textContent = $('roomLaps').value; });

$('roomAi')?.addEventListener('input', async () => {
  fitRoomRanges();
  if (!activeRoom || roomData?.leaderId !== Net.N.uid) return;
  await Net.update(activeRoom, { 'config/ai': +$('roomAi').value });
});

for (const [id, key] of [['roomLaps', 'laps'], ['roomDiff', 'diff']]) $(id)?.addEventListener('change', async () => {
  if (!activeRoom || roomData?.leaderId !== Net.N.uid) return;
  await Net.update(activeRoom, { ['config/' + key]: key === 'laps' ? +$(id).value : $(id).value });
});

$('createRoom').addEventListener('click', async () => {
  if (roomBusy) return; const name = playerName(); if (!name) return; roomBusy = true; roomStatus('Connexion…');
  try {
    if (!(await Net.init())) throw new Error('offline');
    let made = null; const initial = sanitize({ ...cfg, circuit: cfg.circuit, car: cfg.car, carMode: 'mixed', ai: 0, qualifying: false, laps: cfg.laps || 3, diff: cfg.diff });
    for (let i = 0; i < 4 && !made; i++) {
      const c = Net.code();
      const ok = await Net.createRoom(c, {
        code: c, state: 'waiting', leaderId: Net.N.uid, createdAt: Net.now(), maxHumans: 20, numPlayers: 20, config: initial,
        players: { [Net.N.uid]: { uid: Net.N.uid, name, score: 0, car: cfg.car, joined: Net.now(), lastSeen: Net.now(), away: false } }
      });
      if (ok) made = c;
    }
    if (!made) throw new Error('room');
    Net.saveSession({ code: made, uid: Net.N.uid, going: false });
    roomStatus('');
    enterRoom(made, await Net.getRoom(made));
  } catch { roomStatus('Multijoueur indisponible. Vérifie la connexion.'); } finally { roomBusy = false; }
});

$('joinRoom').addEventListener('click', async () => {
  if (roomBusy) return; const name = playerName(), code = $('roomCode').value.trim().toUpperCase();
  if (!name || code.length !== 6) { roomStatus('Entre un code de room valide.'); return; }
  roomBusy = true; roomStatus('Recherche…');
  try {
    if (!(await Net.init())) throw new Error('offline');
    const d = await Net.getRoom(code);
    if (!d || d.state !== 'waiting') throw new Error('missing');
    if (d.players?.[Net.N.uid]) { Net.saveSession({ code, uid: Net.N.uid, going: false }); enterRoom(code, d); return; }
    if (Object.keys(d.players || {}).length >= (d.maxHumans || 20)) throw new Error('full');
    const r = await Net.join(code, { name, score: 0, car: cfg.car, joined: Net.now(), lastSeen: Net.now(), away: false });
    if (r !== true) throw new Error('join');
    Net.saveSession({ code, uid: Net.N.uid, going: false });
    roomStatus('');
    enterRoom(code, await Net.getRoom(code));
  } catch (e) { roomStatus(e.message === 'full' ? 'Cette room est complète.' : 'Room introuvable ou déjà lancée.'); } finally { roomBusy = false; }
});

$('startRoom').addEventListener('click', async () => {
  if (!activeRoom || roomData?.leaderId !== Net.N.uid) return;
  const players = Object.keys(roomData.players || {}).length, aiCount = +$('roomAi').value || 0;
  if (players < 1 || players + aiCount > 20) return;
  const qual = $('roomQualifying').value === 'true';
  const nextConfig = sanitize({ ...roomData.config, ai: aiCount, qualifying: qual, laps: +$('roomLaps').value || 3, diff: $('roomDiff').value });
  await Net.update(activeRoom, { config: nextConfig, state: 'playing', startedAt: Net.now(), runtime: { tick: 0, stamp: Net.now() } });
});

$('leaveRoom').addEventListener('click', async () => {
  if (activeRoom) await Net.leave(activeRoom, roomData?.state === 'playing');
  if (stopRoomWatch) stopRoomWatch();
  activeRoom = null;
  $('roomOverlay').hidden = true;
});

// Retour dans le lobby après un rechargement avant le départ.
(async () => {
  const saved = Net.readSession();
  if (!saved?.code || saved.going || !(await Net.init())) return;
  const d = await Net.getRoom(saved.code);
  if (d?.state === 'waiting' && d.players?.[Net.N.uid]) enterRoom(saved.code, d);
})();

// --- Règles : onglets
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rl]'); if (!b) return;
  document.querySelectorAll('[data-rl]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
  document.querySelectorAll('.rpage').forEach((p) => p.classList.toggle('on', p.dataset.p === b.dataset.rl));
});
