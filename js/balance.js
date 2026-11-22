// Disbalance-Analyse: Bewegungsmuster-Verhältnisse (Volumen) und Kraftverhältnisse (1RM)

import { state } from './store.js';
import { idx } from './stats.js';
import { DAY } from './utils.js';

export function pattern(name) {
  const n = name.toLowerCase();
  if (/butterfly reverse|reverse (fly|butterfly)|face ?pull|hintere schulter/.test(n)) return 'rear';
  if (/schulterdrücken|shoulder press|military|überkopfdrücken|arnold/.test(n)) return 'vpush';
  if (/bankdrücken|brustpresse|liegestütz|push ?up|butterfly|fliegende|chest press|pec deck|dip/.test(n)) return 'hpush';
  if (/klimmzug|latzug|pull ?up|chin ?up|pulldown/.test(n)) return 'vpull';
  if (/rudermaschine|carido/.test(n)) return null;
  if (/rudern|rundern|row|t-bar/.test(n)) return 'hpull';
  if (/seitheben|lateral/.test(n)) return 'side';
  if (/frontheben|front raise/.test(n)) return 'front';
  if (/beinbeugen|leg curl/.test(n)) return 'hip';
  if (/curl|bizeps/.test(n)) return 'biceps';
  if (/trizeps|pushdown|french press|skull/.test(n)) return 'triceps';
  if (/kreuzheben|deadlift|hip thrust|rückenstrecken|glute|kickback|hyperextension/.test(n)) return 'hip';
  if (/squat|kniebeuge|beinpresse|leg press|beinstrecken|ausfallschritt|lunge|split|hackenschmidt|step ?up/.test(n)) return 'knee';
  if (/wade|calf/.test(n)) return 'calves';
  return null;
}

const UPPER = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Unterarme', 'Nacken'];
const LOWER = ['Quadrizeps', 'Beinbeuger', 'Gesäß', 'Waden', 'Adduktoren', 'Abduktoren', 'Unterer Rücken'];

const RATIOS = [
  { id: 'pushpull', title: 'Drücken : Ziehen', a: 'Drücken', b: 'Ziehen', aK: ['hpush', 'vpush'], bK: ['hpull', 'vpull'], ideal: [0.42, 0.52],
    tipA: 'Mehr Zugübungen (Rudern, Latzug, Klimmzüge)', tipB: 'Mehr Drückübungen (Bank-, Schulterdrücken)', info: 'Ein leichtes Plus beim Ziehen schützt die Schultern.' },
  { id: 'horiz', title: 'Bankdrücken : Rudern', a: 'Bankdrücken', b: 'Rudern', aK: ['hpush'], bK: ['hpull'], ideal: [0.4, 0.52],
    tipA: 'Mehr Rudervarianten', tipB: 'Mehr Brust-/Bankdrückvolumen' },
  { id: 'vert', title: 'Überkopf : Latzug', a: 'Überkopf', b: 'Latzug', aK: ['vpush'], bK: ['vpull'], ideal: [0.35, 0.52],
    tipA: 'Mehr Klimmzüge/Latzug', tipB: 'Mehr Überkopfdrücken' },
  { id: 'ul', title: 'Oberkörper : Beine', a: 'Oberkörper', b: 'Beine', muscles: [UPPER, LOWER], ideal: [0.5, 0.65],
    tipA: 'Mehr Beintraining (Kniebeuge, Beinpresse, Beinbeuger)', tipB: 'Mehr Oberkörpertraining', info: 'Ziel: Beine machen mindestens ca. 35 % deiner Sätze aus.' },
  { id: 'kh', title: 'Knie : Hüfte', a: 'Knie', b: 'Hüfte', aK: ['knee'], bK: ['hip'], ideal: [0.45, 0.6],
    tipA: 'Mehr Beinbeuger, rumänisches Kreuzheben, Hip Thrust', tipB: 'Mehr Kniebeugen, Beinpresse, Beinstrecken', info: 'Starke Beinbeuger schützen das Knie.' },
  { id: 'delts', title: 'Schulter vorne : hinten', a: 'Vorne', b: 'Hinten', aK: ['vpush', 'front'], bK: ['rear'], ideal: [0.4, 0.6],
    tipA: 'Mehr Face Pulls / Reverse Butterfly', tipB: 'Mehr Überkopfdrücken', info: 'Bankdrücken belastet die vordere Schulter zusätzlich.' },
  { id: 'arms', title: 'Bizeps : Trizeps', a: 'Bizeps', b: 'Trizeps', muscles: [['Bizeps'], ['Trizeps']], ideal: [0.4, 0.55],
    tipA: 'Mehr Trizepsübungen', tipB: 'Mehr Curls' },
];

