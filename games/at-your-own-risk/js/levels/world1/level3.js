const B = '#feb854';
export default {
  name: 'Niveau 3', start: { x: 600, y: 318 }, bounds: [94, 676], bg: '#996b07',
  build: () => ({
    ents: [
      { id: 'room', k: 'deco', x: 100, y: 250, w: 600, h: 100, c: B },
      { id: 'floor', k: 'floor', x: 100, y: 350, w: 600, h: 1 },
      { id: 'g1', k: 'gap', x: 525, y: 350, w: 50, h: 250, c: B, on: false },
      { id: 'g2', k: 'gap', x: 425, y: 350, w: 50, h: 250, c: B, on: false },
      { id: 'sp', k: 'spike', x: 250, y: 340, w: 25, h: 10, d: true }],
    portal: { x: 200, y: 320, w: 30, h: 30 },
    rules: [
      {
        if: s => s.p.x <= 590,
        do: s =>
          s.E.g1.on = true
      },
      {
        if: s => s.p.x <= 490 && s.E.g1.on,
        do: s =>
          s.E.g2.on = true
      },
      // le pique glisse de 25 px vers le joueur
      {
        if: s => s.p.x <= 300,
        do: s =>
          Object.assign(s.E.sp, { tx: 275, ty: 340, tk: .5 })
      }
    ]
  })
};
