// ============================================================
// ROCKETEER - Renderer
// ============================================================

const Renderer = (() => {

    // ─── NORMAL VIEW ─────────────────────────────────────────
    function drawNormalView(ctx, state, rocketDef, inputs, camX, camY, zoom) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        zoom = zoom || 1;

        ctx.clearRect(0, 0, W, H);

        // Sky gradient based on altitude
        const alt = state.altitude || 0;
        const skyColor = altitudeSkyColor(alt);
        const horizonColor = altitudeHorizonColor(alt);

        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, skyColor);
        grad.addColorStop(1, horizonColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Stars (appear above 10km)
        if (alt > 10000) {
            const starOpacity = Math.min(1, (alt - 10000) / 40000);
            drawStars(ctx, W, H, starOpacity, state.time, camX, camY);
        }

        // World-to-screen transform
        // Camera follows rocket
        const worldToScreen = (wx, wy) => {
            const sx = W / 2 + (wx - camX) * zoom;
            const sy = H / 2 - (wy - camY) * zoom;
            return [sx, sy];
        };

        // Ground / horizon
        const groundY_world = 0; // Surface level
        const [, groundY_screen] = worldToScreen(0, groundY_world);

        if (state.y < 1000) {
            // Draw ground (Grass)
            drawGround(ctx, W, H, groundY_screen, camX, zoom);

            // Draw Launch Pad (if near origin)
            if (Math.abs(camX) < 5000) {
                const [padX, padY] = worldToScreen(0, 0); // Platform surface at Y=0
                drawLaunchComplex(ctx, padX, padY, zoom, state.hasThrust);
            }
        }

        // Rocket
        const [rx, ry] = worldToScreen(state.x, state.y);

        drawRocket(ctx, rx, ry, state.angle, rocketDef, zoom, inputs.throttle > 0 && state.fuelMass > 0, state);

        // Flame / exhaust particles
        if (state.hasThrust && state.fuelMass > 0) {
            drawFlame(ctx, rx, ry, state.angle, inputs.throttle, zoom, rocketDef, state, groundY_screen);
        }

        // Debris
        if (state.debris && state.debris.length > 0) {
            drawDebris(ctx, state.debris, worldToScreen, zoom);
        }

        // Atmosphere line
        if (alt < 80000) {
            const [, karmanY] = worldToScreen(0, 70000);
            if (karmanY > 0 && karmanY < H) {
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.strokeStyle = '#88ccff';
                ctx.setLineDash([10, 10]);
                ctx.beginPath();
                ctx.moveTo(0, karmanY);
                ctx.lineTo(W, karmanY);
                ctx.stroke();
                ctx.fillStyle = '#88ccff';
                ctx.font = '11px monospace';
                ctx.fillText('Kármán line (70 km)', 10, karmanY - 5);
                ctx.restore();
            }
        }
    }

    function altitudeSkyColor(alt) {
        if (alt < 0) return '#4a90d9';
        if (alt < 10000) {
            const t = alt / 10000;
            return lerpColor('#4a90d9', '#1a5fa0', t);
        }
        if (alt < 40000) {
            const t = (alt - 10000) / 30000;
            return lerpColor('#1a5fa0', '#050a20', t);
        }
        return '#020510';
    }

    function altitudeHorizonColor(alt) {
        if (alt < 0) return '#70b8e0';
        if (alt < 20000) {
            const t = alt / 20000;
            return lerpColor('#70b8e0', '#3a70b0', t);
        }
        return '#020510';
    }

    function lerpColor(a, b, t) {
        const ah = parseInt(a.slice(1), 16);
        const bh = parseInt(b.slice(1), 16);
        const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
        const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
        const r = Math.round(ar + (br - ar) * t);
        const g = Math.round(ag + (bg - ag) * t);
        const bl2 = Math.round(ab + (bb - ab) * t);
        return `rgb(${r},${g},${bl2})`;
    }

    // Starfield with Parallax Depth
    function drawStars(ctx, W, H, opacity, time, camX, camY) {
        ctx.save();

        // Use 3 layers of stars for parallax effect
        // layer 1 (distant), layer 2 (middle), layer 3 (closer)
        for (let layer = 1; layer <= 3; layer++) {
            const starCount = 60;
            const pFactor = 0.004 * layer; // Relative speed
            ctx.globalAlpha = opacity / (4 - layer);

            for (let i = 0; i < starCount; i++) {
                // Pseudo-random deterministic placement
                const hash = (i * 123.456 + layer * 78.9);
                const rx = (Math.sin(hash) * 20000 + 10000);
                const ry = (Math.cos(hash * 0.9) * 20000 + 10000);

                // Screen coordinates with parallax and wrap-around
                const sx = ((rx - camX * pFactor) % W + W) % W;
                const sy = ((ry + camY * pFactor) % H + H) % H;

                const size = (layer === 3) ? 1.4 : 0.8;
                const twinkle = 0.7 + 0.3 * Math.sin(time * 1.2 + hash);

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(sx, sy, size * twinkle, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    function drawGround(ctx, W, H, groundY, camX, zoom) {
        // Ground fill
        ctx.fillStyle = '#3a7a3a';
        ctx.fillRect(0, groundY, W, H - groundY);

        // Ground details (horizontal line)
        ctx.fillStyle = '#2a6a2a';
        ctx.fillRect(0, groundY, W, 4);
    }

    function drawLaunchComplex(ctx, padX, padY, zoom, hasThrust) {
        const blink = Math.floor(Date.now() / 500) % 2 === 0;
        const z = zoom;

        const rect = (x, y, w, h, fill, stroke, lw) => {
            ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
            if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.strokeRect(x, y, w, h); }
        };
        const line = (x1, y1, x2, y2, stroke, lw) => {
            ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        };
        const circle = (x, y, r, fill) => {
            ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        };

        ctx.save();

        // ─── GROUND SHADOW ───────────────────────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(padX, padY + 6 * z, 210 * z, 10 * z, 0, 0, Math.PI * 2);
        ctx.fill();

        // ─── ACCESS ROADS ────────────────────────────────────
        const roadY = padY + 5 * z;
        const roadH = 10 * z;
        const infiniteWidth = 5000;
        const shear = 0.9;

        for (let side = -1; side <= 1; side += 2) {
            ctx.save();
            ctx.translate(padX, roadY);
            ctx.scale(side, 1);
            ctx.transform(1, 0, shear, 1, 0, 0);

            ctx.fillStyle = '#444b52';
            ctx.fillRect(0, 0, infiniteWidth, roadH);

            ctx.fillStyle = '#5a6470';
            for (let x = 10 * z; x < infiniteWidth; x += 20 * z)
                ctx.fillRect(x, 4 * z, 12 * z, 1.5 * z);

            ctx.fillStyle = '#d8c050';
            ctx.fillRect(0, 0, infiniteWidth, 1.2 * z);
            ctx.fillRect(0, roadH - 1.2 * z, infiniteWidth, 1.2 * z);

            ctx.restore();
        }

        // ─── FLAME TRENCH ────────────────────────────────────
        const tw = 48 * z, td = 22 * z;
        ctx.fillStyle = '#161210';
        ctx.beginPath();
        ctx.moveTo(padX - tw / 2, padY - 1);
        ctx.lineTo(padX + tw / 2, padY - 1);
        ctx.lineTo(padX + tw * 0.85, padY + td);
        ctx.lineTo(padX - tw * 0.85, padY + td);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#2a2220'; ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(padX - tw * 0.85 * (1 - i * 0.15), padY + td * i / 4);
            ctx.lineTo(padX + tw * 0.85 * (1 - i * 0.15), padY + td * i / 4);
            ctx.stroke();
        }
        [-.28, .28].forEach(ox => {
            rect(padX + ox * tw * 2 - 1.5 * z, padY - 2 * z, 3 * z, 8 * z, '#7a8694', '#444', 0.5);
        });
        ctx.fillStyle = '#3a3028';
        ctx.beginPath();
        ctx.moveTo(padX - tw * 0.3, padY + td * 0.35);
        ctx.lineTo(padX, padY + td * 0.7);
        ctx.lineTo(padX + tw * 0.3, padY + td * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#504030'; ctx.lineWidth = 0.8; ctx.stroke();

        // ─── MAIN APRON ──────────────────────────────────────
        const aw = 200 * z, ah = 5 * z;
        const ag = ctx.createLinearGradient(0, padY - ah * 0.3, 0, padY + ah);
        ag.addColorStop(0, '#7a838c'); ag.addColorStop(1, '#4a5158');
        rect(padX - aw / 2, padY, aw, ah, ag, '#2c3136');
        ctx.strokeStyle = 'rgba(25,30,35,0.5)'; ctx.lineWidth = 1;
        for (let x = -aw / 2; x < aw / 2; x += 20 * z) {
            ctx.beginPath(); ctx.moveTo(padX + x, padY); ctx.lineTo(padX + x, padY + ah); ctx.stroke();
        }
        ctx.strokeStyle = '#d4b040'; ctx.lineWidth = 0.9 * z;
        ctx.setLineDash([6 * z, 4 * z]);
        ctx.beginPath();
        ctx.moveTo(padX - aw * 0.42, padY + ah * 0.5); ctx.lineTo(padX - tw * 0.6, padY + ah * 0.5);
        ctx.moveTo(padX + tw * 0.6, padY + ah * 0.5); ctx.lineTo(padX + aw * 0.42, padY + ah * 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        if (hasThrust) {
            const bm = ctx.createRadialGradient(padX, padY + 4 * z, 2 * z, padX, padY + 4 * z, tw * 0.7);
            bm.addColorStop(0, 'rgba(180,80,10,0.45)');
            bm.addColorStop(1, 'rgba(80,40,10,0)');
            ctx.fillStyle = bm;
            ctx.beginPath(); ctx.ellipse(padX, padY + 4 * z, tw * 0.7, ah, 0, 0, Math.PI * 2); ctx.fill();
        }

        // ─── PEDESTAL ────────────────────────────────────────
        const pw = 56 * z, ph = 5 * z;
        rect(padX - pw / 2, padY - ph * 0.5, pw, ph, '#6a7278', '#353a40');
        [-18, -7, 7, 18].forEach(ox => {
            const cx2 = padX + ox * z;
            rect(cx2 - 2.2 * z, padY - 5 * z, 4.4 * z, 7 * z, '#c8b870', '#6a5b34', 0.5);
            rect(cx2 - 3.2 * z, padY + 1 * z, 6.4 * z, 1.8 * z, '#6a5b34');
            circle(cx2, padY - 4 * z, 1 * z, '#4a4030');
        });
        rect(padX - tw * 0.38, padY, tw * 0.76, ah * 0.7, '#282020');

        // ─── STORAGE TANKS (left) ────────────────────────────
        const tkX = padX - 80 * z;
        const loxH = 42 * z, loxW = 14 * z;
        rect(tkX - loxW / 2, padY - loxH, loxW, loxH, '#b8c8d4', '#7a8a96');
        ctx.fillStyle = '#c8d8e4';
        ctx.beginPath(); ctx.ellipse(tkX, padY - loxH, loxW / 2, 3.5 * z, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(tkX - loxW / 2 + 2 * z, padY - loxH + 2 * z, 3 * z, loxH - 4 * z);
        rect(tkX - loxW / 2, padY - loxH * 0.45, loxW, 4 * z, '#2060b0');

        const lh2H = 30 * z, lh2W = 12 * z, lh2X = tkX + 18 * z;
        rect(lh2X - lh2W / 2, padY - lh2H, lh2W, lh2H, '#8898a4', '#5a6870');
        ctx.fillStyle = '#9aa8b4';
        ctx.beginPath(); ctx.ellipse(lh2X, padY - lh2H, lh2W / 2, 3 * z, 0, Math.PI, 0); ctx.fill();
        rect(lh2X - lh2W / 2, padY - lh2H * 0.5, lh2W, 3.5 * z, '#b03010');
        ctx.strokeStyle = 'rgba(180,200,220,0.3)'; ctx.lineWidth = 0.8;
        for (let y = padY - lh2H + 5 * z; y < padY - 4 * z; y += 6 * z) {
            ctx.beginPath(); ctx.moveTo(lh2X - lh2W / 2, y); ctx.lineTo(lh2X + lh2W / 2, y); ctx.stroke();
        }
        rect(tkX - 24 * z, padY - 10 * z, 44 * z, 10 * z, '#4e5860', '#363c42');
        ctx.strokeStyle = '#6a7880'; ctx.lineWidth = 2.5 * z;
        ctx.beginPath();
        ctx.moveTo(tkX, padY - 8 * z); ctx.lineTo(tkX, padY - 4 * z);
        ctx.moveTo(lh2X, padY - 8 * z); ctx.lineTo(lh2X, padY - 4 * z);
        ctx.lineTo(padX - tw * 0.6, padY - 4 * z);
        ctx.stroke();
        ctx.strokeStyle = '#5a6870'; ctx.lineWidth = 2 * z;
        ctx.beginPath();
        ctx.moveTo(tkX, padY - loxH * 0.3); ctx.lineTo(lh2X - lh2W / 2 - 1, padY - loxH * 0.3);
        ctx.stroke();
        circle(lh2X + lh2W / 2 + 3 * z, padY - lh2H * 0.6, 3 * z, '#90a0b0');
        circle(lh2X + lh2W / 2 + 3 * z, padY - lh2H * 0.6, 1.5 * z, '#304050');

        // ─── FLAME DEFLECTOR WATER TANK ──────────────────────
        const wtX = padX - 58 * z, wtY = padY - 6 * z;
        rect(wtX, wtY - 14 * z, 18 * z, 14 * z, '#5a6068', '#3a4048');
        rect(wtX + 2 * z, wtY - 12 * z, 6 * z, 4 * z, '#445060');
        ctx.strokeStyle = '#6a7880'; ctx.lineWidth = 3 * z;
        ctx.beginPath(); ctx.moveTo(wtX + 9 * z, wtY - 4 * z); ctx.lineTo(padX - tw * 0.5, padY); ctx.stroke();

        // ─── SERVICE GANTRY ──────────────────────────────────
        const gx = padX - 45 * z, gh = 90 * z, gw = 7 * z;
        const gg2 = ctx.createLinearGradient(gx, 0, gx + gw, 0);
        gg2.addColorStop(0, '#50595f'); gg2.addColorStop(1, '#626c74');
        rect(gx, padY - gh, gw, gh, gg2, '#2e3438');
        ctx.strokeStyle = 'rgba(200,215,225,0.28)'; ctx.lineWidth = 1;
        for (let y = padY - gh + 10 * z; y < padY - 8 * z; y += 14 * z) {
            ctx.beginPath();
            ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y + 10 * z);
            ctx.moveTo(gx + gw, y); ctx.lineTo(gx, y + 10 * z);
            ctx.stroke();
        }
        [0.12, 0.28, 0.46, 0.64, 0.80].forEach((lv, i) => {
            const py2 = padY - gh * lv;
            const pw2 = gw + 8 * z + (i === 2 ? 6 * z : 0);
            rect(gx - 4 * z, py2, pw2, 2.5 * z, '#8a949c', '#505a62');
            line(gx - 4 * z, py2 - 3 * z, gx - 4 * z + pw2, py2 - 3 * z, 'rgba(180,195,210,0.5)', 0.8);
            if (i < 4) for (let ry2 = py2 + 4 * z; ry2 > padY - gh * (lv + 0.16) + 2 * z; ry2 -= 3.5 * z)
                line(gx + gw - 2 * z, ry2, gx + gw + 1 * z, ry2, 'rgba(150,165,180,0.4)', 0.8);
        });
        const armY = padY - gh * 0.46;
        rect(gx + gw, armY - 1.5 * z, 22 * z, 3 * z, '#7a848c', '#484f56');
        rect(gx + gw + 18 * z, armY - 4 * z, 5 * z, 8 * z, '#404850', '#303840');
        ctx.strokeStyle = 'rgba(200,215,225,0.4)'; ctx.lineWidth = 0.8;
        [0.25, 0.5, 0.75].forEach(t =>
            line(gx + gw + t * 22 * z, armY - 1.5 * z, gx + gw + t * 22 * z, armY - 5 * z, 'rgba(180,200,220,0.3)', 0.8)
        );
        rect(gx + gw - 1 * z, padY - gh * 0.32, 5 * z, 7 * z, '#3a4048', '#505860');

        // ─── LIGHTNING MAST ──────────────────────────────────
        const mx = padX + 60 * z, mh = 100 * z;
        ctx.strokeStyle = '#68727a'; ctx.lineWidth = 1.4 * z;
        ctx.beginPath(); ctx.moveTo(mx, padY); ctx.lineTo(mx, padY - mh); ctx.stroke();
        ctx.strokeStyle = '#78828a'; ctx.lineWidth = 0.9 * z;
        ctx.beginPath(); ctx.moveTo(mx, padY - mh * 0.6); ctx.lineTo(mx, padY - mh); ctx.stroke();
        [[18, -22], [14, -10], [-16, -18], [-12, -8]].forEach(([dx, dy]) =>
            line(mx, padY - mh * 0.55, mx + dx * z, padY + dy * z, 'rgba(150,170,190,0.35)', 1)
        );
        line(mx, padY - mh * 0.3, mx + 12 * z, padY - 8 * z, 'rgba(150,170,190,0.3)', 0.7);

        // ─── CONTROL BUILDING (right) ────────────────────────
        const bx = padX + 88 * z, bw = 30 * z, bh = 16 * z;
        rect(bx, padY - bh, bw, bh, '#424a52', '#2e3440');
        rect(bx - 1 * z, padY - bh - 2 * z, bw + 2 * z, 2.5 * z, '#505a62');
        [[4, 4], [12, 4], [4, 9], [12, 9]].forEach(([ox, oy]) => {
            const lit = Math.sin(Date.now() * 0.001 + ox) > 0;
            rect(bx + ox * z, padY - bh + oy * z, 5 * z, 3.5 * z, lit ? '#d4d060' : '#2a3040', '#1a2030', 0.5);
        });
        rect(bx + 20 * z, padY - 7 * z, 5 * z, 7 * z, '#2a3040', '#404850', 0.5);
        ctx.strokeStyle = '#707a84'; ctx.lineWidth = z;
        ctx.beginPath(); ctx.arc(bx + 24 * z, padY - bh - 2 * z, 5 * z, Math.PI, 0); ctx.stroke();
        line(bx + 24 * z, padY - bh - 7 * z, bx + 24 * z, padY - bh - 2 * z, '#707a84', 0.7 * z);
        rect(bx + 2 * z, padY - bh - 5 * z, 7 * z, 3 * z, '#505860', '#3a4250', 0.5);

        // ─── FLOODLIGHTS ─────────────────────────────────────
        [-65, 65].forEach(ox => {
            const lx = padX + ox * z;
            line(lx, padY, lx, padY - 14 * z, '#545c65', 1.5 * z);
            line(lx - 4 * z, padY - 14 * z, lx + 4 * z, padY - 14 * z, '#545c65', 1.2 * z);
            rect(lx - 4.5 * z, padY - 16 * z, 9 * z, 2.5 * z, '#d0dde8', '#9aa8b5');
            if (!hasThrust) {
                const gl = ctx.createRadialGradient(lx, padY - 12 * z, 0, lx, padY - 12 * z, 18 * z);
                gl.addColorStop(0, 'rgba(220,240,255,0.14)');
                gl.addColorStop(1, 'rgba(220,240,255,0)');
                ctx.fillStyle = gl;
                ctx.beginPath(); ctx.arc(lx, padY - 12 * z, 18 * z, 0, Math.PI * 2); ctx.fill();
            }
        });

        // ─── WARNING LIGHTS ───────────────────────────────────
        if (blink) {
            [[gx + gw / 2, padY - gh], [mx, padY - mh]].forEach(([x, y]) => {
                circle(x, y, 1.2 * z, '#ff3020');
                const gl = ctx.createRadialGradient(x, y, 0, x, y, 6 * z);
                gl.addColorStop(0, 'rgba(255,60,30,0.5)'); gl.addColorStop(1, 'rgba(255,60,30,0)');
                ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 6 * z, 0, Math.PI * 2); ctx.fill();
            });
        }

        ctx.restore();
    }

    // Draw rocket from part definitions using SVG path data approximations
    function drawRocket(ctx, cx, cy, angle, rocketDef, zoom, hasThrust, phy) {
        if (!rocketDef || !rocketDef.placedParts) return;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle); // 0 = pointing up

        const scale = (Rocket.builderUnitInMeters || 0.1) * zoom;

        // Draw each placed part
        for (const pp of rocketDef.placedParts) {
            const def = PARTS_CATALOG[pp.partId];
            if (!def) continue;

            // px offset relative to rocket Center of Mass (Physics Sync)
            const partX = (pp.x - (rocketDef._comX || rocketDef._centerX || 0)) * scale;
            const partY = (pp.y - (rocketDef._comY || rocketDef._centerY || 0)) * scale;

            ctx.save();
            ctx.translate(partX, partY);
            ctx.scale(scale, scale);
            if (pp.flipped) {
                ctx.scale(-1, 1);
            }
            ctx.translate(-def.width / 2, -def.height / 2);

            // Draw SVG inline as path using canvas
            drawPartCanvas(ctx, def);
            ctx.restore();
        }

        ctx.restore();
    }

    // Draw the pre-loaded SVG image on canvas
    function drawPartCanvas(ctx, def) {
        if (def.img && def.img.naturalWidth > 0) {
            ctx.drawImage(def.img, 0, 0, def.width, def.height);
        } else {
            // Fallback generic drawing if image fails or isn't loaded
            ctx.fillStyle = '#666';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(0, 0, def.width, def.height, 4);
            } else {
                ctx.rect(0, 0, def.width, def.height);
            }
            ctx.fill();
            ctx.strokeStyle = '#444';
            ctx.stroke();
        }
    }

    function drawFlame(ctx, cx, cy, angle, throttle, zoom, rocketDef, phy, groundY) {
        if (!rocketDef || !rocketDef.placedParts) return;
        const scale = (Rocket.builderUnitInMeters || 0.1) * zoom;

        // 1. Draw Ground Glows (Screen Space)
        if (groundY - cy < 400 * scale) {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            for (const pp of rocketDef.placedParts) {
                const def = PARTS_CATALOG[pp.partId];
                if (!def || def.category !== 'engine') continue;
                const engineState = rocketDef.engines?.find(e => e.partInstanceId === pp.id);
                if (!engineState || !engineState.active) continue;

                const partX = (pp.x - (rocketDef._comX || rocketDef._centerX || 0)) * scale;
                const partY = (pp.y - (rocketDef._comY || rocketDef._centerY || 0)) * scale;
                const nozzleX = partX;
                const nozzleY = partY + (def.height / 2) * scale;

                // Transform to screen
                const screenNozzleX = cx + (nozzleX * cos - nozzleY * sin);
                const screenNozzleY = cy + (nozzleX * sin + nozzleY * cos);

                const dist = groundY - screenNozzleY;
                if (dist < 150 * scale) {
                    const opacity = (1 - Math.max(0, dist) / (150 * scale)) * throttle * 0.5;
                    const grad = ctx.createRadialGradient(screenNozzleX, groundY, 0, screenNozzleX, groundY, 120 * scale);
                    grad.addColorStop(0, `rgba(255, 180, 50, ${opacity})`);
                    grad.addColorStop(1, `rgba(255, 100, 20, 0)`);
                    ctx.save();
                    ctx.fillStyle = grad;
                    ctx.globalCompositeOperation = 'screen';
                    ctx.beginPath();
                    ctx.ellipse(screenNozzleX, groundY, 140 * scale, 40 * scale, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
        }

        // 2. Draw Flames (Rotated Context)
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, ctx.canvas.width, groundY);
        ctx.clip();

        ctx.translate(cx, cy);
        ctx.rotate(angle);

        for (const pp of rocketDef.placedParts) {
            const def = PARTS_CATALOG[pp.partId];
            if (!def || def.category !== 'engine') continue;

            const engineState = rocketDef.engines?.find(e => e.partInstanceId === pp.id);
            if (!engineState || !engineState.active) continue;

            const group = (phy.fuelGroups || []).find(g => g.id === engineState.fuelGroupId);
            if (!group || group.fuelMass <= 0) continue;

            const partX = (pp.x - (rocketDef._comX || rocketDef._centerX || 0)) * scale;
            const partY = (pp.y - (rocketDef._comY || rocketDef._centerY || 0)) * scale;

            const nozzleX = partX;
            const nozzleY = partY + (def.height / 2) * scale;

            drawFlameAt(ctx, nozzleX, nozzleY, throttle, scale, def.width);
        }

        ctx.restore();
    }

    function drawFlameAt(ctx, nx, ny, throttle, scale, partWidth) {
        const t = throttle;
        const now = Date.now();
        const f1 = Math.sin(now * 0.041);
        const f2 = Math.sin(now * 0.067 + 1.2);
        const f3 = Math.sin(now * 0.029 + 2.4);

        // Calcul d'un multiplicateur basé sur la largeur du moteur (par rapport à une base de 16)
        // Cela permet aux moteurs de 64 d'avoir des flammes 4x plus grosses
        const sizeMult = partWidth / 16;
        const engineBase = (partWidth / 2) * scale * 0.7;

        // Couche 1 : grande flamme externe (Longueur et Largeur liées à sizeMult)
        const outerH = (70 + t * 110) * scale * sizeMult;
        const outerW = (16 + t * 12) * scale * sizeMult;

        const og = ctx.createLinearGradient(nx, ny, nx, ny + outerH);
        og.addColorStop(0, 'rgba(255,180,30,0.9)');
        og.addColorStop(0.25, 'rgba(255,100,15,0.8)');
        og.addColorStop(0.6, 'rgba(220,40,5,0.45)');
        og.addColorStop(1, 'rgba(180,20,0,0)');
        ctx.fillStyle = og;

        ctx.beginPath();
        ctx.moveTo(nx - engineBase, ny);
        ctx.bezierCurveTo(
            nx - outerW * (0.9 + 0.15 * f2), ny + outerH * 0.28,
            nx - outerW * (0.5 + 0.2 * f3), ny + outerH * 0.65,
            nx + outerW * (0.1 * f1), ny + outerH
        );
        ctx.bezierCurveTo(
            nx + outerW * (0.5 + 0.2 * f2), ny + outerH * 0.65,
            nx + outerW * (0.9 + 0.15 * f3), ny + outerH * 0.28,
            nx + engineBase, ny
        );
        ctx.closePath();
        ctx.fill();

        // Couche 2 : flamme intermédiaire (Adaptée aussi)
        const midH = (50 + t * 75) * scale * sizeMult;
        const midW = (10 + t * 7) * scale * sizeMult;
        const f4 = Math.sin(now * 0.055 + 0.8);
        const f5 = Math.sin(now * 0.038 + 1.9);

        const mg = ctx.createLinearGradient(nx, ny, nx, ny + midH);
        mg.addColorStop(0, 'rgba(255,230,80,0.95)');
        mg.addColorStop(0.3, 'rgba(255,160,30,0.9)');
        mg.addColorStop(0.7, 'rgba(255,80,10,0.55)');
        mg.addColorStop(1, 'rgba(220,40,0,0)');
        ctx.fillStyle = mg;

        ctx.beginPath();
        ctx.moveTo(nx - engineBase * 0.6, ny); // Base de la couche 2 un peu plus étroite
        ctx.bezierCurveTo(
            nx - midW * (0.85 + 0.2 * f4), ny + midH * 0.3,
            nx - midW * (0.4 + 0.25 * f5), ny + midH * 0.7,
            nx + midW * (0.05 * f4), ny + midH
        );
        ctx.bezierCurveTo(
            nx + midW * (0.4 + 0.25 * f4), ny + midH * 0.7,
            nx + midW * (0.85 + 0.2 * f5), ny + midH * 0.3,
            nx + engineBase * 0.6, ny
        );
        ctx.closePath();
        ctx.fill();

        // Couche 3 : jet central (Le dard de choc, très long)
        const jetH = (90 + t * 150) * scale * sizeMult;
        const jetW = (4 + t * 3) * scale * sizeMult;
        const jd = (Math.random() - 0.5) * 1.5 * scale;

        const jg = ctx.createLinearGradient(nx, ny, nx + jd, ny + jetH);
        jg.addColorStop(0, 'rgba(255,255,255,1)');
        jg.addColorStop(0.2, 'rgba(200,225,255,0.9)');
        jg.addColorStop(1, 'rgba(200,30,0,0)');
        ctx.fillStyle = jg;

        ctx.beginPath();
        ctx.moveTo(nx - engineBase * 0.3, ny);
        ctx.bezierCurveTo(nx - jetW * 0.9, ny + jetH * 0.35, nx + jd, ny + jetH * 0.7, nx + jd, ny + jetH);
        ctx.bezierCurveTo(nx + jd, ny + jetH * 0.7, nx + jetW * 0.9, ny + jetH * 0.35, nx + engineBase * 0.3, ny);
        ctx.closePath();
        ctx.fill();

        // Halo (Aussi adapté à la taille du moteur)
        const hr = (15 + t * 10) * scale * sizeMult;
        const hg = ctx.createRadialGradient(nx, ny, 0, nx, ny, hr * 1.8);
        hg.addColorStop(0, 'rgba(255,230,120,0.75)');
        hg.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.ellipse(nx, ny, hr * 2.2, hr * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Particules
        const np = 6 + Math.floor(t * 12);
        for (let i = 0; i < np; i++) {
            const py = ny + Math.random() * outerH * 0.85;
            const maxW = outerW * (1 - (py - ny) / outerH) * 0.8;
            const px = nx + (Math.random() * 2 - 1) * maxW;
            const pr = (0.6 + Math.random() * 1.8) * scale * sizeMult;
            ctx.fillStyle = `rgba(255, 200, 50, ${0.4 + Math.random() * 0.4})`;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawDebris(ctx, debrisList, wts, zoom) {
        const scale = (Rocket.builderUnitInMeters || 0.1) * zoom;
        for (const deb of debrisList) {
            const [sx, sy] = wts(deb.x, deb.y);

            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(deb.angle);

            for (const p of deb.parts) {
                const def = PARTS_CATALOG[p.partId];
                if (!def) continue;

                const px = (p.x - (deb.centerX || 0)) * scale;
                const py = (p.y - (deb.centerY || 0)) * scale;

                ctx.save();
                ctx.translate(px, py);
                ctx.scale(scale, scale);
                ctx.translate(-def.width / 2, -def.height / 2);
                drawPartCanvas(ctx, def);
                ctx.restore();
            }
            ctx.restore();
        }
    }

    return {
        drawNormalView,
        drawPartCanvas,
    };
})();

const _origNormal = Renderer.drawNormalView;

(function patchRenderer() {

    function drawDebrisNormal(ctx, debris, camX, camY, zoom, W, H) {
        if (!debris || !debris.length) return;
        const partScale = (Rocket.builderUnitInMeters || 0.1) * zoom;
        const wts = (wx, wy) => [W / 2 + (wx - camX) * zoom, H / 2 - (wy - camY) * zoom];
        for (const d of debris) {
            const [dx, dy] = wts(d.x, d.y);
            ctx.save();
            ctx.translate(dx, dy);
            ctx.rotate(d.angle);

            // Draw actual parts
            if (d.parts) {
                d.parts.forEach(p => {
                    const def = PARTS_CATALOG[p.partId];
                    if (!def) return;
                    ctx.save();
                    // Offset part relative to debris center
                    ctx.translate((p.x - d.centerX) * partScale, (p.y - d.centerY) * partScale);
                    if (p.flipped) ctx.scale(-1, 1);

                    ctx.scale(partScale, partScale);
                    ctx.translate(-def.width / 2, -def.height / 2);
                    Renderer.drawPartCanvas(ctx, def);
                    ctx.restore();
                });
            } else {
                // Fallback for old debris
                ctx.fillStyle = '#804020';
                ctx.beginPath();
                ctx.roundRect(-12, -12, 24, 24, 4);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('💀', 0, 4);
            }
            ctx.restore();
        }
    }

    // Patch drawNormalView
    Renderer._drawNormalViewOriginal = Renderer.drawNormalView;
    Renderer.drawNormalView = function (ctx, state, rocketDef, inputs, camX, camY, zoom, debris) {
        Renderer._drawNormalViewOriginal(ctx, state, rocketDef, inputs, camX, camY, zoom);
        const W = ctx.canvas.width, H = ctx.canvas.height;
        if (debris) {
            drawDebrisNormal(ctx, debris, camX, camY, zoom, W, H);
        }
    };

})();
