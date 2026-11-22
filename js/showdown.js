// Könige-Duelle (5 Sekunden): Cardio-Rennen, Workout-Stemmen, Mobility-Dehnen – mit 2 oder mehr Kämpfern.
// Rennen: der Schnellste rennt mit Blitzen davon, der Langsamste humpelt als Rentner mit Gehstock hinterher.
// Stemmen: der Stärkste drückt die schwerste Hantel, der Schwächste wird von seiner Hantel plattgedrückt.
// Dehnen: der Beweglichste landet im Spagat, der Steifste bleibt mit „Knack!“ und Rückenschmerzen stehen.

import { poseFrame } from './poses.js';
import { unlockAudio, powerUpSound, beep } from './fx.js';
import { state } from './store.js';
import { icon } from './ui.js';
import { esc } from './utils.js';

export const SHOW_MS = 5000;
// Bildausschnitt je Disziplin (Rennen breit, Stemmen eng & hoch, Dehnen breit für den Spagat)
const VBS = { race: [0, -34, 220, 226], lift: [48, -46, 124, 232], stretch: [22, 20, 176, 172] };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = (u) => 1 - (1 - u) ** 3;

function noise(dur = 0.3, vol = 0.4, freq = 900) {
  const c = unlockAudio();
  if (!c || state.settings.prSound === false) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}
const sfx = (fn) => { if (state.settings.prSound !== false) fn(); };

const BOLTS = `<svg class="sd-bolts" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M60 2 38 40h14l-10 30 26-42H54z"/><path d="M14 30 4 50h8l-6 18 16-24h-9z"/><path d="M90 46 80 64h7l-5 16 14-22h-8z"/></svg>`;

const TITLES = { race: 'Cardio-Rennen', lift: 'Kraft-Duell', stretch: 'Mobility-Duell' };

