// Données des maps. Trou : { name, start:[x,z], cup:[x,z], poly:[[x,z]…] (rectilinéaire), walls:[[x,z,w,d,h]] (centre),
// ramps:[[x,z,w,d,y0,y1,axe]] (centre ; y0 côté min de l’axe 'x' ou 'z'), voids:[[x,z,w,d]], yaw? (rad, visée initiale) }
(function () {
  const M = window.Minigolf = window.Minigolf || {};
  const W = 2.4, bx = (w, d) => [[-w / 2, 0], [w / 2, 0], [w / 2, d], [-w / 2, d]];
  // Aides d’écriture : rc = polygone rectangle ; R4 = rectangle (x0,z0)-(x1,z1) au format centre/taille ; WL = mur (y0 = bas : toit) ; PR = ponton/île (sol plat sur le vide) ; JP = rampe de saut montante vers +z.
  const rc = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], R4 = (x0, z0, x1, z1) => [(x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0];
  const WL = (x0, z0, x1, z1, h = .3, y0) => y0 === undefined ? R4(x0, z0, x1, z1).concat(h) : R4(x0, z0, x1, z1).concat(h, y0);
  const PR = (x0, z0, x1, z1) => R4(x0, z0, x1, z1).concat(0, 0, 'z'), JP = (x0, z0, x1, z1, y) => R4(x0, z0, x1, z1).concat(0, y, 'z'), FL = (x0, z0, x1, z1, y) => R4(x0, z0, x1, z1).concat(y, y, 'z');
  const WD = (x0, z0, x1, z1, a, b) => R4(x0, z0, x1, z1).concat(a, b);   // zone de vent / boost : + direction
  const H0 = (o, x) => Object.assign({ start: [0, 1], walls: [], ramps: [], voids: [] }, o, x && { walls: (o.walls || []).concat(x.walls || []), ramps: (o.ramps || []).concat(x.ramps || []), diag: (o.diag || []).concat(x.diag || []) });
  const holes = [
    { name: 'L’allée', start: [0, 1], cup: [0, 9.2], poly: bx(W, 10.4), walls: [], ramps: [[0, 5.2, W, 10.4, .15, 0, 'z']], voids: [] },
    { name: 'Le mur', start: [0, 1], cup: [0, 11], poly: bx(W, 12.2), walls: [[.5, 6, 1.4, .2, .3]], ramps: [], voids: [] },
    { name: 'La montée', start: [0, 1], cup: [0, 10], poly: bx(W, 11.5), walls: [], ramps: [[0, 5, W, 5, 0, .5, 'z'], [0, 9.5, W, 4, .5, .5, 'z']], voids: [] },
    { name: 'Le vide', start: [0, 1], cup: [0, 8], poly: bx(W, 10), walls: [], ramps: [[0, 2.7, W, 1.6, 0, .3, 'z']], voids: [[0, 4.2, W, 1.4]] },
    { name: 'Le coude', start: [0, 1], cup: [-6, 8], yaw: 0, poly: [[-1, 0], [1, 0], [1, 9], [-7, 9], [-7, 7], [-1, 7]], walls: [], ramps: [], voids: [] },
    { name: 'La bosse', start: [0, 1], cup: [0, 10.5], poly: bx(W, 12), walls: [], ramps: [[0, 4.25, W, 2.5, 0, .28, 'z'], [0, 6, W, 1, .28, .28, 'z'], [0, 7.75, W, 2.5, .28, 0, 'z']], voids: [] },
    { name: 'L’étroit', start: [0, 1], cup: [0, 9.5], poly: [[-.5, 0], [.5, 0], [.5, 7], [1.2, 7], [1.2, 11], [-1.2, 11], [-1.2, 7], [-.5, 7]], walls: [], ramps: [], voids: [] },
    { name: 'La banquette', start: [0, 1], cup: [0, 10.5], poly: bx(2.2, 12), walls: [], ramps: [[0, 6, 2.2, 12, .14, 0, 'x']], voids: [] },
    { name: 'Le dernier', start: [0, 1], cup: [0, 12.5], poly: bx(W, 16), walls: [], ramps: [[0, 7, W, 2, 0, .35, 'z']], voids: [] },
  ];
  // Le clos : tunnels (toit = mur avec y0), pont, poteaux, bosses, tremplins, escalier, gouttière. Passages ≥ 1 m.
  const pil = (x, z) => [x, z, .3, .3, .35], bump = (x, w, z, y) => [[x, z + .4, w, .8, 0, y, 'z'], [x, z + 1.2, w, .8, y, 0, 'z']];
  const clos = [
    { name: 'Le tunnel', start: [0, 1], cup: [-.9, 9.2], poly: bx(3.6, 11), walls: [[-.675, 5, 2.35, 1.2, .3], [1.675, 5, .35, 1.2, .3], [1, 5, 1.2, 1.2, .3, .17]], ramps: [], voids: [] },
    { name: 'Le pont', start: [-.8, 1], cup: [.7, 10.5], poly: bx(3, 12), walls: [[.15, 6, .1, 4.8, .12], [1.25, 6, .1, 4.8, .12]], ramps: [[.7, 6, 1, 4.8, 0, 0, 'z']], voids: [[0, 6, 3, 4.8]] },
    { name: 'Les poteaux', start: [0, 1], cup: [0, 10.5], poly: bx(3.6, 11.5), walls: [pil(-.6, 3.5), pil(.6, 3.5), pil(-1.2, 6.5), pil(0, 6.5), pil(1.2, 6.5), pil(-.6, 9), pil(.6, 9)], ramps: [], voids: [] },
    { name: 'Le massif', start: [0, 1], cup: [-.2, 10.6], poly: bx(4, 12), walls: [[-.2, 6, 1.6, 5, .4]], ramps: [].concat(bump(1.3, 1.4, 3.4, .12), bump(1.3, 1.4, 5, .12), bump(1.3, 1.4, 6.6, .12)), voids: [] },
    { name: 'Le tremplin', start: [0, 1], cup: [-.6, 11.8], poly: bx(3, 13), walls: [], ramps: [[.9, 3.5, 1.2, 3, 0, .36, 'z']], voids: [[0, 5.9, 3, 1.8]] },
    { name: 'L’escalier', start: [0, 1], cup: [7, 6.9], poly: [[-1.1, 0], [1.1, 0], [1.1, 5.8], [8, 5.8], [8, 8], [-1.1, 8]], walls: [], ramps: [[3.1, 6.9, 1.2, 2.2, 0, .2, 'x'], [4.2, 6.9, 1, 2.2, .2, .2, 'x'], [5.3, 6.9, 1.2, 2.2, .2, .4, 'x'], [6.95, 6.9, 2.1, 2.2, .4, .4, 'x']], voids: [] },
    { name: 'Le conduit', start: [0, 1], cup: [4.5, 9.5], poly: [[-.5, 0], [.5, 0], [.5, 5], [5, 5], [5, 11], [4, 11], [4, 6], [-.5, 6]], walls: [[2.25, 5.5, 1.5, 1.2, .3, .17]], ramps: bump(0, 1, 2.6, .12), voids: [] },
    { name: 'La gouttière', start: [0, 1], cup: [0, 10.6], poly: bx(3.2, 12), walls: [pil(0, 4.2), pil(0, 7.2)], ramps: [[-.8, 6, 1.6, 12, .2, 0, 'x'], [.8, 6, 1.6, 12, 0, .2, 'x']], voids: [] },
    { name: 'Le grand saut', start: [0, 1], cup: [0, 11.8], poly: bx(4.4, 13), walls: [[-1.95, 6.1, .1, 1.8, .12], [-.85, 6.1, .1, 1.8, .12], [0, 9.6, 1.2, 1, .3], pil(-1.4, 10.5), pil(1.4, 10.5)], ramps: [[1, 3.7, 1.4, 3, 0, .36, 'z'], [-1.4, 6.1, 1, 1.8, 0, 0, 'z']], voids: [[0, 6.1, 4.4, 1.8]] },
  ];
  // ── Map 3 · Les dunes : sable (freine fort), rochers, dunes ──
  const rock = (x, z, h = .35) => [x, z, .3, .3, h];
  const dunes = [
    H0({ name: 'Le bac à sable', start: [-.7, 1], cup: [.7, 9], poly: rc(-1.3, 0, 1.3, 10.5), sand: [R4(-1.3, 3.4, 1.3, 6.6)], walls: [rock(0, 5), rock(-.7, 7.6), rock(.7, 3)] }),
    H0({ name: 'Les îlots', cup: [.9, 9.8], poly: bx(3.6, 11), sand: [R4(-1.8, 2.8, -.3, 4.6), R4(.3, 5.2, 1.8, 7), R4(-1.2, 7.6, .3, 9.4)] }),
    H0({ name: 'Le pied de la dune', cup: [0, 9.8], poly: rc(-1.2, 0, 1.2, 11.2), sand: [R4(-1.2, 2.2, 1.2, 4.4)], walls: [rock(0, 3.3)], ramps: [JP(-1.2, 5.4, 1.2, 7.6, .38), FL(-1.2, 7.6, 1.2, 11.2, .38)] }),
    H0({ name: 'Le désert', start: [-1.4, 1], cup: [1.9, 8.5], poly: rc(-2, 0, 2.5, 9.4), sand: [R4(-.8, 0, 2.5, 7.6)], walls: [rock(1, 4)] }),
    H0({ name: 'Le rough', cup: [5, 6.5], poly: [[-1.5, 0], [1.5, 0], [1.5, 5], [6, 5], [6, 8], [-1.5, 8]], sand: [R4(-1.5, 0, -.6, 5), R4(.6, 0, 1.5, 5), R4(-1.5, 5, 6, 5.9), R4(-1.5, 7.1, 6, 8)] }),
    H0({ name: 'Le puits de sable', cup: [0, 8.6], poly: bx(3, 10.5), sand: [R4(-1, 7.4, 1, 9.8)], walls: [rock(-.6, 3.6), rock(.6, 5.2)] }),
    H0({ name: 'Les vagues', cup: [0, 11.6], poly: bx(2.4, 12.5), sand: [R4(-1.2, 4, 1.2, 5.6), R4(-1.2, 7.2, 1.2, 8.8)], ramps: [].concat(bump(0, 2.4, 2.4, .14), bump(0, 2.4, 5.6, .14), bump(0, 2.4, 8.8, .14)) }),
    H0({ name: 'Le canyon', start: [.3, 1], cup: [0, 11.8], poly: rc(-.7, 0, .7, 13), sand: [R4(-.7, 0, 0, 13)], walls: [WL(-.9, 8, .9, 9.4, .3, .17)], ramps: bump(0, 1.4, 3.4, .12) }),
    H0({ name: 'La traversée', cup: [0, 15.6], poly: bx(3, 17), sand: [R4(-1.5, 4.5, .3, 6.5), R4(-.3, 9.4, 1.5, 11.4), R4(-1.5, 13, 1.5, 14.2)], walls: [rock(.9, 5.5), rock(-.9, 10.4), rock(0, 12.2)], ramps: bump(0, 3, 7.2, .16) }),
  ];
  // ── Map 4 · Le lac : eau (la balle coule : +1 coup), pontons, îles, sauts ──
  const lac = [
    H0({ name: 'Le ponton', start: [-.9, 1], cup: [.9, 9.5], poly: bx(3, 11), water: [R4(-1.5, 3.4, 1.5, 7.4)], ramps: [PR(.3, 3.4, 1.5, 7.4)] }),
    H0({ name: 'La boucle', cup: [2.3, 8.2], poly: rc(-2, 0, 3.5, 9.6), water: [R4(-2, 2.4, 3.5, 9.6)], ramps: [PR(-.9, 2.4, .9, 6.8), PR(-.9, 5, 3.2, 6.8), PR(1.4, 5, 3.2, 9.2)] }),
    H0({ name: 'L’île', start: [0, .5], cup: [0, 7.6], poly: bx(4, 12), water: [R4(-2, 3.8, 2, 11)], ramps: [JP(-1, .9, 0, 3.8, .38), PR(.8, 3.8, 1.8, 5.8), PR(-1.1, 5.8, 1.1, 9.2)] }),
    H0({ name: 'Le tour du lac', start: [-2.2, 1], cup: [2.2, 9], poly: rc(-3, 0, 3, 10), water: [R4(-1.5, 2, 1.5, 8)], ramps: [PR(-1.5, 4.2, 1.5, 5.8)] }),
    H0({ name: 'Le barrage', cup: [0, 10.8], poly: bx(3.4, 12.4), walls: [WL(-.5, 4.7, 1.75, 5.3, .3), WL(-1.75, 4.7, -.45, 5.3, .3, .17)], water: [R4(-1.7, 6.2, 1.7, 8.2)], ramps: [PR(-.9, 6.2, .6, 8.2)] }),
    H0({ name: 'Le marais', cup: [0, 11.6], poly: bx(3.6, 12.2), water: [R4(-1.8, 2.6, -.3, 4.6), R4(.3, 4.8, 1.8, 6.8), R4(-1.8, 7, -.3, 9), R4(.3, 9.2, 1.8, 11)] }),
    H0({ name: 'Le T', cup: [1.7, 6.8], poly: bx(4.6, 12), water: [R4(-2.3, 2.6, 2.3, 12)], ramps: [PR(-.8, 2.6, .8, 7.6), PR(-2.3, 6, 2.3, 7.6)] }),
    H0({ name: 'Le saut du lac', cup: [0, 13], poly: bx(3, 14), water: [R4(-1.5, 3.6, 1.5, 5.6), R4(-1.5, 9.4, 1.5, 11.4)], ramps: [JP(-1.5, 1.4, 1.5, 3.6, .36), PR(-1.5, 5.6, 1.5, 9.4), JP(-1.5, 7.4, 1.5, 9.4, .36)] }),
    H0({ name: 'Le port', cup: [2.8, 8], poly: rc(-3, 0, 3.5, 12), water: [R4(-3, 3, 3.5, 12)], walls: [WL(-.9, 5.4, .9, 6.6, .3, .17)], ramps: [PR(-.7, 3, .7, 9.2), PR(-3, 4.4, .7, 5.8), PR(-.7, 7.2, 3.2, 8.7)] }),
  ];
  // ── Map 5 · La patinoire : glace (glisse très loin) et bandes qui rebondissent (rest .85) ──
  const IC = (poly) => { const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]); return R4(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)); };
  const IH = (o) => { const h = H0(Object.assign({ rest: .85 }, o)); if (!h.ice) h.ice = [IC(h.poly)]; return h; };
  const glace = [
    IH({ name: 'Le rink', cup: [0, 7.8], poly: rc(-1.6, 0, 1.6, 9), walls: [rock(0, 4.6)] }),
    IH({ name: 'Le virage', cup: [5.2, 6.5], poly: [[-1.2, 0], [1.2, 0], [1.2, 5], [6, 5], [6, 8], [-1.2, 8]] }),
    IH({ name: 'Le S gelé', start: [-1.2, 1], cup: [1.2, 9.2], poly: [[-2.4, 0], [0, 0], [0, 4], [2.4, 4], [2.4, 10.4], [0, 10.4], [0, 6.4], [-2.4, 6.4]], walls: [rock(.8, 7.6), rock(.1, 5.4), rock(1.2, 8.4)] }),
    IH({ name: 'Les palets', cup: [0, 8.6], poly: rc(-2, 0, 2, 10), walls: [rock(-1, 3), rock(1, 4), rock(0, 5.6), rock(-1.1, 7), rock(1.2, 7.6)] }),
    IH({ name: 'La porte de glace', start: [-.9, 1], cup: [-.9, 9.6], poly: bx(3.6, 11), walls: [WL(-1.85, 4.6, .2, 5.4, .3), WL(.2, 4.6, 1.3, 5.4, .3, .17), WL(1.3, 4.6, 1.85, 5.4, .3), rock(-.9, 7.6)] }),
    IH({ name: 'La berge', cup: [0, 9.8], poly: bx(3.6, 11), ice: [R4(-.6, 0, .6, 11)], walls: [rock(-1, 5), rock(1, 6.5), WL(-.6, 4.8, .3, 5.2, .3), rock(0, 8.2)] }),
    IH({ name: 'L’igloo', cup: [0, 9.9], poly: [[-1.5, 0], [1.5, 0], [1.5, 8], [.6, 8], [.6, 10.5], [-.6, 10.5], [-.6, 8], [-1.5, 8]], walls: [WL(-.9, 8.3, .9, 9.4, .3, .17), rock(0, 4.2), rock(-.7, 6.2), rock(.7, 2.8)] }),
    IH({ name: 'Le fer à cheval', start: [-2.2, .8], cup: [2.2, 7], poly: [[-3, 0], [3, 0], [3, 8], [1.4, 8], [1.4, 1.8], [-1.4, 1.8], [-1.4, 8], [-3, 8]] }),
    IH({ name: 'Les deux pistes', start: [-1, 1], cup: [1, 9.5], poly: bx(4, 11), ice: [R4(-2, 0, 0, 11)], walls: [WL(-.1, 2.4, .1, 8, .3)] }),
    IH({ name: 'Le lac gelé', cup: [0, 8], poly: rc(-3, 0, 3, 9), walls: [WL(-.8, 3.4, .8, 5.2, .4)] }),
    IH({ name: 'Le toboggan', start: [0, .8], cup: [0, 11.5], poly: bx(2.4, 13), ice: [R4(-1.2, 5, 1.2, 13)], ramps: [FL(-1.2, 0, 1.2, 2.5, .4), [0, 3.75, 2.4, 2.5, .4, 0, 'z']], walls: [rock(.5, 8), rock(0, 9.8), rock(-.6, 6.6)] }),
    IH({ name: 'Le givre', cup: [4.8, 9.6], poly: [[-1.4, 0], [1.4, 0], [1.4, 5], [6, 5], [6, 11], [3.6, 11], [3.6, 7.4], [-1.4, 7.4]], walls: [rock(0, 3), WL(1.4, 5.8, 3.6, 6.4, .3, .17), rock(4.8, 8.2)] }),
  ];
  // ── Map 6 · Le flipper : bumpers (rebond ≥ 1 : ils relancent), trampolines, rebonds ──
  const BP = (x, z, r = .3, e = 1) => [x, z, r, e];
  const flip = [
    H0({ name: 'Le premier bumper', cup: [0, 9], poly: bx(3, 10), bumpers: [BP(0, 5, .4), BP(-.9, 7.4, .3, 1.05), BP(.9, 7.4, .3, 1.05)] }),
    H0({ name: 'Le triangle', cup: [0, 10], poly: bx(3.4, 11), bumpers: [BP(-.8, 4.4), BP(.8, 4.4), BP(0, 6.4, .35, 1.1), BP(-.8, 8.2, .25), BP(.8, 8.2, .25)] }),
    H0({ name: 'Le pachinko', cup: [0, 11], poly: bx(3.6, 12.5), bumpers: [BP(-1.2, 3.4, .2, .9), BP(0, 3.4, .2, .9), BP(1.2, 3.4, .2, .9), BP(-.6, 5.2, .2, .9), BP(.6, 5.2, .2, .9), BP(-1.2, 7, .2, .9), BP(0, 7, .2, .9), BP(1.2, 7, .2, .9), BP(-.6, 8.8, .2, .9), BP(.6, 8.8, .2, .9)] }),
    H0({ name: 'Le trampoline', cup: [0, 10], poly: bx(3, 11), pads: [R4(-1.5, 2.4, 1.5, 3.4)], walls: [WL(-1.55, 4.9, 1.55, 5.3, .4)] }),
    H0({ name: 'Le ressort', cup: [0, 11.7], poly: bx(3, 12.7), pads: [R4(-1.5, 2.6, 1.5, 3.6)], voids: [R4(-1.5, 5.4, 1.5, 7.2)], sand: [R4(-1.5, 7.6, 1.5, 10.9)] }),
    H0({ name: 'Le couloir de flipper', cup: [0, 12], poly: bx(2.6, 13), bumpers: [BP(0, 3.6, .3, 1.1), BP(-.85, 5.2, .25, 1.1), BP(.85, 5.2, .25, 1.1), BP(0, 6.8, .3, 1.1), BP(-.85, 8.4, .25, 1.1), BP(.85, 8.4, .25, 1.1), BP(0, 10, .3, 1.1)] }),
    H0({ name: 'Le grand bumper', cup: [0, 9.6], poly: bx(4.4, 11), bumpers: [BP(0, 5.4, .9, 1)] }),
    H0({ name: 'La rampe à ressort', cup: [0, 11], poly: bx(3, 12.5), pads: [R4(-1.5, 2, 1.5, 3)], ramps: [JP(-1.5, 3, 1.5, 5, .3)], voids: [R4(-1.5, 5, 1.5, 6.6)], bumpers: [BP(0, 9, .35, 1)] }),
    H0({ name: 'Le tunnel qui renvoie', cup: [0, 10.2], poly: bx(3.4, 11.6), walls: [WL(-1.75, 5.4, -.55, 6.6, .3), WL(.55, 5.4, 1.75, 6.6, .3), WL(-.7, 5.4, .7, 6.6, .3, .17)], bumpers: [BP(-1.3, 3.4, .25, 1.15), BP(1.3, 3.4, .25, 1.15), BP(0, 8.2, .3, 1)] }),
    H0({ name: 'Les bonds', cup: [0, 14], poly: bx(2.8, 15), voids: [R4(-1.4, 3.6, 1.4, 5.6), R4(-1.4, 7.8, 1.4, 9.8)], ramps: [PR(-1.4, 5.6, 1.4, 7.8), PR(-1.4, 7.8, -.3, 9.8), PR(-1.4, 9.8, 1.4, 12)], pads: [R4(-1.4, 2.2, 1.4, 3.2)], walls: [WL(-.4, 7.8, -.3, 9.8, .3), WL(-1.4, 7.9, -.4, 9.7, .3, .17)] }),
    H0({ name: 'Le coin chaud', start: [-.8, 1], cup: [5.2, 6.6], poly: [[-1.6, 0], [1.6, 0], [1.6, 5], [6.2, 5], [6.2, 8], [-1.6, 8]], bumpers: [BP(1.8, 5.6, .3, 1.2), BP(3.6, 7.2, .3, 1.1), BP(0, 3.4, .3, 1)] }),
    H0({ name: 'Le grand flipper', cup: [0, 13.4], poly: bx(4, 14.6), pads: [R4(-2, 2.4, 2, 3.2)], walls: [WL(-2.05, 4.6, 2.05, 5, .4), WL(-.6, 8.6, .6, 9.8, .3, .17)], bumpers: [BP(-1.2, 7, .3, 1.1), BP(1.2, 7, .3, 1.1), BP(-1.3, 11.2, .3, 1.1), BP(1.3, 11.2, .3, 1.1)] }),
  ];
  // ── Map 7 · Les portails : entrer d’un côté, ressortir de l’autre avec la même vitesse (paires de couleurs) ──
  const portails = [
    H0({ name: 'La porte', cup: [-.5, 9], poly: bx(3, 10.4), walls: [WL(-1.55, 5, 1.55, 5.4, .4)], portals: [[0, 3.6, 1, 6.4]] }),
    H0({ name: 'Le saut de puce', cup: [0, 12], poly: bx(3, 13.4), walls: [WL(-1.55, 4.4, 1.55, 4.8, .4), WL(-1.55, 8.6, 1.55, 9, .4)], portals: [[-.8, 3, .8, 5.6], [.8, 7.4, -.8, 10]] }),
    H0({ name: 'Le labyrinthe', start: [-.9, 1], cup: [2.6, 9.6], poly: rc(-1.6, 0, 3.2, 11), walls: [WL(-1.65, 3.6, 1.1, 4, .4), WL(-.3, 6.4, 3.25, 6.8, .4)], portals: [[-.9, 2.2, -.9, 5.2]] }),
    H0({ name: 'Le miroir', start: [-1.1, 1], cup: [1.1, 1.4], poly: bx(3.4, 6.4), walls: [WL(-.1, 0, .1, 6.4, .4)], portals: [[-.5, 3.4, .5, 3.4]] }),
    H0({ name: 'Le tunnel et la porte', cup: [0, 12], poly: bx(3.4, 13), walls: [WL(-1.75, 4, -.5, 4.6, .3), WL(-.5, 4, .5, 4.6, .3, .17), WL(.5, 4, 1.75, 4.6, .3), WL(-1.75, 8.4, 1.75, 8.8, .4)], portals: [[0, 6.4, .9, 10.2]] }),
    H0({ name: 'Le vide et le portail', cup: [0, 11.6], poly: bx(3, 12.6), voids: [R4(-1.5, 4, 1.5, 8)], portals: [[0, 2.8, 0, 9]] }),
    H0({ name: 'Le grand écart', cup: [0, 16], poly: bx(2.6, 17.4), walls: [WL(-1.35, 6, 1.35, 6.4, .4), WL(-1.35, 11, 1.35, 11.4, .4)], portals: [[-.6, 4.2, .6, 8.4], [.6, 9.6, -.6, 13]] }),
    H0({ name: 'La salle des portes', cup: [2, 11], poly: bx(5, 12.4), walls: [WL(-2.55, 5, 2.55, 5.4, .4), WL(-.3, 8.4, 2.55, 8.8, .4)], portals: [[-1.6, 3.4, -1.6, 7], [0, 3.4, 1.6, 7], [1.6, 3.4, 0, 10]] }),
    H0({ name: 'Le portail piégé', cup: [0, 11], poly: bx(3.4, 12), voids: [R4(-1.7, 5.6, 1.7, 7.2)], walls: [WL(-1.75, 3.6, 1.75, 4, .4)], portals: [[-.9, 2.6, 0, 8.4], [.9, 2.6, 0, 5]] }),
    H0({ name: 'La boucle', start: [-1, 1], cup: [1.2, 3.4], poly: rc(-1.6, 0, 3.2, 9), walls: [WL(.1, 0, .3, 6.4, .4)], portals: [[-1, 5, 2.2, 2.6]] }),
    H0({ name: 'Les jumeaux', cup: [0, 11], poly: bx(3.8, 12), ramps: [[0, 6, 3.8, 2, 0, .3, 'z']], walls: [WL(-1.95, 3.6, 1.95, 4, .4)], portals: [[-1.1, 2.4, -1.1, 4.8], [1.1, 2.4, 1.1, 4.8]] }),
    H0({ name: 'Le grand portail', cup: [0, 13.6], poly: bx(4, 15), walls: [WL(-2.05, 4.6, 2.05, 5, .4), WL(-2.05, 9, 0.9, 9.4, .4), WL(-.8, 11.2, 0.8, 12.4, .3, .17)], voids: [R4(.9, 8.8, 2, 9.6)], portals: [[-1, 3.4, 1.4, 6.6], [-1.4, 7.6, 1.4, 10.4]] }),
  ];
  // ── Map 8 · La soufflerie : vent [x,z,w,d,ax,az] (pousse la balle, même en l’air) et boosts [x,z,w,d,dx,dz] (accélèrent) ──
  const soufflerie = [
    H0({ name: 'Le vent de côté', cup: [-.6, 9], poly: bx(3, 10.4), wind: [WD(-1.5, 3, 1.5, 7, 2.4, 0)] }),
    H0({ name: 'Le tapis', cup: [0, 11], poly: bx(2.6, 12), boost: [WD(-1.3, 4, 1.3, 6, 0, 1)], walls: [rock(0, 8.4)] }),
    H0({ name: 'Le vent de face', cup: [0, 11], poly: bx(2.4, 12), wind: [WD(-1.2, 3, 1.2, 8, 0, -3)] }),
    H0({ name: 'La rafale', cup: [0, 12], poly: bx(3.4, 13), wind: [WD(-1.7, 2.6, 1.7, 5.4, 2.6, 0), WD(-1.7, 6.4, 1.7, 9.2, -2.6, 0)] }),
    H0({ name: 'Le canon', cup: [0, 13], poly: bx(2.6, 14), boost: [WD(-1.3, 2, 1.3, 4, 0, 1)], ramps: [JP(-1.3, 4.4, 1.3, 6.4, .3)], voids: [R4(-1.3, 6.4, 1.3, 8.6)] }),
    H0({ name: 'Les souffles croisés', cup: [0, 9.6], poly: bx(4, 11), wind: [WD(-2, 2.4, 0, 5, 2.6, 0), WD(0, 2.4, 2, 5, -2.6, 0), WD(-2, 5.8, 0, 8.4, -2.6, 0), WD(0, 5.8, 2, 8.4, 2.6, 0)] }),
    H0({ name: 'La navette', start: [-1.1, 1], cup: [1.1, 12], poly: bx(3.4, 13), boost: [WD(-1.7, 3, -.4, 6, 0, 1), WD(.4, 6.6, 1.7, 9.6, 0, 1)], walls: [WL(-.1, 2, .1, 7, .3)] }),
    H0({ name: 'Le courant', start: [-1, 1], cup: [1.8, 9], poly: rc(-2.2, 0, 2.2, 10.4), boost: [WD(-2.2, 3.2, 2.2, 4.8, 1, 0), WD(-2.2, 6, 2.2, 7.6, -1, 0)] }),
    H0({ name: 'Le vent d’ouest', cup: [5, 6.5], poly: [[-1.2, 0], [1.2, 0], [1.2, 5], [6, 5], [6, 8], [-1.2, 8]], wind: [WD(-1.2, 1.4, 1.2, 4.6, 0, 1.4), WD(1.2, 5, 6, 8, 1.8, 0)] }),
    H0({ name: 'Le soufflet', cup: [0, 14], poly: bx(3, 15), wind: [WD(-1.5, 3, 1.5, 5, 0, -3.2), WD(-1.5, 8, 1.5, 10, 0, 3.2)], walls: [rock(-.8, 6.6), rock(.8, 11.4)] }),
    H0({ name: 'La piste d’envol', cup: [0, 14.5], poly: bx(2.6, 15.6), boost: [WD(-1.3, 2, 1.3, 4.4, 0, 1)], ramps: [JP(-1.3, 4.6, 1.3, 6.6, .36)], voids: [R4(-1.3, 6.6, 1.3, 9.4)], wind: [WD(-1.3, 6.6, 1.3, 9.4, -1.6, 0)] }),
    H0({ name: 'L’ouragan', cup: [0, 14.4], poly: bx(4, 15.6), wind: [WD(-2, 3, 2, 6, 3, 0), WD(-2, 7, 2, 10, -3, 0)], boost: [WD(-.9, 11, .9, 12.4, 0, 1)], walls: [WL(-2.05, 4.4, .3, 4.8, .4), WL(-.3, 8.4, 2.05, 8.8, .4)] }),
  ];
  // ── Map 9 · La forteresse : tout ensemble (sable, eau, glace, bumpers, portails, vent, boosts, trampolines, tunnels) ──
  const fort = [
    H0({ name: 'Les douves', start: [0, .8], cup: [0, 10.4], poly: bx(3.4, 11.6), water: [R4(-1.7, 3.2, 1.7, 6.4)], ramps: [PR(.2, 3.2, 1.6, 6.4)], walls: [WL(-1.75, 7.4, -.3, 7.8, .4), WL(.5, 7.4, 1.75, 7.8, .4)], sand: [R4(-1.7, 8, 1.7, 9.2)] }),
    H0({ name: 'Le pont-levis', cup: [0, 11.6], poly: bx(3, 13), voids: [R4(-1.5, 4.6, 1.5, 6.6)], ramps: [PR(-.5, 4.6, .5, 6.6), JP(-1.5, 2.6, -.6, 4.6, .3)], bumpers: [BP(0, 9, .4, 1.1)], ice: [R4(-1.5, 7, 1.5, 13)], rest: .8 }),
    H0({ name: 'La herse', cup: [0, 11], poly: bx(3.6, 12), walls: [WL(-1.85, 4.2, -.9, 4.6, .4), WL(-.9, 4.2, .1, 4.6, .3, .17), WL(.1, 4.2, 1.85, 4.6, .4), WL(-1.85, 7.4, 1.1, 7.8, .4)], pads: [R4(-1.8, 1.8, -.8, 2.8)], portals: [[1.4, 3, 1.4, 6]] }),
    H0({ name: 'La cour gelée', cup: [3.6, 8], poly: [[-1.8, 0], [1.8, 0], [1.8, 4], [4.6, 4], [4.6, 9.6], [-1.8, 9.6]], ice: [R4(-1.8, 0, 4.6, 9.6)], rest: .85, walls: [rock(0, 2.4), WL(1.8, 6, 3.4, 6.4, .3)], sand: [R4(2.8, 7, 4.6, 9.6)] }),
    H0({ name: 'Le tourbillon', cup: [0, 10.4], poly: bx(4, 11.6), wind: [WD(-2, 2.6, 0, 5.2, 0, 2.4), WD(0, 2.6, 2, 5.2, 0, -2.4), WD(-2, 6, 0, 8.6, 0, -2.4), WD(0, 6, 2, 8.6, 0, 2.4)], bumpers: [BP(0, 5.6, .35, 1.05)] }),
    H0({ name: 'Les remparts', cup: [0, 13], poly: bx(3.4, 14), walls: [WL(-1.75, 3.6, .3, 4, .45), WL(-.3, 7.4, 1.75, 7.8, .45)], boost: [WD(.9, 4, 1.7, 7.4, 0, 1)], water: [R4(-1.7, 9, 1.7, 10.8)], ramps: [PR(-.7, 9, .7, 10.8)] }),
    H0({ name: 'Le donjon', cup: [0, 9.6], poly: bx(4.4, 11), walls: [WL(-2.25, 4.4, -.6, 4.8, .4), WL(.6, 4.4, 2.25, 4.8, .4), WL(-.6, 4.4, .6, 4.8, .3, .17), WL(-1.4, 7.6, -1.1, 7.9, .4), WL(1.1, 7.6, 1.4, 7.9, .4)], bumpers: [BP(-1.3, 6.2, .3, 1.1), BP(1.3, 6.2, .3, 1.1)], sand: [R4(-.8, 8, .8, 10.4)] }),
    H0({ name: 'Les oubliettes', cup: [3.4, 10.4], poly: [[-1.6, 0], [1.6, 0], [1.6, 4], [5, 4], [5, 11.6], [1.8, 11.6], [1.8, 7.6], [-1.6, 7.6]], water: [R4(1.8, 7.6, 5, 9.2)], ramps: [PR(3.4, 7.6, 4.6, 9.2)], portals: [[0, 2.4, 3.6, 5.6]], boost: [WD(2.2, 4.4, 4.8, 5.4, 0, 1)] }),
    H0({ name: 'La tour de guet', start: [0, .8], cup: [0, 12.6], poly: bx(3, 14), ramps: [FL(-1.5, 0, 1.5, 2, .4), [0, 3.25, 3, 2.5, .4, 0, 'z']], pads: [R4(-1.5, 6.4, 1.5, 7.4)], walls: [WL(-1.55, 8.6, 1.55, 9, .4)], ice: [R4(-1.5, 9.4, 1.5, 14)], rest: .8 }),
    H0({ name: 'Le pont de pierre', cup: [0, 14.2], poly: bx(3.6, 15.4), water: [R4(-1.8, 3.4, 1.8, 9)], ramps: [PR(-.6, 3.4, .6, 9)], bumpers: [BP(-1.2, 11.4, .3, 1.1), BP(1.2, 11.4, .3, 1.1)], wind: [WD(-.6, 3.4, .6, 9, 1.8, 0)], walls: [WL(-.9, 12.4, .9, 13.2, .3, .17)] }),
    H0({ name: 'La salle du trône', cup: [0, 13], poly: bx(4.6, 14.2), sand: [R4(-2.3, 2.4, -.9, 5)], ice: [R4(.9, 2.4, 2.3, 5)], bumpers: [BP(0, 4.6, .4, 1.1), BP(-1.4, 8.4, .3, 1), BP(1.4, 8.4, .3, 1)], portals: [[-1.8, 6.6, 1.8, 10.6]], walls: [WL(-2.35, 6, -.4, 6.4, .4), WL(.4, 6, 2.35, 6.4, .4)] }),
    H0({ name: 'Le dernier rempart', cup: [0, 15.6], poly: bx(4, 17), walls: [WL(-2.05, 3.6, .5, 4, .4), WL(-.5, 7.4, 2.05, 7.8, .4), WL(-.6, 11.4, .6, 12.6, .3, .17)], voids: [R4(-2, 9, 2, 10.6)], ramps: [JP(-2, 7.8, 2, 9, .3), PR(-.7, 9, .7, 10.6)], boost: [WD(-1.2, 4.4, -.2, 6.6, 0, 1)], wind: [WD(-2, 13, 2, 14.6, 1.4, 0)], bumpers: [BP(1.2, 13.8, .3, 1.1)] }),
  ];

  // ── Maps 10-12 : vrais parcours de minigolf — coins biseautés (arêtes obliques), murs en diagonale, tunnels d’une balle et demie (ouverture .3 × .15), tunnels qui montent, plateaux, bosses ──
  const DW = (x0, z0, x1, z1, h = .3, y0) => y0 === undefined ? [x0, z0, x1, z1, h] : [x0, z0, x1, z1, h, y0];   // mur oblique (champ `diag`)
  const mix = (o, ...ps) => { for (const p of ps) for (const k in p) o[k] = (o[k] || []).concat(p[k]); return o; };
  /** Biseaute les coins convexes d’un polygone (ix = indices, sinon tous) : chaque coin devient une diagonale de longueur k·√2. */
  const bev = (p, k, ix) => { const n = p.length, o = []; p.forEach((v, i) => { if (ix && !ix.includes(i)) { o.push(v); return; } const f = (q) => { const dx = q[0] - v[0], dz = q[1] - v[1], l = Math.hypot(dx, dz); return [v[0] + dx / l * k, v[1] + dz / l * k]; }; o.push(f(p[(i + n - 1) % n]), f(p[(i + 1) % n])); }); return o; };
  const inP = (x, z, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  /** Plateau plat à la hauteur y qui suit le polygone (bandes de 0,1 m) : reste propre le long des diagonales. */
  const FLD = (p, y, x0, z0, x1, z1) => { const o = []; for (let i = 0; i < Math.round((x1 - x0) / .1); i++) { const a = x0 + i * .1, b = a + .1; let lo = 1e9, hi = -1e9; for (let z = z0; z <= z1 + 1e-6; z += .02) if (inP(a + .001, z, p) || inP(b - .001, z, p)) { lo = Math.min(lo, z); hi = Math.max(hi, z); } if (hi > lo) o.push(FL(a, Math.max(z0, lo - .02), b, Math.min(z1, hi + .02), y)); } return o; };
  const TH = .15;   // hauteur libre d’un tunnel : 1,5 balle
  /** Tunnel plat le long de z : ouverture w (.3) centrée en xc, blocs pleins de xl à xr, toit à y+TH. fz / gz : entonnoirs obliques avant (z0) / arrière (z1). */
  const tun = (xc, z0, z1, xl, xr, o = {}) => {
    const y = o.y || 0, hw = (o.w || .3) / 2, a = xc - hw, c = xc + hw, top = y + .3, D = [];
    if (o.fz) D.push(DW(xl, z0 - o.fz, a, z0, top), DW(xr, z0 - o.fz, c, z0, top));
    if (o.gz) D.push(DW(xl, z1 + o.gz, a, z1, top), DW(xr, z1 + o.gz, c, z1, top));
    return { walls: [WL(xl, z0, a, z1, top), WL(c, z0, xr, z1, top), WL(a, z0, c, z1, top, y + TH)], diag: D };
  };
  /** Tunnel qui monte de ya (en z0) à yb (en z1) : rampe + toit en escalier fin (ouverture constante). */
  const rtun = (xc, z0, z1, xl, xr, ya, yb, o = {}) => {
    const hw = (o.w || .3) / 2, a = xc - hw, c = xc + hw, n = Math.max(1, Math.round((z1 - z0) / .25)), W = [], D = [];
    for (let i = 0; i < n; i++) { const za = z0 + (z1 - z0) * i / n, zb = z0 + (z1 - z0) * (i + 1) / n, ry = ya + (yb - ya) * (i + 1) / n + TH, top = ry + .15; W.push(WL(xl, za, a, zb, top), WL(c, za, xr, zb, top), WL(a, za, c, zb, top, ry)); }
    if (o.fz) D.push(DW(xl, z0 - o.fz, a, z0, ya + .3), DW(xr, z0 - o.fz, c, z0, ya + .3));
    if (o.gz) D.push(DW(xl, z1 + o.gz, a, z1, yb + .3), DW(xr, z1 + o.gz, c, z1, yb + .3));
    return { walls: W, diag: D, ramps: [R4(xc - .25, z0, xc + .25, z1).concat(ya, yb, 'z')] };
  };
  const DN = (x0, z0, x1, z1, a, b, ax = 'z') => R4(x0, z0, x1, z1).concat(a, b, ax);   // rampe quelconque
  // ── Map 10 · Le circuit : virages à angle droit biseautés, chicanes obliques, tunnels, plateaux ──
  const pA6 = [[-1, 0], [1, 0], [1, 7], [8, 7], [8, 9], [1, 9], [-1, 7]];
  const pU = bev([[-2, 0], [0, 0], [0, 7], [1, 7], [1, 0], [3, 0], [3, 9], [-2, 9]], 1.2, [6, 7]);
  const pS = [[-1, 0], [1, 0], [1, 4], [5, 4], [7, 6], [7, 10], [5, 12], [-3, 12], [-3, 10], [5, 10], [5, 6], [1, 6], [-1, 4]];
  const circuit = [
    H0({ name: 'Le coin biseauté', cup: [6.4, 7], poly: [[-1, 0], [1, 0], [1, 6], [7, 6], [7, 8], [1, 8], [-1, 6]] }),
    H0({ name: 'Le virage à gauche', cup: [-6.4, 7], poly: [[1, 0], [-1, 0], [-1, 6], [-7, 6], [-7, 8], [-1, 8], [1, 6]], ramps: bump(0, 2, 2.6, .12) }),
    H0({ name: 'Le Z', cup: [6, 11], poly: [[-1, 0], [1, 0], [1, 5], [5, 5], [7, 7], [7, 12], [5, 12], [5, 7], [1, 7], [-1, 5]] }),
    H0({ name: 'La chicane', cup: [0, 11.4], poly: bx(3, 12.4), diag: [DW(-1.5, 4.2, .5, 6.2), DW(1.5, 7.8, -.5, 9.8)] }),
    H0({ name: 'L’octogone', cup: [2.2, 6.8], poly: bev(rc(-3, 0, 3, 8), 1.2), diag: [DW(.4, 3.4, 2, 4.6)], walls: [rock(-1.4, 5.6)] }),
    H0({ name: 'Le plateau d’angle', cup: [7.2, 8], poly: pA6, ramps: [JP(-1, 2.4, 1, 4.4, .3)].concat(FLD(pA6, .3, -1, 4.4, 5, 9), [DN(5, 7, 8, 9, .3, 0, 'x')]) }),
    H0({ name: 'Le U', start: [-1, 1], cup: [2, 2], poly: pU }),
    H0({ name: 'Le tunnel et le coude', start: [0, .6], cup: [6.2, 8], poly: [[-1.5, 0], [1.5, 0], [1.5, 7], [7, 7], [7, 9], [.5, 9], [-1.5, 7]] }, mix({}, tun(0, 3.4, 5.8, -1.5, 1.5, { fz: 1.4 }))),
    H0({ name: 'Les baffles', cup: [0, 12.6], poly: bx(3.4, 13.4), ramps: bump(0, 3.4, 1.6, .12), diag: [DW(-1.7, 3.8, .5, 5.8), DW(1.7, 7, -.5, 9), DW(-1.7, 10.2, .5, 12.2)] }),
    H0({ name: 'Le serpent', cup: [-2, 11], poly: pS }),
    H0({ name: 'Le salon', cup: [0, 8], poly: bev(rc(-3, 0, 3, 9), 1), diag: [DW(0, 4.1, .9, 5), DW(.9, 5, 0, 5.9), DW(0, 5.9, -.9, 5), DW(-.9, 5, 0, 4.1)] }),
    H0({ name: 'Le grand circuit', start: [0, .5], cup: [6.5, 14], poly: [[-1.5, 0], [1.5, 0], [1.5, 7], [6, 7], [8, 9], [8, 15], [5, 15], [5, 9], [.5, 9], [-1.5, 7]], ramps: bump(6.5, 3, 11, .14) }, mix({}, tun(0, 2.4, 4.6, -1.5, 1.5, { fz: 1.4 }))),
  ];
  // ── Map 11 · Les galeries : tunnels (ouverture .3 × .15, entonnoirs obliques), tunnels qui montent puis s’alignent sur un plateau, un pont ou un saut ──
  const pB5 = [[-1.5, 0], [1.5, 0], [1.5, 5], [5, 5], [7, 7], [7, 15], [4, 15], [4, 7], [.5, 7], [-1.5, 5]], pB12 = [[-1.5, 0], [1.5, 0], [1.5, 7], [8, 7], [8, 9], [.5, 9], [-1.5, 7]];
  const galeries = [
    H0({ name: 'Le passage', cup: [0, 8.6], poly: bx(3, 10) }, mix({}, tun(0, 3.8, 5.6, -1.5, 1.5, { fz: 1.6 }))),
    H0({ name: 'Les deux portes', cup: [.7, 10.6], poly: bx(3, 12) }, mix({}, tun(-.7, 3.2, 4.6, -1.5, 1.5, { fz: 1.2 }), tun(.7, 7, 8.4, -1.5, 1.5, { fz: 1.2 }))),
    H0({ name: 'La montée couverte', cup: [0, 12.4], poly: bx(3, 13.4), ramps: [FL(-1.5, 6, 1.5, 9, .3), DN(-1.5, 9, 1.5, 11, .3, 0)] }, mix({}, rtun(0, 3, 6, -1.5, 1.5, 0, .3, { fz: 1.4 }))),
    H0({ name: 'Le pont couvert', cup: [0, 11.6], poly: bx(3, 12.6), ramps: [FL(-1.5, 5.4, 1.5, 8.6, .3)], voids: [R4(-1.5, 8.6, 1.5, 9.8)] }, mix({}, rtun(0, 2.4, 5.4, -1.5, 1.5, 0, .3, { fz: 1.4 }))),
    H0({ name: 'Le virage couvert', cup: [5.5, 13.6], poly: pB5 }, mix({}, tun(5.5, 9.6, 11.6, 4, 7, { fz: 1.4 }))),
    H0({ name: 'La double montée', cup: [0, 14], poly: bx(3, 15), ramps: [FL(-1.5, 5.5, 1.5, 6.5, .25), FL(-1.5, 9, 1.5, 10.4, .5), DN(-1.5, 10.4, 1.5, 13, .5, 0)] }, mix({}, rtun(0, 3, 5.5, -1.5, 1.5, 0, .25, { fz: 1.4 }), rtun(0, 6.5, 9, -1.5, 1.5, .25, .5))),
    H0({ name: 'Le U couvert', start: [-1, 1], cup: [2, 1.2], poly: pU }, mix({}, tun(2, 3.6, 5.6, 1, 3, { gz: 1 }))),
    H0({ name: 'Le zigzag couvert', cup: [0, 12], poly: bx(3, 13), ramps: bump(0, 3, 10.2, .12) }, mix({}, tun(-.8, 3, 4.4, -1.5, 1.5, { fz: 1.2 }), tun(.8, 7.6, 9, -1.5, 1.5, { fz: 1.4 }))),
    H0({ name: 'Le tunnel en altitude', cup: [0, 12.6], poly: bx(3, 13.6), ramps: [JP(-1.5, 2, 1.5, 4.4, .3), FL(-1.5, 4.4, 1.5, 9.4, .3), DN(-1.5, 9.4, 1.5, 11.4, .3, 0)] }, mix({}, tun(0, 6, 8, -1.5, 1.5, { y: .3, fz: 1.4 }))),
    H0({ name: 'Le tunnel de sable', cup: [0, 11.6], poly: bx(3, 12.6), sand: [R4(-1.5, 7.4, 1.5, 10.2)], walls: [rock(-.9, 9), rock(.9, 8)] }, mix({}, tun(0, 3.6, 5.4, -1.5, 1.5, { fz: 1.6 }))),
    H0({ name: 'Le ponton couvert', cup: [0, 11.4], poly: bx(3, 12.4), water: [R4(-1.5, 2.4, 1.5, 8.4)], ramps: [PR(-.6, 2.4, .6, 8.4)] }, mix({}, tun(0, 4.6, 6.6, -.6, .6))),
    H0({ name: 'La grande galerie', cup: [7.2, 8], poly: pB12, ramps: FLD(pB12, .3, -1.5, 6.2, 5, 9).concat([DN(5, 7, 8, 9, .3, 0, 'x')]) }, mix({}, rtun(0, 2.6, 6.2, -1.5, 1.5, 0, .3, { fz: 1.4 }))),
  ];

  // ── Map 12 · L’odyssée : très longs parcours (≈ 3 coups, 2 avec de la chance), départs jamais alignés sur un tunnel, aucune rampe autour des tunnels ──
  const pU2 = bev([[-3, 0], [-.5, 0], [-.5, 12], [.5, 12], [.5, 0], [3, 0], [3, 14], [-3, 14]], 1, [6, 7]);
  const huit = [
    H0({ name: 'L’avenue', cup: [.9, 25.6], poly: bx(3.4, 27), water: [R4(-1.7, 9, 1.7, 13.4)], ramps: [PR(-1.7, 9, -.1, 13.4)], sand: [R4(-1.7, 15.6, 0, 17.6)], walls: [rock(.9, 19), rock(-.7, 22.4)] }),
    IH({ name: 'Le grand coude', cup: [16, 14.5], poly: [[-1.5, 0], [1.5, 0], [1.5, 13], [17, 13], [17, 16], [-1.5, 16]], ice: [R4(1.5, 13, 17, 16)], walls: [rock(7.5, 14.5), rock(12, 14)] }),
    H0({ name: 'Les portails décalés', cup: [9, 20.6], poly: [[-1.5, 0], [1.5, 0], [1.5, 8], [8.5, 8], [10.5, 10], [10.5, 22], [7.5, 22], [7.5, 11], [-1.5, 11]], portals: [[-.8, 6, 9, 14]], bumpers: [BP(9, 17.4, .3, 1.1)], sand: [R4(7.5, 18.6, 10.5, 19.6)] }),
    H0({ name: 'La porte cachée', start: [-2, 1], cup: [-2, 22.4], poly: bx(6, 24), sand: [R4(-3, 15, 0, 18)], walls: [rock(-1, 20)] }, mix({}, tun(2, 10, 12, -3, 3, { fz: 1.8 }))),
    H0({ name: 'La grande soufflerie', cup: [0, 30.6], poly: bx(3.6, 32), wind: [WD(-1.8, 7, 1.8, 11, 2.2, 0), WD(-1.8, 14, 1.8, 18, -2.2, 0), WD(-1.8, 22, 1.8, 26, 2.2, 0)], walls: [rock(-.7, 12.6), rock(.7, 20), rock(-.6, 28)] }),
    IH({ name: 'Le grand U gelé', start: [-1.8, 1], cup: [1.8, 1.8], poly: pU2, walls: [rock(-1.8, 8), rock(1.8, 6.4)] }),
    H0({ name: 'Les pontons', cup: [-.8, 24.4], poly: bx(4.4, 26), water: [R4(-2.2, 5, 2.2, 18.4)], ramps: [PR(-2.2, 3.8, 0, 12), PR(-2.2, 10, 2.2, 12), PR(0, 10, 2.2, 18.4)], walls: [rock(.8, 22)] }),
    H0({ name: 'Le saut du canyon', cup: [.6, 26.6], poly: bx(3, 28), boost: [WD(-1.5, 2, 1.5, 5, 0, 1)], ramps: [JP(-1.5, 5.4, 1.5, 8, .36)], voids: [R4(-1.5, 8, 1.5, 11)], sand: [R4(-1.5, 20, 1.5, 22)], walls: [rock(-.6, 16.6), rock(.6, 18.6)] }),
    H0({ name: 'Le flipper géant', cup: [0, 24.6], poly: bx(4.6, 26), pads: [R4(-2.3, 2.4, 2.3, 3.6)], walls: [WL(-2.35, 5.4, 1.4, 5.8, .4), rock(.8, 21.6)], bumpers: [BP(-1.2, 10, .3, 1.1), BP(1.2, 10, .3, 1.1), BP(0, 12.4, .35, 1.1), BP(-1.3, 14.6, .3, 1.1), BP(1.3, 14.6, .3, 1.1)], sand: [R4(-2.3, 17, 2.3, 19)] }),
    H0({ name: 'Le labyrinthe oblique', cup: [-1.2, 24.4], poly: bx(4.4, 26), diag: [DW(-2.2, 4, .6, 6.4), DW(2.2, 20.4, -.6, 22.4)] }, mix({}, tun(1.4, 14, 16, -2.2, 2.2, { fz: 1.6 }))),
    IH({ name: 'Le tunnel de glace', cup: [1, 31], poly: bx(4, 33), walls: [rock(1.2, 19), rock(-.8, 24), rock(.8, 28)] }, mix({}, tun(-1, 10, 12, -2, 2, { fz: 1.2 }))),
    H0({ name: 'Le grand parcours', start: [0, .8], cup: [8.5, 19.4], poly: [[-1.5, 0], [1.5, 0], [1.5, 6], [8, 6], [10, 8], [10, 21], [7, 21], [7, 9], [-1.5, 9]], sand: [R4(3, 6, 5, 9)], bumpers: [BP(9.2, 17, .3, 1.1)] }, mix({}, tun(8.5, 12, 14, 7, 10, { fz: 1.4 }))),
  ];
  // ── Map 13 · Le Moulin : pales tournantes en bois, bordures basses en biseau (franchissables si trop fort), brèches dans le mur ──
  const ML = (x, z, L, w, pose = 'v', yc, a0 = 0) => [x, z, L, w, pose, yc, a0];
  const CB = (x0, z0, x1, z1) => R4(x0, z0, x1, z1);
  const GP = (x0, z0, x1, z1) => R4(x0, z0, x1, z1);
  const moulin = [
    // 1. Les ailes du vent : couloir droit, moulin vertical 'z' en travers (timing entre pales), bordure basse sur tout le mur du fond
    H0({ name: 'Les ailes du vent', cup: [0, 9.6], poly: bx(2.8, 11), moulins: [ML(0, 5.5, 1.2, 1.8, 'z', 1.25)], curbs: [CB(-1.4, 10.8, 1.4, 11.2)] }),
    // 2. Le guichet bas : épingle en U avec moulin au sol, mur du fond et muret côté trou en biseau
    H0({ name: 'Le guichet bas', start: [-1.4, 1], cup: [1.4, 1.8], poly: [[-2.4, 0], [-.4, 0], [-.4, 7], [.4, 7], [.4, 0], [2.4, 0], [2.4, 9], [-2.4, 9]], curbs: [CB(.25, .1, .55, 6.9), CB(-2.2, 8.8, 2.2, 9.2)], moulins: [ML(1.4, 4.5, .9, -2.2, 'v')] }),
    // 3. Le rotor au sol : rotor horizontal balayant entre deux bacs à sable, mur du fond en bordure basse
    H0({ name: 'Le rotor au sol', cup: [0, 10.6], poly: bx(3.2, 12), sand: [R4(-1.6, 4.4, -.8, 6.6), R4(.8, 4.4, 1.6, 6.6)], moulins: [ML(0, 5.5, 1.1, 2.4, 'v')], curbs: [CB(-1.6, 11.8, 1.6, 12.2)] }),
    // 4. La brèche de la meule : chicane avec bordure basse à gauche, à droite dans le virage et dans le coin avec le mur du fond
    H0({ name: 'La brèche de la meule', cup: [0, 12.2], poly: bx(3.4, 13.5), moulins: [ML(0, 6, 1.1, -2.0, 'z', 1.15)], curbs: [CB(-1.9, 4.5, -1.5, 7.5), CB(1.5, 4.5, 1.9, 13.7), CB(-1.85, 13.3, 1.85, 13.7)] }),
    // 5. La montée du moulin : rampe montant à un plateau surélevé, moulin vertical 'z' au sommet, mur du fond en bordure basse
    H0({ name: 'La montée du moulin', cup: [0, 10.2], poly: bx(2.8, 11.5), ramps: [JP(-1.4, 3, 1.4, 5.8, .35), FL(-1.4, 5.8, 1.4, 11.5, .35)], moulins: [ML(0, 6.5, 1.1, 2.0, 'z', 1.5)], curbs: [CB(-1.4, 11.3, 1.4, 11.7)] }),
    // 6. Le pont du bief : plan d'eau traversé par un ponton étroit où tourne un rotor au sol, mur du fond bas
    H0({ name: 'Le pont du bief', cup: [0, 10.8], poly: bx(3.4, 12), water: [R4(-1.7, 3.2, 1.7, 7.8)], ramps: [PR(-.6, 3.2, .6, 7.8)], moulins: [ML(0, 5.5, .95, 2.8, 'v')], curbs: [CB(-1.7, 11.8, 1.7, 12.2)] }),
    // 7. Le tunnel sous les pales : moulin vertical devant un tunnel, mur du fond bas derrière la sortie
    H0({ name: 'Le tunnel sous les pales', cup: [0, 11.4], poly: bx(3, 12.5), moulins: [ML(0, 3.8, 1.1, -2.2, 'z', 1.15)], curbs: [CB(-1.5, 12.3, 1.5, 12.7)] }, mix({}, tun(0, 5, 7.5, -1.5, 1.5, { fz: 1.2 }))),
    // 8. Le virage du meunier : virage à 90°, moulin vertical latéral 'x', bordure basse tout droit et mur du fond bas à droite
    H0({ name: 'Le virage du meunier', cup: [5.8, 6.5], poly: [[-1.2, 0], [1.2, 0], [1.2, 5.3], [7, 5.3], [7, 7.7], [-1.2, 7.7]], moulins: [ML(1.8, 6.5, 1.1, 2.2, 'x', 1.15)], curbs: [CB(-1.4, 5.5, -1.0, 7.7), CB(6.8, 5.3, 7.2, 7.7)] }),
    // 9. Le saut des deux moulins : premier moulin vertical devant le tremplin, second au sol sur la réception, mur du fond en biseau bas
    H0({ name: 'Le saut des deux moulins', cup: [0, 12.8], poly: bx(3.2, 14), ramps: [JP(-1.6, 2.8, 1.6, 5.2, .36)], voids: [R4(-1.6, 5.2, 1.6, 7.8)], moulins: [ML(0, 3.2, 1.1, 2.0, 'z', 1.15), ML(0, 9.8, 1.0, -2.2, 'v')], curbs: [CB(-1.6, 13.8, 1.6, 14.2)] }),
    // 10. L’écluse : bassin d'eau, moulin vertical 'z', mur du fond bas derrière le trou
    H0({ name: 'L’écluse', cup: [1.5, 11.4], poly: [[-1.5, 0], [1.5, 0], [1.5, 5], [2.8, 5], [2.8, 12.5], [-1.5, 12.5]], water: [R4(-1.5, 3.2, .2, 8.5)], moulins: [ML(1.5, 6.5, 1.0, -2.4, 'z', 1.15)], curbs: [CB(-1.5, 12.3, 2.8, 12.7)] }),
    // 11. Les doubles pales croisées : deux rotors au sol tournant en sens inverse, bac à sable central et muret de fond bas
    H0({ name: 'Les doubles pales croisées', cup: [0, 12.2], poly: bx(3.6, 13.5), sand: [R4(-.5, 6, .5, 7.5)], moulins: [ML(-.8, 5.5, 1.0, 2.5, 'v'), ML(.8, 7.5, 1.0, -2.5, 'v')], curbs: [CB(-1.8, 13.3, 1.8, 13.7)] }),
    // 12. Le grand moulin : moulin vertical à la montée, tunnel de meule, puis deux rotors au sol synchronisés qui se chevauchent, mur du fond biseauté
    H0({ name: 'Le grand moulin', start: [0, .8], cup: [0, 16.5], poly: bx(3.8, 18), ramps: [JP(-1.9, 2.6, 1.9, 5.4, .35), FL(-1.9, 5.4, 1.9, 11.5, .35), DN(-1.9, 11.5, 1.9, 13.5, .35, 0)], moulins: [ML(0, 5.8, 1.25, 1.8, 'z', 1.6), ML(-.75, 14.8, 1.05, -2.2, 'v', undefined, 0), ML(.75, 14.8, 1.05, 2.2, 'v', undefined, Math.PI * .25)], curbs: [CB(-1.9, 17.8, 1.9, 18.2)] }, mix({}, tun(0, 8.5, 11, -1.9, 1.9, { y: .35, fz: 1.2 }))),
  ];
  // ── Map 14 · Les Étages : parcours multi-niveaux, puits gravitaires forcés, tremplins et terrasses ──
  const PW = (ex, ez, sx, sz, dir, fy) => [ex, ez, sx, sz, dir, fy];
  const etages = [
    // 1. L’entrée du puits : couloir haut avec trou d'entrée contre le mur frontal, sortie verticale sur la face du mur vers l'étage bas
    H0({ name: 'L’entrée du puits', start: [0, 1], cup: [0, 10.5], poly: bx(2.6, 12), ramps: [FL(-1.3, 0, 1.3, 5, .45)], walls: [[0, 5.1, 2.6, .2, .75]], puits: [PW(0, 4.6, 0, 5.2, 'devant', 0)] }),
    // 2. Le passage du mur : départ haut avec trou d'entrée à portée devant à droite contre le mur, ou rampe descendante à gauche
    H0({ name: 'Le passage du mur', start: [0, 1], cup: [0, 11.5], poly: bx(3.4, 13), ramps: [FL(-1.7, 0, 1.7, 5, .4), DN(-1.7, 5, 0, 8, .4, 0)], walls: [[.8, 5.1, 1.8, .2, .7]], puits: [PW(.8, 4.6, .8, 5.2, 'devant', 0)] }),
    // 3. Le tremplin d’étage : tremplin qui propulse sur la terrasse haute, mur du fond biseauté
    H0({ name: 'Le tremplin d’étage', start: [0, 1], cup: [0, 10.5], poly: bx(2.8, 12), pads: [R4(-1.4, 2.5, 1.4, 4)], voids: [R4(-1.4, 4, 1.4, 5.5)], ramps: [FL(-1.4, 5.5, 1.4, 12, .4)], curbs: [CB(-1.4, 11.8, 1.4, 12.2)] }),
    // 4. Le palier d’angle : parcours à étages pur sans puits, rampe descendante et chicane
    H0({ name: 'Le palier d’angle', start: [0, 1], cup: [0, 11], poly: bx(3.2, 12.5), ramps: [FL(-1.6, 0, 1.6, 4.5, .35), DN(-1.6, 4.5, 0, 7.5, .35, 0)], walls: [[.8, 6, 1.6, .3, .65]], curbs: [CB(-1.6, 12.3, 1.6, 12.7)] }),
    // 5. La falaise d’eau : balcon supérieur contre le mur de falaise, lac décalé à gauche et masqué depuis le départ
    H0({ name: 'La falaise d’eau', start: [0, 1], cup: [0, 11.5], poly: bx(3.2, 13), water: [R4(-1.6, 6.5, -.4, 8.0)], ramps: [FL(-1.6, 0, 1.6, 5, .4)], walls: [[-.8, 5.1, 1.6, .2, .7]], puits: [PW(-.8, 4.6, -.8, 5.2, 'devant', 0)] }),
    // 6. L’abri sous roche : coursive haute évitant le sable avec trou contre le mur du fond, sortie verticale sur le mur
    H0({ name: 'L’abri sous roche', start: [-1, 1], cup: [.6, 11.5], poly: bx(3.4, 13), sand: [R4(-.3, 4.5, 1.7, 7.5)], ramps: [JP(-1.7, 2, -.4, 4.5, .38), FL(-1.7, 4.5, -.4, 7.5, .38)], walls: [[-1.0, 7.6, 1.4, .2, .7]], puits: [PW(-1.0, 7.1, -1.0, 7.7, 'devant', 0)] }),
    // 7. Les pales du plateau : rampe montante menant à un plateau haut sous un moulin vertical
    H0({ name: 'Les pales du plateau', start: [0, 1], cup: [0, 11.2], poly: bx(3, 13), ramps: [JP(-1.5, 2.5, 1.5, 5.5, .4), FL(-1.5, 5.5, 1.5, 13, .4)], moulins: [ML(0, 7.5, 1.15, 2.0, 'z', 1.55)] }),
    // 8. Les trois terrasses : 3 niveaux, deux puits avec sorties verticales sur les parois des murs de soutènement
    H0({ name: 'Les trois terrasses', start: [0, 1], cup: [0, 14.5], poly: bx(3.2, 16), ramps: [FL(-1.6, 0, 1.6, 4.5, .7), DN(-1.6, 4.5, -.2, 6.5, .7, .35), FL(-1.6, 6.5, 1.6, 10, .35), DN(.2, 10, 1.6, 12, .35, 0)], walls: [[.7, 4.6, 1.4, .2, 1.05], [-.7, 10.1, 1.4, .2, .7]], puits: [PW(.7, 4.1, .7, 4.7, 'devant', .35), PW(-.7, 9.6, -.7, 10.2, 'devant', 0)] }),
    // 9. Le saut du rempart : tremplin calibré atteignant facilement la terrasse haute (0.30m), trou contre le mur et sortie verticale
    H0({ name: 'Le saut du rempart', start: [0, 1], cup: [0, 13.5], poly: bx(3.2, 15), pads: [R4(-1.6, 2.2, 1.6, 3.8)], ramps: [FL(-1.6, 4.8, 1.6, 8.5, .3)], walls: [[0, 8.6, 2.6, .2, .65]], puits: [PW(0, 8.1, 0, 8.7, 'devant', 0)] }),
    // 10. La patinoire suspendue : rampe montant à une terrasse de glace vive glissante avec rochers
    H0({ name: 'La patinoire suspendue', start: [0, 1], cup: [0, 11.5], poly: bx(2.8, 13), rest: .85, ramps: [JP(-1.4, 2.5, 1.4, 5, .4), FL(-1.4, 5, 1.4, 13, .4)], ice: [R4(-1.4, 5, 1.4, 13)], walls: [[-.5, 8, .3, .3, .65, .4], [.5, 9.5, .3, .3, .65, .4]] }),
    // 11. Le rempart percé : terrasse haute avec brèche sans mur à droite, puits avec sortie verticale sur le mur de soutènement
    H0({ name: 'Le rempart percé', start: [0, 1], cup: [0, 12.5], poly: bx(3.2, 14), ramps: [FL(-1.6, 0, 1.6, 7, .4), DN(0, 7, 1.6, 9.5, .4, 0)], walls: [[-.8, 7.1, 1.4, .2, .7]], gaps: [GP(1.4, 5.5, 1.8, 8.5)], puits: [PW(-.8, 6.6, -.8, 7.2, 'devant', 0)] }),
    // 12. La grande descente : grand final 3 niveaux, rampe, tremplin vers sommet, puits avec sortie verticale sur le mur
    H0({ name: 'La grande descente', start: [0, 1], cup: [0, 17.5], poly: bx(3.8, 19), water: [R4(-1.9, 12.5, 1.9, 14.5)], sand: [R4(-1.9, 15.5, -.3, 16.5)], ramps: [JP(-1.9, 2.5, -.2, 5, .35), FL(-1.9, 5, -.2, 9, .35), FL(-1.7, 8.5, -.4, 11.5, .6), DN(-1.9, 9, -.2, 12, .35, 0), PR(.8, 12.5, 1.9, 14.5)], pads: [R4(-1.7, 6, -.4, 7.5)], walls: [[-1.0, 11.6, 1.6, .2, .95]], puits: [PW(-1.0, 11.1, -1.0, 11.7, 'devant', 0)] }),
  ];
  const LIST = [   // id, nom, trous, icône, thème, total cumulé requis (meilleurs scores des maps précédentes)
    ['garden', 'Le jardin', holes, '⛳', 'Feutre et rampes', 0],
    ['clos', 'Le clos', clos, '🚪', 'Tunnels, ponts, sauts', 36],
    ['dunes', 'Les dunes', dunes, '🏜️', 'Sable', 72],
    ['lac', 'Le lac', lac, '🌊', 'Eau et pontons', 116],
    ['glace', 'La patinoire', glace, '🧊', 'Glace et rebonds', 162],
    ['flipper', 'Le flipper', flip, '🎯', 'Bumpers et trampolines', 222],
    ['portails', 'Les portails', portails, '🌀', 'Téléporteurs', 284],
    ['soufflerie', 'La soufflerie', soufflerie, '💨', 'Vent et boosts', 352],
    ['fort', 'La forteresse', fort, '🏰', 'Tous les obstacles', 415],
    ['circuit', 'Le circuit', circuit, '🏁', 'Virages biseautés, chicanes', 470],
    ['galeries', 'Les galeries', galeries, '🚇', 'Tunnels étroits, montées', 530],
    ['huit', 'L’odyssée', huit, '🧭', 'Très longs parcours, tous les obstacles', 595],
    ['moulin', 'Le Moulin', moulin, '⚙️', 'Pales tournantes, murs bas, brèches', 660],
    ['etages', 'Les Étages', etages, '🏗️', 'Étages et puits', 720],
  ].filter((e) => e[2]);
  M.maps = {}; M.mapList = [];
  for (const [id, name, hs, icon, theme, need] of LIST) {
    M.maps[id] = { id, name, par: 3, holes: hs };
    M.mapList.push(need ? { id, name, need, icon, info: `${hs.length} trous · ${theme}` } : { id, name, open: true, icon, info: `${hs.length} trous · ${theme}` });
  }
  // need = total cumulé de tes MEILLEURS scores sur les maps précédentes (max 6 pts par trou). L’exigence monte : 67 % du maximum possible pour Le clos et Les dunes, puis 72, 75, 77, 79, 81, 84 %.
})();
