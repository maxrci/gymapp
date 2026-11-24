// Strava-Anbindung: jede Person trägt ihre eigene Strava-API-App (Client-ID + Secret) ein.
// Der Server übernimmt die Anmeldung (OAuth), erneuert die Zugänge und holt neue Aktivitäten.
// Daraus werden normale Cardio-Workouts – sie landen per Sync in der App und zählen in der Arena.

import crypto from 'node:crypto';
import { bump } from './group.js';
import { cardioWorkout, storeImported, removeImported } from './activity.js';

const BASE = () => (process.env.STRAVA_BASE || 'https://www.strava.com').replace(/\/$/, '');
const SCOPE = 'read,activity:read_all';
const STATE_TTL = 20 * 60000;
const MAX_PAGES = 10; // pro Abgleich höchstens 1000 Aktivitäten (Rest beim nächsten Mal)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

import { SPORTS } from '../js/stravamap.js';

export function publicHost(base) { try { return new URL(base).host; } catch { return ''; } }

export function status(D, userId, base) {
  const r = D.get('SELECT * FROM strava WHERE user_id = ?', userId);
  return {
    configured: !!r, connected: !!r?.refresh_token, clientId: r?.client_id || '', athlete: r?.athlete ? JSON.parse(r.athlete) : null,
    importFrom: r?.import_from || 0, lastSync: r?.last_sync || 0, lastError: r?.last_error || '', imported: r?.imported || 0,
    callbackDomain: publicHost(base),
  };
}

export function saveConfig(D, userId, { clientId, clientSecret, importFrom }) {
  const id = String(clientId ?? '').trim();
  const secret = String(clientSecret ?? '').trim();
  if (!/^\d{1,12}$/.test(id)) throw Object.assign(new Error('Die Client-ID besteht nur aus Ziffern (z. B. 123456).'), { status: 400 });
  const old = D.get('SELECT * FROM strava WHERE user_id = ?', userId);
  if (!secret && !old) throw Object.assign(new Error('Bitte das Client Secret eintragen.'), { status: 400 });
  if (secret && !/^[A-Za-z0-9]{20,80}$/.test(secret)) throw Object.assign(new Error('Das Client Secret sieht nicht richtig aus (40 Zeichen aus Buchstaben und Ziffern).'), { status: 400 });
  const from = Math.max(0, Math.min(Date.now(), Number(importFrom) || 0));
  if (old) {
    const changed = old.client_id !== id || (secret && secret !== old.client_secret);
    D.run(`UPDATE strava SET client_id = ?, client_secret = ?, import_from = ?${changed ? ', access_token = NULL, refresh_token = NULL, expires_at = 0, athlete = NULL' : ''} WHERE user_id = ?`,
      id, secret || old.client_secret, from || old.import_from, userId);
  } else {
    D.run('INSERT INTO strava (user_id, client_id, client_secret, import_from) VALUES (?, ?, ?, ?)', userId, id, secret, from || Date.now() - 60 * 86400000);
  }
}

export function authorizeUrl(D, userId, base) {
  const r = D.get('SELECT client_id FROM strava WHERE user_id = ?', userId);
  if (!r) throw Object.assign(new Error('Bitte zuerst Client-ID und Secret speichern.'), { status: 400 });
  const state = crypto.randomBytes(24).toString('base64url');
  D.run('DELETE FROM strava_states WHERE created < ?', Date.now() - STATE_TTL);
  D.run('INSERT INTO strava_states (state, user_id, created) VALUES (?, ?, ?)', state, userId, Date.now());
  const q = new URLSearchParams({ client_id: r.client_id, response_type: 'code', redirect_uri: `${base}/api/strava/callback`, approval_prompt: 'auto', scope: SCOPE, state });
  return `${BASE()}/oauth/authorize?${q}`;
}

