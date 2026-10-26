import { HALL, BOUNDS, solid } from './data.js';

export const TURN = 2.1, SPEED = 2.2, BACK = 0.6;
const R = HALL.radius;
const free = (x, y) => x >= BOUNDS.xmin && x <= BOUNDS.xmax && y >= BOUNDS.ymin && y <= BOUNDS.ymax &&
    !solid(x - R, y - R) && !solid(x + R, y - R) && !solid(x - R, y + R) && !solid(x + R, y + R);

export function step(p, i, dt) {
    const ox = p.x, oy = p.y, oa = p.a;
    p.a += i.turn * TURN * dt;
    if (p.a > Math.PI) p.a -= 2 * Math.PI; else if (p.a <= -Math.PI) p.a += 2 * Math.PI;
    if (i.move) {
        const v = (i.move > 0 ? SPEED : -SPEED * BACK) * dt;
        const nx = p.x + Math.cos(p.a) * v, ny = p.y + Math.sin(p.a) * v;
        if (free(nx, p.y)) p.x = nx;
        if (free(p.x, ny)) p.y = ny;
    }
    return p.x !== ox || p.y !== oy || p.a !== oa;
}
