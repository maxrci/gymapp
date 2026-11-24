// Plattform-Schicht: ein Ort für Geräte-Funktionen (Vibration, Wake-Lock, Teilen, Benachrichtigungen).
// Jetzt: Web-Implementierungen mit stillen No-Ops. Später: native Implementierungen (Capacitor) hier austauschen,
// die App selbst bleibt unverändert.

const ua = navigator.userAgent || '';
const isNative = !!window.Capacitor?.isNativePlatform?.();
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);

export const platform = {
  isNative,
  isIOS,
  isAndroid,
  isStandalone: !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone),
  isIOSApp: isNative && isIOS, // iOS-Store-Build (z. B. um manche Avatar-Items auszublenden)
};

export function vibrate(pattern) { try { navigator.vibrate?.(pattern); } catch { /* ignore */ } }

// Bildschirm anlassen (idempotent); wird bei Rückkehr in die App erneut angefordert, solange gewollt
let wantAwake = false;
let lock = null;
async function acquire() {
  if (lock || !('wakeLock' in navigator)) return;
  try { lock = await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
}
export async function keepAwake() { wantAwake = true; await acquire(); }
export function releaseAwake() { wantAwake = false; lock?.release?.(); lock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { lock = null; return; } // Lock wird vom System beim Ausblenden freigegeben
  if (wantAwake) acquire();
});

// Teilen: true = geteilt, false = nicht verfügbar; Fehler (z. B. AbortError) werden weitergereicht
export async function share({ title, text, url, files } = {}) {
  if (!navigator.share) return false;
  if (files && !(navigator.canShare && navigator.canShare({ files }))) return false;
  const data = { title, text, url, files };
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  await navigator.share(data);
  return true;
}

// Benachrichtigungen
export function canNotify() { return typeof Notification !== 'undefined' && Notification.permission === 'granted'; }
export async function requestNotify() {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}
export function notify(title, opts) {
  if (!canNotify()) return false;
  try { new Notification(title, opts); return true; } catch { return false; }
}
