// REST-API: /api/...

import {
  authenticate, redeem, createInvite, rateLimited, noteFail, newId, INVITE_DAYS,
  login, normUser, hashPassword, newPassword, newToken, newDevice, sha,
} from './auth.js';
import { groupData, memberWorkouts, bump, visOf } from './group.js';
import { cleanSummary } from './summary.js';
import * as strava from './strava.js';
import * as G from './groups.js';
import fs from 'node:fs';
import path from 'node:path';
import * as garmin from './garmin.js';
import { CHALLENGE_TYPES, VISIBILITY } from '../js/compete.js';

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
// ext = nur Punkte-Grundlage (Strava vom Handy): Start, Dauer – keine Details, nie an andere Geräte zurück
const KINDS = new Set(['workout', 'routine', 'ext']);
const MAX_PREFS = 600000;
const TRANSFER_TTL = 10 * 60000;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Einstellungen: beliebige JSON-Struktur, aber ohne gefährliche Schlüssel und begrenzt in Tiefe/Länge
function cleanPrefs(v, depth = 0) {
  if (depth > 12) return null;
  if (v == null || typeof v === 'boolean') return v ?? null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v.slice(0, 5000);
  if (Array.isArray(v)) return v.slice(0, 5000).map((x) => cleanPrefs(x, depth + 1));
  if (typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v).slice(0, 2000)) if (!BAD_KEYS.has(k) && k.length <= 120) o[k] = cleanPrefs(x, depth + 1);
    return o;
  }
  return null;
}

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

