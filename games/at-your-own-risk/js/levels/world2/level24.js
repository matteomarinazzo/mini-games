// N24 (4e du monde 2) : porte initialement à droite.
// Comportement : chaque fois qu'on touche la porte, elle se téléporte aléatoirement dans la piece (toujours au sol).
// Solution : peut importe quand : sauter par dessus la porte (sans la toucher), se reposer au sol pour figer sa position, puis la toucher.

const FY = 400, PW = 30;
const MIN = 144, MAX = 626 - PW;   // 50px de marge avec les bords (94 / 676)
const fx = s => s.p.x + 13;        // centre des pieds
const foot = s => s.p.y + 32;      // bas des pieds

// Nouvelle position : au moins 150px du joueur (gauche ou droite), dans les limites
const newX = s => {
    const c = fx(s);
    const opts = [];
    if (c - 150 - PW >= MIN) opts.push([MIN, c - 150 - PW]);   // zone gauche
    if (c + 150 <= MAX) opts.push([c + 150, MAX]);             // zone droite
    if (!opts.length) return MIN;
    const [a, b] = opts[Math.floor(Math.random() * opts.length)];
    return a + Math.random() * (b - a);
};

export default {
    name: 'Niveau 24',
    start: { x: 120, y: 368 },
    bounds: [94, 676],
    bg: 'bg',
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 300, w: 600, h: 100, c: 'room' },
            { id: 'floor', k: 'floor', x: 100, y: 400, w: 600, h: 1 },

            // Faux portail mobile (le leurre qui se téléporte)
            { id: 'pf', k: 'fake', x: 650, y: 370, w: PW, h: 30 }
        ],
        // Vrai portail : caché hors de la pièce tant que la position n'est pas figée
        portal: { x: -100, y: 370, w: PW, h: 30 },
        rules: [
            // A. En l'air AU-DESSUS du faux portail (pieds au-dessus de son sommet) : on mémorise le survol
            {
                once: false,
                if: s => !s.f.lock && !s.p.g && fx(s) >= s.E.pf.x && fx(s) <= s.E.pf.x + PW && foot(s) <= FY - 30,
                do: s => {
                    s.f.over = 1;
                }
            },

            // B. Toucher le faux portail AU SOL (avant d'être figé) : il se téléporte et le survol est annulé
            //    (en l'air, le contact est ignoré pour permettre de sauter par-dessus)
            {
                once: false,
                if: s => !s.f.lock && s.p.g && s.hit(s.E.pf),
                do: s => {
                    s.f.over = 0;
                    s.E.pf.x = newX(s);
                }
            },

            // C. Survol validé + pieds reposés au sol sans avoir touché le portail : position figée
            {
                if: s => !s.f.lock && s.f.over && s.p.g && !s.hit(s.E.pf),
                do: s => {
                    s.f.lock = 1;
                    s.portal.x = s.E.pf.x;
                    s.E.pf.on = false;
                }
            }
        ]
    })
};