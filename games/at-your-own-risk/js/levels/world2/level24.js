// N24 (4e du monde 2) : « Carte penchée ». Pente descendante vers la droite, 3 rangées de piques VISIBLES (3 piques = 60 px chacune,
// écart 16 px < 18 px de hitbox => on ne peut pas se poser entre deux rangées ; portée cumulée 212 px >> saut max sur pente ~84 px).
// Solution : remonter à gauche (x<=~127) -> sauter dans le vide sur PF1 invisible (haute) -> PF2 -> PF3 -> sauter loin vers le portail.
// Calibré par simulation exacte du moteur (BFS sur toutes les entrées) : sans PF = impossible ; chaque PF est indispensable ;
// écart PF1-PF2 +6 px = impossible (serré), +3 px = encore faisable.
const X1 = 100, Y1 = 240, X2 = 700, Y2 = 480, H = 170;           // pente : sol (X1,Y1) -> (X2,Y2), décor de 170 px de haut au-dessus
const gy = x => Y1 + (Y2 - Y1) * (x - X1) / (X2 - X1);           // hauteur du sol (même formule que le moteur)
const ANG = Math.atan2(Y2 - Y1, X2 - X1);
const ROWS = [300, 390, 480];                                     // début de chaque rangée (3 piques de 20 px de pas)
// PF invisibles : [x, dessus, largeur]
const PF = [[165, 216, 50], [265, 250, 50], [415, 284, 50]];
const foot = s => s.p.y + 32;
const onPF3 = s => s.p.g && !s.p.sl && Math.abs(foot(s) - 284) < 2 && s.p.x + 22 > 400 && s.p.x + 4 < 485;

export default {
    name: 'Niveau 24',
    start: { x: 190, y: 249 },
    bounds: [94, 676],
    bg: 'bg',
    build: () => ({
        ents: [
            { id: 'slope', k: 'slope', x1: X1, y1: Y1, x2: X2, y2: Y2, h: H, c: 'room' }, // [V3]
            ...ROWS.flatMap((x0, r) => [0, 1, 2].map(i => {
                const xc = x0 + 10 + 20 * i;
                return { id: 'sp' + r + i, k: 'spike', x: xc - 11, y: gy(xc) - 9.4, w: 22, h: 10, d: true, a: ANG }; // a = incliné sur la pente
            })),
            ...PF.map(([x, y, w], i) => ({ id: 'pf' + i, k: 'solid', oneWay: true, inv: true, c: 'dark', x, y, w, h: 10, ...(i === 0 && { pad: 10 }) })), // [V3] ; [V4] pad:10 = tolérance d'atterrissage de PF1 (voir game.js) solides non dessinés
            { id: 'wall', k: 'solid', x: 540, y: 0, w: 50, h: 1000, c: 'dark', on: false }
        ],
        portal: { x: 640, y: gy(655) - 30, w: 30, h: 30, a: ANG },
        rules: [
            // Mur gauche touché -> PF1 visible (pour pouvoir sauter dessus)
            {
                if: s => s.p.x <= 96,
                do: s => { s.E.pf0.inv = false; }
            },
            // Posé sur PF2 -> PF2 s'affiche
            {
                if: s => s.p.g && !s.p.sl && Math.abs(s.p.y + 32 - 250) < 2
                    && s.p.x + 22 > 265 && s.p.x + 4 < 350,
                do: s => { s.E.pf1.inv = false; }
            },
            // Posé sur PF3 -> PF3 s'affiche
            {
                if: onPF3,
                do: s => { s.E.pf2.inv = false; }
            },
            // Posé sur PF3 : on mémorise (et on annule un éventuel « départ » précédent si on y revient)
            {
                once: false,
                if: onPF3,
                do: s => { s.f.on3 = 1; s.f.left = 0; }
            },
            // On quitte PF3 (saut OU marche dans le vide) : on note juste le départ, la décision vient après
            {
                once: false,
                if: s => s.f.on3 && !s.p.g,
                do: s => { s.f.on3 = 0; s.f.left = 1; }
            },
            // SAUT LONG : en l'air, encore à hauteur de PF3, et proche du mur (30 px avant) -> le mur apparaît (une seule fois, jamais si chute décidée)
            {
                once: false,
                if: s => s.f.left && !s.f.fall && !s.f.wall && !s.p.g && s.p.x + 22 >= 510 && foot(s) <= 290,
                do: s => { s.f.wall = 1; s.E.wall.on = true; }
            },
            // CHUTE / saut trop court : dès que le joueur est clairement sous PF3 (en descente) sans que le mur soit apparu -> plus de mur, jamais
            {
                once: false,
                if: s => s.f.left && !s.f.wall && !s.f.fall && s.p.vy > 0 && foot(s) > 284 + 10,
                do: s => { s.f.fall = 1; s.E.wall.on = false; }
            },
            // Chute : on retire les piques seulement quand le joueur est assez bas (proche des piques)
            {
                once: false,
                if: s => s.f.fall && !s.f.dec && foot(s) > gy(s.p.x + 13) - 70,
                do: s => {
                    s.f.dec = 1;
                    for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) s.E['sp' + r + i].on = false;
                }
            },
        ]
    })
};