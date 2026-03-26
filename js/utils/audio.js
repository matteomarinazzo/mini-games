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

    // ─────────────────────────────────────────────
    // SONS — Falling Blocks
    // ─────────────────────────────────────────────

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

    // ── ROTATE ET SOFTDROP: petit bip ascendant ────────────────────
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

    // ─────────────────────────────────────────────
    // SONS — Block Puzzle
    // ─────────────────────────────────────────────
    // ── POSE PIECE : impact doux et satisfaisant ───────────────────
    else if (type === 'bp_place') {
        const master = out(ctx, 0.75);

        // Impact principal — Thump boisé
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.6, now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.15);

        // Click d'attaque percutant
        const tok = ctx.createOscillator();
        const tg = ctx.createGain();
        tok.type = 'square';
        tok.frequency.setValueAtTime(800, now);
        tok.frequency.exponentialRampToValueAtTime(200, now + 0.03);
        tg.gain.setValueAtTime(0.15, now);
        tg.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        tok.connect(tg); tg.connect(master);
        tok.start(now); tok.stop(now + 0.03);

        // Résonance douce
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(300, now);
        g2.gain.setValueAtTime(0.3, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc2.connect(g2); g2.connect(master);
        osc2.start(now + 0.01); osc2.stop(now + 0.11);
    }

    // ── Ligne/colonne complétée ────────────────────────────────────
    else if (type === 'bp_clear1') {
        const master = out(ctx, 0.8);
        [523, 659].forEach((f, i) => {
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

    // ── Plusieurs lignes/colonnes en même temps ────────────────────
    else if (type === 'bp_clear_multi') {
        const master = out(ctx, 1.0);
        [523, 659, 784, 1046].forEach((f, i) => {
            const t = now + i * 0.07;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.55, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.15);
            const osc2 = ctx.createOscillator();
            const g2 = ctx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(f * 1.5, t);
            g2.gain.setValueAtTime(0.18, t);
            g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc2.connect(g2); g2.connect(master);
            osc2.start(t); osc2.stop(t + 0.12);
        });
    }

    // ── Game over block puzzle ──────────────────────────────────────
    else if (type === 'bp_gameover') {
        const master = out(ctx, 1.0);
        [392, 349, 294, 261, 220].forEach((f, i) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const t = now + i * 0.12;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.45, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.18);
        });
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, now + 0.7);
        osc.frequency.exponentialRampToValueAtTime(55, now + 1.2);
        g.gain.setValueAtTime(0.7, now + 0.7);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
        osc.connect(g); g.connect(master);
        osc.start(now + 0.7); osc.stop(now + 1.3);
    }

    // ─────────────────────────────────────────────
    // SONS — Ball Sort
    // ─────────────────────────────────────────────
    else if (type === 'bs_move') {
        const master = out(ctx, 1.0);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
        g.gain.setValueAtTime(0.5, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.08);
    }
    else if (type === 'bs_tube_complete') {
        const master = out(ctx, 0.6);
        [523, 659, 784].forEach((f, i) => {
            const t = now + i * 0.06;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.4, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.15);
        });
    }
    else if (type === 'bs_win') {
        const master = out(ctx, 0.8);
        const notes = [392, 523, 659, 784, 1046];
        notes.forEach((f, i) => {
            const t = now + i * 0.1;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.3, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.3);
        });
    }

    // ── LIFT : son de succion "suup" ────────────────────────────────
    else if (type === 'bs_lift') {
        const master = out(ctx, 1.0);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.25);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.4, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.3);
    }

    // ── LOWER : son inverse de "suup" (700 -> 300 Hz) ───────────────
    else if (type === 'bs_lower') {
        const master = out(ctx, 0.6);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.25);
        g.gain.setValueAtTime(0.4, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.3);
    }

    // ─────────────────────────────────────────────
    // SONS — Layer Pile (Migrés de game.js)
    // ─────────────────────────────────────────────
    else if (type === 'lp_drop') {
        const master = out(ctx, 0.9);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);
        g.gain.setValueAtTime(0.8, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.12);

        const click = ctx.createOscillator();
        const cg = ctx.createGain();
        click.type = "square";
        click.frequency.setValueAtTime(900, now);
        cg.gain.setValueAtTime(0.25, now);
        cg.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        click.connect(cg); cg.connect(master);
        click.start(now); click.stop(now + 0.05);
    }
    else if (type === 'lp_perfect') {
        const master = out(ctx, 0.8);
        const osc1 = ctx.createOscillator();
        const g1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(650, now);
        osc1.frequency.exponentialRampToValueAtTime(1500, now + 0.18);
        g1.gain.setValueAtTime(0.9, now);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc1.connect(g1); g1.connect(master);
        osc1.start(now); osc1.stop(now + 0.22);
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(1800, now + 0.02);
        osc2.frequency.exponentialRampToValueAtTime(2600, now + 0.12);
        g2.gain.setValueAtTime(0.4, now + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc2.connect(g2); g2.connect(master);
        osc2.start(now + 0.02); osc2.stop(now + 0.14);
        const osc3 = ctx.createOscillator();
        const g3 = ctx.createGain();
        osc3.type = "square";
        osc3.frequency.setValueAtTime(2400, now);
        g3.gain.setValueAtTime(0.25, now);
        g3.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc3.connect(g3); g3.connect(master);
        osc3.start(now); osc3.stop(now + 0.05);
    }
    else if (type === 'lp_gameover') {
        const master = out(ctx, 0.9);
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass"; hp.frequency.value = 400;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        src.connect(hp); hp.connect(gain); gain.connect(master);
        src.start(now); src.stop(now + 0.4);
        const osc = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(90, now + 0.05);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
        g2.gain.setValueAtTime(1.0, now + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g2); g2.connect(master);
        osc.start(now + 0.05); osc.stop(now + 0.3);
    }
    else if (type === 'menu_hover') {
        const master = out(ctx, 0.4);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
        g.gain.setValueAtTime(0.3, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.1);
    }
}

