// Moteur : boucle à pas fixe 60 Hz (physique identique au Python : 3 px/frame, saut -6, gravité .5).
import { markDone, unlocked, getTries, addTry } from './progress.js';
import { COUNT, WORLDS, worldOf } from './levels/manifest.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), W = 800, H = 600, PW = 26, PH = 32;
let n = Math.max(1, Math.min(COUNT, +new URLSearchParams(location.search).get('level') || 1));

if (!unlocked(n)) { // niveau verrouillé ou monde non publié : retour au menu
    location.replace('index.html');
    await new Promise(() => { });
}
let wi, WD, L, fails;

// Charge un niveau en mémoire (sans recharger la page => le plein écran / lock paysage restent actifs)
async function loadLevel(num) {
    n = num; wi = worldOf(n); WD = WORLDS[wi];
    L = (await import('./levels/' + WD.id + '/level' + n + '.js')).default;
    fails = getTries(n);
    $('hudLevel').textContent = (WORLDS.length > 1 ? WD.name + ' · ' : '') + 'Niveau ' + (n - WD.first + 1);
    $('hudFails').textContent = 'Échec N°' + fails;
    history.replaceState(null, '', 'game.html?level=' + n); // l'URL suit le niveau (F5 reste cohérent)
}
await loadLevel(n);

const img = s => Object.assign(new Image(), { src: 'images/' + s });
const IM = { run: ['run1', 'run2', 'run3'].map(f => img('character/' + f + '.svg')), spike: img('hazards/spike.svg'), spikeD: img('hazards/spike_dark.svg'), portal: img('portal/portal.svg') };
const keys = { l: 0, r: 0, j: 0 };
let S;

// --- Transition de victoire : la caméra zoome sur le portail (qui reste au sol) jusqu'à le traverser (flash clair, GROW),
// puis le niveau suivant démarre dans le flash et dézoome : on sort de SON portail (SHRINK).
const ZOOM = 16, GROW = 50, HOLD = 8, WIN_T = GROW + HOLD, SHRINK = 50, INTRO_T = HOLD + SHRINK, FLASH = '#996b07';
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// Portail visible = dans l'écran et pas marqué hidden (portal.hidden ou L.hidePortal)
const visible = o => !o.hidden && !L.hidePortal && o.x + o.w > 0 && o.x < W && o.y + o.h > 0 && o.y < H;

