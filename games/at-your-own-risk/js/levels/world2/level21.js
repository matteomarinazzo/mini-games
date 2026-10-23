// N21 : deux scies, chacune sort quand le joueur est juste avant (~70 px). Solution : sauter x2.
const R = 20, FY = 400;
const fx = s => s.p.x + 13;
const SAWS = [['a', 300], ['b', 500]];

export default {
    name: 'Niveau 21',
    start: { x: 120, y: 368 },
    bounds: [94, 676],
    bg: 'bg',
    build: () => ({
        ents: [
            { id: 'room', k: 'deco', x: 100, y: 300, w: 600, h: 100, c: 'room' },
            { id: 'floor', k: 'floor', x: 100, y: 400, w: 600, h: 1 },
            ...SAWS.map(([id, x]) => ({ id, k: 'saw', x, y: FY, r: R, fy: FY, hidden: true })) // [NEW]
        ],
        portal: { x: 650, y: 370, w: 30, h: 30 },
        rules: SAWS.map(([id, x]) => ({
            if: s => fx(s) >= x - 70,
            do: s => {
                s.E[id].hidden = false; // [NEW]
            }
        }))
    })
};