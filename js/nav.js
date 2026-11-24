// Navigationszustand: true, solange eine Seite durch echtes Öffnen (nicht durch Daten-Update) gerendert wird
export const nav = { entering: false, stack: [] };
// Zurück: echte Rückkehr (Scroll-Position bleibt erhalten), sonst zur angegebenen Seite
export function goBack(fallback = '#/') {
  if (nav.stack.length) history.back(); else location.hash = fallback;
}
