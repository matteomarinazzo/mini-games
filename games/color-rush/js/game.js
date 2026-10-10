// ─── GAME.JS ────────────────────────────────────────────────────────────────
// Colle l'interface : menu (cartes), boutique, partie (contrôles, HUD, boucle), modales.
// La logique de jeu est dans engine.js / ai.js, le dessin dans renderer.js, la sauvegarde dans storage.js.
import { CONFIG, REWARDS, SKINS, EFFECTS, GEAR } from './config.js';
import { MAPS, buildMask } from './maps.js';
import { loadStore, updateStore, isOwned } from './storage.js';
import { Game } from './engine.js';
import { Renderer, buildPalette, paintCell, drawGear } from './renderer.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('fr-FR');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;

const screens = { menu: $('screenMenu'), shop: $('screenShop'), game: $('screenGame') };
let tab = 'skins';
let game = null, renderer = null, session = null;
let running = false, paused = false, ended = false;

// ─── Navigation entre écrans ───────────────────────────────────────────────
function show(name) {
    for (const k of Object.keys(screens)) screens[k].hidden = k !== name;
    $('platformBack').hidden = name !== 'menu';
    document.body.classList.toggle('in-game', name === 'game');
    document.body.style.overflow = name === 'game' ? 'hidden' : '';
    window.scrollTo(0, 0);
    if (name === 'menu') renderMenu();
    if (name === 'shop') renderShop();
}

function flash(id, text, cls = '') {
    const el = $(id);
    el.textContent = text; el.className = 'msg ' + cls;
    clearTimeout(flash[id]);
    if (text) flash[id] = setTimeout(() => { el.textContent = ''; }, 3500);
}
function bump() {
    document.querySelectorAll('.coins-badge').forEach((b) => { b.classList.add('bump'); setTimeout(() => b.classList.remove('bump'), 220); });
}

// ─── Aperçus de cartes (générés une fois, mis en cache) ────────────────────
const infoCache = {};
function mapInfo(m) {
    if (infoCache[m.id]) return infoCache[m.id];
    const { W, H, ok, total } = buildMask(m);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), img = x.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { if (ok[i]) { img.data[i * 4] = 70; img.data[i * 4 + 1] = 80; img.data[i * 4 + 2] = 120; img.data[i * 4 + 3] = 255; } }
    x.putImageData(img, 0, 0);
    const ai = Math.min(CONFIG.aiMax, Math.max(CONFIG.aiMin, Math.round(total / CONFIG.cellsPerAi)));
    return (infoCache[m.id] = { url: c.toDataURL(), total, ai });
}

// ─── MENU ───────────────────────────────────────────────────────────────────
function renderMenu() {
    const s = loadStore();
    $('coins').textContent = fmt(s.coins);
    $('howto').textContent = coarse
        ? 'Pose le doigt sur la carte et glisse pour diriger ton cube. Ferme une boucle dans ton territoire pour capturer la zone.'
        : 'Flèches ou WASD pour diriger ton cube. Ferme une boucle dans ton territoire pour capturer la zone.';
    const list = $('mapList'); list.innerHTML = '';
    for (const m of MAPS) {
        const info = mapInfo(m), owned = isOwned(s, 'maps', m), best = s.best[m.id] || 0;
        const b = document.createElement('button');
        b.className = 'map-card' + (s.map === m.id ? ' active' : '') + (owned ? '' : ' locked');
        b.setAttribute('aria-pressed', String(s.map === m.id));
        b.setAttribute('aria-label', `${m.name}${owned ? '' : ' (verrouillée)'}, meilleur ${best} pour cent`);
        b.innerHTML = `<img src="${info.url}" alt="" width="64" height="64">
            <span class="map-name">${m.name}</span>
            <span class="map-best">🏆 ${best.toFixed(1)} %</span>
            <span class="map-meta">${info.ai} IA</span>` +
            (owned ? '' : `<span class="map-tag">🔒 ${fmt(m.price)}</span>`);
        b.addEventListener('click', () => {
            const st = loadStore();
            if (isOwned(st, 'maps', m)) {
                updateStore((_st) => { _st.map = m.id; });
                renderMenu();
            } else {
                tab = 'maps'; show('shop');
                flash('shopMsg', `Achète « ${m.name} » pour y jouer (${fmt(m.price)} 🪙).`, 'bad');
            }
        });
        list.appendChild(b);
    }
    const cur = MAPS.find((m) => m.id === s.map);
    $('playBtn').textContent = isOwned(s, 'maps', cur) ? 'JOUER' : '🔒 DÉBLOQUER LA CARTE';
}

