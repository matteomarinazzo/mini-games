// ============================================================
// ROCKETEER - Menu
// ============================================================

const STARTING_MONEY = 5000;

var builderState = {
    money: STARTING_MONEY,
    unlockedParts: ['cockpit_basic'], // Starter parts
    placedParts: [],
    selectedPartId: null,
    dragItem: null,
    nextId: 1,
    buildCanvas: null,
    buildCtx: null,
    panX: 0, panY: 0,   // canvas panning offset
    isPanning: false,
    panStart: null,
    zoom: 1.0,
    stages: [{ id: 0, elements: [] }], // Manual stages array
    bonusUpgrades: {} // R&D levels per part ID
};

function loadBuilderState() {
    try {
        const saved = localStorage.getItem('rocketeer_save');
        if (saved) {
            const data = JSON.parse(saved);
            builderState.money = data.money ?? STARTING_MONEY;
            builderState.unlockedParts = data.unlockedParts ?? ['cockpit_basic'];
            builderState.placedParts = data.placedParts ?? [];
            builderState.nextId = data.nextId ?? 1;
            builderState.stages = data.stages ?? [{ id: 0, elements: [] }];
            builderState.bonusUpgrades = data.bonusUpgrades ?? {};
        }
    } catch (e) { }
}

function saveBuilderState() {
    try {
        localStorage.setItem('rocketeer_save', JSON.stringify({
            money: builderState.money,
            unlockedParts: builderState.unlockedParts,
            placedParts: builderState.placedParts,
            nextId: builderState.nextId,
            stages: builderState.stages,
            bonusUpgrades: builderState.bonusUpgrades
        }));
    } catch (e) { }
}

function openRestartConfirm() {
    document.getElementById('restart-confirm-overlay').style.display = 'flex';
}

function confirmRestart() {
    localStorage.removeItem('rocketeer_save');
    window.location.reload();
}

document.getElementById('restart-btn').addEventListener('click', openRestartConfirm);

// ─── INIT ────────────────────────────────────────────────
function initBuilder() {
    loadBuilderState();
    renderPartsList();
    initBuildCanvas();
    updateMoneyDisplay();
    updateStats();
    showPartInfo(null);
    drawBuildCanvas();

    document.addEventListener('keydown', e => {
        if (e.key === 'Delete' || e.key === 'Backspace') deleteSelectedPart();
        if (e.key === 'Escape') { builderState.selectedPartId = null; showPartInfo(null); drawBuildCanvas(); }
    });
}

function initZoom() {
    const canvas = builderState.buildCanvas;
    if (!canvas) return;
    let ld = null;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 2) { ld = dist(e.touches); }
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
        if (e.touches.length !== 2) { ld = null; return; }
        e.preventDefault();
        const d = dist(e.touches);
        if (ld && ld > 0) {
            const rawFactor = d / ld;
            const factor = 1 + (rawFactor - 1) * 0.4;
            const old = builderState.zoom ?? 1;
            const nz = Math.max(0.2, Math.min(5.0, old * factor));
            // Zoom around canvas center (no pan shift)
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const wx = (cx - builderState.panX) / old;
            const wy = (cy - builderState.panY) / old;
            builderState.zoom = nz;
            builderState.panX = cx - wx * nz;
            builderState.panY = cy - wy * nz;
            drawBuildCanvas();
        }
        ld = d;
    }, { passive: false });
    canvas.addEventListener('touchend', e => { if (e.touches.length < 2) ld = null; }, { passive: true });
}

// ─── PARTS LIST ──────────────────────────────────────────
function renderPartsList() {
    const container = document.getElementById('parts-list');
    if (!container) return;
    container.innerHTML = '';

    const grouped = {};
    for (const [id, def] of Object.entries(PARTS_CATALOG)) {
        if (!grouped[def.category]) grouped[def.category] = [];
        grouped[def.category].push({ id, ...def });
    }

    for (const [cat, meta] of Object.entries(PART_CATEGORIES)) {
        if (!grouped[cat]) continue;
        const catDiv = document.createElement('div');
        catDiv.className = 'part-category';
        catDiv.innerHTML = `<div class="cat-header"><span>${meta.icon}</span> ${t(`rocketeer.parts.categories.${cat}`)}</div>`;

        for (const part of grouped[cat]) {
            const isUnlocked = builderState.unlockedParts.includes(part.id);
            const level = builderState.bonusUpgrades[part.id] || 0;
            const currentBuildCost = Math.floor((part.buildCost || 0) * Math.pow(1.1, level));

            const canAffordRD = builderState.money >= part.price;
            const canAffordBuild = builderState.money >= currentBuildCost;

            const item = document.createElement('div');
            // CSS Rule: Red if cannot afford (build or research), Green if owned, Else Gray
            let statusClass = 'locked';
            if (isUnlocked) statusClass = 'unlocked';

            const affordClass = isUnlocked
                ? (canAffordBuild ? '' : 'cant-afford')
                : (canAffordRD ? '' : 'cant-afford');

            item.className = `part-item ${statusClass} ${affordClass}`;
            item.dataset.partId = part.id;

            const statusIcon = isUnlocked
                ? `<svg viewBox="0 0 24 24" fill="none" stroke="#40ff80" stroke-width="3" style="width:14px;height:14px"><path d="M20 6 9 17l-5-5"/></svg>`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;opacity:0.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

            const costLabel = isUnlocked
                ? `<span class="build-cost">Build: ${currentBuildCost} ¢</span>`
                : `<span class="rd-cost">R&D: ${part.price} ¢</span>`;

            item.innerHTML = `
              <div class="part-svg-thumb">${part.svg}</div>
              <div class="part-info">
                <div class="part-name"><span>${t(`rocketeer.parts.${part.id}.name`)}</span> ${statusIcon}</div>
                <div class="part-price">${costLabel}</div>
                <div class="part-desc">${t(`rocketeer.parts.${part.id}.description`)}</div>
              </div>`;

            if (isUnlocked) {
                item.addEventListener('mousedown', e => startDragFromInventory(e, part.id));
                item.addEventListener('touchstart', e => startDragFromInventory(e, part.id), { passive: false });
            } else {
                item.addEventListener('click', () => unlockPart(part.id));
            }
            catDiv.appendChild(item);
        }
        container.appendChild(catDiv);
    }
}

function unlockPart(partId) {
    const def = PARTS_CATALOG[partId];
    if (!def) return;
    if (builderState.money < def.price) {
        showModal(t("rocketeer.warnings.rd_failed"), t("rocketeer.warnings.no_money_rd").replace("{amount}", def.price - builderState.money) + " ¢", 'SYSTEM ERROR');
        return;
    }
    showModal(t("rocketeer.warnings.unlock_title").replace("{partName}", def.name.toUpperCase()), t("rocketeer.warnings.unlock_body").replace("{description}", t(`rocketeer.parts.${partId}.description`)).replace("{price}", def.price).replace("{buildCost}", def.buildCost), t("rocketeer.warnings.rd_approval"), () => {
        builderState.money -= def.price;
        builderState.unlockedParts.push(partId);
        playRocketeerSound('buy');
        updateMoneyDisplay();
        updateStats();
        renderPartsList();
        saveBuilderState();
        showToast(`${def.name} researched!`);
    }, true);
}

// ─── BUILD CANVAS ────────────────────────────────────────
function initBuildCanvas() {
    const canvas = document.getElementById('build-canvas');
    if (!canvas) return;
    builderState.buildCanvas = canvas;
    builderState.buildCtx = canvas.getContext('2d');

    resizeBuildCanvas();
    window.addEventListener('resize', resizeBuildCanvas);

    canvas.addEventListener('mousedown', onCanvasMouseDown);
    canvas.addEventListener('mousemove', onCanvasMouseMove);
    canvas.addEventListener('mouseup', onCanvasMouseUp);
    canvas.addEventListener('touchstart', onCanvasTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onCanvasTouchMove, { passive: false });
    canvas.addEventListener('touchend', onCanvasTouchEnd);
    canvas.addEventListener('contextmenu', e => { e.preventDefault(); onCanvasRightClick(e); });
    canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
    initZoom()
}