function reset() {
    const b = L.build();
    S = {
        ...b, E: Object.fromEntries(b.ents.map(e => [e.id, e])), f: {}, parts: [], mode: 'play', t: 0, wt: 0, b: [...L.bounds], clip: b.portal.y + b.portal.h, hit, die,
        p: { x: L.start.x, y: L.start.y, vy: 0, g: false, fall: false, f: 1, run: 0, mv: false, coy: 0 }
    };
    $('dead').hidden = true;
}
const hit = e => { const p = S.p; return p.x + 4 < e.x + e.w && p.x + 22 > e.x && p.y + 2 < e.y + e.h && p.y + PH > e.y; };
function die() {
    if (S.mode !== 'play') return;
    S.mode = 'dead'; S.t = 0; fails = addTry(n); $('hudFails').textContent = 'Échec N°' + fails;
    const p = S.p;
    for (let i = 0; i < 20; i++) S.parts.push({ x: p.x + 13, y: p.y + 16, vx: (Math.random() - .5) * 8, vy: -Math.random() * 7, l: 70 });
}
function step() {
    const s = S, p = s.p; s.t++;
    for (const e of s.ents) if (e.push) e.ox = e.x; // position du mur avant cette frame
    for (const q of s.parts) { q.x += q.vx; q.y += q.vy; q.vy += .4; q.l--; }
    if (s.mode === 'dead') { if (s.t === 35) $('dead').hidden = false; return; }
    if (s.mode === 'intro') { s.wt++; if (s.wt >= INTRO_T) { s.mode = 'play'; s.t = 0; } return; }
    if (s.mode === 'win') {
        s.wt++;
        if (s.wt === WIN_T && !s.loading) {
            s.loading = 1;
            markDone(n);
            if (n < WD.last) {
                // Niveau suivant en mémoire, SANS recharger la page => landscape conservé
                loadLevel(n + 1).then(() => { reset(); S.mode = 'intro'; S.wt = 0; });
            } else {
                // Fin de monde : retour au menu, sur le monde suivant s'il existe
                location.replace('index.html?world=' + (wi + (WORLDS[wi + 1] ? 2 : 1)));
            }
        }
        return;
    }
    const dx = (keys.r - keys.l) * (s.f.inv ? -3 : 3);
    p.mv = !!dx && !p.fall;

    if (p.mv) {
        // Les 'solid' bloquent aussi sur les côtés (on ne traverse plus les murs ni les dessous de plateformes)
        const ov = () => s.ents.some(e => e.k === 'solid' && e.on !== false && p.x + 4 < e.x + e.w && p.x + 22 > e.x && p.y < e.y + e.h && p.y + PH > e.y + 3);
        const px = p.x, was = ov();
        p.x = Math.max(s.b[0], Math.min(s.b[1], p.x + dx)); p.f = dx > 0 ? 1 : -1; p.run++;
        if (!was && ov()) p.x = px;
    }
    // Saut + "coyote time" : on peut sauter encore 6 frames après avoir quitté le bord d'un sol
    if (p.g) p.coy = 6; else if (p.coy > 0) p.coy--;
    if (keys.j && (p.g || p.coy > 0) && !p.fall) { p.vy = -6; p.coy = 0; }
    // Gravité + atterrissage : 'floor'/'solid' (mv:1 = surface mobile, tolérance 12 px), sauf au-dessus d'un 'gap' actif
    const pb = p.y + PH, fx = p.x + 13;
    p.vy += .5; p.y += p.vy; p.g = false;
    if (p.vy < 0) for (const e of s.ents) // tête contre le dessous d'un solide
        if (e.k === 'solid' && e.on !== false && p.x + 4 < e.x + e.w && p.x + 22 > e.x && pb - PH >= e.y + e.h - 1 && p.y < e.y + e.h) { p.y = e.y + e.h; p.vy = 0; }
    const gp = s.ents.find(e => e.k === 'gap' && e.on && fx > e.x && fx < e.x + e.w);
    // Atterrissage : test de franchissement. Les pieds étaient au-dessus (pb) et sont maintenant au niveau ou sous le dessus
    // de la surface, quelle que soit la vitesse de chute (pas de limite basse : on ne traverse plus les plateformes).
    if (p.vy >= 0 && !gp) for (const e of s.ents)
        if ((e.k === 'floor' || e.k === 'solid') && e.on !== false && p.x + 4 < e.x + e.w && p.x + 22 > e.x // même largeur que le blocage latéral (ov)
            && pb <= e.y + (e.mv ? 12 : 1) && p.y + PH >= e.y) {
            p.y = e.y - PH; p.vy = 0; p.g = true; break;
        }
    if (gp && !p.g && p.y + PH > gp.y + 2) p.fall = true;
    // Animation vers une cible (x/y et largeur). Arrive pile sur la cible (plus de décalage de quelques px).
    const eas = (a, b, k) => { const d = (b - a) * k; return Math.abs(d) < 1 ? b : a + Math.trunc(d); };
    for (const e of s.ents) {
        if (e.tx !== undefined) { e.x = eas(e.x, e.tx, e.tk); e.y = eas(e.y, e.ty, e.tk); }
        if (e.tw !== undefined) e.w = eas(e.w, e.tw, e.tk || .2);
    }
    for (const r of s.rules) if (!r.d && r.if(s)) { r.do(s); if (r.once !== false) r.d = 1; }

    // Mur poussoir : s'il a bougé et chevauche le joueur, il le pousse dans SON sens de déplacement
    for (const e of s.ents) if (e.push && e.on !== false) {
        const d = e.x - e.ox;
        if (d && p.x + 4 < e.x + e.w && p.x + 22 > e.x && p.y < e.y + e.h && p.y + PH > e.y)
            p.x = d > 0 ? e.x + e.w - 4 : e.x - 22;
    }

    for (const e of s.ents) if (e.k === 'spike' && e.on !== false &&
        p.x + 4 < e.x + e.w && p.x + PW - 4 > e.x && p.y + 2 < e.y + e.h && p.y + PH > e.y) die();
    if (p.y > H + 40) die();
    for (const e of s.ents) if (e.k === 'fake' && !e.used && hit(e)) { e.used = 1; e.fx?.(s); }
    const o = s.portal, cx = p.x + 13, cy = p.y + 16;
    if (s.mode === 'play' && cx > o.x && cx < o.x + o.w && cy > o.y && cy < o.y + o.h && !((s.onPortal || L.onPortal)?.(s))) { s.mode = 'win'; s.wt = 0; }
}
// Progression du zoom : 0 = vue normale, 1 = au coeur du portail (flash). null = pas de transition.
function zoomK(s) {
    if (s.mode === 'win') return ease(Math.min(1, s.wt / GROW));
    if (s.mode === 'intro') return s.wt < HOLD ? 1 : 1 - ease(Math.min(1, (s.wt - HOLD) / SHRINK));
    return null;
}
// Bouton : socle plat + dôme. Enfoncé (h réduit par le niveau) : le dôme s'aplatit sur le socle et vire au rouge sombre (e.cp pour changer).
function drawBtn(e) {
    const h0 = e.h0 ??= e.h, pressed = e.h < h0, bh = 4, cx = e.x + e.w / 2, by = e.y + e.h - bh;
    ctx.fillStyle = '#2b1d08'; ctx.fillRect(e.x - 2, by, e.w + 4, bh);
    ctx.fillStyle = pressed ? (e.cp || '#7a1111') : e.c;
    ctx.beginPath(); ctx.ellipse(cx, by, e.w / 2, Math.max(.01, Math.min(e.w / 2, e.h - bh)), 0, Math.PI, 2 * Math.PI); ctx.fill();
    if (!pressed) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(cx - e.w / 6, by - e.w / 3, e.w / 7, e.w / 11, -.5, 0, 2 * Math.PI); ctx.fill(); }
}
function draw() {
    const s = S, p = s.p, k = zoomK(s), o = s.portal;
    ctx.fillStyle = L.bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (k) {
        // Zoom ancré au pied du portail (il reste au sol). Portail invisible/hors écran : on zoome depuis le centre de l'écran.
        const vis = visible(o), zx = vis ? o.x + o.w / 2 : W / 2, zy = vis ? o.y + o.h : H / 2, sc = Math.exp(Math.log(ZOOM) * k);
        ctx.translate(zx, zy); ctx.scale(sc, sc); ctx.translate(-zx, -zy);
    }
    for (const e of s.ents) if (e.c && e.on !== false && (e.k !== 'gap' || e.on)) { if (e.k === 'btn') drawBtn(e); else { ctx.fillStyle = e.c; ctx.fillRect(e.x, e.y, e.w, e.h); } }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, s.clip); ctx.clip(); // portail rogné au sol
    ctx.drawImage(IM.portal, o.x, o.y, o.w, o.h); ctx.restore();
    for (const e of s.ents) if (e.k === 'fake' && e.on !== false) ctx.drawImage(IM.portal, e.x, e.y, e.w, e.h);

    if (s.mode === 'play' || s.mode === 'intro') {
        ctx.save(); ctx.translate(p.x + 13, p.y); ctx.scale(p.f, 1);
        ctx.drawImage(IM.run[!p.g ? 1 : p.mv ? (p.run >> 2) % 3 : 0], -13, 0, PW, PH); ctx.restore();
    }
    // Piques : r = rotation (0 haut, 1 droite, 2 bas, 3 gauche) ; w/h = boîte occupée
    for (const e of s.ents) if (e.k === 'spike' && e.on !== false) {
        const r = e.r || 0, dw = r % 2 ? e.h : e.w, dh = r % 2 ? e.w : e.h;
        ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h / 2); ctx.rotate(r * Math.PI / 2); ctx.drawImage(e.d ? IM.spikeD : IM.spike, -dw / 2, -dh / 2, dw, dh); ctx.restore();
    }
    ctx.fillStyle = '#111'; for (const q of s.parts) if (q.l > 0) ctx.fillRect(q.x, q.y, 5, 5);
    ctx.restore();

    if (k) { // flash clair : on est « dans » le portail
        const a = Math.min(1, Math.max(0, (k - .55) / .4));
        if (a) { ctx.globalAlpha = a; ctx.fillStyle = FLASH; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    }
}
reset(); // état initial AVANT de lancer la boucle
// Boucle unique (jamais recréée au redémarrage)
let last = performance.now(), acc = 0;
(function loop(t) { acc += Math.min(100, t - last); last = t; while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; } draw(); requestAnimationFrame(loop); })(last);

