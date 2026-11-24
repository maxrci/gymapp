// Farbschema vor dem ersten Zeichnen setzen (als eigene Datei, damit die Sicherheitsregel keine Inline-Skripte erlauben muss)
(function () {
  var p = localStorage.getItem('gymlog-theme') || 'dark';
  var t = p === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : p;
  document.documentElement.dataset.theme = t;
  if (t === 'light') {
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#f2f2ef');
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').setAttribute('content', 'default');
  }
})();
