// Gamification: Kämpfer-Stufen, Kampfkraft, Level/XP, Abzeichen, Wochen-Aufgaben

import { state } from './store.js';
import { idx, weekStreaks, countsW, countFrom } from './stats.js';
import { startOfWeek, sum, DAY, num, fmtVolume } from './utils.js';
import { cardioKind, MOBILITY_RE, LIFTS, bwAt } from './compete.js';
import { summarizer, cachedGroup, myId } from './sync.js';
import { conf } from './config.js';
import { xpScore, xpParams, xpRecords, workoutXp, xpRules, eligible } from './xp.js';
import { bwLog } from './body.js';
import { setUnlockChecker } from './unlocks.js';

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

// ---------- EP: ein System für Level, Arena und Streak (Regeln in js/xp.js) ----------
let xpCache = { v: -1 };
export function xpState() {
  if (xpCache.v === state.version && xpCache.cfg === conf('points') && xpCache.from === countFrom()) return xpCache;
  const sum1 = summarizer();
  const from = countFrom();
  const sums = state.workouts.map((w) => { const x = { ...sum1(w), id: w.id }; if (w.start < from) x.h = 1; return x; });
  const P = xpParams(conf('points'));
  const prs = xpRecords(sums);
  const score = xpScore({ sums, goal: state.settings.weekGoal || 3, prs, P });
  xpCache = { v: state.version, from: countFrom(), cfg: conf('points'), sums, byId: new Map(sums.map((x) => [x.id, x])), P, prs, score };
  return xpCache;
}
export const EP_RULES_TEXT = () => xpRules(xpState().P);
// Für ältere Aufrufer
export const EP_RULES = xpRules();

// EP eines einzelnen Workouts (für die Anzeige im Workout)
export function workoutEp(w) {
  const X = xpState();
  const s = X.byId.get(w.id);
  if (!s) return null;
  const r = workoutXp(s, X.prs.get(w.id) || 0, X.P);
  return { ...r, reason: !countsW(w) ? (w.source === 'import' ? 'Importiert – zählt nur in deiner privaten Statistik' : w.start < countFrom() ? 'Vor dem Start deiner EP-Wertung – zählt nur in deiner privaten Statistik' : 'Strava-Aktivität von vor der Verbindung – nur privat') : !r.counts ? 'Noch keine Sätze oder Zeit eingetragen' : '' };
}

export function profileStats() {
  const { asc, wStats } = idx();
  const st = weekStreaks();
  const X = xpState();
  const totalVol = sum(asc, (w) => wStats.get(w.id).volume);
  const sets = sum(asc, (w) => wStats.get(w.id).sets);
  // Level = Arena: angemeldet zählt der Server-Stand (inkl. Challenge-Siege), falls er höher ist
  const gd = cachedGroup();
  // nur Arena-Daten nach aktueller Regel (xpv 2: Importe und alles vor „EP zählen ab“ ausgeschlossen)
  const me = gd?.xpv === 2 ? gd.members?.find((m) => m.id === myId()) : null;
  const xp = Math.max(X.score.points, me?.xp || 0);
  const lvl = levelFor(xp);
  const recs = [...X.prs.values()].reduce((a, b) => a + b, 0);
  const power = Math.round(Math.sqrt(totalVol) * 10 + recs * 25 + st.current * 150 + st.longest * 50);
  return { st, totalVol, sets, xp, ...lvl, power, prs: recs, stage: stageFor(st.current), score: X.score };
}

const T = (L) => Math.round(300 * L ** 1.7);
export function levelFor(xp) {
  let L = 1;
  while (T(L + 1) <= xp) L++;
  const a = T(L), b = T(L + 1);
  return { level: L, levelProgress: (xp - a) / (b - a), xpToNext: b - xp };
}

