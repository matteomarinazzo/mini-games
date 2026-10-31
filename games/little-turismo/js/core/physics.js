// Physique V3 : modèle bicyclette 2 essieux (u long., w lat. vers la droite, r lacet), pas fixe 1/60 (2 sous-pas), fiches voiture.
// Pas de Pacejka : courbe de dérive à pic puis perte, cercle de friction, transfert de charge grossier, sol et murs.
// TODO V4 : IA de course sur ce modèle · plusieurs fiches (menu de config).
import { TRACK, locate, frameAt, surface, H, GRAVEL, PIT, pitExt, pitWall } from './track.js';

export const CARS = {
  serra_gt: {
    id: 'serra_gt', name: 'GT Serra',
    mass: 1250, vmax: 85, power: 440000, brakeForce: 21000, grip: 1.5, understeer: .35, oversteer: .35, aero: 1.1, drag: .55,
    a: 1.25, b: 1.45, h: .5, tw: 1.6, iz: 2800, eff: .9, steerMax: .5, steerV: 30, rearK: 1.2,
    gears: [24, 40, 55, 69, 80, 90],   // vitesse (m/s) au rupteur par rapport
  },
};

const G = 9.81, WALL_LAT = TRACK.half + GRAVEL;
const SURF_G = [1, .93, .55, .42];       // asphalte, vibreur, gravier, herbe : adhérence
const SURF_Q = [0, 0, 1.8, 3];           // décélération de base (m/s²)
const SURF_QV = [0, 0, .06, .1];         // + terme en vitesse
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
// force latérale normalisée : pic à |α| = pk puis perte à 78 %
const curve = (al, pk) => { const s = Math.abs(al) / pk, y = s < 1 ? Math.sin(1.5708 * s) : .78 + .22 * Math.exp(1 - s); return al < 0 ? -y : y; };

/** Un essieu : charge N, adhérence mu, transfert latéral lt, force longitudinale demandée fx, dérive al. → [Fx, Fy] */
function axle(N, mu, lt, fx, al, pk, brk) {
  const cap = mu * Math.max(N, 300) * (1 - .15 * lt * lt);
  let pen = 1;
  if (Math.abs(fx) > cap) { fx = Math.sign(fx) * cap; if (brk) pen = .8; }          // roues bloquées : on perd du latéral
  const cy = Math.max(Math.sqrt(cap * cap - fx * fx), .22 * cap) * pen;                // cercle de friction
  return [fx, -cy * curve(al, pk)];
}

export function createCar(sheet = CARS.serra_gt, s0 = TRACK.startIdx * TRACK.ds - 14, lat = 3) {
  const f = frameAt(s0), c = {
    sheet, x: f.x + f.rx * lat, z: f.z + f.rz * lat, y: f.y, psi: Math.atan2(f.tz, f.tx), pitch: 0, roll: 0,
    u: 0, w: 0, r: 0, ax: 0, ay: 0, t: 0, shift: 0, gear: 0, rpm: 1100, v: 0, kmh: 0, idx: 0, s: s0, lat, surf: 0, wall: false, rev: false, rt: 0, hv: 0, hnx: 0, hnz: 0, fa: 1, fg: 1, fd: 1, faf: 1, far: 1, fp: 1, fv: 1, fb: 1, fs: 1, pull: 0, limit: 0,
  };
  c.idx = locate(c.x, c.z).i; c.prev = { x: c.x, y: c.y, z: c.z, psi: c.psi };
  return c;
}

