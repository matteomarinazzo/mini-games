import {
  playLetterbyLetterSound,
  toggleSound,
  getSoundEnabled,
} from "../../../js/utils/audio.js";
import {
  LENGTHS,
  ATTEMPTS,
  normalizeWord,
  isValidWord,
  evaluateGuess,
} from "./logic.js";
import { load, recordResult } from "./storage.js";
import { pickWord, enrichCache } from "./words.js";

// ═══════════════════════════════════════════════════
// CONFIGURATION (transmise par le menu via sessionStorage,
// sinon derniers réglages enregistrés dans "letter-by-letter")
// ═══════════════════════════════════════════════════
function readConfig() {
  let c = null;
  try {
    c = JSON.parse(sessionStorage.getItem("letterByLetterConfig"));
  } catch {
    c = null;
  }
  const saved = load().settings;
  const length = LENGTHS.includes(Number(c?.length)) ? Number(c.length) : saved.length;
  const attempts = ATTEMPTS.includes(Number(c?.attempts)) ? Number(c.attempts) : saved.attempts;
  return { length, attempts };
}

const config = readConfig();

// ═══════════════════════════════════════════════════
// DOM
// ═══════════════════════════════════════════════════
const $ = (id) => document.getElementById(id);
const el = {
  app: $("app"),
  board: $("board"),
  boardArea: $("boardArea"),
  message: $("message"),
  keyboard: $("keyboard"),
  modeLabel: $("modeLabel"),
  attempts: $("attempts"),
  attemptsCount: $("attemptsCount"),
  pips: $("pips"),
  pauseBtn: $("pauseBtn"),
  pauseModal: $("pauseModal"),
  resumeBtn: $("resumeBtn"),
  newGameBtn: $("newGameBtn"),
  menuPauseBtn: $("menuPauseBtn"),
  soundToggle: $("soundToggle"),
  endModal: $("endModal"),
  endTitle: $("endTitle"),
  endText: $("endText"),
  endWord: $("endWord"),
  replayBtn: $("replayBtn"),
  menuBtn: $("menuBtn"),
  endBar: $("endBar"),
  endBarText: $("endBarText"),
  endBarReplay: $("endBarReplay"),
  endBarMenu: $("endBarMenu"),
};

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const REVEAL_STEP = REDUCED_MOTION ? 120 : 260; // délai entre deux lettres
const REVEAL_FLIP = REDUCED_MOTION ? 0 : 240; // moment du changement de couleur dans la rotation

const KEY_ROWS = ["AZERTYUIOP", "QSDFGHJKLM"];
const STATE_RANK = { absent: 1, present: 2, correct: 3 };
const STATE_LABEL = {
  correct: "bien placée",
  present: "mal placée",
  absent: "absente",
};

// ═══════════════════════════════════════════════════
// ÉTAT
// ═══════════════════════════════════════════════════
let state = null;
let tiles = []; // tiles[row][col] → élément
let rowEls = [];
let keyEls = {};
let timers = [];
let messageTimer = null;
let activeModal = null;
let lastFocus = null;

