// Admin-Dashboard: Anmeldung prüfen, Navigation, Bereiche laden
import { auth, get } from './api.js';
import { esc, fail } from './ui.js';

const SECTIONS = [
  ['overview', 'Übersicht', './overview.js'],
  ['users', 'Nutzer', './users.js'],
  ['groups', 'Gruppen', './groups.js'],
  ['points', 'EP-Balance', './points.js'],
  ['exercises', 'Übungen', './exercises.js'],
  ['tickets', 'Tickets', './tickets.js'],
  ['features', 'Funktionen', './features.js'],
];
const main = document.getElementById('main');
const nav = document.getElementById('nav');
let token = 0;

function gate(title, text, extra = '') {
  document.body.classList.add('gated');
  main.innerHTML = `<div class="gate"><h1>${esc(title)}</h1><p>${esc(text)}</p>${extra}<p><a class="btn primary" href="/login">Zur Anmeldung</a></p></div>`;
}

async function show() {
  const id = (location.hash.slice(1) || 'overview');
  const sec = SECTIONS.find((s) => s[0] === id) || SECTIONS[0];
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.id === sec[0]));
  const my = ++token;
  main.innerHTML = '<p class="muted">Lade …</p>';
  try {
    const mod = await import(sec[2]);
    const box = document.createElement('div');
    box.className = 'section';
    box.innerHTML = `<h1>${esc(sec[1])}</h1>`;
    const body = document.createElement('div');
    box.append(body);
    await mod.render(body);
    if (my !== token) return;
    main.replaceChildren(box);
  } catch (e) { if (my === token) { main.innerHTML = `<h1>${esc(sec[1])}</h1><p class="notice err">${esc(e.message)}</p>`; fail(e); } }
}

async function init() {
  const a = auth();
  if (!a.token) return gate('Bitte anmelden', 'Für das Admin-Dashboard musst du angemeldet sein.');
  let me;
  try {
    const r = await fetch('/api/me', { headers: { Authorization: `Bearer ${a.token}` }, cache: 'no-store' });
    if (r.status === 401) return gate('Sitzung abgelaufen', 'Bitte melde dich neu an.');
    me = (await r.json()).user;
  } catch { return gate('Server nicht erreichbar', 'Bitte später noch einmal versuchen.'); }
  if (!me || me.role !== 'admin') return gate('Nur für Admins', 'Dieses Dashboard ist nur für Admins. Melde dich mit einem Admin-Konto an.');
  document.getElementById('who').textContent = me.name;
  get('/api/info').then((i) => { document.getElementById('grp').textContent = i.group || ''; }).catch(() => {});
  nav.innerHTML = SECTIONS.map(([id, label]) => `<a href="#${id}" data-id="${id}">${esc(label)}</a>`).join('');
  addEventListener('hashchange', show);
  show();
}
init();
