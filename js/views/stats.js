import { state } from '../store.js';
import {
  idx, RANGES, rangeBounds, inRange, bucketize, autoUnit, weekStreaks, trend, sessionMetric,
  repRanges, setTypeDist, primaryMetric,
} from '../stats.js';
import { MUSCLES } from '../library.js';
import { lineChart, barChart, heatmap, hbars, SERIES, HEAT } from '../charts.js';
import { pageHead, kpi, prValue, prLabel, emptyState } from '../components.js';
import { icon, chips } from '../ui.js';
import {
  esc, num, fmtVolume, fmtDur, fmtDurShort, fmtKg, fmtDate, fmtPct, fmtCompact, sum, isoWeek,
  MONTHS, WEEKDAYS, weekday, startOfDay, DAY,
} from '../utils.js';

const TABS = [['overview', 'Übersicht'], ['strength', 'Kraft'], ['volume', 'Volumen'], ['calendar', 'Kalender'], ['records', 'Rekorde']];
const ui = { range: '6m', unit: null, muscle: 'Brust', year: new Date().getFullYear() };

const agg = (list) => {
  const { wStats } = idx();
  const r = { n: list.length, vol: 0, sets: 0, reps: 0, dur: 0 };
  for (const w of list) {
    const s = wStats.get(w.id);
    if (!s) continue;
    r.vol += s.volume; r.sets += s.sets; r.reps += s.reps; r.dur += s.duration;
  }
  return r;
};
const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);

function bucketLabel(b, unit) {
  if (unit === 'week') return `KW ${isoWeek(b.start)}`;
  const d = new Date(b.start);
  return `${MONTHS[d.getMonth()]}${d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : ''}`;
}
function bucketHead(b, unit) {
  if (unit === 'week') return `KW ${isoWeek(b.start)} · ${fmtDate(b.start, { day: 'numeric', month: 'short' })}`;
  return fmtDate(b.start, { month: 'long', year: 'numeric' });
}

export function statsView({ tab = 'overview' }) {
  if (!state.workouts.length) {
    return { html: pageHead('Statistik') + emptyState('chart', 'Noch keine Daten', 'Importiere deine Workouts oder starte dein erstes Training, um Statistiken zu sehen.', '<a class="btn primary" href="#/profile">Zum Import</a>') };
  }
  const tabs = `<div class="tabs scroll">${TABS.map(([k, l]) => `<a class="tab ${k === tab ? 'on' : ''}" href="#/stats/${k}">${l}</a>`).join('')}</div>`;
  const rangeChips = chips(RANGES, ui.range, 'data-range');
  const views = { overview, strength, volume, calendar, records };
  const v = (views[tab] || overview)();
  return {
    html: `${pageHead('Statistik')}${tabs}${tab !== 'calendar' ? `<div class="filter-row">${rangeChips}</div>` : ''}${v.html}`,
    mount: v.mount,
    clicks: {
      ...(v.clicks || {}),
      range: (el, rerender) => { ui.range = el.dataset.range; ui.unit = null; rerender(); },
    },
  };
}

