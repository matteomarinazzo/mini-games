/**
 * dailyChallenge.js — Défis quotidiens (Firebase Realtime Database)
 * Chemin : js/utils/dailyChallenge.js
 *
 * Rotation infinie :
 *   index = daysBetween('2026-05-10', today) % total
 *   → lit /challenge_templates/{index} dans la RTDB
 *
 * Offline-safe : AUCUN import Firebase sans vérification isOnline préalable.
 *
 * Usage depuis un jeu (fin de partie) :
 *   import { checkDailyChallenge } from '../utils/dailyChallenge.js';
 *   await checkDailyChallenge({ score: 3200, gameId: 'layer-pile' });
 */

import { checkRealConnection } from '../network.js';
import { addXP } from './xpSystem.js';

// ─── CONSTANTE : ne jamais changer après la mise en prod ──────────────────────
const START_DATE = '2026-05-12';

// ─── CLÉS LOCALSTORAGE ────────────────────────────────────────────────────────
const KEYS = {
    FIRST_DAY: 'mg_daily_first',   // "YYYY-MM-DD" — premier jour de connexion
    DONE: 'mg_daily_done',    // { "YYYY-MM-DD": true } — défis réussis
    CACHE: 'mg_daily_cache',   // { date, challenge } — cache du défi du jour
    SKIPPED: 'mg_daily_skipped', // { "YYYY-MM-DD": true } — défis ignorés
    ACTIVE: 'mg_daily_active',  // { date, gameId, condition } — défi en cours
};

// Cache mémoire (évite double fetch dans la même session)
let _cachedChallenge = null;

// ─── HELPERS DATE ─────────────────────────────────────────────────────────────
export function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
    return Math.floor((new Date(b) - new Date(a)) / 86400000);
}

function _ensureFirstDay() {
    if (!localStorage.getItem(KEYS.FIRST_DAY)) {
        localStorage.setItem(KEYS.FIRST_DAY, todayStr());
    }
}

// ─── STAT PROFIL : défis réussis / jours depuis la 1ère connexion ─────────────
/**
 * Retourne { done: number, total: number } pour la stat du panneau profil.
 * - done  = nb de défis marqués comme réussis
 * - total = nb de jours écoulés depuis la 1ère connexion (inclus aujourd'hui)
 *
 * Exemple : si tu joues depuis 30 jours et as réussi 12 défis → "12 / 30"
 */
export function getDailyChallengeStats() {
    _ensureFirstDay();
    const firstDay = localStorage.getItem(KEYS.FIRST_DAY);
    const doneMap = _getDoneMap();
    const elapsed = daysBetween(firstDay, todayStr()) + 1; // +1 = inclure aujourd'hui
    return {
        done: Object.keys(doneMap).length,
        total: Math.max(elapsed, 1),
    };
}

/**
 * Met à jour l'affichage de la stat dans le panneau profil.
 * Appeler après chaque réussite ET à l'ouverture du panneau.
 */
export function updateChallengeStat() {
    const el = document.getElementById('pstat-challenge-label');
    if (!el) return;
    const { done, total } = getDailyChallengeStats();
    el.textContent = `${done} / ${total}`;
}

// ─── HELPERS LOCALSTORAGE ─────────────────────────────────────────────────────
function _getDoneMap() {
    try { return JSON.parse(localStorage.getItem(KEYS.DONE) || '{}'); } catch { return {}; }
}

export function isTodayDone() {
    return !!_getDoneMap()[todayStr()];
}

export function isTodaySkipped() {
    try {
        const s = JSON.parse(localStorage.getItem(KEYS.SKIPPED) || '{}');
        return !!s[todayStr()];
    } catch { return false; }
}

export function markTodaySkipped() {
    try {
        const s = JSON.parse(localStorage.getItem(KEYS.SKIPPED) || '{}');
        s[todayStr()] = true;
        localStorage.setItem(KEYS.SKIPPED, JSON.stringify(s));
    } catch { }
}

function _markTodayDone() {
    const map = _getDoneMap();
    map[todayStr()] = true;
    localStorage.setItem(KEYS.DONE, JSON.stringify(map));
}

// ─── FETCH FIREBASE (RTDB) — OFFLINE-SAFE ────────────────────────────────────
/**
 * Charge le défi du jour depuis la RTDB.
 * NE fait JAMAIS d'import Firebase sans avoir vérifié isOnline.
 * Retourne null si offline ou si le défi n'existe pas.
 */