// ─────────────────────────────────────────────
// MUSIQUE — Falling Blocks (style 8-bit, La mineur)
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

// ─────────────────────────────────────────────
// MUSIQUE — Block Puzzle (ambient relaxant, Do majeur)
// ─────────────────────────────────────────────

let bpMusicCtx = null;
let bpMusicMaster = null;
let bpMusicRunning = false;
let bpMusicScheduler = null;
let bpBeat = 0;
const BP_TEMPO = 82; // Plus vif pour moins de "blues"

// Gamme de Do majeur étendue (Pentatonique + notes de passage)
const BP_SCALE = [
    130.81, 146.83, 164.81, 196.00, 220.00, // C3-A3 (Basse) 0-4
    261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, // C4-B4 5-11
    523.25, 587.33, 659.25, 784.00, 880.00, // C5-A5 12-16
    1046.50 // C6 17
];

// Mélodie plus rythmée et joyeuse
const BP_MELODY = [
    12, 14, 12, -1, 15, 14, 12, -1, 10, 11, 12, -1, 10, -1, -1, -1,
    9, 10, 9, -1, 12, 10, 9, -1, 7, 8, 9, -1, 5, -1, -1, -1,
    12, 14, 12, -1, 15, 14, 17, -1, 14, 15, 12, -1, 10, -1, -1, -1,
    11, 12, 11, -1, 9, 10, 7, -1, 5, 7, 5, -1, 0, -1, -1, -1,
];

// Harmonie plus légère
const BP_HARMONY = [
    -1, -1, 16, 17, -1, -1, 15, 16, -1, -1, 14, 15, -1, -1, -1, -1,
    -1, -1, 14, 15, -1, -1, 12, 14, -1, -1, 10, 12, -1, -1, -1, -1,
    -1, -1, 17, 18, -1, -1, 16, 17, -1, -1, 14, 15, -1, -1, -1, -1,
    -1, -1, 13, 14, -1, -1, 12, 13, -1, -1, 10, 12, -1, -1, -1, -1,
];

