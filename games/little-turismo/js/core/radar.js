// Radar de proximité (Minimap de proximité) inspiré de Le Mans Ultimate / Assetto Corsa Competizione
// Spécifications :
// - Repère centré sur la voiture du joueur, orienté vers l'avant (haut du canvas = avant du véhicule).
// - Échelle 100% linéaire et fidèle au jeu : dimensions des rectangles basées directement sur la boîte
//   de collision physique du moteur de jeu (HL = 2.25 m, HW = 0.93 m).
// - Rapport de taille et distances strictement cohérent : les rectangles ne se chevauchent que si les
//   voitures se touchent réellement en piste dans la physique.
// - Découpe circulaire stricte (ctx.clip) : tout rectangle qui dépasse de la minimap est proprement tronqué.
// - Performance : 0 allocation par frame, fond pré-rendu sur baseCanvas.

export const RADAR_RANGE = 12; // Rayon de visibilité en mètres (échelle fidèle et lisible)
const RADAR_RANGE_SQ = RADAR_RANGE * RADAR_RANGE;
const CRITICAL_DIST = 4.8;     // Distance d'alerte critique contact / pare-chocs (mètres)
const CRITICAL_DIST_SQ = CRITICAL_DIST * CRITICAL_DIST;

// Dimensions de la boîte de collision physique (issues de ai.js : collide())
const CAR_HL_M = 2.25; // Demi-longueur (longueur totale 4.5 m)
const CAR_HW_M = 0.93; // Demi-largeur (largeur totale 1.86 m)

