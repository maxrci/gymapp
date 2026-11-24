// Mehrere Gruppen (Freundeskreise), Freunde und Privacy pro Gruppe – Teil von „Gruppen & Privacy“

import { overlay, icon, sheet, formDialog, confirmDialog, toast } from './ui.js';
import { esc } from './utils.js';
import { api, myGroups, fetchGroups, activeGroupId, setActiveGroup, fetchGroup } from './sync.js';
import { VISIBILITY } from './compete.js';
import { fighterHead } from './fighter.js';
import { share as shareNative } from './platform.js';

const ROLE = { owner: 'Gegründet', admin: 'Admin', member: 'Mitglied' };
const visLabel = (k) => (VISIBILITY.find(([v]) => v === k) || VISIBILITY[0])[1];

export function circlesSection() {
  const { groups = [], invites = [] } = myGroups();
  const act = activeGroupId();
  return `
    ${invites.length ? `<div class="list-label">Einladungen</div><div class="set-group">${invites.map((g) => `<div class="set-item gi-row">
      <span class="si-ic">${icon('users')}</span><span class="si-l">${esc(g.name)}<small class="si-sub">${g.by ? `von ${esc(g.by)} · ` : ''}${g.members} Mitglieder</small></span>
      <button class="btn primary sm" data-act="g-yes" data-gid="${esc(g.id)}">Beitreten</button><button class="btn ghost sm" data-act="g-no" data-gid="${esc(g.id)}">Nein</button></div>`).join('')}</div>` : ''}
    <div class="list-label">Meine Gruppen</div>
    <div class="set-group">
      ${groups.map((g) => `<button class="set-item" data-act="g-open" data-gid="${esc(g.id)}"><span class="si-ic">${icon(g.id === act ? 'trophy' : 'users')}</span>
        <span class="si-l">${esc(g.name)}<small class="si-sub">${g.members} Mitglieder · ${ROLE[g.role] || ''} · teilst: ${esc(visLabel(g.share?.workouts))}${g.id === act ? ' · in der Arena' : ''}</small></span>${icon('right', 'muted')}</button>`).join('') || '<div class="set-item"><span class="si-l muted">Noch in keiner Gruppe</span></div>'}
      <button class="set-item" data-act="g-new"><span class="si-ic">${icon('plus')}</span><span class="si-l">Neue Gruppe gründen</span>${icon('right', 'muted')}</button>
      <button class="set-item" data-act="g-join"><span class="si-ic">${icon('key')}</span><span class="si-l">Mit Code beitreten</span>${icon('right', 'muted')}</button>
    </div>
    <div class="list-label">Freunde</div>
    <div class="set-group"><button class="set-item" data-act="friends"><span class="si-ic">${icon('user')}</span><span class="si-l">Freunde finden & verwalten</span>${icon('right', 'muted')}</button></div>
    <p class="footnote">Pro Gruppe stellst du ein, was die anderen dort sehen. Freunde findest du unter allen Konten auf eurem Server.</p>`;
}

const reload = async () => { try { await fetchGroups(); } catch (e) { toast(e.message); } };

async function showCode(name, code) {
  const text = `Tritt meiner Gym-Gruppe „${name}“ bei: Profil → Gruppen & Privacy → Mit Code beitreten → ${code}`;
  const v = await sheet({ title: `Einladungscode für „${name}“`, message: `${code}\n\nWer den Code hat, kann beitreten. Ein neuer Code macht den alten ungültig.`, options: [{ label: 'Teilen', value: 'share', icon: 'share' }, { label: 'Kopieren', value: 'copy', icon: 'copy' }] });
  if (v === 'share') { try { if (await shareNative({ title: 'Gym-Gruppe', text })) return; } catch { return; } }
  if (v) { try { await navigator.clipboard.writeText(text); toast('Kopiert'); } catch { toast(code, 6000); } }
}

// Was teile ich in dieser Gruppe?
function openShare(g) {
  const o = overlay('', 'share-view');
  let s = { workouts: 'full', live: true, bodyweight: true, ...(g.share || {}) };
  const draw = () => {
    o.innerHTML = `<div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">${esc(g.name)}</div><span style="width:40px"></span></div>
      <div class="panel-body">
        <div class="list-label">Was sehen die anderen von deinen Workouts?</div>
        <div class="set-group">${VISIBILITY.map(([k, l, d]) => `<button class="set-item" data-vis="${k}"><span class="si-ic">${s.workouts === k ? icon('check') : ''}</span><span class="si-l">${esc(l)}<small class="si-sub">${esc(d)}</small></span></button>`).join('')}</div>
        <div class="list-label">Außerdem</div>
        <div class="set-group">
          <label class="set-item"><span class="si-ic">${icon('weight')}</span><span class="si-l">Körpergewicht teilen<small class="si-sub">Für Kraft relativ zum Körpergewicht (× KG) in Rangliste und Challenges</small></span><input type="checkbox" class="switch" data-sw="bodyweight" ${s.bodyweight ? 'checked' : ''}></label>
          <label class="set-item"><span class="si-ic">${icon('bolt')}</span><span class="si-l">Live zeigen, wenn ich trainiere<small class="si-sub">Für die Live-Arena (kommt bald)</small></span><input type="checkbox" class="switch" data-sw="live" ${s.live ? 'checked' : ''}></label>
        </div>
        <p class="footnote">Deine EP, Streak und Stufe sind für die Arena immer sichtbar. Ernährung und Körperdaten außer dem Gewicht teilst du nie.</p>
        <button class="btn primary block lg" data-save>Speichern</button>
      </div>`;
  };
  draw();
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const v = e.target.closest('[data-vis]');
    if (v) { s.workouts = v.dataset.vis; return draw(); }
    if (e.target.closest('[data-save]')) {
      try { await api('PATCH', `/api/groups/${encodeURIComponent(g.id)}/share`, s); await reload(); fetchGroup().catch(() => {}); toast('Gespeichert'); o.close(); } catch (err) { toast(err.message); }
    }
  });
  o.addEventListener('change', (e) => { const sw = e.target.closest('[data-sw]'); if (sw) s[sw.dataset.sw] = sw.checked; });
}

