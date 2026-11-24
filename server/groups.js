// Gruppen und Freunde: jede Person kann in mehreren Gruppen (Freundeskreisen) sein und pro Gruppe einstellen,
// was sie teilt. Freunde finden geht nur unter den Konten, die der Admin auf diesem Server angelegt hat.

import { newId, newCode, normCode, sha } from './auth.js';

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
export const SHARE_DEFAULT = { workouts: 'full', live: true, bodyweight: true };
const WORKOUT_VIS = new Set(['full', 'summary', 'stats']);
export function cleanShare(s, base = SHARE_DEFAULT) {
  const o = { ...base };
  if (s && typeof s === 'object') {
    if (WORKOUT_VIS.has(s.workouts)) o.workouts = s.workouts;
    if (typeof s.live === 'boolean') o.live = s.live;
    if (typeof s.bodyweight === 'boolean') o.bodyweight = s.bodyweight;
  }
  return o;
}
const fail = (status, msg) => { throw Object.assign(new Error(msg), { status }); };

// Beim Start: bisherige Einzel-Gruppe des Servers als erste Gruppe anlegen (alle Konten sind Mitglied)
export function ensureDefaultGroup(D, name) {
  if (D.get('SELECT 1 FROM groups LIMIT 1')) {
    const first = D.get('SELECT id FROM groups ORDER BY created LIMIT 1');
    D.run('UPDATE challenges SET group_id = ? WHERE group_id IS NULL', first.id);
    return;
  }
  const users = D.all('SELECT id, role, profile FROM users WHERE disabled = 0 ORDER BY created');
  if (!users.length) return;
  const owner = users.find((u) => u.role === 'admin') || users[0];
  const now = Date.now();
  D.tx(() => {
    D.run('INSERT INTO groups (id, name, owner, created) VALUES (?, ?, ?, ?)', 'main', name || 'Gruppe', owner.id, now);
    for (const u of users) {
      const vis = parse(u.profile, {})?.visibility;
      D.run("INSERT INTO group_members (group_id, user_id, role, status, share, joined) VALUES ('main', ?, ?, 'member', ?, ?)",
        u.id, u.id === owner.id ? 'owner' : u.role === 'admin' ? 'admin' : 'member', JSON.stringify(cleanShare({ workouts: vis })), now);
    }
    D.run("UPDATE challenges SET group_id = 'main' WHERE group_id IS NULL");
  });
}
export const defaultGroupId = (D) => D.get('SELECT id FROM groups ORDER BY created LIMIT 1')?.id || null;

export const membership = (D, gid, uid) => D.get('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', gid, uid);
export const isMember = (D, gid, uid) => membership(D, gid, uid)?.status === 'member';
const isGroupAdmin = (D, gid, user) => { const m = membership(D, gid, user.id); return user.role === 'admin' || (m?.status === 'member' && (m.role === 'owner' || m.role === 'admin')); };
export const memberIds = (D, gid) => D.all("SELECT user_id FROM group_members WHERE group_id = ? AND status = 'member'", gid).map((r) => r.user_id);
export function shareOf(D, gid, uid) { return cleanShare(parse(membership(D, gid, uid)?.share, null)); }

export function myGroups(D, uid) {
  const rows = D.all(`SELECT g.id, g.name, g.owner, g.created, m.role, m.status, m.share, m.invited_by,
      (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id AND x.status = 'member') AS members
    FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY g.created`, uid);
  const name = (id) => D.get('SELECT name FROM users WHERE id = ?', id)?.name || '';
  return {
    groups: rows.filter((r) => r.status === 'member').map((r) => ({ id: r.id, name: r.name, role: r.role, members: r.members, share: cleanShare(parse(r.share, null)) })),
    invites: rows.filter((r) => r.status === 'invited').map((r) => ({ id: r.id, name: r.name, members: r.members, by: name(r.invited_by) })),
  };
}

export function createGroup(D, user, name) {
  const n = String(name || '').trim().slice(0, 40);
  if (n.length < 2) fail(400, 'Bitte einen Gruppennamen eingeben (mind. 2 Zeichen).');
  if (D.get("SELECT COUNT(*) AS n FROM group_members WHERE user_id = ? AND role = 'owner'", user.id).n >= 10) fail(400, 'Du hast schon 10 Gruppen gegründet.');
  const id = newId();
  const code = newCode();
  D.tx(() => {
    D.run('INSERT INTO groups (id, name, owner, created, code_hash) VALUES (?, ?, ?, ?, ?)', id, n, user.id, Date.now(), sha(normCode(code)));
    D.run("INSERT INTO group_members (group_id, user_id, role, status, share, joined) VALUES (?, ?, 'owner', 'member', ?, ?)", id, user.id, JSON.stringify(SHARE_DEFAULT), Date.now());
  });
  return { id, name: n, code };
}

