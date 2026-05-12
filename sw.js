const CACHE_NAME = "mini-games-cache-v1.17.2026-05-12";

const ASSETS_TO_CACHE = [
    '',
    'index.html',
    'style.css',
    'rating-modal.css',
    'manifest.json',
    'fonts.css',
    'privacy',

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
    'js/app.js',
    'js/network.js',
    'js/BuyMeACoffee.js',
    'js/profilePanel.js',
    'js/config/firebase-config.js',
    'js/utils/formatNumber.js',
    'js/utils/audio.js',
    'js/utils/i18n.js',
    'js/utils/webhooks.js',
    'js/utils/ads.js',
    'js/utils/badges.js',
    'js/utils/settingsUI.js',
    'js/utils/dailyChallenge.js',
    'js/utils/xpSystem.js',

    // Assets data
    'assets/data/games.json',
    'assets/data/versions.json',
    'assets/data/badges.json',

    // Assets lang
    'assets/lang/fr.json',
    'assets/lang/en.json',
    'assets/lang/de.json',

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
    'assets/logos/lights-out-reflex.webp',
    'assets/logos/geoquiz.webp',
    'assets/logos/where-am-i.webp',
    'assets/logos/punch-reflex.webp',
    'assets/logos/rocketeer.webp',

    // About
    'about/about.html',
    'about/about.css',
    'about/about.js',

    // Fonts Google (CSS)
    'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap',
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,200;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,200&family=JetBrains+Mono:wght@300;400&display=swap',

    // offline page
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
    'games/morpion/game.html',
    'games/morpion/css/style.css',
    'games/morpion/css/game.css',
    'games/morpion/js/ctrl/mainCtrl.js',
    'games/morpion/js/ctrl/gameCtrl.js',
    'games/morpion/js/ctrl/symbolsChoiceCtrl.js',
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

    // Game: Lights Out Reflex
    'games/lights-out-reflex/index.html',
    'games/lights-out-reflex/css/game.css',
    'games/lights-out-reflex/js/game.js',

    // Game: GeoQuiz (fichiers locaux)
    'games/geoquiz/index.html',
    'games/geoquiz/game.html',
    'games/geoquiz/css/game.css',
    'games/geoquiz/js/game.js',
    'games/geoquiz/js/countries.js',

    // Game: Where Am I
    'games/where-am-i/index.html',
    'games/where-am-i/game.html',
    'games/where-am-i/css/style.css',
    'games/where-am-i/css/game.css',
    'games/where-am-i/js/menu.js',
    'games/where-am-i/js/game.js',

    // Game: Punch Reflex
    'games/punch-reflex/index.html',
    'games/punch-reflex/game.html',
    'games/punch-reflex/css/style.css',
    'games/punch-reflex/css/game.css',
    'games/punch-reflex/js/menu.js',
    'games/punch-reflex/js/game.js',

    // Game: Rocketeer
    'games/rocketeer/index.html',
    'games/rocketeer/game.html',
    'games/rocketeer/css/style.css',
    'games/rocketeer/css/game.css',
    'games/rocketeer/js/menu.js',
    'games/rocketeer/js/game.js',
    'games/rocketeer/js/mobile_builder.js',
    'games/rocketeer/js/parts.js',
    'games/rocketeer/js/physics.js',
    'games/rocketeer/js/rocket.js',
    'games/rocketeer/js/renderer.js',


];

// ─── 1. Installation ──────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
    // Force le SW à prendre le contrôle immédiatement sans attendre la fermeture des onglets
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log(`[SW] 📦 Mise en cache de ${CACHE_NAME}...`);

            // Traitement par lots (batch) pour éviter ERR_INSUFFICIENT_RESOURCES sur mobile
            const BATCH_SIZE = 15;
            for (let i = 0; i < ASSETS_TO_CACHE.length; i += BATCH_SIZE) {
                const batch = ASSETS_TO_CACHE.slice(i, i + BATCH_SIZE);
                await Promise.all(
                    batch.map(async (url) => {
                        try {
                            const cacheRequest = new Request(url);
                            const response = await fetch(cacheRequest);

                            // On accepte response.ok OU type 'opaque' (pour requêtes sans CORS direct)
                            if (response.ok || response.type === 'opaque') {
                                //console.log(`✅ Mis en cache : ${url}`);
                                await cache.put(url, response);
                            } else {
                                console.warn(`⚠️ Fichier ignoré (Status ${response.status}): ${url}`);
                            }
                        } catch (err) {
                            console.error(`❌ Erreur réseau pour : ${url}`);
                        }
                    })
                );
            }
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
            // Timeout explicitly in the SW because mobile browser SWs ignore the client's AbortController
            Promise.race([
                fetch(event.request),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1200))
            ]).catch(() => {
                // On renvoie une 200 (pas de rouge console) 
                // mais avec un header spécial 'X-Offline'
                return new Response('', {
                    status: 200,
                    headers: { 'X-Offline': 'true' }
                });
            })
        );
    }

    // ÉTAPE B : Éviter les erreurs console pour les scripts de pub/tracking hors-ligne
    if (url.hostname.includes('google-analytics.com') ||
        url.hostname.includes('googletagmanager.com') ||
        url.hostname.includes('profitablecpmratenetwork.com') ||
        url.hostname.includes('fundingchoicesmessages.google.com') ||
        url.hostname.includes('adtrafficquality.google') ||
        url.hostname.includes('pagead2.googlesyndication.com')) {
        return event.respondWith(
            fetch(event.request).catch(() => new Response('', { status: 200, headers: { 'Content-Type': 'text/javascript' } }))
        );
    }

    // ÉTAPE C : Stratégie Cache First pour tout le reste
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((cached) => {
            // 1. Si présent en cache, on sert immédiatement
            if (cached) return cached;

            // 2. Sinon, on tente le réseau
            return fetch(event.request).then((response) => {
                // Mise en cache dynamique des Google Fonts (CSS et polices)
                if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
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