// people: [{ id, name, look, stage, value, text }]
export function startShowdown({ kind, title, people, sub = '' }) {
  unlockAudio();
  const list = [...people].sort((a, b) => b.value - a.value);
  const max = Math.max(...list.map((p) => p.value), 0);
  const min = Math.min(...list.map((p) => p.value));
  const tie = max === min;
  const n = list.length;
  // Anzeige-Reihenfolge = Eingabe-Reihenfolge (damit „du“ immer links/oben bist)
  const P = people.map((p) => {
    const s = max > 0 ? p.value / max : 0;
    return {
      ...p, s, best: !tie && p.value === max, worst: !tie && n >= 2 && p.value === min,
      rank: list.findIndex((q) => q.value === p.value) + 1, phase: Math.random() * 0.3,
    };
  });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vb = VBS[kind] || VBS.race;

  const o = document.createElement('div');
  o.className = `fight showdown sd-${kind} ${n > 2 ? 'many' : ''}`;
  o.innerHTML = `
    <div class="fg-bg"><i class="fg-lines"></i></div>
    <div class="sd-head"><small>${esc(TITLES[kind] || '')}</small><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
    <div class="sd-field">${P.map((p, i) => `
      <div class="sd-lane" data-i="${i}">
        ${kind === 'race' ? '<i class="sd-track"></i>' : ''}
        <div class="sd-fig ${p.best ? 'best' : ''} ${p.worst ? 'worst' : ''}" style="aspect-ratio:${vb[2]} / ${vb[3]}">
          ${p.best ? BOLTS : ''}<i class="sd-aura"></i>
          <svg class="sd-svg" viewBox="${vb.join(' ')}" aria-hidden="true"><g></g></svg>
          <span class="sd-pop"></span>
        </div>
        <div class="sd-tag"><b>${esc(p.name)}</b><small>${esc(p.text)}</small></div>
      </div>`).join('')}</div>
    <div class="sd-msg"></div>
    <div class="fg-result sd-result">
      <small>${tie ? 'Unentschieden' : kind === 'race' ? 'Schnellster' : kind === 'lift' ? 'Stärkster' : 'Beweglichster'}</small>
      <b>${tie ? 'Gleich stark' : esc(list[0].name)}</b>
      <div class="sd-rank">${list.map((p, i) => `<div class="${i === 0 && !tie ? 'top' : ''}"><span>${i + 1}.</span><em>${esc(p.name)}</em><span>${esc(p.text)}</span>${!tie && i === 0 ? `<i class="sd-badge gold">${icon(kind === 'race' ? 'bolt' : 'trophy', 'xs')} König</i>` : ''}${!tie && n >= 2 && p.value === min ? `<i class="sd-badge">${kind === 'race' ? 'Rentner' : kind === 'lift' ? 'Plattgedrückt' : 'Steif wie ein Brett'}</i>` : ''}</div>`).join('')}</div>
      <div class="fg-actions"><button class="btn ghost" data-again>${icon('repeat')} Nochmal</button><button class="btn primary" data-close>Schließen</button></div>
    </div>
    <i class="fg-flash"></i>
    <button class="fg-skip" data-skip aria-label="Überspringen">${icon('skip')}</button>`;
  document.body.appendChild(o);
  requestAnimationFrame(() => o.classList.add('open'));

  const lanes = [...o.querySelectorAll('.sd-lane')];
  const figs = lanes.map((l) => l.querySelector('.sd-fig'));
  const gs = lanes.map((l) => l.querySelector('.sd-svg g'));
  const pops = lanes.map((l) => l.querySelector('.sd-pop'));
  const msg = o.querySelector('.sd-msg');
  const flash = o.querySelector('.fg-flash');
  const field = o.querySelector('.sd-field');

  const say = (t) => { msg.textContent = t; msg.classList.remove('show'); void msg.offsetWidth; msg.classList.add('show'); };
  const pop = (i, t) => { const e = pops[i]; e.textContent = t; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); };

  // ---------- Zeitplan ----------
  const events = {
    race: [
      [0, () => say('Auf die Plätze …')],
      [650, () => { say('LOS!'); sfx(() => beep(990, 0.2, 0.35)); }],
      [1600, () => P.forEach((p, i) => { if (p.worst) pop(i, 'Uff …'); })],
      [2300, () => P.forEach((p, i) => { if (p.best) { pop(i, 'Zisch!'); noise(0.5, 0.35, 2600); } })],
      [4250, () => { o.classList.add('done'); if (!tie) powerUpSound(); }],
    ],
    lift: [
      [0, () => say('Hantel greifen …')],
      [600, () => say('DRÜCKEN!')],
      [2600, () => P.forEach((p, i) => { if (p.worst) { pop(i, 'Ächz!'); } })],
      [3150, () => P.forEach((p, i) => { if (p.worst) { noise(0.7, 0.7, 500); flashIt(); } })],
      [3500, () => P.forEach((p, i) => { if (p.best) { pop(i, 'Leicht!'); if (!tie) powerUpSound(); } })],
      [4250, () => o.classList.add('done')],
    ],
    stretch: [
      [0, () => say('Und dehnen …')],
      [1700, () => P.forEach((p, i) => { if (p.worst) { pop(i, 'KNACK!'); noise(0.12, 0.8, 3200); } })],
      [2200, () => P.forEach((p, i) => { if (p.best) { pop(i, 'Spagat!'); flashIt(); if (!tie) powerUpSound(); } })],
      [4250, () => o.classList.add('done')],
    ],
  }[kind];
  function flashIt() { flash.style.opacity = 0.7; setTimeout(() => { flash.style.opacity = 0; }, 140); }

  let t0 = performance.now(), prev = t0, raf = 0, fired = 0, lastDraw = 0;

  const frame = (now) => {
    const t = reduce ? SHOW_MS : now - t0;
    const dt = Math.min(64, now - prev);
    prev = now;
    while (fired < events.length && t >= events[fired][0]) events[fired++][1]();
    const W = field.clientWidth;
    const draw = now - lastDraw > 30 || t >= SHOW_MS;
    if (draw) lastDraw = now;

    P.forEach((p, i) => {
      const f = figs[i];
      let pose = 'stand', ph = 0, look = p.look || {}, plate = 1, tr = '';
      if (kind === 'race') {
        const u = seg(t, 650, 4250);
        const sp = tie ? 0.75 : 0.3 + 0.7 * p.s;
        const fw = f.clientWidth;
        let x = 0;
        if (p.worst) {
          pose = 'oldwalk';
          look = { ...look, hair: 'weiss' };
          x = u * W * 0.12;
          p.phase += t > 650 ? dt / 1500 : 0;
        } else {
          pose = t > 650 ? 'sprint' : 'stand';
          const dist = p.best ? W * 1.25 : (W - fw) * 0.85 * sp;
          x = (p.best ? u ** 1.6 : ease(u)) * dist;
          p.phase += t > 650 ? (dt / 520) * (0.7 + sp * 0.8) : 0;
        }
        tr = `translateX(${x}px)`;
        ph = p.phase % 1;
        f.classList.toggle('zoom', p.best && t > 2300);
      } else if (kind === 'lift') {
        pose = 'ohp';
        plate = 0.7 + 1.0 * (tie ? 0.7 : p.s);
        const u = seg(t, 600, 3500);
        if (p.worst) {
          // schafft es nicht hoch – zittert und wird plattgedrückt
          const shake = t > 600 && t < 3150 ? Math.sin(t * 0.08) * 1.6 : 0;
          ph = t < 3150 ? 0.05 + 0.05 * Math.sin(u * 9) ** 2 : 0;
          const crush = ease(seg(t, 3150, 3600));
          tr = `translateX(${shake}px) translateY(${crush * 18}%) scaleY(${1 - crush * 0.45}) rotate(${crush * 12}deg)`;
        } else {
          const reps = p.best ? 4 : 1 + Math.round(p.s * 2.5);
          ph = t < 600 ? 0 : t < 3500 ? (u * reps) % 1 : 0.5;
          if (t >= 3500) ph = 0.5;
          if (p.best && t > 3500) tr = `translateY(${-Math.sin(Math.PI * seg(t, 3500, 4100)) * 6}%)`;
        }
        if (t > 600 && t < 3500 && !p.worst && Math.floor(ph * 2) !== p.lastHalf) { p.lastHalf = Math.floor(ph * 2); }
      } else {
        // Dehnen: Vorbeuge so weit es geht, der Beste geht in den Spagat
        const u = ease(seg(t, 300, 1600));
        if (p.best) {
          if (t < 2200) { pose = 'fold'; ph = 0.5 * u; } else { pose = 'splits'; ph = (t / 1600) % 1; }
        } else if (p.worst) {
          if (t < 2600) {
            pose = 'fold'; ph = 0.07 * u + (t > 1200 && t < 1800 ? 0.01 * Math.sin(t * 0.09) : 0);
            if (t > 1700) tr = `translateX(${Math.sin(t * 0.12) * 1.2}px)`;
          } else { pose = 'oldwalk'; ph = 0.25; look = { ...look }; }
        } else {
          pose = 'fold'; ph = 0.5 * u * (tie ? 0.7 : 0.25 + 0.6 * p.s);
        }
      }
      f.style.transform = tr;
      f.classList.toggle('charged', p.best && ((kind === 'lift' && t > 3500) || (kind === 'stretch' && t > 2200) || (kind === 'race' && t > 2300)));
      if (draw) gs[i].innerHTML = poseFrame(pose, ph, p.stage || 0, look, { plate, noShadow: kind === 'race' });
    });
    if (t < SHOW_MS) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const restart = () => {
    cancelAnimationFrame(raf);
    o.classList.remove('done');
    figs.forEach((f) => { f.style.transform = ''; f.classList.remove('zoom', 'charged'); });
    P.forEach((p) => { p.phase = Math.random() * 0.3; });
    fired = 0; t0 = performance.now(); prev = t0;
    raf = requestAnimationFrame(frame);
  };
  const close = () => { cancelAnimationFrame(raf); o.classList.remove('open'); setTimeout(() => o.remove(), 250); };
  o.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-again]')) return restart();
    if (e.target.closest('[data-skip]')) {
      cancelAnimationFrame(raf);
      while (fired < events.length) events[fired++][1]();
      t0 = performance.now() - SHOW_MS;
      raf = requestAnimationFrame(frame);
    }
  });
  return { close };
}
