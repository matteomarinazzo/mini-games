// Clavier + tactile → { throttle 0–1, brake 0–1, steer -1–1 }
const KEYS = { arrowleft: 'l', q: 'l', a: 'l', arrowright: 'r', d: 'r', arrowup: 'u', z: 'u', w: 'u', arrowdown: 'd', s: 'd' };
const ax = (e) => (document.documentElement.classList.contains('rot') ? e.clientY : e.clientX);   // page pivotée en paysage : le glissé horizontal = axe Y écran
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const toward = (v, t, r) => (v < t ? Math.min(t, v + r) : Math.max(t, v - r));

export function createInput({ steerZone, accelBtn, brakeBtn }) {
  const st = { throttle: 0, brake: 0, steer: 0, rev: true }, k = {}, T = { id: null, x0: 0, raw: 0, acc: false, brk: false };
  const clear = () => { for (const a in k) k[a] = false; T.id = null; T.raw = 0; T.acc = T.brk = false; [accelBtn, brakeBtn].forEach((b) => b && b.classList.remove('active')); };
  addEventListener('keydown', (e) => { if (e.ctrlKey || e.metaKey || e.altKey) return; const a = KEYS[e.key.toLowerCase()]; if (a) { k[a] = true; e.preventDefault(); } });
  addEventListener('keyup', (e) => { const a = KEYS[e.key.toLowerCase()]; if (a) k[a] = false; });
  addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);
  if (steerZone) {
    steerZone.addEventListener('pointerdown', (e) => { e.preventDefault(); if (T.id !== null) return; T.id = e.pointerId; T.x0 = ax(e); T.raw = 0; steerZone.setPointerCapture(e.pointerId); });
    steerZone.addEventListener('pointermove', (e) => { if (e.pointerId === T.id) T.raw = cl((ax(e) - T.x0) / 60, -1, 1); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) steerZone.addEventListener(ev, (e) => { if (e.pointerId === T.id) { T.id = null; T.raw = 0; } });
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
    },
  };
}
