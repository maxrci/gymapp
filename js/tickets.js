// Tickets: Verbesserungswünsche & Fehlermeldungen.
// Mit Gruppen-Server sieht die ganze Gruppe alle Tickets (abstimmen, kommentieren, Admin setzt den Status).
// Ohne Server werden Tickets lokal gespeichert und können per GitHub oder Teilen verschickt werden.

import { overlay, icon, formDialog, confirmDialog, toast, sheet } from './ui.js';
import { esc, fmtDate, fmtRelDay } from './utils.js';
import { api, loggedIn, account, isAdmin } from './sync.js';
import { APP_VERSION } from './version.js';
import { share } from './platform.js';

export const TICKET_TYPES = [['wish', 'Wunsch', 'star'], ['bug', 'Fehler', 'info']];
export const TICKET_STATUS = [['open', 'Offen'], ['progress', 'In Arbeit'], ['done', 'Erledigt'], ['rejected', 'Abgelehnt']];
const REPO_ISSUES = 'https://github.com/maxrci/gymapp/issues/new';
const LS = 'gymlog-tickets';
const LS_CACHE = 'gymlog-tickets-cache';

const typeOf = (k) => TICKET_TYPES.find(([x]) => x === k) || TICKET_TYPES[0];
const statusOf = (k) => TICKET_STATUS.find(([x]) => x === k) || TICKET_STATUS[0];
const deviceInfo = () => `Gym ${APP_VERSION} · ${navigator.userAgent.match(/\(([^)]+)\)/)?.[1] || navigator.platform || ''}`.slice(0, 160);

// ---------- Lokale Ablage (ohne Server) ----------
const loadLocal = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
const saveLocal = (l) => { try { localStorage.setItem(LS, JSON.stringify(l)); } catch { /* voll */ } };
const local = {
  async list() { return { tickets: loadLocal().map((t) => ({ ...t, mine: true, votes: t.votes || 0, voted: false, comments: t.comments || [] })), admin: true }; },
  async create(t) { const l = loadLocal(); const x = { ...t, id: `t${Date.now().toString(36)}`, author: 'Du', status: 'open', created: Date.now(), updated: Date.now(), comments: [] }; l.unshift(x); saveLocal(l); return x; },
  async update(id, patch) { saveLocal(loadLocal().map((t) => (t.id === id ? { ...t, ...patch, updated: Date.now() } : t))); },
  async comment(id, body) { saveLocal(loadLocal().map((t) => (t.id === id ? { ...t, comments: [...(t.comments || []), { id: `c${Date.now()}`, author: 'Du', body, created: Date.now(), mine: true }] } : t))); },
  async vote() {},
  async remove(id) { saveLocal(loadLocal().filter((t) => t.id !== id)); },
};
const remote = {
  list: () => api('GET', '/api/tickets'),
  create: (t) => api('POST', '/api/tickets', t),
  update: (id, patch) => api('PATCH', `/api/tickets/${id}`, patch),
  comment: (id, body) => api('POST', `/api/tickets/${id}/comments`, { body }),
  vote: (id, on) => api('POST', `/api/tickets/${id}/vote`, { on }),
  remove: (id) => api('DELETE', `/api/tickets/${id}`),
};
const backend = () => (loggedIn() ? remote : local);

export function ticketBadge() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_CACHE) || 'null');
    const open = (c || (loggedIn() ? [] : loadLocal())).filter((t) => t.status === 'open' || t.status === 'progress').length;
    return open ? `${open} offen` : '';
  } catch { return ''; }
}

function shareText(t) {
  return `[${typeOf(t.type)[1]}] ${t.title}\n\n${t.body || ''}\n\n${t.device || deviceInfo()}`;
}
function githubUrl(t) {
  const q = new URLSearchParams({ title: `[${typeOf(t.type)[1]}] ${t.title}`, body: `${t.body || ''}\n\n---\n${t.device || deviceInfo()}`, labels: t.type === 'bug' ? 'bug' : 'enhancement' });
  return `${REPO_ISSUES}?${q}`;
}

