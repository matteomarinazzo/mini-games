// ─────────────────────────────────────────────
// MOTS CROISÉS — catégories, mots et génération de la grille
//
// 1. Listes de secours codées en dur, par catégorie (jeu 100 % hors ligne).
// 2. Cache localStorage "crossword_word_cache" (séparé de la sauvegarde "crossword").
//    Il ne remplace jamais les listes de secours : il ne fait que les compléter.
// 3. Enrichissement en ligne via une API CONFIGURABLE (API_CONFIG).
//    L'API n'est pas supposée filtrer par thème : seules les catégories
//    listées dans API_CONFIG.categoryMap sont enrichies, avec une catégorie
//    MediaWiki réellement thématique. Les autres utilisent uniquement les secours.
// 4. Générateur de grille (buildPuzzle) : 10 mots posés dans 8 directions,
//    les cases NON utilisées reçoivent les lettres (mélangées) du 11e mot.
// ─────────────────────────────────────────────
import { checkRealConnection } from "../../../js/network.js";

// ── Paramètres importants ───────────────────────────────────

export const WORDS_IN_GRID = 10; // mots cachés dans la grille
export const MIN_WORD_LEN = 4; // longueur minimale d'un mot (grille ou final)
export const MAX_WORD_LEN = 11; // longueur maximale, mot mystère inclus
export const FINAL_MIN_LEN = 4; // le mot final a autant de lettres que de cases libres
export const FINAL_MAX_LEN = 11; // le mot mystère comporte 11 lettres
/**
 * Tailles de grille essayées dans l'ordre (carrées). Une taille plus grande
 * n'est tentée que si la précédente échoue. Les mots de la grille ne dépassent
 * jamais la taille de la grille.
 */
export const GRID_SIZES = [14, 15, 16, 17, 18];
/** Essais de placement par taille de grille (chaque essai est très rapide). */
export const ATTEMPTS_PER_SIZE = 3000;
/** Nombre de catégories différentes tentées avant d'abandonner. */
export const MAX_CATEGORY_TRIES = 6;
/** Tolérance du placement glouton : 0 = toujours le placement qui couvre le plus de cases neuves. */
const GREEDY_SLACK = 1;

export const CACHE_KEY = "crossword_word_cache";

export const API_CONFIG = {
  enabled: true, // mettre false pour ne jouer qu'avec les listes locales
  url: "https://fr.wiktionary.org/w/api.php", // API MediaWiki (même famille que Motus)
  timeoutMs: 8000,
  syncIntervalMs: 10 * 60 * 1000, // pas plus d'un enrichissement toutes les 10 min
  requestsPerCategory: 3,
  prefixLetters: "abcdefghijlmnoprstv",
  maxPerCategory: 1500, // taille max du cache par catégorie
  maxCachedPerGame: 30, // nombre max de mots du cache proposés au tirage d'une partie
  // identifiant de catégorie du jeu → catégorie MediaWiki (seule « verbes » est réellement thématique)
  categoryMap: { verbes: "Verbes en français" },
};

// ── Catégories et listes de secours ─────────────────────────

const split = (s) => s.split(/\s+/).filter(Boolean);

