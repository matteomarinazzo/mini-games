// ─── GAME.JS ────────────────────────────────────────────────────────────────
// Rush Highway : boucle de jeu, génération, collisions, bonus/malus, fin de partie.
// Unités du monde : 1 unité = 1 voie (largeur). x ∈ [0.5 ; 4.5] = centre de voie.
import { VEHICLES, ENEMY_COLORS, ENEMY_KINDS, carSvg, truckSvg, coneSvg, barrierSvg, pickupSvg, svgUri, vehicleBox, kindBox } from './vehicles.js';
import { loadStore, updateStore } from './store.js';

/* ═══════════════ CONFIGURATION (tout se règle ici) ═══════════════ */
const CFG = {
    lanes: 5,
    laneWidthRatio: 0.15,           // largeur d'une voie / largeur de l'écran
    laneMaxPx: 90,
    minVisibleLanes: 10,            // voies visibles en hauteur au minimum : dézoome sur les écrans larges
    kmhToUnits: 0.03,               // vitesse (km/h) -> voies par seconde
    maxKmh: 1000, minKmh: 40,
    playerY: 0.75,                   // position verticale de la voiture (fraction de la hauteur)
    metersPerCoin: 50,              // 1 pièce tous les 50 m
    rowGap: { start: 11, end: 6.5, fromKmh: 110, toKmh: 260 }, // écart entre rangées (voies) : diminue avec la vitesse
    firstRowAt: 6,                  // distance avant la première rangée
    pickupChance: 0.45,             // probabilité d'une pastille par rangée
    pickupMalusRatio: 0.6,         // part de malus parmi les pastilles
    maxLives: 3, lifeInvuln: 2,     // vies max / protection après perte d'une vie (s)
    lockGames: 5,                   // durée du blocage de véhicule (en parties)
    slowMult: 0.7, fastMult: 1.3, steerMult: 0.55,
    sceneryPerSide: 7, toastMs: 1800,
};

// Obstacles : w/h = taille du sprite, hw/hh = demi-hitbox, f = facteur de vitesse relative (1 = fixe sur la route)
const OBSTACLES = [
    { id: 'car', w: 0.62, h: 1.24, hw: 0.25, hh: 0.55, f: 0.8, weight: 50 },
    { id: 'truck', w: 0.8, h: 2.5, hw: 0.33, hh: 1.15, f: 0.7, weight: 14 },
    { id: 'cone', w: 0.5, h: 0.5, hw: 0.18, hh: 0.18, f: 1, weight: 22 },
    { id: 'barrier', w: 0.95, h: 0.285, hw: 0.42, hh: 0.1, f: 1, weight: 14 },
];

// Effets : tirage pondéré. Plus un gain/une perte est élevé, plus son poids est faible.
// `when` : condition d'éligibilité évaluée au moment du tirage.
const EFFECTS = {
    bonus: [
        { id: 'coins', range: [3, 8], weight: 30 },
        { id: 'coins', range: [9, 20], weight: 22 },
        { id: 'coins', range: [21, 40], weight: 12 },
        { id: 'coins', range: [41, 80], weight: 5 },
        { id: 'slow', duration: 5, weight: 12 },
        { id: 'slow', duration: 8, weight: 5 },
        { id: 'shield', duration: 6, weight: 10 },
        { id: 'shield', duration: 10, weight: 4 },
        { id: 'life', weight: 5, when: () => G.lives < CFG.maxLives },
    ],
    malus: [
        { id: 'loseCoins', range: [3, 8], weight: 30 },
        { id: 'loseCoins', range: [9, 20], weight: 22 },
        { id: 'loseCoins', range: [21, 40], weight: 12 },
        { id: 'loseCoins', range: [41, 80], weight: 5 },
        { id: 'fast', duration: 5, weight: 14 },
        { id: 'fast', duration: 8, weight: 6 },
        { id: 'steer', duration: 5, weight: 12 },
        // Jamais bloquer le dernier véhicule utilisable, ni deux fois dans la même partie
        { id: 'lock', weight: 4, when: () => !G.newLock && S.owned.filter((id) => !S.locks[id]).length >= 2 },
    ],
};

