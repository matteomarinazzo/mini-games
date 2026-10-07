// MONDES : un monde = une page du menu (flèches ‹ › pour changer de monde).
//   levels   : nombre de niveaux du monde (fichiers levelN.js, numérotés à la suite : monde 1 = 1..20, monde 2 = 21..40, etc.)
//   released : false = tout est bloqué + « Coming soon » ; true = le 1er niveau se débloque quand le monde précédent est fini
// Pour ajouter un monde : une ligne ici + ses fichiers levelN.js. Rien d'autre à modifier.
const CONFIG = [
    { id: 'world1', name: 'Monde 1', levels: 20, released: true },
    { id: 'world2', name: 'Monde 2', levels: 20, released: false },
];

let n = 1;
export const WORLDS = CONFIG.map(w => { const r = { ...w, first: n, last: n + w.levels - 1 }; n += w.levels; return r; });
export const COUNT = n - 1;                                           // nombre total de niveaux (tous mondes)
export const worldOf = lvl => WORLDS.findIndex(w => lvl >= w.first && lvl <= w.last); // index du monde d'un niveau (-1 si inconnu)
