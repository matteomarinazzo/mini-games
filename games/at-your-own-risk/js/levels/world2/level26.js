// N26 (6e du monde 2) : Un portail à gauche, un portail à droite, au milieu : un plateforme posée en y = 200.
// Comportement :
// 1) si le joueur saute à droite, une longue rangé de pique sort du sol (avec animation) et le tue dans tous les cas.
// 2) si le joueur se laisse tomber à droite, une seule rangé de pique se lève un peu plus loin à droite. si le joueur saute par dessus et touche le portail (fake) il meurt.
// 3) si le joueur se laisse tomber à gauche, une scie se lève du sol et le tue.
// 4) si le joueur saute à gauche, la même scie se lève et le poursuit vers la gauche et le tue dans tous les cas. elle le suit à gauche ou à droite s'il tente de sauter par dessus. Si le joueur atteint malgré tout le portail (fake) à gauche, il meurt.
// Solution : le joueur doit se laisser tomber à droite, puis passe à gauche (sous la plateforme) 50 px avant d'atteindre la scie cachée, elle se lève mais ne bouge pas. Le joueur saute par dessus. Juste à droite du portail gauche, une dernière pique sort du sol quand on s'en approche : le joueur saute par dessus et atteint le portail (vrai) à gauche.

import { THEMES } from "../../themes.js";

const R = 20, FY = 400, SPEED = 3.6;
const PX = 350, PY = 300, PWD = 100;            // plateforme centrale posée en y = 200
const PL = PX, PR = PX + PWD;                   // bords gauche (350) / droit (450)
const SAW_X = PX - R;                           // 330 : x de droite de la scie (330+20=350) est sur le x gauche de la plateforme
const SP_X = PR + 50;                           // 500 : 1e rangée à 50px du x droite de la plateforme
const fx = s => s.p.x + 13;                     // centre des pieds
const foot = s => s.p.y + 32;                   // bas des pieds
const onPlat = s => s.p.g && Math.abs(foot(s) - PY) <= 2 && s.p.x + 22 >= PL && s.p.x + 4 <= PR;

const dark = THEMES[1].c.dark;

