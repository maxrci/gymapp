// Freischaltbare Objekte für den Avatar (Hüte, Brillen, Dinge in der Hand …).
// Freigeschaltet über Level oder Erfolge (Abzeichen). Die Prüfung meldet gamification.js an (kein Import-Kreis).

import { platform } from './platform.js';

// slot: hat = auf dem Kopf, face = im Gesicht, hand = in der Hand
// unlock: { level: n } oder { ach: 'Erfolgs-ID' } oder { free: true }; ios: false = in der iOS-App ausgeblendet
export const ITEMS = [
  { id: 'cap', slot: 'hat', label: 'Basecap', unlock: { free: true } },
  { id: 'headband', slot: 'hat', label: 'Stirnband', unlock: { level: 3 } },
  { id: 'beanie', slot: 'hat', label: 'Mütze', unlock: { level: 6 } },
  { id: 'cowboy', slot: 'hat', label: 'Cowboyhut', unlock: { ach: 'ckm100' } },
  { id: 'crown', slot: 'hat', label: 'Krone', unlock: { ach: 'monthwin' } },
  { id: 'santa', slot: 'hat', label: 'Weihnachtsmütze', unlock: { ach: 'xmas' } },
  { id: 'witch', slot: 'hat', label: 'Hexenhut', unlock: { ach: 'halloween' } },
  { id: 'party', slot: 'hat', label: 'Partyhut', unlock: { ach: 'nye' } },
  { id: 'sunglasses', slot: 'face', label: 'Sonnenbrille', unlock: { ach: 'st4' } },
  { id: 'mustache', slot: 'face', label: 'Schnurrbart', unlock: { ach: 'w100' } },
  { id: 'cigarette', slot: 'face', label: 'Zigarette', unlock: { ach: 'late' }, ios: false },
  { id: 'dumbbell', slot: 'hand', label: 'Hantel', unlock: { ach: 'w10' } },
  { id: 'kettlebell', slot: 'hand', label: 'Kettlebell', unlock: { ach: 'w50' } },
  { id: 'shaker', slot: 'hand', label: 'Protein-Shaker', unlock: { ach: 'pr10' } },
  { id: 'wine', slot: 'hand', label: 'Weißweinschorle', unlock: { ach: 'weekend10' }, ios: false },
];
export const SLOTS = [['hat', 'Kopf'], ['face', 'Gesicht'], ['hand', 'Hand']];

// In der iOS-App ausgeblendete Objekte gar nicht anbieten (Altersfreigabe im App Store)
export const visibleItems = () => ITEMS.filter((i) => i.ios !== false || !platform.isIOSApp);
export const itemById = (id) => ITEMS.find((i) => i.id === id) || null;

let checker = () => false;
export function setUnlockChecker(fn) { checker = fn; }
export function itemUnlocked(id) {
  const it = itemById(id);
  if (!it) return false;
  if (it.unlock.free) return true;
  try { return !!checker(it.unlock); } catch { return false; }
}
// Wie schaltet man es frei? (Text für gesperrte Objekte)
export function unlockHint(it, achTitle = (id) => id) {
  if (it.unlock.free) return 'Frei';
  if (it.unlock.level) return `Ab Level ${it.unlock.level}`;
  return `Abzeichen „${achTitle(it.unlock.ach)}“`;
}
