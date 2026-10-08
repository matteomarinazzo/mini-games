// ─────────────────────────────────────────────
// MOTS CROISÉS — logique du jeu
//
// Sauvegarde : localStorage "crossword" (partie en cours uniquement).
// Cache de mots : "crossword_word_cache" (géré par words.js).
// Chronomètre : on ne stocke que le temps écoulé (elapsedMs), jamais une date
// de départ, donc rien n'avance quand la page est fermée, cachée ou en pause.
// ─────────────────────────────────────────────
import {
  DIRS,
  WORDS_IN_GRID,
  FINAL_MIN_LEN,
  FINAL_MAX_LEN,
  buildPuzzle,
  enrichCache,
  getCategory,
  normalizeWord,
  wordCells,
} from "./words.js";

const SAVE_KEY = "crossword";
const SAVE_VERSION = 1;
const MIN_SIZE = 8;
const MAX_SIZE = 30;

const $ = (id) => document.getElementById(id);
const el = {
  grid: $("grid"),
  timer: $("timerValue"),
  category: $("categoryBadge"),
  progress: $("progressText"),
  selText: $("selectionText"),
  message: $("message"),
  wordList: $("wordList"),
  clearBtn: $("clearBtn"),
  validateBtn: $("validateBtn"),
  finalPanel: $("finalPanel"),
  finalInfo: $("finalInfo"),
  finalLetters: $("finalLetters"),
  finalInput: $("finalInput"),
  finalBtn: $("finalBtn"),
};
const overlays = {
  rules: $("rulesOverlay"),
  pause: $("pauseOverlay"),
  resume: $("resumeOverlay"),
  win: $("winOverlay"),
  error: $("errorOverlay"),
};

// ── État ────────────────────────────────────────────────────

let game = null; // partie courante (voir newGameState)
let cells = []; // éléments DOM des cases, index = r * size + c
let lastCategoryId = null;
let lastTick = null; // horodatage du dernier tick (null = ne pas compter)
let blocking = 0; // nombre de fenêtres bloquantes ouvertes (règles, reprise, erreur, victoire)

// Gestes sur la grille
let pointerActive = false;
let startCell = null;
let dragging = false;

function newGameState(p) {
  const letters = p.finalCells.map(([r, c]) => p.grid[r][c]);
  return {
    version: SAVE_VERSION,
    categoryId: p.categoryId,
    categoryLabel: p.categoryLabel,
    size: p.size,
    grid: p.grid,
    words: p.words, // [{word,row,col,dr,dc}] : coordonnées exactes des mots cachés
    found: [], // indices des mots trouvés
    finalWord: p.finalWord,
    finalCells: p.finalCells,
    finalLetters: letters, // ordre d'affichage (mélangé)
    selection: [], // [[r,c],...]
    elapsedMs: 0,
    paused: false,
    phase: "search", // "search" | "final" | "won"
  };
}

// ── Sauvegarde ──────────────────────────────────────────────

function save() {
  if (!game) return;
  try {
    if (game.phase === "won") localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify({ ...game, savedAt: Date.now() }));
  } catch {
    /* quota / navigation privée : le jeu reste jouable */
  }
}

