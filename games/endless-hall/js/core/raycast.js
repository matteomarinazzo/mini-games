import { HALL, GW, GH, GRID, bandAt } from './data.js';
import { TEX, SC } from './textures.js';

export const PLANE = 0.7;
const EYE = HALL.eyeH, WH = HALL.wallH, TH = HALL.thresholds;
const TINT = [1, .87, .68], ONE = [1, 1, 1];
const K = 64 * SC, CW = K - 1, BM = 16 * SC - 1;

const LUT = new Float32Array(GW * 8 + 8);
export function relight() {
    for (let i = 0; i < LUT.length; i++) {
        let s = 0;
        for (const l of HALL.lamps) { const u = (i / 8 - l.x) / 2.4; s += Math.exp(-u * u); }
        LUT[i] = .3 + .95 * Math.min(1, s);
    }
}
const lightAt = (x) => LUT[Math.max(0, Math.min(LUT.length - 1, (x * 8) | 0))];
const fog = (d) => 1 / (1 + d * d * .004);

export function createView(W, H, B = 180000) {
    const rw = Math.max(160, Math.round(Math.sqrt(B * W / H))), rh = Math.max(120, Math.round(rw * H / W));
    const off = document.createElement('canvas'); off.width = rw; off.height = rh;
    const octx = off.getContext('2d'), img = octx.createImageData(rw, rh);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    return { rw, rh, off, octx, img, z: new Float32Array(rw), F: rw / 2 / PLANE };
}

