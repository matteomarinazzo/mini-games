// TEMPORAIRE (V1) : point mobile cinématique sur la surface du circuit. À remplacer par la vraie physique en V3.
import { TRACK, locate, surface, H, GRAVEL, frameAt } from './track.js';

const VMAX = 90, ACC = 14, BRK = 28, LIMIT = H + GRAVEL - 1.1;
export function createDriver(s0 = TRACK.startIdx * TRACK.ds - 14, lat = 3) {
  const f = frameAt(s0), d = { x: f.x + f.rx * lat, z: f.z + f.rz * lat, y: f.y, psi: Math.atan2(f.tz, f.tx), v: 0, idx: 0, s: s0, lat, surf: 0, pitch: 0 };
  d.idx = locate(d.x, d.z).i; d.prev = { x: d.x, y: d.y, z: d.z, psi: d.psi };
  return d;
}
export function stepDriver(d, inp, dt) {
  const p = d.prev; p.x = d.x; p.y = d.y; p.z = d.z; p.psi = d.psi;
  let a = inp.throttle * ACC * (1 - d.v / VMAX) - inp.brake * BRK - (.4 + .0007 * d.v * d.v);
  if (d.surf === 2) a -= 8; else if (d.surf === 3) a -= 5;
  d.v = Math.max(0, d.v + a * dt);
  d.psi += inp.steer * 1.7 / (1 + d.v / 35) * Math.min(1, d.v / 4) * dt;
  d.x += Math.cos(d.psi) * d.v * dt; d.z += Math.sin(d.psi) * d.v * dt;
  let l = locate(d.x, d.z, d.idx);
  const over = Math.abs(l.lat) - LIMIT;
  if (over > 0) {
    const sg = Math.sign(l.lat), nx = -l.tz * sg, nz = l.tx * sg;
    d.x -= nx * over; d.z -= nz * over;
    const sc = Math.cos(d.psi) * nx + Math.sin(d.psi) * nz;
    if (sc > 0) { d.v *= 1 - .02 * sc; d.psi -= sg * sc * 1.5 * dt; }
    l = locate(d.x, d.z, d.idx);
  }
  d.idx = l.i; d.s = l.s; d.lat = l.lat; d.y = l.y; d.surf = surface(l);
  const j = (l.i + 1) % TRACK.N;
  d.pitch = Math.atan((TRACK.P[j * 3 + 1] - TRACK.P[l.i * 3 + 1]) / TRACK.ds * (Math.cos(d.psi) * l.tx + Math.sin(d.psi) * l.tz));
}
