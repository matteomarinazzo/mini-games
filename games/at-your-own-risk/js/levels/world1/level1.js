// NIVEAU = données + règles. Le moteur (game.js) ne change pas.
// ents : k='deco' (décor), 'floor' (sol), 'gap' (trou, actif si on), 'spike' (pique, actif si on!==false)
// Un entité peut avoir tx,ty,tk : glisse vers (tx,ty) de tk*distance par frame (comme deplacerX).
// rules : { if(s), do(s), once } — s.p joueur, s.E entités par id, s.f drapeaux, s.portal.
// NOUVEAU PIÈGE : ajouter une entité + une règle ici (ou un k dans step() de game.js).
const B = '#feb854';
export default {
  name: 'Niveau 1', start: { x: 200, y: 368 }, bounds: [94, 676], bg: '#996b07',
  build: () => ({
    ents: [
      { id: 'room', k: 'deco', x: 100, y: 300, w: 600, h: 100, c: B },
      { id: 'floor', k: 'floor', x: 100, y: 400, w: 600, h: 1 },
      { id: 'g', k: 'gap', x: 500, y: 400, w: 50, h: 200, c: B, on: false }],
    portal: { x: 600, y: 370, w: 30, h: 30 },
    // Le trou invisible s'ouvre à x>=460 : il faut le sauter.
    rules: [
      {
        if: s => s.p.x >= 460,
        do: s =>
          s.E.g.on = true
      }
    ]
  })
};
