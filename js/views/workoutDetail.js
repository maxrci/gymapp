import { getWorkout, deleteWorkout, saveRoutine } from '../store.js';
import { idx } from '../stats.js';
import { pageHead, fmtSet, setBadge, kpi, prValue, prLabel, emptyState } from '../components.js';
import { icon, sheet, confirmDialog, toast } from '../ui.js';
import { esc, fmtDateLong, fmtTime, fmtDur, fmtVolume, num, e1rm, fmtKg } from '../utils.js';
import { editWorkout } from '../workout.js';
import { poseSVG, poseFor } from '../poses.js';
import { stageFor } from '../gamification.js';
import { weekStreaks } from '../stats.js';
import { routineFromWorkout, repeatWorkout } from '../actions.js';

export function workoutDetailView({ id }) {
  const w = getWorkout(id);
  if (!w) return { html: pageHead('Workout', { back: '#/home' }) + emptyState('info', 'Nicht gefunden', 'Dieses Workout existiert nicht mehr.') };
  const { wStats, ex } = idx();
  const stg = stageFor(weekStreaks().current).index;
  const s = wStats.get(w.id) || {};
  const prsByEx = {};
  for (const p of s.prs || []) (prsByEx[p.exercise] ||= []).push(p);

  const exHtml = w.exercises.map((e) => {
    const x = ex.get(e.name);
    const t = x?.type;
    let n = 0;
    const rows = e.sets.map((q) => {
      if (q.type !== 'warmup' && q.type !== 'dropset' && q.type !== 'failure') n++;
      const est = (t === 'weight' || t === 'weighted_bw') && q.type !== 'warmup' ? e1rm(q.weight, q.reps) : 0;
      return `<div class="dset">${setBadge(q, n)}<span class="dset-v">${esc(fmtSet(q, t))}</span>${est ? `<span class="dset-e">1RM ≈ ${num(est, 1)}</span>` : ''}</div>`;
    }).join('');
    const prs = prsByEx[e.name] || [];
    return `<section class="card">
      <a class="dex-head" href="#/ex/${encodeURIComponent(e.name)}">
        <div class="ex-avatar pose-av">${poseSVG(poseFor(e.name), { stage: stg })}</div>
        <div class="ex-titles"><div class="ex-name">${esc(e.name)}</div><div class="ex-sub">${esc(x?.meta.primary || '')}</div></div>
        ${icon('right', 'muted')}
      </a>
      ${e.notes ? `<div class="dnote">${esc(e.notes)}</div>` : ''}
      ${prs.length ? `<div class="dprs">${prs.map((p) => `<span class="pr-pill">${icon('trophy', 'xs')} ${esc(prLabel(p.kind))}: ${esc(prValue(p))}</span>`).join('')}</div>` : ''}
      <div class="dsets">${rows}</div>
    </section>`;
  }).join('');

  const html = `
    ${pageHead(w.title, { back: '#/home', actions: `<button class="icon-btn" data-act="menu">${icon('more')}</button>` })}
    <div class="detail-date">${esc(fmtDateLong(w.start))} · ${esc(fmtTime(w.start))}–${esc(fmtTime(w.end))} · Workout Nr. ${s.n ?? ''}</div>
    ${w.description ? `<p class="dnote">${esc(w.description)}</p>` : ''}
    <div class="kpis">
      ${kpi('Dauer', fmtDur(s.duration), null, 'clock')}
      ${kpi('Volumen', fmtVolume(s.volume), null, 'weight')}
      ${kpi('Arbeitssätze', `${s.sets ?? 0}`, null, 'layers')}
      ${kpi('Wiederholungen', num(s.reps, 0), null, 'repeat')}
    </div>
    ${s.prs?.length ? `<div class="card pr-card">${icon('trophy', 'gold')}<div><b>${s.prs.length} persönliche Rekorde</b><small>in diesem Workout</small></div></div>` : ''}
    ${exHtml}
    <div class="btn-row">
      <button class="btn primary" data-act="repeat">${icon('repeat')} Wiederholen</button>
      <button class="btn ghost" data-act="edit">${icon('edit')} Bearbeiten</button>
    </div>
  `;
  return {
    html,
    handlers: {
      repeat: () => repeatWorkout(w),
      edit: () => editWorkout(w),
      menu: async () => {
        const v = await sheet({
          title: w.title,
          options: [
            { label: 'Bearbeiten', value: 'edit', icon: 'edit' },
            { label: 'Als Routine speichern', value: 'routine', icon: 'layers' },
            { label: 'Workout wiederholen', value: 'repeat', icon: 'repeat' },
            { label: 'Löschen', value: 'del', icon: 'trash', danger: true },
          ],
        });
        if (v === 'edit') editWorkout(w);
        if (v === 'repeat') repeatWorkout(w);
        if (v === 'routine') { await saveRoutine(routineFromWorkout(w)); toast('Routine gespeichert'); }
        if (v === 'del' && await confirmDialog('Workout endgültig löschen?', 'Löschen', true)) {
          await deleteWorkout(w.id);
          location.hash = '#/home';
        }
      },
    },
  };
}
