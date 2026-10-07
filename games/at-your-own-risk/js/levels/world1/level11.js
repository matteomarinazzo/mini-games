// N11 : le portail fuit deux fois, trou + piques camouflées au retour.
const B = '#feb854';
export default {
    name: 'Niveau 11', start: { x: 120, y: 368 }, bounds: [94, 676], bg: '#996b07',
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 300, w: 600, h: 100, c: B },
            { id: 'floor', k: 'floor', x: 100, y: 400, w: 600, h: 1 },
            { id: 'g', k: 'gap', x: 380, y: 400, w: 50, h: 200, c: B, on: false },
            { id: 'a', k: 'spike', x: 250, y: 400, w: 25, h: 10, on: false, d: true },
            { id: 'b', k: 'spike', x: 480, y: 400, w: 25, h: 10, on: true, d: true }],
        portal: { x: 650, y: 370, w: 30, h: 30 },
        rules: [
            {
                once: false,
                if: s => !s.f.ph && s.p.x >= 620,
                do: s => {
                    s.f.ph = 1;
                    s.portal.x = 450;
                }
            },
            {
                once: false,
                if: s => s.f.ph == 1 && s.p.x <= 490,
                do: s => {
                    s.E.b.y = 390;
                }
            },
            {
                once: false,
                if: s => s.f.ph == 2 && s.p.x <= 520,
                do: s => s.E.g.on = true
            },
            {
                once: false,
                if: s => s.f.ph == 2 && s.p.x <= 290,
                do: s => {
                    s.E.a.y = 390;
                }
            },
            {
                once: false,
                if: s => s.f.ph == 2 && s.p.x <= 180,
                do: s => Object.assign(s.E.a, { tx: 180, ty: 390, tk: .5 })
            }
        ],
        onPortal(s) {
            if (s.f.ph == 1) {
                s.f.ph = 2;
                s.portal.x = 150;
                s.E.g.on = false;
                s.E.a.on = true;
                s.E.b.on = true;
                return true;
            }
            return false;
        }
    })
};