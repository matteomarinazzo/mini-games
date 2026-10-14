// online.js — couche Firebase du mode en ligne (V7). Chargé À LA DEMANDE (import dynamique depuis menu.js / game.js) : les modes locaux
// et l'ordinateur ne chargent jamais Firebase. Réutilise tel quel firebase-config.js (config, connexion anonyme) et firebaseWrk.js (salons).
// Salle : rooms/billard_<CODE> → { code, game, state: waiting|playing|ended, leaderId, numPlayers, config{mode,opts}, seats{a,b}, players{uid{…}},
// game{seq,snap,msg}, mv{…image…}, live{…} }. Seul le leader (hôte) écrit game / mv / live / state ; chaque joueur n'écrit que players/<son uid>.
import { database, auth, firebaseReady, getServerTimestamp, getRef, getOnValue, getSet, getUpdate } from '../../../../js/config/firebase-config.js';
import { createRoom, joinRoom, getRoom, deleteRoom } from '../../../../js/firebaseWrk.js';
import { MODES } from './modes.js';
import { PREFIX, CODE_RE, newCode, cleanName } from './sync.js';

const fail = (message, gone = false) => Object.assign(new Error(message), { gone });
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

export async function joinLobby(raw, name) {
  const code = String(raw || '').trim().toUpperCase();
  if (!CODE_RE.test(code)) throw fail('Code invalide : 6 caractères (lettres et chiffres, sans I, O, 0, 1).');
  const uid = await ready();
  const room = await getRoom(idOf(code));
  if (!room || room.game !== 'billard') throw fail('Aucun salon avec ce code (ou connexion indisponible).', true);
  const ps = room.players || {};
  if (ps[uid]) return { code, uid, room };                                          // retour d'un joueur déjà inscrit (actualisation, reconnexion)
  if (room.state !== 'waiting') throw fail('Cette partie a déjà commencé.');
  if (Object.keys(ps).length >= 2) throw fail('Ce salon est complet.');
  const r = await joinRoom(idOf(code), player(uid, name));
  if (r !== true) throw fail(typeof r === 'string' ? r.replace(/^Erreur[^:]*:\s*/, '') : 'Impossible de rejoindre le salon.');
  return { code, uid, room };
}

// Entrée dans la partie (game.js) : le salon doit être lancé et le joueur doit figurer dans `seats` (fixé au lancement par l'hôte).
export async function enter(raw) {
  const code = String(raw || '').toUpperCase();
  if (!CODE_RE.test(code)) throw fail('Code de salon invalide.', true);
  const uid = await ready();
  const room = await getRoom(idOf(code));
  if (!room || room.game !== 'billard') throw fail('Ce salon n\'existe plus (fermé par l\'hôte).', true);
  if (!room.config || !Object.hasOwn(MODES, room.config.mode)) throw fail('Salon invalide (configuration absente).', true);
  if (room.state === 'waiting') throw fail('La partie n\'a pas encore été lancée par l\'hôte.');
  const s = room.seats;
  if (!s || typeof s.a !== 'string' || typeof s.b !== 'string' || room.leaderId !== s.a) throw fail('Salon invalide (joueurs absents).', true);
  const seat = uid === s.a ? 0 : uid === s.b ? 1 : -1;
  if (seat < 0) throw fail('Tu ne fais pas partie de ce salon (partie déjà lancée à deux joueurs).', true);
  return { uid, seat, room, code };
}

export const startRoom = (code, hostUid, guestUid) =>
  getUpdate()(ref(`rooms/${idOf(code)}`), { state: 'playing', seats: { a: hostUid, b: guestUid }, startedAt: stamp() });
export async function leaveLobby(code, uid, host) { if (host) await deleteRoom(idOf(code)); else await put(`rooms/${idOf(code)}/players/${uid}`, null); }
export const removeRoom = code => deleteRoom(idOf(code));
export const setEnded = code => getUpdate()(ref(`rooms/${idOf(code)}`), { state: 'ended' }).catch(werr);

// Lecture : renvoie la fonction de désabonnement. cb reçoit null si le nœud n'existe pas / plus.
export const watch = (path, cb) => getOnValue()(ref(path), s => cb(s.val()), e => console.warn('[billard en ligne] lecture refusée', path, e));

// Écritures de jeu : directes (sans le ping réseau de firebaseWrk, trop lourd à 12 images/s).
const rp = code => `rooms/${idOf(code)}`;
export const beat = (code, uid) => put(`${rp(code)}/players/${uid}/lastSeen`, stamp()).catch(() => { });
export const publish = (code, doc) => put(`${rp(code)}/game`, doc).catch(werr);                       // hôte : état validé
export const frame = (code, f) => { put(`${rp(code)}/mv`, f).catch(werr); };                           // hôte : image de billes
export const live = (code, uid, host, l) => { put(host ? `${rp(code)}/live` : `${rp(code)}/players/${uid}/live`, l).catch(() => { }); };
export const act = (code, uid, a) => put(`${rp(code)}/players/${uid}/act`, a).catch(werr);           // invité : intention
export const markLeft = (code, uid) => put(`${rp(code)}/players/${uid}/left`, true).catch(() => { });
