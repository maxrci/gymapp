// Strava verbinden: eigene Strava-API-App eintragen, über den Gruppen-Server anmelden, Aktivitäten automatisch übernehmen

import { icon, overlay, toast, sheet } from './ui.js';
import { esc, fmtRelDay, fmtDate, num } from './utils.js';
import { api, loggedIn, syncNow } from './sync.js';
import { FROM, fromTs, olderChoices, garminSync } from './garmin.js';

const LS = 'gymlog-strava';
const cached = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } };
const cache = (s) => { try { localStorage.setItem(LS, JSON.stringify({ connected: !!s?.connected, athlete: s?.athlete?.name || '', at: Date.now() })); } catch { /* egal */ } };

export const stravaText = () => { const c = cached(); return c?.connected ? (c.athlete || 'verbunden') : 'nicht verbunden'; };


// Abgleich anstoßen (Server holt neue Aktivitäten) und danach normal synchronisieren
let lastRun = 0;
export async function stravaSync(force = false) {
  if (!loggedIn() || (!force && !cached()?.connected) || (!force && Date.now() - lastRun < 10 * 60000)) return null;
  lastRun = Date.now();
  try {
    const r = await api('POST', '/api/strava/sync');
    if (r.added) await syncNow();
    return r;
  } catch (e) {
    if (/neu verbinden/.test(e.message)) cache({ connected: false });
    if (force) throw e;
    return null;
  }
}
// Strava und Garmin beim Öffnen der App und bei jeder Rückkehr abgleichen (höchstens alle 10 Minuten)
let inited = false;
export function initStrava() {
  if (!loggedIn() || inited) return;
  inited = true;
  const both = () => { stravaSync(); garminSync(); };
  setTimeout(both, 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') both(); });
}

export async function openStrava() {
  if (!loggedIn()) return toast('Strava braucht den Gruppen-Server – bitte zuerst anmelden.');
  const o = overlay(`<div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Strava</div><span style="width:40px"></span></div><div class="panel-body"><div class="chart-empty">Lade…</div></div>`, 'strava-view');
  let st = null, editing = false, from = '90';
  const body = () => o.querySelector('.panel-body');
  const load = async () => {
    try { st = await api('GET', '/api/strava'); cache(st); } catch (e) { body().innerHTML = `<div class="card err-card"><b>Server nicht erreichbar</b><pre>${esc(e.message)}</pre></div>`; return; }
    draw();
  };
  const setupForm = () => `
    <section class="card">
      <div class="card-title">So richtest du Strava ein</div>
      <ol class="st-steps">
        <li>Öffne <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a> und lege eine App an (Name z. B. „Gym“, Kategorie „Training“, Website beliebig).</li>
        <li>Trage bei <b>„Authorization Callback Domain“</b> genau das ein:<div class="st-copy"><code>${esc(st.callbackDomain)}</code><button class="btn ghost sm" data-copy="${esc(st.callbackDomain)}">Kopieren</button></div></li>
        <li>Kopiere <b>Client-ID</b> und <b>Client Secret</b> von dort hierher.</li>
      </ol>
    </section>
    <section class="card">
      <label class="field"><span>Client-ID</span><input data-id inputmode="numeric" value="${esc(st.clientId)}" placeholder="z. B. 123456" autocomplete="off"></label>
      <label class="field"><span>Client Secret${st.configured ? ' (leer lassen = unverändert)' : ''}</span><input data-secret type="password" placeholder="${st.configured ? '••••••••' : '40 Zeichen'}" autocomplete="off"></label>
      ${st.connected ? '' : `<div class="cs-l">Übernehmen ab</div><div class="chips">${FROM.map(([k, l]) => `<button class="chip ${k === from ? 'on' : ''}" data-from="${k}">${l}</button>`).join('')}</div>`}
      <button class="btn primary block lg" data-save>${st.connected ? 'Speichern' : 'Speichern & mit Strava verbinden'}</button>
      <p class="footnote">Das Secret wird nur auf eurem Gruppen-Server gespeichert und nie wieder angezeigt.</p>
    </section>`;
  const draw = () => {
    if (!st.configured || editing) { body().innerHTML = setupForm(); return; }
    if (!st.connected) {
      body().innerHTML = `<section class="card st-card"><div class="st-ic">${icon('bolt')}</div><b>Zugangsdaten gespeichert</b><p>Jetzt einmal bei Strava anmelden und den Zugriff erlauben.</p>
        ${st.lastError ? `<p class="st-err">${esc(st.lastError)}</p>` : ''}
        <button class="btn primary block lg" data-connect>Mit Strava verbinden</button>
        <button class="btn ghost block" data-edit>Zugangsdaten ändern</button></section>
        <p class="footnote">Auf dem iPhone öffnet sich dafür Safari. Nach der Freigabe einfach zur App zurückkehren – hier erscheint dann „verbunden“.</p>`;
      return;
    }
    body().innerHTML = `
      <section class="card st-card ok"><div class="st-ic">${icon('check')}</div><b>Verbunden${st.athlete?.name ? ` als ${esc(st.athlete.name)}` : ''}</b>
        <p>${num(st.imported, 0)} Aktivitäten übernommen · zuletzt abgeglichen ${st.lastSync ? esc(fmtRelDay(st.lastSync) === 'Heute' ? fmtDate(st.lastSync, { hour: '2-digit', minute: '2-digit' }) : fmtRelDay(st.lastSync)) : 'noch nie'}</p>
        ${st.importFrom ? `<p class="st-from">Übernommen ab ${esc(fmtDate(st.importFrom, { day: 'numeric', month: 'short', year: 'numeric' }))}</p>` : ''}
        ${st.lastError ? `<p class="st-err">${esc(st.lastError)}</p>` : ''}
        <button class="btn primary block" data-sync>${icon('sync', 'xs')} Jetzt abgleichen</button></section>
      ${olderChoices(st.importFrom).length ? `<section class="card"><div class="cs-l">Ältere Aktivitäten nachholen</div><div class="chips">${olderChoices(st.importFrom).map(([k, l]) => `<button class="chip" data-older="${k}">${l}</button>`).join('')}</div></section>` : ''}
      <div class="set-group">
        <button class="set-item" data-edit><span class="si-ic">${icon('key')}</span><span class="si-l">Zugangsdaten ändern</span>${icon('right', 'muted')}</button>
        <button class="set-item danger" data-disconnect><span class="si-ic">${icon('logout')}</span><span class="si-l">Strava trennen</span>${icon('right', 'muted')}</button>
      </div>
      <p class="footnote">Neue Aktivitäten (Laufen, Rad, Inliner, Schwimmen, Wandern, Rudern …) kommen automatisch – beim Öffnen der App und alle 2 Stunden über den Server. Sie zählen wie eigene Einträge, auch in der Arena. Krafttraining aus Strava wird nicht übernommen.</p>`;
  };
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
      const clientSecret = o.querySelector('[data-secret]').value.trim();
      try {
        st = await api('POST', '/api/strava/config', { clientId, clientSecret, importFrom: st.connected ? 0 : fromTs(from) });
        editing = false;
        if (!st.connected) return connect();
        toast('Gespeichert'); draw();
      } catch (err) { toast(err.message, 4000); }
      return;
    }
    if (t('[data-connect]')) return connect();
    if (t('[data-sync]')) {
      const b = t('[data-sync]'); b.disabled = true; b.textContent = 'Gleiche ab…';
      try { const r = await stravaSync(true); toast(r?.added ? `${r.added} neue Aktivität${r.added === 1 ? '' : 'en'}` : 'Alles aktuell'); } catch (err) { toast(err.message, 4000); }
      return load();
    }
    const old = t('[data-older]');
    if (old) {
      old.disabled = true; old.textContent = 'Hole…';
      try {
        const r = await api('POST', '/api/strava/backfill', { from: fromTs(old.dataset.older) });
        if (r.added) await syncNow();
        toast(`${r.added || 0} ältere Aktivität${r.added === 1 ? '' : 'en'} übernommen`, 4000);
      } catch (err) { toast(err.message, 4000); }
      return load();
    }
    if (t('[data-disconnect]')) {
      const v = await sheet({ title: 'Strava trennen?', message: 'Neue Aktivitäten kommen dann nicht mehr automatisch.', options: [
        { label: 'Trennen, Workouts behalten', value: 'keep', icon: 'logout' },
        { label: 'Trennen und übernommene Workouts löschen', value: 'remove', icon: 'trash', danger: true },
      ] });
      if (!v) return;
      try { await api('DELETE', `/api/strava${v === 'remove' ? '?remove=1' : ''}`); cache({ connected: false }); if (v === 'remove') await syncNow(); toast('Strava getrennt'); } catch (err) { toast(err.message); }
      return load();
    }
  });
  async function connect() {
    try {
      const { url } = await api('POST', '/api/strava/authorize');
      // nach der Rückkehr aus Safari/Strava Status neu laden
      const onVis = () => { if (document.visibilityState === 'visible' && o.isConnected) { load(); } };
      document.addEventListener('visibilitychange', onVis);
      const w = window.open(url, '_blank');
      if (w) w.opener = null; else location.href = url;
      draw();
    } catch (err) { toast(err.message, 4000); }
  }
  load();
}
