/** Illustrations SVG des pneus : gomme, bande de couleur du composé, jante et anneau d'usure. Sans dépendance. */

/** Couleurs utilisées pour les graphiques et les pastilles (identiques à race.css). */
export const TYRE_COLORS = Object.freeze({
  soft: '#ff4d4d',
  medium: '#ffd633',
  hard: '#ffffff',
  intermediate: '#2ecc71',
  wet: '#0059b3',
});

/** Couleur de la bande sur le flanc : le bleu « wet » est éclairci pour rester lisible sur la gomme sombre. */
const BAND_COLORS = Object.freeze({ ...TYRE_COLORS, hard: '#f4f6fa', wet: '#2f8cff' });
const LETTERS = Object.freeze({ soft: 'S', medium: 'M', hard: 'H', intermediate: 'I', wet: 'W' });

let uid = 0;

/** Couleur de l'anneau d'usure : vert (sain), jaune (à surveiller), rouge (sous le seuil de crevaison). */
export function wearColor(wear) {
  return wear >= 50 ? '#45d99a' : wear >= 30 ? '#ffc21a' : '#ff6b70';
}

/**
 * Renvoie un élément <svg> représentant un pneu vu de face.
 * @param {string} compound  soft | medium | hard | intermediate | wet
 * @param {{ size?: number, wear?: number|null }} options  `wear` (0–100) ajoute l'anneau d'usure autour du pneu.
 */
export function tyreSvg(compound, { size = 96, wear = null } = {}) {
  const id = `tyre${++uid}`;
  const band = BAND_COLORS[compound] || '#cccccc';
  const letter = LETTERS[compound] || '?';

  // Sculptures : lisse pour les slicks, rainures pour l'intermédiaire, rainures profondes pour la pluie.
  const grooves = [];
  if (compound === 'intermediate' || compound === 'wet') {
    const count = compound === 'wet' ? 28 : 24;
    const length = compound === 'wet' ? 9 : 6;
    for (let i = 0; i < count; i++) {
      grooves.push(`<rect x="-1.6" y="-46" width="3.2" height="${length}" rx="1" transform="rotate(${((360 / count) * i).toFixed(2)})"/>`);
    }
  } else {
    for (let i = 0; i < 36; i++) {
      grooves.push(`<rect x="-1" y="-46" width="2" height="2.6" rx=".6" transform="rotate(${i * 10})"/>`);
    }
  }

  const spokes = [];
  for (let i = 0; i < 5; i++) spokes.push(`<line x1="0" y1="-7" x2="0" y2="-19" transform="rotate(${i * 72})"/>`);

  let ring = '';
  if (wear != null) {
    const pct = Math.max(0, Math.min(100, Number(wear) || 0)) / 100;
    const circumference = 2 * Math.PI * 55;
    ring = `
      <circle cx="60" cy="60" r="55" fill="none" stroke="#2b3648" stroke-width="5"/>
      <circle cx="60" cy="60" r="55" fill="none" stroke="${wearColor(pct * 100)}" stroke-width="5" stroke-linecap="round"
        stroke-dasharray="${(circumference * pct).toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 60 60)"/>`;
  }

  const markup = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}" class="tyre-svg" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="${id}-rubber" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#2d3441"/><stop offset="1" stop-color="#10131a"/></radialGradient>
        <radialGradient id="${id}-rim" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#dfe5ef"/><stop offset="1" stop-color="#6b7587"/></radialGradient>
      </defs>
      ${ring}
      <g transform="translate(60 60)">
        <circle r="46" fill="url(#${id}-rubber)" stroke="#05070b" stroke-width="1.5"/>
        <g fill="#05070b">${grooves.join('')}</g>
        <circle r="40" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="1.5"/>
        <circle r="33" fill="none" stroke="${band}" stroke-width="6"/>
        <circle r="29.5" fill="#1a1f29"/>
        <circle r="22" fill="url(#${id}-rim)" stroke="#05070b" stroke-width="2"/>
        <g stroke="#2a303c" stroke-width="5" stroke-linecap="round">${spokes.join('')}</g>
        <circle r="9" fill="#0b0f16" stroke="${band}" stroke-width="2"/>
        <text y=".5" fill="${band}" font-family="system-ui, sans-serif" font-size="11" font-weight="800" text-anchor="middle" dominant-baseline="central">${letter}</text>
        <path d="M -37 -21 A 42 42 0 0 1 -8 -41" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>`;

  const wrap = document.createElement('div');
  wrap.innerHTML = markup.trim();
  return wrap.firstElementChild;
}
