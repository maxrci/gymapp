import { state, deleteRoutine, saveRoutine } from '../store.js';
import { pageHead, emptyState } from '../components.js';
import { icon, sheet, confirmDialog } from '../ui.js';
import { esc, fmtRelDay, uid } from '../utils.js';
import { startWorkout, editRoutine, logPastWorkout } from '../workout.js';
import { routinesFromHistory, startFromRoutine } from '../actions.js';
import { defaultTitle } from './home.js';

export function trainingView() {
  const rs = state.routines;
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

  const html = `
    ${pageHead('Training')}
    <section class="quick">
      <button class="btn primary block lg" data-act="start">${icon('plus')} Leeres Workout starten</button>
      <button class="btn ghost block" data-act="past">${icon('calendar')} Vergangenes Workout nachtragen</button>
    </section>
    <div class="section-row"><h2 class="section-title">Routinen</h2><button class="link-btn" data-act="new">${icon('plus', 'xs')} Neu</button></div>
    ${rs.length ? cards : emptyState('layers', 'Noch keine Routinen', 'Routinen sind Vorlagen für deine Workouts (z. B. Push, Pull, Beine).',
      `<button class="btn primary" data-act="new">Routine erstellen</button>${state.workouts.length ? '<button class="btn ghost" data-act="auto">Aus Verlauf erstellen</button>' : ''}`)}
    ${rs.length && state.workouts.length ? '<button class="btn ghost block" data-act="auto">Fehlende Routinen aus Verlauf erstellen</button>' : ''}
  `;
  const find = (el) => state.routines.find((r) => r.id === el.dataset.id);
  return {
    html,
    handlers: {
      start: () => startWorkout({ title: defaultTitle() }),
      past: () => logPastWorkout(),
      new: () => editRoutine(null),
      auto: () => routinesFromHistory(),
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
