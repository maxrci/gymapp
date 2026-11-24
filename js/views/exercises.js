import { state, allExerciseNames, exerciseMeta, saveExerciseMeta, renameExercise } from '../store.js';
import { prValue } from '../components.js';
import { idx, RANGES, rangeBounds, trend, sessionMetric, primaryMetric, repMaxTable, PR_LABELS, REL_METRICS } from '../stats.js';
import { rel, relSwitch, relClick, relAvailable, fmtRel } from '../body.js';
import { MUSCLES, TYPES } from '../library.js';
import { lineChart, SERIES } from '../charts.js';
import { pageHead, kpi, fmtSet, setBadge, emptyState } from '../components.js';
import { icon, chips, sheet, formDialog, toast, confirmDialog } from '../ui.js';
import { createExerciseDialog } from '../picker.js';
import { aiOn, suggest, repRange, increment } from '../ai.js';
import { poseSVG, poseFor, mountPose } from '../poses.js';
import { stageFor } from '../gamification.js';
import { weekStreaks } from '../stats.js';
import { esc, num, fmtVolume, fmtKg, fmtDate, fmtRelDay, fmtPct, fmtClock, fmtCompact } from '../utils.js';
import { cachedGroup, loggedIn, demoOn, myId } from '../sync.js';
import { exKey } from '../compete.js';
import { fighterHead } from '../fighter.js';
import { startExerciseFight } from '../fight.js';

const ui = { muscle: '', sort: 'count', q: '', range: 'all', metric: null, metricFor: null, hist: 10, gxRel: false };

