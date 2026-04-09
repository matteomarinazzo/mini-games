/**
 * Where Am I — game.js
 * Full game logic: photo loading (Mapillary + fallback), 360° viewer,
 * Leaflet map, guess system, scoring, multiplayer sync via Firebase
 */

import { auth, firebaseReady, getServerTimestamp } from "../../../js/config/firebase-config.js";
import { updateRoom, listenToRoomChanges, getRoom } from "../../../js/firebaseWrk.js";

// ═══════════════════════════════════════════════════
// URL PARAMS
// ═══════════════════════════════════════════════════
const urlParams = new URLSearchParams(window.location.search);
const ROOM_ID = urlParams.get('room');
const IS_SOLO = !ROOM_ID;
const SOLO_ROUNDS = Number(urlParams.get('rounds') || 5);
const SOLO_TIME = Number(urlParams.get('time') || 120);  // 0 = unlimited
const SOLO_ZONE = urlParams.get('zone') || 'ALL';

// ═══════════════════════════════════════════════════
// CONTINENT BOUNDING BOXES
// ═══════════════════════════════════════════════════
const CONTINENT_BOUNDS = {
    ALL: { latMin: -55, latMax: 72, lngMin: -170, lngMax: 180 },
    EU: { latMin: 36, latMax: 71, lngMin: -10, lngMax: 40 },
    AS: { latMin: 0, latMax: 70, lngMin: 30, lngMax: 145 },
    AF: { latMin: -35, latMax: 37, lngMin: -18, lngMax: 52 },
    NA: { latMin: 15, latMax: 70, lngMin: -168, lngMax: -52 },
    SA: { latMin: -55, latMax: 13, lngMin: -82, lngMax: -34 },
    OC: { latMin: -47, latMax: 0, lngMin: 110, lngMax: 178 },
    // Specific Countries
    FR: { latMin: 41, latMax: 51, lngMin: -5, lngMax: 10 },
    US: { latMin: 24, latMax: 49, lngMin: -125, lngMax: -66 },
    JP: { latMin: 30, latMax: 45, lngMin: 128, lngMax: 146 },
    BR: { latMin: -33, latMax: 5, lngMin: -74, lngMax: -34 },
    IT: { latMin: 36, latMax: 47, lngMin: 6, lngMax: 19 },
    ES: { latMin: 36, latMax: 43, lngMin: -9, lngMax: 3 },
    CH: { latMin: 45, latMax: 48, lngMin: 5, lngMax: 11 },
    UK: { latMin: 50, latMax: 60, lngMin: -8, lngMax: 2 },
    DE: { latMin: 47, latMax: 55, lngMin: 5, lngMax: 15 },
};

// ═══════════════════════════════════════════════════
// DENSE 360° SEEDS — cities with known high coverage
// ═══════════════════════════════════════════════════
const ZONE_SEEDS = {
    ALL: [
        [48.85, 2.35], [51.51, -0.13], [52.52, 13.40], [40.71, -74.01], [35.68, 139.69],
        [-23.55, -46.63], [41.89, 12.49], [40.42, -3.70], [1.35, 103.82], [-33.87, 151.21],
        [30.04, 31.24], [55.75, 37.62], [19.43, -99.13], [-34.60, -58.38], [52.37, 4.90],
        [45.75, 4.83], [43.30, 5.37], [47.37, 8.54], [50.08, 14.43], [43.61, 1.44]
    ],
    EU: [
        [48.85, 2.35], [51.51, -0.13], [52.52, 13.40], [41.89, 12.49], [40.42, -3.70],
        [52.37, 4.90], [50.08, 14.43], [48.21, 16.37], [59.33, 18.06], [55.67, 12.56]
    ],
    NA: [[40.71, -74.01], [34.05, -118.24], [41.88, -87.63], [29.76, -95.37], [43.65, -79.38], [19.43, -99.13], [37.77, -122.42]],
    SA: [[-23.55, -46.63], [-34.60, -58.38], [-33.45, -70.66], [4.71, -74.07], [-12.04, -77.04]],
    AS: [[35.68, 139.69], [37.56, 126.98], [1.35, 103.82], [22.31, 114.17], [13.75, 100.52], [25.20, 55.27]],
    AF: [[30.04, 31.24], [-26.20, 28.04], [-33.92, 18.42], [33.57, -7.58], [14.71, -17.46]],
    OC: [[-33.86, 151.20], [-37.81, 144.96], [-36.84, 174.76], [-31.95, 115.86]],
    // Countries
    FR: [[48.85, 2.35], [43.30, 5.37], [45.75, 4.83], [43.60, 1.44], [43.70, 7.26], [47.21, -1.55], [48.57, 7.75], [50.62, 3.05]],
    US: [[40.71, -74.01], [34.05, -118.24], [41.87, -87.62], [29.76, -95.36], [33.44, -112.07], [25.76, -80.19], [39.95, -75.16]],
    JP: [[35.68, 139.65], [34.69, 135.50], [35.01, 135.76], [33.59, 130.40], [43.06, 141.35], [35.18, 136.90]],
    BR: [[-23.55, -46.63], [-22.90, -43.17], [-15.79, -47.88], [-3.11, -60.02], [-12.97, -38.50]],
    IT: [[41.90, 12.49], [45.46, 9.18], [40.85, 14.26], [44.49, 11.34], [43.76, 11.25]],
    ES: [[40.41, -3.70], [41.38, 2.17], [39.46, -0.37], [37.38, -5.98], [41.64, -0.88]],
    CH: [[47.37, 8.54], [46.20, 6.14], [47.55, 7.58], [46.94, 7.44], [46.51, 6.63]],
    UK: [[51.50, -0.12], [52.48, -1.89], [53.48, -2.24], [55.95, -3.18], [51.48, -3.17]],
    DE: [[52.52, 13.40], [48.13, 11.57], [53.55, 9.99], [50.11, 8.68], [48.77, 9.18]],
};

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let myUID = null;
let myName = localStorage.getItem('whereAmI_name') || 'Joueur';
let roomData = null;

