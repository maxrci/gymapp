// Schritte aus Apple Health (über einen iOS-Kurzbefehl) bzw. von Android-Automatisierungen.
// Der Kurzbefehl meldet die Schritte mit einem eigenen Schlüssel an den Server; die App holt sie von dort.

import { overlay, icon, toast, confirmDialog } from './ui.js';
import { esc, num } from './utils.js';
import { api, loggedIn } from './sync.js';

const LS = 'gymlog-steps';
let cache = (() => { try { return JSON.parse(localStorage.getItem(LS) || 'null') || { connected: false, days: [] }; } catch { return { connected: false, days: [] }; } })();
const dayId = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const stepsConnected = () => !!cache.connected;
export const stepsOn = (day = dayId()) => cache.days.find((d) => d.day === day)?.steps ?? null;
export function stepsAvg(n = 7) {
  const list = cache.days.filter((d) => d.day < dayId()).slice(-n);
  return list.length ? Math.round(list.reduce((a, d) => a + d.steps, 0) / list.length) : null;
}
// Verbrauch durch Schritte (grob: 0,0005 kcal pro Schritt und kg Körpergewicht)
export const stepsKcal = (steps, kg) => (steps && kg ? Math.round(steps * 0.0005 * kg) : 0);

let last = 0;
export async function refreshSteps(force = false) {
  if (!loggedIn() || (!force && Date.now() - last < 10 * 60000)) return cache;
  last = Date.now();
  try {
    const from = dayId(Date.now() - 60 * 864e5);
    const r = await api('GET', `/api/steps?from=${from}`);
    cache = { connected: !!r.connected, days: Array.isArray(r.days) ? r.days : [] };
    localStorage.setItem(LS, JSON.stringify(cache));
  } catch { /* offline */ }
  return cache;
}

export function openSteps() {
  if (!loggedIn()) return toast('Schritte brauchen die Gruppen-Anmeldung.');
  const o = overlay('', 'steps-view');
  let creds = null;
  const copyBtn = (v, l) => `<button class="btn ghost sm" data-copy="${esc(v)}">${l}</button>`;
  const draw = () => {
    const today = stepsOn();
    o.innerHTML = `<div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Schritte (Apple Health)</div><span style="width:40px"></span></div>
      <div class="panel-body">
        ${cache.connected ? `<section class="card st-card ok"><div class="st-ic">${icon('check')}</div><b>${today != null ? `${num(today, 0)} Schritte heute` : 'Verbunden – noch keine Schritte von heute'}</b>
          <p>${stepsAvg() ? `Ø ${num(stepsAvg(), 0)} pro Tag (letzte 7 Tage)` : 'Sobald der Kurzbefehl läuft, erscheinen hier deine Schritte.'}</p></section>` : ''}
        <section class="card">
          <div class="card-title">So richtest du es ein (einmalig, ca. 3 Minuten)</div>
          <ol class="st-steps">
            <li>${creds ? 'Schlüssel erzeugt – unten kopieren.' : `<button class="btn primary sm" data-key>${cache.connected ? 'Neuen Schlüssel erzeugen' : 'Schlüssel erzeugen'}</button>`}</li>
            ${creds ? `<li>Adresse:<div class="st-copy"><code>${esc(creds.url)}</code>${copyBtn(creds.url, 'Kopieren')}</div></li>
            <li>Schlüssel:<div class="st-copy"><code>Bearer ${esc(creds.key)}</code>${copyBtn(`Bearer ${creds.key}`, 'Kopieren')}</div><small class="muted">Der Schlüssel kann nur Schritte melden und wird nur jetzt angezeigt.</small></li>` : ''}
            <li>Öffne die App <b>Kurzbefehle</b> → <b>Automation</b> → <b>+</b> → <b>Tageszeit</b> (z. B. 23:30, täglich) → <b>Sofort ausführen</b>.</li>
            <li>Aktion <b>„Health-Samples suchen“</b>: Typ <b>Schritte</b>, Startdatum <b>ist heute</b>.</li>
            <li>Aktion <b>„Statistiken berechnen“</b> → <b>Summe</b>.</li>
            <li>Aktion <b>„Inhalte von URL abrufen“</b>: Adresse von oben einfügen, Methode <b>POST</b>, Header <b>Authorization</b> = Schlüssel von oben, Hauptteil <b>JSON</b> mit Feld <b>steps</b> = <i>Statistiken</i>.</li>
            <li>Fertig. Zum Testen die Automation einmal antippen – hier erscheinen dann die Schritte.</li>
          </ol>
        </section>
        <p class="footnote">Schritte fließen in deinen Kalorienverbrauch ein. Sie sind privat und werden nicht mit deiner Gruppe geteilt. Auf Android geht dasselbe mit einer Automatisierungs-App, die eine Web-Anfrage senden kann.</p>
        ${cache.connected ? '<button class="btn ghost block danger" data-off>Verbindung trennen</button>' : ''}
      </div>`;
  };
  draw();
  refreshSteps(true).then(() => { if (o.isConnected) draw(); });
  o.addEventListener('click', async (e) => {
    const b = (s) => e.target.closest(s);
    if (b('[data-close]')) return o.close();
    if (b('[data-copy]')) { try { await navigator.clipboard.writeText(b('[data-copy]').dataset.copy); toast('Kopiert'); } catch { toast(b('[data-copy]').dataset.copy, 6000); } return; }
    if (b('[data-key]')) {
      if (cache.connected && !(await confirmDialog('Neuen Schlüssel erzeugen? Der alte Kurzbefehl funktioniert danach nicht mehr.', 'Erzeugen'))) return;
      try { creds = await api('POST', '/api/steps/key'); cache.connected = true; draw(); } catch (x) { toast(x.message); }
      return;
    }
    if (b('[data-off]')) {
      if (!(await confirmDialog('Schritte-Verbindung trennen? Der Kurzbefehl kann danach nichts mehr melden.', 'Trennen', true))) return;
      try { await api('DELETE', '/api/steps/key'); cache.connected = false; localStorage.setItem(LS, JSON.stringify(cache)); draw(); } catch (x) { toast(x.message); }
    }
  });
}
