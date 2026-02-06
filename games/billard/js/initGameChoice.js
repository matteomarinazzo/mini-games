/**
 * Clic sur un type de jeu (american, 9-ball, 15-ball) → redirection vers game.html?mode=...
 */
document.addEventListener("DOMContentLoaded", () => {
  const gameTypes = document.querySelectorAll("#gamesType .game-type");

  // Ajouter les descriptions et boutons règles
  const gameDescriptions = {
    american: {
      title: "Billard Américain (8-ball)",
      description:
        "Le classique. Jouez les pleines (1-7) ou les rayées (9-15), puis la noire (8).",
      rules:
        "15 billes, chaque joueur a un type, faut empoquer ses billes puis la 8",
    },
    "9-ball": {
      title: "9-Ball",
      description:
        "Rapide et technique. Empoquez les billes dans l'ordre, terminez par la 9.",
      rules: "9 billes, toujours toucher la plus basse, la 9 termine la partie",
    },
    "15-ball": {
      title: "15-Ball (Straight Pool)",
      description:
        "Chaque bille vaut 1 point. Atteignez le score cible le premier.",
      rules: "Toutes les billes valent 1 point, aucun ordre requis",
    },
  };

  gameTypes.forEach((el) => {
    const mode = el.getAttribute("data-game");
    const info = gameDescriptions[mode];

    if (info) {
      const title = el.querySelector(".game-title");
      const desc = el.querySelector(".game-description");
      const rules = el.querySelector(".game-rules");

      if (title) title.textContent = info.title;
      if (desc) desc.textContent = info.description;

      if (rules) {
        rules.innerHTML = `<button class="rules-btn" data-game="${mode}">📋 Règles</button>`;
      }
    }

    // Clic sur la carte du jeu
    el.addEventListener("click", (e) => {
      // Ne pas rediriger si on clique sur le bouton règles
      if (e.target.classList.contains("rules-btn")) {
        e.stopPropagation();
        showRules(mode);
        return;
      }

      // Sauvegarder le mode dans localStorage pour game.html
      localStorage.setItem("billiardGameMode", mode);

      // Ajouter un effet visuel avant la redirection
      el.style.transform = "scale(0.95)";
      el.style.boxShadow = "0 0 30px rgba(255, 215, 0, 0.7)";

      setTimeout(() => {
        window.location.href = `./game.html`;
      }, 300);
    });
  });

  // Gestion du bouton retour dans les paramètres
  const cancelBtn = document.getElementById("cancelBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      const menuParams = document.getElementById("menuParams");
      if (menuParams) {
        menuParams.style.display = "none";
      }
    });
  }

  // Gestion du bouton accueil
  const homeBtn = document.getElementById("homeBtn");
  if (homeBtn) {
    homeBtn.addEventListener("click", () => {
      window.location.href = "../../index.html";
    });
  }
});

function showRules(gameMode) {
  const rules = {
    american: `
      <h3>🎱 Billard Américain (8-ball)</h3>
      <p><strong>Objectif :</strong> Être le premier à empoquer toutes vos billes puis la bille 8.</p>
      <ul>
        <li>15 billes : 1-7 (pleines), 8 (noire), 9-15 (rayées)</li>
        <li>Au début, chaque joueur est assigné un type (pleines ou rayées)</li>
        <li>Vous devez empoquer toutes vos billes avant de pouvoir viser la 8</li>
        <li>La 8 doit être empochée dans la poche appelée</li>
        <li><strong>Fautes :</strong> Empochage de la blanche, 8 empochée trop tôt, mauvaise bille touchée en premier</li>
      </ul>
    `,
    "9-ball": `
      <h3>9️⃣ 9-Ball</h3>
      <p><strong>Objectif :</strong> Empocher la bille 9 légalement.</p>
      <ul>
        <li>9 billes numérotées de 1 à 9</li>
        <li>Les billes doivent être touchées dans l'ordre numérique (toujours la plus basse d'abord)</li>
        <li>Si vous empochez une bille après avoir touché la bonne en premier, vous continuez</li>
        <li>La partie est gagnée immédiatement si la 9 est empochée légalement</li>
        <li><strong>Fautes :</strong> Ne pas toucher la bille la plus basse, empochage de la blanche</li>
      </ul>
    `,
    "15-ball": `
      <h3>15️⃣ 15-Ball (Straight Pool)</h3>
      <p><strong>Objectif :</strong> Atteindre le score cible le premier (généralement 100 points).</p>
      <ul>
        <li>Toutes les billes valent 1 point</li>
        <li>Aucun ordre n'est requis - vous pouvez viser n'importe quelle bille</li>
        <li>Après avoir empoché une bille, vous continuez de jouer</li>
        <li>Les billes empochées sont replacées sur la table (pas implémenté ici)</li>
        <li><strong>Fautes :</strong> Empochage de la blanche - l'adversaire reçoit 1 point</li>
      </ul>
    `,
  };

  const modal = document.createElement("div");
  modal.className = "rules-modal";
  modal.innerHTML = `
    <div class="rules-content">
      ${rules[gameMode] || "<p>Règles non disponibles</p>"}
      <button class="close-rules">Fermer</button>
    </div>
  `;

  document.body.appendChild(modal);

  // Fermer en cliquant sur le bouton
  modal.querySelector(".close-rules").addEventListener("click", () => {
    modal.remove();
  });

  // Fermer en cliquant en dehors
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Ajouter le CSS pour le modal des règles
const style = document.createElement("style");
style.textContent = `
  .rules-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
  }
  
  .rules-content {
    background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
    border: 4px solid var(--wood-brown);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: var(--shadow-lg);
    animation: slideUp 0.3s ease;
  }
  
  .rules-content h3 {
    color: var(--wood-brown);
    margin-bottom: var(--space-md);
    text-align: center;
    border-bottom: 3px solid var(--felt-green);
    padding-bottom: var(--space-sm);
  }
  
  .rules-content p {
    margin-bottom: var(--space-md);
    line-height: 1.6;
    color: var(--darker-gray);
  }
  
  .rules-content ul {
    margin-left: var(--space-lg);
    margin-bottom: var(--space-xl);
  }
  
  .rules-content li {
    margin-bottom: var(--space-sm);
    line-height: 1.5;
  }
  
  .close-rules {
    display: block;
    margin: 0 auto;
    background: linear-gradient(135deg, var(--felt-green) 0%, var(--primary-dark) 100%);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-xl);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition);
  }
  
  .close-rules:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-green);
  }
  
  .rules-btn {
    background: rgba(255, 255, 255, 0.2);
    border: 2px solid var(--accent-gold);
    color: var(--wood-brown);
    border-radius: var(--radius-md);
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition);
    margin-top: var(--space-sm);
  }
  
  .rules-btn:hover {
    background: var(--accent-gold);
    color: var(--ball-black);
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  
  @media (max-aspect-ratio: 1/1) {
    .rules-content {
      padding: var(--space-lg);
      width: 95%;
    }
  }
`;
document.head.appendChild(style);
