// Programme für geführte Cardio- und Mobility-Einheiten

import { state } from './store.js';
import { num } from './utils.js';

// ---------------- Cardio ----------------
export const ZONES = {
  1: { name: 'Zone 1 · sehr locker', short: 'Locker', feel: 'Unterhaltung mühelos möglich', hr: [50, 60] },
  2: { name: 'Zone 2 · Grundlage', short: 'Grundlage', feel: 'Ganze Sätze sprechen möglich', hr: [60, 70] },
  3: { name: 'Zone 3 · zügig', short: 'Zügig', feel: 'Nur noch kurze Sätze', hr: [70, 80] },
  4: { name: 'Zone 4 · hart', short: 'Hart', feel: 'Nur einzelne Wörter', hr: [80, 90] },
  5: { name: 'Zone 5 · maximal', short: 'Maximal', feel: 'Alles geben!', hr: [90, 100] },
};

export const DEVICES = {
  treadmill: { label: 'Laufband', icon: '🏃', exercise: 'Laufband' },
  bike: { label: 'Rad / Ergometer', icon: '🚴', exercise: 'Radfahren' },
  elliptical: { label: 'Crosstrainer', icon: '⛷️', exercise: 'Crosstrainer' },
  rower: { label: 'Rudergerät', icon: '🚣', exercise: 'Rudermaschine' },
};

export const DEFAULT_CARDIO = {
  treadmill: { speed: 8, incline: 1 },
  bike: { watts: 140, level: 8, rpm: 88 },
  elliptical: { level: 8, spm: 135 },
  rower: { split: 150, spm: 22 },
};
export const cardioBase = (dev) => ({ ...DEFAULT_CARDIO[dev], ...(state.settings.cardio?.[dev] || {}) });

const fmtSplit = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// Geräte-Einstellungen für eine Zone (oder fixe Werte aus der Phase)
export function deviceSettings(dev, zone, fixed = {}) {
  const b = cardioBase(dev);
  const z = zone - 1;
  if (dev === 'treadmill') {
    const speed = fixed.speed ?? b.speed * [0.65, 1, 1.15, 1.32, 1.5][z];
    const incline = fixed.incline ?? b.incline;
    return { items: [{ label: 'Geschwindigkeit', value: `${num(Math.round(speed * 10) / 10, 1)} km/h` }, { label: 'Steigung', value: `${num(incline, 1)} %` }], speed };
  }
  if (dev === 'bike') {
    const watts = Math.round((b.watts * [0.6, 1, 1.2, 1.45, 1.75][z]) / 5) * 5;
    const level = Math.max(1, b.level + [-3, 0, 2, 4, 6][z]);
    const rpm = [80, b.rpm, 90, 95, 100][z];
    return { items: [{ label: 'Leistung', value: `${watts} W` }, { label: 'Stufe', value: `${level}` }, { label: 'Trittfrequenz', value: `${rpm}${z === 4 ? '+' : ''} U/min` }] };
  }
  if (dev === 'elliptical') {
    const level = Math.max(1, b.level + [-3, 0, 2, 4, 6][z]);
    const spm = [Math.round(b.spm * 0.88), b.spm, Math.round(b.spm * 1.07), Math.round(b.spm * 1.15), Math.round(b.spm * 1.22)][z];
    return { items: [{ label: 'Stufe', value: `${level}` }, { label: 'Schritte', value: `${spm}/min` }] };
  }
  const split = b.split + [20, 0, -8, -15, -22][z];
  const spm = [18, b.spm, b.spm + 2, b.spm + 4, b.spm + 8][z];
  return { items: [{ label: 'Tempo', value: `${fmtSplit(split)} /500 m` }, { label: 'Schlagzahl', value: `${spm} SPM` }] };
}

export function hrText(zone) {
  const [a, b] = ZONES[zone].hr;
  const max = state.settings.hrMax;
  return max ? `Puls ${Math.round((max * a) / 100)}–${Math.round((max * b) / 100)} bpm` : `Puls ${a}–${b} % HFmax`;
}

const P = (label, zone, min, kind, extra = {}) => ({ label, zone, dur: Math.round(min * 60), kind, ...extra });

