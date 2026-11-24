// Umzug von der alten Adresse (GitHub Pages) auf den eigenen Server – so stressfrei wie möglich:
// ein Knopf sichert alles und öffnet die neue App mit einem Einmal-Link (ohne Passwort).

import { overlay, toast, icon } from './ui.js';
import { loggedIn, syncNow, transferLink, pendingChanges, onSync } from './sync.js';
import { state, saveSettings } from './store.js';

const OLD_HOST = /\.github\.io$/i.test(location.hostname);
const LATER = 'gymlog-move-later';

export function maybeShowMigration() {
  if (!OLD_HOST) return;
  try { if (Date.now() - Number(localStorage.getItem(LATER) || 0) < 864e5) return; } catch { /* egal */ }
  const o = overlay(`<div class="panel-body move-panel">
    <div class="move-ic">${icon('home')}</div>
    <h2>Gym zieht um</h2>
    <p>Die App läuft ab jetzt privat auf dem eigenen Server eurer Gruppe. <b>Alle deine Daten kommen mit</b> – Workouts, Routinen, Ziele, Einstellungen. Du musst nichts neu eingeben.</p>
    <div class="move-body"></div>
    <button class="btn ghost block" data-later>Später erinnern</button>
  </div>`, 'move-view');
  const body = o.querySelector('.move-body');
  const draw = () => {
    body.innerHTML = loggedIn() ? `
      <ol class="st-steps">
        <li>Auf <b>„Jetzt umziehen“</b> tippen – deine Daten werden gesichert und die neue App öffnet sich.</li>
        <li>Dort über <b>Teilen → „Zum Home-Bildschirm“</b> die neue App hinzufügen.</li>
        <li>Diese alte App vom Home-Bildschirm löschen.</li>
      </ol>
      <button class="btn primary block lg" data-move>Jetzt umziehen</button>` : `
      <p>Für die neue App brauchst du ein Konto (Benutzername + Passwort) vom Admin deiner Gruppe. Melde dich damit <b>hier</b> an – dann ziehen deine Daten automatisch mit.</p>
      <button class="btn primary block lg" data-login>Anmelden</button>`;
  };
  draw();
  const off = () => { o.close(); };
  onSync(() => { if (o.isConnected && !o.querySelector('[data-move][disabled]')) draw(); });
  o.addEventListener('click', async (e) => {
    const t = (s) => e.target.closest(s);
    if (t('[data-later]')) { try { localStorage.setItem(LATER, String(Date.now())); } catch { /* egal */ } return off(); }
    if (t('[data-login]')) { off(); location.hash = '#/login'; return; }
    const b = t('[data-move]');
    if (!b) return;
    b.disabled = true; b.textContent = 'Sichere deine Daten…';
    try {
      // alles hochladen, bis nichts mehr offen ist
      for (let i = 0; i < 5 && (i === 0 || pendingChanges() > 0); i++) await syncNow();
      if (pendingChanges() > 0) throw new Error('Noch nicht alles gesichert – bitte kurz warten und nochmal tippen.');
      b.textContent = 'Öffne die neue App…';
      const url = await transferLink();
      const w = window.open(url, '_blank');
      if (!w) location.href = url;
      b.disabled = false; b.textContent = 'Nochmal öffnen';
    } catch (err) {
      toast(err.message === 'Failed to fetch' ? 'Keine Verbindung – bitte mit Internet nochmal versuchen.' : err.message, 4500);
      b.disabled = false; b.textContent = 'Jetzt umziehen';
    }
  });
}

// Neue App direkt nach dem Umzug: kein Onboarding, kurze Bestätigung sobald die Daten da sind
export function justMoved() {
  try { return sessionStorage.getItem('gymlog-moved') === '1'; } catch { return false; }
}
export function welcomeMoved() {
  if (!justMoved()) return;
  try { sessionStorage.removeItem('gymlog-moved'); } catch { /* egal */ }
  syncNow().then(async () => { if (!state.settings.onboarded) await saveSettings({ onboarded: 1 }); }).then(() => toast('Umzug geschafft – deine Daten sind da. Tipp: Teilen → „Zum Home-Bildschirm“', 6000)).catch(() => {});
}
