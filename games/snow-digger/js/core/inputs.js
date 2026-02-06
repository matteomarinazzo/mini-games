import { canvas } from "./canvas.js";

// Détection mobile
export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

export const mouse = {
  x: 0,
  y: 0,
  angle: 0,
  left: false,
  right: false,
};

export const keys = {};

// État tactile amélioré
export const touch = {
  active: false,
  x: 0,
  y: 0,
  startX: 0,
  startY: 0,
  currentTouches: 0,
  isLongPress: false,
  longPressTimer: null,
  isDragging: false,
  dragThreshold: 10, // pixels de mouvement pour considérer comme drag
  lastTapTime: 0,
};

// Joystick virtuel pour mobile
export const virtualJoystick = {
  active: false,
  centerX: 0,
  centerY: 0,
  currentX: 0,
  currentY: 0,
  maxRadius: 60,
  deltaX: 0,
  deltaY: 0,
};

// Zone du joystick (constant)
const JOYSTICK_ZONE_SIZE = 150;

export function initInput() {
  // === DESKTOP CONTROLS ===
  if (!isMobile) {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("contextmenu", e => e.preventDefault());
  }
  
  // === MOBILE CONTROLS ===
  else {
    // ✅ CORRECTION : Utiliser { passive: false } uniquement sur le canvas
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", handleTouchEnd, { passive: false });
    
    // ✅ CORRECTION : Ne pas empêcher les gestes sur le document
    // Ces listeners sont trop agressifs, on les retire
  }
}

// ==========================================
// DESKTOP HANDLERS
// ==========================================
function handleMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;

  const dx = e.movementX;
  const dy = e.movementY;
  mouse.angle = Math.atan2(dy, dx);
}

function handleMouseDown(e) {
  if (e.button === 0) mouse.left = true;
  if (e.button === 2) mouse.right = true;
}

function handleMouseUp(e) {
  if (e.button === 0) mouse.left = false;
  if (e.button === 2) mouse.right = false;
}

function handleKeyDown(e) {
  keys[e.key] = true;
}

function handleKeyUp(e) {
  keys[e.key] = false;
}

// ==========================================
// MOBILE HANDLERS
// ==========================================
function handleTouchStart(e) {
  // ✅ CORRECTION : Vérifier si l'événement est cancelable avant de l'empêcher
  if (e.cancelable) {
    e.preventDefault();
  }
  
  const touches = e.touches;
  touch.currentTouches = touches.length;
  
  if (touches.length === 1) {
    const rect = canvas.getBoundingClientRect();
    const touchX = touches[0].clientX - rect.left;
    const touchY = touches[0].clientY - rect.top;
    
    touch.x = touchX;
    touch.y = touchY;
    touch.startX = touchX;
    touch.startY = touchY;
    touch.active = true;
    touch.isDragging = false;
    touch.isLongPress = false;
    
    // Position de la souris pour le feedback visuel
    mouse.x = touchX;
    mouse.y = touchY;
    
    // Détection du joystick (zone en bas à gauche)
    if (isInJoystickZone(touchX, touchY)) {
      activateJoystick(touchX, touchY);
    } else {
      // Zone de jeu normale : setup long press pour skieur
      touch.longPressTimer = setTimeout(() => {
        if (!touch.isDragging) {
          touch.isLongPress = true;
          mouse.right = true;
          
          // Vibration si disponible
          if (navigator.vibrate) {
            navigator.vibrate(50);
          }
        }
      }, 500);
    }
  } else if (touches.length === 2) {
    // Deux doigts = spawn skieur immédiat
    clearTimeout(touch.longPressTimer);
    
    const rect = canvas.getBoundingClientRect();
    mouse.x = touches[0].clientX - rect.left;
    mouse.y = touches[0].clientY - rect.top;
    mouse.right = true;
    
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }
}

