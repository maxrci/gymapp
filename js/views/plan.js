// Trainingsplan des AI-Coaches: Ziele, Einordnung, Woche mit geplanten Einheiten (tauschen, verschieben, auslassen)

import { state, exerciseMeta } from '../store.js';
import { pickExercises } from '../picker.js';
import { pageHead, emptyState } from '../components.js';
import { icon, sheet, toast } from '../ui.js';
import { esc, num, fmtDate, addDays, startOfWeek, weekday, WEEKDAYS, DAY, fmtKg } from '../utils.js';
import { startWorkout } from '../workout.js';
import { startGuidedCardio } from '../guided.js';
import {
  coachData, saveCoach, workoutCoachOn, cardioCoachOn, goalW, goalC, SPORTS, ALT, LEVELS, fmtDeadline, fmtHms, bodyComplete,
} from '../coach/core.js';
import { weekPlan, dayKey, substitute } from '../coach/plan.js';
import { SPLITS, activeSplit } from '../coach/splits.js';
import { alternatives } from '../coach/similar.js';
import { VERDICTS } from '../coach/assess.js';
import { progressWorkout, progressCardio, reviewGoals } from '../coach/review.js';
import { openCoachSetup } from '../coach/setup.js';

let weekOff = 0;
const expanded = new Set();
let cache = { key: '', plan: null };

const planFor = (week) => {
  const key = `${state.version}|${week}`;
  if (cache.key !== key) cache = { key, plan: weekPlan(week) };
  return cache.plan;
};

const W_LABEL = { strength: 'Stärker werden', muscle: 'Muskelaufbau', orm: '1RM-Ziel', bw: 'Körpergewicht' };

function goalCard(kind) {
  const g = kind === 'workout' ? goalW() : goalC();
  if (!g) {
    return `<button class="card coach-empty" data-act="setup" data-kind="${kind}">${icon(kind === 'workout' ? 'dumbbell' : 'bolt')}<div><b>${kind === 'workout' ? 'Workout-Ziel festlegen' : 'Cardio-Ziel festlegen'}</b><small>Der Coach erstellt daraus deinen Plan</small></div>${icon('right', 'muted')}</button>`;
  }
  const p = kind === 'workout' ? progressWorkout(g) : progressCardio(g);
  const V = VERDICTS[g.verdict] || VERDICTS.info;
  const title = kind === 'workout'
    ? (g.type === 'orm' ? `${esc(g.exercise)}: ${fmtKg(g.target)}` : g.type === 'bw' ? `Körpergewicht ${fmtKg(g.target)}` : W_LABEL[g.type])
    : `${esc(SPORTS[g.sport].label)}: ${num(g.distance, 1)} km${g.time ? ` in ${fmtHms(g.time)}` : ''}`;
  const meta = kind === 'workout'
    ? `${g.perWeek}× pro Woche · ${esc(SPLITS[activeSplit(g)].label)} · ${esc(LEVELS[g.level] || '')}`
    : `${g.perWeek}× pro Woche · ${esc(LEVELS[g.level] || '')}`;
  return `<section class="card goal-card ${kind}">
    <div class="gc-top"><span class="gc-ic">${icon(kind === 'workout' ? 'dumbbell' : 'bolt')}</span>
      <div class="gc-t"><b>${title}</b><small>${meta} · bis ${esc(fmtDeadline(g.deadline))}</small></div>
      <button class="btn ghost sm" data-act="setup" data-kind="${kind}">${icon('edit', 'xs')} Ändern</button>
      <button class="icon-btn" data-act="goal-menu" data-kind="${kind}" aria-label="Weitere Optionen">${icon('more')}</button></div>
    <div class="bar"><i style="width:${Math.round(p.pct * 100)}%"></i></div>
    <div class="gc-foot"><small>${esc(p.text)}</small>${g.verdict ? `<span class="csv-pill sm ${V.cls}">${esc(V.label)}</span>` : ''}</div>
  </section>`;
}