let currentRound = 0;
let totalRounds = SOLO_ROUNDS;
let timePerRound = SOLO_TIME;
let zone = SOLO_ZONE;
let totalScore = 0;
let roundScores = [];

let currentLocation = null;
let guessMarker = null;
let guessLatLng = null;
let leafletMap = null;
let resultMapInstance = null;
let timerInterval = null;
let timerEndAt = null;
let panoramaViewerInstance = null;
let isSubmitted = false;
let phaseListened = false;
let activeSearchController = null;

// ═══════════════════════════════════════════════════
// DOM
// ═══════════════════════════════════════════════════
const hudScore = document.getElementById('hudScore');
const hudRound = document.getElementById('hudRound');
const hudMode = document.getElementById('hudMode');
const timerWrap = document.getElementById('timerWrap');
const timerDisplay = document.getElementById('timerDisplay');
const photoLoading = document.getElementById('photoLoading');
const panoramaViewerEl = document.getElementById('panoramaViewer');
const flatPhotoWrap = document.getElementById('flatPhotoWrap');
const flatPhoto = document.getElementById('flatPhoto');
const mapPanel = document.getElementById('mapPanel');
const mapToggleBtn = document.getElementById('mapToggleBtn');
const mapCloseBtn = document.getElementById('mapCloseBtn');
const confirmGuessBtn = document.getElementById('confirmGuessBtn');
const resetGuessBtn = document.getElementById('resetGuessBtn');
const roundResultOverlay = document.getElementById('roundResultOverlay');
const waitingOthersOverlay = document.getElementById('waitingOthersOverlay');
const endScreen = document.getElementById('endScreen');
const playersBar = document.getElementById('playersBar');
const submittedList = document.getElementById('submittedList');
const replayBtn = document.getElementById('replayBtn');
const backBtn = document.getElementById('backBtn');

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
firebaseReady.then(ready => {
    if (!ready) return;
    const user = auth.currentUser;
    if (!user) return;
    myUID = user.uid;

    hudMode.textContent = IS_SOLO ? 'Solo' : 'Multi';
    initLeafletMap();

    if (IS_SOLO) {
        startNextRound();
    } else {
        joinGameRoom();
    }
});

// ═══════════════════════════════════════════════════
// MULTIPLAYER ROOM JOIN
// ═══════════════════════════════════════════════════
async function joinGameRoom() {
    const gameId = `whereami_${ROOM_ID}`;
    const data = await getRoom(gameId);
    if (!data) {
        alert('Salle introuvable');
        window.location.href = './index.html';
        return;
    }

    roomData = data;
    totalRounds = roomData.totalRounds || 5;
    timePerRound = roomData.timePerRound ?? 120;
    zone = roomData.zone || 'ALL';

    // Ensure player is registered (handles F5 refresh)
    if (!roomData.players?.[myUID]) {
        await updateRoom(gameId, {
            [`players/${myUID}`]: { name: myName, score: 0, joined: Date.now(), online: true, uid: myUID }
        });
    }

    playersBar.style.display = 'flex';

    listenToRoomChanges(gameId, handleRoomUpdate);

    // Heartbeat for Leader (every 2 minutes) to prevent auto-cleanup
    setInterval(() => {
        if (roomData && roomData.leader === myUID) {
            updateRoom(gameId, { lastActivity: Date.now() });
        }
    }, 120000);

    // Graceful exit handlers
    window.addEventListener('beforeunload', leaveGameRoom);
    if (backBtn) {
        backBtn.onclick = (e) => {
            e.preventDefault();
            if (confirm("Voulez-vous vraiment quitter la partie ? Ce salon sera fermé si vous êtes le dernier joueur.")) {
                leaveGameRoom().then(() => window.location.href = './index.html');
            }
        };
    }
}

async function leaveGameRoom() {
    if (IS_SOLO || !ROOM_ID) return;
    const gameId = `whereami_${ROOM_ID}`;

    try {
        const latest = await getRoom(gameId);
        if (!latest) return;

        const players = latest.players || {};
        delete players[myUID];

        if (Object.keys(players).length === 0) {
            await deleteRoom(gameId);
        } else {
            // Remove only this player to avoid race conditions
            await updateRoom(gameId, { [`players/${myUID}`]: null });
        }
    } catch (e) {
        console.error("Erreur lors de la sortie du salon:", e);
    }
}

// ═══════════════════════════════════════════════════
// MULTIPLAYER ROOM LISTENER
// ═══════════════════════════════════════════════════
function handleRoomUpdate(data) {
    if (!data) {
        alert("La salle a été fermée (inactivité ou déconnexion).");
        window.location.href = './index.html';
        return;
    }
    roomData = data;

    const now = Date.now();
    const lastActive = roomData.lastActivity || roomData.roundStartedAt || now;
    if (now - lastActive > 15 * 60 * 1000) {
        if (roomData.leader === myUID) {
            deleteRoom(`whereami_${ROOM_ID}`);
        }
        return;
    }

    updatePlayersBar();

    const round = roomData.currentRound;
    const state = roomData.state;

    if (round) hudRound.textContent = `Manche ${round}/${roomData.totalRounds}`;

    // FIX 1 — New round OR location just arrived for current round
    if (state === 'playing') {
        const isNewRound = round !== currentRound;
        const locationJustArrived = round === currentRound
            && roomData.currentLocation
            && !currentLocation;

        if (isNewRound) {
            currentRound = round;
            isSubmitted = false;
            phaseListened = false;
            waitingOthersOverlay.style.display = 'none';
            endScreen.style.display = 'none';
            currentLocation = null; // reset so locationJustArrived can fire next update
        }

        if ((isNewRound || locationJustArrived) && roomData.currentLocation) {
            resetRoundUI();
            loadLocationFromData(roomData.currentLocation);

            if (timePerRound > 0 && roomData.roundStartedAt) {
                const startMs = typeof roomData.roundStartedAt === 'number'
                    ? roomData.roundStartedAt : Date.now();
                startServerSyncedTimer(startMs, timePerRound);
            } else if (timePerRound === 0) {
                timerWrap.style.display = 'none';
            }
        }

        if (!roomData.currentLocation) {
            startCollaborativeSearch(round);
        }
    }

    if (state === 'round_result' && !phaseListened) {
        phaseListened = true;
        stopTimer();
        showMultiRoundResult();
    }

    if (state === 'finished') {
        showEndScreen();
    }

    // FIX 2 — Leader re-checks on every update while in playing state
    if (state === 'playing' && round) {
        const players = Object.keys(roomData.players || {});
        const guesses = Object.keys(roomData.guesses?.[round] || {});
        updateSubmittedList(players, guesses);

        // Leader checks if everyone submitted on EVERY room update (not just after own submit)
        if (roomData.leader === myUID && guesses.length >= players.length && players.length > 0) {
            promoteToRoundResult();
        }
    }
}

