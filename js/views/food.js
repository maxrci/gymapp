// Ernährung: Tagesübersicht (gegessen, Ziel, Verbrauch), Mahlzeiten, Hinzufügen per Suche, Barcode, Favoriten,
// eigenen Produkten und Gerichten. Nur sichtbar, wenn Ernährungs-Tracking in den Einstellungen an ist.

import { state, saveSettings } from '../store.js';
import { pageHead, emptyState } from '../components.js';
import { icon, overlay, toast, toastAction, formDialog, sheet } from '../ui.js';
import { esc, num } from '../utils.js';
import { api, loggedIn } from '../sync.js';
import {
  MEALS, NUTRIENTS, dayId, dayStart, dayOf, loadFood, onFood, addEntry, updateEntry, removeEntry, restoreEntry, entryNutrients, totals,
  lib, favorites, isFav, toggleFav, saveCustom, saveDish, deleteDish, deleteCustom, productKey, cleanPer100,
} from '../food.js';
import { swipeToDelete } from '../swipe.js';
import { searchBasics } from '../foodbasics.js';
import { coachOn, bodyComplete } from '../coach/core.js';
import { weekPlan } from '../coach/plan.js';
import { nutrition } from '../coach/nutrition.js';
import { openCoachSetup } from '../coach/setup.js';
import { stepsOn, stepsKcal } from '../steps.js';

const ui = { day: null };
let rerenderRef = null;
onFood(() => { if (location.hash.startsWith('#/food')) rerenderRef?.(); });
let foodReady = false;
loadFood().then(() => { foodReady = true; });

// Ziele und Verbrauch für einen Tag
const kgNow = () => Number(state.settings.bodyweight) || 75;
export function foodTargets(t = Date.now()) {
  const n = bodyComplete() ? nutrition(coachOn() ? weekPlan() : null, t) : null;
  const goal = Number(state.settings.foodGoal) || n?.kcal || null;
  // Schritte bekannt? Dann Grundumsatz × 1,2 (sitzend) + Schritte statt pauschalem Alltagsfaktor
  const st = stepsOn(dayId(t));
  const burned = n ? Math.round((st != null ? n.bmr * 1.2 + stepsKcal(st, kgNow()) : n.base) + n.items.filter((i) => i.done).reduce((a, i) => a + i.kcal, 0)) : null;
  const sc = n && goal ? goal / n.kcal : 1;
  return { goal, burned, steps: st, n, protein: n ? Math.round(n.protein * sc) : null, carbs: n ? Math.round(n.carbs * sc) : null, fat: n ? Math.round(n.fat * sc) : null };
}

const ring = (val, goal) => {
  const p = goal ? Math.min(1, val / goal) : 0;
  const over = goal && val > goal;
  return `<div class="fd-ring ${over ? 'over' : ''}" style="--p:${Math.round(p * 100)}"><b>${num(val, 0)}</b><small>${goal ? `von ${num(goal, 0)} kcal` : 'kcal'}</small></div>`;
};
const macro = (l, v, g, cls) => `<div class="fd-m ${cls}"><small>${l}</small><b>${num(v, 0)}${g ? ` / ${num(g, 0)}` : ''} g</b><div class="bar"><i style="width:${g ? Math.min(100, (v / g) * 100) : 0}%"></i></div></div>`;

