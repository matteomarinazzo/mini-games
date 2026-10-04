// ─── VEHICLES.JS ────────────────────────────────────────────────────────────
// Catalogue des véhicules + générateurs SVG (joueur, ennemis, obstacles, bonus).
// Tous les véhicules sont dessinés vus de dessus, face vers le haut.
//
// Caractéristiques (point d'équilibrage unique) :
//   v0    : vitesse initiale (km/h)
//   accel : accélération (km/h gagnés par seconde)
//   lat   : vitesse latérale (voies par seconde)
//   batteryM : (optionnel) distance (m) après laquelle le véhicule tombe en panne (blague de l'électrique)
// Logique : léger/petit = agile ; lourd/long = puissant mais peu maniable (et hitbox plus grande).
//
// KINDS : viewBox de chaque modèle + taille du sprite et demi-hitbox (en voies).
// ⚠ Le ratio w/h du sprite doit rester égal au ratio du viewBox (sinon l'image est déformée).
const STD = { w: 0.62, h: 1.24, hw: 0.25, hh: 0.55 };
const KINDS = {
    sedan: { vb: [40, 80] },
    hatch: { vb: [40, 80], box: { hw: 0.24, hh: 0.5 } },
    cabrio: { vb: [40, 80] },
    sport: { vb: [40, 80] },
    rally: { vb: [40, 80], box: { hw: 0.24, hh: 0.5 } },
    electric: { vb: [40, 80] },
    muscle: { vb: [42, 92], box: { w: 0.64, h: 1.4, hw: 0.27, hh: 0.64 } },
    super: { vb: [42, 90], box: { w: 0.63, h: 1.35, hw: 0.26, hh: 0.6 } },
    hyper: { vb: [44, 100], box: { w: 0.66, h: 1.5, hw: 0.28, hh: 0.68 } },
    proto: { vb: [44, 100], box: { w: 0.66, h: 1.5, hw: 0.28, hh: 0.68 } },
    pickup: { vb: [42, 96], box: { w: 0.64, h: 1.46, hw: 0.27, hh: 0.68 } },
    suv: { vb: [44, 84], box: { w: 0.7, h: 1.34, hw: 0.29, hh: 0.6 } },
    moto: { vb: [24, 70], box: { w: 0.36, h: 1.05, hw: 0.13, hh: 0.45 } },
    scooter: { vb: [22, 60], box: { w: 0.33, h: 0.9, hw: 0.12, hh: 0.4 } },
};

export const VEHICLES = [
    { id: 'city', name: 'Citadine', price: 0, color: '#ffd23f', kind: 'sedan', v0: 100, accel: 1.4, lat: 6.0 },
    { id: 'hatch', name: 'Compacte', price: 200, color: '#3ec9ff', kind: 'hatch', v0: 85, accel: 1.2, lat: 7.8 },
    { id: 'scooter', name: 'Scooter', price: 300, color: '#ffa94d', kind: 'scooter', v0: 70, accel: 1.0, lat: 9.5 },
    { id: 'pickup', name: 'Pick-up', price: 450, color: '#7bd85a', kind: 'pickup', v0: 120, accel: 1.0, lat: 4.8 },
    { id: 'suv', name: 'SUV', price: 600, color: '#4d7cff', kind: 'suv', v0: 110, accel: 1.6, lat: 4.9 },
    { id: 'cabrio', name: 'Cabriolet', price: 700, color: '#ff7ab0', kind: 'cabrio', v0: 125, accel: 1.5, lat: 7.0 },
    { id: 'sport', name: 'Sportive', price: 800, color: '#ff3d6e', kind: 'sport', v0: 140, accel: 2.0, lat: 6.0 },
    { id: 'rally', name: 'Rallye', price: 950, color: '#1c7ed6', kind: 'rally', v0: 135, accel: 1.8, lat: 8.0 },
    { id: 'muscle', name: 'Muscle car', price: 1100, color: '#e03131', kind: 'muscle', v0: 150, accel: 2.1, lat: 4.6 },
    { id: 'moto', name: 'Moto sportive', price: 1300, color: '#e8590c', kind: 'moto', v0: 115, accel: 2.0, lat: 9.8 },
    { id: 'gt', name: 'Hypercar', price: 1500, color: '#b06bff', kind: 'hyper', v0: 175, accel: 2.7, lat: 5.0 },
    // Blague : excellentes stats, mais panne de batterie après `batteryM` mètres (voir game.js)
    { id: 'electric', name: 'Électrique', price: 2000, color: '#12b886', kind: 'electric', v0: 150, accel: 3.0, lat: 6.5, batteryM: 120 },
    { id: 'super', name: 'Supercar', price: 2200, color: '#ffd43b', kind: 'super', v0: 185, accel: 3.0, lat: 4.8 },
    { id: 'proto', name: 'Prototype LMP', price: 3000, color: '#f8f9fa', kind: 'proto', v0: 195, accel: 3.3, lat: 5.0 },
];

