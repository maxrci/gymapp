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
  coachData, goalW, goalC, SPORTS, ALT, timeFactor, currentE1rm, cardioBaseline, sportSessions, weekIndex, totalWeeks,
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
  const S = ALT[sport];
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
export const dayKey = (split, dayId) => `${split}:${dayId}`;
export const LEG_FAMS = ['squat', 'hinge', 'lunge', 'legcurl', 'legext', 'glute'];
const LEG_SPORTS = ['run', 'walk', 'bike', 'skate', 'row'];

function buildGymSession(g, split, day, ph, ctx) {
  const C = coachData();
  const swaps = C.swaps || {};
  const removed = C.removed || {};
  const used = new Set();
  const cl = ctx.cardioLoad;
  const goalFam = g.type === 'orm' ? familyOf(g.exercise)?.id : null;
  let goalPlaced = false;
  const exercises = [];
  day.slots.forEach((sl, i) => {
    const key = slotKey(split, day.id, i);
    let name, isGoal = false;
    if (goalFam && sl.fam === goalFam && !goalPlaced) { name = g.exercise; isGoal = true; goalPlaced = true; }
    else if (removed[key]) return;
    else name = swaps[key] && !used.has(swaps[key]) ? swaps[key] : pickFromFamily(sl.fam, used);
    used.add(name);
    const role = isGoal ? 'main' : sl.role;
    const sc = scheme(g, role, ph);
    let sets = Math.max(2, sl.sets + sc.setsDelta);
    let reps = sc.reps, rir = sc.rir;
    let reason = `${ph.label} · ${rir} Wdh. Reserve`;
    // Abstimmung mit dem Cardio-Plan: Beine nicht doppelt belasten
    if (cl && LEG_FAMS.includes(sl.fam)) {
      if (cl.phase === 'goal' || cl.phase === 'taper') { sets = Math.max(2, sets - 1); rir += 2; reason = `${cl.phase === 'goal' ? 'Cardio-Zielwoche' : 'Cardio-Formaufbau'}: Beine schonen`; }
      else if (cl.high) { sets = Math.max(2, sets - 1); reason += ' · 1 Satz weniger (Cardio-Training)'; }
    }
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
  // eigene Übungen, die du zu dieser Einheit hinzugefügt hast
  (C.added?.[dayKey(split, day.id)] || []).forEach((name, i) => {
    if (used.has(name)) return;
    used.add(name);
    const sc = scheme(g, 'acc', ph);
    const p = prescribe(name, { sets: Math.max(2, 3 + sc.setsDelta), reps: sc.reps, rir: sc.rir, role: 'acc' }, { ...ctx, reason: `${ph.label} · ${sc.rir} Wdh. Reserve` });
    exercises.push({ ...p, slot: `${dayKey(split, day.id)}:+${i}`, added: true, fam: familyOf(name)?.id || null, famLabel: '', goal: false, role: 'acc' });
  });
  const removedCount = day.slots.filter((_, i) => removed[slotKey(split, day.id, i)]).length;
  // 1RM-Ziel für eine Übung ohne passenden Slot: vorne einbauen
  if (g.type === 'orm' && !goalPlaced && ctx.addGoal) {
    const sc = scheme(g, 'main', ph);
    const p = prescribe(g.exercise, { sets: 4 + sc.setsDelta, reps: sc.reps, rir: sc.rir, role: 'main' }, { ...ctx, reason: `${ph.label} · Zielübung` });
    exercises.unshift({ ...p, slot: null, fam: goalFam, famLabel: '', goal: true, role: 'main' });
  }
  return { kind: 'gym', dayId: day.id, split, title: day.name, legs: !!day.legs, exercises, removedCount, sub: `${exercises.length} Übungen` };
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
  const ses = equivSessions(g).filter((s) => s.km > 0 && s.date < week);
  const recent = ses.filter((s) => s.date >= week - 14 * DAY);
  const lastLong = ses.length ? Math.max(...ses.slice(-6).map((s) => s.km)) : 0;
  if (recent.length) km = Math.min(km, Math.max(...recent.map((s) => s.km)) * 1.15);
  else if (ses.length && ph.wi > 0) km = Math.min(km, lastLong * 0.75);
  if (brk.returning && lastLong) km = Math.min(km, lastLong * 0.75);
  if (ph.kind === 'taper') km *= 0.75;
  if (ph.kind === 'after') km = peak * 0.8;
  return Math.max(SPORTS[g.sport].minEasy, Math.min(peak, km));
}

// Einheiten aller Geräte, umgerechnet in Strecke der Ziel-Sportart (über die Zeit bei lockerem Tempo)
function equivSessions(g) {
  const easyV = SPORTS[g.sport].speed[g.level || 'inter'] * 0.85;
  const out = sportSessions(g.sport).map((s) => ({ date: s.date, km: s.km }));
  for (const sp of Object.keys(ALT)) {
    if (sp === g.sport) continue;
    for (const s of sportSessions(sp)) if (s.sec >= 1200) out.push({ date: s.date, km: (s.sec / timeFactor(g.sport, sp) / 3600) * easyV });
  }
  return out.sort((a, b) => a.date - b.date);
}

// Geplante Cardio-Einheit auf ein anderes Gerät umrechnen: gleiche Zone, gleicher Reiz, Dauer passend zum Gerät
const ZONE_SPEED = { 2: 0.85, 3: 1, 4: 1.05 };
export function substitute(s, alt, g) {
  const A = ALT[alt];
  const f = timeFactor(s.sport, alt);
  const sec = Math.max(600, Math.round((s.sec * f) / 60) * 60);
  const kmh = A.noKm ? 0 : A.speed[g.level || 'inter'] * (ZONE_SPEED[s.zone] || 0.85);
  const km = kmh ? Math.round(((kmh * sec) / 3600) * 2) / 2 : 0;
  const from = `${ALT[s.sport].label} ${num(s.km, 1)} km`;
  let desc, program = null, programOpt = null;
  if (s.iv) { desc = `${s.iv.reps} × ${Math.max(1, Math.round(s.iv.repMin))} min hart (Zone 4), dazwischen ${s.iv.rest} min locker. Davor und danach je 10 min locker.`; program = 'hiit44'; }
  else if (s.tempoMin) { desc = `${Math.round(s.tempoMin * f)} min zügig (Zone 3–4), davor und danach je 10 min locker.`; program = 'tempo'; }
  else if (s.program) { desc = s.desc; program = s.program; }
  else {
    desc = `${s.type === 'long' ? 'Lang und gleichmäßig' : 'Ganz locker'} in Zone ${s.zone || 2}${kmh ? ` (ca. ${fmtPace(alt, kmh)})` : ''} – du kannst dich noch unterhalten.`;
    program = 'zone2';
    programOpt = [20, 30, 45, 60].reduce((a, b) => (Math.abs(b - sec / 60) < Math.abs(a - sec / 60) ? b : a));
  }
  desc += ` Gleicher Trainingsreiz wie ${from}.`;
  return {
    sport: alt, km, sec, desc, program: A.device ? program : null, programOpt, swappedFrom: s.sport,
    sub: `${A.label} · ${km ? `~${num(km, 1)} km · ` : ''}ca. ${fmtHms(sec)} · statt ${from}`,
  };
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
        return mk('interval', 'Intervalle', km, vNow, `${reps} × ${big ? '1 km' : '400 m'} in ${fmtPace('run', pv)}, dazwischen 2 min locker traben. Davor und danach locker ein- und auslaufen.`, { zone: 4, iv: { reps, repMin: (rep / pv) * 60, rest: 2 } });
      }
      const min = Math.min(40, 15 + ph.wi * 2.5, Math.max(12, ((long * 0.6) / v) * 60));
      const pv = v * (g.distance >= 21 ? 1.03 : 1);
      return mk('tempo', 'Tempo', (min / 60) * pv + wu, vNow, `${Math.round(min)} min zügig in ${fmtPace('run', pv)} (Zone 3–4), davor und danach locker ein- und auslaufen.`, { zone: 3, tempoMin: min });
    }
    if (g.sport === 'walk') return mk('easy', 'Zügig', Math.max(S.minEasy, long * 0.5), easyV * 1.1, 'Flott gehen, gern mit Steigung – leicht außer Atem.', { zone: 3 });
    const prog = CARDIO.find((p) => p.id === QUALITY_PROG[t]);
    const sec = prog.build(prog.def).reduce((a, p) => a + p.dur, 0);
    const km = (sec / 3600) * vNow;
    return mk(t, t === 'interval' ? 'Intervalle' : 'Tempo', km, vNow, `${prog.title}: ${prog.desc}`, { zone: t === 'interval' ? 4 : 3, program: prog.id });
  };
  const noQuality = brk.returning || ph.kind === 'deload' || ph.kind === 'goal' || ctx.gymTest;
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
  list.forEach((s, i) => { s.id = `c:${weekKey(week)}:${i}`; s.slot = i; s.sub = `${S.label} · ${num(s.km, 1)} km · ca. ${fmtHms(s.sec)}`; });
  // Gerät gewechselt? (nur diese Woche oder jede Woche an dieser Stelle) – Zieleinheit bleibt immer in der Ziel-Sportart
  const C = coachData();
  for (const s of list) {
    const alt = C.cswap?.[s.id] ?? C.cswapSlot?.[s.slot];
    if (!alt || alt === '__orig' || alt === s.sport || s.type === 'goal' || !ALT[alt]) continue;
    s.orig = { ...s };
    Object.assign(s, substitute(s.orig, alt, g));
  }
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

