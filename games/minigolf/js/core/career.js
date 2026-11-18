// Carrière : meilleur score, partie en cours, déblocage. localStorage, préfixe minigolf/.
// Score d'un trou = 7 − coups (3 coups = 4 points, jamais sous 0). Objectif d'une map = score total minimum (4 points par trou, soit 36 sur 9 trous).
(function () {
  const M = window.Minigolf = window.Minigolf || {}, X = 'minigolf/';
  const rd = (k) => { try { const v = localStorage.getItem(X + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const wr = (k, v) => { try { localStorage.setItem(X + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } };
  const C = M.career = {
    pts: (c) => Math.max(0, 7 - c),
    score: (s) => s.reduce((a, c) => a + Math.max(0, 7 - c), 0),
    threshold: (n) => 4 * n,
    best(id) { const b = rd('score/' + id); return Number.isFinite(b) && b >= 0 ? b : null; },
    /** Enregistre le score d’une map finie ; garde le plus haut. */
    finish(id, score) { const b = C.best(id); if (b === null || score > b) { wr('score/' + id, score); return { best: score, record: true }; } return { best: b, record: false }; },
    idx: (id) => M.mapList.findIndex((m) => m.id === id),
    /** Somme des MEILLEURS scores des maps placées avant `id`. */
    sumBefore(id) { let t = 0; for (let k = 0; k < C.idx(id); k++) t += C.best(M.mapList[k].id) || 0; return t; },
    /** Total cumulé jusqu’à `id` inclus (meilleurs scores). */
    cumul(id) { return C.sumBefore(id) + (C.best(id) || 0); },
    /** État d’une map : open (jouable), ready (seuil atteint), have/need (points cumulés des maps précédentes / requis). */
    status(id) {
      const m = M.mapList[C.idx(id)]; if (!m) return { open: false, ready: false, have: 0, need: 0 };
      if (m.open || !m.need) return { open: !!M.maps[id], ready: true, have: 0, need: 0 };
      const have = C.sumBefore(id); return { open: !!M.maps[id] && have >= m.need, ready: have >= m.need, have, need: m.need };
    },
    unlocked(id, n) { const b = C.best(id); return b !== null && b >= C.threshold(n); },
    loadRun(id, n) {
      const r = rd('run/' + id);
      if (!r || !Array.isArray(r.s) || !r.s.every((v) => Number.isInteger(v) && v > 0 && v <= 8) || !Number.isInteger(r.h) || r.h < 0 || r.h > n || r.s.length !== r.h) return null;
      r.c = Number.isInteger(r.c) && r.c >= 0 && r.c < 8 ? r.c : 0; return r;
    },
    saveRun(id, r) { wr('run/' + id, r); },
    clearRun(id) { try { localStorage.removeItem(X + 'run/' + id); } catch (e) { /* stockage indisponible */ } },
  };
})();