/** Tirage pondéré réutilisable : choisit un élément de `list` selon `weight`. */
function pickWeighted(list, ok = () => true) {
    const pool = list.filter(ok);
    let r = Math.random() * pool.reduce((a, e) => a + e.weight, 0);
    for (const e of pool) { r -= e.weight; if (r < 0) return e; }
    return pool[pool.length - 1];
}

/* ═══════════════ OUTILS ═══════════════ */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => n.toLocaleString('fr-FR');
const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }

const imgCache = {};
function sprite(key, svgFn) {
    if (!imgCache[key]) { const im = new Image(); im.src = svgUri(svgFn()); imgCache[key] = im; }
    return imgCache[key];
}

/* ═══════════════ ÉTAT ═══════════════ */
const canvas = $('canvas'), ctx = canvas.getContext('2d'), stage = $('stage');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ac = new AbortController();           // détache les écouteurs globaux à la sortie
const sig = { signal: ac.signal };

let V = null;                               // véhicule joué
let B = null;                               // taille + hitbox du véhicule joué (voir vehicleBox)
let S = null;                               // copie du store au début de la partie
let G = null;                               // état de la partie
let state = 'ready';                        // ready | playing | paused | over
let raf = 0, last = 0, hudAcc = 0, toastTimer = 0, lastChips = '';
let W = 0, H = 0, dpr = 1, laneW = 60, roadX = 0, roadOffset = 0, scenery = [];
const keys = { left: false, right: false };
let dragging = false, keyMoved = false;

/* ═══════════════ DÉCOR ═══════════════ */
const DECOR = {
    tree: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="22" r="17" fill="#1f6f3a"/><circle cx="20" cy="20" r="13" fill="#2f9e44"/><circle cx="16" cy="16" r="5" fill="#51cf66"/></svg>',
    bush: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="14" cy="22" r="10" fill="#2b8a3e"/><circle cx="26" cy="22" r="10" fill="#37b24d"/><circle cx="20" cy="14" r="9" fill="#40c057"/></svg>',
    rock: () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><polygon points="6,28 10,12 24,6 35,16 33,30 18,35" fill="#868e96"/><polygon points="10,12 24,6 22,18" fill="#adb5bd"/></svg>',
};
const DECOR_KEYS = ['tree', 'tree', 'tree', 'bush', 'rock'];

function placeDecor(d, initial) {
    d.type = choice(DECOR_KEYS);
    d.size = Math.min(laneW * (0.6 + Math.random() * 0.5), roadX - 6);
    const lo = d.size / 2 + 2, hi = roadX - d.size / 2 - 2;
    const off = hi > lo ? lo + Math.random() * (hi - lo) : lo;
    d.x = d.side < 0 ? off : W - off;
    d.y = initial ? Math.random() * H : -d.size - Math.random() * H * 0.3;
    d.img = sprite('decor-' + d.type, DECOR[d.type]);
}
function initScenery() {
    scenery = [];
    for (const side of [-1, 1]) for (let i = 0; i < CFG.sceneryPerSide; i++) { const d = { side }; placeDecor(d, true); scenery.push(d); }
}
function moveScenery(dy) {
    for (const d of scenery) { d.y += dy; if (d.y > H + d.size) placeDecor(d, false); }
}

/* ═══════════════ NOUVELLE PARTIE ═══════════════ */
function newRun() {
    S = loadStore();
    G = {
        t: 0, dist: 0, speed: V.v0, carX: 2.5, target: 2.5,
        lives: 0, invuln: 0, shake: 0,
        fx: { slow: 0, fast: 0, shield: 0, steer: 0 },   // secondes restantes (effets temporaires, perdus en fin de partie)
        bonusCoins: 0,                                    // net bonus − malus de la partie
        wallet: S.coins,                                  // solde au départ (sert à plafonner les pertes)
        newLock: false,                                   // blocage de véhicule à enregistrer en fin de partie
        battery: false, brake: 0,                         // panne de batterie (véhicules avec `batteryM`)
        over: null,                                       // cause de fin : 'crash' | 'battery'
        ents: [], rowAcc: CFG.rowGap.start - CFG.firstRowAt, safeLane: 2,
        finished: false,                                  // garde-fou : récompenses enregistrées une seule fois
    };
    dragging = false; keyMoved = false; lastChips = '';
    $('toast').className = 'toast';
    updateHud();
}