export async function fetchTodayChallenge() {
    // 1. Cache mémoire
    if (_cachedChallenge) return _cachedChallenge;

    const today = todayStr();

    // 2. Cache localStorage (valide uniquement pour aujourd'hui)
    try {
        const cached = JSON.parse(localStorage.getItem(KEYS.CACHE) || 'null');
        if (cached?.date === today && cached?.challenge) {
            _cachedChallenge = cached.challenge;
            return _cachedChallenge;
        }
    } catch { }

    // 3. Vérifier la connexion AVANT tout import Firebase
    const isOnline = await checkRealConnection();
    if (!isOnline) return null;

    // 4. Import dynamique Firebase (seulement si en ligne)
    // Utilise les factories de firebaseWrk.js (getRef, getGet) — même pattern que le reste du projet
    try {
        const { database, firebaseReady, getRef, getGet } = await import('../config/firebase-config.js');
        await firebaseReady;

        const ref = getRef();
        const get = getGet();
        if (!database || !ref || !get) return null;

        // Lire la config (startDate + total)
        const configSnap = await get(ref(database, 'app_config/challenges'));
        if (!configSnap.exists()) return null;

        const { startDate, total } = configSnap.val();
        const rawIndex = daysBetween(startDate, today);
        const index = ((rawIndex % total) + total) % total; // toujours positif

        // Lire le défi à cet index
        const challengeSnap = await get(ref(database, `challenge_templates/${index}`));
        if (!challengeSnap.exists()) return null;

        _cachedChallenge = { _index: index, ...challengeSnap.val() };

        // Mettre en cache localStorage pour éviter un re-fetch
        localStorage.setItem(KEYS.CACHE, JSON.stringify({
            date: today,
            challenge: _cachedChallenge,
        }));

        return _cachedChallenge;
    } catch (e) {
        console.warn('[dailyChallenge] Erreur fetch RTDB :', e);
        return null;
    }
}

export function evaluateCondition(condition, gameStats) {
    if (!condition) return false;
    const cfg = condition.config || {};
    switch (condition.type) {
        case 'surface_pct_gte': return gameStats.surfacePct >= condition.value;
        case 'shovel_level_gte': return gameStats.shovelLevel >= condition.value;
        case 'skiers_gte': return gameStats.skiers >= condition.value;
        case 'coins_gte': return gameStats.coins >= condition.value;
        case 'win_vs_ai': {
            if (!gameStats.wonVsAi) return false;
            if (cfg.speed && gameStats.ballSpeed !== cfg.speed) return false;
            if (cfg.paddleSize !== undefined && gameStats.paddleSize > cfg.paddleSize) return false;
            return true;
        }
        case 'beat_ai_expert': {
            if (!gameStats.beatAiExpert) return false;
            if (cfg.grid && gameStats.grid !== cfg.grid) return false;
            return true;
        }
        case 'survive_sec': {
            if (condition.config?.mode && gameStats.mode !== condition.config.mode) return false;
            return (gameStats.survived ?? 0) >= condition.value;
        }
        case 'avg_reaction_lte_ms': {
            if (condition.config?.mode && gameStats.mode !== condition.config.mode) return false;
            return (gameStats.avgReactionMs ?? Infinity) <= condition.value;
        }
        case 'finish_under_sec': return (gameStats.finishedInSec ?? Infinity) < condition.value;
        case 'finish_mode': return gameStats.mode === condition.config?.mode;
        case 'score_gte':
            if (condition.config?.mode && gameStats.mode !== condition.config.mode) return false;
            return (gameStats.score ?? 0) >= condition.value;
        case 'beat_world_record': {
            if (condition.stat === 'score') return !!gameStats.beatWorldRecordScore;
            if (condition.stat === 'floors') return !!gameStats.beatWorldRecordFloors;
            return !!gameStats.beatWorldRecord;
        }
        case 'beat_personal_best':
            if (condition.config?.mode && gameStats.mode !== condition.config.mode) return false;
            return !!gameStats.beatPersonalBest;
        case 'wins_gte':
            if (condition.config?.mode === 'duo' && gameStats.mode !== 'confrontation') return false;
            return !!gameStats.wonDuo;
        case 'altitude_and_land_km': return gameStats.landed === true && (gameStats.maxAltitudeKm ?? 0) >= condition.value;
        case 'rocket_value_gte': return (gameStats.rocketValue ?? 0) >= condition.value;
        case 'altitude_km_gte': return (gameStats.maxAltitudeKm ?? 0) >= condition.value;
        case 'tickets_gte': return (gameStats.totalTickets ?? 0) >= condition.value;
        case 'win_streak_gte': {
            const streakVal = cfg.game === 'scratch_card' ? (gameStats.scratchWinStreak ?? 0) : (gameStats.winStreak ?? 0);
            return streakVal >= condition.value;
        }
        case 'perfect_score': {
            // Check mode + difficulty pour GeoQuiz
            if (cfg.mode && gameStats.mode !== cfg.mode) return false;
            if (cfg.difficulty && gameStats.difficulty !== cfg.difficulty) return false;
            return gameStats.perfectMinigame === true;
        }
        case 'distance_lte_m': return (gameStats.distanceM ?? Infinity) <= condition.value;
        case 'win_no_life_lost': return !!gameStats.noLifeLost;
        case 'brick_resistance_gte': return (gameStats.brickResistance ?? 0) >= condition.value;
        case 'score_lte': return (gameStats.score ?? 0) <= condition.value;
        case 'no_miss': return !!gameStats.noMiss;
        case 'play_once': return true;
        case 'floors_gte': return (gameStats.floors ?? 0) >= condition.value;
        case 'reaction_lte_ms': return (gameStats.reactionMs ?? Infinity) <= condition.value;
        case 'balance_gte': return (gameStats.balance ?? 0) >= condition.value;
        case 'no_life_lost': return !!gameStats.noLifeLost;
        case 'grow_from_to': return (gameStats.startBalance ?? Infinity) <= condition.from && (gameStats.balance ?? 0) >= condition.to;
        case 'lose_all': return !!gameStats.lostAll;
        case 'finish_with_brick_resistance': return (gameStats.brickResistance ?? 0) >= condition.value;
        default: return false;
    }
}

