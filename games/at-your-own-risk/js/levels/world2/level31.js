// N31 (11e du monde 2) : Même configuration que le niveau 30, avec rotation progressive dynamique !
// Départ à plat (rot: 0) qui pivote continuellement au fur et à mesure que le joueur avance vers le portail (rot: 180).

export default {
    name: 'Niveau 31',
    start: { x: 130, y: 368 },
    bounds: [94, 676],
    bg: 'bg',
    build: () => ({
        // Initialisation à plat (0°) et suivi direct de la rotation
        f: { rot: 0, rotDirect: 1 },

        ents: [
            // Décor & structure de la salle (600x200 centrée en 400, 300)
            { id: 'room', k: 'deco', x: 100, y: 200, w: 600, h: 200, c: 'room' },
            { id: 'roof', k: 'solid', x: 100, y: 0, w: 600, h: 200, c: 'dark' },
            { id: 'wall_l', k: 'solid', x: 0, y: 0, w: 100, h: 600, c: 'dark' },
            { id: 'wall_r', k: 'solid', x: 700, y: 0, w: 100, h: 600, c: 'dark' },
            { id: 'floor_base', k: 'solid', x: 100, y: 401, w: 600, h: 200, c: 'dark' },

            // Plateforme 1 : départ et zone de la scie poursuivante (x:100..420)
            { id: 'f1', k: 'solid', x: 100, y: 400, w: 320, h: 1, c: 'dark' },

            // Le trou (gap1 : 65 px, s'ouvre à x >= 390)
            { id: 'gap1', k: 'gap', x: 420, y: 399, w: 65, h: 1000, c: 'light', pf: true, on: false },

            // Plateforme 2 : seconde scie et portail (x:485..700)
            { id: 'f2', k: 'solid', x: 485, y: 400, w: 215, h: 1, c: 'dark' },

            // Scie 1 : roule vers le joueur puis s'arrête définitivement une fois sautée
            { id: 'saw1', k: 'saw', x: 340, y: 400, r: 20, fy: 400, vx: 0, hidden: false },

            // Scie 2 : scie d'obstacle fixe avant le portail
            { id: 'saw2', k: 'saw', x: 565, y: 400, r: 20, fy: 400, hidden: false }
        ],

        portal: { x: 650, y: 370, w: 30, h: 30 },

        rules: [
            // Rotation progressive synchronisée sur la marche du joueur :
            // À x=130 (départ) -> rot = 0° (à plat, commence toujours à 0°)
            // À x=650 (portail) -> rot = 180° (tête à l'envers, ou remplacer par 360 pour un tour complet)
            {
                once: false,
                if: () => true,
                do: s => {
                    const prog = Math.max(0, Math.min(1, (s.p.x - 130) / (650 - 130)));
                    s.f.rot = prog * 720;
                }
            },

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
                    s.E.saw1.still = true;
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
