const BASE = '/perso/mini-games-plateform/';

window.I18N = {
    lang: "EN",
    fallback: "EN",
    data: {},
    fallbackData: {}
};

// Charger une langue
async function loadLanguage(lang) {
    try {
        const res = await fetch(`${BASE}assets/lang/${lang.toLowerCase()}.json`);
        I18N.data = await res.json();
        I18N.lang = lang;
    } catch (e) {
        console.warn("Lang load failed:", lang);
    }
}

// Charger fallback (FR)
async function loadFallback() {
    const res = await fetch(`${BASE}assets/lang/fr.json`);
    I18N.fallbackData = await res.json();
}

// Init au lancement
async function initI18n() {
    const cachedLang = localStorage.getItem("lang") || "FR";

    await loadFallback();
    await loadLanguage(cachedLang);
}

// Getter sécurisé avec fallback
function t(path) {
    const keys = path.split(".");

    // 1. main language
    let v = I18N.data;
    for (let k of keys) {
        if (v && Object.prototype.hasOwnProperty.call(v, k)) {
            v = v[k];
        } else {
            v = null;
            break;
        }
    }

    if (v !== null && v !== undefined) return v;

    // 2. fallback
    let f = I18N.fallbackData;
    for (let k of keys) {
        if (f && Object.prototype.hasOwnProperty.call(f, k)) {
            f = f[k];
        } else {
            return path; // nothing found
        }
    }

    return f;
}

// Changer langue
async function setLang(lang) {
    localStorage.setItem("lang", lang);
    await loadLanguage(lang);
    refreshTexts();
}

// Refresh DOM
function refreshTexts() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const val = t(key);
        const tag = el.tagName;

        if (tag === 'INPUT' || tag === 'TEXTAREA') {
            el.placeholder = val;
        } else if (val && val.includes('<')) {
            el.innerHTML = val;
        } else {
            el.textContent = val;
        }
    });
}

// EXPOSE GLOBAL
window.t = t;
window.setLang = setLang;
window.refreshTexts = refreshTexts;
window.initI18n = initI18n;