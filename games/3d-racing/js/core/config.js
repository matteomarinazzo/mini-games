// Configuration de course : listes (prêtes pour d'autres circuits / voitures), réglages mémorisés (localStorage) et config de session.
export const KEY = '3d-racing', SKEY = '3d-racing-config';
export const CIRCUITS = [{ id: 'serra-nova', name: 'Serra Nova' }, { id: 'darse', name: 'Darse' }, { id: 'col-du-vent', name: 'Col du Vent' }, { id: 'anneau-des-pins', name: 'Anneau des Pins' }, { id: 'canyon-rouge', name: 'Canyon Rouge' }, { id: 'marina', name: 'Marina' }, { id: 'vallee-verte', name: 'Vallée Verte' }, { id: 'desert-dore', name: 'Désert Doré' }, { id: 'cap-corsaire', name: 'Cap Corsaire' }, { id: 'lac-azur', name: 'Lac Azur' }, { id: 'cite-neon', name: 'Cité Néon' }, { id: 'foret-noire', name: 'Forêt Noire' }, { id: 'vieux-port', name: 'Vieux Port' }, { id: 'plateau-rouge', name: 'Plateau Rouge' }, { id: 'volcan-ardent', name: 'Volcan Ardent' }, { id: 'aerodrome', name: 'Aérodrome' }, { id: 'riviere-argent', name: 'Rivière d’Argent' }, { id: 'citadelle', name: 'Citadelle' }, { id: 'grand-col', name: 'Grand Col Alpin' }, { id: 'caldera-noire', name: 'Caldera Noire' }, { id: 'vieille-ville', name: 'Vieille Ville' }, { id: 'lacets-du-diable', name: 'Lacets du Diable' }, { id: 'carrousel', name: 'Le Carrousel' }, { id: 'ligne-180', name: 'Ligne 180' }];
export const CAR_LIST = [{ id: 'serra_gt', name: 'Sable' }, { id: 'lame', name: 'Lame' }, { id: 'orage', name: 'Orage' }, { id: 'cime', name: 'Cime' }, { id: 'tonnerre', name: 'Tonnerre' }, { id: 'vipere', name: 'Vipère' }, { id: 'titan', name: 'Titan' }, { id: 'comete', name: 'Comète' }, { id: 'spectre', name: 'Spectre' }, { id: 'nebula', name: 'Nébuleuse' }, { id: 'aigle', name: 'Aigle' }, { id: 'zephyr', name: 'Zéphyr' }, { id: 'prototype', name: 'Prototype X' }, { id: 'f1', name: 'F1 Éclair' }, { id: 'mistral', name: 'Mistral Jr' }, { id: 'foudre', name: 'Foudre F1' }, { id: 'eclat', name: 'Éclat' }, { id: 'phoenix', name: 'Phénix' }, { id: 'x2014', name: 'X2014 Concept' }, { id: 'rallye', name: 'Rallye 4×4' }, { id: 'baroudeur', name: 'Baroudeur' }, { id: 'safari', name: 'Safari' }];
export const CKEY = '3d-racing-custom';
export const loadCustom = () => { try { const a = JSON.parse(localStorage.getItem(CKEY)); return Array.isArray(a) ? a.filter((c) => c && typeof c.id === 'string') : []; } catch (e) { return []; } };
export const saveCustom = (l) => { try { localStorage.setItem(CKEY, JSON.stringify(l)); } catch (e) { /* stockage indisponible */ } };
// --- Circuits personnalisés : { id 'c-…', name, start (m), pts [[x,z]…], elev [m par point], theme }
export const TKEY = '3d-racing-tracks';
export const loadTracks = () => { try { const a = JSON.parse(localStorage.getItem(TKEY)); return Array.isArray(a) ? a.filter((t) => t && typeof t.id === 'string' && Array.isArray(t.pts) && t.pts.length >= 6) : []; } catch (e) { return []; } };
export const saveTracks = (l) => { try { localStorage.setItem(TKEY, JSON.stringify(l)); } catch (e) { /* stockage indisponible */ } };
/** Circuits intégrés + personnalisés. */
export const circuitList = () => [...CIRCUITS, ...loadTracks().map((t) => ({ id: t.id, name: String(t.name || 'Mon circuit').slice(0, 24), custom: true }))];
export const DIFFS = [['facile', 'Facile'], ['normal', 'Normal'], ['difficile', 'Difficile'], ['expert', 'Expert']];
export const DEFAULTS = { circuit: 'serra-nova', car: 'serra_gt', laps: 3, ai: 8, diff: 'normal', startPosition: 0, qualifying: false, carMode: 'mixed' };
const num = (v, a, b, d) => { v = parseInt(v, 10); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
export function sanitize(o = {}) {
  return {
    circuit: circuitList().some((c) => c.id === o.circuit) ? o.circuit : DEFAULTS.circuit,
    car: CAR_LIST.some((c) => c.id === o.car) || loadCustom().some((c) => c.id === o.car) ? o.car : DEFAULTS.car,
    laps: num(o.laps, 1, 20, DEFAULTS.laps), ai: num(o.ai, 0, 19, DEFAULTS.ai),
    diff: DIFFS.some((d) => d[0] === o.diff) ? o.diff : DEFAULTS.diff,
    startPosition: num(o.startPosition, 0, 20, DEFAULTS.startPosition),
    qualifying: o.qualifying === true, mode: o.mode === 'clm' ? 'clm' : 'solo',
    carMode: o.carMode === 'same' ? 'same' : 'mixed',
    gridOrder: Array.isArray(o.gridOrder) ? o.gridOrder.filter((n) => Number.isInteger(n) && n >= 1 && n <= 20).slice(0, 20) : null,
  };
}
const rd = () => { try { const o = JSON.parse(localStorage.getItem(KEY)); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
const wr = (o) => { try { localStorage.setItem(KEY, JSON.stringify({ ...rd(), ...o })); } catch (e) { /* stockage indisponible */ } };
export function loadSaved() { const o = rd(); return sanitize(o.cfg || o); }
export function saveSaved(c) { wr({ cfg: c }); }
/** Aides (pause > Paramètres) : ligne idéale, points de freinage, minimap. */
export function loadSet() { const s = rd().set || {}; return { line: s.line === true, brake: s.brake === true, map: s.map !== false, penalties: s.penalties !== false, view: ['rear', 'close', 'cockpit', 'front'].includes(s.view) ? s.view : 'rear' }; }
export function saveSet(s) { wr({ set: { line: !!s.line, brake: !!s.brake, map: !!s.map, penalties: s.penalties !== false, view: ['rear', 'close', 'cockpit', 'front'].includes(s.view) ? s.view : 'rear' } }); }
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
export function queryConfig() { const q = new URLSearchParams(location.search); return sanitize({ circuit: q.get('circuit'), car: q.get('car'), ai: q.get('ai'), diff: q.get('diff'), laps: q.get('laps'), startPosition: q.get('startPosition'), qualifying: q.get('qualifying') === 'true', carMode: q.get('carMode'), mode: q.get('mode') }); }
/** Contre la montre : meilleur tour par circuit ET par voiture { circuit: { voiture: secondes } }. Renvoie true si record battu. */
export const loadClm = () => rd().clm || {};
export function saveClm(circuit, car, lap) {
  if (!Number.isFinite(lap) || lap <= 0) return false;
  const all = loadClm(), c = all[circuit] || {};
  if (c[car] !== undefined && c[car] <= lap) return false;
  wr({ clm: { ...all, [circuit]: { ...c, [car]: lap } } }); return true;
}
