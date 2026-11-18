// Config de page (sessionStorage « minigolf/config »), codes de room, couche Firebase (import dynamique à la demande : solo et IA restent hors ligne).
// Rooms : rooms/minigolf_<CODE> (préfixe propre au jeu, les autres jeux ne sont pas touchés). Les chemins d'import sont ceux de l'exemple.
(function () {
  const M = window.Minigolf = window.Minigolf || {}, K = 'minigolf/config';
  const D = { mode: 'solo', mapId: 'garden', aiCount: 1, roomCode: '', maxPlayers: 2, fillWithAI: false, resume: false };
  const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const norm = (o) => ({
    mode: o.mode === 'multi' || o.mode === 'ia' ? o.mode : 'solo', mapId: typeof o.mapId === 'string' ? o.mapId : D.mapId,
    aiCount: Math.max(1, Math.min(3, parseInt(o.aiCount, 10) || 1)), roomCode: code(o.roomCode),
    maxPlayers: Math.max(2, Math.min(4, parseInt(o.maxPlayers, 10) || 2)), fillWithAI: o.fillWithAI === true, resume: o.resume === true,
  });

  const PREFIX = 'minigolf_', SAVED = 'minigolf_room', NAME_KEY = 'mg_player_name', HB = 10000, OFF = 35000, DEAD = 5 * 60 * 1000;
  const F = { fb: null, cfg: null, net: null, uid: null, offset: 0 };
  const gameIdOf = (c) => PREFIX + c, serverNow = () => Date.now() + F.offset;
  const ts = () => { const f = F.cfg.getServerTimestamp(); return f ? f() : Date.now(); };
  const isOffline = (p) => !!p && typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > OFF;
  const isPresent = (p) => !!p && !p.away && !isOffline(p);
  const isDead = (d) => { const ps = Object.values(d.players || {}); return !ps.length || ps.every((p) => typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > DEAD); };
  const order = (d) => Object.entries(d.players || {}).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0));
  const hostOf = (d) => {
    const l = (d.players || {})[d.leaderId];
    if (l && (d.leaderId === F.uid || isPresent(l))) return d.leaderId;
    const f = order(d).find(([u, p]) => u === F.uid || isPresent(p));
    return f ? f[0] : null;
  };
  const readSavedRoom = () => { try { return localStorage.getItem(SAVED) || null; } catch (e) { return null; } };
  const saveRoom = (c) => { try { localStorage.setItem(SAVED, c); } catch (e) { /* ignore */ } };
  const clearSavedRoom = () => { try { localStorage.removeItem(SAVED); } catch (e) { /* ignore */ } };

  async function initFb() {
    if (F.uid) return true;
    try {
      F.net = F.net || await import('../../../js/network.js');
      if (!(await F.net.checkRealConnection())) return false;
      const [cfg, fb] = await Promise.all([import('../../../js/config/firebase-config.js'), import('../../../js/firebaseWrk.js')]);
      if (!(await cfg.firebaseReady) || !cfg.auth.currentUser) return false;
      F.cfg = cfg; F.fb = fb; F.uid = cfg.auth.currentUser.uid;
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 2500);
        try { cfg.getOnValue()(cfg.getRef()(cfg.database, '.info/serverTimeOffset'), (s) => { F.offset = Number(s.val()) || 0; clearTimeout(t); resolve(); }); } catch (e) { resolve(); }
      });
      return true;
    } catch (e) { console.warn(e); return false; }
  }
  const watch = (c, cb) => F.cfg.getOnValue()(F.cfg.getRef()(F.cfg.database, `rooms/${gameIdOf(c)}`), (s) => cb(s.val()), (e) => console.warn('room:', e));
  function beat(c) {
    if (!c || !F.uid) return;
    try { Promise.resolve(F.fb.updateRoom(gameIdOf(c), { [`players/${F.uid}/lastSeen`]: ts() })).catch(() => { }); } catch (e) { /* ignore */ }
  }
  /** Départ volontaire. Dernier humain (non « away ») : room supprimée. En partie : le siège reste (away) pour la reconnexion. */
  async function leaveRoom(c, inGame) {
    const id = gameIdOf(c), d = await F.fb.getRoom(id);
    if (!d) return;
    const others = Object.entries(d.players || {}).filter(([u, p]) => u !== F.uid && !p.away);
    if (!others.length) { await F.fb.deleteRoom(id); return; }
    const u = {};
    if (inGame) u[`players/${F.uid}/away`] = true; else u[`players/${F.uid}`] = null;
    if (d.leaderId === F.uid) u.leaderId = others[0][0];
    await F.fb.updateRoom(id, u);
  }

  M.net = {
    key: K, defaults: D, code, F, NAME_KEY, HB,
    read() { try { const v = JSON.parse(sessionStorage.getItem(K)); return v && typeof v === 'object' ? norm(v) : null; } catch (e) { return null; } },
    write(p) { const c = norm({ ...D, ...(this.read() || {}), ...p }); try { sessionStorage.setItem(K, JSON.stringify(c)); } catch (e) { /* stockage indisponible */ } return c; },
    genCode() { let s = ''; for (let i = 0; i < 6; i++) s += AL[Math.floor(Math.random() * AL.length)]; return s; },
    validCode: (s) => /^[A-Z0-9]{6}$/.test(s),
    gameIdOf, serverNow, ts, isPresent, isDead, order, hostOf, readSavedRoom, saveRoom, clearSavedRoom, initFb, watch, beat, leaveRoom,
  };

  // ── Défilement tactile fluide pour mobile (notamment en affichage pivoté à 90°) ──
  (function initTouchScroll() {
    if (typeof window === 'undefined') return;
    const RQ = matchMedia('(orientation: portrait) and (max-width: 700px) and (pointer: coarse)');
    let target = null;
    let startX = 0, startY = 0;
    let lastX = 0, lastY = 0;
    let lastTime = 0;
    let velX = 0, velY = 0;
    let isScrolling = false;
    let animId = null;

    function getScroller(el) {
      let cur = el;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        const s = window.getComputedStyle(cur);
        const canY = (s.overflowY === 'auto' || s.overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 2;
        const canX = (s.overflowX === 'auto' || s.overflowX === 'scroll') && cur.scrollWidth > cur.clientWidth + 2;
        if (canY || canX) return cur;
        cur = cur.parentElement;
      }
      if (RQ.matches) {
        const modal = document.querySelector('.overlay.open .modal, .modal:not([hidden]) .card');
        if (modal && modal.scrollHeight > modal.clientHeight + 2) return modal;
        const wrap = document.querySelector('.wrap');
        if (wrap && !document.querySelector('.overlay.open') && wrap.scrollHeight > wrap.clientHeight + 2) return wrap;
      }
      return null;
    }

    const isRotated = () => {
      const t = window.getComputedStyle(document.body).transform;
      return t && t !== 'none';
    };

    function onTouchStart(e) {
      if (e.touches.length !== 1 || !isRotated()) return;
      if (animId) cancelAnimationFrame(animId);
      animId = null;
      velX = 0;
      velY = 0;
      isScrolling = false;
      const t = e.touches[0];
      startX = lastX = t.clientX;
      startY = lastY = t.clientY;
      lastTime = performance.now();
      target = getScroller(e.target);
    }

    function onTouchMove(e) {
      if (!target || e.touches.length !== 1) return;
      const t = e.touches[0];
      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      const px = t.clientX;
      const py = t.clientY;
      const dist = Math.hypot(px - startX, py - startY);

      if (!isScrolling && dist > 6) {
        isScrolling = true;
      }

      if (isScrolling) {
        if (e.cancelable) e.preventDefault();

        const dPx = px - lastX;
        const dPy = py - lastY;
        const rotated = RQ.matches;

        let deltaY = 0;
        let deltaX = 0;

        if (rotated) {
          deltaY = Math.abs(dPx) >= Math.abs(dPy) ? dPx : -dPy;
          deltaX = -dPy;
        } else {
          deltaY = -dPy;
          deltaX = -dPx;
        }

        if (target.scrollHeight > target.clientHeight) {
          target.scrollTop += deltaY;
          velY = deltaY / dt;
        }
        if (target.scrollWidth > target.clientWidth) {
          target.scrollLeft += deltaX;
          velX = deltaX / dt;
        }
      }

      lastX = px;
      lastY = py;
      lastTime = now;
    }

    function onTouchEnd() {
      if (!target) return;
      const scroller = target;
      target = null;

      if (isScrolling) {
        const killClick = (ce) => {
          ce.preventDefault();
          ce.stopPropagation();
        };
        window.addEventListener('click', killClick, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', killClick, { capture: true }), 150);

        let lastAnim = performance.now();
        function momentum() {
          const now = performance.now();
          const dt = Math.min(32, now - lastAnim);
          lastAnim = now;
          velY *= Math.pow(0.92, dt / 16);
          velX *= Math.pow(0.92, dt / 16);
          let active = false;
          if (Math.abs(velY) > 0.02 && scroller.scrollHeight > scroller.clientHeight) {
            scroller.scrollTop += velY * dt;
            active = true;
          }
          if (Math.abs(velX) > 0.02 && scroller.scrollWidth > scroller.clientWidth) {
            scroller.scrollLeft += velX * dt;
            active = true;
          }
          if (active) {
            animId = requestAnimationFrame(momentum);
          }
        }
        animId = requestAnimationFrame(momentum);
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  })();
})();
