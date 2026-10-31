import { FR, EN, DE } from './words.js';
export const LANGS = ['FR', 'DE', 'EN'];
const SRC = { FR, EN, DE };
const cache = {};
const ACC = 'fenetre:fenêtre|riviere:rivière|foret:forêt|etoile:étoile|annee:année|marche:marché|vallee:vallée|desert:désert|ocean:océan|etang:étang|epine:épine|etable:étable|eglise:église|chateau:château|cheminee:cheminée|cloture:clôture|chevre:chèvre|lievre:lièvre|ecureuil:écureuil|herisson:hérisson|mesange:mésange|lezard:lézard|guepe:guêpe|araignee:araignée|elephant:éléphant|zebre:zèbre|panthere:panthère|leopard:léopard|creme:crème|pates:pâtes|legume:légume|peche:pêche|gateau:gâteau|cafe:café|biere:bière|dejeuner:déjeuner|diner:dîner|gouter:goûter|cuillere:cuillère|poele:poêle|pere:père|mere:mère|frere:frère|bebe:bébé|garcon:garçon|pecheur:pêcheur|medecin:médecin|maitre:maître|eleve:élève|etudiant:étudiant|ecrivain:écrivain|poete:poète|tete:tête|levre:lèvre|epaule:épaule|canape:canapé|etagere:étagère|television:télévision|telephone:téléphone|ecran:écran|rateau:râteau|chaine:chaîne|boite:boîte|regle:règle|echarpe:écharpe|dore:doré|fonce:foncé|pale:pâle|etroit:étroit|leger:léger|tiede:tiède|fache:fâché|fatigue:fatigué|mechant:méchant|honnete:honnête|sincere:sincère|reel:réel|etrange:étrange|etre:être|repondre:répondre|connaitre:connaître|ecrire:écrire|rever:rêver|eviter:éviter|reussir:réussir|echouer:échouer|couter:coûter|echanger:échanger|etudier:étudier|preparer:préparer|detruire:détruire|reparer:réparer|melanger:mélanger|ecouter:écouter|esperer:espérer|decider:décider|defendre:défendre|proteger:protéger|guerir:guérir|naitre:naître|amitie:amitié|colere:colère|fete:fête|mystere:mystère|probleme:problème|reponse:réponse|resultat:résultat|metier:métier|ecole:école|lecon:leçon|diplome:diplôme|ecriture:écriture|zero:zéro|moitie:moitié|equipe:équipe|societe:société|etat:état|liberte:liberté|armee:armée|defaite:défaite|tempete:tempête|seisme:séisme|secheresse:sécheresse|impot:impôt|depense:dépense|economie:économie|employe:employé|metro:métro|velo:vélo|fusee:fusée|aeroport:aéroport|medaille:médaille|energie:énergie|electricite:électricité|lumiere:lumière|fumee:fumée|metal:métal|beton:béton|etage:étage|hopital:hôpital|bibliotheque:bibliothèque|musee:musée|theatre:théâtre|cinema:cinéma|hotel:hôtel|fevrier:février|aout:août|decembre:décembre|amerique:amérique|carre:carré|cote:côté|legende:légende|recit:récit|poeme:poème|crepuscule:crépuscule|eclat:éclat|etincelle:étincelle|eclair:éclair|rosee:rosée|gelee:gelée|grele:grêle|paquerette:pâquerette|orchidee:orchidée|primevere:primevère|chene:chêne|hetre:hêtre';
const accMap = Object.fromEntries(ACC.split('|').map(s => s.split(':')));
export function initialLang() {
    let l = '';
    try { l = (localStorage.getItem('lang') || '').toUpperCase(); } catch { }
    return LANGS.includes(l) ? l : 'FR';
}
export const wordsOf = l => cache[l] ||= SRC[l].split('|');
export function pick(l, not) {
    const w = wordsOf(l);
    let x;
    do x = w[Math.floor(Math.random() * w.length)]; while (x === not && w.length > 1);
    return x;
}
export const show = (w, l) => (l === 'FR' && accMap[w]) || w;
