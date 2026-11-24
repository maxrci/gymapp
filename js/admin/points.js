import { get, post, saveConfig } from './api.js';
import { XP_DEFAULT, xpRules } from '../xp.js';
import { esc, toast, fail, ask } from './ui.js';

const FIELDS = [
  ['workout', 'EP pro Workout'], ['perDay', 'max. Workouts pro Tag'], ['minute', 'EP pro Trainingsminute'], ['maxMin', 'max. Minuten pro Workout'],
  ['pr', 'EP pro Rekord'], ['goalWeek', 'EP pro Wochenziel'], ['win', 'EP pro Challenge-Sieg'],
];

export async function render(el) {
  const cfg = await get('/api/config');
  const cur = { ...XP_DEFAULT, ...(cfg.points?.value || {}) };
  el.innerHTML = `<form id="f" class="card"><div class="grid">${FIELDS.map(([k, l]) => `<label class="fld"><span>${esc(l)}</span><input type="number" name="${k}" min="0" max="100000" step="1" value="${Number(cur[k])}"></label>`).join('')}</div>
    <p class="rules" id="rules"></p>
    <div class="row"><button type="button" class="btn" id="prev">Vorschau</button><button class="btn primary">Speichern</button><button type="button" class="btn" id="reset">Auf Standard zurücksetzen</button></div></form>
    <div id="out"></div>`;
  const f = el.querySelector('#f');
  const read = () => Object.fromEntries(FIELDS.map(([k]) => { const n = Math.round(Number(f[k].value)); return [k, Number.isFinite(n) && n >= 0 ? n : XP_DEFAULT[k]]; }));
  const rules = () => { el.querySelector('#rules').textContent = xpRules(read()); };
  rules();
  f.addEventListener('input', rules);
  el.querySelector('#reset').addEventListener('click', () => { FIELDS.forEach(([k]) => { f[k].value = XP_DEFAULT[k]; }); rules(); toast('Standardwerte eingesetzt – noch nicht gespeichert'); });
  el.querySelector('#prev').addEventListener('click', async () => {
    const out = el.querySelector('#out');
    try {
      const r = await post('/api/admin/points/preview', { points: read() });
      const tbl = (rows) => rows.length ? `<table><thead><tr><th>Name</th><th class="num">vorher</th><th class="num">nachher</th><th class="num">Differenz</th></tr></thead><tbody>${rows.map((x) => { const d = x.after - x.before; return `<tr><td>${esc(x.name)}</td><td class="num">${x.before}</td><td class="num">${x.after}</td><td class="num ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">Keine Daten.</p>';
      out.innerHTML = r.groups.length ? r.groups.map((g) => `<section class="card"><h3>${esc(g.name)}</h3><div class="cols"><div><h4>Saison</h4>${tbl(g.season)}</div><div><h4>Monat</h4>${tbl(g.month)}</div></div></section>`).join('') : '<p class="muted">Keine Gruppen.</p>';
    } catch (x) { fail(x); }
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await ask('Neue Punkte-Regeln für alle Gruppen speichern? Die Rangliste wird neu berechnet.', 'Speichern'))) return;
    try { await saveConfig('points', read()); toast('Gespeichert'); } catch (x) { fail(x); }
  });
}
