// Leichtgewichtige SVG-Charts mit Touch-Tooltips (keine externen Abhängigkeiten)

import { num, esc, fmtDate, MONTHS, DAY, startOfDay, addDays, startOfWeek, WEEKDAYS } from './utils.js';

export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];
const GRID = '#2c2c2a';
const AXIS = '#383835';
const MUTED = '#898781';
const SURFACE = '#1a1a19';
const HEAT = ['#262625', '#184f95', '#256abf', '#3987e5', '#86b6ef'];

const NS = 'http://www.w3.org/2000/svg';

function niceStep(x) {
  const e = 10 ** Math.floor(Math.log10(x));
  const f = x / e;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e;
}
function niceTicks(min, max, count = 4) {
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
  const step = niceStep((max - min) / count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step * 0.01; v += step) out.push(+v.toFixed(10));
  return out;
}

function timeTicks(x0, x1, maxTicks) {
  const span = x1 - x0;
  const out = [];
  if (span > 75 * DAY) {
    const d = new Date(x0);
    let m = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const months = [];
    while (m <= x1) { months.push(m); const dd = new Date(m); m = new Date(dd.getFullYear(), dd.getMonth() + 1, 1).getTime(); }
    const k = Math.max(1, Math.ceil(months.length / maxTicks));
    const long = span > 300 * DAY;
    months.forEach((t, i) => {
      if (i % k) return;
      const dd = new Date(t);
      out.push({ t, label: long ? `${MONTHS[dd.getMonth()]} ${String(dd.getFullYear()).slice(2)}` : MONTHS[dd.getMonth()] });
    });
  } else {
    for (let i = 0; i < maxTicks; i++) {
      const t = x0 + (span * (i + 0.5)) / maxTicks;
      out.push({ t, label: fmtDate(t, { day: 'numeric', month: 'numeric' }) });
    }
  }
  return out;
}

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function setupContainer(host, H) {
  host.innerHTML = '';
  host.classList.add('chart');
  const W = Math.max(240, Math.floor(host.clientWidth || host.parentElement?.clientWidth || 320));
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });
  host.appendChild(svg);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  host.appendChild(tip);
  return { W, svg, tip };
}

