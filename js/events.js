// Saison- und Feiertags-Specials: Datumsregeln (rein, ohne DOM) + Deko-Ebene.
import { state } from './store.js';

// ---------- Datum ----------
const DAY = 864e5;
const utc = (y, m, d) => Date.UTC(y, m - 1, d); // m: 1–12
const dayNo = (date) => utc(date.getFullYear(), date.getMonth() + 1, date.getDate());
const dow = (t) => new Date(t).getUTCDay(); // 0 = So

// Ostersonntag (Gauß / anonymer gregorianischer Algorithmus) – als Date (lokal, 12 Uhr)
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}
const easterT = (y) => { const e = easterSunday(y); return utc(e.getFullYear(), e.getMonth() + 1, e.getDate()); };
const firstAdvent = (y) => { const t24 = utc(y, 12, 24); return t24 - dow(t24) * DAY - 21 * DAY; };

// theme = Deko-Typ; prio: höher gewinnt bei Überschneidung; range(y) → [von, bis] als UTC-Tageswert
export const EVENTS = [
  { id: 'neujahr', name: 'Neujahr', theme: 'confetti', prio: 100, range: (y) => [utc(y, 1, 1), utc(y, 1, 1)] },
  { id: 'valentin', name: 'Valentinstag', theme: 'hearts', prio: 95, range: (y) => [utc(y, 2, 14), utc(y, 2, 14)] },
  { id: 'fasching', name: 'Fasching', theme: 'confetti', prio: 80, range: (y) => [easterT(y) - 52 * DAY, easterT(y) - 47 * DAY] },
  { id: 'ostern', name: 'Ostern', theme: 'eggs', prio: 80, range: (y) => [easterT(y) - 2 * DAY, easterT(y) + 1 * DAY] },
  { id: 'mai', name: '1. Mai', theme: 'petals', prio: 80, range: (y) => [utc(y, 5, 1), utc(y, 5, 1)] },
  {
    id: 'oktoberfest', name: 'Oktoberfest', theme: 'bunting', prio: 70, range: (y) => {
      const s15 = utc(y, 9, 15), start = s15 + (((6 - dow(s15) + 7) % 7) || 7) * DAY; // Samstag nach dem 15.
      const o1 = utc(y, 10, 1); let end = o1 + ((7 - dow(o1)) % 7) * DAY; // erster Sonntag im Oktober
      if (end <= utc(y, 10, 2)) end = utc(y, 10, 3);
      return [start, end];
    },
  },
  { id: 'einheit', name: 'Tag der Deutschen Einheit', theme: 'flag', prio: 90, range: (y) => [utc(y, 10, 3), utc(y, 10, 3)] },
  { id: 'halloween', name: 'Halloween', theme: 'spooky', prio: 85, range: (y) => [utc(y, 10, 25), utc(y, 10, 31)] },
  { id: 'martin', name: 'St. Martin', theme: 'lantern', prio: 85, range: (y) => [utc(y, 11, 11), utc(y, 11, 11)] },
  { id: 'nikolaus', name: 'Nikolaus', theme: 'snow', prio: 95, range: (y) => [utc(y, 12, 6), utc(y, 12, 6)] },
  { id: 'weihnachten', name: 'Weihnachten', theme: 'snow', prio: 100, range: (y) => [utc(y, 12, 24), utc(y, 12, 26)] },
  { id: 'silvester', name: 'Silvester', theme: 'confetti', prio: 100, range: (y) => [utc(y, 12, 31), utc(y, 12, 31)] },
  { id: 'advent', name: 'Advent', theme: 'snow', prio: 50, range: (y) => [firstAdvent(y), utc(y, 12, 23)] },
  { id: 'winter', name: 'Winter', theme: 'snow', prio: 10, light: true, range: (y) => [utc(y, 1, 2), utc(y, 1, 31)] },
  { id: 'winter', name: 'Winter', theme: 'snow', prio: 10, light: true, range: (y) => [utc(y, 12, 1), utc(y, 12, 31)] },
];

// Passendes Event für ein Datum (oder null). Bei Advent: .advent = 1–4, bei Halloween: .peak = true am 31.10.
export function currentEvent(date = new Date()) {
  const t = dayNo(date), y = date.getFullYear();
  let best = null;
  for (const e of EVENTS) {
    const [a, b] = e.range(y);
    if (t < a || t > b || (best && best.prio >= e.prio)) continue;
    best = e;
  }
  if (!best) return null;
  const out = { id: best.id, name: best.name, theme: best.theme, light: !!best.light };
  if (best.id === 'advent') out.advent = Math.floor((t - firstAdvent(y)) / (7 * DAY)) + 1;
  if (best.id === 'halloween') out.peak = date.getMonth() === 9 && date.getDate() === 31;
  return out;
}

const HATS = { advent: 'santa', nikolaus: 'santa', weihnachten: 'santa', halloween: 'witch', silvester: 'party', neujahr: 'party', fasching: 'party' };
export const eventHat = (id) => HATS[id] || null;