async function promoteToRoundResult() {
    const gameId = `whereami_${ROOM_ID}`;
    // Re-fetch to be sure we have the freshest data
    const data = await getRoom(gameId);
    if (!data) return;

    const players = Object.keys(data.players || {});
    const guesses = Object.keys(data.guesses?.[currentRound] || {});

    if (guesses.length < players.length) return; // not everyone yet
    if (data.state === 'round_result') return;    // already done

    const roundGuesses = data.guesses[currentRound];
    const updates = {};
    for (const [uid, g] of Object.entries(roundGuesses)) {
        const prevScore = data.players[uid]?.score || 0;
        updates[`players/${uid}/score`] = prevScore + (g.points || 0);
    }
    updates.state = 'round_result';
    await updateRoom(gameId, updates);
}

async function startCollaborativeSearch(round) {
    if (activeSearchController) return; // Already searching

    console.log(`[COLLAB] Starting collaborative search for round ${round}...`);
    const loc = await fetchRandomLocation(roomData?.zone || 'ALL');

    if (loc && !roomData.currentLocation) {
        console.log(`[COLLAB] Found a winner: ${loc.source}! Syncing to Firebase...`);
        const gameId = `whereami_${ROOM_ID}`;

        // Final safety check to avoid overwriting a faster winner
        const latest = await getRoom(gameId);
        if (latest && !latest.currentLocation) {
            await updateRoom(gameId, {
                currentLocation: loc,
                roundStartedAt: Date.now(),
                lastActivity: Date.now()
            });
        }
    }
}

// Deprecated in favor of startCollaborativeSearch
async function bootstrapLeaderRound(round) {
    startCollaborativeSearch(round);
}

// ═══════════════════════════════════════════════════
// SOLO ROUND FLOW
// ═══════════════════════════════════════════════════
async function startNextRound() {
    currentRound++;
    if (currentRound > totalRounds) {
        showEndScreen();
        return;
    }

    resetRoundUI();
    hudRound.textContent = `Manche ${currentRound}/${totalRounds}`;
    hudScore.textContent = totalScore;

    if (leafletMap) leafletMap.setView([20, 0], 2);

    const loc = await fetchRandomLocation(zone);
    currentLocation = loc;
    displayPhoto(loc);

    if (timePerRound > 0) {
        startLocalTimer(timePerRound);
    } else {
        timerWrap.style.display = 'none';
    }
}

function resetRoundUI() {
    isSubmitted = false;
    guessLatLng = null;
    if (guessMarker && leafletMap) { leafletMap.removeLayer(guessMarker); guessMarker = null; }
    confirmGuessBtn.disabled = true;
    resetGuessBtn.style.display = 'none';
    mapPanel.style.display = 'none';
    mapToggleBtn.classList.remove('has-guess');
    roundResultOverlay.style.display = 'none';
    photoLoading.style.display = 'flex';
    panoramaViewerEl.style.display = 'none';
    flatPhotoWrap.style.display = 'none';
}

// ═══════════════════════════════════════════════════
// CONTINENT SEEDS — known 360° areas worldwide
// ═══════════════════════════════════════════════════
const CONTINENT_SEEDS = {
    EU: [
        [51.50, -0.12], [52.52, 13.40], [40.41, -3.70], [41.90, 12.49], [52.37, 4.89],
        [50.07, 14.43], [48.85, 2.35], [45.46, 9.18], [55.67, 12.56], [59.32, 18.06],
        [53.34, -6.26], [48.21, 16.37], [52.22, 21.01], [47.49, 19.04]
    ],
    AF: [
        [30.04, 31.24], [-33.92, 18.42], [-26.20, 28.04], [-1.29, 36.82], [33.57, -7.58],
        [6.52, 3.37], [-4.32, 15.31], [33.88, 35.50], [36.80, 10.18], [-12.97, 28.64]
    ],
    AS: [
        [35.68, 139.69], [37.56, 126.97], [1.35, 103.82], [13.75, 100.50], [22.31, 114.16],
        [19.07, 72.87], [28.61, 77.20], [31.23, 121.47], [25.20, 55.27], [24.86, 67.00]
    ],
    NA: [
        [40.71, -74.00], [34.05, -118.24], [41.87, -87.62], [43.65, -79.38], [19.43, -99.13],
        [49.28, -123.12], [45.50, -73.56], [29.76, -95.36], [33.44, -112.07], [42.36, -71.05]
    ],
    SA: [
        [-22.90, -43.17], [-23.55, -46.63], [-34.60, -58.37], [-33.44, -70.66], [4.71, -74.07],
        [-12.04, -77.04], [-0.18, -78.46], [-25.26, -57.57], [-34.90, -56.16], [10.48, -66.87]
    ],
    OC: [
        [-33.86, 151.20], [-37.81, 144.96], [-36.84, 174.76], [-31.95, 115.86], [-27.47, 153.02],
        [-41.28, 174.77], [-12.46, 130.84], [-34.92, 138.60], [-43.53, 172.63]
    ]
};

