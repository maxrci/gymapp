// Geführte Einheiten (Cardio & Mobility) im Vollbild – der Kämpfer macht vor, der Timer läuft automatisch

import { state, saveWorkout, saveSettings } from './store.js';
import { weekStreaks } from './stats.js';
import {
  CARDIO, DEVICES, ZONES, MOBILITY, MOVES, deviceSettings, hrText, mobilityPhases, programDuration, cardioBase,
} from './programs.js';
import { fighterFx } from './fighter.js';
import { poseSVG, mountPose } from './poses.js';
import { stageFor } from './gamification.js';
import { icon, overlay, formDialog, confirmDialog, toast, sheet } from './ui.js';
import { tick as tickSound, phaseStart, finishFanfare, speak, unlockAudio } from './fx.js';
import { esc, fmtClock, num, uid } from './utils.js';
import { openCardioBuilder, customUnits, deleteUnit, blocksToPhases } from './cardioBuilder.js';

const KEY = 'gymlog-guided';
const BREATH = 10; // Sekunden pro Atemzyklus: 4 ein, 6 aus
const ZONE_SPEED = { 1: 0.7, 2: 0.85, 3: 1, 4: 1.25, 5: 1.5 };
let S = null;
let root = null;
let timer = null;
let lastIdx = -1;
let lastSec = -1;
let wake = null;
let anim = null;

const stage = () => stageFor(weekStreaks().current).index;