export default {
    name: 'Niveau 26',
    start: { x: 387, y: PY - 32 },                  // départ au milieu de la plateforme (posé en y = 200)
    bounds: [94, 676],
    bg: 'bg',
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 200, w: 600, h: 200, c: 'room' },
            { id: 'floor', k: 'floor', x: 100, y: 400, w: 600, h: 1 },
            { id: 'plat', k: 'solid', x: PX, y: PY, w: PWD, h: 10, c: dark, oneWay: true },

            // Piques à droite : 1e rangée à 50px de la plateforme (500), les autres à la suite (+50px)
            // Rangée normale = 1 spike de 50px (w: 50, h: 10)
            { id: 'sp0', k: 'spike', x: SP_X, y: FY, w: 25, h: 10, d: true, on: false },
            { id: 'sp1', k: 'spike', x: SP_X + 25, y: FY, w: 25, h: 10, d: true, on: false },
            { id: 'sp2', k: 'spike', x: SP_X + 50, y: FY, w: 25, h: 10, d: true, on: false },
            { id: 'sp3', k: 'spike', x: SP_X + 75, y: FY, w: 25, h: 10, d: true, on: false },

            // Scie cachée à gauche : son x de droite est sur le x gauche de la plateforme (330 + 20 = 350)
            { id: 'saw', k: 'saw', x: SAW_X, y: FY, r: R, fy: FY, hidden: true, vx: 0 },

            // Pique surprise juste à droite du portail (w: 25, h: 10) qui sort du sol quand on s'en approche
            { id: 'sp_p', k: 'spike', x: 140, y: FY, w: 25, h: 10, d: true, on: false },

            // Faux portail à droite
            { id: 'fk', k: 'fake', x: 660, y: 370, w: 30, h: 30 }
        ],
        portal: { x: 110, y: 370, w: 30, h: 30 },          // vrai portail à gauche
        rules: [
            // Détection de présence sur la plateforme
            {
                once: false,
                if: s => onPlat(s),
                do: s => {
                    s.f.onPlat = 1;
                    s.f.jump = 0;   // réinitialise si on saute sur place et qu'on retombe sur la plateforme
                }
            },
            // Détection du saut au-dessus de la plateforme
            {
                once: false,
                if: s => s.f.onPlat && !s.p.g && s.p.vy < 0 && s.p.y < PY,
                do: s => {
                    s.f.jump = 1;
                }
            },

            // Quitte la plateforme par la droite :
            // Si saut (et p.x > plat.x + plat.w) : la 1e et les autres piques se lèvent (longue rangée)
            // Si chute : seule la 1e se lève
            {
                once: false,
                if: s => s.f.onPlat && !s.f.depart && (s.p.x > PR || (fx(s) > PR && s.p.vy > 0)),
                do: s => {
                    s.f.depart = 1;
                    s.f.onPlat = 0;
                    const isJump = s.f.jump || s.p.vy < 0;
                    if (isJump) {
                        // 1) SAUT A DROITE : longue rangée (toutes les piques)
                        s.f.jumpRight = 1;
                        s.f.activeSpikes = ['sp0', 'sp1', 'sp2', 'sp3'];
                    } else {
                        // 2) CHUTE A DROITE : seule la 1e rangée
                        s.f.fallRight = 1;
                        s.f.activeSpikes = ['sp0'];
                    }
                    for (const id of s.f.activeSpikes) s.E[id].on = true;
                }
            },
            // Animation de montée des piques actives (montent vers FY - 10)
            {
                once: false,
                if: s => s.f.activeSpikes && s.E.sp0.y > FY - 10,
                do: s => {
                    for (const id of s.f.activeSpikes) {
                        s.E[id].y = Math.max(FY - 10, s.E[id].y - 2);
                    }
                }
            },

            // Quitte la plateforme par la gauche :
            // Si chute : la scie se lève et tue (statique)
            // Si saut : la scie se lève et poursuit vers la gauche
            {
                once: false,
                if: s => s.f.onPlat && !s.f.depart && (s.p.x + 22 < PL || (fx(s) < PL && s.p.vy > 0)),
                do: s => {
                    s.f.depart = 1;
                    s.f.onPlat = 0;
                    const isJump = s.f.jump || s.p.vy < 0;
                    if (isJump) {
                        // 4) SAUT A GAUCHE : la scie se lève et poursuit
                        s.f.jumpLeft = 1;
                        s.E.saw.hidden = false;
                        s.E.saw.still = false;
                    } else {
                        // 3) CHUTE A GAUCHE : la scie se lève et tue (statique)
                        s.f.fallLeft = 1;
                        s.E.saw.hidden = false;
                        s.E.saw.still = true;
                    }
                }
            },
            // 4) Poursuite en x par la scie (Cas 4)
            {
                once: false,
                if: s => s.f.jumpLeft && !s.E.saw.hidden && s.E.saw.out >= 1 && !s.E.saw.still,
                do: s => {
                    const w = s.E.saw, d = fx(s) - w.x;
                    w.vx = Math.abs(d) <= SPEED ? d : Math.sign(d) * SPEED;
                }
            },
            // Chute à gauche si le joueur dérive vers la gauche : la scie le poursuit
            {
                once: false,
                if: s => s.f.fallLeft && !s.E.saw.hidden && s.p.x < SAW_X,
                do: s => {
                    s.E.saw.still = false;
                    const w = s.E.saw, d = fx(s) - w.x;
                    w.vx = Math.abs(d) <= SPEED ? d : Math.sign(d) * SPEED;
                }
            },
            // Saut à droite puis passage sous la plateforme vers la gauche : la scie poursuit
            {
                if: s => s.f.jumpRight && s.p.g && fx(s) <= SAW_X + 50 && !s.f.sol,
                do: s => {
                    s.f.jumpLeft = 1;
                    s.E.saw.hidden = false;
                    s.E.saw.still = true;
                }
            },

            // Toucher le faux portail à droite : mort
            {
                once: false,
                if: s => s.hit(s.E.fk),
                do: s => {
                    s.die();
                }
            },
            // Toucher le portail à gauche lors d'un saut à gauche ou saut à droite : mort
            {
                once: false,
                if: s => (s.f.jumpLeft || s.f.fallLeft || s.f.jumpRight) && s.hit(s.portal),
                do: s => {
                    s.die();
                }
            },

            // SOLUTION : chute à droite, puis passage sous la plateforme vers la gauche.
            // 50 px avant d'atteindre la scie cachée, elle se lève mais ne bouge pas (figée).
            {
                if: s => s.f.fallRight && s.p.g && fx(s) <= SAW_X + 50 && fx(s) > SAW_X && !s.f.sol,
                do: s => {
                    s.f.sol = 1;
                    s.E.saw.hidden = false;
                    s.E.saw.still = true;
                    s.E.saw.vx = 0;
                }
            },

            // Pique devant le portail gauche : sort du sol quand on s'en approche
            {
                if: s => fx(s) <= 190,
                do: s => {
                    s.f.raisePortalSpike = 1;
                    s.E.sp_p.on = true;
                }
            },
            // Animation de montée de la pique devant le portail
            {
                once: false,
                if: s => s.f.raisePortalSpike && s.E.sp_p.y > FY - 10,
                do: s => {
                    s.E.sp_p.y = Math.max(FY - 10, s.E.sp_p.y - 2);
                }
            }
        ]
    }),
    onPortal: s => {
        if (s.f.jumpLeft || s.f.fallLeft || s.f.jumpRight) {
            s.die();
            return true;
        }
    }
};
