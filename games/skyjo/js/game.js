/** Skyjo V3 (Classique & Crazy, Solo + Multijoueur).
 *  L'UI reflète purement le moteur core/rules.js sans aucun texte superflu.
 *  Chaque geste est direct : la carte se lève au-dessus de sa pile et se pose sur la grille ou la défausse. */
import * as R from './core/rules.js';
import { next } from './core/rng.js';
import { makeProfiles, choose, DEFAULT } from './core/ai.js';
import { cardFace, BACK } from './cards.js';
import * as NT from './net.js';

const KEY = 'skyjo', T = 30000, C = 2 * Math.PI * 22;
const NAMES = ['Vous', 'Luna', 'Orion', 'Vega', 'Atlas', 'Nova', 'Sirius', 'Lyra'];
const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const ROOM = (q.get('room') || '').toUpperCase().slice(0, 6) || null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"' }[c]));
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function load() {
    try {
        const o = JSON.parse(localStorage.getItem(KEY));
        if (o && o.v === 1 && Array.isArray(o.players) && Array.isArray(o.profiles)) return o;
    } catch { /* ignore */ }
    return null;
}
const save = () => { if (ROOM) return; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ignore */ } };
const clear = () => { if (ROOM) return; try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

let S = null;
if (!ROOM) {
    S = load();
    if (!S) {
        const n = Math.min(8, Math.max(2, parseInt(q.get('players')) || 2));
        const mode = q.get('mode') === 'crazy' ? 'crazy' : 'classic';
        const seed = q.has('seed') ? parseInt(q.get('seed')) >>> 0 : (Math.random() * 4294967296) >>> 0;
        S = R.newGame(n, seed, mode);
        S.profiles = makeProfiles(seed, n);
        save();
    }
}

let ME = 0, seats = [], rd = null, applied = [], turnStart = 0, tkey = '', wIdx = -1, wAt = 0, pend = { i: -1 };
let endKey = -1, endSeen = 0, endRendered = -1, lastSig = '', bk = '', unsub = null, hbT = null, ready = false, eto = 0, leaving = false;
let cells = [], paused = false, pauseO = false, rulesO = false, auto = false, to = 0, animating = false;
let key = '', tLeft = T, tOn = false, last = performance.now();
let syncing = false, pendingRoom = null;

const pl = s => (rd && rd.players ? rd.players[seats[s]] : null);
const absent = s => !!ROOM && s !== ME && !NT.isPresent(pl(s));
const playerPseudo = s => {
    if (ROOM) {
        return (pl(s) && pl(s).name) || (s === ME ? (localStorage.getItem(NT.NAME_KEY) || 'Joueur') : `Joueur ${s + 1}`);
    }
    return s === 0 ? (localStorage.getItem(NT.NAME_KEY) || 'Vous') : NAMES[s];
};
const nm = s => (ROOM ? (s === ME ? 'Vous' : (pl(s) && pl(s).name) || `Joueur ${s + 1}`) : NAMES[s]);
const playing = () => S && (S.phase === 'reveal' || S.phase === 'play');
const legal = a => R.legalActions(S).some(x => x.type === a.type && x.idx === a.idx);
const canAct = () => !!S && playing() && S.cur === ME && !animating && (ROOM ? NT.serverNow() < turnStart + T : !auto && !paused);
const isDriver = () => seats.findIndex(u => u === NT.N.uid || NT.isPresent(rd.players[u])) === ME;
const skey = () => `${S.round}|${S.phase}|${S.cur}`;

// ── Construction du Plateau ──
function buildBoard() {
    const opps = $('opps'), me = $('me');
    opps.replaceChildren(); me.replaceChildren(); cells = [];
    opps.classList.toggle('dense', S.n > 4);

    for (let s = 0; s < S.n; s++) {
        const pn = document.createElement('div');
        pn.className = 'pn';
        pn.dataset.s = s;
        pn.innerHTML = `
      <div class="hd"><span class="nm"></span><span class="tag"></span></div>
      <div class="gr"></div>
      <div class="sc"><span class="rs">0</span><span class="ts">(0)</span></div>
    `;
        const gr = pn.querySelector('.gr');
        cells[s] = [];
        for (let i = 0; i < 12; i++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'card';
            b.innerHTML = `<span class="in"><span class="f"></span><span class="b">${BACK}</span></span>`;
            if (s === ME) {
                b.addEventListener('click', () => onCard(i));
            } else {
                b.tabIndex = -1;
            }
            cells[s].push(b);
            gr.appendChild(b);
        }
        (s === ME ? me : opps).appendChild(pn);
    }
}

// ── Rendu Visuel ──
function render() {
    if (!S) return;
    const k2 = `${S.seed}|${S.round}|${S.n}|${ME}|${S.mode}`;
    if (k2 !== bk) { bk = k2; buildBoard(); }

    const st = S.turn.stage, pg = playing(), hum = canAct();
    const hasHid = S.players[ME].grid.some(c => c && !c.up);

    // Grilles des joueurs
    for (let s = 0; s < S.n; s++) {
        const p = S.players[s], pn = document.querySelector(`.pn[data-s="${s}"]`);
        if (!pn) continue;

        for (let i = 0; i < 12; i++) {
            const c = p.grid[i], b = cells[s][i];
            b.classList.toggle('gone', !c);
            if (!c) { b.disabled = true; delete b.dataset.ck; continue; }

            b.classList.toggle('up', c.up);
            const cardKey = c.up ? `${c.v}_${c.joker || ''}` : 'down';
            if (b.dataset.ck !== cardKey) {
                if (c.up) b.querySelector('.f').innerHTML = cardFace(c);
                b.dataset.ck = cardKey;
            }

            if (s === ME) {
                // Cibles légales signalées uniquement par un liseré (pas de phrase)
                let tg = false;
                if (hum) {
                    if (S.phase === 'reveal') tg = !c.up;
                    else if (st === 'holdDraw' || st === 'holdDiscard') tg = true;
                    else if (st === 'mustFlip' || st === 'targetFlip') tg = !c.up;
                }
                b.classList.toggle('tg', tg);
                b.disabled = !tg;
            }
        }

        pn.classList.toggle('cur', S.cur === s && pg);
        pn.querySelector('.nm').textContent = nm(s);
        pn.querySelector('.rs').textContent = R.visibleScore(p);
        pn.querySelector('.ts').textContent = `(${S.totals[s]})`;
        pn.querySelector('.tag').textContent = absent(s) ? 'IA' : S.closer === s ? '★' : '';
    }

    // HUD : seulement le nom de celui qui joue
    const tp = $('turnPlayer');
    if (pg) {
        if (S.phase === 'reveal') {
            const meRev = S.players[ME].rev;
            tp.textContent = meRev < 2 ? 'À vous' : (S.cur === ME ? 'À vous' : nm(S.cur));
            tp.classList.toggle('me', meRev < 2 || S.cur === ME);
        } else {
            tp.textContent = S.cur === ME ? 'À vous' : nm(S.cur);
            tp.classList.toggle('me', S.cur === ME);
        }
    } else {
        tp.textContent = S.phase === 'gameEnd' ? 'Fin de partie' : 'Manche terminée';
        tp.classList.remove('me');
    }

    // Piles centrales (Pioche & Défausse)
    const drawBtn = $('drawBtn');
    const discBtn = $('discBtn');
    const holdingDraw = st === 'holdDraw';
    const holdingDiscard = st === 'holdDiscard';

    // Pioche
    $('dcount').textContent = S.deck.length ? `${S.deck.length}` : '';
    if (holdingDraw && S.turn.drawn) {
        drawBtn.innerHTML = `<div class="pile-layer">${BACK}</div><div class="pile-layer lifted">${cardFace(S.turn.drawn)}</div>`;
    } else {
        drawBtn.innerHTML = `<div class="pile-layer">${BACK}</div>`;
    }
    drawBtn.classList.toggle('tg', hum && st === 'start');
    drawBtn.disabled = !(hum && st === 'start');

    // Défausse
    const top = S.discard[S.discard.length - 1];
    discBtn.classList.toggle('empty', top === undefined);

    if (holdingDiscard && S.turn.drawn) {
        // La carte prise est encore dans S.discard selon le moteur ; on montre en dessous la précédente si elle existe
        const under = S.discard.length > 1 ? cardFace(S.discard[S.discard.length - 2]) : '';
        discBtn.innerHTML = `${under ? `<div class="pile-layer">${under}</div>` : ''}<div class="pile-layer lifted">${cardFace(S.turn.drawn)}</div>`;
    } else {
        discBtn.innerHTML = top === undefined ? '' : `<div class="pile-layer">${cardFace(top)}</div>`;
    }

    // Défausse cliquable si :
    // 1) Au début du tour : pour prendre la défausse
    // 2) Carte tirée de la pioche : pour la défausser (puis retourner une carte cachée)
    const canTakeDisc = hum && st === 'start' && top !== undefined;
    const canDiscHeld = hum && holdingDraw && hasHid;
    const discTg = canTakeDisc || canDiscHeld;
    discBtn.classList.toggle('tg', discTg);
    discBtn.disabled = !discTg;
}

// ── Animations de vol de cartes et de colonnes ──
function flyCard(faceHtml, fromEl, toEl, duration = 280) {
    return new Promise(resolve => {
        if (REDUCED || !fromEl || !toEl) return resolve();

        // Si fromEl possède une carte levée (.lifted), démarrer le vol précisément depuis cette position
        const lifted = fromEl.querySelector ? fromEl.querySelector('.lifted') : null;
        const originEl = lifted || fromEl;
        const r1 = originEl.getBoundingClientRect();
        const r2 = toEl.getBoundingClientRect();
        if (r1.width === 0 || r2.width === 0) return resolve();

        // Retirer la carte levée pour que le vol prenne directement le relais sans doublon
        if (lifted) lifted.remove();

        const f = document.createElement('div');
        f.className = 'flying-card';
        f.innerHTML = faceHtml;
        f.style.cssText = `
            position: fixed;
            left: ${r1.left}px;
            top: ${r1.top}px;
            width: ${r1.width}px;
            height: ${r1.height}px;
            transform-origin: 0 0;
            z-index: 1000;
            pointer-events: none;
            will-change: transform;
            transition: transform ${duration}ms cubic-bezier(0.2, 0, 0.2, 1);
        `;
        document.body.appendChild(f);

        void f.offsetWidth; // Force reflow

        const dx = r2.left - r1.left;
        const dy = r2.top - r1.top;
        const sx = r2.width / r1.width;
        const sy = r2.height / r1.height;
        f.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

        setTimeout(() => {
            resolve();
            requestAnimationFrame(() => f.remove());
        }, duration);
    });
}

function animateDrawCard(faceHtml, drawBtn, duration = 300) {
    return new Promise(resolve => {
        if (REDUCED || !drawBtn) return resolve();
        const r = drawBtn.getBoundingClientRect();
        if (r.width === 0) return resolve();

        const f = document.createElement('div');
        f.className = 'draw-flipping-card';
        f.style.cssText = `
            position: fixed;
            left: ${r.left}px;
            top: ${r.top}px;
            width: ${r.width}px;
            height: ${r.height}px;
            perspective: 700px;
            z-index: 1000;
            pointer-events: none;
        `;
        f.innerHTML = `
            <div class="draw-in" style="width:100%;height:100%;position:relative;transform-style:preserve-3d;will-change:transform;transition:transform ${duration}ms cubic-bezier(0.2, 0, 0.2, 1);">
                <div style="position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:6px;overflow:hidden;">
                    ${BACK}
                </div>
                <div style="position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:6px;overflow:hidden;transform:rotateY(180deg);">
                    ${faceHtml}
                </div>
            </div>
        `;
        document.body.appendChild(f);
        void f.offsetWidth;

        const inner = f.querySelector('.draw-in');
        inner.style.transform = 'translateY(-22px) scale(1.1) rotateY(180deg)';

        setTimeout(() => {
            resolve();
            requestAnimationFrame(() => f.remove());
        }, duration);
    });
}

const hide = el => { if (el) el.style.visibility = 'hidden'; };
const show = el => { if (el) el.style.visibility = ''; };

async function animateEvents(events) {
    if (!events || !events.length || REDUCED) return;

    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        try {
            if (e.t === 'draw') {
                const drawBtn = $('drawBtn');
                const cardData = e.card || (e.joker ? { v: e.v, joker: e.joker } : (S && S.turn && S.turn.drawn) || { v: e.v });
                const face = cardFace(cardData);
                await animateDrawCard(face, drawBtn, 300);
                if (drawBtn) {
                    drawBtn.innerHTML = `<div class="pile-layer">${BACK}</div><div class="pile-layer lifted">${face}</div>`;
                }
            } else if (e.t === 'take') {
                const discBtn = $('discBtn');
                const cardData = e.card || (e.joker ? { v: e.v, joker: e.joker } : (S && S.turn && S.turn.drawn) || { v: e.v });
                const face = cardFace(cardData);
                if (discBtn) {
                    const under = S && S.discard && S.discard.length > 0 ? cardFace(S.discard[S.discard.length - 1]) : '';
                    discBtn.innerHTML = `${under ? `<div class="pile-layer">${under}</div>` : ''}<div class="pile-layer lifted">${face}</div>`;
                }
                await new Promise(r => setTimeout(r, 200));
            } else if (e.t === 'discard') {
                const fromEl = $('drawBtn'), toEl = $('discBtn');
                // Ne jamais cacher toEl (la défausse reste visible)
                await flyCard(cardFace(e.v), fromEl, toEl, 260);
                if (toEl) toEl.innerHTML = `<div class="pile-layer">${cardFace(e.v)}</div>`;
            } else if (e.t === 'swap') {
                const fromEl = e.src === 'discard' ? $('discBtn') : $('drawBtn');
                const targetCell = cells[e.seat] && cells[e.seat][e.idx];
                const discPile = $('discBtn');
                if (!targetCell) continue;

                // Préparer la cellule cible immédiatement face visible sans transition de flip
                targetCell.classList.add('no-flip', 'up');
                targetCell.querySelector('.f').innerHTML = cardFace(e.in);
                targetCell.dataset.ck = `${e.in.v ?? e.in}_${e.in.joker || ''}`;
                void targetCell.offsetWidth; // Force l'application immédiate de 'no-flip'

                // On cache la cellule cible le temps du vol, mais JAMAIS la défausse
                hide(targetCell);
                const p1 = flyCard(cardFace(e.in), fromEl, targetCell, 280);
                const p2 = flyCard(cardFace(e.out), targetCell, discPile, 280);
                await Promise.all([p1, p2]);

                // Afficher la cellule cible : elle est déjà face visible, aucun retournement parasite
                show(targetCell);
                targetCell.classList.remove('no-flip');

                // Mettre à jour la défausse avec la carte rejetée (sans jamais l'avoir cachée !)
                if (discPile) discPile.innerHTML = `<div class="pile-layer">${cardFace(e.out)}</div>`;

                // Si un retrait de colonne suit, court temps d'arrêt pour voir la colonne formée
                const hasColNext = events.slice(i + 1).some(x => x.t === 'col' && x.seat === e.seat);
                if (hasColNext) {
                    await new Promise(r => setTimeout(r, 220));
                }
            } else if (e.t === 'flip') {
                const flipCell = cells[e.seat] && cells[e.seat][e.idx];
                const cardData = e.card || (e.joker ? { v: e.v, joker: e.joker } : (S && S.players[e.seat] && S.players[e.seat].grid[e.idx]) || { v: e.v });
                if (flipCell) {
                    flipCell.classList.add('up');
                    flipCell.querySelector('.f').innerHTML = cardFace(cardData);
                    flipCell.dataset.ck = `${cardData.v ?? e.v}_${cardData.joker || ''}`;
                }
                await new Promise(r => setTimeout(r, 260));

                const hasColNext = events.slice(i + 1).some(x => x.t === 'col' && x.seat === e.seat);
                if (hasColNext) {
                    await new Promise(r => setTimeout(r, 220));
                }
            } else if (e.t === 'col') {
                // Colonne de 3 cartes identiques : rassemblement du bas vers le haut, puis vers la défausse
                const seat = e.seat, c = e.c;
                const top = cells[seat] && cells[seat][c];
                const mid = cells[seat] && cells[seat][c + 4];
                const bot = cells[seat] && cells[seat][c + 8];
                const discPile = $('discBtn');
                if (!top || !mid || !bot) continue;

                const faceTop = cardFace(e.top || { v: e.v, up: true });
                const faceMid = cardFace(e.mid || { v: e.v, up: true });
                const faceBot = cardFace(e.bot || { v: e.v, up: true });

                // Étape 1 : le bas et le milieu se rassemblent vers le haut (le haut reste visible)
                hide(mid); hide(bot);
                await Promise.all([
                    flyCard(faceMid, mid, top, 230),
                    flyCard(faceBot, bot, top, 230)
                ]);

                // Étape 2 : la carte du haut s'envole vers la défausse (la défausse reste visible !)
                hide(top);
                await flyCard(faceTop, top, discPile, 270);

                // La carte arrive sur la défausse (la défausse ne disparaît jamais)
                if (discPile) discPile.innerHTML = `<div class="pile-layer">${faceTop}</div>`;

                // Marquer les cartes de la colonne comme retirées définitivement SANS les réafficher
                [top, mid, bot].forEach(el => {
                    el.classList.add('gone');
                    el.style.visibility = '';
                    delete el.dataset.ck;
                });
            }
        } catch (err) {
            console.warn('anim', err);
            document.querySelectorAll('.flying-card').forEach(n => n.remove());
            cells.forEach(row => row && row.forEach(show));
        }
    }
    // Rendu global après la séquence complète d'animations
    render();
}

