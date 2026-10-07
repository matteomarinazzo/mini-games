// N17 : « La Lave montante ». Niveau vertical, un seul îlot suivant visible à la fois.
const D = '#996b07';
const fx = s => s.p.x + 13;
const foot = s => s.p.y + 32;
const PW = 80, PH = 16;
const PL = [[120, 470], [240, 440], [360, 410], [240, 380], [120, 350], [240, 320], [360, 290]];
const move = (s, id, y, k = .2) => Object.assign(s.E[id], { tx: s.E[id].x, ty: y, tk: k });
const onI = (s, i) => s.p.g && Math.abs(foot(s) - PL[i][1]) <= 4 && fx(s) >= PL[i][0] && fx(s) <= PL[i][0] + PW;

export default {
    name: 'Niveau 17',
    start: { x: 20, y: 468 },
    bounds: [-6, 774],
    bg: '#feb854',
    build: () => ({
        ents: [
            { id: 'f', k: 'solid', x: -100, y: 500, w: 180, h: 100, c: D },
            ...PL.map((a, i) => ({ id: 'p' + i, k: 'solid', x: a[0], y: a[1], w: PW, h: PH, c: D, on: i === 0 })),
            ...Array.from({ length: 32 }, (_, i) => ({ id: 'l' + i, k: 'spike', x: i * 25, y: 590, w: 25, h: 10, d: true })),
            { id: 'ring', k: 'solid', x: 0, y: 599, w: 800, h: 600, c: D }
        ],
        portal: { x: PL[6][0] + 25, y: PL[6][1] - 30, w: 30, h: 30 },
        rules: [
            {
                once: false,
                if: s => s.f.lava,
                do: s => {
                    for (let i = 0; i < 32; i++) s.E['l' + i].y -= .6;
                    s.E.ring.y -= .6;
                }
            },
            {
                if: s => fx(s) >= 70,
                do: s => {
                    s.f.lava = 1;
                }
            },
            {
                if: s => fx(s) >= 70,
                do: s => {
                    s.E.p1.on = true;
                }
            },
            {
                if: s => onI(s, 1),
                do: s => {
                    s.E.p2.on = true;
                    s.E.p0.on = false;
                }
            },
            {
                if: s => onI(s, 2),
                do: s => {
                    s.E.p3.on = true;
                    s.E.p1.on = false;
                }
            },
            {
                if: s => onI(s, 3),
                do: s => {
                    s.E.p4.on = true;
                    s.E.p2.on = false;
                    s.f.t3 = s.t;
                }
            },
            {
                if: s => s.f.t3 !== undefined && s.t - s.f.t3 >= 18,
                do: s => {
                    s.E.p3.on = false;
                }
            },
            {
                if: s => onI(s, 4),
                do: s => {
                    s.E.p5.on = true;
                }
            },
            {
                if: s => onI(s, 5),
                do: s => {
                    s.E.p6.on = true;
                    s.E.p4.on = false;
                }
            }
        ]
    })
};