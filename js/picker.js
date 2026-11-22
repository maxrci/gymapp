// Übungsauswahl + Dialog "Neue Übung"

import { state, allExerciseNames, exerciseMeta, saveExerciseMeta } from './store.js';
import { LIBRARY, MUSCLES, TYPES, inferExercise } from './library.js';
import { idx } from './stats.js';
import { esc, fmtRelDay } from './utils.js';
import { icon, overlay, formDialog, toast } from './ui.js';
import { poseSVG, poseFor } from './poses.js';
import { stageFor } from './gamification.js';
import { weekStreaks } from './stats.js';

export function pickExercises({ multi = true, title = 'Übung hinzufügen' } = {}) {
  return new Promise((resolve) => {
    const usage = idx().ex;
    const names = [...new Set([...allExerciseNames(), ...LIBRARY])];
    const items = names.map((n) => {
      const x = usage.get(n);
      return { name: n, meta: exerciseMeta(n), count: x?.count || 0, last: x?.last || 0 };
    }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'));

    const stg = stageFor(weekStreaks().current).index;
    let q = '';
    let muscle = '';
    const selected = [];

    const o = overlay(`
      <div class="panel-head">
        <button class="icon-btn" data-close>${icon('x')}</button>
        <div class="panel-title">${esc(title)}</div>
        <button class="link-btn" data-new>Neu</button>
      </div>
      <div class="panel-search">
        <div class="search">${icon('search')}<input type="search" placeholder="Übung suchen" autocomplete="off"></div>
        <div class="chips scroll">${['', ...MUSCLES].map((m) => `<button class="chip ${m === '' ? 'on' : ''}" data-m="${esc(m)}">${m || 'Alle'}</button>`).join('')}</div>
      </div>
      <div class="panel-body"><div class="pick-list"></div></div>
      ${multi ? '<div class="panel-foot" hidden><button class="btn primary block" data-add></button></div>' : ''}
    `, 'picker');

    const list = o.querySelector('.pick-list');
    const foot = o.querySelector('.panel-foot');
    const draw = () => {
      const ql = q.toLowerCase();
      const f = items.filter((it) => (!ql || it.name.toLowerCase().includes(ql)) && (!muscle || it.meta.primary === muscle || (it.meta.secondary || []).includes(muscle)));
      const used = f.filter((x) => x.count);
      const lib = f.filter((x) => !x.count);
      const row = (it) => {
        const si = selected.indexOf(it.name);
        return `<button class="pick-row ${si >= 0 ? 'sel' : ''}" data-name="${esc(it.name)}">
          <div class="pick-avatar pose-av">${poseSVG(poseFor(it.name), { stage: stg })}</div>
          <div class="pick-main"><div class="pick-name">${esc(it.name)}</div>
          <div class="pick-sub">${esc(it.meta.primary)}${it.count ? ` · ${it.count}× · ${fmtRelDay(it.last)}` : ''}</div></div>
          ${si >= 0 ? `<span class="pick-num">${multi ? si + 1 : icon('check')}</span>` : ''}
        </button>`;
      };
      list.innerHTML =
        (used.length ? `<div class="list-label">Deine Übungen</div>${used.map(row).join('')}` : '') +
        (lib.length ? `<div class="list-label">Bibliothek</div>${lib.map(row).join('')}` : '') +
        (!f.length ? `<div class="empty-small">Keine Übung gefunden.<br><button class="btn ghost" data-new>„${esc(q)}“ anlegen</button></div>` : '');
      if (foot) {
        foot.hidden = !selected.length;
        foot.querySelector('[data-add]').textContent = `${selected.length} Übung${selected.length > 1 ? 'en' : ''} hinzufügen`;
      }
    };
    draw();

    const done = (v) => { o.close(); resolve(v); };
    o.querySelector('input').addEventListener('input', (e) => { q = e.target.value.trim(); draw(); });
    o.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]')) return done(null);
      if (e.target.closest('[data-add]')) return done([...selected]);
      const m = e.target.closest('[data-m]');
      if (m) {
        muscle = m.dataset.m;
        o.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b === m));
        return draw();
      }
      if (e.target.closest('[data-new]')) {
        const name = await createExerciseDialog(q);
        if (name) {
          if (!multi) return done([name]);
          items.unshift({ name, meta: exerciseMeta(name), count: 0, last: 0 });
          selected.push(name);
          draw();
        }
        return;
      }
      const r = e.target.closest('[data-name]');
      if (r) {
        const n = r.dataset.name;
        if (!multi) return done([n]);
        const i = selected.indexOf(n);
        if (i >= 0) selected.splice(i, 1); else selected.push(n);
        draw();
      }
    });
  });
}

export async function createExerciseDialog(prefill = '') {
  const inf = inferExercise(prefill);
  const res = await formDialog({
    title: 'Neue Übung',
    okLabel: 'Anlegen',
    fields: [
      { name: 'name', label: 'Name', value: prefill, placeholder: 'z. B. Bankdrücken (Kurzhantel)' },
      { name: 'primary', label: 'Muskelgruppe', type: 'select', value: inf.primary, options: MUSCLES.map((m) => ({ value: m, label: m })) },
      { name: 'type', label: 'Erfassung', type: 'select', value: inf.type, options: Object.entries(TYPES).map(([k, t]) => ({ value: k, label: t.label })) },
    ],
  });
  if (!res || !res.name.trim()) return null;
  const name = res.name.trim().replace(/\s+/g, ' ');
  if (allExerciseNames().includes(name) && state.exMeta[name]) { toast('Übung existiert bereits'); return name; }
  const auto = inferExercise(name);
  await saveExerciseMeta(name, {
    primary: res.primary, type: res.type, custom: true,
    secondary: res.primary === auto.primary ? auto.secondary : [],
  });
  return name;
}
