import { CIRCUITS, circuitList, loadTracks, saveTracks, CAR_LIST, DIFFS, loadSaved, loadRec, loadClm, saveSaved, sanitize, startSession, loadCustom, saveCustom, loadMpCars, saveMpCars, loadMpTracks, saveMpTracks } from './core/config.js';
import { trackOf, buildTrack } from './core/track.js';
import { drawTrack, startMark, stats } from './core/map.js';
import { CARS } from './core/physics.js';
import { look, customSheet, registerCustom, KIND_LIST, SPEC, getSpecRange } from './core/sheets.js';
import { createTrackEditor, THEMES, stadium } from './core/track-editor.js';
import * as Net from './net.js';
import { listPublished, loadPublishedTrack, loadPublishedCar, publishItem, unpublishItem } from './core/publish.js';
import { notify } from './ui/notify.js';

const $ = (id) => document.getElementById(id);
let cfg = loadSaved();
let gameMode = sessionStorage.getItem('little-turismo-mode') || 'solo';
let multiCreatePending = false, roomCreateToken = 0, roomCreationInFlight = false, roomJoinToken = 0;
$('btnSolo')?.addEventListener('click', () => { gameMode = 'solo'; sessionStorage.setItem('little-turismo-mode', 'solo'); });
$('btnClm')?.addEventListener('click', () => { gameMode = 'clm'; sessionStorage.setItem('little-turismo-mode', 'clm'); });
$('btnMulti')?.addEventListener('click', () => { gameMode = 'multi'; sessionStorage.setItem('little-turismo-mode', 'multi'); });
const PARENT = { home: null, circuits: 'home', cars: 'circuits', race: 'cars', rules: 'home', records: 'home', designer: 'cars', tdesigner: 'circuits' };
let dzFrom = 'cars', dz = null, mine = false, tkFrom = 'circuits', tkPending = null, tkLoaded = false, mineT = false, TK = null;
let carTab = 'stock', trackTab = 'stock', pubCars = [], pubTracks = [], pubCarCursor = null, pubTrackCursor = null; const pubSeen = { car: new Set(), track: new Set() }, pubBusy = new Set(), pubLoading = new Set();
const pubPreviewCache = new Map(), pubPreviewQueue = [], pubDataPending = new Map(), pubDataQueue = []; let pubPreviewActive = 0, pubDataActive = 0; const PUB_PREVIEW_CACHE_MAX = 40; const pubCountToken = { car: 0, track: 0 };
const pubPreviewObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) { pubPreviewObserver.unobserve(e.target); queuePubPreview(e.target) } }, { rootMargin: '140px' }) : null;
const cur = () => { const h = location.hash.slice(1); return h in PARENT ? h : 'home'; };
const f3 = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); };
const byId = (list, id) => list.find((x) => x.id === id) || list[0];
// entrée choisie : bordure d'accent sur la carte (circuits, voitures)
const markCards = (el, id) => { for (const b of el.querySelectorAll('.gcard')) { const on = b.dataset.id === id; b.style.borderColor = on ? 'var(--acc)' : ''; b.style.boxShadow = on ? '0 0 0 2px var(--acc)' : ''; b.setAttribute('aria-pressed', on); } };
function show() {
  const id = cur();
  if (id !== 'circuits') multiCreatePending = false;
  document.querySelectorAll('.scr').forEach((s) => s.classList.toggle('on', s.id === id));
  $('hm').hidden = id === 'home';
  scrollTo(0, 0);
  if (id === 'circuits') {
    $('cgrid').hidden = trackTab !== 'stock'; $('tmine').hidden = trackTab !== 'mine'; $('tpub').hidden = trackTab !== 'published';['tabCStock', 'tabCMine', 'tabCPub'].forEach((x, i) => { const on = ['stock', 'mine', 'published'][i] === trackTab; $(x).classList.toggle('on', on); $(x).setAttribute('aria-selected', String(on)); });
    renderMineT(); $('cntCStock').textContent = CIRCUITS.length; $('cntCMine').textContent = loadTracks().length; refreshPublishedCount('track'); markCards($('cgrid'), cfg.circuit); markCards($('tgrid'), cfg.circuit);
  }
  if (id !== 'tdesigner') tkLoaded = false; else if (!tkLoaded) { tkLoaded = true; tkOpen(tkPending); tkPending = null; }
  if (id !== 'designer') dz = null; else if (!dz) { dz = newDef(); fillDz(); }
  if (id === 'cars') {
    $('vgrid').hidden = carTab !== 'stock'; $('mine').hidden = carTab !== 'mine'; $('vpub').hidden = carTab !== 'published';['tabStock', 'tabMine', 'tabPub'].forEach((x, i) => { const on = ['stock', 'mine', 'published'][i] === carTab; $(x).classList.toggle('on', on); $(x).setAttribute('aria-selected', String(on)); });
    renderMine(); $('cntStock').textContent = CAR_LIST.length; $('cntMine').textContent = loadCustom().length; refreshPublishedCount('car'); markCards($('vgrid'), cfg.car); markCards($('mgrid'), cfg.car);
  }
  if (id === 'race') {
    const isMulti = gameMode === 'multi';
    if ($('soloConfig')) $('soloConfig').hidden = isMulti;
    if ($('multiConfig')) $('multiConfig').hidden = !isMulti;
    if ($('raceScreenTitle')) $('raceScreenTitle').textContent = isMulti ? 'Multijoueur' : 'Course';
    $('sumC').parentElement.hidden = isMulti;
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
const MP_PARENT = { cars: 'home', circuits: 'race', race: 'cars' };
const back = () => { const from = cur(), p = from === 'designer' ? dzFrom : from === 'tdesigner' ? tkFrom : (gameMode === 'multi' && MP_PARENT[from]) || PARENT[from]; if (from === 'circuits' && gameMode === 'multi') multiCreatePending = false; if (from === 'race') { if (roomCreationInFlight) roomCreateToken++; if (roomBusy) roomJoinToken++; } if (p) location.replace('#' + p); };
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
const cPick = (c) => { cfg.circuit = c.id; saveSaved(cfg); if (gameMode === 'multi') { const create = multiCreatePending; multiCreatePending = false; location.replace('#race'); return create ? makeRoom() : undefined; } location.hash = 'cars'; };
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
  } else if (k === 'drag') {
    wh([[96, -26, 22, 10], [96, 26, 22, 10], [-65, -46, 52, 28], [-65, 46, 52, 28]]);
    x.strokeStyle = D; x.lineWidth = 3; x.beginPath(); x.moveTo(-90, -12); x.lineTo(-124, -8); x.moveTo(-90, 12); x.lineTo(-124, 8); x.stroke();
    x.fillStyle = '#ee3322'; rr(x, -127, -10, 5, 4, 1); rr(x, -127, 6, 5, 4, 1);
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(116, 0); x.lineTo(95, -12); x.lineTo(-38, -16); x.lineTo(-65, -28); x.lineTo(-94, -28); x.lineTo(-98, -20);
    x.lineTo(-98, 20); x.lineTo(-94, 28); x.lineTo(-65, 28); x.lineTo(-38, 16); x.lineTo(95, 12); x.closePath();
    x.fill();
    x.fillStyle = ac; x.fillRect(-35, -4, 138, 8);
    x.fillStyle = G; rr(x, -38, -11, 36, 22, 6); x.fillStyle = col; rr(x, -28, -7, 20, 14, 3);
    x.fillStyle = D; rr(x, 2, -14, 28, 28, 4);
    x.fillStyle = '#ee2211'; rr(x, 14, -8, 14, 16, 2);
    x.fillStyle = '#ff7722'; for (let i = 0; i < 4; i++) { x.fillRect(4 + i * 5, -17, 3, 3); x.fillRect(4 + i * 5, 14, 3, 3); }
    x.fillStyle = D; rr(x, 100, -28, 8, 56, 2);
    x.fillStyle = D; rr(x, -88, -48, 24, 96, 3);
    x.fillStyle = col; rr(x, -86, -46, 20, 92, 2);
    x.fillStyle = ac; rr(x, -92, -49, 30, 4, 2); rr(x, -92, 45, 30, 4, 2); rr(x, -82, -2, 22, 4, 1);
  } else if (k === 'thrust') {
    // ThrustSSC : double réacteurs Spey latéraux, fuselage aiguille, roues pleines alu, grand empennage arrière
    wh([[44, -46, 26, 11], [44, 46, 26, 11], [-84, -14, 26, 11], [-84, 14, 26, 11]]);
    x.fillStyle = '#dde3ea';
    rr(x, 32, -50, 24, 8, 2); rr(x, 32, 42, 24, 8, 2); rr(x, -96, -17, 24, 6, 2); rr(x, -96, 11, 24, 6, 2);
    // Fuselage aiguille central
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(135, 0); x.lineTo(95, -10); x.lineTo(-105, -16); x.lineTo(-120, -12);
    x.lineTo(-120, 12); x.lineTo(-105, 16); x.lineTo(95, 10); x.closePath();
    x.fill();
    // Sonde pitot supersonique
    x.fillStyle = '#cfd4dc'; x.fillRect(135, -2, 22, 4);
    // Double turboréacteurs Rolls-Royce Spey
    for (const dy of [-38, 38]) {
      x.fillStyle = col; rr(x, -95, dy - 14, 168, 28, 8);
      x.fillStyle = '#b0b8c4'; rr(x, 68, dy - 13, 8, 26, 3);
      x.fillStyle = D; rr(x, 60, dy - 11, 8, 22, 2);
      x.fillStyle = '#282c34'; rr(x, -108, dy - 12, 14, 24, 2);
      x.fillStyle = '#ff5511'; rr(x, -114, dy - 9, 7, 18, 2);
      x.fillStyle = '#ffee44'; rr(x, -112, dy - 5, 4, 10, 1);
    }
    // Cockpit
    x.fillStyle = G; rr(x, 0, -8, 42, 16, 5); x.fillStyle = col; rr(x, 10, -5, 22, 10, 3);
    // Bande de fuselage
    x.fillStyle = ac; x.fillRect(-85, -3, 175, 6);
    // Empennage vertical arrière
    x.fillStyle = D; rr(x, -118, -4, 45, 8, 2); x.fillStyle = col; rr(x, -114, -2, 38, 4, 1);
    // Parachutes
    x.fillStyle = '#ee3322'; rr(x, -122, -6, 4, 4, 1); rr(x, -122, 2, 4, 4, 1);
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
const CAR_MODES = [['same', 'Toutes identiques à ma voiture'], ['mixed', 'Voitures variées']];
options($('diff'), DIFFS);
// Solo et multijoueur partagent exactement les mêmes valeurs et libellés.
const fillCarMode = (el) => options(el, CAR_MODES);
fillCarMode($('carMode'));
fillCarMode($('roomCarMode'));
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
function launchClm(over = {}) { try { sessionStorage.setItem('little-turismo-loading', '1'); } catch (e) {} try { localStorage.removeItem('little-turismo-live-v1'); } catch (e) { /* stockage indisponible */ } startSession(sanitize({ ...cfg, ...over, mode: 'clm', ai: 0, qualifying: false, startPosition: 0, carMode: 'same', gridOrder: null })); location.href = 'game.html'; }
function launch() { try { sessionStorage.setItem('little-turismo-loading', '1'); } catch (e) {} cfg.gridOrder = null; saveSaved(cfg); try { localStorage.removeItem('little-turismo-live-v1'); } catch (e) { /* stockage indisponible */ } startSession(cfg); location.href = 'game.html'; }
$('launch').addEventListener('click', launch);
addEventListener('keydown', (e) => {
  if ((e.key === 'Escape' || e.key === 'Backspace') && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); back(); }
  else if (e.key === 'Enter' && cur() === 'race' && e.target.tagName !== 'BUTTON') launch();
});
// ── Conception de voiture : création / édition (stockée dans localStorage), test sur le circuit choisi (contre la montre).
const MAX_CUSTOM = 12;
const carName = (id) => (CAR_LIST.find((c) => c.id === id) || loadCustom().find((c) => c.id === id) || CAR_LIST[0]).name;
const newDef = () => ({ id: 'c_' + Date.now().toString(36), name: 'Ma voiture', kind: 'gt', color: '#e5352b', accent: '#f5f5f5', vmax: 280, ch: 500, mass: 1250, grip: 1.5, aero: 1.1, bal: .5 });
const dzEl = {};
for (const [k, label, mn, mx, st, u] of SPEC) {
  const d = document.createElement('div'); d.className = 'lbl';
  d.innerHTML = '<span class="setting-label"><span></span><output></output></span><input type="range">';
  d.querySelector('span span').textContent = label;
  const i = d.querySelector('input'); i.min = mn; i.max = mx; i.step = st;
  dzEl[k] = { i, o: d.querySelector('output'), u, mn, mx }; $(SPEC.findIndex((q) => q[0] === k) < 3 ? 'dzSliders' : 'dzSliders2').appendChild(d);
}
function dzUpdateRanges() {
  if (!dz) return;
  const kind = dz.kind || 'gt';
  for (const k in dzEl) {
    const [mn, mx, st] = getSpecRange(kind, k);
    const e = dzEl[k];
    e.mn = mn; e.mx = mx;
    e.i.min = mn; e.i.max = mx; e.i.step = st;
    dz[k] = Math.max(mn, Math.min(mx, Number.isFinite(dz[k]) ? dz[k] : mn));
    e.i.value = dz[k];
  }
}
for (const [k, n] of KIND_LIST) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.k = k; b.textContent = n;
  b.addEventListener('click', () => { if (dz) { dz.kind = k; dzUpdateRanges(); dzDraw(); } });
  $('dzKind').appendChild(b);
}
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
  dzUpdateRanges();
  fillCirc($('dzCircuit')); $('dzCircuit').value = cfg.circuit; $('dzDel').hidden = !loadCustom().some((c) => c.id === dz.id); dzDraw();
}
const openDz = (d, from) => { dzFrom = from; dz = { ...newDef(), ...d }; fillDz(); location.hash = 'designer'; };
function dzSave() {
  dzRead(); dz.name = dz.name.trim().slice(0, 16) || 'Ma voiture';
  const l = loadCustom(), i = l.findIndex((c) => c.id === dz.id);
  if (i < 0 && l.length >= MAX_CUSTOM) { notify.show({ type: 'error', title: 'Limite atteinte', message: 'Maximum ' + MAX_CUSTOM + ' voitures.' }); return false; }
  const d = { ...dz }; if (i < 0) l.push(d); else { if (l[i].pubId) { d.pubId = l[i].pubId; d.pubOwner = l[i].pubOwner; d.published = true; } l[i] = d; }
  saveCustom(l); registerCustom(d); return true;
}
$('designer').addEventListener('input', () => { if (dz) { dzRead(); dzDraw(); } });
$('dzSave').addEventListener('click', () => { if (dzSave()) { mine = true; carTab = 'mine'; location.replace('#cars'); } });
$('dzTest').addEventListener('click', () => { if (dzSave()) launchClm({ circuit: $('dzCircuit').value, car: dz.id }); });
$('dzDel').addEventListener('click', async () => {
  const old = loadCustom().find(c => c.id === dz.id); if (old?.pubId) { if (!await notify.confirm({ title: 'Dépublier et supprimer', message: 'Cette voiture publiée sera retirée avant sa suppression. Continuer ?' })) return; try { await unpublishItem('car', old.pubId) } catch (e) { notify.show({ type: 'error', title: 'Dépublication impossible', message: publicationError(e) }); return } }
  saveCustom(loadCustom().filter((c) => c.id !== dz.id)); delete CARS[dz.id];
  if (cfg.car === dz.id) { cfg.car = 'serra_gt'; saveSaved(cfg); }
  mine = true; carTab = 'mine'; location.replace('#cars');
});
$('newCar').addEventListener('click', () => openDz(null, 'cars'));
$('btnDesign').addEventListener('click', () => openDz(null, 'home'));
$('tabStock').addEventListener('click', () => { carTab = 'stock'; mine = false; show(); });
$('tabMine').addEventListener('click', () => { carTab = 'mine'; mine = true; show(); });
$('tabPub').addEventListener('click', () => { carTab = 'published'; show(); loadPublishedCards('car', true) }); $('moreCars').addEventListener('click', () => loadPublishedCards('car', false));
function renderMine() {
  const el = $('mgrid'), l = loadCustom(); el.textContent = '';
  if (!l.length) { const p = document.createElement('p'); p.className = 'multi-intro'; p.style.gridColumn = '1/-1'; p.textContent = 'Aucune voiture créée pour le moment.'; el.appendChild(p); return; }
  for (const d of l) {
    const w = document.createElement('div'); w.className = 'mcell';
    w.appendChild(cardEl(d, (x, c) => carPreview(x, { sheet: CARS[c.id] }), (c) => statsOf(CARS[c.id]), pickCar));
    const e = document.createElement('button'); e.type = 'button'; e.className = 'bk'; e.textContent = '✎ Modifier'; e.addEventListener('click', () => openDz(d, 'cars'));
    w.appendChild(e); w.appendChild(pubLocalControl('car', d)); el.appendChild(w);
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
  $('tkCorner').disabled = $('tkRadius').disabled = sel < 0; $('tkCorner').value = sel < 0 ? 'smooth' : (S.corners[sel]?.type || 'smooth'); $('tkRadius').value = sel < 0 ? 35 : (S.corners[sel]?.radius ?? 35); $('tkRadiusV').textContent = sel < 0 ? '–' : $('tkRadius').value + ' m'; setP($('tkRadius')); $('tkRadius').closest('.lbl').hidden = sel < 0 || $('tkCorner').value === 'smooth' || $('tkCorner').value === 'sharp';
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
  const i = l.findIndex((t) => t.id === S.id); if (i < 0 && l.length >= MAX_TRACKS) { notify.show({ type: 'error', title: 'Limite atteinte', message: 'Maximum ' + MAX_TRACKS + ' circuits.' }); return null; }
  const previous = l.find(t => t.id === S.id); const o = { ...(previous?.pubId ? { pubId: previous.pubId, pubOwner: previous.pubOwner, published: true } : {}), id: S.id, name: S.name, start: Math.round(S.start), pts: S.pts.map((p) => [...p]), elev: S.elev.slice(), theme: S.theme, corners: S.corners.map((c) => ({ type: c.type, radius: c.radius })) }; i < 0 ? l.push(o) : (l[i] = o); saveTracks(l); return o;
}
$('tkName').addEventListener('input', (e) => { if (TK) TK.def.name = e.target.value; });
$('tkStart').addEventListener('input', (e) => TK.setStart(+e.target.value));
$('tkAlt').addEventListener('input', (e) => TK.setAlt(+e.target.value));
$('tkCorner').addEventListener('change', (e) => { if (TK) TK.setCorner(e.target.value, +$('tkRadius').value); });
$('tkRadius').addEventListener('input', (e) => { $('tkRadiusV').textContent = e.target.value + ' m'; if (TK) TK.setCorner($('tkCorner').value, +e.target.value); });
$('tkZi').addEventListener('click', () => TK.zoom(1.3)); $('tkZo').addEventListener('click', () => TK.zoom(1 / 1.3)); $('tkFit').addEventListener('click', () => TK.fit()); $('tkDelPt').addEventListener('click', () => TK.del());
$('tkSave').addEventListener('click', () => { if (tkSave()) { mineT = true; trackTab = 'mine'; location.replace('#circuits'); } });
$('tkTest').addEventListener('click', () => { const o = tkSave(); if (o) launchClm({ circuit: o.id, car: $('tkCar').value }); });
$('tkDel').addEventListener('click', async () => {
  const id = TK.def.id, old = loadTracks().find(t => t.id === id); if (old?.pubId) { if (!await notify.confirm({ title: 'Dépublier et supprimer', message: 'Ce circuit publié sera retiré avant sa suppression. Continuer ?' })) return; try { await unpublishItem('track', old.pubId) } catch (e) { notify.show({ type: 'error', title: 'Dépublication impossible', message: publicationError(e) }); return } } saveTracks(loadTracks().filter((c) => c.id !== id));
  if (cfg.circuit === id) { cfg.circuit = 'serra-nova'; saveSaved(cfg); }
  mineT = true; trackTab = 'mine'; location.replace('#circuits');
});
$('newTrack').addEventListener('click', () => openTk(null, 'circuits'));
$('btnTrack').addEventListener('click', () => openTk(null, 'home'));
$('tabCStock').addEventListener('click', () => { trackTab = 'stock'; mineT = false; show(); });
$('tabCMine').addEventListener('click', () => { trackTab = 'mine'; mineT = true; show(); });
$('tabCPub').addEventListener('click', () => { trackTab = 'published'; show(); loadPublishedCards('track', true) }); $('moreTracks').addEventListener('click', () => loadPublishedCards('track', false));
function renderMineT() {
  const el = $('tgrid'), l = loadTracks(); el.textContent = '';
  if (!l.length) { const p = document.createElement('p'); p.className = 'multi-intro'; p.style.gridColumn = '1/-1'; p.textContent = 'Aucun circuit créé pour le moment.'; el.appendChild(p); return; }
  for (const d of l) {
    const w = document.createElement('div'); w.className = 'mcell';
    w.appendChild(cardEl({ id: d.id, name: d.name }, cPrev, cStats, cPick));
    const e = document.createElement('button'); e.type = 'button'; e.className = 'bk'; e.textContent = '✎ Modifier'; e.addEventListener('click', () => openTk(d, 'circuits'));
    w.appendChild(e); w.appendChild(pubLocalControl('track', d)); el.appendChild(w);
  }
}

function pubLocalControl(kind, d) { const b = document.createElement('button'); b.type = 'button'; b.className = 'bk'; const key = kind + ':' + d.id; const owner = Net.N.cfg?.auth?.currentUser?.uid; b.textContent = d.pubId ? (d.pubOwner === owner ? '↗ Publié · Dépublier' : '↗ Publié') : '🌐 Publier'; b.disabled = pubBusy.has(key); b.addEventListener('click', async () => { if (pubBusy.has(key)) return; pubBusy.add(key); b.disabled = true; try { await Net.publicationReady(); const uid = Net.N.cfg?.auth?.currentUser?.uid; if (d.pubId) { if (d.pubOwner !== uid) throw Error('Cette publication ne vous appartient pas.'); if (!await notify.confirm({ title: 'Dépublier', message: 'Retirer cette création de la liste publique ?' })) return; await unpublishItem(kind, d.pubId); delete d.pubId; delete d.pubOwner; delete d.published; saveLocal(kind, d); notify.show({ type: 'success', title: 'Dépublication effectuée', message: 'La création n’est plus visible publiquement.' }); } else { await publishItem(kind, d); d.pubOwner = uid; saveLocal(kind, d); notify.show({ type: 'success', title: 'Publication effectuée', message: 'Votre création est maintenant visible par les joueurs.' }); } show(); } catch (e) { notify.show({ type: 'error', title: 'Publication impossible', message: publicationError(e) }); } finally { pubBusy.delete(key); b.disabled = false } }); return b }
function saveLocal(k, d) { if (k === 'car') { const a = loadCustom(), i = a.findIndex(x => x.id === d.id); if (i >= 0) a[i] = d; saveCustom(a) } else { const a = loadTracks(), i = a.findIndex(x => x.id === d.id); if (i >= 0) a[i] = d; saveTracks(a) } }
function publicationError(e) { const m = String(e?.message || e || 'Erreur réseau'); if (/permission_denied|permission denied|PERMISSION_DENIED/i.test(m)) return 'Permission refusée par Firebase. Vérifiez les règles de publication et votre connexion.'; if (/60|minute|rate/i.test(m)) return '1 publication maximum par minute.'; if (/network|offline|connexion|unavailable/i.test(m)) return 'Connexion réseau indisponible. Réessayez lorsque vous serez en ligne.'; return m }
function localHas(k, id) { return (k === 'car' ? loadCustom() : loadTracks()).some(x => x.id === id) }
async function refreshPublishedCount(k) { const el = $(k === 'car' ? 'cntPub' : 'cntCPub'); if (!el) return; const token = ++pubCountToken[k], seen = new Set(); let before = null; try { while (true) { const items = await listPublished(k, { before, reset: before === null }); if (!items.length) break; for (const item of items) if (item?.id) seen.add(item.id); const next = items[items.length - 1]?.id; if (!next || next === before || items.length < 20) break; before = next; } if (pubCountToken[k] === token) el.textContent = String(seen.size) } catch (e) { if (pubCountToken[k] === token) el.textContent = '–' } }
async function loadPublishedCards(k, reset) { if (pubLoading.has(k)) return; pubLoading.add(k); const el = $(k === 'car' ? 'vpgrid' : 'tpgrid'), more = $(k === 'car' ? 'moreCars' : 'moreTracks'); if (reset) { pubSeen[k].clear(); el.textContent = ''; if (k === 'car') { pubCars = []; pubCarCursor = null } else { pubTracks = []; pubTrackCursor = null } } const existing = pubSeen[k]; try { const items = await listPublished(k, { before: reset ? null : (k === 'car' ? pubCarCursor : pubTrackCursor), reset }); const clean = []; for (const it of items) { if (!it?.id || existing.has(it.id)) continue; existing.add(it.id); clean.push(it) } for (const it of clean) appendPubCardOnce(k, it, el); const all = k === 'car' ? pubCars : pubTracks; all.push(...clean); if (clean.length) { if (k === 'car') pubCarCursor = clean.at(-1).id; else pubTrackCursor = clean.at(-1).id } more.hidden = items.length < 20; if (!all.length && !items.length) { const p = document.createElement('p'); p.className = 'multi-intro'; p.textContent = 'Aucune création publiée pour le moment.'; el.append(p) } } catch (e) { notify.show({ type: 'error', title: 'Erreur réseau', message: publicationError(e) }) } finally { pubLoading.delete(k); refreshPublishedCount(k) } }
function appendPubCardOnce(k, it, el) { // le document d/{id} n'est chargé que lorsque l'aperçu entre dans le viewport.
  const wrap = document.createElement('div'); wrap.className = 'mcell'; const b = document.createElement('button'); b.type = 'button'; b.className = 'gcard'; b.dataset.id = it.id; b.dataset.pubKind = k; b.dataset.previewState = 'loading'; b.innerHTML = '<canvas width="300" height="220" aria-label="Aperçu en chargement"></canvas><h3></h3><p></p><small>Créé par un joueur</small><div class="pub-preview-stats"></div>'; b.querySelector('h3').textContent = it.name; b.querySelector('p').textContent = 'par ' + it.author; drawPubPlaceholder(b.querySelector('canvas').getContext('2d'), 'Chargement de l’aperçu…'); b.addEventListener('click', async () => { b.disabled = true; try { const o = await loadPubData(k, it.id); if (!o) throw Error('Création publiée introuvable.'); if (k === 'car') { o.id = 'pubcar_' + it.id; sessionStorage.setItem('little-turismo-pub-car', JSON.stringify(o)); registerCustom(o); cfg.car = o.id; saveSaved(cfg); location.hash = 'race' } else { o.id = 'pubtrack_' + it.id; sessionStorage.setItem('little-turismo-pub-track', JSON.stringify(o)); cfg.circuit = o.id; saveSaved(cfg); if (gameMode === 'multi') { const create = multiCreatePending; multiCreatePending = false; location.replace('#race'); if (create) makeRoom(); } else location.hash = 'cars' } } catch (e) { notify.show({ type: 'error', title: 'Chargement impossible', message: publicationError(e) }) } finally { b.disabled = false } }); wrap.append(b); el.append(wrap); if (pubPreviewObserver) pubPreviewObserver.observe(b.querySelector('canvas')); else queuePubPreview(b.querySelector('canvas'))
}
function drawPubPlaceholder(x, label) { if (!x) return; x.clearRect(0, 0, 300, 220); x.fillStyle = '#111827'; x.fillRect(0, 0, 300, 220); x.fillStyle = '#8290a8'; x.font = '14px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 150, 110) }
function queuePubPreview(canvas) { const card = canvas.closest('.gcard'); if (!card || card.dataset.previewQueued) return; card.dataset.previewQueued = '1'; pubPreviewQueue.push({ canvas, card, kind: card.dataset.pubKind, id: card.dataset.id }); pumpPubPreviews() }
function loadPubData(kind, id) { const key = kind + ':' + id; if (pubDataPending.has(key)) return pubDataPending.get(key); const req = new Promise((resolve, reject) => { pubDataQueue.push({ kind, id, key, resolve, reject }); pumpPubData() }); pubDataPending.set(key, req); return req }
function pumpPubData() { while (pubDataActive < 3 && pubDataQueue.length) { const job = pubDataQueue.shift(); pubDataActive++; (job.kind === 'car' ? loadPublishedCar(job.id) : loadPublishedTrack(job.id)).then(job.resolve, job.reject).finally(() => { pubDataPending.delete(job.key); pubDataActive--; pumpPubData() }) } }
function pumpPubPreviews() { while (pubPreviewActive < 3 && pubPreviewQueue.length) { const job = pubPreviewQueue.shift(); if (!job.card.isConnected) continue; pubPreviewActive++; renderPubPreview(job).catch(() => { if (job.canvas.isConnected) { job.card.dataset.previewState = 'error'; job.canvas.setAttribute('aria-label', 'Échec du chargement de l’aperçu'); drawPubPlaceholder(job.canvas.getContext('2d'), 'Échec du chargement') } }).finally(() => { pubPreviewActive--; pumpPubPreviews() }) } }
async function renderPubPreview({ canvas, card, kind, id }) { const key = kind + ':' + id, cached = pubPreviewCache.get(key); if (cached) { const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = cached.image }); if (!canvas.isConnected) return; const x = canvas.getContext('2d'); x.clearRect(0, 0, 300, 220); x.drawImage(image, 0, 0, 300, 220); canvas.setAttribute('aria-label', kind === 'car' ? 'Aperçu de la voiture publiée' : 'Aperçu du circuit publié'); card.dataset.previewState = 'ready'; pubPreviewCache.delete(key); pubPreviewCache.set(key, cached); appendPubPreviewStats(card, cached.rows); return } const d = await loadPubData(kind, id); if (!d) throw Error('Aperçu indisponible'); if (!canvas.isConnected) return; const x = canvas.getContext('2d'); x.clearRect(0, 0, 300, 220); let rows = []; if (kind === 'car') { const sheet = customSheet(d); carPreview(x, { sheet }); rows = statsOf(sheet) } else { const t = buildTrack({ ...d, ec: true }, 'pubtrack_' + id); startMark(x, (drawTrack(x, 300, 220, 18, 11, '#0b0f1a', t), drawTrack(x, 300, 220, 18, 5, '#e9eef7', t)), 8, t); const st = stats(t); rows = [['Longueur', (st.length / 1000).toFixed(2).replace('.', ',') + ' km'], ['Virages', st.turns], ['Dénivelé', Math.round(st.climb) + ' m']] } card.dataset.previewState = 'ready'; canvas.setAttribute('aria-label', kind === 'car' ? 'Aperçu de la voiture publiée' : 'Aperçu du circuit publié'); pubPreviewCache.set(key, { image: canvas.toDataURL('image/png'), rows }); while (pubPreviewCache.size > PUB_PREVIEW_CACHE_MAX) pubPreviewCache.delete(pubPreviewCache.keys().next().value); appendPubPreviewStats(card, rows) }
function appendPubPreviewStats(card, rows) { const box = card.querySelector('.pub-preview-stats'); if (!box || box.childElementCount) return; for (const [name, value] of rows) { const row = document.createElement('div'); row.className = 'st'; row.innerHTML = '<span></span><b></b>'; row.firstChild.textContent = name; row.lastChild.textContent = value; box.appendChild(row) } }

