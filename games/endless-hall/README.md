# Couloir Sans Fin — V3

Jeu solo, vanilla HTML/CSS/JS : zéro framework, WebGL, image, audio, npm. Slug / dossier `endless-hall`, UI FR uniquement. Arborescence : `index.html`, `game.html`, `css/`, `js/`, `js/core/`.

## Historique
### V1
Raycaster pseudo-3D sur canvas 2D, couloir d'hôtel, déplacement clavier / flèches tactiles, menu, HUD, pause, livret de règles.

### V2
- Un tronçon paramétré (`HALL` : `D`=22, `CX`=8, `DY`=6) : droit, virage à gauche, un peu droit, virage à droite, droit. Fenêtre de 3 copies (précédente, courante, suivante), seule la copie courante porte l'anomalie.
- Seuils en laiton entre deux copies ; plaque d'étape 0 à 8 ; 8 étapes ; chrono mm:ss ; records locaux ; sauvegarde v2 ; 10 anomalies (easy / medium).
- Limites corrigées en V3 : la plaque voisine affichait le numéro courant puis changeait au franchissement ; revenir en arrière téléportait au départ avec un fondu.

## V3
### Anomalies, ids stables et pools (`ANOMS`, `data.js`)
- easy : `lamp-off`, `extinguisher-missing`, `arrow-reversed`, `wrong-door-number`, `extra-door`
- medium : `poster-symbol`, `two-bins`, `ceiling-gap`, `camera-facing`, `stripe-offset`
- hard : `silhouette`, `shadow-only`, `longer-hall` (+4 tuiles : la ligne jaune est plus loin), `lamp-color`, `false-reflection`
- Couloir 0 : jamais d'anomalie. 1–2 : easy. 3–5 : easy + medium. 6–7 : medium + hard. Chaque couloir 1–7 tire rien (1/2) ou une anomalie de son pool ; une seule à la fois. Primitives existantes uniquement (textures murales, sprites, plafond, bande, lampes, `HALL.decals`), zéro image.

### Seed d'état normal
`normalState(seed)` (mulberry32) : numéros de portes (6 + 1 pour `extra-door`), côté de l'extincteur, sens de l'affiche, ordre des symboles, décalage d'une lampe, caméra, bande. Chaque étape appelle `applyScene(seed, step, anomalie, sens)` : même seed, puis au plus une anomalie sur le segment courant. Les voisins sont toujours normaux : l'anomalie suivante n'apparaît qu'au franchissement. La carte en coude ne change pas.

### Soudure des segments (correctif retour en arrière)
- Fenêtre de 3 segments (ouest, centre, est), posés par `(ax, ay, s)` : point local `(lx,ly)` → `(ax+s·lx, ay+s·ly)`. `s=+1` : segment droit (entrée à l'ouest, sortie à l'est, coude vers le nord). `s=−1` : le même coude tourné de 180° (entrée à l'est, sortie à l'ouest, coude vers le sud).
- Ouest : toujours tourné. Est : toujours droit. Centre : droit si `dir=+1`, tourné si `dir=−1`. Le segment derrière le joueur est donc toujours le 180° de celui de devant : en se retournant on voit un **début de couloir** (plaque, portes, affiche dans le même ordre), jamais le couloir vu depuis sa fin ni un décor inversé.
- Franchissement : `scene()` reconstruit la fenêtre avec le nouveau `dir`, puis le joueur est translaté (est : `x −= ancienne longueur, y += DY` ; ouest : `x += nouvelle longueur, y −= DY`). L'angle n'est jamais touché, aucun `setPosition` vers l'entrée. Les deux seuils (laiton, x = `OX` et `OX+L0`) sont des continuations ; `S.dir` devient le sens de franchissement.
- Ligne jaune devant = « rien à signaler » ; seuil derrière = « anomalie ».
- `longer-hall` : le segment courant mesure `D+4` ; seuils, bande, lampes et décor lisent `HALL.L0`. Sprites tournés : champ `rot` (orientation de la caméra murale).

### Pancarte
Une plaque à chaque bout de segment. Le courant affiche son étape, **les deux voisins affichent déjà `étape+1`** : à la fin du couloir 2, la plaque du segment d'après affiche 3 avant la ligne et reste 3 après, dans les deux sens. Seul l'échec la remet à 0, après le franchissement.

### Échec
Pas de téléport, pas de fondu. Le segment franchi devient le couloir 0 : même `seed`, anomalie retirée, étape 0, `plan` retiré au sort (1–7 jamais copiés), chrono à 0 (repart au pas suivant), `dir` = sens de franchissement.

### Victoire
8e bon choix : flash blanc (CSS, 1 s) puis modale « Sortie ! » (temps, record local, record mondial) avec Rejouer / Menu. Nouveau `seed` et `plan` tirés au hasard, couloir 0 propre, chrono à 0, marche continue. Si le temps bat le record mondial : popup du message (≤ 50, `MESSAGE_MAX` comme Maze 3D).

### Chrono
Part au premier pas, ne se remet pas à zéro entre couloirs, remis à 0 à l'échec, gelé quand une modale ou le flash est ouvert. Affiché mm:ss.

