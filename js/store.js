// Zentraler App-Zustand + Persistenz

import * as db from './db.js';
import { inferExercise } from './library.js';
import { cleanWorkout, cleanRoutine, cleanMeta, cleanList } from './sanitize.js';

export const DEFAULT_SETTINGS = {
  bodyweight: null,        // kg – für Körpergewichtsübungen (1RM & Volumen)
  restDefault: 120,        // Sekunden
  countWarmups: false,     // Aufwärmsätze ins Volumen einrechnen
  keepAwake: true,         // Bildschirm während Workout anlassen
  restSound: true,
  lastBackup: null,
  weekGoal: 4,
  theme: 'dark',           // 'dark' | 'light' | 'system'
  aiMode: false,           // (alt) AI-Mode – ersetzt durch aiWorkout / aiCardio
  aiWorkout: false,        // AI-Coach Workouts (Plan, Gewichtsvorschläge, Erholung, Balance)
  aiCardio: false,         // AI-Coach Cardio (Ausdauerplan)
  coach: {},               // Ziele, Körperdaten, Tausch/Verschieben im Plan
  prEffects: true,         // PR-Einblendung + Feuer-Zeile
  prSound: true,           // Power-up-Sound bei PR
  prScream: true,          // (alt) Kampfschrei – ersetzt durch den Rekord-Einspieler
  fightMusic: true,        // Musik bei Arena-Kämpfen
  voice: true,             // Sprachansagen in geführten Einheiten
  hrMax: null,             // max. Herzfrequenz für Puls-Zonen
  cardio: {},              // Geräte-Kalibrierung
  lastDevice: 'treadmill',
  introAnim: true,         // Start-Animation beim Öffnen
  arenaDemo: true,         // DEMO: Arena mit 2 NPCs ohne Server
  accent: 'blau',          // Farbprofil
  simple: false,           // Simple Mode: ohne Avatare & Animationen
  aiMobility: false,       // AI-Coach Mobility (adaptiv wie Cardio)
  food: false,             // Ernährungs-Tracking (nur wenn eingeschaltet)
  foodGoal: null,          // eigenes Kalorienziel (sonst vom Coach)
};

export const state = {
  workouts: [],            // absteigend nach Start sortiert
  routines: [],
  exMeta: {},              // gespeicherte Übungs-Metadaten (name -> meta)
  settings: { ...DEFAULT_SETTINGS },
  active: null,            // laufendes Workout
  version: 0,
};

// Sync-Hook: wird bei lokalen Änderungen aufgerufen (kind, ids, deleted)
export const hooks = { change: null };
const changed = (kind, ids, deleted = false) => { try { hooks.change?.(kind, ids, deleted); } catch (e) { console.warn(e); } };

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
// neu rechnen lassen (z. B. wenn sich „EP zählen ab“ ändert)
export const bumpVersion = () => bump();
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
  // Migration: alter AI-Mode → AI-Coach Workouts
  if (settings && settings.aiMode && settings.aiWorkout === undefined) state.settings.aiWorkout = true;
  state.active = active || null;
  state.version++;
}

// ---------- Workouts ----------
export async function saveWorkout(w) {
  const i = state.workouts.findIndex((x) => x.id === w.id);
  if (i >= 0) state.workouts[i] = w; else state.workouts.push(w);
  sortWorkouts();
  await db.put('workouts', w);
  changed('workout', [w.id]);
  bump();
}
export async function deleteWorkout(id) {
  state.workouts = state.workouts.filter((w) => w.id !== id);
  await db.del('workouts', id);
  changed('workout', [id], true);
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
    changed('workout', add.map((w) => w.id));
    bump();
  }
  return { added: add.length, skipped: list.length - add.length };
}

