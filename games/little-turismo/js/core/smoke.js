// Fumée dynamique des pneus : particules orientées caméra (billboards) via drawArraysInstanced en WebGL2.
// Calcul par roue : blocage en ligne droite (2 roues avant), blocage en virage (roue extérieure la plus sollicitée),
// dérive / tête-à-queue (roues en glisse ou 4 roues en tête-à-queue), patinage / burnouts (roues arrière).
import { SKY } from './gl.js';
import { TRACK, surface, locate } from './track.js';

const VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aCenter;
layout(location=2) in vec4 aData;
layout(location=3) in vec3 aCol;

uniform mat4 uVP;
uniform vec3 uCamR, uCamU, uCamPos, uFog;
uniform float uFogD;

out vec2 vUV;
out vec4 vColor;

void main() {
  float size = aData.x, alpha = aData.y, rot = aData.z;
  float cs = cos(rot), sn = sin(rot);
  vec2 ro = vec2(aCorner.x * cs - aCorner.y * sn, aCorner.x * sn + aCorner.y * cs) * size;
  vec3 worldPos = aCenter + uCamR * ro.x + uCamU * ro.y;
  gl_Position = uVP * vec4(worldPos, 1.0);
  vUV = aCorner;
  float dist = distance(worldPos, uCamPos);
  float fog = 1.0 - exp(-dist * uFogD);
  vColor = vec4(mix(aCol, uFog, fog), alpha);
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec4 vColor;
out vec4 o;

void main() {
  float d = length(vUV);
  float angle = atan(vUV.y, vUV.x);
  float wobble = sin(angle * 5.0) * 0.08 + cos(angle * 3.0) * 0.06;
  float rNorm = d / max(0.01, 0.86 + wobble);
  if (rNorm > 1.0) discard;
  float f = clamp(1.0 - rNorm, 0.0, 1.0);
  float shape = f * f * (3.0 - 2.0 * f);
  o = vec4(vColor.rgb, vColor.a * shape);
}`;

const DEF = { a: 1.25, b: 1.45, tw: 1.6 };
const YO = [0.05, 0.07, 0, -0.05];
const SMOKE_COL = [0.92, 0.93, 0.96];
const DUST_COL = [0.58, 0.50, 0.38];
const GRASS_COL = [0.52, 0.55, 0.38];
const tmp = { lat: 0, i: 0, s: 0 };

export function createSmoke(R, maxParticles = 1400) {
    const gl = R.gl, MAX = maxParticles;
    const px = new Float32Array(MAX), py = new Float32Array(MAX), pz = new Float32Array(MAX);
    const vx = new Float32Array(MAX), vy = new Float32Array(MAX), vz = new Float32Array(MAX);
    const age = new Float32Array(MAX), life = new Float32Array(MAX);
    const sz0 = new Float32Array(MAX), sz1 = new Float32Array(MAX), aMax = new Float32Array(MAX);
    const rot = new Float32Array(MAX), rotSpd = new Float32Array(MAX);
    const colR = new Float32Array(MAX), colG = new Float32Array(MAX), colB = new Float32Array(MAX);

    const instV = new Float32Array(MAX * 10);
    const accum = new Float32Array(64 * 4);
    let count = 0;
    let ok = true, prog = null, U = null, vao = null, quadVbo = null, instVbo = null;
    let camX = 0, camZ = 0, low = false, wet = 0;
    const N = TRACK.N, T = TRACK.T, ds = TRACK.ds;

    function init() {
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
      for (const n of ['uVP', 'uCamR', 'uCamU', 'uCamPos', 'uFog', 'uFogD']) {
        U[n] = gl.getUniformLocation(prog, n);
      }

      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      quadVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(0, 0);

      instVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, instVbo);
      gl.bufferData(gl.ARRAY_BUFFER, instV, gl.DYNAMIC_DRAW);

      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 0);
      gl.vertexAttribDivisor(1, 1);

      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 12);
      gl.vertexAttribDivisor(2, 1);

      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 40, 28);
      gl.vertexAttribDivisor(3, 1);

      gl.bindVertexArray(null);
    }

    try { init(); } catch (e) { ok = false; console.warn('Fumée des pneus désactivée', e); }
    R.canvas.addEventListener('webglcontextrestored', () => {
      if (!ok) return;
      try { init(); } catch (e) { ok = false; }
    });

    function spawn(x, y, z, pvx, pvy, pvz, size0, size1, alpha, duration, r, g, b) {
      const limit = low ? (MAX >> 1) : MAX;
      if (count >= limit) return;
      const i = count++;
      px[i] = x; py[i] = y; pz[i] = z;
      vx[i] = pvx; vy[i] = pvy; vz[i] = pvz;
      age[i] = 0; life[i] = duration;
      sz0[i] = size0; sz1[i] = size1;
      aMax[i] = alpha;
      rot[i] = Math.random() * 6.283;
      rotSpd[i] = (Math.random() - 0.5) * 2.2;
      colR[i] = r; colG[i] = g; colB[i] = b;
    }

    return {
      clear() { count = 0; accum.fill(0); },
      get low() { return low; },
      set low(v) { low = !!v; },
      get wet() { return wet; },
      set wet(v) { wet = Math.max(0, Math.min(1, Number(v) || 0)); },
      begin(dt, cam) {
        camX = cam.pos[0]; camZ = cam.pos[2];
        if (dt <= 0) return;
        const dtClamped = Math.min(dt, 0.1);
        const drag = Math.exp(-2.2 * dtClamped);
        let i = 0;
        while (i < count) {
          age[i] += dtClamped;
          if (age[i] >= life[i]) {
            count--;
            if (i < count) {
              px[i] = px[count]; py[i] = py[count]; pz[i] = pz[count];
              vx[i] = vx[count]; vy[i] = vy[count]; vz[i] = vz[count];
              age[i] = age[count]; life[i] = life[count];
              sz0[i] = sz0[count]; sz1[i] = sz1[count];
              aMax[i] = aMax[count];
              rot[i] = rot[count]; rotSpd[i] = rotSpd[count];
              colR[i] = colR[count]; colG[i] = colG[count]; colB[i] = colB[count];
            }
            continue;
          }

          vx[i] *= drag;
          vz[i] *= drag;
          vy[i] += (0.45 - vy[i] * 0.4) * dtClamped;
          px[i] += vx[i] * dtClamped;
          py[i] += vy[i] * dtClamped;
          pz[i] += vz[i] * dtClamped;
          rot[i] += rotSpd[i] * dtClamped;

          const p = age[i] / life[i];
          const sz = sz0[i] + (sz1[i] - sz0[i]) * Math.sqrt(p);
          const fade = p < 0.12 ? (p / 0.12) : (1.0 - (p - 0.12) / 0.88);
          const al = aMax[i] * fade;

          const o = i * 10;
          instV[o] = px[i];
          instV[o + 1] = py[i];
          instV[o + 2] = pz[i];
          instV[o + 3] = sz;
          instV[o + 4] = al;
          instV[o + 5] = rot[i];
          instV[o + 6] = 0;
          instV[o + 7] = colR[i];
          instV[o + 8] = colG[i];
          instV[o + 9] = colB[i];

          i++;
        }
      },
      car(slot, ph, pose, dt = 1 / 60) {
        if (!ok || slot * 4 + 4 > accum.length) return;
        const p = pose || ph, ai = slot > 0;
        const dx = p.x - camX, dz = p.z - camZ;
        const far = low ? 70 : 150;
        if (ai && dx * dx + dz * dz > far * far) return;

        const S = ph.sheet || DEF;
        const u = ph.u || 0, w = ph.w || 0, r = ph.r || 0;
        const sp = Math.hypot(u, w);
        let sa = ph.sa;
        if (typeof sa !== 'number') {
          const a = S.a || DEF.a, b = S.b || DEF.b;
          sa = Math.atan((a + b) * r / (u < 0 ? Math.min(u, -2.5) : Math.max(u, 2.5)));
        }
        if (typeof sa !== 'number' || isNaN(sa)) sa = 0;

        const skF = ph.skF || 0;
        const skR = ph.skR || 0;

        // 1. Tête-à-queue : perte de contrôle totale / rotation violente
        const isSpin = Math.abs(r) > 1.2 || (sp > 8 && Math.abs(w) / sp > 0.45) || Math.abs(w) > 4.5;

        // 2. Virage : sens du braquage et du lacet
        const turnDir = Math.abs(r) > 0.12 ? Math.sign(r) : (Math.abs(sa) > 0.04 ? Math.sign(sa) : 0);
        const isCornering = turnDir !== 0 && (Math.abs(sa) > 0.04 || Math.abs(r) > 0.12);

        const cs = Math.cos(p.psi), sn = Math.sin(p.psi);
        const bSlot = slot * 4;

        for (let k = 0; k < 4; k++) {
          const isFront = k < 2;
          const side = (k & 1) ? 1 : -1; // -1: Gauche, +1: Droite
          const hw = (S.tw || DEF.tw) / 2;
          const fwd = isFront ? (S.a || DEF.a) : -(S.b || DEF.b);

          // Roue extérieure / intérieure en virage :
          // Virage à droite (turnDir > 0) -> extérieure = Gauche (side = -1)
          // Virage à gauche (turnDir < 0) -> extérieure = Droite (side = +1)
          const isOutside = (turnDir !== 0) && (side !== turnDir);
          const isInside = (turnDir !== 0) && (side === turnDir);

          let intensity = 0;

          if (isSpin) {
            // Tête-à-queue : toutes les roues qui glissent violemment émettent de la fumée
            const vx_w = u - side * hw * r;
            const vy_w = w + fwd * r;
            const vLat = isFront ? (-vx_w * Math.sin(sa) + vy_w * Math.cos(sa)) : vy_w;
            const slide = Math.hypot(vLat, isFront ? 0 : vx_w * 0.25);
            if (slide > 2.0) {
              intensity = Math.min(1.0, (slide - 2.0) / 4.0 + 0.35);
            }
          } else {
            if (isFront) {
              // Freinage roues avant :
              if (skF > 0.18) {
                if (!isCornering) {
                  // Ligne droite : les 2 roues avant fument de manière égale
                  intensity = Math.max(intensity, skF);
                } else {
                  // En virage (et qu'on tourne) : la roue la plus sollicitée (extérieure chargée) fume en priorité
                  if (isOutside) {
                    intensity = Math.max(intensity, Math.min(1.0, skF * 1.35));
                  } else if (skF > 0.75) {
                    // Roue intérieure délestée : presque pas de fumée sauf blocage extrême
                    intensity = Math.max(intensity, (skF - 0.75) * 0.35);
                  }
                }
              }
              // Dérive latérale du train avant (sous-virage fort / ripage)
              if (sp > 7) {
                const af = Math.atan2(w + fwd * r, Math.max(Math.abs(u), 3)) - sa * (u < 0 ? -1 : 1);
                const latSlipF = Math.max(0, (Math.abs(af) - 0.18) / 0.16);
                if (latSlipF > 0.1 && (isOutside || !isCornering)) {
                  intensity = Math.max(intensity, Math.min(1.0, latSlipF * 0.95));
                }
              }
            } else {
              // Roues arrière : drift, patinage, tête-à-queue, frein à main
              if (skR > 0.2) {
                intensity = Math.max(intensity, skR);
              }
              if (sp > 5) {
                const ar = Math.atan2(w + fwd * r, Math.max(Math.abs(u), 3));
                const latSlipR = Math.max(0, (Math.abs(ar) - 0.11) / 0.15);
                if (latSlipR > 0.1) {
                  const loadFactor = isOutside ? 1.25 : 0.85;
                  intensity = Math.max(intensity, Math.min(1.0, latSlipR * loadFactor));
                }
              }
            }
          }

          // Piste mouillée : les roues projettent de spectaculaires panaches d'eau pulvérisée (tyre spray) proportionnels à la vitesse
          if (wet > 0 && sp > 4.5) {
            if (!isFront) {
              const sprayR = Math.min(1.0, (sp - 4.5) / 22.0) * wet;
              if (sprayR > 0.1) intensity = Math.max(intensity, sprayR);
            } else if (sp > 8.0) {
              const sprayF = Math.min(0.65, (sp - 8.0) / 26.0) * wet;
              if (sprayF > 0.1) intensity = Math.max(intensity, sprayF);
            }
          }

          const accIdx = bSlot + k;
          if (intensity > 0.18) {
            const cx = p.x + cs * fwd - sn * side * hw;
            const cz = p.z + sn * fwd + cs * side * hw;

            let sf = 0;
            if (typeof ph.s === 'number' && typeof ph.lat === 'number') {
              const i = ((ph.s / ds) | 0) % N;
              const th = p.psi - Math.atan2(T[i * 2 + 1], T[i * 2]);
              tmp.i = i < 0 ? i + N : i;
              tmp.s = ph.s;
              tmp.lat = ph.lat + side * hw * Math.cos(th) + fwd * Math.sin(th);
              sf = surface(tmp);
            } else {
              const l = locate(cx, cz);
              sf = l ? surface(l) : 0;
            }

            const cy = p.y + YO[sf] + 0.12;

            accum[accIdx] += dt * (low ? 12 + intensity * 20 : 18 + intensity * 32);
            if (accum[accIdx] > 2.0) accum[accIdx] = 2.0;

            while (accum[accIdx] >= 1.0) {
              accum[accIdx] -= 1.0;

              const isSpray = wet > 0 && (sf === 0 || sf === 1);
              const vx0 = cs * u - sn * w;
              const vz0 = sn * u + cs * w;
              // Le spray d'eau est projeté plus haut et emporté dans le sillage aérodynamique
              const pvx = vx0 * (isSpray ? 0.32 : 0.15) + (Math.random() - 0.5) * (isSpray ? 0.6 : 0.4);
              const pvz = vz0 * (isSpray ? 0.32 : 0.15) + (Math.random() - 0.5) * (isSpray ? 0.6 : 0.4);
              const pvy = (isSpray ? 0.85 + Math.random() * 0.9 : 0.55 + Math.random() * 0.5);

              let col = SMOKE_COL;
              if (isSpray) col = [0.88, 0.92, 0.98];
              else if (sf === 2) col = DUST_COL;
              else if (sf === 3) col = GRASS_COL;

              const duration = isSpray ? (0.75 + Math.random() * 0.45) : (0.75 + Math.random() * 0.35);
              const size0 = isSpray ? (0.35 + Math.random() * 0.1) : (0.22 + Math.random() * 0.08);
              const size1 = isSpray ? (2.4 + Math.random() * 0.8) : (1.25 + Math.random() * 0.4);
              const alpha = isSpray ? Math.min(0.38, 0.12 + intensity * 0.26) : Math.min(0.55, 0.28 + intensity * 0.25);

              spawn(cx, cy, cz, pvx, pvy, pvz, size0, size1, alpha, duration, col[0], col[1], col[2]);
            }
          } else {
            accum[accIdx] = Math.max(0, accum[accIdx] - dt * 20);
          }
        }
      },
      draw(cam) {
        if (!ok || R.lost || count === 0) return;
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, instVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, instV, 0, count * 10);

        gl.uniformMatrix4fv(U.uVP, false, cam.vp);
        gl.uniform3fv(U.uCamR, cam.r);
        gl.uniform3fv(U.uCamU, cam.u);
        gl.uniform3fv(U.uCamPos, cam.pos);
        gl.uniform3fv(U.uFog, SKY.hor);
        gl.uniform1f(U.uFogD, 0.0006);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(null);
      },
    };
  }