// Belastungsart: 'legs' (Beintag), 'upper' (Oberkörper), 'cHard' (lange/harte Ausdauer), 'cEasy' (locker)
function tagOf(s, gc) {
  if (s.kind === 'gym') return s.legs ? 'legs' : 'upper';
  const hard = ['long', 'interval', 'tempo', 'goal'].includes(s.type);
  return hard && LEG_SPORTS.includes(s.sport) ? 'cHard' : 'cEasy';
}
function tagOfWorkout(w, gc, longKmTarget = 10) {
  const st = idx().wStats.get(w.id);
  const m = st?.muscles || {};
  const legSets = (m.Quadrizeps || 0) + (m.Beinbeuger || 0) + (m['Gesäß'] || 0);
  if (legSets >= 5) return 'legs';
  for (const sport of gc ? [gc.sport] : ['run', 'bike']) {
    const c = cardioOf(w, sport);
    if (c && LEG_SPORTS.includes(sport) && (c.km >= Math.max(8, longKmTarget * 0.6) || c.sec >= 55 * 60)) return 'cHard';
    if (c) return 'cEasy';
  }
  return st?.volume > 0 ? 'upper' : 'cEasy';
}
const HARD = (t) => t === 'legs' || t === 'cHard';
function pairCost(a, b) {
  const k = [a, b].sort().join('+');
  return {
    'cHard+legs': 9, 'legs+legs': 10, 'cHard+cHard': 10, 'cEasy+legs': 4, 'cEasy+upper': 2.2, 'cHard+upper': 3.5,
    'upper+upper': 4, 'cEasy+cEasy': 4, 'cEasy+cHard': 3.5,
  }[k] ?? 3;
}
function dayCost(days) {
  let c = 0;
  for (let d = 0; d < 7; d++) {
    const t = days[d + 1];
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) c += pairCost(t[i], t[j]);
    if (t.length >= 3) c += 6;
    const a = days[d];
    if (!a.length || !t.length) continue;
    if (a.includes('legs') && t.includes('cHard')) c += 6;   // müde Beine vor langer/harter Einheit
    if (a.includes('cHard') && t.includes('legs')) c += 4;   // Beintag direkt nach langer/harter Einheit
    if (a.includes('cHard') && t.includes('cHard')) c += 3;
    if (a.includes('legs') && t.includes('legs')) c += 5;
    if (HARD(a[0]) && HARD(t[0]) && !(a.includes('legs') || t.includes('legs'))) c += 0.5;
    c += 0.3; // lieber Abstand lassen, wenn Tage frei sind
  }
  return c;
}
// Einheiten so auf die Tage legen, dass Kraft und Cardio zusammenpassen (Beine, Erholung, Abstand)
function schedule(free, res, { week, todayIdx, gc }) {
  const allowed = [];
  for (let d = Math.max(0, todayIdx); d < 7; d++) allowed.push(d);
  const longT = res.cardio?.long || 10;
  // feste Belastung: Erledigtes, Verschobenes, Vortag (Sonntag davor)
  const fixed = Array.from({ length: 8 }, () => []);
  const prev = idx().asc.filter((w) => w.start >= addDays(week, -1) && w.start < week);
  for (const w of prev) fixed[0].push(tagOfWorkout(w, gc, longT));
  for (const s of res.sessions) {
    if (s.status === 'done') fixed[s.day + 1].push(tagOf(s, gc));
    else if (s.status === 'open' && s.moved) fixed[s.day + 1].push(tagOf(s, gc));
  }
  for (const e of res.extras) fixed[e.day + 1].push(tagOfWorkout(e.w, gc, longT));
  const tags = free.map((s) => tagOf(s, gc));
  const cost = () => {
    const days = fixed.map((x) => [...x]);
    free.forEach((s, i) => days[s.day + 1].push(tags[i]));
    let c = dayCost(days);
    free.forEach((s) => { if ((s.type === 'long' || s.type === 'goal') && s.day < 5 && allowed.some((d) => d >= 5)) c += 0.4; });
    free.forEach((s, i) => { c += s.day * 0.01 * (HARD(tags[i]) ? 0 : 1); }); // bei Gleichstand: früher
    // Reihenfolge des Splits möglichst beibehalten (A vor B)
    const gyms = free.filter((s) => s.kind === 'gym');
    for (let i = 0; i < gyms.length; i++) for (let j = i + 1; j < gyms.length; j++) if (gyms[j].day < gyms[i].day) c += 0.25;
    return c;
  };
  // Start: gleichmäßig verteilt, Gym und Cardio abwechselnd, lange Einheit zuletzt
  const gymQ = free.filter((s) => s.kind === 'gym');
  const cQ = free.filter((s) => s.kind === 'cardio' && s.type !== 'long' && s.type !== 'goal');
  const tail = free.filter((s) => s.type === 'long' || s.type === 'goal');
  const order = [];
  while (gymQ.length || cQ.length) { if (gymQ.length) order.push(gymQ.shift()); if (cQ.length) order.push(cQ.shift()); }
  order.push(...tail);
  const emptyDays = allowed.filter((d) => !fixed[d + 1].length);
  const base = emptyDays.length >= order.length ? emptyDays : allowed;
  order.forEach((s, j) => { s.day = base[Math.floor((j * base.length) / order.length) % base.length]; });
  // verbessern: einzelne Einheiten verschieben und Paare tauschen, solange es besser wird
  let best = cost();
  for (let it = 0; it < 40; it++) {
    let improved = false;
    for (const s of free) {
      for (const d of allowed) {
        if (d === s.day) continue;
        const old = s.day; s.day = d;
        const c = cost();
        if (c < best - 1e-6) { best = c; improved = true; } else s.day = old;
      }
    }
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j];
      if (a.day === b.day) continue;
      [a.day, b.day] = [b.day, a.day];
      const c = cost();
      if (c < best - 1e-6) { best = c; improved = true; } else [a.day, b.day] = [b.day, a.day];
    }
    if (!improved) break;
  }
}

