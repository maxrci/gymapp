// Mobility-Baukasten: eigene Routinen aus Übungen (Dauer, Seiten links/rechts, Runden, Pause) – Muster wie cardioBuilder.js

import { state, saveSettings } from './store.js';
import { MOVES, MOVE_AREAS, AREAS, mobilityPhases, programDuration } from './programs.js';
import { poseSVG } from './poses.js';
import { icon, overlay, toast, sheet } from './ui.js';
import { esc, uid, fmtClock } from './utils.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MAX = 30;

// gespeicherte Routinen (lokal) – beim Laden geprüft
export function customMobility() {
  const list = Array.isArray(state.settings.mobilityCustom) ? state.settings.mobilityCustom : [];
  return list.filter((u) => u && typeof u.id === 'string' && Array.isArray(u.moves)).map(clean).filter((u) => u.moves.length);
}
function clean(u) {
  return {
    id: String(u.id).slice(0, 40),
    title: String(u.title || 'Meine Mobility').slice(0, 40),
    rounds: clamp(Math.round(+u.rounds) || 1, 1, 5),
    rest: clamp(Math.round(+u.rest) || 6, 3, 30),
    moves: u.moves.filter((m) => m && MOVES[m.id]).map((m) => ({ id: m.id, sec: clamp(Math.round(+m.sec) || 40, 10, 180), sides: typeof m.sides === 'boolean' ? m.sides : !!MOVES[m.id][3] })).slice(0, 40),
  };
}
// Bereiche einer Routine (häufigste zuerst, max. 3)
export function areasOfMoves(moves) {
  const c = {};
  for (const m of moves) for (const a of MOVE_AREAS[m.id] || []) c[a] = (c[a] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a]) => a);
}
// als Programm für Coach & Player (id mit Präfix, damit sie nicht mit eingebauten kollidiert)
export const unitToProgram = (u) => ({ ...u, id: `custom:${u.id}`, areas: areasOfMoves(u.moves), desc: 'Deine eigene Routine', custom: true });
export const customPrograms = () => customMobility().map(unitToProgram);

async function saveUnit(u) {
  const list = customMobility().filter((x) => x.id !== u.id);
  list.unshift(u);
  await saveSettings({ mobilityCustom: list.slice(0, MAX) });
}
export async function deleteMobility(id) {
  await saveSettings({ mobilityCustom: customMobility().filter((x) => x.id !== id) });
}
export const mobilityMinutes = (u) => Math.round(programDuration(mobilityPhases(u)) / 60);

