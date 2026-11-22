// Gruppe im Profil: Anmelden per Schlüssel, Sichtbarkeit, Sync, Admin-Verwaltung

import { state, saveSettings } from './store.js';
import { overlay, icon, sheet, formDialog, confirmDialog, toast } from './ui.js';
import { esc, fmtRelDay, fmtDate } from './utils.js';
import {
  api, logout, syncNow, account, isAdmin, srv, loggedIn, markAllDirty, fetchGroup,
  loginPassword, parseServerInput, sameOriginServer, serverUrl,
} from './sync.js';
import { VISIBILITY } from './compete.js';

export const deviceGuess = () => {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad|Macintosh.*Mobile/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android-Handy' : 'Android-Tablet';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows-PC';
  return 'Gerät';
};

// Anmelden mit Benutzername + Passwort (vom Admin festgelegt). Jedes Gerät meldet sich einmal an und bleibt angemeldet.
export async function loginFlow({ server = '', user = '' } = {}) {
  const same = await sameOriginServer();
  const r = await formDialog({
    title: 'Bei deiner Gruppe anmelden', okLabel: 'Anmelden',
    fields: [
      ...(same ? [] : [{ name: 'server', label: 'Server-Adresse (oder Einladungslink einfügen)', value: server || serverUrl(), placeholder: 'https://gym.example.de' }]),
      { name: 'username', label: 'Benutzername', value: user, autofocus: !!(server || serverUrl() || same) || undefined },
      { name: 'password', label: 'Passwort', type: 'password' },
      { name: 'device', label: 'Name dieses Geräts', value: deviceGuess() },
    ],
  });
  if (!r) return false;
  const p = same ? { server: '', user: '' } : parseServerInput(r.server);
  if (!same && !p.server) { toast('Bitte die Server-Adresse angeben'); return false; }
  const username = (r.username || p.user || '').trim();
  if (!username || !r.password) { toast('Benutzername und Passwort angeben'); return false; }
  try {
    const res = await loginPassword(p.server, username, r.password, r.device);
    toast(`Willkommen, ${res.user.name}!`);
    return true;
  } catch (e) { toast(e.message, 4500); return false; }
}

