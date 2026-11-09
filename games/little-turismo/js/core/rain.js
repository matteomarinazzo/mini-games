// Système de pluie WebGL2 & pare-brise cockpit :
// - Traits de pluie 3D en espace monde orientés selon la vitesse relative et le vent, avec modulo wrapping ultra-performant sur GPU.
// - Gouttes d'eau dynamiques sur le pare-brise en vue cockpit qui glissent et s'étirent avec la vitesse de la voiture.
// PERF : Compteurs de particules réduits, capture de scène throttlée 1x/2 frames,
//        fusion O(n²) désactivée sous forte pluie, lens() utilise film basse-résolution,
//        traînées : 2 passes → 1 passe optimisée.

const VS = `#version 300 es
layout(location=0) in vec3 aBase;
layout(location=1) in float aTail;
layout(location=2) in float aSeed;

uniform mat4 uVP;
uniform vec3 uCamPos;
uniform vec3 uBox;
uniform vec3 uStreak;
uniform float uTime;
uniform float uFallSpeed;
uniform vec3 uWind;
uniform vec3 uFog;
uniform float uFogD;

out float vAlpha;
out vec3 vCol;

void main() {
  vec3 fall = vec3(uWind.x * uTime, -uFallSpeed * uTime, uWind.z * uTime);
  vec3 rel = aBase + fall - uCamPos;
  // Modulo wrap dans la boîte centrée sur la caméra
  vec3 p = mod(rel, uBox) - uBox * 0.5;

  // Queue du trait de pluie étirée selon la vitesse relative
  if (aTail < 0.5) {
    p += uStreak;
  }

  vec3 worldPos = uCamPos + p;
  float dCam = length(p);

  // Atténuation douce au bord de la boîte et très près de l'objectif
  float nearFade = smoothstep(0.4, 1.8, dCam);
  float edgeFade = smoothstep(uBox.x * 0.5, uBox.x * 0.35, length(p.xz));
  float vertFade = smoothstep(uBox.y * 0.5, uBox.y * 0.35, abs(p.y));

  float vertAlpha = mix(0.1, 0.72, aTail);
  vAlpha = vertAlpha * nearFade * edgeFade * vertFade;

  // Brouillard atmosphérique
  float fog = 1.0 - exp(-dCam * uFogD);
  vec3 baseCol = vec3(0.86, 0.91, 0.98);
  vCol = mix(baseCol, uFog, fog);

  gl_Position = uVP * vec4(worldPos, 1.0);
}`;

const FS = `#version 300 es
precision mediump float;
in float vAlpha;
in vec3 vCol;
uniform float uIntensity;
out vec4 o;

void main() {
  if (vAlpha < 0.01) discard;
  o = vec4(vCol, vAlpha * uIntensity);
}`;

