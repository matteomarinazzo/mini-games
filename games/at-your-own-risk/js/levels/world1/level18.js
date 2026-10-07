// N18 : à x>=300, gauche/droite inversés 4 s (fond modifié via bg dynamique), juste avant un trou.
const B = '#feb854';
export default {
    name: 'Niveau 18', start: { x: 120, y: 368 }, bounds: [94, 676], bg: '#996b07',
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 300, w: 600, h: 100, c: B },
            { id: 'floor', k: 'floor', x: 100, y: 400, w: 600, h: 1 },
            { id: 'g', k: 'gap', x: 400, y: 400, w: 50, h: 200, c: B, on: false },
            { id: 'a', k: 'spike', x: 500, y: 390, w: 25, h: 10, on: false, d: true },
            { id: 'b', k: 'spike', x: 560, y: 390, w: 25, h: 10, on: false, d: true }],
        portal: { x: 650, y: 370, w: 30, h: 30 },
        rules: [
            {
                if: s => s.p.x >= 300,
                do: s => {
                    s.f.inv = 1;
                    s.f.t0 = s.t;
                    s.E.g.on = true;
                }
            },
            {
                //if: s => s.f.t0 !== undefined && s.t - s.f.t0 >= 240,
                if: s => s.p.x >= 425,
                do: s => {
                    s.f.inv = 0;
                    s.E.a.on = true;
                }
            },
            {
                if: s => s.p.x >= 540,
                do: s => {
                    s.E.b.on = true;
                }
            }
        ]
    })
};