// Verlauf: alle Workouts finden (Suche, Art, Kalender) und schnell löschen (wischen, mit Rückgängig)

import { state, deleteWorkout, saveWorkout, exerciseMeta } from '../store.js';
import { idx } from '../stats.js';
import { pageHead, emptyState } from '../components.js';
import { icon, toastAction } from '../ui.js';
import { esc, fmtDate, fmtTime, fmtDurShort, fmtVolume } from '../utils.js';
import { cardioKind, MOBILITY_RE } from '../compete.js';
import { swipeToDelete } from '../swipe.js';

const KINDS = [['all', 'Alle'], ['gym', 'Kraft'], ['cardio', 'Cardio'], ['mob', 'Mobility']];
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
// Zustand bleibt beim Zurückkommen erhalten
const ui = { q: '', kind: 'all', cal: 'month', anchor: null, day: null };

function kindOf(w) {
  let c = 0, m = 0;
  for (const e of w.exercises) {
    if (MOBILITY_RE.test(e.name)) m++;
    else if (cardioKind(e.name, exerciseMeta(e.name).type)) c++;
  }
  const g = w.exercises.length - c - m;
  return g >= c && g >= m && g > 0 ? 'gym' : c >= m ? 'cardio' : 'mob';
}
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const monthStart = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

function matches(w) {
  if (ui.kind !== 'all' && kindOf(w) !== ui.kind) return false;
  if (ui.day && dayKey(w.start) !== ui.day) return false;
  const q = ui.q.trim().toLowerCase();
  if (!q) return true;
  return w.title.toLowerCase().includes(q) || w.exercises.some((e) => e.name.toLowerCase().includes(q)) || fmtDate(w.start, { day: 'numeric', month: 'long', year: 'numeric' }).toLowerCase().includes(q);
}

function row(w, wStats) {
  const s = wStats.get(w.id) || {};
  const k = kindOf(w);
  const ex = w.exercises.slice(0, 3).map((e) => e.name).join(', ') + (w.exercises.length > 3 ? ` +${w.exercises.length - 3}` : '');
  return `<a class="h-row" href="#/w/${esc(w.id)}" data-wid="${esc(w.id)}">
    <span class="h-ic k-${k}">${icon(k === 'cardio' ? 'bolt' : k === 'mob' ? 'repeat' : 'dumbbell')}</span>
    <span class="h-main"><b>${esc(w.title)}</b><small>${esc(ex || 'Keine Übungen')}</small></span>
    <span class="h-side"><b>${esc(fmtDate(w.start, { day: 'numeric', month: 'short' }))}</b><small>${esc(fmtTime(w.start))} · ${esc(fmtDurShort(s.duration))}${s.volume ? ` · ${esc(fmtVolume(s.volume))}` : ''}</small></span>
    ${w.source === 'strava' ? '<span class="h-src">Strava</span>' : w.source === 'import' ? '<span class="h-src">Import</span>' : ''}
  </a>`;
}

