import { state, deleteRoutine, saveRoutine } from '../store.js';
import { pageHead, emptyState } from '../components.js';
import { icon, sheet, confirmDialog } from '../ui.js';
import { esc, fmtRelDay, uid, num } from '../utils.js';
import { startWorkout, editRoutine, logPastWorkout } from '../workout.js';
import { routinesFromHistory, startFromRoutine, repeatWorkout } from '../actions.js';
import { defaultTitle } from './home.js';
import { aiOn, nextWorkout, stagnation } from '../ai.js';
import { bodyMap, mountBodyMaps } from '../bodymap.js';
import { lineChart, SERIES } from '../charts.js';
import { mountPose } from '../poses.js';
import { stageFor } from '../gamification.js';
import { weekStreaks, idx } from '../stats.js';
import { startOfWeek } from '../utils.js';
import { cardioKind, MOBILITY_RE } from '../compete.js';

// Wochenzahlen für die Kacheln
function weekNumbers() {
  const { asc, ex, wStats } = idx();
  const from = startOfWeek(Date.now());
  let cardio = 0, mob = 0, gym = 0;
  for (const x of ex.values()) {
    const ck = cardioKind(x.name, x.type);
    const mb = MOBILITY_RE.test(x.name);
    if (!ck && !mb) continue;
    for (const s of x.sessions) if (s.date >= from) { if (mb) mob += s.duration / 60; else cardio += s.duration / 60; }
  }
  for (const w of asc) if (w.start >= from && wStats.get(w.id)?.volume > 0) gym++;
  return { cardio: Math.round(cardio), mob: Math.round(mob), gym };
}
import { openCardioSetup, openMobilitySetup, hasGuided, resumeGuided } from '../guided.js';
import { coachOn, workoutCoachOn, cardioCoachOn, mobilityCoachOn, ALT, goalW, goalC, goalM } from '../coach/core.js';
import { masterSlot, mountMasters } from '../master.js';
import { openCoachSetup } from '../coach/setup.js';
import { weekPlan, nextSession } from '../coach/plan.js';
import { startPlanned, musclesOf } from './plan.js';
import { WEEKDAYS, weekday } from '../utils.js';

const pctCls = (r) => (r >= 0.8 ? 'good' : r >= 0.5 ? 'warn' : 'crit');