export function stepCar(c, inp, dt) {
  const S = c.sheet, p = c.prev, m = S.mass, { a, b } = S, L = a + b;
  p.x = c.x; p.y = c.y; p.z = c.z; p.psi = c.psi;
  const faf = c.faf ?? 1, far = c.far ?? 1, fp = c.fp ?? 1, fv = c.fv ?? 1, fb = c.fb ?? 1, fs = c.fs ?? 1, pull = c.pull || 0;   // effets des dégâts (damage.js)
  // marche arrière (même touche que le frein) : seulement presque à l'arrêt, maintenue 0,3 s ; relâcher ou accélérer la quitte
  if (!inp.rev) { c.rev = false; c.rt = 0; }
  else if (c.rev) { if (inp.brake < .1 || inp.throttle > .1) { c.rev = false; c.rt = 0; } }
  else if (inp.brake > .5 && inp.throttle < .1 && c.u < 1.4) { if ((c.rt += dt) > .3) c.rev = true; }
  else c.rt = 0;

  // sol sous les roues (échantillon gauche/droite)
  const l0 = locate(c.x, c.z, c.idx), th0 = c.psi - Math.atan2(l0.tz, l0.tx);
  const hw = .8 * Math.abs(Math.cos(th0)) + 1.35 * Math.abs(Math.sin(th0));
  const sA = surface({ lat: l0.lat - hw, i: l0.i }), sB = surface({ lat: l0.lat + hw, i: l0.i });
  const mu0 = (SURF_G[sA] + SURF_G[sB]) / 2 * c.fg, qb = (SURF_Q[sA] + SURF_Q[sB]) / 2, qv = (SURF_QV[sA] + SURF_QV[sB]) / 2;
  const kerb = sA === 1 || sB === 1;

  const n = 2, h = dt / n; let Fx = 0, Fy = 0;
  for (let k = 0; k < n; k++) {
    const u = c.u, w = c.w, r = c.r, speed = Math.hypot(u, w), sgn = cl(u / .6, -1, 1), ue = Math.max(Math.abs(u), 3), su = u < 0 ? -1 : 1;
    const down = S.aero * c.fa * speed * speed;
    // charges : statique + appui aéro + transfert longitudinal ; transfert latéral grossier
    const Nf = m * G * b / L + .45 * down * faf - m * c.ax * S.h / L, Nr = m * G * a / L + .55 * down * far + m * c.ax * S.h / L;
    const tr = m * Math.abs(c.ay) * S.h / S.tw * .5, ltf = Math.min(.9, tr / Math.max(Nf / 2, 300)), ltr = Math.min(.9, tr / Math.max(Nr / 2, 300));
    const d = (inp.steer * S.steerMax * fs + pull * cl(speed / 20, 0, 1)) / (1 + (speed / S.steerV) ** 2), cd = Math.cos(d), sd = Math.sin(d);
    // moteur (puissance / vitesse, coupure à vmax, trou de boîte) et freins (répartis selon la charge, léger biais avant)
    let Fd = 0;
    if (c.shift > 0) c.shift -= h; else if (c.rev) Fd = -inp.brake * 7000 * cl((7 + u) / 2, 0, 1); else Fd = inp.throttle * Math.min(S.power * S.eff * fp / Math.max(u, 4), 1e5 * fp) * cl((S.vmax * fv - u) / 4, 0, 1) * (c.limit ? cl((c.limit - u) / 1.5, 0, 1) : 1);
    const Fb = c.rev ? 0 : inp.brake * S.brakeForce * fb, sf = Nf / (Nf + Nr) + .10, brk = Fb > 100;
    const af = Math.atan2(w + a * r, ue) - d * su, ar = Math.atan2(w - b * r, ue);
    const [fxf, fyf] = axle(Nf, S.grip * (1 - .2 * S.understeer) * (1 - .12 * (1 - faf)) * mu0, ltf, -sgn * Fb * sf, af, .12 + .05 * S.understeer, brk);
    const [fxr, fyr] = axle(Nr, S.grip * (S.rearK || 1) * (1 - .08 * S.oversteer) * (1 - .2 * (1 - far)) * mu0, ltr, Fd - sgn * Fb * (1 - sf), ar, .075 + .02 * S.oversteer, brk);
    // traînée (+ traînée induite de l'appui), roulement, sol meuble
    const kd = (S.drag + .12 * S.aero * c.fa * (faf + far) / 2) * c.fd, q = .15 + qb + qv * speed, rs = speed + .5;
    Fx = fxr + fxf * cd - fyf * sd - kd * speed * u - m * q * u / rs;
    if (inp.rev && !c.rev && u < 0) Fx += m * 6 * cl(-u / 1.5, 0, 1);   // relâcher en marche arrière : la voiture s'arrête
    Fy = fyr + fyf * cd + fxf * sd - kd * speed * w - m * q * w / rs;
    let Mz = a * (fyf * cd + fxf * sd) - b * fyr;
    if (kerb) { const j = cl(speed / 20, 0, 1); Fy += m * .9 * j * Math.sin(c.t * 53); Mz += 500 * j * Math.sin(c.t * 31 + 1); }
    c.t += h;
    c.u += (Fx / m + w * r) * h; if (c.limit && c.u > c.limit) c.u = Math.min(c.u, Math.max(c.limit, u - 30 * h));   // pit limiter : plafond dur, décélération max 30 m/s² si on arrive plus vite
    c.w += (Fy / m - u * r) * h; c.r += Mz / S.iz * h;   // (limiter 80 km/h ci-dessus)
    if (Math.abs(c.u) < 6) { const kk = (1 - Math.abs(c.u) / 6) * 10; c.w *= Math.exp(-kk * h); c.r *= Math.exp(-kk * .5 * h); }  // stabilité à l'arrêt
    c.psi += c.r * h;
    const cs = Math.cos(c.psi), sn = Math.sin(c.psi);
    c.x += (cs * c.u - sn * c.w) * h; c.z += (sn * c.u + cs * c.w) * h;
  }
  const f1 = Math.min(1, 8 * dt); c.ax += (Fx / m - c.ax) * f1; c.ay += (Fy / m - c.ay) * f1;

  // mur (limite extérieure du gravier) : contact inélastique, on longe en perdant de la vitesse
  let l = locate(c.x, c.z, c.idx);
  const th = c.psi - Math.atan2(l.tz, l.tx), ext = .94 * Math.abs(Math.cos(th)) + 2.3 * Math.abs(Math.sin(th)), sg0 = Math.sign(l.lat) || 1, aa = Math.abs(l.lat), pit = sg0 === PIT.sg;
  let over = aa + ext - (pit ? Math.max(WALL_LAT, TRACK.half + pitExt(l.s)) : WALL_LAT), flip = 1;   // côté stands : la limite suit la zone goudronnée
  const pw = pit && over <= 0 ? pitWall(l.s) : null;                                                 // muret piste / voie rapide
  if (pw && aa + ext > pw[0] && aa - ext < pw[1]) { if (aa < (pw[0] + pw[1]) / 2) over = aa + ext - pw[0]; else { over = pw[1] - (aa - ext); flip = -1; } }
  c.wall = over > 0;
  if (c.wall) {
    const sg = sg0 * flip, nx = -l.tz * sg, nz = l.tx * sg;
    c.x -= nx * over; c.z -= nz * over;
    let cs = Math.cos(c.psi), sn = Math.sin(c.psi), vx = cs * c.u - sn * c.w, vz = sn * c.u + cs * c.w;
    const vn = Math.max(0, vx * nx + vz * nz); if (vn > c.hv) { c.hv = vn; c.hnx = nx; c.hnz = nz; } vx -= vn * nx; vz -= vn * nz;
    const vt = Math.hypot(vx, vz);
    if (vt > 1e-3) { const dec = Math.min(vt, .3 * vn + 8 * dt); vx -= vx / vt * dec; vz -= vz / vt * dec; }
    if (vt > 3) { const e = wrap(Math.atan2(vz, vx) - c.psi); if (Math.abs(e) < 1.4) c.psi += e * Math.min(1, 4 * dt); }
    cs = Math.cos(c.psi); sn = Math.sin(c.psi); c.u = cs * vx + sn * vz; c.w = -sn * vx + cs * vz; c.r *= Math.max(0, 1 - 6 * dt);
    l = locate(c.x, c.z, c.idx);
  }
  c.idx = l.i; c.s = l.s; c.lat = l.lat; c.y = l.y; c.surf = surface(l);

  // boîte auto (régime / rapport pour l'affichage futur)
  const g = S.gears, va = Math.max(0, c.u);
  if (c.gear < g.length - 1 && va > .96 * g[c.gear]) { c.gear++; c.shift = .18; }
  else if (c.gear > 0 && va < .62 * g[c.gear - 1]) c.gear--;
  c.rpm = 1100 + 6900 * cl(va / g[c.gear], 0, 1); c.v = c.u; c.kmh = Math.hypot(c.u, c.w) * 3.6;

  // pose visuelle : suit la hauteur du circuit + petit transfert (cabrage/plongée, roulis, vibreurs)
  const j = (l.i + 1) % TRACK.N, slope = Math.atan((TRACK.P[j * 3 + 1] - TRACK.P[l.i * 3 + 1]) / TRACK.ds * (Math.cos(c.psi) * l.tx + Math.sin(c.psi) * l.tz));
  c.pitch = slope + cl(c.ax * .0035, -.05, .04);
  c.roll = cl(c.ay * .004, -.07, .07) + (kerb ? .01 * Math.sin(c.t * 53) * cl(c.kmh / 70, 0, 1) : 0);
}