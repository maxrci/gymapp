// Gamification: Kämpfer-Stufen, Kampfkraft, Level/XP, Abzeichen, Wochen-Aufgaben

import { state } from './store.js';
import { idx, weekStreaks } from './stats.js';
import { startOfWeek, sum, DAY, num, fmtVolume } from './utils.js';

export const STAGES = [
  { min: 0, name: 'Erschöpft', text: 'Zeit aufzustehen – erreiche dein Wochenziel!' },
  { min: 2, name: 'Rekrut', text: 'Der Anfang ist gemacht.' },
  { min: 4, name: 'Kämpfer', text: 'Deine Disziplin zahlt sich aus.' },
  { min: 8, name: 'Elite-Kämpfer', text: 'Deine Aura wird sichtbar.' },
  { min: 16, name: 'Goldener Krieger', text: 'Unaufhaltsam – goldene Energie!' },
  { min: 30, name: 'Legende', text: 'Legendärer Status. Blitze umgeben dich.' },
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
  const xp = asc.length * 100 + sets * 4 + prs.length * 50 + st.goalWeeks * 250;
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
  ...tiers('w', '🏋️', 'Eisern', 'workouts', [1, 10, 50, 100, 250, 500, 1000], undefined, (t) => `${t} Workouts absolviert`),
  ...tiers('v', '🪨', 'Tonnage', 'volume', [100000, 500000, 1000000, 2500000, 5000000], (v) => fmtVolume(v), (t) => `${t} Gesamtvolumen bewegt`),
  ...tiers('p', '🏆', 'Rekordjäger', 'prs', [10, 50, 100, 250, 500], undefined, (t) => `${t} persönliche Rekorde`),
  ...tiers('s', '🔥', 'Unaufhaltsam', 'longest', [2, 4, 8, 16, 30, 52], undefined, (t) => `${t} Wochen in Folge das Wochenziel erreicht`),
  { id: 'early', icon: '🌅', title: 'Frühaufsteher', desc: 'Workout vor 7 Uhr gestartet', key: 'early', target: 1 },
  { id: 'late', icon: '🦉', title: 'Nachteule', desc: 'Workout nach 21 Uhr gestartet', key: 'late', target: 1 },
  { id: 'long', icon: '⏳', title: 'Marathon-Session', desc: 'Ein Workout über 2 Stunden', key: 'long', target: 1 },
  { id: 'sets30', icon: '⚙️', title: 'Satz-Maschine', desc: '30 Arbeitssätze in einem Workout', key: 'maxSets', target: 30 },
  { id: 'vol20', icon: '🚛', title: 'Schwertransport', desc: '20 t Volumen in einem Workout', key: 'maxVol', target: 20000 },
  { id: 'cardio100', icon: '🚴', title: 'Ausdauer-Ass', desc: '100 km Cardio insgesamt', key: 'cardioKm', target: 100 },
  { id: 'allround', icon: '🧩', title: 'Allrounder', desc: '10 Muskelgruppen in einer Woche trainiert', key: 'allroundWeeks', target: 1 },
  { id: 'mob10', icon: '🧘', title: 'Geschmeidig', desc: '10 Mobility-Einheiten', key: 'mobility', target: 10 },
  { id: 'year', icon: '📅', title: 'Ganzjährig', desc: 'In jedem Monat eines Jahres trainiert', key: 'fullYear', target: 1 },
];

export function achievements() {
  const c = ctx();
  return ACHIEVEMENTS.map((a) => {
    const v = typeof c[a.key] === 'boolean' ? +c[a.key] : c[a.key];
    return { ...a, value: v, done: v >= a.target, progress: Math.min(1, v / a.target) };
  });
}

// ---------- Wochen-Aufgaben ----------
const MAIN = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Bauch', 'Quadrizeps', 'Beinbeuger', 'Gesäß', 'Waden'];

export function weeklyQuests() {
  const { asc, wStats } = idx();
  const st = weekStreaks();
  const wk = startOfWeek(Date.now());
  const thisWeek = asc.filter((w) => w.start >= wk);
  const prsWeek = sum(thisWeek, (w) => wStats.get(w.id).prs.length);
  const volWeek = sum(thisWeek, (w) => wStats.get(w.id).volume);
  // Vernachlässigte Muskelgruppe der letzten 14 Tage
  const since = Date.now() - 14 * DAY;
  const m14 = Object.fromEntries(MAIN.map((m) => [m, 0]));
  for (const w of asc) if (w.start >= since) for (const [m, v] of Object.entries(wStats.get(w.id).muscles)) if (m in m14) m14[m] += v;
  const weak = MAIN.reduce((a, m) => (m14[m] < m14[a] ? m : a), MAIN[0]);
  const weakWeek = sum(thisWeek, (w) => wStats.get(w.id).muscles[weak] || 0);
  // Volumenziel: Ø der letzten 8 Wochen + 5 %
  const last8 = asc.filter((w) => w.start >= wk - 56 * DAY && w.start < wk);
  const avg = sum(last8, (w) => wStats.get(w.id).volume) / 8;
  const volTarget = Math.max(5000, Math.round((avg * 1.05) / 1000) * 1000);
  const extra = thisWeek.filter((w) => w.exercises.some((e) => e.name === 'Mobility') || /cardio|mobility/i.test(w.title)).length;
  return [
    { icon: '🎯', title: `Wochenziel: ${st.goal} Workouts`, value: st.thisCount, target: st.goal, xp: 250 },
    { icon: '🏆', title: 'Stelle einen neuen Rekord auf', value: Math.min(prsWeek, 1), target: 1, xp: 50 },
    { icon: '🧩', title: `${weak} stärken: 6 Sätze`, value: Math.min(6, Math.round(weakWeek)), target: 6, xp: 80, hint: 'Am wenigsten trainiert in den letzten 14 Tagen' },
    { icon: '🪨', title: `${fmtVolume(volTarget)} Volumen bewegen`, value: Math.round(volWeek), target: volTarget, xp: 100, fmt: fmtVolume },
    { icon: '🧘', title: '1× Cardio oder Mobility (geführt)', value: Math.min(extra, 1), target: 1, xp: 60 },
  ];
}
