// N28 (8e du monde 2) : 2 sols, une pente. un portail (fake) à droite, le joueur à gauche. Un btn visible (btn1). btn 2 pas visible. 
// Partie 1 : comportement : 
// 1) Le joueur descent la rampe, touche le btn1 : le sol descent d'un cran (avec animation), le btn1 est marqué comme cliqué, le btn2 apparait.
// 2) Le joueur remonte la pente, touche le btn2 : le sol descent d'un cran (avec animation), le btn2 est marqué comme cliqué, le btn1 redevient normal.
// 3) Ainsi de suite, jusqu'à ce qu'il manque un seul cran avant que le joueur puisse aller sur le sol2. à ce moment-là : le btn à cliquer doit être le btn1. Si on le touche : on meurt
// Solution : il faut sauter par dessus le btn1, se poser au sol, puis toucher le btn1. Le sol descent du dernier cran.
// Partie 2 : comportement :
// 1) Le joueur atteint le portail (fake) : le portail fake disparait et le vrai portail apparait en x = 560.
// 2) Le joueur se dirige vers le portail (vrai) : un trou apparait.
// Solution : le joueur saute par dessus le trou et atteint le portail.

const CRAN = 50;
const TRAP_AT = 2; // nombre de crans déjà descendus : piège au clic suivant (3e clic)
const SOL_B1 = 400, SOL_B2 = 250;
const fx = s => s.p.x + 13;
const move = (s, id, y, k = .2) => Object.assign(s.E[id], { tx: s.E[id].x, ty: y, tk: k });
const press = (s, id, sol, k = .2) => Object.assign(s.E[id], {
    h: 8, tx: s.E[id].x, ty: sol - 8, tk: k
});
const unpress = (s, id, y, k = .2) => Object.assign(s.E[id], {
    h: 16, tx: s.E[id].x, ty: y, tk: k
});
const ready = e => e.h === 16;

