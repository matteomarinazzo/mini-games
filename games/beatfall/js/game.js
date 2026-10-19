// Beatfall – game.js · cache local "beatfall" + record mondial Firebase (leaderboards/beatfall/<musique>)
import { PATTERNS, getPattern } from './core/patterns.js';
import { createAudio } from './core/audio.js';

// ── CONST ──
const COLS = 4;
const PERFECT_MS = 60, GOOD_MS = 130;              // fenêtres de jugement (± ms réelles autour de la ligne)
const PERFECT_BONUS = 1, COMBO_MAX = 8;            // parfait = (1 + bonus) × min(combo de parfaits, plafond)
const HOLD_TICK_BEATS = .25, HOLD_TICK_PTS = 1, HOLD_SLACK = .2;   // tick des notes longues (battements) ; tolérance de relâche avant la fin
const LIVES = 3, SPEEDUP = 1.25;                   // vies ; vitesse × SPEEDUP à chaque boucle (chute + horloge), sans plafond
const PREP_BEATS = 3;                              // battements de préparation avant la première note (rien à jouer, temps non compté)
const LEAD = 3, LINE = .82, NH = 34;               // battements visibles au-dessus de la ligne ; position de la ligne ; hauteur d'une note (px)
const WORLD_MIN_SCORE = 1;
const STORAGE_KEY = 'beatfall', FB_GAME = 'beatfall';   // record mondial : FB_GAME / id de la musique → { value, duration, message, timestamp }
const KEYS = { d: 0, f: 1, j: 2, k: 3 };

const $ = id => document.getElementById(id);
const p = getPattern(new URLSearchParams(location.search).get('music')) || PATTERNS[0];
const bps = p.bpm / 60, audio = createAudio(p);
const board = $('board'), cols = [...board.querySelectorAll('.col')], jt = $('jt');
let S, mode = 'ready', lastT = 0, fresh = true, held = {}, ptr = {}, runId = 0, pendingRec = null;
let best = { t: 0, s: 0 }, wS = { v: 0, m: '' }, wT = { v: 0, m: '' }, fb = null, net = null;   // records mondiaux indépendants : score / temps (ms)
const els = new Map(), down = Array(COLS).fill(0);
const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));

// ── Formats / records ──
const pad2 = n => String(n).padStart(2, '0');
const fmtClock = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + pad2(s % 60); };
const fmtDuration = ms => `${fmtClock(ms)},${Math.floor(ms / 100) % 10}`;
const parseRemote = d => ({ v: Number(d && typeof d === 'object' ? d.value : d) || 0, m: (d && d.message) || '' });
const loopOf = B => Math.max(0, Math.floor(B / p.len)), spdOf = B => SPEEDUP ** loopOf(B);
const win = (ms, B) => ms / 1000 * bps * spdOf(B);

// ── Persistance (par événement) : { best:{id:{t,s}}, world:{id:{s,t,m}}, g:{id:partie} } ──
const rd = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } };
const wr = d => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch { /* stockage indisponible */ } };
const num = v => typeof v === 'number' && isFinite(v);
function save() {
  const d = rd();
  (d.g ||= {})[p.id] = { B: S.B, loop: loopOf(S.B), speed: spdOf(S.B), ms: Math.round(S.ms), score: S.score, lives: S.lives, combo: S.combo, st: S.st, over: S.over, nr: S.nr };
  wr(d);
}
function saveRec() { const d = rd(); (d.best ||= {})[p.id] = best; (d.world ||= {})[p.id] = { s: wS.v, sm: wS.m, t: wT.v, tm: wT.m }; wr(d); }
function load() {
  const d = rd(), g = d.g?.[p.id], b = d.best?.[p.id], w = d.world?.[p.id];
  if (b) best = { t: Number(b.t) || 0, s: Number(b.s) || 0 };
  if (w) { wS = { v: Number(w.s) || 0, m: w.sm || '' }; wT = { v: Number(w.t) || 0, m: w.tm || '' }; }
  if (!g || ![g.B, g.ms, g.score, g.lives].every(num) || !g.st || typeof g.st !== 'object') return null;
  const st = {};   // une tenue en cours est pardonnée à la reprise (le doigt n'est plus là)
  for (const [k, e] of Object.entries(g.st)) if (Array.isArray(e)) st[k] = e[0] === 'h' ? ['d', ...e.slice(1)] : e;
  return { B: g.B, ms: g.ms, score: g.score, lives: g.lives, combo: g.combo | 0, st, over: !!g.over || g.lives <= 0, nr: g.nr || {} };
}