// ── Actions ──
function put(entry, extra) {
    const i = applied.length, now = NT.serverNow();
    if (wIdx === i && now - wAt < 2500) return false;
    wIdx = i; wAt = now;
    const u = { ['log/' + i]: JSON.parse(JSON.stringify(entry)), ...(extra || {}) };
    try { Promise.resolve(NT.N.fb.updateRoom(NT.gameIdOf(ROOM), u)).catch(() => { wIdx = -1; }); } catch { wIdx = -1; }
    return true;
}

async function human(a) {
    if (!canAct()) return;
    if (ROOM) {
        if (legal(a)) put({ s: ME, a, t: NT.serverNow() });
        return;
    }
    const r = R.apply(S, a);
    if (!r.ok) return;
    save();
    animating = true;
    try { await animateEvents(r.events); } catch (err) { console.warn(err); }
    animating = false;
    loop();
}

function onCard(i) {
    if (!S) return;
    const st = S.turn.stage;
    if (S.phase === 'reveal') human({ type: 'flip', idx: i });
    else if (st === 'holdDraw' || st === 'holdDiscard') human({ type: 'swap', idx: i });
    else if (st === 'mustFlip' || st === 'targetFlip') human({ type: 'flip', idx: i });
}

$('drawBtn').addEventListener('click', () => {
    if (S && S.turn.stage === 'start') human({ type: 'draw' });
});

