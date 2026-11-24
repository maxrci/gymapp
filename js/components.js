// Wiederverwendbare HTML-Bausteine

import { idx, PR_LABELS } from './stats.js';
import { icon } from './ui.js';
import { esc, num, fmtVolume, fmtDurShort, fmtDur, fmtRelDay, fmtTime, fmtKg, fmtClock, fmtPct } from './utils.js';
import { cardioKind } from './compete.js';

export function pageHead(title, { back, actions = '', sub } = {}) {
  return `<header class="page-head ${back ? 'with-back' : ''}">
    ${back ? `<button class="icon-btn" data-back="${esc(back)}" aria-label="Zurück">${icon('left')}</button>` : ''}
    <div class="ph-text"><h1>${esc(title)}</h1>${sub ? `<div class="ph-sub">${sub}</div>` : ''}</div>
    <div class="ph-actions">${actions}</div>
  </header>`;
}

export function fmtSet(s, type) {
  if (type === 'cardio') {
    return [s.distance ? `${num(s.distance, 2)} km` : '', s.duration ? fmtClock(s.duration) : ''].filter(Boolean).join(' · ') || '–';
  }
  if (type === 'duration') return s.duration ? fmtClock(s.duration) : '–';
  if (type === 'bodyweight') return `${s.reps ?? 0} Wdh.${s.weight ? ` (+${num(s.weight)} kg)` : ''}`;
  if (type === 'weighted_bw') return `${s.weight ? `+${num(s.weight)} kg` : 'Eigengew.'} × ${s.reps ?? 0}`;
  return `${num(s.weight ?? 0)} kg × ${s.reps ?? 0}`;
}

export function setBadge(s, n) {
  const t = s.type;
  const l = t === 'warmup' ? 'W' : t === 'dropset' ? 'D' : t === 'failure' ? 'F' : n;
  return `<span class="set-badge sm t-${esc(t)}">${l}</span>`;
}

export function workoutCard(w) {
  const { wStats, ex } = idx();
  const s = wStats.get(w.id) || {};
  const prs = s.prs?.length || 0;
  const list = w.exercises.slice(0, 4).map((e) => {
    const x = ex.get(e.name);
    const work = e.sets.filter((q) => q.type !== 'warmup');
    let best = null;
    if (x && (x.type === 'weight' || x.type === 'weighted_bw')) {
      best = work.reduce((a, q) => ((q.weight || 0) * (1 + (q.reps || 0) / 30) > ((a?.weight || 0) * (1 + (a?.reps || 0) / 30)) ? q : a), null);
    } else best = work[0] || e.sets[0];
    return `<div class="wc-ex"><span>${e.sets.length} × ${esc(e.name)}</span><span class="muted">${best ? esc(fmtSet(best, x?.type)) : ''}</span></div>`;
  }).join('');
  const more = w.exercises.length > 4 ? `<div class="wc-more">+ ${w.exercises.length - 4} weitere Übung${w.exercises.length - 4 > 1 ? 'en' : ''}</div>` : '';
  return `<a class="card workout-card" href="#/w/${esc(w.id)}">
    <div class="wc-head">
      <div><div class="wc-title">${esc(w.title)}</div><div class="wc-date">${esc(fmtRelDay(w.start))} · ${esc(fmtTime(w.start))}</div></div>
      ${prs ? `<span class="pr-pill">${icon('trophy', 'xs')} ${prs} PR${prs > 1 ? 's' : ''}</span>` : ''}
    </div>
    <div class="wc-stats">
      <div><small>Dauer</small><b>${fmtDurShort(s.duration)}</b></div>
      <div><small>Volumen</small><b>${fmtVolume(s.volume)}</b></div>
      <div><small>Sätze</small><b>${s.sets ?? 0}</b></div>
    </div>
    <div class="wc-list">${list}${more}</div>
  </a>`;
}

export function kpi(label, value, delta, iconName) {
  let d = '';
  if (delta != null && isFinite(delta)) {
    const cls = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat';
    const arrow = delta > 0.5 ? '▲' : delta < -0.5 ? '▼' : '■';
    d = `<span class="delta ${cls}">${arrow} ${fmtPct(delta)}</span>`;
  }
  return `<div class="kpi">${iconName ? `<span class="kpi-ic">${icon(iconName)}</span>` : ''}<small>${esc(label)}</small><b>${value}</b>${d}</div>`;
}

// Tempo passend zur Sportart: min/km beim Laufen/Gehen, /500 m beim Rudern, /100 m beim Schwimmen, sonst km/h
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
export function fmtSpeed(name, kmh) {
  if (!kmh) return '–';
  const k = cardioKind(name, 'cardio');
  if (['run', 'sprint', 'walk', 'hike', 'elliptical'].includes(k)) return `${mmss(3600 / kmh)} /km`;
  if (k === 'row') return `${mmss(1800 / kmh)} /500 m`;
  if (k === 'swim') return `${mmss(360 / kmh)} /100 m`;
  return `${num(kmh, 1)} km/h`;
}
export function prValue(p) {
  if (p.kind === 'reps') return `${num(p.value, 0)} Wdh.`;
  if (p.kind === 'distance') return `${num(p.value, 2)} km`;
  if (p.kind === 'duration') return fmtDur(p.value);
  if (p.kind === 'speed') return fmtSpeed(p.exercise, p.value);
  if (p.kind === 'volume' || p.kind === 'sessionVolume') return fmtVolume(p.value);
  return fmtKg(p.value);
}
export const prLabel = (k) => PR_LABELS[k] || k;

export const emptyState = (ic, title, text, action = '') => `<div class="empty">
  <div class="empty-ic">${icon(ic)}</div><h3>${esc(title)}</h3><p>${text}</p>${action}</div>`;