export function createRadar(cv) {
  if (!cv) return { draw() {} };

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W0 = 136, H0 = 136;
  const W = Math.round(W0 * dpr), H = Math.round(H0 * dpr);
  cv.width = W; cv.height = H;
  cv.style.width = W0 + 'px'; cv.style.height = H0 + 'px';

  const ctx = cv.getContext('2d');
  const cx = W * 0.5, cy = H * 0.5;
  const radius = cx - 4 * dpr;
  const scale = radius / RADAR_RANGE; // pixels par mètre (échelle unique et fidèle)

  // Dimensions des rectangles des voitures (strictement proportionnelles à l'échelle physique)
  const carHalfL = CAR_HL_M * scale;
  const carHalfW = CAR_HW_M * scale;
  const carLen = carHalfL * 2;
  const carWid = carHalfW * 2;

  // Pré-rendu du fond du radar sur un canvas hors-écran (0 allocation par frame)
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = W; baseCanvas.height = H;
  const b = baseCanvas.getContext('2d');

  // 1. Fond circulaire teinté
  b.fillStyle = 'rgba(8, 12, 22, 0.74)';
  b.beginPath();
  b.arc(cx, cy, radius, 0, Math.PI * 2);
  b.fill();

  // 2. Anneau intérieur d'alerte contact (zone 4.8 m, distance d'alerte)
  b.setLineDash([2 * dpr, 2.5 * dpr]);
  b.lineWidth = 0.8 * dpr;
  b.strokeStyle = 'rgba(239, 68, 68, 0.35)'; // rouge translucide alerte
  b.beginPath();
  b.arc(cx, cy, CRITICAL_DIST * scale, 0, Math.PI * 2);
  b.stroke();

  // 3. Anneau intermédiaire (zone 8 m)
  b.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  b.beginPath();
  b.arc(cx, cy, 8 * scale, 0, Math.PI * 2);
  b.stroke();
  b.setLineDash([]); // Reset dash

  // 4. Réticule / axes de visée (axe vertical avant-arrière et axe horizontal)
  b.lineWidth = 0.8 * dpr;
  b.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  b.beginPath();
  b.moveTo(cx, cy - radius + 3 * dpr);
  b.lineTo(cx, cy + radius - 3 * dpr);
  b.moveTo(cx - radius + 3 * dpr, cy);
  b.lineTo(cx + radius - 3 * dpr, cy);
  b.stroke();

  // 5. Repères diagonaux discrets d'angle mort à 45°
  b.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  b.lineWidth = 0.6 * dpr;
  b.beginPath();
  b.moveTo(cx - radius * 0.7, cy - radius * 0.7);
  b.lineTo(cx + radius * 0.7, cy + radius * 0.7);
  b.moveTo(cx - radius * 0.7, cy + radius * 0.7);
  b.lineTo(cx + radius * 0.7, cy - radius * 0.7);
  b.stroke();

  // 6. Indicateur avant discret ("▲" en haut)
  b.fillStyle = 'rgba(255, 255, 255, 0.55)';
  b.font = `bold ${Math.round(8 * dpr)}px system-ui, sans-serif`;
  b.textAlign = 'center';
  b.textBaseline = 'top';
  b.fillText('▲', cx, 3 * dpr);

  return {
    draw(me, cars) {
      if (!me) return;

      // 1. Restauration instantanée du fond pré-rendu
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(baseCanvas, 0, 0);

      const meX = me.x, meZ = me.z, mePsi = me.psi || 0;
      const cosPsi = Math.cos(mePsi), sinPsi = Math.sin(mePsi);

      // 2. Découpe circulaire stricte : tout rectangle qui dépasse est tronqué aux limites du cercle !
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      // ── Rendu des voitures adverses à proximité ──
      const nCars = cars ? cars.length : 0;
      for (let i = 0; i < nCars; i++) {
        const c = cars[i];
        if (!c) continue;
        const p = c.ph || c;
        if (!p || p === me) continue;
        const isAiGone = !c.humanUid && (p.gone || p.raceFinished || c.entry?.dnf || c.ai?.engine?.failed);
        if (p.gone || isAiGone) continue;

        const dx = p.x - meX;
        const dz = p.z - meZ;
        const distSq = dx * dx + dz * dz;

        // Hors de portée du radar : ignorée (0 allocation, calcul immédiat)
        if (distSq > RADAR_RANGE_SQ || distSq < 0.01) continue;

        // Projection dans le repère orienté du joueur (strictement linéaire, fidèle à la physique)
        // fwd > 0 : devant le joueur ; fwd < 0 : derrière
        // lat > 0 : à droite du joueur ; lat < 0 : à gauche
        const fwd = dx * cosPsi + dz * sinPsi;
        const lat = -dx * sinPsi + dz * cosPsi;

        // Position écran exacte
        const scrX = cx + lat * scale;
        const scrY = cy - fwd * scale;

        // Cap relatif de la voiture par rapport au joueur
        const rawRel = (p.psi || 0) - mePsi;
        const relPsi = Math.atan2(Math.sin(rawRel), Math.cos(rawRel));

        const isCritical = distSq < CRITICAL_DIST_SQ;

        ctx.save();
        ctx.translate(scrX, scrY);
        ctx.rotate(relPsi);

        // Rectangle représentant la voiture adverse (proportions fidèles aux collisions réelles)
        if (isCritical) {
          // Proximité critique : rouge vif + contour blanc
          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.3 * dpr;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(-carHalfW, -carHalfL, carWid, carLen, 1.8 * dpr) : ctx.rect(-carHalfW, -carHalfL, carWid, carLen);
          ctx.fill();
          ctx.stroke();

          // Phares avant blancs vifs pour identifier le sens du véhicule
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-carHalfW + 1 * dpr, -carHalfL, carWid - 2 * dpr, 2 * dpr);
        } else {
          // Distance normale : ambre/orange vif LMU
          ctx.fillStyle = '#f97316';
          ctx.strokeStyle = '#0a0d16';
          ctx.lineWidth = 1.1 * dpr;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(-carHalfW, -carHalfL, carWid, carLen, 1.8 * dpr) : ctx.rect(-carHalfW, -carHalfL, carWid, carLen);
          ctx.fill();
          ctx.stroke();

          // Phares avant jaunes vifs
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(-carHalfW + 1 * dpr, -carHalfL, carWid - 2 * dpr, 1.8 * dpr);
        }

        ctx.restore();
      }

      // ── Rendu de la voiture du joueur au centre ──
      ctx.save();
      ctx.translate(cx, cy);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#050811';
      ctx.lineWidth = 1.3 * dpr;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-carHalfW, -carHalfL, carWid, carLen, 1.8 * dpr) : ctx.rect(-carHalfW, -carHalfL, carWid, carLen);
      ctx.fill();
      ctx.stroke();

      // Phares avant cyan vif (direction de marche)
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-carHalfW + 1 * dpr, -carHalfL, carWid - 2 * dpr, 2 * dpr);

      ctx.restore();

      // 3. Fin du masque de découpe circulaire
      ctx.restore();

      // 4. Bordure extérieure nette dessinée par-dessus (finition impeccable sur les bords tronqués)
      ctx.lineWidth = 1.3 * dpr;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
}
