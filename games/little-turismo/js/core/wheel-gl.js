// Roues avant 3D (WebGL2) vues du poste de pilotage : même méthode que cockpit-f1.js — pneu en révolution (profil jante / flanc / bande de roulement),
// éclairage identique, projection fixe inclinée vers le bas, roues qui braquent (axe Y) et tournent (axe X) avec la vitesse.
// Paramétrable (rayon, position, braquage max) pour d'autres véhicules ; aucun tampon ni matrice créé après l'initialisation.
const T = 1 / .637, PITCH = .175, TAU = 6.2832;
const mul = (o, a, b) => { for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[4 * r + c] = a[c] * b[4 * r] + a[4 + c] * b[4 * r + 1] + a[8 + c] * b[4 * r + 2] + a[12 + c] * b[4 * r + 3]; };
// profil [rayon, demi-largeur] pour un rayon 0,333 (identique à la F1) ; mis à l'échelle par `k`
const HALF = [[0, .09], [.08, .096], [.14, .108], [.172, .122], [.19, .132], [.215, .15], [.25, .158], [.285, .153], [.31, .14], [.325, .11], [.331, .07], [.333, 0]];
const VS = '#version 300 es\nin vec3 p,n;in vec4 c;uniform mat4 M,V;out vec3 w,q;out vec4 k;\nvoid main(){vec4 a=M*vec4(p,1);w=a.xyz;q=mat3(M)*n;k=c;gl_Position=V*a;}';
const FS = '#version 300 es\nprecision mediump float;in vec3 w,q;in vec4 k;out vec4 o;uniform float B;\nvoid main(){vec3 n=normalize(q),v=normalize(-w),l=normalize(vec3(-.3,.9,.35)),h=normalize(l+v);\nfloat d=.3+.7*smoothstep(-.6,.9,n.y);\no=vec4((k.rgb*d+vec3(.8,.85,.9)*(pow(max(dot(n,h),0.),24.)*.2+pow(1.-abs(dot(n,v)),5.)*.08))*B,1);}';

/** opts : { k (échelle du pneu, 1 = F1), x, y, z (position d'une roue, +x = droite), lock (braquage max, rad), tint ([r,g,b] bande de flanc), body ([r,g,b] livrée : plancher / nez) }
 *  En plus des roues : plancher (là où se posent les pieds) qui s'effile en nez, et bras de liaison (tubes, comme les bras de suspension F1) vers les moyeux. */
