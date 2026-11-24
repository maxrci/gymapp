// Login der privaten App: Benutzername + Passwort → Anmelde-Cookie (für die App-Dateien) + Token (für die App selbst)
(function () {
  const f = document.getElementById('f');
  const err = document.getElementById('err');
  const go = document.getElementById('go');
  const q = new URLSearchParams(location.search);
  if (q.get('user')) f.username.value = q.get('user');
  const save = (j) => {
    // gleiche Struktur wie in js/sync.js (gymlog-srv); server '' = gleiche Adresse
    let old = {};
    try { old = JSON.parse(localStorage.getItem('gymlog-srv') || '{}'); } catch { /* egal */ }
    const same = old.user && old.user.id === j.user.id;
    localStorage.setItem('gymlog-srv', JSON.stringify({ ...(same ? old : {}), server: '', token: j.token, user: j.user, group: j.group }));
  };
  const post = async (path, body) => {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Fehler ${r.status}`);
    return j;
  };
  const showErr = (x) => { err.textContent = x.message === 'Failed to fetch' ? 'Server nicht erreichbar.' : x.message; err.hidden = false; };
  const device = /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : /Android/.test(navigator.userAgent) ? 'Android' : 'Browser';
  // Umzug aus der alten App: Einmal-Code im Link (#t=…) → ohne Passwort anmelden
  const t = /[#&]t=([A-Za-z0-9_-]{20,})/.exec(location.hash);
  if (t) {
    history.replaceState(null, '', location.pathname + location.search);
    go.disabled = true; go.textContent = 'Umzug läuft…';
    post('/api/transfer/redeem', { code: t[1], device }).then((j) => {
      save(j);
      try { sessionStorage.setItem('gymlog-moved', '1'); } catch { /* egal */ }
      location.replace('/');
    }).catch((x) => { showErr(x); go.disabled = false; go.textContent = 'Anmelden'; });
  }
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true; go.disabled = true; go.textContent = 'Melde an…';
    try {
      save(await post('/api/login', { username: f.username.value, password: f.password.value, device }));
      location.replace('/');
    } catch (x) {
      showErr(x); go.disabled = false; go.textContent = 'Anmelden';
    }
  });
}());