// ─── CHECK DEPUIS UN JEU (fin de partie) ──────────────────────────────────────
export async function checkDailyChallenge(gameStats) {
    if (isTodayDone()) return false;

    // Vérifier qu'il y a un défi actif pour ce jeu
    let active = null;
    try { active = JSON.parse(localStorage.getItem(KEYS.ACTIVE) || 'null'); } catch { }
    if (!active || active.date !== todayStr() || active.gameId !== gameStats.gameId) return false;

    // Récupérer le défi (depuis cache — pas de nouveau fetch réseau)
    const challenge = await fetchTodayChallenge();
    if (!challenge || challenge.gameId !== gameStats.gameId) return false;

    if (!evaluateCondition(challenge.condition, gameStats)) return false;

    // Réussi !
    _markTodayDone();

    if (challenge.reward?.xp) {
        addXP(challenge.reward.xp);
    }

    localStorage.removeItem(KEYS.ACTIVE);
    updateChallengeStat();
    _showSuccessToast(challenge);
    return true;
}

// ─── TOAST SUCCÈS ─────────────────────────────────────────────────────────────
function _showSuccessToast(challenge) {
    const title = pickLocalizedField(challenge, "title");
    const toast = document.createElement('div');
    Object.assign(toast.style, {
        position: 'fixed', bottom: '80px', right: '20px', zIndex: '9999',
        background: 'linear-gradient(135deg,rgba(67,233,123,.96),rgba(56,249,215,.96))',
        color: '#0a2414', borderRadius: '16px', padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: '14px',
        boxShadow: '0 8px 32px rgba(0,0,0,.4)',
        transform: 'translateX(120%)',
        transition: 'transform .4s cubic-bezier(.16,1,.3,1)',
        maxWidth: '300px', fontFamily: 'inherit',
        border: '1px solid rgba(255,255,255,.3)',
    });
    toast.innerHTML = `
    <div style="font-size:2rem;flex-shrink:0">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
          </svg>
    </div>
    <div>
      <div style="font-size:.95rem;font-weight:800">${title}</div>
      ${challenge.reward?.xp ? `<div style="font-size:.75rem;margin-top:3px;opacity:.75">+${challenge.reward.xp} XP</div>` : ''}
    </div>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; }));
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 500);
    }, 4500);
}

// ─── INIT BOUTON HEADER ───────────────────────────────────────────────────────
export async function initDailyChallenge() {
    _ensureFirstDay();
    updateChallengeStat();

    const btn = document.getElementById('dailyChallengeBtn');
    if (!btn) return;

    // Vérifier la connexion d'abord
    const isOnline = await checkRealConnection();

    if (!isOnline) {
        // Offline : si cache dispo on l'affiche quand même, sinon message
        const cached = _getCachedForToday();
        if (cached) {
            // On a un cache du jour → afficher le bouton normalement
            _cachedChallenge = cached;
            _updateBtn(btn, cached);
            btn.addEventListener('click', () => _openModal(cached));
        } else {
            // Aucun cache → bouton avec message offline
            _setBtnOffline(btn);
        }
        return;
    }

    // Online : fetch normal
    const challenge = await fetchTodayChallenge();
    if (!challenge) { btn.style.display = 'none'; return; }

    _updateBtn(btn, challenge);
    btn.addEventListener('click', () => _openModal(challenge));
}

function _getCachedForToday() {
    try {
        const cached = JSON.parse(localStorage.getItem(KEYS.CACHE) || 'null');
        if (cached?.date === todayStr() && cached?.challenge) return cached.challenge;
        return null;
    } catch { return null; }
}

function _setBtnOffline(btn) {
    btn.style.opacity = '0.5';
    btn.style.cursor = 'default';
    btn.addEventListener('click', () => {
        _showOfflineMessage();
    });
    const label = btn.querySelector('.challenge-btn-label');
    if (label) label.textContent = 'Défi du jour';
}

function _showOfflineMessage() {
    // Petit toast informatif, pas d'erreur
    const toast = document.createElement('div');
    Object.assign(toast.style, {
        position: 'fixed', bottom: '80px', right: '20px', zIndex: '9999',
        background: 'rgba(30,30,50,0.97)',
        color: '#fff', borderRadius: '16px', padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,.4)',
        transform: 'translateX(120%)',
        transition: 'transform .4s cubic-bezier(.16,1,.3,1)',
        maxWidth: '300px', fontFamily: 'inherit',
        border: '1px solid rgba(255,255,255,.1)',
    });
    toast.innerHTML = `
    <div style="font-size:1.5rem;flex-shrink:0">📡</div>
    <div>
      <div style="font-size:.85rem;font-weight:700;margin-bottom:2px" data-i18n="menu.daily_challenge.offline_title">Connexion requise</div>
      <div style="font-size:.75rem;opacity:.7" data-i18n="menu.daily_challenge.offLine_message">Le défi du jour nécessite une connexion internet.</div>
    </div>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; }));
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

