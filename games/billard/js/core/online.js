// online.js — couche Firebase du mode en ligne (V7). Chargé À LA DEMANDE (import dynamique depuis menu.js / game.js) : les modes locaux
// et l'ordinateur ne chargent jamais Firebase. Réutilise tel quel firebase-config.js (config, connexion anonyme) et firebaseWrk.js (salons).
// Salle : rooms/billard_<CODE> → { code, game, state: waiting|playing|ended, leaderId, numPlayers, config{mode,opts}, seats{a,b}, players{uid{…}},
// game{seq,snap,msg}, mv{…image…}, live{…} }. Seul le leader (hôte) écrit game / mv / live / state ; chaque joueur n'écrit que players/<son uid>.
import { database, auth, firebaseReady, getServerTimestamp, getRef, getOnValue, getSet, getUpdate } from '../../../../js/config/firebase-config.js';
import { createRoom, joinRoom, getRoom, deleteRoom } from '../../../../js/firebaseWrk.js';
import { MODES } from './modes.js';
import { PREFIX, CODE_RE, newCode, cleanName, normCode } from './sync.js';

const fail = (message, gone = false) => Object.assign(new Error(message), { gone });
export const diag = (...a) => console.info('[billard en ligne]', ...a);     // diagnostic : jamais d'identifiant d'utilisateur ni de nom
const ROOM_TTL = 6 * 3600e3;                                                  // un salon encore « waiting » après 6 h est considéré expiré
export const idOf = code => PREFIX + code;
const ref = p => getRef()(database, p);
const put = (p, v) => getSet()(ref(p), v);
const stamp = () => getServerTimestamp()();
let onError = null;
export const setErrorHandler = f => { onError = f; };
const werr = e => { console.warn('[billard en ligne] écriture refusée/échouée', e); onError?.(e); };

// firebase-config.js ne résout jamais `firebaseReady` si le ping échoue juste après l'init : on borne l'attente.
export async function ready(ms = 9000) {
  const ok = await Promise.race([firebaseReady, new Promise(r => setTimeout(() => r('timeout'), ms))]);
  if (ok !== true) throw fail(ok === 'timeout' ? 'Connexion à Firebase impossible (délai dépassé).' : 'Hors ligne ou Firebase indisponible : le mode en ligne demande une connexion.');
  for (let i = 0; i < 50 && !auth?.currentUser; i++) await new Promise(r => setTimeout(r, 100));
  if (!auth?.currentUser) throw fail('Connexion anonyme à Firebase impossible.');
  return auth.currentUser.uid;
}

const player = (uid, name) => ({ name: cleanName(name), score: 0, uid, joined: stamp(), lastSeen: stamp(), status: 'waiting' }); // `score` exigé par les règles

export async function createLobby(mode, opts, name) {
  const uid = await ready();
  for (let i = 0; i < 4; i++) {
    const code = newCode();
    const ok = await createRoom(idOf(code), {
      code, game: 'billard', state: 'waiting', leaderId: uid, numPlayers: 2, createdAt: stamp(),
      config: { mode, opts }, players: { [uid]: player(uid, name) }
    });
    if (ok) return { code, uid };
  }
  throw fail('Impossible de créer le salon (connexion ou Firebase). Réessaie.');
}

// Lecture unique qui distingue : null = salon inexistant ; erreur avec .code = lecture refusée ; erreur sans code = réseau (délai).
export function peek(path, ms = 8000) {
  return new Promise((res, rej) => {
    let done = false, off = null;
    const t = setTimeout(() => fin(rej, fail('Réseau lent ou indisponible : le salon n\'a pas répondu à temps. Réessaie.')), ms);
    const fin = (f, v) => { if (done) return; done = true; clearTimeout(t); try { off?.(); } catch { } f(v); };
    off = getOnValue()(ref(path), s => fin(res, s.val()), e => fin(rej, Object.assign(fail('Lecture du salon refusée (' + (e?.code || 'erreur') + ').'), { code: e?.code || 'denied' })));
    if (done) try { off?.(); } catch { }
  });
}
const hint = code => {
  if (!code) return 'Saisis le code à 6 caractères du salon.';
  if (code.length !== 6) return `Code invalide : ${code.length} caractère(s) saisi(s), 6 attendus.`;
  const bad = [...new Set(code.match(/[IO01]/g) || [])];
  return bad.length ? `Code invalide : il ne contient jamais I, O, 0 ni 1 (trouvé : ${bad.join(' ')}). Vérifie la dictée.` : 'Code invalide.';
};

