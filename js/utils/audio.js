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

    // ─────────────────────────────────────────────
    // SONS — GeoQuiz
    // ─────────────────────────────────────────────

    // ── UI CLICK : Petit clic net et satisfaisant ──────────────
    else if (type === 'gq_ui_click') {
        const master = out(ctx, 0.7);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
        g.gain.setValueAtTime(0.4, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.08);
    }

    // ── START GAME : Transition ascendante ────────────────────
    else if (type === 'gq_start') {
        const master = out(ctx, 0.9);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.4);
        g.gain.setValueAtTime(0.5, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.45);
    }

    // ── CORRECT (1er essai) : Fanfare de victoire brillante ────────
    else if (type === 'gq_correct_1') {
        const master = out(ctx, 0.9);
        const notes = [1046, 1318, 1567]; // Do6, Mi6, Sol6 (Accord majeur)
        notes.forEach((f, i) => {
            const t = now + i * 0.07;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.55, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.3);
        });
    }

    // ── CORRECT (2e essai) : Chime de succès simple ──────────────
    else if (type === 'gq_correct_2') {
        const master = out(ctx, 0.8);
        [880, 1174].forEach((f, i) => { // La5, Re6
            const t = now + i * 0.05;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.5, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.2);
        });
    }

    // ── FAIL MID : Buzz discordant (encore des essais) ──────
    else if (type === 'gq_fail_mid') {
        const master = out(ctx, 0.7);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.12);

        g.gain.setValueAtTime(0.4, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(filter); filter.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.15);
    }

    // ── FAIL FINAL : Son de défaite descendant (glissando) ────────
    else if (type === 'gq_fail_final') {
        const master = out(ctx, 0.9);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoG = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.5);

        lfo.type = 'sine';
        lfo.frequency.value = 15;
        lfoG.gain.value = 20;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.linearRampToValueAtTime(100, now + 0.5);

        g.gain.setValueAtTime(0.6, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        lfo.connect(lfoG); lfoG.connect(osc.frequency);
        osc.connect(filter); filter.connect(g); g.connect(master);
        lfo.start(now); osc.start(now);
        lfo.stop(now + 0.5); osc.stop(now + 0.5);
    }

    // ── RESULT PERFECT (100%) : Fanfare héroïque ───────────────
    else if (type === 'gq_result_perfect') {
        const master = out(ctx, 1.0);
        const notes = [523, 659, 784, 1046, 1318];
        notes.forEach((f, i) => {
            const t = now + i * 0.12;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.3, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.5);
        });
    }

    // ── RESULT GOOD (80%+) : Accord majeur joyeux ──────────────
    else if (type === 'gq_result_good') {
        const master = out(ctx, 0.8);
        [523, 659, 784].forEach(f => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, now);
            g.gain.setValueAtTime(0.25, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
            osc.connect(g); g.connect(master);
            osc.start(now); osc.stop(now + 0.8);
        });
    }

    // ── RESULT MEH (50%+) : Carillon neutre ────────────────────
    else if (type === 'gq_result_meh') {
        const master = out(ctx, 0.6);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        g.gain.setValueAtTime(0.4, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.5);
    }

    // ── RESULT BAD (<50%) : Suite mineure triste ───────────────
    else if (type === 'gq_result_bad') {
        const master = out(ctx, 0.8);
        const notes = [392, 349, 311, 261];
        notes.forEach((f, i) => {
            const t = now + i * 0.2;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.3, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.4);
        });
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
        stopCasinoMusic();
        stopFunfairMusic();
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
        stopMenuMusic();
        stopCasinoMusic();
        stopFunfairMusic();
    }
    return isMusicEnabled;
}

export function getSoundEnabled() { return isSoundEnabled; }
export function getMusicEnabled() { return isMusicEnabled; }
export function setMusicTempo(bpm) { musicTempo = Math.min(220, Math.max(80, bpm)); }

// ─────────────────────────────────────────────
// AUDIO ENGINE — CASINO
// ─────────────────────────────────────────────

let casinoMusicRunning = false;
let casinoMusicScheduler = null;
let casinoBeat = 0;
const CASINO_TEMPO = 100;
const CASINO_SCALE = [164.81, 185.00, 207.65, 220.00, 246.94, 277.18, 293.66, 329.63]; // Mi, Fa#, Sol#, La, Si, Do#, Ré, Mi (E major)
const CASINO_BASS = [
    [0, 2, 4, 3], // E -> G# -> B -> A
    [3, 5, 7, 5], // A -> C# -> E -> C#
    [4, 6, 8, 6], // B -> D# ... (adjustment)
    [3, 2, 1, 0]  // Walking back
];

