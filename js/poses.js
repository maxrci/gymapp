// Animierte Kämpfer-Posen: die Figur macht Übungen vor (Seitenansicht, Blick nach rechts)
// Winkel in Grad, SVG-Konvention: 0 = rechts, 90 = unten, -90 = oben, 180 = links.

const L = { torso: 50, neck: 8, head: 12, ua: 28, fa: 26, th: 36, sh: 34 };
const GROUND = 182, CX = 110, BAR = 30;
import { getLook, palette, lookKey } from './look.js';

const C = {
  gi: '#f28c28', giF: '#cf6d14', skin: '#f3c9a0', skinF: '#dcae84',
  blue: '#2b4fa8', blueF: '#223f86', hair: '#1d1d22', gold: '#ffd23f', plate: '#3b3b40', plateIn: '#5b5b62', fem: false,
};
// Farben der Figur an den eigenen Kämpfer anpassen
let lastLook = '';
function syncLook() {
  const k = lookKey();
  if (k === lastLook) return;
  lastLook = k;
  const l = getLook();
  const p = palette(l);
  const darker = (hex, f = 0.85) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');
  const top = p.main;
  Object.assign(C, {
    gi: top, giF: darker(top), blue: p.accent, blueF: darker(p.accent),
    legs: l.outfit === 'tank' || l.outfit === 'vest' ? p.accentDark : top,
    hair: p.hair, fem: l.sex === 'f',
    arm: l.outfit === 'suit' ? top : '#f3c9a0', armF: l.outfit === 'suit' ? darker(top) : '#dcae84',
  });
  C.legsF = darker(C.legs);
}

const rad = (a) => (a * Math.PI) / 180;
const dir = (a) => [Math.cos(rad(a)), Math.sin(rad(a))];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const mul = (p, k) => [p[0] * k, p[1] * k];
const ang = (p, q) => (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
const lerp = (a, b, u) => a + (b - a) * u;

// Zwei-Gelenk-IK: Gelenkpunkt zwischen A und B (bend = ±1 wählt die Knick-Richtung)
function ik(A, B, l1, l2, bend = 1) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  let d = Math.hypot(dx, dy);
  d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, d));
  const ux = dx / (Math.hypot(dx, dy) || 1), uy = dy / (Math.hypot(dx, dy) || 1);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return [A[0] + ux * a - uy * h * bend, A[1] + uy * a + ux * h * bend];
}

// ---------- Vorwärtskinematik ----------
function fk(s) {
  const J = { hip: s.hip ? [...s.hip] : [100, 100] };
  const t = s.t ?? -90;
  J.t = t;
  J.bend = s.bend || 0;
  J.sh = add(J.hip, mul(dir(t), L.torso));
  J.ha = s.h ?? t;
  J.neck = add(J.sh, mul(dir(J.ha), L.neck));
  J.head = add(J.sh, mul(dir(J.ha), L.neck + L.head));
  for (const k of ['f', 'n']) {
    const aik = s[`a${k}IK`];
    if (aik) { J[`h${k}`] = [aik[0], aik[1]]; J[`e${k}`] = ik(J.sh, J[`h${k}`], L.ua, L.fa, aik[2] ?? 1); }
    else {
      const [ua, fa] = s[`a${k}`] || [90, 90];
      J[`e${k}`] = add(J.sh, mul(dir(ua), L.ua));
      J[`h${k}`] = add(J[`e${k}`], mul(dir(fa), L.fa));
    }
    const lik = s[`l${k}IK`];
    if (lik) { J[`f${k}`] = [lik[0], lik[1]]; J[`k${k}`] = ik(J.hip, J[`f${k}`], L.th, L.sh, lik[2] ?? 1); }
    else {
      const [th, sh] = s[`l${k}`] || [90, 90];
      J[`k${k}`] = add(J.hip, mul(dir(th), L.th));
      J[`f${k}`] = add(J[`k${k}`], mul(dir(sh), L.sh));
    }
    J[`boot${k}`] = ang(J[`k${k}`], J[`f${k}`]) + (s.bootRel ?? -90);
  }
  J.lift = s.lift || 0;
  return J;
}

const PTS = [['head', 12], ['sh', 10], ['hip', 9], ['kn', 7], ['kf', 7], ['fn', 4.5], ['ff', 4.5], ['hn', 5.5], ['hf', 5.5], ['en', 5], ['ef', 5]];
function shift(J, dx, dy) {
  for (const k of Object.keys(J)) if (Array.isArray(J[k]) && J[k].length === 2 && typeof J[k][0] === 'number') J[k] = [J[k][0] + dx, J[k][1] + dy];
  return J;
}
// ---------- Zeichnen ----------
const seg = (p, q, w, col) => `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
const circ = (p, r, col, extra = '') => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${r}" fill="${col}" ${extra}/>`;
const P = 'style="stroke:var(--pose-prop);fill:none;stroke-linecap:round;stroke-linejoin:round"';
const PF = 'style="fill:var(--pose-prop-fill);stroke:var(--pose-prop);stroke-width:2"';

