// Übungsbibliothek: Muskelgruppen, Übungstypen, Zuordnung per Schlüsselwort

export const MUSCLES = [
  'Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Unterarme', 'Bauch',
  'Quadrizeps', 'Beinbeuger', 'Gesäß', 'Waden', 'Adduktoren', 'Abduktoren',
  'Unterer Rücken', 'Nacken', 'Ganzkörper', 'Cardio', 'Sonstiges',
];

export const TYPES = {
  weight: { label: 'Gewicht × Wdh.', cols: ['weight', 'reps'] },
  weighted_bw: { label: 'Körpergewicht + Zusatzgewicht', cols: ['weight', 'reps'] },
  bodyweight: { label: 'Nur Wiederholungen', cols: ['reps'] },
  cardio: { label: 'Distanz & Zeit', cols: ['distance', 'duration'] },
  duration: { label: 'Nur Zeit', cols: ['duration'] },
};

// Reihenfolge ist wichtig: spezifischere Regeln zuerst
const RULES = [
  [/pilates|yoga/i, 'Bauch', ['Ganzkörper'], 'duration'],
  [/mobility|dehnen|stretch/i, 'Ganzkörper', [], 'duration'],
  [/rudermaschine|carido|cardio|radfahren|fahrrad|ergometer|laufband|crosstrainer|joggen|laufen|schwimmen|stepper|seilspringen|zone ?2/i, 'Cardio', [], 'cardio'],
  [/inliner|inline|skat|rollschuh|eislauf|longboard|wander|trekking|\bski|langlauf|snowboard/i, 'Cardio', [], 'cardio'],
  [/fu(ß|ss)ball|basketball|tennis|badminton|squash|volleyball|handball|hockey|padel|kampfsport|kickbox|\bboxen|tanz|zumba|aerobic|klettern|bouldern|surf|kajak|kanu/i, 'Cardio', [], 'duration'],
  [/burpee/i, 'Ganzkörper', [], 'bodyweight'],
  [/plank|unterarmstütz/i, 'Bauch', [], 'duration'],
  [/butterfly reverse|reverse butterfly|face ?pull|reverse fly|hintere schulter/i, 'Schultern', ['Rücken'], 'weight'],
  [/rumänisches kreuzheben|romanian|steifbein/i, 'Beinbeuger', ['Gesäß', 'Unterer Rücken'], 'weight'],
  [/kreuzheben|deadlift/i, 'Unterer Rücken', ['Gesäß', 'Beinbeuger', 'Rücken'], 'weight'],
  [/klimmzug|pull ?up|chin ?up/i, 'Rücken', ['Bizeps'], 'bodyweight'],
  [/latzug|lat pull|pulldown/i, 'Rücken', ['Bizeps'], 'weight'],
  [/rudern|rundern|row|t-bar/i, 'Rücken', ['Bizeps'], 'weight'],
  [/rückenstrecken|hyperextension|back extension/i, 'Unterer Rücken', ['Gesäß'], 'weight'],
  [/shrug|nacken/i, 'Nacken', [], 'weight'],
  [/dip/i, 'Trizeps', ['Brust', 'Schultern'], 'bodyweight'],
  [/trizeps|pushdown|french press|skull|überkopf.*strecken/i, 'Trizeps', [], 'weight'],
  [/hammer ?curl/i, 'Bizeps', ['Unterarme'], 'weight'],
  [/curl|bizeps/i, 'Bizeps', [], 'weight'],
  [/unterarm|wrist/i, 'Unterarme', [], 'weight'],
  [/schulterdrücken|shoulder press|military|überkopfdrücken|arnold/i, 'Schultern', ['Trizeps'], 'weight'],
  [/seitheben|frontheben|lateral raise|front raise|aufrechtes rudern/i, 'Schultern', [], 'weight'],
  [/liegestütz|push ?up/i, 'Brust', ['Trizeps', 'Schultern'], 'bodyweight'],
  [/bankdrücken|brustpresse|bench|chest press|fliegende|cable cross|kabelzug.*brust/i, 'Brust', ['Trizeps', 'Schultern'], 'weight'],
  [/butterfly|pec deck/i, 'Brust', [], 'weight'],
  [/hip thrust|glute|gesäß|kickback/i, 'Gesäß', ['Beinbeuger'], 'weight'],
  [/abduktion|abduktor|abductor/i, 'Abduktoren', ['Gesäß'], 'weight'],
  [/adduktion|adduktor|adductor/i, 'Adduktoren', [], 'weight'],
  [/beinbeugen|leg curl|beinbeuger/i, 'Beinbeuger', [], 'weight'],
  [/beinstrecken|leg extension/i, 'Quadrizeps', [], 'weight'],
  [/wade|calf/i, 'Waden', [], 'weight'],
  [/squat|kniebeuge|hackenschmidt|beinpresse|leg press|ausfallschritt|lunge|split|step ?up/i, 'Quadrizeps', ['Gesäß', 'Beinbeuger'], 'weight'],
  [/crunch|beinheben|sit ?up|bauch|torso rotation|russian twist|ab wheel|leg raise/i, 'Bauch', [], 'bodyweight'],
];

