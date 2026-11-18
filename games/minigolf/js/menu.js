// Menu : trois portes (Solo, Multijoueur IA, Multijoueur), une étape à la fois. Firebase seulement pour « Multijoueur » (chargé à la demande). Aucune physique.
(function () {
  const M = window.Minigolf, N = M.net, C = M.career, $ = (s) => document.querySelector(s), HN = (id) => M.maps[id].holes.length;
  const cfg = N.read() || N.defaults, isOpen = (m) => C.status(m.id).open, pick0 = (id) => M.maps[id] && M.mapList.some((m) => m.id === id && isOpen(m)) ? id : 'garden';
  let mapId = pick0(cfg.mapId), imap = mapId, rmap = mapId, aiN = cfg.aiCount, players = cfg.maxPlayers, fill = cfg.fillWithAI, tab = 'create';
  let cur = null, unsub = null, hb = null, redirecting = false, busy = false, roomData = null;

  function show(v) {
    for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'v-' + v;
    window.scrollTo(0, 0); const wp = document.querySelector('.wrap'); if (wp) wp.scrollTop = 0;
    if (v === 'solo') solo(); else if (v === 'ia') ia(); else if (v === 'multi') multi();
  }
  function maps(el, sel, pick) {
    el.innerHTML = '';
    for (const m of M.mapList) {
      const b = document.createElement('button'); b.type = 'button'; const o = isOpen(m); b.className = 'map' + (o ? (m.id === sel ? ' on' : '') : ' lock');
      const sv = C.status(m.id), t = o ? (C.best(m.id) !== null ? `Meilleur : ${C.best(m.id)} pts` : m.info) : m.soon ? (sv.ready ? 'Bientôt disponible' : `Bientôt · ${sv.need} pts requis`) : `Requis : ${sv.need} pts (il manque ${sv.need - sv.have})`;
      b.innerHTML = '<i></i><span><b></b><small></small></span>'; b.firstChild.textContent = o ? (m.icon || '⛳') : '🔒'; b.lastChild.firstChild.textContent = m.name; b.lastChild.lastChild.textContent = t; b.title = m.name + ' · ' + t;
      if (o) b.onclick = () => pick(m.id); else b.disabled = true;
      el.append(b);
    }
  }
  const seg = (el, val) => { for (const b of el.children) b.classList.toggle('on', +b.dataset.n === val); };

  // ── Solo ──
  function solo() {
    maps($('#maps'), mapId, (id) => { mapId = id; solo(); });
    $('#best').hidden = true;
    const r = C.loadRun(mapId, HN(mapId)), rs = $('#resume'); rs.hidden = !(r && !r.done);
    if (!rs.hidden) rs.textContent = `Reprendre · trou ${r.h + 1}/${HN(mapId)} · score ${C.score(r.s)}`;
  }
  const go = (resume) => { N.write({ mode: 'solo', mapId, resume }); location.href = 'game.html'; };
  $('#play').onclick = () => go(false); $('#resume').onclick = () => go(true);

  // ── Multijoueur IA : tout local, aucune room ──
  function ia() { maps($('#imaps'), imap, (id) => { imap = id; ia(); }); seg($('#ain'), aiN); }
  for (const b of $('#ain').children) b.onclick = () => { aiN = +b.dataset.n; ia(); };
  $('#playIa').onclick = () => { N.write({ mode: 'ia', mapId: imap, aiCount: aiN, resume: false }); location.href = 'game.html'; };

  // ── Multijoueur : flux de room (créer, rejoindre, salle d’attente, présence, quitter, reconnexion) ──
  function multi() {
    maps($('#rmaps'), rmap, (id) => { rmap = id; multi(); }); seg($('#pl'), players); $('#ai').checked = fill;
    $('#rcreate').hidden = tab !== 'create'; $('#rjoin').hidden = tab !== 'join';
    for (const b of $('#rtabs').children) b.classList.toggle('on', b.dataset.t === tab);
  }
  for (const b of $('#pl').children) b.onclick = () => { players = +b.dataset.n; multi(); };
  $('#ai').onchange = (e) => { fill = e.target.checked; };
  for (const b of $('#rtabs').children) b.onclick = () => { tab = b.dataset.t; multi(); };
  $('#jcode').oninput = (e) => { e.target.value = N.code(e.target.value); };

  const st = (m) => { $('#st').textContent = m || ''; };
  const newPlayer = (nm) => ({ name: nm, score: 0, uid: N.F.uid, joined: N.ts(), lastSeen: N.ts(), away: false });
  try { $('#name').value = localStorage.getItem(N.NAME_KEY) || ''; } catch (e) { /* ignore */ }
  function pseudo() {
    const v = $('#name').value.trim();
    if (!v) { $('#name').focus(); st('Entre un pseudo.'); return null; }
    try { localStorage.setItem(N.NAME_KEY, v); } catch (e) { /* ignore */ }
    return v;
  }

  $('#createBtn').onclick = async () => {
    if (busy) return; const nm = pseudo(); if (!nm) return;
    busy = true; st('Connexion…');
    try {
      if (!(await N.initFb())) { st('Multijoueur indisponible hors ligne.'); return; }
      let made = null;
      for (let i = 0; i < 3 && !made; i++) {
        const c = N.genCode();
        const ok = await N.F.fb.createRoom(N.gameIdOf(c), { code: c, state: 'waiting', mapId: rmap, maxPlayers: players, fillWithAI: fill, leaderId: N.F.uid, createdAt: N.ts(), players: { [N.F.uid]: newPlayer(nm) } });
        if (ok) made = c;
      }
      if (!made) throw new Error('createRoom');
      st(''); enter(made);
    } catch (e) { console.error(e); st('Création impossible.'); }
    finally { busy = false; }
  };
  $('#joinBtn').onclick = join;
  $('#jcode').onkeydown = (e) => { if (e.key === 'Enter') join(); };
  async function join() {
    if (busy) return; const nm = pseudo(); if (!nm) return;
    const code = $('#jcode').value.trim().toUpperCase();
    if (code.length !== 6) { st('Code invalide.'); return; }
    busy = true; st('Recherche…');
    try {
      if (!(await N.initFb())) { st('Multijoueur indisponible hors ligne.'); return; }
      const id = N.gameIdOf(code), d = await N.F.fb.getRoom(id);
      if (!d) { st('Room introuvable.'); return; }
      if (d.players && d.players[N.F.uid]) { await rejoin(code, d); st(''); return; }
      if (N.isDead(d)) { await N.F.fb.deleteRoom(id); st('Room introuvable.'); return; }
      if (d.state !== 'waiting') { st('La partie a déjà commencé.'); return; }
      if (Object.keys(d.players || {}).length >= (d.maxPlayers || 4)) { st(`Room pleine (${d.maxPlayers || 4} joueurs).`); return; }
      const r = await N.F.fb.joinRoom(id, newPlayer(nm));
      if (r !== true) { console.warn('joinRoom', r); st('Impossible de rejoindre.'); return; }
      st(''); enter(code);
    } catch (e) { console.error(e); st('Impossible de rejoindre.'); }
    finally { busy = false; }
  }
  /** Retour d’un joueur déjà inscrit : reprend son siège (away = false). */
  async function rejoin(code, d) {
    if (d.state === 'playing') {
      await N.F.fb.updateRoom(N.gameIdOf(code), { [`players/${N.F.uid}/away`]: false, [`players/${N.F.uid}/lastSeen`]: N.ts() });
      go2(code, d);
    } else enter(code);
  }
  // Reprise après actualisation / retour au menu
  (async function restore() {
    const c = N.readSavedRoom();
    if (!c || !(await N.initFb())) return;
    const d = await N.F.fb.getRoom(N.gameIdOf(c));
    if (!d || !d.players || !d.players[N.F.uid] || (d.state !== 'waiting' && d.state !== 'playing')) { N.clearSavedRoom(); return; }
    show('multi');
    if (d.state === 'playing') { $('#resumeBtn').hidden = false; $('#resumeBtn').onclick = () => rejoin(c, d).catch(() => st('Reprise impossible.')); } else enter(c);
  })();

  function enter(code) {
    cur = code; roomData = null; redirecting = false; N.saveRoom(code);
    if (unsub) unsub();
    unsub = N.watch(code, (d) => onRoom(code, d));
    clearInterval(hb); N.beat(code); hb = setInterval(() => N.beat(code), N.HB);
  }
  function reset(m) {
    if (unsub) unsub(); unsub = null; clearInterval(hb);
    cur = null; roomData = null; N.clearSavedRoom(); show('multi'); st(m || '');
  }
  function go2(code, d) {
    if (redirecting) return; redirecting = true;
    if (unsub) unsub(); unsub = null; clearInterval(hb);
    N.write({ mode: 'multi', mapId: d && M.maps[d.mapId] ? d.mapId : 'garden', roomCode: code, resume: true });
    location.href = 'game.html';
  }
  function onRoom(code, d) {
    if (code !== cur || redirecting) return;
    if (!d || !d.players || !d.players[N.F.uid]) { reset(d ? 'Tu as quitté la room.' : 'La room a été fermée.'); return; }
    roomData = d;
    if (d.state === 'playing' && d.seats) { go2(code, d); return; }   // la room est prête : l’hôte a lancé
    showWait();
  }
  function showWait() {
    const d = roomData; if (!d) return;
    show('wait'); $('#wcode').textContent = cur;
    const max = d.maxPlayers || 2, mp = M.maps[d.mapId];
    $('#wmode').textContent = `${mp ? mp.name : 'Le jardin'} · ${max} joueurs max${d.fillWithAI ? ' · IA pour compléter' : ''}`;
    const hum = N.order(d), chips = hum.map(([u, p]) => {
      const c = document.createElement('div');
      c.className = 'chip' + (u === N.F.uid ? ' me' : '') + (u !== N.F.uid && !N.isPresent(p) ? ' off' : '');
      c.textContent = (p.name || 'Joueur') + (u === d.leaderId ? ' ★' : '') + (u === N.F.uid ? ' (toi)' : '');
      return c;
    });
    if (d.fillWithAI) for (let i = hum.length; i < max; i++) { const c = document.createElement('div'); c.className = 'chip off'; c.textContent = 'IA'; chips.push(c); }
    $('#chips').replaceChildren(...chips);
    const present = hum.filter(([u, p]) => u === N.F.uid || N.isPresent(p)).length, host = N.hostOf(d) === N.F.uid, total = d.fillWithAI ? max : present;
    $('#startBtn').hidden = !host; $('#startBtn').disabled = total < 2;
    $('#whint').textContent = `${present} joueur${present > 1 ? 's' : ''} présent${present > 1 ? 's' : ''} (2 à ${max}). ` + (host ? (total < 2 ? 'Attends au moins un autre joueur, ou coche « Remplir avec des IA ».' : 'Tu peux lancer la partie.') : 'L’hôte lance la partie.');
  }
  setInterval(() => { if (roomData && !$('#v-wait').hidden) showWait(); }, 5000);

  $('#startBtn').onclick = async () => {
    if (busy || !cur) return; busy = true;
    try {
      const id = N.gameIdOf(cur), d = await N.F.fb.getRoom(id);
      if (!d || d.state !== 'waiting' || N.hostOf(d) !== N.F.uid) return;
      const ps = N.order(d), max = d.maxPlayers || 2, keep = ps.filter(([u, p]) => u === N.F.uid || N.isPresent(p)).map((x) => x[0]).sort((a, b) => (b === N.F.uid) - (a === N.F.uid)).slice(0, max);   // l’hôte qui lance = siège 0 = balle blanche
      const seats = keep.map((u) => ({ u, n: d.players[u].name || 'Joueur' }));
      if (d.fillWithAI) for (let i = 1; seats.length < max; i++) seats.push({ u: '', n: 'IA ' + i });
      if (seats.length < 2) return;   // room pas prête : rien n’est lancé
      const up = { state: 'playing', leaderId: N.F.uid, seats };
      ps.forEach(([x]) => { if (!keep.includes(x)) up[`players/${x}`] = null; });
      await N.F.fb.updateRoom(id, up);
    } catch (e) { console.error(e); }
    finally { busy = false; }
  };
  $('#leaveBtn').onclick = async () => {
    if (!cur) return; const c = cur; redirecting = true;
    if (unsub) unsub(); unsub = null; clearInterval(hb);
    try { await N.leaveRoom(c, false); } catch (e) { console.error(e); }
    redirecting = false; reset('');
  };
  $('#copyBtn').onclick = async () => {
    try { await navigator.clipboard.writeText(cur || ''); $('#copyBtn').textContent = 'Copié !'; } catch (e) { $('#copyBtn').textContent = 'Copie impossible'; }
    setTimeout(() => { $('#copyBtn').textContent = 'Copier le code'; }, 2000);
  };

  // ── navigation ──
  for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => show(b.dataset.go);
  for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => show('home');
  const ro = $('#rulesOverlay'), rc = () => ro.classList.remove('open');
  $('#rulesBtn').onclick = () => ro.classList.add('open'); $('#rulesClose').onclick = rc; ro.onclick = (e) => { if (e.target === ro) rc(); };
  addEventListener('keydown', (e) => { if (e.key === 'Escape') rc(); });
  $('#tot').textContent = `${M.mapList.reduce((s, x) => s + (C.best(x.id) || 0), 0)} pts au total`;   // somme des meilleurs scores de toutes les maps
  show('home');
})();
