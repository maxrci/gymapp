// Gruppen-Auswertung (rein, ohne Abhängigkeiten außer compete.js) – genutzt vom Server und vom Demo-Modus.
// users: [{ id, name, role, created, profile, sums }]
// challenges: [{ id, creator, title, type, exercise, relative, start, end, created, members: [{ user_id, status }] }]

import {
  streakInfo, alltimeStats, challengeValue, challengeStatus,
  startOfMonth, addMonths, startOfYear, addYears, STAGE_NAMES, VISIBILITY, kingStats, exerciseBests, LIFTS,
} from './compete.js';
import { eligible, xpScore, workoutXp, xpParams, xpRecords as xpScoreRecords, realWeight } from './xp.js';

export const visOf = (p) => (VISIBILITY.some(([k]) => k === p?.visibility) ? p.visibility : 'full');

export function prepUsers(users) {
  return users.map((u) => {
    const profile = u.profile || {};
    const all = [...u.sums].filter((s) => s.start).map(realWeight).sort((a, b) => a.start - b.start);
    // el = zählende Workouts (in der App getrackt/nachgetragen, Strava erst ab Verbindung) → XP, Rekorde, Streak
    // sums = was andere sehen dürfen: ohne Historie (h) und ohne Strava (ext, zählt nur als XP)
    const el = eligible(all);
    const sums = all.filter((s) => !s.ext && !s.h);
    return {
      ...u, profile, sums, all, el, prs: xpScoreRecords(el), // Rekorde neu ab dem ersten zählenden Workout
      goal: Math.max(1, Math.min(14, profile.weekGoal || 3)),
      bwLog: Array.isArray(profile.bwLog) ? profile.bwLog : [],
    };
  });
}

