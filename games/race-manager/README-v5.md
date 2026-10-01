# Race Manager — V5, étape 3 : marché des transferts

## État de la livraison

La livraison ajoute une première version fonctionnelle de la prospection et des offres depuis l’onglet **Pilotes** :

- les deux pilotes du joueur restent visibles en haut ;
- le marché affiche les pilotes présents dans `save.drivers` (jamais les fichiers de référence) ;
- chaque ligne indique écurie/agent libre, catégorie, âge et note globale ;
- une prospection est planifiée à J+7 ; les informations confidentielles ne sont affichées qu’après cet événement ;
- une offre permet de choisir le poste, le salaire annuel et la durée ; la réponse est planifiée à J+3 ;
- la décision utilise performance relative, loyalty, écart de salaire, durée restante et un bonus important pour les pilotes non-F1 ;
- une acceptation modifie les équipes dans la sauvegarde et tente de remplacer le départ par un agent libre, puis par une cascade de débauchage ;
- les événements de prospection et de réponse sont intégrés au calendrier existant et à l’avance jour par jour.

## Fichiers livrés

À copier dans l’arborescence réelle :

- `js/home.js` — onglet Pilotes et modal d’offre. **Le fichier va dans `js/home.js`.**
- `js/core/transfers.js` — moteur prospection/offres/décision/application des transferts.
- `js/core/progression.js` — événements de transfert ajoutés à la timeline.
- `js/core/game-state.js` — création et migration du bloc `transfers`.
- `js/core/validation.js` — validation des agents libres et du bloc transfert.
- `js/core/constants.js` — copie V5 inchangée fournie avec le projet.
- `css/home.css` — ajout CSS V5 à placer en fin du fichier existant ; ne pas remplacer le CSS existant.
- `README-v5.md` — ce document.

Les fichiers `game-state.js`, `validation.js`, `progression.js` et `constants.js` sont à placer sous `js/core/`.

## Structure de données ajoutée

```js
save.transfers = {
  scouting: [{
    id, driverId, requestedOn, dueOn, completed
  }],
  offers: [{
    id, driverId, targetTeamId, slot, salary, years,
    offeredOn, dueOn, resolved, accepted, probability
  }]
};
```

Une offre ne rend les données confidentielles visibles qu’après une prospection terminée. Le salaire proposé et les années sont conservés dans l’offre. Le contrat du pilote accepté est mis à jour dans `save.drivers`.

## Hypothèses prises

- Les données de sauvegarde déjà enrichies peuvent contenir `teamId: null` pour un agent libre ; la validation l’accepte.
- La performance d’une écurie est sa note globale de départements, conformément au calcul central existant.
- La décision est déterministe pour une sauvegarde/offre donnée afin d’éviter qu’un simple rechargement change le résultat.
- Le remplacement est recherché d’abord parmi les agents libres, puis par débauchage d’un pilote à loyalty inférieure à 50 ; cette logique est locale et devra être réalignée avec la fonction `planGrid()` si la cascade runtime existante est étendue dans une prochaine révision.

## Limites connues / étape 4 à prévoir

- Le paiement différé au 1er janvier de la saison où le pilote roule effectivement n’était pas présent dans les fichiers fournis. Le contrat porte un indicateur `deferred`, mais le débit budgétaire annuel et le changement de saison restent à implémenter proprement.
- Le traitement IA de fin de saison (garder/recruter avec exactement le même algorithme, puis cascade complète) n’est pas encore branché : il doit être ajouté dans l’étape de fin de saison, sans UI.
- Étape 4 : primes, évolution des statistiques, reset du calendrier, passage de saison et paiement différé.
- Aucun travail de course, pluie, dépassements, classements ou contrats existants n’a été modifié intentionnellement.

## Checklist de validation manuelle

1. Ouvrir une partie existante et vérifier que les deux pilotes du joueur sont toujours visibles dans l’onglet Pilotes.
2. Vérifier que le marché contient bien tous les pilotes présents dans la sauvegarde.
3. Cliquer sur **Prospecter le pilote**, puis vérifier que l’interface n’affiche pas loyalty/salaire/fin de contrat avant J+7.
4. Avancer le calendrier de 7 jours et vérifier l’apparition des informations confidentielles et du bouton **Faire une offre**.
5. Envoyer une offre avec poste, salaire et durée valides ; vérifier qu’une nouvelle progression apparaît à J+3.
6. Avancer de 3 jours et vérifier que la réponse est déterministe, journalisée et que le bouton permet de reformuler après un refus.
7. Tester une acceptation sur un pilote d’une autre écurie et vérifier que son ancienne écurie conserve deux pilotes.
8. Vérifier qu’une offre en attente empêche l’envoi d’une deuxième offre identique.
9. Fermer/recharger la page puis exporter/importer la sauvegarde ; vérifier que `save.transfers` est conservé.
10. Lancer une qualification et une course après un transfert ; vérifier que les classements et le moteur de course fonctionnent toujours.
11. Tester une ancienne sauvegarde V5 sans `transfers` et vérifier sa migration automatique.
12. Avant validation finale, tester explicitement le paiement du salaire au 1er janvier et les décisions IA une fois ces éléments livrés à l’étape 4.
