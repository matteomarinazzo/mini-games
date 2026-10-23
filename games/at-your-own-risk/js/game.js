// Moteur : boucle à pas fixe 60 Hz (physique identique au Python : 3 px/frame, saut -6, gravité .5).
import { markDone, unlocked, getTries, addTry } from './progress.js';
import { COUNT, WORLDS, worldOf } from './levels/manifest.js';
import { applyTheme } from './themes.js'; // [NEW]

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), W = 800, H = 600, PW = 26, PH = 32;
let n = Math.max(1, Math.min(COUNT, +new URLSearchParams(location.search).get('level') || 1));

if (!unlocked(n)) { // niveau verrouillé ou monde non publié : retour au menu
    //location.replace('index.html');
    //await new Promise(() => { });
}
const SPK = {}; let booted = false; // [V4] cache des piques recolorées ; booted = IM prêt
let wi, WD, L, fails, T; // [NEW] T = thème du monde courant

// Charge un niveau en mémoire (sans recharger la page => le plein écran / lock paysage restent actifs)
async function loadLevel(num) {
    n = num; wi = worldOf(n); WD = WORLDS[wi];
    T = applyTheme(wi); // [NEW] fond + variables CSS du monde courant
    if (booted) preloadSpikes(); // [V4] (au 1er appel IM n'existe pas encore : voir plus bas)
    L = (await import('./levels/' + WD.id + '/level' + n + '.js')).default;
    fails = getTries(n);
    $('hudLevel').textContent = (WORLDS.length > 1 ? WD.name + ' · ' : '') + 'Niveau ' + (n - WD.first + 1);
    $('hudFails').textContent = 'Échec N°' + fails;
    history.replaceState(null, '', 'game.html?level=' + n); // l'URL suit le niveau (F5 reste cohérent)
}
await loadLevel(n);

// [NEW] Jetons de couleur du thème ('bg', 'room', 'dark', 'light') ; un hex passe tel quel (monde 1 inchangé)
const col = c => T.c[c] ?? c;
const SAW = { teeth: '#7d7d8c', body: '#d6d6de', hub: '#333' }; // [NEW]

const img = s => Object.assign(new Image(), { src: 'images/' + s });
const IM = { run: ['run1', 'run2', 'run3'].map(f => img('character/' + f + '.svg')), spike: img('hazards/spike.svg'), spikeD: img('hazards/spike_dark.svg'), portal: img('portal/portal.svg') };
function preloadSpikes() { if (T && T.spike) { tinted(IM.spike, T.spike.l); tinted(IM.spikeD, T.spike.d); } if (T) portalPic(); } // [V4] piques + portail
booted = true; preloadSpikes();
const keys = { l: 0, r: 0, j: 0 };
let S;

// --- Transition de victoire : la caméra zoome sur le portail (qui reste au sol) jusqu'à le traverser (flash clair, GROW),
// puis le niveau suivant démarre dans le flash et dézoome : on sort de SON portail (SHRINK).
const ZOOM = 16, GROW = 50, HOLD = 8, WIN_T = GROW + HOLD, SHRINK = 50, INTRO_T = HOLD + SHRINK; // [NEW] FLASH -> T.flash
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// Portail visible = dans l'écran et pas marqué hidden (portal.hidden ou L.hidePortal)
const visible = o => !o.hidden && !L.hidePortal && o.x + o.w > 0 && o.x < W && o.y + o.h > 0 && o.y < H;