// ─── BOUTIQUE ───────────────────────────────────────────────────────────────
const CAT = { skins: SKINS, effects: EFFECTS, maps: MAPS, gear: GEAR };

function renderShop() {
    const s = loadStore();
    $('shopCoins').textContent = fmt(s.coins);
    document.querySelectorAll('.tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === tab);
        t.setAttribute('aria-selected', String(t.dataset.tab === tab));
    });
    const grid = $('shopGrid'); grid.innerHTML = '';
    for (const it of CAT[tab]) {
        const owned = isOwned(s, tab, it);
        const equipped = tab === 'skins' ? s.equip.skin === it.id : tab === 'effects' ? s.equip.effect === it.id : tab === 'gear' ? s.equip.gear === it.id : s.map === it.id;
        const card = document.createElement('div');
        card.className = 'shop-item' + (equipped ? ' equipped' : '');
        let preview;
        if (tab === 'skins') {
            preview = document.createElement('div'); preview.className = 'swatch'; preview.style.background = it.color;
        } else if (tab === 'effects') {
            preview = document.createElement('canvas'); preview.width = 64; preview.height = 64;
            const x = preview.getContext('2d'), base = SKINS.find((k) => k.id === s.equip.skin) || SKINS[0];
            const col = `rgb(${parseInt(base.color.slice(1, 3), 16) * 0.7 | 0},${parseInt(base.color.slice(3, 5), 16) * 0.7 | 0},${parseInt(base.color.slice(5, 7), 16) * 0.7 | 0})`;
            for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) paintCell(x, it.id, col, cx, cy, cx * 8, cy * 8, 8, 1);
        } else if (tab === 'gear') {
            preview = document.createElement('canvas'); preview.width = 64; preview.height = 64;
            const x = preview.getContext('2d'), base = SKINS.find((k) => k.id === s.equip.skin) || SKINS[0];
            x.fillStyle = base.color; x.fillRect(16, 26, 32, 32); x.strokeStyle = '#fff'; x.lineWidth = 2; x.strokeRect(16, 26, 32, 32);
            // cube qui regarde vers le BAS (yeux vers le bas) : les objets de tête apparaissent en haut, lisibles
            for (const sg of [-1, 1]) {
                const ex = 32 - sg * 6.4, ey = 42 + 4.8;
                x.fillStyle = '#fff'; x.beginPath(); x.arc(ex, ey, 4.2, 0, 6.3); x.fill();
                x.fillStyle = '#111'; x.beginPath(); x.arc(ex, ey + 1.6, 1.9, 0, 6.3); x.fill();
            }
            drawGear(x, it.id, 32, 42, 16, Math.PI / 2);
        } else {
            preview = document.createElement('img'); preview.src = mapInfo(it).url; preview.alt = ''; preview.width = 64; preview.height = 64;
        }
        const name = document.createElement('div'); name.className = 'shop-name'; name.textContent = it.name;
        const btn = document.createElement('button');
        btn.className = 'shop-btn' + (equipped ? ' on' : owned ? ' equip' : '');
        btn.textContent = equipped ? '✔ ÉQUIPÉ' : owned ? (it.price === 0 ? 'ÉQUIPER (GRATUIT)' : 'ÉQUIPER') : `${fmt(it.price)} 🪙`;
        btn.disabled = equipped;
        btn.addEventListener('click', () => shopAction(it));
        card.append(preview, name, btn);
        grid.appendChild(card);
    }
}

function shopAction(it) {
    let status = 'ok';
    // Vérifications DANS la transaction : le solde est relu juste avant d'écrire
    updateStore((s) => {
        const owned = isOwned(s, tab, it);
        if (!owned) {
            if (s.coins < it.price) { status = 'poor:' + (it.price - s.coins); return; }
            s.coins -= it.price; s.owned[tab].push(it.id); status = 'bought';
        }
        if (tab === 'skins') s.equip.skin = it.id;
        else if (tab === 'effects') s.equip.effect = it.id;
        else if (tab === 'gear') s.equip.gear = it.id;
        else s.map = it.id;
    });
    if (status === 'bought') { flash('shopMsg', `${it.name} acheté et équipé !`, 'good'); bump(); }
    else if (status.startsWith('poor')) flash('shopMsg', `Il te manque ${fmt(Number(status.split(':')[1]))} pièces.`, 'bad');
    else flash('shopMsg', `${it.name} sélectionné.`, 'good');
    renderShop();
}

