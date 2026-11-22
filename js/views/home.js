import { state } from '../store.js';
import { idx } from '../stats.js';
import { workoutCard } from '../components.js';
import { icon } from '../ui.js';
import { esc, fmtVolume, startOfWeek, weekday, WEEKDAYS, fmtDate, fmtDurShort, num } from '../utils.js';
import { startWorkout } from '../workout.js';
import { importCSVFlow, startFromRoutine } from '../actions.js';
import { fighterFx } from '../fighter.js';
import { nav } from '../nav.js';
import { profileStats, achievements, STAGES } from '../gamification.js';
import { weeklyGoals, openGoalEditor } from '../goals.js';
import { aiOn, nextWorkout } from '../ai.js';
import { openAvatarEditor } from '../avatar.js';

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
  const P = profileStats();
  const st = P.st;
  const stage = P.stage;
  const goal = st.goal;
  const today = weekday(now);

  // Streak-Status dieser Woche
  let alert = '';
  if (ws.length) {
    if (st.thisDone) alert = `<div class="streak-alert ok">${icon('check', 'xs')} Wochenziel erreicht – deine Streak wächst auf <b>${st.current}</b> Wochen!</div>`;
    else if (st.needed > st.daysLeft) alert = `<div class="streak-alert lost">${icon('x', 'xs')} Diese Woche ist das Ziel nicht mehr erreichbar (${st.thisCount}/${goal}). Nächste Woche neu angreifen!</div>`;
    else if (st.needed === st.daysLeft) alert = `<div class="streak-alert danger">${icon('flame', 'xs')} Streak in Gefahr! Noch <b>${st.needed}</b> Workout${st.needed > 1 ? 's' : ''} in ${st.daysLeft} Tag${st.daysLeft > 1 ? 'en' : ''} – jeden Tag zählt.</div>`;
    else alert = `<div class="streak-alert info">${icon('flame', 'xs')} Noch <b>${st.needed}</b> Workout${st.needed > 1 ? 's' : ''} in ${st.daysLeft} Tagen, um deine Streak zu halten.</div>`;
  }

  const hero = ws.length ? `<section class="card hero st${stage.index}">
      <button class="hero-fig" data-act="avatar" aria-label="Kämpfer anpassen">${fighterFx(stage.index, { enter: nav.entering })}</button>
      <div class="hero-info">
        <small>Stufe ${stage.index + 1}/${STAGES.length}</small>
        <h3>${esc(stage.name)}</h3>
        <div class="hero-streak">${icon('flame')}<b>${st.current}</b><span>Wochen Streak</span></div>
        ${stage.next ? `<div class="hero-next"><div class="bar"><i style="width:${Math.round(stage.progress * 100)}%"></i></div><small>Noch ${stage.toNext} Woche${stage.toNext > 1 ? 'n' : ''} bis <b>${esc(stage.next.name)}</b></small></div>` : '<small class="hero-max">Höchste Stufe erreicht</small>'}
        <div class="hero-power"><small>Kampfkraft</small><b>${num(P.power, 0)}</b>${P.power > 9000 ? '<span class="over9000">ÜBER 9000!</span>' : ''}</div>
      </div>
      <a class="hero-level" href="#/badges"><span>Lvl ${P.level}</span><div class="bar"><i style="width:${Math.round(P.levelProgress * 100)}%"></i></div></a>
    </section>` : '';

  const installHint = !isStandalone() ? `<div class="card hint">
      <div class="card-title">${icon('download')} App installieren</div>
      <p>Öffne diese Seite in <b>Safari</b>, tippe auf <b>Teilen</b> ${icon('share', 'xs')} und dann auf <b>„Zum Home-Bildschirm“</b>. So läuft Gym wie eine echte App – auch offline.</p>
    </div>` : '';

  const onboarding = !ws.length ? `<div class="card onboarding">
      <h3>Willkommen im Gym</h3>
      <p>Importiere deine bisherigen Workouts als CSV, damit deine komplette Historie in den Statistiken auftaucht.</p>
      <button class="btn primary block" data-act="import">${icon('upload')} CSV importieren</button>
      <button class="btn ghost block" data-act="start">${icon('plus')} Erstes Workout starten</button>
    </div>` : '';

  const goals = ws.length ? weeklyGoals() : [];
  const goalsHtml = goals.length ? `<section class="card">
      <div class="card-title">Wochenziele <small>${goals.filter((q) => q.value >= q.target).length}/${goals.length} erreicht</small><button class="link-btn sm" data-act="goals">${icon('edit', 'xs')}</button></div>
      ${goals.map((q) => {
        const done = q.value >= q.target;
        return `<div class="quest ${done ? 'done' : ''}">
          <span class="q-ic">${icon(done ? 'check' : q.icon)}</span>
          <div class="q-main"><div class="q-top"><b>${esc(q.title)}</b>${q.streak ? '<span>Streak</span>' : ''}</div>
          <div class="bar"><i style="width:${Math.min(100, (q.value / q.target) * 100)}%"></i></div>
          <small>${esc(q.text)}</small></div>
        </div>`;
      }).join('')}
    </section>` : '';

  let coach = '';
  if (aiOn() && ws.length) {
    const nw = nextWorkout();
    if (nw) coach = `<a class="card coach-mini" href="#/training">
      <span class="ai-badge">AI</span>
      <div><b>Empfehlung: ${esc(nw.best.name)}</b><small>${esc(nw.whenText)}</small></div>${icon('right', 'muted')}</a>`;
  }

  const ach = ws.length ? achievements() : [];
  const achDone = ach.filter((a) => a.done);

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
    <div class="home-top"></div>
    ${onboarding}
    ${hero}
    ${ws.length ? `<section class="card week-card">
      <div class="week-top">
        <div><small>Diese Woche</small><div class="week-count"><b>${thisWeek.length}</b><span>/ ${goal} Workouts</span></div></div>
        <div class="week-meta col"><span>${icon('weight', 'xs')} ${fmtVolume(vol)}</span><span>${icon('clock', 'xs')} ${fmtDurShort(dur)}</span></div>
      </div>
      <div class="week-dots">${WEEKDAYS.map((d, i) => `<div class="wd ${days.has(i) ? 'on' : ''} ${i === today ? 'today' : ''}"><i>${days.has(i) ? icon('check') : ''}</i><span>${d}</span></div>`).join('')}</div>
      <div class="week-bar"><i style="width:${Math.min(100, (thisWeek.length / goal) * 100)}%"></i></div>
      ${alert}
    </section>` : ''}
    ${coach}
    <section class="quick">
      <button class="btn primary block lg" data-act="start">${icon('plus')} Leeres Workout starten</button>
      ${routines ? `<div class="quick-row">${routines}</div>` : ''}
    </section>
    ${goalsHtml}
    ${ach.length ? `<a class="card badge-teaser" href="#/badges">
      <div class="bt-icons">${achDone.slice(-4).map((a) => `<span>${icon(a.icon)}</span>`).join('')}</div>
      <div><b>Abzeichen</b><small>${achDone.length} von ${ach.length} freigeschaltet</small></div>${icon('right', 'muted')}</a>` : ''}
    ${installHint}
    ${ws.length ? `<h2 class="section-title">Verlauf</h2>${feed}${more}` : ''}
  `;
  return {
    html,
    handlers: {
      start: () => startWorkout({ title: defaultTitle() }),
      import: importCSVFlow,
      goals: () => openGoalEditor(),
      avatar: () => openAvatarEditor(),
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
