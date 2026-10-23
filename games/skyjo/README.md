# Skyjo — V3 (Solo & Multijoueur, Mode Classique & Crazy)

Jeu pour mini-games.ch. Vanilla HTML/CSS/JS (modules ES), français uniquement, aucune image bitmap externe (100% SVG pur), aucune librairie lourde, Firebase chargé à la demande en multijoueur uniquement.

Dossier : `games/skyjo/`.  
Clés de stockage local (`localStorage`) :
- `skyjo` : état de la partie solo en cours
- `skyjo_n` : dernier nombre de joueurs solo sélectionné (2 à 8)
- `skyjo_mode` : mode solo choisi (`classic` ou `crazy`)
- `skyjo_room` : code de room active en multijoueur
- `mg_player_name` : pseudo partagé de la plateforme

---

## 1. Ce qui est fait (État complet V3)

### Refonte Visuelle & Ambiance
- **Palette éclatante & table lumineuse** : aucun thème sombre ni fond de nuit/espace. Table claire et colorée offrant un confort visuel maximal.
- **Cartes aux proportions réalistes** (ratio 60×84), ombres courtes, bordures soignées et typographie lisible de loin.
- **Dos original** : motif géométrique céleste en losange et étoiles, coloré et identifiable face cachée, sans logo Magilano.
- **Faces SVG conformes au code couleur officiel** :
  - `−2` : violet sombre (`#3b0764`)
  - `−1` : violet vif (`#7c3aed`)
  - `0` : bleu ciel (`#38bdf8`)
  - `1 à 4` : vert (`#16a34a`)
  - `5 à 8` : jaune (`#eab308`)
  - `9 à 12` : rouge (`#dc2626`)