// ---------------- Übersicht ----------------
function overview() {
  const { asc, wStats } = idx();
  const { from, to, prevFrom, prevTo } = rangeBounds(ui.range);
  const cur = inRange(asc, from, to);
  const prev = inRange(asc, prevFrom, prevTo);
  const a = agg(cur);
  const b = agg(prev);
  const cmp = ui.range !== 'all' && prev.length > 0;
  const d = (x, y) => (cmp ? pct(x, y) : null);
  const st = weekStreaks();
  const weeks = Math.max(1, (to - from) / (7 * DAY));
  const unit = autoUnit(ui.range);
  const bs = bucketize(cur, unit, from, to);

  // Splits
  const splits = new Map();
  for (const w of cur) {
    const s = wStats.get(w.id);
    const x = splits.get(w.title) || { n: 0, dur: 0, vol: 0, last: 0 };
    x.n++; x.dur += s.duration; x.vol += s.volume; x.last = Math.max(x.last, w.start);
    splits.set(w.title, x);
  }
  const splitRows = [...splits.entries()].sort((p, q) => q[1].n - p[1].n).slice(0, 10);

  const html = `
    <div class="kpis">
      ${kpi('Workouts', num(a.n, 0), d(a.n, b.n), 'dumbbell')}
      ${kpi('Volumen', fmtVolume(a.vol), d(a.vol, b.vol), 'weight')}
      ${kpi('Arbeitssätze', num(a.sets, 0), d(a.sets, b.sets), 'layers')}
      ${kpi('Wiederholungen', fmtCompact(a.reps), d(a.reps, b.reps), 'repeat')}
      ${kpi('Trainingszeit', fmtDurShort(a.dur), d(a.dur, b.dur), 'clock')}
      ${kpi('Ø Dauer', fmtDurShort(a.n ? a.dur / a.n : 0), cmp && b.n ? pct(a.dur / (a.n || 1), b.dur / b.n) : null, 'timer')}
    </div>
    ${cmp ? '<p class="footnote">Veränderung ggü. dem vorherigen, gleich langen Zeitraum.</p>' : ''}
    <div class="kpis four">
      <div class="kpi mini"><small>Aktuelle Serie</small><b>${st.current} Wo.</b></div>
      <div class="kpi mini"><small>Längste Serie</small><b>${st.longest} Wo.</b></div>
      <div class="kpi mini"><small>Ø pro Woche</small><b>${num(a.n / weeks, 1)}</b></div>
      <div class="kpi mini"><small>Trainingstage</small><b>${num(st.days, 0)}</b></div>
    </div>
    <section class="card"><div class="card-title">Volumen pro ${unit === 'week' ? 'Woche' : 'Monat'}</div><div data-chart="vol"></div></section>
    <section class="card"><div class="card-title">Workouts pro ${unit === 'week' ? 'Woche' : 'Monat'}</div><div data-chart="count"></div></section>
    <section class="card"><div class="card-title">Ø Trainingsdauer</div><div data-chart="dur"></div></section>
    <section class="card"><div class="card-title">Trainings-Splits</div>
      <div class="table">
        <div class="tr th"><span>Workout</span><span>Anzahl</span><span>Ø Dauer</span><span>Ø Volumen</span></div>
        ${splitRows.map(([t, x]) => `<div class="tr"><span class="trunc">${esc(t)}</span><span>${x.n}</span><span>${fmtDurShort(x.dur / x.n)}</span><span>${fmtVolume(x.vol / x.n)}</span></div>`).join('')}
      </div>
    </section>
  `;
  const mount = (root) => {
    const now = Date.now();
    const volData = bs.map((b) => {
      const v = sum(b.items, (w) => wStats.get(w.id).volume);
      return { label: bucketLabel(b, unit), value: v, partial: b.end > now, tip: `<div class="tt-h">${esc(bucketHead(b, unit))}</div><div class="tt-r"><b>${fmtVolume(v)}</b> · ${b.items.length} Workouts</div>` };
    });
    const nonEmpty = volData.filter((x) => x.value);
    barChart(root.querySelector('[data-chart="vol"]'), {
      data: volData, yFmt: fmtCompact,
      refLine: nonEmpty.length ? { value: sum(nonEmpty, (x) => x.value) / nonEmpty.length, label: 'Ø' } : null,
    });
    barChart(root.querySelector('[data-chart="count"]'), {
      data: bs.map((b) => ({ label: bucketLabel(b, unit), value: b.items.length, partial: b.end > now, tip: `<div class="tt-h">${esc(bucketHead(b, unit))}</div><div class="tt-r"><b>${b.items.length}</b> Workouts</div>` })),
      color: SERIES[2],
      refLine: unit === 'week' ? { value: state.settings.weekGoal, label: 'Ziel' } : null,
    });
    const durPts = bs.filter((b) => b.items.length).map((b) => ({ x: b.start, y: sum(b.items, (w) => wStats.get(w.id).duration) / b.items.length / 60 }));
    lineChart(root.querySelector('[data-chart="dur"]'), { series: [{ name: 'Dauer', points: durPts, color: SERIES[6] }], yFmt: (v) => `${num(v, 0)} min`, tipFmt: (p) => `<div class="tt-h">${esc(fmtDate(p.x, unit === 'week' ? { day: 'numeric', month: 'short', year: 'numeric' } : { month: 'long', year: 'numeric' }))}</div><div class="tt-r"><b>${num(p.y, 0)} Min.</b> Ø</div>` });
  };
  return { html, mount };
}

