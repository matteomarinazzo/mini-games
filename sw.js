const CACHE_NAME = "mini-games-cache-v1.9.2026-03-21";

const ASSETS_TO_CACHE = [
    '',              // Racine
    'index.html',
    'style.css',
    'rating-modal.css',
    'manifest.json',
    'fonts.css',

    // firebase
    'https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js',
    'https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js',

    // Fonts locales
    'assets/fonts/poppins-v24-latin-regular.woff2',
    'assets/fonts/poppins-v24-latin-600.woff2',
    'assets/fonts/poppins-v24-latin-700.woff2',
    'assets/fonts/poppins-v24-latin-800.woff2',

    // JS racine
    'js/main.js',
    'js/rating-system.js',
    'js/countPlayedTime.js',
    'js/fullScreen.js',
    'js/firebaseWrk.js',
    'js/config/firebase-config.js',
    'js/utils/formatNumber.js',
    'js/app.js',
    'js/network.js',
    'js/BuyMeACoffee.js',

    // Assets data
    'assets/data/games.json',
    'assets/data/versions.json',

    // Assets logos
    'assets/logos/logo.png',
    'assets/logos/logo-512.png',
    'assets/logos/logo-192.png',
    'assets/logos/favicon.png',

    'assets/logos/ball-sort.webp',
    'assets/logos/casino.webp',
    'assets/logos/casse-briques.webp',
    'assets/logos/funfair.webp',
    'assets/logos/morpion.webp',
    'assets/logos/pong.webp',
    'assets/logos/snow-digger.webp',
    'assets/logos/lostBelow.webp',
    'assets/logos/block-puzzle.webp',
    'assets/logos/battleship.webp',
    'assets/logos/layer-pile.webp',
    'assets/logos/draw-guess.webp',
    'assets/logos/falling-blocks.webp',

    // About
    'about/about.html',
    'about/about.css',
    'about/about.js',

    'games/offline.html',

    // Game: ball-sort
    'games/ball-sort/index.html',
    'games/ball-sort/game.html',
    'games/ball-sort/css/style.css',
    'games/ball-sort/css/game.css',
    'games/ball-sort/js/menu.js',
    'games/ball-sort/js/game.js',

    // Game: casino
    'games/casino/index.html',
    'games/casino/game.html',
    'games/casino/css/style.css',
    'games/casino/css/game.css',
    'games/casino/js/menu.js',
    'games/casino/js/game.js',

    // Game: casse-briques
    'games/casse-briques/index.html',
    'games/casse-briques/game.html',
    'games/casse-briques/css/style.css',
    'games/casse-briques/css/game.css',
    'games/casse-briques/js/menu.js',
    'games/casse-briques/js/game.js',
    'games/casse-briques/js/common.js',

    // Game: funfair
    'games/funfair/index.html',
    'games/funfair/game.html',
    'games/funfair/css/style.css',
    'games/funfair/css/game.css',
    'games/funfair/js/menu.js',
    'games/funfair/js/game.js',

    // Game: morpion
    'games/morpion/index.html',
    'games/morpion/views/standard3x3.html',
    'games/morpion/views/big5x5.html',
    'games/morpion/views/ultimate.html',
    'games/morpion/css/style.css',
    'games/morpion/css/3x3.css',
    'games/morpion/css/5x5.css',
    'games/morpion/css/ultimate.css',
    'games/morpion/js/ctrl/mainCtrl.js',
    'games/morpion/js/ctrl/symbolsChoiceCtrl.js',
    'games/morpion/js/modes/standard3x3.js',
    'games/morpion/js/modes/big5x5.js',
    'games/morpion/js/modes/ultimate.js',
    'games/morpion/js/ai/standard3x3AI.js',
    'games/morpion/js/ai/big5x5AI.js',
    'games/morpion/js/ai/ultimateAI.js',
    'games/morpion/js/ui/menuInGame.js',
    'games/morpion/js/ui/menuParams.js',
    'games/morpion/js/utils/shared-config.js',

    // Game: Block Puzzle
    'games/block-puzzle/index.html',
    'games/block-puzzle/game.html',
    'games/block-puzzle/lobby.html',
    'games/block-puzzle/room.html',
    'games/block-puzzle/css/style.css',
    'games/block-puzzle/css/game.css',
    'games/block-puzzle/js/menu.js',
    'games/block-puzzle/js/game.js',
    'games/block-puzzle/js/lobby.js',
    'games/block-puzzle/js/room.js',

    // Game: battleship
    'games/battleship/index.html',
    'games/battleship/game.html',
    'games/battleship/room.html',
    'games/battleship/css/style.css',
    'games/battleship/css/game.css',
    'games/battleship/js/menu.js',
    'games/battleship/js/game.js',
    'games/battleship/js/room.js',

    // Game: pong
    'games/pong/index.html',
    'games/pong/game.html',
    'games/pong/css/style.css',
    'games/pong/css/game.css',
    'games/pong/js/menu.js',
    'games/pong/js/game.js',

    // Game: snow-digger
    'games/snow-digger/index.html',
    'games/snow-digger/style.css',
    'games/snow-digger/js/main.js',
    'games/snow-digger/js/core/camera.js',
    'games/snow-digger/js/core/cameraHints.js',
    'games/snow-digger/js/core/canvas.js',
    'games/snow-digger/js/core/inputs.js',
    'games/snow-digger/js/core/loop.js',
    'games/snow-digger/js/core/terrain.js',
    'games/snow-digger/js/core/textures.js',
    'games/snow-digger/js/ctrl/mainCtrl.js',
    'games/snow-digger/js/ctrl/weatherCtrl.js',
    'games/snow-digger/js/entities/floatingTexts.js',
    'games/snow-digger/js/entities/skier.js',
    'games/snow-digger/js/entities/snowflakes.js',
    'games/snow-digger/js/ui/informations.js',
    'games/snow-digger/js/ui/menu.js',
    'games/snow-digger/js/ui/menuParams.js',

    // Snow-digger assets
    'games/snow-digger/ressources/img/skieur/skieur.png',
    'games/snow-digger/ressources/img/pelles/niv1.png',
    'games/snow-digger/ressources/img/pelles/niv2.png',
    'games/snow-digger/ressources/img/pelles/niv3.png',
    'games/snow-digger/ressources/img/pelles/niv4.png',
    'games/snow-digger/ressources/img/pelles/niv5.png',
    'games/snow-digger/ressources/img/pelles/niv6.png',
    'games/snow-digger/ressources/img/flocons/flocon1.png',
    'games/snow-digger/ressources/img/flocons/flocon2.png',
    'games/snow-digger/ressources/img/flocons/flocon3.png',
    'games/snow-digger/ressources/img/flocons/flocon4.png',
    'games/snow-digger/ressources/img/flocons/flocon5.png',
    'games/snow-digger/ressources/img/flocons/flocon6.png',
    'games/snow-digger/ressources/img/flocons/flocon7.png',
    'games/snow-digger/ressources/img/flocons/flocon8.png',
    'games/snow-digger/ressources/img/flocons/flocon9.png',
    'games/snow-digger/ressources/img/flocons/flocon10.png',

    // Game: lostBelow
    'games/lostBelow/index.html',
    'games/lostBelow/game.html',
    'games/lostBelow/room.html',
    'games/lostBelow/setup.html',

    'games/lostBelow/css/style.css',
    'games/lostBelow/css/game.css',
    'games/lostBelow/js/menu.js',
    'games/lostBelow/js/game.js',
    'games/lostBelow/js/lobby.js',
    'games/lostBelow/js/room.js',
    'games/lostBelow/js/setup.js',

    // Game: Layer Pile
    'games/layer-pile/index.html',
    'games/layer-pile/css/game.css',
    'games/layer-pile/js/game.js',

    // Game: Draw and Guess
    'games/draw-guess/index.html',
    'games/draw-guess/game.html',
    'games/draw-guess/css/style.css',
    'games/draw-guess/css/game.css',
    'games/draw-guess/js/game.js',
    'games/draw-guess/js/core/canvas.js',
    'games/draw-guess/js/core/wordGenerator.js',

    // Game: Falling Blocks
    'games/falling-blocks/index.html',
    'games/falling-blocks/css/game.css',
    'games/falling-blocks/js/game.js',
];

