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
import { historyView } from './views/history.js';
import { foodView } from './views/food.js';
import { loadFood } from './food.js';
import { initPresence } from './presence.js';
import { refreshSteps } from './steps.js';
import { initNowPlaying } from './nowplaying.js';
import { applyEvent } from './events.js';
import { applyTheme, applyLook } from './theme.js';
import { resumeGuided } from './guided.js';
import { nav, goBack } from './nav.js';
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
    case 'settings': return { tab: 'profile', view: profileView, params: { section: b } };
    case 'badges': return { tab: 'profile', view: badgesView };
    case 'plan': return { tab: 'home', view: planView };
    case 'history': return { tab: 'home', view: historyView };
    case 'food': return { tab: 'home', view: foodView };
    case 'arena':
    case 'league': return { tab: 'arena', view: leagueView, params: { tab: b || (loggedIn() || demoOn() ? 'season' : 'exercises') } };
    case 'member': return { tab: 'arena', view: memberView, params: { id: decodeURIComponent(b) } };
    case 'join': return { tab: 'profile', view: joinView, params: { code: decodeURIComponent(b) } };
    case 'login': return { tab: 'profile', view: loginView, params: { server: q.get('server') || '', user: q.get('user') || '' } };
    default: return { tab: 'home', view: homeView };
  }
}

function render({ keepScroll = true, restoreY = null } = {}) {
  const r = parseRoute();
  const main = $('#view');
  const y = restoreY ?? window.scrollY;
  nav.entering = !keepScroll;
  try { current = r.view(r.params || {}); } catch (e) { console.error(e); current = errorView(e, r.tab); }
  main.innerHTML = current.html;
  nav.entering = false;
  try { current.mount?.(main); } catch (e) { console.error(e); showViewError(main, e); }
  try { current.onShow?.(rerender); } catch (e) { console.error(e); showViewError(main, e); }
  if (keepScroll || restoreY != null) {
    window.scrollTo(0, y);
    // Inhalte, die kurz danach wachsen (Diagramme, Bilder): Position nochmal setzen
    if (restoreY != null) { requestAnimationFrame(() => window.scrollTo(0, y)); setTimeout(() => { if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); }, 150); }
  } else window.scrollTo(0, 0);
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
    const bk = e.target.closest('[data-back]');
    if (bk) { e.preventDefault(); goBack(bk.dataset.back); return; }
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
  // Tab nochmal antippen: nach oben (wie bei iOS-Apps)
  $('#tabbar').addEventListener('click', (e) => {
    const t = e.target.closest('a[data-tab]');
    if (t && t.classList.contains('on') && ([location.hash, '#/' + (location.hash ? '' : 'home')].includes(t.getAttribute('href')) || (!location.hash && t.dataset.tab === 'home'))) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
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
  const lookKey = () => `${state.settings.accent || 'blau'}|${state.settings.simple ? 1 : 0}`;
  let lookNow = lookKey();
  applyLook(state.settings);
  await applyEvent().catch(() => {}); // Events (Weihnachten, Halloween …) vor dem ersten Zeichnen
  onChange(() => {
    setLook(state.settings.avatar);
    const t = state.settings.theme || 'dark';
    if (t !== themeNow) { themeNow = t; applyTheme(t); }
    if (lookKey() !== lookNow) { lookNow = lookKey(); applyLook(state.settings); applyEvent().then(rerender).catch(() => {}); }
  });
  onChange(debounce(rerender, 30));
  onEditorClose(() => { document.body.classList.remove('editor-open'); renderMinibar(); });
  // Navigation mit Gedächtnis: zurück (oder zurück zu einem Tab) landet an derselben Stelle wie vorher
  const scrollMem = new Map();
  const norm = (h) => (!h || h === '#' || h === '#/' ? '#/home' : h);
  let currentHash = norm(location.hash);
  const tabRoot = (h) => /^#\/?(home|training|stats(\/\w+)?|arena(\/\w+)?|league(\/\w+)?|profile)?$/.test(h.split('?')[0]);
  window.addEventListener('hashchange', () => {
    const to = norm(location.hash);
    if (to === currentHash) { render({ keepScroll: true }); return; } // gleiche Seite (z. B. Daten nachgeladen)
    scrollMem.set(currentHash, window.scrollY);
    if (scrollMem.size > 60) scrollMem.delete(scrollMem.keys().next().value);
    const back = nav.stack.length && nav.stack[nav.stack.length - 1] === to;
    if (back) nav.stack.pop(); else { nav.stack.push(currentHash); if (nav.stack.length > 50) nav.stack.shift(); }
    const key = to.split('/').slice(0, 2).join('/');
    const sameSection = key === currentKey && to.startsWith('#/stats');
    currentKey = key;
    currentHash = to;
    if (sameSection) return render({ keepScroll: true });
    const saved = scrollMem.get(to);
    render({ keepScroll: false, restoreY: (back || tabRoot(to)) && saved != null ? saved : null });
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
  detectServer().then((ok) => { if (ok) { ensureSession(); refreshConfig().then(() => applyEvent()).catch(() => {}); refreshSteps().then(() => rerender()); initSync(); renderTabbar(); rerender(); welcomeMoved(); } initStrava(); maybeShowMigration(); });

  render({ keepScroll: false });
  document.body.classList.add('ready');
  if (state.settings.food) loadFood().then(() => rerender());
  initPresence();
  initNowPlaying();
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
