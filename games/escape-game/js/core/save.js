// Escape Game · sauvegarde locale (clé escape-game) : partie en cours (v3) + record
const K = 'escape-game';
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const empty = () => ({ v: 1, best: null, run: null });
const rd = () => { try { const j = JSON.parse(localStorage.getItem(K)); return j && j.v === 1 ? j : empty(); } catch { return empty(); } };
const wr = (d) => { try { localStorage.setItem(K, JSON.stringify(d)); } catch { } };
const r3 = (v) => Math.round(v * 1000) / 1000;

function cleanRun(r) {
    if (!r || typeof r !== 'object' || (r.g !== 4 && r.g !== 5 && r.g !== 6 && r.g !== 7)) return null;
    if (!Number.isInteger(r.seed) || r.seed < 0 || r.seed > 4294967295 || !Number.isInteger(r.n) || r.n < 1 || r.n > 99999 || !Number.isInteger(r.tries) || r.tries < 1 || r.tries > 3) return null;
    const old = r.g < 7; // parties V4/V5 : même graine, mais la salle est régénérée en V7, l'état de salle repart à zéro
    const p = r.p && typeof r.p === 'object' ? r.p : {}, inv = r.inv && typeof r.inv === 'object' ? r.inv : {};
    const flags = (a) => (Array.isArray(a) ? a.map((v) => (v ? 1 : 0)) : []);
    return {
        seed: r.seed, n: r.n, tries: old ? 3 : r.tries, ms: Math.max(0, num(r.ms, 0)),
        inv: { key: !old && inv.key === true },
        hl: !old && Number.isInteger(r.hl) ? Math.max(0, Math.min(3, r.hl)) : 3,
        rd: (old || !Array.isArray(r.rd) ? [] : r.rd).filter((v) => Number.isInteger(v) && v >= 0).slice(0, 40),
        nt: (old || !Array.isArray(r.nt) ? [] : r.nt).map((q) => (q && Number.isInteger(q.d) && q.d >= 0 ? { d: q.d } : q && typeof q.s === 'string' ? { s: q.s.slice(0, 300) } : null)).filter(Boolean).slice(0, 60),
        p: { x: num(p.x, -1), z: num(p.z, -1), yaw: num(p.yaw, 0), pitch: Math.max(-1.4, Math.min(1.4, num(p.pitch, 0))) },
        st: old ? [] : flags(r.st), sn: old ? [] : flags(r.sn),
    };
}

export const loadRun = () => cleanRun(rd().run);
export function saveRun(run) {
    const d = rd();
    d.run = { g: 7, seed: run.seed, n: run.n, tries: run.tries, ms: Math.round(run.ms), inv: { key: !!run.inv.key }, nt: run.nt, hl: run.hl, rd: run.rd, p: { x: r3(run.p.x), z: r3(run.p.z), yaw: r3(run.p.yaw % (2 * Math.PI)), pitch: r3(run.p.pitch) }, st: run.st, sn: run.sn };
    wr(d);
}
export function clearRun() { const d = rd(); d.run = null; wr(d); }
export function getBest() {
    const b = rd().best;
    return b && Number.isInteger(b.n) && b.n > 0 && Number.isInteger(b.ms) && b.ms > 0 ? b : null;
}
export function submitBest(rooms, ms) {
    if (rooms < 1) return false;
    const d = rd(), b = d.best;
    if (!b || rooms > b.n || (rooms === b.n && ms < b.ms)) { d.best = { n: rooms, ms: Math.max(1, ms) }; wr(d); return true; }
    return false;
}

// Cache local du record mondial (affiché hors ligne) : { n: salles, ms, msg }
export function getWorld() {
    const w = rd().world;
    return w && Number.isInteger(w.n) && w.n > 0 && Number.isFinite(w.ms) && w.ms > 0 ? { n: w.n, ms: w.ms, msg: typeof w.msg === 'string' ? w.msg.slice(0, 50) : '' } : null;
}
export function setWorld(w) { const d = rd(); d.world = { n: w.n, ms: Math.max(1, Math.round(w.ms)), msg: String(w.msg || '').slice(0, 50) }; wr(d); }
