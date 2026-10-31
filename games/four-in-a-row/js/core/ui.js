export function scoreEl(a, b) {
  const s = document.createElement('span'); s.className = 'sc';
  const k = (x, y) => { const e = document.createElement('b'); e.className = x > y ? 'g' : x < y ? 'r' : 'k'; e.textContent = x; return e; };
  s.append(k(a, b), ' - ', k(b, a)); return s;
}
