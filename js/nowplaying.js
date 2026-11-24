// Workout auf dem Sperrbildschirm (wie ein Musikplayer): Übung, Satz und Pausenzeit über die Media-Session-Schnittstelle.
// Als Web-App braucht das laufende (stille) Audio – iOS pausiert dafür andere Musik. Deshalb nur, wenn eingeschaltet.

import { state } from './store.js';
import { fmtClock, num } from './utils.js';

let audio = null, url = null, playing = false;

function silentWav() {
  const rate = 8000, n = rate; // 1 s Stille
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

const wanted = () => !!state.settings.lockScreen && !!state.active && 'mediaSession' in navigator;

// muss aus einem Tipp heraus starten (Browser-Regel für Audio)
export function tapStart() {
  if (!wanted() || playing) return;
  url ??= silentWav();
  audio ??= Object.assign(new Audio(url), { loop: true });
  audio.play().then(() => { playing = true; update(); }).catch(() => {});
}
export function stop() {
  if (audio) { audio.pause(); }
  playing = false;
  try { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; } catch { /* egal */ }
}

export function update() {
  if (!playing) return;
  if (!wanted()) { stop(); return; }
  const a = state.active;
  const rest = a.rest && a.rest.end > Date.now() ? a.rest : null;
  let title = a.title || 'Workout', next = '';
  for (const e of a.exercises || []) {
    const i = e.sets.findIndex((s) => !s.done);
    if (i >= 0) { const s = e.sets[i]; title = e.name; next = `Satz ${i + 1}/${e.sets.length}${s.weight ? ` · ${num(s.weight, 1)} kg` : ''}${s.reps ? ` × ${s.reps}` : ''}`; break; }
  }
  const artist = rest ? `Pause ${fmtClock(Math.ceil((rest.end - Date.now()) / 1000))} · danach ${next}` : `${next ? `${next} · ` : ''}Workout ${fmtClock((Date.now() - a.start) / 1000)}`;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album: 'Gym', artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
    navigator.mediaSession.playbackState = 'playing';
    if (rest && navigator.mediaSession.setPositionState) {
      const total = Math.max(1, rest.total), left = Math.max(0, (rest.end - Date.now()) / 1000);
      navigator.mediaSession.setPositionState({ duration: total, position: Math.min(total, total - left), playbackRate: 1 });
    }
  } catch { /* egal */ }
}

let inited = false;
export function initNowPlaying() {
  if (inited) return;
  inited = true;
  document.addEventListener('pointerdown', tapStart, { passive: true });
  setInterval(update, 1000);
}