// ─── BOUTON STATE ─────────────────────────────────────────────────────────────
function _updateBtn(btn, challenge) {
    const done = isTodayDone();
    const skipped = isTodaySkipped();
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.classList.toggle('challenge-done', done);
    btn.classList.toggle('challenge-skipped', skipped && !done);
    const label = btn.querySelector('.challenge-btn-label');
    if (label) label.textContent = done ? 'Défi ✓' : 'Défi du jour';
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function _openModal(challenge) {
    document.getElementById('challengeModal')?.remove();
    const done = isTodayDone();

    const overlay = document.createElement('div');
    overlay.id = 'challengeModal';
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '2000',
        background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        animation: 'modal-fadein .25s ease',
    });

    const title = pickLocalizedField(challenge, "title");
    const description = pickLocalizedField(challenge, "description");
    overlay.innerHTML = `
    <div style="background:linear-gradient(160deg,rgba(20,20,40,.98),rgba(8,8,20,.99));
  border:1px solid rgba(255,255,255,.10);
  border-radius:26px;
  padding:30px 26px 26px;
  max-width:360px;width:100%;
  box-shadow:0 30px 80px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.04);
  position:relative;
  animation:modal-slidein .3s cubic-bezier(.16,1,.3,1);">

  <!-- Close -->
  <button id="challengeModalClose" style="position:absolute;top:16px;right:16px;
    background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.12);
    color:rgba(255,255,255,.5);
    border-radius:50%;
    width:32px;height:32px;
    cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    transition:all .15s;">
    <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">
      <line x1="5" y1="5" x2="19" y2="19"></line>
      <line x1="19" y1="5" x2="5" y2="19"></line>
    </svg>
  </button>

  <!-- Title -->
  <div style="text-align:center;margin-bottom:22px">
    <div style="font-size:.7rem;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:8px">
      ${t('menu.daily_challenge.modal_title')}
    </div>
    <div style="font-size:1.3rem;font-weight:800;color:#fff;line-height:1.25">
      ${title}
    </div>
  </div>

  <!-- Game -->
  <div style="background:rgba(255,255,255,.04);
    border:1px solid rgba(255,255,255,.08);
    border-radius:14px;
    padding:14px;
    margin-bottom:18px;
    display:flex;align-items:center;gap:12px;">

    <!-- NEW ICON (minimal / clean / not controller) -->
    <svg width="18" height="18" viewBox="0 0 24 24"
      stroke="rgba(255,255,255,.75)" stroke-width="2"
      fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M10 8l6 4-6 4z"></path>
    </svg>

    <div>
      <div style="font-size:.65rem;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.6px">
        ${t('menu.daily_challenge.modal_game')}
      </div>
      <div style="font-size:.95rem;font-weight:700;color:#fff">
        ${challenge.gameName}
      </div>
    </div>
  </div>

  <!-- Description -->
  <div style="background:rgba(255,255,255,.035);
    border:1px solid rgba(255,255,255,.06);
    border-left:3px solid rgba(255,255,255,.18);
    border-radius:10px;
    padding:13px 14px;
    margin-bottom:22px;
    font-size:.9rem;
    color:rgba(255,255,255,.75);
    line-height:1.55;">
    ${description}
  </div>

  ${challenge.reward?.xp ? `
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;
    font-size:.82rem;
    color:rgba(255,210,80,.9);">

    <!-- reward icon -->
    <svg width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="12 2 15 9 22 9 16.5 13.5 18.5 21 12 16.8 5.5 21 7.5 13.5 2 9 9 9"></polygon>
    </svg>

    ${t('menu.daily_challenge.modal_reward').replace('{xp}', challenge.reward.xp)}
  </div>` : ''}

  ${done
            ? `<div style="display:flex;align-items:center;justify-content:center;gap:10px;
      padding:14px;
      background:rgba(67,233,123,.08);
      border:1px solid rgba(67,233,123,.25);
      border-radius:14px;
      color:#43e97b;
      font-weight:700;
      font-size:.95rem">

      <svg width="18" height="18" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6L9 17l-5-5"></path>
      </svg>

      ${t('menu.daily_challenge.success')}
    </div>`
            : `<div style="display:flex;flex-direction:column;gap:12px">

      <button id="challengePlayBtn"
        style="display:flex;align-items:center;justify-content:center;gap:10px;
        background:linear-gradient(135deg,#6a7cff,#7c4dff);
        box-shadow:0 10px 30px rgba(100,120,255,.35);
        color:#fff;
        border:none;
        border-radius:16px;
        padding:15px;
        font-size:1rem;
        font-weight:800;
        cursor:pointer;
        letter-spacing:.3px;
        transition:all .15s;">

        <!-- play icon -->
        <svg width="18" height="18" viewBox="0 0 24 24"
          fill="currentColor">
          <path d="M8 5v14l11-7z"></path>
        </svg>

        ${t('menu.daily_challenge.modal_button')}
      </button>

      <button id="challengeSkipBtn"
        style="background:rgba(255,255,255,.05);
        color:rgba(255,255,255,.45);
        border:1px solid rgba(255,255,255,.08);
        border-radius:14px;
        padding:11px;
        font-size:.82rem;
        cursor:pointer;
        transition:opacity .15s;">
        ${t('menu.daily_challenge.modal_not_ready')}
      </button>
    </div>`
        }

    </div>`;

    document.body.appendChild(overlay);

    // Fermeture
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.getElementById('challengeModalClose')?.addEventListener('click', close);

    // Jouer → stocker le défi actif et rediriger
    document.getElementById('challengePlayBtn')?.addEventListener('click', () => {
        localStorage.setItem(KEYS.ACTIVE, JSON.stringify({
            date: todayStr(),
            gameId: challenge.gameId,
            condition: challenge.condition,
        }));
        close();
        window.location.href = challenge.gamePath;
    });

    // Ignorer
    document.getElementById('challengeSkipBtn')?.addEventListener('click', () => {
        markTodaySkipped();
        close();
        const btn = document.getElementById('dailyChallengeBtn');
        if (btn) _updateBtn(btn, challenge);
    });
}

function pickLocalizedField(challenge, fieldBase) {
    const langRaw = window?.I18N?.lang || localStorage.getItem("lang") || "en";
    const lang = String(langRaw).toLowerCase();

    const direct = challenge[`${fieldBase}_${lang}`];
    if (direct) return direct;

    const keys = Object.keys(challenge).filter(k => k.startsWith(`${fieldBase}_`));
    if (keys.length > 0) return challenge[keys[0]];

    return challenge[fieldBase] ?? '';
}
