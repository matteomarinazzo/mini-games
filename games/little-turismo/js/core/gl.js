// Couche WebGL2 maison : contexte, shaders (pos/normale/couleur + lumière directionnelle + brouillard), ciel, caméra, perte de contexte.
const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC;
uniform mat4 uVP, uM; uniform vec3 uCam, uSun, uSunC, uAmb, uBody;
out vec3 vC; out float vD;
void main(){ vec4 w=uM*vec4(aP,1.); vec3 n=normalize(mat3(uM)*aN);
 vec3 c=aC.r<0.?uBody*(-aC.r):aC; vC=c*(uAmb+uSunC*max(dot(n,uSun),0.)); vD=distance(w.xyz,uCam); gl_Position=uVP*w; }`;
const FS = `#version 300 es
precision mediump float; in vec3 vC; in float vD; uniform vec3 uFog; uniform float uFogD, uAl; out vec4 o;
void main(){ o=vec4(mix(vC,uFog,1.-exp(-vD*uFogD)),uAl); }`;
const SVS = `#version 300 es
out vec2 vP; void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); vP=p*2.-1.; gl_Position=vec4(vP,1.,1.); }`;
const SFS = `#version 300 es
precision mediump float; in vec2 vP; uniform vec3 uF,uR,uU,uSun,uHor,uZen; uniform float uT,uA; out vec4 o;
void main(){ vec3 d=normalize(uF+uR*vP.x*uT*uA+uU*vP.y*uT);
 vec3 c=mix(uHor,uZen,pow(clamp(d.y,0.,1.),.55)); float s=max(dot(d,uSun),0.);
 c+=vec3(1.,.85,.6)*(pow(s,300.)*.9+pow(s,10.)*.18); o=vec4(c,1.); }`;

const SUN = (() => { const v = [.45, .75, .35], l = Math.hypot(...v); return v.map((x) => x / l); })();
export const SKY = { hor: [.72, .82, .92], zen: [.2, .42, .78] };

export function createCamera(fov = 65, near = .5, far = 5000) {
  const c = { fov, near, far, aspect: 1, pos: [0, 0, 0], f: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0], vp: new Float32Array(16) };
  c.look = (ex, ey, ez, tx, ty, tz) => {
    let fx = tx - ex, fy = ty - ey, fz = tz - ez; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    c.pos = [ex, ey, ez]; c.f = [fx, fy, fz]; c.r = [rx, 0, rz]; c.u = [ux, uy, uz];
    const V = [rx, ux, -fx, 0, 0, uy, -fy, 0, rz, uz, -fz, 0, -(rx * ex + rz * ez), -(ux * ex + uy * ey + uz * ez), fx * ex + fy * ey + fz * ez, 1];
    const t = 1 / Math.tan(c.fov * Math.PI / 360), n = c.near, f = c.far;
    const Pm = [t / c.aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) { let s = 0; for (let k = 0; k < 4; k++) s += Pm[k * 4 + row] * V[col * 4 + k]; c.vp[col * 4 + row] = s; }
  };
  return c;
}
const WHITE = [1, 1, 1];
export const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/** Matrice modèle : colonnes droite, haut, avant (vecteurs 3), position. */
export function basis(m, r, u, f, p) { m.set([r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, f[0], f[1], f[2], 0, p[0], p[1], p[2], 1]); return m; }

function prog(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h);
    if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h));
    gl.attachShader(p, h);
  }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
  return { p, u };
}

export function createGL(canvas, { onLost, onRestored } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const R = { gl, canvas, lost: false, scale: Math.min(devicePixelRatio || 1, 1.5), meshes: [], w: 1, h: 1 };
  let M, S;
  const init = () => { M = prog(gl, VS, FS); S = prog(gl, SVS, SFS); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); R.vaoE = gl.createVertexArray(); };
  R.upload = (m) => {
    m.vao = gl.createVertexArray(); gl.bindVertexArray(m.vao);
    m.vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STATIC_DRAW);
    for (let a = 0; a < 3; a++) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 36, a * 12); }
    m.ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  };
  /** data = { v: Float32Array (pos3 nor3 col3), i: Uint32Array } */
  R.mesh = (data) => { const m = { v: data.v, i: data.i, count: data.i.length }; R.upload(m); R.meshes.push(m); return m; };
  R.resize = (scale = R.scale) => {
    R.scale = scale; const r = canvas.getBoundingClientRect();
    R.w = canvas.width = Math.max(2, Math.round((canvas.offsetWidth || r.width) * scale)); R.h = canvas.height = Math.max(2, Math.round((canvas.offsetHeight || r.height) * scale));
    gl.viewport(0, 0, R.w, R.h); return R.w / R.h;
  };
  /** Efface, dessine le ciel, prépare le programme principal. */
  R.begin = (cam) => {
    gl.viewport(0, 0, R.w, R.h); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(S.p); gl.disable(gl.DEPTH_TEST);
    const u = S.u; gl.uniform3fv(u.uF, cam.f); gl.uniform3fv(u.uR, cam.r); gl.uniform3fv(u.uU, cam.u); gl.uniform3fv(u.uSun, SUN);
    gl.uniform3fv(u.uHor, SKY.hor); gl.uniform3fv(u.uZen, SKY.zen); gl.uniform1f(u.uT, Math.tan(cam.fov * Math.PI / 360)); gl.uniform1f(u.uA, cam.aspect);
    gl.bindVertexArray(R.vaoE); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.useProgram(M.p);
    const m = M.u; gl.uniformMatrix4fv(m.uVP, false, cam.vp); gl.uniform3fv(m.uCam, cam.pos); gl.uniform3fv(m.uSun, SUN);
    gl.uniform3f(m.uSunC, .85, .78, .65); gl.uniform3f(m.uAmb, .42, .48, .58); gl.uniform3fv(m.uFog, SKY.hor); gl.uniform1f(m.uFogD, .0006); gl.uniform1f(m.uAl, 1);
  };
  R.draw = (mesh, model = IDENT, body = WHITE) => {
    gl.uniformMatrix4fv(M.u.uM, false, model); gl.uniform3fv(M.u.uBody, body); gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  };

  R.drawRange = (mesh, model = IDENT, body = WHITE, first = 0, count = mesh.count) => {
    gl.uniformMatrix4fv(M.u.uM, false, model); gl.uniform3fv(M.u.uBody, body); gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, first * 4);
  };

  /** Objet semi-transparent (fumée) : blending alpha, écriture de profondeur coupée, restauré ensuite. */
  R.drawAlpha = (mesh, model = IDENT, body = WHITE, alpha = .5) => {
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniform1f(M.u.uAl, alpha); R.draw(mesh, model, body);
    gl.uniform1f(M.u.uAl, 1); gl.depthMask(true); gl.disable(gl.BLEND);
  };

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R.lost = true; onLost && onLost(); });
  canvas.addEventListener('webglcontextrestored', () => { init(); R.meshes.forEach(R.upload); R.resize(); R.lost = false; onRestored && onRestored(); });
  init(); R.resize();
  return R;
}