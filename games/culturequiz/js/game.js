/**
  * CultureQuiz – game.js
    *
 * Quiz de culture générale: réponds à 10, 15 ou 20 questions, le plus vite
  * possible.Les bonnes réponses rapportent de 100 à 10 points selon le temps.
 *
 * Architecture réseau / stockage alignée sur Mindplay: Mots:
 * - cache local indépendant du réseau;
 * - imports Firebase et network.js dynamiques;
 * - vérification réelle de connexion;
 * - synchronisation des records en arrière - plan, avec délais limités.
 */

// ─────────────────────────────────────────────
// 1. CONFIG
// ─────────────────────────────────────────────

const FORMATS = [10, 15, 20];
const POINTS_MAX = 100;
const POINTS_MIN = 10;
const SCORE_TIME_MAX_MS = 30000;
const CACHE_KEY = 'culture-quiz';
const FB_GAME = 'culture_quiz';
const FB_KEY_PREFIX = Object.freeze({ 10: 'score_10', 15: 'score_15', 20: 'score_20' });
const QUESTIONS_URL = new URL('../data/questions.json', import.meta.url);
const MENU_URL = '../../index.html';
const NETWORK_CHECK_TIMEOUT_MS = 2500;
const NETWORK_READ_TIMEOUT_MS = 2500;
const NETWORK_WRITE_TIMEOUT_MS = 4000;
const MESSAGE_MAX = 50;

// ─────────────────────────────────────────────
// 2. ÉTAT / DOM / CACHE
// ─────────────────────────────────────────────

let state = 'ready'; // ready | running | paused | over
let cache = loadCache();
let records = normaliseRecords(cache.records);
let worldBest = normaliseRecords(cache.worldBest);
let fb = null;
let net = null;
let runId = 0;
let pendingRecord = null;
let onlineReady = Promise.resolve();

const $ = (id) => typeof document === 'undefined' ? null : document.getElementById(id);
const game = {
  count: 10,
  categories: [],
  categoriesInfo: [],
  questions: [],
  deck: [],
  index: 0,
  score: 0,
  correct: 0,
  elapsed: 0,
  questionElapsed: 0,
  answered: false,
  raf: 0,
  last: 0,
  recordFormat: 10
};

function loadCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function saveCache(patch) {
  cache = { ...cache, ...patch };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    console.log('Stockage local indisponible : le quiz continue sans sauvegarde persistante.');
  }
}

function wait(ms, value) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = String(value ?? '');
}

function setOpen(id, open) {
  const el = $(id);
  if (el) el.classList.toggle('open', Boolean(open));
}

function closeOverlays() {
  ['setupOverlay', 'rulesOverlay', 'pauseOverlay', 'gameoverOverlay', 'recordsOverlay']
    .forEach(id => setOpen(id, false));
  const popup = $('recordMessagePopup');
  if (popup) popup.style.display = 'none';
}

// ─────────────────────────────────────────────
// 3. RECORDS (outils)
// ─────────────────────────────────────────────

function emptyRecord() {
  return { score: 0, time: 0 };
}

function normRecord(record) {
  if (!record || typeof record !== 'object') return emptyRecord();
  return {
    score: Math.max(0, Number(record.score) || 0),
    time: Math.max(0, Number(record.time) || 0)
  };
}

function normaliseRecords(value) {
  const result = {};
  FORMATS.forEach(format => {
    result[format] = normRecord(value?.[format]);
  });
  return result;
}

function parseRemote(data) {
  if (typeof data === 'number') {
    return { ...emptyRecord(), score: Math.max(0, data), message: '', timestamp: 0 };
  }
  if (!data || typeof data !== 'object') {
    return { ...emptyRecord(), message: '', timestamp: 0 };
  }
  return {
    ...normRecord({ score: data.value, time: data.duration }),
    message: String(data.message || '').slice(0, MESSAGE_MAX),
    timestamp: Number(data.timestamp) || 0
  };
}