function isInt(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

/** Vérifie une sauvegarde lue : retourne l'état propre ou null si invalide / ancienne version. */
function validateSave(raw) {
  try {
    if (!raw || typeof raw !== "object" || raw.version !== SAVE_VERSION) return null;
    const N = raw.size;
    if (!isInt(N, MIN_SIZE, MAX_SIZE)) return null;
    if (!Array.isArray(raw.grid) || raw.grid.length !== N) return null;
    if (!raw.grid.every((row) => typeof row === "string" && row.length === N)) return null;
    if (!getCategory(raw.categoryId)) return null;
    if (!Array.isArray(raw.words) || raw.words.length !== WORDS_IN_GRID) return null;

    for (const w of raw.words) {
      if (!w || typeof w.word !== "string" || w.word.length < 2) return null;
      if (!isInt(w.row, 0, N - 1) || !isInt(w.col, 0, N - 1)) return null;
      if (!DIRS.some(([a, b]) => a === w.dr && b === w.dc)) return null;
      const cs = wordCells(w);
      if (cs.length !== w.word.length) return null;
      for (let i = 0; i < cs.length; i++) {
        const [r, c] = cs[i];
        if (r < 0 || r >= N || c < 0 || c >= N) return null;
        if (raw.grid[r][c] !== w.word[i]) return null;
      }
    }
    if (typeof raw.finalWord !== "string") return null;
    if (raw.finalWord.length < FINAL_MIN_LEN || raw.finalWord.length > FINAL_MAX_LEN) return null;
    if (!Array.isArray(raw.finalCells) || raw.finalCells.length !== raw.finalWord.length) return null;
    const finalCells = [];
    const finalSeen = new Set();
    for (const cell of raw.finalCells) {
      if (!Array.isArray(cell) || cell.length !== 2 || !isInt(cell[0], 0, N - 1) || !isInt(cell[1], 0, N - 1)) return null;
      const [r, c] = cell;
      const k = r * N + c;
      if (finalSeen.has(k)) return null;
      finalSeen.add(k);
      finalCells.push([r, c]);
    }
    const a = finalCells.map(([r, c]) => raw.grid[r][c]).sort().join("");
    const b = raw.finalWord.split("").sort().join("");
    if (a !== b) return null;

    const found = Array.isArray(raw.found)
      ? [...new Set(raw.found.filter((i) => isInt(i, 0, WORDS_IN_GRID - 1)))]
      : [];
    const selection = Array.isArray(raw.selection)
      ? raw.selection.filter((p) => Array.isArray(p) && isInt(p[0], 0, N - 1) && isInt(p[1], 0, N - 1)).map((p) => [p[0], p[1]])
      : [];
    const phase = found.length === WORDS_IN_GRID ? "final" : "search";
    return {
      version: SAVE_VERSION,
      categoryId: raw.categoryId,
      categoryLabel: getCategory(raw.categoryId).label,
      size: N,
      grid: raw.grid,
      words: raw.words.map((w) => ({ word: w.word, row: w.row, col: w.col, dr: w.dr, dc: w.dc })),
      found,
      finalWord: raw.finalWord,
      finalCells,
      finalLetters: finalCells.map(([r, c]) => raw.grid[r][c]),
      selection: phase === "search" && isStraightSelection(selection) ? selection : [],
      elapsedMs: Number.isFinite(raw.elapsedMs) && raw.elapsedMs >= 0 ? Math.floor(raw.elapsedMs) : 0,
      paused: raw.paused === true,
      phase,
    };
  } catch {
    return null;
  }
}

function loadSave() {
  try {
    const txt = localStorage.getItem(SAVE_KEY);
    if (!txt) return null;
    const data = validateSave(JSON.parse(txt));
    if (!data) localStorage.removeItem(SAVE_KEY); // sauvegarde corrompue ou ancienne : on la jette
    return data;
  } catch {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

// ── Chronomètre ─────────────────────────────────────────────

function isRunning() {
  return !!game && game.phase !== "won" && !game.paused && blocking === 0 && !document.hidden;
}

function tick() {
  const now = Date.now();
  if (isRunning()) {
    if (lastTick !== null) game.elapsedMs += Math.min(now - lastTick, 2000); // plafonne les sauts
    lastTick = now;
  } else {
    lastTick = null;
  }
  renderTimer();
}

/** Ajoute le temps écoulé jusqu'à maintenant (avant une pause, une sauvegarde, la fermeture). */
function flushTime() {
  if (game && lastTick !== null && isRunning()) {
    const now = Date.now();
    game.elapsedMs += Math.min(now - lastTick, 2000);
    lastTick = now;
  }
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function renderTimer() {
  if (game) el.timer.textContent = formatTime(game.elapsedMs);
}

// ── Fenêtres ────────────────────────────────────────────────

function openOverlay(name) {
  if (overlays[name].classList.contains("open")) return;
  flushTime();
  overlays[name].classList.add("open");
  if (name !== "pause") blocking++;
  lastTick = null;
  const btn = overlays[name].querySelector("button.btn-sky, .modal-close");
  if (btn) btn.focus();
}

function closeOverlay(name) {
  if (!overlays[name].classList.contains("open")) return;
  overlays[name].classList.remove("open");
  if (name !== "pause") blocking = Math.max(0, blocking - 1);
  lastTick = Date.now();
}

function pauseGame() {
  if (!game || game.phase === "won" || game.paused) return;
  flushTime();
  game.paused = true;
  el.grid.classList.add("paused");
  openOverlay("pause");
  save();
}

function resumeGame() {
  if (!game) return;
  game.paused = false;
  el.grid.classList.remove("paused");
  closeOverlay("pause");
  lastTick = Date.now();
  save();
}

// ── Rendu ───────────────────────────────────────────────────

const key = (r, c) => r + "," + c;

function hueFor(i) {
  return (i * 36 + 150) % 360;
}

function buildGridDom() {
  const N = game.size;
  el.grid.style.setProperty("--n", N);
  el.grid.innerHTML = "";
  cells = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const d = document.createElement("div");
      d.className = "cell";
      d.dataset.r = r;
      d.dataset.c = c;
      d.textContent = game.grid[r][c];
      el.grid.appendChild(d);
      cells.push(d);
    }
  }
}

function buildWordListDom() {
  el.wordList.innerHTML = "";
  game.words.forEach((w, i) => {
    const li = document.createElement("li");
    li.id = "w" + i;
    li.textContent = w.word;
    li.style.setProperty("--h", hueFor(i));
    el.wordList.appendChild(li);
  });
}

function renderAll() {
  const N = game.size;
  // 1. cases : état « trouvé » (couleur du dernier mot), « restant », « sélection »
  cells.forEach((d) => {
    d.classList.remove("found", "sel", "left", "bad");
    d.style.removeProperty("--h");
  });
  game.found.forEach((i) => {
    for (const [r, c] of wordCells(game.words[i])) {
      const d = cells[r * N + c];
      d.classList.add("found");
      d.style.setProperty("--h", hueFor(i));
    }
  });
  if (game.phase !== "search") {
    for (const [r, c] of game.finalCells) cells[r * N + c].classList.add("left");
  }
  for (const [r, c] of game.selection) cells[r * N + c].classList.add("sel");

  // 2. liste des mots
  game.words.forEach((_, i) => $("w" + i).classList.toggle("found", game.found.includes(i)));

  // 3. en-tête, sélection, mot final
  const cat = getCategory(game.categoryId);
  el.category.textContent = `Catégorie : ${cat ? cat.emoji + " " : ""}${game.categoryLabel}`;
  el.progress.textContent = `${game.found.length} / ${WORDS_IN_GRID} mots`;
  renderSelectionText();
  renderFinalPanel();
  renderTimer();
}

function renderSelectionText() {
  const txt = game.selection.map(([r, c]) => game.grid[r][c]).join("");
  const searching = game.phase === "search";
  el.selText.textContent = txt || (searching ? "Glisse sur un mot ou touche les lettres" : "Trouve le mot final !");
  el.selText.classList.toggle("idle", !txt);
  el.validateBtn.disabled = !searching || game.selection.length < 2;
  el.clearBtn.disabled = game.selection.length === 0;
}

function renderFinalPanel() {
  const show = game.phase === "final";
  el.finalPanel.hidden = !show;
  if (!show) return;
  const n = game.finalLetters.length;
  el.finalInfo.textContent =
    `Les ${n} lettres qui restent (encadrées dans la grille) forment un mot de la catégorie ` +
    `« ${game.categoryLabel} ». Réordonne-les pour le retrouver !`;
  el.finalLetters.innerHTML = "";
  for (const l of game.finalLetters) {
    const s = document.createElement("span");
    s.textContent = l;
    el.finalLetters.appendChild(s);
  }
  el.finalInput.maxLength = n;
  el.finalInput.placeholder = `${n} lettres`;
}

function say(text, kind = "") {
  el.message.textContent = text;
  el.message.className = "message " + kind;
}

// ── Sélection ───────────────────────────────────────────────

function isStraightSelection(sel) {
  if (sel.length < 2) return true;
  const dr = sel[1][0] - sel[0][0];
  const dc = sel[1][1] - sel[0][1];
  if (!DIRS.some(([a, b]) => a === dr && b === dc)) return false;
  return sel.every((p, i) => p[0] === sel[0][0] + dr * i && p[1] === sel[0][1] + dc * i);
}

function setSelection(sel) {
  game.selection = sel;
  for (const d of cells) d.classList.remove("sel");
  for (const [r, c] of sel) cells[r * game.size + c].classList.add("sel");
  renderSelectionText();
  save(); // sauvegarde après chaque lettre sélectionnée
}

/** Ligne droite de `start` vers `end`, alignée sur la direction (parmi 8) la plus proche. */
function lineBetween(start, end) {
  const N = game.size;
  const dy = end[0] - start[0];
  const dx = end[1] - start[1];
  if (dx === 0 && dy === 0) return [start];
  const oct = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)); // -4..4
  const [dr, dc] = [
    [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1],
  ][((oct % 8) + 8) % 8];
  let steps = dr !== 0 && dc !== 0 ? Math.min(Math.abs(dx), Math.abs(dy)) : Math.max(Math.abs(dx), Math.abs(dy));
  if (dr !== 0 && dc !== 0 && steps === 0) steps = Math.max(Math.abs(dx), Math.abs(dy)); // diag. approx.
  const line = [];
  for (let i = 0; i <= steps; i++) {
    const r = start[0] + dr * i;
    const c = start[1] + dc * i;
    if (r < 0 || r >= N || c < 0 || c >= N) break;
    line.push([r, c]);
  }
  return line;
}