$('discBtn').addEventListener('click', () => {
    if (!S) return;
    if (S.turn.stage === 'start') human({ type: 'takeDiscard' });
    else if (S.turn.stage === 'holdDraw') human({ type: 'discard' });
});

// ── Boucle de Jeu Solo ──
function loop() { if (ROOM) mloop(); else sloop(); }

function sloop() {
    clearTimeout(to);
    render();
    if (paused) return;
    if (S.phase === 'roundEnd' || S.phase === 'gameEnd') {
        tOn = false;
        to = setTimeout(showEnd, 1200);
        return;
    }
    if (S.cur === 0 && !auto) {
        const k = `${S.round}|${S.phase}|${S.cur}`;
        if (k !== key) { key = k; tLeft = T; tOn = true; }
        return;
    }
    if (!auto) { key = ''; tOn = false; }
    const pf = S.cur === 0 ? DEFAULT : S.profiles[S.cur];
    to = setTimeout(() => aiAct(pf), auto || S.phase === 'reveal' ? 400 : 750);
}

async function aiAct(pf) {
    let a = null, r = null;
    try {
        a = choose(R.viewFor(S, S.cur), pf, () => next(S));
        r = R.apply(S, a);
    } catch { r = null; }

    if (!r || !r.ok) {
        const leg = R.legalActions(S);
        if (leg.length) r = R.apply(S, leg[0]);
    }
    save();
    if (r && r.events) {
        animating = true;
        try { await animateEvents(r.events); } catch (err) { console.warn(err); }
        animating = false;
    }
    if (auto && (S.cur !== 0 || !playing())) auto = false;
    loop();
}

