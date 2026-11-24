// Lebensmittel-Datenbank: Open Food Facts (offene Datenbank, Lizenz ODbL – Quellenangabe in der App).
// Der Server fragt stellvertretend an (Geräte bleiben unbekannt), speichert Ergebnisse 30 Tage zwischen und bremst Massenanfragen.

const BASE = () => (process.env.OFF_BASE || 'https://world.openfoodfacts.org').replace(/\/$/, '');
// neue Suche von Open Food Facts (die alte cgi/search.pl ist abgeschaltet)
const SEARCH = () => (process.env.OFF_SEARCH || 'https://search.openfoodfacts.org').replace(/\/$/, '');
const UA = 'GymSelfHosted/1.0 (private fitness app; open source)';
const TTL = 30 * 864e5;
const FIELDS = 'code,product_name,product_name_de,generic_name_de,brands,nutriments,serving_quantity,quantity,image_small_url';
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
const str = (v, m) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, m);

export function ensureFoodTables(D) {
  D.db.exec(`CREATE TABLE IF NOT EXISTS food_cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, fetched INTEGER NOT NULL)`);
}

// Produkt in ein schlankes, geprüftes Format bringen (Nährwerte pro 100 g/ml)
export function cleanProduct(p) {
  if (!p || typeof p !== 'object') return null;
  const n = p.nutriments || {};
  const kcal = num(n['energy-kcal_100g']) ?? (num(n.energy_100g) != null ? Math.round(num(n.energy_100g) / 4.184) : null);
  const name = str(p.product_name_de || p.product_name || p.generic_name_de, 120);
  if (!name || kcal == null) return null;
  const code = str(p.code, 20).replace(/\D/g, '');
  return {
    code, name, brand: str(Array.isArray(p.brands) ? p.brands[0] : p.brands, 80).split(',')[0].replace(/^[a-z]{2}:/, '').trim(), qty: str(p.quantity, 30),
    serving: num(p.serving_quantity),
    per100: {
      kcal, protein: num(n.proteins_100g), carbs: num(n.carbohydrates_100g), sugar: num(n.sugars_100g), fat: num(n.fat_100g),
      satfat: num(n['saturated-fat_100g']), fiber: num(n.fiber_100g), salt: num(n.salt_100g),
    },
    image: /^https:\/\/images\.openfoodfacts\.org\//.test(p.image_small_url || '') ? p.image_small_url : '',
    src: 'off',
  };
}

async function cached(D, key, fetcher) {
  const r = D.get('SELECT data, fetched FROM food_cache WHERE key = ?', key);
  if (r && r.fetched > Date.now() - TTL) return JSON.parse(r.data);
  const data = await fetcher();
  // leere Suchergebnisse nicht merken (können an einer kurzen Bremse der Datenbank liegen)
  if (Array.isArray(data?.products) && !data.products.length) return data;
  D.run('INSERT INTO food_cache (key, data, fetched) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, fetched = excluded.fetched', key, JSON.stringify(data), Date.now());
  if (Math.random() < 0.02) D.run('DELETE FROM food_cache WHERE fetched < ?', Date.now() - TTL);
  return data;
}

async function get(url) {
  let res;
  try { res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }); } catch {
    throw Object.assign(new Error('Die Lebensmittel-Datenbank ist gerade nicht erreichbar.'), { status: 502 });
  }
  if (res.status === 404) return null;
  if (res.status === 429) throw Object.assign(new Error('Die Lebensmittel-Datenbank bremst gerade – bitte kurz warten.'), { status: 429 });
  if (!res.ok) throw Object.assign(new Error(`Lebensmittel-Datenbank antwortet nicht (${res.status})`), { status: 502 });
  return res.json().catch(() => null);
}

// begrenzt parallel abarbeiten (schont die Datenbank)
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export async function searchFood(D, q) {
  const s = str(q, 60).toLowerCase();
  if (s.length < 2) return { products: [] };
  return cached(D, `s:${s}`, async () => {
    let list = null;
    try {
      const qs = new URLSearchParams({ q: s, page_size: '30', langs: 'de,en', fields: FIELDS });
      const j = await get(`${SEARCH()}/search?${qs}`);
      if (Array.isArray(j?.hits)) {
        // Der Suchindex hat oft keine Nährwerte → für die besten Treffer das vollständige Produkt nachladen (je 30 Tage zwischengespeichert)
        const hits = j.hits.slice(0, 12);
        const full = await pool(hits, 4, async (h) => {
          if (cleanProduct(h)) return h;
          const c = String(h.code || '').replace(/\D/g, '');
          if (c.length < 8) return null;
          try { const r = await productByCode(D, c); return r.product ? { ...r.product, _clean: true } : null; } catch { return null; }
        });
        list = full.filter(Boolean);
      }
    } catch { /* unten: alter Weg */ }
    if (!list) {
      const qs = new URLSearchParams({ search_terms: s, search_simple: '1', action: 'process', json: '1', page_size: '24', fields: FIELDS, lc: 'de', sort_by: 'unique_scans_n' });
      const j = await get(`${BASE()}/cgi/search.pl?${qs}`);
      list = Array.isArray(j?.products) ? j.products : [];
    }
    const products = list.map((p) => (p._clean ? (({ _clean, ...x }) => x)(p) : cleanProduct(p))).filter(Boolean);
    // nach Relevanz: Name genau / beginnt mit Suchwort / enthält es als Wort – kurze, passende Namen zuerst
    const words = s.split(/\s+/).filter(Boolean);
    const rank = (p) => {
      const n = p.name.toLowerCase();
      let r = n === s ? 100 : n.startsWith(s) ? 70 : n.startsWith(words[0]) ? 15 : 0;
      for (const w of words) r += new RegExp(`(^|[^a-zäöüß])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(n) ? 20 : n.includes(w) ? 8 : `${p.brand}`.toLowerCase().includes(w) ? 5 : -15;
      return r - Math.min(30, Math.max(0, n.length - s.length) / 2);
    };
    return { products: products.map((p) => [rank(p), p]).sort((a, b) => b[0] - a[0]).map(([, p]) => p).slice(0, 24) };
  });
}

export async function productByCode(D, code) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length < 8 || c.length > 14) throw Object.assign(new Error('Ungültiger Barcode'), { status: 400 });
  return cached(D, `c:${c}`, async () => {
    const j = await get(`${BASE()}/api/v2/product/${c}.json?fields=${FIELDS}`);
    const p = j?.product ? cleanProduct({ ...j.product, code: j.product.code || c }) : null;
    return { product: p };
  });
}
