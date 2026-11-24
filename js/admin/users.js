import { get, post, patch, del } from './api.js';
import { esc, toast, fail, ask, prompt2, showOnce, fmtDate, fmtAgo } from './ui.js';

let users = [], groups = [], q = '', open = new Set(), root;
const lastSeen = (u) => Math.max(0, ...u.devices.map((d) => d.last_seen || 0));

const creds = (r, title) => showOnce(title, 'Diese Zugangsdaten werden nur jetzt angezeigt. Bitte sicher weitergeben.', [['Benutzername', r.username], ['Passwort', r.password], ['Adresse', r.server], ['Anmelde-Link', r.link]]);

async function load() {
  const [u, g] = await Promise.all([get('/api/admin/users'), get('/api/admin/groups')]);
  users = u.users; groups = g.groups;
}

function row(u) {
  const ls = lastSeen(u);
  const isOpen = open.has(u.id);
  const main = `<tr data-id="${esc(u.id)}" class="${u.disabled ? 'dim' : ''}">
    <td><b>${esc(u.name)}</b><br><small class="muted">@${esc(u.username || '–')}</small></td>
    <td><span class="badge ${u.role === 'admin' ? 'acc' : ''}">${u.role === 'admin' ? 'Admin' : 'Mitglied'}</span>${u.disabled ? ' <span class="badge bad">gesperrt</span>' : ''}</td>
    <td class="num">${u.workouts}</td><td>${fmtDate(u.created)}</td><td>${ls ? esc(fmtAgo(ls)) : 'nie'}</td>
    <td class="end"><button class="btn sm" data-act="toggle">${isOpen ? 'Schließen' : 'Verwalten'}</button></td></tr>`;
  if (!isOpen) return main;
  const devs = u.devices.length ? u.devices.map((d) => `<li>${esc(d.name || 'Gerät')} <small class="muted">· zuletzt ${esc(fmtAgo(d.last_seen))} · seit ${fmtDate(d.created)}</small> <button class="btn sm" data-act="dev" data-dev="${esc(d.id)}">abmelden</button></li>`).join('') : '<li class="muted">Keine Geräte angemeldet</li>';
  return main + `<tr class="detail" data-id="${esc(u.id)}"><td colspan="6"><div class="actions">
    <button class="btn sm" data-act="pw">Passwort zurücksetzen</button>
    <button class="btn sm" data-act="rename">Umbenennen</button>
    <button class="btn sm" data-act="username">Benutzername ändern</button>
    <button class="btn sm" data-act="role">${u.role === 'admin' ? 'Zum Mitglied machen' : 'Zum Admin machen'}</button>
    <button class="btn sm" data-act="disable">${u.disabled ? 'Entsperren' : 'Sperren'}</button>
    <button class="btn sm danger" data-act="delete">Löschen</button></div>
    ${u.pendingInvite ? '<p class="muted">Offene Einladung vorhanden.</p>' : ''}
    <h4>Geräte</h4><ul class="devs">${devs}</ul></td></tr>`;
}

function table() {
  const s = q.toLowerCase();
  const list = users.filter((u) => !s || u.name.toLowerCase().includes(s) || (u.username || '').toLowerCase().includes(s));
  root.querySelector('#tbl').innerHTML = list.length
    ? `<table><thead><tr><th>Name</th><th>Rolle</th><th class="num">Workouts</th><th>Angelegt</th><th>Zuletzt gesehen</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>`
    : '<p class="muted">Keine Nutzer gefunden.</p>';
}

async function refresh() { await load(); table(); }