export const CATEGORIES = [
  {
    id: "animaux", label: "Animaux", emoji: "🦁",
    words: split(`chat chien lion tigre ours loup renard cerf lapin cheval vache mouton chevre cochon singe zebre
      girafe elephant dauphin baleine requin tortue serpent lezard grenouille aigle hibou corbeau canard poule
      souris hamster ecureuil herisson blaireau chameau kangourou panda koala crocodile gorille pingouin phoque
      morse sanglier belier taureau perroquet cygne mouette pigeon escargot papillon abeille fourmi araignee salamandre
      coccinelle hippopotame rhinoceros`),
  },
  {
    id: "cuisine", label: "Cuisine", emoji: "🍳",
    words: split(`casserole poele fourchette couteau cuillere assiette verre bol saladier passoire fouet louche
      spatule marmite cocotte four plaque grill mixeur balance minuteur torchon eponge planche rouleau econome
      tamis entonnoir cafetiere bouilloire theiere moule ramequin faitout couvercle cuisson recette mijoter
      hacher eplucher melanger gratin tablier gant evier frigo hotte plat tasse carafe jatte alimentation`),
  },
  {
    id: "nourriture", label: "Nourriture", emoji: "🥖",
    words: split(`pain fromage beurre lait yaourt jambon saucisse poulet poisson riz pates pizza gateau chocolat
      biscuit miel confiture oeuf soupe crepe tarte glace bonbon sucre sel poivre farine croissant baguette
      sandwich burger frites omelette raclette fondue lasagne cereales muesli brioche pudding gaufre beignet
      nougat caramel steak rosbif saumon thon alimentation`),
  },
  {
    id: "fruits", label: "Fruits", emoji: "🍓",
    words: split(`pomme poire banane fraise cerise orange citron abricot peche prune raisin melon kiwi ananas
      mangue framboise myrtille mure figue datte noix noisette amande grenade litchi papaye goyave clementine
      mandarine pamplemousse nectarine framboisier pasteque cassis groseille coing olive avocat physalis cranberry`),
  },
  {
    id: "legumes", label: "Légumes", emoji: "🥕",
    words: split(`carotte tomate poireau courgette aubergine navet radis salade chou brocoli celeri oignon ail
      poivron concombre epinard haricot lentille endive fenouil betterave panais citrouille potiron courge
      artichaut asperge cresson mais pois champignon patate persil rutabaga laitue echalote topinambour
      salsifis blette alimentation`),
  },
  {
    id: "verbes", label: "Verbes", emoji: "🏃",
    words: split(`manger boire dormir courir sauter nager lire ecrire chanter danser jouer marcher parler ecouter
      regarder penser rire pleurer aimer ouvrir fermer prendre donner porter lancer attraper construire
      dessiner peindre cuisiner voyager travailler apprendre comprendre chercher trouver gagner perdre
      grimper tomber glisser cacher rouler tourner voler plonger discuter rever imaginer decouvrir accomplir`),
  },
  {
    id: "nature", label: "Nature", emoji: "🌿",
    words: split(`arbre fleur foret riviere montagne ocean mer lac plage sable roche pierre colline vallee prairie
      desert ile volcan glacier cascade ruisseau etang marais falaise grotte nuage pluie neige orage vent
      soleil lune etoile brume rosee herbe mousse feuille branche racine champ jungle savane tempete rocher
      source sentier clairiere bruyere fougere lierre environnement`),
  },
  {
    id: "objets", label: "Objets", emoji: "🔑",
    words: split(`table chaise lampe livre stylo crayon cahier ciseaux clef montre horloge miroir tableau valise
      sac parapluie lunettes bougie coussin tapis rideau telephone ordinateur clavier ecran enveloppe boite
      panier seau marteau tournevis ballon cadeau bouteille carte regle gomme trousse lettre timbre bracelet
      collier chapeau echelle ficelle aiguille ventilateur`),
  },
];

// ── Normalisation ───────────────────────────────────────────

/**
 * Majuscules, sans accents ni caractères spéciaux.
 * Retourne "" si le mot contient un espace, un trait d'union, une apostrophe,
 * un chiffre, etc. (ces mots sont écartés plutôt que « réparés »).
 */