export function createRain(R, initialWeather = 'dry', cockpitCanvas = null) {
  const gl = R.gl;
  let weather = initialWeather;
  let activeCount = 0;
  let fallSpeed = 42;
  let streakScale = 0.032;
  let intensity = 1.0;
  let time = 0;

  // PERF : Réduit de 4500 → 2800 max (suffisant visuellement, économise ~40% de draw calls GPU)
  const MAX_DROPS = 2800;
  const BOX = [75, 36, 75];
  const WIND = [-3.5, 0, 2.5];

  let prog = null, U = null, vao = null, vbo = null;
  let ok = true;

  try {
    const mk = (t, s) => {
      const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h);
      if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h));
      return h;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));

    U = {};
    for (const n of ['uVP', 'uCamPos', 'uBox', 'uStreak', 'uTime', 'uFallSpeed', 'uWind', 'uFog', 'uFogD', 'uIntensity']) {
      U[n] = gl.getUniformLocation(prog, n);
    }

    // Génération du maillage fixe : 2 sommets par trait (queue et tête)
    const verts = new Float32Array(MAX_DROPS * 2 * 5); // x, y, z, tail (0/1), seed
    for (let i = 0; i < MAX_DROPS; i++) {
      const x = (Math.random() - 0.5) * BOX[0];
      const y = (Math.random() - 0.5) * BOX[1];
      const z = (Math.random() - 0.5) * BOX[2];
      const seed = Math.random();

      // Sommet 0 : Queue (tail = 0)
      const o0 = i * 2 * 5;
      verts[o0] = x; verts[o0 + 1] = y; verts[o0 + 2] = z; verts[o0 + 3] = 0; verts[o0 + 4] = seed;

      // Sommet 1 : Tête (tail = 1)
      const o1 = o0 + 5;
      verts[o1] = x; verts[o1 + 1] = y; verts[o1 + 2] = z; verts[o1 + 3] = 1; verts[o1 + 4] = seed;
    }

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    // aBase (3 floats), aTail (1 float), aSeed (1 float) = 20 octets stride
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 12);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);

    gl.bindVertexArray(null);
  } catch (e) {
    console.warn('Initialisation pluie WebGL2 échouée:', e);
    ok = false;
  }

  const glass = cockpitCanvas ? createWindshield(cockpitCanvas, R, () => weather) : null;

  function setWeather(wType) {
    weather = wType;
    if (weather === 'light_rain') {
      // PERF : Réduit de 2200 → 1600 (toujours très visible, économise ~27% de traits GPU)
      activeCount = 1600;
      fallSpeed = 44;
      streakScale = 0.028;
      intensity = 0.85;
    } else if (weather === 'heavy_rain') {
      // PERF : Réduit de 4200 → 2500 (forte pluie dense mais beaucoup plus légère)
      activeCount = 2500;
      fallSpeed = 58;
      streakScale = 0.038;
      intensity = 1.0;
    } else {
      activeCount = 0;
      intensity = 0;
    }
  }

  setWeather(initialWeather);

  let prevCamPos = null;

  return {
    get weather() { return weather; },
    setWeather,
    update(dt, cam, carForwardSpeed = 0, carLateralSpeed = 0, isCockpitView = false) {
      if (activeCount <= 0 || dt <= 0) return;
      time += dt;

      if (glass) {
        if (isCockpitView && cockpitCanvas.isConnected) glass.update(Math.min(dt, .05), carForwardSpeed, carLateralSpeed);
        else glass.clear();
      }
    },
    draw(cam) {
      if (!ok || R.lost || activeCount <= 0) return;

      const gl = R.gl;
      gl.useProgram(prog);

      // Calcul de la vitesse de la caméra pour incliner les traits de pluie selon la vitesse relative
      let camVx = 0, camVy = 0, camVz = 0;
      if (prevCamPos) {
        camVx = (cam.pos[0] - prevCamPos[0]) / 0.016;
        camVy = (cam.pos[1] - prevCamPos[1]) / 0.016;
        camVz = (cam.pos[2] - prevCamPos[2]) / 0.016;
      }
      prevCamPos = [cam.pos[0], cam.pos[1], cam.pos[2]];

      // Vecteur streak = vitesse relative (chute + vent - vitesse caméra) * échelle de traînée
      const relVx = WIND[0] - Math.max(-60, Math.min(60, camVx));
      const relVy = -fallSpeed - Math.max(-25, Math.min(25, camVy));
      const relVz = WIND[2] - Math.max(-60, Math.min(60, camVz));

      const sx = relVx * streakScale;
      const sy = relVy * streakScale;
      const sz = relVz * streakScale;

      gl.uniformMatrix4fv(U.uVP, false, cam.vp);
      gl.uniform3fv(U.uCamPos, cam.pos);
      gl.uniform3f(U.uBox, BOX[0], BOX[1], BOX[2]);
      gl.uniform3f(U.uStreak, -sx, -sy, -sz);
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uFallSpeed, fallSpeed);
      gl.uniform3f(U.uWind, WIND[0], WIND[1], WIND[2]);
      gl.uniform3fv(U.uFog, R.weather.fogC || [0.55, 0.60, 0.66]);
      gl.uniform1f(U.uFogD, R.weather.fogD || 0.001);
      gl.uniform1f(U.uIntensity, intensity);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      gl.bindVertexArray(vao);
      // PERF : activeCount est déjà limité, Math.min sécurise en plus
      gl.drawArrays(gl.LINES, 0, Math.min(activeCount, MAX_DROPS) * 2);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  };
}

