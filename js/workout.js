// Workout-Editor: laufendes Workout, Workout bearbeiten/nachtragen, Routine bearbeiten

import {
  state, setActive, persistActive, saveWorkout, saveRoutine, exerciseMeta, saveExerciseMeta,
} from './store.js';
import { idx, previousSession, PR_LABELS } from './stats.js';
import { TYPES } from './library.js';
import { pickExercises } from './picker.js';
import { icon, sheet, confirmDialog, formDialog, toast, overlay } from './ui.js';
import {
  $, esc, uid, num, fmtClock, fmtVolume, fmtKg, fmtDate, fmtDur, parseNum, debounce,
} from './utils.js';
import { setLoad } from './stats.js';
import { aiOn, suggest } from './ai.js';
import { unlockAudio, restDoneSound, prPopup } from './fx.js';
import { stageFor } from './gamification.js';
import { fighterFx } from './fighter.js';
import { poseSVG, poseFor } from './poses.js';
import { weekStreaks } from './stats.js';
import { e1rm } from './utils.js';
import { alternatives } from './coach/similar.js';
import { cardioKind, cardioSpeed, speedRecord } from './compete.js';
import { prValue } from './components.js';

let ed = null; // { mode: 'active'|'edit'|'routine', data, isNew }
let ticker = null;
let wakeLock = null;
let onCloseCb = () => {};

const root = () => $('#editor');
export const editorOpen = () => !!ed && !root().hidden;
export function onEditorClose(fn) { onCloseCb = fn; }

const saveSoon = debounce(() => persistActive(), 400);

// ---------- Öffnen ----------
export function openActive() {
  if (!state.active) return;
  ed = { mode: 'active', data: state.active };
  show();
}

function blankSet(type = 'normal', target) {
  return { type, weight: null, reps: null, distance: null, duration: null, done: false, target: target || null };
}

// Neue Übung im Editor – mit AI-Vorschlag, falls der AI-Mode aktiv ist
function makeExercise(name, templateSets, rest = null, plan = null) {
  const ex = { name, notes: '', rest, sets: null, ai: null };
  // Aus dem Trainingsplan des AI-Coaches: Vorgaben übernehmen
  if (plan) {
    ex.sets = setsFromTemplate(name, templateSets);
    ex.ai = { label: plan.label, reason: plan.reason, kind: 'plan' };
    if (plan.slot) ex.slot = plan.slot;
    return ex;
  }
  if (aiOn() && ed?.mode !== 'routine') {
    const sg = suggest(name);
    if (sg) {
      ex.sets = sg.sets.map((s) => blankSet(s.type, pickTarget(s)));
      ex.ai = { label: sg.label, reason: sg.reason, kind: sg.kind };
      return ex;
    }
  }
  ex.sets = setsFromTemplate(name, templateSets);
  return ex;
}

function setsFromTemplate(name, templateSets) {
  if (templateSets?.length) {
    return templateSets.map((s) => blankSet(s.type || 'normal', pickTarget(s)));
  }
  const prev = previousSession(name);
  if (prev) return prev.exercise.sets.map((s) => blankSet(s.type));
  const t = typeOf(name);
  return t === 'cardio' || t === 'duration' ? [blankSet()] : [blankSet(), blankSet(), blankSet()];
}
const pickTarget = (s) => (s.weight != null || s.reps != null || s.distance != null || s.duration != null
  ? { weight: s.weight, reps: s.reps, distance: s.distance, duration: s.duration } : null);

export async function startWorkout({ title = 'Workout', exercises = [], routineId = null, planId = null } = {}) {
  if (state.active) {
    const ok = await confirmDialog('Es läuft bereits ein Workout. Möchtest du es verwerfen und ein neues starten?', 'Verwerfen & neu starten', true);
    if (!ok) { openActive(); return; }
  }
  const a = {
    id: uid(), title, start: Date.now(), routineId, planId, rest: null, description: '',
    exercises: exercises.map((e) => makeExercise(e.name, e.sets, e.rest ?? null, e.plan || null)),
  };
  await setActive(a);
  ed = { mode: 'active', data: a };
  show();
}

