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
    <section class="card coach">
      <div class="coach-head"><span class="ai-badge">AI</span><b>Nächstes Training</b><span class="demo-tag sm">DEMO</span></div>
      <div class="coach-when">${esc(nw.whenText)}</div>
      <div class="coach-goal">${esc(nw.goalText)}</div>
      <div class="coach-best">
        <div><small>Empfohlen</small><b>${esc(b.name)}</b><small>Fokus: ${esc(b.focus.join(', '))}${b.lastDone ? ` · zuletzt ${esc(fmtRelDay(b.lastDone))}` : ''}</small></div>
        <div class="ready-pill ${pctCls(b.ready)}">${num(b.ready * 100, 0)} %<small>erholt</small></div>
      </div>
      <button class="btn primary block" data-act="coach-start" data-name="${esc(b.name)}">${icon('play', 'xs')} ${esc(b.name)} starten</button>
      ${nw.list.length > 1 ? `<div class="list-label">Weitere Optionen</div>
        ${nw.list.slice(1, 5).map((c) => `<div class="cand"><span>${esc(c.name)}</span><div class="cand-bar"><i class="${pctCls(c.ready)}" style="width:${Math.round(c.ready * 100)}%"></i></div><b>${num(c.ready * 100, 0)} %</b></div>`).join('')}` : ''}
    </section>
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
