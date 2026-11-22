// Arena-Kampf: zwei Kämpfer, 5 Sekunden Animation – wer im gewählten Wert besser ist, gewinnt.
// Ablauf: Auftritt → Aufladen → zwei Schlagabtausche → Energiestrahl-Duell → K.o. → Siegerpose.

import { fighterSVG } from './fighter.js';
import { unlockAudio, powerUpSound } from './fx.js';
import { state } from './store.js';
import { sheet, icon } from './ui.js';
import { esc, num, fmtVolume } from './utils.js';
import { ALLTIME, alltimeValue, KINGS, exKey, MOBILITY_RE } from './compete.js';
import { startShowdown } from './showdown.js';

export const DURATION = 5000;

// ---------- Kategorien ----------
export const FIGHT_CATS = [
  { key: 'season', label: 'Saison-Punkte' },
  ...KINGS.map((k) => ({ key: `king:${k.key}`, label: `${k.label} (Saison)`, king: k })),
  ...ALLTIME,
];
const kingOf = (key) => FIGHT_CATS.find((c) => c.key === key)?.king;

export function kingValue(st, k) {
  if (!st) return 0;
  return k === 'gym' ? st.gym || 0 : k === 'cardio' ? st.cardio || 0 : st.mobility || 0;
}
export function fmtKing(k, st) {
  if (!st) return '–';
  if (k === 'gym') return st.gym ? `${fmtVolume(st.gym)} · ${st.gymN} Workouts` : '–';
  if (k === 'cardio') return st.cardio ? `${num(st.kmEq, 0)} km-Äq. · Ø ${num(st.watt, 0)} W` : '–';
  return st.mobility ? `${num(st.mobility, 0)} Min.` : '–';
}

export function catValue(g, id, key, rel) {
  if (key === 'season') return g.season.rows.find((r) => r.id === id)?.points || 0;
  const k = kingOf(key);
  if (k) return kingValue(g.kings?.season?.[id], k.key);
  return alltimeValue(g.alltime[id] || { abs: {}, rel: {} }, key, rel);
}
export function fmtCat(key, v, rel, g, id) {
  const cat = FIGHT_CATS.find((c) => c.key === key) || {};
  if (cat.king && g) return fmtKing(cat.king.key, g.kings?.season?.[id]);
  if (!v) return '–';
  if (key === 'season') return `${num(v, 0)} P`;
  if (rel) return `${num(v, 2)} × KG`;
  if (key === 'volume') return fmtVolume(v);
  if (key === 'hours') return `${num(v, 0)} h`;
  if (key === 'km') return `${num(v, 0)} km`;
  if (key === 'streak') return `${v} Wo.`;
  if (cat.strength) return `${num(v, 1)} kg`;
  return num(v, 0);
}
export const catLabel = (key, rel) => `${FIGHT_CATS.find((c) => c.key === key)?.label || ''}${rel ? ' (× KG)' : ''}`;

// Kategorie wählen und Kampf starten
export async function chooseFight(g, aId, bId) {
  const key = await sheet({ title: 'Worin wird gekämpft?', options: FIGHT_CATS.map((c) => ({ label: c.label, value: c.key, icon: c.king ? c.king.icon : c.strength ? 'weight' : c.key === 'season' ? 'trophy' : 'bolt' })) });
  if (!key) return;
  let rel = false;
  if (FIGHT_CATS.find((c) => c.key === key)?.strength) {
    const v = await sheet({ title: 'Wertung', options: [{ label: 'Absolut (kg)', value: 'abs', icon: 'weight' }, { label: 'Relativ zum Körpergewicht (× KG)', value: 'rel', icon: 'user' }] });
    if (!v) return;
    rel = v === 'rel';
  }
  startFight(g, aId, bId, key, rel);
}

// ---------- Sounds ----------
function noise(dur = 0.35, vol = 0.5, freq = 900) {
  const c = unlockAudio();
  if (!c || state.settings.prSound === false) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}