// Freund in eine Gruppe einladen
async function inviteFriend(g) {
  let f;
  try { f = await api('GET', '/api/friends'); } catch (e) { return toast(e.message); }
  if (!f.friends.length) return toast('Füge zuerst Freunde hinzu – oder teile den Einladungscode.', 4000);
  const v = await sheet({ title: `Zu „${g.name}“ einladen`, options: f.friends.map((x) => ({ label: x.name, value: x.id, icon: 'user' })) });
  if (!v) return;
  try { const r = await api('POST', `/api/groups/${encodeURIComponent(g.id)}/invite`, { user: v }); toast(r.already ? 'Ist schon Mitglied' : 'Einladung verschickt'); } catch (e) { toast(e.message); }
}

async function openGroup(gid) {
  const g = (myGroups().groups || []).find((x) => x.id === gid);
  if (!g) return;
  const adm = g.role === 'owner' || g.role === 'admin';
  const v = await sheet({ title: g.name, message: `${g.members} Mitglieder · ${ROLE[g.role] || ''}`, options: [
    ...(g.id !== activeGroupId() ? [{ label: 'In der Arena anzeigen', value: 'arena', icon: 'trophy' }] : []),
    { label: 'Was teile ich hier?', value: 'share', icon: 'eye' },
    { label: 'Freund einladen', value: 'invite', icon: 'user' },
    ...(adm ? [{ label: 'Einladungscode erzeugen', value: 'code', icon: 'key' }, { label: 'Umbenennen', value: 'rename', icon: 'edit' }] : []),
    { label: 'Gruppe verlassen', value: 'leave', icon: 'logout', danger: true },
  ] });
  if (v === 'arena') { await setActiveGroup(g.id); location.hash = '#/arena'; }
  if (v === 'share') openShare(g);
  if (v === 'invite') inviteFriend(g);
  if (v === 'code') { try { const r = await api('POST', `/api/groups/${encodeURIComponent(g.id)}/code`); showCode(g.name, r.code); } catch (e) { toast(e.message); } }
  if (v === 'rename') {
    const r = await formDialog({ title: 'Gruppe umbenennen', fields: [{ name: 'n', label: 'Name', value: g.name }] });
    if (r?.n?.trim()) { try { await api('PATCH', `/api/groups/${encodeURIComponent(g.id)}`, { name: r.n.trim() }); await reload(); } catch (e) { toast(e.message); } }
  }
  if (v === 'leave') {
    if (!(await confirmDialog(`„${g.name}“ verlassen? Deine Workouts bleiben bei dir, du verschwindest nur aus dieser Arena.${g.role === 'owner' ? ' Die Leitung geht an ein anderes Mitglied.' : ''}`, 'Verlassen', true))) return;
    try { await api('POST', `/api/groups/${encodeURIComponent(g.id)}/leave`); await reload(); if (g.id === activeGroupId()) fetchGroup().catch(() => {}); toast('Gruppe verlassen'); } catch (e) { toast(e.message); }
  }
}

export const circleHandlers = {
  'g-open': (el) => openGroup(el.dataset.gid),
  'g-new': async () => {
    const r = await formDialog({ title: 'Neue Gruppe gründen', fields: [{ name: 'n', label: 'Name, z. B. „Uni-Crew“ oder „Familie“' }], okLabel: 'Gründen' });
    if (!r?.n?.trim()) return;
    try { const g = await api('POST', '/api/groups', { name: r.n.trim() }); await reload(); await setActiveGroup(g.id); showCode(g.name, g.code); } catch (e) { toast(e.message); }
  },
  'g-join': async () => {
    const r = await formDialog({ title: 'Mit Code beitreten', fields: [{ name: 'c', label: 'Einladungscode (z. B. ABCD-EFGH-…)' }], okLabel: 'Beitreten' });
    if (!r?.c?.trim()) return;
    try { const g = await api('POST', '/api/groups/join', { code: r.c.trim() }); await reload(); await setActiveGroup(g.id); toast(g.already ? `Du bist schon in „${g.name}“` : `Willkommen in „${g.name}“!`); } catch (e) { toast(e.message); }
  },
  'g-yes': async (el) => { try { await api('POST', `/api/groups/${encodeURIComponent(el.dataset.gid)}/respond`, { accept: true }); await reload(); toast('Beigetreten'); } catch (e) { toast(e.message); } },
  'g-no': async (el) => { try { await api('POST', `/api/groups/${encodeURIComponent(el.dataset.gid)}/respond`, { accept: false }); await reload(); } catch (e) { toast(e.message); } },
  friends: () => openFriends(),
};

