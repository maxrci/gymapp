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