export function playCasinoSound(type, param = null) {
    if (!isSoundEnabled) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    if (type === 'scratch') {
        // Bruit de grattage : multiples petits balayages
        const master = out(ctx, 0.4);
        for (let i = 0; i < 3; i++) {
            const t = now + i * 0.1;
            const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * 0.8;
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(3000, t);
            filter.frequency.exponentialRampToValueAtTime(800, t + 0.08);
            filter.Q.value = 1;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(1, t + 0.02);
            gain.gain.linearRampToValueAtTime(0.01, t + 0.08);
            src.connect(filter); filter.connect(gain); gain.connect(master);
            src.start(t); src.stop(t + 0.08);
        }
    }
    else if (type === 'win') {
        // Fanfare joyeuse (Accord majeur montant)
        const master = out(ctx, 0.6);
        const notes = [523.25, 659.25, 783.99, 1046.50]; // Do5, Mi5, Sol5, Do6
        notes.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, now + i * 0.1);
            gain.gain.setValueAtTime(0.3, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.4);
            osc.connect(gain); gain.connect(master);
            osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.4);
        });
    }
    else if (type === 'jackpot') {
        const master = out(ctx, 0.8);
        const notes = [523.25, 659.25, 783.99, 1046.50]; // Do, Mi, Sol, Do (+ arpèges rapides)
        for (let j = 0; j < 6; j++) {
            notes.forEach((f, i) => {
                const t = now + j * 0.2 + i * 0.05;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(f, t);
                gain.gain.setValueAtTime(0.4, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(3000, t);

                osc.connect(filter); filter.connect(gain); gain.connect(master);
                osc.start(t); osc.stop(t + 0.15);
            });
        }
    }
    else if (type === 'lose') {
        // Défaite Casino : Choc de jetons sec (pas de traîne synthé)
        const master = out(ctx, 0.7);
        // Descente de pitch ultra-rapide (Glissando sec)
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(300, now);
        o.frequency.exponentialRampToValueAtTime(50, now + 0.3);
        g.gain.setValueAtTime(0.5, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        o.connect(g); g.connect(master);
        o.start(now); o.stop(now + 0.3);

        // Bruit de jetons/pièces qui s'entrechoquent (instantané)
        for (let i = 0; i < 4; i++) {
            const t = now + i * 0.05;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.index = i;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1500 + Math.random() * 1000, t);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc.connect(gain); gain.connect(master);
            osc.start(t); osc.stop(t + 0.08);
        }
    }
    else if (type === 'slotsSpin' || type === 'slotsBtn' || type === 'wheelSpin' || type === 'flip') {
        const master = out(ctx, 0.4);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.connect(gain); gain.connect(master);
        osc.start(now); osc.stop(now + 0.05);
    }
    else if (type === 'slotsRolling') {
        // Fast repeating ticks for 3 seconds (covers the full 3-reel spin)
        const master = out(ctx, 0.2);
        for (let i = 0; i < 30; i++) {
            const t = now + i * 0.1;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, t);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
            osc.connect(gain); gain.connect(master);
            osc.start(t); osc.stop(t + 0.05);
        }
    }
    else if (type === 'reelStop') {
        // Mécanique Casino : Pignon Métallique Bloqué (Metallic Lock)
        const master = out(ctx, 0.9);
        // 1. Choc mécanique (Low-end Thump)
        const shock = ctx.createOscillator();
        const shockG = ctx.createGain();
        shock.type = 'square';
        shock.frequency.setValueAtTime(60, now);
        shock.frequency.exponentialRampToValueAtTime(40, now + 0.08);
        shockG.gain.setValueAtTime(0.6, now);
        shockG.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        shock.connect(shockG); shockG.connect(master);
        shock.start(now); shock.stop(now + 0.08);

        // 2. Tintement métallique (High-end Clang)
        const clang = ctx.createOscillator();
        const clangG = ctx.createGain();
        const metalFilter = ctx.createBiquadFilter();
        clang.type = 'sine';
        clang.frequency.setValueAtTime(2500, now);
        metalFilter.type = 'bandpass';
        metalFilter.frequency.value = 2500;
        metalFilter.Q.value = 15; // Résonance métallique
        clangG.gain.setValueAtTime(0, now);
        clangG.gain.linearRampToValueAtTime(0.8, now + 0.005);
        clangG.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        clang.connect(metalFilter); metalFilter.connect(clangG); clangG.connect(master);
        clang.start(now); clang.stop(now + 0.2);

        // 3. Clic de verrouillage (Mechanical Click)
        const click = ctx.createOscillator();
        const clickG = ctx.createGain();
        click.type = 'square';
        click.frequency.setValueAtTime(1200, now);
        clickG.gain.setValueAtTime(0.3, now);
        clickG.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
        click.connect(clickG); clickG.connect(master);
        click.start(now); click.stop(now + 0.02);
    }
    else if (type === 'wheelTick') {
        // Tick léger plastique
        const master = out(ctx, 0.3);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.03);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
        osc.connect(gain); gain.connect(master);
        osc.start(now); osc.stop(now + 0.03);
    }
    else if (type === 'betChange' || type === 'coin') {
        // Petit tintement d'argent/jeton
        const master = out(ctx, 0.4);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1500, now);
        osc.frequency.exponentialRampToValueAtTime(2000, now + 0.1);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain); gain.connect(master);
        osc.start(now); osc.stop(now + 0.1);
    }
    else if (type === 'crashStart') {
        // Synthé montant infini
        const master = out(ctx, 0.4);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 3.0);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.1);
        gain.gain.linearRampToValueAtTime(0, now + 3.0);
        osc.connect(gain); gain.connect(master);
        osc.start(now); osc.stop(now + 3.0);
    }
    else if (type === 'crashExplosion') {
        // Noise boom
        const master = out(ctx, 0.5);
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource();
        src.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + 0.8);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

        src.connect(filter); filter.connect(gain); gain.connect(master);
        src.start(now); src.stop(now + 0.8);
    }
    else if (type === 'plinkoDrop') {
        const master = out(ctx, 0.4);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain); gain.connect(master);
        osc.start(now); osc.stop(now + 0.1);
    }
    else if (type === 'plinkoBounce') {
        const master = out(ctx, 0.3);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800 + Math.random() * 200, now);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.connect(gain); gain.connect(master);
        osc.start(now); osc.stop(now + 0.05);
    }
    else if (type === 'cardDeal') {
        const master = out(ctx, 0.4);
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 4000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        src.connect(filter); filter.connect(gain); gain.connect(master);
        src.start(now); src.stop(now + 0.1);
    }
    else if (type === 'hiloOk') {
        const master = out(ctx, 0.4);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.1);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain); gain.connect(master);
        osc.start(now); osc.stop(now + 0.15);
    }
}

