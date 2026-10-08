// ─────────────────────────────────────────────
// LETTER BY LETTER — sélection et cache des mots
//
// 1. Liste de secours codée en dur (jeu 100 % hors ligne).
// 2. Cache dans localStorage (clé "letter-by-letter" → words.cache), jamais purgé.
// 3. Enrichissement en ligne via l'API MediaWiki de fr.wiktionary.org
//    (catégories de lemmes : noms communs, adjectifs, verbes).
//    Même famille d'API que Wiki Challenge (Wikipédia FR) ; contenu
//    sous licence CC BY-SA, on ne stocke ici que des mots isolés.
//
// Aucune redirection vers offline.html : si la connexion est absente
// ou si l'API échoue, on joue avec secours + cache.
// ─────────────────────────────────────────────
import { checkRealConnection } from "../../../js/network.js";
import { load, update } from "./storage.js";
import { LENGTHS, normalizeWord, isValidWord, isCommonWordTitle } from "./logic.js";

const RAW_FALLBACK = {
  4: [
    "jour", "main", "pain", "voix", "lune", "roue", "port", "noir", "bleu", "vert",
    "rose", "ciel", "mère", "père", "fils", "amie", "lait", "soir", "nuit", "pont",
    "robe", "bois", "chat", "lion", "loup", "mois", "pied", "tête", "dent", "nez",
    "vent", "pays", "idée", "joie", "rire", "lire", "aile", "cœur", "sœur", "huit",
  ],
  5: [
    "table", "livre", "plage", "arbre", "fleur", "temps", "voile", "sable", "nuage", "porte",
    "route", "ville", "école", "forêt", "chien", "grand", "petit", "heure", "jeune", "monde",
    "pluie", "terre", "angle", "lundi", "samedi", "tigre", "pomme", "poire", "stade", "danse",
    "image", "cadre", "livre", "monde", "neige", "orage", "radio", "ruban", "salon", "trace",
  ],
  6: [
    "maison", "chaise", "jardin", "soleil", "orange", "banane", "voyage", "cheval", "bateau", "étoile",
    "miroir", "plante", "enfant", "bouton", "poulet", "fusée", "tomate", "cuiller", "visage",
    "animal", "valise", "boisson", "gâteau", "guitare", "fenêtre", "été", "mouton", "marché",
    "lumière", "bureau", "météo", "oiseau", "poisson", "village", "pierre", "nature", "figure", "énergie",
  ],
  7: [
    "fenêtre", "fromage", "cuisine", "musique", "rivière", "chapeau", "voiture", "lumière", "chanson", "paysage",
    "journée", "semaine", "histoire", "bonheur", "travail", "poisson", "docteur", "planète", "langage", "sourire",
    "famille", "hôpital", "château", "bouteille", "couleur", "chemise", "cerveau", "machine", "dessert",
    "tableau", "cabinet", "peinture", "voyageur", "lecture", "football", "musée", "épaule", "écriture",
  ],
  8: [
    "montagne", "histoire", "chocolat", "dimanche", "éléphant", "chanteur", "français", "souvenir", "cheminée", "campagne",
    "aventure", "bâtiment", "portable", "mercredi", "vacances", "tortue", "boulanger", "parapluie", "calendrier", "ordinateur",
    "peinture", "musicien", "baleine", "télévision", "araignée", "papillon", "fraise", "ambition", "fontaine", "voyageur",
    "librairie", "hirondelle", "boutique", "cathédrale", "pendule", "lumineux", "sérieux", "poussière", "brouillard",
  ],
};

/** Liste de secours normalisée, dédoublonnée et filtrée par longueur. */
export const FALLBACK_WORDS = (() => {
  const out = {};
  for (const len of LENGTHS) {
    const set = new Set();
    for (const raw of RAW_FALLBACK[len] || []) {
      const w = normalizeWord(raw);
      if (isValidWord(w, len)) set.add(w);
    }
    out[len] = [...set];
  }
  return out;
})();

// ── Pool de mots ────────────────────────────────────────────