export function weekPlan(week = startOfWeek(Date.now())) {
  const gw = goalW(), gc = goalC();
  const now = Date.now();
  const thisWeek = startOfWeek(now);
  const brk = breakInfo(week === thisWeek ? now : week);
  const ctx = { brk };
  const C = coachData();
  const res = { week, sessions: [], extras: [], days: Array.from({ length: 7 }, () => []), notes: [], gym: null, cardio: null };
  const gOn = gw && week >= startOfWeek(gw.start), cOn = gc && week >= startOfWeek(gc.start);
  // beide Pläne kennen sich: Bein-Umfang bei viel Ausdauer, keine harten Cardio-Einheiten in der Kraft-Testwoche
  if (gOn && cOn && LEG_SPORTS.includes(gc.sport)) {
    const cph = cardioPhase(gc, week);
    const longGoal = gc.sport === 'run' ? gc.distance >= 15 : gc.sport === 'bike' ? gc.distance >= 80 : gc.distance >= 30;
    ctx.cardioLoad = { phase: cph.kind, high: gc.perWeek >= 3 || longGoal };
    const gph = gymPhase(gw, week);
    ctx.gymTest = gph.kind === 'test' && LEG_FAMS.includes(familyOf(gw.exercise || '')?.id);
    res.combined = true;
  }
  if (gOn) { res.gym = gymSessions(gw, week, ctx); res.sessions.push(...res.gym.list); }
  if (cOn) { res.cardio = cardioSessions(gc, week, ctx); res.sessions.push(...res.cardio.list); }
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
      const cands = [...open].filter((s) => s.kind === 'cardio');
      const sports = [...new Set([gc.sport, ...cands.map((s) => s.sport), ...Object.keys(ALT)])];
      let c = null, hit = null;
      for (const sp of sports) { c = cardioOf(w, sp); if (c) { hit = sp; break; } }
      if (c && isGym(w) && c.sec < 1200) c = null; // kurzes Aufwärmen im Gym ist keine Cardio-Einheit
      if (c) {
        const same = cands.filter((s) => s.sport === hit);
        const pool = same.length ? same : cands.filter((s) => s.type !== 'goal'); // anderes Gerät = Ersatz
        const eqSec = (s) => c.sec / timeFactor(s.sport, hit);
        const longEnough = (s) => (s.sport === hit && c.km ? c.km >= s.km * 0.75 : eqSec(s) >= s.sec * 0.75);
        const pick = pool.find((s) => (s.type === 'long' || s.type === 'goal') && longEnough(s)) || pool.find((s) => s.type !== 'long' && s.type !== 'goal') || pool[0];
        if (pick) { take(pick, w); if (pick.sport !== hit) pick.doneWith = hit; continue; }
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
  for (const s of res.sessions) {
    if (s.done) { s.status = 'done'; continue; }
    if (skips[s.id]) { s.status = 'skipped'; s.day = moves[s.id] ?? null; continue; }
    if (week < thisWeek) { s.status = 'missed'; s.day = null; continue; }
    s.status = 'open';
  }
  const pending = res.sessions.filter((s) => s.status === 'open');
  for (const s of pending) if (moves[s.id] != null && moves[s.id] >= todayIdx) { s.day = moves[s.id]; s.moved = true; }
  const free = pending.filter((s) => !s.moved);
  if (free.length && todayIdx < 7) schedule(free, res, { week, todayIdx, gc });
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
