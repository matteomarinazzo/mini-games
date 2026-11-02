// Escape Game · salles V5 : puzzles par déduction, tout objet fouillable porte un document ou la clé, plaque unique, observables, collisions, visée
export const RANGE = 1.6, EYE = 1.6, RAD = 0.25, H = 3;
export const RO = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
export const BR = { 0: [2, 4, 5], 1: [1], 2: [1, 2], 3: [1, 4], 4: [1, 4, 5], 5: [1, 5], 6: [1, 2, 4], 7: [1, 2, 4, 5], 8: [1, 2, 5], 9: [2, 4] };
export const MO = ['-----', '.----', '..---', '...--', '....-', '.....', '-....', '--...', '---..', '----.'];
const shift = (t, k) => [...t].map((c) => (c === ' ' ? c : String.fromCharCode((((c.charCodeAt(0) - 65 + k) % 26) + 26) % 26 + 65))).join('');
const hx = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
// thèmes sourds : trois teintes (mur/sol, bois, tissu) + un accent (poignées, clé). Les listes k/d gardent leur longueur : la génération ne change pas.
// k = objets fouillables possibles, d = meubles décoratifs, w = fenêtre
const TH = [
    { name: 'bureau', wall: 0x3a352f, floor: 0x2a2018, ceil: 0x1e1a16, f1: 0x4c5560, f2: 0x86684a, cab: 0x6c5238, rug: 0x46515b, acc: 0xc89a4a, w: 1,
        k: ['dessous', 'etagere', 'lamp', 'frame', 'drawer', 'pot', 'poubelle', 'paper'], d: ['chaise', 'chaise'] },
    { name: 'chambre', wall: 0x41322f, floor: 0x2c2018, ceil: 0x211b18, f1: 0x5a4658, f2: 0x7a5a42, cab: 0x7a5a42, rug: 0x56465a, acc: 0xc8a060, w: 1,
        k: ['oreiller', 'litd', 'armoire', 'rug', 'lamp', 'rideau', 'frame', 'drawer'], d: ['ntable', 'ntable'] },
    { name: 'cuisine', wall: 0x3d4036, floor: 0x2b241d, ceil: 0x211c16, f1: 0x4a6058, f2: 0x6a5a3c, cab: 0x6a5a3c, rug: 0x4a6058, acc: 0xd0a050, w: 1,
        k: ['poubelle', 'pot', 'frame', 'drawer', 'livre', 'etagere'], d: ['plan', 'placard', 'plan'] },
    { name: 'cave', wall: 0x343432, floor: 0x232220, ceil: 0x1a1815, f1: 0x4c4a50, f2: 0x5e4a34, cab: 0x5e4a34, rug: 0x4c4a50, acc: 0xc09050, w: 0,
        k: ['etagere', 'radiateur', 'lamp', 'livre', 'poubelle', 'drawer'], d: ['caisse', 'tuyau', 'carton', 'caisse'] },
    { name: 'grenier', wall: 0x463a28, floor: 0x2c2216, ceil: 0x251a10, f1: 0x58503c, f2: 0x76593a, cab: 0x76593a, rug: 0x58503c, acc: 0xc89850, w: 1,
        k: ['frame', 'lamp', 'rug', 'coussin', 'livre', 'etagere'], d: ['carton', 'carton', 'caisse'] },
];
const FM = [.9, .78, 1.12, .55, 1, .84];
const fc = (c, k = 1) => { const o = new Float32Array(18); for (let f = 0; f < 6; f++) for (let i = 0; i < 3; i++) o[f * 3 + i] = Math.min(1, c[i] * FM[f] * k); return o; };
// couleur « plate » : ignore la lumière (papiers, ampoule, cadran)
const fl = (h) => { const c = hx(h), o = new Float32Array(18); for (let i = 0; i < 18; i++) o[i] = c[i % 3]; o.fl = 1; return o; };
const E = (t) => t * t * (3 - 2 * t); // courbe douce : départ et arrivée lents, pas de rebond
const mh = (a, b, t) => { const p = hx(a), q = hx(b); return ((p[0] + (q[0] - p[0]) * t) * 255 << 16) | ((p[1] + (q[1] - p[1]) * t) * 255 << 8) | ((p[2] + (q[2] - p[2]) * t) * 255); };
const mx = (a, b, t) => hx(mh(a, b, t));
// Volet tournant approximé par n boîtes alignées (le moteur ne sait pas tourner) : plan (A,Q), pivot (a0,q0), angle de +A vers +Q,
// longueur len à partir de st, épaisseur th, décalage normal off. f(A, Q, tailleA, tailleQ) reçoit le centre et l’emprise de chaque tranche.
const slab = (n, a0, q0, ang, len, th, off, st, f) => {
    const ca = Math.cos(ang), sa = Math.sin(ang), sg = len / n, ea = Math.abs(ca), es = Math.abs(sa);
    for (let i = 0; i < n; i++) { const x = st + sg * (i + .5); f(a0 + x * ca - off * sa, q0 + x * sa + off * ca, ea * sg + es * th, es * sg + ea * th); }
};
// geste : durée (s), part du geste où l’objet commence à glisser vers le joueur
const DUR = { door: .7, chest: .6, drawer: .5, rug: .6, frame: .5 }, PA = { frame: .85, chest: .5, drawer: .55, rug: .5 };
const ANOM3 = { ajar: 1, moved: 1, lift: 1 };
const aeOf = (ob) => { const b = ob.was && ANOM3[ob.an] ? .3 : 0; return b + (1 - b) * E(ob.a); };
export function rng(s) {
    return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Meubles par assemblage de boîtes. parts : [décalage u, y, largeur, hauteur, épaisseur, distance au mur, couleur, déplacement à l’ouverture [du,dy,do]]
// p : emplacement (f sol, v mur, b les deux) · w largeur · sd solide [hauteur, profondeur] · hi boîte de visée [y0, y1, profondeur]
// cinq familles : bois (cab, cabD, woodD), métal (metal, metalD), papier (cream), tissu (rug, cloth, f1), verre (win). Porte, coffre, tiroir, tapis, cadre, lampe : voir model().
const BED = (mp, mb) => [[0, 0, 1, .8, .06, 0, 'woodD'], [0, .26, 1, .1, .05, .95, 'woodD'], [-.47, .14, .06, .2, .9, .06, 'cab'], [.47, .14, .06, .2, .9, .06, 'cab'],
    [0, .3, .9, .16, .86, .07, 'mat'], [0, .46, .92, .05, .5, .43, 'rug'], [0, .46, .5, .12, .26, .09, 'cloth', mp], [0, .02, .7, .23, .7, .15, 'box', mb]];
const PT = {
    oreiller: { p: 'f', w: 1, sd: [.8, 1], hi: [0, .8, 1], pr: BED([0, .3, .25], 0) },
    litd: { p: 'f', w: 1, sd: [.8, 1], hi: [0, .8, 1], pr: BED(0, [0, 0, .6]) },
    armoire: { p: 'b', w: 1, sd: [2, .6], hi: [0, 2, .6], pr: [[0, .08, 1, 1.86, .55, 0, 'cab'], [0, 1.94, 1.06, .06, .6, 0, 'cabD'], [0, 0, 1.02, .08, .6, 0, 'woodD'], [0, .12, .9, 1.76, .03, .55, 'dkf'],
        [.25, .1, .5, 1.8, .04, .58, 'cab'], [-.25, .1, .5, 1.8, .04, .62, 'cabD', [.5, 0, 0]], [-.05, .9, .04, .22, .03, .66, 'gold', [.5, 0, 0]], [.05, .9, .04, .22, .03, .62, 'gold']] },
    rideau: { p: 'v', w: 1, hi: [.2, 2.4, .2], pr: [[0, 1, .8, 1.2, .04, 0, 'win'], [0, 2.35, 1.1, .05, .06, .02, 'metal'], [0, .3, .96, 2.05, .1, .06, 'curt', [.6, 0, 0]]] },
    pot: { p: 'f', w: .5, sd: [.5, .5], hi: [0, .9, .5], pr: [[0, 0, .34, .36, .34, .08, 'terra'], [0, .34, .42, .06, .42, .04, 'cabD'], [0, .4, .3, .02, .3, .1, 'dkf'],
        [0, .42, .05, .42, .05, .215, 'green', [0, .3, 0]], [-.09, .62, .18, .05, .12, .17, 'green', [0, .3, 0]], [.09, .52, .18, .05, .12, .25, 'green', [0, .3, 0]]] },
    radiateur: { p: 'f', w: 1, sd: [.65, .14], hi: [0, .7, .2], pr: [[0, .64, .96, .04, .12, .01, 'metalD'], [0, .06, .96, .04, .12, .01, 'metalD'],
        [-.36, .1, .07, .54, .1, .01, 'metal'], [-.12, .1, .07, .54, .1, .01, 'metal'], [.12, .1, .07, .54, .1, .01, 'metal'], [.36, .1, .07, .54, .1, .01, 'metal'],
        [.25, .1, .48, .54, .03, .11, 'metalD'], [-.25, .1, .48, .54, .03, .15, 'metalD', [.5, 0, 0]]] },
    poubelle: { p: 'f', w: .45, sd: [.55, .45], hi: [0, .6, .45], pr: [[0, 0, .4, .5, .4, .03, 'bin'], [0, .26, .44, .04, .44, .01, 'metal'], [0, .5, .44, .04, .44, .01, 'metal'], [0, .54, .46, .05, .46, 0, 'metalD', [0, .25, .15]]] },
    livre: { p: 'v', w: .7, hi: [.95, 1.45, .35], pr: [[0, 1, .7, .04, .32, 0, 'cab'], [-.28, .88, .04, .12, .22, 0, 'metal'], [.28, .88, .04, .12, .22, 0, 'metal'],
        [-.24, 1.04, .12, .3, .2, .05, 'book1'], [-.1, 1.04, .1, .26, .18, .05, 'book2'], [.04, 1.04, .12, .32, .2, .05, 'book3'], [.2, 1.04, .14, .3, .2, .05, 'book1', [0, 0, .25]]] },
    horloge: { p: 'v', w: .5, hi: [1.9, 2.45, .14], pr: [[0, 1.9, .5, .55, .06, 0, 'woodD'], [0, 1.9, .5, .05, .1, 0, 'frameB'], [0, 2.4, .5, .05, .1, 0, 'frameB'], [-.225, 1.9, .05, .55, .1, 0, 'frameB'], [.225, 1.9, .05, .55, .1, 0, 'frameB']] },
    coussin: { p: 'f', w: .8, sd: [.9, .7], hi: [0, .9, .7], pr: [[-.35, 0, .06, .08, .06, .02, 'woodD'], [.35, 0, .06, .08, .06, .02, 'woodD'], [-.35, 0, .06, .08, .06, .62, 'woodD'], [.35, 0, .06, .08, .06, .62, 'woodD'],
        [0, .08, .8, .32, .7, 0, 'f1'], [0, .4, .8, .5, .14, 0, 'f1'], [-.35, .4, .1, .25, .6, .1, 'f1'], [.35, .4, .1, .25, .6, .1, 'f1'], [0, .4, .56, .12, .46, .18, 'cloth', [0, .3, .2]]] },
    dessous: { p: 'f', w: 1.1, sd: [.75, .6], hi: [0, .8, .6], pr: [[0, .7, 1.14, .06, .62, 0, 'cabD'], [-.5, 0, .06, .7, .56, .02, 'woodD'], [.5, 0, .06, .7, .56, .02, 'woodD'], [0, .08, .92, .55, .03, .02, 'woodD'],
        [0, .58, .92, .12, .5, .04, 'cab'], [0, 0, .5, .32, .4, .12, 'box', [0, 0, .4]], [0, .1, .12, .04, .03, .52, 'gold', [0, 0, .4]]] },
    etagere: { p: 'b', w: 1, sd: [1.8, .35], hi: [0, 1.8, .35], pr: [[-.48, 0, .04, 1.8, .35, 0, 'cab'], [.48, 0, .04, 1.8, .35, 0, 'cab'], [0, 0, .92, 1.8, .02, 0, 'woodD'],
        [0, .3, .96, .04, .33, .01, 'cabD'], [0, .85, .96, .04, .33, .01, 'cabD'], [0, 1.4, .96, .04, .33, .01, 'cabD'], [0, 1.76, 1, .04, .35, 0, 'cabD'],
        [-.25, .34, .3, .25, .25, .06, 'box'], [.25, .89, .3, .22, .25, .06, 'book1'], [0, 1.44, .5, .28, .25, .06, 'box', [0, 0, .15]]] },
    rug: { p: 'f', w: 1.5, hi: [0, .4, 1.7], pr: [] },
    // décor non fouillable
    window: { p: 'v', w: 1, pr: [[0, .9, .9, 1.1, .04, 0, 'win'], [0, 2, 1.04, .07, .09, 0, 'frameB'], [0, .83, 1.04, .07, .09, 0, 'frameB'], [-.48, .9, .06, 1.1, .08, 0, 'frameB'], [.48, .9, .06, 1.1, .08, 0, 'frameB'], [0, .9, .04, 1.1, .08, 0, 'frameB'], [0, .76, 1.1, .05, .16, 0, 'cabD']] },
    chaise: { p: 'f', w: .5, sd: [.9, .5], pr: [[0, .4, .45, .05, .45, .02, 'f2'], [0, .45, .45, .45, .04, .02, 'f2'], [-.19, 0, .04, .4, .04, .05, 'woodD'], [.19, 0, .04, .4, .04, .05, 'woodD'], [-.19, 0, .04, .4, .04, .39, 'woodD'], [.19, 0, .04, .4, .04, .39, 'woodD']] },
    ntable: { p: 'f', w: .5, sd: [.5, .4], pr: [[0, 0, .45, .46, .4, 0, 'cab'], [0, .46, .5, .04, .44, 0, 'cabD'], [0, .26, .38, .16, .02, .4, 'woodD'], [0, .32, .08, .04, .03, .42, 'metalD']] },
    plan: { p: 'f', w: 1.2, sd: [.9, .6], pr: [[0, 0, 1.2, .85, .58, 0, 'cab'], [0, .85, 1.26, .05, .62, 0, 'metal'], [-.3, .35, .5, .4, .03, .58, 'cabD'], [.3, .35, .5, .4, .03, .58, 'cabD'], [-.05, .5, .04, .1, .03, .61, 'metalD'], [.05, .5, .04, .1, .03, .61, 'metalD']] },
    placard: { p: 'v', w: .9, pr: [[0, 1.5, .9, .7, .35, 0, 'cab'], [-.22, 1.55, .4, .6, .03, .35, 'cabD'], [.22, 1.55, .4, .6, .03, .35, 'cabD'], [0, 1.8, .04, .12, .03, .38, 'metalD']] },
    caisse: { p: 'f', w: .7, sd: [.6, .6], pr: [[0, 0, .7, .6, .6, 0, 'box'], [0, .28, .72, .05, .62, 0, 'cab'], [0, .5, .72, .05, .62, 0, 'cab'], [-.33, 0, .05, .6, .62, 0, 'woodD'], [.33, 0, .05, .6, .62, 0, 'woodD']] },
    tuyau: { p: 'v', w: .3, pr: [[0, 0, .12, 3, .12, .04, 'pole'], [0, 2.4, 1, .1, .1, .04, 'pole']] },
    carton: { p: 'f', w: .6, sd: [.5, .5], pr: [[0, 0, .6, .45, .5, 0, 'box'], [0, .45, .62, .04, .52, 0, 'cork'], [0, .46, .08, .02, .5, 0, 'cabD']] },
};

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], MOIS = ['mars', 'avril', 'mai', 'juin', 'juillet'];
const VOICES = ['La lumière était déjà allumée en arrivant.', 'Je suis passé par ici avant la nuit.', 'Ça sentait le tabac froid.', 'Quelqu’un a dit que rien ne fonctionnait ici.', 'Tout fonctionnait quand je suis arrivé.', 'J’ai entendu un bruit derrière le mur.', 'Il n’y avait personne, je le jure.', 'On était deux à fouiller cette salle.', 'J’ai tout remis à sa place.', 'Rien n’a bougé, je crois.', 'La porte était déjà verrouillée.', 'Je n’ai pas touché au coffre.'];
const NAME = { dessous: 'le bureau', etagere: 'l’étagère', lamp: 'la lampe', frame: 'le cadre', drawer: 'le tiroir', pot: 'le pot', poubelle: 'la poubelle', paper: 'le papier au mur', oreiller: 'l’oreiller', litd: 'le lit', armoire: 'l’armoire', livre: 'les livres', radiateur: 'le radiateur', coussin: 'le coussin', lever: 'le levier', chest: 'le coffre' };
const ANOM = { ajar: 'ne ferme pas', lit: 'une lueur', corner: 'un coin de papier dépasse', tilt: 'de travers' };
const SN = { roman: 'chiffres romains', bin: 'binaire', lignes: 'lignes cochées', braille: 'braille', morse: 'morse', count: 'nombre de lettres d’un mot', first: 'premières lettres de mots', last: 'dernières lettres de mots', jour: 'jour coché d’un agenda', date: 'date cherchée dans un agenda', heure: 'heure d’un billet', compte: 'lampes à compter' };
const METH = { roman: 'Lis le chiffre romain avec la table du livret.', bin: 'Lis les lampes en binaire avec la table du livret.', lignes: 'Ligne cochée et non barrée : lis dans son prix le chiffre que le reçu désigne.', braille: 'Lis la cellule avec la table braille du livret.', morse: 'Lis le groupe avec la table morse du livret.', count: 'Compte les lettres du mot : c’est le chiffre.', first: 'Lis la première lettre de chaque mot, dans l’ordre : elles écrivent un nombre en lettres.', last: 'Lis la dernière lettre de chaque mot, dans l’ordre : elles écrivent un nombre en lettres.', date: 'Cherche dans l’agenda la date notée sur une autre page : le chiffre est sur sa ligne.', jour: 'Le jour coché donne son rang : lundi 1 … dimanche 7.', heure: 'Seule l’heure du billet est le chiffre.', compte: 'Compte les lampes allumées : c’est le chiffre.' };
const NUMW = ['ZERO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF'];
const INI = { Z: ['zebre', 'zeste', 'zinc', 'zone'], E: ['encre', 'eau', 'ecole', 'etoile'], R: ['rame', 'riz', 'rose', 'radio'], O: ['ours', 'olive', 'orage', 'ocre'], U: ['usine', 'urne', 'uniforme', 'union'], N: ['nid', 'nuit', 'noix', 'neige'], D: ['dune', 'danse', 'datte', 'dragon'], X: ['xylophone', 'xenon'], T: ['table', 'tasse', 'tulipe', 'toit'], I: ['ile', 'ivoire', 'iris', 'igloo'], S: ['sel', 'sac', 'soupe', 'sable'], Q: ['quai', 'quille', 'quartz', 'quenelle'], A: ['arbre', 'ardoise', 'abeille', 'argent'], C: ['clou', 'cafe', 'chat', 'cuivre'], P: ['pain', 'plume', 'pomme', 'pont'], H: ['huile', 'hibou', 'herbe', 'horloge'], F: ['fil', 'farine', 'flute', 'fer'] };
const FIN = { Z: ['nez', 'riz', 'gaz', 'quartz'], E: ['table', 'rose', 'olive', 'plume'], R: ['four', 'cuir', 'tiroir', 'miroir'], O: ['piano', 'radio', 'stylo', 'judo'], U: ['bureau', 'genou', 'tissu', 'menu'], N: ['pain', 'jardin', 'savon', 'melon'], D: ['nord', 'sud', 'pied', 'lard'], X: ['prix', 'noix', 'voix', 'paix'], T: ['chat', 'fruit', 'toit', 'sport'], I: ['taxi', 'kiwi', 'ami', 'pari'], S: ['bras', 'tapis', 'repas', 'souris'], Q: ['coq', 'cinq'], A: ['sofa', 'opera', 'panda', 'koala'], C: ['bec', 'sac', 'lac', 'tabac'], P: ['loup', 'sirop', 'camp', 'drap'], H: ['match', 'flash', 'sandwich'], F: ['neuf', 'oeuf', 'chef', 'bref'] };
const LEN = { 3: ['sel', 'lit', 'nez', 'mur'], 4: ['lune', 'clef', 'banc', 'vent'], 5: ['arbre', 'livre', 'lampe', 'route'], 6: ['bureau', 'tiroir', 'pierre', 'miroir'], 7: ['cuisine', 'vitrine', 'cabinet', 'lumiere'], 8: ['lanterne', 'souvenir', 'chocolat', 'fauteuil'], 9: ['poussiere', 'telephone', 'chevalier'] };

