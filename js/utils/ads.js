/**
 * Gestion des publicités (Social Bar et Smart Link)
 * Évite les popups intrusives et gère la répétition.
 */

const SOCIAL_BAR_SCRIPT = "https://pl29320862.profitablecpmratenetwork.com/89/6a/dd/896add25a788dcbea38a6fc5dbb07a44.js";
const SMART_LINK_URL = "https://www.profitablecpmratenetwork.com/iq3k316euf?key=f29b63614f169507fbc2690ce341228d";

/**
 * Initialise la Social Bar avec un contrôle de fréquence (max 1 fois par minute)
 */
let isAuthorized = false;

/**
 * Initialise la Social Bar avec un contrôle de fréquence (max 1 fois par minute)
 * Si la pub tente de réapparaître trop vite, elle est supprimée.
 */
export function initAds() {
    const lastShow = sessionStorage.getItem('mg_socialbar_last');
    const now = Date.now();
    const canShow = !lastShow || (now - parseInt(lastShow)) >= 60000;
    /*
        if (canShow) {
            isAuthorized = true;
    
            // Injection du script
            const script = document.createElement('script');
            script.src = SOCIAL_BAR_SCRIPT;
            script.id = 'mg-socialbar-script';
            document.body.appendChild(script);
    
            sessionStorage.setItem('mg_socialbar_last', now.toString());
    
            // On laisse la pub s'afficher pendant 20 secondes, puis on la "tue"
            setTimeout(() => {
                isAuthorized = false;
                const s = document.getElementById('mg-socialbar-script');
                if (s) s.remove();
                killAdElements();
            }, 20000);
        } else {
            isAuthorized = false;
            killAdElements();
        }
    
        // Lancer la surveillance des injections sauvages
        startAdPolicer();
        */
}

/**
 * Supprime les éléments suspects injectés par les régies publicitaires
 */
function killAdElements() {
    // On cible les div/iframe injectés directement dans body avec un z-index élevé
    const elements = document.body.children;
    for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];

        // Ignorer les éléments légitimes de l'application
        if (['profilePanel', 'adPopup', 'status-container', 'root'].includes(el.id)) continue;
        if (el.tagName === 'SCRIPT' || el.tagName === 'HEADER' || el.classList.contains('container')) continue;

        try {
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' && parseInt(style.zIndex) > 1000) {
                el.remove();
            }
        } catch (e) { /* ignore elements that can't be computed */ }
    }
}

/**
 * Empêche toute réinjection automatique si on n'est pas dans la période autorisée
 */
function startAdPolicer() {
    if (window.adPolicerStarted) return;
    window.adPolicerStarted = true;

    const observer = new MutationObserver(() => {
        if (!isAuthorized) {
            killAdElements();
        }
    });
    observer.observe(document.body, { childList: true });
}

/**
 * Gère le Smart Link tous les 10 clics sur une carte de jeu.
 * Si activé, stocke le jeu à lancer au retour.
 * @param {string} gameId 
 * @returns {boolean} true si le smart link a été ouvert (interruption du lancement)
 */
export function handleSmartLink(gameId) {
    let clickCount = parseInt(sessionStorage.getItem('mg_ad_click_count') || '0');
    clickCount++;
    sessionStorage.setItem('mg_ad_click_count', clickCount.toString());

    if (clickCount >= 10) {
        sessionStorage.setItem('mg_ad_click_count', '0');
        sessionStorage.setItem('mg_pending_game_launch', gameId);

        window.open(SMART_LINK_URL, "_blank");
        return true;
    }

    return false;
}

/**
 * Vérifie si un jeu doit être lancé automatiquement au retour d'une pub.
 * @param {Function} launchCallback La fonction launchGame de main.js
 */
export function checkPendingGameLaunch(launchCallback) {
    const check = () => {
        const pendingGame = sessionStorage.getItem('mg_pending_game_launch');
        if (pendingGame) {
            sessionStorage.removeItem('mg_pending_game_launch');
            // Un petit délai pour que l'utilisateur voit qu'il est revenu
            setTimeout(() => {
                launchCallback(pendingGame);
            }, 100);
        }
    };

    // Vérifier immédiatement au chargement
    check();

    // Et vérifier à chaque fois que la fenêtre reprend le focus (retour d'un autre onglet)
    window.addEventListener('focus', check);
}