async function tokenRequest(params) {
  const res = await fetch(`${BASE()}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(15000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw Object.assign(new Error(j.message === 'Bad Request' ? 'Strava hat die Anmeldung abgelehnt – stimmen Client-ID und Secret?' : `Strava: ${j.message || res.status}`), { status: 502 });
  return j;
}

// Rückkehr von Strava nach der Freigabe (öffentlich, abgesichert über den einmaligen state)
export async function callback(D, url, appUrl) {
  const state = url.searchParams.get('state') || '';
  const row = D.get('SELECT * FROM strava_states WHERE state = ?', state);
  if (row) D.run('DELETE FROM strava_states WHERE state = ?', state);
  const page = (ok, title, text) => ({ __html: `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
    <style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;background:#0d0d0d;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;text-align:center}
    .c{max-width:420px}.i{font-size:54px}h1{font-size:22px;margin:8px 0}p{color:#aaa}a{display:inline-block;margin-top:14px;background:#3987e5;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:700}</style></head>
    <body><div class="c"><div class="i">${ok ? '✅' : '⚠️'}</div><h1>${esc(title)}</h1><p>${esc(text)}</p><a href="${esc(appUrl)}">Zurück zur App</a></div></body></html>` });
  if (!row || row.created < Date.now() - STATE_TTL) return page(false, 'Link abgelaufen', 'Bitte in der App erneut auf „Mit Strava verbinden“ tippen.');
  if (url.searchParams.get('error')) return page(false, 'Nicht verbunden', 'Der Zugriff wurde bei Strava nicht erlaubt.');
  const scope = url.searchParams.get('scope') || '';
  if (!scope.includes('activity:read')) return page(false, 'Zugriff fehlt', 'Bitte bei Strava das Lesen der Aktivitäten erlauben (Häkchen nicht entfernen).');
  const cfg = D.get('SELECT * FROM strava WHERE user_id = ?', row.user_id);
  if (!cfg) return page(false, 'Nicht eingerichtet', 'Bitte zuerst Client-ID und Secret in der App speichern.');
  try {
    const t = await tokenRequest({ client_id: cfg.client_id, client_secret: cfg.client_secret, code: url.searchParams.get('code') || '', grant_type: 'authorization_code' });
    const a = t.athlete || {};
    D.run('UPDATE strava SET access_token = ?, refresh_token = ?, expires_at = ?, athlete = ?, last_error = NULL WHERE user_id = ?',
      t.access_token, t.refresh_token, Number(t.expires_at) || 0, JSON.stringify({ id: a.id, name: [a.firstname, a.lastname].filter(Boolean).join(' ').slice(0, 60) }), row.user_id);
    const r = await syncUser(D, row.user_id).catch((e) => ({ error: e.message }));
    return page(true, 'Strava verbunden', r.error ? `Verbunden. Der erste Abgleich klappte noch nicht (${r.error}) – er wird automatisch wiederholt.` : `${r.added} Aktivität${r.added === 1 ? '' : 'en'} übernommen. Neue Aktivitäten kommen ab jetzt automatisch.`);
  } catch (e) {
    return page(false, 'Verbindung fehlgeschlagen', e.message);
  }
}

async function accessToken(D, cfg) {
  if (cfg.access_token && cfg.expires_at * 1000 > Date.now() + 120000) return cfg.access_token;
  const t = await tokenRequest({ client_id: cfg.client_id, client_secret: cfg.client_secret, grant_type: 'refresh_token', refresh_token: cfg.refresh_token });
  D.run('UPDATE strava SET access_token = ?, refresh_token = ?, expires_at = ? WHERE user_id = ?', t.access_token, t.refresh_token || cfg.refresh_token, Number(t.expires_at) || 0, cfg.user_id);
  return t.access_token;
}

// Strava-Aktivität → Workout (+ Zusammenfassung für die Arena)
export function toWorkout(a) {
  const map = Object.prototype.hasOwnProperty.call(SPORTS, a.sport_type) ? SPORTS[a.sport_type] : Object.prototype.hasOwnProperty.call(SPORTS, a.type) ? SPORTS[a.type] : [String(a.sport_type || a.type || 'Cardio').slice(0, 40), 0];
  if (!map) return null;
  const start = Date.parse(a.start_date);
  if (!Number.isFinite(start)) return null;
  const [name, withDist] = map;
  const aid = String(a.id).replace(/\D/g, '');
  const notes = [a.average_heartrate ? `Ø ${Math.round(a.average_heartrate)} bpm` : '', a.total_elevation_gain > 5 ? `${Math.round(a.total_elevation_gain)} hm` : '', a.average_watts ? `Ø ${Math.round(a.average_watts)} W` : ''].filter(Boolean).join(' · ');
  return cardioWorkout({
    id: `strava-${aid}`, title: a.name, start, name, notes, source: 'strava',
    sec: Number(a.moving_time) || Number(a.elapsed_time), elapsed: a.elapsed_time,
    km: withDist && Number(a.distance) > 0 ? Number(a.distance) / 1000 : null,
    description: `Von Strava importiert · https://www.strava.com/activities/${aid}`,
  });
}

