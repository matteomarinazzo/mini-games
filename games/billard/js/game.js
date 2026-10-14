// V7 : parties en ligne (?room=CODE, hôte autoritaire : sync.js / online.js, voir README_V7.md). V6 : contre l'ordinateur (cpu.js), règles personnalisables (config.js / rules.js). V5 : livret des règles, billes qui roulent (roll.js), plateau animé en canvas, sauvegarde (save.js), modales.
// Base V4 : pause, infos par joueur, visée rouge. Simulation → physics.js · commandes → input.js · HTML → ui.js.
import { parseMode } from './core/modes.js';
import {
  TABLE, BALL_R, POCKETS, HEAD_SPOT, createWorld, shoot, update, isMoving, stopAll, rayCast, isValidCuePlacement,
} from './core/physics.js';
import { createUI, ballColor, isStripe } from './core/ui.js';
import { createInput, viewRect } from './core/input.js';
import { ID, rollBy } from './core/roll.js';
import { fillRules } from './core/help.js';
import { snapshot, restore, writeGame } from './core/save.js';
import { getRules, normalize } from './core/config.js';
import { parseFrame, parseLive, makeActGate, makeFrameGate, makeTurnGate, encodeFrame, encodeSnap, decodeSnap, restoreFrom, cleanName } from './core/sync.js';
import * as cpu from './core/cpu.js';
import * as rules from './core/rules.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');

// Repère logique : origine = coin haut-gauche du tapis ; rail de T.R autour ; plateau des billes empochées sous la table.
const TRAY_H = 46;
const T = { W: TABLE.W, H: TABLE.H, R: 50, CUSHION: 14 };
const LW = T.W + 2 * T.R, LH = T.H + 2 * T.R + TRAY_H;
const TR = 11, TRAY_Y = T.H + T.R + 4 + (TRAY_H - 4) / 2, ENTRY_X = T.W + T.R - 26;   // rayon d'une bille du plateau, ligne, entrée (droite)
const slotX = k => -T.R + 26 + k * 25;                                                 // emplacement k : de gauche à droite
const FALL = 0.22, ROLL_V = 850, WAIT = 0.12, GAP = 0.35;                              // durées/vitesses de l'animation (s, unités/s)

const mode = parseMode(location.search);
const ROOM = (new URLSearchParams(location.search).get('room') || '').toUpperCase(), ONLINE = ROOM !== '';   // V7 : ?room=CODE = partie en ligne
if (ONLINE) mode.cpu = false;
const NAMES = mode.cpu ? ['Joueur 1', 'Ordinateur'] : ['Joueur 1', 'Joueur 2'];
$('hudMode').textContent = mode.label + (mode.cpu ? ' · Ordi' : '') + (ONLINE ? ' · En ligne' : '');
$('p1').firstElementChild.textContent = NAMES[1];
const winTitle = w => (mode.cpu ? (w === 0 ? 'Tu as gagné !' : 'L\'ordinateur gagne') : ONLINE ? (w === seat ? 'Tu as gagné !' : NAMES[w] + ' gagne') : 'Victoire de ' + NAMES[w] + ' !');
document.title = mode.label + ' | Billard | Mini‑Games';
if (!mode.valid && !ONLINE) { $('warn').textContent = 'Mode absent ou invalide : 8-ball utilisé par défaut.'; $('warn').hidden = false; }

// Reçoit des coordonnées DÉJÀ converties en repère logique par input.js (toView) : aucune conversion ici (sinon elle serait appliquée deux fois).
// viewRect(cv) = rectangle du canvas dans ce même repère (getBoundingClientRect() brut serait celui de la page tournée).
export function toTable(viewX, viewY) {
  const r = viewRect(cv);
  return { x: (viewX - r.left) / r.width * LW - T.R, y: (viewY - r.top) / r.height * LH - T.R };
}

/* ============================ État de jeu ============================ */
const MIN_POWER = 0.05, MAX_SHOT_TIME = 30;
let paused = false, state = 'aiming', world, aim = 0, power = 0, chargeSource = null;
let cpuPlan = null;      // plan de l'ordinateur pour le tour en cours (jamais sauvegardé : un tour interrompu est rejoué proprement)
let ghost = null, shotTime = 0, pocketed = [], g, shot = null, timeLeft = rules.TURN_TIME, dirty = false, last = performance.now(), gate = 0;
const fx = [];    // chutes de la blanche (animation seule) ; pocketed = [{ n, by, a }] (a = animation en cours ou null)

const store = (() => { try { return window.localStorage; } catch { return null; } })();
const save = () => {            // jamais pendant le mouvement : on garde l'état d'avant le tir (voir README_V5.md)
  if (ONLINE || state === 'ballsMoving' || !store || !g) return;
  writeGame(store, mode.slot, snapshot({ g, aim, timeLeft, world, pocketed }));
};

const ui = createUI({ onConfirm: () => handlers.confirmPlacement(), onRestart: () => askNew(), onPause: () => togglePause(), names: NAMES });

function setState(s) { state = s; ui.setState(s); }
function setPower(p) { power = p; ui.setPower(p); }
const remaining = () => world.balls.filter(b => !b.out && b.n > 0).map(b => b.n);
const refreshPlayers = () => { const r = remaining(); ui.setPlayers(g.cur, [0, 1].map(i => ({ text: rules.info(g, i, r), ...rules.targets(g, i, r) }))); };

function startTurn(msg, t) {
  cpuPlan = null; ui.setCpu('');
  timeLeft = t ?? rules.TURN_TIME; ui.setTime(timeLeft); ui.setInfo(msg || ''); refreshPlayers();
  if (world.cue.out) g.hand = true;                       // sécurité : blanche empochée = placement obligatoire
  if (g.hand) {
    setState('placingCueBall');
    const c = world.cue; raw.movePlacement(c.out ? HEAD_SPOT.x : c.x, c.out ? HEAD_SPOT.y : c.y);
  } else { ghost = null; aim = rules.clampAim(aim, g.fwd); setState('aiming'); }
  if (ONLINE) { setPower(0); ui.setCpu(g.cur !== seat && !g.over ? `${NAMES[g.cur]} joue…` : ''); }   // en ligne : le tour de l'autre joueur est verrouillé
  save();
  if (isHost()) pub(msg);
}