// Basse profonde
const BP_BASS = [
    0, -1, -1, -1, 0, -1, -1, -1, 3, -1, -1, -1, 3, -1, -1, -1,
    4, -1, -1, -1, 4, -1, -1, -1, 1, -1, -1, -1, 2, -1, -1, -1,
    0, -1, -1, -1, 0, -1, -1, -1, 3, -1, -1, -1, 1, -1, -1, -1,
    2, -1, -1, -1, 1, -1, -1, -1, 4, -1, -1, -1, 0, -1, -1, -1,
];

function getBpCtx() {
    if (!bpMusicCtx) {
        bpMusicCtx = new (window.AudioContext || window.webkitAudioContext)();
        bpMusicMaster = bpMusicCtx.createGain();
        bpMusicMaster.gain.value = 0.15;
        bpMusicMaster.connect(bpMusicCtx.destination);
    }
    if (bpMusicCtx.state === 'suspended') bpMusicCtx.resume();
    return bpMusicCtx;
}

function scheduleNote_bp(freq, startTime, duration, vol = 0.5, type = 'sine') {
    const ctx = getBpCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    // Enveloppe plus "plucked" (attaque plus rapide, moins de sustain)
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(vol, startTime + 0.01);
    g.gain.linearRampToValueAtTime(vol * 0.5, startTime + duration * 0.4);
    g.gain.linearRampToValueAtTime(0, startTime + duration * 1.5);

    osc.connect(g); g.connect(bpMusicMaster);
    osc.start(startTime); osc.stop(startTime + duration * 1.6);

    // Simulation d'écho léger
    if (vol > 0.05) {
        const d_osc = ctx.createOscillator();
        const d_g = ctx.createGain();
        const delayTime = startTime + 0.3;
        d_osc.type = 'sine';
        d_osc.frequency.setValueAtTime(freq, delayTime);
        d_g.gain.setValueAtTime(0, delayTime);
        d_g.gain.linearRampToValueAtTime(vol * 0.25, delayTime + 0.05);
        d_g.gain.exponentialRampToValueAtTime(0.001, delayTime + 0.8);
        d_osc.connect(d_g); d_g.connect(bpMusicMaster);
        d_osc.start(delayTime); d_osc.stop(delayTime + 0.9);
    }
}

function scheduleShaker(t, dur) {
    const ctx = getBpCtx();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.05;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.015, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp); hp.connect(g); g.connect(bpMusicMaster);
    src.start(t); src.stop(t + dur);
}

function scheduleChime(freq, t) {
    const ctx = getBpCtx();
    // Petite cloche (onde triangle avec harmonique pure)
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    osc.connect(g); g.connect(bpMusicMaster);
    osc.start(t); osc.stop(t + 1.1);
}

function scheduleBar_bp() {
    const ctx = getBpCtx();
    const beatDur = 60 / BP_TEMPO;
    const noteDur = beatDur * 1.2; // notes un peu longues pour le fondu
    const now = ctx.currentTime + 0.05;

    for (let step = 0; step < 4; step++) {
        const idx = (bpBeat * 4 + step) % BP_MELODY.length;
        const t = now + step * beatDur;

        // Shaker léger pour le momentum (tous les steps ou tous les 2 steps)
        scheduleShaker(t, 0.02);

        // Mélodie (pure sine, plus plucky)
        const mi = BP_MELODY[idx];
        if (mi >= 0 && mi < BP_SCALE.length) {
            scheduleNote_bp(BP_SCALE[mi], t, noteDur * 0.7, 0.35, 'sine');
            // Léger chime sur les temps forts
            if (step === 0 || step === 2) scheduleChime(BP_SCALE[mi] * 2, t);
        }

        // Harmonie (triangle très subtil)
        const hi = BP_HARMONY[idx];
        if (hi >= 0 && hi < BP_SCALE.length) {
            scheduleNote_bp(BP_SCALE[hi], t, noteDur * 0.5, 0.12, 'triangle');
        }

        // Basse (sine profonde, ponctuelle)
        const bi = BP_BASS[idx];
        if (bi >= 0 && bi < BP_SCALE.length) {
            scheduleNote_bp(BP_SCALE[bi], t, noteDur * 1.2, 0.3, 'sine');
        }

        // Pad harmonique sur chaque début de mesure (accord flottant)
        if (step === 0) {
            const chord = [BP_SCALE[5], BP_SCALE[9], BP_SCALE[12]]; // C4 G4 C5
            chord.forEach((f, i) => {
                const tChord = t + i * 0.03;
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, tChord);
                g.gain.setValueAtTime(0, tChord);
                g.gain.linearRampToValueAtTime(0.03, tChord + 0.5);
                g.gain.linearRampToValueAtTime(0, tChord + beatDur * 3.5);
                osc.connect(g); g.connect(bpMusicMaster);
                osc.start(tChord); osc.stop(tChord + beatDur * 3.6);
            });
        }
    }

    bpBeat = (bpBeat + 1) % (BP_MELODY.length / 4);
}

