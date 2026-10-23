/** Cartes Skyjo en pur SVG (proportions de carte réelle 60x84, ombres courtes, haute lisibilité).
 *  Code couleur :
 *  -2 et -1 : même couleur violette (#7c3aed)
 *  0 : bleu ciel (#38bdf8)
 *  1-4 : vert (#16a34a)
 *  5-8 : jaune (#eab308)
 *  9-12 : rouge (#dc2626)
 *  Chiffres : intérieur noir, contour blanc épais sur toutes les cartes pour une lisibilité unie et optimale.
 *  Dos de carte : dégradé rayonnant traversant les 5 couleurs du jeu (violet -> bleu -> vert -> jaune -> rouge).
 *  Crazy : 3 jokers sur fond bleu ciel (rappel du 0) avec designs dédiés très soignés (Caméléon, Colonne, Cible) sans aucun texte « 0 ».
 */

const PALETTE = {
    purple: '#7c3aed', // -2 et -1 partagent exactement le même violet
    zero: '#38bdf8',
    green: '#16a34a',
    yellow: '#eab308',
    red: '#dc2626'
};

function getColor(v) {
    if (v < 0) return PALETTE.purple; // -2 et -1 ont la même couleur
    if (v === 0) return PALETTE.zero;
    if (v <= 4) return PALETTE.green;
    if (v <= 8) return PALETTE.yellow;
    return PALETTE.red;
}

const FONT = 'font-family="system-ui,-apple-system,\'Segoe UI\',Trebuchet MS,sans-serif" font-weight="900"';

function baseCard(bg, stroke, innerStroke, content) {
    return `<svg viewBox="0 0 60 84" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <filter id="c-sh" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1" flood-color="#000" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect x="1.5" y="1.5" width="57" height="81" rx="6" fill="${bg}" stroke="${stroke}" stroke-width="2.5" filter="url(#c-sh)"/>
  <rect x="5.5" y="5.5" width="49" height="73" rx="4" fill="none" stroke="${innerStroke}" stroke-width="1.2"/>
  ${content}
</svg>`;
}

export function cardFace(card) {
    const v = typeof card === 'object' && card !== null ? (card.v ?? 0) : Number(card);
    const joker = typeof card === 'object' && card !== null ? card.joker : null;

    if (joker) {
        return jokerFace(joker);
    }

    const bg = getColor(v);
    const t = String(v).replace('-', '−');
    const mainSize = t.length > 2 ? 30 : t.length > 1 ? 36 : 44;
    const cornerSize = 11;

    // Chiffres : contour blanc et intérieur noir sur toutes les cartes pour une lisibilité unie
    const strokeCorner = 2.4;
    const strokeMain = t.length > 2 ? 4.2 : 5.2;

    const content = `
    <!-- Coins haut-gauche et bas-droite -->
    <text x="9" y="19" ${FONT} font-size="${cornerSize}" fill="#000000" stroke="#ffffff" stroke-width="${strokeCorner}" stroke-linejoin="round" paint-order="stroke fill" text-anchor="start">${t}</text>
    <text x="51" y="76" ${FONT} font-size="${cornerSize}" fill="#000000" stroke="#ffffff" stroke-width="${strokeCorner}" stroke-linejoin="round" paint-order="stroke fill" text-anchor="end">${t}</text>
    <!-- Valeur centrale dominante -->
    <text x="30" y="53" ${FONT} font-size="${mainSize}" fill="#000000" stroke="#ffffff" stroke-width="${strokeMain}" stroke-linejoin="round" paint-order="stroke fill" text-anchor="middle" dominant-baseline="middle">${t}</text>
  `;
    return baseCard(bg, '#ffffff', 'rgba(255,255,255,0.45)', content);
}

