// N22 : une scie apparaît au milieu et poursuit plus vite que le joueur (3.6 > 3 px/frame).
// Solution : courir sans s'arrêter jusqu'au mur gauche -> la scie se fige -> sauter par-dessus -> portail.
// ANTI-FEINTE (solution la plus simple) : la poursuite ne suit QUE x et ignore le saut. Sauter par-dessus la scie
// la fait juste faire demi-tour, et comme elle est plus rapide elle rattrape le joueur avant le portail :
// les allers-retours (droite/gauche/droite) ne font donc jamais gagner de temps. Seul le mur gauche la fige.
const R = 20, FY = 400, SPEED = 3.6;
const fx = s => s.p.x + 13;

export default {
    name: 'Niveau 22',
    start: { x: 120, y: 368 },
    bounds: [94, 676],
    bg: 'bg',
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 300, w: 600, h: 100, c: 'room' },
            { id: 'floor', k: 'floor', x: 100, y: 400, w: 600, h: 1 },
            { id: 'saw', k: 'saw', x: 440, y: FY, r: R, fy: FY, hidden: true, vx: 0 } // [NEW]
        ],
        portal: { x: 650, y: 370, w: 30, h: 30 },
        rules: [
            // Apparition quand le joueur approche
            {
                if: s => fx(s) >= 320,
                do: s => {
                    s.E.saw.hidden = false;
                }
            },
            // Poursuite en x (ignore le saut), dès que la scie est entièrement sortie, tant qu'elle n'est pas figée
            {
                once: false,
                if: s => !s.E.saw.hidden && s.E.saw.out >= 1 && !s.E.saw.still,
                do: s => {
                    const w = s.E.saw, d = fx(s) - w.x;
                    w.vx = Math.abs(d) <= SPEED ? d : Math.sign(d) * SPEED;
                }
            },
            // Joueur collé au mur gauche : la scie se fige (plus de déplacement ni de rotation)
            {
                if: s => !s.E.saw.hidden && s.p.x <= s.b[0] + 3,
                do: s => {
                    s.E.saw.still = true;
                    s.E.saw.vx = 0;
                }
            }
        ]
    })
};