function boot(f, a, col) {
  const d = dir(a);
  const toe = add(f, mul(d, 9));
  const heel = add(f, mul(d, -3));
  return seg(heel, toe, 8, col);
}
function weight(kind, p) {
  if (kind === 'bb') return `${circ(p, 14, C.plate)}${circ(p, 5, C.plateIn)}`;
  if (kind === 'db') return `<rect x="${(p[0] - 9).toFixed(1)}" y="${(p[1] - 3).toFixed(1)}" width="18" height="6" rx="2" fill="${C.plateIn}"/>${circ([p[0] - 8, p[1]], 6, C.plate)}${circ([p[0] + 8, p[1]], 6, C.plate)}`;
  if (kind === 'handle') return `<rect x="${(p[0] - 7).toFixed(1)}" y="${(p[1] - 2.5).toFixed(1)}" width="14" height="5" rx="2.5" fill="${C.plateIn}"/>`;
  return '';
}

function hair(J, gold) {
  const rot = J.ha + 90;
  const h = gold
    ? 'M-12,3 L-19,-8 L-11,-9 L-15,-25 L-6,-15 L-2,-31 L3,-16 L10,-27 L9,-13 L17,-16 L12,-5 L14,1 L6,-6 L0,-9 L-6,-6 Z'
    : 'M-12,3 L-21,-3 L-13,-7 L-19,-17 L-9,-14 L-8,-25 L-1,-15 L5,-24 L7,-13 L15,-17 L11,-7 L14,-1 L6,-6 L0,-9 L-6,-5 Z';
  return `<g transform="translate(${J.head[0].toFixed(1)},${J.head[1].toFixed(1)}) rotate(${rot.toFixed(1)})">
    ${C.fem ? `<path d="M-6,-9 Q-22,-12 -24,3 Q-25,14 -18,22 L-18,10 L-13,16 L-13,4 Q-12,-2 -4,-4 Z" fill="${gold ? C.gold : C.hair}"/>` : ''}
    ${circ([0, 0], 12, C.skin)}
    <path d="${h}" fill="${gold ? C.gold : C.hair}"/>
    <ellipse cx="6" cy="0" rx="1.7" ry="2.2" fill="#222"/>
    <path d="M3,-5 L9,-4" stroke="#222" stroke-width="1.8" stroke-linecap="round"/>
  </g>`;
}

function figure(J, M, stage) {
  const m = [0, 0.16, 0.32, 0.48, 0.62, 0.76, 0.9, 1][stage] ?? 0.4;
  const w = { torso: 21 + 6 * m, th: 13 + 3 * m, sh: 11 + 2 * m, ua: 9 + 4 * m, fa: 8 + 3 * m };
  const hold = M.hold;
  const leg = (k, gi, blue) => `${seg(J.hip, J[`k${k}`], w.th, gi)}${seg(J[`k${k}`], J[`f${k}`], w.sh, gi)}${boot(J[`f${k}`], J[`boot${k}`], blue)}`;
  if (C.fem) { w.torso -= 3; w.ua -= 1.5; w.fa -= 1; }
  const arm = (k, skin, blue) => {
    const e = J[`e${k}`], h = J[`h${k}`];
    const wb = add(e, mul([h[0] - e[0], h[1] - e[1]], 0.72));
    return `${seg(J.sh, e, w.ua, skin)}${seg(e, h, w.fa, skin)}${seg(wb, add(e, mul([h[0] - e[0], h[1] - e[1]], 0.9)), w.fa + 1.5, blue)}${circ(h, 4.8 + m, k === 'f' ? C.skinF : C.skin)}`;
  };
  // Oberkörper (mit Krümmung)
  const u = dir(J.t);
  const nrm = [-u[1], u[0]];
  const mid = [(J.hip[0] + J.sh[0]) / 2 + nrm[0] * J.bend, (J.hip[1] + J.sh[1]) / 2 + nrm[1] * J.bend];
  const torso = `<path d="M${J.hip[0].toFixed(1)},${J.hip[1].toFixed(1)} Q${mid[0].toFixed(1)},${mid[1].toFixed(1)} ${J.sh[0].toFixed(1)},${J.sh[1].toFixed(1)}" stroke="${C.gi}" stroke-width="${w.torso}" stroke-linecap="round" fill="none"/>`;
  const beltA = add(J.hip, mul(u, 4)), beltB = add(J.hip, mul(u, 9));
  return `
    ${leg('f', C.legsF, C.blueF)}
    ${arm('f', C.armF || C.skinF, C.blueF)}${hold && hold !== 'bbBack' ? weight(hold, J.hf) : ''}
    ${seg(J.sh, J.neck, 9, C.skin)}
    ${torso}
    ${seg(beltA, beltB, w.torso + 1, C.blue)}
    ${hair(J, stage >= 5)}
    ${circ(J.sh, w.ua / 2 + 3.5, C.gi)}
    ${leg('n', C.legs, C.blue)}
    ${hold === 'bbBack' ? weight('bb', add(J.sh, [-2, -6])) : ''}
    ${arm('n', C.arm || C.skin, C.blue)}${hold && hold !== 'bbBack' ? weight(hold, J.hn) : ''}`;
}