- **Grilles optimisées** :
  - Grille du joueur : grande, centrale, boutons tactiles confortables sur mobile.
  - Grilles adverses (jusqu'à 7, 8 joueurs au total) : compactes, sans encombrement, lisibles sur smartphone.
- **HUD épuré à l'extrême** :
  - Boutons Règles et Pause avec les pictogrammes SVG standards (issus de la plateforme).
  - Centre : nom de celui qui joue uniquement (« À vous » ou nom de l'adversaire).
  - Chrono anneau 30 s circulaire avec décompte numérique seul, sans phrase.
  - Scores : nombres seuls (score manche en cours et total cumulé hors manche entre parenthèses). Pas de journal de texte, pas de phrases d'historique.
- **Animations courtes & accessibilité** : retournement 3D (250 ms), lévitation de carte (180 ms), disparition de colonne (250 ms). Coupées immédiatement par `@media (prefers-reduced-motion: reduce)`.

### Geste de Jeu Fluide & Direct
- **Aucun emplacement « En main »** : la table est libérée de tout slot artificiel.
- **Lévitation sur la pile** : cliquer sur la pioche ou la défausse lève la carte du dessus, face visible, directement au-dessus de sa pile.
- **Règles d'action** :
  - *Carte levée depuis la pioche* : peut être posée sur n'importe quel emplacement de sa propre grille (échange), ou posée sur la défausse (suivie du retournement obligatoire d'une carte cachée). Impossible de la reposer sur la pioche.
  - *Carte levée depuis la défausse* : seule cible légale = un emplacement de sa propre grille (échange obligatoire). Impossible de la reposer sur la défausse.
- **Liseré interactif** : seules les cibles légales s'entourent d'un liseré lumineux vert avec pulsation. Les cibles illégales ne réagissent pas (aucun message d'erreur textuel).
- **Expiration du chrono (0 s)** : l'IA termine l'action déjà engagée sans réinitialiser le tour ni annuler la carte levée.

### Mode Crazy
- **Activation** : case unique [Classique | Crazy] au menu solo et à la création de room. Tout ou rien.
- **Paquet de 180 cartes** : 150 cartes classiques + 30 cartes jokers (3 types × 10 exemplaires).
- **Caractéristiques des jokers** :
  - Valeur de base `0` (le 0 reste gros et lisible).
  - **Aucun mot écrit sur les cartes** : distinction visuelle par le dessin SVG et un cadre spécifique :
    - *Caméléon* : masque et chapeau de bouffon à grelots, cadre losanges.
    - *Colonne* : 3 silhouettes de cartes empilées avec flèche et œil de révélation, cadre à colonnes.
    - *Cible* : mire et réticules de visée sur silhouette de carte, coins de visée.
- **Effets des jokers** :
  - Déclenchés uniquement sur sa propre grille, uniquement si le joueur pose ce joker ou le retourne pendant son tour.
  - Les 2 cartes révélées au tout début de manche ne déclenchent aucun effet.
  - Un joker révélé par un effet ne relance aucun effet en chaîne.
  - *Caméléon* :
    - Si les 2 autres cartes de sa colonne sont visibles et identiques (valeur V), il prend la valeur V et la colonne est retirée.
    - Deux caméléons visibles + un numéro X visible : les deux prennent X, la colonne part.
    - Trois jokers visibles (identiques ou mélangés) : 0+0+0, la colonne part.
    - Sinon, il reste à 0.
  - *Colonne* : révèle immédiatement les autres cartes de sa colonne, puis résout les éventuels retraits de colonne.
  - *Cible* : oblige le joueur à retourner une autre de ses cartes cachées (liseré sur les cartes légales). S'il n'en reste qu'une, elle est révélée et ferme la manche.

---

## 2. Carte des Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page d'accueil : onglets Solo / Multi, sélecteur Classique/Crazy, salle d'attente |
| `css/menu.css` | Styles du menu : design lumineux, badges de mode, boutons soignés |
| `js/menu.js` | Contrôleur du menu : persistance du mode solo, création et jonction Firebase |
| `game.html` | Table de jeu, HUD minimaliste, livret de règles complet, modal de pause |
| `css/game.css` | Table lumineuse, cartes 60×84, liseré légal, lévitation de pile, responsive |
| `js/game.js` | Boucle de jeu (solo & multi), gestuelle directe, chrono anneau, overlays |
| `js/cards.js` | Générateur SVG pur des 15 valeurs, du dos céleste et des 3 jokers Crazy |
| `js/net.js` | Connecteur Firebase partagé (authentification anonyme, présence, journal) |
| `js/core/rng.js` | Générateur pseudo-aléatoire seedé (mulberry32) et mélange Fisher-Yates |
| `js/core/rules.js` | Moteur pur de règles : distribution, résolutions, colonnes, Crazy, fin de manche |
| `js/core/ai.js` | IA déterministe avec profils et prise en compte tactique des effets Crazy |

---

## 3. Schéma Firebase & Synchronisation (`rooms/skyjo_<CODE>`)

```json
{
  "code": "G9H3C8",
  "state": "waiting | playing",
  "mode": "classic | crazy",
  "rules": { "crazy": false },
  "leaderId": "<uid>",
  "maxPlayers": 8,
  "numPlayers": 8,
  "createdAt": 1729700000000,
  "players": {
    "<uid>": {
      "name": "Pseudo",
      "score": 0,
      "uid": "<uid>",
      "joined": 1729700000000,
      "lastSeen": 1729700010000,
      "away": false
    }
  },
  "log": {
    "0": { "s": -1, "a": { "type": "start", "seed": 34810928, "seats": ["uid1", "uid2"], "mode": "crazy" }, "t": 1729700000000 },
    "1": { "s": 0, "a": { "type": "flip", "idx": 3 }, "t": 1729700002000 },
    "2": { "s": 0, "a": { "type": "draw" }, "t": 1729700005000 },
    "3": { "s": 0, "a": { "type": "swap", "idx": 7 }, "t": 1729700008000 }
  }
}
```

- **Journal déterministe** : le nœud `log` est la vérité absolue. Aucun client ne tire de carte localement. Tout découle de la `seed` via `rules.js`.
- **Validation Firebase** : l'objet joueur comprend obligatoirement `score: 0` dès son inscription pour satisfaire les règles `.validate: newData.hasChildren(['name', 'score'])`.
- **Présence & Reconnexion** :
  - Heartbeat toutes les 10 secondes. Un joueur sans battement pendant > 35 s ou marqué `away: true` est suppléé par l'IA.
  - Le joueur qui revient (`rejoin`) retrouve son siège instantanément, l'IA cesse de jouer à sa place.
  - La room est supprimée si et seulement si tous les joueurs humains ont quitté.
- **Revanche** : rejouer dans la même room conserve le mode initial (`classic` ou `crazy`).

---

## 4. Règles du Jeu & Cas Limites

1. **Colonnes retirées** :
   - 3 cartes de même valeur dans une colonne verticale (indices `c`, `c+4`, `c+8`) sont résolues : **la carte du haut de la colonne va sur la pile de défausse**, tandis que les deux autres cartes sont retirées définitivement du jeu. Le joueur suivant peut ainsi décider de prendre cette carte de défausse ou de piocher.
   - En mode Crazy : 3 jokers visibles quelconques s'annulent en 0+0+0 ; 2 caméléons + 1 carte X prennent la valeur X et partent ; 1 caméléon + 2 cartes identiques V prennent la valeur V et partent.
   - Les colonnes sont également résolues à la fin de manche quand toutes les cartes sont découvertes.
   - Au tout début de manche (phase de révélation des deux premières cartes), si une carte spéciale Crazy est retournée, son effet s'applique immédiatement (la Colonne révèle sa colonne, le Caméléon teste le retrait, la Cible exige un retournement supplémentaire).
2. **Épuisement de la pioche** :
   - Quand la pioche est vide, la défausse est remélangée à l'aide du RNG seedé, à l'exception de sa carte supérieure qui reste en place.
3. **Fermeture & Dernier Tour** :
   - Dès qu'un joueur a révélé toutes ses cartes restantes, les autres disposent d'un unique tour additionnel.
   - Si un autre joueur termine de révéler ses cartes durant ce dernier tour, cela ne déclenche pas de nouveau tour.
4. **Doublement du score du fermeur** :
   - Le fermeur double son score brut de la manche si son score est positif (> 0) **ET** qu'il n'est pas strictement le seul à avoir le score le plus bas (égalité avec un autre joueur = score doublé).
   - Si son score est ≤ 0, il ne double jamais.
5. **Seuil 100 points & Victoire** :
   - La manche où un joueur atteint 100 points cumulés ou plus est jouée jusqu'à son terme.
   - Le joueur avec le plus petit cumul de points remporte la partie. En cas d'égalité, victoire partagée.

---

## 5. Intelligence Artificielle

- **Pure & Seedée** : ne triche jamais, ne lit aucune carte cachée adverse, n'utilise que `viewFor`.
- **Profils variés** : générés par `mulberry32(seed ^ 0x9E3779B9)`.
- **Crazy-Aware** :
  - Reconnaît la valeur d'un caméléon pour finaliser une colonne de deux cartes identiques ou de deux jokers.
  - Évalue le gain de révélation de la colonne ou de la carte ciblée.
  - Ne défausse pas un joker sauf situation extrême.
- **Remplacement transparent** : l'IA prenant le relais d'un joueur déconnecté utilise le profil équilibré `DEFAULT` et applique les mêmes règles strictes.

---

## 6. Ne pas casser

1. **Pureté du moteur `core/rules.js`** : aucun accès au DOM, aucun `Math.random` direct, aucun import Firebase. Tout passe par `apply(s, a)` et `legalActions(s)`.
2. **Déterminisme du RNG** : `rng.js` (mulberry32) garantit que seed + actions = même partie sur tous les terminaux.
3. **Contrat de vue masquée `viewFor`** : les cartes adverses cachées ne doivent jamais être transmises.
4. **Validation Firebase `score: 0`** : `newPlayer` dans `menu.js` doit impérativement inclure le champ `score: 0`.
5. **Autonomie du Solo** : fonctionne hors ligne sans requêtes réseau et n'altère jamais les données multijoueur.
6. **Gestuelle directe** : pas de zone « en main », carte levée sur sa pile, liseré pour les cibles légales.
7. **Boutons Pause / Règles** : conserver les SVG conformes à la plateforme et la modal pause limitée à Reprendre / Quitter.

---

## 7. Plan de Test Manuel

### A. Solo Classique
1. Ouvrir `index.html`, choisir 2 joueurs, mode **Classique**, cliquer sur « Jouer ».
2. Vérifier que la table est lumineuse et colorée (aucun thème sombre).
3. Révéler 2 cartes. Vérifier le liseré vert sur les cartes cachées.
4. À votre tour : cliquer sur la pioche. La carte doit se lever face visible au-dessus de la pioche.
5. Cliquer sur un emplacement de votre grille : l'échange s'effectue et le tour passe à l'IA.

### B. Solo Crazy
1. Au menu solo, sélectionner **Crazy**, 3 joueurs, puis « Jouer ».
2. Vérifier dans la console : `__skyjo.S.mode === 'crazy'` et `__skyjo.S.deck.length === 143` (180 cartes initiales - 36 distribuées - 1 défausse).
3. Tester un Caméléon : utiliser `__skyjo.grid(0, [{v:8,up:true}, {v:8,up:true}, {v:0,up:true,joker:'chameleon'}, null, null, null, null, null, null, null, null, null])`. Vérifier que la colonne de 8 disparaît.

### C. Multijoueur & Revanche
1. Ouvrir deux onglets de navigation sur `index.html` (onglet A et B).
2. Dans l'onglet A : entrer un pseudo, mode Crazy, cliquer « Créer une room ». Vérifier l'étiquette « Mode Crazy » en salle d'attente.
3. Dans l'onglet B : entrer un pseudo, saisir le code de la room, cliquer « Rejoindre ».
4. Lancer la partie depuis l'onglet A. Jouer un tour dans chaque onglet et constater la synchronisation immédiate.
5. Cliquer « Pause » : vérifier qu'il n'y a que « Reprendre » et « Quitter ».
6. À la fin de la partie : cliquer « Rejouer », vérifier que le mode Crazy est conservé pour la manche suivante.
