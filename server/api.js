// REST-API: /api/...

import { authenticate, redeem, createInvite, rateLimited, noteFail, newId, INVITE_DAYS } from './auth.js';
import { groupData, memberWorkouts, bump, visOf } from './group.js';
import { CHALLENGE_TYPES, VISIBILITY } from '../js/compete.js';

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const KINDS = new Set(['workout', 'routine']);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

export function publicBase(req, cfg) {
  if (cfg.publicUrl) return cfg.publicUrl.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || (req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}
const inviteLink = (req, cfg, code) => `${publicBase(req, cfg)}/#/join/${code}`;

function cleanProfile(p) {
  const out = {};
  if (p.avatar && typeof p.avatar === 'object') {
    out.avatar = Object.fromEntries(['sex', 'hair', 'outfit', 'color', 'face'].map((k) => [k, str(p.avatar[k], 20)]));
  }
  if (Array.isArray(p.bwLog)) {
    out.bwLog = p.bwLog.slice(-2000).map((e) => ({ t: Number(e.t) || 0, kg: Number(e.kg) || 0 })).filter((e) => e.kg > 20 && e.kg < 400);
  }
  if (p.weekGoal != null) out.weekGoal = Math.max(1, Math.min(14, Math.round(Number(p.weekGoal) || 3)));
  if (VISIBILITY.some(([k]) => k === p.visibility)) out.visibility = p.visibility;
  return out;
}

const userOut = (u) => ({ id: u.id, name: u.name, role: u.role });

// ---------------- Handler ----------------
export function makeApi(D, cfg) {
  const routes = [];
  const on = (method, pattern, auth, fn) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, auth, fn });
  };

  // ---- Öffentlich ----
  on('GET', '/api/info', null, () => ({ app: 'gymlog', group: cfg.groupName, version: cfg.version }));

  on('POST', '/api/redeem', null, ({ body, req }) => {
    const ip = req.socket.remoteAddress || '?';
    if (rateLimited(ip)) fail(429, 'Zu viele Versuche. Bitte in 15 Minuten erneut probieren.');
    const r = redeem(D, body.code, body.device);
    if (!r) { noteFail(ip); fail(400, 'Der Schlüssel ist ungültig, abgelaufen oder wurde schon benutzt.'); }
    bump();
    return { token: r.token, user: userOut(r.user), group: cfg.groupName, profile: parse(r.user.profile, {}), profileUpdated: r.user.profile_updated };
  });

  // ---- Eigenes Konto ----
  on('GET', '/api/me', 'user', ({ me }) => ({ user: userOut(me), group: cfg.groupName, profile: parse(me.profile, {}), profileUpdated: me.profile_updated }));

  on('PATCH', '/api/me', 'user', ({ me, body }) => {
    const name = str(body.name, 40);
    if (name) D.run('UPDATE users SET name = ? WHERE id = ?', name, me.id);
    bump();
    return { user: userOut({ ...me, name: name || me.name }) };
  });

  on('POST', '/api/logout', 'user', ({ device }) => { D.run('DELETE FROM devices WHERE id = ?', device.id); return { ok: true }; });

  // ---- Sync ----
  on('POST', '/api/sync', 'user', ({ me, body }) => {
    const cursor = Number(body.cursor) || 0;
    const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
    const pushed = new Set();
    const dupes = [];
    const extra = [];
    D.tx(() => {
      for (const it of items) {
        if (!KINDS.has(it.kind) || !it.id || String(it.id).length > 64) continue;
        const id = String(it.id);
        const data = it.deleted ? null : it.data;
        const summary = it.deleted || it.kind !== 'workout' ? null : it.summary;
        const start = Number(data?.start) || null;
        if (!it.deleted && it.kind === 'workout' && start) {
          // Duplikat (gleiche Startminute + Titel unter anderer ID)?
          const m = Math.floor(start / 60000) * 60000;
          const cands = D.all("SELECT id, data FROM items WHERE user_id = ? AND kind = 'workout' AND deleted = 0 AND id <> ? AND start >= ? AND start < ?", me.id, id, m, m + 60000);
          const dup = cands.find((c) => parse(c.data, {}).title === data.title);
          if (dup && !D.get("SELECT 1 FROM items WHERE user_id = ? AND kind = 'workout' AND id = ?", me.id, id)) {
            dupes.push([id, dup.id]);
            extra.push(dup.id);
            continue;
          }
        }
        const seq = D.nextSeq();
        pushed.add(seq);
        D.run(`INSERT INTO items (user_id, kind, id, data, summary, start, deleted, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, kind, id) DO UPDATE SET data = excluded.data, summary = excluded.summary, start = excluded.start, deleted = excluded.deleted, seq = excluded.seq`,
        me.id, it.kind, id, data ? JSON.stringify(data) : null, summary ? JSON.stringify(summary) : null, start, it.deleted ? 1 : 0, seq);
      }
      if (body.profile && Number(body.profile.updated) > me.profile_updated) {
        const merged = { ...parse(me.profile, {}), ...cleanProfile(body.profile.data || {}) };
        D.run('UPDATE users SET profile = ?, profile_updated = ? WHERE id = ?', JSON.stringify(merged), Number(body.profile.updated), me.id);
      }
    });
    if (items.length || body.profile) bump();

    const rows = D.all('SELECT kind, id, data, deleted, seq FROM items WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT 1000', me.id, cursor);
    let next = cursor;
    const out = [];
    for (const r of rows) {
      next = Math.max(next, r.seq);
      if (pushed.has(r.seq)) continue;
      out.push({ kind: r.kind, id: r.id, deleted: !!r.deleted, data: r.deleted ? null : parse(r.data, null) });
    }
    for (const id of extra) {
      const r = D.get("SELECT kind, id, data FROM items WHERE user_id = ? AND kind = 'workout' AND id = ?", me.id, id);
      if (r && !out.some((o) => o.id === id)) out.push({ kind: r.kind, id: r.id, deleted: false, data: parse(r.data, null) });
    }
    const u = D.get('SELECT name, role, profile, profile_updated FROM users WHERE id = ?', me.id);
    return {
      cursor: next, more: rows.length === 1000, items: out, dupes,
      user: userOut({ ...me, ...u }), profile: parse(u.profile, {}), profileUpdated: u.profile_updated,
    };
  });

  // ---- Gruppe ----
  on('GET', '/api/group', 'user', ({ me }) => {
    const g = groupData(D);
    return {
      me: me.id, group: cfg.groupName, now: Date.now(), members: g.members, season: g.season, seasons: g.seasons,
      titles: g.titles, alltime: g.alltime, challenges: g.challenges,
    };
  });

  on('GET', '/api/members/:id/workouts', 'user', ({ me, params, url }) => {
    const r = memberWorkouts(D, me, params.id, Number(url.searchParams.get('before')) || Infinity, Number(url.searchParams.get('limit')) || 20);
    if (r.error) fail(r.status, r.error);
    return r;
  });

  // ---- Challenges ----
  const challengeOr404 = (id) => D.get('SELECT * FROM challenges WHERE id = ?', id) || fail(404, 'Challenge nicht gefunden');

  on('POST', '/api/challenges', 'user', ({ me, body }) => {
    const T = CHALLENGE_TYPES[body.type];
    if (!T) fail(400, 'Unbekannter Challenge-Typ');
    const title = str(body.title, 80) || T.label;
    const exercise = T.ex ? str(body.exercise, 80) : null;
    if (T.ex && !exercise) fail(400, 'Bitte eine Übung wählen');
    const start = Number(body.start) || Date.now();
    const end = Number(body.end);
    if (!end || end <= start || end - start > 400 * 86400000) fail(400, 'Ungültiger Zeitraum');
    const id = newId();
    D.tx(() => {
      D.run('INSERT INTO challenges (id, creator, title, type, exercise, relative, start, "end", created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, me.id, title, body.type, exercise, T.rel && body.relative ? 1 : 0, start, end, Date.now());
      D.run("INSERT INTO challenge_members (challenge_id, user_id, status) VALUES (?, ?, 'joined')", id, me.id);
      for (const uid of Array.isArray(body.invite) ? body.invite : []) {
        if (uid !== me.id && D.get('SELECT 1 FROM users WHERE id = ? AND disabled = 0', uid)) {
          D.run("INSERT OR IGNORE INTO challenge_members (challenge_id, user_id, status) VALUES (?, ?, 'invited')", id, uid);
        }
      }
    });
    bump();
    return { id };
  });

  on('POST', '/api/challenges/:id/invite', 'user', ({ me, params, body }) => {
    const c = challengeOr404(params.id);
    if (!D.get("SELECT 1 FROM challenge_members WHERE challenge_id = ? AND user_id = ? AND status = 'joined'", c.id, me.id)) fail(403, 'Nur Teilnehmer können einladen');
    for (const uid of Array.isArray(body.users) ? body.users : []) {
      if (D.get('SELECT 1 FROM users WHERE id = ? AND disabled = 0', uid)) D.run("INSERT OR IGNORE INTO challenge_members (challenge_id, user_id, status) VALUES (?, ?, 'invited')", c.id, uid);
    }
    bump();
    return { ok: true };
  });

  on('POST', '/api/challenges/:id/respond', 'user', ({ me, params, body }) => {
    const c = challengeOr404(params.id);
    if (c.end <= Date.now()) fail(400, 'Die Challenge ist schon vorbei');
    const status = body.accept ? 'joined' : 'declined';
    D.run(`INSERT INTO challenge_members (challenge_id, user_id, status) VALUES (?, ?, ?)
      ON CONFLICT(challenge_id, user_id) DO UPDATE SET status = excluded.status`, c.id, me.id, status);
    bump();
    return { ok: true };
  });

  on('POST', '/api/challenges/:id/end', 'user', ({ me, params }) => {
    const c = challengeOr404(params.id);
    if (c.creator !== me.id && me.role !== 'admin') fail(403, 'Nur wer die Challenge erstellt hat, kann sie beenden');
    const now = Date.now();
    D.run('UPDATE challenges SET "end" = ?, start = MIN(start, ?) WHERE id = ?', Math.min(c.end, now), now - 1, c.id);
    bump();
    return { ok: true };
  });

  on('DELETE', '/api/challenges/:id', 'user', ({ me, params }) => {
    const c = challengeOr404(params.id);
    if (c.creator !== me.id && me.role !== 'admin') fail(403, 'Nur wer die Challenge erstellt hat, kann sie löschen');
    D.run('DELETE FROM challenges WHERE id = ?', c.id);
    bump();
    return { ok: true };
  });

  // ---- Admin ----
  on('GET', '/api/admin/users', 'admin', () => {
    const users = D.all('SELECT id, name, role, created, disabled FROM users ORDER BY created');
    const devs = D.all('SELECT id, user_id, name, created, last_seen FROM devices ORDER BY last_seen DESC');
    const inv = D.all('SELECT user_id, expires FROM invites WHERE used_at IS NULL AND expires > ?', Date.now());
    const items = D.all("SELECT user_id, COUNT(*) AS n FROM items WHERE kind = 'workout' AND deleted = 0 GROUP BY user_id");
    return {
      users: users.map((u) => ({
        ...u, disabled: !!u.disabled,
        devices: devs.filter((d) => d.user_id === u.id).map(({ user_id, ...d }) => d),
        pendingInvite: inv.find((i) => i.user_id === u.id)?.expires || null,
        workouts: items.find((i) => i.user_id === u.id)?.n || 0,
      })),
    };
  });

  on('POST', '/api/admin/users', 'admin', ({ body, req }) => {
    const name = str(body.name, 40);
    if (!name) fail(400, 'Name fehlt');
    const id = newId();
    D.run('INSERT INTO users (id, name, role, created) VALUES (?, ?, ?, ?)', id, name, body.role === 'admin' ? 'admin' : 'member', Date.now());
    const inv = createInvite(D, id);
    bump();
    return { user: { id, name }, code: inv.code, expires: inv.expires, link: inviteLink(req, cfg, inv.code), days: INVITE_DAYS };
  });

  on('POST', '/api/admin/users/:id/invite', 'admin', ({ params, req }) => {
    const u = D.get('SELECT * FROM users WHERE id = ?', params.id) || fail(404, 'Nutzer nicht gefunden');
    const inv = createInvite(D, u.id);
    return { user: userOut(u), code: inv.code, expires: inv.expires, link: inviteLink(req, cfg, inv.code), days: INVITE_DAYS };
  });

  on('PATCH', '/api/admin/users/:id', 'admin', ({ me, params, body }) => {
    const u = D.get('SELECT * FROM users WHERE id = ?', params.id) || fail(404, 'Nutzer nicht gefunden');
    if (u.id === me.id && (body.role === 'member' || body.disabled)) fail(400, 'Du kannst dich nicht selbst herabstufen oder sperren');
    if (body.name) D.run('UPDATE users SET name = ? WHERE id = ?', str(body.name, 40), u.id);
    if (body.role === 'admin' || body.role === 'member') D.run('UPDATE users SET role = ? WHERE id = ?', body.role, u.id);
    if (body.disabled != null) {
      D.run('UPDATE users SET disabled = ? WHERE id = ?', body.disabled ? 1 : 0, u.id);
      if (body.disabled) D.run('DELETE FROM devices WHERE user_id = ?', u.id);
    }
    bump();
    return { ok: true };
  });

  on('DELETE', '/api/admin/users/:id', 'admin', ({ me, params }) => {
    if (params.id === me.id) fail(400, 'Du kannst dich nicht selbst löschen');
    D.run('DELETE FROM users WHERE id = ?', params.id);
    bump();
    return { ok: true };
  });

  on('DELETE', '/api/admin/devices/:id', 'admin', ({ params }) => {
    D.run('DELETE FROM devices WHERE id = ?', params.id);
    return { ok: true };
  });

  // ---------------- Dispatcher ----------------
  return async function handle(req, res, url, readBody) {
    const send = (status, obj) => {
      const s = JSON.stringify(obj);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(s);
    };
    try {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) return send(404, { error: 'Nicht gefunden' });
      const m = r.re.exec(url.pathname);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      let ctx = { req, url, params, body: {} };
      if (r.auth) {
        const a = authenticate(D, req.headers.authorization);
        if (!a) return send(401, { error: 'Nicht angemeldet' });
        if (r.auth === 'admin' && a.user.role !== 'admin') return send(403, { error: 'Nur für Admins' });
        ctx = { ...ctx, me: a.user, device: a.device };
      }
      if (req.method !== 'GET') ctx.body = (await readBody()) || {};
      send(200, await r.fn(ctx));
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      if (e.type === 'body') return send(e.status || 400, { error: e.message });
      console.error(e);
      send(500, { error: 'Serverfehler' });
    }
  };
}

export { visOf };
