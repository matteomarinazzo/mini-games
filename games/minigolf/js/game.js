// Orchestration de la partie solo : trous, entrées, HUD, pause, fin. La physique est dans core/physics.js, les données dans core/maps.js.
(function () {
  'use strict';
  const M = window.Minigolf, P = M.physics, C = M.career, N = M.net, $ = (s) => document.getElementById(s);
  const cfg = N.read();
  if (!cfg || !M.maps[cfg.mapId]) { location.replace('index.html'); return; }
  if (cfg.mode !== 'solo') return;   // IA et room : js/versus.js
  const map = M.maps[cfg.mapId], H = map.holes.length, NXT = M.mapList[C.idx(map.id) + 1], GOAL = NXT ? Math.max(0, NXT.need - C.sumBefore(map.id)) : C.threshold(H), MAXS = 8, MINP = 8, cv = $('gl'), stage = $('stage');
  let R = null; try { R = M.render.create(cv); } catch (e) { R = null; }
  if (!R) { document.body.innerHTML = '<p style="color:#f4ecd8;padding:2em;font:16px sans-serif">WebGL indisponible sur cet appareil.</p>'; return; }
  let run, world, ball, aim = 0, cam = 0, st = 'aim', timer = 0, power = 0, act = null, gdrag = false, cdrag = false, cx = 0, modal = null, tt = 0;
  const keys = {}, sum = (a) => a.reduce((x, y) => x + y, 0), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function hud() {
    const sc = C.score(run.s), pg = $('hProg');
    $('hHole').textContent = `${Math.min(run.h + 1, H)}/${H}`; $('hStr').textContent = run.c; $('hTot').textContent = sc; $('hGoal').textContent = GOAL;
    $('hTot').parentNode.classList.toggle('ok', sc >= GOAL);
    if (pg.childElementCount !== H) pg.innerHTML = '<i></i>'.repeat(H);
    Array.prototype.forEach.call(pg.children, (e, k) => { e.className = k < run.h ? 'done' : k === run.h ? 'cur' : ''; });
  }
  function toast(t, ms = 1500) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => e.classList.remove('on'), ms); }
  function save() { if (ball) { run.x = ball.x; run.z = ball.z; } run.yaw = aim; C.saveRun(map.id, run); }
  function setPower(p) { power = p; $('gfill').style.clipPath = `inset(0 0 ${100 - p}% 0)`; $('gval').textContent = Math.round(p); }
  function load(i, at) {
    const hd = map.holes[i]; world = P.createWorld(hd); R.load(world.hole);
    const s = at ? [at.x, at.z] : hd.start; ball = P.addBall(world, s[0], s[1]);
    aim = at && Number.isFinite(at.yaw) ? at.yaw : (hd.yaw !== undefined ? hd.yaw : 0);
    cam = aim; st = 'aim'; setPower(0); hud();
  }
  function newRun() { run = { h: 0, s: [], c: 0, done: false, x: null, z: null, yaw: null }; }
  function openModal(id) { for (const m of document.querySelectorAll('.modal')) m.hidden = m.id !== id; modal = id; act = null; gdrag = cdrag = false; setPower(0); }
  function closeModal() { for (const m of document.querySelectorAll('.modal')) m.hidden = true; modal = null; }
  function endHole(ok) {
    const sc = Math.min(run.c, MAXS); run.s.push(sc); run.c = 0; run.h++; run.x = run.z = null; run.yaw = null;
    toast(ok ? `Dans le trou ! ${sc} coup${sc > 1 ? 's' : ''} · +${C.pts(sc)} pt${C.pts(sc) > 1 ? 's' : ''}` : `${MAXS} coups : 0 point, on passe au suivant`, 1700);
    if (run.h >= H) { const t = C.score(run.s), r = C.finish(map.id, t); run.done = true; run.total = t; run.rec = r.record; st = 'fin'; } else st = 'next';
    timer = 1.6; C.saveRun(map.id, run); hud();
  }
  function showEnd() {
    const sc = C.score(run.s), b = C.best(map.id), g = $('eGoal');
    $('eTot').textContent = `Score : ${sc} pts`;
    $('eSub').textContent = `${sum(run.s)} coups sur ${H} trous (chaque trou : 7 − coups)`;
    const nx = NXT, bn = $('bNext'), cu = C.cumul(map.id), have = nx ? cu : 0, got = !nx || cu >= nx.need;
    g.className = 'goal ' + (got ? 'ok' : 'ko'); 
    if (!nx) g.textContent = `Total des meilleurs scores : ${cu} pts. Tu as terminé toutes les maps.`;
    else if (got) g.textContent = M.maps[nx.id] ? `✔ Total ${cu}/${nx.need} pts : ${nx.name} est débloquée.` : `✔ Total ${cu}/${nx.need} pts : ${nx.name} est débloquée (bientôt disponible).`;
    else g.textContent = `✘ Total ${cu}/${nx.need} pts : il manque ${nx.need - cu} pt${nx.need - cu > 1 ? 's' : ''} pour ${nx.name}. Fais au moins ${GOAL} pts ici, ou améliore une map précédente.`;
    bn.hidden = !(nx && got && M.maps[nx.id]); if (nx) { bn.textContent = `Jouer ${nx.name}`; bn.onclick = () => { N.write({ mapId: nx.id, resume: false }); location.reload(); }; }
    $('eBest').textContent = (run.rec ? 'Nouveau record : ' : 'Meilleur score : ') + b + ' pts'; openModal('mEnd');
  }
  function restart() { C.clearRun(map.id); newRun(); load(0); C.saveRun(map.id, run); closeModal(); }
  function shoot(p) { run.c++; save(); P.hit(ball, aim, p); st = 'roll'; hud(); }
  const canAim = () => st === 'aim' && !modal;

  function update(dt) {
    if (st === 'aim') { world.hole.wt += dt; aim += ((keys.l ? 1 : 0) - (keys.r ? 1 : 0)) * 1.5 * dt; }
    else if (st === 'roll') {
      P.step(world, dt);
      if (ball.sunk) { st = 'sunk'; timer = .7; }
      else if (ball.oob) {
        run.c++; toast('Hors limites : +1 coup'); const p = P.recover(world, ball); P.place(world, ball, p[0], p[1]); hud();
        if (run.c >= MAXS) endHole(false); else { st = 'aim'; save(); }
      } else if (ball.rest) { if (run.c >= MAXS) endHole(false); else { st = 'aim'; save(); } }
    } else if (st === 'sunk') { timer -= dt; if (timer <= 0) endHole(true); }
    else if (st === 'next' || st === 'fin') { timer -= dt; if (timer <= 0) { if (st === 'fin') { st = 'end'; showEnd(); } else { load(run.h); save(); } } }
    const sp = Math.hypot(ball.vx, ball.vz), tg = st === 'roll' && sp > .6 ? Math.atan2(ball.vx, ball.vz) : aim;
    cam += wrap(tg - cam) * (1 - Math.exp(-(st === 'roll' ? 3 : 9) * dt));
  }
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!modal && !R.lost) update(dt);
    R.frame({ x: ball.x, y: ball.y, z: ball.z, cam, aim, arrow: st === 'aim', gy: world.hole.G(ball.x, ball.z), shaft: !!ball.shaft, wt: world.hole.wt });
  }

  // entrées : un seul pointeur actif (le deuxième doigt est ignoré)
  const G = $('gauge');
  const RQ = matchMedia('(orientation: portrait) and (max-width: 700px) and (pointer: coarse)');   // = règle de pivot de game.css
  const setP = (e) => { const r = G.getBoundingClientRect(), v = RQ.matches ? (r.right - e.clientX) / (r.width || 1) : (e.clientY - r.top) / (r.height || 1); setPower(Math.round(Math.max(0, Math.min(100, v * 100)))); };
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
  $('bRestart').onclick = restart; $('bAgain').onclick = restart; $('bMenu').onclick = $('bMenu2').onclick = () => { location.href = 'index.html'; };
  const updateVP = () => { document.documentElement.style.setProperty('--vh', window.innerHeight + 'px'); document.documentElement.style.setProperty('--vw', window.innerWidth + 'px'); };
  updateVP(); addEventListener('resize', updateVP); addEventListener('orientationchange', updateVP);
  if (window.ResizeObserver) new ResizeObserver(() => R.resize()).observe(stage); addEventListener('resize', () => R.resize());

  const saved = C.loadRun(map.id, H);
  if (cfg.resume && saved) run = saved; else { C.clearRun(map.id); newRun(); }
  N.write({ resume: true });
  if (run.done) { load(H - 1); st = 'end'; showEnd(); } else load(run.h, Number.isFinite(run.x) && Number.isFinite(run.z) ? run : null);
  requestAnimationFrame(frame);
})();
