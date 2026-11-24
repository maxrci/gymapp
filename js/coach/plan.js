// Wochenplan des AI-Coaches: wird bei jedem Öffnen aus Ziel + tatsächlichem Verlauf neu berechnet.
// Dadurch passt er sich automatisch an (Pause, krank, verpasste Einheiten, Fortschritt) – ohne neues Onboarding.

import { state, exerciseMeta } from '../store.js';
import { idx } from '../stats.js';
import { increment } from '../ai.js';
import { CARDIO } from '../programs.js';
import { cardioKind } from '../compete.js';
import { DAY, startOfWeek, startOfDay, addDays, weekday, num } from '../utils.js';
import { SPLITS, activeSplit } from './splits.js';
import { FAM, familyOf, pickFromFamily } from './similar.js';
import {
  coachData, goalW, goalC, SPORTS, currentE1rm, cardioBaseline, sportSessions, weekIndex, totalWeeks,
  breakInfo, fmtPace, fmtHms,
} from './core.js';
import { predictTime, peakLong } from './assess.js';

const weekKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const roundTo = (v, s) => Math.round(v / s) * s;
const r05 = (v) => Math.max(0.5, Math.round(v * 2) / 2);

// ---------- Workouts klassifizieren ----------
const isGym = (w) => (idx().wStats.get(w.id)?.volume || 0) > 0 || w.exercises.some((e) => {
  const t = exerciseMeta(e.name).type;
  return (t === 'bodyweight' || t === 'weighted_bw') && e.sets.some((s) => s.reps);
});
function cardioOf(w, sport) {
  const S = SPORTS[sport];
  let km = 0, sec = 0, hit = false;
  for (const e of w.exercises) {
    const x = idx().ex.get(e.name);
    const k = cardioKind(e.name, x?.type || exerciseMeta(e.name).type);
    if (!k || !S.kinds.includes(k)) continue;
    hit = true;
    for (const s of e.sets) { km += s.distance || 0; sec += s.duration || 0; }
  }
  return hit ? { km, sec } : null;
}

// ---------- Phase (Periodisierung) ----------
export function gymPhase(g, week) {
  const wi = weekIndex(g, week), W = totalWeeks(g);
  const L = g.level === 'beginner' ? 6 : 4;
  const pos = wi % L;
  if (g.type === 'orm' && W >= 6 && wi === W - 1) return { wi, W, kind: 'test', label: 'Testwoche', text: 'Leichter Wochenstart, dann dein 1RM-Versuch' };
  if (g.type === 'orm' && W >= 6 && wi === W - 2) return { wi, W, kind: 'peak', label: 'Spitze', text: 'Schwere Doppel – der Körper gewöhnt sich ans Maximalgewicht' };
  if (wi >= W) return { wi, W, kind: 'after', label: 'Ziel-Zeitraum vorbei', text: 'Der Plan läuft weiter – setz dir gern ein neues Ziel' };
  if (pos === L - 1 && wi > 0) return { wi, W, kind: 'deload', label: 'Entlastungswoche', text: 'Weniger Sätze, leichter – danach geht es stärker weiter' };
  return { wi, W, kind: 'build', pos: pos % 3, label: `Aufbau ${pos + 1}/${L - 1}`, text: ['Locker starten, Technik sauber', 'Etwas schwerer', 'Schwerste Woche des Blocks'][pos % 3] };
}

// Wiederholungen & Reserve (RIR = Wiederholungen im Tank) nach Ziel, Rolle und Phase
function scheme(g, role, ph) {
  const p = ph.kind === 'build' ? ph.pos : 0;
  const T = {
    orm: { main: [6, 5, 4], acc: [10, 9, 8] },
    strength: { main: [8, 6, 5], acc: [10, 10, 8] },
    muscle: { main: [10, 9, 8], acc: [12, 12, 10] },
    bw: g.target < (g.current || 0) ? { main: [8, 6, 6], acc: [12, 10, 10] } : { main: [10, 9, 8], acc: [12, 12, 10] },
  }[g.type] || { main: [8, 6, 5], acc: [10, 10, 8] };
  const reps = T[role === 'main' ? 'main' : 'acc'][p];
  let rir = [3, 2, 1][p];
  let setsDelta = 0;
  if (ph.kind === 'deload') { rir = 4; setsDelta = -1; }
  if (ph.kind === 'after') rir = 2;
  return { reps, rir, setsDelta };
}

