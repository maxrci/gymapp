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
    sums: D.all("SELECT id, kind, summary FROM items WHERE user_id = ? AND kind IN ('workout', 'ext') AND deleted = 0 AND summary IS NOT NULL", u.id)
      .map((r) => {
        const s = cleanSummary(parse(r.summary, null));
        if (!s) return null;
        // ext: Strava vom Handy (nur XP); alte Strava-Importe vom Server: Historie (keine XP)
        if (r.kind === 'ext') return { ...s, id: r.id, ext: 1 };
        if (PRIVATE_ID.test(r.id)) return { ...s, id: r.id, ext: 1, h: 1 };
        return { ...s, id: r.id };
      }).filter(Boolean),
  }));
}

function loadChallenges(D) {
  const mem = D.all('SELECT challenge_id, user_id, status FROM challenge_members');
  return D.all('SELECT * FROM challenges').map((c) => ({ ...c, members: mem.filter((m) => m.challenge_id === c.id) }));
}

export function groupData(D) {
  const key = `${version}|${new Date().toDateString()}|${Math.floor(Date.now() / 600000)}`;
  if (cache.key === key) return cache.data;
  const pts = D.get("SELECT value FROM app_config WHERE key = 'points'");
  const data = buildGroup(loadUsers(D), loadChallenges(D), Date.now(), pts ? parse(pts.value, null) : null);
  cache = { key, data };
  return data;
}

// Workouts eines Mitglieds je nach Sichtbarkeit
export function memberWorkouts(D, viewer, targetId, before = Infinity, limit = 20) {
  const { users } = groupData(D);
  const u = users.get(targetId);
  if (!u) return { error: 'Unbekanntes Mitglied', status: 404 };
  // Strava-Aktivitäten und importierte Historie sieht nur die Person selbst
  const own = viewer.id === u.id ? 1 : 0;
  const rows = D.all(`SELECT id, data, summary FROM items WHERE user_id = ? AND kind = 'workout' AND deleted = 0 AND start < ?
    AND (? = 1 OR (id NOT LIKE 'strava-%' AND json_extract(summary, '$.h') IS NULL)) ORDER BY start DESC LIMIT ?`, u.id, Number.isFinite(before) ? before : 9e15, own, Math.min(50, limit));
  const items = rows.map((r) => ({ id: r.id, data: parse(r.data, null), summary: parse(r.summary, {}) }));
  return feedFor(u, viewer.id, items, before, limit);
}
