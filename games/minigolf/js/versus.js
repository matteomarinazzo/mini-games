// Parties à plusieurs. « ia » : tout en local. « multi » : l’hôte simule, les clients envoient {yaw, power} et affichent l’état final publié (jamais de frame).
// Tour par tour : une seule balle simulée (celle qui joue), les autres sont des sphères-obstacles fixes. Rien n’est écrit dans la carrière solo.
(function () {
  'use strict';
  const M = window.Minigolf, P = M.physics, N = M.net, $ = (s) => document.getElementById(s), cfg = N.read();
  if (!cfg || cfg.mode === 'solo' || !M.maps[cfg.mapId]) return;   // game.js renvoie au menu
  const online = cfg.mode === 'multi';
  if (online ? !N.validCode(cfg.roomCode) : cfg.resume) { location.replace('index.html'); return; }
  const map = M.maps[cfg.mapId], H = map.holes.length, MAXS = 8, MINP = 8, cv = $('gl'), stage = $('stage'), G = $('gauge');
  let R = null; try { R = M.render.create(cv); } catch (e) { R = null; }
  if (!R) { document.body.innerHTML = '<p style="color:#f4ecd8;padding:2em;font:16px sans-serif">WebGL indisponible sur cet appareil.</p>'; return; }
  if (!online) N.write({ resume: true });   // rafraîchir une partie IA renvoie au menu

  const COL = [[1, 1, 1], [.86, .45, .34], [.46, .62, .84], [.92, .74, .34]], HEX = ['#ffffff', '#dc7357', '#759fd6', '#ebbd57'];
  let seats = [], me = 0, ci = [], S = null, world = null, ball = null, curH = -1, vis = [], host = !online, room = null, unsub = null, hbT = null, back = false;
  let simT = false, simC = 0, sunkT = 0, nextT = 0, endT = null, ended = false, aiT = null, aiPlan = null, aim = 0, dAim = 0, cam = 0, power = 0, act = null, gdrag = false, cdrag = false, cx = 0, modal = null, tt = 0, sent = -1, lastV = -1;
  let snaps = [], iv = null, rAim = null, raim = 0, raimTid = -1, aimT = 0, aimSentTid = -1, aimSent = 0, liveT = 0, liveK = 0, liveKr = -1, hh = null;   // flux temps réel : visée (aim) et trajectoire (live)
  const keys = {}, sum = (a) => a.reduce((x, y) => x + y, 0), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), A = (v) => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
  const upd = (u) => { if (!online) return Promise.resolve(); try { return Promise.resolve(N.F.fb.updateRoom(N.gameIdOf(cfg.roomCode), u)).catch(() => { }); } catch (e) { return Promise.resolve(); } };

  // ── sièges ──
  function setSeats(list) {
    let na = 0; seats = list.map((s) => { const ai = !s.u; return { u: s.u || '', n: ai ? (++na === 1 ? 'IA' : 'IA ' + na) : String(s.n || 'Joueur'), ai }; });
    me = online ? seats.findIndex((s) => s.u === N.F.uid) : 0;
    ci = seats.map((_, i) => i % 4);   // couleur = siège (siège 0 = hôte = blanc) : identique pour tous les joueurs
  }
  const auto = (i) => {   // joué par l’IA : siège IA, ou humain parti / hors ligne
    const s = seats[i]; if (s.ai) return true; if (!online) return false;
    const p = room && room.players && room.players[s.u]; return !(s.u === N.F.uid || (p && N.isPresent(p)));
  };
  const myTurn = () => !!S && S.ph === 'aim' && S.turn === me && !S.d[me] && sent !== S.tid && !simT && !ended;
  const startPos = (h) => { const st = map.holes[h].start, n = seats.length; return seats.map((_, i) => [st[0] + (i - (n - 1) / 2) * .14, st[1]]); };

  // ── visée : cible directe, ou coin rentrant du terrain si la coupe n’est pas en ligne droite ──
  function clear(a, b, poly) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / .1); for (let k = 1; k < n; k++) { const t = k / n; if (!P.inPoly(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, poly)) return false; } return true; }
  function target(pos, hd) {
    if (clear(pos, hd.cup, hd.poly)) return hd.cup;
    const p = hd.poly, n = p.length; let best = null, bd = 1e9;
    for (let i = 0; i < n; i++) {
      const a = p[(i + n - 1) % n], v = p[i], b = p[(i + 1) % n];
      if (((v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0])) * hd.A >= 0) continue;   // coin convexe
      const l1 = Math.hypot(a[0] - v[0], a[1] - v[1]), l2 = Math.hypot(b[0] - v[0], b[1] - v[1]), sx = (a[0] - v[0]) / l1 + (b[0] - v[0]) / l2, sz = (a[1] - v[1]) / l1 + (b[1] - v[1]) / l2, sl = Math.hypot(sx, sz) || 1;
      const t = [v[0] - sx / sl * .5, v[1] - sz / sl * .5];
      if (!P.inPoly(t[0], t[1], p) || !clear(pos, t, p)) continue;
      const d = Math.hypot(t[0] - pos[0], t[1] - pos[1]) + Math.hypot(hd.cup[0] - t[0], hd.cup[1] - t[1]); if (d < bd) { bd = d; best = t; }
    }
    return best || hd.cup;
  }
  let aimHole = -1;   // visée neutre (droit devant) au premier tour du joueur sur chaque trou, puis il garde sa visée : rien n’est pointé vers la coupe
  function myAim() { if (S.turn === me && aimHole !== S.h) { aim = world.hole.yaw || 0; aimHole = S.h; } }
  function defAim(i) {
    const hd = world.hole, pos = S.p[i]; if (hd.yaw !== undefined && S.c[i] === 0) return hd.yaw;
    const t = target(pos, hd); return Math.atan2(t[0] - pos[0], t[1] - pos[1]);
  }

  // ── état partagé S : { v, tid, h, turn, ph:'aim'|'next'|'end', c (coups du trou), s (coups par trou fini), p (positions), d (fini), ev, ay, ai } ──
  function norm(r) {
    const q = (i) => r.p && r.p[i];
    return {
      v: +r.v || 0, tid: +r.tid || 0, h: +r.h || 0, turn: +r.turn || 0, ph: r.ph === 'next' || r.ph === 'end' ? r.ph : 'aim',
      c: seats.map((_, i) => +(r.c && r.c[i]) || 0), s: seats.map((_, i) => A(r.s && r.s[i]).map(Number)),
      p: seats.map((_, i) => [+(q(i) && q(i)[0]) || 0, +(q(i) && q(i)[1]) || 0]), d: seats.map((_, i) => +(r.d && r.d[i]) ? 1 : 0),
      ev: String(r.ev || ''), ay: +r.ay || 0, ai: +r.ai ? 1 : 0,
    };
  }
  function pub() {
    S.v++; lastV = S.v; if (S.ev) toast(S.ev, 1700);
    upd(S.ph === 'end' ? { st: S, state: 'ended' } : { st: S, state: 'playing' });
  }
  function loadHole(h) { curH = h; world = P.createWorld(map.holes[h]); R.load(world.hole); vis = S.p.map((p) => ({ x: p[0], z: p[1] })); }
  function onState(r) {   // clients (et hôte qui reprend) : afficher, ne pas resimuler
    const s2 = norm(r); if (S && s2.v <= lastV) return;
    const old = S; lastV = s2.v; S = s2;
    if (S.ph !== 'end' && ended) { ended = false; endT = null; if (modal === 'mRank') closeModal(); }   // la partie a été relancée
    if (S.h !== curH) loadHole(S.h);
    if (!old || old.tid !== S.tid) { snaps = []; liveKr = -1; dAim = defAim(S.turn); myAim(); }
    if (S.ph === 'end' && endT === null && !ended) endT = 1.8;
    if (S.ev) toast(S.ev, 1700);
    if (modal === 'mWait') closeModal();
    hud();
  }

  // ── hôte : simulation ──
  function prep() { world.balls.length = 0; wb = seats.map((_, i) => S.d[i] ? null : P.addBall(world, S.p[i][0], S.p[i][1])); ball = wb[S.turn]; }
  let wb = [];   // siège → balle du monde (toutes les balles non finies sont simulées, elles se percutent)
  const prof = [], profOf = (i) => prof[i] || (prof[i] = M.ai.profile());   // un profil par siège joué par l’IA, tiré au début de la partie
  function planAI() { aiPlan = M.ai.plan(world, ball, profOf(S.turn)); S.ai = 1; S.ay = aiPlan.yaw; aiT = .9; }
  function enterAim(ev) {
    S.ph = 'aim'; S.tid++; S.ev = ev || ''; S.ai = 0; S.ay = 0; aiT = null; aiPlan = null; simT = false;
    prep(); dAim = defAim(S.turn); myAim();
    hud(); pub();
  }
  function hostInit() {
    S = { v: S ? S.v + 1 : 0, tid: S ? S.tid + 1 : 0, h: 0, turn: 0, ph: 'aim', c: seats.map(() => 0), s: seats.map(() => []), p: startPos(0), d: seats.map(() => 0), ev: '', ay: 0, ai: 0 };
    ended = false; endT = null; nextT = 0; sent = -1; prof.length = 0; aimHole = -1; loadHole(0); if (modal === 'mWait') closeModal(); enterAim('');
  }
  function resumeHost() { simT = false; aiT = null; aiPlan = null; if (S.ph === 'aim') prep(); else if (S.ph === 'next') nextT = 1.2; }
  /** Entrée unique d’un tir (humain local, client distant ou IA). */
  function submit(i, yaw, pw) {
    if (!host || !S || S.ph !== 'aim' || i !== S.turn || simT || S.d[i] || !(pw >= 1)) return;
    S.c[i]++; simT = true; simC = 0; sunkT = 0; liveT = 0; aiT = null; P.hit(ball, yaw, Math.min(100, pw)); hud(); pubLive();
  }
  function simStep(dt) {
    P.step(world, dt); simC += dt; if ((liveT += dt) >= .066) { liveT = 0; pubLive(); }
    const still = wb.every((b) => !b || b.rest || b.sunk); if (ball.sunk) sunkT += dt;   // le coup finit quand toutes les balles sont arrêtées
    if (((ball.sunk ? sunkT > .7 : ball.oob || ball.rest) && still) || simC > 20) resolve(ball.sunk ? 'sunk' : ball.oob ? 'oob' : 'rest');
  }
  function resolve(kind) {
    pubLive(); simT = false; const t = S.turn, nm = seats[t].n; let ev = '';
    if (kind === 'oob') { S.c[t]++; ev = `${nm} : hors limites, +1 coup`; const p = P.recover(world, ball); S.p[t] = [p[0], p[1]]; } else S.p[t] = [ball.x, ball.z];
    seats.forEach((_, i) => {   // balles poussées : nouvelle position, sans pénalité ; une balle poussée dans la coupe est rentrée
      const b = wb[i]; if (i === t || !b) return;
      if (b.sunk) { S.d[i] = 1; S.c[i] = Math.max(1, S.c[i]); ev += (ev ? ' · ' : '') + `${seats[i].n} tombe dans le trou`; }
      else if (b.oob) { const p = P.recover(world, b); S.p[i] = [p[0], p[1]]; } else S.p[i] = [b.x, b.z];
    });
    if (kind === 'sunk') { S.d[t] = 1; ev = `${nm} : dans le trou en ${S.c[t]} coup${S.c[t] > 1 ? 's' : ''} !`; }
    else if (S.c[t] >= MAXS) { S.d[t] = 1; ev = `${nm} : ${MAXS} coups, il passe`; }
    if (S.d.every((x) => x)) return holeDone(ev);
    let n = t; do n = (n + 1) % seats.length; while (S.d[n]);
    S.turn = n; enterAim(ev);
  }
  function holeDone(ev) {
    S.s = seats.map((_, i) => S.s[i].concat(Math.min(S.c[i], MAXS))); S.ev = ev;
    if (S.h + 1 >= H) { S.ph = 'end'; endT = 1.8; } else { S.ph = 'next'; nextT = 1.8; }
    hud(); pub();
  }
  function nextHole() { S.h++; S.c = seats.map(() => 0); S.d = seats.map(() => 0); S.p = startPos(S.h); S.turn = S.h % seats.length; loadHole(S.h); enterAim(''); }

  // ── temps réel : l’hôte publie les positions pendant le coup, les clients les rejouent avec ~120 ms de retard ──
  function pubLive() {
    if (!online || !host || !S || !ball) return;
    const b = []; seats.forEach((_, i) => { const w = wb[i]; b.push(w ? +w.x.toFixed(3) : 0, w ? +w.y.toFixed(3) : 0, w ? +w.z.toFixed(3) : 0); });
    upd({ live: { tid: S.tid, k: ++liveK, g: ball.ground && !ball.sunk ? 1 : 0, b } });
  }
  const simV = () => !host && !!S && S.ph === 'aim' && snaps.length > 0;
  function interp() {
    const rt = performance.now() - 120; while (snaps.length > 2 && snaps[1].t <= rt) snaps.shift();
    const a = snaps[0], b = snaps[1];
    if (!b || rt >= b.t) { const z = b || a; return { p: z.p, g: z.g, vx: 0, vz: 0 }; }
    const f = Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))), ds = Math.max(.016, (b.t - a.t) / 1000), t = S.turn;
    return { p: a.p.map((q, i) => [0, 1, 2].map((k) => q[k] + (b.p[i][k] - q[k]) * f)), g: f < .5 ? a.g : b.g, vx: (b.p[t][0] - a.p[t][0]) / ds, vz: (b.p[t][2] - a.p[t][2]) / ds };
  }

  // ── affichage ──
  function toast(t, ms = 1500) { const e = $('toast'); e.style.top = 'auto'; e.style.bottom = '6%'; e.textContent = t; e.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('on'), ms); }
  function setPower(p) { power = p; $('gfill').style.clipPath = `inset(0 0 ${100 - p}% 0)`; $('gval').textContent = Math.round(p); }
  function hud() {
    if (!S) return;
    const pg = $('hProg'), sc = $('hTot');
    $('hHole').textContent = `${Math.min(S.h + 1, H)}/${H}`; $('hStr').textContent = S.c[S.turn]; sc.textContent = seats[S.turn].n; sc.previousElementSibling.textContent = 'Joue'; sc.parentNode.classList.remove('ok');
    if (pg.childElementCount !== H) pg.innerHTML = '<i></i>'.repeat(H);
    Array.prototype.forEach.call(pg.children, (e, k) => { e.className = k < S.h ? 'done' : k === S.h ? 'cur' : ''; });
    $('bRestart').hidden = online && !host;
    const ba = $('bRank'); ba.disabled = online && !host; ba.textContent = ba.disabled ? 'En attente de l’hôte' : 'Rejouer';
    const row = (cls, a, b, c, d) => { const r = document.createElement('div'); r.className = cls; const dot = document.createElement('i'); if (a) dot.style.background = a; const n = document.createElement('span'), e = document.createElement('em'), t = document.createElement('b'); n.textContent = b; e.textContent = c; t.textContent = d; r.append(dot, n, e, t); return r; };
    $('board').replaceChildren(row('hd', '', 'Joueur', 'Trou', 'Total'), ...seats.map((s, i) => row((i === S.turn && S.ph !== 'end' ? 'on' : '') + (S.d[i] ? ' dn' : ''), HEX[ci[i]], s.n, S.c[i], sum(S.s[i]) + (S.ph === 'aim' ? Math.min(S.c[i], MAXS) : 0))));
  }
  function pos(i) {
    if (host && simT && wb[i]) return { x: wb[i].x, y: wb[i].y, z: wb[i].z };
    if (iv && iv.p[i]) return { x: iv.p[i][0], y: iv.p[i][1], z: iv.p[i][2] };
    const v = vis[i], g = world.hole.G(v.x, v.z); return { x: v.x, y: (isFinite(g) ? g : 0) + P.R, z: v.z };
  }
  function openModal(id) { for (const m of document.querySelectorAll('.modal')) m.hidden = m.id !== id; modal = id; act = null; gdrag = cdrag = false; setPower(0); }
  function closeModal() { for (const m of document.querySelectorAll('.modal')) m.hidden = true; modal = null; }
  function showEnd() {
    if (ended) return; ended = true;
    const tot = seats.map((_, i) => sum(S.s[i])), best = Math.min(...tot), win = seats.filter((_, i) => tot[i] === best).map((s) => s.n);
    const ord = seats.map((_, i) => i).sort((a, b) => tot[a] - tot[b] || a - b), rk = []; let r = 0, pv = null;
    ord.forEach((i, k) => { if (tot[i] !== pv) { r = k + 1; pv = tot[i]; } rk[i] = r; });   // égalité : même rang, le suivant saute
    const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; }, cp = (n) => `${n} coup${n > 1 ? 's' : ''}`;
    $('rMap').textContent = map.name;
    const hr = el('tr');['Rang', 'Joueur', 'Coups'].concat(Array.from({ length: H }, (_, k) => 'T' + (k + 1))).forEach((t, k) => hr.append(el('th', k < 3 ? 'k' + k : '', t)));
    $('rHead').replaceChildren(hr);
    $('rBody').replaceChildren(...ord.map((i) => {
      const tr = el('tr', i === me ? 'me' : ''), c0 = el('td', 'k0'), c1 = el('td', 'k1'), nm = el('div', 'nm');
      c0.append(el('span', 'rk r' + Math.min(rk[i], 4), rk[i])); nm.append(el('span', 'nn', seats[i].n)); if (i === me && seats[i].n !== 'Toi') nm.append(el('span', 'tag', 'Toi')); c1.append(nm);
      tr.append(c0, c1, el('td', 'k2', tot[i])); for (let k = 0; k < H; k++) tr.append(el('td', '', S.s[i][k] !== undefined ? S.s[i][k] : '–'));
      return tr;
    }));
    const hs = S.s[me] || [], mine = tot[me]; let bi = 0, wi = 0; hs.forEach((v, k) => { if (v < hs[bi]) bi = k; if (v > hs[wi]) wi = k; });
    const info = [[win.length > 1 ? 'Résultat' : 'Vainqueur', win.length > 1 ? 'Égalité' : win[0]], ['Ton total', cp(mine)], ['Écart avec le premier', mine === best ? 'Premier' : '+' + cp(mine - best)],
    ['Ton meilleur · ton pire trou', hs.length ? `Meilleur : trou ${bi + 1} · ${cp(hs[bi])}\nPire : trou ${wi + 1} · ${cp(hs[wi])}` : '–']];
    $('rInfo').replaceChildren(...info.map(([l, v]) => { const d = el('div', 'ri'); d.append(el('small', '', l), el('b', '', v)); return d; }));
    hud(); openModal('mRank');
  }
  function bye(msg) {
    N.clearSavedRoom(); if (unsub) unsub(); unsub = null; clearInterval(hbT);
    $('wTitle').textContent = msg; $('wTxt').textContent = ''; openModal('mWait');
  }
  async function leave() {
    if (unsub) unsub(); unsub = null; clearInterval(hbT);
    if (online && N.F.uid) {
      const fin = !!S && S.ph === 'end';
      try { await Promise.race([N.leaveRoom(cfg.roomCode, !fin), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* ok */ }
      if (fin) N.clearSavedRoom();
    }
    location.href = 'index.html';
  }

  // ── boucle ──
  function update(dt) {
    if (host) {
      if (S.ph === 'aim') {
        if (simT) simStep(dt);
        else if (aiT === null && auto(S.turn)) aiT = .4;   // courte pause, puis calcul du tir
        else if (aiT !== null) {
          aiT -= dt;
          if (aiT <= 0) { if (!aiPlan) { planAI(); S.ev = ''; pub(); } else { aiT = null; const pl = aiPlan; aiPlan = null; submit(S.turn, pl.yaw, pl.power); } }   // visée visible .9 s, puis tir par la même entrée qu’un joueur
        }
      } else if (S.ph === 'next') { if ((nextT -= dt) <= 0) nextHole(); }
    }
    if (endT !== null && !ended) { endT -= dt; if (endT <= 0) showEnd(); }
    if (myTurn() && !modal) aim += ((keys.l ? 1 : 0) - (keys.r ? 1 : 0)) * 1.5 * dt;
    if (online && myTurn()) {   // ma visée est diffusée (~10 Hz) pour que les autres voient la flèche tourner
      aimT += dt;
      if (aimT > .1 && (aimSentTid !== S.tid || Math.abs(wrap(aim - aimSent)) > .002)) { aimT = 0; aimSentTid = S.tid; aimSent = aim; upd({ aim: { tid: S.tid, yaw: +aim.toFixed(3) } }); }
    }
    const ry = rAim && rAim.tid === S.tid ? +rAim.yaw || 0 : (S.ai ? S.ay : dAim);
    if (raimTid !== S.tid) { raim = ry; raimTid = S.tid; } else raim += wrap(ry - raim) * (1 - Math.exp(-16 * dt));
    iv = simV() ? interp() : null;
    const k = 1 - Math.exp(-9 * dt); S.p.forEach((p, i) => { const v = vis[i]; if (host && simT && wb[i]) { v.x = wb[i].x; v.z = wb[i].z; } else if (iv && iv.p[i] && !S.d[i]) { v.x = iv.p[i][0]; v.z = iv.p[i][2]; } else { v.x += (p[0] - v.x) * k; v.z += (p[1] - v.z) * k; } });
    const hs = host && simT, vx = hs ? ball.vx : iv ? iv.vx : 0, vz = hs ? ball.vz : iv ? iv.vz : 0, mov = Math.hypot(vx, vz) > .6, tg = mov ? Math.atan2(vx, vz) : (S.turn === me && S.ph === 'aim' ? aim : raim);
    cam += wrap(tg - cam) * (1 - Math.exp(-(mov ? 3 : 9) * dt));
  }
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!S || !world) return;
    if (!R.lost && (online || !modal)) update(dt);
    G.hidden = !myTurn();
    const t = S.turn, sim = host && simT, pa = pos(t), others = [];
    seats.forEach((_, i) => { if (i !== t && !S.d[i]) { const q = pos(i); others.push({ x: q.x, y: q.y, z: q.z, c: COL[ci[i]] }); } });
    R.frame({ x: pa.x, y: pa.y, z: pa.z, cam, aim: t === me ? aim : raim, arrow: S.ph === 'aim' && !simT && !iv && (t === me ? sent !== S.tid : (S.ai === 1 || !!(rAim && rAim.tid === S.tid))), shadow: sim ? ball.ground && !ball.sunk : iv ? iv.g === 1 : !S.d[t], gy: world.hole.G(pa.x, pa.z), tint: COL[ci[t]], others });
  }

  // ── entrées : un seul pointeur actif ──
  const canAim = () => myTurn() && !modal;
  function shoot(p) {
    sent = S.tid;
    if (host) submit(me, aim, p);
    else { try { Promise.resolve(N.F.fb.updateRoom(N.gameIdOf(cfg.roomCode), { act: { tid: S.tid, seat: me, u: seats[me].u, yaw: aim, power: p } })).catch(() => { sent = -1; }); } catch (e) { sent = -1; } }
  }
  const RQ = matchMedia('(orientation: portrait) and (max-width: 700px) and (pointer: coarse)');   // = règle de pivot de game.css
  const setP = (e) => { let v; if (RQ.matches) v = (innerWidth - e.clientX - G.offsetTop) / G.offsetHeight; else { const r = G.getBoundingClientRect(); v = (e.clientY - r.top) / r.height; } setPower(Math.round(Math.max(0, Math.min(100, v * 100)))); };
  G.addEventListener('pointerdown', (e) => { if (act !== null || e.button > 0 || !canAim()) return; act = e.pointerId; gdrag = true; try { G.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } setP(e); e.preventDefault(); });
  G.addEventListener('pointermove', (e) => { if (e.pointerId === act && gdrag) setP(e); });
  const gend = (e) => { if (e.pointerId !== act || !gdrag) return; gdrag = false; act = null; const p = power; setPower(0); if (e.type === 'pointerup' && p >= MINP && canAim()) shoot(p); };
  G.addEventListener('pointerup', gend); G.addEventListener('pointercancel', gend); G.addEventListener('lostpointercapture', gend);
  cv.addEventListener('pointerdown', (e) => { if (act !== null || e.button > 0) return; act = e.pointerId; cdrag = true; cx = RQ.matches ? e.clientY : e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } e.preventDefault(); });
  cv.addEventListener('pointermove', (e) => { if (e.pointerId !== act || !cdrag) return; const nx = RQ.matches ? e.clientY : e.clientX, dx = nx - cx; cx = nx; if (canAim()) aim -= dx * .005; });
  const cend = (e) => { if (e.pointerId === act && cdrag) { act = null; cdrag = false; } };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(ev, cend);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  const K = { arrowleft: 'l', a: 'l', q: 'l', arrowright: 'r', d: 'r' };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; const k = e.key.toLowerCase();
    if (k === 'escape') { if (modal === 'mPause' || modal === 'mRules') closeModal(); else if (!modal) openModal('mPause'); return; }
    if (K[k]) { keys[K[k]] = true; e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { const a = K[e.key.toLowerCase()]; if (a) keys[a] = false; });
  addEventListener('blur', () => { keys.l = keys.r = false; });
  $('bPause').onclick = () => openModal('mPause'); $('bRules').onclick = () => openModal('mRules'); $('bRulesClose').onclick = closeModal; $('bResume').onclick = closeModal;
  $('bRestart').onclick = () => { if (host) { closeModal(); hostInit(); } };
  $('bMenu').onclick = $('bMenu2').onclick = $('bMenu3').onclick = $('bMenu4').onclick = leave;
  $('bRank').onclick = () => { if (!host) return; closeModal(); hostInit(); };   // même porte, même map, mêmes sièges
  if (window.ResizeObserver) new ResizeObserver(() => R.resize()).observe(stage); addEventListener('resize', () => R.resize());

  // ── room (multi) : l’hôte est le leader présent, sinon le plus ancien présent ──
  function onRoom(d) {
    if (!d) return bye('La room a été fermée.');
    if (!d.players || !d.players[N.F.uid]) return bye('Tu as quitté la room.');
    room = d; rAim = d.aim || null;
    if (!seats.length) {
      const sl = A(d.seats); if (!sl.length) return;
      setSeats(sl); if (me < 0) return bye('Tu n’es pas dans cette partie.');
      $('wTitle').textContent = 'En attente de l’hôte…';
    }
    if (d.players[N.F.uid].away && !back) { back = true; upd({ [`players/${N.F.uid}/away`]: false, [`players/${N.F.uid}/lastSeen`]: N.ts() }); }
    if (!S && d.st) onState(d.st);
    const ih = N.hostOf(d) === N.F.uid;
    if (ih && !host) { host = true; if (S) resumeHost(); } else if (!ih && host) { host = false; simT = false; }
    if (hh !== host) { hh = host; hud(); }
    if (host && !S) hostInit();
    if (!host && d.st) onState(d.st);
    const l = d.live;
    if (!host && S && l && l.tid === S.tid && l.k > liveKr) {   // trajectoire en direct de l’hôte
      const b = A(l.b).map(Number);
      if (b.length === seats.length * 3 && b.every(isFinite)) { liveKr = l.k; snaps.push({ t: performance.now(), g: +l.g ? 1 : 0, p: seats.map((_, i) => [b[i * 3], b[i * 3 + 1], b[i * 3 + 2]]) }); if (snaps.length > 40) snaps.shift(); }
    }
    const a = d.act;
    if (host && a && S.ph === 'aim' && !simT && a.tid === S.tid && a.seat === S.turn && a.u === seats[S.turn].u && !S.d[S.turn]) submit(S.turn, +a.yaw || 0, Math.max(0, Math.min(100, +a.power || 0)));
  }

  if (online) {
    $('wTitle').textContent = 'Connexion…'; $('wTxt').textContent = ''; openModal('mWait');
    N.initFb().then((ok) => {
      if (!ok) return bye('Connexion impossible.');
      unsub = N.watch(cfg.roomCode, onRoom); N.beat(cfg.roomCode); hbT = setInterval(() => N.beat(cfg.roomCode), N.HB);
    }).catch(() => bye('Connexion impossible.'));
  } else {
    setSeats([{ u: 'moi', n: 'Toi' }].concat(Array.from({ length: cfg.aiCount }, (_, i) => ({ u: '', n: 'IA ' + (i + 1) }))));
    hostInit();
  }
  requestAnimationFrame(frame);
})();
