// Ernährung: Richtwerte für kcal und Makros (Mifflin-St-Jeor + Alltag + Training + Ziel)

import { idx } from '../stats.js';
import { cardioKind, cardioWork } from '../compete.js';
import { exerciseMeta } from '../store.js';
import { startOfDay, DAY } from '../utils.js';
import { body, goalW, goalC } from './core.js';

// Trainingsverbrauch eines erledigten Workouts (kcal)
function workoutKcal(w, kg) {
  let kcal = 0, gymSec = (w.end - w.start) / 1000;
  for (const e of w.exercises) {
    const t = idx().ex.get(e.name)?.type || exerciseMeta(e.name).type;
    const k = cardioKind(e.name, t);
    if (!k) continue;
    const km = e.sets.reduce((a, s) => a + (s.distance || 0), 0);
    const sec = e.sets.reduce((a, s) => a + (s.duration || 0), 0);
    kcal += cardioWork(k, km, sec, kg);
    gymSec -= sec;
  }
  if (gymSec > 300 && (idx().wStats.get(w.id)?.sets || 0) > 0) kcal += 5 * kg * (gymSec / 3600) * 0.85; // Krafttraining ≈ 5 MET (inkl. Pausen)
  return kcal;
}
// geplante Einheit (noch nicht gemacht)
function sessionKcal(s, kg) {
  if (s.kind === 'cardio') {
    const kind = { run: 'run', bike: 'bike', skate: 'skate', row: 'row', swim: 'swim', walk: 'walk', elliptical: 'elliptical' }[s.sport];
    return cardioWork(kind, s.km, s.sec, kg);
  }
  return 5 * kg * 1.0 * 0.85; // ca. 60 min Krafttraining
}

export function nutrition(plan, day = Date.now()) {
  const b = body();
  if (!b.sex || !b.age || !b.height || !b.weight) return null;
  const kg = b.weight;
  const bmr = 10 * kg + 6.25 * b.height - 5 * b.age + (b.sex === 'f' ? -161 : 5);
  const base = bmr * b.activity;
  const d0 = startOfDay(day), d1 = d0 + DAY;
  const done = idx().asc.filter((w) => w.start >= d0 && w.start < d1);
  const items = done.map((w) => ({ label: w.title, kcal: workoutKcal(w, kg), done: true }));
  const wd = (new Date(day).getDay() + 6) % 7;
  for (const s of plan?.days?.[wd] || []) if (!s.extra && s.status === 'open') items.push({ label: s.kind === 'gym' ? s.title : `${s.title} (${s.km} km)`, kcal: sessionKcal(s, kg), done: false });
  const train = items.reduce((a, i) => a + i.kcal, 0);
  const gw = goalW(), gc = goalC();
  // Ziel-Anpassung
  let adj = 0, goalText = 'Bedarf decken', protein = 1.6;
  if (gw?.type === 'bw' && gw.target && gw.target < kg - 0.3) {
    const weeks = Math.max(1, (gw.deadline - Date.now()) / (7 * DAY));
    const perDay = (((kg - gw.target) / weeks) * 7700) / 7;
    adj = -Math.min(700, Math.max(300, perDay));
    goalText = `Abnehmen: ${Math.round(-adj)} kcal unter Bedarf`;
    protein = 2.0;
  } else if (gw && (gw.type === 'muscle' || (gw.type === 'bw' && gw.target > kg + 0.3))) {
    adj = gw.level === 'beginner' ? 350 : 250;
    goalText = `Muskelaufbau: +${adj} kcal Überschuss`;
    protein = 1.8;
  } else if (gw) {
    adj = 100;
    goalText = 'Kraft: Bedarf decken, leicht darüber';
    protein = 1.8;
  } else if (gc) {
    protein = 1.5;
    goalText = 'Ausdauer: Bedarf decken';
  }
  const kcal = Math.round((base + train + adj) / 10) * 10;
  const p = Math.round(protein * kg);
  const f = Math.round(Math.max(0.8 * kg, (kcal * 0.22) / 9));
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  const water = Math.round((kg * 0.035 + (train / 600) * 0.5) * 10) / 10;
  return { kcal, protein: p, fat: f, carbs: c, water, bmr: Math.round(bmr), base: Math.round(base), train: Math.round(train), adj: Math.round(adj), items, goalText, trainingDay: items.length > 0, proteinPerKg: protein };
}
