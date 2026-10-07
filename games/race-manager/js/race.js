import { SLOT_COUNT, TYRE_COMPOUNDS, TYRE_LABELS, TYRE_DATA, PACE_MULTIPLIERS, PUNCTURE_THRESHOLD, MIN_DRY_COMPOUNDS, COMPOUND_RULE_PENALTY_SECONDS, PIT_STOP_BASE, DOUBLE_STACK_PENALTY } from './core/constants.js';
import { readSlot, writeSlot } from './core/storage.js';
import { formatGameDate, formatMoney, round2, weatherCategory, weatherLabel } from './core/utils.js';
import { h, teamDot, toast } from './ui.js';
import { tyreSvg, TYRE_COLORS } from './tyre-art.js';
import { getDynamicCalendar } from './core/progression.js';
import { circuitFor } from './data/circuits-2026.js';
import { trackSvg, trackPointAt } from './data/circuit-tracks-2026.js';
import { weekendFor } from './core/weekend.js';
import { initRaceState, serializeRaceState, deserializeRaceState, simulateLap, finishRace, orderPitStop, changePace, canPitThisLap, estimateWearPerLap, recommendedCompound } from './core/race-engine.js';

const main = document.getElementById('content');
const params = new URLSearchParams(location.search);
const slotId = Number(params.get('slot'));
const roundId = params.get('round');

function fatal(message) {
  main.replaceChildren(h('section', { class: 'card' }, h('h1', { text: 'Course indisponible' }), h('p', { text: message }), h('a', { class: 'btn btn--primary', href: 'home.html?slot=' + slotId, text: 'Retour au QG' })));
}

function init() {
  if (!Number.isInteger(slotId) || slotId < 1 || slotId > SLOT_COUNT) return fatal('Emplacement de sauvegarde invalide.');
  const loaded = readSlot(slotId);
  if (loaded.status !== 'ok') return fatal(loaded.errors?.[0] || 'Sauvegarde indisponible.');
  const season = Number(loaded.save.season || String(loaded.save.gameDate).slice(0, 4));
  const round = getDynamicCalendar(season).find((r) => r.id === roundId);
  if (!round) return fatal('Grand Prix introuvable.');

  if (loaded.save.schemaVersion < 5) return fatal('Veuillez retourner au menu principal pour migrer votre sauvegarde vers la V4.');
  if (loaded.save.gameDate !== round.raceDate && !loaded.save.weekends[round.id]?.race?.results?.length) return fatal('La course n’est pas accessible à cette date.');
  run(loaded.save, round);
}

