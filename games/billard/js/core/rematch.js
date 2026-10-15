// rematch.js — accord de revanche dans une room (V8). Module pur (testable sous Node).
// rm = h + 3·g (h = vote de l'hôte / siège 0, g = vote de l'invité / siège 1) ; chaque vote : 0 = rien, 1 = veut rejouer, 2 = refuse.
// Seul l'hôte lance la nouvelle manche (quand rm === 4 et que l'autre joueur est présent) ; l'invité envoie son vote en intention.
export const RM_READY = 4, RM_WAIT_MS = 45000;
export const rmGet = (rm, seat) => Math.floor(rm / 3 ** seat) % 3;
export const rmSet = (rm, seat, v) => rm + (v - rmGet(rm, seat)) * 3 ** seat;
export const rmOk = rm => Number.isInteger(rm) && rm >= 0 && rm < 9;

// Ce que l'écran de fin affiche pour le joueur `seat`. ctx = { peer: nom, peerOffline, peerLeft, roomGone, waited (ms depuis mon vote) }.
export function rmView(rm, seat, ctx = {}) {
  const me = rmGet(rm, seat), you = rmGet(rm, 1 - seat), p = ctx.peer || "L'adversaire";
  const dead = !!ctx.roomGone || !!ctx.peerLeft;
  let text = "";
  if (ctx.roomGone) text = "Le salon a été fermé : retour au menu.";
  else if (ctx.peerLeft) text = `${p} a quitté le salon : retour au menu.`;
  else if (me === 1 && you === 2) text = `${p} a refusé la revanche. Tu peux attendre qu'il change d'avis ou retourner au menu.`;
  else if (me === 1 && ctx.peerOffline) text = `${p} semble déconnecté : ta demande est conservée.`;
  else if (me === 1 && (ctx.waited || 0) > RM_WAIT_MS) text = `${p} n'a pas répondu. Tu peux attendre encore ou retourner au menu.`;
  else if (me === 1) text = `En attente de ${p}…`;
  else if (you === 1 && me !== 2) text = `${p} veut rejouer.`;
  else if (you === 1) text = `Tu as refusé ; ${p} veut rejouer.`;
  else if (ctx.peerOffline) text = `${p} semble déconnecté.`;
  return { me, you, text, btn: me === 1 ? "Annuler" : "Rejouer", canVote: !dead, vote: me === 1 ? 0 : 1, showDecline: !dead && you === 1 && me === 0 };
}
