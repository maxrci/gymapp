// Web-Push (z. B. „Pause vorbei“), ohne fremde Bibliothek: VAPID (RFC 8292) + verschlüsselte Nachricht (RFC 8291, aes128gcm).
// Funktioniert auf dem iPhone, wenn die App zum Home-Bildschirm hinzugefügt ist (iOS 16.4+), und auf Android.

import crypto from 'node:crypto';

const b64u = (b) => Buffer.from(b).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');
// nur bekannte Push-Dienste (kein Weiterleiten an beliebige Adressen)
const HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
export function endpointOk(ep) {
  try {
    const u = new URL(ep);
    if (process.env.PUSH_ALLOW_LOCAL === '1' && u.hostname === '127.0.0.1') return true;
    return u.protocol === 'https:' && HOSTS.some((re) => re.test(u.hostname));
  } catch { return false; }
}

function vapid(D) {
  const row = D.get("SELECT value FROM meta WHERE key = 'vapid'");
  if (row) return JSON.parse(row.value);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const v = { pub: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)])), priv: privateKey.export({ format: 'jwk' }) };
  D.run("INSERT INTO meta (key, value) VALUES ('vapid', ?)", JSON.stringify(v));
  return v;
}
export const vapidPublic = (D) => vapid(D).pub;

function vapidAuth(D, endpoint, subject) {
  const v = vapid(D);
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: v.priv, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
// Nachricht für ein Abo verschlüsseln (RFC 8291)
export function encrypt(payload, p256dh, auth) {
  const uaPub = fromB64u(p256dh);
  const secret = fromB64u(auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPub = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPub);
  const prkKey = hmac(secret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}

export function subscribe(D, uid, sub) {
  const ep = String(sub?.endpoint || '');
  const p = String(sub?.keys?.p256dh || ''), a = String(sub?.keys?.auth || '');
  if (!endpointOk(ep) || ep.length > 1000) throw Object.assign(new Error('Unbekannter Push-Dienst'), { status: 400 });
  if (fromB64u(p).length !== 65 || fromB64u(a).length < 16) throw Object.assign(new Error('Ungültiges Push-Abo'), { status: 400 });
  if (D.get('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?', uid).n >= 10) D.run('DELETE FROM push_subs WHERE endpoint = (SELECT endpoint FROM push_subs WHERE user_id = ? ORDER BY created LIMIT 1)', uid);
  D.run('INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth', ep, uid, p, a, Date.now());
}
export const unsubscribe = (D, uid, ep) => D.run('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?', uid, String(ep || ''));

export async function sendPush(D, uid, data, subject) {
  const subs = D.all('SELECT * FROM push_subs WHERE user_id = ?', uid);
  let sent = 0;
  for (const s of subs) {
    try {
      const body = encrypt(JSON.stringify(data), s.p256dh, s.auth);
      const r = await fetch(s.endpoint, { method: 'POST', headers: { Authorization: vapidAuth(D, s.endpoint, subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '120', Urgency: 'high' }, body, signal: AbortSignal.timeout(10000) });
      if (r.status === 404 || r.status === 410) D.run('DELETE FROM push_subs WHERE endpoint = ?', s.endpoint); // Abo abgelaufen
      else if (r.ok) sent++;
    } catch { /* nächstes Abo */ }
  }
  return sent;
}

// „Pause vorbei“ zum richtigen Zeitpunkt (ein Timer pro Person, nur im Speicher)
const timers = new Map();
export function scheduleRest(D, uid, at, data, subject) {
  clearTimeout(timers.get(uid));
  timers.delete(uid);
  const ms = Number(at) - Date.now();
  if (!Number.isFinite(ms) || ms < 0 || ms > 30 * 60000) return false;
  const h = setTimeout(() => { timers.delete(uid); sendPush(D, uid, data, subject).catch(() => {}); }, ms);
  h.unref?.();
  timers.set(uid, h);
  return true;
}
export function cancelRest(uid) { clearTimeout(timers.get(uid)); timers.delete(uid); }