// ---------------- Kraft ----------------
function strength() {
  const { ex } = idx();
  const { from, to } = rangeBounds(ui.range);
  const list = [...ex.values()].filter((x) => x.type === 'weight' || x.type === 'weighted_bw');
  const rows = list.map((x) => {
    const ses = x.sessions.filter((s) => s.date >= from && s.date <= to && s.bestE1rm > 0);
    const tr = trend(x, 'e1rm', from, to);
    const best = Math.max(0, ...ses.map((s) => s.bestE1rm));
    return { x, ses, tr, best, last: ses[ses.length - 1] };
  }).filter((r) => r.ses.length);
  const top = [...rows].filter((r) => r.ses.length >= 3).sort((a, b) => b.ses.length - a.ses.length).slice(0, 6);
  const table = [...rows].filter((r) => r.tr).sort((a, b) => (b.tr.pct ?? -1e9) - (a.tr.pct ?? -1e9));

  const html = `
    <p class="footnote">Kraft wird als <b>geschätztes 1RM</b> (Epley-Formel) aus deinem besten Satz pro Einheit berechnet. Der Trend ist eine lineare Regression über den Zeitraum.</p>
    <div class="grid2">
      ${top.map((r, i) => `<a class="card mini-card" href="#/ex/${encodeURIComponent(r.x.name)}">
        <div class="mc-name trunc">${esc(r.x.name)}</div>
        <div class="mc-val">${num(r.last.bestE1rm, 1)}<small> kg</small></div>
        <div class="mc-delta ${r.tr && r.tr.change > 0 ? 'up' : r.tr && r.tr.change < 0 ? 'down' : ''}">${r.tr ? `${r.tr.change > 0 ? '▲' : r.tr.change < 0 ? '▼' : '■'} ${num(Math.abs(r.tr.change), 1)} kg · ${fmtPct(r.tr.pct)}` : '–'}</div>
        <div data-spark="${i}"></div>
      </a>`).join('')}
    </div>
    ${top.length ? '' : '<p class="footnote">Mindestens 3 Einheiten einer Übung im Zeitraum nötig.</p>'}
    <section class="card"><div class="card-title">Kraftentwicklung aller Übungen</div>
      <div class="table strength-table">
        <div class="tr th"><span>Übung</span><span>Best 1RM</span><span>pro Monat</span><span>Trend</span></div>
        ${table.map((r) => `<a class="tr" href="#/ex/${encodeURIComponent(r.x.name)}"><span class="wrap">${esc(r.x.name)}<small>${r.ses.length} Einheiten</small></span><span>${num(r.best, 1)}</span><span>${r.tr.perMonth > 0 ? '+' : ''}${num(r.tr.perMonth, 1)} kg</span><span class="${r.tr.pct > 0 ? 'up' : r.tr.pct < 0 ? 'down' : ''}">${fmtPct(r.tr.pct)}</span></a>`).join('') || '<div class="tr"><span>Zu wenige Daten im Zeitraum</span></div>'}
      </div>
    </section>
  `;
  const mount = (root) => {
    top.forEach((r, i) => {
      lineChart(root.querySelector(`[data-spark="${i}"]`), {
        series: [{ name: '1RM', points: r.ses.map((s) => ({ x: s.date, y: s.bestE1rm })), color: SERIES[0] }],
        height: 64, mini: true, yFmt: (v) => `${num(v, 1)} kg`,
      });
    });
  };
  return { html, mount };
}

