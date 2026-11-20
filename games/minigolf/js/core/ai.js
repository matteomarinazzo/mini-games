// IA : essaie des tirs dans une copie du monde (même physique : murs, rampes, vides, bordures, autres balles), garde le meilleur, puis ajoute l’erreur de son profil.
// Chaque IA tire un profil en début de partie : précision (erreur d’angle et de puissance), finesse de recherche, et hésitation entre les bons tirs.
(function () {
  const M = window.Minigolf = window.Minigolf || {};
  // Distance parcourue sur le plat pour une vitesse v (frottement FR_C + FR_L·v) : d = v/L − (C/L)·ln((v+C/L)/(C/L)), C/L = 3 ; L = .3
  const dist = (v) => v / .3 - 10 * Math.log((v + 3) / 3);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / .5;   // ≈ N(0, 1)
  const TAU = Math.PI * 2;
  /** Segment a→b libre : dans le polygone, hors murs et hors autres balles (les vides se sautent). */
  function lineOk(h, obs, a, b) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / .08)), R = M.physics.R;
    for (let k = 1; k < n; k++) {
      const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      if (!M.physics.inPoly(x, z, h.poly)) return false;
      for (const q of h.walls) if (!(q[5] > 0) && Math.abs(x - q[0]) <= q[2] / 2 + R && Math.abs(z - q[1]) <= q[3] / 2 + R) return false;
      for (const o of obs) if (Math.hypot(x - o.x, z - o.z) < 2 * R + .02) return false;
    }
    return true;
  }
  M.ai = {
    /** Ancienne visée directe (sans obstacles), gardée pour mémoire. */
    planShot(ball, hole, error = .1) {
      const dx = hole.cup[0] - ball.x, dz = hole.cup[1] - ball.z, d = Math.hypot(dx, dz), vmax = (M.physics && M.physics.SHOT_VMAX) || 10.5, r = () => Math.random() * 2 - 1;
      let lo = 0, hi = vmax; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (dist(m) < d + .15) lo = m; else hi = m; }
      return { yaw: Math.atan2(dx, dz) + r() * error * .5, power: Math.max(8, Math.min(100, lo / vmax * 100 * (1 + r() * error))) };
    },
    /** Profil tiré au hasard : acc 0,75 (correct) → 0,98 (très précis). Aucune IA n’est mauvaise. */
    profile() {
      const acc = .75 + Math.random() * .23;
      return { acc, angle: (1 - acc) * .12, power: (1 - acc) * .3, topk: 1 + Math.round((1 - acc) * 3), rounds: 2 + Math.round(acc * 2), budget: 250 + acc * 350 };
    },
    /** world = monde de l’hôte (hole compilé + obs), ball = balle qui joue. → { yaw, power (8–100) } */
    plan(world, ball, pr) {
      const P = M.physics, h = world.hole, cup = h.cup, t0 = performance.now(), all = [], ia = world.balls.indexOf(ball), obs = world.balls.filter((x) => x !== ball).map((x) => ({ x: x.x, z: x.z }));
      const ev = (yaw, pw) => {
        pw = Math.max(8, Math.min(100, pw));
        const bs = world.balls.map((x) => Object.assign({}, x)), b = bs[ia], w = { hole: Object.assign({}, h), balls: bs, acc: 0 }; P.hit(b, yaw, pw);   // toutes les balles : elles se percutent
        for (let i = 0; i < 80 && !bs.every((x) => x.rest || x.sunk); i++) P.step(w, 1 / 6);
        const d = Math.hypot(b.x - cup[0], b.z - cup[1]);
        const c = { yaw, pw, s: b.sunk ? -1 : b.oob ? 50 + d : d + (lineOk(h, obs, [b.x, b.z], cup) ? 0 : 1.2) };   // arrêt sans ligne vers la coupe = pénalisé
        all.push(c); return c;
      };
      const base = Math.atan2(cup[0] - ball.x, cup[1] - ball.z), NY = (h.portals && h.portals.length) ? 48 : 16; let best = null;
      for (let i = 0; i < NY; i++) for (const pw of [14, 30, 46, 62, 78, 94]) { const c = ev(base + i * TAU / NY, pw); if (!best || c.s < best.s) best = c; }
      for (const p of h.portals || []) for (let k = 0; k < 2; k++) { const yw = Math.atan2(p[k * 2] - ball.x, p[k * 2 + 1] - ball.z); for (const pw of [20, 34, 48, 62, 76, 90]) { const c = ev(yw, pw); if (!best || c.s < best.s) best = c; } }   // vise aussi les portails
      let dy = TAU / NY, dp = 16;
      for (let r = 0; r < pr.rounds && performance.now() - t0 < pr.budget; r++) {
        dy /= 2.5; dp /= 2.5; const c0 = best;
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const c = ev(c0.yaw + i * dy, c0.pw + j * dp); if (c.s < best.s) best = c; }
      }
      all.sort((a, b) => a.s - b.s);
      const pool = all.filter((c) => c.s <= all[0].s + 1.2).slice(0, pr.topk), pick = pool[Math.floor(Math.random() * pool.length)];
      return { yaw: pick.yaw + gauss() * pr.angle, power: Math.max(8, Math.min(100, pick.pw * (1 + gauss() * pr.power))) };
    },
  };
})();