function later(fn, ms) {
  const id = setTimeout(fn, ms);
  timers.push(id);
  return id;
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

// ═══════════════════════════════════════════════════
// NOUVELLE PARTIE
// ═══════════════════════════════════════════════════
function newGame() {
  clearTimers();
  const previous = state?.word ?? null;
  state = {
    word: pickWord(config.length, previous),
    rows: Array.from({ length: config.attempts }, () => new Array(config.length).fill("")),
    row: 0,
    busy: false, // animation de révélation en cours
    finished: false,
    won: false,
    recorded: false, // garantit un seul enregistrement par partie
    keyStatus: {},
  };

  closeModal(el.pauseModal, false);
  closeModal(el.endModal, false);
  el.endBar.hidden = true;
  el.keyboard.hidden = false;
  el.pauseBtn.disabled = false;

  el.modeLabel.textContent = `${config.length} lettres · ${config.attempts} essais`;
  buildBoard();
  resetKeyboard();
  updateAttempts();
  setMessage("");
}

function buildBoard() {
  el.board.innerHTML = "";
  el.board.style.setProperty("--cols", config.length);
  tiles = [];
  rowEls = [];

  for (let r = 0; r < config.attempts; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    rowEl.setAttribute("role", "row");
    rowEl.setAttribute("aria-label", `Essai ${r + 1}`);
    const rowTiles = [];
    for (let c = 0; c < config.length; c++) {
      const t = document.createElement("div");
      t.className = "tile";
      t.setAttribute("role", "gridcell");
      t.setAttribute("aria-label", "vide");
      t.addEventListener("click", () => onTileClick(r, c));
      rowEl.appendChild(t);
      rowTiles.push(t);
    }
    el.board.appendChild(rowEl);
    tiles.push(rowTiles);
    rowEls.push(rowEl);
  }
  markCurrentRow();
  fitBoard();
}

function markCurrentRow() {
  rowEls.forEach((r, i) => r.classList.toggle("current", !state.finished && i === state.row));
}

// Adapte la taille des cases à l'espace disponible
function fitBoard() {
  if (!state) return;
  const gap = 6;
  const w = el.boardArea.clientWidth - 8;
  const h = el.boardArea.clientHeight - 36; // place du message
  const byW = (w - (config.length - 1) * gap) / config.length;
  const byH = (h - (config.attempts - 1) * gap) / config.attempts;
  const size = Math.max(24, Math.floor(Math.min(byW, byH, 68)));
  document.documentElement.style.setProperty("--tile", size + "px");
}
window.addEventListener("resize", fitBoard);

// ═══════════════════════════════════════════════════
// CLAVIER VIRTUEL (AZERTY)
// ═══════════════════════════════════════════════════
function buildKeyboard() {
  el.keyboard.innerHTML = "";
  keyEls = {};

  const makeKey = (label, { value = label, cls = "", aria = null } = {}) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "key " + cls;
    b.textContent = label;
    b.dataset.key = value;
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("click", () => onVirtualKey(value));
    return b;
  };

  KEY_ROWS.forEach((letters) => {
    const row = document.createElement("div");
    row.className = "key-row";
    for (const ch of letters) {
      const k = makeKey(ch, { aria: ch });
      keyEls[ch] = k;
      row.appendChild(k);
    }
    el.keyboard.appendChild(row);
  });

  const last = document.createElement("div");
  last.className = "key-row";
  last.appendChild(makeKey("Valider", { value: "ENTER", cls: "wide enter", aria: "Valider la proposition" }));
  for (const ch of "WXCVBN") {
    const k = makeKey(ch, { aria: ch });
    keyEls[ch] = k;
    last.appendChild(k);
  }
  last.appendChild(makeKey("⌫", { value: "BACK", cls: "wide", aria: "Effacer la dernière lettre" }));
  el.keyboard.appendChild(last);
}

function resetKeyboard() {
  Object.values(keyEls).forEach((k) => {
    delete k.dataset.state;
    k.setAttribute("aria-label", k.textContent);
  });
}

function updateKeyboard(guess, result) {
  for (let i = 0; i < guess.length; i++) {
    const letter = guess[i];
    const prev = state.keyStatus[letter];
    if (!prev || STATE_RANK[result[i]] > STATE_RANK[prev]) {
      state.keyStatus[letter] = result[i];
    }
  }
  for (const [letter, status] of Object.entries(state.keyStatus)) {
    const k = keyEls[letter];
    if (!k) continue;
    k.dataset.state = status;
    k.setAttribute("aria-label", `${letter}, ${STATE_LABEL[status]}`);
  }
}

// ═══════════════════════════════════════════════════
// SAISIE
// ═══════════════════════════════════════════════════
function inputLocked() {
  return !state || state.busy || state.finished || activeModal !== null;
}

function onVirtualKey(value) {
  if (value === "ENTER") submit();
  else if (value === "BACK") backspace();
  else addLetter(value);
}

function paintTile(r, c) {
  const t = tiles[r][c];
  const letter = state.rows[r][c];
  t.textContent = letter;
  t.classList.toggle("filled", letter !== "");
  t.setAttribute("aria-label", letter || "vide");
}

// La lettre va dans la première case libre de la ligne actuelle
function addLetter(letter) {
  if (inputLocked()) return;
  const row = state.rows[state.row];
  const idx = row.indexOf("");
  if (idx === -1) return;
  row[idx] = letter;
  paintTile(state.row, idx);
  const t = tiles[state.row][idx];
  t.classList.remove("pop");
  void t.offsetWidth; // relance l'animation
  t.classList.add("pop");
  setMessage("");
}