function resizeBuildCanvas() {
    const canvas = builderState.buildCanvas;
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    drawBuildCanvas();
}

function drawBuildCanvas() {
    const ctx = builderState.buildCtx, canvas = builderState.buildCanvas;
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const px = builderState.panX, py = builderState.panY;
    const zoom = builderState.zoom ?? 1;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.setTransform(zoom, 0, 0, zoom, px, py);

    const wx0 = (-px) / zoom, wx1 = (W - px) / zoom, wy0 = (-py) / zoom, wy1 = (H - py) / zoom;
    const cwx = (W / 2 - px) / zoom; // centre monde X

    // Grille
    ctx.strokeStyle = 'rgba(100,150,200,0.08)';
    ctx.lineWidth = 1 / zoom;
    const gs = 20;
    for (let x = Math.floor(wx0 / gs) * gs; x < wx1; x += gs) { ctx.beginPath(); ctx.moveTo(x, wy0); ctx.lineTo(x, wy1); ctx.stroke(); }
    for (let y = Math.floor(wy0 / gs) * gs; y < wy1; y += gs) { ctx.beginPath(); ctx.moveTo(wx0, y); ctx.lineTo(wx1, y); ctx.stroke(); }

    // Pièces
    const sorted = [...builderState.placedParts].sort((a, b) => a.y - b.y);
    const connected = getConnectedPartIds();
    for (const pp of sorted) {
        const def = PARTS_CATALOG[pp.partId]; if (!def) continue;
        const orphan = !connected.has(pp.id);
        if (orphan) {
            ctx.save(); ctx.strokeStyle = 'rgba(255,80,80,0.4)'; ctx.lineWidth = 1.5 / zoom;
            ctx.setLineDash([3 / zoom, 3 / zoom]);
            ctx.strokeRect(pp.x - def.width / 2 - 2, pp.y - def.height / 2 - 2, def.width + 4, def.height + 4);
            ctx.setLineDash([]); ctx.restore();
        }
        _drawPartWorld(ctx, def, pp.x - def.width / 2, pp.y - def.height / 2, orphan ? 0.35 : 1, !!pp.flipped);
    }

    // Ghost
    if (builderState.dragItem && builderState.dragItem.ghostX !== undefined) {
        const def = PARTS_CATALOG[builderState.dragItem.partId];
        if (def) {
            const gx = builderState.dragItem.ghostX, gy = builderState.dragItem.ghostY;
            _drawPartWorld(ctx, def, gx - def.width / 2, gy - def.height / 2, 0.7, !!builderState.dragItem.ghostFlipped);
            if (builderState.dragItem.isSnapped) {
                ctx.save(); ctx.strokeStyle = 'rgba(0,255,180,0.85)'; ctx.lineWidth = 2 / zoom;
                ctx.shadowColor = '#00ffb4'; ctx.shadowBlur = 12;
                ctx.strokeRect(gx - def.width / 2 - 3, gy - def.height / 2 - 3, def.width + 6, def.height + 6);
                ctx.restore();
            }
        }
    }

    // Sélection
    if (builderState.selectedPartId) {
        const pp = builderState.placedParts.find(p => p.id === builderState.selectedPartId);
        if (pp) {
            const def = PARTS_CATALOG[pp.partId];
            ctx.strokeStyle = '#40c0ff'; ctx.lineWidth = 2 / zoom; ctx.setLineDash([4 / zoom, 4 / zoom]);
            ctx.strokeRect(pp.x - def.width / 2 - 4, pp.y - def.height / 2 - 4, def.width + 8, def.height + 8);
            ctx.setLineDash([]);
        }
    }

    // Snap guides
    if (builderState.dragItem && builderState.dragItem.ghostX !== undefined) {
        const def = PARTS_CATALOG[builderState.dragItem.partId];
        const gx = builderState.dragItem.ghostX, gy = builderState.dragItem.ghostY;
        if (def && !def.isSidePart && Math.abs(gx - cwx) < 6 / zoom) {
            ctx.strokeStyle = 'rgba(255,200,0,0.55)'; ctx.lineWidth = 1 / zoom; ctx.setLineDash([5 / zoom, 4 / zoom]);
            ctx.beginPath(); ctx.moveTo(cwx, wy0); ctx.lineTo(cwx, wy1); ctx.stroke(); ctx.setLineDash([]);
        }
        if (builderState.dragItem.isSnapped && def) {
            ctx.strokeStyle = 'rgba(0,255,180,0.45)'; ctx.lineWidth = 1 / zoom; ctx.setLineDash([3 / zoom, 3 / zoom]);
            if (!def.isSidePart) {
                ctx.beginPath(); ctx.moveTo(wx0, gy - def.height / 2); ctx.lineTo(wx1, gy - def.height / 2); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(wx0, gy + def.height / 2); ctx.lineTo(wx1, gy + def.height / 2); ctx.stroke();
            } else {
                ctx.beginPath(); ctx.moveTo(gx - def.width / 2, wy0); ctx.lineTo(gx - def.width / 2, wy1); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(gx + def.width / 2, wy0); ctx.lineTo(gx + def.width / 2, wy1); ctx.stroke();
            }
            ctx.setLineDash([]);
        }
    }

    if (builderState.placedParts.length === 0) {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(100,150,200,0.4)'; ctx.font = '16px monospace'; ctx.textAlign = 'center';
        ctx.fillText('Drag parts here to build your rocket', W / 2, H / 2);
        ctx.fillText('⬅ Select from the parts list', W / 2, H / 2 + 30);
        ctx.restore();
    }

    ctx.restore();
}

function _drawPartWorld(ctx, def, x, y, alpha, flipped) {
    ctx.save(); ctx.globalAlpha = (ctx.globalAlpha ?? 1) * alpha;
    if (flipped) { ctx.translate(x + def.width, y); ctx.scale(-1, 1); } else { ctx.translate(x, y); }
    drawSimplePart(ctx, def);
    ctx.restore();
}

function drawPlacedPart(ctx, pp) {
    const def = PARTS_CATALOG[pp.partId];
    if (!def) return;
    const px = builderState.panX, py = builderState.panY;
    // pp.flipped = true quand la pièce est côté GAUCHE (x < centerX)
    const canvas = builderState.buildCanvas;
    const centerX = canvas.width / 2;
    const flipped = !!pp.flipped;

    // Pièces non connectées à la fusée principale → dessin fantôme
    const connected = getConnectedPartIds();
    const isOrphan = !connected.has(pp.id);

    ctx.save();
    if (isOrphan) {
        ctx.globalAlpha = 0.35;
        // Cadre rouge discret
        ctx.strokeStyle = 'rgba(255,80,80,0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(
            pp.x - def.width / 2 - 2 + px,
            pp.y - def.height / 2 - 2 + py,
            def.width + 4, def.height + 4
        );
        ctx.setLineDash([]);
    }

    if (typeof highlightedPartIds !== 'undefined' && highlightedPartIds.has(pp.id)) {
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 10;
        ctx.strokeRect(
            pp.x - def.width / 2 - 4 + px,
            pp.y - def.height / 2 - 4 + py,
            def.width + 8, def.height + 8
        );
        ctx.shadowBlur = 0;
    }

    ctx.restore();

    drawPartAt(ctx, def, pp.x - def.width / 2 + px, pp.y - def.height / 2 + py, isOrphan ? 0.35 : 1, flipped);
}

function drawPartAt(ctx, def, x, y, alpha, flipped = false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flipped) {
        // Miroir horizontal : translate à droite du bbox, scale -1 X
        ctx.translate(x + def.width, y);
        ctx.scale(-1, 1);
    } else {
        ctx.translate(x, y);
    }
    drawSimplePart(ctx, def);
    ctx.restore();
}

function drawPartPreview(ctx, def) {
    if (!def.img) return;
    const canv = ctx.canvas;
    ctx.clearRect(0, 0, canv.width, canv.height);
    const s = Math.min(canv.width / def.width, canv.height / def.height);
    const w = def.width * s, h = def.height * s;
    ctx.drawImage(def.img, (canv.width - w) / 2, (canv.height - h) / 2, w, h);
}

