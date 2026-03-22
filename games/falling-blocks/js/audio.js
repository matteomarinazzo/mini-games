// ─────────────────────────────────────────────
// AUDIO ENGINE — Falling Blocks
// Sons style Tetris, Web Audio API pur
// ─────────────────────────────────────────────

let audioCtx = null;
let isSoundEnabled = localStorage.getItem("fallingBlocks_sound") !== "false";
let isMusicEnabled = localStorage.getItem("fallingBlocks_music") !== "false";


function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Reprendre si suspendu (politique autoplay mobile)
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function out(ctx, vol = 1.0) {
    const g = ctx.createGain();
    g.gain.value = vol;
    g.connect(ctx.destination);
    return g;
}

export function playGameSound(type) {
    if (!isSoundEnabled) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // ── MOVE : tick discret quand la pièce se déplace ──────────────
    if (type === 'move') {
        const master = out(ctx, 0.33);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(380, now + 0.04);

        g.gain.setValueAtTime(0.6, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.05);
    }

    // ── ROTATE ET SOFTDROP: petit bip ascendant ───────────────────────────────
    else if (type === 'rotate' || type === 'softdrop') {
        const master = out(ctx, 0.33);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.07);

        g.gain.setValueAtTime(0.7, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.09);
    }

    // ── DROP (pose normale) : impact sourd ─────────────────────────
    else if (type === 'drop') {
        const master = out(ctx, 0.9);

        // Impact grave
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        g.gain.setValueAtTime(0.9, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.13);

        // Click d'attaque
        const click = ctx.createOscillator();
        const cg = ctx.createGain();
        click.type = 'square';
        click.frequency.setValueAtTime(800, now);
        cg.gain.setValueAtTime(0.3, now);
        cg.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        click.connect(cg); cg.connect(master);
        click.start(now); click.stop(now + 0.03);
    }

    // ── CLEAR 1 ligne : bip simple ─────────────────────────────────
    else if (type === 'clear1') {
        const master = out(ctx, 0.8);
        const freqs = [523, 659]; // Do Mi

        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const t = now + i * 0.07;

            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.5, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.1);
        });
    }

    // ── CLEAR 2-3 lignes : fanfare montante ────────────────────────
    else if (type === 'clear2') {
        const master = out(ctx, 0.85);
        const freqs = [523, 659, 784]; // Do Mi Sol

        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const t = now + i * 0.07;

            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.55, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.12);
        });
    }

    // ── CLEAR 4 lignes (Tetris!) : fanfare épique ──────────────────
    else if (type === 'clear4') {
        const master = out(ctx, 1.0);
        // Arpège Do Mi Sol Do (octave)
        const notes = [523, 659, 784, 1046];

        notes.forEach((f, i) => {
            const t = now + i * 0.08;

            // Note principale
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.6, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.18);

            // Harmonique
            const osc2 = ctx.createOscillator();
            const g2 = ctx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(f * 2, t);
            g2.gain.setValueAtTime(0.2, t);
            g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc2.connect(g2); g2.connect(master);
            osc2.start(t); osc2.stop(t + 0.15);
        });

        // Flash de bruit blanc (sparkle)
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.4, now + 0.24);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        src.connect(ng); ng.connect(master);
        src.start(now + 0.24); src.stop(now + 0.3);
    }

    // ── LEVEL UP : accord joyeux ───────────────────────────────────
    else if (type === 'levelup') {
        const master = out(ctx, 0.9);
        const notes = [523, 784, 1046, 1318]; // Do Sol Do Mi (octave)

        notes.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const t = now + i * 0.06;

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, t);
            osc.frequency.exponentialRampToValueAtTime(f * 1.05, t + 0.1);

            g.gain.setValueAtTime(0.65, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.18);
        });
    }

    // ── GAME OVER : descente dramatique ────────────────────────────
    else if (type === 'gameover') {
        const master = out(ctx, 1.2);

        // Descente chromatique
        const steps = [494, 440, 392, 349, 294, 220];
        steps.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const t = now + i * 0.1;

            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.4, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.14);
        });

        // Impact grave final
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now + 0.65);
        osc.frequency.exponentialRampToValueAtTime(30, now + 1.0);
        g.gain.setValueAtTime(1.0, now + 0.65);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
        osc.connect(g); g.connect(master);
        osc.start(now + 0.65); osc.stop(now + 1.1);
    }
}

// ─────────────────────────────────────────────
// MUSIC ENGINE — Boucle procédurale style 8-bit
// ─────────────────────────────────────────────

let musicCtx = null;
let musicMaster = null;
let musicRunning = false;
let musicScheduler = null;
let currentBeat = 0;
let musicTempo = 140; // BPM de départ

// Gamme de La mineur naturelle (A, B, C, D, E, F, G)
const SCALE = [
    220.00, // A3
    246.94, // B3
    261.63, // C4
    293.66, // D4
    329.63, // E4
    349.23, // F4
    392.00, // G4
    440.00, // A4
    493.88, // B4
    523.25, // C5
    587.33, // D5
    659.25, // E5
];

// Mélodie principale (index dans SCALE, -1 = silence)
const MELODY = [
    9, 7, 9, 11,   // C5 A4 C5 E5
    7, 4, 7, 9,    // A4 E4 A4 C5
    7, 5, 7, 9,    // A4 F4 A4 C5
    4, 2, 4, 7,    // E4 D4 E4 A4

    9, 7, 9, 11,
    7, 4, 7, 9,
    5, 3, 5, 7,    // F4 D4 F4 A4
    4, -1, 4, -1,  // E4 silence

    // Pont
    2, 4, 5, 7,    // D4 E4 F4 A4
    9, 7, 5, 4,    // C5 A4 F4 E4
    2, 4, 5, 7,
    4, -1, -1, -1,

    // Retour thème
    9, 7, 9, 11,
    7, 4, 7, 9,
    5, 3, 5, 7,
    2, -1, 2, 4,
];

