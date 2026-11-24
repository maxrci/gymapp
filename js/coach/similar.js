// Übungsfamilien: ähnliche Übungen (gleiche Bewegung, anderes Gerät) zum Tauschen im Trainingsplan

import { idx } from '../stats.js';
import { exerciseMeta, allExerciseNames } from '../store.js';
import { LIBRARY } from '../library.js';

// id, Erkennung per Name, Auswahl (bevorzugte Reihenfolge)
export const FAMILIES = [
  { id: 'incline', label: 'Schrägbankdrücken', re: /schr(ä|ae)g.*(bank|brustpresse|drück)|incline/i,
    list: ['Schrägbankdrücken (Kurzhantel)', 'Schrägbankdrücken (Langhantel)', 'Schrägbankdrücken (Smith)', 'Schräge Brustpresse (Maschine)'] },
  { id: 'bench', label: 'Bankdrücken', re: /bankdrücken|brustpresse|bench|chest press|liegestütz|push ?up/i,
    list: ['Bankdrücken (Langhantel)', 'Bankdrücken (Kurzhantel)', 'Bankdrücken (Smith)', 'Brustpresse (Maschine)', 'Liegestütz'] },
  { id: 'fly', label: 'Fliegende', re: /butterfly(?! rev)|fliegende|cable cross|pec deck/i,
    list: ['Butterfly', 'Kabelzug-Fliegende', 'Fliegende (Kurzhantel)'] },
  { id: 'vpull', label: 'Klimmzug / Latzug', re: /klimmzug|latzug|lat pull|pulldown|pull ?up|chin ?up/i,
    list: ['Latzug (Kabel)', 'Klimmzug', 'Latzug - Enger Griff (Kabel)', 'Klimmzug (Gewichtet)', 'Latzug (Maschine)'] },
  { id: 'row', label: 'Rudern', re: /rudern(?!maschine)|rundern|\brow\b|t-bar/i,
    list: ['Rudern am Kabel sitzend', 'Rudern sitzend (Maschine)', 'Kurzhantel Rudern', 'Vorgebeugtes Rudern (Langhantel)', 'T-Bar Rudern', 'Iso-Laterales Rudern'] },
  { id: 'rear', label: 'Hintere Schulter', re: /face ?pull|butterfly rev|reverse (butterfly|fly)|hintere schulter/i,
    list: ['Face Pull', 'Butterfly reversed', 'Reverse Fly (Kurzhantel)'] },
  { id: 'ohp', label: 'Schulterdrücken', re: /schulterdrücken|shoulder press|military|überkopfdrücken|arnold/i,
    list: ['Schulterdrücken (Kurzhantel)', 'Schulterdrücken (Langhantel)', 'Schulterdrücken (Maschine)', 'Arnold Press'] },
  { id: 'lateral', label: 'Seitheben', re: /seitheben|lateral raise/i,
    list: ['Seitheben (Kurzhantel)', 'Seitheben (Kabel)', 'Seitheben (Maschine)'] },
  { id: 'calf', label: 'Waden', re: /wade|calf/i, list: ['Wadenheben stehend (Maschine)', 'Wadenheben sitzend', 'Wadenheben (Beinpresse)'] },
  { id: 'lunge', label: 'Ausfallschritt', re: /split squat|ausfallschritt|lunge|step ?up/i,
    list: ['Bulgarian Split Squat (Kurzhantel)', 'Ausfallschritt (Kurzhantel)', 'Step Up (Kurzhantel)'] },
  { id: 'legcurl', label: 'Beinbeugen', re: /beinbeug|leg curl/i,
    list: ['Liegendes Beinbeugen (Maschine)', 'Beinbeugen sitzend'] },
  { id: 'legext', label: 'Beinstrecken', re: /beinstreck|leg extension/i, list: ['Beinstrecken (Maschine)'] },
  { id: 'hinge', label: 'Kreuzheben', re: /kreuzheben|deadlift|romanian|steifbein/i,
    list: ['Rumänisches Kreuzheben (Langhantel)', 'Kreuzheben (Langhantel)', 'Rumänisches Kreuzheben (Kurzhantel)', 'Trap Bar Kreuzheben'] },
  { id: 'glute', label: 'Gesäß', re: /hip thrust|glute|kickback|abduktion|abduktor/i,
    list: ['Hip Thrust (Langhantel)', 'Hip Thrust (Maschine)', 'Hüftabduktion (Maschine)', 'Glute Kickback (Kabel)'] },
  { id: 'squat', label: 'Kniebeuge / Beinpresse', re: /squat(?!.*split)|kniebeuge|hackenschmidt|beinpresse|leg press/i,
    list: ['Squat (Langhantel)', 'Beinpresse', 'Hackenschmidt Squat (Maschine)', 'Frontkniebeuge (Langhantel)', 'Squat (Smith)', 'Goblet Squat (Kurzhantel)'] },
  { id: 'curl', label: 'Bizepscurl', re: /curl(?!.*bein)|bizeps/i,
    list: ['Bizepscurl (Kurzhantel)', 'Bizepscurl (Langhantel)', 'Bizepscurl (Kabel)', 'Hammer Curl (Kurzhantel)', 'Scottcurl (SZ-Stange)', 'Bizepscurl (Maschine)'] },
  { id: 'triceps', label: 'Trizeps', re: /trizeps|pushdown|french press|skull|dip/i,
    list: ['Trizepsdrücken mit dem Seil', 'Trizepsdrücken', 'Trizeps Überkopfstrecken (Kabel)', 'French Press (SZ-Stange)', 'Dips'] },
  { id: 'abs', label: 'Bauch', re: /crunch|beinheben|sit ?up|plank|ab wheel|leg raise|russian twist/i,
    list: ['Crunch', 'Beinheben hängend', 'Negativer Crunch', 'Plank', 'Crunch (Kabel)'] },
];
export const FAM = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));

