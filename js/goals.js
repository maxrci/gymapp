// Eigene Wochenziele: frei definierbar, Fortschritt für die laufende Woche

import { state, saveSettings, allExerciseNames } from './store.js';
import { idx } from './stats.js';
import { MUSCLES } from './library.js';
import { icon, overlay, sheet, formDialog, confirmDialog } from './ui.js';
import { esc, num, uid, startOfWeek, startOfDay, sum, fmtVolume, parseNum } from './utils.js';

// Zieltypen: label, Einheit, Icon, Formatierung, Berechnung (Workouts dieser Woche)
export const GOAL_TYPES = {
  workouts: { label: 'Workouts', unit: 'Workouts', icon: 'dumbbell', def: 4 },
  days: { label: 'Trainingstage', unit: 'Tage', icon: 'calendar', def: 3 },
  volume: { label: 'Volumen', unit: 'kg', icon: 'weight', def: 25000, fmt: fmtVolume },
  sets: { label: 'Arbeitssätze gesamt', unit: 'Sätze', icon: 'layers', def: 60 },
  muscle: { label: 'Sätze für eine Muskelgruppe', unit: 'Sätze', icon: 'target', def: 10, needs: 'muscle' },
  exercise: { label: 'Bestimmte Übung', unit: 'Einheiten', icon: 'repeat', def: 2, needs: 'exercise' },
  minutes: { label: 'Trainingszeit', unit: 'Minuten', icon: 'clock', def: 240 },
  prs: { label: 'Neue Rekorde', unit: 'Rekorde', icon: 'trophy', def: 1 },
  cardioKm: { label: 'Cardio-Distanz', unit: 'km', icon: 'bolt', def: 10, dec: 1 },
  cardioMin: { label: 'Cardio-Zeit', unit: 'Minuten', icon: 'bolt', def: 60 },
  mobility: { label: 'Mobility-Einheiten', unit: 'Einheiten', icon: 'repeat', def: 2 },
};

const DEFAULT_GOALS = () => [
  { id: 'g-workouts', type: 'workouts' },
  { id: uid(), type: 'prs', target: 1 },
  { id: uid(), type: 'minutes', target: 240 },
];

export function goalList() {
  const list = Array.isArray(state.settings.weekGoals) ? state.settings.weekGoals : DEFAULT_GOALS();
  // Das Workout-Ziel (zählt für die Streak) ist immer dabei und hängt am Wochenziel
  if (!list.some((g) => g.type === 'workouts')) list.unshift({ id: 'g-workouts', type: 'workouts' });
  return list.map((g) => (g.type === 'workouts' ? { ...g, target: state.settings.weekGoal || 4 } : g));
}

export function goalTitle(g) {
  const T = GOAL_TYPES[g.type];
  if (g.type === 'muscle') return `${g.muscle}: Sätze`;
  if (g.type === 'exercise') return g.exercise;
  return T.label;
}

export function weeklyGoals() {
  const { asc, wStats, ex } = idx();
  const wk = startOfWeek(Date.now());
  const week = asc.filter((w) => w.start >= wk);
  const ids = new Set(week.map((w) => w.id));
  const isMob = (w) => w.exercises.some((e) => e.name === 'Mobility');
  const cardioSessions = [...ex.values()].filter((x) => x.type === 'cardio' || (x.type === 'duration' && x.name !== 'Mobility'))
    .flatMap((x) => x.sessions.filter((s) => ids.has(s.wid)));
  const value = (g) => {
    switch (g.type) {
      case 'workouts': return week.length;
      case 'days': return new Set(week.map((w) => startOfDay(w.start))).size;
      case 'volume': return sum(week, (w) => wStats.get(w.id).volume);
      case 'sets': return sum(week, (w) => wStats.get(w.id).sets);
      case 'muscle': return sum(week, (w) => wStats.get(w.id).muscles[g.muscle] || 0);
      case 'exercise': return week.filter((w) => w.exercises.some((e) => e.name === g.exercise)).length;
      case 'minutes': return sum(week, (w) => wStats.get(w.id).duration) / 60;
      case 'prs': return sum(week, (w) => wStats.get(w.id).prs.filter((p) => p.kind !== 'sessionVolume').length);
      case 'cardioKm': return sum(cardioSessions, (s) => s.distance);
      case 'cardioMin': return sum(cardioSessions, (s) => s.duration) / 60;
      case 'mobility': return week.filter(isMob).length;
      default: return 0;
    }
  };
  return goalList().filter((g) => GOAL_TYPES[g.type]).map((g) => {
    const T = GOAL_TYPES[g.type];
    const f = T.fmt || ((v) => `${num(v, T.dec || 0)} ${T.unit}`);
    const v = value(g);
    const shown = Math.min(v, g.target);
    const text = T.fmt ? `${T.fmt(shown)} / ${T.fmt(g.target)}` : `${num(shown, T.dec || 0)} / ${num(g.target, T.dec || 0)} ${T.unit}`;
    return { ...g, title: goalTitle(g), icon: T.icon, value: v, fmt: f, text, streak: g.type === 'workouts' };
  });
}

