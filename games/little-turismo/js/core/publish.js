// Publication Firebase des créations locales (aucune fusion avec les listes locales).
import * as Net from '../net.js';
const BASE = 'game_data/little_turismo', TTL = 300000, PAGE = 20, RATE = 60000, MAX = 24;
const paths = k => [`${BASE}/${k === 'track' ? 'tracks' : 'cars'}/idx`, `${BASE}/${k === 'track' ? 'tracks' : 'cars'}/data`];
const ck = k => `lt-pub-${k}-cache-v2`, ik = (k, id) => `lt-pub-${k}-item-v2-${id}`;
const authUid = () => Net.N.cfg?.auth?.currentUser?.uid || null;
const round = (v, n = 2) => Number.isFinite(v) ? Math.round(v * 10 ** n) / 10 ** n : v;
function compact(k, d) { if (k === 'track') return { i: d.id, n: d.name, s: round(d.start), p: (d.pts || []).map(p => [round(p[0]), round(p[1])]), e: (d.elev || []).map(v => round(v)), h: d.theme, c: (d.corners || []).map(x => ({ t: x.type, r: round(x.radius) })) }; const o = { i: d.id, n: d.name, k: d.kind, c: d.color, a: d.accent }; for (const x of ['vmax', 'ch', 'mass', 'grip', 'aero', 'bal']) o[x] = round(Number(d[x]), 3); return o }
function expand(k, d) { if (k === 'track') return { id: d.i, name: d.n, start: d.s, pts: d.p, elev: d.e, theme: d.h, corners: (d.c || []).map(x => ({ type: x.t, radius: x.r })) }; return { id: d.i, name: d.n, kind: d.k, color: d.c, accent: d.a, vmax: d.vmax, ch: d.ch, mass: d.mass, grip: d.grip, aero: d.aero, bal: d.bal } }
const cacheRead = k => { try { const c = JSON.parse(localStorage.getItem(ck(k))); return c && Date.now() - c.t < TTL ? c.v : null } catch { return null } };
const cacheWrite = (k, v) => { try { localStorage.setItem(ck(k), JSON.stringify({ t: Date.now(), v })) } catch { } };
async function ensure() { if (!await Net.publicationReady()) throw Error('Connexion Firebase requise'); const u = authUid(); if (!u || Net.N.uid !== u) throw Error('Session Firebase incohérente : reconnectez-vous'); return u }
const read = Net.publicationRead;
const digest = async s => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).slice(0, 10).map(x => x.toString(16).padStart(2, '0')).join('') };
const getDisplayName = () => { try { return localStorage.getItem('mg_display_name') || localStorage.getItem('mg_player_name') || ''; } catch { return ''; } };

