// N30 (10e du monde 2) : Salle à l'envers (rotation 180°), scie poursuivante et gap.
// Mécanique : s.f.rot = 180 (ou 90, 270) applique une rotation complète de la salle.
// À 180° : la tête est à l'envers, le sol est en haut, flèche droite fait aller à gauche.
// Déroulement :
// 1) On commence la tête à l'envers sur le sol en haut.
// 2) Dès qu'on avance vers la droite, la scie 1 roule vers nous dans une seule direction.
// 3) On saute par-dessus : la scie s'arrête net ("elle s'arrête et c'est bon").
// 4) On saute par-dessus le trou (gap1).
// 5) On franchit la seconde scie (saw2) et on entre dans le portail pour remporter le niveau.

export default {
    name: 'Niveau 30',
    start: { x: 130, y: 368 },
    bounds: [94, 676],
    bg: 'bg',
    build: () => ({
        // Initialisation de la rotation à 180° (tête à l'envers)
        f: { rot: 180 },

        ents: [
            // Décor & structure de la salle (600x200 centrée en 400, 300)
            { id: 'room', k: 'deco', x: 100, y: 200, w: 600, h: 200, c: 'room' },
            { id: 'roof', k: 'solid', x: 100, y: 0, w: 600, h: 200, c: 'dark' },
            { id: 'wall_l', k: 'solid', x: 0, y: 0, w: 100, h: 600, c: 'dark' },
            { id: 'wall_r', k: 'solid', x: 700, y: 0, w: 100, h: 600, c: 'dark' },
            { id: 'floor_base', k: 'solid', x: 100, y: 401, w: 600, h: 200, c: 'dark' },

            // Plateforme 1 : départ et zone de la scie poursuivante (x:100..420)
            { id: 'f1', k: 'solid', x: 100, y: 400, w: 320, h: 1, c: 'dark' },

            // Le trou (gap1 : 65 px)
            { id: 'gap1', k: 'gap', x: 420, y: 400, w: 65, h: 1000, c: 'light', pf: true, on: false },

            // Plateforme 2 : seconde scie et portail (x:485..700)
            { id: 'f2', k: 'solid', x: 485, y: 400, w: 215, h: 1, c: 'dark' },

            // Scie 1 : roule vers le joueur puis s'arrête définitivement une fois sautée
            { id: 'saw1', k: 'saw', x: 340, y: 400, r: 20, fy: 400, vx: 0, hidden: false },

            // Scie 2 : scie d'obstacle fixe avant le portail
            { id: 'saw2', k: 'saw', x: 565, y: 400, r: 20, fy: 400, hidden: false }
        ],

        portal: { x: 650, y: 370, w: 30, h: 30 },

        rules: [
            // Déclenchement de la scie 1 dès que le joueur avance
            {
                if: s => !s.f.sawActive && (s.p.mv || s.p.x > 140),
                do: s => {
                    s.f.sawActive = 1;
                    s.E.saw1.vx = -2.2;
                }
            },

            // Dès qu'on saute par-dessus la scie 1, elle s'arrête net
            {
                if: s => s.f.sawActive && !s.f.sawStopped && s.p.x > s.E.saw1.x + 18,
                do: s => {
                    s.f.sawStopped = 1;
                    s.E.saw1.vx = 0;
                }
            },

            // Le trou s'ouvre quand le joueur s'approche
            {
                if: s => s.p.x >= 390,
                do: s => {
                    s.E.gap1.on = true;
                }
            }
        ]
    })
};