const sh2 = (a, g) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = (g() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };
function build(seed, n, salt, spec0) {
    const spec = Object.assign({}, spec0), L = 4;
    const R = rng((seed + n * 1000 + salt * 7919) >>> 0);
    const ri = (a, b) => a + ((R() * (b - a + 1)) | 0), pick = (a) => a[(R() * a.length) | 0];
    const T = spec.th != null ? TH[spec.th] : pick(TH), RW = ri(8, 10), RD = ri(8, 10);
    const wp = (w, u, o) => (w === 0 ? [u, o] : w === 1 ? [u, RD - o] : w === 2 ? [o, u] : [RW - o, u]);
    const wb = (w, u, y, sw, sh, th, o) => { const m = wp(w, u, o + th / 2); return { p: [m[0], y + sh / 2, m[1]], s: w < 2 ? [sw, sh, th] : [th, sh, sw] }; };
    const hb = (w, u, y0, y1, sw, o0, o1) => {
        const p = wp(w, u - sw / 2, o0), q = wp(w, u + sw / 2, o1);
        return { a: [Math.min(p[0], q[0]), y0, Math.min(p[1], q[1])], b: [Math.max(p[0], q[0]), y1, Math.max(p[1], q[1])] };
    };
    const slots = [];
    for (let w = 0; w < 4; w++) {
        const len = w < 2 ? RW : RD, c = Math.floor(len / 1.5), sp = (len - 1.2) / c;
        for (let i = 0; i < c; i++) slots.push({ w, u: .6 + (i + .5) * sp, f: 0, v: 0 });
    }
    const take = (L, req) => {
        const c = slots.filter((s) => (L === 'b' ? !s.f && !s.v : !s[L]));
        if (!c.length) { if (req) throw 0; return null; }
        const s = pick(c); if (L === 'b') s.f = s.v = 1; else s[L] = 1; return s;
    };
    const wd = hx(T.cab), cl = hx(T.rug), lampHi = 0xffd890;
    const K = {
        wall: fc(hx(T.wall)), floor: fc(hx(T.floor)), ceil: fc(hx(T.ceil)), moul: fc(hx(T.wall), 1.4), plin: fc(hx(T.wall), .55),
        f1: fc(cl, 1.15), f2: fc(wd, 1.2),
        // bois
        cab: fc(wd), cabD: fc(wd, 1.25), woodD: fc(wd, .7), dkf: fc(wd, .3), dark: fc(hx(0x07080a)), door: fc(wd, .9), chest: fc(wd, .85), lid: fc(wd, .7), frameB: fc(wd, .6),
        box: fc(mx(T.cab, 0xc0a878, .35), 1.1), cork: fc(wd, .8), terra: fc(mx(T.cab, 0x9a6a4a, .5), 1), pic: fc(mx(T.rug, 0xb09870, .3)),
        // métal
        gold: fc(hx(T.acc), 1.15), metal: fc(hx(0x9a9892)), metalD: fc(hx(0x65635f)), pole: fc(hx(0x4a4946)), lampB: fc(hx(0x32302e)), bin: fc(hx(0x6a6a66)), red: fc(hx(0xb83030)),
        // tissu
        rug: fc(cl), rugD: fc(cl, .72), curt: fc(cl, .9), cloth: fc(mx(T.rug, 0xb0a78c, .55)), mat: fc(cl, 1.25), green: fc(mx(T.wall, 0x7a8c56, .75), 1.2), book1: fc(cl, 1.1), book2: fc(wd, .65), book3: fc(mx(T.rug, T.cab, .5)),
        // verre
        win: fc(hx(0x0b1016)),
        // papier et voyants (couleurs plates : ignorent la lumière)
        cream: fl(0xf0e4c0), gr: fl(0x50d070), rd: fl(0xd03838), off: fl(0x3a3430), creamD: fl(0xa89e80), clk: fl(0x9a927c), bulb: fl(0xffd890), keyc: fl(mh(T.acc, 0xffffff, .15)),
    };
    K.lampR = [0, 1, 2, 3, 4].map((i) => fl(mh(0x7d7050, lampHi, i / 4)));
    const S = [], objs = [], solids = [], quads = [];
    const sc = (p, s, c) => S.push({ p, s, c, o: -1 });
    sc([RW / 2, -.1, RD / 2], [RW + .4, .2, RD + .4], K.floor);
    sc([RW / 2, H + .1, RD / 2], [RW + .4, .2, RD + .4], K.ceil);
    sc([RW / 2, H / 2, -.1], [RW + .4, H, .2], K.wall);
    sc([RW / 2, H / 2, RD + .1], [RW + .4, H, .2], K.wall);
    sc([-.1, H / 2, RD / 2], [.2, H, RD], K.wall);
    sc([RW + .1, H / 2, RD / 2], [.2, H, RD], K.wall);
    sc([RW / 2, .07, .04], [RW, .14, .08], K.plin); sc([RW / 2, .07, RD - .04], [RW, .14, .08], K.plin);
    sc([.04, .07, RD / 2], [.08, .14, RD], K.plin); sc([RW - .04, .07, RD / 2], [.08, .14, RD], K.plin);
    sc([RW / 2, 2.93, .035], [RW, .14, .07], K.moul); sc([RW / 2, 2.93, RD - .035], [RW, .14, .07], K.moul);
    sc([.035, 2.93, RD / 2], [.07, .14, RD], K.moul); sc([RW - .035, 2.93, RD / 2], [.07, .14, RD], K.moul);
    sc([RW / 2, 2.85, RD / 2], [.03, .3, .03], K.pole); sc([RW / 2, 2.66, RD / 2], [.34, .16, .34], K.bulb);
    // interactive : true uniquement pour ce qui se fouille (et la porte, avec la clé). Tout le reste est décor.
    const add = (o) => { o.id = objs.length; o.open = o.open ? 1 : 0; o.a = o.open; o.lock = o.lock || null; o.cont = o.cont || null; o.seen = 0; o.pk = 0; o.lv = -1; o.dur = DUR[o.kind] || .45; o.pa = PA[o.kind] || .5; o.interactive = !!o.srch || o.kind === 'door'; objs.push(o); return o; };
    const own = (b, id) => { b.o = id; solids.push(b); };
    const sh = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };
    const rev = (s) => [...s].reverse().join(''), p1 = (s) => [...s].map((d) => (+d + 1) % 10).join('');
    const num = (l) => { let s = String(ri(1, 9)); while (s.length < l) s += ri(0, 9); return s; };
    const p2 = (v) => String(v).padStart(2, '0');

    // porte + plaque : l'unique numéro peint, le vrai, sur le mur d'entrée
    const ds = pick(slots.filter((s) => s.w === 0)); ds.f = ds.v = 1;
    const dr = add({ kind: 'door', wall: 0, u: ds.u, hit: hb(0, ds.u, 0, 2.15, 1.1, 0, .25) });
    {   // le battant est un solide : il suit le geste (charnière du côté du coin le plus proche)
        const hs = ds.u < RW / 2 ? -1 : 1, hu = ds.u + hs * .55, lf = hb(0, ds.u, 0, 2.1, 1.1, .02, .08); own(lf, dr.id); const sl = solids[solids.length - 1];
        dr.hs = hs;
        dr.dyn = (e) => {
            const g = e * 1.66, x1 = hu - hs * 1.1 * Math.cos(g), z1 = .05 + 1.1 * Math.sin(g);
            sl.a = [Math.min(hu, x1) - .04, 0, Math.min(.05, z1) - .04]; sl.b = [Math.max(hu, x1) + .04, 2.1, Math.max(.05, z1) + .04];
        };
    }
    const ps = slots.filter((s) => s.w === 0 && !s.f && !s.v).sort((a, b) => Math.abs(a.u - RW / 2) - Math.abs(b.u - RW / 2))[0];
    if (!ps) throw 0;
    ps.f = ps.v = 1;
    { const m = wb(0, ps.u, 2.3, 1.2, .6, .02, .011), o = add({ kind: 'quad', wall: 0, u: ps.u }); quads.push({ p: m.p, s: m.s, text: 'Salle ' + n, k: 1, o: o.id }); }

    // ---- V8 : chaîne verrouillée. Un seul objet actif à la fois ; les signes (lumière, coin, biais, aiguille, clignotant) ne se voient que sur l’actif.
    const ALL = ['roman', 'bin', 'lignes', 'braille', 'morse', 'count', 'first', 'last', 'jour', 'heure', 'compte', 'date'];
    const dg = (s) => (s === 'roman' || s === 'heure' || s === 'compte' ? ri(1, 9) : s === 'count' ? ri(3, 9) : s === 'jour' ? ri(1, 7) : ri(0, 9));
    // deux systèmes par salle, toujours différents ; l’ordre (fixé par la graine) fait tourner : deux salles de suite n’en partagent aucun
    const SO = sh2(ALL, rng(seed >>> 0)), SYA = SO[(2 * n) % ALL.length], SYB = SO[(2 * n + 1) % ALL.length];
    const pair = () => { const a = dg(SYA); let b = dg(SYB), g = 0; while (b === a && g++ < 60) b = dg(SYB); if (a === b) throw 0; return [a, b]; };
    const [dP1, dP2] = pair(), [dpA, dP4] = pair(), dpB = dg(SYA), dP6 = dg(SYB);
    const RL = ['sym', 'big', 'small'], rA = pick(RL), rB = pick(RL), fA = R() < .5, fB = R() < .5;
    const ordT = (r, f, a, b) => (r === 'big' ? '9 → 1' : r === 'small' ? '1 → 9' : f ? a + ' ' + b : b + ' ' + a);
    const tA = ordT(rA, fA, '◆', '■'), tB = ordT(rB, fB, '▲', '●');
    const codeA = comb(tA, dP1, dP2, '◆', '■'), codeB = comb(tB, dpA, dP4, '▲', '●');
    const perm = sh([1, 2, 3, 4]), dd = [];
    dd[perm[0] - 1] = dP1; dd[perm[1] - 1] = dP2; dd[perm[2] - 1] = dpB; dd[perm[3] - 1] = dP6;
    const code = dd.join('');
    if (codeA === p2(n) || codeB === p2(n) || code === String(n).padStart(4, '0')) throw 0;

    const takeW = (L, w) => {
        const c = slots.filter((s) => s.w === w && (L === 'b' ? !s.f && !s.v : !s[L]));
        if (!c.length) return null;
        const s = pick(c); if (L === 'b') s.f = s.v = 1; else s[L] = 1; return s;
    };
    const sl = (L, w) => (w != null && takeW(L, w)) || take(L, 1);
    const put = (k, s, an) => {
        let o, dep = .3, top;
        if (k === 'drawer') {
            o = add({ kind: k, srch: 1, wall: s.w, u: s.u, hit: hb(s.w, s.u, .5, .85, .8, .4, 1) }); own(hb(s.w, s.u, 0, .9, 1, 0, .5), o.id); dep = .5;
            const s2 = hb(s.w, s.u, .5, .85, .8, .5, .5); own(s2, o.id); const sl = solids[solids.length - 1], w0 = s.w, u0 = s.u;
            o.dyn = (e) => { const q = hb(w0, u0, .5, .85, .8, .5, .5 + (e > 0 ? .4 * e + .06 : 0)); sl.a = q.a; sl.b = q.b; };   // le tiroir sorti est un obstacle
        }
        else if (k === 'lamp') { o = add({ kind: k, srch: 1, wall: s.w, u: s.u, hit: hb(s.w, s.u, 0, 1.8, .5, 0, .5) }); own(hb(s.w, s.u, 0, 1.8, .36, .05, .39), o.id); dep = .4; }
        else if (k === 'paper' || k === 'frame') { o = add({ kind: k, srch: 1, wall: s.w, u: s.u, hit: hb(s.w, s.u, 1.2, k === 'paper' ? 1.9 : 1.95, k === 'paper' ? .6 : .9, 0, .15) }); dep = .1; }
        else if (k === 'chest') { o = add({ kind: k, srch: 1, wall: s.w, u: s.u, hit: hb(s.w, s.u, 0, 1, .9, 0, .6) }); own(hb(s.w, s.u, 0, .9, .9, 0, .55), o.id); dep = .55; top = .7; }
        else {
            const d = PT[k]; o = add({ kind: k, srch: 1, wall: s.w, u: s.u, hit: hb(s.w, s.u, d.hi[0], d.hi[1], d.w, 0, d.hi[2]) });
            if (d.sd) {
                own(hb(s.w, s.u, 0, d.sd[0], d.w, 0, d.sd[1]), o.id);
                const mv = d.pr.filter((q) => q[7] && q[7][2] > 0), sl = solids[solids.length - 1], w0 = s.w, u0 = s.u;
                if (mv.length) o.dyn = () => {   // une pièce qui sort du volume entraîne son solide
                    const ae = aeOf(o); let dp = d.sd[1]; for (const q of mv) dp = Math.max(dp, q[5] + q[4] + q[7][2] * ae);
                    const q2 = hb(w0, u0, 0, d.sd[0], d.w, 0, dp); sl.a = q2.a; sl.b = q2.b;
                };
            }
            dep = d.hi[2];
        }
        o.an = an; o.dep = dep; o.top = top || o.hit.b[1];
        return o;
    };
    const lbl = (o, t, y, w0) => { const m = wb(o.wall, o.u, y, w0 || .8, .35, .02, .011), q = add({ kind: 'quad', wall: o.wall, u: o.u }); quads.push({ p: m.p, s: m.s, text: t, k: 1, o: q.id }); };
    const clockQ = (o, t) => { const m = wb(o.wall, o.u, 1.97, .4, .4, .03, .13), q = add({ kind: 'quad', wall: o.wall, u: o.u }); quads.push({ p: m.p, s: m.s, text: '', k: 0, o: q.id, clock: t }); };

    // 6 fouilles (signes) + 2 tiroirs + coffre. L’horloge n’apparaît que si une étape l’exige.
    const CT = ['dessous', 'etagere', 'armoire', 'oreiller', 'litd', 'pot', 'poubelle', 'radiateur', 'livre', 'coussin'];
    const ks = sh(T.k.filter((k) => CT.includes(k)));
    if (ks.length < 2) throw 0;
    const CL = ['dessous', 'armoire', 'poubelle'];
    let fi = 0;
    const kinds = sh(['lit', 'tilt', 'corner', 'clock', 'lift', 'F', 'F']).slice(0, 6).map((k) => { if (k !== 'F') return k; const f = ks[fi++]; return CL.includes(f) ? 'ajar' : 'moved'; });
    while (kinds[0] === 'clock' || kinds[0] === 'moved' || kinds[0] === 'lift') { const j = 1 + ((R() * 5) | 0); [kinds[0], kinds[j]] = [kinds[j], kinds[0]]; }
    const tm = { h: ri(1, 12), m: ri(0, 11) * 5 }, tS = tm.h + 'h' + p2(tm.m);
    let ki = 0;
    const fk = ks;
    const tobj = kinds.map((t, i) => {
        const w = i === 0 ? 0 : null;
        if (t === 'lit') return put('lamp', sl('b', w), 'lit');
        if (t === 'lift') return put('rug', sl('f', w), 'lift');
        if (t === 'tilt') return put('frame', sl('v', w), 'tilt');
        if (t === 'corner') return put('paper', sl('v', w), 'corner');
        if (t === 'clock') { const o = put('horloge', sl('v', w), 'clock'); clockQ(o, tm); return o; }
        const k = fk[ki++]; return put(k, sl(PT[k].p, w), t);
    });
    if (kinds.includes('clock')) {
        const dc = [];
        while (dc.length < 2) {
            const t = { h: ri(1, 12), m: ri(0, 11) * 5 };
            if (t.h === tm.h || dc.some((x) => x.h === t.h)) continue;
            dc.push(t); const s = take('v', 1), o = add({ kind: 'horloge', wall: s.w, u: s.u }); clockQ(o, t);
        }
    }
    tobj.forEach((o, i) => { if (kinds[i] === 'moved') { o.late = 1; solids.forEach((q) => { if (q.o === o.id) q.vis = () => cur() === o || o.open; }); } });
    const lk = (k) => { const s = take('f', 1); s.v = 1; return put(k, s, null); };
    const A = lk('drawer'), B = lk('drawer'), C = lk('chest');
    lbl(A, '2 chiffres', 1.05); lbl(B, '2 chiffres', 1.05); lbl(C, L + ' chiffres', 1.1);
    A.lock = { f: 'drawer', s: codeA }; B.lock = { f: 'drawer', s: codeB }; C.lock = { f: 'chest', s: code }; C.cont = { t: 'key' };

    // documents : données brutes, voix, note finale qui désigne la suite sans la nommer
    const NM = ['Café', 'Pain', 'Thé', 'Lait', 'Beurre', 'Sel', 'Savon', 'Piles', 'Riz', 'Miel'];
    const RUL = [['Le premier chiffre fait foi, jamais les autres.', 'Je ne regarde que le premier chiffre de chaque prix.'], ['Au milieu du prix, le deuxième chiffre fait foi.', 'Seul le deuxième chiffre de chaque prix m’importe.'], ['À la fin du prix, le dernier chiffre fait foi.', 'Seul le dernier chiffre de chaque prix m’importe.']];
    const lines = (d, pos) => sh(['v', 's', 'u', 'u']).map((t) => { const g = [ri(1, 9), ri(0, 9), ri(0, 9)]; if (t === 'v') g[pos - 1] = d; return { t: pick(NM), p: g[0] + ',' + g[1] + g[2], ok: t === 'v' || t === 's' ? 1 : 0, x: t === 's' ? 1 : 0 }; });
    const dig = (sys, d, tag) => {
        const nm = (t) => t + ' ' + tag;
        switch (sys) {
            case 'roman': return { type: 'enveloppe', name: nm('Étiquette'), text: RO[d] };
            case 'count': return { type: 'enveloppe', name: nm('Enveloppe'), text: pick(LEN[d]) };
            case 'first': return { type: 'journal', name: nm('Liste'), paras: [...NUMW[d]].map((c) => { const w = pick(INI[c]); return w[0].toUpperCase() + w.slice(1); }) };
            case 'last': return { type: 'enveloppe', name: nm('Message'), text: [...NUMW[d]].map((c) => pick(FIN[c])).join(' ') };
            case 'bin': return { type: 'lampes', name: nm('Panneau'), mode: 'bin', groups: [[...(d).toString(2).padStart(4, '0')].map(Number)] };
            case 'lignes': { const pos = d === 0 ? ri(2, 3) : ri(1, 3); return { type: 'ticket', name: nm('Reçu'), rows: lines(d, pos), total: ri(5, 40) + ',' + p2(ri(0, 99)), rule: pick(RUL[pos - 1]) }; }
            case 'braille': { const c = [0, 0, 0, 0, 0, 0]; BR[d].forEach((x) => { c[x - 1] = 1; }); return { type: 'points', name: nm('Carte'), cells: [c] }; }
            case 'jour': return { type: 'calendrier', name: nm('Agenda'), rows: DAYS.map((x, i) => ({ d: x, r: pick(['Dentiste', 'Réunion', 'Appel', 'Marché', 'Visite']), ok: i === d - 1 ? 1 : 0, x: 0 })), rule: 'Le rang du jour coché dans la semaine fait foi.' };
            case 'date': {
                const mo = pick(MOIS), ds = []; while (ds.length < 6) { const x = ri(1, 28); if (!ds.includes(x)) ds.push(x); }
                ds.sort((a, b) => a - b); const ti = ri(0, 5);
                const rows = ds.map((x, k) => ({ d: x + ' ' + mo, r: String(k === ti ? d : (d + 1 + ri(0, 8)) % 10), ok: 0, x: 0 }));
                return { type: 'calendrier', name: nm('Agenda'), rows, _dt: rows[ti].d };
            }
            case 'heure': return { type: 'enveloppe', name: nm('Billet'), text: 'Départ ' + d + 'h' + p2(ri(0, 11) * 5), rule: 'Seule l’heure compte, jamais les minutes.' };
            case 'compte': return { type: 'lampes', name: nm('Tableau'), mode: 'cnt', groups: [sh([...Array(9).keys()].map((i) => i < d))], rule: 'Compte ce qui brille.' };
            default: return { type: 'carte', name: nm('Carte postale'), text: 'Bons baisers du lac.', morse: [MO[d]] };
        }
    };
    const hasDate = SYA === 'date' || SYB === 'date';
    const g1 = sh([0, 1, 2]); if (hasDate && g1[2] !== 0) { const j = g1.indexOf(0); g1[j] = g1[2]; g1[2] = 0; }
    const g2 = sh([4, 5]), [i1, i2, iA] = g1, [i4, iB] = g2, dgs = [], sysL = [];
    const setd = (i, sy, d, tag) => { dgs[i] = dig(sy, d, tag); sysL[i] = sy; };
    setd(i1, SYA, dP1, '◆ n° ' + perm[0]); setd(i2, SYB, dP2, '■ n° ' + perm[1]); dgs[iA] = { type: 'enveloppe', name: 'Page de lecture', text: tA }; sysL[iA] = null;
    setd(3, SYA, dpA, '▲'); setd(i4, SYB, dP4, '●'); dgs[iB] = { type: 'enveloppe', name: 'Page de lecture', text: tB }; sysL[iB] = null;
    setd(6, SYA, dpB, 'n° ' + perm[2]); setd(7, SYB, dP6, 'n° ' + perm[3]);
    dgs.forEach((d, i) => { if (d._dt) { dgs[i - 1].dt = 'Daté du ' + d._dt; delete d._dt; } });
    // une règle de lecture (ex. quel chiffre du prix) n’est jamais sur la page qu’elle concerne : elle va sur une autre page lue avant le verrou
    const dl = (i) => (i <= 2 ? 2 : i <= 5 ? 5 : 7);
    dgs.forEach((d, i) => { if (d.rule) { const c = [...Array(dl(i) + 1).keys()].filter((x) => x !== i), h = dgs[pick(c)]; (h.rules = h.rules || []).push(d.rule); delete d.rule; } });
    const holders = [tobj[0], tobj[1], tobj[2], A, tobj[3], tobj[4], B, tobj[5], C];
    const tells = [kinds[0], kinds[1], kinds[2], 'lock', kinds[3], kinds[4], 'lock', kinds[5], 'lock'];
    const NOTE = {
        lit: ['Je suis sûr de l’avoir éteinte.', 'Elle devait rester éteinte cette nuit.', 'Personne n’a rallumé celle-là, et pourtant elle brille.'],
        ajar: ['Je l’ai refermé moi-même, j’en suis certain.', 'Tout était bien fermé quand je suis parti.', 'Quelque chose ne ferme plus jusqu’au bout.'],
        lift: ['Ça ne reposait pas à plat ce matin.', 'Je l’avais bien aplati, hier encore.', 'Quelque chose se soulève là où tout restait à plat.'],
        moved: ['Ça n’était pas là avant, j’en suis sûr.', 'Je jurerais que ça n’était pas là hier.', 'La pièce a changé : il y a quelque chose en plus.'],
        tilt: ['Je l’avais accroché bien droit.', 'Hier encore, rien n’était de travers.', 'Quelqu’un a touché à ce qui était aligné.'],
        corner: ['J’avais tout rangé, rien ne devait dépasser.', 'Un papier mal remis, je le jurerais.', 'Quelqu’un a oublié de tout rentrer.'],
        clock: ['Je l’ai recopié tel quel.', 'Je n’y ai rien changé.', 'C’est tout ce que j’ai noté.'],
        lock: ['Tu as tout ce qu’il faut. Un petit voyant clignote.', 'Plus rien ne bouge, sauf un voyant rouge.', 'Il ne manque aucun fait. Un voyant clignote.'],
    };
    const V = sh(VOICES);
    dgs.forEach((d, i) => {
        d.note = pick(NOTE[tells[i + 1]]);
        if (tells[i + 1] === 'clock') d.time = 'Relevé à ' + tS;
        holders[i].cont = { t: 'doc', d };
    });
    const intro = R() < .5 ? pick(NOTE[kinds[0]]) : null;
    const door = objs[0]; door.ch = C; spec.keep = 0;

    // décor : jamais fouillable
    const nd = ri(2, 3);
    for (let i = 0, g = 0; i < nd && g < 12; g++) {
        const k = pick(T.d), d = PT[k], s = take(d.p); if (!s) continue;
        const o = add({ kind: k, wall: s.w, u: s.u });
        if (d.sd) own(hb(s.w, s.u, 0, d.sd[0], d.w, 0, d.sd[1]), o.id);
        i++;
    }
    if (T.w) {   // décor fixe : une fenêtre sur le premier mur libre, hors objets
        const sv = slots.find((q) => !q.v && q.w !== 0) || slots.find((q) => !q.v);
        if (sv) { sv.v = 1; for (const q of PT.window.pr) { const m = wb(sv.w, sv.u + q[0], q[1], q[2], q[3], q[4], q[5]); sc(m.p, m.s, K[q[6]]); } }
    }
    for (const o of objs) o.interactive = o.kind === 'door' || !!o.cont;
    const cur = () => holders.find((o) => !o.open) || door;

    // indices : 3 par salle, ne portent que sur l’étape active
    const HT = { lit: 'Quelque chose reste allumé alors que ça ne devrait pas.', ajar: 'Quelque chose ne ferme pas jusqu’au bout.', moved: 'Quelque chose est apparu dans la pièce.', lift: 'Quelque chose ne repose plus à plat.', tilt: 'Quelque chose n’est pas droit.', corner: 'Un coin de papier dépasse quelque part.', clock: 'Une aiguille est figée sur une heure déjà lue.' };
    const OM = { sym: 'Les symboles disent quel papier passe en premier.', big: 'La flèche va du plus grand chiffre au plus petit.', small: 'La flèche va du plus petit chiffre au plus grand.' };
    const both = [...new Set([SN[SYA], SN[SYB]])].join(' et ');
    const hs = holders.map((o, i) => {
        if (tells[i] === 'lock') return ['Rien d’autre ne bouge : un voyant clignote.', 'Tout se déduit des pages déjà lues, en ' + both + '.',
            i === 8 ? 'Quatre papiers portent « n° k » : pose chaque chiffre à la position de son n°.' : i === 3 ? 'Lis le chiffre de ◆ et de ■, puis ordonne-les comme la page de lecture.' : 'Lis le chiffre de ▲ et de ●, puis ordonne-les comme la page de lecture.'];
        const sy = sysL[i];
        return [HT[tells[i]], sy ? 'Ce papier parle en ' + SN[sy] + '.' : 'Ce papier donne un ordre de lecture, pas un chiffre.', sy ? METH[sy] : OM[i === iA ? rA : rB]];
    });
    const hint = (k) => { const i = holders.findIndex((o) => !o.open); return i >= 0 ? hs[i][k] : (k === 2 ? 'La clé ouvre la porte.' : 'La lampe de la porte est verte : va ouvrir.'); };
    const meth = 'lis chaque papier ; ◆ et ■ (ordre de la page de lecture) ouvrent le premier tiroir, ▲ et ● le second, et les quatre papiers « n° k » donnent le coffre, chaque chiffre à sa position.';

    const blk = () => (((Date.now() / 380) | 0) % 2 ? K.red : K.bulb);
    let cam = { x: RW / 2, z: RD - 1.4, yaw: 0, pitch: 0 };
    const model = (ob, out) => {
        const on = cur() === ob; if (on) ob.was = 1;
        const a = ob.a, e = E(a), ae = aeOf(ob), w = ob.wall, u = ob.u, add = (m, c) => out.push({ p: m.p, s: m.s, c, o: ob.id });
        switch (ob.kind) {
            case 'chest':   // couvercle sur charnière arrière, intérieur sombre, la clé monte
                add(wb(w, u, 0, .94, .06, .58, 0), K.woodD); add(wb(w, u, .06, .9, .36, .55, .01), K.chest);
                add(wb(w, u - .3, .06, .06, .36, .58, 0), K.metalD); add(wb(w, u + .3, .06, .06, .36, .58, 0), K.metalD);
                if (a > 0) add(wb(w, u, .42, .78, .012, .43, .07), K.dark);
                slab(a > 0 ? 4 : 1, .13, .42, e * 1.6, .55, .12, .06, -.11, (A, Q, sA, sQ) => add(wb(w, u, Q - sQ / 2, .92, sQ, sA, A - sA / 2), K.lid));
                if (a < .5) add(wb(w, u, .3, .14, .16, .04, .56), on ? blk() : K.gold); break;
            case 'drawer': {   // caisson, façade et caisse qui coulissent vers le joueur
                const sd = .4 * e;
                add(wb(w, u, 0, .96, .07, .46, .02), K.woodD); add(wb(w, u, .07, 1, .46, .5, 0), K.cab); add(wb(w, u, .82, 1.04, .06, .54, 0), K.cabD);
                add(wb(w, u - .45, .53, .1, .29, .5, 0), K.cab); add(wb(w, u + .45, .53, .1, .29, .5, 0), K.cab); add(wb(w, u, .53, .8, .29, .06, 0), K.dark);
                add(wb(w, u, .55, .78, .25, .04, .46 + sd), K.cabD);
                add(wb(w, u - .37, .56, .04, .16, .4, .06 + sd), K.woodD); add(wb(w, u + .37, .56, .04, .16, .4, .06 + sd), K.woodD); add(wb(w, u, .55, .76, .03, .4, .06 + sd), K.woodD);
                add(wb(w, u, .64, .2, .05, .05, .5 + sd), on && !ob.open ? blk() : K.gold); break;
            }
            case 'lamp': {   // l’abat-jour change de teinte : la lumière s’éteint en 0,45 s
                const lv = ob.lv < 0 ? (on ? 1 : 0) : ob.lv, c = K.lampR[Math.round(lv * 4)];
                add(wb(w, u, 0, .34, .04, .34, .03), K.lampB); add(wb(w, u, .04, .05, 1.28, .05, .17), K.metal);
                add(wb(w, u, 1.28, .42, .16, .42, 0), c); add(wb(w, u, 1.44, .3, .14, .3, .06), c); add(wb(w, u, 1.58, .06, .05, .06, .18), K.metal); break;
            }
            case 'paper':   // liège, feuille épinglée ; le coin dépasse puis se décolle
                add(wb(w, u, 1.2, .6, .7, .03, 0), K.cork); add(wb(w, u, 1.3, .34, .44, .015, .03), ob.open ? K.creamD : K.cream);
                add(wb(w, u - .1, 1.7, .04, .04, .03, .045), K.metal); add(wb(w, u + .1, 1.7, .04, .04, .03, .045), K.metal);
                if (ob.was || ob.open) add(wb(w, u + .2, 1.6 + .03 * ae, .14, .14, .025, .05 + .1 * ae), K.cream); break;
            case 'frame': {   // se redresse, puis bascule autour de sa charnière haute ; la page n’est lisible qu’à la fin
                const p1 = Math.min(1, a / .2), p2 = a <= .2 ? 0 : E((a - .2) / .8), Y0 = 1.9;
                if (ob.pk <= 0) add(wb(w, u, 1.38, .4, .5, .012, .004), p2 >= .98 ? K.cream : K.creamD);   // la page part dans la main du joueur
                if (p2 <= 0) {
                    const tl = ob.was && ob.an === 'tilt' ? .087 * (1 - p1) : 0;
                    for (let i = 0; i < 5; i++) { const du = (i - 2) * .18, dy = du * tl; add(wb(w, u + du, 1.25 + dy, .18, .65, .05, .04), K.frameB); if (i > 0 && i < 4) add(wb(w, u + du, 1.325 + dy, .18, .5, .03, .09), K.pic); }
                } else {
                    slab(4, 0, 0, p2 * 1.13, .65, .05, .025, 0, (A, Q, sA, sQ) => add(wb(w, u, Y0 - A - sA / 2, .9, sA, sQ, .04 + Q - sQ / 2), K.frameB));
                    slab(4, 0, 0, p2 * 1.13, .5, .03, .065, .075, (A, Q, sA, sQ) => add(wb(w, u, Y0 - A - sA / 2, .54, sA, sQ, .04 + Q - sQ / 2), K.pic));
                }
                break;
            }
            case 'rug':   // un coin se soulève et se replie sur le tapis ; il ne descend jamais sous le sol
                add(wb(w, u - .275, 0, .95, .03, 1, .65), K.rug); add(wb(w, u + .475, 0, .55, .03, .5, .65), K.rug); add(wb(w, u - .275, .03, .6, .008, .7, .8), K.rugD);
                slab(ae > 0 ? 4 : 1, 1.15, .034, ae * 2.95, .5, .03, -.015, 0, (A, Q, sA, sQ) => add(wb(w, u + .475, Math.max(.002, Q - sQ / 2), .55, sQ, sA, A - sA / 2), K.rug)); break;
            case 'door': {   // chambranle, ouverture sombre, battant sur charnière (~95°), poignée qui suit
                const hs = ob.hs, ex = -hs, hu = u + hs * .55, g = e * 1.66, ca = Math.cos(g), sa = Math.sin(g);
                add(wb(0, u - .6, 0, .1, 2.3, .1, 0), K.woodD); add(wb(0, u + .6, 0, .1, 2.3, .1, 0), K.woodD); add(wb(0, u, 2.1, 1.3, .2, .1, 0), K.woodD);
                add(wb(0, u, 0, 1.1, 2.1, .02, 0), K.dark);
                slab(a > 0 ? 6 : 1, 0, .05, g, 1.1, .06, 0, 0, (A, Q, sA, sQ) => add(wb(0, hu + ex * A, 0, sA, 2.1, sQ, Q - sQ / 2), K.door));
                add(wb(0, hu + ex * (.95 * ca - .06 * sa), .95, .08, .14, .07, .05 + .95 * sa + .06 * ca - .035), K.gold);
                add(wb(0, u, 2.34, .2, .1, .06, .04), ob.ch && ob.ch.a > .5 ? K.gr : K.rd); break;
            }
            default: {
                const d = PT[ob.kind];
                if (d) for (const q of d.pr) {
                    const m = q[7] || [0, 0, 0];
                    add(wb(w, u + q[0] + m[0] * ae, q[1] + m[1] * ae, q[2], q[3], q[4], q[5] + m[2] * ae), K[q[6]]);
                }
            }
        }
        // l’objet trouvé : visible dans son contenant, puis glisse vers le joueur (0,35 s) et disparaît
        if (ob.cont && ob.open && ob.pk < 1) {
            const k = ob.kind, key = ob.cont.t === 'key'; let P = null, hold = true;
            if (k === 'chest') { const q = wp(w, u, .3); P = [q[0], .46 + .16 * e, q[1]]; }
            else if (k === 'drawer') { const q = wp(w, u, .26 + .4 * e); P = [q[0], .62, q[1]]; }
            else if (k === 'rug') { const q = wp(w, u + .47, 1.3); P = [q[0], .014, q[1]]; }
            else { const h = ob.hit; P = [(h.a[0] + h.b[0]) / 2, Math.max(.4, (h.a[1] + h.b[1]) / 2), (h.a[2] + h.b[2]) / 2]; hold = false; }
            if (P && (ob.pk > 0 || (hold && a > 0))) {
                const f = E(ob.pk), cp = Math.cos(cam.pitch), sg = key ? -.3 : .3;
                const T = [cam.x + Math.sin(cam.yaw) * cp * .5 + Math.cos(cam.yaw) * sg, EYE + Math.sin(cam.pitch) * .5 + .2, cam.z - Math.cos(cam.yaw) * cp * .5 + Math.sin(cam.yaw) * sg];
                const z = 1 - .75 * f, sz = key ? [.1, .045, .2] : [.24, .014, .32];
                out.push({ p: [P[0] + (T[0] - P[0]) * f, P[1] + (T[1] - P[1]) * f, P[2] + (T[2] - P[2]) * f], s: [sz[0] * z, Math.max(.01, sz[1] * z), sz[2] * z], c: key ? K.keyc : K.cream, o: -1 });
            }
        }
    };
    const litO = tobj[kinds.indexOf('lit')], dk = R() < .5, dark = () => !!(dk && litO && cur() === litO), bi = S.findIndex((q) => q.c === K.bulb);
    const cubes = () => { const out = S.slice(); if (dark()) out[bi] = { p: S[bi].p, s: S[bi].s, c: K.off, o: -1 }; for (const ob of objs) if (!ob.late || cur() === ob || ob.open) model(ob, out); return out; };
    return {
        // un geste à la fois : tick n’avance que si la partie tourne (menu, carnet, pause : le geste se fige)
        setCam(p) { cam = p; },
        busy: () => objs.some((o) => o.open && (o.a < 1 || (o.cont && o.pk < 1))),
        tick(dt) {
            for (const o of objs) {
                if (o.open) { o.a = Math.min(1, o.a + dt / o.dur); if (o.cont && o.a >= o.pa && o.pk < 1) o.pk = Math.min(1, o.pk + dt / .35); }
                if (cur() === o) o.was = 1;
                if (o.kind === 'lamp') { const t = !o.open && cur() === o ? 1 : 0; if (o.lv < 0) o.lv = t; else o.lv += Math.sign(t - o.lv) * Math.min(Math.abs(t - o.lv), dt / .45); }
                if (o.dyn) o.dyn(E(o.a));
            }
        },
        n, seed, theme: T.name, RW, RD, objs, solids, quads, cubes, cur, intro, get lamp() { return dark() ? [RW / 2, 90, RD / 2] : [RW / 2, 2.6, RD / 2]; }, spawn: { x: RW / 2, z: RD - 1.4, yaw: 0, pitch: 0 },
        code, hint, meth, ref: { holders, sysL, A, B, C, i1, i2, iA, i4, iB },
    };
}