// ─── PARTIE : démarrage ─────────────────────────────────────────────────────
function startGame() {
    let s = loadStore();
    let map = MAPS.find((m) => m.id === s.map);
    if (!isOwned(s, 'maps', map)) {                       // carte verrouillée : on propose l'achat
        tab = 'maps'; show('shop'); flash('shopMsg', `Achète « ${map.name} » pour y jouer (${fmt(map.price)} 🪙).`, 'bad');
        return;
    }
    const skin = SKINS.find((k) => k.id === s.equip.skin) || SKINS[0];
    const effect = EFFECTS.find((k) => k.id === s.equip.effect) || EFFECTS[0];
    const gear = GEAR.find((k) => k.id === s.equip.gear) || GEAR[0];
    updateStore((st) => { st.runs++; });

    game = new Game(map);
    session = { map, skin, effect, gear };
    ended = false; paused = false; running = false;
    $('toast').hidden = true;
    show('game');
    if (!renderer) renderer = new Renderer($('canvas'), $('minimap'));
    renderer.setGame(game, buildPalette(skin.color, game.aiTotal), effect.id, gear.id);
    hudLast = '';
    $('startInfo').textContent = `${map.name} · ${game.aiTotal} IA · skin ${skin.name} · ${effect.name}`;
    $('startOverlay').hidden = false;
    cancelAnimationFrame(loopId);          // une seule boucle active
    loopId = requestAnimationFrame(frame);
}

// ─── Contrôles ──────────────────────────────────────────────────────────────
const keys = new Set();
const KEYMAP = {
    arrowup: 'u', w: 'u', z: 'u', arrowdown: 'd', s: 'd',
    arrowleft: 'l', a: 'l', q: 'l', arrowright: 'r', d: 'r',
};
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (screens.game.hidden) return;
    if (k === 'escape' || k === 'p') { if (running && !ended) setPause(!paused); e.preventDefault(); return; }
    if (KEYMAP[k]) { keys.add(KEYMAP[k]); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => { const m = KEYMAP[e.key.toLowerCase()]; if (m) keys.delete(m); });
window.addEventListener('blur', () => keys.clear());

// Tactile / souris : « stick flottant » invisible. Le point où le doigt se pose est l'ancre ; la direction
// = vecteur ancre → doigt (zone morte 10 px). Si le doigt s'éloigne de plus de 56 px, l'ancre le suit,
// donc un changement de cap est toujours immédiat. Relâcher garde le dernier cap (le cube avance toujours).
const stage = $('stage');
let anchor = null, pid = null;
stage.addEventListener('pointerdown', (e) => {
    if (!running || paused) return;
    pid = e.pointerId; anchor = { x: e.clientX, y: e.clientY };
    try { stage.setPointerCapture(pid); } catch (err) { /* ignoré */ }
    e.preventDefault();
});
stage.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid || !anchor || !running || paused) return;
    let dx = e.clientX - anchor.x, dy = e.clientY - anchor.y;
    const len = Math.hypot(dx, dy);
    if (len < 10) return;
    if (len > 56) { const k = (len - 56) / len; anchor.x += dx * k; anchor.y += dy * k; }
    game.setInput(dx, dy);
    hideToast();
    e.preventDefault();
});
const release = (e) => { if (e.pointerId === pid) { pid = null; anchor = null; } };
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);
// Pas de défilement de la page pendant la partie (les menus, eux, défilent normalement)
screens.game.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

function readKeys() {
    if (!keys.size) return;
    const vx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
    const vy = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
    if (vx || vy) { game.setInput(vx, vy); hideToast(); }
}
function hideToast() { $('toast').hidden = true; }

// ─── Pause / quitter ────────────────────────────────────────────────────────
function setPause(p) {
    if (ended) return;
    paused = p;
    $('pauseOverlay').hidden = !p;
}
$('pauseBtn').addEventListener('click', () => { if (running) setPause(true); });
$('gameBack').addEventListener('click', () => { if (running) setPause(true); else if (!ended) leaveToMenu(); });
$('resumeBtn').addEventListener('click', () => setPause(false));
$('quitBtn').addEventListener('click', () => { $('pauseOverlay').hidden = true; settle('quit'); leaveToMenu(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && running && !ended) setPause(true); });