// Casino Music : Lounge Jazz / Walking Beat
function formatCasinoBeat() {
    const ctx = getAudioCtx();
    const beatDur = 60 / CASINO_TEMPO;
    const now = ctx.currentTime + 0.05;

    // Progression d'accords simple (I - IV - V - I)
    const chords = [0, 3, 4, 3]; // E, A, B, A
    const chordIdx = Math.floor(casinoBeat / 4) % chords.length;
    const stepInMeasure = casinoBeat % 4;

    const baseFreq = CASINO_SCALE[chords[chordIdx]];

    // 1. BASSE (Walking Bass)
    const bassNotes = [0, 2, 4, 1]; // Pattern de walking (fondamentale, tierce, quinte...)
    const f = CASINO_SCALE[(chords[chordIdx] + bassNotes[stepInMeasure]) % CASINO_SCALE.length];

    const bOsc = ctx.createOscillator();
    const bG = ctx.createGain();
    const bFilter = ctx.createBiquadFilter();
    bOsc.type = 'triangle';
    bOsc.frequency.setValueAtTime(f / 2, now);
    bFilter.type = 'lowpass';
    bFilter.frequency.setValueAtTime(400, now);
    bG.gain.setValueAtTime(0.6, now); // Vol augmenté (0.35 -> 0.6)
    bG.gain.exponentialRampToValueAtTime(0.01, now + beatDur * 0.9);
    bOsc.connect(bFilter); bFilter.connect(bG); bG.connect(ctx.destination);
    bOsc.start(now); bOsc.stop(now + beatDur * 0.9);

    // 2. DRUMS (Brushed)
    // Kick sur 1 et 3
    if (stepInMeasure === 0 || stepInMeasure === 2) {
        const kOsc = ctx.createOscillator();
        const kG = ctx.createGain();
        kOsc.type = 'sine';
        kOsc.frequency.setValueAtTime(100, now);
        kOsc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        kG.gain.setValueAtTime(0.4, now);
        kG.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        kOsc.connect(kG); kG.connect(ctx.destination);
        kOsc.start(now); kOsc.stop(now + 0.12);
    }
    // Snare (balai) sur 2 et 4
    if (stepInMeasure === 1 || stepInMeasure === 3) {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 2500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        src.connect(f); f.connect(g); g.connect(ctx.destination);
        src.start(now); src.stop(now + 0.08);
    }
    // Hi-hat (swing)
    const hTime = now + beatDur * 0.66; // Off-beat swing
    const hBuf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
    const hD = hBuf.getChannelData(0);
    for (let i = 0; i < hD.length; i++) hD[i] = (Math.random() * 2 - 1) * 0.3;
    const hSrc = ctx.createBufferSource();
    hSrc.buffer = hBuf;
    const hF = ctx.createBiquadFilter();
    hF.type = 'highpass'; hF.frequency.value = 8000;
    const hG = ctx.createGain();
    hG.gain.setValueAtTime(0.04, hTime);
    hG.gain.exponentialRampToValueAtTime(0.001, hTime + 0.03);
    hSrc.connect(hF); hF.connect(hG); hG.connect(ctx.destination);
    hSrc.start(hTime); hSrc.stop(hTime + 0.03);

    // 3. RHODES (Accord 7ème de dominante/majeure sur le contre-temps)
    if (stepInMeasure === 0 || stepInMeasure === 2) {
        const cTime = now + beatDur * 0.25;
        const intervals = [0, 4, 7, 10]; // Dominant 7th approximate
        intervals.forEach(inter => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(baseFreq * Math.pow(2, inter / 12), cTime);
            g.gain.setValueAtTime(0, cTime);
            g.gain.linearRampToValueAtTime(0.12, cTime + 0.05); // Vol augmenté (0.06 -> 0.12)
            g.gain.exponentialRampToValueAtTime(0.001, cTime + beatDur * 0.8);
            o.connect(g); g.connect(ctx.destination);
            o.start(cTime); o.stop(cTime + beatDur * 0.8);
        });
    }

    casinoBeat++;
}