// ---------------- Auswahl: Cardio ----------------
export function openCardioSetup() {
  let device = state.settings.lastDevice || 'treadmill';
  const opts = {};
  const o = overlay('', 'guided-setup');
  const st = stage();
  const draw = () => {
    const progs = CARDIO.filter((p) => !p.devices || p.devices.includes(device));
    const mine = customUnits();
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Cardio</div><button class="link-btn" data-calib>Gerät</button></div>
      <div class="panel-body">
        <div class="device-grid">${Object.entries(DEVICES).map(([k, d]) => `<button class="device ${k === device ? 'on' : ''}" data-dev="${k}">${poseSVG(d.pose, { stage: st, t: 0.25 })}<span>${esc(d.label)}</span></button>`).join('')}</div>
        <p class="footnote">Grundtempo: ${esc(baseText(device))} – über „Gerät“ anpassen.</p>
        <div class="section-row"><h2 class="section-title">Meine Einheiten</h2><button class="link-btn" data-build>${icon('plus', 'xs')} Eigene bauen</button></div>
        ${mine.length ? mine.map((u) => {
          const ph = blocksToPhases(u.blocks);
          return `<div class="card prog-card mine">
            <div class="prog-head"><b>${esc(u.title)}</b><span>${Math.round(programDuration(ph) / 60)} min · ${esc(DEVICES[u.device].label)}</span></div>
            <div class="prog-strip">${ph.map((x) => `<i class="z${x.zone}" style="flex:${x.dur}"></i>`).join('')}</div>
            <div class="row-btns"><button class="btn primary" data-ustart="${esc(u.id)}">${icon('play', 'xs')} Starten</button><button class="btn ghost" data-uedit="${esc(u.id)}">${icon('edit', 'xs')} Bearbeiten</button><button class="icon-btn" data-udel="${esc(u.id)}" aria-label="Löschen">${icon('trash', 'xs')}</button></div>
          </div>`;
        }).join('') : `<button class="card build-card" data-build>${icon('layers')}<div><b>Eigene Einheit bauen</b><small>Aufwärmen, Blöcke, Intervalle und Auslaufen frei zusammenstellen – Dauer und Zone pro Abschnitt</small></div>${icon('right', 'muted')}</button>`}
        <h2 class="section-title">Programme</h2>
        ${progs.map((p) => {
          const v = opts[p.id] ?? p.def;
          const ph = p.build(v);
          return `<div class="card prog-card">
            <div class="prog-head"><b>${esc(p.title)}</b><span>${Math.round(programDuration(ph) / 60)} min</span></div>
            <div class="prog-strip">${ph.map((x) => `<i class="z${x.zone}" style="flex:${x.dur}"></i>`).join('')}</div>
            <p>${esc(p.desc)}</p>
            ${p.options ? `<div class="chips">${p.options.map((v2) => `<button class="chip ${v2 === v ? 'on' : ''}" data-opt="${p.id}:${v2}">${v2} ${p.optLabel || 'min'}</button>`).join('')}</div>` : ''}
            <div class="row-btns"><button class="btn primary" data-start="${p.id}">${icon('play', 'xs')} Starten</button><button class="btn ghost" data-adapt="${p.id}">${icon('edit', 'xs')} Anpassen</button></div>
          </div>`;
        }).join('')}
      </div>`;
  };
  const startUnit = (u, phases) => { saveSettings({ lastDevice: u.device }); start({ kind: 'cardio', programId: `custom:${u.id}`, device: u.device, title: u.title, phases }); };
  draw();
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const d = e.target.closest('[data-dev]');
    if (d) { device = d.dataset.dev; draw(); return; }
    const op = e.target.closest('[data-opt]');
    if (op) { const [id, v] = op.dataset.opt.split(':'); opts[id] = +v; draw(); return; }
    if (e.target.closest('[data-calib]')) { await calibrate(device); draw(); return; }
    if (e.target.closest('[data-build]')) { openCardioBuilder({ device, onSave: draw, onStart: (u, ph) => { o.close(); startUnit(u, ph); } }); return; }
    const ad = e.target.closest('[data-adapt]');
    if (ad) {
      const p = CARDIO.find((x) => x.id === ad.dataset.adapt);
      const v = opts[p.id] ?? p.def;
      openCardioBuilder({ device, template: { title: `${p.title} (angepasst)`, phases: p.build(v) }, onSave: draw, onStart: (u, ph) => { o.close(); startUnit(u, ph); } });
      return;
    }
    const us = e.target.closest('[data-ustart]');
    if (us) { const u = customUnits().find((x) => x.id === us.dataset.ustart); if (u) { o.close(); startUnit(u, blocksToPhases(u.blocks)); } return; }
    const ue = e.target.closest('[data-uedit]');
    if (ue) { const u = customUnits().find((x) => x.id === ue.dataset.uedit); if (u) openCardioBuilder({ unit: u, onSave: draw, onStart: (uu, ph) => { o.close(); startUnit(uu, ph); } }); return; }
    const ud = e.target.closest('[data-udel]');
    if (ud) { if (await confirmDialog('Diese Einheit löschen?', 'Löschen', true)) { await deleteUnit(ud.dataset.udel); draw(); } return; }
    const stb = e.target.closest('[data-start]');
    if (stb) {
      const p = CARDIO.find((x) => x.id === stb.dataset.start);
      const v = opts[p.id] ?? p.def;
      await saveSettings({ lastDevice: device });
      o.close();
      start({ kind: 'cardio', programId: p.id, opt: v, device, title: `${p.title}${p.options ? ` · ${v} ${p.optLabel || 'min'}` : ''}`, phases: p.build(v) });
    }
  });
}

function baseText(dev) {
  const b = cardioBase(dev);
  if (dev === 'treadmill') return `${num(b.speed, 1)} km/h, ${num(b.incline, 1)} % Steigung`;
  if (dev === 'bike') return `${b.watts} W / Stufe ${b.level}`;
  if (dev === 'elliptical') return `Stufe ${b.level}`;
  return `${Math.floor(b.split / 60)}:${String(b.split % 60).padStart(2, '0')} /500 m`;
}

async function calibrate(dev) {
  const b = cardioBase(dev);
  const F = {
    treadmill: [['speed', 'Grundtempo in km/h (locker, du kannst noch reden)', b.speed], ['incline', 'Steigung in %', b.incline]],
    bike: [['watts', 'Grundlagen-Leistung in Watt', b.watts], ['level', 'Grundlagen-Stufe', b.level], ['rpm', 'Trittfrequenz (U/min)', b.rpm]],
    elliptical: [['level', 'Grundlagen-Stufe', b.level], ['spm', 'Schritte pro Minute', b.spm]],
    rower: [['split', 'Grundtempo in Sekunden pro 500 m (150 = 2:30)', b.split], ['spm', 'Schlagzahl (SPM)', b.spm]],
  }[dev];
  const res = await formDialog({
    title: `${DEVICES[dev].label} einstellen`,
    fields: [
      ...F.map(([name, label, value]) => ({ name, label, value, inputmode: 'decimal' })),
      { name: 'hrMax', label: 'Max. Herzfrequenz (optional)', value: state.settings.hrMax ?? '', inputmode: 'numeric' },
    ],
  });
  if (!res) return;
  const vals = {};
  for (const [k] of F) { const v = parseFloat(String(res[k]).replace(',', '.')); if (!isNaN(v) && v > 0) vals[k] = v; }
  const hr = parseInt(res.hrMax, 10);
  await saveSettings({ cardio: { ...(state.settings.cardio || {}), [dev]: { ...b, ...vals } }, hrMax: hr > 100 && hr < 230 ? hr : null });
  toast('Gerät gespeichert');
}

// ---------------- Auswahl: Mobility ----------------
export function openMobilitySetup() {
  const st = stage();
  const o = overlay(`
    <div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Mobility</div><span style="width:40px"></span></div>
    <div class="panel-body">
      <p class="footnote">Der Timer führt dich durch alle Übungen, inklusive Seitenwechsel. Du musst nichts abhaken.</p>
      ${MOBILITY.map((p) => {
        const ph = mobilityPhases(p);
        return `<div class="card prog-card">
          <div class="prog-head"><b>${esc(p.title)}</b><span>${Math.round(programDuration(ph) / 60)} min</span></div>
          <div class="move-thumbs">${p.moves.map((m) => `<figure>${poseSVG(MOVES[m.id][1], { stage: st, t: 0.5 })}<figcaption>${esc(MOVES[m.id][0])}</figcaption></figure>`).join('')}</div>
          <p>${esc(p.desc)}</p>
          <button class="btn primary block" data-start="${p.id}">${icon('play', 'xs')} Starten</button>
        </div>`;
      }).join('')}
    </div>`, 'guided-setup');
  o.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const stb = e.target.closest('[data-start]');
    if (stb) {
      const p = MOBILITY.find((x) => x.id === stb.dataset.start);
      o.close();
      start({ kind: 'mobility', programId: p.id, title: p.title, phases: mobilityPhases(p) });
    }
  });
}

// Geplante Einheit aus dem AI-Coach direkt geführt starten
export async function startGuidedCardio({ programId, device = 'treadmill', planId = null, opt }) {
  const p = CARDIO.find((x) => x.id === programId);
  if (!p) return;
  const v = opt ?? p.def;
  await saveSettings({ lastDevice: device });
  start({ kind: 'cardio', programId: p.id, opt: v, device, planId, title: `${p.title}${p.options ? ` · ${v} ${p.optLabel || 'min'}` : ''}`, phases: p.build(v) });
}

// ---------------- Player ----------------
function start(cfg) {
  unlockAudio();
  S = { ...cfg, id: uid(), start: Date.now(), pausedAt: null, pausedTotal: 0 };
  persist();
  open();
  speak(`${cfg.title}. Los geht's!`);
}

export function resumeGuided() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.phases && s.phases.every((p) => p.kind !== 'move' || p.pose)) { S = s; open(); return true; }
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
  return false;
}
export const hasGuided = () => !!localStorage.getItem(KEY);
const persist = () => (S ? localStorage.setItem(KEY, JSON.stringify(S)) : localStorage.removeItem(KEY));

