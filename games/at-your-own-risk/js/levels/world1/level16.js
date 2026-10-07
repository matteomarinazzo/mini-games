// N16 : « Saut de la foi ». Vide mortel, îlots qui surgissent à l'approche, avec des pièges.
//  i0 : apparaît normalement (apprentissage).
//  i1 : apparaît plus haut que prévu -> sauter trop tôt fait passer dessous.
//  i2 : s'effondre dès qu'on pose le pied, un îlot de secours (i2b) surgit plus bas.
//  i3 : faux îlot visible mais traversable (décor), le vrai (i3r) est invisible jusqu'à 25 px, plus haut.
const D = '#996b07';
const fx = s => s.p.x + 13;                       // centre des pieds
const foot = s => s.p.y + 32;                     // hauteur des pieds
// Fait surgir un îlot : il monte depuis le bas vers (y) avec une animation
const rise = (s, id, y, k = .15) => { const e = s.E[id]; e.on = true; Object.assign(e, { tx: e.x, ty: y, tk: k }); };
// Le joueur est posé sur un îlot (tolérance 4 px)
const stand = (s, id) => { const e = s.E[id]; return s.p.g && Math.abs(foot(s) - e.y) <= 4 && fx(s) >= e.x && fx(s) <= e.x + e.w; };
const move = (s, id, y, k = .2) => Object.assign(s.E[id], { tx: s.E[id].x, ty: y, tk: k });

export default {
    name: 'Niveau 16', start: { x: 0, y: 368 }, bounds: [-6, 774], bg: '#feb854',
    build: () => ({
        ents: [
            { id: 's0', k: 'solid', x: -100, y: 400, w: 200, h: 200, c: D },
            // Îlots : ils démarrent 80 px plus bas (cachés), puis montent à l'approche (mv:1 = le joueur est porté)
            { id: 'i0', k: 'solid', x: 170, y: 480, w: 60, h: 20, c: D, on: false, mv: 1 },
            { id: 'i1', k: 'solid', x: 280, y: 480, w: 60, h: 20, c: D, on: false, mv: 1 },
            { id: 'i2', k: 'solid', x: 390, y: 480, w: 60, h: 20, c: D, on: false, mv: 1 },
            { id: 'i2b', k: 'solid', x: 460, y: 520, w: 60, h: 20, c: D, on: false, mv: 1 },
            // Faux îlot (décor seulement : on peut le traverser) et vrai îlot caché
            { id: 'i3', k: 'deco', x: 560, y: 400, w: 60, h: 20, c: D },
            { id: 'i3r', k: 'solid', x: 560, y: 520, w: 60, h: 20, c: D, on: false, mv: 1 },
            { id: 's9', k: 'solid', x: 680, y: 400, w: 120, h: 200, c: D }],
        portal: { x: 760, y: 370, w: 30, h: 30 },
        rules: [
            // i0 : apparaît à 40 px, hauteur normale
            {
                if: s => fx(s) >= 140,
                do: s =>
                    rise(s, 'i0', 410)
            },
            // i1 : apparaît plus haut que prévu (370 au lieu de ~400)
            {
                if: s => fx(s) >= 260,
                do: s =>
                    rise(s, 'i1', 370)
            },
            // i2 : apparaît à 40 px, hauteur basse
            {
                if: s => fx(s) >= 380,
                do: s =>
                    rise(s, 'i2', 425)
            },
            // i2 : s'effondre dès qu'on pose le pied dessus, i2b surgit plus loin et plus bas
            {
                if: s => s.E.i2.on && stand(s, 'i2'),
                do: s => {
                    move(s, 'i2', 700, .3);
                    rise(s, 'i2b', 400, .25);
                }
            },
            // i3r : le vrai îlot surgit seulement à 25 px, plus haut que le faux
            {
                if: s => fx(s) >= 565,
                do: s =>
                    rise(s, 'i3r', 375, .3)
            }
        ]
    })
};