// ═══════════════════════════════════════════════════
// LOCATION FETCH
// ═══════════════════════════════════════════════════
async function fetchRandomLocation(zoneKey = 'ALL') {
    const continents = ['EU', 'AS', 'AF', 'NA', 'SA', 'OC'];
    const MAX_CONCURRENT = 15;
    const TOTAL_TIMEOUT = 14000;
    const loadingText = document.querySelector('#photoLoading p');

    console.log(`[SEARCH] Start for zone: ${zoneKey} (${MAX_CONCURRENT} workers)`);

    // Cleanup any existing search
    if (activeSearchController) activeSearchController.abort();
    activeSearchController = new AbortController();
    const { signal } = activeSearchController;

    return new Promise((resolve) => {
        let finished = false;
        let failedCount = 0;
        const totalAttempts = 60;
        const controller = activeSearchController;

        const cleanup = () => {
            finished = true;
            activeSearchController = null;
        };

        const fallbackTimer = setTimeout(async () => {
            if (finished) return;
            cleanup();
            controller.abort();
            console.warn("[SEARCH] Global timeout. Forcing Wikimedia fallback.");
            try {
                const wm = await fetchWikimediaImage(zoneKey);
                resolve(wm);
            } catch (e) {
                console.error("[SEARCH] Wikimedia fallback failed:", e);
                resolve(getFallbackLocation(zoneKey));
            }
        }, TOTAL_TIMEOUT);

        const runWorker = async (workerId) => {
            // Micro staggered start (50ms) to avoid network congestion
            if (workerId > 0) {
                await new Promise(r => setTimeout(r, workerId * 50));
            }

            for (let i = 0; i < Math.ceil(totalAttempts / MAX_CONCURRENT); i++) {
                if (finished) return;
                const attempt = i * MAX_CONCURRENT + workerId;

                try {
                    let effectiveZone = zoneKey === 'ALL' ? continents[(workerId + i) % continents.length] : zoneKey;
                    const b = CONTINENT_BOUNDS[effectiveZone] || CONTINENT_BOUNDS.ALL;
                    const s = CONTINENT_SEEDS[effectiveZone] || [];

                    let lat, lng;
                    if (attempt < 30 && s.length > 0) {
                        const seed = s[Math.floor(Math.random() * s.length)];
                        const jitter = 0.2 + (attempt % 8) * 0.2;
                        lat = seed[0] + (Math.random() - 0.5) * jitter;
                        lng = seed[1] + (Math.random() - 0.5) * jitter;
                    } else {
                        lat = b.latMin + Math.random() * (b.latMax - b.latMin);
                        lng = b.lngMin + Math.random() * (b.lngMax - b.lngMin);
                    }

                    if (loadingText) loadingText.textContent = `Exploration de ${failedCount + i} lieux...`;

                    const loc = await Promise.race([
                        fetchPanoramaxImage(lat, lng, signal),
                        fetchKartaViewImage(lat, lng, signal),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
                    ]);

                    if (loc && !finished) {
                        finished = true;
                        controller.abort();
                        clearTimeout(fallbackTimer);
                        console.info(`[SEARCH] ✓ Success! Winner: ${loc.source}`);
                        resolve(loc);
                        return;
                    }
                } catch (e) {
                    // Silently ignore individual worker errors
                }

                failedCount++;
                if (failedCount >= totalAttempts && !finished) {
                    finished = true;
                    controller.abort();
                    clearTimeout(fallbackTimer);
                    console.warn("[SEARCH] All 360 attempts failed. Falling back to Wikimedia.");
                    try {
                        const wm = await fetchWikimediaImage(zoneKey);
                        resolve(wm);
                    } catch (e) {
                        resolve(getFallbackLocation(zoneKey));
                    }
                }
            }
        };

        // SAFETY NET: If somehow workers crash or promise stalls, finish anyway
        for (let w = 0; w < MAX_CONCURRENT; w++) {
            runWorker(w).catch(err => {
                console.error(`[SEARCH] Worker ${w} crashed:`, err);
                if (!finished && w === MAX_CONCURRENT - 1) {
                    // Last chance safety
                    finished = true;
                    resolve(getFallbackLocation(zoneKey));
                }
            });
        }
    });
}

async function fetchKartaViewImage(lat, lng, signal) {
    const radius = 5000; // Search within 5km
    const url = `https://api.openstreetcam.org/2.0/photo/?lat=${lat}&lng=${lng}&radius=${radius}&limit=50`;

    try {
        const res = await fetch(url, { signal });
        if (!res.ok) return null;
        const json = await res.json();
        const data = json.result?.data;
        if (!data || data.length === 0) return null;

        // Strict 360° filtering (SPHERE projection)
        const valid360 = data.filter(img => img.projection === 'SPHERE' && (img.fileurl2048 || img.fileurl640));
        if (valid360.length === 0) return null;

        const img = valid360[Math.floor(Math.random() * valid360.length)];
        return {
            lat: Number(img.lat),
            lng: Number(img.lng),
            thumbUrl: img.fileurl2048 || img.fileurl640,
            is360: true,
            source: 'kartaview'
        };
    } catch (e) {
        return null;
    }
}

async function fetchPanoramaxImage(lat, lng, signal) {
    const delta = 0.4; // SMALLER = much faster API response

    const bbox = [
        lng - delta,
        lat - delta,
        lng + delta,
        lat + delta
    ].join(',');

    const url = `https://api.panoramax.xyz/api/search?bbox=${bbox}&limit=100`;

    try {
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`Panoramax HTTP ${res.status}`);

        const json = await res.json();
        const features = json.features;

        if (!features || features.length === 0) return null;

        const valid = features.filter(f => {
            const assets = f.assets;
            const props = f.properties;

            if (!assets?.sd?.href && !assets?.hd?.href) return false;

            const fov = props?.['pers:interior_orientation']?.field_of_view;
            const proj = props?.exif?.['Xmp.GPano.ProjectionType'];

            return (
                fov === 360 ||
                proj === 'equirectangular'
            );
        });

        if (valid.length === 0) return null;

        const img = valid[Math.floor(Math.random() * valid.length)];

        if (!img.geometry?.coordinates) return null;

        const [lng2, lat2] = img.geometry.coordinates;

        const imageUrl =
            img.assets?.sd?.href ||
            img.assets?.hd?.href;

        return {
            lat: lat2,
            lng: lng2,
            thumbUrl: imageUrl,
            is360: true,
            source: 'panoramax'
        };
    } catch (e) {
        return null;
    }
}
// ═══════════════════════════════════════════════════
// WIKIMEDIA FALLBACK
// ═══════════════════════════════════════════════════
async function fetchWikimediaImage(zoneKey) {
    const bounds = CONTINENT_BOUNDS[zoneKey] || CONTINENT_BOUNDS.ALL;
    const lat = bounds.latMin + Math.random() * (bounds.latMax - bounds.latMin);
    const lng = bounds.lngMin + Math.random() * (bounds.lngMax - bounds.lngMin);
    const radius = 100000; // 100km in metres

    const url = `https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=${radius}&gslimit=20&gsnamespace=6&format=json&origin=*`;
    const res = await fetch(url);
    const json = await res.json();
    const results = json.query?.geosearch;
    if (!results || results.length === 0) return getFallbackLocation(zoneKey);

    const item = results[Math.floor(Math.random() * results.length)];
    const imgUrl = await getWikimediaImageUrl(item.title);
    if (!imgUrl) return getFallbackLocation(zoneKey);

    return { lat: item.lat, lng: item.lon, thumbUrl: imgUrl, is360: false, source: 'wikimedia' };
}