export const CARDIO = [
  {
    id: 'zone2', title: 'Grundlagenausdauer', icon: '🫀', desc: 'Lange, lockere Einheit in Zone 2 – baut deine Ausdauerbasis und Fettstoffwechsel auf.',
    options: [20, 30, 45, 60], def: 30,
    build: (m) => [P('Aufwärmen', 1, 5, 'warmup'), P('Grundlage', 2, m - 10, 'base'), P('Auslaufen', 1, 5, 'cool')],
  },
  {
    id: 'hiit44', title: '4×4 Intervalle', icon: '🔥', desc: 'Der Klassiker für die maximale Sauerstoffaufnahme: 4 Minuten hart, 3 Minuten locker.',
    build: () => {
      const ph = [P('Aufwärmen', 1, 5, 'warmup'), P('Aufwärmen steigern', 2, 5, 'warmup')];
      for (let i = 1; i <= 4; i++) {
        ph.push(P(`Intervall ${i}/4`, 4, 4, 'hard'));
        if (i < 4) ph.push(P('Aktive Erholung', 1, 3, 'recover'));
      }
      ph.push(P('Auslaufen', 1, 5, 'cool'));
      return ph;
    },
  },
  {
    id: 'sprint', title: '30/30 Sprints', icon: '⚡', desc: '30 Sekunden Vollgas, 30 Sekunden locker. Kurz, knackig, effektiv.',
    options: [8, 10, 12], optLabel: 'Runden', def: 10,
    build: (n) => {
      const ph = [P('Aufwärmen', 1, 4, 'warmup'), P('Aufwärmen steigern', 2, 4, 'warmup')];
      for (let i = 1; i <= n; i++) {
        ph.push(P(`Sprint ${i}/${n}`, 5, 0.5, 'hard'));
        ph.push(P('Locker', 1, 0.5, 'recover'));
      }
      ph.push(P('Auslaufen', 1, 5, 'cool'));
      return ph;
    },
  },
  {
    id: 'pyramid', title: 'Pyramide', icon: '🔺', desc: '1-2-3-4-3-2-1 Minuten hart mit gleich langer Erholung.',
    build: () => {
      const ph = [P('Aufwärmen', 1, 4, 'warmup'), P('Aufwärmen steigern', 2, 4, 'warmup')];
      const steps = [1, 2, 3, 4, 3, 2, 1];
      steps.forEach((m, i) => {
        ph.push(P(`Stufe ${i + 1}/${steps.length} · ${m} min`, m >= 3 ? 4 : 5, m, 'hard'));
        if (i < steps.length - 1) ph.push(P('Erholung', 1, m, 'recover'));
      });
      ph.push(P('Auslaufen', 1, 5, 'cool'));
      return ph;
    },
  },
  {
    id: 'progressive', title: 'Steigerungslauf', icon: '📈', desc: 'Alle 5 Minuten eine Stufe schneller – vom lockeren Einrollen bis zum starken Finish.',
    options: [30, 40], def: 30,
    build: (m) => {
      const blocks = m === 40 ? [1, 2, 2, 3, 3, 4, 4] : [1, 2, 3, 3, 4];
      return [...blocks.map((z, i) => P(`Stufe ${i + 1}/${blocks.length}`, z, 5, z >= 4 ? 'hard' : z === 1 ? 'warmup' : 'base')), P('Auslaufen', 1, 5, 'cool')];
    },
  },
  {
    id: 'tempo', title: 'Schwellentraining', icon: '🎯', desc: '3× 8 Minuten zügig an der Schwelle – verbessert dein Durchhaltevermögen.',
    build: () => {
      const ph = [P('Aufwärmen', 1, 5, 'warmup'), P('Aufwärmen steigern', 2, 5, 'warmup')];
      for (let i = 1; i <= 3; i++) {
        ph.push(P(`Tempo ${i}/3`, 3, 8, 'hard'));
        if (i < 3) ph.push(P('Erholung', 1, 2, 'recover'));
      }
      ph.push(P('Auslaufen', 1, 5, 'cool'));
      return ph;
    },
  },
  {
    id: 'walk', title: '12-3-30 Gehen', icon: '⛰️', desc: '30 Minuten bergauf gehen: 12 % Steigung, 5 km/h. Gelenkschonend und fordernd.', devices: ['treadmill'],
    build: () => [
      P('Einlaufen', 1, 3, 'warmup', { fixed: { speed: 4.5, incline: 3 } }),
      P('Bergauf gehen', 2, 30, 'base', { fixed: { speed: 5, incline: 12 } }),
      P('Auslaufen', 1, 3, 'cool', { fixed: { speed: 4, incline: 1 } }),
    ],
  },
  {
    id: 'recovery', title: 'Regeneration', icon: '🍃', desc: 'Sehr lockere Bewegung am Ruhetag – fördert die Erholung.',
    options: [15, 20, 30], def: 20,
    build: (m) => [P('Locker bewegen', 1, m, 'base')],
  },
];

