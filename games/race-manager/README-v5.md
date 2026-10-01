# V5 — classements et contrats

## Fait
- Onglet **Classements** : tableaux pilotes et constructeurs, écarts, victoires/podiums et couleurs d’écurie.
- Onglet **Pilotes** : contrats, salaire annuel et fin de contrat.
- Contrats persistés dans chaque pilote, avec durée déterministe et contrat `null` pour un pilote libre.
- Migration des sauvegardes V5 vers le schéma 6.

## Fichiers modifiés / ajoutés
- `home.html`
- `home.js`
- `js/core/constants.js`
- `js/core/game-state.js`
- `js/core/validation.js`
- `js/core/contracts.js`

## Structure
`contract = { teamId, salary, signingCost, startSeason, endSeason, loyalty }` ou `null` si libre.
Les standings réutilisent `save.standings`; victoires et podiums sont dérivés des résultats de course enregistrés.

## À faire
- Étape 3 : marché et transferts.
- Étape 4 : fin de saison et renouvellements.

## Vérifications utilisateur
- Ouvrir une ancienne sauvegarde et vérifier sa migration puis son enregistrement.
- Disputer une course et vérifier les points, l’écurie attribuée et les écarts.
- Vérifier l’affichage mobile des deux tableaux.

## Hypothèses
- Le moteur stocke déjà `teamId` dans les résultats de course et met à jour les standings; aucune logique de simulation n’a été modifiée.
- Les pilotes sans équipe de sauvegarde sont considérés libres (`contract: null`).
