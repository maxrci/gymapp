// Körpergewicht-Verlauf + Anzeige relativ zum Körpergewicht

import { state, saveSettings } from './store.js';
import { num } from './utils.js';

// Verlauf: [{ t, kg }] aufsteigend
export function bwLog() {
  const log = Array.isArray(state.settings.bwLog) ? state.settings.bwLog : [];
  if (!log.length && state.settings.bodyweight) return [{ t: 0, kg: state.settings.bodyweight }];
  return log;
}

// Körpergewicht zu einem Zeitpunkt (letzter Eintrag davor, sonst der erste)
export function bwAt(ts, log = bwLog()) {
  if (!log.length) return null;
  let v = log[0].kg;
  for (const e of log) { if (e.t <= ts) v = e.kg; else break; }
  return v;
}

export const bwNow = () => bwAt(Date.now());
export const bwKey = () => bwLog().map((e) => `${e.t}:${e.kg}`).join(',');

export async function addBodyweight(kg, t = Date.now()) {
  // gleicher Tag → ersetzen
  const day = new Date(t).toDateString();
  let log = bwLog();
  // Bisher nur ein fester Wert → als Startwert zum ersten Workout übernehmen
  if (log.length === 1 && !log[0].t) {
    const first = state.workouts.length ? Math.min(...state.workouts.map((w) => w.start)) : 0;
    log = first && first < t ? [{ t: first, kg: log[0].kg }] : [];
  }
  log = log.filter((e) => e.t && new Date(e.t).toDateString() !== day);
  log.push({ t, kg });
  log.sort((a, b) => a.t - b.t);
  await saveSettings({ bwLog: log, bodyweight: log[log.length - 1].kg, bwUpdated: Date.now() });
}
export async function deleteBodyweight(t) {
  const log = bwLog().filter((e) => e.t !== t);
  await saveSettings({ bwLog: log, bodyweight: log.length ? log[log.length - 1].kg : null, bwUpdated: Date.now() });
}

// ---- Umschalter absolut / relativ ----
const KEY = 'gymlog-rel';
export const rel = {
  get on() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } },
  set(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* egal */ } },
};
export const relAvailable = () => bwLog().length > 0;
export const fmtRel = (v, d = 2) => (v ? `${num(v, d)} × KG` : '–');

// Kleines Segment „kg | × KG“
export function relSwitch() {
  if (!relAvailable()) return '';
  const on = rel.on;
  return `<div class="rel-switch" role="radiogroup" aria-label="Anzeige">
    <button class="${on ? '' : 'on'}" data-rel="0">kg</button><button class="${on ? 'on' : ''}" data-rel="1">× KG</button></div>`;
}
export const relClick = (el, rr) => { rel.set(el.dataset.rel === '1'); rr(); };