const total = () => programDuration(S.phases);
function elapsed() {
  const now = S.pausedAt || Date.now();
  return Math.max(0, (now - S.start - S.pausedTotal) / 1000);
}
function locate(t) {
  let acc = 0;
  for (let i = 0; i < S.phases.length; i++) {
    const p = S.phases[i];
    if (t < acc + p.dur) return { i, p, into: t - acc, left: acc + p.dur - t };
    acc += p.dur;
  }
  return null;
}

function open() {
  root?.remove();
  root = document.createElement('div');
  root.className = 'guided';
  document.body.appendChild(root);
  document.body.classList.add('editor-open');
  lastIdx = -1; lastSec = -1;
  root.addEventListener('click', onClick);
  requestAnimationFrame(() => root.classList.add('open'));
  clearInterval(timer);
  timer = setInterval(update, 250);
  update();
  acquireWake();
}

function close() {
  clearInterval(timer);
  timer = null;
  anim?.stop();
  wake?.release?.(); wake = null;
  root?.classList.remove('open');
  const r = root;
  setTimeout(() => r?.remove(), 250);
  root = null;
  document.body.classList.remove('editor-open');
}

async function acquireWake() {
  try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && root) { acquireWake(); update(); } });

function phaseTitle(p) {
  if (S.kind === 'cardio') return p.label;
  if (p.kind === 'prep') return `Gleich: ${p.name}`;
  if (p.kind === 'switch') return 'Seite wechseln';
  return p.name;
}