// Neue Aktivitäten holen und als Workouts speichern
export async function syncUser(D, userId) {
  const cfg = D.get('SELECT * FROM strava WHERE user_id = ?', userId);
  if (!cfg?.refresh_token) return { added: 0, skipped: 0, error: 'nicht verbunden' };
  let token;
  try { token = await accessToken(D, cfg); } catch (e) {
    D.run('UPDATE strava SET last_error = ? WHERE user_id = ?', e.message, userId);
    throw e;
  }
  const after = Math.floor(Math.max(cfg.import_from, cfg.last_activity - 3 * 86400000) / 1000);
  let added = 0, skipped = 0, maxStart = cfg.last_activity;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${BASE()}/api/v3/athlete/activities?${new URLSearchParams({ after: String(after), per_page: '100', page: String(page) })}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    if (res.status === 401) {
      D.run('UPDATE strava SET access_token = NULL, refresh_token = NULL, last_error = ? WHERE user_id = ?', 'Zugriff bei Strava entzogen – bitte neu verbinden.', userId);
      throw Object.assign(new Error('Zugriff bei Strava entzogen – bitte neu verbinden.'), { status: 502 });
    }
    if (res.status === 429) { D.run('UPDATE strava SET last_error = ? WHERE user_id = ?', 'Strava-Limit erreicht – später geht es weiter.', userId); break; }
    if (!res.ok) throw Object.assign(new Error(`Strava antwortet nicht (${res.status})`), { status: 502 });
    const list = await res.json().catch(() => []);
    if (!Array.isArray(list) || !list.length) break;
    D.tx(() => {
      for (const a of list.slice(0, 200)) {
        const aid = String(a?.id ?? '').replace(/\D/g, '');
        if (!aid || D.get('SELECT 1 FROM strava_seen WHERE user_id = ? AND activity_id = ?', userId, aid)) { skipped++; continue; }
        D.run('INSERT OR IGNORE INTO strava_seen (user_id, activity_id) VALUES (?, ?)', userId, aid);
        const w = toWorkout(a);
        if (!w) { skipped++; continue; }
        maxStart = Math.max(maxStart, w.start);
        if (!storeImported(D, userId, w)) { skipped++; continue; }
        added++;
      }
    });
    if (list.length < 100) break;
  }
  D.run('UPDATE strava SET last_sync = ?, last_activity = ?, imported = imported + ?, last_error = NULL WHERE user_id = ?', Date.now(), maxStart, added, userId);
  if (added) bump();
  return { added, skipped };
}

// Ältere Aktivitäten nachholen: Startpunkt nach vorne verlegen und beim nächsten Abgleich von dort aus holen
// (schon gesehene Aktivitäten werden übersprungen, gelöschte kommen nicht zurück)
export function setImportFrom(D, userId, importFrom) {
  const from = Math.max(Date.UTC(2009, 0, 1), Math.min(Date.now(), Number(importFrom) || 0));
  const r = D.get('SELECT import_from FROM strava WHERE user_id = ?', userId);
  if (!r) throw Object.assign(new Error('Strava ist nicht eingerichtet.'), { status: 400 });
  if (from < r.import_from) D.run('UPDATE strava SET import_from = ?, last_activity = 0 WHERE user_id = ?', from, userId);
}

