// AI-Coach: Schalter, Ziele, Körperdaten, Sportarten und Ausgangswerte aus dem Verlauf
// (lokales Regelwerk – keine Cloud)

import { state, saveSettings } from '../store.js';
import { idx } from '../stats.js';
import { bwNow } from '../body.js';
import { cardioKind } from '../compete.js';
import { DAY, startOfWeek, addDays, fmtDate, num } from '../utils.js';

export const workoutCoachOn = () => !!state.settings.aiWorkout;
export const cardioCoachOn = () => !!state.settings.aiCardio;
export const coachOn = () => workoutCoachOn() || cardioCoachOn();

export const coachData = () => state.settings.coach || {};
export async function saveCoach(patch) {
  await saveSettings({ coach: { ...coachData(), ...patch } });
}
// aktive Ziele (nur wenn der jeweilige Coach an ist)
export const goalW = () => (workoutCoachOn() ? coachData().workout || null : null);
export const goalC = () => (cardioCoachOn() ? coachData().cardio || null : null);

// ---------- Körperdaten ----------
export const ACTIVITY = [
  { v: 1.25, label: 'Viel sitzen', sub: 'Büro, Studium' },
  { v: 1.4, label: 'Teils auf den Beinen', sub: 'Laufwege, Haushalt' },
  { v: 1.6, label: 'Körperlich aktiv', sub: 'Handwerk, Pflege, Kellnern' },
];
export function body() {
  const b = coachData().body || {};
  return { sex: b.sex || null, age: b.age || null, height: b.height || null, activity: b.activity || 1.4, weight: bwNow() || state.settings.bodyweight || null };
}
export const bodyComplete = () => { const b = body(); return !!(b.sex && b.age && b.height && b.weight); };

// ---------- Stand ----------
export const LEVELS = { beginner: 'Einsteiger', inter: 'Fortgeschritten', adv: 'Erfahren' };
// Einordnung aus dem Verlauf: Trainingsdauer und Regelmäßigkeit der letzten 3 Monate
export function estimateLevel() {
  const { asc } = idx();
  if (!asc.length) return 'beginner';
  const months = (Date.now() - asc[0].start) / (30 * DAY);
  const recent = asc.filter((w) => w.start > Date.now() - 90 * DAY).length;
  let lvl = months < 6 ? 'beginner' : months < 24 ? 'inter' : 'adv';
  if (recent < 8 && lvl === 'adv') lvl = 'inter';
  else if (recent < 4 && lvl === 'inter') lvl = 'beginner';
  return lvl;
}

// ---------- Kraft-Ausgangswerte ----------
// aktuelles geschätztes 1RM einer Übung: Bestwert der letzten 6 Wochen, sonst letzte Einheit
export function currentE1rm(name) {
  const x = idx().ex.get(name);
  if (!x?.sessions.length) return 0;
  const recent = x.sessions.filter((s) => s.date > Date.now() - 42 * DAY && s.bestE1rm);
  if (recent.length) return Math.max(...recent.map((s) => s.bestE1rm));
  return x.sessions.filter((s) => s.bestE1rm).slice(-1)[0]?.bestE1rm || 0;
}
// Übungen, für die sich ein 1RM-Ziel lohnt (aus dem Verlauf, häufigste zuerst) + Klassiker
export function ormCandidates() {
  const own = [...idx().ex.values()].filter((x) => (x.type === 'weight' || x.type === 'weighted_bw') && x.best.e1rm > 0)
    .sort((a, b) => b.count - a.count).map((x) => x.name);
  const classic = ['Bankdrücken (Langhantel)', 'Squat (Langhantel)', 'Kreuzheben (Langhantel)', 'Schulterdrücken (Langhantel)', 'Klimmzug (Gewichtet)'];
  return [...new Set([...own.slice(0, 12), ...classic])];
}

// ---------- Ausdauer ----------
// pace: wie Tempo angezeigt wird; exp: Riegel-Exponent (Zeit wächst etwas stärker als die Distanz)
export const SPORTS = {
  run: { label: 'Laufen', exercise: 'Laufen', kinds: ['run', 'sprint'], pace: 'km', pose: 'run', device: 'treadmill', exp: 1.06, speed: { beginner: 8.5, inter: 10.5, adv: 12.5 }, minEasy: 3 },
  bike: { label: 'Radfahren', exercise: 'Radfahren', kinds: ['bike'], pace: 'kmh', pose: 'bike', device: 'bike', exp: 1.05, speed: { beginner: 20, inter: 25, adv: 30 }, minEasy: 10 },
  skate: { label: 'Inliner', exercise: 'Inliner', kinds: ['skate'], pace: 'kmh', pose: 'sprint', exp: 1.05, speed: { beginner: 14, inter: 18, adv: 22 }, minEasy: 6 },
  row: { label: 'Rudern', exercise: 'Rudermaschine', kinds: ['row'], pace: '500', pose: 'rower', device: 'rower', exp: 1.06, speed: { beginner: 10, inter: 11.5, adv: 13 }, minEasy: 2 },
  swim: { label: 'Schwimmen', exercise: 'Schwimmen', kinds: ['swim'], pace: '100', pose: 'sprint', exp: 1.05, speed: { beginner: 2, inter: 2.7, adv: 3.4 }, minEasy: 0.5 },
  walk: { label: 'Gehen / Wandern', exercise: 'Wandern', kinds: ['walk', 'hike'], pace: 'km', pose: 'oldwalk', exp: 1.03, speed: { beginner: 4.5, inter: 5.3, adv: 6 }, minEasy: 3 },
};

