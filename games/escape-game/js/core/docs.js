// Escape Game · visualiseur : pages de documents (DOM pur, aucun texte de résolution)
const h = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

export function renderDoc(el, d, foot) {
    el.textContent = '';
    const pg = h('div', 'paper p-' + d.type); el.appendChild(pg);
    pg.appendChild(h('h3', 'p-title', d.name));
    const arrow = () => { if (d.arrow) pg.appendChild(h('div', 'p-arrow', d.arrow)); };
    const lamp = (on) => h('i', 'lamp' + (on ? ' on' : ''));
    switch (d.type) {
        case 'ticket': {
            arrow();
            if (d.date) pg.appendChild(h('p', 'p-text', d.date));
            d.rows.forEach((r) => {
                const row = h('div', 't-row');
                row.append(h('span', 't-n', r.t), h('span', 't-p' + (r.x ? ' struck' : ''), r.p), h('span', 't-c', r.ok ? '✓' : ''));
                pg.appendChild(row);
            });
            const t = h('div', 't-row t-tot'); t.append(h('span', 't-n', 'TOTAL'), h('span', 't-p', d.total), h('span', 't-c', '')); pg.appendChild(t);
            break;
        }
        case 'calendrier': {
            arrow();
            d.rows.forEach((r) => { const row = h('div', 'c-row'); row.append(h('span', 'c-d', r.d), h('span', 'c-r' + (r.x ? ' struck' : ''), r.r), h('span', 't-c', r.ok ? '✓' : '')); pg.appendChild(row); });
            break;
        }
        case 'lampes': {
            arrow();
            const w = h('div', d.mode === 'bin' ? 'l-row' : 'l-col');
            d.groups.forEach((g) => { const gr = h('div', 'l-g'); g.forEach((v) => gr.appendChild(lamp(v))); w.appendChild(gr); });
            pg.appendChild(w);
            break;
        }
        case 'points': {
            arrow();
            const w = h('div', d.vert ? 'l-col' : 'l-row');
            d.cells.forEach((c) => { const cell = h('div', 'br-cell'); [0, 3, 1, 4, 2, 5].forEach((i) => cell.appendChild(h('i', 'dot' + (c[i] ? ' on' : '')))); w.appendChild(cell); });
            pg.appendChild(w);
            break;
        }
        case 'carte': {
            pg.appendChild(h('p', 'p-text', d.text));
            if (d.morse) { arrow(); const w = h('div', 'm-wrap'); d.morse.forEach((m) => w.appendChild(h('span', 'm-g', m))); pg.appendChild(w); }
            break;
        }
        case 'enveloppe': pg.appendChild(h('div', 'env-box', d.text || '(vide)')); break;
        case 'journal': d.paras.forEach((t) => pg.appendChild(h('p', 'p-text', t))); break;
        case 'croquis': {
            const NS = 'http://www.w3.org/2000/svg', sv = document.createElementNS(NS, 'svg');
            sv.setAttribute('viewBox', '0 0 100 70'); sv.setAttribute('class', 'sketch');
            d.shapes.forEach((q) => { const r = document.createElementNS(NS, 'rect'); r.setAttribute('x', q.x); r.setAttribute('y', q.y); r.setAttribute('width', q.w); r.setAttribute('height', q.h); sv.appendChild(r); });
            pg.appendChild(sv);
            break;
        }
    }
    (d.rules || []).forEach((t) => pg.appendChild(h('p', 'p-voice', t)));
    if (d.dt) pg.appendChild(h('p', 'p-text', d.dt));
    if (d.time) pg.appendChild(h('p', 'p-text', d.time));
    if (d.voice) pg.appendChild(h('p', 'p-voice', d.voice));
    if (d.note) pg.appendChild(h('p', 'p-note', d.note));
    if (foot) pg.appendChild(h('p', 'p-foot', foot));
}
