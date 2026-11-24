// Hell/Dunkel/System – wird zusätzlich in localStorage gespiegelt, damit beim Start nichts flackert
const KEY = 'gymlog-theme';
const mq = window.matchMedia('(prefers-color-scheme: light)');

export function resolveTheme(pref) {
  return pref === 'system' ? (mq.matches ? 'light' : 'dark') : pref === 'light' ? 'light' : 'dark';
}

export function applyTheme(pref = localStorage.getItem(KEY) || 'dark') {
  localStorage.setItem(KEY, pref);
  const t = resolveTheme(pref);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f2f2ef' : '#0d0d0d');
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', t);
  return t;
}

mq.addEventListener?.('change', () => {
  if ((localStorage.getItem(KEY) || 'dark') === 'system') applyTheme('system');
});

// Farbprofile (Akzentfarbe) und Simple Mode – ebenfalls gespiegelt, damit beim Start nichts flackert
export const ACCENTS = [['blau', 'Blau', '#3987e5'], ['violett', 'Violett', '#8b6cf0'], ['gruen', 'Grün', '#2fb36d'], ['orange', 'Orange', '#f08a3c'], ['pink', 'Pink', '#e8579b'], ['rot', 'Rot', '#e5484d']];
export function applyLook({ accent = 'blau', simple = false } = {}) {
  const a = ACCENTS.some(([k]) => k === accent) ? accent : 'blau';
  if (a === 'blau') delete document.documentElement.dataset.accent; else document.documentElement.dataset.accent = a;
  document.documentElement.classList.toggle('simple', !!simple);
  try { localStorage.setItem('gymlog-accent', a); localStorage.setItem('gymlog-simple', simple ? '1' : ''); } catch { /* egal */ }
}