function cellFromEvent(e) {
  const rect = el.grid.getBoundingClientRect();
  const N = game.size;
  const cs = getComputedStyle(el.grid);
  const pad = parseFloat(cs.paddingLeft) || 0;
  const inner = rect.width - pad * 2;
  const c = Math.floor(((e.clientX - rect.left - pad) / inner) * N);
  const r = Math.floor(((e.clientY - rect.top - pad) / inner) * N);
  if (r < 0 || r >= N || c < 0 || c >= N) return null;
  return [r, c];
}

/** Tap lettre par lettre : ajoute la case si elle prolonge la sélection, sinon recommence. */
function handleTap(cell) {
  const sel = game.selection;
  const idx = sel.findIndex((p) => p[0] === cell[0] && p[1] === cell[1]);
  if (idx === sel.length - 1 && idx >= 0) return setSelection(sel.slice(0, -1)); // retap = annule la dernière
  if (idx >= 0) return setSelection([cell]);
  if (sel.length === 0) return setSelection([cell]);
  const next = [...sel, cell];
  if (sel.length === 1) {
    const dr = cell[0] - sel[0][0];
    const dc = cell[1] - sel[0][1];
    if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) return setSelection(next); // voisine directe
    return setSelection([cell]);
  }
  const dr = sel[1][0] - sel[0][0];
  const dc = sel[1][1] - sel[0][1];
  const last = sel[sel.length - 1];
  if (cell[0] === last[0] + dr && cell[1] === last[1] + dc) return setSelection(next); // case suivante
  setSelection([cell]);
}