export default {
    name: 'Niveau 28',
    start: { x: 110, y: 200 },
    bounds: [94, 676],
    bg: 'bg',
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 200, w: 600, h: 200, c: 'room' },
            { id: 'bg', k: 'deco', x: 100, y: 250, w: 399, h: 200, c: 'dark' },
            { id: 'slope', k: 'slope', x1: 150, y1: 250, x2: 500, y2: 400, h: 200, c: 'room' },
            { id: 'roof', k: 'solid', x: 100, y: 0, w: 600, h: 200, c: 'dark' },
            { id: 'floor', k: 'solid', x: 100, y: 400, w: 600, h: 1, c: 'dark' },
            { id: 'floor1', k: 'solid', x: 100, y: 250, w: 50, h: 200, c: 'dark', oneWay: true },
            { id: 'floor2', k: 'solid', x: 550, y: 250, w: 150, h: 200, c: 'dark', mv: true, oneWay: false },
            { id: 'btn1', k: 'btn', x: 500, y: 384, w: 16, h: 16, c: '#d22', cp: '#7a1111' },
            { id: 'btn2', k: 'btn', x: 117, y: 234, w: 16, h: 16, c: '#d22', cp: '#7a1111', on: false },
            { id: 'fp', k: 'fake', x: 660, y: 220, w: 30, h: 30 },

            // Pont indispensable : le squelette laisse 50 px entre la pente (x=500)
            // et floor2 (x=550). À y=400, ce petit sol assure la continuité praticable.
            { id: 'bridge', k: 'solid', x: 500, y: 400, w: 50, h: 1, c: 'dark' },
            // Trou final devant le portail nouvellement placé, sans déplacer le gap d'origine.
            { id: 'gap', k: 'gap', x: 590, y: 390, w: 25, h: 1000, c: 'light', on: false, pf: true }
        ],
        // Portail initial conservé hors champ comme dans le squelette ; sa cible sera x=560,y=370.
        portal: { x: 560, y: -100, w: 30, h: 30 },
        rules: [
            // Le moteur ne colle naturellement à une pente que pendant une descente. Cette
            // règle permet aussi de la remonter : si le joueur est au sol et à moins de
            // 4 px de la surface, ses pieds suivent la pente (sans téléporter un saut).
            {
                once: false,
                if: s => {
                    const e = s.SL, x = fx(s);
                    if (!e || x < e.x1 || x > e.x2 || !s.p.g || s.p.vy !== 0) return false;
                    const y = e.y1 + (e.y2 - e.y1) * (x - e.x1) / (e.x2 - e.x1);
                    return Math.abs(s.p.y + 32 - y) <= 4;
                },
                do: s => {
                    const e = s.SL, x = fx(s);
                    const y = e.y1 + (e.y2 - e.y1) * (x - e.x1) / (e.x2 - e.x1);
                    s.p.y = y - 32; s.p.g = true; s.p.sl = true;
                }
            },
            // Avant l'approche, le faux portail descend au niveau du sol bas pour être
            // atteignable après le déplacement de floor2 ; sa position initiale reste intacte.
            {
                if: s => s.f.fin && !s.f.fpAnime && fx(s) >= 610,
                do: s => {
                    s.f.fpAnime = 1;
                    Object.assign(s.E.fp, { ty: 370, tk: .25 });
                }
            },
            // Détecteur du passage en l'air au-dessus du bouton 1, uniquement au cran-piège.
            {
                once: false,
                if: s => s.f.crans === TRAP_AT && !s.f.b1Survole && !s.p.g &&
                    s.p.x + 4 < s.E.btn1.x + s.E.btn1.w && s.p.x + 22 > s.E.btn1.x &&
                    s.p.y + 32 <= s.E.btn1.y + 2,
                do: s => {
                    s.f.b1Survole = 1;
                }
            },
            // Bouton 1 : crans 1 et 3. Au dernier, il faut l'avoir survolé puis revenir posé.
            {
                once: false,
                if: s => s.f.crans !== TRAP_AT && (s.f.crans || 0) < 2 &&
                    s.p.g && ready(s.E.btn1) && s.hit(s.E.btn1),
                do: s => {
                    s.f.crans = (s.f.crans || 0) + 1;
                    press(s, 'btn1', SOL_B1);
                    move(s, 'floor2', 250 + CRAN * s.f.crans);
                    move(s, 'fp', 220 + CRAN * s.f.crans);
                    s.E.btn2.on = true;
                }
            },
            {
                once: false,
                if: s => s.f.crans === TRAP_AT && !s.f.fin && s.p.g &&
                    ready(s.E.btn1) && s.hit(s.E.btn1),
                do: s => {
                    if (!s.f.b1Survole) {
                        s.die();
                        return;
                    }
                    s.f.fin = 1;
                    s.f.crans = TRAP_AT + 1;
                    press(s, 'btn1', SOL_B1);
                    move(s, 'floor2', 250 + CRAN * s.f.crans);
                    move(s, 'fp', 220 + CRAN * s.f.crans);
                }
            },
            // Bouton 2 : deuxième cran, puis le bouton 1 ressort/réarme.
            {
                once: false,
                if: s => s.f.crans === 1 && s.p.g && ready(s.E.btn2) &&
                    s.E.btn2.on !== false && s.hit(s.E.btn2),
                do: s => {
                    s.f.crans = 2;
                    press(s, 'btn2', SOL_B2);
                    move(s, 'floor2', 250 + CRAN * s.f.crans);
                    move(s, 'fp', 220 + CRAN * s.f.crans);
                    unpress(s, 'btn1', 384);
                }
            },
            // Le faux portail conserve la coordonnée demandée y=220. Après que floor2
            // descend à y=400, il est 150 px au-dessus du joueur et un saut (36 px)
            // ne peut pas l'atteindre. On active donc au passage sous son abscisse,
            // sans déplacer l'entité : c'est le compromis qui respecte le squelette.
            // Arrivée sous le faux portail : remplacement et apparition du trou.
            {
                if: s => s.f.fin && !s.f.fpUtilise && fx(s) >= 650,
                do: s => {
                    s.f.fpUtilise = 1;
                    s.E.fp.on = false;
                    s.E.fp.used = 1;
                    Object.assign(s.portal, { x: 560, y: 370, w: 30, h: 30 });
                    s.clip = 400; // le moteur fixe clip à partir du portail initial (masqué hors écran)
                }
            },
            {
                if: s => s.f.fpUtilise && s.p.x <= 625,
                do: s => {
                    s.E.gap.on = true;
                }
            }
        ],
        // Ignore le portail caché initialement ; le portail déplacé est gagnant.
        onPortal(s) { return !s.f.fpUtilise; }
    })
};
