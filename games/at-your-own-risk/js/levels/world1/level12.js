// N12 : escalier de 6 marches (25 px). Les marches 2 et 4 disparaissent juste avant qu'on les prenne.
// Les marches 3 et 5 descendent pour rendre le saut possible, puis remontent une fois qu'on est dessus.
// La marche 6 (hauteur fixe) s'allonge jusqu'au portail quand on arrive au bord du gouffre.
const D = '#996b07';
const fx = s => s.p.x + 13;                    // centre des pieds
const on = (s, y) => s.p.g && s.p.y + 32 === y; // posé sur une surface de hauteur y
const move = (s, id, y) => Object.assign(s.E[id], { tx: s.E[id].x, ty: y, tk: .2 });

export default {
    name: 'Niveau 12', start: { x: 0, y: 368 }, bounds: [-6, 774], bg: '#feb854',
    build: () => ({
        ents: [
            { id: 's0', k: 'solid', x: -100, y: 400, w: 200, h: 200, c: D },
            // mv:1 = surface mobile : le joueur reste posé dessus quand elle monte
            ...[1, 2, 3, 4, 5, 6].map(i => ({ id: 's' + i, k: 'solid', x: 100 + 50 * (i - 1), y: 400 - 25 * i, w: 50, h: 600, c: D, mv: 1 })),
            { id: 'sp', k: 'spike', x: 700, y: 250, w: 25, h: 10, d: true, on: false }
        ],
        portal: { x: 740, y: 220, w: 30, h: 30 },
        rules: [
            // Bord de s1 : s2 disparaît, s3 descend à 350
            {
                if: s => on(s, 375) && fx(s) >= 130,
                do: s => {
                    move(s, 's2', 800);
                    move(s, 's3', 350);
                }
            },
            // Posé sur s3 : elle remonte à 325
            {
                if: s => !s.E.s2.on && s.p.g && fx(s) >= 200 && fx(s) <= 250,
                do: s =>
                    move(s, 's3', 325)
            },

            // Bord de s3 (remontée) : s4 disparaît, s5 descend à 300
            {
                if: s => on(s, 325) && fx(s) >= 230 && fx(s) <= 250,
                do: s => {
                    move(s, 's4', 800);
                    move(s, 's5', 300);
                }
            },
            // Posé sur s5 : elle remonte à 275
            {
                if: s => !s.E.s4.on && s.p.g && fx(s) >= 300 && fx(s) <= 350,
                do: s => move(s, 's5', 275)
            },

            // Bord de s6 : elle s'allonge jusqu'au portail (350 + 420 = 770), même hauteur
            {
                if: s => on(s, 250) && fx(s) >= 385,
                do: s =>
                    Object.assign(s.E.s6, { tw: 420, tk: .15 })
            },
            // Spikes : quand on atteint le bord de x=650, le spike apparaît
            {
                once: false,
                if: s => s.p.x >= 650,
                do: s => {
                    s.E.sp.on = true;
                    if (s.E.sp.y > 240) {
                        s.E.sp.y -= 5
                    }
                }
            }

        ]
    })
};