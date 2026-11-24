// Garmin-Anbindung über die Garmin Connect Personal API: jede Person erstellt in Garmin Connect
// ihren eigenen persönlichen API-Schlüssel und trägt ihn in der App ein. Der Server tauscht ihn
// gegen einen Zugang (24 h gültig), holt neue Aktivitäten und macht daraus Cardio-Workouts.

import { bump } from './group.js';
import { cardioWorkout, storeImported, removeImported } from './activity.js';

const BASE = () => (process.env.GARMIN_BASE || 'https://personal.connectapi.garmin.com').replace(/\/$/, '');
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';
const LIST_PATH = '/activitylist-service/activities/search/activities';
const PAGE = 100;
const MAX_PAGES = 10; // pro Durchgang höchstens 1000 Aktivitäten (Rest beim nächsten Abgleich)
const DAY = 864e5;
const KEY_RE = /^[\w.~+/=-]{16,1024}$/;
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Garmin-Sportart (typeKey) → Übungsname in der App, mit Distanz?
const SPORTS = {
  running: ['Laufen', 1], street_running: ['Laufen', 1], track_running: ['Laufen', 1], trail_running: ['Laufen', 1], ultra_run: ['Laufen', 1], obstacle_run: ['Laufen', 1],
  treadmill_running: ['Laufband', 1], indoor_running: ['Laufband', 1], virtual_run: ['Laufband', 1],
  cycling: ['Radfahren', 1], road_biking: ['Radfahren', 1], mountain_biking: ['Radfahren', 1], gravel_cycling: ['Radfahren', 1], cyclocross: ['Radfahren', 1],
  downhill_biking: ['Radfahren', 1], track_cycling: ['Radfahren', 1], recumbent_cycling: ['Radfahren', 1], bmx: ['Radfahren', 1],
  indoor_cycling: ['Radfahren', 1], virtual_ride: ['Radfahren', 1], e_bike_fitness: ['E-Bike', 1], e_bike_mountain: ['E-Bike', 1], hand_cycling: ['Handbike', 1],
  swimming: ['Schwimmen', 1], lap_swimming: ['Schwimmen', 1], open_water_swimming: ['Schwimmen', 1],
  walking: ['Gehen', 1], casual_walking: ['Gehen', 1], speed_walking: ['Gehen', 1], hiking: ['Wandern', 1], mountaineering: ['Wandern', 1],
  indoor_rowing: ['Rudermaschine', 1], rowing: ['Rudern', 1], kayaking: ['Kajak', 1], stand_up_paddleboarding: ['SUP', 1],
  inline_skating: ['Inliner', 1], skating_ws: ['Eislaufen', 1], elliptical: ['Crosstrainer', 0], stair_climbing: ['Stepper', 0], floor_climbing: ['Stepper', 0],
  resort_skiing_snowboarding_ws: ['Ski alpin', 1], resort_skiing: ['Ski alpin', 1], resort_snowboarding: ['Snowboard', 1], backcountry_skiing: ['Skitour', 1],
  cross_country_skiing_ws: ['Langlauf', 1], skate_skiing_ws: ['Langlauf', 1], snow_shoe_ws: ['Schneeschuhwandern', 1],
  surfing: ['Surfen', 0], kiteboarding: ['Kitesurfen', 0], windsurfing: ['Windsurfen', 0], sailing: ['Segeln', 1],
  yoga: ['Yoga', 0], pilates: ['Pilates', 0], hiit: ['HIIT', 0], cardio: ['Cardio', 0], indoor_cardio: ['Cardio', 0], fitness_equipment: ['Cardio', 0],
  boxing: ['Boxen', 0], rock_climbing: ['Klettern', 0], bouldering: ['Klettern', 0], indoor_climbing: ['Klettern', 0],
  soccer: ['Fußball', 0], tennis: ['Tennis', 0], padel: ['Padel', 0], pickleball: ['Pickleball', 0], badminton: ['Badminton', 0], squash: ['Squash', 0],
  table_tennis: ['Tischtennis', 0], basketball: ['Basketball', 0], volleyball: ['Volleyball', 0], golf: ['Golf', 1],
  multi_sport: ['Triathlon', 1], triathlon: ['Triathlon', 1],
  strength_training: null, // Sätze und Gewichte werden in der App erfasst
  meditation: null, breathwork: null,
};
function sportOf(key) {
  const k = String(key || '').toLowerCase();
  if (has(SPORTS, k)) return SPORTS[k];
  if (/run/.test(k)) return ['Laufen', 1];
  if (/cycl|bik|ride/.test(k)) return ['Radfahren', 1];
  if (/swim/.test(k)) return ['Schwimmen', 1];
  if (/walk|hik/.test(k)) return ['Gehen', 1];
  if (/ski/.test(k)) return ['Ski alpin', 1];
  if (/row|paddl|kayak|canoe/.test(k)) return ['Rudern', 1];
  return ['Cardio', 0];
}