function autoPlay() {
    auto = true;
    tOn = false;
    loop();
}

// ── Multi : Rejeu du journal ──
function logArr(d) {
    const l = d.log || {}, out = [];
    for (const k of Object.keys(l).map(Number).sort((a, b) => a - b)) {
        if (k !== out.length) break;
        out.push(l[k]);
    }
    return out;
}

function resetLocal() {
    S = null; seats = []; applied = []; turnStart = 0; tkey = ''; bk = '';
    endKey = -1; endRendered = -1; endSeen = 0;
}

function applyEntry(e) {
    const a = e && e.a; if (!a || typeof a.type !== 'string') return null;
    const t = Number(e.t) || 0;
    if (a.type === 'start') {
        if (!Array.isArray(a.seats) || a.seats.length < 2 || a.seats.length > 8) return null;
        seats = a.seats.slice();
        S = R.newGame(seats.length, a.seed >>> 0, a.mode || 'classic');
        ME = seats.indexOf(NT.N.uid);
        turnStart = t; tkey = skey();
        endKey = -1; endRendered = -1; endSeen = 0;
        return null;
    }
    if (!S) return null;
    if (a.type === 'next') {
        endKey = -1; endRendered = -1; endSeen = 0;
        if (R.nextRound(S)) { turnStart = t; tkey = skey(); }
        return null;
    }
    if (e.s !== S.cur) return null;
    const r = R.apply(S, a);
    if (!r.ok) return null;
    const k = skey();
    if (k !== tkey) { tkey = k; turnStart = t; }
    return r.events;
}

