// N20 : « La Fuite » - Finale
// PHASE 1 : Faux portail f1 (x=650), pique sp_f1 dessous qui apparaît puis s'enlève. Toucher f1 -> PHASE 2
// PHASE 2 : Faux portail f2 (x=750). En approchant, sa pique glisse vers nous. La sauter, toucher f2 -> PHASE 3
// PHASE 3 : Leurre en x=200. La presse s'écrase, le sol s'effondre. Bouton 1 (x=520) -> PHASE 4
// PHASE 4 : La presse remonte. A l'approche du leurre, il saute en x=480 -> PHASE 5
// PHASE 5 : Presse en cycle. Bouton 2 (x=130) = PIÈGE : fige la presse mais condamne le final
// PHASE 6 : Le leurre, posé sur sa plateforme, vole au-dessus du trou. La plateforme se rétracte, il tombe.
// FINAL   : Sauter dans le vide -> sol en y=590 + vrai portail -> le sol remonte (sauf si bouton 2 utilisé)

const D = '#996b07';   // Brun foncé
const B = '#feb854';   // Beige clair
const R = '#d22';      // Rouge (boutons)
const GP = '#7a1111';  // Rouge foncé (bouton enfoncé)

const PX = 320;                  // X de la presse
const PMAX = 200;                // Descente max de la presse
const C = [0, 1, 2, 3, 4, 5];    // 6 piques sous la presse
const LOW = 590;                 // Sol secret dans le trou
const FPW = 40;                  // Largeur de la plateforme du leurre

const fx = s => s.p.x + 13;      // Centre des pieds du joueur

// Collision joueur (26x32) / entité active
const hit = (s, e) => e.on !== false
    && s.p.x < e.x + e.w && s.p.x + 26 > e.x
    && s.p.y < e.y + e.h && s.p.y + 32 > e.y;

// Rapproche v de target sans la dépasser
const step = (v, target, sp) => v < target ? Math.min(v + sp, target) : Math.max(v - sp, target);

// Place la presse : le mur et les piques suivent le même offset
const press = (s, py) => {
    s.f.py = py;
    s.E.pb.y = py;
    C.forEach(i => s.E['c' + i].y = 200 + py);
};

// Boutons
const onBtn = (s, e) => e.on !== false && s.p.g && fx(s) >= e.x && fx(s) <= e.x + e.w;
const pushBtn = e => Object.assign(e, { y: 392, h: 8, c: GP });

// Déplace sol secret + vrai portail ensemble
const moveLow = (s, dy) => {
    s.E.low.y += dy;
    s.portal.y += dy;
    s.clip = s.E.low.y + 10;          // le clip suit le sol
};