function run(save, round) {
  const playerTeam = save.teams.find((team) => team.id === save.playerTeamId);
  const driverById = (id) => save.drivers.find((driver) => driver.id === id);
  const teamOf = (id) => save.teams.find((team) => team.id === id);
  const persist = () => writeSlot(slotId, save);
  document.documentElement.style.setProperty('--team', playerTeam.color);
  document.getElementById('hdrTeam').textContent = playerTeam.name;
  document.getElementById('hdrBalance').textContent = `Solde : ${formatMoney(playerTeam.balance)}`;

  const weekend = weekendFor(save, round.id);
  const playerDrivers = save.drivers.filter(d => d.teamId === save.playerTeamId);
  let raceState = null;

  function lightsOut(driver) {
    return new Promise((resolve) => {
      const dialog = h('dialog', { class: 'modal lights-out', 'aria-labelledby': 'lightsTitle' });
      const status = h('p', { class: 'lights-out__status', text: 'Attendez les feux...' });
      const button = h('button', { type: 'button', class: 'btn btn--primary lights-out__button', text: 'Attendre', disabled: true });
      let greenAt = 0;
      const timer = setTimeout(() => {
        greenAt = Date.now();
        status.textContent = 'FEUX ÉTEINTS !';
        button.disabled = false;
        button.textContent = 'Réagir';
        button.focus();
      }, 900 + Math.floor(Math.random() * 900));
      const close = (bonus) => { clearTimeout(timer); dialog.close(); dialog.remove(); resolve(bonus); };
      button.addEventListener('click', () => {
        const reaction = Date.now() - greenAt;
        const bonus = reaction < 260 ? 0.8 : reaction < 450 ? 0.35 : reaction < 800 ? 0 : -0.35;
        status.textContent = `Réaction : ${reaction} ms`;
        button.disabled = true;
        button.textContent = bonus > 0 ? 'Bon départ !' : bonus < 0 ? 'Réaction tardive' : 'Réaction correcte';
        setTimeout(() => close(bonus), 700);
      });
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(0); });
      dialog.append(h('h2', { id: 'lightsTitle', text: `Lights Out · ${driver.name}` }), h('p', { class: 'muted', text: 'Réagissez dès que les feux s’éteignent pour gagner des places au départ.' }), status, button);
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  let driverStrats = {};

  function initDriverStrats() {
    for (const d of playerDrivers) {
      driverStrats[d.id] = {
        startCompound: recommendedCompound(weekend.startMm),
        pace: 'balanced',
        riskLevel: 'normal',
        stops: [{ lap: Math.floor(circuitData(round.id).laps * 0.45), compound: 'hard' }]
      };
    }
  }

  function estimateStints(strat, totalLaps, startLap = 0, startState = 100) {
    const stints = [];
    let currentLap = startLap;
    let currentCompound = strat.startCompound;
    let currentState = startState;

    const sortedStops = [...strat.stops].sort((a, b) => a.lap - b.lap);

    for (let i = 0; i <= sortedStops.length; i++) {
      const stop = sortedStops[i];
      const endLap = stop ? Math.min(stop.lap, totalLaps) : totalLaps;
      if (endLap <= currentLap && i < sortedStops.length) continue; // Skip invalid stops

      const lapsInStint = endLap - currentLap;
      const points = [];

      for (let l = 0; l <= lapsInStint; l++) {
        const lapNum = currentLap + l;
        points.push({ lap: lapNum, state: Math.max(0, currentState) });
        currentState -= estimateWearPerLap(round.id, currentCompound, strat.pace) * (1 + (strat.damage || 0) * 0.003);
      }

      stints.push({ compound: currentCompound, startLap: currentLap, endLap: endLap, points });

      currentLap = endLap;
      if (stop) {
        currentCompound = stop.compound;
        currentState = 100;
      }
      if (currentLap >= totalLaps) break;
    }
    return stints;
  }

  function renderPreviewSvg(strat) {
    const totalLaps = circuitData(round.id).laps;
    return drawStintsSvg(estimateStints(strat, totalLaps), totalLaps);
  }

  /** Courbe d'usure par relais. `nowLap` trace le tour actuel ; `ghost` trace en pointillés l'usure si l'on ne s'arrête pas. */
  function drawStintsSvg(stints, totalLaps, { nowLap = null, ghost = null } = {}) {
    const colors = TYRE_COLORS;

    const mapX = (lap) => (lap / totalLaps) * 1000;
    const mapY = (state) => 200 - (state / 100) * 200;
    const y30 = mapY(30); // Puncture threshold

    let html = `<svg viewBox="0 0 1000 200" style="width: 100%; max-height: 200px; display: block; background: #1a1a24; border-radius: 4px; font-family: monospace;">`;

    // Threshold line
    html += `<line x1="0" y1="${y30}" x2="1000" y2="${y30}" stroke="rgba(255,0,0,0.5)" stroke-width="2" stroke-dasharray="5,5" />`;
    html += `<text x="5" y="${y30 - 5}" fill="rgba(255,0,0,0.7)" font-size="12">30% (Risque crevaison)</text>`;

    if (ghost && ghost.points.length > 1) {
      const gp = ghost.points.map(p => `${mapX(p.lap)},${mapY(p.state)}`).join(' ');
      html += `<polyline points="${gp}" fill="none" stroke="${colors[ghost.compound] || '#ccc'}" stroke-width="2" stroke-dasharray="3,5" opacity="0.6" />`;
    }

    for (const s of stints) {
      if (s.startLap === s.endLap) continue;
      const pts = s.points.map(p => `${mapX(p.lap)},${mapY(p.state)}`);
      const polyPts = `${mapX(s.startLap)},200 ${pts.join(' ')} ${mapX(s.endLap)},200`;
      const color = colors[s.compound] || '#ccc';

      html += `<polygon points="${polyPts}" fill="${color}" opacity="0.2" />`;
      html += `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="3" />`;

      if (s.endLap < totalLaps) {
        html += `<line x1="${mapX(s.endLap)}" y1="0" x2="${mapX(s.endLap)}" y2="200" stroke="#fff" stroke-width="1" stroke-dasharray="4,4" />`;
        html += `<text x="${mapX(s.endLap) + 5}" y="20" fill="#fff" font-size="12">Lap ${s.endLap}</text>`;
      }
    }

    if (nowLap != null) {
      const nx = mapX(nowLap);
      html += `<line x1="${nx}" y1="0" x2="${nx}" y2="200" stroke="#ffc21a" stroke-width="2" />`;
      html += `<text x="${nx + (nx > 800 ? -6 : 6)}" y="36" fill="#ffc21a" font-size="12" text-anchor="${nx > 800 ? 'end' : 'start'}">Maintenant</text>`;
    }

    // Axis markers
    for (let i = 0; i <= totalLaps; i += 10) {
      if (i === 0) continue;
      html += `<line x1="${mapX(i)}" y1="195" x2="${mapX(i)}" y2="200" stroke="#fff" stroke-width="1" />`;
      html += `<text x="${mapX(i)}" y="190" fill="#888" font-size="10" text-anchor="middle">${i}</text>`;
    }

    html += `</svg>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    return wrap.firstElementChild;
  }

  function renderStrategy() {
    if (Object.keys(driverStrats).length === 0) initDriverStrats();
    const totalLaps = circuitData(round.id).laps;

    const startRace = async () => {
      const playerOptions = {};
      for (const d of playerDrivers) {
        playerOptions[d.id] = {
          compound: driverStrats[d.id].startCompound,
          pace: driverStrats[d.id].pace,
          riskLevel: driverStrats[d.id].riskLevel,
          plannedStops: driverStrats[d.id].stops.map(s => ({ lap: s.lap, compound: s.compound }))
        };
      }
      const startReactions = {};
      for (const d of playerDrivers) {
        startReactions[d.id] = await lightsOut(d);
      }
      raceState = initRaceState(save, round.id, startReactions, playerOptions);
      weekend.race = { state: serializeRaceState(raceState), results: null, completedAt: null, rewards: null, log: raceState.log };
      persist();
      renderLiveRace();
    };

    const updateStrat = (dId, key, val) => { driverStrats[dId][key] = val; renderStrategy(); };
    const updateStop = (dId, idx, key, val) => {
      let v = val;
      if (key === 'lap') v = Math.max(1, Math.min(Number(val), totalLaps - 1));
      driverStrats[dId].stops[idx][key] = v;
      renderStrategy();
    };
    const addStop = (dId) => {
      const stops = driverStrats[dId].stops;
      const lastLap = stops.length ? stops[stops.length - 1].lap : 1;
      const nextLap = Math.min(lastLap + 15, totalLaps - 1);
      stops.push({ lap: nextLap, compound: 'soft' });
      renderStrategy();
    };
    const removeStop = (dId, idx) => { driverStrats[dId].stops.splice(idx, 1); renderStrategy(); };

    const paceOptions = [
      h('option', { value: 'cautious', text: 'Prudent' }),
      h('option', { value: 'balanced', text: 'Équilibré' }),
      h('option', { value: 'aggressive', text: 'Agressif' })
    ];
    const riskOptions = [
      h('option', { value: 'low', text: 'Faible' }),
      h('option', { value: 'normal', text: 'Normale' }),
      h('option', { value: 'high', text: 'Élevée' })
    ];

    main.replaceChildren(
      h('div', { class: 'stack' },
        h('section', { class: 'card race-hero' },
          h('h1', { text: `Stratégie de Course · R${round.round}` }),
          h('p', { class: 'muted' }, `${round.name} · Départ : ${weatherLabel(weatherCategory(weekend.startMm))} (${weekend.startMm.toFixed(1)} mm) · ${totalLaps} tours`, trackSvg(round.id, { className: 'track-svg--inline' }))
        ),
        h('section', { class: 'card' },
          h('div', { class: 'race-layout stack' },
            ...playerDrivers.map(d => {
              const strat = driverStrats[d.id];
              return h('div', { class: 'driver-strategy' },
                h('h3', { text: d.name, style: 'margin-bottom: 1rem;' }),

                renderPreviewSvg(strat),

                h('div', { style: 'margin-top: 1rem;' },
                  h('h4', { text: 'Configuration Globale' }),
                  h('div', { class: 'strategy-grid' },
                    h('div', { class: 'strategy-field' },
                      h('label', { text: 'Pneus Départ' }),
                      h('select', { class: 'input', onChange: e => updateStrat(d.id, 'startCompound', e.target.value) },
                        TYRE_COMPOUNDS.map(c => h('option', { value: c, text: TYRE_LABELS[c], selected: c === strat.startCompound }))
                      )
                    ),
                    h('div', { class: 'strategy-field' },
                      h('label', { text: 'Rythme' }),
                      h('select', { class: 'input', onChange: e => updateStrat(d.id, 'pace', e.target.value) },
                        paceOptions.map(o => h('option', { value: o.value, text: o.textContent, selected: o.value === strat.pace }))
                      )
                    ),
                    h('div', { class: 'strategy-field' },
                      h('label', { text: 'Risque (Dépassement)' }),
                      h('select', { class: 'input', onChange: e => updateStrat(d.id, 'riskLevel', e.target.value) },
                        riskOptions.map(o => h('option', { value: o.value, text: o.textContent, selected: o.value === strat.riskLevel }))
                      )
                    )
                  )
                ),

                h('div', { style: 'margin-top: 1rem;' },
                  h('h4', { text: 'Arrêts Planifiés' }),
                  strat.stops.map((stop, i) => h('div', { class: 'strategy-row', style: 'margin-top: 0.5rem; align-items: center;' },
                    h('span', { text: `Arrêt ${i + 1}`, style: 'font-weight: bold; min-width: 60px;' }),
                    h('div', { class: 'strategy-field', style: 'flex: 1;' },
                      h('label', { text: 'Tour' }),
                      h('input', { type: 'number', class: 'input', value: stop.lap, min: 1, max: totalLaps - 1, onChange: e => updateStop(d.id, i, 'lap', e.target.value) })
                    ),
                    h('div', { class: 'strategy-field', style: 'flex: 1;' },
                      h('label', { text: 'Pneus' }),
                      h('select', { class: 'input', onChange: e => updateStop(d.id, i, 'compound', e.target.value) },
                        TYRE_COMPOUNDS.map(c => h('option', { value: c, text: TYRE_LABELS[c], selected: c === stop.compound }))
                      )
                    ),
                    h('button', { class: 'btn', text: '🗑️', style: 'align-self: flex-end; padding: 0.5rem;', onClick: () => removeStop(d.id, i) })
                  )),
                  h('button', { class: 'btn', text: '+ Ajouter un arrêt', style: 'margin-top: 1rem;', onClick: () => addStop(d.id) })
                )
              );
            })
          ),
          h('div', { style: 'margin-top: 2rem; text-align: right;' },
            h('button', { type: 'button', class: 'btn btn--primary', text: 'Valider et démarrer la course', onClick: startRace })
          )
        )
      )
    );
  }

  // Use the same circuit definition as initRaceState, even before raceState exists.
  // The strategy screen must never fall back to a generic lap count.
  function circuitData(id) {
    return circuitFor(id);
  }

  let playSpeed = 0;
  let pendingSpeed = 0;
  let simTimer = null;
  let gapMode = 'leader'; // 'leader' or 'ahead'
  let trackDots = new Map(); // driverId → { entry, driver, circle, label, title, placed, cur, from, to }
  let dotFrame = null;

  function setPlaySpeed(speed) {
    // Ignore repeated clicks on the currently selected speed.
    if (speed === pendingSpeed) return;

    pendingSpeed = speed;
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('btn--primary'));
    const activeBtn = document.getElementById(`btn-speed-${speed}`);
    if (activeBtn) activeBtn.classList.add('btn--primary');

    if (speed <= 0) {
      playSpeed = 0;
      if (simTimer) {
        clearTimeout(simTimer);
        simTimer = null;
      }
      return;
    }

    if (raceState.completed) return;

    // A running lap keeps its original speed; a paused race starts a fresh,
    // full-length delay instead of advancing immediately.
    if (playSpeed <= 0) {
      playSpeed = speed;
      scheduleNextLap();
    }
  }

  function scheduleNextLap() {
    if (simTimer || playSpeed <= 0 || raceState.completed) return;
    simTimer = setTimeout(runNextLap, 5000 / playSpeed);
  }

  function runNextLap() {
    simTimer = null;
    if (playSpeed <= 0 || raceState.completed) return;

    const lapSpeed = playSpeed;
    const res = simulateLap(raceState);
    if (res.events.length) raceState.log.unshift(...res.events.reverse());

    let needsPause = false;
    for (const entry of raceState.entries) {
      if (entry._needsPitWarning) {
        const d = driverById(entry.driverId);
        toast(`Arrêt planifié pour ${d.name} ce tour !`);
        needsPause = true;
        delete entry._needsPitWarning;
      }
      // Abandon d'un de vos pilotes ce tour : on prévient et on met la course en pause
      if (entry.isPlayer && entry.status === 'dnf' && entry.dnfLap === raceState.currentLap) {
        const d = driverById(entry.driverId);
        toast(`${d.name} abandonne : ${entry.dnfReason}.`, { error: true });
        needsPause = true;
      }
    }

    // Le classement et les couleurs sont rendus à partir du même état final du tour.
    // Aucune interpolation DOM ne peut donc afficher une couleur sur une mauvaise ligne.
    updateLiveRaceUI();
    updateTrackDots(5000 / lapSpeed);

    if (raceState.completed) {
      finishRaceAndShowResults();
      return;
    }

    weekend.race.state = serializeRaceState(raceState);
    weekend.race.log = raceState.log.slice(0, 100);
    persist();

    if (res.events.some(e => e.startsWith('Météo :'))) { toast(res.events.find(e => e.startsWith('Météo :'))); needsPause = true; }

    if (needsPause) {
      setPlaySpeed(0);
    } else {
      // Apply a speed change only after this lap has completed.
      playSpeed = pendingSpeed || lapSpeed;
      scheduleNextLap();
    }
  }

  function finishRaceAndShowResults() {
    if (simTimer) clearTimeout(simTimer);
    if (dotFrame) { cancelAnimationFrame(dotFrame); dotFrame = null; }
    const res = finishRace(raceState, save);
    if (!res.ok) { toast(res.error, { error: true }); return; }
    persist();
    renderResults();
  }

  // ---- Tracé en direct : un rond de la couleur de l'écurie par pilote.
  // Position estimée : au passage du leader sur la ligne, un pilote est « écart / temps au tour du leader » de tour derrière lui.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    return el;
  };

  function buildTrackView() {
    trackDots = new Map();
    const svg = trackSvg(round.id, { className: 'track-svg--live' });
    if (!svg) return null;
    svg.removeAttribute('aria-hidden');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Tracé du circuit : ${round.circuit}`);
    const layer = svgEl('g', { class: 'track-dots' });
    for (const entry of raceState.entries) {
      const team = save.teams.find((t) => t.id === entry.teamId);
      const driver = driverById(entry.driverId);
      const circle = svgEl('circle', {
        r: entry.isPlayer ? 6 : 4.5,
        fill: team?.color || '#cccccc',
        stroke: entry.isPlayer ? '#ffffff' : '#0b0f16',
        'stroke-width': entry.isPlayer ? 2 : 1.5,
      });
      const title = svgEl('title');
      circle.append(title);
      const label = entry.isPlayer ? svgEl('text', { class: 'track-label' }) : null;
      if (label) label.textContent = driver?.abbr || '';
      trackDots.set(entry.driverId, { entry, driver, circle, label, title, placed: false, cur: 0, from: 0, to: 0 });
      layer.append(circle);
      if (label) layer.append(label);
    }
    svg.append(layer);
    return svg;
  }

  /** Distance parcourue (en tours, continue) de chaque pilote encore en course, au passage du leader sur la ligne. */
  function dotTargets() {
    const racing = raceState.entries.filter((e) => e.status === 'racing');
    const leader = racing.reduce((best, e) => (!best || e.totalTime < best.totalTime ? e : best), null);
    const targets = new Map();
    if (!leader) return targets;
    const lapRef = leader.lapTime || raceState._circuit?.lapTimeBase || 90000;
    for (const e of racing) {
      targets.set(e.driverId, raceState.currentLap === 0
        ? -(e.position - 1) * 0.0035 // avant le départ : pilotes alignés sur la grille, derrière la ligne
        : raceState.currentLap - (e.totalTime - leader.totalTime) / lapRef);
    }
    return targets;
  }

  function placeDot(dot, distance) {
    const point = trackPointAt(round.id, distance);
    if (!point) return;
    dot.circle.setAttribute('cx', point.x.toFixed(1));
    dot.circle.setAttribute('cy', point.y.toFixed(1));
    if (dot.label) {
      dot.label.setAttribute('x', (point.x + 8).toFixed(1));
      dot.label.setAttribute('y', (point.y - 7).toFixed(1));
    }
  }

  /** Déplace les ronds vers leurs nouvelles positions, de façon fluide sur `durationMs` (0 = immédiat). */
  function updateTrackDots(durationMs) {
    if (!trackDots.size) return;
    const targets = dotTargets();
    const ordered = [...trackDots.values()].sort((a, b) => b.entry.position - a.entry.position);
    for (const dot of ordered) {
      const out = dot.entry.status !== 'racing';
      dot.circle.style.display = out ? 'none' : '';
      if (dot.label) dot.label.style.display = out ? 'none' : '';
      dot.title.textContent = `${dot.driver?.abbr || ''} · P${dot.entry.position}`;
      if (out) continue;
      dot.to = targets.get(dot.entry.driverId) ?? dot.cur;
      if (!dot.placed) { dot.cur = dot.to; dot.placed = true; }
      dot.from = dot.cur;
      // le leader (P1) est dessiné en dernier, donc au-dessus des autres
      const layer = dot.circle.parentNode;
      layer.append(dot.circle);
      if (dot.label) layer.append(dot.label);
    }
    if (dotFrame) cancelAnimationFrame(dotFrame);
    const start = performance.now();
    const tick = (now) => {
      const t = durationMs > 0 ? Math.min(1, (now - start) / durationMs) : 1;
      for (const dot of trackDots.values()) {
        if (dot.entry.status !== 'racing') continue;
        dot.cur = dot.from + (dot.to - dot.from) * t;
        placeDot(dot, dot.cur);
      }
      dotFrame = t < 1 ? requestAnimationFrame(tick) : null;
    };
    tick(start);
  }

  // ---- Modale d'arrêt aux stands : pneus, rythme et risque pour le relais suivant, avec aperçu de l'usure.
  const PACE_CHOICES = [['cautious', 'Prudent'], ['balanced', 'Équilibré'], ['aggressive', 'Agressif']];
  const RISK_CHOICES = [['low', 'Faible'], ['normal', 'Normale'], ['high', 'Élevée']];
  const paceLabel = (pace) => PACE_CHOICES.find(([value]) => value === pace)?.[1] || pace;

  function paceHint(pace) {
    const m = PACE_MULTIPLIERS[pace];
    if (!m) return '';
    const signed = (n, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;
    return `Usure des pneus ${signed(Math.round((m.wear - 1) * 100))} %, temps au tour ${signed((m.lapTimeFactor - 1) * 100, 1)} %.`;
  }

  /** Groupe de boutons radio présenté en pastilles (même logique que les listes de la stratégie d'avant-course). */
  function segmented(name, legend, choices, value, onChange) {
    return h('fieldset', { class: 'pit-seg' },
      h('legend', { text: legend }),
      h('div', { class: 'pit-seg__row' }, choices.map(([val, text]) => h('label', { class: 'pit-seg__opt' },
        h('input', { type: 'radio', name, value: val, checked: val === value, onChange: () => onChange(val) }),
        h('span', { text })
      )))
    );
  }

  /** Juge un plan de relais : usure minimale, seuil de crevaison (30 %) et falaise de performance du composé. */
  function assessPlan(stints, totalLaps) {
    let minState = 100;
    let minLap = null;
    let firstRisk = null;
    let firstCliff = null;
    for (const s of stints) {
      // Un relais qui se termine par un arrêt est remplacé pendant son dernier tour : on ne juge pas l'usure de ce tour-là.
      const pts = s.endLap < totalLaps ? s.points.slice(0, -1) : s.points;
      const cliff = TYRE_DATA[s.compound]?.cliff ?? 20;
      for (const p of pts) {
        if (p.state < minState) { minState = p.state; minLap = p.lap; }
        if (!firstCliff && p.state < cliff) firstCliff = { lap: p.lap, compound: s.compound };
        if (!firstRisk && p.state < PUNCTURE_THRESHOLD) firstRisk = { lap: p.lap, compound: s.compound };
      }
    }
    if (firstCliff) return { level: 'bad', text: `Chute de performance dès le tour ${firstCliff.lap} (${TYRE_LABELS[firstCliff.compound]}). Ajoutez un arrêt ou choisissez un rythme prudent.` };
    if (firstRisk) return { level: 'warn', text: `Zone de risque de crevaison (moins de ${PUNCTURE_THRESHOLD} %) dès le tour ${firstRisk.lap}.` };
    return { level: 'ok', text: `Les pneus tiennent jusqu’à l’arrivée : usure minimale de ${Math.round(minState)} % au tour ${minLap}.` };
  }

  async function openPitMenu(driverId) {
    const entry = raceState.entries.find((e) => e.driverId === driverId);
    if (!entry || entry.status !== 'racing') return;
    const driver = driverById(driverId);
    const circuit = circuitData(round.id);
    const totalLaps = circuit.laps;
    const pitLap = raceState.currentLap + 1; // l'arrêt a lieu au prochain tour simulé

    // La course est mise en pause pendant le choix, puis reprend à la même vitesse.
    const resumeSpeed = pendingSpeed;
    setPlaySpeed(0);

    // Pénalité de pneus inadaptés à la piste : mêmes valeurs que le moteur (race-engine.js, simulateLap).
    const weatherPenaltyMs = (compound) => {
      const wetCompound = compound === 'wet' || compound === 'intermediate';
      if (raceState.weather === 'wet' && compound !== 'wet') return 6000;
      if (raceState.weather === 'damp' && compound !== 'intermediate') return 2000;
      if (raceState.weather === 'dry' && wetCompound) return 4000;
      return 0;
    };
    const suggestedCompound = () => {
      const recommended = recommendedCompound(raceState.currentMm);
      if (recommended !== 'hard') return recommended;
      return ['hard', 'medium', 'soft'].find((c) => !entry.compoundsUsed.has(c)) || recommended;
    };

    const plan = {
      compound: entry._orderedPitCompound || suggestedCompound(),
      pace: entry._orderedPitPace || entry.pace,
      riskLevel: entry._orderedPitRisk || entry.riskLevel,
    };
    // Un arrêt manuel remplace le prochain arrêt planifié (sauf si un arrêt est déjà ordonné).
    const remaining = entry.plannedStops.slice(entry._orderedPitCompound ? 0 : 1).filter((s) => s.lap > pitLap);
    const pitLoss = circuit.pitLossSeconds + PIT_STOP_BASE;
    const teammatePits = raceState.entries.some((e) => e.isPlayer && e.driverId !== driverId && e._orderedPitCompound);
    const wearFactor = 1 + entry.damage * 0.003;

    // ── En-tête
    const sub = h('p', { class: 'muted', text: `Tour ${raceState.currentLap}/${totalLaps}, arrêt au tour ${pitLap} (environ ${Math.round(pitLoss)} s perdues). La course est en pause pendant votre choix.` });

    // ── Pneus actuels → pneus neufs
    const heroNew = h('div', { class: 'pit-hero__tyre' });
    const hero = h('div', { class: 'pit-hero' },
      h('div', { class: 'pit-hero__tyre' },
        tyreSvg(entry.tyres.compound, { size: 104, wear: entry.tyres.wear }),
        h('strong', { text: `${TYRE_LABELS[entry.tyres.compound]} actuels` }),
        h('span', { class: 'muted', text: `${Math.round(entry.tyres.wear)} % d’état, ${entry.tyres.lapsOn} tours` })
      ),
      h('div', { class: 'pit-hero__arrow', 'aria-hidden': 'true', text: '→' }),
      heroNew
    );

    // ── Choix du composé
    const cardUi = new Map();
    const cards = TYRE_COMPOUNDS.map((compound) => {
      const wear = h('span', { class: 'pit-tyre__stat' });
      const penalty = weatherPenaltyMs(compound);
      const grip = TYRE_DATA[compound].gripPenaltyMs;
      const flag = h('span', { class: `pit-tyre__flag ${penalty > 0 ? 'is-bad' : raceState.weather !== 'dry' ? 'is-ok' : ''}`,
        text: penalty > 0 ? `Inadapté : +${(penalty / 1000).toFixed(0)} s/tour` : raceState.weather !== 'dry' ? 'Adapté à la piste' : '' });
      cardUi.set(compound, { wear });
      return h('label', { class: 'pit-tyre', style: { '--tyre': TYRE_COLORS[compound] } },
        h('input', { type: 'radio', name: 'pit-compound', value: compound, checked: compound === plan.compound, onChange: () => { plan.compound = compound; update(); } }),
        tyreSvg(compound, { size: 72 }),
        h('strong', { text: TYRE_LABELS[compound] }),
        wear,
        h('span', { class: 'pit-tyre__stat', text: grip === 0 ? 'Grip maximal' : `Grip +${(grip / 1000).toFixed(2)} s/tour` }),
        flag
      );
    });

    // ── Rythme et risque après l'arrêt
    const paceHintEl = h('p', { class: 'pit-seg__hint muted' });
    const paceGroup = h('div', {}, segmented('pit-pace', 'Rythme après l’arrêt', PACE_CHOICES, plan.pace, (v) => { plan.pace = v; update(); }), paceHintEl);
    const riskGroup = segmented('pit-risk', 'Risque après l’arrêt (dépassements)', RISK_CHOICES, plan.riskLevel, (v) => { plan.riskLevel = v; update(); });

    // ── Aperçu de l'usure
    const chartSlot = h('div', { class: 'pit-preview__chart' });
    const stintList = h('ul', { class: 'pit-stints' });
    const verdictEl = h('p', { class: 'pit-verdict', 'aria-live': 'polite' });
    const notesEl = h('ul', { class: 'pit-notes' });
    const preview = h('section', { class: 'pit-preview', 'aria-labelledby': 'pitPreviewTitle' },
      h('h3', { id: 'pitPreviewTitle', text: 'Aperçu de l’usure jusqu’à l’arrivée' }),
      chartSlot,
      h('p', { class: 'pit-legend', text: 'Trait plein : avec cet arrêt. Pointillés : si vous gardez vos pneus actuels. Ligne rouge : seuil de crevaison.' }),
      stintList,
      verdictEl,
      notesEl
    );

    function update() {
      for (const compound of TYRE_COMPOUNDS) {
        cardUi.get(compound).wear.textContent = `Usure ${(estimateWearPerLap(round.id, compound, plan.pace) * wearFactor).toFixed(1)} %/tour`;
      }
      heroNew.replaceChildren(
        tyreSvg(plan.compound, { size: 104, wear: 100 }),
        h('strong', { text: `${TYRE_LABELS[plan.compound]} neufs` }),
        h('span', { class: 'muted', text: `Rythme ${paceLabel(plan.pace).toLowerCase()}` })
      );
      paceHintEl.textContent = paceHint(plan.pace);

      const stints = estimateStints({ startCompound: plan.compound, pace: plan.pace, stops: remaining, damage: entry.damage }, totalLaps, pitLap, 100);
      const ghostStints = estimateStints({ startCompound: entry.tyres.compound, pace: entry.pace, stops: [], damage: entry.damage }, totalLaps, raceState.currentLap, entry.tyres.wear);
      const ghost = ghostStints[0] ? { compound: entry.tyres.compound, points: ghostStints[0].points } : null;
      chartSlot.replaceChildren(drawStintsSvg(stints, totalLaps, { nowLap: raceState.currentLap, ghost }));

      stintList.replaceChildren(...stints.filter((s) => s.endLap > s.startLap).map((s) => {
        const pts = s.endLap < totalLaps ? s.points.slice(0, -1) : s.points;
        const end = Math.round(pts[pts.length - 1].state);
        return h('li', {}, tyreSvg(s.compound, { size: 28 }),
          h('span', { text: `${TYRE_LABELS[s.compound]}, tours ${s.startLap} à ${s.endLap} (${s.endLap - s.startLap} tours), état final ${end} %` }));
      }));

      const verdict = assessPlan(stints, totalLaps);
      verdictEl.className = `pit-verdict is-${verdict.level}`;
      verdictEl.textContent = verdict.text;

      const notes = [];
      if (teammatePits) notes.push(`Votre coéquipier s’arrête aussi à ce tour : +${DOUBLE_STACK_PENALTY} s d’immobilisation (double arrêt).`);
      const used = new Set([...entry.compoundsUsed, plan.compound, ...remaining.map((s) => s.compound)]);
      const dryUsed = [...used].filter((c) => c !== 'wet' && c !== 'intermediate').length;
      if (raceState.weather === 'dry' && dryUsed < MIN_DRY_COMPOUNDS) {
        notes.push(`Règle des 2 composés : une seule gomme sèche prévue, pénalité de ${COMPOUND_RULE_PENALTY_SECONDS} s si la piste reste sèche.`);
      }
      notesEl.replaceChildren(...notes.map((text) => h('li', { text })));
      notesEl.hidden = notes.length === 0;
    }

    // ── Fenêtre
    const cancelBtn = h('button', { type: 'button', class: 'btn btn--ghost', text: 'Annuler', onClick: () => dlg.close('cancel') });
    const confirmBtn = h('button', { type: 'button', class: 'btn btn--primary', autofocus: true, text: 'Confirmer l’arrêt', onClick: () => dlg.close('confirm') });
    const dlg = h('dialog', { class: 'modal pit-dialog', 'aria-labelledby': 'pitTitle' },
      h('div', { class: 'pit' },
        h('header', { class: 'pit__head' },
          teamDot(teamOf(entry.teamId)),
          h('div', {}, h('h2', { id: 'pitTitle', text: `Arrêt aux stands : ${driver.name}` }), sub)
        ),
        h('div', { class: 'pit__body' },
          h('div', { class: 'pit__col' },
            hero,
            h('fieldset', { class: 'pit-tyres' }, h('legend', { text: 'Pneus à monter' }), h('div', { class: 'pit-tyres__grid' }, cards))
          ),
          h('div', { class: 'pit__col' }, paceGroup, riskGroup, preview)
        ),
        h('div', { class: 'pit__actions' }, cancelBtn, confirmBtn)
      )
    );

    const outcome = await new Promise((resolve) => {
      const previous = document.activeElement;
      dlg.addEventListener('close', () => {
        dlg.remove();
        if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
        resolve(dlg.returnValue); // « confirm », « cancel », ou vide (Échap)
      });
      document.body.append(dlg);
      update();
      dlg.showModal();
    });

    if (outcome === 'confirm') {
      const ok = orderPitStop(raceState, driverId, plan.compound, { pace: plan.pace, riskLevel: plan.riskLevel });
      if (ok.ok) {
        toast(`Arrêt programmé pour ${driver.name} au tour ${pitLap} (${TYRE_LABELS[plan.compound]}, rythme ${paceLabel(plan.pace).toLowerCase()}).`);
        // L'ordre est sauvegardé tout de suite : un rechargement avant le prochain tour ne l'annule pas.
        weekend.race.state = serializeRaceState(raceState);
        persist();
      } else {
        toast(ok.error, { error: true });
      }
      updateLiveRaceUI();
    }
    if (resumeSpeed > 0 && !raceState.completed) setPlaySpeed(resumeSpeed);
  }

  function updateLiveRaceUI() {
    document.getElementById('liveLapInfo').textContent = `Tour ${raceState.currentLap}/${raceState.laps}`;
    document.getElementById('liveWeatherInfo').textContent = `${weatherLabel(raceState.weather)} · ${raceState.currentMm.toFixed(1)} mm`;

    const sortedEntries = [...raceState.entries].sort((a, b) => {
      if (a.status === 'dnf' && b.status !== 'dnf') return 1;
      if (b.status === 'dnf' && a.status !== 'dnf') return -1;
      return a.position - b.position;
    });

    const leader = sortedEntries[0];
    const tbody = document.getElementById('liveStandingsBody');

    tbody.replaceChildren(...sortedEntries.map((entry, i) => {
      const d = save.drivers.find(x => x.id === entry.driverId);
      const isDnf = entry.status === 'dnf';
      const p = i + 1;

      let gapText = '';
      if (isDnf) {
        gapText = 'DNF';
      } else if (i === 0) {
        gapText = 'Leader';
      } else {
        const animT = entry.totalTime;
        if (gapMode === 'leader') {
          const leadT = leader.totalTime;
          gapText = `+${((animT - leadT) / 1000).toFixed(1)}s`;
        } else {
          const ahead = sortedEntries[i - 1];
          const aheadT = ahead.totalTime;
          gapText = `+${((animT - aheadT) / 1000).toFixed(1)}s`;
        }
      }

      const positionClass = !isDnf && entry._posDiff ? (entry._posDiff > 0 ? 'pos-up' : 'pos-down') : '';
      return h('tr', { class: `${entry.isPlayer ? 'is-player' : ''} ${isDnf ? 'is-dnf' : ''} ${positionClass}` },
        h('td', { text: p }),
        h('td', { title: d.name }, teamDot(teamOf(entry.teamId)), d.abbr),
        h('td', { class: 'gap', text: gapText }),
        h('td', { class: 'tyre' },
          isDnf ? null : h('span', { class: `tyre-${entry.tyres.compound}`, text: entry.tyres.compound.charAt(0).toUpperCase() }),
          isDnf ? null : h('span', { class: `tyre-wear ${entry.tyres.wear < 20 ? 'wear-danger' : ''}`, text: `${Math.round(entry.tyres.wear)}%` })
        ),
        h('td', { text: entry.pitStops.length > 0 ? entry.pitStops.length : '-' }),
        h('td', {}, entry.isPlayer && !isDnf && canPitThisLap(raceState, entry.driverId) ? h('button', { class: 'btn', style: 'padding: 0.2rem 0.5rem; font-size: 0.8rem;', text: entry._orderedPitCompound ? 'Pit prévu' : 'Pit', onClick: () => openPitMenu(entry.driverId) }) : null)
      );
    }));

    const logDiv = document.getElementById('liveLog');
    logDiv.replaceChildren(...raceState.log.map(msg => h('p', { text: msg })));
  }

  function renderLiveRace() {
    const trackView = buildTrackView();
    main.replaceChildren(
      h('div', { class: 'stack' },
        h('section', { class: 'card race-hero', style: 'margin-bottom: 1rem;' },
          h('div', { style: 'display: flex; justify-content: space-between; align-items: center;' },
            h('h1', { text: `Grand Prix · R${round.round}` }),
            h('h2', { id: 'liveLapInfo', style: 'color: var(--accent);' }, `Tour ${raceState.currentLap}/${raceState.laps}`),
            h('p', { id: 'liveWeatherInfo', class: 'muted', text: `${weatherLabel(raceState.weather)} · ${raceState.currentMm.toFixed(1)} mm` })
          )
        ),
        h('div', { class: 'race-controls' },
          h('button', { id: 'btn-speed-0', class: 'btn speed-btn btn--primary', text: 'Pause', onClick: () => setPlaySpeed(0) }),
          h('button', { id: 'btn-speed-1', class: 'btn speed-btn', text: 'x1', onClick: () => setPlaySpeed(1) }),
          h('button', { id: 'btn-speed-2', class: 'btn speed-btn', text: 'x2', onClick: () => setPlaySpeed(2) }),
          h('button', { id: 'btn-speed-4', class: 'btn speed-btn', text: 'x4', onClick: () => setPlaySpeed(4) }),
          h('button', { id: 'btn-speed-8', class: 'btn speed-btn', text: 'x8', onClick: () => setPlaySpeed(8) }),
          h('button', { id: 'btn-speed-16', class: 'btn speed-btn', text: 'x16', onClick: () => setPlaySpeed(16) })
        ),
        h('div', { class: 'race-layout' },
          h('section', { class: 'card' },
            h('div', { style: 'display: flex; justify-content: space-between; align-items: baseline; margin-top: 0;' },
              h('h2', { text: 'Classement En Direct', style: 'margin-top: 0;' }),
              h('button', { class: 'btn', style: 'padding: 0.2rem 0.5rem; font-size: 0.8rem;', text: 'Changer mode écart', onClick: () => { gapMode = gapMode === 'leader' ? 'ahead' : 'leader'; updateLiveRaceUI(); } })
            ),
            h('div', { class: 'ranking-table-wrap ranking-table-wrap--live', role: 'region', 'aria-label': 'Classement en direct', tabindex: '0' },
              h('table', { class: 'ranking-table standings-table' },
                h('thead', {}, h('tr', {}, h('th', { text: 'P' }), h('th', { text: 'Pilote' }), h('th', { text: 'Écart' }), h('th', { text: 'Pneus' }), h('th', { text: 'Arrêts' }), h('th', { text: 'Actions' }))),
                h('tbody', { id: 'liveStandingsBody' })
              )
            )
          ),

          h('div', { class: 'race-side' },
            trackView ? h('section', { class: 'card race-track' },
              h('h2', { text: 'Circuit', style: 'margin-top: 0;' }),
              trackView,
              h('p', { class: 'muted race-track__note', text: 'Positions estimées d’après les écarts de temps. Cercle blanc : vos pilotes.' })
            ) : null,
            h('section', { class: 'card', style: 'align-self: start;' },
              h('h2', { text: 'Événements', style: 'margin-top: 0;' }),
              h('div', { id: 'liveLog', class: 'race-log' })
            )
          )
        )
      )
    );
    updateLiveRaceUI();
    updateTrackDots(0);
  }

  function renderResults() {
    const results = weekend.race.results;

    function resultList(res) {
      return h('div', { class: 'ranking-table-wrap', role: 'region', 'aria-label': 'Classement final de la course', tabindex: '0' },
        h('table', { class: 'ranking-table ranking-table--results' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'P' }), h('th', { scope: 'col', text: 'Pilote' }), h('th', { scope: 'col', text: 'Résultat' }), h('th', { scope: 'col', text: 'Points' }), h('th', { scope: 'col', text: 'Arrêts' }))),
          h('tbody', {}, res.map((row) => {
            const driver = driverById(row.driverId), isDnf = row.status === 'dnf';
            return h('tr', { class: `${driver.teamId === save.playerTeamId ? 'is-player' : ''}${isDnf ? ' is-dnf' : ''}${row.position <= 3 ? ` podium-${row.position}` : ''}`.trim() },
              h('td', { class: 'ranking-table__pos', 'data-label': 'Position' }, h('span', { class: 'ranking-table__badge', text: String(row.position) })),
              h('th', { scope: 'row', 'data-label': 'Pilote' }, h('span', { class: 'ranking-table__driver' }, teamDot(teamOf(driver.teamId)), driver.name)),
              h('td', { 'data-label': 'Résultat', text: isDnf ? `DNF (${row.dnfReason}${row.dnfLap ? `, tour ${row.dnfLap}` : ''})` : row.position === 1 ? 'Vainqueur' : `+${row.gap}s` }),
              h('td', { class: 'ranking-table__num', 'data-label': 'Points', text: String(row.points) }), h('td', { class: 'ranking-table__num', 'data-label': 'Arrêts', text: String(row.pitStops) }));
          }))));
    }

    main.replaceChildren(
      h('div', { class: 'stack' },
        h('section', { class: 'card race-hero' },
          h('h1', { text: `Résultats de la Course · R${round.round}` }),
          h('p', {}, round.name, trackSvg(round.id, { className: 'track-svg--inline' })),
          h('p', { class: 'muted', text: `${weatherLabel(weatherCategory(raceState?.currentMm ?? weekend.startMm))} · ${raceState?.currentMm?.toFixed(1) ?? weekend.startMm.toFixed(1)} mm · ${weekend.race.rewards?.money > 0 ? `Gains : +${weekend.race.rewards.money} M€` : ''}` })
        ),
        h('section', { class: 'card' },
          h('h2', { text: 'Classement Final' }),
          resultList(results)
        ),
        h('div', { style: 'text-align: right; margin-top: 1rem;' },
          h('a', { class: 'btn btn--primary', href: `home.html?slot=${slotId}`, text: 'Retour au QG et Avancer' })
        )
      )
    );
  }

  // Application routing
  if (weekend.race?.results) {
    renderResults();
  } else if (weekend.race?.state) {
    raceState = deserializeRaceState(weekend.race.state, save, round.id);
    raceState.log = weekend.race.log || [];
    if (raceState.completed) {
      finishRaceAndShowResults();
    } else {
      renderLiveRace();
    }
  } else {
    renderStrategy();
  }
}

init();
