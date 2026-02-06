// pattern herbe fixe avec brins
// pattern herbe amélioré (texture plus organique)
// Pattern herbe réaliste avec terre et nuances sombres
// Pattern herbe lumineuse avec détails de terre
// Pattern herbe "Entre-deux" : Équilibré et organique
export function createGrassPattern(ctx) {
  const size = 8;
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = patternCanvas.height = size;
  const pctx = patternCanvas.getContext("2d");

  // 1. Fond : Vert Forêt moyen (ni trop sombre, ni trop flashy)
  pctx.fillStyle = "#567d46"; 
  pctx.fillRect(0, 0, size, size);

  // 2. Taches de Terre subtiles (mélange de brun et de terre cuite)
  for (let i = 0; i < 4; i++) {
    pctx.fillStyle = "rgba(80, 50, 20, 0.35)";
    const x = Math.random() * size;
    const y = Math.random() * size;
    pctx.beginPath();
    pctx.ellipse(x, y, 5, 3, Math.random() * Math.PI, 0, Math.PI * 2);
    pctx.fill();
  }

  // 3. Nuances de vert moyen (pour donner de la texture au sol)
  for (let i = 0; i < 12; i++) {
    pctx.fillStyle = "rgba(40, 90, 30, 0.4)";
    pctx.fillRect(Math.random() * size, Math.random() * size, 6, 4);
  }

  // 4. Brins d'herbe : Le "Vert Clair" équilibré
  // On utilise un vert "Herbe coupée" qui flashe juste assez
  for (let i = 0; i < 35; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const height = 2 + Math.random() * 3;

    // Couleur : Vert Pomme / Chartreuse (lumineux mais naturel)
    const gShade = 160 + Math.floor(Math.random() * 50);
    pctx.strokeStyle = `rgb(90, ${gShade}, 40)`;
    pctx.lineWidth = 1;

    pctx.beginPath();
    pctx.moveTo(x, y);
    pctx.lineTo(x + (Math.random() - 0.5) * 2, y - height);
    pctx.stroke();
    
    // Petite touche de lumière sur le sommet du brin
    pctx.fillStyle = `rgba(200, 255, 100, 0.3)`;
    pctx.fillRect(x, y - height, 1, 1);
  }

  // 5. Quelques ombres portées sous les touffes
  for (let i = 0; i < 10; i++) {
    pctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    pctx.fillRect(Math.random() * size, Math.random() * size, 2, 1);
  }

  return ctx.createPattern(patternCanvas, "repeat");
}

// texture neige
export function createSnowPattern(cols, rows, tileSize) {
  const buffer = document.createElement("canvas");
  buffer.width = cols * tileSize;
  buffer.height = rows * tileSize;
  const bctx = buffer.getContext("2d");

  // 1. Fond de base blanc pur
  bctx.fillStyle = "#ffffff";
  bctx.fillRect(0, 0, buffer.width, buffer.height);

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const posX = x * tileSize;
      const posY = y * tileSize;

      // 2. Légères nuances de bleu/gris très claires (opacité faible)
      // Cela crée du relief sans assombrir le dessin
      if (Math.random() > 0.7) {
        bctx.fillStyle = `rgba(230, 245, 255, ${Math.random() * 0.5})`;
        bctx.fillRect(posX, posY, tileSize, tileSize);
      }

      // 3. Effet "Scintillement" (petits points de lumière)
      // On ajoute quelques pixels très brillants pour l'aspect neige fraîche
      if (Math.random() > 0.95) {
        bctx.fillStyle = "#ffffff";
        const size = Math.random() * 2;
        // Ombre légère pour faire ressortir le point blanc
        bctx.shadowBlur = 2;
        bctx.shadowColor = "rgba(0, 0, 0, 0.1)";
        bctx.fillRect(
          posX + Math.random() * tileSize, 
          posY + Math.random() * tileSize, 
          size, 
          size
        );
        bctx.shadowBlur = 0; // On réinitialise pour ne pas ralentir le reste
      }
    }
  }
  return buffer;
}