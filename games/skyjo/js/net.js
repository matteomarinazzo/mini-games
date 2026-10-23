/** Couche Firebase partagée menu/jeu (API calquée sur firebaseWrk.js). Chargée à la demande : le solo reste hors ligne. */
export const GAME_PREFIX = 'skyjo_', SAVED_ROOM_KEY = 'skyjo_room', NAME_KEY = 'mg_player_name';
export const HEARTBEAT_MS = 10000, OFFLINE_AFTER_MS = 35000, DEAD_ROOM_AFTER_MS = 5 * 60 * 1000;
export const N = { fb: null, cfg: null, net: null, uid: null, offset: 0 };

export const gameIdOf = c => GAME_PREFIX + c;
export const serverNow = () => Date.now() + N.offset;
export const ts = () => { const f = N.cfg.getServerTimestamp(); return f ? f() : Date.now(); };
export const isOffline = p => !!p && typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > OFFLINE_AFTER_MS;
export const isPresent = p => !!p && !p.away && !isOffline(p);
export const isDead = d => { const ps = Object.values(d.players || {}); return !ps.length || ps.every(p => typeof p.lastSeen === 'number' && serverNow() - p.lastSeen > DEAD_ROOM_AFTER_MS); };
export const readSavedRoom = () => { try { return localStorage.getItem(SAVED_ROOM_KEY) || null; } catch { return null; } };
export const saveRoom = c => { try { localStorage.setItem(SAVED_ROOM_KEY, c); } catch { /* ignore */ } };
export const clearSavedRoom = () => { try { localStorage.removeItem(SAVED_ROOM_KEY); } catch { /* ignore */ } };

export async function initFb() {
    if (N.uid) return true;
    try {
        N.net ||= await import('../../../js/network.js');
        if (!(await N.net.checkRealConnection())) return false;
        const [cfg, fb] = await Promise.all([import('../../../js/config/firebase-config.js'), import('../../../js/firebaseWrk.js')]);
        if (!(await cfg.firebaseReady) || !cfg.auth.currentUser) return false;
        N.cfg = cfg; N.fb = fb; N.uid = cfg.auth.currentUser.uid;
        await new Promise(resolve => {
            const t = setTimeout(resolve, 2500);
            try { cfg.getOnValue()(cfg.getRef()(cfg.database, '.info/serverTimeOffset'), s => { N.offset = Number(s.val()) || 0; clearTimeout(t); resolve(); }); } catch { resolve(); }
        });
        return true;
    } catch (e) { console.warn(e); return false; }
}

export const watch = (code, cb) => N.cfg.getOnValue()(N.cfg.getRef()(N.cfg.database, `rooms/${gameIdOf(code)}`), s => cb(s.val()), e => console.warn('room:', e));
export function beat(code) {
    if (!code || !N.uid) return;
    try { Promise.resolve(N.fb.updateRoom(gameIdOf(code), { [`players/${N.uid}/lastSeen`]: ts() })).catch(() => { }); } catch { /* ignore */ }
}
/** Départ volontaire. Dernier humain (non "away") => room supprimée. En partie : le siège reste (away) pour la reconnexion. */
export async function leaveRoom(code, inGame) {
    const id = gameIdOf(code), d = await N.fb.getRoom(id);
    if (!d) return;
    const others = Object.entries(d.players || {}).filter(([u, p]) => u !== N.uid && !p.away);
    if (!others.length) { await N.fb.deleteRoom(id); return; }
    const u = {};
    if (inGame) u[`players/${N.uid}/away`] = true; else u[`players/${N.uid}`] = null;
    if (d.leaderId === N.uid) u.leaderId = others[0][0];
    await N.fb.updateRoom(id, u);
}
