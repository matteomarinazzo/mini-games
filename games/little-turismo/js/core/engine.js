// Reglages usure moteur, fractions normalisees 0..1.
// Risque par palier : faible dès l'orange, très élevé dans le rouge, quasi maximal à 100 %.
export const ENGINE_WEAR = {
  ORANGE: .5,
  RED: .78,
  PER_SECOND: .0025,
  INCREMENT: .001,
  RISK_AT_ORANGE: .0005,
  RISK_AT_RED: .02,
  RISK_NEAR_MAX: .08,
  COOLING_FACTOR: .28
};
export const engineState = () => ({ motor: 0, cooling: 0, step: 0, failed: false, failurePending: false, retiredAt: 0, fade: 0 });
export const engineWear = (w, b) => Math.min(1, Math.max(w.motor || 0, w.cooling || 0, ((b?.hood || 0) + (b?.nose || 0)) * .5));

export function engineIncrement(w, throttle, dt, body, inPit = false) {
  if (w.failed) return false;
  w.motor = Math.min(1, (w.motor || 0) + ENGINE_WEAR.PER_SECOND * Math.max(0, throttle) * dt);
  w.cooling = Math.min(1, (w.cooling || 0) + ENGINE_WEAR.PER_SECOND * ENGINE_WEAR.COOLING_FACTOR * Math.max(0, throttle) * dt);
  const now = engineWear(w, body);
  const n = Math.floor(now / ENGINE_WEAR.INCREMENT);
  const steps = n - (w.step || 0);

  // Un échec déjà tiré dans les stands est appliqué à la sortie, sans nouveau tirage.
  if (w.failurePending) {
    if (inPit) return false;
    w.failurePending = false;
    return true;
  }
  // Cas forcé distinct du tirage par palier : le clamp à 1 ne doit jamais le masquer.
  if (now >= 1) {
    w.step = n;
    if (inPit) { w.failurePending = true; return false; }
    return true;
  }
  if (steps <= 0) return false;
  w.step = n;
  if (now < ENGINE_WEAR.ORANGE) return false;

  let p;
  if (now < ENGINE_WEAR.RED) {
    const x = (now - ENGINE_WEAR.ORANGE) / (ENGINE_WEAR.RED - ENGINE_WEAR.ORANGE);
    p = ENGINE_WEAR.RISK_AT_ORANGE + (ENGINE_WEAR.RISK_AT_RED - ENGINE_WEAR.RISK_AT_ORANGE) * x * x;
  } else {
    const x = (now - ENGINE_WEAR.RED) / (1 - ENGINE_WEAR.RED);
    p = ENGINE_WEAR.RISK_AT_RED + (ENGINE_WEAR.RISK_NEAR_MAX - ENGINE_WEAR.RISK_AT_RED) * x * x;
  }
  const chance = Math.min(.5, 1 - Math.pow(1 - p, steps));
  if (Math.random() >= chance) return false;
  if (inPit) { w.failurePending = true; return false; }
  return true;
}

export function repairEngine(w, body) {
  w.motor = 0;
  w.cooling = 0;
  w.step = Math.floor(engineWear(w, body) / ENGINE_WEAR.INCREMENT);
  w.failed = false;
  w.retiredAt = 0;
  w.fade = 0;
}
