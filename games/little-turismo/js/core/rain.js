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

  // ── Gouttes d'eau pare-brise (Vue Cockpit) ──
  const cpDrops = [];
  const cpSplashes = [];
  const MAX_CP_DROPS = 150;
  const MAX_SPLASHES = 18;
  let cpCtx = null;
  if (cockpitCanvas) {
    cpCtx = cockpitCanvas.getContext('2d');
  }

  function resetCpDrop(d, w, h, spawnAtBottom = false) {
    d.x = Math.random() * w;
    d.y = spawnAtBottom ? (h * 0.4 + Math.random() * h * 0.6) : (Math.random() * h);
    d.r = 1.0 + Math.random() * 3.2;
    d.alpha = 0.40 + Math.random() * 0.50;
    d.trail = 0;
    d.seed = Math.random() * 100;
  }

  function spawnSplash(w, h) {
    if (cpSplashes.length < MAX_SPLASHES) {
      cpSplashes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1.5,
        maxR: 4.0 + Math.random() * 6.0,
        alpha: 0.65,
      });
    }
  }

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

      // Cockpit drops tick
      if (isCockpitView && cpCtx && cockpitCanvas && cockpitCanvas.isConnected) {
        const w = cockpitCanvas.width = cockpitCanvas.clientWidth || 300;
        const h = cockpitCanvas.height = cockpitCanvas.clientHeight || 180;
        if (w > 0 && h > 0) {
          const targetDrops = weather === 'heavy_rain' ? MAX_CP_DROPS : Math.round(MAX_CP_DROPS * 0.48);
          while (cpDrops.length < targetDrops) {
            const d = {};
            resetCpDrop(d, w, h);
            cpDrops.push(d);
          }

          cpCtx.clearRect(0, 0, w, h);
          const spd = Math.max(0, carForwardSpeed || 0);
          const flowUp = (spd * 3.6 + 6.0) * (weather === 'heavy_rain' ? 1.25 : 0.95);
          const flowSide = (carLateralSpeed || 0) * 1.1;

          // Apparition d'impacts d'eau aléatoires
          if (Math.random() < (weather === 'heavy_rain' ? 0.45 : 0.20)) {
            spawnSplash(w, h);
          }

          // Dessin et mise à jour des impacts d'eau (splashes)
          for (let sIdx = cpSplashes.length - 1; sIdx >= 0; sIdx--) {
            const sp = cpSplashes[sIdx];
            sp.r += dt * 26.0;
            sp.alpha -= dt * 1.8;
            if (sp.alpha <= 0.02 || sp.r >= sp.maxR) {
              cpSplashes.splice(sIdx, 1);
              continue;
            }
            cpCtx.beginPath();
            cpCtx.arc(sp.x, sp.y, sp.r, 0, 6.283);
            cpCtx.strokeStyle = `rgba(220, 238, 255, ${sp.alpha * 0.55})`;
            cpCtx.lineWidth = 1.0;
            cpCtx.stroke();
          }

          for (let i = 0; i < cpDrops.length; i++) {
            const d = cpDrops[i];
            // Le vent relatif pousse les gouttes vers le haut et les côtés
            const sinWobble = Math.sin(time * 6.0 + d.seed) * 0.4;
            d.y -= flowUp * dt * (0.55 + d.r * 0.22);
            d.x += (flowSide + sinWobble) * dt;
            d.trail = Math.min(28, (spd / 10) * d.r * 1.6);

            if (d.y < -12 || d.x < -12 || d.x > w + 12) {
              resetCpDrop(d, w, h, true);
            }

            // Dessin réaliste avec réfraction et traînée
            cpCtx.save();
            if (d.trail > 2.5) {
              // Traînée étirée sinueuse
              cpCtx.beginPath();
              cpCtx.moveTo(d.x - d.r * 0.65, d.y);
              cpCtx.quadraticCurveTo(d.x + sinWobble * 2.0, d.y + d.trail * 0.5, d.x, d.y + d.trail);
              cpCtx.quadraticCurveTo(d.x - sinWobble * 2.0, d.y + d.trail * 0.5, d.x + d.r * 0.65, d.y);
              cpCtx.fillStyle = `rgba(210, 235, 255, ${d.alpha * 0.32})`;
              cpCtx.fill();
            }

            // 1. Anneau d'ombrage de lentille (réfraction de la goutte)
            cpCtx.beginPath();
            cpCtx.arc(d.x, d.y, d.r, 0, 6.283);
            cpCtx.fillStyle = `rgba(14, 24, 38, ${d.alpha * 0.45})`;
            cpCtx.fill();

            // 2. Cœur d'eau translucide
            cpCtx.beginPath();
            cpCtx.arc(d.x + 0.2, d.y + 0.3, d.r * 0.82, 0, 6.283);
            cpCtx.fillStyle = `rgba(215, 238, 255, ${d.alpha * 0.70})`;
            cpCtx.fill();

            // 3. Éclat spéculaire blanc étincelant
            cpCtx.beginPath();
            cpCtx.arc(d.x - d.r * 0.32, d.y - d.r * 0.32, d.r * 0.32, 0, 6.283);
            cpCtx.fillStyle = `rgba(255, 255, 255, ${Math.min(1.0, d.alpha * 1.25)})`;
            cpCtx.fill();
            cpCtx.restore();
          }
        }
      } else if (cpCtx && cockpitCanvas && cpDrops.length > 0) {
        cpDrops.length = 0;
        cpSplashes.length = 0;
        cpCtx.clearRect(0, 0, cockpitCanvas.width, cockpitCanvas.height);
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

