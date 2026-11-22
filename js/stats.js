// Statistik-Engine: berechnet einen Index über alle Workouts (gecacht pro Datenversion)

import { state, exerciseMeta } from './store.js';
import { bwAt, bwLog, bwKey } from './body.js';
import { e1rm, startOfWeek, startOfMonth, addDays, addMonths, DAY, linreg, startOfDay } from './utils.js';

let cache = { key: null, data: null };

export const PR_LABELS = {
  e1rm: 'Geschätztes 1RM',
  weight: 'Höchstes Gewicht',
  volume: 'Bestes Satzvolumen',
  reps: 'Meiste Wiederholungen',
  sessionVolume: 'Höchstes Einheitsvolumen',
  distance: 'Längste Distanz',
};

function resolveType(name, obs) {
  const meta = exerciseMeta(name);
  if (state.exMeta[name]?.type) return meta.type;
  const inf = meta.inferredType;
  if (!obs) return inf;
  if (inf === 'cardio') return obs.dist || !obs.dur ? 'cardio' : 'duration';
  if (!obs.weight && !obs.reps && (obs.dist || obs.dur)) return obs.dist ? 'cardio' : 'duration';
  if (obs.weight) {
    if (inf === 'bodyweight') return /gewichtet|weighted|klimmzug|pull ?up|chin ?up|dip|liegestütz|push ?up/i.test(name) ? 'weighted_bw' : 'weight';
    return inf === 'duration' ? 'weight' : inf;
  }
  if (obs.reps && inf === 'weight') return 'bodyweight';
  return inf;
}

export function setLoad(type, s, bw) {
  const w = s.weight || 0;
  if (type === 'weight') return w;
  if (type === 'weighted_bw') return (bw || 0) + w;
  if (type === 'bodyweight') return bw || 0;
  return 0;
}

export function idx() {
  const st = state.settings;
  const key = `${state.version}|${st.countWarmups}|${st.bodyweight}|${bwKey()}`;
  if (cache.key === key) return cache.data;
  cache = { key, data: build() };
  return cache.data;
}

function build() {
  const log = bwLog();
  const countWarm = state.settings.countWarmups;
  const asc = [...state.workouts].sort((a, b) => a.start - b.start);

  // Vorlauf: beobachtete Datenfelder pro Übung
  const obs = new Map();
  for (const w of asc) for (const e of w.exercises) {
    let o = obs.get(e.name);
    if (!o) obs.set(e.name, (o = { weight: false, reps: false, dist: false, dur: false }));
    for (const s of e.sets) {
      if (s.weight) o.weight = true;
      if (s.reps) o.reps = true;
      if (s.distance) o.dist = true;
      if (s.duration) o.dur = true;
    }
  }

  const ex = new Map();
  const getEx = (name) => {
    let x = ex.get(name);
    if (!x) {
      const meta = exerciseMeta(name);
      x = {
        name, meta, type: resolveType(name, obs.get(name)), sessions: [],
        best: { e1rm: 0, weight: 0, volume: 0, reps: 0, sessionVolume: 0, distance: 0 },
        bestAt: {}, totalVolume: 0, totalSets: 0, totalReps: 0,
      };
      ex.set(name, x);
    }
    return x;
  };

  const wStats = new Map();
  const prs = [];
  let n = 0;
  for (const w of asc) {
    n++;
    const bw = bwAt(w.start, log);
    const ws = {
      n, volume: 0, sets: 0, reps: 0, warmups: 0, prs: [], muscles: {},
      duration: Math.max(0, (w.end - w.start) / 1000), distance: 0,
    };
    for (const e of w.exercises) {
      const x = getEx(e.name);
      const t = x.type;
      const ses = {
        wid: w.id, date: w.start, bw, sets: e.sets, volume: 0, workSets: 0, reps: 0, maxWeight: 0,
        bestE1rm: 0, bestSet: null, maxReps: 0, setVolMax: 0, distance: 0, duration: 0,
      };
      for (const s of e.sets) {
        const warm = s.type === 'warmup';
        const load = setLoad(t, s, bw);
        const vol = load * (s.reps || 0);
        if (!warm || countWarm) ses.volume += vol;
        ses.distance += s.distance || 0;
        ses.duration += s.duration || 0;
        if (warm) { ws.warmups++; continue; }
        ses.workSets++;
        ses.reps += s.reps || 0;
        if (t === 'weight' || t === 'weighted_bw') ses.maxWeight = Math.max(ses.maxWeight, s.weight || 0);
        const est = e1rm(load, s.reps);
        if (est > ses.bestE1rm) { ses.bestE1rm = est; ses.bestSet = s; }
        if (!ses.bestSet && (s.reps || s.duration)) ses.bestSet = s;
        ses.maxReps = Math.max(ses.maxReps, s.reps || 0);
        ses.setVolMax = Math.max(ses.setVolMax, vol);
      }
      if (!ses.sets.length) continue;
      x.sessions.push(ses);
      x.totalVolume += ses.volume;
      x.totalSets += ses.workSets;
      x.totalReps += ses.reps;
      ws.volume += ses.volume;
      ws.sets += ses.workSets;
      ws.reps += ses.reps;
      ws.distance += ses.distance;

      // Muskelgruppen: Primär 1 Satz, Sekundär 0,5 Sätze
      const m = x.meta;
      if (ses.workSets) {
        ws.muscles[m.primary] = (ws.muscles[m.primary] || 0) + ses.workSets;
        for (const sm of m.secondary || []) ws.muscles[sm] = (ws.muscles[sm] || 0) + ses.workSets * 0.5;
      }

      // Rekorde
      if (!ses.workSets) continue;
      const checks = [];
      if (t === 'weight' || t === 'weighted_bw') {
        checks.push(['e1rm', ses.bestE1rm], ['weight', ses.maxWeight], ['volume', ses.setVolMax], ['sessionVolume', ses.volume]);
      } else if (t === 'bodyweight') {
        checks.push(['reps', ses.maxReps]);
        if (bw) checks.push(['e1rm', ses.bestE1rm]);
      } else if (t === 'cardio') {
        checks.push(['distance', ses.distance]);
      }
      for (const [kind, val] of checks) {
        if (!val) continue;
        const prev = x.best[kind];
        if (val > prev + 1e-9) {
          if (prev > 0) {
            const pr = { wid: w.id, date: w.start, exercise: e.name, kind, value: val, prev };
            prs.push(pr);
            ws.prs.push(pr);
          }
          x.best[kind] = val;
          x.bestAt[kind] = w.start;
        }
      }
    }
    wStats.set(w.id, ws);
  }

  for (const x of ex.values()) {
    x.count = x.sessions.length;
    x.first = x.sessions[0]?.date;
    x.last = x.sessions[x.sessions.length - 1]?.date;
    x.bestRel = 0;
    for (const ses of x.sessions) {
      if (!ses.bw || !ses.bestE1rm) continue;
      const r = ses.bestE1rm / ses.bw;
      if (r > x.bestRel) { x.bestRel = r; x.bestRelAt = ses.date; }
    }
  }
  return { asc, ex, wStats, prs };
}