export function newGroupCode(D, user, gid) {
  if (!isGroupAdmin(D, gid, user)) fail(403, 'Nur Gruppen-Admins können einen Einladungscode erzeugen.');
  const code = newCode();
  D.run('UPDATE groups SET code_hash = ? WHERE id = ?', sha(normCode(code)), gid);
  return { code };
}

export function joinByCode(D, user, code) {
  const g = D.get('SELECT * FROM groups WHERE code_hash = ?', sha(normCode(code)));
  if (!g) fail(400, 'Der Code ist ungültig oder wurde ersetzt.');
  const m = membership(D, g.id, user.id);
  if (m?.status === 'member') return { id: g.id, name: g.name, already: true };
  D.run(`INSERT INTO group_members (group_id, user_id, role, status, share, joined) VALUES (?, ?, 'member', 'member', ?, ?)
    ON CONFLICT(group_id, user_id) DO UPDATE SET status = 'member', joined = excluded.joined`, g.id, user.id, JSON.stringify(SHARE_DEFAULT), Date.now());
  return { id: g.id, name: g.name };
}

export function inviteToGroup(D, user, gid, uid) {
  if (!isMember(D, gid, user.id)) fail(403, 'Nur Mitglieder können einladen.');
  if (!areFriends(D, user.id, uid) && user.role !== 'admin') fail(403, 'Du kannst nur Freunde einladen.');
  if (!D.get('SELECT 1 FROM users WHERE id = ? AND disabled = 0', uid)) fail(404, 'Unbekanntes Konto');
  const m = membership(D, gid, uid);
  if (m?.status === 'member') return { already: true };
  D.run(`INSERT INTO group_members (group_id, user_id, role, status, share, joined, invited_by) VALUES (?, ?, 'member', 'invited', ?, ?, ?)
    ON CONFLICT(group_id, user_id) DO UPDATE SET status = 'invited', invited_by = excluded.invited_by`, gid, uid, JSON.stringify(SHARE_DEFAULT), Date.now(), user.id);
  return { ok: true };
}

export function respondInvite(D, user, gid, accept) {
  const m = membership(D, gid, user.id);
  if (!m || m.status !== 'invited') fail(404, 'Keine Einladung gefunden.');
  if (accept) D.run("UPDATE group_members SET status = 'member', joined = ? WHERE group_id = ? AND user_id = ?", Date.now(), gid, user.id);
  else D.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', gid, user.id);
  return { ok: true };
}

// Austreten: wer gründete, gibt die Leitung ab; leere Gruppen verschwinden
export function leaveGroup(D, uid, gid) {
  const m = membership(D, gid, uid);
  if (!m) fail(404, 'Du bist nicht in dieser Gruppe.');
  D.tx(() => {
    D.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', gid, uid);
    D.run("DELETE FROM challenge_members WHERE user_id = ? AND challenge_id IN (SELECT id FROM challenges WHERE group_id = ?)", uid, gid);
    const left = D.all("SELECT user_id, role FROM group_members WHERE group_id = ? AND status = 'member' ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined", gid);
    if (!left.length) { D.run('DELETE FROM challenges WHERE group_id = ?', gid); D.run('DELETE FROM groups WHERE id = ?', gid); return; }
    if (m.role === 'owner') {
      D.run("UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?", gid, left[0].user_id);
      D.run('UPDATE groups SET owner = ? WHERE id = ?', left[0].user_id, gid);
    }
  });
  return { ok: true };
}

export function renameGroup(D, user, gid, name) {
  if (!isGroupAdmin(D, gid, user)) fail(403, 'Nur Gruppen-Admins können die Gruppe umbenennen.');
  const n = String(name || '').trim().slice(0, 40);
  if (n.length < 2) fail(400, 'Name zu kurz.');
  D.run('UPDATE groups SET name = ? WHERE id = ?', n, gid);
  return { ok: true };
}
export function setShare(D, uid, gid, share) {
  const m = membership(D, gid, uid);
  if (m?.status !== 'member') fail(404, 'Du bist nicht in dieser Gruppe.');
  const s = cleanShare(share, cleanShare(parse(m.share, null)));
  D.run('UPDATE group_members SET share = ? WHERE group_id = ? AND user_id = ?', JSON.stringify(s), gid, uid);
  return s;
}
export function setMemberRole(D, user, gid, uid, role) {
  if (!isGroupAdmin(D, gid, user)) fail(403, 'Nur Gruppen-Admins.');
  if (!['admin', 'member'].includes(role)) fail(400, 'Unbekannte Rolle');
  const m = membership(D, gid, uid);
  if (!m || m.role === 'owner') fail(400, 'Nicht möglich.');
  D.run('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?', role, gid, uid);
  return { ok: true };
}
export function removeMember(D, user, gid, uid) {
  if (!isGroupAdmin(D, gid, user)) fail(403, 'Nur Gruppen-Admins.');
  const m = membership(D, gid, uid);
  if (!m) fail(404, 'Kein Mitglied.');
  if (m.role === 'owner' && user.role !== 'admin') fail(400, 'Wer die Gruppe gegründet hat, kann nicht entfernt werden.');
  return leaveGroup(D, uid, gid);
}
export function deleteGroup(D, user, gid) {
  const g = D.get('SELECT * FROM groups WHERE id = ?', gid) || fail(404, 'Gruppe nicht gefunden');
  if (g.owner !== user.id && user.role !== 'admin') fail(403, 'Nur wer die Gruppe gegründet hat, kann sie löschen.');
  D.tx(() => { D.run('DELETE FROM challenges WHERE group_id = ?', gid); D.run('DELETE FROM groups WHERE id = ?', gid); });
  return { ok: true };
}

