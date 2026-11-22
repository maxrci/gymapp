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
  treadmill: { label: 'Laufband', pose: 'run', exercise: 'Laufband' },
  bike: { label: 'Rad', pose: 'bike', exercise: 'Radfahren' },
  elliptical: { label: 'Crosstrainer', pose: 'elliptical', exercise: 'Crosstrainer' },
  rower: { label: 'Rudergerät', pose: 'rower', exercise: 'Rudermaschine' },
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
    id: 'zone2', title: 'Grundlagenausdauer', desc: 'Lange, lockere Einheit in Zone 2 – baut deine Ausdauerbasis und Fettstoffwechsel auf.',
    options: [20, 30, 45, 60], def: 30,
    build: (m) => [P('Aufwärmen', 1, 5, 'warmup'), P('Grundlage', 2, m - 10, 'base'), P('Auslaufen', 1, 5, 'cool')],
  },
  {
    id: 'hiit44', title: '4×4 Intervalle', desc: 'Der Klassiker für die maximale Sauerstoffaufnahme: 4 Minuten hart, 3 Minuten locker.',
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
    id: 'sprint', title: '30/30 Sprints', desc: '30 Sekunden Vollgas, 30 Sekunden locker. Kurz, knackig, effektiv.',
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
    id: 'pyramid', title: 'Pyramide', desc: '1-2-3-4-3-2-1 Minuten hart mit gleich langer Erholung.',
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
    id: 'progressive', title: 'Steigerungslauf', desc: 'Alle 5 Minuten eine Stufe schneller – vom lockeren Einrollen bis zum starken Finish.',
    options: [30, 40], def: 30,
    build: (m) => {
      const blocks = m === 40 ? [1, 2, 2, 3, 3, 4, 4] : [1, 2, 3, 3, 4];
      return [...blocks.map((z, i) => P(`Stufe ${i + 1}/${blocks.length}`, z, 5, z >= 4 ? 'hard' : z === 1 ? 'warmup' : 'base')), P('Auslaufen', 1, 5, 'cool')];
    },
  },
  {
    id: 'tempo', title: 'Schwellentraining', desc: '3× 8 Minuten zügig an der Schwelle – verbessert dein Durchhaltevermögen.',
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
    id: 'walk', title: '12-3-30 Gehen', desc: '30 Minuten bergauf gehen: 12 % Steigung, 5 km/h. Gelenkschonend und fordernd.', devices: ['treadmill'],
    build: () => [
      P('Einlaufen', 1, 3, 'warmup', { fixed: { speed: 4.5, incline: 3 } }),
      P('Bergauf gehen', 2, 30, 'base', { fixed: { speed: 5, incline: 12 } }),
      P('Auslaufen', 1, 3, 'cool', { fixed: { speed: 4, incline: 1 } }),
    ],
  },
  {
    id: 'recovery', title: 'Regeneration', desc: 'Sehr lockere Bewegung am Ruhetag – fördert die Erholung.',
    options: [15, 20, 30], def: 20,
    build: (m) => [P('Locker bewegen', 1, m, 'base')],
  },
];

