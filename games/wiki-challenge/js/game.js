/**
 * Wiki Challenge — game.js
 * Écran de partie (solo : ?mode=solo / multi : ?room=CODE). Mêmes imports, constantes et
 * conventions que menu.js (voir README). Wikipédia est rendue localement via l'API MediaWiki
 * officielle (action=parse) : pas d'iframe, pas de proxy.
 */
import { database, auth, firebaseReady, getServerTimestamp, getRef, getOnValue, getUpdate } from "../../../js/config/firebase-config.js";
import { updateRoom, getRoom, deleteRoom } from "../../../js/firebaseWrk.js";
import { checkRealConnection } from "../../../js/network.js";

// ═══ CONSTANTES (identiques à menu.js) ═══
const GAME_PREFIX = 'wikichallenge_';
const SAVED_ROOM_KEY = 'wikiChallenge_room';
const HEARTBEAT_MS = 20000;
const OFFLINE_AFTER_MS = 75000;
const ROUND_MS = 15 * 60 * 1000;
const API = 'https://fr.wikipedia.org/w/api.php';
const WIKT = 'https://fr.wiktionary.org/w/api.php';

const qs = new URLSearchParams(location.search);
const SOLO = qs.get('mode') === 'solo';
const code = (qs.get('room') || '').toUpperCase();
if (!SOLO && !code) location.replace('index.html');

// ═══ STATE ═══
let myUID = SOLO ? 'solo' : null;
let data = null;            // vue courante de la partie (snapshot Firebase, ou objet local en solo)
let serverOffset = 0;
let roomUnsub = null, hbTimer = null, tickTimer = null;
let redirecting = false, takingLead = false, generating = false, ending = false, navBusy = false;
let genErr = '';
let startedRound = 0, cur = null, stack = [], trail = [];   // trail = toutes les pages ouvertes, dans l'ordre
const prev = {};            // statuts précédents (toasts)
const cache = new Map();
const busy = { leave: false, replay: false, giveup: false };

// ═══ DOM ═══
const $ = id => document.getElementById(id);
const wStart = $('wStart'), wTarget = $('wTarget'), wTimer = $('wTimer');
const backBtn = $('backBtn'), rankBtn = $('rankBtn'), giveUpBtn = $('giveUpBtn');
const reader = $('reader'), loader = $('loader'), loaderText = $('loaderText'), loaderRetry = $('loaderRetry');
const rankNote = $('rankNote'), rankList = $('rankList');
const genRetryBtn = $('genRetryBtn'), replayBtn = $('replayBtn'), waitLeader = $('waitLeader');
const closeRankBtn = $('closeRankBtn'), quitBtn = $('quitBtn'), toastEl = $('toast');

