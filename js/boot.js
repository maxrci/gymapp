// Farbschema vor dem ersten Zeichnen setzen (als eigene Datei, damit die Sicherheitsregel keine Inline-Skripte erlauben muss)
(function () {
  var p = localStorage.getItem('gymlog-theme') || 'dark';
  var t = p === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : p;
  document.documentElement.dataset.theme = t;
  var a = localStorage.getItem('gymlog-accent');
  if (a && a !== 'blau') document.documentElement.dataset.accent = a;
  if (localStorage.getItem('gymlog-simple') === '1') document.documentElement.classList.add('simple');
  if (t === 'light') {
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#f2f2ef');
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').setAttribute('content', 'default');
  }
})();
