import { state, deleteRoutine, saveRoutine, saveSettings } from '../store.js';
import { pageHead, emptyState } from '../components.js';
import { icon, sheet, confirmDialog } from '../ui.js';
import { esc, fmtRelDay, uid, num } from '../utils.js';
import { startWorkout, editRoutine, logPastWorkout } from '../workout.js';
import { routinesFromHistory, startFromRoutine, repeatWorkout } from '../actions.js';
import { defaultTitle } from './home.js';
import { aiOn, nextWorkout, stagnation } from '../ai.js';
import { bodyMap, mountBodyMaps } from '../bodymap.js';
import { lineChart, SERIES } from '../charts.js';
import { poseSVG } from '../poses.js';
import { stageFor } from '../gamification.js';
import { weekStreaks } from '../stats.js';
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
      <div class="coach-head"><span class="ai-badge">AI</span><b>Nächstes Training</b></div>
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

  const html = `
    ${pageHead('Training')}
    ${hasGuided() ? `<button class="card resume-card" data-act="resume">${icon('play')}<div><b>Geführte Einheit fortsetzen</b><small>Deine letzte Cardio-/Mobility-Einheit läuft noch</small></div></button>` : ''}
    <label class="card ai-toggle ${ai ? 'on' : ''}">
      <span class="ai-badge lg">AI</span>
      <div><b>AI-Mode</b><small>${ai ? 'Aktiv: Gewichts- & Wiederholungsvorschläge, Erholung, Stagnation' : 'Aus – keine Vorschläge oder Analysen'}</small></div>
      <input type="checkbox" class="switch" data-ai ${ai ? 'checked' : ''}>
    </label>
    ${ai && state.workouts.length ? coachHtml() : ''}
    <section class="quick">
      <button class="btn primary block lg" data-act="start">${icon('plus')} Leeres Workout starten</button>
      <button class="btn ghost block" data-act="past">${icon('calendar')} Vergangenes Workout nachtragen</button>
    </section>
    <h2 class="section-title">Geführt</h2>
    <div class="guided-grid">
      <button class="guided-tile cardio" data-act="cardio"><div class="gt-fig">${poseSVG('run', { stage: stg, t: 0.2 })}</div><b>Cardio</b><small>Intervalle & Grundlage</small></button>
      <button class="guided-tile mobility" data-act="mobility"><div class="gt-fig">${poseSVG('wgs', { stage: stg, t: 0.5 })}</div><b>Mobility</b><small>Geführte Routinen</small></button>
    </div>
    <div class="section-row"><h2 class="section-title">Routinen</h2><button class="link-btn" data-act="new">${icon('plus', 'xs')} Neu</button></div>
    ${rs.length ? cards : emptyState('layers', 'Noch keine Routinen', 'Routinen sind Vorlagen für deine Workouts (z. B. Push, Pull, Beine).',
      `<button class="btn primary" data-act="new">Routine erstellen</button>${state.workouts.length ? '<button class="btn ghost" data-act="auto">Aus Verlauf erstellen</button>' : ''}`)}
    ${rs.length && state.workouts.length ? '<button class="btn ghost block" data-act="auto">Fehlende Routinen aus Verlauf erstellen</button>' : ''}
  `;
  const find = (el) => state.routines.find((r) => r.id === el.dataset.id);
  return {
    html,
    mount: (root) => {
      root.querySelector('[data-ai]')?.addEventListener('change', (e) => saveSettings({ aiMode: e.target.checked }));
      mountBodyMaps(root);
      stagData.forEach((s, i) => {
        const host = root.querySelector(`[data-stag="${i}"]`);
        if (host) lineChart(host, { series: [{ name: '1RM', points: s.series.map((q) => ({ x: q.date, y: q.bestE1rm })), color: s.status === 'decline' ? SERIES[7] : SERIES[3] }], height: 60, mini: true, yFmt: (v) => `${num(v, 1)} kg` });
      });
    },
    handlers: {
      start: () => startWorkout({ title: defaultTitle() }),
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
