/** Pendu — langue : suit la langue choisie dans le menu de la plateforme (localStorage "lang"), via i18n.js (global, chargé en script classique).
 *  Langues du jeu : FR / EN / DE (autre langue → FR, comme le repli de i18n.js). */
export const SUPPORTED = ['FR', 'EN', 'DE'];

function readLang() {
    let l = '';
    try { l = (localStorage.getItem('lang') || '').toUpperCase(); } catch { /* ignore */ }
    return SUPPORTED.includes(l) ? l : 'FR';
}
export const LANG = readLang();

/** Traduction d'une clé de la section "hangman" (ex. tr('game.quit')), avec variables {nom}. */
export function tr(key, vars) {
    const raw = typeof window.t === 'function' ? window.t('hangman.' + key) : key;
    const s = typeof raw === 'string' ? raw : String(raw);
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}

/** Charge les textes, traduit le DOM (data-i18n, data-i18n-placeholder, data-i18n-title, data-i18n-aria) et le titre de la page. */
export async function initLang(titleKey = 'meta.title') {
    try {
        await window.initI18n();
        window.refreshTexts();
        document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', tr(el.dataset.i18nAria)));
        document.title = tr(titleKey);
        const desc = document.querySelector('meta[name="description"]');
        if (desc && titleKey === 'meta.title') desc.setAttribute('content', tr('meta.description'));
    } catch (e) { console.warn('i18n:', e); }
    document.documentElement.lang = LANG.toLowerCase();
    document.documentElement.classList.remove('i18n-pending');
}
