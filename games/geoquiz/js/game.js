// game.js — logique complète du jeu GeoQuiz
import { COUNTRIES, CONTINENTS } from './countries.js';
import { playGameSound, startGqMusic, stopGqMusic } from '../../../js/utils/audio.js';
import { initSettingsUI } from '../../../js/utils/settingsUI.js';

// Initialisation des réglages
initSettingsUI('geoquiz');
let musicStarted = false;

// ─── Paramètres URL ──────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const MODE = params.get('mode') || 'flag';      // 'flag' | 'shape'
const DIFF = params.get('diff') || 'standard';  // 'standard' | 'hard'
const CONTINENT = params.get('continent') || 'ALL';
const LANG = params.get('lang') || 'fr';

const ROUND_COUNT = 10;
const MAX_TRIES_STD = 2;   // standard : 2 essais
const MAX_TRIES_HRD = 3;   // hard : 3 essais

// Points
const POINTS = {
    standard: { first: 120, second: 50 },
    hard: { first: 120, second: 50, third: 50 }
};

const STREAK_BONUSES = { 2: 10, 3: 15, 4: 20, 5: 25, 6: 30, 7: 35, 8: 45, 9: 55, 10: 65 };

// ─── DOM ─────────────────────────────────────────────────────────────────────
const hudMode = document.getElementById('hudMode');
const hudScore = document.getElementById('hudScore');
const hudStreak = document.getElementById('hudStreak');
const hudCounter = document.getElementById('hudCounter');
const progressFill = document.getElementById('progressFill');
const flagImg = document.getElementById('flagImg');
const shapeWrap = document.getElementById('shapeWrap');
const shapeSvg = document.getElementById('shapeSvg');
const choicesGrid = document.getElementById('choicesGrid');
const hardInputEl = document.getElementById('hardInput');
const blanksRow = document.getElementById('blanksRow');
const hardField = document.getElementById('hardInputField');
const hardSubmit = document.getElementById('hardSubmitBtn');
const attemptsLeft = document.getElementById('attemptsLeft');
const feedbackBanner = document.getElementById('feedbackBanner');
const feedbackIcon = document.getElementById('feedbackIcon');
const feedbackText = document.getElementById('feedbackText');
const nextBtn = document.getElementById('nextBtn');
const endScreen = document.getElementById('endScreen');
const endEmoji = document.getElementById('endEmoji');
const endTitle = document.getElementById('endTitle');
const endScore = document.getElementById('endScore');
const endSubtitle = document.getElementById('endSubtitle');
const endStats = document.getElementById('endStats');
const replayBtn = document.getElementById('replayBtn');

// ─── État ────────────────────────────────────────────────────────────────────
let pool = [];   // pays filtrés par continent
let queue = [];   // pays dans cet ordre pour la partie
let current = null; // pays courant
let roundIdx = 0;
let score = 0;
let streak = 0;
let triesLeft = 0;
let answered = false;
let correctCount = 0;
let firstTryCount = 0;

// ─── Init ────────────────────────────────────────────────────────────────────
function init() {
    hudMode.textContent = MODE === 'flag' ? '🚩 Flag' : '🗺️ Shape';

    pool = CONTINENT === 'ALL'
        ? [...COUNTRIES]
        : COUNTRIES.filter(c => c.continent === CONTINENT);

    if (pool.length < 4) {
        alert('Pas assez de pays pour ce continent. Retour au menu.');
        location.href = './index.html';
        return;
    }

    // Mélanger et prendre ROUND_COUNT pays
    queue = shuffle([...pool]).slice(0, ROUND_COUNT);

    updateHUD();
    nextRound();

    nextBtn.addEventListener('click', nextRound);
    replayBtn.addEventListener('click', () => location.reload());
    hardSubmit.addEventListener('click', submitHard);
    hardField.addEventListener('keydown', e => { if (e.key === 'Enter') submitHard(); });

    // Précharger les drapeaux en cache (offline)
    if ('caches' in window && MODE === 'flag') {
        prewarmFlags();
    }
}

// ─── Rounds ──────────────────────────────────────────────────────────────────
function nextRound() {
    if (roundIdx >= ROUND_COUNT) { showEnd(); return; }

    answered = false;
    current = queue[roundIdx];
    triesLeft = DIFF === 'hard' ? MAX_TRIES_HRD : MAX_TRIES_STD;
    roundIdx++;

    updateHUD();
    hideFeedback();

    if (MODE === 'flag') showFlag();
    else showShape();

    if (DIFF === 'standard') showChoices();
    else showHardInput();
}