export async function publishItem(kind, d, enabled = true) {
  if (!d?.id) throw Error('Création locale invalide');
  const uid = await ensure();
  if (!enabled) return unpublishItem(kind, d.pubId);
  const [idx, data] = paths(kind);
  const id = d.pubId || await digest(`${uid}:${kind}:${d.id}`);
  if (!/^[a-f0-9]{20}$/.test(id)) throw Error('Identifiant de publication invalide');
  const old = await read(`${data}/${id}`);
  if (old && old.u !== uid) throw Error('Cet identifiant appartient à un autre auteur');
  const usr = await read(`${BASE}/users/${uid}`) || {};
  let ids = typeof usr.ids === 'string' ? usr.ids.split(',').filter(Boolean) : [];
  if (!old && ids.length >= MAX) {
    const checks = await Promise.all(ids.map(async id_ => {
      const exist = await read(`${BASE}/cars/data/${id_}`) || await read(`${BASE}/tracks/data/${id_}`);
      return exist ? id_ : null;
    }));
    ids = checks.filter(Boolean);
    if (ids.length >= MAX) throw Error('Maximum de 24 publications atteint');
  }
  if (Net.now() - (usr.l || 0) < RATE) throw Error('1 publication maximum par minute');
  const packed = compact(kind, { ...d, id }), json = JSON.stringify(packed);
  if (json.length > 19000) throw Error(`Publication trop volumineuse (${json.length} caractères, maximum 19000)`);
  const name = String(d.name || 'Création').slice(0, 32);
  const author = String(getDisplayName() || Net.N.cfg?.auth?.currentUser?.displayName || 'Pilote').slice(0, 24);
  const now = Net.now();
  const prev = await read(`${idx}/${id}`);
  if (prev && prev.a !== uid) throw Error('Index de publication détenu par un autre auteur');
  const next = old ? ids : [...new Set([...ids, id])];
  if (!old && next.length > MAX) throw Error('Maximum de 24 publications atteint');
  const updates = {};
  updates[`${data}/${id}`] = { d: json, u: uid, n: author, t: now };
  updates[`${idx}/${id}`] = { n: name, a: uid, an: author, t: now };
  updates[`${BASE}/users/${uid}`] = { l: now, ids: next.join(',') };
  await Net.publicationUpdate(updates);
  d.pubId = id;
  d.pubOwner = uid;
  d.published = true;
  invalidate(kind);
  try {
    localStorage.setItem(ik(kind, id), JSON.stringify({ t: Date.now(), v: { ...expand(kind, packed), author, uid, pubId: id, pubOwner: uid, published: true } }));
  } catch { }
  return true;
}

function invalidate(k) {
  cacheWrite(k, null);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`lt-pub-${k}-item-v2-`)) localStorage.removeItem(key);
    }
  } catch { }
}

export async function listPublished(kind, { before = null, reset = false } = {}) {
  const c = cacheRead(kind);
  if (!reset && c && before == null) return c.items;
  if (!await Net.publicationReady()) return c?.items || [];
  const [idx] = paths(kind), all = await read(idx) || {};
  let vals = Object.entries(all).filter(([, x]) => x && typeof x.a === 'string' && typeof x.n === 'string').map(([id, x]) => ({ id, name: x.n, author: x.an || 'Pilote', uid: x.a, t: x.t || 0 })).sort((a, b) => b.t - a.t || a.id.localeCompare(b.id));
  if (before) {
    const n = vals.findIndex(x => x.id === before);
    if (n >= 0) vals = vals.slice(n + 1);
  }
  const items = vals.slice(0, PAGE);
  if (!before) cacheWrite(kind, { items });
  return items;
}

export const loadPublishedTrack = id => loadOne('track', id);
export const loadPublishedCar = id => loadOne('car', id);

async function loadOne(k, id) {
  try {
    const c = JSON.parse(localStorage.getItem(ik(k, id)));
    if (c && Date.now() - c.t < TTL) return { ...c.v };
  } catch { }
  if (!await Net.publicationReady()) return null;
  const [, data] = paths(k), v = await read(`${data}/${id}`);
  if (!v?.d || typeof v.d !== 'string' || v.d.length > 19000) return null;
  let p;
  try { p = JSON.parse(v.d); } catch { return null; }
  const out = { ...expand(k, p), author: v.n || 'Pilote', uid: v.u, published: true, pubId: id, pubOwner: v.u };
  try { localStorage.setItem(ik(k, id), JSON.stringify({ t: Date.now(), v: out })); } catch { }
  return out;
}

export async function unpublishItem(kind, id) {
  if (!id) throw Error('Publication introuvable');
  const uid = await ensure(), [idx, data] = paths(kind), own = await read(`${data}/${id}`);
  if (!own || own.u !== uid) throw Error('Seul l’auteur peut dépublier cet élément');
  const index = await read(`${idx}/${id}`);
  if (index && index.a !== uid) throw Error('Index détenu par un autre auteur');
  const u = {};
  u[`${data}/${id}`] = null;
  u[`${idx}/${id}`] = null;
  await Net.publicationUpdate(u);
  try { localStorage.removeItem(ik(kind, id)); } catch { }
  invalidate(kind);
  return true;
}
