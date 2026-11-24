// Garmin verbinden: persönlichen API-Schlüssel aus Garmin Connect eintragen, der Gruppen-Server holt die Aktivitäten

import { icon, overlay, toast, sheet } from './ui.js';
import { esc, fmtRelDay, fmtDate, num } from './utils.js';
import { api, loggedIn, syncNow } from './sync.js';

const LS = 'gymlog-garmin';
const KEY_URL = 'https://connect.garmin.com/app/settings/personalApiToken';
const cached = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } };
const cache = (s) => { try { localStorage.setItem(LS, JSON.stringify({ connected: !!s?.connected, at: Date.now() })); } catch { /* egal */ } };

export const garminText = () => (cached()?.connected ? 'verbunden' : 'nicht verbunden');

export const FROM = [['30', 'Letzte 30 Tage'], ['90', 'Letzte 90 Tage'], ['year', 'Dieses Jahr'], ['all', 'Alles']];
export const fromTs = (k) => (k === 'all' ? Date.UTC(2009, 0, 1) : k === 'year' ? new Date(new Date().getFullYear(), 0, 1).getTime() : Date.now() - Number(k) * 86400000);
// nur Zeiträume anbieten, die weiter zurückreichen als der bisherige Startpunkt
export const olderChoices = (importFrom) => FROM.filter(([k]) => fromTs(k) < importFrom - 86400000);

let lastRun = 0;
export async function garminSync(force = false) {
  if (!loggedIn() || (!force && !cached()?.connected) || (!force && Date.now() - lastRun < 10 * 60000)) return null;
  lastRun = Date.now();
  try {
    const r = await api('POST', '/api/garmin/sync');
    if (r.added) await syncNow();
    return r;
  } catch (e) {
    if (/Schlüssel abgelaufen/.test(e.message)) cache({ connected: false });
    if (force) throw e;
    return null;
  }
}