// ── Jeu ──
function act(B) {   // notes proches de la fenêtre visible (boucles précédente, courante, suivante)
  const L = loopOf(B), r = [];
  for (let l = Math.max(0, L - 1); l <= L + 1; l++) p.notes.forEach(([c, b, d], i) => { const t = l * p.len + b; if (t + d >= B - 2 && t <= B + LEAD + .5) r.push({ k: l * 1000 + i, c, t, d }); });
  return r;
}
const curB = () => mode === 'play' ? S.B + (performance.now() - lastT) / 1000 * bps * spdOf(S.B) : S.B;
const anim = (el, c) => { el.classList.remove(c); void el.offsetWidth; el.classList.add(c); };
const say = (t, k) => { jt.textContent = t; jt.dataset.k = k; anim(jt, 'go'); };

function press(c) {
  if (mode !== 'play' || down[c]) return;
  if (S.B < -LEAD) return;                          // préparation : taps ignorés, sans faute
  down[c] = 1; cols[c].classList.add('dn');
  const B = curB(), g = win(GOOD_MS, B), pf = win(PERFECT_MS, B); let b = null, be = 1e9;
  for (const n of act(B)) { if (n.c !== c || S.st[n.k]) continue; const e = Math.abs(n.t - B); if (e <= g && e < be) { b = n; be = e; } }
  if (!b) { fault(); return; }                      // trop tôt / mauvaise colonne / dans le vide
  const pr = be <= pf;
  if (pr) { S.combo++; S.score += (1 + PERFECT_BONUS) * Math.min(S.combo, COMBO_MAX); } else { S.combo = 0; S.score++; }
  const hold = b.d > 0;
  S.st[b.k] = [hold ? 'h' : 'd', pr ? 'p' : 'g', b.t + HOLD_TICK_BEATS, b.t + b.d, c];   // [état, cran, prochain tick, fin, colonne]
  if (hold) { held[c] = b.k; audio.holdStart(c, B); } else audio.tap(c, B);
  anim(cols[c], pr ? 'p' : 'g'); say(pr ? `Parfait ×${Math.min(S.combo, COMBO_MAX)}` : 'Bon', pr ? 'p' : 'g');
  save();
}
function release(c) {
  down[c] = 0; cols[c].classList.remove('dn');
  const k = held[c]; if (k == null || mode !== 'play') return;
  delete held[c]; const e = S.st[k]; audio.holdEnd(c);
  if (curB() < e[3] - HOLD_SLACK) { e[0] = 'm'; fault(); } else { e[0] = 'd'; save(); }
}
function fault() {
  S.lives--; S.combo = 0; audio.fault(); anim(board, 'shake'); anim($('lv'), 'hit'); say('Faute', 'x'); save();
  if (S.lives <= 0) die();
}
function step(dt) {
  if (S.B >= -LEAD) S.ms += dt; const L0 = loopOf(S.B); S.B += dt / 1000 * bps * spdOf(S.B);
  if (loopOf(S.B) !== L0) { for (const k in S.st) if (k / 1000 < loopOf(S.B) - 1) delete S.st[k]; save(); }
  const B = S.B, g = win(GOOD_MS, B);
  for (const n of act(B)) if (!S.st[n.k] && n.t + g < B) { S.st[n.k] = ['m']; fault(); if (mode !== 'play') return; }   // trop tard
  let tk = 0;
  for (const e of Object.values(S.st)) if (e[0] === 'h') {
    for (const lim = Math.min(B, e[3]); e[2] <= lim; e[2] += HOLD_TICK_BEATS) { S.score += HOLD_TICK_PTS; tk = 1; }
    if (B >= e[3]) { e[0] = 'd'; audio.holdEnd(e[4]); delete held[e[4]]; tk = 1; }
  }
  if (tk) save();
  audio.sched(B, spdOf(B));
}

function draw() {
  const B = curB(), ly = board.clientHeight * LINE, ppb = ly / LEAD, seen = new Set();
  for (const n of act(B)) {
    const st = S.st[n.k], h = st && st[0] === 'h'; let el = els.get(n.k);
    if (st && !h) { if (el) { el.classList.add(st[0] === 'm' ? 'miss' : 'hit'); setTimeout(() => el.remove(), 250); els.delete(n.k); } continue; }
    if (!el) { el = document.createElement('div'); el.className = 'n' + (n.d ? ' long' : ''); el.style.height = (n.d * ppb + NH) + 'px'; cols[n.c].appendChild(el); els.set(n.k, el); }
    seen.add(n.k);
    const top = ly - (n.t + n.d - B) * ppb - NH / 2;
    if (h) { el.classList.add('held'); el.style.height = Math.max(NH, ly + NH / 2 - top) + 'px'; }
    el.style.transform = `translateY(${top}px)`;
  }
  for (const [k, el] of els) if (!seen.has(k)) { el.remove(); els.delete(k); }
  $('tm').textContent = fmtClock(S.ms); $('sc').textContent = S.score;
  [...$('lv').children].forEach((i, n) => i.classList.toggle('lost', n >= S.lives));
}
function frame(now) {
  requestAnimationFrame(frame);
  if (mode === 'play') { const dt = Math.min(now - lastT, 100); lastT = now; step(dt); }
  draw();
}
const clearBoard = () => { els.forEach(e => e.remove()); els.clear(); };

