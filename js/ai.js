// AI-Mode: lokaler, regelbasierter Trainingsalgorithmus (keine Cloud, kein Sprachmodell)
// - Progressive Überladung (doppelte Progression) pro Übung
// - Stagnations-/Rückgangs-Erkennung mit Empfehlungen
// - Erholungsmodell pro Muskelgruppe + Empfehlung fürs nächste Training

import { state, exerciseMeta } from './store.js';
import { idx, weekStreaks } from './stats.js';
import { e1rm, linreg, DAY, num, fmtDate, startOfDay, sum } from './utils.js';

export const aiOn = () => !!state.settings.aiWorkout;

const workSets = (ses) => ses.sets.filter((s) => s.type !== 'warmup' && (s.reps || s.duration || s.distance));
const roundTo = (w, inc) => Math.round(w / inc) * inc;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// Typischer Wiederholungsbereich aus dem Verlauf (überschreibbar pro Übung)
export function repRange(x) {
  const meta = exerciseMeta(x.name);
  if (Array.isArray(meta.repRange)) return meta.repRange;
  // jüngste 5 Einheiten – passt sich an, wenn du den Bereich wechselst
  const reps = x.sessions.slice(-5).flatMap((s) => workSets(s).map((q) => q.reps).filter(Boolean)).sort((a, b) => a - b);
  if (reps.length < 4) return [8, 12];
  const q = (p) => reps[Math.floor((reps.length - 1) * p)];
  const lo = Math.max(3, q(0.2));
  const hi = Math.min(20, Math.max(q(0.85), lo + 2));
  return [lo, hi];
}

// Gewichtsschritt aus den bisher genutzten Gewichten lernen
export function increment(x) {
  const meta = exerciseMeta(x.name);
  if (meta.increment) return meta.increment;
  // nur Arbeitssätze; kleinster Schritt, der mindestens zweimal vorkommt
  const ws = [...new Set(x.sessions.flatMap((s) => s.sets.filter((q) => q.type !== 'warmup').map((q) => q.weight).filter((w) => w > 0)))].sort((a, b) => a - b);
  const diffs = {};
  for (let i = 1; i < ws.length; i++) {
    const d = Math.round((ws[i] - ws[i - 1]) * 4) / 4;
    if (d >= 0.5 && d <= 10) diffs[d] = (diffs[d] || 0) + 1;
  }
  const frequent = Object.entries(diffs).filter(([, c]) => c >= 2).map(([d]) => +d).sort((a, b) => a - b);
  let inc = frequent[0] ?? (Object.keys(diffs).length ? Math.min(...Object.keys(diffs).map(Number)) : null);
  const def = /langhantel|smith/i.test(x.name) ? 2.5 : /kurzhantel/i.test(x.name) ? 2 : 5;
  if (!inc) inc = def;
  if (/langhantel|smith/i.test(x.name)) inc = Math.min(inc, 5);
  return Math.min(Math.max(inc, 1), 10);
}