export default {
    name: 'Niveau 20',
    start: { x: 120, y: 368 },
    bounds: [94, 900],
    bg: D,
    build: () => ({
        ents: [
            // === DÉCOR PRINCIPAL ===
            { id: 'room', k: 'deco', x: 100, y: 200, w: 800, h: 200, c: B },
            { id: 'floor', k: 'floor', x: 100, y: 400, w: 800, h: 1 },

            // === PHASE 1 ===
            { id: 'sp1_a', k: 'spike', x: 200, y: 390, w: 25, h: 10, d: true, on: true },
            { id: 'sp1_b', k: 'spike', x: 212, y: 390, w: 25, h: 10, d: true, on: true },
            { id: 'f1', k: 'fake', x: 650, y: 370, w: 30, h: 30 },
            { id: 'sp_f1', k: 'spike', x: 653, y: 390, w: 25, h: 10, d: true, on: false },

            // === PHASE 2 ===
            { id: 'f2', k: 'fake', x: 750, y: 370, w: 30, h: 30, on: false },
            { id: 'sp_f2', k: 'spike', x: 753, y: 390, w: 25, h: 10, d: true, on: false },

            // === PHASES 3-6 : leurre + sa plateforme ===
            { id: 'fpp', k: 'deco', x: 195, y: 400, w: FPW, h: 6, c: D, on: false },
            { id: 'fp', k: 'fake', x: 200, y: 370, w: 30, h: 30, on: false },

            // === PRESSE ===
            { id: 'pb', k: 'solid', x: PX, y: 0, w: 150, h: 200, c: D, state: 'down' },
            ...C.map(i => ({ id: 'c' + i, k: 'spike', x: PX + 25 * i, y: 200, w: 25, h: 10, d: true, on: true, r: 2 })),

            // === Sol qui s'effondre ===
            { id: 'gc', k: 'gap', x: 860, y: 400, w: 40, h: 200, c: B, on: false },

            // === Boutons ===
            { id: 'btn1', k: 'btn', x: 520, y: 384, w: 16, h: 16, c: R, on: false },
            { id: 'btn2', k: 'btn', x: 130, y: 384, w: 16, h: 16, c: R, on: false },

            // === Remplace visuellement le gap quand il est désactivé (garde le trou beige) ===
            { id: 'hole', k: 'deco', x: 600, y: 400, w: 300, h: 200, c: B, on: false },
            // === Sol secret : brun (comme le sol), visible sur le trou beige ===
            { id: 'low', k: 'solid', x: 600, y: LOW, w: 300, h: 20, c: D, on: false }

        ],
        portal: { x: -100, y: -100, w: 30, h: 30 },  // Vrai portail caché
        rules: [
            // ============================================================
            // PHASE 1 (identique)
            // ============================================================
            {
                if: s => fx(s) >= 200,
                do: s => {
                    if (!s.f.ph1_triggered) {
                        s.f.ph1_triggered = 1;
                        s.f.ph = 1;
                    }
                }
            },
            {
                if: s => s.p.x >= 600,
                do: s => s.E.sp_f1.on = true
            },
            {
                if: s => s.p.x >= 640,
                do: s => {
                    s.E.sp_f1.on = false;
                    s.E.f2.on = true;

                    // Inverser les commandes
                    s.f.inv = 1;
                }
            },
            {
                if: s => s.f.ph == 1 && hit(s, s.E.f1),
                do: s => {
                    s.E.f1.on = false;
                    s.E.sp_f2.on = true;
                    s.f.ph = 2;
                }
            },

            // ============================================================
            // PHASE 2
            // ============================================================
            {
                if: s => s.f.ph == 2 && fx(s) >= 690,
                do: s => s.f.slide = 1
            },
            {
                once: false,
                if: s => s.f.slide && s.E.sp_f2.x > 600,
                do: s => s.E.sp_f2.x = step(s.E.sp_f2.x, 600, 4)
            },
            {
                if: s => s.f.ph == 2 && hit(s, s.E.f2),
                do: s => {
                    s.f.ph = 3;
                    s.E.f2.on = false;
                    s.E.sp_f2.on = false;
                    s.E.sp1_a.on = false;
                    s.E.sp1_b.on = false;
                    s.E.fp.on = true;
                    s.E.gc.on = true;
                    s.E.btn1.on = true;
                }
            },

            // ============================================================
            // PHASE 3
            // ============================================================
            {
                once: false,
                if: s => s.f.ph == 3,
                do: s => press(s, step(s.f.py || 0, PMAX, 6))
            },
            {
                once: false,
                if: s => s.E.gc.on && s.E.gc.x > 600,
                do: s => {
                    s.E.gc.x -= 2;
                    s.E.gc.w += 2;
                }
            },
            {
                if: s => s.f.ph == 3 && onBtn(s, s.E.btn1),
                do: s => {
                    s.f.ph = 4;
                    pushBtn(s.E.btn1);
                }
            },

            // ============================================================
            // PHASE 4
            // ============================================================
            {
                once: false,
                if: s => s.f.ph == 4,
                do: s => press(s, step(s.f.py, 0, 4))
            },
            {
                if: s => s.f.ph == 4 && fx(s) <= 260,
                do: s => {
                    s.f.ph = 5;
                    s.E.fp.x = 480;
                    s.E.fpp.on = true;      // Le leurre a maintenant sa plateforme
                    s.E.pb.state = 'down';
                    s.E.btn2.on = true;
                }
            },

            // ============================================================
            // PHASE 5 : presse en cycle, bouton 2 = piège
            // ============================================================
            {
                once: false,
                if: s => s.f.ph >= 5 && !s.f.stop,
                do: s => {
                    const P = s.E.pb;
                    if (P.state == 'down' && s.f.py >= PMAX) P.state = 'up';
                    else if (P.state == 'up' && s.f.py <= 0) P.state = 'down';
                    press(s, step(s.f.py, P.state == 'down' ? PMAX : 0, 3));
                }
            },
            // Bouton 2 : fige la presse... et condamne le final
            {
                if: s => s.f.ph >= 5 && onBtn(s, s.E.btn2),
                do: s => {
                    s.f.stop = 1;
                    pushBtn(s.E.btn2);
                }
            },
            {
                if: s => s.f.ph == 5 && fx(s) >= 300,
                do: s => s.f.ph = 6
            },

            // ============================================================
            // PLATEFORME DU LEURRE : toujours sous lui (tant qu'elle existe)
            // ============================================================
            {
                once: false,
                if: s => s.E.fpp.on && !s.f.retract,
                do: s => {
                    s.E.fpp.x = s.E.fp.x + 15 - FPW / 2;
                    s.E.fpp.y = s.E.fp.y + 30;
                }
            },

            // ============================================================
            // PHASE 6 : vol au-dessus du trou
            // ============================================================
            {
                once: false,
                if: s => s.f.ph == 6 && !s.f.retract,
                do: s => {
                    s.E.fp.x = step(s.E.fp.x, 700, 2);
                    s.E.fp.y = step(s.E.fp.y, 330, 1);
                }
            },
            // Le joueur arrive au bord -> la plateforme se rétracte
            {
                if: s => s.f.ph == 6 && fx(s) >= 560,
                do: s => s.f.retract = 1
            },
            {
                once: false,
                if: s => s.f.retract && s.E.fpp.on,
                do: s => {
                    s.E.fpp.w -= 2;
                    s.E.fpp.x += 1;              // Rétractation centrée
                    if (s.E.fpp.w <= 0) {
                        s.E.fpp.on = false;
                        s.f.fall = 1;
                    }
                }
            },
            // Plus de plateforme -> le leurre tombe jusqu'à y=600
            {
                once: false,
                if: s => s.f.fall && s.E.fp.on,
                do: s => {
                    s.E.fp.y += 5;
                    if (s.E.fp.y >= 600) s.E.fp.on = false;
                }
            },

            // ============================================================
            // FINAL : sauter dans le vide
            // ============================================================
            // Dès que le joueur passe sous le niveau du sol dans le trou -> sol secret + vrai portail
            {
                if: s => s.f.fall && s.E.fp.on === false && s.p.y > 500 && fx(s) >= 600,
                do: s => {
                    s.f.inv = 0;
                    s.E.hole.x = s.E.gc.x;
                    s.E.hole.w = s.E.gc.w;
                    s.E.hole.on = true;
                    s.E.gc.on = false;
                    s.p.fall = false;
                    s.E.low.on = true;
                    s.clip = LOW + 10;
                    s.portal.x = 750;
                    s.portal.y = LOW - 30;
                }
            },
            // Le joueur se pose sur le sol secret
            {
                if: s => s.E.low.on && s.p.g && s.p.y + 32 >= s.E.low.y - 2,
                do: s => {
                    s.f.landed = 1
                }
            },
            // Chemin normal : le sol et le portail remontent jusqu'à y=400
            {
                once: false,
                if: s => s.f.landed && !s.f.stop && s.E.low.y > 400,
                do: s => {
                    moveLow(s, -1)
                }
            },
            // Bouton 2 utilisé : le sol s'enfonce avec le portail -> mort
            {
                once: false,
                if: s => s.f.landed && s.f.stop && s.E.low.on,
                do: s => {
                    moveLow(s, 3);
                    if (s.E.low.y >= 720) {
                        s.E.low.on = false;
                        s.portal.x = -100;
                        s.portal.y = -100;
                    }
                    if (s.p.x >= 700) {
                        s.portal.on = false;
                    }
                }
            }
        ]
    })
};