export function status(D, userId) {
  const r = D.get('SELECT * FROM garmin WHERE user_id = ?', userId);
  return {
    configured: !!r, connected: !!r?.key_ok, importFrom: r?.import_from || 0, lastSync: r?.last_sync || 0,
    lastError: r?.last_error || '', imported: r?.imported || 0, backfilling: !!r?.backfill_to,
  };
}

// Persönlichen Schlüssel gegen einen Zugang tauschen (Antwort ist ein JWT mit Ablaufzeit)
async function exchange(key) {
  let res;
  try {
    res = await fetch(`${BASE()}${TOKEN_PATH}`, { method: 'POST', headers: { Accept: '*/*', Authorization: `ApiKey ${key}` }, signal: AbortSignal.timeout(20000) });
  } catch { throw fail(502, 'Garmin ist gerade nicht erreichbar.'); }
  if (res.status === 401 || res.status === 403) throw fail(400, 'Garmin hat den Schlüssel abgelehnt – ist er abgelaufen, gelöscht oder unvollständig kopiert?');
  if (res.status === 429) throw fail(429, 'Garmin-Limit erreicht – bitte später nochmal.');
  if (!res.ok) throw fail(502, `Garmin antwortet nicht (${res.status})`);
  const token = (await res.text()).trim();
  let exp = 0;
  try { exp = Number(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp) * 1000; } catch { /* unten */ }
  if (!token || token.length > 8192 || !Number.isFinite(exp) || exp < Date.now()) throw fail(502, 'Garmin hat keinen gültigen Zugang geliefert.');
  return { token, exp };
}

async function accessToken(D, cfg, force = false) {
  if (!force && cfg.token && cfg.token_exp > Date.now() + 3600e3) return cfg.token;
  try {
    const t = await exchange(cfg.api_key);
    D.run('UPDATE garmin SET token = ?, token_exp = ? WHERE user_id = ?', t.token, t.exp, cfg.user_id);
    cfg.token = t.token; cfg.token_exp = t.exp;
    return t.token;
  } catch (e) {
    if (e.status === 400) {
      const msg = 'Garmin-Schlüssel abgelaufen oder gelöscht – bitte in Garmin Connect einen neuen erstellen und hier eintragen.';
      D.run('UPDATE garmin SET key_ok = 0, token = NULL, token_exp = 0, last_error = ? WHERE user_id = ?', msg, cfg.user_id);
      throw fail(400, msg);
    }
    throw e;
  }
}