// ---------- Übungs-Auswahl ----------
function pickMoves(onAdd) {
  let area = 'all';
  const added = [];
  const o = overlay('', 'mob-picker');
  const draw = () => {
    const ids = Object.keys(MOVES).filter((id) => area === 'all' || (MOVE_AREAS[id] || []).includes(area));
    const y = o.querySelector('.panel-body')?.scrollTop || 0;
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Übung hinzufügen</div><button class="link-btn" data-close>Fertig</button></div>
      <div class="panel-body">
        <div class="chips">${[['all', 'Alle'], ...Object.entries(AREAS)].map(([k, l]) => `<button class="chip ${area === k ? 'on' : ''}" data-area="${k}">${esc(l)}</button>`).join('')}</div>
        <div class="mp-list">${ids.map((id) => `<button class="mp-item" data-add="${id}">
          <span class="mp-pose">${poseSVG(MOVES[id][1], { stage: 3, t: 0.5 })}</span>
          <span class="mp-t"><b>${esc(MOVES[id][0])}</b><small>${esc((MOVE_AREAS[id] || []).map((a) => AREAS[a]).join(' · '))}${MOVES[id][3] ? ' · beidseitig' : ''}</small></span>
          ${added.includes(id) ? `<em class="mp-n">${icon('check', 'xs')} ${added.filter((x) => x === id).length}×</em>` : icon('plus', 'muted')}
        </button>`).join('')}</div>
      </div>`;
    o.querySelector('.panel-body').scrollTop = y;
  };
  draw();
  o.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const a = e.target.closest('[data-area]');
    if (a) { area = a.dataset.area; return draw(); }
    const m = e.target.closest('[data-add]');
    if (m) { added.push(m.dataset.add); onAdd(m.dataset.add); draw(); toast(`${MOVES[m.dataset.add][0]} hinzugefügt`); }
  });
}

// ---------- Editor ----------
// unit: bestehende eigene Routine bearbeiten · template: Programm als Vorlage (Anpassen)
export function openMobilityBuilder({ unit = null, template = null, onStart, onSave } = {}) {
  const D = unit
    ? structuredClone(unit)
    : {
      id: uid(), title: template?.title || 'Meine Mobility', rounds: template?.rounds || 1, rest: template?.rest ?? 6,
      moves: template ? template.moves.map((m) => ({ id: m.id, sec: m.sec, sides: m.sides ?? !!MOVES[m.id]?.[3] })) : [
        { id: 'catcow', sec: 60, sides: false }, { id: 'wgs', sec: 40, sides: true }, { id: 'child', sec: 60, sides: false },
      ],
    };
  const o = overlay('', 'cardio-builder mobility-builder');
  const stepper = (i, f, text) => `<div class="cb-step"><button data-b="${i}" data-f="${f}" data-d="-1" aria-label="weniger">−</button><b>${text}</b><button data-b="${i}" data-f="${f}" data-d="1" aria-label="mehr">+</button></div>`;
  const draw = () => {
    const tot = programDuration(mobilityPhases(D));
    const y = o.querySelector('.panel-body')?.scrollTop || 0;
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Eigene Mobility</div><button class="link-btn" data-save>Speichern</button></div>
      <div class="panel-body">
        <label class="field"><span>Name</span><input data-title value="${esc(D.title)}" maxlength="40"></label>
        <div class="cb-sum"><div class="prog-strip">${D.moves.map((m) => `<i class="mob-seg" style="flex:${m.sec * (m.sides ? 2 : 1)}"></i>`).join('')}</div><b>${Math.round(tot / 60)} min</b><small>${D.moves.length} Übungen${D.rounds > 1 ? ` · ${D.rounds} Runden` : ''}</small></div>
        ${D.moves.map((m, i) => `<div class="card cb-block mob-move">
          <div class="cb-head"><b><span class="mm-pose">${poseSVG(MOVES[m.id][1], { stage: 3, t: 0.5 })}</span>${esc(MOVES[m.id][0])}</b>
            <span>${i > 0 ? `<button class="icon-btn sm" data-mv="${i}" data-d="-1" aria-label="nach oben">${icon('up', 'xs')}</button>` : ''}${i < D.moves.length - 1 ? `<button class="icon-btn sm" data-mv="${i}" data-d="1" aria-label="nach unten">${icon('down', 'xs')}</button>` : ''}<button class="icon-btn sm" data-del="${i}" aria-label="entfernen">${icon('trash', 'xs')}</button></span></div>
          <div class="cb-row"><span>${m.sides ? 'Pro Seite' : 'Haltezeit'}</span>${stepper(i, 'sec', fmtClock(m.sec))}</div>
          <div class="cb-row"><span>Seiten</span><div class="chips"><button class="chip ${m.sides ? '' : 'on'}" data-sides="${i}:0">Einmal</button><button class="chip ${m.sides ? 'on' : ''}" data-sides="${i}:1">Links & rechts</button></div></div>
        </div>`).join('')}
        <div class="cb-add"><button class="btn ghost sm" data-addmove>${icon('plus', 'xs')} Übung hinzufügen</button></div>
        <div class="card cb-block">
          <div class="cb-row"><span>Runden</span>${stepper('', 'rounds', `${D.rounds}×`)}</div>
          <div class="cb-row"><span>Pause zwischen Übungen</span>${stepper('', 'rest', `${D.rest} s`)}</div>
        </div>
        <button class="btn primary block lg" data-start ${D.moves.length ? '' : 'disabled'}>${icon('play', 'xs')} Starten</button>
        <p class="footnote">Der Timer führt dich durch alle Übungen, inklusive Seitenwechsel.</p>
      </div>`;
    o.querySelector('.panel-body').scrollTop = y;
  };
  draw();
  o.addEventListener('input', (e) => { if (e.target.matches('[data-title]')) D.title = e.target.value.slice(0, 40); });
  o.addEventListener('click', async (e) => {
    const t = (sel) => e.target.closest(sel);
    if (t('[data-close]')) return o.close();
    const st = t('[data-d][data-b]');
    if (st) {
      const f = st.dataset.f, d = +st.dataset.d;
      if (f === 'sec') { const m = D.moves[+st.dataset.b]; m.sec = clamp(m.sec + (m.sec >= 60 ? 10 : 5) * d, 10, 180); }
      else if (f === 'rounds') D.rounds = clamp(D.rounds + d, 1, 5);
      else D.rest = clamp(D.rest + 2 * d, 3, 30);
      return draw();
    }
    const sd = t('[data-sides]');
    if (sd) { const [i, v] = sd.dataset.sides.split(':'); D.moves[+i].sides = v === '1'; return draw(); }
    const mv = t('[data-mv]');
    if (mv) { const i = +mv.dataset.mv, j = i + +mv.dataset.d; [D.moves[i], D.moves[j]] = [D.moves[j], D.moves[i]]; return draw(); }
    const del = t('[data-del]');
    if (del) { D.moves.splice(+del.dataset.del, 1); return draw(); }
    if (t('[data-addmove]')) {
      if (D.moves.length >= 40) return toast('Maximal 40 Übungen');
      pickMoves((id) => { D.moves.push({ id, sec: 40, sides: !!MOVES[id][3] }); draw(); });
      return;
    }
    if (t('[data-save]') || t('[data-start]')) {
      const u = clean({ ...D, title: (D.title || 'Meine Mobility').trim() });
      if (!u.moves.length) return toast('Füge mindestens eine Übung hinzu');
      if (programDuration(mobilityPhases(u)) > 2 * 3600) return toast('Maximal 2 Stunden pro Routine');
      if (t('[data-save]')) { await saveUnit(u); toast('Unter „Meine Mobility“ gespeichert'); o.close(); onSave?.(); return; }
      if (customMobility().some((x) => x.id === u.id)) await saveUnit(u);
      else {
        const v = await sheet({ title: 'Routine auch für später speichern?', options: [{ label: 'Speichern & starten', value: 'save', icon: 'check' }, { label: 'Nur starten', value: 'go', icon: 'play' }] });
        if (!v) return;
        if (v === 'save') await saveUnit(u);
      }
      o.close();
      onStart?.(u);
    }
  });
}
