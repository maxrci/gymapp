// DEMO-TEIL: Arena ohne Server ausprobieren.
// Du trittst gegen zwei NPCs („Kai“ und „Mia“) an. Ihre Workouts werden lokal und deterministisch erzeugt
// (passend zu deinen eigenen Bestwerten); Challenges werden nur auf diesem Gerät gespeichert.
// Sobald du dich bei einem echten Gruppen-Server anmeldest, ist der Demo-Modus aus.

import { state } from './store.js';
import { buildGroup, feedFor, prepUsers } from './groupcalc.js';
import { LIFTS, DAY } from './compete.js';

const LS = 'gymlog-demo';
const ME = 'me';
let memo = { key: '', g: null };

const load = () => { try { return { challenges: [], ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return { challenges: [] }; } };
const save = (d) => { try { localStorage.setItem(LS, JSON.stringify(d)); } catch { /* voll */ } memo.key = ''; };

// ---------- Zufall mit festem Startwert ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// ---------- NPCs ----------
const NPCS = [
  {
    id: 'npc-kai', name: 'Kai (NPC)', freq: 3.2, rel: 0.85, bw: 88, goal: 3, vis: 'summary', cardio: 0.18, device: ['Radfahren', 22, 28], mobility: 0.04,
    factor: { bench: 1.08, squat: 0.97, deadlift: 1.12, ohp: 1.04 },
    look: { sex: 'm', hair: 'blau', outfit: 'tank', color: 'schwarz', face: 'cool' },
  },
  {
    id: 'npc-mia', name: 'Mia (NPC)', freq: 4.6, rel: 1.1, bw: 61, goal: 4, vis: 'full', cardio: 0.3, device: ['Laufband', 8, 11], mobility: 0.22,
    factor: { bench: 0.58, squat: 0.75, deadlift: 0.78, ohp: 0.6 },
    look: { sex: 'f', hair: 'lila', outfit: 'gi', color: 'pink', face: 'happy' },
  },
];
const LIFT_NAMES = { bench: 'Bankdrücken (Langhantel)', squat: 'Kniebeuge (Langhantel)', deadlift: 'Kreuzheben (Langhantel)', ohp: 'Schulterdrücken (Langhantel)' };
const PLAN = [
  ['Push', ['bench', 'ohp'], [['Liegestütz', 'bodyweight']]],
  ['Pull', ['deadlift'], [['Klimmzug', 'bodyweight']]],
  ['Beine', ['squat'], []],
];

// Eigene Kraft als Bezug: 80. Perzentil der letzten 12 Monate (robust gegen Ausreißer), sonst Standardwerte
function myLifts(sums) {
  const best = { bench: 80, squat: 100, deadlift: 120, ohp: 50 };
  const since = Date.now() - 365 * DAY;
  const vals = {};
  for (const w of sums) for (const x of w.ex || []) {
    if (x.t !== 'weight' || !x.e || w.start < since) continue;
    for (const [k, L] of Object.entries(LIFTS)) if (L.re.test(x.n)) (vals[k] ||= []).push(x.e);
  }
  for (const [k, v] of Object.entries(vals)) {
    if (v.length < 3) continue;
    v.sort((a, b) => a - b);
    best[k] = v[Math.floor(v.length * 0.8)];
  }
  return best;
}
// Obergrenzen relativ zum Körpergewicht, damit NPCs glaubwürdig bleiben
const MAX_RATIO = { bench: 1.5, squat: 2.0, deadlift: 2.4, ohp: 0.95 };

const round = (v, s = 2.5) => Math.round(v / s) * s;

function npcItems(npc, base, now) {
  const items = [];
  const days = 420;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  let planIdx = 0;
  for (let d = days; d >= 0; d--) {
    const day = today.getTime() - d * DAY;
    const r = rng(hash(npc.id) + Math.floor(day / DAY));
    if (r() > npc.freq / 7) continue;
    const start = day + (17 + Math.floor(r() * 3)) * 3600e3 + Math.floor(r() * 50) * 60e3;
    if (start > now) continue;
    const prog = 0.9 + 0.1 * (1 - d / days); // langsamer Fortschritt
    const id = `${npc.id}-${Math.floor(day / DAY)}`;
    const ex = [];
    const exercises = [];
    const roll = r();
    if (roll < npc.mobility) {
      const name = r() < 0.5 ? 'Pilates' : 'Mobility';
      const sec = (20 + Math.floor(r() * 25)) * 60;
      ex.push({ n: name, t: 'duration', v: 0, s: 1, r: 0, mr: 0, e: 0, w: 0, d: 0, sec });
      exercises.push({ name, sets: [{ type: 'normal', duration: sec }] });
      items.push({ id, summary: { start, end: start + sec * 1000, title: name, vol: 0, sets: 1, reps: 0, dur: sec, km: 0, cmin: 0, mob: 1, ex }, data: { id, title: name, start, exercises } });
      continue;
    }
    if (roll < npc.mobility + npc.cardio) {
      const [dev, lo, hi] = npc.device;
      const speed = lo + r() * (hi - lo); // km/h
      const sec = (25 + Math.floor(r() * 35)) * 60;
      const km = +((speed * sec) / 3600).toFixed(2);
      ex.push({ n: dev, t: 'cardio', v: 0, s: 1, r: 0, mr: 0, e: 0, w: 0, d: km, sec });
      exercises.push({ name: dev, sets: [{ type: 'normal', distance: km, duration: sec }] });
      items.push({ id, summary: { start, end: start + sec * 1000, title: 'Cardio', vol: 0, sets: 1, reps: 0, dur: sec, km, cmin: Math.round(sec / 60), mob: 0, ex }, data: { id, title: 'Cardio', start, exercises } });
      continue;
    }
    const [title, lifts, extra] = PLAN[planIdx++ % PLAN.length];
    let vol = 0, sets = 0, reps = 0;
    for (const k of lifts) {
      const e1 = Math.min(base[k] * npc.factor[k], npc.bw * MAX_RATIO[k]) * prog * (0.97 + r() * 0.05);
      const rp = 5 + Math.floor(r() * 4);
      const w = round(e1 / (1 + rp / 30));
      const n = 3 + Math.floor(r() * 2);
      const st = Array.from({ length: n }, () => ({ type: 'normal', weight: w, reps: rp }));
      vol += w * rp * n; sets += n; reps += rp * n;
      ex.push({ n: LIFT_NAMES[k], t: 'weight', v: w * rp * n, s: n, r: rp * n, mr: rp, e: +(w * (1 + rp / 30)).toFixed(2), w, d: 0, sec: 0 });
      exercises.push({ name: LIFT_NAMES[k], sets: st });
    }
    for (const [name, t] of extra) {
      const rp = name === 'Klimmzug' ? 6 + Math.floor(r() * 6) : 15 + Math.floor(r() * 20);
      const n = 3;
      const vb = Math.round(npc.bw * rp * n);
      vol += vb; sets += n; reps += rp * n;
      ex.push({ n: name, t, v: vb, s: n, r: rp * n, mr: rp, e: 0, w: 0, d: 0, sec: 0 });
      exercises.push({ name, sets: Array.from({ length: n }, () => ({ type: 'normal', reps: rp })) });
    }
    const dur = 3000 + Math.floor(r() * 1800);
    items.push({ id, summary: { start, end: start + dur * 1000, title, vol: Math.round(vol), sets, reps, dur, km: 0, cmin: 0, mob: 0, ex }, data: { id, title, start, exercises } });
  }
  return items;
}

// ---------- Gruppe ----------
let summarize = null;
export const setSummarizer = (fn) => { summarize = fn; };

function users(now) {
  const sum = summarize();
  const mine = state.workouts.map((w) => ({ id: w.id, summary: sum(w), data: w }));
  const s = state.settings;
  const me = {
    id: ME, name: 'Du', role: 'admin', created: 0, items: mine,
    profile: { avatar: s.avatar || null, bwLog: Array.isArray(s.bwLog) ? s.bwLog : (s.bodyweight ? [{ t: 0, kg: s.bodyweight }] : []), weekGoal: s.weekGoal, visibility: s.visibility || 'full' },
  };
  const base = myLifts(mine.map((i) => i.summary));
  // NPCs trainieren ungefähr so oft wie du (Kai etwas seltener, Mia etwas öfter), damit es spannend bleibt
  const recent = mine.filter((i) => i.summary.start > now - 91 * DAY).length / 13;
  const myFreq = recent > 0.5 ? recent : 3.5;
  const npcs = NPCS.map((n, i) => ({
    id: n.id, name: n.name, role: 'member', created: i + 1, npc: true,
    items: npcItems({ ...n, freq: Math.max(1.5, Math.min(6.5, myFreq * n.rel)) }, base, now),
    profile: { avatar: n.look, bwLog: [{ t: 0, kg: n.bw }], weekGoal: n.goal, visibility: n.vis },
  }));
  return [me, ...npcs].map((u) => ({ ...u, sums: u.items.map((x) => ({ ...x.summary, id: x.id })) }));
}

export function demoGroup() {
  const now = Date.now();
  const d = load();
  const key = `${state.version}|${JSON.stringify(d.challenges).length}|${d.challenges.length}|${Math.floor(now / 60000)}`;
  if (memo.key === key) return memo.g;
  const us = users(now);
  const g = buildGroup(us, d.challenges, now);
  const { users: _u, ...rest } = g;
  const out = { demo: true, me: ME, group: 'Demo-Arena', now, ...rest };
  memo = { key, g: out, us };
  return out;
}

// ---------- Lokale „API“ für den Demo-Modus ----------
export async function demoApi(method, path, body = {}) {
  const d = load();
  const ch = (id) => d.challenges.find((c) => c.id === id) || (() => { throw new Error('Challenge nicht gefunden'); })();
  let m;
  if (method === 'GET' && path === '/api/group') return demoGroup();
  if (method === 'GET' && (m = /^\/api\/members\/([^/]+)\/workouts/.exec(path))) {
    demoGroup();
    const id = decodeURIComponent(m[1]);
    const u = prepUsers(memo.us).find((x) => x.id === id);
    if (!u) throw new Error('Unbekanntes Mitglied');
    const q = new URLSearchParams(path.split('?')[1] || '');
    const items = memo.us.find((x) => x.id === id).items;
    return feedFor(u, ME, items, Number(q.get('before')) || Infinity, Number(q.get('limit')) || 20);
  }
  if (method === 'POST' && path === '/api/challenges') {
    const id = `demo-${Date.now().toString(36)}`;
    // NPCs nehmen Einladungen sofort an
    const members = [{ user_id: ME, status: 'joined' }, ...(body.invite || []).map((u) => ({ user_id: u, status: 'joined' }))];
    d.challenges.push({ id, creator: ME, title: body.title, type: body.type, exercise: body.exercise, relative: !!body.relative, start: body.start, end: body.end, created: Date.now(), members });
    save(d);
    return { id };
  }
  if (method === 'POST' && (m = /^\/api\/challenges\/([^/]+)\/(invite|respond|end)$/.exec(path))) {
    const c = ch(m[1]);
    if (m[2] === 'invite') for (const u of body.users || []) if (!c.members.some((x) => x.user_id === u)) c.members.push({ user_id: u, status: 'joined' });
    if (m[2] === 'respond') { const me = c.members.find((x) => x.user_id === ME); if (me) me.status = body.accept ? 'joined' : 'declined'; else c.members.push({ user_id: ME, status: body.accept ? 'joined' : 'declined' }); }
    if (m[2] === 'end') { c.end = Math.min(c.end, Date.now()); c.start = Math.min(c.start, Date.now() - 1); }
    save(d);
    return { ok: true };
  }
  if (method === 'DELETE' && (m = /^\/api\/challenges\/([^/]+)$/.exec(path))) {
    d.challenges = d.challenges.filter((c) => c.id !== m[1]);
    save(d);
    return { ok: true };
  }
  throw new Error('Im Demo-Modus nicht verfügbar');
}

export function resetDemo() { save({ challenges: [] }); }
