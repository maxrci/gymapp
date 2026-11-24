// Gemeinsam für Strava und Garmin: eine Aktivität wird zu einem normalen Cardio-Workout
// (+ Zusammenfassung für die Arena) und landet ohne Doppelte in der Datenbank.

import { MOBILITY_RE } from '../js/compete.js';
import { cleanSummary } from './summary.js';

export function cardioWorkout({ id, title, start, sec, elapsed, km, name, notes, description, source }) {
  sec = Math.max(0, Math.min(86400, Math.round(Number(sec) || 0)));
  if (!sec || !Number.isFinite(start)) return null;
  elapsed = Math.max(sec, Math.min(86400, Math.round(Number(elapsed) || sec)));
  km = km > 0 ? Math.round(km * 1000) / 1000 : null;
  title = String(title || name).trim().slice(0, 120) || name;
  const data = {
    id, title, start, end: start + elapsed * 1000, source, description,
    exercises: [{ name, notes, supersetId: null, sets: [{ type: 'normal', weight: null, reps: null, distance: km, duration: sec, rpe: null }] }],
  };
  const mob = MOBILITY_RE.test(name);
  const summary = cleanSummary({
    start, end: data.end, title, vol: 0, sets: 1, reps: 0, dur: elapsed, km: km || 0, cmin: mob ? 0 : Math.round(sec / 60), mob: mob ? 1 : 0,
    ex: [{ n: name, t: km ? 'cardio' : 'duration', v: 0, s: 1, r: 0, mr: 0, e: 0, w: 0, d: km || 0, sec }],
  });
  return { id, data, summary, start };
}

// Speichern, außer es gibt schon ein Workout mit Start ±10 Minuten (von Hand eingetragen oder aus der anderen Quelle)
export function storeImported(D, userId, w) {
  if (D.get("SELECT 1 FROM items WHERE user_id = ? AND kind = 'workout' AND deleted = 0 AND start BETWEEN ? AND ? AND id <> ?", userId, w.start - 600000, w.start + 600000, w.id)) return false;
  const r = D.run(`INSERT INTO items (user_id, kind, id, data, summary, start, deleted, seq) VALUES (?, 'workout', ?, ?, ?, ?, 0, ?)
    ON CONFLICT(user_id, kind, id) DO NOTHING`, userId, w.id, JSON.stringify(w.data), JSON.stringify(w.summary), w.start, D.nextSeq());
  return r?.changes == null ? true : r.changes > 0;
}

// Übernommene Workouts einer Quelle löschen (als gelöscht markieren, damit es die Apps mitbekommen)
export function removeImported(D, userId, prefix) {
  for (const r of D.all("SELECT id FROM items WHERE user_id = ? AND kind = 'workout' AND deleted = 0 AND id LIKE ?", userId, `${prefix}-%`)) {
    D.run("UPDATE items SET deleted = 1, data = NULL, summary = NULL, seq = ? WHERE user_id = ? AND kind = 'workout' AND id = ?", D.nextSeq(), userId, r.id);
  }
}