async function getWikimediaImageUrl(title) {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json&origin=*`;
    const res = await fetch(url);
    const json = await res.json();
    const pages = json.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    return page?.imageinfo?.[0]?.thumburl || null;
}

function getFallbackLocation(zoneKey = 'ALL') {
    const seeds = CONTINENT_SEEDS[zoneKey] || CONTINENT_SEEDS.ALL;
    const seed = seeds[Math.floor(Math.random() * seeds.length)];

    // Hardcoded safety images to avoid broken links
    const fallbacks = {
        EU: { lat: 48.8566, lng: 2.3522, thumbUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Paris_-_Eiffelturm_und_Marsfeld2.jpg/1200px-Paris_-_Eiffelturm_und_Marsfeld2.jpg' },
        NA: { lat: 40.7128, lng: -74.0060, thumbUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Southwest_corner_of_Central_Park%2C_looking_east%2C_NYC.jpg/1200px-Southwest_corner_of_Central_Park%2C_looking_east%2C_NYC.jpg' },
        AS: { lat: 35.6762, lng: 139.6503, thumbUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Skyscrapers_of_Shinjuku_2009_January.jpg/1200px-Skyscrapers_of_Shinjuku_2009_January.jpg' },
        OC: { lat: -33.8688, lng: 151.2093, thumbUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Sydney_Australia._%2821339175489%29.jpg/1200px-Sydney_Australia._%2821339175489%29.jpg' },
        AF: { lat: 30.0444, lng: 31.2357, thumbUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Dubai_Marina_Skyline.jpg/1200px-Dubai_Marina_Skyline.jpg' }, // Cairo or similar
        SA: { lat: -22.9519, lng: -43.2105, thumbUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Jolla_San_Diego_2014.jpg/1200px-La_Jolla_San_Diego_2014.jpg' },
    };

    const data = fallbacks[zoneKey] || Object.values(fallbacks)[Math.floor(Math.random() * Object.values(fallbacks).length)];
    return { ...data, is360: false, source: 'emergency_fallback' };
}

// ═══════════════════════════════════════════════════
// DISPLAY PHOTO
// ═══════════════════════════════════════════════════
function displayPhoto(loc) {
    console.log(loc);
    photoLoading.style.display = 'none';

    if (loc.is360 && loc.thumbUrl) {
        // 360° via Pannellum
        panoramaViewerEl.style.display = 'block';
        flatPhotoWrap.style.display = 'none';

        // Destroy previous instance to avoid "already initialized" crash
        if (panoramaViewerInstance) {
            try { panoramaViewerInstance.destroy(); } catch (e) { }
            panoramaViewerInstance = null;
            // Pannellum leaves a child div — clear it
            panoramaViewerEl.innerHTML = '';
        }

        try {
            panoramaViewerInstance = pannellum.viewer('panoramaViewer', {
                type: 'equirectangular',
                panorama: loc.thumbUrl,
                autoLoad: true,
                showFullscreenCtrl: false,
                showZoomCtrl: false,
                compass: false,
                hfov: 120,
            });
        } catch (err) {
            console.error("[Pannellum] Initialization error, falling back to 2D:", err);
            panoramaViewerEl.style.display = 'none';
            flatPhotoWrap.style.display = 'block';
            flatPhoto.src = loc.thumbUrl || '';
        }
    } else {
        // Flat photo
        flatPhotoWrap.style.display = 'block';
        panoramaViewerEl.style.display = 'none';
        flatPhoto.src = loc.thumbUrl || '';
        flatPhoto.onerror = () => {
            flatPhoto.src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/No_image_available.svg/480px-No_image_available.svg.png';
        };
    }
}

function loadLocationFromData(locData) {
    currentLocation = locData;
    photoLoading.style.display = 'flex';
    panoramaViewerEl.style.display = 'none';
    flatPhotoWrap.style.display = 'none';
    setTimeout(() => displayPhoto(locData), 80);
}

// ═══════════════════════════════════════════════════
// LEAFLET MAP INIT
// ═══════════════════════════════════════════════════
function initLeafletMap() {
    leafletMap = L.map('leafletMap', { center: [20, 0], zoom: 2, minZoom: 1, maxZoom: 18 });

    // CartoDB dark tiles — free, no key required, great looking
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(leafletMap);

    leafletMap.on('click', e => {
        if (isSubmitted) return;
        placeGuessMarker(e.latlng);
    });
}

function placeGuessMarker(latlng) {
    if (guessMarker) leafletMap.removeLayer(guessMarker);
    guessLatLng = latlng;

    const icon = L.divIcon({
        className: '',
        html: `<div style="width:20px;height:20px;background:#c8f53a;border:3px solid white;border-radius:50%;box-shadow:0 0 12px rgba(200,245,58,0.8);transform:translate(-50%,-50%)"></div>`,
        iconSize: [1, 1], iconAnchor: [0, 0]
    });
    guessMarker = L.marker(latlng, { icon }).addTo(leafletMap);
    confirmGuessBtn.disabled = false;
    resetGuessBtn.style.display = '';
    mapToggleBtn.classList.add('has-guess');
}

// ═══════════════════════════════════════════════════
// MAP PANEL TOGGLE
// ═══════════════════════════════════════════════════
mapToggleBtn.addEventListener('click', () => {
    const isOpen = mapPanel.style.display !== 'none';
    mapPanel.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) setTimeout(() => leafletMap?.invalidateSize(), 50);
});

mapCloseBtn.addEventListener('click', () => { mapPanel.style.display = 'none'; });

resetGuessBtn.addEventListener('click', () => {
    if (guessMarker) { leafletMap.removeLayer(guessMarker); guessMarker = null; }
    guessLatLng = null;
    confirmGuessBtn.disabled = true;
    resetGuessBtn.style.display = 'none';
    mapToggleBtn.classList.remove('has-guess');
});

// ═══════════════════════════════════════════════════
// CONFIRM GUESS
// ═══════════════════════════════════════════════════
confirmGuessBtn.addEventListener('click', () => {
    if (!guessLatLng || isSubmitted) return;
    submitGuess(guessLatLng.lat, guessLatLng.lng);
});

async function submitGuess(guessLat, guessLng) {
    isSubmitted = true;
    confirmGuessBtn.disabled = true;
    stopTimer();
    mapPanel.style.display = 'none';

    if (!currentLocation) return;

    const dist = haversineKm(guessLat, guessLng, currentLocation.lat, currentLocation.lng);
    const points = distanceToPoints(dist);

    if (IS_SOLO) {
        finishSoloRound(dist, points);
    } else {
        const gameId = `whereami_${ROOM_ID}`;
        await updateRoom(gameId, {
            [`guesses/${currentRound}/${myUID}`]: { lat: guessLat, lng: guessLng, dist, points, name: myName }
        });
        waitingOthersOverlay.style.display = 'flex';
        // Le leader sera notifié via handleRoomUpdate — pas besoin d'appeler checkAllSubmitted
    }
}

async function onTimeUp() {
    if (isSubmitted) return;
    stopTimer();

    if (guessLatLng) {
        // Commit existing guess
        await submitGuess(guessLatLng.lat, guessLatLng.lng);
    } else {
        // No guess — 0 points
        isSubmitted = true;
        if (IS_SOLO) {
            finishSoloRound(null, 0);
        } else {
            const gameId = `whereami_${ROOM_ID}`;
            await updateRoom(gameId, {
                [`guesses/${currentRound}/${myUID}`]: { lat: null, lng: null, dist: null, points: 0, name: myName }
            });
            waitingOthersOverlay.style.display = 'flex';
            checkAllSubmitted();
        }
    }
}

// ═══════════════════════════════════════════════════
// SOLO ROUND FINISH
// ═══════════════════════════════════════════════════
function finishSoloRound(dist, points) {
    totalScore += points;
    roundScores.push({ dist, points });
    hudScore.textContent = totalScore;
    showRoundResult(dist, points, null);
}

// ═══════════════════════════════════════════════════
// MULTIPLAYER: CHECK ALL SUBMITTED
// ═══════════════════════════════════════════════════
async function checkAllSubmitted() {
    const gameId = `whereami_${ROOM_ID}`;
    const data = await getRoom(gameId);
    if (!data) return;

    const players = Object.keys(data.players || {});
    const guesses = Object.keys(data.guesses?.[currentRound] || {});

    if (guesses.length >= players.length) {
        if (data.leader === myUID) {
            const roundGuesses = data.guesses[currentRound];
            const updates = {};
            for (const [uid, g] of Object.entries(roundGuesses)) {
                const prevScore = data.players[uid]?.score || 0;
                updates[`players/${uid}/score`] = prevScore + (g.points || 0);
            }
            updates.state = 'round_result';
            await updateRoom(gameId, updates);
        }
    }
}

function showMultiRoundResult() {
    waitingOthersOverlay.style.display = 'none';
    if (!roomData) return;
    const roundGuesses = roomData.guesses?.[currentRound] || {};
    const myGuess = roundGuesses[myUID];
    showRoundResult(myGuess?.dist ?? null, myGuess?.points ?? 0, roundGuesses);
}

// ═══════════════════════════════════════════════════
// ROUND RESULT UI
// ═══════════════════════════════════════════════════
function showRoundResult(dist, points, allGuesses) {
    const resultEmoji = document.getElementById('resultEmoji');
    const resultTitle = document.getElementById('resultTitle');
    const resultDistance = document.getElementById('resultDistance');
    const resultPoints = document.getElementById('resultPoints');
    const roundScoresDiv = document.getElementById('roundScores');
    const nextRoundBtn = document.getElementById('nextRoundBtn');

    if (dist === null) { resultEmoji.textContent = '😬'; resultTitle.textContent = 'Pas de réponse !'; }
    else if (dist < 50) { resultEmoji.textContent = '🎯'; resultTitle.textContent = 'Incroyable !'; }
    else if (dist < 200) { resultEmoji.textContent = '🔥'; resultTitle.textContent = 'Excellent !'; }
    else if (dist < 1000) { resultEmoji.textContent = '👍'; resultTitle.textContent = 'Bien joué !'; }
    else if (dist < 3000) { resultEmoji.textContent = '😅'; resultTitle.textContent = 'Pas mal !'; }
    else { resultEmoji.textContent = '🗺️'; resultTitle.textContent = 'Un peu loin…'; }

    resultDistance.textContent = dist !== null ? Math.round(dist).toLocaleString('fr-FR') : '—';
    resultPoints.textContent = `+${points}`;

    showResultMap(document.getElementById('resultMap'), dist, allGuesses);

    if (allGuesses && Object.keys(allGuesses).length > 0) {
        roundScoresDiv.style.display = 'flex';
        const sorted = Object.entries(allGuesses).sort((a, b) => (b[1].points || 0) - (a[1].points || 0));
        roundScoresDiv.innerHTML = sorted.map(([uid, g]) =>
            `<div class="gs-score-row" style="${uid === myUID ? 'border-left:3px solid var(--neon-draw);padding-left:11px' : ''}">
                <span>${g.name || 'Joueur'}${uid === myUID ? ' 👈' : ''}</span>
                <span class="gs-score-dist">${g.dist != null ? Math.round(g.dist) + ' km' : '—'}</span>
                <span class="gs-score-pts">+${g.points || 0}</span>
            </div>`
        ).join('');
    } else {
        roundScoresDiv.style.display = 'none';
    }

    const isLastRound = currentRound >= totalRounds;
    nextRoundBtn.textContent = isLastRound ? '🏁 Voir les résultats' : 'Suivant →';
    nextRoundBtn.onclick = () => {
        roundResultOverlay.style.display = 'none';
        phaseListened = false;
        if (IS_SOLO) {
            startNextRound();
        } else {
            if (roomData?.leader === myUID) {
                const gameId = `whereami_${ROOM_ID}`;
                if (isLastRound) {
                    updateRoom(gameId, { state: 'finished' });
                } else {
                    advanceMultiRound(gameId);
                }
            }
            // Non-leaders wait — handleRoomUpdate will trigger
        }
    };

    roundResultOverlay.style.display = 'flex';
}

async function advanceMultiRound(gameId) {
    const nextRound = currentRound + 1;
    const loc = await fetchRandomLocation(roomData?.zone || 'ALL');
    await updateRoom(gameId, {
        state: 'playing',
        currentRound: nextRound,
        currentLocation: loc,
        roundStartedAt: Date.now()
    });
}

// ═══════════════════════════════════════════════════
// RESULT MAP
// ═══════════════════════════════════════════════════
function showResultMap(container, distKm, allGuesses) {  // <- paramètre ajouté
    if (!currentLocation) return;

    if (resultMapInstance) {
        try { resultMapInstance.remove(); } catch (e) { }
        resultMapInstance = null;
    }

    setTimeout(() => {
        resultMapInstance = L.map(container, {
            center: [currentLocation.lat, currentLocation.lng],
            zoom: distKm && distKm < 50 ? 9 : distKm && distKm < 500 ? 5 : 2,
            zoomControl: false, dragging: false, scrollWheelZoom: false,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '', subdomains: 'abcd', maxZoom: 19
        }).addTo(resultMapInstance);

        // Vraie location
        L.marker([currentLocation.lat, currentLocation.lng], {
            icon: L.divIcon({
                className: '',
                html: `<div style="width:16px;height:16px;background:#f5425a;border:3px solid white;border-radius:50%;box-shadow:0 0 10px rgba(245,66,90,0.9);transform:translate(-50%,-50%)"></div>`,
                iconSize: [1, 1], iconAnchor: [0, 0]
            })
        }).bindTooltip('📍 Ici !', { permanent: true, direction: 'top', offset: [0, -10] }).addTo(resultMapInstance);

        // Couleurs distinctes pour chaque joueur
        const PLAYER_COLORS = ['#c8f53a', '#38bdf8', '#fb923c', '#e879f9', '#34d399', '#fbbf24'];
        const bounds = [[currentLocation.lat, currentLocation.lng]];

        if (!IS_SOLO && allGuesses && Object.keys(allGuesses).length > 0) {
            // Mode multi — tous les guesses
            Object.entries(allGuesses).forEach(([uid, g], idx) => {
                if (g.lat == null || g.lng == null) return;
                const color = uid === myUID ? '#c8f53a' : PLAYER_COLORS[(idx + 1) % PLAYER_COLORS.length];
                const label = uid === myUID ? `🎯 ${g.name || 'Toi'}` : (g.name || 'Joueur');

                L.marker([g.lat, g.lng], {
                    icon: L.divIcon({
                        className: '',
                        html: `<div style="width:14px;height:14px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 0 8px ${color}99;transform:translate(-50%,-50%)"></div>`,
                        iconSize: [1, 1], iconAnchor: [0, 0]
                    })
                }).bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -10] }).addTo(resultMapInstance);

                L.polyline([
                    [currentLocation.lat, currentLocation.lng],
                    [g.lat, g.lng]
                ], { color: color + '88', weight: 2, dashArray: '6 4' }).addTo(resultMapInstance);

                bounds.push([g.lat, g.lng]);
            });
        } else if (IS_SOLO && guessLatLng) {
            // Mode solo — juste mon guess
            L.marker([guessLatLng.lat, guessLatLng.lng], {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="width:14px;height:14px;background:#c8f53a;border:2px solid white;border-radius:50%;box-shadow:0 0 8px rgba(200,245,58,0.7);transform:translate(-50%,-50%)"></div>`,
                    iconSize: [1, 1], iconAnchor: [0, 0]
                })
            }).bindTooltip('🎯 Ta réponse', { permanent: true, direction: 'top', offset: [0, -10] }).addTo(resultMapInstance);

            L.polyline([
                [currentLocation.lat, currentLocation.lng],
                [guessLatLng.lat, guessLatLng.lng]
            ], { color: 'rgba(255,255,255,0.35)', weight: 2, dashArray: '6 4' }).addTo(resultMapInstance);

            bounds.push([guessLatLng.lat, guessLatLng.lng]);
        }

        if (bounds.length > 1) {
            try {
                resultMapInstance.fitBounds(bounds, { padding: [40, 40] });
            } catch (e) { }
        }
    }, 120);
}

