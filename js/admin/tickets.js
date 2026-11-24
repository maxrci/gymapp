import { get, post, patch, del } from './api.js';
import { esc, toast, fail, ask, fmtDateTime } from './ui.js';

const ST = { open: 'Offen', progress: 'In Arbeit', done: 'Erledigt', rejected: 'Abgelehnt' };
const TY = { wish: 'Wunsch', bug: 'Fehler' };
let tickets = [], fs = '', ft = '', root;

async function load() { tickets = (await get('/api/tickets')).tickets; }

function card(t) {
  return `<article class="card ticket" data-id="${esc(t.id)}"><div class="row between"><h3>${esc(t.title)}</h3><div><span class="badge">${esc(TY[t.type] || t.type)}</span> <span class="badge st-${esc(t.status)}">${esc(ST[t.status] || t.status)}</span></div></div>
    <p class="muted">${esc(t.author)} · ${fmtDateTime(t.created)}${t.device ? ` · ${esc(t.device)}` : ''} · ${t.votes} Stimme${t.votes === 1 ? '' : 'n'}</p>
    ${t.body ? `<p class="body">${esc(t.body)}</p>` : ''}
    ${t.comments.length ? `<ul class="comments">${t.comments.map((c) => `<li><b>${esc(c.author)}</b> <small class="muted">${fmtDateTime(c.created)}</small><br>${esc(c.body)}</li>`).join('')}</ul>` : ''}
    <div class="row wrap"><select data-act="status" aria-label="Status">${Object.entries(ST).map(([k, l]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <form class="grow row" data-act="comment"><input name="body" placeholder="Kommentar …" maxlength="2000" aria-label="Kommentar"><button class="btn sm">Senden</button></form>
    <button class="btn sm danger" data-act="delete">Löschen</button></div></article>`;
}

function draw() {
  const list = tickets.filter((t) => (!fs || t.status === fs) && (!ft || t.type === ft));
  root.querySelector('#list').innerHTML = list.map(card).join('') || '<p class="muted">Keine Tickets.</p>';
  root.querySelectorAll('[data-fs]').forEach((b) => b.classList.toggle('on', b.dataset.fs === fs));
  root.querySelectorAll('[data-ft]').forEach((b) => b.classList.toggle('on', b.dataset.ft === ft));
}

export async function render(el) {
  root = el; fs = ''; ft = '';
  await load();
  const pill = (attr, k, l) => `<button class="pill" data-${attr}="${k}">${l}</button>`;
  el.innerHTML = `<div class="bar wrap"><div class="pills">${pill('fs', '', 'Alle')}${Object.entries(ST).map(([k, l]) => pill('fs', k, l)).join('')}</div><div class="pills">${pill('ft', '', 'Alle Arten')}${Object.entries(TY).map(([k, l]) => pill('ft', k, l)).join('')}</div></div><div id="list" class="stack"></div>`;
  draw();
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-fs]'), b = e.target.closest('[data-ft]');
    if (a) { fs = a.dataset.fs; draw(); } else if (b) { ft = b.dataset.ft; draw(); }
  });
  const list = el.querySelector('#list');
  const reload = async () => { await load(); draw(); };
  list.addEventListener('change', async (e) => {
    if (e.target.dataset.act !== 'status') return;
    try { await patch(`/api/tickets/${e.target.closest('[data-id]').dataset.id}`, { status: e.target.value }); toast('Status geändert'); await reload(); } catch (x) { fail(x); }
  });
  list.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = e.target.body.value.trim(); if (!body) return;
    try { await post(`/api/tickets/${e.target.closest('[data-id]').dataset.id}/comments`, { body }); toast('Kommentar gesendet'); await reload(); } catch (x) { fail(x); }
  });
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act="delete"]'); if (!b) return;
    if (!(await ask('Ticket endgültig löschen?'))) return;
    try { await del(`/api/tickets/${b.closest('[data-id]').dataset.id}`); toast('Gelöscht'); await reload(); } catch (x) { fail(x); }
  });
}
