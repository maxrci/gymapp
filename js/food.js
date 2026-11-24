// Ernährungs-Tagebuch: ein Eintrag pro Tag (Frühstück, Mittag, Abend, Snacks), lokal gespeichert und nur mit dem
// eigenen Konto abgeglichen – nie in Gruppen sichtbar. Eigene Produkte, Gerichte, Favoriten liegen in den Einstellungen.

import * as db from './db.js';
import { state, hooks, saveSettings } from './store.js';
import { uid } from './utils.js';

export const MEALS = [['breakfast', 'Frühstück', 'sun'], ['lunch', 'Mittagessen', 'clock'], ['dinner', 'Abendessen', 'moon'], ['snack', 'Snacks', 'star']];
export const NUTRIENTS = [
  ['kcal', 'Kalorien', 'kcal', 0], ['protein', 'Eiweiß', 'g', 1], ['carbs', 'Kohlenhydrate', 'g', 1], ['sugar', 'davon Zucker', 'g', 1],
  ['fat', 'Fett', 'g', 1], ['satfat', 'davon gesättigt', 'g', 1], ['fiber', 'Ballaststoffe', 'g', 1], ['salt', 'Salz', 'g', 2],
];
const KEYS = NUTRIENTS.map(([k]) => k);
export const dayId = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const dayStart = (id) => { const [y, m, d] = id.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

const days = new Map();
let loaded = null;
export function loadFood() {
  loaded ??= db.getAll('kv').then((rows) => {
    for (const r of rows) if (typeof r.key === 'string' && r.key.startsWith('food:') && r.value?.day) days.set(r.value.day, r.value);
  }).catch(() => {});
  return loaded;
}
export const getDay = (id) => days.get(id) || null;
export const dayOf = (id) => days.get(id) || { day: id, entries: [] };

async function putDay(d, sync = true) {
  d.updated = Date.now();
  days.set(d.day, d);
  await db.kvSet(`food:${d.day}`, d);
  if (sync) { try { hooks.change?.('food', [d.day]); } catch { /* egal */ } }
  for (const f of listeners) f();
}
const listeners = new Set();
export const onFood = (f) => listeners.add(f);

// Nährwerte prüfen (pro 100 g)
const n0 = (v, max = 1000) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x * 100) / 100 : null; };
export function cleanPer100(p) {
  const o = {};
  for (const k of KEYS) o[k] = n0(p?.[k], k === 'kcal' ? 1000 : 100);
  return o;
}
export const productKey = (p) => (p.code ? `ean:${p.code}` : p.dish ? `dish:${p.id}` : `own:${p.id || p.name}`);

// Eintrag anlegen: amount in g (bzw. Portionen bei Gerichten, dann per100 = pro Portion und unit 'portion')
export async function addEntry(dayIdStr, meal, product, amount) {
  const d = structuredClone(dayOf(dayIdStr));
  const e = {
    id: uid(), meal, name: String(product.name || 'Lebensmittel').slice(0, 120), brand: String(product.brand || '').slice(0, 80),
    code: product.code || '', ref: productKey(product), amount: Math.max(0, Math.min(5000, Number(amount) || 0)),
    unit: product.dish ? 'portion' : 'g', per100: cleanPer100(product.dish ? product.perPortion : product.per100), at: Date.now(),
  };
  d.entries.push(e);
  await putDay(d);
  remember(product);
  return e;
}
export async function updateEntry(dayIdStr, id, patch) {
  const d = structuredClone(dayOf(dayIdStr));
  const e = d.entries.find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, patch);
  await putDay(d);
}
export async function removeEntry(dayIdStr, id) {
  const d = structuredClone(dayOf(dayIdStr));
  const i = d.entries.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [e] = d.entries.splice(i, 1);
  await putDay(d);
  return { e, i };
}
export async function restoreEntry(dayIdStr, e, i) {
  const d = structuredClone(dayOf(dayIdStr));
  d.entries.splice(Math.min(i, d.entries.length), 0, e);
  await putDay(d);
}

// Summen
export function entryNutrients(e) {
  const f = e.unit === 'portion' ? e.amount : e.amount / 100;
  return Object.fromEntries(KEYS.map((k) => [k, e.per100?.[k] != null ? e.per100[k] * f : 0]));
}
export function totals(entries) {
  const t = Object.fromEntries(KEYS.map((k) => [k, 0]));
  for (const e of entries) { const x = entryNutrients(e); for (const k of KEYS) t[k] += x[k]; }
  return t;
}

