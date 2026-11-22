// Aussehen des eigenen Kämpfers: Figur, Haarfarbe, Kleidung, Gesicht.
// Gewählt wird die Einsteiger-Form – höhere Stufen verwandeln sie automatisch.

export const HAIR = [
  ['schwarz', 'Schwarz', '#1d1d22'],
  ['braun', 'Braun', '#5b3a24'],
  ['rot', 'Rot', '#b8322a'],
  ['blau', 'Blau', '#2f5fd0'],
  ['lila', 'Lila', '#6c3fb8'],
  ['pink', 'Pink', '#e46aa8'],
  ['gruen', 'Grün', '#2f8f58'],
  ['weiss', 'Silber', '#d9dae3'],
];

// [Hauptfarbe, Schattierung, Akzent, Akzent dunkel]
export const COLORS = [
  ['orange', 'Orange', '#f28c28', '#d9741a', '#2b4fa8', '#223f86'],
  ['blau', 'Blau', '#2f6fd6', '#2358ad', '#f2b705', '#c99504'],
  ['rot', 'Rot', '#d83a34', '#b02a25', '#2a2b33', '#1b1c22'],
  ['gruen', 'Grün', '#3a9d5d', '#2c7a47', '#f2d16b', '#c9aa48'],
  ['lila', 'Lila', '#7b4fd0', '#6039ac', '#f28c28', '#d9741a'],
  ['schwarz', 'Schwarz', '#33343d', '#22232a', '#d83a34', '#b02a25'],
  ['weiss', 'Weiß', '#ecebe6', '#cfcfc8', '#2f6fd6', '#2358ad'],
  ['pink', 'Pink', '#e8609a', '#c84a80', '#2a2b33', '#1b1c22'],
];

export const OUTFITS = [
  ['gi', 'Kampfanzug'],
  ['tank', 'Ärmellos'],
  ['suit', 'Trainingsanzug'],
  ['vest', 'Kampfweste'],
];

export const FACES = [
  ['brave', 'Entschlossen'],
  ['happy', 'Fröhlich'],
  ['cool', 'Cool'],
];

export const DEFAULT_LOOK = { sex: 'm', hair: 'schwarz', outfit: 'gi', color: 'orange', face: 'brave' };

let current = { ...DEFAULT_LOOK };

export function normLook(l) {
  const x = { ...DEFAULT_LOOK, ...(l || {}) };
  if (!['m', 'f'].includes(x.sex)) x.sex = 'm';
  if (!HAIR.some(([k]) => k === x.hair)) x.hair = DEFAULT_LOOK.hair;
  if (!OUTFITS.some(([k]) => k === x.outfit)) x.outfit = DEFAULT_LOOK.outfit;
  if (!COLORS.some(([k]) => k === x.color)) x.color = DEFAULT_LOOK.color;
  if (!FACES.some(([k]) => k === x.face)) x.face = DEFAULT_LOOK.face;
  return x;
}

export const setLook = (l) => { current = normLook(l); };
export const getLook = () => current;
export const lookKey = (l = current) => `${l.sex}${l.hair}${l.outfit}${l.color}${l.face}`;

// Aufgelöste Farben
export function palette(l = current) {
  const c = COLORS.find(([k]) => k === l.color) || COLORS[0];
  const h = HAIR.find(([k]) => k === l.hair) || HAIR[0];
  return { main: c[2], shade: c[3], accent: c[4], accentDark: c[5], hair: h[2] };
}