export function startCasinoMusic() {
    if (casinoMusicRunning || !isMusicEnabled) return;
    casinoMusicRunning = true;
    casinoBeat = 0;
    const beatDur = 60 / CASINO_TEMPO;
    formatCasinoBeat();
    casinoMusicScheduler = setInterval(() => {
        if (casinoMusicRunning) formatCasinoBeat();
    }, beatDur * 1000); // Toutes les pulsations pour une walking bass fine
}

export function stopCasinoMusic() {
    casinoMusicRunning = false;
    if (casinoMusicScheduler) { clearInterval(casinoMusicScheduler); casinoMusicScheduler = null; }
}

export function toggleCasinoMusic() {
    isMusicEnabled = !isMusicEnabled;
    localStorage.setItem("mg_music", isMusicEnabled);
    if (isMusicEnabled) startCasinoMusic();
    else stopCasinoMusic();
    return isMusicEnabled;
}

// ─────────────────────────────────────────────
// AUDIO ENGINE — FUNFAIR
// ─────────────────────────────────────────────

let funfairMusicRunning = false;
let funfairMusicScheduler = null;
let funfairBeat = 0;
const FUNFAIR_TEMPO = 140; // Vif et entraînant
// Mélodie simple type carrousel (Valse 3/4)
const FF_MELODY = [
    523.25, 659.25, 783.99, // Do Mi Sol
    783.99, 659.25, 523.25, // Sol Mi Do
    587.33, 698.46, 880.00, // Re Fa La
    880.00, 698.46, 587.33  // La Fa Re
];

