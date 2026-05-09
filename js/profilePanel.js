/**
 * profilePanel.js — Contrôleur du panneau profil
 * Chemin : js/profilePanel.js
 *
 * Gère :
 *  - Ouverture/fermeture du panneau
 *  - Affichage des stats, badges, paramètres
 *  - Changement de thème (CSS variables)
 *  - Changement du mode d'affichage (grille / liste)
 */

import {
  loadBadgeDefs,
  getPlayerStats,
  formatPlayTime,
  checkAndUnlockBadges,
} from './utils/badges.js';

import { updateBMCTheme } from './BuyMeACoffee.js';
import { getCloudUID, importUID, pushNow } from './firebaseWrk.js';
import { checkRealConnection } from './network.js';
import { getSecret } from './utils/secretManager.js';

const t = (path) => window.t ? window.t(path) : path;

const THEME_STORAGE_KEY = 'mg_theme';
const PURCHASE_STORAGE_KEY = 'mg_purchases';
const DEFAULT_THEME = 'default';
const PREMIUM_PACK_KEY = 'premium_pack';
const DEFAULT_PREMIUM_PAYMENT_URL = 'https://buymeacoffee.com/minigames/e/536732';

// Theme order follows the estimated perceived value:
// starter badge themes first, prestige unlocks next, premium themes last.
const THEMES = {
  default: {
    labelKey: 'profile.theme_default',
    sortOrder: 0,
    '--primary': '#667eea',
    '--secondary': '#764ba2',
    '--accent': '#f093fb',
    '--bg-from': '#1a1a2e',
    '--bg-to': '#16213e',
    '--blob1': '#667eea',
    '--blob2': '#764ba2',
    '--blob3': '#f093fb',
    '--card-bg': 'rgba(255,255,255,0.05)',
    '--card-border': 'rgba(255,255,255,0.1)',
    '--meta-color': '#6c6ed4',
  },
  forest: {
    labelKey: 'profile.theme_forest',
    sortOrder: 10,
    locked: true,
    unlockType: 'badges',
    unlockValue: 5,
    unlockLabel: '5 badges débloqués',
    '--primary': '#43e97b',
    '--secondary': '#38f9d7',
    '--accent': '#4facfe',
    '--bg-from': '#0a1a0e',
    '--bg-to': '#0a2414',
    '--blob1': '#43e97b',
    '--blob2': '#38f9d7',
    '--blob3': '#1a9e4e',
    '--card-bg': 'rgba(67,233,123,0.08)',
    '--card-border': 'rgba(67,233,123,0.2)',
    '--meta-color': '#4dce91',
  },
  ocean: {
    labelKey: 'profile.theme_ocean',
    sortOrder: 20,
    locked: true,
    unlockType: 'badges',
    unlockValue: 10,
    unlockLabel: '10 badges débloqués',
    '--primary': '#4facfe',
    '--secondary': '#00f2fe',
    '--accent': '#43e97b',
    '--bg-from': '#0a1628',
    '--bg-to': '#0a2040',
    '--blob1': '#4facfe',
    '--blob2': '#00f2fe',
    '--blob3': '#0652DD',
    '--card-bg': 'rgba(79,172,254,0.08)',
    '--card-border': 'rgba(79,172,254,0.2)',
    '--meta-color': '#549fea',
  },
  sunset: {
    labelKey: 'profile.theme_sunset',
    sortOrder: 30,
    locked: true,
    unlockType: 'badges',
    unlockValue: 15,
    unlockLabel: '15 badges débloqués',
    '--primary': '#f5576c',
    '--secondary': '#f093fb',
    '--accent': '#fda085',
    '--bg-from': '#1a0a0e',
    '--bg-to': '#2d0a1a',
    '--blob1': '#f5576c',
    '--blob2': '#f093fb',
    '--blob3': '#fda085',
    '--card-bg': 'rgba(245,87,108,0.08)',
    '--card-border': 'rgba(245,87,108,0.2)',
    '--meta-color': '#cf5f90',
  },
  dark: {
    labelKey: 'profile.theme_dark',
    sortOrder: 40,
    locked: true,
    unlockType: 'badges',
    unlockValue: 20,
    unlockLabel: '20 badges débloqués',
    '--primary': '#8a8a9a',
    '--secondary': '#4a4a5a',
    '--accent': '#bbb',
    '--bg-from': '#0a0a0a',
    '--bg-to': '#111111',
    '--blob1': '#2a2a3a',
    '--blob2': '#1a1a2a',
    '--blob3': '#3a3a4a',
    '--card-bg': 'rgba(255,255,255,0.03)',
    '--card-border': 'rgba(255,255,255,0.07)',
    '--meta-color': '#7e7697',
  },
  fire: {
    labelKey: 'profile.theme_fire',
    sortOrder: 50,
    locked: true,
    unlockType: 'badges',
    unlockValue: 25,
    unlockLabel: '25 badges débloqués',
    '--primary': '#ffd200',
    '--secondary': '#f7971e',
    '--accent': '#ff416c',
    '--bg-from': '#1a0e00',
    '--bg-to': '#2d1500',
    '--blob1': '#f7971e',
    '--blob2': '#ffd200',
    '--blob3': '#ff416c',
    '--card-bg': 'rgba(247,151,30,0.08)',
    '--card-border': 'rgba(247,151,30,0.2)',
    '--meta-color': '#dcac30',
  },
  midnight: {
    labelKey: 'profile.theme_midnight',
    sortOrder: 60,
    locked: true,
    unlockType: 'badges',
    unlockValue: 50,
    unlockLabel: '50 badges débloqués',
    '--primary': '#232526',
    '--secondary': '#414345',
    '--accent': '#00d2ff',
    '--bg-from': '#000000',
    '--bg-to': '#0c0c0c',
    '--blob1': '#2c3e50',
    '--blob2': '#000000',
    '--blob3': '#34495e',
    '--card-bg': 'rgba(255,255,255,0.02)',
    '--card-border': 'rgba(255,255,255,0.05)',
    '--meta-color': '#353338',
  },
  lavender: {
    labelKey: 'profile.theme_lavender',
    sortOrder: 55,
    locked: true,
    unlockType: 'badges',
    unlockValue: 25,
    unlockLabel: '25 badges débloqués',
    '--primary': '#a18cd1',
    '--secondary': '#fbc2eb',
    '--accent': '#e0c3fc',
    '--bg-from': '#0f0c1d',
    '--bg-to': '#1b1429',
    '--blob1': '#a18cd1',
    '--blob2': '#fbc2eb',
    '--blob3': '#8e44ad',
    '--card-bg': 'rgba(161,140,209,0.1)',
    '--card-border': 'rgba(161,140,209,0.2)',
    '--meta-color': '#b898d4',
  },
  cyberpunk: {
    labelKey: 'profile.theme_cyberpunk',
    sortOrder: 90,
    locked: true,
    unlockType: 'badges',
    unlockValue: 50,
    unlockLabel: '50 badges débloqués',
    '--primary': '#ff00ff',
    '--secondary': '#00ffff',
    '--accent': '#ffff00',
    '--bg-from': '#050505',
    '--bg-to': '#100010',
    '--blob1': '#ff00ff',
    '--blob2': '#00ffff',
    '--blob3': '#ff0055',
    '--card-bg': 'rgba(255,0,255,0.06)',
    '--card-border': 'rgba(255,0,255,0.2)',
    '--meta-color': '#9855f6',
  },
};