sync(false); show();

// Asset exchange: published items are represented only by Firebase ID; local items use a bounded compact payload.
const ASSET_MAX = 14000;
const packedBytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const safeName = (v, max = 24) => typeof v === 'string' && v.length <= max;
const validTrack = d => d && typeof d === 'object' && safeName(d.name, 24) && Number.isFinite(d.start) && d.start >= 0 && d.start <= 12000 && ['temperate','forest','snow','desert','tropical','autumn','volcano','dusk'].includes(d.theme) &&
  Array.isArray(d.pts) && d.pts.length >= 6 && d.pts.length <= 96 && d.pts.every(p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(v) && Math.abs(v) <= 2000)) &&
  Array.isArray(d.elev) && d.elev.length === d.pts.length && d.elev.every(v => Number.isFinite(v) && v >= -200 && v <= 300) &&
  (!d.corners || (Array.isArray(d.corners) && (d.corners.length === 0 || d.corners.length === d.pts.length) && d.corners.length <= 96 && d.corners.every(c => c && ['smooth','sharp','round','hairpin'].includes(c.type) && Number.isFinite(c.radius) && c.radius >= 0 && c.radius <= 250)));
const validCar = d => d && typeof d === 'object' && safeName(d.name, 32) && ['gt','wedge','proto','rally','open','drag','thrust'].includes(d.kind) &&
  /^#[0-9a-f]{6}$/i.test(d.color) && /^#[0-9a-f]{6}$/i.test(d.accent) &&
  ['vmax','ch','mass','grip','aero','bal'].every(k => { const [lo,hi] = getSpecRange(d.kind,k); return Number.isFinite(d[k]) && d[k] >= lo && d[k] <= hi; });
