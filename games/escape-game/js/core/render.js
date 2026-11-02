// Escape Game · rendu WebGL1 : un shader, cubes à couleurs de face, quads de texte
const VS = `attribute vec3 aP,aN;attribute float aF;attribute vec2 aUV;
uniform mat4 uVP;uniform vec3 uPos,uSc;uniform vec3 uC[6];
varying vec3 vW,vN,vC;varying vec2 vUV;
void main(){vec3 w=aP*uSc+uPos;vW=w;vN=aN;vC=uC[int(aF+.5)];vUV=aUV;gl_Position=uVP*vec4(w,1.);}`;
const FS = `precision mediump float;
varying vec3 vW,vN,vC;varying vec2 vUV;
uniform vec3 uL,uE;uniform float uGlow,uTex,uFlat;uniform sampler2D uT;
void main(){
vec3 g=uGlow*vec3(.8,.7,.25);
if(uTex>.5){if(dot(vN,uE-vW)<=0.)discard;vec4 t=texture2D(uT,vUV);gl_FragColor=vec4(t.rgb+g,t.a);return;}
if(uFlat>.5){gl_FragColor=vec4(vC+g,1.);return;}
vec3 n=normalize(vN),lp=uL-vW,ep=uE-vW;float d=length(lp),e=length(ep);
vec3 L=vec3(.07,.075,.095)+vec3(.085,.08,.075)*max(dot(n,normalize(vec3(.35,.8,.45))),0.)
+vec3(1.,.8,.52)*2.3*max(dot(n,lp/d),0.)/(1.+.13*d*d)
+vec3(1.,.8,.55)*.3*max(dot(n,ep/e),0.)/(1.+1.6*e*e);
gl_FragColor=vec4(vC*L+g,1.);}`;

