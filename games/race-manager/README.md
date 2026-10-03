# Race Manager — V3 (dossier `games/race-manager/`)

Jeu de management d'écurie de sport automobile pour mini-games.ch. HTML, CSS et JavaScript vanilla (modules ES), sans framework, sans build, sans backend. Poids total : ~110 Ko de texte, aucune image.

**Périmètre V3 :** calendrier 2026, entraînements, améliorations, qualifications Q1/Q2/Q3, Lights Out, grille de départ et sauvegardes locales. Les stratégies pneus et le lancement de course arrivent en V3.1.

## Fichiers

```
games/race-manager/
├── index.html        entrée (head SEO) → redirige vers menu.html
├── menu.html / menu.js /     3 slots + assistant de création
├── home.html / home.js /     menu principal de la partie
├── game.html         redirection vers home.html (aucune fonctionnalité en V1)
├── css/base.css / menu.css / home.css / qualifying.css     styles communs (thème sombre, boutons, dialogues, jauges)
├── js/
│   ├── data/teams-2026.js, drivers-2026.js   données de référence (gelées, jamais modifiées)
│   ├── core/constants.js    règles et libellés (limites, niveaux de difficulté, palette)
│   ├── core/progression.js  moteur V2 (calendrier, entraînement, améliorations, IA)
│   ├── core/utils.js        formats, hash, clone, gel profond
│   ├── core/validation.js   notes, nom d'écurie, budget, pilotes, schéma de sauvegarde
│   ├── core/game-state.js   création de partie, règle de transition, résumé, migration
│   ├── core/storage.js      localStorage protégé, export/import JSON
│   ├── ui.js                DOM sûr (jamais d'innerHTML), dialogues <dialog>, toasts
│   ├── summary-view.js      résumé d'une sauvegarde (slot + aperçu d'import)
│   ├── import-flow.js       import JSON (validation → résumé → slot → confirmation)
│   └── menu-wizard.js       assistant de création (5 étapes)
├── tests/logic.test.mjs     tests de logique Node — NE PAS téléverser
└── README.md
```

Aucun fichier existant du dépôt n'est modifié. La seule dépendance externe est `../../js/countPlayedTime.js`, chargé en module sur chaque page.

## Architecture