const plusSets = (v) => { const n = Math.max(1, Math.round(v)); return `+${n} ${n === 1 ? 'Satz' : 'Sätze'}`; };

export function volumeBalance(from, to) {
  const { asc, wStats, ex } = idx();
  const list = asc.filter((w) => w.start >= from && w.start <= to);
  const weeks = Math.max(1, (to - from) / (7 * DAY));
  const sets = {}, vol = {}, musc = {};
  for (const w of list) {
    for (const e of w.exercises) {
      const x = ex.get(e.name);
      if (!x || x.type === 'cardio' || x.type === 'duration') continue;
      const p = pattern(e.name);
      if (!p) continue;
      const work = e.sets.filter((s) => s.type !== 'warmup');
      sets[p] = (sets[p] || 0) + work.length;
      vol[p] = (vol[p] || 0) + work.reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0);
    }
    for (const [m, v] of Object.entries(wStats.get(w.id).muscles)) musc[m] = (musc[m] || 0) + v;
  }
  const S = (keys) => keys.reduce((a, k) => a + (sets[k] || 0), 0);
  const V = (keys) => keys.reduce((a, k) => a + (vol[k] || 0), 0);
  const M = (ms) => ms.reduce((a, k) => a + (musc[k] || 0), 0);
  return RATIOS.map((r) => {
    const A = r.muscles ? M(r.muscles[0]) : S(r.aK);
    const B = r.muscles ? M(r.muscles[1]) : S(r.bK);
    const vA = r.muscles ? null : V(r.aK);
    const vB = r.muscles ? null : V(r.bK);
    const total = A + B;
    const share = total ? A / total : 0.5;
    const [lo, hi] = r.ideal;
    const dev = share < lo ? lo - share : share > hi ? share - hi : 0;
    const level = total < 6 ? 'none' : dev === 0 ? 'ok' : dev < 0.08 ? 'mild' : 'strong';
    let tip = '';
    if (level === 'mild' || level === 'strong') {
      const mid = (lo + hi) / 2;
      if (share > hi) {
        const need = (A * (1 - mid)) / mid - B;
        tip = `${r.tipA}: ca. ${plusSets(need / weeks)} pro Woche`;
      } else {
        const need = (B * mid) / (1 - mid) - A;
        tip = `${r.tipB}: ca. ${plusSets(need / weeks)} pro Woche`;
      }
    }
    return { ...r, A, B, vA, vB, share, level, tip, perWeekA: A / weeks, perWeekB: B / weeks };
  });
}

// ---------- Kraftverhältnisse ----------
// Nur Langhantel-Varianten (Kurzhanteln werden oft als Summe beider Hanteln geloggt)
const LIFTS = {
  bench: /^bankdrücken( \(langhantel\))?$|bench press/i,
  row: /rudern.*langhantel|langhantel.*rudern|barbell row/i,
  ohp: /^schulterdrücken \(langhantel\)|military press|überkopfdrücken \(langhantel\)/i,
  squat: /^(squat|kniebeuge)( \(langhantel\))?$|back squat/i,
  deadlift: /^kreuzheben( \(langhantel\))?$|^deadlift/i,
};
const LIFT_LABEL = { bench: 'Bankdrücken', row: 'Rudern', ohp: 'Schulterdrücken', squat: 'Kniebeuge', deadlift: 'Kreuzheben' };