// resume = true : retour volontaire dans son propre salon (bouton « Reprendre »). Sinon, ouvrir SON propre code depuis le même navigateur est signalé
// (même compte anonyme Firebase partagé entre onglets : l'« invité » serait l'hôte lui-même).
export async function joinLobby(raw, name, resume = false) {
  const code = normCode(raw);                                                       // espaces, retours à la ligne, tirets, minuscules : tolérés
  if (!CODE_RE.test(code)) throw fail(hint(code));
  const uid = await ready();
  let room;
  try { room = await peek(rp(code)); }
  catch (e) { diag('lecture directe échouée :', e.code || 'réseau'); if (!e.code) throw e; room = await getRoom(idOf(code)); }   // lecture refusée : repli sur firebaseWrk
  const ps = room?.players || {};
  diag('rejoindre', { code, trouvé: !!room, état: room?.state, joueurs: Object.keys(ps).length, déjàInscrit: !!ps[uid], hôteCeNavigateur: room?.leaderId === uid });
  if (!room || room.game !== 'billard') throw fail('Aucun salon avec ce code : vérifie-le ou demande à l\'hôte d\'en créer un nouveau.', true);
  if (ps[uid]) {                                                                    // retour d'un joueur déjà inscrit (actualisation, reconnexion)
    if (room.leaderId === uid && !resume) throw fail('Ce salon a été créé depuis ce navigateur (même compte anonyme) : ouvre le code depuis un autre appareil, ou utilise « Reprendre le salon ».');
    return { code, uid, room };
  }
  if (room.state === 'waiting' && Number.isFinite(room.createdAt) && Date.now() - room.createdAt > ROOM_TTL) throw fail('Ce salon a expiré (créé il y a plus de 6 h). Demande un nouveau code à l\'hôte.', true);
  if (room.state === 'ended') throw fail('Cette partie est terminée.', true);
  if (room.state !== 'waiting') throw fail('Cette partie a déjà commencé.');
  if (Object.keys(ps).length >= 2) throw fail('Ce salon est complet.');
  const r = await joinRoom(idOf(code), player(uid, name));
  if (r !== true) { diag('joinRoom refusé :', r); throw fail(typeof r === 'string' ? r.replace(/^Erreur[^:]*:\s*/, '') : 'Impossible de rejoindre le salon.'); }
  return { code, uid, room };
}

// Entrée dans la partie (game.js) : le salon doit être lancé et le joueur doit figurer dans `seats` (fixé au lancement par l'hôte).
// V11 : « Salon indisponible » intermittent = lecture transitoire (cache vide juste après la redirection, ping lent, état pas encore propagé).
// Les échecs non définitifs sont donc retentés (6 essais) ; seuls « pas dans ce salon » et « configuration invalide » sont immédiats.
export async function enter(raw) {
  const code = normCode(raw);
  if (!CODE_RE.test(code)) throw fail('Code de salon invalide.', true);
  let uid, last;
  for (let i = 0; i < 6; i++) {
    try { uid ??= await ready(); return await enterOnce(code, uid); }
    catch (e) { last = e; if (e.final) throw e; await new Promise(r => setTimeout(r, 700)); }
  }
  throw last;
}
async function enterOnce(code, uid) {
  let room = null, why = '';
  try { room = await peek(rp(code)); if (!room) why = 'absent'; }              // V11 diagnostic : distingue « absent » / « lecture refusée » / réseau
  catch (e) { why = e.code ? 'refusé:' + e.code : 'réseau'; diag('enter : lecture directe', why); }
  if (!room) room = await getRoom(idOf(code)).catch(() => null);
  if (!room || room.game !== 'billard') throw fail(`Salon indisponible (${why || 'données invalides'}) : ${room ? 'ce n\'est pas une partie de billard.' : why === 'absent' ? 'il n\'existe plus (fermé par l\'hôte ?).' : why.startsWith('refusé') ? 'lecture refusée par Firebase.' : 'réseau lent.'}`, why === 'absent');
  if (!room.config || !Object.hasOwn(MODES, room.config.mode)) throw Object.assign(fail('Salon invalide (configuration absente).', true), { final: true });
  if (room.state === 'waiting') throw fail('La partie n\'a pas encore été lancée par l\'hôte.');
  const s = room.seats;
  if (!s || typeof s.a !== 'string' || typeof s.b !== 'string' || room.leaderId !== s.a) throw fail('Salon invalide (joueurs absents).', true);
  const seat = uid === s.a ? 0 : uid === s.b ? 1 : -1;
  if (seat < 0) throw Object.assign(fail('Tu ne fais pas partie de ce salon (partie déjà lancée à deux joueurs).', true), { final: true });
  return { uid, seat, room, code };
}

export const startRoom = (code, hostUid, guestUid) =>
  getUpdate()(ref(`rooms/${idOf(code)}`), { state: 'playing', seats: { a: hostUid, b: guestUid }, startedAt: stamp() });
export async function leaveLobby(code, uid, host) { if (host) await deleteRoom(idOf(code)); else await put(`rooms/${idOf(code)}/players/${uid}`, null); }
export const removeRoom = code => deleteRoom(idOf(code));
export const setEnded = code => getUpdate()(ref(`rooms/${idOf(code)}`), { state: 'ended' }).catch(werr);
export const setPlaying = code => getUpdate()(ref(`rooms/${idOf(code)}`), { state: 'playing' }).catch(werr);     // V8 : revanche dans la même room

// Lecture : renvoie la fonction de désabonnement. cb reçoit null si le nœud n'existe pas / plus.
export const watch = (path, cb) => getOnValue()(ref(path), s => cb(s.val()), e => console.warn('[billard en ligne] lecture refusée', path, e));

// Écritures de jeu : directes (sans le ping réseau de firebaseWrk, trop lourd à 12 images/s).
const rp = code => `rooms/${idOf(code)}`;
export const beat = (code, uid) => put(`${rp(code)}/players/${uid}/lastSeen`, stamp()).catch(() => { });
export const publish = (code, doc) => put(`${rp(code)}/game`, doc).catch(werr);                       // hôte : état validé
export const frame = (code, f) => { put(`${rp(code)}/mv`, f).catch(werr); };                           // hôte : image de billes
export const live = (code, uid, host, l) => { put(host ? `${rp(code)}/live` : `${rp(code)}/players/${uid}/live`, l).catch(() => { }); };
export const act = (code, uid, a) => put(`${rp(code)}/players/${uid}/act`, a).catch(werr);           // invité : intention
export const markLeft = (code, uid, v = true) => put(`${rp(code)}/players/${uid}/left`, v ? true : null).catch(() => { });   // v = false : efface (retour dans le salon)