/* ═══════════════ MISE À JOUR ═══════════════ */
function update(dt) {
    G.t += dt;
    // Vitesse : départ du véhicule + accélération, plafonnée, modulée par les effets
    const base = Math.min(CFG.maxKmh, V.v0 + V.accel * G.t);
    G.speed = Math.max(CFG.minKmh, base * (G.fx.slow > 0 ? CFG.slowMult : 1) * (G.fx.fast > 0 ? CFG.fastMult : 1));

    // Panne de batterie (blague de l'électrique) : à `batteryM` mètres la voiture freine
    // jusqu'à l'arrêt, puis la partie se termine (voir fin de cette fonction).
    if (V.batteryM && !G.battery && G.dist >= V.batteryM) {
        G.battery = true; G.brake = G.speed;
        toast("Dommage, vous n'avez plus de batterie 🔋", 'bad', 3000);
    }
    if (G.battery) {
        G.brake = Math.max(0, G.brake - (G.brake * 1.6 + 25) * dt);
        G.speed = G.brake;
    }

    const scroll = G.speed * CFG.kmhToUnits;               // voies / seconde
    G.dist += (G.speed / 3.6) * dt;
    roadOffset += scroll * dt;
    for (const k in G.fx) if (G.fx[k] > 0) G.fx[k] = Math.max(0, G.fx[k] - dt);
    G.invuln = Math.max(0, G.invuln - dt);
    G.shake = Math.max(0, G.shake - dt);

    // Clavier : maintenir = viser le bord ; relâcher = se figer sur place
    if (!dragging) {
        const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        if (dir) { G.target = dir < 0 ? 0.5 : 4.5; keyMoved = true; }
        else if (keyMoved) { G.target = G.carX; keyMoved = false; }
    }
    // Déplacement latéral limité par la vitesse du véhicule (maîtrisable à haute vitesse)
    const lat = V.lat * (G.fx.steer > 0 ? CFG.steerMult : 1), d = G.target - G.carX, step = lat * dt;
    G.carX = clamp(Math.abs(d) <= step ? G.target : G.carX + Math.sign(d) * step, 0.5, 4.5);

    moveScenery(scroll * laneW * dt);

    // Génération par distance parcourue : écart entre rangées décroissant avec la vitesse
    const k = clamp((G.speed - CFG.rowGap.fromKmh) / (CFG.rowGap.toKmh - CFG.rowGap.fromKmh), 0, 1);
    const gap = CFG.rowGap.start + (CFG.rowGap.end - CFG.rowGap.start) * k;
    G.rowAcc += scroll * dt;
    if (G.rowAcc >= gap) { G.rowAcc -= gap; spawnRow(gap); }

    // Déplacement des entités + collisions (hitbox propre au véhicule)
    const py = (H / laneW) * CFG.playerY, maxY = H / laneW + 3;
    for (const e of G.ents) {
        e.y += scroll * e.f * dt;
        if (e.y > maxY) { e.dead = true; continue; }
        if (Math.abs(e.x - G.carX) < B.hw + e.hw && Math.abs(e.y - py) < B.hh + e.hh) {
            if (e.pick) collect(e); else hit(e);
            if (state !== 'playing') break;
        }
    }
    G.ents = G.ents.filter((e) => !e.dead);

    // Fin de la panne de batterie : la voiture est à l'arrêt
    if (G.battery && G.brake < 2) { gameOver('battery'); return; }

    hudAcc += dt;
    if (hudAcc > 0.1) { hudAcc = 0; updateHud(); }
}