// ---------- Zeiträume ----------
export const RANGES = [
  ['1w', 'Woche'], ['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1J'], ['all', 'Alle'],
];
// off: Wochen-Versatz für die Wochenansicht (0 = diese Woche, −1 = letzte Woche …)
export function rangeBounds(key, off = 0) {
  const now = Date.now();
  if (key === '1w') {
    const from = startOfWeek(addDays(startOfWeek(now), off * 7 + 1));
    const end = startOfWeek(addDays(from, 8)) - 1;
    const to = Math.min(now, end);
    const prevFrom = startOfWeek(addDays(from, -6));
    return { from, to, end, prevFrom, prevTo: prevFrom + (to - from) };
  }
  const to = now;
  const { asc } = idx();
  const first = asc[0]?.start ?? to;
  const days = { '1m': 30, '3m': 91, '6m': 182, '1y': 365 }[key];
  const from = days ? startOfDay(to - days * DAY) : startOfDay(first);
  const len = to - from;
  return { from, to, prevFrom: from - len, prevTo: from };
}
export const inRange = (asc, from, to) => asc.filter((w) => w.start >= from && w.start <= to);

// Teilt den Zeitraum in Wochen/Monate auf
export function buckets(unit, from, to) {
  const out = [];
  let s = unit === 'day' ? startOfDay(from) : unit === 'week' ? startOfWeek(from) : startOfMonth(from);
  while (s <= to) {
    const e = unit === 'day' ? addDays(s, 1) : unit === 'week' ? addDays(s, 7) : addMonths(s, 1);
    out.push({ start: s, end: e, items: [] });
    s = e;
  }
  return out;
}
export function bucketize(workouts, unit, from, to) {
  const bs = buckets(unit, from, to);
  let i = 0;
  const sorted = [...workouts].sort((a, b) => a.start - b.start);
  for (const w of sorted) {
    while (i < bs.length && w.start >= bs[i].end) i++;
    if (i < bs.length && w.start >= bs[i].start) bs[i].items.push(w);
  }
  return bs;
}
export const autoUnit = (key) => (key === '1w' ? 'day' : key === '1y' || key === 'all' ? 'month' : 'week');

