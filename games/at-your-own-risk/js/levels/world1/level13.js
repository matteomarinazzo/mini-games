// N13 : mur qui se lève, boutons cachés, piques, faux portail qui revient à gauche.
const B = '#feb854', BG = '#996b07';
const B1X = 50, B2X = 590, SPX = 70;
const move = (s, id, y, k = .2) => Object.assign(s.E[id], { tx: s.E[id].x, ty: y, tk: k });

// Bouton pressé : h réduit à 8 et le bas reste posé sur le sol (y = 400 -> ty = 392)
const press = (s, id, k = .2) => Object.assign(s.E[id], { h: 8, tx: s.E[id].x, ty: 392, tk: k }); const up = e => e.y <= 392; // bouton sorti du sol
const unpress = (s, id, y, k = .2) => Object.assign(s.E[id], { h: 16, tx: s.E[id].x, ty: y, tk: k });

export default {
    name: 'Niveau 13', start: { x: 200, y: 368 }, bounds: [0, 676], bg: BG,
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 0, y: 300, w: 700, h: 100, c: B },
            { id: 'floor', k: 'floor', x: 0, y: 400, w: 700, h: 1 },
            // Objets cachés SOUS le sol (y = 400), ils montent avec une animation
            { id: 'wall', k: 'solid', x: 450, y: 400, w: 125, h: 80, c: BG },
            { id: 'b1', k: 'btn', x: B1X, y: 400, w: 16, h: 16, c: '#d22', cp: '#7a1111' },
            { id: 'b2', k: 'btn', x: B2X, y: 400, w: 16, h: 16, c: '#d22', cp: '#7a1111' },
            // Cache : dessiné APRÈS, il masque tout ce qui est sous le sol
            { id: 'cover', k: 'deco', x: 0, y: 400, w: 800, h: 200, c: BG },
            { id: 'sp', k: 'spike', x: SPX, y: 400, w: 25, h: 10, on: false, d: true }],
        portal: { x: 650, y: 370, w: 30, h: 30 },
        rules: [
            // 0 -> 1a : le mur se lève, on est bloqué
            {
                if: s => !s.f.ph && s.p.x >= 420,
                do: s => {
                    s.f.ph = 1;
                    s.b[1] = 426;
                }
            },
            // 1a -> 1b : anime le mur tant qu'il n'est pas en haut
            {
                once: false,
                if: s => s.f.ph === 1 && s.E.wall.y > 320,
                do: s => {
                    s.E.wall.y = Math.max(320, s.E.wall.y - 5);
                }
            },
            // 1b -> 2 : collé à gauche, le bouton 1 sort
            {
                if: s => s.f.ph === 1 && s.p.x <= s.b[0] + 2,
                do: s => {
                    s.f.ph = 2;
                    move(s, 'b1', 384);
                }
            },
            // 2 -> 3 : appui sur le bouton 1, le bouton 2 sort après le mur
            {
                if: s => s.f.ph === 2 && up(s.E.b1) && s.hit(s.E.b1),
                do: s => {
                    s.f.ph = 3;
                    press(s, 'b1');
                    move(s, 'b2', 384);
                }
            },
            // 3 -> 4 : collé au mur, le bouton 1 se RÉARME (il ressort, on peut re-peser dessus)
            {
                if: s => s.f.ph === 3 && s.p.x >= 424,
                do: s => {
                    s.f.ph = 4;
                    unpress(s, 'b1', 384);
                }
            },
            // 4 : en revenant (détection x = 95), les piques surgissent devant le bouton
            {
                once: false,
                if: s => s.f.ph === 4 && s.p.x <= 95,
                do: s => {
                    s.E.sp.on = true;
                    if (s.E.sp.y > 390)
                        s.E.sp.y -= 5;
                }
            },
            // 4 -> 5a : 2e appui sur le bouton 1, le mur se baisse
            {
                if: s => s.f.ph === 4 && up(s.E.b1) && s.hit(s.E.b1),
                do: s => {
                    s.f.ph = 5;
                    s.b[1] = 676;
                    press(s, 'b1');
                }
            },
            // 5a -> 5b : le mur redescend
            {
                once: false,
                if: s => s.f.ph === 5 && s.E.wall.y < 400,
                do: s => {
                    s.E.wall.y = Math.min(400, s.E.wall.y + 5);
                }
            },
            // 5b : le bouton 2 tue
            {
                once: false,
                if: s => s.f.ph === 5 && up(s.E.b2) && s.hit(s.E.b2),
                do: s =>
                    s.die()
            },
            // 6 : le portail s'enfonce dans le sol (masqué par le clip à y = 400)
            {
                once: false,
                if: s => s.f.ph === 6 && s.portal.y < 400,
                do: s =>
                    s.portal.y += 2
            },
            // 6 -> 7 : le bouton 2 renvoie le portail tout à gauche, derrière les piques
            {
                if: s => s.f.ph === 6 && s.hit(s.E.b2),
                do: s => {
                    s.f.ph = 7;
                    press(s, 'b2');
                    Object.assign(s.portal, { x: 15, y: 400 });
                }
            },
            {
                once: false,
                if: s => s.f.ph === 7 && s.portal.y > 370,
                do: s =>
                    s.portal.y -= 2
            }],
        // Le portail ne compte qu'en phase 7. En phase 5, le toucher le fait descendre.
        onPortal(s) {
            if (s.f.ph === 7) return false;
            if (s.f.ph === 5) s.f.ph = 6;
            return true;
        }
    })
};