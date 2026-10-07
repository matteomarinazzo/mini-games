// Deux phases : 1er contact avec le portail = il se téléporte à droite, le décor change.
const B = '#feb854';
export default {
  name: 'Niveau 4', start: { x: 600, y: 318 }, bounds: [94, 676], bg: '#996b07',
  build: () => ({
    ents: [
      { id: 'room', k: 'deco', x: 100, y: 250, w: 600, h: 100, c: B },
      { id: 'floor', k: 'floor', x: 100, y: 350, w: 600, h: 1 },
      { id: 'g1', k: 'gap', x: 425, y: 350, w: 50, h: 250, c: B, on: false },
      { id: 'g2', k: 'gap', x: 225, y: 350, w: 50, h: 250, c: B, on: false },
      { id: 'sp', k: 'spike', x: 275, y: 340, w: 25, h: 10, d: true }],
    portal: { x: 150, y: 320, w: 30, h: 30 },
    rules: [
      {
        if: s => !s.f.ph && s.p.x <= 490, once: false,
        do: s =>
          s.E.g1.on = true
      },
      {
        if: s => !s.f.ph && s.p.x <= 290, once: false,
        do: s =>
          s.E.g2.on = true
      },
      {
        if: s => !s.f.ph && s.p.x <= 350, once: false,
        do: s =>
          Object.assign(s.E.sp, { tx: 320, ty: 340, tk: .5 })
      },
      {
        if: s => s.f.ph && s.p.x >= 490, once: false,
        do: s =>
          s.E.g1.on = true
      },
      {
        if: s => s.f.ph && s.p.x >= 290, once: false,
        do: s =>
          s.E.g2.on = true
      },
      {
        if: s => s.f.ph && s.p.x >= 575, once: false,
        do: s =>
          Object.assign(s.E.sp, { tx: 625, ty: 340, tk: .5 })
      }],

    // Retourne true = contact absorbé (le niveau n'est pas fini).
    onPortal(s) {
      if (s.f.ph) return false;
      s.f.ph = 1; s.portal.x = 650;
      Object.assign(s.E.g1, { x: 525, on: false }); Object.assign(s.E.g2, { x: 325, on: false });
      Object.assign(s.E.sp, { x: 625, y: 350, tx: undefined });
      return true;
    }
  })
};
