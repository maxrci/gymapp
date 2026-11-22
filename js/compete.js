// Wettbewerbs-Logik für Gruppen (Liga, Ewige Tabelle, Challenges, Streak).
// Reines Modul ohne Abhängigkeiten – wird von App UND Server genutzt.
//
// Eingabe sind Workout-Zusammenfassungen (siehe sync.js → summarize):
// { id, start, end, title, vol, sets, reps, dur, km, cmin, mob, ex: [{ n, t, v, s, r, mr, e, w, d, sec }] }

export const DAY = 86400000;
export const STAGE_MINS = [0, 2, 4, 6, 8, 10, 12, 13];
export const STAGE_NAMES = ['Respawn', 'Blutrünstig', 'Gnadenlos', 'Skrupellos', 'Unnachgiebig', 'Brutal', 'Nuklear', 'Unaufhaltsam'];
export const stageIndex = (weeks) => STAGE_MINS.reduce((a, m, i) => (weeks >= m ? i : a), 0);

export const VISIBILITY = [
  ['stats', 'Nur Zahlen', 'Andere sehen Arena-Punkte, Bestwerte, Streak und Challenges – keine Workouts.'],
  ['summary', 'Übersicht', 'Zusätzlich deine Workouts mit Titel, Datum, Dauer, Volumen, Übungen und Rekorden.'],
  ['full', 'Komplett', 'Andere sehen deine Workouts vollständig mit allen Sätzen, Gewichten und Wiederholungen.'],
];

