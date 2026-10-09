/**
 * SNOW DIGGER — js/core/assets.js
 * Tous les SVG inline (pelles, skieur, flocons)
 * Chaque SVG est une string. On les convertit en ImageBitmap au démarrage.
 */

// ── PELLES (20 niveaux) ──────
// La largeur de chaque SVG correspond EXACTEMENT à la largeur de la zone déblayée.

export const SHOVEL_SVGS = [
  // Niv 1 : Truelle de jardin pointue (W=16)
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="32" viewBox="0 0 16 32">
    <path d="M8 2 L14 12 L11 18 L5 18 L2 12 Z" fill="#d0d4dc" stroke="#88909e" stroke-width="1"/>
    <rect x="7" y="18" width="2" height="12" rx="1" fill="#8B5E3C"/>
  </svg>`,

  // Niv 2 : Petite pelle rouge (W=24)
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="38" viewBox="0 0 24 38">
    <path d="M4 4 L20 4 L22 18 L12 24 L2 18 Z" fill="#d32f2f" stroke="#b71c1c" stroke-width="1"/>
    <rect x="2" y="3" width="20" height="2" fill="#c0c0c0"/>
    <rect x="10" y="24" width="4" height="14" rx="2" fill="#d7ccc8"/>
  </svg>`,

  // Niv 3 : Pelle pliante US armée (W=32)
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
    <path d="M4 2 L28 2 L30 16 L16 26 L2 16 Z" fill="#4caf50" stroke="#2e7d32" stroke-width="1.5"/>
    <circle cx="16" cy="14" r="3" fill="#1b5e20"/>
    <rect x="14" y="26" width="4" height="16" rx="2" fill="#3e2723"/>
  </svg>`,

  // Niv 4 : Pelle ronde de terrassement (W=40)
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
    <ellipse cx="20" cy="12" rx="18" ry="10" fill="#78909c" stroke="#546e7a" stroke-width="2"/>
    <path d="M18 20 L18 42 L22 42 L22 20 Z" fill="#ffb300"/>
    <rect x="14" y="42" width="12" height="6" rx="3" fill="#37474f"/>
  </svg>`,

  // Niv 5 : Bêche carrée de chantier (W=48)
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="56" viewBox="0 0 48 56">
    <rect x="4" y="2" width="40" height="18" rx="2" fill="#1976d2" stroke="#0d47a1" stroke-width="2"/>
    <rect x="2" y="2" width="44" height="3" fill="#0d47a1"/>
    <rect x="21" y="20" width="6" height="30" fill="#795548"/>
    <rect x="16" y="50" width="16" height="6" rx="3" fill="#e65100"/>
  </svg>`,

  // Niv 6 : Pelle à neige alu nervurée (W=56)
  `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="60" viewBox="0 0 56 60">
    <rect x="2" y="2" width="52" height="22" rx="3" fill="#cfd8dc" stroke="#90a4ae" stroke-width="2"/>
    <line x1="16" y1="2" x2="16" y2="24" stroke="#90a4ae" stroke-width="2"/>
    <line x1="40" y1="2" x2="40" y2="24" stroke="#90a4ae" stroke-width="2"/>
    <rect x="25" y="24" width="6" height="30" fill="#607d8b"/>
    <rect x="18" y="54" width="20" height="6" rx="3" fill="#212121"/>
  </svg>`,

  // Niv 7 : Pelle polymère large bleu givré (W=64)
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <path d="M2 4 Q 32 12 62 4 L56 26 L8 26 Z" fill="#81d4fa" stroke="#039be5" stroke-width="2"/>
    <rect x="2" y="2" width="60" height="4" fill="#607d8b"/>
    <path d="M30 26 L34 26 L36 56 L28 56 Z" fill="#fb8c00"/>
    <rect x="20" y="56" width="24" height="8" rx="4" fill="#01579b"/>
  </svg>`,

  // Niv 8 : Poussoir jaune de voirie (W=74)
  `<svg xmlns="http://www.w3.org/2000/svg" width="74" height="66" viewBox="0 0 74 66">
    <rect x="2" y="4" width="70" height="20" rx="4" fill="#ffeb3b" stroke="#fbc02d" stroke-width="2"/>
    <path d="M20 4 L30 24 M44 4 L54 24" stroke="#212121" stroke-width="3"/>
    <path d="M26 24 L20 60 M48 24 L54 60" stroke="#757575" stroke-width="4"/>
    <rect x="12" y="60" width="50" height="6" rx="3" fill="#212121"/>
  </svg>`,

  // Niv 9 : Poussoir ergonomique haute capacité (W=86)
  `<svg xmlns="http://www.w3.org/2000/svg" width="86" height="70" viewBox="0 0 86 70">
    <path d="M4 6 Q 43 14 82 6 L78 28 L8 28 Z" fill="#e53935" stroke="#b71c1c" stroke-width="2"/>
    <rect x="4" y="4" width="78" height="4" fill="#cfd8dc"/>
    <path d="M30 28 L20 64 M56 28 L66 64" stroke="#455a64" stroke-width="5"/>
    <rect x="14" y="64" width="58" height="6" rx="3" fill="#ff5252"/>
  </svg>`,

  // Niv 10 : Traîneau de déneigement double main (W=98)
  `<svg xmlns="http://www.w3.org/2000/svg" width="98" height="74" viewBox="0 0 98 74">
    <path d="M2 8 Q 49 18 96 8 L90 34 L8 34 Z" fill="#ff9800" stroke="#ef6c00" stroke-width="3"/>
    <path d="M20 34 C 10 50, 10 70, 20 70 L78 70 C 88 70, 88 50, 78 34" fill="none" stroke="#607d8b" stroke-width="6"/>
  </svg>`,

  // Niv 11 : Racleuse sur roues profilée (W=112)
  `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="76" viewBox="0 0 112 76">
    <path d="M4 10 Q 56 0 108 10 L104 26 L8 26 Z" fill="#b0bec5" stroke="#78909c" stroke-width="3"/>
    <rect x="4" y="22" width="104" height="6" fill="#212121"/>
    <circle cx="20" cy="24" r="8" fill="#424242"/>
    <circle cx="92" cy="24" r="8" fill="#424242"/>
    <path d="M46 26 L40 70 M66 26 L72 70" stroke="#fbc02d" stroke-width="5"/>
    <rect x="30" y="70" width="52" height="6" rx="3" fill="#212121"/>
  </svg>`,

  // Niv 12 : Fraiseuse à neige thermique (W=126)
  `<svg xmlns="http://www.w3.org/2000/svg" width="126" height="80" viewBox="0 0 126 80">
    <rect x="6" y="8" width="114" height="24" rx="4" fill="#d32f2f" stroke="#b71c1c" stroke-width="3"/>
    <path d="M12 20 Q 63 30 114 20" fill="none" stroke="#eeeeee" stroke-width="6" stroke-dasharray="10 5"/>
    <circle cx="20" cy="8" r="4" fill="#ffeb3b"/>
    <circle cx="106" cy="8" r="4" fill="#ffeb3b"/>
    <rect x="48" y="32" width="30" height="30" fill="#424242"/>
    <path d="M50 62 L30 76 M76 62 L96 76" stroke="#424242" stroke-width="6"/>
  </svg>`,

  // Niv 13 : Lame orientable quad / ATV (W=142)
  `<svg xmlns="http://www.w3.org/2000/svg" width="142" height="82" viewBox="0 0 142 82">
    <path d="M4 12 L138 16 L134 34 L8 30 Z" fill="#212121" stroke="#424242" stroke-width="3"/>
    <rect x="4" y="8" width="134" height="4" fill="#ffeb3b"/>
    <rect x="30" y="32" width="6" height="16" fill="#ffeb3b"/>
    <rect x="106" y="33" width="6" height="16" fill="#ffeb3b"/>
    <path d="M50 48 L60 82 M92 48 L82 82" stroke="#616161" stroke-width="8"/>
  </svg>`,

  // Niv 14 : Chasse-neige tracteur alpin (W=160)
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="86" viewBox="0 0 160 86">
    <path d="M4 10 L156 10 L152 36 L8 36 Z" fill="#2e7d32" stroke="#1b5e20" stroke-width="4"/>
    <rect x="4" y="10" width="152" height="6" fill="#ffeb3b" stroke-dasharray="20 20" stroke="#212121" stroke-width="6"/>
    <rect x="60" y="36" width="12" height="40" fill="#757575"/>
    <rect x="88" y="36" width="12" height="40" fill="#757575"/>
    <circle cx="66" cy="76" r="6" fill="#424242"/>
    <circle cx="94" cy="76" r="6" fill="#424242"/>
  </svg>`,

  // Niv 15 : Étrave en V pour pick-up 4x4 (W=180)
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="90" viewBox="0 0 180 90">
    <path d="M90 2 L176 24 L170 44 L90 28 L10 44 L4 24 Z" fill="#f44336" stroke="#c62828" stroke-width="4"/>
    <circle cx="80" cy="14" r="4" fill="#ff9800"/>
    <circle cx="100" cy="14" r="4" fill="#ff9800"/>
    <path d="M70 40 L60 86 M110 40 L120 86" stroke="#424242" stroke-width="8"/>
  </svg>`,

  // Niv 16 : Lame autoroutière aérodynamique (W=202)
  `<svg xmlns="http://www.w3.org/2000/svg" width="202" height="94" viewBox="0 0 202 94">
    <path d="M6 16 Q 101 2 196 16 L190 44 L12 44 Z" fill="#ff9800" stroke="#e65100" stroke-width="4"/>
    <rect x="6" y="6" width="190" height="8" fill="#cfd8dc" opacity="0.8"/>
    <rect x="70" y="44" width="14" height="40" fill="#212121"/>
    <rect x="118" y="44" width="14" height="40" fill="#212121"/>
  </svg>`,

  // Niv 17 : Super-étrave de camion suisse (W=226)
  `<svg xmlns="http://www.w3.org/2000/svg" width="226" height="98" viewBox="0 0 226 98">
    <path d="M113 4 L220 20 L214 48 L113 36 L12 48 L6 20 Z" fill="#d32f2f" stroke="#b71c1c" stroke-width="4"/>
    <path d="M103 16 L123 16 M113 6 L113 26" stroke="#ffffff" stroke-width="8"/>
    <circle cx="30" cy="16" r="6" fill="#ffeb3b"/>
    <circle cx="196" cy="16" r="6" fill="#ffeb3b"/>
    <path d="M80 44 L70 90 M146 44 L156 90" stroke="#616161" stroke-width="12"/>
  </svg>`,

  // Niv 18 : Lame panoramique dameuse PistenBully (W=252)
  `<svg xmlns="http://www.w3.org/2000/svg" width="252" height="102" viewBox="0 0 252 102">
    <path d="M12 18 L60 12 L192 12 L240 18 L244 50 L8 50 Z" fill="#e53935" stroke="#b71c1c" stroke-width="4"/>
    <rect x="12" y="12" width="228" height="6" fill="#212121"/>
    <rect x="80" y="50" width="92" height="40" fill="#424242"/>
    <circle cx="90" cy="70" r="12" fill="#757575"/>
    <circle cx="162" cy="70" r="12" fill="#757575"/>
  </svg>`,

  // Niv 19 : Turbo-blower aéroportuaire monstre (W=280)
  `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="106" viewBox="0 0 280 106">
    <rect x="10" y="12" width="260" height="40" rx="8" fill="#cfd8dc" stroke="#90a4ae" stroke-width="4"/>
    <circle cx="70" cy="32" r="14" fill="#263238" stroke="#ffeb3b" stroke-width="2"/>
    <circle cx="210" cy="32" r="14" fill="#263238" stroke="#ffeb3b" stroke-width="2"/>
    <rect x="110" y="52" width="60" height="44" fill="#37474f"/>
    <path d="M110 52 L140 2 L170 52" fill="#f44336"/>
  </svg>`,

  // Niv 20 : TITAN POLAIRE APEX (Bouclier Cryo-Plasma) (W=310)
  `<svg xmlns="http://www.w3.org/2000/svg" width="310" height="112" viewBox="0 0 310 112">
    <path d="M155 4 Q 230 -2 300 24 L290 60 Q 155 40 20 60 L10 24 Q 80 -2 155 4 Z" fill="#212121" stroke="#00e5ff" stroke-width="4"/>
    <path d="M155 20 Q 200 16 250 30" fill="none" stroke="#00e5ff" stroke-width="6" opacity="0.7"/>
    <path d="M155 20 Q 110 16 60 30" fill="none" stroke="#00e5ff" stroke-width="6" opacity="0.7"/>
    <circle cx="155" cy="24" r="12" fill="#00e5ff"/>
    <rect x="115" y="56" width="80" height="46" fill="#111111" stroke="#00e5ff" stroke-width="2"/>
    <circle cx="135" cy="80" r="8" fill="#00b0ff"/>
    <circle cx="175" cy="80" r="8" fill="#00b0ff"/>
  </svg>`,
];

