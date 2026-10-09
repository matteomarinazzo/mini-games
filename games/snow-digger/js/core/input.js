/**
 * SNOW DIGGER — js/core/input.js
 * Gestion clavier/souris (Desktop) et tactile (Mobile)
 * Joystick virtuel pour déplacer la caméra sur mobile.
 */

export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

// État de la souris / touche de jeu
export const pointer = {
  x: 0, y: 0,
  angle: 0,
  digging: false,   // left click / tap drag
  spawnSkier: false, // right click / long press / 2 doigts
};

// Clavier
const keys = {};

// Joystick virtuel (camera pan sur mobile)
export const joystick = {
  active: false,
  centerX: 0, centerY: 0,
  currentX: 0, currentY: 0,
  deltaX: 0, deltaY: 0,
  maxRadius: 55,
};

const JOYSTICK_ZONE = 130; // px carré en bas-gauche

let canvas;
let longPressTimer = null;
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let touchCount = 0;

export function initInput(canvasEl) {
  canvas = canvasEl;

  if (!isMobile) {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup',   onMouseUp);
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup',   e => { keys[e.key] = false; });
    window.addEventListener('contextmenu', e => e.preventDefault());
  } else {
    canvas.addEventListener('touchstart',  onTouchStart,  { passive: false });
    canvas.addEventListener('touchmove',   onTouchMove,   { passive: false });
    canvas.addEventListener('touchend',    onTouchEnd,    { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd,    { passive: false });
  }
}

// ── Desktop ───────────────────────────────────────────────────
function onMouseMove(e) {
  const r = canvas.getBoundingClientRect();
  pointer.x = e.clientX - r.left;
  pointer.y = e.clientY - r.top;
  const dx = e.movementX;
  const dy = e.movementY;
  if (dx * dx + dy * dy > 2) {
    pointer.angle = Math.atan2(dy, dx);
  }
}
function onMouseDown(e) {
  if (e.button === 0) pointer.digging = true;
  if (e.button === 2) pointer.spawnSkier = true;
}
function onMouseUp(e) {
  if (e.button === 0) pointer.digging = false;
  if (e.button === 2) pointer.spawnSkier = false;
}

// ── Mobile ────────────────────────────────────────────────────
function onTouchStart(e) {
  if (e.cancelable) e.preventDefault();
  touchCount = e.touches.length;

  if (e.touches.length === 2) {
    // Deux doigts → spawn skieur immédiat
    clearTimeout(longPressTimer);
    const r = canvas.getBoundingClientRect();
    pointer.x = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
    pointer.y = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
    pointer.spawnSkier = true;
    if (navigator.vibrate) navigator.vibrate(40);
    return;
  }

  const r = canvas.getBoundingClientRect();
  const tx = e.touches[0].clientX - r.left;
  const ty = e.touches[0].clientY - r.top;
  pointer.x = tx; pointer.y = ty;
  dragStartX = tx; dragStartY = ty;
  isDragging = false;

  // Zone joystick (bas-gauche)
  if (tx < JOYSTICK_ZONE && ty > canvas.height - JOYSTICK_ZONE) {
    joystick.active = true;
    joystick.centerX = tx; joystick.centerY = ty;
    joystick.currentX = tx; joystick.currentY = ty;
    joystick.deltaX = 0;   joystick.deltaY = 0;
    if (navigator.vibrate) navigator.vibrate(15);
    return;
  }

  // Long press → spawn skieur
  longPressTimer = setTimeout(() => {
    if (!isDragging) {
      pointer.spawnSkier = true;
      if (navigator.vibrate) navigator.vibrate(50);
    }
  }, 480);
}

function onTouchMove(e) {
  if (e.cancelable) e.preventDefault();
  if (e.touches.length === 0) return;

  const r  = canvas.getBoundingClientRect();
  const tx = e.touches[0].clientX - r.left;
  const ty = e.touches[0].clientY - r.top;

  // Joystick
  if (joystick.active) {
    const dx = tx - joystick.centerX;
    const dy = ty - joystick.centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > joystick.maxRadius) {
      const a = Math.atan2(dy, dx);
      joystick.currentX = joystick.centerX + Math.cos(a) * joystick.maxRadius;
      joystick.currentY = joystick.centerY + Math.sin(a) * joystick.maxRadius;
    } else {
      joystick.currentX = tx; joystick.currentY = ty;
    }
    joystick.deltaX = (joystick.currentX - joystick.centerX) / joystick.maxRadius;
    joystick.deltaY = (joystick.currentY - joystick.centerY) / joystick.maxRadius;
    return;
  }

  const moved = Math.hypot(tx - dragStartX, ty - dragStartY);
  if (moved > 8 && !isDragging) {
    isDragging = true;
    clearTimeout(longPressTimer);
  }

  pointer.x = tx; pointer.y = ty;
  pointer.angle = Math.atan2(ty - dragStartY, tx - dragStartX);

  if (isDragging) pointer.digging = true;
}

function onTouchEnd(e) {
  if (e.cancelable) e.preventDefault();
  clearTimeout(longPressTimer);

  // Joystick released
  if (joystick.active && e.touches.length === 0) {
    joystick.active = false;
    joystick.deltaX = 0; joystick.deltaY = 0;
  }

  pointer.spawnSkier = false;
  pointer.digging = false;
  touchCount = e.touches.length;

  // Court tap (sans drag, sans joystick) → déneiger
  if (!isDragging && !joystick.active && touchCount === 0) {
    pointer.digging = true;
    if (navigator.vibrate) navigator.vibrate(20);
    setTimeout(() => { pointer.digging = false; }, 80);
  }

  isDragging = false;
}

// ── Camera movement vector ────────────────────────────────────
export function getCameraInput() {
  if (isMobile && joystick.active) {
    return { x: joystick.deltaX, y: joystick.deltaY };
  }
  let x = 0, y = 0;
  if (keys['ArrowLeft']  || keys['a'] || keys['q']) x -= 1;
  if (keys['ArrowRight'] || keys['d'])               x += 1;
  if (keys['ArrowUp']    || keys['w'] || keys['z'])  y -= 1;
  if (keys['ArrowDown']  || keys['s'])               y += 1;
  return { x, y };
}

export function getJoystickZone() { return JOYSTICK_ZONE; }
