// Réseau Little Turismo : rooms Firebase et état de course autoritaire côté créateur.
// Les rendus clients interpolent les snapshots publiés par l'hôte.
const PREFIX = 'racing_';
export const ROOM_KEY = 'little-turismo-room';
export const N = { cfg: null, fb: null, uid: null, offset: 0, _ref: null, _update: null, _onValue: null, db: null };

export const roomId = (code) => PREFIX + code;
export const now = () => Date.now() + N.offset;
export const readSession = () => { try { const v = localStorage.getItem(ROOM_KEY); return v ? JSON.parse(v) : null; } catch { return null; } };
export const saveSession = (v) => { try { localStorage.setItem(ROOM_KEY, JSON.stringify(v)); } catch { /* stockage indisponible */ } };
export const clearSession = () => { try { localStorage.removeItem(ROOM_KEY); } catch { /* stockage indisponible */ } };
export const code = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

export async function init() {
  if (N.uid) return N;
  try {
    const net = await import('../../../js/network.js');
    if (!(await net.checkRealConnection())) return null;
    const [cfg, fb] = await Promise.all([import('../../../js/config/firebase-config.js'), import('../../../js/firebaseWrk.js')]);
    if (!(await cfg.firebaseReady) || !cfg.auth?.currentUser) return null;
    N.cfg = cfg; N.fb = fb; N.uid = cfg.auth.currentUser.uid;
    // Stocker les outils SDK directement pour un accès sans overhead
    N.db = cfg.database;
    N._ref = cfg.getRef();
    N._update = cfg.getUpdate ? cfg.getUpdate() : null;
    N._onValue = cfg.getOnValue();
    // Attendre l'offset serveur (max 1,5 s) : horodatages cohérents, pas de paquets rejetés après un saut d'horloge.
    await new Promise((res) => { const to = setTimeout(res, 1500); try { N._onValue(N._ref(N.db, '.info/serverTimeOffset'), (s) => { N.offset = Number(s.val()) || 0; clearTimeout(to); res(); }); } catch { clearTimeout(to); res(); } });
    return N;
  } catch (e) { console.warn('Racing network unavailable', e); return null; }
}

// Mise à jour directe SDK sans checkRealConnection (trop lent pour le temps-réel)
export async function update(code, data) {
  if (!N._ref || !N._update) { try { return (await N.fb?.updateRoom(roomId(code), data)) !== false; } catch { return false; } }
  try {
    await N._update(N._ref(N.db, `rooms/${roomId(code)}`), data);
    return true;
  } catch { return false; }
}

export async function getRoom(code) { return N.fb?.getRoom(roomId(code)); }
export async function createRoom(code, data) { return N.fb?.createRoom(roomId(code), data); }
export async function join(code, player) { return N.fb?.joinRoom(roomId(code), { ...player, uid: N.uid }); }

// Invités : écouter uniquement /runtime pour ne pas recevoir tout le nœud room
export function watchRuntime(code, cb) {
  if (!N._onValue || !N._ref || !N.db) return () => { };
  return N._onValue(N._ref(N.db, `rooms/${roomId(code)}/runtime`), (s) => cb(s.val()), () => cb(null));
}

// Hôte : écouter uniquement /players (paquets des invités)
export function watchPlayers(code, cb) {
  if (!N._onValue || !N._ref || !N.db) return () => { };
  return N._onValue(N._ref(N.db, `rooms/${roomId(code)}/players`), (s) => cb(s.val()), () => cb(null));
}

export function watchState(code, cb) {
  if (!N._onValue || !N._ref || !N.db) return () => { };
  return N._onValue(N._ref(N.db, `rooms/${roomId(code)}/state`), (s) => cb(s.val()), () => cb(null));
}

export function watch(code, cb) {
  if (!N.cfg) return () => { };
  return N.cfg.getOnValue()(N.cfg.getRef()(N.cfg.database, `rooms/${roomId(code)}`), (s) => cb(s.val()), () => cb(null));
}

export async function leave(code, started = false) {
  if (!N.uid || !N.fb) return;
  const d = await getRoom(code); if (!d) return;
  const others = Object.keys(d.players || {}).filter((u) => u !== N.uid);
  if (!others.length) { await N.fb.deleteRoom(roomId(code)); clearSession(); return; }
  await update(code, started ? { [`players/${N.uid}/away`]: true, [`players/${N.uid}/lastSeen`]: now() } : { [`players/${N.uid}`]: null });
  clearSession();
}
// --- Rooms publiques : index léger sous rooms/racing_public/<code> (même zone que les rooms, donc mêmes règles d'écriture).
const PUB = 'rooms/racing_public';
export async function setPublic(code, info) {   // info = null → retire de la liste
  if (!N._ref || !N._update || !N.db) return false;
  try { await N._update(N._ref(N.db, PUB), { [code]: info ? { ...info, code, t: now() } : null }); return true; } catch (e) { console.warn('setPublic refusé', e); return false; }
}
export function watchPublic(cb) {
  if (!N._onValue || !N._ref || !N.db) return () => { };
  return N._onValue(N._ref(N.db, PUB), (s) => {
    const v = s.val() || {}, t = now();
    cb(Object.values(v).filter((r) => r && r.code && t - (r.t || 0) < 90000).sort((a, b) => (b.t || 0) - (a.t || 0)));
  }, (e) => { console.warn('watchPublic refusé', e); cb([]); });
}