// ---------- Gewichte vorschlagen ----------
function lastTop(x) {
  const ses = x?.sessions.slice(-1)[0];
  if (!ses) return null;
  const ws = ses.sets.filter((s) => s.type !== 'warmup' && s.reps);
  if (!ws.length) return null;
  const top = Math.max(...ws.map((s) => s.weight || 0));
  return { weight: top, reps: Math.max(...ws.filter((s) => (s.weight || 0) === top).map((s) => s.reps)), date: ses.date };
}
const defInc = (name) => (/langhantel|smith|sz/i.test(name) ? 2.5 : /kurzhantel/i.test(name) ? 2 : 5);

export function prescribe(name, { sets, reps, rir, role }, ctx) {
  const x = idx().ex.get(name);
  const type = x?.type || exerciseMeta(name).type;
  const brk = ctx.brk;
  const back = brk.returning;
  if (back) { rir += 1; sets = Math.max(2, sets - 1); }
  const why = [];
  if (back) why.push(`Wiedereinstieg nach ${Math.round(brk.days)} Tagen – höchstens so schwer wie zuletzt`);
  let base = back ? '' : ctx.reason;
  const out = (list, label) => ({ name, sets: list, label, reason: [...why, base].filter(Boolean).join(' · ') || 'Nach Plan' });

  if (type === 'duration') {
    const best = x ? Math.max(0, ...x.sessions.slice(-4).flatMap((s) => s.sets.map((q) => q.duration || 0))) : 0;
    const d = best ? Math.max(20, roundTo(best * (back ? 0.8 : 1.05), 5)) : 40;
    return out(Array.from({ length: sets }, () => ({ type: 'normal', duration: d })), `${sets} × ${d} s`);
  }
  if (type === 'bodyweight') {
    const best = x ? Math.max(0, ...x.sessions.filter((s) => s.date > Date.now() - 42 * DAY).map((s) => s.maxReps)) : 0;
    const r = best ? Math.max(3, best - rir + (back ? -1 : 1)) : reps;
    return out(Array.from({ length: sets }, () => ({ type: 'normal', reps: r })), `${sets} × ${r} Wdh.`);
  }
  const inc = x ? increment(x) : defInc(name);
  const e = currentE1rm(name);
  if (!e) {
    why.push(`Gewicht wählen: noch ${rir} Wdh. im Tank`);
    base = '';
    return out(Array.from({ length: sets }, () => ({ type: 'normal', reps })), `${sets} × ${reps} Wdh.`);
  }
  const bw = type === 'weighted_bw' ? (state.settings.bodyweight || 0) : 0;
  let f = 1;
  if (back) f = brk.days >= 28 ? 0.8 : brk.days >= 14 ? 0.9 : 0.95;
  const exDays = x?.last ? (Date.now() - x.last) / DAY : 0;
  if (!back && exDays > 21) { f = exDays > 42 ? 0.85 : 0.92; why.push(`${Math.round(exDays)} Tage nicht gemacht – etwas leichter`); }
  let w = (e * f) / (1 + (reps + rir) / 30) - bw;
  const lt = lastTop(x);
  if (lt && lt.weight > 0) {
    if (back) w = Math.min(w, lt.weight);
    else w = Math.min(w, lt.weight + (reps <= lt.reps ? 2 : 1) * inc);
  }
  w = Math.max(0, roundTo(w, inc));
  const list = [];
  if (role === 'main' && type === 'weight' && w >= 40) list.push({ type: 'warmup', weight: roundTo(w * 0.5, inc), reps: 8 }, { type: 'warmup', weight: roundTo(w * 0.75, inc), reps: 4 });
  for (let i = 0; i < sets; i++) list.push({ type: 'normal', weight: w, reps });
  const wl = type === 'weighted_bw' ? (w ? `+${num(w)} kg` : 'Eigengewicht') : `${num(w)} kg`;
  return out(list, `${sets} × ${reps} · ${wl}`);
}

// ---------- Gym-Einheiten einer Woche ----------
export const slotKey = (split, dayId, i) => `${split}:${dayId}:${i}`;

