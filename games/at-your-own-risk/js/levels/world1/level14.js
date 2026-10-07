// N14 : « Le Pont de la confiance ».
// Un seul vide, une seule plateforme mobile pilotée à la main (vitesse constante en px/frame). Phases :
//  1 : on monte sur la plateforme -> elle descend lentement.
//  2 : elle est trop basse, le saut vers la droite est impossible (faux piège).
//  3 : attente 2 s -> elle remonte vite au-dessus du sol d'arrivée, il faut sauter au bon moment.
//  4 : elle redescend ; si on est toujours dessus, on recommence.
//  5 : à l'atterrissage sur le sol d'arrivée, le sol se creuse juste avant le portail.
const D = '#996b07';
const BG = '#feb854';
const fx = s => s.p.x + 13;                      // centre des pieds
const TOP = 310, BOT = 590;                      // hauteurs min / max de la plateforme
// Le joueur est sur la plateforme (tolérance 6 px, car elle bouge à chaque frame)
const onLift = s => s.p.g && Math.abs(s.p.y + 32 - s.E.lift.y) <= 6 && fx(s) >= 150 && fx(s) <= 250;

export default {
    name: 'Niveau 14', start: { x: 0, y: 368 }, bounds: [-6, 774], bg: BG,
    build: () => ({
        ents: [
            // Sol de départ (haut à y = 400)
            { id: 's0', k: 'solid', x: -100, y: 400, w: 200, h: 200, c: D },
            // Plateforme mobile, légèrement plus haute que le sol de départ (mv:1 = le joueur est porté)
            { id: 'lift', k: 'solid', x: 150, y: 385, w: 100, h: 20, c: D, mv: 1 },
            // Sol d'arrivée en 2 blocs : s1 jusqu'au piège, s2 après (le vide entre les deux est créé par le piège)
            { id: 's1', k: 'solid', x: 340, y: 400, w: 360, h: 200, c: D },
            { id: 's2', k: 'solid', x: 730, y: 400, w: 70, h: 200, c: D },
            // Pont camouflé : même couleur que le sol, comble le futur trou (il disparaît au déclenchement)
            { id: 'br', k: 'solid', x: 700, y: 400, w: 30, h: 200, c: D, on: true },
        ],
        portal: { x: 760, y: 370, w: 30, h: 30 },
        rules: [
            // 0 -> 1 : le joueur se pose sur la plateforme, la descente commence
            {
                if: s => !s.f.ph && onLift(s),
                do: s =>
                    s.f.ph = 1
            },
            // Mouvement : appliqué à chaque frame selon la phase (vitesse constante)
            {
                once: false,
                if: s => s.f.ph >= 1 && s.f.ph <= 4,
                do: s => {
                    const L = s.E.lift, ph = s.f.ph;
                    if (ph === 1)
                        L.y = Math.min(BOT, L.y + .5);          // descente lente
                    if (ph === 3)
                        L.y = Math.max(TOP, L.y - 2);           // remontée rapide
                    if (ph === 4)
                        L.y = Math.min(BOT, L.y + 1);           // redescente moyenne
                    // Transitions de phase
                    if (ph === 1 && L.y >= BOT) {
                        s.f.ph = 2;
                        s.f.t2 = s.t;
                    }              // 1 -> 2 : tout en bas
                    if (ph === 2 && s.t - s.f.t2 >= 120)
                        s.f.ph = 3;                        // 2 -> 3 : 2 s d'attente
                    if (ph === 3 && L.y <= TOP)
                        s.f.ph = 4;                                 // 3 -> 4 : tout en haut
                    if (ph === 4 && L.y >= BOT) {
                        s.f.ph = 2;
                        s.f.t2 = s.t;
                    }               // 4 -> 2 : nouveau cycle
                }
            },
            // 5 : atterrissage sur le sol d'arrivée (quelle que soit la phase) -> le pont camouflé disparaît
            {
                if: s => s.p.x >= 650,
                do: s => {
                    s.f.ph = 5;
                    s.E.br.on = false;
                    s.E.br.c = BG;
                }
            }
        ]
    })
};