export function render(v, p) {
    const { rw, rh, img, z, F } = v, d = img.data, hor = rh >> 1;
    const dx = Math.cos(p.a), dy = Math.sin(p.a), plx = -dy * PLANE, ply = dx * PLANE;
    const e0 = TH.entry - TH.thick, e1 = TH.entry, f0 = TH.far, f1 = TH.far + TH.thick;
    const { carpet, band, brass, ceil } = TEX;

    for (let y = 0; y < rh; y++) {
        const fl = y >= hor, off = fl ? y + .5 - hor : hor - y - .5;
        const dist = (fl ? EYE : WH - EYE) * F / off, f = fog(dist);
        let i = y * rw * 4;
        for (let x = 0; x < rw; x++, i += 4) {
            const cam = 2 * (x + .5) / rw - 1;
            const wx = p.x + (dx + plx * cam) * dist, wy = p.y + (dy + ply * cam) * dist;
            let L = lightAt(wx) * f;
            let t, u, vv, bd;
            if (fl) {
                if ((wx >= e0 && wx < e1) || (wx >= f0 && wx < f1)) { t = brass; u = (wx * K) & BM; vv = (wy * K) & BM; }
                else if ((bd = bandAt(wx, wy)) >= 0) { t = band; u = (bd & 63) * SC; vv = (bd >> 6) * SC; }
                else { t = carpet; u = (wx * K) & CW; vv = (wy * K) & CW; }
                for (const dc of HALL.decals) { if (Math.abs(wx - dc.x) >= dc.rx) continue; const ex = (wx - dc.x) / dc.rx, ey = (wy - dc.y) / dc.ry; if (ex * ex + ey * ey < 1) { L *= dc.g; break; } }
            } else {
                let lk = 0, lc = ONE;
                for (const l of HALL.lamps) {
                    const ax = Math.abs(wx - l.x), ay = Math.abs(wy - l.y);
                    if (ax < .5 && ay < .32) { lk = ax < .4 && ay < .24 ? 1 : .7; if (l.c) lc = l.c; break; }
                }
                if (lk) { d[i] = 255 * lk * lc[0]; d[i + 1] = 224 * lk * lc[1]; d[i + 2] = 168 * lk * lc[2]; continue; }
                const g = HALL.gap;
                if (g && wx >= g.x && wx < g.x + g.w && wy >= g.y && wy < g.y + g.h) { d[i] = 10; d[i + 1] = 6; d[i + 2] = 8; continue; }
                t = ceil; u = (wx * K) & CW; vv = (wy * K) & CW;
            }
            const k = (vv * t.w + u) * 4, td = t.d;
            d[i] = td[k] * L * TINT[0]; d[i + 1] = td[k + 1] * L * TINT[1]; d[i + 2] = td[k + 2] * L * TINT[2];
        }
    }

    for (let x = 0; x < rw; x++) {
        const cam = 2 * (x + .5) / rw - 1, rdx = dx + plx * cam, rdy = dy + ply * cam;
        let mx = p.x | 0, my = p.y | 0;
        const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
        let sx, sy, sdx, sdy;
        if (rdx < 0) { sx = -1; sdx = (p.x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - p.x) * ddx; }
        if (rdy < 0) { sy = -1; sdy = (p.y - my) * ddy; } else { sy = 1; sdy = (my + 1 - p.y) * ddy; }
        let side = 0, hit = 0;
        while (!hit) {
            if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
            if (mx < 0 || my < 0 || mx >= GW || my >= GH) { hit = -1; break; }
            hit = GRID[my * GW + mx];
        }
        if (hit < 0) { z[x] = 1e9; continue; }
        let perp = side ? sdy - ddy : sdx - ddx;
        if (perp < .05) perp = .05;
        z[x] = perp;
        let wh = side ? p.x + perp * rdx : p.y + perp * rdy;
        wh -= Math.floor(wh);
        if (side ? rdy > 0 : rdx < 0) wh = 1 - wh;
        const wt = TEX.walls[hit - 1], td = wt.d, TW = wt.w, THt = wt.h, inv = 1 / THt;
        // échantillonnage bilinéaire (murs : moins de pixels visibles de près)
        const fu = wh * TW - .5, u0 = Math.floor(fu), fx = fu - u0, gx = 1 - fx, ua = (u0 < 0 ? 0 : u0) * 4, ub = (u0 + 1 >= TW ? TW - 1 : u0 + 1) * 4;
        const L = lightAt(p.x + perp * rdx) * fog(perp) * (side ? 1 : .8);
        const top = hor - (WH - EYE) * F / perp, bot = hor + EYE * F / perp, sv = THt / (bot - top);
        const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(rh - 1, Math.floor(bot));
        let tv = (y0 + .5 - top) * sv - .5;
        for (let y = y0; y <= y1; y++, tv += sv) {
            const v0 = Math.floor(tv), fy = tv - v0, hy = 1 - fy, ra = (v0 < 0 ? 0 : v0) * TW * 4, rb = (v0 + 1 >= THt ? THt - 1 : v0 + 1) * TW * 4;
            const a0 = ra + ua, a1 = ra + ub, b0 = rb + ua, b1 = rb + ub, i = (y * rw + x) * 4;
            const q = Math.min(1, Math.max(0, (tv + .5) * inv)), a = q < .5 ? q : 1 - q, l = a > .07 ? L : L * (.78 + a * 3.1);
            d[i] = ((td[a0] * gx + td[a1] * fx) * hy + (td[b0] * gx + td[b1] * fx) * fy) * l * TINT[0];
            d[i + 1] = ((td[a0 + 1] * gx + td[a1 + 1] * fx) * hy + (td[b0 + 1] * gx + td[b1 + 1] * fx) * fy) * l * TINT[1];
            d[i + 2] = ((td[a0 + 2] * gx + td[a1 + 2] * fx) * hy + (td[b0 + 2] * gx + td[b1 + 2] * fx) * fy) * l * TINT[2];
        }
    }

    const det = 1 / (plx * dy - dx * ply), list = [];
    for (const s of HALL.sprites) {
        const a = s.x - p.x, b = s.y - p.y;
        const tx = det * (dy * a - dx * b), ty = det * (-ply * a + plx * b);
        if (ty > .1) list.push({ s, tx, ty });
    }
    list.sort((a, b) => b.ty - a.ty);
    for (const { s, tx, ty } of list) {
        const tex = s.kind === 'cam' ? (((p.x > s.x) !== !!s.flip) !== !!s.rot ? TEX.camF : TEX.camB) : TEX[s.kind];
        // poignée : le levier suit le sens monde (miroir selon le côté vu) et se raccourcit en perspective
        let ws = 1, fl = false;
        if (s.ld) { const c = -s.ld * (s.y - p.y) / Math.hypot(s.x - p.x, s.y - p.y); fl = c < 0; ws = Math.max(.3, Math.abs(c)); }
        const zb = ty - (s.bias || 0), sxc = rw / 2 * (1 + tx / ty), sw = F * s.w * ws / ty, sh = F * s.h / ty;
        const bot = hor + (EYE - s.z) * F / ty, top = bot - sh, left = sxc - sw / 2;
        const L = lightAt(s.x) * fog(ty), td = tex.d;
        const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(rw - 1, Math.floor(left + sw));
        const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(rh - 1, Math.floor(bot));
        for (let x = x0; x <= x1; x++) {
            if (zb >= z[x]) continue;
            let u = Math.min(tex.w - 1, ((x - left) / sw * tex.w) | 0); if (fl) u = tex.w - 1 - u;
            for (let y = y0; y <= y1; y++) {
                const vv = Math.min(tex.h - 1, ((y - top) / sh * tex.h) | 0), k = (vv * tex.w + u) * 4, al = td[k + 3];
                if (al < 10) continue;
                const i = (y * rw + x) * 4, r = td[k] * L * TINT[0], g = td[k + 1] * L * TINT[1], b = td[k + 2] * L * TINT[2];
                if (al > 245) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
                else { const m = al / 255; d[i] += (r - d[i]) * m; d[i + 1] += (g - d[i + 1]) * m; d[i + 2] += (b - d[i + 2]) * m; }
            }
        }
    }
}