export function playFunfairSound(type, param = null) {
    if (!isSoundEnabled) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    if (type === 'throw' || type === 'dartThrow' || type === 'ringThrow') {
        const master = out(ctx, 0.4);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain); gain.connect(master);
        osc.start(now); osc.stop(now + 0.15);
    }
    else if (type === 'cupsCrash') {
        const master = out(ctx, 0.9);
        const now = ctx.currentTime;

        // 1) Impact sec (contact balle → plastique)
        const click = ctx.createOscillator();
        const clickG = ctx.createGain();
        click.type = 'square';
        click.frequency.setValueAtTime(2500, now);
        clickG.gain.setValueAtTime(0.4, now);
        clickG.gain.exponentialRampToValueAtTime(0.001, now + 0.004);
        click.connect(clickG).connect(master);
        click.start(now);
        click.stop(now + 0.004);

        // 2) Résonance creuse du gobelet
        const cup = ctx.createOscillator();
        const cupG = ctx.createGain();
        cup.type = 'sine';
        cup.frequency.setValueAtTime(280, now);          // fréquence creuse typique d’un gobelet
        cup.frequency.exponentialRampToValueAtTime(180, now + 0.12);
        cupG.gain.setValueAtTime(0.5, now);
        cupG.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        cup.connect(cupG).connect(master);
        cup.start(now);
        cup.stop(now + 0.12);

        // 3) Froissement plastique (bruit blanc filtré)
        const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 900;   // plastique froissé
        noiseFilter.Q.value = 6;

        const noiseG = ctx.createGain();
        noiseG.gain.setValueAtTime(0.35, now);
        noiseG.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        noise.connect(noiseFilter).connect(noiseG).connect(master);
        noise.start(now);
        noise.stop(now + 0.03);

        // 4) Petit rebond (optionnel mais réaliste)
        const rebound = ctx.createOscillator();
        const reboundG = ctx.createGain();
        rebound.type = 'triangle';
        rebound.frequency.setValueAtTime(600, now + 0.05);
        reboundG.gain.setValueAtTime(0.15, now + 0.05);
        reboundG.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        rebound.connect(reboundG).connect(master);
        rebound.start(now + 0.05);
        rebound.stop(now + 0.09);
    }
    else if (type === 'shoot') {
        // Tir pistolet à air (Pellet gun) : Puff court + clic mécanique
        const master = out(ctx, 0.6);
        // Détente (Clic)
        const click = ctx.createOscillator();
        const cg = ctx.createGain();
        click.type = 'square'; click.frequency.value = 1000;
        cg.gain.setValueAtTime(0.3, now);
        cg.gain.exponentialRampToValueAtTime(0.01, now + 0.01);
        click.connect(cg); cg.connect(master);
        click.start(now); click.stop(now + 0.01);

        // Puff d'air (Noise)
        const src = ctx.createBufferSource();
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
        src.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(1.0, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        src.connect(f); f.connect(g); g.connect(master);
        src.start(now); src.stop(now + 0.06);
    }
    else if (type === 'shootHit') {
        // Impact métallique standard (RING)
        const master = out(ctx, 0.8);
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const mGain = ctx.createGain();
        const g = ctx.createGain();
        carrier.type = 'sine'; carrier.frequency.value = 800;
        modulator.type = 'sine'; modulator.frequency.value = 312;
        mGain.gain.value = 400;
        modulator.connect(mGain); mGain.connect(carrier.frequency);
        carrier.connect(g); g.connect(master);
        g.gain.setValueAtTime(0.8, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        carrier.start(now); modulator.start(now);
        carrier.stop(now + 0.4); modulator.stop(now + 0.4);
    }
    else if (type === 'shootBullseye') {
        // Cloche de victoire cristaline (BULLSEYE)
        const master = out(ctx, 1.0);
        [1200, 1800, 2400].forEach(freq => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.4, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
            o.connect(g); g.connect(master);
            o.start(now); o.stop(now + 0.8);
        });
    }
    else if (type === 'shootMiss') {
        // Impact sourd (Raté / Bois)
        const master = out(ctx, 0.5);
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(200, now);
        o.frequency.exponentialRampToValueAtTime(80, now + 0.1);
        g.gain.setValueAtTime(0.7, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        o.connect(g); g.connect(master);
        o.start(now); o.stop(now + 0.12);
    }
    else if (type === 'thud' || type === 'dartThud') {
        // Impact fléchette : Clic + Thud
        const master = out(ctx, 0.7);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        g.gain.setValueAtTime(1.0, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.15);
        // Clic attack
        const a = ctx.createOscillator();
        const ag = ctx.createGain();
        a.type = 'square'; a.frequency.value = 5000;
        ag.gain.setValueAtTime(0.4, now);
        ag.gain.exponentialRampToValueAtTime(0.01, now + 0.01);
        a.connect(ag); ag.connect(master);
        a.start(now); a.stop(now + 0.01);
    }
    else if (type === 'pongBounce') {
        const master = out(ctx, 0.6);
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(1000, now);
        o.frequency.exponentialRampToValueAtTime(800, now + 0.04);
        g.gain.setValueAtTime(0.8, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
        o.connect(g); g.connect(master);
        o.start(now); o.stop(now + 0.04);
        // Table thud
        const t = ctx.createOscillator();
        const tg = ctx.createGain();
        t.type = 'sine'; t.frequency.value = 150;
        tg.gain.setValueAtTime(0.5, now);
        tg.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        t.connect(tg); tg.connect(master);
        t.start(now); t.stop(now + 0.05);
    }
    else if (type === 'pongSplash') {
        // "Plop" liquide réaliste
        const master = out(ctx, 0.8);
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(400, now);
        o.frequency.exponentialRampToValueAtTime(700, now + 0.1);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.6, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        o.connect(g); g.connect(master);
        o.start(now); o.stop(now + 0.15);
        // Noise splash
        const n = ctx.createBufferSource();
        const b = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        n.buffer = b;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 1200;
        const gn = ctx.createGain();
        gn.gain.setValueAtTime(0.7, now);
        gn.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        n.connect(f); f.connect(gn); gn.connect(master);
        n.start(now); n.stop(now + 0.2);
    }
    else if (type === 'balloonPop') {
        const master = out(ctx, 1.2);
        const now = ctx.currentTime;

        // 1) Transient ultra-sec (claquement initial)
        const click = ctx.createOscillator();
        const clickG = ctx.createGain();
        click.type = 'square';
        click.frequency.setValueAtTime(1200, now);
        clickG.gain.setValueAtTime(0.6, now);
        clickG.gain.exponentialRampToValueAtTime(0.001, now + 0.003);
        click.connect(clickG).connect(master);
        click.start(now);
        click.stop(now + 0.003);

        // 2) Bruit blanc très court (déchirure du latex)
        const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            // bruit blanc qui décroît très vite
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1800; // ballon = très aigu

        const noiseG = ctx.createGain();
        noiseG.gain.setValueAtTime(1.0, now);
        noiseG.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        noise.connect(noiseFilter).connect(noiseG).connect(master);
        noise.start(now);
        noise.stop(now + 0.03);

        // 3) Mini résonance du latex (court "ping" très faible)
        const ring = ctx.createOscillator();
        const ringG = ctx.createGain();
        ring.type = 'sine';
        ring.frequency.setValueAtTime(750, now);
        ringG.gain.setValueAtTime(0.25, now);
        ringG.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        ring.connect(ringG).connect(master);
        ring.start(now);
        ring.stop(now + 0.05);
    }
    else if (type === 'coverDrop' || type === 'ringClink') {
        const master = out(ctx, 0.6);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(type === 'ringClink' ? 900 : 400, now);
        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain); gain.connect(master);
        osc.start(now); osc.stop(now + 0.15);
    }
    else if (type === 'hammerHit') {
        const master = out(ctx, 1.1);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 800;
        g.gain.setValueAtTime(1.0, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(f); f.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.3);
    }
    else if (type === 'bellRing') {
        const master = out(ctx, 0.9);
        [1500, 2200, 3100].forEach((freq) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.4, now);
            g.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
            o.connect(g); g.connect(master);
            o.start(now); o.stop(now + 1.0);
        });
    }
    else if (type === 'win') {
        const master = out(ctx, 0.7);
        const notes = [523.25, 659.25, 783.99, 1046.50]; // Do, Mi, Sol, Do
        notes.forEach((f, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(f, now + i * 0.1);
            g.gain.setValueAtTime(0.5, now + i * 0.1);
            g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.5);
            o.connect(g); g.connect(master);
            o.start(now + i * 0.1); o.stop(now + i * 0.1 + 0.5);
        });
    }
    else if (type === 'lose') {
        const master = out(ctx, 0.6);
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(300, now);
        o.frequency.linearRampToValueAtTime(100, now + 0.5);
        g.gain.setValueAtTime(0.5, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        o.connect(g); g.connect(master);
        o.start(now); o.stop(now + 0.5);
    }
}

