// Ein Punktesystem für alles: Level, Arena und Streak rechnen mit denselben Regeln und denselben Workouts.
// Rein (ohne Browser-Abhängigkeiten) – genutzt von der App, vom Server (groupcalc) und vom Demo-Modus.
//
// Es zählt nur, was in der App getrackt oder nachgetragen wurde. Importe (CSV/Backup-Altdaten) und Strava-Aktivitäten
// von vor der Verbindung sind „Historie“ (h): sie erscheinen in der privaten Statistik, bringen aber keine XP.

import { prMap, streakInfo, startOfWeek, DAY } from './compete.js';

// Standardwerte – der Admin kann sie später im Dashboard ändern (config 'points')
export const XP_DEFAULT = { workout: 100, perDay: 2, minute: 2, maxMin: 120, pr: 50, goalWeek: 250, win: 500 };
export const xpParams = (over) => ({ ...XP_DEFAULT, ...(over && typeof over === 'object' ? over : {}) });

export const xpRules = (P = XP_DEFAULT) => `${P.workout} EP pro Workout (max. ${P.perDay} pro Tag) · ${P.minute} EP pro Trainingsminute (max. ${P.maxMin} Min. pro Workout) · ${P.pr} EP pro Rekord · ${P.goalWeek} EP pro erreichtem Wochenziel · ${P.win} EP pro Challenge-Sieg. Es zählt nur, was in der App getrackt oder nachgetragen wurde – keine Importe und keine Strava-Aktivitäten von vor der Verbindung.`;

// Zusammenfassung zählt? (h = Historie: Import oder Strava vor der Verbindung)
export const counts = (s) => !!s && !s.h;
// Mindestens etwas gemacht (ein Satz, Cardio-/Mobility-Zeit) – leere Workouts bringen nichts
export const active = (s) => (s.sets || 0) > 0 || !!s.mob || (s.cmin || 0) > 0 || (s.ex || []).some((x) => (x.sec || 0) > 0 || (x.s || 0) > 0);
export const eligible = (sums) => sums.filter((s) => counts(s) && active(s)).sort((a, b) => a.start - b.start);
export const trainMinutes = (s, P = XP_DEFAULT) => Math.max(0, Math.min(P.maxMin, Math.round((s.dur || 0) / 60)));

// XP eines einzelnen Workouts (ohne Tages-Grenze; für die Anzeige)
export function workoutXp(s, prCount = 0, P = XP_DEFAULT) {
  if (!counts(s) || !active(s)) return { total: 0, parts: [], counts: false };
  const parts = [['Workout', P.workout], ['Trainingszeit', trainMinutes(s, P) * P.minute], ['Rekorde', prCount * P.pr]].filter(([, v]) => v > 0);
  return { total: parts.reduce((a, [, v]) => a + v, 0), parts, counts: true };
}

const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const weekMonth = (wk) => { const d = new Date(wk + 3 * DAY); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

// Punkte in einem Zeitraum. sums: Zusammenfassungen (alle; gefiltert wird hier), prs: Map id → Rekorde (optional)
export function xpScore({ sums, goal = 3, results = [], prs = null, P = XP_DEFAULT, now = Date.now() }, from = 0, to = Infinity) {
  const el = eligible(sums);
  const pr = prs || prMap(el);
  const b = { workouts: 0, minutes: 0, prs: 0, goalWeeks: 0, wins: 0 };
  const perDay = new Map();
  for (const s of el) {
    if (s.start < from || s.start >= to) continue;
    const k = dayKey(s.start);
    const c = perDay.get(k) || 0;
    perDay.set(k, c + 1);
    if (c < P.perDay) b.workouts++;
    b.minutes += trainMinutes(s, P);
    b.prs += pr.get(s.id) || 0;
  }
  const st = streakInfo(el, goal, Math.min(now, to - 1));
  const nowW = startOfWeek(now);
  for (const wk of st.goalWeeks) { const m = weekMonth(wk); if (wk <= nowW && (from === 0 || (m >= from && m < to))) b.goalWeeks++; }
  for (const r of results) if (r.won && r.end >= from && r.end < to) b.wins++;
  const points = b.workouts * P.workout + b.minutes * P.minute + b.prs * P.pr + b.goalWeeks * P.goalWeek + b.wins * P.win;
  return { points, ...b };
}

// Streak (Wochen mit erreichtem Wochenziel) aus den zählenden Workouts
export const xpStreak = (sums, goal = 3, now = Date.now()) => streakInfo(eligible(sums), goal, now);
export const xpRecords = (sums) => prMap(eligible(sums));