function drawSimplePart(ctx, def) {
    const w = def.width, h = def.height;
    if (def.img && def.img.naturalWidth > 0) {
        ctx.drawImage(def.img, 0, 0, w, h);
        return;
    }
    // Fallback if image not loaded yet

    switch (def.category) {
        case 'cockpit': {
            const g = ctx.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, '#8090a8'); g.addColorStop(0.5, '#d8e4f0'); g.addColorStop(1, '#607088');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.9, h * 0.5); ctx.lineTo(w * 0.9, h * 0.95);
            ctx.lineTo(w * 0.1, h * 0.95); ctx.lineTo(w * 0.1, h * 0.5); ctx.closePath();
            ctx.fill(); ctx.strokeStyle = '#405060'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#2878c4'; ctx.globalAlpha *= 0.85;
            ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.4, w * 0.2, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'tank': {
            const isLarge = w > 50, isSide = def.isSidePart;
            const g = ctx.createLinearGradient(0, 0, w, 0);
            if (isLarge) { g.addColorStop(0, '#904018'); g.addColorStop(0.4, '#f08030'); g.addColorStop(1, '#803010'); }
            else if (isSide) { g.addColorStop(0, '#406080'); g.addColorStop(0.4, '#80b0d0'); g.addColorStop(1, '#305070'); }
            else { g.addColorStop(0, '#888'); g.addColorStop(0.4, '#ddd'); g.addColorStop(1, '#777'); }
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.roundRect(w * 0.05, 0, w * 0.9, h, 6); ctx.fill();
            ctx.strokeStyle = isLarge ? '#602000' : '#555'; ctx.lineWidth = 1.5; ctx.stroke();
            break;
        }
        case 'engine': {
            const g = ctx.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, '#404858'); g.addColorStop(0.5, '#9098b0'); g.addColorStop(1, '#404858');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(w * 0.2, 0); ctx.lineTo(w * 0.8, 0); ctx.lineTo(w * 0.9, h * 0.55);
            ctx.lineTo(w * 0.7, h); ctx.lineTo(w * 0.3, h); ctx.lineTo(w * 0.1, h * 0.55); ctx.closePath();
            ctx.fill(); ctx.strokeStyle = '#202830'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#ff6030'; ctx.globalAlpha *= 0.6;
            ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.8, w * 0.2, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'decoupler': {
            const g = ctx.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, '#805020'); g.addColorStop(0.5, '#d0a030'); g.addColorStop(1, '#705010');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.roundRect(0, 0, w, h, 3); ctx.fill();
            ctx.strokeStyle = '#604010'; ctx.lineWidth = 1.5; ctx.stroke();
            // Separation line
            ctx.strokeStyle = '#ff8000'; ctx.lineWidth = 2; ctx.globalAlpha *= 0.6;
            ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
            break;
        }
        case 'fin': {
            ctx.fillStyle = '#607080';
            ctx.beginPath(); ctx.moveTo(w * 0.5, 0); ctx.lineTo(w, h * 0.9); ctx.lineTo(w * 0.5, h * 0.7); ctx.lineTo(0, h * 0.9); ctx.closePath();
            ctx.fill(); ctx.strokeStyle = '#304050'; ctx.lineWidth = 1.5; ctx.stroke();
            break;
        }
        case 'nosecone': {
            const g = ctx.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, '#808080'); g.addColorStop(0.4, '#d8d8d8'); g.addColorStop(1, '#707070');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(w * 0.5, 0);
            ctx.bezierCurveTo(w * 0.7, h * 0.3, w * 0.9, h * 0.6, w * 0.9, h);
            ctx.lineTo(w * 0.1, h); ctx.bezierCurveTo(w * 0.1, h * 0.6, w * 0.3, h * 0.3, w * 0.5, 0);
            ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#505050'; ctx.lineWidth = 1.5; ctx.stroke();
            break;
        }
        default: {
            ctx.fillStyle = '#607080';
            ctx.beginPath(); ctx.roundRect(0, 0, w, h, 4); ctx.fill();
        }
    }
}

function screenToWorld(sx, sy) {
    const z = builderState.zoom ?? 1;
    return { x: (sx - builderState.panX) / z, y: (sy - builderState.panY) / z };
}

function applyZoom(factor, pivotSX, pivotSY) {
    const old = builderState.zoom ?? 1;
    const nz = Math.max(0.2, Math.min(5.0, old * factor));
    if (nz === old) return;
    const wx = (pivotSX - builderState.panX) / old;
    const wy = (pivotSY - builderState.panY) / old;
    builderState.zoom = nz;
    builderState.panX = pivotSX - wx * nz;
    builderState.panY = pivotSY - wy * nz;
    drawBuildCanvas();
}

// ─── SNAP LOGIC ──────────────────────────────────────────
function snapPosition(partId, rawX, rawY, excludeId = null) {
    const w = screenToWorld(rawX, rawY);
    return _snapWorld(partId, w.x, w.y, excludeId);
}

function _snapWorld(partId, wx, wy, excludeId = null) {
    const def = PARTS_CATALOG[partId];
    if (!def) return { x: wx, y: wy, snapped: false, flipped: false };
    const canvas = builderState.buildCanvas;
    const zoom = builderState.zoom ?? 1;
    const cwx = (canvas.width / 2 - builderState.panX) / zoom;
    let x = wx, y = wy, flipped = false;
    if (!def.isSidePart && Math.abs(x - cwx) < 30 / zoom) x = cwx;
    const others = builderState.placedParts.filter(p => p.id !== excludeId);
    if (others.length === 0) return { x, y, snapped: true, flipped: false };
    const PULL = 40 / zoom, CRAN = 15;
    let best = PULL, sx = x, sy = y, snapped = false;

    for (const pp of others) {
        const pd = PARTS_CATALOG[pp.partId]; if (!pd) continue;
        const top = pp.y - pd.height / 2, bot = pp.y + pd.height / 2;
        const left = pp.x - pd.width / 2, right = pp.x + pd.width / 2;

        // Pour les pièces empilables (verticales)
        if (!def.isSidePart && Math.abs(x - pp.x) < Math.max(def.width, pd.width) * 0.8) {
            // Le centre de la nouvelle pièce = centre de la pièce existante
            let sxCalc = pp.x;

            // Ajustement pour éviter les débordements latéraux (optionnel)
            const minX = left + def.width / 2;
            const maxX = right - def.width / 2;
            if (minX <= maxX) {
                sxCalc = Math.min(maxX, Math.max(minX, sxCalc));
            }

            // Snap au-dessus (nouvelle pièce placée AU-DESSUS de l'existante)
            let d = Math.abs(y - top);
            if (d < best) {
                best = d;
                snapped = true;
                sy = top - def.height / 2;  // Nouvelle pièce au-dessus
                sx = sxCalc;
                flipped = false;
            }

            // Snap en-dessous (nouvelle pièce placée EN-DESSOUS de l'existante)
            d = Math.abs(y - bot);
            if (d < best) {
                best = d;
                snapped = true;
                sy = bot + def.height / 2;  // Nouvelle pièce en-dessous
                sx = sxCalc;
                flipped = false;
            }
        }

        // Pour les pièces latérales
        if (def.isSidePart || def.attachSide) {
            if (Math.abs(y - pp.y) < pd.height * 1.2) {
                // Snap à gauche
                let d = Math.abs(x - left);
                if (d < best) {
                    best = d;
                    snapped = true;
                    sx = left - def.width / 2;
                    sy = pp.y + Math.round((y - pp.y) / CRAN) * CRAN;
                    const limit = def.height * 0.8;
                    sy = Math.max(top - limit, Math.min(bot + limit, sy));
                    flipped = true;
                }

                // Snap à droite
                d = Math.abs(x - right);
                if (d < best) {
                    best = d;
                    snapped = true;
                    sx = right + def.width / 2;
                    sy = pp.y + Math.round((y - pp.y) / CRAN) * CRAN;
                    const limit = def.height * 0.8;
                    sy = Math.max(top - limit, Math.min(bot + limit, sy));
                    flipped = false;
                }
            }
        }
    }

    if (snapped) { x = sx; y = sy; }

    // Vérifier les chevauchements
    for (const pp of others) {
        const od = PARTS_CATALOG[pp.partId];
        if (!od) continue;
        if (checkOverlap(x, y, def.width, def.height, pp.x, pp.y, od.width, od.height, 1)) {
            snapped = false;
            break;
        }
    }
    return { x, y, snapped, flipped };
}