// ordre de lecture : symboles (◆ ■ / ▲ ●) ou flèche (9 → 1 : grand devant, 1 → 9 : petit devant)
const comb = (t, x, y, a, b) => {
    if (t.includes('→')) { const hi = Math.max(x, y), lo = Math.min(x, y); return t[0] === '9' ? '' + hi + lo : '' + lo + hi; }
    return t[0] === a ? '' + x + y : '' + y + x;
};

// Décode la salle comme le joueur, uniquement à partir des pages (ordre de lecture).
export function solveRoom(room) {
    const r = room.ref, D = (i) => r.holders[i].cont.d, num = (s) => +(String(s).match(/\d+/) || [-1])[0];
    const rdg = (i) => {
        const d = D(i);
        switch (r.sysL[i]) {
            case 'roman': return RO.indexOf(d.text);
            case 'count': return d.text.length;
            case 'first': return NUMW.indexOf(d.paras.map((w) => w[0]).join('').toUpperCase());
            case 'last': return NUMW.indexOf(d.text.split(' ').map((w) => w.slice(-1)).join('').toUpperCase());
            case 'bin': return parseInt(d.groups[0].join(''), 2);
            case 'lignes': { const q = d.rows.find((x) => x.ok && !x.x), rl = r.holders.slice(0, 8).flatMap((o) => o.cont.d.rules || []).find((x) => /premier|deuxi|dernier/.test(x)); if (!q || !rl) return -1; return +q.p.replace(',', '')[/premier/.test(rl) ? 0 : /deuxi/.test(rl) ? 1 : 2]; }
            case 'date': { const dt = (D(i - 1).dt || '').replace('Daté du ', ''), q = d.rows.find((x) => x.d === dt); return q ? +q.r : -1; }
            case 'braille': { const c = d.cells[0].map((v, i) => (v ? i + 1 : 0)).filter(Boolean).join(); return +Object.keys(BR).find((x) => BR[x].join() === c); }
            case 'jour': return d.rows.findIndex((x) => x.ok) + 1;
            case 'heure': return parseInt(d.text.replace('Départ ', ''), 10);
            case 'compte': return d.groups[0].filter(Boolean).length;
            default: return MO.indexOf(d.morse[0]);
        }
    };
    if (comb(D(r.iA).text, rdg(r.i1), rdg(r.i2), '◆', '■') !== r.A.lock.s) return null;
    if (comb(D(r.iB).text, rdg(3), rdg(r.i4), '▲', '●') !== r.B.lock.s) return null;
    const dd = [];
    [r.i1, r.i2, 6, 7].forEach((i) => { dd[num(D(i).name.split('n°')[1]) - 1] = rdg(i); });
    return dd.join('');
}