// ═══════════════════════════════════════════════════
// TIMER
// ═══════════════════════════════════════════════════
function startLocalTimer(seconds) {
    timerWrap.style.display = 'flex';
    startTimerTick(Date.now() + seconds * 1000);
}

function startServerSyncedTimer(serverStartMs, seconds) {
    timerWrap.style.display = 'flex';
    startTimerTick(serverStartMs + seconds * 1000);
}

function startTimerTick(endAtMs) {
    if (timerInterval) clearInterval(timerInterval);
    timerEndAt = endAtMs;

    timerInterval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        timerDisplay.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        timerWrap.classList.toggle('urgent', remaining <= 10);
        if (remaining <= 0) { clearInterval(timerInterval); timerInterval = null; onTimeUp(); }
    }, 250);
}

function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerWrap.classList.remove('urgent');
}

// ═══════════════════════════════════════════════════
// PLAYERS BAR
// ═══════════════════════════════════════════════════
function updatePlayersBar() {
    if (!roomData) return;
    const players = roomData.players || {};
    const submitted = Object.keys(roomData.guesses?.[currentRound] || {});
    playersBar.innerHTML = Object.entries(players).map(([uid, p]) =>
        `<div class="gs-player-status ${submitted.includes(uid) ? 'submitted' : ''}">
            <div class="gs-dot"></div>
            ${p.name} — <strong style="color:var(--gold)">${p.score || 0}</strong>
        </div>`
    ).join('');
}