export function normalizeWord(raw) {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  if (!s || /[\s\-'’.0-9]/.test(s)) return "";
  const w = s
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return /^[A-Z]+$/.test(w) ? w : "";
}

export function isValidWord(w, min = MIN_WORD_LEN, max = MAX_WORD_LEN) {
  return typeof w === "string" && /^[A-Z]+$/.test(w) && w.length >= min && w.length <= max;
}

function uniqueValid(list) {
  const set = new Set();
  for (const raw of list || []) {
    const w = normalizeWord(raw);
    if (isValidWord(w)) set.add(w);
  }
  return [...set];
}

/** Listes de secours normalisées : { categoryId: [MOTS] } */
export const FALLBACK_WORDS = Object.fromEntries(CATEGORIES.map((c) => [c.id, uniqueValid(c.words)]));

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

// ── Cache (clé distincte de la sauvegarde de partie) ────────

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function loadCache() {
  const empty = { version: 1, lastSync: 0, words: {} };
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
    const data = raw ? JSON.parse(raw) : null;
    if (!isObject(data) || !isObject(data.words)) return empty;
    const words = {};
    for (const [id, list] of Object.entries(data.words)) {
      if (getCategory(id) && Array.isArray(list)) words[id] = uniqueValid(list);
    }
    return { version: 1, lastSync: Number(data.lastSync) || 0, words };
  } catch {
    return empty; // cache corrompu : on repart d'un cache vide
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return true;
  } catch {
    return false; // quota / navigation privée : le jeu reste jouable
  }
}

/** Ajoute des mots au cache d'une catégorie. Retourne le nombre de mots ajoutés. */
export function addWordsToCache(categoryId, words) {
  if (!getCategory(categoryId)) return 0;
  const cache = loadCache();
  const set = new Set(cache.words[categoryId] || []);
  const known = new Set(FALLBACK_WORDS[categoryId]);
  let added = 0;
  for (const raw of words) {
    const w = normalizeWord(raw);
    if (!isValidWord(w) || set.has(w) || known.has(w)) continue;
    if (set.size >= API_CONFIG.maxPerCategory) break;
    set.add(w);
    added++;
  }
  cache.words[categoryId] = [...set];
  saveCache(cache);
  return added;
}

// ── Enrichissement en ligne (non bloquant, ne lève jamais d'erreur) ─

function randomPrefix() {
  const L = API_CONFIG.prefixLetters;
  const pick = () => L[Math.floor(Math.random() * L.length)];
  return pick() + pick();
}

async function fetchCategoryTitles(mwCategory, prefix) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    list: "categorymembers",
    cmtitle: "Catégorie:" + mwCategory,
    cmnamespace: "0",
    cmtype: "page",
    cmlimit: "200",
    cmsort: "sortkey",
    cmstartsortkeyprefix: prefix,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);
  try {
    const res = await fetch(`${API_CONFIG.url}?${params}`, { signal: controller.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    return (json?.query?.categorymembers || []).map((m) => m.title);
  } finally {
    clearTimeout(timer);
  }
}

let syncInFlight = null;

/** À appeler sans await. Retourne { added, offline?, skipped?, failed? }. */
export function enrichCache({ force = false } = {}) {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    try {
      if (!API_CONFIG.enabled || !API_CONFIG.url) return { added: 0, skipped: true };
      const entries = Object.entries(API_CONFIG.categoryMap || {});
      if (entries.length === 0) return { added: 0, skipped: true };
      if (!force && Date.now() - loadCache().lastSync < API_CONFIG.syncIntervalMs) {
        return { added: 0, skipped: true };
      }
      let online = false;
      try {
        online = await checkRealConnection();
      } catch {
        online = false;
      }
      if (!online) return { added: 0, offline: true };

      let added = 0;
      let anyOk = false;
      for (const [catId, mwCat] of entries) {
        const jobs = [];
        for (let i = 0; i < API_CONFIG.requestsPerCategory; i++) {
          jobs.push(fetchCategoryTitles(mwCat, randomPrefix()));
        }
        const settled = await Promise.allSettled(jobs);
        const titles = [];
        for (const s of settled) {
          if (s.status === "fulfilled") {
            anyOk = true;
            titles.push(...s.value);
          }
        }
        added += addWordsToCache(catId, titles);
      }
      if (!anyOk) return { added: 0, failed: true };
      const cache = loadCache();
      cache.lastSync = Date.now();
      saveCache(cache);
      return { added };
    } catch {
      return { added: 0, failed: true };
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

// ── Pool de mots d'une catégorie ────────────────────────────

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Secours + un petit échantillon du cache (pour garder des mots courants). */
export function getWordPool(categoryId) {
  const set = new Set(FALLBACK_WORDS[categoryId] || []);
  const cached = shuffle(loadCache().words[categoryId] || []).slice(0, API_CONFIG.maxCachedPerGame);
  for (const w of cached) if (isValidWord(w)) set.add(w);
  return [...set];
}

// ── Génération de la grille ─────────────────────────────────

/** 8 directions : [dLigne, dColonne] */
export const DIRS = [
  [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1],
];

/** Pose les mots (du plus long au plus court) avec un placement glouton aléatoire. */
function layoutWords(words, N, rng) {
  const grid = Array.from({ length: N }, () => Array(N).fill(""));
  const placed = [];
  for (const word of words) {
    const len = word.length;
    let cands = [];
    let maxFresh = 0;
    for (const [dr, dc] of DIRS) {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const er = r + dr * (len - 1);
          const ec = c + dc * (len - 1);
          if (er < 0 || er >= N || ec < 0 || ec >= N) continue;
          let ok = true;
          let fresh = 0;
          for (let i = 0; i < len; i++) {
            const ch = grid[r + dr * i][c + dc * i];
            if (ch === "") fresh++;
            else if (ch !== word[i]) {
              ok = false;
              break;
            }
          }
          if (!ok || fresh === 0) continue; // fresh === 0 : mot entièrement recouvert, refusé
          if (fresh > maxFresh) maxFresh = fresh;
          cands.push({ r, c, dr, dc, fresh });
        }
      }
    }
    cands = cands.filter((p) => p.fresh >= maxFresh - GREEDY_SLACK);
    if (cands.length === 0) return null;
    const p = cands[Math.floor(rng() * cands.length)];
    for (let i = 0; i < len; i++) grid[p.r + p.dr * i][p.c + p.dc * i] = word[i];
    placed.push({ word, row: p.r, col: p.c, dr: p.dr, dc: p.dc });
  }
  return { grid, placed };
}

/** Nombre d'occurrences d'un mot dans la grille (8 directions). */
function countOccurrences(grid, word) {
  const N = grid.length;
  const len = word.length;
  let n = 0;
  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const er = r + dr * (len - 1);
        const ec = c + dc * (len - 1);
        if (er < 0 || er >= N || ec < 0 || ec >= N) continue;
        let ok = true;
        for (let i = 0; i < len; i++) {
          if (grid[r + dr * i][c + dc * i] !== word[i]) {
            ok = false;
            break;
          }
        }
        if (ok) n++;
      }
    }
  }
  return n;
}