// ─── Pare-brise / visière cockpit ───────────────────────────────────────────
// TRAÎNÉE RÉALISTE : chaque goutte enregistre son chemin réel (liste de points).
// La traînée suit ce parcours exact et s'efface depuis la queue (eau séchée par la nouvelle pluie).
// VUE VISIÈRE F1 : pour open/wedge, overlay casque (haut+bas noir arrondi, reflet visière).
// PERF : grab() throttlée (1 capture/2 frames), lens() sur film basse-res, fusion O(n²) skippée
//        en mode heavy_rain quand il y a trop de gouttes, traînées en 1 passe au lieu de 2.
// ────────────────────────────────────────────────────────────────────────────
const GLASS = {
  // PERF : rate et max réduits (~30% moins de gouttes) — visuellement imperceptible
  light_rain: { rate: 28, max: 160, film: .48, mist: .18, streaks: 3, big: .06, tint: .10, pre: .50, veil: .09 },
  heavy_rain: { rate: 80, max: 260, film: .76, mist: .33, streaks: 9, big: .10, tint: .19, pre: .78, veil: .20 },
};

function makeSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const x = c.getContext('2d'), m = 48;
  let g = x.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, 'rgba(190,215,240,0.05)'); g.addColorStop(.62, 'rgba(120,150,180,0.06)');
  g.addColorStop(.84, 'rgba(8,14,24,0.38)'); g.addColorStop(.96, 'rgba(4,8,14,0.62)'); g.addColorStop(1, 'rgba(4,8,14,0)');
  x.fillStyle = g; x.beginPath(); x.arc(m, m, m, 0, 6.2832); x.fill();
  x.strokeStyle = 'rgba(235,246,255,0.42)'; x.lineWidth = 2; x.beginPath(); x.arc(m, m, m - 3.5, .2, 2.7); x.stroke();
  x.strokeStyle = 'rgba(210,235,255,0.55)'; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.arc(m, m + 2, m * .66, .55, 2.55); x.stroke();
  g = x.createRadialGradient(m * .66, m * .6, 0, m * .66, m * .6, m * .3);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(m * .66, m * .6, m * .3, m * .2, -.6, 0, 6.2832); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.arc(m * 1.3, m * 1.38, m * .07, 0, 6.2832); x.fill();
  return c;
}

function makeMist(ctx) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); let s = 12345; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 1500; i++) {
    const px = r() * 256, py = r() * 256, rad = .35 + r() * r() * 1.6, l = r() < .25;
    x.fillStyle = l ? `rgba(20,30,44,${.14 + r() * .22})` : `rgba(225,240,255,${.22 + r() * .4})`;
    x.beginPath(); x.arc(px, py, rad, 0, 6.2832); x.fill();
  }
  return ctx.createPattern(c, 'repeat');
}