// ── SKIEUR (vue du dessus, position schuss) ────────────────────
export const SKIER_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="52" viewBox="0 0 28 52">
    <!-- Skis -->
    <rect x="3" y="8" width="5" height="42" rx="2.5" fill="#1a1a2e" opacity="0.9"/>
    <rect x="20" y="8" width="5" height="42" rx="2.5" fill="#1a1a2e" opacity="0.9"/>
    <!-- Embouts avant -->
    <ellipse cx="5.5" cy="8" rx="2.5" ry="3" fill="#2a2a4e"/>
    <ellipse cx="22.5" cy="8" rx="2.5" ry="3" fill="#2a2a4e"/>
    <!-- Corps (combinaison) -->
    <ellipse cx="14" cy="30" rx="7" ry="11" fill="#1565c0"/>
    <!-- Tête (casque) -->
    <circle cx="14" cy="16" r="7" fill="#d32f2f"/>
    <!-- Visière -->
    <path d="M8 17 Q14 22 20 17" fill="#f5a623" opacity="0.85"/>
    <!-- Bras / Bâtons -->
    <line x1="7" y1="26" x2="1" y2="36" stroke="#aaa" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="21" y1="26" x2="27" y2="36" stroke="#aaa" stroke-width="1.5" stroke-linecap="round"/>
    <!-- Rondelles -->
    <circle cx="1" cy="37" r="2" fill="#ccc" opacity="0.7"/>
    <circle cx="27" cy="37" r="2" fill="#ccc" opacity="0.7"/>
    <!-- Reflet casque -->
    <ellipse cx="11" cy="13" rx="2.5" ry="1.5" fill="rgba(255,255,255,0.3)" transform="rotate(-20,11,13)"/>
  </svg>`;

// ── FLOCONS DE NEIGE (5 types) ─────────────────────────────────
export const SNOWFLAKE_SVGS = [
  // Type 1 — Étoile à 6 branches
  `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">
    <line x1="6" y1="1" x2="6" y2="11" stroke="white" stroke-width="1.5" opacity="0.8" stroke-linecap="round"/>
    <line x1="1.6" y1="3.5" x2="10.4" y2="8.5" stroke="white" stroke-width="1.5" opacity="0.8" stroke-linecap="round"/>
    <line x1="1.6" y1="8.5" x2="10.4" y2="3.5" stroke="white" stroke-width="1.5" opacity="0.8" stroke-linecap="round"/>
    <circle cx="6" cy="6" r="1.5" fill="white"/>
  </svg>`,

  // Type 2 — Petit cristal carré
  `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8">
    <rect x="3" y="1" width="2" height="6" fill="white" opacity="0.7"/>
    <rect x="1" y="3" width="6" height="2" fill="white" opacity="0.7"/>
  </svg>`,

  // Type 3 — Flocon touffu (complexe)
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <path d="M8 2 L8 14 M2 8 L14 8 M3.7 3.7 L12.3 12.3 M3.7 12.3 L12.3 3.7" stroke="white" stroke-width="1.5" opacity="0.9" stroke-linecap="round"/>
    <circle cx="8" cy="8" r="2" fill="white"/>
    <circle cx="8" cy="2" r="1" fill="white"/>
    <circle cx="8" cy="14" r="1" fill="white"/>
    <circle cx="2" cy="8" r="1" fill="white"/>
    <circle cx="14" cy="8" r="1" fill="white"/>
  </svg>`,

  // Type 4 — Simple point doux (particule)
  `<svg xmlns="http://www.w3.org/2000/svg" width="6" height="6" viewBox="0 0 6 6">
    <circle cx="3" cy="3" r="2.5" fill="white" opacity="0.6"/>
  </svg>`,

  // Type 5 — Pastille pointillée (flocon compact)
  `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">
    <circle cx="6" cy="6" r="2" fill="white" opacity="0.9"/>
    <circle cx="6" cy="1.5" r="1" fill="white" opacity="0.6"/>
    <circle cx="6" cy="10.5" r="1" fill="white" opacity="0.6"/>
    <circle cx="1.5" cy="6" r="1" fill="white" opacity="0.6"/>
    <circle cx="10.5" cy="6" r="1" fill="white" opacity="0.6"/>
    <circle cx="2.9" cy="2.9" r="0.8" fill="white" opacity="0.4"/>
    <circle cx="9.1" cy="2.9" r="0.8" fill="white" opacity="0.4"/>
    <circle cx="2.9" cy="9.1" r="0.8" fill="white" opacity="0.4"/>
    <circle cx="9.1" cy="9.1" r="0.8" fill="white" opacity="0.4"/>
  </svg>`,
];

// ── Convertir un SVG string → ImageBitmap ──────────────────────
export async function svgToBitmap(svgStr) {
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (typeof createImageBitmap !== 'undefined') {
        createImageBitmap(img).then(bm => { URL.revokeObjectURL(url); resolve(bm); });
      } else {
        URL.revokeObjectURL(url);
        resolve(img);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Charger tous les assets, retourne un objet {shovels[], skier, flakes[]} ──
export async function loadAllAssets() {
  const [shovels, skier, ...flakes] = await Promise.all([
    Promise.all(SHOVEL_SVGS.map(svgToBitmap)),
    svgToBitmap(SKIER_SVG),
    ...SNOWFLAKE_SVGS.map(svgToBitmap),
  ]);
  return { shovels, skier, flakes };
}