function isBetter(a, b) {
  const candidate = normRecord(a);
  const best = normRecord(b);
  return candidate.score > best.score ||
    (candidate.score === best.score && candidate.score > 0 && candidate.time < best.time);
}

function fmtTime(ms) {
  const value = Math.max(0, Number(ms) || 0);
  const seconds = Math.floor(value / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')},${Math.floor(value % 1000 / 100)}`;
}

// ─────────────────────────────────────────────
// 4. QUESTIONS
// ─────────────────────────────────────────────

function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[’'\`]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(le|la|les|l|un|une)\s+/, '')
    .replace(/\s+/g, ' ');
}

function scoreForSeconds(seconds) {
  const elapsed = Math.min(Math.max(Number(seconds) || 0, 0), SCORE_TIME_MAX_MS / 1000);
  return Math.round(POINTS_MAX - (POINTS_MAX - POINTS_MIN) * elapsed / (SCORE_TIME_MAX_MS / 1000));
}

function drawUnique(items, count) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.slice(0, Math.max(0, count));
}

function enoughQuestions(questions, count, categories = []) {
  const selected = new Set(categories);
  return questions.filter(q => !selected.size || selected.has(q.category)).length >= count;
}

function validQuestions(raw) {
  const seen = new Set();
  const types = new Set(['choix_multiple', 'vrai_faux', 'reponse_libre']);
  return (Array.isArray(raw) ? raw : []).filter(q => {
    if (!q || !q.id || seen.has(q.id) || !q.question || !types.has(q.type) || q.answer === undefined) return false;
    if (q.type === 'choix_multiple' && (!Array.isArray(q.choices) || q.choices.length < 2)) return false;
    seen.add(q.id);
    return true;
  });
}

function selectedQuestions() {
  const set = new Set(game.categories);
  return game.questions.filter(q => !set.size || set.has(q.category));
}

function categoryInfo(id) {
  return game.categoriesInfo?.find(c => c.id === id) || { label: id, emoji: '❓' };
}

function answerLabel(question) {
  return question.type === 'vrai_faux'
    ? (question.answer ? 'Vrai' : 'Faux')
    : question.answer;
}

function typeLabel(question) {
  return question.type === 'choix_multiple'
    ? 'Choix multiple'
    : question.type === 'vrai_faux' ? 'Vrai ou faux' : 'Réponse libre';
}

function matches(question, value) {
  if (question.type === 'vrai_faux') {
    return Boolean(value === true || value === 'true' || value === 'Vrai') === Boolean(question.answer);
  }
  if (question.type === 'choix_multiple') return String(value) === String(question.answer);
  return [question.answer, ...(Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [])]
    .some(answer => normalizeAnswer(answer) === normalizeAnswer(value));
}

async function loadQuestions() {
  const response = await fetch(QUESTIONS_URL);
  if (!response.ok) throw new Error('questions.json inaccessible');
  const data = await response.json();
  game.categoriesInfo = Array.isArray(data.categories) ? data.categories : [];
  game.questions = validQuestions(data.questions);
  buildCategories();
  updateAvailability();
}

function buildCategories() {
  const wrap = $('catChips');
  if (!wrap) return;
  wrap.replaceChildren();

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip all';
  all.dataset.category = '*';
  all.append(document.createTextNode('🌐 Tout'));
  wrap.append(all);

  const used = new Set(game.questions.map(q => q.category));
  game.categoriesInfo.filter(c => used.has(c.id)).forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.category = category.id;
    button.append(document.createTextNode(`${category.emoji || ''} ${category.label}`));
    wrap.append(button);
  });

  game.categories = [];
  updateCategories();
  wrap.addEventListener('click', event => {
    const button = event.target.closest('.chip');
    if (!button) return;
    if (button.dataset.category === '*') {
      game.categories = [];
    } else {
      const selected = new Set(game.categories);
      selected.has(button.dataset.category)
        ? selected.delete(button.dataset.category)
        : selected.add(button.dataset.category);
      game.categories = [...selected];
    }
    updateCategories();
  });
}