async function syncLog() {
    const L = logArr(rd), js = L.map(e => JSON.stringify(e));
    if (applied.length > js.length || applied.some((x, k) => x !== js[k])) resetLocal();
    const isLive = ready && js.length === applied.length + 1;
    for (let i = applied.length; i < js.length; i++) {
        let evs = null;
        try { evs = applyEntry(L[i]); } catch (err) { console.warn(err); }
        applied.push(js[i]);
        if (isLive && evs && evs.length) {
            animating = true;
            try { await animateEvents(evs); } catch (err) { console.warn(err); }
            animating = false;
        }
    }
}

// onRoom sérialisé : un seul syncLog à la fois, on garde le snapshot le plus récent
async function onRoom(d) {
    if (leaving) return;
    pendingRoom = { d };
    if (syncing) return;
    syncing = true;
    try {
        while (pendingRoom) {
            const cur = pendingRoom.d;
            pendingRoom = null;
            await handleRoom(cur);
            if (leaving) break;
        }
    } finally { syncing = false; }
}

async function handleRoom(d) {
    if (!d) { gone('La room a été fermée.'); return; }
    if (!d.players || !d.players[NT.N.uid]) { gone('Vous n’êtes plus dans cette room.'); return; }
    rd = d;
    await syncLog();
    if (!S) return;
    if (ME < 0) { gone('Vous n’avez pas de siège dans cette partie.'); return; }
    if (!ready) { ready = true; $('ldOv').classList.remove('open'); }
    loop();
}

