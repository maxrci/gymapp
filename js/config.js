// Einstellbare Werte vom Server (Punkte, Erfolge, Events, freischaltbare Objekte, Übungen, Funktionen).
// Der Admin pflegt sie später im Dashboard; ohne Server oder offline gelten die Standardwerte aus dem Code.

import { api, loggedIn } from './sync.js';
import { setCustomExercises } from './library.js';

const LS = 'gymlog-config';
const DEFAULTS = { points: null, achievements: null, events: null, unlockables: null, exercises: null, features: {} };
let remote = {};
try { remote = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { remote = {}; }
setCustomExercises(remote.exercises?.value?.custom);

// Wert eines Bereichs: Server-Stand, sonst Standard (null = Code-Standard des jeweiligen Moduls verwenden)
export const conf = (key) => (remote[key]?.value ?? DEFAULTS[key] ?? null);
export const feature = (name, fallback = true) => { const f = conf('features'); return f && typeof f[name] === 'boolean' ? f[name] : fallback; };

let last = 0;
export async function refreshConfig() {
  if (!loggedIn() || Date.now() - last < 10 * 60000) return;
  last = Date.now();
  try {
    const r = await api('GET', '/api/config');
    if (r && typeof r === 'object') { remote = r; localStorage.setItem(LS, JSON.stringify(r)); setCustomExercises(r.exercises?.value?.custom); }
  } catch { /* offline: alter Stand bleibt */ }
}
