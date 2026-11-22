// Körpergewicht-Verlauf bearbeiten

import { overlay, icon, formDialog, confirmDialog } from './ui.js';
import { esc, num, fmtDate, parseNum } from './utils.js';
import { bwLog, addBodyweight, deleteBodyweight } from './body.js';
import { lineChart, SERIES } from './charts.js';

export function openBodyweight() {
  const o = overlay('', 'bw-editor');
  const draw = () => {
    const log = bwLog().filter((e) => e.t);
    const legacy = !log.length && bwLog().length;
    const cur = bwLog().at(-1)?.kg;
    const first = log[0]?.kg;
    o.innerHTML = `
      <div class="panel-head"><button class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button><div class="panel-title">Körpergewicht</div><span style="width:40px"></span></div>
      <div class="panel-body">
        <div class="bw-now"><b>${cur ? num(cur, 1) : '–'}</b><span>kg</span>
          ${log.length > 1 ? `<small class="${cur - first > 0 ? 'up' : cur - first < 0 ? 'down' : ''}">${cur - first > 0 ? '+' : ''}${num(cur - first, 1)} kg seit ${esc(fmtDate(log[0].t, { month: 'short', year: 'numeric' }))}</small>` : ''}</div>
        <button class="btn primary block" data-add>${icon('plus')} Gewicht eintragen</button>
        ${log.length > 1 ? '<section class="card"><div data-chart="bw"></div></section>' : ''}
        <p class="footnote">Für jeden Satz zählt das Körpergewicht, das du an diesem Tag hattest – für Klimmzüge, Dips & Co. und für die Kraft relativ zum Körpergewicht (× KG).${legacy ? ' Dein bisher gespeichertes Gewicht gilt für alle Workouts, bis du einen Verlauf einträgst.' : ''}</p>
        ${log.length ? `<div class="set-group">${[...log].reverse().map((e) => `<div class="set-item">
          <span class="si-ic">${icon('weight')}</span><span class="si-l">${esc(fmtDate(e.t, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</span>
          <span class="si-v"><b>${num(e.kg, 1)} kg</b></span><button class="icon-btn" data-del="${e.t}" aria-label="Löschen">${icon('trash')}</button></div>`).join('')}</div>` : ''}
      </div>`;
    const host = o.querySelector('[data-chart="bw"]');
    if (host) lineChart(host, { series: [{ name: 'Gewicht', points: log.map((e) => ({ x: e.t, y: e.kg })), color: SERIES[1] }], yFmt: (v) => num(v, 0), height: 170, tipFmt: (p) => `<div class="tt-h">${esc(fmtDate(p.x))}</div><div class="tt-r"><b>${num(p.y, 1)} kg</b></div>` });
  };
  draw();
  o.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return o.close();
    if (e.target.closest('[data-add]')) {
      const today = new Date().toISOString().slice(0, 10);
      const r = await formDialog({ title: 'Gewicht eintragen', fields: [
        { name: 'kg', label: 'Gewicht in kg', inputmode: 'decimal', value: bwLog().at(-1)?.kg ?? '' },
        { name: 'd', label: 'Datum', type: 'date', value: today, autofocus: false },
      ] });
      if (!r) return;
      const kg = parseNum(r.kg);
      if (!kg || kg < 25 || kg > 350) return;
      const t = r.d && r.d !== today ? new Date(`${r.d}T12:00`).getTime() : Date.now();
      await addBodyweight(kg, t);
      return draw();
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!(await confirmDialog('Eintrag löschen?', 'Löschen', true))) return;
      await deleteBodyweight(+del.dataset.del);
      draw();
    }
  });
}