function updateCategories() {
  document.querySelectorAll('#catChips .chip').forEach(button => {
    button.classList.toggle('active',
      button.dataset.category === '*' ? !game.categories.length : game.categories.includes(button.dataset.category));
  });
  updateAvailability();
}

function updateAvailability() {
  const available = selectedQuestions().length;
  const ok = available >= game.count;
  setText('availLine',
    `${available} question${available > 1 ? 's' : ''} disponible${available > 1 ? 's' : ''}${ok ? '' : ' — choisis un autre format ou une autre catégorie'}`);
  const line = $('availLine');
  if (line) line.classList.toggle('warn', !ok);
  const play = $('playBtn');
  if (play) play.disabled = !ok;
  document.querySelectorAll('#countSeg [data-count]').forEach(button => {
    const count = Number(button.dataset.count);
    button.classList.toggle('active', count === game.count);
    button.setAttribute('aria-checked', count === game.count ? 'true' : 'false');
  });
}

// ─────────────────────────────────────────────
// 5. DÉROULEMENT
// ─────────────────────────────────────────────

function renderQuestion() {
  const question = game.deck[game.index];
  if (!question) return;
  game.questionElapsed = 0;
  game.answered = false;

  $('panel')?.classList.remove('answered');
  clearFeedback();
  setText('qBadge', `${categoryInfo(question.category).emoji || ''} ${categoryInfo(question.category).label}`);
  setText('qType', typeLabel(question));
  setText('qText', question.question);
  setText('qPts', `⚡ ${POINTS_MAX} pts`);
  setText('qValue', `${game.index + 1}/${game.count}`);

  const answers = $('answers');
  if (!answers) return;
  answers.replaceChildren();
  answers.className = 'answers';
  const fill = $('qTimerFill');
  if (fill) fill.style.width = '0%';

  if (question.type === 'reponse_libre') {
    const box = document.createElement('div');
    box.className = 'free';
    const input = document.createElement('input');
    input.className = 'free-input';
    input.id = 'freeInput';
    input.type = 'text';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Réponse');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-sky';
    button.id = 'submitFree';
    button.textContent = 'Valider';
    box.append(input, button);
    answers.append(box);
    button.addEventListener('click', () => submitAnswer(input.value));
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') submitAnswer(input.value);
    });
    setTimeout(() => input.focus(), 0);
    return;
  }

  const values = question.type === 'vrai_faux' ? [true, false] : drawUnique(question.choices, question.choices.length);
  if (question.type === 'vrai_faux') answers.classList.add('tf');
  values.forEach((value, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ans';
    button.dataset.value = String(value);
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = String(index + 1);
    const text = document.createElement('span');
    text.className = 'ans-text';
    text.textContent = question.type === 'vrai_faux' ? (value ? 'Vrai' : 'Faux') : String(value);
    button.append(key, text);
    answers.append(button);
  });
}

function clearFeedback() {
  const feedback = $('feedback');
  if (!feedback) return;
  feedback.replaceChildren();
  feedback.className = 'feedback';
  feedback.hidden = true;
  $('questionActions')?.setAttribute('hidden', '');
}

function renderFeedback(question, ok, points) {
  const feedback = $('feedback');
  if (!feedback) return;
  feedback.replaceChildren();
  feedback.className = `feedback show ${ok ? 'good' : 'bad'}`;
  feedback.hidden = false;
  $('questionActions')?.removeAttribute('hidden');

  const title = document.createElement('div');
  title.className = 'fb-title';
  title.textContent = ok ? '✅ Bonne réponse !' : '❌ Mauvaise réponse';

  const line = document.createElement('div');
  line.className = 'fb-line';
  line.textContent = `Bonne réponse : ${answerLabel(question)}${ok ? ` · +${points} points` : ''}`;
  feedback.append(title, line);

  if (question.explanation) {
    const explanation = document.createElement('div');
    explanation.className = 'fb-line fb-expl';
    explanation.textContent = question.explanation;
    feedback.append(explanation);
  }

  // Le bouton Continuer est fixe dans le HTML ; son listener est délégué une seule fois.

}

