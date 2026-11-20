// WebGL1 maison : un programme (ambiant + une directionnelle + spéculaire de balle), boîtes batchées, balle/ombre/flèche en meshes à uniforms. Aucune texture.
// La coupe : feutre percé par discard dans le cylindre (uCup), paroi + fond en géométrie, bord clair en maillage à part.
(function () {
  const M = window.Minigolf = window.Minigolf || {};
  const VS = 'attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;attribute float aM;uniform mat4 uVP;uniform vec3 uOff;uniform vec3 uSc;uniform vec2 uRot;uniform vec2 uRotZ;uniform vec3 uMul;varying vec3 vC;varying vec3 vN;varying vec3 vW;varying float vM;' +
    'void main(){vec3 p=aP*uSc,n=aN;' +
    'p=vec3(uRotZ.x*p.x-uRotZ.y*p.y, uRotZ.y*p.x+uRotZ.x*p.y, p.z);n=vec3(uRotZ.x*n.x-uRotZ.y*n.y, uRotZ.y*n.x+uRotZ.x*n.y, n.z);' +
    'p=vec3(uRot.x*p.x+uRot.y*p.z, p.y, uRot.x*p.z-uRot.y*p.x);n=vec3(uRot.x*n.x+uRot.y*n.z, n.y, uRot.x*n.z-uRot.y*n.x);' +
    'vec3 w=p+uOff;float d=max(dot(n,normalize(vec3(.4,.8,.3))),0.);vC=aC*uMul*(.5+.62*d);vN=n;vW=w;vM=aM;gl_Position=uVP*vec4(w,1.);}';
  // uCup = (x, z, rayon, y du feutre) : le feutre est percé (discard) dans le cylindre de la coupe ; rayon 0 = pas de trou. vM : 1 feutre, 3 balle.
  const FS = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
    'varying vec3 vC;varying vec3 vN;varying vec3 vW;varying float vM;uniform vec4 uCup;uniform vec3 uEye;' +
    'void main(){if(uCup.z>0.&&vN.y>.5&&abs(vW.y-uCup.w)<.05&&distance(vW.xz,uCup.xy)<uCup.z)discard;vec3 c=vC;' +
    'if(vM>.5&&vM<1.5){c*=1.+.06*sin(vW.x*7.3+sin(vW.z*5.1))*sin(vW.z*6.7+sin(vW.x*4.3));}' +
    'else if(vM>2.5){vec3 h=normalize(normalize(vec3(.4,.8,.3))+normalize(uEye-vW));c+=vec3(.55)*pow(max(dot(normalize(vN),h),0.),40.);}' +
    'gl_FragColor=vec4(c,1.);}';
  // Programme « flux » : plaques de vent/boost (flèches qui défilent dans le sens du souffle) et traînées de vent (rubans face caméra, alpha).
  // Attributs : aP position, aD direction (plaque) ou (t,s) (traînée), aR rectangle de la zone (plaque) ou (alpha) (traînée), aK vitesse de défilement (plaque) ou 0 (traînée).
  const VSF = 'attribute vec3 aP;attribute vec2 aD;attribute vec4 aR;attribute float aK;uniform mat4 uVP;varying vec3 vW;varying vec2 vD;varying vec4 vR;varying float vK;' +
    'void main(){vW=aP;vD=aD;vR=aR;vK=aK;gl_Position=uVP*vec4(aP,1.);}';
  const FSF = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
    'varying vec3 vW;varying vec2 vD;varying vec4 vR;varying float vK;uniform float uT;' +
    'void main(){if(vK<-1.5){float u=vD.x,f=fract(vD.y*2.),a=smoothstep(.2,.12,abs(f-(.72-abs(u)*.55)))*step(abs(u),.95)*vR.x;gl_FragColor=vec4(.7,.95,1.,a);return;}' +
    'if(vK<-.5){float u=vW.x-(vR.x+vR.z)*.5,w=vW.z-vR.y,e=min(min(vW.x-vR.x,vR.z-vW.x),min(vW.z-vR.y,vR.w-vW.z));float f=fract((w+abs(u)*.7)/.3),p=.6+.4*sin(uT*5.);' +
    'vec3 c=mix(vec3(.1,.17,.42),vec3(.5,.84,1.)*p,smoothstep(.36,.3,f));if(e<.07)c=vec3(.92,.94,.96);gl_FragColor=vec4(c,1.);return;}' +
    'if(vK<.5){float a=vR.x*smoothstep(0.,.45,vD.x)*(1.-vD.y*vD.y);gl_FragColor=vec4(.88,.97,1.,a*.8);return;}' +
    'vec2 d=vD,q=vec2(-d.y,d.x);float u=dot(vW.xz,d)-uT*(vK-1.),v=dot(vW.xz,q);float fu=fract(u/.5),fv=fract(v/.44)-.5;' +
    'float ar=smoothstep(.13,.08,abs(fu-(.78-abs(fv)*1.1)))*step(abs(fv),.34);' +
    'float e=min(min(vW.x-vR.x,vR.z-vW.x),min(vW.z-vR.y,vR.w-vW.z));' +
    'vec3 c=mix(vec3(.1,.36,.44),vec3(.74,.96,1.),ar*.92);c=mix(c,vec3(.62,.92,1.),smoothstep(.06,.03,e)*.85);gl_FragColor=vec4(c,1.);}';
  const SAND = [.78, .66, .42], SAND2 = [.74, .62, .38], ICE = [.74, .86, .9], ICE2 = [.68, .8, .86], BO1 = [.88, .55, .18], BO2 = [.7, .4, .12], PAD = [.93, .9, .8], WI1 = [.5, .66, .64], WI2 = [.44, .6, .58], WATER = [.16, .34, .46],
    PADA = [.5, .84, 1], PADB = [.1, .17, .42], PADF = [.92, .94, .96], BUMP = [.62, .2, .16], BUMPC = [.95, .9, .82], PCOL = [[.88, .5, .15], [.4, .62, .78], [.8, .72, .3], [.62, .38, .62]];
  const FELT = [.16, .45, .25], FELT2 = [.14, .41, .23], WT = [.62, .42, .22], WS = [.45, .28, .14], WE = [.3, .18, .09], RIM = [.92, .9, .82];
  const CURB = [.78, .60, .36], CURBS = [.55, .38, .20];   // bordure basse en biseau (bois clair biseauté)
  const MW1 = [.36, .22, .10], MW2 = [.66, .46, .24], MW3 = [.82, .65, .36];   // moulin : bois sombre / bois moyen / nervure claire
  // ── Décor ──
  const GR1 = [.22, .48, .18], GR2 = [.18, .42, .15], GR3 = [.26, .52, .20]; // herbe
  const TR1 = [.38, .24, .10], TR2 = [.30, .18, .08];                         // tronc
  const LF1 = [.18, .44, .14], LF2 = [.24, .52, .17], LF3 = [.14, .36, .10]; // feuillage
  const SK1 = [.36, .62, .84], SK2 = [.52, .74, .92], SK3 = [.68, .84, .96]; // ciel
  const FNC = [.70, .55, .32];                                                  // clôture
  const ST1 = [.52, .48, .44], ST2 = [.44, .40, .36];                         // pierre

  /** Génère les meshes de décor autour de h.poly (sol, arbres, buissons, clôture, dôme ciel). */
  function buildDecor(h) {
    const b = B(), sky = B();
    const xs = h.poly.map((p) => p[0]), zs = h.poly.map((p) => p[1]);
    const cx0 = Math.min(...xs), cx1 = Math.max(...xs), cz0 = Math.min(...zs), cz1 = Math.max(...zs);
    const mx = (cx0 + cx1) / 2, mz = (cz0 + cz1) / 2;
    const PAD_G = 18, FAR = 80; // padding sol herbe, rayon dôme ciel

    // ── Sol herbeux (plan large autour du terrain) ──
    const GX0 = mx - PAD_G, GX1 = mx + PAD_G, GZ0 = mz - PAD_G, GZ1 = mz + PAD_G;
    const GS = 4; // dalles de 4 m
    for (let xi = 0; xi < Math.ceil((GX1 - GX0) / GS); xi++) {
      for (let zi = 0; zi < Math.ceil((GZ1 - GZ0) / GS); zi++) {
        const x0 = GX0 + xi * GS, x1 = Math.min(GX1, x0 + GS), z0 = GZ0 + zi * GS, z1 = Math.min(GZ1, z0 + GS);
        const gc = ((xi ^ zi) & 1) ? GR2 : GR1;
        face(b, [0, 1, 0], [[x0, -.25, z0], [x1, -.25, z0], [x1, -.25, z1], [x0, -.25, z1]], gc);
      }
    }

    // ── Dôme ciel (hémisphère basse-poly, grand rayon, sans culling côté intérieur) ──
    const SR = FAR, SH = 32, nLat = 5, nLon = 16;
    const skyCols = [SK3, SK2, SK2, SK1, SK1]; // base→sommet : horizon clair, zenith saturé
    for (let i = 0; i < nLat; i++) {
      const a0 = (i / nLat) * Math.PI / 2, a1 = ((i + 1) / nLat) * Math.PI / 2;
      const c0 = skyCols[i], c1 = skyCols[Math.min(i + 1, skyCols.length - 1)];
      for (let j = 0; j < nLon; j++) {
        const t0 = (j / nLon) * 6.2832, t1 = ((j + 1) / nLon) * 6.2832;
        const p = (a, t) => [mx + SR * Math.cos(a) * Math.cos(t), SR * Math.sin(a) - 2, mz + SR * Math.cos(a) * Math.sin(t)];
        const P00 = p(a0, t0), P10 = p(a1, t0), P11 = p(a1, t1), P01 = p(a0, t1);
        // normale vers l'intérieur (inward)
        const nx = -(Math.cos(a0) * Math.cos((t0 + t1) / 2)), ny = -Math.sin(a0), nz = -(Math.cos(a0) * Math.sin((t0 + t1) / 2));
        face(sky, [nx, ny, nz], [P00, P01, P11, P10], [c0, c0, c1, c1]);
      }
    }
    // Plan horizon (anneau bas du dôme pour combler les gaps)
    const hRing = -1.5;
    for (let j = 0; j < nLon; j++) {
      const t0 = (j / nLon) * 6.2832, t1 = ((j + 1) / nLon) * 6.2832;
      const x0h = mx + SR * Math.cos(t0), z0h = mz + SR * Math.sin(t0), x1h = mx + SR * Math.cos(t1), z1h = mz + SR * Math.sin(t1);
      face(sky, [0, 1, 0], [[mx, hRing, mz], [x0h, hRing, z0h], [x1h, hRing, z1h], [x1h, hRing, z1h]], SK1);
    }

    // ── Nuages (quelques rectangles plats blancs en altitude) ──
    const clouds = [[-8, 22], [6, 18], [-4, 30], [9, 10], [3, 26]];
    for (const [ox, oz] of clouds) {
      const cw = 3 + Math.abs(ox * .2), cd = 1.2, cy = 7 + Math.abs(oz * .05);
      const CC = [.96, .97, 1.0];
      face(b, [0, -1, 0], [[mx + ox - cw / 2, cy, mz + oz - cd / 2], [mx + ox + cw / 2, cy, mz + oz - cd / 2], [mx + ox + cw / 2, cy, mz + oz + cd / 2], [mx + ox - cw / 2, cy, mz + oz + cd / 2]], CC);
      face(b, [0, 1, 0], [[mx + ox - cw / 2, cy, mz + oz - cd / 2], [mx + ox + cw / 2, cy, mz + oz - cd / 2], [mx + ox + cw / 2, cy, mz + oz + cd / 2], [mx + ox - cw / 2, cy, mz + oz + cd / 2]], CC);
    }

    // ── Arbres : tronc (cyl) + sphère feuillage ──
    // positions fixes relatives au centre du terrain, à l'extérieur du poly + marge
    const treeSeeds = [
      [-7, -3], [7, -2], [-8, 5], [8, 6], [-6, 11], [7, 13], [-5, 17], [9, 16],
      [-11, 2], [11, 4], [-10, 10], [10, 10], [-9, 14], [9, 1], [-13, 7], [13, 7],
      [0, -5], [2, 19], [-3, 20], [4, -4],
    ];
    for (const [ox, oz] of treeSeeds) {
      const tx = mx + ox, tz = mz + oz;
      // skip si trop proche du terrain
      if (tx > cx0 - 2 && tx < cx1 + 2 && tz > cz0 - 2 && tz < cz1 + 2) continue;
      if (tx < GX0 + 1 || tx > GX1 - 1 || tz < GZ0 + 1 || tz > GZ1 - 1) continue;
      const th = 1.5 + Math.abs(ox * .06);  // hauteur tronc
      const fr = .82 + Math.abs(oz * .03);   // rayon feuillage
      // tronc : base au sol (-0.25), sommet à th
      cyl(b, tx, tz, .09, -.25, th, TR2, TR1, 8);
      // feuillage : base à th - fr*0.35 pour chevaucher le sommet du tronc
      // 3 cônes superposés (pins), ou 3 niveaux de disques + manteau conique (feuillu)
      const fb = th - fr * .28;  // y de la base du feuillage (chevauche le haut du tronc)
      const lfc = (Math.abs(ox + oz) % 3 === 0) ? LF1 : (Math.abs(ox + oz) % 3 === 1) ? LF2 : LF3;
      // disque bas large
      disc(b, tx, tz, fr, () => fb, lfc, 12);
      // disque milieu
      disc(b, tx, tz, fr * .72, () => fb + fr * .52, lfc, 10);
      // disque haut
      disc(b, tx, tz, fr * .38, () => fb + fr * .92, lfc, 8);
      // manteau conique : faces latérales reliant chaque anneau — base → milieu, milieu → haut
      const nk = 10;
      for (let k = 0; k < nk; k++) {
        const a = k / nk * 6.2832, d = (k + 1) / nk * 6.2832, m = (a + d) / 2;
        // niveau bas → milieu
        face(b, [Math.cos(m), .4, Math.sin(m)],
          [[tx + Math.cos(a) * fr,        fb,            tz + Math.sin(a) * fr],
           [tx + Math.cos(d) * fr,        fb,            tz + Math.sin(d) * fr],
           [tx + Math.cos(d) * fr * .72,  fb + fr * .52, tz + Math.sin(d) * fr * .72],
           [tx + Math.cos(a) * fr * .72,  fb + fr * .52, tz + Math.sin(a) * fr * .72]], lfc);
        // niveau milieu → haut
        face(b, [Math.cos(m), .5, Math.sin(m)],
          [[tx + Math.cos(a) * fr * .72,  fb + fr * .52, tz + Math.sin(a) * fr * .72],
           [tx + Math.cos(d) * fr * .72,  fb + fr * .52, tz + Math.sin(d) * fr * .72],
           [tx + Math.cos(d) * fr * .38,  fb + fr * .92, tz + Math.sin(d) * fr * .38],
           [tx + Math.cos(a) * fr * .38,  fb + fr * .92, tz + Math.sin(a) * fr * .38]], lfc);
      }
      // pointe conique finale
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * 6.2832, d = (k + 1) / 8 * 6.2832, m = (a + d) / 2;
        face(b, [Math.cos(m), .7, Math.sin(m)],
          [[tx + Math.cos(a) * fr * .38,  fb + fr * .92, tz + Math.sin(a) * fr * .38],
           [tx + Math.cos(d) * fr * .38,  fb + fr * .92, tz + Math.sin(d) * fr * .38],
           [tx, fb + fr * 1.38, tz],
           [tx, fb + fr * 1.38, tz]], lfc);
      }
    }

    // ── Buissons (sphère basse) ──
    const bushSeeds = [[-5, 2], [5, 3], [-4, 8], [5, 9], [-6, 14], [6, 15], [-3, -3], [3, 18]];
    for (const [ox, oz] of bushSeeds) {
      const bx0 = mx + ox, bz0 = mz + oz;
      if (bx0 > cx0 - 1.5 && bx0 < cx1 + 1.5 && bz0 > cz0 - 1.5 && bz0 < cz1 + 1.5) continue;
      if (bx0 < GX0 + .5 || bx0 > GX1 - .5 || bz0 < GZ0 + .5 || bz0 > GZ1 - .5) continue;
      const br = .35 + Math.abs(ox * .03);
      const bc = (Math.abs(ox + oz) & 1) ? LF1 : LF3;
      disc(b, bx0, bz0, br, () => -.25, bc, 8);
      disc(b, bx0, bz0, br * .8, () => br * .4 - .25, bc, 8);
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * 6.2832, d = (k + 1) / 6 * 6.2832, m = (a + d) / 2;
        face(b, [Math.cos(m), .5, Math.sin(m)],
          [[bx0 + Math.cos(a) * br, -.25, bz0 + Math.sin(a) * br],
           [bx0 + Math.cos(d) * br, -.25, bz0 + Math.sin(d) * br],
           [bx0 + Math.cos(d) * br * .15, br * .6 - .25, bz0 + Math.sin(d) * br * .15],
           [bx0 + Math.cos(a) * br * .15, br * .6 - .25, bz0 + Math.sin(a) * br * .15]], bc);
      }
    }

    // ── Clôture (piquets + planches) sur le périmètre extérieur ──
    const FMG = 3.2; // marge depuis le bord du terrain
    const fenceSeg = (x0f, z0f, x1f, z1f) => {
      const dx = x1f - x0f, dz = z1f - z0f, len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len, nStakes = Math.max(2, Math.ceil(len / 1.4));
      // piquets
      for (let k = 0; k <= nStakes; k++) {
        const f = k / nStakes, px = x0f + ux * len * f, pz = z0f + uz * len * f;
        box(b, px - .025, -.25, pz - .025, px + .025, .6, pz + .025, FNC, FNC);
      }
      // 2 planches horizontales (bas à y=0.1, haut à y=0.4)
      const nxf = uz, nzf = -ux;  // normale de la planche (perpendiculaire au segment, dans le plan XZ)
      const off = .015;            // léger décalage pour éviter le z-fighting avec les piquets
      const ph = .08;              // épaisseur planche
      for (const py of [0.1, 0.38]) {
        const ox = nxf * off, ozz = nzf * off;
        // face avant
        face(b, [nxf, 0, nzf],
          [[x0f + ox, py,      z0f + ozz],
           [x1f + ox, py,      z1f + ozz],
           [x1f + ox, py + ph, z1f + ozz],
           [x0f + ox, py + ph, z0f + ozz]], FNC);
        // face arrière
        face(b, [-nxf, 0, -nzf],
          [[x0f - ox, py,      z0f - ozz],
           [x1f - ox, py,      z1f - ozz],
           [x1f - ox, py + ph, z1f - ozz],
           [x0f - ox, py + ph, z0f - ozz]], FNC);
        // face dessus
        face(b, [0, 1, 0],
          [[x0f - ox, py + ph, z0f - ozz],
           [x1f - ox, py + ph, z1f - ozz],
           [x1f + ox, py + ph, z1f + ozz],
           [x0f + ox, py + ph, z0f + ozz]], FNC);
      }
    };
    // Clôture sur 4 côtés de la boîte autour du terrain
    const fx0 = cx0 - FMG, fx1 = cx1 + FMG, fz0 = cz0 - FMG, fz1 = cz1 + FMG;
    fenceSeg(fx0, fz0, fx1, fz0);
    fenceSeg(fx1, fz0, fx1, fz1);
    fenceSeg(fx1, fz1, fx0, fz1);
    fenceSeg(fx0, fz1, fx0, fz0);

    // ── Pierres décoratives ──
    const stoneSeeds = [[-9, 3], [9, 8], [-7, 12], [8, 2]];
    for (const [ox, oz] of stoneSeeds) {
      const sx0 = mx + ox, sz0 = mz + oz;
      if (sx0 > cx0 - 1 && sx0 < cx1 + 1 && sz0 > cz0 - 1 && sz0 < cz1 + 1) continue;
      const sw = .3 + Math.abs(ox * .02), sh = .18 + Math.abs(oz * .01), sd = .25 + Math.abs((ox + oz) * .01);
      box(b, sx0 - sw / 2, -.25, sz0 - sd / 2, sx0 + sw / 2, sh - .25, sz0 + sd / 2, ST1, ST2);
    }

    return { decor: fin(b), sky: fin(sky) };
  }
  const B = () => ({ v: [], i: [], n: 0 }), fin = (b) => ({ v: new Float32Array(b.v), i: new Uint16Array(b.i) });
  function face(b, n, ps, c, m = 0) { ps.forEach((p, i) => { const q = typeof c[0] === 'number' ? c : c[i]; b.v.push(p[0], p[1], p[2], n[0], n[1], n[2], q[0], q[1], q[2], m); }); const k = b.n; b.i.push(k, k + 1, k + 2, k, k + 2, k + 3); b.n += 4; }
  function box(b, x0, y0, z0, x1, y1, z1, ct, cs, ce) {
    const e = ce ? Math.min(.014, (x1 - x0) / 2.2, (z1 - z0) / 2.2) : 0, T = [0, 1, 0], q = (a, c, d, f, col) => face(b, T, [[a, y1, c], [d, y1, c], [d, y1, f], [a, y1, f]], col);
    if (e) { q(x0 + e, z0 + e, x1 - e, z1 - e, ct); q(x0, z0, x1, z0 + e, ce); q(x0, z1 - e, x1, z1, ce); q(x0, z0 + e, x0 + e, z1 - e, ce); q(x1 - e, z0 + e, x1, z1 - e, ce); } else q(x0, z0, x1, z1, ct);
    face(b, [1, 0, 0], [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], cs);
    face(b, [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], cs);
    face(b, [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], cs);
    face(b, [0, 0, -1], [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], cs);
  }
  function disc(b, cx, cz, r, yf, c, n = 20) {
    const k = b.n; b.v.push(cx, yf(cx, cz), cz, 0, 1, 0, c[0], c[1], c[2], 0);
    for (let i = 0; i < n; i++) { const a = i / n * 6.2832, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; b.v.push(x, yf(x, z), z, 0, 1, 0, c[0], c[1], c[2], 0); b.i.push(k, k + 1 + i, k + 1 + (i + 1) % n); }
    b.n += n + 1;
  }
  function ring(b, cx, cz, r0, r1, yf, c, n = 32) {
    for (let i = 0; i < n; i++) { const a = i / n * 6.2832, d = (i + 1) / n * 6.2832, P = (r, t) => [cx + Math.cos(t) * r, 0, cz + Math.sin(t) * r], ps = [P(r0, a), P(r1, a), P(r1, d), P(r0, d)]; ps.forEach((p) => { p[1] = yf(p[0], p[2]); }); face(b, [0, 1, 0], ps, c); }
  }
  /** Creux de la coupe : paroi cylindrique (sombre en haut, noire au fond) et fond noir. Le feutre est percé par le fragment shader. */
  function pit(b, h, r, n = 28) {
    const cx = h.cup[0], cz = h.cup[1], bt = h.cupY - h.depth, T = [.1, .14, .09], Bk = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.2832, d = (i + 1) / n * 6.2832, x0 = cx + Math.cos(a) * r, z0 = cz + Math.sin(a) * r, x1 = cx + Math.cos(d) * r, z1 = cz + Math.sin(d) * r, m = (a + d) / 2;
      face(b, [-Math.cos(m), 0, -Math.sin(m)], [[x0, h.Gb(x0, z0), z0], [x1, h.Gb(x1, z1), z1], [x1, bt, z1], [x0, bt, z0]], [T, T, Bk, Bk]);
    }
    disc(b, cx, cz, r, () => bt, Bk, n);
  }
  function cyl(b, cx, cz, r, y0, y1, cs, ct, n = 20) {
    for (let i = 0; i < n; i++) { const a = i / n * 6.2832, d = (i + 1) / n * 6.2832, m = (a + d) / 2; face(b, [Math.cos(m), 0, Math.sin(m)], [[cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r], [cx + Math.cos(d) * r, y0, cz + Math.sin(d) * r], [cx + Math.cos(d) * r, y1, cz + Math.sin(d) * r], [cx + Math.cos(a) * r, y1, cz + Math.sin(a) * r]], cs); }
    disc(b, cx, cz, r, () => y1, ct, n);
  }
  /** Portail 3D : socle de pierre, anneau et cœur lumineux au sol, deux arceaux verticaux croisés, losange flottant. */
  function gate(b, x, z, y, c) {
    const dk = c.map((v) => v * .3), cr = c.map((v) => .55 + .45 * v), R0 = .3, H = y + .38, f = () => y + .016;
    cyl(b, x, z, R0, y, y + .014, [.2, .2, .22], [.3, .3, .33], 24);
    ring(b, x, z, .2, .28, f, c, 24); disc(b, x, z, .19, f, dk, 24); disc(b, x, z, .09, () => y + .018, cr, 16);
    for (const ax of [0, 1]) for (let i = 0; i < 20; i++) {
      const a = i / 20 * 6.2832, d = (i + 1) / 20 * 6.2832, P = (r, t) => ax ? [x, H + Math.sin(t) * r, z + Math.cos(t) * r] : [x + Math.cos(t) * r, H + Math.sin(t) * r, z], q = [P(R0 + .02, a), P(R0 + .02, d), P(R0 - .02, d), P(R0 - .02, a)];
      face(b, ax ? [1, 0, 0] : [0, 0, 1], q, c); face(b, ax ? [-1, 0, 0] : [0, 0, -1], q, c);
    }
    const T = [[x, H + .13, z], [x, H - .13, z]], E = [[x + .09, H, z], [x, H, z + .09], [x - .09, H, z], [x, H, z - .09]];
    for (const t of T) for (let i = 0; i < 4; i++) { const p = E[i], q = E[(i + 1) % 4], n = [t[0] * 0 + (p[0] + q[0]) / 2 - x, t[1] - H, (p[2] + q[2]) / 2 - z], l = Math.hypot(...n); face(b, n.map((v) => v / l), [t, p, q, q], cr); }
  }
  function build(h) {
    const b = B(), { inPoly, inR } = M.physics, S = .05, xs = h.poly.map((p) => p[0]), zs = h.poly.map((p) => p[1]);
    const bx0 = Math.min(...xs), bz0 = Math.min(...zs), nx = Math.round((Math.max(...xs) - bx0) / S), nz = Math.round((Math.max(...zs) - bz0) / S);
    const ok = (x, z) => inPoly(x, z, h.poly) && !h.voids.some((r) => inR(x, z, r)) && !h.water.some((r) => inR(x, z, r)) && !h.ramps.some((r) => inR(x, z, r));
    const tint = (x, z, base) => {   // couleur du feutre : sable, glace, boost (bandes ⟂ à la direction), trampoline, vent
      for (const q of h.zones) if (inR(x, z, q.r)) {
        if (q.t === 1) return (Math.floor(x / .3) + Math.floor(z / .3)) & 1 ? SAND : SAND2;
        if (q.t === 2) return (Math.floor(x / .6) + Math.floor(z / .6)) & 1 ? ICE : ICE2;
        if (q.t === 3) continue;   // boost : plaque de flux dédiée (voir flow)
        { const g = q.r, u = x - g[0], w = z - (g[1] - g[3] / 2); if (Math.abs(u) > g[2] / 2 - .07 || w < .07 || w > g[3] - .07) return PADF; return (w + Math.abs(u) * .7) % .3 < .1 ? PADA : PADB; }   // trampoline : tapis bleu nuit, chevrons ∧ cyan, cadre blanc matelassé
      }
      return base;
    };
    const dp = h.poly.some((p, i) => { const q = h.poly[(i + 1) % h.poly.length]; return p[0] !== q[0] && p[1] !== q[1]; }), cell = (x, z) => ok(x, z) || (dp && [[-1, -1], [1, -1], [-1, 1], [1, 1]].some((d) => ok(x + d[0] * .015, z + d[1] * .015)));   // bords obliques : une cellule entamée est tapissée (le reste est sous la bordure)
    for (let zi = 0; zi < nz; zi++) {
      const z0 = bz0 + zi * S, zc = z0 + S / 2, base = (Math.floor(z0 / .6) & 1) ? FELT2 : FELT; let run = null, rc = null;
      for (let xi = 0; xi <= nx; xi++) {
        const x0 = bx0 + xi * S, g = xi < nx && cell(x0 + S / 2, zc), c = g ? tint(x0 + S / 2, zc, base) : null;
        if (run !== null && (!g || c !== rc)) { face(b, [0, 1, 0], [[run, 0, z0], [x0, 0, z0], [x0, 0, z0 + S], [run, 0, z0 + S]], rc, 1); run = null; }
        if (g && run === null) { run = x0; rc = c; }
      }
    }
    for (const v of h.water) face(b, [0, 1, 0], [[v[0] - v[2] / 2, -.03, v[1] - v[3] / 2], [v[0] + v[2] / 2, -.03, v[1] - v[3] / 2], [v[0] + v[2] / 2, -.03, v[1] + v[3] / 2], [v[0] - v[2] / 2, -.03, v[1] + v[3] / 2]], WATER);
    for (const q of h.bumpers) { const hot = q[3] >= .8; cyl(b, q[0], q[1], q[2], 0, .35, hot ? BUMP : WS, hot ? BUMPC : WT); }
    for (const v of h.voids) face(b, [0, 1, 0], [[v[0] - v[2] / 2, -.8, v[1] - v[3] / 2], [v[0] + v[2] / 2, -.8, v[1] - v[3] / 2], [v[0] + v[2] / 2, -.8, v[1] + v[3] / 2], [v[0] - v[2] / 2, -.8, v[1] + v[3] / 2]], [.02, .03, .03]);
    for (const r of h.ramps) {
      const x0 = r[0] - r[2] / 2, x1 = r[0] + r[2] / 2, z0 = r[1] - r[3] / 2, z1 = r[1] + r[3] / 2, a = r[4], c = r[5], ya = r[6] === 'x' ? [a, c, c, a] : [a, a, c, c];
      const T = [[x0, ya[0], z0], [x1, ya[1], z0], [x1, ya[2], z1], [x0, ya[3], z1]];
      const e1 = [T[1][0] - T[0][0], T[1][1] - T[0][1], T[1][2] - T[0][2]], e2 = [T[3][0] - T[0][0], T[3][1] - T[0][1], T[3][2] - T[0][2]];
      let n = [e2[1] * e1[2] - e2[2] * e1[1], e2[2] * e1[0] - e2[0] * e1[2], e2[0] * e1[1] - e2[1] * e1[0]]; const l = Math.hypot(...n); n = n.map((v) => v / l);
      { const yy = (x, z) => r[6] === 'x' ? a + (c - a) * (x - x0) / (x1 - x0) : a + (c - a) * (z - z0) / (z1 - z0), zs = [z0];   // feutre rayé comme le sol : coupe aux multiples de 0,6 en z
        for (let k = Math.floor(z0 / .6) + 1; k * .6 < z1 - 1e-6; k++) zs.push(k * .6); zs.push(z1);
        for (let k = 0; k < zs.length - 1; k++) { const za = zs[k], zb = zs[k + 1]; face(b, n, [[x0, yy(x0, za), za], [x1, yy(x1, za), za], [x1, yy(x1, zb), zb], [x0, yy(x0, zb), zb]], (Math.floor((za + 1e-6) / .6) & 1) ? FELT2 : FELT, 1); } }
      face(b, [0, 0, -1], [[x0, 0, z0], [x1, 0, z0], T[1], T[0]], WS); face(b, [0, 0, 1], [[x0, 0, z1], [x1, 0, z1], T[2], T[3]], WS);
      face(b, [-1, 0, 0], [[x0, 0, z0], [x0, 0, z1], T[3], T[0]], WS); face(b, [1, 0, 0], [[x1, 0, z0], [x1, 0, z1], T[2], T[1]], WS);
    }
    const isCurbMatch = (ux, uz, emx, emz, c) => {
      if (!inR(emx, emz, c)) return false;
      if (c[2] > c[3] * 1.5 && Math.abs(ux) < .5) return false;
      if (c[3] > c[2] * 1.5 && Math.abs(uz) < .5) return false;
      return true;
    };
    for (const e of h.bsegs) {   // bordures : arêtes à sommet en pente continue (pas d'escalier)
      const t = .12, X = (u, o) => [e.a[0] + e.u[0] * u + e.o[0] * o, e.a[1] + e.u[1] * u + e.o[1] * o], V = (p, y) => [p[0], y, p[1]];
      const piece = (u0, y0, u1, y1, cA, cB, isFirst, isLast, isCurbChunk) => {
        const p0 = X(u0, 0), p1 = X(u1, 0), q1 = X(u1, t), q0 = X(u0, t), s = (y1 - y0) / (u1 - u0 || 1), l = Math.hypot(s, 1);
        if (isCurbChunk) {
          const cw = .16;
          let p0c = X(u0, t - cw), p1c = X(u1, t - cw);
          let q0c = X(u0, t), q1c = X(u1, t);
          let capA = cA || (isFirst && !e.curbCornerA), capB = cB || (isLast && !e.curbCornerB);
          if (isFirst && e.curbCornerA) {
            p0c = [p0c[0] + e.u[0] * (cw - t), p0c[1] + e.u[1] * (cw - t)];
            q0c = [q0c[0] - e.u[0] * e.ea, q0c[1] - e.u[1] * e.ea];
            capA = false;
          }
          if (isLast && e.curbCornerB) {
            p1c = [p1c[0] - e.u[0] * (cw - t), p1c[1] - e.u[1] * (cw - t)];
            q1c = [q1c[0] + e.u[0] * e.eb, q1c[1] + e.u[1] * e.eb];
            capB = false;
          }
          const gy0 = Math.max(0, h.Gb(p0c[0], p0c[1])), gy1 = Math.max(0, h.Gb(p1c[0], p1c[1]));
          const cy0 = gy0 + .065, cy1 = gy1 + .065;
          const ny = cw / Math.hypot(cw, .065), no = -.065 / Math.hypot(cw, .065);
          face(b, [no * e.o[0] - s * e.u[0] / l * .2, ny, no * e.o[1] - s * e.u[1] / l * .2], [V(p0c, gy0), V(p1c, gy1), V(q1c, cy1), V(q0c, cy0)], CURB);
          face(b, [e.o[0], 0, e.o[1]], [V(q0c, 0), V(q1c, 0), V(q1c, cy1), V(q0c, cy0)], CURBS);
          if (capA) face(b, [-e.u[0], 0, -e.u[1]], [V(p0c, 0), V(q0c, 0), V(q0c, cy0), V(p0c, gy0)], CURBS);
          if (capB) face(b, [e.u[0], 0, e.u[1]], [V(p1c, 0), V(q1c, 0), V(q1c, cy1), V(p1c, gy1)], CURBS);
          return;
        }
        face(b, [-s * e.u[0] / l, 1 / l, -s * e.u[1] / l], [V(p0, y0), V(p1, y1), V(q1, y1), V(q0, y0)], WT);
        face(b, [-e.o[0], 0, -e.o[1]], [V(p0, 0), V(p1, 0), V(p1, y1), V(p0, y0)], WS); face(b, [e.o[0], 0, e.o[1]], [V(q0, 0), V(q1, 0), V(q1, y1), V(q0, y0)], WS);
        if (cA) face(b, [-e.u[0], 0, -e.u[1]], [V(p0, 0), V(q0, 0), V(q0, y0), V(p0, y0)], WS); if (cB) face(b, [e.u[0], 0, e.u[1]], [V(p1, 0), V(q1, 0), V(q1, y1), V(p1, y1)], WS);
      }, m = e.hs.length - 1;
      const curbSlice = [], gapSlice = [];
      for (let k = 0; k < m; k++) {
        const smx = e.a[0] + e.u[0] * (k + .5) / m * e.L, smz = e.a[1] + e.u[1] * (k + .5) / m * e.L;
        curbSlice.push((e.curbs || []).some((c) => isCurbMatch(e.u[0], e.u[1], smx, smz, c)));
        gapSlice.push((e.gaps || []).some((g) => inR(smx, smz, g)));
      }
      if (e.ea && !curbSlice[0]) piece(-e.ea, e.hs[0], 0, e.hs[0], true, false, false, false, false);
      if (e.eb && !curbSlice[m - 1]) piece(e.L, e.hs[m], e.L + e.eb, e.hs[m], false, true, false, false, false);
      for (let j = 0; j < m;) {
        const sl = e.hs[j + 1] - e.hs[j];
        let k = j + 1;
        while (k < m && Math.abs(e.hs[k + 1] - e.hs[k] - sl) < 1e-4 && curbSlice[k] === curbSlice[j] && gapSlice[k] === gapSlice[j]) k++;
        if (!gapSlice[j]) {
          const isFirst = j === 0, isLast = k === m;
          const cA = j > 0 || (isFirst && !e.ea), cB = k < m || (isLast && !e.eb);
          piece(j / m * e.L, e.hs[j], k / m * e.L, e.hs[k], cA, cB, isFirst, isLast, curbSlice[j]);
        }
        j = k;
      }
    }
    for (const q of h.dw) if (!q.bd) {   // murs obliques libres : prisme orienté
      const vx = -q.uz, vz = q.ux, P = (a, c) => [q.x + q.ux * a + vx * c, q.z + q.uz * a + vz * c], hl = q.l / 2, ht = q.t / 2, y0 = q.y0 || 0, c4 = [P(-hl, -ht), P(hl, -ht), P(hl, ht), P(-hl, ht)];
      const tc = q.curb ? CURB : WT, sc = q.curb ? CURBS : WS;
      face(b, [0, 1, 0], c4.map((p) => [p[0], q.h, p[1]]), tc);
      for (let i = 0; i < 4; i++) { const p = c4[i], s = c4[(i + 1) % 4], n = [[-vx, 0, -vz], [q.ux, 0, q.uz], [vx, 0, vz], [-q.ux, 0, -q.uz]][i]; face(b, n, [[p[0], y0, p[1]], [s[0], y0, s[1]], [s[0], q.h, s[1]], [p[0], q.h, p[1]]], sc); }
    }
    for (const w of h.walls) if (!w.bd) { const c = w.curb; box(b, w[0] - w[2] / 2, w[5] || 0, w[1] - w[3] / 2, w[0] + w[2] / 2, w[4], w[1] + w[3] / 2, c ? CURB : WT, c ? CURBS : WS, c ? null : WE); }
    const cx = h.cup[0], cz = h.cup[1], cy = h.cupY, r = M.physics.CUP_R, k = .018;
    pit(b, h, r);
    box(b, cx - k, cy, cz - k, cx + k, cy + 1.05, cz + k, [.82, .1, .08], [.72, .08, .06]);
    const A = [cx + k, cy + 1.05, cz], Bp = [cx + k, cy + .74, cz], Cp = [cx + .46, cy + .895, cz];
    face(b, [0, 0, 1], [A, Bp, Cp, Cp], [.98, .92, .7]); face(b, [0, 0, -1], [A, Bp, Cp, Cp], [.98, .92, .7]);
    const rb = B(); ring(rb, cx, cz, r, r + .022, (x, z) => h.Gb(x, z) + .002, RIM);   // bord clair : maillage à part (polygon offset)
    h.portals.forEach((p, i) => { const c = PCOL[i % PCOL.length]; for (let k = 0; k < 2; k++) gate(b, p[k * 2], p[k * 2 + 1], h.Gb(p[k * 2], p[k * 2 + 1]), c); });
    for (const p of h.puits || []) {
      const ex = p.ex !== undefined ? p.ex : p[0], ez = p.ez !== undefined ? p.ez : p[1];
      const sx = p.sx !== undefined ? p.sx : p[2], sz = p.sz !== undefined ? p.sz : p[3];
      const fy = p.fy !== undefined ? p.fy : (p.length >= 7 ? p[6] : (p[5] !== undefined ? p[5] : 0));
      let dx = p.dx, dz = p.dz;
      if (dx === undefined) {
        const dir = p[4];
        if (typeof p[4] === 'number' && typeof p[5] === 'number' && p.length >= 7) {
          dx = p[4]; dz = p[5];
        } else {
          const vx = sx - ex, vz = sz - ez, L = Math.hypot(vx, vz);
          const ux = L > 1e-4 ? vx / L : 0, uz = L > 1e-4 ? vz / L : 1;
          if (dir === 'derrière' || dir === 'derriere' || dir === 'back') { dx = -ux; dz = -uz; }
          else if (dir === 'gauche' || dir === 'left') { dx = -uz; dz = ux; }
          else if (dir === 'droite' || dir === 'right') { dx = uz; dz = -ux; }
          else if (Array.isArray(dir)) { const dl = Math.hypot(dir[0], dir[1]) || 1; dx = dir[0] / dl; dz = dir[1] / dl; }
          else { dx = ux; dz = uz; }
        }
      }
      const ey = isFinite(h.Gb(ex, ez)) ? h.Gb(ex, ez) : 0;
      // Trou d'entrée : identique à la coupe finale (bord clair RIM, intérieur noir dégradé), sans drapeau
      ring(rb, ex, ez, r, r + .022, (x, z) => ey + .002, RIM);
      disc(b, ex, ez, r, () => ey + .001, [.02, .03, .02], 24);
      ring(b, ex, ez, r * .65, r, () => ey + .0012, [.06, .09, .06], 24);
      disc(b, ex, ez, r * .65, () => ey + .0014, [0, 0, 0], 20);
      // Trou de sortie : orifice circulaire vertical percé dans la paroi du mur de l'étage
      const sy = fy + .18, tx = -dz, tz = dx, nVert = 20, vr = r * .85;
      const P = (rad, a) => [sx + tx * rad * Math.cos(a) + dx * .002, sy + rad * Math.sin(a), sz + tz * rad * Math.cos(a) + dz * .002];
      for (let i = 0; i < nVert; i++) {
        const a = i / nVert * 6.2832, d = (i + 1) / nVert * 6.2832;
        face(rb, [dx, 0, dz], [P(vr, a), P(vr + .022, a), P(vr + .022, d), P(vr, d)], RIM);
      }
      const cBk = [0, 0, 0], cDk = [.02, .03, .02];
      for (let i = 0; i < nVert; i++) {
        const a = i / nVert * 6.2832, d = (i + 1) / nVert * 6.2832;
        const p0 = P(vr, a), p1 = P(vr, d);
        face(b, [dx, 0, dz], [[sx + dx * .002, sy, sz + dz * .002], p0, p1, [sx + dx * .002, sy, sz + dz * .002]], cDk);
        const q0 = [p0[0] - dx * .04, p0[1], p0[2] - dz * .04], q1 = [p1[0] - dx * .04, p1[1], p1[2] - dz * .04];
        face(b, [dx, 0, dz], [p0, q0, q1, p1], cBk);
      }
    }
    return { m: fin(b), r: fin(rb) };
  }
  /** Vent et boosts : même plaque (fond bleu-vert, chevrons clairs qui défilent dans le sens du souffle) + particules de traînée. */
  const FXV = 10;
  function flow(h) {
    const NEG = -Infinity, S = .1, b = B(), zs = [], parts = [];
    for (const w of h.winds) { const l = Math.hypot(w.a[0], w.a[1]) || 1; zs.push({ r: w.r, d: [w.a[0] / l, w.a[1] / l], k: .2 * l, sp: .35 * l }); }
    for (const q of h.zones) if (q.t === 3) { const l = Math.hypot(q.d[0], q.d[1]) || 1; { const A = M.physics.BOOST_A || 8; zs.push({ r: q.r, d: [q.d[0] / l, q.d[1] / l], k: .2 * A, sp: .35 * A }); } }
    for (const q of h.zones) if (q.t === 4) zs.push({ r: q.r, d: [0, 1], k: -2, sp: 0, pad: true });
    const vtx = (x, y, z, z0) => b.v.push(x, y, z, z0.d[0], z0.d[1], z0.R[0], z0.R[1], z0.R[2], z0.R[3], 1 + z0.k);
    for (const z of zs) {
      const r = z.r, x0 = r[0] - r[2] / 2, x1 = r[0] + r[2] / 2, z0 = r[1] - r[3] / 2, z1 = r[1] + r[3] / 2; z.R = [x0, z0, x1, z1];
      for (let i = 0, nx = Math.ceil(r[2] / S - 1e-6); i < nx; i++) for (let j = 0, nz = Math.ceil(r[3] / S - 1e-6); j < nz; j++) {
        const a = x0 + i * S, c = Math.min(x1, a + S), e = z0 + j * S, f = Math.min(z1, e + S), g = h.Gb((a + c) / 2, (e + f) / 2);
        if (g === NEG || Math.hypot((a + c) / 2 - h.cup[0], (e + f) / 2 - h.cup[1]) < M.physics.CUP_R + .1) continue;
        const Y = (x, zz) => { const y = h.Gb(x, zz); return (y === NEG ? g : y) + .002; }, k = b.n;
        vtx(a, Y(a, e), e, z); vtx(c, Y(c, e), e, z); vtx(c, Y(c, f), f, z); vtx(a, Y(a, f), f, z); b.i.push(k, k + 1, k + 2, k, k + 2, k + 3); b.n += 4;
      }
      const n = z.pad ? Math.max(4, Math.min(14, Math.round(r[2] * r[3] * 2.5))) : Math.max(6, Math.min(60, Math.round(r[2] * r[3] * 5)));
      for (let i = 0; i < n; i++) parts.push({ z, x: 0, zz: 0, yo: 0, age: z.pad ? -Math.random() * 1.2 : 9, life: z.pad ? 0 : 1, len: .3, al: 1, sp: z.sp });
    }
    return { plate: fin(b), parts, sv: new Float32Array(parts.length * 4 * FXV), si: (() => { const a = new Uint16Array(parts.length * 6); for (let i = 0; i < parts.length; i++) a.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); return a; })() };
  }
  /** Avance les particules de dt et remplit les rubans (face à la caméra `eye`). */
  function flowStep(h, parts, sv, dt, eye) {
    const hw = .012; let o = 0;
    for (const p of parts) {
      const z = p.z, R = z.R;
      if (z.pad) {   // flèches ∧ qui montent depuis le trampoline (hauteur de saut ≈ 0,5 m)
        p.age += dt;
        if (p.age > p.life) { p.x = R[0] + .2 + Math.random() * (R[2] - R[0] - .4); p.zz = R[1] + .2 + Math.random() * (R[3] - R[1] - .4); p.age = 0; p.life = .8 + Math.random() * .4; }
        const f = Math.max(0, Math.min(1, p.age / (p.life || 1))), gy = h.Gb(p.x, p.zz), y = (gy === -Infinity ? 0 : gy) + .06 + f * .5, al = Math.sin(Math.PI * f) * .9;
        let rx = eye[2] - p.zz, rz = -(eye[0] - p.x); const l = Math.hypot(rx, rz) || 1; rx *= .13 / l; rz *= .13 / l;
        const V = [[p.x - rx, y, p.zz - rz, -1, 0], [p.x + rx, y, p.zz + rz, 1, 0], [p.x + rx, y + .12, p.zz + rz, 1, 1], [p.x - rx, y + .12, p.zz - rz, -1, 1]];
        for (const v of V) { sv[o++] = v[0]; sv[o++] = v[1]; sv[o++] = v[2]; sv[o++] = v[3]; sv[o++] = v[4]; sv[o++] = al; sv[o++] = 0; sv[o++] = 0; sv[o++] = 0; sv[o++] = -2; }
        continue;
      }
      p.age += dt; p.x += z.d[0] * p.sp * dt; p.zz += z.d[1] * p.sp * dt;
      if (p.age > p.life || p.x < R[0] || p.x > R[2] || p.zz < R[1] || p.zz > R[3]) {
        p.x = R[0] + Math.random() * (R[2] - R[0]); p.zz = R[1] + Math.random() * (R[3] - R[1]); p.age = 0; p.life = .7 + Math.random() * .9;
        p.yo = .03 + Math.random() * .42; p.len = (.12 + Math.random() * .1) * z.sp + .1; p.sp = z.sp * (.85 + Math.random() * .3);
      }
      const gy = h.Gb(p.x, p.zz), y = (gy === -Infinity ? 0 : gy) + p.yo, al = Math.sin(Math.PI * Math.min(1, p.age / p.life)) * .85, dx = z.d[0], dz = z.d[1];
      let lx = -dz * (eye[1] - y), ly = dz * (eye[0] - p.x) - dx * (eye[2] - p.zz), lz = dx * (eye[1] - y); const l = Math.hypot(lx, ly, lz) || 1; lx *= hw / l; ly *= hw / l; lz *= hw / l;
      const tx = p.x - dx * p.len, tz = p.zz - dz * p.len, V = [[tx - lx, y - ly, tz - lz, 0, -1], [tx + lx, y + ly, tz + lz, 0, 1], [p.x + lx, y + ly, p.zz + lz, 1, 1], [p.x - lx, y - ly, p.zz - lz, 1, -1]];
      for (const v of V) { sv[o++] = v[0]; sv[o++] = v[1]; sv[o++] = v[2]; sv[o++] = v[3]; sv[o++] = v[4]; sv[o++] = al; sv[o++] = 0; sv[o++] = 0; sv[o++] = 0; sv[o++] = 0; }
    }
  }
  function sphere() {
    const b = B(), la = 8, lo = 12;
    for (let i = 0; i <= la; i++) { const f = i / la * Math.PI, y = Math.cos(f), r = Math.sin(f); for (let j = 0; j <= lo; j++) { const t = j / lo * 6.2832, x = r * Math.cos(t), z = r * Math.sin(t); b.v.push(x, y, z, x, y, z, 1, .98, .94, 3); } }
    for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) { const a = i * (lo + 1) + j, c = a + lo + 1; b.i.push(a, c, a + 1, a + 1, c, c + 1); }
    return fin(b);
  }
  const persp = (f, a, n, r) => { const t = 1 / Math.tan(f / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (r + n) / (n - r), -1, 0, 0, 2 * r * n / (n - r), 0]; };
  function look(e, t) {
    let f = [t[0] - e[0], t[1] - e[1], t[2] - e[2]]; const fl = Math.hypot(...f); f = f.map((v) => v / fl);
    let r = [-f[2], 0, f[0]]; const rl = Math.hypot(...r) || 1; r = r.map((v) => v / rl);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]], d = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
    return [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -d(r, e), -d(u, e), d(f, e), 1];
  }
  const mul = (A, Bm) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += A[k * 4 + r] * Bm[c * 4 + k]; o[c * 4 + r] = s; } return o; };

  function buildWindmillCrossH() {
    const b = B(), Rh = .16, Tw = .07, Ty = .20, Hy = .08;   // Ty=hauteur pale, Hy=rayon moyeu en Y
    cyl(b, 0, 0, Rh, -Hy, Hy, MW1, MW1, 8);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI * .5, cos = Math.cos(a), sin = Math.sin(a);
      const u0 = Rh, u1 = 1, w = Tw / 2, y0 = -Ty / 2, y1 = Ty / 2;
      const p = (u, v, y) => [u * cos - v * sin, y, u * sin + v * cos];
      face(b, [0, 1, 0], [p(u0, -w, y1), p(u1, -w, y1), p(u1, w, y1), p(u0, w, y1)], MW2);
      face(b, [0, -1, 0], [p(u0, w, y0), p(u1, w, y0), p(u1, -w, y0), p(u0, -w, y0)], MW1);
      face(b, [-sin, 0, cos], [p(u0, w, y0), p(u1, w, y0), p(u1, w, y1), p(u0, w, y1)], MW1);
      face(b, [sin, 0, -cos], [p(u1, -w, y0), p(u0, -w, y0), p(u0, -w, y1), p(u1, -w, y1)], MW1);
      face(b, [cos, 0, sin], [p(u1, -w, y0), p(u1, w, y0), p(u1, w, y1), p(u1, -w, y1)], MW3);
      const nw = w * .18;
      face(b, [0, 1, 0], [p(u0, -nw, y1 + .006), p(u1, -nw, y1 + .006), p(u1, nw, y1 + .006), p(u0, nw, y1 + .006)], MW3);
      for (const fu of [.45, .75]) face(b, [0, 1, 0], [p(fu - .015, -w, y1 + .004), p(fu + .015, -w, y1 + .004), p(fu + .015, w, y1 + .004), p(fu - .015, w, y1 + .004)], MW3);
    }
    return fin(b);
  }
  function buildWindmillCrossV() {
    const b = B(), Rh = .16, Tw = .07, Tz = .25, Hz = .08;   // Tz=profondeur pale, Hz=rayon moyeu en Z
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.2832, d = (i + 1) / 8 * 6.2832, m = (a + d) / 2;
      face(b, [Math.cos(m), Math.sin(m), 0],
        [[Rh * Math.cos(a), Rh * Math.sin(a), -Hz],
         [Rh * Math.cos(d), Rh * Math.sin(d), -Hz],
         [Rh * Math.cos(d), Rh * Math.sin(d), Hz],
         [Rh * Math.cos(a), Rh * Math.sin(a), Hz]], MW1);
    }
    const kF = b.n; b.v.push(0, 0, Hz, 0, 0, 1, MW1[0], MW1[1], MW1[2], 0);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.2832; b.v.push(Rh * Math.cos(a), Rh * Math.sin(a), Hz, 0, 0, 1, MW1[0], MW1[1], MW1[2], 0); b.i.push(kF, kF + 1 + i, kF + 1 + (i + 1) % 8); }
    b.n += 9;
    const kB = b.n; b.v.push(0, 0, -Hz, 0, 0, -1, MW1[0], MW1[1], MW1[2], 0);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.2832; b.v.push(Rh * Math.cos(a), Rh * Math.sin(a), -Hz, 0, 0, -1, MW1[0], MW1[1], MW1[2], 0); b.i.push(kB, kB + 1 + (i + 1) % 8, kB + 1 + i); }
    b.n += 9;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI * .5, cos = Math.cos(a), sin = Math.sin(a);
      const u0 = Rh, u1 = 1, w = Tw / 2, z0 = -Tz / 2, z1 = Tz / 2;
      const p = (u, v, z) => [u * cos - v * sin, u * sin + v * cos, z];
      face(b, [0, 0, 1], [p(u0, -w, z1), p(u1, -w, z1), p(u1, w, z1), p(u0, w, z1)], MW2);
      face(b, [0, 0, -1], [p(u0, w, z0), p(u1, w, z0), p(u1, -w, z0), p(u0, -w, z0)], MW1);
      face(b, [-sin, cos, 0], [p(u0, w, z0), p(u1, w, z0), p(u1, w, z1), p(u0, w, z1)], MW1);
      face(b, [sin, -cos, 0], [p(u1, -w, z0), p(u0, -w, z0), p(u0, -w, z1), p(u1, -w, z1)], MW1);
      face(b, [cos, sin, 0], [p(u1, -w, z0), p(u1, w, z0), p(u1, w, z1), p(u1, -w, z1)], MW3);
      const nw = w * .18;
      face(b, [0, 0, 1], [p(u0, -nw, z1 + .006), p(u1, -nw, z1 + .006), p(u1, nw, z1 + .006), p(u0, nw, z1 + .006)], MW3);
      for (const fu of [.45, .75]) face(b, [0, 0, 1], [p(fu - .015, -w, z1 + .004), p(fu + .015, -w, z1 + .004), p(fu + .015, w, z1 + .004), p(fu - .015, w, z1 + .004)], MW3);
    }
    return fin(b);
  }
  function buildWindmillPost() {
    const b = B();
    box(b, -.10, 0, -.10, .10, 1, .10, MW1, MW1);
    return fin(b);
  }

  M.render = {
    build,
    create(cv) {
      const gl = cv.getContext('webgl', { antialias: true, alpha: false }); if (!gl) return null;
      let lost = false, cur = null, u = {}, uf = {}, pm = null, pf = null, lt = performance.now(); const all = [];
      const mk = (d) => { const m = { v: d.v, i: d.i }; all.push(m); up(m); return m; };
      function up(m) { m.b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.b); gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STATIC_DRAW); m.e = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.e); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i, gl.STATIC_DRAW); }
      function init() {
        const prog = (vs, fs, at) => {
          const p = gl.createProgram();
          for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); gl.attachShader(p, h); }
          at.forEach((n, i) => gl.bindAttribLocation(p, i, n)); gl.linkProgram(p);
          if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
          return p;
        };
        pm = prog(VS, FS, ['aP', 'aN', 'aC', 'aM']); pf = prog(VSF, FSF, ['aP', 'aD', 'aR', 'aK']);
        for (const n of ['uVP', 'uOff', 'uSc', 'uRot', 'uRotZ', 'uCup', 'uEye', 'uMul']) u[n] = gl.getUniformLocation(pm, n);
        for (const n of ['uVP', 'uT']) uf[n] = gl.getUniformLocation(pf, n);
        gl.useProgram(pm);
        gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      }
      const NOCUP = [0, 0, 0, 0], ONE = [1, 1, 1];
      function draw(m, off, sc, yaw, cup, mul, rotZ) {
        gl.bindBuffer(gl.ARRAY_BUFFER, m.b); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.e);
        for (let a = 0; a < 3; a++) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 40, a * 12); }
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
        gl.uniform4fv(u.uCup, cup || NOCUP); gl.uniform3fv(u.uMul, mul || ONE); gl.uniform3fv(u.uOff, off); gl.uniform3fv(u.uSc, sc);
        gl.uniform2f(u.uRot, Math.cos(yaw), Math.sin(yaw));
        gl.uniform2f(u.uRotZ, rotZ ? Math.cos(rotZ) : 1, rotZ ? Math.sin(rotZ) : 0);
        gl.drawElements(gl.TRIANGLES, m.i.length, gl.UNSIGNED_SHORT, 0);
      }
      const FXS = [3, 2, 4, 1], FXO = [0, 12, 20, 36];
      function drawFx(m) {
        if (!m.i.length) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, m.b); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.e);
        for (let a = 0; a < 4; a++) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, FXS[a], gl.FLOAT, false, 40, FXO[a]); }
        gl.drawElements(gl.TRIANGLES, m.i.length, gl.UNSIGNED_SHORT, 0);
      }
      init();
      const shadow = (() => { const b = B(); disc(b, 0, 0, 1, () => 0, [.03, .07, .05], 14); return mk(fin(b)); })();
      const arrow = (() => { const b = B(), c = [1, .93, .55]; face(b, [0, 1, 0], [[-.02, 0, .15], [.02, 0, .15], [.02, 0, .55], [-.02, 0, .55]], c); face(b, [0, 1, 0], [[-.07, 0, .55], [.07, 0, .55], [0, 0, .78], [0, 0, .78]], c); return mk(fin(b)); })();
      const ball = mk(sphere());
      const millCrossH = mk(buildWindmillCrossH()), millCrossV = mk(buildWindmillCrossV()), millPost = mk(buildWindmillPost());
      const Rn = {
        get lost() { return lost; },
        load(h) {
          if (cur) for (const m of [cur.m, cur.r, cur.f, cur.s, cur.dc, cur.sk]) { if (!m) continue; all.splice(all.indexOf(m), 1); gl.deleteBuffer(m.b); gl.deleteBuffer(m.e); }
          const d = build(h), fl = flow(h), deco = buildDecor(h);
          cur = { m: mk(d.m), r: mk(d.r), f: mk(fl.plate), s: mk({ v: fl.sv, i: fl.si }), dc: mk(deco.decor), sk: mk(deco.sky), h, parts: fl.parts, cup: [h.cup[0], h.cup[1], M.physics.CUP_R, h.cupY] };
        },
        resize() { const d = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.max(2, Math.round(cv.clientWidth * d)); cv.height = Math.max(2, Math.round(cv.clientHeight * d)); },
        /** S = { x,y,z (balle), cam (yaw), aim, arrow, shadow, gy } */
        frame(S) {
          if (lost || !cur) return;
          gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(.42, .68, .88, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          const asp = cv.width / cv.height, fov = asp < 1.3 ? Math.min(2, 2 * Math.atan(Math.tan(.45) * 1.3 / asp)) : .9, pit = .5, D = 5, dx = Math.sin(S.cam), dz = Math.cos(S.cam);
          const eye = [S.x - dx * D * Math.cos(pit), S.y + D * Math.sin(pit), S.z - dz * D * Math.cos(pit)], tg = [S.x + dx * 1.2, S.y, S.z + dz * 1.2];
          const now = performance.now(), dt = Math.min(.05, (now - lt) / 1000), vp = mul(persp(fov, asp, .1, 200), look(eye, tg)); lt = now;
          gl.useProgram(pm); gl.uniformMatrix4fv(u.uVP, false, vp); gl.uniform3fv(u.uEye, eye);
          // dôme ciel (sans depth write, dessiné en premier)
          gl.depthMask(false); draw(cur.sk, [0, 0, 0], [1, 1, 1], 0); gl.depthMask(true);
          // décor (sol herbe, arbres, clôture, pierres)
          draw(cur.dc, [0, 0, 0], [1, 1, 1], 0);
          draw(cur.m, [0, 0, 0], [1, 1, 1], 0, cur.cup);
          const wt = S.wt !== undefined ? S.wt : (now / 1000);
          for (const m of cur.h.moulins || []) {
            const mx = m[0], mz = m[1], L = m[2], w = m[3], pose = m[4], yc = m[5], a0 = m[6] || 0;
            const gy = cur.h.Gb(mx, mz), y0 = isFinite(gy) ? gy : 0;
            const ang = wt * w + a0;
            if (pose === 'v') {
              draw(millCrossH, [mx, y0 + .06, mz], [L, 1, L], -ang);
            } else if (pose === 'z') {
              draw(millPost, [mx, y0, mz], [1, yc - y0, 1], 0);
              draw(millCrossV, [mx, yc, mz], [L, L, 1], 0, null, null, ang);
            } else if (pose === 'x') {
              draw(millPost, [mx, y0, mz], [1, yc - y0, 1], 0);
              draw(millCrossV, [mx, yc, mz], [L, L, 1], Math.PI * .5, null, null, ang + Math.PI * .5);
            }
          }
          gl.useProgram(pf); gl.uniformMatrix4fv(uf.uVP, false, vp); gl.uniform1f(uf.uT, (now / 1000) % 1000); drawFx(cur.f); gl.useProgram(pm);
          gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2); draw(cur.r, [0, 0, 0], [1, 1, 1], 0);
          const showMainShadow = S.shadow !== false && !S.shaft && isFinite(S.gy) && S.y >= S.gy - .02;
          if (showMainShadow) draw(shadow, [S.x, S.gy + .003, S.z], [.055, 1, .055], 0);
          if (S.arrow && isFinite(S.gy) && !S.shaft) draw(arrow, [S.x, S.gy + .05, S.z], [1, 1, 1], S.aim);
          gl.disable(gl.POLYGON_OFFSET_FILL);
          for (const o of S.others || []) {
            const oInTunnel = o.shaft || (isFinite(o.gy) && o.y < o.gy - .02);
            if (!oInTunnel) draw(ball, [o.x, o.y, o.z], [.05, .05, .05], 0, null, o.c);
          }
          for (const o of S.others || []) {
            const ogy = isFinite(o.gy) ? o.gy : o.y - .05;
            const showOtherShadow = o.shadow !== false && !o.shaft && isFinite(o.gy) && o.y >= o.gy - .02;
            if (showOtherShadow) draw(shadow, [o.x, ogy + .003, o.z], [.055, 1, .055], 0);
          }
          const mainInTunnel = S.shaft || (isFinite(S.gy) && S.y < S.gy - .02);
          if (!mainInTunnel) draw(ball, [S.x, S.y, S.z], [.05, .05, .05], 0, null, S.tint);
          if (cur.parts.length) {
            flowStep(cur.h, cur.parts, cur.s.v, dt, eye);
            gl.useProgram(pf); gl.bindBuffer(gl.ARRAY_BUFFER, cur.s.b); gl.bufferData(gl.ARRAY_BUFFER, cur.s.v, gl.DYNAMIC_DRAW);
            gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); drawFx(cur.s); gl.depthMask(true); gl.disable(gl.BLEND); gl.useProgram(pm);
          }
        },
      };
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
      cv.addEventListener('webglcontextrestored', () => { init(); all.forEach(up); Rn.resize(); lost = false; });
      Rn.resize(); return Rn;
    },
  };
})();
