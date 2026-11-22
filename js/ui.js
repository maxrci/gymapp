// UI-Bausteine: Icons, Dialoge, Action-Sheets, Toasts

import { esc } from './utils.js';

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  weight: '<path d="M5.5 20h13l-1.8-10H7.3z"/><path d="M9.5 10V8a2.5 2.5 0 0 1 5 0v2"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 12h6M9 16h6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  skip: '<path d="M5 5l10 7-10 7z"/><path d="M19 5v14"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 5 6M22 9l-5 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  heart: '<path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/>',
  medal: '<circle cx="12" cy="15" r="6"/><path d="m8.5 3 3.5 6 3.5-6M12 12.5v5M10 15h4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2.2.6 3.5 2.3 3.5 5.2"/>',
  key: '<circle cx="7.5" cy="15.5" r="4"/><path d="m10.5 12.5 9-9M16 7l3 3M18.5 4.5l2 2"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3c1-4 5-9 12-9 0 7-5 11-9 12z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

const layer = () => document.getElementById('layer');

// Action-Sheet: gibt den gewählten Wert zurück (oder null)
export function sheet({ title, message, options }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-backdrop';
    wrap.innerHTML = `
      <div class="sheet" role="dialog">
        ${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}
        ${message ? `<div class="sheet-msg">${esc(message)}</div>` : ''}
        <div class="sheet-opts">
          ${options.map((o, i) => `<button class="sheet-opt ${o.danger ? 'danger' : ''} ${o.active ? 'active' : ''}" data-i="${i}">${o.icon ? icon(o.icon) : ''}<span>${esc(o.label)}</span>${o.active ? icon('check', 'ml') : ''}</button>`).join('')}
        </div>
        <button class="sheet-cancel">Abbrechen</button>
      </div>`;
    const close = (v) => {
      wrap.classList.add('closing');
      setTimeout(() => wrap.remove(), 180);
      resolve(v);
    };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) return close(options[+b.dataset.i].value);
      if (e.target === wrap || e.target.closest('.sheet-cancel')) close(null);
    });
    layer().appendChild(wrap);
  });
}

export async function confirmDialog(message, okLabel = 'OK', danger = false, title) {
  const v = await sheet({ title, message, options: [{ label: okLabel, value: true, danger }] });
  return v === true;
}

// Formular-Dialog: fields [{name, label, type, value, options}]
export function formDialog({ title, fields, okLabel = 'Speichern' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-backdrop';
    wrap.innerHTML = `
      <form class="sheet form-sheet">
        <div class="sheet-title">${esc(title)}</div>
        ${fields.map((f) => `
          <label class="field">
            <span>${esc(f.label)}</span>
            ${f.type === 'select'
              ? `<select name="${f.name}">${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
              : f.type === 'textarea'
                ? `<textarea name="${f.name}" rows="3" placeholder="${esc(f.placeholder || '')}">${esc(f.value ?? '')}</textarea>`
                : `<input name="${f.name}" type="${f.type || 'text'}" ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}" ${f.step ? `step="${f.step}"` : ''} autocomplete="off">`}
          </label>`).join('')}
        <div class="form-actions">
          <button type="button" class="btn ghost" data-cancel>Abbrechen</button>
          <button type="submit" class="btn primary">${esc(okLabel)}</button>
        </div>
      </form>`;
    const form = wrap.querySelector('form');
    const close = (v) => { wrap.classList.add('closing'); setTimeout(() => wrap.remove(), 180); resolve(v); };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = {};
      for (const f of fields) out[f.name] = form.elements[f.name].value;
      close(out);
    });
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-cancel]')) close(null);
    });
    layer().appendChild(wrap);
    const first = form.querySelector('input,textarea');
    if (first && fields[0]?.autofocus !== false) setTimeout(() => first.focus(), 50);
  });
}

export function toast(msg, ms = 2400) {
  layer().querySelectorAll('.toast').forEach((x) => x.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  layer().appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// Vollbild-Overlay (z. B. Übungsauswahl)
export function overlay(html, cls = '') {
  const o = document.createElement('div');
  o.className = `overlay panel ${cls}`;
  o.innerHTML = html;
  layer().appendChild(o);
  requestAnimationFrame(() => o.classList.add('open'));
  o.close = () => { o.classList.remove('open'); setTimeout(() => o.remove(), 250); };
  return o;
}

export function chips(items, active, attr) {
  return `<div class="chips">${items.map(([v, l]) => `<button class="chip ${v === active ? 'on' : ''}" ${attr}="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  });
}
