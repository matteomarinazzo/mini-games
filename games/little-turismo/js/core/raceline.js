// Ligne de course optimale (Racing Line) : trajectoire fluide et réaliste
// Sorties et entrées de virages adaptées pour éviter les trajectoires brusques ou rectilignes
// entre deux virages opposés (compromis de trajectoire / enchaînements fluides).
const cl = (v, a, b) => Math.max(a, Math.min(b, v));

export function racingLine(P, T, K, N, ds, lim) {
  // 1. Lissage de la courbure pour détecter fidèlement les virages et cordes
  const sk = new Float32Array(N);
  const wRad = Math.max(2, Math.round(15 / ds));
  for (let i = 0; i < N; i++) {
    let s = 0, ws = 0;
    for (let d = -wRad; d <= wRad; d++) {
      const g = Math.exp(-0.5 * (d / (wRad * 0.5)) ** 2);
      s += K[(i + d + N) % N] * g;
      ws += g;
    }
    sk[i] = s / ws;
  }

  // 2. Détection des zones de virage (|sk| > seuil)
  const kThresh = 0.0035;
  const isCorner = new Uint8Array(N);
  for (let i = 0; i < N; i++) isCorner[i] = Math.abs(sk[i]) >= kThresh ? 1 : 0;

  // Raccorder les courtes portions droites (< 22m) au sein d'un même virage
  const bridge = Math.round(22 / ds);
  for (let i = 0; i < N; i++) {
    if (!isCorner[i]) {
      let bSign = 0, aSign = 0;
      for (let d = 1; d <= bridge; d++) {
        const ib = (i - d + N) % N, ia = (i + d) % N;
        if (!bSign && isCorner[ib]) bSign = Math.sign(sk[ib]);
        if (!aSign && isCorner[ia]) aSign = Math.sign(sk[ia]);
      }
      if (bSign && aSign && bSign === aSign) isCorner[i] = 1;
    }
  }

  // Trouver un point hors virage pour démarrer le découpage proprement
  let startIdx = 0;
  for (let i = 0; i < N; i++) {
    if (!isCorner[i] && isCorner[(i - 1 + N) % N]) { startIdx = i; break; }
  }

  const corners = [];
  let inCorner = false, cStart = 0;
  for (let step = 0; step < N; step++) {
    const i = (startIdx + step) % N;
    if (isCorner[i] && !inCorner) {
      inCorner = true;
      cStart = i;
    } else if (!isCorner[i] && inCorner) {
      inCorner = false;
      const count = (i - cStart + N) % N;
      if (count * ds >= 12) {
        corners.push({ start: cStart, end: i, len: count });
      }
    }
  }

  const targets = new Float32Array(N);
  const pinned = new Uint8Array(N);
  const cNum = corners.length;

  // 3. Détermination des points clés avec compromis de trajectoire
  for (let ci = 0; ci < cNum; ci++) {
    const c = corners[ci];
    const prevC = corners[(ci - 1 + cNum) % cNum];
    const nextC = corners[(ci + 1) % cNum];

    let sumK = 0, peakK = 0;
    for (let s = 0; s < c.len; s++) {
      const idx = (c.start + s) % N;
      sumK += sk[idx];
      if (Math.abs(sk[idx]) > Math.abs(peakK)) peakK = sk[idx];
    }

    const sign = Math.sign(peakK) || 1; // +1 = Droite, -1 = Gauche
    const inside = sign * lim;
    const outside = -sign * lim;

    // Analyse du virage précédent et suivant
    const distToNext = ((nextC.start - c.end + N) % N) * ds;
    const distFromPrev = ((c.start - prevC.end + N) % N) * ds;

    let nextSign = 0, prevSign = 0;
    for (let s = 0; s < nextC.len; s++) {
      const idx = (nextC.start + s) % N;
      if (Math.abs(sk[idx]) > 0.005) { nextSign = Math.sign(sk[idx]); break; }
    }
    for (let s = 0; s < prevC.len; s++) {
      const idx = (prevC.start + s) % N;
      if (Math.abs(sk[idx]) > 0.005) { prevSign = Math.sign(sk[idx]); break; }
    }
    if (!nextSign) nextSign = sign;
    if (!prevSign) prevSign = sign;

    const oppNext = nextSign !== sign;
    const oppPrev = prevSign !== sign;

    // Détection double apex
    const peaks = [];
    for (let s = 2; s < c.len - 2; s++) {
      const idx = (c.start + s) % N;
      const im1 = (idx - 1 + N) % N, ip1 = (idx + 1) % N;
      if (Math.abs(sk[idx]) > 0.007 && Math.abs(sk[idx]) >= Math.abs(sk[im1]) && Math.abs(sk[idx]) >= Math.abs(sk[ip1])) {
        if (!peaks.length || ((idx - peaks[peaks.length - 1] + N) % N) * ds > 30) {
          peaks.push(idx);
        }
      }
    }
    const isDoubleApex = peaks.length >= 2 && c.len * ds > 85;
    const angleDeg = Math.abs(sumK * ds * 180 / Math.PI);
    const isHairpin = angleDeg > 110;

    // Compromis d'entrée : si on vient d'un virage opposé proche, on ne force pas un déport extérieur extrême
    const entryWidth = oppPrev ? cl((distFromPrev - 16) / 60, 0.25, 1.0) : 1.0;
    const entryIdx = (c.start - Math.round(cl(distFromPrev * 0.35, 10, 35) / ds) + N) % N;
    if (!oppPrev || distFromPrev >= 28) {
      targets[entryIdx] = outside * entryWidth;
      pinned[entryIdx] = 1;
    }

    // Corde (Apex) :
    if (isDoubleApex) {
      targets[peaks[0]] = inside;
      pinned[peaks[0]] = 1;
      const midIdx = Math.round(((peaks[0] + peaks[1]) / 2) % N);
      targets[midIdx] = inside * 0.4;
      pinned[midIdx] = 1;
      targets[peaks[1]] = inside;
      pinned[peaks[1]] = 1;
    } else {
      // Apex tardif pour relance sur ligne droite, apex centré en chicane
      const apexRatio = isHairpin ? 0.70 : (oppNext && distToNext < 40) ? 0.52 : 0.63;
      const apexIdx = (c.start + Math.round(c.len * apexRatio)) % N;
      targets[apexIdx] = inside;
      pinned[apexIdx] = 1;
    }

    // Compromis de sortie : si le virage suivant tourne dans l'autre sens sous peu,
    // on ne tire pas tout à l'extérieur (ce qui obligerait à traverser brutalement en ligne droite).
    // On reste plus près du centre / intérieur pour faciliter l'entrée du virage suivant.
    if (oppNext && distToNext < 32) {
      // Transition douce continue à mi-chemin
      const midTransitIdx = (c.end + Math.round(((nextC.start - c.end + N) % N) * 0.5)) % N;
      targets[midTransitIdx] = 0;
      pinned[midTransitIdx] = 1;
    } else {
      const exitWidth = oppNext ? cl((distToNext - 18) / 65, 0.25, 1.0) : 1.0;
      const exitMargin = Math.round(cl(distToNext * 0.35, 10, 35) / ds);
      const exitIdx = (c.end + exitMargin) % N;
      targets[exitIdx] = outside * exitWidth;
      pinned[exitIdx] = 1;
    }
  }

  // 4. Interpolation fluide entre repères
  const pinnedList = [];
  for (let i = 0; i < N; i++) {
    if (pinned[i]) pinnedList.push({ idx: i, val: targets[i] });
  }

  if (pinnedList.length < 2) return new Float32Array(N);

  const rawLine = new Float32Array(N);
  const Pn = pinnedList.length;
  for (let p = 0; p < Pn; p++) {
    const p1 = pinnedList[p];
    const p2 = pinnedList[(p + 1) % Pn];
    const count = (p2.idx - p1.idx + N) % N;
    for (let s = 0; s < count; s++) {
      const u = s / count;
      // Interpolation quintique douce
      const ease = u * u * u * (u * (u * 6 - 15) + 10);
      const idx = (p1.idx + s) % N;
      rawLine[idx] = cl(p1.val * (1 - ease) + p2.val * ease, -lim, lim);
    }
  }

  // 5. Relaxation continue (filtre passe-bas + limitation de pente latérale)
  // Supprime tout coup de volant sec tout en conservant l'amplitude complète des virages
  const out = new Float32Array(rawLine);
  const maxSlope = 0.22; // déport max en m par m de piste (~12.5° max, réaliste et dynamique)
  const maxDelta = maxSlope * ds;

  const passes = Math.max(15, Math.round(50 / ds));
  for (let pass = 0; pass < passes; pass++) {
    // A) Lissage gaussien / diffusion
    for (let i = 0; i < N; i++) {
      const im1 = (i - 1 + N) % N, ip1 = (i + 1) % N;
      const im2 = (i - 2 + N) % N, ip2 = (i + 2) % N;
      const smoothVal = 0.08 * out[im2] + 0.25 * out[im1] + 0.34 * out[i] + 0.25 * out[ip1] + 0.08 * out[ip2];
      if (pinned[i] && Math.abs(targets[i]) > lim * 0.75) {
        out[i] = targets[i];
      } else {
        out[i] = cl(smoothVal, -lim, lim);
      }
    }

    // B) Contrôle de pente fluide en préservant les apex
    for (let i = 0; i < N; i++) {
      const ip1 = (i + 1) % N;
      if (pinned[ip1] && Math.abs(targets[ip1]) > lim * 0.75) continue;
      const diff = out[ip1] - out[i];
      if (Math.abs(diff) > maxDelta) {
        out[ip1] = cl(out[i] + Math.sign(diff) * maxDelta, -lim, lim);
      }
    }
    for (let i = N - 1; i >= 0; i--) {
      const im1 = (i - 1 + N) % N;
      if (pinned[im1] && Math.abs(targets[im1]) > lim * 0.75) continue;
      const diff = out[im1] - out[i];
      if (Math.abs(diff) > maxDelta) {
        out[im1] = cl(out[i] + Math.sign(diff) * maxDelta, -lim, lim);
      }
    }
  }

  return out;
}