export function foodView() {
  if (!state.settings.food) {
    return { html: pageHead('Ernährung', { back: '#/' }) + emptyState('heart', 'Ernährung ist aus', 'Schalte das Tracking unter Profil → App personalisieren ein, wenn du Essen erfassen möchtest.', '<a class="btn primary" href="#/settings/app">Zu den Einstellungen</a>') };
  }
  if (!foodReady) return { html: pageHead('Ernährung', { back: '#/' }) + '<div class="chart-empty">Lade…</div>', mount: () => loadFood().then(() => { foodReady = true; window.dispatchEvent(new HashChangeEvent('hashchange')); }) };
  const id = ui.day || dayId();
  const d = dayOf(id);
  const tot = totals(d.entries);
  const T = foodTargets(dayStart(id));
  const isToday = id === dayId();
  const label = isToday ? 'Heute' : id === dayId(Date.now() - 864e5) ? 'Gestern' : new Date(dayStart(id)).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  const meals = MEALS.map(([k, l, ic]) => {
    const es = d.entries.filter((e) => e.meal === k);
    const kc = totals(es).kcal;
    return `<section class="card fd-meal">
      <div class="fd-mh"><span class="fd-mi">${icon(ic, 'xs')}</span><b>${l}</b><small>${es.length ? `${num(kc, 0)} kcal` : ''}</small><button class="btn ghost sm" data-add="${k}">${icon('plus', 'xs')} Hinzufügen</button></div>
      ${es.length ? `<div class="fd-list">${es.map((e) => `<button class="fd-row" data-entry="${esc(e.id)}"><span class="fd-n">${esc(e.name)}${e.brand ? `<small>${esc(e.brand)}</small>` : ''}</span><span class="fd-a">${e.unit === 'portion' ? `${num(e.amount, 1)} Port.` : `${num(e.amount, 0)} g`}</span><b>${num(entryNutrients(e).kcal, 0)}</b></button>`).join('')}</div>` : ''}
    </section>`;
  }).join('');
  const html = `${pageHead('Ernährung', { back: '#/' })}
    <div class="fd-day"><button class="icon-btn" data-dn="-1" aria-label="Vortag">${icon('left')}</button><b>${esc(label)}</b><button class="icon-btn" data-dn="1" ${isToday ? 'disabled' : ''} aria-label="Nächster Tag">${icon('right')}</button></div>
    <section class="card fd-sum">
      ${ring(tot.kcal, T.goal)}
      <div class="fd-side">
        ${T.goal ? `<div class="fd-rest"><small>${tot.kcal > T.goal ? 'Über dem Ziel' : 'Noch übrig'}</small><b>${num(Math.abs(T.goal - tot.kcal), 0)} kcal</b></div>` : ''}
        ${T.burned ? `<div class="fd-burn"><small>Verbraucht${isToday ? ' bisher' : ''}</small><b>${num(T.burned, 0)} kcal</b>${T.steps != null ? `<small>inkl. ${num(T.steps, 0)} Schritte</small>` : ''}</div>` : ''}
      </div>
      <div class="fd-macros">${macro('Eiweiß', tot.protein, T.protein, 'p')}${macro('Kohlenhydrate', tot.carbs, T.carbs, 'c')}${macro('Fett', tot.fat, T.fat, 'f')}</div>
      ${T.n ? `<button class="link-btn sm" data-act="why">${icon('info', 'xs')} So rechnet der Coach</button>` : `<button class="btn ghost sm block" data-act="body">Körperdaten ergänzen – für Ziel und Verbrauch</button>`}
    </section>
    ${meals}
    ${d.entries.length ? `<section class="card fd-more"><div class="card-title">Alle Nährwerte</div>${NUTRIENTS.map(([k, l, u, dec]) => `<div class="fd-nr"><span>${l}</span><b>${num(tot[k], dec)} ${u}</b></div>`).join('')}</section>` : ''}
    <div class="set-group">
      <button class="set-item" data-act="dishes"><span class="si-ic">${icon('layers')}</span><span class="si-l">Meine Gerichte & Produkte</span>${icon('right', 'muted')}</button>
      <button class="set-item" data-act="goal"><span class="si-ic">${icon('target')}</span><span class="si-l">Kalorienziel</span><span class="si-v">${state.settings.foodGoal ? `${num(state.settings.foodGoal, 0)} kcal` : T.n ? 'vom Coach' : 'nicht gesetzt'}</span>${icon('right', 'muted')}</button>
    </div>
    <p class="footnote">Nährwerte aus der Datenbank stammen von <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> (Lizenz ODbL). Dein Tagebuch siehst nur du. Richtwerte – keine Ernährungsberatung.</p>`;
  return {
    html,
    mount: (root) => {
      swipeToDelete(root, '.fd-row', async (el) => {
        const r = await removeEntry(id, el.dataset.entry);
        if (r) toastAction(`„${r.e.name}“ entfernt`, 'Rückgängig', () => restoreEntry(id, r.e, r.i));
      });
    },
    clicks: {
      dn: (el, rr) => { const t = dayStart(id) + Number(el.dataset.dn) * 864e5 + 3600e3; ui.day = dayId(Math.min(t, Date.now())); rr(); },
      add: (el) => openAddFood(id, el.dataset.add),
      entry: (el) => editEntry(id, el.dataset.entry),
    },
    handlers: {
      body: () => openCoachSetup('body'),
      why: () => {
        const n = T.n;
        sheet({ title: 'So rechnet der Coach', message: `Grundumsatz ${n.bmr} kcal (aus Gewicht, Größe, Alter, Geschlecht) × Alltag = ${n.base} kcal.\nTraining heute: +${n.train} kcal (aus deinen Übungen, Cardio-Strecken und Dauer).\nZiel-Anpassung: ${n.adj > 0 ? '+' : ''}${n.adj} kcal (${n.goalText}).\nEiweiß ${n.proteinPerKg} g pro kg Körpergewicht.\n\nRichtwerte – keine Ernährungsberatung.`, options: [{ label: 'Körperdaten ändern', value: 'b', icon: 'user' }] }).then((v) => { if (v) openCoachSetup('body'); });
      },
      goal: async () => {
        const r = await formDialog({ title: 'Kalorienziel', fields: [{ name: 'k', label: `kcal pro Tag (leer = ${T.n ? 'vom Coach berechnet' : 'kein Ziel'})`, inputmode: 'numeric', value: state.settings.foodGoal || '' }] });
        if (!r) return;
        const v = parseInt(r.k, 10);
        await saveSettings({ foodGoal: v >= 800 && v <= 8000 ? v : null });
      },
      dishes: () => openLibrary(),
    },
    onShow: (rr) => { rerenderRef = rr; },
  };
}

