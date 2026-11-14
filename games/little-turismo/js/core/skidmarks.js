// Traces de pneus : ruban continu par roue, buffer circulaire pré-alloué (CAP segments = 2 triangles chacun), 1 seul draw call, mise à jour GPU par plage.
// Fondu d'apparition (alpha 0 → cible sur le 1er segment) et de disparition (temps de mort par sommet, calculé dans le shader : aucun upload pour vieillir).
// Glissement : latéral cinématique (u, w, r, braquage) pour toutes les voitures ; blocage / patinage lus dans ph.skF / ph.skR (posés par physics.js, 0 pour les voitures distantes).
import { SKY } from './gl.js';
import { TRACK, surface } from './track.js';
export const SK = { CAP: 16000, MIN_P: 1.1, MIN_AI: 3.8, FAR_AI: 45, FAR_LOW: 30, LIFE_P: 1e5, LIFE_AI: 1e5, FADE: 7, LOW_DT: 1 / 45, AI_FRAME: 3, AI_FRAME_LOW: 2 };
const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec4 aA;
uniform mat4 uVP; uniform vec3 uCam, uFog, uCol[4]; uniform float uT, uFogD;
out vec4 vC;
void main(){ float f=clamp((aA.z-uT)/max(aA.z-aA.y,.001),0.,1.);
 vC=vec4(mix(uCol[int(aA.w)],uFog,1.-exp(-distance(aP,uCam)*uFogD)),aA.x*f); gl_Position=uVP*vec4(aP,1.); }`;
const FS = `#version 300 es
precision mediump float; in vec4 vC; out vec4 o; void main(){ o=vC; }`;
const COL = new Float32Array([.02, .02, .025, .06, .06, .06, .40, .29, .17, .15, .12, .07]);
const AMAX = [.78, .6, .55, .45], YO = [.05, .07, 0, -.05];
const DEF = { a: 1.25, b: 1.45, tw: 1.6, understeer: .35, oversteer: .35 }, VPS = 28, cl = (v, a, b) => v < a ? a : v > b ? b : v;
const tmp = { lat: 0, i: 0, s: 0 };
export function createSkids(R, nCars) {
  const gl = R.gl, CAP = SK.CAP, V = new Float32Array(CAP * VPS), st = new Float64Array(Math.max(1, nCars) * 40);
  const ix = new Uint16Array(CAP * 6); for (let s = 0; s < CAP; s++) { const b = s * 4, o = s * 6; ix[o] = b; ix[o + 1] = b + 1; ix[o + 2] = b + 2; ix[o + 3] = b; ix[o + 4] = b + 2; ix[o + 5] = b + 3; }
  const mobile = matchMedia('(pointer:coarse)').matches || innerWidth < 700, N = TRACK.N, T = TRACK.T, ds = TRACK.ds;
  let ok = true, prog = null, U = null, vao = null, vb = null, head = 0, dStart = 0, dN = 0, clock = 0, maxDeath = 0, camX = 0, camZ = 0, aiLeft = 0, low = false, gfxLevel = 3, fe = 1 / 60, slow = 0, good = 0;
  function init() {
    const mk = (t, s) => { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    prog = gl.createProgram(); gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    U = {}; for (const n of ['uVP', 'uCam', 'uFog', 'uCol', 'uT', 'uFogD']) U[n] = gl.getUniformLocation(prog, n);
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, V, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, VPS, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, VPS, 12);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ix, gl.STATIC_DRAW);
    gl.bindVertexArray(null); dStart = head % CAP; dN = 0;
  }
  try { init(); } catch (e) { ok = false; console.warn('Traces de pneus désactivées', e); }
  R.canvas.addEventListener('webglcontextrestored', () => { if (!ok) return; try { init(); } catch (e) { ok = false; } });
  function seg(lx0, lz0, rx0, rz0, y0, lx1, lz1, rx1, rz1, y1, a0, a1, col, life) {
    let slot = head % CAP;
    if (head >= CAP) {
      // Protection anti-disparition visuelle : si ce segment est à moins de 50m de la caméra,
      // chercher un slot distant/hors champ pour ne pas voir de trace disparaître sous les yeux
      const sx = V[slot * VPS], sz = V[slot * VPS + 2];
      const dx = sx - camX, dz = sz - camZ;
      if (dx * dx + dz * dz < 2500) {
        for (let s = 1; s < 120; s++) {
          const tSlot = (slot + s) % CAP;
          const tx = V[tSlot * VPS], tz = V[tSlot * VPS + 2];
          const tdx = tx - camX, tdz = tz - camZ;
          if (tdx * tdx + tdz * tdz >= 3600) { slot = tSlot; break; }
        }
      }
    }
    const o = slot * VPS, t1 = clock + life, t0 = t1 - SK.FADE; if (t1 > maxDeath) maxDeath = t1;
    V[o] = lx0; V[o + 1] = y0; V[o + 2] = lz0; V[o + 3] = a0; V[o + 4] = t0; V[o + 5] = t1; V[o + 6] = col;
    V[o + 7] = rx0; V[o + 8] = y0; V[o + 9] = rz0; V[o + 10] = a0; V[o + 11] = t0; V[o + 12] = t1; V[o + 13] = col;
    V[o + 14] = rx1; V[o + 15] = y1; V[o + 16] = rz1; V[o + 17] = a1; V[o + 18] = t0; V[o + 19] = t1; V[o + 20] = col;
    V[o + 21] = lx1; V[o + 22] = y1; V[o + 23] = lz1; V[o + 24] = a1; V[o + 25] = t0; V[o + 26] = t1; V[o + 27] = col;
    head++; if (dN < CAP) dN++;
  }
  const sub = (slot, n) => { if (n > 0) gl.bufferSubData(gl.ARRAY_BUFFER, slot * VPS * 4, V, slot * VPS, n * VPS); };
  function wheel(o, k, ph, p, S, I, cs, sn, csF, snF, ai, mv) {
    const on = st[o] > 0;
    geo(o, k, ph, p, S, cs, sn, csF, snF);
    if (mv && G.sf >= 2 && I < .55) I = .55;   // roue sur gravier / herbe : trace dès le contact, sans glissement requis
    const minSlip = ai ? (on ? .25 : .40) : (on ? .08 : .16);
    if (!(I > minSlip)) {
      if (!on) return; st[o] = 0;
      return tail(o, ai);
    }
    const sf = G.sf, a = AMAX[sf] * (.25 + .75 * I), life = (ai ? SK.LIFE_AI : SK.LIFE_P) * (gfxLevel < 2 ? .6 : 1);
    if (!on) { put(o, 0); return; }
    const dx = G.cx - st[o + 1], dz = G.cz - st[o + 2], dd = dx * dx + dz * dz, m = (ai ? SK.MIN_AI : SK.MIN_P) * (gfxLevel < 2 ? 1.8 : 1);
    if (dd < m * m) return;
    if (dd > 64) { put(o, 0); return; }
    if (ai && aiLeft <= 0) return; if (ai) aiLeft--;
    seg(st[o + 3], st[o + 4], st[o + 5], st[o + 6], st[o + 8], G.lx, G.lz, G.rx, G.rz, G.y, st[o + 7], a, sf, life);
    put(o, a);
  }
  function tail(o, ai) {
    const dx = G.cx - st[o + 1], dz = G.cz - st[o + 2], dd = dx * dx + dz * dz;
    if (dd < .0004 || dd > 64 || (ai && aiLeft <= 0)) return; if (ai) aiLeft--;
    seg(st[o + 3], st[o + 4], st[o + 5], st[o + 6], st[o + 8], G.lx, G.lz, G.rx, G.rz, G.y, st[o + 7], 0, G.sf, (ai ? SK.LIFE_AI : SK.LIFE_P) * (gfxLevel < 2 ? .6 : 1));
  }
  const G = { cx: 0, cz: 0, lx: 0, lz: 0, rx: 0, rz: 0, y: 0, sf: 0 };
  function geo(o, k, ph, p, S, cs, sn, csF, snF) {
    const front = k < 2, side = k & 1 ? 1 : -1, hw = (S.tw || DEF.tw) / 2, fwd = front ? (S.a || DEF.a) : -(S.b || DEF.b);
    G.cx = p.x + cs * fwd - sn * side * hw; G.cz = p.z + sn * fwd + cs * side * hw;
    const c = front ? csF : cs, s = front ? snF : sn, bw = front ? .15 : .17;
    G.lx = G.cx + s * bw; G.lz = G.cz - c * bw; G.rx = G.cx - s * bw; G.rz = G.cz + c * bw;
    const i = ((ph.s / ds) | 0) % N, th = p.psi - Math.atan2(T[i * 2 + 1], T[i * 2]);
    tmp.i = i < 0 ? i + N : i; tmp.s = ph.s; tmp.lat = ph.lat + side * hw * Math.cos(th) + fwd * Math.sin(th);
    G.sf = surface(tmp); G.y = p.y + YO[G.sf];
  }
  function put(o, a) { st[o] = 1; st[o + 1] = G.cx; st[o + 2] = G.cz; st[o + 3] = G.lx; st[o + 4] = G.lz; st[o + 5] = G.rx; st[o + 6] = G.rz; st[o + 7] = a; st[o + 8] = G.y; }
  return {
    clear() { head = dN = dStart = 0; maxDeath = 0; V.fill(0); st.fill(0); if (ok) { gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, V, gl.DYNAMIC_DRAW); } },
    get low() { return low; }, set low(v) { low = !!v; },
    get gfxLevel() { return gfxLevel; }, set gfxLevel(v) { gfxLevel = Math.max(0, Math.min(4, +v || 0)); low = gfxLevel < 2; },
    begin(dt, cam) {
      if (dt > 0) { clock += dt; fe += (dt - fe) * .05; /* qualité gérée par GFX (gfx.js) — mobile auto-low désactivé */ }
      camX = cam.pos[0]; camZ = cam.pos[2]; dStart = head % CAP; dN = 0; aiLeft = gfxLevel < 2 ? SK.AI_FRAME_LOW : SK.AI_FRAME;
    },
    car(slot, ph, pose) {
      if (!ok || slot * 40 + 40 > st.length) return;
      const p = pose || ph, ai = slot > 0, b = slot * 40, dx = p.x - camX, dz = p.z - camZ, far = gfxLevel < 2 ? SK.FAR_LOW : SK.FAR_AI;
      if (ai && dx * dx + dz * dz > far * far) { st[b] = st[b + 10] = st[b + 20] = st[b + 30] = 0; return; }
      const S = ph.sheet || DEF, u = ph.u || 0, w = ph.w || 0, r = ph.r || 0, sp = Math.hypot(u, w);
      let iF = ph.skF || 0, iR = ph.skR || 0, sa = ph.sa;
      if (sp > 6) {
        const a = S.a || DEF.a, bb = S.b || DEF.b, ue = Math.max(Math.abs(u), 3), su = u < 0 ? -1 : 1, us = S.understeer ?? DEF.understeer, os = S.oversteer ?? DEF.oversteer, vs = cl((sp - 6) / 8, 0, 1);
        if (typeof sa !== 'number') sa = Math.atan((a + bb) * r / (u < 0 ? Math.min(u, -2.5) : Math.max(u, 2.5)));
        const af = Math.atan2(w + a * r, ue) - sa * su, ar = Math.atan2(w - bb * r, ue);
        iF = Math.max(iF, cl((Math.abs(af) - (.12 + .05 * us) * 1.15) / .17, 0, 1) * vs); iR = Math.max(iR, cl((Math.abs(ar) - (.075 + .02 * os) * 1.15) / .17, 0, 1) * vs);
      }
      if (typeof sa !== 'number') sa = 0;
      if (!(sp > 2.5 || iF > 0 || iR > 0 || st[b] > 0 || st[b + 10] > 0 || st[b + 20] > 0 || st[b + 30] > 0)) return;
      const cs = Math.cos(p.psi), sn = Math.sin(p.psi), h = p.psi + sa, csF = Math.cos(h), snF = Math.sin(h);
      for (let k = 0; k < 4; k++) wheel(b + k * 10, k, ph, p, S, k < 2 ? iF : iR, cs, sn, csF, snF, ai, sp > 2.5);
    },
    draw(cam) {
      if (!ok || R.lost || !head || clock >= maxDeath) return;
      gl.useProgram(prog); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      if (dN > 0) { if (dStart + dN <= CAP) sub(dStart, dN); else { sub(dStart, CAP - dStart); sub(0, dStart + dN - CAP); } dN = 0; dStart = head % CAP; }
      gl.uniformMatrix4fv(U.uVP, false, cam.vp); gl.uniform3fv(U.uCam, cam.pos); gl.uniform3fv(U.uFog, SKY.hor); gl.uniform3fv(U.uCol, COL); gl.uniform1f(U.uT, clock); gl.uniform1f(U.uFogD, .0006);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2);
      gl.drawElements(gl.TRIANGLES, Math.min(head, CAP) * 6, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
    },
  };
}