function reset() {
    const b = L.build();
    S = {
        ...b, E: Object.fromEntries(b.ents.map(e => [e.id, e])), f: {}, parts: [], mode: 'play', t: 0, wt: 0, b: [...L.bounds], clip: b.portal.y + b.portal.h, hit, die, SL: b.ents.find(e => e.k === 'slope'), // [V3] sol penché (opt-in)
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
// [NEW] Centre Y actuel d'une scie : enterrée sous la ligne fy (out=0) -> à e.y (out=1)
const sawY = e => e.y + (1 - (e.out ?? 0)) * (e.fy + e.r - e.y);
// [V2] Un 'solid' bloque côtés + dessous, sauf oneWay:true (traversable sauf atterrissage par le haut) et solid:false (fantôme)
// [V3] Hauteur du sol penché sous l'abscisse x (interpolation linéaire) ; null hors de [x1,x2]
const slopeY = (e, x) => x < e.x1 || x > e.x2 ? null : e.y1 + (e.y2 - e.y1) * (x - e.x1) / (e.x2 - e.x1);
const blocks = e => e.k === 'solid' && e.on !== false && !e.oneWay && e.solid !== false;
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
        const ov = () => s.ents.some(e => blocks(e) && p.x + 4 < e.x + e.w && p.x + 22 > e.x && p.y < e.y + e.h && p.y + PH > e.y + 3); // [V2] blocks()
        const px = p.x, was = ov();
        p.x = Math.max(s.b[0], Math.min(s.b[1], p.x + dx)); p.f = dx > 0 ? 1 : -1; p.run++;
        if (!was && ov()) p.x = px;
    }
    // Saut + "coyote time" : on peut sauter encore 6 frames après avoir quitté le bord d'un sol
    if (p.g) p.coy = 6; else if (p.coy > 0) p.coy--;
    if (keys.j && (p.g || p.coy > 0) && !p.fall) { p.vy = -6; p.coy = 0; }
    // Gravité + atterrissage : 'floor'/'solid' (mv:1 = surface mobile, tolérance 12 px), sauf au-dessus d'un 'gap' actif
    const pb = p.y + PH, fx = p.x + 13;
    const wasSl = p.sl; // [V3] posé sur la pente à la frame précédente
    p.vy += .5; p.y += p.vy; p.g = false; p.sl = false;
    if (p.vy < 0) for (const e of s.ents) // tête contre le dessous d'un solide
        if (blocks(e) && p.x + 4 < e.x + e.w && p.x + 22 > e.x && pb - PH >= e.y + e.h - 1 && p.y < e.y + e.h) { p.y = e.y + e.h; p.vy = 0; } // [V2] blocks()
    const gp = s.ents.find(e => e.k === 'gap' && e.on && fx > e.x && fx < e.x + e.w);
    // Atterrissage : test de franchissement. Les pieds étaient au-dessus (pb) et sont maintenant au niveau ou sous le dessus
    // de la surface, quelle que soit la vitesse de chute (pas de limite basse : on ne traverse plus les plateformes).
    // [V2] gap.pf:true = le trou ne concerne que les surfaces au niveau du sol (les plateformes plus hautes restent atterrissables) ; solid:false = jamais d'atterrissage
    if (p.vy >= 0) for (const e of s.ents)
        if ((e.k === 'floor' || e.k === 'solid') && e.on !== false && e.solid !== false && !(gp && !(gp.pf && e.y < gp.y - 2))
            && p.x + 4 - (e.pad || 0) < e.x + e.w && p.x + 22 > e.x // même largeur que le blocage latéral (ov) ; [V4] e.pad = tolérance d'atterrissage opt-in (px de chaque côté)
            && pb <= e.y + (e.mv ? 12 : 1) && p.y + PH >= e.y) {
            p.y = e.y - PH; p.vy = 0; p.g = true; break;
        }
    // [V3] Sol penché : atterrissage par franchissement (tolérance = dénivelé max d'un pas), et collage à la pente en descente (pas de tremblement)
    if (s.SL && p.vy >= 0 && !p.g && !gp) {
        const q = slopeY(s.SL, fx), nb = p.y + PH;
        if (q !== null && ((nb >= q && pb <= q + 1 + 3 * Math.abs((s.SL.y2 - s.SL.y1) / (s.SL.x2 - s.SL.x1))) || (wasSl && nb < q && q - nb <= 8))) { p.y = q - PH; p.vy = 0; p.g = true; p.sl = true; }
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

    // [NEW] Scies : sortie ~10 frames (e.out 0->1), déplacement vx, rotation (stoppés si e.still).
    // Hitbox circulaire indulgente (hr = 0.6 r par défaut), active dès 50 % de sortie. hidden:true = invisible et inoffensive.
    // [V2] host:'id' = scie portée par une plateforme : suit son y (= ligne de clip) et x (+ dx, déf. centre)
    for (const e of s.ents) if (e.k === 'saw') {
        if (e.host) { const Hh = s.E[e.host]; e.fy = e.y = Hh.y; e.x = Hh.x + (e.dx ?? Hh.w / 2); } // [V2]
        if (e.hidden) continue;
        e.o = Math.min(10, (e.o || 0) + 1); e.out = e.o / 10;
        if (!e.still) { e.x += e.vx || 0; e.a = (e.a || 0) + (e.vx < 0 ? -.35 : .35); }
        if (e.out >= .5) {
            const cy = sawY(e), qx = Math.max(p.x + 4, Math.min(e.x, p.x + 22)), qy = Math.max(p.y + 2, Math.min(cy, p.y + PH)), hr = e.hr ?? e.r * .6;
            if ((qx - e.x) ** 2 + (qy - cy) ** 2 < hr * hr) die();
        }
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
    ctx.fillStyle = pressed ? col(e.cp || '#7a1111') : col(e.c); // [NEW] col()
    ctx.beginPath(); ctx.ellipse(cx, by, e.w / 2, Math.max(.01, Math.min(e.w / 2, e.h - bh)), 0, Math.PI, 2 * Math.PI); ctx.fill();
    if (!pressed) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(cx - e.w / 6, by - e.w / 3, e.w / 7, e.w / 11, -.5, 0, 2 * Math.PI); ctx.fill(); }
}
// [NEW] Scie : disque à dents (canvas), rognée à la ligne du sol e.fy pour sortir « du sol »
function drawSaw(e) {
    const r = e.r, N = 12;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, e.fy); ctx.clip();
    ctx.translate(e.x, sawY(e)); ctx.rotate(e.a || 0);
    ctx.fillStyle = SAW.teeth; ctx.beginPath();
    for (let i = 0; i < 2 * N; i++) { const a = i * Math.PI / N, q = i % 2 ? r * .78 : r; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = SAW.body; ctx.beginPath(); ctx.arc(0, 0, r * .62, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = SAW.hub; ctx.beginPath(); ctx.arc(0, 0, r * .2, 0, 2 * Math.PI); ctx.arc(r * .4, 0, r * .08, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
}
// [V4] Variantes de couleur d'un SVG d'origine (piques, portail) : on charge le MÊME fichier que le monde 1, on modifie son texte (fn),
// et on en refait une image (vrai vecteur, net à toute taille, pas de dépendance à naturalWidth). Cache par fichier+clé.
// Renvoie null tant que la variante n'est pas prête (on ne dessine rien plutôt que la mauvaise couleur).
function variant(im, key, fn) {
    const k = im.src + '|' + key;
    let t = SPK[k];
    if (!t) {
        t = SPK[k] = new Image();
        t.ok = false; t.onload = () => { t.ok = true; };
        fetch(im.src).then(r => r.text()).then(txt => {
            txt = fn(txt.replace(/<metadata>[\s\S]*?<\/metadata>/, ''));
            if (!/<svg[^>]*\swidth=/.test(txt)) { // SVG sans width/height : on les déduit du viewBox (drawImage fiable partout)
                const vb = txt.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/);
                if (vb) txt = txt.replace('<svg', '<svg width="' + vb[1] + '" height="' + vb[2] + '"');
            }
            t.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt);
        }).catch(() => { t.ok = false; });
    }
    return t.ok ? t : null;
}
function tinted(im, c) { return variant(im, c, t => t.replace(/fill="[^"]*"/g, 'fill="' + c + '"')); } // function = hoistée (appelée avant sa position) // pique : un seul aplat
// Portail : T.portal = [[couleur d'origine, couleur du thème], ...] ; null (monde 1) = SVG d'origine tel quel
function portalPic() { return T.portal ? variant(IM.portal, T.portal.join(), t => T.portal.reduce((x, [f, to]) => x.split(f).join(to), t)) : IM.portal; }
function draw() {
    const s = S, p = s.p, k = zoomK(s), o = s.portal;
    ctx.fillStyle = col(L.bg); ctx.fillRect(0, 0, W, H); // [NEW] col()
    ctx.save();
    if (k) {
        // Zoom ancré au pied du portail (il reste au sol). Portail invisible/hors écran : on zoome depuis le centre de l'écran.
        const vis = visible(o), zx = vis ? o.x + o.w / 2 : W / 2, zy = vis ? o.y + o.h : H / 2, sc = Math.exp(Math.log(ZOOM) * k);
        ctx.translate(zx, zy); ctx.scale(sc, sc); ctx.translate(-zx, -zy);
    }
    for (const e of s.ents) if (e.c && !e.inv && e.on !== false && (e.k !== 'gap' || e.on)) { // [V3] inv:true = jamais dessiné
        if (e.solid === false && !e.oneWay) ctx.globalAlpha = .35; // [V2] fantôme translucide, sauf oneWay (PF4 du N24 : visible comme les autres)
        if (e.k === 'slope') { ctx.fillStyle = col(e.c); ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.lineTo(e.x2, e.y2 - e.h); ctx.lineTo(e.x1, e.y1 - e.h); ctx.closePath(); ctx.fill(); } // [V3] décor en polygone qui suit la pente
        else if (e.k === 'btn') drawBtn(e); else { ctx.fillStyle = col(e.c); ctx.fillRect(e.x, e.y, e.w, e.h); } // [NEW] col()
        ctx.globalAlpha = 1;
    }
    ctx.save();
    if (o.a) { // [V3] portail incliné : pivot = milieu du bas, posé sur la pente
        const px = o.x + o.w / 2, py = o.y + o.h;
        ctx.translate(px, py); ctx.rotate(o.a); ctx.translate(-px, -py);
    } else { ctx.beginPath(); ctx.rect(0, 0, W, s.clip); ctx.clip(); } // portail rogné au sol
    const PP = portalPic(); // [V4] couleurs du thème
    if (PP) ctx.drawImage(PP, o.x, o.y, o.w, o.h); ctx.restore();
    for (const e of s.ents) if (e.k === 'fake' && e.on !== false && PP) ctx.drawImage(PP, e.x, e.y, e.w, e.h);
    for (const e of s.ents) if (e.k === 'saw' && !e.hidden) drawSaw(e); // [NEW]

    if (s.mode === 'play' || s.mode === 'intro') {
        ctx.save(); ctx.translate(p.x + 13, p.y); ctx.scale(p.f, 1);
        ctx.drawImage(IM.run[!p.g ? 1 : p.mv ? (p.run >> 2) % 3 : 0], -13, 0, PW, PH); ctx.restore();
    }
    // Piques : r = rotation (0 haut, 1 droite, 2 bas, 3 gauche) ; w/h = boîte occupée
    for (const e of s.ents) if (e.k === 'spike' && e.on !== false) {
        const r = e.r || 0, dw = r % 2 ? e.h : e.w, dh = r % 2 ? e.w : e.h;
        ctx.save(); ctx.translate(e.x + e.w / 2, e.y + e.h / 2); ctx.rotate(r * Math.PI / 2 + (e.a || 0)); // [V3] e.a = inclinaison libre (rad)
        const si = e.d ? IM.spikeD : IM.spike; // même image que le monde 1 (forme identique)
        const pic = T.spike ? tinted(si, e.d ? T.spike.d : T.spike.l) : si; // [V4] thème : même SVG recoloré ; monde 1 : SVG d'origine
        if (pic) ctx.drawImage(pic, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
    }
    ctx.fillStyle = '#111'; for (const q of s.parts) if (q.l > 0) ctx.fillRect(q.x, q.y, 5, 5);
    ctx.restore();

    if (k) { // flash clair : on est « dans » le portail
        const a = Math.min(1, Math.max(0, (k - .55) / .4));
        if (a) { ctx.globalAlpha = a; ctx.fillStyle = T.flash; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; } // [NEW] T.flash (monde 1 = #996b07)
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