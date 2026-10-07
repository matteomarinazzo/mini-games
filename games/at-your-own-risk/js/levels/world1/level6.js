// N6 : la plateforme 1 monte (piques de plafond), la 2 la rejoint, glisse à droite puis tombe ; la 3 est un leurre.
// Ajustement jouabilité : plateforme 2 démarre en y=700, monte à 2 px/frame, x=260 (Python : 900, 1 px, x=300 = injouable).
const D = '#996b07';
export default {
  name: 'Niveau 6', start: { x: 0, y: 368 }, bounds: [-6, 774], bg: '#feb854',
  build: () => ({
    ents: [
      { id: 's0', k: 'solid', x: -100, y: 400, w: 200, h: 25, c: D },
      { id: 's1', k: 'solid', x: 100, y: 400, w: 100, h: 25, c: D, mv: 1 },
      { id: 's2', k: 'solid', x: 260, y: 950, w: 100, h: 25, c: D, mv: 1 },
      { id: 's3', k: 'deco', x: 500, y: 1400, w: 100, h: 25, c: D },
      { id: 's4', k: 'solid', x: 750, y: 400, w: 50, h: 25, c: D },
      ...[0, 1, 2, 3].map(i => ({ id: 'c' + i, k: 'spike', x: 100 + 25 * i, y: -50, w: 25, h: 10, r: 2, d: 1 }))],
    portal: { x: 760, y: 370, w: 30, h: 30 },
    rules: [
      {
        if: s => s.p.x >= 100,
        do: s =>
          s.f.b = 1
      },
      {
        once: false,
        if: s => s.f.b,
        do: s => {
          const { s1, s2, s3 } = s.E;
          if (s1.y >= -100) {
            s1.y--;
          }
          if (s3.y >= -100) {
            s3.y--;
          }
          if (s2.y >= 70 && !s.f.d) {
            s2.y--;
          } else if (s2.x < 560) {
            s2.x++; s.f.d = 1;
          } else if (s2.y <= 700) {
            s2.y += 10;
          }
        }
      },
      {
        if: s => s.E.s1.y <= 70,
        do: s => {
          for (let i = 0; i < 4; i++)
            Object.assign(s.E['c' + i], { tx: s.E['c' + i].x, ty: 0, tk: 1 });
        }
      }
    ]
  })
};
