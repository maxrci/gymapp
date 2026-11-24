// Einrichtung des AI-Coaches: Ziel, Häufigkeit, Stand, Zeitraum → Einordnung mit Vorschlägen → Plan

import { state } from '../store.js';
import { icon, overlay, toast } from '../ui.js';
import { esc, num, parseNum, startOfDay, DAY, fmtKg } from '../utils.js';
import { pickExercises } from '../picker.js';
import { addBodyweight, bwNow } from '../body.js';
import {
  coachData, saveCoach, ACTIVITY, LEVELS, SPORTS, body, estimateLevel, currentE1rm, ormCandidates, cardioBaseline,
  fmtHms, deadlineIn, fmtDeadline, weeksBetween,
} from './core.js';
import { SPLITS, SPLIT_INFO, splitFor } from './splits.js';
import { assessWorkout, assessCardio, freqWorkout, freqCardio, comboNotes, VERDICTS } from './assess.js';

const W_TYPES = [
  ['strength', 'Stärker werden', 'dumbbell'],
  ['muscle', 'Muskelaufbau', 'flame'],
  ['orm', '1RM-Ziel', 'trophy'],
  ['bw', 'Körpergewicht', 'weight'],
];
const WEEKS = [4, 8, 12, 16, 24, 52];
const dateVal = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function bodyHtml(b) {
  return `<div class="cs-sec"><div class="cs-h">${icon('user', 'xs')} Körperdaten <small>für kcal & Makros</small></div>
    <div class="chips">${[['m', 'Männlich'], ['f', 'Weiblich']].map(([v, l]) => `<button class="chip ${b.sex === v ? 'on' : ''}" data-set="body.sex" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="field-row three">
      <label class="field"><span>Alter</span><input data-in="body.age" inputmode="numeric" value="${esc(b.age ?? '')}" placeholder="z. B. 28"></label>
      <label class="field"><span>Größe (cm)</span><input data-in="body.height" inputmode="numeric" value="${esc(b.height ?? '')}" placeholder="180"></label>
      <label class="field"><span>Gewicht (kg)</span><input data-in="body.weight" inputmode="decimal" value="${esc(b.weight ? String(b.weight).replace('.', ',') : '')}" placeholder="80"></label>
    </div>
    <div class="cs-l">Alltag (ohne Training)</div>
    <div class="cs-opts">${ACTIVITY.map((a) => `<button class="cs-opt ${b.activity === a.v ? 'on' : ''}" data-set="body.activity" data-v="${a.v}"><b>${esc(a.label)}</b><small>${esc(a.sub)}</small></button>`).join('')}</div>
  </div>`;
}

const perWeekChips = (key, v, max = 7) => `<div class="chips nums">${Array.from({ length: max }, (_, i) => i + 1).map((n) => `<button class="chip ${v === n ? 'on' : ''}" data-set="${key}" data-v="${n}">${n}</button>`).join('')}</div>`;
const levelChips = (key, v, auto) => `<div class="chips">${Object.entries(LEVELS).map(([k, l]) => `<button class="chip ${v === k ? 'on' : ''}" data-set="${key}" data-v="${k}">${l}</button>`).join('')}</div>${auto ? `<p class="footnote">Aus deinem Verlauf geschätzt: ${esc(LEVELS[auto])}</p>` : ''}`;
function whenHtml(key, d) {
  return `<div class="cs-l">Bis wann?</div>
    <div class="chips">${WEEKS.map((w) => `<button class="chip ${!d.date && d.weeks === w ? 'on' : ''}" data-set="${key}.weeks" data-v="${w}">${w < 52 ? `${w} Wo.` : '1 Jahr'}</button>`).join('')}</div>
    <label class="field"><span>oder Datum</span><input type="date" data-in="${key}.date" value="${esc(d.date || '')}" min="${dateVal(Date.now() + 7 * DAY)}"></label>`;
}
// Zeit als Stunden + Minuten (iPhone-Zahlenfeld hat keinen Doppelpunkt)
const hm = (sec) => (sec ? { h: String(Math.floor(sec / 3600)), m: String(Math.round((sec % 3600) / 60)) } : { h: '', m: '' });
const secOf = (h, m) => { const x = (parseNum(h) || 0) * 3600 + (parseNum(m) || 0) * 60; return x > 0 ? Math.round(x) : null; };
const timeFields = (key, h, m, ph = ['2', '00']) => `<div class="time-in">
  <input data-in="${key}H" inputmode="numeric" value="${esc(h)}" placeholder="${ph[0]}" aria-label="Stunden"><span>h</span>
  <input data-in="${key}M" inputmode="numeric" value="${esc(m)}" placeholder="${ph[1]}" aria-label="Minuten"><span>min</span></div>`;
// grobe Obergrenzen (km/h), um Tippfehler zu erkennen
const MAX_KMH = { run: 22, walk: 9, bike: 50, skate: 35, row: 22, swim: 7 };
const deadlineOf = (d) => (d.date ? startOfDay(new Date(d.date).getTime()) + 20 * 3600e3 : deadlineIn(d.weeks || 12));

// ---------- Overlay ----------
export function openCoachSetup(kind = 'workout', { onDone } = {}) {
  const C = coachData();
  const b0 = body();
  const lvl = estimateLevel();
  const ex = C.workout || {};
  const cx = C.cardio || {};
  const D = {
    step: 1,
    body: { sex: b0.sex, age: b0.age, height: b0.height, weight: b0.weight, activity: b0.activity },
    workout: {
      type: ex.type || 'strength', exercise: ex.exercise || ormCandidates()[0], target: ex.target ?? '', current: '',
      perWeek: ex.perWeek || Math.min(6, state.settings.weekGoal || 3), level: ex.level || lvl, split: ex.split || 'auto',
      weeks: ex.deadline ? Math.min(52, Math.max(4, weeksBetween(Date.now(), ex.deadline))) : 12, date: ex.deadline > Date.now() + 6 * DAY ? dateVal(ex.deadline) : '',
    },
    cardio: {
      sport: cx.sport || 'run', distance: cx.distance ?? '', timeH: hm(cx.time).h, timeM: hm(cx.time).m, perWeek: cx.perWeek || 3,
      level: cx.level || lvl, weeks: cx.deadline ? Math.min(52, Math.max(4, weeksBetween(Date.now(), cx.deadline))) : 12, date: cx.deadline > Date.now() + 6 * DAY ? dateVal(cx.deadline) : '', baseKm: '', baseTimeH: '', baseTimeM: '',
    },
    applied: new Set(),
  };
  const fillBase = () => {
    const bl = cardioBaseline(D.cardio.sport);
    D.cardio.baseKm = bl ? String(Math.round(bl.km * 10) / 10).replace('.', ',') : '';
    D.cardio.baseTimeH = bl ? hm(bl.sec).h : '';
    D.cardio.baseTimeM = bl ? hm(bl.sec).m : '';
    D.cardio.baseAuto = !!bl;
  };
  if (cx.baseline?.km) {
    D.cardio.baseKm = String(cx.baseline.km).replace('.', ',');
    D.cardio.baseTimeH = hm(cx.baseline.sec).h; D.cardio.baseTimeM = hm(cx.baseline.sec).m; D.cardio.baseAuto = true;
  } else fillBase();
  const o = overlay('', 'coach-setup');
  const title = kind === 'cardio' ? 'AI-Coach Cardio' : kind === 'body' ? 'Körperdaten' : 'AI-Coach Workouts';

  // Ziel-Objekt aus dem Entwurf
  const buildGoal = () => {
    if (kind === 'workout') {
      const d = D.workout;
      const g = { type: d.type, perWeek: d.perWeek, level: d.level, split: d.split, start: Date.now(), deadline: deadlineOf(d) };
      if (d.type === 'orm') { g.exercise = d.exercise; g.target = parseNum(d.target); g.current = parseNum(d.current) || currentE1rm(d.exercise) || null; }
      if (d.type === 'bw') { g.target = parseNum(d.target); g.current = parseNum(D.body.weight) || bwNow() || null; }
      return g;
    }
    const d = D.cardio;
    const km = parseNum(d.baseKm), sec = secOf(d.baseTimeH, d.baseTimeM);
    return {
      sport: d.sport, distance: parseNum(d.distance), time: secOf(d.timeH, d.timeM), perWeek: d.perWeek, level: d.level,
      start: Date.now(), deadline: deadlineOf(d), baseline: km > 0 && sec > 0 ? { km, sec } : null,
    };
  };
  const validate = () => {
    const b = D.body;
    if (kind === 'body' || !coachData().body?.age) {
      if (!b.sex) return 'Bitte Geschlecht wählen';
      if (!(parseNum(b.age) >= 12 && parseNum(b.age) <= 100)) return 'Bitte Alter eingeben';
      if (!(parseNum(b.height) >= 120 && parseNum(b.height) <= 230)) return 'Bitte Größe in cm eingeben';
      if (!(parseNum(b.weight) >= 30 && parseNum(b.weight) <= 300)) return 'Bitte Gewicht eingeben';
    }
    if (kind === 'workout') {
      const d = D.workout;
      if (d.type === 'orm' && !(parseNum(d.target) > 0)) return 'Bitte Ziel-1RM in kg eingeben';
      if (d.type === 'orm' && !(parseNum(d.current) > 0) && !currentE1rm(d.exercise)) return 'Bitte dein aktuelles 1RM schätzen';
      if (d.type === 'bw' && !(parseNum(d.target) > 0)) return 'Bitte Zielgewicht eingeben';
    }
    if (kind === 'cardio') {
      if (!(parseNum(D.cardio.distance) > 0)) return 'Bitte Zieldistanz in km eingeben';
      const c = D.cardio, km = parseNum(c.distance), max = MAX_KMH[c.sport];
      const t = secOf(c.timeH, c.timeM);
      if (t && km / (t / 3600) > max) return `${num(km, 1)} km in ${fmtHms(t)} wäre schneller als ${max} km/h – bitte Stunden und Minuten prüfen`;
      const bk = parseNum(c.baseKm), bt = secOf(c.baseTimeH, c.baseTimeM);
      if (bk && bt && bk / (bt / 3600) > max) return 'Aktueller Stand: Zeit bitte in Stunden und Minuten prüfen';
    }
    if ((D[kind]?.date) && deadlineOf(D[kind]) < Date.now() + 6 * DAY) return 'Das Datum sollte mindestens eine Woche in der Zukunft liegen';
    return null;
  };

  const step1 = () => {
    const needBody = kind === 'body' || !coachData().body?.age;
    if (kind === 'body') return bodyHtml(D.body);
    if (kind === 'workout') {
      const d = D.workout;
      const cur = d.type === 'orm' ? currentE1rm(d.exercise) : 0;
      const autoSplit = splitFor(d.perWeek, d.level);
      return `
        <div class="cs-sec"><div class="cs-h">${icon('target', 'xs')} Dein Ziel</div>
          <div class="cs-goals">${W_TYPES.map(([k, l, ic]) => `<button class="cs-goal ${d.type === k ? 'on' : ''}" data-set="workout.type" data-v="${k}">${icon(ic)}<span>${l}</span></button>`).join('')}</div>
          ${d.type === 'orm' ? `
            <label class="field"><span>Übung</span><button class="cs-pick" data-act="pick-ex">${esc(d.exercise)} ${icon('down', 'xs')}</button></label>
            <div class="field-row">
              <label class="field"><span>Aktuelles 1RM ${cur ? '(geschätzt)' : ''}</span><input data-in="workout.current" inputmode="decimal" value="${esc(d.current)}" placeholder="${cur ? num(cur, 1) : 'z. B. 80'}"></label>
              <label class="field"><span>Ziel-1RM (kg)</span><input data-in="workout.target" inputmode="decimal" value="${esc(d.target)}" placeholder="${cur ? num(Math.round(cur * 1.1 / 2.5) * 2.5, 1) : '100'}"></label>
            </div>` : ''}
          ${d.type === 'bw' ? `<div class="field-row">
              <label class="field"><span>Aktuell (kg)</span><input data-in="body.weight" inputmode="decimal" value="${esc(D.body.weight ? String(D.body.weight).replace('.', ',') : '')}" placeholder="80"></label>
              <label class="field"><span>Zielgewicht (kg)</span><input data-in="workout.target" inputmode="decimal" value="${esc(d.target)}" placeholder="75"></label>
            </div>` : ''}
        </div>
        <div class="cs-sec"><div class="cs-h">${icon('calendar', 'xs')} Workouts pro Woche</div>${perWeekChips('workout.perWeek', d.perWeek)}</div>
        <div class="cs-sec"><div class="cs-h">${icon('layers', 'xs')} Split <small>deine Vorliebe zählt</small></div>
          <div class="cs-opts">${['auto', ...Object.keys(SPLITS)].map((k) => `<button class="cs-opt ${d.split === k ? 'on' : ''}" data-set="workout.split" data-v="${k}"><b>${k === 'auto' ? `Coach entscheidet <em>(${esc(SPLITS[autoSplit].label)})</em>` : esc(SPLITS[k].label)}</b><small>${esc(SPLIT_INFO[k])}</small></button>`).join('')}</div>
        </div>
        <div class="cs-sec"><div class="cs-h">${icon('bolt', 'xs')} Aktueller Stand</div>${levelChips('workout.level', d.level, state.workouts.length ? lvl : null)}</div>
        <div class="cs-sec">${whenHtml('workout', d)}</div>
        ${needBody ? bodyHtml(D.body) : ''}`;
    }
    const d = D.cardio;
    const S = SPORTS[d.sport];
    return `
      <div class="cs-sec"><div class="cs-h">${icon('bolt', 'xs')} Sportart</div>
        <div class="cs-goals six">${Object.entries(SPORTS).map(([k, s]) => `<button class="cs-goal ${d.sport === k ? 'on' : ''}" data-set="cardio.sport" data-v="${k}"><span>${esc(s.label)}</span></button>`).join('')}</div>
      </div>
      <div class="cs-sec"><div class="cs-h">${icon('target', 'xs')} Dein Ziel</div>
        <div class="field-row">
          <label class="field"><span>Distanz (km)</span><input data-in="cardio.distance" inputmode="decimal" value="${esc(d.distance)}" placeholder="${d.sport === 'bike' ? '100' : '20'}"></label>
          <label class="field"><span>Zielzeit (optional)</span>${timeFields('cardio.time', d.timeH, d.timeM)}</label>
        </div>
      </div>
      <div class="cs-sec"><div class="cs-h">${icon('calendar', 'xs')} Einheiten pro Woche</div>${perWeekChips('cardio.perWeek', d.perWeek)}</div>
      <div class="cs-sec"><div class="cs-h">${icon('chart', 'xs')} Aktueller Stand</div>
        <p class="footnote">${d.baseAuto ? `Deine längste ${esc(S.label)}-Einheit der letzten Wochen – bei Bedarf anpassen.` : `Was schaffst du aktuell am Stück? (leer lassen, wenn du es nicht weißt)`}</p>
        <div class="field-row">
          <label class="field"><span>Distanz (km)</span><input data-in="cardio.baseKm" inputmode="decimal" value="${esc(d.baseKm)}" placeholder="z. B. 8"></label>
          <label class="field"><span>Zeit</span>${timeFields('cardio.baseTime', d.baseTimeH, d.baseTimeM, ['0', '50'])}</label>
        </div>
        ${levelChips('cardio.level', d.level, null)}
      </div>
      <div class="cs-sec">${whenHtml('cardio', d)}</div>
      ${needBody ? bodyHtml(D.body) : ''}`;
  };

  const step2 = () => {
    const g = buildGoal();
    const C2 = coachData();
    const a = kind === 'workout' ? assessWorkout(g) : assessCardio(g);
    const notes = kind === 'workout' ? freqWorkout(g, state.settings.aiCardio && C2.cardio ? C2.cardio.perWeek : 0) : freqCardio(g, state.settings.aiWorkout && C2.workout ? C2.workout.perWeek : 0);
    const gw2 = kind === 'workout' ? g : state.settings.aiWorkout ? C2.workout : null;
    const gc2 = kind === 'cardio' ? g : state.settings.aiCardio ? C2.cardio : null;
    if (gw2 && gc2) notes.push(...comboNotes(gw2, gc2));
    const V = VERDICTS[a.verdict];
    const head = kind === 'workout'
      ? (g.type === 'orm' ? `${esc(g.exercise)}: ${fmtKg(g.target)}` : g.type === 'bw' ? `Körpergewicht: ${fmtKg(g.target)}` : g.type === 'muscle' ? 'Muskelaufbau' : 'Stärker werden')
      : `${esc(SPORTS[g.sport].label)}: ${num(g.distance, 1)} km${g.time ? ` in ${fmtHms(g.time)}` : ''}`;
    const prop = (p, i, src) => {
      const k = `${src}${i}:${JSON.stringify(p.patch)}`;
      const on = D.applied.has(k);
      return `<button class="cs-prop ${on ? 'on' : ''}" data-prop="${esc(k)}" data-src="${src}" data-i="${i}">${icon(on ? 'check' : 'repeat', 'xs')}<div><b>${esc(p.label)}</b>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</div><span>${on ? 'Übernommen' : 'Übernehmen'}</span></button>`;
    };
    D.lastA = a; D.lastNotes = notes;
    return `
      <div class="card cs-verdict ${V.cls}">
        <div class="csv-top"><span class="ai-badge">AI</span><b>${head}</b></div>
        <small>${g.perWeek}× pro Woche · bis ${esc(fmtDeadline(g.deadline))} (${weeksBetween(Date.now(), g.deadline)} Wochen)${kind === 'workout' ? ` · ${esc(SPLITS[g.split === 'auto' ? splitFor(g.perWeek, g.level) : g.split].label)}` : ''}</small>
        <div class="csv-pill ${V.cls}">${esc(V.label)}</div>
        ${a.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
        ${a.proposals.length ? `<div class="cs-l">Alternativ-Vorschlag</div>${a.proposals.map((p, i) => prop(p, i, 'a')).join('')}` : ''}
      </div>
      ${notes.map((n, j) => `<div class="card cs-note">${icon('info', 'xs')}<div><p>${esc(n.text)}</p>${n.proposals.map((p, i) => prop(p, i, `n${j}-`)).join('')}</div></div>`).join('')}
      <p class="footnote center">Vorschläge sind nur Hinweise – du kannst auch einfach bei deinem Ziel bleiben.</p>`;
  };

  const draw = () => {
    const y = o.querySelector('.panel-body')?.scrollTop || 0;
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close>${icon(D.step === 2 ? 'left' : 'x')}</button><div class="panel-title">${esc(title)} <em class="tag demo">DEMO</em></div><span style="width:40px"></span></div>
      <div class="panel-body">${D.step === 1 ? step1() : step2()}
        <div class="cs-actions">
          ${D.step === 1
            ? `<button class="btn primary block lg" data-act="next">${kind === 'body' ? 'Speichern' : `Weiter: Einordnung ${icon('right', 'xs')}`}</button>`
            : `<button class="btn primary block lg" data-act="save">${icon('check', 'xs')} Plan erstellen</button>`}
        </div>
      </div>`;
    if (D.step === 1) o.querySelector('.panel-body').scrollTop = y;
  };
  draw();

  const setPath = (path, v) => { const [a, k] = path.split('.'); D[a][k] = v; };
  o.addEventListener('input', (e) => {
    const t = e.target.closest('[data-in]');
    if (!t) return;
    setPath(t.dataset.in, t.value);
    if (t.dataset.in.endsWith('.date') && t.value) D[t.dataset.in.split('.')[0]].date = t.value;
  });
  o.addEventListener('change', (e) => { if (e.target.matches('[type=date]')) draw(); });
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) {
      if (D.step === 2) { D.step = 1; D.applied.clear(); draw(); return; }
      return o.close();
    }
    const s = e.target.closest('[data-set]');
    if (s) {
      const [a, k] = s.dataset.set.split('.');
      let v = s.dataset.v;
      if (['perWeek', 'weeks', 'activity'].includes(k)) v = +v;
      D[a][k] = v;
      if (k === 'weeks') D[a].date = '';
      if (a === 'cardio' && k === 'sport') fillBase();
      draw();
      return;
    }
    if (e.target.closest('[data-act="pick-ex"]')) {
      const n = await pickExercises({ multi: false, title: 'Übung für dein 1RM-Ziel' });
      if (n?.[0]) { D.workout.exercise = n[0]; D.workout.current = ''; draw(); }
      return;
    }
    const pr = e.target.closest('[data-prop]');
    if (pr) {
      const src = pr.dataset.src;
      const p = src === 'a' ? D.lastA.proposals[+pr.dataset.i] : D.lastNotes[+src.slice(1, -1)].proposals[+pr.dataset.i];
      applyPatch(p.patch);
      D.applied.add(pr.dataset.prop);
      draw();
      toast('Vorschlag übernommen');
      return;
    }
    if (e.target.closest('[data-act="next"]')) {
      const err = validate();
      if (err) return toast(err);
      if (kind === 'body') { await saveBody(); o.close(); toast('Körperdaten gespeichert'); onDone?.(); return; }
      D.step = 2; draw(); o.querySelector('.panel-body').scrollTop = 0;
      return;
    }
    if (e.target.closest('[data-act="save"]')) {
      await saveBody();
      const g = buildGoal();
      g.verdict = D.lastA?.verdict || null;
      // gleiches Ziel nur angepasst → Trainingsphase läuft weiter (kein Neustart der Periodisierung)
      const prevG = coachData()[kind];
      if (prevG && prevG.deadline > Date.now() && (kind === 'workout' ? prevG.type === g.type && prevG.exercise === g.exercise : prevG.sport === g.sport)) g.start = prevG.start;
      await saveCoach({ [kind]: g, moves: {}, skips: {} });
      o.close();
      toast('Dein Plan ist fertig!');
      if (onDone) onDone(); else location.hash = '#/plan';
    }
  });

  // Vorschlag in den Entwurf übernehmen
  function applyPatch(patch) {
    const d = D[kind];
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'deadline') { d.date = dateVal(v); continue; }
      if (k === 'time') { d.timeH = hm(v).h; d.timeM = hm(v).m; continue; }
      d[k] = typeof v === 'number' && ['target', 'distance'].includes(k) ? String(v).replace('.', ',') : v;
    }
  }
  async function saveBody() {
    const b = D.body;
    const prev = coachData().body || {};
    const nb = { sex: b.sex || prev.sex || null, age: parseNum(b.age) || prev.age || null, height: parseNum(b.height) || prev.height || null, activity: b.activity || 1.4 };
    await saveCoach({ body: nb });
    const kg = parseNum(b.weight);
    if (kg >= 30 && kg <= 300 && Math.abs(kg - (bwNow() || 0)) >= 0.05) await addBodyweight(kg);
  }
}