export function wordCells(w) {
  return Array.from({ length: w.word.length }, (_, i) => [w.row + w.dr * i, w.col + w.dc * i]);
}

function tryOnce(pool, N, rng) {
  const usable = pool.filter((w) => w.length <= N);
  if (usable.length < WORDS_IN_GRID + 1) return null;
  // Le mot final est volontairement long de 11 lettres; les cases restantes
  // sont remplies par des lettres aléatoires, indépendamment du mot final.
  const finals = pool.filter((w) => w.length === 11);
  if (finals.length === 0) return null;
  const chosen = shuffle(usable.filter((w) => w.length !== 11 || !finals.includes(w)), rng).slice(0, WORDS_IN_GRID);
  chosen.sort((a, b) => b.length - a.length);
  const layout = layoutWords(chosen, N, rng);
  if (!layout) return null;

  const { grid, placed } = layout;
  const free = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] === "") free.push([r, c]);
  // Exactement 11 cases libres distinctes portent les lettres du mot mystère.
  if (free.length < 11) return null;
  const used = new Set(chosen);
  const finalWord = finals.filter((w) => !used.has(w))[Math.floor(rng() * finals.filter((w) => !used.has(w)).length)];
  if (!finalWord) return null;
  const finalCells = shuffle(free, rng).slice(0, 11);
  const finalKey = new Set(finalCells.map(([r, c]) => r * N + c));
  const alphabet = "EEEE AAAAA IIIII SSSSS NNNNN RRRRR TTTTT LLLLL UUUUU OOOO CCCC MMPPPP DDDD GGH H B V F Q Y X J K Z".replace(/\s/g, "");
  const out = grid.map((row) => row.slice());
  const finalLetters = shuffle(finalWord.split(""), rng);
  finalCells.forEach(([r, c], i) => { out[r][c] = finalLetters[i]; });
  for (const [r, c] of free) if (!finalKey.has(r * N + c)) out[r][c] = alphabet[Math.floor(rng() * alphabet.length)];

  // Chaque mot caché doit exister exactement une fois (pas de doublon fortuit).
  for (const p of placed) if (countOccurrences(out, p.word) !== 1) return null;

  return {
    size: N,
    grid: out.map((row) => row.join("")),
    words: placed,
    finalWord,
    finalCells,
  };
}

/**
 * Construit une partie complète : { categoryId, categoryLabel, size, grid, words, finalWord, finalCells }.
 * Retourne null si la génération échoue (le jeu affiche alors une erreur avec « Réessayer »).
 * @param {{avoidCategory?: string, rng?: () => number}} opts
 */
export function buildPuzzle({ avoidCategory = null, rng = Math.random } = {}) {
  const order = shuffle(CATEGORIES.filter((c) => c.id !== avoidCategory), rng);
  if (avoidCategory) order.push(getCategory(avoidCategory));
  let tries = 0;
  for (const cat of order) {
    if (!cat || tries++ >= MAX_CATEGORY_TRIES) break;
    const pool = getWordPool(cat.id);
    if (pool.length < WORDS_IN_GRID + 1) continue; // liste insuffisante : autre catégorie
    for (const N of GRID_SIZES) {
      for (let a = 0; a < ATTEMPTS_PER_SIZE; a++) {
        const res = tryOnce(pool, N, rng);
        if (res) return { categoryId: cat.id, categoryLabel: cat.label, ...res };
      }
    }
  }
  return null;
}