// r = partie restaurée (save.js) ou undefined = nouvelle partie. Réinitialise TOUT (entrées, pause, animations).
function newGame(r) {
  input.reset(); paused = false; ui.setPaused(false); last = performance.now();
  world = r ? r.world : createWorld(mode.id); g = r ? r.g : rules.createGame(mode.id, ONLINE ? roomOpts : (store ? getRules(store) : null), mode.cpu);   // règles figées pour toute la partie
  aim = r ? r.aim : 0; chargeSource = null; shotTime = 0; ghost = null; shot = null; dirty = !!r; gate = 0;
  pocketed = r ? r.pocketed.map(e => ({ ...e, a: null })) : []; fx.length = 0; ori.clear(); pv.clear();
  ui.setCancelling(false); ui.hideEnd(); setPower(0);
  if (r && g.over) {
    refreshPlayers(); ui.setInfo(''); ui.setTime(0); ui.showEnd(winTitle(g.winner), g.reason); setState('gameOver'); return;
  }
  startTurn(r ? 'Partie reprise' : '', r?.timeLeft);
  if (r) togglePause(true, 'Partie reprise');           // une partie restaurée démarre en pause : reprise volontaire
}

// Partie VISUELLE d'un empochage (animation de chute + plateau) : commune à l'hôte / au local (physique) et à l'invité (images reçues).
function pocketFx(b) {
  const p = POCKETS.reduce((m, q) => Math.hypot(b.x - q.x, b.y - q.y) < Math.hypot(b.x - m.x, b.y - m.y) ? q : m);
  const a = { n: b.n, x: b.x, y: b.y, px: p.x, py: p.y, t: 0, ph: 0 };   // animation purement visuelle
  if (b.n === 0) fx.push(a); else { a.slot = pocketed.length; pocketed.push({ n: b.n, by: g.cur, a }); }
  return { pi: POCKETS.indexOf(p), p };
}
function onPocket(b) {
  if (!shot) return;
  const { pi, p } = pocketFx(b); shot.pk[b.n] = pi;
  if (b.n === 0) {
    shot.cue = true;
    // poche du milieu : côté d'où venait la blanche (position au début de l'image) ; sinon côté de la poche
    shot.side = pi >= 4 ? ((Math.abs(shot.cx - T.W / 2) < 2 ? shot.cx0 : shot.cx) < T.W / 2 ? 'L' : 'R') : (p.x < T.W / 2 ? 'L' : 'R');
  } else shot.pocketed.push(b.n);
}

function applyResult(r) {
  ghost = null;
  if (g.over) {
    refreshPlayers(); ui.showEnd(winTitle(g.winner), g.reason); setState('gameOver'); save();
    if (isHost()) { pub(''); net?.setEnded(ROOM); }
  } else startTurn(r.msg);
}

function endShot() {
  stopAll(world);
  if (!shot) return;
  const s = shot; shot = null; s.first = world.cue.first ?? null;
  applyResult(rules.evaluate(g, s));
}

function timeout() {
  if (state === 'charging') { chargeSource = null; setPower(0); ui.setCancelling(false); }
  applyResult(rules.timeout(g));
}

const handlers = {
  state: () => paused ? 'paused' : state,
  aim: () => aim,
  cue: () => world.cue,
  chargeSource: () => chargeSource,
  pointerKind: k => ui.setKind(k),
  setAim(a) { if (state === 'aiming' || state === 'charging') aim = rules.clampAim(a, g.fwd); },
  beginCharge(src) { if (state !== 'aiming') return; chargeSource = src; setPower(0); setState('charging'); },
  setPower(p) { if (state === 'charging') setPower(p); },
  setCancelling: c => ui.setCancelling(c),
  cancelCharge() {
    if (state !== 'charging') return;
    chargeSource = null; setPower(0); ui.setCancelling(false); setState('aiming');
  },
  fire() {
    if (state !== 'charging') return;
    const p = power;
    chargeSource = null; ui.setCancelling(false); setPower(0);
    if (p < MIN_POWER) { setState('aiming'); return; }
    aim = rules.clampAim(aim, g.fwd);
    if (isGuest()) { sendShot(aim, p); return; }          // invité : seule l'intention part ; l'hôte simule et valide
    save();                                              // état d'avant le tir (positions + temps restant) : base de reprise
    g.fwd = null; g.zone = null;                         // la contrainte de tir ne vaut que pour le 1er coup après placement
    shot = { before: remaining(), pocketed: [], cue: false, first: null, pk: {}, cx: world.cue.x, cx0: world.cue.x };
    shoot(world, aim, p); ui.setInfo('');
    shotTime = 0; dirty = true;
    setState('ballsMoving'); streamStart();
  },
  movePlacement(x, y) {
    if (state !== 'placingCueBall') return;
    const cl = (v, max) => Math.min(max + T.R, Math.max(-T.R, v));
    const px = g.zone === 'L' ? Math.min(x, rules.ZONE.L) : g.zone === 'R' ? Math.max(x, rules.ZONE.R) : x;   // zone imposée (cueSide)
    const gx = cl(px, T.W), gy = cl(y, T.H);
    ghost = { x: gx, y: gy, valid: isValidCuePlacement(world, px, y) && rules.cueZoneOk(g, px) };
    ui.setPlacementValid(ghost.valid);
  },
  confirmPlacement() {
    if (state !== 'placingCueBall' || !ghost || !ghost.valid) return;
    if (isGuest()) { net.act(ROOM, uid, { id: nextActId(), seq, type: 'place', x: ghost.x, y: ghost.y }); awaiting = performance.now(); ui.setCpu('Position envoyée…'); return; }
    const c = world.cue;
    c.x = ghost.x; c.y = ghost.y; c.vx = c.vy = 0; c.out = false;
    ghost = null; g.hand = false; g.zone = null; aim = rules.clampAim(aim, g.fwd);
    setState('aiming'); save();
    if (isHost()) pub('');
  },
};
const raw = { ...handlers };                             // versions non filtrées : utilisées par l'ordinateur uniquement
for (const k of ['setAim', 'beginCharge', 'setPower', 'fire', 'movePlacement', 'confirmPlacement']) {
  const f = handlers[k]; handlers[k] = (...a) => paused || cpuActive() || netLocked() ? undefined : f(...a);   // pause, tour de l'ordinateur ou de l'autre joueur en ligne : rien à faire
}
{ const f = handlers.cancelCharge; handlers.cancelCharge = () => (cpuActive() || netLocked() ? undefined : f()); }