function nextText(i) {
  const n = S.phases[i + 1];
  if (!n) return 'Danach: geschafft';
  if (S.kind === 'cardio') {
    const ds = deviceSettings(S.device, n.zone, n.fixed);
    return `Danach: ${n.label} · ${fmtClock(n.dur)} · ${ds.items[0].value}`;
  }
  const nn = n.kind === 'prep' || n.kind === 'switch' ? S.phases[i + 2] || n : n;
  return `Danach: ${nn.name}${nn.side ? ` (${nn.side})` : ''}`;
}

function structure(loc) {
  const { i, p } = loc;
  const breathe = S.kind === 'mobility' && p.kind === 'move';
  const cls = S.kind === 'cardio' ? `z${p.zone} k-${p.kind}` : `mob k-${p.kind}`;
  root.className = `guided open ${cls} ${S.pausedAt ? 'paused' : ''}`;
  const sub = S.kind === 'cardio' ? `${DEVICES[S.device].label}` : 'Mobility';
  root.innerHTML = `
    <div class="g-bg"></div>
    <div class="g-top">
      <button class="icon-btn" data-g="exit" aria-label="Beenden">${icon('x')}</button>
      <div class="g-title">${esc(S.title)}<small>${esc(sub)} · noch <span data-l="rem">0:00</span></small></div>
      <button class="icon-btn" data-g="voice" aria-label="Sprachansage">${icon(state.settings.voice ? 'volume' : 'mute')}</button>
    </div>
    <div class="g-segs">${S.phases.map((x, k) => `<i class="${S.kind === 'cardio' ? `z${x.zone}` : `m-${x.kind}`} ${k < i ? 'past' : k === i ? 'now' : ''}" style="flex:${x.dur}"></i>`).join('')}</div>
    <div class="g-main">
      <div class="g-phase">${esc(phaseTitle(p))}${p.side ? ` <span class="g-side">${esc(p.side)}</span>` : ''}</div>
      <div class="g-figure ${p.kind === 'hard' ? 'hot' : ''}" data-l="fig"></div>
      <div class="g-ring">
        ${breathe ? `<div class="breath-big" style="animation-delay:-${(loc.into % BREATH).toFixed(2)}s"></div>` : ''}
        <svg viewBox="0 0 240 240"><circle cx="120" cy="120" r="108" class="g-ring-bg"/><circle cx="120" cy="120" r="108" class="g-ring-fg" data-l="ring" pathLength="1000"/></svg>
        <div class="g-ring-in">
          <div class="g-time" data-l="left">0:00</div>
          <div class="g-sub" data-l="sub">${S.kind === 'cardio' ? esc(ZONES[p.zone].short) : p.kind === 'prep' ? 'Position einnehmen' : p.kind === 'switch' ? 'Wechseln' : 'Einatmen'}</div>
        </div>
      </div>
      ${S.kind === 'cardio'
        ? `<div class="g-settings">${deviceSettings(S.device, p.zone, p.fixed).items.slice(0, 2).map((x) => `<div><small>${esc(x.label)}</small><b>${esc(x.value)}</b></div>`).join('')}</div>
           <div class="g-zone">${esc(ZONES[p.zone].name)} · ${esc(hrText(p.zone))}</div>`
        : `<p class="g-cue">${esc(p.cue)}</p>`}
    </div>
    <div class="g-bottom">
      <div class="g-next">${esc(nextText(i))}</div>
      <div class="g-ctrl">
        <button class="btn ghost" data-g="pause">${S.pausedAt ? `${icon('play')} Weiter` : `${icon('pause')} Pause`}</button>
        <button class="btn ghost" data-g="skip">${icon('skip')} Weiter</button>
      </div>
    </div>`;
  anim?.stop();
  const fig = root.querySelector('[data-l="fig"]');
  const poseId = S.kind === 'cardio' ? DEVICES[S.device].pose : p.pose;
  const speed = S.pausedAt ? 0 : S.kind === 'cardio' ? ZONE_SPEED[p.zone] : p.kind === 'move' ? 1 : 0.4;
  anim = mountPose(fig, poseId, { stage: stage(), speed });
}

