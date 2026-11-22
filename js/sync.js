// Gruppen-Server: Anmeldung per Schlüssel, Offline-first-Sync, Gruppendaten.
// Ohne Server (z. B. GitHub Pages) bleibt alles lokal – dieses Modul ist dann inaktiv.

import { state, hooks, applyRemote, saveSettings, onChange } from './store.js';
import { idx } from './stats.js';
import { toast } from './ui.js';
import { demoApi, demoGroup, setSummarizer } from './demo.js';
import { cardioKind, MOBILITY_RE } from './compete.js';

const LS = 'gymlog-srv';
const LS_GROUP = 'gymlog-group';
const empty = () => ({ server: '', token: null, user: null, group: '', cursor: 0, dirty: { workout: {}, routine: {} }, tomb: [], profHash: '', profUpdated: 0, lastSync: 0 });
let S = load();
let tick = 0;

function load() {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return empty(); }
}
const save = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch { /* voll */ } };

export const srv = { available: false, info: null, syncing: false, error: '', listeners: new Set() };
const emit = () => srv.listeners.forEach((f) => f());
export const onSync = (f) => srv.listeners.add(f);
export const loggedIn = () => !!S.token;
// DEMO: Arena mit 2 NPCs, solange man nicht bei einem Gruppen-Server angemeldet ist
export const demoOn = () => !S.token && state.settings.arenaDemo !== false;
export const account = () => ({ user: S.user, group: S.group, lastSync: S.lastSync, pending: pendingCount() });
export const isAdmin = () => S.user?.role === 'admin';
export const myId = () => S.user?.id || (demoOn() ? 'me' : undefined);
const pendingCount = () => Object.keys(S.dirty.workout).length + Object.keys(S.dirty.routine).length + S.tomb.length;

// ---------- Server erkennen ----------
// Die App kann vom Server selbst kommen (gleiche Adresse) oder z. B. von GitHub Pages – dann steht die Server-Adresse in S.server.
export async function detectServer() {
  const base = S.server || window.__GYMLOG_API || '';
  if (location.protocol === 'file:' && !base) return false;
  try {
    const r = await fetch(apiUrl('api/info'), { cache: 'no-store' });
    const j = await r.json();
    if (j.app === 'gymlog') { srv.available = true; srv.info = j; }
  } catch { srv.available = loggedIn(); }
  return srv.available;
}
const apiUrl = (p, base = S.server || window.__GYMLOG_API || '') => (base ? `${base}/${p}` : p);
export const serverUrl = () => S.server || '';