// ---------- Requisiten ----------
function props(J, M) {
  const out = [];
  const list = M.props || [];
  const shadowX = (J.fn[0] + J.ff[0]) / 2;
  if (M.anchor !== 'hands' && M.anchor !== 'fixed') out.push(`<ellipse cx="${shadowX.toFixed(1)}" cy="${GROUND + 2}" rx="46" ry="4" style="fill:var(--pose-shadow)"/>`);
  for (const p of list) {
    if (p === 'mat') out.push(`<rect x="12" y="${GROUND}" width="196" height="5" rx="2.5" style="fill:var(--pose-mat)"/>`);
    if (p === 'bench') {
      const x1 = Math.min(J.sh[0], J.hip[0]) - 16, x2 = Math.max(J.sh[0], J.hip[0]) + 8;
      const y = Math.max(J.sh[1], J.hip[1]) + 10;
      out.push(`<rect x="${x1.toFixed(1)}" y="${y.toFixed(1)}" width="${(x2 - x1).toFixed(1)}" height="7" rx="3" ${PF}/><path d="M${(x1 + 10).toFixed(1)},${(y + 7).toFixed(1)} V${GROUND} M${(x2 - 10).toFixed(1)},${(y + 7).toFixed(1)} V${GROUND}" ${P} stroke-width="4"/>`);
    }
    if (p === 'block') {
      const y = J.sh[1] + 9;
      out.push(`<rect x="${(J.sh[0] - 22).toFixed(1)}" y="${y.toFixed(1)}" width="30" height="${(GROUND - y).toFixed(1)}" rx="3" ${PF}/>`);
    }
    if (p === 'bar') out.push(`<path d="M${(J.hn[0] - 60).toFixed(1)},${(J.hn[1] - 1).toFixed(1)} H${(J.hn[0] + 60).toFixed(1)} M${(J.hn[0] - 56).toFixed(1)},${(J.hn[1] - 1).toFixed(1)} V${GROUND} M${(J.hn[0] + 56).toFixed(1)},${(J.hn[1] - 1).toFixed(1)} V${GROUND}" ${P} stroke-width="4"/>`);
    if (p === 'dipbars') out.push(`<path d="M${(J.hn[0] - 34).toFixed(1)},${(J.hn[1] + 3).toFixed(1)} H${(J.hn[0] + 34).toFixed(1)} M${(J.hn[0] - 28).toFixed(1)},${(J.hn[1] + 3).toFixed(1)} V${GROUND} M${(J.hn[0] + 28).toFixed(1)},${(J.hn[1] + 3).toFixed(1)} V${GROUND}" ${P} stroke-width="4"/>`);
    if (p === 'seat') {
      const y = J.hip[1] + 9;
      out.push(`<rect x="${(J.hip[0] - 18).toFixed(1)}" y="${y.toFixed(1)}" width="34" height="6" rx="3" ${PF}/><path d="M${J.hip[0].toFixed(1)},${(y + 6).toFixed(1)} V${GROUND} M${(J.hip[0] - 16).toFixed(1)},${GROUND} H${(J.hip[0] + 16).toFixed(1)}" ${P} stroke-width="4"/>`);
    }
    if (p === 'backrest') {
      const u = dir(J.t);
      const a = add(J.hip, add(mul([u[1], -u[0]], -13), mul(u, -4)));
      const b = add(a, mul(u, 52));
      out.push(seg(a, b, 6, 'var(--pose-prop)').replace('stroke="var(--pose-prop)"', 'style="stroke:var(--pose-prop)"'));
    }
    if (p === 'pulldown') out.push(`<path d="M${(J.hn[0] - 16).toFixed(1)},${J.hn[1].toFixed(1)} H${(J.hn[0] + 16).toFixed(1)} M${J.hn[0].toFixed(1)},${J.hn[1].toFixed(1)} V8" ${P} stroke-width="3"/>`);
    if (p === 'cableUp') out.push(`<path d="M${J.hn[0].toFixed(1)},${J.hn[1].toFixed(1)} L${(J.hn[0] + 6).toFixed(1)},14" ${P} stroke-width="2"/><circle cx="${(J.hn[0] + 6).toFixed(1)}" cy="12" r="5" ${PF}/>`);
    if (p === 'cableFwd') out.push(`<path d="M${J.hn[0].toFixed(1)},${J.hn[1].toFixed(1)} L206,${(J.hn[1] + 4).toFixed(1)}" ${P} stroke-width="2"/>`);
    if (p === 'pad') out.push(circ(add(J.fn, [2, -3]), 6, 'var(--pose-prop)').replace('fill="var(--pose-prop)"', 'style="fill:var(--pose-prop)"'));
    if (p === 'step') out.push(`<rect x="${(J.fn[0] - 6).toFixed(1)}" y="${GROUND - 6}" width="26" height="8" rx="2" ${PF}/>`);
    if (p === 'wallFront') out.push(`<path d="M${(J.fn[0] + 30).toFixed(1)},40 V${GROUND}" ${P} stroke-width="5"/>`);
    if (p === 'wallBack') out.push(`<path d="M${(J.ff[0] - 8).toFixed(1)},70 V${GROUND}" ${P} stroke-width="5"/>`);
    if (p === 'pole') out.push(`<path d="M${(J.hf[0] + 4).toFixed(1)},${(J.hf[1] - 30).toFixed(1)} V${GROUND}" ${P} stroke-width="4"/>`);
    if (p === 'legpress') {
      const u = dir(ang(J.kn, J.fn) - 90);
      const a = add(J.fn, mul(u, 16)), b = add(J.fn, mul(u, -16));
      out.push(`<path d="M${(a[0] + 5).toFixed(1)},${a[1].toFixed(1)} L${(b[0] + 5).toFixed(1)},${b[1].toFixed(1)}" ${P} stroke-width="6"/><path d="M60,${GROUND - 4} L200,${GROUND - 70}" ${P} stroke-width="3" opacity=".6"/>`);
    }
  }
  return out.join('');
}

