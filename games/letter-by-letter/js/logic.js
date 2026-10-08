// ─────────────────────────────────────────────
// LETTER BY LETTER — logique pure (sans DOM, sans stockage)
// Une seule règle de normalisation pour les mots tirés au sort,
// les mots du cache et les propositions du joueur.
// ─────────────────────────────────────────────

export const LENGTHS = [4, 5, 6, 7, 8];
export const ATTEMPTS = [4, 5, 6, 7, 8];

/**
 * Normalise un mot : minuscules, œ→oe, æ→ae, accents retirés, majuscules.
 * « Éléphant » → « ELEPHANT ». Ne filtre rien : voir isValidWord().
 */
export function normalizeWord(input) {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/** Mot valide = uniquement A-Z (donc ni espace, ni tiret, ni apostrophe, ni chiffre) et bonne longueur. */
export function isValidWord(word, length) {
  if (typeof word !== "string" || !/^[A-Z]+$/.test(word)) return false;
  return length == null || word.length === length;
}

/** Titre de dictionnaire acceptable : minuscules françaises uniquement (rejette noms propres, tirets, espaces…). */
export function isCommonWordTitle(title) {
  return typeof title === "string" && /^[a-zàâäçéèêëîïôöùûüÿœæ]+$/.test(title);
}

/**
 * Évalue une proposition. Retourne un tableau de "correct" | "present" | "absent".
 * Lettres répétées : on marque d'abord les vertes, puis on n'accorde
 * d'orange que dans la limite des occurrences restantes dans le mot cible.
 */
export function evaluateGuess(guess, target) {
  const n = target.length;
  const result = new Array(n).fill("absent");
  const remaining = {};

  for (let i = 0; i < n; i++) {
    if (guess[i] === target[i]) {
      result[i] = "correct";
    } else {
      remaining[target[i]] = (remaining[target[i]] || 0) + 1;
    }
  }
  for (let i = 0; i < n; i++) {
    if (result[i] === "correct") continue;
    if (remaining[guess[i]] > 0) {
      result[i] = "present";
      remaining[guess[i]]--;
    }
  }
  return result;
}
