// Live-Arena: Wer gerade trainiert, steht in der Arena (3D per CSS-Transforms) – alle anderen sitzen auf der Tribüne und jubeln.

import { pageHead, emptyState } from '../components.js';
import { sheet } from '../ui.js';
import { esc } from '../utils.js';
import { state } from '../store.js';
import { feature } from '../config.js';
import { api, activeGroupId, demoOn, cachedGroup, myId } from '../sync.js';
import { currentActivity } from '../presence.js';
import { poseFrame, viewBox, POSES, poseFor } from '../poses.js';

const KIND = { gym: 'Krafttraining', cardio: 'Cardio', mobility: 'Mobility' };
const GYM_FALLBACK = ['squat', 'ohp', 'curl', 'hinge', 'bench'];
const MOB_FALLBACK = ['splits', 'hamstring', 'butterfly', 'fold', 'downdog', 'child'];
const hashStr = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export function poseForMember(m) {
  const p = poseFor(m.exercise);
  const h = hashStr(m.id + (m.exercise || ''));
  if (m.kind === 'cardio') return ['run', 'bike', 'elliptical', 'rower'].includes(p) ? p : 'run';
  if (m.kind === 'mobility') return POSES[p] && !['stand', 'run', 'bike'].includes(p) && ['catcow', 'birddog'].includes(p) ? (p === 'catcow' && h % 2 ? 'splits' : p) : MOB_FALLBACK[h % MOB_FALLBACK.length];
  return p !== 'stand' && !['run', 'bike', 'elliptical', 'rower'].includes(p) ? p : GYM_FALLBACK[h % GYM_FALLBACK.length];
}

