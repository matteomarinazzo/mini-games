// N29 (9e du monde 2) : Saut calibré (chargeJump), scie, boutons-pièges, piques et faux portail.
// Mécanique : bouton 1 active le saut chargé (s.f.chargeJump = 1).
// Court maintien (ou clic rapide) = saut très puissant (mortel contre les piques au plafond).
// Maintien prolongé (jusqu'à 2000 ms) = saut amorti / faible, pour franchir les trous sans toucher le plafond.
// Parcours :
// 1) Activer btn1 : apparition des piques au plafond et sur les murs latéraux, sortie de la scie.
// 2) Calibrer ses sauts par-dessus les trous et la scie (en évitant le bouton-piège btn2).
// 3) Sauter par-dessus le grand trou vers la plateforme droite (en évitant le bouton-piège btn3).
// 4) Toucher le faux portail à droite : il disparaît, le vrai portail apparaît à l'extrême gauche, et un trou (gap3) s'ouvre sur la première plateforme.
// 5) Retour à gauche avec des sauts calibrés pour atteindre le vrai portail.

const press = (s, id, sol, k = .2) => Object.assign(s.E[id], {
    h: 8, tx: s.E[id].x, ty: sol - 8, tk: k
});
const ready = e => e.h === 16;

export default {
    name: 'Niveau 29',
    start: { x: 115, y: 368 },
    bounds: [94, 676],
    bg: 'bg',
    build: () => ({
        ents: [
            // Décor & structure de la salle
            { id: 'room', k: 'deco', x: 100, y: 200, w: 600, h: 200, c: 'room' },
            { id: 'roof', k: 'solid', x: 100, y: 0, w: 600, h: 200, c: 'dark' },
            { id: 'wall_l', k: 'solid', x: 0, y: 0, w: 100, h: 600, c: 'dark' },
            { id: 'wall_r', k: 'solid', x: 700, y: 0, w: 100, h: 600, c: 'dark' },
            { id: 'floor_base', k: 'solid', x: 100, y: 401, w: 600, h: 200, c: 'dark' },

            // Plateforme 1 (gauche) : zone du portail (x:100..145), sol effondrable (x:145..185), zone btn1 (x:185..230)
            { id: 'f1_a', k: 'solid', x: 100, y: 400, w: 45, h: 1, c: 'dark' },
            { id: 'f1_b', k: 'solid', x: 145, y: 400, w: 40, h: 1, c: 'dark' },
            { id: 'f1_c', k: 'solid', x: 185, y: 400, w: 45, h: 1, c: 'dark' },

            // Trou qui s'ouvre au retour (gap3)
            { id: 'gap3', k: 'gap', x: 145, y: 400, w: 40, h: 1000, c: 'light', pf: true, on: false },

            // Trou 1 (60 px)
            { id: 'gap1', k: 'gap', x: 230, y: 400, w: 60, h: 1000, c: 'light', pf: true, on: true },

            // Plateforme 2 (îlot) : x:290..345 (55 px)
            { id: 'f2', k: 'solid', x: 290, y: 400, w: 55, h: 1, c: 'dark' },

            // Trou 2 (50 px)
            { id: 'gap2', k: 'gap', x: 345, y: 400, w: 50, h: 1000, c: 'light', pf: true, on: true },

            // Plateforme 3 (milieu) : x:395..540 (145 px) - Scie + bouton piège
            { id: 'f3', k: 'solid', x: 395, y: 400, w: 145, h: 1, c: 'dark' },

            // Trou 4 (grand trou : 80 px)
            { id: 'gap4', k: 'gap', x: 540, y: 400, w: 80, h: 1000, c: 'light', pf: true, on: true },

            // Plateforme 4 (droite) : x:620..700 (80 px) - Faux portail + bouton piège
            { id: 'f4', k: 'solid', x: 620, y: 400, w: 80, h: 1, c: 'dark' },

            // Boutons :
            // btn1 : active le saut chargé et fait apparaître les dangers
            { id: 'btn1', k: 'btn', x: 200, y: 384, w: 16, h: 16, c: '#d22', cp: '#7a1111' },
            // btn2 : piège mortel sur la plateforme centrale
            { id: 'btn2', k: 'btn', x: 465, y: 384, w: 16, h: 16, c: '#d22', cp: '#7a1111' },
            // btn3 : piège mortel devant le faux portail
            { id: 'btn3', k: 'btn', x: 635, y: 384, w: 16, h: 16, c: '#d22', cp: '#7a1111' },

            // Scie mobile au sol (plateforme 3)
            { id: 'saw1', k: 'saw', x: 440, y: 400, r: 20, fy: 400, vx: 1.5, hidden: true },

            // Piques au plafond (24 piques de 25 px de large, couvrent tout le plafond de x=100 à x=700)
            ...Array.from({ length: 24 }, (_, i) => ({
                id: 'spc' + i,
                k: 'spike',
                x: 100 + i * 25,
                y: 200,
                w: 25,
                h: 10,
                r: 2,
                d: true,
                on: true
            })),

            // Piques mur gauche (pointent vers la droite, r:1)
            ...Array.from({ length: 5 }, (_, i) => ({
                id: 'spl' + i,
                k: 'spike',
                x: 100,
                y: 200 + i * 25,
                w: 10,
                h: 25,
                r: 1,
                d: true,
                on: true
            })),

            // Piques mur droit (pointent vers la gauche, r:3)
            ...Array.from({ length: 5 }, (_, i) => ({
                id: 'spr' + i,
                k: 'spike',
                x: 690,
                y: 200 + i * 25,
                w: 10,
                h: 25,
                r: 3,
                d: true,
                on: true
            }))
        ],

        // Vrai portail (initialement hors champ au-dessus de la salle)
        portal: { x: 665, y: 370, w: 30, h: 30 },

        rules: [
            // Clic sur le premier bouton (btn1) : activation de s.f.chargeJump, sortie des piques et de la scie
            {
                if: s => s.p.g && ready(s.E.btn1) && s.hit(s.E.btn1),
                do: s => {
                    press(s, 'btn1', 400);
                    s.f.chargeJump = 1;
                    s.f.jumpMax = -20;
                    s.f.jumpMin = -2.5;
                    // Activation des piques au plafond
                    for (let i = 0; i < 24; i++) s.E['spc' + i].on = true;
                    // Activation des piques sur les murs latéraux
                    for (let i = 0; i < 5; i++) {
                        s.E['spl' + i].on = true;
                        s.E['spr' + i].on = true;
                    }
                    // Sortie de la scie
                    s.E.saw1.hidden = false;
                }
            },

            // Bouton 2 : piège mortel
            {
                if: s => s.p.g && ready(s.E.btn2) && s.hit(s.E.btn2),
                do: s => {
                    press(s, 'btn2', 400);
                    s.die();
                }
            },

            // Bouton 3 : piège mortel
            {
                if: s => s.p.g && ready(s.E.btn3) && s.hit(s.E.btn3),
                do: s => {
                    press(s, 'btn3', 400);
                    s.die();
                }
            },

            // Patrouille aller-retour de la scie sur la plateforme 3 (x entre 420 et 515)
            {
                once: false,
                if: s => !s.E.saw1.hidden && (s.E.saw1.x > 515 || s.E.saw1.x < 420),
                do: s => {
                    const e = s.E.saw1;
                    e.x = Math.max(420, Math.min(515, e.x));
                    e.vx = -e.vx;
                }
            },
        ],
    })
};