// Efface la dernière lettre saisie (clavier physique / touche ⌫)
function backspace() {
  if (inputLocked()) return;
  const row = state.rows[state.row];
  for (let i = row.length - 1; i >= 0; i--) {
    if (row[i] !== "") {
      row[i] = "";
      paintTile(state.row, i);
      return;
    }
  }
}

// Appui sur une case occupée de la ligne actuelle : on l'efface
function onTileClick(r, c) {
  if (inputLocked() || r !== state.row) return;
  if (state.rows[r][c] === "") return;
  state.rows[r][c] = "";
  paintTile(r, c);
  setMessage("");
}

function setMessage(text, duration = 2200) {
  clearTimeout(messageTimer);
  el.message.textContent = text;
  if (text && duration) {
    messageTimer = setTimeout(() => (el.message.textContent = ""), duration);
  }
}

function shakeRow(r) {
  const rowEl = rowEls[r];
  rowEl.classList.remove("shake");
  void rowEl.offsetWidth;
  rowEl.classList.add("shake");
}

// ═══════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════
function submit() {
  if (inputLocked()) return;

  const letters = state.rows[state.row];
  if (letters.includes("")) {
    shakeRow(state.row);
    setMessage("Mot incomplet");
    return;
  }

  // Même règle de normalisation que pour les mots tirés au sort
  const guess = normalizeWord(letters.join(""));
  if (!isValidWord(guess, config.length)) {
    shakeRow(state.row);
    setMessage("Caractères non valides");
    return;
  }

  const rowIndex = state.row;
  const result = evaluateGuess(guess, state.word);
  const won = result.every((s) => s === "correct");

  state.row++;
  state.busy = true;
  markCurrentRow();

  const lost = !won && state.row >= config.attempts;
  if (won || lost) {
    state.finished = true;
    state.won = won;
    // Enregistré immédiatement et une seule fois (recorded) : fermer la page
    // pendant l'animation ne fait pas perdre la partie.
    if (!state.recorded) {
      state.recorded = true;
      recordResult(config.length, won);
    }
    el.pauseBtn.disabled = true;
    markCurrentRow();
  }
  updateAttempts();

  revealRow(rowIndex, guess, result, () => {
    updateKeyboard(guess, result);
    if (state.finished) {
      later(() => finishGame(rowIndex), 350);
    } else {
      state.busy = false;
    }
  });
}

function revealRow(r, guess, result, done) {
  result.forEach((status, i) => {
    later(() => {
      const t = tiles[r][i];
      t.classList.remove("pop", "flip");
      void t.offsetWidth;
      t.classList.add("flip");
      later(() => {
        t.dataset.state = status;
        t.setAttribute("aria-label", `${guess[i]}, ${STATE_LABEL[status]}`);
        playLetterbyLetterSound(status, i);
      }, REVEAL_FLIP);
    }, i * REVEAL_STEP);
  });
  later(done, result.length * REVEAL_STEP + REVEAL_FLIP + 260);
}

// ═══════════════════════════════════════════════════
// ESSAIS RESTANTS
// ═══════════════════════════════════════════════════
function updateAttempts() {
  const left = config.attempts - state.row;
  el.attemptsCount.textContent = left;
  el.attempts.classList.toggle("low", left <= 1 && !state.finished);
  el.attempts.setAttribute("aria-label", `${left} essai${left > 1 ? "s" : ""} restant${left > 1 ? "s" : ""} sur ${config.attempts}`);
  el.pips.innerHTML = "";
  for (let i = 0; i < config.attempts; i++) {
    const p = document.createElement("span");
    p.className = "pip" + (i < state.row ? " used" : "");
    el.pips.appendChild(p);
  }
}

// ═══════════════════════════════════════════════════
// FIN DE PARTIE
// ═══════════════════════════════════════════════════
function finishGame(lastRow) {
  state.busy = false;
  const used = lastRow + 1;
  const modalCard = el.endModal.querySelector(".modal-card");
  modalCard.classList.toggle("win", state.won);

  let text;
  if (state.won) {
    playLetterbyLetterSound("win");
    el.endTitle.textContent = "Victoire !";
    text = `Bravo ! Vous avez trouvé le mot en ${used} essai${used > 1 ? "s" : ""}.`;
  } else {
    playLetterbyLetterSound("lose");
    el.endTitle.textContent = "Perdu…";
    text = `Le mot recherché était : ${state.word}`;
  }
  el.endText.textContent = text;
  el.endBarText.textContent = text;

  el.endWord.className = "end-word" + (state.won ? "" : " lost");
  el.endWord.innerHTML = "";
  for (const ch of state.word) {
    const s = document.createElement("span");
    s.textContent = ch;
    el.endWord.appendChild(s);
  }

  openModal(el.endModal, el.replayBtn);
}