// Funfair Music : Valse Carrousel
function formatFunfairBeat() {
    const ctx = getAudioCtx();
    const beatDur = 60 / FUNFAIR_TEMPO;
    const now = ctx.currentTime + 0.05;

    // Mesure à 3 temps (Valse)
    const isFirstBeat = (funfairBeat % 3 === 0);

    // Basse sur le 1er temps, accords (poumpa poumpa) sur 2 et 3
    if (isFirstBeat) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(130.81, now); // Do3
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + beatDur);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + beatDur);
    } else {
        // Accord d'accompagnement plus léger
        [261.63, 329.63].forEach(f => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + beatDur / 2);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now); osc.stop(now + beatDur / 2);
        });
    }

    // Mélodie
    const noteFreq = FF_MELODY[funfairBeat % FF_MELODY.length];
    const oscM = ctx.createOscillator();
    const gainM = ctx.createGain();
    oscM.type = 'square';
    oscM.frequency.setValueAtTime(noteFreq, now);

    // Filtre pour faire un son d'orgue très doux
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1500;

    gainM.gain.setValueAtTime(0.15, now);
    gainM.gain.exponentialRampToValueAtTime(0.01, now + beatDur * 0.8);

    oscM.connect(filter); filter.connect(gainM); gainM.connect(ctx.destination);
    oscM.start(now); oscM.stop(now + beatDur);

    funfairBeat++;
}

export function startFunfairMusic() {
    if (funfairMusicRunning || !isMusicEnabled) return;
    funfairMusicRunning = true;
    funfairBeat = 0;
    const beatDur = 60 / FUNFAIR_TEMPO;
    formatFunfairBeat();
    funfairMusicScheduler = setInterval(() => {
        if (funfairMusicRunning) formatFunfairBeat();
    }, beatDur * 1000); // Chaque temps
}

export function stopFunfairMusic() {
    funfairMusicRunning = false;
    if (funfairMusicScheduler) { clearInterval(funfairMusicScheduler); funfairMusicScheduler = null; }
}

export function toggleFunfairMusic() {
    isMusicEnabled = !isMusicEnabled;
    localStorage.setItem("mg_music", isMusicEnabled);
    if (isMusicEnabled) startFunfairMusic();
    else stopFunfairMusic();
    return isMusicEnabled;
}

// ─────────────────────────────────────────────
// SONS — Lights Out (Reflex F1) — F1 Authentic
// ─────────────────────────────────────────────

