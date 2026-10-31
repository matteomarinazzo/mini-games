// Fiches voiture V11–V14. color = livrée, sc = échelle (largeur, hauteur, longueur), kind = carrosserie (gt, wedge, proto, rally, open), accent = couleur de bande.
import { CARS } from './physics.js';
import { loadCustom } from './config.js';

const car = (id, name, kind, color, o) => ({
    id, name, kind, color, mass: 1250, vmax: 85, power: 440000, brakeForce: 21000, grip: 1.5, understeer: .3, oversteer: .3, aero: 1.1, drag: .55,
    a: 1.25, b: 1.45, h: .5, tw: 1.6, iz: 0, eff: .9, steerMax: .5, steerV: 30, rearK: 1.15, sc: [1, 1, 1], ...o,
});
const fin = (S) => { S.iz = S.iz || Math.round(S.mass * 2.24); S.gears = [.28, .46, .63, .78, .91, 1.06].map((k) => Math.round(k * S.vmax)); return S; };
const L = [
    car('lame', 'Lame', 'gt', [.15, .45, .95], { mass: 1150, vmax: 95, power: 540000, brakeForce: 20000, grip: 1.42, understeer: .8, oversteer: .2, aero: .85, drag: .48, a: 1.2, b: 1.35, h: .46, iz: 2500, rearK: 1.3, sc: [.96, .9, .944] }),
    car('orage', 'Orage', 'gt', [.55, .2, .8], { mass: 1300, vmax: 72, power: 380000, brakeForce: 22000, understeer: .15, oversteer: .9, aero: 1.9, a: 1.3, b: 1.4, h: .52, iz: 3000, rearK: 1.02, sc: [1.04, 1.06, 1.03] }),
    car('cime', 'Cime', 'gt', [.1, .7, .45], { mass: 1300, vmax: 80, power: 400000, brakeForce: 24000, grip: 1.9, understeer: .2, oversteer: .2, aero: 1.25, rearK: 1.1, sc: [1.02, 1, .98] }),
    // GT musclées
    car('tonnerre', 'Tonnerre', 'gt', [.8, .05, .05], { mass: 1500, vmax: 88, power: 500000, brakeForce: 24000, grip: 1.35, understeer: .25, oversteer: .75, aero: .6, drag: .6, a: 1.3, b: 1.4, h: .54, rearK: 1.05, sc: [1.06, 1.04, 1.03], accent: [.1, .1, .1] }),
    car('vipere', 'Vipère', 'gt', [.2, .8, .2], { mass: 1180, vmax: 92, power: 500000, grip: 1.5, understeer: .3, oversteer: .4, aero: 1.0, h: .46, rearK: 1.2, sc: [.98, .92, .97], accent: [.05, .05, .05] }),
    car('titan', 'Titan', 'gt', [.5, .55, .6], { mass: 1450, vmax: 80, power: 430000, brakeForce: 26000, grip: 1.55, understeer: .4, oversteer: .15, aero: 1.3, drag: .58, a: 1.3, b: 1.42, h: .55, tw: 1.7, rearK: 1.15, sc: [1.08, 1.08, 1.04], accent: [1, .75, .1] }),
    // hypercars en coin
    car('comete', 'Comète', 'wedge', [.95, .85, .1], { mass: 1100, vmax: 98, power: 560000, brakeForce: 22000, grip: 1.55, aero: 1.2, drag: .5, a: 1.18, b: 1.4, h: .44, rearK: 1.2, accent: [.1, .1, .12] }),
    car('spectre', 'Spectre', 'wedge', [.1, .1, .13], { mass: 1050, vmax: 102, power: 600000, brakeForce: 23000, grip: 1.6, aero: 1.4, drag: .5, a: 1.15, b: 1.42, h: .42, understeer: .25, oversteer: .35, rearK: 1.18, accent: [.9, .1, .1] }),
    car('nebula', 'Nébuleuse', 'wedge', [.85, .2, .6], { mass: 1200, vmax: 90, power: 480000, grip: 1.5, aero: 1.0, drag: .52, h: .46, understeer: .35, accent: [.95, .95, 1] }),
    // prototypes d'endurance
    car('aigle', 'Aigle', 'proto', [.92, .92, .96], { mass: 940, vmax: 99, power: 620000, brakeForce: 22800, grip: 1.85, aero: 1.8, drag: .5, a: 1.12, b: 1.5, h: .42, tw: 1.72, eff: .92, steerMax: .49, steerV: 31, rearK: 1.15, oversteer: .3, accent: [.1, .3, .8] }),
    car('zephyr', 'Zéphyr', 'proto', [.1, .4, .6], { mass: 980, vmax: 94, power: 580000, brakeForce: 22500, grip: 1.8, aero: 1.6, drag: .5, a: 1.12, b: 1.5, h: .42, tw: 1.72, eff: .92, steerV: 31, rearK: 1.15, accent: [.95, .8, .1] }),
    car('prototype', 'Prototype X', 'proto', [.12, .78, .92], { mass: 960, vmax: 96, power: 610000, brakeForce: 22800, grip: 1.82, understeer: .2, oversteer: .32, aero: 1.72, drag: .5, a: 1.12, b: 1.5, h: .42, tw: 1.72, iz: 2350, eff: .92, steerMax: .49, steerV: 31, rearK: 1.15, sc: [1, 1, 1] }),
    // monoplaces
    car('f1', 'F1 Éclair', 'open', [.95, .12, .08], { mass: 800, vmax: 105, power: 690000, brakeForce: 25000, grip: 2.05, understeer: .12, oversteer: .25, aero: 2.2, drag: .48, a: 1.05, b: 1.55, h: .38, tw: 1.8, iz: 2100, eff: .92, steerMax: .48, steerV: 32, rearK: 1.18, sc: [1, 1, 1.02] }),
    car('mistral', 'Mistral Jr', 'open', [.95, .95, .2], { mass: 650, vmax: 82, power: 300000, brakeForce: 17000, grip: 1.7, aero: 1.4, drag: .45, a: 1.1, b: 1.6, h: .36, tw: 1.7, eff: .92, steerMax: .48, steerV: 30, rearK: 1.15, understeer: .15, oversteer: .25 }),
    car('foudre', 'Foudre F1', 'open', [.1, .2, .8], { mass: 790, vmax: 108, power: 700000, brakeForce: 25000, grip: 2.1, aero: 2.3, drag: .48, a: 1.05, b: 1.55, h: .38, tw: 1.8, eff: .92, steerMax: .48, steerV: 32, rearK: 1.18, understeer: .12, oversteer: .25 }),
    car('eclat', 'Éclat', 'open', [.95, .55, .1], { mass: 780, vmax: 104, power: 660000, brakeForce: 24000, grip: 1.95, aero: 1.9, drag: .5, a: 1.05, b: 1.55, h: .38, tw: 1.8, eff: .92, steerMax: .48, steerV: 32, rearK: 1.18 }),
    car('phoenix', 'Phénix', 'open', [.9, .25, .05], { mass: 730, vmax: 100, power: 620000, brakeForce: 23500, grip: 1.9, aero: 2.0, drag: .47, a: 1.08, b: 1.55, h: .37, tw: 1.76, eff: .92, steerMax: .48, steerV: 32, rearK: 1.16, oversteer: .3 }),
    car('x2014', 'X2014 Concepte', 'open', [.07, .1, .45], { mass: 545, vmax: 135, power: 1118000, brakeForce: 30000, grip: 3.5, aero: 4.5, drag: .26, a: 1.02, b: 1.55, h: .32, tw: 1.8, eff: .93, steerMax: .46, steerV: 34, rearK: 1.2, understeer: .1, oversteer: .2, accent: [.9, .1, .12], sc: [1, 1, 1.03] }),   // concept F1 sans règlement
    // rallye
    car('rallye', 'Rallye 4×4', 'rally', [.9, .58, .08], { mass: 1380, vmax: 78, power: 420000, brakeForce: 24500, grip: 1.62, understeer: .3, oversteer: .18, aero: .65, drag: .62, a: 1.3, b: 1.42, h: .62, tw: 1.7, iz: 3100, steerV: 28, rearK: 1.12, sc: [1, 1, 1] }),
    car('baroudeur', 'Baroudeur', 'rally', [.1, .3, .9], { mass: 1320, vmax: 76, power: 400000, brakeForce: 24000, grip: 1.7, aero: .7, drag: .62, a: 1.3, b: 1.42, h: .62, tw: 1.7, iz: 3000, steerV: 28, rearK: 1.1, accent: [1, .8, .1] }),
    car('safari', 'Safari', 'rally', [.85, .8, .7], { mass: 1450, vmax: 74, power: 440000, brakeForce: 25000, grip: 1.55, aero: .6, drag: .65, a: 1.32, b: 1.42, h: .66, tw: 1.72, steerV: 27, rearK: 1.08, sc: [1.02, 1.04, 1], accent: [.8, .1, .1] }),
];
for (const S of L) CARS[S.id] = fin(S);
Object.assign(CARS.serra_gt, { kind: 'gt' });
export const look = (S) => ({ color: S.color || [.95, .42, .1], sc: S.sc || [1, 1, 1], kind: S.kind || 'gt', accent: S.accent || [.96, .96, .96] });