function handleTouchMove(e) {
  // ✅ CORRECTION : Vérifier si cancelable
  if (e.cancelable) {
    e.preventDefault();
  }
  
  const touches = e.touches;
  
  if (touches.length === 1) {
    const rect = canvas.getBoundingClientRect();
    const touchX = touches[0].clientX - rect.left;
    const touchY = touches[0].clientY - rect.top;
    
    touch.x = touchX;
    touch.y = touchY;
    mouse.x = touchX;
    mouse.y = touchY;
    
    // Vérifier si c'est un drag (mouvement > threshold)
    const distMoved = Math.hypot(touchX - touch.startX, touchY - touch.startY);
    
    if (distMoved > touch.dragThreshold && !touch.isDragging) {
      touch.isDragging = true;
      clearTimeout(touch.longPressTimer); // Annuler long press si on bouge
    }
    
    // Joystick virtuel
    if (virtualJoystick.active) {
      updateJoystick(touchX, touchY);
    } else if (touch.isDragging) {
      // Si on drag = déneiger
      mouse.left = true;
    }
    
    // Calculer l'angle du mouvement (pour feedback visuel éventuel)
    const dx = touchX - touch.startX;
    const dy = touchY - touch.startY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      mouse.angle = Math.atan2(dy, dx);
    }
  }
}

function handleTouchEnd(e) {
  // ✅ CORRECTION : Vérifier si cancelable
  if (e.cancelable) {
    e.preventDefault();
  }
  
  clearTimeout(touch.longPressTimer);
  
  // Si c'était un tap court sans drag et pas dans le joystick = déneiger
  if (!touch.isDragging && !touch.isLongPress && !virtualJoystick.active && touch.currentTouches === 1) {
    mouse.left = true;
    
    // Vibration légère pour feedback
    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
    
    setTimeout(() => {
      mouse.left = false;
    }, 100); // Simule un clic court
  }
  
  // Reset états
  touch.active = false;
  touch.isDragging = false;
  touch.isLongPress = false;
  mouse.left = false;
  mouse.right = false;
  touch.currentTouches = e.touches.length;
  
  // Désactiver le joystick
  if (virtualJoystick.active && e.touches.length === 0) {
    deactivateJoystick();
  }
}

// ==========================================
// FONCTIONS JOYSTICK
// ==========================================
function isInJoystickZone(x, y) {
  return x < JOYSTICK_ZONE_SIZE && y > canvas.height - JOYSTICK_ZONE_SIZE;
}

function activateJoystick(x, y) {
  virtualJoystick.active = true;
  virtualJoystick.centerX = x;
  virtualJoystick.centerY = y;
  virtualJoystick.currentX = x;
  virtualJoystick.currentY = y;
  virtualJoystick.deltaX = 0;
  virtualJoystick.deltaY = 0;
  
  // Vibration pour indiquer l'activation
  if (navigator.vibrate) {
    navigator.vibrate(20);
  }
}

function updateJoystick(x, y) {
  if (!virtualJoystick.active) return;
  
  const dx = x - virtualJoystick.centerX;
  const dy = y - virtualJoystick.centerY;
  const distance = Math.hypot(dx, dy);
  
  // Limiter au rayon max
  if (distance > virtualJoystick.maxRadius) {
    const angle = Math.atan2(dy, dx);
    virtualJoystick.currentX = virtualJoystick.centerX + Math.cos(angle) * virtualJoystick.maxRadius;
    virtualJoystick.currentY = virtualJoystick.centerY + Math.sin(angle) * virtualJoystick.maxRadius;
  } else {
    virtualJoystick.currentX = x;
    virtualJoystick.currentY = y;
  }
  
  // Calculer les deltas normalisés (-1 à 1)
  virtualJoystick.deltaX = (virtualJoystick.currentX - virtualJoystick.centerX) / virtualJoystick.maxRadius;
  virtualJoystick.deltaY = (virtualJoystick.currentY - virtualJoystick.centerY) / virtualJoystick.maxRadius;
}

function deactivateJoystick() {
  virtualJoystick.active = false;
  virtualJoystick.deltaX = 0;
  virtualJoystick.deltaY = 0;
}

// ==========================================
// FONCTION POUR RÉCUPÉRER LES INPUTS CAMÉRA
// ==========================================
export function getCameraMovement() {
  // Mobile : joystick virtuel
  if (isMobile && virtualJoystick.active) {
    return {
      x: virtualJoystick.deltaX,
      y: virtualJoystick.deltaY,
    };
  }
  
  // Desktop : clavier
  let x = 0, y = 0;
  if (keys["ArrowLeft"] || keys["a"] || keys["q"]) x -= 1;
  if (keys["ArrowRight"] || keys["d"]) x += 1;
  if (keys["ArrowUp"] || keys["w"] || keys["z"]) y -= 1;
  if (keys["ArrowDown"] || keys["s"]) y += 1;
  
  return { x, y };
}

// ==========================================
// UTILITAIRES PUBLICS
// ==========================================
export function getJoystickZoneSize() {
  return JOYSTICK_ZONE_SIZE;
}