export function exercisesView({ embed = false } = {}) {
  const { ex } = idx();
  const names = allExerciseNames();
  const items = names.map((n) => {
    const x = ex.get(n);
    return { name: n, meta: exerciseMeta(n), x, count: x?.count || 0, last: x?.last || 0 };
  });
  const stg = stageFor(weekStreaks().current).index;
  const muscles = MUSCLES.filter((m) => items.some((i) => i.meta.primary === m));
  const filtered = items.filter((i) => !ui.muscle || i.meta.primary === ui.muscle);
  filtered.sort(ui.sort === 'az' ? (a, b) => a.name.localeCompare(b.name, 'de')
    : ui.sort === 'last' ? (a, b) => b.last - a.last : (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'));

  const right = (i) => {
    if (!i.x) return '';
    const t = i.x.type;
    if ((t === 'weight' || t === 'weighted_bw') && i.x.best.e1rm) return `<div class="er-right"><b>${num(i.x.best.e1rm, 1)}</b><small>1RM kg</small></div>`;
    if (t === 'bodyweight' && i.x.best.reps) return `<div class="er-right"><b>${i.x.best.reps}</b><small>max Wdh.</small></div>`;
    if (t === 'cardio' && i.x.best.distance) return `<div class="er-right"><b>${num(i.x.best.distance, 1)}</b><small>km</small></div>`;
    return '';
  };

  const html = `
    ${embed ? `<div class="section-row"><h2 class="section-title">Deine Übungen</h2><button class="link-btn" data-act="new">${icon('plus', 'xs')} Neu</button></div>` : pageHead('Übungen', { actions: `<button class="icon-btn" data-act="new" aria-label="Neue Übung">${icon('plus')}</button>` })}
    <div class="search sticky">${icon('search')}<input type="search" placeholder="${items.length} Übungen durchsuchen" value="${esc(ui.q)}" data-search autocomplete="off"></div>
    <div class="chips scroll">${[['', 'Alle'], ...muscles.map((m) => [m, m])].map(([v, l]) => `<button class="chip ${v === ui.muscle ? 'on' : ''}" data-muscle="${esc(v)}">${esc(l)}</button>`).join('')}</div>
    <div class="filter-row">${chips([['count', 'Häufigste'], ['last', 'Zuletzt'], ['az', 'A–Z']], ui.sort, 'data-sort')}</div>
    <div class="ex-list">
      ${filtered.map((i) => `<a class="ex-row" href="#/ex/${encodeURIComponent(i.name)}" data-name="${esc(i.name.toLowerCase())}">
        <div class="ex-avatar pose-av">${poseSVG(poseFor(i.name), { stage: stg })}</div>
        <div class="ex-titles"><div class="ex-name">${esc(i.name)}</div>
        <div class="ex-sub">${esc(i.meta.primary)}${i.count ? ` · ${i.count}× · ${esc(fmtRelDay(i.last))}` : ' · noch nicht trainiert'}</div></div>
        ${right(i)}
      </a>`).join('')}
    </div>
  `;
  const applySearch = (root) => {
    const q = ui.q.toLowerCase();
    root.querySelectorAll('.ex-row').forEach((r) => { r.hidden = q && !r.dataset.name.includes(q); });
  };
  return {
    html,
    mount: (root) => {
      const inp = root.querySelector('[data-search]');
      inp.addEventListener('input', () => { ui.q = inp.value.trim(); applySearch(root); });
      applySearch(root);
    },
    handlers: {
      new: async () => {
        const n = await createExerciseDialog(ui.q);
        if (n) location.hash = `#/ex/${encodeURIComponent(n)}`;
      },
    },
    clicks: {
      muscle: (el, rr) => { ui.muscle = el.dataset.muscle; rr(); },
      sort: (el, rr) => { ui.sort = el.dataset.sort; rr(); },
    },
  };
}

const METRICS = {
  weight: [['e1rm', '1RM'], ['weight', 'Max-Gewicht'], ['volume', 'Volumen'], ['totalReps', 'Wdh.'], ['sets', 'Sätze']],
  weighted_bw: [['e1rm', '1RM'], ['weight', 'Zusatzgewicht'], ['reps', 'Max Wdh.'], ['totalReps', 'Wdh.'], ['sets', 'Sätze']],
  bodyweight: [['reps', 'Max Wdh.'], ['totalReps', 'Wdh. gesamt'], ['sets', 'Sätze']],
  cardio: [['distance', 'Distanz'], ['duration', 'Dauer'], ['pace', 'Pace']],
  duration: [['duration', 'Dauer'], ['sets', 'Sätze']],
};
const metricFmt = (m) => ({
  e1rm: (v) => `${num(v, 1)} kg`, weight: (v) => `${num(v, 1)} kg`, volume: (v) => fmtVolume(v),
  reps: (v) => `${num(v, 0)}`, totalReps: (v) => `${num(v, 0)}`, sets: (v) => `${num(v, 0)}`,
  distance: (v) => `${num(v, 2)} km`, duration: (v) => `${num(v, 0)} min`, pace: (v) => `${num(v, 1)} min/km`,
}[m] || ((v) => num(v, 1)));
const axisFmt = (m) => (m === 'volume' ? fmtCompact : m === 'pace' ? (v) => num(v, 1) : (v) => num(v, m === 'distance' ? 1 : 0));

export function exerciseDetailView({ name }) {
  const { ex } = idx();
  const x = ex.get(name);
  const meta = exerciseMeta(name);
  const type = x?.type || meta.type;
  const back = '#/arena/exercises';
  const menuBtn = `<button class="icon-btn" data-act="menu">${icon('more')}</button>`;
  const sub = `${esc(meta.primary)}${meta.secondary?.length ? ` · ${esc(meta.secondary.join(', '))}` : ''} · ${esc(TYPES[type]?.label || '')}`;
  if (!x || !x.count) {
    return {
      html: pageHead(name, { back, actions: menuBtn, sub }) + `<div class="card demo"><div data-demo></div></div>` + emptyState('dumbbell', 'Noch keine Daten', 'Sobald du diese Übung trainierst, erscheinen hier Verlauf, Rekorde und Diagramme.'),
      handlers: { menu: () => exerciseMenu(name, type) },
      mount: (root) => mountPose(root.querySelector('[data-demo]'), poseFor(name), { stage: stageFor(weekStreaks().current).index }),
    };
  }
  if (ui.metricFor !== name) { ui.metricFor = name; ui.metric = primaryMetric(x); ui.hist = 10; }
  const metrics = METRICS[type] || METRICS.weight;
  if (!metrics.some(([k]) => k === ui.metric)) ui.metric = metrics[0][0];
  const { from, to } = rangeBounds(ui.range);
  const isW = type === 'weight' || type === 'weighted_bw';
  const relOn = isW && rel.on && relAvailable() && REL_METRICS.includes(ui.metric);
  const ses = x.sessions.filter((s) => s.date >= from && s.date <= to);
  const pts = ses.map((s) => ({ x: s.date, y: sessionMetric(x, s, ui.metric, relOn), s })).filter((p) => p.y > 0);
  const tr = trend(x, ui.metric, from, to, relOn);
  const f = relOn ? fmtRel : metricFmt(ui.metric);

  const kpis = isW ? `
      ${kpi('Bestes 1RM', fmtKg(x.best.e1rm), null, 'trophy')}
      ${kpi(type === 'weighted_bw' ? 'Max. Zusatzgew.' : 'Max. Gewicht', fmtKg(x.best.weight), null, 'weight')}
      ${kpi('Einheiten', `${x.count}`, null, 'calendar')}
      ${kpi('Gesamtvolumen', fmtVolume(x.totalVolume), null, 'layers')}
      ${kpi('Arbeitssätze', num(x.totalSets, 0), null, 'repeat')}
      ${x.bestRel ? kpi('1RM ÷ Körpergew.', fmtRel(x.bestRel), null, 'user') : kpi('Seit', esc(fmtDate(x.first, { month: 'short', year: 'numeric' })), null, 'clock')}`
    : type === 'cardio' ? `
      ${kpi('Längste Distanz', `${num(x.best.distance, 2)} km`, null, 'trophy')}
      ${kpi('Einheiten', `${x.count}`, null, 'calendar')}
      ${kpi('Distanz gesamt', `${num(x.sessions.reduce((a, s) => a + s.distance, 0), 1)} km`, null, 'layers')}
      ${kpi('Zeit gesamt', `${num(x.sessions.reduce((a, s) => a + s.duration, 0) / 3600, 1)} h`, null, 'clock')}`
    : `
      ${kpi('Max. Wdh.', `${x.best.reps || '–'}`, null, 'trophy')}
      ${kpi('Einheiten', `${x.count}`, null, 'calendar')}
      ${kpi('Wdh. gesamt', num(x.totalReps, 0), null, 'repeat')}
      ${kpi('Arbeitssätze', num(x.totalSets, 0), null, 'layers')}`;

  const rm = isW ? repMaxTable(x, 12) : [];
  const bestRows = Object.entries(x.best).filter(([k, v]) => v && PR_LABELS[k] && (isW || ['reps', 'distance', 'duration', 'speed'].includes(k)))
    .map(([k, v]) => `<div class="pr-row"><div><b>${esc(PR_LABELS[k])}</b><small>${esc(fmtDate(x.bestAt[k]))}</small></div><span class="pr-val">${esc(prValue({ kind: k, value: v, exercise: x.name }))}</span></div>`).join('');

  const hist = [...x.sessions].reverse().slice(0, ui.hist).map((s) => {
    let n = 0;
    return `<a class="hist" href="#/w/${esc(s.wid)}">
      <div class="hist-head"><b>${esc(fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</b>${isW && s.bestE1rm ? `<span class="muted">1RM ${num(s.bestE1rm, 1)} kg</span>` : ''}</div>
      ${s.sets.map((q) => { if (q.type === 'normal') n++; return `<div class="dset">${setBadge(q, n)}<span class="dset-v">${esc(fmtSet(q, type))}</span></div>`; }).join('')}
    </a>`;
  }).join('');

  const html = `
    ${pageHead(name, { back, actions: menuBtn, sub })}
    <div class="card demo"><div data-demo></div></div>
    <div class="kpis">${kpis}</div>
    ${groupCompare(name, type)}
    ${aiOn() ? aiCard(x) : ''}
    <div class="filter-row">${chips(RANGES, ui.range, 'data-range')}</div>
    <section class="card">
      <div class="chips scroll">${metrics.map(([k, l]) => `<button class="chip ${k === ui.metric ? 'on' : ''}" data-metric="${k}">${l}</button>`).join('')}</div>
      ${isW && REL_METRICS.includes(ui.metric) ? `<div class="rel-row">${relSwitch()}</div>` : ''}
      <div data-chart="main"></div>
      ${tr ? `<div class="trend-line ${tr.change > 0 ? 'up' : tr.change < 0 ? 'down' : ''}">${icon('chart', 'xs')} Trend: <b>${tr.perMonth > 0 ? '+' : ''}${esc(f(tr.perMonth))}</b> pro Monat · ${esc(fmtPct(tr.pct))} im Zeitraum (${tr.n} Einheiten)</div>` : ''}
    </section>
    ${bestRows ? `<section class="card"><div class="card-title">${icon('trophy', 'gold')} Persönliche Rekorde</div>${bestRows}</section>` : ''}
    ${rm.length ? `<section class="card"><div class="card-title">Wiederholungs-Maxima</div>
      <p class="footnote">Höchstes Gewicht, das du für mindestens N Wiederholungen bewegt hast.</p>
      <div class="table">
        <div class="tr th"><span>Wdh.</span><span>Gewicht</span><span>Satz</span><span>Datum</span></div>
        ${rm.map((r) => `<div class="tr"><span>${r.reps}</span><span><b>${num(r.weight, 1)} kg</b>${rel.on && r.bw && type === 'weight' ? `<small>${esc(fmtRel(r.weight / r.bw))}</small>` : ''}</span><span>${num(r.weight, 1)} × ${r.actualReps}</span><span>${esc(fmtDate(r.date, { day: '2-digit', month: '2-digit', year: '2-digit' }))}</span></div>`).join('')}
      </div></section>` : ''}
    <h2 class="section-title">Verlauf</h2>
    ${hist}
    ${x.sessions.length > ui.hist ? '<button class="btn ghost block" data-act="more">Mehr anzeigen</button>' : ''}
  `;
  return {
    html,
    mount: (root) => {
      mountPose(root.querySelector('[data-demo]'), poseFor(name), { stage: stageFor(weekStreaks().current).index });
      lineChart(root.querySelector('[data-chart="main"]'), {
        series: [{ name: ui.metric, points: pts, color: SERIES[0] }],
        yFmt: relOn ? (v) => num(v, 2) : axisFmt(ui.metric),
        yZero: ['volume', 'sets', 'totalReps'].includes(ui.metric),
        tipFmt: (p) => {
          const bs = p.s.bestSet;
          return `<div class="tt-h">${esc(fmtDate(p.x))}</div><div class="tt-r"><b>${esc(f(p.y))}</b></div>${bs && isW ? `<div class="tt-r muted">Bester Satz: ${esc(fmtSet(bs, type))}</div>` : ''}<div class="tt-r tt-open">Workout öffnen ›</div>`;
        },
        onTap: (p) => { location.hash = `#/w/${p.s.wid}`; },
      });
    },
    handlers: {
      menu: () => exerciseMenu(name, type),
      more: (_, rr) => { ui.hist += 20; rr(); },
    },
    clicks: {
      range: (el, rr) => { ui.range = el.dataset.range; rr(); },
      metric: (el, rr) => { ui.metric = el.dataset.metric; rr(); },
      rel: relClick,
      gxrel: (el, rr) => { ui.gxRel = el.dataset.gxrel === '1'; rr(); },
      gxfight: (el) => {
        const g = cachedGroup();
        if (g) startExerciseFight(g, myId(), el.dataset.gxfight, name, ui.gxRel);
      },
    },
  };
}

// ---------- Vergleich mit der Gruppe ----------
function groupCompare(name, type) {
  if (!loggedIn() && !demoOn()) return '';
  const g = cachedGroup();
  if (!g?.exercises) return '';
  const k = exKey(name);
  const me = myId();
  const isW = type === 'weight' || type === 'weighted_bw';
  const relOn = isW && ui.gxRel;
  const val = (b) => (!b ? 0 : isW ? (relOn ? b.rel : b.e) : type === 'cardio' ? b.d : type === 'duration' ? b.sec : b.mr);
  const fmt = (v) => (!v ? '–' : isW ? (relOn ? `${num(v, 2)} × KG` : `${num(v, 1)} kg`) : type === 'cardio' ? `${num(v, 2)} km` : type === 'duration' ? fmtClock(v) : `${num(v, 0)} Wdh.`);
  const rows = g.members.map((m) => ({ m, b: g.exercises[m.id]?.[k] })).filter((r) => r.b).map((r) => ({ ...r, v: val(r.b) })).sort((a, b) => b.v - a.v);
  if (rows.length < 2 && !rows.some((r) => r.m.id !== me)) return `<section class="card"><div class="card-title">${icon('users')} Vergleich in der Arena</div><p class="footnote">Noch niemand sonst aus ${g.demo ? 'der Demo-Arena' : 'deiner Gruppe'} hat diese Übung trainiert.</p></section>`;
  const top = rows[0]?.v || 1;
  const label = isW ? (relOn ? 'Bestes 1RM ÷ Körpergewicht' : 'Bestes geschätztes 1RM') : type === 'cardio' ? 'Längste Distanz' : type === 'duration' ? 'Längste Dauer' : 'Meiste Wiederholungen';
  return `<section class="card">
    <div class="card-title">${icon('users')} Vergleich in der Arena <small>${esc(label)}</small></div>
    ${isW ? `<div class="rel-row"><div class="rel-switch"><button class="${relOn ? '' : 'on'}" data-gxrel="0">kg</button><button class="${relOn ? 'on' : ''}" data-gxrel="1">× KG</button></div></div>` : ''}
    ${rows.map((r, i) => `<div class="lg-row ${r.m.id === me ? 'me' : ''}">
      <span class="lg-rank ${i < 3 && r.v ? `m${i + 1}` : ''}">${i + 1}</span><span class="lg-head">${fighterHead(r.m.stage || 0, r.m.look || {})}</span>
      <span class="lg-main"><b>${esc(r.m.name)}</b><div class="bar"><i style="width:${r.v ? Math.max(3, (r.v / top) * 100) : 0}%"></i></div><small>${r.b.c}× trainiert</small></span>
      <span class="lg-val">${esc(fmt(r.v))}</span>${r.m.id !== me && r.v ? `<button class="lg-fight" data-gxfight="${esc(r.m.id)}" aria-label="Kampf">${icon('bolt')}</button>` : ''}</div>`).join('')}
    <p class="footnote">Verglichen wird über den Übungsnamen. Tippe auf ${icon('bolt', 'xs')} für einen Kampf in dieser Übung.</p>
  </section>`;
}

async function exerciseMenu(name, type) {
  const meta = exerciseMeta(name);
  const v = await sheet({
    title: name,
    options: [
      { label: `Muskelgruppe: ${meta.primary}`, value: 'muscle', icon: 'target' },
      { label: `Erfassung: ${TYPES[type]?.label}`, value: 'type', icon: 'layers' },
      { label: 'Wiederholungsbereich (AI)', value: 'range', icon: 'target' },
      { label: 'Gewichtsschritt (AI)', value: 'inc', icon: 'weight' },
      { label: 'Umbenennen / Zusammenführen', value: 'rename', icon: 'edit' },
    ],
  });
  if (v === 'muscle') {
    const res = await formDialog({
      title: 'Muskelgruppen',
      fields: [
        { name: 'primary', label: 'Primär', type: 'select', value: meta.primary, options: MUSCLES.map((m) => ({ value: m, label: m })) },
        { name: 'secondary', label: 'Unterstützend (kommagetrennt)', value: (meta.secondary || []).join(', '), autofocus: false },
      ],
    });
    if (res) {
      const sec = res.secondary.split(',').map((s) => s.trim()).filter((s) => MUSCLES.includes(s) && s !== res.primary);
      await saveExerciseMeta(name, { primary: res.primary, secondary: sec });
      toast('Gespeichert');
    }
  }
  if (v === 'type') {
    const t = await sheet({ title: 'Wie wird die Übung erfasst?', options: Object.entries(TYPES).map(([k, x]) => ({ label: x.label, value: k, active: k === type })) });
    if (t) await saveExerciseMeta(name, { type: t });
  }
  if (v === 'range') {
    const x = idx().ex.get(name);
    const [lo, hi] = x ? repRange(x) : [8, 12];
    const res = await formDialog({ title: 'Wiederholungsbereich', fields: [
      { name: 'lo', label: 'Minimum', value: lo, inputmode: 'numeric' }, { name: 'hi', label: 'Maximum (dann Gewicht steigern)', value: hi, inputmode: 'numeric' }] });
    if (res) {
      const a = parseInt(res.lo, 10), b = parseInt(res.hi, 10);
      await saveExerciseMeta(name, { repRange: a > 0 && b > a ? [a, b] : null });
    }
  }
  if (v === 'inc') {
    const x = idx().ex.get(name);
    const res = await formDialog({ title: 'Gewichtsschritt', fields: [{ name: 'v', label: 'Kleinste Steigerung in kg (leer = automatisch)', value: x ? increment(x) : 2.5, inputmode: 'decimal' }] });
    if (res) {
      const n = parseFloat(String(res.v).replace(',', '.'));
      await saveExerciseMeta(name, { increment: n > 0 ? n : null });
    }
  }
  if (v === 'rename') {
    const others = allExerciseNames().filter((n) => n !== name).sort((a, b) => a.localeCompare(b, 'de'));
    const res = await formDialog({
      title: 'Umbenennen',
      fields: [{ name: 'to', label: 'Neuer Name (existiert er bereits, werden beide Übungen zusammengeführt)', value: name }],
      okLabel: 'Übernehmen',
    });
    if (!res) return;
    const to = res.to.trim().replace(/\s+/g, ' ');
    if (!to || to === name) return;
    const merge = others.includes(to);
    if (merge && !(await confirmDialog(`„${name}“ wird mit „${to}“ zusammengeführt. Alle Sätze werden übernommen.`, 'Zusammenführen', true))) return;
    const n = await renameExercise(name, to);
    toast(merge ? `Zusammengeführt (${n} Workouts)` : 'Umbenannt');
    location.hash = `#/ex/${encodeURIComponent(to)}`;
  }
}

function aiCard(x) {
  const sg = suggest(x.name);
  if (!sg) return '';
  const range = sg.range ? `Bereich ${sg.range[0]}–${sg.range[1]} Wdh.` : '';
  return `<section class="card ai-card">
    <div class="coach-head"><span class="ai-badge">AI</span><b>Nächste Einheit</b></div>
    <div class="ai-target">${esc(sg.label)}</div>
    <div class="ai-reason">${esc(sg.reason)}</div>
    <div class="ai-sets">${sg.sets.map((s) => `<span class="${s.type === 'warmup' ? 'w' : ''}">${s.type === 'warmup' ? 'W ' : ''}${s.weight != null ? `${num(s.weight)}×` : ''}${s.reps ?? (s.duration ? `${Math.round(s.duration / 60)} min` : '')}</span>`).join('')}</div>
    <small class="muted">${esc(range)}${sg.inc ? ` · Schritt ${num(sg.inc)} kg` : ''} · über ⋯ anpassbar</small>
  </section>`;
}
