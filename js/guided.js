// Geführte Einheiten (Cardio & Mobility) im Vollbild – Timer läuft automatisch weiter

import { state, saveWorkout, saveSettings } from './store.js';
import { weekStreaks } from './stats.js';
import {
  CARDIO, DEVICES, ZONES, MOBILITY, MOVES, deviceSettings, hrText, mobilityPhases, programDuration, cardioBase,
} from './programs.js';
import { fighterSVG, fighterFx } from './fighter.js';
import { stageFor } from './gamification.js';
import { icon, overlay, formDialog, confirmDialog, toast } from './ui.js';
import { tick as tickSound, phaseStart, finishFanfare, speak, unlockAudio } from './fx.js';
import { esc, fmtClock, num, uid } from './utils.js';

const KEY = 'gymlog-guided';
let S = null;        // laufende Session
let root = null;
let timer = null;
let lastIdx = -1;
let lastSec = -1;
let wake = null;
let msgIdx = 0;

// ---------------- Auswahl: Cardio ----------------
export function openCardioSetup() {
  let device = state.settings.lastDevice || 'treadmill';
  const opts = {};
  const o = overlay('', 'guided-setup');
  const draw = () => {
    const progs = CARDIO.filter((p) => !p.devices || p.devices.includes(device));
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Cardio geführt</div><button class="link-btn" data-calib>Gerät</button></div>
      <div class="panel-body">
        <div class="list-label">Gerät</div>
        <div class="device-grid">${Object.entries(DEVICES).map(([k, d]) => `<button class="device ${k === device ? 'on' : ''}" data-dev="${k}"><span>${d.icon}</span>${esc(d.label)}</button>`).join('')}</div>
        <p class="footnote">Die Einstellungen werden aus deinem Grundlagentempo berechnet (${esc(baseText(device))}). Über „Gerät“ oben anpassen.</p>
        <div class="list-label">Programm</div>
        ${progs.map((p) => {
          const v = opts[p.id] ?? p.def;
          const ph = p.build(v);
          return `<div class="card prog-card">
            <div class="prog-head"><span class="prog-ic">${p.icon}</span><div><b>${esc(p.title)}</b><small>${fmtClock(programDuration(ph))} min · ${ph.filter((x) => x.kind === 'hard').length || 'keine'} harte Phasen</small></div></div>
            <p>${esc(p.desc)}</p>
            <div class="prog-strip">${ph.map((x) => `<i class="z${x.zone}" style="flex:${x.dur}"></i>`).join('')}</div>
            ${p.options ? `<div class="chips">${p.options.map((v2) => `<button class="chip ${v2 === v ? 'on' : ''}" data-opt="${p.id}:${v2}">${v2} ${p.optLabel || 'min'}</button>`).join('')}</div>` : ''}
            <button class="btn primary block" data-start="${p.id}">${icon('play', 'xs')} Starten</button>
          </div>`;
        }).join('')}
      </div>`;
  };
  draw();
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const d = e.target.closest('[data-dev]');
    if (d) { device = d.dataset.dev; draw(); return; }
    const op = e.target.closest('[data-opt]');
    if (op) { const [id, v] = op.dataset.opt.split(':'); opts[id] = +v; draw(); return; }
    if (e.target.closest('[data-calib]')) { await calibrate(device); draw(); return; }
    const st = e.target.closest('[data-start]');
    if (st) {
      const p = CARDIO.find((x) => x.id === st.dataset.start);
      const v = opts[p.id] ?? p.def;
      await saveSettings({ lastDevice: device });
      o.close();
      start({ kind: 'cardio', programId: p.id, opt: v, device, title: `${p.title}${p.options ? ` ${v}${p.optLabel ? ` ${p.optLabel}` : ' min'}` : ''}`, phases: p.build(v) });
    }
  });
}

function baseText(dev) {
  const b = cardioBase(dev);
  if (dev === 'treadmill') return `${num(b.speed, 1)} km/h, ${num(b.incline, 1)} %`;
  if (dev === 'bike') return `${b.watts} W / Stufe ${b.level}`;
  if (dev === 'elliptical') return `Stufe ${b.level}`;
  return `${Math.floor(b.split / 60)}:${String(b.split % 60).padStart(2, '0')} /500 m`;
}

async function calibrate(dev) {
  const b = cardioBase(dev);
  const F = {
    treadmill: [['speed', 'Grundlagentempo (km/h) – locker, du kannst noch reden', b.speed], ['incline', 'Steigung (%)', b.incline]],
    bike: [['watts', 'Grundlagen-Leistung (Watt)', b.watts], ['level', 'Grundlagen-Stufe', b.level], ['rpm', 'Trittfrequenz (U/min)', b.rpm]],
    elliptical: [['level', 'Grundlagen-Stufe', b.level], ['spm', 'Schritte pro Minute', b.spm]],
    rower: [['split', 'Grundlagentempo in Sekunden pro 500 m (z. B. 150 = 2:30)', b.split], ['spm', 'Schlagzahl (SPM)', b.spm]],
  }[dev];
  const res = await formDialog({
    title: `${DEVICES[dev].label} einstellen`,
    fields: [
      ...F.map(([name, label, value]) => ({ name, label, value, inputmode: 'decimal' })),
      { name: 'hrMax', label: 'Max. Herzfrequenz (optional, für Puls-Zonen)', value: state.settings.hrMax ?? '', inputmode: 'numeric' },
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
  const o = overlay(`
    <div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Mobility geführt</div><span style="width:40px"></span></div>
    <div class="panel-body">
      <p class="footnote">Die App führt dich automatisch durch alle Übungen – inklusive Seitenwechsel und Vorbereitungszeit. Du musst nichts abhaken.</p>
      ${MOBILITY.map((p) => {
        const ph = mobilityPhases(p);
        return `<div class="card prog-card">
          <div class="prog-head"><span class="prog-ic">${p.icon}</span><div><b>${esc(p.title)}</b><small>${Math.round(programDuration(ph) / 60)} min · ${p.moves.length} Übungen</small></div></div>
          <p>${esc(p.desc)}</p>
          <div class="move-chips">${p.moves.map((m) => `<span>${MOVES[m.id][1]} ${esc(MOVES[m.id][0])}</span>`).join('')}</div>
          <button class="btn primary block" data-start="${p.id}">${icon('play', 'xs')} Starten</button>
        </div>`;
      }).join('')}
    </div>`, 'guided-setup');
  o.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const st = e.target.closest('[data-start]');
    if (st) {
      const p = MOBILITY.find((x) => x.id === st.dataset.start);
      o.close();
      start({ kind: 'mobility', programId: p.id, title: p.title, phases: mobilityPhases(p) });
    }
  });
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
    if (s && s.phases) { S = s; open(); return true; }
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
    if (t < acc + p.dur) return { i, p, into: t - acc, left: acc + p.dur - t, startAt: acc };
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

const MSG = {
  hard: ['Alles geben! 🔥', 'Du bist stärker als du denkst!', 'Atmen – und durchziehen!', 'Genau hier wirst du besser!', 'Power-Level steigt! ⚡'],
  recover: ['Stark! Jetzt locker bleiben.', 'Puls runter, Atmung beruhigen.', 'Gleich geht\'s wieder los.'],
  base: ['Schön gleichmäßig bleiben.', 'Zone 2 baut deine Ausdauer-Basis.', 'Locker, aber konstant.', 'Du machst das super!'],
  warmup: ['Locker einrollen …', 'Langsam auf Betriebstemperatur kommen.'],
  cool: ['Fast geschafft – auslaufen.', 'Hervorragende Arbeit heute!'],
  move: ['Tief und ruhig atmen.', 'Nicht wippen – sanft halten.', 'Spannung loslassen.', 'Gut so!'],
  prep: ['Position einnehmen.'], switch: ['Seite wechseln.'],
};

function phaseInfoHtml(p, cur) {
  if (S.kind === 'cardio') {
    const ds = deviceSettings(S.device, p.zone, p.fixed);
    return `<div class="g-settings">${ds.items.map((x) => `<div><small>${esc(x.label)}</small><b>${esc(x.value)}</b></div>`).join('')}</div>
      <div class="g-zone"><span class="zdot z${p.zone}"></span>${esc(ZONES[p.zone].name)} · ${esc(ZONES[p.zone].feel)} · ${esc(hrText(p.zone))}</div>`;
  }
  return `<div class="g-move">
      <div class="g-emoji">${p.emoji}</div>
      ${p.side ? `<div class="g-side">${esc(p.side)}</div>` : ''}
      <div class="g-name">${esc(p.name)}</div>
      <p class="g-cue">${esc(p.cue)}</p>
      ${p.kind === 'move' ? '<div class="breath"><i></i><span>Atmen</span></div>' : ''}
    </div>`;
}

function nextText(i) {
  const n = S.phases[i + 1];
  if (!n) return 'Danach: Geschafft! 🎉';
  if (S.kind === 'cardio') {
    const ds = deviceSettings(S.device, n.zone, n.fixed);
    return `Danach: ${n.label} · ${fmtClock(n.dur)} · ${ds.items.slice(0, 2).map((x) => x.value).join(' · ')}`;
  }
  const nn = n.kind === 'prep' || n.kind === 'switch' ? S.phases[i + 2] || n : n;
  return `Danach: ${nn.name}${nn.side ? ` (${nn.side})` : ''}`;
}

function phaseTitle(p) {
  if (S.kind === 'cardio') return p.label;
  const count = new Set(S.phases.map((x) => x.idx)).size;
  if (p.kind === 'prep') return 'Vorbereiten';
  if (p.kind === 'switch') return 'Seite wechseln';
  return `Übung ${p.idx + 1} von ${count}`;
}

function structure(loc) {
  const { i, p } = loc;
  const stage = stageFor(weekStreaks().current).index;
  const hard = p.kind === 'hard';
  const kindCls = S.kind === 'cardio' ? `z${p.zone} k-${p.kind}` : `mob k-${p.kind}`;
  root.className = `guided open ${kindCls}`;
  root.innerHTML = `
    <div class="g-bg"></div>
    ${hard ? '<div class="g-flames"><i></i><i></i><i></i><i></i><i></i></div>' : ''}
    <div class="g-top">
      <button class="icon-btn" data-g="exit" aria-label="Beenden">${icon('x')}</button>
      <div class="g-title">${esc(S.title)}<small>${S.kind === 'cardio' ? `${DEVICES[S.device].icon} ${esc(DEVICES[S.device].label)}` : '🧘 Mobility'}</small></div>
      <button class="icon-btn" data-g="voice" aria-label="Sprachansage">${state.settings.voice ? '🔊' : '🔈'}</button>
    </div>
    <div class="g-track">
      <div class="g-segs">${S.phases.map((x, k) => `<i class="${S.kind === 'cardio' ? `z${x.zone}` : `m-${x.kind}`} ${k < i ? 'past' : k === i ? 'now' : ''}" style="flex:${x.dur}"></i>`).join('')}</div>
      <div class="g-runner" data-l="runner">${S.kind === 'cardio' ? DEVICES[S.device].icon : '🧘'}</div>
    </div>
    <div class="g-main">
      <div class="g-phase">${esc(phaseTitle(p))}</div>
      <div class="g-ring">
        <svg viewBox="0 0 240 240"><circle cx="120" cy="120" r="106" class="g-ring-bg"/><circle cx="120" cy="120" r="106" class="g-ring-fg" data-l="ring" pathLength="1000"/></svg>
        <div class="g-ring-in">
          ${hard && S.kind === 'cardio' ? `<div class="g-mini-fighter">${fighterSVG(Math.max(3, stage), { powerUp: true })}</div>` : ''}
          <div class="g-time" data-l="left">0:00</div>
          <div class="g-sub">${S.kind === 'cardio' ? esc(ZONES[p.zone].short) : p.kind === 'move' ? 'halten' : p.kind === 'prep' ? 'vorbereiten' : 'wechseln'}</div>
        </div>
      </div>
      ${phaseInfoHtml(p, loc)}
      <div class="g-msg" data-l="msg"></div>
    </div>
    <div class="g-bottom">
      <div class="g-next">${esc(nextText(i))}</div>
      <div class="g-totals"><span>Vergangen <b data-l="el">0:00</b></span><span>Verbleibend <b data-l="rem">0:00</b></span></div>
      <div class="g-ctrl">
        <button class="btn ghost" data-g="pause">${S.pausedAt ? `${icon('play')} Weiter` : '❚❚ Pause'}</button>
        <button class="btn ghost" data-g="skip">Überspringen ⏭</button>
      </div>
    </div>`;
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
    msgIdx = 0;
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
  root.querySelector('[data-l="el"]').textContent = fmtClock(t);
  root.querySelector('[data-l="rem"]').textContent = fmtClock(T - t);
  root.querySelector('[data-l="ring"]').style.strokeDashoffset = String(1000 * (loc.into / loc.p.dur));
  const runner = root.querySelector('[data-l="runner"]');
  runner.style.left = `calc(${(t / T) * 100}% - 14px)`;
  // Countdown-Töne in den letzten 3 Sekunden
  if (secLeft !== lastSec) {
    lastSec = secLeft;
    if (secLeft <= 3 && secLeft >= 1 && !S.pausedAt) tickSound();
    if (Math.abs(t - T / 2) < 0.6 && !S.half) { S.half = true; speak('Halbzeit! Weiter so.'); }
    if (loc.p.kind === 'hard' && secLeft === 10 && loc.p.dur >= 30) speak('Noch 10 Sekunden!');
  }
  const pool = MSG[loc.p.kind] || MSG.base;
  const mi = Math.floor(loc.into / 12) % pool.length;
  const msgEl = root.querySelector('[data-l="msg"]');
  if (msgEl && msgEl.dataset.i !== String(mi)) {
    msgEl.dataset.i = mi;
    msgEl.classList.remove('pop');
    void msgEl.offsetWidth;
    msgEl.textContent = loc.p.kind === 'hard' && loc.left < 30 ? `Nur noch ${Math.ceil(loc.left)} Sekunden! 💥` : pool[mi];
    msgEl.classList.add('pop');
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
    b.textContent = state.settings.voice ? '🔊' : '🔈';
    if (state.settings.voice) speak('Sprachansage an.');
  }
  if (a === 'exit') {
    const t = elapsed();
    if (t < 60) {
      if (await confirmDialog('Einheit abbrechen?', 'Abbrechen', true)) { S = null; persist(); close(); }
      return;
    }
    const v = await confirmDialog('Einheit jetzt beenden und speichern?', 'Beenden & speichern');
    if (v) finish(true);
  }
}

async function finish(early = false) {
  if (!S) return;
  clearInterval(timer);
  const t = Math.min(elapsed(), total());
  const done = S;
  S = null;
  persist();
  finishFanfare();
  speak(early ? 'Gut gemacht!' : 'Geschafft! Hervorragende Arbeit!');
  // Distanz schätzen (Laufband: Geschwindigkeit × Zeit)
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
  const stage = stageFor(weekStreaks().current).index;
  root.className = 'guided open done';
  root.innerHTML = `
    <div class="g-bg"></div>
    <div class="g-finish">
      <div class="confetti-rain">${Array.from({ length: 24 }, (_, k) => `<i style="left:${(k * 4.2) % 100}%;animation-delay:${(k % 8) * 0.15}s"></i>`).join('')}</div>
      <div class="g-fin-fighter">${fighterFx(stage, { enter: true, powerUp: true })}</div>
      <h2>${early ? 'Gut gemacht!' : 'Geschafft! 🎉'}</h2>
      <p>${esc(done.title)}</p>
      <div class="kpis three">
        <div class="kpi"><small>Dauer</small><b>${fmtClock(t)}</b></div>
        ${done.kind === 'cardio' ? `<div class="kpi"><small>Harte Phasen</small><b>${done.phases.filter((p) => p.kind === 'hard').length}</b></div>` : `<div class="kpi"><small>Übungen</small><b>${new Set(done.phases.map((p) => p.idx)).size}</b></div>`}
        <div class="kpi"><small>${done.kind === 'cardio' ? 'Gerät' : 'Typ'}</small><b>${done.kind === 'cardio' ? DEVICES[done.device].icon : '🧘'}</b></div>
      </div>
      ${done.kind === 'cardio' ? `<label class="field"><span>Distanz in km (optional${dist ? ', geschätzt' : ''})</span><input data-dist inputmode="decimal" value="${dist ?? ''}" placeholder="z. B. 5,2"></label>` : ''}
      <button class="btn primary block lg" data-fin="save">Workout speichern</button>
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
        start: now - t * 1000, end: now, description: '', source: 'app',
        exercises: [{
          name: done.kind === 'cardio' ? DEVICES[done.device].exercise : 'Mobility',
          notes: done.title, supersetId: null,
          sets: [{ type: 'normal', weight: null, reps: null, distance: isNaN(km) ? null : km, duration: Math.round(t), rpe: null }],
        }],
      };
      await saveWorkout(w);
      toast('Einheit gespeichert 💪');
      close();
      location.hash = `#/w/${w.id}`;
    } else if (await confirmDialog('Einheit verwerfen?', 'Verwerfen', true)) close();
  };
}