// Änderungen vom Server übernehmen (ohne erneut zu synchronisieren)
export async function applyRemote({ workouts = [], routines = [], delWorkouts = [], delRoutines = [] }) {
  // auch Daten vom Server prüfen (z. B. falls ein Konto missbraucht wurde)
  workouts = cleanList(workouts, cleanWorkout).list;
  // Strava-Workouts vom Server stammen aus der alten Server-Anbindung: nur Historie (keine EP)
  for (const w of workouts) if (w.source === 'strava') w.hist = true;
  routines = cleanList(routines, cleanRoutine).list;
  if (!workouts.length && !routines.length && !delWorkouts.length && !delRoutines.length) return;
  if (workouts.length) {
    await db.putMany('workouts', workouts);
    const m = new Map(state.workouts.map((w) => [w.id, w]));
    for (const w of workouts) m.set(w.id, w);
    state.workouts = [...m.values()];
  }
  for (const id of delWorkouts) await db.del('workouts', id);
  if (delWorkouts.length) { const d = new Set(delWorkouts); state.workouts = state.workouts.filter((w) => !d.has(w.id)); }
  sortWorkouts();
  if (routines.length) {
    await db.putMany('routines', routines);
    const m = new Map(state.routines.map((r) => [r.id, r]));
    for (const r of routines) m.set(r.id, r);
    state.routines = [...m.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  }
  for (const id of delRoutines) await db.del('routines', id);
  if (delRoutines.length) { const d = new Set(delRoutines); state.routines = state.routines.filter((r) => !d.has(r.id)); }
  bump();
}

// ---------- Routinen ----------
export async function saveRoutine(r) {
  const i = state.routines.findIndex((x) => x.id === r.id);
  if (i >= 0) state.routines[i] = r;
  else { r.order = state.routines.length; state.routines.push(r); }
  await db.put('routines', r);
  changed('routine', [r.id]);
  bump();
}
export async function deleteRoutine(id) {
  state.routines = state.routines.filter((r) => r.id !== id);
  await db.del('routines', id);
  changed('routine', [id], true);
  bump();
}

// ---------- Übungen ----------
export function exerciseMeta(name) {
  const inf = inferExercise(name);
  const saved = Object.prototype.hasOwnProperty.call(state.exMeta, name) ? state.exMeta[name] : {};
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
  if (changedW.length) { await db.putMany('workouts', changedW); changed('workout', changedW.map((w) => w.id)); }
  if (changedR.length) { await db.putMany('routines', changedR); changed('routine', changedR.map((r) => r.id)); }
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

// ---------- Einstellungen + eigene Übungen pro Konto (Server-Abgleich) ----------
// Nicht übertragen: rein gerätebezogene Werte
const LOCAL_KEYS = new Set(['arenaDemo']);
export function prefsData() {
  const settings = {};
  for (const [k, v] of Object.entries(state.settings)) if (!LOCAL_KEYS.has(k)) settings[k] = v;
  return { settings, exMeta: Object.values(state.exMeta) };
}
export async function applyPrefs(p) {
  if (!p || typeof p !== 'object') return;
  const s = p.settings && typeof p.settings === 'object' && !Array.isArray(p.settings) ? p.settings : null;
  if (s) {
    const patch = {};
    for (const [k, v] of Object.entries(s)) if (!LOCAL_KEYS.has(k) && !['__proto__', 'constructor', 'prototype'].includes(k)) patch[k] = v;
    state.settings = { ...DEFAULT_SETTINGS, ...patch, ...Object.fromEntries([...LOCAL_KEYS].map((k) => [k, state.settings[k]])) };
    await db.kvSet('settings', state.settings);
  }
  const M = cleanList(p.exMeta, cleanMeta).list;
  if (M.length) {
    for (const m of M) state.exMeta[m.name] = m;
    await db.putMany('exercises', M);
  }
  bump();
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
// Backup einspielen: alles wird geprüft und sauber neu aufgebaut (Einstellungen werden nie übernommen)
export async function importJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges Backup (kein JSON).'); }
  if (!data || typeof data !== 'object' || data.app !== 'gymlog' || !Array.isArray(data.workouts)) throw new Error('Keine gültige Backup-Datei.');
  const W = cleanList(data.workouts, cleanWorkout);
  const R = cleanList(data.routines, cleanRoutine);
  const M = cleanList(data.exercises, cleanMeta);
  const res = await importWorkouts(W.list);
  for (const r of R.list) {
    if (!state.routines.some((x) => x.id === r.id)) { state.routines.push(r); await db.put('routines', r); changed('routine', [r.id]); }
  }
  for (const e of M.list) {
    if (!Object.prototype.hasOwnProperty.call(state.exMeta, e.name)) { state.exMeta[e.name] = e; await db.put('exercises', e); }
  }
  bump();
  return { ...res, dropped: W.dropped + R.dropped + M.dropped };
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