function jokerFace(type) {
    const bg = '#38bdf8'; // Même bleu ciel que la carte 0
    const border = '#ffffff';

    let icon = '';
    let cornerIcon = '';

    if (type === 'chameleon') {
        cornerIcon = `
      <g transform="translate(10, 15) scale(0.7)">
        <path d="M-6,2 C-7,-4 -3,-7 0,-4 C3,-7 7,-4 6,2 Z" fill="#7c3aed" stroke="#ffffff" stroke-width="1.2"/>
        <circle cx="-6" cy="-4" r="1.5" fill="#facc15"/>
        <circle cx="6" cy="-4" r="1.5" fill="#facc15"/>
      </g>
      <g transform="translate(50, 73) scale(0.7) rotate(180)">
        <path d="M-6,2 C-7,-4 -3,-7 0,-4 C3,-7 7,-4 6,2 Z" fill="#7c3aed" stroke="#ffffff" stroke-width="1.2"/>
        <circle cx="-6" cy="-4" r="1.5" fill="#facc15"/>
        <circle cx="6" cy="-4" r="1.5" fill="#facc15"/>
      </g>
    `;
        icon = `
      <g transform="translate(30, 42)">
        <!-- Halo lumineux d'arrière-plan -->
        <circle cx="0" cy="0" r="23" fill="#ffffff" fill-opacity="0.25"/>
        <circle cx="0" cy="0" r="19" fill="#0284c7" fill-opacity="0.2" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3,2"/>

        <!-- Chapeau de bouffon / Caméléon stylisé -->
        <path d="M-4,-4 C-10,-13 -18,-15 -21,-8 C-22,-4 -16,2 -9,2 Z" fill="#7c3aed" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M4,-4 C10,-13 18,-15 21,-8 C22,-4 16,2 9,2 Z" fill="#7c3aed" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M-5,-4 C-3,-17 0,-21 0,-21 C0,-21 3,-17 5,-4 Z" fill="#facc15" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>

        <!-- Grelots dorés avec reflets -->
        <circle cx="-21" cy="-8" r="3" fill="#facc15" stroke="#ffffff" stroke-width="1.1"/>
        <circle cx="21" cy="-8" r="3" fill="#facc15" stroke="#ffffff" stroke-width="1.1"/>
        <circle cx="0" cy="-21" r="3" fill="#ffffff" stroke="#7c3aed" stroke-width="1.1"/>

        <!-- Masque souriant -->
        <path d="M-11,2 C-11,14 11,14 11,2 Z" fill="#ffffff" stroke="#082f49" stroke-width="1.4"/>
        <path d="M-7,6 Q-5,4 -3,6" fill="none" stroke="#082f49" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M3,6 Q5,4 7,6" fill="none" stroke="#082f49" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M-5,9 Q0,13 5,9" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>

        <!-- Collerette dorée -->
        <polygon points="-12,14 -6,19 0,14 6,19 12,14 8,11 -8,11" fill="#facc15" stroke="#ffffff" stroke-width="1"/>
        <circle cx="-6" cy="19" r="1.3" fill="#ffffff"/>
        <circle cx="6" cy="19" r="1.3" fill="#ffffff"/>

        <!-- Étoiles magiques -->
        <path d="M-14,-15 L-13,-12 L-10,-13 L-12,-10 L-11,-7 L-14,-9 L-17,-7 L-16,-10 L-18,-13 L-15,-12 Z" fill="#ffffff" opacity="0.95"/>
        <path d="M14,-15 L15,-12 L18,-13 L16,-10 L17,-7 L14,-9 L11,-7 L12,-10 L10,-13 L13,-12 Z" fill="#ffffff" opacity="0.95"/>
      </g>
    `;
    } else if (type === 'column') {
        cornerIcon = `
      <g transform="translate(10, 15)">
        <rect x="-4" y="-7" width="8" height="3" rx="1" fill="#16a34a" stroke="#ffffff" stroke-width="0.9"/>
        <rect x="-4" y="-2" width="8" height="3" rx="1" fill="#16a34a" stroke="#ffffff" stroke-width="0.9"/>
        <rect x="-4" y="3" width="8" height="3" rx="1" fill="#16a34a" stroke="#ffffff" stroke-width="0.9"/>
      </g>
      <g transform="translate(50, 73)">
        <rect x="-4" y="-7" width="8" height="3" rx="1" fill="#16a34a" stroke="#ffffff" stroke-width="0.9"/>
        <rect x="-4" y="-2" width="8" height="3" rx="1" fill="#16a34a" stroke="#ffffff" stroke-width="0.9"/>
        <rect x="-4" y="3" width="8" height="3" rx="1" fill="#16a34a" stroke="#ffffff" stroke-width="0.9"/>
      </g>
    `;
        icon = `
      <g transform="translate(30, 42)">
        <!-- Lignes d'alignement verticales -->
        <line x1="-19" y1="-32" x2="-19" y2="32" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.6"/>
        <line x1="19" y1="-32" x2="19" y2="32" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.6"/>

        <!-- Faisceau d'énergie vert vertical -->
        <rect x="-2.5" y="-28" width="5" height="56" rx="2.5" fill="#22c55e" opacity="0.9"/>
        <polygon points="0,-32 -5,-25 5,-25" fill="#ffffff" stroke="#16a34a" stroke-width="1"/>
        <polygon points="0,32 -5,25 5,25" fill="#ffffff" stroke="#16a34a" stroke-width="1"/>

        <!-- Carte 1 (Haut) -->
        <rect x="-13" y="-26" width="26" height="15" rx="3" fill="#ffffff" stroke="#16a34a" stroke-width="1.7"/>
        <rect x="-10" y="-23" width="20" height="9" rx="2" fill="#22c55e" opacity="0.3"/>
        <circle cx="0" cy="-18.5" r="2.5" fill="#16a34a"/>

        <!-- Carte 2 (Milieu - Dominante) -->
        <rect x="-15" y="-8.5" width="30" height="17" rx="3.5" fill="#ffffff" stroke="#15803d" stroke-width="2.2"/>
        <rect x="-12" y="-5.5" width="24" height="11" rx="2.5" fill="#22c55e" opacity="0.4"/>
        <polygon points="0,-4 1.5,-1 4.5,-1 2,1 3,4 0,2 -3,4 -2,1 -4.5,-1 -1.5,-1" fill="#facc15" stroke="#15803d" stroke-width="0.8"/>

        <!-- Carte 3 (Bas) -->
        <rect x="-13" y="11" width="26" height="15" rx="3" fill="#ffffff" stroke="#16a34a" stroke-width="1.7"/>
        <rect x="-10" y="14" width="20" height="9" rx="2" fill="#22c55e" opacity="0.3"/>
        <circle cx="0" cy="18.5" r="2.5" fill="#16a34a"/>
      </g>
    `;
    } else if (type === 'target') {
        cornerIcon = `
      <g transform="translate(10, 15)">
        <circle cx="0" cy="0" r="5" fill="none" stroke="#dc2626" stroke-width="1.3"/>
        <circle cx="0" cy="0" r="1.5" fill="#dc2626"/>
        <line x1="-7" y1="0" x2="7" y2="0" stroke="#ffffff" stroke-width="1"/>
        <line x1="0" y1="-7" x2="0" y2="7" stroke="#ffffff" stroke-width="1"/>
      </g>
      <g transform="translate(50, 73)">
        <circle cx="0" cy="0" r="5" fill="none" stroke="#dc2626" stroke-width="1.3"/>
        <circle cx="0" cy="0" r="1.5" fill="#dc2626"/>
        <line x1="-7" y1="0" x2="7" y2="0" stroke="#ffffff" stroke-width="1"/>
        <line x1="0" y1="-7" x2="0" y2="7" stroke="#ffffff" stroke-width="1"/>
      </g>
    `;
        icon = `
      <g transform="translate(30, 42)">
        <!-- Viseurs d'angle tactiques -->
        <path d="M-22,-20 L-22,-26 L-16,-26" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
        <path d="M22,-20 L22,-26 L16,-26" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
        <path d="M-22,20 L-22,26 L-16,26" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
        <path d="M22,20 L22,26 L16,26" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>

        <!-- Halo central -->
        <circle cx="0" cy="0" r="22" fill="#ffffff" fill-opacity="0.25"/>

        <!-- Grand anneau cible extérieur -->
        <circle cx="0" cy="0" r="18" fill="none" stroke="#dc2626" stroke-width="2.6"/>
        <circle cx="0" cy="0" r="18" fill="none" stroke="#ffffff" stroke-width="0.8" stroke-dasharray="2,2"/>

        <!-- Anneau blanc intermédiaire -->
        <circle cx="0" cy="0" r="12" fill="#ffffff" stroke="#dc2626" stroke-width="1.8"/>

        <!-- Anneau rouge intérieur -->
        <circle cx="0" cy="0" r="6.5" fill="#dc2626" stroke="#ffffff" stroke-width="1.3"/>

        <!-- Centre doré Bullseye -->
        <circle cx="0" cy="0" r="2.8" fill="#facc15" stroke="#000000" stroke-width="0.8"/>

        <!-- Réticules de visée en croix cardinaux -->
        <line x1="-24" y1="0" x2="-14" y2="0" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>
        <line x1="14" y1="0" x2="24" y2="0" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>
        <line x1="0" y1="-24" x2="0" y2="-14" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>
        <line x1="0" y1="14" x2="0" y2="24" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>

        <!-- Lignes de précision internes -->
        <line x1="-10" y1="0" x2="-4" y2="0" stroke="#dc2626" stroke-width="1.3"/>
        <line x1="4" y1="0" x2="10" y2="0" stroke="#dc2626" stroke-width="1.3"/>
        <line x1="0" y1="-10" x2="0" y2="-4" stroke="#dc2626" stroke-width="1.3"/>
        <line x1="0" y1="4" x2="0" y2="10" stroke="#dc2626" stroke-width="1.3"/>
      </g>
    `;
    }

    const content = `
    ${cornerIcon}
    ${icon}
  `;
    return baseCard(bg, border, 'rgba(255,255,255,0.45)', content);
}

