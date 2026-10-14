/**
 * Page Mystère — sujets grand public (titres Wikipédia FR).
 * Seuls ces titres sont tirés : animaux familiers, aliments, objets du quotidien,
 * couleurs, sports, lieux célèbres, nature, métiers, fêtes…
 * Un titre introuvable, redirigé vers un autre nom ou ambigu est simplement ignoré à l'exécution.
 */
const RAW = `
Chat|Chien|Cheval|Vache|Lapin|Poule|Canard|Mouton|Chèvre|Âne|Éléphant|Girafe|Lion|Tigre|Ours|Loup|Renard|Singe|Dauphin|Requin|Baleine|Pingouin|Perroquet|Hibou|Aigle|Papillon|Abeille|Fourmi|Araignée|Grenouille|Tortue|Serpent|Crocodile|Kangourou|Panda|Zèbre|Hérisson|Écureuil|Souris|Escargot|Coccinelle|Poisson|Oiseau|Dinosaure|Dragon|
Pomme|Banane|Fraise|Cerise|Poire|Citron|Raisin|Ananas|Tomate|Carotte|Pomme de terre|Oignon|Ail|Champignon|Pain|Fromage|Lait|Beurre|Miel|Sucre|Sel|Riz|Pizza|Hamburger|Sandwich|Crêpe|Café|Thé|Vin|Bière|Soupe|Yaourt|Salade|Gâteau|Biscuit|Bonbon|Croissant|Baguette|Chocolat|Glace|Légume|Fruit|Pâtes alimentaires|
Table|Chaise|Lit|Voiture|Vélo|Avion|Train|Bateau|Autobus|Moto|Horloge|Montre|Téléphone|Ordinateur|Télévision|Livre|Crayon|Stylo|Lunettes|Parapluie|Clé|Porte|Fenêtre|Miroir|Lampe|Bougie|Ballon|Guitare|Piano|Violon|Tambour|Chapeau|Chaussure|Pantalon|Robe|Couteau|Fourchette|Cuillère|Assiette|Verre|Bouteille|Marteau|Échelle|Cloche|Ciseaux|Balai|Valise|Brosse à dents|Appareil photo|Cerf-volant|Jouet|Poupée|
Rouge|Bleu|Vert|Jaune|Noir|Blanc|Violet|Rose|Couleur|
Football|Tennis|Basket-ball|Rugby|Natation|Cyclisme|Golf|Handball|Volley-ball|Ski|Judo|Boxe|Athlétisme|Équitation|Hockey sur glace|Badminton|Pétanque|Échecs|Gymnastique|Surf|Escalade|Danse|Sport|
Paris|France|Suisse|Londres|Rome|New York|Tour Eiffel|Musée du Louvre|Mont Blanc|Alpes|Sahara|Égypte|Grande Muraille de Chine|Statue de la Liberté|Genève|Zurich|Berne|Lac Léman|Italie|Espagne|Allemagne|Japon|Chine|Canada|Brésil|Afrique|Europe|
Soleil|Lune|Terre|Étoile|Arc-en-ciel|Pluie|Neige|Orage|Volcan|Montagne|Forêt|Désert|Île|Plage|Océan|Mer|Lac|Rivière|Cascade|Grotte|Feu|Eau|Vent|Nuage|Fleur|Arbre|Herbe|Tournesol|Chêne|Sapin|
Noël|Anniversaire|École|Hôpital|Château|Église|Pont|Maison|Ferme|Cirque|Musée|Cinéma|Musique|Dessin|Peinture|Médecin|Pompier|Famille|Dent|Main|Cœur|Sommeil|Rêve|Jeu vidéo|Robot|Pirate|Chevalier|Père Noël
`;
export const TOPICS = [...new Set(RAW.replace(/\n/g, '').split('|').map(s => s.trim()).filter(Boolean))];