// --- Voitures personnalisées (créées dans le menu Conception, stockées dans localStorage via config.js)
export const KIND_LIST = [['gt', 'GT'], ['wedge', 'Hypercar'], ['proto', 'Prototype'], ['rally', 'Rallye'], ['open', 'Monoplace']];
/** [clé, libellé, min, max, pas, unité] */
export const SPEC = [['vmax', 'Vitesse max', 150, 400, 5, ' km/h'], ['ch', 'Puissance', 200, 1500, 10, ' ch'], ['mass', 'Masse', 500, 1800, 10, ' kg'], ['grip', 'Adhérence', 1, 3.5, .05, ''], ['aero', 'Appui aéro', .3, 4.5, .1, ''], ['bal', 'Équilibre : sous-virage ↔ survirage', 0, 1, .05, '']];
const GEO = {
    gt: { a: 1.25, b: 1.45, h: .5, tw: 1.6, drag: .55, steerMax: .5, steerV: 30 },
    wedge: { a: 1.18, b: 1.4, h: .44, tw: 1.6, drag: .5, steerMax: .5, steerV: 30 },
    proto: { a: 1.12, b: 1.5, h: .42, tw: 1.72, drag: .5, steerMax: .49, steerV: 31, eff: .92 },
    rally: { a: 1.3, b: 1.42, h: .62, tw: 1.7, drag: .62, steerMax: .5, steerV: 28 },
    open: { a: 1.05, b: 1.55, h: .38, tw: 1.8, drag: .48, steerMax: .48, steerV: 32, eff: .92 },
};
const rgb = (h) => (/^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) : [.9, .2, .1]);
const val = (d, k) => { const s = SPEC.find((q) => q[0] === k), v = parseFloat(d[k]); return Math.max(s[2], Math.min(s[3], Number.isFinite(v) ? v : s[2])); };
/** Définition { id, name, kind, color '#rrggbb', accent, vmax km/h, ch, mass, grip, aero, bal 0–1 } → fiche physique complète. */
export function customSheet(d) {
    const kind = GEO[d.kind] ? d.kind : 'gt', mass = val(d, 'mass'), grip = val(d, 'grip'), bal = val(d, 'bal');
    return fin(car(String(d.id), String(d.name || 'Ma voiture').slice(0, 16), kind, rgb(d.color), {
        ...GEO[kind], mass, grip, vmax: val(d, 'vmax') / 3.6, power: val(d, 'ch') * 735.5, brakeForce: Math.round(mass * grip * 11.5),
        aero: val(d, 'aero'), understeer: 1 - bal, oversteer: bal, accent: rgb(d.accent),
    }));
}
export const registerCustom = (d) => (CARS[d.id] = customSheet(d));
for (const d of loadCustom()) registerCustom(d);
