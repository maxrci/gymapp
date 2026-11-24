// Strava – läuft komplett auf dem Handy:
// - Client-ID, Secret, Zugänge und Aktivitäten bleiben auf diesem Gerät (nicht in den synchronisierten Einstellungen).
// - Der Gruppen-Server reicht bei der Anmeldung nur den einmaligen Freigabe-Code weiter (Strava verlangt eine feste
//   Rückkehr-Domain); ohne das Secret auf dem Handy ist der Code wertlos.
// - In die Arena geht nur die EP-Grundlage (Start + Dauer) von Aktivitäten ab der Verbindung – keine Details.

import { icon, overlay, toast, sheet } from './ui.js';
import { esc, fmtRelDay, fmtDate, num } from './utils.js';
import { api, loggedIn } from './sync.js';
import { state, saveWorkout, deleteWorkout } from './store.js';
import * as db from './db.js';
import { stravaWorkout } from './stravamap.js';
import { FROM, fromTs, olderChoices } from './garmin.js';

const S_BASE = 'https://www.strava.com';
const KEY = 'strava';
const LS = 'gymlog-strava';
const SCOPE = 'read,activity:read_all';
const MAX_PAGES = 10;
const cached = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } };
const mirror = (c) => { try { localStorage.setItem(LS, JSON.stringify({ connected: !!c?.refresh, athlete: c?.athlete?.name || '' })); } catch { /* egal */ } };
export const stravaText = () => { const c = cached(); return c?.connected ? (c.athlete || 'verbunden') : 'nicht verbunden'; };

const load = async () => (await db.kvGet(KEY)) || null;
const store = async (c) => { await db.kvSet(KEY, c); mirror(c); return c; };

async function tokenRequest(c, params) {
  const r = await fetch(`${S_BASE}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secret, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.message === 'Bad Request' || r.status === 400 ? 'Strava hat die Anmeldung abgelehnt – stimmen Client-ID und Secret?' : `Strava: ${j.message || r.status}`);
  return j;
}
async function accessToken(c) {
  if (c.access && c.expiresAt * 1000 > Date.now() + 120000) return c.access;
  const t = await tokenRequest(c, { grant_type: 'refresh_token', refresh_token: c.refresh });
  Object.assign(c, { access: t.access_token, refresh: t.refresh_token || c.refresh, expiresAt: Number(t.expires_at) || 0 });
  await store(c);
  return c.access;
}

// Neue Aktivitäten direkt von Strava holen und als Workouts speichern
let running = null;
export function stravaSync(force = false) {
  if (running) return running;
  running = (async () => {
    const c = await load();
    if (!c?.refresh) return { added: 0, skipped: 0 };
    if (!force && Date.now() - (c.lastSync || 0) < 10 * 60000) return { added: 0, skipped: 0 };
    let token;
    try { token = await accessToken(c); } catch (e) { c.lastError = e.message; await store(c); throw e; }
    const seen = new Set(c.seen || []);
    const after = Math.floor(Math.max(c.importFrom || 0, (c.lastActivity || 0) - 3 * 86400000) / 1000);
    let added = 0, skipped = 0, maxStart = c.lastActivity || 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await fetch(`${S_BASE}/api/v3/athlete/activities?${new URLSearchParams({ after: String(after), per_page: '100', page: String(page) })}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) { Object.assign(c, { access: null, refresh: null, lastError: 'Zugriff bei Strava entzogen – bitte neu verbinden.' }); await store(c); throw new Error(c.lastError); }
      if (r.status === 429) { c.lastError = 'Strava-Limit erreicht – später geht es weiter.'; break; }
      if (!r.ok) throw new Error(`Strava antwortet nicht (${r.status})`);
      const list = await r.json().catch(() => []);
      if (!Array.isArray(list) || !list.length) break;
      for (const a of list.slice(0, 200)) {
        const aid = String(a?.id ?? '').replace(/\D/g, '');
        if (!aid || seen.has(aid)) { skipped++; continue; }
        seen.add(aid);
        const w = stravaWorkout(a, c.connectedAt || 0);
        if (!w) { skipped++; continue; }
        maxStart = Math.max(maxStart, w.start);
        // schon von Hand eingetragen (Start ±10 Minuten)? Dann nicht doppelt anlegen
        if (state.workouts.some((x) => x.id !== w.id && Math.abs(x.start - w.start) <= 600000)) { skipped++; continue; }
        if (state.workouts.some((x) => x.id === w.id)) { skipped++; continue; }
        await saveWorkout(w);
        added++;
      }
      if (list.length < 100) break;
    }
    Object.assign(c, { seen: [...seen].slice(-20000), lastSync: Date.now(), lastActivity: maxStart, imported: (c.imported || 0) + added });
    if (!c.lastError?.includes('Limit')) c.lastError = '';
    await store(c);
    return { added, skipped };
  })().finally(() => { running = null; });
  return running;
}