function checkOverlap(x1, y1, w1, h1, x2, y2, w2, h2, padding = 4) {
    return !(x1 + w1 / 2 - padding <= x2 - w2 / 2 ||
        x1 - w1 / 2 + padding >= x2 + w2 / 2 ||
        y1 + h1 / 2 - padding <= y2 - h2 / 2 ||
        y1 - h1 / 2 + padding >= y2 + h2 / 2);
}

function drawSnapGuides(ctx) {
    if (!builderState.dragItem || builderState.dragItem.ghostX === undefined) return;
    const canvas = builderState.buildCanvas;
    const W = canvas.width, H = canvas.height;
    const px = builderState.panX, py = builderState.panY;
    const gx = builderState.dragItem.ghostX + px;
    const gy = builderState.dragItem.ghostY + py;
    const def = PARTS_CATALOG[builderState.dragItem.partId];
    const cx = W / 2 + px;

    ctx.save();

    // Ligne d'axe centre
    if (def && !def.isSidePart && Math.abs(builderState.dragItem.ghostX - W / 2) < 6) {
        ctx.strokeStyle = 'rgba(255,200,0,0.55)';
        ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
        ctx.setLineDash([]);
    }

    // Lignes de snap (haut/bas ou gauche/droite)
    if (builderState.dragItem.isSnapped && def) {
        ctx.strokeStyle = 'rgba(0,255,180,0.45)';
        ctx.lineWidth = 1; ctx.setLineDash([3, 3]);

        if (!def.isSidePart) {
            ctx.beginPath(); ctx.moveTo(0, gy - def.height / 2); ctx.lineTo(W, gy - def.height / 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, gy + def.height / 2); ctx.lineTo(W, gy + def.height / 2); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(gx - def.width / 2, 0); ctx.lineTo(gx - def.width / 2, H); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(gx + def.width / 2, 0); ctx.lineTo(gx + def.width / 2, H); ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    ctx.restore();
}

function getConnectedPartIds() {
    const parts = builderState.placedParts;
    if (parts.length === 0) return new Set();

    // Racine = primary cockpit ou premier cockpit ou premier part
    const root = parts.find(p => p.config?.isMain)
        || parts.find(p => PARTS_CATALOG[p.partId]?.category === 'cockpit')
        || parts[0];

    // Adjacence : deux pièces se touchent si leurs AABB se chevauchent avec 4px de tolérance
    const TOUCH = 6;
    const adj = new Map();
    parts.forEach(p => adj.set(p.id, []));

    for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i], b = parts[j];
            const da = PARTS_CATALOG[a.partId], db = PARTS_CATALOG[b.partId];
            if (!da || !db) continue;
            const touching = !(
                a.x + da.width / 2 + TOUCH <= b.x - db.width / 2 ||
                a.x - da.width / 2 - TOUCH >= b.x + db.width / 2 ||
                a.y + da.height / 2 + TOUCH <= b.y - db.height / 2 ||
                a.y - da.height / 2 - TOUCH >= b.y + db.height / 2
            );
            if (touching) {
                adj.get(a.id).push(b.id);
                adj.get(b.id).push(a.id);
            }
        }
    }

    // BFS depuis racine
    const visited = new Set([root.id]);
    const queue = [root.id];
    while (queue.length > 0) {
        const curr = queue.shift();
        for (const nb of (adj.get(curr) || [])) {
            if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
        }
    }
    return visited;
}

// ─── DRAG & DROP ─────────────────────────────────────────
function getEventPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

function startDragFromInventory(e, partId) {
    e.preventDefault();
    const def = PARTS_CATALOG[partId];
    if (!def) return;
    if (!builderState.unlockedParts.includes(partId)) return;
    builderState.dragItem = { partId, fromInventory: true };

    const ghost = document.createElement('div');
    ghost.id = 'drag-ghost';
    ghost.innerHTML = def.svg;
    ghost.style.cssText = `position:fixed;width:${def.width}px;height:${def.height}px;pointer-events:none;z-index:9999;opacity:0.85;`;
    document.body.appendChild(ghost);

    const moveHandler = evt => {
        const src = evt.touches ? evt.touches[0] : evt;
        ghost.style.left = (src.clientX - def.width / 2) + 'px';
        ghost.style.top = (src.clientY - def.height / 2) + 'px';
        const canvas = builderState.buildCanvas;
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const rawX = src.clientX - rect.left;
            const rawY = src.clientY - rect.top;
            const sn = snapPosition(partId, rawX, rawY);
            builderState.dragItem.ghostX = sn.x;
            builderState.dragItem.ghostY = sn.y;
            builderState.dragItem.isSnapped = sn.snapped;
            drawBuildCanvas();
        }
    };

    const upHandler = evt => {
        document.body.removeChild(ghost);
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);
        document.removeEventListener('touchmove', moveHandler);
        document.removeEventListener('touchend', upHandler);
        const canvas = builderState.buildCanvas;
        if (canvas && builderState.dragItem) {
            const src = evt.changedTouches ? evt.changedTouches[0] : evt;
            const rect = canvas.getBoundingClientRect();
            const rawX = src.clientX - rect.left;
            const rawY = src.clientY - rect.top;
            if (rawX >= 0 && rawX <= canvas.width && rawY >= 0 && rawY <= canvas.height) {
                dropPartOnCanvas(partId, rawX, rawY);
            }
        }
        builderState.dragItem = null;
        drawBuildCanvas();
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('touchend', upHandler);
}

function dropPartOnCanvas(partId, rawX, rawY) {
    const def = PARTS_CATALOG[partId]; if (!def) return;
    const sn = snapPosition(partId, rawX, rawY);
    //if (!sn.snapped) { showToast('Pièce non fixée — approche d\'une surface !'); return; }
    const id = builderState.nextId++;
    builderState.placedParts.push({ id, partId, x: sn.x, y: sn.y, flipped: sn.flipped, active: def.category === 'engine' ? false : true });
    playRocketeerSound('place');

    // Add to default stage if engine or decoupler
    if (def.category === 'engine' || def.category === 'decoupler') {
        if (!builderState.stages) builderState.stages = [{ id: 0, elements: [] }];
        if (builderState.stages.length === 0) builderState.stages.push({ id: 0, elements: [] });
        builderState.stages[0].elements.push({ type: def.category, partId: id });
    }

    updateMoneyDisplay(); updateStats(); saveBuilderState(); drawBuildCanvas();
}

// Move existing parts
function onCanvasMouseDown(e) {
    const pos = getEventPos(e, builderState.buildCanvas);
    if (e.button === 2) { const hit = findPartAt(pos.x, pos.y); if (hit) { removePart(hit.id); return; } }
    const hit = findPartAt(pos.x, pos.y);
    if (hit) {
        builderState.selectedPartId = hit.id; showPartInfo(hit.partId, hit.id);
        const w = screenToWorld(pos.x, pos.y);
        builderState.dragItem = {
            partId: hit.partId, instanceId: hit.id, fromInventory: false,
            offsetX: w.x - hit.x, offsetY: w.y - hit.y,
            startX: hit.x, startY: hit.y,
            lastValidX: hit.x, lastValidY: hit.y,
            lastFlipped: hit.flipped ?? false, isSnapped: true,
            ghostX: hit.x, ghostY: hit.y
        };
    } else {
        builderState.selectedPartId = null; builderState.isPanning = true;
        builderState.panStart = { x: pos.x - builderState.panX, y: pos.y - builderState.panY };
        showPartInfo(null);
    }
    drawBuildCanvas();
}