const input = createInput({ canvas: cv, gauge: $('power'), toTable, h: handlers });
addEventListener('pagehide', () => { save(); input.destroy(); });

/* ===== Ordinateur : réfléchit → (place la blanche) → vise → charge → tire. Tout passe par les mêmes actions que le joueur (raw.*) ===== */
const cpuActive = () => !!g && mode.cpu && g.cur === 1 && !g.over && (state === 'aiming' || state === 'charging' || state === 'placingCueBall');
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function cpuStep(dt) {                  // appelé seulement hors pause ; le chrono du tour continue de tourner (frame)
  const p = cpuPlan ??= { ph: 'think', t: 0, wait: 0.8 + Math.random() * 0.5 };
  p.t += dt;
  if (p.ph === 'think') {
    ui.setCpu(state === 'placingCueBall' ? 'L\'ordinateur place la blanche…' : 'L\'ordinateur réfléchit…');
    if (p.t < p.wait) return;
    if (state === 'placingCueBall') { const q = cpu.placeCue(world, g, remaining()); raw.movePlacement(q.x, q.y); p.ph = 'place'; p.t = 0; }
    else { Object.assign(p, cpu.planShot(world, g, remaining()), { ph: 'aim', t: 0, from: aim }); }
  } else if (p.ph === 'place') {
    if (p.t < 0.7) return;
    raw.confirmPlacement();             // position valide par construction (cpu.placeCue) ; sinon le chrono sanctionne
    if (state === 'aiming') cpuPlan = { ph: 'think', t: 0, wait: 0.5 };
  } else if (p.ph === 'aim') {
    ui.setCpu('L\'ordinateur vise…');
    const k = Math.min(1, p.t / 0.8), e = k * k * (3 - 2 * k);
    raw.setAim(p.from + angDiff(p.from, p.aim) * e);
    if (k >= 1) { p.ph = 'charge'; p.t = 0; }
  } else {
    ui.setCpu('L\'ordinateur tire…');
    if (state === 'aiming') raw.beginCharge('cpu');       // (re)démarre la charge si elle a été interrompue (pause, etc.)
    const k = Math.min(1, p.t / 0.6);
    raw.setPower(p.power * k);
    if (k >= 1) { cpuPlan = null; raw.fire(); }
  }
}

/* ===== Pause, modales (règles, confirmation) ===== */
function togglePause(force, title) {
  if (state === 'gameOver' || ONLINE) return;               // en ligne : pas de pause (le chrono est partagé)
  const p = force ?? !paused;
  if (p === paused) return;
  if (p) input.reset(); else last = performance.now();
  paused = p; ui.setPaused(p, title);
  if (p) save();
}
let modal = null, resumeAfter = false;
function openModal(el) {
  if (modal) return;
  modal = el; resumeAfter = !paused && state !== 'gameOver'; togglePause(true); el.hidden = false;
  el.querySelector('button')?.focus();
}
function closeModal() {
  if (!modal) return;
  modal.hidden = true; modal = null;
  if (resumeAfter) togglePause(false);
}
function askNew() { if (!dirty || g.over) newGame(); else openModal($('confirmOv')); }
$('rulesBtn').addEventListener('click', () => { fillRules($('rulesTitle'), $('rulesBody'), mode.id, g.opts, mode.cpu, ONLINE); openModal($('rulesOv')); });
$('rulesClose').addEventListener('click', closeModal);
$('confirmNo').addEventListener('click', closeModal);
$('confirmYes').addEventListener('click', () => { closeModal(); newGame(); });
for (const o of [$('rulesOv'), $('confirmOv')]) o.addEventListener('click', e => { if (e.target === o) closeModal(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });
matchMedia('(orientation: portrait) and (pointer: coarse)').addEventListener?.('change', e => { if (e.matches) togglePause(true); });
addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal) closeModal();
  else if ((e.key === 'p' || e.key === 'P') && !modal) togglePause();
});

/* ===== Billes qui roulent : orientation visuelle par bille (jamais la physique) ===== */
const ori = new Map(), pv = new Map();
function updateRoll() {
  for (const b of world.balls) {
    const p = pv.get(b.n);
    if (p && state === 'ballsMoving' && !b.out) { const dx = b.x - p.x, dy = b.y - p.y; if (dx * dx + dy * dy < 3600) ori.set(b.n, rollBy(ori.get(b.n) || ID(), dx, dy, BALL_R)); }
    pv.set(b.n, { x: b.x, y: b.y });
  }
}

