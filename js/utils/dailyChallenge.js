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
 * Règle : le défi est validé dès qu'une partie du bon jeu remplit la condition,
 * même si le joueur n'est jamais passé par le bouton « Jouer » de la modal.
 *
 * Usage depuis un jeu (fin de partie) :
 *   import { checkDailyChallenge } from '../utils/dailyChallenge.js';
 *   await checkDailyChallenge({ score: 3200, gameId: 'layer-pile' });
 */

import { checkRealConnection } from '../network.js';
import { addXP } from './xpSystem.js';
import { reportGamePlayed } from './badges.js';
import { updateStreak } from '../profilePanel.js';

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

// ─── HELPERS GÉNÉRIQUES ───────────────────────────────────────────────────────
function _withTimeout(promise, ms, label = 'timeout') {
    let id;
    const timeout = new Promise((_, reject) => {
        id = setTimeout(() => reject(new Error(label)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(id));
}

function _tr(key, fallback) {
    try {
        const v = window.t ? window.t(key) : key;
        return (!v || v === key) ? fallback : v;
    } catch { return fallback; }
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
    if (!isOnline) { console.warn('[dailyChallenge] checkRealConnection = false (ping raté ou timeout 3 s)'); return null; }

    // 4. Import dynamique Firebase (seulement si en ligne)
    // Utilise les factories de firebaseWrk.js (getRef, getGet) — même pattern que le reste du projet
    try {
        const fb = await _withTimeout(
            import('../config/firebase-config.js'), 8000, 'firebase import timeout'
        );
        // IMPORTANT : attendre firebaseReady AVANT de lire `database`.
        // Destructurer l'export avant l'init capturait la valeur null (binding live perdu).
        await _withTimeout(Promise.resolve(fb.firebaseReady), 8000, 'firebase ready timeout');

        const database = fb.database;
        const ref = fb.getRef?.();
        const get = fb.getGet?.();
        if (!database || !ref || !get) {
            console.warn('[dailyChallenge] Firebase non initialisé', { database: !!database, ref: !!ref, get: !!get });
            return null;
        }

        // Lire la config (startDate + total)
        const configSnap = await get(ref(database, 'app_config/challenges'));
        if (!configSnap.exists()) { console.warn('[dailyChallenge] app_config/challenges introuvable'); return null; }

        const { startDate, total } = configSnap.val();
        if (!startDate || !total) return null;
        const rawIndex = daysBetween(startDate, today);
        const index = ((rawIndex % total) + total) % total; // toujours positif

        // Lire le défi à cet index
        const challengeSnap = await get(ref(database, `challenge_templates/${index}`));
        if (!challengeSnap.exists()) { console.warn('[dailyChallenge] challenge_templates/' + index + ' introuvable'); return null; }

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
            if (condition.config?.mode) {
                const isDuo = gameStats.mode === 'duo' || gameStats.mode === 'confrontation';
                if (condition.config.mode === 'duo' && !isDuo) return false;
                if (condition.config.mode !== 'duo' && gameStats.mode !== condition.config.mode) return false;
            }
            return (gameStats.wins || gameStats.wonDuo || 0) >= condition.value;
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

    // Pas besoin d'être passé par le bouton « Jouer » de la modal :
    // toute partie du bon jeu qui remplit la condition valide le défi.
    // Récupérer le défi (cache du jour en priorité, sinon fetch si en ligne)
    const challenge = await fetchTodayChallenge();
    if (!challenge || challenge.gameId !== gameStats.gameId) return false;

    if (!evaluateCondition(challenge.condition, gameStats)) return false;

    // Réussi !
    _markTodayDone();

    if (challenge.reward?.xp) {
        addXP(challenge.reward.xp);
    }

    localStorage.removeItem(KEYS.ACTIVE); // nettoyage de l'ancienne clé
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
let _btnBound = false;
let _currentChallenge = null;

async function _onBtnClick() {
    const btn = document.getElementById('dailyChallengeBtn');
    if (_currentChallenge) { _openModal(_currentChallenge); return; }

    // Pas encore de défi chargé (offline au démarrage, fetch raté…) : on retente
    const challenge = await fetchTodayChallenge();
    if (challenge) {
        _currentChallenge = challenge;
        if (btn) _updateBtn(btn, challenge);
        _openModal(challenge);
    } else {
        _showOfflineMessage();
    }
}

/**
 * Le bouton n'est JAMAIS masqué : s'il n'y a pas de défi disponible
 * (offline, Firebase lent ou en erreur), il passe en état « indisponible »
 * et se recharge tout seul au retour de la connexion ou au prochain clic.
 */
export async function initDailyChallenge() {
    _ensureFirstDay();
    updateChallengeStat();

    const btn = document.getElementById('dailyChallengeBtn');
    if (!btn) return;

    // Au cas où un ancien code / une ancienne session l'aurait masqué
    btn.style.display = '';

    if (!_btnBound) {
        _btnBound = true;
        btn.addEventListener('click', _onBtnClick);
        window.addEventListener('online', () => {
            if (!_currentChallenge) initDailyChallenge();
        });
    }

    // 1. Cache d'abord : affichage immédiat, sans attendre le réseau
    const cached = _cachedChallenge || _getCachedForToday();
    if (cached) {
        _cachedChallenge = cached;
        _currentChallenge = cached;
        _updateBtn(btn, cached);
        return;
    }

    // 2. Sinon fetch (gère lui-même offline / timeouts / erreurs)
    const challenge = await fetchTodayChallenge();
    if (challenge) {
        _currentChallenge = challenge;
        _updateBtn(btn, challenge);
    } else {
        _setBtnOffline(btn);
        _scheduleRetry(btn);
    }
}

// Retente le chargement du défi en arrière-plan (3 s, 8 s, 20 s)
let _retryCount = 0;
function _scheduleRetry(btn) {
    const delays = [3000, 8000, 20000];
    if (_currentChallenge || _retryCount >= delays.length) return;
    const delay = delays[_retryCount++];
    setTimeout(async () => {
        if (_currentChallenge) return;
        const challenge = await fetchTodayChallenge();
        if (challenge) {
            _currentChallenge = challenge;
            _updateBtn(btn, challenge);
        } else {
            _scheduleRetry(btn);
        }
    }, delay);
}

function _getCachedForToday() {
    try {
        const cached = JSON.parse(localStorage.getItem(KEYS.CACHE) || 'null');
        if (cached?.date === todayStr() && cached?.challenge) return cached.challenge;
        return null;
    } catch { return null; }
}

function _setBtnOffline(btn) {
    // Marqueur sémantique uniquement (aucun style visuel de désactivation)
    btn.classList.add('challenge-offline');
    btn.classList.remove('challenge-done', 'challenge-skipped');
}

function _showOfflineMessage() {
    document.getElementById('dcOfflineToast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'dcOfflineToast';
    toast.className = 'dc-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
    <div class="dc-toast-icon">📡</div>
    <div>
      <div class="dc-toast-title">${_tr('menu.daily_challenge.offline_title', 'Connexion requise')}</div>
      <div class="dc-toast-text">${_tr('menu.daily_challenge.offline_message', 'Le défi du jour nécessite une connexion internet.')}</div>
    </div>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

// ─── BOUTON STATE ─────────────────────────────────────────────────────────────
function _updateBtn(btn, challenge) {
    const done = isTodayDone();
    const skipped = isTodaySkipped();
    btn.style.display = '';
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.classList.remove('challenge-offline');
    btn.classList.toggle('challenge-done', done);
    btn.classList.toggle('challenge-skipped', skipped && !done);
    // Le label reste celui du HTML (data-i18n) : le ✓ est ajouté en CSS
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function _openModal(challenge) {
    document.getElementById('challengeModal')?.remove();
    const done = isTodayDone();

    const overlay = document.createElement('div');
    overlay.id = 'challengeModal';
    overlay.className = 'dc-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const title = pickLocalizedField(challenge, "title");
    const description = pickLocalizedField(challenge, "description");
    const xp = challenge.reward?.xp;

    overlay.innerHTML = `
    <div class="dc-dialog">
      <button id="challengeModalClose" class="dc-close" type="button" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round">
          <line x1="5" y1="5" x2="19" y2="19"></line>
          <line x1="19" y1="5" x2="5" y2="19"></line>
        </svg>
      </button>

      <div class="dc-header">
        <div class="dc-trophy" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
          </svg>
        </div>
        <div class="dc-pill">${t('menu.daily_challenge.modal_title')}</div>
        <h2 class="dc-title">${title}</h2>
      </div>

      <div class="dc-game">
        <div class="dc-game-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
            fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M10 8l6 4-6 4z"></path>
          </svg>
        </div>
        <div class="dc-game-info">
          <div class="dc-game-label">${t('menu.daily_challenge.modal_game')}</div>
          <div class="dc-game-name">${challenge.gameName}</div>
        </div>
      </div>

      <div class="dc-desc">${description}</div>

      ${xp ? `
      <div class="dc-reward">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"
          stroke-width="1.5" stroke-linejoin="round">
          <polygon points="12 2 15 9 22 9 16.5 13.5 18.5 21 12 16.8 5.5 21 7.5 13.5 2 9 9 9"></polygon>
        </svg>
        <span>${t('menu.daily_challenge.modal_reward').replace('{xp}', xp)}</span>
      </div>` : ''}

      ${done ? `
      <div class="dc-success">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
        <span>${t('menu.daily_challenge.success')}</span>
      </div>` : `
      <div class="dc-actions">
        <button id="challengePlayBtn" class="dc-btn-play" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>
          <span>${t('menu.daily_challenge.modal_button')}</span>
        </button>
        <button id="challengeSkipBtn" class="dc-btn-skip" type="button">
          ${t('menu.daily_challenge.modal_not_ready')}
        </button>
      </div>`}
    </div>`;

    document.body.appendChild(overlay);

    // Fermeture (croix, clic sur le fond, Échap)
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.getElementById('challengeModalClose')?.addEventListener('click', close);

    // Jouer → compte comme un lancement de jeu (streak / stats / badges), puis redirection.
    // Le défi n'a plus besoin d'être « activé » : il se valide à la fin d'une partie du bon jeu.
    document.getElementById('challengePlayBtn')?.addEventListener('click', async (e) => {
        const playBtn = e.currentTarget;
        if (playBtn.disabled) return;
        playBtn.disabled = true;

        try {
            // Les compteurs sont écrits tout de suite ; on laisse juste un court délai
            // pour que les badges éventuels soient enregistrés avant de quitter la page.
            await Promise.race([
                reportGamePlayed(challenge.gameId),
                new Promise(r => setTimeout(r, 600)),
            ]);
        } catch (err) {
            console.warn('[dailyChallenge] reportGamePlayed a échoué :', err);
        }

        close();
        updateStreak();
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