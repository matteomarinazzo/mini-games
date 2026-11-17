import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LT_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(LT_DIR, '../..');

// Parse arguments
const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [k, ...v] = arg.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  })
);

const TMP_DIR = path.resolve(LT_DIR, 'tmp');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// 1. Détermination de la prochaine version v<X>
function getNextVersion() {
  if (args.ver) return args.ver;
  let maxV = 0;
  const entries = fs.readdirSync(TMP_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const m = entry.name.match(/^v(\d+)$/);
      if (m) maxV = Math.max(maxV, parseInt(m[1], 10));
    }
  }
  return `v${maxV + 1}`;
}

const currentVersion = getNextVersion();
const prevVersionNumber = parseInt(currentVersion.replace('v', ''), 10) - 1;
const prevVersion = prevVersionNumber >= 1 ? `v${prevVersionNumber}` : null;

const VERSION_DIR = path.join(TMP_DIR, currentVersion);
fs.mkdirSync(VERSION_DIR, { recursive: true });

console.log(`=======================================================`);
console.log(`   LITTLE TURISMO - BANC D'ESSAI TELEMETRIQUE [${currentVersion}]`);
if (prevVersion) console.log(`   (Comparaison active par rapport a ${prevVersion})`);
console.log(`=======================================================\n`);

// 2. Définition des circuits et voitures à tester
const FAST_CIRCUITS = ['serra-nova', 'valmont-gp', 'sous-bois', 'karting-arene'];
const FAST_CARS = ['tempete', 'sentinelle', 'kart_frelon'];

const EXTENDED_CIRCUITS = ['valmont-gp', 'serra-nova', 'sous-bois', 'aerodrome', 'parc-royal', 'grand-col', 'karting-arene', 'karting-hangar'];
const EXTENDED_CARS = ['serra_gt', 'tempete', 'sentinelle', 'spectre', 'f1', 'rallye', 'kart_frelon', 'kart_vipere'];

const isFull = 'full' in args;
const isExtended = 'extended' in args;
const isKart = 'kart' in args;

const KART_CIRCUITS = [
  'karting-arene', 'karting-hangar', 'karting-usine', 'karting-entrepot',
  'karting-prairie', 'karting-pinede', 'karting-sabliere', 'karting-littoral',
  'mixte-depot', 'mixte-scierie', 'mixte-serre', 'mixte-chalet'
];
const KART_CARS = ['kart_frelon', 'kart_pepite', 'kart_cobalt', 'kart_vipere'];

const defaultCircuits = isKart ? KART_CIRCUITS : (isFull ? null : (isExtended ? EXTENDED_CIRCUITS : FAST_CIRCUITS));
const defaultCars = isKart ? KART_CARS : (isFull ? null : (isExtended ? EXTENDED_CARS : FAST_CARS));

const circuitsToRun = args.circuits ? args.circuits.split(',') : defaultCircuits;
const carsToRun = args.cars ? args.cars.split(',') : defaultCars;
const modesToRun = args.mode ? [args.mode] : ['qualif', 'race'];
const lapsCount = parseInt(args.laps || '2', 10);
const concurrency = parseInt(args.workers || Math.min(4, os.cpus().length || 2), 10);

// Charger la liste complète des circuits et voitures si nécessaire
async function loadFullCatalog() {
  globalThis.location = new URL('http://localhost/?circuit=serra-nova');
  const { NEW } = await import('../js/core/circuits.js');
  const { CARS } = await import('../js/core/physics.js');
  await import('../js/core/sheets.js');

  const allCircuits = ['serra-nova', ...Object.keys(NEW)];
  const allCars = Object.keys(CARS);
  return { allCircuits, allCars };
}

const { allCircuits, allCars } = await loadFullCatalog();
const finalCircuits = circuitsToRun || allCircuits;
const finalCars = carsToRun || allCars;

// 3. Construction de la matrice des tâches
const tasks = [];
for (const trk of finalCircuits) {
  // Adaptation intelligente : sur les circuits de karting, tester les karts en priorité
  const isKartTrack = trk.includes('karting') || trk.includes('mixte');
  for (const car of finalCars) {
    const isKartCar = car.includes('kart');
    if (isKartTrack && !isKartCar) continue; // les karts sur pistes de kart, les voitures sur circuits
    if (!isKartTrack && isKartCar) continue;

    for (const m of modesToRun) {
      const fileName = `run_${trk}_${car}_${m}.json`;
      const outPath = path.join(VERSION_DIR, fileName);
      tasks.push({
        circuit: trk,
        car,
        mode: m,
        laps: lapsCount,
        fileName,
        outPath
      });
    }
  }
}

