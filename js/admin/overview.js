import { get } from './api.js';
import { esc, fmtBytes, fmtDur } from './ui.js';

export async function render(el) {
  const o = await get('/api/admin/overview');
  const tiles = [
    ['Nutzer', o.users], ['Aktiv in 24 h', o.activeUsers], ['Gruppen', o.groups], ['Workouts', o.workouts],
    ['Workouts heute (24 h)', o.workoutsToday], ['Offene Tickets', o.tickets], ['Geräte', o.devices],
    ['Datenbank', fmtBytes(o.dbBytes)], ['Version', o.version], ['Laufzeit', fmtDur(o.uptime)],
  ];
  el.innerHTML = `<div class="tiles">${tiles.map(([l, v]) => `<div class="tile"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>
    <h2>Gesundheit</h2>
    <ul class="health">
      <li><i class="dot ${o.privateApp ? 'good' : 'warn'}"></i>Privat ausgeliefert: <b>${o.privateApp ? 'ja' : 'nein'}</b></li>
      <li><i class="dot good"></i>Node-Version: <b>${esc(o.node)}</b></li>
      <li><i class="dot good"></i>Gruppe: <b>${esc(o.group)}</b></li>
    </ul>`;
}
