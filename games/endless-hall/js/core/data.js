export const SAVE_KEY = 'endless-hall';
export const REC_KEY = 'endless_hall';
export const SAVE_VERSION = 4;
export const STEPS = 9;   // couloirs 0 à 8 ; le 8 est normal et sa ligne jaune fait sortir
const ANOM_MAX = 7;
export const ANOMS = {
    easy: ['lamp-off', 'extinguisher-missing', 'arrow-reversed', 'wrong-door-number', 'extra-door'],
    medium: ['poster-symbol', 'two-bins', 'ceiling-gap', 'camera-facing', 'stripe-offset'],
    hard: ['silhouette', 'shadow-only', 'longer-hall', 'lamp-color', 'false-reflection'],
};
export const ANOM_IDS = [...ANOMS.easy, ...ANOMS.medium, ...ANOMS.hard];
const pool = (s) => (s <= 2 ? ANOMS.easy : s <= 5 ? [...ANOMS.easy, ...ANOMS.medium] : [...ANOMS.medium, ...ANOMS.hard]);
// Planning : couloir 0 toujours normal ; 1 à 7 : rien (1/2) ou une anomalie du pool de l'étape
export const newPlan = () => Array.from({ length: STEPS }, (_, s) => {
    if (!s || s > ANOM_MAX || Math.random() < .5) return null;
    const p = pool(s); return p[(Math.random() * p.length) | 0];
});

// Tronçon : entrée (droit) → virage gauche → connecteur → virage droite → sortie (droit) = entrée du tronçon suivant.
// Coordonnées locales, 1 tuile = 0,9 m : entrée x∈[0,CX+2) y∈[8,10) ; connecteur x∈[CX,CX+2) y∈[2,10) ; sortie x∈[CX,len) y∈[2,4).
// La grille est une fenêtre de 3 copies (k = -1 à l'ouest, 0 = courante, +1 à l'est) ; seule la copie 0 porte l'anomalie.
const D = 22, CX = 8, DY = 6, OX = 23, OY = 5, EXT = 4;
export const GW = 64, GH = 22;

export const HALL = {
    D, CX, DY, ox: OX, oy: OY, wallH: 2.8, eyeH: 1.7, radius: 0.25,
    start: { x: OX + 1, y: OY + 9, angle: 0 },
    // une seule bande laiton entre deux copies : [entry-thick, entry) = [far, far+thick) du tronçon voisin
    thresholds: { entry: OX, far: OX + D - 0.12, thick: 0.12 },
    L0: D, dir: 1, bandShift: 0, bandBase: 0, gap: null, segs: [], lamps: [], sprites: [], decals: [],
};

// PRNG mulberry32
function rng(s) {
    return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };

// État normal d'une partie : tout dérive du seed. Toutes les étapes le clonent, puis ajoutent au plus une anomalie.
export function normalState(seed) {
    const r = rng(seed >>> 0);
    const nums = shuffle([...Array(30)].map((_, i) => 10 + i).filter((n) => n % 10 && ((n / 10) | 0) !== n % 10), r);
    return {
        doors: nums.slice(0, 6), extra: nums[6],
        extSide: r() < .5 ? 'L' : 'R', arrow: r() < .5 ? 'right' : 'left', shapes: shuffle(['circle', 'triangle', 'square'], r),
        lampJit: ((r() * 3) | 0) - 1, camX: 2.5 + ((r() * 2) | 0), camFlip: r() < .5, band: (((r() * 3) | 0) - 1) * .08,
    };
}

export const TK = [];   // clés de textures murales ; GRID stocke l'index + 1
const id = (k) => { let i = TK.indexOf(k); if (i < 0) i = TK.push(k) - 1; return i + 1; };
export const GRID = new Uint8Array(GW * GH);
const set = (x, y, k) => { if (x >= 0 && y >= 0 && x < GW && y < GH) GRID[y * GW + x] = id(k); };
const carve = (x0, y0, x1, y1) => {
    for (let y = Math.max(1, y0); y < Math.min(GH - 1, y1); y++)
        for (let x = Math.max(1, x0); x < Math.min(GW - 1, x1); x++) GRID[y * GW + x] = 0;
};