function onPointerDown(e) {
  if (!game || game.phase !== "search" || game.paused || blocking > 0) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  e.preventDefault();
  pointerActive = true;
  dragging = false;
  startCell = cell;
  try {
    el.grid.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

function onPointerMove(e) {
  if (!pointerActive) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  if (!dragging && cell[0] === startCell[0] && cell[1] === startCell[1]) return;
  dragging = true;
  const line = lineBetween(startCell, cell);
  if (JSON.stringify(line) !== JSON.stringify(game.selection)) setSelection(line);
}

function onPointerUp() {
  if (!pointerActive) return;
  pointerActive = false;
  if (dragging) {
    dragging = false;
    validateSelection(); // glisser : validation automatique au relâchement
  } else if (startCell) {
    handleTap(startCell); // simple tap : sélection lettre par lettre
  }
  startCell = null;
}

function onPointerCancel() {
  pointerActive = false;
  dragging = false;
  startCell = null;
}

// ── Validation ──────────────────────────────────────────────

function sameCells(a, b) {
  return a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);
}

function validateSelection() {
  if (!game || game.phase !== "search") return;
  const sel = game.selection;
  if (sel.length < 2) {
    setSelection([]);
    return;
  }
  // Seules les coordonnées exactes des mots cachés comptent (pas une séquence fortuite).
  let hit = -1;
  game.words.forEach((w, i) => {
    if (game.found.includes(i)) return;
    const cs = wordCells(w);
    if (sameCells(sel, cs) || sameCells(sel, cs.slice().reverse())) hit = i;
  });

  if (hit < 0) {
    const bad = sel.map(([r, c]) => cells[r * game.size + c]);
    bad.forEach((d) => d.classList.add("bad"));
    say("Ce n'est pas un des mots de la liste.", "err");
    setTimeout(() => bad.forEach((d) => d.classList.remove("bad")), 350);
    setTimeout(() => setSelection([]), 350);
    return;
  }

  game.found.push(hit);
  game.selection = [];
  if (game.found.length === WORDS_IN_GRID) {
    game.phase = "final";
    say(`Les 10 mots sont trouvés ! Découvre le mot final (${game.finalWord.length} lettres).`, "ok");
  } else {
    say(`« ${game.words[hit].word} » trouvé !`, "ok");
  }
  renderAll();
  save();
  if (game.phase === "final") el.finalPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function submitFinal() {
  if (!game || game.phase !== "final") return;
  const guess = normalizeWord(el.finalInput.value);
  if (guess === game.finalWord) return win();
  el.finalPanel.classList.remove("shake");
  void el.finalPanel.offsetWidth; // relance l'animation
  el.finalPanel.classList.add("shake");
  say(guess ? "Ce n'est pas le bon mot, réessaie !" : "Saisis ton mot final.", "err");
}

function win() {
  flushTime();
  game.phase = "won";
  $("winCategory").textContent = game.categoryLabel;
  $("winWord").textContent = game.finalWord;
  $("winTime").textContent = formatTime(game.elapsedMs);
  save(); // phase "won" : supprime la sauvegarde
  openOverlay("win");
}

// ── Nouvelle partie / reprise ───────────────────────────────

function startNewGame() {
  closeOverlay("pause");
  closeOverlay("resume");
  closeOverlay("win");
  closeOverlay("error");
  say("Génération de la grille…");
  // setTimeout : laisse le navigateur afficher le message avant le calcul
  setTimeout(() => {
    let p = null;
    try {
      p = buildPuzzle({ avoidCategory: lastCategoryId });
    } catch (err) {
      console.error("Génération échouée :", err);
    }
    if (!p) {
      game = game && game.phase !== "won" ? game : null;
      $("errorText").textContent =
        "Impossible de générer une grille pour le moment (liste de mots insuffisante ?). Réessaie.";
      openOverlay("error");
      return;
    }
    lastCategoryId = p.categoryId;
    game = newGameState(p);
    el.grid.classList.remove("paused");
    el.finalInput.value = "";
    buildGridDom();
    buildWordListDom();
    renderAll();
    say("");
    lastTick = Date.now();
    save();
  }, 30);
}

function loadGame(state) {
  game = state;
  lastCategoryId = state.categoryId;
  el.finalInput.value = "";
  buildGridDom();
  buildWordListDom();
  renderAll();
  say("");
  if (game.paused) {
    el.grid.classList.add("paused");
    openOverlay("pause"); // la partie était en pause : on la laisse en pause
  } else {
    el.grid.classList.remove("paused");
    lastTick = Date.now();
  }
}

function goMenu() {
  flushTime();
  save();
  window.location.href = "../../index.html";
}

// ── Événements ──────────────────────────────────────────────

el.grid.addEventListener("pointerdown", onPointerDown);
el.grid.addEventListener("pointermove", onPointerMove);
el.grid.addEventListener("pointerup", onPointerUp);
el.grid.addEventListener("pointercancel", onPointerCancel);
el.grid.addEventListener("contextmenu", (e) => e.preventDefault());

el.clearBtn.addEventListener("click", () => game && setSelection([]));
el.validateBtn.addEventListener("click", validateSelection);
el.finalBtn.addEventListener("click", submitFinal);
el.finalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitFinal();
});

