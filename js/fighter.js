// Eigene Kämpfer-Figur (inspiriert von Anime-Kampfkünstlern) als parametrisches SVG.
// Aussehen (Figur, Haare, Kleidung, Gesicht) kommt aus look.js; Stufe 0–7 verwandelt automatisch:
// Muskelmasse wächst, ab Stufe 3 Aura, ab 5 goldene Haare, ab 6 zerrissener Anzug + Blitze.

import { getLook, normLook, palette } from './look.js';

let uidc = 0;
const SKIN = '#f3c9a0';
const SKIN_SHADE = '#e0ae82';
const HAIR_GOLD = '#ffd23f';
const INK = '#222';

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
      <g class="f-head" style="transform-origin:100px ${hy + 22}px">
        ${hairBack}
        <circle cx="${fem ? 81 : 80}" cy="${hy + 3}" r="${fem ? 4.5 : 5}" fill="${SKIN}"/><circle cx="${fem ? 119 : 120}" cy="${hy + 3}" r="${fem ? 4.5 : 5}" fill="${SKIN}"/>
        <ellipse cx="100" cy="${hy + 2}" rx="${hrx}" ry="${hry}" fill="${SKIN}"/>
        ${hairFront}
        ${intro ? introFace : `${eyes}${mouth}${sweat}`}
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
  return fighterSVG(stage, { look, cls: 'head-only' }).replace('viewBox="0 0 200 260"', 'viewBox="50 0 100 100"');
}
