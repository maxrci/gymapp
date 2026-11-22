// Effekte: Sounds (WebAudio-Synthese), Sprachansagen, PR-Einblendung

import { state } from './store.js';
import { fighterSVG } from './fighter.js';
import { esc } from './utils.js';

let ctx = null;
let primed = false;
// iOS: Audio darf erst nach einer Berührung starten und wird nach Sperrbildschirm/Anruf/Musik „interrupted“ –
// dann muss der Kontext bei der nächsten Berührung wieder aufgeweckt werden (nicht nur bei „suspended“).
export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (!primed) {
      // ein stiller Mini-Ton während der Berührung schaltet Audio auf iOS zuverlässig frei
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
      primed = true;
    }
  } catch { /* kein Audio */ }
  return ctx;
}
// Bei jeder Berührung Audio wach halten, damit Rekord-Sounds auch nach der Satzpause (Bildschirm gesperrt) kommen
if (typeof document !== 'undefined') {
  const wake = () => { if (ctx && ctx.state !== 'running') unlockAudio(); };
  document.addEventListener('pointerdown', wake, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
}

// Test aus den Einstellungen: Power-up + Kampfschrei (unabhängig von den Schaltern)
export function testPrSound() {
  const c = unlockAudio();
  if (!c) return false;
  const saved = { ...state.settings };
  state.settings.prSound = true; state.settings.prScream = true;
  battleCry(0.05);
  state.settings.prSound = saved.prSound; state.settings.prScream = saved.prScream;
  return true;
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

// Kampfschrei im Stil eines Anime-Energieangriffs (eigene Silben, komplett synthetisiert):
// vier tiefe, langgezogene Lade-Silben „Ho – ka – mi – na“ mit Energie-Brummen und Knistern,
// kurzes Einatmen, dann ein langer, explodierender „HAAAAAA!“-Schrei mit Energiestrahl und Knall.
// Stimme = zwei Sägezähne + Atemrauschen → Verzerrung → drei Formant-Filter, deren Frequenzen je Laut wandern.
const FORM = {
  a: [800, 1200, 2600], o: [500, 850, 2500], i: [300, 2250, 3000], e: [450, 1900, 2550], u: [350, 800, 2300],
  m: [250, 1000, 2200], n: [250, 1600, 2600],
};
export const CRY_SECONDS = 3.4;

export function battleCry(delay = 0) {
  const c = unlockAudio();
  if (!c || state.settings.prSound === false || state.settings.prScream === false) return;
  const t0 = c.currentTime + delay;
  const SYL = [['h', 'o'], ['k', 'a'], ['m', 'i'], ['n', 'a']];
  const sylDur = 0.34, gap = 0.06;
  const shoutAt = SYL.length * (sylDur + gap) + 0.16;
  const shoutDur = 1.6;
  const end = shoutAt + shoutDur;
  const nodes = [];
  const at = (s) => t0 + s;

  // Ausgang: Kompressor (laut & druckvoll) + kurzes Echo (Arena)
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.12;
  const master = c.createGain(); master.gain.value = 0.78;
  comp.connect(master).connect(c.destination);
  // Echo erst beim großen Schrei – sonst verschwimmen die Silben
  const send = c.createGain(); send.gain.setValueAtTime(0, at(0)); send.gain.setValueAtTime(1, at(shoutAt));
  const dl = c.createDelay(); dl.delayTime.value = 0.14;
  const fb = c.createGain(); fb.gain.value = 0.24;
  master.connect(send).connect(dl).connect(fb).connect(dl); fb.connect(c.destination);

  // ---------- Stimme ----------
  const v1 = c.createOscillator(), v2 = c.createOscillator();
  v1.type = 'sawtooth'; v2.type = 'sawtooth';
  const pitch = (s, hz, ramp = true) => {
    for (const [o, m] of [[v1, 1], [v2, 1.012]]) {
      if (ramp) o.frequency.linearRampToValueAtTime(hz * m, at(s)); else o.frequency.setValueAtTime(hz * m, at(s));
    }
  };
  pitch(0, 112, false);
  const vib = c.createOscillator(); vib.frequency.value = 5.5;
  const vibG = c.createGain();
  vibG.gain.setValueAtTime(1.5, at(0)); vibG.gain.setValueAtTime(1.5, at(shoutAt + 0.3)); vibG.gain.linearRampToValueAtTime(11, at(end - 0.2));
  vib.connect(vibG); vibG.connect(v1.frequency); vibG.connect(v2.frequency);
  const jit = c.createOscillator(); jit.type = 'square'; jit.frequency.value = 27;
  const jitG = c.createGain(); jitG.gain.setValueAtTime(0.5, at(0)); jitG.gain.setValueAtTime(0.5, at(shoutAt)); jitG.gain.linearRampToValueAtTime(5, at(shoutAt + 0.3));
  jit.connect(jitG); jitG.connect(v1.frequency);
  const vsum = c.createGain(); vsum.gain.value = 0.5;
  v1.connect(vsum); v2.connect(vsum);
  const drive = c.createGain();
  drive.gain.setValueAtTime(1.2, at(0)); drive.gain.setValueAtTime(1.2, at(shoutAt)); drive.gain.linearRampToValueAtTime(4, at(shoutAt + 0.3));
  const ws = c.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 2.6); }
  ws.curve = curve;
  const voice = c.createGain(); voice.gain.setValueAtTime(0, at(0));
  vsum.connect(drive).connect(ws).connect(voice);
  const F = [0, 1, 2].map((k) => {
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = [6, 9, 11][k];
    bp.frequency.setValueAtTime(FORM.o[k], at(0));
    const g = c.createGain(); g.gain.value = [1, 0.65, 0.35][k] * 2.6;
    voice.connect(bp).connect(g).connect(comp);
    return bp;
  });
  const form = (s, key, tc = 0.018) => F.forEach((bp, k) => bp.frequency.setTargetAtTime(FORM[key][k], at(s), tc));

  // ---------- Rauschen (Atem, Konsonanten) ----------
  const len = Math.ceil(c.sampleRate * (end + 0.3));
  const nb = c.createBuffer(1, len, c.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource(); noise.buffer = nb;
  const nbp = c.createBiquadFilter(); nbp.type = 'bandpass'; nbp.Q.value = 0.9; nbp.frequency.setValueAtTime(1800, at(0));
  const ng = c.createGain(); ng.gain.setValueAtTime(0, at(0));
  noise.connect(nbp).connect(ng).connect(comp);

  // ---------- Lade-Silben ----------
  SYL.forEach(([cons, vow], i) => {
    const s = i * (sylDur + gap);
    const hz = 112 + i * 7;
    pitch(s, hz, false);
    pitch(s + sylDur, hz * 0.94);
    voice.gain.setValueAtTime(0, at(s));
    let on = 0.09;
    if (cons === 'h') {
      nbp.frequency.setValueAtTime(1500, at(s));
      ng.gain.setValueAtTime(0, at(s)); ng.gain.linearRampToValueAtTime(0.32, at(s + 0.015)); ng.gain.linearRampToValueAtTime(0.02, at(s + 0.09));
      form(s, vow, 0.01);
    } else if (cons === 'k') {
      nbp.frequency.setValueAtTime(2800, at(s));
      ng.gain.setValueAtTime(0, at(s + 0.035)); ng.gain.linearRampToValueAtTime(0.55, at(s + 0.04)); ng.gain.linearRampToValueAtTime(0.04, at(s + 0.075));
      form(s + 0.05, vow, 0.012);
      on = 0.11;
    } else { // Nasal: geschlossener Mund, dann Vokal
      form(s, cons, 0.005);
      voice.gain.linearRampToValueAtTime(0.32, at(s + 0.03));
      form(s + 0.08, vow, 0.02);
      ng.gain.setValueAtTime(0.03, at(s));
      on = 0.13;
    }
    voice.gain.linearRampToValueAtTime(0.6, at(s + on));
    voice.gain.setValueAtTime(0.6, at(s + sylDur - 0.07));
    voice.gain.linearRampToValueAtTime(0, at(s + sylDur));
    nbp.frequency.setValueAtTime(1800, at(s + 0.1));
    ng.gain.setValueAtTime(0.02, at(s + sylDur - 0.07)); ng.gain.linearRampToValueAtTime(0, at(s + sylDur));
  });

  // ---------- Einatmen + Schrei ----------
  nbp.frequency.setValueAtTime(1100, at(shoutAt - 0.15));
  ng.gain.setValueAtTime(0, at(shoutAt - 0.15)); ng.gain.linearRampToValueAtTime(0.16, at(shoutAt - 0.03)); ng.gain.linearRampToValueAtTime(0.4, at(shoutAt + 0.01));
  nbp.frequency.setValueAtTime(1600, at(shoutAt + 0.01));
  ng.gain.linearRampToValueAtTime(0.12, at(shoutAt + 0.12));
  ng.gain.setValueAtTime(0.12, at(end - 0.25)); ng.gain.linearRampToValueAtTime(0, at(end));
  form(shoutAt, 'a', 0.012);
  pitch(shoutAt, 165, false);
  pitch(shoutAt + 0.22, 255);
  pitch(shoutAt + 1.0, 300);
  pitch(end - 0.12, 355);
  voice.gain.setValueAtTime(0, at(shoutAt));
  voice.gain.linearRampToValueAtTime(0.85, at(shoutAt + 0.09));
  voice.gain.linearRampToValueAtTime(1, at(end - 0.3));
  voice.gain.linearRampToValueAtTime(0, at(end));

  // ---------- Energie: Brummen, Knistern, Strahl, Knall ----------
  const hum = c.createOscillator(); hum.type = 'sine';
  hum.frequency.setValueAtTime(52, at(0)); hum.frequency.linearRampToValueAtTime(78, at(shoutAt)); hum.frequency.linearRampToValueAtTime(110, at(end));
  const hg = c.createGain(); hg.gain.setValueAtTime(0, at(0)); hg.gain.linearRampToValueAtTime(0.07, at(shoutAt - 0.2)); hg.gain.linearRampToValueAtTime(0.22, at(shoutAt + 0.3)); hg.gain.linearRampToValueAtTime(0.26, at(end - 0.2)); hg.gain.linearRampToValueAtTime(0, at(end + 0.1));
  hum.connect(hg).connect(comp);
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
  const cg = c.createGain(); cg.gain.setValueAtTime(0, at(0));
  noise.connect(hp).connect(cg).connect(comp);
  let r = 13;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let k = 0; k < 22; k++) { // Knistern wird dichter, je näher der Schrei kommt
    const s = 0.15 + (shoutAt - 0.2) * Math.sqrt(rnd());
    const v = 0.06 + 0.18 * (s / shoutAt);
    cg.gain.setValueAtTime(0, at(s)); cg.gain.linearRampToValueAtTime(v, at(s + 0.004)); cg.gain.linearRampToValueAtTime(0, at(s + 0.03 + rnd() * 0.03));
  }
  const beam = c.createOscillator(); beam.type = 'sawtooth';
  beam.frequency.setValueAtTime(70, at(shoutAt)); beam.frequency.exponentialRampToValueAtTime(240, at(end));
  const blp = c.createBiquadFilter(); blp.type = 'lowpass'; blp.frequency.setValueAtTime(500, at(shoutAt)); blp.frequency.exponentialRampToValueAtTime(2200, at(end));
  const bg = c.createGain(); bg.gain.setValueAtTime(0, at(0)); bg.gain.setValueAtTime(0, at(shoutAt)); bg.gain.linearRampToValueAtTime(0.18, at(shoutAt + 0.2)); bg.gain.linearRampToValueAtTime(0.24, at(end - 0.15)); bg.gain.linearRampToValueAtTime(0, at(end + 0.15));
  beam.connect(blp).connect(bg).connect(comp);
  const sweep = c.createBiquadFilter(); sweep.type = 'bandpass'; sweep.Q.value = 2;
  sweep.frequency.setValueAtTime(400, at(shoutAt)); sweep.frequency.exponentialRampToValueAtTime(3500, at(end));
  const sg = c.createGain(); sg.gain.setValueAtTime(0, at(0)); sg.gain.setValueAtTime(0, at(shoutAt)); sg.gain.linearRampToValueAtTime(0.22, at(shoutAt + 0.3)); sg.gain.linearRampToValueAtTime(0, at(end + 0.1));
  noise.connect(sweep).connect(sg).connect(comp);
  const boomLp = c.createBiquadFilter(); boomLp.type = 'lowpass'; boomLp.frequency.value = 260;
  const boomG = c.createGain(); boomG.gain.setValueAtTime(0, at(0)); boomG.gain.setValueAtTime(0, at(shoutAt)); boomG.gain.linearRampToValueAtTime(0.9, at(shoutAt + 0.02)); boomG.gain.exponentialRampToValueAtTime(0.001, at(shoutAt + 0.9));
  noise.connect(boomLp).connect(boomG).connect(comp);

  nodes.push(v1, v2, vib, jit, noise, hum, beam);
  for (const x of nodes) { x.start(at(0)); x.stop(at(end + 0.3)); }
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
  // Sounds hängen nur an ihren eigenen Schaltern (Power-up / Kampfschrei), nicht an der Animation
  unlockAudio();
  if (state.settings.prScream !== false) battleCry(0.05); else powerUpSound();
  navigator.vibrate?.([60, 40, 60, 40, 200]);
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
  requestAnimationFrame(() => el.classList.add('show'));
  popTimer = setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('hide');
    setTimeout(() => el.remove(), 450);
  }, 3600);
}
