// Allgemeine Helfer: DOM, Formatierung, Datum, Mathe

import { share } from './platform.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const nfCache = {};
const nf = (d) => (nfCache[d] ??= new Intl.NumberFormat('de-DE', { maximumFractionDigits: d }));
export const num = (v, d = 1) => (v == null || isNaN(v) ? '–' : nf(d).format(v));

export function fmtKg(v, d = 1) {
  return v == null || isNaN(v) ? '–' : `${num(v, d)} kg`;
}
export function fmtVolume(kg) {
  if (kg == null || isNaN(kg)) return '–';
  if (kg >= 100000) return `${num(kg / 1000, 1)} t`;
  return `${num(kg, 0)} kg`;
}
export function fmtCompact(v) {
  if (v >= 1e6) return `${num(v / 1e6, 1)} Mio.`;
  if (v >= 1e4) return `${num(v / 1e3, 0)}k`;
  if (v >= 1e3) return `${num(v / 1e3, 1)}k`;
  return num(v, 0);
}
export function fmtDur(sec) {
  if (!sec || sec < 0) return '0 Min.';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} Min.`;
  return `${h} Std. ${m} Min.`;
}
export function fmtDurShort(sec) {
  if (!sec || sec < 0) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
export function fmtPct(v, d = 0) {
  if (v == null || !isFinite(v)) return '–';
  return `${v > 0 ? '+' : ''}${num(v, d)} %`;
}

const dfCache = {};
export function fmtDate(ts, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const k = JSON.stringify(opts);
  dfCache[k] ??= new Intl.DateTimeFormat('de-DE', opts);
  return dfCache[k].format(new Date(ts));
}
export const fmtDateLong = (ts) =>
  fmtDate(ts, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtTime = (ts) => fmtDate(ts, { hour: '2-digit', minute: '2-digit' });
export function fmtRelDay(ts) {
  const d = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  if (d === 0) return 'Heute';
  if (d === 1) return 'Gestern';
  if (d < 7) return `vor ${d} Tagen`;
  return fmtDate(ts);
}

export const DAY = 864e5;
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function startOfWeek(ts) {
  const d = new Date(startOfDay(ts));
  const wd = (d.getDay() + 6) % 7; // Montag = 0
  d.setDate(d.getDate() - wd);
  return d.getTime();
}
export function startOfMonth(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
export function addMonths(ts, n) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}
export const weekday = (ts) => (new Date(ts).getDay() + 6) % 7;
export function isoWeek(ts) {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / DAY - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

// Epley-Formel für geschätztes 1RM
export function e1rm(w, r) {
  if (!w || !r || w <= 0 || r <= 0) return 0;
  if (r === 1) return w;
  if (r > 20) return 0; // Schätzung wird unbrauchbar
  return w * (1 + r / 30);
}

// Lineare Regression über {x, y}
export function linreg(pts) {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
  const den = n * sxx - sx * sx;
  if (!den) return null;
  const slope = (n * sxy - sx * sy) / den;
  return { slope, intercept: (sy - slope * sx) / n };
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (f(x) || 0), 0);

export function parseNum(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Teilen-Dialog (iOS) mit Fallback auf Download
export async function shareFile(filename, text, type) {
  try {
    const file = new File([text], filename, { type });
    if (await share({ files: [file], title: filename })) return true;
  } catch (e) {
    if (e.name === 'AbortError') return false;
  }
  download(filename, text, type);
  return true;
}