// ---------- Eintrag bearbeiten ----------
async function editEntry(id, eid) {
  const e = dayOf(id).entries.find((x) => x.id === eid);
  if (!e) return;
  const r = await formDialog({ title: e.name, fields: [{ name: 'a', label: e.unit === 'portion' ? 'Portionen' : 'Menge in Gramm', inputmode: 'decimal', value: e.amount }, { name: 'm', label: 'Mahlzeit', type: 'select', value: e.meal, options: MEALS.map(([v, l]) => ({ value: v, label: l })) }] });
  if (!r) return;
  const a = parseFloat(String(r.a).replace(',', '.'));
  if (a > 0) await updateEntry(id, eid, { amount: Math.min(5000, a), meal: r.m });
}

// ---------- Menge wählen (mit allen Nährwerten) ----------
function amountDialog(p, { title = 'Hinzufügen', initial } = {}) {
  return new Promise((resolve) => {
    const portion = p.dish ? 1 : p.serving || null;
    let amount = initial ?? (p.dish ? 1 : portion || 100);
    const o = overlay('', 'amount-view');
    const per = p.dish ? p.perPortion : p.per100;
    const draw = () => {
      const f = p.dish ? amount : amount / 100;
      o.innerHTML = `<div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">${esc(title)}</div><button class="icon-btn am-fav ${isFav(p) ? 'on' : ''}" data-fav aria-label="Favorit">${isFav(p) ? '★' : '☆'}</button></div>
        <div class="panel-body">
          <h2 class="am-name">${esc(p.name)}</h2>${p.brand ? `<p class="am-brand">${esc(p.brand)}</p>` : ''}
          <div class="am-amt"><button class="icon-btn" data-step="-1">−</button><label><input data-amt inputmode="decimal" value="${num(amount, p.dish ? 1 : 0)}"><span>${p.dish ? 'Portionen' : 'g'}</span></label><button class="icon-btn" data-step="1">+</button></div>
          <div class="chips">${p.dish ? [0.5, 1, 1.5, 2].map((x) => `<button class="chip ${amount === x ? 'on' : ''}" data-q="${x}">${x} Port.</button>`).join('') : [50, 100, 150, 200, 250].map((x) => `<button class="chip ${amount === x ? 'on' : ''}" data-q="${x}">${x} g</button>`).join('') + (portion ? `<button class="chip" data-q="${portion}">1 Portion (${num(portion, 0)} g)</button>` : '')}</div>
          <section class="card am-nut"><div class="am-kcal"><b>${num((per.kcal || 0) * f, 0)}</b> kcal</div>
            ${NUTRIENTS.slice(1).map(([k, l, u, dec]) => `<div class="fd-nr"><span>${l}</span><b>${per[k] == null ? '–' : `${num(per[k] * f, dec)} ${u}`}</b></div>`).join('')}
            <p class="footnote">${p.dish ? 'pro gewählter Menge' : `pro ${num(amount, 0)} g · je 100 g: ${num(per.kcal || 0, 0)} kcal`}</p></section>
          <button class="btn primary block lg" data-ok>${esc(title)}</button>
        </div>`;
    };
    draw();
    const done = (v) => { o.close(); resolve(v); };
    o.addEventListener('click', async (e) => {
      const b = (s) => e.target.closest(s);
      if (b('[data-close]')) return done(null);
      if (b('[data-fav]')) { const on = await toggleFav(p); toast(on ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt'); return draw(); }
      if (b('[data-q]')) { amount = Number(b('[data-q]').dataset.q); return draw(); }
      if (b('[data-step]')) { amount = Math.max(p.dish ? 0.5 : 5, amount + Number(b('[data-step]').dataset.step) * (p.dish ? 0.5 : 10)); return draw(); }
      if (b('[data-ok]')) { const v = parseFloat(String(o.querySelector('[data-amt]').value).replace(',', '.')); return done(v > 0 ? Math.min(5000, v) : amount); }
    });
    o.addEventListener('change', (e) => { if (e.target.matches('[data-amt]')) { const v = parseFloat(String(e.target.value).replace(',', '.')); if (v > 0) { amount = Math.min(5000, v); draw(); } } });
  });
}

// ---------- Hinzufügen: Suche, Barcode, Favoriten, Gerichte, eigene ----------
const TABS = [['search', 'Suchen'], ['fav', 'Favoriten'], ['dish', 'Gerichte'], ['own', 'Eigene']];
const row = (p, i) => `<button class="fd-pick" data-pick="${i}"><span class="fd-n">${esc(p.name)}<small>${esc([p.brand, p.dish ? `${p.portions} Portionen` : ''].filter(Boolean).join(' · '))}</small></span><span class="fd-k">${num((p.dish ? p.perPortion?.kcal : p.per100?.kcal) || 0, 0)}<small>${p.dish ? 'kcal/Port.' : 'kcal/100 g'}</small></span></button>`;

export function openAddFood(id, meal, { onPick } = {}) {
  const o = overlay('', 'addfood-view');
  let tab = 'search', q = '', remote = [], loading = false, err = '', shown = [], t = null;
  const local = () => {
    const l = lib();
    const s = q.trim().toLowerCase();
    const all = [...l.custom, ...l.dishes, ...l.recent.filter((x) => !x.dish)];
    const seen = new Set();
    return all.filter((p) => { const k = productKey(p); if (seen.has(k)) return false; seen.add(k); return !s || p.name.toLowerCase().includes(s) || (p.brand || '').toLowerCase().includes(s); }).slice(0, s ? 30 : 15);
  };
  const listHtml = () => {
    if (tab === 'fav') shown = favorites().map((f) => (f.dish ? lib().dishes.find((d) => d.id === f.id) || null : f)).filter(Boolean);
    else if (tab === 'dish') shown = lib().dishes;
    else if (tab === 'own') shown = lib().custom;
    else { const loc = local(); const bas = q.trim().length >= 2 ? searchBasics(q).filter((b) => !loc.some((x) => productKey(x) === productKey(b))) : []; shown = [...bas, ...loc, ...remote.filter((r) => !loc.some((x) => productKey(x) === productKey(r)))]; }
    const head = tab === 'search' && !q ? '<div class="list-label">Zuletzt</div>' : '';
    const empty = tab === 'fav' ? 'Noch keine Favoriten – tippe beim Hinzufügen auf ☆.' : tab === 'dish' ? 'Noch keine Gerichte.' : tab === 'own' ? 'Noch keine eigenen Produkte.' : q.length >= 2 ? (loading ? 'Suche…' : err || 'Nichts gefunden – lege ein eigenes Produkt an.') : 'Tippe einen Namen ein oder scanne den Barcode.';
    return `${head}${shown.length ? `<div class="fd-picks">${shown.map(row).join('')}</div>` : `<p class="footnote">${esc(empty)}</p>`}${tab === 'search' && loading ? '<p class="footnote">Suche in der Datenbank…</p>' : ''}`;
  };
  const draw = () => {
    o.innerHTML = `<div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">${esc((MEALS.find(([k]) => k === meal) || [])[1] || 'Hinzufügen')}</div><span style="width:40px"></span></div>
      <div class="panel-body">
        <div class="seg">${TABS.map(([k, l]) => `<button class="seg-btn ${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
        ${tab === 'search' ? `<div class="fd-searchrow"><div class="h-search">${icon('search', 'xs')}<input type="search" data-q placeholder="Lebensmittel suchen" value="${esc(q)}" autocomplete="off"></div><button class="btn primary" data-scan aria-label="Barcode scannen">▥ Scan</button></div>` : ''}
        ${tab === 'dish' ? '<button class="btn ghost block" data-newdish>+ Gericht anlegen</button>' : ''}
        ${tab === 'own' || tab === 'search' ? '<button class="btn ghost block" data-newown>+ Eigenes Produkt anlegen</button>' : ''}
        <div data-list>${listHtml()}</div>
      </div>`;
    const inp = o.querySelector('[data-q]');
    if (inp) {
      inp.addEventListener('input', () => { q = inp.value; clearTimeout(t); o.querySelector('[data-list]').innerHTML = listHtml(); t = setTimeout(search, 450); });
      if (!q) setTimeout(() => inp.focus(), 60);
    }
  };
  async function search() {
    if (q.trim().length < 2 || !loggedIn()) { remote = []; err = loggedIn() ? '' : 'Die Datenbank-Suche braucht den Gruppen-Server.'; return refreshList(); }
    loading = true; refreshList();
    try { remote = (await api('GET', `/api/food/search?q=${encodeURIComponent(q.trim())}`)).products || []; err = ''; } catch (e) { remote = []; err = e.message; }
    loading = false; refreshList();
  }
  const refreshList = () => { const b = o.querySelector('[data-list]'); if (b) b.innerHTML = listHtml(); };
  const pick = async (p) => {
    if (onPick) { o.close(); return onPick(p); }
    const a = await amountDialog(p);
    if (!a) return;
    await addEntry(id, meal, p, a);
    toast(`${p.name} hinzugefügt`);
    o.close();
  };
  o.addEventListener('click', async (e) => {
    const b = (s) => e.target.closest(s);
    if (b('[data-close]')) return o.close();
    if (b('[data-tab]')) { tab = b('[data-tab]').dataset.tab; return draw(); }
    if (b('[data-pick]')) return pick(shown[Number(b('[data-pick]').dataset.pick)]);
    if (b('[data-scan]')) {
      const { scanBarcode } = await import('../scanner.js');
      const code = await scanBarcode();
      if (!code) return;
      if (!loggedIn()) return toast('Für die Barcode-Suche braucht es den Gruppen-Server.');
      try {
        const r = await api('GET', `/api/food/code/${code}`);
        if (r.product) return pick(r.product);
        const own = lib().custom.find((x) => x.code === code);
        if (own) return pick(own);
        toast('Produkt nicht in der Datenbank – leg es einfach selbst an.', 4000);
        return newOwn({ code });
      } catch (x) { toast(x.message, 4000); }
      return;
    }
    if (b('[data-newown]')) return newOwn({ name: q });
    if (b('[data-newdish]')) return editDish(null, () => { tab = 'dish'; draw(); });
  });
  async function newOwn(pre = {}) {
    const p = await productForm(pre);
    if (!p) return;
    const item = await saveCustom(p);
    if (pre.code) item.code = pre.code;
    pick(item);
  }
  draw();
  return o;
}

// eigenes Produkt (Nährwerte pro 100 g)
async function productForm(pre = {}) {
  const r = await formDialog({ title: 'Eigenes Produkt', okLabel: 'Speichern', fields: [
    { name: 'name', label: 'Name', value: pre.name || '' },
    { name: 'brand', label: 'Marke (optional)', value: pre.brand || '' },
    ...NUTRIENTS.map(([k, l, u]) => ({ name: k, label: `${l} pro 100 g (${u})`, inputmode: 'decimal', value: pre.per100?.[k] ?? '' })),
    { name: 'serving', label: 'Portion in g (optional)', inputmode: 'decimal', value: pre.serving || '' },
  ] });
  if (!r) return null;
  if (!r.name.trim()) { toast('Bitte einen Namen eingeben'); return null; }
  const per100 = cleanPer100(Object.fromEntries(NUTRIENTS.map(([k]) => [k, String(r[k]).replace(',', '.')])));
  if (per100.kcal == null) { toast('Bitte mindestens die Kalorien angeben'); return null; }
  return { id: pre.id, name: r.name.trim(), brand: r.brand.trim(), per100, serving: parseFloat(String(r.serving).replace(',', '.')) || null, code: pre.code };
}

// Gericht aus Zutaten
function editDish(dish, after) {
  const o = overlay('', 'dish-view');
  const d = dish ? structuredClone(dish) : { name: '', portions: 2, items: [] };
  const draw = () => {
    const per = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    const t = totals(d.items.map((i) => ({ amount: i.grams, unit: 'g', per100: i.per100 })));
    const p = Math.max(1, Number(d.portions) || 1);
    for (const k of Object.keys(per)) per[k] = t[k] / p;
    o.innerHTML = `<div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">${dish ? 'Gericht bearbeiten' : 'Neues Gericht'}</div><span style="width:40px"></span></div>
      <div class="panel-body">
        <label class="field"><span>Name</span><input data-name value="${esc(d.name)}" placeholder="z. B. Mamas Lasagne"></label>
        <label class="field"><span>Ergibt Portionen</span><input data-por inputmode="decimal" value="${esc(d.portions)}"></label>
        <div class="list-label">Zutaten</div>
        <div class="set-group">${d.items.map((i, k) => `<div class="fd-ing"><span class="fd-n">${esc(i.name)}</span><input data-g="${k}" inputmode="decimal" value="${num(i.grams, 0)}"> g<button class="btn ghost sm" data-rm="${k}">✕</button></div>`).join('') || '<p class="footnote">Noch keine Zutaten.</p>'}
          <button class="set-item" data-ing><span class="si-ic">${icon('plus')}</span><span class="si-l">Zutat hinzufügen</span></button></div>
        <section class="card"><div class="card-title">Pro Portion</div><div class="fd-nr"><span>Kalorien</span><b>${num(per.kcal, 0)} kcal</b></div><div class="fd-nr"><span>Eiweiß</span><b>${num(per.protein, 1)} g</b></div><div class="fd-nr"><span>Kohlenhydrate</span><b>${num(per.carbs, 1)} g</b></div><div class="fd-nr"><span>Fett</span><b>${num(per.fat, 1)} g</b></div></section>
        <button class="btn primary block lg" data-save>Speichern</button>
        ${dish ? '<button class="btn ghost block danger" data-del>Gericht löschen</button>' : ''}
      </div>`;
  };
  const sync = () => { d.name = o.querySelector('[data-name]')?.value ?? d.name; d.portions = parseFloat(String(o.querySelector('[data-por]')?.value ?? d.portions).replace(',', '.')) || 1; o.querySelectorAll('[data-g]').forEach((x) => { d.items[Number(x.dataset.g)].grams = parseFloat(String(x.value).replace(',', '.')) || 0; }); };
  draw();
  o.addEventListener('click', async (e) => {
    const b = (s) => e.target.closest(s);
    if (b('[data-close]')) return o.close();
    sync();
    if (b('[data-rm]')) { d.items.splice(Number(b('[data-rm]').dataset.rm), 1); return draw(); }
    if (b('[data-ing]')) {
      openAddFood(null, null, { onPick: async (p) => {
        if (p.dish) { toast('Bitte einzelne Zutaten wählen'); return; }
        const g = await amountDialog(p, { title: 'Als Zutat übernehmen' });
        if (!g) return;
        d.items.push({ name: p.name, grams: g, per100: cleanPer100(p.per100) });
        draw();
      } });
      return;
    }
    if (b('[data-save]')) {
      if (!d.name.trim()) return toast('Bitte einen Namen eingeben');
      if (!d.items.length) return toast('Mindestens eine Zutat hinzufügen');
      await saveDish(d); toast('Gericht gespeichert'); o.close(); after?.(); return;
    }
    if (b('[data-del]')) { await deleteDish(d.id); toast('Gericht gelöscht'); o.close(); after?.(); }
  });
  o.addEventListener('input', () => { /* Werte erst beim Speichern übernehmen */ });
  o.addEventListener('change', () => { sync(); draw(); });
}

// Gerichte & eigene Produkte verwalten
function openLibrary() {
  const o = overlay('', 'foodlib-view');
  const draw = () => {
    const l = lib();
    o.innerHTML = `<div class="panel-head"><button class="icon-btn" data-close>${icon('x')}</button><div class="panel-title">Gerichte & Produkte</div><span style="width:40px"></span></div>
      <div class="panel-body">
        <div class="list-label">Gerichte</div>
        <div class="set-group">${l.dishes.map((d) => `<button class="set-item" data-dish="${esc(d.id)}"><span class="si-l">${esc(d.name)}<small class="si-sub">${d.portions} Portionen · ${num(d.perPortion?.kcal || 0, 0)} kcal pro Portion</small></span>${icon('right', 'muted')}</button>`).join('')}
          <button class="set-item" data-newdish><span class="si-ic">${icon('plus')}</span><span class="si-l">Gericht anlegen</span></button></div>
        <div class="list-label">Eigene Produkte</div>
        <div class="set-group">${l.custom.map((p) => `<button class="set-item" data-own="${esc(p.id)}"><span class="si-l">${esc(p.name)}<small class="si-sub">${num(p.per100?.kcal || 0, 0)} kcal / 100 g</small></span>${icon('right', 'muted')}</button>`).join('') || '<p class="footnote">Noch keine – beim Hinzufügen „Eigenes Produkt anlegen“.</p>'}</div>
      </div>`;
  };
  draw();
  o.addEventListener('click', async (e) => {
    const b = (s) => e.target.closest(s);
    if (b('[data-close]')) return o.close();
    if (b('[data-newdish]')) return editDish(null, draw);
    if (b('[data-dish]')) return editDish(lib().dishes.find((d) => d.id === b('[data-dish]').dataset.dish), draw);
    if (b('[data-own]')) {
      const p = lib().custom.find((x) => x.id === b('[data-own]').dataset.own);
      const v = await sheet({ title: p.name, options: [{ label: 'Bearbeiten', value: 'edit', icon: 'edit' }, { label: 'Löschen', value: 'del', icon: 'trash', danger: true }] });
      if (v === 'edit') { const n = await productForm(p); if (n) { await saveCustom({ ...n, id: p.id }); draw(); } }
      if (v === 'del') { await deleteCustom(p.id); draw(); }
    }
  });
}