export async function openGarmin() {
  if (!loggedIn()) return toast('Garmin braucht den Gruppen-Server – bitte zuerst anmelden.');
  const o = overlay(`<div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Garmin</div><span style="width:40px"></span></div><div class="panel-body"><div class="chart-empty">Lade…</div></div>`, 'garmin-view');
  let st = null, editing = false, from = '90', busy = false;
  const body = () => o.querySelector('.panel-body');
  const load = async () => {
    try { st = await api('GET', '/api/garmin'); cache(st); } catch (e) { body().innerHTML = `<div class="card err-card"><b>Server nicht erreichbar</b><pre>${esc(e.message)}</pre></div>`; return; }
    draw();
  };
  const setupForm = () => `
    <section class="card">
      <div class="card-title">So verbindest du Garmin</div>
      <ol class="st-steps">
        <li>Öffne am Computer oder im Browser <a href="${KEY_URL}" target="_blank" rel="noopener">Garmin Connect → Einstellungen → Personal API</a> und melde dich an.</li>
        <li>Tippe auf <b>„Create Key“</b>, akzeptiere die Bedingungen und wähle eine Laufzeit – am besten <b>1 Jahr</b>.</li>
        <li>Kopiere den Schlüssel (er wird nur einmal angezeigt) und füge ihn hier ein.</li>
      </ol>
    </section>
    <section class="card">
      ${st.lastError && st.configured ? `<p class="st-err">${esc(st.lastError)}</p>` : ''}
      <label class="field"><span>Persönlicher API-Schlüssel</span><textarea data-key rows="3" placeholder="Schlüssel hier einfügen" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></label>
      ${st.configured ? '' : `<div class="cs-l">Übernehmen ab</div><div class="chips">${FROM.map(([k, l]) => `<button class="chip ${k === from ? 'on' : ''}" data-from="${k}">${l}</button>`).join('')}</div>`}
      <button class="btn primary block lg" data-save>${st.configured ? 'Neuen Schlüssel speichern' : 'Mit Garmin verbinden'}</button>
      <p class="footnote">Der Schlüssel wird nur auf eurem Gruppen-Server gespeichert und nie wieder angezeigt. Er kann nur lesen – niemand kann damit etwas in deinem Garmin-Konto ändern.</p>
    </section>`;
  const draw = () => {
    if (!st.configured || editing || !st.connected) { body().innerHTML = setupForm(); return; }
    const older = olderChoices(st.importFrom);
    body().innerHTML = `
      <section class="card st-card ok garmin"><div class="st-ic">${icon('check')}</div><b>Garmin verbunden</b>
        <p>${num(st.imported, 0)} Aktivitäten übernommen · zuletzt abgeglichen ${st.lastSync ? esc(fmtRelDay(st.lastSync) === 'Heute' ? fmtDate(st.lastSync, { hour: '2-digit', minute: '2-digit' }) : fmtRelDay(st.lastSync)) : 'noch nie'}</p>
        <p class="st-from">Übernommen ab ${esc(fmtDate(st.importFrom, { day: 'numeric', month: 'short', year: 'numeric' }))}${st.backfilling ? ' · ältere werden noch nachgeladen' : ''}</p>
        ${st.lastError ? `<p class="st-err">${esc(st.lastError)}</p>` : ''}
        <button class="btn primary block" data-sync>${icon('sync', 'xs')} Jetzt abgleichen</button></section>
      ${older.length ? `<section class="card"><div class="cs-l">Ältere Aktivitäten nachholen</div><div class="chips">${older.map(([k, l]) => `<button class="chip" data-older="${k}">${l}</button>`).join('')}</div></section>` : ''}
      <div class="set-group">
        <button class="set-item" data-edit><span class="si-ic">${icon('key')}</span><span class="si-l">Neuen Schlüssel eintragen</span>${icon('right', 'muted')}</button>
        <button class="set-item danger" data-disconnect><span class="si-ic">${icon('logout')}</span><span class="si-l">Garmin trennen</span>${icon('right', 'muted')}</button>
      </div>
      <p class="footnote">Neue Aktivitäten kommen automatisch – beim Öffnen der App und alle 2 Stunden über den Server. Sie zählen wie eigene Einträge, auch in der Arena. Krafttraining von der Uhr wird nicht übernommen. Läuft der Schlüssel ab, schickt Garmin vorher eine Mail – dann hier einfach einen neuen eintragen.</p>`;
  };
  const run = async (btn, label, fn) => {
    if (busy) return;
    busy = true; if (btn) { btn.disabled = true; btn.textContent = label; }
    try { await fn(); } catch (err) { toast(err.message, 4500); } finally { busy = false; }
    return load();
  };
  o.addEventListener('click', async (e) => {
    const t = (s) => e.target.closest(s);
    if (t('[data-close]')) return o.close();
    const fr = t('[data-from]');
    if (fr) { from = fr.dataset.from; return draw(); }
    if (t('[data-edit]')) { editing = true; return draw(); }
    if (t('[data-save]')) {
      const apiKey = o.querySelector('[data-key]').value.replace(/\s+/g, '');
      if (!apiKey) return toast('Bitte den Schlüssel einfügen.');
      return run(t('[data-save]'), 'Verbinde…', async () => {
        const r = await api('POST', '/api/garmin/config', { apiKey, importFrom: st.configured ? 0 : fromTs(from) });
        editing = false;
        if (r.added) await syncNow();
        toast(r.syncError ? `Verbunden – erster Abgleich klappte noch nicht: ${r.syncError}` : `Garmin verbunden · ${r.added || 0} Aktivität${r.added === 1 ? '' : 'en'} übernommen`, 4000);
      });
    }
    if (t('[data-sync]')) {
      return run(t('[data-sync]'), 'Gleiche ab…', async () => {
        const r = await garminSync(true);
        toast(r?.added ? `${r.added} neue Aktivität${r.added === 1 ? '' : 'en'}` : 'Alles aktuell');
      });
    }
    const old = t('[data-older]');
    if (old) {
      return run(old, 'Hole…', async () => {
        const r = await api('POST', '/api/garmin/backfill', { from: fromTs(old.dataset.older) });
        if (r.added) await syncNow();
        toast(`${r.added || 0} ältere Aktivität${r.added === 1 ? '' : 'en'} übernommen${r.more ? ' – der Rest folgt automatisch' : ''}`, 4000);
      });
    }
    if (t('[data-disconnect]')) {
      const v = await sheet({ title: 'Garmin trennen?', message: 'Neue Aktivitäten kommen dann nicht mehr automatisch. Den Schlüssel kannst du zusätzlich in Garmin Connect löschen.', options: [
        { label: 'Trennen, Workouts behalten', value: 'keep', icon: 'logout' },
        { label: 'Trennen und übernommene Workouts löschen', value: 'remove', icon: 'trash', danger: true },
      ] });
      if (!v) return;
      try { await api('DELETE', `/api/garmin${v === 'remove' ? '?remove=1' : ''}`); cache({ connected: false }); if (v === 'remove') await syncNow(); toast('Garmin getrennt'); } catch (err) { toast(err.message); }
      return load();
    }
  });
  load();
}
