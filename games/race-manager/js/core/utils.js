/** Petits utilitaires sans dépendance. */

/** Gèle récursivement un objet (les données de référence ne doivent jamais changer). */
export function deepFreeze(obj) {
  Object.values(obj).forEach((v) => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(obj);
}

/** Copie profonde modifiable (structuredClone renvoie des objets non gelés). */
export const clone = (obj) => (typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj)));

export const round2 = (n) => Math.round(n * 100) / 100;

/** Hash djb2 déterministe (sert à varier légèrement les départements selon le nom). */
export function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export function slugify(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ecurie';
}

export function newId(prefix = 'save') {
  const r = (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return `${prefix}-${r}`;
}

const nf = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 });
export const formatMoney = (millions) => `${nf.format(millions)} M€`;

export function formatPlayTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-CH', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Date de jeu « AAAA-MM-JJ » → texte long (fuseau UTC pour éviter tout décalage). */
export function formatGameDate(str) {
  const d = new Date(`${str}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(str) : d.toLocaleDateString('fr-CH', { dateStyle: 'long', timeZone: 'UTC' });
}

/** Météo de course : catégories et pneus recommandés à partir de l'eau présente. */
export function weatherCategory(mm) {
  const amount = Number(mm) || 0;
  return amount <= 1 ? 'dry' : amount <= 4 ? 'damp' : 'wet';
}
export function weatherLabel(category) {
  return { dry: 'Sec', damp: 'Humide', wet: 'Mouillée' }[category] || 'Sec';
}
export function recommendedCompound(mm) {
  return { dry: 'hard', damp: 'intermediate', wet: 'wet' }[weatherCategory(mm)];
}
export function shiftSundayToMonday(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(`${date}T12:00:00Z`);
  return d.getUTCDay() === 0 ? new Date(d.getTime() + 86400000).toISOString().slice(0, 10) : date;
}
