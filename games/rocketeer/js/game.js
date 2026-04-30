// ============================================================
// ROCKETEER
// ============================================================

const Game = (() => {
    const MIN_NORMAL_ZOOM = 0.2;
    const MAX_NORMAL_ZOOM = 50;
    const DEFAULT_NORMAL_ZOOM = 10;

    function clampNormalZoom(value) {
        return Math.max(MIN_NORMAL_ZOOM, Math.min(MAX_NORMAL_ZOOM, value));
    }

    let state = {
        timeScale: 1,
        physics: null, rocket: null, trajectory: [],
        originX: 0, maxDistance: 0,
        debris: [],   // ejected stages: [{parts, x, y, vx, vy, angle}]
        inputs: {
            throttle: 0, gimbalAngle: 0, rotateLeft: false, rotateRight: false
        },
        keys: {}, view: 'normal', zoom: DEFAULT_NORMAL_ZOOM, camX: 0, camY: 0,
        money: 0, running: false, outOfFuel: false, countdown: null,
        ended: false, paused: false, crashed: false,
        exploding: false, startTime: 0, time: 0,
        stages: [], currentStage: 0,
        lastFrameTime: 0, accumulator: 0, SIM_DT: 1 / 60,
        ghosts: [],
        cameraLocked: true, manualZoom: DEFAULT_NORMAL_ZOOM, camOffsetX: 0, camOffsetY: 0
    };

    // ─── INIT ──────────────────────────────────────────────
    function init() {
        const rocketRaw = sessionStorage.getItem('rocketeer_rocket');
        const moneyRaw = sessionStorage.getItem('rocketeer_money');
        if (!rocketRaw) { window.location.href = 'index.html'; return; }

        const rocket = JSON.parse(rocketRaw);
        state.money = parseInt(moneyRaw) || 0;
        state.rocket = rocket;
        state.stages = rocket.stages || [];
        state.currentStage = 0;
        // Engines start inactive, Stage 0 will activate them
        state.rocket.engines.forEach(eng => {
            eng.active = false;
        });
        // Spawn the rocket so its base sits exactly on the launch pad
        const vShift = (rocket._bottomOffset || 0);
        state.state = Rocket.initialState(rocket, 0, vShift, vShift);
        state.originX = 0;

        initCanvases(); initControls(); initHUD();
        updateMoneyHUD();

        // Detect parts not connected to the main rocket (cockpit) and turn them into debris immediately
        const root = state.rocket.placedParts.find(p => p.config?.isMain) ||
            state.rocket.placedParts.find(p => PARTS_CATALOG[p.partId]?.category === 'cockpit');

        if (root) {
            const disconnected = Rocket.getDisconnectedParts(state.rocket.placedParts, root.id);
            if (disconnected.length > 0) {
                // Remove from rocket
                state.rocket.placedParts = state.rocket.placedParts.filter(p => !disconnected.some(dp => dp.id === p.id));
                // Add to debris
                state.debris.push({
                    parts: disconnected,
                    x: state.state.x, y: state.state.y,
                    vx: 0, vy: 0,
                    angle: 0, angularVel: 0,
                    centerX: state.rocket._centerX || 0,
                    centerY: state.rocket._centerY || 0
                });
                // Rebuild rocket model
                const newRocket = Rocket.buildFromParts(state.rocket.placedParts, state.rocket.bonusUpgrades);
                state.rocket = { ...state.rocket, ...newRocket };
                // Update physics state (mass, fuel)
                const dryMass = Rocket.dryMassFromParts(state.rocket.placedParts);
                const fuelMass = newRocket.fuelGroups.reduce((s, g) => s + g.fuelMass, 0);
                state.state.mass = dryMass + fuelMass;
                state.state.fuelMass = fuelMass;
                state.state.bottomOffset = newRocket._bottomOffset;
            }
        }

        state.ghosts = JSON.parse(localStorage.getItem('rocketeer_ghosts') || '[]');
        state.running = true;
        state.startTime = performance.now();

        // Execute Stage 0 immediately upon launch
        stageRocket();

        requestAnimationFrame(gameLoop);
    }

    function updateMoneyHUD() {
        const el = document.getElementById('hud-money');
        if (el) el.textContent = `${state.money.toLocaleString()} ¢`;
    }

    function saveGhost() {
        // Only save if the mission reached a natural end (out of fuel) and didn't crash
        if (!state.outOfFuel || state.crashed) return;
        const ghost = {
            x: state.state.x, y: state.state.y,
            vx: state.state.vx, vy: state.state.vy,
            angle: state.state.angle,
            parts: state.rocket.placedParts,
            id: Date.now()
        };
        const saved = JSON.parse(localStorage.getItem('rocketeer_ghosts') || '[]');
        saved.push(ghost);
        if (saved.length > 20) saved.shift();
        localStorage.setItem('rocketeer_ghosts', JSON.stringify(saved));
    }

    // activateStageEngines removed as it's no longer used

    function initCanvases() {
        const nc = document.getElementById('game-canvas');
        const mc = document.getElementById('map-canvas');
        function resize() {
            nc.width = window.innerWidth; nc.height = window.innerHeight;
            mc.width = window.innerWidth; mc.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);
        state.normalCanvas = nc; state.normalCtx = nc.getContext('2d');
        state.mapCanvas = mc; state.mapCtx = mc.getContext('2d');

        // Map panning
        state.mapPanX = 0; state.mapPanY = 0;
        state.mapZoom = 1; state.mapPanning = false;
        mc.addEventListener('mousedown', e => { state.mapPanning = true; state.mapPanStart = { x: e.clientX - state.mapPanX, y: e.clientY - state.mapPanY }; });
        mc.addEventListener('mousemove', e => {
            if (!state.mapPanning) return;
            state.mapPanX = e.clientX - state.mapPanStart.x;
            state.mapPanY = e.clientY - state.mapPanStart.y;
        });
        mc.addEventListener('mouseup', () => state.mapPanning = false);
        mc.addEventListener('wheel', e => { e.preventDefault(); state.mapZoom *= e.deltaY > 0 ? 0.9 : 1.1; state.mapZoom = Math.max(0.1, Math.min(10, state.mapZoom)); }, { passive: false });
    }

    function initControls() {
        document.addEventListener('keydown', e => {
            state.keys[e.code] = true;
            switch (e.code) {
                case 'KeyX': state.inputs.throttle = 0; updateThrottleUI(); break;
                case 'KeyZ': state.inputs.throttle = 1; updateThrottleUI(); break;
                case 'KeyP': togglePause(); break;
                case 'KeyT': cycleTimeScale(); break;
                case 'Enter': case 'Space': e.preventDefault(); stageRocket(); break;
            }
        });

        state.normalCanvas.addEventListener('click', (e) => {
            if (!state.running || state.ended) return;
            handlePartClick(e);
        });

        // Manual Camera Panning (Standard View)
        let isPanning = false;
        let lastPanPos = { x: 0, y: 0 };
        state.normalCanvas.addEventListener('mousedown', e => {
            if (e.button === 0) { // Left click to drag
                isPanning = true;
                lastPanPos = { x: e.clientX, y: e.clientY };
            }
        });
        window.addEventListener('mousemove', e => {
            if (!isPanning) return;
            state.cameraLocked = false;
            const dx = (e.clientX - lastPanPos.x) / state.zoom;
            const dy = (e.clientY - lastPanPos.y) / state.zoom;
            state.camOffsetX -= dx;
            state.camOffsetY += dy; // flip y for dragging world
            lastPanPos = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mouseup', () => { isPanning = false; });
        state.normalCanvas.addEventListener('wheel', e => {
            if (state.view === 'map') return;
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            state.manualZoom = clampNormalZoom(state.manualZoom * factor);
        }, { passive: false });
        document.addEventListener('keyup', e => { state.keys[e.code] = false; });
        initTouchControls();
    }

    function initTouchControls() {
        const slider = document.getElementById('throttle-slider');
        if (slider) {
            slider.addEventListener('input', () => {
                state.inputs.throttle = parseInt(slider.value) / 100; updateThrottleUI();
            });
            slider.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
        }

        // Throttle Panel Drag support (PointerEvents for universal touch/mouse support)
        const tp = document.querySelector('.throttle-panel');
        if (tp) {
            const track = tp.querySelector('.throttle-track');
            const handleDrag = (e) => {
                const rect = track.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
                state.inputs.throttle = pct;
                if (slider) slider.value = Math.round(pct * 100);
                updateThrottleUI();
            };

            tp.addEventListener('pointerdown', e => {
                tp.setPointerCapture(e.pointerId);
                tp._dragging = true;
                handleDrag(e);
            });
            tp.addEventListener('pointermove', e => {
                if (tp._dragging) {
                    handleDrag(e);
                    e.preventDefault();
                }
            });
            tp.addEventListener('pointerup', e => {
                tp._dragging = false;
                tp.releasePointerCapture(e.pointerId);
            });
            tp.addEventListener('pointercancel', e => {
                tp._dragging = false;
                tp.releasePointerCapture(e.pointerId);
            });
        }

        document.getElementById('btn-stage')?.addEventListener('click', stageRocket);
        document.getElementById('btn-center')?.addEventListener('click', centerCamera);

        // Mobile Pan & Zoom
        let lastTouchDist = 0;
        let lastTouchX = 0, lastTouchY = 0;

        const nc = state.normalCanvas;
        nc.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            }
        }, { passive: false });

        nc.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                const dx = e.touches[0].clientX - lastTouchX;
                const dy = e.touches[0].clientY - lastTouchY;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    state.cameraLocked = false;
                    state.camOffsetX -= dx / state.zoom;
                    state.camOffsetY += dy / state.zoom;
                    lastTouchX = e.touches[0].clientX;
                    lastTouchY = e.touches[0].clientY;
                }
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                if (lastTouchDist > 0) {
                    const ratio = dist / lastTouchDist;
                    state.zoom = clampNormalZoom(state.zoom * ratio);
                    state.manualZoom = state.zoom;
                }
                lastTouchDist = dist;
            }
            e.preventDefault();
        }, { passive: false });
    }

    // ─── GAME LOOP ────────────────────────────────────────
    function gameLoop(timestamp) {
        if (!state.running && !state.exploding) return;
        const dt = Math.min((timestamp - state.lastFrameTime) / 1000, 0.05);
        state.lastFrameTime = timestamp;

        if (state.timeScale === 0) {
            requestAnimationFrame(gameLoop);
            return;
        }

        if (!state.paused && !state.ended && !state.exploding) {
            processInputs();

            // Son moteur continu - appelé à chaque frame
            if (state.running && !state.paused && !state.ended && !state.exploding) {
                window._currentThrottle = state.inputs.throttle;
                window._engineActive = state.state.hasThrust && state.state.fuelMass > 0;

                if (state.inputs.throttle > 0.05 && window._engineActive) {
                    playRocketeerSound('thruster_loop');
                }

                if (state.inputs.throttle <= 0.05 || !window._engineActive) {
                    window._rocketeerEngineLoop = false;
                } else {
                    window._rocketeerEngineLoop = true;
                }
            }

            state.accumulator += dt * state.timeScale;
            while (state.accumulator >= state.SIM_DT) {
                // Update Rocket if not exploding/ended
                if (!state.exploding && !state.ended) {
                    updatePhysics(state.SIM_DT);
                } else {
                    // Still update debris even if rocket is gone
                    updateDebrisOnly(state.SIM_DT);
                }

                // Update ghosts
                state.ghosts.forEach(g => {
                    const next = Physics.stepGhost(g, state.SIM_DT);
                    g.x = next.x; g.y = next.y; g.vx = next.vx; g.vy = next.vy;
                });
                state.accumulator -= state.SIM_DT;
            }

            if (Math.floor(timestamp / 500) !== Math.floor((timestamp - dt * 1000) / 500)) {
                state.trajectory.push({ x: state.state.x, y: state.state.y });
                if (state.trajectory.length > 600) state.trajectory.shift();
            }

            const dist = Physics.distanceFromOrigin(state.state, state.originX, 0);
            if (dist > state.maxDistance) state.maxDistance = dist;

            updateCamera();

            // Auto timescale: ralentir près du sol
            if (state.timeScale > 1 && state.state.altitude <= 100) {
                setTimeScale(1);
            }

            if (!state.paused) {
                // Crash detection
                if (state.state.crashed && !state.ended && !state._crashHandled) {
                    state._crashHandled = true;
                    state.crashed = true;
                    state.inputs.throttle = 0;
                    playRocketeerSound('crash');
                    triggerExplosion(state.state.x, state.state.y);
                }

                // Landing detection
                if (state.state.landed && !state.ended && !state._landingHandled && !state._crashHandled) {
                    state.state.landed = false; // reset pour éviter double-trigger
                    startLandingCountdown();
                }

                // End condition: No propulsion possible
                const canPropel = state.rocket.engines.some(eng => {
                    const group = (state.state.fuelGroups || []).find(g => g.id === eng.fuelGroupId);
                    return group && group.fuelMass > 0;
                });

                if (!canPropel && !state.outOfFuel && !state.ended && !state.exploding) {
                    state.outOfFuel = true;
                    state.inputs.throttle = 0;
                    startEndCountdown();
                }

                if (state.ended && !state._endHandled) {
                    state._endHandled = true;
                    setTimeout(showEndScreen, 1500);
                }
            }
        }

        if (state.exploding) {
            renderExplosion(timestamp);
        } else {
            render();
        }
        requestAnimationFrame(gameLoop);
    }

    function processInputs() {
        if (!state.running || state.paused) return;
        const keys = state.keys;
        const inputs = state.inputs;

        // Continuous throttle
        if (state.keys['ShiftLeft'] || state.keys['ShiftRight']) {
            state.inputs.throttle = Math.min(1, state.inputs.throttle + 0.015);
            updateThrottleUI();
        } else if (state.keys['ControlLeft'] || state.keys['ControlRight']) {
            state.inputs.throttle = Math.max(0, state.inputs.throttle - 0.015);
            updateThrottleUI();
        }

        // Single press keys
        if (state.keys['KeyC']) { state.keys['KeyC'] = false; centerCamera(); }
    }

    function updatePhysics(dt) {
        const newState = Physics.step(state.state, state.rocket, state.inputs, dt);
        state.state = newState;
        updateDebrisOnly(dt);
    }

    function updateDebrisOnly(dt) {
        for (let i = state.debris.length - 1; i >= 0; i--) {
            const d = state.debris[i];
            const next = Physics.stepDebris(d, dt);
            Object.assign(d, next);
        }
    }

    function updateCamera() {
        const phy = state.state;
        const alt = phy.altitude;

        // No more auto-zoom shrinking: keep rocket size stable
        const tz = 1.0 * state.manualZoom;
        state.zoom += (tz - state.zoom) * 0.1;

        if (state.cameraLocked) {
            // Smoothly follow the rocket
            state.camX += (phy.x - state.camX) * 0.1 * state.timeScale;
            state.camY += (phy.y + 50 / state.zoom - state.camY) * 0.1 * state.timeScale;
            // Clear manual offsets when locked
            state.camOffsetX = 0;
            state.camOffsetY = 0;
        } else {
            // Apply manual panning offsets relative to rocket or current position
            state.camX = phy.x + state.camOffsetX;
            state.camY = (phy.y + 50 / state.zoom) + state.camOffsetY;
        }
    }

    function startEndCountdown() {
        state.countdown = 10;
        const interval = setInterval(() => {
            if (state.ended) { clearInterval(interval); return; }
            if (state.countdown <= 0) {
                clearInterval(interval);
                state.ended = true;
                state.running = false;
                showEndScreen();
                return;
            }
            state.countdown--;
            updateHUD();
        }, 1000);
        updateHUD();
    }

    // ─── LANDING ────────────────────────────────────────
    function startLandingCountdown() {
        if (state._landingHandled || state.ended) return;
        state._landingCountdownActive = true;
        let count = 3;

        const cdEl = document.getElementById('fuel-countdown');

        const show = () => {
            if (!cdEl) return;
            cdEl.textContent = count > 0 ? `LANDING — Confirmed in ${count}s` : 'LANDING CONFIRMED';
            cdEl.style.display = 'block';
            cdEl.style.color = '#40ff90';
            cdEl.style.borderColor = 'rgba(64, 255, 144, 0.6)';
            cdEl.style.background = 'rgba(20, 80, 40, 0.15)';
            cdEl.style.animation = 'none'; // stoppe le blink rouge
        };

        show(); // affichage immédiat

        const interval = setInterval(() => {
            if (state.crashed || state.ended || !state._landingCountdownActive) {
                clearInterval(interval);
                state._landingCountdownActive = false;
                return;
            }
            if (state.state.altitude > 2) {
                clearInterval(interval);
                state._landingCountdownActive = false;
                if (cdEl) cdEl.style.display = 'none';
                return;
            }

            count--;
            show();

            if (count < 0) {
                clearInterval(interval);
                state._landingCountdownActive = false;
                state._landingHandled = true;
                triggerSuccessfulLanding();
            }
        }, 1000);
    }

    function triggerSuccessfulLanding() {
        if (state.ended) return;

        // Calcul du remboursement des pièces ayant atterri
        const recoveredCost = state.rocket.placedParts.reduce((sum, pp) => {
            const def = PARTS_CATALOG[pp.partId];
            return sum + (def?.buildCost || 0);
        }, 0);

        state._recoveryBonus = recoveredCost;
        state.outOfFuel = true; // déclenche la fin normale
        state.inputs.throttle = 0;
        playRocketeerSound('success');
        flashHUD(`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3"/><path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5"/></svg> LANDED! Ship recovered!`, '#40ff90');

        // Fin immédiate
        state.ended = true;
        state.running = false;
        setTimeout(showEndScreen, 1500);
    }

    // ─── EXPLOSION ────────────────────────────────────────
    let _expParts = [], _expStart = 0;
    function triggerExplosion(wx, wy) {
        _expStart = performance.now();
        _expParts = [];
        for (let i = 0; i < 90; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 60 + Math.random() * 350;
            _expParts.push({
                wx, wy, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                size: 2 + Math.random() * 9, life: 0.6 + Math.random() * 1.6,
                color: ['#ff4000', '#ff8000', '#ffcc00', '#ff2000', '#fff'][Math.floor(Math.random() * 5)]
            });
        }

        // Create individual debris for EACH part for a realistic shatter
        if (state.rocket && state.rocket.placedParts && state.rocket.placedParts.length > 0) {
            state.rocket.placedParts.forEach(p => {
                const angle = state.state.angle;
                const cos = Math.cos(angle);
                const sin = Math.sin(state.state.angle);

                // Calculate part world pos relative to rocket center
                const dx = p.x - (state.rocket._comX || 0);
                const dy = p.y - (state.rocket._comY || 0);
                const worldDx = Rocket.toWorldUnits(dx * cos + dy * sin);
                const worldDy = Rocket.toWorldUnits(-dy * cos + dx * sin);

                state.debris.push({
                    parts: [p],
                    x: state.state.x + worldDx,
                    y: state.state.y + worldDy,
                    vx: state.state.vx + (Math.random() - 0.5) * 15,
                    vy: state.state.vy + (Math.random()) * 15,
                    angle: state.state.angle + (Math.random() - 0.5),
                    angularVel: (Math.random() - 0.5) * 2,
                    centerX: p.x,
                    centerY: p.y
                });
            });
            state.rocket.placedParts = [];
        }

        state.exploding = true;
        // Le SVG est injecté directement avec le texte
        const explosionSVG = `
            <svg width="24" height="24" viewBox="0 0 32 32" style="vertical-align: middle; margin-right: 8px; filter: drop-shadow(0 0 3px #ff4000);">
                <path d="M16 2 L19 11 L28 8 L22 16 L30 22 L20 22 L16 30 L12 22 L2 22 L10 16 L4 8 L13 11 Z" 
                      fill="#ffff00" stroke="#ff4000" stroke-width="2" stroke-linejoin="round" />
            </svg>`;
        flashHUD(explosionSVG + ' KABOOM!', '#ff4000');
        setTimeout(() => {
            state.exploding = false; state.ended = true; state.running = false; showEndScreen();
        }, 2800);
    }

    function renderExplosion(timestamp) {
        const ctx = state.normalCtx;
        const W = ctx.canvas.width, H = ctx.canvas.height;
        const elapsed = (timestamp - _expStart) / 1000;
        Renderer.drawNormalView(ctx, state.state, state.rocket, state.inputs, state.camX, state.camY, state.zoom);
        // Flash
        if (elapsed < 0.35) {
            ctx.save(); ctx.globalAlpha = (0.35 - elapsed) / 0.35 * 0.9;
            ctx.fillStyle = '#ff8800'; ctx.fillRect(0, 0, W, H); ctx.restore();
        }
        // Particles
        ctx.save();
        for (const p of _expParts) {
            const dt = elapsed;
            const sx = W / 2 + (p.wx + p.vx * dt - state.camX) * state.zoom;
            const sy = H / 2 - (p.wy + p.vy * dt - 100 * dt * dt - state.camY) * state.zoom;
            const life = Math.max(0, 1 - dt / p.life);
            if (life <= 0) continue;
            ctx.globalAlpha = life; ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(sx, sy, p.size * life, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        updateHUD();
    }

    // ─── STAGING ──────────────────────────────────────────
    function stageRocket() {
        if (state.currentStage >= state.stages.length) return;

        // Cooldown to prevent double-firing (especially on mobile/click overlap)
        const now = Date.now();
        if (state._lastStageTime && now - state._lastStageTime < 350) return;
        state._lastStageTime = now;

        const currentStageDef = state.stages[state.currentStage];
        const stageIndex = state.currentStage;
        state.currentStage++;

        if (!currentStageDef || !currentStageDef.elements) return;

        let decouplerIds = new Set();
        let engineIds = new Set();
        let flashMsg = 'STAGE ACTIVATED!';

        currentStageDef.elements.forEach(el => {
            if (el.type === 'engine') engineIds.add(el.partId);
            if (el.type === 'decoupler') decouplerIds.add(el.partId);
        });

        // Activate engines
        engineIds.forEach(id => {
            const eng = state.rocket.engines.find(e => e.partInstanceId === id);
            if (eng) {
                eng.active = true;
            }
        });

        if (navigator.vibrate) {
            navigator.vibrate(200);
        }

        // Handle decouplers
        if (decouplerIds.size > 0) {
            flashMsg = 'STAGE SEPARATED!';
            playRocketeerSound('staging');
            let currentParts = [...state.rocket.placedParts];

            // Remove decouplers
            const droppedDecouplers = currentParts.filter(p => decouplerIds.has(p.id));
            currentParts = currentParts.filter(p => !decouplerIds.has(p.id));

            // Find root
            const root = currentParts.find(p => p.config?.isMain) ||
                currentParts.find(p => PARTS_CATALOG[p.partId]?.category === 'cockpit') ||
                currentParts[0];

            // Get disconnected parts
            const disconnected = Rocket.getDisconnectedParts(currentParts, root ? root.id : null);
            const disconnectedIds = new Set(disconnected.map(p => p.id));

            // Remove disconnected from rocket
            currentParts = currentParts.filter(p => !disconnectedIds.has(p.id));

            const allDroppedParts = [...droppedDecouplers, ...disconnected];

            // Create debris
            if (allDroppedParts.length > 0) {
                state.debris.push({
                    parts: allDroppedParts,
                    x: state.state.x, y: state.state.y,
                    vx: state.state.vx + (Math.random() - 0.5) * 2,
                    vy: state.state.vy - 5,
                    angle: state.state.angle,
                    angularVel: (Math.random() - 0.5) * 0.1,
                    centerX: state.rocket._centerX || 0,
                    centerY: state.rocket._centerY || 0
                });
            }

            const oldCX = state.rocket._comX || state.rocket._centerX || 0;
            const oldCY = state.rocket._comY || state.rocket._centerY || 0;

            // Update physical rocket model
            state.rocket.placedParts = currentParts;
            const newRocket = Rocket.buildFromParts(currentParts, state.rocket.bonusUpgrades);

            const newCX = newRocket._comX || newRocket._centerX || 0;
            const newCY = newRocket._comY || newRocket._centerY || 0;

            // Shift world position to compensate for center-of-mass jump during separation
            const dx = newCX - oldCX;
            const dy = newCY - oldCY;
            const cos = Math.cos(state.state.angle);
            const sin = Math.sin(state.state.angle);
            const worldDx = Rocket.toWorldUnits(dx);
            const worldDy = Rocket.toWorldUnits(dy);

            // Fixed rotation formula for builder-to-world space mapping
            state.state.x += worldDx * cos + worldDy * sin;
            state.state.y += -worldDy * cos + worldDx * sin;

            // Re-sync engine states and fuel
            newRocket.engines.forEach(ne => {
                const old = state.rocket.engines.find(oe => oe.partInstanceId === ne.partInstanceId);
                if (old) ne.active = old.active;
            });
            newRocket.fuelGroups.forEach(ng => {
                const old = (state.state.fuelGroups || []).find(og => og.id === ng.id);
                if (old) ng.fuelMass = old.fuelMass;
            });

            // Update main state
            state.rocket = {
                ...state.rocket,
                ...newRocket
            };
            state.state.fuelGroups = newRocket.fuelGroups;

            // Recalculate mass accurately: Dry mass of remaining parts + Current fuel remaining
            const dryMass = Rocket.dryMassFromParts(state.rocket.placedParts);
            const fuelMass = newRocket.fuelGroups.reduce((s, g) => s + g.fuelMass, 0);
            state.state.mass = dryMass + fuelMass;
            state.state.fuelMass = fuelMass;

            // CRITICAL: Update bottomOffset so we can land on the new bottom
            state.state.bottomOffset = newRocket._bottomOffset;
        }

        flashHUD(`STAGE ${stageIndex} ACTIVATED`, '#ff8030');
    }

    function centerCamera() {
        state.cameraLocked = true;
        state.camOffsetX = 0;
        state.camOffsetY = 0;
        state.manualZoom = DEFAULT_NORMAL_ZOOM;
    }

    function togglePause() {
        state.paused = !state.paused;
        const o = document.getElementById('pause-overlay');
        if (o) o.style.display = state.paused ? 'flex' : 'none';
    }

    // ─── RENDER ───────────────────────────────────────────
    function render() {
        if (state.view === 'normal') {
            Renderer.drawNormalView(state.normalCtx, state.state, state.rocket, state.inputs, state.camX, state.camY, state.zoom, state.debris);
        } else {
            Renderer.drawMapView(state.mapCtx, state.state, state.trajectory, state.originX, 0, state.debris, state.mapPanX || 0, state.mapPanY || 0, state.mapZoom || 1);
        }
        updateHUD();
    }

    // ─── HUD ──────────────────────────────────────────────
    function initHUD() { updateHUD(); updateThrottleUI(); }

    function handlePartClick(e) {
        const canvas = state.normalCanvas;
        const rect = canvas.getBoundingClientRect();

        // Use offsetX/Y for coordinates relative to the canvas element
        const canvasX = e.offsetX * (canvas.width / rect.width);
        const canvasY = e.offsetY * (canvas.height / rect.height);

        const W = canvas.width, H = canvas.height;
        const zoom = state.zoom;

        const dx = (canvasX - W / 2) / zoom;
        const dy = (canvasY - H / 2) / zoom;

        const cos = Math.cos(-state.state.angle);
        const sin = Math.sin(-state.state.angle);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;

        // Find part
        const part = state.rocket.placedParts.find(p => {
            const def = PARTS_CATALOG[p.partId];
            if (!def) return false;
            const unitScale = Rocket.builderUnitInMeters || 0.1;
            const rx = (p.x - (state.rocket._centerX || 0)) * unitScale;
            const ry = (p.y - (state.rocket._centerY || 0)) * unitScale;
            // Increased hit-box tolerance (especially for engines)
            const tolerance = def.category === 'engine' ? 2 : 1.2;
            return Math.abs(lx - rx) < (def.width * unitScale / 2 + tolerance) &&
                Math.abs(ly - ry) < (def.height * unitScale / 2 + tolerance);
        });

        if (part) {
            const def = PARTS_CATALOG[part.partId];
            if (def.category === 'engine') {
                const eng = state.rocket.engines.find(e => e.partInstanceId === part.id);
                if (eng) eng.active = !eng.active;
            } else if (def.category === 'decoupler') {
                detachPart(part.id);
            }
        }
    }

    function detachPart(partId) {
        const index = state.rocket.placedParts.findIndex(p => p.id === partId);
        if (index === -1) return;

        const part = state.rocket.placedParts[index];
        // Create debris
        if (state.debris) {
            state.debris.push({
                x: state.state.x, y: state.state.y,
                vx: state.state.vx + (Math.random() - 0.5) * 5,
                vy: state.state.vy + (Math.random() - 0.5) * 5,
                angle: state.state.angle,
                angularVel: (Math.random() - 0.5) * 0.2
            });
        }

        const oldCX = state.rocket._comX || state.rocket._centerX || 0;
        const oldCY = state.rocket._comY || state.rocket._centerY || 0;

        // Remove from placedParts and re-calculate rocket
        state.rocket.placedParts.splice(index, 1);
        const newRocket = Rocket.buildFromParts(state.rocket.placedParts);

        const newCX = newRocket._comX || newRocket._centerX || 0;
        const newCY = newRocket._comY || newRocket._centerY || 0;

        const dx = newCX - oldCX;
        const dy = newCY - oldCY;
        const cos = Math.cos(state.state.angle);
        const sin = Math.sin(state.state.angle);
        const worldDx = Rocket.toWorldUnits(dx);
        const worldDy = Rocket.toWorldUnits(dy);

        state.state.x += worldDx * cos + worldDy * sin;
        state.state.y += -worldDy * cos + worldDx * sin;

        // Update stages
        state.stages = Rocket.calculateStages(state.rocket.placedParts);
        state.currentStage = Math.min(state.currentStage, state.stages.length - 1);

        // Sync engine states and fuel
        newRocket.engines.forEach(ne => {
            const old = state.rocket.engines.find(oe => oe.partInstanceId === ne.partInstanceId);
            if (old) ne.active = old.active;
        });

        newRocket.fuelGroups.forEach(ng => {
            const old = (state.state.fuelGroups || []).find(og => og.id === ng.id);
            if (old) ng.fuelMass = old.fuelMass;
        });

        state.rocket = newRocket;
        state.state.fuelGroups = newRocket.fuelGroups;

        const dryMass = Rocket.dryMassFromParts(state.rocket.placedParts);
        const fuelMass = newRocket.fuelGroups.reduce((s, g) => s + g.fuelMass, 0);
        state.state.mass = dryMass + fuelMass;
        state.state.fuelMass = fuelMass;
        state.state.bottomOffset = newRocket._bottomOffset;

        flashHUD("PART SEPARATED", "#ffaa30");
    }

    function updateHUD() {
        const phy = state.state; if (!phy) return;
        setHUD('hud-alt', Physics.formatAltitude(phy.altitude));
        setHUD('hud-speed', Physics.formatSpeed(phy.speed));
        setHUD('hud-dist', Physics.formatDistance(state.maxDistance));
        const engines = state.rocket?.engines || [];
        const thrust = engines.reduce((s, e) => s + (e.active ? e.thrust : 0), 0) * state.inputs.throttle;
        const twr = phy.mass > 0 ? (thrust / (phy.mass * Physics.gravity(phy.altitude))).toFixed(2) : '0.00';
        setHUD('hud-twr', twr);

        // Countdown
        const cdEl = document.getElementById('fuel-countdown');
        if (cdEl) {
            if (state._landingCountdownActive) {
                // Ne pas toucher — géré par startLandingCountdown()
            } else if (state.outOfFuel && state.countdown != null) {
                cdEl.textContent = `⚠ OUT OF FUEL — End in ${state.countdown}s`;
                cdEl.style.display = 'block';
                if (state.timeScale !== 1) setTimeScale(1);
            } else if (phy.fuelMass <= 0) {
                cdEl.textContent = '⚠ FUEL DEPLETED';
                cdEl.style.display = 'block';
            } else {
                cdEl.style.display = 'none';
            }
        }

        // Fuel Groups
        const fuelContainer = document.querySelector('.hud-fuel-bar');
        fuelContainer.innerHTML = '';

        // Group identical groups (boosters)
        const groups = phy.fuelGroups || [];
        const seen = [];

        groups.forEach(g => {
            const existing = seen.find(s => s.total === g.totalFuelMass && s.current === g.fuelMass);
            if (existing) {
                existing.count++;
            } else {
                seen.push({ total: g.totalFuelMass, current: g.fuelMass, count: 1 });
            }
        });

        seen.forEach(s => {
            const pct = s.total > 0 ? (s.current / s.total) * 100 : 0;
            const row = document.createElement('div');
            row.className = 'fuel-bar-row';
            row.style.marginBottom = '4px';

            row.innerHTML = `
                <div class="fuel-label" style="display:flex; justify-content:space-between">
                    <span>${s.count > 1 ? 'x' + s.count : ''} FUEL</span>
                    <span>${Math.round(pct)}%</span>
                </div>
                <div class="fuel-bar-track">
                    <div class="fuel-bar-fill" style="width:${pct}%; background:${pct < 25 ? '#ff4020' : '#40ff90'}"></div>
                </div>
            `;
            fuelContainer.appendChild(row);
        });

        const tpct = document.getElementById('throttle-pct');
        if (tpct) tpct.textContent = `${Math.round(state.inputs.throttle * 100)}%`;

        const stEl = document.getElementById('hud-stage');
        const total = Math.max(1, state.stages.length);
        const current = Math.min(state.currentStage, total);
        if (stEl) stEl.textContent = `Stage ${current}/${total}`;

        const btnStage = document.getElementById('btn-stage');
        if (btnStage) {
            const finished = state.currentStage >= state.stages.length;
            btnStage.disabled = finished;
            btnStage.style.opacity = finished ? '0.3' : '1';
            btnStage.style.pointerEvents = finished ? 'none' : 'auto';
            const label = btnStage.querySelector('span');
            if (label) label.textContent = finished ? 'DONE' : 'STAGE';
        }

        // SAS display hidden as it's disabled
        const sasEl = document.getElementById('hud-sas');
        if (sasEl) sasEl.style.display = 'none';

        // Time
        const tEl = document.getElementById('hud-time');
        if (tEl) tEl.textContent = `${Math.floor(phy.time)}s`;
    }

    function setHUD(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

    function updateThrottleUI() {
        const s = document.getElementById('throttle-slider'); if (s) s.value = state.inputs.throttle * 100;
        const p = document.getElementById('throttle-pct'); if (p) p.textContent = `${Math.round(state.inputs.throttle * 100)}%`;
        const f = document.getElementById('throttle-fill'); if (f) f.style.height = `${state.inputs.throttle * 100}%`;
    }

    let _fto = null;
    function flashHUD(msg, color) {
        const el = document.getElementById('hud-flash');
        if (!el) return;

        // Utilisation de innerHTML pour interpréter le code SVG
        el.innerHTML = msg;

        el.style.color = color || '#fff';
        el.style.opacity = '1';

        if (_fto) clearTimeout(_fto);
        _fto = setTimeout(() => el.style.opacity = '0', 2000);
    }

    // ─── END SCREEN ───────────────────────────────────────
    function showEndScreen() {
        let baseReward = Rocket.calculateReward(state.maxDistance, state.state.time) || 0;
        let multiplier = (state.rocket.rewardMultiplier || 1);
        if (isNaN(multiplier)) multiplier = 1;
        let reward = Math.floor(baseReward * multiplier);

        if (state.crashed) reward = 0;

        // TODO : GERER LE PARAVHUTE : REWARD + PRIX FUSEE REMBOURSÉ

        if (!state.crashed) {
            playRocketeerSound('success');
        }

        const recoveryBonus = state._recoveryBonus || 0;
        const newMoney = state.money + reward + recoveryBonus;

        // Update state so Retry/Builder actions use the new balance
        state.money = newMoney;
        updateMoneyHUD();

        try {
            const saved = JSON.parse(localStorage.getItem('rocketeer_save') || '{}');
            saved.money = newMoney;
            localStorage.setItem('rocketeer_save', JSON.stringify(saved));
        } catch (e) { }

        const overlay = document.getElementById('end-overlay'); if (!overlay) return;
        const titleEl = overlay.querySelector('.end-title');
        const iconContainer = document.getElementById('end-icon-svg');

        if (titleEl) titleEl.textContent = state.crashed ? 'KABOOM — Mission Failed' : 'Mission Success';
        if (iconContainer) {
            iconContainer.innerHTML = state.crashed
                ? `<svg width="48" height="48" viewBox="0 0 32 32" style="vertical-align: middle; margin-right: 8px; filter: drop-shadow(0 0 3px #ff4000);"><path d="M16 2 L19 11 L28 8 L22 16 L30 22 L20 22 L16 30 L12 22 L2 22 L10 16 L4 8 L13 11 Z" fill="#ffff00" stroke="#ff4000" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" /></svg>`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3"/><path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5"/></svg>`;
            iconContainer.style.color = state.crashed ? '#ff4040' : '#40ff90';
        }

        document.getElementById('end-distance').textContent = Physics.formatDistance(state.maxDistance);

        const rewardEl = document.getElementById('end-reward');
        if (rewardEl) {
            rewardEl.textContent = `+${reward.toLocaleString()} ¢`;
            const launchCost = state.rocket._buildCost || 0;
            rewardEl.style.color = reward >= launchCost ? '#40ff90' : '#ff4040';
        }

        // Use the total element or add a sub-row for recovery
        const totalEl = document.getElementById('end-total');
        const recRow = document.getElementById('end-recovery-row');
        const recEl = document.getElementById('end-recovery');
        if (recRow && recEl) {
            if (recoveryBonus > 0) {
                recEl.textContent = `+${recoveryBonus.toLocaleString()} ¢`;
                recRow.style.display = 'flex';
            } else {
                recRow.style.display = 'none';
            }
        }

        if (totalEl) {
            totalEl.textContent = `${newMoney.toLocaleString()} ¢`;
        }
        overlay.style.display = 'flex';
    }

    function retryFlight() {
        saveGhost();
        const cost = state.rocket._buildCost || 0;
        if (state.money < cost) {
            alert("Not enough credits to rebuild the rocket!");
            goToBuilder();
            return;
        }

        state.money -= cost;
        updateMoneyHUD();
        // Persistence
        try {
            const saved = JSON.parse(localStorage.getItem('rocketeer_save') || '{}');
            saved.money = state.money;
            localStorage.setItem('rocketeer_save', JSON.stringify(saved));
        } catch (e) { }

        sessionStorage.setItem('rocketeer_money', state.money);
        window.location.reload();
    }
    function goToBuilder() {
        saveGhost();
        window.location.href = 'index.html';
    }
    function _getTime() { return state.state ? state.state.time : 0; }
    function _setThrottle(pct) { state.inputs.throttle = Math.max(0, Math.min(1, pct)); updateThrottleUI(); }

    function setTimeScale(v) {
        state.timeScale = v;

        // Si x0 = pause, mais SANS overlay pause
        if (v === 0) {
            state.paused = false;   // on force le jeu à continuer
        }

        flashHUD(`Time Warp: x${v}`, '#40c0ff');
    }

    function toggleTimeScale() {
        const menu = document.getElementById('time-scale-menu');
        if (!menu) return;

        // Toggle visible / hidden
        menu.style.display = (menu.style.display === 'flex') ? 'none' : 'flex';
    }

    function setTimeScale(v) {
        state.timeScale = v;

        // x0 = pause physique mais HUD actif
        if (v === 0) {
            state.paused = false; // on force pas l’overlay pause
        }

        // Update label
        const lbl = document.getElementById('time-scale-label');
        if (lbl) lbl.textContent = `x${v}`;

        // Feedback visuel
        flashHUD(`Time Scale: x${v}`, '#40c0ff');

        // Fermer le menu
        const menu = document.getElementById('time-scale-menu');
        if (menu) menu.style.display = 'none';

        // Highlight active option
        document.querySelectorAll('.ts-option').forEach(o => {
            o.classList.toggle('active', parseFloat(o.dataset.v) === v);
        });
    }

    function cycleTimeScale() {
        const scales = [0, 1, 2, 4, 8, 15];
        let idx = scales.indexOf(state.timeScale);
        if (idx === -1) idx = 1;
        const next = scales[(idx + 1) % scales.length];
        setTimeScale(next);
    }



    return { init, retryFlight, goToBuilder, stageRocket, centerCamera, togglePause, _getTime, _setThrottle, setTimeScale, toggleTimeScale };
})();

document.addEventListener('DOMContentLoaded', () => {
    Game.init();
});

document.querySelectorAll('.ts-option').forEach(opt => {
    opt.addEventListener('click', () => {
        const v = parseFloat(opt.dataset.v);
        Game.setTimeScale(v);
    });
});

window.Game = Game;

// ─── RULES PAGINATION ───────────────────────────────────
const Rules = (() => {
    let currentPage = 0;
    const pages = [
        {
            title: "1. Assembly",
            content: `
                <p>Drag parts from the catalog. They snap to connection nodes.</p>
                <ul>
                    <li><b>Core:</b> Every rocket needs a Cockpit, Fuel, and Engine.</li>
                    <li><b>Staging:</b> Use Decouplers to drop empty tanks and ignite the next phase.</li>
                    <li><b>TWR:</b> Thrust-to-Weight Ratio must be > 1.0 to lift off.</li>
                </ul>
            `
        },
        {
            title: "2. Flight Controls",
            content: `
                <ul>
                    <li><span class="key">Shift</span> / <span class="key">Ctrl</span> Throttle Control</li>
                    <li><span class="key">Space</span> Next Stage / Decouple</li>
                    <li><span class="key">T</span> Cycle Time Scale (1x, 2x, 4x, 8x, 15x)</li>
                    <li><span class="key">C</span> Center Camera</li>
                    <li><b>Note:</b> Manual rotation is disabled. Balancing is done via design!</li>
                </ul>
            `
        },
        {
            title: "3. Economy",
            content: `
                <ul>
                    <li><b>Distance:</b> 1¢ per 100m reached.</li>
                    <li><b>Speed Bonus:</b> Faster missions earn up to +10% extra!</li>
                    <li><b>Milestones:</b> Massive grants for reaching 100km, 500km, etc.</li>
                    <li><b>R&D:</b> Spend credits to improve ISP, Thrust, and Science.</li>
                </ul>
            `
        },
        {
            title: "4. Realism & Physics",
            content: `
                <ul>
                    <li><b>Torque:</b> If thrust is off-center from the Center of Mass (CoM), the rocket will tilt.</li>
                    <li><b>Aerodynamics:</b> Air density drops with altitude. Fins help stabilize in low atmosphere.</li>
                    <li><b>Heat:</b> High-speed descent in atmosphere is dangerous!</li>
                </ul>
            `
        }
    ];

    function showPage(idx) {
        currentPage = Math.max(0, Math.min(pages.length - 1, idx));
        const target = document.getElementById('rules-content-target');
        const dots = document.getElementById('rules-dots');
        if (!target || !dots) return;

        const p = pages[currentPage];
        target.innerHTML = `<h2>${p.title}</h2><section>${p.content}</section>`;

        dots.innerHTML = pages.map((_, i) => `<div class="rule-dot ${i === currentPage ? 'active' : ''}"></div>`).join('');

        const prevBtn = document.getElementById('rules-prev');
        if (prevBtn) prevBtn.disabled = currentPage === 0;
        const nextBtn = document.getElementById('rules-next');
        if (nextBtn) nextBtn.disabled = currentPage === pages.length - 1;
    }

    return {
        init: () => showPage(0),
        nextPage: () => showPage(currentPage + 1),
        prevPage: () => showPage(currentPage - 1)
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    Rules.init();
});

window.Rules = Rules;