// ---------- Abzeichen (nur zählende Workouts, wie Level und Arena) ----------
const md = (m, d) => (t) => { const x = new Date(t); return x.getMonth() === m && x.getDate() === d; };
function easter(y) { // Ostersonntag (Gauß)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, da);
}
function ctx() {
  const { asc: all, wStats, ex } = idx();
  const X = xpState();
  const asc = all.filter((w) => countsW(w) && X.byId.get(w.id) && eligible([X.byId.get(w.id)]).length);
  const st = weekStreaks();
  const P = profileStats();
  const bw = bwLog();
  const c = {
    workouts: asc.length, volume: 0, prs: P.prs, longest: st.longest, hours: 0, sets: 0, level: P.level, power: P.power,
    early: 0, late: 0, long: 0, maxSets: 0, maxVol: 0, cardioKm: 0, cardioN: 0, mobility: 0, allroundWeeks: 0, fullYear: false,
    weekend: 0, monday: 0, days: 0, double: 0, run10: 0, half: 0, marathon: 0, maxPrs: 0, comeback: 0, row5: 0,
    xmas: 0, halloween: 0, nye: 0, nikolaus: 0, valentine: 0, easterW: 0, bench1: 0, squat15: 0, dead2: 0,
    monthwin: 0, chwin: 0,
  };
  const weekMuscles = new Map(), yearMonths = new Map(), dayCount = new Map();
  let prevStart = 0;
  for (const w of asc) {
    const s = wStats.get(w.id);
    const d = new Date(w.start);
    const h = d.getHours(), wd = d.getDay();
    c.volume += s.volume; c.hours += s.duration / 3600; c.sets += s.sets;
    if (h < 7) c.early++;
    if (h >= 21) c.late++;
    if (wd === 0 || wd === 6) c.weekend++;
    if (wd === 1) c.monday++;
    if (s.duration >= 7200) c.long++;
    c.maxSets = Math.max(c.maxSets, s.sets);
    c.maxVol = Math.max(c.maxVol, s.volume);
    c.maxPrs = Math.max(c.maxPrs, X.prs.get(w.id) || 0);
    if (w.exercises.some((e) => MOBILITY_RE.test(e.name))) c.mobility++;
    if (md(11, 24)(w.start) || md(11, 25)(w.start) || md(11, 26)(w.start)) c.xmas++;
    if (md(9, 31)(w.start)) c.halloween++;
    if (md(11, 31)(w.start) || md(0, 1)(w.start)) c.nye++;
    if (md(11, 6)(w.start)) c.nikolaus++;
    if (md(1, 14)(w.start)) c.valentine++;
    const e = easter(d.getFullYear());
    if (d.getMonth() === e.getMonth() && Math.abs(d.getDate() - e.getDate()) <= 1) c.easterW++;
    if (prevStart && w.start - prevStart > 28 * DAY) c.comeback++;
    prevStart = w.start;
    const dk = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    dayCount.set(dk, (dayCount.get(dk) || 0) + 1);
    const wk = startOfWeek(w.start);
    const set = weekMuscles.get(wk) || new Set();
    for (const m of Object.keys(s.muscles)) if (m !== 'Cardio' && m !== 'Ganzkörper') set.add(m);
    weekMuscles.set(wk, set);
    const ms = yearMonths.get(d.getFullYear()) || new Set();
    ms.add(d.getMonth());
    yearMonths.set(d.getFullYear(), ms);
    // Cardio-Strecken und Kraft relativ zum Körpergewicht
    const kg = bwAt(w.start, bw);
    for (const e2 of w.exercises) {
      const x = ex.get(e2.name);
      if (!x) continue;
      const done = e2.sets.filter((q) => q.type !== 'warmup');
      if (cardioKind(x.name, x.type)) {
        const km = sum(done, (q) => q.distance || 0);
        c.cardioKm += x.type === 'cardio' ? km : 0;
        c.cardioN++;
        if (/lauf|run|jogg/i.test(x.name)) { if (km >= 10) c.run10++; if (km >= 21.0975) c.half++; if (km >= 42.195) c.marathon++; }
      }
      if (kg && (x.type === 'weight' || x.type === 'weighted_bw')) {
        const best = Math.max(0, ...done.map((q) => (q.weight || 0) * (1 + Math.min(12, q.reps || 0) / 30)));
        if (LIFTS.bench.re.test(x.name) && best >= kg) c.bench1++;
        if (LIFTS.squat.re.test(x.name) && best >= kg * 1.5) c.squat15++;
        if (LIFTS.deadlift.re.test(x.name) && best >= kg * 2) c.dead2++;
      }
    }
  }
  c.days = dayCount.size;
  c.double = [...dayCount.values()].filter((n) => n >= 2).length;
  // 5 Tage in Folge
  const dayTs = [...new Set(asc.map((w) => { const d = new Date(w.start); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }))].sort((a, b) => a - b);
  let run = 1;
  for (let i = 1; i < dayTs.length; i++) { run = Math.round((dayTs[i] - dayTs[i - 1]) / DAY) === 1 ? run + 1 : 1; if (run >= 5) c.row5 = 1; }
  c.allroundWeeks = [...weekMuscles.values()].filter((s2) => s2.size >= 10).length;
  c.fullYear = [...yearMonths.values()].some((s2) => s2.size === 12);
  // Arena: Monatssieg und Challenge-Siege (aus den Gruppendaten)
  const g = cachedGroup();
  const me = myId();
  if (g && me) {
    const t = g.titles?.[me];
    c.monthwin = (typeof t === 'number' ? t : t?.months || 0) + (t?.years || 0) + ((g.season?.months || []).some((m) => !m.running && (m.winners || []).includes(me)) ? 1 : 0);
    c.chwin = (g.challenges || []).filter((ch) => ch.status === 'finished' && (ch.winners || []).includes(me)).length;
  }
  return c;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const MEDALS = ['bronze', 'silber', 'gold', 'platin'];
const tiers = (id, icon, title, key, targets, fmt = (v) => num(v, 0), desc) =>
  targets.map((t, i) => ({ id: `${id}${t}`, icon, title: `${title} ${ROMAN[i]}`, desc: desc(fmt(t)), key, target: t, tier: i, medal: MEDALS[Math.min(3, Math.floor((i * 4) / targets.length))] }));
const one = (id, icon, title, desc, key, target = 1, group = 'Spezial') => ({ id, icon, title, desc, key, target, group });

export const ACHIEVEMENTS = [
  ...tiers('w', 'dumbbell', 'Eisern', 'workouts', [1, 5, 10, 25, 50, 100, 250, 500, 1000], undefined, (t) => `${t} Workouts absolviert`),
  ...tiers('d', 'calendar', 'Dranbleiber', 'days', [10, 50, 100, 200, 365], undefined, (t) => `An ${t} Tagen trainiert`),
  ...tiers('st', 'flame', 'Killstreak', 'longest', [1, 2, 4, 8, 12, 26, 52], undefined, (t) => `${t} Woche${t === '1' ? '' : 'n'} in Folge Wochenziel erreicht`),
  ...tiers('pr', 'trophy', 'Rekordjäger', 'prs', [1, 5, 10, 25, 50, 100, 250, 500], undefined, (t) => `${t} Rekord${t === '1' ? '' : 'e'} aufgestellt`),
  ...tiers('v', 'weight', 'Tonnage', 'volume', [10000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000], (v) => fmtVolume(v), (t) => `${t} Gesamtvolumen bewegt`),
  ...tiers('s', 'layers', 'Satz für Satz', 'sets', [100, 500, 1000, 2500, 5000, 10000], undefined, (t) => `${t} Arbeitssätze`),
  ...tiers('h', 'clock', 'Zeitinvestor', 'hours', [10, 25, 50, 100, 250, 500], undefined, (t) => `${t} Stunden trainiert`),
  ...tiers('ckm', 'bolt', 'Kilometerfresser', 'cardioKm', [10, 50, 100, 250, 500, 1000], undefined, (t) => `${t} km Cardio`),
  ...tiers('cn', 'heart', 'Ausdauer', 'cardioN', [1, 10, 25, 50, 100], undefined, (t) => `${t} Cardio-Einheiten`),
  ...tiers('mob', 'repeat', 'Geschmeidig', 'mobility', [1, 10, 25, 50, 100], undefined, (t) => `${t} Mobility-Einheiten`),
  ...tiers('lv', 'medal', 'Level', 'level', [5, 10, 20, 30, 50], undefined, (t) => `Level ${t} erreicht`),
  ...tiers('we', 'sun', 'Wochenendkrieger', 'weekend', [5, 10, 25, 50], undefined, (t) => `${t} Workouts am Wochenende`),
  one('early', 'sun', 'Frühaufsteher', 'Workout vor 7 Uhr gestartet', 'early'),
  one('early10', 'sun', 'Morgenmensch', '10 Workouts vor 7 Uhr', 'early', 10),
  one('late', 'moon', 'Nachteule', 'Workout nach 21 Uhr gestartet', 'late'),
  one('late10', 'moon', 'Nachtschicht', '10 Workouts nach 21 Uhr', 'late', 10),
  one('monday', 'calendar', 'Montags-Motivation', '10 Workouts an einem Montag', 'monday', 10),
  one('long', 'clock', 'Marathon-Session', 'Ein Workout über 2 Stunden', 'long'),
  one('double', 'repeat', 'Doppelschicht', 'Zwei Workouts an einem Tag', 'double'),
  one('row5', 'flame', 'Fünf am Stück', 'An 5 Tagen in Folge trainiert', 'row5'),
  one('comeback', 'play', 'Comeback', 'Nach über 4 Wochen Pause wieder trainiert', 'comeback'),
  one('sets30', 'layers', 'Satz-Maschine', '30 Arbeitssätze in einem Workout', 'maxSets', 30),
  one('vol20', 'weight', 'Schwertransport', '20 t Volumen in einem Workout', 'maxVol', 20000),
  one('prday', 'trophy', 'Rekordtag', '3 Rekorde in einem Workout', 'maxPrs', 3),
  one('allround', 'target', 'Allrounder', '10 Muskelgruppen in einer Woche trainiert', 'allroundWeeks'),
  one('year', 'calendar', 'Ganzjährig', 'In jedem Monat eines Jahres trainiert', 'fullYear'),
  one('run10', 'bolt', '10 km', 'Einen 10-km-Lauf geschafft', 'run10', 1, 'Ausdauer'),
  one('half', 'bolt', 'Halbmarathon', '21,1 km am Stück gelaufen', 'half', 1, 'Ausdauer'),
  one('marathon', 'bolt', 'Marathon', '42,2 km am Stück gelaufen', 'marathon', 1, 'Ausdauer'),
  one('bench1', 'weight', 'Eigengewicht drücken', 'Bankdrücken mit Körpergewicht (1RM)', 'bench1', 1, 'Kraft'),
  one('squat15', 'weight', 'Eisenbeine', 'Kniebeuge mit 1,5 × Körpergewicht (1RM)', 'squat15', 1, 'Kraft'),
  one('dead2', 'weight', 'Doppeltes Gewicht', 'Kreuzheben mit 2 × Körpergewicht (1RM)', 'dead2', 1, 'Kraft'),
  one('over9000', 'bolt', 'Über 9000!', 'Kampfkraft über 9000', 'power', 9001, 'Kraft'),
  one('monthwin', 'trophy', 'Monatssieger', 'Einen Arena-Monat gewonnen', 'monthwin', 1, 'Arena'),
  one('chwin', 'trophy', 'Herausforderer', 'Eine Challenge gewonnen', 'chwin', 1, 'Arena'),
  one('chwin5', 'trophy', 'Seriensieger', '5 Challenges gewonnen', 'chwin', 5, 'Arena'),
  one('xmas', 'star', 'Weihnachtsworkout', 'Zwischen 24. und 26. Dezember trainiert', 'xmas', 1, 'Events'),
  one('halloween', 'moon', 'Gruselpump', 'An Halloween trainiert', 'halloween', 1, 'Events'),
  one('nye', 'star', 'Guter Vorsatz', 'An Silvester oder Neujahr trainiert', 'nye', 1, 'Events'),
  one('nikolaus', 'star', 'Nikolaus-Pump', 'Am 6. Dezember trainiert', 'nikolaus', 1, 'Events'),
  one('valentine', 'heart', 'Selbstliebe', 'Am Valentinstag trainiert', 'valentine', 1, 'Events'),
  one('easter', 'star', 'Osterhase', 'Rund um Ostern trainiert', 'easterW', 1, 'Events'),
  one('weekend10', 'sun', 'Feierabendschorle', '10 Workouts am Wochenende', 'weekend', 10, 'Spezial'),
];

let achCache = { v: -1 };
export function achievements() {
  const key = `${state.version}|${cachedGroup()?.now || ''}`;
  if (achCache.v === key) return achCache.list;
  const c = ctx();
  const list = ACHIEVEMENTS.map((a) => {
    const v = typeof c[a.key] === 'boolean' ? +c[a.key] : c[a.key] || 0;
    return { ...a, value: v, done: v >= a.target, progress: Math.min(1, v / a.target) };
  });
  achCache = { v: key, list };
  return list;
}
export const achievementTitle = (id) => ACHIEVEMENTS.find((a) => a.id === id)?.title || id;

// Freischaltbare Avatar-Objekte: Level oder Abzeichen
setUnlockChecker((u) => (u.level ? profileStats().level >= u.level : u.ach ? !!achievements().find((a) => a.id === u.ach)?.done : false));