const THEME_UI_TEXT = {
  FR: {
    collection_title: 'Collection de thèmes',
    collection_subtitle: 'Débloque chaque thème avec les badges ou prends le Pack Premium pour tout ouvrir d\'un coup.',
    collection_progress: '{count}/{total} thèmes débloqués',
    collection_badges: '{count} badges gagnés',
    collection_remaining: '{count} encore verrouillés',
    starter_theme: 'Disponible',
    badge_track: 'Badges',
    unlock_badges_short: '{count} badges',
    always_available: 'Toujours disponible',
    unlocked_ready: 'Prêt à être activé',
    premium_owned: 'Pack Premium actif',
    premium_code_needed: 'Pack Premium ou badges',
    badges_progress: '{current}/{required} badges',
    badges_requirement_long: 'Débloque {count} badges pour obtenir ce thème.',
    theme_active: 'Actif',
    theme_unlocked: 'Débloqué',
    theme_locked: 'Verrouillé',
    premium_help_title: 'Pack Premium',
    premium_help_subtitle: 'Un seul achat à 1 CHF pour rendre tous les thèmes disponibles instantanément.',
    premium_shop_title: 'Tout débloquer maintenant',
    premium_shop_subtitle: 'Tu peux aussi continuer à jouer et récupérer chaque thème avec tes badges.',
    premium_empty: 'Pack Premium actif. Tous les thèmes sont disponibles.',
    purchase_sync_note: 'Retour automatique après paiement',
    buy_action: 'Tout débloquer',
    buy_hint: 'Tous les thèmes restent aussi débloquables via badges.',
    premium_opened: 'Le paiement s\'ouvre dans un nouvel onglet. Reviens ensuite ici.',
    premium_popup_blocked: 'Le navigateur a bloqué l\'ouverture. Autorise les popups puis réessaie.',
    offline_buy: 'Connexion requise pour ouvrir le paiement.',
    unlock_success: '🎨 Pack Premium débloqué ! Tous les thèmes sont disponibles.',
    locked_badges_title: 'Deux options pour ce thème',
    locked_badges_copy: 'Paye 1 CHF pour tout débloquer tout de suite, ou continue à jouer pour atteindre le nombre de badges demandé.',
    locked_premium_title: 'Pack Premium',
    locked_premium_copy: 'Le Pack Premium débloque instantanément tous les thèmes de ton profil.',
    current_progress: 'Progression actuelle',
    dialog_buy: 'Débloquer tout',
    dialog_redeem: 'Je continue à jouer',
    dialog_close: 'Je continue à jouer',
    premium_offer_title: 'Pack Premium',
    premium_offer_copy: '1 CHF une fois pour rendre tous les thèmes disponibles instantanément.',
    premium_active_badge: 'Pack actif',
  },
  EN: {
    collection_title: 'Theme collection',
    collection_subtitle: 'Unlock each theme with badges, or grab the Premium Pack to open everything at once.',
    collection_progress: '{count}/{total} themes unlocked',
    collection_badges: '{count} badges earned',
    collection_remaining: '{count} still locked',
    starter_theme: 'Available',
    badge_track: 'Badges',
    unlock_badges_short: '{count} badges',
    always_available: 'Always available',
    unlocked_ready: 'Ready to use',
    premium_owned: 'Premium Pack active',
    premium_code_needed: 'Premium Pack or badges',
    badges_progress: '{current}/{required} badges',
    badges_requirement_long: 'Unlock {count} badges to get this theme.',
    theme_active: 'Active',
    theme_unlocked: 'Unlocked',
    theme_locked: 'Locked',
    premium_help_title: 'Premium Pack',
    premium_help_subtitle: 'A single 1 CHF purchase makes every theme instantly available.',
    premium_shop_title: 'Unlock everything now',
    premium_shop_subtitle: 'Or keep playing and unlock each theme through badges.',
    premium_empty: 'Premium Pack active. Every theme is available.',
    purchase_sync_note: 'Automatic return after payment',
    buy_action: 'Unlock all',
    buy_hint: 'Every theme can still be earned with badges.',
    premium_opened: 'Payment opens in a new tab. Come back here afterwards.',
    premium_popup_blocked: 'The browser blocked the new tab. Allow popups and try again.',
    offline_buy: 'A connection is required to open the payment page.',
    unlock_success: '🎨 Premium Pack unlocked! Every theme is now available.',
    locked_badges_title: 'Two ways to unlock this theme',
    locked_badges_copy: 'Pay 1 CHF to unlock everything right away, or keep playing until you reach the required badge count.',
    locked_premium_title: 'Premium Pack',
    locked_premium_copy: 'The Premium Pack instantly unlocks every theme in your profile.',
    current_progress: 'Current progress',
    dialog_buy: 'Unlock all',
    dialog_redeem: 'Keep playing',
    dialog_close: 'Keep playing',
    premium_offer_title: 'Premium Pack',
    premium_offer_copy: 'Pay 1 CHF once to make every theme instantly available.',
    premium_active_badge: 'Pack active',
  },
  DE: {
    collection_title: 'Themensammlung',
    collection_subtitle: 'Schalte jedes Thema mit Abzeichen frei oder nimm das Premium-Paket fur alles auf einmal.',
    collection_progress: '{count}/{total} Themen freigeschaltet',
    collection_badges: '{count} Abzeichen erhalten',
    collection_remaining: '{count} noch gesperrt',
    starter_theme: 'Verfugbar',
    badge_track: 'Abzeichen',
    unlock_badges_short: '{count} Abzeichen',
    always_available: 'Immer verfugbar',
    unlocked_ready: 'Bereit zur Nutzung',
    premium_owned: 'Premium-Paket aktiv',
    premium_code_needed: 'Premium-Paket oder Abzeichen',
    badges_progress: '{current}/{required} Abzeichen',
    badges_requirement_long: 'Schalte {count} Abzeichen frei, um dieses Thema zu bekommen.',
    theme_active: 'Aktiv',
    theme_unlocked: 'Freigeschaltet',
    theme_locked: 'Gesperrt',
    premium_help_title: 'Premium-Paket',
    premium_help_subtitle: 'Ein einziger Kauf fur 1 CHF macht sofort alle Themen verfugbar.',
    premium_shop_title: 'Jetzt alles freischalten',
    premium_shop_subtitle: 'Oder weiterspielen und jedes Thema uber Abzeichen freischalten.',
    premium_empty: 'Premium-Paket aktiv. Alle Themen sind verfugbar.',
    purchase_sync_note: 'Automatische Ruckkehr nach der Zahlung',
    buy_action: 'Alles freischalten',
    buy_hint: 'Alle Themen bleiben auch uber Abzeichen erreichbar.',
    premium_opened: 'Die Zahlung offnet sich in einem neuen Tab. Komm danach hierher zuruck.',
    premium_popup_blocked: 'Der Browser hat den neuen Tab blockiert. Erlaube Popups und versuche es erneut.',
    offline_buy: 'Du brauchst eine Verbindung, um die Zahlungsseite zu offnen.',
    unlock_success: '🎨 Premium-Paket freigeschaltet! Alle Themen sind jetzt verfugbar.',
    locked_badges_title: 'Zwei Wege fur dieses Thema',
    locked_badges_copy: 'Zahle 1 CHF, um sofort alles freizuschalten, oder spiele weiter bis du genug Abzeichen hast.',
    locked_premium_title: 'Premium-Paket',
    locked_premium_copy: 'Das Premium-Paket schaltet sofort alle Themen in deinem Profil frei.',
    current_progress: 'Aktueller Fortschritt',
    dialog_buy: 'Alles freischalten',
    dialog_redeem: 'Ich spiele weiter',
    dialog_close: 'Ich spiele weiter',
    premium_offer_title: 'Premium-Paket',
    premium_offer_copy: 'Einmal 1 CHF zahlen und sofort alle Themen freischalten.',
    premium_active_badge: 'Paket aktiv',
  },
};