// ---------- Geräte für Cardio ----------
function machine(kind, J) {
  if (kind === 'treadmill') return `<rect x="34" y="${GROUND}" width="150" height="9" rx="4.5" ${PF}/><path d="M184,${GROUND} L172,92 L150,96" ${P} stroke-width="5"/>`;
  if (kind === 'bike') return `<path d="M96,112 L92,${GROUND} M60,${GROUND} H170 M150,${GROUND} L152,92 L162,90" ${P} stroke-width="5"/><circle cx="146" cy="158" r="17" ${PF}/><circle cx="118" cy="158" r="4" style="fill:var(--pose-prop)"/><rect x="84" y="108" width="24" height="6" rx="3" style="fill:var(--pose-prop)"/>`;
  if (kind === 'elliptical') return `<path d="M60,${GROUND} H178 M168,${GROUND} L160,64" ${P} stroke-width="5"/><path d="M160,64 L${J.hn[0].toFixed(1)},${J.hn[1].toFixed(1)} M160,64 L${J.fn[0].toFixed(1)},${(J.fn[1] + 4).toFixed(1)}" ${P} stroke-width="3"/>`;
  if (kind === 'rower') return `<path d="M30,172 H170 M40,172 V${GROUND} M160,172 V${GROUND}" ${P} stroke-width="4"/><rect x="${(J.hip[0] - 14).toFixed(1)}" y="${(J.hip[1] + 7).toFixed(1)}" width="28" height="6" rx="3" style="fill:var(--pose-prop)"/><path d="M156,148 L162,174" ${P} stroke-width="6"/><circle cx="184" cy="150" r="14" ${PF}/><path d="M${J.hn[0].toFixed(1)},${J.hn[1].toFixed(1)} L172,148" ${P} stroke-width="2"/>`;
  return '';
}

// ---------- Posen-Bibliothek ----------
const ARMS_DOWN = { af: [96, 92], an: [84, 88] };
const STAND = { t: -90, h: -90, ...ARMS_DOWN, lf: [94, 90], ln: [86, 90] };
const QUAD = { t: -22, h: -12, af: [90, 90], an: [88, 90], lf: [90, 180], ln: [88, 178] };