function gone(t) {
    leaving = true;
    if (unsub) { unsub(); unsub = null; }
    clearInterval(hbT);
    clearTimeout(eto);
    NT.clearSavedRoom();
    S = null; rd = null;
    $('endOverlay').classList.remove('open');
    ld(t, true);
}

function mloop() {
    render();
    if (S.phase === 'roundEnd' || S.phase === 'gameEnd') {
        if (endKey !== applied.length) {
            endKey = applied.length;
            clearTimeout(eto);
            eto = setTimeout(showEnd, 700);
        } else if ($('endOverlay').classList.contains('open') && endRendered !== applied.length) {
            showEnd();
        }
    } else {
        endKey = -1; endRendered = -1; endSeen = 0;
        clearTimeout(eto);
        $('endOverlay').classList.remove('open');
    }
}

function aiAction() {
    const o = { rng: (S.seed ^ Math.imul(applied.length + 1, 0x9E3779B1)) >>> 0 };
    let a = null;
    try { a = choose(R.viewFor(S, S.cur), DEFAULT, () => next(o)); } catch { a = null; }
    if (!a || !legal(a)) a = R.legalActions(S)[0];
    return a;
}

function driverTick() {
    const now = NT.serverNow(), i = applied.length;
    if (S.phase === 'roundEnd') {
        // En multijoueur : auto-avance uniquement si le classement a été affiché depuis au moins 25 secondes
        if (isDriver() && endSeen > 0 && Date.now() - endSeen > 25000) {
            endSeen = 0;
            put({ s: ME, a: { type: 'next' }, t: now });
        }
        return;
    }
    if (!playing() || !isDriver()) return;
    if (!absent(S.cur) && now < turnStart + T + 1200) return;
    if (pend.i !== i) pend = { i, due: Date.now() + (S.phase === 'reveal' ? 400 : 750) };
    if (Date.now() >= pend.due) {
        pend.due = Date.now() + 3000;
        put({ s: S.cur, a: aiAction(), t: now });
    }
}

function restart() {
    const keep = seats.filter(u => u === NT.N.uid || NT.isPresent(rd.players[u]));
    if (keep.length < 2) return;
    const x = {}; seats.forEach(u => { if (!keep.includes(u)) x['players/' + u] = null; });
    // Conserve le mode Classique ou Crazy dans la room
    put({ s: ME, a: { type: 'start', seed: (Math.random() * 4294967296) >>> 0, seats: keep, mode: S.mode }, t: NT.serverNow() }, x);
}

