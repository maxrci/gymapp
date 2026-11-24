// Gemeinsame Aktionen: Import, Export, Routinen aus Verlauf

import { MAX_FILE_MB } from './sanitize.js';
import { state, importWorkouts, exportJSON, importJSON, saveSettings, saveRoutine } from './store.js';
import { csvToWorkouts, workoutsToCSV } from './csv.js';
import { pickFile, toast, sheet } from './ui.js';
import { shareFile, uid, DAY } from './utils.js';
import { startWorkout } from './workout.js';

export async function importCSVFlow() {
  const file = await pickFile('.csv,text/csv,text/comma-separated-values');
  if (!file) return;
  if (file.size > MAX_FILE_MB * 1048576) return toast(`Die Datei ist zu groß (max. ${MAX_FILE_MB} MB).`, 4000);
  try {
    const text = await file.text();
    const { workouts, errors } = csvToWorkouts(text);
    if (!workouts.length) throw new Error('Keine Workouts in der Datei gefunden.');
    const res = await importWorkouts(workouts);
    toast(`${res.added} Workouts importiert${res.skipped ? `, ${res.skipped} bereits vorhanden` : ''}${errors ? `, ${errors} Zeilen übersprungen` : ''}`, 4000);
    if (res.added && !state.routines.length) {
      const v = await sheet({
        title: 'Routinen anlegen?',
        message: 'Aus deinen letzten Workouts können automatisch Vorlagen (z. B. Push, Pull, Legday) erstellt werden.',
        options: [{ label: 'Routinen erstellen', value: true, icon: 'layers' }],
      });
      if (v) await routinesFromHistory();
    }
  } catch (e) {
    toast(`Import fehlgeschlagen: ${e.message}`, 5000);
  }
}

export async function exportCSV() {
  const name = `workouts-${new Date().toISOString().slice(0, 10)}.csv`;
  const ok = await shareFile(name, workoutsToCSV(state.workouts), 'text/csv');
  if (ok) await saveSettings({ lastBackup: Date.now() });
}

export async function exportBackup() {
  const name = `gymlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const ok = await shareFile(name, exportJSON(), 'application/json');
  if (ok) await saveSettings({ lastBackup: Date.now() });
}

export async function restoreBackup() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  if (file.size > MAX_FILE_MB * 1048576) return toast(`Die Datei ist zu groß (max. ${MAX_FILE_MB} MB).`, 4000);
  try {
    const res = await importJSON(await file.text());
    toast(`${res.added} Workouts wiederhergestellt${res.skipped ? `, ${res.skipped} bereits vorhanden` : ''}${res.dropped ? `, ${res.dropped} ungültige Einträge übersprungen` : ''}`, 4000);
  } catch (e) {
    toast(`Wiederherstellung fehlgeschlagen: ${e.message}`, 5000);
  }
}

// Eine Vorlage pro Workout-Titel aus den letzten 6 Monaten (jeweils das jüngste Workout)
export async function routinesFromHistory() {
  const since = Date.now() - 182 * DAY;
  const latest = new Map();
  const counts = new Map();
  for (const w of state.workouts) {
    if (w.start < since) continue;
    counts.set(w.title, (counts.get(w.title) || 0) + 1);
    if (!latest.has(w.title)) latest.set(w.title, w);
  }
  const existing = new Set(state.routines.map((r) => r.name));
  let n = 0;
  const titles = [...latest.keys()].filter((t) => counts.get(t) >= 2 && !existing.has(t))
    .sort((a, b) => counts.get(b) - counts.get(a));
  for (const t of titles) {
    await saveRoutine(routineFromWorkout(latest.get(t)));
    n++;
  }
  toast(n ? `${n} Routinen erstellt` : 'Keine passenden Workouts gefunden');
}

export function routineFromWorkout(w, name) {
  return {
    id: uid(),
    name: name || w.title,
    exercises: w.exercises.map((e) => ({
      name: e.name, rest: null,
      sets: e.sets.map((s) => ({ type: s.type, weight: s.weight, reps: s.reps, distance: s.distance, duration: s.duration })),
    })),
  };
}

export function startFromRoutine(r) {
  return startWorkout({ title: r.name, routineId: r.id, exercises: r.exercises });
}
export function repeatWorkout(w) {
  return startWorkout({ title: w.title, exercises: routineFromWorkout(w).exercises });
}
