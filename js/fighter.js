// Eigene Kämpfer-Figur (inspiriert von Anime-Kampfkünstlern) als parametrisches SVG.
// Aussehen (Figur, Haare, Kleidung, Gesicht) kommt aus look.js; Stufe 0–7 verwandelt automatisch:
// Muskelmasse wächst, ab Stufe 3 Aura, ab 5 goldene Haare, ab 6 zerrissener Anzug + Blitze.

import { getLook, normLook, palette } from './look.js';

let uidc = 0;
const SKIN = '#f3c9a0';
const SKIN_SHADE = '#e0ae82';
const HAIR_GOLD = '#ffd23f';
const INK = '#222';

// ---- Objekte (Koordinaten relativ zur Kopfmitte hy; Kopf: x 80–120, Oberkante -20) ----
function hatSVG(h, C, id) {
  const sk = (c) => `stroke="${c}" stroke-width="1.4" stroke-linejoin="round"`;
  switch (h) {
    case 'cap': return `<path d="M79,-10 Q78,-37 100,-37 Q122,-37 121,-10 Q100,-15 79,-10Z" fill="${C.accent}" ${sk(C.accentDark)}/><circle cx="100" cy="-37" r="2.6" fill="${C.accentDark}"/>
      <path d="M78,-11 Q100,0 122,-11 Q100,-17 78,-11Z" fill="${C.accentDark}"/>`;
    case 'headband': return `<path d="M79,-15 Q100,-21 121,-15 L121,-8 Q100,-14 79,-8Z" fill="#d83a34" ${sk('#a82a25')}/>
      <path d="M121,-12 l13,-5 -3,7 9,4 -15,0 -2,-3Z" fill="#d83a34" ${sk('#a82a25')}/>`;
    case 'beanie': return `<path d="M78,-12 Q75,-40 100,-40 Q125,-40 122,-12Z" fill="${C.accent}" ${sk(C.accentDark)}/>
      <path d="M77,-17 Q100,-23 123,-17 L123,-8 Q100,-14 77,-8Z" fill="${C.accentDark}"/>
      <path d="M85,-19 v9 M93,-20 v9 M101,-20 v9 M109,-20 v9 M117,-19 v9" stroke="${C.accent}" stroke-width="1.4" opacity=".6"/>
      <circle cx="100" cy="-44" r="6.5" fill="#fff" ${sk('#cfd2dc')}/>`;
    case 'cowboy': return `<path d="M80,-12 Q77,-34 88,-37 Q100,-31 112,-37 Q123,-34 120,-12Z" fill="#9a6a3a" ${sk('#6b4423')}/>
      <path d="M80,-16 Q100,-11 120,-16 L120,-11 Q100,-6 80,-11Z" fill="#4a2e14"/>
      <path d="M57,-21 Q63,-6 100,-8 Q137,-6 143,-21 Q132,-13 100,-14 Q68,-13 57,-21Z" fill="#8a5a2b" ${sk('#6b4423')}/>`;
    case 'crown': return `<path d="M80,-12 L77,-37 L90,-26 L100,-42 L110,-26 L123,-37 L120,-12 Q100,-8 80,-12Z" fill="#ffd23f" ${sk('#c99504')}/>
      <circle cx="100" cy="-17" r="2.6" fill="#d83a34"/><circle cx="89" cy="-16" r="2" fill="#2f6fd6"/><circle cx="111" cy="-16" r="2" fill="#2f6fd6"/>
      <circle cx="77" cy="-38" r="2.2" fill="#fff3b0"/><circle cx="100" cy="-43" r="2.2" fill="#fff3b0"/><circle cx="123" cy="-38" r="2.2" fill="#fff3b0"/>`;
    case 'santa': return `<path d="M79,-12 Q78,-40 106,-45 Q128,-44 134,-28 Q120,-36 121,-12Z" fill="#d83a34" ${sk('#a82a25')}/>
      <path d="M77,-16 Q100,-9 123,-16 L123,-8 Q100,-1 77,-8Z" fill="#fff" ${sk('#d9dae3')}/>
      <circle cx="134" cy="-27" r="6.5" fill="#fff" ${sk('#d9dae3')}/>`;
    case 'witch': return `<path d="M82,-14 Q93,-32 96,-54 Q99,-62 112,-66 Q104,-54 108,-42 Q116,-28 118,-14Z" fill="#2a2233" ${sk('#14101a')}/>
      <path d="M83,-18 Q100,-12 117,-18 L118,-12 Q100,-6 82,-12Z" fill="#7b4fd0"/><rect x="95" y="-17" width="9" height="7" rx="1.5" fill="none" stroke="#ffd23f" stroke-width="1.8"/>
      <path d="M68,-10 Q100,-1 132,-10 Q122,-18 100,-17 Q78,-18 68,-10Z" fill="#2a2233" ${sk('#14101a')}/>`;
    case 'party': return `<clipPath id="${id}pc"><path d="M84,-12 L100,-52 L116,-12 Q100,-7 84,-12Z"/></clipPath>
      <path d="M84,-12 L100,-52 L116,-12 Q100,-7 84,-12Z" fill="#e46aa8"/>
      <g clip-path="url(#${id}pc)"><path d="M70,-18 L130,-34 L130,-26 L70,-10Z M70,-36 L130,-52 L130,-44 L70,-28Z" fill="#ffd23f"/><path d="M70,-27 L130,-43 L130,-39 L70,-23Z" fill="#2f6fd6"/></g>
      <path d="M84,-12 L100,-52 L116,-12 Q100,-7 84,-12Z" fill="none" ${sk('#b84583')}/>
      <circle cx="100" cy="-53" r="4.2" fill="#ffd23f" ${sk('#c99504')}/>`;
  }
  return '';
}
function faceItemSVG(f) {
  switch (f) {
    case 'sunglasses': return `<path d="M83,-3 L117,-3" stroke="#14141a" stroke-width="2"/>
      <path d="M84,-3 H99 V4 Q99,10 91.5,10 Q84,10 84,4Z M101,-3 H116 V4 Q116,10 108.5,10 Q101,10 101,4Z" fill="#14141a" stroke="#000" stroke-width="1" stroke-linejoin="round"/>
      <path d="M86,-1 l5,0 M103,-1 l5,0" stroke="#6f7a99" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`;
    case 'mustache': return `<path d="M100,6 Q94,2 86,6 Q82,9 86,11 Q92,8 100,10 Q108,8 114,11 Q118,9 114,6 Q106,2 100,6Z" fill="#3a2418" stroke="#1d120b" stroke-width="1" stroke-linejoin="round"/>`;
    case 'cigarette': return `<g transform="rotate(12 105 11)"><rect x="105" y="9.4" width="19" height="3.8" rx="1.2" fill="#fff" stroke="#cfd2dc" stroke-width=".8"/>
      <rect x="105" y="9.4" width="5" height="3.8" rx="1.2" fill="#d9a066"/><rect x="121" y="9.4" width="3.6" height="3.8" rx="1" fill="#f28c28"/></g>
      <path d="M127,8 q-5,-5 0,-9 q5,-4 0,-9" stroke="#b9bcc8" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`;
  }
  return '';
}
function handItemSVG(h, k) {
  switch (h) {
    case 'dumbbell': return `<rect x="-11" y="-1.8" width="22" height="3.6" fill="#9aa0ad"/>
      <rect x="-14" y="-8" width="5" height="16" rx="1.6" fill="#3a3d48"/><rect x="9" y="-8" width="5" height="16" rx="1.6" fill="#3a3d48"/>
      <rect x="-18" y="-6" width="4" height="12" rx="1.4" fill="#555966"/><rect x="14" y="-6" width="4" height="12" rx="1.4" fill="#555966"/>`;
    case 'kettlebell': return `<path d="M-8,4 Q-9,-12 0,-12 Q9,-12 8,4" stroke="#2b2d36" stroke-width="3.6" fill="none"/>
      <circle cx="0" cy="12" r="12" fill="#3a3d48" stroke="#22232a" stroke-width="1.2"/><ellipse cx="-4" cy="8" rx="3.5" ry="2.5" fill="#fff" opacity=".18"/>`;
    case 'shaker': return `<rect x="-6.5" y="-16" width="13" height="5" rx="2" fill="#22232a"/><rect x="-4" y="-19" width="8" height="4" rx="1.5" fill="#22232a"/>
      <path d="M-7,-11 H7 L8,14 Q8,18 4,18 H-4 Q-8,18 -8,14Z" fill="#e8f1f7" stroke="#aebbc8" stroke-width="1"/>
      <path d="M-7.6,2 H7.8 L8,14 Q8,18 4,18 H-4 Q-8,18 -8,14Z" fill="#8a5a3a" opacity=".85"/><path d="M-5,-8 v5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'wine': return `<path d="M-9,-22 H9 Q10,-8 0,-6 Q-10,-8 -9,-22Z" fill="#dfe9f5" opacity=".75" stroke="#aebbc8" stroke-width="1.2"/>
      <path d="M-8.4,-14 H8.4 Q9,-8 0,-6.5 Q-9,-8 -8.4,-14Z" fill="#f2df7a"/>
      <circle cx="-2" cy="-10" r="1" fill="#fff" opacity=".8"/><circle cx="2.5" cy="-12" r="0.8" fill="#fff" opacity=".8"/>
      <path d="M3,-13 L8,-26" stroke="#e46aa8" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M0,-6 V12" stroke="#aebbc8" stroke-width="2.2"/><ellipse cx="0" cy="13" rx="8" ry="2.4" fill="#dfe9f5" stroke="#aebbc8" stroke-width="1"/>`;
  }
  return '';
}

