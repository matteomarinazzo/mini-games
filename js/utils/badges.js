/**
 * badges.js — Gestionnaire de badges Mini Games
 * Chemin : js/utils/badges.js
 *
 * Usage dans un jeu :
 *   import { reportGameScore, reportGamePlayed } from '../utils/badges.js';
 *   reportGameScore('snow-digger', 750);   // après chaque partie
 *   reportGamePlayed('snow-digger');        // au lancement
 *
 * Usage dans main.js (déjà intégré) :
 *   import { reportGamePlayed, checkAndUnlockBadges } from './utils/badges.js';
 */

// ─── CLÉS LOCALSTORAGE ────────────────────────────────────────────────────────
const KEYS = {
    UNLOCKED: 'mg_badges_unlocked',       // string[] — IDs des badges débloqués
    GAMES_PLAYED: 'mg_stat_games_played', // number  — total sessions lancées
    UNIQUE_GAMES: 'mg_stat_unique_games', // string[] — IDs des jeux uniques joués
    PLAY_TIME: 'mg_stat_play_time_min',   // number  — minutes jouées au total
    LIKED_GAMES: 'likedGames',            // string[] — déjà géré par main.js
    RANDOM_USED: 'mg_stat_random_used',   // number  — nb d'utilisations du jeu aléatoire
    GAME_SCORES: 'mg_stat_game_scores',   // object  — { gameId: bestScore }
    LAST_SESSION: 'mg_stat_last_session', // ISO string — dernière session
    NIGHT_OWL_DONE: 'mg_stat_night_owl',  // boolean — condition nuit déjà remplie
};

// Cache mémoire des définitions JSON
let _badgeDefs = null;

// ─── CHARGEMENT DES DÉFINITIONS ───────────────────────────────────────────────
/**
 * Charge badges.json une seule fois et met en cache.
 * @returns {Promise<Array>}
 */
export async function loadBadgeDefs() {
    if (_badgeDefs) return _badgeDefs;
    try {
        const res = await fetch('./assets/data/badges.json');
        _badgeDefs = await res.json();
    } catch (e) {
        console.warn('[badges] Impossible de charger badges.json', e);
        _badgeDefs = [];
    }
    return _badgeDefs;
}

// ─── HELPERS LOCALSTORAGE ─────────────────────────────────────────────────────
function getUnlocked() {
    try { return JSON.parse(localStorage.getItem(KEYS.UNLOCKED) || '[]'); }
    catch { return []; }
}

function saveUnlocked(list) {
    localStorage.setItem(KEYS.UNLOCKED, JSON.stringify(list));
}

function getInt(key, def = 0) {
    return parseInt(localStorage.getItem(key) || def, 10);
}

function getArr(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
}

function getObj(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); }
    catch { return {}; }
}

// ─── STATS PUBLIQUES ──────────────────────────────────────────────────────────
/**
 * Retourne toutes les stats globales du joueur.
 * @returns {object}
 */
export function getPlayerStats() {
    return {
        gamesPlayed: getInt(KEYS.GAMES_PLAYED),
        uniqueGames: getArr(KEYS.UNIQUE_GAMES),
        playTimeMinutes: getInt(KEYS.PLAY_TIME),
        likedGames: getArr(KEYS.LIKED_GAMES),
        randomUsed: getInt(KEYS.RANDOM_USED),
        gameScores: getObj(KEYS.GAME_SCORES),
        lastSession: localStorage.getItem(KEYS.LAST_SESSION) || null,
        unlockedBadges: getUnlocked(),
    };
}

/**
 * À appeler à chaque lancement d'un jeu.
 * @param {string} gameId
 */
export async function reportGamePlayed(gameId) {
    // Incrémenter sessions totales
    const total = getInt(KEYS.GAMES_PLAYED) + 1;
    localStorage.setItem(KEYS.GAMES_PLAYED, total);

    // Ajouter aux jeux uniques
    const unique = getArr(KEYS.UNIQUE_GAMES);
    if (!unique.includes(gameId)) {
        unique.push(gameId);
        localStorage.setItem(KEYS.UNIQUE_GAMES, JSON.stringify(unique));
    }

    // Mettre à jour la date de dernière session
    localStorage.setItem(KEYS.LAST_SESSION, new Date().toISOString());

    // Vérifier badge nuit
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) {
        localStorage.setItem(KEYS.NIGHT_OWL_DONE, 'true');
    }

    // Vérifier et débloquer
    return await checkAndUnlockBadges();
}

