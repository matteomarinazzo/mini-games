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
  if (!started && d.leaderId === N.uid && ['waiting','loading'].includes(d.state)) {
    const next = others.find((u) => !d.players?.[u]?.away) || others[0], changes = { [`players/${N.uid}`]: null, leaderId: next, state: 'waiting', startedAt: null };
    for (const uid of others) { changes[`players/${uid}/ready`] = false; changes[`players/${uid}/readyError`] = null; }
    await update(code, changes);
  } else await update(code, started ? { [`players/${N.uid}/away`]: true, [`players/${N.uid}/lastSeen`]: now() } : { [`players/${N.uid}`]: null });
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

// --- Dead reckoning : chaque voiture distante est extrapolée jusqu'à « maintenant » (horloge serveur) depuis son dernier paquet horodaté.
// À chaque nouveau paquet, l'écart de prédiction est étalé (décroissance exponentielle) : pas de saut visible, pas de retard d'interpolation.
// Réglages : EXT_MAX = extrapolation max (s) ; TAU = vitesse de résorption des écarts (s) ; SNAP = écart (m) au-delà duquel on téléporte ; ASSUME = latence supposée (s) si l'horloge serveur est inutilisable.
export const SYNC = { EXT_MAX: .3, TAU: .1, SNAP: 12, ASSUME: .08 };
const NL = 20, TA = new Float64Array(NL), TB = new Float64Array(NL), TWO_PI = 6.283185307;
function reck(o, a, e) {   // a = [x y z psi pitch roll u w r s …] ; vitesse corps constante, lacet constant (point milieu)
  o.set(a); if (e <= 0) return;
  const dp = Math.max(-.6, Math.min(.6, a[8] * e)), m = a[3] + dp * .5, cs = Math.cos(m), sn = Math.sin(m);
  o[0] = a[0] + (cs * a[6] - sn * a[7]) * e; o[2] = a[2] + (sn * a[6] + cs * a[7]) * e; o[3] = a[3] + dp; o[9] = a[9] + a[6] * e;
}
/** Canal = un émetteur (hôte pour les invités ; un invité pour l'hôte). */
export const newChan = () => ({ t: 0, at: 0, age: 0, base: 1e9, cars: new Map() });
/** map = { clé: tableau|objet de 20 valeurs }. stamp = Net.now() de l'émetteur. Renvoie false si paquet ignoré (ancien / doublon). */
export function chanPush(C, stamp, map) {
  if (stamp <= C.t) { if (C.t - stamp < 1500) return false; C.t = 0; C.at = 0; C.base = 1e9; C.cars.clear(); }
  const pn = performance.now(), raw = (now() - stamp) / 1000;
  C.base = Math.min(raw, C.base + .002);   // minimum glissant : détecte une horloge incohérente
  const age = C.base > -.1 && C.base < .8 ? Math.max(0, raw) : Math.max(0, raw - C.base + SYNC.ASSUME), had = C.at > 0, pe = C.age + (pn - C.at) / 1000;
  for (const k in map) {
    const v = map[k]; if (!v) continue;
    let S = C.cars.get(k); const fresh = !S;
    if (fresh) C.cars.set(k, S = { p: new Float64Array(NL), q: new Float64Array(NL), off: new Float64Array(6) }); else S.q.set(S.p);
    for (let i = 0; i < NL; i++) S.p[i] = +v[i] || 0;
    if (fresh || !had) continue;
    reck(TA, S.q, Math.min(SYNC.EXT_MAX, pe)); reck(TB, S.p, Math.min(SYNC.EXT_MAX, age));   // ancienne vs nouvelle prédiction à l'instant présent
    const o = S.off, nx = o[0] + TA[0] - TB[0], nz = o[2] + TA[2] - TB[2];
    if (nx * nx + nz * nz > SYNC.SNAP * SYNC.SNAP) o.fill(0);
    else { o[0] = nx; o[1] += TA[1] - TB[1]; o[2] = nz; const dp = o[3] + TA[3] - TB[3]; o[3] = dp - TWO_PI * Math.round(dp / TWO_PI); o[4] += TA[4] - TB[4]; o[5] += TA[5] - TB[5]; }
  }
  C.t = stamp; C.at = pn; C.age = age; return true;
}
/** Pose estimée « maintenant » dans out (Float64Array(20)). dt > 0 : résorbe l'écart de lissage ; dt = 0 : lecture seule. */
export function chanSample(C, k, dt, out) {
  const S = C.cars.get(k); if (!S) return false;
  reck(out, S.p, Math.min(SYNC.EXT_MAX, C.age + (performance.now() - C.at) / 1000));
  const o = S.off, f = dt > 0 ? Math.exp(-dt / SYNC.TAU) : 1;
  for (let i = 0; i < 6; i++) { o[i] *= f; out[i] += o[i]; }
  return true;
}
export const chanRaw = (C, k) => { const S = C.cars.get(k); return S ? S.p : null; };



// Outils ponctuels dédiés aux publications ; l’UID métier reste auth.currentUser.uid.
export async function publicationReady(){await init();return !!(N.db&&N._ref&&N._onValue&&N.cfg?.auth?.currentUser?.uid)}
export function publicationRead(path){if(!N.db||!N._ref||!N._onValue)return Promise.reject(Error('Connexion Firebase indisponible'));return new Promise((resolve,reject)=>{let stop=null,settled=false;const clean=()=>{if(stop){stop();stop=null}};try{stop=N._onValue(N._ref(N.db,path),s=>{if(settled)return;settled=true;resolve(s.val());if(stop)clean();else queueMicrotask(clean)},e=>{if(settled)return;settled=true;reject(e);if(stop)clean();else queueMicrotask(clean)})}catch(e){reject(e)}})}
export async function publicationUpdate(updates){if(!N.db||!N._ref||!N._update)throw Error('Connexion Firebase indisponible');await N._update(N._ref(N.db),updates)}
