import { SAVE_KEY, SAVE_VERSION, HALL, BOUNDS, STEPS, ANOM_IDS, newPlan } from './data.js';

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

export const newSeed = () => (Math.random() * 4294967296) >>> 0;
export const defaults = () => ({
    v: SAVE_VERSION, pos: { x: HALL.start.x, y: HALL.start.y }, angle: HALL.start.angle,
    step: 0, seed: newSeed(), plan: newPlan(), dir: 1, chrono: { started: false, ms: 0 },
});

function clean(j) {
    if (!j || typeof j !== 'object' || j.v !== SAVE_VERSION) return null;
    const d = defaults(), p = j.pos && typeof j.pos === 'object' ? j.pos : {};
    d.pos.x = cl(num(p.x, d.pos.x), BOUNDS.xmin, BOUNDS.xmax);
    d.pos.y = cl(num(p.y, d.pos.y), BOUNDS.ymin, BOUNDS.ymax);
    d.angle = wrap(num(j.angle, 0));
    d.step = Number.isInteger(j.step) && j.step >= 0 && j.step < STEPS ? j.step : 0;
    d.seed = Number.isInteger(j.seed) && j.seed >= 0 && j.seed < 4294967296 ? j.seed : d.seed;
    if (Array.isArray(j.plan) && j.plan.length === STEPS && j.plan[0] === null && j.plan.every((a) => a === null || ANOM_IDS.includes(a))) d.plan = j.plan.slice();
    d.dir = j.dir === -1 ? -1 : 1;
    const c = j.chrono && typeof j.chrono === 'object' ? j.chrono : {};
    d.chrono = { started: c.started === true, ms: Math.max(0, num(c.ms, 0)) };
    return d;
}

export function load() {
    try { return clean(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch { return null; }
}
export const hasSave = () => load() !== null;

export function write(p, s) {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
            v: SAVE_VERSION, pos: { x: r3(p.x), y: r3(p.y) }, angle: r3(p.a),
            step: s.step, seed: s.seed, plan: s.plan, dir: s.dir, chrono: { started: s.chrono.started, ms: Math.round(s.chrono.ms) },
        }));
        return true;
    } catch { return false; }
}