// ---------------- Volumen ----------------
function volume() {
  const { asc, wStats, ex } = idx();
  const { from, to } = rangeBounds(ui.range);
  const cur = inRange(asc, from, to);
  const unit = ui.unit || autoUnit(ui.range);
  const bs = bucketize(cur, unit, from, to);
  const weeks = Math.max(1, (to - from) / (7 * DAY));

  // Sätze pro Muskelgruppe
  const musc = {};
  for (const w of cur) for (const [m, v] of Object.entries(wStats.get(w.id).muscles)) musc[m] = (musc[m] || 0) + v;
  const muscList = Object.entries(musc).filter(([m]) => m !== 'Cardio').map(([label, v]) => ({ label, value: v / weeks, total: v })).sort((a, b) => b.value - a.value);
  const muscOpts = MUSCLES.filter((m) => musc[m]);
  if (!muscOpts.includes(ui.muscle)) ui.muscle = muscOpts[0];

  // Volumen pro Übung und Split
  const exVol = new Map();
  const curIds = new Set(cur.map((w) => w.id));
  for (const x of ex.values()) {
    const v = sum(x.sessions.filter((s) => curIds.has(s.wid)), (s) => s.volume);
    if (v > 0) exVol.set(x.name, v);
  }
  const exList = [...exVol.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, value]) => ({ label, value, attr: `data-nav="#/ex/${encodeURIComponent(label)}"` }));
  const split = new Map();
  for (const w of cur) split.set(w.title, (split.get(w.title) || 0) + wStats.get(w.id).volume);
  const splitList = [...split.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
  const reps = repRanges(cur);
  const repTotal = sum(reps, (r) => r.value) || 1;
  const types = setTypeDist(cur);
  const typeTotal = sum(types, (r) => r.value) || 1;

  const html = `
    <div class="filter-row">${chips([['week', 'Woche'], ['month', 'Monat']], unit, 'data-unit')}</div>
    <section class="card"><div class="card-title">Volumen pro ${unit === 'week' ? 'Woche' : 'Monat'}</div><div data-chart="vol"></div></section>
    <section class="card"><div class="card-title">Arbeitssätze pro ${unit === 'week' ? 'Woche' : 'Monat'}</div><div data-chart="sets"></div></section>
    <section class="card">
      <div class="card-title">Sätze pro Muskelgruppe <small>Ø pro Woche</small></div>
      <p class="footnote">Primäre Muskeln zählen 1 Satz, unterstützende 0,5. Für Muskelaufbau gelten ca. 10–20 Sätze pro Woche als guter Richtwert.</p>
      ${hbars(muscList, { fmt: (v) => num(v, 1), sub: (x) => ` · ${num(x.total, 0)} ges.` })}
    </section>
    <section class="card">
      <div class="card-title">Verlauf je Muskelgruppe</div>
      <div class="chips scroll">${muscOpts.map((m) => `<button class="chip ${m === ui.muscle ? 'on' : ''}" data-muscle="${esc(m)}">${esc(m)}</button>`).join('')}</div>
      <div data-chart="muscle"></div>
    </section>
    <section class="card"><div class="card-title">Volumen pro Übung <small>Top 12</small></div>${hbars(exList, { fmt: fmtVolume, color: SERIES[0] })}</section>
    <section class="card"><div class="card-title">Volumen pro Workout-Typ</div>${hbars(splitList, { fmt: fmtVolume, color: SERIES[2] })}</section>
    <div class="grid2 wide">
      <section class="card"><div class="card-title">Wiederholungsbereiche</div>${hbars(reps, { fmt: (v) => `${num((v / repTotal) * 100, 0)} %`, color: SERIES[6], sub: (x) => ` · ${x.value}` })}</section>
      <section class="card"><div class="card-title">Satztypen</div>${hbars(types, { fmt: (v) => `${num((v / typeTotal) * 100, 0)} %`, color: SERIES[3], sub: (x) => ` · ${x.value}` })}</section>
    </div>
  `;
  const mount = (root) => {
    const now = Date.now();
    barChart(root.querySelector('[data-chart="vol"]'), {
      data: bs.map((b) => {
        const v = sum(b.items, (w) => wStats.get(w.id).volume);
        return { label: bucketLabel(b, unit), value: v, partial: b.end > now, tip: `<div class="tt-h">${esc(bucketHead(b, unit))}</div><div class="tt-r"><b>${fmtVolume(v)}</b></div>` };
      }),
      yFmt: fmtCompact,
    });
    barChart(root.querySelector('[data-chart="sets"]'), {
      data: bs.map((b) => {
        const v = sum(b.items, (w) => wStats.get(w.id).sets);
        return { label: bucketLabel(b, unit), value: v, partial: b.end > now, tip: `<div class="tt-h">${esc(bucketHead(b, unit))}</div><div class="tt-r"><b>${v}</b> Sätze</div>` };
      }),
      color: SERIES[2],
    });
    barChart(root.querySelector('[data-chart="muscle"]'), {
      data: bs.map((b) => {
        const v = sum(b.items, (w) => wStats.get(w.id).muscles[ui.muscle] || 0);
        return { label: bucketLabel(b, unit), value: v, partial: b.end > now, tip: `<div class="tt-h">${esc(bucketHead(b, unit))}</div><div class="tt-r">${esc(ui.muscle)}: <b>${num(v, 1)}</b> Sätze</div>` };
      }),
      color: SERIES[6], yFmt: (v) => num(v, 0),
      refLine: unit === 'week' ? { value: 10, label: '10 Sätze' } : null,
    });
  };
  return {
    html, mount,
    clicks: {
      unit: (el, rerender) => { ui.unit = el.dataset.unit; rerender(); },
      muscle: (el, rerender) => { ui.muscle = el.dataset.muscle; rerender(); },
    },
  };
}

