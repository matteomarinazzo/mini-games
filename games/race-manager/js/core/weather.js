/** Météo de course : machine à états légère, sérialisable et sans dépendance. */
export const WEATHER_STATES = Object.freeze([
  'dry', 'rising_fast', 'rising', 'rising_slow', 'stable',
  'falling_slow', 'falling', 'falling_fast',
]);

const RATE = Object.freeze({
  dry: 0, rising_fast: 0.55, rising: 0.32, rising_slow: 0.14,
  stable: 0, falling_slow: -0.12, falling: -0.28, falling_fast: -0.5,
});
const DURATION = Object.freeze({
  dry: [2, 7], rising_fast: [1, 3], rising: [2, 6], rising_slow: [2, 5],
  stable: [2, 7], falling_slow: [2, 5], falling: [2, 6], falling_fast: [1, 3],
});
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Accept both the canonical 0..1 probability and legacy percentage values. */
export function normalizeRainProbability(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return clamp(numeric > 1 ? numeric / 100 : numeric, 0, 1);
}

/**
 * Roll the weather once at race creation. Dry starts are exactly 0 mm; wet
 * starts begin with a wet track. The caller supplies a deterministic RNG when
 * the same value must be shown by the UI and used by the engine.
 */
export function createStartingWeather(rainProbability = 0, rng = Math.random) {
  const probability = normalizeRainProbability(rainProbability);
  if (rng() >= probability) return { mm: 0, state: 'dry', category: 'dry', rainProbability: probability };
  const mm = 4.5;
  return { mm, state: 'stable', category: 'wet', rainProbability: probability };
}
const randInt = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

export function weatherCategory(mm, previous) {
  const value = clamp(Number(mm) || 0, 0, 6);
  // Hystérésis uniquement lors du suivi d'une catégorie existante.
  if (previous === 'dry' && value < 1.15) return 'dry';
  if (previous === 'damp' && value >= 0.85 && value < 4.15) return 'damp';
  if (previous === 'wet' && value >= 3.85) return 'wet';
  if (value < 1) return 'dry';
  if (value < 4) return 'damp';
  return 'wet';
}

export function recommendedCompound(mm) {
  const value = Number(mm) || 0;
  if (value >= 4) return 'wet';
  if (value >= 1) return 'intermediate';
  return 'medium';
}

function chooseState(current, mm, rainProbability, rng) {
  const wetBias = normalizeRainProbability(rainProbability);
  const rising = ['rising_fast', 'rising', 'rising_slow'];
  const falling = ['falling_fast', 'falling', 'falling_slow'];
  const options = [];
  const add = (state, weight) => options.push([state, Math.max(0, weight)]);
  if (mm >= 5.7) { add('falling_fast', 4); add('falling', 3); add('stable', 1); }
  else if (mm <= 0.15) { add('dry', 5); add('rising_slow', 1 + wetBias * 5); add('stable', 2); }
  else {
    add('stable', 2.5);
    add('rising_slow', 1 + wetBias * 3);
    add('rising', wetBias * 3);
    add('rising_fast', wetBias * wetBias * 1.5);
    add('falling_slow', 1.2 + (1 - wetBias) * 2);
    add('falling', 0.7 + (1 - wetBias) * 1.5);
    if (current.startsWith('rising')) add('falling_slow', 0.35);
    if (current.startsWith('falling')) add('rising_slow', wetBias * 0.5);
  }
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let pick = rng() * total;
  for (const [state, weight] of options) { pick -= weight; if (pick <= 0) return state; }
  return options[options.length - 1][0];
}

export function createWeatherState(mm = 0, rainProbability = 0.5, rng = Math.random) {
  const value = clamp(Number(mm) || 0, 0, 6);
  const category = weatherCategory(value);
  const state = value >= 4 ? 'stable' : value >= 1 ? 'stable' : 'dry';
  return { state, remaining: randInt(rng, DURATION[state]), mm: value, category, rainProbability: normalizeRainProbability(rainProbability) };
}

/** Avance la météo d'un tour. L'objet retourné ne contient que des données sérialisables. */
export function advanceWeather(weather, rainProbability = weather?.rainProbability ?? 0.5, rng = Math.random) {
  const source = weather || createWeatherState(0, rainProbability, rng);
  const next = { ...source, rainProbability: normalizeRainProbability(rainProbability) };
  if (!WEATHER_STATES.includes(next.state)) next.state = 'stable';
  if (!Number.isFinite(next.remaining) || next.remaining < 1) next.remaining = randInt(rng, DURATION[next.state]);
  if (!Number.isFinite(next.mm)) next.mm = 0;
  const oldCategory = weatherCategory(next.mm, next.category);
  const rate = RATE[next.state] || 0;
  const rainFactor = next.state.startsWith('rising') ? (0.45 + next.rainProbability * 0.75) : 1;
  const ceilingFactor = next.mm > 4 ? clamp(1 - (next.mm - 4) / 2, 0.05, 1) : 1;
  const noise = (rng() - 0.5) * 0.08;
  next.mm = clamp(next.mm + rate * rainFactor * ceilingFactor + noise, 0, 6);
  next.remaining -= 1;
  if (next.remaining <= 0) {
    next.state = chooseState(next.state, next.mm, next.rainProbability, rng);
    next.remaining = randInt(rng, DURATION[next.state]);
  }
  next.category = weatherCategory(next.mm, oldCategory);
  return next;
}