export function verify(room) {
    const r = room.ref, H = r.holders;
    return new Set(H).size === 9 && H.slice(0, 8).every((o) => o.cont && o.cont.t === 'doc') && H[8].cont.t === 'key' &&
        room.objs.filter((o) => o.cont && o.cont.t === 'key').length === 1 && room.cubes().length + room.quads.length <= 172 && inside(room, room.spawn.x, room.spawn.z) &&
        solveRoom(room) === room.code;
}

export function makeRoom(seed, n) {
    for (let salt = 0; salt < 200; salt++) {
        try { const r = build(seed, n, salt, {}); if (verify(r)) return r; } catch { }
    }
    throw new Error('room');
}

const hit = (rm, x, z) => {
    if (x < RAD || z < RAD || x > rm.RW - RAD || z > rm.RD - RAD) return true;
    for (const s of rm.solids) {
        if (s.vis && !s.vis()) continue;
        const cx = Math.max(s.a[0], Math.min(x, s.b[0])), cz = Math.max(s.a[2], Math.min(z, s.b[2]));
        if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < RAD * RAD) return true;
    }
    return false;
};
export function moveP(rm, p, dx, dz) {
    const st = hit(rm, p.x, p.z);
    if (st || !hit(rm, p.x + dx, p.z)) p.x += dx;
    if (st || !hit(rm, p.x, p.z + dz)) p.z += dz;
}
export const inside = (rm, x, z) => !hit(rm, x, z);