// Bestwert der letzten 12 Monate; ältere Daten zählen nicht (zu ungenau für Vergleiche)
function findLift(key) {
  const { ex } = idx();
  const since = Date.now() - 365 * DAY;
  const cands = [...ex.values()]
    .filter((x) => x.type === 'weight' && LIFTS[key].test(x.name))
    .map((x) => ({ x, recent: x.sessions.filter((s) => s.date >= since && s.bestE1rm > 0) }))
    .sort((a, b) => b.recent.length - a.recent.length);
  const c = cands[0];
  if (!c) return null;
  if (!c.recent.length) return { key, label: LIFT_LABEL[key], name: c.x.name, stale: true };
  return { key, label: LIFT_LABEL[key], name: c.x.name, e1rm: Math.max(...c.recent.map((s) => s.bestE1rm)) };
}

const STRENGTH_RATIOS = [
  { a: 'row', b: 'bench', ideal: [0.75, 1.0], range: [0.4, 1.4], text: 'Rudern sollte ca. 75–100 % deines Bankdrückens erreichen.' },
  { a: 'ohp', b: 'bench', ideal: [0.55, 0.75], range: [0.3, 1.0], text: 'Schulterdrücken liegt typischerweise bei 55–75 % des Bankdrückens.' },
  { a: 'squat', b: 'deadlift', ideal: [0.75, 0.95], range: [0.4, 1.3], text: 'Die Kniebeuge liegt meist bei 75–95 % des Kreuzhebens.' },
  { a: 'bench', b: 'squat', ideal: [0.6, 0.85], range: [0.3, 1.2], text: 'Bankdrücken liegt meist bei 60–85 % der Kniebeuge.' },
];

export function strengthBalance() {
  const lifts = Object.fromEntries(Object.keys(LIFTS).map((k) => [k, findLift(k)]));
  const ratios = STRENGTH_RATIOS.map((r) => {
    const A = lifts[r.a], B = lifts[r.b];
    if (!A || !B || A.stale || B.stale) return { ...r, missing: true, A, B };
    const v = A.e1rm / B.e1rm;
    const [lo, hi] = r.ideal;
    const dev = v < lo ? (lo - v) / lo : v > hi ? (v - hi) / hi : 0;
    const level = dev === 0 ? 'ok' : dev < 0.12 ? 'mild' : 'strong';
    const tip = v < lo ? `${A.label} hinkt hinterher – gezielt priorisieren.` : v > hi ? `${B.label} hinkt hinterher – gezielt priorisieren.` : '';
    return { ...r, A, B, value: v, level, tip };
  });
  return { lifts, ratios };
}

// Kraft relativ zum Körpergewicht (Richtwerte, Männer)
const STANDARDS = {
  bench: [0.5, 0.75, 1.0, 1.5, 2.0],
  squat: [0.75, 1.25, 1.5, 2.0, 2.5],
  deadlift: [1.0, 1.5, 2.0, 2.5, 3.0],
  ohp: [0.35, 0.55, 0.75, 1.0, 1.25],
  row: [0.5, 0.75, 1.0, 1.25, 1.5],
};
export const LEVELS = ['Untrainiert', 'Einsteiger', 'Fortgeschritten', 'Erfahren', 'Stark', 'Elite'];

export function bodyweightStandards(lifts) {
  const bw = state.settings.bodyweight;
  if (!bw) return null;
  return Object.entries(STANDARDS).map(([k, th]) => {
    const l = lifts[k];
    if (!l || l.stale) return null;
    const rel = l.e1rm / bw;
    let lvl = 0;
    th.forEach((t, i) => { if (rel >= t) lvl = i + 1; });
    return { ...l, rel, lvl, th, levelName: LEVELS[lvl], max: th[th.length - 1] * 1.15 };
  }).filter(Boolean);
}
