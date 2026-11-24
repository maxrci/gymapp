// Mitteilungen über den eigenen Server (Web-Push): „Pause vorbei“, auch wenn die App im Hintergrund ist.
// iPhone: nur wenn Gym zum Home-Bildschirm hinzugefügt ist (iOS 16.4+). Erlauben muss man es einmal per Tipp.

import { state, saveSettings } from './store.js';
import { api, loggedIn } from './sync.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushEnabled = () => !!state.settings.restPush && pushSupported() && Notification.permission === 'granted';

const key = (b64) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };

// Einschalten (muss aus einem Tipp heraus aufgerufen werden)
export async function enablePush() {
  if (!pushSupported()) throw new Error(/iPhone|iPad/.test(navigator.userAgent) ? 'Mitteilungen gehen auf dem iPhone nur, wenn Gym zum Home-Bildschirm hinzugefügt ist (Teilen → „Zum Home-Bildschirm“).' : 'Dieser Browser unterstützt keine Mitteilungen.');
  if (!loggedIn()) throw new Error('Mitteilungen brauchen die Gruppen-Anmeldung.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt. Du kannst sie in den iPhone-Einstellungen unter Mitteilungen → Gym erlauben.');
  const reg = await navigator.serviceWorker.ready;
  const { key: pub } = await api('GET', '/api/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(pub) });
  await api('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
  await saveSettings({ restPush: true });
  return true;
}
export async function disablePush() {
  await saveSettings({ restPush: false });
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await api('DELETE', '/api/push/subscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); } } catch { /* egal */ }
}
export const testPush = () => api('POST', '/api/push/test');

// Pausentimer: Server schickt die Mitteilung zum Ende; ist die App offen, wird sie kurz vorher abgesagt (Ton kommt dann von der App)
let cancelT = null;
export function scheduleRestPush(endAt, nextText = '') {
  if (!pushEnabled()) return;
  clearTimeout(cancelT);
  api('POST', '/api/push/rest', { at: endAt, title: 'Pause vorbei', body: nextText || 'Weiter geht’s mit dem nächsten Satz.' }).catch(() => {});
  const ms = endAt - Date.now() - 1500;
  if (ms > 0) cancelT = setTimeout(() => { if (document.visibilityState === 'visible') cancelRestPush(); }, ms);
}
export function cancelRestPush() {
  clearTimeout(cancelT);
  if (pushEnabled()) api('POST', '/api/push/rest', { cancel: true }).catch(() => {});
}
