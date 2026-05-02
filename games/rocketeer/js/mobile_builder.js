// ============================================================
// ROCKETEER - Mobile Builder
// ============================================================

const MobileBuilder = (() => {

    let activeSheet = null;   // 'parts' | 'stats' | 'launch' | null
    let pendingPartId = null; // pièce tap-to-place en attente
    let _domBuilt = false;    // guards against double buildDOM()

    // matchMedia is reliable across PWA, DevTools, orientation changes
    const mq = window.matchMedia('(max-width: 768px)');
    const isMobile = () => mq.matches;

    // ── Bootstrap ────────────────────────────────────────────
    function init() {
        if (!isMobile()) return;
        _ensureDOMBuilt();
        renderParts();
        syncStats();
        updateStats();
        syncLaunch();
        setTimeout(forcePWATabbar, 80);
        setTimeout(forcePWATabbar, 500);
    }

    function forcePWATabbar() {
        const tabbar = document.getElementById('m-tabbar');
        if (!tabbar) return;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.matchMedia('(display-mode: fullscreen)').matches
            || window.navigator.standalone === true;
        if (isStandalone || isMobile()) {
            tabbar.style.cssText = [
                'display:flex',
                'position:fixed',
                'bottom:0',
                'left:0',
                'right:0',
                'z-index:9999',
                'height:calc(54px + env(safe-area-inset-bottom, 0px))',
                'padding-bottom:env(safe-area-inset-bottom, 0px)',
                'background-color:#080e1c',
                'border-top:1px solid rgba(80,140,220,0.25)',
            ].join(';');
        }
    }

    // Build the mobile DOM once, then just show/hide on transitions
    function _ensureDOMBuilt() {
        if (_domBuilt) {
            // Already built — just make sure tabbar is visible
            const tb = document.getElementById('m-tabbar');
            if (tb) tb.style.display = 'flex';
            return;
        }
        buildDOM();
        bindTabs();
        _domBuilt = true;
    }

    // Called when leaving mobile mode — hide without destroying
    function _onLeavesMobile() {
        const tb = document.getElementById('m-tabbar');
        if (tb) tb.style.display = 'none';
        // Close any open sheet
        document.querySelectorAll('.m-sheet.open').forEach(s => s.classList.remove('open'));
        activeSheet = null;
    }

    // ── DOM ───────────────────────────────────────────────────
    function buildDOM() {
        if (document.getElementById('m-tabbar')) return;

        // Tab bar
        const tabbar = document.createElement('div');
        tabbar.id = 'm-tabbar';

        tabbar.innerHTML = `
            <button class="m-tab" id="mt-parts" onclick="MobileBuilder.toggle('parts')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
                ${t('rocketeer.menu.menu_parts')}
            </button>
            <button class="m-tab" id="mt-stats" onclick="MobileBuilder.toggle('stats')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
                </svg>
                ${t('rocketeer.menu.menu_stats')}
            </button>
            <button class="m-tab" id="mt-config" onclick="MobileBuilder.toggle('config')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="4" y1="21" x2="4" y2="14"/>
                    <line x1="4" y1="10" x2="4" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12" y2="3"/>
                    <line x1="20" y1="21" x2="20" y2="16"/>
                    <line x1="20" y1="12" x2="20" y2="3"/>
                    <circle cx="4" cy="12" r="2"/>
                    <circle cx="12" cy="10" r="2"/>
                    <circle cx="20" cy="14" r="2"/>
                </svg>
                ${t('rocketeer.menu.menu_config')}
            </button>
            <button class="m-tab active" id="mt-build" onclick="MobileBuilder.toggle('build')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M21 7.5a5 5 0 0 1-6.9 4.6l-6.7 6.7a2 2 0 1 1-2.8-2.8l6.7-6.7A5 5 0 0 1 16.5 3l-2.1 2.1 2.5 2.5L21 7.5z"/>
                </svg>
                ${t('rocketeer.menu.menu_build')}
            </button>

            <button class="m-tab tab-launch" id="mt-launch" onclick="MobileBuilder.toggle('launch')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                </svg>
                ${t('rocketeer.menu.menu_launch')}
            </button>
        `;

        // Sheet pièces
        const sheetParts = document.createElement('div');
        sheetParts.className = 'm-sheet';
        sheetParts.id = 'm-sheet-parts';
        sheetParts.innerHTML = `
            <div class="m-sheet-handle"></div>
            <div class="m-sheet-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg> ${t('rocketeer.menu.parts_catalog')}</div>
            <div class="m-sheet-body"><div class="m-parts-grid" id="m-parts-grid"></div></div>
        `;

        // Sheet stats
        const sheetStats = document.createElement('div');
        sheetStats.className = 'm-sheet';
        sheetStats.id = 'm-sheet-stats';
        sheetStats.innerHTML = `
            <div class="m-sheet-handle"></div>
            <div class="m-sheet-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
            </svg> ${t('rocketeer.menu.rocket_stats')}</div>
            <div class="m-sheet-body">
                <div class="m-stats-row">
                    <div class="m-stat"><div class="m-stat-label">${t('rocketeer.menu.stat_cost')}</div><div class="m-stat-value" id="stat-cost">0¢</div></div>
                    <div class="m-stat"><div class="m-stat-label">${t('rocketeer.menu.stat_mass')}</div><div class="m-stat-value" id="stat-mass">0t</div></div>
                    <div class="m-stat"><div class="m-stat-label">${t('rocketeer.menu.stat_dv')}</div><div class="m-stat-value" id="stat-dv">0</div></div>
                    <div class="m-stat"><div class="m-stat-label">${t('rocketeer.menu.stat_parts')}</div><div class="m-stat-value" id="stat-parts">0</div></div>
                    <div class="m-stat"><div class="m-stat-label">${t('rocketeer.menu.stat_twr')}</div><div class="m-stat-value" id="stat-twr">0</div></div>
                    <div class="m-stat"><div class="m-stat-label">${t('rocketeer.menu.stat_thrust')}</div><div class="m-stat-value" id="stat-thrust" style="color:#ff8030">0</div></div>
                </div>
                <div id="m-part-detail"></div>
            </div>
        `;

        const sheetConfig = document.createElement('div');
        sheetConfig.className = 'm-sheet';
        sheetConfig.id = 'm-sheet-config';
        sheetConfig.innerHTML = `
            <div class="m-sheet-handle"></div>
            <div class="m-sheet-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="4" y1="21" x2="4" y2="14"/>
                    <line x1="4" y1="10" x2="4" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12" y2="3"/>
                    <line x1="20" y1="21" x2="20" y2="16"/>
                    <line x1="20" y1="12" x2="20" y2="3"/>
                    <circle cx="4" cy="12" r="2"/>
                    <circle cx="12" cy="10" r="2"/>
                    <circle cx="20" cy="14" r="2"/>
                </svg> ${t('rocketeer.menu.menu_config')}
            </div>
            <div class="m-sheet-body" id="m-config-body">
                <div class="m-config-empty">${t('rocketeer.menu.select_part_hint')}</div>
            </div>
        `;

        // Sheet Build
        const sheetBuild = document.createElement('div');
        sheetBuild.className = 'm-sheet';
        sheetBuild.id = 'm-sheet-build';
        sheetBuild.innerHTML = `
            <div class="m-sheet-handle"></div>
            <div class="m-sheet-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M21 7.5a5 5 0 0 1-6.9 4.6l-6.7 6.7a2 2 0 1 1-2.8-2.8l6.7-6.7A5 5 0 0 1 16.5 3l-2.1 2.1 2.5 2.5L21 7.5z"/>
                </svg> ${t('rocketeer.menu.menu_build')}
            </div>
            <div class="m-sheet-body">
                <div class="m-section-header">${t('rocketeer.menu.tools')}</div>
                    <div class="m-action-grid">
                        <button class="m-action-btn danger" onclick="clearRocket()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18"/>
                        <path d="M8 6v14c0 1 1 2 2 2h4c1 0 2-1 2-2V6"/>
                    </svg>
                    ${t('rocketeer.menu.btn_clear')}
                </button>

                <button class="m-action-btn" onclick="deleteSelectedPart()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6 6 18"/>
                        <path d="M6 6l12 12"/>
                    </svg>
                    ${t('rocketeer.menu.btn_remove')}
                </button>
            </div>

            <!-- SECTION BUILD MODE -->
            <div class="m-section">
                <div class="m-section-header">${t('rocketeer.menu.build_mode')}</div>

                <div class="m-build-hint">
                    • ${t('rocketeer.menu.select_part')}<br>
                    • ${t('rocketeer.menu.tape_rocket')}<br>
                    • ${t('rocketeer.menu.selection_active')}
                </div>
            </div>

            <!-- SECTION TIP (cohérence UI comme stats) -->
            <div class="m-section">
                <div class="m-section-header">${t('rocketeer.menu.tip')}</div>

                <div class="m-stat">
                    <div class="m-stat-label">${t('rocketeer.menu.pro_tip')}</div>
                    <div class="m-stat-value">${t('rocketeer.menu.optimize_mass_dv')}</div>
                </div>
            </div>

        </div>
    `;

        // Sheet launch
        const sheetLaunch = document.createElement('div');
        sheetLaunch.className = 'm-sheet';
        sheetLaunch.id = 'm-sheet-launch';
        sheetLaunch.innerHTML = `
            <div class="m-sheet-handle"></div>
            <div class="m-sheet-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
            </svg> ${t('rocketeer.menu.menu_launch')}</div>
            <div class="m-sheet-body">
                <div id="m-launch-status"></div>
                <button id="m-btn-launch" disabled onclick="launchRocket()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px">
                        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                    </svg>
                    ${t('rocketeer.menu.btn_launch')}
                </button>
            </div>
        `;

        // Hint placement
        const hint = document.createElement('div');
        hint.id = 'm-place-hint';
        hint.textContent = `✚ ${t('rocketeer.menu.tape_rocket')}`;

        const area = document.querySelector('.build-area');
        if (area) {
            area.appendChild(sheetParts);
            area.appendChild(sheetStats);
            area.appendChild(sheetConfig);
            area.appendChild(sheetBuild);
            area.appendChild(sheetLaunch);
            area.appendChild(hint);
        }
        const layout = document.querySelector('.builder-layout');
        if (layout) layout.appendChild(tabbar);
    }

    // ── Tabs ─────────────────────────────────────────────────
    function bindTabs() {
        const canvas = document.getElementById('build-canvas');
        if (canvas) {
            canvas.addEventListener('touchend', onCanvasTap, { passive: false });
            canvas.addEventListener('click', onCanvasTap);
        }
    }

    function toggle(sheet) {
        setSheet(activeSheet === sheet && sheet !== null ? null : sheet);
    }

    function setSheet(sheet) {
        activeSheet = sheet;

        ['parts', 'stats', 'config', 'build', 'launch'].forEach(s => {
            document.getElementById(`m-sheet-${s}`)?.classList.toggle('open', s === sheet);
        });

        document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('active'));
        const tabMap = { parts: 'mt-parts', stats: 'mt-stats', config: 'mt-config', build: 'mt-build', launch: 'mt-launch' };
        document.getElementById(sheet ? tabMap[sheet] : 'mt-canvas')?.classList.add('active');

        if (sheet === 'stats') syncStats();
        if (sheet === 'build') syncBuild();
        if (sheet === 'launch') syncLaunch();
    }

    // ── Render pièces ─────────────────────────────────────────
    function renderParts() {
        const grid = document.getElementById('m-parts-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const money = window.builderState?.money ?? 0;

        for (const [cat, meta] of Object.entries(PART_CATEGORIES)) {
            const partsInCat = Object.values(PARTS_CATALOG).filter(p => p.category === cat);
            if (!partsInCat.length) continue;

            const label = document.createElement('div');
            label.className = 'm-cat-label';
            label.innerHTML = `${meta.icon} ${t(`rocketeer.parts.categories.${cat}`)}`;
            grid.appendChild(label);

            for (const part of partsInCat) {
                const unlockedParts = window.builderState?.unlockedParts ?? [part.id];
                const isUnlocked = unlockedParts.includes(part.id);
                const buildCost = part.buildCost ?? Math.floor(part.price * 0.25);
                const rdCost = part.price;

                // What cost matters right now?
                const relevantCost = isUnlocked ? buildCost : rdCost;
                const canAfford = money >= relevantCost;

                const card = document.createElement('div');
                card.className = `m-part-card${(!canAfford) ? ' cant-afford' : ''}${!isUnlocked ? ' locked' : ''}`;
                card.dataset.partId = part.id;

                const costLabel = isUnlocked
                    ? `<div class="m-part-price ${canAfford ? '' : 'red'}">${buildCost.toLocaleString()}¢</div>`
                    : `<div class="m-part-price red">🔒 ${rdCost.toLocaleString()}¢</div>`;

                card.innerHTML = `
                    <div class="m-part-thumb">${isolateSVG(part.svg || '', part.id)}</div>
                    <div class="m-part-name">${part.name}</div>
                    ${costLabel}
                `;
                card.addEventListener('click', () => selectPart(part.id));
                grid.appendChild(card);
            }
        }
    }

    function isolateSVG(svg, partId) {
        // Remplace tous les id="xxx" et url(#xxx) par id="partId_xxx"
        return svg
            .replace(/\bid="([^"]+)"/g, (_, id) => `id="${partId}_${id}"`)
            .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${partId}_${id})`);
    }

    // ── Tap-to-place ─────────────────────────────────────────
    function selectPart(partId) {
        const def = PARTS_CATALOG[partId];
        if (!def) return;

        const unlockedParts = window.builderState?.unlockedParts ?? [];
        const isUnlocked = unlockedParts.includes(partId);
        const money = window.builderState?.money ?? 0;

        if (!isUnlocked) {
            // Try to unlock via R&D (delegate to desktop handler if available)
            if (typeof startDragFromInventory === 'undefined' && typeof dropPartOnCanvas === 'function') {
                // No R&D UI on mobile — show message
                if (typeof showToast === 'function') showToast(`🔒 Tap in Parts panel to unlock`);
            }
            // Let the desktop parts list handle unlock click
            const desktopItem = document.querySelector(`[data-part-id="${partId}"]`);
            if (desktopItem && !desktopItem.closest('#m-parts-grid')) desktopItem.click();
            return;
        }

        const buildCost = def.buildCost ?? Math.floor(def.price * 0.25);
        if (money < buildCost) {
            if (typeof showToast === 'function') showToast(`Pas assez ! Besoin de ${buildCost}¢`);
            return;
        }

        pendingPartId = partId;

        document.querySelectorAll('.m-part-card').forEach(c =>
            c.classList.toggle('selected', c.dataset.partId === partId)
        );

        const hint = document.getElementById('m-place-hint');
        if (hint) {
            hint.textContent = `✚ ${def.name} — ${t('rocketeer.menu.tape_rocket')}`;
            hint.classList.add('visible');
        }

        setSheet(null);
    }

    function onCanvasTap(e) {
        if (!pendingPartId) { setSheet(null); return; }
        if (e.type === 'touchend') e.preventDefault();

        const canvas = document.getElementById('build-canvas');
        if (!canvas) { clearPending(); return; }

        const rect = canvas.getBoundingClientRect();
        const src = e.changedTouches ? e.changedTouches[0] : e;
        const x = (src.clientX - rect.left) * (canvas.width / rect.width);
        const y = (src.clientY - rect.top) * (canvas.height / rect.height);

        if (typeof dropPartOnCanvas === 'function') dropPartOnCanvas(pendingPartId, x, y);

        clearPending();
        setTimeout(() => { renderParts(); syncStats(); syncLaunch(); }, 60);
    }

    function clearPending() {
        pendingPartId = null;
        document.querySelectorAll('.m-part-card').forEach(c => c.classList.remove('selected'));
        const hint = document.getElementById('m-place-hint');
        if (hint) hint.classList.remove('visible');
    }

    // ── Stats ─────────────────────────────────────────────────
    function syncStats() {
        if (!window.builderState) return;
        const allParts = builderState.placedParts;

        const connected = typeof getConnectedPartIds === 'function'
            ? getConnectedPartIds()
            : new Set(allParts.map(p => p.id));
        const parts = allParts.filter(p => connected.has(p.id));

        const cost = allParts.reduce((s, p) => s + (PARTS_CATALOG[p.partId]?.buildCost ?? 0), 0);
        const mass = typeof Rocket !== 'undefined' ? Rocket.totalMassFromParts(parts) : 0;
        const dvArr = typeof Rocket !== 'undefined' ? Rocket.calculateDeltaV(parts, window.builderState?.stages || []) : [];
        const dv = dvArr.reduce((s, d) => s + d.dv, 0);

        setText('stat-cost', `${cost.toLocaleString()}¢`);
        setText('stat-mass', `${(mass / 1000).toFixed(1)}t`);
        setText('stat-dv', `${dv.toLocaleString()}m/s`);
        setText('stat-parts', `${parts.length}`);
    }

    function showPartDetail(partId) {
        const def = PARTS_CATALOG[partId];
        const box = document.getElementById('m-part-detail');
        if (!def || !box) return;

        let rows = `
            <div class="m-detail-row"><span>Masse</span><span>${def.mass} kg</span></div>
            <div class="m-detail-row"><span>Prix</span><span>${(def.buildCost ?? def.price).toLocaleString()}¢</span></div>
        `;
        if (def.thrust) rows += `<div class="m-detail-row"><span>Thrust</span><span>${(def.thrust / 1000).toFixed(0)} kN</span></div>`;
        if (def.isp) rows += `<div class="m-detail-row"><span>ISP</span><span>${def.isp} s</span></div>`;
        if (def.fuelMass) rows += `<div class="m-detail-row"><span>Fuel</span><span>${def.fuelMass} kg</span></div>`;

        box.innerHTML = `
            <div class="m-detail-head">
                <div class="m-detail-thumb">${def.svg || ''}</div>
                <div>
                    <div class="m-detail-name">${def.name}</div>
                    <div class="m-detail-desc">${def.description}</div>
                </div>
            </div>
            <div class="m-detail-rows">${rows}</div>
        `;
        box.className = 'm-part-detail visible';
    }

    // ── Build ────────────────────────────────────────────────
    function syncBuild() {
        if (!window.builderState) return;
        const parts = builderState.placedParts;

        // Stats rapides
        const mass = Rocket.totalMassFromParts(parts);
        const dvArr = Rocket.calculateDeltaV(parts, builderState.stages || []);
        const dv = dvArr.reduce((s, d) => s + d.dv, 0);
        const cost = parts.reduce((s, p) => s + (PARTS_CATALOG[p.partId]?.buildCost ?? 0), 0);

        setText('ms-cost', `${cost.toLocaleString()}¢`);
        setText('ms-mass', `${(mass / 1000).toFixed(1)}t`);
        setText('ms-dv', `${dv.toLocaleString()}m/s`);
        setText('ms-parts', `${parts.length}`);

        // Boutons d'action
        const btnClear = document.getElementById('m-btn-clear');
        if (btnClear) btnClear.disabled = parts.length === 0;

        const btnLaunch = document.getElementById('m-btn-launch');
        if (btnLaunch) btnLaunch.disabled = parts.length === 0;
    }

    // ── Launch ────────────────────────────────────────────────
    function syncLaunch() {
        if (!window.builderState) return;
        const parts = builderState.placedParts;
        const ok = parts.some(p => PARTS_CATALOG[p.partId]?.category === 'cockpit')
            && parts.some(p => PARTS_CATALOG[p.partId]?.category === 'engine')
            && parts.some(p => PARTS_CATALOG[p.partId]?.category === 'tank');

        const btn = document.getElementById('m-btn-launch');
        if (btn) btn.disabled = !ok;

        const status = document.getElementById('m-launch-status');
        if (status) {
            if (ok) {
                status.textContent = `${t('rocketeer.menu.ready').replace('{budget}', builderState.money.toLocaleString())}`;
                status.className = 'ready';
            } else {
                const miss = [];
                if (!parts.some(p => PARTS_CATALOG[p.partId]?.category === 'cockpit')) miss.push(t("rocketeer.menu.add_cockpit"));
                if (!parts.some(p => PARTS_CATALOG[p.partId]?.category === 'engine')) miss.push(t("rocketeer.menu.add_engine"));
                if (!parts.some(p => PARTS_CATALOG[p.partId]?.category === 'tank')) miss.push(t("rocketeer.menu.add_fuel"));
                status.textContent = `${t("rocketeer.menu.add_title")} ${miss.join(' · ')}`;
                status.className = '';
            }
        }
    }

    function setText(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }

    function onStatsUpdate() {
        if (!isMobile()) return;
        syncStats(); syncLaunch(); renderParts();
    }

    return { init, toggle, onStatsUpdate, showPartDetail, renderParts, _leaveMobile: _onLeavesMobile, forcePWATabbar };
})();

window.addEventListener('DOMContentLoaded', () => {
    // Small delay to let the layout settle (important for PWA standalone)
    setTimeout(() => {
        if (window.matchMedia('(max-width: 768px)').matches) {
            MobileBuilder.init();
        }
    }, 100);
});

// React to screen width changes (DevTools emulation, orientation, window resize)
window.matchMedia('(max-width: 768px)').addEventListener('change', e => {
    if (e.matches) {
        // Entering mobile mode
        MobileBuilder.init();
    } else {
        // Leaving mobile mode — hide without destroying
        MobileBuilder._leaveMobile();
    }
});

window.MobileBuilder = MobileBuilder;