function buildGymSession(g, split, day, ph, ctx) {
  const swaps = coachData().swaps || {};
  const used = new Set();
  const goalFam = g.type === 'orm' ? familyOf(g.exercise)?.id : null;
  let goalPlaced = false;
  const exercises = [];
  day.slots.forEach((sl, i) => {
    const key = slotKey(split, day.id, i);
    let name, isGoal = false;
    if (goalFam && sl.fam === goalFam && !goalPlaced) { name = g.exercise; isGoal = true; goalPlaced = true; }
    else name = swaps[key] && !used.has(swaps[key]) ? swaps[key] : pickFromFamily(sl.fam, used);
    used.add(name);
    const role = isGoal ? 'main' : sl.role;
    const sc = scheme(g, role, ph);
    let sets = Math.max(2, sl.sets + sc.setsDelta);
    let reps = sc.reps, rir = sc.rir;
    let reason = `${ph.label} · ${rir} Wdh. Reserve`;
    if (isGoal && ph.kind === 'peak') { sets = 4; reps = 2; rir = 1; reason = 'Spitze: schwere Doppel'; }
    const p = prescribe(name, { sets, reps, rir, role }, { ...ctx, reason });
    if (isGoal && ph.kind === 'test') {
      const e = currentE1rm(name);
      const inc = idx().ex.get(name) ? increment(idx().ex.get(name)) : 2.5;
      const t = Math.max(g.target, roundTo(e, inc));
      p.sets = [
        { type: 'warmup', weight: roundTo(t * 0.5, inc), reps: 5 }, { type: 'warmup', weight: roundTo(t * 0.7, inc), reps: 3 },
        { type: 'warmup', weight: roundTo(t * 0.85, inc), reps: 1 }, { type: 'normal', weight: roundTo(t * 0.93, inc), reps: 1 },
        { type: 'normal', weight: g.target, reps: 1 },
      ];
      p.label = `1RM-Versuch: ${num(g.target)} kg`;
      p.reason = 'Testtag! Nur mit Sicherung/Spotter, 3–5 min Pause zwischen den schweren Versuchen';
    }
    exercises.push({ ...p, slot: key, fam: sl.fam, famLabel: FAM[sl.fam]?.label || '', goal: isGoal, role });
  });
  // 1RM-Ziel für eine Übung ohne passenden Slot: vorne einbauen
  if (g.type === 'orm' && !goalPlaced && ctx.addGoal) {
    const sc = scheme(g, 'main', ph);
    const p = prescribe(g.exercise, { sets: 4 + sc.setsDelta, reps: sc.reps, rir: sc.rir, role: 'main' }, { ...ctx, reason: `${ph.label} · Zielübung` });
    exercises.unshift({ ...p, slot: null, fam: goalFam, famLabel: '', goal: true, role: 'main' });
  }
  return { kind: 'gym', dayId: day.id, title: day.name, legs: !!day.legs, exercises, sub: `${exercises.length} Übungen` };
}

function gymSessions(g, week, ctx) {
  const split = activeSplit(g);
  const days = SPLITS[split].days;
  const ph = gymPhase(g, week);
  const gs = startOfWeek(g.start);
  const before = idx().asc.filter((w) => w.start >= gs && w.start < week && isGym(w)).length;
  const goalFam = g.type === 'orm' ? familyOf(g.exercise)?.id : null;
  const hasSlot = goalFam && days.some((d) => d.slots.some((s) => s.fam === goalFam));
  const list = [];
  for (let i = 0; i < g.perWeek; i++) {
    const day = days[(before + i) % days.length];
    const addGoal = g.type === 'orm' && !hasSlot && (i === 0 || i === Math.floor(g.perWeek / 2)) && i < g.perWeek;
    list.push({ ...buildGymSession(g, split, day, ph, { ...ctx, addGoal }), id: `g:${weekKey(week)}:${i}` });
  }
  return { list, phase: ph, split };
}

// ---------- Cardio-Einheiten einer Woche ----------
export function cardioPhase(g, week) {
  const wi = weekIndex(g, week), W = totalWeeks(g);
  if (wi >= W) return { wi, W, kind: 'after', label: 'Ziel-Zeitraum vorbei' };
  if (wi === W - 1) return { wi, W, kind: 'goal', label: 'Zielwoche' };
  if (W >= 6 && wi === W - 2) return { wi, W, kind: 'taper', label: 'Kraft tanken' };
  if (wi % 4 === 3) return { wi, W, kind: 'deload', label: 'Entlastungswoche' };
  return { wi, W, kind: 'build', label: `Aufbau ${wi + 1}/${W}` };
}

