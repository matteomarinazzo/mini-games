// N7 : à x>=600 5 boutons sortent. B1 mort, B2 (bonne) mur enfoncé, B3 trou, B4 portail tombe, B5 aspiré vers les piques.
const D = '#996b07';
const T = '#feb854';
const B = [0, 1, 2, 3, 4];
const FX = [
  s => s.die(),
  s => {
    s.f.mur = 1;
    s.b[1] = 774;
  },
  s => {
    s.E.gap.on = true;
    s.f.drop = 1;
  },
  s => {
    s.f.pf = 1;
  },
  s => {
    s.f.up = 1;
    for (const c of ['c0', 'c1']) Object.assign(s.E[c], { tx: s.E[c].x, ty: 100, tk: 1 });
  }
]

export default {
  name: 'Niveau 7', start: { x: 0, y: 468 }, bounds: [-6, 626], bg: T,
  build: () => ({
    ents: [
      { id: 'roof', k: 'solid', x: -10, y: 0, w: 820, h: 100, c: D },
      { id: 'floor', k: 'floor', x: -10, y: 500, w: 820, h: 100, c: D },
      { id: 'wall', k: 'deco', x: 650, y: 200, w: 50, h: 400, c: D },
      { id: 'gap', k: 'gap', x: 275, y: 500, w: 66, h: 100, c: T, on: false },
      { id: 'c0', k: 'spike', x: 482, y: 90, w: 25, h: 10, r: 2, d: true },
      { id: 'c1', k: 'spike', x: 507, y: 90, w: 25, h: 10, r: 2, d: true },
      { id: 'q', k: 'spike', x: 650, y: 510, w: 25, h: 10, d: true, on: false },
      ...B.map(i => ({ id: 'b' + i, k: 'btn', x: 100 + 100 * i, y: 484, w: 16, h: 16, c: '#d22', on: false })),
    ],

    portal: { x: 750, y: 470, w: 30, h: 30 },
    rules: [
      {
        if: s => s.p.x >= 600,
        do: s =>
          B.forEach(
            i => Object.assign(s.E['b' + i], { tx: s.E['b' + i].x, ty: 484, tk: .5, on: true }))
      },
      ...B.map(i => ({
        if: s => s.hit(s.E['b' + i]) && s.E['b' + i].on,
        do:
          s => {
            Object.assign(s.E['b' + i], { tx: undefined, y: 492, h: 8 }); FX[i](s);
          }
      })),
      {
        once: false,
        if: s => s.f.pf && s.portal.y <= 600,
        do: s =>
          s.portal.y++
      },
      {
        once: false,
        if: s => s.f.up,
        do: s => {
          s.p.y -= 18;
          s.p.vy = 0;
        }
      },

      {
        once: false,
        if: s => s.f.up && s.p.y <= s.E.roof.y + s.E.roof.h,
        do: s => {
          s.f.up = 0;
        }
      },
      {
        once: false,
        if: s => s.f.mur && s.E.wall.y <= 700,
        do: s => {
          s.E.wall.y += 2
        }
      },
      {
        if: s => s.f.mur && s.p.x >= 600,
        do: s =>
          Object.assign(s.E.q, { on: true, y: 490 })
      },
      {
        if: s => s.f.mur && s.p.x >= 650,
        do: s =>
          s.E.q.x = 675
      },
      // Descendre le bouton b2 quand on pèse dessus
      {
        once: false,
        if: s => s.f.drop && s.E.b2.y < 600,
        do: s =>
          s.E.b2.y += 8
      },
    ]
  })
};