function onCanvasMouseMove(e) {
    const pos = getEventPos(e, builderState.buildCanvas);
    if (builderState.isPanning) { builderState.panX = pos.x - builderState.panStart.x; builderState.panY = pos.y - builderState.panStart.y; drawBuildCanvas(); return; }
    if (!builderState.dragItem || builderState.dragItem.fromInventory) return;
    const pp = builderState.placedParts.find(p => p.id === builderState.dragItem.instanceId); if (!pp) return;
    const w = screenToWorld(pos.x, pos.y);
    const wx = w.x - builderState.dragItem.offsetX, wy = w.y - builderState.dragItem.offsetY;
    const sn = _snapWorld(pp.partId, wx, wy, pp.id);
    pp.x = sn.x; pp.y = sn.y; pp.flipped = sn.flipped;
    builderState.dragItem.ghostX = sn.x; builderState.dragItem.ghostY = sn.y;
    builderState.dragItem.ghostFlipped = sn.flipped; builderState.dragItem.isSnapped = sn.snapped;
    if (sn.snapped) { builderState.dragItem.lastValidX = sn.x; builderState.dragItem.lastValidY = sn.y; builderState.dragItem.lastFlipped = sn.flipped; }
    drawBuildCanvas();
}

function onCanvasMouseUp(e) {
    builderState.isPanning = false;
    if (!builderState.dragItem) return;
    if (builderState.dragItem.fromInventory) return;
    const pp = builderState.placedParts.find(p => p.id === builderState.dragItem.instanceId);
    if (pp) {
        const def = PARTS_CATALOG[pp.partId];
        const others = builderState.placedParts.filter(p => p.id !== pp.id);
        let overlap = false;
        for (const o of others) { const od = PARTS_CATALOG[o.partId]; if (!od) continue; if (checkOverlap(pp.x, pp.y, def.width, def.height, o.x, o.y, od.width, od.height, 1)) { overlap = true; break; } }
        if (overlap) {
            pp.x = builderState.dragItem.lastValidX ?? builderState.dragItem.startX;
            pp.y = builderState.dragItem.lastValidY ?? builderState.dragItem.startY;
            pp.flipped = builderState.dragItem.lastFlipped ?? (pp.flipped ?? false);
            showToast(t("rocketeer.warnings.overlap"));
        }
    }
    builderState.dragItem = null;
    updateStats(); saveBuilderState(); drawBuildCanvas();
}

function onCanvasRightClick(e) {
    const pos = getEventPos(e, builderState.buildCanvas);
    const hit = findPartAt(pos.x, pos.y);
    if (hit) removePart(hit.id);
}

function onCanvasWheel(e) {
    e.preventDefault();
    const r = builderState.buildCanvas.getBoundingClientRect();
    applyZoom(e.deltaY > 0 ? 0.9 : 1.1, e.clientX - r.left, e.clientY - r.top);
}

function onCanvasTouchStart(e) { e.preventDefault(); onCanvasMouseDown(e.touches[0]); }
function onCanvasTouchMove(e) { e.preventDefault(); onCanvasMouseMove(e.touches[0]); }
function onCanvasTouchEnd(e) { onCanvasMouseUp(e); }

function findPartAt(sx, sy) {
    const w = screenToWorld(sx, sy);
    for (const pp of [...builderState.placedParts].reverse()) {
        const def = PARTS_CATALOG[pp.partId]; if (!def) continue;
        if (w.x >= pp.x - def.width / 2 && w.x <= pp.x + def.width / 2 &&
            w.y >= pp.y - def.height / 2 && w.y <= pp.y + def.height / 2) return pp;
    }
    return null;
}

function removePart(id) {
    const idx = builderState.placedParts.findIndex(p => p.id === id);
    if (idx < 0) return;
    builderState.placedParts.splice(idx, 1);

    // Remove from stages
    if (builderState.stages) {
        builderState.stages.forEach(stage => {
            stage.elements = stage.elements.filter(el => el.partId !== id);
        });
    }

    builderState.selectedPartId = null;
    updateMoneyDisplay(); updateStats(); saveBuilderState(); drawBuildCanvas();
}

function deleteSelectedPart() {
    if (builderState.selectedPartId) removePart(builderState.selectedPartId);
}

// ─── UI UPDATES ──────────────────────────────────────────
function updateMoneyDisplay() {
    const el = document.getElementById('money-display');
    if (el) el.innerHTML = `⚡ ${builderState.money.toLocaleString()} ¢`;

}

function updateStats() {
    const allParts = builderState.placedParts;
    const connected = getConnectedPartIds();
    // Seules les pièces connectées comptent pour les stats physiques
    const parts = allParts.filter(p => connected.has(p.id));
    // Le coût de build reste sur toutes les pièces (même orphelines — on les a achetées)
    let buildTotal = 0;
    for (const pp of allParts) {
        const def = PARTS_CATALOG[pp.partId];
        if (def) {
            const level = builderState.bonusUpgrades[pp.partId] || 0;
            const cost = (def.buildCost || 0) * Math.pow(1.1, level);
            buildTotal += cost;
        }
    }
    const mass = Rocket.totalMassFromParts(parts, builderState.bonusUpgrades);
    const dvStages = Rocket.calculateDeltaV(parts, builderState.stages || [], builderState.bonusUpgrades);
    const totalDv = dvStages.reduce((s, d) => s + d.dv, 0);

    let thrustBoost = 1.0;
    for (const pp of parts) {
        const def = PARTS_CATALOG[pp.partId];
        if (def && def.category === 'bonus' && def.bonus?.thrustBoost) {
            const lvl = builderState.bonusUpgrades[pp.partId] || 0;
            thrustBoost *= (def.bonus.thrustBoost + lvl * 0.25);
        }
    }

    let totalThrust = 0;
    for (const pp of parts) {
        const def = PARTS_CATALOG[pp.partId];
        if (def && def.category === 'engine') totalThrust += (def.thrust || 0) * thrustBoost;
    }
    const twr = mass > 0 ? (totalThrust / (mass * 9.80665)).toFixed(2) : '0.00';
    const twrNum = parseFloat(twr);

    // Parts connectées pour le check lancement
    const hasCockpit = parts.some(p => PARTS_CATALOG[p.partId]?.category === 'cockpit');
    const hasEngine = parts.some(p => PARTS_CATALOG[p.partId]?.category === 'engine');
    const hasFuel = parts.some(p => PARTS_CATALOG[p.partId]?.category === 'tank');

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-cost', `${buildTotal.toLocaleString()} ¢`);
    set('stat-mass', `${(mass / 1000).toFixed(2)} t`);
    set('stat-dv', `${totalDv.toLocaleString()} m/s`);
    set('stat-parts', `${parts.length} (${allParts.length} total)`);

    // TWR / Thrust dynamiques
    let twrEl = document.getElementById('stat-twr');
    if (!twrEl) {
        const grid = document.querySelector('.stats-grid');
        if (grid) {
            grid.insertAdjacentHTML('beforeend',
                `<div class="stat-box"><div class="stat-label" >${t("rocketeer.menu.stat_twr")}</div><div class="stat-value" id="stat-twr">—</div></div>
                 <div class="stat-box"><div class="stat-label" >${t("rocketeer.menu.stat_thrust")}</div><div class="stat-value" id="stat-thrust" style="color:#ff8030">— kN</div></div>`);
            twrEl = document.getElementById('stat-twr');
        }
    }
    if (twrEl) { twrEl.textContent = twr; twrEl.style.color = twrNum >= 1 ? '#40c080' : '#ff6040'; }
    const thrEl = document.getElementById('stat-thrust');
    if (thrEl) thrEl.textContent = `${(totalThrust / 1000).toFixed(0)} kN`;

    const canLaunch = hasCockpit && hasEngine && hasFuel && parts.length >= 2 && builderState.money >= buildTotal;
    const btn = document.getElementById('launch-btn');
    if (btn) {
        btn.disabled = !canLaunch;
        btn.title = canLaunch ? t("rocketeer.menu.btn_launch")
            : !hasCockpit ? t("rocketeer.warnings.need_cockpit")
                : !hasEngine ? t("rocketeer.warnings.need_engine")
                    : t("rocketeer.warnings.need_fuel");
    }

    // Mobile
    if (typeof MobileBuilder !== 'undefined') MobileBuilder.onStatsUpdate();
}