function submitAnswer(value) {
  if (state !== 'running' || game.answered) return;
  const question = game.deck[game.index];
  if (!question) return;

  game.answered = true;
  const ok = matches(question, value);
  const points = ok ? scoreForSeconds(game.questionElapsed / 1000) : 0;
  if (ok) {
    game.correct += 1;
    game.score += points;
  }

  $('panel')?.classList.add('answered');
  $('answers')?.querySelectorAll('button').forEach(button => { button.disabled = true; });
  renderFeedback(question, ok, points);
  setText('scoreValue', game.score);

  $('answers')?.querySelectorAll('.ans').forEach(button => {
    const buttonValue = question.type === 'vrai_faux' ? button.dataset.value === 'true' : button.dataset.value;
    button.classList.toggle('ok', matches(question, buttonValue));
    if (!ok && String(buttonValue) === String(value)) button.classList.add('bad');
    if (!matches(question, buttonValue)) button.classList.add('dim');
  });
}

function nextQuestion() {
  if (!game.answered) return;
  if (game.index + 1 >= game.count) {
    clearFeedback();
    finishGame();
  } else {
    game.index += 1;
    renderQuestion();
  }
}

// ─────────────────────────────────────────────
// 6. FLUX DE JEU
// ─────────────────────────────────────────────

function startGame() {
  const pool = selectedQuestions();
  if (pool.length < game.count) return;

  closeOverlays();
  clearFeedback();
  runId += 1;
  pendingRecord = null;
  game.deck = drawUnique(pool, game.count);
  game.index = 0;
  game.score = 0;
  game.correct = 0;
  game.elapsed = 0;
  game.questionElapsed = 0;
  state = 'running';
  game.last = performance.now();
  setText('scoreValue', 0);
  setText('timeValue', '0:00');
  renderQuestion();
  loop(game.last);
}

function pauseGame(open = true) {
  if (state !== 'running') return;
  state = 'paused';
  clearFeedback();
  cancelAnimationFrame(game.raf);
  $('panel')?.classList.add('veiled');
  if (open) setOpen('pauseOverlay', true);
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'running';
  game.last = performance.now();
  $('panel')?.classList.remove('veiled');
  setOpen('pauseOverlay', false);
  loop(game.last);
}

function finishGame() {
  if (state !== 'running') return;
  state = 'over';
  clearFeedback();
  cancelAnimationFrame(game.raf);

  const result = { score: game.score, time: Math.round(game.elapsed) };
  const old = records[game.count];
  const personal = isBetter(result, old);
  if (personal) {
    records[game.count] = normRecord(result);
    saveCache({ records });
  }

  setText('goEmoji', personal ? '🏆' : '🎉');
  setText('goTitle', personal ? 'Nouveau record !' : 'Partie terminée');
  setText('goCorrect', `${game.correct}/${game.count}`);
  setText('goScore', game.score);
  setText('goDuration', fmtTime(result.time));
  setText('goAvg', `${(result.time / 1000 / game.count).toFixed(1).replace('.', ',')} s`);
  setText('goBestLabel', `Meilleur score (${game.count})`);
  setText('goBest', `${records[game.count].score} pts`);
  setText('goMessage', personal ? 'Ton record local est sauvegardé.' : '');
  setOpen('gameoverOverlay', true);

  // La partie est terminée : la synchronisation ne bloque jamais l'écran.
  void checkWorldRecord(result, runId, game.count);
}

function update(dt) {
  if (state !== 'running' || game.answered) return;
  game.elapsed += dt;
  game.questionElapsed += dt;
  setText('timeValue', fmtTime(game.elapsed));

  const fill = $('qTimerFill');
  if (fill) fill.style.width = `${Math.min(100, game.questionElapsed / SCORE_TIME_MAX_MS * 100)}%`;
  setText('qPts', `⚡ ${scoreForSeconds(game.questionElapsed / 1000)} pts`);
}