const CAL = [['week', 'Woche'], ['month', 'Monat'], ['year', 'Jahr']];
const startOfWeekTs = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const isoWeekNo = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const y = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - y) / 864e5 - 3 + ((y.getDay() + 6) % 7)) / 7); };
// Zeitraum, der gerade im Kalender zu sehen ist
function period() {
  const a = ui.anchor ?? Date.now();
  const d = new Date(a);
  if (ui.cal === 'week') { const f = startOfWeekTs(a); return { from: f, to: f + 7 * 864e5 }; }
  if (ui.cal === 'year') return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: new Date(d.getFullYear() + 1, 0, 1).getTime() };
  return { from: monthStart(a), to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() };
}
function shift(dir) {
  const d = new Date(ui.anchor ?? Date.now());
  if (ui.cal === 'week') d.setDate(d.getDate() + 7 * dir);
  else if (ui.cal === 'year') d.setFullYear(d.getFullYear() + dir, 0, 1);
  else d.setMonth(d.getMonth() + dir, 1);
  ui.anchor = d.getTime();
}
function calendar(ws) {
  const { from, to } = period();
  const counts = new Map();
  for (const w of ws) if (w.start >= from && w.start < to) { const k = dayKey(w.start); counts.set(k, (counts.get(k) || 0) + 1); }
  const today = dayKey(Date.now());
  const nextOk = to <= Date.now() ? true : false;
  const dayBtn = (t, label) => {
    const k = dayKey(t);
    const n = counts.get(k) || 0;
    return `<button class="hc-d ${n ? 'on' : ''} ${k === today ? 'today' : ''} ${ui.day === k ? 'sel' : ''}" data-day="${k}" ${n ? '' : 'disabled'}>${label}${n > 1 ? `<i>${n}</i>` : ''}</button>`;
  };
  let title = '', body = '';
  if (ui.cal === 'week') {
    const end = new Date(to - 1);
    title = `KW ${isoWeekNo(from)} · ${fmtDate(from, { day: 'numeric', month: 'short' })} – ${fmtDate(end.getTime(), { day: 'numeric', month: 'short', year: 'numeric' })}`;
    body = `<div class="hc-grid">${WD.map((w) => `<span class="hc-wd">${w}</span>`).join('')}${Array.from({ length: 7 }, (_, i) => { const t = new Date(from); t.setDate(t.getDate() + i); return dayBtn(t.getTime(), t.getDate()); }).join('')}</div>`;
  } else if (ui.cal === 'year') {
    const y = new Date(from).getFullYear();
    title = String(y);
    const perM = Array(12).fill(0);
    for (const w of ws) if (w.start >= from && w.start < to) perM[new Date(w.start).getMonth()]++;
    const max = Math.max(1, ...perM);
    body = `<div class="hc-year">${perM.map((n, m) => `<button class="hc-m ${n ? 'on' : ''}" data-ym="${new Date(y, m, 1).getTime()}" style="--a:${n ? 0.25 + 0.75 * (n / max) : 0}"><b>${esc(fmtDate(new Date(y, m, 1).getTime(), { month: 'short' }))}</b><small>${n || '–'}</small></button>`).join('')}</div>
      <p class="hc-sum">${perM.reduce((a, b) => a + b, 0)} Workouts in ${y}</p>`;
  } else {
    const d0 = new Date(from);
    title = fmtDate(from, { month: 'long', year: 'numeric' });
    const first = (d0.getDay() + 6) % 7;
    const days = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) cells += dayBtn(new Date(d0.getFullYear(), d0.getMonth(), d).getTime(), d);
    body = `<div class="hc-grid">${WD.map((w) => `<span class="hc-wd">${w}</span>`).join('')}${cells}</div>`;
  }
  return `<section class="card h-cal">
    <div class="seg hc-mode">${CAL.map(([k, l]) => `<button class="seg-btn ${ui.cal === k ? 'on' : ''}" data-cal="${k}">${l}</button>`).join('')}</div>
    <div class="hc-head"><button class="icon-btn" data-mon="-1" aria-label="Zurück">${icon('left')}</button><b>${esc(title)}</b><button class="icon-btn" data-mon="1" ${nextOk ? '' : 'disabled'} aria-label="Weiter">${icon('right')}</button></div>
    ${body}
    ${ui.day ? '<button class="btn ghost sm block" data-day="">Alle Tage zeigen</button>' : ''}
  </section>`;
}

function listHtml() {
  const { wStats } = idx();
  const list = state.workouts.filter(matches);
  if (!list.length) return emptyState('search', 'Nichts gefunden', ui.q ? `Kein Workout passt zu „${esc(ui.q)}“.` : 'Für diese Auswahl gibt es keine Workouts.');
  let out = '', lastM = '';
  for (const w of list.slice(0, 300)) {
    const mm = fmtDate(w.start, { month: 'long', year: 'numeric' });
    if (mm !== lastM) { out += `<div class="list-label">${esc(mm)}</div>`; lastM = mm; }
    out += row(w, wStats);
  }
  if (list.length > 300) out += `<p class="footnote">${list.length - 300} ältere – Suche oder Kalender nutzen.</p>`;
  return `<p class="h-count">${list.length} Workout${list.length === 1 ? '' : 's'}</p><div class="h-list">${out}</div>`;
}

export function historyView() {
  const ws = state.workouts;
  if (!ws.length) return { html: pageHead('Verlauf', { back: '#/' }) + emptyState('clock', 'Noch keine Workouts', 'Sobald du trainierst, findest du hier alles wieder.') };
  return {
    html: `${pageHead('Verlauf', { back: '#/' })}
      <div class="h-search">${icon('search', 'xs')}<input type="search" data-q placeholder="Übung, Titel oder Datum suchen" value="${esc(ui.q)}" autocomplete="off"></div>
      <div class="chips">${KINDS.map(([k, l]) => `<button class="chip ${ui.kind === k ? 'on' : ''}" data-kind="${k}">${l}</button>`).join('')}</div>
      ${calendar(ws)}
      <div data-hlist>${listHtml()}</div>
      <p class="footnote">Tipp: Ein Workout nach links wischen, um es zu löschen.</p>`,
    mount: (root) => {
      const inp = root.querySelector('[data-q]');
      const box = root.querySelector('[data-hlist]');
      let t = null;
      inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { ui.q = inp.value; box.innerHTML = listHtml(); }, 120); });
      swipeToDelete(box, '.h-row', async (el) => {
        const w = state.workouts.find((x) => x.id === el.dataset.wid);
        if (!w) return;
        const copy = structuredClone(w);
        await deleteWorkout(w.id);
        toastAction(`„${w.title}“ gelöscht`, 'Rückgängig', () => saveWorkout(copy));
      });
    },
    clicks: {
      kind: (el, rr) => { ui.kind = el.dataset.kind; rr(); },
      mon: (el, rr) => { shift(Number(el.dataset.mon)); ui.day = null; rr(); },
      cal: (el, rr) => { ui.cal = el.dataset.cal; ui.day = null; rr(); },
      ym: (el, rr) => { ui.cal = 'month'; ui.anchor = Number(el.dataset.ym); ui.day = null; rr(); },
      day: (el, rr) => { ui.day = el.dataset.day || null; rr(); },
    },
  };
}