function showPartInfo(partId, instanceId = null) {
    const info = document.getElementById('part-info-panel');
    if (!info) return;

    let targetPartId = partId;
    let config = null;
    let pp = null;

    if (instanceId) {
        pp = builderState.placedParts.find(p => p.id === instanceId);
        if (pp) {
            targetPartId = pp.partId;
            config = pp.config || {};
        }
    }

    const def = PARTS_CATALOG[targetPartId];
    if (!def) {
        const stagingHtml = renderStagingUI();
        info.innerHTML = stagingHtml;
        const mobile = document.getElementById('m-config-body');
        if (mobile) mobile.innerHTML = stagingHtml;
        drawStageIcons();
        return;
    }

    let statsHtml = '';
    if (def.thrust) statsHtml += `<div class="info-row"><span>${t("rocketeer.part_info.thrust")}</span><span>${(def.thrust / 1000).toFixed(1)} kN</span></div>`;
    if (def.isp) statsHtml += `<div class="info-row"><span>${t("rocketeer.part_info.isp")}</span><span>${def.isp} s</span></div>`;
    if (def.fuelMass) statsHtml += `<div class="info-row"><span>${t("rocketeer.part_info.fuel_cap")}</span><span>${def.fuelMass} kg</span></div>`;

    let configHtml = '';
    if (instanceId && pp) {
        configHtml = `<div class="config-section"><div class="config-header">${t("rocketeer.menu.part_info")}</div>`;

        if (def.category === 'tank') {
            const ratio = config?.fuelRatio ?? 1;
            configHtml += `
                <div class="config-row">
                    <label>${t("rocketeer.part_info.fuel_amt")} <span id="fuel-ratio-lbl-${instanceId}">${(ratio * 100).toFixed(0)}%</span></label>
                    <input type="range" min="0" max="1" step="0.05" value="${ratio}" 
                        onmousedown="event.stopPropagation()"
                        oninput="document.getElementById('fuel-ratio-lbl-${instanceId}').textContent=Math.round(this.value*100)+'%'; updatePartConfig(${instanceId}, 'fuelRatio', parseFloat(this.value), true)"
                        ontouchstart="event.stopPropagation()"
                        ontouchmove="event.stopPropagation(); document.getElementById('fuel-ratio-lbl-${instanceId}').textContent=Math.round(this.value*100)+'%'; updatePartConfig(${instanceId}, 'fuelRatio', parseFloat(this.value), true)">
                </div>`;
        }

        if (def.category === 'engine') {
            // Ignition handled by staging now (Stage 0 automatically at launch)
        }

        if (def.category === 'cockpit') {
            const isMain = config?.isMain ?? false;
            configHtml += `
                <div class="config-row">
                    <button class="btn-small ${isMain ? 'active' : ''}" 
                        onclick="setAsMainCockpit(${instanceId})">
                        ${isMain ? t("rocketeer.part_info.primary_cockpit") : t("rocketeer.part_info.set_as_primary")}
                    </button>
                </div>`;
        }
        if (def.category === 'bonus') {
            const level = builderState.bonusUpgrades[def.id] || 0;
            const bonusKey = Object.keys(def.bonus)[0];
            const baseVal = def.bonus[bonusKey];
            const currVal = (baseVal + level * 0.25).toFixed(2);
            const nextVal = (baseVal + (level + 1) * 0.25).toFixed(2);
            const rdPrice = Math.floor(def.price * Math.pow(1.1, level));
            const buildPrice = Math.floor((def.buildCost || 0) * Math.pow(1.1, level));
            const nextBuildPrice = Math.floor((def.buildCost || 0) * Math.pow(1.1, level + 1));

            configHtml += `
                <div class="config-section" style="margin-top:10px;">
                    <div class="config-header">${t("rocketeer.part_info.rd_upgrades").replace("{level}", level)}</div>
                    <div class="info-row"><span>${t("rocketeer.part_info.current_bonus")}</span><span>+${Math.round((currVal - 1) * 100)}%</span></div>
                    <div class="info-row"><span>${t("rocketeer.part_info.construction")}</span><span>${buildPrice} ¢</span></div>
                    <div style="margin-top:10px; padding:8px; background:rgba(58,143,212,0.1); border-radius:6px; border:1px dashed var(--accent);">
                        <div style="font-size:9px; color:var(--accent); margin-bottom:4px;">${t("rocketeer.part_info.next_upgrade")}</div>
                        <div class="info-row" style="border:none; padding:2px 0;"><span>${t("rocketeer.part_info.new_bonus")}</span><span>+${Math.round((nextVal - 1) * 100)}%</span></div>
                        <div class="info-row" style="border:none; padding:2px 0;"><span>${t("rocketeer.part_info.new_construction")}</span><span>${nextBuildPrice} ¢</span></div>
                        <button class="btn-small active" style="width:100%; margin-top:8px;" 
                                onclick="upgradeBonusPart('${def.id}')"> ${t("rocketeer.part_info.btn_upgrade").replace("{amount}", rdPrice)}
                        </button>
                    </div>
                </div>`;
        }
        configHtml += '</div>';
    }

    // Fill the 120x120 area while maintaining aspect ratio
    const scale = Math.min(120 / def.width, 120 / def.height);
    const thumbW = def.width * scale;
    const thumbH = def.height * scale;

    let description = def.description;
    let massVal = def.mass;
    if (def.category === 'bonus') {
        const level = builderState.bonusUpgrades[def.id] || 0;
        const bonusKey = Object.keys(def.bonus)[0];
        const val = (def.bonus[bonusKey] + level * 0.25);
        const percent = Math.round((val - 1) * 100);

        if (bonusKey === 'thrustBoost') description = t("rocketeer.bonus_descriptions.thrustBoost").replace("{percent}", percent);
        if (bonusKey === 'fuelBonus') description = t("rocketeer.bonus_descriptions.fuelBonus").replace("{percent}", percent);
        if (bonusKey === 'rewardMultiplier') description = t("rocketeer.bonus_descriptions.rewardMultiplier").replace("{percent}", percent);
    }

    info.innerHTML = `
        <div class="part-scroll-area" style="flex:1; overflow-y:auto; padding-right:4px;">
            <div class="info-thumb" style="width:${thumbW}px; height:${thumbH}px; background:rgba(255,255,255,0.05); border-radius:10px; padding:8px;">
                <canvas class="info-thumb-canvas" width="${thumbW * 2}" height="${thumbH * 2}" style="width:100%; height:100%; display:block;"></canvas>
            </div>
            <div class="info-name">${def.name}</div>
            <div class="info-desc">${description}</div>
            <div class="info-row"><span>${t("rocketeer.part_info.mass_wet")}</span><span>${massVal} kg</span></div>
            ${statsHtml}
            ${configHtml}
        </div>`;

    const mobile = document.getElementById('m-config-body');
    if (mobile) mobile.innerHTML = info.innerHTML;

    // Draw on all canvases (Desktop + Mobile)
    document.querySelectorAll('.info-thumb-canvas').forEach(canv => {
        drawPartPreview(canv.getContext('2d'), def);
    });
}

function updatePartConfig(instanceId, key, value, noRefresh = false) {
    const pp = builderState.placedParts.find(p => p.id === instanceId);
    if (!pp) return;
    if (!pp.config) pp.config = {};
    pp.config[key] = value;

    // Refresh UI & Stats
    if (!noRefresh) showPartInfo(pp.partId, instanceId);
    updateStats();
    saveBuilderState();
}

function setAsMainCockpit(instanceId) {
    builderState.placedParts.forEach(p => {
        if (PARTS_CATALOG[p.partId]?.category === 'cockpit') {
            if (!p.config) p.config = {};
            p.config.isMain = (p.id === instanceId);
        }
    });
    showPartInfo(null, instanceId);
    updateStats();
    saveBuilderState();
}

function showToast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => document.body.removeChild(t), 300); }, 2500);
}