/** Secours + cache, dédoublonnés, longueur et caractères revérifiés. */
export function getWordPool(length) {
  const set = new Set(FALLBACK_WORDS[length] || []);
  const cached = load().words.cache[length] || [];
  for (const raw of cached) {
    const w = normalizeWord(raw);
    if (isValidWord(w, length)) set.add(w);
  }
  return [...set];
}

/** Mot aléatoire de la longueur demandée, différent de `exclude` quand c'est possible. */
export function pickWord(length, exclude = null) {
  const pool = getWordPool(length);
  const candidates = pool.length > 1 ? pool.filter((w) => w !== exclude) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── Cache ───────────────────────────────────────────────────

const MAX_PER_LENGTH = 4000; // ≈ 30 Ko par longueur au maximum

/**
 * Ajoute des mots au cache (sans jamais en supprimer).
 * Vérifie caractères + longueur 4..8, évite les doublons.
 * Retourne le nombre de mots réellement ajoutés.
 */
export function addWordsToCache(words) {
  let added = 0;
  update((d) => {
    const sets = {};
    for (const len of LENGTHS) sets[len] = new Set(d.words.cache[len]);
    for (const raw of words) {
      const w = normalizeWord(raw);
      const len = w.length;
      if (!LENGTHS.includes(len) || !isValidWord(w, len)) continue;
      if (sets[len].has(w) || sets[len].size >= MAX_PER_LENGTH) continue;
      sets[len].add(w);
      d.words.cache[len].push(w);
      added++;
    }
  });
  return added;
}

// ── Enrichissement en ligne ─────────────────────────────────

const API_URL = "https://fr.wiktionary.org/w/api.php";
const CATEGORIES = ["Noms communs en français", "Adjectifs en français", "Verbes en français"];
const PREFIX_LETTERS = "abcdefghijlmnoprstv";
const REQUESTS_PER_CATEGORY = 2;
const REQUEST_TIMEOUT_MS = 8000;
const SYNC_INTERVAL_MS = 10 * 60 * 1000; // pas plus d'un enrichissement toutes les 10 min

function randomPrefix() {
  const pick = () => PREFIX_LETTERS[Math.floor(Math.random() * PREFIX_LETTERS.length)];
  return pick() + pick();
}

async function fetchCategoryTitles(category, prefix) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    list: "categorymembers",
    cmtitle: "Catégorie:" + category,
    cmnamespace: "0",
    cmtype: "page",
    cmlimit: "500",
    cmsort: "sortkey",
    cmstartsortkeyprefix: prefix,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    return (json?.query?.categorymembers || []).map((m) => m.title);
  } finally {
    clearTimeout(timer);
  }
}

let syncInFlight = null;

/**
 * Enrichit le cache sans bloquer : à appeler sans await.
 * Ne lève jamais d'erreur. Retourne { added, offline?, skipped?, failed? }.
 */
export function enrichCache({ force = false } = {}) {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    try {
      if (!force && Date.now() - load().words.lastSync < SYNC_INTERVAL_MS) {
        return { added: 0, skipped: true };
      }
      let online = false;
      try {
        online = await checkRealConnection();
      } catch {
        online = false;
      }
      if (!online) return { added: 0, offline: true };

      const jobs = [];
      for (const category of CATEGORIES) {
        for (let i = 0; i < REQUESTS_PER_CATEGORY; i++) {
          jobs.push(fetchCategoryTitles(category, randomPrefix()));
        }
      }
      const settled = await Promise.allSettled(jobs);
      const ok = settled.filter((s) => s.status === "fulfilled");
      if (ok.length === 0) return { added: 0, failed: true };

      const candidates = [];
      for (const s of ok) {
        for (const title of s.value) {
          if (isCommonWordTitle(title)) candidates.push(title);
        }
      }
      const added = addWordsToCache(candidates);
      update((d) => {
        d.words.lastSync = Date.now();
      });
      return { added };
    } catch {
      return { added: 0, failed: true };
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}