function packLocal(kind, d) {
  if (kind === 'track') {
    if (!validTrack(d)) throw Error('Le circuit local contient des données invalides.');
    return { n:d.name, s:Math.round(d.start), p:d.pts.map(p=>p.map(v=>Math.round(v*10)/10)), e:d.elev.map(v=>Math.round(v*10)/10), h:d.theme, c:(d.corners||[]).map(x=>({t:x.type,r:Math.round(x.radius*10)/10})) };
  }
  if (!validCar(d)) throw Error('La voiture locale contient des données invalides.');
  return { n:d.name, k:d.kind, c:d.color, a:d.accent, v:d.vmax, ch:d.ch, m:d.mass, g:d.grip, ae:d.aero, b:d.bal };
}
function unpackLocal(kind, d) {
  if (kind === 'track') return { name:d.n, start:d.s, pts:d.p, elev:d.e, theme:d.h, corners:(d.c||[]).map(x=>({type:x.t,radius:x.r})) };
  return { name:d.n, kind:d.k, color:d.c, accent:d.a, vmax:d.v, ch:d.ch, mass:d.m, grip:d.g, aero:d.ae, bal:d.b };
}
function assetRef(kind, id, uid = Net.N.uid) {
  let d = kind === 'track' ? loadTracks().find(x=>x.id===id) : loadCustom().find(x=>x.id===id);
  if (!d && (id.startsWith(kind === 'track' ? 'pubtrack_' : 'pubcar_') || id.startsWith('mp' + (kind === 'track' ? 't_' : 'c_')))) {
    try { d = JSON.parse(sessionStorage.getItem(kind === 'track' ? 'little-turismo-pub-track' : 'little-turismo-pub-car')); } catch {}
    if (d?.id !== id) d = null;
  }
  // Un pubId valide est un digest SHA-256 sur 20 octets = 40 chars hex (ou au moins /^[a-f0-9]{20}$/ selon publish.js).
  // Si pubId vaut l'ID local (ex: 'c_mw13nnnd'), on l'ignore : la voiture est locale, pas publiée.
  const rawPubId = d?.pubId || (id.startsWith(kind === 'track' ? 'pubtrack_' : 'pubcar_') ? id.slice(kind === 'track' ? 9 : 7) : null);
  const pubId = typeof rawPubId === 'string' && /^[a-f0-9]{20}$/.test(rawPubId) ? rawPubId : null;
  if (pubId) return { type:'published', id:pubId };
  if (kind === 'track' && !d && [...CIRCUITS, ...loadTracks()].some(x=>x.id===id)) return { type:'stock', id };
  if (kind === 'car' && !d && CAR_LIST.some(x=>x.id===id)) return { type:'stock', id };
  if (!d) throw Error(`Création ${kind === 'track' ? 'de circuit' : 'de voiture'} introuvable : ${id}`);
  const data = packLocal(kind,d), text = JSON.stringify(data);
  if (packedBytes(data) > ASSET_MAX) throw Error('Création locale trop volumineuse (maximum 14 Ko).');
  return { type:'local', id:d.id, data:text };
}
function publishedAssetId(ref, kind) {
  if (typeof ref?.id !== 'string') return null;
  // La sélection réseau envoie l'ID Firebase brut (20 hex). Accepter aussi
  // l'ID UI pubcar_/pubtrack_ des anciennes rooms, en retirant son préfixe.
  const prefix = kind === 'car' ? 'pubcar_' : 'pubtrack_';
  const id = ref.id.startsWith(prefix) ? ref.id.slice(prefix.length) : ref.id;
  // Seuls les IDs Firebase valides (digest SHA-256 tronqué = 20 chars hex minuscule) sont acceptés.
  // Cela empêche les IDs locaux (ex: 'c_mw13nnnd') d'être traités comme des publications Firebase.
  return /^[a-f0-9]{20}$/.test(id) ? id : null;
}
function unpackAssetLocal(ref, kind) {
  const payload = JSON.parse(ref.data);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Format local invalide.');
  // Formats compact actuels + fiche étendue historique (publish.js / room ancienne).
  const compact = kind === 'track' ? Object.prototype.hasOwnProperty.call(payload, 'p') : Object.prototype.hasOwnProperty.call(payload, 'k') && Object.prototype.hasOwnProperty.call(payload, 'v');
  return compact ? unpackLocal(kind, payload) : payload;
}
function validAssetRef(ref, kind) {
  if (!ref || typeof ref !== 'object' || !['track','car'].includes(kind)) return false;
  if (ref.type === 'published') return !!publishedAssetId(ref, kind);
  if (ref.type === 'stock') return typeof ref.id === 'string' && (kind === 'track' ? CIRCUITS.some(x=>x.id===ref.id) : CAR_LIST.some(x=>x.id===ref.id));
  if (ref.type !== 'local' || typeof ref.id !== 'string' || ref.id.length > 80 || typeof ref.data !== 'string') return false;
  try {
    if (new TextEncoder().encode(ref.data).byteLength > ASSET_MAX) return false;
    const d = unpackAssetLocal(ref, kind);
    return kind === 'track' ? validTrack(d) : validCar(d);
  } catch { return false; }
}
async function installAsset(ref, kind, owner = 'guest') {
  // Cas spécial : ref 'published' avec un ID non-Firebase (ex: ID local hérité d'un bug ancien).
  // On tente un repli stock avant de rejeter.
  if (ref?.type === 'published' && !publishedAssetId(ref, kind)) {
    const rawId = typeof ref.id === 'string' ? ref.id : '';
    if (kind === 'track' && CIRCUITS.some(x => x.id === rawId)) return rawId;
    if (kind === 'car' && CAR_LIST.some(x => x.id === rawId)) return rawId;
    throw Error(`Ref de publication invalide (ID non-Firebase : "${rawId}"). Recréez la room pour appliquer le correctif.`);
  }
  if (!validAssetRef(ref,kind)) throw Error(`Données de ${kind === 'track' ? 'circuit' : 'voiture'} invalides.`);
  if (ref.type === 'stock') return ref.id;
  let d;
  if (ref.type === 'published') {
    const id = publishedAssetId(ref, kind);
    // S'assurer que Firebase est initialisé avant de lire (les invités rejoignant une room peuvent avoir une auth en cours)
    if (!Net.N.db) await Net.init();
    // Essaie jusqu'à 3 fois (connexion Firebase parfois lente pour les joueurs qui rejoignent)
    for (let attempt = 0; attempt < 3 && !d; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
      try { d = kind === 'track' ? await loadPublishedTrack(id) : await loadPublishedCar(id); } catch { /* réessai */ }
    }
    // Repli : cache localStorage (item mis en place lors de la navigation/publication ou de la sélection en lobby)
    if (!d) {
      try {
        const ck = `lt-pub-${kind === 'track' ? 'track' : 'car'}-item-v2-${id}`;
        const cached = JSON.parse(localStorage.getItem(ck));
        if (cached?.v && Date.now() - cached.t < 600000) d = cached.v;
      } catch { /* pas de cache */ }
    }
    if (!d) throw Error(`Publication ${ref.id} introuvable ou inaccessible. Vérifiez la connexion Firebase.`);
  } else d = unpackAssetLocal(ref, kind);
  if (!(kind === 'track' ? validTrack(d) : validCar(d))) throw Error(`Publication: données de ${kind} invalides.`);
  const suffix = `${String(owner).replace(/[^a-zA-Z0-9]/g,'').slice(0,40)}_${ref.type === 'published' ? ref.id : ref.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,36)}`;
  const id = (kind === 'track' ? 'mpt_' : 'mpc_') + suffix;
  if (kind === 'track') {
    // Stocker dans la liste MP séparée : n'apparaît PAS dans "Mes Créations"
    const list = loadMpTracks(); if (!list.some(x=>x.id===id)) { list.push({ ...d, id }); saveMpTracks(list); }
  } else {
    const installed = { ...d, id };
    // Stocker dans la liste MP séparée : n'apparaît PAS dans "Mes Créations"
    const list = loadMpCars(); if (!list.some(x=>x.id===id)) { list.push(installed); saveMpCars(list); }
    registerCustom(installed);
  }
  return id;
}
// ── Multijoueur : l'hôte configure uniquement les qualifications et le nombre d'IA.
let activeRoom = null, roomData = null, stopRoomWatch = null, roomBusy = false, roomLoadNotice = '';
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
    || localStorage.getItem('little-turismo-name') || '';
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
  $('roomCarModeWrap').hidden = !(+aiEl?.value > 0);
}