function reviewCards() {
  return reviewGoals().map((r) => `<section class="card review ${r.type}">
    <div class="rv-top">${icon(r.type === 'reached' ? 'trophy' : 'info')}<b>${esc(r.text)}</b></div>
    ${(r.lines || []).slice(0, 2).map((l) => `<p>${esc(l)}</p>`).join('')}
    ${r.proposals.map((p, i) => `<button class="cs-prop" data-act="review-apply" data-key="${esc(r.key)}" data-i="${i}">${icon('repeat', 'xs')}<div><b>${esc(p.label)}</b>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</div><span>Übernehmen</span></button>`).join('')}
    <div class="rv-acts">
      ${r.type === 'reached' ? `<button class="btn primary sm" data-act="setup" data-kind="${r.kind}">Neues Ziel</button>` : ''}
      <button class="btn ghost sm" data-act="review-dismiss" data-key="${esc(r.key)}">${r.type === 'reached' ? 'Später' : 'Bei meinem Ziel bleiben'}</button>
    </div>
  </section>`).join('');
}

// Muskelgruppen einer Einheit (statt abgeschnittener Übungsnamen)
export function musclesOf(s) {
  const m = [];
  for (const e of s.exercises || []) { const p = exerciseMeta(e.name).primary; if (p && !m.includes(p) && p !== 'Sonstiges') m.push(p); }
  return m.slice(0, 5).join(' · ');
}

function statusTag(s) {
  if (s.status === 'done') return `<span class="ps-tag done">${icon('check', 'xs')} erledigt</span>`;
  if (s.status === 'skipped') return '<span class="ps-tag skip">ausgelassen</span>';
  if (s.status === 'missed') return '<span class="ps-tag miss">verpasst</span>';
  if (s.moved) return '<span class="ps-tag">verschoben</span>';
  if (s.swappedFrom) return '<span class="ps-tag alt">Ersatz</span>';
  return '';
}

function sessionCard(s, { canAct, isNext }) {
  if (s.extra) return `<a class="ps extra" href="#/w/${encodeURIComponent(s.w.id)}">${icon('plus', 'xs')}<div><b>${esc(s.w.title)}</b><small>Eigenes Workout – zählt natürlich mit</small></div>${icon('right', 'muted')}</a>`;
  const open = expanded.has(s.id) || (isNext && !expanded.has(`-${s.id}`));
  const act = canAct && s.status === 'open';
  let body = '';
  if (open) {
    if (s.status === 'done') {
      body = `<a class="ps-done" href="#/w/${encodeURIComponent(s.done.id)}">${icon('check', 'xs')} Erledigt mit „${esc(s.done.title)}“${s.doneWith ? ` (${esc(ALT[s.doneWith].label)} als Ersatz)` : ''} ${icon('right', 'xs')}</a>`;
    } else if (s.kind === 'gym') {
      body = `<div class="ps-ex">${s.exercises.map((e, i) => `<div class="pse">
          <div class="pse-t"><b>${esc(e.name)}</b>${e.goal ? '<em class="pse-goal">Ziel</em>' : ''}<small>${esc(e.label)}</small>${e.reason && e.reason !== 'Nach Plan' ? `<small class="muted">${esc(e.reason)}</small>` : ''}</div>
          ${act && e.slot && !e.goal ? `<button class="pse-swap" data-act="swap" data-sid="${esc(s.id)}" data-i="${i}" aria-label="Übung tauschen oder entfernen">${icon('swap', 'xs')}</button>` : ''}
        </div>`).join('')}
        ${act ? `<div class="pse-more"><button class="link-btn sm" data-act="add-ex" data-sid="${esc(s.id)}">${icon('plus', 'xs')} Übung hinzufügen</button>${s.removedCount ? `<button class="link-btn sm" data-act="restore-ex" data-sid="${esc(s.id)}">${icon('repeat', 'xs')} ${s.removedCount} entfernte zurückholen</button>` : ''}</div>` : ''}</div>`;
    } else {
      body = `<p class="ps-desc">${esc(s.desc)}</p>`;
    }
    if (act) {
      const S = ALT[s.sport];
      body += `<div class="ps-acts">
        <button class="btn primary sm" data-act="go" data-sid="${esc(s.id)}">${icon('play', 'xs')} Starten</button>
        ${s.kind === 'cardio' && s.program && S?.device ? `<button class="btn ghost sm" data-act="go-guided" data-sid="${esc(s.id)}">Geführt</button>` : ''}
        ${s.kind === 'cardio' && s.type !== 'goal' ? `<button class="btn ghost sm" data-act="cswap" data-sid="${esc(s.id)}">${icon('swap', 'xs')} Gerät wechseln</button>` : ''}
        <button class="btn ghost sm" data-act="move" data-sid="${esc(s.id)}">Verschieben</button>
        <button class="btn ghost sm" data-act="skip" data-sid="${esc(s.id)}">Auslassen</button>
      </div>`;
    } else if (canAct && s.status === 'skipped') {
      body += `<div class="ps-acts"><button class="btn ghost sm" data-act="unskip" data-sid="${esc(s.id)}">Wieder einplanen</button></div>`;
    }
  }
  return `<div class="ps ${s.kind} ${s.status} ${open ? 'open' : ''}">
    <button class="ps-head" data-act="toggle" data-sid="${esc(s.id)}" data-next="${isNext ? 1 : 0}">
      <span class="ps-ic">${icon(s.kind === 'gym' ? 'dumbbell' : 'bolt', 'xs')}</span>
      <div><b>${esc(s.kind === 'cardio' ? `${ALT[s.sport].label} · ${s.title}` : s.title)}</b><small>${esc(s.kind === 'gym' ? `${s.exercises.length} Übungen · ${musclesOf(s)}` : s.sub)}</small></div>
      ${statusTag(s)}${icon(open ? 'up' : 'down', 'muted')}
    </button>${body}
  </div>`;
}