function placeTip(tip, px, W, py = 0) {
  tip.hidden = false;
  const tw = tip.offsetWidth;
  let left = px > W / 2 ? px - tw - 12 : px + 12;
  left = Math.max(0, Math.min(W - tw, left));
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(0, py)}px`;
}

function empty(host, msg = 'Keine Daten im Zeitraum') {
  host.innerHTML = `<div class="chart-empty">${esc(msg)}</div>`;
}

// ---------------- Linienchart ----------------
// series: [{name, color, points:[{x, y, meta}]}]
export function lineChart(host, opts) {
  const {
    series, height = 190, yFmt = (v) => num(v, 1), tipFmt, yZero = false, area = true,
    mini = false, xIsTime = true, onTap,
  } = opts;
  const all = series.flatMap((s) => s.points);
  if (!all.length) return empty(host);
  const { W, svg, tip } = setupContainer(host, height);
  const H = height;

  let x0 = Math.min(...all.map((p) => p.x)), x1 = Math.max(...all.map((p) => p.x));
  if (x0 === x1) { x0 -= DAY; x1 += DAY; }
  let ymin = Math.min(...all.map((p) => p.y)), ymax = Math.max(...all.map((p) => p.y));
  if (yZero) ymin = Math.min(0, ymin);
  else { const pad = (ymax - ymin) * 0.08 || ymax * 0.05 || 1; ymin -= pad; ymax += pad; if (ymin < 0 && Math.min(...all.map((p) => p.y)) >= 0) ymin = 0; }
  const ticks = niceTicks(ymin, ymax, mini ? 2 : 4);
  const lo = ticks[0], hi = ticks[ticks.length - 1];

  const labelW = mini ? 0 : Math.max(...ticks.map((t) => yFmt(t).length)) * 6.6 + 10;
  const pad = { l: labelW, r: mini ? 6 : 12, t: 10, b: mini ? 6 : 24 };
  const sx = (v) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);

  if (!mini) {
    for (const t of ticks) {
      el('line', { x1: pad.l, x2: W - pad.r, y1: sy(t), y2: sy(t), stroke: t === lo ? AXIS : GRID, 'stroke-width': 1 }, svg);
      const tx = el('text', { x: pad.l - 8, y: sy(t) + 4, 'text-anchor': 'end', class: 'ax' }, svg);
      tx.textContent = yFmt(t);
    }
    if (xIsTime) {
      for (const tk of timeTicks(x0, x1, W < 360 ? 4 : 6)) {
        const tx = el('text', { x: sx(tk.t), y: H - 6, 'text-anchor': 'middle', class: 'ax' }, svg);
        tx.textContent = tk.label;
      }
    }
  }

  series.forEach((s, si) => {
    const color = s.color || SERIES[si];
    const pts = [...s.points].sort((a, b) => a.x - b.x);
    if (!pts.length) return;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    if (area && series.length === 1) {
      const base = sy(Math.max(lo, 0));
      el('path', { d: `${d}L${sx(pts[pts.length - 1].x).toFixed(1)},${base}L${sx(pts[0].x).toFixed(1)},${base}Z`, fill: color, 'fill-opacity': 0.12 }, svg);
    }
    el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    const showDots = pts.length <= (mini ? 0 : 28);
    const dots = showDots ? pts : [pts[pts.length - 1]];
    for (const p of dots) el('circle', { cx: sx(p.x), cy: sy(p.y), r: 4, fill: color, stroke: SURFACE, 'stroke-width': 2 }, svg);
  });

  // Hover-/Touch-Ebene
  const cross = el('line', { y1: pad.t, y2: H - pad.b, stroke: MUTED, 'stroke-width': 1, visibility: 'hidden' }, svg);
  const hdots = series.map((s, si) => el('circle', { r: 5, fill: s.color || SERIES[si], stroke: SURFACE, 'stroke-width': 2, visibility: 'hidden' }, svg));
  const hit = el('rect', { x: pad.l, y: 0, width: W - pad.l - pad.r, height: H, fill: 'transparent' }, svg);
  let current = null;
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const xv = x0 + ((px - pad.l) / (W - pad.l - pad.r)) * (x1 - x0);
    let best = null;
    for (const s of series) for (const p of s.points) {
      const dd = Math.abs(p.x - xv);
      if (!best || dd < best.d) best = { d: dd, p };
    }
    if (!best) return;
    const xt = best.p.x;
    cross.setAttribute('x1', sx(xt)); cross.setAttribute('x2', sx(xt));
    cross.setAttribute('visibility', 'visible');
    const rows = [];
    series.forEach((s, si) => {
      const p = s.points.find((q) => q.x === xt);
      const dot = hdots[si];
      if (!p) { dot.setAttribute('visibility', 'hidden'); return; }
      dot.setAttribute('cx', sx(p.x)); dot.setAttribute('cy', sy(p.y)); dot.setAttribute('visibility', 'visible');
      rows.push({ s, p, color: s.color || SERIES[si] });
    });
    current = best.p;
    const head = xIsTime ? fmtDate(xt) : '';
    tip.innerHTML = tipFmt
      ? tipFmt(best.p, rows)
      : `<div class="tt-h">${esc(head)}</div>${rows.map((r) => `<div class="tt-r">${series.length > 1 ? `<i style="background:${r.color}"></i>${esc(r.s.name)} ` : ''}<b>${esc(yFmt(r.p.y))}</b></div>`).join('')}`;
    placeTip(tip, sx(xt), W, 0);
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    hdots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    tip.hidden = true;
  };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  if (onTap) tip.addEventListener('click', () => current && onTap(current));
  host.addEventListener('chart:hide', hide);
}

// ---------------- Balkenchart ----------------
// data: [{label, value, tip, partial}]
export function barChart(host, opts) {
  const { data, height = 180, yFmt = (v) => num(v, 0), color = SERIES[0], refLine, maxLabels, onTap } = opts;
  if (!data.length || data.every((d) => !d.value)) return empty(host);
  const { W, svg, tip } = setupContainer(host, height);
  const H = height;
  const vmax = Math.max(...data.map((d) => d.value), refLine?.value || 0);
  const ticks = niceTicks(0, vmax, 4);
  const hi = ticks[ticks.length - 1];
  const labelW = Math.max(...ticks.map((t) => yFmt(t).length)) * 6.6 + 10;
  const pad = { l: labelW, r: 8, t: 10, b: 24 };
  const iw = W - pad.l - pad.r;
  const band = iw / data.length;
  const bw = Math.max(1.5, Math.min(24, band - 2));
  const sy = (v) => pad.t + (1 - v / (hi || 1)) * (H - pad.t - pad.b);
  const base = sy(0);

  for (const t of ticks) {
    el('line', { x1: pad.l, x2: W - pad.r, y1: sy(t), y2: sy(t), stroke: t === 0 ? AXIS : GRID, 'stroke-width': 1 }, svg);
    const tx = el('text', { x: pad.l - 8, y: sy(t) + 4, 'text-anchor': 'end', class: 'ax' }, svg);
    tx.textContent = yFmt(t);
  }
  const nl = maxLabels || (W < 360 ? 5 : 8);
  const k = Math.max(1, Math.ceil(data.length / nl));
  const bars = [];
  data.forEach((d, i) => {
    const cx = pad.l + band * i + band / 2;
    if ((data.length - 1 - i) % k === 0) {
      const tx = el('text', { x: cx, y: H - 6, 'text-anchor': 'middle', class: 'ax' }, svg);
      tx.textContent = d.label;
    }
    if (!d.value) { bars.push(null); return; }
    const y = sy(d.value);
    const h = base - y;
    const r = Math.min(4, bw / 2, h);
    const x = cx - bw / 2;
    const path = `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${base}Z`;
    bars.push(el('path', { d: path, fill: d.color || color, 'fill-opacity': d.partial ? 0.5 : 1 }, svg));
  });
  if (refLine && refLine.value > 0) {
    const y = sy(refLine.value);
    el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: '#c3c2b7', 'stroke-width': 1, 'stroke-opacity': 0.6 }, svg);
    const tx = el('text', { x: W - pad.r, y: y - 5, 'text-anchor': 'end', class: 'ax ax-ref' }, svg);
    tx.textContent = refLine.label;
  }
  const hit = el('rect', { x: pad.l, y: 0, width: iw, height: H, fill: 'transparent' }, svg);
  let cur = -1;
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(data.length - 1, Math.floor((ev.clientX - r.left - pad.l) / band)));
    if (cur >= 0 && bars[cur]) bars[cur].setAttribute('fill-opacity', data[cur].partial ? 0.5 : 1);
    cur = i;
    bars.forEach((b, j) => b && b.setAttribute('fill-opacity', j === i ? 1 : 0.45));
    const d = data[i];
    tip.innerHTML = d.tip || `<div class="tt-h">${esc(d.label)}</div><div class="tt-r"><b>${esc(yFmt(d.value))}</b></div>`;
    placeTip(tip, pad.l + band * i + band / 2, W, 0);
  };
  const hide = () => { bars.forEach((b, j) => b && b.setAttribute('fill-opacity', data[j].partial ? 0.5 : 1)); tip.hidden = true; cur = -1; };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  if (onTap) tip.addEventListener('click', () => cur >= 0 && onTap(data[cur]));
}

// ---------------- Kalender-Heatmap ----------------
// days: Map(dayStart -> {value, tip, href})
export function heatmap(host, { from, to, days, cell = 13, gap = 3 }) {
  host.innerHTML = '';
  host.classList.add('chart', 'heat-wrap');
  const start = startOfWeek(from);
  const weeks = Math.ceil((startOfDay(to) - start) / DAY / 7 + 0.01);
  const padL = 22, padT = 16;
  const W = padL + weeks * (cell + gap);
  const H = padT + 7 * (cell + gap);
  const scroller = document.createElement('div');
  scroller.className = 'heat-scroll';
  host.appendChild(scroller);
  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  scroller.appendChild(svg);

  const vals = [...days.values()].map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p) => vals[Math.floor((vals.length - 1) * p)] ?? 0;
  const th = [q(0.25), q(0.5), q(0.75)];
  const level = (v) => (!v ? 0 : v <= th[0] ? 1 : v <= th[1] ? 2 : v <= th[2] ? 3 : 4);

  [0, 2, 4].forEach((wd) => {
    const t = el('text', { x: 0, y: padT + wd * (cell + gap) + cell - 2, class: 'ax' }, svg);
    t.textContent = WEEKDAYS[wd];
  });
  let lastMonth = -1;
  const cells = [];
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(start, w * 7);
    const m = new Date(addDays(ws, 6)).getMonth();
    if (m !== lastMonth) {
      const t = el('text', { x: padL + w * (cell + gap), y: 10, class: 'ax' }, svg);
      t.textContent = MONTHS[m];
      lastMonth = m;
    }
    for (let d = 0; d < 7; d++) {
      const day = addDays(ws, d);
      if (day < startOfDay(from) || day > to) continue;
      const info = days.get(day);
      const r = el('rect', {
        x: padL + w * (cell + gap), y: padT + d * (cell + gap), width: cell, height: cell, rx: 3,
        fill: HEAT[level(info?.value)],
      }, svg);
      r.dataset.day = day;
      cells.push(r);
    }
  }
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  host.appendChild(tip);
  let sel = null;
  svg.addEventListener('click', (ev) => {
    const r = ev.target.closest('rect');
    if (!r || !r.dataset.day) return;
    if (sel) sel.removeAttribute('stroke');
    sel = r;
    r.setAttribute('stroke', '#f0efec');
    r.setAttribute('stroke-width', 1.5);
    const day = +r.dataset.day;
    const info = days.get(day);
    tip.innerHTML = `<div class="tt-h">${esc(fmtDate(day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</div>${info ? info.tip : '<div class="tt-r">Kein Training</div>'}`;
    const x = +r.getAttribute('x') - scroller.scrollLeft;
    placeTip(tip, x, host.clientWidth, H + 6);
  });
  requestAnimationFrame(() => { scroller.scrollLeft = scroller.scrollWidth; });
  return { levels: HEAT };
}

// ---------------- Horizontale Balken (HTML) ----------------
export function hbars(list, { fmt = (v) => num(v, 0), color = SERIES[0], max, sub, onclickAttr } = {}) {
  if (!list.length) return '<div class="chart-empty">Keine Daten im Zeitraum</div>';
  const m = max ?? Math.max(...list.map((x) => x.value), 1);
  return `<div class="hbars">${list.map((x) => `
    <div class="hbar" ${x.attr || ''}>
      <div class="hbar-top"><span class="hbar-l">${esc(x.label)}</span><span class="hbar-v">${esc(fmt(x.value))}${sub ? `<small>${esc(sub(x))}</small>` : ''}</span></div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(1.5, (x.value / m) * 100).toFixed(1)}%;background:${x.color || color}"></div></div>
    </div>`).join('')}</div>`;
}

export { HEAT };
