// N15 : "Trois portails". Les 2 leurres sont inoffensifs : ce sont les pièges autour qui tuent.
// f1 : y tenir = fuite + piques de plafond derriÚre. f2 : trou invisible devant + sol piégé en revenant.
const B = '#feb854';
const BG = '#996b07';
const SOL = 400;

const fx = s => s.p.x + 13; // centre des pieds
const each = (s, f) => [0, 1, 2, 3].forEach(i => f(s.E['ce' + i]));

export default {
    name: 'Niveau 15', start: { x: 120, y: 368 }, bounds: [94, 676], bg: BG,
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 300, w: 600, h: 100, c: B },
            { id: 'floor', k: 'floor', x: 100, y: SOL, w: 600, h: 1 },

            // Zone 1 : piques camouflées dans le sol, juste AVANT le leurre 1
            { id: 'sp1', k: 'spike', x: 215, y: SOL, w: 25, h: 10, on: false, d: true },
            // Zone 2 : piques de plafond derriĂšre soi quand on atteint le leurre 1
            ...[150, 175, 200, 225].map((x, i) => ({ id: 'ce' + i, k: 'spike', x, y: 300, w: 25, h: 10, on: false, d: true, r: 2 })),
            { id: 'g_ce', k: 'solid', x: 150, y: 0, w: 100, h: 300, c: B, on: true },
            { id: 'w_ce', k: 'solid', x: 150, y: 0, w: 100, h: 300, c: BG, on: true },
            // Zone 3 : trou invisible AVANT le leurre 2, piques cachées juste aprÚs
            { id: 'g', k: 'gap', x: 400, y: SOL, w: 50, h: 200, c: B, on: false },
            { id: 'sp2', k: 'spike', x: 470, y: SOL, w: 25, h: 10, on: false, d: true },
            // Piques de retour : surgissent sous les pieds si on retourne vers f1
            { id: 'sp3', k: 'spike', x: 330, y: SOL, w: 25, h: 10, on: false, d: true },

            // Leurres : AUCUN effet au contact, juste décor
            { id: 'f1', k: 'fake', x: 250, y: 370, w: 30, h: 30 },
            { id: 'f2', k: 'fake', x: 520, y: 370, w: 30, h: 30 }],
        portal: { x: 650, y: 370, w: 30, h: 30 },
        rules: [
            // A. En approchant du leurre 1 (x>=185), des piques sortent DEVANT lui
            //    -> il faut sauter. (pas de contact avec f1 nécessaire)
            {
                if: s => fx(s) >= 195,
                do: s => {
                    s.E.sp1.on = true;
                    s.f.a = 1;
                }
            },
            {
                once: false,
                if: s => s.f.a && s.E.sp1.y > 390,
                do: s => {
                    s.E.sp1.y = Math.max(390, s.E.sp1.y - 5);
                }
            },

            // B. En ARRIVANT sur le leurre 1 : le leurre "fuit" de 80px à droite
            //    et des piques de plafond tombent derriĂšre (impossible de reculer)
            {
                if: s => s.hit(s.E.f1),
                do: s => {
                    s.f.b = 1;
                    each(s, e => e.on = true);
                    s.b[0] = 235;
                }
            },
            {
                once: false,
                if: s => s.f.b && s.E.f1.x < 330,
                do: s => {
                    s.E.f1.x += 3;
                }
            },
            {
                once: false,
                if: s => s.f.b && s.E.ce0.y < 700,
                do: s => {
                    each(s, e => e.y = Math.min(700, e.y + 6));
                    s.E.w_ce.y += 6
                }
            },

            // C. Dépassé x=380 : le trou invisible apparaßt juste devant (à sauter à l'aveugle)
            {
                if: s => fx(s) >= 370,
                do: s => {
                    s.E.g.on = true; s.f.c = 1;
                }
            },

            // D. PASSÉ le trou (x>=455) : des piques apparaissent juste aprÚs l'atterrissage
            //    (le joueur saute trop long et retombe dessus)
            {
                if: s => s.f.c && fx(s) >= 455,
                do: s => {
                    s.E.sp2.on = true; s.f.d = 1;
                }
            },
            {
                once: false,
                if: s => s.f.d && s.E.sp2.y > 390,
                do: s => {
                    s.E.sp2.y = Math.max(390, s.E.sp2.y - 8);
                }
            },

            // E. Arrivé sur le leurre 2 : il disparaßt et la vraie sortie se dévoile
            //    + le sol derriÚre s'effondre (plus de retour possible)
            {
                if: s => s.hit(s.E.f2),
                do: s => {
                    s.f.e = 1;
                    s.E.f2.on = false;
                    s.b[0] = 505;
                }
            }
        ]
    })
};