$('startBtn').addEventListener('click', () => {
    $('startOverlay').hidden = true;
    running = true;
    const t = $('toast'); t.textContent = coarse ? '👆 Glisse le doigt pour démarrer' : '⌨️ Appuie sur une flèche pour démarrer'; t.hidden = false;
});

function leaveToMenu() { running = false; ended = true; game = null; show('menu'); }

// ─── Fin de partie : pièces + record + modale ──────────────────────────────
function settle(kind) {
    if (ended) return null;
    ended = true; running = false;
    const won = kind === 'won';
    const pct = Math.min(100, Math.max(0, game.finalPct));
    const base = Math.floor(pct * REWARDS.coinsPerPercent);   // pièces « juste avant la mort »
    const bonus = won ? REWARDS.victoryBonus : 0;
    let record = false, balance = 0;
    updateStore((s) => {
        s.coins += base + bonus;
        const p = Math.round(pct * 10) / 10;
        if (p > (s.best[session.map.id] || 0)) { s.best[session.map.id] = p; record = true; }
        balance = s.coins;
    });
    return { won, pct, base, bonus, record, balance };
}

function showResult() {
    if (!game || ended) return;      // quitté pendant le délai d'affichage
    const r = settle(game.result);
    if (!r) return;
    $('ovIcon').textContent = r.won ? '🏆' : '💥';
    $('ovTitle').textContent = r.won ? 'Victoire !' : 'Éliminé !';
    $('ovResult').textContent = r.won ? '✔ Victoire' : '✖ Défaite';
    $('ovPct').textContent = r.pct.toFixed(1) + ' %' + (r.record ? ' · 🏆 record' : '');
    $('ovAi').textContent = `${game.aiKilled} / ${game.aiTotal}`;
    $('ovTime').textContent = mmss(game.time);
    $('ovCoins').textContent = `+${fmt(r.base + r.bonus)}` + (r.bonus ? ` (dont ${fmt(r.bonus)} bonus)` : '');
    $('ovBalance').textContent = fmt(r.balance) + ' 🪙';
    $('ovNote').textContent = 'Les pièces gagnées servent à acheter cartes, skins, effets et objets en boutique.';
    $('overOverlay').hidden = false;
}
$('replayBtn').addEventListener('click', () => { $('overOverlay').hidden = true; startGame(); });
$('menuBtn').addEventListener('click', () => { $('overOverlay').hidden = true; leaveToMenu(); });

// ─── HUD ────────────────────────────────────────────────────────────────────
let hudLast = '';
function updateHud() {
    const pct = game.over && game.result === 'lost' ? game.finalPct : game.playerPct;
    const key = pct.toFixed(1) + '|' + game.aiAlive + '|' + Math.floor(game.time);
    if (key === hudLast) return;
    hudLast = key;
    $('hudPct').textContent = pct.toFixed(1) + ' %';
    $('hudBar').style.width = pct.toFixed(1) + '%';
    $('hudAi').textContent = `${game.aiAlive}/${game.aiTotal}`;
    $('hudTime').textContent = mmss(game.time);
}

// ─── Boucle principale : pas fixe 60 Hz, rendu à chaque frame ──────────────
let last = 0, acc = 0, loopId = 0;
function frame(ts) {
    if (!game || screens.game.hidden) return;
    const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    if (running && !paused && !game.over) {
        readKeys();
        acc += dt;
        let n = 0;
        while (acc >= CONFIG.step && n < 5) { game.step(CONFIG.step); acc -= CONFIG.step; n++; }
        if (n === 5) acc = 0;                      // appareil trop lent : on abandonne le retard
        if (game.over) setTimeout(showResult, 700); // laisse voir l'animation de fin
    }
    renderer.draw(dt, ts / 1000);
    updateHud();
    loopId = requestAnimationFrame(frame);
}
window.addEventListener('resize', () => { if (renderer && game) renderer.resize(); });

// ─── Branchements du menu ───────────────────────────────────────────────────
$('playBtn').addEventListener('click', startGame);
$('shopBtn').addEventListener('click', () => { tab = 'skins'; show('shop'); });
$('shopBack').addEventListener('click', () => show('menu'));
$('shopTabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) { tab = t.dataset.tab; renderShop(); }
});
window.addEventListener('pageshow', () => { if (!screens.menu.hidden) renderMenu(); });

show('menu');