// Vorschlag für die nächste Einheit einer Übung
export function suggest(name) {
  const x = idx().ex.get(name);
  if (!x || !x.sessions.length) return null;
  const type = x.type;
  const bw = state.settings.bodyweight || 0;
  const recent = x.sessions.slice(-4);
  const last = recent[recent.length - 1];
  const ws = workSets(last);
  if (!ws.length) return null;
  const daysSince = (Date.now() - last.date) / DAY;

  if (type === 'cardio' || type === 'duration') {
    const d = last.distance, t = last.duration;
    return {
      kind: 'cardio', reason: '+5 % Umfang gegenüber der letzten Einheit',
      sets: [{ type: 'normal', distance: d ? Math.round(d * 1.05 * 10) / 10 : null, duration: t ? Math.round((t * 1.05) / 60) * 60 : null }],
      label: [d ? `${num(d * 1.05, 1)} km` : '', t ? `${Math.round((t * 1.05) / 60)} min` : ''].filter(Boolean).join(' · '),
    };
  }

  const [lo, hi] = repRange(x);
  if (type === 'bodyweight') {
    const sets = ws.map((s) => ({ type: 'normal', reps: (s.reps || 0) + 1 }));
    return { kind: 'reps', reason: '+1 Wiederholung pro Satz (progressive Überladung)', sets, range: [lo, hi], label: `${sets.map((s) => s.reps).join('/')} Wdh.` };
  }

  const inc = increment(x);
  const top = Math.max(...ws.map((s) => s.weight || 0));
  const atTop = ws.filter((s) => (s.weight || 0) === top);
  const allHit = atTop.length > 0 && atTop.every((s) => (s.reps || 0) >= hi);
  const e = recent.map((s) => s.bestE1rm).filter(Boolean);
  const declining = e.length >= 3 && e[e.length - 1] < e[e.length - 2] * 0.97 && e[e.length - 2] < e[e.length - 3] * 0.99;
  const load = (w) => (type === 'weighted_bw' ? bw + w : w);

  let weight, reps, kind, reason;
  if (daysSince > 21) {
    kind = 'return';
    if (top > 0) {
      weight = roundTo(top * 0.9, inc); reps = Math.round((lo + hi) / 2);
      reason = `${Math.round(daysSince)} Tage Pause → Wiedereinstieg mit ca. 90 %`;
    } else {
      weight = 0; reps = Math.max(lo, Math.min(...atTop.map((s) => s.reps || 0)) - 1);
      reason = `${Math.round(daysSince)} Tage Pause → locker wieder einsteigen`;
    }
  } else if (declining) {
    weight = roundTo(top * 0.9, inc); reps = hi; kind = 'deload';
    reason = 'Leistung zuletzt gesunken → leichter Deload (−10 %)';
  } else if (allHit) {
    weight = top + inc; reps = lo; kind = 'increase';
    reason = `Alle Sätze mit ${hi}+ Wdh. geschafft → +${num(inc)} kg`;
  } else {
    weight = top; kind = 'reps';
    reps = Math.min(hi, Math.min(...atTop.map((s) => s.reps || 0)) + 1);
    reason = `Gewicht halten, Ziel ${reps} Wdh. (Bereich ${lo}–${hi})`;
  }
  // Plausibilität: nicht mehr als ~6 % über dem jüngsten Bestwert
  const bestRecent = Math.max(...x.sessions.slice(-6).map((s) => s.bestE1rm), 0);
  while (bestRecent && reps > lo && e1rm(load(weight), reps) > bestRecent * 1.06) reps--;

  const n = Math.min(Math.max(ws.length, 1), 6);
  const sets = [];
  const warmCount = last.sets.filter((s) => s.type === 'warmup').length;
  if (type === 'weight' && weight >= 30 && warmCount > 0) {
    const steps = [[0.5, 10], [0.7, 5], [0.85, 3]].slice(-Math.min(3, Math.max(2, warmCount)));
    for (const [p, r] of steps) sets.push({ type: 'warmup', weight: roundTo(weight * p, inc), reps: r });
  }
  for (let i = 0; i < n; i++) {
    let r = reps;
    if (kind === 'reps' && atTop[i]) r = Math.min(hi, (atTop[i].reps || 0) + 1);
    sets.push({ type: 'normal', weight, reps: r });
  }
  const wl = type === 'weighted_bw' ? (weight ? `+${num(weight)} kg` : 'Eigengew.') : `${num(weight)} kg`;
  return { kind, reason, sets, weight, reps, range: [lo, hi], inc, label: `${wl} × ${reps}`, est: e1rm(load(weight), reps) };
}

