// Escape Game · entrées : clavier, souris capturée, glisser tactile, pad
export function createInput(cv, cb) {
    const I = { f: 0, b: 0, l: 0, r: 0, tl: 0, tr: 0, dyaw: 0, dpitch: 0, lostAt: 0, self: false };
    const MAP = { w: 'f', z: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', q: 'l', d: 'r', arrowright: 'tr', arrowleft: 'tl' };
    const PAD = { fwd: 'f', back: 'b', left: 'l', right: 'r' };
    let drag = null;

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase(), m = MAP[k];
        if (m) { I[m] = 1; if (cb.active()) e.preventDefault(); }
        else if (k === 'e' && !e.repeat) cb.search();
    });
    document.addEventListener('keyup', (e) => { const m = MAP[e.key.toLowerCase()]; if (m) I[m] = 0; });
    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== cv) return;
        I.dyaw += e.movementX * .0022; I.dpitch -= e.movementY * .0022;
    });
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === cv) return;
        I.lostAt = performance.now();
        if (I.self) { I.self = false; return; }
        cb.lost();
    });

    cv.addEventListener('pointerdown', (e) => {
        if (!cb.active()) return;
        if (e.pointerType === 'mouse') {
            if (e.button !== 0) return;
            if (document.pointerLockElement !== cv) I.lock(); else cb.search();
        } else if (!drag) {
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
            try { cv.setPointerCapture(e.pointerId); } catch { drag.c = 0; }
        }
    });
    cv.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        I.dyaw += (e.clientX - drag.x) * .006; I.dpitch += (drag.y - e.clientY) * .006;
        drag.x = e.clientX; drag.y = e.clientY;
    });
    ['pointerup', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, (e) => { if (drag && e.pointerId === drag.id) drag = null; }));

    document.querySelectorAll('.pad-btn').forEach((b) => {
        const m = PAD[b.dataset.act];
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { } I[m] = 1; b.classList.add('active'); });
        const off = () => { I[m] = 0; b.classList.remove('active'); };
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, off));
        b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    document.getElementById('searchBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); cb.search(); });

    I.lock = () => {
        if (!cv.requestPointerLock) return;
        try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch { }
    };
    I.unlock = () => { if (document.pointerLockElement === cv) { I.self = true; document.exitPointerLock(); } };
    I.reset = () => {
        I.f = I.b = I.l = I.r = I.tl = I.tr = 0; I.dyaw = I.dpitch = 0; drag = null;
        document.querySelectorAll('.pad-btn.active').forEach((b) => b.classList.remove('active'));
    };
    return I;
}
