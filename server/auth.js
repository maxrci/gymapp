// Schlüssel & Geräte-Tokens: zufällig erzeugt, nur als SHA-256-Hash gespeichert

import crypto from 'node:crypto';

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ohne 0/O, 1/I/L
export const INVITE_DAYS = 7;

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const newId = () => crypto.randomBytes(9).toString('base64url');
export const newToken = () => crypto.randomBytes(32).toString('base64url');

export function newCode() {
  const bytes = crypto.randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += ALPHA[bytes[i] % ALPHA.length];
  return s.match(/.{4}/g).join('-');
}
export const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Neuen Einmal-Schlüssel für einen Nutzer anlegen (alte, unbenutzte verfallen)
export function createInvite(D, userId) {
  const code = newCode();
  const now = Date.now();
  D.run('DELETE FROM invites WHERE user_id = ? AND used_at IS NULL', userId);
  D.run('INSERT INTO invites (code_hash, user_id, created, expires) VALUES (?, ?, ?, ?)', sha(normCode(code)), userId, now, now + INVITE_DAYS * 86400000);
  return { code, expires: now + INVITE_DAYS * 86400000 };
}

// Schlüssel einlösen → Geräte-Token
export function redeem(D, code, deviceName) {
  const h = sha(normCode(code));
  const inv = D.get('SELECT * FROM invites WHERE code_hash = ?', h);
  if (!inv || inv.used_at || inv.expires < Date.now()) return null;
  const user = D.get('SELECT * FROM users WHERE id = ? AND disabled = 0', inv.user_id);
  if (!user) return null;
  const token = newToken();
  const now = Date.now();
  D.tx(() => {
    D.run('UPDATE invites SET used_at = ? WHERE code_hash = ?', now, h);
    D.run('INSERT INTO devices (id, token_hash, user_id, name, created, last_seen) VALUES (?, ?, ?, ?, ?, ?)',
      newId(), sha(token), user.id, String(deviceName || 'Gerät').slice(0, 60), now, now);
  });
  return { token, user };
}

export function authenticate(D, header) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(header || '');
  if (!m) return null;
  const dev = D.get('SELECT * FROM devices WHERE token_hash = ?', sha(m[1]));
  if (!dev) return null;
  const user = D.get('SELECT * FROM users WHERE id = ? AND disabled = 0', dev.user_id);
  if (!user) return null;
  if (Date.now() - dev.last_seen > 60000) D.run('UPDATE devices SET last_seen = ? WHERE id = ?', Date.now(), dev.id);
  return { user, device: dev };
}

// Einfache Bremse gegen Durchprobieren von Schlüsseln (pro IP)
const fails = new Map();
export function rateLimited(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() - f.since > 15 * 60000) { fails.delete(ip); return false; }
  return f.n >= 10;
}
export function noteFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.since > 15 * 60000) fails.set(ip, { n: 1, since: Date.now() });
  else f.n++;
}