// geplante Länge der langen Einheit (Kurve ab Start) – an echte Einheiten angepasst
function longKm(g, week, ph, brk) {
  const peak = peakLong(g);
  const start = g.baseline?.km || g.distance * (g.level === 'beginner' ? 0.3 : g.level === 'inter' ? 0.45 : 0.6);
  const curve = (wi) => {
    if (wi % 4 === 3) return curve(wi - 1) * 0.8;
    const eff = wi - Math.floor(wi / 4);
    return Math.min(peak, start * 1.1 ** eff);
  };
  let km = curve(Math.min(ph.wi, ph.W - 2));
  const ses = sportSessions(g.sport).filter((s) => s.km > 0 && s.date < week);
  const recent = ses.filter((s) => s.date >= week - 14 * DAY);
  const lastLong = ses.length ? Math.max(...ses.slice(-6).map((s) => s.km)) : 0;
  if (recent.length) km = Math.min(km, Math.max(...recent.map((s) => s.km)) * 1.15);
  else if (ses.length && ph.wi > 0) km = Math.min(km, lastLong * 0.75);
  if (brk.returning && lastLong) km = Math.min(km, lastLong * 0.75);
  if (ph.kind === 'taper') km *= 0.75;
  if (ph.kind === 'after') km = peak * 0.8;
  return Math.max(SPORTS[g.sport].minEasy, Math.min(peak, km));
}

const QUALITY_PROG = { interval: 'hiit44', tempo: 'tempo' };
function cardioSessions(g, week, ctx) {
  const S = SPORTS[g.sport];
  const ph = cardioPhase(g, week);
  const brk = ctx.brk;
  const live = { ...g, baseline: cardioBaseline(g.sport) || g.baseline };
  const vNow = g.distance / (predictTime(live) / 3600);
  const vGoal = g.time ? g.distance / (g.time / 3600) : null;
  const easyV = vNow * 0.9;
  const long = longKm(g, week, ph, brk);
  const n = g.perWeek;
  const mk = (type, title, km, v, desc, extra = {}) => ({ kind: 'cardio', sport: g.sport, type, title, km: r05(km), sec: Math.round((r05(km) / v) * 3600 / 60) * 60, speed: v, desc, ...extra });
  const easy = (f = 0.5) => {
    const km = Math.max(S.minEasy, long * f);
    return mk('easy', 'Locker', km, easyV, `Ganz entspannt in Zone 2 (${fmtPace(g.sport, easyV)}) – du kannst dich noch unterhalten.`, { zone: 2 });
  };
  const longS = () => mk('long', 'Lange Einheit', long, easyV * 0.97, `Ruhig und gleichmäßig (${fmtPace(g.sport, easyV * 0.97)}). Ziel: ankommen, nicht rasen.`, { zone: 2 });
  const quality = () => {
    const t = ph.wi % 2 ? 'tempo' : 'interval';
    const v = (vGoal || vNow * 1.05);
    const wu = Math.min(3, Math.max(1.5, long * 0.3)); // Ein- und Auslaufen zusammen
    if (g.sport === 'run') {
      if (t === 'interval') {
        const big = g.distance >= 10;
        const reps = Math.min(big ? 8 : 10, (big ? 4 : 6) + Math.floor(ph.wi / 2));
        const rep = big ? 1 : 0.4;
        const pv = v * 1.05;
        const km = reps * rep + reps * 0.25 + wu;
        return mk('interval', 'Intervalle', km, vNow, `${reps} × ${big ? '1 km' : '400 m'} in ${fmtPace('run', pv)}, dazwischen 2 min locker traben. Davor und danach locker ein- und auslaufen.`, { zone: 4 });
      }
      const min = Math.min(40, 15 + ph.wi * 2.5, Math.max(12, ((long * 0.6) / v) * 60));
      const pv = v * (g.distance >= 21 ? 1.03 : 1);
      return mk('tempo', 'Tempo', (min / 60) * pv + wu, vNow, `${Math.round(min)} min zügig in ${fmtPace('run', pv)} (Zone 3–4), davor und danach locker ein- und auslaufen.`, { zone: 3 });
    }
    if (g.sport === 'walk') return mk('easy', 'Zügig', Math.max(S.minEasy, long * 0.5), easyV * 1.1, 'Flott gehen, gern mit Steigung – leicht außer Atem.', { zone: 3 });
    const prog = CARDIO.find((p) => p.id === QUALITY_PROG[t]);
    const sec = prog.build(prog.def).reduce((a, p) => a + p.dur, 0);
    const km = (sec / 3600) * vNow;
    return mk(t, t === 'interval' ? 'Intervalle' : 'Tempo', km, vNow, `${prog.title}: ${prog.desc}`, { zone: t === 'interval' ? 4 : 3, program: prog.id });
  };
  const noQuality = brk.returning || ph.kind === 'deload' || ph.kind === 'goal';
  const q = () => (noQuality ? easy(0.45) : quality());
  let list;
  if (ph.kind === 'goal') {
    const goal = mk('goal', 'Zieleinheit', g.distance, vGoal || vNow, `Dein Ziel: ${num(g.distance, 1)} km${g.time ? ` in ${fmtHms(g.time)} (${fmtPace(g.sport, vGoal)})` : ''}. Locker beginnen, am Ende alles geben!`, { zone: 3 });
    list = [...Array.from({ length: Math.max(0, n - 1) }, (_, i) => easy(i === 0 ? 0.35 : 0.25)), goal];
  } else if (n === 1) list = [longS()];
  else if (n === 2) list = [q(), longS()];
  else if (n === 3) list = [easy(), q(), longS()];
  else if (n === 4) list = [easy(), q(), easy(0.4), longS()];
  else list = [easy(), q(), easy(0.4), ...Array.from({ length: n - 4 }, (_, i) => (i === 0 && n >= 6 && g.level === 'adv' && !noQuality ? quality() : easy(0.35))), longS()];
  list.forEach((s, i) => { s.id = `c:${weekKey(week)}:${i}`; s.sub = `${S.label} · ${num(s.km, 1)} km · ca. ${fmtHms(s.sec)}`; });
  return { list, phase: ph, long };
}