export const POSES = {
  stand: { a: STAND, b: { ...STAND, af: [98, 94], an: [82, 86] }, period: 4000 },
  squat: { a: { ...STAND, t: -88, af: [80, 84], an: [76, 80] }, b: { t: -55, h: -60, af: [6, 0], an: [0, -4], lf: [25, 115], ln: [20, 112] }, period: 2600 },
  squatHold: { a: { t: -52, h: -70, af: [48, -55], an: [42, -60], lf: [10, 120], ln: [5, 118] }, b: { t: -56, h: -72, af: [48, -55], an: [42, -60], lf: [12, 121], ln: [7, 119] }, period: 5000 },
  hinge: { a: { ...STAND, af: [92, 90], an: [88, 90] }, b: { t: -24, h: -10, af: [92, 90], an: [88, 90], lf: [72, 100], ln: [70, 99] }, period: 3000, hold: 'bb' },
  bench: { a: { t: 180, h: 186, af: [96, -84], an: [86, -94], lf: [35, 95], ln: [30, 92] }, b: { t: 180, h: 186, af: [-94, -91], an: [-86, -89], lf: [35, 95], ln: [30, 92] }, period: 2600, hold: 'bb', props: ['bench'] },
  fly: { a: { t: 180, h: 186, af: [128, 112], an: [118, 102], lf: [35, 95], ln: [30, 92] }, b: { t: 180, h: 186, af: [-94, -91], an: [-86, -89], lf: [35, 95], ln: [30, 92] }, period: 2800, hold: 'db', props: ['bench'] },
  pushup: { a: { t: -24, h: -15, af: [92, 90], an: [90, 90], lf: [150, 150], ln: [150, 150] }, b: { t: -6, h: 0, af: [170, 30], an: [168, 32], lf: [170, 170], ln: [170, 170] }, period: 2200 },
  ohp: { a: { ...STAND, af: [115, -75], an: [105, -80] }, b: { ...STAND, t: -92, af: [-95, -92], an: [-88, -90] }, period: 2600, hold: 'bb' },
  curl: { a: { ...STAND, af: [95, 92], an: [88, 92] }, b: { ...STAND, t: -92, af: [95, -70], an: [88, -75] }, period: 2400, hold: 'db' },
  pushdown: { a: { ...STAND, t: -82, h: -80, af: [100, -30], an: [95, -35] }, b: { ...STAND, t: -82, h: -80, af: [100, 88], an: [95, 85] }, period: 2200, hold: 'handle', props: ['cableUp'] },
  raise: { a: { ...STAND, af: [92, 92], an: [88, 88] }, b: { ...STAND, af: [6, 6], an: [0, 0] }, period: 2400, hold: 'db' },
  reverseFly: { a: { t: -38, h: -20, af: [92, 92], an: [88, 88], lf: [80, 98], ln: [77, 97] }, b: { t: -38, h: -20, af: [182, 182], an: [176, 176], lf: [80, 98], ln: [77, 97] }, period: 2600, hold: 'db' },
  pullup: { a: { t: -92, h: -95, af: [-98, -88], an: [-92, -86], lf: [100, 118], ln: [95, 112] }, b: { t: -82, h: -70, af: [112, -70], an: [104, -75], lf: [86, 112], ln: [82, 108] }, period: 2800, anchor: 'hands', props: ['bar'] },
  pulldown: { a: { t: -90, h: -95, af: [-98, -88], an: [-92, -86], lf: [0, 95], ln: [-4, 92] }, b: { t: -96, h: -80, af: [112, -70], an: [104, -75], lf: [0, 95], ln: [-4, 92] }, period: 2600, props: ['seat', 'pulldown'] },
  dips: { a: { t: -90, h: -88, af: [90, 90], an: [88, 90], lf: [100, 160], ln: [95, 155] }, b: { t: -76, h: -70, af: [-150, 75], an: [-145, 80], lf: [95, 155], ln: [90, 150] }, period: 2600, anchor: 'hands', ax: 0, props: ['dipbars'] },
  bentRow: { a: { t: -30, h: -15, af: [90, 90], an: [88, 90], lf: [80, 98], ln: [76, 97] }, b: { t: -30, h: -15, af: [165, 85], an: [160, 80], lf: [80, 98], ln: [76, 97] }, period: 2400, hold: 'bb' },
  seatedRow: { a: { t: -82, h: -80, af: [2, 0], an: [-2, -2], lf: [0, 12], ln: [-4, 10] }, b: { t: -98, h: -92, af: [150, 0], an: [145, -4], lf: [0, 12], ln: [-4, 10] }, period: 2600, hold: 'handle', props: ['seat', 'cableFwd'] },
  legpress: { a: { hip: [92, 136], t: -140, h: -120, af: [118, 95], an: [112, 92], lf: [-35, 55], ln: [-38, 52] }, b: { hip: [92, 136], t: -140, h: -120, af: [118, 95], an: [112, 92], lf: [-15, -12], ln: [-18, -14] }, period: 2800, anchor: 'fixed', props: ['backrest', 'legpress'] },
  legext: { a: { hip: [96, 128], t: -96, h: -92, af: [100, 70], an: [96, 66], lf: [0, 90], ln: [-3, 88] }, b: { hip: [96, 128], t: -96, h: -92, af: [100, 70], an: [96, 66], lf: [0, 2], ln: [-3, 0] }, period: 2400, anchor: 'fixed', props: ['seat', 'backrest', 'pad'] },
  legcurl: { a: { hip: [96, 128], t: -96, h: -92, af: [100, 70], an: [96, 66], lf: [0, 6], ln: [-3, 4] }, b: { hip: [96, 128], t: -96, h: -92, af: [100, 70], an: [96, 66], lf: [0, 102], ln: [-3, 100] }, period: 2400, anchor: 'fixed', props: ['seat', 'backrest', 'pad'] },
  seated: { a: { hip: [96, 128], t: -95, h: -92, af: [80, 20], an: [76, 16], lf: [0, 90], ln: [-4, 88] }, b: { hip: [96, 128], t: -95, h: -92, af: [80, 20], an: [76, 16], lf: [0, 86], ln: [-4, 84] }, period: 2400, anchor: 'fixed', props: ['seat', 'backrest'] },
  calf: { a: { ...STAND }, b: { ...STAND, lift: 7 }, period: 1800, props: ['step'] },
  crunch: { a: { t: 180, h: 182, af: [-8, -8], an: [-12, -12], lf: [-45, 70], ln: [-50, 68] }, b: { t: 206, h: 218, af: [-18, -14], an: [-22, -18], lf: [-45, 70], ln: [-50, 68] }, period: 2200, props: ['mat'] },
  legRaise: { a: { t: -90, h: -92, af: [-98, -88], an: [-92, -86], lf: [95, 92], ln: [90, 90] }, b: { t: -96, h: -92, af: [-98, -88], an: [-92, -86], lf: [-4, 86], ln: [-8, 82] }, period: 2800, anchor: 'hands', props: ['bar'] },
  lunge: { a: { ...STAND, af: [92, 90], an: [88, 90], lf: [105, 95], ln: [75, 92] }, b: { ...STAND, t: -88, af: [92, 90], an: [88, 90], lf: [95, 175], ln: [5, 95] }, period: 2600, hold: 'db' },
  hipthrust: { a: { t: 180, h: 182, af: [6, 6], an: [4, 4], lf: [-50, 72], ln: [-55, 70] }, b: { t: 164, h: 172, af: [10, 10], an: [8, 8], lf: [-12, 85], ln: [-16, 83] }, period: 2600, props: ['block'] },
  // Mobility
  catcow: { a: { ...QUAD, bend: -11, h: 62 }, b: { ...QUAD, bend: 9, h: -48 }, period: 7000, anchor: 'kn', props: ['mat'] },
  child: { a: { t: 18, h: 0, af: [8, 4], an: [6, 2], lf: [35, 180], ln: [33, 178] }, b: { t: 15, h: -2, af: [6, 3], an: [4, 1], lf: [35, 180], ln: [33, 178] }, period: 6000, anchor: 'kn', props: ['mat'] },
  wgs: { a: { t: 12, h: 20, af: [150, 40], an: [150, 42], lf: [150, 168], ln: [12, 95] }, b: { t: 2, h: -60, af: [150, 40], an: [-82, -88], lf: [150, 168], ln: [12, 95] }, period: 5000, props: ['mat'] },
  hipflexor: { a: { t: -92, h: -90, af: [60, 25], an: [58, 22], lf: [108, 180], ln: [0, 90] }, b: { t: -84, h: -86, af: [62, 22], an: [60, 20], lf: [102, 178], ln: [-7, 93] }, period: 5000, props: ['mat'] },
  couch: { a: { t: -92, h: -90, af: [60, 25], an: [58, 22], lf: [108, -96], ln: [0, 90] }, b: { t: -86, h: -88, af: [62, 22], an: [60, 20], lf: [104, -100], ln: [-5, 92] }, period: 5000, props: ['mat', 'wallBack'] },
  pigeon: { a: { t: -82, h: -80, af: [100, 95], an: [95, 92], lf: [170, 180], ln: [15, 175] }, b: { t: 15, h: 12, af: [4, 2], an: [2, 0], lf: [170, 180], ln: [15, 175] }, period: 7000, anchor: 'kf', props: ['mat'] },
  hamstring: { a: { t: -95, h: -92, af: [40, 20], an: [35, 15], lf: [0, 0], ln: [-2, 0] }, b: { t: -28, h: -22, af: [8, 5], an: [5, 3], lf: [0, 0], ln: [-2, 0] }, period: 6000, props: ['mat'] },
  thoracic: { a: { ...QUAD, h: 30 }, b: { ...QUAD, h: -75, an: [-82, -90] }, period: 5000, anchor: 'kn', props: ['mat'] },
  armCircles: { fn: (t) => { const a = 90 - 360 * t; return { ...STAND, af: [a + 6, a + 6], an: [a, a] }; }, period: 3200 },
  cobra: { a: { t: 0, h: 5, af: [-130, 70], an: [-128, 72], lf: [180, 180], ln: [178, 180] }, b: { t: -50, h: -62, af: [140, 70], an: [138, 72], lf: [180, 180], ln: [178, 180] }, period: 6000, props: ['mat'] },
  downdog: { a: { t: 145, h: 150, af: [145, 145], an: [143, 143], lf: [60, 60], ln: [58, 58] }, b: { t: 145, h: 150, af: [145, 145], an: [143, 143], lf: [60, 60], ln: [48, 76] }, period: 3000, anchor: 'hn', props: ['mat'] },
  bridge: { a: { t: 180, h: 182, af: [6, 6], an: [4, 4], lf: [-50, 72], ln: [-55, 70] }, b: { t: 164, h: 172, af: [10, 10], an: [8, 8], lf: [-12, 85], ln: [-16, 83] }, period: 4000, props: ['mat'] },
  birddog: { a: { ...QUAD }, b: { ...QUAD, h: -5, an: [-8, -6], lf: [180, 180] }, period: 4000, anchor: 'kn', props: ['mat'] },
  butterfly: { a: { t: -92, h: -88, af: [70, 30], an: [66, 28], lf: [15, 165], ln: [12, 163] }, b: { t: -76, h: -60, af: [60, 25], an: [56, 22], lf: [15, 165], ln: [12, 163] }, period: 6000, props: ['mat'] },
  fold: { a: { ...STAND }, b: { t: 68, h: 80, af: [92, 92], an: [90, 90], lf: [80, 96], ln: [78, 95] }, period: 6000 },
  chest: { a: { ...STAND, an: [178, 180] }, b: { ...STAND, t: -86, an: [172, 176] }, period: 5000 },
  legswing: { a: { ...STAND, af: [40, 20], an: [95, 92], lf: [90, 90], ln: [50, 58] }, b: { ...STAND, af: [40, 20], an: [95, 92], lf: [90, 90], ln: [130, 138] }, period: 1800, anchor: 'ff', props: ['pole'] },
  ankle: { a: { t: -84, h: -84, af: [12, 0], an: [8, -2], lf: [105, 95], ln: [45, 78] }, b: { t: -80, h: -82, af: [10, -4], an: [6, -6], lf: [102, 95], ln: [35, 64] }, period: 3000, props: ['wallFront'] },
  hang: { a: { t: -90, h: -92, af: [-95, -90], an: [-88, -90], lf: [92, 90], ln: [88, 90] }, b: { t: -90, h: -92, af: [-95, -90], an: [-88, -90], lf: [95, 92], ln: [85, 88] }, period: 4000, anchor: 'hands', props: ['bar'] },
  kneeHug: { a: { t: 180, h: 180, af: [-40, -20], an: [-44, -24], lf: [0, 0], ln: [-128, -10] }, b: { t: 184, h: 186, af: [-48, -28], an: [-52, -32], lf: [0, 0], ln: [-138, -22] }, period: 6000, anchor: 'ff', props: ['mat'] },
  // Cardio
  run: {
    fn: (t) => {
      const p = 2 * Math.PI * t, s = Math.sin(p);
      const leg = (ph) => { const q = Math.sin(ph); const th = 90 + 34 * q; return [th, th + 18 + 52 * Math.max(0, Math.cos(ph + 0.6))]; };
      const arm = (ph) => { const q = Math.sin(ph); const ua = 90 - 38 * q; return [ua, ua - 85]; };
      return { hip: [104, 108 - 4 * Math.abs(Math.cos(p))], t: -80, h: -84, ln: leg(p), lf: leg(p + Math.PI), an: arm(p), af: arm(p + Math.PI) };
    }, period: 720, anchor: 'fixed', machine: 'treadmill',
  },
  bike: {
    fn: (t) => {
      const p = 2 * Math.PI * t, c = [118, 158], r = 14;
      const pn = [c[0] + r * Math.cos(p), c[1] + r * Math.sin(p)];
      const pf = [c[0] + r * Math.cos(p + Math.PI), c[1] + r * Math.sin(p + Math.PI)];
      return { hip: [96, 104], t: -55, h: -40, lnIK: [...pn, -1], lfIK: [...pf, -1], anIK: [160, 92, 1], afIK: [158, 94, 1], bootRel: -80 };
    }, period: 900, anchor: 'fixed', machine: 'bike',
  },
  elliptical: {
    fn: (t) => {
      const p = 2 * Math.PI * t;
      const fp = (ph) => [112 + 22 * Math.cos(ph), 172 + 7 * Math.sin(ph), -1];
      const hp = (ph) => [140 + 12 * Math.cos(ph + Math.PI), 84 + 3 * Math.sin(ph), 1];
      return { hip: [104, 100], t: -84, h: -86, lnIK: fp(p), lfIK: fp(p + Math.PI), anIK: hp(p), afIK: hp(p + Math.PI) };
    }, period: 1300, anchor: 'fixed', machine: 'elliptical',
  },
  rower: {
    fn: (t) => {
      const u = (1 - Math.cos(2 * Math.PI * t)) / 2; // 0 = Auslage, 1 = Endzug
      const hx = lerp(98, 64, u);
      const tt = lerp(-58, -112, u);
      const sh = add([hx, 158], mul(dir(tt), L.torso));
      const hand = u < 0.5 ? [lerp(150, sh[0] + 20, u * 2), lerp(142, sh[1] + 20, u * 2)] : [sh[0] + 20 - (u - 0.5) * 6, sh[1] + 20];
      return { hip: [hx, 158], t: tt, h: tt + 10, lnIK: [152, 160, -1], lfIK: [150, 162, -1], anIK: [...hand, 1], afIK: [hand[0] - 2, hand[1] + 2, 1], bootRel: -70 };
    }, period: 2400, anchor: 'fixed', machine: 'rower',
  },
};