/* ═══════════════ GÉNÉRATION ═══════════════ */
// Une rangée = 1 à 3 obstacles. La "voie sûre" reste libre et ne dérive que d'une voie
// à la fois : il existe toujours un passage atteignable (jamais de mur de 5 voies).
function spawnRow(gap) {
    G.safeLane = clamp(G.safeLane + randInt(-1, 1), 0, 4);
    const free = shuffle([0, 1, 2, 3, 4].filter((l) => l !== G.safeLane));
    const maxOcc = G.speed > 190 ? 3 : 2;
    let n = 1;
    if (Math.random() < 0.6) n++;
    if (maxOcc > 2 && Math.random() < 0.35) n++;
    n = Math.min(n, maxOcc);
    for (let i = 0; i < n; i++) spawnObstacle(free[i]);
    if (Math.random() < CFG.pickupChance) {
        const lane = choice([0, 1, 2, 3, 4].filter((l) => !free.slice(0, n).includes(l)));
        const kind = Math.random() < CFG.pickupMalusRatio ? 'malus' : 'bonus';
        G.ents.push({ x: lane + 0.5, y: -0.5 - gap / 2, w: 0.7, h: 0.7, hw: 0.3, hh: 0.3, f: 1, pick: kind, img: sprite('pk-' + kind, () => pickupSvg(kind)) });
    }
}

function spawnObstacle(lane) {
    const t = pickWeighted(OBSTACLES);
    let img, b = t;                                  // b : taille + hitbox (celles du modèle pour les voitures)
    if (t.id === 'car') {
        const kind = choice(ENEMY_KINDS), color = choice(ENEMY_COLORS);
        img = sprite(`car-${kind}-${color}`, () => carSvg(color, kind));
        b = { ...t, ...kindBox(kind) };
    } else if (t.id === 'truck') {
        const color = choice(ENEMY_COLORS);
        img = sprite('truck-' + color, () => truckSvg(color));
    } else {
        img = sprite(t.id, t.id === 'cone' ? coneSvg : barrierSvg);
    }
    G.ents.push({ x: lane + 0.5, y: -b.h / 2 - 0.3, w: b.w, h: b.h, hw: b.hw, hh: b.hh, f: t.f, img });
}

/* ═══════════════ COLLISIONS & EFFETS ═══════════════ */
function hit(e) {
    if (G.battery) return;                          // panne en cours : la fin est déjà programmée
    if (G.fx.shield > 0) { e.dead = true; G.shake = 0.15; toast('Bouclier : choc évité !', 'good'); return; }
    if (G.invuln > 0) return;                       // protection après perte de vie : on traverse
    if (G.lives > 0) {
        G.lives--; e.dead = true; G.invuln = CFG.lifeInvuln; G.shake = 0.3;
        toast(`Vie utilisée ! Protégé ${CFG.lifeInvuln} s`, 'bad');
        return;
    }
    gameOver();
}

function collect(e) {
    e.dead = true;
    applyEffect(pickWeighted(EFFECTS[e.pick], (x) => !x.when || x.when()));
}

function applyEffect(f) {
    const dur = f.duration;
    switch (f.id) {
        case 'coins': {
            const n = randInt(...f.range);
            G.bonusCoins += n; toast(`+${n} pièces`, 'good'); break;
        }
        case 'loseCoins': {
            // Plafonné au total possédé (solde + gains de la partie) : jamais de solde négatif
            const owned = G.wallet + Math.floor(G.dist / CFG.metersPerCoin) + G.bonusCoins;
            const n = Math.min(randInt(...f.range), Math.max(0, owned));
            G.bonusCoins -= n;
            toast(n ? `−${n} pièces` : 'Malus : rien à perdre !', 'bad'); break;
        }
        case 'slow': G.fx.slow = Math.max(G.fx.slow, dur); G.fx.fast = 0; toast(`Vitesse réduite pendant ${dur} secondes`, 'good'); break;
        case 'fast': G.fx.fast = Math.max(G.fx.fast, dur); G.fx.slow = 0; toast(`Vitesse augmentée pendant ${dur} secondes`, 'bad'); break;
        case 'shield': G.fx.shield = Math.max(G.fx.shield, dur); toast(`Bouclier actif pendant ${dur} secondes`, 'good'); break;
        case 'steer': G.fx.steer = Math.max(G.fx.steer, dur); toast(`Direction molle pendant ${dur} secondes`, 'bad'); break;
        case 'life': G.lives++; toast('Vie supplémentaire obtenue', 'good'); break;
        case 'lock':
            // Le blocage est inscrit à la fin de la partie (voir endRun), pas immédiatement.
            G.newLock = true; toast(`Ton véhicule est bloqué pour ${CFG.lockGames} parties`, 'bad'); break;
    }
    updateHud();
}