export async function saveConfig(D, userId, { apiKey, importFrom }) {
  const key = String(apiKey ?? '').replace(/\s+/g, '');
  if (!KEY_RE.test(key)) throw fail(400, 'Der Schlüssel sieht nicht richtig aus – bitte komplett aus Garmin Connect kopieren.');
  const t = await exchange(key); // prüft den Schlüssel sofort
  const old = D.get('SELECT * FROM garmin WHERE user_id = ?', userId);
  const from = Math.max(Date.UTC(2009, 0, 1), Math.min(Date.now(), Number(importFrom) || 0));
  if (old) {
    D.run('UPDATE garmin SET api_key = ?, token = ?, token_exp = ?, key_ok = 1, last_error = NULL WHERE user_id = ?', key, t.token, t.exp, userId);
  } else {
    D.run('INSERT INTO garmin (user_id, api_key, token, token_exp, key_ok, import_from) VALUES (?, ?, ?, ?, 1, ?)', userId, key, t.token, t.exp, Number(importFrom) ? from : Date.now() - 90 * DAY);
  }
}

export function setImportFrom(D, userId, importFrom) {
  const from = Math.max(Date.UTC(2009, 0, 1), Math.min(Date.now(), Number(importFrom) || 0));
  const r = D.get('SELECT import_from, last_activity FROM garmin WHERE user_id = ?', userId);
  if (!r) throw fail(400, 'Garmin ist nicht eingerichtet.');
  // ältere holen: alles zwischen neuem Startpunkt und bisherigem Startpunkt nachladen
  if (from < r.import_from) D.run('UPDATE garmin SET import_from = ?, backfill_to = ? WHERE user_id = ?', from, r.import_from + DAY, userId);
}

const ymd = (t) => new Date(t).toISOString().slice(0, 10);
// Startzeit: beginTimestamp (ms) oder startTimeGMT „YYYY-MM-DD HH:MM:SS“
function startOf(a) {
  const b = Number(a.beginTimestamp);
  if (Number.isFinite(b) && b > 0) return b;
  const g = typeof a.startTimeGMT === 'string' ? Date.parse(`${a.startTimeGMT.replace(' ', 'T')}Z`) : NaN;
  return Number.isFinite(g) ? g : NaN;
}

// Garmin-Aktivität → Workout (+ Zusammenfassung für die Arena)
export function toWorkout(a) {
  if (!a || typeof a !== 'object') return null;
  const map = sportOf(a.activityType?.typeKey);
  if (!map) return null;
  const start = startOf(a);
  if (!Number.isFinite(start)) return null;
  const [name, withDist] = map;
  const aid = String(a.activityId ?? '').replace(/\D/g, '');
  if (!aid) return null;
  const hr = Number(a.averageHR), hm = Number(a.elevationGain), kcal = Number(a.calories);
  const notes = [hr > 0 ? `Ø ${Math.round(hr)} bpm` : '', hm > 5 ? `${Math.round(hm)} hm` : '', kcal > 0 ? `${Math.round(kcal)} kcal` : ''].filter(Boolean).join(' · ');
  return cardioWorkout({
    id: `garmin-${aid}`, title: typeof a.activityName === 'string' ? a.activityName : name, start, name, notes, source: 'garmin',
    sec: Number(a.movingDuration) || Number(a.duration) || Number(a.elapsedDuration), elapsed: Number(a.elapsedDuration) || Number(a.duration),
    km: withDist && Number(a.distance) > 0 ? Number(a.distance) / 1000 : null,
    description: `Von Garmin importiert · https://connect.garmin.com/modern/activity/${aid}`,
  });
}