export function publicBase(req, cfg) {
  if (cfg.publicUrl) return cfg.publicUrl.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || (req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}
const inviteLink = (req, cfg, code) => `${publicBase(req, cfg)}/#/join/${code}`;
// Anmelde-Link: App (z. B. GitHub Pages, APP_URL) + Server-Adresse + Benutzername
const loginLink = (req, cfg, username) => {
  const server = publicBase(req, cfg);
  const app = (cfg.appUrl || server).replace(/\/$/, '');
  return `${app}/#/login?${new URLSearchParams({ ...(app !== server ? { server } : {}), user: username || '' })}`;
};
// Hinter Caddy/Cloudflare kommt die echte Adresse im X-Forwarded-For-Header
// Absender-IP: X-Forwarded-For nur glauben, wenn die Anfrage vom eigenen Proxy (Tailscale, lokal) kommt,
// und dann den letzten Eintrag nehmen – den hat der Proxy angehängt; frühere Einträge kann jeder fälschen.
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export const clientIp = (req) => {
  const peer = req.socket?.remoteAddress || '?';
  if (process.env.TRUST_PROXY === '0' || !LOCAL.has(peer)) return peer;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || peer;
};
// Allgemeine Bremse gegen Massenanfragen (Skripte, Bots, KI-Agenten): feste Zeitfenster pro Schlüssel
const hits = new Map();
function tooMany(key, max, windowMs) {
  const now = Date.now();
  let h = hits.get(key);
  if (!h || now - h.t > windowMs) { h = { t: now, n: 0 }; hits.set(key, h); }
  h.n++;
  if (hits.size > 50000) for (const [k, v] of hits) if (now - v.t > 600000) hits.delete(k);
  return h.n > max;
}

function cleanProfile(p) {
  const out = {};
  if (p.avatar && typeof p.avatar === 'object') {
    out.avatar = Object.fromEntries(['sex', 'hair', 'outfit', 'color', 'face'].map((k) => [k, str(p.avatar[k], 20)]));
    // freischaltbare Objekte (nur kurze Kennungen)
    const it = p.avatar.items && typeof p.avatar.items === 'object' ? p.avatar.items : {};
    out.avatar.items = Object.fromEntries(['hat', 'face', 'hand'].map((k) => [k, /^[a-z]{2,20}$/.test(it[k] || '') ? it[k] : null]));
  }
  if (Array.isArray(p.bwLog)) {
    out.bwLog = p.bwLog.slice(-2000).map((e) => ({ t: Number(e.t) || 0, kg: Number(e.kg) || 0 })).filter((e) => e.kg > 20 && e.kg < 400);
  }
  if (p.weekGoal != null) out.weekGoal = Math.max(1, Math.min(14, Math.round(Number(p.weekGoal) || 3)));
  if (VISIBILITY.some(([k]) => k === p.visibility)) out.visibility = p.visibility;
  return out;
}

const userOut = (u) => ({ id: u.id, name: u.name, role: u.role, username: u.username || null });

const MAX_ITEM = 300000; // Zeichen pro gespeichertem Workout/Routine

// ---------------- Handler ----------------
export function makeApi(D, cfg) {
  const routes = [];
  const on = (method, pattern, auth, fn) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    routes.push({ method, re, keys, auth, fn });
  };

  G.ensureDefaultGroup(D, cfg.groupName);
  const started = Date.now();
  const gx = (fn) => { try { return fn(); } catch (e) { fail(e.status || 400, e.message); } };
  // Gruppe aus der Anfrage (?g=…) – muss eine eigene sein; sonst die erste eigene
  const ensureGroups = () => { if (!D.get('SELECT 1 FROM groups LIMIT 1')) G.ensureDefaultGroup(D, cfg.groupName); };
  const groupFor = (me, url) => {
    ensureGroups();
    const want = url.searchParams.get('g');
    const mine = G.myGroups(D, me.id).groups;
    if (want) { if (!mine.some((x) => x.id === want) && me.role !== 'admin') fail(403, 'Du bist nicht in dieser Gruppe.'); return want; }
    return mine[0]?.id || null;
  };

  // ---- Öffentlich ----
  on('GET', '/api/info', null, () => ({ app: 'gymlog', group: cfg.groupName, version: cfg.version, private: !!cfg.privateApp }));
  // Anmelde-Cookie (nur für die App-Dateien; die API selbst prüft weiter den Token im Header)
  const secure = (req) => /^https:/i.test(cfg.publicUrl || '') || req.headers['x-forwarded-proto'] === 'https';
  const setSession = (ctx, token) => ctx.cookie(`gym_s=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=34560000${secure(ctx.req) ? '; Secure' : ''}`);
  const clearSession = (ctx) => ctx.cookie(`gym_s=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure(ctx.req) ? '; Secure' : ''}`);
  // Umzug auf ein neues Gerät/eine neue Adresse ohne Passwort: angemeldetes Gerät holt einen Einmal-Code (10 Min.)
  on('POST', '/api/transfer', 'user', ({ me }) => {
    const code = newToken();
    D.run('DELETE FROM transfers WHERE created < ? OR user_id = ?', Date.now() - TRANSFER_TTL, me.id);
    D.run('INSERT INTO transfers (code_hash, user_id, created) VALUES (?, ?, ?)', sha(code), me.id, Date.now());
    return { code, expires: Date.now() + TRANSFER_TTL };
  });
  on('POST', '/api/transfer/redeem', null, (ctx) => {
    const ip = clientIp(ctx.req);
    if (rateLimited(ip, 20)) fail(429, 'Zu viele Versuche. Bitte in 15 Minuten erneut probieren.');
    const h = sha(String(ctx.body.code || ''));
    const t = D.get('SELECT * FROM transfers WHERE code_hash = ?', h);
    if (t) D.run('DELETE FROM transfers WHERE code_hash = ?', h); // nur einmal benutzbar
    const user = t && t.created > Date.now() - TRANSFER_TTL && D.get('SELECT * FROM users WHERE id = ? AND disabled = 0', t.user_id);
    if (!user) { noteFail(ip); fail(400, 'Der Umzugs-Link ist abgelaufen. Bitte in der alten App nochmal auf „Umziehen“ tippen – oder hier normal anmelden.'); }
    const token = newDevice(D, user.id, ctx.body.device);
    setSession(ctx, token);
    bump();
    return { token, user: userOut(user), group: cfg.groupName, profile: parse(user.profile, {}), profileUpdated: user.profile_updated };
  });
  // Bereits angemeldete Geräte (Token im Speicher) holen sich das Cookie nach
  on('POST', '/api/session', 'user', (ctx) => { setSession(ctx, /^Bearer (.+)$/.exec(ctx.req.headers.authorization)[1]); return { ok: true }; });

  on('POST', '/api/redeem', null, (ctx) => {
    const { body, req } = ctx;
    const ip = clientIp(req);
    if (rateLimited(ip)) fail(429, 'Zu viele Versuche. Bitte in 15 Minuten erneut probieren.');
    const r = redeem(D, body.code, body.device);
    if (!r) { noteFail(ip); fail(400, 'Der Schlüssel ist ungültig, abgelaufen oder wurde schon benutzt.'); }
    bump();
    setSession(ctx, r.token);
    return { token: r.token, user: userOut(r.user), group: cfg.groupName, profile: parse(r.user.profile, {}), profileUpdated: r.user.profile_updated };
  });

  on('POST', '/api/login', null, (ctx) => {
    const { body, req } = ctx;
    const ip = clientIp(req);
    const user = normUser(body.username);
    // pro IP großzügiger (Freunde im selben WLAN teilen sich eine IP), pro Benutzername streng
    if (rateLimited(ip, 30) || rateLimited(`u:${user}`, 10) || rateLimited('all-logins', 300)) fail(429, 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut probieren.');
    if (typeof body.password !== 'string' || body.password.length > 200) fail(400, 'Benutzername oder Passwort falsch.');
    const r = login(D, user, body.password, body.device);
    if (!r) { noteFail(ip); noteFail(`u:${user}`); noteFail('all-logins'); fail(400, 'Benutzername oder Passwort falsch.'); }
    bump();
    setSession(ctx, r.token);
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

  on('POST', '/api/logout', 'user', (ctx) => { D.run('DELETE FROM devices WHERE id = ?', ctx.device.id); clearSession(ctx); return { ok: true }; });

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
        if (!it.deleted && (!data || typeof data !== 'object' || JSON.stringify(data).length > MAX_ITEM)) continue;
        let summary = null;
        if (!it.deleted && it.kind === 'workout') {
          summary = cleanSummary(it.summary);
          // Historie (Import, Strava vor der Verbindung): sichtbar nur privat, keine XP
          if (summary) { if (data.source === 'import' || data.hist) summary.h = 1; else delete summary.h; }
        } else if (!it.deleted && it.kind === 'ext') {
          // nur Start + Dauer: daraus werden XP (Workout, Trainingsminuten, Wochenziel); sonst nichts gespeichert
          const st = Number(data.start), dur = Math.max(0, Math.min(86400, Number(data.dur) || 0));
          if (!Number.isFinite(st) || !dur) continue;
          it.data = { start: st, dur };
          summary = cleanSummary({ start: st, end: st + dur * 1000, title: '', dur, sets: 0, cmin: Math.round(dur / 60), ex: [] });
          if (!summary) continue;
        }
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
        me.id, it.kind, id, it.kind === 'ext' && it.data ? JSON.stringify(it.data) : data ? JSON.stringify(data) : null, summary ? JSON.stringify(summary) : null, start, it.deleted ? 1 : 0, seq);
      }
      // Einstellungen + eigene Übungen (nur die eigenen, nie für andere sichtbar)
      const pu = Number(body.prefs?.updated);
      if (body.prefs && pu > (me.prefs_updated || 0) && pu < Date.now() + 864e5) {
        const json = JSON.stringify(cleanPrefs(body.prefs.data));
        if (json.length <= MAX_PREFS) D.run('UPDATE users SET prefs = ?, prefs_updated = ? WHERE id = ?', json, pu, me.id);
      }
      if (body.profile && Number(body.profile.updated) > me.profile_updated) {
        const merged = { ...parse(me.profile, {}), ...cleanProfile(body.profile.data || {}) };
        // ältere App-Versionen: eine Sichtbarkeit für alles → in allen Gruppen übernehmen
        const vis = body.profile.data?.visibility;
        if (VISIBILITY.some(([k]) => k === vis)) {
          for (const m of D.all('SELECT group_id, share FROM group_members WHERE user_id = ?', me.id)) {
            D.run('UPDATE group_members SET share = ? WHERE group_id = ? AND user_id = ?', JSON.stringify(G.cleanShare({ workouts: vis }, G.cleanShare(parse(m.share, null)))), m.group_id, me.id);
          }
        }
        D.run('UPDATE users SET profile = ?, profile_updated = ? WHERE id = ?', JSON.stringify(merged), Number(body.profile.updated), me.id);
      }
    });
    if (items.length || body.profile) bump();

    const rows = D.all("SELECT kind, id, data, deleted, seq FROM items WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT 1000", me.id, cursor);
    let next = cursor;
    const out = [];
    for (const r of rows) {
      next = Math.max(next, r.seq);
      if (pushed.has(r.seq) || r.kind === 'ext') continue;
      out.push({ kind: r.kind, id: r.id, deleted: !!r.deleted, data: r.deleted ? null : parse(r.data, null) });
    }
    for (const id of extra) {
      const r = D.get("SELECT kind, id, data FROM items WHERE user_id = ? AND kind = 'workout' AND id = ?", me.id, id);
      if (r && !out.some((o) => o.id === id)) out.push({ kind: r.kind, id: r.id, deleted: false, data: parse(r.data, null) });
    }
    const u = D.get('SELECT name, role, profile, profile_updated, prefs, prefs_updated FROM users WHERE id = ?', me.id);
    // Einstellungen nur schicken, wenn das Gerät einen älteren Stand hat
    const prefsNew = u.prefs_updated > (Number(body.prefsSeen) || 0) && u.prefs;
    return {
      cursor: next, more: rows.length === 1000, items: out, dupes,
      user: userOut({ ...me, ...u }), profile: parse(u.profile, {}), profileUpdated: u.profile_updated,
      prefsUpdated: u.prefs_updated, ...(prefsNew ? { prefs: parse(u.prefs, null) } : {}),
    };
  });

  // ---- Einstellbare Werte (Punkte, Erfolge, Events …), vom Admin im Dashboard gepflegt ----
  const CONFIG_KEYS = new Set(['points', 'achievements', 'events', 'unlockables', 'exercises', 'features']);
  on('GET', '/api/config', 'user', () => {
    const out = {};
    for (const r of D.all('SELECT key, value, updated FROM app_config')) out[r.key] = { value: parse(r.value, null), updated: r.updated };
    return out;
  });
  on('PUT', '/api/admin/config/:key', 'admin', ({ params, body }) => {
    if (!CONFIG_KEYS.has(params.key)) fail(400, 'Unbekannter Bereich');
    const json = JSON.stringify(cleanPrefs(body.value));
    if (json.length > 400000) fail(413, 'Zu groß');
    D.run('INSERT INTO app_config (key, value, updated) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated', params.key, json, Date.now());
    bump();
    return { ok: true };
  });

  // ---- Gruppe ----
  on('GET', '/api/group', 'user', ({ me, url }) => {
    const gid = groupFor(me, url);
    if (!gid) return { me: me.id, group: '', groupId: null, none: true, now: Date.now(), members: [], season: { rows: [], month: { rows: [] }, months: [] }, seasons: [], titles: {}, alltime: {}, kings: { month: {}, season: {}, all: {} }, exercises: {}, challenges: [], trends: null };
    const { users, ...g } = groupData(D, gid);
    const meta = D.get('SELECT name FROM groups WHERE id = ?', gid);
    return { me: me.id, group: meta?.name || '', groupId: gid, now: Date.now(), ...g };
  });

  on('GET', '/api/members/:id/workouts', 'user', ({ me, params, url }) => {
    const gid = groupFor(me, url);
    if (!gid) fail(404, 'Keine Gruppe');
    const r = memberWorkouts(D, me, params.id, gid, Number(url.searchParams.get('before')) || Infinity, Number(url.searchParams.get('limit')) || 20);
    if (r.error) fail(r.status, r.error);
    return r;
  });

  // ---- Gruppen (mehrere Freundeskreise) ----
  on('GET', '/api/groups', 'user', ({ me }) => { ensureGroups(); return G.myGroups(D, me.id); });
  on('POST', '/api/groups', 'user', ({ me, body }) => { const r = gx(() => G.createGroup(D, me, body.name)); bump(); return r; });
  on('POST', '/api/groups/join', 'user', ({ me, body, req }) => {
    const ip = clientIp(req);
    if (rateLimited(`gjoin:${me.id}`, 10) || rateLimited(ip, 30)) fail(429, 'Zu viele Versuche. Bitte später erneut probieren.');
    try { const r = G.joinByCode(D, me, body.code); bump(); return r; } catch (e) { noteFail(`gjoin:${me.id}`); fail(e.status || 400, e.message); }
  });
  on('POST', '/api/groups/:id/code', 'user', ({ me, params }) => gx(() => G.newGroupCode(D, me, params.id)));
  on('POST', '/api/groups/:id/invite', 'user', ({ me, params, body }) => { const r = gx(() => G.inviteToGroup(D, me, params.id, String(body.user || ''))); bump(); return r; });
  on('POST', '/api/groups/:id/respond', 'user', ({ me, params, body }) => { const r = gx(() => G.respondInvite(D, me, params.id, !!body.accept)); bump(); return r; });
  on('POST', '/api/groups/:id/leave', 'user', ({ me, params }) => { const r = gx(() => G.leaveGroup(D, me.id, params.id)); bump(); return r; });
  on('PATCH', '/api/groups/:id', 'user', ({ me, params, body }) => { const r = gx(() => G.renameGroup(D, me, params.id, body.name)); bump(); return r; });
  on('PATCH', '/api/groups/:id/share', 'user', ({ me, params, body }) => { const r = gx(() => G.setShare(D, me.id, params.id, body)); bump(); return r; });
  on('PATCH', '/api/groups/:id/members/:uid', 'user', ({ me, params, body }) => { const r = gx(() => G.setMemberRole(D, me, params.id, params.uid, body.role)); bump(); return r; });
  on('DELETE', '/api/groups/:id/members/:uid', 'user', ({ me, params }) => { const r = gx(() => G.removeMember(D, me, params.id, params.uid)); bump(); return r; });
  on('DELETE', '/api/groups/:id', 'user', ({ me, params }) => { const r = gx(() => G.deleteGroup(D, me, params.id)); bump(); return r; });

  // ---- Freunde (nur Konten auf diesem Server) ----
  on('GET', '/api/friends', 'user', ({ me }) => G.friendsOf(D, me.id));
  on('GET', '/api/users/search', 'user', ({ me, url }) => {
    if (rateLimited(`search:${me.id}`, 60)) fail(429, 'Bitte kurz warten.');
    noteFail(`search:${me.id}`);
    return G.searchUsers(D, me.id, url.searchParams.get('q'));
  });
  on('POST', '/api/friends/:id', 'user', ({ me, params }) => gx(() => G.requestFriend(D, me.id, params.id)));
  on('DELETE', '/api/friends/:id', 'user', ({ me, params }) => G.removeFriend(D, me.id, params.id));

  // ---- Challenges ----
  const challengeOr404 = (id) => D.get('SELECT * FROM challenges WHERE id = ?', id) || fail(404, 'Challenge nicht gefunden');

  on('POST', '/api/challenges', 'user', ({ me, body }) => {
    const gid = String(body.group || '') || G.myGroups(D, me.id).groups[0]?.id;
    if (!gid || !G.isMember(D, gid, me.id)) fail(403, 'Bitte zuerst einer Gruppe beitreten.');
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
      D.run('INSERT INTO challenges (id, creator, title, type, exercise, relative, start, "end", created, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, me.id, title, body.type, exercise, T.rel && body.relative ? 1 : 0, start, end, Date.now(), gid);
      D.run("INSERT INTO challenge_members (challenge_id, user_id, status) VALUES (?, ?, 'joined')", id, me.id);
      for (const uid of Array.isArray(body.invite) ? body.invite : []) {
        if (uid !== me.id && G.isMember(D, gid, uid)) {
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
      if (G.isMember(D, c.group_id, uid)) D.run("INSERT OR IGNORE INTO challenge_members (challenge_id, user_id, status) VALUES (?, ?, 'invited')", c.id, uid);
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

  // ---- Tickets (Wünsche & Fehler) ----
  const TICKET_TYPES = new Set(['wish', 'bug']);
  const TICKET_STATUS = new Set(['open', 'progress', 'done', 'rejected']);
  const ticketOr404 = (id) => D.get('SELECT * FROM tickets WHERE id = ?', id) || fail(404, 'Ticket nicht gefunden');

  on('GET', '/api/tickets', 'user', ({ me }) => {
    const votes = D.all('SELECT ticket_id, user_id FROM ticket_votes');
    const comments = D.all('SELECT id, ticket_id, user_id, author, body, created FROM ticket_comments ORDER BY created');
    const tickets = D.all('SELECT * FROM tickets ORDER BY updated DESC LIMIT 500').map((t) => ({
      id: t.id, type: t.type, title: t.title, body: t.body, device: t.device, status: t.status, created: t.created, updated: t.updated,
      author: t.author, mine: t.user_id === me.id,
      votes: votes.filter((v) => v.ticket_id === t.id).length, voted: votes.some((v) => v.ticket_id === t.id && v.user_id === me.id),
      comments: comments.filter((c) => c.ticket_id === t.id).map((c) => ({ id: c.id, author: c.author, body: c.body, created: c.created, mine: c.user_id === me.id })),
    }));
    return { tickets, admin: me.role === 'admin' };
  });

  on('POST', '/api/tickets', 'user', ({ me, body }) => {
    const type = TICKET_TYPES.has(body.type) ? body.type : 'wish';
    const title = str(body.title, 120);
    if (!title) fail(400, 'Titel fehlt');
    if (D.get('SELECT COUNT(*) AS n FROM tickets WHERE user_id = ? AND created > ?', me.id, Date.now() - 3600e3).n >= 20) fail(429, 'Zu viele Tickets – bitte später nochmal');
    const id = newId();
    const now = Date.now();
    D.run('INSERT INTO tickets (id, user_id, author, type, title, body, device, status, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, me.id, me.name, type, title, str(body.body, 4000), str(body.device, 200), 'open', now, now);
    return { id };
  });

  on('PATCH', '/api/tickets/:id', 'user', ({ me, params, body }) => {
    const t = ticketOr404(params.id);
    const admin = me.role === 'admin';
    if (!admin && t.user_id !== me.id) fail(403, 'Nur eigene Tickets bearbeiten');
    const patch = {};
    if (body.title != null && t.user_id === me.id) patch.title = str(body.title, 120) || t.title;
    if (body.body != null && t.user_id === me.id) patch.body = str(body.body, 4000);
    if (body.status != null) {
      if (!TICKET_STATUS.has(body.status)) fail(400, 'Unbekannter Status');
      if (!admin && body.status !== 'done') fail(403, 'Nur der Admin setzt den Status');
      patch.status = body.status;
    }
    const keys = Object.keys(patch);
    if (keys.length) D.run(`UPDATE tickets SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated = ? WHERE id = ?`, ...keys.map((k) => patch[k]), Date.now(), t.id);
    return { ok: true };
  });

  on('POST', '/api/tickets/:id/vote', 'user', ({ me, params, body }) => {
    const t = ticketOr404(params.id);
    if (body.on === false) D.run('DELETE FROM ticket_votes WHERE ticket_id = ? AND user_id = ?', t.id, me.id);
    else D.run('INSERT OR IGNORE INTO ticket_votes (ticket_id, user_id) VALUES (?, ?)', t.id, me.id);
    return { ok: true };
  });

  on('POST', '/api/tickets/:id/comments', 'user', ({ me, params, body }) => {
    const t = ticketOr404(params.id);
    const text = str(body.body, 2000);
    if (!text) fail(400, 'Kommentar ist leer');
    const now = Date.now();
    D.run('INSERT INTO ticket_comments (id, ticket_id, user_id, author, body, created) VALUES (?, ?, ?, ?, ?, ?)', newId(), t.id, me.id, me.name, text, now);
    D.run('UPDATE tickets SET updated = ? WHERE id = ?', now, t.id);
    return { ok: true };
  });

  on('DELETE', '/api/tickets/:id', 'user', ({ me, params }) => {
    const t = ticketOr404(params.id);
    if (me.role !== 'admin' && t.user_id !== me.id) fail(403, 'Nur eigene Tickets löschen');
    D.run('DELETE FROM tickets WHERE id = ?', t.id);
    return { ok: true };
  });

  // ---- Strava: läuft auf dem Handy; der Server reicht nur den Freigabe-Code weiter ----
  on('POST', '/api/strava/relay/start', 'user', ({ me, req }) => strava.relayStart(D, me.id, publicBase(req, cfg)));
  on('GET', '/api/strava/relay', null, ({ url, req }) => strava.relayCallback(D, url, cfg.appUrl || publicBase(req, cfg)));
  on('GET', '/api/strava/relay/code', 'user', ({ me, url }) => strava.relayCode(D, me.id, url.searchParams.get('state')));
  // Alte Server-Verbindung (bis v3.11): Status ansehen und entfernen bleibt immer möglich
  on('GET', '/api/strava', 'user', ({ me, req }) => strava.status(D, me.id, publicBase(req, cfg)));
  on('DELETE', '/api/strava', 'user', async ({ me, url }) => {
    await strava.disconnect(D, me.id, url.searchParams.get('remove') === '1');
    return { ok: true };
  });
  // Der alte Weg über den Server (Abholen auf dem Server) nur noch mit STRAVA_SERVER=1
  if (process.env.STRAVA_SERVER === '1') {
    on('POST', '/api/strava/config', 'user', ({ me, body, req }) => {
      try { strava.saveConfig(D, me.id, body); } catch (e) { fail(e.status || 400, e.message); }
      return strava.status(D, me.id, publicBase(req, cfg));
    });
    on('POST', '/api/strava/authorize', 'user', ({ me, req }) => {
      try { return { url: strava.authorizeUrl(D, me.id, publicBase(req, cfg)) }; } catch (e) { fail(e.status || 400, e.message); }
    });
    on('GET', '/api/strava/callback', null, ({ url, req }) => strava.callback(D, url, cfg.appUrl || publicBase(req, cfg)));
    on('POST', '/api/strava/sync', 'user', async ({ me }) => {
      if (rateLimited(`strava:${me.id}`, 20)) fail(429, 'Bitte kurz warten.');
      noteFail(`strava:${me.id}`);
      try { return await strava.syncUser(D, me.id); } catch (e) { fail(e.status || 502, e.message); }
    });
    on('POST', '/api/strava/backfill', 'user', async ({ me, body }) => {
      if (rateLimited(`strava:${me.id}`, 20)) fail(429, 'Bitte kurz warten.');
      noteFail(`strava:${me.id}`);
      try { strava.setImportFrom(D, me.id, body?.from); return await strava.syncUser(D, me.id); } catch (e) { fail(e.status || 502, e.message); }
    });
  }

  // ---- Garmin (persönlicher API-Schlüssel aus Garmin Connect) ----
  // Vorerst aus: die Bedingungen der Garmin Personal API verbieten, den Schlüssel an andere (den Gruppen-Server) weiterzugeben.
  // Code bleibt für später; einschalten nur mit GARMIN_ENABLED=1.
  if (process.env.GARMIN_ENABLED === '1') {
    on('GET', '/api/garmin', 'user', ({ me }) => garmin.status(D, me.id));
    on('POST', '/api/garmin/config', 'user', async ({ me, body }) => {
      if (rateLimited(`garmin:${me.id}`, 20)) fail(429, 'Bitte kurz warten.');
      noteFail(`garmin:${me.id}`);
      try { await garmin.saveConfig(D, me.id, body || {}); } catch (e) { fail(e.status || 400, e.message); }
      const r = await garmin.syncUser(D, me.id).catch((e) => ({ added: 0, error: e.message }));
      return { ...garmin.status(D, me.id), added: r.added, syncError: r.error || '' };
    });
    on('POST', '/api/garmin/sync', 'user', async ({ me }) => {
      if (rateLimited(`garmin:${me.id}`, 20)) fail(429, 'Bitte kurz warten.');
      noteFail(`garmin:${me.id}`);
      try { return await garmin.syncUser(D, me.id); } catch (e) { fail(e.status || 502, e.message); }
    });
    on('POST', '/api/garmin/backfill', 'user', async ({ me, body }) => {
      if (rateLimited(`garmin:${me.id}`, 20)) fail(429, 'Bitte kurz warten.');
      noteFail(`garmin:${me.id}`);
      try { garmin.setImportFrom(D, me.id, body?.from); return await garmin.syncUser(D, me.id); } catch (e) { fail(e.status || 502, e.message); }
    });
    on('DELETE', '/api/garmin', 'user', ({ me, url }) => {
      garmin.disconnect(D, me.id, url.searchParams.get('remove') === '1');
      return { ok: true };
    });
  }

  // ---- Admin ----
  on('GET', '/api/admin/users', 'admin', () => {
    const users = D.all('SELECT id, name, role, created, disabled, username, pw_hash IS NOT NULL AS hasPassword FROM users ORDER BY created');
    const devs = D.all('SELECT id, user_id, name, created, last_seen FROM devices ORDER BY last_seen DESC');
    const inv = D.all('SELECT user_id, expires FROM invites WHERE used_at IS NULL AND expires > ?', Date.now());
    const items = D.all("SELECT user_id, COUNT(*) AS n FROM items WHERE kind = 'workout' AND deleted = 0 GROUP BY user_id");
    return {
      users: users.map((u) => ({
        ...u, disabled: !!u.disabled, hasPassword: !!u.hasPassword,
        devices: devs.filter((d) => d.user_id === u.id).map(({ user_id, ...d }) => d),
        pendingInvite: inv.find((i) => i.user_id === u.id)?.expires || null,
        workouts: items.find((i) => i.user_id === u.id)?.n || 0,
      })),
    };
  });

  // Nutzer anlegen: Admin legt Benutzername + Passwort fest (leer = zufälliges Passwort)
  const access = (req, u, password) => ({ user: userOut(u), username: u.username, password, server: publicBase(req, cfg), link: loginLink(req, cfg, u.username) });
  const checkUsername = (username, exceptId = '') => {
    if (username.length < 2) fail(400, 'Benutzername zu kurz (mind. 2 Zeichen: a–z, 0–9, Punkt, Strich)');
    if (D.get('SELECT 1 FROM users WHERE username = ? AND id != ?', username, exceptId)) fail(400, `Benutzername „${username}“ ist schon vergeben`);
  };
  const checkPassword = (pw) => { if (String(pw).length < 6) fail(400, 'Passwort zu kurz (mind. 6 Zeichen)'); };

  on('POST', '/api/admin/users', 'admin', ({ body, req }) => {
    const name = str(body.name, 40);
    if (!name) fail(400, 'Name fehlt');
    const username = normUser(body.username || name);
    checkUsername(username);
    const password = body.password ? String(body.password) : newPassword();
    checkPassword(password);
    const id = newId();
    D.run('INSERT INTO users (id, name, role, created, username, pw_hash) VALUES (?, ?, ?, ?, ?, ?)',
      id, name, body.role === 'admin' ? 'admin' : 'member', Date.now(), username, hashPassword(password));
    // in Gruppen aufnehmen (Standard: erste Gruppe des Servers)
    const gids = Array.isArray(body.groups) ? body.groups : [G.defaultGroupId(D)].filter(Boolean);
    for (const gid of gids.slice(0, 20)) { try { G.adminAddMember(D, String(gid), id); } catch { /* unbekannte Gruppe */ } }
    bump();
    return access(req, { id, name, role: body.role === 'admin' ? 'admin' : 'member', username }, password);
  });

  // Passwort neu setzen (leer = zufällig); optional alle Geräte abmelden
  on('POST', '/api/admin/users/:id/password', 'admin', ({ params, body, req }) => {
    const u = D.get('SELECT * FROM users WHERE id = ?', params.id) || fail(404, 'Nutzer nicht gefunden');
    const password = body.password ? String(body.password) : newPassword();
    checkPassword(password);
    let username = u.username;
    if (!username) { username = normUser(u.name); checkUsername(username, u.id); }
    D.run('UPDATE users SET pw_hash = ?, username = ? WHERE id = ?', hashPassword(password), username, u.id);
    if (body.logoutDevices) D.run('DELETE FROM devices WHERE user_id = ?', u.id);
    return access(req, { ...u, username }, password);
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
    if (body.username != null) { const un = normUser(body.username); checkUsername(un, u.id); D.run('UPDATE users SET username = ? WHERE id = ?', un, u.id); }
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

  on('GET', '/api/admin/overview', 'admin', () => {
    let dbBytes = 0;
    try { for (const f of ['gymlog.db', 'gymlog.db-wal']) { const p = path.join(cfg.dataDir, f); if (fs.existsSync(p)) dbBytes += fs.statSync(p).size; } } catch { /* egal */ }
    const day = Date.now() - 864e5;
    return {
      version: cfg.version, group: cfg.groupName, uptime: Date.now() - started, dbBytes, node: process.version,
      users: D.get('SELECT COUNT(*) AS n FROM users').n, activeUsers: D.get('SELECT COUNT(DISTINCT user_id) AS n FROM devices WHERE last_seen > ?', day).n,
      groups: D.get('SELECT COUNT(*) AS n FROM groups').n, workouts: D.get("SELECT COUNT(*) AS n FROM items WHERE kind = 'workout' AND deleted = 0").n,
      workoutsToday: D.get("SELECT COUNT(*) AS n FROM items WHERE kind = 'workout' AND deleted = 0 AND start > ?", day).n,
      tickets: D.get("SELECT COUNT(*) AS n FROM tickets WHERE status IN ('open', 'progress')").n,
      devices: D.get('SELECT COUNT(*) AS n FROM devices').n, privateApp: !!cfg.privateApp,
    };
  });
  on('GET', '/api/admin/groups', 'admin', () => ({ groups: G.allGroups(D) }));
  on('POST', '/api/admin/groups', 'admin', ({ me, body }) => { const r = gx(() => G.createGroup(D, me, body.name)); bump(); return r; });
  on('PATCH', '/api/admin/groups/:id', 'admin', ({ me, params, body }) => { const r = gx(() => G.renameGroup(D, me, params.id, body.name)); bump(); return r; });
  on('DELETE', '/api/admin/groups/:id', 'admin', ({ me, params }) => { const r = gx(() => G.deleteGroup(D, me, params.id)); bump(); return r; });
  on('POST', '/api/admin/groups/:id/members', 'admin', ({ params, body }) => { const r = gx(() => G.adminAddMember(D, params.id, String(body.user || ''))); bump(); return r; });
  on('DELETE', '/api/admin/groups/:id/members/:uid', 'admin', ({ me, params }) => { const r = gx(() => G.removeMember(D, me, params.id, params.uid)); bump(); return r; });
  on('POST', '/api/admin/groups/:id/code', 'admin', ({ me, params }) => gx(() => G.newGroupCode(D, me, params.id)));
  // Punkte-Balance: wie sähen Saison und Monat mit neuen Werten aus?
  on('POST', '/api/admin/points/preview', 'admin', ({ body }) => {
    const pts = cleanPrefs(body.points);
    return { groups: G.allGroups(D).map((g) => {
      const now = groupData(D, g.id);
      const neu = groupData(D, g.id, pts);
      const name = (id) => now.members.find((m) => m.id === id)?.name || id;
      const rows = (a, b) => a.map((r) => ({ id: r.id, name: name(r.id), before: r.points, after: b.find((x) => x.id === r.id)?.points ?? 0 })).sort((x, y) => y.after - x.after);
      return { id: g.id, name: g.name, season: rows(now.season.rows, neu.season.rows), month: rows(now.season.month.rows, neu.season.month.rows) };
    }) };
  });

  on('DELETE', '/api/admin/devices/:id', 'admin', ({ params }) => {
    D.run('DELETE FROM devices WHERE id = ?', params.id);
    return { ok: true };
  });

  // ---------------- Dispatcher ----------------
  return async function handle(req, res, url, readBody) {
    const send = (status, obj) => {
      if (obj && typeof obj.__html === 'string') {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
        return res.end(obj.__html);
      }
      const s = JSON.stringify(obj);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(s);
    };
    try {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) return send(404, { error: 'Nicht gefunden' });
      // wer ständig falsche Tokens schickt (Durchprobieren), wird gesperrt
      if (rateLimited(`auth:${clientIp(req)}`, 50)) return send(429, { error: 'Zu viele Versuche. Bitte später erneut probieren.' });
      const m = r.re.exec(url.pathname);
      let params;
      try { params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])); } catch { return send(400, { error: 'Ungültige Adresse' }); }
      const cookies = [];
      let ctx = { req, url, params, body: {}, cookie: (c) => { cookies.push(c); res.setHeader('Set-Cookie', cookies); } };
      const ip = clientIp(req);
      if (tooMany(`ip:${ip}`, 600, 60000)) return send(429, { error: 'Zu viele Anfragen. Bitte kurz warten.' });
      if (!r.auth && tooMany(`pub:${ip}`, 60, 60000)) return send(429, { error: 'Zu viele Anfragen. Bitte kurz warten.' });
      if (r.auth) {
        const a = authenticate(D, req.headers.authorization);
        if (!a) { noteFail(`auth:${ip}`); return send(401, { error: 'Nicht angemeldet' }); }
        if (tooMany(`dev:${a.device.id}`, 300, 60000)) return send(429, { error: 'Zu viele Anfragen. Bitte kurz warten.' });
        ensureGroups();
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
