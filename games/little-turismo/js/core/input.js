// Clavier + tactile → { throttle 0–1, brake 0–1, steer -1–1 }
const KEYS = { arrowleft: 'l', q: 'l', a: 'l', arrowright: 'r', d: 'r', arrowup: 'u', z: 'u', w: 'u', arrowdown: 'd', s: 'd' };
const ax = (e) => (document.documentElement.classList.contains('rot') ? e.clientY : e.clientX);   // page pivotée en paysage : le glissé horizontal = axe Y écran
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
// Volant tactile : course du doigt pour le braquage maxi (px), zone morte, courbe (fine près du centre, plus vive vers la butée)
const WHEEL_R = 80, DEAD = 5, WHEEL_DEG = 110;
const wheelCurve = (d) => { const a = Math.abs(d); if (a <= DEAD) return 0; const t = Math.min(1, (a - DEAD) / (WHEEL_R - DEAD)); return Math.sign(d) * (.55 * t + .45 * t * t); };
const toward = (v, t, r) => (v < t ? Math.min(t, v + r) : Math.max(t, v - r));

export function createInput({ steerZone, accelBtn, brakeBtn }) {
  const st = { throttle: 0, brake: 0, steer: 0, rev: true }, k = {}, T = { id: null, x0: 0, raw: 0, acc: false, brk: false };
  // Volant dessiné (animé selon la direction) : repris dans le HTML s'il existe, sinon créé ici
  let wheel = null;
  if (steerZone) {
    wheel = steerZone.querySelector('.tw');
    if (!wheel) {
      wheel = document.createElement('div'); wheel.className = 'tw'; wheel.setAttribute('aria-hidden', 'true');
      wheel.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" stroke-width="8"/><path d="M50 50 L9 63 M50 50 L91 63 M50 50 L50 93" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><circle cx="50" cy="50" r="10" fill="currentColor"/><path d="M41 7 h18" stroke="#ff5a4d" stroke-width="9" stroke-linecap="round"/></svg>';
      steerZone.textContent = ''; steerZone.append(wheel);
    }
  }
  const clear = () => { for (const a in k) k[a] = false; T.id = null; T.raw = 0; T.acc = T.brk = false; if (steerZone) steerZone.classList.remove('on');[accelBtn, brakeBtn].forEach((b) => b && b.classList.remove('active')); };
  addEventListener('keydown', (e) => { if (e.ctrlKey || e.metaKey || e.altKey) return; const a = KEYS[e.key.toLowerCase()]; if (a) { k[a] = true; e.preventDefault(); } });
  addEventListener('keyup', (e) => { const a = KEYS[e.key.toLowerCase()]; if (a) k[a] = false; });
  addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);
  if (steerZone) {
    steerZone.addEventListener('pointerdown', (e) => { e.preventDefault(); if (T.id !== null) return; T.id = e.pointerId; T.x0 = ax(e); T.raw = 0; steerZone.setPointerCapture(e.pointerId); steerZone.classList.add('on'); });
    steerZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== T.id) return;
      // Point de départ flottant : au-delà de la butée il suit le doigt, donc revenir vers le centre ou braquer de l'autre côté est immédiat
      let d = ax(e) - T.x0;
      if (d > WHEEL_R) { T.x0 = ax(e) - WHEEL_R; d = WHEEL_R; } else if (d < -WHEEL_R) { T.x0 = ax(e) + WHEEL_R; d = -WHEEL_R; }
      T.raw = wheelCurve(d);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) steerZone.addEventListener(ev, (e) => { if (e.pointerId === T.id) { T.id = null; T.raw = 0; steerZone.classList.remove('on'); } });
  }
  const pedal = (el, key) => {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); T[key] = true; el.classList.add('active'); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { T[key] = false; el.classList.remove('active'); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  pedal(accelBtn, 'acc'); pedal(brakeBtn, 'brk');
  return {
    state: st, reset: clear,
    update(dt) {
      const touch = T.id !== null, tgt = touch ? T.raw : (k.r ? 1 : 0) - (k.l ? 1 : 0);
      st.steer = toward(st.steer, tgt, (touch ? 14 : tgt ? 4.5 : 8) * dt);
      st.throttle = toward(st.throttle, k.u || T.acc ? 1 : 0, 6 * dt);
      st.brake = toward(st.brake, k.d || T.brk ? 1 : 0, 9 * dt);
      if (wheel) wheel.style.transform = 'rotate(' + (st.steer * WHEEL_DEG).toFixed(1) + 'deg)';
    },
  };
}