function updateHUD() {
    hudScore.textContent = score;
    hudCounter.textContent = `${roundIdx} / ${ROUND_COUNT}`;
    progressFill.style.width = `${((roundIdx - 1) / ROUND_COUNT) * 100}%`;
    hudStreak.textContent = streak >= 3 ? `🔥 ${streak}` : streak >= 2 ? `⚡ ${streak}` : '';
}

// ─── Flag mode ───────────────────────────────────────────────────────────────
function showFlag() {
    flagImg.style.display = 'block';
    shapeWrap.style.display = 'none';
    flagImg.src = `https://flagcdn.com/w320/${current.iso}.png`;
    flagImg.alt = 'Drapeau à deviner';
    // Reload animation
    flagImg.style.animation = 'none';
    void flagImg.offsetWidth;
    flagImg.style.animation = '';
}

// ─── Shape mode ──────────────────────────────────────────────────────────────
let geoData = null; // cache GeoJSON

async function showShape() {
    flagImg.style.display = 'none';
    shapeWrap.style.display = 'flex';
    shapeSvg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#4a4a55" font-size="14" dy="0.3em">Chargement…</text>';

    if (!geoData) {
        try {
            // Données GeoJSON légères depuis un CDN open source
            const r = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
            const topo = await r.json();
            // On importe topojson uniquement si besoin
            geoData = topo;
        } catch (e) {
            shapeSvg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#f5425a" font-size="13" dy="0.3em">Impossible de charger la carte</text>';
            return;
        }
    }

    drawShape(current.iso);
}

function drawShape(iso) {
    // Cherche le pays dans le GeoJSON via le mapping iso->numeric
    const numericCode = isoToNumeric(iso);
    if (!numericCode || !geoData) {
        shapeSvg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#f5c842" font-size="13" dy="0.3em">Forme non disponible</text>';
        return;
    }

    // On utilise topojson-client en CDN si disponible, sinon dessin basique
    if (typeof topojson !== 'undefined') {
        renderTopoShape(numericCode);
    } else {
        // Chargement dynamique du script
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
        s.onload = () => renderTopoShape(numericCode);
        s.onerror = () => {
            shapeSvg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#f5425a" font-size="13" dy="0.3em">Forme non disponible hors ligne</text>';
        };
        document.head.appendChild(s);
    }
}

function renderTopoShape(numericCode) {
    const countries = topojson.feature(geoData, geoData.objects.countries);
    const feature = countries.features.find(f => String(f.id) === String(numericCode));

    if (!feature) {
        shapeSvg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#f5c842" font-size="13" dy="0.3em">Forme non trouvée</text>';
        return;
    }

    // Projection simple (équirectangulaire adaptée aux coordonnées du pays)
    const pathStr = geoPathSimple(feature);
    shapeSvg.innerHTML = '';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathStr);
    shapeSvg.appendChild(path);
    // Animation
    path.style.animation = 'none';
    void path.offsetWidth;
    path.style.animation = 'popIn 0.5s var(--ease-spring) both';
}