// ---------- Stagnation ----------
export function stagnation() {
  const { ex } = idx();
  const now = Date.now();
  const out = [];
  for (const x of ex.values()) {
    if (x.type !== 'weight' && x.type !== 'weighted_bw') continue;
    const ses = x.sessions.filter((s) => s.bestE1rm > 0);
    if (ses.length < 6) continue;
    const last = ses[ses.length - 1];
    if (now - last.date > 60 * DAY) continue;
    const recent = ses.slice(-8);
    const lr = linreg(recent.map((s) => ({ x: s.date / DAY, y: s.bestE1rm })));
    const m = mean(recent.map((s) => s.bestE1rm));
    const pctMonth = lr && m ? ((lr.slope * 30.44) / m) * 100 : 0;
    const weeksSincePR = (now - (x.bestAt.e1rm || last.date)) / (7 * DAY);
    const status = pctMonth > 1 ? 'progress' : pctMonth < -2 ? 'decline' : 'plateau';
    const [lo, hi] = repRange(x);
    const freq = ses.filter((s) => s.date >= now - 56 * DAY).length / 8;
    const avgSets = mean(x.sessions.slice(-4).map((s) => s.workSets));
    const tips = [];
    if (status === 'decline') tips.push('Deload-Woche: −10 % Gewicht, ca. 60 % der Sätze');
    if (hi <= 6) tips.push('4–6 Wochen auf 8–12 Wdh. wechseln');
    else if (lo >= 10) tips.push('Schwerer trainieren: 5–8 Wdh.');
    else tips.push('Wiederholungsbereich variieren (z. B. 5×5, danach 3×10–12)');
    if (freq < 0.9) tips.push(`Häufiger: aktuell ${num(freq, 1)}× pro Woche → 1,5–2×`);
    if (avgSets < 3) tips.push('Mehr Arbeitssätze (3–4 pro Einheit)');
    else if (avgSets > 6) tips.push('Weniger, dafür intensivere Sätze');
    tips.push('Eine Variante probieren (andere Hantel, Griff oder Winkel)');
    out.push({ x, status, pctMonth, weeksSincePR, current: last.bestE1rm, best: x.best.e1rm, tips, series: recent, freq });
  }
  const order = { decline: 0, plateau: 1, progress: 2 };
  return out.sort((a, b) => order[a.status] - order[b.status] || b.weeksSincePR - a.weeksSincePR);
}

// ---------- Erholung ----------
const TAU = 30; // Stunden – Abklingkonstante der Ermüdung
const FULL = 10; // ermüdende Sätze = 0 % Bereitschaft
const MAIN = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Unterarme', 'Bauch', 'Quadrizeps', 'Beinbeuger', 'Gesäß', 'Waden', 'Adduktoren', 'Abduktoren', 'Unterer Rücken', 'Nacken'];

export function muscleFatigue(at = Date.now()) {
  const { asc, wStats } = idx();
  const f = {};
  for (let i = asc.length - 1; i >= 0; i--) {
    const w = asc[i];
    const h = (at - w.end) / 3.6e6;
    if (h > 24 * 7) break;
    if (h < 0) continue;
    for (const [m, v] of Object.entries(wStats.get(w.id).muscles)) f[m] = (f[m] || 0) + v * Math.exp(-h / TAU);
  }
  return f;
}
export const readiness = (fat) => Math.max(0, Math.min(1, 1 - (fat || 0) / FULL));
export const hoursUntilReady = (fat, thr = 0.8) => {
  const target = FULL * (1 - thr);
  return !fat || fat <= target ? 0 : TAU * Math.log(fat / target);
};
export function readinessMap() {
  const f = muscleFatigue();
  return Object.fromEntries(MAIN.map((m) => [m, { readiness: readiness(f[m]), hours: hoursUntilReady(f[m]), fatigue: f[m] || 0 }]));
}

function candidates() {
  if (state.routines.length) return state.routines.map((r) => ({ name: r.name, id: r.id, exercises: r.exercises }));
  const since = Date.now() - 120 * DAY;
  const seen = new Map();
  for (const w of state.workouts) if (w.start >= since && !seen.has(w.title)) seen.set(w.title, { name: w.title, exercises: w.exercises });
  return [...seen.values()];
}