- **Séparation** : `core/` = logique pure sans DOM (testable en Node) ; `storage.js` = seul accès à localStorage ; `ui.js`, `menu-wizard.js`, `menu.js`, `home.js` = rendu.
- **Données de référence vs état** : `js/data/*` est gelé (`Object.freeze` récursif). `createNewGame()` en fait des **copies** ; la sauvegarde ne référence jamais un objet de base, uniquement des identifiants stables.
- **Notes** : `driverOverall()` (moyenne des 7 stats) et `teamOverall()` (moyenne des 3 départements) sont les seules définitions du calcul. `clampRating()` / `adjustRating()` bornent à [50, 100].
- **Une clé localStorage par slot** (`miniGames.race-manager.saves.slot1..3`) : un slot corrompu ou d'une version inconnue n'affecte jamais les autres et n'est jamais réécrit sans action de l'utilisateur. Paramètres : `miniGames.race-manager.settings`.
- **Slot transmis par l'URL** (`home.html?slot=2`) : seul un entier 1–3 est lu ; les données sont relues depuis localStorage.
- **Règle de transition V1** : si le joueur recrute un pilote engagé en F1, il quitte son écurie et le premier pilote de réserve libre (catégorie `autre`, dans l'ordre de `drivers-2026.js`) prend sa place. Résultat garanti : 12 écuries × 2 pilotes = 24 pilotes uniques.
- **Départements du joueur** : base 60 / 70 / 80 selon le niveau, avec un écart +4 / 0 / −4 réparti de façon déterministe selon le nom de l'écurie.
- **Difficulté d'amélioration** : enregistrée dès maintenant, sans effet avant la V2.
- **Sauvegarde automatique** : création, import, changement de profil, retour au menu, `visibilitychange`, `pagehide` (non garanti par tous les navigateurs) et toutes les 30 s pendant que l'onglet est visible (pour le temps de jeu).

## Tester en local

Les modules ES ne fonctionnent pas depuis `file://`. Depuis la racine du site :

```
python3 -m http.server 8000
# puis http://localhost:8000/games/race-manager/
```

Tests de logique (Node 22.12+), depuis `games/race-manager/` : `node tests/logic.test.mjs`.

## Transférer sur Infomaniak

1. Envoyer le dossier `games/race-manager/` (SFTP/FTP ou Gestionnaire de fichiers) au même emplacement sur le site, **sans** le dossier `tests/`.
2. Vérifier que `https://mini-games.ch/js/countPlayedTime.js` existe (chemin relatif `../../js/`).
3. Ajouter l'image `assets/logos/race-manager.webp` référencée par `index.html` (Open Graph), ou modifier cette balise.

## Format de sauvegarde (schemaVersion 4)

```json
{
  "schemaVersion": 1, "gameId": "race-manager", "referenceVersion": "2026-draft-1",
  "saveId": "save-…", "slotId": 1,
  "createdAt": "ISO", "lastPlayedAt": "ISO", "playTimeSeconds": 0,
  "season": 2026, "gameDate": "2026-01-01", "currentPhase": "home",
  "playerTeamId": "player-team",
  "difficulty": { "startingDepartmentLevel": "low|medium|high", "upgradeDifficulty": "easy|normal|hard" },
  "teams": [ { "id", "name", "color": "#rrggbb", "isPlayer": false, "balance": 20,
               "departmentRatings": { "aero": 92, "chassis": 90, "power": 95 } } ],
  "drivers": [ { "id", "name", "abbr", "nationality", "category", "age", "teamId",
                 "stats": { "start", "aggression", "overtaking", "attack", "raceManagement", "qualifying", "tyres" },
                 "potential", "experience", "available",
                 "contract": { "salary", "signingCost", "startSeason", "endSeason" } } ],
  "calendar": { "currentRound": 0, "completedRounds": [], "trainingCompletedEvents": [] },
  "activities": { "upgrades": [], "trainingHistory": [] },
  "weekends": {},
  "eventLog": [],
  "standings": { "drivers": [], "teams": [] }
}
```

- Montants (`balance`, `salary`, `signingCost`) en **millions**.
- Les notes globales ne sont **pas** stockées : elles sont calculées.
- `validateSave()` exige : 12 écuries, 24 pilotes, identifiants uniques, exactement 2 pilotes par écurie, notes entre 50 et 100, couleurs `#rrggbb`, difficultés connues, activités et week-ends V3. Version inconnue (> 4) → refus explicite. Les sauvegardes V1, V2 et V3 sont migrées en lecture, sans toucher aux autres slots.

## Limites connues

- **localStorage** : propre à un navigateur et à un domaine ; effacé si l'utilisateur vide les données du site ; indisponible ou volatil en navigation privée ; ~5 Mo par domaine (une partie fait ~15 Ko). Deux onglets ouverts sur le même slot : le dernier à écrire gagne.
- **Export JSON** : simple téléchargement côté navigateur (un site statique ne peut rien écrire sur le serveur). Le fichier est modifiable à la main : l'import valide la structure, pas l'honnêteté des valeurs.
- **Données de référence** : voir l'avertissement en tête de `teams-2026.js` et `drivers-2026.js`. La grille 2026 vient de mes connaissances de fin juin 2026 et doit être **vérifiée** ; âges approximatifs ; statistiques, potentiels, prix, salaires, budgets et notes de départements sont des **estimations de jeu** ; les pilotes `fictional: true` (F2, F3, réserve) sont inventés. Aucun logo ni élément officiel.
- Les noms d'écurie refusés incluent tout nom qui *contient* un nom réservé (ex. « Audio » est refusé car il contient « Audi »).
- Le `viewport` de l'exemple fourni contenait `user-scalable=no` ; je ne l'ai pas repris (il empêche le zoom, ce qui nuit à l'accessibilité).
- Je n'ai pas pu inspecter le dépôt réel : les chemins relatifs supposent l'emplacement `games/race-manager/` et le fichier `js/countPlayedTime.js` à la racine, comme dans vos exemples.

## Tests (20 cas demandés)

Vérifiés automatiquement (logique Node + parcours complet dans un DOM simulé) : 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 (parsing et nom de fichier ; le téléchargement réel n'est pas testable sans navigateur), 16, 20 ; 1 (3 slots vides) et 17 (relecture du slot depuis le stockage).

**À faire dans un vrai navigateur** : 1 et 17 (rechargement F5), 15 (téléchargement + réimport d'un vrai fichier), 18 (petit écran, ex. 360 px), 19 (clavier : Tab, Espace, Échap dans les dialogues, focus visible, filtres), et un contrôle visuel général.

## Réservé aux versions suivantes (non implémenté)

- **V2** : calendrier, avancement du temps, événements, entraînement, progression des notes, améliorations des départements et leurs coûts (la difficulté d'amélioration s'appliquera ici).
- **V3** : qualifications, mini-jeu de réaction, stratégie, chronos, grille de départ, lancement d'une course simple.
- **V4** : course en direct, pneus, stratégies, dépassements, incidents, classement temps réel, gains.
- **V5** : transferts et contrats de fin de saison, négociations, disponibilité, redistribution sans doublon, évolution saisonnière, éventuelle synchronisation avec l'intégration Firebase existante (après inspection et accord).
- Onglets « Classements » et « Pilotes / mercato » : volontairement affichés comme « disponible dans une prochaine version ».
