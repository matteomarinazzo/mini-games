/**
 * Page Mystère — tirage d'une page Wikipédia FR.
 * Sujets grand public tirés dans une liste fixe (topics.js), puis article Wikipédia FR correspondant.
 */
const MAX_CHARS = 14000;      // plafond du texte affiché
const END_SECTIONS = /\n=+\s*(Notes et références|Notes|Références|Voir aussi|Articles connexes|Liens externes|Bibliographie|Annexes|Sources)\s*=+\s*(\n|$)/i;

import { TOPICS } from './topics.js';

let cache = null;
const RECENT_KEY = 'mystery-page-recent';
const RECENT_MAX = 40;
const clean = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function api(host, params) {
    const url = new URL(`https://${host}/w/api.php`);
    Object.entries({ action: 'query', format: 'json', origin: '*', ...params })
        .forEach(([k, v]) => url.searchParams.set(k, v));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
    } finally { clearTimeout(timer); }
}

function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } }
function remember(t) { try { localStorage.setItem(RECENT_KEY, JSON.stringify([t, ...recent().filter(x => x !== t)].slice(0, RECENT_MAX))); } catch { /* ignore */ } }

export async function fetchPage(title) {
    if (cache && cache.title === title) return cache;
    const d = await api('fr.wikipedia.org', {
        prop: 'extracts|pageprops', ppprop: 'disambiguation', explaintext: 1, exsectionformat: 'wiki', titles: title, redirects: 1
    });
    const p = Object.values(d.query?.pages || {})[0];
    if (!p || p.missing || !p.extract) throw new Error('Page introuvable');
    if (p.pageprops && 'disambiguation' in p.pageprops) throw new Error("Page d'homonymie");
    // Redirigé vers un autre nom (souvent plus technique) : on rejette
    if (clean(p.title) !== clean(title)) throw new Error('Titre redirigé');
    let text = p.extract.replace(/\r/g, '');
    const cut = text.search(END_SECTIONS);
    if (cut > 0) text = text.slice(0, cut);
    if (text.length > MAX_CHARS) {
        const i = text.lastIndexOf('\n', MAX_CHARS);
        text = text.slice(0, i > 0 ? i : MAX_CHARS);
    }
    if (text.length < 500) throw new Error('Article trop court');
    cache = { title: p.title, text: text.trim() };
    return cache;
}

/** Tire un sujet grand public parmi TOPICS (hors sujets récents) ; saute ceux qui échouent. */
export async function drawPage() {
    const seen = new Set(recent());
    let pool = TOPICS.filter(t => !seen.has(t));
    if (pool.length < 10) pool = TOPICS.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
    let netErrors = 0;
    for (const title of pool.slice(0, 8)) {
        try {
            const page = await fetchPage(title);
            remember(title);
            return page;
        } catch (e) {
            console.warn('Sujet ignoré :', title, e.message);
            if (++netErrors >= 3 && !/Page|Titre|Article/.test(e.message)) throw e;   // réseau en panne
        }
    }
    throw new Error('Aucune page trouvée');
}
