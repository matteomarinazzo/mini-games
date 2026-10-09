const CACHE_NAME = "mini-games-cache-v1.31.2026-10-09.0";

const ASSETS_TO_CACHE = [
    '',
    'index.html',
    'style.css',
    'profile-panel.css',
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
    'js/utils/secretManager.js',

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
    'assets/logos/race-manager.webp',
    'assets/logos/sudoku.webp',
    'assets/logos/rush-highway.webp',
    'assets/logos/wiki-challenge.webp',
    'assets/logos/minesweeper.webp',
    'assets/logos/at-your-own-risk.webp',
    'assets/logos/letter-by-letter.webp',
    'assets/logos/ball-rush.webp',
    'assets/logos/crossword.webp',
    'assets/logos/snake.webp',
    'assets/logos/maze.webp',

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

    // Game: Race Manager
    'games/race-manager/index.html',
    'games/race-manager/game.html',
    'games/race-manager/home.html',
    'games/race-manager/qualifying.html',
    'games/race-manager/race.html',

    // Race Manager — CSS
    'games/race-manager/css/base.css',
    'games/race-manager/css/home.css',
    'games/race-manager/css/menu.css',
    'games/race-manager/css/qualifying.css',
    'games/race-manager/css/race.css',

    // Race Manager — JS racine
    'games/race-manager/js/home.js',
    'games/race-manager/js/import-flow.js',
    'games/race-manager/js/menu-wizard.js',
    'games/race-manager/js/menu.js',
    'games/race-manager/js/qualifying.js',
    'games/race-manager/js/race.js',
    'games/race-manager/js/summary-view.js',
    'games/race-manager/js/tyre-art.js',
    'games/race-manager/js/ui.js',

    // Race Manager — JS core
    'games/race-manager/js/core/constants.js',
    'games/race-manager/js/core/contracts.js',
    'games/race-manager/js/core/game-state.js',
    'games/race-manager/js/core/progression.js',
    'games/race-manager/js/core/race-engine.js',
    'games/race-manager/js/core/regulations.js',
    'games/race-manager/js/core/storage.js',
    'games/race-manager/js/core/transfers.js',
    'games/race-manager/js/core/utils.js',
    'games/race-manager/js/core/validation.js',
    'games/race-manager/js/core/weather.js',
    'games/race-manager/js/core/weekend.js',

    // Race Manager — Data
    'games/race-manager/js/data/calendar-2026.js',
    'games/race-manager/js/data/circuit-tracks-2026.js',
    'games/race-manager/js/data/circuits-2026.js',
    'games/race-manager/js/data/drivers-2026.js',
    'games/race-manager/js/data/teams-2026.js',

    // Game: Sudoku
    'games/sudoku/index.html',
    'games/sudoku/game.html',
    'games/sudoku/css/menu.css',
    'games/sudoku/css/game.css',
    'games/sudoku/js/menu.js',
    'games/sudoku/js/game.js',
    'games/sudoku/js/store.js',

    // Game: Rush Highway
    'games/rush-highway/index.html',
    'games/rush-highway/game.html',
    'games/rush-highway/css/menu.css',
    'games/rush-highway/css/game.css',
    'games/rush-highway/js/menu.js',
    'games/rush-highway/js/game.js',
    'games/rush-highway/js/store.js',
    'games/rush-highway/js/vehicles.js',

    // Game: Wiki Challenge
    'games/wiki-challenge/index.html',
    'games/wiki-challenge/game.html',
    'games/wiki-challenge/css/menu.css',
    'games/wiki-challenge/css/game.css',
    'games/wiki-challenge/js/menu.js',
    'games/wiki-challenge/js/game.js',

    // Game: Minesweeper
    'games/minesweeper/index.html',
    'games/minesweeper/game.html',
    'games/minesweeper/css/menu.css',
    'games/minesweeper/css/game.css',
    'games/minesweeper/js/menu.js',
    'games/minesweeper/js/game.js',

    // Game: At your own risk
    'games/at-your-own-risk/index.html',
    'games/at-your-own-risk/game.html',
    'games/at-your-own-risk/css/menu.css',
    'games/at-your-own-risk/css/game.css',
    'games/at-your-own-risk/js/menu.js',
    'games/at-your-own-risk/js/game.js',
    'games/at-your-own-risk/js/progress.js',
    'games/at-your-own-risk/js/levels/manifest.js',
    'games/at-your-own-risk/js/levels/world1/level1.js',
    'games/at-your-own-risk/js/levels/world1/level2.js',
    'games/at-your-own-risk/js/levels/world1/level3.js',
    'games/at-your-own-risk/js/levels/world1/level4.js',
    'games/at-your-own-risk/js/levels/world1/level5.js',
    'games/at-your-own-risk/js/levels/world1/level6.js',
    'games/at-your-own-risk/js/levels/world1/level7.js',
    'games/at-your-own-risk/js/levels/world1/level8.js',
    'games/at-your-own-risk/js/levels/world1/level9.js',
    'games/at-your-own-risk/js/levels/world1/level10.js',
    'games/at-your-own-risk/js/levels/world1/level11.js',
    'games/at-your-own-risk/js/levels/world1/level12.js',
    'games/at-your-own-risk/js/levels/world1/level13.js',
    'games/at-your-own-risk/js/levels/world1/level14.js',
    'games/at-your-own-risk/js/levels/world1/level15.js',
    'games/at-your-own-risk/js/levels/world1/level16.js',
    'games/at-your-own-risk/js/levels/world1/level17.js',
    'games/at-your-own-risk/js/levels/world1/level18.js',
    'games/at-your-own-risk/js/levels/world1/level19.js',
    'games/at-your-own-risk/js/levels/world1/level20.js',
    'games/at-your-own-risk/images/buttons/jump.svg',
    'games/at-your-own-risk/images/buttons/left.svg',
    'games/at-your-own-risk/images/buttons/right.svg',
    'games/at-your-own-risk/images/character/run1.svg',
    'games/at-your-own-risk/images/character/run2.svg',
    'games/at-your-own-risk/images/character/run3.svg',
    'games/at-your-own-risk/images/hazards/spike.svg',
    'games/at-your-own-risk/images/hazards/spike_dark.svg',
    'games/at-your-own-risk/images/portal/portal.svg',

    // Game: Letter by Letter
    'games/letter-by-letter/index.html',
    'games/letter-by-letter/game.html',
    'games/letter-by-letter/css/menu.css',
    'games/letter-by-letter/css/game.css',
    'games/letter-by-letter/js/menu.js',
    'games/letter-by-letter/js/game.js',
    'games/letter-by-letter/js/logic.js',
    'games/letter-by-letter/js/storage.js',
    'games/letter-by-letter/js/words.js',

    // Game: Ball Rush
    'games/ball-rush/index.html',
    'games/ball-rush/css/game.css',
    'games/ball-rush/js/game.js',

    // Game: Crossword
    'games/crossword/index.html',
    'games/crossword/css/game.css',
    'games/crossword/js/game.js',
    'games/crossword/js/words.js',

    // Game: Snake
    'games/snake/index.html',
    'games/snake/css/game.css',
    'games/snake/js/game.js',

    // Game: Maze
    'games/maze/index.html',
    'games/maze/css/game.css',
    'games/maze/js/game.js',
    'games/maze/js/core/maze-engine.js',
    'games/maze/js/core/maze-generator.js',
    'games/maze/js/core/maze-map.js',
    'games/maze/js/core/maze-render.js',
    'games/maze/js/core/maze-size.js',
    'games/maze/js/core/maze-storage.js',
    'games/maze/js/core/maze-world.js',
];