// ═══ HELPERS ═══
const gameId = () => `${GAME_PREFIX}${code}`;
const ts = () => { const f = getServerTimestamp(); return f ? f() : Date.now(); };
const serverNow = () => Date.now() + serverOffset;
const isOffline = (p, uid) => uid !== myUID && !!p && typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > OFFLINE_AFTER_MS;
const fmt = ms => { const s = Math.floor(Math.max(0, ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
const clearSavedRoom = () => { try { localStorage.removeItem(SAVED_ROOM_KEY); } catch (e) { /* ignore */ } };
const saveRoom = c => { try { localStorage.setItem(SAVED_ROOM_KEY, c); } catch (e) { /* ignore */ } };

function toast(t) {
    const d = document.createElement('div');
    d.className = 'wc-toast';
    d.textContent = t;
    toastEl.append(d);
    setTimeout(() => d.remove(), 4500);
}

function sortedPlayers(d) {
    return Object.entries(d.players || {}).sort((a, b) => ((a[1].joined || 0) - (b[1].joined || 0)) || a[0].localeCompare(b[0]));
}

function setLoader(text, retry) {
    loader.hidden = !text;
    loaderText.textContent = text || '';
    loaderRetry.hidden = !retry;
    loaderRetry.onclick = retry || null;
}

// ═══ API WIKIPÉDIA ═══
async function api(p, ms = 8000, base = API) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
        const r = await fetch(`${base}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...p })}`, { signal: c.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (j.error) { const e = new Error(j.error.info || j.error.code); e.code = j.error.code; throw e; }
        return j;
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('délai dépassé');
        throw e;
    } finally { clearTimeout(t); }
}

// Titre « mot courant » : 1 à 3 mots, sans chiffre ni ponctuation (pas de liste de mots écrite à la main)
const okTitle = t => t.length <= 24 && t.split(' ').length <= 3 && !/[\d(),:;/&]/.test(t);

// Mot courant = la 1re phrase de l'article commence par « le/la/les/l'/un/une + le mot en minuscules »
// (« La tartiflette est… »). Cela écarte les noms propres (« Paris est… », « Le Parrain est… »).
// Le caractère concret (animal, plat, métal…) vient des catégories thématiques du Wiktionnaire.
function isCommonNoun(word, extract) {
    const esc = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^(?:L[ea]s?\\s+|L['’]|Une?\\s+|Des\\s+)${esc}(?!\\p{L})`, 'u').test(extract);
}

// Source des mots = Wiktionnaire FR (dictionnaire libre, API officielle Wikimedia), 3 allers-retours au total :
//  1. catégories thématiques (« Métaux en français », « Fruits en français »…) listées par l'API ;
//  2. mots de 3 catégories tirées au hasard (en parallèle) ;
//  3. vérification sur Wikipédia (article existant, lu, non homonyme, nom commun), 20 mots par requête, en parallèle.
// Aucune liste de mots écrite à la main.
async function dictCategories() {
    const base = { action: 'query', list: 'categorymembers', cmtitle: 'Catégorie:Thématiques en français', cmtype: 'subcat', cmlimit: 200 };
    const L = String.fromCharCode(65 + Math.floor(Math.random() * 20));   // point de départ aléatoire dans l'alphabet
    let j = await api({ ...base, cmstartsortkeyprefix: L }, 6000, WIKT);
    if (!j.query?.categorymembers?.length) j = await api(base, 6000, WIKT);
    return shuffle((j.query?.categorymembers || []).map(c => c.title));
}

async function catWords(cat) {
    const j = await api({ action: 'query', list: 'categorymembers', cmtitle: cat, cmtype: 'page', cmlimit: 500 }, 6000, WIKT);
    return (j.query?.categorymembers || []).map(m => m.title).filter(okTitle);
}

async function pickWords() {
    const seen = new Set();
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        let words = [];
        try {
            const cats = await dictCategories();
            if (!cats.length) throw new Error('catégories du dictionnaire introuvables');
            const lists = await Promise.allSettled(cats.slice(0, 3).map(catWords));
            for (const r of lists) {
                if (r.status === 'fulfilled') words.push(...shuffle(r.value).slice(0, 20));
                else lastErr = r.reason;
            }
        } catch (e) { lastErr = e; continue; }
        words = [...new Set(words)].filter(w => !seen.has(w));
        words.forEach(w => seen.add(w));
        const chunks = [];
        for (let i = 0; i < words.length; i += 20) chunks.push(words.slice(i, i + 20));

        const res = await Promise.allSettled(chunks.map(c => api({
            action: 'query', titles: c.join('|'), redirects: 1, prop: 'pageprops|pageviews|extracts', ppprop: 'disambiguation',
            pvipdays: 30, exintro: 1, explaintext: 1, exsentences: 1, exlimit: 20
        })));
        const valid = [];
        res.forEach((r, i) => {
            if (r.status !== 'fulfilled') { lastErr = r.reason; return; }
            const q = r.value.query || {};
            const norm = new Map((q.normalized || []).map(x => [x.from, x.to]));
            const red = new Map((q.redirects || []).map(x => [x.from, x.to]));
            const byTitle = new Map((q.pages || []).map(p => [p.title, p]));
            for (const w of chunks[i]) {
                const t = norm.get(w) || w;
                const p = byTitle.get(red.get(t) || t);
                if (!p || p.missing || p.pageprops?.disambiguation || valid.some(x => x.id === p.pageid)) continue;
                if (!isCommonNoun(w, p.extract || '')) continue;
                const views = Object.values(p.pageviews || {}).reduce((a, v) => a + (v || 0), 0);
                valid.push({ title: p.title, id: p.pageid, views });
            }
        });
        if (valid.length >= 2) {
            const good = valid.filter(v => v.views >= 300);   // préfère les articles connus, sinon tout ce qui est valide
            const [s, t] = shuffle(good.length >= 2 ? good : valid);
            return { start: { title: s.title, id: s.id }, target: { title: t.title, id: t.id } };
        }
    }
    throw new Error(lastErr ? lastErr.message : 'aucun mot valide trouvé');
}

async function loadPage(title) {
    if (cache.has(title)) return cache.get(title);
    const j = await api({ action: 'parse', page: title, prop: 'text', redirects: 1, disableeditsection: 1, disablelimitreport: 1, disabletoc: 1, maxage: 3600, smaxage: 3600 });
    const pg = { id: j.parse.pageid, title: j.parse.title, html: j.parse.text };
    cache.set(title, pg);
    if (cache.size > 25) cache.delete(cache.keys().next().value);
    return pg;
}

// ═══ RENDU / NAVIGATION ═══
const BAD_NS = /^(fichier|file|image|catégorie|category|spécial|special|aide|help|wikipédia|wikipedia|portail|projet|modèle|template|discussion|talk|utilisateur|user|média|media|module|mediawiki|brouillon|draft|référence)(\s+\S+)?$/i;
const isArticle = t => !t.includes(':') || !BAD_NS.test(t.split(':')[0]);

function show(pg) {
    const doc = new DOMParser().parseFromString(pg.html, 'text/html');
    doc.querySelectorAll('script,style,link,iframe,object,embed,form,input,button,.mw-editsection,.toc,.navbox,.navbox-container,.bandeau-container,.bandeau-portail,.ambox,sup.reference,.reference,.references,.mw-references-wrap,.reflist,.mw-empty-elt,.printfooter,table.metadata').forEach(n => n.remove());
    doc.body.querySelectorAll('*').forEach(el => {
        for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
        if (el.tagName === 'IMG') el.loading = 'lazy';
    });
    doc.body.querySelectorAll('a').forEach(a => {
        const h = a.getAttribute('href') || '';
        let t = null;
        if (h.startsWith('#')) a.dataset.a = h.slice(1);
        else if (h.startsWith('/wiki/') && !a.classList.contains('new')) {
            try { t = decodeURIComponent(h.slice(6).split('#')[0]).replace(/_/g, ' '); } catch (e) { /* lien invalide */ }
            if (t && isArticle(t)) a.dataset.t = t; else a.classList.add('wc-dead');
        } else a.classList.add('wc-dead');
        a.removeAttribute('href');
        a.removeAttribute('target');
    });
    const art = document.createElement('article');
    art.className = 'wc-article';
    const h1 = document.createElement('h1');
    h1.textContent = pg.title;
    art.append(h1, ...doc.body.childNodes);
    reader.replaceChildren(art);
    reader.scrollTop = 0;
}

// Clics : seuls les liens d'articles fr.wikipedia.org (data-t) naviguent
reader.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.t) go(a.dataset.t);
    else if (a.dataset.a) reader.querySelector(`[id="${CSS.escape(a.dataset.a)}"]`)?.scrollIntoView();
});

const isActive = () => !!data && data.state === 'playing' && !!data.startPage && data.players?.[myUID]?.status === 'searching';

async function go(title, push = true) {
    if (navBusy || !isActive()) return;
    navBusy = true;
    setLoader('Chargement…');
    try {
        const pg = await loadPage(title);
        if (!isActive()) return;
        if (push && cur) stack.push(cur);
        cur = pg.title;
        show(pg);
        setLoader('');
        backBtn.disabled = !stack.length;
        if (trail[trail.length - 1] !== pg.title) trail.push(pg.title);
        const path = trail.join('|');
        if (pg.id === data.targetPage.id) setMe({ page: pg.title, path, status: 'found', finishedAt: SOLO ? Date.now() : ts() }, true);
        else setMe({ page: pg.title, path });
    } catch (e) {
        setLoader(e.code === 'missingtitle' ? 'Page introuvable.' : `Erreur réseau (${e.message || 'inconnue'}).`, () => go(title, push));
    } finally { navBusy = false; }
}

function openRound(title) {
    startedRound = data.currentRound;
    stack = []; cur = null;
    const me = data.players[myUID];
    trail = me.page && me.path ? me.path.split('|').filter(Boolean) : [];
    backBtn.disabled = true;
    go(title, false);
}

backBtn.addEventListener('click', () => { if (stack.length && !navBusy) { const t = stack.pop(); go(t, false); } });
rankBtn.addEventListener('click', () => document.body.classList.toggle('rank-open'));
closeRankBtn.addEventListener('click', () => document.body.classList.remove('rank-open'));

// ═══ ÉCRITURES ═══
function setMe(p, won = false) {
    if (won) toast('🎉 Bravo, tu as trouvé la page !');
    if (SOLO) { Object.assign(data.players.solo, p); render(); return; }
    try {
        getUpdate()(getRef()(database, `rooms/${gameId()}/players/${myUID}`), p).catch(() => { });
    } catch (e) { /* ignore */ }
}

giveUpBtn.addEventListener('click', () => {
    if (busy.giveup || !isActive() || !confirm('Abandonner cette manche ?')) return;
    busy.giveup = true;
    setMe({ status: 'gave_up' });   // la dernière page (`page`) est conservée
    busy.giveup = false;
});

// ═══ GÉNÉRATION DES MOTS (leader / solo) ═══
async function generate() {
    if (generating) return;
    generating = true; genErr = '';
    try {
        const w = await pickWords();
        if (SOLO) {
            Object.assign(data, { startPage: w.start, targetPage: w.target, roundStartedAt: Date.now() });
            onData(data);
        } else {
            const fresh = await getRoom(gameId());
            if (!fresh || fresh.state !== 'playing' || fresh.startPage || fresh.leaderId !== myUID) return;
            // Un seul update : mots + départ du chrono pour tout le monde
            const ok = await updateRoom(gameId(), { startPage: w.start, targetPage: w.target, roundStartedAt: ts() });
            if (!ok) throw new Error('écriture impossible');
        }
    } catch (e) {
        genErr = `Impossible de tirer les articles (${e.message || 'erreur'}).`;
        render();
    } finally { generating = false; }
}
genRetryBtn.addEventListener('click', () => { genErr = ''; render(); generate(); });

// ═══ FIN DE MANCHE ═══
function checkEnd(el) {
    if (ending) return;
    let reason = null;
    if (el >= ROUND_MS) reason = 'timeout';
    else if (el > 3000 && !Object.entries(data.players).some(([u, p]) => p.status === 'searching' && !isOffline(p, u))) reason = 'all_done';
    if (reason) endRound(reason);
}

async function endRound(reason) {
    ending = true;
    if (SOLO) { data.state = 'round_result'; data.endReason = reason; render(); return; }
    try {
        const fresh = await getRoom(gameId());   // écriture idempotente : on vérifie l'état réel
        if (fresh && fresh.state === 'playing' && fresh.currentRound === data.currentRound) {
            if (!(await updateRoom(gameId(), { state: 'round_result', endReason: reason }))) throw new Error();
        }
    } catch (e) { setTimeout(() => { ending = false; }, 5000); }
}

replayBtn.addEventListener('click', async () => {
    if (SOLO) { location.reload(); return; }
    if (busy.replay) return;
    busy.replay = true;
    try {
        const fresh = await getRoom(gameId());
        if (!fresh || fresh.leaderId !== myUID || fresh.state !== 'round_result') return;
        const u = { state: 'waiting', startPage: null, targetPage: null, roundStartedAt: null, endReason: null };
        for (const uid of Object.keys(fresh.players || {})) {
            u[`players/${uid}/status`] = 'waiting';
            u[`players/${uid}/page`] = null;
            u[`players/${uid}/path`] = null;
            u[`players/${uid}/finishedAt`] = null;
        }
        await updateRoom(gameId(), u);   // tous les clients repartent vers index.html (salle d'attente)
    } finally { busy.replay = false; }
});

// ═══ QUITTER (départ volontaire — même logique que menu.js) ═══
quitBtn.addEventListener('click', async () => {
    if (busy.leave) return;
    if (!SOLO && data?.state === 'playing' && !confirm('Quitter la partie ? Tu ne pourras pas la rejoindre.')) return;
    busy.leave = true;
    redirecting = true;
    stopAll();
    try {
        if (!SOLO) {
            const latest = await getRoom(gameId());
            if (latest) {
                const others = sortedPlayers(latest).filter(([u]) => u !== myUID);
                if (!others.length) await deleteRoom(gameId());
                else {
                    const u = { [`players/${myUID}`]: null };
                    if (latest.leaderId === myUID) u.leaderId = (others.find(([, p]) => !isOffline(p, 'x')) || others[0])[0];
                    await updateRoom(gameId(), u);
                }
            }
            clearSavedRoom();
        }
    } catch (e) { console.error(e); }
    location.href = 'index.html';
});

// ═══ AFFICHAGE ═══
function detail(p, uid, d, withPath) {
    const pg = !withPath && p.page ? ` · ${p.page}` : '';
    if (p.status === 'found') return `⏱ ${fmt(p.finishedAt - d.roundStartedAt)}`;
    if (p.status === 'gave_up') return `Abandon${pg}`;
    if (p.status === 'waiting_next') return 'Prochaine manche';
    if (!d.startPage) return 'En attente…';
    return `${isOffline(p, uid) ? 'Déconnecté' : d.state === 'round_result' ? 'Temps écoulé' : '🔎 En recherche'}${pg}`;
}

function renderRank(d) {
    const order = { found: 0, searching: 1, gave_up: 2, waiting_next: 3, waiting: 3 };
    const rows = sortedPlayers(d).sort((a, b) => (order[a[1].status] ?? 3) - (order[b[1].status] ?? 3)
        || (a[1].status === 'found' ? a[1].finishedAt - b[1].finishedAt : 0));
    let n = 0;
    rankList.replaceChildren(...rows.map(([uid, p]) => {
        const li = document.createElement('li');
        li.className = [uid === myUID ? 'me' : '', p.status === 'found' ? 'found' : '', isOffline(p, uid) ? 'off' : ''].join(' ').trim();
        const rk = document.createElement('span');
        rk.textContent = p.status === 'found' ? (['🥇', '🥈', '🥉'][n++] || `${n}.`) : '·';
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = `${uid === d.leaderId && !SOLO ? '👑 ' : ''}${p.name || 'Joueur'}${uid === myUID && !SOLO ? ' (toi)' : ''}`;
        const dt = document.createElement('span');
        dt.className = 'dt';
        // Parcours complet : pour tous en fin de manche, pour soi pendant la manche (jamais celui des autres en direct)
        const steps = d.state === 'round_result' || uid === myUID ? (p.path ? p.path.split('|') : (p.page ? [p.page] : [])) : [];
        dt.textContent = detail(p, uid, d, steps.length > 0);
        li.append(rk, nm, dt);
        if (steps.length) {
            const pt = document.createElement('span');
            pt.className = 'pt';
            pt.textContent = steps.join(' → ');
            li.append(pt);
        }
        return li;
    }));
}

function render() {
    const d = data, me = d?.players?.[myUID];
    if (!me) return;
    const done = d.state === 'round_result', active = isActive();
    wStart.textContent = d.startPage?.title || '…';
    wTarget.textContent = d.targetPage?.title || '…';
    document.body.classList.toggle('rank-only', !active);
    if (!active) document.body.classList.remove('rank-open');
    backBtn.hidden = giveUpBtn.hidden = rankBtn.hidden = closeRankBtn.hidden = !active;
    if (!active) setLoader('');

    let note = '';
    if (genErr) note = `⚠️ ${genErr}`;
    else if (done) note = d.endReason === 'timeout' ? '⏰ Temps écoulé ! Classement final.' : '🏁 Manche terminée ! Classement final.';
    else if (!d.startPage) note = 'Tirage des articles en cours…';
    else if (me.status === 'found') note = '🎉 Tu as trouvé la page ! Classement en direct :';
    else if (me.status === 'gave_up') note = 'Tu as abandonné cette manche. Classement en direct :';
    else if (me.status === 'waiting_next') note = '⏳ Une manche est en cours : tu participeras à la prochaine.';
    rankNote.textContent = note;
    genRetryBtn.hidden = !(genErr && (SOLO || d.leaderId === myUID));
    replayBtn.hidden = !(done && (SOLO || d.leaderId === myUID));
    waitLeader.hidden = !(done && !SOLO && d.leaderId !== myUID);
    renderRank(d);
    tick();
}

function tick() {
    const d = data;
    if (!d) return;
    if (d.state === 'playing' && d.roundStartedAt) {
        const el = serverNow() - d.roundStartedAt;
        wTimer.textContent = `${fmt(el)} / ${fmt(ROUND_MS)}`;
        wTimer.classList.toggle('warn', el > ROUND_MS - 120000);
        checkEnd(el);
    } else {
        wTimer.classList.remove('warn');
        wTimer.textContent = d.state === 'round_result' ? 'Terminé' : '--:--';
    }
}

// ═══ DONNÉES (solo local ou snapshot Firebase) ═══
function onData(d) {
    data = d;
    if (d.state !== 'playing') ending = false;
    for (const [uid, p] of Object.entries(d.players || {})) {
        if (uid !== myUID && prev[uid] === 'searching' && p.status === 'found') toast(`🎉 ${p.name} a trouvé la page ! (${fmt(p.finishedAt - d.roundStartedAt)})`);
        prev[uid] = p.status;
    }
    if (!SOLO) maybeTakeLeadership(d);
    if (d.state === 'playing' && !d.startPage && d.leaderId === myUID && !genErr) generate();
    if (isActive() && startedRound !== d.currentRound) openRound(d.players[myUID].page || d.startPage.title);   // départ ou reconnexion
    render();
}

function onSnap(d) {
    if (redirecting) return;
    if (!d || !d.players?.[myUID] || d.state === 'waiting') {
        redirecting = true;
        stopAll();
        if (!d || !d.players?.[myUID]) clearSavedRoom();
        location.replace('index.html');
        return;
    }
    onData(d);
}

// ═══ LEADERSHIP / PRÉSENCE (repris de menu.js) ═══
function maybeTakeLeadership(d) {
    if (takingLead || d.leaderId === myUID) return;
    const leader = d.players?.[d.leaderId];
    if (leader && !isOffline(leader, d.leaderId)) return;
    const cand = sortedPlayers(d).find(([u, p]) => !isOffline(p, u));
    if (!cand || cand[0] !== myUID) return;
    takingLead = true;
    updateRoom(gameId(), { leaderId: myUID }).catch(() => { }).finally(() => { takingLead = false; });
}

function beat() {
    if (SOLO || redirecting || !myUID) return;
    if (data && !data.players?.[myUID]) return;   // ne jamais recréer un joueur retiré
    try { getUpdate()(getRef()(database, `rooms/${gameId()}/players/${myUID}`), { lastSeen: ts() }).catch(() => { }); } catch (e) { /* ignore */ }
    if (data) maybeTakeLeadership(data);
}
const startHeartbeat = () => { beat(); hbTimer = setInterval(beat, HEARTBEAT_MS); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });

function stopAll() {
    if (typeof roomUnsub === 'function') roomUnsub();
    roomUnsub = null;
    clearInterval(hbTimer); clearInterval(tickTimer);
    hbTimer = tickTimer = null;
}
// Fermer l'onglet n'est PAS un départ : aucune écriture ici (reconnexion possible)
window.addEventListener('beforeunload', stopAll);

function watchServerOffset() {
    return new Promise(resolve => {
        const t = setTimeout(resolve, 2500);
        try {
            getOnValue()(getRef()(database, '.info/serverTimeOffset'), s => { serverOffset = Number(s.val()) || 0; clearTimeout(t); resolve(); });
        } catch (e) { resolve(); }
    });
}

// ═══ INIT ═══
async function init() {
    if (!(await checkRealConnection())) {
        sessionStorage.setItem('offline_target_path', location.href);
        location.href = '../offline.html';
        return;
    }
    tickTimer = setInterval(tick, 500);
    if (SOLO) {
        const name = localStorage.getItem('wikiChallenge_name') || localStorage.getItem('mg_player_name') || 'Toi';
        data = { state: 'playing', currentRound: 1, leaderId: 'solo', players: { solo: { name, status: 'searching' } } };
        onData(data);
        return;
    }
    const user = (await firebaseReady) ? auth.currentUser : null;
    if (!user) { setLoader('Connexion à Firebase impossible.', () => location.reload()); return; }
    myUID = user.uid;
    await watchServerOffset();
    let room = await getRoom(gameId());
    if (!room) room = await getRoom(gameId());   // getRoom() renvoie null aussi sur erreur réseau : un 2e essai
    if (!room || !room.players?.[myUID]) { clearSavedRoom(); location.replace('index.html'); return; }
    saveRoom(code);
    roomUnsub = getOnValue()(getRef()(database, `rooms/${gameId()}`), s => onSnap(s.val()), err => console.warn('listener room:', err));
    startHeartbeat();
}
init();