function renderRoom(d) {
  roomData = d;
  if (!d) { $('roomOverlay').hidden = true; return; }
  const session = Net.readSession(), host = d.leaderId === session?.uid, players = Object.entries(d.players || {});
  $('roomCodeLabel').textContent = d.code || activeRoom;
  $('roomNote').textContent = d.state === 'loading' ? 'Chargement des créations avant le départ…' : (roomLoadNotice && host ? roomLoadNotice : host ? 'Tu choisis les qualifications, les tours, la difficulté et les IA en plus.' : 'En attente que le créateur lance la course…');
  $('hostSettings').hidden = !host;
  $('guestWaiting').hidden = host;
  const dc = d.config || cfg;
  $('roomQualifying').value = String(!!dc.qualifying);
  $('roomAi').value = String(dc.ai || 0); $('roomCarMode').value = dc.carMode === 'same' ? 'same' : 'mixed';
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
  $('publicWrap').hidden = !host || d.state === 'playing'; if (host) $('roomPublic').checked = !!d.public;
  $('startRoom').hidden = !host;
  $('startRoom').disabled = d.state !== 'waiting' || players.length < 1 || players.length + (+$('roomAi').value || 0) > 20;
  if (d.state === 'loading' || d.state === 'playing') { if (host) Net.setPublic(activeRoom, null); beginMultiplayer(d); if (host && d.state === 'loading') monitorRoomPreparation(d); }
  else if (host) syncPublic(d);
}
// Rooms publiques : l'hôte publie une fiche dans l'index, rafraîchie toutes les 20 s tant que la room attend.
let pubTimer = null, pubOn = false;
function syncPublic(d) {
  const on = !!d.public && d.state === 'waiting';
  clearInterval(pubTimer); pubTimer = null;
  if (!on) { if (pubOn) { pubOn = false; Net.setPublic(d.code || activeRoom, null); } return; }
  pubOn = true;
  const push = () => {
    const r = roomData; if (!r || !activeRoom) return; const me = r.players?.[r.leaderId], c = r.config || {};
    return Net.setPublic(activeRoom, { host: me?.name || 'Pilote', n: Object.keys(r.players || {}).length, max: r.maxHumans || 20, circuit: c.circuit || '', laps: c.laps || 3, ai: c.ai || 0 });
  };
  const go = async () => { if (!(await push())) { const el = $('roomNote'); if (el) el.textContent = 'Publication impossible (droits Firebase sur rooms/racing_public ?)'; } };
  go(); pubTimer = setInterval(push, 20000);
}
$('roomPublic')?.addEventListener('change', async () => {
  if (!activeRoom || roomData?.leaderId !== Net.N.uid) return;
  await Net.update(activeRoom, { public: $('roomPublic').checked });
});
let stopPub = null;
async function showPublicRooms() {
  if (stopPub || !(await Net.init())) return;
  stopPub = Net.watchPublic((list) => {
    const el = $('publicList'); if (!el) return; el.textContent = '';
    if (!list.length) { el.textContent = 'Aucune room publique pour le moment.'; el.style.opacity = .7; return; }
    el.style.opacity = 1;
    for (const r of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn alt'; b.style.cssText = 'display:block;width:100%;margin:4px 0;text-align:left';
      const cn = (circuitList().find((c) => c.id === r.circuit) || {}).name || r.circuit || '';
      b.textContent = (r.host || 'Pilote') + ' · ' + cn + ' · ' + r.laps + ' tours · ' + r.n + '/' + r.max + ' joueurs';
      b.addEventListener('click', () => { $('roomCode').value = r.code; $('joinRoom').click(); });
      el.appendChild(b);
    }
  });
}
showPublicRooms(); setInterval(showPublicRooms, 3000);   // réessaie tant que le réseau n'est pas prêt