// ---------- Freunde ----------
export function openFriends() {
  const o = overlay('', 'friends-view');
  let f = null, q = '', results = [], t = null;
  const person = (x, btns) => `<div class="fr-row"><span class="fr-fig">${fighterHead(1, x.look || {})}</span><span class="fr-n">${esc(x.name)}${x.username ? `<small>@${esc(x.username)}</small>` : ''}</span>${btns}</div>`;
  const draw = () => {
    o.innerHTML = `<div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Freunde</div><span style="width:40px"></span></div>
      <div class="panel-body">
        <div class="h-search">${icon('search', 'xs')}<input type="search" data-q placeholder="Name oder Benutzername suchen" value="${esc(q)}" autocomplete="off"></div>
        <div data-res>${resultsHtml()}</div>
        ${!f ? '<div class="chart-empty">Lade…</div>' : `
        ${f.incoming.length ? `<div class="list-label">Anfragen an dich</div><div class="set-group fr-list">${f.incoming.map((x) => person(x, `<button class="btn primary sm" data-acc="${esc(x.id)}">Annehmen</button><button class="btn ghost sm" data-del="${esc(x.id)}">Nein</button>`)).join('')}</div>` : ''}
        <div class="list-label">Deine Freunde (${f.friends.length})</div>
        <div class="set-group fr-list">${f.friends.map((x) => person(x, `<button class="btn ghost sm" data-rm="${esc(x.id)}" data-name="${esc(x.name)}">Entfernen</button>`)).join('') || '<p class="footnote">Noch keine Freunde – oben suchen und hinzufügen.</p>'}</div>
        ${f.outgoing.length ? `<div class="list-label">Gesendete Anfragen</div><div class="set-group fr-list">${f.outgoing.map((x) => person(x, `<button class="btn ghost sm" data-del="${esc(x.id)}">Zurückziehen</button>`)).join('')}</div>` : ''}`}
        <p class="footnote">Freunde kannst du in deine Gruppen einladen. Gefunden werden nur Konten auf eurem eigenen Server.</p>
      </div>`;
    const inp = o.querySelector('[data-q]');
    inp.addEventListener('input', () => { q = inp.value; clearTimeout(t); t = setTimeout(search, 250); });
  };
  function resultsHtml() {
    if (q.trim().length < 2) return '';
    if (!results.length) return '<p class="footnote">Niemand gefunden.</p>';
    return `<div class="set-group fr-list">${results.map((x) => person(x, x.rel === 'friend' ? '<span class="fr-tag">Freund</span>' : x.rel === 'outgoing' ? '<span class="fr-tag">angefragt</span>' : x.rel === 'incoming' ? `<button class="btn primary sm" data-acc="${esc(x.id)}">Annehmen</button>` : `<button class="btn primary sm" data-add="${esc(x.id)}">${icon('plus', 'xs')} Hinzufügen</button>`)).join('')}</div>`;
  }
  async function search() {
    if (q.trim().length < 2) { results = []; o.querySelector('[data-res]').innerHTML = ''; return; }
    try { results = (await api('GET', `/api/users/search?q=${encodeURIComponent(q.trim())}`)).users; } catch (e) { toast(e.message); results = []; }
    const box = o.querySelector('[data-res]');
    if (box) box.innerHTML = resultsHtml();
  }
  const load = async () => { try { f = await api('GET', '/api/friends'); } catch (e) { toast(e.message); f = { friends: [], incoming: [], outgoing: [] }; } draw(); if (q) search(); };
  o.addEventListener('click', async (e) => {
    const b = (s) => e.target.closest(s);
    if (b('[data-close]')) return o.close();
    const id = (b('[data-add]') || b('[data-acc]'))?.dataset;
    try {
      if (b('[data-add]') || b('[data-acc]')) { const r = await api('POST', `/api/friends/${encodeURIComponent(id.add || id.acc)}`); toast(r.status === 'friend' ? 'Ihr seid jetzt Freunde' : 'Anfrage gesendet'); return load(); }
      if (b('[data-del]')) { await api('DELETE', `/api/friends/${encodeURIComponent(b('[data-del]').dataset.del)}`); return load(); }
      if (b('[data-rm]')) {
        if (!(await confirmDialog(`${b('[data-rm]').dataset.name} als Freund entfernen?`, 'Entfernen', true))) return;
        await api('DELETE', `/api/friends/${encodeURIComponent(b('[data-rm]').dataset.rm)}`); return load();
      }
    } catch (err) { toast(err.message); }
  });
  draw();
  load();
}