export function nextWorkout() {
  const { asc } = idx();
  if (!asc.length) return null;
  const rm = readinessMap();
  const now = Date.now();
  const list = candidates().map((c) => {
    const weights = {};
    for (const e of c.exercises) {
      const meta = exerciseMeta(e.name);
      const n = Math.max(1, e.sets?.filter((s) => s.type !== 'warmup').length || 3);
      if (rm[meta.primary]) weights[meta.primary] = (weights[meta.primary] || 0) + n;
      for (const s of meta.secondary || []) if (rm[s]) weights[s] = (weights[s] || 0) + n * 0.5;
    }
    const tot = sum(Object.values(weights)) || 1;
    const ready = sum(Object.entries(weights), ([m, w]) => rm[m].readiness * w) / tot;
    const hours = Math.max(0, ...Object.entries(weights).filter(([, w]) => w / tot >= 0.15).map(([m]) => rm[m].hours));
    const occ = state.workouts.filter((w) => w.title === c.name || (c.id && w.routineId === c.id)).map((w) => w.start);
    const lastDone = occ[0] || null;
    const daysSince = lastDone ? (now - lastDone) / DAY : 30;
    const gaps = [];
    for (let i = 0; i < Math.min(occ.length - 1, 5); i++) gaps.push((occ[i] - occ[i + 1]) / DAY);
    const avgGap = gaps.length ? mean(gaps) : 7;
    const due = Math.min(daysSince / Math.max(avgGap, 3), 1.5) / 1.5;
    const score = ready * 0.65 + due * 0.35;
    const focus = Object.entries(weights).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m);
    return { ...c, ready, hours, lastDone, daysSince, avgGap, score, focus };
  }).filter((c) => c.exercises.length).sort((a, b) => b.score - a.score);

  // Aufeinanderfolgende Trainingstage
  const days = new Set(asc.map((w) => startOfDay(w.start)));
  let streakDays = 0;
  let d = startOfDay(now);
  if (!days.has(d)) d = startOfDay(d - DAY / 2);
  while (days.has(d)) { streakDays++; d = startOfDay(d - DAY / 2); }
  const trainedToday = days.has(startOfDay(now));

  const st = weekStreaks();
  const best = list[0];
  let when, whenText;
  if (!best) return null;
  if (trainedToday) {
    when = Math.max(now + best.hours * 3.6e6, startOfDay(now + DAY) + 9 * 3.6e6);
    whenText = `Heute schon trainiert. Nächstes Training: ${relDay(when)}`;
  } else if (streakDays >= 3 && st.needed < st.daysLeft) {
    when = startOfDay(now + DAY) + 9 * 3.6e6;
    whenText = `${streakDays} Tage am Stück trainiert – heute Ruhetag, morgen weiter.`;
  } else if (best.ready >= 0.8 || best.hours < 2) {
    when = now;
    whenText = 'Heute ist ein guter Trainingstag.';
  } else {
    when = now + best.hours * 3.6e6;
    whenText = `Optimal erholt ${relDay(when)}.`;
  }
  let goalText = '';
  if (st.needed > 0) {
    goalText = st.needed > st.daysLeft
      ? `Wochenziel diese Woche nicht mehr erreichbar (${st.thisCount}/${st.goal}).`
      : st.needed === st.daysLeft ? `Für dein Wochenziel musst du ab heute täglich trainieren (${st.needed} fehlen).`
        : `Noch ${st.needed} Workout${st.needed > 1 ? 's' : ''} in ${st.daysLeft} Tagen für dein Wochenziel.`;
  } else goalText = 'Wochenziel erreicht – alles Weitere ist Bonus.';
  return { best, list, when, whenText, goalText, readiness: rm, streakDays };
}

function relDay(ts) {
  const d = Math.round((startOfDay(ts) - startOfDay(Date.now())) / DAY);
  const h = new Date(ts).getHours();
  const tod = h < 11 ? 'morgens' : h < 17 ? 'mittags' : 'abends';
  if (d <= 0) return `heute ${tod}`;
  if (d === 1) return `morgen ${tod}`;
  return `${fmtDate(ts, { weekday: 'long' })} ${tod}`;
}
