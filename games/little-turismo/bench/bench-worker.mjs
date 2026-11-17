import fs from 'node:fs';
import path from 'node:path';

// Parse command line arguments
const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [k, ...v] = arg.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  })
);

const circuit = args.circuit || 'serra-nova';
const carId = args.car || 'tempete';
const mode = args.mode || 'qualif'; // 'qualif' or 'race'
const lapsTarget = parseInt(args.laps || '2', 10);
const levels = (args.levels || 'expert,difficile,normal,facile').split(',');
const outPath = args.out;
const versionTag = args.ver || 'v1';

// Mock browser globals for track.js and config.js
globalThis.location = new URL(`http://localhost/?circuit=${circuit}`);
if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
}

// Import game core modules
const { TRACK, frameAt, locate } = await import('../js/core/track.js');
const { CARS, createCar } = await import('../js/core/physics.js');
await import('../js/core/sheets.js');
const { createAi, stepField } = await import('../js/core/ai.js');

const sheet = CARS[carId] || Object.values(CARS)[0];
const LEN = TRACK.length;
const DT = 1 / 60;
const kt = TRACK.half < 5;

// Sample track geometry (centerline, bounds, left/right edges)
const sampleStep = Math.max(8, Math.round(LEN / 350));
const centerline = [];
const leftEdge = [];
const rightEdge = [];
const kerbsL = [];
const kerbsR = [];
const F = {};

let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;

for (let s = 0; s < LEN; s += sampleStep) {
  frameAt(s, F);
  const half = TRACK.half;
  const idx = Math.floor(s / TRACK.ds);
  const kL = (TRACK.kerbL && TRACK.kerbL[idx]) || 0;
  const kR = (TRACK.kerbR && TRACK.kerbR[idx]) || 0;

  const lx = F.x - F.rx * (half + kL * 0.45);
  const lz = F.z - F.rz * (half + kL * 0.45);
  const rx = F.x + F.rx * (half + kR * 0.45);
  const rz = F.z + F.rz * (half + kR * 0.45);

  centerline.push([Math.round(F.x * 10) / 10, Math.round(F.z * 10) / 10]);
  leftEdge.push([Math.round(lx * 10) / 10, Math.round(lz * 10) / 10]);
  rightEdge.push([Math.round(rx * 10) / 10, Math.round(rz * 10) / 10]);

  if (kL > 0) kerbsL.push([Math.round(lx * 10) / 10, Math.round(lz * 10) / 10]);
  if (kR > 0) kerbsR.push([Math.round(rx * 10) / 10, Math.round(rz * 10) / 10]);

  x0 = Math.min(x0, F.x, lx, rx);
  x1 = Math.max(x1, F.x, lx, rx);
  z0 = Math.min(z0, F.z, lz, rz);
  z1 = Math.max(z1, F.z, lz, rz);
}

// Start line geometry
const startFrame = {};
frameAt(TRACK.startIdx * TRACK.ds, startFrame);
const startLine = {
  x: Math.round(startFrame.x * 10) / 10,
  z: Math.round(startFrame.z * 10) / 10,
  rx: Math.round(startFrame.rx * 1000) / 1000,
  rz: Math.round(startFrame.rz * 1000) / 1000
};

// Simulation Execution
const results = [];
const startBenchMs = Date.now();