// Contrôles (listeners posés une seule fois)
const K = { ArrowLeft: 'l', a: 'l', q: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'j', ' ': 'j', w: 'j', z: 'j' };
addEventListener('keydown', e => { const k = K[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) { keys[k] = 1; e.preventDefault(); } if ((e.key === 'r' || e.key === 'Enter') && S.mode === 'dead') reset(); });
addEventListener('keyup', e => { const k = K[e.key.length > 1 ? e.key : e.key.toLowerCase()]; if (k) keys[k] = 0; });
for (const [id, k] of [['btnL', 'l'], ['btnR', 'r'], ['btnJ', 'j']]) {
    const b = $(id), on = v => e => { e.preventDefault(); keys[k] = v; };
    b.addEventListener('pointerdown', on(1)); for (const t of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(t, on(0));
}
addEventListener('blur', () => keys.l = keys.r = keys.j = 0);
document.addEventListener('contextmenu', e => e.preventDefault());
$('retry').onclick = $('again').onclick = reset;

// Rotation forcée en paysage : dimensions exactes en pixels
(() => {
    const mq = matchMedia('(orientation: portrait) and (pointer: coarse) and (hover: none)');
    const root = document.documentElement;
    function fit() {
        const vv = window.visualViewport;
        const w = Math.round(vv ? vv.width : innerWidth);
        const h = Math.round(vv ? vv.height : innerHeight);
        root.style.setProperty('--rw', w + 'px');  // largeur réelle
        root.style.setProperty('--rh', h + 'px');  // hauteur réelle
        root.classList.toggle('force-land', mq.matches);
    }
    fit();
    addEventListener('resize', fit);
    addEventListener('orientationchange', fit);
    window.visualViewport?.addEventListener('resize', fit);
    mq.addEventListener?.('change', fit);
})();