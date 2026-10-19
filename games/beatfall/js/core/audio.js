// Beatfall – audio.js · Web Audio seul : nappe + mélodie de fond ; bips et tenues accordés à l'accord du moment (colonne = degré de l'accord)
const mf = m => 440 * 2 ** ((m - 69) / 12), CT = [0, 2, 4, 7];
export function createAudio(p) {
  let ac, out, cur = 0; const hold = {}, bps = p.bpm / 60, n = p.ch.length;
  const ok = () => ac && ac.state === 'running';
  const pitch = d => { const o = Math.floor(d / 7); return p.root + p.sc[d - o * 7] + 12 * o; };
  const root = bar => p.ch[((bar % n) + n) % n];
  const deg = (B, c) => root(Math.floor(B / 4)) + CT[c];
  const mk = () => { const g = ac.createGain(), f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.cut; g.gain.value = .5; g.connect(f); f.connect(ac.destination); out = g; };
  function tone(m, t, d, v, type = p.wave) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = mf(m); v *= type === 'square' ? .4 : 1;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .03);
    o.connect(g); g.connect(out); o.start(t);
    if (d > 0) { g.gain.setTargetAtTime(0, t + Math.max(d, .04), .1); o.stop(t + Math.max(d, .04) + 1); }
    return { o, g };
  }
  return {
    unlock() { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); mk(); } ac.resume(); },
    suspend() { if (ac) ac.suspend(); },
    reset(B) { cur = B; if (!ac) return; const old = out; old.gain.setTargetAtTime(0, ac.currentTime, .03); setTimeout(() => old.disconnect(), 600); mk(); },
    sched(B, sp) {   // appelé à chaque image : programme ~0,7 s d'avance (nappe d'accords + mélodie de fond)
      if (!ok()) return;
      cur = Math.max(cur, B); const hz = B + .7 * bps * sp, now = ac.currentTime;
      const at = b => now + Math.max(0, (b - B) / bps / sp), sec = d => d / bps / sp;
      for (let k = Math.ceil(cur / 4); k * 4 < hz; k++) for (const i of [0, 2, 4]) tone(pitch(root(k) + i) - 12, at(k * 4), sec(4) * .98, .13, 'sine');
      for (let l = Math.floor(cur / p.ml); l * p.ml <= hz; l++) for (const [b, g, d] of p.melody) { const x = l * p.ml + b; if (x >= cur && x < hz) tone(pitch(g), at(x), sec(d) * p.leg, .18); }
      cur = hz;
    },
    tap(c, B) { if (ok()) tone(pitch(deg(B, c)), ac.currentTime, .25, .3); },
    holdStart(c, B) { if (ok()) hold[c] = tone(pitch(deg(B, c)), ac.currentTime, 0, .22); },
    holdEnd(c) { const h = hold[c]; if (!h) return; delete hold[c]; const t = ac.currentTime; h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(h.g.gain.value, t); h.g.gain.setTargetAtTime(0, t, .06); h.o.stop(t + .5); },
    fault() { if (ok()) tone(p.root - 12, ac.currentTime, .3, .25, 'sine'); },
  };
}