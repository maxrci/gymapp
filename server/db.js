// SQLite-Datenbank (eingebaut in Node.js ≥ 22.13, keine Zusatzpakete)

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'gymlog.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created INTEGER NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      profile TEXT NOT NULL DEFAULT '{}',
      profile_updated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invites (
      code_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created INTEGER NOT NULL,
      expires INTEGER NOT NULL,
      used_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT,
      created INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT,
      summary TEXT,
      start INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0,
      seq INTEGER NOT NULL,
      PRIMARY KEY (user_id, kind, id)
    );
    CREATE INDEX IF NOT EXISTS items_seq ON items (user_id, seq);
    CREATE INDEX IF NOT EXISTS items_start ON items (kind, start);

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      creator TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      exercise TEXT,
      relative INTEGER NOT NULL DEFAULT 0,
      start INTEGER NOT NULL,
      "end" INTEGER NOT NULL,
      created INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      author TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      device TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_votes (
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS ticket_comments (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS strava (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER NOT NULL DEFAULT 0,
      athlete TEXT,
      import_from INTEGER NOT NULL DEFAULT 0,
      last_activity INTEGER NOT NULL DEFAULT 0,
      last_sync INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      imported INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS strava_seen (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_id TEXT NOT NULL,
      PRIMARY KEY (user_id, activity_id)
    );
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner TEXT REFERENCES users(id) ON DELETE SET NULL,
      created INTEGER NOT NULL,
      code_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'member',
      share TEXT,
      joined INTEGER NOT NULL,
      invited_by TEXT,
      PRIMARY KEY (group_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS gm_user ON group_members (user_id);
    CREATE TABLE IF NOT EXISTS friends (
      a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT NOT NULL,
      created INTEGER NOT NULL,
      PRIMARY KEY (a, b)
    );
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transfers (
      code_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS garmin (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      api_key TEXT NOT NULL,
      key_ok INTEGER NOT NULL DEFAULT 1,
      token TEXT,
      token_exp INTEGER NOT NULL DEFAULT 0,
      import_from INTEGER NOT NULL DEFAULT 0,
      backfill_to INTEGER NOT NULL DEFAULT 0,
      last_activity INTEGER NOT NULL DEFAULT 0,
      last_sync INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      imported INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS garmin_seen (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_id TEXT NOT NULL,
      PRIMARY KEY (user_id, activity_id)
    );
    CREATE TABLE IF NOT EXISTS strava_relay (
      state TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created INTEGER NOT NULL,
      code TEXT,
      scope TEXT
    );
    CREATE TABLE IF NOT EXISTS strava_states (
      state TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS challenge_members (
      challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'invited',
      PRIMARY KEY (challenge_id, user_id)
    );
  `);

  // Migration (v3.4): Benutzername + Passwort-Hash
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('username')) db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  if (!cols.includes('pw_hash')) db.exec('ALTER TABLE users ADD COLUMN pw_hash TEXT');
  // Migration (v3.13): Challenges gehören zu einer Gruppe
  const ccols = db.prepare('PRAGMA table_info(challenges)').all().map((c) => c.name);
  if (!ccols.includes('group_id')) db.exec('ALTER TABLE challenges ADD COLUMN group_id TEXT');
  // Migration (v3.10): Einstellungen + eigene Übungen pro Konto (für Gerätewechsel und den Umzug auf den Pi)
  if (!cols.includes('prefs')) db.exec('ALTER TABLE users ADD COLUMN prefs TEXT');
  if (!cols.includes('prefs_updated')) db.exec('ALTER TABLE users ADD COLUMN prefs_updated INTEGER NOT NULL DEFAULT 0');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users (username) WHERE username IS NOT NULL');

  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const tx = (fn) => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const nextSeq = () => {
    const cur = Number(get("SELECT value FROM meta WHERE key = 'seq'")?.value || 0) + 1;
    run("INSERT INTO meta (key, value) VALUES ('seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(cur));
    return cur;
  };
  return { db, get, all, run, tx, nextSeq, close: () => db.close() };
}