// Verbindung trennen (bei Strava abmelden), optional übernommene Workouts löschen
export async function disconnect(D, userId, removeItems) {
  const cfg = D.get('SELECT * FROM strava WHERE user_id = ?', userId);
  if (cfg?.access_token) {
    await fetch(`${BASE()}/oauth/deauthorize`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ access_token: cfg.access_token }), signal: AbortSignal.timeout(10000) }).catch(() => {});
  }
  D.tx(() => {
    D.run('DELETE FROM strava WHERE user_id = ?', userId);
    if (removeItems) {
      removeImported(D, userId, 'strava');
      D.run('DELETE FROM strava_seen WHERE user_id = ?', userId);
    }
  });
  bump();
}

// Hintergrund: alle verbundenen Konten regelmäßig abgleichen (damit die Arena aktuell bleibt)
export async function syncAll(D) {
  for (const r of D.all('SELECT user_id FROM strava WHERE refresh_token IS NOT NULL')) {
    try { await syncUser(D, r.user_id); } catch (e) { console.error('Strava-Abgleich:', e.message); }
  }
}

// ---------- Neu: Strava läuft auf dem Handy ----------
// Der Server reicht nur bei der Anmeldung den einmaligen Freigabe-Code an die App weiter (Rückkehr-Adresse muss
// die Domain des Servers sein). Ohne das Client Secret, das nur auf dem Handy liegt, ist der Code wertlos.
// Zugänge, Schlüssel und Aktivitäten sieht der Server nie.
export function relayStart(D, userId, base) {
  const state = crypto.randomBytes(24).toString('base64url');
  D.run('DELETE FROM strava_relay WHERE created < ? OR user_id = ?', Date.now() - STATE_TTL, userId);
  D.run('INSERT INTO strava_relay (state, user_id, created) VALUES (?, ?, ?)', state, userId, Date.now());
  return { state, redirectUri: `${base}/api/strava/relay`, callbackDomain: publicHost(base) };
}
export function relayCallback(D, url, appUrl) {
  const state = url.searchParams.get('state') || '';
  const row = D.get('SELECT * FROM strava_relay WHERE state = ?', state);
  const page = (ok, title, text) => ({ __html: `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
    <style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;background:#0d0d0d;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;text-align:center}
    .c{max-width:420px}.i{font-size:54px}h1{font-size:22px;margin:8px 0}p{color:#aaa}a{display:inline-block;margin-top:14px;background:#3987e5;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:700}</style></head>
    <body><div class="c"><div class="i">${ok ? '✅' : '⚠️'}</div><h1>${esc(title)}</h1><p>${esc(text)}</p><a href="${esc(appUrl)}">Zurück zur App</a></div></body></html>` });
  if (!row || row.created < Date.now() - STATE_TTL || row.code) return page(false, 'Link abgelaufen', 'Bitte in der App erneut auf „Mit Strava verbinden“ tippen.');
  if (url.searchParams.get('error')) { D.run('DELETE FROM strava_relay WHERE state = ?', state); return page(false, 'Nicht verbunden', 'Der Zugriff wurde bei Strava nicht erlaubt.'); }
  const scope = String(url.searchParams.get('scope') || '').slice(0, 200);
  if (!scope.includes('activity:read')) return page(false, 'Zugriff fehlt', 'Bitte bei Strava das Lesen der Aktivitäten erlauben (Häkchen nicht entfernen).');
  const code = String(url.searchParams.get('code') || '').replace(/[^\w-]/g, '').slice(0, 200);
  if (!code) return page(false, 'Kein Code', 'Strava hat keinen Freigabe-Code geschickt. Bitte erneut verbinden.');
  D.run('UPDATE strava_relay SET code = ?, scope = ? WHERE state = ?', code, scope, state);
  return page(true, 'Fast geschafft', 'Geh jetzt zurück zur Gym-App – sie schließt die Verbindung ab und holt deine Aktivitäten direkt von Strava.');
}
export function relayCode(D, userId, state) {
  const row = D.get('SELECT * FROM strava_relay WHERE state = ? AND user_id = ?', String(state || ''), userId);
  if (!row || row.created < Date.now() - STATE_TTL) return { status: 'expired' };
  if (!row.code) return { status: 'waiting' };
  D.run('DELETE FROM strava_relay WHERE state = ?', row.state); // nur einmal abholbar
  return { status: 'ok', code: row.code, scope: row.scope };
}