export function startOfWeek(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
export function startOfMonth(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
export const addMonths = (ts, n) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime(); };
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

// Körpergewicht zu einem Zeitpunkt
export function bwAt(ts, log) {
  if (!Array.isArray(log) || !log.length) return null;
  let v = log[0].kg;
  for (const e of log) { if ((e.t || 0) <= ts) v = e.kg; else break; }
  return v;
}

// ---------- Hauptübungen ----------
export const LIFTS = {
  bench: { label: 'Bankdrücken', re: /^bankdrücken( \(langhantel\))?$|^bench press/i },
  squat: { label: 'Kniebeuge', re: /^(squat|kniebeuge)( \(langhantel\))?$|^back squat/i },
  deadlift: { label: 'Kreuzheben', re: /^kreuzheben( \(langhantel\))?$|^deadlift/i },
  ohp: { label: 'Schulterdrücken', re: /^schulterdrücken \(langhantel\)|^military press|^überkopfdrücken \(langhantel\)|^overhead press/i },
};

// Übungsnamen tolerant vergleichen („Liegestütz“ = „Liegestütze“, Groß/Klein, Leerzeichen)
export const exKey = (n) => String(n || '').toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z0-9()]/g, '').replace(/(e|en|n)(?=\(|$)/, '');

// ---------- Rekorde zählen (aus dem gesamten Verlauf eines Nutzers) ----------
export function prMap(sums) {
  const best = new Map();
  const out = new Map();
  for (const w of [...sums].sort((a, b) => a.start - b.start)) {
    let n = 0;
    for (const x of w.ex || []) {
      let b = best.get(x.n);
      if (!b) best.set(x.n, (b = { e: 0, w: 0, mr: 0, d: 0 }));
      const checks = x.t === 'weight' || x.t === 'weighted_bw' ? [['e', x.e], ['w', x.w]]
        : x.t === 'bodyweight' ? [['mr', x.mr]] : x.t === 'cardio' ? [['d', x.d]] : [];
      let pr = false;
      for (const [k, v] of checks) {
        if (!v) continue;
        if (v > b[k] + 1e-9) { if (b[k] > 0) pr = true; b[k] = v; }
      }
      if (pr) n++; // max. 1 Rekord pro Übung und Workout

    }
    out.set(w.id, n);
  }
  return out;
}

// ---------- Streak (Wochen mit erreichtem Wochenziel) ----------
export function streakInfo(sums, goal = 3, now = Date.now()) {
  goal = Math.max(1, goal || 3);
  const counts = new Map();
  for (const w of sums) { const k = startOfWeek(w.start); counts.set(k, (counts.get(k) || 0) + 1); }
  const ok = (k) => (counts.get(k) || 0) >= goal;
  const prev = (k) => startOfWeek(k - 3 * DAY);
  const nowW = startOfWeek(now);
  let cur = ok(nowW) ? 1 : 0;
  for (let k = prev(nowW); ok(k); k = prev(k)) cur++;
  let longest = 0, run = 0;
  if (sums.length) {
    const first = Math.min(...sums.map((w) => w.start));
    for (let k = startOfWeek(first); k <= nowW; k = startOfWeek(k + 10 * DAY)) { run = ok(k) ? run + 1 : 0; longest = Math.max(longest, run); }
  }
  return { current: cur, longest, goal, goalWeeks: [...counts.keys()].filter(ok), stage: stageIndex(cur), thisWeek: counts.get(nowW) || 0 };
}

// ---------- Liga (Fleiß, monatliche Saison) ----------
export const LEAGUE_POINTS = { workout: 10, goalWeek: 30, pr: 5, win: 50, finish: 10 };
export const LEAGUE_RULES = 'Punkte: 10 pro Workout (max. 2 pro Tag) · 30 pro erreichtem Wochenziel · 5 pro Rekord · 50 pro Challenge-Sieg · 10 pro beendeter Challenge.';

// Woche zählt für den Monat, in dem ihr Donnerstag liegt
const weekMonth = (wk) => startOfMonth(wk + 3 * DAY);

export function seasonScore({ sums, prs, goal, results = [] }, from, to) {
  const b = { workouts: 0, goalWeeks: 0, prs: 0, wins: 0, finished: 0 };
  const perDay = new Map();
  for (const w of sums) {
    if (w.start < from || w.start >= to) continue;
    const k = dayKey(w.start);
    const c = perDay.get(k) || 0;
    perDay.set(k, c + 1);
    if (c < 2) b.workouts++;
    b.prs += prs.get(w.id) || 0;
  }
  const st = streakInfo(sums, goal, Math.min(Date.now(), to - 1));
  const nowW = startOfWeek(Date.now());
  for (const wk of st.goalWeeks) { const m = weekMonth(wk); if (m >= from && m < to && (wk < nowW || wk === nowW)) b.goalWeeks++; }
  for (const r of results) {
    if (r.end < from || r.end >= to) continue;
    b.finished++;
    if (r.won) b.wins++;
  }
  const P = LEAGUE_POINTS;
  const points = b.workouts * P.workout + b.goalWeeks * P.goalWeek + b.prs * P.pr + b.wins * P.win + b.finished * P.finish;
  return { points, ...b };
}

// ---------- Ewige Tabelle ----------
export const ALLTIME = [
  { key: 'workouts', label: 'Workouts', unit: '' },
  { key: 'volume', label: 'Volumen', unit: 'kg' },
  { key: 'hours', label: 'Trainingszeit', unit: 'h' },
  { key: 'km', label: 'Cardio', unit: 'km' },
  { key: 'streak', label: 'Längste Streak', unit: 'Wo.' },
  { key: 'bench', label: 'Bankdrücken', unit: 'kg', strength: true },
  { key: 'squat', label: 'Kniebeuge', unit: 'kg', strength: true },
  { key: 'deadlift', label: 'Kreuzheben', unit: 'kg', strength: true },
  { key: 'ohp', label: 'Schulterdrücken', unit: 'kg', strength: true },
  { key: 'big3', label: 'Big 3 Total', unit: 'kg', strength: true },
];

// Bestwerte eines Nutzers: absolut (1RM) und relativ zum damaligen Körpergewicht
export function alltimeStats(sums, bwLog, goal) {
  const r = { workouts: sums.length, volume: 0, hours: 0, km: 0, streak: streakInfo(sums, goal).longest, abs: {}, rel: {}, at: {} };
  for (const w of sums) {
    r.volume += w.vol || 0;
    r.hours += (w.dur || 0) / 3600;
    r.km += w.km || 0;
    const bw = bwAt(w.start, bwLog);
    for (const x of w.ex || []) {
      if (x.t !== 'weight' || !x.e) continue;
      for (const [k, L] of Object.entries(LIFTS)) {
        if (!L.re.test(x.n)) continue;
        if (x.e > (r.abs[k] || 0)) { r.abs[k] = x.e; r.at[k] = w.start; }
        if (bw && x.e / bw > (r.rel[k] || 0)) r.rel[k] = x.e / bw;
      }
    }
  }
  if (r.abs.bench && r.abs.squat && r.abs.deadlift) r.abs.big3 = r.abs.bench + r.abs.squat + r.abs.deadlift;
  if (r.rel.bench && r.rel.squat && r.rel.deadlift) r.rel.big3 = r.rel.bench + r.rel.squat + r.rel.deadlift;
  return r;
}
export function alltimeValue(st, key, relative) {
  const cat = ALLTIME.find((c) => c.key === key);
  if (!cat) return 0;
  if (cat.strength) return (relative ? st.rel[key] : st.abs[key]) || 0;
  return st[key] || 0;
}

// ---------- Challenges ----------
export const CHALLENGE_TYPES = {
  workouts: { label: 'Meiste Workouts', unit: 'Workouts' },
  days: { label: 'Meiste Trainingstage', unit: 'Tage' },
  volume: { label: 'Meistes Volumen', unit: 'kg', rel: true },
  sets: { label: 'Meiste Arbeitssätze', unit: 'Sätze' },
  minutes: { label: 'Meiste Trainingszeit', unit: 'Min.' },
  prs: { label: 'Meiste Rekorde', unit: 'Rekorde' },
  cardioKm: { label: 'Cardio-Distanz', unit: 'km', dec: 1 },
  cardioMin: { label: 'Cardio-Zeit', unit: 'Min.' },
  mobility: { label: 'Mobility-Einheiten', unit: 'Einheiten' },
  exReps: { label: 'Übung: meiste Wiederholungen', unit: 'Wdh.', ex: true },
  exVolume: { label: 'Übung: meistes Volumen', unit: 'kg', ex: true, rel: true },
  exSets: { label: 'Übung: meiste Sätze', unit: 'Sätze', ex: true },
  exE1rm: { label: 'Übung: höchstes 1RM', unit: 'kg', ex: true, rel: true, dec: 1 },
};

export const CHALLENGE_TEMPLATES = [
  { title: '30 Tage – 500 Liegestütze', type: 'exReps', exercise: 'Liegestütze', days: 30 },
  { title: 'Monats-Kilometer', type: 'cardioKm', days: 30 },
  { title: 'Workout-Woche', type: 'workouts', days: 7 },
  { title: 'Volumen-Monster', type: 'volume', days: 14, relative: true },
  { title: 'Bankdrück-Duell', type: 'exE1rm', exercise: 'Bankdrücken (Langhantel)', days: 28, relative: true },
  { title: 'Mobility-Monat', type: 'mobility', days: 30 },
];

export function challengeValue(c, sums, prs, bwLog) {
  const T = CHALLENGE_TYPES[c.type];
  if (!T) return 0;
  const list = sums.filter((w) => w.start >= c.start && w.start < c.end);
  const rel = T.rel && c.relative;
  const div = (w) => (rel ? bwAt(w.start, bwLog) || 0 : 1);
  const key = exKey(c.exercise);
  const exs = (w) => (w.ex || []).filter((x) => exKey(x.n) === key);
  let v = 0;
  switch (c.type) {
    case 'workouts': return list.length;
    case 'days': return new Set(list.map((w) => dayKey(w.start))).size;
    case 'volume': for (const w of list) { const d = div(w); if (d) v += (w.vol || 0) / d; } return v;
    case 'sets': return list.reduce((a, w) => a + (w.sets || 0), 0);
    case 'minutes': return list.reduce((a, w) => a + (w.dur || 0), 0) / 60;
    case 'prs': return list.reduce((a, w) => a + (prs.get(w.id) || 0), 0);
    case 'cardioKm': return list.reduce((a, w) => a + (w.km || 0), 0);
    case 'cardioMin': return list.reduce((a, w) => a + (w.cmin || 0), 0);
    case 'mobility': return list.filter((w) => w.mob).length;
    case 'exReps': for (const w of list) for (const x of exs(w)) v += x.r || 0; return v;
    case 'exSets': for (const w of list) for (const x of exs(w)) v += x.s || 0; return v;
    case 'exVolume': for (const w of list) { const d = div(w); if (d) for (const x of exs(w)) v += (x.v || 0) / d; } return v;
    case 'exE1rm': for (const w of list) { const d = div(w); if (d) for (const x of exs(w)) v = Math.max(v, (x.e || 0) / d); } return v;
    default: return 0;
  }
}

export function challengeStatus(c, now = Date.now()) {
  if (now < c.start) return 'upcoming';
  if (now >= c.end) return 'finished';
  return 'running';
}