function enterRoom(code, d) {
  activeRoom = code; $('roomOverlay').hidden = false; if (stopRoomWatch) stopRoomWatch(); stopRoomWatch = Net.watch(code, renderRoom); renderRoom(d);
}

let preparingToken = null;
async function beginMultiplayer(d) {
  const session = Net.readSession(), p = d.players?.[session?.uid];
  if (!session || !p || session.going || !['loading','playing'].includes(d.state)) return;
  const token = `${d.code}:${d.startedAt || ''}:${d.state}:${session.uid}`;
  if (preparingToken === token) return;
  preparingToken = token; roomStatus('Préparation de la course : chargement et validation des créations…');
  try {
    const trackId = await installAsset(d.assets?.track || assetRef('track', d.config?.circuit), 'track', d.leaderId);
    const mappedPlayers = {};
    for (const [uid, player] of Object.entries(d.players || {})) {
      if (player.away) { mappedPlayers[uid] = player; continue; }
      const playerCar = await installAsset(player.carAsset || assetRef('car', player.car || d.config?.car), 'car', uid);
      mappedPlayers[uid] = { ...player, car:playerCar };
    }
    const carId = mappedPlayers[session.uid]?.car || await installAsset(p.carAsset || assetRef('car', p.car || d.config?.car), 'car', session.uid);
    if (d.state === 'loading') {
      const latest = await Net.getRoom(d.code);
      if (!latest || latest.state !== 'loading' || !latest.players?.[session.uid] || latest.players[session.uid].away) {
        preparingToken = null; roomStatus('Le chargement a été interrompu : vous n’êtes plus dans cette room.'); return;
      }
      await Net.update(d.code, { [`players/${session.uid}/ready`]: true, [`players/${session.uid}/readyAt`]: Net.now(), [`players/${session.uid}/readyError`]: null });
      roomStatus('Créations chargées ; attente des autres pilotes…'); return;
    }
    const latest = await Net.getRoom(d.code);
    if (!latest || latest.state !== 'playing' || !latest.players?.[session.uid] || latest.players[session.uid].away) { preparingToken = null; roomStatus('Le départ a été annulé ou le joueur a quitté la room.'); return; }
    session.going = true; session.hostId = latest.leaderId; session.players = Object.fromEntries(Object.entries(latest.players || {}).map(([uid, player]) => [uid, mappedPlayers[uid] || player])); session.code = latest.code;
    session.assets={trackId,carId};session.replayConfig=latest.config;try{sessionStorage.setItem('little-turismo-loading','1')}catch(e){}Net.saveSession(session);
    const rc = sanitize({ ...latest.config, circuit:trackId, car:carId }); startSession(rc); location.href = 'game.html';
  } catch (e) {
    preparingToken = null;
    roomStatus(`Chargement impossible : ${e.message || 'données incorrectes'}`);
    if (Net.N.uid) await Net.update(d.code, { [`players/${session.uid}/ready`]: false, [`players/${session.uid}/readyError`]: String(e.message || e).slice(0,180) });
  }
}