let _themeUnlockFeedback = { type: '', message: '' };

function getCurrentLang() {
  const lang = localStorage.getItem('lang') || 'FR';
  return ['FR', 'EN', 'DE'].includes(lang) ? lang : 'FR';
}

function themeText(key, replacements = {}) {
  const strings = THEME_UI_TEXT[getCurrentLang()] || THEME_UI_TEXT.FR;
  let text = strings[key] || THEME_UI_TEXT.FR[key] || key;

  for (const [name, value] of Object.entries(replacements)) {
    text = text.replaceAll(`{${name}}`, value);
  }

  return text;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function getThemeEntries() {
  return Object.entries(THEMES).sort(([, left], [, right]) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
}

function getStoredPurchases() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PURCHASE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasPremiumPack() {
  return getStoredPurchases().includes(PREMIUM_PACK_KEY);
}

async function getPremiumPaymentUrl() {
  return (await getSecret('PREMIUM_PAYMENT_URL')) || DEFAULT_PREMIUM_PAYMENT_URL;
}

function getThemeLabel(themeName) {
  const theme = THEMES[themeName];
  return theme ? t(theme.labelKey || themeName) : themeName;
}

function getThemePreview(theme) {
  return `linear-gradient(135deg, ${theme['--primary']}, ${theme['--secondary']})`;
}

export function isThemeUnlocked(themeName) {
  const theme = THEMES[themeName];
  if (!theme || !theme.locked) return true;
  if (hasPremiumPack()) return true;
  return getPlayerStats().unlockedBadges.length >= Number(theme.unlockValue || 0);
}

function getSavedThemeName() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
  return isThemeUnlocked(saved) ? saved : DEFAULT_THEME;
}

function getThemeChipLabel(themeName) {
  const theme = THEMES[themeName];
  if (!theme?.locked) return themeText('starter_theme');
  return themeText('unlock_badges_short', { count: theme.unlockValue });
}

function getThemeConditionLabel(themeName) {
  const theme = THEMES[themeName];
  if (!theme?.locked) return themeText('always_available');
  return themeText('badges_requirement_long', { count: theme.unlockValue });
}

function getThemeStatusLine(themeName) {
  const theme = THEMES[themeName];
  if (!theme?.locked) return themeText('always_available');
  if (hasPremiumPack()) return themeText('premium_owned');

  const currentBadges = getPlayerStats().unlockedBadges.length;
  return isThemeUnlocked(themeName)
    ? themeText('unlocked_ready')
    : themeText('badges_progress', {
      current: Math.min(currentBadges, theme.unlockValue),
      required: theme.unlockValue,
    });
}

function getThemeStateLabel(themeName, isActive) {
  if (isActive) return themeText('theme_active');
  return isThemeUnlocked(themeName) ? themeText('theme_unlocked') : themeText('theme_locked');
}

function setThemeUnlockFeedback(message = '', type = 'info') {
  _themeUnlockFeedback = { message, type };
  const status = document.getElementById('themeUnlockStatus');
  if (!status) return;

  status.textContent = message;
  status.className = `theme-code-status ${type} ${message ? 'visible' : ''}`.trim();
}

function showThemeToast(message, type = 'info') {
  if (!message) return;

  const toast = document.createElement('div');
  toast.className = `theme-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 240);
  }, 3400);
}

/**
 * Vérifie si on revient d'un paiement réussi via l'URL (?premium=success).
 */
export function checkPremiumReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('premium') !== 'success') return;

  window.history.replaceState({}, '', window.location.pathname);
  checkRealConnection().then((isOnline) => {
    if (!isOnline) return;
    unlockPremiumPack();
  });
}

export async function unlockPremiumPack() {
  const purchases = getStoredPurchases();
  if (purchases.includes(PREMIUM_PACK_KEY)) return;

  purchases.push(PREMIUM_PACK_KEY);
  localStorage.setItem(PURCHASE_STORAGE_KEY, JSON.stringify([...new Set(purchases)]));

  await pushNow();
  await checkAndUnlockBadges(_totalGames);

  window.dispatchEvent(new CustomEvent('mg:purchase_done'));
  setThemeUnlockFeedback(themeText('unlock_success'), 'ok');
  showThemeToast(themeText('unlock_success'), 'ok');
  _restoreTheme();
  _renderStats();
  _renderThemeSettings();
}

function _ensureThemeShell(themeGrid) {
  const section = themeGrid?.closest('.settings-section');
  if (!section || !themeGrid) return null;

  let summary = section.querySelector('#themeCollectionSummary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'themeCollectionSummary';
    summary.className = 'theme-collection-summary';
    section.insertBefore(summary, themeGrid);
  }

  let hub = section.querySelector('#themeUnlockHub');
  if (!hub) {
    hub = document.createElement('div');
    hub.id = 'themeUnlockHub';
    hub.className = 'theme-unlock-hub';
    themeGrid.insertAdjacentElement('afterend', hub);
  }

  return { section, summary, hub };
}

function _renderThemeSummary(summary) {
  if (!summary) return;

  const entries = getThemeEntries();
  const unlockedCount = entries.filter(([name]) => isThemeUnlocked(name)).length;
  const totalCount = entries.length;
  const remainingCount = totalCount - unlockedCount;
  const badgeCount = getPlayerStats().unlockedBadges.length;
  const progress = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;
  const summaryPill = hasPremiumPack()
    ? themeText('premium_active_badge')
    : themeText('collection_badges', { count: badgeCount });

  summary.innerHTML = `
    <div class="theme-summary-card">
      <div class="theme-summary-head">
        <div>
          <div class="theme-summary-eyebrow">${escapeHtml(themeText('collection_title'))}</div>
          <div class="theme-summary-title">${escapeHtml(themeText('collection_progress', { count: unlockedCount, total: totalCount }))}</div>
        </div>
        <div class="theme-summary-pill">${escapeHtml(summaryPill)}</div>
      </div>
      <div class="theme-summary-bar" aria-hidden="true">
        <span style="width:${progress}%"></span>
      </div>
      <div class="theme-summary-meta">
        <span>${escapeHtml(themeText('collection_subtitle'))}</span>
        <span>${escapeHtml(themeText('collection_remaining', { count: remainingCount }))}</span>
      </div>
    </div>
  `;
}

function _renderThemeGrid(themeGrid) {
  if (!themeGrid) return;

  const activeTheme = getSavedThemeName();

  themeGrid.innerHTML = getThemeEntries().map(([themeName, theme]) => {
    const unlocked = isThemeUnlocked(themeName);
    const active = activeTheme === themeName;
    const preview = getThemePreview(theme);
    const chipLabel = getThemeChipLabel(themeName);
    const stateLabel = getThemeStateLabel(themeName, active);
    const conditionLabel = getThemeConditionLabel(themeName);
    const statusLine = getThemeStatusLine(themeName);

    return `
      <button
        type="button"
        class="theme-swatch ${unlocked ? 'unlocked' : 'locked'} ${active ? 'active' : ''} badge-track"
        data-theme="${themeName}"
        title="${escapeHtml(getThemeLabel(themeName))}"
      >
        <span class="theme-swatch-chip">${escapeHtml(chipLabel)}</span>
        <span class="swatch-preview-frame">
          <span class="swatch-preview" style="background:${preview}"></span>
          ${unlocked ? '' : '<span class="swatch-lock">🔒</span>'}
        </span>
        <span class="theme-swatch-name">${escapeHtml(getThemeLabel(themeName))}</span>
        <span class="theme-swatch-condition">${escapeHtml(conditionLabel)}</span>
        <span class="theme-swatch-status">${escapeHtml(statusLine)}</span>
        <span class="theme-swatch-state">${escapeHtml(stateLabel)}</span>
      </button>
    `;
  }).join('');
}

function _renderThemeUnlockHub(hub) {
  if (!hub) return;

  const statusClass = `theme-code-status ${_themeUnlockFeedback.message ? `${_themeUnlockFeedback.type} visible` : ''}`.trim();
  const premiumActive = hasPremiumPack();
  const premiumBody = premiumActive
    ? `
        <div class="premium-theme-empty">
          <div class="premium-pack-badge">${escapeHtml(themeText('premium_active_badge'))}</div>
          <div>
            <div class="premium-theme-name">${escapeHtml(themeText('premium_empty'))}</div>
            <div class="premium-theme-note">${escapeHtml(themeText('buy_hint'))}</div>
          </div>
        </div>
      `
    : `
        <div class="premium-pack-hero">
          <div class="premium-pack-copy">
            <div class="premium-theme-name">${escapeHtml(themeText('premium_shop_title'))}</div>
            <div class="premium-theme-note">${escapeHtml(themeText('premium_shop_subtitle'))}</div>
          </div>
          <div class="premium-pack-cta">
            <div class="premium-pack-price">1 CHF</div>
            <button type="button" class="premium-theme-buy-btn" data-theme-action="buy-pack">
              ${escapeHtml(themeText('buy_action'))}
            </button>
          </div>
        </div>
      `;

  hub.innerHTML = `
    <div class="theme-unlock-card ${premiumActive ? 'is-active' : ''}">
      <div class="theme-unlock-head">
        <div>
          <div class="theme-unlock-title">${escapeHtml(themeText('premium_help_title'))}</div>
          <div class="theme-unlock-subtitle">${escapeHtml(themeText('premium_help_subtitle'))}</div>
        </div>
        <div class="theme-sync-pill">${escapeHtml(themeText('purchase_sync_note'))}</div>
      </div>

      <div class="premium-shop-block">
        <div class="premium-shop-title">${escapeHtml(themeText('premium_shop_title'))}</div>
        <div class="premium-shop-subtitle">${escapeHtml(themeText('premium_shop_subtitle'))}</div>
        <div class="premium-theme-list">${premiumBody}</div>
      </div>

      <div class="theme-code-hint">${escapeHtml(themeText('buy_hint'))}</div>
      <div id="themeUnlockStatus" class="${statusClass}" role="status" aria-live="polite">
        ${escapeHtml(_themeUnlockFeedback.message)}
      </div>
    </div>
  `;
}

function _renderThemeSettings() {
  const themeGrid = document.getElementById('themeGrid');
  if (!themeGrid) return;

  const shell = _ensureThemeShell(themeGrid);
  if (!shell) return;

  _renderThemeSummary(shell.summary);
  _renderThemeGrid(themeGrid);
  _renderThemeUnlockHub(shell.hub);
}

function _closeThemeDialog(dialog) {
  if (!dialog) return;
  dialog.classList.remove('open');
  setTimeout(() => dialog.remove(), 220);
}

function _showThemeLockedDialog(themeName) {
  const theme = THEMES[themeName];
  if (!theme) return;

  const badgeCount = getPlayerStats().unlockedBadges.length;
  const preview = getThemePreview(theme);
  const dialog = document.createElement('div');
  dialog.className = 'theme-dialog-overlay';

  const progressMarkup = `
    <div class="theme-dialog-progress-wrap">
      <div class="theme-dialog-progress-label">
        <span>${escapeHtml(themeText('current_progress'))}</span>
        <span>${escapeHtml(themeText('badges_progress', {
    current: Math.min(badgeCount, theme.unlockValue),
    required: theme.unlockValue,
  }))}</span>
      </div>
      <div class="theme-dialog-progress">
        <span style="width:${Math.min(100, Math.round((badgeCount / theme.unlockValue) * 100))}%"></span>
      </div>
    </div>
  `;

  dialog.innerHTML = `
    <div class="theme-dialog">
      <button type="button" class="theme-dialog-close" data-theme-action="close-dialog" aria-label="Close">×</button>
      <div class="theme-dialog-preview" style="background:${preview}">
        <span class="theme-dialog-chip">${escapeHtml(getThemeChipLabel(themeName))}</span>
        <span class="theme-dialog-lock">🔒</span>
      </div>
      <div class="theme-dialog-body">
        <div class="theme-dialog-kicker">${escapeHtml(themeText('locked_badges_title'))}</div>
        <h3 class="theme-dialog-title">${escapeHtml(getThemeLabel(themeName))}</h3>
        <p class="theme-dialog-copy">${escapeHtml(themeText('locked_badges_copy'))}</p>
        <p class="theme-dialog-condition">${escapeHtml(getThemeConditionLabel(themeName))}</p>
        ${progressMarkup}
        <div class="theme-dialog-offer">
          <div class="theme-dialog-offer-title">${escapeHtml(themeText('premium_offer_title'))}</div>
          <div class="theme-dialog-offer-copy">${escapeHtml(themeText('premium_offer_copy'))}</div>
          <div class="theme-dialog-offer-price">1 CHF</div>
        </div>
        <div class="theme-dialog-actions">
          <button type="button" class="theme-dialog-btn primary" data-theme-action="buy-pack">
            ${escapeHtml(themeText('dialog_buy'))}
          </button>
          <button type="button" class="theme-dialog-btn secondary" data-theme-action="close-dialog">
            ${escapeHtml(themeText('dialog_close'))}
          </button>
        </div>
      </div>
    </div>
  `;

  dialog.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-theme-action]');

    if (event.target === dialog) {
      _closeThemeDialog(dialog);
      return;
    }

    if (!actionButton) return;

    const { themeAction } = actionButton.dataset;

    if (themeAction === 'close-dialog') {
      _closeThemeDialog(dialog);
      return;
    }

    if (themeAction === 'buy-pack') {
      const result = await _openPremiumPackPurchase();
      if (result.ok) _closeThemeDialog(dialog);
    }
  });

  document.body.appendChild(dialog);
  requestAnimationFrame(() => dialog.classList.add('open'));
}

async function _openPremiumPackPurchase() {
  const isOnline = await checkRealConnection();
  if (!isOnline) {
    const message = themeText('offline_buy');
    setThemeUnlockFeedback(message, 'error');
    showThemeToast(message, 'error');
    return { ok: false, reason: 'offline' };
  }

  const purchaseUrl = await getPremiumPaymentUrl();
  const popup = window.open(purchaseUrl, '_blank');

  if (!popup) {
    const message = themeText('premium_popup_blocked');
    setThemeUnlockFeedback(message, 'error');
    showThemeToast(message, 'error');
    return { ok: false, reason: 'popup_blocked' };
  }

  const message = themeText('premium_opened');
  setThemeUnlockFeedback(message, 'info');
  showThemeToast(message, 'info');
  return { ok: true };
}

function initThemeSettingsUI() {
  const themeGrid = document.getElementById('themeGrid');
  if (!themeGrid) return;

  const section = themeGrid.closest('.settings-section');
  if (!section || section.dataset.themeUiReady === 'true') {
    _renderThemeSettings();
    return;
  }

  section.dataset.themeUiReady = 'true';

  themeGrid.addEventListener('click', (event) => {
    const swatch = event.target.closest('.theme-swatch');
    if (!swatch) return;

    const themeName = swatch.dataset.theme;
    if (!themeName) return;

    if (isThemeUnlocked(themeName)) {
      setActiveTheme(themeName);
      return;
    }

    _showThemeLockedDialog(themeName);
  });

  section.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-theme-action]');
    if (!actionButton) return;

    if (actionButton.dataset.themeAction === 'buy-pack') {
      await _openPremiumPackPurchase();
    }
  });

  _renderThemeSettings();
}

function setActiveTheme(themeName) {
  const nextTheme = isThemeUnlocked(themeName) ? themeName : DEFAULT_THEME;
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
  _renderThemeSettings();
}

export function refreshThemeCollection() {
  _renderThemeSettings();
}

// ─── INIT PRINCIPALE ──────────────────────────────────────────────────────────
export function initProfilePanel(totalGamesCount = 0) {
  _totalGames = totalGamesCount;
  _restoreTheme();
  _restoreDisplayMode();
  _updateProfileBadgeCount();

  const btn = document.getElementById('profileBtn');
  const panel = document.getElementById('profilePanel');
  const backdrop = document.getElementById('profileBackdrop');
  const closeBtn = document.getElementById('profileClose');

  if (!btn || !panel) return;

  btn.addEventListener('click', () => openPanel());
  closeBtn?.addEventListener('click', () => closePanel());
  backdrop?.addEventListener('click', () => closePanel());

  // Tabs
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${target}`)?.classList.add('active');

      if (target === 'badges') {
        _renderBadges();
        _clearNewBadges(); // vider la pastille dès qu'on ouvre l'onglet
      }
      if (target === 'stats') _renderStats();
      if (target === 'settings') _renderThemeSettings();
    });
  });

  // Mode d'affichage
  document.querySelectorAll('.display-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      setDisplayMode(mode);
      document.querySelectorAll('.display-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  initCloudSyncUI();
  initUsername();
  initThemeSettingsUI();
  checkPremiumReturn();

  if (panel.dataset.purchaseListenerReady !== 'true') {
    panel.dataset.purchaseListenerReady = 'true';
    window.addEventListener('mg:purchase_done', () => {
      _restoreTheme();
      _renderStats();
      _renderThemeSettings();
    });
  }
}

/** 
 * Rafraîchit les textes dynamiques du profil (stats, badges) sans recharger la page.
 * Appelé par main.js quand la langue change.
 */
export function updateProfileLanguage() {
  const panel = document.getElementById('profilePanel');
  if (!panel || panel.classList.contains('hidden')) return;

  _renderStats();
  _renderBadges();
  _renderThemeSettings();
}

// ─── USERNAME JOUEUR ───────────────────────────────────────────────────────────
const PLAYER_NAME_KEY = 'mg_player_name';

export function getPlayerName() {
  return localStorage.getItem(PLAYER_NAME_KEY) || 'Joueur';
}

function initUsername() {
  const input = document.getElementById('profileUsername');
  const editBtn = document.getElementById('profileUsernameEdit');
  if (!input) return;

  // Charger le nom sauvegardé
  const saved = getPlayerName();
  input.value = saved;

  // Le crayon focus le champ
  editBtn?.addEventListener('click', () => {
    input.focus();
    input.select();
  });

  // Sauvegarder à chaque modification (debounce 600ms)
  let _debounce = null;
  input.addEventListener('input', () => {
    clearTimeout(_debounce);
    _debounce = setTimeout(() => {
      const name = input.value.trim() || 'Joueur';
      input.value = name;
      localStorage.setItem(PLAYER_NAME_KEY, name);
      // Propager aux jeux qui utilisent des clés spécifiques
      localStorage.setItem('battleship_playerName', name);
      localStorage.setItem('blockPuzzle_playerName', name);
      localStorage.setItem('lostBelow_playerName', name);
      localStorage.setItem('whereAmI_name', name);
      localStorage.setItem('drawguess_name', name);
    }, 600);
  });

  // Valider avec Entrée
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
    }
  });

  // Valider au blur
  input.addEventListener('blur', () => {
    const name = input.value.trim() || 'Joueur';
    input.value = name;
    localStorage.setItem(PLAYER_NAME_KEY, name);
    localStorage.setItem('battleship_playerName', name);
    localStorage.setItem('blockPuzzle_playerName', name);
    localStorage.setItem('lostBelow_playerName', name);
    localStorage.setItem('whereAmI_name', name);
    localStorage.setItem('drawguess_name', name);
  });
}