// Taille du sprite + demi-hitbox (par modèle, surchargeable par `box` dans VEHICLES)
export const kindBox = (kind) => ({ ...STD, ...((KINDS[kind] || {}).box || {}) });
export const vehicleBox = (v) => ({ ...kindBox(v.kind), ...(v.box || {}) });

export const ENEMY_COLORS = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#8d99ae', '#f72585', '#4cc9f0', '#90be6d'];
export const ENEMY_KINDS = ['sedan', 'hatch', 'cabrio', 'sport', 'rally', 'electric', 'suv', 'pickup', 'muscle', 'super'];

export const svgUri = (s) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

/* ───────────── Outils de dessin ───────────── */
const NS = 'xmlns="http://www.w3.org/2000/svg"';
let uid = 0; // ids de dégradés uniques (plusieurs SVG inline dans la même page du menu)

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// Éclaircit (t>0) ou assombrit (t<0) une couleur #rrggbb
function mix(h, t) {
    const c = hexRgb(h).map((v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
// Dégradé horizontal : flancs sombres, centre lumineux (effet de volume vu de dessus)
function paint(c) {
    const id = 'g' + (uid++);
    const stops = [[0, -0.5], [0.22, 0.05], [0.5, 0.32], [0.78, 0.08], [1, -0.55]]
        .map(([o, t]) => `<stop offset="${o}" stop-color="${mix(c, t)}"/>`).join('');
    return { fill: `url(#${id})`, defs: `<linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient>` };
}
const GLASS_DEF = '<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe6f7"/><stop offset=".45" stop-color="#2f5673"/><stop offset="1" stop-color="#14263a"/></linearGradient>';

const rc = (x, y, w, h, rx, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const tire = (x, y, w = 6, h = 15) => rc(x, y, w, h, w / 2.6, '#0c0c0e') + rc(x + w * 0.3, y + 2, w * 0.4, h - 4, 1, '#2b2b31');
const shade = (d) => `<path d="${d}" transform="translate(1.2 1.6)" fill="rgba(0,0,0,.3)"/>`;
const body = (d, f, dk) => `<path d="${d}" fill="${f}" stroke="${dk}" stroke-width=".8"/>`;
const glass = (d, hl) => `<path d="${d}" fill="url(#gl)" stroke="rgba(0,0,0,.45)" stroke-width=".4"/>` + (hl ? `<path d="${hl}" fill="#fff" opacity=".25"/>` : '');
const roof = (d, c) => `<path d="${d}" fill="${mix(c, 0.22)}" stroke="rgba(0,0,0,.25)" stroke-width=".5"/>`;
const lamp = (d) => `<path d="${d}" fill="#fffbd0" stroke="rgba(0,0,0,.35)" stroke-width=".4"/>`;
const tail = (d) => `<path d="${d}" fill="#ff2a2a" stroke="rgba(80,0,0,.5)" stroke-width=".3"/>`;
const mirror = (x, y, c) => rc(x, y, 3.2, 2.2, 1, c, 'stroke="rgba(0,0,0,.45)" stroke-width=".4"');

/* ───────────── Modèles ───────────── */
// Famille compacte : citadine, compacte (short), rallye (short + rally), électrique (ev)
function compact(c, f, dk, o = {}) {
    const d = o.short ? 1 : 0, y0 = o.short ? 8 : 5, yb = o.short ? 72 : 76, ry = 52 + 2 * d;
    const B = o.short
        ? 'M9 8Q20 3 31 8Q36 12 36 20L36 60Q36 70 31 73Q20 75 9 73Q4 70 4 60L4 20Q4 12 9 8Z'
        : 'M9 5Q20 0 31 5Q36 9 36 18L36 62Q36 74 30 77Q20 79 10 77Q4 74 4 62L4 18Q4 9 9 5Z';
    let s = tire(1, 12 + 2 * d) + tire(33, 12 + 2 * d) + tire(1, 54 - 4 * d) + tire(33, 54 - 4 * d) + shade(B) + body(B, f, dk);
    s += `<path d="M10 ${y0 + 15}Q20 ${y0 + 12} 30 ${y0 + 15}" fill="none" stroke="rgba(0,0,0,.3)" stroke-width=".6"/>`; // joint de capot
    if (o.rally) s += rc(12, y0 + 2, 16, 11, 3, '#1b1b1f') + rc(16, y0 + 5, 8, 4, 1.5, '#000');                         // capot mat + prise d'air
    if (o.ev) s += `<polygon points="20,${y0 + 4} 17,${y0 + 10} 19.2,${y0 + 10} 18.5,${y0 + 15} 23,${y0 + 8} 20.6,${y0 + 8}" fill="#00e0ff" opacity=".85"/>`;
    s += glass(`M10 ${25 + d}Q20 ${22 + d} 30 ${25 + d}L28.5 ${37 + d}Q20 ${35 + d} 11.5 ${37 + d}Z`, `M12 ${26.5 + d}L16 ${26 + d}L14.5 ${35 + d}L12.5 ${35.5 + d}Z`);
    if (o.ev) { // toit panoramique vitré
        s += `<path d="M11.5 ${37 + d}Q20 ${35 + d} 28.5 ${37 + d}L29 ${53 + d}Q20 ${56 + d} 11 ${53 + d}Z" fill="#0f2233" stroke="rgba(0,0,0,.4)" stroke-width=".5"/><path d="M13 ${40 + d}L17 ${39.5 + d}L14.5 ${50 + d}L13 ${50 + d}Z" fill="#fff" opacity=".18"/>`;
    } else {
        s += roof(`M11 ${37 + d}h18v${15 + d}q0 2-2 2H13q-2 0-2-2z`, o.rally ? '#f1f3f5' : c);
        if (o.rally) s += `<circle cx="20" cy="${45 + d}" r="4" fill="#e03131" stroke="#fff" stroke-width=".8"/>`;
    }
    s += glass(`M11.5 ${ry}Q20 ${ry + 2} 28.5 ${ry}L30 ${ry + 7}Q20 ${ry + 10} 10 ${ry + 7}Z`);
    s += mirror(1.6, 27 + d, c) + mirror(35.2, 27 + d, c);
    s += o.ev
        ? rc(8, y0 + 1.5, 24, 1.8, 0.9, '#d6f6ff') + rc(7, yb - 2, 26, 1.8, 0.9, '#ff2a2a')
        : lamp(`M8 ${y0 + 3}L14 ${y0 + 1.5}L13.5 ${y0 + 5.5}L7.5 ${y0 + 7}Z`) + lamp(`M32 ${y0 + 3}L26 ${y0 + 1.5}L26.5 ${y0 + 5.5}L32.5 ${y0 + 7}Z`) +
        tail(`M6 ${yb - 2.5}h7v2.4H6z`) + tail(`M27 ${yb - 2.5}h7v2.4h-7z`);
    if (o.rally) s += rc(2, yb - 9, 36, 3.5, 1, '#111') + rc(1.5, yb - 11, 2, 8, 0.8, dk) + rc(36.5, yb - 11, 2, 8, 0.8, dk) +
        rc(8, y0 + 9.5, 3, 2, 1, '#ffd43b') + rc(29, y0 + 9.5, 3, 2, 1, '#ffd43b');                                   // aileron + antibrouillards
    return s;
}

// Roadster : cockpit ouvert, sièges cuir, arceaux, capote repliée
function cabrio(c, f, dk) {
    const B = 'M9 4Q20 -1 31 4Q36 8 36 17L36 64Q36 75 29 77.5Q20 79 11 77.5Q4 75 4 64L4 17Q4 8 9 4Z';
    return tire(1, 12) + tire(33, 12) + tire(1, 54) + tire(33, 54) + shade(B) + body(B, f, dk) +
        `<path d="M10 17Q20 14 30 17" fill="none" stroke="rgba(0,0,0,.3)" stroke-width=".6"/>` +
        glass('M9.5 25Q20 22.5 30.5 25L30 29Q20 27 10 29Z', 'M12 25.6L17 25.2L16.5 27.4L12 27.8Z') +
        rc(9, 29, 22, 27, 5, '#24242b') + rc(10.5, 33, 8, 11, 3, '#c98b52') + rc(21.5, 33, 8, 11, 3, '#c98b52') +
        rc(10.5, 41, 8, 3.5, 1.5, '#a8713f') + rc(21.5, 41, 8, 3.5, 1.5, '#a8713f') +
        `<circle cx="14.5" cy="31.5" r="2.2" fill="none" stroke="#111" stroke-width="1"/>` +
        rc(11, 50, 4, 3, 1.5, '#b8bcc4') + rc(25, 50, 4, 3, 1.5, '#b8bcc4') +
        `<path d="M9 57Q20 55 31 57L32 70Q20 74 8 70Z" fill="${mix(c, 0.2)}" stroke="rgba(0,0,0,.25)" stroke-width=".5"/>` +
        mirror(1.6, 26, c) + mirror(35.2, 26, c) +
        lamp('M8 8L14 6.5L13.5 10L7.5 11.5Z') + lamp('M32 8L26 6.5L26.5 10L32.5 11.5Z') +
        tail('M6 73.5h8v2.2H6z') + tail('M26 73.5h8v2.2h-8z');
}

// Sportive type 911 : hanches larges, pneus arrière larges, aileron « queue de canard »
function sport(c, f, dk) {
    const B = 'M10 4Q20 -1 30 4Q35 8 35.5 20Q36 34 35 44Q38 54 37.5 66Q37 76 28 78Q20 79.5 12 78Q3 76 2.5 66Q2 54 5 44Q4 34 4.5 20Q5 8 10 4Z';
    const stripe = (y, h) => rc(18.4, y, 3.2, h, 0, 'rgba(255,255,255,.75)');
    return tire(1.5, 13, 5.5, 14) + tire(33, 13, 5.5, 14) + tire(0, 55, 7, 16) + tire(33, 55, 7, 16) + shade(B) + body(B, f, dk) +
        stripe(3, 22) +
        glass('M10.5 26Q20 23 29.5 26L28 38Q20 36 12 38Z', 'M12.5 27.5L16 27L14.8 35.5L13 36Z') +
        roof('M12 38Q20 36 28 38L29.5 52Q20 56.5 10.5 52Z', c) + stripe(38, 15) +
        glass('M12 52.5Q20 56 28 52.5L29 57Q20 60 11 57Z') + stripe(58, 14) +
        [61, 64, 67, 70].map((y) => `<path d="M12 ${y}h16" stroke="rgba(0,0,0,.4)" stroke-width="1"/>`).join('') +
        rc(8, 72.5, 24, 3, 1.5, dk) +
        `<circle cx="10.5" cy="9" r="2.6" fill="#fffbd0" stroke="rgba(0,0,0,.4)" stroke-width=".4"/><circle cx="29.5" cy="9" r="2.6" fill="#fffbd0" stroke="rgba(0,0,0,.4)" stroke-width=".4"/>` +
        mirror(1, 27, c) + mirror(35.8, 27, c) + tail('M6 69h6v1.8H6z') + tail('M28 69h6v1.8h-6z');
}

// Muscle car : long capot, prise d'air, double bande, queue courte, échappements
function muscle(c, f, dk) {
    const B = 'M10 4Q21 -1 32 4Q38 8 38 18L38 74Q38 86 31 89Q21 91 11 89Q4 86 4 74L4 18Q4 8 10 4Z';
    const st = (y, h) => rc(15, y, 3.4, h, 0, 'rgba(255,255,255,.8)') + rc(23.6, y, 3.4, h, 0, 'rgba(255,255,255,.8)');
    return tire(1, 14, 6, 16) + tire(35, 14, 6, 16) + tire(0.5, 62, 6.5, 17) + tire(35, 62, 6.5, 17) + shade(B) + body(B, f, dk) +
        st(3, 26) + '<path d="M16.5 11h9l-1 17h-7z" fill="#15151a"/>' +
        [14, 18, 22].map((y) => `<path d="M17 ${y}h8" stroke="rgba(255,255,255,.2)" stroke-width=".8"/>`).join('') +
        glass('M10.5 31Q21 28 31.5 31L30 43Q21 41 12 43Z', 'M12.5 32.5L17 32L15.5 41L13 41.5Z') +
        roof('M12.5 43h17v13q0 2-2 2h-13q-2 0-2-2z', c) + st(43, 14) +
        glass('M13 58Q21 60 29 58L31 65Q21 68 11 65Z') + st(66, 22) +
        mirror(1.4, 33, c) + mirror(37.4, 33, c) +
        `<circle cx="9.5" cy="8.5" r="2.4" fill="#fffbd0" stroke="rgba(0,0,0,.4)" stroke-width=".4"/><circle cx="32.5" cy="8.5" r="2.4" fill="#fffbd0" stroke="rgba(0,0,0,.4)" stroke-width=".4"/>` +
        rc(6, 85.5, 11, 2.6, 1, '#e11') + rc(25, 85.5, 11, 2.6, 1, '#e11') +
        '<circle cx="14" cy="90.2" r="1.6" fill="#b8bcc4"/><circle cx="28" cy="90.2" r="1.6" fill="#b8bcc4"/>';
}

// Pick-up : cabine, benne ouverte nervurée, hayon, attelage
function pickup(c, f, dk) {
    const B = 'M9 4Q21 0 33 4Q38 8 38 18L38 87Q38 94 32 94H10Q4 94 4 87V18Q4 8 9 4Z';
    return tire(1, 14, 6, 16) + tire(35, 14, 6, 16) + tire(0.5, 66, 6.5, 17) + tire(35, 66, 6.5, 17) + shade(B) + body(B, f, dk) +
        '<path d="M10 17Q21 14 32 17" fill="none" stroke="rgba(0,0,0,.3)" stroke-width=".6"/>' + rc(10, 2.2, 22, 2.6, 1, '#15151a') +
        lamp('M7.5 7L14.5 5L14.5 9L7.5 11Z') + lamp('M34.5 7L27.5 5L27.5 9L34.5 11Z') +
        glass('M10.5 27Q21 24 31.5 27L30 38Q21 36 12 38Z', 'M12.5 28.5L17 28L15.5 36L13 36.5Z') +
        roof('M12 38h18v14q0 2-2 2H14q-2 0-2-2z', c) + rc(12.5, 54.5, 17, 4, 1.5, '#1d3347') +
        rc(4.5, 60, 3.6, 31, 1.5, mix(c, 0.25)) + rc(33.9, 60, 3.6, 31, 1.5, mix(c, 0.25)) +
        rc(8, 61, 26, 29, 2.5, '#232328') + rc(8, 59, 26, 2, 0, mix(c, -0.25)) +
        [65, 69.5, 74, 78.5, 83, 87].map((y) => `<path d="M8.5 ${y}h25" stroke="rgba(255,255,255,.1)" stroke-width=".8"/>`).join('') +
        rc(8, 90, 26, 3, 1.2, mix(c, 0.18)) + rc(4, 88, 3.4, 5, 1, '#ff2a2a') + rc(34.6, 88, 3.4, 5, 1, '#ff2a2a') + rc(18, 93.5, 6, 2.5, 1, '#555') +
        mirror(1.2, 28, c) + mirror(37.6, 28, c);
}

// SUV : caisse haute, barres de toit, toit ouvrant, gros pneus
function suv(c, f, dk) {
    const B = 'M10 4Q22 0 34 4Q40 7 40 16V70Q40 80 33 82Q22 83 11 82Q4 80 4 70V16Q4 7 10 4Z';
    return tire(0, 12, 7, 17) + tire(37, 12, 7, 17) + tire(0, 52, 7, 17) + tire(37, 52, 7, 17) + shade(B) + body(B, f, dk) +
        '<path d="M10 17Q22 14 34 17" fill="none" stroke="rgba(0,0,0,.3)" stroke-width=".6"/>' + rc(11, 2.4, 22, 3, 1.2, '#15151a') +
        lamp('M7 8L15 6L15 10L7 12Z') + lamp('M37 8L29 6L29 10L37 12Z') +
        glass('M10 24Q22 21 34 24L32.5 35Q22 33 11.5 35Z', 'M12 25.5L17.5 25L16 33L13 33.5Z') +
        roof('M11 35h22v31q0 2-2 2H13q-2 0-2-2z', c) + rc(14, 39, 16, 10, 2, '#1d3347') +
        rc(10, 31, 2, 40, 1, '#26262b') + rc(32, 31, 2, 40, 1, '#26262b') + rc(10, 41, 24, 1.3, 0.6, '#33333a') + rc(10, 58, 24, 1.3, 0.6, '#33333a') +
        glass('M12 68Q22 70 32 68L33 74Q22 77 11 74Z') +
        rc(4.5, 70, 3, 9, 1.2, '#ff2a2a') + rc(36.5, 70, 3, 9, 1.2, '#ff2a2a') + mirror(1.6, 26, c) + mirror(39.2, 26, c);
}

// Supercar en coin : nez bas, prises d'air, moteur sous lamelles, aileron fixe
function supercar(c, f, dk) {
    const B = 'M14 2L28 2Q33 4 35 12L37 30Q40 42 40 56L40 72Q40 84 32 88L10 88Q2 84 2 72L2 56Q2 42 5 30L7 12Q9 4 14 2Z';
    return tire(0.5, 12, 6, 15) + tire(35.5, 12, 6, 15) + tire(0, 57, 7.5, 18) + tire(34.5, 57, 7.5, 18) + shade(B) + body(B, f, dk) +
        rc(9, 0.5, 24, 2.2, 1, '#111') +
        '<path d="M15 6L18 28M27 6L24 28" stroke="rgba(0,0,0,.4)" stroke-width=".8" fill="none"/>' +
        glass('M12.5 32Q21 27 29.5 32L28 46Q21 43 14 46Z', 'M14.5 33.5L19 31.5L17.5 43L15 44Z') +
        `<path d="M14 46Q21 43 28 46L29 58Q21 61 13 58Z" fill="${mix(c, 0.2)}" stroke="rgba(0,0,0,.25)" stroke-width=".5"/>` +
        '<path d="M12.5 60Q21 58 29.5 60L31 74Q21 77 11 74Z" fill="#12181f" stroke="rgba(0,0,0,.5)" stroke-width=".5"/>' +
        [63, 66, 69, 72].map((y) => `<path d="M13.5 ${y}h15" stroke="${mix(c, 0.1)}" stroke-width=".9" opacity=".7"/>`).join('') +
        '<path d="M3.5 44L8.5 49L8.5 62L2.5 64Z" fill="#111"/><path d="M38.5 44L33.5 49L33.5 62L39.5 64Z" fill="#111"/>' +
        rc(10, 76, 2, 6, 0, '#333') + rc(30, 76, 2, 6, 0, '#333') + rc(4, 82, 34, 4.2, 1.6, '#111') +
        lamp('M9 7L16 4.5L16 7.5L8 10Z') + lamp('M33 7L26 4.5L26 7.5L34 10Z') +
        tail('M7 79.5L16 79.5L15 81.5L6 81.5Z') + tail('M35 79.5L26 79.5L27 81.5L36 81.5Z') + mirror(1.6, 32, c) + mirror(37.2, 32, c);
}

// Hypercar / prototype style Le Mans : canopée, nageoire dorsale, aileron à dérives, numéro de course
function lemans(c, f, dk, v) {
    const hy = v === 'hyper', acc = hy ? '#ffd43b' : '#e03131';
    const B = 'M22 1Q31 1.5 33.5 9L34.5 20Q42 25 41.5 42L41.5 64Q41.5 78 37 88L34 94H10L7 88Q2.5 78 2.5 64L2.5 42Q2 25 9.5 20L10.5 9Q13 1.5 22 1Z';
    return tire(1, 12, 7.5, 19) + tire(35.5, 12, 7.5, 19) + tire(0, 62, 8.5, 21) + tire(35.5, 62, 8.5, 21) + shade(B) + body(B, f, dk) +
        rc(20.2, 3, 3.6, 36, 0, acc) + rc(20.2, 60, 3.6, 31, 0, acc) +
        (hy ? '' : rc(12, 2.5, 20, 6, 2.5, '#15151a')) +
        '<path d="M10.5 12Q8.5 22 9.5 30M33.5 12Q35.5 22 34.5 30" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".8"/>' +
        rc(12, 0.4, 20, 2.2, 1.1, '#111') +
        lamp('M12 9.5L19 7L18.5 11L11.5 13.5Z') + lamp('M32 9.5L25 7L25.5 11L32.5 13.5Z') +
        `<circle cx="22" cy="23" r="4.2" fill="#fff" stroke="rgba(0,0,0,.4)" stroke-width=".4"/><text x="22" y="25.1" font-size="6" font-weight="700" text-anchor="middle" fill="#111" font-family="Arial,sans-serif">${hy ? 8 : 1}</text>` +
        glass('M14 38Q22 30 30 38L31.5 56Q22 63 12.5 56Z', 'M15.5 39.5L19.5 36L18.5 50L16 52Z') +
        `<path d="M16.5 44Q22 40.5 27.5 44L28 55Q22 59 16 55Z" fill="${mix(c, 0.2)}" stroke="rgba(0,0,0,.3)" stroke-width=".5"/>` + rc(19.5, 41.5, 5, 3.5, 1.5, '#111') +
        '<path d="M12 67Q22 63 32 67" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".8"/>' +
        `<path d="${hy ? 'M20.2 60L23.8 60L23.2 91L20.8 91Z' : 'M19.2 58L24.8 58L23.6 92L20.4 92Z'}" fill="${dk}"/>` +
        rc(3.5, 93.5, 37, 5, 2, '#111') + rc(2.5, 90, 2, 10, 1, c) + rc(39.5, 90, 2, 10, 1, c) + rc(6, 94.8, 32, 1.2, 0.6, acc) +
        (hy ? '' : rc(21, 90, 2, 4, 0, '#444')) + rc(14, 88.5, 16, 1.8, 0.9, '#ff2a2a') + mirror(9.5, 36, dk) + mirror(31.3, 36, dk);
}

const ART = {
    sedan: (c, f, dk) => compact(c, f, dk),
    hatch: (c, f, dk) => compact(c, f, dk, { short: true }),
    rally: (c, f, dk) => compact(c, f, dk, { short: true, rally: true }),
    electric: (c, f, dk) => compact(c, f, dk, { ev: true }),
    cabrio, sport, muscle, pickup, suv, super: supercar,
    hyper: (c, f, dk) => lemans(c, f, dk, 'hyper'),
    proto: (c, f, dk) => lemans(c, f, dk, 'proto'),
};

// Voiture (kind : sedan | hatch | cabrio | sport | rally | electric | muscle | pickup | suv | super | hyper | proto | moto | scooter)
export function carSvg(color, kind = 'sedan') {
    if (kind === 'moto' || kind === 'scooter') return motoSvg(color, kind);
    const [w, h] = (KINDS[kind] || KINDS.sedan).vb;
    const p = paint(color), dk = mix(color, -0.55);
    return `<svg ${NS} viewBox="0 0 ${w} ${h}"><defs>${p.defs}${GLASS_DEF}</defs>${(ART[kind] || ART.sedan)(color, p.fill, dk)}</svg>`;
}

// Moto sportive (24×70) et scooter (22×60) : roues, carénage, guidon, pilote casqué
function motoSvg(color, kind) {
    const dk = mix(color, -0.55), ed = 'stroke="rgba(0,0,0,.4)" stroke-width=".6"', jk = '#2a3140';
    if (kind === 'scooter') {
        return `<svg ${NS} viewBox="0 0 22 60"><defs>${GLASS_DEF}</defs>` +
            rc(8.2, 1, 5.6, 13, 2.8, '#0c0c0e') + rc(8.5, 47, 5, 12, 2.5, '#0c0c0e') +
            rc(7.2, 4, 7.6, 9, 3.2, color, ed) +
            `<path d="M4 16L18 16L16.5 25L5.5 25Z" fill="${color}" ${ed}/>` + rc(9, 14.6, 4, 1.8, 0.9, '#fff6a0') +
            rc(2, 19, 18, 2, 1, '#222') + rc(1.4, 17.2, 3, 2, 1, dk) + rc(17.6, 17.2, 3, 2, 1, dk) +
            rc(6, 26, 10, 12, 3, '#34343a') +
            `<ellipse cx="7.6" cy="31" rx="2.3" ry="5" fill="#1f2430"/><ellipse cx="14.4" cy="31" rx="2.3" ry="5" fill="#1f2430"/>` +
            `<path d="M5.5 44L16.5 44L15.5 55Q11 58.5 6.5 55Z" fill="${color}" ${ed}/>` + rc(6.5, 47, 9, 8, 2.5, dk) +
            rc(5.8, 36, 10.4, 12, 5, '#1f2430') +
            `<path d="M6.8 32Q11 29 15.2 32L14.6 41Q11 43.5 7.4 41Z" fill="${jk}"/>` +
            `<path d="M7 31.4L3.6 21.4L5 21L8.6 30.6ZM15 31.4L18.4 21.4L17 21L13.4 30.6Z" fill="${jk}"/>` +
            `<circle cx="11" cy="34" r="3.3" fill="#f1f3f5" stroke="#222" stroke-width=".7"/><path d="M9.2 32.2Q11 31 12.8 32.2" stroke="#0b2a3a" stroke-width="1.2" fill="none"/>` +
            rc(9.5, 56, 3, 1.2, 0.6, '#ff2a2a') + '</svg>';
    }
    return `<svg ${NS} viewBox="0 0 24 70"><defs>${GLASS_DEF}</defs>` +
        rc(9.3, 1, 5.4, 15, 2.7, '#0c0c0e') + rc(11.3, 3, 1.4, 11, 0.7, '#3a3a40') +
        rc(11, 14, 2, 8, 0.8, '#8a8f98') + rc(8.8, 51, 6.4, 17, 3.2, '#0c0c0e') + rc(10.9, 53, 2.2, 13, 1, '#3a3a40') +
        rc(10.5, 44, 3, 10, 1, '#444') + rc(15.8, 50, 1.6, 8, 0.8, '#b8bcc4') +
        `<path d="M12 5L16.5 14L17.5 24L6.5 24L7.5 14Z" fill="${color}" ${ed}/>` +
        '<path d="M9.5 15L14.5 15L15.5 21L8.5 21Z" fill="url(#gl)" opacity=".85"/>' +
        rc(10.4, 4.2, 3.2, 2, 1, '#fff6a0') +
        rc(2.5, 22.5, 19, 2, 1, '#222') + rc(2, 20.5, 3, 2, 1, dk) + rc(19, 20.5, 3, 2, 1, dk) +
        `<path d="M8.2 24L15.8 24L16.5 36L7.5 36Z" fill="${mix(color, 0.15)}" ${ed}/>` +
        `<path d="M8.5 44L15.5 44L14.5 56L9.5 56Z" fill="${dk}" ${ed}/>` +
        `<ellipse cx="7.5" cy="33" rx="2" ry="5" fill="#1f2430"/><ellipse cx="16.5" cy="33" rx="2" ry="5" fill="#1f2430"/>` +
        `<path d="M8 30Q12 27 16 30L15 42Q12 44 9 42Z" fill="${jk}"/>` +
        `<path d="M7.5 29L4 24L5.4 23.3L9 28ZM16.5 29L20 24L18.6 23.3L15 28Z" fill="${jk}"/>` +
        `<circle cx="12" cy="31.5" r="3.4" fill="#f1f3f5" stroke="#222" stroke-width=".7"/><path d="M10.2 29.4Q12 28 13.8 29.4" stroke="#0b2a3a" stroke-width="1.3" fill="none"/>` +
        rc(10.5, 56, 3, 1.2, 0.6, '#ff2a2a') + '</svg>';
}

// Camion 44×130 : cabine colorée + remorque nervurée
export function truckSvg(color) {
    const p = paint(color), dk = mix(color, -0.55);
    const trailer = 'M4 34h36q2 0 2 2v90q0 2-2 2H4q-2 0-2-2V36q0-2 2-2z';
    return `<svg ${NS} viewBox="0 0 44 130"><defs>${p.defs}${GLASS_DEF}</defs>` +
        tire(0.5, 8, 6.5, 14) + tire(37, 8, 6.5, 14) + tire(0.5, 88, 6.5, 14) + tire(37, 88, 6.5, 14) + tire(0.5, 106, 6.5, 14) + tire(37, 106, 6.5, 14) +
        shade(trailer) + `<path d="${trailer}" fill="#e6e9ef" stroke="#9aa0ad" stroke-width="1"/>` +
        [44, 54, 64, 76, 88, 100, 112].map((y) => `<path d="M3 ${y}h38" stroke="rgba(0,0,0,.12)" stroke-width=".8"/>`).join('') +
        rc(2, 70, 40, 10, 0, p.fill) + rc(18, 38, 8, 5, 1.5, '#cfd4dc') +
        shade('M8 3Q22 -1 36 3Q40 6 40 14V30Q40 33 37 33H7Q4 33 4 30V14Q4 6 8 3Z') +
        `<path d="M8 3Q22 -1 36 3Q40 6 40 14V30Q40 33 37 33H7Q4 33 4 30V14Q4 6 8 3Z" fill="${p.fill}" stroke="${dk}" stroke-width=".8"/>` +
        glass('M9 9Q22 6 35 9L34 19H10Z', 'M11 10.5L17 10L15.5 17.5L12 18Z') + rc(9, 21, 26, 8, 2, mix(color, 0.2)) +
        rc(11, 1.4, 22, 2, 1, '#222') + lamp('M6 5L12 3.5L12 7L6 8Z') + lamp('M38 5L32 3.5L32 7L38 8Z') +
        rc(0.5, 12, 3.5, 5, 1.2, '#222') + rc(40, 12, 3.5, 5, 1.2, '#222') + '</svg>';
}

// Cône de chantier vu de dessus
export function coneSvg() {
    return `<svg ${NS} viewBox="0 0 40 40"><rect x="4" y="4" width="32" height="32" rx="5" fill="#ff9f1c"/><circle cx="20" cy="20" r="13" fill="#ff6b00"/><circle cx="20" cy="20" r="8" fill="#fff"/><circle cx="20" cy="20" r="4" fill="#ff6b00"/></svg>`;
}

// Barrière rayée rouge/blanc
export function barrierSvg() {
    let stripes = '';
    for (let i = 0; i < 5; i++) {
        const b = 10 + i * 19;
        stripes += `<polygon points="${b},4 ${b + 10},4 ${b + 4},26 ${b - 6},26" fill="#e63946"/>`;
    }
    return `<svg ${NS} viewBox="0 0 100 30"><rect x="2" y="4" width="96" height="22" rx="5" fill="#fff"/>${stripes}<rect x="2" y="4" width="96" height="22" rx="5" fill="none" stroke="#555" stroke-width="2"/></svg>`;
}

// Pastille bonus (verte, étoile) ou malus (violette, point d'exclamation)
export function pickupSvg(kind) {
    if (kind === 'bonus') {
        return `<svg ${NS} viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#12c98a" stroke="#fff" stroke-width="3"/><polygon points="20,8 24,16 33,17 26,23 28,32 20,27 12,32 14,23 7,17 16,16" fill="#fff"/></svg>`;
    }
    return `<svg ${NS} viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#7a2fd0" stroke="#111" stroke-width="3"/><rect x="18" y="9" width="4" height="14" rx="2" fill="#fff"/><circle cx="20" cy="28" r="2.6" fill="#fff"/></svg>`;
}