// Gruppen-Auswertung auf dem Server: lädt die Daten aus SQLite und nutzt die gemeinsame Logik (js/groupcalc.js)

import { buildGroup, feedFor, visOf } from '../js/groupcalc.js';
import { cleanSummary } from './summary.js';
import { cleanShare } from './groups.js';

// Strava erlaubt die Anzeige von Strava-Daten nur der Person selbst: diese Einträge zählen in der Arena
// nur als EP – keine Workouts, Strecken, Zeiten, Rekorde oder Bestwerte für andere.
export const PRIVATE_ID = /^strava-/;

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
export { visOf };

const cache = new Map(); // Gruppe → { key, data }
export let version = 1;
export const bump = () => { version++; };

const sumsOf = (D, uid, from = 0) => D.all("SELECT id, kind, summary FROM items WHERE user_id = ? AND kind IN ('workout', 'ext') AND deleted = 0 AND summary IS NOT NULL", uid)
  .map((r) => {
    const s = cleanSummary(parse(r.summary, null));
    if (!s) return null;
    if (from && s.start < from) s.h = 1; // vor „EP zählen ab“: nur privat
    // ext: Strava vom Handy (nur XP); alte Strava-Importe vom Server: Historie (keine XP)
    if (r.kind === 'ext') return { ...s, id: r.id, ext: 1 };
    if (PRIVATE_ID.test(r.id)) return { ...s, id: r.id, ext: 1, h: 1 };
    return { ...s, id: r.id };
  }).filter(Boolean);

// Mitglieder einer Gruppe – mit dem, was sie in DIESER Gruppe teilen
function loadUsers(D, gid) {
  return D.all(`SELECT u.id, u.name, u.role, u.created, u.profile, u.count_from, m.share, m.role AS grole FROM group_members m JOIN users u ON u.id = m.user_id
    WHERE m.group_id = ? AND m.status = 'member' AND u.disabled = 0 ORDER BY m.joined`, gid).map((u) => {
    const share = cleanShare(parse(u.share, null));
    const profile = { ...parse(u.profile, {}), visibility: share.workouts };
    if (!share.bodyweight) profile.bwLog = [];
    return { id: u.id, name: u.name, role: u.grole === 'owner' || u.grole === 'admin' ? 'admin' : 'member', created: u.created, profile, share, sums: sumsOf(D, u.id, u.count_from || 0) };
  });
}

function loadChallenges(D, gid) {
  const mem = D.all('SELECT cm.challenge_id, cm.user_id, cm.status FROM challenge_members cm JOIN challenges c ON c.id = cm.challenge_id WHERE c.group_id = ?', gid);
  return D.all('SELECT * FROM challenges WHERE group_id = ?', gid).map((c) => ({ ...c, members: mem.filter((m) => m.challenge_id === c.id) }));
}

export function groupData(D, gid, pointsOverride = undefined) {
  const key = `${version}|${new Date().toDateString()}|${Math.floor(Date.now() / 600000)}`;
  if (pointsOverride === undefined && cache.get(gid)?.key === key) return cache.get(gid).data;
  const pts = D.get("SELECT value FROM app_config WHERE key = 'points'");
  const data = buildGroup(loadUsers(D, gid), loadChallenges(D, gid), Date.now(), pointsOverride !== undefined ? pointsOverride : pts ? parse(pts.value, null) : null);
  if (pointsOverride === undefined) { cache.set(gid, { key, data }); if (cache.size > 50) cache.delete(cache.keys().next().value); }
  return data;
}

// Workouts eines Mitglieds je nach Sichtbarkeit
export function memberWorkouts(D, viewer, targetId, gid, before = Infinity, limit = 20) {
  const { users } = groupData(D, gid);
  const u = users.get(targetId);
  if (!u) return { error: 'Unbekanntes Mitglied', status: 404 };
  // Strava-Aktivitäten und importierte Historie sieht nur die Person selbst
  const own = viewer.id === u.id ? 1 : 0;
  const rows = D.all(`SELECT id, data, summary FROM items WHERE user_id = ? AND kind = 'workout' AND deleted = 0 AND start < ?
    AND (? = 1 OR (id NOT LIKE 'strava-%' AND json_extract(summary, '$.h') IS NULL AND start >= ?)) ORDER BY start DESC LIMIT ?`, u.id, Number.isFinite(before) ? before : 9e15, own, D.get('SELECT count_from FROM users WHERE id = ?', u.id)?.count_from || 0, Math.min(50, limit));
  const items = rows.map((r) => ({ id: r.id, data: parse(r.data, null), summary: parse(r.summary, {}) }));
  return feedFor(u, viewer.id, items, before, limit);
}