/* ═══════════════ FIN DE PARTIE ═══════════════ */
// Appelée UNE SEULE FOIS par partie (garde G.finished) : fin normale, abandon ou fermeture de page.
// Règles :
//  - pièces = distance/50 + bonus net, ajoutées au solde (jamais < 0) ;
//  - blocages : chaque partie terminée ou quittée décrémente de 1 les blocages EXISTANTS ;
//    un nouveau blocage est posé ENSEMBLE ensuite, donc il vaut 5 parties complètes ;
//  - effets temporaires (vitesse, bouclier, vies) : perdus avec la partie.
function endRun() {
    if (!G || G.finished) return null;
    G.finished = true;
    const distM = Math.floor(G.dist), distCoins = Math.floor(G.dist / CFG.metersPerCoin);
    const net = distCoins + G.bonusCoins;
    let balance = 0, record = false, lockApplied = false;
    updateStore((s) => {
        s.coins = Math.max(0, s.coins + net);
        balance = s.coins;
        if (distM > s.best) { s.best = distM; record = true; }
        s.runs += 1;
        for (const id of Object.keys(s.locks)) if (--s.locks[id] <= 0) delete s.locks[id];
        // Ne jamais bloquer le dernier véhicule utilisable
        if (G.newLock && s.owned.some((id) => id !== V.id && !s.locks[id])) {
            s.locks[V.id] = CFG.lockGames; lockApplied = true;
            if (s.selected === V.id) s.selected = s.owned.find((id) => id !== V.id && !s.locks[id]);
        }
    });
    return { distM, distCoins, bonus: G.bonusCoins, net, balance, record, lockApplied };
}

function gameOver(reason = 'crash') {
    state = 'over';
    G.over = reason;
    G.shake = reason === 'crash' ? 0.4 : 0;
    const r = endRun();
    updateHud();
    render();
    stopLoop();
    if (!r) return;
    $('ovIcon').textContent = reason === 'battery' ? '🔋' : '💥';
    $('ovTitle').textContent = reason === 'battery' ? 'Batterie à plat !' : 'Accident !';
    $('ovDist').textContent = fmt(r.distM) + ' m';
    $('ovDistLabel').textContent = `Distance ÷ ${CFG.metersPerCoin} m`;
    $('ovDistCoins').textContent = sgn(r.distCoins);
    $('ovBonus').textContent = sgn(r.bonus);
    $('ovNet').textContent = sgn(r.net) + ' 🪙';
    $('ovBalance').textContent = fmt(r.balance) + ' 🪙';
    const notes = [];
    if (reason === 'battery') notes.push("Dommage, vous n'avez plus de batterie.");
    if (r.record) notes.push('🏆 Nouveau record !');
    if (r.lockApplied) notes.push(`🔒 ${V.name} bloqué pour ${CFG.lockGames} parties.`);
    $('ovNote').textContent = notes.join(' ');
    show('overOverlay');
}

