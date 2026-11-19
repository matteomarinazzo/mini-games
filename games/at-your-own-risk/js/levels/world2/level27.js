// N27 (7e du monde 2) : Joueur à gauche, un portail à droite, une rangé de pique de w:25 et h:10 tous les 75px. Toute la partie se déroule avec les touches inversées -> s.f.inv = 1.
// Comportement : le joueur saute normalement par dessus les piques. arrivé à la 4e pique, celle si se deplace de 25px vers la droite quand le x du joueur atteint la moitié de la longueur de la pique. le joueur attérit donc sur la nouvelle position de la 4e pique et meurt.
// Solution : le joueur saute par dessus la 4e pique, atteint sa moitié, puis reviens en arrière  et retombe là où il n'y a plus de pique. Le joueur termine par sauter par dessus les autres piques et atteint le portail.

const FY = 400, SW = 25, GAP = 75;               // sol, largeur d'une pique, pas entre piques
const X0 = 220;                                  // x de la 1e pique
const N = 6;                                     // nombre de piques
const K = 3;                                     // index de la 4e pique (qui se décale)
const SPX = i => X0 + i * GAP;                   // x de la pique i
const fx = s => s.p.x + 13;                      // centre des pieds

export default {
    name: 'Niveau 27',
    start: { x: 120, y: 368 },
    bounds: [94, 676],
    bg: 'bg',
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 300, w: 600, h: 100, c: 'room' },
            { id: 'floor', k: 'floor', x: 100, y: 400, w: 600, h: 1 },

            // Rangée de piques (toutes visibles), une tous les 75 px
            ...Array.from({ length: N }, (_, i) => (
                { id: 'sp' + i, k: 'spike', x: SPX(i), y: FY - 10, w: SW, h: 10, d: true }
            ))
        ],
        portal: { x: 650, y: 370, w: 30, h: 30 },
        rules: [
            // Touches inversées dès le début, pour toute la partie (jamais remis à 0)
            {
                if: s => true,
                do: s => {
                    s.f.inv = 1;
                }
            },
            // 4e pique : quand le joueur atteint la moitié de sa longueur, elle se décale de 25 px vers la droite
            {
                if: s => fx(s) >= SPX(K) + SW / 2,
                do: s => {
                    Object.assign(s.E['sp' + K], { tx: SPX(K) + SW, ty: FY - 10, tk: .5 });
                }
            }
        ]
    })
};