export function playReflexSound(type) {
    if (!isSoundEnabled) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    // ── Appui initial — feedback discret ──────────────────────────────────────
    if (type === 'hold') {
        const master = out(ctx, 0.12);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.08);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.4, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.1);
    }

    // ── Allumage d'un feu — TUT F1 électronique ───────────────────────────────
    else if (type === 'light_on') {
        const master = out(ctx, 1.0);
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(460, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, now);
        filter.Q.value = 0.7;

        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.9, now + 0.004);
        g.gain.setValueAtTime(0.85, now + 0.055);
        g.gain.linearRampToValueAtTime(0, now + 0.07);

        osc.connect(filter); filter.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.08);

        // Transient claquant
        const click = ctx.createOscillator();
        const cg = ctx.createGain();
        click.type = 'sine';
        click.frequency.setValueAtTime(1500, now);
        cg.gain.setValueAtTime(0.18, now);
        cg.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
        click.connect(cg); cg.connect(master);
        click.start(now); click.stop(now + 0.012);
    }

    // ── Extinction des feux — silence + WHOOSH départ ─────────────────────────
    else if (type === 'lights_out') {
        const master = out(ctx, 1.1);

        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(500, now); // plus aigu que light_on

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, now);
        filter.Q.value = 0.7;

        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(1.0, now + 0.004);
        g.gain.setValueAtTime(0.95, now + 0.13);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(filter); filter.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.22);

        // Transient
        const click = ctx.createOscillator();
        const cg = ctx.createGain();
        click.type = 'sine';
        click.frequency.setValueAtTime(1600, now);
        cg.gain.setValueAtTime(0.22, now);
        cg.gain.exponentialRampToValueAtTime(0.001, now + 0.012);
        click.connect(cg); cg.connect(master);
        click.start(now); click.stop(now + 0.012);

        // Sub léger
        const sub = ctx.createOscillator();
        const sg = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(100, now);
        sg.gain.setValueAtTime(0, now);
        sg.gain.linearRampToValueAtTime(0.22, now + 0.01);
        sg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        sub.connect(sg); sg.connect(master);
        sub.start(now); sub.stop(now + 0.18);
    }

    // ── Arrêt du chrono — ping net ─────────────────────────────────────────────
    else if (type === 'stop') {
        const master = out(ctx, 0.3); // Baissé pour les clics de menu

        // Ping montant satisfaisant
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(990, now + 0.05);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.8, now + 0.006);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.22);

        // Harmonique douce
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1320, now);
        g2.gain.setValueAtTime(0.18, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc2.connect(g2); g2.connect(master);
        osc2.start(now); osc2.stop(now + 0.14);
    }

    // ── Pénalité faux départ — alarme sèche ───────────────────────────────────
    else if (type === 'penalty') {
        const master = out(ctx, 0.7);

        [0, 0.18, 0.36].forEach((delay, i) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const t = now + delay;

            const freq = 420 - i * 40; // doux, pas agressif
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);

            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.4, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.2);
        });
    }

    // ─────────────────────────────────────────────
    // SONS — Punch Reflex
    // ─────────────────────────────────────────────

    // ── Apparition d'une cible : Pop mécanique/électrique très court ──────────────
    else if (type === 'punch_spawn') {
        const master = out(ctx, 0.5);

        // "Zap" rapide
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);

        g.gain.setValueAtTime(0.5, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.04);

        // Petit bruit blanc (clic électrique)
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.015, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.4, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
        src.connect(ng); ng.connect(master);
        src.start(now); src.stop(now + 0.015);
    }

    // ── Coup réussi : Petite réussite (Tock + Note douce) ───────────────
    else if (type === 'punch_hit') {
        const master = out(ctx, 0.7);

        // 1. Tock (Petit impact sec et léger)
        const tock = ctx.createOscillator();
        const tg = ctx.createGain();
        tock.type = 'sine';
        tock.frequency.setValueAtTime(300, now);
        tock.frequency.exponentialRampToValueAtTime(80, now + 0.05);
        tg.gain.setValueAtTime(0.7, now);
        tg.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        tock.connect(tg); tg.connect(master);
        tock.start(now); tock.stop(now + 0.07);

        // 2. Chime (Tintement positif très rapide)
        const chime = ctx.createOscillator();
        const cg = ctx.createGain();
        chime.type = 'sine';
        chime.frequency.setValueAtTime(900, now);
        cg.gain.setValueAtTime(0.4, now);
        cg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        chime.connect(cg); cg.connect(master);
        chime.start(now); chime.stop(now + 0.15);
    }

    // ── Erreur / Mauvais clic : "Bonk" sourd et léger ──
    else if (type === 'punch_error') {
        const master = out(ctx, 0.6);

        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);

        g.gain.setValueAtTime(0.6, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);

        osc.connect(filter); filter.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.15);
    }

    // ── Départ de partie : Arpège montant enthousiaste ───────────────
    else if (type === 'punch_start') {
        const master = out(ctx, 0.7);
        const notes = [523.25, 659.25, 783.99, 1046.50]; // Do, Mi, Sol, Do
        notes.forEach((f, i) => {
            const t = now + i * 0.08;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.4, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + 0.15);
        });
    }

    // ── Victoire / Record : Fanfare brillante ──────────────────────
    else if (type === 'punch_success') {
        const master = out(ctx, 0.9);
        const notes = [783.99, 783.99, 783.99, 1046.50]; // Sol Sol Sol Do
        notes.forEach((f, i) => {
            const t = now + i * 0.12;
            const dur = i === 3 ? 0.6 : 0.15;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(0.4, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            osc.connect(g); g.connect(master);
            osc.start(t); osc.stop(t + dur);
        });
    }

    // ── Fin de partie neutre : Descente triste ─────────────────────
    else if (type === 'punch_fail') {
        const master = out(ctx, 0.75);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(220, now + 0.5);
        g.gain.setValueAtTime(0.5, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.5);
    }
}

