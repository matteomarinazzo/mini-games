// ============================================================
// ROCKETEER - Parts Catalog
// ============================================================

const PARTS_CATALOG = {

  // ─── COCKPITS ─────────────────────────────────────────────
  cockpit_basic: {
    id: 'cockpit_basic', name: 'Mk1 Cockpit', category: 'cockpit',
    price: 500, mass: 800, width: 40, height: 55, dragCoeff: 0.1,
    attachBottom: true, attachTop: false,
    description: 'Basic crew capsule with standard amenities.',
    svg: `<svg viewBox="0 0 40 55" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Body -->
    <linearGradient id="ck1_body" x1="0" x2="1">
      <stop offset="0%" stop-color="#72839a"/>
      <stop offset="28%" stop-color="#c6d5e2"/>
      <stop offset="58%" stop-color="#eef5fa"/>
      <stop offset="100%" stop-color="#66778f"/>
    </linearGradient>

    <!-- Window -->
    <radialGradient id="ck1_window" cx="45%" cy="34%" r="62%">
      <stop offset="0%" stop-color="#ccecff"/>
      <stop offset="35%" stop-color="#69aee6"/>
      <stop offset="100%" stop-color="#173868"/>
    </radialGradient>

    <!-- Bottom trim -->
    <linearGradient id="ck1_trim" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#95a6ba"/>
      <stop offset="100%" stop-color="#546273"/>
    </linearGradient>

    <!-- Heat shield -->
    <linearGradient id="ck1_heat" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#5f6670"/>
      <stop offset="100%" stop-color="#2c3137"/>
    </linearGradient>
  </defs>

  <!-- Corps (forme améliorée intégrée) -->
  <path d="M20 1 C29 1 35 7 37.5 17.5 L39 35 L39 44 L1 44 L1 35 L2.5 17.5 C5 7 11 1 20 1 Z"
        fill="url(#ck1_body)" stroke="#4b5b70" stroke-width="1.5"/>

  <!-- Highlight gauche (intégré proprement) -->
  <path d="M20 3 C13 4 7.4 10.5 5.6 19.5 L4.2 35 L1 35 L2.5 17.5 C5 7 11 1 20 1 Z"
        fill="#ffffff" opacity="0.18"/>

  <!-- Ligne structure -->
  <path d="M6 15.5 H34" stroke="#d8e3ec" stroke-width="1" opacity="0.55"/>

  <!-- Hublot -->
  <ellipse cx="20" cy="24" rx="11" ry="11.5"
           fill="#0d1d34" stroke="#5f7ea1" stroke-width="1.5"/>
  <ellipse cx="20" cy="24" rx="9" ry="9.5"
           fill="url(#ck1_window)"/>

  <!-- Reflet hublot -->
  <path d="M14 17 C16 14.5 20 13.5 24 14.5 C19 18 16 20.5 13.5 24.5 C12.8 22 13 19.4 14 17 Z"
        fill="#ffffff" opacity="0.2"/>

  <!-- RCS -->
  <circle cx="5" cy="25.5" r="2.3" fill="#5f7489" stroke="#314151" stroke-width="1"/>
  <circle cx="35" cy="25.5" r="2.3" fill="#5f7489" stroke="#314151" stroke-width="1"/>
  <circle cx="5" cy="25.5" r="0.8" fill="#8ed3ff" opacity="0.85"/>
  <circle cx="35" cy="25.5" r="0.8" fill="#8ed3ff" opacity="0.85"/>

  <!-- Heat shield -->
  <path d="M3 44 H37 L35 55 H5 Z"
        fill="url(#ck1_heat)" stroke="#232a31" stroke-width="1.2"/>

  <!-- Panneau bas -->
  <rect x="7" y="45.5" width="26" height="6" rx="2.5"
        fill="url(#ck1_trim)" stroke="#425160" stroke-width="1"/>

  <!-- Détails panneau -->
  <rect x="10" y="47.3" width="20" height="1.7" rx="0.8" fill="#24313d"/>
  <circle cx="12.5" cy="50.5" r="1.3" fill="#2d3946" stroke="#66798c" stroke-width="0.8"/>
  <circle cx="20" cy="50.5" r="1.3" fill="#2d3946" stroke="#66798c" stroke-width="0.8"/>
  <circle cx="27.5" cy="50.5" r="1.3" fill="#2d3946" stroke="#66798c" stroke-width="0.8"/>

  <!-- Rivets -->
  <circle cx="8" cy="36.5" r="1" fill="#7e90a2"/>
  <circle cx="32" cy="36.5" r="1" fill="#7e90a2"/>
</svg>`
  },

  cockpit_advanced: {
    id: 'cockpit_advanced', name: 'Mk2 Command Pod', category: 'cockpit',
    price: 1500, mass: 600, width: 44, height: 52, dragCoeff: 0.08,
    attachBottom: true, attachTop: false,
    description: 'Streamlined advanced capsule for deep space.',
    svg: `<svg viewBox="-1 -1 46 54" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ck2b" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#6888b0"/>
      <stop offset="45%" stop-color="#d0e8f8"/>
      <stop offset="75%" stop-color="#e8f4ff"/>
      <stop offset="100%" stop-color="#5878a0"/>
    </linearGradient>
    <radialGradient id="ck2w" cx="38%" cy="32%" r="62%">
      <stop offset="0%" stop-color="#b0e8ff"/>
      <stop offset="45%" stop-color="#1868c0"/>
      <stop offset="100%" stop-color="#081840"/>
    </radialGradient>
  </defs>
  <!-- Silhouette aéro flat top y=0, flat bottom y=52 -->
  <path d="M22 0 C32 0 44 12 44 26 L44 52 L0 52 L0 26 C0 12 12 0 22 0 Z" fill="url(#ck2b)" stroke="#3a5878" stroke-width="1.5"/>
  <path d="M22 2 C14 5 4 14 3 26 L3 52 L0 52 L0 26 C0 12 12 0 22 0 Z" fill="#ffffff" opacity="0.10"/>
  <!-- Panel bas -->
  <rect x="0" y="42" width="44" height="10" fill="#8aaccc" stroke="#3a5878" stroke-width="1"/>
  <line x1="0" y1="42" x2="44" y2="42" stroke="#28405a" stroke-width="1.5"/>
  <!-- Hublot fuselé -->
  <ellipse cx="22" cy="21" rx="12" ry="14" fill="#081830" stroke="#3a78b0" stroke-width="1.5"/>
  <ellipse cx="22" cy="21" rx="10.5" ry="12.5" fill="url(#ck2w)"/>
  <ellipse cx="17" cy="14" rx="4.5" ry="5.5" fill="#ffffff" opacity="0.15"/>
  <!-- RCS micro latéraux -->
  <circle cx="1" cy="26" r="3" fill="#5080a0" stroke="#3a6080" stroke-width="1"/>
  <circle cx="1" cy="26" r="1.2" fill="#60c0ff" opacity="0.7"/>
  <circle cx="43" cy="26" r="3" fill="#5080a0" stroke="#3a6080" stroke-width="1"/>
  <circle cx="43" cy="26" r="1.2" fill="#60c0ff" opacity="0.7"/>
  <!-- Panel commandes bas -->
  <rect x="9" y="44" width="26" height="4" rx="2" fill="#283848" stroke="#405868" stroke-width="1"/>
  <circle cx="15" cy="46" r="1.2" fill="#40ff80" opacity="0.9"/>
  <circle cx="22" cy="46" r="1.2" fill="#ffaa20" opacity="0.9"/>
  <circle cx="29" cy="46" r="1.2" fill="#ff4040" opacity="0.9"/>
</svg>`
  },

  // ─── FUEL TANKS ───────────────────────────────────────────
  tank_small: {
    id: 'tank_small', name: 'FL-T100 Tank', category: 'tank',
    price: 150, mass: 500, fuelMass: 450, width: 40, height: 50,
    dragCoeff: 0.05, attachTop: true, attachBottom: true, attachSide: true,
    description: 'Small fuel tank.',
    svg: `<svg viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tsb" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#707070"/>
      <stop offset="20%" stop-color="#c8c8c8"/>
      <stop offset="42%" stop-color="#e4e4e4"/>
      <stop offset="70%" stop-color="#d0d0d0"/>
      <stop offset="100%" stop-color="#686868"/>
    </linearGradient>
    <linearGradient id="tsr" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#505050"/>
      <stop offset="42%" stop-color="#909090"/>
      <stop offset="100%" stop-color="#484848"/>
    </linearGradient>
  </defs>
  
  <!-- Corps plat y=0 à y=50 -->
  <rect x="0" y="0" width="40" height="50" fill="url(#tsb)" stroke="#505050" stroke-width="1.5"/>
  
  <!-- Anneaux de jonction EN BORD (y=0 et y=45) -->
  <rect x="0" y="0" width="40" height="5" fill="url(#tsr)" stroke="#404040" stroke-width="1"/>
  <rect x="0" y="45" width="40" height="5" fill="url(#tsr)" stroke="#404040" stroke-width="1"/>
  
  <!-- Anneau milieu -->
  <rect x="0" y="23.75" width="40" height="2.5" fill="#888" opacity="0.5"/>
  
  <!-- Label -->
  <rect x="5" y="18" width="30" height="14" rx="2" fill="#606060" opacity="0.22"/>
  <text x="20" y="27" text-anchor="middle" font-size="6.5" fill="#404040" font-family="monospace" font-weight="bold">FL-T100</text>
  
  <!-- Rivets -->
  <circle cx="4" cy="8" r="1" fill="#909090"/>
  <circle cx="36" cy="8" r="1" fill="#909090"/>
  <circle cx="4" cy="42" r="1" fill="#909090"/>
  <circle cx="36" cy="42" r="1" fill="#909090"/>
</svg>`
  },

  tank_medium: {
    id: 'tank_medium', name: 'FL-T400 Tank', category: 'tank',
    price: 500, mass: 2000, fuelMass: 1800, width: 40, height: 90,
    dragCoeff: 0.05, attachTop: true, attachBottom: true, attachSide: true,
    description: 'Medium fuel tank.',
    svg: `<svg viewBox="0 0 40 90" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tmb" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#686868"/>
      <stop offset="20%" stop-color="#c0c0c0"/>
      <stop offset="42%" stop-color="#e2e2e2"/>
      <stop offset="70%" stop-color="#c8c8c8"/>
      <stop offset="100%" stop-color="#606060"/>
    </linearGradient>
    <linearGradient id="tmr" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#484848"/>
      <stop offset="42%" stop-color="#888"/>
      <stop offset="100%" stop-color="#404040"/>
    </linearGradient>
  </defs>
  
  <!-- Corps y=0 à y=90 -->
  <rect x="0" y="0" width="40" height="90" fill="url(#tmb)" stroke="#505050" stroke-width="1.5"/>
  
  <!-- Anneaux bords -->
  <rect x="0" y="0" width="40" height="5" fill="url(#tmr)" stroke="#404040" stroke-width="1"/>
  <rect x="0" y="85" width="40" height="5" fill="url(#tmr)" stroke="#404040" stroke-width="1"/>
  
  <!-- Anneaux intermédiaires -->
  <rect x="0" y="28.75" width="40" height="2.5" fill="#888" opacity="0.4"/>
  <rect x="0" y="58.75" width="40" height="2.5" fill="#888" opacity="0.4"/>
  
  <!-- Label -->
  <rect x="5" y="38" width="30" height="14" rx="2" fill="#606060" opacity="0.20"/>
  <text x="20" y="47" text-anchor="middle" font-size="6.5" fill="#404040" font-family="monospace" font-weight="bold">FL-T400</text>
  
  <!-- Rivets -->
  <circle cx="4" cy="8" r="1" fill="#909090"/>
  <circle cx="36" cy="8" r="1" fill="#909090"/>
  <circle cx="4" cy="82" r="1" fill="#909090"/>
  <circle cx="36" cy="82" r="1" fill="#909090"/>
</svg>`
  },

  tank_long: {
    id: 'tank_long', name: 'FL-T800 Tank', category: 'tank',
    price: 900, mass: 4000, fuelMass: 3600, width: 40, height: 140,
    dragCoeff: 0.05, attachTop: true, attachBottom: true, attachSide: true,
    description: 'Long vertical tank for multi-stage rockets.',
    svg: `<svg viewBox="0 0 40 140" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tlong_body" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#606060"/>
      <stop offset="20%" stop-color="#c8c8c8"/>
      <stop offset="42%" stop-color="#e6e6e6"/>
      <stop offset="70%" stop-color="#c4c4c4"/>
      <stop offset="100%" stop-color="#585858"/>
    </linearGradient>
    <linearGradient id="tlong_ring" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#484848"/>
      <stop offset="42%" stop-color="#8c8c8c"/>
      <stop offset="100%" stop-color="#404040"/>
    </linearGradient>
  </defs>

  <!-- Corps principal y=0 à y=140 -->
  <rect x="0" y="0" width="40" height="140" fill="url(#tlong_body)" stroke="#404040" stroke-width="1.5"/>

  <!-- Anneaux bords -->
  <rect x="0" y="0" width="40" height="5" fill="url(#tlong_ring)" stroke="#404040" stroke-width="1"/>
  <rect x="0" y="135" width="40" height="5" fill="url(#tlong_ring)" stroke="#404040" stroke-width="1"/>

  <!-- Anneaux intermédiaires -->
  <rect x="0" y="46.66" width="40" height="2.5" fill="#888888" opacity="0.45"/>
  <rect x="0" y="93.33" width="40" height="2.5" fill="#888888" opacity="0.45"/>

  <!-- Label central -->
  <rect x="5" y="63" width="30" height="14" rx="3" fill="#606060" opacity="0.22"/>
  <text x="20" y="72" text-anchor="middle" font-size="7" fill="#404040"
        font-family="monospace" font-weight="bold">FL-T800</text>

  <!-- Rivets -->
  <circle cx="4" cy="8" r="1" fill="#909090"/>
  <circle cx="36" cy="8" r="1" fill="#909090"/>
  <circle cx="4" cy="132" r="1" fill="#909090"/>
  <circle cx="36" cy="132" r="1" fill="#909090"/>
</svg>`

  },

  tank_large: {
    id: 'tank_large', name: 'Jumbo-64 Tank', category: 'tank',
    price: 2000, mass: 8000, fuelMass: 7200, width: 56, height: 120,
    dragCoeff: 0.06, attachTop: true, attachBottom: true, attachSide: true,
    description: 'Large orange fuel tank.',
    svg: `<svg viewBox="0 0 56 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tlb" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#7a2e08"/>
      <stop offset="20%" stop-color="#d06020"/>
      <stop offset="42%" stop-color="#f89040"/>
      <stop offset="70%" stop-color="#e07030"/>
      <stop offset="100%" stop-color="#6a2408"/>
    </linearGradient>
    <linearGradient id="tlr" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#501800"/>
      <stop offset="50%" stop-color="#a04010"/>
      <stop offset="100%" stop-color="#481400"/>
    </linearGradient>
  </defs>

  <!-- Corps y=0 à y=120 -->
  <rect x="0" y="0" width="56" height="120" fill="url(#tlb)" stroke="#5a1e04" stroke-width="2"/>
  
  <!-- Anneaux bords -->
  <rect x="0" y="0" width="56" height="7" fill="url(#tlr)" stroke="#3a1000" stroke-width="1.5"/>
  <rect x="0" y="113" width="56" height="7" fill="url(#tlr)" stroke="#3a1000" stroke-width="1.5"/>
 
  <!-- Anneaux structuraux -->
  <rect x="0" y="38.75" width="56" height="3.5" fill="#703010" opacity="0.7"/>
  <rect x="0" y="78.75" width="56" height="3.5" fill="#703010" opacity="0.7"/>
  
  <!-- Label -->
  <rect x="5" y="49" width="46" height="22" rx="3" fill="#6a2808" opacity="0.4"/>
  <text x="28" y="58.8" text-anchor="middle" font-size="8" fill="#3a1000" font-family="monospace" font-weight="bold">JUMBO</text>
  <text x="28" y="65.3" text-anchor="middle" font-size="7" fill="#3a1000" font-family="monospace">— 64 —</text>
  
  <!-- Rivets -->
  <circle cx="5" cy="12" r="1.8" fill="#c05820"/>
  <circle cx="51" cy="12" r="1.8" fill="#c05820"/>
  <circle cx="5" cy="108" r="1.8" fill="#c05820"/>
  <circle cx="51" cy="108" r="1.8" fill="#c05820"/>
</svg>`
  },

  tank_wide: {
    id: 'tank_wide', name: 'X200-32 Tank', category: 'tank',
    price: 2600, mass: 10000, fuelMass: 9000, width: 64, height: 120,
    dragCoeff: 0.06, attachTop: true, attachBottom: true, attachSide: true,
    description: 'Wide heavy tank for high thrust stages.',
    svg: `<svg viewBox="0 0 64 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tw_body" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#503010"/>
      <stop offset="20%" stop-color="#c87830"/>
      <stop offset="42%" stop-color="#f0a050"/>
      <stop offset="70%" stop-color="#c06828"/>
      <stop offset="100%" stop-color="#3e2208"/>
    </linearGradient>
    <linearGradient id="tw_ring" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#401c08"/>
      <stop offset="42%" stop-color="#904018"/>
      <stop offset="100%" stop-color="#341404"/>
    </linearGradient>
  </defs>

  <!-- Corps y=0 à y=120 -->
  <rect x="0" y="0" width="64" height="120" fill="url(#tw_body)" stroke="#301800" stroke-width="2"/>

  <!-- Anneaux bords -->
  <rect x="0" y="0" width="64" height="7" fill="url(#tw_ring)" stroke="#2a1004" stroke-width="1.5"/>
  <rect x="0" y="113" width="64" height="7" fill="url(#tw_ring)" stroke="#2a1004" stroke-width="1.5"/>

  <!-- Anneaux structuraux -->
  <rect x="0" y="38.25" width="64" height="3.5" fill="#703010" opacity="0.7"/>
  <rect x="0" y="78.25" width="64" height="3.5" fill="#703010" opacity="0.7"/>

  <!-- Label -->
  <rect x="5" y="49" width="54" height="22" rx="3" fill="#5a2808" opacity="0.45"/>
  <text x="32" y="58.8" text-anchor="middle" font-size="8" fill="#2a1000" font-family="monospace" font-weight="bold">X200</text>
  <text x="32" y="65.3" text-anchor="middle" font-size="7" fill="#2a1000" font-family="monospace">— 32 —</text>

  <!-- Rivets -->
  <circle cx="6" cy="12" r="1.6" fill="#c05820"/>
  <circle cx="58" cy="12" r="1.6" fill="#c05820"/>
  <circle cx="6" cy="108" r="1.6" fill="#c05820"/>
  <circle cx="58" cy="108" r="1.6" fill="#c05820"/>
</svg>`
  },

  tank_side: {
    id: 'tank_side', name: 'Oscar-B Tank', category: 'tank',
    price: 70, mass: 225, fuelMass: 200, width: 24, height: 32,
    dragCoeff: 0.06, attachTop: false, attachBottom: false, attachSide: true, isSidePart: true,
    description: 'Compact side-mountable fuel tank.',
    svg: `<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tsdb" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#3a5878"/>
      <stop offset="20%" stop-color="#8ab0d0"/>
      <stop offset="42%" stop-color="#a0c8e8"/>
      <stop offset="70%" stop-color="#507090"/>
      <stop offset="100%" stop-color="#284058"/>
    </linearGradient>
    <linearGradient id="tsdr" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#283848"/>
      <stop offset="42%" stop-color="#607898"/>
      <stop offset="100%" stop-color="#203040"/>
    </linearGradient>
  </defs>
  
  <!-- Corps y=0 à y=32 -->
  <rect x="0" y="0" width="24" height="32" rx="5" fill="url(#tsdb)" stroke="#305068" stroke-width="1.5"/>
  
  <!-- Anneaux bords -->
  <rect x="0" y="0" width="24" height="3" rx="1" fill="url(#tsdr)" stroke="#203040" stroke-width="1"/>
  <rect x="0" y="29" width="24" height="3" rx="1" fill="url(#tsdr)" stroke="#203040" stroke-width="1"/>
  
  <!-- Anneaux structuraux -->
  <rect x="0" y="15" width="24" height="2" rx="1" fill="#406080" opacity="0.7"/>
  
  <!-- Label -->
  <rect x="2" y="11" width="20" height="10" rx="2" fill="#39516aff" opacity="0.6"/>
  <text x="12" y="17.3" text-anchor="middle" font-size="4.5" fill="#203040" font-family="monospace" font-weight="bold">OSCAR-B</text>
</svg>`
  },

  // ─── ENGINES ──────────────────────────────────────────────
  engine_spark: {
    id: 'engine_spark', name: 'Spark Engine', category: 'engine',
    price: 200, mass: 130, thrust: 18000, isp: 265, width: 20, height: 28,
    dragCoeff: 0.2, attachTop: true, attachBottom: false, gimbal: 3,
    description: 'Small lightweight engine for upper stages.',
    svg: `<svg viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="esp_body4" x1="0" x2="1">
      <stop offset="0%" stop-color="#39414d"/>
      <stop offset="42%" stop-color="#8d99ab"/>
      <stop offset="100%" stop-color="#2b313b"/>
    </linearGradient>

    <linearGradient id="esp_bell4" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#7c8797"/>
      <stop offset="100%" stop-color="#20252e"/>
    </linearGradient>

    <radialGradient id="esp_core4" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#d9ecff"/>
      <stop offset="42%" stop-color="#72a8de"/>
      <stop offset="100%" stop-color="#1a3152"/>
    </radialGradient>
  </defs>

  <!-- Cap -->
  <rect x="3.2" y="0" width="13.6" height="3.4" rx="1.5"
        fill="url(#esp_body4)" stroke="#1a2028" stroke-width="0.8"/>

  <!-- Body -->
  <path d="M3.8 3.4 L16.2 3.4 L18.4 11.5 L14.8 17.6 L5.2 17.6 L1.6 11.5 Z"
        fill="url(#esp_body4)" stroke="#2b313a" stroke-width="1"/>

  <!-- Core housing -->
  <ellipse cx="10" cy="8.3" rx="4.2" ry="3.1"
           fill="#202633" stroke="#526176" stroke-width="0.9"/>

  <ellipse cx="10" cy="8.3" rx="2.6" ry="2"
           fill="url(#esp_core4)"/>

  <circle cx="10" cy="8.3" r="0.8" fill="#eef7ff"/>

  <!-- Bell -->
  <path d="M5.2 17.6 L3.3 28 L16.7 28 L14.8 17.6 Z"
        fill="url(#esp_bell4)" stroke="#171c24" stroke-width="1"/>

  <!-- Internal structure -->
  <path d="M7 17.8 L6 27.5 M13 17.8 L14 27.5"
        stroke="#616c7c" stroke-width="0.8" opacity="0.55"/>

  <ellipse cx="10" cy="17.6" rx="5.1" ry="1.7"
           fill="#555f70" opacity="0.7"/>

  <!-- Side conduits -->
  <path d="M4.8 4.5 C2.4 7.5 2.4 12 4.7 14.8"
        stroke="#768292" stroke-width="0.8" fill="none"/>

  <path d="M15.2 4.5 C17.6 7.5 17.6 12 15.3 14.8"
        stroke="#768292" stroke-width="0.8" fill="none"/>

  <!-- Mount points -->
  <circle cx="5.2" cy="1.8" r="0.8" fill="#95a0b0"/>
  <circle cx="14.8" cy="1.8" r="0.8" fill="#95a0b0"/>
</svg>`
  },

  engine_vacuum: {
    id: 'engine_vacuum', name: 'Poodle Vacuum Engine', category: 'engine',
    price: 2500, mass: 1800, thrust: 90000, isp: 350,
    width: 42, height: 60, dragCoeff: 0.18, attachTop: true,
    gimbal: 6,
    description: 'Efficient engine for space.',
    svg: `<svg viewBox="0 0 48 78" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ev_dark4" x1="0" x2="1">
      <stop offset="0%" stop-color="#2d333d"/>
      <stop offset="42%" stop-color="#7e8a9e"/>
      <stop offset="100%" stop-color="#20252d"/>
    </linearGradient>

    <linearGradient id="ev_bell4" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#7a8596"/>
      <stop offset="100%" stop-color="#171c23"/>
    </linearGradient>

    <radialGradient id="ev_core4" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#d8ebff"/>
      <stop offset="42%" stop-color="#7baee4"/>
      <stop offset="100%" stop-color="#173355"/>
    </radialGradient>
  </defs>

  <!-- Top mount -->
  <rect x="10" y="0" width="28" height="4.2" rx="1.5"
        fill="url(#ev_dark4)" stroke="#141922" stroke-width="0.9"/>

  <!-- Upper truss -->
  <path d="M10 4.2 L14.5 11.8 L33.5 11.8 L38 4.2"
        fill="none" stroke="#798597" stroke-width="1.1"/>

  <path d="M13 4.2 L19 11.8 M18 4.2 L24 11.8 M23 4.2 L29 11.8 M28 4.2 L34 11.8"
        stroke="#5c6776" stroke-width="0.85"/>

  <!-- Upper chamber -->
  <ellipse cx="24" cy="17.5" rx="8.5" ry="5.4"
           fill="#242b37" stroke="#566476" stroke-width="1.1"/>

  <ellipse cx="24" cy="17.5" rx="5.5" ry="3.3"
           fill="url(#ev_core4)"/>

  <circle cx="24" cy="17.5" r="1.2" fill="#edf7ff"/>

  <!-- Structural shell -->
  <path d="M12 12.2 L8 25 L40 25 L36 12.2 Z"
        fill="url(#ev_dark4)" stroke="#252b35" stroke-width="1.2"/>

  <path d="M15 12.8 C10 18 8.5 24 8 28"
        stroke="#8b97a7" stroke-width="1" fill="none"/>

  <path d="M33 12.8 C38 18 39.5 24 40 28"
        stroke="#8b97a7" stroke-width="1" fill="none"/>

  <!-- Vacuum bell (main body) -->
  <path d="M8 25 L4 78 L44 78 L40 25 Z"
        fill="url(#ev_bell4)" stroke="#141920" stroke-width="1.6"/>

  <!-- Internal ring structure -->
  <ellipse cx="24" cy="32" rx="13" ry="3"
           fill="#313949" opacity="0.46"/>
  <ellipse cx="24" cy="43" rx="16" ry="3"
           fill="#313949" opacity="0.34"/>
  <ellipse cx="24" cy="56" rx="18" ry="3"
           fill="#313949" opacity="0.28"/>

  <path d="M16 25 L13 77 M32 25 L35 77"
        stroke="#606b7c" stroke-width="1" opacity="0.5"/>

  <path d="M24 25 L24 77"
        stroke="#566172" stroke-width="0.8" opacity="0.35"/>

  <!-- Bottom rim -->
  <rect x="5" y="75.6" width="38" height="2.2" rx="1"
        fill="#697486"/>

  <!-- Mount points -->
  <circle cx="16" cy="6.4" r="1.1" fill="#9aa5b4"/>
  <circle cx="32" cy="6.4" r="1.1" fill="#9aa5b4"/>
</svg>`
  },

  engine_reliant: {
    id: 'engine_reliant', name: 'LV-T45 Reliant', category: 'engine',
    price: 900, mass: 1250, thrust: 200000, isp: 300,
    width: 36, height: 44, dragCoeff: 0.2, attachTop: true,
    gimbal: 0,
    description: 'High thrust, no gimbal engine.',
    svg: `<svg viewBox="0 0 42 52" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Métal sombre -->
    <linearGradient id="rl_dark" x1="0" x2="1">
      <stop offset="0%" stop-color="#2a2f38"/>
      <stop offset="42%" stop-color="#505868"/>
      <stop offset="100%" stop-color="#1c2028"/>
    </linearGradient>

    <!-- Cuivre chambre -->
    <linearGradient id="rl_copper" x1="0" x2="1">
      <stop offset="0%" stop-color="#8a4c20"/>
      <stop offset="42%" stop-color="#d08840"/>
      <stop offset="100%" stop-color="#5a2c10"/>
    </linearGradient>

    <!-- Tuyère courte -->
    <linearGradient id="rl_nozzle" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#707888"/>
      <stop offset="100%" stop-color="#202430"/>
    </linearGradient>

    <!-- Glow interne -->
    <radialGradient id="rl_core" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#90b0ff"/>
      <stop offset="100%" stop-color="#202840"/>
    </radialGradient>

    <!-- Panneaux thermiques -->
    <linearGradient id="rl_panel" x1="0" x2="1">
      <stop offset="0%" stop-color="#3a3f48"/>
      <stop offset="100%" stop-color="#1c1f26"/>
    </linearGradient>
  </defs>

  <!-- Support supérieur -->
  <rect x="8" y="0" width="26" height="5" rx="1.5" fill="url(#rl_dark)" stroke="#101418" stroke-width="1.2"/>

  <!-- Turbopompe principale -->
  <ellipse cx="32" cy="12" rx="6" ry="7" fill="url(#rl_dark)" stroke="#202830" stroke-width="1.4"/>
  <circle cx="32" cy="12" r="3" fill="#303848"/>
  <line x1="28" y1="7" x2="20" y2="5" stroke="#9098a8" stroke-width="1.2"/>
  <line x1="28" y1="17" x2="20" y2="25" stroke="#9098a8" stroke-width="1.2"/>

  <!-- Conduites LOX / RP1 -->
  <path d="M30 8 C22 10, 18 14, 16 20" stroke="#c0d0e0" stroke-width="1.4" fill="none"/>
  <path d="M30 16 C22 18, 18 22, 16 28" stroke="#805020" stroke-width="1.4" fill="none"/>

  <!-- Chambre de combustion cuivre -->
  <ellipse cx="21" cy="18" rx="11" ry="7" fill="url(#rl_copper)" stroke="#402010" stroke-width="1.6"/>
  <ellipse cx="21" cy="18" rx="7" ry="4" fill="url(#rl_core)"/>
  <circle cx="21" cy="18" r="1.6" fill="#c0d0ff"/>

  <!-- Panneaux thermiques -->
  <rect x="7" y="10" width="6" height="14" rx="2" fill="url(#rl_panel)" opacity="0.9"/>
  <rect x="29" y="10" width="6" height="14" rx="2" fill="url(#rl_panel)" opacity="0.9"/>

  <!-- Tuyère courte et épaisse -->
  <path d="M10 25 L6 52 L36 52 L32 25 Z"
        fill="url(#rl_nozzle)" stroke="#141820" stroke-width="1.8"/>

  <!-- Stries internes -->
  <line x1="15" y1="25" x2="13" y2="52" stroke="#505868" stroke-width="1" opacity="0.45"/>
  <line x1="27" y1="25" x2="29" y2="52" stroke="#505868" stroke-width="1" opacity="0.45"/>

  <!-- Anneaux structurels -->
  <rect x="8" y="23" width="26" height="3" rx="1.5" fill="#303840" opacity="0.7"/>
  <rect x="8" y="48" width="26" height="2" rx="1" fill="#505868" opacity="0.8"/>

  <!-- Rivets -->
  <circle cx="12" cy="3" r="1" fill="#9098a8"/>
  <circle cx="30" cy="3" r="1" fill="#9098a8"/>
</svg>`
  },

  engine_swivel: {
    id: 'engine_swivel', name: 'LV-T30 Swivel', category: 'engine',
    price: 1200, mass: 1500, thrust: 215000, isp: 320, width: 38, height: 48,
    dragCoeff: 0.2, attachTop: true, attachBottom: false, gimbal: 8,
    description: 'Reliable gimballed engine.',
    svg: `<svg viewBox="0 0 46 60" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="esw_dark4" x1="0" x2="1">
      <stop offset="0%" stop-color="#2b3039"/>
      <stop offset="42%" stop-color="#728094"/>
      <stop offset="100%" stop-color="#1e232b"/>
    </linearGradient>

    <linearGradient id="esw_ring4" x1="0" x2="1">
      <stop offset="0%" stop-color="#505968"/>
      <stop offset="42%" stop-color="#a2adba"/>
      <stop offset="100%" stop-color="#454e5d"/>
    </linearGradient>

    <linearGradient id="esw_bell4" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#7b8698"/>
      <stop offset="100%" stop-color="#171c24"/>
    </linearGradient>

    <radialGradient id="esw_core4" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#d9edff"/>
      <stop offset="42%" stop-color="#76abe2"/>
      <stop offset="100%" stop-color="#1b3558"/>
    </radialGradient>
  </defs>

  <!-- Top mount -->
  <rect x="8" y="0" width="30" height="5" rx="2"
        fill="url(#esw_dark4)" stroke="#141921" stroke-width="1"/>

  <!-- Gimbal actuators -->
  <rect x="4.5" y="6.5" width="5.8" height="13.8" rx="2"
        fill="url(#esw_ring4)" stroke="#28303a" stroke-width="0.9"/>
  <rect x="35.7" y="6.5" width="5.8" height="13.8" rx="2"
        fill="url(#esw_ring4)" stroke="#28303a" stroke-width="0.9"/>

  <path d="M6.8 8.2 C3.4 13.8 3.2 20.5 7.8 27.2"
        stroke="#8893a2" stroke-width="0.95" fill="none"/>

  <path d="M39.2 8.2 C42.6 13.8 42.8 20.5 38.2 27.2"
        stroke="#8893a2" stroke-width="0.95" fill="none"/>

  <!-- Main body -->
  <path d="M6 5 L40 5 L44 22 L34 33 L12 33 L2 22 Z"
        fill="url(#esw_dark4)" stroke="#232933" stroke-width="1.4"/>

  <!-- Combustion chamber -->
  <ellipse cx="23" cy="15.7" rx="10.6" ry="6.8"
           fill="#242b37" stroke="#566576" stroke-width="1.3"/>

  <ellipse cx="23" cy="15.7" rx="7.3" ry="4.5"
           fill="url(#esw_core4)"/>

  <circle cx="23" cy="15.7" r="1.1" fill="#eef8ff"/>

  <!-- Gimbal ring -->
  <ellipse cx="23" cy="33.3" rx="14.2" ry="4.1"
           fill="url(#esw_ring4)" stroke="#2f3742" stroke-width="1.1"/>

  <circle cx="10.2" cy="33.3" r="1" fill="#c2ccd6"/>
  <circle cx="35.8" cy="33.3" r="1" fill="#c2ccd6"/>

  <!-- Nozzle -->
  <path d="M13 33.3 L8.5 60 L37.5 60 L33 33.3 Z"
        fill="url(#esw_bell4)" stroke="#171c24" stroke-width="1.6"/>

  <path d="M17.5 34 L15.5 59.2 M28.5 34 L30.5 59.2"
        stroke="#616c7c" stroke-width="0.9" opacity="0.5"/>

  <!-- Side conduits -->
  <path d="M12.8 9.5 C8.5 14 8 19 10.2 24.2"
        stroke="#97a2b0" stroke-width="1" fill="none"/>

  <path d="M33.2 9.5 C37.5 14 38 19 35.8 24.2"
        stroke="#97a2b0" stroke-width="1" fill="none"/>
</svg>`
  },

  engine_mainsail: {
    id: 'engine_mainsail', name: 'RE-M3 Mainsail', category: 'engine',
    price: 13000, mass: 6000, thrust: 1500000, isp: 310, width: 64, height: 72,
    dragCoeff: 0.25, attachTop: true, attachBottom: false, gimbal: 10,
    description: 'Massive high-thrust engine.',
    svg: `<svg viewBox="0 0 70 90" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ems_dark4" x1="0" x2="1">
      <stop offset="0%" stop-color="#272c37"/>
      <stop offset="20%" stop-color="#707c92"/>
      <stop offset="42%" stop-color="#99a4ba"/>
      <stop offset="70%" stop-color="#707c92"/>
      <stop offset="100%" stop-color="#1e232e"/>
    </linearGradient>

    <linearGradient id="ems_ring4" x1="0" x2="1">
      <stop offset="0%" stop-color="#525b69"/>
      <stop offset="42%" stop-color="#9ea9b7"/>
      <stop offset="100%" stop-color="#454d5c"/>
    </linearGradient>

    <linearGradient id="ems_bell4" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#737d8f"/>
      <stop offset="100%" stop-color="#151922"/>
    </linearGradient>

    <radialGradient id="ems_core4" cx="50%" cy="38%" r="55%">
      <stop offset="0%" stop-color="#dbeeff"/>
      <stop offset="42%" stop-color="#77abdf"/>
      <stop offset="100%" stop-color="#163255"/>
    </radialGradient>
  </defs>

  <!-- Top mount -->
  <rect x="12" y="0" width="46" height="6" rx="1.5"
        fill="url(#ems_dark4)" stroke="#141922" stroke-width="1.1"/>

  <!-- Side turbopumps -->
  <rect x="4" y="8" width="11" height="22" rx="3"
        fill="url(#ems_ring4)" stroke="#28303a" stroke-width="1.1"/>

  <circle cx="9.5" cy="19" r="3.8"
          fill="#2f3540" stroke="#5d6979" stroke-width="1"/>

  <rect x="55" y="8" width="11" height="22" rx="3"
        fill="url(#ems_ring4)" stroke="#28303a" stroke-width="1.1"/>

  <circle cx="60.5" cy="19" r="3.8"
          fill="#2f3540" stroke="#5d6979" stroke-width="1"/>

  <!-- Feed lines -->
  <path d="M15.5 10.5 C20.5 18 22.5 24.5 22.7 32.2"
        stroke="#97a3b3" stroke-width="1.2" fill="none"/>

  <path d="M54.5 10.5 C49.5 18 47.5 24.5 47.3 32.2"
        stroke="#97a3b3" stroke-width="1.2" fill="none"/>

  <!-- Main body -->
  <path d="M10 6 L60 6 L68 29 L54 51 L16 51 L2 29 Z"
        fill="url(#ems_dark4)" stroke="#242a34" stroke-width="1.8"/>

  <!-- Combustion chamber -->
  <ellipse cx="35" cy="22" rx="17.5" ry="11.5"
           fill="#212734" stroke="#546475" stroke-width="1.8"/>

  <ellipse cx="35" cy="22" rx="13.2" ry="8.3"
           fill="url(#ems_core4)"/>

  <circle cx="35" cy="22" r="5.1"
          fill="#19314c" stroke="#4770a9" stroke-width="1.3"/>

  <circle cx="35" cy="22" r="1.3" fill="#eef8ff"/>

  <!-- Gimbal ring -->
  <ellipse cx="35" cy="51" rx="19.8" ry="4.9"
           fill="url(#ems_ring4)" stroke="#2d3540" stroke-width="1.4"/>

  <!-- Nozzle -->
  <path d="M16 51 L8 90 L62 90 L54 51 Z"
        fill="url(#ems_bell4)" stroke="#151a22" stroke-width="2"/>

  <!-- Internal structure -->
  <path d="M22 52 L18 89 M48 52 L52 89"
        stroke="#626d7d" stroke-width="1.1" opacity="0.5"/>

  <path d="M35 52 L35 88"
        stroke="#566171" stroke-width="0.85" opacity="0.35"/>

  <!-- Exhaust shaping -->
  <ellipse cx="35" cy="61" rx="22.5" ry="3.1"
           fill="#313949" opacity="0.3"/>

  <ellipse cx="35" cy="74" rx="25" ry="3.1"
           fill="#313949" opacity="0.22"/>

  <!-- Bottom rim -->
  <rect x="9" y="87.6" width="52" height="2.2" rx="1"
        fill="#687386"/>

  <!-- Mount rivets -->
  <circle cx="20" cy="3.3" r="1.4" fill="#9ea8b6"/>
  <circle cx="50" cy="3.3" r="1.4" fill="#9ea8b6"/>
</svg>`
  },

  engine_side: {
    id: 'engine_side', name: 'Thud Booster', category: 'engine',
    price: 820, mass: 900, thrust: 120000, isp: 275, width: 22, height: 30,
    dragCoeff: 0.2, attachTop: false, attachBottom: false, attachSide: true, isSidePart: true, gimbal: 4,
    description: 'Side-mountable booster engine.',
    svg: `<svg viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
  <defs>
  <linearGradient id="eth_body4" x1="0" x2="1">
    <stop offset="0%" stop-color="#45280d"/>
    <stop offset="20%" stop-color="#8c4614"/>
    <stop offset="42%" stop-color="#d4955a"/>
    <stop offset="70%" stop-color="#7a3e12"/>
    <stop offset="100%" stop-color="#351f0a"/>
  </linearGradient>
    <linearGradient id="eth_bell4" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#8d6b4d"/>
      <stop offset="100%" stop-color="#24170d"/>
    </linearGradient>
    <radialGradient id="eth_core4" cx="50%" cy="40%" r="52%">
      <stop offset="0%" stop-color="#fff0cd"/>
      <stop offset="42%" stop-color="#ff9d46"/>
      <stop offset="100%" stop-color="#6b260e"/>
    </radialGradient>
  </defs>

  <!-- Side mount bracket -->
  <rect x="0" y="10" width="5.2" height="18" rx="2"
        fill="#5a6169" stroke="#2d3339" stroke-width="1"/>
  <circle cx="3.2" cy="14.2" r="1" fill="#c2cad2"/>
  <circle cx="3.2" cy="24" r="1" fill="#c2cad2"/>

  <!-- Main body -->
  <path d="M6 0 L24 0 L28 18 L22 31.5 L10 31.5 L4 18 Z"
        fill="url(#eth_body4)" stroke="#321d0d" stroke-width="1.4"/>

  <!-- Combustion chamber -->
  <ellipse cx="16" cy="11.8" rx="6.6" ry="5.1"
           fill="#3a1c0b" stroke="#7d5735" stroke-width="1"/>

  <ellipse cx="16" cy="11.8" rx="4.2" ry="3.2"
           fill="url(#eth_core4)"/>

  <circle cx="16" cy="11.8" r="0.9" fill="#fff4df"/>

  <!-- Nozzle -->
  <path d="M10 31.5 L8 42 L24 42 L22 31.5 Z"
        fill="url(#eth_bell4)" stroke="#171008" stroke-width="1.2"/>

  <!-- Structural arcs -->
  <path d="M21.7 7.7 C25.4 12.4 25.6 19.2 21.8 27.4"
        stroke="#d4b084" stroke-width="1" fill="none"/>

  <path d="M10.2 6.2 C6.7 10.8 6.8 17.6 10 25.6"
        stroke="#8f5b2d" stroke-width="0.95" fill="none"/>

  <!-- Mount plate detail -->
  <rect x="11.2" y="29.6" width="9.6" height="2.1" rx="1"
        fill="#5f4027" opacity="0.8"/>

  <!-- Top rivets -->
  <circle cx="8" cy="2" r="0.8" fill="#ba7c44"/>
  <circle cx="22" cy="2" r="0.8" fill="#ba7c44"/>
</svg>`
  },

  booster_srb: {
    id: 'booster_srb', name: 'RT-10 Solid Booster', category: 'engine',
    price: 700, mass: 3500, thrust: 250000, isp: 240,
    width: 28, height: 120, dragCoeff: 0.25,
    attachTop: true, attachSide: true,
    description: 'Solid rocket booster. Cannot be throttled.',
    svg: `<svg viewBox="0 0 30 130" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Body -->
    <linearGradient id="srb_body" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#503010"/>
      <stop offset="20%" stop-color="#c87830"/>
      <stop offset="42%" stop-color="#f0a050"/>
      <stop offset="70%" stop-color="#c06828"/>
      <stop offset="100%" stop-color="#3e2208"/>
    </linearGradient>

    <!-- Anneaux -->
    <linearGradient id="srb_ring" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#401c08"/>
      <stop offset="42%" stop-color="#904018"/>
      <stop offset="100%" stop-color="#341404"/>
    </linearGradient>

    <!-- Nozzle -->
    <linearGradient id="srb_nozzle" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#6d7584"/>
      <stop offset="100%" stop-color="#1b2129"/>
    </linearGradient>
  </defs>

  <!-- Corps principal -->
  <rect x="2" y="0" width="26" height="124" rx="3"
        fill="url(#srb_body)" stroke="#351304" stroke-width="1.6"/>

  <!-- Anneau bord haut -->
  <rect x="0" y="0" width="30" height="5"
        fill="url(#srb_ring)" stroke="#2a1004" stroke-width="1"/>

  <!-- Anneaux structuraux -->
  <rect x="1.4" y="29.5" width="27.5" height="3.5" fill="#7b300d" opacity="0.75"/>
  <rect x="1.4" y="60.75" width="27.5" height="3.5" fill="#7b300d" opacity="0.75"/>
  <rect x="1.4" y="92.0" width="27.5" height="3.5" fill="#7b300d" opacity="0.75"/>

  <!-- Label -->
  <rect x="5.15" y="55.5" width="20" height="14" rx="3" fill="#5a2808" opacity="0.45"/>
  <text x="15.15" y="62.5" text-anchor="middle" dominant-baseline="central" font-size="7" fill="#2a1000" font-family="monospace" font-weight="bold">RT-10</text>

  <!-- Rivets -->
  <circle cx="6" cy="8" r="1.3" fill="#c8621d"/>
  <circle cx="24" cy="8" r="1.3" fill="#c8621d"/>
  <circle cx="6" cy="117" r="1.3" fill="#c8621d"/>
  <circle cx="24" cy="117" r="1.3" fill="#c8621d"/>

  <!-- Tuyère -->
  <path d="M9 124 L6 130 H24 L21 124 Z"
        fill="url(#srb_nozzle)" stroke="#131820" stroke-width="1.2"/>

  <!-- Anneau bord bas -->
  <rect x="0" y="120" width="30" height="5"
        fill="url(#srb_ring)" stroke="#2a1004" stroke-width="1"/>
</svg>`
  },

  // ─── DECOUPLERS ───────────────────────────────────────────
  decoupler_small: {
    id: 'decoupler_small', name: 'TR-18A Decoupler', category: 'decoupler',
    price: 400, mass: 50, width: 40, height: 14, dragCoeff: 0.05,
    attachTop: true, attachBottom: true,
    description: 'Stage separator.',
    svg: `<svg viewBox="0 0 40 14" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Body -->
    <linearGradient id="dec_body" x1="0" x2="1">
      <stop offset="0%" stop-color="#754f1f"/>
      <stop offset="20%" stop-color="#b58a35"/>
      <stop offset="42%" stop-color="#f3c85f"/>
      <stop offset="70%" stop-color="#a67c2e"/>
      <stop offset="100%" stop-color="#684617"/>
    </linearGradient>
  </defs>

  <!-- Corps -->
  <rect x="0.8" y="1" width="38.4" height="12" rx="2.4"
        fill="url(#dec_body)" stroke="#5a3f16" stroke-width="1.4"/>

  <!-- Bande centrale -->
  <rect x="4" y="5" width="32" height="4" rx="1.4"
        fill="#8d5a16" opacity="0.65"/>
  <rect x="5" y="5.8" width="30" height="2.4" rx="1.2"
        fill="#2a2020" opacity="0.42"/>

  <!-- Ligne pyro -->
  <rect x="5" y="6.5" width="30" height="1" rx="1.05"
        fill="#ffe08b" opacity="0.45"/>

  <!-- Centres -->
  <circle cx="8" cy="7" r="1" fill="#ffd15e"/>
  <circle cx="16" cy="7" r="1" fill="#ffd15e"/>
  <circle cx="24" cy="7" r="1" fill="#ffd15e"/>
  <circle cx="32" cy="7" r="1" fill="#ffd15e"/>
</svg>`
  },

  decoupler_radial: {
    id: 'decoupler_radial', name: 'TT-70 Radial Decoupler', category: 'decoupler',
    price: 700, mass: 50, width: 14, height: 40, dragCoeff: 0.05,
    attachTop: false, attachBottom: false, attachSide: true, isSidePart: true,
    description: 'Detaches side-mounted parts.',
    svg: `<svg viewBox="0 0 14 40" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Body -->
    <linearGradient id="decR_body" x1="0" x2="1">
      <stop offset="0%" stop-color="#754f1f"/>
      <stop offset="20%" stop-color="#b58a35"/>
      <stop offset="42%" stop-color="#f3c85f"/>
      <stop offset="70%" stop-color="#a67c2e"/>
      <stop offset="100%" stop-color="#684617"/>
    </linearGradient>
  </defs>

  <!-- Corps -->
  <rect x="1" y="0.8" width="12" height="38.4" rx="2.4"
        fill="url(#decR_body)" stroke="#5a3f16" stroke-width="1.4"/>

  <!-- Bande centrale -->
  <rect x="5" y="4" width="4" height="32" rx="1.4"
        fill="#8d5a16" opacity="0.65"/>
  <rect x="5.8" y="5" width="2.4" height="30" rx="1.2"
        fill="#2a2020" opacity="0.42"/>

  <!-- Ligne pyro -->
  <rect x="6.5" y="5" width="1" height="30" rx="1.05"
        fill="#ffe08b" opacity="0.45"/>

  <!-- Centres -->
  <circle cx="7" cy="8" r="1" fill="#ffd15e"/>
  <circle cx="7" cy="16" r="1" fill="#ffd15e"/>
  <circle cx="7" cy="24" r="1" fill="#ffd15e"/>
  <circle cx="7" cy="32" r="1" fill="#ffd15e"/>
</svg>`
  },

  // ─── FINS ─────────────────────────────────────────────────
  fin_small: {
    id: 'fin_small', name: 'Mini Stabilizer', category: 'fin',
    price: 250, mass: 40, width: 26, height: 60,
    liftCoeff: 0.3, dragCoeff: 0.04,
    attachSide: true, isSidePart: true,
    description: 'Tiny fin for fine control.',
    svg: `<svg viewBox="0 0 26 60" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Fin main -->
    <linearGradient id="fin_body" x1="0" x2="1">
      <stop offset="0%" stop-color="#5e6874"/>
      <stop offset="42%" stop-color="#b5c0cb"/>
      <stop offset="100%" stop-color="#dfe8ef"/>
    </linearGradient>

    <!-- Tip accent -->
    <linearGradient id="fin_tip" x1="0" x2="1">
      <stop offset="0%" stop-color="#e25d2a"/>
      <stop offset="100%" stop-color="#ffb15a"/>
    </linearGradient>
  </defs>

  <!-- Support -->
  <rect x="0" y="3" width="5.4" height="54" rx="2.4"
        fill="#404951" stroke="#262e35" stroke-width="1"/>

  <!-- Aileron principal -->
  <path d="M4 2 L23 16 L25 60 L4 60 Z"
        fill="url(#fin_body)" stroke="#2d353d"
        stroke-width="1.2" stroke-linejoin="round"/>

  <!-- Highlight interne -->
  <path d="M7 8 L18 18 L20.5 56 L7 56 Z"
        fill="#f1f6fa" opacity="0.18"/>

  <!-- Lignes structure -->
  <path d="M7 20 L18 30" stroke="#556471" stroke-width="1"/>
  <path d="M7 32 L19 42" stroke="#556471" stroke-width="1"/>
  <path d="M7 44 L20 54" stroke="#556471" stroke-width="1"/>

  <!-- Tip color -->
  <path d="M16 10.2 L23.5 15.7 L24.5 31 L17 25.5 Z"
        fill="url(#fin_tip)" opacity="0.95"/>
</svg>`
  },

  fin_basic: {
    id: 'fin_basic', name: 'AV-R8 Winglet', category: 'fin',
    price: 640, mass: 100, width: 40, height: 88,
    liftCoeff: 0.5, dragCoeff: 0.06,
    attachTop: false, attachBottom: false, attachSide: true, isSidePart: true,
    description: 'Basic aerodynamic fin.',
    svg: `<svg viewBox="0 0 40 88" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Body -->
    <linearGradient id="finB_body" x1="0" x2="1">
      <stop offset="0%" stop-color="#5d6978"/>
      <stop offset="42%" stop-color="#b8c4cf"/>
      <stop offset="100%" stop-color="#e3ebf1"/>
    </linearGradient>

    <!-- Tip -->
    <linearGradient id="finB_tip" x1="0" x2="1">
      <stop offset="0%" stop-color="#cb4e2f"/>
      <stop offset="100%" stop-color="#ffb26c"/>
    </linearGradient>
  </defs>

  <!-- Support -->
  <rect x="0" y="4" width="6" height="80" rx="2.6"
        fill="#414c57" stroke="#263039" stroke-width="1"/>

  <!-- Aileron principal -->
  <path d="M4 1 L35 18 L39 88 L4 88 Z"
        fill="url(#finB_body)" stroke="#2d363f"
        stroke-width="1.3" stroke-linejoin="round"/>

  <!-- Highlight interne -->
  <path d="M8 10 L30 22 L34.5 82 L8 82 Z"
        fill="#f4f8fb" opacity="0.16"/>

  <!-- Lignes structure -->
  <path d="M8 24.4 L31 36.4" stroke="#556471" stroke-width="1"/>
  <path d="M8 38.8 L32 50.8" stroke="#556471" stroke-width="1"/>
  <path d="M8 53.2 L33 65.2" stroke="#556471" stroke-width="1"/>
  <path d="M8 67.6 L34 79.6" stroke="#556471" stroke-width="1"/>

  <!-- Tip color -->
  <path d="M27 13 L35.4 17.7 L36.5 33 L28.1 28.3 Z"
        fill="url(#finB_tip)"/>
</svg>`
  },

  fin_large: {
    id: 'fin_large', name: 'AV-T1 Heavy Fin', category: 'fin',
    price: 900, mass: 180, width: 50, height: 100,
    liftCoeff: 0.9, dragCoeff: 0.08,
    attachSide: true, isSidePart: true,
    description: 'Large stabilizing fin.',
    svg: `<svg viewBox="0 0 50 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Body -->
    <linearGradient id="finL_body" x1="0" x2="1">
      <stop offset="0%" stop-color="#566574"/>
      <stop offset="42%" stop-color="#b8c4ce"/>
      <stop offset="100%" stop-color="#e7eef3"/>
    </linearGradient>

    <!-- Tip -->
    <linearGradient id="finL_tip" x1="0" x2="1">
      <stop offset="0%" stop-color="#bf452e"/>
      <stop offset="100%" stop-color="#ffb066"/>
    </linearGradient>
  </defs>

  <!-- Support -->
  <rect x="0" y="4" width="7.2" height="92" rx="2.8"
        fill="#404a54" stroke="#273039" stroke-width="1"/>

  <!-- Aileron principal -->
  <path d="M4 1 L44 21 L49 100 L4 100 Z"
        fill="url(#finL_body)" stroke="#2c353e"
        stroke-width="1.4" stroke-linejoin="round"/>

  <!-- Highlight interne -->
  <path d="M9 10 L39 25 L44 92 L9 92 Z"
        fill="#f2f7fa" opacity="0.15"/>

  <!-- Lignes structure -->
  <path d="M9 26.4 L40 41.4" stroke="#586572" stroke-width="1.2"/>
  <path d="M9 42.8 L41 57.8" stroke="#586572" stroke-width="1.2"/>
  <path d="M9 59.2 L42 74.2" stroke="#586572" stroke-width="1.2"/>
  <path d="M9 75.6 L43 90.6" stroke="#586572" stroke-width="1.2"/>

  <!-- Tip color -->
  <path d="M37 16.7 L44.5 20.7 L45.8 37 L38 33 Z"
        fill="url(#finL_tip)"/>
</svg>`
  },

  // ─── NOSE CONES ───────────────────────────────────────────
  nosecone_basic: {
    id: 'nosecone_basic', name: 'AE-FF1 Fairing', category: 'nosecone',
    price: 300, mass: 70, width: 40, height: 40, dragCoeff: 0.02,
    attachBottom: true, attachTop: false,
    description: 'Aerodynamic nose cone.',
    svg: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Body -->
    <linearGradient id="nose_body" x1="0" x2="1">
      <stop offset="0%" stop-color="#667381"/> 
      <stop offset="20%" stop-color="#abbbc9"/>
      <stop offset="42%" stop-color="#f5f9fc"/>
      <stop offset="70%" stop-color="#9aa7b5"/>
      <stop offset="100%" stop-color="#5a6774"/> 
    </linearGradient>

    <!-- Tip -->
    <linearGradient id="nose_tip" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#505a64"/>
      <stop offset="100%" stop-color="#262d35"/>
    </linearGradient>
  </defs>

  <!-- Corps -->
  <path d="M20 0.8 C26 6.2 33.6 20.5 36 40 H4 C6.4 20.5 14 6.2 20 0.8 Z"
        fill="url(#nose_body)" stroke="#4e5964" stroke-width="1.4"/>

  <!-- Lignes structure -->
  <path d="M20 7.5 C23 14.4 25.5 24.2 26.6 40"
        stroke="#8b98a7" stroke-width="0.85" opacity="0.45"/>
  <path d="M20 7.5 C17 14.4 14.5 24.2 13.4 40"
        stroke="#8b98a7" stroke-width="0.85" opacity="0.45"/>

  <!-- Base -->
  <rect x="8" y="34.5" width="24" height="3.8" rx="1.9"
        fill="#5f6a76" stroke="#3a454e" stroke-width="1"/>

  <!-- Ligne de contact -->
  <line x1="4" y1="40" x2="36" y2="40"
        stroke="#45515c" stroke-width="2"/>

  <!-- Pointe -->
  <path d="M20 2 C21.8 2.4 23.2 5.5 25 9 H15 C16.8 5.5 18.2 2.4 20 2 Z"
        fill="url(#nose_tip)" stroke="#1f252c" stroke-width="0.8"/>

  <!-- Rivets -->
  <circle cx="10" cy="36.4" r="1.1" fill="#8e99a3"/>
  <circle cx="20" cy="36.4" r="1.1" fill="#8e99a3"/>
  <circle cx="30" cy="36.4" r="1.1" fill="#8e99a3"/>
</svg>`
  },

  // ─── BONUS MODULES ───────────────────────────────────────
  bonus_science: {
    id: 'bonus_science', name: 'Science Bay', category: 'bonus',
    price: 5000, buildCost: 1000, mass: 750, width: 50, height: 60, dragCoeff: 0.12,
    attachTop: true, attachBottom: true,
    description: 'Heavy scientific payload. Grants +25% mission reward.',
    bonus: { rewardMultiplier: 1.25 },
    svg: `<svg viewBox="0 0 50 60" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bsc3" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#5b6877"/>
      <stop offset="20%" stop-color="#a8b9ca"/> 
      <stop offset="42%" stop-color="#f7fbfe"/> 
      <stop offset="70%" stop-color="#8c9caf"/> 
      <stop offset="100%" stop-color="#4d5a68"/>
    </linearGradient>

    <radialGradient id="bsg3" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#d6f6ff"/>
      <stop offset="42%" stop-color="#68b8ea"/>
      <stop offset="100%" stop-color="#1d4b78"/>
    </radialGradient>
  </defs>

  <!-- Corps principal -->
  <rect x="0" y="0" width="50" height="60" rx="7"
        fill="url(#bsc3)" stroke="#546273" stroke-width="1.4"/>

  <!-- Bandes structurelles -->
  <rect x="4" y="8" width="42" height="6" rx="2.5"
        fill="#6f8193" opacity="0.85"/>
  <rect x="4" y="46" width="42" height="6" rx="2.5"
        fill="#6f8193" opacity="0.85"/>

  <!-- Chambre centrale scientifique -->
  <rect x="14.5" y="18" width="21" height="24" rx="5"
        fill="#12273c" stroke="#6e8eab" stroke-width="1.3"/>

  <rect x="17.2" y="20.4" width="15.6" height="18.6" rx="4"
        fill="url(#bsg3)"/>

  <!-- Orbital core -->
  <circle cx="25" cy="29.8" r="4.2"
          fill="none" stroke="#d7f5ff" stroke-width="1" opacity="0.75"/>

  <path d="M21 29.8 H29 M25 25.8 V34"
        stroke="#d7f5ff" stroke-width="1" opacity="0.75"/>

  <!-- Branding -->
  <text x="25" y="50.8" text-anchor="middle"
        font-size="5.2"
        fill="#486b8b"
        font-family="monospace"
        font-weight="bold">
    SCIENCE
  </text>
</svg>`
  },

  bonus_cargo: {
    id: 'bonus_cargo', name: 'Cargo Bay XL', category: 'bonus',
    price: 8000, buildCost: 1200, mass: 1000, width: 60, height: 80, dragCoeff: 0.15,
    attachTop: true, attachBottom: true,
    description: 'Massive cargo bay. Initially heavy, but grants +25% total fuel capacity.',
    bonus: { fuelBonus: 1.25 },
    svg: `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Metallic body -->
    <linearGradient id="bcg3" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#5b6877"/>
      <stop offset="20%" stop-color="#a8b9ca"/> 
      <stop offset="42%" stop-color="#f7fbfe"/> 
      <stop offset="70%" stop-color="#8c9caf"/> 
      <stop offset="100%" stop-color="#4d5a68"/>
    </linearGradient>

    <!-- Cargo door warm metal -->
    <linearGradient id="bcd3" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#d9933a"/>
      <stop offset="100%" stop-color="#8b5417"/>
    </linearGradient>
  </defs>

  <!-- Hull -->
  <rect x="0" y="0" width="60" height="80" rx="9"
        fill="url(#bcg3)" stroke="#41484f" stroke-width="1.8"/>

  <!-- Bandes structurelles -->
  <rect x="4" y="8" width="52" height="6" rx="2.5"
        fill="#6f8193" opacity="0.85"/>
  <rect x="4" y="66" width="52" height="6" rx="2.5"
        fill="#6f8193" opacity="0.85"/>

  <!-- Main cargo door -->
  <rect x="12" y="18" width="36" height="44" rx="4.2" fill="url(#bcd3)" stroke="#f0be76" stroke-width="1.4"/>

  <!-- Center axis -->
  <path d="M30 20 V60"
        stroke="#f2c986" stroke-width="1"
        opacity="0.6" stroke-dasharray="3,2"/>

  <!-- Cross reinforcement -->
  <path d="M16 40 H44"
        stroke="#5a320d" stroke-width="1.1"
        opacity="0.45"/>

  <!-- Cargo modules -->
  <rect x="15.5" y="24" width="12" height="13" rx="2" fill="#5f3511" opacity="0.42"/>
  <rect x="32.5" y="24" width="12" height="13" rx="2" fill="#5f3511" opacity="0.42"/>
  <rect x="15.5" y="43" width="12" height="13" rx="2" fill="#5f3511" opacity="0.42"/>
  <rect x="32.5" y="43" width="12" height="13" rx="2" fill="#5f3511" opacity="0.42"/>

  <!-- Lock nodes (Aux coins internes de la porte : 14 et 46) -->
  <circle cx="14.5" cy="21" r="1.6" fill="#f4c676"/>
  <circle cx="45.5" cy="21" r="1.6" fill="#f4c676"/>
  <circle cx="14.5" cy="59" r="1.6" fill="#f4c676"/>
  <circle cx="45.5" cy="59" r="1.6" fill="#f4c676"/>

  <!-- Core lock unit (Parfaitement au centre : x=30 - 4) -->
  <rect x="26" y="36.5" width="8" height="7" rx="2.5" fill="#f7cd84" stroke="#a56d23" stroke-width="1"/>

  <!-- Label -->
  <text x="30" y="70.8" text-anchor="middle"
        font-size="5.2"
        fill="#f0b85c"
        font-family="monospace"
        font-weight="bold">
    CARGO
  </text>
</svg>`
  },

  bonus_thruster_boost: {
    id: 'bonus_thruster_boost', name: 'Afterburner Pack', category: 'bonus',
    price: 6000, buildCost: 1000, mass: 500, width: 40, height: 35, dragCoeff: 0.08,
    attachTop: true, attachBottom: true,
    description: 'Experimental combustion enhancer. Boosts all engine thrust by 25%.',
    bonus: { thrustBoost: 1.25 },
    svg: `<svg viewBox="0 0 40 35" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="abt3" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#5b6877"/>
      <stop offset="20%" stop-color="#a8b9ca"/> 
      <stop offset="42%" stop-color="#f7fbfe"/> 
      <stop offset="70%" stop-color="#8c9caf"/> 
      <stop offset="100%" stop-color="#4d5a68"/>
    </linearGradient>

    <linearGradient id="abc3" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#ffd38a"/>
      <stop offset="42%" stop-color="#ff8b36"/>
      <stop offset="100%" stop-color="#8d2f12"/>
    </linearGradient>

    <radialGradient id="abg3" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff0c7"/>
      <stop offset="42%" stop-color="#ff9d4a"/>
      <stop offset="100%" stop-color="#94361a"/>
    </radialGradient>
  </defs>

  <!-- Hull -->
  <rect x="0" y="0" width="40" height="35" rx="5"
        fill="url(#abt3)" stroke="#4a535e" stroke-width="1.4"/>

  <!-- Structural bands -->
  <rect x="3" y="4" width="34" height="5" rx="2.5" fill="#6f8193" opacity="0.85"/>
  <rect x="3" y="26" width="34" height="5" rx="2.5" fill="#6f8193" opacity="0.85"/>

  <!-- Engine cores -->
  <rect x="7.4" y="10.75" width="6.2" height="13.5" rx="3.1"
        fill="url(#abc3)" stroke="#ffb56b" stroke-width="1"/>
  <rect x="16.9" y="10.75" width="6.2" height="13.5" rx="3.1"
        fill="url(#abc3)" stroke="#ffb56b" stroke-width="1"/>
  <rect x="26.4" y="10.75" width="6.2" height="13.5" rx="3.1"
        fill="url(#abc3)" stroke="#ffb56b" stroke-width="1"/>

  <!-- Plasma nodes -->
  <circle cx="10.5" cy="16.8" r="2.4" fill="url(#abg3)" opacity="0.92"/>
  <circle cx="20" cy="16.8" r="2.4" fill="url(#abg3)" opacity="0.92"/>
  <circle cx="29.5" cy="16.8" r="2.4" fill="url(#abg3)" opacity="0.92"/>

  <circle cx="10.5" cy="16.8" r="0.95" fill="#fff7de"/>
  <circle cx="20" cy="16.8" r="0.95" fill="#fff7de"/>
  <circle cx="29.5" cy="16.8" r="0.95" fill="#fff7de"/>

  <!-- Label -->
  <text x="20" y="30.4" text-anchor="middle"
        font-size="5.2"
        fill="#d36a2d"
        font-family="monospace"
        font-weight="bold">
    BOOSTER
  </text>
</svg>`
  }
};

const PART_CATEGORIES = {
  cockpit: { label: 'Cockpits', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6a6 6 0 0 0-6 6c0 3.31 2.69 6 6 6s6-2.69 6-6a6 6 0 0 0-6-6z"/></svg>`, color: '#3a8fd4' },
  tank: { label: 'Fuel Tanks', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 15h18v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4zm0-6h18v4H3V9zm0-6h18v4H3V3z"/></svg>`, color: '#e08030' },
  engine: { label: 'Engines', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c0 4.5-6 9-6 13a6 6 0 0 0 12 0c0-4-6-8.5-6-13z"/></svg>`, color: '#d04040' },
  decoupler: { label: 'Decouplers', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 11V7l-5 5 5 5v-4h4v-4H7zm10 0v-4l5 5-5 5v-4h-4v-4h4z"/></svg>`, color: '#e0c030' },
  fin: { label: 'Fins', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22V2l18 10L4 22z"/></svg>`, color: '#60a0c0' },
  nosecone: { label: 'Nose Cones', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 2 22h20z"/></svg>`, color: '#90b090' },
  bonus: { label: 'Bonus Modules', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`, color: '#a070ff' }
};

if (typeof module !== 'undefined') module.exports = { PARTS_CATALOG, PART_CATEGORIES };

// buildCost = 25% du prix R&D
for (const key in PARTS_CATALOG) {
  if (!PARTS_CATALOG[key].buildCost) {
    PARTS_CATALOG[key].buildCost = Math.max(10, Math.floor(PARTS_CATALOG[key].price * 0.25));
  }
}

// Pré-chargement images SVG
if (typeof Image !== 'undefined') {
  for (const key in PARTS_CATALOG) {
    const part = PARTS_CATALOG[key];
    if (part.svg) {
      const img = new Image();
      img.onload = () => { if (typeof drawBuildCanvas === 'function') drawBuildCanvas(); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(part.svg);
      part.img = img;
    }
  }
}