// Zeilen für die Profilseite
export function groupSection(row) {
  const a = account();
  if (!loggedIn()) {
    return `<div class="list-label">Gruppe${srv.info?.group ? ` · ${esc(srv.info.group)}` : ''}</div>
      <div class="set-group">${row('login', 'key', 'Bei Gruppe anmelden')}</div>
      <p class="footnote">Mit Benutzername und Passwort von deinem Gruppen-Admin. Ohne Gruppe bleibt alles nur auf diesem Gerät.</p>`;
  }
  const vis = VISIBILITY.find(([k]) => k === (state.settings.visibility || 'full'));
  const syncText = srv.syncing ? 'läuft…' : srv.error ? 'Fehler' : a.lastSync ? fmtRelDay(a.lastSync) === 'Heute' ? fmtDate(a.lastSync, { hour: '2-digit', minute: '2-digit' }) : fmtRelDay(a.lastSync) : 'noch nie';
  return `<div class="list-label">Gruppe · ${esc(a.group || '')}</div>
    <div class="set-group">
      ${row('rename', 'user', 'Angemeldet als', esc(a.user?.name || ''))}
      ${row('visibility', 'eye', 'Sichtbarkeit', esc(vis?.[1] || ''))}
      ${row('sync', 'sync', 'Jetzt synchronisieren', `${esc(syncText)}${a.pending ? ` · ${a.pending} offen` : ''}`)}
      ${isAdmin() ? row('admin', 'users', 'Gruppe verwalten') : ''}
      ${row('logout', 'logout', 'Abmelden', '', true)}
    </div>
    <p class="footnote">Deine Workouts werden mit dem Server deiner Gruppe${serverUrl() ? ` (${esc(serverUrl().replace(/^https?:\/\//, ''))})` : ''} abgeglichen und bleiben zusätzlich auf diesem Gerät.</p>`;
}

export const groupHandlers = {
  login: () => loginFlow(),
  rename: async () => {
    const r = await formDialog({ title: 'Anzeigename', fields: [{ name: 'n', label: 'So sehen dich die anderen', value: account().user?.name || '' }] });
    if (!r?.n.trim()) return;
    try { await api('PATCH', '/api/me', { name: r.n.trim() }); await syncNow(); toast('Gespeichert'); } catch (e) { toast(e.message); }
  },
  visibility: async () => {
    const cur = state.settings.visibility || 'full';
    const v = await sheet({
      title: 'Wer sieht was?',
      message: VISIBILITY.map(([, l, d]) => `${l}: ${d}`).join('\n\n'),
      options: VISIBILITY.map(([k, l], i) => ({ label: `Stufe ${i + 1} – ${l}`, value: k, active: k === cur })),
    });
    if (v) { await saveSettings({ visibility: v }); syncNow().catch(() => {}); }
  },
  sync: async () => {
    try { markAllDirty(); await syncNow(); await fetchGroup(); toast('Synchronisiert'); } catch (e) { toast(e.message); }
  },
  admin: () => openAdmin(),
  logout: async () => {
    if (!(await confirmDialog('Dieses Gerät abmelden? Deine Daten bleiben auf dem Gerät. Zum erneuten Anmelden brauchst du Benutzername und Passwort.', 'Abmelden', true))) return;
    await logout();
    toast('Abgemeldet');
  },
};

// ---------- Zugangsdaten anzeigen & teilen ----------
function showAccess(res) {
  // Kommt die App nicht vom Server (z. B. GitHub Pages), baut die App den Link selbst: App-Adresse + Server + Benutzer
  const r = { ...res };
  if (serverUrl()) {
    r.server = serverUrl();
    r.link = `${location.href.split('#')[0]}#/login?${new URLSearchParams({ server: r.server, user: r.username })}`;
  }
  const o = overlay('', 'key-view');
  const group = account().group || 'Gym';
  const text = `Dein Zugang zum Gym (${group})\n\nApp: ${r.link}\nBenutzername: ${r.username}\nPasswort: ${r.password}${r.link.includes('server=') ? `\nServer: ${r.server}` : ''}\n\niPhone: Link in Safari öffnen → Teilen → „Zum Home-Bildschirm“. Dann die App öffnen und unter Profil → Gruppe anmelden${r.link.includes('server=') ? ' (Server-Adresse von oben einfügen)' : ''}. Du musst dich pro Gerät nur einmal anmelden.`;
  o.innerHTML = `
    <div class="panel-head"><button class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button><div class="panel-title">Zugang für ${esc(r.user.name)}</div><span style="width:40px"></span></div>
    <div class="panel-body">
      <div class="key-box acc">
        <small>Benutzername</small><b>${esc(r.username)}</b>
        <small>Passwort</small><b>${esc(r.password)}</b>
        ${r.link.includes('server=') ? `<small>Server</small><b class="sm">${esc(r.server)}</b>` : ''}
      </div>
      <div class="key-link">${esc(r.link)}</div>
      <button class="btn primary block lg" data-share>${icon('share')} Zugangsdaten verschicken</button>
      <button class="btn ghost block" data-copy>${icon('copy')} Kopieren</button>
      <p class="footnote">Das Passwort wird nur jetzt angezeigt (gespeichert wird nur ein Hash). Vergessen? Unter „Gruppe verwalten“ einfach ein neues setzen. Jedes Gerät meldet sich einmal an und bleibt angemeldet.</p>
    </div>`;
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    if (e.target.closest('[data-share]')) {
      if (navigator.share) { try { await navigator.share({ title: 'Gym-Zugang', text }); } catch { /* abgebrochen */ } } else { await copy(text); }
    }
    if (e.target.closest('[data-copy]')) copy(text);
  });
}
async function copy(t) {
  try { await navigator.clipboard.writeText(t); toast('Kopiert'); } catch { toast('Kopieren nicht möglich'); }
}

// ---------- Admin ----------
export function openAdmin() {
  const o = overlay('', 'admin-view');
  let users = null;
  const load = async () => {
    try { users = (await api('GET', '/api/admin/users')).users; draw(); } catch (e) { toast(e.message); }
  };
  const draw = () => {
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button><div class="panel-title">Gruppe verwalten</div><span style="width:40px"></span></div>
      <div class="panel-body">
        <button class="btn primary block lg" data-new>${icon('plus')} Nutzer anlegen</button>
        <p class="footnote">Nur wen du hier anlegst, kann mitmachen. Du legst Benutzername und Passwort fest – registrieren kann sich niemand selbst.</p>
        ${users ? `<div class="set-group">${users.map((u) => `<button class="set-item adm-u ${u.disabled ? 'off' : ''}" data-u="${esc(u.id)}">
          <span class="si-ic">${icon(u.role === 'admin' ? 'key' : 'user')}</span>
          <span class="si-l"><b>${esc(u.name)}</b><small>${u.username ? `@${esc(u.username)} · ` : ''}${u.role === 'admin' ? 'Admin · ' : ''}${u.devices.length} Gerät${u.devices.length === 1 ? '' : 'e'} · ${u.workouts} Workouts${u.hasPassword ? '' : ' · kein Passwort'}${u.disabled ? ' · gesperrt' : ''}</small></span>${icon('right', 'muted')}</button>`).join('')}</div>` : '<div class="chart-empty">Lade…</div>'}
      </div>`;
  };
  draw();
  load();
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    try {
      if (e.target.closest('[data-new]')) {
        const r = await formDialog({ title: 'Nutzer anlegen', okLabel: 'Anlegen', fields: [
          { name: 'name', label: 'Name (so sehen ihn die anderen)' },
          { name: 'username', label: 'Benutzername', placeholder: 'leer = aus dem Namen' },
          { name: 'password', label: 'Passwort (mind. 6 Zeichen)', placeholder: 'leer = zufällig, z. B. kraft-tiger-4827' },
          { name: 'role', label: 'Rolle', type: 'select', value: 'member', options: [{ value: 'member', label: 'Mitglied' }, { value: 'admin', label: 'Admin (darf Nutzer verwalten)' }] },
        ] });
        if (!r?.name.trim()) return;
        const res = await api('POST', '/api/admin/users', { name: r.name.trim(), username: r.username.trim(), password: r.password, role: r.role });
        showAccess(res);
        return load();
      }
      const b = e.target.closest('[data-u]');
      if (!b) return;
      const u = users.find((x) => x.id === b.dataset.u);
      const v = await sheet({
        title: u.name,
        message: u.devices.length ? u.devices.map((d) => `${d.name} · zuletzt ${fmtRelDay(d.last_seen)}`).join('\n') : 'Noch kein Gerät angemeldet',
        options: [
          { label: u.hasPassword ? 'Passwort neu setzen' : 'Passwort festlegen', value: 'pw', icon: 'key' },
          { label: `Benutzername ändern${u.username ? ` (@${u.username})` : ''}`, value: 'uname', icon: 'user' },
          ...(u.devices.length ? [{ label: 'Gerät abmelden', value: 'dev', icon: 'logout' }] : []),
          { label: 'Umbenennen', value: 'name', icon: 'edit' },
          { label: u.role === 'admin' ? 'Admin-Rechte entziehen' : 'Zum Admin machen', value: 'role', icon: 'users' },
          { label: u.disabled ? 'Entsperren' : 'Sperren', value: 'lock', icon: 'x' },
          { label: 'Löschen (inkl. aller Workouts)', value: 'del', icon: 'trash', danger: true },
        ],
      });
      if (v === 'pw') {
        const r = await formDialog({ title: `Passwort für ${u.name}`, okLabel: 'Speichern', fields: [
          { name: 'password', label: 'Neues Passwort (mind. 6 Zeichen)', placeholder: 'leer = zufällig' },
          { name: 'out', label: 'Angemeldete Geräte', type: 'select', value: '0', options: [{ value: '0', label: 'Angemeldet lassen' }, { value: '1', label: 'Alle abmelden' }] },
        ] });
        if (!r) return;
        showAccess(await api('POST', `/api/admin/users/${u.id}/password`, { password: r.password, logoutDevices: r.out === '1' }));
      }
      if (v === 'uname') {
        const r = await formDialog({ title: 'Benutzername', fields: [{ name: 'n', label: 'a–z, 0–9, Punkt, Strich', value: u.username || '' }] });
        if (r?.n.trim()) await api('PATCH', `/api/admin/users/${u.id}`, { username: r.n.trim() });
      }
      if (v === 'dev') {
        const d = await sheet({ title: 'Welches Gerät abmelden?', options: u.devices.map((x) => ({ label: `${x.name} (${fmtRelDay(x.last_seen)})`, value: x.id, icon: 'logout' })) });
        if (d) await api('DELETE', `/api/admin/devices/${d}`);
      }
      if (v === 'name') {
        const r = await formDialog({ title: 'Umbenennen', fields: [{ name: 'n', label: 'Name', value: u.name }] });
        if (r?.n.trim()) await api('PATCH', `/api/admin/users/${u.id}`, { name: r.n.trim() });
      }
      if (v === 'role') await api('PATCH', `/api/admin/users/${u.id}`, { role: u.role === 'admin' ? 'member' : 'admin' });
      if (v === 'lock' && (u.disabled || await confirmDialog(`${u.name} sperren? Alle Geräte werden abgemeldet.`, 'Sperren', true))) await api('PATCH', `/api/admin/users/${u.id}`, { disabled: !u.disabled });
      if (v === 'del' && await confirmDialog(`${u.name} und alle Workouts endgültig löschen?`, 'Löschen', true)) await api('DELETE', `/api/admin/users/${u.id}`);
      if (v) load();
    } catch (err) { toast(err.message); }
  });
}
