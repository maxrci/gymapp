// API-Zugriff: Token aus localStorage ('gymlog-srv'), gleiche Adresse wie die Seite
export function auth() {
  try { return JSON.parse(localStorage.getItem('gymlog-srv') || '{}') || {}; } catch { return {}; }
}

export async function api(method, path, body) {
  const a = auth();
  if (!a.token) { location.href = '/login'; throw new Error('Nicht angemeldet'); }
  const r = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${a.token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (r.status === 401) { location.href = '/login'; throw new Error('Nicht angemeldet'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Fehler ${r.status}`);
  return j;
}
export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const patch = (p, b) => api('PATCH', p, b);
export const put = (p, b) => api('PUT', p, b);
export const del = (p) => api('DELETE', p);
export const saveConfig = (key, value) => put(`/api/admin/config/${key}`, { value });
