// Gamification: Kämpfer-Stufen, Kampfkraft, Level/XP, Abzeichen, Wochen-Aufgaben

import { state } from './store.js';
import { idx, weekStreaks } from './stats.js';
import { startOfWeek, sum, DAY, num, fmtVolume } from './utils.js';

// Killstreak-Stufen (1 Woche mit erreichtem Wochenziel ≈ 2,5 Kills)
export const STAGES = [
  { min: 0, name: 'Respawn', ep: 0, text: 'Neue Runde – erreiche dein Wochenziel und starte die Streak.' },
  { min: 2, name: 'Blutrünstig', ep: 250, text: 'Die Streak läuft.' },
  { min: 4, name: 'Gnadenlos', ep: 500, text: 'Woche für Woche – keine Ausreden.' },
  { min: 6, name: 'Skrupellos', ep: 1000, text: 'Deine Aura wird sichtbar.' },
  { min: 8, name: 'Unnachgiebig', ep: 1500, text: 'Nichts bringt dich aus dem Rhythmus.' },
  { min: 10, name: 'Brutal', ep: 2000, text: 'Goldene Energie.' },
  { min: 12, name: 'Nuklear', ep: 5000, text: 'Taktische Atombombe gezündet.' },
  { min: 13, name: 'Unaufhaltsam', ep: 1000, text: 'Über Nuklear hinaus – jede weitere Woche zählt.' },
];

export function stageFor(streak) {
  let i = 0;
  STAGES.forEach((s, k) => { if (streak >= s.min) i = k; });
  const next = STAGES[i + 1];
  return {
    index: i, ...STAGES[i], next,
    toNext: next ? next.min - streak : 0,
    progress: next ? (streak - STAGES[i].min) / (next.min - STAGES[i].min) : 1,
  };
}

export function profileStats() {
  const { asc, wStats, prs } = idx();
  const st = weekStreaks();
  const totalVol = sum(asc, (w) => wStats.get(w.id).volume);
  const sets = sum(asc, (w) => wStats.get(w.id).sets);
  const stageEp = STAGES.filter((x) => x.min > 0 && st.longest >= x.min).reduce((a, x) => a + x.ep, 0);
  const xp = asc.length * 100 + sets * 4 + prs.length * 50 + st.goalWeeks * 250 + stageEp;
  const lvl = levelFor(xp);
  const power = Math.round(Math.sqrt(totalVol) * 10 + prs.length * 25 + st.current * 150 + st.longest * 50);
  return { st, totalVol, sets, xp, ...lvl, power, prs: prs.length, stage: stageFor(st.current) };
}

const T = (L) => Math.round(300 * L ** 1.7);
export function levelFor(xp) {
  let L = 1;
  while (T(L + 1) <= xp) L++;
  const a = T(L), b = T(L + 1);
  return { level: L, levelProgress: (xp - a) / (b - a), xpToNext: b - xp };
}

// ---------- Abzeichen ----------
function ctx() {
  const { asc, wStats, prs, ex } = idx();
  const st = weekStreaks();
  const c = {
    workouts: asc.length,
    volume: sum(asc, (w) => wStats.get(w.id).volume),
    prs: prs.length,
    longest: st.longest,
    early: 0, late: 0, long: 0, maxSets: 0, maxVol: 0, cardioKm: 0, mobility: 0, allroundWeeks: 0, fullYear: false,
  };
  const weekMuscles = new Map();
  const yearMonths = new Map();
  for (const w of asc) {
    const s = wStats.get(w.id);
    const h = new Date(w.start).getHours();
    if (h < 7) c.early++;
    if (h >= 21) c.late++;
    if (s.duration >= 7200) c.long++;
    c.maxSets = Math.max(c.maxSets, s.sets);
    c.maxVol = Math.max(c.maxVol, s.volume);
    if (/mobility/i.test(w.title) || w.exercises.some((e) => e.name === 'Mobility')) c.mobility++;
    const wk = startOfWeek(w.start);
    const set = weekMuscles.get(wk) || new Set();
    for (const m of Object.keys(s.muscles)) if (m !== 'Cardio' && m !== 'Ganzkörper') set.add(m);
    weekMuscles.set(wk, set);
    const y = new Date(w.start).getFullYear();
    const ms = yearMonths.get(y) || new Set();
    ms.add(new Date(w.start).getMonth());
    yearMonths.set(y, ms);
  }
  for (const x of ex.values()) if (x.type === 'cardio') c.cardioKm += sum(x.sessions, (s) => s.distance);
  c.allroundWeeks = [...weekMuscles.values()].filter((s) => s.size >= 10).length;
  c.fullYear = [...yearMonths.values()].some((s) => s.size === 12);
  return c;
}

const tiers = (id, icon, title, key, targets, fmt = (v) => num(v, 0), desc) =>
  targets.map((t, i) => ({ id: `${id}${t}`, icon, title: `${title} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][i]}`, desc: desc(fmt(t)), key, target: t, tier: i }));

export const ACHIEVEMENTS = [
  ...tiers('w', 'dumbbell', 'Eisern', 'workouts', [1, 10, 50, 100, 250, 500, 1000], undefined, (t) => `${t} Workouts absolviert`),
  ...tiers('v', 'weight', 'Tonnage', 'volume', [100000, 500000, 1000000, 2500000, 5000000], (v) => fmtVolume(v), (t) => `${t} Gesamtvolumen bewegt`),
  ...tiers('p', 'trophy', 'Rekordjäger', 'prs', [10, 50, 100, 250, 500], undefined, (t) => `${t} persönliche Rekorde`),
  ...STAGES.filter((x) => x.min > 0).map((x) => ({ id: `ks${x.min}`, icon: 'flame', title: x.name, desc: `${x.min} Wochen Streak · +${num(x.ep, 0)} EP`, key: 'longest', target: x.min, tier: 0 })),
  { id: 'early', icon: 'sun', title: 'Frühaufsteher', desc: 'Workout vor 7 Uhr gestartet', key: 'early', target: 1 },
  { id: 'late', icon: 'moon', title: 'Nachteule', desc: 'Workout nach 21 Uhr gestartet', key: 'late', target: 1 },
  { id: 'long', icon: 'clock', title: 'Marathon-Session', desc: 'Ein Workout über 2 Stunden', key: 'long', target: 1 },
  { id: 'sets30', icon: 'layers', title: 'Satz-Maschine', desc: '30 Arbeitssätze in einem Workout', key: 'maxSets', target: 30 },
  { id: 'vol20', icon: 'weight', title: 'Schwertransport', desc: '20 t Volumen in einem Workout', key: 'maxVol', target: 20000 },
  { id: 'cardio100', icon: 'bolt', title: 'Ausdauer-Ass', desc: '100 km Cardio insgesamt', key: 'cardioKm', target: 100 },
  { id: 'allround', icon: 'target', title: 'Allrounder', desc: '10 Muskelgruppen in einer Woche trainiert', key: 'allroundWeeks', target: 1 },
  { id: 'mob10', icon: 'repeat', title: 'Geschmeidig', desc: '10 Mobility-Einheiten', key: 'mobility', target: 10 },
  { id: 'year', icon: 'calendar', title: 'Ganzjährig', desc: 'In jedem Monat eines Jahres trainiert', key: 'fullYear', target: 1 },
];

export function achievements() {
  const c = ctx();
  return ACHIEVEMENTS.map((a) => {
    const v = typeof c[a.key] === 'boolean' ? +c[a.key] : c[a.key];
    return { ...a, value: v, done: v >= a.target, progress: Math.min(1, v / a.target) };
  });
}