export function startBpMusic() {
    if (bpMusicRunning || !isMusicEnabled) return;
    bpMusicRunning = true;
    bpBeat = 0;
    getBpCtx();
    const beatDur = 60 / BP_TEMPO;
    const barDur = beatDur * 4;
    scheduleBar_bp();
    bpMusicScheduler = setInterval(() => {
        if (bpMusicRunning) scheduleBar_bp();
    }, barDur * 1000);
}

export function stopBpMusic() {
    bpMusicRunning = false;
    if (bpMusicScheduler) { clearInterval(bpMusicScheduler); bpMusicScheduler = null; }
    if (bpMusicMaster) {
        const ctx = getBpCtx();
        bpMusicMaster.gain.setValueAtTime(bpMusicMaster.gain.value, ctx.currentTime);
        bpMusicMaster.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
        setTimeout(() => { if (bpMusicMaster) bpMusicMaster.gain.value = 0.15; }, 900);
    }
}

// ─────────────────────────────────────────────
// MUSIQUE — Ball Sort
// ─────────────────────────────────────────────
let bsMusicRunning = false;
let bsMusicScheduler = null;
let bsBeat = 0;
const BS_TEMPO = 92;
const BS_SCALE = [196.00, 220.00, 246.94, 293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25, 784.00, 880.00];
const BS_MELODY = [5, -1, 7, 5, 9, -1, 7, -1, 5, 7, 9, -1, 4, -1, -1, -1, 3, -1, 5, 3, 7, -1, 5, -1, 3, 5, 7, -1, 2, -1, -1, -1, 5, -1, 7, 5, 9, -1, 12, -1, 7, 9, 12, -1, 5, -1, -1, -1, 4, -1, 5, -1, 3, -1, 2, -1, 0, -1, -1, -1, -1, -1, -1, -1];