const GREET = {
  neujahr: 'Frohes neues Jahr – auf ein starkes Jahr!',
  valentin: 'Happy Valentinstag – Liebe zum Eisen!',
  fasching: 'Helau & Alaaf – Fasching im Gym!',
  ostern: 'Frohe Ostern – such dir ein paar Wiederholungen!',
  mai: 'Schönen 1. Mai – Frühlingspump!',
  oktoberfest: 'O’zapft is – Maß heben, aber Hanteln!',
  einheit: 'Schönen Tag der Deutschen Einheit!',
  halloween: 'Happy Halloween – Gruselpump!',
  martin: 'Schönen St. Martin – Laternen-Laufrunde?',
  nikolaus: 'Fröhlichen Nikolaus – hast du brav trainiert?',
  weihnachten: 'Frohe Weihnachten!',
  silvester: 'Guten Rutsch – letzte Session des Jahres!',
};
const ADV = ['', 'Erster', 'Zweiter', 'Dritter', 'Vierter'];
export function eventGreeting(date = new Date()) {
  const e = currentEvent(date);
  if (!e) return null;
  if (e.id === 'advent') return `${ADV[e.advent]} Advent – Zeit für Plätzchen-Kalorien!`;
  if (e.id === 'winter') return date.getMonth() === 0 ? 'Winterpump – bleib in Bewegung!' : 'Winterzeit – Training wärmt!';
  return GREET[e.id] || null;
}

// ---------- Aktivierung (DOM nur hier) ----------
let featureFn = null;
let cfgLoaded = null;
const loadCfg = () => (cfgLoaded ||= import('./config.js').then((m) => { featureFn = m.feature; }).catch(() => {}));
export const eventsEnabled = () => !state.settings?.simple && (!featureFn || featureFn('events') !== false);

// Event-Hut für Kämpfer (nur Anzeige); null wenn aus oder kein Hut
export function activeEventHat() {
  if (typeof document === 'undefined' || !eventsEnabled()) return null;
  const id = document.documentElement.dataset.event;
  return id ? eventHat(id) : null;
}

const r = (i, n, m) => ((i * n) % m);
const P = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');
const st = (o) => Object.entries(o).map(([k, v]) => `--${k}:${v}`).join(';');

function particles(ev) {
  const light = ev.light;
  switch (ev.theme) {
    case 'snow': return P(light ? 12 : 26, (i) => `<i style="${st({ x: (i * 37 % 100) + '%', d: (7 + r(i, 3, 7)) + 's', dl: '-' + (r(i, 5, 11)) + 's', s: (3 + r(i, 2, 5)) + 'px', dx: (r(i, 7, 40) - 20) + 'px' })}"></i>`);
    case 'confetti': return P(26, (i) => `<i style="${st({ x: (i * 41 % 100) + '%', d: (5 + r(i, 3, 6)) + 's', dl: '-' + r(i, 5, 9) + 's', c: ['#ffd23f', '#e46aa8', '#4fc3f7', '#7bd88f', '#ff7a45'][i % 5], dx: (r(i, 9, 50) - 25) + 'px', rot: (r(i, 53, 360)) + 'deg' })}"></i>`);
    case 'hearts': return P(12, (i) => `<i style="${st({ x: (i * 29 % 96) + '%', d: (8 + r(i, 3, 6)) + 's', dl: '-' + r(i, 5, 10) + 's', s: (11 + r(i, 3, 10)) + 'px' })}">♥</i>`);
    case 'eggs': return P(8, (i) => `<i style="${st({ x: (i * 13 % 100) + '%', d: (9 + r(i, 3, 5)) + 's', dl: '-' + r(i, 5, 10) + 's', c: ['#ffd23f', '#e46aa8', '#7bd88f', '#4fc3f7'][i % 4] })}"></i>`);
    case 'petals': return P(12, (i) => `<i style="${st({ x: (i * 31 % 100) + '%', d: (8 + r(i, 3, 5)) + 's', dl: '-' + r(i, 5, 10) + 's', dx: (r(i, 7, 50) - 25) + 'px' })}"></i>`);
    case 'spooky': return `<b class="bat" style="--y:12%;--d:9s;--dl:-1s"></b><b class="bat" style="--y:28%;--d:12s;--dl:-6s;--sc:.7"></b><b class="bat" style="--y:44%;--d:15s;--dl:-10s;--sc:.55"></b><span class="pk l">🎃</span><span class="pk r">🕸️</span>`;
    case 'lantern': return P(6, (i) => `<i style="${st({ x: (8 + i * 17) + '%', d: (4 + r(i, 3, 3)) + 's', dl: '-' + r(i, 2, 4) + 's' })}"></i>`);
    case 'bunting': case 'flag': return `<div class="flags">${P(10, (i) => `<i style="--i:${i}"></i>`)}</div>` + (ev.theme === 'bunting' ? `<span class="pk l">🥨</span>` : '');
  }
  return '';
}
export const introParticles = (ev) => particles(ev);

export async function applyEvent() {
  if (typeof document === 'undefined') return null;
  await loadCfg();
  const root = document.documentElement;
  const ev = eventsEnabled() ? currentEvent() : null;
  let layer = document.querySelector('.ev-layer');
  if (!ev) {
    delete root.dataset.event; delete root.dataset.eventTheme;
    layer?.remove();
    return null;
  }
  root.dataset.event = ev.id;
  root.dataset.eventTheme = ev.theme;
  if (!layer) { layer = document.createElement('div'); layer.className = 'ev-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); }
  const key = ev.id + ev.theme;
  if (layer.dataset.key !== key) { layer.dataset.key = key; layer.className = `ev-layer t-${ev.theme}${ev.light ? ' light' : ''}`; layer.innerHTML = particles(ev); }
  return ev;
}
