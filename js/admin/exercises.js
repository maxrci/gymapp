import { get, saveConfig } from './api.js';
import { LIBRARY, MUSCLES, TYPES, inferExercise } from '../library.js';
import { esc, toast, fail, ask, debounce } from './ui.js';

export async function render(el) {
  const cfg = await get('/api/config');
  let cfgVal = cfg.exercises?.value && typeof cfg.exercises.value === 'object' ? cfg.exercises.value : {};
  let custom = Array.isArray(cfgVal.custom) ? cfgVal.custom.filter((c) => c && c.name) : [];
  const opt = (arr, fmt) => arr.map((a) => `<option value="${esc(a)}">${esc(fmt(a))}</option>`).join('');
  el.innerHTML = `<h2>Eigene Übungen</h2><p class="muted">Gelten für alle Nutzer dieses Servers.</p>
    <form id="mk" class="card bar wrap"><input name="name" placeholder="Name (2–80 Zeichen)" maxlength="80" required aria-label="Name"><select name="primary" aria-label="Muskelgruppe">${opt(MUSCLES, (x) => x)}</select><select name="type" aria-label="Typ">${opt(Object.keys(TYPES), (t) => TYPES[t].label)}</select><button class="btn primary">Hinzufügen</button></form>
    <div class="card scroll" id="cust"></div>
    <h2>Bibliothek <small class="muted">(${LIBRARY.length}, nur lesbar)</small></h2>
    <div class="bar"><input type="search" id="q" placeholder="Übung suchen …" aria-label="Übung suchen"></div><div class="card scroll" id="lib"></div>`;
  const drawCust = () => {
    el.querySelector('#cust').innerHTML = custom.length ? `<table><thead><tr><th>Name</th><th>Muskel</th><th>Typ</th><th></th></tr></thead><tbody>${custom.map((c, i) => `<tr><td>${esc(c.name)}</td><td>${esc(c.primary)}</td><td>${esc(TYPES[c.type]?.label || c.type)}</td><td class="end"><button class="btn sm danger" data-i="${i}">Entfernen</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Noch keine eigenen Übungen.</p>';
  };
  const drawLib = () => {
    const s = el.querySelector('#q').value.trim().toLowerCase();
    const rows = LIBRARY.filter((n) => !s || n.toLowerCase().includes(s)).slice(0, 400).map((n) => { const x = inferExercise(n); return `<tr><td>${esc(n)}</td><td>${esc(x.primary)}</td><td>${esc(TYPES[x.type]?.label || x.type)}</td></tr>`; });
    el.querySelector('#lib').innerHTML = rows.length ? `<table><thead><tr><th>Name</th><th>Primärer Muskel</th><th>Typ</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="muted">Nichts gefunden.</p>';
  };
  const save = async (next) => {
    try { await saveConfig('exercises', { ...cfgVal, custom: next }); cfgVal = { ...cfgVal, custom: next }; custom = next; drawCust(); return true; } catch (x) { fail(x); return false; }
  };
  drawCust(); drawLib();
  el.querySelector('#q').addEventListener('input', debounce(drawLib));
  el.querySelector('#mk').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 80) return toast('Name: 2–80 Zeichen', 'err');
    if (!MUSCLES.includes(f.primary.value) || !(f.type.value in TYPES)) return toast('Ungültige Auswahl', 'err');
    const low = name.toLowerCase();
    if (custom.some((c) => c.name.toLowerCase() === low) || LIBRARY.some((n) => n.toLowerCase() === low)) return toast('Diese Übung gibt es schon', 'err');
    if (await save([...custom, { name, primary: f.primary.value, type: f.type.value }])) { f.reset(); toast('Gespeichert'); }
  });
  el.querySelector('#cust').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const c = custom[+b.dataset.i];
    if (c && (await ask(`„${c.name}“ entfernen?`, 'Entfernen')) && (await save(custom.filter((_, i) => i !== +b.dataset.i)))) toast('Entfernt');
  });
}