export function editWorkout(w) {
  ed = { mode: 'edit', data: structuredClone(w) };
  show();
}
export function logPastWorkout() {
  const now = Date.now();
  ed = { mode: 'edit', isNew: true, data: { id: uid(), title: 'Workout', start: now - 3600e3, end: now, description: '', exercises: [], source: 'app' } };
  show();
}
export function editRoutine(r) {
  ed = {
    mode: 'routine',
    isNew: !r,
    data: r ? structuredClone(r) : { id: uid(), name: 'Neue Routine', exercises: [] },
  };
  show();
}

function show() {
  const r = root();
  r.hidden = false;
  render(false);
  requestAnimationFrame(() => r.classList.add('open'));
  startTicker();
  if (ed.mode === 'active') acquireWake();
}

function close() {
  const r = root();
  r.classList.remove('open');
  setTimeout(() => { r.hidden = true; r.innerHTML = ''; }, 250);
  stopTicker();
  releaseWake();
  ed = null;
  onCloseCb();
}

// ---------- Helfer ----------
function typeOf(name) {
  return idx().ex.get(name)?.type || exerciseMeta(name).type;
}
const colsOf = (type) => TYPES[type]?.cols || ['weight', 'reps'];
const titleOf = () => (ed.mode === 'routine' ? ed.data.name : ed.data.title);
const COL_LABEL = { weight: 'KG', reps: 'WDH', distance: 'KM', duration: 'MIN' };
const COL_MODE = { weight: 'decimal', reps: 'numeric', distance: 'decimal', duration: 'decimal' };

function fmtSetShort(s, type) {
  if (!s) return '–';
  if (type === 'cardio') return [s.distance ? `${num(s.distance, 2)} km` : '', s.duration ? fmtClock(s.duration) : ''].filter(Boolean).join(' · ') || '–';
  if (type === 'duration') return s.duration ? fmtClock(s.duration) : '–';
  if (type === 'bodyweight') return s.reps ? `${s.reps} Wdh.` : '–';
  if (type === 'weighted_bw') return s.reps ? `${s.weight ? `+${num(s.weight)} kg` : 'Eigengew.'} × ${s.reps}` : '–';
  return s.reps != null ? `${num(s.weight ?? 0)} kg × ${s.reps}` : '–';
}
function colVal(s, c) {
  const v = s[c];
  if (v == null) return '';
  return c === 'duration' ? String(+(v / 60).toFixed(2)).replace('.', ',') : String(v).replace('.', ',');
}
function placeholderFor(prevSet, target, c) {
  const src = target && target[c] != null ? target : prevSet;
  if (!src || src[c] == null) return '';
  return c === 'duration' ? String(+(src[c] / 60).toFixed(2)).replace('.', ',') : String(src[c]).replace('.', ',');
}

function liveStats() {
  const bw = state.settings.bodyweight;
  let vol = 0, sets = 0;
  for (const e of ed.data.exercises) {
    const t = typeOf(e.name);
    for (const s of e.sets) {
      const counts = ed.mode === 'active' ? s.done : (s.reps || s.duration || s.distance);
      if (!counts) continue;
      if (s.type !== 'warmup') sets++;
      if (s.type !== 'warmup' || state.settings.countWarmups) vol += setLoad(t, s, bw) * (s.reps || 0);
    }
  }
  return { vol, sets };
}

// ---------- Rendering ----------
function render(keepScroll = true) {
  const r = root();
  const body = r.querySelector('.ed-body');
  const sc = keepScroll && body ? body.scrollTop : 0;
  r.innerHTML = html();
  const nb = r.querySelector('.ed-body');
  if (nb) nb.scrollTop = sc;
  tick();
}

