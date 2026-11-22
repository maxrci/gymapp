// Gruppen-Auswertung: Mitglieder, Liga, Ewige Tabelle, Challenges

import {
  prMap, streakInfo, seasonScore, alltimeStats, challengeValue, challengeStatus,
  startOfMonth, addMonths, STAGE_NAMES, VISIBILITY,
} from '../js/compete.js';

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
export const visOf = (p) => (VISIBILITY.some(([k]) => k === p.visibility) ? p.visibility : 'full');

let cache = { key: '', data: null };
export let version = 1;
export const bump = () => { version++; };

function loadUsers(D) {
  const users = D.all('SELECT id, name, role, created, profile FROM users WHERE disabled = 0 ORDER BY created');
  return users.map((u) => {
    const profile = parse(u.profile, {});
    const sums = D.all("SELECT id, summary FROM items WHERE user_id = ? AND kind = 'workout' AND deleted = 0 AND summary IS NOT NULL", u.id)
      .map((r) => ({ ...parse(r.summary, {}), id: r.id })).filter((s) => s.start);
    sums.sort((a, b) => a.start - b.start);
    const goal = Math.max(1, Math.min(14, profile.weekGoal || 3));
    return { ...u, profile, sums, prs: prMap(sums), goal, bwLog: Array.isArray(profile.bwLog) ? profile.bwLog : [] };
  });
}

function loadChallenges(D, byId) {
  const list = D.all('SELECT * FROM challenges ORDER BY start DESC');
  const mem = D.all('SELECT * FROM challenge_members');
  const now = Date.now();
  return list.map((c) => {
    const ms = mem.filter((m) => m.challenge_id === c.id).map((m) => {
      const u = byId.get(m.user_id);
      const value = u && m.status === 'joined' ? challengeValue(c, u.sums, u.prs, u.bwLog) : 0;
      return { id: m.user_id, status: m.status, value };
    }).filter((m) => byId.has(m.id));
    const joined = ms.filter((m) => m.status === 'joined').sort((a, b) => b.value - a.value);
    const status = challengeStatus(c, now);
    const top = joined[0]?.value || 0;
    const winners = status === 'finished' && top > 0 ? joined.filter((m) => m.value === top).map((m) => m.id) : [];
    return {
      id: c.id, title: c.title, type: c.type, exercise: c.exercise, relative: !!c.relative,
      start: c.start, end: c.end, creator: c.creator, created: c.created, status, winners,
      members: [...joined, ...ms.filter((m) => m.status !== 'joined')],
    };
  });
}

export function groupData(D) {
  const key = `${version}|${new Date().toDateString()}|${Math.floor(Date.now() / 600000)}`;
  if (cache.key === key) return cache.data;
  const users = loadUsers(D);
  const byId = new Map(users.map((u) => [u.id, u]));
  const challenges = loadChallenges(D, byId);

  // Challenge-Ergebnisse pro Nutzer (für Liga-Punkte)
  const results = new Map(users.map((u) => [u.id, []]));
  for (const c of challenges) {
    if (c.status !== 'finished') continue;
    for (const m of c.members) if (m.status === 'joined') results.get(m.id)?.push({ end: c.end, won: c.winners.includes(m.id) });
  }

  const now = Date.now();
  const from = startOfMonth(now), to = addMonths(now, 1);
  const score = (u, a, b) => seasonScore({ sums: u.sums, prs: u.prs, goal: u.goal, results: results.get(u.id) }, a, b);

  const members = users.map((u) => {
    const st = streakInfo(u.sums, u.goal, now);
    const last = u.sums[u.sums.length - 1];
    return {
      id: u.id, name: u.name, role: u.role, look: u.profile.avatar || null, visibility: visOf(u.profile),
      stage: st.stage, stageName: STAGE_NAMES[st.stage], streak: st.current, longest: st.longest, goal: u.goal,
      thisWeek: st.thisWeek, workouts: u.sums.length, lastWorkout: last?.start || null,
    };
  });

  const season = { from, to, rows: users.map((u) => ({ id: u.id, ...score(u, from, to) })).sort((a, b) => b.points - a.points) };

  // Vergangene Saisons (bis 24 Monate) + Titel
  const first = Math.min(now, ...users.flatMap((u) => (u.sums[0] ? [u.sums[0].start] : [])));
  const seasons = [];
  const titles = {};
  for (let m = addMonths(from, -1), i = 0; m >= startOfMonth(first) && i < 24; m = addMonths(m, -1), i++) {
    const rows = users.map((u) => ({ id: u.id, points: score(u, m, addMonths(m, 1)).points })).filter((r) => r.points > 0).sort((a, b) => b.points - a.points);
    if (!rows.length) continue;
    const winners = rows.filter((r) => r.points === rows[0].points).map((r) => r.id);
    for (const w of winners) titles[w] = (titles[w] || 0) + 1;
    seasons.push({ from: m, top: rows.slice(0, 3), winners });
  }

  const alltime = Object.fromEntries(users.map((u) => [u.id, alltimeStats(u.sums, u.bwLog, u.goal)]));
  const data = { members, season, seasons, titles, alltime, challenges, users: byId };
  cache = { key, data };
  return data;
}

// Workouts eines Mitglieds je nach Sichtbarkeit
export function memberWorkouts(D, viewer, targetId, before = Infinity, limit = 20) {
  const t = D.get('SELECT id, profile FROM users WHERE id = ? AND disabled = 0', targetId);
  if (!t) return { error: 'Unbekanntes Mitglied', status: 404 };
  const vis = viewer.id === t.id ? 'full' : visOf(parse(t.profile, {}));
  if (vis === 'stats') return { visibility: vis, workouts: [] };
  const rows = D.all(`SELECT id, data, summary, start FROM items WHERE user_id = ? AND kind = 'workout' AND deleted = 0 AND start < ?
    ORDER BY start DESC LIMIT ?`, t.id, Number.isFinite(before) ? before : 9e15, Math.min(50, limit));
  const { users } = groupData(D);
  const prs = users.get(t.id)?.prs || new Map();
  const workouts = rows.map((r) => {
    const s = parse(r.summary, {});
    const base = {
      id: r.id, start: s.start || r.start, end: s.end, title: s.title, vol: s.vol, sets: s.sets, dur: s.dur, km: s.km,
      prs: prs.get(r.id) || 0, ex: (s.ex || []).map((x) => ({ n: x.n, t: x.t, s: x.s, e: x.e, d: x.d })),
    };
    if (vis === 'full') {
      const w = parse(r.data, {});
      base.exercises = (w.exercises || []).map((e) => ({ name: e.name, notes: e.notes, sets: (e.sets || []).map(({ type, weight, reps, distance, duration }) => ({ type, weight, reps, distance, duration })) }));
      base.description = w.description;
    }
    return base;
  });
  return { visibility: vis, workouts };
}
