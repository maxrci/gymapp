// i18n-Grundgerüst: Die UI-Texte werden Schritt für Schritt hierher verschoben,
// sobald die Oberfläche nach der Vereinfachungsphase stabil ist.

export const LANGS = [['de', 'Deutsch'], ['en', 'English']];

const dict = {
  de: {
    'common.save': 'Speichern',
    'common.cancel': 'Abbrechen',
    'common.delete': 'Löschen',
    'common.back': 'Zurück',
    'common.done': 'Fertig',
  },
  en: {
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.back': 'Back',
    'common.done': 'Done',
  },
};

const KEY = 'gymlog-lang';
let lang = 'de';
try { const s = localStorage.getItem(KEY); if (s && dict[s]) lang = s; } catch { /* ignore */ }

export function getLang() { return lang; }
export function setLang(l) {
  if (!dict[l]) return;
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
}

// t('key', { name: 'Max' }) ersetzt {name}; Fallback: aktuelle Sprache -> de -> Schlüssel
export function t(key, vars) {
  const s = dict[lang]?.[key] ?? dict.de[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}