$("pauseBtn").addEventListener("click", pauseGame);
$("resumeBtn").addEventListener("click", resumeGame);
$("restartPauseBtn").addEventListener("click", startNewGame);
$("menuPauseBtn").addEventListener("click", goMenu);

$("rulesBtn").addEventListener("click", () => openOverlay("rules"));
$("rulesClose").addEventListener("click", () => closeOverlay("rules"));
overlays.rules.addEventListener("click", (e) => {
  if (e.target === overlays.rules) closeOverlay("rules");
});

$("resumeSaveBtn").addEventListener("click", () => {
  const saved = pendingSave;
  pendingSave = null;
  closeOverlay("resume");
  if (saved) loadGame(saved);
  else startNewGame();
});
$("newGameBtn").addEventListener("click", () => {
  pendingSave = null;
  startNewGame();
});

$("winRestartBtn").addEventListener("click", startNewGame);
$("winMenuBtn").addEventListener("click", goMenu);
$("errorRetryBtn").addEventListener("click", startNewGame);
$("errorMenuBtn").addEventListener("click", goMenu);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (overlays.rules.classList.contains("open")) closeOverlay("rules");
  else if (overlays.pause.classList.contains("open")) resumeGame();
  else pauseGame();
});

// Le temps ne doit pas avancer quand la page est cachée ou fermée.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    flushTime();
    lastTick = null;
    save();
  } else {
    lastTick = Date.now();
  }
});
window.addEventListener("pagehide", () => {
  flushTime();
  save();
});

setInterval(tick, 250);
setInterval(() => {
  if (isRunning()) save(); // filet de sécurité : le temps écoulé est enregistré régulièrement
}, 5000);

// ── Démarrage ───────────────────────────────────────────────

let pendingSave = null;

function init() {
  enrichCache(); // enrichissement du cache sans bloquer (hors ligne : ignoré)
  const saved = loadSave();
  if (saved) {
    pendingSave = saved;
    $("resumeInfo").textContent =
      `Catégorie « ${saved.categoryLabel} » – ${saved.found.length} / ${WORDS_IN_GRID} mots trouvés – ` +
      `temps : ${formatTime(saved.elapsedMs)}. Veux-tu reprendre ta partie ?`;
    el.timer.textContent = formatTime(saved.elapsedMs);
    openOverlay("resume");
  } else {
    startNewGame();
  }
}

init();