// ---------------- Mobility ----------------
export const MOVES = {
  catcow: ['Katze-Kuh', '🐈', 'Vierfüßlerstand. Ausatmen: Rücken rund machen. Einatmen: Brust nach vorn, sanftes Hohlkreuz.'],
  child: ['Kindhaltung', '🙇', 'Knie breit, Gesäß Richtung Fersen, Arme weit nach vorn. Tief in den Rücken atmen.'],
  wgs: ['Weltbeste Dehnung', '🌍', 'Tiefer Ausfallschritt, Ellbogen innen Richtung Boden, dann den Arm zur Decke aufdrehen.', true],
  hipflexor: ['Hüftbeuger-Dehnung', '🦵', 'Halbkniestand, Gesäß anspannen und Becken leicht nach vorn schieben. Oberkörper aufrecht.', true],
  pigeon: ['Taube', '🕊️', 'Vorderes Bein angewinkelt vor dem Körper, hinteres Bein lang. Oberkörper langsam absenken.', true],
  ninety: ['90/90 Hüftrotation', '🔄', 'Beide Knie im 90°-Winkel. Langsam von einer Seite zur anderen kippen, aufrecht bleiben.'],
  thoracic: ['BWS-Rotation', '🌀', 'Vierfüßlerstand, Hand an den Hinterkopf. Ellbogen zum Boden, dann weit zur Decke aufdrehen.', true],
  wallangel: ['Wand-Engel', '👼', 'Rücken und Arme an der Wand. Arme in U-Form langsam hoch- und runterschieben.'],
  chest: ['Brustdehnung', '🚪', 'Unterarm an Türrahmen oder Wand, Körper sanft von der Seite wegdrehen.', true],
  hamstring: ['Beinrückseite dehnen', '📏', 'Bein gestreckt auflegen, aus der Hüfte nach vorn beugen, Rücken lang halten.', true],
  couch: ['Couch-Stretch', '🛋️', 'Knie an Wand oder Bank, Fuß nach oben, vorderes Bein aufgestellt. Gesäß anspannen.', true],
  squat: ['Tiefe Hocke', '🧎', 'Füße schulterbreit, tief in die Hocke sinken, Ellbogen schieben die Knie nach außen.'],
  cossack: ['Cossack Squat', '↔️', 'Breiter Stand, Gewicht langsam auf ein Bein verlagern, das andere bleibt gestreckt. Abwechseln.'],
  ankle: ['Sprunggelenk mobilisieren', '🦶', 'Fuß vor der Wand, Knie Richtung Wand schieben – Ferse bleibt am Boden.', true],
  neck: ['Nacken seitlich', '🧣', 'Ohr Richtung Schulter neigen, die andere Schulter sanft nach unten ziehen.', true],
  hang: ['Hängen an der Stange', '🙌', 'Passiv an der Klimmzugstange hängen, Schultern lösen, ruhig atmen.'],
  bridge: ['Glute Bridge', '🌉', 'Rückenlage, Füße aufgestellt. Becken heben, oben Gesäß fest anspannen.'],
  birddog: ['Bird Dog', '🐕', 'Vierfüßlerstand: gegengleich Arm und Bein strecken, kurz halten, wechseln.'],
  cobra: ['Kobra', '🐍', 'Bauchlage, Hände unter den Schultern. Oberkörper sanft aufrichten, Schultern tief.'],
  downdog: ['Herabschauender Hund', '🔺', 'Hände und Füße am Boden, Gesäß nach oben, Fersen Richtung Boden, Rücken lang.'],
  twist: ['Liegende Rotation', '🌙', 'Rückenlage, Knie zur Seite fallen lassen, Blick zur Gegenseite, Schultern am Boden.', true],
  butterfly: ['Schmetterling', '🦋', 'Fußsohlen zusammen, Knie sinken lassen, aufrecht sitzen und ruhig atmen.'],
  frog: ['Frosch-Dehnung', '🐸', 'Vierfüßlerstand mit weiten Knien, Hüfte langsam nach hinten schieben.'],
  shoulders: ['Schulterkreisen', '⭕', 'Große, langsame Kreise – erst vorwärts, dann rückwärts.'],
  arms: ['Armkreisen', '💫', 'Arme gestreckt, große Kreise in beide Richtungen.'],
  legswing: ['Beinpendel', '🦿', 'Festhalten, Bein locker vor und zurück schwingen, Bewegung langsam vergrößern.', true],
  sidebend: ['Seitneigung', '🌾', 'Arm über den Kopf, Oberkörper seitlich neigen, Flanke lang machen.', true],
  fold: ['Vorbeuge stehend', '🙇‍♂️', 'Knie leicht gebeugt, Oberkörper hängen lassen, Kopf und Nacken locker.'],
};