// ---------------- Kalender ----------------
function calendar() {
  const { asc, wStats } = idx();
  const years = [...new Set(asc.map((w) => new Date(w.start).getFullYear()))].sort((a, b) => b - a);
  if (!years.includes(ui.year)) ui.year = years[0];
  const y = ui.year;
  const yFrom = new Date(y, 0, 1).getTime();
  const yTo = Math.min(new Date(y, 11, 31, 23, 59).getTime(), Math.max(Date.now(), yFrom));
  const yList = asc.filter((w) => w.start >= yFrom && w.start <= new Date(y, 11, 31, 23, 59).getTime());

  const months = MONTHS.map((m, i) => ({ m, i, n: 0, vol: 0, dur: 0, days: new Set() }));
  const wd = WEEKDAYS.map((label) => ({ label, value: 0 }));
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, value: 0 }));
  for (const w of yList) {
    const s = wStats.get(w.id);
    const d = new Date(w.start);
    const mm = months[d.getMonth()];
    mm.n++; mm.vol += s.volume; mm.dur += s.duration; mm.days.add(d.getDate());
    wd[weekday(w.start)].value++;
    hours[d.getHours()].value++;
  }
  const yAgg = agg(yList);

  // Jahresvergleich
  const yearRows = years.map((yy) => {
    const l = asc.filter((w) => new Date(w.start).getFullYear() === yy);
    const a = agg(l);
    const weeks = new Set(l.map((w) => Math.floor((w.start - new Date(yy, 0, 1)) / (7 * DAY)))).size;
    return { yy, ...a, weeks };
  });

  const html = `
    <div class="filter-row">${chips(years.map((v) => [String(v), String(v)]), String(y), 'data-year')}</div>
    <div class="kpis four">
      <div class="kpi mini"><small>Workouts</small><b>${yAgg.n}</b></div>
      <div class="kpi mini"><small>Volumen</small><b>${fmtVolume(yAgg.vol)}</b></div>
      <div class="kpi mini"><small>Stunden</small><b>${num(yAgg.dur / 3600, 0)}</b></div>
      <div class="kpi mini"><small>Sätze</small><b>${num(yAgg.sets, 0)}</b></div>
    </div>
    <section class="card"><div class="card-title">Trainingstage ${y}</div>
      <div data-chart="heat"></div>
      <div class="heat-legend"><span>Weniger Volumen</span>${HEAT.map((c) => `<i style="background:${c}"></i>`).join('')}<span>Mehr</span></div>
      <p class="footnote">Tippe auf einen Tag für Details.</p>
    </section>
    <section class="card"><div class="card-title">Monate ${y}</div>
      <div class="table">
        <div class="tr th"><span>Monat</span><span>Workouts</span><span>Volumen</span><span>Zeit</span></div>
        ${months.filter((m) => new Date(y, m.i, 1).getTime() <= Date.now()).map((m) => `<div class="tr ${m.n ? '' : 'dim'}"><span>${m.m}</span><span>${m.n}</span><span>${m.n ? fmtVolume(m.vol) : '–'}</span><span>${m.n ? fmtDurShort(m.dur) : '–'}</span></div>`).join('')}
      </div>
    </section>
    <div class="grid2 wide">
      <section class="card"><div class="card-title">Wochentage</div>${hbars(wd, { color: SERIES[0] })}</section>
      <section class="card"><div class="card-title">Tageszeit <small>Startzeit</small></div><div data-chart="hours"></div></section>
    </div>
    <section class="card"><div class="card-title">Jahresvergleich</div>
      <div class="table">
        <div class="tr th five"><span>Jahr</span><span>Workouts</span><span>Volumen</span><span>Stunden</span><span>Wochen aktiv</span></div>
        ${yearRows.map((r) => `<div class="tr five"><span>${r.yy}</span><span>${r.n}</span><span>${fmtVolume(r.vol)}</span><span>${num(r.dur / 3600, 0)}</span><span>${r.weeks}</span></div>`).join('')}
      </div>
    </section>
  `;
  const mount = (root) => {
    const days = new Map();
    for (const w of yList) {
      const k = startOfDay(w.start);
      const s = wStats.get(w.id);
      const cur = days.get(k) || { value: 0, tip: '' };
      cur.value += s.volume || 1;
      cur.tip += `<a class="tt-link" href="#/w/${esc(w.id)}"><b>${esc(w.title)}</b> · ${fmtVolume(s.volume)} · ${fmtDurShort(s.duration)} ›</a>`;
      days.set(k, cur);
    }
    heatmap(root.querySelector('[data-chart="heat"]'), { from: yFrom, to: yTo, days });
    const hs = hours.slice(5, 24);
    barChart(root.querySelector('[data-chart="hours"]'), {
      data: hs.map((h) => ({ label: `${h.h}`, value: h.value, tip: `<div class="tt-h">${h.h}:00–${h.h + 1}:00 Uhr</div><div class="tt-r"><b>${h.value}</b> Workouts</div>` })),
      color: SERIES[6], height: 150, maxLabels: 6,
    });
  };
  return { html, mount, clicks: { year: (el, rerender) => { ui.year = +el.dataset.year; rerender(); } } };
}