// Geräte für den Ersatz (zusätzlich Crosstrainer) – damit man geräteunabhängig fit wird
export const ALT = {
  ...SPORTS,
  elliptical: { label: 'Crosstrainer', exercise: 'Crosstrainer', kinds: ['elliptical'], pace: 'kmh', pose: 'elliptical', device: 'elliptical', exp: 1.05, speed: { beginner: 8, inter: 9.5, adv: 11 }, minEasy: 3, noKm: true },
};
// Umrechnung bei gleicher Pulszone: Dauer × Faktor (Laufen = 1). Rad braucht länger für denselben Reiz,
// weil weniger Muskeln arbeiten und das Körpergewicht getragen wird; Schwimmen fordert pro Minute etwas mehr.
export const EQUIV_F = { run: 1, walk: 1.8, bike: 1.4, skate: 1.3, row: 1.05, swim: 0.9, elliptical: 1.1 };
export const timeFactor = (from, to) => (EQUIV_F[to] || 1) / (EQUIV_F[from] || 1);

// alle Einheiten einer Sportart mit Distanz (für Ausgangswert, Fortschritt, Wochen-Abgleich)
export function sportSessions(sport) {
  const S = ALT[sport];
  const out = [];
  for (const x of idx().ex.values()) {
    const k = cardioKind(x.name, x.type);
    if (!k || !S.kinds.includes(k)) continue;
    for (const s of x.sessions) out.push({ date: s.date, wid: s.wid, km: s.distance || 0, sec: s.duration || 0, name: x.name });
  }
  return out.sort((a, b) => a.date - b.date);
}
// Ausgangswert: längste Einheit mit Distanz + Zeit in den letzten 8 Wochen (sonst 6 Monate)
export function cardioBaseline(sport) {
  const all = sportSessions(sport).filter((s) => s.km > 0 && s.sec > 0);
  for (const days of [56, 182]) {
    const r = all.filter((s) => s.date > Date.now() - days * DAY);
    if (r.length) {
      const best = r.reduce((a, b) => (b.km > a.km ? b : a));
      return { km: best.km, sec: best.sec, date: best.date, count: r.length };
    }
  }
  return null;
}

// Tempo anzeigen: km/h, min/km, /500 m oder /100 m
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
export function fmtPace(sport, kmh) {
  if (!kmh) return '–';
  const p = ALT[sport]?.pace;
  if (p === 'kmh') return `${num(kmh, 1)} km/h`;
  if (p === '500') return `${mmss(1800 / kmh)} /500 m`;
  if (p === '100') return `${mmss(360 / kmh)} /100 m`;
  return `${mmss(3600 / kmh)} /km`;
}
export function fmtHms(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (!h) return `${m} min`;
  return `${h}:${String(m).padStart(2, '0')} h`;
}
// „2:00“, „2h“, „1:45:30“, „95“ (Minuten) → Sekunden
export function parseDuration(v) {
  const s = String(v || '').trim().replace(',', '.').replace(/\s*(h|std)\s*$/i, 'h');
  if (!s) return null;
  if (/h$/.test(s)) { const h = parseFloat(s); return h > 0 ? Math.round(h * 3600) : null; }
  const parts = s.split(':').map((x) => parseFloat(x));
  if (parts.some((x) => isNaN(x))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return parts[0] > 0 ? Math.round(parts[0] * 60) : null;
}
export const fmtDurInput = (sec) => (sec ? `${Math.floor(sec / 3600)}:${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}` : '');

// ---------- Zeit ----------
export const weeksBetween = (a, b) => Math.max(1, Math.round((startOfWeek(b) - startOfWeek(a)) / (7 * DAY)) + 1);
export const weekIndex = (goal, ts = Date.now()) => Math.max(0, Math.round((startOfWeek(ts) - startOfWeek(goal.start)) / (7 * DAY)));
export const totalWeeks = (goal) => weeksBetween(goal.start, goal.deadline);
export const fmtDeadline = (ts) => fmtDate(ts, { day: 'numeric', month: 'short', year: 'numeric' });
export const deadlineIn = (weeks) => addDays(startOfWeek(Date.now()), weeks * 7 - 1) + 20 * 3600e3;

// ---------- Pausen / krank ----------
// Tage seit dem letzten Training (oder seit dem Ende einer gemeldeten Pause)
export function breakInfo(now = Date.now()) {
  const { asc } = idx();
  const last = asc.filter((w) => w.start < now).slice(-1)[0];
  const lastTs = last ? last.start : null;
  const pause = (coachData().pauses || []).filter((p) => p.to > now - 21 * DAY).slice(-1)[0] || null;
  const gapDays = lastTs ? (now - lastTs) / DAY : 0;
  // gemeldete Pause zählt, wenn danach noch nicht wieder normal trainiert wurde (max. 2 Einheiten)
  const after = pause ? asc.filter((w) => w.start >= pause.to).length : 0;
  const pauseDays = pause && after <= 2 ? pause.days : 0;
  return { gapDays, lastTs, pauseDays, days: Math.max(pauseDays, gapDays >= 7 ? gapDays : 0), returning: Math.max(pauseDays, gapDays) >= 7, pause };
}
