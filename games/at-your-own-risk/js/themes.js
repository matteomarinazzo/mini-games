// [NEW] Palettes par monde. Source unique : menu + jeu. Monde 1 = couleurs d'origine.
// portal = couleurs du portail [[origine, thème]...] (null = SVG d'origine). Origine : contour #1a1208, dégradé #fff6dc / #ffc864 / #e07a00.
// c = jetons utilisables dans les niveaux (c:'room', bg:'bg'...). spike:null = images SVG d'origine ; sinon piques dessinés en canvas {d: foncé, l: clair}.
const mk = (bg, room, spike, portal = null) => ({ bg, room, done: '#8fd18f', flash: bg, spike, portal, c: { bg, room, dark: bg, light: room } });
export const THEMES = [
    mk('#996b07', '#feb854', null),
    mk('#6b1038', '#f9a8c9', { d: '#6b1038', l: '#f9a8c9' }, [['#1a1208', '#2a0816'], ['#fff6dc', '#fff0f6'], ['#ffc864', '#f9a8c9'], ['#e07a00', '#c2477c']])
];
export const themeOf = wi => THEMES[wi] || THEMES[0];
export function applyTheme(wi) {
    const T = themeOf(wi), r = document.documentElement;
    r.style.setProperty('--bg', T.bg);
    r.style.setProperty('--accent', T.room);
    r.style.setProperty('--done', T.done);
    r.dataset.world = document.body.dataset.world = wi + 1;
    return T;
}