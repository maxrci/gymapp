// Effekte: Sounds (WebAudio-Synthese), Sprachansagen, PR-Einblendung

import { state } from './store.js';
import { fighterSVG } from './fighter.js';
import { esc } from './utils.js';

let ctx = null;
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* kein Audio */ }
  return ctx;
}

export function beep(freq = 880, dur = 0.15, vol = 0.35, delay = 0, type = 'sine') {
  const c = unlockAudio();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function restDoneSound() {
  if (!state.settings.restSound) return;
  beep(880, 0.2, 0.4, 0); beep(880, 0.2, 0.4, 0.25); beep(1320, 0.3, 0.4, 0.5);
}

// 3-2-1 vor einem Phasenwechsel (Tick) bzw. Start der neuen Phase (hoch)
export function tick() { if (state.settings.restSound) beep(660, 0.12, 0.3); }
export function phaseStart() { if (state.settings.restSound) { beep(990, 0.18, 0.4); beep(1320, 0.3, 0.35, 0.18); } }
export function finishFanfare() {
  if (!state.settings.restSound) return;
  [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.35, 0.3, i * 0.14, 'triangle'));
}

// „Power-up“: aufsteigendes Energie-Rauschen + heller Akkord (ca. 2,5 s)
export function powerUpSound() {
  const c = unlockAudio();
  if (!c || state.settings.prSound === false) return;
  const t0 = c.currentTime;
  const master = c.createGain();
  master.gain.value = 0.32;
  master.connect(c.destination);
  // Aufsteigender Ton mit Tremolo
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(110, t0);
  o.frequency.exponentialRampToValueAtTime(880, t0 + 1.5);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(400, t0);
  lp.frequency.exponentialRampToValueAtTime(4000, t0 + 1.5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.3);
  g.gain.setValueAtTime(0.5, t0 + 1.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.65);
  const lfo = c.createOscillator();
  const lfoG = c.createGain();
  lfo.frequency.value = 18;
  lfoG.gain.value = 0.25;
  lfo.connect(lfoG).connect(g.gain);
  o.connect(lp).connect(g).connect(master);
  o.start(t0); o.stop(t0 + 1.7); lfo.start(t0); lfo.stop(t0 + 1.7);
  // Rauschen (Aura)
  const len = c.sampleRate * 1.6;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i / len);
  const n = c.createBufferSource();
  n.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(600, t0);
  bp.frequency.exponentialRampToValueAtTime(3000, t0 + 1.5);
  const ng = c.createGain();
  ng.gain.value = 0.35;
  n.connect(bp).connect(ng).connect(master);
  n.start(t0);
  // Akkord nach dem Aufladen
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
    const oo = c.createOscillator();
    const gg = c.createGain();
    oo.type = 'triangle';
    oo.frequency.value = f;
    const s = t0 + 1.6 + i * 0.03;
    gg.gain.setValueAtTime(0.0001, s);
    gg.gain.exponentialRampToValueAtTime(0.28, s + 0.02);
    gg.gain.exponentialRampToValueAtTime(0.0001, s + 1.0);
    oo.connect(gg).connect(master);
    oo.start(s); oo.stop(s + 1.05);
  });
}

// Kampfschrei („HAAAAA!“): synthetische Stimme – Sägezahn mit Vibrato, Verzerrung und Vokal-Formanten (a)
export function battleCry(delay = 0) {
  const c = unlockAudio();
  if (!c || state.settings.prSound === false || state.settings.prScream === false) return;
  const t0 = c.currentTime + delay;
  const T = 1.9;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.55, t0 + 0.09);
  out.gain.linearRampToValueAtTime(0.75, t0 + T - 0.35);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + T);
  // Hall (kurzes Echo) für Arena-Gefühl
  const dl = c.createDelay(); dl.delayTime.value = 0.11;
  const fb = c.createGain(); fb.gain.value = 0.28;
  out.connect(c.destination);
  out.connect(dl).connect(fb).connect(dl);
  fb.connect(c.destination);
  // Stimmquelle: zwei leicht verstimmte Sägezähne
  const pitch = (o, mul) => {
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(190 * mul, t0);
    o.frequency.exponentialRampToValueAtTime(300 * mul, t0 + 0.28);
    o.frequency.linearRampToValueAtTime(320 * mul, t0 + T - 0.5);
    o.frequency.exponentialRampToValueAtTime(410 * mul, t0 + T - 0.1);
  };
  const o1 = c.createOscillator(); pitch(o1, 1);
  const o2 = c.createOscillator(); pitch(o2, 1.012);
  // Vibrato + Zittern
  const vib = c.createOscillator(); vib.frequency.value = 6.5;
  const vibG = c.createGain(); vibG.gain.value = 9;
  vib.connect(vibG); vibG.connect(o1.frequency); vibG.connect(o2.frequency);
  const jit = c.createOscillator(); jit.type = 'square'; jit.frequency.value = 23;
  const jitG = c.createGain(); jitG.gain.value = 4;
  jit.connect(jitG); jitG.connect(o1.frequency);
  // Rauheit: Verzerrung
  const ws = c.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * 3.2); }
  ws.curve = curve;
  const src = c.createGain(); src.gain.value = 0.5;
  o1.connect(src); o2.connect(src);
  src.connect(ws);
  // Atem/Rauschen
  const len = Math.floor(c.sampleRate * T);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const n = c.createBufferSource(); n.buffer = buf;
  const nG = c.createGain(); nG.gain.value = 0.22;
  n.connect(nG).connect(ws);
  // Formanten für „A“
  for (const [f, q, g] of [[780, 7, 1], [1180, 9, 0.7], [2500, 11, 0.35], [3400, 12, 0.18]]) {
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const gg = c.createGain(); gg.gain.value = g * 2.2;
    ws.connect(bp).connect(gg).connect(out);
  }
  for (const x of [o1, o2, vib, jit, n]) { x.start(t0); x.stop(t0 + T + 0.05); }
}

// Sprachansage (falls aktiviert)
export function speak(text) {
  if (!state.settings.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('de'));
    if (v) u.voice = v;
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

// Nicht-blockierende PR-Einblendung für 3 Sekunden
let popTimer = null;
export function prPopup({ exercise, detail, stage = 3 }) {
  if (state.settings.prEffects === false) return;
  document.querySelector('.pr-pop')?.remove();
  clearTimeout(popTimer);
  const el = document.createElement('div');
  el.className = 'pr-pop';
  el.innerHTML = `
    <div class="pr-burst"></div>
    <div class="pr-fighter">${fighterSVG(Math.max(stage, 3), { powerUp: true })}</div>
    <div class="pr-text"><div class="pr-title">NEUER REKORD!</div><div class="pr-ex">${esc(exercise)}</div><div class="pr-detail">${esc(detail)}</div></div>`;
  document.body.appendChild(el);
  powerUpSound();
  battleCry(0.05);
  navigator.vibrate?.([60, 40, 60, 40, 200]);
  requestAnimationFrame(() => el.classList.add('show'));
  popTimer = setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('hide');
    setTimeout(() => el.remove(), 450);
  }, 3000);
}