export function createWheelGL(parent, before, opts = {}) {
  const k = opts.k ?? .52, wx = opts.x ?? .5, wy = opts.y ?? -.6, wz = opts.z ?? .9, lock = opts.lock ?? .5, tint = opts.tint || [.62, .64, .68], rad = .333 * k, body = opts.body || [.1, .3, .9];
  const cv = document.createElement('canvas'); cv.className = 'kartgl kartwl';
  cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:block';
  parent.insertBefore(cv, before || null);
  const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) { cv.remove(); return null; }
  const pr = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h); gl.attachShader(pr, h); }
  ['p', 'n', 'c'].forEach((a, i) => gl.bindAttribLocation(pr, i, a)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { cv.remove(); return null; }
  gl.useProgram(pr);
  // maillage : profil complet (flanc + bande de roulement + flanc), 32 segments autour de l'axe ; couleurs par anneau comme sur la F1
  const prof = [...HALF, ...HALF.slice(0, -1).reverse().map(([r, a]) => [r, -a])], np = prof.length, vb = [], ib = [];
  for (let e = 0; e < np; e++) {
    const a0 = prof[Math.max(0, e - 1)], a1 = prof[Math.min(np - 1, e + 1)], dr = a1[0] - a0[0], da = a1[1] - a0[1], len = Math.hypot(dr, da) || 1, nr = -da / len, na = dr / len, l = Math.min(e, np - 1 - e);
    for (let i = 0; i <= 32; i++) {
      const th = i / 32 * TAU, co = Math.cos(th), si = Math.sin(th), blk = l > 8 ? 1 + .1 * (i >> 1 & 1) : 1;
      const col = l < 3 ? [.09, .095, .105] : l === 3 ? [.3, .31, .33] : l === 5 || l === 6 ? tint.map((v) => v * .55) : [.05 * blk, .05 * blk, .056 * blk];
      vb.push(prof[e][1] * k, prof[e][0] * k * co, prof[e][0] * k * si, na, nr * co, nr * si, col[0], col[1], col[2], 0);
    }
  }
  for (let e = 0; e < np - 1; e++) for (let i = 0; i < 32; i++) { const a = e * 33 + i, b = (e + 1) * 33 + i; ib.push(a, b, a + 1, a + 1, b, b + 1); }
  const wheelCount = ib.length;
  // plancher : bandes en travers (bords sombres arrondis, dessus à la livrée), du bas de l'écran jusqu'au nez
  const dk = body.map((v) => v * .42), SEC = [[.45, .3, -.665], [.9, .3, -.665], [1.4, .32, -.655], [1.9, .35, -.645], [2.25, .34, -.635], [2.42, .22, -.63], [2.5, .08, -.63]], X5 = [-1, -.62, 0, .62, 1], base = vb.length / 10;
  for (const [z, w, y] of SEC) for (let j = 0; j < 5; j++) { const u = X5[j], e = Math.abs(u) > .9, m = Math.abs(u) > .5, c = e ? dk : m ? body.map((v, q) => v * .7 + dk[q] * .3) : body; vb.push(u * w, y - (e ? .02 : m ? .007 : 0), z, u * (e ? .8 : m ? .35 : 0), 1, 0, c[0], c[1], c[2], 0); }
  for (let r = 0; r < SEC.length - 1; r++) for (let j = 0; j < 4; j++) { const a = base + r * 5 + j, b = a + 5; ib.push(a, b, a + 1, a + 1, b, b + 1); }
  // bras de liaison : tubes (8 pans) du plancher vers l'avant et l'arrière de chaque moyeu
  const tube = (p, q, r, col) => {
    let dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2]; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    let ax = 0, ay = 1, az = 0; if (Math.abs(dy) > .9) { ax = 1; ay = 0; }
    let ux = dy * az - dz * ay, uy = dz * ax - dx * az, uz = dx * ay - dy * ax; const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux, b0 = vb.length / 10;
    for (const e of [p, q]) for (let i = 0; i <= 8; i++) { const t = i / 8 * TAU, c = Math.cos(t), si = Math.sin(t), nx = ux * c + vx * si, ny = uy * c + vy * si, nz = uz * c + vz * si; vb.push(e[0] + nx * r, e[1] + ny * r, e[2] + nz * r, nx, ny, nz, col[0], col[1], col[2], 0); }
    for (let i = 0; i < 8; i++) ib.push(b0 + i, b0 + 9 + i, b0 + i + 1, b0 + i + 1, b0 + 9 + i, b0 + 10 + i);
  };
  const hx = wx - .075 * k / .52;   // face intérieure du pneu
  for (const sd of [-1, 1]) { tube([sd * .26, -.655, .5], [sd * hx, wy, wz - .09], .02, [.22, .23, .25]); tube([sd * .3, -.65, 1.5], [sd * hx, wy, wz + .09], .02, [.22, .23, .25]); }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vb), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ib), gl.STATIC_DRAW);
  [[3, 0], [3, 12], [4, 24]].forEach(([n, o], i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 40, o); });
  gl.enable(gl.DEPTH_TEST);
  const uM = gl.getUniformLocation(pr, 'M'), uV = gl.getUniformLocation(pr, 'V'), uB = gl.getUniformLocation(pr, 'B'), count = wheelCount, total = ib.length;
  const P = new Float32Array(16), Vr = new Float32Array(16), VP = new Float32Array(16), Dm = new Float32Array(16), Rm = new Float32Array(16), Mm = new Float32Array(16), Id = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const cp = Math.cos(PITCH), sp = Math.sin(PITCH); Vr.set([1, 0, 0, 0, 0, cp, -sp, 0, 0, sp, cp, 0, 0, 0, 0, 1]); Rm[0] = Rm[15] = 1; Dm[5] = Dm[15] = 1;
  let dirty = true, spin = 0, last = performance.now(), W = 0, H = 0;
  addEventListener('resize', () => { dirty = true; });
  const one = (px, py, st) => {
    const c = Math.cos(st), s = Math.sin(st); Dm[0] = c; Dm[2] = -s; Dm[8] = s; Dm[10] = c;
    mul(Mm, Dm, Rm); Mm[12] = px; Mm[13] = py; Mm[14] = wz; gl.uniformMatrix4fv(uM, false, Mm); gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
  };
  return {
    canvas: cv, wx, wy, wz, T,
    /** steer −1..1 (+ = droite), kmh, ox/oy : décalage châssis (px écran/unité) en unités H/100, s = px par unité, bright 0..1 (météo). */
    draw(steer, kmh, ox, oy, s, bright) {
      const cw = cv.clientWidth, ch = cv.clientHeight; if (!cw || !ch) return;
      if (dirty || cw !== W || ch !== H) {
        const d = Math.min(devicePixelRatio || 1, 1.5); W = cw; H = ch; dirty = false; cv.width = Math.round(cw * d); cv.height = Math.round(ch * d); gl.viewport(0, 0, cv.width, cv.height);
        P.fill(0); P[0] = T * ch / cw; P[5] = T; P[10] = 5.05 / 4.95; P[11] = 1; P[14] = -.5 / 4.95; mul(VP, P, Vr); gl.uniformMatrix4fv(uV, false, VP);
      }
      const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
      spin = (spin + kmh / 3.6 / rad * dt) % TAU; const a = Math.cos(spin), b = Math.sin(spin); Rm[5] = Rm[10] = a; Rm[6] = b; Rm[9] = -b;
      P[8] = ox * s * 2 / cw; P[9] = -oy * s * 2 / ch; mul(VP, P, Vr); gl.uniformMatrix4fv(uV, false, VP);   // décalage de châssis (inertie) appliqué à l'écran, pour toutes les pièces
      gl.uniform1f(uB, bright);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      one(-wx, wy, steer * lock); one(wx, wy, steer * lock);
      gl.uniformMatrix4fv(uM, false, Id); gl.drawElements(gl.TRIANGLES, total - count, gl.UNSIGNED_SHORT, count * 2);
    },
  };
}