// ─── 1. Installation ──────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
    // Force le SW à prendre le contrôle immédiatement sans attendre la fermeture des onglets
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log(`[SW] 📦 Mise en cache de ${CACHE_NAME}...`);

            // On utilise Promise.all pour suivre l'avancement, 
            // mais chaque fetch a son propre .catch pour ne pas bloquer les autres.
            return Promise.all(
                ASSETS_TO_CACHE.map((url) => {
                    // On ajoute un timestamp pour éviter de mettre en cache une vieille version du serveur (Cache-Busting)
                    const cacheRequest = new Request(url, { mode: 'cors' });

                    return fetch(cacheRequest)
                        .then((response) => {
                            if (response.ok) {
                                console.log(`✅ Mis en cache : ${url}`);
                                return cache.put(url, response);
                            }
                            // Si le fichier est en 404, on ne bloque pas l'install, on l'ignore juste.
                            console.warn(`⚠️ Fichier ignoré (Status ${response.status}): ${url}`);
                        })
                        .catch((err) => {
                            // Erreur réseau (ex: le serveur est tombé pendant l'install)
                            console.error(`❌ Erreur réseau pour : ${url}`);
                        });
                })
            );
        })
    );
});

// ─── 2. Activation ──────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] 🗑️ Nettoyage ancien cache :', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ─── 3. Fetch : Stratégie Cache First + Ping Bypass ─────────────────────────

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // ÉTAPE A : Gérer le test de connexion (Ping)
    // On force le réseau SANS passer par le cache pour avoir un résultat réel
    if (url.search.includes('ping=')) {
        return event.respondWith(
            fetch(event.request).catch(() => {
                // On renvoie une 200 (pas de rouge console) 
                // mais avec un header spécial 'X-Offline'
                return new Response('', {
                    status: 200,
                    headers: { 'X-Offline': 'true' }
                });
            })
        );
    }

    // ÉTAPE B : Stratégie Cache First pour tout le reste
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((cached) => {
            // 1. Si présent en cache, on sert immédiatement
            if (cached) return cached;

            // 2. Sinon, on tente le réseau
            return fetch(event.request).then((response) => {
                return response;
            }).catch(() => {
                // 3. Fallback en cas de panne réseau totale
                if (event.request.mode === 'navigate') {
                    return caches.match('index.html');
                }
                return new Response('Hors-ligne', { status: 404 });
            });
        })
    );
});

// Forcer la mise à jour du cache
self.addEventListener("install", event => {
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    clients.claim();
});