function geoPathSimple(feature) {
    // Calcul des bounds
    const coords = getAllCoords(feature.geometry);
    if (coords.length === 0) return '';

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [lng, lat] of coords) {
        if (lng < minX) minX = lng;
        if (lng > maxX) maxX = lng;
        if (lat < minY) minY = lat;
        if (lat > maxY) maxY = lat;
    }

    const W = 480, H = 380, PAD = 30;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = Math.min((W - PAD * 2) / rangeX, (H - PAD * 2) / rangeY);
    const offX = (W - rangeX * scale) / 2 - minX * scale;
    const offY = (H - rangeY * scale) / 2 + maxY * scale;

    function project([lng, lat]) {
        return [lng * scale + offX, -lat * scale + offY];
    }

    function ringToPath(ring) {
        let d = '';
        for (let i = 0; i < ring.length; i++) {
            const [x, y] = project(ring[i]);
            d += (i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`);
        }
        return d + 'Z';
    }

    const geom = feature.geometry;
    let d = '';

    if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates) d += ringToPath(ring);
    } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates)
            for (const ring of poly) d += ringToPath(ring);
    }

    return d;
}

function getAllCoords(geom) {
    const out = [];
    if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates) for (const p of ring) out.push(p);
    } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates)
            for (const ring of poly)
                for (const p of ring) out.push(p);
    }
    return out;
}

// ISO alpha-2 → numérique UN (utilisé par world-atlas)
const ISO_NUMERIC = {
    af: '004', al: '008', dz: '012', ad: '020', ao: '024', ag: '028', ar: '032', am: '051',
    au: '036', at: '040', az: '031', bs: '044', bh: '048', bd: '050', bb: '052', by: '112',
    be: '056', bz: '084', bj: '204', bt: '064', bo: '068', ba: '070', bw: '072', br: '076',
    bn: '096', bg: '100', bf: '854', bi: '108', cv: '132', kh: '116', cm: '120', ca: '124',
    cf: '140', td: '148', cl: '152', cn: '156', co: '170', km: '174', cg: '178', cd: '180',
    cr: '188', ci: '384', hr: '191', cu: '192', cy: '196', cz: '203', dk: '208', dj: '262',
    dm: '212', do: '214', ec: '218', eg: '818', sv: '222', gq: '226', er: '232', ee: '233',
    sz: '748', et: '231', fj: '242', fi: '246', fr: '250', ga: '266', gm: '270', ge: '268',
    de: '276', gh: '288', gr: '300', gd: '308', gt: '320', gn: '324', gw: '624', gy: '328',
    ht: '332', hn: '340', hu: '348', is: '352', in: '356', id: '360', ir: '364', iq: '368',
    ie: '372', il: '376', it: '380', jm: '388', jp: '392', jo: '400', kz: '398', ke: '404',
    ki: '296', kw: '414', kg: '417', la: '418', lv: '428', lb: '422', ls: '426', lr: '430',
    ly: '434', li: '438', lt: '440', lu: '442', mg: '450', mw: '454', my: '458', mv: '462',
    ml: '466', mt: '470', mh: '584', mr: '478', mu: '480', mx: '484', fm: '583', md: '498',
    mc: '492', mn: '496', me: '499', ma: '504', mz: '508', mm: '104', na: '516', nr: '520',
    np: '524', nl: '528', nz: '554', ni: '558', ne: '562', ng: '566', mk: '807', no: '578',
    om: '512', pk: '586', pw: '585', pa: '591', pg: '598', py: '600', pe: '604', ph: '608',
    pl: '616', pt: '620', qa: '634', ro: '642', ru: '643', rw: '646', kn: '659', lc: '662',
    vc: '670', ws: '882', sm: '674', st: '678', sa: '682', sn: '686', rs: '688', sc: '690',
    sl: '694', sg: '702', sk: '703', si: '705', sb: '090', so: '706', za: '710', ss: '728',
    es: '724', lk: '144', sd: '729', sr: '740', se: '752', ch: '756', sy: '760', tw: '158',
    tj: '762', tz: '834', th: '764', tl: '626', tg: '768', to: '776', tt: '780', tn: '788',
    tr: '792', tm: '795', tv: '798', ug: '800', ua: '804', ae: '784', gb: '826', us: '840',
    uy: '858', uz: '860', vu: '548', ve: '862', vn: '704', ye: '887', zm: '894', zw: '716',
};

function isoToNumeric(iso) { return ISO_NUMERIC[iso.toLowerCase()] || null; }

// ─── Standard — 4 choix ───────────────────────────────────────────────────────
function showChoices() {
    choicesGrid.style.display = 'grid';
    hardInputEl.style.display = 'none';
    choicesGrid.innerHTML = '';

    // 3 distracteurs + bonne réponse, tous du pool
    const distractors = shuffle(pool.filter(c => c.iso !== current.iso)).slice(0, 3);
    const options = shuffle([current, ...distractors]);

    options.forEach(country => {
        const btn = document.createElement('button');
        btn.className = 'gq-choice-btn';
        btn.textContent = country[LANG] || country.fr;
        btn.addEventListener('click', () => handleChoiceClick(btn, country));
        choicesGrid.appendChild(btn);
    });
}

function handleChoiceClick(btn, country) {
    if (answered) return;
    if (!musicStarted) {
        startGqMusic();
        musicStarted = true;
    }
    const btns = choicesGrid.querySelectorAll('.gq-choice-btn');
    btns.forEach(b => b.disabled = true);

    if (country.iso === current.iso) {
        answered = true;
        btn.classList.add('correct');
        const isFirst = triesLeft === MAX_TRIES_STD;
        const pts = isFirst ? POINTS.standard.first : POINTS.standard.second;
        const bonus = addScore(pts, isFirst);
        correctCount++;
        if (isFirst) {
            firstTryCount++;
            playGameSound('gq_correct_1');
        } else {
            playGameSound('gq_correct_2');
        }
        const msg = buildScoreMsg(pts, bonus);
        showFeedback(true, msg);
    } else {
        btn.classList.add('wrong');
        triesLeft--;
        if (triesLeft > 0) {
            playGameSound('gq_fail_mid');
            // Encore un essai — réactiver les autres boutons
            btns.forEach(b => { b.disabled = false; });
            btn.disabled = true;
            showFeedback(false, `Raté — encore ${triesLeft} essai${triesLeft > 1 ? 's' : ''} !`, true);
            return;
        } else {
            answered = true;
            playGameSound('gq_fail_final');
            // Révéler la bonne réponse
            btns.forEach(b => {
                if (b.textContent === (current[LANG] || current.fr)) b.classList.add('reveal');
            });
            showFeedback(false, `C'était : ${current[LANG] || current.fr}`);
        }
    }
}

