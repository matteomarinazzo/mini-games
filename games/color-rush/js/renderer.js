// ─── RENDERER.JS ────────────────────────────────────────────────────────────
// Rendu Canvas 2D : caméra qui suit le joueur, uniquement les cellules visibles (≈ 1 500–2 500 rectangles),
// + mini-carte (ImageData N×N mise à l'échelle). Aucune ressource externe.
// Lisibilité sans couleur : territoire = aplat plein ; traînée = damier hachuré ; joueur = contour blanc
// épais + étiquette « TOI » ; les yeux indiquent le cap des cubes.
import { CONFIG } from './config.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
function hueOf([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
}

// Palette : index 0 = joueur (couleur du skin), 1..n = IA (teintes réparties, éloignées de celle du joueur).
export function buildPalette(playerHex, count) {
    const mk = (rgb) => ({ rgb, cube: css(rgb), terr: css(mix(rgb, [8, 10, 16], 0.32)), trail: css(mix(rgb, [255, 255, 255], 0.22)) });
    const pal = [mk(hexToRgb(playerHex))];
    const ph = hueOf(pal[0].rgb);
    for (let i = 0; i < count; i++) {
        let h = (i * 137.508 + 25) % 360;
        const d = Math.abs(((h - ph + 540) % 360) - 180);       // écart angulaire ramené à [0,180]
        if (180 - d < 24) h = (h + 40) % 360;                   // trop proche de la teinte du joueur
        pal.push(mk(hslToRgb(h, 62 + (i % 3) * 8, 46 + (i % 4) * 4)));
    }
    return pal;
}

// Peint UNE cellule de peinture avec l'effet choisi (aussi utilisé pour les aperçus de la boutique).
// Les effets rainbow / fire / ocean / candy ont leurs propres couleurs ; les autres partent de `col`.
export function paintCell(ctx, fx, col, x, y, px, py, w, t) {
    if (fx === 'rainbow') { ctx.fillStyle = `hsl(${((x * 7 + y * 7 + t * 90) % 360) | 0},80%,52%)`; ctx.fillRect(px, py, w, w); return; }
    if (fx === 'fire') {            // dégradé flamme animé : rouge sombre → jaune
        const k = 0.5 + 0.5 * Math.sin(x * 0.7 + y * 0.35 + t * 5);
        ctx.fillStyle = `hsl(${(8 + k * 42) | 0},95%,${(38 + k * 18) | 0}%)`; ctx.fillRect(px, py, w, w); return;
    }
    if (fx === 'ocean') {           // bleus ondulants
        const k = 0.5 + 0.5 * Math.sin(x * 0.45 - y * 0.3 + t * 2);
        ctx.fillStyle = `hsl(${(195 + k * 25) | 0},80%,${(30 + k * 14) | 0}%)`; ctx.fillRect(px, py, w, w); return;
    }
    if (fx === 'candy') {           // rayures bonbon rose / blanc
        ctx.fillStyle = ((x + y) % 4) < 2 ? '#ff5c9a' : '#fff5fa'; ctx.fillRect(px, py, w, w); return;
    }
    ctx.fillStyle = col; ctx.fillRect(px, py, w, w);
    if (fx === 'stripes' && ((x + y) & 3) === 0) { ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(px, py, w, w); }
    else if (fx === 'dots' && !(x & 1) && !(y & 1)) { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(px + w * 0.3, py + w * 0.3, w * 0.4, w * 0.4); }
    else if (fx === 'checker' && ((x + y) & 1)) { ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(px, py, w, w); }
    else if (fx === 'sparkle') {
        const hsh = ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(Math.floor(t * 3), 83492791)) >>> 0) % 19;
        if (hsh === 0) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(px + w * 0.25, py + w * 0.25, w * 0.5, w * 0.5); }
    }
    else if (fx === 'waves') {      // bandes claires qui défilent en diagonale
        if (Math.sin((x + y) * 0.7 - t * 2.5) > 0.45) { ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(px, py, w, w); }
    }
    else if (fx === 'bricks') {     // joints de briques décalés une ligne sur deux
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.fillRect(px, py + w - 1, w, 1);
        if (((x + ((y & 1) ? 2 : 0)) & 3) === 0) ctx.fillRect(px, py, 1, w);
    }
    else if (fx === 'stars') {      // petites croix claires, éparses
        if ((Math.imul(x, 3) + Math.imul(y, 5)) % 9 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,.8)';
            ctx.fillRect(px + w * 0.4, py + w * 0.15, w * 0.2, w * 0.7); ctx.fillRect(px + w * 0.15, py + w * 0.4, w * 0.7, w * 0.2);
        }
    }
    else if (fx === 'neon') {       // cadre lumineux dans chaque cellule
        ctx.fillStyle = 'rgba(255,255,255,.45)';
        ctx.fillRect(px, py, w, 1); ctx.fillRect(px, py + w - 1, w, 1); ctx.fillRect(px, py, 1, w); ctx.fillRect(px + w - 1, py, 1, w);
    }
}