function update() {
  if (!S || !root) return;
  const t = elapsed();
  const T = total();
  if (t >= T) return finish();
  const loc = locate(t);
  if (loc.i !== lastIdx) {
    const first = lastIdx === -1;
    lastIdx = loc.i;
    structure(loc);
    if (!first) {
      phaseStart();
      const p = loc.p;
      if (S.kind === 'cardio') {
        const ds = deviceSettings(S.device, p.zone, p.fixed);
        speak(`${p.label}. ${ds.items.slice(0, 2).map((x) => `${x.label} ${x.value.replace('km/h', 'Kilometer pro Stunde').replace(' W', ' Watt')}`).join(', ')}.`);
      } else if (p.kind === 'prep') speak(`Gleich: ${p.name}.`);
      else if (p.kind === 'switch') speak('Seite wechseln.');
      else speak(`${p.name}${p.side ? `, ${p.side}` : ''}.`);
    }
  }
  const secLeft = Math.ceil(loc.left);
  root.querySelector('[data-l="left"]').textContent = fmtClock(secLeft);
  root.querySelector('[data-l="rem"]').textContent = fmtClock(T - t);
  root.querySelector('[data-l="ring"]').style.strokeDashoffset = String(1000 * (loc.into / loc.p.dur));
  if (S.kind === 'mobility' && loc.p.kind === 'move') {
    root.querySelector('[data-l="sub"]').textContent = loc.into % BREATH < 4 ? 'Einatmen' : 'Ausatmen';
  }
  if (secLeft !== lastSec) {
    lastSec = secLeft;
    if (secLeft <= 3 && secLeft >= 1 && !S.pausedAt) tickSound();
    if (Math.abs(t - T / 2) < 0.6 && !S.half) { S.half = true; speak('Halbzeit.'); }
    if (loc.p.kind === 'hard' && secLeft === 10 && loc.p.dur >= 30) speak('Noch 10 Sekunden.');
  }
}