// ---------- Freunde ----------
const pair = (x, y) => (x < y ? [x, y] : [y, x]);
export function areFriends(D, x, y) { const [a, b] = pair(x, y); return D.get("SELECT 1 FROM friends WHERE a = ? AND b = ? AND status = 'accepted'", a, b) != null; }
const lookOf = (profile) => parse(profile, {})?.avatar || null;

export function friendsOf(D, uid) {
  const rows = D.all(`SELECT f.*, u.id AS uid, u.name, u.profile FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
    WHERE (f.a = ? OR f.b = ?) AND u.disabled = 0 ORDER BY u.name`, uid, uid, uid);
  const out = (r) => ({ id: r.uid, name: r.name, look: lookOf(r.profile) });
  return {
    friends: rows.filter((r) => r.status === 'accepted').map(out),
    incoming: rows.filter((r) => r.status === 'pending' && r.requested_by !== uid).map(out),
    outgoing: rows.filter((r) => r.status === 'pending' && r.requested_by === uid).map(out),
  };
}
export function searchUsers(D, uid, q) {
  const s = String(q || '').trim().toLowerCase().slice(0, 40);
  if (s.length < 2) return { users: [] };
  const like = `%${s.replace(/[%_\\]/g, '\\$&')}%`;
  const rows = D.all("SELECT id, name, username, profile FROM users WHERE disabled = 0 AND id <> ? AND (LOWER(name) LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\') ORDER BY name LIMIT 20", uid, like, like);
  const f = friendsOf(D, uid);
  const rel = (id) => (f.friends.some((x) => x.id === id) ? 'friend' : f.incoming.some((x) => x.id === id) ? 'incoming' : f.outgoing.some((x) => x.id === id) ? 'outgoing' : '');
  return { users: rows.map((r) => ({ id: r.id, name: r.name, username: r.username, look: lookOf(r.profile), rel: rel(r.id) })) };
}
export function requestFriend(D, uid, other) {
  if (uid === other) fail(400, 'Das bist du selbst.');
  if (!D.get('SELECT 1 FROM users WHERE id = ? AND disabled = 0', other)) fail(404, 'Unbekanntes Konto');
  const [a, b] = pair(uid, other);
  const r = D.get('SELECT * FROM friends WHERE a = ? AND b = ?', a, b);
  if (r?.status === 'accepted') return { status: 'friend' };
  if (r && r.requested_by !== uid) { D.run("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ?", a, b); return { status: 'friend' }; }
  if (!r) {
    if (D.get("SELECT COUNT(*) AS n FROM friends WHERE requested_by = ? AND status = 'pending'", uid).n >= 50) fail(429, 'Zu viele offene Anfragen.');
    D.run("INSERT INTO friends (a, b, status, requested_by, created) VALUES (?, ?, 'pending', ?, ?)", a, b, uid, Date.now());
  }
  return { status: 'outgoing' };
}
export function removeFriend(D, uid, other) {
  const [a, b] = pair(uid, other);
  D.run('DELETE FROM friends WHERE a = ? AND b = ?', a, b);
  return { ok: true };
}

// ---------- Admin-Übersicht ----------
export function allGroups(D) {
  return D.all('SELECT * FROM groups ORDER BY created').map((g) => ({
    id: g.id, name: g.name, owner: g.owner, created: g.created,
    members: D.all('SELECT m.user_id AS id, u.name, m.role, m.status FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined', g.id),
  }));
}
export function adminAddMember(D, gid, uid) {
  if (!D.get('SELECT 1 FROM groups WHERE id = ?', gid)) fail(404, 'Gruppe nicht gefunden');
  if (!D.get('SELECT 1 FROM users WHERE id = ?', uid)) fail(404, 'Nutzer nicht gefunden');
  D.run(`INSERT INTO group_members (group_id, user_id, role, status, share, joined) VALUES (?, ?, 'member', 'member', ?, ?)
    ON CONFLICT(group_id, user_id) DO UPDATE SET status = 'member'`, gid, uid, JSON.stringify(SHARE_DEFAULT), Date.now());
  return { ok: true };
}