// ---------- Neues Ticket ----------
export async function newTicket(type = 'wish', pre = {}) {
  const r = await formDialog({
    title: 'Neues Ticket', okLabel: 'Absenden',
    fields: [
      { name: 'type', label: 'Art', type: 'select', value: type, options: TICKET_TYPES.map(([v, l]) => ({ value: v, label: v === 'bug' ? 'Fehler melden' : 'Verbesserungswunsch' })) },
      { name: 'title', label: 'Kurz und knapp', placeholder: 'z. B. Satz lässt sich nicht löschen', autofocus: false, value: pre.title || '' },
      { name: 'body', label: 'Beschreibung (was, wo, wie oft?)', type: 'textarea', placeholder: 'Was hast du gemacht, was ist passiert, was hättest du erwartet?', value: pre.body || '' },
    ],
  });
  if (!r) return null;
  if (!r.title.trim()) { toast('Bitte einen Titel angeben'); return null; }
  try {
    const t = await backend().create({ type: r.type, title: r.title.trim().slice(0, 120), body: r.body.trim().slice(0, 4000), device: deviceInfo() });
    toast(loggedIn() ? 'Ticket an die Gruppe geschickt' : 'Ticket gespeichert');
    return t;
  } catch (e) { toast(e.message); return null; }
}

