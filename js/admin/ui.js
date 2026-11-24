// Kleine Helfer für das Admin-Dashboard: Escaping, Toasts, Dialoge, Formatierung
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3000);
}
export const fail = (e) => toast(e && e.message === 'Failed to fetch' ? 'Server nicht erreichbar' : (e && e.message) || 'Fehler', 'err');

function overlay(html) {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(o);
  return o;
}

// Bestätigungsdialog → Promise<boolean>
export function ask(text, okLabel = 'Löschen') {
  return new Promise((res) => {
    const o = overlay(`<p>${esc(text)}</p><div class="row end"><button class="btn" data-v="0">Abbrechen</button><button class="btn danger" data-v="1">${esc(okLabel)}</button></div>`);
    o.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (b || e.target === o) { o.remove(); res(!!b && b.dataset.v === '1'); }
    });
    o.querySelector('[data-v="0"]').focus();
  });
}

// Einfacher Eingabedialog → Promise<string|null>
export function prompt2(label, value = '', okLabel = 'Speichern') {
  return new Promise((res) => {
    const o = overlay(`<form><label class="fld"><span>${esc(label)}</span><input name="v" value="${esc(value)}" maxlength="80" autocomplete="off"></label><div class="row end"><button type="button" class="btn" data-v="0">Abbrechen</button><button class="btn primary">${esc(okLabel)}</button></div></form>`);
    const done = (v) => { o.remove(); res(v); };
    o.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); done(e.target.v.value.trim()); });
    o.addEventListener('click', (e) => { if (e.target === o || e.target.dataset.v === '0') done(null); });
    o.querySelector('input').select();
  });
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Kopiert'); }
  catch {
    const t = document.createElement('textarea');
    t.value = text; document.body.append(t); t.select();
    try { document.execCommand('copy'); toast('Kopiert'); } catch { toast('Kopieren nicht möglich', 'err'); }
    t.remove();
  }
}

// Daten, die nur einmal sichtbar sind (Zugangsdaten, Einladungscode): Felder [label, wert]
export function showOnce(title, note, fields) {
  const rows = fields.filter((f) => f[1]).map(([l, v]) => `<div class="cred"><span>${esc(l)}</span><code>${esc(v)}</code><button class="btn sm" data-copy="${esc(v)}">Kopieren</button></div>`).join('');
  const all = fields.filter((f) => f[1]).map(([l, v]) => `${l}: ${v}`).join('\n');
  const o = overlay(`<h3>${esc(title)}</h3><p class="muted">${esc(note)}</p><div class="creds">${rows}</div><div class="row end"><button class="btn" data-copy="${esc(all)}">Alles kopieren</button><button class="btn primary" data-close="1">Fertig</button></div>`);
  o.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) copy(c.dataset.copy);
    else if (e.target.closest('[data-close]')) o.remove();
  });
}

export const fmtDate = (t) => (t ? new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');
export const fmtDateTime = (t) => (t ? new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
export function fmtAgo(t) {
  if (!t) return 'nie';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  if (m < 1440) return `vor ${Math.round(m / 60)} Std.`;
  return `vor ${Math.round(m / 1440)} Tg.`;
}
export function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;
}
export function fmtDur(ms) {
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d} Tg. ${h} Std.` : h ? `${h} Std. ${m % 60} Min.` : `${m} Min.`;
}
export const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