$('roomQualifying')?.addEventListener('change', async () => {
  if (!activeRoom || roomData?.leaderId !== Net.N.uid) return;
  await Net.update(activeRoom, { 'config/qualifying': $('roomQualifying').value === 'true' });
});

$('roomLaps')?.addEventListener('input', () => { $('roomLapsValue').textContent = $('roomLaps').value; });

$('roomCarMode')?.addEventListener('change', async () => {
  if (!activeRoom || roomData?.leaderId !== Net.N.uid) return;
  await Net.update(activeRoom, { 'config/carMode': $('roomCarMode').value });
});
$('roomAi')?.addEventListener('input', async () => {
  fitRoomRanges();
  if (!activeRoom || roomData?.leaderId !== Net.N.uid) return;
  await Net.update(activeRoom, { 'config/ai': +$('roomAi').value });
});

for (const [id, key] of [['roomLaps', 'laps'], ['roomDiff', 'diff']]) $(id)?.addEventListener('change', async () => {
  if (!activeRoom || roomData?.leaderId !== Net.N.uid) return;
  await Net.update(activeRoom, { ['config/' + key]: key === 'laps' ? +$(id).value : $(id).value });
});

$('createRoom').addEventListener('click', () => { if (!roomBusy && playerName()) { multiCreatePending = true; location.hash = 'circuits'; } });
async function makeRoom() {
  if (roomBusy) return; const name = playerName(); if (!name) return; roomBusy = true; roomCreationInFlight = true; const token = ++roomCreateToken; roomStatus('Connexion…');
  let made = null, sessionSaved = false;
  try {
    if (!(await Net.init())) throw new Error('offline');
    const initial = sanitize({ ...cfg, circuit: cfg.circuit, car: cfg.car, carMode: cfg.carMode, ai: 0, qualifying: false, laps: cfg.laps || 3, diff: cfg.diff });
    for (let i = 0; i < 4 && !made; i++) {
      const c = Net.code();
      const ok = await Net.createRoom(c, {
        code: c, state: 'waiting', leaderId: Net.N.uid, createdAt: Net.now(), maxHumans: 20, numPlayers: 20, config: initial,
        assets: { track: assetRef('track', cfg.circuit) },
        players: { [Net.N.uid]: { uid: Net.N.uid, name, score: 0, car: cfg.car, carAsset: assetRef('car', cfg.car), joined: Net.now(), lastSeen: Net.now(), away: false } }
      });
      if (ok) made = c;
    }
    if (!made) throw new Error('room');
    if (token !== roomCreateToken) { await Net.leave(made, false); return; }
    const created = await Net.getRoom(made);
    if (token !== roomCreateToken) { await Net.leave(made, false); return; }
    Net.saveSession({ code: made, uid: Net.N.uid, going: false }); sessionSaved = true;
    roomStatus('');
    enterRoom(made, created);
  } catch (e) {
    if (made && !sessionSaved) { try { await Net.leave(made, false); } catch { /* nettoyage au mieux */ } }
    roomStatus(e?.message || 'Multijoueur indisponible. Vérifie la connexion.');
  } finally { roomBusy = false; roomCreationInFlight = false; }
}