function coachHtml() {
  const nw = nextWorkout();
  if (!nw) return '<div class="card"><p class="footnote">Für Empfehlungen werden ein paar Workouts im Verlauf benötigt.</p></div>';
  const b = nw.best;
  const stag = stagnation();
  const plateaus = stag.filter((s) => s.status !== 'progress');
  const progress = stag.filter((s) => s.status === 'progress');
  const rmVals = Object.fromEntries(Object.entries(nw.readiness).map(([m, v]) => [m, v.readiness]));
  return `
    <section class="card">
      <div class="card-title">Erholung pro Muskel</div>
      <p class="footnote">Modell: Jeder Arbeitssatz ermüdet den Muskel, die Ermüdung baut sich über ca. 2–3 Tage ab.</p>
      ${bodyMap(rmVals, { mode: 'readiness' })}
    </section>
    <section class="card">
      <div class="card-title">Stagnation & Trends</div>
      ${plateaus.length ? plateaus.slice(0, 8).map((s, i) => `
        <div class="stag ${s.status}">
          <a class="stag-head" href="#/ex/${encodeURIComponent(s.x.name)}">
            <div><b>${esc(s.x.name)}</b><small>${s.status === 'decline' ? '▼ Rückläufig' : '■ Stagniert'} · ${s.weeksSincePR >= 1 ? `seit ${Math.round(s.weeksSincePR)} Wochen kein 1RM-Rekord` : 'kürzlich Rekord'} · ${s.pctMonth > 0 ? '+' : ''}${num(s.pctMonth, 1)} %/Monat</small></div>
            <span class="stag-val">${num(s.current, 1)}<small> kg 1RM</small></span>
          </a>
          <div data-stag="${i}"></div>
          <ul class="tips">${s.tips.slice(0, 3).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </div>`).join('') : '<p class="footnote">Keine Stagnation erkannt – weiter so.</p>'}
      ${progress.length ? `<div class="stag-progress">▲ ${progress.length} Übung${progress.length > 1 ? 'en' : ''} im Aufwärtstrend: ${esc(progress.slice(0, 6).map((s) => s.x.name).join(', '))}</div>` : ''}
    </section>`;
}

// Eine Karte für den AI-Coach: Meister-Animation, darunter das nächste Training (nur ein Start-Button)
function coachHero() {
  if (!coachOn()) return '';
  const kinds = [workoutCoachOn() && 'gym', cardioCoachOn() && 'cardio', mobilityCoachOn() && 'mobility'].filter(Boolean);
  const plan = weekPlan();
  const today = weekday(Date.now());
  const dayLabel = (d) => (d === today ? 'heute' : d === today + 1 ? 'morgen' : WEEKDAYS[d]);
  let small = 'Nächstes Training', title = '', sub = '', start = '', bubble = '';
  if (plan.sessions.length) {
    const nx = nextSession(plan);
    if (nx) {
      small += ` · ${dayLabel(nx.day)}`;
      title = nx.kind === 'gym' || nx.kind === 'mobility' ? nx.title : `${ALT[nx.sport].label} · ${nx.title}`;
      sub = nx.kind === 'gym' ? `${nx.exercises.length} Übungen · ${musclesOf(nx)}` : nx.sub;
      start = `<button class="btn primary" data-act="plan-go" data-sid="${esc(nx.id)}">${icon('play', 'xs')} Starten</button>`;
    } else { title = 'Woche geschafft!'; sub = `${plan.doneCount}/${plan.total} Einheiten erledigt – alles Weitere ist Bonus`; }
    const ph = plan.gym?.phase || plan.cardio?.phase;
    bubble = plan.notes.length ? 'Willkommen zurück! Wir starten locker – die Kraft kommt schnell wieder.'
      : nx && nx.day === today ? `Heute wird trainiert! ${ph?.text || ''}`.trim()
        : nx ? 'Heute Ruhetag – auch Erholung macht stark.' : 'Starke Woche! Genieß die Erholung.';
  } else if (workoutCoachOn() && state.workouts.length && nextWorkout()) {
    const nw = nextWorkout();
    title = nw.best.name;
    sub = nw.whenText;
    start = `<button class="btn primary" data-act="coach-start" data-name="${esc(nw.best.name)}">${icon('play', 'xs')} Starten</button>`;
    bubble = 'Leg ein Ziel fest – dann plane ich deine ganze Woche.';
  } else {
    title = 'Ziel festlegen';
    sub = 'Der Coach erstellt daraus deinen Wochenplan';
    start = `<a class="btn primary" href="#/plan">${icon('target', 'xs')} Los geht\'s</a>`;
    bubble = 'Sag mir, wohin du willst – ich zeige dir den Weg.';
  }
  return `<section class="card coach-hero">
    <div class="ch-head"><span class="ai-badge">AI</span><b>AI Coach</b><span class="demo-tag sm">DEMO</span></div>
    <div class="ch-stage n${kinds.length}">
      ${bubble ? `<div class="ch-bubble">${esc(bubble)}</div>` : ''}
      <div class="ch-masters">${kinds.map((k) => (k === 'mobility' ? `<div class="master m-mobility"><div class="master-fig" data-tfig="splits"></div>${kinds.length > 1 ? '<small>Mobility-Meisterin</small>' : ''}</div>` : masterSlot(k, kinds.length > 1))).join('')}</div>
    </div>
    <div class="ch-next"><small>${esc(small)}</small><b>${esc(title)}</b><small>${esc(sub)}</small></div>
    <div class="row-btns">${start}${plan.sessions.length ? '<a class="btn ghost" href="#/plan">Ganze Woche</a>' : ''}</div>
    <button class="link-btn sm plan-edit" data-act="coach-goals">${icon('edit', 'xs')} Ziele & Einstellungen ändern</button>
  </section>`;
}

export function trainingView() {
  const rs = state.routines;
  const ai = aiOn();
  const lastOf = (r) => state.workouts.find((w) => w.routineId === r.id || w.title === r.name);
  const cards = rs.map((r) => {
    const last = lastOf(r);
    const sets = r.exercises.reduce((a, e) => a + e.sets.length, 0);
    return `<div class="card routine-card">
      <div class="rc-head">
        <div><div class="rc-title">${esc(r.name)}</div>
        <div class="rc-sub">${r.exercises.length} Übungen · ${sets} Sätze${last ? ` · zuletzt ${esc(fmtRelDay(last.start))}` : ''}</div></div>
        <button class="icon-btn" data-act="menu" data-id="${esc(r.id)}">${icon('more')}</button>
      </div>
      <div class="rc-list">${esc(r.exercises.map((e) => e.name).join(' · '))}</div>
      <button class="btn primary block" data-act="start-r" data-id="${esc(r.id)}">${icon('play', 'xs')} Routine starten</button>
    </div>`;
  }).join('');

  const stg = stageFor(weekStreaks().current).index;
  const stagData = ai ? stagnation().filter((s) => s.status !== 'progress').slice(0, 8) : [];
  const wk = weekNumbers();

  const html = `
    ${pageHead('Training')}
    ${hasGuided() ? `<button class="card resume-card" data-act="resume">${icon('play')}<div><b>Geführte Einheit fortsetzen</b><small>Deine letzte Cardio-/Mobility-Einheit läuft noch</small></div></button>` : ''}
    <div class="train-tiles">
      <button class="t-tile gym" data-act="gym"><i class="tt-fx"></i><div class="tt-fig" data-tfig="ohp"></div><b>Gym</b><small>Stärker als gestern</small><em>${wk.gym ? `Woche: ${wk.gym}×` : 'Routinen'}</em></button>
      <button class="t-tile cardio" data-act="cardio"><i class="tt-fx"></i><div class="tt-fig" data-tfig="sprint"></div><b>Cardio</b><small>Lauf allen davon</small><em>${wk.cardio ? `Woche: ${wk.cardio} Min.` : 'Intervalle'}</em></button>
      <button class="t-tile mobility" data-act="mobility"><i class="tt-fx"></i><div class="tt-fig" data-tfig="splits"></div><b>Mobility</b><small>Geschmeidig wie ein Ninja</small><em>${wk.mob ? `Woche: ${wk.mob} Min.` : 'Geführt'}</em></button>
    </div>
    ${coachHero()}
    ${ai && state.workouts.length ? coachHtml() : ''}
    <div class="section-row" id="gym-list"><h2 class="section-title">${icon('dumbbell')} Gym-Workouts</h2><button class="link-btn" data-act="new">${icon('plus', 'xs')} Neu</button></div>
    ${rs.length ? cards : emptyState('layers', 'Noch keine Routinen', 'Routinen sind Vorlagen für deine Workouts (z. B. Push, Pull, Beine).',
      `<button class="btn primary" data-act="new">Routine erstellen</button>${state.workouts.length ? '<button class="btn ghost" data-act="auto">Aus Verlauf erstellen</button>' : ''}`)}
    ${rs.length && state.workouts.length ? '<button class="btn ghost block" data-act="auto">Fehlende Routinen aus Verlauf erstellen</button>' : ''}
    <section class="quick bottom">
      <button class="btn primary block lg" data-act="start">${icon('plus')} Leeres Workout starten</button>
      <button class="btn ghost block" data-act="past">${icon('calendar')} Vergangenes Workout nachtragen</button>
    </section>
  `;
  const find = (el) => state.routines.find((r) => r.id === el.dataset.id);
  return {
    html,
    mount: (root) => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      root.querySelectorAll('[data-tfig]').forEach((h) => mountPose(h, h.dataset.tfig, { stage: Math.max(stg, 3), speed: reduce ? 0 : h.dataset.tfig === 'sprint' ? 1 : 0.8 }));
      mountBodyMaps(root);
      mountMasters(root);
      stagData.forEach((s, i) => {
        const host = root.querySelector(`[data-stag="${i}"]`);
        if (host) lineChart(host, { series: [{ name: '1RM', points: s.series.map((q) => ({ x: q.date, y: q.bestE1rm })), color: s.status === 'decline' ? SERIES[7] : SERIES[3] }], height: 60, mini: true, yFmt: (v) => `${num(v, 1)} kg` });
      });
    },
    handlers: {
      start: () => startWorkout({ title: defaultTitle() }),
      gym: () => document.getElementById('gym-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      past: () => logPastWorkout(),
      new: () => editRoutine(null),
      auto: () => routinesFromHistory(),
      cardio: () => openCardioSetup(),
      mobility: () => openMobilitySetup(),
      resume: () => resumeGuided(),
      'plan-go': (el) => startPlanned(nextSession()),
      'coach-goals': async () => {
        const opts = [];
        if (state.settings.aiWorkout) opts.push({ label: goalW() ? 'Workout-Ziel ändern' : 'Workout-Ziel festlegen', value: 'workout', icon: 'dumbbell' });
        if (state.settings.aiCardio) opts.push({ label: goalC() ? 'Cardio-Ziel ändern' : 'Cardio-Ziel festlegen', value: 'cardio', icon: 'bolt' });
        if (state.settings.aiMobility) opts.push({ label: goalM() ? 'Mobility-Ziel ändern' : 'Mobility-Ziel festlegen', value: 'mobility', icon: 'repeat' });
        opts.push({ label: 'Körperdaten', value: 'body', icon: 'user' });
        const v = await sheet({ title: 'AI-Coach', options: opts });
        if (v) openCoachSetup(v);
      },
      'coach-start': (el) => {
        const name = el.dataset.name;
        const r = state.routines.find((x) => x.name === name);
        if (r) return startFromRoutine(r);
        const w = state.workouts.find((x) => x.title === name);
        if (w) return repeatWorkout(w);
        return startWorkout({ title: name });
      },
      'start-r': (el) => startFromRoutine(find(el)),
      menu: async (el) => {
        const r = find(el);
        const v = await sheet({
          title: r.name,
          options: [
            { label: 'Bearbeiten', value: 'edit', icon: 'edit' },
            { label: 'Duplizieren', value: 'dup', icon: 'copy' },
            { label: 'Löschen', value: 'del', icon: 'trash', danger: true },
          ],
        });
        if (v === 'edit') editRoutine(r);
        if (v === 'dup') await saveRoutine({ ...structuredClone(r), id: uid(), name: `${r.name} (Kopie)` });
        if (v === 'del' && await confirmDialog(`Routine „${r.name}“ löschen?`, 'Löschen', true)) await deleteRoutine(r.id);
      },
    },
  };
}
