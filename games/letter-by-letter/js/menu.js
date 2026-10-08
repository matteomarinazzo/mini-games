import { LENGTHS, ATTEMPTS } from "./logic.js";
import { load, saveSettings } from "./storage.js";
import { enrichCache } from "./words.js";

const form = document.getElementById("setupForm");
const lengthBox = document.getElementById("lengthChoices");
const attemptBox = document.getElementById("attemptChoices");
const summary = document.getElementById("summary");

const data = load();

function plural(n, one, many) {
  return n + " " + (n > 1 ? many : one);
}

// ── Longueur : 4 à 8 lettres + nombre de parties jouées ─────
lengthBox.innerHTML = LENGTHS.map((len) => {
  const stats = data.stats[len];
  const checked = len === data.settings.length ? "checked" : "";
  return `
    <label class="choice">
      <input type="radio" name="length" value="${len}" ${checked}
             aria-label="${len} lettres, ${plural(stats.played, "partie jouée", "parties jouées")}, ${plural(stats.won, "victoire", "victoires")}">
      <span class="choice-face">
        <span class="choice-num">${len}</span>
        <span class="choice-unit">lettres</span>
        <span class="choice-played"><strong>${stats.played}</strong> ${stats.played > 1 ? "parties" : "partie"}</span>
      </span>
    </label>`;
}).join("");

// ── Essais : 4 à 8 ──────────────────────────────────────────
attemptBox.innerHTML = ATTEMPTS.map((n) => {
  const checked = n === data.settings.attempts ? "checked" : "";
  return `
    <label class="choice">
      <input type="radio" name="attempts" value="${n}" ${checked} aria-label="${n} essais">
      <span class="choice-face">
        <span class="choice-num">${n}</span>
        <span class="choice-unit">essais</span>
      </span>
    </label>`;
}).join("");

function selected(name) {
  return Number(form.querySelector(`input[name="${name}"]:checked`).value);
}

function updateSummary() {
  summary.innerHTML =
    `Mot de <strong>${selected("length")} lettres</strong> en <strong>${selected("attempts")} essais</strong>`;
}

form.addEventListener("change", updateSummary);
updateSummary();

// ── Démarrer la partie ──────────────────────────────────────
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const length = selected("length");
  const attempts = selected("attempts");

  saveSettings(length, attempts); // mémorise les derniers réglages dans "letter-by-letter"
  try {
    sessionStorage.setItem("letterByLetterConfig", JSON.stringify({ length, attempts }));
  } catch {
    /* sessionStorage indisponible : game.js retombera sur les derniers réglages */
  }
  window.location.href = "game.html";
});

// ── Enrichissement du cache de mots : jamais bloquant, jamais redirigé ──
enrichCache().catch(() => { });
