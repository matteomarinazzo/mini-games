// N5 : plateforme haute -> sauter dans le vide à droite -> mur de piques -> retour à gauche (le vide se comble) -> bouton -> dernier pique.
const D = '#996b07', sp = (id, x, y) => ({ id, k: 'spike', x, y, w: 25, h: 10, d: true, on: false });
export default {
  name: 'Niveau 5', start: { x: 0, y: 68 }, bounds: [-6, 774], bg: '#feb854',
  build: () => ({
    ents: [
      { id: 'p0', k: 'solid', x: -100, y: 100, w: 300, h: 50, c: D },
      { id: 'p1', k: 'solid', x: 300, y: 400, w: 500, h: 200, c: D },
      { id: 'p2', k: 'solid', x: -100, y: 700, w: 500, h: 190, c: D, mv: 1 },
      { id: 'b', k: 'btn', x: 100, y: 684, w: 16, h: 16, c: '#d22', cp: '#7a1111' },
      ...[0, 1, 2, 3, 4, 5, 6].map(i => sp('w' + i, 500 + 25 * i, 400 - 10)), sp('s2', 650, 400), sp('s3', 150, 100)],
    portal: { x: 700, y: 370, w: 30, h: 30 },
    rules: [
      {
        if: s => s.p.x >= 100,
        do: s =>
          Object.assign(s.E.s3, { on: true, tx: 150, ty: 90, tk: .5 })
      },
      {
        once: false,
        if: s => s.p.x >= 450 && !s.f.m,
        do: s => {
          for (let i = 0; i < 7; i++) s.E['w' + i].on = true;
          s.f.peut = 1;
        }
      },
      {
        if: s => s.f.peut && s.p.x < 274,
        do: s => {
          Object.assign(s.E.p2, { tx: 0, ty: 425, tk: .1 });
          Object.assign(s.E.b, { tx: 100, ty: 409, tk: .1 });
        }
      },
      {
        if: s => s.hit(s.E.b),
        do: s => {
          s.f.m = 1;
          for (let i = 0; i < 7; i++) s.E['w' + i].on = false;
          Object.assign(s.E.b, { h: 8, tx: 100, ty: 417, tk: .1 });
        }
      },
      {
        if: s => s.f.m && s.p.x >= 600,
        do: s =>
          Object.assign(s.E.s2, { on: true, tx: 650, ty: 390, tk: .5 })
      }]
  })
};
