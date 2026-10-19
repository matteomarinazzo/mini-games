// Beatfall – menu : choix de la musique, records perso (temps / score), reprise de partie. Données : clé « beatfall ».
import { PATTERNS } from './core/patterns.js';
const KEY = 'beatfall', box = document.getElementById('cards');
const rd = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const fmt = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function render() {
  const d = rd(); box.textContent = '';
  for (const p of PATTERNS) {
    const b = d.best?.[p.id] || {}, g = d.g?.[p.id], sv = g && !g.over && g.lives > 0, u = `game.html?music=${p.id}`;
    const c = document.createElement('article'); c.className = 'card ' + p.id;
    c.innerHTML = `<h2>${p.name}</h2><span class="mood">${p.mood}</span><p>♩ ${p.bpm} BPM</p>
      <div class="recs"><div><small>Record de temps</small><b>${b.t ? fmt(b.t) : '—'}</b></div><div><small>Record de score</small><b>${b.s || '—'}</b></div></div>`
      + (sv ? `<a class="btn" href="${u}">Reprendre</a><a class="btn sec" href="${u}&new=1">Nouvelle partie</a>` : `<a class="btn" href="${u}&new=1">Nouvelle partie</a>`);
    box.appendChild(c);
  }
}
render();
addEventListener('pageshow', render);   // retour depuis le jeu : cartes à jour