// ─── Hard — saisie ───────────────────────────────────────────────────────────
function showHardInput() {
    choicesGrid.style.display = 'none';
    hardInputEl.style.display = 'flex';
    hardField.value = '';
    hardField.disabled = false;
    hardSubmit.disabled = false;
    renderBlanks('');
    updateAttemptsLabel();
    setTimeout(() => hardField.focus(), 100);
}

function renderBlanks(typed) {
    const answer = current[LANG] || current.fr;
    blanksRow.innerHTML = '';
    for (const ch of answer) {
        const span = document.createElement('span');
        if (ch === ' ') {
            span.className = 'gq-blank space';
            span.textContent = ' ';
        } else {
            span.className = 'gq-blank';
            span.textContent = typed ? '' : '_';
        }
        blanksRow.appendChild(span);
    }
}

function revealBlanks(typed, correct) {
    const answer = current[LANG] || current.fr;
    const spans = blanksRow.querySelectorAll('.gq-blank:not(.space)');
    let letterIdx = 0;
    for (const ch of answer) {
        if (ch === ' ') continue;
        const span = spans[letterIdx];
        if (span) {
            span.textContent = ch;
            span.classList.add(correct ? 'revealed' : 'wrong-reveal');
        }
        letterIdx++;
    }
}

function updateAttemptsLabel() {
    attemptsLeft.innerHTML = `Essais restants : <strong>${triesLeft}</strong>`;
}

function submitHard() {
    if (answered) return;
    const typed = hardField.value.trim();
    if (!typed) return;

    if (!musicStarted) {
        startGqMusic();
        musicStarted = true;
    }

    const answer = current[LANG] || current.fr;
    const isCorrect = normalize(typed) === normalize(answer);

    if (isCorrect) {
        const tryNum = (DIFF === 'hard' ? MAX_TRIES_HRD : MAX_TRIES_STD) - triesLeft + 1;
        const isFirst = tryNum === 1;
        const pts = isFirst ? POINTS.hard.first : POINTS.hard.second; // Note: second and third are both 50
        revealBlanks(typed, true);
        const bonus = addScore(pts, isFirst);
        correctCount++;
        if (isFirst) {
            firstTryCount++;
            playGameSound('gq_correct_1');
        } else {
            playGameSound('gq_correct_2');
        }
        hardField.disabled = true;
        hardSubmit.disabled = true;
        answered = true;
        const msg = buildScoreMsg(pts, bonus);
        showFeedback(true, msg);
    } else {
        triesLeft--;
        hardField.value = '';
        hardField.style.animation = 'none';
        void hardField.offsetWidth;
        hardField.style.animation = 'shake 0.4s ease both';

        if (triesLeft > 0) {
            playGameSound('gq_fail_mid');
            updateAttemptsLabel();
            showFeedback(false, `Raté — encore ${triesLeft} essai${triesLeft > 1 ? 's' : ''} !`, true);
            setTimeout(() => hardField.focus(), 50);
        } else {
            playGameSound('gq_fail_final');
            revealBlanks('', false);
            hardField.disabled = true;
            hardSubmit.disabled = true;
            answered = true;
            showFeedback(false, `C'était : ${answer}`);
        }
    }
}

function normalize(s) {
    return s.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, '')
        .trim();
}

// ─── Score & streak ──────────────────────────────────────────────────────────
// Retourne le bonus de série accordé (0 si pas de bonus)
function addScore(pts, isFirstTry) {
    score += pts;
    let bonus = 0;

    if (isFirstTry) {
        streak++;
        bonus = STREAK_BONUSES[streak] || 0;
        score += bonus;
    } else {
        breakStreak();
    }

    hudScore.textContent = score;
    hudScore.classList.add('bump');
    setTimeout(() => hudScore.classList.remove('bump'), 300);
    updateHUD();
    return bonus;
}

