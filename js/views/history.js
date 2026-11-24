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
const ui = { q: '', kind: 'all', month: null, day: null };

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

function calendar(ws) {
  const m = ui.month ?? monthStart(Date.now());
  const d0 = new Date(m);
  const first = (d0.getDay() + 6) % 7;
  const days = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  const has = new Map();
  for (const w of ws) if (monthStart(w.start) === m) { const k = dayKey(w.start); has.set(k, (has.get(k) || 0) + 1); }
  const today = dayKey(Date.now());
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const k = `${d0.getFullYear()}-${d0.getMonth()}-${d}`;
    cells += `<button class="hc-d ${has.has(k) ? 'on' : ''} ${k === today ? 'today' : ''} ${ui.day === k ? 'sel' : ''}" data-day="${k}" ${has.has(k) ? '' : 'disabled'}>${d}${has.get(k) > 1 ? `<i>${has.get(k)}</i>` : ''}</button>`;
  }
  const nextOk = m < monthStart(Date.now());
  return `<section class="card h-cal">
    <div class="hc-head"><button class="icon-btn" data-mon="-1" aria-label="Vormonat">${icon('left')}</button><b>${esc(fmtDate(m, { month: 'long', year: 'numeric' }))}</b><button class="icon-btn" data-mon="1" ${nextOk ? '' : 'disabled'} aria-label="Nächster Monat">${icon('right')}</button></div>
    <div class="hc-grid">${WD.map((w) => `<span class="hc-wd">${w}</span>`).join('')}${cells}</div>
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
      mon: (el, rr) => { const d = new Date(ui.month ?? monthStart(Date.now())); ui.month = new Date(d.getFullYear(), d.getMonth() + Number(el.dataset.mon), 1).getTime(); ui.day = null; rr(); },
      day: (el, rr) => { ui.day = el.dataset.day || null; rr(); },
    },
  };
}