let inited = false;
export function initStrava() {
  if (inited) return;
  inited = true;
  const go = () => { if (cached()?.connected) stravaSync().catch(() => {}); };
  setTimeout(go, 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') go(); });
}

export async function openStrava() {
  if (!loggedIn()) return toast('Für die Strava-Anmeldung braucht es den Gruppen-Server – bitte zuerst anmelden.');
  const o = overlay(`<div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Strava</div><span style="width:40px"></span></div><div class="panel-body"><div class="chart-empty">Lade…</div></div>`, 'strava-view');
  let c = null, relay = null, editing = false, from = '90', legacy = null, pollT = null, waiting = null;
  const body = () => o.querySelector('.panel-body');
  const refresh = async () => {
    c = await load();
    mirror(c);
    if (!relay) { try { relay = await api('POST', '/api/strava/relay/start'); } catch (e) { body().innerHTML = `<div class="card err-card"><b>Server nicht erreichbar</b><pre>${esc(e.message)}</pre></div>`; return; } }
    if (legacy === null) { try { const st = await api('GET', '/api/strava'); legacy = st.configured ? st : false; } catch { legacy = false; } }
    draw();
  };
  const setupForm = () => `
    <section class="card">
      <div class="card-title">So richtest du Strava ein</div>
      <ol class="st-steps">
        <li>Öffne <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a> und lege eine App an (Name z. B. „Gym“, Kategorie „Training“, Website beliebig).</li>
        <li>Trage bei <b>„Authorization Callback Domain“</b> genau das ein:<div class="st-copy"><code>${esc(relay.callbackDomain)}</code><button class="btn ghost sm" data-copy="${esc(relay.callbackDomain)}">Kopieren</button></div></li>
        <li>Kopiere <b>Client-ID</b> und <b>Client Secret</b> von dort hierher.</li>
      </ol>
    </section>
    <section class="card">
      <label class="field"><span>Client-ID</span><input data-id inputmode="numeric" value="${esc(c?.clientId || '')}" placeholder="z. B. 123456" autocomplete="off"></label>
      <label class="field"><span>Client Secret${c?.secret ? ' (leer lassen = unverändert)' : ''}</span><input data-secret type="password" placeholder="${c?.secret ? '••••••••' : '40 Zeichen'}" autocomplete="off"></label>
      ${c?.refresh ? '' : `<div class="cs-l">Übernehmen ab</div><div class="chips">${FROM.map(([k, l]) => `<button class="chip ${k === from ? 'on' : ''}" data-from="${k}">${l}</button>`).join('')}</div>`}
      <button class="btn primary block lg" data-save>${c?.refresh ? 'Speichern' : 'Mit Strava verbinden'}</button>
      <p class="footnote">Secret, Zugang und Aktivitäten bleiben nur auf diesem Handy. Ältere Aktivitäten erscheinen in deiner privaten Statistik; EP gibt es für Aktivitäten ab der Verbindung.</p>
    </section>`;
  const legacyCard = () => (legacy ? `<section class="card warn-card">${icon('info')}<div><b>Alte Server-Verbindung</b><small>Bis Version 3.11 hat der Server deine Strava-Aktivitäten abgeholt (${num(legacy.imported || 0, 0)} übernommen). Jetzt läuft das auf dem Handy – die alte Verbindung kannst du entfernen.</small></div><button class="btn ghost sm" data-legacy>Entfernen</button></section>` : '');
  const draw = () => {
    if (!c?.secret || editing) { body().innerHTML = legacyCard() + setupForm(); return; }
    if (!c.refresh) {
      body().innerHTML = `${legacyCard()}<section class="card st-card"><div class="st-ic">${icon('bolt')}</div><b>${waiting ? 'Warte auf Strava…' : 'Zugangsdaten gespeichert'}</b>
        <p>${waiting ? 'Erlaube den Zugriff bei Strava und komm dann hierher zurück.' : 'Jetzt einmal bei Strava anmelden und den Zugriff erlauben.'}</p>
        ${c.lastError ? `<p class="st-err">${esc(c.lastError)}</p>` : ''}
        <button class="btn primary block lg" data-connect>${waiting ? 'Strava erneut öffnen' : 'Mit Strava verbinden'}</button>
        <button class="btn ghost block" data-edit>Zugangsdaten ändern</button></section>
        <p class="footnote">Auf dem iPhone öffnet sich dafür Safari. Nach der Freigabe einfach zur App zurückkehren – die Verbindung wird hier abgeschlossen.</p>`;
      return;
    }
    const older = olderChoices(c.importFrom || Date.now());
    body().innerHTML = `${legacyCard()}
      <section class="card st-card ok"><div class="st-ic">${icon('check')}</div><b>Verbunden${c.athlete?.name ? ` als ${esc(c.athlete.name)}` : ''}</b>
        <p>${num(c.imported || 0, 0)} Aktivitäten übernommen · zuletzt abgeglichen ${c.lastSync ? esc(fmtRelDay(c.lastSync) === 'Heute' ? fmtDate(c.lastSync, { hour: '2-digit', minute: '2-digit' }) : fmtRelDay(c.lastSync)) : 'noch nie'}</p>
        <p class="st-from">EP ab ${esc(fmtDate(c.connectedAt, { day: 'numeric', month: 'short', year: 'numeric' }))} · übernommen ab ${esc(fmtDate(c.importFrom, { day: 'numeric', month: 'short', year: 'numeric' }))}</p>
        ${c.lastError ? `<p class="st-err">${esc(c.lastError)}</p>` : ''}
        <button class="btn primary block" data-sync>${icon('sync', 'xs')} Jetzt abgleichen</button></section>
      ${older.length ? `<section class="card"><div class="cs-l">Ältere Aktivitäten nachholen (nur private Statistik)</div><div class="chips">${older.map(([k, l]) => `<button class="chip" data-older="${k}">${l}</button>`).join('')}</div></section>` : ''}
      <div class="set-group">
        <button class="set-item" data-edit><span class="si-ic">${icon('key')}</span><span class="si-l">Zugangsdaten ändern</span>${icon('right', 'muted')}</button>
        <button class="set-item danger" data-disconnect><span class="si-ic">${icon('logout')}</span><span class="si-l">Strava trennen</span>${icon('right', 'muted')}</button>
      </div>
      <p class="footnote">Alles bleibt auf diesem Handy. In der Arena zählen nur deine EP (ab der Verbindung) – andere sehen weder Aktivitäten noch Strecken oder Zeiten. Neue Aktivitäten kommen beim Öffnen der App. Krafttraining aus Strava wird nicht übernommen.</p>`;
  };
  // Rückkehr von Strava: Code beim Server abholen und selbst gegen Zugänge tauschen
  async function finish() {
    if (!waiting || c?.refresh) return;
    let r;
    try { r = await api('GET', `/api/strava/relay/code?state=${encodeURIComponent(waiting)}`); } catch { return; }
    if (r.status === 'waiting') return;
    clearInterval(pollT); pollT = null;
    waiting = null; relay = null;
    if (r.status !== 'ok') { toast('Der Anmelde-Link ist abgelaufen – bitte erneut verbinden.'); return refresh(); }
    try {
      const t = await tokenRequest(c, { code: r.code, grant_type: 'authorization_code' });
      const a = t.athlete || {};
      Object.assign(c, { access: t.access_token, refresh: t.refresh_token, expiresAt: Number(t.expires_at) || 0, athlete: { id: a.id, name: [a.firstname, a.lastname].filter(Boolean).join(' ').slice(0, 60) }, connectedAt: Date.now(), lastError: '', seen: [], lastActivity: 0, imported: 0 });
      await store(c);
      body().innerHTML = '<div class="chart-empty">Verbunden – hole deine Aktivitäten…</div>';
      const res = await stravaSync(true);
      toast(`Strava verbunden · ${res.added} Aktivität${res.added === 1 ? '' : 'en'} übernommen`, 4000);
    } catch (e) { c.lastError = e.message; await store(c); toast(e.message, 4500); }
    refresh();
  }
  const onVis = () => { if (document.visibilityState === 'visible' && o.isConnected) finish(); };
  document.addEventListener('visibilitychange', onVis);
  const close0 = o.close;
  o.close = () => { document.removeEventListener('visibilitychange', onVis); clearInterval(pollT); close0(); };
  async function connect() {
    if (!relay) relay = await api('POST', '/api/strava/relay/start');
    waiting = relay.state;
    const q = new URLSearchParams({ client_id: c.clientId, response_type: 'code', redirect_uri: relay.redirectUri, approval_prompt: 'auto', scope: SCOPE, state: relay.state });
    const url = `${S_BASE}/oauth/authorize?${q}`;
    clearInterval(pollT);
    pollT = setInterval(finish, 3000);
    const w = window.open(url, '_blank');
    if (w) w.opener = null; else location.href = url;
    draw();
  }
  o.addEventListener('click', async (e) => {
    const t = (s) => e.target.closest(s);
    if (t('[data-close]')) return o.close();
    const cp = t('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Kopiert'); } catch { toast(cp.dataset.copy); } return; }
    const fr = t('[data-from]');
    if (fr) { from = fr.dataset.from; return draw(); }
    if (t('[data-edit]')) { editing = true; return draw(); }
    if (t('[data-save]')) {
      const clientId = o.querySelector('[data-id]').value.trim();
      const secret = o.querySelector('[data-secret]').value.trim() || c?.secret || '';
      if (!/^\d{1,12}$/.test(clientId)) return toast('Die Client-ID besteht nur aus Ziffern (z. B. 123456).');
      if (!/^[A-Za-z0-9]{20,80}$/.test(secret)) return toast('Das Client Secret sieht nicht richtig aus (40 Zeichen aus Buchstaben und Ziffern).');
      const changed = !c || c.clientId !== clientId || c.secret !== secret;
      c = { ...(c || {}), clientId, secret, importFrom: c?.refresh ? c.importFrom : fromTs(from) };
      if (changed) Object.assign(c, { access: null, refresh: null, expiresAt: 0 });
      await store(c);
      editing = false;
      if (!c.refresh) { try { await connect(); } catch (err) { toast(err.message, 4000); } return; }
      toast('Gespeichert'); return draw();
    }
    if (t('[data-connect]')) { try { await connect(); } catch (err) { toast(err.message, 4000); } return; }
    if (t('[data-sync]')) {
      const b = t('[data-sync]'); b.disabled = true; b.textContent = 'Gleiche ab…';
      try { const r = await stravaSync(true); toast(r.added ? `${r.added} neue Aktivität${r.added === 1 ? '' : 'en'}` : 'Alles aktuell'); } catch (err) { toast(err.message, 4000); }
      return refresh();
    }
    const old = t('[data-older]');
    if (old) {
      old.disabled = true; old.textContent = 'Hole…';
      c.importFrom = fromTs(old.dataset.older); c.lastActivity = 0; await store(c);
      try { const r = await stravaSync(true); toast(`${r.added} ältere Aktivität${r.added === 1 ? '' : 'en'} übernommen (nur private Statistik)`, 4000); } catch (err) { toast(err.message, 4000); }
      return refresh();
    }
    if (t('[data-legacy]')) {
      const v = await sheet({ title: 'Alte Server-Verbindung entfernen?', message: 'Die vom Server übernommenen Strava-Workouts kannst du dabei auch löschen (auf dem Server und auf deinen Geräten).', options: [
        { label: 'Entfernen, Workouts behalten', value: 'keep', icon: 'logout' },
        { label: 'Entfernen und diese Workouts löschen', value: 'remove', icon: 'trash', danger: true },
      ] });
      if (!v) return;
      try { await api('DELETE', `/api/strava${v === 'remove' ? '?remove=1' : ''}`); legacy = false; toast('Alte Verbindung entfernt'); } catch (err) { toast(err.message); }
      return draw();
    }
    if (t('[data-disconnect]')) {
      const v = await sheet({ title: 'Strava trennen?', message: 'Neue Aktivitäten kommen dann nicht mehr.', options: [
        { label: 'Trennen, Workouts behalten', value: 'keep', icon: 'logout' },
        { label: 'Trennen und übernommene Workouts löschen', value: 'remove', icon: 'trash', danger: true },
      ] });
      if (!v) return;
      if (c.access) fetch(`${S_BASE}/oauth/deauthorize`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ access_token: c.access }) }).catch(() => {});
      if (v === 'remove') for (const w of state.workouts.filter((x) => x.source === 'strava')) await deleteWorkout(w.id);
      await db.kvDel(KEY); mirror(null); c = null; relay = null;
      toast('Strava getrennt');
      return refresh();
    }
  });
  refresh();
}
