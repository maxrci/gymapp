// Live-Status für die Arena: Läuft ein Workout oder eine geführte Einheit, meldet die App alle ~30 s,
// was gerade trainiert wird. Der Server zeigt es nur in Gruppen, in denen „Live zeigen“ an ist.

import { state, exerciseMeta } from './store.js';
import { api, loggedIn } from './sync.js';
import { cardioKind, MOBILITY_RE } from './compete.js';

export function currentActivity() {
  try {
    const g = JSON.parse(localStorage.getItem('gymlog-guided') || 'null');
    if (g?.phases) return { kind: g.kind === 'mobility' ? 'mobility' : 'cardio', exercise: String(g.title || '').slice(0, 60), since: g.start || Date.now() };
  } catch { /* egal */ }
  const a = state.active;
  if (!a) return null;
  const ex = a.exercises || [];
  let gym = 0, cardio = 0, mob = 0;
  for (const e of ex) {
    if (MOBILITY_RE.test(e.name)) mob++;
    else if (cardioKind(e.name, exerciseMeta(e.name).type)) cardio++;
    else gym++;
  }
  const kind = gym >= cardio && gym >= mob ? 'gym' : cardio >= mob ? 'cardio' : 'mobility';
  const cur = ex.find((e) => e.sets?.some((s) => !s.done)) || ex[ex.length - 1];
  return { kind, exercise: String(cur?.name || a.title || '').slice(0, 60), since: a.start || Date.now() };
}

let lastSent = 0, wasActive = false, lastKey = '';
async function beat(force = false) {
  if (!loggedIn() || state.settings.liveOff) return;
  const c = currentActivity();
  if (!c) {
    if (wasActive) { wasActive = false; lastKey = ''; api('POST', '/api/presence', { active: false }).catch(() => {}); }
    return;
  }
  const key = `${c.kind}|${c.exercise}`;
  if (!force && key === lastKey && Date.now() - lastSent < 30000) return;
  lastSent = Date.now(); lastKey = key; wasActive = true;
  api('POST', '/api/presence', { active: true, ...c }).catch(() => {});
}

let inited = false;
export function initPresence() {
  if (inited) return;
  inited = true;
  setInterval(() => beat(), 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') beat(true); });
}