console.log(`Plan de test : ${tasks.length} simulations prévues sur ${finalCircuits.length} circuits.`);
console.log(`Exécution en parallèle (${concurrency} workers simultanés)...\n`);

// 4. Exécuteur de tâche en sous-processus
function runTask(task) {
  return new Promise((resolve, reject) => {
    const workerScript = path.resolve(__dirname, 'bench-worker.mjs');
    const child = spawn(process.execPath, [
      workerScript,
      `--circuit=${task.circuit}`,
      `--car=${task.car}`,
      `--mode=${task.mode}`,
      `--laps=${task.laps}`,
      `--ver=${currentVersion}`,
      `--out=${task.outPath}`
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Worker failed on ${task.circuit}/${task.car}/${task.mode}: ${stderr}`));
      } else {
        try {
          const lines = stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          const data = JSON.parse(lastLine);
          resolve({ task, data });
        } catch (e) {
          reject(new Error(`Invalid JSON output: ${stdout}`));
        }
      }
    });
  });
}

// 5. Pool d'exécution parallèle
const results = [];
let completed = 0;
const startTotalMs = Date.now();

async function runWorkerPool() {
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const t = tasks[index++];
      try {
        const res = await runTask(t);
        results.push(res);
        completed++;
        const pct = Math.round((completed / tasks.length) * 100);
        const exp = res.data.summary.find(s => s.level === 'expert');
        const expTime = exp ? `${exp.bestLap || '-'}s` : '-';
        const off = exp ? exp.offTrackTicks : 0;
        console.log(`[${pct.toString().padStart(3)}%] (${completed}/${tasks.length}) ${res.data.circuitName} · ${res.data.carName} · ${t.mode.toUpperCase().padEnd(6)} -> Expert: ${expTime} (Off: ${off})`);
      } catch (err) {
        console.error(`[ERREUR] ${err.message}`);
      }
    }
  }

  const pool = Array.from({ length: concurrency }, () => worker());
  await Promise.all(pool);
}

await runWorkerPool();

const totalDurationSec = ((Date.now() - startTotalMs) / 1000).toFixed(1);
console.log(`\nSimulations terminées en ${totalDurationSec}s.`);

// 6. Sauvegarde du summary.json et du manifest.json
const summaryPayload = {
  version: currentVersion,
  date: new Date().toISOString(),
  durationSec: parseFloat(totalDurationSec),
  taskCount: tasks.length,
  runs: results.map(r => ({
    circuit: r.data.circuit,
    circuitName: r.data.circuitName,
    carId: r.data.carId,
    carName: r.data.carName,
    mode: r.data.mode,
    fileName: r.task.fileName,
    wallTimeMs: r.data.wallTimeMs,
    summary: r.data.summary
  }))
};

fs.writeFileSync(path.join(VERSION_DIR, 'summary.json'), JSON.stringify(summaryPayload, null, 2), 'utf8');

// Mise à jour du manifest global
let manifest = { versions: [], latest: currentVersion, updatedAt: new Date().toISOString() };
const manifestPath = path.join(TMP_DIR, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {}
}
if (!manifest.versions.includes(currentVersion)) manifest.versions.push(currentVersion);
manifest.latest = currentVersion;
manifest.updatedAt = new Date().toISOString();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

// 7. Comparaison avec la version précédente si existante
let prevSummary = null;
if (prevVersion) {
  const prevSummaryPath = path.join(TMP_DIR, prevVersion, 'summary.json');
  if (fs.existsSync(prevSummaryPath)) {
    try {
      prevSummary = JSON.parse(fs.readFileSync(prevSummaryPath, 'utf8'));
    } catch (e) {}
  }
}

// 8. Génération du rapport Markdown
let md = `# Rapport Télémétrique Little Turismo - ${currentVersion}\n\n`;
md += `- **Date** : ${new Date().toLocaleString()}\n`;
md += `- **Durée d'exécution** : ${totalDurationSec} s\n`;
md += `- **Simulations exécutées** : ${results.length}\n`;
if (prevVersion) md += `- **Comparé à** : \`${prevVersion}\`\n`;
md += `\n---\n\n`;

md += `## 1. Tableau des Chronos et Fautes\n\n`;
md += `| Circuit | Voiture | Mode | Expert | Difficile | Normal | Facile | Fautes Hors-Piste (Exp/Diff/Norm/Fac) |\n`;
md += `| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |\n`;

for (const r of summaryPayload.runs) {
  const sMap = Object.fromEntries(r.summary.map(s => [s.level, s]));
  const tExp = sMap.expert?.bestLap != null ? `${sMap.expert.bestLap}s` : '-';
  const tDiff = sMap.difficile?.bestLap != null ? `${sMap.difficile.bestLap}s` : '-';
  const tNorm = sMap.normal?.bestLap != null ? `${sMap.normal.bestLap}s` : '-';
  const tFac = sMap.facile?.bestLap != null ? `${sMap.facile.bestLap}s` : '-';
  const offTxt = `${sMap.expert?.offTrackTicks || 0} / ${sMap.difficile?.offTrackTicks || 0} / ${sMap.normal?.offTrackTicks || 0} / ${sMap.facile?.offTrackTicks || 0}`;

  md += `| **${r.circuitName}** | ${r.carName} | \`${r.mode}\` | ${tExp} | ${tDiff} | ${tNorm} | ${tFac} | ${offTxt} |\n`;
}

// Analyse des anomalies
md += `\n## 2. Détection des Anomalies Critiques\n\n`;
let anomalyCount = 0;
for (const r of summaryPayload.runs) {
  const sMap = Object.fromEntries(r.summary.map(s => [s.level, s]));
  // Sorties de route anormales
  if ((sMap.expert?.offTrackTicks || 0) > 100) {
    anomalyCount++;
    md += `- ⚠️ **${r.circuitName} (${r.carName}, ${r.mode})** : L'IA Expert a ${sMap.expert.offTrackTicks} ticks hors-piste ! (Survirage ou freinage trop tardif).\n`;
  }
  // Inversion de hiérarchie (Difficile ou Normal plus rapide qu'Expert)
  if (sMap.expert?.bestLap && sMap.difficile?.bestLap && sMap.difficile.bestLap < sMap.expert.bestLap - 0.5) {
    anomalyCount++;
    md += `- ⚠️ **Inversion hiérarchique sur ${r.circuitName} (${r.carName}, ${r.mode})** : Difficile (${sMap.difficile.bestLap}s) bat Expert (${sMap.expert.bestLap}s) ! L'Expert commet probablement une grosse erreur.\n`;
  }
}
if (anomalyCount === 0) {
  md += `*Aucune anomalie critique détectée. La hiérarchie des niveaux est strictement respectée.*\n`;
}

// Comparaison delta avec la version précédente
if (prevSummary) {
  md += `\n## 3. Comparaison avec ${prevVersion}\n\n`;
  md += `| Circuit | Voiture | Mode | Delta Chrono Expert | Delta Fautes Expert |\n`;
  md += `| :--- | :--- | :--- | :---: | :---: |\n`;

  const prevMap = new Map();
  for (const pr of prevSummary.runs) {
    prevMap.set(`${pr.circuit}_${pr.carId}_${pr.mode}`, pr);
  }

  for (const r of summaryPayload.runs) {
    const key = `${r.circuit}_${r.carId}_${r.mode}`;
    const pr = prevMap.get(key);
    if (!pr) continue;

    const currExp = r.summary.find(s => s.level === 'expert');
    const prevExp = pr.summary.find(s => s.level === 'expert');

    if (currExp?.bestLap && prevExp?.bestLap) {
      const dTime = (currExp.bestLap - prevExp.bestLap).toFixed(2);
      const dOff = (currExp.offTrackTicks || 0) - (prevExp.offTrackTicks || 0);
      const timeSign = dTime < 0 ? `🟢 ${dTime}s (gain)` : dTime > 0 ? `🔴 +${dTime}s` : `⚪ =`;
      const offSign = dOff < 0 ? `🟢 ${dOff} (moins de fautes)` : dOff > 0 ? `🔴 +${dOff} fautes` : `⚪ =`;

      md += `| **${r.circuitName}** | ${r.carName} | \`${r.mode}\` | ${timeSign} | ${offSign} |\n`;
    }
  }
}

fs.writeFileSync(path.join(VERSION_DIR, 'report.md'), md, 'utf8');

console.log(`\nRapport sauvegarde dans : ${path.relative(ROOT_DIR, path.join(VERSION_DIR, 'report.md'))}`);
console.log(`Donnees brutes : ${path.relative(ROOT_DIR, path.join(VERSION_DIR, 'summary.json'))}`);
console.log(`Pret pour consultation dans bench/bench.html !`);

