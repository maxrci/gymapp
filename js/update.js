// App-Updates ohne Neuinstallieren: beim Start, beim Zurückkehren in die App und alle 30 Minuten
// nach einer neuen Version suchen. Ist sie geladen, startet die App automatisch neu – aber nur,
// wenn gerade nichts offen ist (kein laufendes Workout im Editor, kein Dialog, kein Tippen).
// Sonst wartet sie, bis du fertig bist oder die App in den Hintergrund geht.

import { toast } from './ui.js';
import { editorOpen } from './workout.js';
import { APP_VERSION } from './version.js';

let reg = null;
let pending = false;
let reloading = false;
let lastCheck = 0;

const busy = () => editorOpen()
  || document.querySelector('.guided, .overlay.open, .sheet-backdrop, .fight, .onb, .intro, .pr-pop')
  || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

function apply() {
  if (reloading) return;
  if (document.visibilityState === 'hidden' || !busy()) {
    reloading = true;
    try { sessionStorage.setItem('gym-updated', '1'); } catch { /* egal */ }
    location.reload();
  } else pending = true;
}

function check(force = false) {
  if (!reg || (!force && Date.now() - lastCheck < 60000)) return;
  lastCheck = Date.now();
  reg.update().catch(() => {});
}

export function initUpdates() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((r) => { reg = r; check(true); })
    .catch((e) => console.warn('SW', e));
  // Neue Version hat übernommen (nicht beim allerersten Installieren)
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) apply(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
    if (pending) apply();
  });
  window.addEventListener('online', () => check(true));
  setInterval(() => { if (document.visibilityState === 'visible') check(); }, 30 * 60000);
  setInterval(() => { if (pending) apply(); }, 4000);
  try {
    if (sessionStorage.getItem('gym-updated')) {
      sessionStorage.removeItem('gym-updated');
      setTimeout(() => toast(`Aktualisiert auf Version ${APP_VERSION}`), 1500);
    }
  } catch { /* egal */ }
}
