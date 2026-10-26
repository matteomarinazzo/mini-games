// Rendu des symboles : X et O dessinés en SVG ; autres symboles (emoji) et images personnalisées inchangés.
const X = new Set(["✖️", "✖", "❌", "❎"]);
const svg = (inner, cls) =>
  `<svg class="g ${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

export function glyphKind(sym) {
  return X.has(sym) ? "x" : sym === "⭕" ? "o" : null;
}

/** HTML du symbole du joueur n (1 ou 2). */
export function glyphHTML(p, n) {
  if (p && p.isCustom && p.customImage) return `<img class="gi" src="${p.customImage}" alt="">`;
  const k = glyphKind(p && p.symbol);
  if (k === "x") return svg('<path pathLength="1" d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', `x p${n}`);
  if (k === "o") return svg('<circle pathLength="1" cx="12" cy="12" r="6.6"/>', `o p${n}`);
  return `<span class="gi emo">${p ? p.symbol : ""}</span>`;
}