// Eine Seite der Aktivitätsliste holen (neueste zuerst)
async function fetchPage(D, cfg, from, to, start) {
  const q = new URLSearchParams({ start: String(start), limit: String(PAGE), startDate: ymd(from), endDate: ymd(to) });
  const get = async (token) => fetch(`${BASE()}${LIST_PATH}?${q}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  let res = await get(await accessToken(D, cfg));
  if (res.status === 401) res = await get(await accessToken(D, cfg, true));
  if (res.status === 429) return null;
  if (!res.ok) throw fail(502, `Garmin antwortet nicht (${res.status})`);
  const j = await res.json().catch(() => null);
  const list = Array.isArray(j) ? j : Array.isArray(j?.activityList) ? j.activityList : [];
  return list;
}

// Zeitraum durchgehen (neueste zuerst), Aktivitäten speichern; gibt zurück, ob alles geholt wurde und die älteste Startzeit
async function pass(D, cfg, from, to, acc) {
  let oldest = Infinity;
  for (let page = 0; page < MAX_PAGES; page++) {
    const list = await fetchPage(D, cfg, from, to, page * PAGE);
    if (list == null) { acc.limited = true; return { done: false, oldest }; }
    D.tx(() => {
      for (const a of list.slice(0, PAGE * 2)) {
        const st = startOf(a || {});
        if (Number.isFinite(st)) oldest = Math.min(oldest, st);
        const aid = String(a?.activityId ?? '').replace(/\D/g, '');
        if (!aid || D.get('SELECT 1 FROM garmin_seen WHERE user_id = ? AND activity_id = ?', cfg.user_id, aid)) { acc.skipped++; continue; }
        if (Number.isFinite(st) && st < cfg.import_from) { acc.skipped++; continue; }
        D.run('INSERT OR IGNORE INTO garmin_seen (user_id, activity_id) VALUES (?, ?)', cfg.user_id, aid);
        const w = toWorkout(a);
        if (!w) { acc.skipped++; continue; }
        acc.maxStart = Math.max(acc.maxStart, w.start);
        if (!storeImported(D, cfg.user_id, w)) { acc.skipped++; continue; }
        acc.added++;
      }
    });
    if (list.length < PAGE) return { done: true, oldest };
  }
  return { done: false, oldest };
}

export async function syncUser(D, userId) {
  const cfg = D.get('SELECT * FROM garmin WHERE user_id = ?', userId);
  if (!cfg?.key_ok) return { added: 0, skipped: 0, error: 'nicht verbunden' };
  const acc = { added: 0, skipped: 0, maxStart: cfg.last_activity, limited: false };
  let backfill = cfg.backfill_to || 0;
  try {
    // 1. Neues seit der letzten Aktivität (3 Tage Puffer für nachträglich hochgeladene)
    const from = Math.max(cfg.import_from, cfg.last_activity - 3 * DAY);
    const r = await pass(D, cfg, from, Date.now() + DAY, acc);
    if (!r.done && !acc.limited && Number.isFinite(r.oldest)) backfill = backfill ? Math.min(backfill, r.oldest) : r.oldest; // zu viele auf einmal → Rest von hinten nachholen
    // 2. Ältere nachholen (erste Verbindung mit langer Historie oder „Ältere nachholen“)
    if (backfill && !acc.limited) {
      const b = await pass(D, cfg, cfg.import_from, backfill, acc);
      backfill = b.done ? 0 : Number.isFinite(b.oldest) && b.oldest < backfill ? b.oldest : backfill;
    }
  } catch (e) {
    D.run('UPDATE garmin SET last_error = ? WHERE user_id = ?', e.message, userId);
    if (acc.added) bump();
    throw e;
  }
  D.run('UPDATE garmin SET last_sync = ?, last_activity = ?, backfill_to = ?, imported = imported + ?, last_error = ? WHERE user_id = ?',
    Date.now(), acc.maxStart, backfill, acc.added, acc.limited ? 'Garmin-Limit erreicht – später geht es weiter.' : null, userId);
  if (acc.added) bump();
  return { added: acc.added, skipped: acc.skipped, more: !!backfill };
}

export function disconnect(D, userId, remove) {
  D.tx(() => {
    D.run('DELETE FROM garmin WHERE user_id = ?', userId);
    if (remove) { removeImported(D, userId, 'garmin'); D.run('DELETE FROM garmin_seen WHERE user_id = ?', userId); }
  });
  bump();
}

export async function syncAll(D) {
  for (const r of D.all('SELECT user_id FROM garmin WHERE key_ok = 1')) {
    try { await syncUser(D, r.user_id); } catch (e) { console.error('Garmin-Abgleich:', e.message); }
  }
}