/* ===== Animation d'empochage : chute dans la poche, puis la bille ressort à droite du plateau et roule vers la gauche ===== */
function stepAnim(a, dt) {          // true = terminée
  a.t += dt;
  if (a.ph === 0 && a.t >= FALL) { a.ph = a.slot === undefined ? 3 : 1; a.t = 0; }
  if (a.ph === 1 && a.t >= WAIT && gate <= 0) { a.ph = 2; a.x = ENTRY_X; a.y = TRAY_Y; gate = GAP; }
  if (a.ph === 2) {
    const d = Math.min(ROLL_V * dt, a.x - slotX(a.slot));
    a.x -= d; ori.set(a.n, rollBy(ori.get(a.n) || ID(), -d, 0, TR));
    if (a.x <= slotX(a.slot) + 1e-6) return true;
  }
  return a.ph === 3;
}
function stepFx(dt) {
  gate -= dt;
  for (let i = fx.length - 1; i >= 0; i--) if (stepAnim(fx[i], dt)) fx.splice(i, 1);
  for (const e of pocketed) if (e.a && stepAnim(e.a, dt)) e.a = null;
}

/* ============================ Rendu ============================ */
const layer = document.createElement('canvas');

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function diamond(g, x, y) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-5, -5, 10, 10); g.restore(); }

function drawTable(g) {
  const WH = LH - TRAY_H;                             // hauteur du cadre en bois (hors plateau)
  g.clearRect(0, 0, LW, LH);
  rr(g, 0, 0, LW, WH, 36); g.fillStyle = '#5b3a1f'; g.fill();
  rr(g, 5, 5, LW - 10, WH - 10, 32); g.strokeStyle = '#7a5230'; g.lineWidth = 3; g.stroke();
  const c = T.CUSHION;
  rr(g, T.R - c, T.R - c, T.W + 2 * c, T.H + 2 * c, 10); g.fillStyle = '#0b5a3a'; g.fill();
  g.fillStyle = '#0f7a4d'; g.fillRect(T.R, T.R, T.W, T.H);
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(T.R + T.W / 4, T.R); g.lineTo(T.R + T.W / 4, T.R + T.H); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.35)';
  for (const fx of [.25, .75]) { g.beginPath(); g.arc(T.R + T.W * fx, T.R + T.H / 2, 4, 0, 7); g.fill(); }
  g.fillStyle = '#050505';
  for (const p of POCKETS) { g.beginPath(); g.arc(T.R + p.x, T.R + p.y, p.r, 0, 7); g.fill(); }
  g.fillStyle = '#e8d9b0';
  for (let i = 1; i <= 7; i++) if (i !== 4) { diamond(g, T.R + T.W * i / 8, T.R / 2); diamond(g, T.R + T.W * i / 8, WH - T.R / 2); }
  for (let i = 1; i <= 3; i++) { diamond(g, T.R / 2, T.R + T.H * i / 4); diamond(g, LW - T.R / 2, T.R + T.H * i / 4); }
  // Plateau des billes empochées (gouttière sombre sous la table) + repères d'emplacements
  rr(g, 0, WH + 4, LW, TRAY_H - 4, 14); g.fillStyle = '#16221b'; g.fill();
  rr(g, 8, WH + 9, LW - 16, TRAY_H - 14, 10); g.fillStyle = '#08120d'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1.5;
  for (let k = 0; k < 15; k++) { g.beginPath(); g.arc(T.R + slotX(k), T.R + TRAY_Y, TR - 1, 0, 7); g.stroke(); }
}

const SPOTS = [[0, 0, -1], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];   // marques de la blanche (local)