function scheduleNote_bs(freq, startTime, duration, vol = 0.4) {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(vol, startTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(startTime); osc.stop(startTime + duration);
}

function scheduleBar_bs() {
    const ctx = getAudioCtx();
    const beatDur = 60 / BS_TEMPO;
    const now = ctx.currentTime + 0.05;
    for (let step = 0; step < 4; step++) {
        const idx = (bsBeat * 4 + step) % BS_MELODY.length;
        const t = now + step * (beatDur / 2);
        const mi = BS_MELODY[idx];
        if (mi >= 0 && mi < BS_SCALE.length) scheduleNote_bs(BS_SCALE[mi], t, beatDur, 0.18);
        if (step === 0 && (bsBeat % 2 === 0)) scheduleNote_bs(BS_SCALE[0] / 2, t, beatDur * 2, 0.12);
    }
    bsBeat++;
}

export function startBsMusic() {
    if (bsMusicRunning || !isMusicEnabled) return;
    bsMusicRunning = true;
    bsBeat = 0;
    const beatDur = 60 / BS_TEMPO;
    scheduleBar_bs();
    bsMusicScheduler = setInterval(() => { if (bsMusicRunning) scheduleBar_bs(); }, beatDur * 2000);
}

export function stopBsMusic() {
    bsMusicRunning = false;
    if (bsMusicScheduler) { clearInterval(bsMusicScheduler); bsMusicScheduler = null; }
}

export function toggleBsMusic() {
    isMusicEnabled = !isMusicEnabled;
    localStorage.setItem("mg_music", isMusicEnabled);
    if (isMusicEnabled) startBsMusic();
    else stopBsMusic();
    return isMusicEnabled;
}

// ─────────────────────────────────────────────
// MUSIQUE — Layer Pile (B mineur, techno-stressante légère)
// ─────────────────────────────────────────────
let lpMusicRunning = false;
let lpMusicScheduler = null;
let lpBeat = 0;
const LP_TEMPO = 115;

const LP_SCALE = [
    246.94, 277.18, 293.66, 329.63, 369.99, 392.00, 440.00, // B3 C#4 D4 E4 F#4 G4 A4
    493.88, 554.37, 587.33, 659.25, 739.99, 783.99, 880.00  // B4 C#5 D5 E5 F#5 G5 A5
];

const LP_MELODY = [
    10, -1, 10, -1, 12, -1, 11, -1, 9, -1, 9, -1, 11, -1, 10, -1,
    7, -1, 7, -1, 9, -1, 8, -1, 6, -1, 6, -1, 8, -1, 7, -1,
    0, 2, 4, 7, 0, 2, 4, 7, 1, 3, 5, 8, 1, 3, 5, 8,
    4, 5, 6, 7, 8, 7, 6, 5, 4, 2, 0, -1, -1, -1, -1, -1
];

function scheduleNote_lp(freq, startTime, duration, vol = 0.4, type = 'triangle') {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(vol, startTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(startTime); osc.stop(startTime + duration);
}

function scheduleBar_lp() {
    const ctx = getAudioCtx();
    const beatDur = 60 / LP_TEMPO;
    const now = ctx.currentTime + 0.05;

    for (let step = 0; step < 4; step++) {
        const idx = (lpBeat * 4 + step) % LP_MELODY.length;
        const t = now + step * (beatDur / 2); // 8th notes

        const mi = LP_MELODY[idx];
        if (mi >= 0) {
            scheduleNote_lp(LP_SCALE[mi % LP_SCALE.length], t, beatDur * 0.4, 0.15, 'triangle');
        }

        // Kick électronique saturé
        if (step === 0 || step === 2) {
            const kosc = ctx.createOscillator();
            const kg = ctx.createGain();
            kosc.type = 'sine';
            kosc.frequency.setValueAtTime(150, t);
            kosc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
            kg.gain.setValueAtTime(0.5, t);
            kg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            kosc.connect(kg); kg.connect(ctx.destination);
            kosc.start(t); kosc.stop(t + 0.12);
        }

        // Basse syncopée
        if (step === 1 || step === 3) {
            scheduleNote_lp(LP_SCALE[0] / 2, t, beatDur, 0.2, 'sawtooth');
        }
    }
    lpBeat++;
}

export function startLpMusic() {
    if (lpMusicRunning || !isMusicEnabled) return;
    lpMusicRunning = true;
    lpBeat = 0;
    const beatDur = 60 / LP_TEMPO;
    scheduleBar_lp();
    lpMusicScheduler = setInterval(() => {
        if (lpMusicRunning) scheduleBar_lp();
    }, beatDur * 2 * 1000);
}

export function stopLpMusic() {
    lpMusicRunning = false;
    if (lpMusicScheduler) { clearInterval(lpMusicScheduler); lpMusicScheduler = null; }
}

export function toggleLpMusic() {
    isMusicEnabled = !isMusicEnabled;
    localStorage.setItem("mg_music", isMusicEnabled);
    if (isMusicEnabled) startLpMusic();
    else stopLpMusic();
    return isMusicEnabled;
}

// ─────────────────────────────────────────────
// MUSIQUE — Menu Principal (Calme, accueillante)
// ─────────────────────────────────────────────
let menuMusicRunning = false;
let menuMusicScheduler = null;
let menuBeat = 0;
const MENU_TEMPO = 82;

const MENU_SCALE = [
    261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, // C4 D4 E4 F4 G4 A4 B4
    523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77  // C5 D5 E5 F5 G5 A5 B5
];

const MENU_MELODY = [
    0, -1, 4, -1, 7, -1, 4, -1,
    2, -1, 5, -1, 9, -1, 5, -1,
    0, -1, 4, -1, 7, -1, 11, -1,
    9, -1, 7, -1, 5, -1, 4, -1
];

function scheduleNote_menu(freq, startTime, duration, vol = 0.2) {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(vol, startTime + 0.1);
    g.gain.linearRampToValueAtTime(0, startTime + duration);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(startTime); osc.stop(startTime + duration);
}

function scheduleBar_menu() {
    const ctx = getAudioCtx();
    const beatDur = 60 / MENU_TEMPO;
    const now = ctx.currentTime + 0.05;

    for (let step = 0; step < 8; step++) {
        const idx = (menuBeat * 8 + step) % MENU_MELODY.length;
        const t = now + step * (beatDur / 2);

        const mi = MENU_MELODY[idx];
        if (mi >= 0) {
            scheduleNote_menu(MENU_SCALE[mi % MENU_SCALE.length], t, beatDur * 0.8, 0.1);
        }

        // Basse très douce
        if (step === 0) {
            scheduleNote_menu(MENU_SCALE[0] / 2, t, beatDur * 2, 0.15);
        }
    }
    menuBeat++;
}

export function startMenuMusic() {
    if (menuMusicRunning || !isMusicEnabled) return;
    menuMusicRunning = true;
    menuBeat = 0;
    const beatDur = 60 / MENU_TEMPO;
    scheduleBar_menu();
    menuMusicScheduler = setInterval(() => {
        if (menuMusicRunning) scheduleBar_menu();
    }, beatDur * 4 * 1000);
}

export function stopMenuMusic() {
    menuMusicRunning = false;
    if (menuMusicScheduler) { clearInterval(menuMusicScheduler); menuMusicScheduler = null; }
}

export function toggleMenuMusic() {
    isMusicEnabled = !isMusicEnabled;
    localStorage.setItem("mg_music", isMusicEnabled);
    if (isMusicEnabled) startMenuMusic();
    else stopMenuMusic();
    return isMusicEnabled;
}

// ─────────────────────────────────────────────
// TOGGLES & STATE
// ─────────────────────────────────────────────
export function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    localStorage.setItem("mg_sound", isSoundEnabled);
    return isSoundEnabled;
}

export function toggleMusic() {
    isMusicEnabled = !isMusicEnabled;
    localStorage.setItem("mg_music", isMusicEnabled);
    if (isMusicEnabled) {
        // Redémarre la musique par défaut (Falling Blocks) si rien d'autre ne tourne
        if (!musicRunning && !bpMusicRunning && !bsMusicRunning && !lpMusicRunning) {
            startMusic();
        }
    } else {
        stopMusic();
        stopBpMusic();
        stopBsMusic();
        stopLpMusic();
        stopMenuMusic();
    }
    return isMusicEnabled;
}

// Version spécialisée pour block puzzle
export function toggleBpMusic() {
    isMusicEnabled = !isMusicEnabled;
    localStorage.setItem("mg_music", isMusicEnabled);
    if (isMusicEnabled) {
        startBpMusic();
    } else {
        stopBpMusic();
        stopMusic();
        stopBsMusic();
        stopLpMusic();
    }
    return isMusicEnabled;
}

export function getSoundEnabled() { return isSoundEnabled; }
export function getMusicEnabled() { return isMusicEnabled; }
export function setMusicTempo(bpm) { musicTempo = Math.min(220, Math.max(80, bpm)); }