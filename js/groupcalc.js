// Gruppen-Auswertung (rein, ohne Abhängigkeiten außer compete.js) – genutzt vom Server und vom Demo-Modus.
// users: [{ id, name, role, created, profile, sums }]
// challenges: [{ id, creator, title, type, exercise, relative, start, end, created, members: [{ user_id, status }] }]

import {
  prMap, streakInfo, seasonScore, alltimeStats, challengeValue, challengeStatus,
  startOfMonth, addMonths, startOfYear, addYears, STAGE_NAMES, VISIBILITY, kingStats, exerciseBests, summaryEp,
} from './compete.js';

export const visOf = (p) => (VISIBILITY.some(([k]) => k === p?.visibility) ? p.visibility : 'full');

export function prepUsers(users) {
  return users.map((u) => {
    const profile = u.profile || {};
    const sums = [...u.sums].filter((s) => s.start).sort((a, b) => a.start - b.start);
    return {
      ...u, profile, sums, prs: prMap(sums),
      goal: Math.max(1, Math.min(14, profile.weekGoal || 3)),
      bwLog: Array.isArray(profile.bwLog) ? profile.bwLog : [],
    };
  });
}

export function buildGroup(rawUsers, rawChallenges, now = Date.now()) {
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
  const score = (u, a, b) => seasonScore({ sums: u.sums, prs: u.prs, goal: u.goal, results: results.get(u.id) }, a, b);
  const from = startOfMonth(now), to = addMonths(now, 1);

  const members = users.map((u) => {
    const st = streakInfo(u.sums, u.goal, now);
    const last = u.sums[u.sums.length - 1];
    return {
      id: u.id, name: u.name, role: u.role, look: u.profile.avatar || null, visibility: visOf(u.profile),
      stage: st.stage, stageName: STAGE_NAMES[st.stage], streak: st.current, longest: st.longest, goal: u.goal,
      thisWeek: st.thisWeek, workouts: u.sums.length, lastWorkout: last?.start || null, npc: !!u.npc,
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

  const first = Math.min(now, ...users.flatMap((u) => (u.sums[0] ? [u.sums[0].start] : [])));
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
  return { members, season, seasons, titles, alltime, kings, exercises, challenges, users: byId };
}

// Workout-Feed eines Mitglieds je nach Sichtbarkeit
export function feedFor(u, viewerId, items, before = Infinity, limit = 20) {
  const vis = viewerId === u.id ? 'full' : visOf(u.profile);
  if (vis === 'stats') return { visibility: vis, workouts: [] };
  const list = items.filter((x) => x.summary?.start < before).sort((a, b) => b.summary.start - a.summary.start).slice(0, Math.min(50, limit));
  const workouts = list.map(({ id, data, summary: s }) => {
    const base = {
      id, start: s.start, end: s.end, title: s.title, vol: s.vol, sets: s.sets, dur: s.dur, km: s.km,
      prs: u.prs?.get(id) || 0, ep: summaryEp(s, u.prs?.get(id) || 0), ex: (s.ex || []).map((x) => ({ n: x.n, t: x.t, s: x.s, e: x.e, d: x.d })),
    };
    if (vis === 'full' && data) {
      base.exercises = (data.exercises || []).map((e) => ({ name: e.name, notes: e.notes, sets: (e.sets || []).map(({ type, weight, reps, distance, duration }) => ({ type, weight, reps, distance, duration })) }));
      base.description = data.description;
    }
    return base;
  });
  return { visibility: vis, workouts };
}
