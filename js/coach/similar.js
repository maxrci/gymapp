// Übungsfamilien: ähnliche Übungen (gleiche Bewegung, anderes Gerät) zum Tauschen im Trainingsplan

import { idx } from '../stats.js';
import { exerciseMeta, allExerciseNames } from '../store.js';
import { LIBRARY } from '../library.js';

// id, Erkennung per Name, Auswahl (bevorzugte Reihenfolge)
// Reihenfolge ist wichtig: spezifische Familien zuerst (z.B. Plank vor Dips, Schräg vor Bank, Waden/Ausfallschritt vor Squat, Beinbeugen vor Curl)
export const FAMILIES = [
  { id: 'mobility', label: 'Mobility / Dehnen', re: /mobil|dehn|stretch|foam|faszien|cat-?cow|pigeon|taube|dislocate|90\/90|thorak|downward dog|kindshaltung|child|couch|yoga|pilates/i,
    list: ['Hüftbeuger Dehnung', 'Couch Stretch', 'Taube (Pigeon Pose)', "World's Greatest Stretch", 'Katze-Kuh (Cat-Cow)', '90/90 Hüftmobilisation', 'Thorakale Rotation', 'Foam Rolling (Rücken)'] },
  { id: 'cardio', label: 'Cardio', re: /laufband|crosstrainer|radfahren|spinning|rudermaschine|seilspringen|treppensteiger|airbike|skierg|stepper|joggen|sprint|schwimmen|ergometer|ellipsen|jumping jack/i,
    list: ['Laufband', 'Crosstrainer', 'Radfahren', 'Rudermaschine', 'Skierg', 'Airbike', 'Treppensteiger', 'Seilspringen', 'Joggen', 'Jumping Jacks'] },
  { id: 'burpee', label: 'Burpee', re: /burpee/i, list: ['Burpee', 'Burpee Box Jump', 'Burpee Pull-up'] },
  { id: 'plank', label: 'Plank / Halteübungen', re: /plank|unterarmstütz|l-sit|hollow|dead bug|bird dog/i,
    list: ['Plank', 'Side Plank', 'Plank Hip Dips', 'Plank Shoulder Taps', 'Hollow Hold', 'L-Sit', 'Dead Bug', 'Bird Dog', 'Copenhagen Plank'] },
  { id: 'legraise', label: 'Beinheben', re: /beinheben|knieheben|leg raise|knee raise|toes to bar|\bv-?up|flutter/i,
    list: ['Beinheben hängend', 'Knieheben hängend', 'Beinheben liegend', 'Toes to Bar', 'V-Up', 'Flutter Kicks'] },
  { id: 'antirot', label: 'Rumpfrotation / Anti-Rotation', re: /russian twist|pallof|woodchop|seitbeugen|torso rotation|ab wheel|bauchroller/i,
    list: ['Pallof Press (Kabel)', 'Woodchopper (Kabel)', 'Russian Twist', 'Ab Wheel Rollout', 'Torso Rotation (Maschine)', 'Seitbeugen (Kurzhantel)', 'Woodchopper (Kabel, von unten)', 'Russian Twist (Gewichtet)'] },
  { id: 'abs', label: 'Bauch', re: /crunch|sit[ -]?up|bauch|mountain climber|bicycle/i,
    list: ['Crunch', 'Crunch (Kabel)', 'Crunch (Maschine)', 'Negativer Crunch', 'Reverse Crunch', 'Bicycle Crunch', 'Sit-up', 'Sit-up (Schrägbank)', 'Mountain Climbers'] },
  { id: 'triceps', label: 'Trizeps', re: /trizeps|pushdown|french press|skull|dip|diamant|diamond|enges bankdrücken|close.?grip/i,
    list: ['Trizepsdrücken mit dem Seil', 'Trizepsdrücken', 'Trizepsdrücken mit der Stange (Kabel)', 'Trizeps Überkopfstrecken (Kabel)', 'French Press (SZ-Stange)', 'Skull Crusher (Kurzhantel)', 'Trizeps Kickback (Kabel)', 'Enges Bankdrücken (Langhantel)', 'Dips', 'Bank Dips (Körpergewicht)', 'Diamant-Liegestütz'] },
  { id: 'ohp', label: 'Schulterdrücken', re: /schulterdrücken|shoulder press|military|überkopfdrücken|arnold|push press|landmine press|handstand|pike/i,
    list: ['Schulterdrücken (Kurzhantel)', 'Schulterdrücken (Langhantel)', 'Schulterdrücken (Maschine)', 'Schulterdrücken (Smith-Maschine)', 'Arnold Press', 'Push Press (Langhantel)', 'Landmine Press (Langhantel)', 'Schulterdrücken einarmig (Kurzhantel)', 'Pike Liegestütz'] },
  { id: 'incline', label: 'Schrägbankdrücken', re: /^(?!.*(fliegende|fly|curl)).*(schr(ä|ae)g.*(bank|brustpresse|drück)|incline)/i,
    list: ['Schrägbankdrücken (Kurzhantel)', 'Schrägbankdrücken (Langhantel)', 'Schrägbankdrücken (Smith-Maschine)', 'Schräge Brustpresse (Maschine)'] },
  { id: 'decline', label: 'Negativ-Bankdrücken', re: /negativ.*bank|decline/i,
    list: ['Negativ-Bankdrücken (Langhantel)', 'Negativ-Bankdrücken (Kurzhantel)', 'Negativ-Bankdrücken (Smith-Maschine)'] },
  { id: 'pushup', label: 'Liegestütz', re: /liegestütz|push[ -]?up/i,
    list: ['Liegestütz', 'Liegestütz (Hände erhöht)', 'Liegestütz (Füße erhöht)', 'Liegestütz auf Knien', 'Liegestütz (Gewichtet)', 'Liegestütz (Weiter Griff)', 'Archer Liegestütz', 'Klatsch-Liegestütz', 'Liegestütz (Ringe)'] },
  { id: 'bench', label: 'Bankdrücken', re: /bankdrücken|brustpresse|bench|chest press|floor press|svend/i,
    list: ['Bankdrücken (Langhantel)', 'Bankdrücken (Kurzhantel)', 'Bankdrücken (Smith-Maschine)', 'Brustpresse (Maschine)', 'Brustpresse (Kabel)', 'Floor Press (Kurzhantel)', 'Floor Press (Langhantel)', 'Brustpresse einarmig (Maschine)', 'Svend Press (Scheibe)'] },
  { id: 'fly', label: 'Fliegende', re: /butterfly(?! rev)|fliegende|cable cross|pec deck/i,
    list: ['Butterfly', 'Kabelzug-Fliegende', 'Fliegende (Kurzhantel)', 'Fliegende schräg (Kurzhantel)', 'Cable Crossover (von oben)', 'Cable Crossover (von unten)', 'Cable Crossover (Mitte)', 'Fliegende einarmig (Kabel)'] },
  { id: 'pullover', label: 'Pullover', re: /pullover/i,
    list: ['Pullover (Kurzhantel)', 'Pullover (Kabel)', 'Pullover (Maschine)'] },
  { id: 'vpull', label: 'Klimmzug / Latzug', re: /klimmzug|latzug|lat pull|pulldown|pull[ -]?up|chin[ -]?up|muscle[ -]?up/i,
    list: ['Latzug (Kabel)', 'Klimmzug', 'Latzug - Enger Griff (Kabel)', 'Klimmzug (Gewichtet)', 'Latzug (Maschine)', 'Chin-up', 'Latzug Untergriff (Kabel)', 'Latzug - Neutraler Griff (Kabel)', 'Klimmzug (Neutraler Griff)', 'Klimmzug (Breiter Griff)', 'Klimmzug (Assistiert, Maschine)', 'Latzug einarmig (Kabel)', 'Straight-Arm Pulldown (Kabel)', 'Negativer Klimmzug', 'Chin-up (Gewichtet)', 'Muscle-up'] },
  { id: 'upright', label: 'Aufrechtes Rudern', re: /aufrechtes rudern|upright row/i,
    list: ['Aufrechtes Rudern (Langhantel)', 'Aufrechtes Rudern (Kurzhantel)', 'Aufrechtes Rudern (Kabel)', 'Aufrechtes Rudern (SZ-Stange)'] },
  { id: 'row', label: 'Rudern', re: /rudern(?!maschine)|rundern|\brow\b|t-bar/i,
    list: ['Rudern am Kabel sitzend', 'Rudern sitzend (Maschine)', 'Kurzhantel Rudern', 'Vorgebeugtes Rudern (Langhantel)', 'T-Bar Rudern', 'Iso-Laterales Rudern', 'Brustgestütztes Rudern (Kurzhantel)', 'Brustgestütztes Rudern (Maschine)', 'Rudern einarmig (Kabel)', 'Rudern stehend (Kabel)', 'Rudern (Smith-Maschine)', 'Pendlay Row (Langhantel)', 'Vorgebeugtes Rudern - Untergriff (Langhantel)', 'T-Bar Rudern (Maschine)', 'Rudern hoher Zug (Maschine)', 'Seal Row (Langhantel)', 'Meadows Row (Langhantel)', 'Landmine Rudern (Langhantel)', 'Australisches Rudern (Körpergewicht)'] },
  { id: 'rear', label: 'Hintere Schulter', re: /face ?pull|butterfly rev|reverse (butterfly|fly)|hintere schulter/i,
    list: ['Face Pull', 'Butterfly reversed', 'Reverse Fly (Kurzhantel)', 'Reverse Fly (Kabel)'] },
  { id: 'rotator', label: 'Rotatorenmanschette', re: /außenrotation|innenrotation|rotatorenmanschette/i,
    list: ['Außenrotation (Kabel)', 'Außenrotation (Kurzhantel)'] },
  { id: 'front', label: 'Frontheben', re: /frontheben|front raise/i,
    list: ['Frontheben (Kurzhantel)', 'Frontheben (Kabel)', 'Frontheben (Scheibe)', 'Frontheben (Langhantel)'] },
  { id: 'lateral', label: 'Seitheben', re: /seitheben|lateral raise/i,
    list: ['Seitheben (Kurzhantel)', 'Seitheben (Kabel)', 'Seitheben (Maschine)', 'Seitheben einarmig (Kabel)', 'Seitheben sitzend (Kurzhantel)', 'Seitheben (Band)'] },
  { id: 'shrug', label: 'Shrugs', re: /shrug/i,
    list: ['Shrugs (Kurzhantel)', 'Shrugs (Langhantel)', 'Shrugs (Smith-Maschine)', 'Shrugs (Kabel)', 'Shrugs (Maschine)'] },
  { id: 'calf', label: 'Waden', re: /wade|calf/i,
    list: ['Wadenheben stehend (Maschine)', 'Wadenheben sitzend', 'Wadenheben (Beinpresse)', 'Wadenheben (Smith-Maschine)', 'Wadenheben (Kurzhantel)', 'Donkey Wadenheben (Maschine)', 'Wadenheben einbeinig (Körpergewicht)', 'Wadenheben (Körpergewicht)'] },
  { id: 'lunge', label: 'Ausfallschritt', re: /split squat|ausfallschritt|lunge|step[ -]?up|cossack|curtsy/i,
    list: ['Bulgarian Split Squat (Kurzhantel)', 'Ausfallschritt (Kurzhantel)', 'Step-up (Kurzhantel)', 'Gehende Ausfallschritte (Kurzhantel)', 'Ausfallschritt rückwärts (Kurzhantel)', 'Ausfallschritt (Langhantel)', 'Ausfallschritt (Smith-Maschine)', 'Bulgarian Split Squat (Langhantel)', 'Bulgarian Split Squat (Smith-Maschine)', 'Split Squat (Kurzhantel)', 'Ausfallschritt seitlich (Kurzhantel)', 'Curtsy Lunge (Kurzhantel)', 'Step-up (Langhantel)', 'Ausfallschritt (Körpergewicht)', 'Step-up (Körpergewicht)', 'Bulgarian Split Squat (Körpergewicht)', 'Cossack Squat (Körpergewicht)'] },
  { id: 'legcurl', label: 'Beinbeugen', re: /beinbeug|leg curl|nordic|glute ham|hamstring curl/i,
    list: ['Liegendes Beinbeugen (Maschine)', 'Beinbeugen sitzend', 'Beinbeugen stehend (Maschine)', 'Beinbeugen (Kabel)', 'Nordic Curl', 'Glute Ham Raise (Maschine)'] },
  { id: 'legext', label: 'Beinstrecken', re: /beinstreck|leg extension/i,
    list: ['Beinstrecken (Maschine)', 'Beinstrecken einbeinig (Maschine)', 'Beinstrecken (Kabel)'] },
  { id: 'hinge', label: 'Kreuzheben', re: /kreuzheben|deadlift|romanian|steifbein|rack pull/i,
    list: ['Rumänisches Kreuzheben (Langhantel)', 'Kreuzheben (Langhantel)', 'Rumänisches Kreuzheben (Kurzhantel)', 'Trap Bar Kreuzheben', 'Sumo Kreuzheben (Langhantel)', 'Steifbein-Kreuzheben (Langhantel)', 'Rumänisches Kreuzheben (Smith-Maschine)', 'Einbeiniges Rumänisches Kreuzheben (Kurzhantel)', 'Kreuzheben (Kurzhantel)', 'Defizit Kreuzheben (Langhantel)', 'Rack Pull (Langhantel)'] },
  { id: 'backext', label: 'Rückenstrecken', re: /rückenstrecken|hyperextension|back extension|good ?morning|superman/i,
    list: ['Rückenstrecken (Maschine)', 'Hyperextension', 'Hyperextension (Gesäß-Fokus)', 'Reverse Hyperextension (Maschine)', 'Good Morning (Langhantel)', 'Superman'] },
  { id: 'abduct', label: 'Abduktoren', re: /abduktion|abduktor|abductor|clamshell|fire hydrant|monster walk/i,
    list: ['Hüftabduktion (Maschine)', 'Hüftabduktion (Kabel)', 'Hüftabduktion (Band)', 'Clamshell (Band)', 'Fire Hydrant (Körpergewicht)', 'Monster Walk (Band)'] },
  { id: 'adduct', label: 'Adduktoren', re: /adduktion|adduktor|adductor|copenhagen/i,
    list: ['Hüftadduktion (Maschine)', 'Hüftadduktion (Kabel)'] },
  { id: 'glute', label: 'Gesäß', re: /hip thrust|glute|kickback|donkey kick|pull-?through/i,
    list: ['Hip Thrust (Langhantel)', 'Hip Thrust (Maschine)', 'Hip Thrust (Smith-Maschine)', 'Hip Thrust (Kurzhantel)', 'Glute Bridge (Körpergewicht)', 'Glute Bridge (Langhantel)', 'Glute Kickback (Kabel)', 'Glute Kickback (Maschine)', 'Cable Pull-Through (Kabel)', 'Hip Thrust einbeinig (Körpergewicht)', 'Glute Bridge einbeinig (Körpergewicht)', 'Donkey Kick (Körpergewicht)'] },
  { id: 'jump', label: 'Sprünge', re: /box jump|jump squat/i,
    list: ['Box Jump (Körpergewicht)', 'Jump Squat (Körpergewicht)'] },
  { id: 'legpress', label: 'Beinpresse', re: /beinpresse|leg press/i,
    list: ['Beinpresse', 'Beinpresse horizontal (Maschine)', 'Beinpresse (Einbeinig)', 'Beinpresse (Enge Stellung)', 'Beinpresse (Weite Stellung)'] },
  { id: 'squat', label: 'Kniebeuge', re: /squat(?!.*split)|kniebeuge|hackenschmidt/i,
    list: ['Squat (Langhantel)', 'Hackenschmidt Squat (Maschine)', 'Frontkniebeuge (Langhantel)', 'Squat (Smith-Maschine)', 'Goblet Squat (Kurzhantel)', 'Goblet Squat (Kettlebell)', 'Pendulum Squat (Maschine)', 'Belt Squat (Maschine)', 'Squat (Safety Bar)', 'Zercher Squat (Langhantel)', 'Box Squat (Langhantel)', 'Overhead Squat (Langhantel)', 'Sumo Squat (Kurzhantel)', 'Kniebeuge (Körpergewicht)', 'Sissy Squat (Körpergewicht)', 'Pistol Squat (Körpergewicht)'] },
  { id: 'forearm', label: 'Unterarme', re: /wrist|handgelenk|unterarm/i,
    list: ['Wrist Curl (Langhantel)', 'Wrist Curl (Kurzhantel)', 'Reverse Wrist Curl (Kurzhantel)'] },
  { id: 'curl', label: 'Bizepscurl', re: /curl(?!.*bein)|bizeps|preacher|scott/i,
    list: ['Bizepscurl (Kurzhantel)', 'Bizepscurl (Langhantel)', 'Bizepscurl (Kabel)', 'Hammer Curl (Kurzhantel)', 'Scottcurl (SZ-Stange)', 'Preacher Curl (Kurzhantel)', 'Preacher Curl (Maschine)', 'Bizepscurl (Maschine)', 'Bizepscurl (SZ-Stange)', 'Incline Curl (Kurzhantel)', 'Konzentrationscurl (Kurzhantel)', 'Spider Curl (Kurzhantel)', 'Bayesian Curl (Kabel)', 'Hammer Curl (Kabel)', 'Hammer Curl (Seil)', 'Cross-Body Hammer Curl (Kurzhantel)', 'Bizepscurl einarmig (Kabel)', 'Zottman Curl (Kurzhantel)', 'Reverse Curl (SZ-Stange)', 'Drag Curl (Langhantel)', 'Spider Curl (SZ-Stange)', 'Bizepscurl (Band)'] },
  { id: 'kbswing', label: 'Kettlebell / Olympisch', re: /swing|clean|snatch|get-?up/i,
    list: ['Kettlebell Swing', 'Kettlebell Clean', 'Kettlebell Snatch', 'Kettlebell Clean & Press', 'Turkish Get-up (Kettlebell)', 'Power Clean (Langhantel)', 'Hang Clean (Langhantel)', 'Snatch (Langhantel)'] },
  { id: 'thruster', label: 'Thruster', re: /thruster|wall ?ball/i,
    list: ['Thruster (Kurzhantel)', 'Thruster (Langhantel)', 'Wall Ball'] },
  { id: 'carry', label: 'Tragen / Schleppen', re: /farmer|carry|sled|schlitten|prowler|battle rope|bear crawl/i,
    list: ['Farmer\'s Walk (Kurzhantel)', 'Suitcase Carry (Kurzhantel)', 'Sled Push', 'Sled Pull', 'Battle Ropes', 'Bear Crawl'] },
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