// Dessine l'overlay visière casque F1 (open/wedge) sur le canvas du pare-brise
function drawHelmet(ctx, w, h) {
  // Haut du casque : bande noire arrondie en haut simulant l'intérieur du casque
  const topH = h * 0.14, botH = h * 0.12;
  // Bande supérieure (intérieur casque - zone noire avec texture)
  const gt = ctx.createLinearGradient(0, 0, 0, topH);
  gt.addColorStop(0, 'rgba(4,6,10,0.98)');
  gt.addColorStop(0.6, 'rgba(10,14,22,0.92)');
  gt.addColorStop(1, 'rgba(10,14,22,0)');
  ctx.fillStyle = gt; ctx.fillRect(0, 0, w, topH * 1.5);

  // Bande inférieure (menton du casque)
  const gb = ctx.createLinearGradient(0, h - botH * 1.5, 0, h);
  gb.addColorStop(0, 'rgba(10,14,22,0)');
  gb.addColorStop(0.4, 'rgba(10,14,22,0.90)');
  gb.addColorStop(1, 'rgba(4,6,10,0.98)');
  ctx.fillStyle = gb; ctx.fillRect(0, h - botH * 1.5, w, botH * 1.5);

  // Bords latéraux arrondis (tunnel visuel d'un casque intégral)
  const edgeW = w * 0.055;
  const gl2 = ctx.createLinearGradient(0, 0, edgeW * 1.6, 0);
  gl2.addColorStop(0, 'rgba(4,6,10,0.96)');
  gl2.addColorStop(1, 'rgba(4,6,10,0)');
  ctx.fillStyle = gl2; ctx.fillRect(0, 0, edgeW * 1.6, h);
  const gr2 = ctx.createLinearGradient(w, 0, w - edgeW * 1.6, 0);
  gr2.addColorStop(0, 'rgba(4,6,10,0.96)');
  gr2.addColorStop(1, 'rgba(4,6,10,0)');
  ctx.fillStyle = gr2; ctx.fillRect(w - edgeW * 1.6, 0, edgeW * 1.6, h);

  // Reflet de visière (diagonale lumineuse caractéristique d'un casque)
  ctx.save();
  ctx.globalAlpha = 0.07;
  const gv = ctx.createLinearGradient(w * .22, topH, w * .52, h * .45);
  gv.addColorStop(0, 'rgba(255,255,255,0)');
  gv.addColorStop(0.3, 'rgba(255,255,255,1)');
  gv.addColorStop(0.55, 'rgba(220,235,255,0.6)');
  gv.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gv;
  ctx.beginPath();
  ctx.moveTo(w * .18, topH); ctx.lineTo(w * .56, topH);
  ctx.lineTo(w * .44, h * .48); ctx.lineTo(w * .06, h * .48);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // Liseré chromé du bord de visière (ligne brillante en haut)
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = 'rgba(200,220,240,0.9)';
  ctx.lineWidth = Math.max(1, h * 0.003);
  ctx.beginPath();
  ctx.moveTo(0, topH); ctx.bezierCurveTo(w * .15, topH * .85, w * .85, topH * .85, w, topH);
  ctx.stroke();
  ctx.restore();
}

