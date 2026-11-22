// Gruppe im Profil: Anmelden per Schlüssel, Sichtbarkeit, Sync, Admin-Verwaltung

import { state, saveSettings } from './store.js';
import { overlay, icon, sheet, formDialog, confirmDialog, toast } from './ui.js';
import { esc, fmtRelDay, fmtDate } from './utils.js';
import { api, redeemCode, logout, syncNow, account, isAdmin, srv, loggedIn, markAllDirty, fetchGroup } from './sync.js';
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

export async function loginFlow(code = '') {
  const r = await formDialog({ title: 'Mit Schlüssel anmelden', okLabel: 'Anmelden', fields: [
    { name: 'code', label: 'Persönlicher Schlüssel (z. B. K7QF-2MXA-9TPD-H4WN)', value: code, placeholder: 'XXXX-XXXX-XXXX-XXXX' },
    { name: 'device', label: 'Name dieses Geräts', value: deviceGuess(), autofocus: false },
  ] });
  if (!r) return false;
  try {
    const res = await redeemCode(r.code, r.device);
    toast(`Willkommen, ${res.user.name}!`);
    return true;
  } catch (e) { toast(e.message, 4000); return false; }
}

// Zeilen für die Profilseite
export function groupSection(row) {
  if (!srv.available && !loggedIn()) return '';
  const a = account();
  if (!loggedIn()) {
    return `<div class="list-label">Gruppe${srv.info?.group ? ` · ${esc(srv.info.group)}` : ''}</div>
      <div class="set-group">${row('login', 'key', 'Mit Schlüssel anmelden')}</div>
      <p class="footnote">Den persönlichen Schlüssel bekommst du vom Admin deiner Gruppe. Ein Passwort brauchst du nicht.</p>`;
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
    <p class="footnote">Deine Workouts werden mit dem Server deiner Gruppe abgeglichen und bleiben zusätzlich auf diesem Gerät.</p>`;
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
    if (!(await confirmDialog('Dieses Gerät abmelden? Deine Daten bleiben auf dem Gerät. Für eine neue Anmeldung brauchst du einen neuen Schlüssel vom Admin.', 'Abmelden', true))) return;
    await logout();
    toast('Abgemeldet');
  },
};

// ---------- Schlüssel anzeigen ----------
function showKey(r) {
  const o = overlay('', 'key-view');
  const text = `Hier ist dein persönlicher Zugang zu GymLog (${r.user.name}). Öffne den Link auf deinem Handy, installiere die App über „Zum Home-Bildschirm“ und melde dich an. Der Schlüssel funktioniert einmal und ${r.days} Tage lang.`;
  o.innerHTML = `
    <div class="panel-head"><button class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button><div class="panel-title">Schlüssel für ${esc(r.user.name)}</div><span style="width:40px"></span></div>
    <div class="panel-body">
      <div class="key-box"><small>Persönlicher Schlüssel</small><b>${esc(r.code)}</b><small>Einmal gültig · ${r.days} Tage · 1 Gerät</small></div>
      <div class="key-link">${esc(r.link)}</div>
      <button class="btn primary block lg" data-share>${icon('share')} Link verschicken</button>
      <button class="btn ghost block" data-copy>${icon('copy')} Link kopieren</button>
      <p class="footnote">Tipp fürs iPhone: Erst die App über Safari → Teilen → „Zum Home-Bildschirm“ installieren, dann in der App unter Profil → Gruppe den Schlüssel eingeben. Für jedes weitere Gerät brauchst du einen neuen Schlüssel.</p>
    </div>`;
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    if (e.target.closest('[data-share]')) {
      if (navigator.share) { try { await navigator.share({ title: 'GymLog-Zugang', text, url: r.link }); } catch { /* abgebrochen */ } } else { await copy(`${text}\n${r.link}`); }
    }
    if (e.target.closest('[data-copy]')) copy(r.link);
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
        <p class="footnote">Nur wen du hier anlegst, kann mitmachen. Jeder bekommt einen persönlichen Einmal-Schlüssel – Passwörter gibt es keine.</p>
        ${users ? `<div class="set-group">${users.map((u) => `<button class="set-item adm-u ${u.disabled ? 'off' : ''}" data-u="${esc(u.id)}">
          <span class="si-ic">${icon(u.role === 'admin' ? 'key' : 'user')}</span>
          <span class="si-l"><b>${esc(u.name)}</b><small>${u.role === 'admin' ? 'Admin · ' : ''}${u.devices.length} Gerät${u.devices.length === 1 ? '' : 'e'} · ${u.workouts} Workouts${u.pendingInvite ? ' · Schlüssel offen' : ''}${u.disabled ? ' · gesperrt' : ''}</small></span>${icon('right', 'muted')}</button>`).join('')}</div>` : '<div class="chart-empty">Lade…</div>'}
      </div>`;
  };
  draw();
  load();
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    try {
      if (e.target.closest('[data-new]')) {
        const r = await formDialog({ title: 'Nutzer anlegen', okLabel: 'Anlegen', fields: [
          { name: 'name', label: 'Name' },
          { name: 'role', label: 'Rolle', type: 'select', value: 'member', options: [{ value: 'member', label: 'Mitglied' }, { value: 'admin', label: 'Admin (darf Nutzer verwalten)' }] },
        ] });
        if (!r?.name.trim()) return;
        const res = await api('POST', '/api/admin/users', { name: r.name.trim(), role: r.role });
        showKey(res);
        return load();
      }
      const b = e.target.closest('[data-u]');
      if (!b) return;
      const u = users.find((x) => x.id === b.dataset.u);
      const v = await sheet({
        title: u.name,
        message: u.devices.length ? u.devices.map((d) => `${d.name} · zuletzt ${fmtRelDay(d.last_seen)}`).join('\n') : 'Noch kein Gerät angemeldet',
        options: [
          { label: 'Neuen Geräte-Schlüssel erstellen', value: 'key', icon: 'key' },
          ...(u.devices.length ? [{ label: 'Gerät abmelden', value: 'dev', icon: 'logout' }] : []),
          { label: 'Umbenennen', value: 'name', icon: 'edit' },
          { label: u.role === 'admin' ? 'Admin-Rechte entziehen' : 'Zum Admin machen', value: 'role', icon: 'users' },
          { label: u.disabled ? 'Entsperren' : 'Sperren', value: 'lock', icon: 'x' },
          { label: 'Löschen (inkl. aller Workouts)', value: 'del', icon: 'trash', danger: true },
        ],
      });
      if (v === 'key') showKey(await api('POST', `/api/admin/users/${u.id}/invite`));
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
