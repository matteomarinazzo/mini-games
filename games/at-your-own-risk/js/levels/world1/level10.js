// N10 : 4 piques de plafond. Les 2 premières tombent à l'approche.
// 3e pique (X[2]) :
//  - Tout droit : un mur BAS (sautable) arrive DEVANT et pousse lentement vers la gauche
//    jusqu'à nous mettre sous la pique 3, puis s'arrête et la pique tombe. Il faut le sauter.
//  - Recul avant la pique 3 : un mur HAUT (insautable) arrive DERRIÈRE et pousse vers la droite
//    jusqu'à nous mettre sous la pique 3, puis s'arrête et la pique tombe.
const B = '#feb854';
const BG = '#996b07';
const X = [250, 350, 450, 550];
const V = 1.5;                       // vitesse des murs (px/frame), le joueur fait 3
const SOUS = X[2];               // p.x du joueur centré sous la pique 3 (centre 462)
const sp = i => (
    {
        id: 'c' + i, k: 'spike', x: X[i], y: 300, w: 25, h: 10, r: 2, d: true
    });
const w_sp = i => (
    {
        id: 'w_sp' + i, k: 'solid', x: X[i], y: 0, w: 25, h: 300, c: BG, on: true
    });
const g_sp = i => (
    {
        id: 'g_sp' + i, k: 'deco', x: X[i], y: 0, w: 25, h: 300, c: B, on: true
    });

// Déclenche la chute : le flag ne se retire jamais
const drop = (s, i) => { s.f['d' + i] = 1; };

export default {
    name: 'Niveau 10', start: { x: 120, y: 368 }, bounds: [94, 676], bg: BG,
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 300, w: 600, h: 100, c: B },
            { id: 'floor', k: 'floor', x: 100, y: 400, w: 600, h: 1 },
            ...[0, 1, 2, 3].map(sp),
            ...[0, 1, 2, 3].map(g_sp),
            ...[0, 1, 2, 3].map(w_sp),
            { id: 'wh', k: 'solid', x: 900, y: 340, w: 30, h: 60, c: BG, push: 1, on: false }, // haut (60 px) : insautable
            { id: 'wl', k: 'solid', x: 900, y: 375, w: 30, h: 25, c: BG, push: 1, on: false }  // bas (25 px) : sautable
        ],
        portal: { x: 650, y: 370, w: 30, h: 30 },
        rules: [
            // Anime toutes les piques déclenchées, même si le joueur recule
            {
                once: false,
                if: s => true,
                do: s => {
                    for (let i = 0; i < 4; i++) {
                        if (!s.f['d' + i]) continue;
                        const c = s.E['c' + i];
                        const w = s.E['w_sp' + i];
                        if (c.y < 700) {
                            const dy = Math.min(10, 700 - c.y);   // ne dépasse pas 410
                            c.y += dy;
                            w.y += dy;
                        }
                    }
                }
            },
            {
                if: s => s.p.x >= X[0] - 40,
                do: s => {
                    drop(s, 0)
                }
            },
            {
                if: s => s.p.x >= X[1] - 40,
                do: s =>
                    drop(s, 1)
            },

            // x max atteint (pour détecter un recul)
            {
                once: false,
                if: s => true,
                do: s =>
                    s.f.mx = Math.max(s.f.mx || 0, s.p.x)
            },

            // RECUL avant la pique 3 -> mur haut DERRIÈRE le joueur (x perso - largeur mur - 10)
            {
                if: s => !s.f.trap && s.f.mx >= X[2] - 40 && s.p.x < X[2] - 40 && s.p.x < s.f.mx - 6,
                do: s => {
                    s.f.trap = 'A';
                    Object.assign(s.E.wh, { on: true, x: s.p.x - 30 - 10 });
                }
            },
            // Il avance vers la droite jusqu'à mettre le joueur sous la pique, puis s'arrête et la pique tombe
            {
                once: false,
                if: s => s.f.trap === 'A' && !s.f.stop,
                do: s => {
                    const w = s.E.wh, fin = SOUS - w.w + 4;   // x du mur quand le joueur est pile sous la pique
                    w.x = Math.min(fin, w.x + V);
                    if (w.x >= fin) {
                        s.f.stop = 1;
                        drop(s, 2);
                    }
                }
            },
            // Si le joueur fonce lui-même sous la pique pendant le piège A, elle tombe aussi
            {
                once: false,
                if: s => s.f.trap === 'A' && s.p.x >= SOUS - 6,
                do: s => {
                    s.f.stop = 1;
                    drop(s, 2);
                }
            },

            // TOUT DROIT -> mur bas DEVANT, il avance vers la gauche
            {
                if: s => !s.f.trap && s.p.x >= X[2] + 60,
                do: s => {
                    s.f.trap = 'B';
                    Object.assign(s.E.wl, { on: true, x: X[2] + 110 });
                }
            },
            // Il s'arrête quand un joueur collé à lui serait sous la pique, et la pique tombe
            {
                once: false,
                if: s => s.f.trap === 'B' && !s.f.stop,
                do: s => {
                    const w = s.E.wl, fin = SOUS + 22;        // joueur poussé à gauche : p.x = mur.x - 22
                    w.x = Math.max(fin, w.x - V);
                    if (w.x <= fin) { s.f.stop = 1; drop(s, 2); }
                }
            },

            {
                if: s => s.p.x >= X[3] - 40,
                do: s =>
                    drop(s, 3)
            }
        ]
    })
};