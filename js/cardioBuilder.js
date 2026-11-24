// Cardio-Baukasten: eigene Einheiten aus Blöcken (Aufwärmen, Block, Intervalle, Auslaufen) mit Dauer & Pulszone

import { state, saveSettings } from './store.js';
import { DEVICES, ZONES, programDuration } from './programs.js';
import { icon, overlay, toast, sheet } from './ui.js';
import { esc, num, uid, fmtClock } from './utils.js';

const ROLE = {
  warmup: { label: 'Aufwärmen', zone: 1, min: 5 },
  base: { label: 'Block', zone: 2, min: 20 },
  cool: { label: 'Auslaufen', zone: 1, min: 5 },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// Blöcke → Phasen für den geführten Player
export function blocksToPhases(blocks) {
  const out = [];
  const P = (label, zone, sec, kind, fixed) => out.push({ label, zone, dur: Math.round(sec), kind, ...(fixed ? { fixed } : {}) });
  for (const b of blocks) {
    if (b.type === 'intervals') {
      for (let r = 1; r <= b.reps; r++) {
        P(`Intervall ${r}/${b.reps}`, b.workZone, b.work, 'hard');
        if (r < b.reps && b.rest > 0) P('Erholung', b.restZone, b.rest, 'recover');
      }
    } else {
      const fixed = b.speed || b.incline != null && b.incline !== '' ? { ...(b.speed ? { speed: +b.speed } : {}), ...(b.incline != null && b.incline !== '' ? { incline: +b.incline } : {}) } : null;
      const kind = b.role === 'warmup' ? 'warmup' : b.role === 'cool' ? 'cool' : b.zone >= 4 ? 'hard' : 'base';
      P(b.label || ROLE[b.role]?.label || 'Block', b.zone, b.min * 60, kind, fixed && Object.keys(fixed).length ? fixed : null);
    }
  }
  return out;
}

// Phasen eines vorhandenen Programms → Blöcke (gleichmäßige Hart/Locker-Wechsel werden zu einer Intervall-Serie)
export function phasesToBlocks(phases) {
  const blocks = [];
  for (let i = 0; i < phases.length;) {
    const p = phases[i];
    if (p.kind === 'hard') {
      let reps = 0, j = i;
      const rec = phases[i + 1]?.kind === 'recover' ? phases[i + 1] : null;
      while (phases[j]?.kind === 'hard' && phases[j].dur === p.dur && phases[j].zone === p.zone) {
        reps++;
        const r = phases[j + 1];
        if (r?.kind === 'recover' && rec && r.dur === rec.dur && r.zone === rec.zone && phases[j + 2]?.kind === 'hard' && phases[j + 2].dur === p.dur) j += 2;
        else { j += r?.kind === 'recover' && rec && r.dur === rec.dur ? 2 : 1; break; }
      }
      if (reps >= 2) {
        blocks.push({ type: 'intervals', reps, work: p.dur, workZone: p.zone, rest: rec?.dur || 60, restZone: rec?.zone || 1 });
        i = j;
        continue;
      }
    }
    const role = p.kind === 'warmup' ? 'warmup' : p.kind === 'cool' ? 'cool' : 'base';
    blocks.push({ type: 'steady', role, label: p.label, min: Math.round((p.dur / 60) * 2) / 2, zone: p.zone, speed: p.fixed?.speed ?? '', incline: p.fixed?.incline ?? '' });
    i++;
  }
  return blocks;
}

// gespeicherte Einheiten (lokal) – beim Laden geprüft
export function customUnits() {
  const list = Array.isArray(state.settings.cardioCustom) ? state.settings.cardioCustom : [];
  return list.filter((u) => u && typeof u.id === 'string' && Array.isArray(u.blocks)).map((u) => ({ ...u, device: DEVICES[u.device] ? u.device : 'treadmill', blocks: u.blocks.map(cleanBlock).filter(Boolean) }));
}
function cleanBlock(b) {
  if (!b || typeof b !== 'object') return null;
  const z = (v, d) => clamp(Math.round(+v) || d, 1, 5);
  if (b.type === 'intervals') return { type: 'intervals', reps: clamp(Math.round(+b.reps) || 4, 1, 30), work: clamp(Math.round(+b.work) || 60, 10, 1200), workZone: z(b.workZone, 4), rest: clamp(Math.round(+b.rest) || 0, 0, 900), restZone: z(b.restZone, 1) };
  const role = ROLE[b.role] ? b.role : 'base';
  return { type: 'steady', role, label: String(b.label || ROLE[role].label).slice(0, 40), min: clamp(+b.min || ROLE[role].min, 0.5, 180), zone: z(b.zone, ROLE[role].zone), speed: +b.speed > 0 && +b.speed < 30 ? +b.speed : '', incline: b.incline !== '' && b.incline != null && +b.incline >= -5 && +b.incline <= 25 ? +b.incline : '' };
}
async function saveUnit(u) {
  const list = customUnits().filter((x) => x.id !== u.id);
  list.unshift(u);
  await saveSettings({ cardioCustom: list.slice(0, 30) });
}
export async function deleteUnit(id) {
  await saveSettings({ cardioCustom: customUnits().filter((x) => x.id !== id) });
}

// ---------- Editor ----------
export function openCardioBuilder({ unit = null, template = null, device = 'treadmill', onStart, onSave } = {}) {
  const D = unit
    ? structuredClone(unit)
    : { id: uid(), title: template?.title || 'Meine Einheit', device, blocks: template ? phasesToBlocks(template.phases) : [
      { type: 'steady', role: 'warmup', label: 'Aufwärmen', min: 5, zone: 1, speed: '', incline: '' },
      { type: 'intervals', reps: 6, work: 60, workZone: 4, rest: 90, restZone: 1 },
      { type: 'steady', role: 'cool', label: 'Auslaufen', min: 5, zone: 1, speed: '', incline: '' },
    ] };
  const o = overlay('', 'cardio-builder');
  const zoneChips = (i, f, v) => `<div class="cb-zones">${[1, 2, 3, 4, 5].map((z) => `<button class="cb-z z${z} ${v === z ? 'on' : ''}" data-b="${i}" data-f="${f}" data-v="${z}" title="${esc(ZONES[z].name)}">${z}</button>`).join('')}<small>${esc(ZONES[v].short)}</small></div>`;
  const stepper = (i, f, val, text) => `<div class="cb-step"><button data-b="${i}" data-f="${f}" data-d="-1" aria-label="weniger">−</button><b>${text}</b><button data-b="${i}" data-f="${f}" data-d="1" aria-label="mehr">+</button></div>`;
  const draw = () => {
    const ph = blocksToPhases(D.blocks);
    const tot = programDuration(ph);
    const y = o.querySelector('.panel-body')?.scrollTop || 0;
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Eigene Einheit</div><button class="link-btn" data-save>Speichern</button></div>
      <div class="panel-body">
        <label class="field"><span>Name</span><input data-title value="${esc(D.title)}" maxlength="40"></label>
        <div class="cb-dev">${Object.entries(DEVICES).map(([k, d]) => `<button class="chip ${D.device === k ? 'on' : ''}" data-dev="${k}">${esc(d.label)}</button>`).join('')}</div>
        <div class="cb-sum"><div class="prog-strip">${ph.map((x) => `<i class="z${x.zone}" style="flex:${x.dur}"></i>`).join('')}</div><b>${Math.round(tot / 60)} min</b><small>${ph.length} Abschnitte</small></div>
        ${D.blocks.map((b, i) => `<div class="card cb-block ${b.type}">
          <div class="cb-head"><b>${b.type === 'intervals' ? `${icon('bolt', 'xs')} Intervalle` : esc(b.label || ROLE[b.role].label)}</b>
            <span>${i > 0 ? `<button class="icon-btn sm" data-mv="${i}" data-d="-1" aria-label="nach oben">${icon('up', 'xs')}</button>` : ''}${i < D.blocks.length - 1 ? `<button class="icon-btn sm" data-mv="${i}" data-d="1" aria-label="nach unten">${icon('down', 'xs')}</button>` : ''}<button class="icon-btn sm" data-del="${i}" aria-label="entfernen">${icon('trash', 'xs')}</button></span></div>
          ${b.type === 'intervals' ? `
            <div class="cb-row"><span>Wiederholungen</span>${stepper(i, 'reps', b.reps, `${b.reps}×`)}</div>
            <div class="cb-row"><span>Belastung</span>${stepper(i, 'work', b.work, mmss(b.work))}</div>${zoneChips(i, 'workZone', b.workZone)}
            <div class="cb-row"><span>Erholung</span>${stepper(i, 'rest', b.rest, b.rest ? mmss(b.rest) : 'keine')}</div>${b.rest ? zoneChips(i, 'restZone', b.restZone) : ''}
            <small class="cb-note">= ${fmtClock(b.reps * b.work + (b.reps - 1) * b.rest)} gesamt</small>` : `
            <div class="cb-row"><span>Dauer</span>${stepper(i, 'min', b.min, `${num(b.min, b.min % 1 ? 1 : 0)} min`)}</div>${zoneChips(i, 'zone', b.zone)}
            ${D.device === 'treadmill' ? `<div class="field-row"><label class="field"><span>Tempo km/h (optional)</span><input data-in="${i}:speed" inputmode="decimal" value="${esc(String(b.speed ?? '').replace('.', ','))}" placeholder="nach Zone"></label><label class="field"><span>Steigung % (optional)</span><input data-in="${i}:incline" inputmode="decimal" value="${esc(String(b.incline ?? '').replace('.', ','))}" placeholder="Standard"></label></div>` : ''}`}
        </div>`).join('')}
        <div class="cb-add">
          <button class="btn ghost sm" data-add="warmup">${icon('plus', 'xs')} Aufwärmen</button>
          <button class="btn ghost sm" data-add="base">${icon('plus', 'xs')} Block</button>
          <button class="btn ghost sm" data-add="intervals">${icon('plus', 'xs')} Intervalle</button>
          <button class="btn ghost sm" data-add="cool">${icon('plus', 'xs')} Auslaufen</button>
        </div>
        <button class="btn primary block lg" data-start ${ph.length ? '' : 'disabled'}>${icon('play', 'xs')} Starten</button>
        <p class="footnote">Zonen nach Gefühl: 1 sehr locker · 2 Grundlage (Unterhaltung möglich) · 3 zügig · 4 hart · 5 maximal.</p>
      </div>`;
    o.querySelector('.panel-body').scrollTop = y;
  };
  draw();
  const STEP = { reps: [1, 1, 30], work: [15, 10, 1200], rest: [15, 0, 900], min: [1, 0.5, 180] };
  o.addEventListener('input', (e) => {
    if (e.target.matches('[data-title]')) D.title = e.target.value.slice(0, 40);
    const t = e.target.closest('[data-in]');
    if (t) { const [i, f] = t.dataset.in.split(':'); const v = t.value.replace(',', '.').trim(); D.blocks[+i][f] = v === '' ? '' : +v; }
  });
  o.addEventListener('click', async (e) => {
    const t = (sel) => e.target.closest(sel);
    if (t('[data-close]')) return o.close();
    const dev = t('[data-dev]');
    if (dev) { D.device = dev.dataset.dev; return draw(); }
    const z = t('[data-v]');
    if (z) { D.blocks[+z.dataset.b][z.dataset.f] = +z.dataset.v; return draw(); }
    const st = t('[data-d][data-b]');
    if (st) {
      const b = D.blocks[+st.dataset.b], f = st.dataset.f, [s, lo, hi] = STEP[f];
      let step = s;
      if (f === 'min') step = b.min < 1 || (b.min <= 1 && +st.dataset.d < 0) ? 0.5 : b.min >= 30 ? 5 : 1;
      b[f] = clamp(Math.round((b[f] + step * +st.dataset.d) * 2) / 2, lo, hi);
      return draw();
    }
    const mv = t('[data-mv]');
    if (mv) { const i = +mv.dataset.mv, j = i + +mv.dataset.d; [D.blocks[i], D.blocks[j]] = [D.blocks[j], D.blocks[i]]; return draw(); }
    const del = t('[data-del]');
    if (del) { D.blocks.splice(+del.dataset.del, 1); return draw(); }
    const add = t('[data-add]');
    if (add) {
      const k = add.dataset.add;
      const nb = k === 'intervals' ? { type: 'intervals', reps: 6, work: 60, workZone: 4, rest: 90, restZone: 1 } : { type: 'steady', role: k, label: ROLE[k].label, min: ROLE[k].min, zone: ROLE[k].zone, speed: '', incline: '' };
      const at = k === 'warmup' ? 0 : k === 'cool' ? D.blocks.length : Math.max(0, D.blocks.length - (D.blocks[D.blocks.length - 1]?.role === 'cool' ? 1 : 0));
      D.blocks.splice(at, 0, nb);
      return draw();
    }
    if (t('[data-save]') || t('[data-start]')) {
      const unitClean = { id: D.id, title: (D.title || 'Meine Einheit').trim().slice(0, 40), device: D.device, blocks: D.blocks.map(cleanBlock).filter(Boolean) };
      if (!unitClean.blocks.length) return toast('Füge mindestens einen Block hinzu');
      const tot = programDuration(blocksToPhases(unitClean.blocks));
      if (tot > 4 * 3600) return toast('Maximal 4 Stunden pro Einheit');
      if (t('[data-save]')) { await saveUnit(unitClean); toast('Unter „Meine Einheiten“ gespeichert'); o.close(); onSave?.(); return; }
      if (customUnits().some((x) => x.id === unitClean.id)) await saveUnit(unitClean);
      else {
        const v = await sheet({ title: 'Einheit auch für später speichern?', options: [{ label: 'Speichern & starten', value: 'save', icon: 'check' }, { label: 'Nur starten', value: 'go', icon: 'play' }] });
        if (!v) return;
        if (v === 'save') await saveUnit(unitClean);
      }
      o.close();
      onStart?.(unitClean, blocksToPhases(unitClean.blocks));
    }
  });
}
