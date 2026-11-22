// Eigene Kämpfer-Figur (inspiriert von Anime-Kampfkünstlern) als parametrisches SVG.
// Stufe 0–5: Muskelmasse, Haarfarbe, Aura und Blitze wachsen mit der Streak.

let uidc = 0;
const SKIN = '#f3c9a0';
const SKIN_SHADE = '#e0ae82';
const GI = '#f28c28';
const GI_SHADE = '#d9741a';
const BLUE = '#2b4fa8';
const HAIR_DARK = '#1d1d22';
const HAIR_GOLD = '#ffd23f';

export function fighterSVG(stage = 0, { powerUp = false, cls = '', intro = false } = {}) {
  const id = `f${++uidc}`;
  const m = [0, 0.16, 0.32, 0.48, 0.62, 0.76, 0.9, 1][stage] ?? 0;
  const tired = stage === 0 && !powerUp && !intro;
  const gold = stage >= 5;
  const auraOn = stage >= 3 || powerUp || intro;
  const auraCol = gold || powerUp || intro ? '#ffd23f' : '#8fc4ff';
  const dy = tired ? 6 : 0; // Schultern/Kopf hängen
  const cx = 100;
  const headY = 62 + dy;
  const shY = 98 + dy;
  const sw = 26 + 34 * m;   // halbe Schulterbreite
  const ww = 20 + 9 * m;    // halbe Taillenbreite
  const at = 6.5 + 10 * m;  // Armdicke
  const nw = 6 + 5 * m;

  // Arme: Schulter → Ellbogen → Faust
  const arm = (s) => {
    const sx = cx + s * (sw - 2), sy = shY + 4;
    const ex = cx + s * (sw + 8 + 6 * m), ey = shY + 40;
    const fx = cx + s * (sw + (tired ? 4 : 10) + 5 * m), fy = shY + (tired ? 78 : 72);
    const bx = (sx + ex) / 2 + s * at * 0.25, by = (sy + ey) / 2;
    return `
      <path d="M${sx},${sy} L${ex},${ey}" stroke="${SKIN}" stroke-width="${at * 2}" stroke-linecap="round"/>
      ${m > 0.3 ? `<ellipse cx="${bx}" cy="${by}" rx="${at * 1.12}" ry="${at * 1.55}" fill="${SKIN}" transform="rotate(${s * -12} ${bx} ${by})"/>
      <path d="M${bx - s * at * 0.2},${by - at * 0.9} q${s * at * 0.7},${at * 0.6} 0,${at * 1.6}" stroke="${SKIN_SHADE}" stroke-width="1.5" fill="none" opacity=".7"/>` : ''}
      <path d="M${ex},${ey} L${fx},${fy}" stroke="${SKIN}" stroke-width="${at * 1.75}" stroke-linecap="round"/>
      <path d="M${ex + (fx - ex) * 0.62},${ey + (fy - ey) * 0.62} L${ex + (fx - ex) * 0.86},${ey + (fy - ey) * 0.86}" stroke="${BLUE}" stroke-width="${at * 1.95}" stroke-linecap="butt"/>
      <circle cx="${fx}" cy="${fy + 3}" r="${at * 0.95 + 2}" fill="${SKIN}"/>
      <circle cx="${sx}" cy="${sy - 1}" r="${at * 1.2}" fill="${GI}"/>`;
  };

  const torso = `M${cx - sw},${shY} Q${cx - sw - 5},${shY + 34} ${cx - ww},160 L${cx + ww},160 Q${cx + sw + 5},${shY + 34} ${cx + sw},${shY} Q${cx},${shY - 8} ${cx - sw},${shY} Z`;
  const vneck = `M${cx - 9 - 5 * m},${shY - 4} L${cx},${shY + 22 + 8 * m} L${cx + 9 + 5 * m},${shY - 4} Z`;
  const pecs = m > 0.35 ? `<path d="M${cx - 4},${shY + 16 + 6 * m} q-${8 + 10 * m},${8 + 3 * m} -${16 + 14 * m},0 M${cx + 4},${shY + 16 + 6 * m} q${8 + 10 * m},${8 + 3 * m} ${16 + 14 * m},0" stroke="${GI_SHADE}" stroke-width="2" fill="none" stroke-linecap="round"/>` : '';

  const legs = [-1, 1].map((s) => {
    const hip = cx + s * (ww - 1);
    const lt = 11 + 7 * m;
    return `<path d="M${cx + s * 2},162 L${hip + s * 3},162 Q${hip + s * (lt * 0.9)},196 ${cx + s * (ww - 1)},226 L${cx + s * 5},226 Q${cx + s * 3},196 ${cx + s * 2},162 Z" fill="${GI}"/>
      <rect x="${s < 0 ? cx - ww - 6 : cx + 1}" y="222" width="${ww + 5}" height="18" rx="6" fill="${BLUE}"/>`;
  }).join('');

  const hair = gold
    ? `M76,${headY - 2} L70,${headY - 34} L84,${headY - 20} L82,${headY - 52} L94,${headY - 28} L100,${headY - 62} L106,${headY - 28} L118,${headY - 52} L116,${headY - 20} L130,${headY - 34} L124,${headY - 2} L114,${headY - 16} L100,${headY - 20} L86,${headY - 16} Z`
    : `M78,${headY} L68,${headY - 22} L81,${headY - 16} L76,${headY - 38} L91,${headY - 24} L97,${headY - 44} L104,${headY - 26} L117,${headY - 40} L115,${headY - 22} L131,${headY - 26} L122,${headY - 10} L132,${headY - 2} L118,${headY - 8} L120,${headY + 4} L110,${headY - 14} L100,${headY - 18} L90,${headY - 12} L84,${headY + 4} Z`;
  const bangs = gold
    ? `M90,${headY - 18} L96,${headY - 6} L100,${headY - 20} L104,${headY - 6} L110,${headY - 18} Z`
    : `M88,${headY - 14} L92,${headY - 2} L98,${headY - 15} L101,${headY - 4} L106,${headY - 16} L112,${headY - 3} L113,${headY - 15} Z`;

  const eyes = tired
    ? `<path d="M88,${headY + 1} h8 M104,${headY + 1} h8" stroke="#222" stroke-width="2.4" stroke-linecap="round"/>`
    : `<ellipse cx="92" cy="${headY + 1}" rx="2.6" ry="3.2" fill="${gold ? '#1a7a8c' : '#222'}"/><ellipse cx="108" cy="${headY + 1}" rx="2.6" ry="3.2" fill="${gold ? '#1a7a8c' : '#222'}"/>
       <path d="M86,${headY - 6} L96,${headY - 3} M114,${headY - 6} L104,${headY - 3}" stroke="#222" stroke-width="2.4" stroke-linecap="round"/>`;
  const eyeCol = gold ? '#1a7a8c' : '#222';
  const introFace = `
    <g class="e-happy"><path d="M87,${headY + 2} q5,-6 10,0 M103,${headY + 2} q5,-6 10,0" stroke="#222" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>
    <g class="e-up"><ellipse cx="92" cy="${headY - 3}" rx="2.6" ry="3.2" fill="${eyeCol}"/><ellipse cx="108" cy="${headY - 3}" rx="2.6" ry="3.2" fill="${eyeCol}"/>
      <path d="M86,${headY - 8} L96,${headY - 4} M114,${headY - 8} L104,${headY - 4}" stroke="#222" stroke-width="2.6" stroke-linecap="round"/></g>
    <path class="m-smile" d="M92,${headY + 9} q8,10 16,0 Z" fill="#6b1f1f" stroke="#7a3b2a" stroke-width="1.5" stroke-linejoin="round"/>
    <ellipse class="m-scream" cx="100" cy="${headY + 12}" rx="7" ry="8" fill="#6b1f1f"/><path class="m-scream" d="M94,${headY + 7} h12" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
  const mouth = powerUp
    ? `<ellipse cx="100" cy="${headY + 12}" rx="5" ry="4.5" fill="#6b1f1f"/>`
    : tired ? `<path d="M95,${headY + 12} q2.5,-2 5,0 q2.5,2 5,0" stroke="#7a3b2a" stroke-width="1.8" fill="none"/>`
      : `<path d="M95,${headY + 11} q5,${stage >= 2 ? 3 : 1} 10,0" stroke="#7a3b2a" stroke-width="2" fill="none" stroke-linecap="round"/>`;

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
  const sweat = tired ? `<path d="M126,${headY - 8} q5,8 0,11 q-5,-3 0,-11 Z" fill="#7cc4f2"/>` : '';
  const particles = powerUp ? `<g class="particles" stroke="${auraCol}" stroke-width="2.5" stroke-linecap="round">
      <path d="M30,230 v-14"/><path d="M60,246 v-18"/><path d="M140,246 v-18"/><path d="M172,232 v-14"/><path d="M100,256 v-12"/></g>` : '';

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
      <rect x="${cx - nw}" y="${headY + 14}" width="${nw * 2}" height="${shY - headY - 8}" fill="${SKIN}"/>
      ${arm(-1)}${arm(1)}
      <path d="${torso}" fill="${GI}"/>
      <path d="${vneck}" fill="${BLUE}"/>
      ${pecs}
      <rect x="${cx - ww - 2}" y="152" width="${ww * 2 + 4}" height="11" rx="3" fill="${BLUE}"/>
      <g class="f-head" style="transform-origin:100px ${headY + 22}px">
        <circle cx="80" cy="${headY + 3}" r="5" fill="${SKIN}"/><circle cx="120" cy="${headY + 3}" r="5" fill="${SKIN}"/>
        <ellipse cx="100" cy="${headY + 2}" rx="20" ry="22" fill="${SKIN}"/>
        <path d="${hair}" fill="${gold ? HAIR_GOLD : HAIR_DARK}"/>
        <path d="${bangs}" fill="${gold ? HAIR_GOLD : HAIR_DARK}"/>
        ${intro ? introFace : `${eyes}${mouth}${sweat}`}
      </g>
    </g>
    ${bolts}${particles}
  </svg>`;
}