// ---------------- Rekorde ----------------
function records() {
  const { prs, ex } = idx();
  const { from, to } = rangeBounds(ui.range);
  const cur = prs.filter((p) => p.date >= from && p.date <= to);
  const unit = autoUnit(ui.range);
  const bs = bucketize([], unit, from, to);
  for (const p of cur) { const b = bs.find((x) => p.date >= x.start && p.date < x.end); if (b) b.items.push(p); }
  const recent = [...cur].reverse().filter((p) => p.kind !== 'sessionVolume' && p.kind !== 'volume').slice(0, 40);
  const best = [...ex.values()].filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count);

  const html = `
    <div class="kpis four">
      <div class="kpi mini"><small>Rekorde</small><b>${cur.length}</b></div>
      <div class="kpi mini"><small>1RM-Rekorde</small><b>${cur.filter((p) => p.kind === 'e1rm').length}</b></div>
      <div class="kpi mini"><small>Gewichts-PRs</small><b>${cur.filter((p) => p.kind === 'weight').length}</b></div>
      <div class="kpi mini"><small>Übungen</small><b>${new Set(cur.map((p) => p.exercise)).size}</b></div>
    </div>
    <section class="card"><div class="card-title">Rekorde pro ${unit === 'week' ? 'Woche' : 'Monat'}</div><div data-chart="prs"></div></section>
    <section class="card"><div class="card-title">${icon('trophy', 'gold')} Letzte Rekorde</div>
      ${recent.length ? recent.map((p) => `<a class="pr-row" href="#/w/${esc(p.wid)}">
        <div><b>${esc(p.exercise)}</b><small>${esc(prLabel(p.kind))} · ${esc(fmtDate(p.date))}</small></div>
        <span class="pr-val">${esc(prValue(p))}<small>vorher ${esc(prValue({ ...p, value: p.prev }))}</small></span></a>`).join('') : '<div class="chart-empty">Keine Rekorde im Zeitraum</div>'}
    </section>
    <section class="card"><div class="card-title">Bestwerte (gesamt)</div>
      <div class="table">
        <div class="tr th"><span>Übung</span><span>1RM</span><span>Max</span><span>Wdh.</span></div>
        ${best.map((x) => `<a class="tr" href="#/ex/${encodeURIComponent(x.name)}"><span class="trunc">${esc(x.name)}</span><span>${x.best.e1rm ? num(x.best.e1rm, 1) : '–'}</span><span>${x.best.weight ? num(x.best.weight, 1) : '–'}</span><span>${x.best.reps || '–'}</span></a>`).join('')}
      </div>
    </section>
  `;
  const mount = (root) => {
    barChart(root.querySelector('[data-chart="prs"]'), {
      data: bs.map((b) => ({ label: bucketLabel(b, unit), value: b.items.length, tip: `<div class="tt-h">${esc(bucketHead(b, unit))}</div><div class="tt-r"><b>${b.items.length}</b> Rekorde</div>` })),
      color: SERIES[3],
    });
  };
  return { html, mount };
}

export const statsUI = ui;
