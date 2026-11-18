// Murs : [x,z,w,d,h,y0?] (+ `diag` : [x0,z0,x1,z1,h?,y0?] murs obliques ; les arêtes obliques du polygone reçoivent aussi leur bordure) — y0 = bas du mur (toit de tunnel) ; sans y0, le mur descend jusqu’au vide. Physique : sphère r=.05, sous-pas fixe 1/240, sols/rampes/murs en boîtes, coupe cylindrique, hors-limites. Le monde accepte N balles.
(function () {
  const M = window.Minigolf = window.Minigolf || {};
  const R = .05, G = 9.81, DT = 1 / 240, VMAX = 14, SHOT_VMAX = 10.5, REST = .25, CUP_R = .11, CUP_D = .10,
    FR_C = .9, FR_L = .3, STATIC = 1.2, BORDER_H = .18, BORDER_T = .12, NEG = -Infinity,
    SAND_K = 3.3, ICE_K = .3, BOOST_A = 8, PAD_VY = 3.1, BUMP_H = .35, BUMP_V = 5, PORTAL_R = .3;
  const inR = (x, z, r) => Math.abs(x - r[0]) <= r[2] / 2 && Math.abs(z - r[1]) <= r[3] / 2;
  const inPoly = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const rampY = (r, x, z) => r[4] + (r[5] - r[4]) * (r[6] === 'x' ? (x - r[0] + r[2] / 2) / r[2] : (z - r[1] + r[3] / 2) / r[3]);
  const ext = (p, q, r, t) => { let ax = q[0] - p[0], az = q[1] - p[1], bx = r[0] - q[0], bz = r[1] - q[1]; const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz); ax /= la; az /= la; bx /= lb; bz /= lb; return t * Math.abs(ax * bz - az * bx) / (1 + ax * bx + az * bz); };   // prolongement d'une bordure à un coin convexe : t·tan(θ/2) (= t à 90°)
  const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };

  /** Trou brut → trou calculé : bordures en boîtes (arêtes axiales du polygone), fonction de hauteur du sol G(x,z) (-Infinity = vide / hors terrain). */
  function compile(h) {
    const poly = h.poly, ramps = h.ramps || [], voids = h.voids || [], water = h.water || [], pits = voids.concat(water), walls = (h.walls || []).map((w) => w.slice()), n = poly.length, A = area(poly), s = A > 0 ? 1 : -1, t = BORDER_T;
    const Gb = (x, z) => {
      let y = NEG; for (const r of ramps) if (inR(x, z, r)) y = Math.max(y, rampY(r, x, z));
      if (y > NEG) return y; if (!inPoly(x, z, poly)) return NEG;
      for (const v of pits) if (inR(x, z, v)) return NEG; return 0;
    };
    const cv = (p, q, r) => ((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])) * A > 0;
    const bsegs = [], dw = [];   // dw : murs orientés {x,z,l,t,ux,uz,h,y0?} (arêtes obliques du polygone et murs `diag`)
    // bordures : même hauteur (BORDER_H) au-dessus du sol local, par tronçons de 0,1 m fusionnés (hauteur arrondie à 2 cm)
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], pv = poly[(i + n - 1) % n], nx = poly[(i + 2) % n], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      const ea = cv(pv, a, b) ? ext(pv, a, b, t) : 0, eb = cv(a, b, nx) ? ext(a, b, nx, t) : 0, ox = uz * s, oz = -ux * s, m = Math.max(1, Math.round(L / .1)), tops = [];
      for (let k = 0; k < m; k++) { let g = 0; for (const f of [0, .5, 1]) { const u = (k + f) / m * L, y = Gb(a[0] + ux * u - ox * .06, a[1] + uz * u - oz * .06); if (y > g) g = y; } tops.push(Math.ceil((g + BORDER_H) / .02 - 1e-6) * .02); }
      const hs = []; for (let j = 0; j <= m; j++) { const u = j / m * L; hs.push(Math.max(0, Gb(a[0] + ux * u - ox * .06, a[1] + uz * u - oz * .06)) + BORDER_H); } bsegs.push({ a, u: [ux, uz], o: [ox, oz], L, ea, eb, hs });   // profil lisse pour le rendu (la physique reste en paliers ≥ au profil)
      for (let k = 0; k < m;) {
        let e = k; while (e + 1 < m && tops[e + 1] === tops[k]) e++;
        const u0 = k / m * L - (k === 0 ? ea : 0), u1 = (e + 1) / m * L + (e === m - 1 ? eb : 0), cu = (u0 + u1) / 2, cx = a[0] + ux * cu + ox * t / 2, cz = a[1] + uz * cu + oz * t / 2;
        if (dx !== 0 && dz !== 0) dw.push({ x: cx, z: cz, l: u1 - u0, t, ux, uz, h: tops[k], bd: 1 });
        else { const bw = dz === 0 ? [cx, cz, u1 - u0, t, tops[k]] : [cx, cz, t, u1 - u0, tops[k]]; bw.bd = 1; walls.push(bw); }
        k = e + 1;
      }
    }
    // toits (murs avec y0) : si aucun mur ne les touche, deux piliers pleins aux extrémités du grand côté
    const sol = (r, q) => r !== q && (r[5] === undefined || r[5] < q[5] - .001) && r[4] >= q[5] - .001, ov = (r, cx, cz, w, d) => Math.abs(cx - r[0]) < (w + r[2]) / 2 && Math.abs(cz - r[1]) < (d + r[3]) / 2;
    for (const q of walls.slice()) {
      if (q[5] === undefined) continue;
      const tx = (sg) => walls.some((r) => sol(r, q) && ov(r, q[0] + sg * q[2] / 2, q[1], .06, q[3] - .04)), tz = (sg) => walls.some((r) => sol(r, q) && ov(r, q[0], q[1] + sg * q[3] / 2, q[2] - .04, .06));
      if (tx(-1) || tx(1) || tz(-1) || tz(1)) continue;
      if (q[2] >= q[3]) { const w = Math.min(.12, q[2] / 3); walls.push([q[0] - q[2] / 2 + w / 2, q[1], w, q[3], q[4]], [q[0] + q[2] / 2 - w / 2, q[1], w, q[3], q[4]]); }
      else { const d = Math.min(.12, q[3] / 3); walls.push([q[0], q[1] - q[3] / 2 + d / 2, q[2], d, q[4]], [q[0], q[1] + q[3] / 2 - d / 2, q[2], d, q[4]]); }
    }
    for (const d of h.diag || []) { const ex = d[2] - d[0], ez = d[3] - d[1], L = Math.hypot(ex, ez); dw.push({ x: (d[0] + d[2]) / 2, z: (d[1] + d[3]) / 2, l: L + .1, t: .1, ux: ex / L, uz: ez / L, h: d[4] === undefined ? .3 : d[4], y0: d[5] }); }
    const cx = h.cup[0], cz = h.cup[1];   // G = sol du parcours, -Infinity dans le cylindre de la coupe ; Gb = sol sans la coupe
    const G = (x, z) => { const y = Gb(x, z); return y > NEG && (x - cx) ** 2 + (z - cz) ** 2 < CUP_R * CUP_R ? NEG : y; };
    // zones au sol : 1 sable (freine), 2 glace (glisse), 3 boost (accélère dans la direction d), 4 trampoline (fait sauter) ; vent : accélération constante, au sol comme en l’air
    const zones = [].concat((h.sand || []).map((r) => ({ t: 1, r })), (h.ice || []).map((r) => ({ t: 2, r })), (h.boost || []).map((r) => ({ t: 3, r: r.slice(0, 4), d: [r[4], r[5]] })), (h.pads || []).map((r) => ({ t: 4, r })));
    const winds = (h.wind || []).map((r) => ({ r: r.slice(0, 4), a: [r[4], r[5]] }));
    const zone = (x, z) => { for (const q of zones) if (inR(x, z, q.r)) return q; return null; };
    return { bsegs, dw, name: h.name, start: h.start, cup: h.cup, yaw: h.yaw, poly, walls, ramps, voids, water, zones, winds, zone, bumpers: h.bumpers || [], portals: h.portals || [], rest: h.rest === undefined ? REST : h.rest, A, G, Gb, cupY: Gb(cx, cz), depth: h.depth || CUP_D };
  }
  function normal(h, x, z) {
    const g0 = h.Gb(x, z); if (g0 === NEG) return [0, 1, 0];
    const e = .06, s = (a, b) => { const v = h.Gb(a, b); return v === NEG || Math.abs(v - g0) > .2 ? g0 : v; };
    const gx = (s(x + e, z) - s(x - e, z)) / (2 * e), gz = (s(x, z + e) - s(x, z - e)) / (2 * e), l = Math.hypot(gx, 1, gz);
    return [-gx / l, 1 / l, -gz / l];
  }
  /** Coupe : cylindre creux (rayon CUP_R, profondeur h.depth, fond plat). Le bord et la paroi sont une même surface cylindrique, collisionnée au point le plus proche de la balle. */
  function cupStep(h, b) {
    const c = h.cup, dx = b.x - c[0], dz = b.z - c[1], d = Math.hypot(dx, dz);
    b.pit = false; if (d > CUP_R + R) return;
    const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0, ry = h.Gb(c[0] + ux * CUP_R, c[1] + uz * CUP_R), top = ry > NEG ? ry : h.cupY, fl = h.cupY - h.depth;
    if (d < CUP_R && b.vy <= .05 && b.y - R <= fl + .004) { b.y = fl + R; if (b.vy < -1.2) b.vy *= -.2; else { b.vy = 0; b.ground = true; } }
    const ddh = d - CUP_R;
    if (ddh <= 0 || b.y > top) {   // dehors sous le feutre : c’est le sol qui porte
      const dy = b.y - Math.max(fl, Math.min(top, b.y)), dist = Math.hypot(ddh, dy);
      if (dist < R && dist > 1e-6) {
        const nx = ddh / dist * ux, ny = dy / dist, nz = ddh / dist * uz, pn = R - dist;
        b.x += nx * pn; b.y += ny * pn; b.z += nz * pn;
        const vn = b.vx * nx + b.vy * ny + b.vz * nz; if (vn < 0) { const k = (1 + (vn < -.5 ? REST : 0)) * vn; b.vx -= k * nx; b.vy -= k * ny; b.vz -= k * nz; }
      }
    }
    b.pit = Math.hypot(b.x - c[0], b.z - c[1]) < CUP_R && b.y < top;
  }
  function stepBall(h, b, dt, obs) {
    if (b.rest || b.sunk) return;
    const x0 = b.x, z0 = b.z; b.t += dt;
    let wx = 0, wz = 0, hit = false;   // vent : même accélération sur toutes les plaques, au sol comme en l'air
    if (!b.pit) for (const w of h.winds) if (inR(b.x, b.z, w.r)) { wx += w.a[0]; wz += w.a[1]; }   // dans le creux de la coupe, le vent ne passe pas
    b.vx += wx * dt; b.vz += wz * dt;
    const z0q = h.zone(b.x, b.z), push = Math.hypot(wx, wz) > FR_C * (z0q ? (z0q.t === 1 ? SAND_K : z0q.t === 2 ? ICE_K : 1) : 1) + .05;   // le vent bat le frottement statique : la balle ne peut pas s'arrêter ici
    if (b.ground) {
      const zq = h.zone(b.x, b.z), fk = zq ? (zq.t === 1 ? SAND_K : zq.t === 2 ? ICE_K : 1) : 1;
      if (zq && zq.t === 3 && Math.hypot(b.vx, b.vz) > .15) { b.vx += zq.d[0] * BOOST_A * dt; b.vz += zq.d[1] * BOOST_A * dt; }
      const n = b.pit ? [0, 1, 0] : normal(h, b.x, b.z), ny = n[1];
      b.vx += G * ny * n[0] * dt; b.vy += G * (ny * ny - 1) * dt; b.vz += G * ny * n[2] * dt;
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      if (sp > 1e-6) { const k = 1 - Math.min(sp, (FR_C + FR_L * sp) * fk * dt) / sp; b.vx *= k; b.vy *= k; b.vz *= k; }
      if (!push && Math.hypot(b.vx, b.vz) < .08 && G * Math.sqrt(Math.max(0, 1 - ny * ny)) < STATIC) { b.vx = b.vy = b.vz = 0; if (b.pit) b.sunk = true; else b.rest = true; return; }   // réussi : posée au fond de la coupe
      if (zq && zq.t === 4 && !b.pit && Math.hypot(b.vx, b.vz) > .5) { b.vy = PAD_VY; b.ground = false; }
    } else b.vy -= G * dt;
    const sp = Math.hypot(b.vx, b.vy, b.vz); if (sp > VMAX) { const k = VMAX / sp; b.vx *= k; b.vy *= k; b.vz *= k; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    // sol
    const gh = h.G(b.x, b.z);
    if (gh === NEG) b.ground = false;
    else {
      const pen = gh + R - b.y;
      if (pen > .12) {   // face verticale (marche) : on recule et on rebondit
        if (h.G(b.x, z0) + R - b.y <= .12) { b.z = z0; b.vz *= -REST; } else { b.x = x0; b.vx *= -REST; if (h.G(x0, b.z) + R - b.y > .12) { b.z = z0; b.vz *= -REST; } }
      } else {
        const n = normal(h, b.x, b.z), vn = b.vx * n[0] + b.vy * n[1] + b.vz * n[2];
        if (pen > -.012 && (b.ground || vn <= .05)) {
          const air = !b.ground; b.y = gh + R;
          if (air && vn < -1.2) { const k = 1.2 * vn; b.vx -= k * n[0]; b.vy -= k * n[1]; b.vz -= k * n[2]; b.ground = false; }
          else { b.vx -= vn * n[0]; b.vy -= vn * n[1]; b.vz -= vn * n[2]; b.ground = true; }
        } else b.ground = false;   // la surface s’éloigne plus vite que la balle : décollage
      }
    }
    cupStep(h, b);
    // murs (boîtes, de y=-2 à h)
    for (const q of h.walls) {
      const cx = Math.max(q[0] - q[2] / 2, Math.min(q[0] + q[2] / 2, b.x)), cy = Math.max(q[5] === undefined ? -2 : q[5], Math.min(q[4], b.y)), cz = Math.max(q[1] - q[3] / 2, Math.min(q[1] + q[3] / 2, b.z));
      const dx = b.x - cx, dy = b.y - cy, dz = b.z - cz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < R * R) {
        let d = Math.sqrt(d2), nx, ny, nz;
        if (d > 1e-6) { nx = dx / d; ny = dy / d; nz = dz / d; }
        else { const px = q[2] / 2 - Math.abs(b.x - q[0]), pz = q[3] / 2 - Math.abs(b.z - q[1]); ny = 0; if (px < pz) { nx = Math.sign(b.x - q[0]) || 1; nz = 0; d = -px; } else { nz = Math.sign(b.z - q[1]) || 1; nx = 0; d = -pz; } }
        hit = true; const pn = R - d; b.x += nx * pn; b.y += ny * pn; b.z += nz * pn;
        const vn = b.vx * nx + b.vy * ny + b.vz * nz; if (vn < 0) { const k = (1 + h.rest) * vn; b.vx -= k * nx; b.vy -= k * ny; b.vz -= k * nz; }
      }
    }
    // murs orientés (diagonales) : même réponse que les boîtes, dans le repère du mur (u le long, v en travers)
    for (const q of h.dw) {
      const dx = b.x - q.x, dz = b.z - q.z, lu = dx * q.ux + dz * q.uz, lv = -dx * q.uz + dz * q.ux, hl = q.l / 2, ht = q.t / 2;
      const cu = Math.max(-hl, Math.min(hl, lu)), cv = Math.max(-ht, Math.min(ht, lv)), cy = Math.max(q.y0 === undefined ? -2 : q.y0, Math.min(q.h, b.y));
      const du = lu - cu, dv = lv - cv, dy = b.y - cy, d2 = du * du + dv * dv + dy * dy;
      if (d2 < R * R) {
        let d = Math.sqrt(d2), nu, nv, ny;
        if (d > 1e-6) { nu = du / d; nv = dv / d; ny = dy / d; }
        else { const pu = hl - Math.abs(lu), pv = ht - Math.abs(lv); ny = 0; if (pu < pv) { nu = Math.sign(lu) || 1; nv = 0; d = -pu; } else { nv = Math.sign(lv) || 1; nu = 0; d = -pv; } }
        const nx = nu * q.ux - nv * q.uz, nz = nu * q.uz + nv * q.ux;
        hit = true; const pn = R - d; b.x += nx * pn; b.y += ny * pn; b.z += nz * pn;
        const vn = b.vx * nx + b.vy * ny + b.vz * nz; if (vn < 0) { const k = (1 + h.rest) * vn; b.vx -= k * nx; b.vy -= k * ny; b.vz -= k * nz; }
      }
    }
    // bumpers : cylindres [x, z, rayon, restitution] ; > 1 = ils relancent la balle
    for (const q of h.bumpers) {
      const dx = b.x - q[0], dz = b.z - q[1], d = Math.hypot(dx, dz), m = q[2] + R;
      if (d < m && b.y < BUMP_H + R) {
        const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0; b.x = q[0] + nx * m; b.z = q[1] + nz * m;
        const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= (1 + q[3]) * vn * nx; b.vz -= (1 + q[3]) * vn * nz; if (q[3] >= .8) { const o = b.vx * nx + b.vz * nz, k = Math.max(0, BUMP_V - o); b.vx += k * nx; b.vz += k * nz; b.rest = false; } }   // bumper « flipper » : renvoie toujours la balle à BUMP_V m/s au moins
      }
    }
    // portails : [x1, z1, x2, z2] — entrer d’un côté fait ressortir de l’autre, même vitesse
    if (b.pin) { let near = false; for (const p of h.portals) for (let k = 0; k < 2; k++) if (Math.hypot(b.x - p[k * 2], b.z - p[k * 2 + 1]) < PORTAL_R + .06) near = true; if (!near) b.pin = false; }
    else if (b.y < .6) for (const p of h.portals) for (let k = 0; k < 2; k++) {
      if (Math.hypot(b.x - p[k * 2], b.z - p[k * 2 + 1]) < PORTAL_R) { const ox = p[2 - k * 2], oz = p[3 - k * 2], g = h.G(ox, oz); if (isFinite(g)) { b.x = ox; b.z = oz; b.y = g + R; b.ground = true; b.pin = true; } k = 2; break; }
    }
    // autres balles (sphères fixes, tour par tour) : on rebondit dessus
    if (obs) for (const o of obs) {
      const dx = b.x - o.x, dz = b.z - o.z, m = 2 * R, hd = Math.hypot(dx, dz);
      if (hd < m && Math.abs(b.y - o.y) < m) {
        hit = true; const nx = hd > 1e-6 ? dx / hd : 1, nz = hd > 1e-6 ? dz / hd : 0, pn = m - hd; b.x += nx * pn; b.z += nz * pn;
        const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vz -= 1.6 * vn * nz; }
      }
    }
    // hors limites : centre hors polygone et retombé sous le niveau du terrain, ou y < -1 (pas de pénalité en l’air)
    const out = !inPoly(b.x, b.z, h.poly);
    if (b.y < -1 || (out && b.y < -.15)) { b.oob = true; b.out = out; b.vx = b.vy = b.vz = 0; b.rest = true; return; }
    if (push && hit && b.ground && Math.hypot(b.vx, b.vz) < .3) { b.vx = b.vy = b.vz = 0; b.rest = true; return; }   // poussée contre un mur ou une balle : elle s'arrête
    if (b.t > 30) { b.vx = b.vy = b.vz = 0; b.rest = true; }
    if (!push && b.t > 8 && Math.hypot(b.vx, b.vy, b.vz) < .5 && Math.hypot(b.x - h.cup[0], b.z - h.cup[1]) >= CUP_R) { b.vx = b.vy = b.vz = 0; b.rest = true; }   // vibre encore après 8 s
  }
  /** Contacts balle/balle : séparation et échange d’impulsion (masses égales, restitution .9). Une balle touchée se réveille et roule. */
  function collide(B) {
    const m = 2 * R;
    for (let i = 0; i < B.length; i++) {
      const a = B[i]; if (a.sunk || a.oob) continue;
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j]; if (b.sunk || b.oob) continue;
        const dx = b.x - a.x, dz = b.z - a.z, hd = Math.hypot(dx, dz); if (hd >= m || Math.abs(b.y - a.y) >= m) continue;
        const nx = hd > 1e-6 ? dx / hd : 1, nz = hd > 1e-6 ? dz / hd : 0, pn = (m - hd) / 2;
        a.x -= nx * pn; a.z -= nz * pn; b.x += nx * pn; b.z += nz * pn;
        const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (vn < 0) { const k = -(1 + .9) * vn / 2; a.vx -= k * nx; a.vz -= k * nz; b.vx += k * nx; b.vz += k * nz; }
        a.rest = b.rest = false; a.t = b.t = 0;
      }
    }
  }
  function createWorld(hole) { return { hole: compile(hole), balls: [], acc: 0 }; }
  function addBall(w, x, z) {
    const h = w.hole; if (!isFinite(h.G(x, z))) { x = h.start[0]; z = h.start[1]; }
    const b = { x, y: h.G(x, z) + R, z, vx: 0, vy: 0, vz: 0, ground: true, rest: true, sunk: false, pit: false, oob: false, out: false, t: 0, ox: x, oz: z };
    w.balls.push(b); return b;
  }
  function step(w, dt) { w.acc += dt; let n = 0; while (w.acc >= DT && n++ < 40) { w.acc -= DT; for (const b of w.balls) { const c = w.hole.cup, k = b.rest || b.sunk || Math.hypot(b.x - c[0], b.z - c[1]) > .7 ? 1 : Math.max(1, Math.min(8, Math.ceil(Math.hypot(b.vx, b.vy, b.vz) * DT / .006))); for (let i = 0; i < k; i++) stepBall(w.hole, b, DT / k, w.obs); } if (w.balls.length > 1) collide(w.balls); } }
  /** Putt horizontal : puissance 0–100 → vitesse. */
  function hit(b, yaw, power) { const v = SHOT_VMAX * power / 100; b.vx = Math.sin(yaw) * v; b.vz = Math.cos(yaw) * v; b.vy = 0; b.rest = false; b.ground = true; b.t = 0; b.ox = b.x; b.oz = b.z; }
  /** Point de replacement après hors-limites : 0,35 m à l’intérieur du bord le plus proche ; chute dans un vide (centre dans le polygone) : position de départ du coup. */
  function recover(w, b) {
    const h = w.hole, p = h.poly, s = h.A > 0 ? 1 : -1;
    if (b.out) {
      let best = 1e9, r = null;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], c = p[(i + 1) % p.length], ex = c[0] - a[0], ez = c[1] - a[1], L2 = ex * ex + ez * ez, t = Math.max(0, Math.min(1, ((b.x - a[0]) * ex + (b.z - a[1]) * ez) / L2)), px = a[0] + ex * t, pz = a[1] + ez * t, d = (b.x - px) ** 2 + (b.z - pz) ** 2;
        if (d < best) { best = d; const L = Math.sqrt(L2); r = [px - ez / L * s * .35, pz + ex / L * s * .35]; }
      }
      if (r && inPoly(r[0], r[1], p) && isFinite(h.G(r[0], r[1]))) return r;
    }
    return [b.ox, b.oz];
  }
  function place(w, b, x, z) { b.x = x; b.z = z; b.y = w.hole.G(x, z) + R; b.vx = b.vy = b.vz = 0; b.ground = true; b.rest = true; b.pit = false; b.pin = false; b.oob = false; b.out = false; b.ox = x; b.oz = z; }
  M.physics = { R, SHOT_VMAX, BOOST_A, CUP_R, FR_C, FR_L, inR, inPoly, createWorld, addBall, step, hit, recover, place };
})();
