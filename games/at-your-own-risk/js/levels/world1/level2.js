const B = '#feb854';
export default {
  name: 'Niveau 2', start: { x: 600, y: 318 }, bounds: [94, 676], bg: '#996b07',
  build: () => ({
    ents: [
      { id: 'room', k: 'deco', x: 100, y: 250, w: 600, h: 100, c: B },
      { id: 'floor', k: 'floor', x: 100, y: 350, w: 600, h: 1 },
      { id: 'g', k: 'gap', x: 525, y: 350, w: 50, h: 250, c: B, on: false },
      { id: 'sp', k: 'spike', x: 250, y: 340, w: 25, h: 10, d: true, on: false }],
    portal: { x: 200, y: 320, w: 30, h: 30 },
    rules: [
      {
        if: s => s.p.x <= 590,
        do: s =>
          s.E.g.on = true
      },   // trou
      {
        if: s => s.p.x <= 290,
        do: s =>
          s.E.sp.on = true
      }
    ]  // pique surgit devant le portail
  })
};