const M = (id, sec) => ({ id, sec });
export const MOBILITY = [
  { id: 'morning', title: 'Morgen-Mobility', icon: '🌅', desc: 'Sanft wach werden – Wirbelsäule, Hüfte und Schultern in Bewegung bringen.',
    moves: [M('catcow', 60), M('wgs', 40), M('thoracic', 30), M('squat', 60), M('legswing', 30), M('arms', 40), M('fold', 45)] },
  { id: 'hips', title: 'Hüfte & unterer Rücken', icon: '🦴', desc: 'Löst verkürzte Hüftbeuger und entlastet den unteren Rücken.',
    moves: [M('catcow', 60), M('ninety', 60), M('pigeon', 60), M('hipflexor', 45), M('frog', 60), M('butterfly', 60), M('child', 60), M('twist', 45)] },
  { id: 'shoulders', title: 'Schulter & Brustwirbelsäule', icon: '💪', desc: 'Ideal vor Push-/Pull-Tagen und nach langem Sitzen.',
    moves: [M('shoulders', 45), M('arms', 45), M('wallangel', 60), M('thoracic', 40), M('chest', 40), M('hang', 30), M('child', 45), M('cobra', 30)] },
  { id: 'legs', title: 'Beine nach dem Training', icon: '🦵', desc: 'Cool-down für Legday: Beinrückseite, Hüfte, Waden.',
    moves: [M('hamstring', 45), M('couch', 45), M('pigeon', 45), M('butterfly', 45), M('ankle', 30), M('squat', 45)] },
  { id: 'flow', title: 'Ganzkörper-Flow', icon: '🌊', desc: 'Kompletter Durchgang für Beweglichkeit und Stabilität.',
    moves: [M('catcow', 60), M('downdog', 45), M('cobra', 30), M('wgs', 45), M('cossack', 60), M('ninety', 60), M('thoracic', 40), M('bridge', 45), M('birddog', 60), M('twist', 40), M('child', 60)] },
  { id: 'desk', title: 'Schreibtisch-Reset', icon: '💻', desc: '6 Minuten gegen Bürohaltung – geht auch in Alltagskleidung.',
    moves: [M('neck', 30), M('shoulders', 40), M('chest', 30), M('sidebend', 30), M('hipflexor', 30), M('fold', 40)] },
];

const PREP = 6;   // Sekunden Vorbereitung vor jeder Übung
const SWITCH = 5; // Seitenwechsel

export function mobilityPhases(prog) {
  const ph = [];
  prog.moves.forEach((m, i) => {
    const [name, emoji, cue, sides] = MOVES[m.id];
    ph.push({ label: `Gleich: ${name}`, kind: 'prep', dur: i === 0 ? 10 : PREP, emoji, name, cue, idx: i });
    if (sides) {
      ph.push({ label: name, kind: 'move', dur: m.sec, emoji, name, cue, side: 'Links', idx: i });
      ph.push({ label: 'Seite wechseln', kind: 'switch', dur: SWITCH, emoji, name, cue, idx: i });
      ph.push({ label: name, kind: 'move', dur: m.sec, emoji, name, cue, side: 'Rechts', idx: i });
    } else ph.push({ label: name, kind: 'move', dur: m.sec, emoji, name, cue, idx: i });
  });
  return ph;
}
export const programDuration = (phases) => phases.reduce((a, p) => a + p.dur, 0);