export function fighterSVG(stage = 0, { powerUp = false, cls = '', intro = false, look = null } = {}) {
  const L = look ? normLook(look) : getLook();
  const C = palette(L);
  const fem = L.sex === 'f';
  const id = `f${++uidc}`;
  const m = [0, 0.16, 0.32, 0.48, 0.62, 0.76, 0.9, 1][stage] ?? 0;
  const tired = stage === 0 && !powerUp && !intro;
  const gold = stage >= 5;
  const torn = stage >= 6;
  const auraOn = stage >= 3 || powerUp || intro;
  const auraCol = gold || powerUp || intro ? '#ffd23f' : '#8fc4ff';
  const dy = tired ? 6 : 0; // Schultern/Kopf hängen
  const cx = 100;
  const hy = 62 + dy;       // Kopfmitte
  const shY = 98 + dy;
  const sw = fem ? 22 + 22 * m : 26 + 34 * m;  // halbe Schulterbreite
  const ww = fem ? 15 + 6 * m : 20 + 9 * m;    // halbe Taillenbreite
  const hw = fem ? ww + 6 + 2 * m : ww;        // halbe Hüftbreite
  const at = fem ? 5.5 + 6.5 * m : 6.5 + 10 * m; // Armdicke
  const nw = fem ? 5 + 3 * m : 6 + 5 * m;
  const o = L.outfit;
  const hairCol = gold ? HAIR_GOLD : C.hair;
  const eyeCol = gold ? '#1a7a8c' : INK;

  // Farben je Outfit
  const upperArm = o === 'suit' ? C.main : SKIN;
  const foreArm = o === 'suit' ? C.main : SKIN;
  const torsoFill = o === 'vest' ? SKIN : C.main;
  const pants = o === 'tank' || o === 'vest' ? C.accentDark : C.main;
  const boots = o === 'tank' || o === 'vest' ? C.main : C.accent;
  const band = o === 'vest' ? C.main : C.accent;

  // Arme: Schulter → Ellbogen → Faust
  const arm = (s) => {
    const sx = cx + s * (sw - 2), sy = shY + 4;
    const ex = cx + s * (sw + 8 + 6 * m), ey = shY + 40;
    const fx = cx + s * (sw + (tired ? 4 : 10) + 5 * m), fy = shY + (tired ? 78 : 72);
    const bx = (sx + ex) / 2 + s * at * 0.25, by = (sy + ey) / 2;
    const shoulder = o === 'gi' ? `<circle cx="${sx}" cy="${sy - 1}" r="${at * 1.2}" fill="${C.main}"/>`
      : o === 'vest' ? `<path d="M${sx - s * at * 1.3},${sy + at * 0.6} Q${sx},${sy - at * 1.9} ${sx + s * at * 1.5},${sy + at * 0.5} Z" fill="${C.main}"/>`
        : o === 'suit' ? `<circle cx="${sx}" cy="${sy - 1}" r="${at * 1.1}" fill="${C.main}"/>` : '';
    const stripe = o === 'suit' ? `<path d="M${sx + s * at * 0.6},${sy} L${ex + s * at * 0.6},${ey} L${fx + s * at * 0.5},${fy - 8}" stroke="${C.accent}" stroke-width="2.2" fill="none"/>` : '';
    return `
      <path d="M${sx},${sy} L${ex},${ey}" stroke="${upperArm}" stroke-width="${at * 2}" stroke-linecap="round"/>
      ${m > 0.3 ? `<ellipse cx="${bx}" cy="${by}" rx="${at * 1.12}" ry="${at * 1.55}" fill="${upperArm}" transform="rotate(${s * -12} ${bx} ${by})"/>
      ${o !== 'suit' ? `<path d="M${bx - s * at * 0.2},${by - at * 0.9} q${s * at * 0.7},${at * 0.6} 0,${at * 1.6}" stroke="${SKIN_SHADE}" stroke-width="1.5" fill="none" opacity=".7"/>` : ''}` : ''}
      <path d="M${ex},${ey} L${fx},${fy}" stroke="${foreArm}" stroke-width="${at * 1.75}" stroke-linecap="round"/>
      ${stripe}
      <path d="M${ex + (fx - ex) * 0.62},${ey + (fy - ey) * 0.62} L${ex + (fx - ex) * 0.86},${ey + (fy - ey) * 0.86}" stroke="${band}" stroke-width="${at * 1.95}" stroke-linecap="butt"/>
      <circle cx="${fx}" cy="${fy + 3}" r="${at * 0.95 + 2}" fill="${SKIN}"/>
      ${shoulder}`;
  };

  const torso = fem
    ? `M${cx - sw},${shY} Q${cx - sw - 2},${shY + 22} ${cx - ww},140 Q${cx - ww - 1},152 ${cx - hw},160 L${cx + hw},160 Q${cx + ww + 1},152 ${cx + ww},140 Q${cx + sw + 2},${shY + 22} ${cx + sw},${shY} Q${cx},${shY - 8} ${cx - sw},${shY} Z`
    : `M${cx - sw},${shY} Q${cx - sw - 5},${shY + 34} ${cx - ww},160 L${cx + ww},160 Q${cx + sw + 5},${shY + 34} ${cx + sw},${shY} Q${cx},${shY - 8} ${cx - sw},${shY} Z`;

  // Kleidungs-Details am Oberkörper
  let chest = '';
  if (o === 'gi') {
    chest = `<path d="M${cx - 9 - 5 * m},${shY - 4} L${cx},${shY + 22 + 8 * m} L${cx + 9 + 5 * m},${shY - 4} Z" fill="${C.accent}"/>`;
  } else if (o === 'tank') {
    chest = `<path d="M${cx - 10 - 3 * m},${shY - 4} Q${cx},${shY + 16 + 4 * m} ${cx + 10 + 3 * m},${shY - 4} Z" fill="${SKIN}"/>`;
  } else if (o === 'suit') {
    chest = `<path d="M${cx - 9},${shY - 5} L${cx},${shY + 8} L${cx + 9},${shY - 5}" stroke="${C.accent}" stroke-width="3" fill="none" stroke-linejoin="round"/>
      <path d="M${cx},${shY + 8} V152" stroke="${C.shade}" stroke-width="2"/>`;
  } else if (o === 'vest') {
    const abs = `<path d="M${cx},${shY + 30} V148 M${cx - 8},${shY + 34} h16 M${cx - 8},${shY + 44} h16 M${cx - 7},${shY + 53} h14" stroke="${SKIN_SHADE}" stroke-width="1.6" fill="none" opacity=".8"/>`;
    const top = fem ? `<path d="M${cx - sw + 6},${shY + 8} Q${cx},${shY + 2} ${cx + sw - 6},${shY + 8} L${cx + sw - 8},${shY + 28} Q${cx},${shY + 34} ${cx - sw + 8},${shY + 28} Z" fill="${C.accentDark}"/>` : '';
    const panel = (s) => `<path d="M${cx + s * sw},${shY} Q${cx + s * (sw + (fem ? 2 : 5))},${shY + (fem ? 22 : 34)} ${cx + s * hw},158 L${cx + s * (hw - 9)},158 L${cx + s * 11},${shY - 4} Z" fill="${C.main}"/>`;
    chest = `${fem ? '' : abs}${top}${panel(-1)}${panel(1)}`;
  }
  const pecs = !fem && m > 0.35 && o !== 'suit'
    ? `<path d="M${cx - 4},${shY + 16 + 6 * m} q-${8 + 10 * m},${8 + 3 * m} -${16 + 14 * m},0 M${cx + 4},${shY + 16 + 6 * m} q${8 + 10 * m},${8 + 3 * m} ${16 + 14 * m},0" stroke="${o === 'vest' ? SKIN_SHADE : C.shade}" stroke-width="2" fill="none" stroke-linecap="round"/>` : '';
  const tears = torn && o !== 'vest' ? `<g fill="${SKIN}">
      <path d="M${cx - ww - 2},150 l6,-9 3,7 4,-6 2,8 Z"/><path d="M${cx + ww * 0.3},151 l5,-8 3,6 4,-7 3,9 Z"/>
      <path d="M${cx + sw * 0.55},${shY + 20} l5,-3 -1,7 5,1 -6,5 Z"/></g>` : '';
  const belt = o === 'suit'
    ? `<rect x="${cx - hw - 1}" y="154" width="${hw * 2 + 2}" height="7" rx="3" fill="${C.shade}"/>`
    : `<rect x="${cx - hw - 2}" y="152" width="${hw * 2 + 4}" height="11" rx="3" fill="${o === 'vest' ? C.main : C.accent}"/>`;

  const legs = [-1, 1].map((s) => {
    const hip = cx + s * (hw - 1);
    const lt = fem ? 10 + 5 * m : 11 + 7 * m;
    const knee = cx + s * (fem ? hw - 3 : ww - 1);
    const stripe = o === 'suit' ? `<path d="M${hip + s * 1},164 Q${hip + s * (lt * 0.8)},196 ${knee},222" stroke="${C.accent}" stroke-width="2.2" fill="none"/>` : '';
    return `<path d="M${cx + s * 2},162 L${hip + s * 3},162 Q${hip + s * (lt * 0.9)},196 ${knee},226 L${cx + s * 5},226 Q${cx + s * 3},196 ${cx + s * 2},162 Z" fill="${pants}"/>
      ${stripe}
      <rect x="${s < 0 ? Math.min(cx - ww - 6, knee - 4) : cx + 1}" y="222" width="${Math.max(ww + 5, Math.abs(knee - cx) + 4)}" height="18" rx="6" fill="${boots}"/>`;
  }).join('');

  // ---- Haare ----
  let hairBack = '', hairFront = '';
  if (!fem) {
    const hair = gold
      ? `M76,${hy - 2} L70,${hy - 34} L84,${hy - 20} L82,${hy - 52} L94,${hy - 28} L100,${hy - 62} L106,${hy - 28} L118,${hy - 52} L116,${hy - 20} L130,${hy - 34} L124,${hy - 2} L114,${hy - 16} L100,${hy - 20} L86,${hy - 16} Z`
      : `M78,${hy} L68,${hy - 22} L81,${hy - 16} L76,${hy - 38} L91,${hy - 24} L97,${hy - 44} L104,${hy - 26} L117,${hy - 40} L115,${hy - 22} L131,${hy - 26} L122,${hy - 10} L132,${hy - 2} L118,${hy - 8} L120,${hy + 4} L110,${hy - 14} L100,${hy - 18} L90,${hy - 12} L84,${hy + 4} Z`;
    const bangs = gold
      ? `M90,${hy - 18} L96,${hy - 6} L100,${hy - 20} L104,${hy - 6} L110,${hy - 18} Z`
      : `M88,${hy - 14} L92,${hy - 2} L98,${hy - 15} L101,${hy - 4} L106,${hy - 16} L112,${hy - 3} L113,${hy - 15} Z`;
    hairFront = `<path d="${hair}" fill="${hairCol}"/><path d="${bangs}" fill="${hairCol}"/>`;
  } else {
    const tail = gold
      ? `M108,${hy - 22} L128,${hy - 48} L131,${hy - 26} L152,${hy - 32} L141,${hy - 10} L160,${hy + 2} L143,${hy + 10} L151,${hy + 32} L134,${hy + 18} L130,${hy + 36} L123,${hy + 6} Z`
      : `M108,${hy - 20} Q134,${hy - 34} 146,${hy - 10} Q154,${hy + 14} 142,${hy + 44} L139,${hy + 24} L132,${hy + 38} L131,${hy + 14} Q128,${hy - 4} 112,${hy - 8} Z`;
    hairBack = `<path d="${tail}" fill="${hairCol}"/>`;
    const cap = gold
      ? `M80,${hy + 6} L72,${hy - 26} L86,${hy - 18} L86,${hy - 46} L97,${hy - 24} L102,${hy - 54} L108,${hy - 24} L118,${hy - 44} L116,${hy - 16} L130,${hy - 24} L120,${hy + 6} L116,${hy - 8} L111,${hy - 9} L108,${hy - 17} L103,${hy - 10} L98,${hy - 18} L93,${hy - 10} L89,${hy - 16} L85,${hy - 8} Z`
      : `M80,${hy + 8} Q74,${hy - 26} 100,${hy - 27} Q126,${hy - 26} 120,${hy + 8} L117,${hy - 6} L112,${hy - 8} L109,${hy - 16} L103,${hy - 9} L98,${hy - 17} L93,${hy - 9} L89,${hy - 15} L85,${hy - 7} L82,${hy - 6} Z`;
    const locks = `M80,${hy - 6} Q75,${hy + 16} 80,${hy + 31} L84,${hy + 14} Q83,${hy + 4} 84,${hy - 4} Z M120,${hy - 6} Q125,${hy + 16} 120,${hy + 31} L116,${hy + 14} Q117,${hy + 4} 116,${hy - 4} Z`;
    hairFront = `<path d="${cap}" fill="${hairCol}"/><path d="${locks}" fill="${hairCol}"/>
      <circle cx="113" cy="${hy - 20}" r="3.2" fill="${C.accent}"/>`;
  }

  // Mit Hut (außer Stirnband): Haare nur als Pony/Strähnen unter dem Hut
  const hat = L.items.hat;
  if (hat && hat !== 'headband') {
    const bang = fem ? '' : `<path d="M88,${hy - 12} L92,${hy - 1} L98,${hy - 13} L101,${hy - 3} L106,${hy - 14} L112,${hy - 2} L113,${hy - 13} Z" fill="${hairCol}"/>`;
    const side = fem
      ? `<path d="M80,${hy - 6} Q75,${hy + 16} 80,${hy + 31} L84,${hy + 14} Q83,${hy + 4} 84,${hy - 4} Z M120,${hy - 6} Q125,${hy + 16} 120,${hy + 31} L116,${hy + 14} Q117,${hy + 4} 116,${hy - 4} Z M84,${hy - 14} Q100,${hy - 6} 116,${hy - 14} L112,${hy - 8} L104,${hy - 11} L96,${hy - 11} L88,${hy - 8}Z" fill="${hairCol}"/>`
      : `<path d="M80,${hy - 10} L79,${hy + 5} L85,${hy - 3} Z M120,${hy - 10} L121,${hy + 5} L115,${hy - 3} Z" fill="${hairCol}"/>`;
    hairFront = bang + side;
  }
  const hatG = hat ? `<g transform="translate(0 ${hy})">${hatSVG(hat, C, id)}</g>` : '';
  const faceG = L.items.face ? `<g transform="translate(0 ${hy})">${faceItemSVG(L.items.face)}</g>` : '';
  let handG = '';
  if (L.items.hand) {
    const hfx = cx + (sw + (tired ? 4 : 10) + 5 * m), hfy = shY + (tired ? 78 : 72) + 3;
    const hr = at * 0.95 + 2, k = 0.95 + 0.6 * m;
    handG = `<g class="f-item" transform="translate(${hfx} ${hfy}) scale(${k})">${handItemSVG(L.items.hand)}</g>
      <circle cx="${hfx}" cy="${hfy}" r="${hr * 0.9}" fill="${SKIN}"/><path d="M${hfx - hr * 0.5},${hfy - hr * 0.2} h${hr} M${hfx - hr * 0.5},${hfy + hr * 0.2} h${hr}" stroke="${SKIN_SHADE}" stroke-width="1.2" opacity=".8"/>`;
  }

  // ---- Gesicht ----
  const lash = fem ? `<path d="M86.5,${hy - 1} l-3,-2.4 M113.5,${hy - 1} l3,-2.4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` : '';
  const ery = fem ? 3.7 : 3.2;
  let eyes, mouth;
  if (L.face === 'happy') {
    eyes = `<path d="M87,${hy + 2} q5,-6 10,0 M103,${hy + 2} q5,-6 10,0" stroke="${eyeCol}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M86,${hy - 8} q5,-3 10,0 M104,${hy - 8} q5,-3 10,0" stroke="${INK}" stroke-width="2.1" fill="none" stroke-linecap="round"/>
      ${fem ? `<path d="M86.5,${hy + 1} l-3,-2 M113.5,${hy + 1} l3,-2" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` : ''}`;
    mouth = `<path d="M92,${hy + 9} q8,10 16,0 Z" fill="#6b1f1f" stroke="#7a3b2a" stroke-width="1.5" stroke-linejoin="round"/>`;
  } else if (L.face === 'cool') {
    eyes = `<path d="M87,${hy + 1} q5,-3.2 10,0 q-5,4.5 -10,0 Z M103,${hy + 1} q5,-3.2 10,0 q-5,4.5 -10,0 Z" fill="${eyeCol}"/>
      <path d="M86,${hy - 4} L96,${hy - 4} M104,${hy - 6} L114,${hy - 8}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>${lash}`;
    mouth = `<path d="M95,${hy + 12} q6,2.5 11,-3" stroke="#7a3b2a" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  } else {
    eyes = `<ellipse cx="92" cy="${hy + 1}" rx="2.6" ry="${ery}" fill="${eyeCol}"/><ellipse cx="108" cy="${hy + 1}" rx="2.6" ry="${ery}" fill="${eyeCol}"/>
      <path d="M86,${hy - 6} L96,${hy - 3} M114,${hy - 6} L104,${hy - 3}" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>${lash}`;
    mouth = tired ? `<path d="M95,${hy + 12} q2.5,-2 5,0 q2.5,2 5,0" stroke="#7a3b2a" stroke-width="1.8" fill="none"/>`
      : `<path d="M95,${hy + 11} q5,${stage >= 2 ? 3 : 1} 10,0" stroke="#7a3b2a" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }
  if (powerUp) mouth = `<ellipse cx="100" cy="${hy + 12}" rx="5" ry="4.5" fill="#6b1f1f"/>`;
  const introFace = `
    <g class="e-happy"><path d="M87,${hy + 2} q5,-6 10,0 M103,${hy + 2} q5,-6 10,0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>
    <g class="e-up"><ellipse cx="92" cy="${hy - 3}" rx="2.6" ry="${ery}" fill="${eyeCol}"/><ellipse cx="108" cy="${hy - 3}" rx="2.6" ry="${ery}" fill="${eyeCol}"/>
      <path d="M86,${hy - 8} L96,${hy - 4} M114,${hy - 8} L104,${hy - 4}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/></g>
    <path class="m-smile" d="M92,${hy + 9} q8,10 16,0 Z" fill="#6b1f1f" stroke="#7a3b2a" stroke-width="1.5" stroke-linejoin="round"/>
    <ellipse class="m-scream" cx="100" cy="${hy + 12}" rx="7" ry="8" fill="#6b1f1f"/><path class="m-scream" d="M94,${hy + 7} h12" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
  const sweat = tired ? `<path d="M126,${hy - 8} q5,8 0,11 q-5,-3 0,-11 Z" fill="#7cc4f2"/>` : '';

  const aura = auraOn ? `
    <g class="aura">
      <path d="M100,8 C140,30 170,70 168,140 C166,200 140,250 100,256 C60,250 34,200 32,140 C30,70 60,30 100,8 Z" fill="url(#${id}a)"/>
      <path d="M100,26 L112,6 L116,36 L134,18 L130,52 L152,44 L140,80 M100,26 L88,6 L84,36 L66,18 L70,52 L48,44 L60,80" stroke="${auraCol}" stroke-width="3" fill="none" opacity=".55" stroke-linejoin="round"/>
    </g>` : '';
  const bolts = stage >= 6 || (powerUp && stage >= 5) ? `
    <g class="bolts" stroke="#b9f3ff" stroke-width="2.4" fill="none" stroke-linejoin="round">
      <path class="bolt" d="M40,96 l12,10 -8,6 14,12"/><path class="bolt b2" d="M160,84 l-12,12 8,4 -14,14"/>
      <path class="bolt b3" d="M52,176 l10,-6 2,10 12,-8"/><path class="bolt" d="M150,186 l-8,-10 -4,8 -10,-8"/>
    </g>` : '';
  const particles = powerUp ? `<g class="particles" stroke="${auraCol}" stroke-width="2.5" stroke-linecap="round">
      <path d="M30,230 v-14"/><path d="M60,246 v-18"/><path d="M140,246 v-18"/><path d="M172,232 v-14"/><path d="M100,256 v-12"/></g>` : '';

  const hrx = fem ? 19 : 20, hry = fem ? 21 : 22;
  return `<svg class="fighter ${cls} st${stage} ${powerUp ? 'power' : ''} ${intro ? 'f-intro' : ''}" viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" aria-label="Kämpfer Stufe ${stage}">
    <defs>
      <radialGradient id="${id}a" cx="50%" cy="55%" r="55%">
        <stop offset="0" stop-color="${auraCol}" stop-opacity=".0"/>
        <stop offset=".55" stop-color="${auraCol}" stop-opacity=".25"/>
        <stop offset="1" stop-color="${auraCol}" stop-opacity=".0"/>
      </radialGradient>
    </defs>
    ${aura}
    <ellipse cx="100" cy="244" rx="${46 + 16 * m}" ry="6" fill="#000" opacity=".18"/>
    <g class="body">
      ${legs}
      <rect x="${cx - nw}" y="${hy + 14}" width="${nw * 2}" height="${shY - hy - 8}" fill="${SKIN}"/>
      ${arm(-1)}${arm(1)}
      <path d="${torso}" fill="${torsoFill}"/>
      ${chest}${pecs}${tears}
      ${belt}
      ${handG}
      <g class="f-head" style="transform-origin:100px ${hy + 22}px">
        ${hairBack}
        <circle cx="${fem ? 81 : 80}" cy="${hy + 3}" r="${fem ? 4.5 : 5}" fill="${SKIN}"/><circle cx="${fem ? 119 : 120}" cy="${hy + 3}" r="${fem ? 4.5 : 5}" fill="${SKIN}"/>
        <ellipse cx="100" cy="${hy + 2}" rx="${hrx}" ry="${hry}" fill="${SKIN}"/>
        ${hairFront}
        ${intro ? introFace : `${eyes}${mouth}${sweat}`}
        ${faceG}${hatG}
      </g>
    </g>
    ${bolts}${particles}
  </svg>`;
}

// Kämpfer mit Licht-/Feuer-Effekt. enter = Auftritts-Animation (beim Öffnen der Seite)
const FLAMES = [[8, 0.0, 0.62], [22, 0.25, 0.85], [36, 0.1, 1], [50, 0.35, 1.08], [64, 0.05, 1], [78, 0.3, 0.85], [92, 0.15, 0.62]];
const SPARKS = [[12, 0.2], [24, 0.9], [33, 0.5], [45, 1.2], [52, 0.1], [61, 0.7], [70, 1.4], [79, 0.4], [88, 1.0], [40, 1.6], [58, 1.9]];

export function fighterFx(stage = 0, { enter = false, powerUp = false, look = null } = {}) {
  const idle = stage >= 3;
  return `<div class="fx-wrap fx-st${stage} ${enter ? 'fx-enter' : ''} ${idle ? 'fx-idle' : ''}">
    <div class="fx-glow"></div>
    <div class="fx-fire">${FLAMES.map(([x, d, h]) => `<i style="--x:${x}%;--d:${d}s;--h:${h}"><b></b></i>`).join('')}</div>
    ${fighterSVG(stage, { powerUp, look })}
    <div class="fx-sparks">${SPARKS.map(([x, d]) => `<span style="--x:${x}%;--d:${d}s"></span>`).join('')}</div>
    <div class="fx-flash"></div>
  </div>`;
}

// Nur der Kopf (für Avatare in Listen)
export function fighterHead(stage = 0, look = null) {
  const L = normLook(look || getLook());
  return fighterSVG(stage, { look: { ...L, items: { ...L.items, hand: null } }, cls: 'head-only' }).replace('viewBox="0 0 200 260"', 'viewBox="50 0 100 100"');
}
