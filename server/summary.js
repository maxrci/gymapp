// Workout-Zusammenfassungen vom Client prüfen (Arena, Ranglisten, Könige rechnen damit)

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

const EX_TYPES = new Set(['weight', 'weighted_bw', 'bodyweight', 'cardio', 'duration']);
const lim = (v, max) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0; };
export function cleanSummary(s) {
  if (!s || typeof s !== 'object') return null;
  const start = Number(s.start);
  if (!Number.isFinite(start) || start < Date.UTC(1990, 0, 1) || start > Date.now() + 2 * 86400000) return null;
  const end = Number(s.end);
  return {
    start, end: Number.isFinite(end) && end >= start && end - start <= 86400000 ? end : start + 3600e3, title: str(s.title, 120),
    vol: lim(s.vol, 150000), sets: lim(s.sets, 80), reps: lim(s.reps, 3000), dur: lim(s.dur, 86400), km: lim(s.km, 500), cmin: lim(s.cmin, 720), mob: s.mob ? 1 : 0, ...(s.h ? { h: 1 } : {}),
    ex: (Array.isArray(s.ex) ? s.ex : []).slice(0, 80).filter((x) => x && typeof x === 'object' && typeof x.n === 'string' && str(x.n, 80)).map((x) => ({
      n: str(x.n, 80), t: EX_TYPES.has(x.t) ? x.t : 'weight', v: lim(x.v, 100000), s: lim(x.s, 40), r: lim(x.r, 2000),
      mr: lim(x.mr, 1000), e: lim(x.e, 1000), w: lim(x.w, 1000), d: lim(x.d, 1000), sec: lim(x.sec, 86400),
    })),
  };
}
