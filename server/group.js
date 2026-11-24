// Gruppen-Auswertung auf dem Server: lädt die Daten aus SQLite und nutzt die gemeinsame Logik (js/groupcalc.js)

import { buildGroup, feedFor, visOf } from '../js/groupcalc.js';
import { cleanSummary } from './summary.js';

// Strava erlaubt die Anzeige von Strava-Daten nur der Person selbst: diese Einträge zählen in der Arena
// nur als EP – keine Workouts, Strecken, Zeiten, Rekorde oder Bestwerte für andere.
export const PRIVATE_ID = /^strava-/;

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
export { visOf };

let cache = { key: '', data: null };
export let version = 1;
export const bump = () => { version++; };

function loadUsers(D) {
  return D.all('SELECT id, name, role, created, profile FROM users WHERE disabled = 0 ORDER BY created').map((u) => ({
    ...u,
    profile: parse(u.profile, {}),
    sums: D.all("SELECT id, summary FROM items WHERE user_id = ? AND kind = 'workout' AND deleted = 0 AND summary IS NOT NULL", u.id)
      .map((r) => { const s = cleanSummary(parse(r.summary, null)); return s ? { ...s, id: r.id, ...(PRIVATE_ID.test(r.id) ? { ext: 1 } : {}) } : null; }).filter(Boolean),
  }));
}

function loadChallenges(D) {
  const mem = D.all('SELECT challenge_id, user_id, status FROM challenge_members');
  return D.all('SELECT * FROM challenges').map((c) => ({ ...c, members: mem.filter((m) => m.challenge_id === c.id) }));
}

export function groupData(D) {
  const key = `${version}|${new Date().toDateString()}|${Math.floor(Date.now() / 600000)}`;
  if (cache.key === key) return cache.data;
  const data = buildGroup(loadUsers(D), loadChallenges(D));
  cache = { key, data };
  return data;
}

// Workouts eines Mitglieds je nach Sichtbarkeit
export function memberWorkouts(D, viewer, targetId, before = Infinity, limit = 20) {
  const { users } = groupData(D);
  const u = users.get(targetId);
  if (!u) return { error: 'Unbekanntes Mitglied', status: 404 };
  // Strava-Aktivitäten sieht nur die Person selbst
  const own = viewer.id === u.id ? 1 : 0;
  const rows = D.all(`SELECT id, data, summary FROM items WHERE user_id = ? AND kind = 'workout' AND deleted = 0 AND start < ?
    AND (? = 1 OR id NOT LIKE 'strava-%') ORDER BY start DESC LIMIT ?`, u.id, Number.isFinite(before) ? before : 9e15, own, Math.min(50, limit));
  const items = rows.map((r) => ({ id: r.id, data: parse(r.data, null), summary: parse(r.summary, {}) }));
  return feedFor(u, viewer.id, items, before, limit);
}