function updateSubmittedList(players, guessedUIDs) {
    if (!roomData) return;
    const playerMap = roomData.players || {};
    submittedList.innerHTML = guessedUIDs.map(uid =>
        `<div class="gs-player-chip submitted">${playerMap[uid]?.name || 'Joueur'} ✓</div>`
    ).join('');
}

// ═══════════════════════════════════════════════════
// END SCREEN
// ═══════════════════════════════════════════════════
function showEndScreen() {
    stopTimer();
    mapPanel.style.display = 'none';
    roundResultOverlay.style.display = 'none';
    waitingOthersOverlay.style.display = 'none';

    const endEmoji = document.getElementById('endEmoji');
    const endTitle = document.getElementById('endTitle');
    const endScoreEl = document.getElementById('endScore');
    const endSubtitle = document.getElementById('endSubtitle');
    const endStats = document.getElementById('endStats');

    let finalScore = totalScore;

    if (!IS_SOLO && roomData) {
        finalScore = roomData.players?.[myUID]?.score || 0;
        const scores = Object.entries(roomData.players || {}).sort((a, b) => b[1].score - a[1].score);
        const rank = scores.findIndex(([uid]) => uid === myUID) + 1;

        endStats.innerHTML = scores.map(([uid, p], i) =>
            `<div class="gq-end-stat">
                <strong ${uid === myUID ? 'style="color:var(--gold)"' : ''}>${i + 1}. ${p.name}</strong>
                <small>${p.score} pts</small>
            </div>`
        ).join('');

        endEmoji.textContent = rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🌍';
        endTitle.textContent = rank === 1 ? 'Victoire !' : 'Partie terminée !';
        endSubtitle.textContent = `Tu termines ${rank}${rank === 1 ? 'er' : 'ème'} sur ${scores.length} joueurs`;
        sessionStorage.removeItem('whereAmI_room');
    } else {
        const maxPossible = totalRounds * 1000;
        const pct = Math.round(finalScore / maxPossible * 100);
        endEmoji.textContent = pct >= 80 ? '🏆' : pct >= 50 ? '🌟' : '🌍';
        endTitle.textContent = 'Partie terminée !';
        endSubtitle.textContent = `${pct}% du score maximum (${maxPossible} pts)`;

        if (roundScores.length > 0) {
            const validDists = roundScores.filter(r => r.dist != null);
            const bestRound = Math.max(...roundScores.map(r => r.points));
            const avgDist = validDists.length > 0
                ? Math.round(validDists.reduce((a, r) => a + r.dist, 0) / validDists.length)
                : null;
            endStats.innerHTML = `
                <div class="gq-end-stat"><strong>${bestRound}</strong><small>meilleur tour</small></div>
                <div class="gq-end-stat"><strong>${avgDist != null ? avgDist + ' km' : '—'}</strong><small>distance moy.</small></div>
                <div class="gq-end-stat"><strong>${totalRounds}</strong><small>manches</small></div>
            `;
        }
    }

    endScoreEl.textContent = finalScore;

    if (!IS_SOLO && roomData && roomData.leader !== myUID) {
        replayBtn.style.display = 'none';
    } else {
        replayBtn.style.display = '';
    }

    endScreen.style.display = 'flex';
}