// Fenêtre de 3 segments, soudés aux seuils (x : ouest [OX-D,OX), centre [OX,OX+L0), est [OX+L0,OX+L0+D)).
// Un segment est posé par (ax, ay, s) : s = +1 → droit (entrée à l'ouest, sortie à l'est, coude vers le nord) ;
// s = −1 → tourné de 180° (entrée à l'est, sortie à l'ouest, coude vers le sud). Point local (lx,ly) → (ax+s·lx, ay+s·ly).
// Le centre est droit si on marche vers l'est (dir=+1), tourné si on marche vers l'ouest (dir=−1).
// Le segment derrière le joueur est toujours le 180° du segment devant : on voit un début de couloir dans les deux sens.
export function applyScene(seed, step, anom, dir) {
    const n = normalState(seed), A = (a) => anom === a, L0 = D + (A('longer-hall') ? EXT : 0);
    TK.length = 0; GRID.fill(id('wall'));
    HALL.L0 = L0; HALL.dir = dir; HALL.thresholds.far = OX + L0 - .12; HALL.gap = null;
    HALL.bandBase = n.band; HALL.bandShift = n.band + (A('stripe-offset') ? .3 : 0);
    const segs = HALL.segs = [
        { ax: OX, ay: OY + 18, s: -1, len: D, cur: false },
        dir > 0 ? { ax: OX, ay: OY, s: 1, len: L0, cur: true } : { ax: OX + L0, ay: OY + 12, s: -1, len: L0, cur: true },
        { ax: OX + L0, ay: OY - DY, s: 1, len: D, cur: false },
    ];
    const lamps = [], sprites = [], decals = [];
    for (const g of segs) {
        const { ax, ay, s, len, cur } = g, a = (x) => cur && anom === x, d = n.doors, e = len - 3, label = cur ? step : step >= STEPS - 1 ? 'S' : step + 1;
        const P = (x, y) => [ax + s * x, ay + s * y];
        const put = (x, row, key) => set(s > 0 ? ax + x : ax - x - 1, s > 0 ? ay + row : ay - row - 1, key);
        const cv = (x0, y0, x1, y1) => { const [p, q] = P(x0, y0), [r, t] = P(x1, y1); carve(Math.min(p, r), Math.min(q, t), Math.max(p, r), Math.max(q, t)); };
        cv(0, 8, CX + 2, 10); cv(CX, 2, CX + 2, 10); cv(CX, 2, len, 4);
        const door = (i) => 'door:' + d[i], ext = 'ext';
        // poignée à levier collée au battant : rosace côté serrure, levier dirigé vers le centre de la porte (ld = sens monde en x)
        const hd = (x, r) => { const up = r === 7 || r === 1, [px, py] = P(x + (up ? .78 : .22), up ? r + 1.04 : r - .04), [cx] = P(x + .5, 0), ld = Math.sign(cx - px) || 1; sprites.push({ kind: 'handle', x: px + ld * .048, y: py, z: .9, w: .17, h: .11, ld, bias: .1 }); };
        const dp = (x, r, k) => { put(x, r, k); hd(x, r); };
        // plaque d'étape à chaque bout ; le voisin (devant comme derrière) affiche déjà step+1
        put(2, 7, 'plaque:' + label); put(e, 4, 'plaque:' + label);
        n.extSide === 'L' ? put(4, 7, ext) : dp(4, 7, door(0)); n.extSide === 'R' ? put(4, 10, ext) : dp(4, 10, door(0));
        if (!a('extinguisher-missing')) { const [qx, qy] = P(4.5, n.extSide === 'L' ? 8.15 : 9.85); sprites.push({ kind: 'extS', x: qx, y: qy, z: .62, w: .3, h: .76, bias: .12 }); }
        dp(7, 7, door(1)); dp(7, 10, door(2));
        dp(13, 1, door(3)); dp(e, 1, door(4));
        dp(13, 4, a('wrong-door-number') ? 'door:' + ((d[5] % 10) * 10 + ((d[5] / 10) | 0)) : door(5));
        if (a('extra-door')) dp(16, 4, 'door:' + n.extra);
        const sh = a('poster-symbol') ? [n.shapes[0], n.shapes[2], n.shapes[1]] : n.shapes;
        put(16, 1, 'poster:' + (a('arrow-reversed') ? (n.arrow === 'right' ? 'left' : 'right') : n.arrow) + ':' + sh.join(','));
        [[4, 9], [9, 6], [14 + n.lampJit, 3], [e + 1, 3], ...(len > D ? [[19, 3]] : [])].forEach(([x, y], i) => {
            if (a('lamp-off') && i === 2) return;
            const [px, py] = P(x, y); lamps.push({ x: px, y: py, c: a('lamp-color') && i === 3 ? [.45, .7, 1.25] : null });
        });
        const sp = (kind, x, y, z, w, h, o) => { const [px, py] = P(x, y); sprites.push({ kind, x: px, y: py, z, w, h, rot: s < 0, ...o }); };
        sp('bin', 8.5, 9.74, 0, .5, .62); sp('cam', n.camX, 9, 2.4, .5, .4, { flip: n.camFlip !== a('camera-facing') });
        if (a('two-bins')) sp('bin', 4.7, 9.74, 0, .5, .62);
        if (a('silhouette')) sp('sil', 17.5, 3.45, 0, .62, 1.7);
        const dc = (x, y, rx, ry, k) => { const [px, py] = P(x, y); decals.push({ x: px, y: py, rx, ry, g: k }); };
        dc(8.5, 9.72, .42, .26, .5); if (a('two-bins')) dc(4.7, 9.72, .42, .26, .5);
        if (!a('extinguisher-missing')) dc(4.5, n.extSide === 'L' ? 8.2 : 9.8, .3, .2, .55);
        if (a('shadow-only')) dc(17.5, 3.45, .55, .3, .18);
        if (a('false-reflection')) dc(15.5, 2.9, .6, .32, 2.4);
        if (a('ceiling-gap')) { const [p, q] = P(17, 3), [r, t] = P(18, 4); HALL.gap = { x: Math.min(p, r), y: Math.min(q, t), w: 1, h: 1 }; }
    }
    set(0, OY + 14, 'fire'); set(0, OY + 15, 'fire'); set(GW - 1, 1, 'fire'); set(GW - 1, 2, 'fire');
    HALL.lamps = lamps; HALL.sprites = sprites; HALL.decals = decals;
}