export function planView() {
  const on = workoutCoachOn() || cardioCoachOn();
  if (!on) {
    return {
      html: `${pageHead('Trainingsplan', { back: '#/' })}${emptyState('bolt', 'AI-Coach ist aus', 'Schalte in den Einstellungen den AI-Coach für Workouts und/oder Cardio ein – dann bekommst du hier deinen persönlichen Plan.', '<a class="btn primary" href="#/profile">Zu den Einstellungen</a>')}`,
    };
  }
  const thisWeek = startOfWeek(Date.now());
  const week = addDays(thisWeek, weekOff * 7);
  const plan = planFor(week);
  const starts = [goalW(), goalC()].filter(Boolean).map((g) => startOfWeek(g.start));
  const minWeek = starts.length ? Math.min(...starts) : thisWeek;
  const canAct = week >= thisWeek;
  const today = weekday(Date.now());
  const next = weekOff === 0 ? plan.sessions.filter((s) => s.status === 'open').sort((a, b) => a.day - b.day).find((s) => s.day >= today) : null;
  const phase = [plan.gym && `Kraft: ${plan.gym.phase.label}`, plan.cardio && `Cardio: ${plan.cardio.phase.label}`].filter(Boolean).join(' · ');
  const missed = plan.sessions.filter((s) => s.day == null);

  const days = plan.days.map((list, d) => {
    const date = addDays(week, d);
    const isToday = weekOff === 0 && d === today;
    return `<div class="pd ${isToday ? 'today' : ''} ${weekOff === 0 && d < today ? 'past' : ''}">
      <div class="pd-h"><b>${WEEKDAYS[d]}</b><small>${esc(fmtDate(date, { day: 'numeric', month: 'short' }))}${isToday ? ' · heute' : ''}</small></div>
      <div class="pd-l">${list.length ? list.map((s) => sessionCard(s, { canAct, isNext: s === next })).join('') : '<div class="pd-rest">Ruhetag</div>'}</div>
    </div>`;
  }).join('');

  const html = `
    ${pageHead('Trainingsplan', { back: '#/', sub: '<span class="ai-badge xs">AI</span> Coach · Demo' })}
    ${reviewCards()}
    ${workoutCoachOn() ? goalCard('workout') : ''}
    ${cardioCoachOn() ? goalCard('cardio') : ''}
    ${plan.sessions.length ? `
      <div class="week-nav">
        <button class="icon-btn" data-act="wk" data-d="-1" ${week <= minWeek ? 'disabled' : ''}>${icon('left')}</button>
        <div><b>${weekOff === 0 ? 'Diese Woche' : weekOff === 1 ? 'Nächste Woche' : `Woche ab ${esc(fmtDate(week, { day: 'numeric', month: 'short' }))}`}</b><small>${esc(phase)}</small></div>
        <button class="icon-btn" data-act="wk" data-d="1" ${weekOff >= 1 ? 'disabled' : ''}>${icon('right')}</button>
      </div>
      ${plan.combined ? `<p class="combo-note">${icon('repeat', 'xs')} Kraft & Cardio sind aufeinander abgestimmt: kein Beintag direkt vor, nach oder am Tag einer langen bzw. harten Einheit${plan.gym?.list.some((g) => g.exercises.some((e) => /Cardio/.test(e.reason || ''))) ? ', etwas weniger Bein-Umfang wegen des Ausdauertrainings' : ''}.</p>` : ''}
      ${plan.notes.map((n) => `<div class="card cs-note">${icon('info', 'xs')}<div><p>${esc(n)}</p></div></div>`).join('')}
      <div class="plan-days">${days}</div>
      ${missed.length ? `<div class="list-label">Nicht eingeplant</div>${missed.map((s) => sessionCard(s, { canAct, isNext: false })).join('')}` : ''}
      <p class="footnote">Der Plan verteilt sich automatisch auf die freien Tage. Trainierst du an einem anderen Tag oder etwas anderes, rutscht der Rest einfach nach.</p>
    ` : ''}
    <div class="set-group plan-tools">
      <button class="set-item" data-act="sick"><span class="si-ic">${icon('heart')}</span><span class="si-l">Ich war krank / hatte Pause<small class="si-sub">Der Plan startet dann leichter</small></span>${icon('right', 'muted')}</button>
      <button class="set-item" data-act="body"><span class="si-ic">${icon('user')}</span><span class="si-l">Körperdaten<small class="si-sub">${bodyComplete() ? 'für kcal & Makros' : 'noch unvollständig'}</small></span>${icon('right', 'muted')}</button>
    </div>
  `;

  const find = (el) => [...plan.sessions].find((s) => s.id === el.dataset.sid);
  return {
    html,
    handlers: {
      wk: (el, rr) => { weekOff = Math.min(1, weekOff + +el.dataset.d); rr(); },
      toggle: (el, rr) => {
        const id = el.dataset.sid;
        if (el.dataset.next === '1') { if (expanded.has(`-${id}`)) expanded.delete(`-${id}`); else expanded.add(`-${id}`); }
        else if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        rr();
      },
      setup: (el) => openCoachSetup(el.dataset.kind),
      body: () => openCoachSetup('body'),
      'goal-menu': async (el) => {
        const kind = el.dataset.kind;
        const v = await sheet({ title: kind === 'workout' ? 'Workout-Ziel' : 'Cardio-Ziel', options: [
          { label: 'Ziel ändern', value: 'edit', icon: 'edit' },
          { label: 'Ziel löschen', value: 'del', icon: 'trash', danger: true },
        ] });
        if (v === 'edit') openCoachSetup(kind);
        if (v === 'del') { await saveCoach({ [kind]: null }); toast('Ziel gelöscht'); }
      },
      'review-apply': async (el) => {
        const r = reviewGoals().find((x) => x.key === el.dataset.key);
        const p = r?.proposals[+el.dataset.i];
        if (!p) return;
        const g = coachData()[r.kind];
        await saveCoach({ [r.kind]: { ...g, ...p.patch, verdict: 'ok' } });
        toast('Ziel angepasst');
      },
      'review-dismiss': async (el) => { await saveCoach({ dismiss: { ...(coachData().dismiss || {}), [el.dataset.key]: Date.now() } }); },
      go: (el) => startPlanned(find(el)),
      'go-guided': (el) => {
        const s = find(el);
        startGuidedCardio({ programId: s.program, device: ALT[s.sport].device, planId: s.id, opt: s.programOpt ?? undefined });
      },
      move: async (el) => {
        const s = find(el);
        const from = weekOff === 0 ? today : 0;
        const v = await sheet({ title: `${s.title} verschieben`, options: WEEKDAYS.map((d, i) => ({ label: `${d} · ${fmtDate(addDays(week, i), { day: 'numeric', month: 'short' })}${i === today && weekOff === 0 ? ' (heute)' : ''}`, value: String(i), active: s.day === i })).slice(from) });
        if (v == null) return;
        await saveCoach({ moves: { ...(coachData().moves || {}), [s.id]: +v } });
      },
      // Cardio geräteunabhängig: Einheit auf ein anderes Gerät umrechnen
      cswap: async (el) => {
        const s = find(el);
        const g = goalC();
        const base = s.orig || s;
        const opts = Object.keys(ALT).filter((sp) => sp !== s.sport && !(sp === 'walk' && base.type !== 'easy')).map((sp) => {
          const x = substitute(base, sp, g);
          return { label: `${ALT[sp].label} · ca. ${fmtHms(x.sec)}${x.km ? ` · ~${num(x.km, 1)} km` : ''}`, value: sp };
        });
        if (s.swappedFrom) opts.unshift({ label: `Zurück zu ${ALT[s.swappedFrom].label} (${num(base.km, 1)} km)`, value: '__orig', icon: 'repeat' });
        const msg = base.type === 'long' && g.sport === base.sport
          ? `Tipp: Die lange Einheit trainiert gezielt für dein ${ALT[g.sport].label}-Ziel – wenn möglich lieber eine lockere Einheit tauschen. Geht aber natürlich trotzdem.`
          : 'Gleicher Trainingsreiz auf einem anderen Gerät: gleiche Pulszone, die Dauer wird passend umgerechnet.';
        const v = await sheet({ title: `${base.title} auf anderem Gerät`, message: msg, options: opts });
        if (!v) return;
        const how = await sheet({ title: v === '__orig' ? 'Zurückstellen' : `${ALT[v].label} statt ${ALT[base.sport].label}`, options: [
          { label: 'Nur diese Woche', value: 'week', icon: 'calendar' },
          { label: 'Jede Woche an dieser Stelle', value: 'always', icon: 'repeat' },
        ] });
        if (!how) return;
        const C = coachData();
        const cswap = { ...(C.cswap || {}) }, cswapSlot = { ...(C.cswapSlot || {}) };
        if (how === 'week') cswap[s.id] = v;
        else { delete cswap[s.id]; if (v === '__orig') delete cswapSlot[s.slot]; else cswapSlot[s.slot] = v; }
        await saveCoach({ cswap, cswapSlot });
        toast(v === '__orig' ? 'Zurückgestellt' : `${ALT[v].label}: ca. ${fmtHms(substitute(base, v, g).sec)}`);
      },
      skip: async (el) => { const s = find(el); await saveCoach({ skips: { ...(coachData().skips || {}), [s.id]: true } }); toast('Ausgelassen – kein Problem'); },
      unskip: async (el) => { const s = find(el); const k = { ...(coachData().skips || {}) }; delete k[s.id]; await saveCoach({ skips: k }); },
      swap: async (el) => {
        const s = find(el);
        const e = s.exercises[+el.dataset.i];
        const alt = alternatives(e.name);
        const swaps = coachData().swaps || {};
        const opts = [
          ...alt.same.slice(0, 7).map((n) => ({ label: n, value: n })),
          ...alt.muscle.slice(0, 4).map((n) => ({ label: `${n} · gleicher Muskel`, value: n })),
        ];
        if (swaps[e.slot] && !e.added) opts.push({ label: 'Coach-Vorschlag wiederherstellen', value: '__reset', icon: 'repeat' });
        opts.push({ label: 'Aus dieser Einheit entfernen', value: '__remove', icon: 'trash', danger: true });
        const v = await sheet({ title: `${e.name} tauschen`, message: 'Gilt ab jetzt für diese Einheit – auch in den nächsten Wochen.', options: opts });
        if (!v) return;
        const C = coachData();
        if (e.added) {
          const k = dayKey(s.split, s.dayId);
          const list = [...(C.added?.[k] || [])];
          const at = list.indexOf(e.name);
          if (at < 0) return;
          if (v === '__remove') list.splice(at, 1); else list[at] = v;
          await saveCoach({ added: { ...(C.added || {}), [k]: list } });
          return toast(v === '__remove' ? 'Entfernt' : `Getauscht: ${v}`);
        }
        if (v === '__remove') {
          await saveCoach({ removed: { ...(C.removed || {}), [e.slot]: true } });
          return toast('Entfernt – über „zurückholen“ wieder da');
        }
        const ns = { ...swaps };
        if (v === '__reset') delete ns[e.slot]; else ns[e.slot] = v;
        await saveCoach({ swaps: ns });
        toast(v === '__reset' ? 'Zurückgesetzt' : `Getauscht: ${v}`);
      },
      'add-ex': async (el) => {
        const s = find(el);
        const names = await pickExercises({ multi: true, title: `Zu „${s.title}“ hinzufügen` });
        if (!names?.length) return;
        const C = coachData();
        const k = dayKey(s.split, s.dayId);
        const list = [...new Set([...(C.added?.[k] || []), ...names])];
        await saveCoach({ added: { ...(C.added || {}), [k]: list } });
        toast(names.length > 1 ? `${names.length} Übungen hinzugefügt` : `${names[0]} hinzugefügt`);
      },
      'restore-ex': async (el) => {
        const s = find(el);
        const r = { ...(coachData().removed || {}) };
        for (const k of Object.keys(r)) if (k.startsWith(`${dayKey(s.split, s.dayId)}:`)) delete r[k];
        await saveCoach({ removed: r });
        toast('Übungen zurückgeholt');
      },
      sick: async () => {
        const v = await sheet({ title: 'Wie lange warst du raus?', message: 'Der Coach plant danach leichter: gleich viel oder weniger Gewicht als zuletzt und weniger Umfang.', options: [
          { label: 'Ein paar Tage', value: '4' }, { label: 'Etwa 1 Woche', value: '7' }, { label: 'Etwa 2 Wochen', value: '14' }, { label: '3 Wochen oder länger', value: '28' },
        ] });
        if (!v) return;
        const now = Date.now();
        const pauses = [...(coachData().pauses || []), { from: now - +v * DAY, to: now, days: +v }].slice(-10);
        await saveCoach({ pauses });
        toast('Plan angepasst – gute Besserung!');
      },
    },
  };
}

// Geplante Einheit starten (Werte sind vorausgefüllt, alles bleibt änderbar)
export function startPlanned(s) {
  if (!s) return;
  if (s.kind === 'gym') {
    return startWorkout({
      title: s.title, planId: s.id,
      exercises: s.exercises.map((e) => ({ name: e.name, sets: e.sets, plan: { label: e.label, reason: e.reason, slot: e.slot } })),
    });
  }
  const S = ALT[s.sport];
  return startWorkout({
    title: `Cardio: ${s.title}`, planId: s.id,
    exercises: [{ name: S.exercise, sets: [{ type: 'normal', distance: s.km || null, duration: s.sec }], plan: { label: s.sub, reason: s.desc } }],
  });
}
