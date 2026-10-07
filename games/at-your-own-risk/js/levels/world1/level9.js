// ============================================================
// NIVEAU 9 : « Le Retour »
// ------------------------------------------------------------
// Phase 1 (aller)  : trou invisible + 2 piques camouflées. Le portail
//                    à droite se téléporte au 1er contact.
// Phase 2 (retour) : le sol s'effondre depuis la droite (VITESSE_EFFONDREMENT),
//                    et les piques réapparaissent là où on atterrissait à l'aller.
// Phase 3 (fin)    : une dernière pique devant le vrai portail, à gauche.
// Les piques n'ont pas de `d` : elles sont beiges, donc invisibles sur la pièce.
// ============================================================

const BEIGE = '#feb854';   // pièce + piques camouflées
const BRUN = '#996b07';    // fond du niveau

// --- Réglages de difficulté ---------------------------------
const VITESSE_EFFONDREMENT = 2.2;  // px/frame (le joueur va à 3 px/frame)
const SOL_Y = 400;                 // hauteur du sol
const PORTAIL_DROITE_X = 720;      // portail de la phase 1
const PORTAIL_GAUCHE_X = 100;      // vrai portail (phase 2)

// Petite fabrique de pique camouflée posée sur le sol (cachée par défaut)
const pique = (id, x) => ({
  id: id, k: 'spike',
  x: x, y: SOL_Y - 10, w: 25, h: 10,
  on: false,
  d: true
});

export default {
  name: 'Niveau 9',
  start: { x: 200, y: SOL_Y - 32 },
  bounds: [94, 750],
  bg: BRUN,

  build: () => ({

    ents: [
      // Décor et sol
      { id: 'room', k: 'deco', x: 100, y: 300, w: 680, h: 100, c: BEIGE },
      { id: 'floor', k: 'floor', x: 100, y: SOL_Y, w: 680, h: 1 },

      // Phase 1 : trou (visible seulement sous la pièce, comme au niveau 1)
      { id: 'g1', k: 'gap', x: 300, y: SOL_Y, w: 50, h: 200, c: BEIGE, on: false },

      // Phase 2 : effondrement. Le "trou" couvre toute la pièce à droite du
      // front x, et sa couleur (brun) fait disparaître la pièce.
      { id: 'g2', k: 'gap', x: 800, y: 300, w: 1000, h: 300, c: BRUN, on: false },

      // Piques de l'aller
      pique('a', 470),
      pique('b', 540),

      // Piques du retour (aux endroits d'atterrissage de l'aller)
      pique('a2', 512),
      pique('b2', 330),

      // Pique finale, devant le vrai portail
      pique('fin', 160)
    ],

    portal: { x: PORTAIL_DROITE_X, y: SOL_Y - 30, w: 30, h: 30 },

    rules: [
      // ----- Phase 1 : l'aller -----
      {
        if: s => s.p.x >= 240,
        do: s =>
          s.E.g1.on = true
      },   // le trou s'ouvre
      {
        if: s => s.p.x >= 420,
        do: s =>
          s.E.a.on = true
      },    // 1re pique
      {
        if: s => s.p.x >= 500,
        do: s =>
          s.E.b.on = true
      },    // 2e pique

      // ----- Phase 2 : le retour -----
      // Le front d'effondrement avance vers la gauche à chaque frame.
      {
        once: false,
        if: s => s.f.ph,
        do: s => {
          s.E.g2.on = true;
          s.E.g2.x -= VITESSE_EFFONDREMENT;
        }
      },

      // ----- Phase 3 : la fin -----
      {
        if: s => s.f.ph && s.p.x <= 260,
        do: s =>
          s.E.fin.on = true
      }
    ],

    // Premier contact avec le portail : on lance la phase 2.
    // Retourner true = contact absorbé (le niveau n'est pas fini).
    onPortal(s) {
      if (s.f.ph) return false;    // 2e contact : vrai portail, niveau réussi

      s.f.ph = 1;
      s.portal.x = PORTAIL_GAUCHE_X;   // le portail se téléporte à gauche
      s.E.g1.on = false;               // le trou de l'aller est rebouché
      s.E.a.on = false;                // les piques de l'aller disparaissent...
      s.E.b.on = false;
      s.E.a2.on = true;                // ...celles du retour apparaissent
      s.E.b2.on = true;
      return true;
    }
  })
};