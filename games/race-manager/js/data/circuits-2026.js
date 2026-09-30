/**
 * Données de circuit 2026 : nombre de tours, temps de base, facteurs de simulation.
 * Les valeurs sont des estimations de gameplay, pas des données officielles.
 */
import { deepFreeze } from '../core/utils.js';

export const CIRCUITS_2026 = deepFreeze([
  { id: 'australia',     laps: 58, lapTimeBase: 79_000, tyreWear: 1.0,  overtakingDifficulty: 0.45, pitLossSeconds: 22, rainProbability: 0.12 },
  { id: 'china',         laps: 56, lapTimeBase: 94_000, tyreWear: 1.15, overtakingDifficulty: 0.40, pitLossSeconds: 23, rainProbability: 0.18 },
  { id: 'japan',         laps: 53, lapTimeBase: 91_000, tyreWear: 1.10, overtakingDifficulty: 0.55, pitLossSeconds: 21, rainProbability: 0.25 },
  { id: 'bahrain',       laps: 57, lapTimeBase: 90_000, tyreWear: 1.20, overtakingDifficulty: 0.35, pitLossSeconds: 23, rainProbability: 0.02 },
  { id: 'saudi-arabia',  laps: 50, lapTimeBase: 88_000, tyreWear: 0.90, overtakingDifficulty: 0.50, pitLossSeconds: 24, rainProbability: 0.01 },
  { id: 'miami',         laps: 57, lapTimeBase: 88_000, tyreWear: 1.05, overtakingDifficulty: 0.40, pitLossSeconds: 22, rainProbability: 0.20 },
  { id: 'canada',        laps: 70, lapTimeBase: 73_000, tyreWear: 0.85, overtakingDifficulty: 0.35, pitLossSeconds: 21, rainProbability: 0.22 },
  { id: 'monaco',        laps: 78, lapTimeBase: 73_000, tyreWear: 0.70, overtakingDifficulty: 0.95, pitLossSeconds: 25, rainProbability: 0.15 },
  { id: 'barcelona',     laps: 66, lapTimeBase: 78_000, tyreWear: 1.15, overtakingDifficulty: 0.55, pitLossSeconds: 22, rainProbability: 0.08 },
  { id: 'austria',       laps: 71, lapTimeBase: 65_000, tyreWear: 1.00, overtakingDifficulty: 0.30, pitLossSeconds: 20, rainProbability: 0.18 },
  { id: 'great-britain', laps: 52, lapTimeBase: 87_000, tyreWear: 1.10, overtakingDifficulty: 0.40, pitLossSeconds: 22, rainProbability: 0.35 },
  { id: 'belgium',       laps: 44, lapTimeBase: 105_000,tyreWear: 1.05, overtakingDifficulty: 0.35, pitLossSeconds: 23, rainProbability: 0.30 },
  { id: 'hungary',       laps: 70, lapTimeBase: 77_000, tyreWear: 1.10, overtakingDifficulty: 0.75, pitLossSeconds: 22, rainProbability: 0.15 },
  { id: 'netherlands',   laps: 72, lapTimeBase: 71_000, tyreWear: 0.95, overtakingDifficulty: 0.70, pitLossSeconds: 21, rainProbability: 0.20 },
  { id: 'italy',         laps: 53, lapTimeBase: 81_000, tyreWear: 0.80, overtakingDifficulty: 0.25, pitLossSeconds: 24, rainProbability: 0.10 },
  { id: 'spain',         laps: 66, lapTimeBase: 76_000, tyreWear: 1.10, overtakingDifficulty: 0.50, pitLossSeconds: 22, rainProbability: 0.05 },
  { id: 'azerbaijan',    laps: 51, lapTimeBase: 101_000,tyreWear: 0.85, overtakingDifficulty: 0.40, pitLossSeconds: 25, rainProbability: 0.05 },
  { id: 'singapore',     laps: 62, lapTimeBase: 97_000, tyreWear: 1.00, overtakingDifficulty: 0.65, pitLossSeconds: 26, rainProbability: 0.30 },
  { id: 'united-states', laps: 56, lapTimeBase: 94_000, tyreWear: 1.05, overtakingDifficulty: 0.40, pitLossSeconds: 22, rainProbability: 0.10 },
  { id: 'mexico',        laps: 71, lapTimeBase: 77_000, tyreWear: 1.00, overtakingDifficulty: 0.45, pitLossSeconds: 22, rainProbability: 0.15 },
  { id: 'brazil',        laps: 71, lapTimeBase: 70_000, tyreWear: 1.05, overtakingDifficulty: 0.35, pitLossSeconds: 21, rainProbability: 0.35 },
  { id: 'las-vegas',     laps: 50, lapTimeBase: 93_000, tyreWear: 0.90, overtakingDifficulty: 0.35, pitLossSeconds: 24, rainProbability: 0.02 },
  { id: 'qatar',         laps: 57, lapTimeBase: 84_000, tyreWear: 1.25, overtakingDifficulty: 0.45, pitLossSeconds: 22, rainProbability: 0.01 },
  { id: 'abu-dhabi',     laps: 58, lapTimeBase: 85_000, tyreWear: 1.00, overtakingDifficulty: 0.40, pitLossSeconds: 23, rainProbability: 0.01 },
].map((c) => ({ ...c })));

/** Trouve un circuit par son ID (correspond au roundId du calendrier). */
export const circuitFor = (roundId) => CIRCUITS_2026.find((c) => c.id === roundId);