// Bille : orientation O (roll.js). Chiffres = 2 pastilles opposées (axe z local) ; bande des rayées = zone |p·v| < h
// autour de l'axe local y, balayée ligne par ligne sur l'hémisphère visible. s = échelle (plateau).
function drawBall(b, alpha = 1, s = 1) {
  const R = BALL_R, n = b.n, O = ori.get(n) || ID(), col = ballColor(n), stripe = isStripe(n);
  ctx.save(); ctx.translate(b.x, b.y); ctx.scale(s, s); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.arc(2, 3, R, 0, 7); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.clip();
  ctx.fillStyle = n === 0 || stripe ? '#f6f4ee' : col; ctx.fillRect(-R, -R, 2 * R, 2 * R);
  if (stripe) {
    const px = O[1], py = O[4], pz = O[7]; ctx.fillStyle = col;
    for (let y = -R; y < R; y++) {
      let x0 = null; const yy = y + .5;
      for (let x = -R; x <= R; x++) {
        const r2 = x * x + yy * yy;
        const on = r2 < R * R && Math.abs(x * px + yy * py - Math.sqrt(R * R - r2) * pz) < .55 * R;
        if (on && x0 === null) x0 = x; else if (!on && x0 !== null) { ctx.fillRect(x0, y, x - x0, 1.05); x0 = null; }
      }
    }
  }
  if (n > 0) {
    for (const sg of [-1, 1]) {                                  // sg = -1 : pastille avant (0,0,-1) ; 1 : arrière
      if (sg * O[8] > -.05) continue;                            // face cachée ou sur la tranche
      ctx.save();
      ctx.transform(-sg * O[0], -sg * O[3], O[1], O[4], R * sg * O[2], R * sg * O[5]);   // plan tangent de la pastille
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, R * .5, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = `bold ${n > 9 ? 7.5 : 9}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n, 0, .5);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#c0392b';
    for (const [x, y, z] of SPOTS) {
      const vz = O[6] * x + O[7] * y + O[8] * z;
      if (vz > -.05) continue;
      ctx.beginPath(); ctx.arc(R * (O[0] * x + O[1] * y + O[2] * z), R * (O[3] * x + O[4] * y + O[5] * z), R * .13, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(-R * .35, -R * .4, R * .22, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
  ctx.restore();
}

const PULL_VISUAL = 110;
function drawAim() {
  const c = world.cue, dx = Math.cos(aim), dy = Math.sin(aim);
  const hit = rayCast(world, c.x, c.y, aim);
  ctx.save();
  // Rouge si la 1re bille touchée en ligne droite est illégale. Bande en premier : légalité indéterminable → blanc.
  const bad = !!hit.ball && !rules.legalFirst(g, hit.ball.n, remaining());
  ctx.setLineDash([9, 9]); ctx.strokeStyle = bad ? '#ff4d4d' : 'rgba(255,255,255,.55)'; ctx.lineWidth = bad ? 3 : 2;
  ctx.beginPath(); ctx.moveTo(c.x + dx * BALL_R, c.y + dy * BALL_R); ctx.lineTo(hit.x, hit.y); ctx.stroke();
  ctx.setLineDash([]); ctx.beginPath(); ctx.arc(hit.x, hit.y, BALL_R, 0, 7); ctx.stroke();
  if (bad) { ctx.beginPath(); ctx.moveTo(hit.x - 6, hit.y - 6); ctx.lineTo(hit.x + 6, hit.y + 6); ctx.moveTo(hit.x + 6, hit.y - 6); ctx.lineTo(hit.x - 6, hit.y + 6); ctx.stroke(); }
  const gap = BALL_R + 6 + power * PULL_VISUAL, len = 380, nx = -dy, ny = dx;
  const tx = c.x - dx * gap, ty = c.y - dy * gap, bx = c.x - dx * (gap + len), by = c.y - dy * (gap + len);
  ctx.fillStyle = '#e2b574';
  ctx.beginPath();
  ctx.moveTo(tx + nx * 2.4, ty + ny * 2.4); ctx.lineTo(bx + nx * 6, by + ny * 6);
  ctx.lineTo(bx - nx * 6, by - ny * 6); ctx.lineTo(tx - nx * 2.4, ty - ny * 2.4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + dx * 60, by + dy * 60); ctx.stroke();
  ctx.strokeStyle = '#6aa8ff'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - dx * 5, ty - dy * 5); ctx.stroke();
  ctx.restore();
}

function drawGhost() {
  if (!ghost) return;
  drawBall({ n: 0, x: ghost.x, y: ghost.y }, .75);
  ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = ghost.valid ? '#7dff9b' : '#ff5a5a';
  ctx.beginPath(); ctx.arc(ghost.x, ghost.y, BALL_R + 4, 0, 7); ctx.stroke(); ctx.restore();
}

const RING = ['#5bc8f5', '#ffb454'];    // anneau du plateau : Joueur 1 / Joueur 2
function drawTrayAndFx() {
  const k0 = TR / BALL_R;
  pocketed.forEach((e, k) => {
    const a = e.a;
    if (a && a.ph < 2) { if (a.ph === 0) drawFall(a); return; }          // en chute, ou « dans le conduit »
    const x = a ? a.x : slotX(k), y = a ? a.y : TRAY_Y;
    drawBall({ n: e.n, x, y }, 1, k0);
    ctx.strokeStyle = RING[e.by]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, TR + 1.5, 0, 7); ctx.stroke();
  });
  for (const a of fx) if (a.ph === 0) drawFall(a);
}
function drawFall(a) {                  // la bille glisse vers le centre de la poche en rétrécissant
  const k = Math.min(1, a.t / FALL), e = k * k * (3 - 2 * k);
  drawBall({ n: a.n, x: a.x + (a.px - a.x) * e, y: a.y + (a.py - a.y) * e }, 1 - .85 * k, 1 - .55 * k);
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  const sx = cv.width / LW, sy = cv.height / LH;
  ctx.setTransform(sx, 0, 0, sy, T.R * sx, T.R * sy);
  const cueIn = !world.cue.out;
  if (state === 'placingCueBall' && g.zone) {            // zone interdite ombrée (cueSide) + limite au 3e losange
    const zx = g.zone === 'L' ? rules.ZONE.L : 0, zw = g.zone === 'L' ? T.W - rules.ZONE.L : rules.ZONE.R;
    ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(zx, 0, zw, T.H);
    ctx.strokeStyle = '#ffdc00'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.beginPath();
    const lx = g.zone === 'L' ? rules.ZONE.L : rules.ZONE.R; ctx.moveTo(lx, 0); ctx.lineTo(lx, T.H); ctx.stroke(); ctx.setLineDash([]);
  }
  const bt = state === 'gameOver' ? null : rules.blackTarget(g, remaining());       // poche imposée pour la 8 (blackOpp)
  if (bt !== null) { const q = POCKETS[bt]; ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(q.x, q.y, q.r + 6, 0, 7); ctx.stroke(); }
  if (cueIn && (state === 'aiming' || state === 'charging')) drawAim();
  for (const b of world.balls) if (!b.out && b !== world.cue) drawBall(b);
  if (cueIn && state !== 'placingCueBall') drawBall(world.cue);
  if (state === 'placingCueBall') drawGhost();
  drawTrayAndFx();
}

/* ============================ V7 : en ligne — hôte autoritaire (voir README_V7.md) ============================
   L'hôte (siège 0, créateur du salon) est le seul à simuler la physique et à évaluer les coups (rules.js). L'invité (siège 1) envoie des
   INTENTIONS (visée en direct, tir, placement) et reçoit des ÉTATS validés : un document « tour » (seq croissant, snapshot save.js) puis,
   pendant un tir, un flux d'images de billes (≈12/s) qu'il rejoue sans rien simuler. Tout message reçu est validé (sync.js) puis filtré
   (doublons / désordre / ancien tour) avant d'être appliqué. */
const HB_MS = 5000, STALE_MS = 20000, GRACE_MS = 90000, FRAME_DT = 1 / 12;
let net = null, seat = 0, uid = null, peerUid = null, roomOpts = null, seq = 0, netReady = false, connected = true, fatalShown = false;
let awaiting = 0, peerVal = null, peerSeenAt = 0, peerOffline = false, offlineSince = 0, bgHost = false, noteMsg = '', noteUntil = 0;
let frames = [], playT = 0, pendingFrame = null, frameK = 0, sendAcc = 0, liveSent = '', lastPub = null, actId = 0;
const unsubs = [], timers = [], actGate = makeActGate(), frameGate = makeFrameGate(), turnGate = makeTurnGate();
const isHost = () => ONLINE && seat === 0, isGuest = () => ONLINE && seat === 1;
const netLocked = () => ONLINE && (!netReady || !!awaiting || !g || g.cur !== seat);   // pas mon tour / pas d'état validé / action en attente de l'hôte
const peerName = () => NAMES[1 - seat];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nextActId = () => (actId = Math.max(actId + 1, Date.now()));                     // croissant, y compris après une actualisation
const note = (m, ms = 4000) => { noteMsg = m; noteUntil = performance.now() + ms; renderWarn(); };

function renderWarn() {
  if (fatalShown) return;
  let t = '';
  if (!netReady && isGuest()) t = 'En attente de l\'état de la partie envoyé par l\'hôte…';
  else if (!connected) t = 'Connexion perdue : reconnexion en cours… (chrono suspendu, commandes bloquées)';
  else if (peerOffline) t = isHost()
    ? `${peerName()} semble déconnecté : chrono suspendu, victoire par forfait dans ${Math.max(0, Math.ceil((GRACE_MS - (performance.now() - offlineSince)) / 1000))} s s'il ne revient pas.`
    : 'L\'hôte semble déconnecté : en attente de son retour (tu peux quitter la partie).';
  else if (bgHost && isGuest()) t = 'L\'hôte a mis l\'onglet en arrière-plan : la partie est suspendue.';
  else if (noteMsg && performance.now() < noteUntil) t = noteMsg;
  const w = $('warn'); w.textContent = t; w.hidden = !t;
}

/* ---- Hôte : publication de l'état validé + flux d'images ---- */
function pub(msg = '') {                                     // appelé à chaque début de tour, placement validé et fin de partie
  if (!isHost() || !net) return;
  seq++;
  lastPub = net.publish(ROOM, { seq, snap: encodeSnap(snapshot({ g, aim, timeLeft, world, pocketed })), msg: String(msg || '').slice(0, 120) });
}
function streamStart() {
  frameK = 0; sendAcc = 0;
  if (isHost() && net) net.frame(ROOM, encodeFrame(seq, 0, 0, world, pocketed));
}
function streamTick(dt) {
  sendAcc += dt;
  if (sendAcc >= FRAME_DT && net) { sendAcc = 0; net.frame(ROOM, encodeFrame(seq, ++frameK, shotTime, world, pocketed)); }
}
// Intention de l'invité : appliquée une seule fois (id), au bon tour (seq), à son tour de jouer, via les mêmes actions que le clavier/la souris.
function onAct(v) {
  const a = actGate(v, seq);
  if (!a || !g || g.over || g.cur !== 1) return;
  if (a.type === 'place' && state === 'placingCueBall') { raw.movePlacement(a.x, a.y); if (ghost?.valid) raw.confirmPlacement(); }
  else if (a.type === 'shot' && state === 'aiming') { raw.setAim(a.aim); raw.beginCharge('net'); raw.setPower(a.power); raw.fire(); }
}
function endOnline(w, reason) {                              // hôte : fin de partie décidée hors règles (abandon, déconnexion prolongée)
  if (!isHost() || !g || g.over) return;
  if (shot) { shot = null; stopAll(world); }
  chargeSource = null; ui.setCancelling(false); setPower(0);
  g.over = true; g.winner = w; g.reason = reason; g.hand = false; g.sh = 1; ghost = null;
  applyResult({});
}

/* ---- Invité : états validés + lecture des images ---- */
function onTurnDoc(v) {
  const d = turnGate(v); if (!d) return;
  const r = restoreFrom(decodeSnap(d.snap), mode.id);           // validation complète V6 (billes, groupes, options, zone, coups…)
  if (!r) { note('État reçu invalide : ignoré.'); return; }
  const old = pocketed;
  seq = d.seq; awaiting = 0; frames.length = 0; netReady = true;
  world = r.world; g = r.g; aim = r.aim; shot = null; ghost = null; shotTime = 0; pv.clear();
  pocketed = r.pocketed.map((e, k) => { const o = old.find(x => x.n === e.n); if (o?.a) o.a.slot = k; return { n: e.n, by: e.by, a: o ? o.a : null }; });
  chargeSource = null; setPower(0); ui.setCancelling(false); input.reset();
  if (g.over) { refreshPlayers(); ui.setInfo(''); ui.setTime(0); ui.setCpu(''); ui.showEnd(winTitle(g.winner), g.reason); setState('gameOver'); return; }
  startTurn(d.msg, r.timeLeft);
  if (pendingFrame) { const f = pendingFrame; pendingFrame = null; onFrame(f); }
}
function onFrame(v) {
  if (!world || !g) return;
  const p = parseFrame(v, world.balls.length);
  if (p && p.n > seq) { pendingFrame = v; return; }              // image du tour suivant arrivée avant son document : mise en attente
  const f = frameGate(v, seq, world.balls.length);               // invalide, doublon, désordre ou ancien tour → null
  if (!f || g.over) return;
  if (!frames.length) playT = f.t - 0.1;
  if (state !== 'ballsMoving') { ghost = null; setPower(0); ui.setInfo(''); setState('ballsMoving'); }
  awaiting = 0; frames.push(f);
  if (frames.length > 40) frames.splice(0, frames.length - 40);
}
function applyOut(f) {                                           // billes empochées d'après l'image : animation de chute identique à l'hôte
  for (const n of f.c ? [...f.o, 0] : f.o) {
    const b = world.balls.find(x => x.n === n);
    if (b && !b.out) { b.out = true; b.vx = b.vy = 0; pocketFx(b); }
  }
}
function playback(dt) {                                          // interpolation entre images, avec ~0,1 s de retard pour absorber la gigue réseau
  if (!frames.length) return;
  const newest = frames[frames.length - 1].t;
  playT += dt;
  if (newest - playT > 0.6) playT = newest - 0.15; else if (playT > newest + 0.3) playT = newest;
  while (frames.length > 1 && frames[1].t <= playT) frames.shift();
  const a = frames[0], b = frames[1];
  applyOut(a);
  const u = b ? Math.min(1, Math.max(0, (playT - a.t) / Math.max(1e-3, b.t - a.t))) : 0;
  world.balls.forEach((bl, i) => {
    if (bl.out) return;
    const nb = b && !b.o.includes(bl.n) && !(bl.n === 0 && b.c) ? b : a, k = nb === b ? u : 0;
    bl.x = a.b[2 * i] + (nb.b[2 * i] - a.b[2 * i]) * k; bl.y = a.b[2 * i + 1] + (nb.b[2 * i + 1] - a.b[2 * i + 1]) * k;
  });
}
function sendShot(a, p) {
  net.act(ROOM, uid, { id: nextActId(), seq, type: 'shot', aim: a, power: p });
  awaiting = performance.now(); setState('ballsMoving');         // en attente de la 1re image de l'hôte ; sinon retour automatique (netTick)
}

/* ---- Aperçu en direct, présence, connexion ---- */
function onLive(v) {                                             // joueur distant : visée / puissance / blanche ; (invité) temps restant de l'hôte
  const l = parseLive(v); if (!l || !g) return;
  if (isGuest()) { bgHost = l.bg; if (l.tl !== undefined && state !== 'ballsMoving' && !g.over) { timeLeft = l.tl; ui.setTime(timeLeft); } }
  if (g.cur === seat || g.over) return;
  if (state === 'aiming' || state === 'charging') { if (l.a !== undefined) aim = rules.clampAim(l.a, g.fwd); setPower(l.p ?? 0); }
  else if (state === 'placingCueBall' && l.gx !== undefined && l.gy !== undefined) raw.movePlacement(l.gx, l.gy);
}
function liveTick() {
  if (!net || !g || !netReady || !connected) return;
  const l = {};
  if (isHost()) { l.tl = Math.ceil(timeLeft); if (document.hidden) l.bg = 1; }
  if (!g.over && g.cur === seat && !awaiting) {
    if (state === 'aiming' || state === 'charging') { l.a = Math.round(aim * 1000) / 1000; l.p = Math.round(power * 100) / 100; }
    else if (state === 'placingCueBall' && ghost) { l.gx = Math.round(ghost.x); l.gy = Math.round(ghost.y); }
  }
  const s = JSON.stringify(l); if (s === liveSent) return;
  liveSent = s; net.live(ROOM, uid, isHost(), l);
}
function onPeerSeen(v) { if (v !== peerVal) { peerVal = v; peerSeenAt = performance.now(); } }   // « vivant » = battement modifié (horloge locale, insensible au décalage)
function netTick() {                                             // 1 fois / s
  const now = performance.now(), off = connected && now - peerSeenAt > STALE_MS;
  if (off && !peerOffline) offlineSince = now;
  if (!off && peerOffline) note(`${peerName()} est de retour.`);
  peerOffline = off;
  if (isHost() && off && g && !g.over && now - offlineSince > GRACE_MS) endOnline(0, `${NAMES[1]} est resté déconnecté plus de 90 s : victoire par forfait`);
  if (awaiting && now - awaiting > 5000) {                       // l'hôte n'a pas confirmé (tour changé, message perdu…) : on rend la main
    awaiting = 0; ui.setCpu('');
    if (g && !g.over && g.cur === seat) { if (state === 'ballsMoving' && !frames.length) setState(g.hand ? 'placingCueBall' : 'aiming'); note('Action non confirmée par l\'hôte : réessaie.'); }
  }
  if (!connected) peerSeenAt = now;                              // pas de jugement pendant ma propre coupure
  renderWarn();
}

/* ---- Entrée / sortie ---- */
function fatal(e) {
  fatalShown = true; unsubs.splice(0).forEach(u => { try { u(); } catch { } }); timers.splice(0).forEach(clearInterval);
  if (e?.gone) { try { localStorage.removeItem('billard_room'); } catch { } }
  $('netMsg').textContent = e?.message || 'Erreur de connexion.'; $('netOv').hidden = false; $('warn').hidden = true;
}
function startNet(room) {
  const base = `rooms/${net.idOf(ROOM)}`, P = `${base}/players/${peerUid}`;
  net.setErrorHandler(e => note('Écriture Firebase refusée (' + (e?.code || e?.message || 'erreur') + ').', 8000));
  peerSeenAt = performance.now();
  unsubs.push(net.watch('.info/connected', v => { const c = v === true; if (c && !connected) peerSeenAt = performance.now(); connected = c; renderWarn(); }));
  unsubs.push(net.watch(`${P}/lastSeen`, onPeerSeen));
  net.beat(ROOM, uid);
  timers.push(setInterval(() => net.beat(ROOM, uid), HB_MS), setInterval(netTick, 1000), setInterval(liveTick, 150));
  if (isHost()) {
    unsubs.push(net.watch(`${P}/act`, onAct), net.watch(`${P}/live`, onLive),
      net.watch(`${P}/left`, v => { if (v === true && g && !g.over) endOnline(0, `${NAMES[1]} a quitté la partie`); }));
    const gm = room.game, r = gm && Number.isSafeInteger(gm.seq) ? restoreFrom(decodeSnap(gm.snap), mode.id) : null;
    if (r) { seq = gm.seq; newGame(r); } else newGame();           // reprise de l'hôte : dernier état validé ; un tir interrompu est à rejouer
    netReady = true;
  } else {
    unsubs.push(net.watch(`${base}/game`, onTurnDoc), net.watch(`${base}/mv`, onFrame), net.watch(`${base}/live`, onLive),
      net.watch(`${base}/state`, v => { if (v === null && g && !g.over) fatal(Object.assign(new Error('Le salon a été fermé par l\'hôte.'), { gone: true })); }));
    newGame();                                                     // état provisoire verrouillé jusqu'au premier document de l'hôte
  }
}
async function bootOnline() {
  document.body.classList.add('online');
  const w = $('warn'); w.textContent = 'Connexion au salon…'; w.hidden = false;
  try {
    net = await import('./core/online.js');
    const r = await net.enter(ROOM), room = r.room, cfg = room.config;
    uid = r.uid; seat = r.seat;
    if (cfg.mode !== mode.id) { location.replace(`game.html?mode=${cfg.mode}&room=${ROOM}`); return; }
    roomOpts = normalize(cfg.opts, mode.id);                       // règles figées par l'hôte à la création du salon
    const ids = [room.seats.a, room.seats.b];
    peerUid = ids[1 - seat];
    [0, 1].forEach(i => { NAMES[i] = cleanName(room.players?.[ids[i]]?.name, 'Joueur ' + (i + 1)); });
    if (NAMES[0] === NAMES[1]) NAMES[1] += ' (2)';
    $('p0').firstElementChild.textContent = NAMES[0] + (seat === 0 ? ' (toi)' : '');
    $('p1').firstElementChild.textContent = NAMES[1] + (seat === 1 ? ' (toi)' : '');
    try { localStorage.setItem('billard_room', ROOM); } catch { }
    startNet(room);
  } catch (e) { fatal(e); }
}
async function leave() {                                           // départ volontaire
  $('leaveOv').hidden = true;
  try {
    if (isHost()) {
      if (g && !g.over) endOnline(1, `${NAMES[0]} a quitté la partie`);   // le résultat est publié avant la fermeture du salon
      await Promise.race([lastPub ?? sleep(0), sleep(1500)]);
      await Promise.race([net.removeRoom(ROOM), sleep(2500)]);
    } else if (isGuest() && g && !g.over) await Promise.race([net.markLeft(ROOM, uid), sleep(2000)]);
  } catch { }
  try { localStorage.removeItem('billard_room'); } catch { }
  location.href = './index.html';
}
document.addEventListener('click', e => {                          // tout lien « Menu » passe par la confirmation d'abandon
  const a = e.target.closest?.('a[href="./index.html"]');
  if (ONLINE && net && !fatalShown && a) { e.preventDefault(); if (!g || g.over) leave(); else $('leaveOv').hidden = false; }
});
$('leaveYes').addEventListener('click', leave);
$('leaveNo').addEventListener('click', () => { $('leaveOv').hidden = true; });

/* ============================ Boucle ============================ */
const MAXDT = 0.05;
function frame(now) {
  const dt = Math.min((now - last) / 1000, MAXDT);
  last = now;
  if (world && !paused) {
    if (state === 'aiming' || state === 'charging' || state === 'placingCueBall') {
      if (ONLINE) {      // seul l'hôte sanctionne le temps écoulé ; chrono suspendu si ma connexion ou celle de l'adversaire est perdue
        if (netReady && connected && !peerOffline && !(isGuest() && bgHost)) timeLeft -= dt;
        if (isGuest()) timeLeft = Math.max(0, timeLeft);
        ui.setTime(timeLeft); if (isHost() && timeLeft <= 0) timeout();
      } else { timeLeft -= dt; ui.setTime(timeLeft); if (timeLeft <= 0) timeout(); else if (cpuActive()) cpuStep(dt); }
    }
    if (state === 'ballsMoving') {
      if (isGuest()) { playback(dt); updateRoll(); }               // invité : aucune physique, lecture des images de l'hôte
      else {
        if (shot && !world.cue.out) shot.cx = world.cue.x;           // côté d'approche d'une poche du milieu (cueSide)
        update(world, dt, onPocket);
        shotTime += dt;
        updateRoll();
        if (isHost()) streamTick(dt);
        if (!isMoving(world) || shotTime > MAX_SHOT_TIME) endShot();
      }
    } else updateRoll();
    stepFx(dt);
  }
  if (world) render();
  requestAnimationFrame(frame);
}

function resize() {
  const w = stage.clientWidth - 8, h = stage.clientHeight - 8;
  if (w <= 0 || h <= 0) return;
  const s = Math.min(w / LW, h / LH), dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.style.width = LW * s + 'px'; cv.style.height = LH * s + 'px';
  cv.width = Math.round(LW * s * dpr); cv.height = Math.round(LH * s * dpr);
  layer.width = cv.width; layer.height = cv.height;
  const lg = layer.getContext('2d');
  lg.setTransform(cv.width / LW, 0, 0, cv.height / LH, 0, 0);
  drawTable(lg);
  if (world) render();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 150));
window.visualViewport?.addEventListener('resize', resize);
new ResizeObserver(resize).observe(stage);

if (!ONLINE) {
  const q = new URLSearchParams(location.search);          // ?new=1 (menu, après confirmation) : on remplace la sauvegarde, puis on nettoie l'URL
  if (q.get('new') === '1') { if (store) writeGame(store, mode.slot, null); q.delete('new'); try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); } catch { } }
}
if (ONLINE) bootOnline(); else newGame(store ? restore(store, mode.id, mode.slot) : null);    // sauvegarde absente/invalide/incompatible → null → nouvelle partie
resize();
requestAnimationFrame(frame);

const lockLandscape = () => { try { screen.orientation?.lock?.('landscape')?.catch(() => { }); } catch { } };
lockLandscape();
addEventListener('pointerdown', lockLandscape, { once: true });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