// ─── LAUNCH WARNING POPUP ─────────────────────────────────
function launchRocket() {
    if (builderState.placedParts.length < 2) return;
    const parts = builderState.placedParts;
    const mass = Rocket.totalMassFromParts(parts);
    let totalThrust = 0;
    for (const pp of parts) {
        const def = PARTS_CATALOG[pp.partId];
        if (def && def.category === 'engine') totalThrust += def.thrust || 0;
    }
    const twr = mass > 0 ? totalThrust / (mass * 9.80665) : 0;
    const dvStages = Rocket.calculateDeltaV(parts, builderState.stages || []);
    const totalDv = dvStages.reduce((s, d) => s + d.dv, 0);
    const buildTotal = parts.reduce((s, p) => s + (PARTS_CATALOG[p.partId]?.buildCost || 0), 0);
    const canAffordBuild = builderState.money >= buildTotal;

    // Show custom popup
    const overlay = document.getElementById('launch-confirm-overlay');
    if (overlay) {
        document.getElementById('lc-mass').textContent = `${(mass / 1000).toFixed(2)} t`;
        document.getElementById('lc-thrust').textContent = `${(totalThrust / 1000).toFixed(0)} kN`;
        document.getElementById('lc-twr').textContent = twr.toFixed(2);
        document.getElementById('lc-twr').style.color = twr >= 1 ? '#40c080' : '#ff4040';
        document.getElementById('lc-dv').textContent = `${totalDv.toLocaleString()} m/s`;

        // Utilisation de symboles système typés "Aérospatial"
        let warning = twr < 1
            ? t("rocketeer.warnings.twr_too_low")
            : twr < 1.2
                ? t("rocketeer.warnings.twr_low")
                : t("rocketeer.warnings.ready");

        if (!canAffordBuild) {
            warning = t("rocketeer.warnings.insufficient_funds").replace("{amount}", buildTotal);
        }

        // Mise à jour de l'élément avec une classe de couleur dynamique
        const warningEl = document.getElementById('lc-warning');
        warningEl.textContent = warning;

        // Optionnel : Changer la couleur du texte selon l'alerte
        warningEl.style.color = twr < 1 || !canAffordBuild ? '#ff4444' : (twr < 1.2 ? '#ffcc00' : '#44ff88');

        const launchBtn = document.querySelector('#launch-confirm-overlay .btn-primary');
        if (launchBtn) {
            launchBtn.disabled = !canAffordBuild;
            launchBtn.textContent = `Pay ${buildTotal} ¢ & Launch`;
        }

        overlay.style.display = 'flex';
    }
}

function confirmLaunch() {
    const parts = builderState.placedParts;
    const buildTotal = parts.reduce((s, p) => {
        const def = PARTS_CATALOG[p.partId];
        const level = builderState.bonusUpgrades[p.partId] || 0;
        return s + (def?.buildCost || 0) * Math.pow(1.1, level);
    }, 0);
    if (builderState.money < buildTotal) {
        alert(t("rocketeer.warnings.insufficient_funds").replace("{amount}", buildTotal));
        return;
    }

    builderState.money -= buildTotal;
    saveBuilderState();

    const ys = parts.map(p => p.y), xs = parts.map(p => p.x);
    const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const centerY = (Math.max(...ys) + Math.min(...ys)) / 2;
    const rocketData = {
        ...Rocket.buildFromParts(parts, builderState.bonusUpgrades),
        _centerX: centerX,
        _centerY: centerY,
        _placedParts: parts,
        _buildCost: buildTotal,
        stages: builderState.stages,
        bonusUpgrades: builderState.bonusUpgrades
    };
    sessionStorage.setItem('rocketeer_rocket', JSON.stringify(rocketData));
    sessionStorage.setItem('rocketeer_money', builderState.money);

    document.getElementById('launch-confirm-overlay').style.display = 'none';
    window.location.href = 'game.html';
}

function clearRocket() {
    if (builderState.placedParts.length === 0) return;
    showModal(t("rocketeer.warnings.clear_blueprint"), t("rocketeer.warnings.clear_blueprint_body"), 'CONSTRUCTION LOGS', () => {
        builderState.placedParts = [];
        builderState.stages = [{ id: 0, elements: [] }];
        builderState.selectedPartId = null;
        updateMoneyDisplay(); updateStats(); saveBuilderState(); drawBuildCanvas();
    }, true);
}

// ─── MODAL SYSTEM ─────────────────────────────────────────
/**
 * @param {string} title 
 * @param {string} message 
 * @param {string} subtitle 
 * @param {Function} onConfirm 
 * @param {boolean} showCancel 
 */
function showModal(title, message, subtitle, onConfirm = null, showCancel = false) {
    const overlay = document.getElementById('generic-modal-overlay');
    if (!overlay) return;
    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-message').innerHTML = message;
    document.getElementById('modal-subtitle').innerHTML = subtitle || 'ROCKETEER OS';

    const cancelBtn = document.getElementById('modal-cancel');
    const confirmBtn = document.getElementById('modal-confirm');

    cancelBtn.style.display = showCancel ? 'block' : 'none';

    // Clear old listeners
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newConfirm.addEventListener('click', () => {
        overlay.style.display = 'none';
        if (onConfirm) onConfirm();
    });

    newCancel.addEventListener('click', () => {
        overlay.style.display = 'none';
    });

    overlay.style.display = 'flex';
}

window.launchRocket = launchRocket;
window.confirmLaunch = confirmLaunch;
window.clearRocket = clearRocket;
window.deleteSelectedPart = deleteSelectedPart;
window.showModal = showModal;

// ─── MANUAL STAGING UI ────────────────────────────────────

function renderStagingUI() {
    if (!builderState.stages) builderState.stages = [{ id: 0, elements: [] }];

    let html = `<div class="staging-panel" style="display:flex; flex-direction:column; height:100%; padding-top:10px; overflow:hidden;">
        <div class="staging-header" style="flex-shrink:0; display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <span style="font-weight:bold; color:#40c0ff; letter-spacing:1px; font-size:14px;">${t("rocketeer.staging.title")}</span>
            <button class="btn-small" style="background:#203040; border-color:#40c0ff; color:#40c0ff;" onclick="addStage()">${t("rocketeer.staging.btn_add_stage")}</button>
        </div>
        <div class="stages-list" style="flex:1; overflow-y:auto; padding-right:5px; display:flex; flex-direction:column; gap:12px; min-height:0;">`;

    const forwardStages = builderState.stages;

    forwardStages.forEach((stage, idx) => {
        const stageNum = idx;
        html += `
            <div class="stage-block" 
                 style="background:rgba(20,30,40,0.6); border:1px solid #304050; border-radius:8px; padding:10px; transition:border 0.2s;"
                 ondragover="allowDropStage(event)" 
                 ondrop="dropToStage(event, ${stage.id})"
                 onmouseenter="highlightStage(${stage.id}, true)"
                 onmouseleave="highlightStage(${stage.id}, false)">
                <div class="stage-title" style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:bold; color:#a0b0c0; margin-bottom:10px;">
                    <span>${t("rocketeer.staging.stage_label").replace("{n}", stage.id)}</span>
                    ${stage.id !== 0 ? `<button class="btn-small" style="padding:2px 8px; font-size:11px; background:rgba(255,60,60,0.1); color:#ff6040; border:1px solid #602020;" onclick="removeStage(${stage.id})">${t("rocketeer.staging.btn_remove_stage")}</button>` : '<span></span>'}
                </div>
                <div class="stage-items" style="display:flex; flex-direction:column; gap:6px; min-height:36px; background:rgba(0,0,0,0.2); border-radius:6px; padding:6px;">`;

        if (stage.elements.length === 0) {
            html += `<div class="stage-empty" style="color:#607080; font-style:italic; font-size:12px; text-align:center; padding:8px;">${t("rocketeer.staging.stage_empty")}</div>`;
        } else {
            stage.elements.forEach((el) => {
                const partDef = builderState.placedParts.find(p => p.id === el.partId);
                if (!partDef) return;
                const def = PARTS_CATALOG[partDef.partId];
                const totalStages = builderState.stages.length;

                html += `
                        <div class="stage-item" draggable="true" 
                             style="display:flex; align-items:center; gap:8px; background:rgba(30,40,55,0.8); padding:6px 10px; border-radius:4px; cursor:grab; border-left: 3px solid ${def.category === 'engine' ? '#ff8030' : '#d0a030'}; transition:background 0.2s; touch-action:none;"
                             ondragstart="dragStageItem(event, ${el.partId}, ${stage.id})"
                             onmouseenter="highlightPart(${el.partId}, true); this.style.background='rgba(50,70,90,0.9)';"
                             onmouseleave="highlightPart(${el.partId}, false); this.style.background='rgba(30,40,55,0.8)';"
                             onclick="builderState.selectedPartId = ${el.partId}; showPartInfo(${el.partId}, ${el.partId}); drawBuildCanvas();">
                             <div style="width:28px; height:28px; flex-shrink:0; background:rgba(255,255,255,0.05); border-radius:4px; padding:2px;">
                                <canvas class="stage-item-canvas" data-part-id="${def.id}" width="56" height="56" style="width:100%; height:100%; display:block;"></canvas>
                             </div> 
                            <span class="item-name" style="font-size:13px; color:#e0e0e0; flex:1;">${def.name}</span>
                            <span style="font-size:11px; color:#888;">${def.category === 'engine' ? 'Ignite' : 'Detach'}</span>
                            ${totalStages > 1 ? `
                            <div style="display:flex; flex-direction:column; gap:2px; margin-left:4px;">
                                ${idx > 0 ? `<button onclick="event.stopPropagation(); moveStageItem(${el.partId}, ${stage.id}, -1)" style="background:rgba(60,100,160,0.4); border:1px solid #3a6090; color:#80c0ff; border-radius:3px; padding:1px 5px; cursor:pointer; font-size:10px;">&#x2191;</button>` : '<span style="width:22px;"></span>'}
                                ${idx < totalStages - 1 ? `<button onclick="event.stopPropagation(); moveStageItem(${el.partId}, ${stage.id}, 1)" style="background:rgba(60,100,160,0.4); border:1px solid #3a6090; color:#80c0ff; border-radius:3px; padding:1px 5px; cursor:pointer; font-size:10px;">&#x2193;</button>` : '<span style="width:22px;"></span>'}
                            </div>` : ''}
                        </div>`;
            });
        }

        html += `</div></div>`;
    });

    html += `</div></div>`;
    return html;
}