// cadran : fond crème, graduations, petite aiguille (heure, avance avec les minutes) et grande aiguille (minutes)
const drawClock = (x, { h, m }) => {
    const R = 60, P = Math.PI, pt = (a, r) => [Math.sin(a) * r, -Math.cos(a) * r];
    x.save(); x.translate(64, 64); x.lineCap = 'round';
    x.fillStyle = '#d8cca6'; x.beginPath(); x.arc(0, 0, R, 0, 2 * P); x.fill();
    x.strokeStyle = '#3a2616'; x.lineWidth = 5; x.stroke();
    for (let i = 0; i < 12; i++) {
        const a = i * P / 6, big = i % 3 === 0, p0 = pt(a, big ? R - 20 : R - 14), p1 = pt(a, R - 7);
        x.lineWidth = big ? 4 : 2; x.beginPath(); x.moveTo(p0[0], p0[1]); x.lineTo(p1[0], p1[1]); x.stroke();
    }
    x.strokeStyle = '#1a120c';
    const hand = (a, len, w) => { const p = pt(a, len); x.lineWidth = w; x.beginPath(); x.moveTo(0, 0); x.lineTo(p[0], p[1]); x.stroke(); };
    hand(((h % 12) + m / 60) * P / 6, R * .5, 9); hand(m * P / 30, R * .8, 5);
    x.fillStyle = '#1a120c'; x.beginPath(); x.arc(0, 0, 6, 0, 2 * P); x.fill();
    x.restore();
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mul = (a, b) => {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
    return o;
};

export function initGL(cv) {
    const gl = cv.getContext('webgl', { antialias: true, alpha: false }) || cv.getContext('experimental-webgl');
    if (!gl) return null;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    const pg = gl.createProgram(); gl.attachShader(pg, vs); gl.attachShader(pg, fs); gl.linkProgram(pg);
    if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) return null;
    gl.useProgram(pg);

    const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], vt = [], ix = [];
    FACES.forEach((n, f) => {
        const side = n[1] === 0, u = side ? cross([0, 1, 0], n) : [1, 0, 0], v = side ? [0, 1, 0] : [0, 0, n[1] > 0 ? -1 : 1];
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => {
            vt.push(n[0] * .5 + (u[0] * a + v[0] * b) * .5, n[1] * .5 + (u[1] * a + v[1] * b) * .5, n[2] * .5 + (u[2] * a + v[2] * b) * .5,
                n[0], n[1], n[2], f, a * .5 + .5, b * .5 + .5);
        });
        ix.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
    });
    const vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vt), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ix), gl.STATIC_DRAW);
    [['aP', 3, 0], ['aN', 3, 12], ['aF', 1, 24], ['aUV', 2, 28]].forEach(([n, s, o]) => {
        const l = gl.getAttribLocation(pg, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, s, gl.FLOAT, false, 36, o);
    });
    const U = {};
    ['uVP', 'uPos', 'uSc', 'uC[0]', 'uL', 'uGlow', 'uTex', 'uT', 'uE', 'uFlat'].forEach((n) => { U[n] = gl.getUniformLocation(pg, n); });
    gl.uniform1i(U.uT, 0);
    gl.enable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const mkTex = (text, k, ck) => {
        const c = document.createElement('canvas'); c.width = 128; c.height = ck ? 128 : 64;
        const x = c.getContext('2d'), ls = text.split('\n'); let fs = ls.length > 1 ? 30 : 46; const F = () => { x.font = 'bold ' + fs + 'px "Trebuchet MS",Arial,sans-serif'; }; F();
        while (Math.max(...ls.map((l) => x.measureText(l).width)) > 112 && fs > 12) { fs -= 2; F(); }
        x.textAlign = 'center'; x.textBaseline = 'middle';
        if (k) { x.fillStyle = 'rgba(18,12,9,.86)'; x.fillRect(0, 0, 128, 64); x.strokeStyle = 'rgba(227,176,98,.85)'; x.lineWidth = 3; x.strokeRect(2, 2, 124, 60); x.fillStyle = '#f3e6c4'; }
        else x.fillStyle = 'rgba(176,170,152,.5)';
        ls.forEach((l, i) => x.fillText(l, 64, 34 + (i - (ls.length - 1) / 2) * fs * 1.15));
        if (ck) drawClock(x, ck);
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    };
    const blank = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    let cur = null, texs = [];
    const R = {
        resize() {
            const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
            cv.width = Math.max(2, Math.round(r.width * d)); cv.height = Math.max(2, Math.round(r.height * d));
        },
        draw(room, cam, glow) {
            if (cur !== room) { texs.forEach((t) => gl.deleteTexture(t)); texs = room.quads.map((q) => mkTex(q.text, q.k, q.clock)); cur = room; }
            const W = cv.width, Hh = cv.height, asp = W / Hh, ty = Math.max(.55, .75 / asp), f = 1 / ty, nr = .05, fr = 40;
            const P = new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (fr + nr) / (nr - fr), -1, 0, 0, 2 * fr * nr / (nr - fr), 0]);
            const cp = Math.cos(cam.pitch), fw = [Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp], e = [cam.x, 1.6, cam.z];
            const xr = norm(cross(fw, [0, 1, 0])), yr = cross(xr, fw);
            const V = new Float32Array([xr[0], yr[0], -fw[0], 0, xr[1], yr[1], -fw[1], 0, xr[2], yr[2], -fw[2], 0,
                -(xr[0] * e[0] + xr[1] * e[1] + xr[2] * e[2]), -(yr[0] * e[0] + yr[1] * e[1] + yr[2] * e[2]), fw[0] * e[0] + fw[1] * e[1] + fw[2] * e[2], 1]);
            gl.viewport(0, 0, W, Hh); gl.clearColor(.02, .015, .014, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.uniformMatrix4fv(U.uVP, false, mul(P, V)); gl.uniform3fv(U.uL, room.lamp); gl.uniform3f(U.uE, e[0], e[1], e[2]);
            gl.disable(gl.BLEND); gl.uniform1f(U.uTex, 0); gl.uniform1f(U.uFlat, 0); gl.bindTexture(gl.TEXTURE_2D, blank);
            for (const c of room.cubes()) {
                gl.uniform3fv(U.uPos, c.p); gl.uniform3fv(U.uSc, c.s); gl.uniform3fv(U['uC[0]'], c.c);
                gl.uniform1f(U.uFlat, c.c.fl ? 1 : 0); gl.uniform1f(U.uGlow, c.o === glow ? .28 : 0); gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
            }
            gl.enable(gl.BLEND); gl.uniform1f(U.uTex, 1); gl.depthMask(false);
            room.quads.forEach((q, i) => {
                gl.bindTexture(gl.TEXTURE_2D, texs[i]); gl.uniform3fv(U.uPos, q.p); gl.uniform3fv(U.uSc, q.s);
                gl.uniform1f(U.uGlow, 0); gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
            });
            gl.depthMask(true);
        },
    };
    return R;
}