// ---------------- Mobility ----------------
// [Name, Pose, Anleitung, beidseitig]
export const MOVES = {
  catcow: ["Cat-Cow", 'catcow', 'Vierfüßlerstand. Ausatmen: Rücken rund. Einatmen: Brust nach vorn.'],
  child: ["Child's Pose", 'child', 'Gesäß Richtung Fersen, Arme weit nach vorn, tief in den Rücken atmen.'],
  wgs: ["World's Greatest Stretch", 'wgs', 'Tiefer Ausfallschritt, dann den Arm zur Decke aufdrehen.', true],
  hipflexor: ["Hip Flexor Stretch", 'hipflexor', 'Halbkniestand, Gesäß anspannen, Becken nach vorn schieben.', true],
  couch: ["Couch Stretch", 'couch', 'Hinteren Fuß an die Wand, Gesäß anspannen, aufrecht bleiben.', true],
  pigeon: ["Pigeon Pose", 'pigeon', 'Vorderes Bein angewinkelt, hinteres lang. Oberkörper langsam absenken.', true],
  hamstring: ["Hamstring Stretch", 'hamstring', 'Beine lang, aus der Hüfte nach vorn beugen, Rücken lang.'],
  squat: ["Deep Squat Hold", 'squatHold', 'Tief in die Hocke, Ellbogen schieben die Knie nach außen.'],
  thoracic: ["Thoracic Rotation", 'thoracic', 'Vierfüßlerstand, einen Arm weit zur Decke aufdrehen.', true],
  arms: ["Arm Circles", 'armCircles', 'Arme gestreckt, große langsame Kreise.'],
  chest: ["Chest Stretch", 'chest', 'Arm nach hinten an die Wand, Körper sanft wegdrehen.', true],
  ankle: ["Ankle Mobility", 'ankle', 'Knie Richtung Wand schieben, Ferse bleibt am Boden.', true],
  hang: ["Dead Hang", 'hang', 'Passiv an der Stange hängen, Schultern lösen.'],
  bridge: ["Glute Bridge", 'bridge', 'Rückenlage, Becken heben, oben Gesäß anspannen.'],
  birddog: ["Bird Dog", 'birddog', 'Vierfüßlerstand, Arm und gegenüberliegendes Bein strecken.', true],
  cobra: ["Cobra", 'cobra', 'Bauchlage, Oberkörper sanft aufrichten, Schultern tief.'],
  downdog: ["Downward Dog", 'downdog', 'Gesäß nach oben, Fersen Richtung Boden.'],
  kneehug: ["Knee to Chest", 'kneeHug', 'Rückenlage, ein Knie zur Brust ziehen, Rücken entspannen.', true],
  butterfly: ["Butterfly Stretch", 'butterfly', 'Fußsohlen zusammen, Knie sinken lassen, aufrecht sitzen.'],
  legswing: ["Leg Swings", 'legswing', 'Festhalten, Bein locker vor und zurück schwingen.', true],
  fold: ["Forward Fold", 'fold', 'Knie leicht gebeugt, Oberkörper locker hängen lassen.'],
};

const M = (id, sec) => ({ id, sec });
export const MOBILITY = [
  { id: 'morning', title: 'Morgen-Mobility', desc: 'Wirbelsäule, Hüfte und Schultern sanft aufwecken.',
    moves: [M('catcow', 60), M('wgs', 40), M('thoracic', 30), M('squat', 60), M('legswing', 30), M('arms', 40), M('fold', 45)] },
  { id: 'hips', title: 'Hüfte & unterer Rücken', desc: 'Löst die Hüftbeuger und entlastet den unteren Rücken.',
    moves: [M('catcow', 60), M('pigeon', 60), M('hipflexor', 45), M('butterfly', 60), M('kneehug', 40), M('child', 60)] },
  { id: 'shoulders', title: 'Schulter & Brustwirbelsäule', desc: 'Vor Push- und Pull-Tagen oder nach langem Sitzen.',
    moves: [M('arms', 45), M('thoracic', 40), M('chest', 40), M('hang', 30), M('cobra', 40), M('child', 45)] },
  { id: 'legs', title: 'Beine nach dem Training', desc: 'Cool-down für Beinrückseite, Hüfte und Waden.',
    moves: [M('hamstring', 60), M('couch', 45), M('pigeon', 45), M('ankle', 30), M('squat', 45)] },
  { id: 'flow', title: 'Ganzkörper-Flow', desc: 'Kompletter Durchgang für Beweglichkeit und Stabilität.',
    moves: [M('catcow', 60), M('downdog', 45), M('cobra', 30), M('wgs', 45), M('birddog', 40), M('bridge', 45), M('kneehug', 40), M('child', 60)] },
  { id: 'desk', title: 'Schreibtisch-Reset', desc: '6 Minuten gegen Bürohaltung.',
    moves: [M('arms', 40), M('chest', 30), M('hipflexor', 30), M('fold', 40), M('squat', 40)] },
];

const PREP = 6;   // Sekunden Vorbereitung vor jeder Übung
const SWITCH = 5; // Seitenwechsel

export function mobilityPhases(prog) {
  const ph = [];
  prog.moves.forEach((m, i) => {
    const [name, pose, cue, sides] = MOVES[m.id];
    const base = { name, pose, cue, idx: i };
    ph.push({ ...base, label: `Gleich: ${name}`, kind: 'prep', dur: i === 0 ? 10 : PREP });
    if (sides) {
      ph.push({ ...base, label: name, kind: 'move', dur: m.sec, side: 'Links' });
      ph.push({ ...base, label: 'Seite wechseln', kind: 'switch', dur: SWITCH });
      ph.push({ ...base, label: name, kind: 'move', dur: m.sec, side: 'Rechts' });
    } else ph.push({ ...base, label: name, kind: 'move', dur: m.sec });
  });
  return ph;
}
export const programDuration = (phases) => phases.reduce((a, p) => a + p.dur, 0);