$('joinRoom').addEventListener('click', async () => {
  if (roomBusy) return; const name = playerName(), code = $('roomCode').value.trim().toUpperCase();
  if (!name || code.length !== 6) { roomStatus('Entre un code de room valide.'); return; }
  roomBusy = true; const token = ++roomJoinToken; roomStatus('Recherche…');
  try {
    if (!(await Net.init())) throw new Error('offline');
    if (token !== roomJoinToken) return;
    const d = await Net.getRoom(code);
    if (token !== roomJoinToken) return;
    if (!d || d.state !== 'waiting') throw new Error('missing');
    if (d.players?.[Net.N.uid]) {
      if (token !== roomJoinToken) return;
      const updated = await Net.update(code, { [`players/${Net.N.uid}/car`]: cfg.car, [`players/${Net.N.uid}/carAsset`]: assetRef('car', cfg.car) });
      if (!updated) throw new Error('join');
      if (token !== roomJoinToken) return;
      Net.saveSession({ code, uid: Net.N.uid, going: false }); enterRoom(code, await Net.getRoom(code)); return;
    }
    if (Object.keys(d.players || {}).length >= (d.maxHumans || 20)) throw new Error('full');
    const r = await Net.join(code, { name, score: 0, car: cfg.car, carAsset: assetRef('car', cfg.car), joined: Net.now(), lastSeen: Net.now(), away: false });
    if (r !== true) throw new Error('join');
    if (token !== roomJoinToken) { await Net.leave(code, false); return; }
    Net.saveSession({ code, uid: Net.N.uid, going: false });
    roomStatus('');
    enterRoom(code, await Net.getRoom(code));
  } catch (e) { if (token === roomJoinToken) roomStatus(e.message === 'full' ? 'Cette room est complète.' : 'Room introuvable ou déjà lancée.'); } finally { roomBusy = false; }
});