// ---------- Serien ----------
// Streak = aufeinanderfolgende Wochen, in denen das Wochenziel erreicht wurde.
// Die laufende Woche bricht die Serie nicht, solange sie noch nicht vorbei ist.
export function weekStreaks() {
  const { asc } = idx();
  const goal = Math.max(1, state.settings.weekGoal || 3);
  const counts = new Map();
  for (const w of asc) {
    const k = startOfWeek(w.start);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const ok = (k) => (counts.get(k) || 0) >= goal;
  const prevWeek = (k) => startOfWeek(addDays(k, -3));
  const nowWeek = startOfWeek(Date.now());
  const thisCount = counts.get(nowWeek) || 0;
  const thisDone = thisCount >= goal;
  let cur = thisDone ? 1 : 0;
  let w = prevWeek(nowWeek);
  while (ok(w)) { cur++; w = prevWeek(w); }

  let longest = 0, run = 0;
  if (asc.length) {
    for (let k = startOfWeek(asc[0].start); k <= nowWeek; k = startOfWeek(addDays(k, 10))) {
      run = ok(k) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  const goalWeeks = [...counts.keys()].filter(ok).length;
  const days = new Set(asc.map((x) => startOfDay(x.start)));
  const wd = (new Date().getDay() + 6) % 7;
  return {
    current: cur, longest, goal, goalWeeks, weeks: counts.size, days: days.size,
    thisCount, thisDone, needed: Math.max(0, goal - thisCount), daysLeft: 7 - wd,
  };
}

// ---------- Übungs-Trends ----------
// relativ zum Körpergewicht (nur Kraftwerte)
export const REL_METRICS = ['e1rm', 'weight'];
export function sessionMetric(x, ses, metric, relative = false) {
  if (relative && REL_METRICS.includes(metric)) {
    const v = sessionMetric(x, ses, metric);
    const load = metric === 'weight' && x.type === 'weighted_bw' ? v + (ses.bw || 0) : v;
    return ses.bw ? load / ses.bw : 0;
  }
  switch (metric) {
    case 'e1rm': return ses.bestE1rm;
    case 'weight': return ses.maxWeight;
    case 'volume': return ses.volume;
    case 'reps': return ses.maxReps;
    case 'totalReps': return ses.reps;
    case 'sets': return ses.workSets;
    case 'distance': return ses.distance;
    case 'duration': return ses.duration / 60;
    case 'pace': return ses.distance ? ses.duration / 60 / ses.distance : 0;
    default: return 0;
  }
}
export function primaryMetric(x) {
  if (x.type === 'weight' || x.type === 'weighted_bw') return 'e1rm';
  if (x.type === 'bodyweight') return 'reps';
  if (x.type === 'cardio') return 'distance';
  return 'duration';
}

export function trend(x, metric, from, to, relative = false) {
  const pts = x.sessions
    .filter((s) => s.date >= from && s.date <= to)
    .map((s) => ({ x: s.date / DAY, y: sessionMetric(x, s, metric, relative) }))
    .filter((p) => p.y > 0);
  if (pts.length < 3) return null;
  const lr = linreg(pts);
  if (!lr) return null;
  const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
  const y0 = lr.intercept + lr.slope * x0;
  const y1 = lr.intercept + lr.slope * x1;
  return {
    perMonth: lr.slope * 30.44, change: y1 - y0, pct: y0 > 0 ? ((y1 - y0) / y0) * 100 : null,
    n: pts.length, start: y0, end: y1,
  };
}

// Bestes Gewicht für mindestens N Wiederholungen
export function repMaxTable(x, maxReps = 12) {
  const rows = [];
  for (let r = 1; r <= maxReps; r++) rows.push({ reps: r, weight: 0, date: null, actualReps: 0 });
  for (const ses of x.sessions) for (const s of ses.sets) {
    if (s.type === 'warmup' || !s.reps) continue;
    const w = x.type === 'weighted_bw' ? (s.weight || 0) : s.weight;
    if (w == null) continue;
    for (let r = 1; r <= Math.min(s.reps, maxReps); r++) {
      if (w > rows[r - 1].weight || (w === rows[r - 1].weight && !rows[r - 1].date)) {
        rows[r - 1] = { reps: r, weight: w, date: ses.date, actualReps: s.reps, bw: ses.bw, e1rm: e1rm(setLoad(x.type, s, ses.bw), s.reps) };
      }
    }
  }
  return rows.filter((r) => r.date);
}

// Verteilung von Wiederholungsbereichen
export function repRanges(workouts) {
  const ranges = [['1–5', 1, 5], ['6–8', 6, 8], ['9–12', 9, 12], ['13–15', 13, 15], ['16+', 16, 1e9]];
  const counts = ranges.map(() => 0);
  for (const w of workouts) for (const e of w.exercises) for (const s of e.sets) {
    if (s.type === 'warmup' || !s.reps) continue;
    const i = ranges.findIndex(([, a, b]) => s.reps >= a && s.reps <= b);
    if (i >= 0) counts[i]++;
  }
  return ranges.map(([label], i) => ({ label, value: counts[i] }));
}

export function setTypeDist(workouts) {
  const c = { normal: 0, warmup: 0, failure: 0, dropset: 0 };
  for (const w of workouts) for (const e of w.exercises) for (const s of e.sets) c[s.type] = (c[s.type] || 0) + 1;
  return [
    { label: 'Normal', value: c.normal }, { label: 'Aufwärmen', value: c.warmup },
    { label: 'Bis Versagen', value: c.failure }, { label: 'Drop-Satz', value: c.dropset },
  ];
}

// Letzte Einheit einer Übung vor einem Zeitpunkt (für "Vorher"-Werte)
export function previousSession(name, before = Infinity, excludeId = null) {
  for (const w of state.workouts) {
    if (w.start >= before || w.id === excludeId) continue;
    const e = w.exercises.find((x) => x.name === name);
    if (e && e.sets.length) return { workout: w, exercise: e };
  }
  return null;
}
