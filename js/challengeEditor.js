// Challenge anlegen: Vorlage, Typ, Übung, Wertung, Zeitraum, Einladungen

import { overlay, icon, toast } from './ui.js';
import { esc } from './utils.js';
import { allExerciseNames } from './store.js';
import { idx } from './stats.js';
import { api, myId } from './sync.js';
import { CHALLENGE_TYPES, CHALLENGE_TEMPLATES } from './compete.js';

const isoDay = (ts) => { const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

export function openChallengeEditor(g, done) {
  const me = myId();
  const usage = idx().ex;
  const names = allExerciseNames().sort((a, b) => (usage.get(b)?.count || 0) - (usage.get(a)?.count || 0) || a.localeCompare(b, 'de'));
  const f = { title: '', type: 'workouts', exercise: names[0] || '', relative: false, start: isoDay(Date.now()), days: 14, invite: new Set(g.members.filter((m) => m.id !== me).map((m) => m.id)) };
  const o = overlay('', 'ch-editor');

  const draw = () => {
    const T = CHALLENGE_TYPES[f.type];
    const exNames = names.includes(f.exercise) || !f.exercise ? names : [f.exercise, ...names];
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button><div class="panel-title">Neue Challenge</div><span style="width:40px"></span></div>
      <form class="panel-body ch-form">
        <div class="list-label">Vorlagen</div>
        <div class="chips scroll">${CHALLENGE_TEMPLATES.map((t, i) => `<button type="button" class="chip" data-tpl="${i}">${esc(t.title)}</button>`).join('')}</div>
        <label class="field"><span>Titel</span><input name="title" value="${esc(f.title)}" placeholder="${esc(T.label)}" maxlength="80" autocomplete="off"></label>
        <label class="field"><span>Was zählt?</span><select name="type">${Object.entries(CHALLENGE_TYPES).map(([k, t]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
        ${T.ex ? `<label class="field"><span>Übung</span><select name="exercise">${exNames.map((n) => `<option ${n === f.exercise ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
        ${T.rel ? `<div class="field"><span>Wertung</span><div class="seg two">
          <button type="button" class="seg-btn ${f.relative ? '' : 'on'}" data-rel="0">Absolut (kg)</button>
          <button type="button" class="seg-btn ${f.relative ? 'on' : ''}" data-rel="1">× Körpergewicht</button></div></div>` : ''}
        <div class="field-row">
          <label class="field"><span>Start</span><input type="date" name="start" value="${esc(f.start)}"></label>
          <label class="field"><span>Dauer (Tage)</span><input name="days" inputmode="numeric" value="${f.days}"></label>
        </div>
        <div class="list-label">Einladen</div>
        <div class="set-group">${g.members.filter((m) => m.id !== me).map((m) => `<label class="set-item"><span class="si-l">${esc(m.name)}</span>
          <input type="checkbox" class="switch" data-inv="${esc(m.id)}" ${f.invite.has(m.id) ? 'checked' : ''}></label>`).join('') || '<div class="set-item"><span class="si-l muted">Noch keine anderen Mitglieder</span></div>'}</div>
        ${f.relative && T.rel ? '<p class="footnote">Relativ-Wertung nutzt das Körpergewicht, das jeder im Profil einträgt.</p>' : ''}
        <button type="submit" class="btn primary block lg" style="margin-top:16px">Challenge starten</button>
      </form>`;
  };
  const read = () => {
    const fm = o.querySelector('form');
    if (!fm) return;
    f.title = fm.elements.title.value;
    f.type = fm.elements.type.value;
    if (fm.elements.exercise) f.exercise = fm.elements.exercise.value;
    f.start = fm.elements.start.value || f.start;
    f.days = parseInt(fm.elements.days.value, 10) || f.days;
  };
  draw();
  o.addEventListener('change', (e) => {
    if (e.target.name === 'type') { read(); draw(); }
    if (e.target.dataset.inv) { if (e.target.checked) f.invite.add(e.target.dataset.inv); else f.invite.delete(e.target.dataset.inv); }
  });
  o.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const t = e.target.closest('[data-tpl]');
    if (t) {
      const x = CHALLENGE_TEMPLATES[+t.dataset.tpl];
      read();
      Object.assign(f, { title: x.title, type: x.type, relative: !!x.relative, days: x.days });
      if (x.exercise) f.exercise = names.find((n) => n.toLowerCase() === x.exercise.toLowerCase()) || names.find((n) => n.toLowerCase().startsWith(x.exercise.toLowerCase().slice(0, 8))) || x.exercise;
      return draw();
    }
    const r = e.target.closest('[data-rel]');
    if (r) { read(); f.relative = r.dataset.rel === '1'; draw(); }
  });
  o.addEventListener('submit', async (e) => {
    e.preventDefault();
    read();
    const T = CHALLENGE_TYPES[f.type];
    const start = new Date(`${f.start}T00:00`).getTime();
    const begin = isoDay(Date.now()) === f.start ? Math.min(start, Date.now()) : start;
    const days = Math.max(1, Math.min(365, f.days));
    try {
      await api('POST', '/api/challenges', {
        title: f.title.trim() || T.label, type: f.type, exercise: T.ex ? f.exercise : null, relative: T.rel && f.relative,
        start: begin, end: start + days * 86400000, invite: [...f.invite],
      });
      toast(f.invite.size ? `Challenge gestartet – ${f.invite.size} eingeladen` : 'Challenge gestartet');
      o.close();
      done?.();
    } catch (err) { toast(err.message); }
  });
}