function loop(now) {
  if (state !== 'running') return;
  const dt = Math.min(250, Math.max(0, now - game.last));
  game.last = now;
  update(dt);
  game.raf = requestAnimationFrame(loop);
}

// ─────────────────────────────────────────────
// 7. RECORDS EN LIGNE — même architecture que Mindplay : Mots
// ─────────────────────────────────────────────

async function isOnline() {
  try {
    if (!net || typeof net.checkRealConnection !== 'function') return false;
    return Boolean(await Promise.race([
      Promise.resolve().then(() => net.checkRealConnection()),
      wait(NETWORK_CHECK_TIMEOUT_MS, false)
    ]));
  } catch {
    return false;
  }
}

async function refreshWorldRecord(format) {
  try {
    if (!FORMATS.includes(Number(format)) || !fb || !(await isOnline())) return false;

    const data = await Promise.race([
      Promise.resolve().then(() => fb.getFirebaseRecordData(FB_GAME, FB_KEY_PREFIX[format])),
      wait(NETWORK_READ_TIMEOUT_MS, null)
    ]);

    // Un timeout ou une lecture ambiguë ne doit jamais écraser le cache local.
    if (data == null) {
      if (worldBest[format].score > 0) return false;
      worldBest[format] = emptyRecord();
      saveCache({ worldBest });
      return true;
    }

    const remote = parseRemote(data);
    worldBest[format] = { score: remote.score, time: remote.time };
    saveCache({
      worldBest,
      worldMessages: { ...(cache.worldMessages || {}), [format]: remote.message || '' }
    });
    return true;
  } catch (error) {
    console.warn('CultureQuiz : lecture du record mondial impossible.', error);
    return false;
  }
}

async function initOnline() {
  try {
    [fb, net] = await Promise.all([
      import('../../../js/firebaseWrk.js'),
      import('../../../js/network.js')
    ]);
    // Comme dans Mindplay : Mots, l'initialisation réseau reste en arrière-plan.
    if (await isOnline()) {
      await Promise.all(FORMATS.map(format => refreshWorldRecord(format)));
    }
  } catch (error) {
    // Le mode hors ligne est normal : aucune erreur réseau ne bloque le quiz.
    console.warn('CultureQuiz : mode hors ligne.', error);
  }
}

async function checkWorldRecord(result, myRun, format) {
  setText('goWorldStatus', 'Vérification du record mondial…');
  try {
    await Promise.race([onlineReady, wait(NETWORK_CHECK_TIMEOUT_MS)]);
    if (myRun !== runId) return;

    if (!fb || !(await isOnline())) {
      setText('goWorldStatus', 'Hors ligne : tes records personnels restent sauvegardés.');
      return;
    }

    const fresh = await Promise.race([
      refreshWorldRecord(format),
      wait(NETWORK_READ_TIMEOUT_MS, false)
    ]);
    if (myRun !== runId) return;
    if (!fresh) {
      setText('goWorldStatus', 'Record mondial indisponible pour le moment.');
      return;
    }

    if (isBetter(result, worldBest[format])) {
      pendingRecord = { ...normRecord(result), format, runId: myRun };
      setText('goEmoji', '🏆');
      setText('goTitle', 'Record mondial potentiel !');
      setText('goWorldStatus', 'Tu pourrais détenir le record mondial !');
      const popup = $('recordMessagePopup');
      if (popup) popup.style.display = 'flex';
      const input = $('recordMsgInput');
      if (input) input.value = '';
      setText('recordCharCounter', `0/${MESSAGE_MAX}`);
      setTimeout(() => $('recordMsgInput')?.focus(), 100);
    } else {
      setText('goWorldStatus', `Record mondial : ${worldBest[format].score} pts · ${fmtTime(worldBest[format].time)}`);
    }
  } catch (error) {
    console.warn('CultureQuiz : vérification du record mondial impossible.', error);
    if (myRun === runId) setText('goWorldStatus', 'Record mondial indisponible pour le moment.');
  }
}

