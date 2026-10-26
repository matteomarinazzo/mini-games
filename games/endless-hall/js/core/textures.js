import { TK } from './data.js';

export const TEX = {};
export const SC = 2;
const cache = {};

function rng(s) {
    return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const mk = (w, h, fn, sc = SC) => {
    const c = document.createElement('canvas'); c.width = w * sc; c.height = h * sc;
    const x = c.getContext('2d', { willReadFrequently: true }); x.scale(sc, sc); fn(x);
    return { w: w * sc, h: h * sc, d: x.getImageData(0, 0, w * sc, h * sc).data };
};
const grain = (x, w, h, r, n, a) => {
    const s = 1 / SC;
    for (let i = 0; i < n * SC; i++) { x.fillStyle = r() < .5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; x.fillRect(((r() * w * SC) | 0) * s, ((r() * h * SC) | 0) * s, s, s); }
};
const R = (x, c, a, b, w, h) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
const lg = (x, x0, y0, x1, y1, st) => { const g = x.createLinearGradient(x0, y0, x1, y1); st.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
const bv = (x, a, b, w, h, up, t = 1) => {
    x.fillStyle = up ? 'rgba(255,232,190,.4)' : 'rgba(0,0,0,.5)'; x.fillRect(a, b, w, t); x.fillRect(a, b, t, h);
    x.fillStyle = up ? 'rgba(0,0,0,.5)' : 'rgba(255,232,190,.3)'; x.fillRect(a, b + h - t, w, t); x.fillRect(a + w - t, b + t, t, h - t);
};
const blob = (x, cx, cy, rx, ry, al) => {
    x.save(); x.translate(cx, cy); x.scale(rx, ry);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, `rgba(0,0,0,${al})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore();
};

function base(x) {
    R(x, '#5b2030', 0, 0, 64, 128);
    for (let i = 0; i < 64; i += 8) R(x, 'rgba(120,50,62,.55)', i + 2, 0, 4, 82);
    x.fillStyle = 'rgba(214,170,100,.28)';
    for (let j = 6; j < 78; j += 14) for (let i = 4; i < 64; i += 8) x.fillRect(i, j + ((i >> 3) & 1) * 6, 2, 3);
    R(x, lg(x, 0, 5, 0, 22, [[0, 'rgba(0,0,0,.4)'], [1, 'rgba(0,0,0,0)']]), 0, 5, 64, 17);
    R(x, '#d9c3a0', 0, 0, 64, 3); R(x, '#8a6d4a', 0, 3, 64, 2); R(x, 'rgba(255,255,255,.4)', 0, 0, 64, .5);
    R(x, '#caa56a', 0, 80, 64, 3); R(x, '#7a5530', 0, 83, 64, 2); R(x, 'rgba(255,240,200,.45)', 0, 80, 64, .5);
    R(x, '#3b2416', 0, 85, 64, 43);
    R(x, lg(x, 0, 85, 0, 97, [[0, 'rgba(0,0,0,.45)'], [1, 'rgba(0,0,0,0)']]), 0, 85, 64, 12);
    R(x, '#41271a', 4, 91, 56, 28); bv(x, 4, 91, 56, 28, false, 1.2); bv(x, 7, 94, 50, 22, true, .8);
    R(x, '#1e120b', 0, 121, 64, 7); R(x, 'rgba(255,220,170,.25)', 0, 121, 64, .6);
}

function door(x, n) {
    // chambranle en saillie
    R(x, '#9a7b52', 2, 30, 60, 98); bv(x, 2, 30, 60, 98, true, 1.8); bv(x, 4, 32, 56, 96, false, 1);
    // embrasure creusée : ombre portée en haut et à gauche, reflet fin à droite
    R(x, '#120903', 6, 34, 52, 94);
    R(x, lg(x, 8, 0, 56, 0, [[0, '#6e4226'], [.5, '#855232'], [1, '#6a3f24']]), 9, 39, 46, 89);
    R(x, lg(x, 0, 34, 0, 54, [[0, 'rgba(0,0,0,.7)'], [1, 'rgba(0,0,0,0)']]), 6, 34, 52, 20);
    R(x, lg(x, 6, 0, 20, 0, [[0, 'rgba(0,0,0,.6)'], [1, 'rgba(0,0,0,0)']]), 6, 34, 14, 94);
    R(x, 'rgba(255,225,170,.28)', 55, 39, 1.2, 89);
    // panneaux enfoncés
    for (const [y, h] of [[62, 22], [90, 26]]) {
        R(x, 'rgba(0,0,0,.3)', 13, y - 1, 38, h + 2); bv(x, 14, y, 36, h, false, 1.6);
        R(x, lg(x, 0, y, 0, y + 7, [[0, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']]), 14, y, 36, 7);
        bv(x, 17, y + 3, 30, h - 6, true, .9);
    }
    R(x, '#c9a050', 21, 39, 22, 14); bv(x, 21, 39, 22, 14, true, 1.2); R(x, '#2a170d', 23, 41, 18, 10); bv(x, 23, 41, 18, 10, false, .8);
    x.fillStyle = '#e0b660'; x.font = 'bold 10px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 32, 46.5);
    x.fillStyle = '#d8b062'; x.beginPath(); x.arc(32, 58, 2.6, 0, 7); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(32, 58, 1.2, 0, 7); x.fill();
    // ombre portée de la poignée (le relief lui-même est un sprite) + trou de serrure
    blob(x, 53, 89, 9, 6, .55); R(x, '#111', 49.5, 92, 1, 2.5);
    R(x, '#b89350', 8, 118, 48, 8); bv(x, 8, 118, 48, 8, true, 1);
}

function poster(x, P) {
    blob(x, 34, 66, 30, 40, .35);
    R(x, '#2a1b10', 10, 34, 44, 62); bv(x, 10, 34, 44, 62, true, 1.4);
    R(x, '#14233a', 12, 36, 40, 58); bv(x, 12, 36, 40, 58, false, 1);
    x.strokeStyle = '#caa56a'; x.lineWidth = 1; x.strokeRect(13.5, 37.5, 37, 55);
    x.save();
    if (P.arrow === 'left') { x.translate(64, 0); x.scale(-1, 1); }
    x.fillStyle = '#f2e3c6'; x.beginPath();
    x.moveTo(18, 52); x.lineTo(36, 52); x.lineTo(36, 45); x.lineTo(48, 56); x.lineTo(36, 67); x.lineTo(36, 60); x.lineTo(18, 60);
    x.closePath(); x.fill(); x.restore();
    P.shapes.forEach((s, i) => {
        const cx = 22 + 10 * i, cy = 81;
        if (s === 'circle') { x.fillStyle = '#e0a458'; x.beginPath(); x.arc(cx, cy, 5, 0, 7); x.fill(); }
        else if (s === 'triangle') { x.fillStyle = '#d1495b'; x.beginPath(); x.moveTo(cx, cy - 6); x.lineTo(cx + 6, cy + 5); x.lineTo(cx - 6, cy + 5); x.closePath(); x.fill(); }
        else { x.fillStyle = '#3fb8a3'; x.fillRect(cx - 5, cy - 5, 10, 10); }
    });
    R(x, lg(x, 12, 36, 52, 94, [[0, 'rgba(255,255,255,.18)'], [.38, 'rgba(255,255,255,0)'], [.5, 'rgba(255,255,255,.08)'], [.62, 'rgba(255,255,255,0)']]), 12, 36, 40, 58);
}

function ext(x) {
    blob(x, 37, 84, 13, 28, .5);
    R(x, '#c1272d', 24, 34, 16, 16); bv(x, 24, 34, 16, 16, true, 1.2); R(x, '#fff', 30, 38, 4, 8); R(x, '#fff', 28, 40, 8, 3);
    R(x, '#2d3033', 27, 60, 10, 3); R(x, '#2d3033', 28, 62, 8, 40); bv(x, 28, 62, 8, 40, true, .8);
    for (const y of [70, 90]) { R(x, '#222', 23, y, 18, 3); bv(x, 23, y, 18, 3, true, .6); }
}

function plaque(x, step) {
    blob(x, 33, 56, 28, 20, .3);
    R(x, '#c9a050', 12, 36, 40, 32); bv(x, 12, 36, 40, 32, true, 1.2); R(x, '#17100a', 15, 39, 34, 26); bv(x, 15, 39, 34, 26, false, 1);
    x.fillStyle = '#e0b660'; [[13.5, 37.5], [50.5, 37.5], [13.5, 66.5], [50.5, 66.5]].forEach(([a, b]) => x.fillRect(a - .5, b - .5, 1, 1));
    x.font = 'bold 22px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(step), 32, 53);
}

function fire(x) {
    R(x, '#2d3033', 2, 26, 60, 102);
    for (const a of [4, 32]) {
        R(x, lg(x, a, 0, a + 28, 0, [[0, '#80888d'], [.5, '#a1a9ad'], [1, '#7a8287']]), a, 29, 28, 99); bv(x, a, 29, 28, 99, true, 1);
        R(x, '#3a3f43', a + 4, 80, 20, 3); R(x, '#5d6469', a, 108, 28, 20);
    }
    R(x, '#2d3033', 31, 29, 2, 99);
}

function wallTex(key) {
    const r = rng([...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7));
    const [kind, a, b] = key.split(':');
    return mk(64, 128, (x) => {
        base(x);
        if (kind === 'door') door(x, +a);
        else if (kind === 'poster') poster(x, { arrow: a, shapes: b.split(',') });
        else if (kind === 'ext') ext(x);
        else if (kind === 'plaque') plaque(x, a);
        else if (kind === 'fire') fire(x);
        grain(x, 64, 128, r, 600, .1);
    });
}

function diamond(x, cx, cy, s, c) { x.fillStyle = c; x.beginPath(); x.moveTo(cx, cy - s); x.lineTo(cx + s, cy); x.lineTo(cx, cy + s); x.lineTo(cx - s, cy); x.closePath(); x.fill(); }

export function build() {
    TEX.walls = TK.map((k) => cache[k] || (cache[k] = wallTex(k)));
    if (TEX.carpet) return;
    const r = rng(11);
    TEX.carpet = mk(64, 64, (x) => {
        R(x, '#3d1522', 0, 0, 64, 64);
        for (const [a, b] of [[16, 16], [48, 16], [16, 48], [48, 48]]) diamond(x, a, b, 11, '#5a2233');
        diamond(x, 32, 32, 8, '#2c0f19'); diamond(x, 0, 32, 8, '#2c0f19'); diamond(x, 64, 32, 8, '#2c0f19');
        grain(x, 64, 64, r, 500, .12);
    });
    TEX.band = mk(64, 64, (x) => {
        R(x, '#1c4a3c', 0, 0, 64, 64); R(x, '#c9a050', 0, 0, 64, 5); R(x, '#c9a050', 0, 59, 64, 5);
        R(x, '#e8c878', 0, 8, 64, 1); R(x, '#e8c878', 0, 55, 64, 1);
        for (const a of [16, 48]) { diamond(x, a, 32, 9, '#c9a050'); diamond(x, a, 32, 5, '#1c4a3c'); }
        grain(x, 64, 64, r, 400, .1);
    });
    TEX.brass = mk(16, 16, (x) => {
        R(x, lg(x, 0, 0, 0, 16, [[0, '#e0bd62'], [.5, '#a8832e'], [1, '#c9a44a']]), 0, 0, 16, 16); grain(x, 16, 16, r, 40, .15);
    });
    TEX.ceil = mk(64, 64, (x) => {
        R(x, '#c8b594', 0, 0, 64, 64); R(x, '#a8946f', 0, 0, 64, 1); R(x, '#a8946f', 0, 0, 1, 64);
        grain(x, 64, 64, r, 300, .06);
    });
    TEX.bin = mk(32, 40, (x) => {
        x.fillStyle = lg(x, 5, 0, 27, 0, [[0, '#2c3236'], [.45, '#6b7479'], [1, '#262b2e']]); x.fillRect(5, 8, 22, 30);
        x.beginPath(); x.ellipse(16, 38, 11, 2.5, 0, 0, 7); x.fill();
        x.fillStyle = '#8a9399'; x.beginPath(); x.ellipse(16, 8, 11, 3, 0, 0, 7); x.fill();
        x.fillStyle = '#15191b'; x.beginPath(); x.ellipse(16, 8, 9, 2, 0, 0, 7); x.fill();
        R(x, '#1c2124', 5, 20, 22, 2);
        R(x, lg(x, 0, 28, 0, 38, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.45)']]), 5, 28, 22, 10); R(x, 'rgba(255,255,255,.18)', 8, 9, 1.5, 28);
    }, 4);
    TEX.extS = mk(16, 44, (x) => {
        const body = lg(x, 2, 0, 14, 0, [[0, '#5a0f13'], [.28, '#e23c42'], [.4, '#ff9ca0'], [.62, '#c9242a'], [1, '#470a0d']]);
        R(x, '#3a3d40', 6, 10.5, 4, 4); R(x, '#151515', 5.5, 4.5, 6.5, 3); R(x, '#222', 8, 2.6, 6.5, 1.4); R(x, '#151515', 7, 7.5, 3, 4);
        x.fillStyle = body; x.fillRect(2, 16, 12, 26); x.beginPath(); x.ellipse(8, 16, 6, 4.2, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(8, 42, 6, 1.8, 0, 0, 7); x.fill();
        x.fillStyle = '#e8e8e8'; x.beginPath(); x.arc(5.6, 13.6, 1.5, 0, 7); x.fill(); x.fillStyle = '#222'; x.fillRect(5.4, 12.6, .4, 1.2);
        R(x, '#f2f2f2', 4, 24, 8, 10); R(x, '#c1272d', 6, 26, 4, 2); R(x, '#222', 5, 30, 6, 1); R(x, '#1a1a1a', 2, 36, 12, 1.2);
        R(x, lg(x, 2, 0, 14, 0, [[0, 'rgba(0,0,0,.5)'], [.3, 'rgba(255,255,255,.12)'], [.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.55)']]), 2, 15, 12, 27);
        R(x, lg(x, 0, 36, 0, 43, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.5)']]), 2, 36, 12, 7);
        x.strokeStyle = '#0e0e0e'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(11.5, 9); x.quadraticCurveTo(16.5, 13, 14.3, 26); x.stroke();
    }, 4);
    // poignée à levier : rosace à gauche, levier vers la droite (miroir et longueur gérés au rendu)
    TEX.handle = mk(12, 8, (x) => {
        x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(3.1, 5.5, 2.7, 2.2, 0, 0, 7); x.fill(); x.fillRect(3, 5.2, 8, 1.1);
        const g = x.createRadialGradient(2.1, 3.1, .3, 2.6, 4, 2.6); g.addColorStop(0, '#fff0b0'); g.addColorStop(.5, '#c9a044'); g.addColorStop(1, '#6e5218');
        x.fillStyle = g; x.beginPath(); x.arc(2.6, 4, 2.5, 0, 7); x.fill();
        x.fillStyle = lg(x, 0, 2.9, 0, 5.1, [[0, '#f9e29a'], [.45, '#b8922e'], [1, '#5e4614']]);
        x.beginPath(); x.moveTo(2.6, 2.9); x.lineTo(10, 2.9); x.arc(10, 4, 1.1, -Math.PI / 2, Math.PI / 2); x.lineTo(2.6, 5.1); x.closePath(); x.fill();
        x.fillStyle = 'rgba(255,255,255,.45)'; x.fillRect(2.8, 3.05, 7.2, .35);
    }, 4);
    TEX.sil = mk(32, 64, (x) => {
        x.fillStyle = '#050307'; x.beginPath(); x.arc(16, 9, 6, 0, 7); x.fill();
        x.beginPath(); x.moveTo(8, 18); x.quadraticCurveTo(16, 14, 24, 18); x.lineTo(26, 42); x.lineTo(21, 42); x.lineTo(20, 63); x.lineTo(12, 63); x.lineTo(11, 42); x.lineTo(6, 42); x.closePath(); x.fill();
    });
    const cam = (front) => mk(32, 28, (x) => {
        R(x, '#2a2a2a', 14, 0, 4, 7); R(x, '#d9d6cf', 3, 7, 26, 14); R(x, '#b8b5ae', 3, 17, 26, 4);
        if (front) {
            x.fillStyle = '#0a0a0f'; x.beginPath(); x.arc(16, 14, 5.5, 0, 7); x.fill();
            x.strokeStyle = '#3a3f45'; x.lineWidth = 1.5; x.stroke();
            R(x, '#6fa8dc', 14, 12, 2, 2);
        } else {
            for (let i = 0; i < 4; i++) R(x, '#8d8a84', 8, 10 + i * 3, 16, 1);
            R(x, '#e5383b', 25, 9, 2, 2);
        }
    });
    TEX.camF = cam(true); TEX.camB = cam(false);
}
