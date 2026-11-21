// Zentraler App-Zustand + Persistenz

import * as db from './db.js';
import { inferExercise } from './library.js';

export const DEFAULT_SETTINGS = {
  bodyweight: null,        // kg – für Körpergewichtsübungen (1RM & Volumen)
  restDefault: 120,        // Sekunden
  countWarmups: false,     // Aufwärmsätze ins Volumen einrechnen
  keepAwake: true,         // Bildschirm während Workout anlassen
  restSound: true,
  lastBackup: null,
  weekGoal: 4,
};

export const state = {
  workouts: [],            // absteigend nach Start sortiert
  routines: [],
  exMeta: {},              // gespeicherte Übungs-Metadaten (name -> meta)
  settings: { ...DEFAULT_SETTINGS },
  active: null,            // laufendes Workout
  version: 0,
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
function bump() {
  state.version++;
  for (const fn of listeners) fn();
}

const sortWorkouts = () => state.workouts.sort((a, b) => b.start - a.start);

export async function loadAll() {
  const [workouts, routines, exercises, settings, active] = await Promise.all([
    db.getAll('workouts'), db.getAll('routines'), db.getAll('exercises'),
    db.kvGet('settings'), db.kvGet('active'),
  ]);
  state.workouts = workouts;
  sortWorkouts();
  state.routines = routines.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  state.exMeta = Object.fromEntries(exercises.map((e) => [e.name, e]));
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  state.active = active || null;
  state.version++;
}

// ---------- Workouts ----------
export async function saveWorkout(w) {
  const i = state.workouts.findIndex((x) => x.id === w.id);
  if (i >= 0) state.workouts[i] = w; else state.workouts.push(w);
  sortWorkouts();
  await db.put('workouts', w);
  bump();
}
export async function deleteWorkout(id) {
  state.workouts = state.workouts.filter((w) => w.id !== id);
  await db.del('workouts', id);
  bump();
}
export const getWorkout = (id) => state.workouts.find((w) => w.id === id);

// Import mit Duplikaterkennung (gleiche Startminute + Titel)
export async function importWorkouts(list) {
  const seen = new Set(state.workouts.map((w) => `${Math.floor(w.start / 60000)}|${w.title}`));
  const add = [];
  for (const w of list) {
    const k = `${Math.floor(w.start / 60000)}|${w.title}`;
    if (seen.has(k)) continue;
    seen.add(k);
    add.push(w);
  }
  if (add.length) {
    await db.putMany('workouts', add);
    state.workouts.push(...add);
    sortWorkouts();
    bump();
  }
  return { added: add.length, skipped: list.length - add.length };
}

// ---------- Routinen ----------
export async function saveRoutine(r) {
  const i = state.routines.findIndex((x) => x.id === r.id);
  if (i >= 0) state.routines[i] = r;
  else { r.order = state.routines.length; state.routines.push(r); }
  await db.put('routines', r);
  bump();
}
export async function deleteRoutine(id) {
  state.routines = state.routines.filter((r) => r.id !== id);
  await db.del('routines', id);
  bump();
}

// ---------- Übungen ----------
export function exerciseMeta(name) {
  const inf = inferExercise(name);
  const saved = state.exMeta[name] || {};
  return { name, ...inf, ...saved, inferredType: inf.type };
}
export async function saveExerciseMeta(name, patch) {
  const m = { ...(state.exMeta[name] || {}), ...patch, name };
  state.exMeta[name] = m;
  await db.put('exercises', m);
  bump();
}
export function allExerciseNames() {
  const set = new Set(Object.keys(state.exMeta));
  for (const w of state.workouts) for (const e of w.exercises) set.add(e.name);
  for (const r of state.routines) for (const e of r.exercises) set.add(e.name);
  return [...set];
}

// Übung umbenennen bzw. mit einer anderen zusammenführen
export async function renameExercise(from, to) {
  to = to.trim();
  if (!to || from === to) return 0;
  const changedW = [];
  for (const w of state.workouts) {
    let c = false;
    for (const e of w.exercises) if (e.name === from) { e.name = to; c = true; }
    if (c) changedW.push(w);
  }
  const changedR = [];
  for (const r of state.routines) {
    let c = false;
    for (const e of r.exercises) if (e.name === from) { e.name = to; c = true; }
    if (c) changedR.push(r);
  }
  if (state.active) for (const e of state.active.exercises) if (e.name === from) e.name = to;
  if (changedW.length) await db.putMany('workouts', changedW);
  if (changedR.length) await db.putMany('routines', changedR);
  if (state.exMeta[from]) {
    const m = { ...state.exMeta[from], name: to };
    delete state.exMeta[from];
    await db.del('exercises', from);
    if (!state.exMeta[to]) { state.exMeta[to] = m; await db.put('exercises', m); }
  }
  if (state.active) await db.kvSet('active', state.active);
  bump();
  return changedW.length;
}

// ---------- Einstellungen ----------
export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.kvSet('settings', state.settings);
  bump();
}

// ---------- Laufendes Workout ----------
export async function setActive(a, silent = false) {
  state.active = a;
  if (a) await db.kvSet('active', a); else await db.kvDel('active');
  if (!silent) bump();
}
// Schnelles Speichern ohne Re-Render
export function persistActive() {
  if (state.active) db.kvSet('active', state.active);
}

// ---------- Backup ----------
export function exportJSON() {
  return JSON.stringify({
    app: 'gymlog', version: 1, exportedAt: new Date().toISOString(),
    workouts: state.workouts, routines: state.routines,
    exercises: Object.values(state.exMeta), settings: state.settings,
  });
}
export async function importJSON(text, replace = false) {
  const data = JSON.parse(text);
  if (data.app !== 'gymlog' || !Array.isArray(data.workouts)) throw new Error('Keine gültige Backup-Datei.');
  if (replace) await wipe(false);
  const res = await importWorkouts(data.workouts);
  for (const r of data.routines || []) {
    if (!state.routines.some((x) => x.id === r.id)) { state.routines.push(r); await db.put('routines', r); }
  }
  for (const e of data.exercises || []) {
    if (!state.exMeta[e.name]) { state.exMeta[e.name] = e; await db.put('exercises', e); }
  }
  if (data.settings && replace) await saveSettings({ ...data.settings });
  bump();
  return res;
}

export async function wipe(notify = true) {
  await Promise.all([db.clear('workouts'), db.clear('routines'), db.clear('exercises'), db.clear('kv')]);
  state.workouts = [];
  state.routines = [];
  state.exMeta = {};
  state.settings = { ...DEFAULT_SETTINGS };
  state.active = null;
  if (notify) bump();
}