async function saveRecordMessage() {
  const record = pendingRecord;
  if (!record || !fb || record.runId !== runId) return;

  const button = $('saveRecordMsgBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Enregistrement…';
  }

  let published = false;
  let beaten = false;
  try {
    if (!(await isOnline())) throw new Error('Connexion indisponible');

    const fresh = await Promise.race([
      refreshWorldRecord(record.format),
      wait(NETWORK_READ_TIMEOUT_MS, false)
    ]);

    if (fresh && !isBetter(record, worldBest[record.format])) {
      beaten = true;
    } else {
      const message = String($('recordMsgInput')?.value || '').trim().slice(0, MESSAGE_MAX);
      const response = await Promise.race([
        Promise.resolve().then(() => fb.setFirebaseLeaderboard(
          FB_GAME,
          FB_KEY_PREFIX[record.format],
          {
            value: record.score,
            duration: record.time,
            message,
            timestamp: Date.now()
          }
        )),
        wait(NETWORK_WRITE_TIMEOUT_MS, false)
      ]);
      published = response === true;

      if (published) {
        worldBest[record.format] = { score: record.score, time: record.time };
        const worldMessages = { ...(cache.worldMessages || {}), [record.format]: message };
        saveCache({ worldBest, worldMessages });
      }
    }
  } catch (error) {
    console.warn('CultureQuiz : publication du record impossible.', error);
  }

  setText('goWorldStatus',
    published ? '🌍 Record mondial publié !'
      : beaten ? 'Un autre joueur a battu ce record entre-temps.'
        : 'Record mondial non publié : connexion indisponible.');

  if (button) {
    button.disabled = false;
    button.textContent = 'Sauvegarder';
  }
  const popup = $('recordMessagePopup');
  if (popup) popup.style.display = 'none';
  pendingRecord = null;
}

function renderRecords() {
  const personal = records[game.recordFormat] || emptyRecord();
  const remote = worldBest[game.recordFormat] || emptyRecord();

  setText('recPersonalScore', personal.score || '—');
  setText('recPersonalTime', personal.score ? fmtTime(personal.time) : '—');
  setText('recGlobalScore', remote.score || '—');
  setText('recGlobalTime', remote.score ? fmtTime(remote.time) : '—');

  const card = $('recGlobalCard');
  card?.querySelectorAll('.rc-message').forEach(element => element.remove());
  const messageText = cache.worldMessages?.[game.recordFormat];
  if (messageText && card) {
    const message = document.createElement('span');
    message.className = 'rc-message';
    message.textContent = `« ${messageText} »`;
    card.append(message);
  }
}

async function openRecords() {
  if (state === 'over') return;
  pauseGame();
  setOpen('recordsOverlay', true);
  setText('recStatus', 'Synchronisation…');
  renderRecords();

  const format = game.recordFormat;
  try {
    await Promise.race([onlineReady, wait(NETWORK_CHECK_TIMEOUT_MS)]);
    if (fb && await isOnline()) {
      const ok = await refreshWorldRecord(format);
      renderRecords();
      setText('recStatus', ok ? 'À jour (Cloud)' : 'Record mondial indisponible');
    } else {
      renderRecords();
      setText('recStatus', 'Hors ligne (Records locaux)');
    }
  } catch {
    renderRecords();
    setText('recStatus', 'Hors ligne (Records locaux)');
  }
}

// ─────────────────────────────────────────────
// 8. BOUTONS / INIT
// ─────────────────────────────────────────────

