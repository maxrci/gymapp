// Körperkarte (vorne/hinten): Muskelgruppen eingefärbt nach Wert

import { esc, num } from './utils.js';

const L = (cx, cy, rx, ry, rot = 0) => ({ cx, cy, rx, ry, rot });
const mirror = (s) => ({ ...s, cx: 100 - s.cx, rot: -s.rot });
const pair = (s) => [s, mirror(s)];

const FRONT = {
  Schultern: pair(L(30, 42, 7.5, 7)),
  Brust: pair(L(41.5, 47, 9, 7)),
  Bizeps: pair(L(24.5, 59, 4.6, 9, 8)),
  Unterarme: pair(L(20, 81, 4.2, 10, 10)),
  Bauch: [{ rect: [43, 56, 14, 28, 5] }, ...pair(L(37.5, 68, 3.4, 9))],
  Abduktoren: pair(L(33, 93, 4, 6.5)),
  Quadrizeps: pair(L(41, 116, 7, 18)),
  Adduktoren: pair(L(47.6, 104, 2.6, 9)),
  Waden: pair(L(41, 160, 4.4, 13)),
};
const BACK = {
  Nacken: [{ path: 'M50,27 L62,36 L50,50 L38,36 Z' }],
  Schultern: pair(L(30, 42, 7.5, 7)),
  Rücken: pair(L(41, 57, 7.5, 13, -8)),
  Trizeps: pair(L(24.5, 58, 4.6, 9, 8)),
  Unterarme: pair(L(20, 81, 4.2, 10, 10)),
  'Unterer Rücken': [{ rect: [43.5, 70, 13, 14, 4] }],
  Gesäß: pair(L(43, 93, 7.8, 8)),
  Beinbeuger: pair(L(42, 120, 6.5, 16)),
  Waden: pair(L(41, 158, 5.5, 13)),
};

function base() {
  return `<g class="bm-base">
    <circle cx="50" cy="15" r="10"/>
    <rect x="45" y="23" width="10" height="9" rx="3"/>
    <rect x="33" y="31" width="34" height="56" rx="11"/>
    <rect x="33" y="80" width="34" height="24" rx="9"/>
    <rect x="19" y="35" width="11" height="36" rx="5.5" transform="rotate(8 24 53)"/>
    <rect x="70" y="35" width="11" height="36" rx="5.5" transform="rotate(-8 76 53)"/>
    <rect x="15" y="68" width="10" height="31" rx="5" transform="rotate(10 20 83)"/>
    <rect x="75" y="68" width="10" height="31" rx="5" transform="rotate(-10 80 83)"/>
    <circle cx="17" cy="101" r="4.5"/><circle cx="83" cy="101" r="4.5"/>
    <rect x="34" y="96" width="14.5" height="82" rx="7"/>
    <rect x="51.5" y="96" width="14.5" height="82" rx="7"/>
    <rect x="35" y="176" width="12" height="7" rx="3.5"/><rect x="53" y="176" width="12" height="7" rx="3.5"/>
  </g>`;
}

function shapes(map, colorFor) {
  return Object.entries(map).map(([m, list]) => {
    const fill = colorFor(m);
    return `<g class="bm-m" data-bm="${esc(m)}" style="fill:${fill}">${list.map((s) => {
      if (s.rect) { const [x, y, w, h, r] = s.rect; return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`; }
      if (s.path) return `<path d="${s.path}"/>`;
      return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" transform="rotate(${s.rot} ${s.cx} ${s.cy})"/>`;
    }).join('')}</g>`;
  }).join('');
}

// values: {muscle: number}; mode: 'volume' (Sätze/Woche) | 'readiness' (0..1)
export function bodyMap(values, { mode = 'volume', fmt } = {}) {
  const colorFor = (m) => {
    const v = values[m];
    if (mode === 'readiness') {
      if (v == null) return 'var(--surface-3)';
      return v >= 0.8 ? 'var(--st-good)' : v >= 0.5 ? 'var(--st-warn)' : 'var(--st-crit)';
    }
    if (!v) return 'var(--heat0)';
    return v < 3 ? 'var(--heat1)' : v < 6 ? 'var(--heat2)' : v < 10 ? 'var(--heat3)' : 'var(--heat4)';
  };
  const f = fmt || ((v) => (mode === 'readiness' ? `${num(v * 100, 0)} % erholt` : `${num(v, 1)} Sätze/Woche`));
  const legendHtml = mode === 'readiness'
    ? `<div class="bm-legend"><span><i style="background:var(--st-good)"></i>erholt (ab 80 %)</span><span><i style="background:var(--st-warn)"></i>50–80 %</span><span><i style="background:var(--st-crit)"></i>ermüdet</span></div>`
    : `<div class="bm-legend"><span><i style="background:var(--heat0)"></i>0</span><span><i style="background:var(--heat1)"></i>&lt;3</span><span><i style="background:var(--heat2)"></i>3–6</span><span><i style="background:var(--heat3)"></i>6–10</span><span><i style="background:var(--heat4)"></i>10+ Sätze/Wo.</span></div>`;
  const data = esc(JSON.stringify(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, f(v)]))));
  return `<div class="bodymap" data-bmvals="${data}">
    <div class="bm-figs">
      <figure><svg viewBox="0 0 100 186">${base()}${shapes(FRONT, colorFor)}</svg><figcaption>Vorne</figcaption></figure>
      <figure><svg viewBox="0 0 100 186">${base()}${shapes(BACK, colorFor)}</svg><figcaption>Hinten</figcaption></figure>
    </div>
    <div class="bm-info">Tippe auf einen Muskel</div>
    ${legendHtml}
  </div>`;
}

export function mountBodyMaps(root) {
  root.querySelectorAll('.bodymap').forEach((bm) => {
    const vals = JSON.parse(bm.dataset.bmvals || '{}');
    const info = bm.querySelector('.bm-info');
    bm.addEventListener('click', (e) => {
      const g = e.target.closest('[data-bm]');
      if (!g) return;
      bm.querySelectorAll('.bm-m.sel').forEach((x) => x.classList.remove('sel'));
      bm.querySelectorAll(`[data-bm="${CSS.escape(g.dataset.bm)}"]`).forEach((x) => x.classList.add('sel'));
      info.innerHTML = `<b>${esc(g.dataset.bm)}</b> · ${esc(vals[g.dataset.bm] || 'keine Daten')}`;
    });
  });
}