// Objets (accessoires) dessinés sur un cube centré en (sx,sy) de demi-côté `half`.
// `ang` = cap du cube (atan2(dy,dx)), comme les yeux. Les objets sont dessinés dans un repère « avant du cube = haut »,
// puis pivotés pour suivre le cap. Les yeux sont à l'AVANT : les lunettes (sur les yeux) et la moustache (devant
// les yeux) restent à l'avant ; les objets de tête (couronne, cornes, casquette, antenne, auréole) sont à l'ARRIÈRE
// (rotation de π en plus). Défaut -π/2 = cube qui regarde vers le haut.
const FRONT_GEAR = { shades: 1, mustache: 1 };
export function drawGear(ctx, id, sx, sy, half, ang = -Math.PI / 2) {
    if (!id || id === 'none') return;
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(ang + Math.PI / 2 + (FRONT_GEAR[id] ? 0 : Math.PI));
    sx = 0; sy = 0;
    const top = sy - half, h = half;
    ctx.lineJoin = 'round';
    if (id === 'crown') {
        ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#a16207'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sx - h * 0.8, top + 1); ctx.lineTo(sx - h * 0.8, top - h * 0.7); ctx.lineTo(sx - h * 0.4, top - h * 0.3);
        ctx.lineTo(sx, top - h * 0.9); ctx.lineTo(sx + h * 0.4, top - h * 0.3); ctx.lineTo(sx + h * 0.8, top - h * 0.7); ctx.lineTo(sx + h * 0.8, top + 1);
        ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (id === 'halo') {
        ctx.strokeStyle = '#fde047'; ctx.lineWidth = Math.max(2, h * 0.18);
        ctx.beginPath(); ctx.ellipse(sx, top - h * 0.35, h * 0.7, h * 0.25, 0, 0, 6.3); ctx.stroke();
    } else if (id === 'horns') {
        ctx.fillStyle = '#dc2626'; ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 1.5;
        for (const sg of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(sx + sg * h * 0.35, top + 1); ctx.lineTo(sx + sg * h * 0.9, top - h * 0.75); ctx.lineTo(sx + sg * h * 0.85, top + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
    } else if (id === 'antenna') {
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(sx + h * 0.2, top - h * 0.8); ctx.stroke();
        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(sx + h * 0.2, top - h * 0.9, h * 0.22, 0, 6.3); ctx.fill();
    } else if (id === 'cap') {
        ctx.fillStyle = '#e11d48'; ctx.strokeStyle = '#881337'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.rect(sx - h * 0.9, top - h * 0.45, h * 1.8, h * 0.55); ctx.fill(); ctx.stroke();
        ctx.fillRect(sx - h * 0.3, top + h * 0.05, h * 1.4, h * 0.2);
    } else if (id === 'shades') {
        ctx.fillStyle = '#0b0b0f'; ctx.fillRect(sx - h * 0.9, sy - h * 0.58, h * 1.8, h * 0.5);
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(sx - h * 0.7, sy - h * 0.5, h * 0.35, h * 0.1);
    } else if (id === 'mustache') {
        ctx.fillStyle = '#1f1308';
        ctx.beginPath(); ctx.ellipse(sx - h * 0.28, sy - h * 0.86, h * 0.32, h * 0.12, 0.25, 0, 6.3); ctx.ellipse(sx + h * 0.28, sy - h * 0.86, h * 0.32, h * 0.12, -0.25, 0, 6.3); ctx.fill();
    }
    ctx.restore();
}

const NEU = ['#1b2030', '#202638'];

export class Renderer {
    constructor(canvas, mini) {
        this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
        this.mini = mini; this.mctx = mini.getContext('2d');
        this.off = document.createElement('canvas'); this.octx = this.off.getContext('2d');
        this.fx = []; this.frame = 0; this.camX = 0; this.camY = 0;
    }

    setGame(game, pal, effect, gear = 'none') {
        this.g = game; this.pal = pal; this.effect = effect; this.gear = gear; this.fx.length = 0;
        const P = game.ents[0];
        this.camX = P.x; this.camY = P.y;
        this.off.width = game.W; this.off.height = game.H;
        this.img = this.octx.createImageData(game.W, game.H);
        this.edgeFlag = new Uint8Array(game.W * game.H);
        for (const i of game.edge) this.edgeFlag[i] = 1;
        this.resize();
    }

    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const r = this.canvas.getBoundingClientRect();
        this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
        this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.s = clamp(Math.min(this.W, this.H) / CONFIG.zoomCells, 7, 26);   // pixels par cellule
        const m = this.mini.getBoundingClientRect();
        this.mini.width = Math.round(m.width * dpr); this.mini.height = Math.round(m.height * dpr);
        this.mdpr = dpr;
    }

    draw(dt, t) {
        const g = this.g, ctx = this.ctx, s = this.s, pal = this.pal, fxName = this.effect;
        const P = g.ents[0];
        const k = 1 - Math.exp(-dt * 8);
        this.camX += (P.x - this.camX) * k; this.camY += (P.y - this.camY) * k;
        const ox = this.W / 2 - this.camX * s, oy = this.H / 2 - this.camY * s;

        ctx.fillStyle = '#0a0a0b'; ctx.fillRect(0, 0, this.W, this.H);
        const x0 = Math.max(0, Math.floor(this.camX - this.W / (2 * s)) - 1), x1 = Math.min(g.W - 1, Math.ceil(this.camX + this.W / (2 * s)) + 1);
        const y0 = Math.max(0, Math.floor(this.camY - this.H / (2 * s)) - 1), y1 = Math.min(g.H - 1, Math.ceil(this.camY + this.H / (2 * s)) + 1);
        const { ok, own, trail } = g;

        for (let y = y0; y <= y1; y++) {
            const py = Math.floor(oy + y * s), h = Math.floor(oy + (y + 1) * s) - py;
            for (let x = x0; x <= x1; x++) {
                const i = y * g.W + x;
                if (!ok[i]) continue;
                const px = Math.floor(ox + x * s), w = Math.floor(ox + (x + 1) * s) - px;
                const o = own[i];
                if (o < 0) { ctx.fillStyle = NEU[(x + y) & 1]; ctx.fillRect(px, py, w, h); }
                else if (o === 0 && fxName !== 'none') paintCell(ctx, fxName, pal[0].terr, x, y, px, py, w, t);
                else { ctx.fillStyle = pal[o].terr; ctx.fillRect(px, py, w, h); }
                const tr = trail[i];
                if (tr >= 0) {
                    if (tr === 0 && fxName !== 'none') paintCell(ctx, fxName, pal[0].trail, x, y, px, py, w, t);
                    else { ctx.fillStyle = pal[tr].trail; ctx.fillRect(px, py, w, h); }
                    if ((x + y) & 1) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(px, py, w, h); }  // hachure : ≠ territoire
                }
                if (this.edgeFlag[i]) {      // liseré blanc le long du bord de la carte
                    ctx.fillStyle = 'rgba(232,232,240,.55)';
                    if (x === 0 || !ok[i - 1]) ctx.fillRect(px, py, 2, h);
                    if (x === g.W - 1 || !ok[i + 1]) ctx.fillRect(px + w - 2, py, 2, h);
                    if (y === 0 || !ok[i - g.W]) ctx.fillRect(px, py, w, 2);
                    if (y === g.H - 1 || !ok[i + g.W]) ctx.fillRect(px, py + h - 2, w, 2);
                }
            }
        }

        // Cubes (le joueur en dernier pour rester au-dessus)
        const order = g.ents.filter((e) => e.alive && !e.isPlayer);
        if (P.alive) order.push(P);
        for (const e of order) {
            const sx = ox + e.x * s, sy = oy + e.y * s;
            if (sx < -s || sy < -s || sx > this.W + s || sy > this.H + s) continue;
            const half = s * 0.6;
            ctx.fillStyle = pal[e.id].cube; ctx.fillRect(sx - half, sy - half, half * 2, half * 2);
            ctx.lineWidth = e.isPlayer ? 3 : 2; ctx.strokeStyle = e.isPlayer ? '#fff' : 'rgba(0,0,0,.6)';
            ctx.strokeRect(sx - half, sy - half, half * 2, half * 2);
            // yeux : orientés selon le cap
            let dx = e.dirX, dy = e.dirY; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
            if (!e.dirX && !e.dirY) { dx = 1; dy = 0; }
            for (const sg of [-1, 1]) {
                const ex = sx + dx * half * 0.3 - dy * sg * half * 0.4, ey = sy + dy * half * 0.3 + dx * sg * half * 0.4;
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, half * 0.26, 0, 6.3); ctx.fill();
                ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + dx * half * 0.1, ey + dy * half * 0.1, half * 0.12, 0, 6.3); ctx.fill();
            }
            if (e.isPlayer) drawGear(ctx, this.gear, sx, sy, half, Math.atan2(dy, dx));   // pivote comme les yeux
            if (e.isPlayer) {
                ctx.font = `700 ${Math.max(10, s * 0.9) | 0}px system-ui,sans-serif`; ctx.textAlign = 'center';
                ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText('TOI', sx, sy - half - 6);
                ctx.fillStyle = '#fff'; ctx.fillText('TOI', sx, sy - half - 6);
            }
        }

        // Effets de mort : carrés qui s'élargissent et s'estompent (0,5 s)
        for (const ev of g.events) this.fx.push({ x: ev.x, y: ev.y, t0: t, id: ev.id });
        g.events.length = 0;
        this.fx = this.fx.filter((f) => t - f.t0 < 0.5);
        for (const f of this.fx) {
            const a = (t - f.t0) / 0.5, r = s * (0.8 + a * 3);
            ctx.globalAlpha = 1 - a; ctx.lineWidth = 3; ctx.strokeStyle = pal[f.id].cube;
            ctx.strokeRect(ox + f.x * s - r, oy + f.y * s - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;

        if ((this.frame++ % 6) === 0) this._drawMini(t);
    }

    _drawMini(t) {
        const g = this.g, d = this.img.data, pal = this.pal, n = g.W * g.H;
        for (let i = 0; i < n; i++) {
            const j = i * 4;
            if (!g.ok[i]) { d[j + 3] = 0; continue; }
            const o = g.own[i], c = o < 0 ? null : pal[o].rgb;
            d[j] = c ? c[0] : 38; d[j + 1] = c ? c[1] : 44; d[j + 2] = c ? c[2] : 62; d[j + 3] = 255;
        }
        this.octx.putImageData(this.img, 0, 0);
        const m = this.mctx, S = this.mini.width;
        m.clearRect(0, 0, S, S); m.imageSmoothingEnabled = false;
        m.drawImage(this.off, 0, 0, S, S);
        const P = g.ents[0], k = S / g.W;
        m.strokeStyle = 'rgba(255,255,255,.8)'; m.lineWidth = 1;
        m.strokeRect((this.camX - this.W / (2 * this.s)) * k, (this.camY - this.H / (2 * this.s)) * k, (this.W / this.s) * k, (this.H / this.s) * k);
        if (P.alive && Math.floor(t * 3) % 2 === 0) { m.fillStyle = '#fff'; m.fillRect(P.x * k - 3, P.y * k - 3, 6, 6); }
    }
}