function bind() {
  document.querySelectorAll('#countSeg [data-count]').forEach(button => {
    button.addEventListener('click', () => {
      const count = Number(button.dataset.count);
      if (!FORMATS.includes(count)) return;
      game.count = count;
      updateAvailability();
    });
  });

  $('playBtn')?.addEventListener('click', startGame);
  $('startRulesBtn')?.addEventListener('click', () => setOpen('rulesOverlay', true));
  $('rulesBtn')?.addEventListener('click', () => {
    pauseGame(false);
    setOpen('rulesOverlay', true);
  });
  $('rulesClose')?.addEventListener('click', () => {
    setOpen('rulesOverlay', false);
    if (state === 'paused') resumeGame();
  });
  $('rulesOverlay')?.addEventListener('click', event => {
    if (event.target === $('rulesOverlay')) {
      setOpen('rulesOverlay', false);
      if (state === 'paused') resumeGame();
    }
  });
  $('pauseBtn')?.addEventListener('click', () => pauseGame());
  $('resumeBtn')?.addEventListener('click', resumeGame);
  $('restartPauseBtn')?.addEventListener('click', startGame);
  $('menuPauseBtn')?.addEventListener('click', () => { window.location.href = MENU_URL; });
  $('goRestartBtn')?.addEventListener('click', startGame);
  $('goMenuBtn')?.addEventListener('click', () => { window.location.href = MENU_URL; });
  $('recordsBtn')?.addEventListener('click', openRecords);
  $('recordsClose')?.addEventListener('click', () => setOpen('recordsOverlay', false));
  $('recordsOverlay')?.addEventListener('click', event => {
    if (event.target === $('recordsOverlay')) setOpen('recordsOverlay', false);
  });
  $('saveRecordMsgBtn')?.addEventListener('click', saveRecordMessage);
  $('recordMsgInput')?.addEventListener('input', event => {
    setText('recordCharCounter', `${event.target.value.length}/${MESSAGE_MAX}`);
  });

  document.querySelectorAll('#recTabs [data-count]').forEach(button => {
    button.addEventListener('click', () => {
      const format = Number(button.dataset.count);
      if (!FORMATS.includes(format)) return;
      game.recordFormat = format;
      renderRecords();
    });
  });

  $('answers')?.addEventListener('click', event => {
    const button = event.target.closest('.ans');
    if (!button || !game.deck[game.index]) return;
    const question = game.deck[game.index];
    const value = question.type === 'vrai_faux' ? button.dataset.value === 'true' : button.dataset.value;
    submitAnswer(value);
  });
  $('questionActions')?.addEventListener('click', event => {
    if (event.target.closest('#nextQuestionBtn')) nextQuestion();
  });

  document.addEventListener('keydown', event => {
    if (event.target?.tagName === 'INPUT') {
      if (event.key === 'Enter' && event.target.id === 'recordMsgInput') return;
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      if (state === 'running') pauseGame();
      else if (state === 'paused') resumeGame();
    } else if (state === 'running' && !game.answered && /^[1-4]$/.test(key)) {
      $('answers')?.querySelectorAll('.ans')[Number(key) - 1]?.click();
    } else if (key === 'v') {
      $('answers')?.querySelector('[data-value="true"]')?.click();
    } else if (key === 'f') {
      $('answers')?.querySelector('[data-value="false"]')?.click();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });
  window.addEventListener('blur', () => pauseGame());

  ['touchmove', 'gesturestart'].forEach(eventName => {
    document.addEventListener(eventName, event => {
      if (!event.target.closest('.modal')) event.preventDefault();
    }, { passive: false });
  });
}

export {
  FORMATS,
  POINTS_MAX,
  POINTS_MIN,
  SCORE_TIME_MAX_MS,
  normalizeAnswer,
  scoreForSeconds,
  normRecord,
  parseRemote,
  isBetter,
  drawUnique,
  enoughQuestions
};

if (typeof document !== 'undefined') {
  bind();
  loadQuestions().catch(error => {
    console.error('CultureQuiz : chargement des questions impossible.', error);
    setText('availLine', 'Impossible de charger les questions.');
    const play = $('playBtn');
    if (play) play.disabled = true;
  });

  // Même principe que Mindplay : Mots : réseau initialisé sans bloquer le jeu.
  onlineReady = initOnline();
}
