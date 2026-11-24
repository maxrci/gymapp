// Einstiegspunkt: Router, Tab-Leiste, Mini-Leiste fürs laufende Workout

import { state, loadAll, onChange } from './store.js';
import { $, esc, fmtClock, debounce } from './utils.js';
import { icon } from './ui.js';
import { initEditor, openActive, editorOpen, onEditorClose } from './workout.js';
import { homeView } from './views/home.js';
import { trainingView } from './views/training.js';
import { workoutDetailView } from './views/workoutDetail.js';
import { statsView } from './views/stats.js';
import { exerciseDetailView } from './views/exercises.js';
import { profileView } from './views/profile.js';
import { badgesView } from './views/badges.js';
import { planView } from './views/plan.js';
import { applyTheme } from './theme.js';
import { resumeGuided } from './guided.js';
import { nav } from './nav.js';
import { showIntro } from './intro.js';
import { setLook } from './look.js';
import { leagueView, memberView } from './views/league.js';
import { joinView, loginView } from './views/join.js';
import { showOnboarding, shouldOnboard } from './onboarding.js';
import { initUpdates } from './update.js';
import { initStrava } from './strava.js';
import { detectServer, initSync, loggedIn, onSync, demoOn, ensureSession } from './sync.js';
import { maybeShowMigration, justMoved, welcomeMoved } from './migrate.js';
import { refreshConfig } from './config.js';

const TABS = [
  ['home', 'Start', 'home'],
  ['training', 'Training', 'dumbbell'],
  ['stats', 'Statistik', 'chart'],
  ['arena', 'Arena', 'trophy'],
  ['profile', 'Profil', 'user'],
];

let current = null;
let currentKey = '';

function parseRoute() {
  const [h, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const q = new URLSearchParams(query);
  const [a, ...rest] = h.split('/');
  const b = rest.join('/');
  switch (a) {
    case 'training': return { tab: 'training', view: trainingView };
    case 'stats': return { tab: 'stats', view: statsView, params: { tab: b || 'overview' } };
    case 'exercises': return { tab: 'arena', view: leagueView, params: { tab: 'exercises' } };
    case 'ex': return { tab: 'arena', view: exerciseDetailView, params: { name: decodeURIComponent(b) } };
    case 'w': return { tab: 'home', view: workoutDetailView, params: { id: decodeURIComponent(b) } };
    case 'profile': return { tab: 'profile', view: profileView };
    case 'badges': return { tab: 'profile', view: badgesView };
    case 'plan': return { tab: 'home', view: planView };
    case 'arena':
    case 'league': return { tab: 'arena', view: leagueView, params: { tab: b || (loggedIn() || demoOn() ? 'season' : 'exercises') } };
    case 'member': return { tab: 'arena', view: memberView, params: { id: decodeURIComponent(b) } };
    case 'join': return { tab: 'profile', view: joinView, params: { code: decodeURIComponent(b) } };
    case 'login': return { tab: 'profile', view: loginView, params: { server: q.get('server') || '', user: q.get('user') || '' } };
    default: return { tab: 'home', view: homeView };
  }
}

function render({ keepScroll = true } = {}) {
  const r = parseRoute();
  const main = $('#view');
  const y = window.scrollY;
  nav.entering = !keepScroll;
  try { current = r.view(r.params || {}); } catch (e) { console.error(e); current = errorView(e, r.tab); }
  main.innerHTML = current.html;
  nav.entering = false;
  try { current.mount?.(main); } catch (e) { console.error(e); showViewError(main, e); }
  try { current.onShow?.(rerender); } catch (e) { console.error(e); showViewError(main, e); }
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === r.tab));
  renderMinibar();
}
const rerender = () => render({ keepScroll: true });

// Fehler in einer Seite: nicht still hängen bleiben, sondern anzeigen und melden lassen
const errText = (e) => `${e?.message || e}\n${String(e?.stack || '').split('\n').slice(0, 6).join('\n')}`;
function errorCard(e) {
  return `<section class="card err-card"><b>${icon('info', 'xs')} Diese Seite konnte nicht geladen werden</b>
    <pre>${esc(String(e?.message || e))}</pre>
    <div class="row-btns"><button class="btn primary sm" data-err-retry>Erneut versuchen</button><button class="btn ghost sm" data-err-report>Fehler melden</button></div></section>`;
}
let lastErr = null;
function errorView(e, tab) {
  lastErr = e;
  return { html: `<header class="page-head"><div class="ph-text"><h1>${esc(TABS.find(([k]) => k === tab)?.[1] || 'Gym')}</h1></div></header>${errorCard(e)}` };
}
function showViewError(main, e) {
  lastErr = e;
  main.insertAdjacentHTML('afterbegin', errorCard(e));
}
document.addEventListener('click', async (ev) => {
  if (ev.target.closest('[data-err-retry]')) { rerender(); return; }
  if (ev.target.closest('[data-err-report]')) {
    const { newTicket } = await import('./tickets.js');
    newTicket('bug', { title: `Fehler auf ${location.hash || '#/'}`, body: `Seite: ${location.hash}\n${errText(lastErr)}` });
  }
});

function renderTabbar() {
  $('#tabbar').innerHTML = TABS.map(([k, l, ic]) => `<a href="#/${k}" data-tab="${k}">${icon(ic)}<span>${l}</span></a>`).join('');
  $('#tabbar').classList.toggle('six', TABS.length > 5);
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
  setLook(state.settings.avatar);
  // auch Einstellungen, die vom Server kommen (anderes Gerät, Umzug), sofort anwenden
  let themeNow = state.settings.theme || 'dark';
  onChange(() => {
    setLook(state.settings.avatar);
    const t = state.settings.theme || 'dark';
    if (t !== themeNow) { themeNow = t; applyTheme(t); }
  });
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

  // Gruppen-Server (nur wenn die App von einem Gym-Server kommt)
  let wasIn = loggedIn();
  onSync(debounce(() => {
    if (loggedIn() !== wasIn) { wasIn = loggedIn(); renderTabbar(); initSync(); initStrava(); }
    rerender();
  }, 60));
  detectServer().then((ok) => { if (ok) { ensureSession(); refreshConfig(); initSync(); renderTabbar(); rerender(); welcomeMoved(); } initStrava(); maybeShowMigration(); });

  render({ keepScroll: false });
  document.body.classList.add('ready');
  // Beim ersten Öffnen: Onboarding statt Start-Animation (nicht bei Anmelde-Links)
  const viaLink = /^#\/(join|login)/.test(location.hash) || justMoved();
  if (shouldOnboard() && !viaLink) showOnboarding();
  else if (!viaLink) showIntro();
  resumeGuided();

  initUpdates();
  navigator.storage?.persist?.().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  $('#view').innerHTML = `<div class="empty"><h3>Fehler beim Start</h3><p>${esc(e.message)}</p></div>`;
});
