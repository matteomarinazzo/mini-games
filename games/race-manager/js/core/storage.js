/**
 * Stockage : localStorage protégé (un slot = une clé), paramètres, export/import JSON.
 *
 * Clés :  miniGames.race-manager.saves.slot1 … slot3   (une clé par slot : un slot corrompu
 *         ou d'une version inconnue n'affecte jamais les autres)
 *         miniGames.race-manager.settings
 */
import { STORAGE_PREFIX, SLOT_COUNT, MAX_IMPORT_BYTES, GAME_TITLE } from './constants.js';
import { validateSave } from './validation.js';
import { migrateSave } from './game-state.js';
import { slugify } from './utils.js';

const slotKey = (n) => `${STORAGE_PREFIX}.saves.slot${n}`;
const SETTINGS_KEY = `${STORAGE_PREFIX}.settings`;
const isSlot = (n) => Number.isInteger(n) && n >= 1 && n <= SLOT_COUNT;

export function isStorageAvailable() {
  try {
    const k = `${STORAGE_PREFIX}.probe`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lit un slot. Ne modifie jamais rien.
 * @returns {{status:'empty'}|{status:'ok',save:object}|{status:'invalid',errors:string[]}|{status:'unavailable',errors:string[]}}
 */
export function readSlot(n) {
  if (!isSlot(n)) return { status: 'invalid', errors: ['Emplacement inconnu.'] };
  let raw;
  try {
    raw = localStorage.getItem(slotKey(n));
  } catch {
    return { status: 'unavailable', errors: ['Le stockage du navigateur est indisponible (navigation privée ou stockage bloqué).'] };
  }
  if (raw === null) return { status: 'empty' };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: 'invalid', errors: ['Les données de ce slot sont illisibles (JSON corrompu).'] };
  }
  data = migrateSave(data);
  const check = validateSave(data);
  if (!check.ok) return { status: 'invalid', errors: check.errors };
  return { status: 'ok', save: data };
}

/** Écrit un slot après validation. @returns {{ok:boolean,error?:string}} */
export function writeSlot(n, save) {
  if (!isSlot(n)) return { ok: false, error: 'Emplacement inconnu.' };
  save.slotId = n;
  const check = validateSave(save);
  if (!check.ok) return { ok: false, error: `Sauvegarde refusée : ${check.errors[0]}` };
  try {
    localStorage.setItem(slotKey(n), JSON.stringify(save));
    return { ok: true };
  } catch (e) {
    const full = e && (e.name === 'QuotaExceededError' || e.code === 22);
    return {
      ok: false, error: full
        ? 'Espace de stockage du navigateur plein. Exportez votre partie en JSON puis libérez de la place.'
        : 'Impossible d’enregistrer : le stockage du navigateur est indisponible.'
    };
  }
}

export function deleteSlot(n) {
  if (!isSlot(n)) return { ok: false, error: 'Emplacement inconnu.' };
  try {
    localStorage.removeItem(slotKey(n));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Suppression impossible : stockage indisponible.' };
  }
}

// ---- Paramètres (petit objet séparé des sauvegardes)
export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
  } catch {
    return {};
  }
}
export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
export const setLastSlot = (n) => saveSettings({ ...loadSettings(), lastSlotId: n });
export const getLastSlot = () => loadSettings().lastSlotId ?? null;

// ---- Export / import JSON
export function exportFileName(save) {
  const team = save.teams.find((t) => t.id === save.playerTeamId);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${slugify(GAME_TITLE)}-${slugify(team.name)}-slot${save.slotId}-${day}.json`;
}

/** Déclenche un téléchargement côté navigateur (un site statique ne peut rien écrire sur le serveur). */
export function downloadSave(save) {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName(save);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Lit et valide un fichier importé, sans rien écrire. */
export async function parseImportFile(file) {
  if (!file) return { ok: false, errors: ['Aucun fichier sélectionné.'] };
  if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
    return { ok: false, errors: ['Le fichier doit être au format JSON (.json).'] };
  }
  if (file.size === 0) return { ok: false, errors: ['Le fichier est vide.'] };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, errors: ['Le fichier est trop volumineux pour être une sauvegarde de ce jeu.'] };
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { ok: false, errors: ['Le fichier n’est pas un JSON valide.'] };
  }
  data = migrateSave(data);
  const check = validateSave(data);
  return check.ok ? { ok: true, save: data } : { ok: false, errors: check.errors };
}
