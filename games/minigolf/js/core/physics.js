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
  const distToOpp = (px, pz, ox, oz, poly) => {
    let minD = Infinity, n = poly.length;
    for (let i = 0; i < n; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % n], ex = p2[0] - p1[0], ez = p2[1] - p1[1], denom = ox * ez - oz * ex;
      if (Math.abs(denom) > 1e-5) {
        const d = ((p1[0] - px) * ez - (p1[1] - pz) * ex) / denom, s = ((p1[0] - px) * oz - (p1[1] - pz) * ox) / denom;
        if (d > .05 && d < 1.5 && s >= 0 && s <= 1 && d < minD) minD = d;
      }
    }
    return minD;
  };

  /** Trou brut → trou calculé : bordures en boîtes (arêtes axiales du polygone), fonction de hauteur du sol G(x,z) (-Infinity = vide / hors terrain). */
  function compile(h) {
    const poly = h.poly, ramps = h.ramps || [], voids = h.voids || [], water = h.water || [], pits = voids.concat(water), walls = (h.walls || []).map((w) => w.slice()), n = poly.length, A = area(poly), s = A > 0 ? 1 : -1, t = BORDER_T;
    const curbRamps = [];
    const isCurbMatch = (ux, uz, emx, emz, c) => {
      if (!inR(emx, emz, c)) return false;
      if (c[2] > c[3] * 1.5 && Math.abs(ux) < .5) return false;
      if (c[3] > c[2] * 1.5 && Math.abs(uz) < .5) return false;
      return true;
    };
    const G_base = (x, z) => {
      let y = NEG; for (const r of ramps) if (inR(x, z, r)) y = Math.max(y, rampY(r, x, z));
      if (y > NEG) return y;
      if (!inPoly(x, z, poly)) return NEG;
      for (const v of pits) if (inR(x, z, v)) return NEG; return 0;
    };
    const Gb = (x, z) => {
      let y = NEG; for (const r of ramps) if (inR(x, z, r)) y = Math.max(y, rampY(r, x, z));
      if (y > NEG) return y;
      let curbY = NEG;
      for (const c of curbRamps) {
        const dx = x - c.ax, dz = z - c.az, u = dx * c.ux + dz * c.uz;
        if (u >= c.u0 - .02 && u <= c.u1 + .02) {
          const o = dx * c.ox + dz * c.oz;
          if (o >= -.04 && o <= .12) {
            const cy = c.gy + ((o + .04) / c.W) * c.H;
            if (cy > curbY) curbY = cy;
          }
        }
      }
      if (curbY > NEG) return curbY;
      if (!inPoly(x, z, poly)) return NEG;
      for (const v of pits) if (inR(x, z, v)) return NEG; return 0;
    };
    const cv = (p, q, r) => ((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])) * A > 0;
    const bsegs = [], dw = [];   // dw : murs orientés {x,z,l,t,ux,uz,h,y0?} (arêtes obliques du polygone et murs `diag`)
    const gaps = h.gaps || [], curbs = h.curbs || [];
    const edgeCurbs = [];
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      const c0 = curbs.some((c) => isCurbMatch(ux, uz, a[0] + ux * .05, a[1] + uz * .05, c));
      const c1 = curbs.some((c) => isCurbMatch(ux, uz, a[0] + ux * (L - .05), a[1] + uz * (L - .05), c));
      edgeCurbs.push({ c0, c1 });
    }
    // bordures : même hauteur (BORDER_H) au-dessus du sol local, par tronçons de 0,1 m fusionnés (hauteur arrondie à 2 cm)
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], pv = poly[(i + n - 1) % n], nx = poly[(i + 2) % n], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      const ea = cv(pv, a, b) ? ext(pv, a, b, t) : 0, eb = cv(a, b, nx) ? ext(a, b, nx, t) : 0, ox = uz * s, oz = -ux * s, m = Math.max(1, Math.round(L / .1)), tops = [];
      const prevC = edgeCurbs[(i + n - 1) % n], nextC = edgeCurbs[(i + 1) % n];
      const curbCornerA = edgeCurbs[i].c0 && prevC.c1, curbCornerB = edgeCurbs[i].c1 && nextC.c0;
      for (let k = 0; k < m; k++) { let g = 0; for (const f of [0, .5, 1]) { const u = (k + f) / m * L, y = G_base(a[0] + ux * u - ox * .06, a[1] + uz * u - oz * .06); if (y > g) g = y; } tops.push(Math.ceil((g + BORDER_H) / .02 - 1e-6) * .02); }
      const hs = []; for (let j = 0; j <= m; j++) { const u = j / m * L; hs.push(Math.max(0, G_base(a[0] + ux * u - ox * .06, a[1] + uz * u - oz * .06)) + BORDER_H); }
      bsegs.push({ a, u: [ux, uz], o: [ox, oz], L, ea, eb, hs, gaps, curbs, curbCornerA, curbCornerB });   // profil lisse pour le rendu (la physique reste en paliers ≥ au profil)
      const curbSlice = [], gapSlice = [];
      for (let k = 0; k < m; k++) {
        const smx = a[0] + ux * (k + .5) / m * L, smz = a[1] + uz * (k + .5) / m * L;
        curbSlice.push(curbs.some((c) => isCurbMatch(ux, uz, smx, smz, c)));
        gapSlice.push(gaps.some((g) => inR(smx, smz, g)));
      }
      for (let k = 0; k < m;) {
        let e = k; while (e + 1 < m && tops[e + 1] === tops[k] && curbSlice[e + 1] === curbSlice[k] && gapSlice[e + 1] === gapSlice[k]) e++;
        if (!gapSlice[k]) {
          const isCurb = curbSlice[k];
          if (isCurb) {
            const cu = ((k + e + 1) / (2 * m)) * L, emx = a[0] + ux * cu, emz = a[1] + uz * cu;
            const gy = G_base(emx, emz);
            const cu0 = k / m * L - (k === 0 && curbCornerA ? ea : 0);
            const cu1 = (e + 1) / m * L + (e === m - 1 && curbCornerB ? eb : 0);
            curbRamps.push({ ax: a[0], az: a[1], ux, uz, ox, oz, u0: cu0, u1: cu1, W: .16, H: .065, gy: isFinite(gy) ? gy : 0 });
          } else {
            const u0 = k / m * L - (k === 0 ? ea : 0), u1 = (e + 1) / m * L + (e === m - 1 ? eb : 0), cu = (u0 + u1) / 2, cx = a[0] + ux * cu + ox * t / 2, cz = a[1] + uz * cu + oz * t / 2;
            if (dx !== 0 && dz !== 0) dw.push({ x: cx, z: cz, l: u1 - u0, t, ux, uz, h: tops[k], bd: 1 });
            else { const bw = dz === 0 ? [cx, cz, u1 - u0, t, tops[k]] : [cx, cz, t, u1 - u0, tops[k]]; bw.bd = 1; walls.push(bw); }
          }
        }
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
    const puits = (h.puits || []).map((p) => {
      let ex = p[0], ez = p[1], sx = p[2], sz = p[3], dir = p[4], fy = p[5];
      let dx, dz;
      if (typeof p[4] === 'number' && typeof p[5] === 'number' && p.length >= 7) {
        dx = p[4]; dz = p[5]; fy = p[6];
      } else {
        const vx = sx - ex, vz = sz - ez, L = Math.hypot(vx, vz);
        const ux = L > 1e-4 ? vx / L : 0, uz = L > 1e-4 ? vz / L : 1;
        if (dir === 'derrière' || dir === 'derriere' || dir === 'back') { dx = -ux; dz = -uz; }
        else if (dir === 'gauche' || dir === 'left') { dx = -uz; dz = ux; }
        else if (dir === 'droite' || dir === 'right') { dx = uz; dz = -ux; }
        else if (Array.isArray(dir)) { const dl = Math.hypot(dir[0], dir[1]) || 1; dx = dir[0] / dl; dz = dir[1] / dl; }
        else { dx = ux; dz = uz; }
      }
      return { ex, ez, sx, sz, dx, dz, fy: fy !== undefined ? fy : 0, dir };
    });
    const G = (x, z) => {
      const y = Gb(x, z);
      if (y === NEG) return NEG;
      if ((x - cx) ** 2 + (z - cz) ** 2 < CUP_R * CUP_R) return NEG;
      for (const p of puits) {
        if ((x - p.ex) ** 2 + (z - p.ez) ** 2 < CUP_R * CUP_R) return NEG;
      }
      return y;
    };
    // zones au sol : 1 sable (freine), 2 glace (glisse), 3 boost (accélère dans la direction d), 4 trampoline (fait sauter) ; vent : accélération constante, au sol comme en l’air
    const zones = [].concat((h.sand || []).map((r) => ({ t: 1, r })), (h.ice || []).map((r) => ({ t: 2, r })), (h.boost || []).map((r) => ({ t: 3, r: r.slice(0, 4), d: [r[4], r[5]] })), (h.pads || []).map((r) => ({ t: 4, r })));
    const winds = (h.wind || []).map((r) => ({ r: r.slice(0, 4), a: [r[4], r[5]] }));
    const zone = (x, z) => { for (const q of zones) if (inR(x, z, q.r)) return q; return null; };
    const moulins = (h.moulins || []).map((m) => [m[0], m[1], m[2], m[3], m[4] || 'v', m[5] !== undefined ? m[5] : ((m[4] === 'z' || m[4] === 'x') ? (Gb(m[0], m[1]) || 0) + m[2] : (Gb(m[0], m[1]) || 0)), m[6] || 0]);
    return { bsegs, dw, name: h.name, start: h.start, cup: h.cup, yaw: h.yaw, poly, walls, ramps, voids, water, zones, winds, zone, bumpers: h.bumpers || [], portals: h.portals || [], moulins, puits, curbs: h.curbs || [], gaps: h.gaps || [], rest: h.rest === undefined ? REST : h.rest, A, G, Gb, cupY: Gb(cx, cz), depth: h.depth || CUP_D, wt: 0 };
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
    if (b.shaft) {
      b.shaft.t += dt;
      const f = Math.min(1, b.shaft.t / b.shaft.T);
      b.x = b.shaft.ex + (b.shaft.sx - b.shaft.ex) * f;
      b.z = b.shaft.ez + (b.shaft.sz - b.shaft.ez) * f;
      const y0 = b.shaft.ey - 0.12, y1 = b.shaft.fy - 0.08;
      b.y = y0 * (1 - f) + y1 * f - 0.22 * Math.sin(f * Math.PI);
      b.vx = b.shaft.dx * b.shaft.vExit * f;
      b.vz = b.shaft.dz * b.shaft.vExit * f;
      b.vy = 0;
      b.ground = false;
      if (f >= 1) {
        b.x = b.shaft.sx + b.shaft.dx * (R + .04);
        b.z = b.shaft.sz + b.shaft.dz * (R + .04);
        b.y = b.shaft.fy + .18;
        b.vx = b.shaft.dx * b.shaft.vExit;
        b.vz = b.shaft.dz * b.shaft.vExit;
        b.vy = .05;
        b.ground = false;
        b.shaft = null;
        b.rest = false;
        b.t = 0;
      }
      return;
    }
    // Entrée dans le puits : même physique que le trou final (déviation si trop fort ou sur le bord)
    for (const p of h.puits || []) {
      const dx = b.x - p.ex, dz = b.z - p.ez, d = Math.hypot(dx, dz);
      if (d <= CUP_R + R) {
        const top = isFinite(h.Gb(p.ex, p.ez)) ? h.Gb(p.ex, p.ez) : 0, fl = top - h.depth;
        const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0, ddh = d - CUP_R;
        if (ddh <= 0 || b.y > top) {
          const dy = b.y - Math.max(fl, Math.min(top, b.y)), dist = Math.hypot(ddh, dy);
          if (dist < R && dist > 1e-6) {
            const nx = ddh / dist * ux, ny = dy / dist, nz = ddh / dist * uz, pn = R - dist;
            b.x += nx * pn; b.y += ny * pn; b.z += nz * pn;
            const vn = b.vx * nx + b.vy * ny + b.vz * nz;
            if (vn < 0) { const k = (1 + (vn < -.5 ? REST : 0)) * vn; b.vx -= k * nx; b.vy -= k * ny; b.vz -= k * nz; }
          }
        }
        if (d < CUP_R && b.y < top - 0.04 && !b.shaft) {
          const vIn = Math.hypot(b.vx, b.vy, b.vz);
          const dh = Math.max(0, top - p.fy), L = Math.hypot(p.sx - p.ex, p.sz - p.ez);
          const vExit = Math.max(2.2, Math.min(9.5, Math.sqrt(vIn * vIn + 2 * G * dh) * 0.8));
          const vAvg = (Math.max(vIn, 1.5) + vExit) / 2;
          const T = Math.max(0.38, Math.min(1.3, Math.hypot(L, dh) / vAvg));
          b.shaft = { ex: p.ex, ez: p.ez, ey: top, sx: p.sx, sz: p.sz, fy: p.fy, dx: p.dx, dz: p.dz, vExit, T, t: 0 };
          b.vx = 0; b.vy = 0; b.vz = 0; b.ground = false; b.rest = false;
          return;
        }
      }
    }
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
        let nx = nu * q.ux - nv * q.uz, nz = nu * q.uz + nv * q.ux;
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
    // moulins : solides (moyeu + pilier vertical + 4 pales en bois) [x, z, L, w, pose, yc, a0]
    for (const m of h.moulins) {
      const mx = m[0], mz = m[1], L = m[2], w = m[3], pose = m[4], yc = m[5], a0 = m[6] || 0;
      const gy = h.Gb(mx, mz), y0 = isFinite(gy) ? gy : 0, ang = h.wt * w + a0, Rh = .16;
      // pilier vertical solide sous le moyeu pour les poses verticales (z et x)
      if (pose === 'z' || pose === 'x') {
        const dpx = b.x - mx, dpz = b.z - mz, dp2 = dpx * dpx + dpz * dpz, Rp = .10;
        if (dp2 < (Rp + R) * (Rp + R) && b.y <= yc + R && b.y >= y0 - R) {
          const d = Math.sqrt(dp2) || 1e-6, nx = dpx / d, nz = dpz / d, pn = Rp + R - d;
          b.x += nx * pn; b.z += nz * pn;
          const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vz -= 1.6 * vn * nz; }
          hit = true;
        }
      }
      if (pose === 'v') {
        const dx = b.x - mx, dz = b.z - mz, d2 = dx * dx + dz * dz;
        if (d2 < (Rh + R) * (Rh + R) && b.y < y0 + .4 + R) {
          const d = Math.sqrt(d2) || 1e-6, nx = dx / d, nz = dz / d, pn = Rh + R - d;
          b.x += nx * pn; b.z += nz * pn;
          const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vz -= 1.6 * vn * nz; }
          hit = true;
        }
        const T = .07, H = .22;
        if (b.y <= y0 + H + R && Math.hypot(dx, dz) <= L + R + .05) {
          for (let k = 0; k < 4; k++) {
            const a = ang + k * Math.PI * .5, ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux;
            const lu = dx * ux + dz * uz, lv = dx * vx + dz * vz;
            if (lu < Rh - R || lu > L + R || Math.abs(lv) > T / 2 + R) continue;
            const cu = Math.max(Rh, Math.min(L, lu)), cv = Math.max(-T / 2, Math.min(T / 2, lv));
            const eu = lu - cu, ev = lv - cv, ed2 = eu * eu + ev * ev;
            if (ed2 < R * R) {
              const ed = Math.sqrt(ed2) || 1e-6, nu = eu / ed, nv = ev / ed;
              const nx = nu * ux + nv * vx, nz = nu * uz + nv * vz;
              b.x += nx * (R - ed); b.z += nz * (R - ed);
              const vt = w * cu, vtx = vx * vt, vtz = vz * vt;
              const vn = (b.vx - vtx) * nx + (b.vz - vtz) * nz;
              if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vz -= 1.6 * vn * nz; }
              b.vx += vtx * .3; b.vz += vtz * .3; b.rest = false; hit = true;
            }
          }
        }
      } else if (pose === 'z') {
        const dx = b.x - mx, dy = b.y - yc, dz = b.z - mz;
        if (Math.abs(dz) <= .18 + R) {
          const dxy2 = dx * dx + dy * dy;
          if (dxy2 < (Rh + R) * (Rh + R)) {
            const d = Math.sqrt(dxy2) || 1e-6, nx = dx / d, ny = dy / d, pn = Rh + R - d;
            b.x += nx * pn; b.y += ny * pn;
            const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
            hit = true;
          }
          const Tw = .07, Tz = .25;
          if (Math.abs(dz) <= Tz / 2 + R && Math.hypot(dx, dy) <= L + R + .05) {
            for (let k = 0; k < 4; k++) {
              const a = ang + k * Math.PI * .5, ux = Math.sin(a), uy = -Math.cos(a), vx = Math.cos(a), vy = Math.sin(a);
              const lu = dx * ux + dy * uy, lv = dx * vx + dy * vy;
              if (lu < Rh - R || lu > L + R || Math.abs(lv) > Tw / 2 + R) continue;
              const cu = Math.max(Rh, Math.min(L, lu)), cv = Math.max(-Tw / 2, Math.min(Tw / 2, lv)), cz = Math.max(-Tz / 2, Math.min(Tz / 2, dz));
              const eu = lu - cu, ev = lv - cv, ez = dz - cz, ed2 = eu * eu + ev * ev + ez * ez;
              if (ed2 < R * R) {
                const ed = Math.sqrt(ed2) || 1e-6, nu = eu / ed, nv = ev / ed, nz = ez / ed;
                const nx = nu * ux + nv * vx, ny = nu * uy + nv * vy;
                b.x += nx * (R - ed); b.y += ny * (R - ed); b.z += nz * (R - ed);
                const vt = w * cu, vtx = vx * vt, vty = vy * vt;
                const vn = (b.vx - vtx) * nx + (b.vy - vty) * ny + b.vz * nz;
                if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; b.vz -= 1.6 * vn * nz; }
                b.vx += vtx * .3; b.vy += vty * .3; b.rest = false; hit = true;
              }
            }
          }
        }
      } else if (pose === 'x') {
        const dx = b.x - mx, dy = b.y - yc, dz = b.z - mz;
        if (Math.abs(dx) <= .18 + R) {
          const dyz2 = dy * dy + dz * dz;
          if (dyz2 < (Rh + R) * (Rh + R)) {
            const d = Math.sqrt(dyz2) || 1e-6, ny = dy / d, nz = dz / d, pn = Rh + R - d;
            b.y += ny * pn; b.z += nz * pn;
            const vn = b.vy * ny + b.vz * nz; if (vn < 0) { b.vx -= 1.6 * vn * ny; b.vz -= 1.6 * vn * nz; }
            hit = true;
          }
          const Tw = .07, Tx = .25;
          if (Math.abs(dx) <= Tx / 2 + R && Math.hypot(dy, dz) <= L + R + .05) {
            for (let k = 0; k < 4; k++) {
              const a = ang + k * Math.PI * .5, uz = Math.sin(a), uy = -Math.cos(a), vz = Math.cos(a), vy = Math.sin(a);
              const lu = dz * uz + dy * uy, lv = dz * vz + dy * vy;
              if (lu < Rh - R || lu > L + R || Math.abs(lv) > Tw / 2 + R) continue;
              const cu = Math.max(Rh, Math.min(L, lu)), cv = Math.max(-Tw / 2, Math.min(Tw / 2, lv)), cx = Math.max(-Tx / 2, Math.min(Tx / 2, dx));
              const eu = lu - cu, ev = lv - cv, ex = dx - cx, ed2 = eu * eu + ev * ev + ex * ex;
              if (ed2 < R * R) {
                const ed = Math.sqrt(ed2) || 1e-6, nu = eu / ed, nv = ev / ed, nx = ex / ed;
                const nz = nu * uz + nv * vz, ny = nu * uy + nv * vy;
                b.x += nx * (R - ed); b.y += ny * (R - ed); b.z += nz * (R - ed);
                const vt = w * cu, vtz = vz * vt, vty = vy * vt;
                const vn = (b.vz - vtz) * nz + (b.vy - vty) * ny + b.vx * nx;
                if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; b.vz -= 1.6 * vn * nz; }
                b.vz += vtz * .3; b.vy += vty * .3; b.rest = false; hit = true;
              }
            }
          }
        }
      }
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
    const b = { x, y: h.G(x, z) + R, z, vx: 0, vy: 0, vz: 0, ground: true, rest: true, sunk: false, pit: false, oob: false, out: false, t: 0, ox: x, oz: z, shaft: null };
    w.balls.push(b); return b;
  }
  function step(w, dt) { w.acc += dt; w.hole.wt += dt; let n = 0; while (w.acc >= DT && n++ < 40) { w.acc -= DT; for (const b of w.balls) { const c = w.hole.cup, k = b.rest || b.sunk || Math.hypot(b.x - c[0], b.z - c[1]) > .7 ? 1 : Math.max(1, Math.min(8, Math.ceil(Math.hypot(b.vx, b.vy, b.vz) * DT / .006))); for (let i = 0; i < k; i++) stepBall(w.hole, b, DT / k, w.obs); } if (w.balls.length > 1) collide(w.balls); } }
  /** Putt horizontal : puissance 0–100 → vitesse. */
  function hit(b, yaw, power) { const v = SHOT_VMAX * power / 100; b.vx = Math.sin(yaw) * v; b.vz = Math.cos(yaw) * v; b.vy = 0; b.rest = false; b.ground = true; b.t = 0; b.ox = b.x; b.oz = b.z; b.shaft = null; }
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
  function place(w, b, x, z) { b.x = x; b.z = z; b.y = w.hole.G(x, z) + R; b.vx = b.vy = b.vz = 0; b.ground = true; b.rest = true; b.pit = false; b.pin = false; b.oob = false; b.out = false; b.ox = x; b.oz = z; b.shaft = null; }
  M.physics = { R, SHOT_VMAX, BOOST_A, CUP_R, FR_C, FR_L, inR, inPoly, distToOpp, createWorld, addBall, step, hit, recover, place };
})();