/** Dos de carte Skyjo avec dégradé harmonieux traversant les 5 couleurs du jeu :
 *  Violet (-2, -1) -> Bleu (0) -> Vert (1-4) -> Jaune (5-8) -> Rouge (9-12)
 */
export const BACK = `<svg viewBox="0 0 60 84" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <!-- Dégradé diagonal passant par chaque couleur de carte de Skyjo -->
    <linearGradient id="skyjo-spectrum" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c3aed"/>   <!-- Violet (-2, -1) -->
      <stop offset="25%" stop-color="#38bdf8"/>  <!-- Bleu ciel (0) -->
      <stop offset="50%" stop-color="#16a34a"/>  <!-- Vert (1 à 4) -->
      <stop offset="75%" stop-color="#facc15"/>  <!-- Jaune (5 à 8) -->
      <stop offset="100%" stop-color="#dc2626"/> <!-- Rouge (9 à 12) -->
    </linearGradient>

    <!-- Dégradé inverse pour le losange intérieur -->
    <linearGradient id="skyjo-spectrum-rev" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#dc2626"/>
      <stop offset="25%" stop-color="#facc15"/>
      <stop offset="50%" stop-color="#16a34a"/>
      <stop offset="75%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>

    <!-- Trame géométrique subtile -->
    <pattern id="dot-lattice" width="8" height="8" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="0.9" fill="#ffffff" opacity="0.35"/>
    </pattern>
  </defs>

  <!-- Fond avec le dégradé intégral des 5 couleurs -->
  <rect x="1.5" y="1.5" width="57" height="81" rx="6" fill="url(#skyjo-spectrum)" stroke="#ffffff" stroke-width="2.5"/>
  <rect x="5" y="5" width="50" height="74" rx="4" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-opacity="0.9"/>
  <rect x="6.5" y="6.5" width="47" height="71" rx="3" fill="url(#dot-lattice)"/>

  <!-- Étoiles de coin aux 4 couleurs -->
  <circle cx="10" cy="10" r="2.2" fill="#7c3aed" stroke="#ffffff" stroke-width="0.8"/>
  <circle cx="50" cy="10" r="2.2" fill="#38bdf8" stroke="#ffffff" stroke-width="0.8"/>
  <circle cx="10" cy="74" r="2.2" fill="#16a34a" stroke="#ffffff" stroke-width="0.8"/>
  <circle cx="50" cy="74" r="2.2" fill="#dc2626" stroke="#ffffff" stroke-width="0.8"/>

  <!-- Médaillon central losange céleste -->
  <g transform="translate(30, 42)">
    <polygon points="0,-24 19,0 0,24 -19,0" fill="url(#skyjo-spectrum-rev)" stroke="#ffffff" stroke-width="1.8"/>
    <polygon points="0,-16 12,0 0,16 -12,0" fill="#ffffff" fill-opacity="0.22" stroke="#ffffff" stroke-width="1"/>
    
    <!-- Anneau et cœur multi-couleur -->
    <circle cx="0" cy="0" r="7.5" fill="#ffffff" stroke="#facc15" stroke-width="1.4"/>
    <circle cx="0" cy="0" r="5" fill="url(#skyjo-spectrum)"/>
    <circle cx="0" cy="0" r="2" fill="#ffffff"/>

    <!-- Rayons dorés cardinaux -->
    <line x1="0" y1="-28" x2="0" y2="-25" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="0" y1="25" x2="0" y2="28" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="-23" y1="0" x2="-20" y2="0" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="20" y1="0" x2="23" y2="0" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
  </g>
</svg>`;
