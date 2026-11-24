// Laufende Bewertung: Fortschritt zum Ziel, Ziel erreicht, Ziel wackelt (neu einordnen mit Vorschlag)

import { bwNow } from '../body.js';
import { startOfWeek, fmtKg, num } from '../utils.js';
import {
  goalW, goalC, coachData, SPORTS, currentE1rm, cardioBaseline, sportSessions, weekIndex, totalWeeks, fmtHms,
} from './core.js';
import { assessWorkout, assessCardio, predictTime } from './assess.js';

const clamp = (v) => Math.max(0, Math.min(1, v));
const RANK = { done: 0, easy: 0, ok: 1, info: 1, ambitious: 2, unrealistic: 3 };

export function progressWorkout(g) {
  const wi = weekIndex(g), W = totalWeeks(g);
  if (g.type === 'orm') {
    const cur = currentE1rm(g.exercise) || g.current || 0;
    const c0 = g.current || cur;
    return { cur, pct: g.target > c0 ? clamp((cur - c0) / (g.target - c0)) : cur >= g.target ? 1 : 0, text: `${fmtKg(cur)} von ${fmtKg(g.target)} (geschätztes 1RM)`, reached: cur >= g.target, wi, W };
  }
  if (g.type === 'bw') {
    const cur = bwNow() || g.current || 0;
    const c0 = g.current || cur;
    const lose = g.target < c0;
    const reached = lose ? cur <= g.target : cur >= g.target;
    return { cur, pct: c0 !== g.target ? clamp((cur - c0) / (g.target - c0)) : 1, text: `${fmtKg(cur)} → Ziel ${fmtKg(g.target)}`, reached, wi, W };
  }
  return { pct: clamp(wi / W), text: `Woche ${Math.min(wi + 1, W)} von ${W}`, reached: false, wi, W };
}

export function progressCardio(g) {
  const wi = weekIndex(g), W = totalWeeks(g);
  const ses = sportSessions(g.sport).filter((s) => s.date >= startOfWeek(g.start) && s.km > 0);
  const longest = ses.length ? Math.max(...ses.map((s) => s.km)) : (g.baseline?.km || 0);
  const live = { ...g, baseline: cardioBaseline(g.sport) || g.baseline };
  const pred = predictTime(live);
  const reached = ses.some((s) => s.km >= g.distance * 0.98 && (!g.time || (s.sec && s.sec * (g.distance / s.km) <= g.time * 1.005)));
  const pd = clamp(longest / g.distance);
  const pt = g.time ? clamp(g.time / pred) : pd;
  return {
    longest, pred, reached, wi, W, pct: reached ? 1 : Math.min(pd, pt) * 0.98,
    text: `Längste Einheit: ${num(longest, 1)} von ${num(g.distance, 1)} km${g.time ? ` · Prognose ${fmtHms(pred)} (Ziel ${fmtHms(g.time)})` : ''}`,
  };
}

// Hinweise, die der Coach von sich aus zeigt
export function reviewGoals() {
  const out = [];
  const C = coachData();
  const wk = startOfWeek(Date.now());
  const dismissed = C.dismiss || {};
  const gw = goalW();
  if (gw) {
    const p = progressWorkout(gw);
    if (p.reached) out.push({ kind: 'workout', type: 'reached', key: `workout:reached:${gw.start}`, text: gw.type === 'orm' ? `Ziel erreicht: ${gw.exercise} mit ${fmtKg(p.cur)} geschätztem 1RM!` : `Zielgewicht erreicht: ${fmtKg(p.cur)}!`, proposals: [] });
    else if (p.wi >= 2 && (gw.type === 'orm' || gw.type === 'bw')) {
      const a = assessWorkout({ ...gw, start: Date.now(), current: p.cur });
      if (RANK[a.verdict] >= 2 && RANK[a.verdict] > (RANK[gw.verdict] ?? 1)) out.push({ kind: 'workout', type: 'drift', key: `workout:drift:${wk}`, verdict: a.verdict, text: `Dein Ziel wackelt: Nach aktuellem Stand ist es ${a.verdict === 'unrealistic' ? 'kaum noch' : 'nur knapp'} bis zum Termin zu schaffen.`, lines: a.lines, proposals: a.proposals });
    }
  }
  const gc = goalC();
  if (gc) {
    const p = progressCardio(gc);
    if (p.reached) out.push({ kind: 'cardio', type: 'reached', key: `cardio:reached:${gc.start}`, text: `Ziel erreicht: ${num(gc.distance, 1)} km ${SPORTS[gc.sport].label}${gc.time ? ` in unter ${fmtHms(gc.time)}` : ''}!`, proposals: [] });
    else if (p.wi >= 2) {
      const live = cardioBaseline(gc.sport);
      const a = assessCardio({ ...gc, start: Date.now(), baseline: live || gc.baseline });
      if (RANK[a.verdict] >= 2 && RANK[a.verdict] > (RANK[gc.verdict] ?? 1)) out.push({ kind: 'cardio', type: 'drift', key: `cardio:drift:${wk}`, verdict: a.verdict, text: 'Dein Cardio-Ziel wackelt: Nach den letzten Wochen wird es eng bis zum Termin.', lines: a.lines, proposals: a.proposals });
    }
  }
  return out.filter((r) => !dismissed[r.key]);
}