// Bibliothek (eigene Produkte, Gerichte, Favoriten, zuletzt benutzt) – in den Einstellungen, damit sie mitsynchronisiert
export const lib = () => ({ custom: [], dishes: [], fav: [], recent: [], ...(state.settings.foodLib || {}) });
const saveLib = (l) => saveSettings({ foodLib: l });
function remember(p) {
  const l = lib();
  const key = productKey(p);
  const snap = p.dish ? { dish: true, id: p.id, name: p.name } : { code: p.code || '', id: p.id || '', name: p.name, brand: p.brand || '', per100: cleanPer100(p.per100), serving: p.serving || null };
  l.recent = [snap, ...l.recent.filter((x) => productKey(x) !== key)].slice(0, 30);
  return saveLib(l);
}
export function isFav(p) { return lib().fav.includes(productKey(p)); }
export async function toggleFav(p) {
  const l = lib();
  const key = productKey(p);
  if (l.fav.includes(key)) l.fav = l.fav.filter((k) => k !== key);
  else {
    l.fav = [key, ...l.fav].slice(0, 200);
    if (!p.dish && !l.custom.some((x) => productKey(x) === key) && !l.recent.some((x) => productKey(x) === key)) remember(p);
    l.favData = { ...(l.favData || {}), [key]: p.dish ? { dish: true, id: p.id, name: p.name } : { code: p.code || '', id: p.id || '', name: p.name, brand: p.brand || '', per100: cleanPer100(p.per100), serving: p.serving || null } };
  }
  await saveLib(l);
  return l.fav.includes(key);
}
export function favorites() {
  const l = lib();
  return l.fav.map((k) => l.favData?.[k] || l.custom.find((x) => productKey(x) === k) || l.dishes.find((x) => productKey({ dish: true, id: x.id }) === k) || l.recent.find((x) => productKey(x) === k)).filter(Boolean);
}
export async function saveCustom(p) {
  const l = lib();
  const item = { id: p.id || uid(), name: String(p.name).slice(0, 120), brand: String(p.brand || '').slice(0, 80), per100: cleanPer100(p.per100), serving: n0(p.serving, 5000) };
  l.custom = [item, ...l.custom.filter((x) => x.id !== item.id)].slice(0, 500);
  await saveLib(l);
  return item;
}
export async function deleteCustom(id) { const l = lib(); l.custom = l.custom.filter((x) => x.id !== id); await saveLib(l); }

// Gericht aus Zutaten: Nährwerte pro Portion
export function dishNutrients(d) {
  const t = totals((d.items || []).map((i) => ({ amount: i.grams, unit: 'g', per100: i.per100 })));
  const p = Math.max(1, Number(d.portions) || 1);
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round((v / p) * 100) / 100]));
}
export async function saveDish(d) {
  const l = lib();
  const item = { id: d.id || uid(), dish: true, name: String(d.name).slice(0, 120), portions: Math.max(1, Math.min(50, Number(d.portions) || 1)), items: (d.items || []).slice(0, 60).map((i) => ({ name: String(i.name).slice(0, 120), grams: Math.max(0, Math.min(5000, Number(i.grams) || 0)), per100: cleanPer100(i.per100) })) };
  item.perPortion = dishNutrients(item);
  l.dishes = [item, ...l.dishes.filter((x) => x.id !== item.id)].slice(0, 200);
  await saveLib(l);
  return item;
}
export async function deleteDish(id) { const l = lib(); l.dishes = l.dishes.filter((x) => x.id !== id); await saveLib(l); }

// Vom Server (anderes Gerät) – lokale, noch nicht hochgeladene Änderungen haben Vorrang (prüft sync.js)
export async function applyFoodRemote(list) {
  await loadFood();
  for (const d of list) {
    if (!d || typeof d.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.day) || !Array.isArray(d.entries)) continue;
    const local = days.get(d.day);
    if (local && (local.updated || 0) > (d.updated || 0)) continue;
    const clean = { day: d.day, updated: Number(d.updated) || Date.now(), entries: d.entries.slice(0, 300).filter((e) => e && typeof e === 'object').map((e) => ({
      id: String(e.id || uid()).slice(0, 40), meal: MEALS.some(([k]) => k === e.meal) ? e.meal : 'snack', name: String(e.name || '').slice(0, 120), brand: String(e.brand || '').slice(0, 80),
      code: String(e.code || '').replace(/\D/g, '').slice(0, 14), ref: String(e.ref || '').slice(0, 80), amount: Math.max(0, Math.min(5000, Number(e.amount) || 0)),
      unit: e.unit === 'portion' ? 'portion' : 'g', per100: cleanPer100(e.per100), at: Number(e.at) || 0,
    })) };
    days.set(d.day, clean);
    await db.kvSet(`food:${d.day}`, clean);
  }
  for (const f of listeners) f();
}
