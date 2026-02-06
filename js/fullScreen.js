// Détection mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Fonction pour activer le plein écran
export function requestFullscreen() {
  const elem = document.documentElement;
  
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) { /* Safari */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) { /* IE11 */
    elem.msRequestFullscreen();
  }
  
  // Verrouillage en mode paysage sur mobile
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {
      console.log('Orientation lock not supported');
    });
  }
}

// Fonction pour quitter le plein écran
export function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen();
  }
}

// Toggle plein écran
export function toggleFullscreen() {
  if (!document.fullscreenElement && 
      !document.webkitFullscreenElement && 
      !document.msFullscreenElement) {
    requestFullscreen();
  } else {
    exitFullscreen();
  }
}

// Créer le bouton plein écran
export function createFullscreenButton() {
  const btn = document.getElementById('fullscreenBtn');
  btn.addEventListener('click', toggleFullscreen);
}

// Auto-plein écran sur mobile au premier touch
export function initMobileFullscreen() {
  if (isMobile) {
    const autoFullscreen = () => {
      requestFullscreen();
      
      // Cacher la barre d'adresse en scrollant
      window.scrollTo(0, 1);
      
      // Retirer l'événement après le premier déclenchement
      document.removeEventListener('touchstart', autoFullscreen);
      document.removeEventListener('click', autoFullscreen);
    };
    
    document.addEventListener('touchstart', autoFullscreen, { once: true });
    document.addEventListener('click', autoFullscreen, { once: true });
  }
}

// Wake Lock - Empêcher la mise en veille de l'écran
let wakeLock = null;

export async function enableWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      
      // Réactiver si l'écran est déverrouillé
      document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      });
    } catch (err) {
      console.log('Wake Lock non supporté', err);
    }
  }
}

// Initialisation complète
export function initFullscreenSystem() {
  createFullscreenButton();
  initMobileFullscreen();
  enableWakeLock();
}

// Export pour utilisation dans ton jeu
export { isMobile };