let prepMonitor = null;
function monitorRoomPreparation(initial) {
  if (prepMonitor) return;
  const code = initial.code || activeRoom, deadline = Date.now() + 45000;
  prepMonitor = setInterval(async () => {
    const d = await Net.getRoom(code);
    if (!d || d.state !== 'loading') { clearInterval(prepMonitor); prepMonitor = null; return; }
    const players = Object.entries(d.players || {}).filter(([,p]) => !p.away);
    const bad = players.find(([,p]) => p.readyError);
    if (bad) { await abortRoomLoad(code, `Échec du chargement (${bad[1].name || 'un joueur'}) : ${bad[1].readyError}`); return; }
    if (players.length && players.every(([,p]) => p.ready === true)) {
      clearInterval(prepMonitor); prepMonitor = null;
      await Net.update(code, { state:'playing', startedAt:Net.now() }); return;
    }
    if (Date.now() >= deadline) await abortRoomLoad(code, 'Délai dépassé (45 s) : un pilote n’a pas chargé les créations. Réessayez ou retirez-le de la room.');
  }, 700);
}
async function abortRoomLoad(code, message) {
  clearInterval(prepMonitor); prepMonitor = null;
  const d = await Net.getRoom(code); if (d?.state !== 'loading') return;
  const updates = { state:'waiting', startedAt:null };
  for (const [uid] of Object.entries(d.players || {})) { updates[`players/${uid}/ready`] = false; updates[`players/${uid}/readyError`] = null; }
  await Net.update(code, updates); roomLoadNotice = message; roomStatus(message); const note = $('roomNote'); if (note) note.textContent = message;
}
$('startRoom').addEventListener('click', async () => {
  if (!activeRoom || roomData?.leaderId !== Net.N.uid) return;
  const players = Object.keys(roomData.players || {}).length, aiCount = +$('roomAi').value || 0;
  if (players < 1 || players + aiCount > 20) return;
  clearInterval(pubTimer); pubOn = false; await Net.setPublic(activeRoom, null);   // plus visible dans la liste une fois lancée
  const qual = $('roomQualifying').value === 'true';
  const nextConfig = sanitize({ ...roomData.config, ai: aiCount, qualifying: qual, laps: +$('roomLaps').value || 3, diff: $('roomDiff').value, carMode: $('roomCarMode').value });
  // Reset ready flags each round; the assets/config remain intact for replay.
  roomLoadNotice = ''; const updates = { config: nextConfig, state:'loading', startedAt:Net.now(), runtime:null };
  for (const uid of Object.keys(roomData.players || {})) { updates[`players/${uid}/ready`] = false; updates[`players/${uid}/readyError`] = null; }
  if (!(await Net.update(activeRoom, updates))) { roomStatus('Impossible de préparer la course (droits Firebase ou connexion).'); return; }
  const fresh = await Net.getRoom(activeRoom); if (fresh) monitorRoomPreparation(fresh);
});

$('leaveRoom').addEventListener('click', async () => {
  preparingToken = null; if (prepMonitor) { clearInterval(prepMonitor); prepMonitor = null; }
  if (activeRoom && roomData?.leaderId === Net.N.uid) { clearInterval(pubTimer); pubTimer = null; pubOn = false; await Net.setPublic(activeRoom, null); }
  if (activeRoom) await Net.leave(activeRoom, roomData?.state === 'playing');
  if (stopRoomWatch) { stopRoomWatch(); stopRoomWatch = null; }
  activeRoom = null; roomData = null; roomLoadNotice = '';
  $('roomOverlay').hidden = true; roomStatus('');
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