### Records et Firebase
- Local : `endless_hall` (ms, plus petit = meilleur) ; cache du dernier record mondial : `endless_hall_world`.
- Mondial : flux de Tap to Fly (imports dynamiques de `js/firebaseWrk.js` et `js/network.js`, `checkRealConnection`, relecture puis comparaison stricte avant écriture). Nœud `leaderboards/endless_hall/time` = `{ value (ms), message, timestamp }`.
- Soumission **uniquement à la victoire**. Hors ligne : le jeu fonctionne, le dernier record connu s'affiche.
- Menu : bouton globe (SVG de Tap to Fly) → modale Records : mon meilleur temps, record mondial + message, statut de synchro. CSS de Tap to Fly aux couleurs de l'hôtel.

### Sauvegarde v3
Clé `endless-hall` :
```json
{"v":4,"pos":{"x":24,"y":14},"angle":0,"step":0,"seed":123456789,"plan":[null,"lamp-off",null,"two-bins",null,null,"silhouette",null],"dir":1,"chrono":{"started":false,"ms":0}}
```
`v` ≠ 4 → ignorée. `pos` en tuiles de la fenêtre (segment centre), bornée ; `angle` dans ]-π, π] ; `step` 0..7 ; `plan` 8 entrées, `plan[0]` = `null` ; `dir` = 1 (est) ou −1 (ouest) = sens de l'avant. Écrite à chaque franchissement, à chaque mouvement, à Quitter et à `pagehide`.

### Poids
≈ 75 Ko non compressés (HTML, CSS, JS), ≈ 21 Ko en gzip. Aucune ressource externe hors AdSense / Analytics / `../../js/countPlayedTime.js` et, au besoin, les modules du site `firebaseWrk.js` / `network.js`.

### Coupé
Pas d'image, de fondu ni de téléport ; pas de classement top-10 ni de saisie de nom ; le flash de victoire est le seul effet plein écran.

## Tests manuels
1. **Pancarte 3 avant la ligne (couloir 2)** : au couloir 2 (plaque « 2 »), marcher vers la ligne jaune et regarder à gauche : la plaque du segment d'après affiche 3. Franchir : elle reste 3. Même contrôle derrière, en revenant vers le seuil d'entrée.
2. **Demi-tour sans saut de caméra** : revenir au seuil d'entrée sans se retourner, le franchir. La vue ne saute pas, l'angle ne tourne pas de 180°, le couloir continue et ressemble à un début de couloir (plaque près de toi, portes dans l'ordre normal) ; la nouvelle ligne jaune est au bout du nouveau segment.
3. **Échec = même hôtel, chrono 0, anomalies nouvelles** : se tromper. Pas de fondu ni de téléport ; plaque 0, chrono 00:00 puis repart au pas suivant, décor identique au couloir raté (anomalie retirée), anomalies suivantes différentes.
4. **8/8 = record + message** : 8 bons choix → flash blanc, modale « Sortie ! », « Nouveau record ! » si meilleur temps local. En ligne avec un temps meilleur que le mondial : popup (≤ 50 caractères), Sauvegarder, « 🌍 Record mondial ! » ; menu > 🌍 affiche temps et message. Rejouer : nouvel hôtel, couloir 0 propre.
5. **Refresh au milieu d'un couloir** : recharger en pleine marche, dans les deux sens. Même position, angle, étape, anomalies, sens de l'avant, chrono repris (« Continuer »).

## V4 — rendu et relief (fonctionnalités inchangées)
- Résolution interne ≈ 180 000 px (110 000 tactile), adaptative : −20 % si la frame dépasse ~30 ms (plancher 70 000). Canvas mis à l'échelle avec lissage.
- Textures procédurales en 2× (`SC` dans `textures.js`) ; textures murales mises en cache par clé (plus de reconstruction à chaque franchissement). Floor/plafond/murs échantillonnent `tex.w/h`.
- Relief : biseaux et ombres peints (cadres, panneaux creusés, plaques, affiche sous verre), occlusion ambiante au bas/haut des murs, vignette CSS.
- Vrais volumes (sprites devant le mur, test de profondeur) : extincteur (cylindre ombré) et poignées de porte. `extinguisher-missing` retire le sprite : support vide visible. Sprites à bords lissés (alpha).

## V5 — relief et netteté (fonctionnalités inchangées)
- Murs échantillonnés en bilinéaire (plus de gros pixels de près) ; résolution interne ≈ 260 000 px (150 000 tactile), plancher adaptatif 100 000.
- Poignées : vrais sprites à levier collés au battant (écart 4 cm), rosace côté serrure, levier dirigé vers le centre de la porte, miroir selon le côté d'où on regarde, raccourci en perspective, biais de profondeur contre le clipping rasant. Poignée et plaque peinte retirées de la texture (ombre portée seule).
- Portes : chambranle en saillie, embrasure creusée (ombres haut/gauche), panneaux enfoncés. Extincteur redessiné (col, tuyau, manomètre, étiquette) à 4× ; sprites poignée/extincteur/poubelle en 4×.
- Ombres de contact au sol sous poubelles et extincteur (`HALL.decals`).

## V5.1
- Sortie au bout du couloir 8 (et non à l'arrivée dedans) : `STEPS` = 9 (couloirs 0 à 8), couloir 8 toujours normal, la ligne jaune de son bout déclenche flash + modale ; derrière = échec. Plaques voisines du couloir 8 : « S ». Sauvegarde v4.