// ---------- Frame-Berechnung ----------
function specAt(M, t) {
  if (M.fn) return M.fn(t);
  const u = (1 - Math.cos(2 * Math.PI * t)) / 2;
  const out = {};
  for (const k of new Set([...Object.keys(M.a), ...Object.keys(M.b)])) {
    const a = M.a[k] ?? M.b[k], b = M.b[k] ?? M.a[k];
    out[k] = Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], u)) : typeof a === 'number' ? lerp(a, b, u) : a;
  }
  return out;
}
const refCache = new Map();
function frameJoints(id, t) {
  const M = POSES[id] || POSES.stand;
  if (!refCache.has(id)) refCache.set(id, fk(specAt(M, 0)));
  const ref = refCache.get(id);
  const J = fk(specAt(M, t));
  if (M.anchor === 'fixed') return J;
  if (M.anchor === 'hands') return shift(J, CX - J.hn[0], BAR - J.hn[1]);
  // horizontaler Anker: Gelenk bleibt an seiner Position aus Frame 0 (Frame 0 wird mittig gesetzt)
  const a = M.anchor || 'fn';
  const refMinX = Math.min(...PTS.map(([k]) => ref[k][0])), refMaxX = Math.max(...PTS.map(([k]) => ref[k][0]));
  const refCenterShift = CX - (refMinX + refMaxX) / 2;
  const targetX = ref[a][0] + refCenterShift;
  const maxY = Math.max(...PTS.map(([k, r]) => J[k][1] + r));
  return shift(J, targetX - J[a][0], GROUND - maxY - (J.lift || 0));
}