// ---------- Woche zusammensetzen ----------
// gleichmäßig auf freie Tage verteilen (Mo-Mi-Fr bei 3 von 7)
function spread(k, avail) {
  const out = [];
  if (!avail.length) return Array(k).fill(6);
  for (let j = 0; j < k; j++) out.push(avail[Math.floor((j * avail.length) / k) % avail.length]);
  return out;
}

export function weekPlan(week = startOfWeek(Date.now())) {
  const gw = goalW(), gc = goalC();
  const now = Date.now();
  const thisWeek = startOfWeek(now);
  const brk = breakInfo(week === thisWeek ? now : week);
  const ctx = { brk };
  const C = coachData();
  const res = { week, sessions: [], extras: [], days: Array.from({ length: 7 }, () => []), notes: [], gym: null, cardio: null };
  if (gw && week >= startOfWeek(gw.start)) { res.gym = gymSessions(gw, week, ctx); res.sessions.push(...res.gym.list); }
  if (gc && week >= startOfWeek(gc.start)) { res.cardio = cardioSessions(gc, week, ctx); res.sessions.push(...res.cardio.list); }
  if (!res.sessions.length) return res;
  if (brk.returning && week >= thisWeek) res.notes.push(`Willkommen zurück! Nach ${Math.round(brk.days)} Tagen Pause startet der Plan etwas leichter – gleich viel oder weniger Gewicht als zuletzt, weniger Umfang.`);

  // erledigte Workouts dieser Woche zuordnen
  const ws = idx().asc.filter((w) => w.start >= week && w.start < addDays(week, 7));
  const open = new Set(res.sessions);
  const take = (s, w) => { s.done = w; s.day = weekday(w.start); open.delete(s); };
  for (const w of ws) {
    const s = w.planId && res.sessions.find((x) => x.id === w.planId && open.has(x));
    if (s) take(s, w);
  }
  for (const w of ws) {
    if (w.planId && res.sessions.some((x) => x.done === w)) continue;
    if (gc) {
      const c = cardioOf(w, gc.sport);
      if (c) {
        const cands = [...open].filter((s) => s.kind === 'cardio');
        const pick = cands.find((s) => (s.type === 'long' || s.type === 'goal') && c.km >= s.km * 0.75) || cands.find((s) => s.type !== 'long' && s.type !== 'goal') || cands[0];
        if (pick) { take(pick, w); continue; }
      }
    }
    if (gw && isGym(w)) {
      const fams = new Set(w.exercises.map((e) => familyOf(e.name)?.id).filter(Boolean));
      const cands = [...open].filter((s) => s.kind === 'gym');
      if (cands.length) {
        cands.sort((a, b) => b.exercises.filter((e) => fams.has(e.fam)).length - a.exercises.filter((e) => fams.has(e.fam)).length);
        take(cands[0], w);
        continue;
      }
    }
    res.extras.push({ w, day: weekday(w.start) });
  }

  // offene Einheiten auf Tage verteilen
  const skips = C.skips || {};
  const moves = C.moves || {};
  const todayIdx = week === thisWeek ? weekday(now) : week > thisWeek ? 0 : 7;
  const busy = new Set([...res.sessions.filter((s) => s.done).map((s) => s.day), ...res.extras.map((e) => e.day)]);
  for (const s of res.sessions) {
    if (s.done) { s.status = 'done'; continue; }
    if (skips[s.id]) { s.status = 'skipped'; s.day = moves[s.id] ?? null; continue; }
    if (week < thisWeek) { s.status = 'missed'; s.day = null; continue; }
    s.status = 'open';
  }
  const pending = res.sessions.filter((s) => s.status === 'open');
  for (const s of pending) if (moves[s.id] != null && moves[s.id] >= todayIdx) { s.day = moves[s.id]; s.moved = true; busy.add(s.day); }
  const free = pending.filter((s) => !s.moved);
  // Reihenfolge: Gym und Cardio abwechseln, lange Einheit/Ziel zuletzt
  const gymQ = free.filter((s) => s.kind === 'gym');
  const cQ = free.filter((s) => s.kind === 'cardio' && s.type !== 'long' && s.type !== 'goal');
  const tail = free.filter((s) => s.type === 'long' || s.type === 'goal');
  const order = [];
  while (gymQ.length || cQ.length) { if (gymQ.length) order.push(gymQ.shift()); if (cQ.length) order.push(cQ.shift()); }
  order.push(...tail);
  let avail = [];
  for (let d = Math.min(todayIdx, 7); d < 7; d++) if (!busy.has(d)) avail.push(d);
  if (!avail.length && todayIdx < 7) avail = [Math.max(todayIdx, 0)];
  if (order.length <= avail.length) {
    spread(order.length, avail).forEach((d, i) => { order[i].day = d; });
  } else {
    // mehr Einheiten als Tage: Gym + Cardio teilen sich einen Tag
    avail.forEach((d, i) => { order[i].day = d; });
    order.slice(avail.length).forEach((s, i) => {
      const other = order.slice(0, avail.length).filter((o) => o.kind !== s.kind && !order.slice(avail.length, avail.length + i).some((x) => x.day === o.day));
      s.day = (other[0] || order[i % avail.length]).day;
    });
  }
  // kein schwerer Beintag direkt vor der langen Einheit
  const longS = res.sessions.find((s) => (s.type === 'long' || s.type === 'goal') && s.status === 'open');
  if (longS) {
    const legDay = free.find((s) => s.kind === 'gym' && s.legs && s.day === longS.day - 1);
    const swap = legDay && free.find((s) => s.kind === 'gym' && !s.legs && s.day !== longS.day - 1);
    if (swap) [legDay.day, swap.day] = [swap.day, legDay.day];
  }
  for (const s of res.sessions) if (s.day != null) res.days[s.day].push(s);
  for (const e of res.extras) res.days[e.day].push({ extra: true, w: e.w });
  res.days.forEach((d) => d.sort((a, b) => (a.kind === 'gym' ? 0 : 1) - (b.kind === 'gym' ? 0 : 1)));
  res.total = res.sessions.length;
  res.doneCount = res.sessions.filter((s) => s.status === 'done').length;
  return res;
}

// Einheit für heute bzw. die nächste offene
export function nextSession(plan = weekPlan()) {
  const today = weekday(Date.now());
  const open = plan.sessions.filter((s) => s.status === 'open').sort((a, b) => a.day - b.day);
  return open.find((s) => s.day >= today) || open[0] || null;
}
export const findSession = (id) => {
  const m = /^[gc]:(\d{4})(\d{2})(\d{2}):/.exec(id || '');
  if (!m) return null;
  const week = startOfDay(new Date(+m[1], +m[2] - 1, +m[3]).getTime());
  return weekPlan(week).sessions.find((s) => s.id === id) || null;
};
