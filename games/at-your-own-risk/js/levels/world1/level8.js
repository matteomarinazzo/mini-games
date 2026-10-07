// N8 : escalier. x>=100 mur+piques latéraux 2 s ; x>=280 piques sur la 3e marche 2 s ; x>=650 trou avant le portail.
const D = '#996b07';
export default {
  name: 'Niveau 8', start: { x: 0, y: 368 }, bounds: [-6, 774], bg: '#feb854',
  build: () => ({
    ents: [
      ...[[0, 400, 160, 200], [160, 375, 160, 300], [320, 350, 160, 250], [480, 325, 160, 275], [640, 300, 160, 300]]
        .map((a, i) => ({ id: 's' + i, k: 'solid', x: a[0], y: a[1], w: a[2], h: a[3], c: D, mv: i == 1 ? 1 : 0 })),
      { id: 'g', k: 'gap', x: 700, y: 300, w: 50, h: 300, c: '#feb854', on: false },
      ...[0, 1, 2, 3].map(i => ({ id: 'l' + i, k: 'spike', x: 160, y: 375 + 25 * i, w: 10, h: 25, r: 3, d: true, on: true })),
      ...[0, 1, 2, 3].map(i => ({ id: 'u' + i, k: 'spike', x: 320 + 25 * i, y: 350, w: 25, h: 10, d: true, on: true }))

    ],

    portal: { x: 760, y: 270, w: 30, h: 30 },
    rules: [
      // ALLER : une seule fois (flag), animation tant que la phase = 1
      {
        if: s => s.p.x >= 120 && !s.f.done && s.f.ph === undefined,
        do: s => { s.f.ph = 1; s.f.t0 = s.t; }
      },
      {
        once: false,
        if: s => s.f.ph === 1,
        do: s => {
          if (s.E.s1.y > 355) s.E.s1.y = Math.max(s.E.s1.y - 5, 355);
          for (let i = 0; i < 4; i++) {
            const l = s.E['l' + i];
            const ty = 355 + 25 * i;
            if (l.y > ty) l.y = Math.max(l.y - 5, ty);
            if (l.x > 150) l.x = Math.max(l.x - 5, 150);
          }
        }
      },

      // RETOUR : dĂ©clenchĂ© aprĂšs 120 frames, passe en phase 2
      {
        if: s => s.f.ph === 1 && s.t - s.f.t0 >= 120,
        do: s => { s.f.ph = 2; }
      },
      {
        once: false,
        if: s => s.f.ph === 2,
        do: s => {
          const m = s.E.s1;
          if (m.y < 375) m.y = Math.min(m.y + 5, 375);
          let fini = m.y === 375;
          for (let i = 0; i < 4; i++) {
            const l = s.E['l' + i];
            const ty = 375 + 25 * i;
            if (l.y < ty) l.y = Math.min(l.y + 5, ty);
            if (l.x < 160) l.x = Math.min(l.x + 5, 160);
            if (l.y !== ty || l.x !== 160) fini = false;
          }
          if (fini) { s.f.ph = 3; s.f.done = 1; }   // verrouille pour toujours
        }
      },
      {
        once: false,
        if: s => s.p.x >= 280,
        do: s => {
          s.f.t1 = s.t;
          for (let i = 0; i < 4; i++) {
            const u = s.E['u' + i];
            if (u.y > 340)
              u.y -= 5
          }
        }
      },
      {
        once: false,
        if: s => s.f.t1 !== undefined && s.t - s.f.t1 >= 120,
        do: s => {
          for (let i = 0; i < 4; i++) {
            const u = s.E['u' + i];
            u.on = false;
            if (u.y < 350)
              u.y += 5
          }
        }
      },
      {
        if: s => s.p.x >= 650,
        do: s => {
          s.E.g.on = true
        }
      }]
  })
};