async function act(a, u, btn) {
  if (a === 'toggle') { open.has(u.id) ? open.delete(u.id) : open.add(u.id); return table(); }
  if (a === 'pw') {
    const out = await ask(`Neues Passwort für ${u.name} erzeugen? Das alte Passwort ist danach ungültig.`, 'Zurücksetzen');
    if (!out) return;
    const logout = await ask('Alle angemeldeten Geräte von diesem Nutzer abmelden?', 'Ja, abmelden');
    creds(await post(`/api/admin/users/${u.id}/password`, { logoutDevices: logout }), `Neues Passwort für ${u.name}`);
  } else if (a === 'rename') {
    const v = await prompt2('Neuer Name', u.name); if (!v) return;
    await patch(`/api/admin/users/${u.id}`, { name: v }); toast('Name geändert');
  } else if (a === 'username') {
    const v = await prompt2('Neuer Benutzername', u.username || ''); if (!v) return;
    await patch(`/api/admin/users/${u.id}`, { username: v }); toast('Benutzername geändert');
  } else if (a === 'role') {
    const to = u.role === 'admin' ? 'member' : 'admin';
    if (!(await ask(`${u.name} ${to === 'admin' ? 'zum Admin machen' : 'zum Mitglied herabstufen'}?`, 'Ja'))) return;
    await patch(`/api/admin/users/${u.id}`, { role: to }); toast('Rolle geändert');
  } else if (a === 'disable') {
    if (!u.disabled && !(await ask(`${u.name} sperren? Alle Geräte werden abgemeldet.`, 'Sperren'))) return;
    await patch(`/api/admin/users/${u.id}`, { disabled: !u.disabled }); toast(u.disabled ? 'Entsperrt' : 'Gesperrt');
  } else if (a === 'delete') {
    if (!(await ask(`${u.name} endgültig löschen? Alle Daten dieses Nutzers gehen verloren.`))) return;
    await del(`/api/admin/users/${u.id}`); open.delete(u.id); toast('Gelöscht');
  } else if (a === 'dev') {
    await del(`/api/admin/devices/${btn.dataset.dev}`); toast('Gerät abgemeldet');
  }
  await refresh();
}

function createDialog() {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<form class="modal"><h3>Nutzer anlegen</h3>
    <label class="fld"><span>Name</span><input name="name" required maxlength="40" autocomplete="off"></label>
    <label class="fld"><span>Benutzername (optional)</span><input name="username" autocomplete="off" autocapitalize="none"></label>
    <label class="fld"><span>Passwort (optional, leer = zufällig)</span><input name="password" autocomplete="off"></label>
    <label class="fld"><span>Rolle</span><select name="role"><option value="member">Mitglied</option><option value="admin">Admin</option></select></label>
    <fieldset class="fld"><legend>Gruppen</legend>${groups.length ? groups.map((g) => `<label class="chk"><input type="checkbox" name="g" value="${esc(g.id)}"> ${esc(g.name)}</label>`).join('') : '<span class="muted">Noch keine Gruppen</span>'}</fieldset>
    <div class="row end"><button type="button" class="btn" data-x="1">Abbrechen</button><button class="btn primary">Anlegen</button></div></form>`;
  document.body.append(o);
  o.addEventListener('click', (e) => { if (e.target === o || e.target.dataset.x) o.remove(); });
  o.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { name: f.name.value.trim(), role: f.role.value, groups: [...f.querySelectorAll('[name=g]:checked')].map((c) => c.value) };
    if (f.username.value.trim()) body.username = f.username.value.trim();
    if (f.password.value) body.password = f.password.value;
    try { const r = await post('/api/admin/users', body); o.remove(); creds(r, `Zugang für ${r.user.name}`); await refresh(); } catch (x) { fail(x); }
  });
  o.querySelector('input').focus();
}

export async function render(el) {
  root = el; q = ''; open = new Set();
  await load();
  el.innerHTML = `<div class="bar"><input type="search" id="q" placeholder="Nutzer suchen …" aria-label="Nutzer suchen"><button class="btn primary" id="new">Nutzer anlegen</button></div><div class="card scroll" id="tbl"></div>`;
  table();
  el.querySelector('#q').addEventListener('input', (e) => { q = e.target.value; table(); });
  el.querySelector('#new').addEventListener('click', createDialog);
  el.querySelector('#tbl').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const u = users.find((x) => x.id === b.closest('tr').dataset.id);
    if (u) try { await act(b.dataset.act, u, b); } catch (x) { fail(x); }
  });
}
