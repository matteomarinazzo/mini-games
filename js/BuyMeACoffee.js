export function showBMC() {
    if (document.getElementById("bmc-wgt-main") || document.getElementById("bmc-script")) return;
    if (!navigator.onLine) return;

    let message = getRandomMessage();

    const bmcScript = document.createElement("script");
    bmcScript.id = "bmc-script";

    bmcScript.setAttribute("data-name", "BMC-Widget");
    bmcScript.setAttribute("data-cfasync", "false");
    bmcScript.setAttribute("data-id", "minigames");
    bmcScript.setAttribute("data-description", "Support me on Buy me a coffee!");
    bmcScript.setAttribute("data-message", message);
    bmcScript.setAttribute("data-color", getBMCColor());
    bmcScript.setAttribute("data-position", "Right");
    bmcScript.setAttribute("data-x_margin", "18");
    bmcScript.setAttribute("data-y_margin", "18");
    bmcScript.async = true;

    bmcScript.onload = function () {
        setTimeout(() => {
            if (typeof window.BMCWidget !== "undefined") {
                window.BMCWidget.init?.();
                return;
            }
            const evt = new Event("DOMContentLoaded", { bubbles: true, cancelable: true });
            document.dispatchEvent(evt);
        }, 100);
    };

    bmcScript.onerror = function () {
        console.warn("☕ BMC : échec de chargement (offline ?)");
        bmcScript.src = "";
        bmcScript.remove();
    };

    document.head.appendChild(bmcScript);
    bmcScript.src = "https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js";
    console.log("☕ BMC injecté");
}

export function hideBMC() {
    const script = document.getElementById("bmc-script");
    if (script) {
        script.src = "";
        script.onload = null;
        script.onerror = null;
        script.remove();
    }

    document.querySelectorAll("[id^='bmc']").forEach(el => el.remove());
}

let _currentMessage = null;

function getRandomMessage() {
    if (_currentMessage) return _currentMessage;
    const messages = [
        "Un café pour moi = plus de jeux pour toi ! ☕🎮",

        "Objectif : 100 jeux ! Aide-moi avec un petit café ☕🚀",
        "Un café = une nouvelle fonctionnalité débloquée ! ☕🔓",
        "Le carburant officiel pour coder de nouveaux jeux ☕⚡",
        "Soutiens le dev, on approche du prochain gros jeu ! ☕🔥",

        "Insère un café pour continuer à jouer ! 🪙☕",
        "Level Up ! Offre un café pour améliorer la plateforme ☕🎮",
        "Appuie sur 🥤 pour envoyer du soutien (et de la caféine) !",
        "Le mode 'Nuit Blanche' nécessite du café. Tu m'aides ? ☕🌙",

        "Si tu as battu ton record, ça mérite bien un café, non ? ☕🏆",
        "Pas de pub, juste du fun. Un petit café pour soutenir ? ☕❤️",
        "Coder des bugs, c'est gratuit. Les réparer, ça demande du café ! ☕🛠️",
        "Offre-moi un café et je code le prochain jeu encore plus vite ! ☕💨",

        "Ton soutien m'aide à maintenir le site et à ajouter des jeux ! ☕✨",
        "Un café, c'est 3 minutes de bonheur. Un jeu, c'est des heures de fun ! ☕🎮",
    ];
    _currentMessage = messages[Math.floor(Math.random() * messages.length)];
    return _currentMessage;
}

// Couleurs BMC par thème (correspondent aux --primary de chaque thème)
const BMC_COLORS = {
    default: '#7259b5', // --secondary default
    sunset: '#f093fb', // --secondary sunset  
    ocean: '#00f2fe', // --secondary ocean
    forest: '#38f9d7', // --secondary forest
    fire: '#f7971e', // --secondary fire (orange, coin bas-droit)
    dark: '#4a4a5a', // --secondary dark (très sombre)
    cyberpunk: '#00ffff',
    lavender: '#fbc2eb',
    midnight: '#414345',
};

export function updateBMCTheme(themeName) {
    const color = BMC_COLORS[themeName] || BMC_COLORS.default;

    // Si le widget est déjà là, on le recharge avec la nouvelle couleur
    const bmcBtn = document.getElementById('bmc-wgt-main');
    const bmcScript = document.getElementById('bmc-script');

    if (bmcBtn || bmcScript) {
        // Détruire proprement
        hideBMC();

        // Réinjecter après un court délai (laisser le DOM se nettoyer)
        setTimeout(() => showBMC(), 100);
    }
    // Si le widget n'est pas encore chargé, getBMCColor() lira la bonne clé au moment de showBMC()
}

function getBMCColor() {
    const theme = localStorage.getItem('mg_theme') || 'default';
    return BMC_COLORS[theme] || BMC_COLORS.default;
}

export { BMC_COLORS }