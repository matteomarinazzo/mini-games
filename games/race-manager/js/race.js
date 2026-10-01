import { SLOT_COUNT, TYRE_COMPOUNDS, TYRE_LABELS } from './core/constants.js';
import { readSlot, writeSlot } from './core/storage.js';
import { formatGameDate, formatMoney, round2 } from './core/utils.js';
import { h, showModal, toast } from './ui.js';
import { CALENDAR_2026 } from './data/calendar-2026.js';
import { weekendFor } from './core/weekend.js';
import { initRaceState, serializeRaceState, deserializeRaceState, simulateLap, finishRace, orderPitStop, changePace, canPitThisLap, estimateWearPerLap } from './core/race-engine.js';

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
  const round = CALENDAR_2026.find((entry) => entry.id === roundId);
  if (!round) return fatal('Grand Prix introuvable.');

  if (loaded.save.schemaVersion < 5) return fatal('Veuillez retourner au menu principal pour migrer votre sauvegarde vers la V4.');
  if (loaded.save.gameDate !== round.raceDate && !loaded.save.weekends[round.id]?.race?.results?.length) return fatal('La course n’est pas accessible à cette date.');
  run(loaded.save, round);
}

function run(save, round) {
  const playerTeam = save.teams.find((team) => team.id === save.playerTeamId);
  const driverById = (id) => save.drivers.find((driver) => driver.id === id);
  const persist = () => writeSlot(slotId, save);
  document.documentElement.style.setProperty('--team', playerTeam.color);
  document.getElementById('hdrTeam').textContent = playerTeam.name;
  document.getElementById('hdrBalance').textContent = `Solde : ${formatMoney(playerTeam.balance)}`;
  document.getElementById('backLink').href = `home.html?slot=${slotId}`;

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
        startCompound: 'medium',
        pace: 'balanced',
        riskLevel: 'normal',
        stops: [{ lap: Math.floor(circuitData(round.id).laps * 0.45), compound: 'hard' }]
      };
    }
  }

  function estimateStints(strat, totalLaps) {
    const stints = [];
    let currentLap = 0;
    let currentCompound = strat.startCompound;
    let currentState = 100;

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
        currentState -= estimateWearPerLap(round.id, currentCompound, strat.pace);
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
    const stints = estimateStints(strat, totalLaps);
    const colors = { soft: '#ff4d4d', medium: '#ffd633', hard: '#ffffff', intermediate: '#4da6ff', wet: '#0059b3' };

    const mapX = (lap) => (lap / totalLaps) * 1000;
    const mapY = (state) => 200 - (state / 100) * 200;
    const y30 = mapY(30); // Puncture threshold

    let html = `<svg viewBox="0 0 1000 200" style="width: 100%; max-height: 200px; display: block; background: #1a1a24; border-radius: 4px; font-family: monospace;">`;

    // Threshold line
    html += `<line x1="0" y1="${y30}" x2="1000" y2="${y30}" stroke="rgba(255,0,0,0.5)" stroke-width="2" stroke-dasharray="5,5" />`;
    html += `<text x="5" y="${y30 - 5}" fill="rgba(255,0,0,0.7)" font-size="12">30% (Risque crevaison)</text>`;

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
          h('p', { class: 'muted', text: `${round.name} · ${weekend.weather === 'rain' ? '🌧️ Pluie' : weekend.weather === 'mixed' ? '⛅ Mixte' : '☀️ Sec'} · ${totalLaps} tours` })
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

  function circuitData(id) {
    return { laps: raceState ? raceState.laps : 58 };
  }

  let playSpeed = 0;
  let simTimer = null;
  let gapMode = 'leader'; // 'leader' or 'ahead'

  function setPlaySpeed(speed) {
    playSpeed = speed;
    if (simTimer) clearTimeout(simTimer);

    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('btn--primary'));
    const activeBtn = document.getElementById(`btn-speed-${speed}`);
    if (activeBtn) activeBtn.classList.add('btn--primary');

    if (speed > 0 && !raceState.completed) {
      scheduleNextLap();
    }
  }

  function scheduleNextLap() {
    if (playSpeed <= 0 || raceState.completed) return;

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
    }

    // Le classement et les couleurs sont rendus à partir du même état final du tour.
    // Aucune interpolation DOM ne peut donc afficher une couleur sur une mauvaise ligne.
    updateLiveRaceUI();

    if (raceState.completed) {
      finishRaceAndShowResults();
      return;
    }

    weekend.race.state = serializeRaceState(raceState);
    weekend.race.log = raceState.log.slice(0, 100);
    persist();

    if (needsPause) {
      setPlaySpeed(0);
    } else {
      simTimer = setTimeout(scheduleNextLap, 5000 / playSpeed);
    }
  }

  function finishRaceAndShowResults() {
    if (simTimer) clearTimeout(simTimer);
    const res = finishRace(raceState, save);
    if (!res.ok) { toast(res.error, { error: true }); return; }
    persist();
    renderResults();
  }

  async function openPitMenu(driverId) {
    const choice = await showModal({
      title: 'Arrêt aux stands',
      body: h('p', { text: 'Choisissez le composé de pneus à monter pour le prochain tour :' }),
      actions: [
        ...TYRE_COMPOUNDS.map(c => ({ label: TYRE_LABELS[c], value: c, variant: 'btn--primary' })),
        { label: 'Annuler', value: null }
      ]
    });
    if (choice) {
      const ok = orderPitStop(raceState, driverId, choice);
      if (ok.ok) toast(`Arrêt programmé pour le prochain tour (${TYRE_LABELS[choice]}).`);
      else toast(ok.error, { error: true });
      updateLiveRaceUI();
    }
  }

  function updateLiveRaceUI() {
    document.getElementById('liveLapInfo').textContent = `Tour ${raceState.currentLap}/${raceState.laps}`;

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
        h('td', { text: d.abbr, title: d.name }),
        h('td', { class: 'gap', text: gapText }),
        h('td', { class: 'tyre' },
          isDnf ? null : h('span', { class: `tyre-${entry.tyres.compound}`, text: entry.tyres.compound.charAt(0).toUpperCase() }),
          isDnf ? null : h('span', { class: `tyre-wear ${entry.tyres.wear < 20 ? 'wear-danger' : ''}`, text: `${Math.round(entry.tyres.wear)}%` })
        ),
        h('td', { text: entry.pitStops.length > 0 ? entry.pitStops.length : '-' }),
        h('td', {}, entry.isPlayer && !isDnf && canPitThisLap(raceState, entry.driverId) ? h('button', { class: 'btn', style: 'padding: 0.2rem 0.5rem; font-size: 0.8rem;', text: 'Pit', onClick: () => openPitMenu(entry.driverId) }) : null)
      );
    }));

    const logDiv = document.getElementById('liveLog');
    logDiv.replaceChildren(...raceState.log.map(msg => h('p', { text: msg })));
  }

  function renderLiveRace() {
    main.replaceChildren(
      h('div', { class: 'stack' },
        h('section', { class: 'card race-hero', style: 'margin-bottom: 1rem;' },
          h('div', { style: 'display: flex; justify-content: space-between; align-items: center;' },
            h('h1', { text: `Grand Prix · R${round.round}` }),
            h('h2', { id: 'liveLapInfo', style: 'color: var(--accent);' }, `Tour ${raceState.currentLap}/${raceState.laps}`)
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
            h('div', { style: 'overflow-x: auto;' },
              h('table', { class: 'standings-table' },
                h('thead', {}, h('tr', {}, h('th', { text: 'P' }), h('th', { text: 'Pilote' }), h('th', { text: 'Écart' }), h('th', { text: 'Pneus' }), h('th', { text: 'Arrêts' }), h('th', { text: 'Actions' }))),
                h('tbody', { id: 'liveStandingsBody' })
              )
            )
          ),

          h('section', { class: 'card', style: 'align-self: start;' },
            h('h2', { text: 'Événements', style: 'margin-top: 0;' }),
            h('div', { id: 'liveLog', class: 'race-log' })
          )
        )
      )
    );
    updateLiveRaceUI();
  }

  function renderResults() {
    const results = weekend.race.results;

    function resultList(res) {
      return h('ol', { class: 'result-list' }, res.map((row) => {
        const driver = driverById(row.driverId);
        const isDnf = row.status === 'dnf';
        return h('li', { class: driver.teamId === save.playerTeamId ? 'is-player' : '' },
          h('span', { class: 'result-list__position', text: String(row.position) }),
          h('strong', { text: driver.name }),
          h('span', { text: isDnf ? `DNF (${row.dnfReason})` : row.position === 1 ? 'Vainqueur' : `+${row.gap}s` }),
          h('span', { class: 'muted', style: 'font-size: 0.9rem;' }, `(${row.points} pts, ${row.pitStops} arrêts)`)
        );
      }));
    }

    main.replaceChildren(
      h('div', { class: 'stack' },
        h('section', { class: 'card race-hero' },
          h('h1', { text: `Résultats de la Course · R${round.round}` }),
          h('p', { text: round.name }),
          h('p', { class: 'muted', text: `${weekend.weather === 'rain' ? '🌧️ Pluie' : weekend.weather === 'mixed' ? '⛅ Mixte' : '☀️ Sec'} · ${weekend.race.rewards?.money > 0 ? `Gains : +${weekend.race.rewards.money} M€` : ''}` })
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