// Server-Adresse aus Eingabe oder Einladungslink lesen
export function parseServerInput(text) {
  const raw = String(text || '').trim();
  if (!raw) return { server: '' };
  const t = (/https?:\/\/[^\s]+/i.exec(raw) || [raw])[0];
  const m = /[#?&]server=([^&\s]+)/.exec(t);
  const user = (/[#?&]user=([^&\s]+)/.exec(t) || [])[1];
  let server = m ? decodeURIComponent(m[1]) : t.split('#')[0].split('?')[0];
  if (!/^https?:\/\//i.test(server)) server = `https://${server}`;
  return { server: server.replace(/\/+$/, ''), user: user ? decodeURIComponent(user) : '' };
}
// Läuft die App auf dem Server selbst? (dann braucht es keine Server-Adresse)
export async function sameOriginServer() {
  if (location.protocol === 'file:') return false;
  try { const j = await (await fetch('api/info', { cache: 'no-store' })).json(); return j.app === 'gymlog' ? j : false; } catch { return false; }
}

export async function api(method, path, body, base = null) {
  if (demoOn() && !/^\/api\/(redeem|login|info)/.test(path)) return demoApi(method, path, body);
  const r = await fetch(apiUrl(path.replace(/^\//, ''), base ?? undefined), {
    method,
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token && !/^\/api\/(redeem|login)$/.test(path)) {
    localLogout();
    toast('Dieses Gerät wurde abgemeldet. Bitte einen neuen Schlüssel beim Admin anfragen.', 5000);
  }
  if (!r.ok) throw Object.assign(new Error(j.error || `Fehler ${r.status}`), { status: r.status });
  return j;
}

// ---------- Profil (Avatar, Körpergewicht, Wochenziel, Sichtbarkeit) ----------
const profileData = () => ({
  avatar: state.settings.avatar || null,
  bwLog: Array.isArray(state.settings.bwLog) ? state.settings.bwLog : (state.settings.bodyweight ? [{ t: 0, kg: state.settings.bodyweight }] : []),
  weekGoal: state.settings.weekGoal,
  visibility: state.settings.visibility || 'full',
});
const hash = (o) => JSON.stringify(o);

async function applyProfile(p, updated) {
  const patch = {};
  if (p.avatar) patch.avatar = p.avatar;
  if (Array.isArray(p.bwLog)) { patch.bwLog = p.bwLog; patch.bodyweight = p.bwLog.length ? p.bwLog[p.bwLog.length - 1].kg : state.settings.bodyweight; }
  if (p.weekGoal) patch.weekGoal = p.weekGoal;
  if (p.visibility) patch.visibility = p.visibility;
  if (Object.keys(patch).length) await saveSettings(patch);
  S.profUpdated = updated;
  S.profHash = hash(profileData());
}

// ---------- Anmeldung ----------
// Benutzername + Passwort (vom Admin festgelegt). server = '' heißt: gleiche Adresse wie die App.
export async function loginPassword(server, username, password, device) {
  if (server) {
    try {
      const j = await (await fetch(`${server}/api/info`, { cache: 'no-store' })).json();
      if (j.app !== 'gymlog') throw new Error();
    } catch { throw new Error('Server nicht erreichbar. Stimmt die Adresse (mit https://)?'); }
  }
  const r = await api('POST', '/api/login', { username, password, device }, server);
  return finishLogin(r, server);
}
export async function redeemCode(code, device) {
  const r = await api('POST', '/api/redeem', { code, device });
  return finishLogin(r, '');
}
async function finishLogin(r, server) {
  S = { ...empty(), server, token: r.token, user: r.user, group: r.group };
  srv.available = true;
  if (r.profileUpdated > 0) await applyProfile(r.profile, r.profileUpdated);
  // Vorhandene lokale Daten hochladen (Duplikate erkennt der Server)
  for (const w of state.workouts) S.dirty.workout[w.id] = 1;
  for (const x of state.routines) S.dirty.routine[x.id] = 1;
  save();
  emit();
  syncNow().catch(() => {});
  return r;
}

function localLogout() {
  S = { ...empty(), server: S.server };
  save();
  try { localStorage.removeItem(LS_GROUP); } catch { /* egal */ }
  emit();
}
export async function logout() {
  try { await api('POST', '/api/logout'); } catch { /* offline: trotzdem lokal abmelden */ }
  localLogout();
}

// ---------- Änderungen merken ----------
let timer = null;
export function scheduleSync(ms = 2500) {
  if (!S.token) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow().catch(() => {}), ms);
}
hooks.change = (kind, ids, deleted) => {
  if (!S.token) return;
  for (const id of ids) {
    if (deleted) { delete S.dirty[kind][id]; if (!S.tomb.some((t) => t.kind === kind && t.id === id)) S.tomb.push({ kind, id }); }
    else { S.dirty[kind][id] = ++tick; S.tomb = S.tomb.filter((t) => !(t.kind === kind && t.id === id)); }
  }
  save();
  scheduleSync();
};
export function markAllDirty() {
  for (const w of state.workouts) S.dirty.workout[w.id] = ++tick;
  for (const x of state.routines) S.dirty.routine[x.id] = ++tick;
  save();
}

// ---------- Zusammenfassung pro Workout (für Liga, Challenges, Ewige Tabelle) ----------
export function summarizer() {
  const { wStats, ex } = idx();
  const byW = new Map();
  for (const x of ex.values()) {
    for (const s of x.sessions) {
      let l = byW.get(s.wid);
      if (!l) byW.set(s.wid, (l = []));
      l.push({ x, s });
    }
  }
  return (w) => {
    const ws = wStats.get(w.id) || {};
    let km = 0, csec = 0;
    const exl = (byW.get(w.id) || []).map(({ x, s }) => {
      const cardio = !!cardioKind(x.name, x.type);
      if (cardio) { km += x.type === 'cardio' ? s.distance : 0; csec += s.duration; }
      return { n: x.name, t: x.type, v: Math.round(s.volume), s: s.workSets, r: s.reps, mr: s.maxReps, e: +s.bestE1rm.toFixed(2), w: s.maxWeight, d: +s.distance.toFixed(3), sec: Math.round(s.duration) };
    });
    return {
      start: w.start, end: w.end, title: w.title, vol: Math.round(ws.volume || 0), sets: ws.sets || 0, reps: ws.reps || 0,
      dur: Math.round(ws.duration || 0), km: +km.toFixed(3), cmin: Math.round(csec / 60), mob: w.exercises.some((e) => MOBILITY_RE.test(e.name)) ? 1 : 0, ex: exl,
    };
  };
}

// ---------- Sync ----------
let running = null;
export function syncNow() {
  if (!S.token) return Promise.resolve();
  if (running) return running.then(() => (pendingCount() ? syncNow() : undefined));
  running = (async () => {
    srv.syncing = true; srv.error = ''; emit();
    try {
      let rounds = 0;
      let more = true;
      while (more && rounds++ < 50) {
        const sum = summarizer();
        const batch = [];
        const sent = [];
        for (const kind of ['workout', 'routine']) {
          for (const [id, v] of Object.entries(S.dirty[kind])) {
            if (batch.length >= 80) break;
            const obj = kind === 'workout' ? state.workouts.find((w) => w.id === id) : state.routines.find((r) => r.id === id);
            if (!obj) { delete S.dirty[kind][id]; continue; }
            batch.push({ kind, id, data: obj, summary: kind === 'workout' ? sum(obj) : null });
            sent.push([kind, id, v]);
          }
        }
        const tombs = S.tomb.slice(0, 200);
        for (const t of tombs) batch.push({ kind: t.kind, id: t.id, deleted: true });
        const pd = profileData();
        const h = hash(pd);
        const profile = h !== S.profHash ? { updated: Math.max(Date.now(), S.profUpdated + 1), data: pd } : null;

        const r = await api('POST', '/api/sync', { cursor: S.cursor, items: batch, profile });

        for (const [kind, id, v] of sent) if (S.dirty[kind][id] === v) delete S.dirty[kind][id];
        S.tomb = S.tomb.filter((t) => !tombs.includes(t));
        if (profile) { S.profHash = h; S.profUpdated = profile.updated; }

        // Eingehende Änderungen (lokal ungespeicherte Änderungen haben Vorrang)
        const inc = { workouts: [], routines: [], delWorkouts: [], delRoutines: [] };
        for (const it of r.items || []) {
          if (S.dirty[it.kind]?.[it.id]) continue;
          const key = it.kind === 'workout' ? 'Workouts' : 'Routines';
          if (it.deleted) inc[`del${key}`].push(it.id);
          else if (it.data) inc[key.toLowerCase()].push(it.data);
        }
        for (const [localId] of r.dupes || []) { inc.delWorkouts.push(localId); delete S.dirty.workout[localId]; }
        await applyRemote(inc);
        if (r.profileUpdated > S.profUpdated) await applyProfile(r.profile, r.profileUpdated);
        S.cursor = r.cursor;
        S.user = r.user || S.user;
        save();
        more = r.more || pendingCount() > 0;
      }
      S.lastSync = Date.now();
      save();
    } catch (e) {
      srv.error = e.message;
      throw e;
    } finally {
      srv.syncing = false;
      running = null;
      emit();
    }
  })();
  return running;
}

// Nach lokalem Löschen aller Daten: alles neu vom Server holen
export function resetCursor() { S.cursor = 0; S.dirty = { workout: {}, routine: {} }; S.tomb = []; save(); }

// ---------- Gruppendaten ----------
export function cachedGroup() {
  if (demoOn()) return demoGroup();
  try { return JSON.parse(localStorage.getItem(LS_GROUP) || 'null'); } catch { return null; }
}
let groupReq = null;
export function fetchGroup() {
  if (demoOn()) return Promise.resolve(demoGroup());
  if (!S.token) return Promise.resolve(null);
  groupReq ??= api('GET', '/api/group').then((g) => {
    try { localStorage.setItem(LS_GROUP, JSON.stringify(g)); } catch { /* voll */ }
    return g;
  }).finally(() => { groupReq = null; });
  return groupReq;
}

// Beim Start + wenn die App wieder sichtbar wird
let inited = false;
export function initSync() {
  if (!S.token || inited) return;
  inited = true;
  syncNow().catch(() => {});
  onChange(() => { if (S.token && hash(profileData()) !== S.profHash) scheduleSync(3000); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(500); });
  window.addEventListener('online', () => scheduleSync(500));
  setInterval(() => { if (document.visibilityState === 'visible') syncNow().catch(() => {}); }, 5 * 60000);
}

setSummarizer(summarizer);
