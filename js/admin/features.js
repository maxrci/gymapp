import { get, saveConfig } from './api.js';
import { ITEMS, SLOTS, unlockHint } from '../unlocks.js';
import { esc, toast, fail } from './ui.js';

const FEATS = [['arenaLive', 'Live-Arena'], ['nutrition', 'Ernährungs-Tracking'], ['events', 'Events & Specials'], ['items', 'Avatar-Objekte']];

export async function render(el) {
  const cfg = await get('/api/config');
  const cur = cfg.features?.value || {};
  const slot = Object.fromEntries(SLOTS);
  el.innerHTML = `<h2>Funktionen</h2><p class="muted">Schaltet Bereiche der App für alle Nutzer ein oder aus.</p>
    <form id="f" class="card">${FEATS.map(([k, l]) => `<label class="switch"><input type="checkbox" name="${k}" ${cur[k] === false ? '' : 'checked'}><span class="track"></span><span>${esc(l)}</span></label>`).join('')}<div class="row"><button class="btn primary">Speichern</button></div></form>
    <h2>Freischaltungen <small class="muted">(nur lesbar)</small></h2>
    <div class="card scroll"><table><thead><tr><th>ID</th><th>Name</th><th>Platz</th><th>Freischaltung</th></tr></thead><tbody>${ITEMS.map((i) => `<tr><td><code>${esc(i.id)}</code></td><td>${esc(i.label)}</td><td>${esc(slot[i.slot] || i.slot)}</td><td>${esc(unlockHint(i))}${i.ios === false ? ' <small class="muted">· nicht in der iOS-App</small>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
  el.querySelector('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = Object.fromEntries(FEATS.map(([k]) => [k, e.target[k].checked]));
    try { await saveConfig('features', value); toast('Gespeichert'); } catch (x) { fail(x); }
  });
}