// Construit le message de feedback pour un score correct
function buildScoreMsg(pts, bonus) {
    if (bonus > 0) {
        const label = streak >= 5 ? `🔥 Série de ${streak} !` : `⚡ Série de ${streak} !`;
        return `+${pts} pts  ·  ${label}  +${bonus} bonus`;
    }
    return `+${pts} pts`;
}

function breakStreak() {
    streak = 0;
    updateHUD();
}

// ─── Feedback ────────────────────────────────────────────────────────────────
function showFeedback(success, text, temp = false) {
    // Annuler tout timer temporaire précédent
    if (showFeedback._timer) { clearTimeout(showFeedback._timer); showFeedback._timer = null; }

    feedbackBanner.style.display = 'flex';
    feedbackBanner.className = 'gq-feedback ' + (success ? 'success' : 'error');
    feedbackIcon.textContent = success ? '✅' : (temp ? '❌' : '💡');
    feedbackText.textContent = text;
    nextBtn.style.display = temp ? 'none' : 'inline-flex';
    if (!success && !temp) breakStreak();
    if (temp) {
        showFeedback._timer = setTimeout(() => {
            feedbackBanner.style.display = 'none';
            showFeedback._timer = null;
        }, 1200);
    }
}

function hideFeedback() {
    feedbackBanner.style.display = 'none';
}

// ─── End screen ──────────────────────────────────────────────────────────────
function showEnd() {
    progressFill.style.width = '100%';
    const pct = Math.round((correctCount / ROUND_COUNT) * 100);

    const MESSAGES = [
        { min: 100, titles: ["WAW Impressionnant !", "Maître du Monde !", "Score Parfait !", "Géographie Maxxeur !"], emojis: ["🏆", "👑", "🎯", "🔥"] },
        { min: 80, titles: ["Excellent score !", "Bien joué !", "Tu gères la fougère !", "Quelle culture !"], emojis: ["🎉", "⭐", "👏", "✅"] },
        { min: 50, titles: ["Pas mal du tout", "Honorable", "Ça passe créme", "Tu connais tes bases"], emojis: ["👍", "🌍", "💪", "🧐"] },
        { min: 20, titles: ["Ouh là...", "Peut mieux faire", "Un peu de révision ?", "C'est fragile !"], emojis: ["🧐", "📚", "😅", "🧭"] },
        { min: 0, titles: ["Fais un effort nan ?", "Aïe aïe aïe...", "T'as séché la géo ?", "C'est la cata !"], emojis: ["💀", "📉", "🤡", "🚑"] }
    ];

    const category = MESSAGES.find(m => pct >= m.min) || MESSAGES[MESSAGES.length - 1];
    const randomIdx = Math.floor(Math.random() * category.titles.length);

    const title = category.titles[randomIdx];
    const emoji = category.emojis[randomIdx];

    // Jouer le son du résultat
    if (pct === 100) playGameSound('gq_result_perfect');
    else if (pct >= 80) playGameSound('gq_result_good');
    else if (pct >= 50) playGameSound('gq_result_meh');
    else playGameSound('gq_result_bad');

    endEmoji.textContent = emoji;
    endTitle.textContent = title;
    endScore.textContent = score;
    endSubtitle.textContent = `${correctCount} / ${ROUND_COUNT} bons pays`;
    endStats.innerHTML = `
    <div class="gq-end-stat"><strong>${firstTryCount}</strong><small>1er essai</small></div>
    <div class="gq-end-stat"><strong>${correctCount - firstTryCount}</strong><small>2e essai</small></div>
    <div class="gq-end-stat"><strong>${ROUND_COUNT - correctCount}</strong><small>Ratés</small></div>
    <div class="gq-end-stat"><strong>${pct}%</strong><small>Réussite</small></div>
  `;
    endScreen.style.display = 'flex';
}

// ─── Offline / cache flags ───────────────────────────────────────────────────
async function prewarmFlags() {
    const cacheName = 'geoquiz-flags-v1';
    try {
        const cache = await caches.open(cacheName);
        const urls = pool.map(c => `https://flagcdn.com/w320/${c.iso}.png`);
        // Mise en cache progressive (pas de blocage)
        for (const url of urls) {
            cache.match(url).then(r => { if (!r) cache.add(url).catch(() => { }); });
        }
    } catch (e) { /* silencieux */ }
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ─── CSS runtime (shake animation) ───────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%,100%{transform:translateX(0)}
    20%{transform:translateX(-6px)}
    40%{transform:translateX(6px)}
    60%{transform:translateX(-4px)}
    80%{transform:translateX(4px)}
  }
  @keyframes popIn {
    from{transform:scale(0.85);opacity:0}
    to{transform:scale(1);opacity:1}
  }
`;
document.head.appendChild(style);

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();