// Function to render stage previews after HTML injection
function drawStageIcons() {
    document.querySelectorAll('.stage-item-canvas').forEach(canv => {
        const pId = canv.dataset.partId;
        const pDef = PARTS_CATALOG[pId];
        if (pDef) drawPartPreview(canv.getContext('2d'), pDef);
    });
}

function addStage() {
    const nextId = builderState.stages.length > 0 ? Math.max(...builderState.stages.map(s => s.id)) + 1 : 0;
    builderState.stages.push({ id: nextId, elements: [] });
    saveBuilderState();
    showPartInfo(null);
}

function removeStage(stageId) {
    if (stageId === 0) return;
    const idx = builderState.stages.findIndex(s => s.id === stageId);
    if (idx === -1) return;
    // Return elements to an adjacent stage if possible
    const stage = builderState.stages[idx];
    if (stage.elements.length > 0) {
        const target = builderState.stages[idx - 1] || builderState.stages[idx + 1];
        if (target) target.elements.push(...stage.elements);
    }
    builderState.stages.splice(idx, 1);
    saveBuilderState();
    showPartInfo(null);
}

// Move a part from its current stage to an adjacent one (delta = -1 → prev stage, +1 → next)
function moveStageItem(partId, sourceStageId, delta) {
    const srcIdx = builderState.stages.findIndex(s => s.id === sourceStageId);
    if (srcIdx === -1) return;
    const tgtIdx = srcIdx + delta;
    if (tgtIdx < 0 || tgtIdx >= builderState.stages.length) return;
    const srcStage = builderState.stages[srcIdx];
    const tgtStage = builderState.stages[tgtIdx];
    const elIdx = srcStage.elements.findIndex(el => el.partId === partId);
    if (elIdx === -1) return;
    const [el] = srcStage.elements.splice(elIdx, 1);
    tgtStage.elements.push(el);
    saveBuilderState();
    if (typeof updateStats === 'function') updateStats();
    showPartInfo(null);
}

function allowDropStage(ev) {
    ev.preventDefault();
}

function dragStageItem(ev, partId, sourceStageId) {
    ev.dataTransfer.setData("partId", partId);
    ev.dataTransfer.setData("sourceStageId", sourceStageId);
}

function dropToStage(ev, targetStageId) {
    ev.preventDefault();
    const partId = parseInt(ev.dataTransfer.getData("partId"));
    const sourceStageId = parseInt(ev.dataTransfer.getData("sourceStageId"));

    if (isNaN(partId) || isNaN(sourceStageId) || sourceStageId === targetStageId) return;

    const srcStage = builderState.stages.find(s => s.id === sourceStageId);
    const tgtStage = builderState.stages.find(s => s.id === targetStageId);

    if (srcStage && tgtStage) {
        const elIdx = srcStage.elements.findIndex(el => el.partId === partId);
        if (elIdx !== -1) {
            const el = srcStage.elements.splice(elIdx, 1)[0];
            tgtStage.elements.push(el);
            saveBuilderState();
            if (typeof updateStats === 'function') updateStats();
            showPartInfo(null);
        }
    }
}

let highlightedPartIds = new Set();

function highlightPart(partId, isHover) {
    if (isHover) {
        highlightedPartIds.add(partId);
    } else {
        highlightedPartIds.delete(partId);
    }
    if (typeof drawBuildCanvas === 'function') drawBuildCanvas();
}

function highlightStage(stageId, isHover) {
    const stage = builderState.stages.find(s => s.id === stageId);
    if (!stage) return;
    if (isHover) {
        stage.elements.forEach(el => highlightedPartIds.add(el.partId));
    } else {
        stage.elements.forEach(el => highlightedPartIds.delete(el.partId));
    }
    if (typeof drawBuildCanvas === 'function') drawBuildCanvas();
}

window.addStage = addStage;
window.removeStage = removeStage;
window.moveStageItem = moveStageItem;
window.allowDropStage = allowDropStage;
window.dragStageItem = dragStageItem;
window.dropToStage = dropToStage;
window.highlightPart = highlightPart;
window.highlightStage = highlightStage;
window.renderStagingUI = renderStagingUI;

function upgradeBonusPart(partId) {
    const def = PARTS_CATALOG[partId];
    if (!def) return;
    const level = builderState.bonusUpgrades[partId] || 0;
    const price = Math.floor(def.price * Math.pow(1.1, level));

    if (builderState.money >= price) {
        builderState.money -= price;
        builderState.bonusUpgrades[partId] = level + 1;
        playRocketeerSound('update');
        saveBuilderState();
        updateMoneyDisplay();
        renderPartsList(); // Update costs in sidebar
        updateStats();
        // Refresh the current part info if it's the one we're upgrading
        if (builderState.selectedPartId) {
            const pp = builderState.placedParts.find(p => p.id === builderState.selectedPartId);
            if (pp && pp.partId === partId) showPartInfo(partId, pp.id);
        }
    } else {
        showModal(title = t("rocketeer.warnings.no_money_rd").replace("{amount}", price));
    }
}
window.upgradeBonusPart = upgradeBonusPart;

// ─── RULES PAGINATION ───────────────────────────────────
const Rules = (() => {
    let currentPage = 0;
    let pages = [];

    function buildPages() {
        return [
            {
                title: t("rocketeer.manual.page1_title"),
                content: t("rocketeer.manual.page1_content")
            },
            {
                title: t("rocketeer.manual.page2_title"),
                content: t("rocketeer.manual.page2_content")
            },
            {
                title: t("rocketeer.manual.page3_title"),
                content: t("rocketeer.manual.page3_content")
            },
            {
                title: t("rocketeer.manual.page4_title"),
                content: t("rocketeer.manual.page4_content")
            }
        ];
    }

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
        init: () => {
            pages = buildPages();
            showPage(0);
        },
        nextPage: () => showPage(currentPage + 1),
        prevPage: () => showPage(currentPage - 1),
        reload: () => { pages = buildPages(); showPage(currentPage); }
    };
})();

document.addEventListener('DOMContentLoaded', async () => {
    await initI18n();
    Rules.init();
    refreshTexts();
    initBuilder();
});