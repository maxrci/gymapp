// Einstiegspunkt: Router, Tab-Leiste, Mini-Leiste fürs laufende Workout

import { state, loadAll, onChange } from './store.js';
import { $, esc, fmtClock, debounce } from './utils.js';
import { icon } from './ui.js';
import { initEditor, openActive, editorOpen, onEditorClose } from './workout.js';
import { homeView } from './views/home.js';
import { trainingView } from './views/training.js';
import { workoutDetailView } from './views/workoutDetail.js';
import { statsView } from './views/stats.js';
import { exercisesView, exerciseDetailView } from './views/exercises.js';
import { profileView } from './views/profile.js';
import { badgesView } from './views/badges.js';
import { applyTheme } from './theme.js';
import { resumeGuided } from './guided.js';
import { nav } from './nav.js';
import { showIntro } from './intro.js';

const TABS = [
  ['home', 'Start', 'home'],
  ['training', 'Training', 'dumbbell'],
  ['stats', 'Statistik', 'chart'],
  ['exercises', 'Übungen', 'list'],
  ['profile', 'Profil', 'user'],
];

let current = null;
let currentKey = '';

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, ...rest] = h.split('/');
  const b = rest.join('/');
  switch (a) {
    case 'training': return { tab: 'training', view: trainingView };
    case 'stats': return { tab: 'stats', view: statsView, params: { tab: b || 'overview' } };
    case 'exercises': return { tab: 'exercises', view: exercisesView };
    case 'ex': return { tab: 'exercises', view: exerciseDetailView, params: { name: decodeURIComponent(b) } };
    case 'w': return { tab: 'home', view: workoutDetailView, params: { id: decodeURIComponent(b) } };
    case 'profile': return { tab: 'profile', view: profileView };
    case 'badges': return { tab: 'profile', view: badgesView };
    default: return { tab: 'home', view: homeView };
  }
}

function render({ keepScroll = true } = {}) {
  const r = parseRoute();
  const main = $('#view');
  const y = window.scrollY;
  nav.entering = !keepScroll;
  current = r.view(r.params || {});
  main.innerHTML = current.html;
  nav.entering = false;
  try { current.mount?.(main); } catch (e) { console.error(e); }
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === r.tab));
  renderMinibar();
}
const rerender = () => render({ keepScroll: true });

function renderTabbar() {
  $('#tabbar').innerHTML = TABS.map(([k, l, ic]) => `<a href="#/${k}" data-tab="${k}">${icon(ic)}<span>${l}</span></a>`).join('');
}

function renderMinibar() {
  const mb = $('#minibar');
  const show = !!state.active && !editorOpen();
  mb.hidden = !show;
  document.body.classList.toggle('has-minibar', show);
  if (!show) return;
  mb.innerHTML = `<button class="mini-inner" data-open>
    <span class="pulse"></span>
    <span class="mini-t"><b>${esc(state.active.title)}</b><small>Workout läuft · <span data-mini-clock>${fmtClock((Date.now() - state.active.start) / 1000)}</span></small></span>
    ${icon('up')}</button>`;
}

function setupDelegation() {
  const main = $('#view');
  main.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { e.preventDefault(); location.hash = nav.dataset.nav; return; }
    const a = e.target.closest('[data-act]');
    if (a && current?.handlers?.[a.dataset.act]) {
      e.preventDefault();
      current.handlers[a.dataset.act](a, rerender);
      return;
    }
    if (current?.clicks) {
      for (const k of Object.keys(current.clicks)) {
        const el = e.target.closest(`[data-${k}]`);
        if (el && el.tagName !== 'INPUT') { e.preventDefault(); current.clicks[k](el, rerender); return; }
      }
    }
  });
  $('#minibar').addEventListener('click', () => openActive());
  // Tooltips schließen, wenn außerhalb getippt wird
  document.addEventListener('pointerdown', (e) => {
    document.querySelectorAll('.chart').forEach((c) => {
      if (!c.contains(e.target)) c.querySelectorAll('.chart-tip').forEach((t) => { t.hidden = true; });
    });
  });
}

async function main() {
  renderTabbar();
  initEditor();
  setupDelegation();
  await loadAll();
  applyTheme(state.settings.theme || 'dark');
  onChange(debounce(rerender, 30));
  onEditorClose(() => { document.body.classList.remove('editor-open'); renderMinibar(); });
  window.addEventListener('hashchange', () => {
    const key = location.hash.split('/').slice(0, 2).join('/');
    const sameSection = key === currentKey && location.hash.startsWith('#/stats');
    currentKey = key;
    render({ keepScroll: sameSection });
  });
  let lastW = window.innerWidth;
  window.addEventListener('resize', debounce(() => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; rerender(); } }, 200));
  setInterval(() => {
    const c = document.querySelector('[data-mini-clock]');
    if (c && state.active) c.textContent = fmtClock((Date.now() - state.active.start) / 1000);
  }, 1000);
  const mo = new MutationObserver(() => {
    document.body.classList.toggle('editor-open', !$('#editor').hidden);
    renderMinibar();
  });
  mo.observe($('#editor'), { attributes: true, attributeFilter: ['hidden'] });

  render({ keepScroll: false });
  document.body.classList.add('ready');
  showIntro();
  resumeGuided();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
  navigator.storage?.persist?.().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  $('#view').innerHTML = `<div class="empty"><h3>Fehler beim Start</h3><p>${esc(e.message)}</p></div>`;
});