function showEndBar() {
  el.keyboard.hidden = true;
  el.endBar.hidden = false;
  el.endBarReplay.focus();
}

// ═══════════════════════════════════════════════════
// MODALES (inert sur l'app + focus piégé + Échap)
// ═══════════════════════════════════════════════════
function openModal(modal, focusEl) {
  lastFocus = document.activeElement;
  activeModal = modal;
  modal.hidden = false;
  el.app.inert = true;
  (focusEl || modal.querySelector("button")).focus();
}

function closeModal(modal, restoreFocus = true) {
  if (modal.hidden) return;
  modal.hidden = true;
  if (activeModal === modal) activeModal = null;
  el.app.inert = false;
  if (restoreFocus && lastFocus && document.contains(lastFocus) && !lastFocus.disabled) {
    lastFocus.focus();
  }
}

function openPause() {
  if (!state || state.busy || state.finished || activeModal) return;
  openModal(el.pauseModal, el.resumeBtn);
}

function goToMenu() {
  window.location.href = "index.html";
}

function trapTab(e, modal) {
  const focusables = [...modal.querySelectorAll("button:not([disabled])")];
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// ═══════════════════════════════════════════════════
// SON (système global audio.js : clé mg_sound partagée avec les autres jeux)
// ═══════════════════════════════════════════════════
function renderSoundButton() {
  const on = getSoundEnabled();
  el.soundToggle.setAttribute("aria-pressed", String(on));
}

// ═══════════════════════════════════════════════════
// ÉVÉNEMENTS
// ═══════════════════════════════════════════════════
function setupControls() {
  el.pauseBtn.addEventListener("click", openPause);
  el.resumeBtn.addEventListener("click", () => closeModal(el.pauseModal));
  // Nouvelle partie : nouveau mot, même configuration (la partie en cours n'est pas comptée)
  el.newGameBtn.addEventListener("click", newGame);
  el.menuPauseBtn.addEventListener("click", goToMenu);
  el.soundToggle.addEventListener("click", () => {
    toggleSound();
    renderSoundButton();
  });

  el.replayBtn.addEventListener("click", newGame);
  el.endBarReplay.addEventListener("click", newGame);
  el.menuBtn.addEventListener("click", goToMenu);
  el.endBarMenu.addEventListener("click", goToMenu);

  // Clic sur le fond d'une modale = fermeture "douce"
  el.pauseModal.addEventListener("click", (e) => {
    if (e.target === el.pauseModal) closeModal(el.pauseModal);
  });
  el.endModal.addEventListener("click", (e) => {
    if (e.target === el.endModal) {
      closeModal(el.endModal);
      showEndBar();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Escape") {
      if (activeModal === el.pauseModal) {
        e.preventDefault();
        closeModal(el.pauseModal);
      } else if (activeModal === el.endModal) {
        e.preventDefault();
        closeModal(el.endModal, false);
        showEndBar();
      } else {
        openPause();
      }
      return;
    }

    if (activeModal) {
      if (e.key === "Tab") trapTab(e, activeModal);
      return; // pas de saisie dans la grille derrière une modale
    }

    // Sur un bouton focalisé, Entrée / Espace appartiennent au bouton (évite le double déclenchement)
    const onButton = e.target instanceof HTMLButtonElement;
    if ((e.key === "Enter" || e.key === " ") && onButton) return;

    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      backspace();
    } else if (e.key.length === 1) {
      // Même normalisation que partout : é → E, ç → C… ; les autres caractères sont ignorés
      const letter = normalizeWord(e.key);
      if (/^[A-Z]$/.test(letter)) {
        e.preventDefault();
        addLetter(letter);
      }
    }
  });
}

// ═══════════════════════════════════════════════════
// DÉMARRAGE
// ═══════════════════════════════════════════════════
buildKeyboard();
setupControls();
renderSoundButton();
newGame();

// Enrichissement du cache de mots en arrière-plan : n'attend pas, ne redirige jamais.
// Hors ligne ou en cas d'échec, la partie utilise la liste de secours + le cache existant.
enrichCache().catch(() => { });