async function onClick(e) {
  const b = e.target.closest('[data-g]');
  if (!b || !S) return;
  unlockAudio();
  const a = b.dataset.g;
  if (a === 'pause') {
    if (S.pausedAt) { S.pausedTotal += Date.now() - S.pausedAt; S.pausedAt = null; } else S.pausedAt = Date.now();
    persist();
    lastIdx = -1;
    update();
  }
  if (a === 'skip') {
    const loc = locate(elapsed());
    if (loc) { S.start -= loc.left * 1000 + 50; persist(); update(); }
  }
  if (a === 'voice') {
    await saveSettings({ voice: !state.settings.voice });
    b.innerHTML = icon(state.settings.voice ? 'volume' : 'mute');
    if (state.settings.voice) speak('Sprachansage an.');
  }
  if (a === 'exit') {
    const t = elapsed();
    const v = await sheet({
      title: 'Einheit beenden?',
      options: [
        ...(t >= 60 ? [{ label: 'Beenden & speichern', value: 'save', icon: 'check' }] : []),
        { label: 'Verwerfen (nicht speichern)', value: 'discard', icon: 'trash', danger: true },
      ],
    });
    if (v === 'save') finish(true);
    if (v === 'discard') { S = null; persist(); close(); toast('Einheit verworfen'); }
  }
}

async function finish(early = false) {
  if (!S) return;
  clearInterval(timer);
  anim?.stop();
  const t = Math.min(elapsed(), total());
  const done = S;
  S = null;
  persist();
  finishFanfare();
  speak(early ? 'Gut gemacht!' : 'Geschafft! Starke Leistung!');
  let dist = null;
  if (done.kind === 'cardio' && done.device === 'treadmill') {
    let acc = 0, km = 0;
    for (const p of done.phases) {
      const d = Math.max(0, Math.min(p.dur, t - acc));
      km += (deviceSettings('treadmill', p.zone, p.fixed).speed * d) / 3600;
      acc += p.dur;
    }
    dist = Math.round(km * 100) / 100;
  }
  root.className = 'guided open done';
  root.innerHTML = `
    <div class="g-bg"></div>
    <div class="g-finish">
      <div class="g-fin-fighter">${fighterFx(stage(), { enter: true, powerUp: true })}</div>
      <h2>${early ? 'Gut gemacht!' : 'Geschafft!'}</h2>
      <p>${esc(done.title)} · ${fmtClock(t)}</p>
      ${done.kind === 'cardio' ? `<label class="field"><span>Distanz in km (optional${dist ? ', geschätzt' : ''})</span><input data-dist inputmode="decimal" value="${dist ?? ''}" placeholder="z. B. 5,2"></label>` : ''}
      <button class="btn primary block lg" data-fin="save">Speichern</button>
      <button class="btn danger-ghost block" data-fin="discard">Nicht speichern</button>
    </div>`;
  root.onclick = async (e) => {
    const b = e.target.closest('[data-fin]');
    if (!b) return;
    if (b.dataset.fin === 'save') {
      const dv = root.querySelector('[data-dist]');
      const km = dv ? parseFloat(dv.value.replace(',', '.')) : NaN;
      const now = Date.now();
      const w = {
        id: uid(), title: done.kind === 'cardio' ? `Cardio: ${done.title}` : `Mobility: ${done.title}`,
        start: now - t * 1000, end: now, description: '', source: 'app', ...(done.planId ? { planId: done.planId } : {}),
        exercises: [{
          name: done.kind === 'cardio' ? DEVICES[done.device].exercise : 'Mobility',
          notes: done.title, supersetId: null,
          sets: [{ type: 'normal', weight: null, reps: null, distance: isNaN(km) ? null : km, duration: Math.round(t), rpe: null }],
        }],
      };
      await saveWorkout(w);
      toast('Einheit gespeichert');
      close();
      location.hash = `#/w/${w.id}`;
    } else if (await confirmDialog('Einheit verwerfen?', 'Verwerfen', true)) close();
  };
}