function html() {
  const m = ed.mode;
  const d = ed.data;
  const left = m === 'active'
    ? `<button class="icon-btn" data-act="minimize" aria-label="Minimieren">${icon('down')}</button>`
    : `<button class="link-btn" data-act="cancel">Abbrechen</button>`;
  const right = m === 'active'
    ? `<button class="btn primary sm" data-act="finish">Beenden</button>`
    : `<button class="btn primary sm" data-act="save">Speichern</button>`;
  const sub = m === 'active' ? '<span data-live="clock">0:00</span>'
    : m === 'edit' ? esc(fmtDate(d.start)) : 'Routine';

  let meta = '';
  if (m !== 'routine') {
    const ls = liveStats();
    meta = `<div class="ed-stats">
      <div><small>Dauer</small><b data-live="dur">${m === 'edit' ? fmtDur((d.end - d.start) / 1000) : '0:00'}</b></div>
      <div><small>Volumen</small><b data-live="vol">${fmtVolume(ls.vol)}</b></div>
      <div><small>Sätze</small><b data-live="sets">${ls.sets}</b></div>
    </div>`;
  }
  let editFields = '';
  if (m === 'edit') {
    const dt = new Date(d.start - new Date(d.start).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    editFields = `<div class="ed-fields card">
      <label class="field inline"><span>Start</span><input type="datetime-local" data-f="start" value="${dt}"></label>
      <label class="field inline"><span>Dauer (Min.)</span><input type="number" inputmode="numeric" data-f="durMin" value="${Math.round((d.end - d.start) / 60000)}"></label>
    </div>`;
  }
  const exHtml = d.exercises.map((e, i) => exerciseHtml(e, i)).join('');
  return `
    <div class="ed-head">
      ${left}
      <button class="ed-title" data-act="rename"><span>${esc(titleOf())}</span>${icon('edit', 'xs')}</button>
      ${right}
    </div>
    <div class="ed-subline">${sub}</div>
    ${meta}
    <div class="ed-body">
      ${editFields}
      ${d.exercises.length ? exHtml : `<div class="empty">
        <div class="empty-ic">${icon('dumbbell')}</div>
        <h3>Noch keine Übungen</h3><p>Füge deine erste Übung hinzu.</p></div>`}
      <button class="btn primary block" data-act="add-ex">${icon('plus')} Übung hinzufügen</button>
      ${m === 'active' ? `<button class="btn danger-ghost block" data-act="discard">Workout verwerfen</button>` : ''}
      <div class="ed-spacer"></div>
    </div>
    ${m === 'active' ? '<div class="rest-bar" hidden></div>' : ''}
  `;
}

function exerciseHtml(e, i) {
  const m = ed.mode;
  const type = typeOf(e.name);
  const meta = exerciseMeta(e.name);
  const cols = colsOf(type);
  const before = m === 'edit' ? ed.data.start : Infinity;
  const prev = previousSession(e.name, before, ed.data.id);
  const prevSets = prev?.exercise.sets || [];
  const chk = m === 'active';
  const rest = e.rest ?? meta.rest ?? state.settings.restDefault;
  let n = 0;
  const rows = e.sets.map((s, j) => {
    const label = s.type === 'warmup' ? 'W' : s.type === 'dropset' ? 'D' : s.type === 'failure' ? 'F' : String(++n);
    const ps = prevSets[j];
    return `<div class="set-row ${s.done ? 'done' : ''} ${s.pr ? 'pr' : ''} c${cols.length} ${chk ? '' : 'nochk'}" data-ex="${i}" data-set="${j}">
      <button class="set-badge t-${esc(s.type)}" data-act="set-type">${label}</button>
      <button class="set-prev" data-act="fill-prev">${esc(fmtSetShort(ps, type))}</button>
      ${cols.map((c) => `<input class="set-in" data-f="${c}" inputmode="${COL_MODE[c]}" value="${esc(colVal(s, c))}" placeholder="${esc(placeholderFor(ps, s.target, c))}" autocomplete="off" enterkeyhint="next">`).join('')}
      ${chk ? `<button class="set-chk" data-act="done" aria-label="Satz abhaken">${icon('check')}</button>` : ''}
    </div>`;
  }).join('');
  const colHead = cols.map((c) => `<span>${type === 'weighted_bw' && c === 'weight' ? '+KG' : COL_LABEL[c]}</span>`).join('');
  return `<section class="ex-card" data-ex="${i}">
    <div class="ex-head">
      <div class="ex-avatar pose-av">${poseSVG(poseFor(e.name), { stage: stageFor(weekStreaks().current).index })}</div>
      <div class="ex-titles">
        <button class="ex-name" data-act="ex-info">${esc(e.name)}</button>
        <div class="ex-sub">${esc(meta.primary)}${m !== 'edit' ? ` · <button class="rest-chip" data-act="ex-rest">${icon('timer', 'xs')} ${rest ? fmtClock(rest) : 'Aus'}</button>` : ''}</div>
      </div>
      <button class="icon-btn" data-act="ex-menu" aria-label="Optionen">${icon('more')}</button>
    </div>
    ${e.ai && m === 'active' ? `<div class="ai-chip k-${e.ai.kind}"><span class="ai-badge">AI</span><div><b>${esc(e.ai.label)}</b><small>${esc(e.ai.reason)}</small></div></div>` : ''}
    ${e.notes || e.showNotes ? `<textarea class="ex-notes" data-f="notes" rows="1" placeholder="Notiz hinzufügen…">${esc(e.notes || '')}</textarea>` : ''}
    <div class="set-row head c${cols.length} ${chk ? '' : 'nochk'}"><span>SATZ</span><span>VORHER</span>${colHead}${chk ? `<span>${icon('check', 'xs')}</span>` : ''}</div>
    ${rows}
    <button class="add-set" data-act="add-set">${icon('plus', 'xs')} Satz hinzufügen</button>
  </section>`;
}

// ---------- Live-Updates ----------
function tick() {
  if (!ed) return;
  const r = root();
  const d = ed.data;
  if (ed.mode === 'active') {
    const el = r.querySelector('[data-live="clock"]');
    const t = fmtClock((Date.now() - d.start) / 1000);
    if (el) el.textContent = t;
    const du = r.querySelector('[data-live="dur"]');
    if (du) du.textContent = t;
    updateRestBar();
  }
}
function startTicker() { stopTicker(); ticker = setInterval(tick, 500); }
function stopTicker() { clearInterval(ticker); ticker = null; }
function updateLiveStats() {
  if (!ed || ed.mode === 'routine') return;
  const ls = liveStats();
  const r = root();
  const v = r.querySelector('[data-live="vol"]');
  const s = r.querySelector('[data-live="sets"]');
  if (v) v.textContent = fmtVolume(ls.vol);
  if (s) s.textContent = ls.sets;
}

// ---------- Pausentimer ----------
function startRest(sec) {
  if (!sec || ed?.mode !== 'active') return;
  ed.data.rest = { end: Date.now() + sec * 1000, total: sec, notified: false };
  saveSoon();
  updateRestBar();
}
function updateRestBar() {
  const bar = root().querySelector('.rest-bar');
  if (!bar) return;
  const rest = ed.data.rest;
  if (!rest) { bar.hidden = true; return; }
  const left = (rest.end - Date.now()) / 1000;
  if (left <= 0) {
    if (!rest.notified) { rest.notified = true; restDone(); }
    ed.data.rest = null;
    saveSoon();
    bar.hidden = true;
    return;
  }
  if (bar.hidden || !bar.firstChild) {
    bar.innerHTML = `<div class="rest-prog"><i></i></div>
      <div class="rest-row"><button class="btn ghost sm" data-act="rest-minus">−15</button>
      <div class="rest-time">${icon('timer')}<b></b></div>
      <button class="btn ghost sm" data-act="rest-plus">+15</button>
      <button class="btn primary sm" data-act="rest-skip">Überspringen</button></div>`;
    bar.hidden = false;
  }
  bar.querySelector('b').textContent = fmtClock(Math.ceil(left));
  bar.querySelector('.rest-prog i').style.width = `${(left / rest.total) * 100}%`;
}
function restDone() {
  restDoneSound();
  navigator.vibrate?.([200, 100, 200]);
  toast('Pause vorbei – nächster Satz');
}

// ---------- Live-Rekorde ----------
function checkPR(ex, set) {
  if (set.type === 'warmup') return null;
  const x = idx().ex.get(ex.name);
  if (!x) return null; // erste Einheit überhaupt → kein Rekord
  const t = x.type;
  const bw = state.settings.bodyweight;
  const best = { e1rm: x.best.e1rm, weight: x.best.weight, reps: x.best.reps };
  for (const e of ed.data.exercises) {
    if (e.name !== ex.name) continue;
    for (const q of e.sets) {
      if (q === set || !q.done || q.type === 'warmup') continue;
      best.e1rm = Math.max(best.e1rm, e1rm(setLoad(t, q, bw), q.reps));
      best.weight = Math.max(best.weight, q.weight || 0);
      best.reps = Math.max(best.reps, q.reps || 0);
    }
  }
  const out = [];
  if (t === 'weight' || t === 'weighted_bw') {
    const est = e1rm(setLoad(t, set, bw), set.reps);
    if (x.best.e1rm > 0 && est > best.e1rm + 1e-9) out.push({ kind: 'e1rm', value: est });
    if (x.best.weight > 0 && (set.weight || 0) > best.weight + 1e-9) out.push({ kind: 'weight', value: set.weight });
  } else if (t === 'bodyweight') {
    if (x.best.reps > 0 && (set.reps || 0) > best.reps) out.push({ kind: 'reps', value: set.reps });
  }
  // Cardio: weiter, länger oder schneller als je zuvor (Summe der abgehakten Sätze dieser Übung)
  const ck = cardioKind(ex.name, t);
  if (ck) {
    let km = 0, sec = 0;
    for (const e of ed.data.exercises) {
      if (e.name !== ex.name) continue;
      for (const q of e.sets) if (q === set || (q.done && q.type !== 'warmup')) { km += q.distance || 0; sec += q.duration || 0; }
    }
    if (t === 'cardio' && x.best.distance > 0 && km > x.best.distance + 1e-9) out.push({ kind: 'distance', value: km });
    if (x.best.duration > 0 && sec > x.best.duration + 1e-9) out.push({ kind: 'duration', value: sec });
    if (t === 'cardio') {
      const v = cardioSpeed(ck, km, sec);
      if (speedRecord(x.spd, km, v)) out.push({ kind: 'speed', value: v });
    }
  }
  return out.length ? out : null;
}

function prDetail(ex, set, prs) {
  const type = typeOf(ex.name);
  const setTxt = fmtSetShort(set, type);
  const parts = prs.map((p) => (p.kind === 'e1rm' ? `1RM ≈ ${num(p.value, 1)} kg` : p.kind === 'weight' ? 'Höchstes Gewicht' : p.kind === 'reps' ? 'Meiste Wiederholungen'
    : `${PR_LABELS[p.kind]}: ${prValue({ ...p, exercise: ex.name })}`));
  return `${setTxt} · ${parts.join(' · ')}`;
}

// ---------- Bildschirm anlassen ----------
async function acquireWake() {
  if (!state.settings.keepAwake || !('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
}
function releaseWake() { wakeLock?.release?.(); wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ed?.mode === 'active') { acquireWake(); tick(); }
});

// ---------- Events ----------
export function initEditor() {
  const r = root();
  r.addEventListener('input', onInput);
  r.addEventListener('click', onClick);
  r.addEventListener('focusin', (e) => {
    if (e.target.matches('.set-in')) setTimeout(() => e.target.select?.(), 0);
  });
}

function locate(el) {
  const row = el.closest('[data-ex]');
  const i = row ? +row.dataset.ex : -1;
  const j = el.closest('[data-set]') ? +el.closest('[data-set]').dataset.set : -1;
  return { i, j, ex: ed.data.exercises[i], set: ed.data.exercises[i]?.sets[j] };
}

function onInput(e) {
  if (!ed) return;
  const t = e.target;
  const f = t.dataset.f;
  if (!f) return;
  if (f === 'start') {
    const ts = new Date(t.value).getTime();
    if (!isNaN(ts)) { const dur = ed.data.end - ed.data.start; ed.data.start = ts; ed.data.end = ts + dur; }
    return;
  }
  if (f === 'durMin') {
    const v = parseNum(t.value);
    if (v != null && v >= 0) ed.data.end = ed.data.start + v * 60000;
    const du = root().querySelector('[data-live="dur"]');
    if (du) du.textContent = fmtDur((ed.data.end - ed.data.start) / 1000);
    return;
  }
  const { ex, set } = locate(t);
  if (!ex) return;
  if (f === 'notes') {
    ex.notes = t.value;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  } else if (set) {
    let v = parseNum(t.value);
    if (f === 'duration' && v != null) v = Math.round(v * 60);
    if (f === 'reps' && v != null) v = Math.round(v);
    set[f] = v;
    updateLiveStats();
  }
  if (ed.mode === 'active') saveSoon();
}

async function onClick(e) {
  if (!ed) return;
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const d = ed.data;
  unlockAudio();
  const { i, j, ex, set } = locate(b);

  switch (act) {
    case 'minimize': close(); break;
    case 'cancel':
      if (await confirmDialog('Änderungen verwerfen?', 'Verwerfen', true)) close();
      break;
    case 'rename': {
      const res = await formDialog({ title: ed.mode === 'routine' ? 'Routine umbenennen' : 'Workout umbenennen', fields: [{ name: 'v', label: 'Name', value: titleOf() }] });
      if (res && res.v.trim()) {
        if (ed.mode === 'routine') d.name = res.v.trim(); else d.title = res.v.trim();
        commit();
      }
      break;
    }
    case 'add-ex': {
      const names = await pickExercises({ multi: true });
      if (names?.length) {
        for (const n of names) d.exercises.push(makeExercise(n));
        commit();
        setTimeout(() => {
          const cards = root().querySelectorAll('.ex-card');
          cards[cards.length - names.length]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
      break;
    }
    case 'add-set': {
      const last = ex.sets[ex.sets.length - 1];
      const ns = blankSet(last && last.type !== 'warmup' ? last.type : 'normal');
      if (ed.mode !== 'active' && last) Object.assign(ns, { weight: last.weight, reps: last.reps, distance: last.distance, duration: last.duration });
      ex.sets.push(ns);
      commit();
      break;
    }
    case 'set-type': {
      const v = await sheet({
        title: `Satz ${j + 1}`,
        options: [
          { label: 'Normaler Satz', value: 'normal', active: set.type === 'normal' },
          { label: 'Aufwärmsatz', value: 'warmup', active: set.type === 'warmup' },
          { label: 'Drop-Satz', value: 'dropset', active: set.type === 'dropset' },
          { label: 'Bis zum Versagen', value: 'failure', active: set.type === 'failure' },
          { label: 'Satz löschen', value: 'delete', danger: true, icon: 'trash' },
        ],
      });
      if (!v) break;
      if (v === 'delete') ex.sets.splice(j, 1); else set.type = v;
      commit();
      break;
    }
    case 'fill-prev': {
      const prev = previousSession(ex.name, ed.mode === 'edit' ? d.start : Infinity, d.id);
      const ps = prev?.exercise.sets[j];
      if (!ps) break;
      for (const c of ['weight', 'reps', 'distance', 'duration']) set[c] = ps[c];
      commit();
      break;
    }
    case 'done': {
      if (!set.done) {
        const type = typeOf(ex.name);
        const cols = colsOf(type);
        const prev = previousSession(ex.name, Infinity, d.id)?.exercise.sets[j];
        for (const c of cols) {
          if (set[c] == null) {
            const src = set.target && set.target[c] != null ? set.target : prev;
            if (src && src[c] != null) set[c] = src[c];
          }
        }
        const ok = type === 'cardio' ? set.distance || set.duration : type === 'duration' ? set.duration : set.reps;
        if (!ok) {
          toast('Bitte zuerst Werte eintragen');
          b.closest('.set-row').classList.add('shake');
          setTimeout(() => b.closest('.set-row')?.classList.remove('shake'), 400);
          break;
        }
        set.done = true;
        const prs = ed.mode === 'active' ? checkPR(ex, set) : null;
        set.pr = !!prs;
        if (prs) prPopup({ exercise: ex.name, detail: prDetail(ex, set, prs), stage: stageFor(weekStreaks().current).index });
        const meta = exerciseMeta(ex.name);
        startRest(ex.rest ?? meta.rest ?? state.settings.restDefault);
      } else { set.done = false; set.pr = false; }
      commit();
      break;
    }
    case 'ex-rest': {
      const meta = exerciseMeta(ex.name);
      const cur = ex.rest ?? meta.rest ?? state.settings.restDefault;
      const opts = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map((s) => ({ label: s ? fmtClock(s) : 'Aus', value: String(s), active: s === cur }));
      const v = await sheet({ title: `Pausenzeit · ${ex.name}`, options: opts });
      if (v != null) {
        ex.rest = +v;
        await saveExerciseMeta(ex.name, { rest: +v });
        commit();
      }
      break;
    }
    case 'ex-info': {
      if (ed.mode !== 'active') { toast('Speichere zuerst, um Details zu öffnen'); break; }
      close();
      location.hash = `#/ex/${encodeURIComponent(ex.name)}`;
      break;
    }
    case 'ex-menu': {
      const v = await sheet({
        title: ex.name,
        options: [
          { label: ex.notes || ex.showNotes ? 'Notiz bearbeiten' : 'Notiz hinzufügen', value: 'note', icon: 'note' },
          ...(i > 0 ? [{ label: 'Nach oben', value: 'up', icon: 'up' }] : []),
          ...(i < d.exercises.length - 1 ? [{ label: 'Nach unten', value: 'down', icon: 'down' }] : []),
          ...(ed.mode === 'active' ? [{ label: 'Ähnliche Übung (Gerät belegt?)', value: 'similar', icon: 'repeat' }] : []),
          { label: 'Übung ersetzen', value: 'replace', icon: 'swap' },
          { label: 'Übung entfernen', value: 'remove', icon: 'trash', danger: true },
        ],
      });
      if (v === 'note') { ex.showNotes = true; commit(); setTimeout(() => root().querySelector(`.ex-card[data-ex="${i}"] .ex-notes`)?.focus(), 30); }
      if (v === 'up') { [d.exercises[i - 1], d.exercises[i]] = [d.exercises[i], d.exercises[i - 1]]; commit(); }
      if (v === 'down') { [d.exercises[i + 1], d.exercises[i]] = [d.exercises[i], d.exercises[i + 1]]; commit(); }
      if (v === 'similar') {
        const alt = alternatives(ex.name);
        const list = [...alt.same.slice(0, 7), ...alt.muscle.slice(0, 4)];
        if (!list.length) { toast('Keine ähnliche Übung gefunden'); break; }
        const n = await sheet({ title: `Statt ${ex.name}`, message: ex.slot ? 'Wird auch im Trainingsplan für diese Einheit übernommen.' : '', options: list.map((x) => ({ label: x, value: x })) });
        if (n) {
          const done = ex.sets.filter((s) => s.done);
          const fresh = makeExercise(n, null, ex.rest);
          Object.assign(ex, { name: n, sets: done.length ? [...done, ...fresh.sets.slice(done.length)] : fresh.sets, ai: fresh.ai || ex.ai });
          if (ex.slot) { const { coachData, saveCoach } = await import('./coach/core.js'); await saveCoach({ swaps: { ...(coachData().swaps || {}), [ex.slot]: n } }); }
          commit();
        }
      }
      if (v === 'replace') {
        const n = await pickExercises({ multi: false, title: 'Übung ersetzen' });
        if (n?.[0]) { ex.name = n[0]; commit(); }
      }
      if (v === 'remove' && await confirmDialog(`„${ex.name}“ entfernen?`, 'Entfernen', true)) { d.exercises.splice(i, 1); commit(); }
      break;
    }
    case 'rest-minus': if (d.rest) { d.rest.end -= 15000; d.rest.total = Math.max(d.rest.total - 15, 1); updateRestBar(); saveSoon(); } break;
    case 'rest-plus': if (d.rest) { d.rest.end += 15000; d.rest.total += 15; updateRestBar(); saveSoon(); } break;
    case 'rest-skip': d.rest = null; updateRestBar(); saveSoon(); break;
    case 'discard':
      if (await confirmDialog('Das laufende Workout wird gelöscht.', 'Workout verwerfen', true)) {
        await setActive(null);
        close();
      }
      break;
    case 'finish': await finish(); break;
    case 'save': await save(); break;
  }
}

function commit() {
  render();
  if (ed.mode === 'active') persistActive();
}

const cleanSet = (s) => ({
  type: s.type, weight: s.weight ?? null, reps: s.reps ?? null, distance: s.distance ?? null,
  duration: s.duration ?? null, rpe: s.rpe ?? null,
});
const hasValue = (s) => s.weight != null || s.reps != null || s.distance != null || s.duration != null;

async function finish() {
  const d = ed.data;
  const all = d.exercises.flatMap((e) => e.sets);
  const done = all.filter((s) => s.done).length;
  const open = all.length - done;
  if (!done) {
    if (await confirmDialog('Du hast noch keinen Satz abgehakt. Workout verwerfen?', 'Verwerfen', true)) {
      await setActive(null);
      close();
    }
    return;
  }
  const msg = open
    ? `${open} nicht abgehakte${open === 1 ? 'r Satz wird' : ' Sätze werden'} nicht gespeichert.`
    : 'Gute Arbeit! Workout jetzt speichern?';
  if (!(await confirmDialog(msg, 'Workout beenden', false, 'Workout beenden'))) return;
  const w = {
    id: d.id, title: d.title || 'Workout', start: d.start, end: Date.now(), description: d.description || '',
    source: 'app', routineId: d.routineId || null, ...(d.planId ? { planId: d.planId } : {}),
    exercises: d.exercises
      .map((e) => ({ name: e.name, notes: e.notes || '', supersetId: null, sets: e.sets.filter((s) => s.done).map(cleanSet) }))
      .filter((e) => e.sets.length),
  };
  await saveWorkout(w);
  await setActive(null);
  close();
  showSummary(w);
}

async function save() {
  const d = ed.data;
  if (ed.mode === 'routine') {
    const r = {
      id: d.id, name: (d.name || 'Routine').trim(), order: d.order,
      exercises: d.exercises.map((e) => ({ name: e.name, rest: e.rest ?? null, sets: e.sets.map(cleanSet) })),
    };
    await saveRoutine(r);
    toast('Routine gespeichert');
    close();
    return;
  }
  const w = {
    ...d,
    exercises: d.exercises
      .map((e) => ({ name: e.name, notes: e.notes || '', supersetId: e.supersetId || null, sets: e.sets.filter(hasValue).map(cleanSet) }))
      .filter((e) => e.sets.length),
  };
  delete w.showNotes;
  if (!w.exercises.length) { toast('Mindestens eine Übung mit Werten nötig'); return; }
  await saveWorkout(w);
  toast('Workout gespeichert');
  close();
  location.hash = `#/w/${w.id}`;
}

// ---------- Zusammenfassung nach dem Workout ----------
export function showSummary(w) {
  const s = idx().wStats.get(w.id);
  const prs = s?.prs || [];
  const o = overlay(`
    <div class="summary">
      <div class="summary-hero">
        <div class="summary-fighter">${fighterFx(stageFor(weekStreaks().current).index, { enter: true, powerUp: true })}</div>
        <h2>Starkes Training!</h2>
        <p>Das war dein <b>${s?.n ?? ''}.</b> Workout</p>
      </div>
      <div class="kpis three">
        <div class="kpi"><small>Dauer</small><b>${fmtDur(s?.duration)}</b></div>
        <div class="kpi"><small>Volumen</small><b>${fmtVolume(s?.volume)}</b></div>
        <div class="kpi"><small>Sätze</small><b>${s?.sets ?? 0}</b></div>
      </div>
      ${prs.length ? `<div class="card"><div class="card-title">${icon('trophy', 'gold')} ${prs.length} neue Rekorde</div>
        ${prs.map((p) => `<div class="pr-row"><div><b>${esc(p.exercise)}</b><small>${esc(PR_LABELS[p.kind])}</small></div><span class="pr-val">${esc(prValue(p))}</span></div>`).join('')}
      </div>` : ''}
      <div class="summary-actions">
        <button class="btn ghost block" data-view>Workout ansehen</button>
        <button class="btn primary block" data-ok>Fertig</button>
      </div>
    </div>`, 'summary-panel');
  o.addEventListener('click', (e) => {
    if (e.target.closest('[data-ok]')) o.close();
    if (e.target.closest('[data-view]')) { o.close(); location.hash = `#/w/${w.id}`; }
  });
}