// Basse (octave basse) — pattern rythmique
const BASS = [
    0, -1, 4, -1,  // A2 silence E3 silence
    0, -1, 0, -1,
    5, -1, 3, -1,  // F3 D3
    4, -1, 4, -1,

    0, -1, 4, -1,
    0, -1, 0, -1,
    5, -1, 3, -1,
    4, -1, -1, -1,

    3, -1, 5, -1,
    0, -1, 5, -1,
    3, -1, 5, -1,
    4, -1, -1, -1,

    0, -1, 4, -1,
    0, -1, 0, -1,
    5, -1, 3, -1,
    3, -1, 0, -1,
];

// Accord d'arpège (joué sur les temps forts)
const CHORD_PATTERN = [1, 0, 1, 0, 1, 0, 1, 0]; // 1 = jouer accord
const CHORDS = [
    [0, 2, 4],  // Am  A C E
    [0, 2, 4],
    [5, 7, 9],  // F   F A C
    [4, 6, 9],  // Em  E G B
];

function getMusicCtx() {
    if (!musicCtx) {
        musicCtx = new (window.AudioContext || window.webkitAudioContext)();
        musicMaster = musicCtx.createGain();
        musicMaster.gain.value = 0.18;
        musicMaster.connect(musicCtx.destination);
    }
    if (musicCtx.state === 'suspended') musicCtx.resume();
    return musicCtx;
}

function scheduleNote(freq, startTime, duration, type = 'square', vol = 0.5) {
    const ctx = getMusicCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(vol, startTime + 0.005);
    g.gain.setValueAtTime(vol, startTime + duration * 0.7);
    g.gain.linearRampToValueAtTime(0, startTime + duration * 0.95);

    osc.connect(g);
    g.connect(musicMaster);
    osc.start(startTime);
    osc.stop(startTime + duration);
}

function scheduleBar() {
    const ctx = getMusicCtx();
    const beatDuration = 60 / musicTempo;        // durée d'un beat en sec
    const noteDuration = beatDuration * 0.5;      // noire = 0.5 beat
    const now = ctx.currentTime + 0.05;           // petit buffer

    for (let step = 0; step < 4; step++) {
        const beatIdx = (currentBeat * 4 + step) % MELODY.length;
        const t = now + step * noteDuration;

        // Mélodie
        const mi = MELODY[beatIdx];
        if (mi >= 0 && mi < SCALE.length) {
            scheduleNote(SCALE[mi], t, noteDuration, 'square', 0.45);
        }

        // Basse (une octave en dessous)
        const bi = BASS[beatIdx];
        if (bi >= 0 && bi < SCALE.length) {
            scheduleNote(SCALE[bi] / 2, t, noteDuration, 'triangle', 0.55);
        }

        // Hi-hat subtil sur chaque step
        scheduleHihat(t, noteDuration * 0.1);

        // Kick sur les temps 1 et 3
        if (step === 0 || step === 2) {
            scheduleKick(t);
        }

        // Snare sur les temps 2 et 4
        if (step === 1 || step === 3) {
            scheduleSnare(t);
        }
    }

    currentBeat = (currentBeat + 1) % (MELODY.length / 4);
}

function scheduleKick(t) {
    const ctx = getMusicCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);

    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(g); g.connect(musicMaster);
    osc.start(t); osc.stop(t + 0.1);
}

function scheduleSnare(t) {
    const ctx = getMusicCtx();

    // Bruit blanc court
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    src.connect(hp); hp.connect(g); g.connect(musicMaster);
    src.start(t); src.stop(t + 0.08);
}

function scheduleHihat(t, dur) {
    const ctx = getMusicCtx();
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8000;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(hp); hp.connect(g); g.connect(musicMaster);
    src.start(t); src.stop(t + dur);
}

export function startMusic() {
    if (musicRunning || !isMusicEnabled) return;
    musicRunning = true;
    currentBeat = 0;
    getMusicCtx();

    const beatDuration = 60 / musicTempo;
    const barDuration = beatDuration * 4 * 0.5; // 4 steps × noire

    scheduleBar(); // première barre immédiate
    musicScheduler = setInterval(() => {
        if (musicRunning) scheduleBar();
    }, barDuration * 1000);
}

export function stopMusic() {
    musicRunning = false;
    if (musicScheduler) {
        clearInterval(musicScheduler);
        musicScheduler = null;
    }
    // Fade out progressif
    if (musicMaster) {
        const ctx = getMusicCtx();
        musicMaster.gain.setValueAtTime(musicMaster.gain.value, ctx.currentTime);
        musicMaster.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        setTimeout(() => {
            if (musicMaster) musicMaster.gain.value = 0.18;
        }, 600);
    }
}

export function setMusicTempo(bpm) {
    musicTempo = Math.min(220, Math.max(80, bpm));
}

export function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    localStorage.setItem("fallingBlocks_sound", isSoundEnabled);
    return isSoundEnabled;
}

export function toggleMusic() {
    isMusicEnabled = !isMusicEnabled;
    localStorage.setItem("fallingBlocks_music", isMusicEnabled);
    if (isMusicEnabled) {
        startMusic();
    } else {
        stopMusic();
    }
    return isMusicEnabled;
}

export function getSoundEnabled() {
    return isSoundEnabled;
}

export function getMusicEnabled() {
    return isMusicEnabled;
}