/**
 * À appeler quand le joueur utilise le bouton jeu aléatoire.
 */
export async function reportRandomUsed() {
    const count = getInt(KEYS.RANDOM_USED) + 1;
    localStorage.setItem(KEYS.RANDOM_USED, count);
    return await checkAndUnlockBadges();
}

/**
 * À appeler depuis un jeu quand un score est réalisé.
 * @param {string} gameId
 * @param {number} score
 */
export async function reportGameScore(gameId, score) {
    const scores = getObj(KEYS.GAME_SCORES);
    if (!scores[gameId] || score > scores[gameId]) {
        scores[gameId] = score;
        localStorage.setItem(KEYS.GAME_SCORES, JSON.stringify(scores));
    }
    return await checkAndUnlockBadges();
}

/**
 * À appeler régulièrement depuis countPlayedTime.js pour mettre à jour le temps.
 * @param {number} totalMinutes — temps total en minutes (lu depuis localStorage)
 */
export async function reportPlayTime(totalMinutes) {
    localStorage.setItem(KEYS.PLAY_TIME, Math.floor(totalMinutes));
    return await checkAndUnlockBadges();
}

// ─── MOTEUR DE VÉRIFICATION ───────────────────────────────────────────────────
/**
 * Vérifie tous les badges et débloque ceux dont les conditions sont remplies.
 * @param {number} [totalGamesCount] — total jeux dans la plateforme (pour "all_games")
 * @returns {Promise<Array>} — badges nouvellement débloqués
 */
export async function checkAndUnlockBadges(totalGamesCount = null) {
    const defs = await loadBadgeDefs();
    const unlocked = getUnlocked();
    const stats = getPlayerStats();
    const newlyUnlocked = [];

    for (const badge of defs) {
        if (unlocked.includes(badge.id)) continue; // Déjà débloqué

        const { condition } = badge;
        let earned = false;

        switch (condition.type) {
            case 'games_played':
                earned = stats.gamesPlayed >= condition.value;
                break;

            case 'unique_games':
                earned = stats.uniqueGames.length >= condition.value;
                break;

            case 'unique_games_all':
                if (totalGamesCount && totalGamesCount > 0) {
                    earned = stats.uniqueGames.length >= totalGamesCount;
                }
                break;

            case 'play_time_minutes':
                earned = stats.playTimeMinutes >= condition.value;
                break;

            case 'liked_games':
                earned = stats.likedGames.length >= condition.value;
                break;

            case 'random_used':
                earned = stats.randomUsed >= condition.value;
                break;

            case 'game_score':
                earned = (stats.gameScores[condition.gameId] || 0) >= condition.value;
                break;

            case 'time_of_day':
                earned = localStorage.getItem(KEYS.NIGHT_OWL_DONE) === 'true';
                break;

            case 'streak_days': {
                const s = JSON.parse(localStorage.getItem('mg_streak_data') || '{}');
                earned = (s.count || 0) >= condition.value;
                break;
            }

            case 'games_rated': {
                const rated = Object.keys(JSON.parse(localStorage.getItem('userRatings') || '{}')).length;
                earned = rated >= condition.value;
                break;
            }

            case 'has_purchase': {
                const purchases = JSON.parse(localStorage.getItem('mg_purchases') || '[]');
                earned = Array.isArray(purchases) && purchases.length > 0;
                break;
            }

            case 'date_special': {
                const now = new Date();
                earned = now.getMonth() + 1 === condition.month && now.getDate() === condition.day;
                break;
            }

            default:
                break;
        }

        if (earned) {
            unlocked.push(badge.id);
            newlyUnlocked.push(badge);
        }
    }

    if (newlyUnlocked.length > 0) {
        saveUnlocked(unlocked);

        // Stocker pour affichage après éventuel redirect (si on quitte la page trop vite)
        sessionStorage.setItem('mg_pending_badges', JSON.stringify(newlyUnlocked));

        // Afficher immédiatement
        newlyUnlocked.forEach((badge, idx) => {
            setTimeout(() => showBadgeNotification(badge), idx * 800);
        });

        try {
            const { refreshBadgeNotif } = await import('../profilePanel.js');
            refreshBadgeNotif();
        } catch { }
    }

    return newlyUnlocked;
}