export function inferExercise(name) {
  const n = String(name || '');
  for (const [re, primary, secondary, type] of RULES) {
    if (re.test(n)) {
      let t = type;
      if (/gewichtet|weighted/i.test(n) && (t === 'bodyweight')) t = 'weighted_bw';
      return { primary, secondary, type: t };
    }
  }
  return { primary: 'Sonstiges', secondary: [], type: 'weight' };
}

// Gängige Übungen für die Auswahl (zusätzlich zu den eigenen)
export const LIBRARY = [
  'Bankdrücken (Langhantel)', 'Bankdrücken (Kurzhantel)', 'Schrägbankdrücken (Langhantel)',
  'Schrägbankdrücken (Kurzhantel)', 'Negativ-Bankdrücken (Langhantel)', 'Brustpresse (Maschine)',
  'Schräge Brustpresse (Maschine)', 'Butterfly', 'Kabelzug-Fliegende', 'Liegestütz', 'Dips',
  'Klimmzug', 'Klimmzug (Gewichtet)', 'Latzug (Kabel)', 'Latzug - Enger Griff (Kabel)',
  'Rudern sitzend (Maschine)', 'Rudern am Kabel sitzend', 'Vorgebeugtes Rudern (Langhantel)',
  'Kurzhantel Rudern', 'T-Bar Rudern', 'Iso-Laterales Rudern', 'Face Pull', 'Butterfly reversed',
  'Kreuzheben (Langhantel)', 'Rumänisches Kreuzheben (Langhantel)', 'Rückenstrecken (Maschine)',
  'Schulterdrücken (Langhantel)', 'Schulterdrücken (Kurzhantel)', 'Schulterdrücken (Maschine)',
  'Arnold Press', 'Seitheben (Kurzhantel)', 'Seitheben (Kabel)', 'Seitheben (Maschine)',
  'Frontheben (Kurzhantel)', 'Shrugs (Kurzhantel)', 'Bizepscurl (Langhantel)', 'Bizepscurl (Kurzhantel)',
  'Bizepscurl (Kabel)', 'Bizepscurl (Maschine)', 'Hammer Curl (Kurzhantel)', 'Scottcurl (SZ-Stange)',
  'Trizepsdrücken', 'Trizepsdrücken mit dem Seil', 'French Press (SZ-Stange)',
  'Trizeps Überkopfstrecken (Kabel)', 'Squat (Langhantel)', 'Frontkniebeuge (Langhantel)',
  'Beinpresse', 'Hackenschmidt Squat (Maschine)', 'Bulgarian Split Squat (Kurzhantel)',
  'Ausfallschritt (Kurzhantel)', 'Beinstrecken (Maschine)', 'Liegendes Beinbeugen (Maschine)',
  'Beinbeugen sitzend', 'Hip Thrust (Langhantel)', 'Hüftabduktion (Maschine)', 'Hüftadduktion (Maschine)',
  'Wadenheben stehend (Maschine)', 'Wadenheben sitzend', 'Crunch', 'Negativer Crunch',
  'Beinheben hängend', 'Plank', 'Pilates', 'Yoga', 'Inliner', 'Wandern', 'Fußball', 'Tennis', 'Klettern', 'Radfahren', 'Laufband', 'Crosstrainer', 'Rudermaschine',
];
