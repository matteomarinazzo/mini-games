// Règle de course : feux, faux départ, tours (sens obligatoire via progression maximale), meilleurs tours, classement, résultats.
import { TRACK } from './track.js';

const LEN = TRACK.length, S0 = TRACK.startIdx * TRACK.ds;
const wrapS = (d) => d - LEN * Math.round(d / LEN);
/** Rang de grille du joueur (0 = pole) : milieu de grille, dernier s'il y a peu d'IA. */
export const playerIndex = (total) => (total <= 6 ? total - 1 : Math.floor(total / 2));
export const fmt = (t) => { if (t == null || !isFinite(t)) return '–'; const ms = Math.round(t * 1000), m = Math.floor(ms / 60000), s = (ms - m * 60000) / 1000; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3); };

/** entries[0] = joueur. Chaque entrée : { n, name, ph (physique), start (place de départ 1-based), player? } */
export function createRace({ laps, entries, waitAll = false, qualifying = false, penaltiesEnabled = true, multi = false, training = false }) {
  const E = entries.map((e) => { const p = e.ph.s - S0; return { ...e, p0: p, p, maxP: p, prevS: e.ph.s, k: 0, lapStart: null, best: null, last: null, fin: null, fl: 0, fp: 0 }; });
  const R = {
    phase: 'intro', clock: 0, t: 0, laps, E, waitAll, qualifying, afterPlayer: 0, lights: 0, hold: .5 + Math.random() * 1.5, falseStart: false, penalty: 0, dt: false, goMsg: 0, msg: '', results: null,
    penaltiesEnabled, penalties: 0, timePenalty: 0, lapPenalty: 0, cutTimer: 0, cutCooldown: 0, penaltyMsg: '', penaltyMsgT: 0, lapMsg: '', lapMsgT: 0, firstFin: false, doneT: 0, sinceFirst: 0
  };

  const projected = (e) => e.fin !== null ? e.fin : R.t + Math.max(0, laps * LEN - e.maxP) / Math.max(12, (e.maxP - e.p0) / Math.max(R.t, .1)) + (e.player ? R.timePenalty : (e.timePenalty || 0));
  // qualifications : vrais temps d'abord (meilleur en tête), puis les voitures sans temps (celles qui ont le plus avancé devant)
  const qualCmp = (a, b) => (a.best !== null && b.best !== null ? a.best - b.best : a.best !== null ? -1 : b.best !== null ? 1 : b.maxP - a.maxP);
  // course : les arrivées d'abord (plus de tours terminés, puis meilleur temps avec pénalités), puis progression
  const raceCmp = (a, b) => {
    const fla = a.fin !== null ? (a.fl ?? laps) : Math.max(0, a.k - 1);
    const flb = b.fin !== null ? (b.fl ?? laps) : Math.max(0, b.k - 1);
    if (a.fin !== null && b.fin !== null) {
      if (fla !== flb) return flb - fla;
      return a.fin - b.fin;
    }
    if (a.fin !== null && fla >= laps && b.fin === null) return -1;
    if (b.fin !== null && flb >= laps && a.fin === null) return 1;
    const sca = a.fin !== null ? a.fp : a.maxP;
    const scb = b.fin !== null ? b.fp : b.maxP;
    return (scb - sca) || (a.fin !== null && b.fin !== null ? a.fin - b.fin : a.fin !== null ? -1 : b.fin !== null ? 1 : 0);
  };
  R.rank = () => [...E].sort((a, b) => qualifying ? qualCmp(a, b) : raceCmp(a, b));

  R.addPenalty = (seconds, reason = 'Pénalité') => {
    const next = R.penalties + 1;
    const added = seconds || 3;
    R.penalties = next; R.timePenalty += added; R.lapPenalty += added;
    R.penaltyMsg = reason + ' : +' + added + ' s (' + R.timePenalty + ' s au total)'; R.penaltyMsgT = 3.2;
  };
  R.checkCut = (car, dt) => {
    R.cutCooldown = Math.max(0, R.cutCooldown - dt);
    if (!R.penaltiesEnabled || R.phase !== 'go') { R.cutTimer = 0; return; }
    const k = TRACK.K[car.idx] || 0;
    // Seule une coupe par l'intérieur compte : rouler large ou glisser vers l'extérieur n'est pas sanctionné.
    const cut = car.surf === 2 && Math.abs(car.lat) > TRACK.half + .35 && k * car.lat > .0028 && Math.abs(car.u) > 8;
    if (cut) R.cutTimer += dt; else R.cutTimer = Math.max(0, R.cutTimer - dt * 3);
    if (R.cutTimer >= .28 && R.cutCooldown <= 0) { R.addPenalty(); R.cutTimer = 0; R.cutCooldown = 4.5; }
  };

  R.update = (dt, thr) => {
    R.penaltyMsgT = Math.max(0, R.penaltyMsgT - dt); R.lapMsgT = Math.max(0, R.lapMsgT - dt);
    if (R.phase === 'intro' || R.phase === 'lights') {
      R.clock += dt;
      if (R.clock < 1) { R.phase = 'intro'; R.lights = 0; R.msg = 'Préparez-vous'; return; }
      const STEP = .7, all = 1 + 4 * STEP;                                  // un feu toutes les 0,7 s, puis attente variable
      R.phase = 'lights'; R.lights = Math.min(5, Math.floor((R.clock - 1) / STEP) + 1); R.msg = '';
      if (thr > .3 && !R.falseStart) { R.falseStart = true; if (!qualifying && !training) { R.dt = true; R.penaltyMsg = 'Faux départ : drive-through à effectuer'; R.penaltyMsgT = 4; } }                                   // faux départ : accélération bloquée un instant
      if (R.clock >= all + R.hold) { R.phase = 'go'; R.lights = 0; R.goMsg = 1.2;  }
      return;
    }
    if (R.phase !== 'go') return;
    R.t += dt; if (R.penalty > 0) R.penalty -= dt; if (R.goMsg > 0) R.goMsg -= dt;
    R.msg = R.penalty > 0 ? 'Faux départ ! Accélération bloquée' : R.goMsg > 0 ? 'GO !' : '';
    for (const e of E) {
      const d = wrapS(e.ph.s - e.prevS); e.prevS = e.ph.s; if (Math.abs(d) > 80) continue;
      e.p += d;
      if (e.p > e.maxP) {                                                  // seule la progression maximale compte : un demi-tour / aller-retour ne recompte pas
        const old = e.maxP; e.maxP = e.p;
        while (e.maxP >= e.k * LEN) {
          const tc = R.t - dt * (1 - (e.k * LEN - old) / (e.maxP - old));  // instant de franchissement interpolé
          if (e.k >= 1) {
            e.last = tc - e.lapStart + (e.player ? R.lapPenalty : 0); if (e.best === null || e.last < e.best) e.best = e.last;
            if (e.player) { R.lapMsg = 'Tour ' + e.k + ' · ' + fmt(e.last) + (e.best === e.last ? ' · Meilleur tour personnel !' : ''); R.lapMsgT = 3.2; }
          }
          e.lapStart = tc; if (e.player) R.lapPenalty = 0;
          // arrivée : tous les tours, ou dès le premier passage de ligne une fois que le premier a fini (course seulement)
          if (e.fin === null && (e.k === laps || (!qualifying && R.firstFin))) {
            const pen = e.player ? R.timePenalty : (e.timePenalty || 0);
            e.fin = tc + pen; e.fl = e.k; e.fp = e.k * LEN; R.firstFin = true; e.ph.raceFinished = true;
          }
          e.k++;
        }
      }
    }
    // multijoueur : un humain trop en retard après l'arrivée du premier est classé d'office (45 s)
    if (multi && !qualifying && R.firstFin && (R.sinceFirst += dt) >= 45) for (const e of E) if (e.fin === null && (e.player || e.human)) { e.fin = projected(e); e.fl = Math.max(0, e.k - 1); e.fp = e.maxP; e.ph.raceFinished = true; }
    if (E[0].fin !== null && waitAll) {
      if (!E.every((e) => e.fin !== null)) {
        R.afterPlayer += dt;
        if (R.afterPlayer >= 18) for (const e of E) if (e.fin === null) { e.fin = projected(e); e.ph.raceFinished = true; }   // sans tour terminé : pas de temps (best reste null)
      }
    }
    if (qualifying) { if (E[0].fin !== null && (!waitAll || E.every((e) => e.fin !== null))) { R.phase = 'finished'; R.msg = ''; R.results = build(); } }
    else if (E.every((e) => !(e.player || e.human) || e.fin !== null) && (R.doneT += dt) >= 1.2) { R.phase = 'finished'; R.msg = ''; R.results = build(); }   // fin quand tous les humains ont terminé
  };

  function finalizeAll() {
    for (const e of E) {
      if (e.fin === null) {
        const rem = laps * LEN - e.maxP;
        const spd = Math.max(14, (e.maxP - e.p0) / Math.max(R.t, 1));
        const pen = e.player ? R.timePenalty : (e.timePenalty || 0);
        if (rem <= 0) {
          e.fin = R.t + pen;
          e.fl = laps;
          e.fp = laps * LEN;
        } else if (rem < LEN) {
          e.fin = R.t + rem / spd + pen;
          e.fl = laps;
          e.fp = laps * LEN;
        } else {
          const lapsDown = Math.floor(rem / LEN);
          e.fl = Math.max(0, laps - lapsDown);
          e.fp = e.fl * LEN;
          const remInLap = rem - lapsDown * LEN;
          e.fin = R.t + remInLap / spd + pen;
        }
        e.ph.raceFinished = true;
      }
    }
  }

  function build() {
    finalizeAll();
    const isD = (e) => !qualifying && (e.player ? R.dt : !!e.dt), grp = (e) => (e.dnf ? 2 : isD(e) ? 1 : 0);   // DSQ : derrière les arrivants, devant les abandons
    const rk = R.rank().map((e, i) => [e, i]).sort((a, b) => grp(a[0]) - grp(b[0]) || a[1] - b[1]).map((x) => x[0]), wf = rk[0]?.fin || R.t;
    const rows = rk.map((e, i) => {
      let gap;
      if (qualifying) {
        gap = e.best === null ? '–' : i === 0 ? fmt(e.best) : '+' + (e.best - rk[0].best).toFixed(2) + ' s';
        return { place: i + 1, n: e.n, name: e.name, player: !!e.player, start: e.start, best: e.best, gap, done: e.fin !== null, dsq: isD(e) };
      }
      if (isD(e)) gap = 'DSQ'; else if (e.fin !== null) gap = i === 0 ? fmt(e.fin) : e.fl < rk[0].fl ? '+' + (rk[0].fl - e.fl) + (rk[0].fl - e.fl > 1 ? ' tours' : ' tour') : '+' + (e.fin - wf).toFixed(2) + ' s';
      else {
        const rem = laps * LEN - e.maxP;
        if (rem >= LEN) { const n = Math.floor(rem / LEN); gap = '+' + n + (n > 1 ? ' tours' : ' tour'); }
        else gap = '≈ +' + ((R.t - wf) + rem / Math.max(15, (e.maxP - e.p0) / Math.max(R.t, 1))).toFixed(1) + ' s';
      }
      return { place: i + 1, n: e.n, name: e.name, player: !!e.player, start: e.start, best: e.best, gap, done: e.fin !== null, dsq: isD(e) };
    });
    return { rows, win: rk[0]?.player === true };
  }
  R.build = build;
  return R;
}