// ── Chrono Anneau ──
const tickT = setInterval(() => {
    const now = performance.now(), dt = now - last; last = now; let left = null;
    if (ROOM) {
        if (S && rd && !leaving) {
            if (playing()) left = Math.max(0, turnStart + T - NT.serverNow());
            driverTick();
            const sig = `${canAct()}|${seats.map((_, i) => (absent(i) ? 1 : 0)).join('')}`;
            if (sig !== lastSig) { lastSig = sig; render(); }
        }
    } else {
        if (tOn && !paused && !auto) {
            tLeft -= dt;
            if (tLeft <= 0) { tLeft = 0; tOn = false; autoPlay(); }
        }
        left = tOn ? tLeft : null;
    }
    $('arc').style.strokeDashoffset = left !== null ? C * (1 - left / T) : C;
    $('sec').textContent = left !== null ? Math.ceil(left / 1000) : '–';
    $('ring').classList.toggle('low', left !== null && left < 8000);
}, 100);
window.addEventListener('pagehide', () => clearInterval(tickT));

// ── Fin de manche / Fin de partie ──
function showEnd() {
    if (!S || !(S.phase === 'roundEnd' || S.phase === 'gameEnd')) return;
    const h = S.history[S.history.length - 1], over = S.phase === 'gameEnd';
    if (!h) return;
    endRendered = applied.length;
    endSeen = Date.now(); // Enregistre le moment précis où le classement est réellement affiché

    // Tri des joueurs par classement : à Skyjo, le plus petit score total l'emporte !
    const ranked = S.players.map((_, i) => i).sort((a, b) => S.totals[a] - S.totals[b]);

    const rows = ranked.map((i, rank) => {
        const dbl = h.doubled && h.closer === i;
        const isMe = i === ME;
        const isWinner = over && S.winners.includes(i);
        const rankLabel = rank === 0 ? (over ? '1er 🏆' : '1er 👑') : `${rank + 1}e`;
        const rankColor = rank === 0 ? '#facc15' : 'var(--dim)';
        const pseudo = playerPseudo(i);
        const nameDisplay = isMe ? `${esc(pseudo)} (Vous)` : esc(pseudo);
        return `
          <tr class="${isWinner ? 'w ' : ''}${isMe ? 'me-row' : ''}">
            <td style="text-align:left;font-weight:900;color:${rankColor};">${rankLabel}</td>
            <td style="text-align:left;font-weight:${isMe ? '800' : '600'};">${nameDisplay}</td>
            <td style="text-align:right;">${dbl ? `${h.raw[i]} ×2 = ` : ''}<strong>${h.scores[i]}</strong></td>
            <td style="text-align:right;font-weight:900;color:var(--accent);">${S.totals[i]}</td>
          </tr>
        `;
    }).join('');

    let title = over ? 'Fin de partie' : `Fin de la manche ${h.round}`;
    let sub = '';
    if (h.closer !== null) {
        const closerName = h.closer === ME ? 'Vous avez' : `${esc(playerPseudo(h.closer))} a`;
        sub = `${closerName} fermé la manche${h.doubled ? ' (score doublé !)' : '.'}`;
    }
    if (over) {
        sub = S.winners.length > 1
            ? `Victoire partagée : ${S.winners.map(i => esc(playerPseudo(i))).join(', ')} !`
            : `${S.winners[0] === ME ? 'Vous remportez la partie' : esc(playerPseudo(S.winners[0])) + ' remporte la partie'} !`;
    }

    let btns;
    if (!ROOM) {
        btns = `<div class="pause-menu"><button class="btn-sky" id="endBtn" type="button">${over ? 'Retour au menu' : 'Manche suivante'}</button></div>`;
    } else if (over) {
        const ok = seats.filter(u => u === NT.N.uid || NT.isPresent(rd.players[u])).length >= 2;
        btns = `<div class="pause-menu"><button class="btn-sky" id="endBtn" type="button"${ok ? '' : ' disabled'}>Rejouer</button><button class="btn-sky secondary" id="endMenu" type="button">Quitter</button></div>${ok ? '' : '<p class="note" style="margin-top:10px">Il faut au moins 2 joueurs présents pour rejouer.</p>'}`;
    } else {
        btns = `<div class="pause-menu"><button class="btn-sky" id="endBtn" type="button">Manche suivante</button><button class="btn-sky secondary" id="endMenu" type="button">Quitter</button></div>`;
    }

    $('endBox').innerHTML = `
      <h2>${title}</h2>
      <p class="note" style="margin-bottom:14px">${sub}</p>
      <table class="tb" style="margin-bottom:16px">
        <thead>
          <tr>
            <th style="text-align:left;">Rang</th>
            <th style="text-align:left;">Joueur</th>
            <th style="text-align:right;">Manche</th>
            <th style="text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      ${btns}
    `;
    $('endOverlay').classList.add('open');

    $('endBtn').addEventListener('click', () => {
        $('endBtn').disabled = true;
        if (ROOM) {
            if (over) restart();
            else put({ s: ME, a: { type: 'next' }, t: NT.serverNow() });
            return;
        }
        $('endOverlay').classList.remove('open');
        if (over) { clear(); location.href = 'index.html'; return; }
        R.nextRound(S);
        save();
        loop();
    });
    const em = $('endMenu');
    if (em) em.addEventListener('click', exit);
}

