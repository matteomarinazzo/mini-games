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
})();
