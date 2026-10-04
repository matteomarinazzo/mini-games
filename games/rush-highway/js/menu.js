// ─── MENU.JS ────────────────────────────────────────────────────────────────
// Garage : navigation entre véhicules, caractéristiques, achat et lancement.
// Données lues/écrites via store.js (clé localStorage "rush-highway").
import { VEHICLES, carSvg } from './vehicles.js';
import { loadStore, updateStore } from './store.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('fr-FR');

// Bornes utilisées pour dessiner les barres de caractéristiques
const RANGES = { v0: [60, 210], accel: [0.5, 3.5], lat: [4, 10] };

let view = 0;       // index du véhicule affiché
let msgTimer = 0;

function message(text, cls = '') {
    const el = $('msg');
    el.textContent = text;
    el.className = 'msg ' + cls;
    clearTimeout(msgTimer);
    if (text) msgTimer = setTimeout(() => { el.textContent = ''; }, 3500);
}

function statRow(label, value, unit, key) {
    const [min, max] = RANGES[key];
    const pct = Math.round(Math.min(1, Math.max(0.05, (value - min) / (max - min))) * 100);
    return `<div class="stat"><span>${label}</span><div class="stat-bar"><i style="width:${pct}%"></i></div><b>${value}${unit}</b></div>`;
}

function render() {
    const s = loadStore();
    const v = VEHICLES[view];
    const owned = s.owned.includes(v.id);
    const lock = s.locks[v.id] || 0;
    const usable = owned && !lock;

    $('coins').textContent = fmt(s.coins);
    $('best').textContent = fmt(s.best);

    // Véhicule affiché
    const car = $('carView');
    car.innerHTML = carSvg(v.color, v.kind);
    car.classList.toggle('is-locked', !usable);
    $('vehName').textContent = v.name;

    // Statut
    const st = $('vehStatus');
    if (lock) {
        st.textContent = `🔒 Bloqué par un malus : encore ${lock} partie${lock > 1 ? 's' : ''}`;
        st.className = 'veh-status locked';
    } else if (owned) {
        st.textContent = v.price === 0 ? '✔ Offert · prêt à rouler' : '✔ Possédé · prêt à rouler';
        st.className = 'veh-status ok';
    } else {
        st.textContent = `🔒 Verrouillé · ${fmt(v.price)} pièces`;
        st.className = 'veh-status locked';
    }

    // Caractéristiques + prix si verrouillé
    $('stats').innerHTML =
        statRow('Vitesse init.', v.v0, ' km/h', 'v0') +
        statRow('Accélération', v.accel, ' km/h/s', 'accel') +
        statRow('Latéral', v.lat, ' voies/s', 'lat') +
        (owned ? '' : `<div class="stat"><span>Prix</span><span></span><b style="color:var(--gold)">${fmt(v.price)} 🪙</b></div>`);

    // Miniatures
    const thumbs = $('thumbs');
    thumbs.innerHTML = '';
    VEHICLES.forEach((t, i) => {
        const tOwned = s.owned.includes(t.id);
        const tLock = s.locks[t.id];
        const b = document.createElement('button');
        b.className = 'thumb' + (i === view ? ' active' : '') + (tOwned && !tLock ? '' : ' off');
        b.setAttribute('aria-label', t.name + (tLock ? ' (bloqué)' : tOwned ? '' : ' (verrouillé)'));
        b.setAttribute('aria-pressed', String(i === view));
        b.innerHTML = carSvg(t.color, t.kind) + (tLock ? `<span class="tag">🔒${tLock}</span>` : tOwned ? '' : `<span class="tag">${fmt(t.price)}</span>`);
        b.addEventListener('click', () => go(i));
        thumbs.appendChild(b);
    });

    // Centre la miniature active dans la rangée défilante
    const act = thumbs.children[view];
    if (act) thumbs.scrollLeft = act.offsetLeft - (thumbs.clientWidth - act.offsetWidth) / 2;

    // Boutons : acheter (non possédé) ou jouer (possédé)
    const buy = $('buyBtn'), play = $('playBtn');
    buy.hidden = owned;
    play.hidden = !owned;
    buy.textContent = `ACHETER · ${fmt(v.price)} 🪙`;
    buy.disabled = s.coins < v.price;
    play.disabled = !usable;
    play.textContent = lock ? `BLOQUÉ · ${lock} PARTIE${lock > 1 ? 'S' : ''}` : 'JOUER';
}

// Navigation : un véhicule possédé et libre devient le véhicule sélectionné
function go(i) {
    view = (i + VEHICLES.length) % VEHICLES.length;
    const v = VEHICLES[view];
    updateStore((s) => {
        if (s.owned.includes(v.id) && !s.locks[v.id]) s.selected = v.id;
    });
    message('');
    render();
}

function buy() {
    const v = VEHICLES[view];
    let status = 'ok';
    // Vérifications DANS la transaction : le solde est relu juste avant d'écrire
    updateStore((s) => {
        if (s.owned.includes(v.id)) { status = 'dup'; return; }
        if (s.coins < v.price) { status = 'poor:' + (v.price - s.coins); return; }
        s.coins -= v.price;
        s.owned.push(v.id);
        s.selected = v.id;
    });
    if (status === 'ok') {
        message(`${v.name} acheté !`, 'good');
        const badge = document.querySelector('.coins-badge');
        badge.classList.add('bump');
        setTimeout(() => badge.classList.remove('bump'), 220);
    } else if (status === 'dup') {
        message('Tu possèdes déjà ce véhicule.', 'bad');
    } else {
        message(`Il te manque ${fmt(Number(status.split(':')[1]))} pièces.`, 'bad');
    }
    render();
}

function play() {
    const v = VEHICLES[view];
    const s = loadStore();
    if (!s.owned.includes(v.id)) return message('Achète ce véhicule avant de jouer.', 'bad');
    if (s.locks[v.id]) return message('Ce véhicule est bloqué. Choisis-en un autre.', 'bad');
    window.location.href = `game.html?${new URLSearchParams({ vehicle: v.id })}`;
}

$('prevBtn').addEventListener('click', () => go(view - 1));
$('nextBtn').addEventListener('click', () => go(view + 1));
$('buyBtn').addEventListener('click', buy);
$('playBtn').addEventListener('click', play);
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(view - 1);
    if (e.key === 'ArrowRight') go(view + 1);
});

// Retour via le bouton "précédent" du navigateur : on relit l'état à jour
window.addEventListener('pageshow', () => {
    const s = loadStore();
    view = Math.max(0, VEHICLES.findIndex((v) => v.id === s.selected));
    render();
});

const init = loadStore();
view = Math.max(0, VEHICLES.findIndex((v) => v.id === init.selected));
render();