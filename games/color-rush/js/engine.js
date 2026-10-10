// ─── ENGINE.JS ──────────────────────────────────────────────────────────────
// Simulation de Color Rush, SANS DOM (testable sous Node).
// Grille W×H : ok[] (jouable), own[] (propriétaire du territoire, -1 = neutre),
// trail[] (propriétaire de la traînée présente, -1 = aucune).
// Cube 0 = joueur, les autres = IA.
//
// ORDRE D'UN TICK (aucun résultat ne dépend de l'ordre des cubes dans le tableau) :
//  1. Mouvement de tous les cubes (indépendant des autres cubes) → liste de cellules « visitées ».
//  2. Collisions de traînées évaluées sur l'état FIGÉ du début de tick :
//     - entrer sur la traînée d'un autre : le propriétaire meurt (le cube survit) ;
//     - entrer sur sa propre traînée (hors 4 dernières cellules) : le cube meurt ;
//     - 2 cubes qui créent la même nouvelle cellule de traînée au même tick : ils meurent tous les deux ;
//     - un cube qui se trouve sur une traînée créée ce tick par un autre : le propriétaire meurt.
//  3. Les morts sont appliquées (traînée effacée, territoire du mort redevient neutre).
//  4. Ajout des nouvelles cellules de traînée ; détection des fermetures de boucle.
//  5. Chaque capture est calculée sur l'état figé ; tout cube (autre que le capturant) dans une
//     zone capturée meurt, et sa propre capture éventuelle est annulée. Puis les captures valides
//     sont appliquées (départ tournant pour les zones qui se chevauchent).
//  6. Défaite / victoire.
import { CONFIG } from './config.js';
import { buildMask } from './maps.js';
import { aiInit, aiThink } from './ai.js';