// ---------- Liste ----------
export function openTickets() {
  const o = overlay('', 'tickets-view');
  const f = { type: '', status: 'active' };
  let data = null;
  const load = async () => {
    try {
      data = await backend().list();
      try { localStorage.setItem(LS_CACHE, JSON.stringify(data.tickets.map(({ id, status }) => ({ id, status })))); } catch { /* egal */ }
    } catch (e) { data = { tickets: [], error: e.message }; }
    draw();
  };
  const draw = () => {
    const list = (data?.tickets || []).filter((t) => (!f.type || t.type === f.type)
      && (f.status === 'all' || (f.status === 'active' ? ['open', 'progress'].includes(t.status) : ['done', 'rejected'].includes(t.status))))
      .sort((a, b) => (b.votes || 0) - (a.votes || 0) || b.updated - a.updated);
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button><div class="panel-title">Wünsche & Fehler</div><span style="width:40px"></span></div>
      <div class="panel-body">
        <div class="tk-new">
          <button class="btn primary" data-new="wish">${icon('star', 'xs')} Wunsch</button>
          <button class="btn ghost" data-new="bug">${icon('info', 'xs')} Fehler melden</button>
        </div>
        <p class="footnote">${loggedIn() ? `Alle in ${esc(account().group || 'der Gruppe')} sehen die Tickets und können mit „Ich auch“ abstimmen. ${isAdmin() ? 'Als Admin setzt du den Status.' : 'Der Admin setzt den Status.'}` : 'Ohne Gruppen-Server bleiben Tickets auf diesem Gerät. Über „Senden“ kannst du sie auf GitHub melden oder per Nachricht teilen.'}</p>
        <div class="chips scroll">${[['', 'Alle'], ...TICKET_TYPES.map(([k, l]) => [k, l])].map(([k, l]) => `<button class="chip ${f.type === k ? 'on' : ''}" data-ft="${k}">${esc(l)}</button>`).join('')}
          <span class="chip-sep"></span>${[['active', 'Offen'], ['closed', 'Erledigt'], ['all', 'Alle']].map(([k, l]) => `<button class="chip ${f.status === k ? 'on' : ''}" data-fs="${k}">${l}</button>`).join('')}</div>
        ${!data ? '<div class="chart-empty">Lade…</div>' : data.error ? `<div class="chart-empty">${esc(data.error)}</div>` : list.length ? list.map((t) => `<button class="card tk-row" data-open="${esc(t.id)}">
          <span class="tk-ic ${esc(t.type)}">${icon(typeOf(t.type)[2])}</span>
          <span class="tk-main"><b>${esc(t.title)}</b><small>${esc(t.author || '')} · ${esc(fmtRelDay(t.created))}${t.comments?.length ? ` · ${t.comments.length} Kommentar${t.comments.length > 1 ? 'e' : ''}` : ''}</small></span>
          <span class="tk-side"><span class="tk-st ${esc(t.status)}">${statusOf(t.status)[1]}</span>${loggedIn() ? `<small>${icon('heart', 'xs')} ${t.votes || 0}</small>` : ''}</span></button>`).join('')
          : `<div class="chart-empty">${f.status === 'active' ? 'Keine offenen Tickets' : 'Keine Tickets'}</div>`}
      </div>`;
  };
  draw();
  load();
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    const n = e.target.closest('[data-new]');
    if (n) { const t = await newTicket(n.dataset.new); if (t) load(); return; }
    const ft = e.target.closest('[data-ft]');
    if (ft) { f.type = ft.dataset.ft; return draw(); }
    const fs = e.target.closest('[data-fs]');
    if (fs) { f.status = fs.dataset.fs; return draw(); }
    const op = e.target.closest('[data-open]');
    if (op) { const t = data.tickets.find((x) => x.id === op.dataset.open); if (t) openTicket(t, data.admin, load); }
  });
}

// ---------- Detail ----------
function openTicket(t, admin, reload) {
  const o = overlay('', 'ticket-view');
  const canEdit = admin || t.mine;
  o.innerHTML = `
    <div class="panel-head"><button class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button><div class="panel-title">${typeOf(t.type)[1]}</div>
      ${canEdit ? `<button class="icon-btn" data-menu aria-label="Optionen">${icon('more')}</button>` : '<span style="width:40px"></span>'}</div>
    <div class="panel-body">
      <div class="tk-head"><span class="tk-ic ${esc(t.type)}">${icon(typeOf(t.type)[2])}</span><div><h3>${esc(t.title)}</h3>
        <small>${esc(t.author || '')} · ${esc(fmtDate(t.created, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small></div>
        <span class="tk-st ${esc(t.status)}">${statusOf(t.status)[1]}</span></div>
      ${t.body ? `<div class="card tk-body">${esc(t.body).replace(/\n/g, '<br>')}</div>` : ''}
      ${t.device ? `<p class="footnote">${esc(t.device)}</p>` : ''}
      ${loggedIn() ? `<button class="btn ${t.voted ? 'primary' : 'ghost'} block" data-vote>${icon('heart', 'xs')} Ich auch · ${t.votes || 0}</button>` : `
        <div class="tk-new"><a class="btn primary" href="${esc(githubUrl(t))}" target="_blank" rel="noopener">${icon('share', 'xs')} Auf GitHub melden</a><button class="btn ghost" data-share>${icon('share', 'xs')} Teilen</button></div>`}
      <div class="list-label">Kommentare</div>
      ${(t.comments || []).map((c) => `<div class="card tk-c"><small>${esc(c.author || '')} · ${esc(fmtRelDay(c.created))}</small><p>${esc(c.body).replace(/\n/g, '<br>')}</p></div>`).join('') || '<p class="footnote">Noch keine Kommentare.</p>'}
      <form class="tk-cform"><textarea name="c" rows="2" placeholder="Kommentar schreiben…"></textarea><button class="btn primary sm" type="submit">Senden</button></form>
    </div>`;
  const done = () => { o.close(); reload(); };
  o.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = e.target.elements.c.value.trim();
    if (!v) return;
    try { await backend().comment(t.id, v.slice(0, 2000)); toast('Kommentar gesendet'); done(); } catch (err) { toast(err.message); }
  });
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    try {
      if (e.target.closest('[data-vote]')) { await backend().vote(t.id, !t.voted); return done(); }
      if (e.target.closest('[data-share]')) {
        const text = shareText(t);
        let shared = false; try { shared = await share({ title: 'Gym-Ticket', text }); } catch { shared = true; /* abgebrochen */ }
        if (!shared) { await navigator.clipboard?.writeText(text); toast('Kopiert'); }
        return;
      }
      if (e.target.closest('[data-menu]')) {
        const v = await sheet({
          title: t.title,
          options: [
            ...(admin ? TICKET_STATUS.map(([k, l]) => ({ label: `Status: ${l}`, value: `s:${k}`, active: k === t.status })) : []),
            ...(t.mine ? [{ label: 'Bearbeiten', value: 'edit', icon: 'edit' }] : []),
            ...(!admin && t.mine && t.status !== 'done' ? [{ label: 'Als erledigt markieren', value: 's:done', icon: 'check' }] : []),
            { label: 'Löschen', value: 'del', icon: 'trash', danger: true },
          ],
        });
        if (!v) return;
        if (v.startsWith('s:')) { await backend().update(t.id, { status: v.slice(2) }); return done(); }
        if (v === 'edit') {
          const r = await formDialog({ title: 'Ticket bearbeiten', fields: [{ name: 'title', label: 'Titel', value: t.title }, { name: 'body', label: 'Beschreibung', type: 'textarea', value: t.body || '' }] });
          if (r?.title.trim()) { await backend().update(t.id, { title: r.title.trim().slice(0, 120), body: r.body.trim().slice(0, 4000) }); done(); }
          return;
        }
        if (v === 'del' && await confirmDialog('Ticket löschen?', 'Löschen', true)) { await backend().remove(t.id); done(); }
      }
    } catch (err) { toast(err.message); }
  });
}
