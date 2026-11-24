// Prüft Daten von außen (Backup, CSV, Server) und baut sie sauber neu auf:
// nur bekannte Felder, richtige Datentypen, plausible Zahlen, begrenzte Textlängen.

import { MUSCLES, TYPES } from './library.js';

export const SET_TYPES = ['normal', 'warmup', 'dropset', 'failure'];
export const LIMITS = { weight: [-500, 1000], reps: [0, 1000], distance: [0, 1000], duration: [0, 86400], rpe: [0, 10] };
export const MAX_FILE_MB = 40;
const BAD_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
const DAY = 864e5;

const txt = (v, max) => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'number' ? String(v) : '').slice(0, max);
const idOf = (v) => txt(v, 64).replace(/[^\w.:-]/g, '');
function numIn(v, [lo, hi]) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}
export function cleanName(v) {
  const n = txt(v, 80).replace(/\s+/g, ' ').trim();
  return n && !BAD_NAMES.has(n) ? n : '';
}

function cleanSet(s, withMeta = true) {
  if (!s || typeof s !== 'object') return null;
  const out = { type: SET_TYPES.includes(s.type) ? s.type : 'normal' };
  for (const k of ['weight', 'reps', 'distance', 'duration']) out[k] = numIn(s[k], LIMITS[k]);
  if (withMeta) out.rpe = numIn(s.rpe, LIMITS.rpe);
  return out;
}

export function cleanWorkout(w) {
  if (!w || typeof w !== 'object') return null;
  const start = Number(w.start);
  if (!Number.isFinite(start) || start < Date.UTC(1990, 0, 1) || start > Date.now() + 2 * DAY) return null;
  let end = Number(w.end);
  if (!Number.isFinite(end) || end < start || end - start > DAY) end = start + 3600e3;
  const exercises = (Array.isArray(w.exercises) ? w.exercises : []).slice(0, 80).map((e) => {
    if (!e || typeof e !== 'object') return null;
    const name = cleanName(e.name);
    if (!name) return null;
    return {
      name, notes: txt(e.notes, 2000), supersetId: e.supersetId == null || e.supersetId === '' ? null : txt(e.supersetId, 40),
      sets: (Array.isArray(e.sets) ? e.sets : []).slice(0, 200).map((s) => cleanSet(s)).filter(Boolean),
    };
  }).filter(Boolean);
  const out = {
    id: idOf(w.id) || `w${start.toString(36)}`, title: txt(w.title, 120).trim() || 'Workout', start, end,
    description: txt(w.description, 4000), source: ['app', 'import', 'strava'].includes(w.source) ? w.source : 'import', exercises,
  };
  if (w.routineId) out.routineId = idOf(w.routineId);
  if (w.planId) out.planId = idOf(w.planId);
  return out;
}

export function cleanRoutine(r) {
  if (!r || typeof r !== 'object') return null;
  const id = idOf(r.id);
  if (!id) return null;
  return {
    id, name: txt(r.name, 80).trim() || 'Routine', order: numIn(r.order, [0, 10000]) ?? 0,
    exercises: (Array.isArray(r.exercises) ? r.exercises : []).slice(0, 80).map((e) => {
      const name = e && typeof e === 'object' ? cleanName(e.name) : '';
      if (!name) return null;
      return { name, rest: numIn(e.rest, [0, 3600]), sets: (Array.isArray(e.sets) ? e.sets : []).slice(0, 200).map((s) => cleanSet(s, false)).filter(Boolean) };
    }).filter(Boolean),
  };
}

export function cleanMeta(m) {
  if (!m || typeof m !== 'object') return null;
  const name = cleanName(m.name);
  if (!name) return null;
  const out = { name };
  if (MUSCLES.includes(m.primary)) out.primary = m.primary;
  if (Array.isArray(m.secondary)) out.secondary = m.secondary.filter((x) => MUSCLES.includes(x)).slice(0, 6);
  if (m.type in TYPES) out.type = m.type;
  if (Array.isArray(m.repRange) && m.repRange.length === 2) {
    const [a, b] = m.repRange.map((x) => numIn(x, [1, 100]));
    if (a && b && b > a) out.repRange = [a, b];
  }
  const inc = numIn(m.increment, [0.25, 50]); if (inc) out.increment = inc;
  const rest = numIn(m.rest, [0, 3600]); if (rest != null) out.rest = rest;
  if (m.custom) out.custom = true;
  return out;
}

// Liste säubern und zählen, was verworfen wurde
export function cleanList(list, fn) {
  const out = [];
  let dropped = 0;
  for (const x of Array.isArray(list) ? list : []) { const c = fn(x); if (c) out.push(c); else dropped++; }
  return { list: out, dropped };
}