const TAU = Math.PI * 2;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Game {
    constructor(map, rng = Math.random) {
        this.rng = rng; this.map = map;
        const m = buildMask(map);
        this.W = m.W; this.H = m.H; this.ok = m.ok; this.total = m.total;
        const n = this.W * this.H;
        this.own = new Int16Array(n).fill(-1);
        this.trail = new Int16Array(n).fill(-1);
        this.stamp = new Int32Array(n); this.stampId = 0;   // marquage du flood fill
        this.queue = new Int32Array(n);
        this.edge = this._edgeCells();
        this.ents = []; this.events = [];
        this.started = false; this.over = false; this.result = null;
        this.time = 0; this.tick = 0; this.aiKilled = 0;
        this.targetAngle = null; this.pctBefore = 0; this.finalPct = 0;
        this._spawn();
    }

    // Cellules jouables en bordure de carte (au contact du vide) : graines du flood fill.
    _edgeCells() {
        const { W, H, ok } = this, out = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (!ok[i]) continue;
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !ok[i - 1] || !ok[i + 1] || !ok[i - W] || !ok[i + W]) out.push(i);
        }
        return out;
    }

    // Centres possibles : fenêtre 7×7 (base 5×5 + 1 de marge) entièrement jouable.
    _validCenters() {
        const { W, H, ok } = this, out = [];
        for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
            let good = true;
            for (let dy = -3; dy <= 3 && good; dy++) for (let dx = -3; dx <= 3; dx++) {
                if (!ok[(y + dy) * W + x + dx]) { good = false; break; }
            }
            if (good) out.push({ x, y });
        }
        return out;
    }

    // Placement aléatoire sans chevauchement : distance de Chebyshev ≥ baseSize + écart.
    // Si la carte est trop dense, l'écart est réduit progressivement (jamais sous 3), puis on
    // renonce à des IA plutôt que de rapprocher les bases.
    _spawn() {
        const wanted = clamp(Math.round(this.total / CONFIG.cellsPerAi), CONFIG.aiMin, CONFIG.aiMax) + 1;
        const centers = this._validCenters(), placed = [];
        let gap = CONFIG.baseGap, tries = 0;
        while (placed.length < wanted && tries < 15000 && centers.length) {
            tries++;
            if (tries % 2500 === 0 && gap > 3) gap--;
            const c = centers[(this.rng() * centers.length) | 0];
            const need = CONFIG.baseSize + gap;
            if (placed.every((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) >= need)) placed.push(c);
        }
        this.aiTotal = placed.length - 1; this.aiAlive = this.aiTotal;
        this.counts = new Int32Array(placed.length);
        const h = (CONFIG.baseSize - 1) / 2;
        placed.forEach((c, id) => {
            const e = {
                id, isPlayer: id === 0, x: c.x + 0.5, y: c.y + 0.5, cx: c.x, cy: c.y, alive: true,
                dirX: 0, dirY: 0, angle: this.rng() * TAU, speed: CONFIG.playerSpeed,
                trailCells: [], pending: null, visits: [], blocked: false, needThink: false,
                homeX: c.x, homeY: c.y, ai: null,
            };
            this.ents.push(e);
            for (let dy = -h; dy <= h; dy++) for (let dx = -h; dx <= h; dx++) {
                this.own[(c.y + dy) * this.W + c.x + dx] = id; this.counts[id]++;
            }
            if (!e.isPlayer) aiInit(this, e);
        });
    }

    // Direction souhaitée par le joueur (vecteur non nul). Le 1er appel démarre la partie.
    setInput(vx, vy) {
        if (!vx && !vy) return;
        this.targetAngle = Math.atan2(vy, vx);
        if (!this.started) { this.started = true; this.ents[0].angle = this.targetAngle; }
    }

    get playerPct() { return (this.counts[0] / this.total) * 100; }

    _okAt(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H && this.ok[y * this.W + x] === 1; }

    // Le cube (carré de demi-côté cubeHalf) peut-il se tenir en (x,y) ? Les 4 coins doivent être jouables.
    _canStand(x, y) {
        const r = CONFIG.cubeHalf;
        return this._okAt(Math.floor(x - r), Math.floor(y - r)) && this._okAt(Math.floor(x + r), Math.floor(y - r))
            && this._okAt(Math.floor(x - r), Math.floor(y + r)) && this._okAt(Math.floor(x + r), Math.floor(y + r));
    }

    _steer(e, dt) {
        if (this.targetAngle !== null) {
            const m = CONFIG.playerTurnRate * dt;
            e.angle += clamp(wrap(this.targetAngle - e.angle), -m, m);
        }
        e.dirX = Math.cos(e.angle); e.dirY = Math.sin(e.angle);
    }

    // Déplacement par micro-pas ≤ 0.4 cellule, axe X puis axe Y : la trajectoire change de cellule
    // par arêtes uniquement → la traînée est 4-connexe (étanche pour le flood fill) et un cube
    // bloqué par une bordure glisse le long de celle-ci si son cap est oblique.
    _move(e, dt) {
        const dist = e.speed * dt, n = Math.max(1, Math.ceil(dist / 0.4)), d = dist / n;
        let moved = false, tried = false;
        for (let k = 0; k < n; k++) {
            if (Math.abs(e.dirX) > 1e-9) {
                tried = true;
                const nx = e.x + e.dirX * d;
                if (this._canStand(nx, e.y)) { e.x = nx; moved = true; this._enter(e); }
            }
            if (Math.abs(e.dirY) > 1e-9) {
                tried = true;
                const ny = e.y + e.dirY * d;
                if (this._canStand(e.x, ny)) { e.y = ny; moved = true; this._enter(e); }
            }
        }
        e.blocked = tried && !moved;
    }

    _enter(e) {
        const cx = Math.floor(e.x), cy = Math.floor(e.y);
        if (cx !== e.cx || cy !== e.cy) { e.cx = cx; e.cy = cy; e.visits.push(cy * this.W + cx); }
    }

    _recentOwn(e, v) {
        const t = e.trailCells;
        for (let k = t.length - 1, c = 0; k >= 0 && c < CONFIG.ownTrailGrace; k--, c++) if (t[k] === v) return true;
        return false;
    }

    step(dt) {
        if (this.over || !this.started) return;     // le temps ne court qu'après le 1er mouvement du joueur
        this.tick++; this.time += dt;
        const { W, ents } = this;
        this.pctBefore = this.counts[0] / this.total;

        // 1. MOUVEMENT
        for (const e of ents) {
            if (!e.alive) continue;
            e.visits.length = 0;
            if (e.isPlayer) this._steer(e, dt);
            else if (e.needThink) aiThink(this, e);
            this._move(e, dt);
            if (!e.isPlayer) e.needThink = e.visits.length > 0 || e.blocked;
        }

        // 2. COLLISIONS DE TRAÎNÉES (état figé)
        const kill = new Set(), newAt = new Map();
        for (const e of ents) {
            if (!e.alive) continue;
            for (const v of e.visits) {
                const t = this.trail[v];
                if (t !== -1) {
                    if (t === e.id) { if (!this._recentOwn(e, v)) kill.add(e.id); }
                    else kill.add(t);
                }
                if (this.own[v] !== e.id) {
                    let a = newAt.get(v);
                    if (!a) newAt.set(v, a = []);
                    if (!a.includes(e.id)) a.push(e.id);
                }
            }
        }
        for (const a of newAt.values()) if (a.length > 1) for (const id of a) kill.add(id);
        for (const e of ents) {
            if (!e.alive) continue;
            const a = newAt.get(e.cy * W + e.cx);
            if (a) for (const id of a) if (id !== e.id) kill.add(id);
        }
        // 3. MORTS
        for (const id of kill) this._kill(id, 'trail');

        // 4. NOUVELLES TRAÎNÉES + FERMETURES
        const reqs = [];
        for (const e of ents) {
            if (!e.alive) continue;
            for (const v of e.visits) {
                if (this.own[v] === e.id) {
                    if (e.trailCells.length) { e.pending = e.trailCells; reqs.push({ e, cells: e.pending }); e.trailCells = []; }
                } else { this.trail[v] = e.id; e.trailCells.push(v); }
            }
        }

        // 5. CAPTURES
        if (reqs.length) {
            const cellEnts = new Map();
            for (const e of ents) if (e.alive) {
                const k = e.cy * W + e.cx;
                (cellEnts.get(k) || cellEnts.set(k, []).get(k)).push(e);
            }
            const victims = new Set();
            for (const r of reqs) {
                r.region = this._region(r.e);
                for (const c of r.region) {
                    const l = cellEnts.get(c);
                    if (l) for (const x of l) if (x !== r.e) victims.add(x.id);
                }
            }
            for (const id of victims) this._kill(id, 'capture');
            const valid = reqs.filter((r) => r.e.alive), k = valid.length;
            for (let i = 0; i < k; i++) {
                const r = valid[(i + this.tick) % k], id = r.e.id;
                for (const c of r.region) {
                    const old = this.own[c];
                    if (old !== id) { if (old >= 0) this.counts[old]--; this.counts[id]++; this.own[c] = id; }
                }
                for (const c of r.cells) if (this.trail[c] === id) this.trail[c] = -1;
                r.e.pending = null;
            }
        }

        // 6. FIN DE PARTIE
        const P = ents[0];
        if (!P.alive) { this.over = true; this.result = 'lost'; this.finalPct = this.pctBefore * 100; }
        else if (this.counts[0] >= this.total * 0.985) { this.over = true; this.result = 'won'; this.finalPct = 100; }
        else this.finalPct = this.playerPct;
    }

    // Zone capturée par e : cellules jouables non possédées par e qui ne sont PAS atteignables depuis
    // la bordure de la carte sans franchir le territoire ou la traînée de e. Les cellules de traînée
    // (non possédées) en font partie → la traînée devient territoire. Une zone collée à la bordure ne
    // peut donc se prendre qu'en longeant la bordure (comportement type paper.io).
    _region(e) {
        const { W, H, ok, own, trail, stamp, queue } = this, id = e.id, sid = ++this.stampId;
        let qh = 0, qt = 0;
        const barrier = (i) => own[i] === id || trail[i] === id;
        for (const i of this.edge) if (!barrier(i) && stamp[i] !== sid) { stamp[i] = sid; queue[qt++] = i; }
        while (qh < qt) {
            const i = queue[qh++], x = i % W, y = (i / W) | 0;
            if (x > 0) { const j = i - 1; if (ok[j] && stamp[j] !== sid && !barrier(j)) { stamp[j] = sid; queue[qt++] = j; } }
            if (x < W - 1) { const j = i + 1; if (ok[j] && stamp[j] !== sid && !barrier(j)) { stamp[j] = sid; queue[qt++] = j; } }
            if (y > 0) { const j = i - W; if (ok[j] && stamp[j] !== sid && !barrier(j)) { stamp[j] = sid; queue[qt++] = j; } }
            if (y < H - 1) { const j = i + W; if (ok[j] && stamp[j] !== sid && !barrier(j)) { stamp[j] = sid; queue[qt++] = j; } }
        }
        const out = [], n = W * H;
        for (let i = 0; i < n; i++) if (ok[i] && stamp[i] !== sid && own[i] !== id) out.push(i);
        return out;
    }

    // Élimination : traînée effacée, territoire rendu neutre.
    _kill(id, cause) {
        const e = this.ents[id];
        if (!e.alive) return;
        e.alive = false; e.visits.length = 0;
        for (const list of [e.trailCells, e.pending || []]) for (const c of list) if (this.trail[c] === id) this.trail[c] = -1;
        e.trailCells = []; e.pending = null;
        const n = this.W * this.H;
        for (let i = 0; i < n; i++) if (this.own[i] === id) this.own[i] = -1;
        this.counts[id] = 0;
        if (!e.isPlayer) { this.aiAlive--; this.aiKilled++; }
        this.events.push({ type: 'death', x: e.x, y: e.y, id, player: e.isPlayer, cause });
    }
}