export const familyOf = (name) => FAMILIES.find((f) => f.re.test(name || '')) || null;

// Wie oft eine Übung im Verlauf vorkommt (bevorzugt, was man kennt)
const uses = (name) => idx().ex.get(name)?.count || 0;

// Bevorzugte Übung einer Familie: was du am häufigsten machst, sonst die erste der Liste
export function pickFromFamily(famId, exclude = new Set()) {
  const f = FAM[famId];
  if (!f) return null;
  const own = [...idx().ex.values()].filter((x) => !exclude.has(x.name) && familyOf(x.name)?.id === famId && x.count >= 2);
  own.sort((a, b) => b.count - a.count || b.last - a.last);
  return own[0]?.name || f.list.find((n) => !exclude.has(n)) || f.list[0];
}

// Alternativen zu einer Übung: gleiche Familie (inkl. eigener Varianten), danach gleicher Zielmuskel
export function alternatives(name) {
  const fam = familyOf(name);
  const names = new Set([...LIBRARY, ...allExerciseNames(), ...(fam ? fam.list : [])]);
  names.delete(name);
  const same = [], muscle = [];
  const prim = exerciseMeta(name).primary;
  for (const n of names) {
    const f = familyOf(n);
    if (fam && f?.id === fam.id) same.push(n);
    else if (prim && prim !== 'Sonstiges' && prim !== 'Cardio' && exerciseMeta(n).primary === prim && exerciseMeta(n).type !== 'cardio' && exerciseMeta(n).type !== 'duration') muscle.push(n);
  }
  const order = (a, b) => uses(b) - uses(a) || a.localeCompare(b, 'de');
  const famOrder = (a, b) => {
    const ia = fam ? fam.list.indexOf(a) : -1, ib = fam ? fam.list.indexOf(b) : -1;
    return uses(b) - uses(a) || (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'de');
  };
  return { family: fam, same: same.sort(famOrder), muscle: muscle.sort(order).slice(0, 8) };
}