// Bande verte/dorée au sol : -1, ou (v << 6) | u avec u, v ∈ [0,63] (calculée en coordonnées locales du segment)
export function bandAt(wx, wy) {
    for (const g of HALL.segs) {
        const lx = g.s * (wx - g.ax);
        if (lx < 0 || lx >= g.len) continue;
        const ly = g.s * (wy - g.ay), sb = g.cur ? HALL.bandShift : HALL.bandBase;
        if (lx > CX + .55 + sb && lx < CX + 1.45 + sb && ly > 2.55 && ly < 9.45) return ((((lx - CX - .55 - sb) / .9 * 64) | 0) << 6) | ((ly * 64) & 63);
        if (lx < CX + 1.45 && ly > 8.55 + sb && ly < 9.45 + sb) return ((((ly - 8.55 - sb) / .9 * 64) | 0) << 6) | ((lx * 64) & 63);
        if (lx > CX + .55 && ly > 2.55 + sb && ly < 3.45 + sb) return ((((ly - 2.55 - sb) / .9 * 64) | 0) << 6) | ((lx * 64) & 63);
        return -1;
    }
    return -1;
}

export const solid = (x, y) => x < 0 || y < 0 || x >= GW || y >= GH || GRID[(y | 0) * GW + (x | 0)] !== 0;

const R = HALL.radius;
export const BOUNDS = { xmin: 1 + R, xmax: GW - 1 - R, ymin: 1 + R, ymax: GH - 1 - R };
applyScene(1, 0, null, 1);