export function buildGroup(rawUsers, rawChallenges, now = Date.now(), points = null) {
  const P = xpParams(points);
  const users = prepUsers(rawUsers);
  const byId = new Map(users.map((u) => [u.id, u]));

  const challenges = rawChallenges.map((c) => {
    const ms = (c.members || []).filter((m) => byId.has(m.user_id)).map((m) => {
      const u = byId.get(m.user_id);
      return { id: m.user_id, status: m.status, value: m.status === 'joined' ? challengeValue(c, u.sums, u.prs, u.bwLog) : 0 };
    });
    const joined = ms.filter((m) => m.status === 'joined').sort((a, b) => b.value - a.value);
    const status = challengeStatus(c, now);
    const top = joined[0]?.value || 0;
    const winners = status === 'finished' && top > 0 ? joined.filter((m) => m.value === top).map((m) => m.id) : [];
    return {
      id: c.id, title: c.title, type: c.type, exercise: c.exercise, relative: !!c.relative,
      start: c.start, end: c.end, creator: c.creator, created: c.created, status, winners,
      members: [...joined, ...ms.filter((m) => m.status !== 'joined')],
    };
  }).sort((a, b) => b.start - a.start);

  const results = new Map(users.map((u) => [u.id, []]));
  for (const c of challenges) {
    if (c.status !== 'finished') continue;
    for (const m of c.members) if (m.status === 'joined') results.get(m.id)?.push({ end: c.end, won: c.winners.includes(m.id) });
  }
  const score = (u, a, b) => {
    const base = { goal: u.goal, results: results.get(u.id), prs: u.prs, P, now };
    const total = xpScore({ ...base, sums: u.all }, a, b);
    if (!u.all.some((s) => s.ext)) return total;
    // Strava: Gesamt-XP inkl. Strava; die Aufschlüsselung (Workouts, Minuten, Rekorde …) nur aus eigenen Einträgen
    const own = xpScore({ ...base, sums: u.all.filter((s) => !s.ext) }, a, b);
    return { ...own, points: Math.max(own.points, total.points), ext: Math.max(0, total.points - own.points) };
  };
  const from = startOfMonth(now), to = addMonths(now, 1);

  const members = users.map((u) => {
    const st = streakInfo(u.el, u.goal, now);
    const last = u.sums[u.sums.length - 1];
    return {
      id: u.id, name: u.name, role: u.role, look: u.profile.avatar || null, visibility: visOf(u.profile),
      stage: st.stage, stageName: STAGE_NAMES[st.stage], streak: st.current, longest: st.longest, goal: u.goal,
      thisWeek: st.thisWeek, workouts: u.sums.length, lastWorkout: last?.start || null, npc: !!u.npc,
      xp: score(u, 0, Infinity).points,
    };
  });

  // Saison = Kalenderjahr; jeder Monat hat einen eigenen Sieger
  const yFrom = startOfYear(now), yTo = addYears(now, 1);
  const rank = (a, b) => users.map((u) => ({ id: u.id, ...score(u, a, b) })).sort((p, q) => q.points - p.points);
  const winnersOf = (rows) => (rows[0]?.points > 0 ? rows.filter((r) => r.points === rows[0].points).map((r) => r.id) : []);
  const months = [];
  for (let m = yFrom; m < yTo && m <= now; m = addMonths(m, 1)) {
    const rows = rank(m, addMonths(m, 1));
    months.push({ from: m, running: m === from, top: rows.filter((r) => r.points > 0).slice(0, 3).map(({ id, points }) => ({ id, points })), winners: winnersOf(rows) });
  }
  const season = { from: yFrom, to: yTo, rows: rank(yFrom, yTo), month: { from, to, rows: rank(from, to) }, months };

  const first = Math.min(now, ...users.flatMap((u) => (u.all[0] ? [u.all[0].start] : [])));
  const titles = {};
  const T = (id) => (titles[id] ||= { years: 0, months: 0 });
  // Monatstitel (abgeschlossene Monate, max. 5 Jahre zurück)
  for (let m = addMonths(from, -1), i = 0; m >= startOfMonth(first) && i < 60; m = addMonths(m, -1), i++) {
    for (const w of winnersOf(rank(m, addMonths(m, 1)))) T(w).months++;
  }
  // Vergangene Saisons (Jahre)
  const seasons = [];
  for (let y = addYears(yFrom, -1); y >= startOfYear(first); y = addYears(y, -1)) {
    const rows = rank(y, addYears(y, 1)).filter((r) => r.points > 0);
    if (!rows.length) continue;
    const winners = winnersOf(rows);
    for (const w of winners) T(w).years++;
    seasons.push({ from: y, top: rows.slice(0, 3).map(({ id, points }) => ({ id, points })), winners });
  }

  // Könige: aktueller Monat, Saison (Jahr) und ewig
  const kings = { month: {}, season: {}, all: {} };
  for (const u of users) {
    kings.month[u.id] = kingStats(u.sums, u.bwLog, from, to);
    kings.season[u.id] = kingStats(u.sums, u.bwLog, yFrom, yTo);
    kings.all[u.id] = kingStats(u.sums, u.bwLog);
  }
  const exercises = Object.fromEntries(users.map((u) => [u.id, exerciseBests(u.sums, u.bwLog)]));

  const alltime = Object.fromEntries(users.map((u) => [u.id, alltimeStats(u.sums, u.bwLog, u.goal)]));

  // Verläufe der letzten 12 Monate: wer führt wo, und wie haben sich alle entwickelt (nur in der App Getracktes)
  const mStarts = Array.from({ length: 12 }, (_, i) => addMonths(from, i - 11));
  const trends = { months: mStarts, xp: {}, workouts: {}, km: {}, lifts: Object.fromEntries(Object.keys(LIFTS).map((k) => [k, {}])) };
  for (const u of users) {
    trends.xp[u.id] = mStarts.map((m) => score(u, m, addMonths(m, 1)).points);
    const inM = (m) => u.sums.filter((s) => s.start >= m && s.start < addMonths(m, 1));
    trends.workouts[u.id] = mStarts.map((m) => inM(m).length);
    trends.km[u.id] = mStarts.map((m) => Math.round(inM(m).reduce((a, s) => a + (s.km || 0), 0) * 10) / 10);
    for (const [k, L] of Object.entries(LIFTS)) {
      let best = 0;
      for (const s of u.sums) if (s.start < mStarts[0]) for (const x of s.ex || []) if (L.re.test(x.n)) best = Math.max(best, x.e || 0);
      trends.lifts[k][u.id] = mStarts.map((m) => {
        for (const s of inM(m)) for (const x of s.ex || []) if (L.re.test(x.n)) best = Math.max(best, x.e || 0);
        return best ? Math.round(best * 10) / 10 : null;
      });
    }
  }
  return { members, season, seasons, titles, alltime, kings, exercises, challenges, trends, users: byId };
}

// Workout-Feed eines Mitglieds je nach Sichtbarkeit
export function feedFor(u, viewerId, items, before = Infinity, limit = 20) {
  const vis = viewerId === u.id ? 'full' : visOf(u.profile);
  if (vis === 'stats') return { visibility: vis, workouts: [] };
  const list = items.filter((x) => x.summary?.start < before).sort((a, b) => b.summary.start - a.summary.start).slice(0, Math.min(50, limit));
  const workouts = list.map(({ id, data, summary: s }) => {
    const base = {
      id, start: s.start, end: s.end, title: s.title, vol: s.vol, sets: s.sets, dur: s.dur, km: s.km,
      prs: u.prs?.get(id) || 0, ep: workoutXp(s, u.prs?.get(id) || 0).total, ex: (s.ex || []).map((x) => ({ n: x.n, t: x.t, s: x.s, e: x.e, d: x.d })),
    };
    if (vis === 'full' && data) {
      base.exercises = (data.exercises || []).map((e) => ({ name: e.name, notes: e.notes, sets: (e.sets || []).map(({ type, weight, reps, distance, duration }) => ({ type, weight, reps, distance, duration })) }));
      base.description = data.description;
    }
    return base;
  });
  return { visibility: vis, workouts };
}
