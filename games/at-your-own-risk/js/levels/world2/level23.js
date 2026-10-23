// N23 : 4 plateformes à la même hauteur (dessus y=372 = 28 px au-dessus du sol, saut max 33), oneWay => on passe dessous.
// PF1 : trou invisible dessous            -> par-dessus.
// PF2 : scie qui jaillit dès qu'on PASSE au-dessus (dès l'entrée, pas à l'atterrissage) -> entre PF1 et PF2, puis par-dessous.
// PF3 : 2 duos de piques sous la plateforme -> par-dessus.
// PF4 : AUSSI visible que les autres, mais fantôme (solid:false) + trou invisible sous son bord gauche -> sauter le trou, passer dessous.
// Final : duo de piques qui sort quand le joueur est tout près -> sauter.
const TOP = 367, PH = 10, PW = 70, FY = 400;
const fx = s => s.p.x + 13;
const foot = s => s.p.y + 32;
const XS = [160, 280, 400, 520];

export default {
    name: 'Niveau 23',
    start: { x: 120, y: 368 },
    bounds: [94, 676],
    bg: 'bg',
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 300, w: 600, h: 100, c: 'room' },
            { id: 'floor', k: 'floor', x: 100, y: 400, w: 600, h: 1 },
            // trous invisibles
            { id: 'h1', k: 'gap', x: XS[0], y: FY, w: PW, h: 200, on: true, pf: true },
            { id: 'h2', k: 'gap', x: XS[3], y: FY, w: PW, h: 200, on: false, pf: true },
            // plateformes : PF4 reste fantôme (solid:false) mais visuellement identique aux autres
            ...XS.map((x, i) => ({ id: 'pf' + i, k: 'solid', oneWay: true, solid: i !== 3, x, y: TOP, w: PW, h: PH, c: 'dark' })),
            // scie portée par PF2, jaillit dès qu'on est au-dessus
            { id: 'saw', k: 'saw', host: 'pf1', dx: PW / 2, x: XS[1] + PW / 2, y: TOP, r: 34, fy: TOP, hidden: true },
            // piques sous PF3 : 2 duos de 25 x 10 px, espacés de 20 px (infranchissables d'un saut : 70 px au total)
            { id: 'sp0', k: 'spike', x: XS[2] + 5, y: FY, w: 25, h: 10, d: true, on: false },
            { id: 'sp1', k: 'spike', x: XS[2] + 40, y: FY, w: 25, h: 10, d: true, on: false },
            // duo avant le portail
            { id: 'sp2', k: 'spike', x: 600, y: FY, w: 25, h: 10, d: true, on: false },
        ],
        portal: { x: 650, y: 370, w: 30, h: 30 },
        rules: [
            // Scie : sort dès que le joueur est au-dessus de PF2 (en l'air ou posé). Plus de saut-resaut possible.
            {
                if: s => fx(s) >= XS[1] - 6 && fx(s) <= XS[1] + PW + 6 && foot(s) <= TOP + 4,
                do: s => {
                    s.E.saw.hidden = false;
                }
            },
            // Piques sous PF3 : sortent quand le joueur approche
            {
                if: s => fx(s) >= 365,
                do: s => {
                    for (const id of ['sp0', 'sp1']) Object.assign(s.E[id], { on: true, tx: s.E[id].x, ty: 390, tk: .3 });
                }
            },
            // PF4 : dès que les pieds franchissent le dessus de PF4 EN DESCENDANT (= tentative d'atterrissage), le trou s'ouvre.
            // Passer dessous (au sol) ne déclenche rien ; il se referme quand le joueur est au sol, hors de la plateforme.
            {
                once: false,
                if: () => true,
                do: s => {
                    const p = s.p, h = s.E.h2;
                    const inX = fx(s) >= XS[3] - 6 && fx(s) <= XS[3] + PW + 6;
                    if (inX && p.vy > 0 && foot(s) >= TOP && foot(s) <= TOP + 12) h.on = true;   // franchi par le haut
                    else if (!inX || p.g) h.on = false;                                          // hors zone ou posé au sol : fermé
                }
            },
            // Duo final
            {
                if: s => fx(s) >= 575,
                do: s => {
                    Object.assign(s.E.sp2, { on: true, tx: 600, ty: 390, tk: .3 });
                }
            }
        ]
    })
};