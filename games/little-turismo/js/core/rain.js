// Système de pluie WebGL2 & pare-brise cockpit :
// - Traits de pluie 3D en espace monde orientés selon la vitesse relative et le vent, avec modulo wrapping ultra-performant sur GPU.
// - Gouttes d'eau dynamiques sur le pare-brise en vue cockpit qui glissent et s'étirent avec la vitesse de la voiture.

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

  const MAX_DROPS = 4500;
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
      activeCount = 2200;
      fallSpeed = 44;
      streakScale = 0.028;
      intensity = 0.85;
    } else if (weather === 'heavy_rain') {
      activeCount = 4200;
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
      gl.drawArrays(gl.LINES, 0, activeCount * 2);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pare-brise / visière cockpit (canvas 2D) :
//  • chaque goutte est une vraie lentille : elle affiche la scène 3D derrière elle, retournée et agrandie (effet « loupe »)
//  • voile d'eau flou (la route devient floue, plus en forte pluie) + micro-gouttelettes (givre d'eau)
//  • gouttes statiques qui collent, puis glissent (gravité à l'arrêt, soufflées vers le haut / les côtés par le vent relatif à vitesse),
//    fusionnent en grossissant, laissent des traînées et de minuscules gouttelettes derrière elles
// La scène est lue depuis le canvas WebGL : à appeler APRÈS le rendu de l'image (même tâche, avant composition).
// ─────────────────────────────────────────────────────────────────────────────
const GLASS = {
  light_rain: { rate: 42, max: 240, film: .52, mist: .20, streaks: 5, big: .06, tint: .12, pre: .55, veil: .10 },
  heavy_rain: { rate: 130, max: 420, film: .80, mist: .36, streaks: 16, big: .12, tint: .20, pre: .8, veil: .22 },
};

function makeSprite() {
  // Ombrage d'une goutte (rebord sombre, liseré clair, éclat spéculaire en haut à gauche, caustique lumineuse en bas)
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

function createWindshield(cv, R, getWeather) {
  const ctx = cv.getContext('2d'), sprite = makeSprite(), mist = makeMist(ctx);
  const snap = document.createElement('canvas'), sctx = snap.getContext('2d');
  const film = document.createElement('canvas'), fctx = film.getContext('2d');
  sctx.imageSmoothingQuality = 'high'; fctx.imageSmoothingQuality = 'high';
  let pre = false, w = 0, h = 0, W = 0, H = 0, S = 1, drops = [], streaks = [], acc = 0, nY = 0, nX = 0, t = 0, fr = 0, empty = true, snW = 0, snH = 0, ok = true;
  const rnd = Math.random;

  const mk = (x, y, rn, fade) => ({ x, y, rn, r: rn * S, a: fade ? 0 : 1, vx: 0, vy: 0, mv: false, tl: 0, st: .6 + rnd() * .8, acc: 0, sq: 1, dead: false, ph: rnd() * 6.28 });
  const impact = (P) => mk(rnd() * w, rnd() * h, rnd() < P.big ? 4 + rnd() * 5.5 : .8 + Math.pow(rnd(), 1.8) * 3.6, true);

  function resize() {
    const cw = cv.clientWidth || 300, ch = cv.clientHeight || 180;
    if (cw !== w || ch !== h) {
      w = cv.width = cw; h = cv.height = ch; drops.length = 0; streaks.length = 0; pre = false;
      S = Math.max(.8, Math.min(2.4, h / 520));
    }
    const p = cv.parentElement; W = (p && p.clientWidth) || w; H = (p && p.clientHeight) || h / .84;
  }
  function grab() {
    const g = R.canvas, gw = g.width, gh = g.height; if (!gw || !gh) return false;
    const nw = Math.min(720, gw), nh = Math.max(2, Math.round(nw * gh / gw));
    if (nw !== snW || nh !== snH) { snW = snap.width = nw; snH = snap.height = nh; film.width = 40; film.height = Math.max(2, Math.round(40 * nh / nw)); fr = 0; }
    sctx.drawImage(g, 0, 0, snW, snH);
    if ((fr++ & 1) === 0) fctx.drawImage(snap, 0, 0, film.width, film.height);
    return true;
  }
  function lens(d, mag) {
    const rx = d.r, ry = d.r * d.sq;
    ctx.save(); ctx.translate(d.x, d.y); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 6.2832); ctx.clip();
    // scène derrière la goutte, agrandie (÷mag sur la source) et retournée à 180° comme dans une vraie goutte
    const hx = (rx + 1) / mag, hy = (ry + 1) / mag, kx = snW / W, ky = snH / H, cx = d.x * kx, cy = d.y * ky;
    ctx.rotate(Math.PI);
    ctx.drawImage(snap, cx - hx * kx, cy - hy * ky, 2 * hx * kx, 2 * hy * ky, -rx - 1, -ry - 1, 2 * rx + 2, 2 * ry + 2);
    ctx.rotate(Math.PI);
    ctx.drawImage(sprite, -rx, -ry, 2 * rx, 2 * ry);
    ctx.restore();
  }

  return {
    clear() { if (!empty) { ctx.clearRect(0, 0, cv.width, cv.height); empty = true; } if (drops.length) drops.length = 0; },
    update(dt, fwd, lat) {
      const P = GLASS[getWeather()]; if (!P) return;
      resize(); if (w < 4 || h < 4) return;
      const open = cv.closest('.cockpit')?.dataset.kind === 'open', k = open ? .8 : 1;   // visière : voile plus léger
      const haveScene = ok && !R.lost && (() => { try { return grab(); } catch (e) { ok = false; return false; } })();
      t += dt; const spd = Math.max(0, fwd || 0), kmh = spd * 3.6;

      // apparition des impacts (plus nombreux à haute vitesse : la voiture fonce dans la pluie)
      acc += P.rate * (1 + spd / 45) * dt * (open ? .8 : 1);
      const max = Math.round(P.max * (open ? .8 : 1));
      if (!pre) { pre = true; for (let i = 0, n = Math.round(max * P.pre); i < n; i++) { const d = impact(P); d.a = 1; drops.push(d); } }
      while (acc >= 1) { acc--; if (drops.length < max) drops.push(impact(P)); }

      // dynamique : gravité à l'arrêt, vent relatif vers le haut à vitesse ; les petites gouttes collent (seuil de décrochage)
      const wind = spd * spd * .0026;
      for (const d of drops) {
        const up = wind * Math.min(d.rn, 4), grav = d.rn * d.rn * .06, net = up - grav, stick = (1 + d.rn * .35) * d.st;
        const tgt = Math.abs(net) > stick ? -Math.sign(net) * Math.min(900, (Math.abs(net) - stick) * 18) * S : 0;
        d.vy += (tgt - d.vy) * Math.min(1, dt * (tgt ? 6 : 14));
        const tx = tgt ? ((d.x / w - .5) * 2 * up * 3 + (lat || 0) * 2 + Math.sin(t * 5 + d.ph) * 6) * S : 0;
        d.vx += (tx - d.vx) * Math.min(1, dt * 8);
        d.mv = Math.abs(d.vy) > 6 * S;
        d.x += d.vx * dt; d.y += d.vy * dt; d.a = Math.min(1, d.a + dt * 6);
        d.tl = d.mv ? Math.min(70 * S, d.tl + Math.abs(d.vy) * dt * .6) : Math.max(0, d.tl - dt * 40);
        d.sq += ((1 + Math.min(.35, Math.abs(d.vy) / (500 * S))) - d.sq) * Math.min(1, dt * 10);
        if (d.mv && d.rn > 2.2) {   // traîne de minuscules gouttelettes en glissant
          d.acc += Math.abs(d.vy) * dt;
          if (d.acc > 22 * S && drops.length < max) {
            d.acc = 0; drops.push(mk(d.x + (rnd() - .5) * d.r * .5, d.y, .5 + rnd() * .55, false));
            d.rn = Math.sqrt(Math.max(.6, d.rn * d.rn - .45)); d.r = d.rn * S;
          }
        }
        if (d.y < -20 * S || d.y > h + 20 * S || d.x < -20 || d.x > w + 20) d.dead = true;
      }
      // fusion : une goutte en mouvement absorbe celles qu'elle touche
      for (const d of drops) {
        if (!d.mv || d.dead) continue;
        for (const o of drops) {
          if (o === d || o.dead || o.rn > d.rn) continue;
          const dx = o.x - d.x, dy = o.y - d.y, rr = (d.r + o.r) * .75;
          if (dx * dx + dy * dy < rr * rr) { d.rn = Math.min(11, Math.sqrt(d.rn * d.rn + o.rn * o.rn * .9)); d.r = d.rn * S; o.dead = true; }
        }
      }
      let n = 0; for (let i = 0; i < drops.length; i++) if (!drops[i].dead) drops[n++] = drops[i]; drops.length = n;

      // ── dessin ──
      ctx.clearRect(0, 0, w, h); empty = false;
      if (haveScene) {   // voile d'eau : la route se brouille (moins marqué quand le vent chasse le film à haute vitesse)
        ctx.globalAlpha = P.film * k * (1 - Math.min(.12, kmh / 1500)) * (.94 + .06 * Math.sin(t * 1.3));
        ctx.drawImage(film, 0, 0, film.width, film.height * (h / H), 0, 0, w, h); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = `rgba(118,134,152,${(P.tint + P.veil) * k})`; ctx.fillRect(0, 0, w, h);
      nY = (nY - (14 + kmh * .5) * dt) % 256; nX = (nX + (lat || 0) * 4 * dt) % 256;   // micro-gouttelettes : dérivent vers le haut
      ctx.globalAlpha = P.mist * k; ctx.fillStyle = mist; ctx.save(); ctx.translate(nX, nY); ctx.fillRect(-nX, -nY - 256, w + 256, h + 512); ctx.restore(); ctx.globalAlpha = 1;
      if (P.streaks && !open) {   // filets d'eau rapides en forte pluie
        while (streaks.length < P.streaks) streaks.push({ x: rnd() * w, y: rnd() * h, l: (30 + rnd() * 70) * S, v: .5 + rnd() });
        ctx.lineCap = 'round';
        for (const s of streaks) {
          s.y -= (40 + kmh * 3) * s.v * dt * S; s.x += ((s.x / w - .5) * 2) * 30 * s.v * dt;
          if (s.y + s.l < 0) { s.y = h + rnd() * 40; s.x = rnd() * w; s.l = (30 + rnd() * 70) * S; }
          ctx.strokeStyle = 'rgba(205,225,245,.07)'; ctx.lineWidth = (1.2 + s.v * 1.6) * S; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + s.l); ctx.stroke();
        }
      }
      ctx.lineCap = 'round';
      for (const d of drops) {   // traînées d'eau derrière les gouttes qui glissent
        if (d.tl < 3) continue; const dir = Math.sign(d.vy) || 1;
        ctx.strokeStyle = `rgba(205,228,248,${.13 * d.a})`; ctx.lineWidth = d.r * .9; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.vx * .02, d.y - dir * d.tl); ctx.stroke();
      }
      for (const d of drops) {
        ctx.globalAlpha = d.a;
        if (haveScene && d.r > 1.9 * S) lens(d, 1.7 + Math.min(d.rn, 8) * .1);
        else ctx.drawImage(sprite, d.x - d.r, d.y - d.r * d.sq, 2 * d.r, 2 * d.r * d.sq);
      }
      ctx.globalAlpha = 1;
    },
  };
}