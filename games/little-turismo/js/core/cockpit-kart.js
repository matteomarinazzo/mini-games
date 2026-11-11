// Vue pilote d'un kart (canvas 2D par-dessus la scène 3D), 100 % procédural, sans allocation par image.
// Volant à écran LCD (vitesse / rapport / régime / temps de tour), pneus avant 3D (wheel-gl.js, comme le cockpit F1) qui braquent et roulent,
// carénage + pontons + pare-chocs tubulaire qui suivent roulis / tangage avec inertie (ressort amorti), vibrations selon le sol,
// poussière / gravillons / eau sur bordures, gouttes sur la visière sous la pluie, ombre douce et reflet du ciel.
import { SKY } from './gl.js';
import { createWheelGL } from './wheel-gl.js';
const rgb = (c, k = 1) => 'rgb(' + c.map((v) => Math.round(Math.min(1, v * k) * 255)).join() + ')';
const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
const DIG = '0123456789'.split('');
const SIDES = [-1, 1], GRIPS = [[-8, 1.12, 1.46], [8, 1.54, 1.88]], BTNS = [[-9.6, -10.6, '#ff7a1a'], [0, -11.2, '#e9edf2'], [9.6, -10.6, '#2ed36b']], GX = new Float32Array(2), GY = new Float32Array(2);
const SH = [.25, 1.1, 1.5, .9];                    // amplitude de vibration par surface : asphalte, vibreur, gravier, herbe
const NP = 30, ND = 36, NS = 16, TAU = 6.2832;
let styled = false;
export function createKartCockpit(parent, lk) {
  if (!styled) {   // masque tout le reste du cockpit (tableau de bord, montants, pare-brise) quand data-kind = kart
    styled = true; const st = document.createElement('style');
    st.textContent = '#cockpit[data-kind="kart"]::before,#cockpit[data-kind="kart"]::after{display:none!important;content:none!important}#cockpit[data-kind="kart"]>*:not(.kartgl):not(.cockpit-helmet){display:none!important}';
    document.head.appendChild(st);
  }
  const cv = document.createElement('canvas'); cv.className = 'kartgl';
  cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:block';
  parent.appendChild(cv);
  const WG = createWheelGL(parent, cv, { tint: lk.accent, body: lk.color, lock: .5 });   // roues 3D (même technique que le cockpit F1) ; null sans WebGL2 → pneus 2D de secours
  const x = cv.getContext('2d'), body = rgb(lk.color), dark = rgb(lk.color, .45), acc = rgb(lk.accent), suit = rgb(lk.color, .32);
  const grip = lk.accent.every((v) => v > .8) || lk.accent.every((v) => v < .2) ? '#ff7a1a' : rgb(lk.accent);
  let W = 0, H = 0, dpr = 1, last = performance.now(), ph = 0, spawn = 0, rainAcc = 0, sy = 0, sv = 0, sx = 0, svx = 0, sw = 0, lastPitch = 0, bump = 0;
  const rr = (a, b, w, h, r) => { x.beginPath(); x.roundRect ? x.roundRect(a, b, w, h, r) : x.rect(a, b, w, h); };
  // --- dégradés créés une seule fois (coordonnées « unités », indépendants de la taille d'écran)
  const hc = SKY.hor.map((v) => Math.round(v * 255)).join();
  const mkL = (x0, y0, x1, y1, st) => { const g = x.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of st) g.addColorStop(o, c); return g; };
  const sheen = mkL(0, -43, 0, -26, [[0, 'rgba(' + hc + ',.55)'], [.5, 'rgba(' + hc + ',.12)'], [1, 'rgba(' + hc + ',0)']]);
  const shadow = x.createRadialGradient(0, 0, 0, 0, 0, 40); shadow.addColorStop(0, 'rgba(0,0,0,.34)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
  // --- pools (aucune allocation ensuite)
  const px = new Float32Array(NP), py = new Float32Array(NP), pvx = new Float32Array(NP), pvy = new Float32Array(NP), pl = new Float32Array(NP), ps = new Float32Array(NP), pt = new Uint8Array(NP);
  const dx = new Float32Array(ND), dy = new Float32Array(ND), dr = new Float32Array(ND), dl = new Float32Array(ND);
  const sa = new Float32Array(NS), sr = new Float32Array(NS), sl = new Float32Array(NS);
  for (let i = 0; i < NS; i++) { sa[i] = (i / NS) * TAU + (i % 3) * .2; sr[i] = (i * .37) % 1; sl[i] = 10 + (i % 4) * 5; }
  const digits = (n, len, px0, py0, step, blank) => {   // entier sur len chiffres, sans chaîne ; blank = supprime les zéros de tête
    let on = !blank, p = 1; for (let i = 1; i < len; i++) p *= 10;
    for (let i = 0; i < len; i++, p /= 10) { const d = ((n / p) | 0) % 10; if (d || i === len - 1) on = true; if (on) x.fillText(DIG[d], px0 + i * step, py0); }
  };
  return {
    canvas: cv,
    /** À appeler à chaque image : steer −1..1, kmh, surf (0 asphalte, 1 vibreur, 2 gravier, 3 herbe), ex (objet réutilisé, optionnel) :
     *  { rpm, gear (−1 = pas de boîte), roll, pitch, ax, ay, lap (s, −1 = n/a), wet (0..1) }. Rétro-compatible : draw(steer, kmh, surf). */
    draw(steer, kmh, surf, ex) {
      const cw = cv.clientWidth, ch = cv.clientHeight; if (!cw || !ch) return;
      if (cw !== W || ch !== H) { W = cw; H = ch; dpr = Math.min(devicePixelRatio || 1, 1.5); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
      const t = now / 1000, s = Math.min(H / 100, W / 118), hw = W / 2 / s, sp = cl(kmh / 90, 0, 1), sf = surf | 0;
      const rpm = ex ? ex.rpm : 1100, gear = ex ? ex.gear : -1, roll = ex ? ex.roll : 0, pitch = ex ? ex.pitch : 0, ax = ex ? ex.ax : 0, ay = ex ? ex.ay : 0, lap = ex ? ex.lap : -1, wet = ex ? ex.wet : 0;
      // direction lissée (transition douce) + phase de roulement des pneus
      sw += (steer - sw) * Math.min(1, 16 * dt); ph = (ph + kmh * .28 * dt) % 6;
      // masse / suspension : ressorts amortis, pilotés par accélération latérale / longitudinale, roulis, tangage, bosses
      svx += ((cl(-ay * .05 - roll * 20, -5, 5) - sx) * 90 - svx * 11) * dt; sx += svx * dt;   // inertie latérale seulement, aucune vibration
      sv += ((cl(pitch * 18 + ax * .08, -3, 3) - sy) * 100 - sv * 12) * dt; sy += sv * dt; lastPitch = pitch;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
      x.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2), dpr * H);   // le casque / la visière sont fournis par .cockpit-helmet (même surcouche que la F1)
      // traits de vitesse (flux d'air) sur les bords
      if (kmh > 40) {
        x.strokeStyle = 'rgba(255,255,255,' + ((kmh - 40) / 130 * .16).toFixed(2) + ')'; x.lineWidth = .35; x.beginPath();
        for (let i = 0; i < NS; i++) { const r = ((sr[i] + t * (kmh / 160)) % 1) * 90 + 35, c = Math.cos(sa[i]), sn = Math.sin(sa[i]); x.moveTo(c * r, -52 + sn * r * .6); x.lineTo(c * (r + sl[i] * kmh / 100), -52 + sn * (r + sl[i] * kmh / 100) * .6); }
        x.stroke();
      }
      // châssis (lissé, sans vibration) : roues avant très basses et larges, un peu de carrosserie derrière le volant, rien d'autre
      x.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 + sx * s), dpr * (H + sy * s));
      if (WG) WG.draw(sw, kmh, sx, sy, s, 1 - wet * .3);
      // pneus avant : roues 3D (wheel-gl.js) dessinées sous ce canvas ; ici seulement le secours 2D
      if (!WG) for (const sd of SIDES) {   // secours sans WebGL2
        x.save(); x.translate(sd * 50, -9); x.rotate(sw * .35);
        rr(-14, -17, 28, 36, 8); x.fillStyle = '#0d0f12'; x.fill(); x.save(); x.clip();
        x.fillStyle = 'rgba(255,255,255,.07)'; for (let i = -1; i < 6; i++) x.fillRect(-13, -17 + i * 7 + ph * 1.17, 26, 1.4);
        x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(-14, -17, 28, 4); x.restore();
        x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = .5; rr(-14, -17, 28, 36, 8); x.stroke();
        x.restore();
      }
      if (!WG) {   // secours sans WebGL2 : carrosserie 2D simple (avec WebGL2 : plancher, nez et bras 3D dans wheel-gl.js)
      // carrosserie continue derrière le volant, jusqu'en bas de l'écran (plus rien ne flotte) : dôme à la livrée + plancher sombre
      x.beginPath(); x.moveTo(-27, 2); x.lineTo(-27, -14); x.quadraticCurveTo(-22, -42, 0, -45); x.quadraticCurveTo(22, -42, 27, -14); x.lineTo(27, 2); x.closePath(); x.fillStyle = body; x.fill();
      x.fillStyle = sheen; x.globalAlpha = 1 - wet * .5; x.fill(); x.globalAlpha = 1;
      x.strokeStyle = acc; x.lineWidth = 1.1; x.beginPath(); x.moveTo(-23, -24); x.quadraticCurveTo(-18, -41, 0, -43.5); x.quadraticCurveTo(18, -41, 23, -24); x.stroke();
      x.fillStyle = dark; x.fillRect(-27, -17, 54, 19);
      x.fillStyle = '#0b0c0f'; x.fillRect(-27, -7, 54, 9);
      }
      // colonne + volant
      const a = sw * 1.45, ca = Math.cos(a), sa_ = Math.sin(a);
      x.save(); x.translate(0, -24); x.scale(1.45, 1.45); x.translate(0, 19);   // volant agrandi, centré bas dans l'écran
      x.save(); x.translate(0, -19); x.rotate(a);
      rr(-17, -12, 34, 24, 9); x.strokeStyle = '#25282d'; x.lineWidth = 5.4; x.stroke(); x.strokeStyle = '#7c828a'; x.lineWidth = 3.4; x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = .5; rr(-17, -12, 34, 24, 9); x.stroke();
      x.strokeStyle = grip; x.lineWidth = 3.9; for (const [c, a0, a1] of GRIPS) { x.beginPath(); x.arc(c, -3, 9, Math.PI * a0, Math.PI * a1); x.stroke(); }
      x.strokeStyle = '#0e1013'; x.lineWidth = 3.4; x.beginPath(); x.moveTo(-10, 1); x.lineTo(-17, 1); x.moveTo(10, 1); x.lineTo(17, 1); x.stroke();
      // moyeu + écran LCD (vitesse, rapport, régime, temps de tour) + rampe de LED de régime
      rr(-13, -8, 26, 16, 3.5); x.fillStyle = '#0e1013'; x.fill(); x.strokeStyle = '#2a2d33'; x.lineWidth = .5; x.stroke();
      rr(-11.6, -6.4, 23.2, 12.8, 1.8); x.fillStyle = '#05080a'; x.fill();
      const rf = cl((rpm - 1100) / 6900, 0, 1), fl = rf > .96 && (Math.floor(t * 14) & 1);
      for (let i = 0; i < 8; i++) { x.fillStyle = rf > .35 + i * .08 && (!fl || i & 1) ? (i < 3 ? '#2ed36b' : i < 6 ? '#ffb020' : '#ff3b30') : '#1c2127'; x.fillRect(-11 + i * 3, -8.2, 2.2, 1.2); }
      x.font = 'bold 4.6px monospace'; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
      x.fillStyle = '#7fffa8'; digits(Math.min(999, kmh) | 0, 3, -10.6, -1.6, 2.9, true);       // vitesse
      x.fillStyle = '#e9edf2'; x.fillText(gear < 0 ? (kmh < 1 ? 'N' : '-') : DIG[Math.min(9, gear + 1)], 3.4, -1.6);   // rapport (N / - sans boîte)
      x.fillStyle = '#ffb020'; digits(Math.min(19999, rpm) | 0, 5, -10.6, 3.2, 2.5, true); x.font = 'bold 2.3px monospace'; x.fillText('RPM', 3.4, 3.2);
      if (lap >= 0) { x.font = 'bold 3px monospace'; x.fillStyle = '#cfe8ff'; const ms = Math.min(5999999, lap * 100) | 0, m = (ms / 6000) | 0, sc = ((ms / 100) | 0) % 60, cs = ms % 100; x.fillText(DIG[m % 10], -10.6, 5.7); x.fillText(':', -8.8, 5.7); digits(sc, 2, -7.8, 5.7, 1.9); x.fillText('.', -3.8, 5.7); digits(cs, 2, -2.9, 5.7, 1.9); }
      for (const [bx, by, c] of BTNS) { x.beginPath(); x.arc(bx, by + 2.9, 1.1, 0, TAU); x.fillStyle = c; x.fill(); }
      x.restore();
      x.restore();
      // poussière / gravillons / eau projetés par les roues sur vibreur, gravier, herbe
      if (kmh > 18 && sf > 0 || (wet > .3 && kmh > 60)) {
        spawn += dt * (6 + kmh * .15) * (sf ? 1 : .35);
        while (spawn >= 1) {
          spawn -= 1; let k = 0; while (k < NP && pl[k] > 0) k++; if (k === NP) break;
          const sd = (k & 1) ? 1 : -1; px[k] = sd * ((WG ? .5555 * 1.57 * H / (2 * s) : 50) + Math.random() * 6); py[k] = WG ? -.14 * H / s : -24; pvx[k] = sd * (4 + Math.random() * 10); pvy[k] = -8 - Math.random() * 14; pl[k] = .5 + Math.random() * .45; ps[k] = .8 + Math.random() * 1.6; pt[k] = wet > .3 ? 2 : sf === 2 ? 1 : 0;
        }
      }
      for (let k = 0; k < NP; k++) {
        if (pl[k] <= 0) continue; pl[k] -= dt; px[k] += pvx[k] * dt; py[k] += pvy[k] * dt; pvy[k] += 30 * dt;
        x.globalAlpha = Math.max(0, pl[k]) * .55; x.fillStyle = pt[k] === 2 ? '#cfe4f5' : pt[k] === 1 ? '#8c8f93' : '#b49a73';
        x.beginPath(); x.arc(px[k], py[k], ps[k] * (pt[k] === 2 ? .8 : 1.2 + (1 - pl[k]) * 1.5), 0, TAU); x.fill();
      }
      x.globalAlpha = 1;
      // gouttes sur la visière (repère écran, pas de décalage châssis) : version légère de rain.js
      if (wet > 0) {
        x.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2), dpr * H);
        rainAcc += dt * wet * (3 + kmh * .08);
        while (rainAcc >= 1) { rainAcc -= 1; let k = 0; while (k < ND && dl[k] > 0) k++; if (k === ND) break; dx[k] = (Math.random() * 2 - 1) * hw * .9; dy[k] = -92 + Math.random() * 54; dr[k] = .35 + Math.random() * 1.1; dl[k] = 2.5 + Math.random() * 3; }
        x.fillStyle = 'rgba(210,225,240,.16)'; x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = .22;
        for (let k = 0; k < ND; k++) {
          if (dl[k] <= 0) continue; dl[k] -= dt; const f = kmh * .0009 * (1 + dr[k]); dy[k] -= f * dt * 60 * dr[k]; dx[k] += Math.sign(dx[k]) * f * dt * 25 * dr[k];
          x.globalAlpha = Math.min(1, dl[k]); x.beginPath(); x.ellipse(dx[k], dy[k], dr[k], dr[k] * 1.25, 0, 0, TAU); x.fill(); x.beginPath(); x.arc(dx[k] - dr[k] * .25, dy[k] - dr[k] * .35, dr[k] * .55, 3.6, 5.2); x.stroke();
        }
        x.globalAlpha = 1;
      }
    },
  };
}