export function sinceText(since, now) {
  const min = Math.max(0, Math.floor(((now || Date.now()) - (since || now || Date.now())) / 60000));
  if (min < 1) return 'gerade eben';
  if (min < 60) return `seit ${min} min`;
  return `seit ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}
const kindIcon = { gym: 'Kraft', cardio: 'Cardio', mobility: 'Mobility' };

// ---------- Daten ----------
let npc = null; // Demo: ein NPC trainiert (pro Sitzung gleich)
function demoData() {
  const g = cachedGroup();
  const now = Date.now();
  const list = (g?.members || []).map((m) => ({ id: m.id, name: m.name, look: m.look || null, stage: m.stage || 0, active: false }));
  const me = myId();
  const act = currentActivity();
  if (!list.some((m) => m.id === me)) list.push({ id: me || 'me', name: 'Du', look: null, stage: state.profile?.stage || 0, active: false });
  const others = list.filter((m) => m.id !== me);
  if (!npc || !others.some((m) => m.id === npc.id)) {
    const kinds = ['gym', 'cardio', 'mobility'];
    const ex = { gym: 'Bankdrücken', cardio: 'Laufen', mobility: 'Dehnen' };
    const kind = kinds[Math.floor(Math.random() * 3)];
    npc = others[0] ? { id: others[0].id, kind, exercise: ex[kind], since: now - (5 + Math.floor(Math.random() * 30)) * 60000 } : null;
  }
  for (const m of list) {
    if (npc && m.id === npc.id) Object.assign(m, { active: true, kind: npc.kind, exercise: npc.exercise, since: npc.since });
    if (act && m.id === me) Object.assign(m, { active: true, ...act });
  }
  return { now, members: list };
}
async function load() {
  if (demoOn()) return demoData();
  const g = activeGroupId();
  return api('GET', `/api/live${g ? `?g=${encodeURIComponent(g)}` : ''}`);
}

const headline = (n) => (n ? `${n} trainier${n === 1 ? 't' : 'en'} gerade` : 'Gerade trainiert niemand – sei der Erste!');
const sigOf = (d) => d.members.map((m) => `${m.id}|${m.active ? `${m.kind}|${m.exercise}|${m.since}` : 0}`).join(';');

// ---------- Szene ----------
const W = 460, H = 480;
const FIG = 96;

function activeSpots(n) {
  // Positionen auf der Bodenebene (x,y in px, Mitte der Fläche = 0,0), verteilt auf Ellipsen
  const spots = [];
  if (n === 1) return [[0, 20]];
  const rings = n <= 4 ? [[n, 100, 58, 0.4]] : n <= 9 ? [[Math.ceil(n / 2), 112, 74, 0.2], [n - Math.ceil(n / 2), 52, 28, 0.9]] : [[Math.ceil(n * 0.5), 120, 78, 0.2], [Math.ceil(n * 0.3), 76, 44, 0.7], [n - Math.ceil(n * 0.5) - Math.ceil(n * 0.3), 34, 18, 0.1]];
  for (const [c, rx, ry, off] of rings) for (let i = 0; i < c; i++) {
    const a = ((i + off) / c) * Math.PI * 2 + Math.PI / 2;
    spots.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return spots.slice(0, n).sort((a, b) => a[1] - b[1]);
}

// Kolosseum: Welt-Ebene (x,y) = Boden, z = Höhe. Die Mauer steht als Kreisbogen aus Segmenten hinter/neben dem Sand.
const WALL = { rx: 245, ry: 172, h: 150, a0: -200, a1: 20, n: 22 };
const STEPS = [[170, 8], [190, 16], [210, 24], [230, 32]]; // [rx außen, z]
const SAND_RX = 150;
const RUIN = { 17: [0.55, 0.3], 18: [0.35, 0.62], 19: [0.28, 0.2], 20: [0.18, 0.4], 21: [0.1, 0.12] };

function wallHTML() {
  const { rx, ry, h, a0, a1, n } = WALL;
  const da = (a1 - a0) / n;
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = ((a0 + (i + 0.5) * da) * Math.PI) / 180;
    const x = rx * Math.cos(a), y = ry * Math.sin(a);
    const phi = (Math.atan2(ry * Math.cos(a), -rx * Math.sin(a)) * 180) / Math.PI;
    const w = Math.hypot(rx * Math.sin(a), ry * Math.cos(a)) * ((da * Math.PI) / 180) + 2;
    const nl = Math.hypot(Math.cos(a) / rx, Math.sin(a) / ry);
    const lit = (-(Math.cos(a) / rx) / nl) * -0.55 + (-(Math.sin(a) / ry) / nl) * 0.8; // Licht von vorne links
    const shade = Math.max(0.04, Math.min(0.6, 0.34 - 0.3 * lit));
    const ru = RUIN[i];
    const clip = ru ? `clip-path:polygon(0 100%,0 ${(ru[0] * 100).toFixed(0)}%,35% ${(ru[1] * 100).toFixed(0)}%,60% ${((ru[0] + ru[1]) * 50).toFixed(0)}%,100% ${(ru[1] * 100 + 6).toFixed(0)}%,100% 100%);` : '';
    out += `<div class="lv-seg" style="width:${w.toFixed(1)}px;margin-left:${(-w / 2).toFixed(1)}px;height:${h}px;top:${-h}px;transform:translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotateZ(${phi.toFixed(1)}deg) rotateX(-90deg);--s:${shade.toFixed(2)};${clip}">
      <u class="att"></u><i class="t"><b></b></i><i class="t"><b></b></i><i class="t g"><b></b></i></div>`;
  }
  return out;
}

function ringsHTML() {
  let prev = SAND_RX, out = '';
  STEPS.forEach(([r, z], i) => {
    const x = (prev / r) * 100;
    out += `<i class="lv-step" style="width:${r * 2}px;height:${r * 1.4}px;margin:${-r * 0.7}px 0 0 ${-r}px;transform:translateZ(${z}px);background:radial-gradient(ellipse closest-side,transparent ${x - 0.2}%,#6b4a2c ${x}%,${i % 2 ? '#cdb182' : '#dcc392'} ${x + 1.6}%,${i % 2 ? '#c4a574' : '#d3b884'} 100%)"></i>`;
    prev = r;
  });
  return out;
}

function fanSpots(n) {
  // verteilt auf die Stufen im Halbrund hinter und neben dem Sand
  const out = [], per = STEPS.map(() => []);
  for (let i = 0; i < n; i++) per[i % STEPS.length].push(i);
  per.forEach((ids, k) => {
    const r = STEPS[k][0] - 10, z = STEPS[k][1];
    ids.forEach((id, j) => {
      const t = (j + 0.5) / ids.length;
      const a = ((-190 + t * 200) * Math.PI) / 180;
      out[id] = [r * Math.cos(a), r * 0.7 * Math.sin(a), z];
    });
  });
  return out;
}

function sceneHTML(d, now) {
  const act = d.members.filter((m) => m.active);
  const fans = d.members.filter((m) => !m.active).slice(0, 70);
  const spots = activeSpots(act.length);
  const fs = fanSpots(fans.length);
  const players = act.map((m, i) => {
    const [x, y] = spots[i];
    const vb = viewBox(poseForMember(m));
    return `<div class="lv-pl" style="--x:${x.toFixed(0)}px;--y:${y.toFixed(0)}px" data-lv="${esc(m.id)}">
      <i class="lv-sh"></i>
      <div class="lv-bb"><button class="lv-fig" data-lv="${esc(m.id)}" aria-label="${esc(m.name)}"><svg viewBox="${vb}" aria-hidden="true"><g data-act></g></svg></button>
        <span class="lv-tag"><b>${esc(m.name)}</b><small>${esc(m.exercise || KIND[m.kind] || '')} · ${esc(sinceText(m.since, now).replace('seit ', ''))}</small></span></div></div>`;
  }).join('');
  const crowd = fans.map((m, i) => `<div class="lv-pl fan" style="--x:${fs[i][0].toFixed(0)}px;--y:${fs[i][1].toFixed(0)}px;--z:${fs[i][2] + 5}px">
    <div class="lv-bb"><button class="lv-fan" data-lv="${esc(m.id)}" aria-label="${esc(m.name)}"><svg viewBox="48 -4 104 78" aria-hidden="true"><g data-fan></g></svg><span class="lv-nm">${esc(m.name)}</span></button></div></div>`).join('');
  return `<div class="lv-scene" style="width:${W}px;height:${H}px">
    <div class="lv-sky"></div>
    <div class="lv-view"><div class="lv-cam"><div class="lv-world">
      <div class="lv-sand"><i class="lv-lines"></i><i class="lv-mat"></i></div>
      ${ringsHTML()}${wallHTML()}${crowd}${players}
    </div></div></div>
    <i class="lv-vig"></i>
  </div>`;
}

function simpleHTML(d, now) {
  const act = d.members.filter((m) => m.active), fans = d.members.filter((m) => !m.active);
  return `<section class="card"><div class="card-title">Trainiert gerade</div>${act.length
    ? act.map((m) => `<div class="lg-row"><span class="lg-main"><b>${esc(m.name)}</b><small>${esc(KIND[m.kind] || '')}${m.exercise ? ` · ${esc(m.exercise)}` : ''} · ${esc(sinceText(m.since, now))}</small></span></div>`).join('')
    : '<p class="muted">Gerade trainiert niemand.</p>'}</section>
    <section class="card"><div class="card-title">Tribüne</div><p>${fans.length ? fans.map((m) => esc(m.name)).join(', ') : 'Leer'}</p></section>`;
}

// ---------- Ansicht ----------
export function liveView() {
  if (!feature('arenaLive')) {
    return { html: `${pageHead('Live')}${emptyState('users', 'Live-Arena ausgeschaltet', 'Der Admin hat die Live-Arena abgeschaltet.')}` };
  }
  const simple = !!state.settings.simple;
  return {
    html: `<div class="live-view"><div class="lv-head" data-lv-head>Lade …</div><div data-lv-body></div></div>`,
    mount: (root) => mountLive(root, simple),
  };
}

function mountLive(root, simple) {
  const head = root.querySelector('[data-lv-head]'), body = root.querySelector('[data-lv-body]');
  if (!head || !body) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let data = null, sig = '', skew = 0, stopped = false, timer = 0, raf = 0, visible = true, figs = [], scene = null, io = null, ro = null;
  const here = () => !stopped && body.isConnected && /^#\/arena\/live/.test(location.hash);
  const stop = () => { stopped = true; clearTimeout(timer); cancelAnimationFrame(raf); io?.disconnect(); ro?.disconnect(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('hashchange', onHash); };
  const onHash = () => { if (!here()) stop(); };
  const onVis = () => { if (document.hidden) { clearTimeout(timer); cancelAnimationFrame(raf); raf = 0; } else if (here()) { poll(); kick(); } };
  window.addEventListener('hashchange', onHash);
  document.addEventListener('visibilitychange', onVis);

  const cache = new Map();
  const frame = (pose, stage, look, lk, q) => {
    const k = `${pose}|${stage}|${lk}|${q}`;
    let s = cache.get(k);
    if (s === undefined) { s = poseFrame(pose, q / 24, stage, look); if (cache.size > 900) cache.clear(); cache.set(k, s); }
    return s;
  };

  function draw(f, now) {
    const q = Math.floor(((f.off + now / f.period) % 1) * 24) % 24;
    if (q === f.q) return;
    f.q = q;
    f.g.innerHTML = frame(f.pose, f.stage, f.look, f.lk, q);
  }
  function build() {
    const now = Date.now() + skew;
    const act = data.members.filter((m) => m.active).length;
    head.textContent = headline(act);
    head.classList.toggle('on', act > 0);
    cancelAnimationFrame(raf); raf = 0; io?.disconnect(); ro?.disconnect(); figs = [];
    if (simple) { body.innerHTML = simpleHTML(data, now); return; }
    body.innerHTML = `<div class="lv-fit">${sceneHTML(data, now)}</div>`;
    scene = body.querySelector('.lv-scene');
    const fit = body.querySelector('.lv-fit');
    const resize = () => { const s = Math.min(1.25, fit.clientWidth / W); scene.style.transform = `scale(${s})`; fit.style.height = `${H * s}px`; };
    resize();
    ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null; ro?.observe(fit);
    if (reduce) scene.classList.add('still');
    const byId = new Map(data.members.map((m) => [m.id, m]));
    scene.querySelectorAll('.lv-pl:not(.fan)').forEach((el) => {
      const m = byId.get(el.dataset.lv);
      const pose = poseForMember(m), look = m.look || null;
      figs.push({ g: el.querySelector('[data-act]'), pose, stage: m.stage || 0, look, lk: JSON.stringify(look), period: POSES[pose]?.period || 2500, off: (hashStr(m.id) % 100) / 100, q: -1, step: 66 });
    });
    scene.querySelectorAll('.lv-fan').forEach((el, i) => {
      const m = byId.get(el.dataset.lv), look = m.look || null;
      const f = { g: el.querySelector('[data-fan]'), pose: 'armCircles', stage: m.stage || 0, look, lk: JSON.stringify(look), cheer: true, off: i, step: 170, q: -1, t: -1 };
      el.style.setProperty('--d', `${(i % 7) * -0.13}s`);
      figs.push(f);
    });
    const now0 = performance.now();
    figs.forEach((f) => { if (f.cheer) cheer(f, now0); else draw(f, now0); });
    if (!reduce) {
      io = 'IntersectionObserver' in window ? new IntersectionObserver(([en]) => { visible = en.isIntersecting; scene.classList.toggle('paused', !visible); if (visible) kick(); }) : null;
      io?.observe(scene);
      kick();
    }
  }
  // Jubel: Arme pendeln um „oben“ (Phase 0.5 der Arm-Kreis-Pose), jede Figur mit eigenem Takt
  function cheer(f, now) {
    const q = Math.floor(now / f.step + f.off * 2) % 4;
    if (q === f.q) return;
    f.q = q;
    const ph = 0.5 + [0, 0.1, 0, -0.1][q];
    const k = `c|${f.stage}|${f.lk}|${q}`;
    let s = cache.get(k);
    if (s === undefined) { s = poseFrame('armCircles', ph, f.stage, f.look, { noShadow: true }); cache.set(k, s); }
    f.g.innerHTML = s;
  }
  let last = 0;
  function loop(now) {
    raf = 0;
    if (!here()) { stop(); return; }
    if (!visible || document.hidden) return;
    if (now - last > 62) {
      last = now;
      for (const f of figs) f.cheer ? cheer(f, now) : draw(f, now);
    }
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && !reduce && figs.length && visible && !document.hidden) raf = requestAnimationFrame(loop); }

  async function poll() {
    if (!here() || document.hidden) return;
    try {
      const d = await load();
      if (!here()) return;
      skew = d.now ? d.now - Date.now() : 0;
      const s = sigOf(d);
      data = d;
      if (s !== sig) { sig = s; build(); }
      else if (!simple) updateTags();
    } catch (e) {
      if (!data) { head.textContent = 'Live-Daten nicht erreichbar'; body.innerHTML = `<p class="muted">${esc(e.message || 'Fehler')}</p>`; }
    }
    clearTimeout(timer);
    if (here()) timer = setTimeout(poll, 10000);
  }
  function updateTags() {
    const now = Date.now() + skew;
    const byId = new Map(data.members.map((m) => [m.id, m]));
    scene?.querySelectorAll('.lv-pl:not(.fan)').forEach((el) => {
      const m = byId.get(el.dataset.lv);
      const sm = el.querySelector('.lv-tag small');
      if (m && sm) sm.textContent = `${m.exercise || KIND[m.kind] || ''} · ${sinceText(m.since, now).replace('seit ', '')}`;
    });
  }

  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lv]');
    if (!t || !data) return;
    const m = data.members.find((x) => x.id === t.dataset.lv);
    if (!m) return;
    const now = Date.now() + skew;
    sheet({
      title: m.name,
      message: m.active ? `${KIND[m.kind] || 'Training'}${m.exercise ? ` · ${m.exercise}` : ''} · ${sinceText(m.since, now)}` : 'Sitzt auf der Tribüne und jubelt.',
      options: [{ label: 'Schließen' }],
    });
  });
  poll();
}
