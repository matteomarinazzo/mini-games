// Configuration de course : listes (prêtes pour d'autres circuits / voitures), réglages mémorisés (localStorage) et config de session.
export const KEY = 'little-turismo', SKEY = 'little-turismo-config';
export const CIRCUIT_CATS = [['temperate', 'Tempéré'], ['forest', 'Forêt'], ['snow', 'Neige & montagne'], ['desert', 'Désert'], ['tropical', 'Tropical'], ['autumn', 'Automne'], ['volcano', 'Volcan'], ['dusk', 'Crépuscule']];
export const CIRCUITS = [{ id: 'serra-nova', name: 'Serra Nova', cat: 'temperate' }, { id: 'darse', name: 'Darse', cat: 'temperate' }, { id: 'aerodrome', name: 'Aérodrome', cat: 'temperate' }, { id: 'parc-royal', name: 'Parc Royal', cat: 'temperate' }, { id: 'valmont-gp', name: 'Valmont', cat: 'forest' }, { id: 'sous-bois', name: 'Sous-Bois', cat: 'forest' }, { id: 'ravin-cedres', name: 'Ravin des Cèdres', cat: 'forest' }, { id: 'enfer-vert', name: 'Enfer Vert', cat: 'forest' }, { id: 'grand-col', name: 'Grand Col Alpin', cat: 'snow' }, { id: 'piste-boreale', name: 'Piste Boréale', cat: 'snow' }, { id: 'glacier-bleu', name: 'Glacier Bleu', cat: 'snow' }, { id: 'station-blanche', name: 'Station Blanche', cat: 'snow' }, { id: 'ligne-180', name: 'Ligne 180', cat: 'desert' }, { id: 'mesa-ardente', name: 'Mesa Ardente', cat: 'desert' }, { id: 'piste-dunes', name: 'Piste des Dunes', cat: 'desert' }, { id: 'canyon-rouge', name: 'Canyon Rouge', cat: 'desert' }, { id: 'vieux-port', name: 'Vieux Port', cat: 'tropical' }, { id: 'baie-palmes', name: 'Baie des Palmes', cat: 'tropical' }, { id: 'ile-corail', name: 'Île Corail', cat: 'tropical' }, { id: 'lagon-bleu', name: 'Lagon Bleu', cat: 'tropical' }, { id: 'vendanges', name: 'Vendanges', cat: 'autumn' }, { id: 'route-cretes', name: 'Route des Crêtes', cat: 'autumn' }, { id: 'moulin-or', name: 'Moulin d’Or', cat: 'autumn' }, { id: 'hameau-dore', name: 'Hameau Doré', cat: 'autumn' }, { id: 'cratere-sud', name: 'Cratère Sud', cat: 'volcano' }, { id: 'coulee-lave', name: 'Coulée de Lave', cat: 'volcano' }, { id: 'basalte', name: 'Basalte', cat: 'volcano' }, { id: 'forge-noire', name: 'Forge Noire', cat: 'volcano' }, { id: 'neon-nocturne', name: 'Néon Nocturne', cat: 'dusk' }, { id: 'corniche-pourpre', name: 'Corniche Pourpre', cat: 'dusk' }, { id: 'tour-ombre', name: 'Tour d’Ombre', cat: 'dusk' }, { id: 'port-minuit', name: 'Port de Minuit', cat: 'dusk' }];
export const CAR_LIST = [{ id: 'serra_gt', name: 'Sable' }, { id: 'tempete', name: 'Tempête' }, { id: 'aurore', name: 'Aurore' }, { id: 'gerfaut', name: 'Gerfaut' }, { id: 'spectre', name: 'Spectre' }, { id: 'nebula', name: 'Nébuleuse' }, { id: 'pulsar', name: 'Pulsar' }, { id: 'mirage', name: 'Mirage' }, { id: 'sentinelle', name: 'Sentinelle' }, { id: 'orion', name: 'Orion' }, { id: 'tornade', name: 'Tornade' }, { id: 'lynx', name: 'Lynx' }, { id: 'rallye', name: 'Rallye 4×4' }, { id: 'maquis', name: 'Maquis' }, { id: 'scarabee', name: 'Scarabée' }, { id: 'sierra', name: 'Sierra' }, { id: 'f1', name: 'F1 Éclair' }, { id: 'mistral', name: 'Mistral Jr' }, { id: 'x2014', name: 'X2014 Concept' }, { id: 'libellule', name: 'Libellule' }, { id: 'top_fuel', name: 'Top Fuel Drag' }, { id: 'thrust_ssc', name: 'ThrustSSC' }];
export const CKEY = 'little-turismo-custom';
export const loadCustom = () => { try { const a = JSON.parse(localStorage.getItem(CKEY)); return Array.isArray(a) ? a.filter((c) => c && typeof c.id === 'string') : []; } catch (e) { return []; } };
export const saveCustom = (l) => { try { localStorage.setItem(CKEY, JSON.stringify(l)); } catch (e) { /* stockage indisponible */ } };
// --- Circuits personnalisés : { id 'c-…', name, start (m), pts [[x,z]…], elev [m par point], theme }
export const TKEY = 'little-turismo-tracks';
export const loadTracks = () => { try { const a = JSON.parse(localStorage.getItem(TKEY)); return Array.isArray(a) ? a.filter((t) => t && typeof t.id === 'string' && Array.isArray(t.pts) && t.pts.length >= 6) : []; } catch (e) { return []; } };
export const saveTracks = (l) => { try { localStorage.setItem(TKEY, JSON.stringify(l)); } catch (e) { /* stockage indisponible */ } };
// --- Assets multijoueur temporaires (voitures/circuits des adversaires) : JAMAIS affichés dans "Mes Créations".
export const MP_CKEY = 'little-turismo-mp-cars';
export const MP_TKEY = 'little-turismo-mp-tracks';
export const loadMpCars = () => { try { const a = JSON.parse(localStorage.getItem(MP_CKEY)); return Array.isArray(a) ? a.filter((c) => c && typeof c.id === 'string') : []; } catch { return []; } };
export const saveMpCars = (l) => { try { localStorage.setItem(MP_CKEY, JSON.stringify(l)); } catch { /* stockage indisponible */ } };
export const loadMpTracks = () => { try { const a = JSON.parse(localStorage.getItem(MP_TKEY)); return Array.isArray(a) ? a.filter((t) => t && typeof t.id === 'string' && Array.isArray(t.pts) && t.pts.length >= 6) : []; } catch { return []; } };
export const saveMpTracks = (l) => { try { localStorage.setItem(MP_TKEY, JSON.stringify(l)); } catch { /* stockage indisponible */ } };
// --- Migration automatique : retire les assets MP (mpc_/mpt_) qui se sont glissés dans les listes perso par l'ancien bug.
try {
  const rawC = JSON.parse(localStorage.getItem(CKEY)); if (Array.isArray(rawC) && rawC.some(c => c?.id?.startsWith('mpc_'))) { const mp = rawC.filter(c => c?.id?.startsWith('mpc_')), own = rawC.filter(c => !c?.id?.startsWith('mpc_')); localStorage.setItem(CKEY, JSON.stringify(own)); const existing = JSON.parse(localStorage.getItem(MP_CKEY)) || []; const ids = new Set(existing.map(x => x?.id)); localStorage.setItem(MP_CKEY, JSON.stringify([...existing, ...mp.filter(c => !ids.has(c.id))])); }
} catch { /* migration au mieux */ }
try {
  const rawT = JSON.parse(localStorage.getItem(TKEY)); if (Array.isArray(rawT) && rawT.some(t => t?.id?.startsWith('mpt_'))) { const mp = rawT.filter(t => t?.id?.startsWith('mpt_')), own = rawT.filter(t => !t?.id?.startsWith('mpt_')); localStorage.setItem(TKEY, JSON.stringify(own)); const existing = JSON.parse(localStorage.getItem(MP_TKEY)) || []; const ids = new Set(existing.map(x => x?.id)); localStorage.setItem(MP_TKEY, JSON.stringify([...existing, ...mp.filter(t => !ids.has(t.id))])); }
} catch { /* migration au mieux */ }
/** Circuits intégrés + personnalisés + MP temporaires (pour que sanitize() accepte les IDs multi). */
export const circuitList = () => { let pub = []; try { const t = JSON.parse(sessionStorage.getItem('little-turismo-pub-track')); if (t && typeof t.id === 'string' && t.id.startsWith('pubtrack_')) pub = [{ id: t.id, name: t.name, custom: true }]; } catch { } return [...CIRCUITS, ...loadTracks().map((t) => ({ id: t.id, name: String(t.name || 'Mon circuit').slice(0, 24), custom: true })), ...loadMpTracks().map((t) => ({ id: t.id, name: String(t.name || 'Circuit multi').slice(0, 24), custom: true, mp: true })), ...pub]; };
export const DIFFS = [['facile', 'Facile'], ['normal', 'Normal'], ['difficile', 'Difficile'], ['expert', 'Expert']];
export const WEATHERS = [['dry', '☀️ Sec (sans pluie)'], ['light_rain', '🌦️ Pluie légère'], ['heavy_rain', '🌧️ Forte pluie'], ['random', '🎲 Aléatoire']];
export const DEFAULTS = { circuit: 'serra-nova', car: 'serra_gt', laps: 3, ai: 8, diff: 'normal', startPosition: 0, qualifying: false, carMode: 'mixed', damage: true, weather: 'dry' };
const num = (v, a, b, d) => { v = parseInt(v, 10); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
export function sanitize(o = {}) {
  return {
    circuit: circuitList().some((c) => c.id === o.circuit) ? o.circuit : DEFAULTS.circuit,
    car: CAR_LIST.some((c) => c.id === o.car) || loadCustom().some((c) => c.id === o.car) || loadMpCars().some((c) => c.id === o.car) || (o.car && String(o.car).startsWith('pubcar_') && (() => { try { return JSON.parse(sessionStorage.getItem('little-turismo-pub-car'))?.id === o.car; } catch { return false; } })()) ? o.car : DEFAULTS.car,
    laps: num(o.laps, 1, 20, DEFAULTS.laps), ai: num(o.ai, 0, 19, DEFAULTS.ai),
    diff: DIFFS.some((d) => d[0] === o.diff) ? o.diff : DEFAULTS.diff,
    weather: WEATHERS.some((w) => w[0] === o.weather) ? o.weather : DEFAULTS.weather,
    startPosition: num(o.startPosition, 0, 20, DEFAULTS.startPosition),
    qualifying: o.qualifying === true, mode: o.mode === 'clm' ? 'clm' : 'solo',
    carMode: o.carMode === 'same' ? 'same' : 'mixed',
    damage: o.damage !== false,
    gridOrder: Array.isArray(o.gridOrder) ? o.gridOrder.filter((n) => Number.isInteger(n) && n >= 1 && n <= 20).slice(0, 20) : null,
  };
}
const rd = () => { try { const o = JSON.parse(localStorage.getItem(KEY)); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
const wr = (o) => { try { localStorage.setItem(KEY, JSON.stringify({ ...rd(), ...o })); } catch (e) { /* stockage indisponible */ } };
export function loadSaved() { const o = rd(); return sanitize(o.cfg || o); }
export function saveSaved(c) { wr({ cfg: c }); }
/** Aides (pause > Paramètres) : ligne idéale, points de freinage, minimap. */
export function loadSet() { const s = rd().set || {}; return { line: s.line === true, brake: s.brake === true, map: s.map !== false, radar: s.radar !== false, penalties: s.penalties !== false, damage: s.damage !== false, view: ['rear', 'close', 'cockpit', 'front'].includes(s.view) ? s.view : 'rear' }; }
export function saveSet(s) { wr({ set: { line: !!s.line, brake: !!s.brake, map: !!s.map, radar: s.radar !== false, penalties: s.penalties !== false, damage: s.damage !== false, view: ['rear', 'close', 'cockpit', 'front'].includes(s.view) ? s.view : 'rear' } }); }
/** Records par circuit (Serra Nova garde l'ancienne clé `rec`, les autres sont dans `recs`) : { lap: secondes | null, place: rang d'arrivée | null }. */
export function loadRec(id = DEFAULTS.circuit) {
  const o = rd(), r = (id === DEFAULTS.circuit ? o.rec : (o.recs || {})[id]) || {};
  return { lap: Number.isFinite(r.lap) && r.lap > 0 ? r.lap : null, place: Number.isInteger(r.place) && r.place > 0 ? r.place : null };
}
/** Enregistre si meilleur (null = ignoré). Renvoie { lap, place } = true si record battu. */
export function saveRec(lap, place, id = DEFAULTS.circuit) {
  const o = rd(), r = loadRec(id), n = { lap: false, place: false };
  if (lap != null && Number.isFinite(lap) && (r.lap === null || lap < r.lap)) { r.lap = lap; n.lap = true; }
  if (place && (r.place === null || place < r.place)) { r.place = place; n.place = true; }
  if (n.lap || n.place) wr(id === DEFAULTS.circuit ? { rec: r } : { recs: { ...o.recs, [id]: r } });
  return n;
}
export function startSession(c) { try { localStorage.setItem(SKEY, JSON.stringify(c)); } catch (e) { /* stockage indisponible */ } }
export function sessionConfig() { try { const s = localStorage.getItem(SKEY) || sessionStorage.getItem(SKEY); return s ? sanitize(JSON.parse(s)) : null; } catch (e) { return null; } }
/** Test sans menu : ?circuit= &car= &ai=0..19 &diff= &laps= (utilisé seulement si aucune config de session). */
export function queryConfig() { const q = new URLSearchParams(location.search); return sanitize({ circuit: q.get('circuit'), car: q.get('car'), ai: q.get('ai'), diff: q.get('diff'), laps: q.get('laps'), startPosition: q.get('startPosition'), qualifying: q.get('qualifying') === 'true', carMode: q.get('carMode'), mode: q.get('mode'), weather: q.get('weather') }); }
/** Contre la montre : meilleur tour par circuit ET par voiture { circuit: { voiture: secondes } }. Renvoie true si record battu. */
export const loadClm = () => rd().clm || {};
export function saveClm(circuit, car, lap) {
  if (!Number.isFinite(lap) || lap <= 0) return false;
  const all = loadClm(), c = all[circuit] || {};
  if (c[car] !== undefined && c[car] <= lap) return false;
  wr({ clm: { ...all, [circuit]: { ...c, [car]: lap } } }); return true;
}