export function poseFrame(id, t, stage = 0) {
  syncLook();
  const M = POSES[id] || POSES.stand;
  const J = frameJoints(id, t);
  return `${M.machine ? machine(M.machine, J) : ''}${props(J, M)}${figure(J, M, stage)}`;
}

// Begrenzungsrahmen über mehrere Frames (für ein ruhiges, zentriertes Bild)
const vbCache = new Map();
function viewBox(id, pad = 18) {
  if (vbCache.has(id)) return vbCache.get(id);
  const M = POSES[id] || POSES.stand;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i <= 8; i++) {
    const J = frameJoints(id, i / 8);
    for (const [k, r] of PTS) {
      x0 = Math.min(x0, J[k][0] - r); x1 = Math.max(x1, J[k][0] + r);
      y0 = Math.min(y0, J[k][1] - r - (k === 'head' ? 12 : 0)); y1 = Math.max(y1, J[k][1] + r);
    }
  }
  if (M.anchor !== 'hands') y1 = Math.max(y1, GROUND + 8);
  if (M.machine || (M.props || []).some((p) => ['bar', 'pulldown', 'cableUp'].includes(p))) { x0 = Math.min(x0, 24); x1 = Math.max(x1, 200); y0 = Math.min(y0, 6); y1 = Math.max(y1, GROUND + 10); }
  let w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
  const s = Math.max(w, h);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const vb = `${(cx - s / 2).toFixed(1)} ${(cy - s / 2).toFixed(1)} ${s.toFixed(1)} ${s.toFixed(1)}`;
  vbCache.set(id, vb);
  return vb;
}