// ═══════════════════════════════════════════════════
// SCORING  (0–1000 pts based on distance)
// ═══════════════════════════════════════════════════
function distanceToPoints(km) {
    if (km === null) return 0;
    return Math.round(1000 * Math.max(0, 1 - (km / 5000) ** 0.75));
}

// ═══════════════════════════════════════════════════
// HAVERSINE DISTANCE (km)
// ═══════════════════════════════════════════════════
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════
// REPLAY / BACK
// ═══════════════════════════════════════════════════
replayBtn.addEventListener('click', async () => {
    if (IS_SOLO) {
        window.location.reload();
        return;
    }

    if (roomData?.leader !== myUID) return;

    const gameId = `whereami_${ROOM_ID}`;

    // Cache AVANT d'écrire en DB
    endScreen.style.display = 'none';
    hudScore.textContent = 0;

    // Reset local
    totalScore = 0;
    roundScores = [];
    currentRound = 0;
    currentLocation = null;
    guessLatLng = null;
    isSubmitted = false;
    phaseListened = false;

    if (activeSearchController) {
        activeSearchController.abort();
        activeSearchController = null;
    }

    const playerResets = {};
    for (const [uid] of Object.entries(roomData?.players || {})) {
        playerResets[`players/${uid}/score`] = 0;
    }

    await updateRoom(gameId, {
        ...playerResets,
        state: 'playing',
        currentRound: 1,
        currentLocation: null,
        guesses: null,
        roundStartedAt: Date.now(),
        lastActivity: Date.now(),
    });
    // Plus besoin de cacher ici — déjà fait avant
});

// ═══════════════════════════════════════════════════
// RESTORE SESSION ON REFRESH
// ═══════════════════════════════════════════════════
if (!IS_SOLO) {
    const savedRoom = sessionStorage.getItem('whereAmI_room');
    if (savedRoom && savedRoom !== ROOM_ID) {
        window.location.href = `game.html?room=${savedRoom}`;
    }
}

window.addEventListener('beforeunload', stopTimer);