/* ═══════════════ HUD & MESSAGES ═══════════════ */
function updateHud() {
    $('hudDist').textContent = fmt(Math.floor(G.dist)) + ' m';
    // Référence de record : S.best est relu à chaque début de partie
    const beat = S.best > 0 && G.dist > S.best;
    const rec = $('hudRec');
    rec.textContent = beat ? '🏆 Record battu !' : S.best > 0 ? `🏆 ${fmt(S.best)} m` : '🏆 —';
    rec.classList.toggle('beat', beat);
    $('hudCoins').textContent = fmt(Math.floor(G.dist / CFG.metersPerCoin) + G.bonusCoins);
    $('hudSpeed').textContent = Math.round(G.speed) + ' km/h';
    const c = [];
    if (G.lives > 0) c.push(['good', `♥ Vies : ${G.lives}`]);
    if (G.invuln > 0) c.push(['good', `✨ Protégé ${Math.ceil(G.invuln)}s`]);
    if (G.fx.shield > 0) c.push(['good', `🛡 Bouclier ${Math.ceil(G.fx.shield)}s`]);
    if (G.fx.slow > 0) c.push(['good', `🐢 Ralenti ${Math.ceil(G.fx.slow)}s`]);
    if (G.fx.fast > 0) c.push(['bad', `⚡ Accéléré ${Math.ceil(G.fx.fast)}s`]);
    if (G.fx.steer > 0) c.push(['bad', `🌀 Direction molle ${Math.ceil(G.fx.steer)}s`]);
    const html = c.map(([k, t]) => `<div class="chip ${k}">${t}</div>`).join('');
    if (html !== lastChips) { $('chips').innerHTML = html; lastChips = html; }
}

function toast(msg, cls, ms = CFG.toastMs) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (cls || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, ms);
}

