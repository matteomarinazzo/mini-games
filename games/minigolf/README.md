# Minigolf 3D

Mini-golf 3D en HTML/CSS/JS vanilla, WebGL1 maison. Aucune librairie, aucun CDN, aucun fichier image/police/audio, pas de build, pas de `type="module"` dans nos scripts (scripts classiques accrochés à `window.Minigolf`). Déposer le dossier (ou le zip décompressé) sur un hébergement statique : ça marche. Les balises AdSense, Analytics et temps de jeu des pages sont reprises telles quelles de l’exemple (le script de temps de jeu garde son `type="module"` et son chemin `../../js/countPlayedTime.js`).

## Arborescence et rôles

| Fichier | Rôle | Poids |
|---|---|---|
| `index.html` | Menu (mode, map, règles, config de room) | ~2.8 Ko |
| `game.html` | Page de partie (canvas 16:9, HUD, modales) | ~2.5 Ko |
| `css/menu.css` | Style du menu (feutre, bois) | ~2.3 Ko |
| `css/game.css` | Style du jeu (cadre 16:9, HUD, jauge) | ~2.4 Ko |
| `js/menu.js` | Logique du menu, écrit la config | ~3.1 Ko |
| `js/game.js` | Orchestration : trous, entrées, HUD, pause, fin | ~7.6 Ko |
| `js/net.js` | Config de room, codes ; pas de SDK, pas de synchro | ~1.3 Ko |
| `js/core/physics.js` | Sphère, sol, murs, rampes, coupe, hors-limites ; monde à N balles | ~8.1 Ko |
| `js/core/render.js` | WebGL1, caméra, shaders, dessin | ~9.6 Ko |
| `js/core/maps.js` | Données des maps et des 9 trous | ~2.0 Ko |
| `js/core/ai.js` | Minigolf.ai.planShot (non appelé) | ~1.0 Ko |
| `js/core/career.js` | Meilleur total, partie en cours, déblocage (localStorage minigolf/) | ~1.4 Ko |
| `README.md` | Ce fichier | ~5 Ko |

Total ≈ 49 Ko (cible < 180 Ko). `core/ai.js` existe mais `game.html` ne le charge pas.

## Jouable

Solo sur « Le jardin » : 9 trous, une balle, par 3, objectif 27 coups ou moins. Jauge, visée, rampes, vide, coupe physique (pas de snap), hors-limites, pénalités, limite de 8 coups, pause, livret, reprise après rafraîchissement, meilleur total.

## Non jouable dans cette version

- Firebase : aucun fichier ne l’utilise.
- Synchro des balles / multijoueur : le menu ouvre la config de room, « Bientôt » est inactif.
- IA branchée : `planShot` n’est appelé par personne.
- Map 2 : visible, verrouillée, sans trous.

## Format d’un trou (`js/core/maps.js`)

```
{ name, start:[x,z], cup:[x,z], yaw?, poly:[[x,z],…], walls:[[x,z,w,d,h],…],
  ramps:[[x,z,w,d,y0,y1,axe],…], voids:[[x,z,w,d],…] }
```
- `poly` : polygone du terrain, arêtes parallèles aux axes. Des bordures de bois sont générées automatiquement sur chaque arête.
- Boîtes (`walls`, `ramps`, `voids`) : centre (x, z), largeur `w` (selon x), profondeur `d` (selon z).
- `ramps` : `y0` est la hauteur du côté minimal de l’`axe` (`'x'` ou `'z'`), `y1` du côté maximal. `y0 = y1` donne un palier ; une rampe sur toute la largeur et inclinée sur l’autre axe donne le sol penché du trou 8.
- `voids` : pas de sol ; y tomber coûte une pénalité (replacement à la position du coup).
- `yaw` (optionnel, rad) : visée initiale ; par défaut vers la coupe.
- Coordonnées en multiples de 0,05 m (le feutre est découpé sur cette grille). Couloir jamais sous 0,9 m.

## Tuner la rampe du trou 4

Dans `maps.js`, trou « Le vide » :
`ramps: [[0, 2.7, 2.4, 1.6, 0, .3, 'z']]` et `voids: [[0, 4.2, 2.4, 1.4]]`.
- Plus facile : augmente `y1` (.3 → .35) ou réduis la largeur du vide (`1.4`).
- Plus dur : l’inverse, ou éloigne la rampe du départ (augmente son z).
- Le départ est en z = 1 : plus la rampe est loin, plus la balle arrive lentement.
- Réglage actuel : le vide est franchi à partir d’environ 60 % de jauge (vitesse max `SHOT_VMAX` = 10,5 m/s dans `physics.js`).

## Carrière

Seuil = 3 × nombre de trous de cette map (27). Le total n’est enregistré que si les 9 trous sont finis ; on garde le plus bas (28 puis 26 → 26 ; 26 puis 30 → 26). Aucun mélange des meilleurs trous. Clés localStorage : `minigolf/best/<mapId>`, `minigolf/run/<mapId>`. Config de page : sessionStorage `minigolf/config`.

## Multijoueur prévu (non codé)

Tour par tour, une seule balle simulée à la fois ; les balles des autres joueurs sont des sphères-obstacles visibles que l’on peut percuter ; l’hôte envoie l’état final des balles qui ont bougé. Même principe de room que l’exemple (code de room, hôte, invités). `net.js` ne contient que la config : `mode`, `mapId`, `roomCode`, `maxPlayers` (2 à 4), `fillWithAI`.

## IA prévue (non branchée)

Une seule IA : elle vise la coupe, avec un pourcentage d’erreur aléatoire sur l’angle et la puissance. Pas de second niveau. `Minigolf.ai.planShot(ball, hole, error)` renvoie `{ yaw, power }`.