export function rayBox(ox, oy, oz, dx, dy, dz, a, b) {
    let t0 = 0, t1 = 1e9;
    const O = [ox, oy, oz], D = [dx, dy, dz];
    for (let i = 0; i < 3; i++) {
        if (Math.abs(D[i]) < 1e-9) { if (O[i] < a[i] || O[i] > b[i]) return Infinity; continue; }
        let p = (a[i] - O[i]) / D[i], q = (b[i] - O[i]) / D[i];
        if (p > q) { const t = p; p = q; q = t; }
        if (p > t0) t0 = p; if (q < t1) t1 = q;
        if (t0 > t1) return Infinity;
    }
    return t0;
}

// Un seul objet est visable : l’objet actif de la chaîne (la porte seulement avec la clé).
export function aim(rm, p, hasKey) {
    const o = rm.cur();
    if (!o || o.open || (o.kind === 'door' && !hasKey)) return null;
    const cp = Math.cos(p.pitch), fx = Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
    const t = rayBox(p.x, EYE, p.z, fx, fy, fz, o.hit.a, o.hit.b);
    if (!(t < RANGE + 1e-6)) return null;
    for (const s of rm.solids) if (s.o !== o.id && (!s.vis || s.vis()) && rayBox(p.x, EYE, p.z, fx, fy, fz, s.a, s.b) < t - .001) return null;
    return o;
}

// Observables (horloge, fenêtre) : visés, à portée, non cachés. Pas de bouton, le fait va au carnet.
export function look(rm, p) {
    const cp = Math.cos(p.pitch), fx = Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
    let best = null, bt = RANGE + 1e-6;
    for (const o of rm.objs) {
        if (!obsText(o)) continue;
        const t = rayBox(p.x, EYE, p.z, fx, fy, fz, o.hit.a, o.hit.b);
        if (!(t < bt)) continue;
        let occ = false;
        for (const s of rm.solids) if (s.o !== o.id && rayBox(p.x, EYE, p.z, fx, fy, fz, s.a, s.b) < t - .001) { occ = true; break; }
        if (!occ) { best = o; bt = t; }
    }
    return best;
}

export const obsText = (o) => (typeof o.obs === 'function' ? o.obs() : o.obs);
