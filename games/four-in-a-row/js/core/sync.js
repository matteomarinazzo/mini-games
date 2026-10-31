export const PREFIX = 'four-in-a-row_';
const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), x => AL[x % 32]).join('');
export const normCode = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const cleanName = (n, f = '') => String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, 15) || f;