/* ═══════════════ RENDU ═══════════════ */
function draw(img, cx, cy, w, h) {
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#3a9d4f';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (G.shake > 0 && !reduceMotion) ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);

    for (const d of scenery) if (d.size >= 10) draw(d.img, d.x, d.y, d.size, d.size);

    // Route + bandes de rive + marquages (le décalage de tirets donne le défilement)
    const rw = laneW * CFG.lanes, off = roadOffset * laneW;
    ctx.fillStyle = '#3a3d46';
    ctx.fillRect(roadX, 0, rw, H);
    ctx.lineWidth = 6;
    for (const x of [roadX - 3, roadX + rw + 3]) {
        ctx.setLineDash([]); ctx.strokeStyle = '#d62828';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.setLineDash([laneW * 0.3, laneW * 0.3]); ctx.lineDashOffset = -off; ctx.strokeStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.setLineDash([laneW * 0.55, laneW * 0.55]); ctx.lineDashOffset = -off;
    for (let i = 1; i < CFG.lanes; i++) {
        ctx.beginPath(); ctx.moveTo(roadX + i * laneW, 0); ctx.lineTo(roadX + i * laneW, H); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Entités (obstacles + pastilles)
    for (const e of G.ents) {
        const pulse = e.pick && !reduceMotion ? 1 + 0.08 * Math.sin(G.t * 8) : 1;
        draw(e.img, roadX + e.x * laneW, e.y * laneW, e.w * laneW * pulse, e.h * laneW * pulse);
    }

    // Joueur
    const px = roadX + G.carX * laneW, py = H * CFG.playerY;
    const blink = G.invuln > 0 && Math.floor(G.t * 10) % 2 === 0;
    if (!blink) {
        ctx.save();
        ctx.translate(px, py);
        if (!reduceMotion) ctx.rotate(clamp((G.target - G.carX) * 0.12, -0.22, 0.22)); // petit effet de virage
        draw(sprite('me-' + V.id, () => carSvg(V.color, V.kind)), 0, 0, B.w * laneW, B.h * laneW);
        ctx.restore();
    }
    if (G.fx.shield > 0 && (G.fx.shield > 1.5 || Math.floor(G.t * 8) % 2 === 0)) {
        ctx.beginPath(); ctx.arc(px, py, laneW * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(80,220,255,.18)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(80,220,255,.9)'; ctx.stroke();
    }
    if (state === 'over') {
        ctx.font = `${laneW}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(G.over === 'battery' ? '🔋' : '💥', px, py);
    }
    ctx.restore();

    // Curseur de contrôle
    const u = ((dragging ? G.target : G.carX) - 0.5) / 4;
    $('knob').style.left = (u * 100) + '%';
}

function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    laneW = Math.min(W * CFG.laneWidthRatio, CFG.laneMaxPx, H / CFG.minVisibleLanes);
    roadX = (W - laneW * CFG.lanes) / 2;
    initScenery();
    if (G && state !== 'playing') render();
}

/* ═══════════════ BOUCLE & ÉTATS ═══════════════ */
function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);   // dt plafonné : pas de saut après un lag
    last = now;
    if (state === 'playing') update(dt);
    render();
}
function startLoop() { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); }
function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

const show = (id) => { $(id).style.display = 'flex'; };
const hide = (id) => { $(id).style.display = 'none'; };

function startRun() {
    ['startOverlay', 'pauseOverlay', 'confirmOverlay', 'overOverlay'].forEach(hide);
    newRun();
    state = 'playing';
    startLoop();
}
function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    stopLoop(); render();
    show('pauseOverlay');
}
function resume() {
    if (state !== 'paused') return;
    hide('pauseOverlay'); hide('confirmOverlay');
    state = 'playing';
    startLoop();
}
function askQuit() {
    if (state === 'playing') pause();
    hide('pauseOverlay'); show('confirmOverlay');
}
function quit() {
    endRun();                                   // les pièces gagnées sont enregistrées (une seule fois)
    stopLoop();
    window.location.href = 'index.html';
}

/* ═══════════════ ÉVÉNEMENTS ═══════════════ */
$('startBtn').addEventListener('click', startRun);
$('replayBtn').addEventListener('click', startRun);
$('pauseBtn').addEventListener('click', () => (state === 'playing' ? pause() : resume()));
$('resumeBtn').addEventListener('click', resume);
$('quitBtn').addEventListener('click', askQuit);
$('confirmYes').addEventListener('click', quit);
$('confirmNo').addEventListener('click', () => { hide('confirmOverlay'); show('pauseOverlay'); });
$('backBtn').addEventListener('click', (e) => {
    if (state === 'playing' || state === 'paused') { e.preventDefault(); askQuit(); }
});

// Curseur rond : Pointer Events (tactile + souris), capture pour suivre le doigt hors de la barre
const ctrl = $('ctrl'), track = $('track');
function fromPointer(e) {
    const r = track.getBoundingClientRect();
    G.target = 0.5 + clamp((e.clientX - r.left) / r.width, 0, 1) * (CFG.lanes - 1);
}
ctrl.addEventListener('pointerdown', (e) => {
    if (state !== 'playing') return;
    e.preventDefault(); dragging = true; ctrl.setPointerCapture(e.pointerId); fromPointer(e);
});
ctrl.addEventListener('pointermove', (e) => { if (dragging) { e.preventDefault(); fromPointer(e); } });
for (const t of ['pointerup', 'pointercancel']) ctrl.addEventListener(t, () => { dragging = false; });
ctrl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false }); // pas de scroll de page

// Clavier : flèches / A-D pour bouger, P / Échap pour la pause
document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = true; e.preventDefault(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = true; e.preventDefault(); }
    else if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) {
        if (state === 'playing') pause(); else if (state === 'paused' && $('confirmOverlay').style.display !== 'flex') resume();
    }
}, sig);
document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
}, sig);

// Onglet inactif / fenêtre perdue : pause automatique
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, sig);
window.addEventListener('blur', pause, sig);
window.addEventListener('resize', resize, sig);

// Fermeture de page : on enregistre la partie en cours puis on nettoie tout
window.addEventListener('pagehide', () => { endRun(); stopLoop(); ac.abort(); }, { once: true });
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); }); // page restaurée du cache : état propre

/* ═══════════════ DÉMARRAGE ═══════════════ */
// Le véhicule doit exister, être possédé et ne pas être bloqué ; sinon retour au menu.
function resolveVehicle() {
    const s = loadStore();
    const id = new URLSearchParams(location.search).get('vehicle') || s.selected;
    const v = VEHICLES.find((x) => x.id === id);
    return v && s.owned.includes(v.id) && !s.locks[v.id] ? v : null;
}

V = resolveVehicle();
if (!V) {
    window.location.replace('index.html');
} else {
    B = vehicleBox(V);
    newRun();
    resize();
    render();
    $('startVeh').textContent = `Véhicule : ${V.name}`;
    show('startOverlay');
}