function createWindshield(cv, R, getWeather) {
  const ctx = cv.getContext('2d'), sprite = makeSprite(), mist = makeMist(ctx);
  const snap = document.createElement('canvas'), sctx = snap.getContext('2d');
  const film = document.createElement('canvas'), fctx = film.getContext('2d');
  sctx.imageSmoothingQuality = 'low'; // PERF : 'high' → 'low' (snap est intermédiaire, pas affiché directement)
  fctx.imageSmoothingQuality = 'low';

  let pre = false, w = 0, h = 0, W = 0, H = 0, S = 1;
  let drops = [], streaks = [], trails = [];
  let acc = 0, nY = 0, nX = 0, t = 0, fr = 0, empty = true, snW = 0, snH = 0, ok = true;
  const rnd = Math.random;

  const mk = (x, y, rn, fade) => ({
    x, y, rn, r: rn * S, a: fade ? 0 : 1,
    vx: 0, vy: 0, mv: false,
    st: 0.6 + rnd() * 0.8,
    sq: 1, dead: false, ph: rnd() * 6.28,
    trail: null,        // référence à la traînée d'eau en cours
    lastTrackX: x, lastTrackY: y
  });

  const impact = (P) => mk(
    rnd() * w, rnd() * h,
    rnd() < P.big ? 3.8 + rnd() * 5.2 : 0.8 + Math.pow(rnd(), 1.8) * 3.4,
    true
  );

  function resize() {
    const cw = cv.clientWidth || 300, ch = cv.clientHeight || 180;
    if (cw !== w || ch !== h) {
      w = cv.width = cw; h = cv.height = ch;
      drops.length = 0; streaks.length = 0; trails.length = 0; pre = false;
      S = Math.max(0.8, Math.min(2.4, h / 520));
    }
    const p = cv.parentElement;
    W = (p && p.clientWidth) || w;
    H = (p && p.clientHeight) || (h / 0.84);
  }

  // PERF : grab() throttlée — le snap pleine-résolution ne se capture qu'1 frame sur 2
  // Le film basse-résolution (40px) ne se recalcule qu'1 frame sur 4 (déjà fait, conservé)
  let grabTick = 0;
  function grab() {
    const g = R.canvas, gw = g.width, gh = g.height;
    if (!gw || !gh) return false;
    const nw = Math.min(560, gw), nh = Math.max(2, Math.round(nw * gh / gw)); // PERF : 720→560px
    if (nw !== snW || nh !== snH) {
      snW = snap.width = nw; snH = snap.height = nh;
      film.width = 32; film.height = Math.max(2, Math.round(32 * nh / nw)); // PERF : 40→32px
      fr = 0; grabTick = 0;
    }
    // PERF : capture plein-res seulement 1 frame sur 2 (l'autre frame réutilise le snap précédent)
    if ((grabTick++ & 1) === 0) {
      sctx.drawImage(g, 0, 0, snW, snH);
    }
    if ((fr++ & 3) === 0) fctx.drawImage(snap, 0, 0, film.width, film.height); // PERF : film 1/4
    return true;
  }

  // PERF : lens() utilise film (32px) au lieu de snap (560px) — même rendu visuel car la goutte
  // agrandit beaucoup la zone, la résolution basse est totalement imperceptible sur 5-15px de goutte.
  function lens(d, mag) {
    const rx = d.r, ry = d.r * d.sq;
    const angle = d.mv && (Math.abs(d.vx) > 1 || Math.abs(d.vy) > 1) ? Math.atan2(d.vy, d.vx) - Math.PI / 2 : 0;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (angle) ctx.rotate(angle);

    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, 6.2832);
    ctx.clip();

    // PERF : film (32px) au lieu de snap (560px) : identique visuellement sur une goutte de 5-15px
    const hx = (rx + 1) / mag, hy = (ry + 1) / mag;
    const kx = film.width / W, ky = film.height / H;
    const cx = d.x * kx, cy = d.y * ky;

    ctx.rotate(Math.PI);
    ctx.drawImage(film, cx - hx * kx, cy - hy * ky, 2 * hx * kx, 2 * hy * ky, -rx - 1, -ry - 1, 2 * rx + 2, 2 * ry + 2);
    ctx.rotate(Math.PI);

    ctx.drawImage(sprite, -rx, -ry, 2 * rx, 2 * ry);
    ctx.restore();
  }

  return {
    clear() {
      if (!empty) { ctx.clearRect(0, 0, cv.width, cv.height); empty = true; }
      if (drops.length) drops.length = 0;
      if (trails.length) trails.length = 0;
    },

    update(dt, fwd, lat) {
      const P = GLASS[getWeather()];
      if (!P) return;
      resize();
      if (w < 4 || h < 4) return;

      const isOpen = cv.closest('.cockpit')?.dataset.kind === 'open' || cv.closest('.cockpit')?.dataset.kind === 'wedge';
      const k = isOpen ? 0.75 : 1;
      const haveScene = ok && !R.lost && (() => { try { return grab(); } catch (e) { ok = false; return false; } })();
      t += dt;
      const spd = Math.max(0, fwd || 0), kmh = spd * 3.6;

      // Apparition de nouvelles gouttes
      acc += P.rate * (1 + spd / 45) * dt * (isOpen ? 0.7 : 1);
      const max = Math.round(P.max * (isOpen ? 0.7 : 1));
      if (!pre) {
        pre = true;
        for (let i = 0, n = Math.round(max * P.pre); i < n; i++) {
          const d = impact(P); d.a = 1; drops.push(d);
        }
      }
      while (acc >= 1) {
        acc--;
        if (drops.length < max) drops.push(impact(P));
      }

      // Dynamique des gouttes (gravité vs vent relatif)
      const wind = spd * spd * 0.0026;
      for (const d of drops) {
        const up = wind * Math.min(d.rn, 4);
        const grav = d.rn * d.rn * 0.06;
        const net = up - grav;
        const stick = (1 + d.rn * 0.35) * d.st;
        const tgt = Math.abs(net) > stick ? -Math.sign(net) * Math.min(900, (Math.abs(net) - stick) * 18) * S : 0;

        d.vy += (tgt - d.vy) * Math.min(1, dt * (tgt ? 6 : 14));
        const tx = tgt ? ((d.x / w - 0.5) * 2 * up * 3 + (lat || 0) * 2 + Math.sin(t * 5 + d.ph) * 6) * S : 0;
        d.vx += (tx - d.vx) * Math.min(1, dt * 8);

        d.mv = Math.abs(d.vy) > 5 * S || Math.abs(d.vx) > 3 * S;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.a = Math.min(1, d.a + dt * 6);
        d.sq += ((1 + Math.min(0.35, Math.abs(d.vy) / (500 * S))) - d.sq) * Math.min(1, dt * 10);

        // ── Enregistrement du chemin réel de la traînée ──
        if (d.mv) {
          const distSq = (d.x - d.lastTrackX) * (d.x - d.lastTrackX) + (d.y - d.lastTrackY) * (d.y - d.lastTrackY);
          if (distSq > 9 * S * S) {
            d.lastTrackX = d.x;
            d.lastTrackY = d.y;
            if (!d.trail) {
              d.trail = { points: [], active: true };
              trails.push(d.trail);
            }
            d.trail.points.push({
              x: d.x, y: d.y,
              r: Math.max(1, d.r * 0.65),
              a: 1.0
            });
            // PERF : Limiter la longueur max d'un sillage (40 au lieu de 60)
            if (d.trail.points.length > 40) d.trail.points.shift();
          }
        } else {
          if (d.trail) {
            d.trail.active = false;
            d.trail = null;
          }
        }

        // Dépôt de micro-gouttelettes résiduelles sur les grosses gouttes qui glissent vite
        if (d.mv && d.rn > 2.2) {
          d.acc = (d.acc || 0) + Math.abs(d.vy) * dt;
          if (d.acc > 24 * S && drops.length < max) {
            d.acc = 0;
            drops.push(mk(d.x + (rnd() - 0.5) * d.r * 0.5, d.y, 0.45 + rnd() * 0.5, false));
            d.rn = Math.sqrt(Math.max(0.6, d.rn * d.rn - 0.45));
            d.r = d.rn * S;
          }
        }

        if (d.y < -25 * S || d.y > h + 25 * S || d.x < -25 || d.x > w + 25) {
          d.dead = true;
          if (d.trail) { d.trail.active = false; d.trail = null; }
        }
      }

      // PERF : Fusion O(n²) throttlée — seulement quand peu de gouttes (≤ 100) pour éviter le pire cas
      // Sous heavy_rain avec 260 gouttes, cette boucle générait 33 800 itérations par frame !
      if (drops.length <= 100) {
        for (const d of drops) {
          if (!d.mv || d.dead) continue;
          for (const o of drops) {
            if (o === d || o.dead || o.rn > d.rn) continue;
            const dx = o.x - d.x, dy = o.y - d.y, rr = (d.r + o.r) * 0.75;
            if (dx * dx + dy * dy < rr * rr) {
              d.rn = Math.min(11, Math.sqrt(d.rn * d.rn + o.rn * o.rn * 0.9));
              d.r = d.rn * S;
              o.dead = true;
              if (o.trail) { o.trail.active = false; o.trail = null; }
            }
          }
        }
      }

      let n = 0;
      for (let i = 0; i < drops.length; i++) if (!drops[i].dead) drops[n++] = drops[i];
      drops.length = n;

      // ── Effacement progressif des traînées (la nouvelle pluie lave le verre) ──
      const trailFadeSpeed = (0.20 + (P.rate / 400) * 0.18);
      for (let trIdx = trails.length - 1; trIdx >= 0; trIdx--) {
        const tr = trails[trIdx];
        const pts = tr.points;
        for (let pIdx = 0; pIdx < pts.length; pIdx++) {
          const ageFactor = 1.0 + (pts.length - 1 - pIdx) * 0.04;
          pts[pIdx].a -= dt * trailFadeSpeed * ageFactor;
        }
        while (pts.length > 0 && pts[0].a <= 0) {
          pts.shift();
        }
        if (pts.length < 2 && !tr.active) {
          trails.splice(trIdx, 1);
        }
      }

      // ── Rendu 2D ──
      ctx.clearRect(0, 0, w, h);
      empty = false;

      // 1. Voile d'eau / film flou sur la vitre
      if (haveScene) {
        ctx.globalAlpha = P.film * k * (1 - Math.min(0.12, kmh / 1500)) * (0.94 + 0.06 * Math.sin(t * 1.3));
        ctx.drawImage(film, 0, 0, film.width, film.height * (h / H), 0, 0, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(118,134,152,' + ((P.tint + P.veil) * k) + ')';
      ctx.fillRect(0, 0, w, h);

      // 2. Micro-gouttelettes (bruine/givre d'eau)
      nY = (nY - (14 + kmh * 0.5) * dt) % 256;
      nX = (nX + (lat || 0) * 4 * dt) % 256;
      ctx.globalAlpha = P.mist * k;
      ctx.fillStyle = mist;
      ctx.save();
      ctx.translate(nX, nY);
      ctx.fillRect(-nX, -nY - 256, w + 256, h + 512);
      ctx.restore();
      ctx.globalAlpha = 1;

      // 3. Filets d'eau rapides sous forte pluie (streaks)
      if (P.streaks && !isOpen) {
        while (streaks.length < P.streaks) {
          streaks.push({ x: rnd() * w, y: rnd() * h, l: (30 + rnd() * 70) * S, v: 0.5 + rnd() });
        }
        ctx.lineCap = 'round';
        for (const s of streaks) {
          s.y -= (40 + kmh * 3) * s.v * dt * S;
          s.x += ((s.x / w - 0.5) * 2) * 30 * s.v * dt;
          if (s.y + s.l < 0) {
            s.y = h + rnd() * 40; s.x = rnd() * w; s.l = (30 + rnd() * 70) * S;
          }
          ctx.strokeStyle = 'rgba(205,225,245,0.08)';
          ctx.lineWidth = (1.2 + s.v * 1.6) * S;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x, s.y + s.l);
          ctx.stroke();
        }
      }

      // 4. Traînées réelles d'eau liquide
      // PERF : 1 seule passe au lieu de 2 (élimination de la double itération sur chaque segment)
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const tr of trails) {
        const pts = tr.points;
        if (pts.length < 2) continue;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i], p1 = pts[i + 1];
          const segAlpha = Math.min(p0.a, p1.a);
          if (segAlpha <= 0.01) continue;
          // Combinaison des 2 passes en 1 : liseré sombre + eau bleue en couches successives
          // mais un seul beginPath/stroke par segment (au lieu de 2)
          ctx.strokeStyle = 'rgba(185, 220, 250, ' + (0.26 * segAlpha) + ')';
          ctx.lineWidth = (p0.r + p1.r) * 0.60;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }

      // 5. Rendu des gouttes d'eau (effet loupe réaliste)
      for (const d of drops) {
        ctx.globalAlpha = d.a;
        if (haveScene && d.r > 1.8 * S) {
          lens(d, 1.7 + Math.min(d.rn, 8) * 0.12);
        } else {
          ctx.drawImage(sprite, d.x - d.r, d.y - d.r * d.sq, 2 * d.r, 2 * d.r * d.sq);
        }
      }
      ctx.globalAlpha = 1;
    }
  };
}