// ─── NOTIFICATION BADGE DÉBLOQUÉ ─────────────────────────────────────────────
/**
 * Affiche une notification toast quand un badge est débloqué.
 * @param {object} badge
 */
function showBadgeNotification(badge) {
    // Récupérer la langue actuelle
    const lang = localStorage.getItem('lang') || 'FR';

    const name = lang === 'EN' ? (badge.nameEN || badge.name)
        : lang === 'DE' ? (badge.nameDE || badge.name)
            : badge.name;

    const desc = lang === 'EN' ? (badge.descriptionEN || badge.description)
        : lang === 'DE' ? (badge.descriptionDE || badge.description)
            : badge.description;

    // Créer le toast
    const toast = document.createElement('div');
    toast.className = `badge-toast badge-toast-${badge.rarity}`;
    const toastTitle = lang === 'EN' ? 'Badge unlocked!' : lang === 'DE' ? 'Abzeichen freigeschaltet!' : 'Badge débloqué !';
    toast.innerHTML = `
    <div class="badge-toast-icon">${badge.icon}</div>
    <div class="badge-toast-content">
      <div class="badge-toast-title">🏅 ${toastTitle}</div>
      <div class="badge-toast-name">${name}</div>
      <div class="badge-toast-desc">${desc}</div>
    </div>
  `;

    // Styles inline en cas de chargement partiel du CSS
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '80px',
        right: '20px',
        zIndex: '9999',
        background: getRarityGradient(badge.rarity),
        color: '#fff',
        borderRadius: '16px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        transform: 'translateX(120%)',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        maxWidth: '300px',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.2)',
    });

    document.body.appendChild(toast);

    // Animation entrée
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });
    });

    // Auto-retrait après 4s
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

/**
 * Vérifie s'il y a des badges en attente (ex: après un rechargement ou changement de page)
 * et les affiche sous forme de toasts.
 */
export function checkPendingBadges() {
    const raw = sessionStorage.getItem('mg_pending_badges');
    if (!raw) return;

    try {
        const pending = JSON.parse(raw);
        if (Array.isArray(pending) && pending.length > 0) {
            pending.forEach((badge, idx) => {
                setTimeout(() => showBadgeNotification(badge), idx * 800);
            });
        }
    } catch (e) {
        console.error("[badges] Erreur checkPendingBadges", e);
    } finally {
        sessionStorage.removeItem('mg_pending_badges');
    }
}

function getRarityGradient(rarity) {
    const gradients = {
        common: 'linear-gradient(135deg, rgba(80,80,120,0.95), rgba(60,60,100,0.95))',
        rare: 'linear-gradient(135deg, rgba(30,80,180,0.95), rgba(20,60,140,0.95))',
        epic: 'linear-gradient(135deg, rgba(120,30,180,0.95), rgba(90,20,140,0.95))',
        legendary: 'linear-gradient(135deg, rgba(200,140,0,0.95), rgba(160,100,0,0.95))',
    };
    return gradients[rarity] || gradients.common;
}

// ─── UTILITAIRES D'AFFICHAGE ──────────────────────────────────────────────────
/**
 * Formate le temps en minutes en chaîne lisible.
 * @param {number} minutes
 * @returns {string}
 */
export function formatPlayTime(minutes) {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/**
 * Retourne l'emoji de rareté pour un badge.
 * @param {string} rarity
 * @returns {string}
 */
export function getRarityEmoji(rarity) {
    return { common: '⚪', rare: '🔵', epic: '🟣', legendary: '🟡' }[rarity] || '⚪';
}
