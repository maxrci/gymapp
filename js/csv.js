// CSV-Import/-Export für Workout-Daten
// Spalten: title, start_time, end_time, description, exercise_title, superset_id,
// exercise_notes, set_index, set_type, weight_kg, reps, distance_km, duration_seconds, rpe

import { parseNum } from './utils.js';
import { cleanWorkout } from './sanitize.js';

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const MONTH_MAP = {
  jan: 0, feb: 1, mär: 2, mar: 2, mrz: 2, apr: 3, mai: 4, may: 4, jun: 5, jul: 6,
  aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, dez: 11, dec: 11,
};
const monthIdx = (s) => MONTH_MAP[String(s).toLowerCase().replace(/[^a-zäöü]/g, '').slice(0, 3)];

// Unterstützt "16 Nov. 2026, 14:09", "Nov 16, 2026, 2:09 PM", "2026-11-16 14:09:00", "16.11.2026 14:09"
export function parseDate(s) {
  if (!s) return null;
  s = s.trim();
  let m = s.match(/^(\d{1,2})\.?\s+([A-Za-zÄÖÜäöü.]+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m) {
    const mi = monthIdx(m[2]);
    if (mi != null) return mk(+m[3], mi, +m[1], +m[4], +m[5], m[6]);
  }
  m = s.match(/^([A-Za-zÄÖÜäöü.]+)\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m) {
    const mi = monthIdx(m[1]);
    if (mi != null) return mk(+m[3], mi, +m[2], +m[4], +m[5], m[6]);
  }
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if (m) return mk(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}
function mk(y, mo, d, h, mi, ampm) {
  if (ampm) {
    const pm = ampm.toUpperCase() === 'PM';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return new Date(y, mo, d, h, mi).getTime();
}

const SET_TYPES = new Set(['normal', 'warmup', 'dropset', 'failure']);

export function csvToWorkouts(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('Die CSV-Datei ist leer.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  const C = {
    title: col('title'), start: col('start_time'), end: col('end_time'), desc: col('description'),
    ex: col('exercise_title'), ss: col('superset_id'), notes: col('exercise_notes'),
    idx: col('set_index'), type: col('set_type'), w: col('weight_kg'), reps: col('reps'),
    dist: col('distance_km'), dur: col('duration_seconds'), rpe: col('rpe'),
  };
  if (C.start < 0 || C.ex < 0) {
    throw new Error('Unbekanntes CSV-Format: Spalten "start_time" und "exercise_title" fehlen.');
  }
  // Rückweg des Excel-Schutzes: führendes ' vor = + - @ wieder entfernen
  const get = (r, i) => (i >= 0 ? (r[i] ?? '').trim().replace(/^'(?=[=+\-@])/, '') : '');

  const map = new Map();
  const order = [];
  let errors = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const startRaw = get(r, C.start);
    const start = parseDate(startRaw);
    if (start == null) { errors++; continue; }
    const title = get(r, C.title) || 'Workout';
    const key = `${start}|${title}`;
    let w = map.get(key);
    if (!w) {
      const end = parseDate(get(r, C.end));
      w = {
        id: `imp-${start}-${hash(title)}`,
        title,
        start,
        end: end && end >= start ? end : start + 3600e3,
        description: get(r, C.desc),
        exercises: [],
        source: 'import',
        _lastIdx: Infinity,
      };
      map.set(key, w);
      order.push(w);
    }
    const name = get(r, C.ex).replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const setIdx = parseInt(get(r, C.idx), 10);
    let ex = w.exercises[w.exercises.length - 1];
    // Neue Übungsgruppe, wenn Name wechselt oder Satzindex neu beginnt
    if (!ex || ex.name !== name || (!isNaN(setIdx) && setIdx <= w._lastIdx && setIdx === 0)) {
      ex = { name, notes: get(r, C.notes), supersetId: get(r, C.ss) || null, sets: [] };
      w.exercises.push(ex);
    }
    w._lastIdx = isNaN(setIdx) ? w._lastIdx : setIdx;
    let type = get(r, C.type).toLowerCase();
    if (!SET_TYPES.has(type)) type = 'normal';
    ex.sets.push({
      type,
      weight: parseNum(get(r, C.w)),
      reps: parseNum(get(r, C.reps)),
      distance: parseNum(get(r, C.dist)),
      duration: parseNum(get(r, C.dur)),
      rpe: parseNum(get(r, C.rpe)),
    });
  }
  // Plausibilität & Längen prüfen (unplausible Werte werden verworfen)
  const workouts = [];
  for (const w of order) { delete w._lastIdx; const c = cleanWorkout(w); if (c) workouts.push(c); else errors++; }
  return { workouts, errors };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const DE_MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
function fmtCsvDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} ${DE_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Excel-sicher: Texte, die mit = + - @ beginnen, würden sonst als Formel ausgeführt (CSV-Injection)
const q = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
const n = (v) => (v == null ? '' : String(v));

export function workoutsToCSV(workouts) {
  const lines = ['"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"'];
  const sorted = [...workouts].sort((a, b) => b.start - a.start);
  for (const w of sorted) {
    for (const ex of w.exercises) {
      ex.sets.forEach((s, i) => {
        lines.push([
          q(w.title), q(fmtCsvDate(w.start)), q(fmtCsvDate(w.end)), q(w.description), q(ex.name),
          n(ex.supersetId), q(ex.notes), i, q(s.type), n(s.weight), n(s.reps), n(s.distance),
          n(s.duration), n(s.rpe),
        ].join(','));
      });
    }
  }
  return lines.join('\n');
}
