import { state } from '../store.js';
import { idx, weekStreaks } from '../stats.js';
import { pageHead, workoutCard, emptyState } from '../components.js';
import { icon } from '../ui.js';
import { esc, fmtVolume, startOfWeek, addDays, weekday, WEEKDAYS, fmtDate, startOfDay, fmtDurShort } from '../utils.js';
import { startWorkout } from '../workout.js';
import { importCSVFlow, startFromRoutine } from '../actions.js';

let limit = 15;

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

export function homeView() {
  const ws = state.workouts;
  const { wStats } = idx();
  const now = Date.now();
  const wk = startOfWeek(now);
  const thisWeek = ws.filter((w) => w.start >= wk);
  const days = new Set(thisWeek.map((w) => weekday(w.start)));
  const vol = thisWeek.reduce((a, w) => a + (wStats.get(w.id)?.volume || 0), 0);
  const dur = thisWeek.reduce((a, w) => a + (wStats.get(w.id)?.duration || 0), 0);
  const st = weekStreaks();
  const goal = state.settings.weekGoal || 4;
  const today = weekday(now);
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';

  const installHint = !isStandalone() ? `<div class="card hint">
      <div class="card-title">${icon('download')} App installieren</div>
      <p>Öffne diese Seite in <b>Safari</b>, tippe auf <b>Teilen</b> ${icon('share', 'xs')} und dann auf <b>„Zum Home-Bildschirm“</b>. So läuft GymLog wie eine echte App – auch offline.</p>
    </div>` : '';

  const onboarding = !ws.length ? `<div class="card onboarding">
      <h3>Willkommen bei GymLog 👋</h3>
      <p>Importiere deine bisherigen Workouts als CSV, damit deine komplette Historie in den Statistiken auftaucht.</p>
      <button class="btn primary block" data-act="import">${icon('upload')} CSV importieren</button>
      <button class="btn ghost block" data-act="start">${icon('plus')} Erstes Workout starten</button>
    </div>` : '';

  // Feed mit Monats-Trennern
  let feed = '';
  let lastM = '';
  for (const w of ws.slice(0, limit)) {
    const m = fmtDate(w.start, { month: 'long', year: 'numeric' });
    if (m !== lastM) { feed += `<div class="list-label">${esc(m)}</div>`; lastM = m; }
    feed += workoutCard(w);
  }
  const more = ws.length > limit ? `<button class="btn ghost block" data-act="more">Weitere Workouts laden (${ws.length - limit})</button>` : '';

  const routines = state.routines.slice(0, 8).map((r) => `<button class="quick-chip" data-act="routine" data-id="${esc(r.id)}">${icon('play', 'xs')} ${esc(r.name)}</button>`).join('');

  const html = `
    ${pageHead(`${greet}!`, { sub: esc(fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' })) })}
    ${onboarding}
    ${ws.length ? `<section class="card week-card">
      <div class="week-top">
        <div><small>Diese Woche</small><div class="week-count"><b>${thisWeek.length}</b><span>/ ${goal} Workouts</span></div></div>
        <div class="streak">${icon('flame')}<div><b>${st.current}</b><small>Wochen in Folge</small></div></div>
      </div>
      <div class="week-dots">${WEEKDAYS.map((d, i) => `<div class="wd ${days.has(i) ? 'on' : ''} ${i === today ? 'today' : ''}"><i>${days.has(i) ? icon('check') : ''}</i><span>${d}</span></div>`).join('')}</div>
      <div class="week-bar"><i style="width:${Math.min(100, (thisWeek.length / goal) * 100)}%"></i></div>
      <div class="week-meta"><span>${icon('weight', 'xs')} ${fmtVolume(vol)}</span><span>${icon('clock', 'xs')} ${fmtDurShort(dur)}</span></div>
    </section>` : ''}
    <section class="quick">
      <button class="btn primary block lg" data-act="start">${icon('plus')} Leeres Workout starten</button>
      ${routines ? `<div class="quick-row">${routines}</div>` : ''}
    </section>
    ${installHint}
    ${ws.length ? `<h2 class="section-title">Verlauf</h2>${feed}${more}` : ''}
  `;
  return {
    html,
    handlers: {
      start: () => startWorkout({ title: defaultTitle() }),
      import: importCSVFlow,
      more: (_, rerender) => { limit += 20; rerender(); },
      routine: (el) => {
        const r = state.routines.find((x) => x.id === el.dataset.id);
        if (r) startFromRoutine(r);
      },
    },
  };
}

export function defaultTitle() {
  const h = new Date().getHours();
  return h < 11 ? 'Morgen-Workout' : h < 17 ? 'Nachmittags-Workout' : 'Abend-Workout';
}