// ─────────────────────────────────────────────
// AUDIO ENGINE — GeoQuiz Music (Explorer Theme)
// ─────────────────────────────────────────────

let gqMusicRunning = false;
let gqMusicScheduler = null;
let gqBeat = 0;
const GQ_TEMPO = 110;

// Mélodie légère (Pentatonique Majeur de Do)
const GQ_MELODY = [
    523.25, -1, 587.33, 659.25, // C4, D4, E4
    783.99, -1, 659.25, -1,    // G4, E4
    880.00, -1, 783.99, 659.25, // A4, G4, E4
    587.33, -1, 523.25, -1     // D4, C4
];

function formatGqBeat() {
    const ctx = getAudioCtx();
    const beatDur = 60 / GQ_TEMPO;
    const now = ctx.currentTime + 0.05;

    // 1. Percussion légère (Woodblock)
    const pOsc = ctx.createOscillator();
    const pG = ctx.createGain();
    pOsc.type = 'triangle';
    pOsc.frequency.setValueAtTime(gqBeat % 4 === 0 ? 300 : 200, now);
    pG.gain.setValueAtTime(0.09, now);
    pG.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    pOsc.connect(pG); pG.connect(ctx.destination);
    pOsc.start(now); pOsc.stop(now + 0.05);

    // 2. Basse discrète
    if (gqBeat % 8 === 0) {
        const bOsc = ctx.createOscillator();
        const bG = ctx.createGain();
        bOsc.type = 'sine';
        bOsc.frequency.setValueAtTime(130.81, now); // C3
        bG.gain.setValueAtTime(0.18, now);
        bG.gain.exponentialRampToValueAtTime(0.001, now + beatDur * 4);
        bOsc.connect(bG); bG.connect(ctx.destination);
        bOsc.start(now); bOsc.stop(now + beatDur * 4);
    }

    // 3. Marimba (Mélodie)
    const freq = GQ_MELODY[gqBeat % GQ_MELODY.length];
    if (freq > 0) {
        const mOsc = ctx.createOscillator();
        const mG = ctx.createGain();
        mOsc.type = 'sine'; // Son pur comme un marimba doux
        mOsc.frequency.setValueAtTime(freq, now);

        mG.gain.setValueAtTime(0, now);
        mG.gain.linearRampToValueAtTime(0.25, now + 0.01);
        mG.gain.exponentialRampToValueAtTime(0.001, now + beatDur * 0.8);

        mOsc.connect(mG); mG.connect(ctx.destination);
        mOsc.start(now); mOsc.stop(now + beatDur * 0.8);
    }

    gqBeat++;
}

export function startGqMusic() {
    if (gqMusicRunning || !isMusicEnabled) return;
    gqMusicRunning = true;
    gqBeat = 0;
    const beatDur = 60 / GQ_TEMPO;
    formatGqBeat();
    gqMusicScheduler = setInterval(() => {
        if (gqMusicRunning) formatGqBeat();
    }, beatDur * 1000);
}

export function stopGqMusic() {
    gqMusicRunning = false;
    if (gqMusicScheduler) { clearInterval(gqMusicScheduler); gqMusicScheduler = null; }
}

export function toggleGqMusic() {
    isMusicEnabled = !isMusicEnabled;
    localStorage.setItem("mg_music", isMusicEnabled);
    if (isMusicEnabled) startGqMusic();
    else stopGqMusic();
    return isMusicEnabled;
}

export function getGqMusicEnabled() { return isMusicEnabled; }