// ── États ──
function showPause(title, btn) { $('pTitle').textContent = title; $('resume').textContent = btn; $('pauseOv').hidden = false; }
function pause() {
  if (mode !== 'play') return;
  mode = 'pause'; for (const c in held) audio.holdEnd(c); held = {};
  for (const e of Object.values(S.st)) if (e[0] === 'h') e[0] = 'd';
  audio.suspend(); save(); showPause('Pause', 'Reprendre');
}
function resume() {
  if (mode === 'play' || mode === 'over') return;
  audio.unlock(); if (fresh) { audio.reset(S.B); fresh = false; }
  mode = 'play'; lastT = performance.now(); $('pauseOv').hidden = true;
  if (S.B < -LEAD) say('Prêt ?', 'g');
}
function newGame() {
  runId++; S = { B: -LEAD - PREP_BEATS, ms: 0, score: 0, lives: LIVES, combo: 0, st: {}, over: false, nr: {} };
  const d = rd(); if (d.g) delete d.g[p.id]; wr(d);
  clearBoard(); held = {}; board.classList.remove('lose'); mode = 'ready'; fresh = true; pendingRec = null;
  for (const i of ['end', 'recPop']) $(i).hidden = true;
  showPause('Prêt ?', 'Jouer'); setWorld('');
}
function die() {
  mode = 'over'; S.over = true; for (const c in held) audio.holdEnd(c); held = {}; audio.reset(0);
  S.nr = { t: S.ms > best.t, s: S.score > best.s };
  if (S.nr.t) best.t = Math.round(S.ms); if (S.nr.s) best.s = S.score;
  saveRec(); save(); board.classList.add('lose');
  const id = runId; setTimeout(() => { if (id === runId && mode === 'over') showOver(true); }, 700);
}
function showOver(check) {
  const r = S.nr || {};
  $('oSc').textContent = S.score; $('oTm').textContent = fmtDuration(S.ms);
  $('oScR').textContent = r.s ? '🏆 Nouveau record de score !' : 'Record : ' + best.s;
  $('oTmR').textContent = r.t ? '🏆 Nouveau record de temps !' : 'Record : ' + fmtDuration(best.t);
  $('eEmoji').textContent = r.s || r.t ? '🏆' : '💔'; $('eTitle').textContent = r.s || r.t ? 'Nouveau record !' : 'Plus de vies';
  $('end').hidden = false;
  if (check && S.score >= WORLD_MIN_SCORE) checkWorld({ score: S.score, ms: Math.round(S.ms) }, runId); else setWorld('');
}

