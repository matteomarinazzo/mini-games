// ─────────────────────────────────────────────
// LETTER BY LETTER — stockage (une seule clé localStorage : "letter-by-letter")
//
// {
//   version: 1,
//   settings: { length, attempts },
//   stats:    { "4": { played, won, lost }, … "8": {…} },
//   words:    { cache: { "4": [...], … }, lastSync: <timestamp ms> }
// }
//
// Chaque écriture relit la valeur fraîche puis la modifie (update) :
// l'enrichissement asynchrone du cache ne peut donc pas écraser
// les statistiques, et inversement. Les champs inconnus sont conservés.
// ─────────────────────────────────────────────
import { LENGTHS, ATTEMPTS } from "./logic.js";

export const STORAGE_KEY = "letter-by-letter";
const VERSION = 1;

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function toCount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** Complète / répare une structure lue (migration), sans rien supprimer d'inconnu. */
export function sanitize(raw) {
  const data = isObject(raw) ? { ...raw } : {};
  data.version = VERSION;

  const s = isObject(data.settings) ? { ...data.settings } : {};
  s.length = LENGTHS.includes(Number(s.length)) ? Number(s.length) : 5;
  s.attempts = ATTEMPTS.includes(Number(s.attempts)) ? Number(s.attempts) : 6;
  data.settings = s;

  const stats = isObject(data.stats) ? { ...data.stats } : {};
  for (const len of LENGTHS) {
    const e = isObject(stats[len]) ? { ...stats[len] } : {};
    e.played = toCount(e.played);
    e.won = toCount(e.won);
    e.lost = toCount(e.lost);
    stats[len] = e;
  }
  data.stats = stats;

  const w = isObject(data.words) ? { ...data.words } : {};
  const cache = isObject(w.cache) ? { ...w.cache } : {};
  for (const len of LENGTHS) {
    cache[len] = Array.isArray(cache[len])
      ? cache[len].filter((x) => typeof x === "string")
      : [];
  }
  w.cache = cache;
  w.lastSync = toCount(w.lastSync);
  data.words = w;

  return data;
}

export function load() {
  try {
    const txt = localStorage.getItem(STORAGE_KEY);
    return sanitize(txt ? JSON.parse(txt) : null);
  } catch {
    return sanitize(null);
  }
}

export function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // quota / mode privé : le jeu reste jouable
  }
}

/** Lecture fraîche → mutation → écriture. Retourne les données écrites. */
export function update(mutator) {
  const data = load();
  mutator(data);
  save(data);
  return data;
}

export function saveSettings(length, attempts) {
  return update((d) => {
    d.settings.length = length;
    d.settings.attempts = attempts;
  });
}

/** Enregistre le résultat d'une partie terminée. */
export function recordResult(length, won) {
  return update((d) => {
    const e = d.stats[length];
    e.played++;
    if (won) e.won++;
    else e.lost++;
  });
}
