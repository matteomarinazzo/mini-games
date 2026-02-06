import { incrementFirebaseStat } from "../about/about.js"
console.log("compte des minutes en cours")
// On envoie le temps cumulé toutes les minutes
setInterval(async () => {
  
    try {
        // La fonction /add permet d'ajouter un nombre spécifique au compteur
        await incrementFirebaseStat("totalMinutesPlayed")
        console.log("minutes + 1")
    } catch (e) {
        console.error("Erreur mise à jour temps global " + e);
    }
}, 60000); 