// ── Records mondiaux : score et temps = deux records indépendants (leaderboards/beatfall/<musique>_score et <musique>_time) ──
const KS = p.id + '_score', KT = p.id + '_time';
const setWorld = m => { $('goWorld').textContent = m; };
function renderRecs() {
  $('rpS').textContent = best.s || '—'; $('rpT').textContent = best.t ? fmtClock(best.t) : '—';
  $('rwS').textContent = wS.v || '—'; $('rwT').textContent = wT.v ? fmtClock(wT.v) : '—';
  $('rwSM').textContent = wS.m ? `« ${wS.m} »` : ''; $('rwTM').textContent = wT.m ? `« ${wT.m} »` : '';
}
async function isOnline() { try { return net ? !!(await Promise.resolve(net.checkRealConnection())) : false; } catch { return false; } }
async function refreshWorld() {
  try {
    if (!fb || !(await isOnline())) return false;
    const [ds, dt] = await Promise.all([fb.getFirebaseRecordData(FB_GAME, KS), fb.getFirebaseRecordData(FB_GAME, KT)]);
    wS = ds == null ? (wS.v > 0 ? wS : { v: 0, m: '' }) : parseRemote(ds);
    wT = dt == null ? (wT.v > 0 ? wT : { v: 0, m: '' }) : parseRemote(dt);
    renderRecs(); saveRec(); return true;
  } catch (e) { console.error('Firebase records error:', e); return false; }
}
async function initOnline() {
  try { [fb, net] = await Promise.all([import('../../../js/firebaseWrk.js'), import('../../../js/network.js')]); await refreshWorld(); }
  catch (e) { console.warn('Mode hors ligne :', e); }
}
async function checkWorld(r, myRun) {
  setWorld('Vérification des records mondiaux…');
  try {
    await Promise.race([onlineReady, wait(2500)]); if (myRun !== runId) return;
    const online = await Promise.race([isOnline(), wait(2500, false)]); if (myRun !== runId) return;
    if (!online || !fb) { setWorld('Hors ligne : records mondiaux indisponibles. Tes records personnels restent sauvegardés.'); return; }
    const fr = await Promise.race([refreshWorld(), wait(2500, false)]); if (myRun !== runId) return;
    if (!fr) { setWorld('Records mondiaux indisponibles pour le moment.'); return; }
    const sB = r.score > wS.v, tB = r.ms > wT.v;
    if (sB || tB) {
      pendingRec = { ...r, sB, tB }; $('eEmoji').textContent = '🏆'; $('eTitle').textContent = 'Record mondial !';
      setWorld(sB && tB ? '🌍 Tu bats les records mondiaux de score et de temps !' : sB ? '🌍 Tu bats le record mondial de score !' : '🌍 Tu bats le record mondial de temps !');
      $('recPop').hidden = false; $('recMsg').value = ''; $('recCnt').textContent = '0/50'; setTimeout(() => $('recMsg').focus(), 100);
    } else setWorld(`Records mondiaux : ${wS.v} pts · ${fmtClock(wT.v)}`);
  } catch (e) { console.error('Firebase records error:', e); if (myRun === runId) setWorld('Records mondiaux indisponibles pour le moment.'); }
}
$('recSave').addEventListener('click', async () => {
  if (!pendingRec) return;
  const r = pendingRec, message = $('recMsg').value.trim().substring(0, 50), btn = $('recSave');
  btn.disabled = true; btn.textContent = 'Enregistrement...';
  const pub = [];
  try {
    if (fb) {
      const fr = await Promise.race([refreshWorld(), wait(2500, false)]);
      const put = async (key, value) => (await Promise.race([fb.setFirebaseLeaderboard(FB_GAME, key, { value, message, timestamp: Date.now() }), wait(4000, false)])) === true;
      if (r.sB && !(fr && r.score <= wS.v) && await put(KS, r.score)) { wS = { v: r.score, m: message }; pub.push('score'); }
      if (r.tB && !(fr && r.ms <= wT.v) && await put(KT, r.ms)) { wT = { v: r.ms, m: message }; pub.push('temps'); }
    }
  } catch (e) { console.error('Error saving record message:', e); }
  if (pub.length) { renderRecs(); saveRec(); setWorld('🌍 Record mondial publié : ' + pub.join(' + ') + ' !'); }
  else setWorld('Record mondial non publié (connexion indisponible ou déjà battu).');
  btn.disabled = false; btn.textContent = 'Sauvegarder'; $('recPop').hidden = true; pendingRec = null;
});
$('recMsg').addEventListener('input', () => { $('recCnt').textContent = `${$('recMsg').value.length}/50`; });

// ── Entrées ──
cols.forEach((el, c) => {
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); ptr[e.pointerId] = c; press(c); });
  const up = e => { const k = ptr[e.pointerId]; if (k != null) { delete ptr[e.pointerId]; release(k); } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
});
addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (Object.hasOwn(KEYS, k)) { e.preventDefault(); press(KEYS[k]); } else if (k === 'escape' || k === 'p') pause();
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (Object.hasOwn(KEYS, k)) release(KEYS[k]); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('resize', clearBoard);
addEventListener('contextmenu', e => e.preventDefault());
$('pauseBtn').addEventListener('click', pause);
$('resume').addEventListener('click', resume);
$('pRestart').addEventListener('click', newGame);
$('endRestart').addEventListener('click', newGame);
$('recordsBtn').addEventListener('click', async () => {
  pause(); renderRecs(); $('recOv').hidden = false; $('recStatus').textContent = 'Synchronisation...';
  await Promise.race([onlineReady, wait(2500)]);
  const ok = await Promise.race([refreshWorld(), wait(2500, false)]);
  renderRecs(); $('recStatus').textContent = ok ? '' : 'Hors ligne (records locaux)';
});
$('recClose').addEventListener('click', () => { $('recOv').hidden = true; });
$('recOv').addEventListener('click', e => { if (e.target === $('recOv')) $('recOv').hidden = true; });
$('rulesBtn').addEventListener('click', () => { pause(); $('rulesOv').hidden = false; });
$('rulesClose').addEventListener('click', () => { $('rulesOv').hidden = true; });

// ── Init ──
if (new URLSearchParams(location.search).get('new')) { const d = rd(); if (d.g) delete d.g[p.id]; wr(d); history.replaceState(null, '', '?music=' + p.id); }
const loaded = load(); renderRecs();
if (loaded) { S = loaded; if (S.over) { mode = 'over'; fresh = false; showOver(false); } else { mode = 'pause'; showPause('Pause', 'Reprendre'); } } else newGame();
requestAnimationFrame(frame);
const onlineReady = initOnline();