// ─── 1. Installation ──────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log(`[SW] 📦 Mise en cache de ${CACHE_NAME}...`);
            const BATCH_SIZE = 15;
            for (let i = 0; i < ASSETS_TO_CACHE.length; i += BATCH_SIZE) {
                const batch = ASSETS_TO_CACHE.slice(i, i + BATCH_SIZE);
                await Promise.all(
                    batch.map(async (url) => {
                        try {
                            // ⚠️ IMPORTANT : cache: 'reload' force à bypasser le cache HTTP du navigateur
                            const response = await fetch(url, { cache: 'reload' });
                            if (response.ok || response.type === 'opaque') {
                                await cache.put(url, response);
                            } else {
                                console.warn(`⚠️ Fichier ignoré (Status ${response.status}): ${url}`);
                            }
                        } catch (err) {
                            console.error(`❌ Erreur : ${url}`);
                        }
                    })
                );
            }
        })
    );
});

// ─── 2. Activation ────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // Supprime tous les anciens caches
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] 🗑️ Suppression :', name);
                        return caches.delete(name);
                    })
            );
            await self.clients.claim();

            // 🔥 Notifier tous les clients qu'une nouvelle version est active
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach(client => {
                client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
            });
        })()
    );
});

// ─── 3. Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const request = event.request;

    // A. Ping bypass (avec AbortController pour libérer les connexions)
    if (url.search.includes('ping=')) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);

        return event.respondWith(
            fetch(request, { signal: controller.signal })
                .then(res => {
                    clearTimeout(timeoutId);
                    return res;
                })
                .catch(() => new Response('', { status: 200, headers: { 'X-Offline': 'true' } }))
        );
    }

    // B. Trackers / pubs
    if (url.hostname.includes('google-analytics.com') ||
        url.hostname.includes('googletagmanager.com') ||
        url.hostname.includes('profitablecpmratenetwork.com') ||
        url.hostname.includes('fundingchoicesmessages.google.com') ||
        url.hostname.includes('adtrafficquality.google') ||
        url.hostname.includes('pagead2.googlesyndication.com')) {
        return event.respondWith(
            fetch(request).catch(() => new Response('', { status: 200, headers: { 'Content-Type': 'text/javascript' } }))
        );
    }

    // C. 🔥 NETWORK FIRST (avec timeout) pour HTML + versions.json + sw.js
    //    => garantit que les utilisateurs voient la dernière version, mais sans bloquer si le réseau est lent
    const isHTML = request.mode === 'navigate' ||
        request.destination === 'document' ||
        url.pathname.endsWith('.html');
    const isVersionFile = url.pathname.endsWith('versions.json') ||
        url.pathname.endsWith('sw.js');

    if (isHTML || isVersionFile) {
        return event.respondWith(
            new Promise((resolve) => {
                let isResolved = false;
                const timeoutId = setTimeout(() => {
                    if (!isResolved) {
                        isResolved = true;
                        caches.match(request, { ignoreSearch: true })
                            .then(cached => resolve(cached || caches.match('index.html')));
                    }
                }, 3000); // 3 secondes de tolérance max

                fetch(request)
                    .then(response => {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeoutId);
                            if (response && response.ok) {
                                const clone = response.clone();
                                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                            }
                            resolve(response);
                        }
                    })
                    .catch(() => {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeoutId);
                            caches.match(request, { ignoreSearch: true })
                                .then(cached => resolve(cached || caches.match('index.html')));
                        }
                    });
            })
        );
    }

    // D. CACHE FIRST pour le reste (CSS, JS, images, fonts)
    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then(cached => {
            if (cached) return cached;
            return fetch(request).then(response => {
                if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch((err) => {
                console.error('[SW] Échec fetch:', request.url, err);
                return new Response('Hors-ligne', { status: 404 });
            });
        })
    );
});

// ─── 4. Écoute des messages du client ─────────────────────────────────────────
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