function beamHum(dur = 1.1) {
  const c = unlockAudio();
  if (!c || state.settings.prSound === false) return;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(90, t0);
  o.frequency.linearRampToValueAtTime(220, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  o.connect(lp).connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// ---------- Kampf ----------
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (u) => 1 - (1 - u) ** 3;
const easeIn = (u) => u * u * u;

// Könige-Kategorie mit allen oder zwei Kämpfern
export function startKingShowdown(g, kingKey, ids, period = 'season') {
  const k = KINGS.find((x) => x.key === kingKey);
  const st = g.kings?.[period] || {};
  const people = ids.map((id) => g.members.find((m) => m.id === id)).filter(Boolean)
    .map((m) => ({ id: m.id, name: m.name, look: m.look || {}, stage: m.stage, value: kingValue(st[m.id], kingKey), text: fmtKing(kingKey, st[m.id]) }));
  if (people.length < 2) return;
  const pl = { month: 'Dieser Monat', season: 'Saison', all: 'Ewig' }[period];
  startShowdown({ kind: k.anim, title: k.label, sub: pl, people });
}

// Kampf in einer bestimmten Übung (aus dem Übungs-Vergleich)
export function startExerciseFight(g, aId, bId, name, rel = false) {
  const k = exKey(name);
  const A = g.members.find((m) => m.id === aId), B = g.members.find((m) => m.id === bId);
  const ba = g.exercises?.[aId]?.[k], bb = g.exercises?.[bId]?.[k];
  if (!A || !B) return;
  const t = ba?.t || bb?.t;
  const isW = t === 'weight' || t === 'weighted_bw';
  const val = (b) => (!b ? 0 : isW ? (rel ? b.rel : b.e) : t === 'cardio' ? b.d : t === 'duration' ? b.sec : b.mr);
  const txt = (b) => { const v = val(b); if (!v) return '–'; return isW ? (rel ? `${num(v, 2)} × KG` : `${num(v, 1)} kg`) : t === 'cardio' ? `${num(v, 2)} km` : t === 'duration' ? `${Math.round(v / 60)} Min.` : `${num(v, 0)} Wdh.`; };
  const people = [[A, ba], [B, bb]].map(([m, b]) => ({ id: m.id, name: m.name, look: m.look || {}, stage: m.stage, value: val(b), text: txt(b) }));
  const kind = isW || t === 'bodyweight' ? 'lift' : t === 'cardio' ? 'race' : MOBILITY_RE.test(name) ? 'stretch' : 'race';
  startShowdown({ kind, title: name, sub: isW ? (rel ? 'Bestes 1RM ÷ Körpergewicht' : 'Bestes geschätztes 1RM') : '', people });
}

// ---------- Vorschläge: zu jedem Freund eine Kategorie, in der er/sie vorne liegt ----------
export function fightSuggestions(g, me) {
  const cands = [];
  for (const c of FIGHT_CATS) {
    cands.push({ key: c.key, rel: false });
    if (c.strength) cands.push({ key: c.key, rel: true });
  }
  const vals = cands.map((c) => ({ ...c, v: Object.fromEntries(g.members.map((m) => [m.id, catValue(g, m.id, c.key, c.rel)])) }));
  const friends = g.members.filter((m) => m.id !== me);
  const used = new Set();
  const ck = (c) => `${c.key}|${c.rel}`;
  const leads = (f) => vals.filter((c) => c.v[f.id] > 0 && g.members.every((m) => m.id === f.id || c.v[f.id] > c.v[m.id]));
  const margin = (c, id) => { const others = g.members.filter((m) => m.id !== id).map((m) => c.v[m.id]); const second = Math.max(0, ...others); return second ? c.v[id] / second : 99; };
  const out = [];
  for (const f of [...friends].sort((a, b) => leads(a).length - leads(b).length)) {
    let pool = leads(f).map((c) => ({ c, how: 'lead' }));
    if (!pool.length) pool = vals.filter((c) => c.v[f.id] > (c.v[me] || 0)).map((c) => ({ c, how: 'beats' }));
    if (!pool.length) continue; // überall hinten
    pool.sort((a, b) => margin(b.c, f.id) - margin(a.c, f.id));
    const pick = pool.find((x) => !used.has(ck(x.c))) || pool[0];
    used.add(ck(pick.c));
    out.push({ friend: f, key: pick.c.key, rel: pick.c.rel, how: pick.how, va: pick.c.v[me] || 0, vb: pick.c.v[f.id] });
  }
  return friends.map((f) => out.find((x) => x.friend.id === f.id)).filter(Boolean);
}

export function startFight(g, aId, bId, key, rel = false) {
  const A = g.members.find((m) => m.id === aId);
  const B = g.members.find((m) => m.id === bId);
  if (!A || !B) return;
  const k = kingOf(key);
  if (k) return startKingShowdown(g, k.key, [aId, bId], 'season');
  const va = catValue(g, aId, key, rel);
  const vb = catValue(g, bId, key, rel);
  const winner = va > vb ? 'a' : vb > va ? 'b' : null;
  const adv = Math.max(va, vb) ? (va - vb) / Math.max(va, vb) : 0; // −1 … 1, positiv = A vorne
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const o = document.createElement('div');
  o.className = 'fight';
  o.innerHTML = `
    <div class="fg-bg"><i class="fg-lines"></i><i class="fg-ground"></i></div>
    <div class="fg-stage">
      <div class="fg-hud">
        <div class="fg-name a"><b>${esc(A.name)}</b><small>${esc(fmtCat(key, va, rel))}</small></div>
        <div class="fg-vs">VS</div>
        <div class="fg-name b"><b>${esc(B.name)}</b><small>${esc(fmtCat(key, vb, rel))}</small></div>
      </div>
      <div class="fg-cat">${esc(catLabel(key, rel))}</div>
      <div class="fg-beams"><i class="ba"></i><i class="bb"></i><i class="fg-clash"></i></div>
      <div class="fg-f a"><div class="fg-body">${fighterSVG(A.stage, { look: A.look || {}, powerUp: true })}</div></div>
      <div class="fg-f b"><div class="fg-body">${fighterSVG(B.stage, { look: B.look || {}, powerUp: true })}</div></div>
      <i class="fg-hit"></i><i class="fg-boom"></i>
      <div class="fg-result">
        <small>${winner ? 'Sieger' : 'Unentschieden'}</small>
        <b>${winner ? esc((winner === 'a' ? A : B).name) : 'Gleich stark'}</b>
        <span>${esc(fmtCat(key, va, rel))} : ${esc(fmtCat(key, vb, rel))}</span>
        <div class="fg-actions"><button class="btn ghost" data-again>${icon('repeat')} Nochmal</button><button class="btn primary" data-close>Schließen</button></div>
      </div>
    </div>
    <i class="fg-flash"></i>
    <button class="fg-skip" data-skip aria-label="Überspringen">${icon('skip')}</button>`;
  document.body.appendChild(o);
  requestAnimationFrame(() => o.classList.add('open'));

  const $ = (s) => o.querySelector(s);
  const stage = $('.fg-stage'), fa = $('.fg-f.a'), fb = $('.fg-f.b');
  const beams = $('.fg-beams'), ba = $('.ba'), bb = $('.bb'), clash = $('.fg-clash');
  const flash = $('.fg-flash'), hit = $('.fg-hit'), boom = $('.fg-boom');

  let geo;
  const layout = () => {
    const W = stage.clientWidth, H = stage.clientHeight;
    const FW = Math.min(W * 0.42, 210), FH = FW * 1.3;
    const ground = H * 0.68;
    const ax = W * 0.03, bx = W - W * 0.03 - FW;
    geo = { W, H, FW, FH, ground, ax, bx, d: bx - (ax + FW) };
    for (const [el, x] of [[fa, ax], [fb, bx]]) {
      el.style.width = `${FW}px`; el.style.left = `${x}px`; el.style.top = `${ground - FH}px`;
    }
    const hy = ground - FH * 0.62;
    beams.style.top = `${hy}px`;
  };
  layout();
  window.addEventListener('resize', layout);

  const events = [
    [500, () => { o.classList.add('charged'); powerUpSound(); }],
    [1650, () => { noise(0.3, 0.6, 1200); }],
    [2250, () => { noise(0.3, 0.6, 1500); }],
    [2750, () => { beamHum(1.2); }],
    [3900, () => { noise(0.8, 0.8, 600); o.classList.add('ko'); if (winner !== 'a') fa.classList.add('lose'); if (winner !== 'b') fb.classList.add('lose'); }],
    [4300, () => { o.classList.add('done'); }],
    [4400, () => { if (winner) powerUpSound(); }],
  ];
  let t0 = performance.now();
  let raf = 0;
  let fired = 0;

  const frame = (now) => {
    const t = reduce ? DURATION : now - t0;
    const { W, FW, FH, d } = geo;
    while (fired < events.length && t >= events[fired][0]) events[fired++][1]();

    // Auftritt
    const enter = easeOut(seg(t, 0, 500));
    let ax = (1 - enter) * -W * 0.6, bx = (1 - enter) * W * 0.6;
    let ay = 0, by = 0, ar = 0, br = 0;
    // Aufladen: Zittern
    const jit = t > 500 && t < 1300 ? Math.sin(t * 0.09) * 2.2 : 0;
    ax += jit; bx -= jit;
    // Zwei Schlagabtausche
    const dash = (a, b, c, amp) => amp * (easeIn(seg(t, a, b)) - easeOut(seg(t, b, c)));
    const dsh = dash(1300, 1650, 2000, d * 0.47) + dash(2000, 2250, 2500, d * 0.47);
    ax += dsh; bx -= dsh;
    ay -= Math.sin(Math.PI * seg(t, 1300, 2000)) * FH * 0.08;
    by -= Math.sin(Math.PI * seg(t, 2000, 2500)) * FH * 0.08;

    // Energiestrahlen
    const grow = easeOut(seg(t, 2750, 3050));
    let p = 50;
    if (t >= 3050) {
      const drift = 50 + clamp(adv, -1, 1) * 18 * seg(t, 3050, 3500) + Math.sin(t * 0.03) * 3 * (1 - seg(t, 3500, 3600));
      const fin = winner === 'a' ? 100 : winner === 'b' ? 0 : 50;
      p = drift + (fin - drift) * easeIn(seg(t, 3500, 3900));
    }
    const beamOn = t >= 2750 && t < 4000;
    beams.style.opacity = beamOn ? 1 : 0;
    const left = geo.ax + ax + FW * 0.84, right = geo.bx + bx + FW * 0.16;
    beams.style.left = `${left}px`;
    beams.style.width = `${Math.max(0, right - left)}px`;
    ba.style.width = `${p * grow}%`;
    bb.style.width = `${(100 - p) * grow}%`;
    clash.style.left = `${p}%`;
    clash.style.opacity = grow >= 1 ? 1 : 0;

    // K.o.
    const ko = easeOut(seg(t, 3900, 4500));
    const fall = (side) => ({ x: side * (W * 0.08 - FH * 0.42) * ko, y: Math.sin(Math.PI * Math.min(1, ko * 1.4)) * -FH * 0.25 + ko * FH * 0.12, r: side * 80 * ko });
    if (winner === 'b' || !winner) { const f = fall(winner ? -1 : -0.5); ax += f.x; ay += f.y; ar = f.r; }
    if (winner === 'a' || !winner) { const f = fall(winner ? 1 : 0.5); bx += f.x; by += f.y; br = f.r; }
    // Siegerpose: Sprung
    const jump = Math.sin(Math.PI * seg(t, 4400, 4900)) * FH * 0.16;
    if (winner === 'a') ay -= jump;
    if (winner === 'b') by -= jump;

    fa.style.transform = `translate(${ax}px, ${ay}px) rotate(${ar}deg)`;
    fb.style.transform = `translate(${bx}px, ${by}px) rotate(${br}deg)`;

    // Treffer-Blitze, Explosion, Bildschirm-Wackeln
    const pulse = (c, w) => Math.max(0, 1 - Math.abs(t - c) / w);
    const hitA = Math.max(pulse(1650, 140), pulse(2250, 140));
    hit.style.opacity = hitA;
    hit.style.left = `${geo.ax + FW + d / 2}px`;
    hit.style.top = `${geo.ground - FH * 0.55}px`;
    hit.style.transform = `translate(-50%, -50%) scale(${0.4 + hitA})`;
    const bm = seg(t, 3880, 4400);
    const loserX = winner === 'a' ? geo.bx + FW / 2 : winner === 'b' ? geo.ax + FW / 2 : W / 2;
    boom.style.left = `${loserX}px`;
    boom.style.top = `${geo.ground - FH * 0.5}px`;
    boom.style.opacity = t >= 3880 ? 1 - bm : 0;
    boom.style.transform = `translate(-50%, -50%) scale(${0.2 + bm * 2.2})`;
    flash.style.opacity = Math.max(pulse(1650, 90) * 0.55, pulse(2250, 90) * 0.55, pulse(3900, 160) * 0.9);
    const shake = Math.max(pulse(1650, 200), pulse(2250, 200), pulse(3950, 350)) * 7;
    stage.style.transform = shake ? `translate(${Math.sin(t * 0.9) * shake}px, ${Math.cos(t * 1.3) * shake * 0.6}px)` : '';

    if (t < DURATION) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const restart = () => {
    cancelAnimationFrame(raf);
    o.classList.remove('charged', 'ko', 'done');
    fa.classList.remove('lose'); fb.classList.remove('lose');
    fired = 0; t0 = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const close = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', layout);
    o.classList.remove('open');
    setTimeout(() => o.remove(), 250);
  };
  o.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-again]')) return restart();
    if (e.target.closest('[data-skip]')) {
      cancelAnimationFrame(raf);
      fired = events.length;
      o.classList.add('charged', 'ko', 'done');
      t0 = performance.now() - DURATION;
      raf = requestAnimationFrame(frame);
    }
  });
  return { close, winner };
}