// ── Overlays (Règles, Pause, Quitter) ──
const setPaused = () => { paused = !ROOM && (pauseO || rulesO); };
const hold = () => { if (!ROOM) clearTimeout(to); };

$('rulesBtn').addEventListener('click', () => {
    rulesO = true; setPaused(); hold(); $('rulesOverlay').classList.add('open');
});
$('rulesClose').addEventListener('click', () => {
    rulesO = false; setPaused(); $('rulesOverlay').classList.remove('open'); if (S) loop();
});

$('pauseBtn').addEventListener('click', () => {
    pauseO = true; setPaused(); hold(); $('pauseOverlay').classList.add('open');
});
$('resumeBtn').addEventListener('click', () => {
    pauseO = false; setPaused(); $('pauseOverlay').classList.remove('open'); if (S) loop();
});
$('quitBtn').addEventListener('click', () => {
    if (ROOM) { exit(); return; }
    if (confirm('Quitter la partie ? La progression sera perdue.')) {
        clear();
        location.href = 'index.html';
    }
});

for (const id of ['rulesOverlay', 'pauseOverlay']) {
    const el = $(id);
    if (el) el.addEventListener('click', e => {
        if (e.target === el) {
            if (id === 'rulesOverlay') $('rulesClose').click();
            else $('resumeBtn').click();
        }
    });
}

async function exit() {
    leaving = true;
    if (unsub) { unsub(); unsub = null; }
    clearInterval(hbT);
    try { await NT.leaveRoom(ROOM, true); } catch (e) { console.warn(e); }
    NT.clearSavedRoom();
    location.href = 'index.html';
}

function ld(t, btn) {
    $('ldOv').classList.add('open');
    $('ldTxt').textContent = t;
    $('ldBtn').hidden = !btn;
}
$('ldBtn').addEventListener('click', () => { location.href = 'index.html'; });

// ── Démarrage ──
async function boot() {
    ld('Connexion…');
    if (!(await NT.initFb())) { ld('Connexion impossible.', true); return; }
    const id = NT.gameIdOf(ROOM), d = await NT.N.fb.getRoom(id);
    if (!d || !d.players || !d.players[NT.N.uid]) { NT.clearSavedRoom(); ld('Room introuvable.', true); return; }
    if (d.state !== 'playing') { ld('La partie n’a pas commencé.', true); return; }
    NT.saveRoom(ROOM);
    await NT.N.fb.updateRoom(id, { [`players/${NT.N.uid}/away`]: false, [`players/${NT.N.uid}/lastSeen`]: NT.ts() });
    unsub = NT.watch(ROOM, onRoom);
    hbT = setInterval(() => NT.beat(ROOM), NT.HEARTBEAT_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) NT.beat(ROOM); });
}

if (ROOM) {
    boot().catch(e => { console.error(e); ld('Erreur de connexion.', true); });
} else {
    // Outils de debug : uniquement en local ou avec ?debug=1
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || q.get('debug') === '1') {
        window.__skyjo = {
            get S() { return S; }, R,
            refresh() { bk = ''; save(); loop(); },
            grid(seat, vals, up = true) {
                S.players[seat].grid = vals.map((v, i) => (v === null ? null : (typeof v === 'object' ? { ...v, up: Array.isArray(up) ? !!up[i] : up } : { v, up: Array.isArray(up) ? !!up[i] : up })));
                this.refresh();
            }
        };
    }
    loop();
}