// Statisches Bild (z. B. als Avatar)
const thumbCache = new Map();
export function poseSVG(id, { stage = 0, t = 0.5, cls = '' } = {}) {
  syncLook();
  const key = `${id}|${stage}|${t}|${cls}|${lastLook}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const s = `<svg class="pose ${cls}" viewBox="${viewBox(id)}" aria-hidden="true">${poseFrame(id, t, stage)}</svg>`;
  thumbCache.set(key, s);
  return s;
}

// Animation in einem Container
export function mountPose(host, id, { stage = 0, speed = 1, cls = '' } = {}) {
  const M = POSES[id] || POSES.stand;
  host.innerHTML = `<svg class="pose ${cls}" viewBox="${viewBox(id)}" aria-hidden="true"><g></g></svg>`;
  const g = host.querySelector('g');
  let raf = 0, last = 0, phase = 0, prev = performance.now(), sp = speed;
  const loop = (now) => {
    if (!host.isConnected) return;
    phase = (phase + ((now - prev) * sp) / M.period) % 1;
    prev = now;
    if (now - last > 30) { last = now; g.innerHTML = poseFrame(id, phase, stage); }
    raf = requestAnimationFrame(loop);
  };
  g.innerHTML = poseFrame(id, 0, stage);
  raf = requestAnimationFrame(loop);
  return { setSpeed: (s) => { sp = s; }, stop: () => cancelAnimationFrame(raf) };
}

// Übung → Pose
export function poseFor(name) {
  const n = String(name || '').toLowerCase();
  if (/laufband|joggen|laufen|run|schwimm/.test(n)) return 'run';
  if (/radfahren|fahrrad|ergometer|bike|rad\b/.test(n)) return 'bike';
  if (/crosstrainer|ellipt/.test(n)) return 'elliptical';
  if (/rudermaschine|carido|rudergerät/.test(n)) return 'rower';
  if (/mobility|dehn|stretch/.test(n)) return 'catcow';
  if (/beinheben|leg raise/.test(n)) return 'legRaise';
  if (/klimmzug|pull ?up|chin ?up/.test(n)) return 'pullup';
  if (/latzug|pulldown/.test(n)) return 'pulldown';
  if (/dip/.test(n)) return 'dips';
  if (/butterfly reverse|reverse|face ?pull|hintere/.test(n)) return 'reverseFly';
  if (/butterfly|fliegende|pec deck|cable cross/.test(n)) return 'fly';
  if (/liegestütz|push ?up|plank|burpee/.test(n)) return 'pushup';
  if (/bankdrücken|brustpresse|chest press|bench/.test(n)) return 'bench';
  if (/schulterdrücken|shoulder press|military|arnold|überkopf/.test(n)) return 'ohp';
  if (/seitheben|frontheben|lateral|front raise/.test(n)) return 'raise';
  if (/rudern|rundern|row|t-bar/.test(n)) return /sitzend|kabel|maschine|iso|low row/.test(n) ? 'seatedRow' : 'bentRow';
  if (/beinbeugen|leg curl/.test(n)) return 'legcurl';
  if (/curl|bizeps/.test(n)) return 'curl';
  if (/trizeps|pushdown|french|skull/.test(n)) return 'pushdown';
  if (/kreuzheben|deadlift|rumänisch|rückenstrecken|hyperextension/.test(n)) return 'hinge';
  if (/hip thrust|glute|bridge/.test(n)) return 'hipthrust';
  if (/beinpresse|leg press|hackenschmidt/.test(n)) return 'legpress';
  if (/beinstrecken|leg extension/.test(n)) return 'legext';
  if (/ausfallschritt|lunge|split|step ?up/.test(n)) return 'lunge';
  if (/squat|kniebeuge/.test(n)) return 'squat';
  if (/wade|calf/.test(n)) return 'calf';
  if (/crunch|sit ?up|bauch|torso/.test(n)) return 'crunch';
  if (/abduktion|adduktion|abduktor|adduktor/.test(n)) return 'seated';
  return 'stand';
}