// Kämpfer mit Licht-/Feuer-Effekt. enter = Auftritts-Animation (beim Öffnen der Seite)
const FLAMES = [[8, 0.0, 0.62], [22, 0.25, 0.85], [36, 0.1, 1], [50, 0.35, 1.08], [64, 0.05, 1], [78, 0.3, 0.85], [92, 0.15, 0.62]];
const SPARKS = [[12, 0.2], [24, 0.9], [33, 0.5], [45, 1.2], [52, 0.1], [61, 0.7], [70, 1.4], [79, 0.4], [88, 1.0], [40, 1.6], [58, 1.9]];

export function fighterFx(stage = 0, { enter = false, powerUp = false } = {}) {
  const idle = stage >= 3;
  return `<div class="fx-wrap fx-st${stage} ${enter ? 'fx-enter' : ''} ${idle ? 'fx-idle' : ''}">
    <div class="fx-glow"></div>
    <div class="fx-fire">${FLAMES.map(([x, d, h]) => `<i style="--x:${x}%;--d:${d}s;--h:${h}"><b></b></i>`).join('')}</div>
    ${fighterSVG(stage, { powerUp })}
    <div class="fx-sparks">${SPARKS.map(([x, d]) => `<span style="--x:${x}%;--d:${d}s"></span>`).join('')}</div>
    <div class="fx-flash"></div>
  </div>`;
}
