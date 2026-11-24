import { get, post, patch, del } from './api.js';
import { esc, toast, fail, ask, prompt2, showOnce } from './ui.js';

let groups = [], users = [], root;

async function load() {
  const [g, u] = await Promise.all([get('/api/admin/groups'), get('/api/admin/users')]);
  groups = g.groups; users = u.users;
}

function card(g) {
  const ids = new Set(g.members.map((m) => m.id));
  const free = users.filter((u) => !ids.has(u.id) || g.members.find((m) => m.id === u.id)?.status !== 'member');
  const chips = g.members.map((m) => `<span class="chip ${m.status !== 'member' ? 'pending' : ''}">${esc(m.name)}${m.role === 'owner' || m.role === 'admin' ? ` <small>${esc(m.role)}</small>` : ''}${m.status !== 'member' ? ' <small>(eingeladen)</small>' : ''}<button data-act="rm" data-uid="${esc(m.id)}" aria-label="${esc(m.name)} entfernen" title="Entfernen">×</button></span>`).join('') || '<span class="muted">Keine Mitglieder</span>';
  return `<section class="card" data-id="${esc(g.id)}"><div class="row between"><h3>${esc(g.name)}</h3><div class="actions">
    <button class="btn sm" data-act="rename">Umbenennen</button><button class="btn sm" data-act="code">Einladungscode</button><button class="btn sm danger" data-act="delete">Löschen</button></div></div>
    <div class="chips">${chips}</div>
    <div class="row add"><select aria-label="Mitglied hinzufügen">${free.map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select><button class="btn sm" data-act="add" ${free.length ? '' : 'disabled'}>Hinzufügen</button></div></section>`;
}

const draw = () => { root.querySelector('#list').innerHTML = groups.map(card).join('') || '<p class="muted">Noch keine Gruppen.</p>'; };

export async function render(el) {
  root = el;
  await load();
  el.innerHTML = `<form class="bar" id="mk"><input name="name" placeholder="Name der neuen Gruppe" maxlength="40" required aria-label="Gruppenname"><button class="btn primary">Gruppe anlegen</button></form><div id="list" class="stack"></div>`;
  draw();
  el.querySelector('#mk').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await post('/api/admin/groups', { name: e.target.name.value.trim() });
      e.target.reset(); toast('Gruppe angelegt');
      if (r.code) showOnce(`Einladungscode für ${r.name}`, 'Der Code wird nur jetzt angezeigt.', [['Code', r.code]]);
      await load(); draw();
    } catch (x) { fail(x); }
  });
  el.querySelector('#list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const sec = b.closest('[data-id]'); const g = groups.find((x) => x.id === sec.dataset.id); if (!g) return;
    try {
      const a = b.dataset.act;
      if (a === 'rename') { const v = await prompt2('Neuer Gruppenname', g.name); if (!v) return; await patch(`/api/admin/groups/${g.id}`, { name: v }); toast('Umbenannt'); }
      else if (a === 'delete') { if (!(await ask(`Gruppe „${g.name}“ löschen? Die Mitglieder bleiben als Nutzer erhalten.`))) return; await del(`/api/admin/groups/${g.id}`); toast('Gruppe gelöscht'); }
      else if (a === 'code') { const r = await post(`/api/admin/groups/${g.id}/code`, {}); showOnce(`Einladungscode für ${g.name}`, 'Der Code wird nur jetzt angezeigt. Ein neuer Code macht den alten ungültig.', [['Code', r.code]]); return; }
      else if (a === 'add') { const uid = sec.querySelector('select').value; if (!uid) return; await post(`/api/admin/groups/${g.id}/members`, { user: uid }); toast('Mitglied hinzugefügt'); }
      else if (a === 'rm') { const m = g.members.find((x) => x.id === b.dataset.uid); if (!(await ask(`${m ? m.name : 'Mitglied'} aus „${g.name}“ entfernen?`, 'Entfernen'))) return; await del(`/api/admin/groups/${g.id}/members/${b.dataset.uid}`); toast('Entfernt'); }
      await load(); draw();
    } catch (x) { fail(x); }
  });
}