let _totalGames = 0;

// ─── OPEN / CLOSE ─────────────────────────────────────────────────────────────
function openPanel() {
  const panel = document.getElementById('profilePanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('open'));
  document.body.classList.add('no-scroll');
  _renderStats();
  _renderThemeSettings();
  checkAndUnlockBadges(_totalGames);
  _updateProfileBadgeCount();
  document.getElementById('floating-menu-settings').style.display = 'none';
}

function closePanel() {
  const panel = document.getElementById('profilePanel');
  if (!panel) return;
  panel.classList.remove('open');
  document.body.classList.remove('no-scroll');
  setTimeout(() => panel.classList.add('hidden'), 350);
  document.getElementById('floating-menu-settings').style.display = 'flex';
}

// ─── RENDER STATS ─────────────────────────────────────────────────────────────
function _renderStats() {
  const stats = getPlayerStats();

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  // ── Temps joué ──
  setVal('pstat-time', formatPlayTime(stats.playTimeMinutes));

  // ── Jeux testés ──
  setVal('pstat-unique', stats.uniqueGames.length);

  // ── Streak (jours consécutifs) ──
  const streak = getStreak();
  setVal('pstat-streak', streak > 0 ? `${streak}j` : '—');

  // ── Jeu le plus joué ──
  const mostPlayed = getMostPlayedGame();
  const mostLabel = document.getElementById('pstat-most-label');
  if (mostLabel) mostLabel.textContent = mostPlayed.name || '—';

  // Barre de progression badges
  loadBadgeDefs().then(defs => {
    const total = defs.length;
    const done = stats.unlockedBadges.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const fill = document.getElementById('progressBarFill');
    const frac = document.getElementById('progress-fraction');
    const count = document.getElementById('profileBadgeCount');

    if (fill) fill.style.width = pct + '%';
    if (frac) frac.textContent = `${done} / ${total}`;

    if (count) {
      count.textContent = done;
      count.style.display = done > 0 ? 'flex' : 'none';
    }
  });

  // Dernière session dans le sous-titre
  const currentLang = localStorage.getItem('lang') || 'FR';
  const locale = currentLang === 'EN' ? 'en-US' : currentLang === 'DE' ? 'de-DE' : 'fr-CH';

  const lastSession = stats.lastSession
    ? new Date(stats.lastSession).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const since = document.getElementById('profileSince');
  if (since) since.textContent = t("profile.last_session_played").replace("{date}", lastSession);
}

// ─── STREAK ───────────────────────────────────────────────────────────────────
/**
 * Calcule le streak de jours consécutifs depuis mg_streak_data.
 * Structure localStorage 'mg_streak_data' : { lastDate: 'YYYY-MM-DD', count: number }
 * Appelé à chaque ouverture du panneau — la mise à jour est faite dans updateStreak().
 */
export function getStreak() {
  try {
    const raw = localStorage.getItem('mg_streak_data');
    if (!raw) return 0;
    const { lastDate, count } = JSON.parse(raw);
    const today = _todayStr();
    const yesterday = _daysAgoStr(1);
    // Streak valide si joué aujourd'hui ou hier
    if (lastDate === today || lastDate === yesterday) return count;
    return 0; // streak cassé
  } catch { return 0; }
}

/**
 * À appeler à chaque lancement de jeu (depuis main.js via reportGamePlayed).
 * Met à jour le streak si nécessaire.
 */
export function updateStreak() {
  try {
    const today = _todayStr();
    const yesterday = _daysAgoStr(1);
    const raw = localStorage.getItem('mg_streak_data');
    let data = raw ? JSON.parse(raw) : { lastDate: null, count: 0 };

    if (data.lastDate === today) return; // déjà compté aujourd'hui
    if (data.lastDate === yesterday) {
      data.count += 1; // jour consécutif
    } else {
      data.count = 1;  // streak cassé, on repart à 1
    }
    data.lastDate = today;
    localStorage.setItem('mg_streak_data', JSON.stringify(data));
  } catch { /* silent */ }
}

function _todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function _daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── JEU LE PLUS JOUÉ ────────────────────────────────────────────────────────
/**
 * Lit gameHistory depuis localStorage et retourne le jeu le plus joué.
 * @returns {{ id: string, name: string, emoji: string, count: number } | {}}
 */
function getMostPlayedGame() {
  try {
    const history = JSON.parse(localStorage.getItem('gameHistory') || '{}');
    if (!Object.keys(history).length) return {};
    const [id, data] = Object.entries(history).sort((a, b) => b[1].playCount - a[1].playCount)[0];
    // Tenter de récupérer le nom depuis le DOM (cartes déjà rendues)
    const card = document.querySelector(`.game-card[data-game="${id}"] .card-title`);
    const name = card ? card.textContent.trim() : id;
    // Extraire l'emoji (premier caractère si c'est un emoji)
    const emojiMatch = name.match(/^\p{Emoji}/u);
    return {
      id,
      name: emojiMatch ? name.slice(emojiMatch[0].length).trim() : name,
      emoji: emojiMatch ? emojiMatch[0] : '🎮',
      count: data.playCount,
    };
  } catch { return {}; }
}

function getRarityLabel(rarity) {
  const lang = localStorage.getItem('lang') || 'FR';
  const labels = {
    FR: { common: 'Commun', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire' },
    EN: { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' },
    DE: { common: 'Gewöhnlich', rare: 'Selten', epic: 'Episch', legendary: 'Legendär' },
  };
  return (labels[lang] || labels.FR)[rarity] || rarity;
}

function getRarityStars(rarity) {
  return { common: '', rare: '✦', epic: '✦✦', legendary: '✦✦✦' }[rarity] || '';
}

// ─── RENDER BADGES ────────────────────────────────────────────────────────────
async function _renderBadges() {
  const grid = document.getElementById('badgesGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="badges-loading">Chargement…</div>';

  const [defs, stats] = await Promise.all([
    loadBadgeDefs(),
    Promise.resolve(getPlayerStats()),
  ]);
  const unlocked = new Set(stats.unlockedBadges);

  grid.innerHTML = '';

  // Tri par rareté uniquement : common → rare → epic → legendary
  // Les badges débloqués/verrouillés restent dans leur position naturelle
  const rarityOrder = { common: 0, rare: 1, epic: 2, legendary: 3 };
  const sorted = [...defs].sort((a, b) =>
    (rarityOrder[a.rarity] ?? 0) - (rarityOrder[b.rarity] ?? 0)
  );

  const lang = localStorage.getItem('lang') || 'FR';

  for (const badge of sorted) {
    const isUnlocked = unlocked.has(badge.id);

    const name = lang === 'EN' ? (badge.nameEN || badge.name)
      : lang === 'DE' ? (badge.nameDE || badge.name)
        : badge.name;

    const desc = lang === 'EN' ? (badge.descriptionEN || badge.description)
      : lang === 'DE' ? (badge.descriptionDE || badge.description)
        : badge.description;

    const stars = getRarityStars(badge.rarity);
    const pillLabel = getRarityLabel(badge.rarity);

    const card = document.createElement('div');
    card.className = `badge-card rarity-${badge.rarity} ${isUnlocked ? 'unlocked' : 'locked'}`;
    card.title = `${name} — ${desc}`;

    card.innerHTML = `
            ${stars ? `<div class="badge-corner-stars">${stars}</div>` : ''}
            <div class="badge-card-icon">${isUnlocked ? badge.icon : '🔒'}</div>
            <div class="badge-card-name">${name}</div>
            <div class="badge-rarity-pill">${pillLabel}</div>
            <div class="badge-card-desc">${desc}</div>
        `;

    grid.appendChild(card);
  }
}

// ─── GESTION "NOUVEAUX BADGES" (pastille) ────────────────────────────────────
const SEEN_KEY = 'mg_badges_seen';

function _getSeenBadges() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); }
  catch { return []; }
}

/** Marque tous les badges actuellement débloqués comme "vus", vide la pastille. */
function _clearNewBadges() {
  const unlocked = getPlayerStats().unlockedBadges;
  localStorage.setItem(SEEN_KEY, JSON.stringify(unlocked));
  _updateProfileBadgeCount(); // met à jour la pastille à 0
}

/** Appelée par badges.js après chaque débloquage — met à jour la pastille. */
export function refreshBadgeNotif() {
  _updateProfileBadgeCount();
  _renderThemeSettings();
}

// ─── THÈME ────────────────────────────────────────────────────────────────────
export function applyTheme(name) {
  const resolvedThemeName = isThemeUnlocked(name) ? name : DEFAULT_THEME;
  const theme = THEMES[resolvedThemeName] || THEMES.default;
  const root = document.documentElement;
  for (const [prop, val] of Object.entries(theme)) {
    if (prop.startsWith('--')) {
      root.style.setProperty(prop, val);
    }
  }

  // meta theme-color = coin haut = --primary
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', theme['--meta-color'] || theme['--primary']);

  updateBMCTheme(resolvedThemeName); // BMC = coin bas-droit = --secondary
}

function _restoreTheme() {
  const saved = getSavedThemeName();
  localStorage.setItem(THEME_STORAGE_KEY, saved);
  applyTheme(saved);
}

// ─── MODE D'AFFICHAGE ─────────────────────────────────────────────────────────
/**
 * Applique le mode d'affichage 'grid' ou 'list' à la grille de jeux.
 * @param {string} mode
 */
export function setDisplayMode(mode) {
  const grid = document.getElementById('mainGamesGrid');
  if (!grid) return;

  localStorage.setItem('mg_display_mode', mode);

  if (mode === 'list') {
    grid.classList.add('display-list');
    grid.classList.remove('display-grid');
  } else {
    grid.classList.add('display-grid');
    grid.classList.remove('display-list');
  }

  // Mettre à jour les boutons du panneau si ouvert
  document.querySelectorAll('.display-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

function _restoreDisplayMode() {
  const saved = localStorage.getItem('mg_display_mode') || 'grid';
  setDisplayMode(saved);
}

// ─── BADGE COUNT SUR BOUTON PROFIL ───────────────────────────────────────────
function _updateProfileBadgeCount() {
  const unlocked = getPlayerStats().unlockedBadges;
  const seen = _getSeenBadges();
  // Nouveaux = débloqués mais pas encore vus dans l'onglet badges
  const newCount = unlocked.filter(id => !seen.includes(id)).length;
  const countEl = document.getElementById('profileBadgeCount');
  if (countEl) {
    countEl.textContent = newCount;
    countEl.style.display = newCount > 0 ? 'flex' : 'none';
  }
}

// ── Cloud Sync UI ──
const ICON_CHECK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const ICON_COPY = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const ICON_LOAD = `<svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`;
const ICON_X = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

function initCloudSyncUI() {
  const uidValue = document.getElementById('cloudUidValue');
  const copyBtn = document.getElementById('cloudUidCopy');
  const input = document.getElementById('cloudUidInput');
  const importBtn = document.getElementById('cloudImportBtn');
  const status = document.getElementById('cloudStatus');

  if (!uidValue) return;

  // Afficher l'UID
  const uid = getCloudUID();
  if (uid) uidValue.textContent = uid;

  // Copier
  copyBtn?.addEventListener('click', () => {
    const uid = getCloudUID();
    if (!uid) return;
    navigator.clipboard.writeText(uid).then(() => {
      copyBtn.innerHTML = ICON_CHECK; // Utilise le SVG check
      copyBtn.classList.add('success'); // Optionnel: pour changer la couleur en vert via CSS

      setTimeout(() => {
        copyBtn.innerHTML = ICON_COPY; // Revient au SVG copie
        copyBtn.classList.remove('success');
      }, 1500);
    });
  });

  // Importer
  importBtn?.addEventListener('click', async () => {
    const val = input.value.trim();
    if (!val) return;

    importBtn.disabled = true;
    // On passe le SVG dans le message de statut
    _setStatus(status, `${ICON_LOAD} Import en cours…`, 'info');

    const ok = await importUID(val);

    if (ok) {
      _setStatus(status, `${ICON_CHECK} Progression restaurée ! Rechargement…`, 'ok');
      setTimeout(() => location.reload(), 1500);
    } else {
      _setStatus(status, `${ICON_X} ID introuvable ou invalide.`, 'error');
      importBtn.disabled = false;
    }
  });
}

function _setStatus(el, msg, type) {
  if (!el) return;
  el.innerHTML = msg;
  el.className = `cloud-status ${type}`;
}