// ---------- Bearbeiten ----------
async function save(list) {
  await saveSettings({ weekGoals: list.map(({ id, type, target, muscle, exercise }) => ({ id, type, target, muscle, exercise })) });
}

async function goalDialog(g) {
  const T = GOAL_TYPES[g.type];
  const fields = [];
  if (T.needs === 'muscle') {
    fields.push({ name: 'muscle', label: 'Muskelgruppe', type: 'select', value: g.muscle || 'Brust', options: MUSCLES.filter((m) => !['Cardio', 'Sonstiges', 'Ganzkörper'].includes(m)).map((m) => ({ value: m, label: m })) });
  }
  if (T.needs === 'exercise') {
    const usage = idx().ex;
    const names = allExerciseNames().sort((a, b) => (usage.get(b)?.count || 0) - (usage.get(a)?.count || 0) || a.localeCompare(b, 'de'));
    fields.push({ name: 'exercise', label: 'Übung', type: 'select', value: g.exercise || names[0], options: names.map((n) => ({ value: n, label: n })) });
  }
  fields.push({ name: 'target', label: `Ziel pro Woche (${T.unit})`, value: g.target ?? T.def, inputmode: 'decimal', autofocus: !T.needs });
  const res = await formDialog({ title: T.label, fields, okLabel: 'Speichern' });
  if (!res) return null;
  const target = parseNum(res.target);
  if (!target || target <= 0) return null;
  return { ...g, target, muscle: res.muscle ?? g.muscle, exercise: res.exercise ?? g.exercise };
}

export function openGoalEditor() {
  let list = goalList();
  const o = overlay('', 'goal-editor');
  const draw = () => {
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Wochenziele</div><span style="width:40px"></span></div>
      <div class="panel-body">
        <p class="footnote">Lege fest, was du jede Woche schaffen willst. Das Workout-Ziel zählt für deine Killstreak.</p>
        <div class="set-group">
          ${list.map((g) => {
            const T = GOAL_TYPES[g.type];
            const f = T.fmt || ((v) => `${num(v, T.dec || 0)} ${T.unit}`);
            return `<div class="set-item goal-row">
              <span class="si-ic">${icon(T.icon)}</span>
              <button class="si-l" data-edit="${esc(g.id)}"><b>${esc(goalTitle(g))}</b><small>${esc(f(g.target))} pro Woche${g.type === 'workouts' ? ' · Streak' : ''}</small></button>
              ${g.type === 'workouts' ? '' : `<button class="icon-btn" data-del="${esc(g.id)}" aria-label="Löschen">${icon('trash')}</button>`}
            </div>`;
          }).join('')}
        </div>
        <button class="btn primary block" data-add style="margin-top:14px">${icon('plus')} Ziel hinzufügen</button>
      </div>`;
  };
  draw();
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const ed = e.target.closest('[data-edit]');
    if (ed) {
      const g = list.find((x) => x.id === ed.dataset.edit);
      const upd = await goalDialog(g);
      if (!upd) return;
      if (upd.type === 'workouts') await saveSettings({ weekGoal: Math.max(1, Math.round(upd.target)) });
      list = list.map((x) => (x.id === upd.id ? upd : x));
      await save(list);
      list = goalList();
      return draw();
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const g = list.find((x) => x.id === del.dataset.del);
      if (!(await confirmDialog(`Ziel „${goalTitle(g)}“ löschen?`, 'Löschen', true))) return;
      list = list.filter((x) => x.id !== g.id);
      await save(list);
      return draw();
    }
    if (e.target.closest('[data-add]')) {
      const type = await sheet({
        title: 'Neues Wochenziel',
        options: Object.entries(GOAL_TYPES).filter(([k]) => k !== 'workouts').map(([k, T]) => ({ label: T.label, value: k, icon: T.icon })),
      });
      if (!type) return;
      const g = await goalDialog({ id: uid(), type });
      if (!g) return;
      list = [...list, g];
      await save(list);
      draw();
    }
  });
}