if (mode === 'qualif') {
  // En qualification : simulation propre solo pour chaque niveau (zéro perturbation)
  for (let k = 0; k < levels.length; k++) {
    const lvl = levels[k];
    const s0 = TRACK.startIdx * TRACK.ds - 10;
    const ph = createCar(sheet, s0, 0, 0);
    const ai = createAi(ph, lvl, k + 1, true, 0);
    const ais = [ai];
    const all = [ph];

    const meta = {
      level: lvl,
      lapTimes: [],
      bestLap: null,
      maxV: 0,
      avgV: 0,
      offTrackTicks: 0,
      wallTicks: 0,
      lockupTicks: 0,
      slideTicks: 0,
      incidents: [],
      trajectory: []
    };

    const S0 = TRACK.startIdx * TRACK.ds;
    const wrapS = (d) => d - LEN * Math.round(d / LEN);
    let p = wrapS(s0 - S0);
    let prevS = s0;
    let lapStartTick = 0;
    let lapStarted = false;
    let speedSum = 0;
    let samplesCount = 0;
    const maxTicks = Math.round((lapsTarget + 1.2) * (LEN / Math.max(16, sheet.vmax * 0.40)) * 60);

    for (let tick = 0; tick < maxTicks; tick++) {
      stepField(ais, all, tick, DT, false, true, true);

      const t = tick * DT;
      const kmh = ph.u * 3.6;
      const slip = Math.abs(Math.atan2(ph.w, Math.max(Math.abs(ph.u), 2)));

      if (kmh > meta.maxV) meta.maxV = kmh;
      speedSum += kmh;
      samplesCount++;

      // Fautes
      if (ph.wall) {
        meta.wallTicks++;
        if (tick % 30 === 0) {
          meta.incidents.push({
            type: 'wall',
            t: Math.round(t * 10) / 10,
            s: Math.round(ph.s),
            x: Math.round(ph.x * 10) / 10,
            z: Math.round(ph.z * 10) / 10,
            surf: ph.surf
          });
        }
      }
      if (ph.surf >= 2) {
        meta.offTrackTicks++;
        if (tick % 30 === 0) {
          meta.incidents.push({
            type: 'offtrack',
            t: Math.round(t * 10) / 10,
            s: Math.round(ph.s),
            x: Math.round(ph.x * 10) / 10,
            z: Math.round(ph.z * 10) / 10,
            surf: ph.surf
          });
        }
      }
      if ((ph.skF || 0) > 0.08) meta.lockupTicks++;
      if (slip > 0.16) meta.slideTicks++;

      // Détection de franchissement de ligne
      const d = wrapS(ph.s - prevS);
      prevS = ph.s;
      p += d;

      if (!lapStarted && p >= 0) {
        lapStarted = true;
        lapStartTick = tick;
      } else if (lapStarted && p >= (meta.lapTimes.length + 1) * LEN) {
        const lapTime = (tick - lapStartTick) * DT;
        const roundedTime = Math.round(lapTime * 100) / 100;
        meta.lapTimes.push(roundedTime);
        if (meta.bestLap === null || roundedTime < meta.bestLap) meta.bestLap = roundedTime;
        lapStartTick = tick;
        ai.laps = meta.lapTimes.length;
      }
      prevS = ph.s;

      // Échantillonnage télémétrie à 10 Hz (tous les 6 ticks)
      if (tick % 6 === 0) {
        meta.trajectory.push([
          Math.round(t * 100) / 100,
          Math.round(ph.s * 10) / 10,
          Math.round(ph.x * 10) / 10,
          Math.round(ph.z * 10) / 10,
          Math.round(kmh),
          Math.round((ai.inp.throttle || 0) * 100),
          Math.round((ai.inp.brake || 0) * 100),
          Math.round((ai.inp.steer || 0) * 100),
          ph.surf,
          Math.round(slip * 1000)
        ]);
      }

      if (meta.lapTimes.length >= lapsTarget) break;
    }

    meta.avgV = samplesCount ? Math.round(speedSum / samplesCount) : 0;
    meta.maxV = Math.round(meta.maxV * 10) / 10;
    results.push(meta);
  }
} else {
  // En course : peloton complet avec grille et contacts
  const ais = [];
  const all = [];
  const metas = [];

  for (let k = 0; k < levels.length; k++) {
    const lvl = levels[k];
    const s = TRACK.startIdx * TRACK.ds - 8 - (k >> 1) * (kt ? 5 : 8) - (k & 1) * (kt ? 2.5 : 4);
    const lat = (k & 1 ? 1 : -1) * (kt ? 1.15 : 2.6);
    const ph = createCar(sheet, s, lat, 0);
    const S0 = TRACK.startIdx * TRACK.ds;
    const wrapS = (d) => d - LEN * Math.round(d / LEN);
    const ai = createAi(ph, lvl, k + 1, false, 0);
    ais.push(ai);
    all.push(ph);
    metas.push({
      level: lvl,
      lapTimes: [],
      bestLap: null,
      maxV: 0,
      avgV: 0,
      offTrackTicks: 0,
      wallTicks: 0,
      lockupTicks: 0,
      slideTicks: 0,
      incidents: [],
      trajectory: [],
      prevS: s,
      p: wrapS(s - S0),
      lapStartTick: 0,
      speedSum: 0,
      samplesCount: 0
    });
  }

  const S0 = TRACK.startIdx * TRACK.ds;
  const wrapS = (d) => d - LEN * Math.round(d / LEN);
  const maxTicks = Math.round((lapsTarget + 1.2) * (LEN / Math.max(16, sheet.vmax * 0.40)) * 60);

  for (let tick = 0; tick < maxTicks; tick++) {
    stepField(ais, all, tick, DT, true, false, true);

    const t = tick * DT;
    const sampleNow = (tick % 6 === 0);
    let allFinished = true;

    for (let k = 0; k < ais.length; k++) {
      const a = ais[k], c = all[k], m = metas[k];
      const kmh = c.u * 3.6;
      const slip = Math.abs(Math.atan2(c.w, Math.max(Math.abs(c.u), 2)));

      if (kmh > m.maxV) m.maxV = kmh;
      m.speedSum += kmh;
      m.samplesCount++;

      if (c.surf >= 2) {
        m.offTrackTicks++;
        if (tick % 30 === 0) {
          m.incidents.push({
            type: 'offtrack',
            t: Math.round(t * 10) / 10,
            s: Math.round(c.s),
            x: Math.round(c.x * 10) / 10,
            z: Math.round(c.z * 10) / 10,
            surf: c.surf
          });
        }
      }
      if ((c.skF || 0) > 0.08) m.lockupTicks++;
      if (slip > 0.16) m.slideTicks++;

      const d = wrapS(c.s - m.prevS);
      m.prevS = c.s;
      m.p += d;

      if (m.p >= (m.lapTimes.length + 1) * LEN) {
        const lapTime = (tick - m.lapStartTick) * DT;
        const roundedTime = Math.round(lapTime * 100) / 100;
        m.lapTimes.push(roundedTime);
        if (m.bestLap === null || roundedTime < m.bestLap) m.bestLap = roundedTime;
        m.lapStartTick = tick;
        a.laps = m.lapTimes.length;
      }
      m.prevS = c.s;

      if (m.lapTimes.length < lapsTarget) allFinished = false;

      if (sampleNow) {
        m.trajectory.push([
          Math.round(t * 100) / 100,
          Math.round(c.s * 10) / 10,
          Math.round(c.x * 10) / 10,
          Math.round(c.z * 10) / 10,
          Math.round(kmh),
          Math.round((a.inp.throttle || 0) * 100),
          Math.round((a.inp.brake || 0) * 100),
          Math.round((a.inp.steer || 0) * 100),
          c.surf,
          Math.round(slip * 1000)
        ]);
      }
    }

    if (allFinished) break;
  }

  for (const m of metas) {
    m.avgV = m.samplesCount ? Math.round(m.speedSum / m.samplesCount) : 0;
    m.maxV = Math.round(m.maxV * 10) / 10;
    delete m.prevS;
    delete m.distTraveled;
    delete m.lapStartTick;
    delete m.speedSum;
    delete m.samplesCount;
    results.push(m);
  }
}

const elapsedWallMs = Date.now() - startBenchMs;

const runPayload = {
  version: versionTag,
  circuit: {
    id: circuit,
    name: TRACK.name,
    length: Math.round(TRACK.length),
    half: TRACK.half,
    startIdx: TRACK.startIdx,
    bounds: {
      x0: Math.round(x0),
      x1: Math.round(x1),
      z0: Math.round(z0),
      z1: Math.round(z1)
    },
    centerline,
    leftEdge,
    rightEdge,
    kerbsL,
    kerbsR,
    startLine
  },
  run: {
    carId,
    carName: sheet.name,
    mode,
    lapsTarget,
    wallTimeMs: elapsedWallMs
  },
  results
};

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(runPayload), 'utf8');
}

// Print summary output to stdout for the orchestrator
console.log(JSON.stringify({
  circuit,
  circuitName: TRACK.name,
  carId,
  carName: sheet.name,
  mode,
  wallTimeMs: elapsedWallMs,
  summary: results.map(r => ({
    level: r.level,
    bestLap: r.bestLap,
    lapTimes: r.lapTimes,
    maxV: r.maxV,
    avgV: r.avgV,
    offTrackTicks: r.offTrackTicks,
    lockupTicks: r.lockupTicks
  }))
}));
