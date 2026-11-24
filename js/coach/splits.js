// Trainings-Splits: Vorlagen für die Trainingstage (Slots = Übungsfamilien, siehe similar.js)

const S = (fam, sets, role = 'acc') => ({ fam, sets, role });

export const SPLITS = {
  full: { label: 'Ganzkörper', short: 'GK', days: [
    { id: 'gkA', name: 'Ganzkörper A', legs: true, slots: [S('squat', 3, 'main'), S('bench', 3, 'main'), S('row', 3), S('ohp', 2), S('legcurl', 2), S('abs', 2)] },
    { id: 'gkB', name: 'Ganzkörper B', legs: true, slots: [S('hinge', 3, 'main'), S('incline', 3, 'main'), S('vpull', 3), S('lunge', 2), S('lateral', 2), S('curl', 2)] },
    { id: 'gkC', name: 'Ganzkörper C', legs: true, slots: [S('squat', 3, 'main'), S('ohp', 3, 'main'), S('row', 3), S('bench', 2), S('triceps', 2), S('calf', 2)] },
  ] },
  ou: { label: 'Oberkörper/Unterkörper', short: 'OK/UK', days: [
    { id: 'okA', name: 'Oberkörper A', slots: [S('bench', 4, 'main'), S('row', 4, 'main'), S('ohp', 3), S('vpull', 3), S('curl', 2), S('triceps', 2)] },
    { id: 'ukA', name: 'Unterkörper A', legs: true, slots: [S('squat', 4, 'main'), S('hinge', 3), S('legcurl', 3), S('legext', 2), S('calf', 3), S('abs', 2)] },
    { id: 'okB', name: 'Oberkörper B', slots: [S('incline', 4, 'main'), S('vpull', 4, 'main'), S('row', 3), S('lateral', 3), S('triceps', 2), S('curl', 2)] },
    { id: 'ukB', name: 'Unterkörper B', legs: true, slots: [S('hinge', 4, 'main'), S('lunge', 3), S('squat', 3), S('legcurl', 3), S('glute', 2), S('calf', 3)] },
  ] },
  ppl: { label: 'Push/Pull/Beine', short: 'PPL', days: [
    { id: 'push', name: 'Push', slots: [S('bench', 4, 'main'), S('incline', 3), S('ohp', 3), S('lateral', 3), S('triceps', 3)] },
    { id: 'pull', name: 'Pull', slots: [S('vpull', 4, 'main'), S('row', 4, 'main'), S('rear', 3), S('curl', 3), S('abs', 2)] },
    { id: 'legs', name: 'Beine', legs: true, slots: [S('squat', 4, 'main'), S('hinge', 3), S('legcurl', 3), S('legext', 2), S('calf', 3)] },
  ] },
  bro3: { label: '3er-Split', short: '3er', days: [
    { id: 'bt', name: 'Brust & Trizeps', slots: [S('bench', 4, 'main'), S('incline', 3), S('fly', 3), S('triceps', 3), S('triceps', 2)] },
    { id: 'rb', name: 'Rücken & Bizeps', slots: [S('vpull', 4, 'main'), S('row', 4), S('rear', 3), S('curl', 3), S('curl', 2)] },
    { id: 'bs', name: 'Beine & Schultern', legs: true, slots: [S('squat', 4, 'main'), S('legcurl', 3), S('legext', 3), S('ohp', 3), S('lateral', 3), S('calf', 2)] },
  ] },
  bro5: { label: 'Bro-Split', short: 'Bro', days: [
    { id: 'chest', name: 'Brust', slots: [S('bench', 4, 'main'), S('incline', 4), S('fly', 3), S('bench', 3), S('abs', 2)] },
    { id: 'back', name: 'Rücken', slots: [S('vpull', 4, 'main'), S('row', 4), S('row', 3), S('rear', 3), S('hinge', 3)] },
    { id: 'leg', name: 'Beine', legs: true, slots: [S('squat', 4, 'main'), S('lunge', 3), S('legcurl', 3), S('legext', 3), S('calf', 3)] },
    { id: 'shoulder', name: 'Schultern', slots: [S('ohp', 4, 'main'), S('lateral', 4), S('rear', 3), S('lateral', 3), S('abs', 2)] },
    { id: 'arms', name: 'Arme', slots: [S('curl', 3), S('triceps', 3), S('curl', 3), S('triceps', 3), S('abs', 2)] },
  ] },
};

export const SPLIT_INFO = {
  auto: 'Der Coach wählt passend zur Anzahl deiner Workouts.',
  full: 'Jedes Mal der ganze Körper – ideal bei 1–3 Workouts.',
  ou: 'Abwechselnd Ober- und Unterkörper – ideal bei 4 Workouts.',
  ppl: 'Drücken, Ziehen, Beine – ideal bei 3 oder 6 Workouts.',
  bro3: 'Brust/Trizeps, Rücken/Bizeps, Beine/Schultern.',
  bro5: 'Jeden Tag eine Muskelgruppe – ideal bei 5 Workouts.',
};

// Vorschlag des Coaches
export function splitFor(n, lvl = 'inter') {
  if (n <= 2) return 'full';
  if (n === 3) return lvl === 'beginner' ? 'full' : 'ppl';
  if (n === 4) return 'ou';
  return 'ppl';
}
export const activeSplit = (g) => (g.split && g.split !== 'auto' && SPLITS[g.split] ? g.split : splitFor(g.perWeek, g.level));
